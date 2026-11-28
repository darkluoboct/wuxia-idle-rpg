import type { CompanionState, GachaDrawDTO, PlayerDTO, TierColor } from './protocol.ts'
import { EQUIP_SLOT_META } from './combatMeta.ts'
import { COMPANIONS, ITEMS, SKILLS } from './gameData.ts'
import { REUNION_QUESTS } from './reunion.ts'

/**
 * 客栈「醉仙楼·结缘」抽卡配置与结算（伙伴专题 §七、§八）。
 * 服务端用它出结果并入账；本地试玩调用同一份代码。界面的「概率公示」也读这里，保证公示与实际一致。
 */

export const GACHA_SINGLE_COST = 100 // 元宝
export const GACHA_TEN_COST = 950
/** 各档基础概率（%），余下为蓝及以下 */
export const GACHA_BASE_RATES = { red: 0.8, orange: 6, purple: 25 } as const
/** 软保底：自第 70 抽起红品概率每抽 +7%；第 90 抽必出红品 */
export const GACHA_SOFT_PITY_START = 70
export const GACHA_SOFT_PITY_STEP = 7
export const GACHA_HARD_PITY = 90
/** 橙品伙伴资质：上 25% / 中 75% */
export const GACHA_ORANGE_TOP_GRADE_RATE = 25

/** 重复伙伴转化为伙伴信物的数量 */
export const GACHA_DUP_TOKENS: Partial<Record<TierColor, number>> = { red: 40, orange: 20, purple: 10 }
/** 重复装备折算纹银 */
export const GACHA_DUP_SILVER: Record<TierColor, number> = { red: 6000, orange: 3000, purple: 1200, blue: 400, green: 200 }

/** 故人重逢令：固定价格、不随机，仅对错过的剧情送伙伴（紫品及以下）有效 */
export const REUNION_TICKET_COST = 150

export type GachaTier = 'red' | 'orange' | 'purple' | 'blue'

export type GachaEntry =
  | { kind: 'COMPANION'; id: string; weight: number }
  | { kind: 'SKILL'; id: string; weight: number }
  | { kind: 'ITEM'; id: string; weight: number }
  | { kind: 'TOKEN'; id: string; qty: number; weight: number } // 指定伙伴的信物
  | { kind: 'TOKEN_RANDOM'; qty: number; weight: number } // 随机一位可觉醒伙伴的信物
  | { kind: 'PILL'; qty: number; weight: number }
  | { kind: 'SILVER'; qty: number; weight: number }
  | { kind: 'QI'; qty: number; weight: number }

const C = (id: string, weight: number): GachaEntry => ({ kind: 'COMPANION', id, weight })
const S = (id: string, weight: number): GachaEntry => ({ kind: 'SKILL', id, weight })
const I = (id: string, weight: number): GachaEntry => ({ kind: 'ITEM', id, weight })

/** 混合卡池：伙伴不是唯一产出，避免奖池过薄 */
export const GACHA_POOL: Record<GachaTier, GachaEntry[]> = {
  red: [
    C('hongqigong', 10), C('huangyaoshi', 10), C('zhoubotong', 10), C('ouyangfeng', 10), C('yideng', 10), C('wangchongyang', 10),
    S('kanglong_youhui', 8), S('bihai_chaosheng', 8), S('jiuyin_zonggang', 8), S('xiantian_gong', 6),
    I('ruanwei_armor', 8), I('wumu_yishu', 8),
  ],
  orange: [
    C('qiuchuji', 8), C('qiuqianren', 8), C('yangkang', 8), C('yinggu', 8), C('zhebie', 8), C('lingzhi', 8),
    S('dagou_bangfa', 4), S('kongming_quan', 4), S('shuangshou_hubo', 4), S('tanzhi_shentong', 4), S('tonggui_jianfa', 4), S('dashouyin', 4),
    I('biyu_xiao', 3), I('wucan_baoyi', 3), I('lingshe_zhang', 3), I('tiancan_glove', 3),
    { kind: 'TOKEN', id: 'guojing', qty: 10, weight: 8 }, { kind: 'TOKEN', id: 'huangrong', qty: 10, weight: 8 },
  ],
  purple: [
    C('wangchuyi', 6), C('ouyangke', 6), C('sunbuer', 6),
    S('luoying_zhang', 5), S('jiuyin_baiguzhua', 5), S('huntian_qigong', 5), S('niqiu_gong', 5),
    S('tiezhang_gong', 5), S('lanhua_fuxue', 5), S('lingshe_quan', 5), S('yangjia_qiang', 5),
    I('fumo_staff', 4), I('baituo_fan', 4), I('xuantie_dagger', 4), I('jiudai_baina', 4), I('baituo_jinsi', 4), I('shuangdiao_arrow', 4),
    { kind: 'TOKEN_RANDOM', qty: 3, weight: 18 },
  ],
  blue: [
    { kind: 'PILL', qty: 1, weight: 25 },
    { kind: 'SILVER', qty: 800, weight: 25 },
    { kind: 'QI', qty: 1500, weight: 20 },
    I('qimei_stick', 4), I('chansi_hufan', 4), I('quanzhen_robe', 4), I('ruanwei_shard', 3),
    S('pikong_zhang', 4), S('fengmo_zhang', 4), S('xiaoyao_you', 4), S('jinyan_gong', 3),
  ],
}

/** 可被抽到“觉醒信物”的伙伴（拥有觉醒形态） */
/** 结缘签里的伙伴信物只给结缘与好感线的伙伴；家人的家传信物只从家事里得（docs/17 §七） */
export const AWAKENABLE_IDS = Object.values(COMPANIONS).filter((c) => !!c.awakened && c.route !== 'FAMILY').map((c) => c.id)

/** 错过后可用重逢令补救的剧情送伙伴：伙伴ID → 触发支线（与免费的故人寻访同一份名单） */
export const REUNION_AFTER: Record<string, string> = Object.fromEntries(
  Object.values(REUNION_QUESTS).map((q) => [q.companionId, q.afterAdventure])
)

/** 条目展示名（概率公示、结果卡片共用） */
export function gachaEntryName(e: GachaEntry): string {
  switch (e.kind) {
    case 'COMPANION':
      return COMPANIONS[e.id]?.name ?? e.id
    case 'SKILL':
      return `《${SKILLS[e.id]?.name ?? e.id}》`
    case 'ITEM':
      return `【${ITEMS[e.id]?.name ?? e.id}】`
    case 'TOKEN':
      return `${COMPANIONS[e.id]?.name ?? e.id}信物 ×${e.qty}`
    case 'TOKEN_RANDOM':
      return `随机觉醒信物 ×${e.qty}`
    case 'PILL':
      return `九花玉露丸 ×${e.qty}`
    case 'SILVER':
      return `纹银 ×${e.qty}`
    case 'QI':
      return `真气 ×${e.qty}`
  }
}

/** 公示用：各档实际概率（%）与档内每个条目的综合概率 */
export function gachaRateTable() {
  const blueRate = 100 - GACHA_BASE_RATES.red - GACHA_BASE_RATES.orange - GACHA_BASE_RATES.purple
  const tiers: { tier: GachaTier; label: string; rate: number }[] = [
    { tier: 'red', label: '神品', rate: GACHA_BASE_RATES.red },
    { tier: 'orange', label: '绝品', rate: GACHA_BASE_RATES.orange },
    { tier: 'purple', label: '上品', rate: GACHA_BASE_RATES.purple },
    { tier: 'blue', label: '良品及以下', rate: blueRate },
  ]
  return tiers.map((t) => {
    const total = GACHA_POOL[t.tier].reduce((s, e) => s + e.weight, 0)
    return {
      ...t,
      entries: GACHA_POOL[t.tier].map((e) => ({ name: gachaEntryName(e), kind: e.kind, rate: (t.rate * e.weight) / total })),
    }
  })
}

/** 第 n 抽（距上次神品）的神品概率（%） */
function redRateAt(n: number) {
  if (n >= GACHA_HARD_PITY) return 100
  if (n >= GACHA_SOFT_PITY_START) return GACHA_BASE_RATES.red + GACHA_SOFT_PITY_STEP * (n - GACHA_SOFT_PITY_START + 1)
  return GACHA_BASE_RATES.red
}

/** 含软 / 硬保底的神品综合出率（%）= 1 / 期望抽数，按保底规则精确计算 */
export function gachaEffectiveRedRate(): number {
  let survive = 1
  let expected = 0
  for (let n = 1; n <= GACHA_HARD_PITY; n++) {
    const p = Math.min(1, redRateAt(n) / 100)
    expected += n * survive * p
    survive *= 1 - p
  }
  return 100 / expected
}

/** 抽卡配置自检：卡池里引用的 id 都必须存在 */
export function validateGachaData(): string[] {
  const errs: string[] = []
  const blueRate = 100 - GACHA_BASE_RATES.red - GACHA_BASE_RATES.orange - GACHA_BASE_RATES.purple
  if (blueRate <= 0) errs.push('抽卡：基础概率之和必须小于 100%')
  for (const [tier, entries] of Object.entries(GACHA_POOL)) {
    for (const e of entries) {
      if (e.weight <= 0) errs.push(`抽卡 ${tier}: 权重必须为正`)
      if (e.kind === 'COMPANION') {
        const c = COMPANIONS[e.id]
        if (!c) errs.push(`抽卡 ${tier}: 未知伙伴 ${e.id}`)
        else if (c.route === 'STORY' || c.route === 'TRIAL' || c.route === 'FAMILY') errs.push(`抽卡 ${tier}: 直接入队伙伴 ${c.name} 不应进入卡池`)
      }
      if (e.kind === 'SKILL' && !SKILLS[e.id]) errs.push(`抽卡 ${tier}: 未知武学 ${e.id}`)
      if (e.kind === 'ITEM' && !ITEMS[e.id]) errs.push(`抽卡 ${tier}: 未知装备 ${e.id}`)
      if (e.kind === 'TOKEN' && !COMPANIONS[e.id]?.awakened) errs.push(`抽卡 ${tier}: ${e.id} 无觉醒形态，不应产出其信物`)
    }
  }
  for (const [id, adv] of Object.entries(REUNION_AFTER)) {
    const c = COMPANIONS[id]
    if (!c || c.route !== 'STORY') errs.push(`重逢令：${id} 必须是剧情送伙伴`)
    if (!adv) errs.push(`重逢令：${id} 缺少触发支线`)
  }
  return errs
}

/**
 * 抽取：基础概率 + 软保底 + 硬保底 + 十连保底。
 * pity = 距上次神品已累计的抽数；返回本批结果与更新后的 pity。rng 可注入以便测试。
 */
export function rollGacha(params: { count: number; pity: number; pullsSoFar: number; rng?: () => number }): {
  draws: GachaDrawDTO[]
  pity: number
} {
  const rng = params.rng ?? Math.random
  let pity = params.pity
  const draws: GachaDrawDTO[] = []

  const pickEntry = (tier: GachaTier): GachaEntry => {
    const pool = GACHA_POOL[tier]
    let r = rng() * pool.reduce((s, e) => s + e.weight, 0)
    for (const e of pool) {
      r -= e.weight
      if (r < 0) return e
    }
    return pool[pool.length - 1]
  }
  const toDraw = (tier: GachaTier, e: GachaEntry, pullNo: number, pityTriggered: boolean): GachaDrawDTO => {
    const d: GachaDrawDTO = { pullNo, tier, kind: 'PILL', pityTriggered: pityTriggered || undefined }
    switch (e.kind) {
      case 'COMPANION':
        Object.assign(d, { kind: 'COMPANION', refId: e.id })
        if (tier === 'orange') d.grade = rng() * 100 < GACHA_ORANGE_TOP_GRADE_RATE ? '上' : '中'
        break
      case 'SKILL':
      case 'ITEM':
        Object.assign(d, { kind: e.kind, refId: e.id })
        break
      case 'TOKEN':
        Object.assign(d, { kind: 'TOKEN', refId: e.id, qty: e.qty })
        break
      case 'TOKEN_RANDOM':
        Object.assign(d, { kind: 'TOKEN', refId: AWAKENABLE_IDS[Math.floor(rng() * AWAKENABLE_IDS.length)], qty: e.qty })
        break
      default:
        Object.assign(d, { kind: e.kind, qty: e.qty })
    }
    return d
  }

  for (let i = 0; i < params.count; i++) {
    const n = pity + 1 // 本抽是距上次神品的第 n 抽
    const redRate = redRateAt(n)
    const roll = rng() * 100
    // 软保底抬高的红品概率从蓝档里扣，橙 / 紫概率不变
    const tier: GachaTier =
      roll < redRate ? 'red' : roll < redRate + GACHA_BASE_RATES.orange ? 'orange' : roll < redRate + GACHA_BASE_RATES.orange + GACHA_BASE_RATES.purple ? 'purple' : 'blue'
    const pityTriggered = tier === 'red' && n >= GACHA_SOFT_PITY_START
    pity = tier === 'red' ? 0 : pity + 1
    draws.push(toDraw(tier, pickEntry(tier), params.pullsSoFar + i + 1, pityTriggered))
  }

  // 十连保底：十抽中至少一个上品（紫）及以上，否则把最后一抽改为上品
  if (params.count >= 10 && draws.every((d) => d.tier === 'blue')) {
    const last = draws[draws.length - 1]
    draws[draws.length - 1] = toDraw('purple', pickEntry('purple'), last.pullNo, true)
  }
  return { draws, pity }
}

export const blankCompanionState = (id: string): CompanionState =>
  ({ affinity: 0, recruited: false, taught: false, met: false, form: 'base', grade: COMPANIONS[id]?.grade ?? null, tokens: 0 })

const GRADE_RANK = { 下: 1, 中: 2, 上: 3 } as const
const SKILL_SLOT_LABEL = { INNER: '内功', OUTER: '外功', LIGHT: '轻功', ULT: '绝技' } as const

export interface GachaTarget {
  player: Pick<PlayerDTO, 'silver' | 'qiExp' | 'battleMedicines' | 'goldIngot' | 'gacha'>
  companionAffinity: Record<string, CompanionState>
  learnedSkills: Record<string, number>
  ownedItemIds: string[]
  affinityCap: number
}

/** 本批结缘改动了哪些存档条目，服务端据此落库、本地据此自动上身 */
export interface GachaChanges {
  companions: Set<string>
  skills: Set<string>
  newSkills: string[]
  newItems: string[]
}

/** 结算一抽：新得入手 / 重复转化，直接改写存档并写回展示文案 */
export function applyGachaDraw(t: GachaTarget, d: GachaDrawDTO, changes: GachaChanges): GachaDrawDTO {
  const p = t.player
  const done = (detail: string, isNew: boolean) => Object.assign(d, { detail, isNew })
  switch (d.kind) {
    case 'COMPANION': {
      const id = d.refId!
      const cfg = COMPANIONS[id]
      const st = (t.companionAffinity[id] ??= blankCompanionState(id))
      st.tokens ??= 0
      changes.companions.add(id)
      if (!st.recruited) {
        st.met = true
        st.recruited = true
        st.affinity = Math.max(st.affinity, 100)
        // 神品档抽到“好感线”大侠：直接以觉醒形态入队（等于跳过免费线）
        if (d.tier === 'red' && cfg.awakened) st.form = 'awakened'
        if (d.grade) st.grade = d.grade
        const form = st.form === 'awakened' ? `觉醒形态「${cfg.awakened!.title}」` : '已入队'
        return done(`新结缘 · ${form}${d.grade ? ` · 橙·${d.grade}` : ''}`, true)
      }
      const tokens = GACHA_DUP_TOKENS[d.tier] ?? 10
      st.tokens += tokens
      const parts = [`重复 → 信物 ×${tokens}`]
      if (d.grade && (!st.grade || GRADE_RANK[d.grade] > GRADE_RANK[st.grade])) {
        st.grade = d.grade
        parts.push(`资质提升至「${d.grade}」`)
      }
      if (!cfg.awakened && st.affinity < t.affinityCap) {
        const gain = Math.min(60, t.affinityCap - st.affinity)
        st.affinity += gain
        parts.push(`好感 +${gain}`)
      }
      return done(parts.join('，'), false)
    }
    case 'SKILL': {
      const sk = SKILLS[d.refId!]
      const lv = t.learnedSkills[sk.id] ?? 0
      if (lv <= 0) {
        t.learnedSkills[sk.id] = 1
        changes.skills.add(sk.id)
        changes.newSkills.push(sk.id)
        return done(`习得${SKILL_SLOT_LABEL[sk.slot]}`, true)
      }
      if (lv < 10) {
        t.learnedSkills[sk.id] = lv + 1
        changes.skills.add(sk.id)
        return done(`已会 → 参悟至第 ${lv + 1} 重`, false)
      }
      p.silver += GACHA_DUP_SILVER[sk.tier]
      return done(`已臻圆满 → 纹银 +${GACHA_DUP_SILVER[sk.tier]}`, false)
    }
    case 'ITEM': {
      const it = ITEMS[d.refId!]
      if (!t.ownedItemIds.includes(it.id)) {
        t.ownedItemIds.push(it.id)
        changes.newItems.push(it.id)
        return done(`入手${EQUIP_SLOT_META[it.slot].label}`, true)
      }
      p.silver += GACHA_DUP_SILVER[it.tier]
      return done(`重复 → 纹银 +${GACHA_DUP_SILVER[it.tier]}`, false)
    }
    case 'TOKEN': {
      const id = d.refId!
      const st = (t.companionAffinity[id] ??= blankCompanionState(id))
      st.tokens = (st.tokens ?? 0) + (d.qty ?? 0)
      changes.companions.add(id)
      return done(`×${d.qty}（觉醒进阶用）`, false)
    }
    case 'PILL': {
      const stock = (p.battleMedicines ??= {})
      const qty = d.qty ?? 1
      stock.jiuhua_yulu_wan = (stock.jiuhua_yulu_wan ?? 0) + qty
      return done(`×${qty}（战斗保命）`, false)
    }
    case 'SILVER':
      p.silver += d.qty ?? 0
      return done(`+${(d.qty ?? 0).toLocaleString()} 两`, false)
    case 'QI':
      p.qiExp += d.qty ?? 0
      return done(`+${(d.qty ?? 0).toLocaleString()}`, false)
  }
}

/** 结缘一次（单抽或十连）：扣元宝、掷签、结算，返回结果与改动清单 */
export function pullGacha(t: GachaTarget, count: 1 | 10, rng = Math.random): { error: string } | { cost: number; draws: GachaDrawDTO[]; changes: GachaChanges } {
  const cost = count === 10 ? GACHA_TEN_COST : GACHA_SINGLE_COST
  if (t.player.goldIngot < cost) return { error: `元宝不足：结缘 ${count} 次需 ${cost} 元宝` }
  const state = t.player.gacha ?? { pulls: 0, pity: 0 }
  const { draws, pity } = rollGacha({ count, pity: state.pity, pullsSoFar: state.pulls, rng })
  t.player.goldIngot -= cost
  t.player.gacha = { pulls: state.pulls + count, pity }
  const changes: GachaChanges = { companions: new Set(), skills: new Set(), newSkills: [], newItems: [] }
  for (const draw of draws) applyGachaDraw(t, draw, changes)
  return { cost, draws, changes }
}

/** 觉醒所需好感：默认 600（生死之交），家人 300 */
export const awakenAffinityOf = (companion: { awakenAffinity?: number }) => companion.awakenAffinity ?? 600

/** 觉醒进阶：好感达标（一般是生死之交）+ 消耗伙伴信物，基础形态 → 觉醒形态（伙伴专题 §四） */
export function awakenCompanion(id: string, st: CompanionState | undefined): { error: string } | { title: string; spent: number } {
  const c = COMPANIONS[id]
  if (!c?.awakened || !st) return { error: '这位伙伴没有觉醒形态' }
  if (st.form === 'awakened') return { error: `【${c.name}】已是觉醒形态` }
  const affinity = awakenAffinityOf(c)
  if (!st.recruited || st.affinity < affinity) {
    return { error: affinity === 600 ? `觉醒需与【${c.name}】结为生死之交（好感 ≥ 600）` : `觉醒需【${c.name}】好感 ≥ ${affinity}` }
  }
  const need = c.awakenTokens ?? 30
  const have = st.tokens ?? 0
  if (have < need) return { error: `伙伴信物不足：需 ${need}，现有 ${have}` }
  st.tokens = have - need
  st.form = 'awakened'
  return { title: c.awakened.title, spent: need }
}
