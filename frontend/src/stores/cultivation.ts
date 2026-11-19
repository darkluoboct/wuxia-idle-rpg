import type { CultivationResult, IdleGain, LoadoutPresetDTO, RateBoostKind, TrialDropDTO } from '@/network/protocol'
import { ACUPOINTS, MEDICINES, getMapHerbs, COMPANIONS } from '@/config/gameData'
import { gaibangSilverGain } from '../../../shared/gaibang.ts'
import { cultivatePlayer, cultivationRate, cultivationRates, idleQiNumerator, karmaAfterEvent } from '../../../shared/player.ts'
import { IDLE_CAP_MS } from '../../../shared/trialStages.ts'

/** 离开超过一个时辰（两小时）才弹江湖邸报；不在场时有事发生则随时弹 */
const AWAY_REPORT_MS = 2 * 3_600_000
import { shallowRef, watch } from 'vue'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import type { GameActions } from '@/network/gameActions'
import { useGameUiStore } from './gameUiStore'
import type { useCompanions } from './companions'
import { type MainTab, type ToastTone } from './gameUiStore'

export function useCultivation({
  actions, selectTab, logTrialDrop, logPatrolBattles, logPatrolCache, mockSettlePatrol, announceXiangyangAward, claimLocalXiangyang, companions,
}: {
  actions: GameActions
  selectTab: (tab: MainTab) => void
  logTrialDrop: (drop: TrialDropDTO) => void
  logPatrolBattles: (battles: number, elites?: number) => void
  logPatrolCache: (reward: NonNullable<IdleGain['patrolCache']>) => void
  mockSettlePatrol: (now?: number) => Pick<IdleGain, 'drops' | 'patrolBattles' | 'forgeMaterials' | 'patrolCache'>
  /** 收功顺带领到的襄阳封赏 */
  announceXiangyangAward: (award: NonNullable<IdleGain['xiangyang']>[number]) => void
  claimLocalXiangyang: (now: number, since: number) => { awards: NonNullable<IdleGain['xiangyang']>; xiangyang?: NonNullable<IdleGain['away']>['xiangyang'] }
  companions: Pick<ReturnType<typeof useCompanions>, 'onOfflineSettled' | 'logFeastIngredient'>
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
    worldTime,
  } = storeToRefs(playerStore)
  const uiStore = useGameUiStore()
  const { showToast, appendLog } = uiStore
  const { onOfflineSettled, logFeastIngredient } = companions
  const { markDaily } = playerStore

  function getIdleRewards(now = Date.now()) {
    const live = onlineState.value
    if (live) {
      const { snapshot, receivedAt } = live
      const current = snapshot.serverTime + Math.max(0, now - receivedAt)
      const boosts = (kind: RateBoostKind) => (snapshot.boosts ?? []).filter((boost) => boost.kind === kind)
      const amountAt = (time: number, rate: number, kind: RateBoostKind) =>
        idleQiNumerator(snapshot.player.lastSettleAt, time, rate, snapshot.coCultivation, boosts(kind))
      const gained = (rate: number, kind: RateBoostKind, scale: bigint, divisor: bigint) => Number(
        amountAt(current, rate, kind) * scale / divisor - amountAt(snapshot.serverTime, rate, kind) * scale / divisor,
      )
      return {
        gainedQi: snapshot.idlePreview.pendingQi + gained(snapshot.soloQiPerHour, 'QI', 1n, 3_600_000n),
        gainedSilver: snapshot.idlePreview.pendingSilver + gained(snapshot.soloSilverBasis ?? snapshot.soloQiPerHour, 'SILVER', 28n, 360_000_000n),
      }
    }
    const elapsedSec = Math.max(60, Math.floor((now - player.value.lastSettleAt) / 1000))
    const cappedHours = Math.min(IDLE_CAP_MS / 3_600_000, elapsedSec / 3600)
    const gainedQi = Math.max(480, Math.round(effectiveQiPerHour.value * cappedHours))
    const gainedSilver = gaibangSilverGain(player.value, Math.max(150, Math.round(Math.round(mockIdleRates.value.silverBasis * cappedHours) * 0.28)))
    return { gainedQi, gainedSilver }
  }

  /** 下线期间镜像替你应战的劫镖与追捕（docs/21） */
  function logDefenseNotice({ kind, attacker, held, silver }: NonNullable<IdleGain['defenseNotices']>[number]) {
    const what = kind === 'ESCORT' ? '劫你的镖车' : '按通缉令追捕你'
    const outcome = held ? '你的镜像把人打退了' : kind === 'ESCORT' ? `镖银被劫走 ${(silver ?? 0).toLocaleString()} 两` : '你的镜像落败，通缉令就此了结'
    appendLog('JIANGHU', [
      { type: 'tag', text: kind === 'ESCORT' ? '镖车遇劫' : '离线遭追捕', tone: held ? 'jade' : 'red' },
      { type: 'text', text: ` 你不在时，` },
      { type: 'actor', name: attacker, isAlly: false, isPlayer: true },
      { type: 'text', text: ` 来${what}，${outcome}。` },
    ])
  }

  /** 江湖邸报（docs/21）：离开超过一个时辰，或不在场时有事发生，收功后弹出汇总 */
  const awayReport = shallowRef<{ gain: IdleGain; at: number } | null>(null)
  function openAwayReport(gain: IdleGain, now: number) {
    const { away } = gain
    if (!away) return
    const happened = !!(away.xiangyang || away.stallSales || away.dividends?.length || away.raidLends ||
      gain.defenseNotices?.length || gain.xiangyang?.length || gain.contestIngot)
    if (happened || now - away.since >= AWAY_REPORT_MS) awayReport.value = { gain, at: now }
  }
  function closeAwayReport() {
    awayReport.value = null
  }
  // 换了角色或存档，上一位的邸报不再弹
  watch(() => player.value.id, closeAwayReport)

  // 1. 惰性离线挂机收益结算（对应后端 POST /api/v1/cultivate/settle）
  function settleOfflineQi() {
    return actions.run('settle', undefined, (result) => {
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
      else if (!result.drops?.length && !result.patrolBattles && !result.patrolCache) showToast('还没攒够可领的收益')
      for (const drop of result.drops ?? []) logTrialDrop(drop)
      if (result.patrolBattles) logPatrolBattles(result.patrolBattles, result.forgeMaterials)
      if (result.patrolCache) logPatrolCache(result.patrolCache)
      for (const [id, gain] of Object.entries(result.reunionClues ?? {})) {
        appendLog('ADVENTURE', [
          { type: 'tag', text: '闭关打听', tone: 'jade' },
          { type: 'text', text: ` 得到${COMPANIONS[id].name}的寻访线索 +${gain}` },
        ])
      }
      if (result.feastIngredient) logFeastIngredient(result.feastIngredient)
      if (result.contestIngot) {
        appendLog('JIANGHU', [{ type: 'tag', text: '门派演武', tone: 'gold' }, { type: 'text', text: ` 上周演武论功，领得 ${result.contestIngot} 元宝。` }])
      }
      for (const award of result.xiangyang ?? []) announceXiangyangAward(award)
      for (const notice of result.defenseNotices ?? []) logDefenseNotice(notice)
      const lends = result.away?.raidLends
      if (lends) {
        appendLog('JIANGHU', [{ type: 'tag', text: '结义助战', tone: 'jade' },
          { type: 'text', text: ` 你的结义镜像随人破阵 ${lends.count} 次，助战真气 +${lends.qiExp.toLocaleString()}。` }])
      }
      openAwayReport(result, worldTime.value)
    }, () => {
      const now = Date.now()
      const since = player.value.lastReportAt ?? player.value.lastSettleAt
      player.value.lastReportAt = now
      const idle = settleMockIdle(now, true)
      const patrol = mockSettlePatrol(now)
      const { awards, xiangyang } = claimLocalXiangyang(now, since)
      markDaily('settle')
      openAwayReport({ ...idle, ...patrol, ...(awards.length ? { xiangyang: awards } : {}), away: { since, ...(xiangyang ? { xiangyang } : {}) } }, now)
    })
  }

  function settleMockIdle(now: number, claim = false) {
    const elapsedSec = Math.max(0, Math.floor((now - player.value.lastSettleAt) / 1000))
    const hours = Math.min(IDLE_CAP_MS / 3_600_000, elapsedSec / 3600)
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
    return { gainedQi, gainedSilver }
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
    awayReport,
    closeAwayReport,
    pierceAcupoint,
    useAcupointPill,
    getIdleRewards,
    upgradeLevel,
    attemptBreakthrough,
  }
}
