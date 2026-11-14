import { computed } from 'vue'
import type { BattleReportDTO, EquipSlotType, IdleGain, TrialPatrolStatusDTO, TrialDropDTO } from '@/network/protocol'
import { SKILLS, trialRewardItems } from '@/config/gameData'
import { trialDropLabel } from '@/config/uiMeta'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { battleEnvironmentAt } from '../../../shared/combatMeta.ts'
import { forgeMaterialLabel, forgeMaterials } from '../../../shared/equipmentForge.ts'
import { enemySilverReward, settlePatrolCaches } from '../../../shared/player.ts'
import {
  advancePatrol,
  collectTrialDrop,
  hasTrialPart,
  patrolEncounterCount,
  patrolEncounterRate,
  recruitTrialCompanions,
  rollTrialDrop,
  switchPatrolStage,
  TRIAL_PATROL_HOURS,
  TRIAL_REPLAY_HOURS,
  TRIAL_STAGES,
  trialFirstClearKarma,
  announceChapterOneTitle,
  CHAPTER_ONE_FINAL_STAGE,
  trialItemOf,
  trialPartId,
  trialPuzzleOutcome,
  trialStageOf,
  upgradesPatrolYield,
} from '../../../shared/trialStages.ts'
import { QUSAN_CACHE_KEY, searchQusanCache } from '../../../shared/skillMastery.ts'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import type { GameActions } from '@/network/gameActions'
import type { useCultivation } from './cultivation'
import type { useBattlePlayback } from './battlePlayback'

export function useTrial({ actions, cultivation, battle }: {
  actions: GameActions
  cultivation: Pick<ReturnType<typeof useCultivation>, 'settleMockIdle' | 'changeMockKarma'>
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'isBattlePlaying' | 'startBattlePlayback' | 'startLocalBattle'>
}) {
  const playerStore = usePlayerStore()
  const { player, currentLoadout, ownedItemIds, companionAffinity, learnedSkills } = storeToRefs(playerStore)
  const { simulateServerBattle } = playerStore
  const uiStore = useGameUiStore()
  const { appendLog, showToast } = uiStore
  const { settleMockIdle, changeMockKarma } = cultivation
  const { isBattlePlaying, startBattlePlayback, startLocalBattle } = battle

  const trial = computed(() => player.value.trial)

  function trialPatrolStatus(stageId = player.value.trial.selectedStageId): TrialPatrolStatusDTO {
    const hours = player.value.trial.stageHours[String(stageId)] ?? 0
    return {
      stageId,
      hours,
      requiredHours: TRIAL_PATROL_HOURS[stageId] ?? 0,
      encounters: patrolEncounterCount(player.value.trial, stageId),
    }
  }

  /** 本地试玩版惰性巡历：进度、章末复战与 30 分钟一次的小怪掉落 */
  function mockSettlePatrol(now = Date.now()) {
    if (!IS_MOCK_MODE) return
    const t = player.value.trial
    const encounters = advancePatrol(t, now, patrolEncounterRate(currentLoadout.value.accId))
    if (!encounters) return
    const stage = trialStageOf(t.selectedStageId)
    if (!stage) return
    forgeMaterials(player.value, encounters, encounters)
    for (let i = 0; i < encounters; i++) {
      const roll = rollTrialDrop(stage, 'PATROL')
      if (roll) logTrialDrop(awardMockTrialDrop(stage, roll, now))
    }
    const cache = settlePatrolCaches(player.value, currentLoadout.value, encounters, now)
    if (cache) logPatrolCache(cache)
    logForgeMaterials(encounters)
  }

  function logPatrolCache(reward: NonNullable<IdleGain['patrolCache']>) {
    appendLog('CULTIVATE', [{ type: 'tag', text: '秘境宝箱', tone: 'gold' },
      { type: 'text', text: ` 巡历发现 ${reward.count} 个宝箱，获得 ${reward.silver.toLocaleString()} 两纹银。` }])
  }

  function openQusanCache() {
    if (!ownedItemIds.value.includes(QUSAN_CACHE_KEY)) return
    function announce({ skillId, count }: { skillId: string; count: number }) {
      const skill = SKILLS[skillId]
      appendLog('JIANGHU', [{ type: 'tag', text: '曲三酒馆暗格', tone: 'purple' },
        { type: 'skill', id: skillId, name: `《${skill.name}》`, tier: skill.tier },
        { type: 'text', text: ` 残页 +1，现有 ${count} 张。` }])
      showToast(`取得《${skill.name}》残页 1 张。`, 'gold')
    }
    return actions.run('openCache', undefined, announce, () => {
      const result = searchQusanCache(player.value, currentLoadout.value, Date.now())
      if ('error' in result) return showToast(result.error)
      return result
    })
  }

  function logForgeMaterials(count: number) {
    appendLog('CULTIVATE', [{ type: 'tag', text: '巡历材料', tone: 'gold' },
      { type: 'text', text: ` 获得${forgeMaterialLabel(count, count)}。` }])
  }

  function awardMockTrialDrop(
    stage: NonNullable<ReturnType<typeof trialStageOf>>, roll: NonNullable<ReturnType<typeof rollTrialDrop>>, now: number,
  ) {
    if (now > player.value.lastSettleAt && upgradesPatrolYield(player.value, currentLoadout.value, roll)) settleMockIdle(now)
    return collectTrialDrop(player.value, ownedItemIds.value, stage, roll, now)
  }

  function logTrialDrop(drop: TrialDropDTO) {
    appendLog('CULTIVATE', [
      { type: 'tag', text: '巡历掉落', tone: 'gold' },
      { type: 'text', text: ` ${trialDropLabel(drop)}` },
    ])
  }

  function setPatrolStage(stageId: number) {
    return actions.run('patrol', { stageId }, (status) => {
      showToast(`已改在「第 ${String(status.stageId).padStart(2, '0')} 关」巡历`, 'info')
    }, () => {
      mockSettlePatrol()
      const stage = trialStageOf(stageId)
      if (!stage || stageId > player.value.trial.maxStageId) return
      switchPatrolStage(player.value.trial, stageId)
      showToast(`已改在「第 ${stage.code} 关」巡历`, 'info')
    })
  }

  function challengeTrialStage(stageId: number, answer?: string, retreat = false) {
    if (isBattlePlaying.value) return
    return actions.run('trial', { stageId, answer, retreat }, ({ report, firstClear, drops }) => {
      if (firstClear) showToast(`首胜奖励：${drops.length ? drops.map((drop) => drop.name).join('、') : '真气与纹银'}`, 'gold')
      startBattlePlayback(report)
    }, () => {
      mockSettlePatrol()
      const stage = trialStageOf(stageId)
      if (!stage) return
      const t = player.value.trial
      if (stageId > t.maxStageId) {
        showToast('先打过上一关，才能挑战这里。', 'danger')
        return
      }
      const required = TRIAL_PATROL_HOURS[stageId] ?? 0
      const hours = t.stageHours[String(stageId)] ?? 0
      if (hours < required) {
        const rest = required - hours
        showToast(`本关巡历还差 ${rest < 1 ? `${Math.max(1, Math.ceil(rest * 60))} 分钟` : `${rest.toFixed(1)} 小时`}。`, 'danger')
        return
      }

      const firstClear = !t.rewardedStageIds.includes(stageId)
      const drops = trialRewardItems(stage, firstClear, ownedItemIds.value, {
        rewardedStageIds: t.rewardedStageIds, answer, huangrongRecruited: !!companionAffinity.value.huangrong?.recruited,
      })
      const skill = stage.clearSkillId && !learnedSkills.value[stage.clearSkillId] ? SKILLS[stage.clearSkillId] : undefined
      const recruits = stage.clearCompanionIds?.filter((id) => !companionAffinity.value[id]?.recruited) ?? []
      const rewards = firstClear || drops.length || skill || recruits.length ? {
        qiExp: firstClear ? Math.round(stage.boss.hp * 2) : 0,
        silver: firstClear ? enemySilverReward(stage.boss.hp) : 0,
        items: [...drops, ...(skill ? [skill] : [])].map(({ id, name, tier }) => ({ id, name, tier })),
        ...(recruits.length ? { companions: recruits } : {}),
      } : undefined
      const report = simulateServerBattle({
        sceneTitle: `${stage.code} ${stage.title}`,
        mode: 'SOLO_STORY',
        trial: true,
        tryRetreat: retreat,
        player: player.value,
        loadout: currentLoadout.value,
        environment: { ...battleEnvironmentAt(player.value.currentMapId), ...stage.environment },
        enemyMain: {
          ...stage.boss,
          mp: Math.round(stage.boss.hp * 0.45),
          isBoss: true,
        },
        enemyGuards: stage.guards,
        puzzleOutcome: trialPuzzleOutcome(stage, answer),
        surviveRounds: stage.victory === 'SURVIVE_ROUNDS' ? stage.surviveRounds : undefined,
        rewards,
      })
      awardMockChapterOneTitle(stageId, report)
      startLocalBattle(report, null, firstClear || recruits.length ? () => {
        if (firstClear) {
          const renown = trialFirstClearKarma(stage)
          if (renown) changeMockKarma(renown)
          t.rewardedStageIds.push(stageId)
          mockSettlePatrol()
          t.stageHours[String(stageId)] = 0
          delete t.stageEncounters?.[String(stageId)]
          const next = Math.min(TRIAL_STAGES.length, stageId + 1)
          t.maxStageId = Math.max(t.maxStageId, next)
          switchPatrolStage(t, next)
        }
        if (recruits.length) recruitTrialCompanions(companionAffinity.value, [stageId])
      } : null)
    })
  }

  function awardMockChapterOneTitle(stageId: number, report: BattleReportDTO) {
    if (stageId !== CHAPTER_ONE_FINAL_STAGE || report.winner !== 'ALLY' || player.value.chapterOneChampion) return
    announceChapterOneTitle(report)
  }

  function replayTrialBoss(stageId: number, answer?: string, retreat = false) {
    if (isBattlePlaying.value) return
    return actions.run('replay', { stageId, answer, retreat }, ({ report, drop }) => {
      if (drop) showToast(trialDropLabel(drop), 'gold')
      startBattlePlayback(report)
    }, () => {
      mockSettlePatrol()
      const stage = trialStageOf(stageId)
      if (!stage?.replayPartIds) return
      const t = player.value.trial
      const key = String(stageId)
      if ((t.replayHours[key] ?? 0) < TRIAL_REPLAY_HOURS) {
        showToast(`在本关巡历满 ${TRIAL_REPLAY_HOURS} 小时才能再战首领。`, 'danger')
        return
      }
      const report = simulateServerBattle({
        sceneTitle: `${stage.code} ${stage.title} · 首领复战`,
        mode: 'SOLO_STORY',
        trial: true,
        tryRetreat: retreat,
        player: player.value,
        loadout: currentLoadout.value,
        environment: { ...battleEnvironmentAt(player.value.currentMapId), ...stage.environment },
        enemyMain: {
          ...stage.boss,
          mp: Math.round(stage.boss.hp * 0.45),
          isBoss: true,
        },
        enemyGuards: stage.guards,
        puzzleOutcome: trialPuzzleOutcome(stage, answer),
        surviveRounds: stage.victory === 'SURVIVE_ROUNDS' ? stage.surviveRounds : undefined,
      })
      if (report.winner === 'ALLY') {
        const drop = awardMockTrialDrop(stage, rollTrialDrop(stage, 'REPLAY')!, Date.now())
        showToast(trialDropLabel(drop), 'gold')
        t.replayHours[key] = 0
      }
      awardMockChapterOneTitle(stageId, report)
      startLocalBattle(report)
    })
  }

  function redeemTrialPart(stageId: number, slot: EquipSlotType) {
    return actions.run('redeem', { stageId, slot }, ({ name }) => {
      showToast(`兑换：${name}`, 'gold')
    }, () => {
      mockSettlePatrol()
      const stage = trialStageOf(stageId)
      if (!stage) return
      const t = player.value.trial
      const key = String(stageId)
      if ((t.marks[key] ?? 0) < 4) {
        showToast('集齐 4 枚巡历印记才能兑换。', 'danger')
        return
      }
      const item = trialItemOf(trialPartId(stage.setId, slot))
      if (!item) return
      if (hasTrialPart(ownedItemIds.value, item.id)) {
        showToast('这个部位已经拿到了。', 'danger')
        return
      }
      t.marks[key] = (t.marks[key] ?? 0) - 4
      ownedItemIds.value.push(item.id)
      showToast(`兑换：${item.name}`, 'gold')
    })
  }

  return {
    logTrialDrop,
    logForgeMaterials,
    logPatrolCache,
    mockSettlePatrol,
    trial,
    trialPatrolStatus,
    openQusanCache,
    setPatrolStage,
    challengeTrialStage,
    replayTrialBoss,
    redeemTrialPart,
  }
}
