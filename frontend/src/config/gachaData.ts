import type { TierColor } from './typesHelper'
import { COMPANIONS, ITEMS, SKILLS } from './gameData'
import { REUNION_QUESTS } from './questData'

/**
 * 客栈「醉仙楼·结缘」抽卡配置（第 12 册 §七、§八）。
 * 概率、保底与卡池内容在此集中定义，界面的「概率公示」直接读取这里，保证公示与实际一致。
 * 真实环境中抽取结果由服务端权威产出；前端 Demo 由 mockEngine.rollGacha 模拟。
 */

export const GACHA_SINGLE_COST = 100 // 元宝
export const GACHA_TEN_COST = 950
/** 各档基础概率（%），余下为蓝及以下 */
export const GACHA_BASE_RATES = { red: 1.5, orange: 8, purple: 30 } as const
/** 软保底：自第 60 抽起红品概率每抽 +5%；第 80 抽必出红品 */
export const GACHA_SOFT_PITY_START = 60
export const GACHA_SOFT_PITY_STEP = 5
export const GACHA_HARD_PITY = 80
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
    S('kanglong_youhui', 8), S('bihai_chaosheng', 8), S('jiuyin_zonggang', 8),
    I('ruanwei_armor', 8), I('wumu_yishu', 8),
  ],
  orange: [
    C('qiuchuji', 8), C('qiuqianren', 8), C('yangkang', 8), C('yinggu', 8), C('zhebie', 8), C('lingzhi', 8),
    S('dagou_bangfa', 4), S('kongming_quan', 4), S('shuangshou_hubo', 4), S('tanzhi_shentong', 4), S('xiantian_gong', 4), S('dashouyin', 4),
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
export const AWAKENABLE_IDS = Object.values(COMPANIONS).filter((c) => !!c.awakened).map((c) => c.id)

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

/** 含软 / 硬保底的神品综合出率（%）= 1 / 期望抽数，按保底规则精确计算 */
export function gachaEffectiveRedRate(): number {
  let survive = 1
  let expected = 0
  for (let n = 1; n <= GACHA_HARD_PITY; n++) {
    const rate =
      n >= GACHA_HARD_PITY ? 100 : n >= GACHA_SOFT_PITY_START ? GACHA_BASE_RATES.red + GACHA_SOFT_PITY_STEP * (n - GACHA_SOFT_PITY_START + 1) : GACHA_BASE_RATES.red
    const p = Math.min(1, rate / 100)
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
        else if (c.route === 'STORY' || c.route === 'TRIAL') errs.push(`抽卡 ${tier}: 直接入队伙伴 ${c.name} 不应进入卡池`)
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
 * 美术 / 音效素材位：当前全部留空，组件会退回纯 SVG / 无声。
 * 拿到素材后把路径填进来（放在 public/ 下，例如 '/gacha/tube.png'）即可生效。
 */
export const GACHA_ASSETS = {
  background: null as string | null, // 醉仙楼雅间背景（横版，≥1920×1080）
  tube: null as string | null, // 签筒（透明底，竖版）
  stick: null as string | null, // 竹签（透明底，细长竖版）
  cardFrame: null as string | null, // 绢本卷轴卡框（透明中心）
  cardBack: null as string | null, // 十连卡背（水墨“缘”字）
  inkSplash: null as string | null, // 神品揭晓时的泼墨序列帧 / 透明 PNG
  portraits: {} as Record<string, string>, // 伙伴立绘：id → 路径（缺省用 InkFigure）
  sfx: {
    shake: null as string | null, // 摇签筒
    draw: null as string | null, // 出签
    reveal: null as string | null, // 普通揭晓（翻卷）
    revealRare: null as string | null, // 绝品 / 神品揭晓（磬声）
    stamp: null as string | null, // 落印
  },
}
