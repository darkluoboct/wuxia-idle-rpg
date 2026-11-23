import { forgeMaterials } from './equipmentForge.ts'
import { HERBS, MEDICINES, SECTS, SKILLS, type SectConfig } from './gameData.ts'
import type { PlayerDTO, TierColor } from './protocol.ts'
import { sectContestEndsAt, sectContestWeek } from './sectProgress.ts'

/**
 * 师门宝库（docs/29）：拿门派贡献换丹药、药材、锻材和本门武学残页。
 * 每样东西每周限兑几份，与门派演武同一周（周六 20:00 补货）；有的要升到某一阶才换得到。
 * 离开师门贡献清零，所以宝库里的东西是给留在师门里的人的。
 */

export type SectGoodGrant =
  | { kind: 'PILL' | 'MEDICINE' | 'HERB' | 'FRAGMENT'; id: string }
  | { kind: 'FORGE' }

export interface SectGood {
  id: string
  name: string
  tier: TierColor
  desc: string
  price: number
  weeklyLimit: number
  minRank: number
  grant: SectGoodGrant
}

export interface SectTreasury {
  name: string
  note: string
  goods: readonly SectGood[]
}

function medicine(id: string, price: number, weeklyLimit: number, minRank: number): SectGood {
  const { name, tier, effectDesc, category } = MEDICINES[id]
  return { id, name, tier, desc: effectDesc, price, weeklyLimit, minRank, grant: { kind: category === 'ACUPOINT_PILL' ? 'PILL' : 'MEDICINE', id } }
}

function herb(id: string, price: number, weeklyLimit: number, minRank: number): SectGood {
  const { name, tier, desc } = HERBS[id]
  return { id, name, tier, desc, price, weeklyLimit, minRank, grant: { kind: 'HERB', id } }
}

const forge = (price: number, weeklyLimit: number, minRank: number): SectGood => ({
  id: 'forge', name: '百炼玄铁 · 淬火石', tier: 'blue', desc: '各 1 份。淬火、重铸兵刃要用。',
  price, weeklyLimit, minRank, grant: { kind: 'FORGE' },
})

/** 各派丹房都备着的冲穴、突破丹药 */
const COMMON_GOODS: readonly SectGood[] = [
  medicine('tongmai_dan', 180, 3, 1),
  medicine('bingpo_huxin_dan', 500, 1, 2),
  medicine('pozhang_dan', 800, 1, 3),
]

const treasury = (name: string, note: string, goods: readonly SectGood[]): SectTreasury => ({ name, note, goods: [...goods, ...COMMON_GOODS] })

export const SECT_TREASURIES: Record<string, SectTreasury> = {
  jiangnan_wuguan: treasury('武馆账房', '武馆家底薄，东西不多，胜在实在。', [
    medicine('tongling_huayu_san', 120, 2, 1),
    forge(150, 2, 2),
  ]),
  gaibang: treasury('总舵库房', '帮里化来的药材和跌打药，按功劳分给兄弟们。', [
    medicine('tongling_huayu_san', 100, 3, 1),
    herb('heding_lu', 40, 5, 1),
  ]),
  quanzhen: treasury('重阳宫丹房', '丹房按功劳配给丹药，三代精锐另有纯阳金丹。', [
    herb('fuling', 40, 5, 1),
    herb('chunyang_zhi', 260, 1, 2),
    medicine('chunyang_jindan', 220, 2, 3),
  ]),
  taohua: treasury('桃花岛药房', '岛主亲手定的方子，哑仆照方抓药，一样也不会多给。', [
    herb('heding_lu', 40, 5, 1),
    herb('xuelian_hua', 180, 1, 2),
    medicine('jiuhua_yulu_wan', 450, 1, 3),
  ]),
  baituo: treasury('白驼山毒窟', '蛇涎、蛇胆和见血膏，都是庄里自己熬的。', [
    herb('shexian_cao', 40, 5, 1),
    medicine('baituo_fushe_gao', 200, 2, 2),
    herb('qushe_dan', 280, 1, 3),
  ]),
  tiezhang: treasury('铁掌峰兵器房', '玄铁和淬火石管够，跌打药也备着——练铁砂掌少不了它。', [
    forge(120, 5, 1),
    medicine('tongling_huayu_san', 120, 2, 1),
  ]),
  yideng: treasury('一灯居药圃', '大师亲手种的药草，只换给用得着的人。', [
    medicine('tongling_huayu_san', 100, 3, 1),
    herb('heshouwu', 150, 2, 1),
    herb('xuelian_hua', 180, 1, 2),
  ]),
}

/** 本门武学残页：参悟时抵扣真气，按武学品阶定价 */
const FRAGMENT_PRICE: Record<TierColor, number> = { green: 10, blue: 20, purple: 40, orange: 80, red: 150 }
const FRAGMENT_WEEKLY = 10
export const fragmentGoodId = (skillId: string) => `fragment:${skillId}`

/** 已学会的本门传承武学，每门一份残页货 */
export function sectFragmentGoods(sect: SectConfig, learnedSkills: Readonly<Record<string, number>>): SectGood[] {
  return [...new Set(sect.signatureSkills.flat())].filter((id) => SKILLS[id] && learnedSkills[id]).map((id) => {
    const { name, tier } = SKILLS[id]
    return {
      id: fragmentGoodId(id), name: `《${name}》残页`, tier, desc: '参悟这门武学时，可用残页抵扣真气。',
      price: FRAGMENT_PRICE[tier], weeklyLimit: FRAGMENT_WEEKLY, minRank: 1, grant: { kind: 'FRAGMENT', id },
    }
  })
}

export function sectGoods(sect: SectConfig, learnedSkills: Readonly<Record<string, number>>) {
  return [...(SECT_TREASURIES[sect.id]?.goods ?? COMMON_GOODS), ...sectFragmentGoods(sect, learnedSkills)]
}

/** 本周已兑换的份数 */
export function sectGoodBought(player: Pick<PlayerDTO, 'sectExchange'>, goodId: string, now: number) {
  const state = player.sectExchange
  return state?.week === sectContestWeek(now) ? state.bought[goodId] ?? 0 : 0
}

/** 下次补货的时刻 */
export const sectExchangeRestockAt = (now: number) => sectContestEndsAt(sectContestWeek(now))

/** 各样东西放进哪个背包 */
export interface SectStock {
  pills: Record<string, number>
  medicines: Record<string, number>
  herbs: Record<string, number>
  fragments: Record<string, number>
}

export function sectGoodBlockReason(player: Pick<PlayerDTO, 'sectRank' | 'sectContribution' | 'sectExchange'>, good: SectGood, count: number, now: number) {
  if (player.sectRank < good.minRank) return `升到第 ${good.minRank} 阶才能兑换${good.name}`
  const left = good.weeklyLimit - sectGoodBought(player, good.id, now)
  if (left <= 0) return `${good.name}本周已兑完，周六 20:00 补货`
  if (count > left) return `${good.name}本周还能兑换 ${left} 份`
  const price = good.price * count
  if (player.sectContribution < price) return `门派贡献不够：需要 ${price}，现有 ${player.sectContribution}`
}

/** 兑换：扣贡献、记本周份数、东西放进背包。服务端与试玩共用 */
export function buySectGood(
  player: PlayerDTO, stock: SectStock, learnedSkills: Readonly<Record<string, number>>, goodId: unknown, count: unknown, now: number,
): { error: string } | { good: SectGood; count: number; price: number } {
  const sect = SECTS.find(({ id }) => id === player.currentSectId)
  if (!sect) return { error: '拜入师门后才能用师门宝库' }
  const good = sectGoods(sect, learnedSkills).find(({ id }) => id === goodId)
  if (!good) return { error: '宝库里没有这样东西' }
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > good.weeklyLimit) return { error: '请选择要兑换的份数' }
  const blocked = sectGoodBlockReason(player, good, count, now)
  if (blocked) return { error: blocked }
  const price = good.price * count
  const week = sectContestWeek(now)
  const bought = player.sectExchange?.week === week ? player.sectExchange.bought : {}
  player.sectExchange = { week, bought: { ...bought, [good.id]: (bought[good.id] ?? 0) + count } }
  player.sectContribution -= price
  const { grant } = good
  if (grant.kind === 'FORGE') forgeMaterials(player, count, count)
  else {
    const bag = grant.kind === 'PILL' ? stock.pills : grant.kind === 'MEDICINE' ? stock.medicines : grant.kind === 'HERB' ? stock.herbs : stock.fragments
    bag[grant.id] = (bag[grant.id] ?? 0) + count
  }
  return { good, count, price }
}
