import { computed, ref } from 'vue'
import type { FeastResult, GachaDrawDTO, InnGiftResult, ReunionResult, ReunionStateDTO, RichSegment } from '@/network/protocol'
import { COMPANIONS, INN_GIFT_COST, INN_TEA_COST, ITEMS, MAPS, SKILLS } from '@/config/gameData'
import { EQUIP_SLOT_META, SKILL_SLOT_META } from '@/config/uiMeta'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { battleEnvironmentAt } from '../../../shared/combatMeta.ts'
import { innVisitDay } from '../../../shared/player.ts'
import { gainReunionClues, reunionCluesToday, reunionEncounter, reunionWaitTime } from '../../../shared/reunion.ts'
import {
  awakenCompanion as awakenState,
  GACHA_SINGLE_COST,
  GACHA_TEN_COST,
  pullGacha as drawGacha,
  REUNION_AFTER,
  REUNION_TICKET_COST,
} from '@/config/gachaData'
import type { PortraitStyle } from '@/config/typesHelper'
import {
  cookFeastDish,
  DISHES,
  emptyFeast,
  FEAST_GATHER_MINUTES,
  FEAST_TARGET_FLAG,
  feastActive as feastInProgress,
  gatherFeastIngredient,
  REUNION_CLUE_SOURCES,
  REUNION_CLUE_TARGET,
  REUNION_INQUIRE_COST,
  REUNION_QUESTS,
  REUNION_WAIT_HOURS,
  type ClueSource,
} from '@/config/questData'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import type { GameActions } from '@/network/gameActions'
import type { useBattlePlayback } from './battlePlayback'

export interface GachaResultView {
  draw: GachaDrawDTO
  name: string
  detail: string
  isNew: boolean
  portrait?: PortraitStyle // 伙伴用水墨人像
  glyph: string // 其余用印章字
}

export function useCompanions({ actions, battle }: {
  actions: GameActions
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'isBattlePlaying' | 'startBattlePlayback' | 'startLocalBattle'>
}) {
  const playerStore = usePlayerStore()
  const {
    companionAffinity,
    affinityCap,
    player,
    limitsEnabled,
    innDay,
    innGiftsToday,
    learnedSkills,
    ownedItemIds,
    resolvedAdventureIds,
    nowTick,
    worldTime,
    mapArrivedAt,
    currentLoadout,
    storyFlags,
  } = storeToRefs(playerStore)
  const { giftsLeft, dayKey, innGiftGain, recruitable, learnSkill, gainItem, simulateServerBattle, markDaily } = playerStore
  const uiStore = useGameUiStore()
  const { showToast, appendLog } = uiStore
  const { isBattlePlaying, startBattlePlayback, startLocalBattle } = battle

  // ==================== 市井：醉仙客栈请酒传功 & 子时鬼市鉴宝 ====================
  function giftCompanionInInn(compId: string, isFavorite: boolean) {
    const c = COMPANIONS[compId]
    const state = companionAffinity.value[compId]
    if (!c || !state) return
    if (!state.met) {
      showToast(`尚未结识【${c.name}】：${c.meetHint ?? '请先推进主线与支线'}`, 'danger')
      return
    }
    function announce({ affinityGained, taughtSkillId }: InnGiftResult) {
      const taught = taughtSkillId ? SKILLS[taughtSkillId] : undefined
      appendLog('JIANGHU', [
        { type: 'tag', text: '醉仙煮酒', tone: 'gold' },
        { type: 'text', text: ` 你${isFavorite ? `把「${c.favGift}」送给` : '请'}` },
        { type: 'actor', name: c.name, isAlly: true },
        { type: 'text', text: `，好感 +${affinityGained}（现在 ${companionAffinity.value[compId].affinity}/${affinityCap.value}）。` },
        ...(taught ? [{ type: 'text' as const, text: ' 对方向你倾囊传授' }, { type: 'skill' as const, id: taught.id, name: `《${taught.name}》`, tier: taught.tier }] : []),
      ])
      showToast(taught ? `${c.name}教会了你《${taught.name}》！` : `${c.name}好感度 +${affinityGained}`, taught ? 'gold' : 'info')
    }
    return actions.run('innGift', { companionId: compId, favorite: isFavorite }, announce, () => {
      // 限制一：每日次数；限制二：好感随主线章节封顶——都在扣银之前判定，被拒不花钱
      const left = giftsLeft(compId)
      if ((isFavorite ? left.gift : left.tea) <= 0) {
        showToast(`今日已向【${c.name}】${isFavorite ? '赠过爱物' : '敬过清茶'}，明日子时再来`, 'danger')
        return
      }
      const cap = affinityCap.value
      if (state.affinity >= cap) {
        showToast(`与【${c.name}】此情已满，待江湖历练更深（通关更多章节可提高上限）`, 'info')
        return
      }
      const cost = isFavorite ? INN_GIFT_COST : INN_TEA_COST
      if (player.value.silver < cost) {
        showToast(`这次需要 ${cost.toLocaleString()} 两纹银。`, 'danger')
        return
      }
      player.value.silver -= cost
      markDaily('inn')
      if (limitsEnabled.value) {
        if (innDay.value !== dayKey()) {
          innDay.value = dayKey()
          innGiftsToday.value = {}
        }
        const used = (innGiftsToday.value[compId] ??= { tea: 0, gift: 0 })
        if (isFavorite) used.gift += 1
        else used.tea += 1
      }
      const delta = innGiftGain(compId, isFavorite)
      state.affinity += delta
      state.recruited = state.recruited || recruitable(compId, state.affinity)

      const taughtSkillId = state.affinity >= 600 && !state.taught && SKILLS[c.teachSkillId] ? c.teachSkillId : undefined
      if (taughtSkillId) {
        state.taught = true
        learnSkill(taughtSkillId)
      }
      return { affinityGained: delta, taughtSkillId }
    })
  }

  /** 觉醒进阶：好感 ≥600（生死之交）+ 消耗伙伴信物，基础形态 → 觉醒形态（伙伴专题 §四） */
  function awakenCompanion(compId: string) {
    const c = COMPANIONS[compId]
    if (!c?.awakened) return
    return actions.run('awaken', { companionId: compId }, ({ title }) => {
      appendLog('JIANGHU', [
        { type: 'tag', text: '觉醒进阶', tone: 'gold' },
        { type: 'actor', name: c.name, isAlly: true },
        { type: 'text', text: `以信物为引，功力臻至新境，化作【${title}】！` },
      ])
      showToast(`【${c.name}】觉醒为「${title}」！`, 'gold')
    }, () => {
      const result = awakenState(compId, companionAffinity.value[compId])
      if ('error' in result) {
        showToast(result.error, companionAffinity.value[compId]?.form === 'awakened' ? 'info' : 'danger')
        return
      }
      return result
    })
  }

  // 客栈「醉仙楼·结缘」抽卡（伙伴专题 §七、§八）：结果由服务端出签，本地试玩调用同一份规则
  const gachaHistory = ref<GachaResultView[]>([])
  const gacha = computed(() => ({ pulls: player.value.gacha?.pulls ?? 0, pity: player.value.gacha?.pity ?? 0, history: gachaHistory.value }))
  /** 当前待播放的揭晓动画；为 null 时不显示 */
  const gachaReveal = ref<{ key: number; results: GachaResultView[] } | null>(null)

  /** 结果卡片：名字、水墨人像或印章字 */
  function gachaView(d: GachaDrawDTO): GachaResultView {
    const base = { draw: d, detail: d.detail ?? '', isNew: !!d.isNew }
    switch (d.kind) {
      case 'COMPANION': {
        const cfg = COMPANIONS[d.refId!]
        return { ...base, name: cfg.name, portrait: cfg.portraitStyle, glyph: '缘' }
      }
      case 'SKILL': {
        const sk = SKILLS[d.refId!]
        return { ...base, name: `《${sk.name}》`, glyph: SKILL_SLOT_META[sk.slot].glyph }
      }
      case 'ITEM': {
        const it = ITEMS[d.refId!]
        return { ...base, name: `【${it.name}】`, glyph: EQUIP_SLOT_META[it.slot].glyph }
      }
      case 'TOKEN':
        return { ...base, name: `${COMPANIONS[d.refId!].name}信物`, glyph: '信' }
      case 'PILL':
        return { ...base, name: '九花玉露丸', glyph: '丹' }
      case 'SILVER':
        return { ...base, name: '纹银', glyph: '银' }
      case 'QI':
        return { ...base, name: '真气', glyph: '气' }
    }
  }

  function revealGacha(count: number, cost: number, draws: GachaDrawDTO[]) {
    const results = draws.map(gachaView)
    gachaHistory.value = [...results.slice().reverse(), ...gachaHistory.value].slice(0, 60)
    gachaReveal.value = { key: Date.now(), results }

    const notable = results.filter((r) => r.draw.tier !== 'blue')
    const segs: RichSegment[] = []
    for (const r of notable) {
      const tier = r.draw.tier
      segs.push({ type: 'text', text: ' ' })
      if (r.draw.kind === 'COMPANION') segs.push({ type: 'actor', name: r.name, isAlly: true })
      else if (r.draw.kind === 'SKILL') segs.push({ type: 'skill', id: r.draw.refId!, name: r.name, tier })
      else if (r.draw.kind === 'ITEM') segs.push({ type: 'item', id: r.draw.refId!, name: r.name, tier })
      else segs.push({ type: 'text', text: r.name })
    }
    appendLog('JIANGHU', [
      { type: 'tag', text: '醉仙结缘', tone: results.some((r) => r.draw.tier === 'red') ? 'gold' : 'purple' },
      { type: 'text', text: ` 你于醉仙楼雅间焚香求签，结缘 ${count} 次（−${cost} 元宝）${notable.length ? '，得：' : '，皆是寻常机缘。'}` },
      ...segs,
    ])
  }

  function pullGacha(count: 1 | 10) {
    if (gachaReveal.value) return
    const cost = count === 10 ? GACHA_TEN_COST : GACHA_SINGLE_COST
    if (player.value.goldIngot < cost) {
      showToast(`元宝不足：结缘 ${count} 次需 ${cost} 元宝`, 'danger')
      return
    }
    return actions.run('gacha', { count }, (result) => revealGacha(count, result.cost, result.draws), () => {
      const outcome = drawGacha({
        player: player.value, companionAffinity: companionAffinity.value, learnedSkills: learnedSkills.value,
        ownedItemIds: ownedItemIds.value, affinityCap: affinityCap.value,
      }, count)
      if ('error' in outcome) {
        showToast(outcome.error, 'danger')
        return
      }
      // 新得的武学、装备按开局规则自动填空槽
      outcome.changes.newSkills.forEach(learnSkill)
      outcome.changes.newItems.forEach(gainItem)
      return { cost: outcome.cost, draws: outcome.draws }
    })
  }

  function closeGachaReveal() {
    gachaReveal.value = null
  }

  /** 已错过、可用重逢令补救的剧情送伙伴 */
  const reunionCandidates = computed(() =>
    Object.entries(REUNION_AFTER)
      .filter(([id, adv]) => resolvedAdventureIds.value.includes(adv) && !companionAffinity.value[id]?.recruited)
      .map(([id]) => id)
  )

  function redeemReunionTicket(compId: string) {
    const c = COMPANIONS[compId]
    if (!c || !reunionCandidates.value.includes(compId)) return
    if (player.value.goldIngot < REUNION_TICKET_COST) {
      showToast(`元宝不足：故人重逢令需 ${REUNION_TICKET_COST} 元宝`, 'danger')
      return
    }
    return actions.run('reunion', { id: compId, action: 'ticket' }, () => {
      appendLog('JIANGHU', [
        { type: 'tag', text: '故人重逢', tone: 'gold' },
        { type: 'text', text: ' 醉仙楼的伙计递来一封旧信，你循着信中所约来到渡口——' },
        { type: 'actor', name: c.name, isAlly: true },
        { type: 'text', text: '已在那里等你多时。前尘往事，一笑而过，从此同行。' },
      ])
      showToast(`故人重逢：【${c.name}】已入队`, 'gold')
    }, () => {
      player.value.goldIngot -= REUNION_TICKET_COST
      const st = companionAffinity.value[compId]
      st.met = true
      st.recruited = true
      st.affinity = Math.max(st.affinity, 100)
      reunionOf(compId).step = 'DONE'
      return { action: 'ticket' as const }
    })
  }

  // 故人寻访与北丐·十道绝味（伙伴专题 §十六）
  type ReunionState = Omit<ReunionStateDTO, 'day'> & { day: string }
  const reunion = ref<Record<string, ReunionState>>({})
  const feast = computed(() => player.value.feast ?? emptyFeast())

  const blankReunion = (): ReunionState => ({ clues: 0, day: '', got: { closed: 0, replay: 0, inn: 0 }, step: 'CLUES', waitSince: null, waitMs: 0 })
  const reunionOf = (id: string) => (reunion.value[id] ??= blankReunion())
  /** 只读视图（界面用，不会写入新键） */
  function reunionView(id: string) {
    const st = (IS_MOCK_MODE ? reunion.value[id] : player.value.reunions?.[id]) ?? blankReunion()
    const today = IS_MOCK_MODE ? dayKey(nowTick.value) : innVisitDay(worldTime.value)
    const got = reunionCluesToday(st, today)
    return { ...st, got, waitRatio: waitRatio(id) }
  }
  function waitRatio(id: string, now = worldTime.value) {
    const st = IS_MOCK_MODE ? reunion.value[id] : player.value.reunions?.[id]
    const q = REUNION_QUESTS[id]
    if (!st || st.step !== 'WAIT' || !q) return st && st.step !== 'CLUES' ? 1 : 0
    const arrived = IS_MOCK_MODE ? mapArrivedAt.value : player.value.mapArrivedAt
    return Math.min(1, reunionWaitTime(st, q, player.value.currentMapId, now, arrived) / (REUNION_WAIT_HOURS * 3600_000))
  }
  /** 离开地图前，把在故地的停留时长累计进去 */
  function accrueReunionWait() {
    const now = Date.now()
    for (const [id, st] of Object.entries(reunion.value)) {
      const q = REUNION_QUESTS[id]
      if (st.step === 'WAIT' && q) st.waitMs = reunionWaitTime(st, q, player.value.currentMapId, now, mapArrivedAt.value)
    }
  }

  function gainClue(id: string, source: ClueSource): number {
    const st = reunionOf(id)
    if (st.step !== 'CLUES') return 0
    const today = dayKey()
    st.got = reunionCluesToday(st, today)
    st.day = today
    const gain = gainReunionClues(st, source, Date.now())
    if (gain && st.clues >= REUNION_CLUE_TARGET) {
      const q = REUNION_QUESTS[id]
      const m = MAPS.find((x) => x.id === q.mapId)
      appendLog('ADVENTURE', [
        { type: 'tag', text: '线索集齐', tone: 'gold' },
        { type: 'text', text: ` 关于` },
        { type: 'actor', name: COMPANIONS[id].name, isAlly: true },
        { type: 'text', text: `的消息终于拼凑完整。${q.waitText}（前往【${m?.name}】累计停留 ${REUNION_WAIT_HOURS} 小时，离线亦可）` },
      ])
      showToast(`【${COMPANIONS[id].name}】线索集齐：前往${m?.name}相候`, 'gold')
    }
    return gain
  }

  /** 收功时：离线 ≥1 小时为寻访攒线索；离线 ≥30 分钟在当前地图采办绝味食材 */
  function onOfflineSettled(elapsedSec: number) {
    if (elapsedSec >= 3600) {
      const names = reunionCandidates.value.filter((id) => gainClue(id, 'closed') > 0).map((id) => COMPANIONS[id].name)
      if (names.length) {
        appendLog('ADVENTURE', [
          { type: 'tag', text: '闭关打听', tone: 'jade' },
          { type: 'text', text: ` 闭关时听往来客商闲谈，得了些${names.join('、')}的消息（线索 +${REUNION_CLUE_SOURCES.closed.gain}）。` },
        ])
      }
    }
    const dish = feastActive.value ? gatherFeastIngredient(player.value, elapsedSec) : undefined
    if (dish) logFeastIngredient(dish.id)
  }

  function logFeastIngredient(dishId: string) {
    const dish = DISHES.find((d) => d.id === dishId)
    if (!dish) return
    appendLog('ADVENTURE', [
      { type: 'tag', text: '采办食材', tone: 'jade' },
      { type: 'text', text: ` 你在当地寻得上好的「${dish.ingredient}」，可回客栈为洪七公烹一道【${dish.name}】。` },
    ])
    showToast(`采得食材：${dish.ingredient}`, 'gold')
  }

  /** 主线节点获胜：与错过伙伴相关的节点给“旧地重游”线索 */
  function onStoryNodeWon(nodeId: number) {
    for (const id of reunionCandidates.value) {
      if (REUNION_QUESTS[id]?.replayNodeIds.includes(nodeId) && gainClue(id, 'replay') > 0) {
        appendLog('ADVENTURE', [
          { type: 'tag', text: '旧地重游', tone: 'jade' },
          { type: 'text', text: ` 故地重来，你在旧战场寻到了${COMPANIONS[id].name}留下的痕迹（线索 +${REUNION_CLUE_SOURCES.replay.gain}）。` },
        ])
      }
    }
  }

  function inquireReunion(id: string) {
    return requestReunion(id, 'inquire', () => inquireLocally(id))
  }

  function inquireLocally(id: string) {
    const st = reunionOf(id)
    if (st.step !== 'CLUES') return
    // 动作判定用实时时钟（界面时钟每 30 秒才刷新，跨子时那一刻会错判“今天”）
    const gotToday = st.day === dayKey() ? st.got.inn : 0
    if (gotToday >= REUNION_CLUE_SOURCES.inn.dailyCap) {
      showToast('掌柜今日知道的都说了，明日子时再来', 'info')
      return
    }
    if (player.value.silver < REUNION_INQUIRE_COST) {
      showToast(`打听消息需 ${REUNION_INQUIRE_COST} 两纹银`, 'danger')
      return
    }
    player.value.silver -= REUNION_INQUIRE_COST
    const gain = gainClue(id, 'inn')
    appendLog('JIANGHU', [
      { type: 'tag', text: '客栈打听', tone: 'jade' },
      { type: 'text', text: ` 你塞给掌柜一锭碎银，打听${COMPANIONS[id].name}的下落（线索 +${gain}）。` },
    ])
  }

  function completeReunionWait(id: string) {
    return requestReunion(id, 'wait', () => waitLocally(id))
  }

  function waitLocally(id: string) {
    const st = reunion.value[id]
    if (!st || st.step !== 'WAIT') return
    if (waitRatio(id, Date.now()) < 1) {
      showToast(`还需在故地多候些时辰（已候 ${Math.floor(waitRatio(id, Date.now()) * 100)}%）`, 'info')
      return
    }
    accrueReunionWait()
    st.step = 'GIFT'
    appendLog('ADVENTURE', [
      { type: 'tag', text: '故地相候', tone: 'gold' },
      { type: 'text', text: ` 你终于等到了对方出没的踪迹。下一步，备一份${COMPANIONS[id].favGift}，以礼相邀。` },
    ])
  }

  function reunionGift(id: string) {
    return requestReunion(id, 'gift', () => giftLocally(id))
  }

  function giftLocally(id: string) {
    const st = reunion.value[id]
    if (!st || st.step !== 'GIFT') return
    if (player.value.silver < INN_GIFT_COST) {
      showToast(`备礼需 ${INN_GIFT_COST} 两纹银`, 'danger')
      return
    }
    player.value.silver -= INN_GIFT_COST
    st.step = 'BATTLE'
    appendLog('ADVENTURE', [
      { type: 'tag', text: '以礼相邀', tone: 'gold' },
      { type: 'text', text: ` ${REUNION_QUESTS[id].giftText}` },
    ])
  }

  function reunionBattle(id: string) {
    if (isBattlePlaying.value) return
    return requestReunion(id, 'battle', () => fightReunionLocally(id))
  }

  function fightReunionLocally(id: string) {
    const st = reunion.value[id]
    const q = REUNION_QUESTS[id]
    if (!st || !q || st.step !== 'BATTLE') return
    appendLog('JIANGHU', [{ type: 'tag', text: '了却前尘', tone: 'red' }, { type: 'text', text: ` ${q.battleIntro}` }])
    const report = simulateServerBattle({
      sceneTitle: `故人重逢 · ${COMPANIONS[id].name}`,
      mode: 'SOLO_STORY',
      player: player.value,
      loadout: currentLoadout.value,
      learnedSkills: learnedSkills.value,
      environment: battleEnvironmentAt(q.mapId),
      ...reunionEncounter(q, player.value.level),
    })
    startLocalBattle(report, null, () => {
      if (st.step !== 'BATTLE') return
      const cs = companionAffinity.value[id]
      cs.met = true
      cs.recruited = true
      cs.affinity = Math.max(cs.affinity, 100)
      st.step = 'DONE'
      appendLog('ADVENTURE', [
        { type: 'tag', text: '故人重逢', tone: 'gold' },
        { type: 'text', text: ` ${q.outro}` },
        { type: 'actor', name: COMPANIONS[id].name, isAlly: true },
        { type: 'text', text: '已加入你的江湖行列。' },
      ])
      showToast(`故人重逢：【${COMPANIONS[id].name}】已入队`, 'gold')
    })
  }

  function requestReunion(id: string, action: ReunionResult['action'], playLocally: () => void) {
    if (!reunionCandidates.value.includes(id)) return
    return actions.run('reunion', { id, action }, (result) => {
      const q = REUNION_QUESTS[id]
      if (result.action === 'battle') {
        appendLog('JIANGHU', [{ type: 'tag', text: '了却前尘', tone: 'red' }, { type: 'text', text: ` ${q.battleIntro}` }])
        return startBattlePlayback(result.report)
      }
      const text = result.action === 'inquire' ? `寻访线索 +${result.clues}` : result.action === 'wait'
        ? `已寻得踪迹，可备一份${COMPANIONS[id].favGift}相邀。` : q.giftText
      appendLog('ADVENTURE', [{ type: 'tag', text: COMPANIONS[id].name, tone: 'jade' }, { type: 'text', text: ` ${text}` }])
    }, playLocally)
  }

  /** 十道绝味进行中：已结识洪七公、尚未入队（抽卡 / 演武模式已得者无需再做）、尚未呈齐 */
  const feastActive = computed(() => feastInProgress(companionAffinity.value.hongqigong, storyFlags.value))

  function cookDish(dishId: string) {
    const dish = DISHES.find((d) => d.id === dishId)
    if (!dish || !feastActive.value || feast.value.cooked.includes(dishId)) return
    if (!feast.value.ingredients.includes(dishId)) {
      const m = MAPS.find((x) => x.id === dish.mapId)
      showToast(`缺少「${dish.ingredient}」：在【${m?.name}】挂机 ≥${FEAST_GATHER_MINUTES} 分钟后收功即可采得`, 'danger')
      return
    }
    if (feast.value.lastCookDay === innVisitDay(worldTime.value)) {
      showToast('今日已为洪七公掌过勺，明日子时再来', 'info')
      return
    }
    if (player.value.silver < dish.silver) {
      showToast(`烹制需 ${dish.silver} 两纹银`, 'danger')
      return
    }
    return actions.run('feast', { dishId }, (result) => announceDish(result), () => {
      const result = cookFeastDish(player.value, companionAffinity.value.hongqigong, dishId, Date.now(), affinityCap.value)
      if ('error' in result) {
        showToast(result.error, 'danger')
        return
      }
      if (result.done && !storyFlags.value.includes(FEAST_TARGET_FLAG)) storyFlags.value.push(FEAST_TARGET_FLAG)
      return { dishId, cooked: result.cooked, affinity: result.affinity, done: result.done }
    })
  }

  function announceDish({ dishId, cooked, affinity, done }: FeastResult) {
    const dish = DISHES.find((d) => d.id === dishId)!
    appendLog('JIANGHU', [
      { type: 'tag', text: `绝味 ${cooked}/${DISHES.length}`, tone: 'gold' },
      { type: 'text', text: ` 你呈上一道【${dish.name}】——${dish.poem}洪七公吃得眉飞色舞${affinity ? `（好感 +${affinity}）` : ''}。` },
    ])
    if (!done) {
      showToast(`呈上【${dish.name}】（${cooked}/${DISHES.length}）`, 'gold')
      return
    }
    appendLog('ADVENTURE', [
      { type: 'tag', text: '十道绝味', tone: 'gold' },
      { type: 'actor', name: '洪七公', isAlly: true },
      { type: 'text', text: '抹抹嘴，拍着肚皮长笑：“十道菜，道道有心思！老叫化这辈子没吃得这般痛快——走，这江湖老叫化陪你闯一闯！”洪七公已加入你的江湖行列。' },
    ])
    showToast('十道绝味呈齐：洪七公入队！', 'gold')
  }

  return {
    onStoryNodeWon,
    onOfflineSettled,
    logFeastIngredient,
    gachaHistory,
    feast,
    accrueReunionWait,
    gachaReveal,
    gacha,
    reunion,
    blankReunion,
    awakenCompanion,
    reunionView,
    inquireReunion,
    completeReunionWait,
    reunionGift,
    reunionBattle,
    feastActive,
    cookDish,
    pullGacha,
    closeGachaReveal,
    reunionCandidates,
    redeemReunionTicket,
    giftCompanionInInn,
  }
}
