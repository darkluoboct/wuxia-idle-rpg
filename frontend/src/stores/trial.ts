import { computed } from 'vue'
import type { BattleReportDTO, EquipSlotType, IdleGain, TrialPatrolStatusDTO, TrialDropDTO } from '@/network/protocol'
import { SKILLS, trialRewardItems } from '@/config/gameData'
import { trialDropLabel } from '@/config/uiMeta'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { battleEnvironmentAt } from '../../../shared/combatMeta.ts'
import { forgeMaterialLabel, forgeMaterials } from '../../../shared/equipmentForge.ts'
import { settlePatrolCaches, trialFirstClearSilver } from '../../../shared/player.ts'
import { patrolCacheIngot } from '../../../shared/economy.ts'
import { trialGateBlock, trialGateText } from '../../../shared/stageScripts.ts'
import {
  advancePatrol,
  collectTrialDrop,
  hasTrialPart,
  patrolBattleCount,
  patrolEncounterCount,
  patrolEncounterRate,
  recruitTrialCompanions,
  rollPatrolDrops,
  rollTrialDrop,
  switchPatrolStage,
  TRIAL_PATROL_HOURS,
  TRIAL_REPLAY_HOURS,
  TRIAL_STAGES,
  trialFirstClearKarma,
  trialBossMp,
  trialFirstClearQi,
  trialRewardHp,
  announceChapterOneTitle,
  CHAPTER_ONE_FINAL_STAGE,
  trialItemOf,
  trialPartId,
  trialPuzzleOutcome,
  trialStageOf,
  upgradesPatrolYield,
  type TrialRoll,
} from '../../../shared/trialStages.ts'
import { QUSAN_CACHE_KEY, searchQusanCache } from '../../../shared/skillMastery.ts'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import type { GameActions } from '@/network/gameActions'
import type { useCultivation } from './cultivation'
import type { BattleStaging, useBattlePlayback } from './battlePlayback'

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
      battles: patrolBattleCount(player.value.trial, stageId),
    }
  }

  /** 本地试玩版惰性巡历：进度、章末复战，每分钟一场的掉落与每 30 场一场精英的锻材（docs/25）；
   *  返回与联机收功同样的巡历字段，供江湖邸报汇总 */
  function mockSettlePatrol(now = Date.now()): Pick<IdleGain, 'drops' | 'patrolBattles' | 'forgeMaterials' | 'patrolCache'> {
    if (!IS_MOCK_MODE || player.value.idleOff) return {}
    const t = player.value.trial
    const run = advancePatrol(t, now, patrolEncounterRate(currentLoadout.value.accId))
    const stage = trialStageOf(t.selectedStageId)
    if (!run?.battles || !stage) return {}
    if (run.elites) forgeMaterials(player.value, run.elites, run.elites)
    const drops: TrialDropDTO[] = []
    for (const roll of rollPatrolDrops(stage, run)) {
      const drop = awardMockTrialDrop(stage, roll, now)
      drops.push(drop)
      logTrialDrop(drop)
    }
    const cache = settlePatrolCaches(player.value, currentLoadout.value, run.battles, now)
    if (cache) {
      const ingot = patrolCacheIngot(player.value, cache.count, now)
      if (ingot) cache.ingot = ingot
      logPatrolCache(cache)
    }
    logPatrolBattles(run.battles, run.elites)
    return { drops, patrolBattles: run.battles, ...(run.elites ? { forgeMaterials: run.elites } : {}), ...(cache ? { patrolCache: cache } : {}) }
  }

  function logPatrolCache(reward: NonNullable<IdleGain['patrolCache']>) {
    appendLog('CULTIVATE', [{ type: 'tag', text: '秘境宝箱', tone: 'gold' },
      { type: 'text', text: ` 巡历发现 ${reward.count} 个宝箱，获得 ${reward.silver.toLocaleString()} 两纹银${reward.ingot ? `、${reward.ingot} 元宝` : ''}。` }])
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

  function logPatrolBattles(battles: number, elites = 0) {
    appendLog('CULTIVATE', [{ type: 'tag', text: '巡历', tone: 'gold' },
      { type: 'text', text: ` 打了 ${battles} 场${elites ? `，其中精英 ${elites} 场，获得${forgeMaterialLabel(elites, elites)}` : ''}。` }])
  }

  function awardMockTrialDrop(stage: NonNullable<ReturnType<typeof trialStageOf>>, roll: TrialRoll, now: number) {
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

  function challengeTrialStage(stageId: number, answer?: string, retreat = false, staging?: BattleStaging) {
    if (isBattlePlaying.value) return
    return actions.run('trial', { stageId, answer, retreat }, ({ report, firstClear, drops }) => {
      if (firstClear) showToast(`首胜奖励：${drops.length ? drops.map((drop) => drop.name).join('、') : '真气与纹银'}`, 'gold')
      startBattlePlayback(report, staging)
    }, () => {
      mockSettlePatrol()
      const stage = trialStageOf(stageId)
      if (!stage) return
      const t = player.value.trial
      if (stageId > t.maxStageId) {
        showToast('先打过上一关，才能挑战这里。', 'danger')
        return
      }
      // 新角色按剧情时间线走：历练首战先打完时间线上紧挨着的那个主线节点（联机由服务端拦，规则相同）
      const gate = trialGateBlock(stage, player.value)
      if (gate) {
        showToast(trialGateText(gate), 'info')
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
        qiExp: firstClear ? trialFirstClearQi(stage) : 0,
        silver: firstClear ? trialFirstClearSilver(trialRewardHp(stage), player.value) : 0,
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
          mp: trialBossMp(stage),
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
          delete t.stageBattles?.[String(stageId)]
          const next = Math.min(TRIAL_STAGES.length, stageId + 1)
          t.maxStageId = Math.max(t.maxStageId, next)
          switchPatrolStage(t, next)
        }
        if (recruits.length) recruitTrialCompanions(companionAffinity.value, [stageId])
      } : null, staging)
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
          mp: trialBossMp(stage),
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
    logPatrolBattles,
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
