import type { CultivationResult, IdleGain, LoadoutPresetDTO, TrialDropDTO } from '@/network/protocol'
import { ACUPOINTS, MEDICINES, getMapHerbs, COMPANIONS } from '@/config/gameData'
import { gaibangSilverGain } from '../../../shared/gaibang.ts'
import { cultivatePlayer, cultivationRate, cultivationRates, idleQiNumerator, karmaAfterEvent } from '../../../shared/player.ts'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import type { GameActions } from '@/network/gameActions'
import { useGameUiStore } from './gameUiStore'
import type { useCompanions } from './companions'
import { type MainTab, type ToastTone } from './gameUiStore'

export function useCultivation({ actions, selectTab, logTrialDrop, logForgeMaterials, logPatrolCache, mockSettlePatrol, companions }: {
  actions: GameActions
  selectTab: (tab: MainTab) => void
  logTrialDrop: (drop: TrialDropDTO) => void
  logForgeMaterials: (count: number) => void
  logPatrolCache: (reward: NonNullable<IdleGain['patrolCache']>) => void
  mockSettlePatrol: (now?: number) => void
  companions: Pick<ReturnType<typeof useCompanions>, 'onOfflineSettled'>
}) {
  const playerStore = usePlayerStore()
  const {
    onlineState,
    player,
    effectiveQiPerHour,
    mockIdleRates,
    herbInventory,
    collectionBonus,
    currentLoadout,
    currentRealm,
    pillInventory,
  } = storeToRefs(playerStore)
  const uiStore = useGameUiStore()
  const { showToast, appendLog } = uiStore
  const { onOfflineSettled } = companions

  function getIdleRewards(now = Date.now()) {
    const live = onlineState.value
    if (live) {
      const { snapshot, receivedAt } = live
      const current = snapshot.serverTime + Math.max(0, now - receivedAt)
      const amountAt = (time: number, rate: number) => idleQiNumerator(snapshot.player.lastSettleAt, time, rate, snapshot.coCultivation)
      const gained = (rate: number, scale: bigint, divisor: bigint) => Number(
        amountAt(current, rate) * scale / divisor - amountAt(snapshot.serverTime, rate) * scale / divisor,
      )
      return {
        gainedQi: snapshot.idlePreview.pendingQi + gained(snapshot.soloQiPerHour, 1n, 3_600_000n),
        gainedSilver: snapshot.idlePreview.pendingSilver + gained(snapshot.soloSilverBasis ?? snapshot.soloQiPerHour, 28n, 360_000_000n),
      }
    }
    const elapsedSec = Math.max(60, Math.floor((now - player.value.lastSettleAt) / 1000))
    const cappedHours = Math.min(12, elapsedSec / 3600)
    const gainedQi = Math.max(480, Math.round(effectiveQiPerHour.value * cappedHours))
    const gainedSilver = gaibangSilverGain(player.value, Math.max(150, Math.round(Math.round(mockIdleRates.value.silverBasis * cappedHours) * 0.28)))
    return { gainedQi, gainedSilver }
  }

  // 1. 惰性离线挂机收益结算（对应后端 POST /api/v1/cultivate/settle）
  function settleOfflineQi() {
    return actions.run('settle', undefined, (result) => {
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
      else if (!result.drops?.length && !result.forgeMaterials && !result.patrolCache) showToast('还没攒够可领的收益')
      for (const drop of result.drops ?? []) logTrialDrop(drop)
      if (result.forgeMaterials) logForgeMaterials(result.forgeMaterials)
      if (result.patrolCache) logPatrolCache(result.patrolCache)
      for (const [id, gain] of Object.entries(result.reunionClues ?? {})) {
        appendLog('ADVENTURE', [
          { type: 'tag', text: '闭关打听', tone: 'jade' },
          { type: 'text', text: ` 得到${COMPANIONS[id].name}的寻访线索 +${gain}` },
        ])
      }
    }, () => {
      const now = Date.now()
      settleMockIdle(now, true)
      mockSettlePatrol(now)
    })
  }

  function settleMockIdle(now: number, claim = false) {
    const elapsedSec = Math.max(0, Math.floor((now - player.value.lastSettleAt) / 1000))
    const hours = Math.min(12, elapsedSec / 3600)
    const { gainedQi, gainedSilver } = claim ? getIdleRewards(now) : {
      gainedQi: Math.round(mockIdleRates.value.qi * hours),
      gainedSilver: gaibangSilverGain(player.value, Math.round(Math.round(mockIdleRates.value.silverBasis * hours) * 0.28)),
    }
    player.value.qiExp += gainedQi
    player.value.silver += gainedSilver
    player.value.lastSettleAt = now
    onOfflineSettled(elapsedSec)

    // 巡历挂机顺路采获当前地图药材
    const mapHerbs = claim ? getMapHerbs(player.value.currentMapId) : []
    const gainedHerbList: string[] = []
    if (mapHerbs.length > 0) {
      const dropCount = Math.floor(Math.random() * 2) + 1
      for (let i = 0; i < dropCount; i++) {
        const h = mapHerbs[Math.floor(Math.random() * mapHerbs.length)]
        herbInventory.value[h.id] = (herbInventory.value[h.id] ?? 0) + 1
        gainedHerbList.push(h.name)
      }
    }
    if (gainedQi || gainedSilver || gainedHerbList.length) showIdleGain({ gainedQi, gainedSilver }, gainedHerbList)
  }

  function settleMockBeforeLoadoutChange(next: LoadoutPresetDTO) {
    const rate = cultivationRates(player.value, next, collectionBonus.value.idleQiPct)
    if (rate.qi !== mockIdleRates.value.qi || rate.silverBasis !== mockIdleRates.value.silverBasis) {
      const now = Date.now()
      if (now > player.value.lastSettleAt) settleMockIdle(now)
    }
  }

  function changeMockKarma(delta: number, now = Date.now()) {
    const p = player.value
    const prior = p.stats.karma
    const preset = currentLoadout.value
    const karma = karmaAfterEvent(prior, delta, preset.headId)
    if (now > p.lastSettleAt && cultivationRate({ ...p, stats: { ...p.stats, karma } }, preset, collectionBonus.value.idleQiPct) !== mockIdleRates.value.qi) {
      settleMockIdle(now)
    }
    p.stats.karma = karma
    return karma - prior
  }

  function showIdleGain({ gainedQi, gainedSilver }: IdleGain, herbs: string[] = []) {
    const herbNote = herbs.length ? `，巡历采获【${herbs.join('、')}】` : ''
    appendLog('CULTIVATE', [
      { type: 'tag', text: '修行收益', tone: 'jade' },
      { type: 'text', text: ` 领到 ${gainedQi.toLocaleString()} 真气和 ${gainedSilver.toLocaleString()} 两纹银${herbNote}。` },
    ])
    showToast(`已领 ${gainedQi.toLocaleString()} 真气、${gainedSilver.toLocaleString()} 纹银${herbs.length ? '及草药' : ''}`, 'gold')
  }

  // 修行操作在试玩和联机使用同一套经脉与丹药规则。
  function progressCultivation(input: Parameters<typeof cultivatePlayer>[3]) {
    function announce(result: CultivationResult) {
      let message: string
      let tone: ToastTone = 'gold'
      if (result.action === 'level') message = `升到了 ${result.level} 级。`
      else if (result.action === 'break') {
        if (result.success) message = `突破成功，已踏入「${currentRealm.value.name}」。`
        else {
          message = result.protectedByPill
            ? `冰魄护心丹护住心脉，下次突破保底 +${result.pityAdded} 个百分点。`
            : `突破受阻，气血微沸 15 分钟。下次突破保底 +${result.pityAdded} 个百分点。`
          tone = result.protectedByPill ? 'info' : 'danger'
        }
      } else {
        const points = result.opened.map((id) => ACUPOINTS.find((point) => point.id === id)?.name ?? id).join('、')
        const spent = result.pillId ? `服下「${MEDICINES[result.pillId].name}」` : `消耗 ${result.spentQi.toLocaleString()} 真气`
        const bonus = result.pillId === 'shaolin_xiaohuan_dan' ? '，根骨 +6，内力上限 +300'
          : result.pillId === 'jiuzhuan_tongqiao_dan' ? '，六维各 +12' : ''
        message = `${spent}，贯通${points}${bonus}。`
      }
      appendLog('CULTIVATE', [{ type: 'text', text: message }])
      showToast(message, tone)
    }
    return actions.run('cultivate', {
      ...input, expectedTier: player.value.realmTier,
    }, announce, () => {
      const now = Date.now()
      const result = cultivatePlayer(player.value, currentLoadout.value, pillInventory.value, input, now, Math.random, () => {
        if (now > player.value.lastSettleAt) settleMockIdle(now)
      })
      if ('error' in result) showToast(result.error, 'danger')
      else return result
    })
  }

  function upgradeLevel() {
    return progressCultivation({ action: 'level' })
  }

  function pierceAcupoint(pointId: string, pillId?: string) {
    return progressCultivation({ action: 'pierce', pointId, usePill: pillId === 'tongmai_dan' })
  }

  function useAcupointPill(pillId: string) {
    if (pillId === 'pozhang_dan' || pillId === 'bingpo_huxin_dan') {
      selectTab('CULTIVATE')
      return
    }
    return progressCultivation({ action: 'pill', pillId })
  }

  function attemptBreakthrough(usePill: boolean) {
    return progressCultivation({ action: 'break', usePill })
  }

  return {
    changeMockKarma,
    settleMockIdle,
    showIdleGain,
    settleMockBeforeLoadoutChange,
    settleOfflineQi,
    pierceAcupoint,
    useAcupointPill,
    getIdleRewards,
    upgradeLevel,
    attemptBreakthrough,
  }
}
