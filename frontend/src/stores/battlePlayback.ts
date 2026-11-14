import { computed, onScopeDispose, ref } from 'vue'
import type { BattleEventDTO, BattleReportDTO, CombatUnitDTO, RichSegment } from '@/network/protocol'
import { COMPANIONS, ITEMS, SKILLS } from '@/config/gameData'
import { STANCE_META } from '@/config/uiMeta'
import { creditBattleEffectLoot, spendBattleMedicines } from '../../../shared/battleEffects.ts'
import { CHAPTER_ONE_TITLE } from '../../../shared/trialStages.ts'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'

const DAMAGE_POPUP_LABELS: Partial<Record<string, string>> = { poison: '毒伤 ', bleed: '流血 ', reflect: '反伤 ', true: '真伤 ' }

export function useBattlePlayback({ claimNodeFirstClear, onStoryNodeWon, playPendingDuel }: {
  claimNodeFirstClear: (nodeId: number) => void
  onStoryNodeWon: (nodeId: number) => void
  playPendingDuel: () => void
}) {
  const playerStore = usePlayerStore()
  const { player } = storeToRefs(playerStore)
  const { learnSkill, gainItem } = playerStore
  const uiStore = useGameUiStore()
  const { mobileDrawer } = storeToRefs(uiStore)
  const { appendLog, showToast } = uiStore

  // 战斗回放播放器状态与破屏书法招式/飘字状态
  const activeBattle = ref<BattleReportDTO | null>(null)
  const battleOpponentEntry = ref<BattleEventDTO['opponentEntry']>()
  const battleUnits = computed(() => {
    const units = activeBattle.value?.units ?? []
    const entry = battleOpponentEntry.value
    return entry ? [...units.filter((unit) => !unit.slot.startsWith('ENEMY')), entry.unit, ...(entry.guards ?? [])] : units
  })
  let activeChapterId: number | null = null
  const battleEventCursor = ref(0)
  const battleSpeed = ref<1 | 2>(1)
  const isBattlePlaying = ref(false)
  const liveUnitStates = ref<Record<string, {
    hp: number; maxHp: number; rage: number; mp: number; maxMp: number; anim: 'NONE' | 'LUNGE_ALLY' | 'LUNGE_ENEMY' | 'HIT'
  }>>({})
  const slashBanner = ref<{ text: string; sub: string; isUlt: boolean; isAlly: boolean; key: number; sanskrit?: true } | null>(null)
  const floatingPopups = ref<Record<string, { text: string; isCrit: boolean; category: string; key: number }>>({})
  let battleTimer: ReturnType<typeof setTimeout> | null = null
  let battleOnWin: (() => void) | null = null
  let localBattle = false
  onScopeDispose(() => { if (battleTimer) clearTimeout(battleTimer) })

  // ==================== 战斗播放器引擎 ====================
  const initialUnitState = (unit: CombatUnitDTO) => ({
    hp: unit.hp, maxHp: unit.maxHp, rage: unit.rage, mp: unit.maxMp, maxMp: unit.maxMp, anim: 'NONE' as const,
  })
  function startBattlePlayback(report: BattleReportDTO) {
    playReport(report, false, null, null)
  }

  function startLocalBattle(report: BattleReportDTO, storyNodeId: number | null = null, onWin: (() => void) | null = null) {
    playReport(report, true, storyNodeId, onWin)
  }

  function playReport(report: BattleReportDTO, local: boolean, storyNodeId: number | null, onWin: (() => void) | null) {
    if (battleTimer) clearTimeout(battleTimer)
    localBattle = local
    if (localBattle) spendBattleMedicines(player.value, report)
    mobileDrawer.value = 'NONE'
    activeBattle.value = report
    battleOpponentEntry.value = undefined
    activeChapterId = storyNodeId
    battleOnWin = onWin
    battleEventCursor.value = 0
    isBattlePlaying.value = true
    slashBanner.value = null
    floatingPopups.value = {}

    liveUnitStates.value = Object.fromEntries(report.units.map((unit) => [unit.slot, initialUnitState(unit)]))
    stepNextBattleEvent()
  }

  function applyBattleEvent(event: BattleEventDTO) {
    if (event.opponentEntry) {
      const entry = event.opponentEntry
      battleOpponentEntry.value = entry
      for (const slot of Object.keys(liveUnitStates.value)) {
        if (slot.startsWith('ENEMY')) delete liveUnitStates.value[slot]
      }
      for (const unit of [entry.unit, ...(entry.guards ?? [])]) liveUnitStates.value[unit.slot] = initialUnitState(unit)
    }
    const actor = liveUnitStates.value[event.actorSlot]
    const target = event.targetSlot ? liveUnitStates.value[event.targetSlot] : undefined
    const rageTarget = liveUnitStates.value[event.rageTargetSlot ?? event.actorSlot]
    if (target && event.hpDelta) {
      target.hp = Math.max(0, Math.min(target.maxHp, target.hp + event.hpDelta))
    }
    if (actor && event.reflectDelta) actor.hp = Math.max(0, actor.hp + event.reflectDelta)
    if (rageTarget && event.rageDelta) {
      rageTarget.rage = Math.max(0, Math.min(100, rageTarget.rage + event.rageDelta))
    }
    if (actor && event.mpDelta) actor.mp = Math.max(0, Math.min(actor.maxMp, actor.mp + event.mpDelta))
    appendLog('BATTLE', [{ type: 'tag', text: `第 ${event.round} 回合`, tone: 'red' }, { type: 'text', text: ' ' }, ...event.segments])
  }

  function stepNextBattleEvent() {
    if (!activeBattle.value) return
    if (battleEventCursor.value >= activeBattle.value.events.length) {
      finishBattleSettlement()
      return
    }

    const ev = activeBattle.value.events[battleEventCursor.value]
    battleEventCursor.value += 1
    const frameKey = Date.now() + battleEventCursor.value * 7

    // 重置上一帧动效与飘字
    for (const key of Object.keys(liveUnitStates.value)) {
      liveUnitStates.value[key].anim = 'NONE'
    }
    const nextPopups: Record<string, { text: string; isCrit: boolean; category: string; key: number }> = {}

    // 破屏水墨书法招式横幅驱动
    const actorUnit = battleUnits.value.find((unit) => unit.slot === ev.actorSlot)
    if (ev.trueStrikeSourceId === 'jiuyin_sanskrit') {
      slashBanner.value = { text: '阴阳相济', sub: `${actorUnit?.name ?? '侠客'} · ${ev.skillName ?? '出招'}`,
        isUlt: true, isAlly: ev.actorSlot.startsWith(activeBattle.value.perspective ?? 'ALLY'), key: frameKey, sanskrit: true }
    } else if (ev.skillName) {
      slashBanner.value = {
        text: ev.skillName,
        sub: `${actorUnit?.name ?? '侠客'} · ${ev.isUlt ? '使出绝技' : ev.type === 'ASSIST_ATTACK' ? '伙伴追击' : '出招'}`,
        isUlt: !!ev.isUlt,
        isAlly: ev.actorSlot.startsWith('ALLY'),
        key: frameKey,
      }
    } else if (ev.type === 'STANCE_CLASH') {
      const { allyStance, enemyStance, advantage } = battleOpponentEntry.value?.stanceBanner ?? activeBattle.value.stanceBanner
      slashBanner.value = {
        text: '战斗打法',
        sub: `${STANCE_META[allyStance].name} 对 ${STANCE_META[enemyStance].name}`,
        isUlt: false,
        isAlly: advantage !== 'ENEMY',
        key: frameKey,
      }
    } else if (ev.type === 'BOSS_ENRAGE') {
      slashBanner.value = {
        text: '首领狂暴',
        sub: `${actorUnit?.name ?? '首领'} · 气血逆乱 杀气焚天！`,
        isUlt: true,
        isAlly: false,
        key: frameKey,
      }
    } else {
      slashBanner.value = null
    }

    // 驱动攻击、受击与气血飘字
    const actor = liveUnitStates.value[ev.actorSlot]
    if (actor && ev.type !== 'STANCE_CLASH' && ev.type !== 'BOSS_ENRAGE' && ev.type !== 'EFFECT' && ev.type !== 'DOT_TICK') {
      actor.anim = ev.actorSlot.startsWith('ALLY') ? 'LUNGE_ALLY' : 'LUNGE_ENEMY'
    }
    if (ev.targetSlot && liveUnitStates.value[ev.targetSlot]) {
      if (ev.hitResult === 'DODGE') {
        nextPopups[ev.targetSlot] = { text: '闪避', isCrit: false, category: 'dodge', key: frameKey }
      } else if (ev.hpDelta) {
        const target = liveUnitStates.value[ev.targetSlot]
        if (ev.hpDelta < 0) target.anim = 'HIT'
        const dmgSeg = ev.segments.find((s) => s.type === 'damage')
        const cat = dmgSeg && dmgSeg.type === 'damage' ? dmgSeg.category : 'outer'
        const label = DAMAGE_POPUP_LABELS[cat] ?? (ev.hitResult === 'CRIT' ? '暴击 ' : '')
        nextPopups[ev.targetSlot] = {
          text: `${ev.hpDelta > 0 ? '+' : label}${ev.hpDelta.toLocaleString()}`,
          isCrit: ev.hitResult === 'CRIT',
          category: cat,
          key: frameKey,
        }
      } else if (ev.shieldAbsorbed) {
        nextPopups[ev.targetSlot] = { text: `护盾吸收 ${ev.shieldAbsorbed.toLocaleString()}`, isCrit: false, category: 'shield', key: frameKey }
      }
    }
    if (ev.reflectDelta && actor) {
      nextPopups[ev.actorSlot] = {
        text: `反伤 ${ev.reflectDelta.toLocaleString()}`,
        isCrit: false,
        category: 'reflect',
        key: frameKey + 1,
      }
    }
    floatingPopups.value = nextPopups

    applyBattleEvent(ev)

    const delay = battleSpeed.value === 2 ? 480 : 920
    battleTimer = setTimeout(stepNextBattleEvent, delay)
  }

  function skipBattleToEnd() {
    if (!activeBattle.value) return
    if (battleTimer) clearTimeout(battleTimer)
    while (battleEventCursor.value < activeBattle.value.events.length) {
      const ev = activeBattle.value.events[battleEventCursor.value]
      battleEventCursor.value += 1
      applyBattleEvent(ev)
    }
    finishBattleSettlement()
  }

  function finishBattleSettlement() {
    if (!activeBattle.value || !isBattlePlaying.value) return
    isBattlePlaying.value = false
    slashBanner.value = null
    floatingPopups.value = {}
    const report = activeBattle.value
    const won = report.winner === (report.perspective ?? 'ALLY')
    const duel = report.mode === 'PVP_HUASHAN' || report.mode === 'PVP_AMBUSH'
    if (localBattle) creditBattleEffectLoot(player.value, report)
    if (won && report.rewards) {
      if (localBattle) {
        player.value.qiExp += report.rewards.qiExp
        player.value.silver += report.rewards.silver
        if (report.rewards.sectContrib) player.value.sectContribution += report.rewards.sectContrib
        if (report.rewards.title === CHAPTER_ONE_TITLE) player.value.chapterOneChampion = true
      }

      const itemSegs: RichSegment[] = []
      if (report.rewards.items) {
        for (const drop of report.rewards.items) {
          if (SKILLS[drop.id]) {
            if (localBattle) learnSkill(drop.id)
            itemSegs.push({ type: 'skill', id: drop.id, name: `《${drop.name}》`, tier: drop.tier })
          } else if (ITEMS[drop.id]) {
            if (localBattle) gainItem(drop.id)
            itemSegs.push({ type: 'item', id: drop.id, name: `【${drop.name}】`, tier: drop.tier, isTrueUnique: ITEMS[drop.id].isTrueUnique })
          }
        }
      }

      const resources = report.rewards.qiExp || report.rewards.silver
      const recruitSegs: RichSegment[] = (report.rewards.companions ?? []).flatMap((id) => {
        const companion = COMPANIONS[id]
        return companion ? [{ type: 'text', text: ' ' }, { type: 'actor', name: companion.name, isAlly: true }, { type: 'text', text: '入队。' }] : []
      })
      appendLog('BATTLE', [
        { type: 'tag', text: '获胜', tone: 'gold' },
        { type: 'text', text: resources
          ? ` 「${report.sceneTitle}」告捷，领到 ${report.rewards.qiExp.toLocaleString()} 真气和 ${report.rewards.silver.toLocaleString()} 两纹银。 `
          : ` 「${report.sceneTitle}」告捷${itemSegs.length ? '，领到 ' : '。'}` },
        ...itemSegs,
        ...recruitSegs,
        ...(report.rewards.title ? [{ type: 'tag' as const, text: report.rewards.title, tone: 'gold' as const }] : []),
      ])
      showToast(report.mode === 'SECT_TRIAL' ? '门派考核通过' : !resources ? '战斗奖励已领取' : localBattle
        ? `打赢了！真气 +${report.rewards.qiExp.toLocaleString()}`
        : report.mode === 'COOP_3P' ? '副本奖励已到账' : duel ? '比武收益已到账' : '首胜奖励已到账', 'gold')
    } else if (!localBattle && won) {
      showToast(duel ? '比武告捷' : '打赢了，这关奖励已领过', 'gold')
    }
    if (localBattle && report.winner === 'ALLY') {
      const nodeId = activeChapterId
      if (nodeId !== null) {
        if (nodeId >= player.value.maxChapterId) player.value.maxChapterId = nodeId + 1
        claimNodeFirstClear(nodeId)
        onStoryNodeWon(nodeId)
      }
      const hook = battleOnWin
      battleOnWin = null
      hook?.()
    } else if (!won) {
      battleOnWin = null
      if (report.retreated) {
        appendLog('BATTLE', [{ type: 'tag', text: '撤退', tone: 'jade' }, { type: 'text', text: ` 从「${report.sceneTitle}」脱身，未结算通关奖励。` }])
        showToast('已脱身，可重新挑战。', 'info')
        return
      }
      appendLog('BATTLE', [
        { type: 'tag', text: '惜败', tone: 'red' },
        { type: 'text', text: ` 「${report.sceneTitle}」没打过。去武库换个打法或装备，再来一战。` },
      ])
      showToast('这次没打过，试试换个打法再战。', 'danger')
    }
  }

  function closeBattleStage() {
    if (battleTimer) clearTimeout(battleTimer)
    activeBattle.value = null
    battleOpponentEntry.value = undefined
    activeChapterId = null
    battleOnWin = null
    isBattlePlaying.value = false
    slashBanner.value = null
    floatingPopups.value = {}
    playPendingDuel()
  }

  return {
    isBattlePlaying,
    startBattlePlayback,
    startLocalBattle,
    activeBattle,
    closeBattleStage,
    battleOpponentEntry,
    battleEventCursor,
    battleUnits,
    battleSpeed,
    liveUnitStates,
    slashBanner,
    floatingPopups,
    skipBattleToEnd,
  }
}
