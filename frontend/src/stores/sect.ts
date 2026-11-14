import { computed } from 'vue'
import type { GaibangBranch, RichSegment } from '@/network/protocol'
import { ITEMS, MAPS, SECTS, SKILLS, type SectConfig } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { resolveBattleLoadout } from '../../../shared/battleEffects.ts'
import { GAIBANG_BRANCHES, GAIBANG_DEBATE, gaibangDishFlag, gaibangSilverGain } from '../../../shared/gaibang.ts'
import { huashanDay } from '../../../shared/huashan.ts'
import {
  SECT_SALUTE_QI,
  sectContributionGain,
  sectExamBlockReason,
  sectPromotion,
  sectPromotionRewards,
  simulateSectTrial,
} from '../../../shared/sectProgress.ts'
import { eligibleWandererEquipment, gaibangBeggingSilver, sectEquipmentRewardIds, WANDERER_EQUIPMENT } from '../../../shared/sectEquipment.ts'
import { canReceiveSnakeRecipe } from '../../../shared/player.ts'
import { GAIBANG_FINAL_DISHES } from '@/config/questData'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import type { GameActions } from '@/network/gameActions'
import type { useCultivation } from './cultivation'
import type { useBattlePlayback } from './battlePlayback'
import type { useStory } from './story'
import type { useWorld } from './world'
import type { useCompanions } from './companions'

export function useSect({ actions, cultivation, battle, story, world, companions }: {
  actions: GameActions
  cultivation: Pick<ReturnType<typeof useCultivation>, 'settleMockIdle' | 'changeMockKarma'>
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'isBattlePlaying' | 'startBattlePlayback' | 'startLocalBattle' | 'activeBattle'>
  story: Pick<ReturnType<typeof useStory>, 'applyReward'>
  world: Pick<ReturnType<typeof useWorld>, 'worldMessages'>
  companions: Pick<ReturnType<typeof useCompanions>, 'feast'>
}) {
  const playerStore = usePlayerStore()
  const {
    currentSect,
    player,
    sectFlags,
    onlineTime,
    nowTick,
    ownedItemIds,
    currentLoadout,
    companionAffinity,
    betrayedSectIds,
    storyFlags,
    limitsEnabled,
    learnedSkills,
    collectionBonus,
  } = storeToRefs(playerStore)
  const { learnSkill, gainItem, companionOf } = playerStore
  const uiStore = useGameUiStore()
  const { showToast, appendLog } = uiStore
  const { settleMockIdle, changeMockKarma } = cultivation
  const { isBattlePlaying, startBattlePlayback, startLocalBattle, activeBattle } = battle
  const { applyReward } = story
  const { worldMessages } = world
  const { feast } = companions

  const promotion = computed(() => currentSect.value ? sectPromotion(currentSect.value, player.value, sectFlags.value) : undefined)
  const gaibangChoicePending = computed(() => promotion.value?.choosing ?? false)
  const gaibangFinalPending = computed(() => player.value.currentSectId === 'gaibang' && promotion.value?.finale)
  const canPromoteSect = computed(() => promotion.value?.available ?? false)
  const canSaluteSect = computed(() => IS_MOCK_MODE || player.value.sectSaluteDay !== huashanDay(onlineTime.value))
  const canBegToday = computed(() => player.value.gaibangBeggingDay !== huashanDay(IS_MOCK_MODE ? nowTick.value : onlineTime.value))
  const unclaimedSectEquipment = computed(() => currentSect.value
    ? sectEquipmentRewardIds(currentSect.value.id, player.value.sectRank).filter((id) => !ownedItemIds.value.includes(id)) : [])
  const unclaimedWandererEquipment = computed(() => eligibleWandererEquipment(player.value)
    && WANDERER_EQUIPMENT.items.some(({ id }) => !ownedItemIds.value.includes(id)))
  const wandererTeamDamage = computed(() => resolveBattleLoadout(currentLoadout.value, player.value).effects
    .filter((effect) => effect.kind === 'TARGET_TRAIT_DAMAGE').find((effect) => effect.sourceId === WANDERER_EQUIPMENT.id)?.percent ?? 0)
  const sectPromotionExam = computed(() => promotion.value?.exam)
  const sectPromotionBlockReason = computed(() => sectExamBlockReason(sectPromotionExam.value, player.value.stats.con,
    currentLoadout.value, (id) => !!companionAffinity.value[id]?.recruited, !gaibangFinalPending.value || gaibangFinalReady.value))

  // ==================== 门派拜师、首席请安、圆满出师与强行叛师 ====================
  function sectEligibility(sect: SectConfig) {
    if ((IS_MOCK_MODE ? betrayedSectIds.value : player.value.betrayedSectIds)?.includes(sect.id)) {
      return { ok: false, reason: '你曾叛出这个门派，不能再拜入。' }
    }
    return sect.checkReq(player.value.stats, { hasBagua: ownedItemIds.value.includes('iron_bagua'), flags: storyFlags.value })
  }

  function joinSect(sectId: string) {
    if (player.value.currentSectId) {
      showToast('你已经有师门。先出师或离开当前门派，才能拜新师父。', 'danger')
      return
    }
    const sect = SECTS.find((s) => s.id === sectId)
    if (!sect) return
    const check = sectEligibility(sect)
    if (!check.ok) {
      showToast(check.reason ?? '还不符合入门条件。', 'danger')
      return
    }

    return actions.run('sect', { action: 'join', sectId }, (result) => {
      if (result.action !== 'join') return
      recordSectEquipment(result.items ?? [])
      showToast(`恭喜拜入【${result.name}】！`, 'gold')
    }, () => {
      const hasIntro = !!sect.introFlag && storyFlags.value.includes(sect.introFlag)
      settleMockIdle(Date.now())
      player.value.currentSectId = sect.id
      player.value.sectRank = 1
      delete player.value.gaibangBranch
      player.value.sectContribution = 100 + (hasIntro ? (sect.introBonus ?? 0) : 0)
      for (const id of sect.signatureSkills[0] ?? []) learnSkill(id)
      claimSectEquipment()

      appendLog('JIANGHU', [
        { type: 'tag', text: '奉茶拜师', tone: 'gold' },
        { type: 'text', text: ` 你向师父奉茶，拜入「${sect.name}」，成了「${sect.ranks[0]}」，也学到了本门入门武功。` },
        ...(hasIntro ? [{ type: 'text' as const, text: `（凭引荐信入门，起始门派贡献 +${sect.introBonus}）` }] : []),
      ])
      showToast(`恭喜拜入【${sect.name}】！`, 'gold')
    })
  }

  function saluteChiefPlayer(refresh?: () => void) {
    const sect = currentSect.value
    if (!sect || !canSaluteSect.value) return
    const record = (who: string, qiExp: number, contribution: number, chiefQi = 0) => {
      appendLog('JIANGHU', [{ type: 'tag', text: '同门共勉', tone: 'jade' },
        { type: 'text', text: ` 向${who}抱拳问好。真气 +${qiExp.toLocaleString()}，门派贡献 +${contribution}。${chiefQi ? `首席真气 +${chiefQi.toLocaleString()}。` : ''}` }])
      showToast(`真气 +${qiExp.toLocaleString()}，门派贡献 +${contribution}`, 'gold')
    }
    return actions.run('sect', { action: 'salute', sectId: sect.id }, (result) => {
      if (result.action === 'salute') {
        const { chief, qiExp, sectContrib } = result
        record(chief ? `首席弟子「${chief.nickname}」` : '传功长老', qiExp, sectContrib, chief?.qiExp)
        refresh?.()
      }
    }, () => {
      const gained = sectContributionGain(60, currentLoadout.value)
      player.value.qiExp += SECT_SALUTE_QI
      player.value.sectContribution += gained
      record(`首席弟子「${sect.chiefPlayerName}」`, SECT_SALUTE_QI, gained)
    })
  }

  function recordSectEquipment(ids: readonly string[]) {
    if (!ids.length) return
    appendLog('JIANGHU', [{ type: 'tag', text: '师门赠装', tone: 'gold' }, ...ids.flatMap((id): RichSegment[] => {
      const item = ITEMS[id]
      return item ? [{ type: 'text', text: ' ' }, { type: 'item', id, name: `【${item.name}】`, tier: item.tier }] : []
    })])
  }

  const mayReceiveSnakeRecipe = computed(() => !player.value.snakeFeedingRecipe && canReceiveSnakeRecipe(player.value, currentLoadout.value))

  function claimSnakeRecipe() {
    if (!mayReceiveSnakeRecipe.value) return
    const announce = () => {
      appendLog('JIANGHU', [{ type: 'tag', text: '白驼饲喂秘方', tone: 'purple' },
        { type: 'text', text: ' 副总管送来一份蛇药饲喂方。从此炼制蝮蛇见血膏少用 1 株蛇涎草。' }])
      showToast('习得白驼蛇药饲喂方', 'gold')
    }
    return actions.run('sect', { action: 'snake-recipe', sectId: 'baituo' }, announce, () => {
      player.value.snakeFeedingRecipe = true
      announce()
    })
  }

  function claimSectEquipment() {
    const sect = currentSect.value
    const ids = unclaimedSectEquipment.value
    if (!sect || !ids.length) return
    return actions.run('sect', { action: 'claim-gear', sectId: sect.id }, (result) => {
      if (result.action === 'claim-gear') recordSectEquipment(result.items)
    }, () => {
      const now = Date.now()
      if (limitsEnabled.value && now > player.value.lastSettleAt) settleMockIdle(now)
      for (const id of ids) gainItem(id)
      recordSectEquipment(ids)
    })
  }

  function claimWandererEquipment() {
    if (!unclaimedWandererEquipment.value || player.value.currentMapId !== WANDERER_EQUIPMENT.mapId) return
    return actions.run('sect', { action: 'wanderer-gear' }, (result) => {
      if (result.action === 'wanderer-gear' && result.items.length) showToast(`获得【${WANDERER_EQUIPMENT.name}】`, 'gold')
    }, () => {
      for (const { id } of WANDERER_EQUIPMENT.items) {
        if (!ownedItemIds.value.includes(id)) gainItem(id)
      }
      showToast(`获得【${WANDERER_EQUIPMENT.name}】`, 'gold')
    })
  }

  function begForAlms() {
    if (currentSect.value?.id !== 'gaibang' || player.value.currentMapId !== 'jiaxing_suburb' ||
      player.value.gaibangBeggingDay === huashanDay(IS_MOCK_MODE ? Date.now() : onlineTime.value)) return
    const record = (silver: number) => showToast(`化缘所得纹银 +${silver.toLocaleString()}`, 'gold')
    return actions.run('sect', { action: 'beg', sectId: 'gaibang' }, (result) => {
      if (result.action === 'beg') record(result.silver)
    }, () => {
      const silver = gaibangSilverGain(player.value, gaibangBeggingSilver(currentLoadout.value))
      player.value.gaibangBeggingDay = huashanDay(Date.now())
      player.value.silver += silver
      record(silver)
    })
  }

  function settleSectPromotion(sect: SectConfig, newRank: number) {
    const advanced = newRank > player.value.sectRank
    player.value.sectRank = newRank
    const grants: RichSegment[] = []
    for (const skillId of sect.signatureSkills[newRank - 1] ?? []) {
      const sk = SKILLS[skillId]
      const had = (learnedSkills.value[skillId] ?? 0) > 0
      learnSkill(skillId)
      if (sk && !had) grants.push({ type: 'text', text: '，获传绝学' }, { type: 'skill', id: skillId, name: `《${sk.name}》`, tier: sk.tier })
    }
    const itemId = sect.signatureItems?.[newRank]
    if (itemId && ITEMS[itemId] && !ownedItemIds.value.includes(itemId)) {
      const item = ITEMS[itemId]
      gainItem(itemId)
      grants.push({ type: 'text', text: '，赐下' }, { type: 'item', id: itemId, name: `【${item.name}】`, tier: item.tier, isTrueUnique: item.isTrueUnique })
    }
    claimSectEquipment()
    appendLog('JIANGHU', [
      { type: 'tag', text: advanced ? '辈分晋升' : '门派传承', tone: 'gold' },
      { type: 'text', text: advanced
        ? ` 考校通过！你晋升为【${sect.name}·${sect.ranks[newRank - 1]}】`
        : ` 你通过了${sect.name}的「${sect.promotionExams?.[newRank]?.title}」` },
      ...grants,
      { type: 'text', text: '！' },
    ])
  }

  function setGaibangBranch(branch: GaibangBranch) {
    player.value.gaibangBranch = branch
    appendLog('JIANGHU', [
      { type: 'tag', text: '轩辕台立威', tone: 'gold' },
      { type: 'text', text: ` 你已加入丐帮${GAIBANG_BRANCHES[branch].name}。` },
    ])
  }

  function answerGaibangDebate(index: number) {
    const sect = currentSect.value
    if (!sect || !gaibangChoicePending.value || isBattlePlaying.value) return
    const answer = GAIBANG_DEBATE.answers[index]
    if (!answer) return
    const incorrect = () => {
      appendLog('JIANGHU', [{ type: 'tag', text: '轩辕台论辩', tone: 'red' }, { type: 'text', text: ' 众人争论不休。彭长老请你再想想，该凭什么服众。' }])
      showToast('帮众尚未信服，可重新作答。', 'danger')
    }
    const rank = player.value.sectRank
    return actions.run('sect', { action: 'debate', sectId: sect.id, expectedRank: rank, answer: index }, (result) => {
      if (result.action !== 'debate') return
      if (!result.correct) return incorrect()
      const contribution = result.rewards?.sectContrib
      recordSectEquipment((result.rewards?.items ?? []).map(({ id }) => id).filter((id) => !!ITEMS[id]))
      appendLog('JIANGHU', [{ type: 'tag', text: '以理服众', tone: 'gold' }, { type: 'text', text: ` 你已加入丐帮净衣派${contribution ? `，门派贡献 +${contribution}` : ''}。` }])
      showToast('你已加入丐帮净衣派', 'gold')
    }, () => {
      if (!answer.correct) return incorrect()
      const rewards = rank === 2 ? sectPromotionRewards(rank, currentLoadout.value) : undefined
      if (rewards) player.value.sectContribution += rewards.sectContrib
      applyReward({ tag: '以理服众', tone: 'gold', text: '你当众说清帮规，两派帮众都点头称是。', qiExp: rewards?.qiExp, silver: rewards?.silver }, 'JIANGHU')
      if (rank === 2) settleSectPromotion(sect, 3)
      setGaibangBranch('JINGYI')
    })
  }

  function prepareGaibangDish(dishId: string) {
    if (!gaibangFinalPending.value || isBattlePlaying.value) return
    const dish = gaibangDishes.value.find((candidate) => candidate.id === dishId)
    if (!dish || dish.prepared) return
    if (player.value.currentMapId !== dish.mapId) {
      showToast(`请前往【${dish.mapName}】备办${dish.name}。`, 'info')
      return
    }
    const record = (name: string, silver: number) => appendLog('JIANGHU', [
      { type: 'tag', text: '百味戏老毒物', tone: 'gold' },
      { type: 'text', text: ` 你在${dish.mapName}花 ${silver.toLocaleString()} 两纹银备好【${name}】。` },
    ])
    return actions.run('sect', {
      action: 'prepare', sectId: 'gaibang', expectedRank: player.value.sectRank, dishId,
    }, (result) => { if (result.action === 'prepare') record(result.name, result.silver) }, () => {
      if (player.value.silver < dish.silver) {
        showToast(`备办${dish.name}需 ${dish.silver} 两纹银。`, 'danger')
        return
      }
      player.value.silver -= dish.silver
      storyFlags.value.push(gaibangDishFlag(dish.id))
      record(dish.name, dish.silver)
    })
  }

  function challengeSectPromotion(branch?: 'WUYI') {
    const sect = currentSect.value
    const rank = player.value.sectRank
    const target = promotion.value
    if (!sect || !target || isBattlePlaying.value) return
    const { choosing, available, finale, newRank, exam } = target
    if (choosing && !branch) {
      showToast('先到轩辕台完成污净抉择。', 'info')
      return
    }
    if (branch && !choosing) return
    if (!available) {
      showToast('你已经升到门派的最高一阶。', 'gold')
      return
    }
    if (sectPromotionBlockReason.value) {
      showToast(sectPromotionBlockReason.value, 'info')
      return
    }
    return actions.run('sect', { action: 'trial', sectId: sect.id, expectedRank: rank, branch }, (result) => {
      if (result.action === 'trial') startBattlePlayback(result.report)
    }, () => {
      const report = simulateSectTrial(sect, target, { player: player.value, loadout: currentLoadout.value, learnedSkills: learnedSkills.value,
        bonus: collectionBonus.value, companionOf, ownedItemIds: ownedItemIds.value }, Date.now())
      startLocalBattle(report, null, () => {
        if (currentSect.value?.id !== sect.id || player.value.sectRank !== rank) return
        if (newRank > rank || finale) settleSectPromotion(sect, newRank)
        if (exam?.completionFlag && !storyFlags.value.includes(exam.completionFlag)) storyFlags.value.push(exam.completionFlag)
        if (branch) setGaibangBranch(branch)
      })
    })
  }

  function leaveSect(mode: 'GRADUATE' | 'BETRAY') {
    if (!currentSect.value || (isBattlePlaying.value && activeBattle.value?.mode === 'SECT_TRIAL')) return
    const oldSect = currentSect.value
    return actions.run('sect', { action: mode === 'GRADUATE' ? 'graduate' : 'betray', sectId: oldSect.id }, (result) => {
      if (result.action === 'graduate') showToast(`已从「${result.name}」出师，学过的武功都还在。`, 'gold')
      else if (result.action === 'betray') showToast(`已叛出「${result.name}」，侠义减少 ${Math.abs(result.karmaDelta ?? 120)} 点，追杀令持续 48 小时。`, 'danger')
    }, () => {
      if (mode === 'GRADUATE') {
        if (player.value.sectRank < 4 && oldSect.id !== 'jiangnan_wuguan') {
          showToast('门派升到第 4 阶才能出师。', 'danger')
          return
        }
        settleMockIdle(Date.now())
        const graduated = player.value.graduatedSectIds ??= []
        if (!graduated.includes(oldSect.id)) graduated.push(oldSect.id)
        player.value.currentSectId = null
        player.value.sectRank = 1
        player.value.sectContribution = 0
        player.value.isGuardingLibrary = false
        delete player.value.gaibangBranch
        appendLog('JIANGHU', [
          { type: 'tag', text: '圆满出师', tone: 'gold' },
          { type: 'text', text: ` 你拜别「${oldSect.name}」，保留了学过的武功，也可以再拜别的门派。` },
        ])
        showToast(`已从「${oldSect.name}」出师，学过的武功都还在。`, 'gold')
        return
      }

      // 强行叛师：保留偷学武学，但触发全服玩家悬赏追杀令！（含叛全真入古墓原著彩蛋）
      const isQuanzhenToGumu = oldSect.id === 'quanzhen'
      settleMockIdle(Date.now())
      betrayedSectIds.value.push(oldSect.id)
      player.value.betrayedSectIds = betrayedSectIds.value
      player.value.currentSectId = null
      player.value.sectRank = 1
      player.value.sectContribution = 0
      player.value.isGuardingLibrary = false
      delete player.value.gaibangBranch
      player.value.bountyUntil = Date.now() + 1000 * 3600 * 48
      const lostKarma = Math.abs(changeMockKarma(-120))

      worldMessages.value.unshift({
        id: `bounty_${Date.now()}`,
        channel: 'RUMOR',
        sender: '清理门户悬赏令',
        sect: oldSect.name,
        content: `⚠️逆徒【${player.value.nickname}】私携秘籍叛出${oldSect.name}！全服侠士可在任意地图将其截杀，赏纹银十万两！`,
        time: '刚刚',
      })

      appendLog('JIANGHU', [
        { type: 'tag', text: '破门叛师', tone: 'red' },
        { type: 'text', text: ` 你叛出了「${oldSect.name}」，侠义减少 ${lostKarma} 点。江湖追杀令将持续 48 小时。` },
        ...(isQuanzhenToGumu
          ? [{ type: 'tag' as const, text: '叛出全真 · 身法 +5', tone: 'purple' as const }]
          : []),
      ])
      if (isQuanzhenToGumu) player.value.stats.agi += 5
      showToast(`已叛出「${oldSect.name}」，你将被通缉 48 小时。`, 'danger')
    })
  }
  const gaibangDishes = computed(() => GAIBANG_FINAL_DISHES.map((dish) => ({
    ...dish,
    mapName: MAPS.find((map) => map.id === dish.mapId)?.name ?? dish.mapId,
    prepared: (IS_MOCK_MODE && feast.value.cooked.includes(dish.id)) || sectFlags.value.includes(gaibangDishFlag(dish.id)),
  })))
  const gaibangFinalReady = computed(() => gaibangDishes.value.every((dish) => dish.prepared))

  return {
    gaibangChoicePending,
    canPromoteSect,
    canSaluteSect,
    canBegToday,
    unclaimedSectEquipment,
    unclaimedWandererEquipment,
    wandererTeamDamage,
    gaibangFinalPending,
    gaibangFinalReady,
    gaibangDishes,
    sectPromotionExam,
    sectPromotionBlockReason,
    joinSect,
    sectEligibility,
    saluteChiefPlayer,
    claimSectEquipment,
    mayReceiveSnakeRecipe,
    claimSnakeRecipe,
    claimWandererEquipment,
    begForAlms,
    challengeSectPromotion,
    answerGaibangDebate,
    prepareGaibangDish,
    leaveSect,
  }
}
