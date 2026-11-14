import { computed, ref } from 'vue'
import type { GachaDrawDTO, InnGiftResult, ReunionResult, ReunionStateDTO, RichSegment } from '@/network/protocol'
import { rollGacha } from '@/network/mockEngine'
import { COMPANIONS, INN_GIFT_COST, INN_TEA_COST, ITEMS, MAPS, SKILLS, type CompanionGrade } from '@/config/gameData'
import { EQUIP_SLOT_META, SKILL_SLOT_META } from '@/config/uiMeta'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { battleEnvironmentAt } from '../../../shared/combatMeta.ts'
import { innVisitDay } from '../../../shared/player.ts'
import { gainReunionClues, reunionCluesToday, reunionEncounter, reunionWaitTime } from '../../../shared/reunion.ts'
import {
  GACHA_DUP_SILVER,
  GACHA_DUP_TOKENS,
  GACHA_SINGLE_COST,
  GACHA_TEN_COST,
  REUNION_AFTER,
  REUNION_TICKET_COST,
} from '@/config/gachaData'
import type { PortraitStyle } from '@/config/typesHelper'
import {
  DISHES,
  FEAST_GATHER_MINUTES,
  FEAST_TARGET_FLAG,
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
  const { giftsLeft, dayKey, innGiftGain, recruitable, learnSkill, gainItem, simulateServerBattle } = playerStore
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
    const st = companionAffinity.value[compId]
    if (!c?.awakened || !st) return
    if (st.form === 'awakened') {
      showToast(`【${c.name}】已是觉醒形态`, 'info')
      return
    }
    if (!st.recruited || st.affinity < 600) {
      showToast(`觉醒需与【${c.name}】结为生死之交（好感 ≥ 600）`, 'danger')
      return
    }
    const need = c.awakenTokens ?? 30
    if (st.tokens < need) {
      showToast(`伙伴信物不足：需 ${need}，现有 ${st.tokens}`, 'danger')
      return
    }
    st.tokens -= need
    st.form = 'awakened'
    appendLog('JIANGHU', [
      { type: 'tag', text: '觉醒进阶', tone: 'gold' },
      { type: 'actor', name: c.name, isAlly: true },
      { type: 'text', text: `以信物为引，功力臻至新境，化作【${c.awakened.title}】！` },
    ])
    showToast(`【${c.name}】觉醒为「${c.awakened.title}」！`, 'gold')
  }

  // 客栈「醉仙楼·结缘」抽卡（伙伴专题 §七、§八）
  const gacha = ref({ pulls: 0, pity: 0, history: [] as GachaResultView[] })
  /** 当前待播放的揭晓动画；为 null 时不显示 */
  const gachaReveal = ref<{ key: number; results: GachaResultView[] } | null>(null)
  const GRADE_RANK: Record<CompanionGrade, number> = { 下: 1, 中: 2, 上: 3 }

  /** 结算一抽：新得入手 / 重复转化，并生成展示信息 */
  function applyGachaDraw(d: GachaDrawDTO): GachaResultView {
    const p = player.value
    switch (d.kind) {
      case 'COMPANION': {
        const cfg = COMPANIONS[d.refId!]
        const st = companionAffinity.value[d.refId!]
        if (!st.recruited) {
          st.met = true
          st.recruited = true
          st.affinity = Math.max(st.affinity, 100)
          // 神品档抽到“好感线”大侠：直接以觉醒形态入队（等于跳过免费线）
          if (d.tier === 'red' && cfg.awakened) st.form = 'awakened'
          if (d.grade) st.grade = d.grade
          const formTxt = st.form === 'awakened' ? `觉醒形态「${cfg.awakened!.title}」` : '已入队'
          return { draw: d, name: cfg.name, detail: `新结缘 · ${formTxt}${d.grade ? ` · 橙·${d.grade}` : ''}`, isNew: true, portrait: cfg.portraitStyle, glyph: '缘' }
        }
        const tokens = GACHA_DUP_TOKENS[d.tier] ?? 10
        st.tokens += tokens
        const parts = [`重复 → 信物 ×${tokens}`]
        if (d.grade && (!st.grade || GRADE_RANK[d.grade] > GRADE_RANK[st.grade])) {
          st.grade = d.grade
          parts.push(`资质提升至「${d.grade}」`)
        }
        if (!cfg.awakened && st.affinity < affinityCap.value) {
          const gain = Math.min(60, affinityCap.value - st.affinity)
          st.affinity += gain
          parts.push(`好感 +${gain}`)
        }
        return { draw: d, name: cfg.name, detail: parts.join('，'), isNew: false, portrait: cfg.portraitStyle, glyph: '缘' }
      }
      case 'SKILL': {
        const sk = SKILLS[d.refId!]
        const lv = learnedSkills.value[sk.id] ?? 0
        const base = { draw: d, name: `《${sk.name}》`, glyph: SKILL_SLOT_META[sk.slot].glyph }
        if (lv <= 0) {
          learnSkill(sk.id)
          return { ...base, detail: `习得${SKILL_SLOT_META[sk.slot].label}`, isNew: true }
        }
        if (lv < 10) {
          learnedSkills.value[sk.id] = lv + 1
          return { ...base, detail: `已会 → 参悟至第 ${lv + 1} 重`, isNew: false }
        }
        p.silver += GACHA_DUP_SILVER[sk.tier]
        return { ...base, detail: `已臻圆满 → 纹银 +${GACHA_DUP_SILVER[sk.tier]}`, isNew: false }
      }
      case 'ITEM': {
        const it = ITEMS[d.refId!]
        const base = { draw: d, name: `【${it.name}】`, glyph: EQUIP_SLOT_META[it.slot].glyph }
        if (!ownedItemIds.value.includes(it.id)) {
          gainItem(it.id)
          return { ...base, detail: `入手${EQUIP_SLOT_META[it.slot].label}`, isNew: true }
        }
        p.silver += GACHA_DUP_SILVER[it.tier]
        return { ...base, detail: `重复 → 纹银 +${GACHA_DUP_SILVER[it.tier]}`, isNew: false }
      }
      case 'TOKEN': {
        const cfg = COMPANIONS[d.refId!]
        companionAffinity.value[d.refId!].tokens += d.qty ?? 0
        return { draw: d, name: `${cfg.name}信物`, detail: `×${d.qty}（觉醒进阶用）`, isNew: false, glyph: '信' }
      }
      case 'PILL': {
        const stock = p.battleMedicines ??= {}
        const qty = d.qty ?? 1
        stock.jiuhua_yulu_wan = (stock.jiuhua_yulu_wan ?? 0) + qty
        return { draw: d, name: '九花玉露丸', detail: `×${qty}（战斗保命）`, isNew: false, glyph: '丹' }
      }
      case 'SILVER':
        p.silver += d.qty ?? 0
        return { draw: d, name: '纹银', detail: `+${(d.qty ?? 0).toLocaleString()} 两`, isNew: false, glyph: '银' }
      case 'QI':
        p.qiExp += d.qty ?? 0
        return { draw: d, name: '真气', detail: `+${(d.qty ?? 0).toLocaleString()}`, isNew: false, glyph: '气' }
    }
  }

  function pullGacha(count: 1 | 10) {
    if (gachaReveal.value) return
    const cost = count === 10 ? GACHA_TEN_COST : GACHA_SINGLE_COST
    if (player.value.goldIngot < cost) {
      showToast(`元宝不足：结缘 ${count} 次需 ${cost} 元宝`, 'danger')
      return
    }
    player.value.goldIngot -= cost
    const { draws, pity } = rollGacha({ count, pity: gacha.value.pity, pullsSoFar: gacha.value.pulls })
    gacha.value.pity = pity
    gacha.value.pulls += count
    const results = draws.map(applyGachaDraw)
    gacha.value.history = [...results.slice().reverse(), ...gacha.value.history].slice(0, 60)
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
    player.value.goldIngot -= REUNION_TICKET_COST
    const st = companionAffinity.value[compId]
    st.met = true
    st.recruited = true
    st.affinity = Math.max(st.affinity, 100)
    appendLog('JIANGHU', [
      { type: 'tag', text: '故人重逢', tone: 'gold' },
      { type: 'text', text: ' 醉仙楼的伙计递来一封旧信，你循着信中所约来到渡口——' },
      { type: 'actor', name: c.name, isAlly: true },
      { type: 'text', text: '已在那里等你多时。前尘往事，一笑而过，从此同行。' },
    ])
    showToast(`故人重逢：【${c.name}】已入队`, 'gold')
  }

  // 故人寻访与北丐·十道绝味（伙伴专题 §十六）
  type ReunionState = Omit<ReunionStateDTO, 'day'> & { day: string }
  const reunion = ref<Record<string, ReunionState>>({})
  const feast = ref<{ ingredients: string[]; cooked: string[]; lastCookDay: string }>({ ingredients: [], cooked: [], lastCookDay: '' })

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
    if (feastActive.value && elapsedSec >= FEAST_GATHER_MINUTES * 60) {
      const dish = DISHES.find(
        (d) => d.mapId === player.value.currentMapId && !feast.value.ingredients.includes(d.id) && !feast.value.cooked.includes(d.id)
      )
      if (dish) {
        feast.value.ingredients.push(dish.id)
        appendLog('ADVENTURE', [
          { type: 'tag', text: '采办食材', tone: 'jade' },
          { type: 'text', text: ` 你在当地寻得上好的「${dish.ingredient}」，可回客栈为洪七公烹一道【${dish.name}】。` },
        ])
        showToast(`采得食材：${dish.ingredient}`, 'gold')
      }
    }
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
  const feastActive = computed(() => {
    const hq = companionAffinity.value.hongqigong
    return !!hq?.met && !hq.recruited && !storyFlags.value.includes(FEAST_TARGET_FLAG)
  })

  function cookDish(dishId: string) {
    const dish = DISHES.find((d) => d.id === dishId)
    if (!dish || !feastActive.value) return
    if (feast.value.cooked.includes(dishId)) return
    if (!feast.value.ingredients.includes(dishId)) {
      const m = MAPS.find((x) => x.id === dish.mapId)
      showToast(`缺少「${dish.ingredient}」：在【${m?.name}】挂机 ≥${FEAST_GATHER_MINUTES} 分钟后收功即可采得`, 'danger')
      return
    }
    if (feast.value.lastCookDay === dayKey()) {
      showToast('今日已为洪七公掌过勺，明日子时再来', 'info')
      return
    }
    if (player.value.silver < dish.silver) {
      showToast(`烹制需 ${dish.silver} 两纹银`, 'danger')
      return
    }
    player.value.silver -= dish.silver
    feast.value.cooked.push(dishId)
    feast.value.ingredients = feast.value.ingredients.filter((x) => x !== dishId)
    feast.value.lastCookDay = dayKey()
    const hq = companionAffinity.value.hongqigong
    const gain = Math.max(0, Math.min(10, affinityCap.value - hq.affinity))
    hq.affinity += gain
    appendLog('JIANGHU', [
      { type: 'tag', text: `绝味 ${feast.value.cooked.length}/${DISHES.length}`, tone: 'gold' },
      { type: 'text', text: ` 你呈上一道【${dish.name}】——${dish.poem}洪七公吃得眉飞色舞${gain ? `（好感 +${gain}）` : ''}。` },
    ])
    if (feast.value.cooked.length === DISHES.length) {
      storyFlags.value.push(FEAST_TARGET_FLAG)
      hq.met = true
      hq.recruited = true
      hq.affinity = Math.max(hq.affinity, 100)
      appendLog('ADVENTURE', [
        { type: 'tag', text: '十道绝味', tone: 'gold' },
        { type: 'actor', name: '洪七公', isAlly: true },
        { type: 'text', text: '抹抹嘴，拍着肚皮长笑：“十道菜，道道有心思！老叫化这辈子没吃得这般痛快——走，这江湖老叫化陪你闯一闯！”洪七公已加入你的江湖行列。' },
      ])
      showToast('十道绝味呈齐：洪七公入队！', 'gold')
    } else {
      showToast(`呈上【${dish.name}】（${feast.value.cooked.length}/${DISHES.length}）`, 'gold')
    }
  }

  return {
    onStoryNodeWon,
    onOfflineSettled,
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
