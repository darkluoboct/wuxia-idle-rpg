import type { PlayerDTO, TierColor } from './protocol.ts'
import { HERBS, SKILLS, type HerbConfig } from './gameData.ts'
import { jiaziName } from './ghostAuction.ts'
import { innVisitDay } from './player.ts'

/**
 * 子时鬼市蒙面摊位（09 册 §六）：侠客之间用纹银买卖草药与武学残页，买卖双方都只见代号。
 * 货物上架即由鬼市代管；装备、武功、元宝都不能交易。
 */
export const STALL = {
  /** 摆摊与采买的最低等级，挡住刚建的小号 */
  minLevel: 10,
  maxOpen: 5,
  maxQty: 99,
  durationMs: 24 * 3_600_000,
  /** 摆摊费：按标价总额收取，上架时付，不退 */
  feePercent: 2,
  /** 成交抽成：从卖家所得里扣 */
  taxPercent: 10,
  /** 单价只能定在参考价的这个范围内，挡住贱卖输送与天价洗钱 */
  minPricePercent: 50,
  maxPricePercent: 200,
} as const

export type StallGoodsKind = 'HERB' | 'FRAGMENT'

const HERB_PRICE: Record<HerbConfig['rarity'], number> = { COMMON: 20, UNCOMMON: 50, RARE: 160, EPIC: 500, LEGENDARY: 1500 }
const FRAGMENT_PRICE: Record<TierColor, number> = { green: 80, blue: 160, purple: 400, orange: 1200, red: 3000 }

export interface StallGoods {
  kind: StallGoodsKind
  id: string
  name: string
  tier: TierColor
  refPrice: number
  minPrice: number
  maxPrice: number
}

/** 可上架的货物与它的参考价；不可交易的返回 undefined */
export function stallGoods(kind: unknown, id: unknown): StallGoods | undefined {
  if (typeof id !== 'string') return
  let found: Pick<StallGoods, 'name' | 'tier' | 'refPrice'> | undefined
  if (kind === 'HERB' && Object.hasOwn(HERBS, id)) {
    found = { name: HERBS[id].name, tier: HERBS[id].tier, refPrice: HERB_PRICE[HERBS[id].rarity] }
  } else if (kind === 'FRAGMENT' && Object.hasOwn(SKILLS, id)) {
    found = { name: `《${SKILLS[id].name}》残页`, tier: SKILLS[id].tier, refPrice: FRAGMENT_PRICE[SKILLS[id].tier] }
  }
  return found && {
    ...found, kind: kind as StallGoodsKind, id,
    minPrice: Math.ceil(found.refPrice * STALL.minPricePercent / 100), maxPrice: Math.floor(found.refPrice * STALL.maxPricePercent / 100),
  }
}

/** 背包里能交易的两类东西：联机在存档里，本地试玩的草药另有一处 */
export interface StallInventory {
  herbs: Record<string, number>
  fragments: Record<string, number>
}

export function stallInventory(player: Pick<PlayerDTO, 'alchemy' | 'skillFragments'>): StallInventory {
  return { herbs: (player.alchemy ??= { herbs: {}, pity: {}, residue: 0 }).herbs, fragments: player.skillFragments ??= {} }
}

const shelf = (inventory: StallInventory, kind: StallGoodsKind) => kind === 'HERB' ? inventory.herbs : inventory.fragments

export function stallStock(inventory: StallInventory, kind: StallGoodsKind, id: string) {
  return shelf(inventory, kind)[id] ?? 0
}

export function moveStallGoods(inventory: StallInventory, kind: StallGoodsKind, id: string, delta: number) {
  const goods = shelf(inventory, kind)
  const left = (goods[id] ?? 0) + delta
  if (left > 0) goods[id] = left
  else delete goods[id]
}

export function stallFee(total: number) {
  return Math.max(1, Math.ceil(total * STALL.feePercent / 100))
}

export function stallTax(total: number) {
  return Math.floor(total * STALL.taxPercent / 100)
}

export interface StallOffer {
  kind: StallGoodsKind
  goodsId: string
  qty: number
  unitPrice: number
}

/** 上架前的检查；通过时返回货物与摆摊费 */
export function checkStallOffer(seller: { level: number; silver: number; openCount: number; inventory: StallInventory }, offer: Record<string, unknown>):
  { error: string } | { goods: StallGoods; qty: number; unitPrice: number; fee: number } {
  const goods = stallGoods(offer.kind, offer.goodsId)
  const { qty, unitPrice } = offer
  if (!goods) return { error: '这样东西不能在鬼市摆卖' }
  if (seller.level < STALL.minLevel) return { error: `等级达到 ${STALL.minLevel} 级才能在鬼市摆摊` }
  if (seller.openCount >= STALL.maxOpen) return { error: `最多同时摆 ${STALL.maxOpen} 个摊位` }
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > STALL.maxQty) return { error: `每摊数量须在 1~${STALL.maxQty} 之间` }
  if (stallStock(seller.inventory, goods.kind, goods.id) < qty) return { error: `${goods.name}不够 ${qty} 份` }
  if (typeof unitPrice !== 'number' || !Number.isInteger(unitPrice) || unitPrice < goods.minPrice || unitPrice > goods.maxPrice) {
    return { error: `${goods.name}的单价须在 ${goods.minPrice}~${goods.maxPrice} 两之间` }
  }
  const fee = stallFee(qty * unitPrice)
  if (seller.silver < fee) return { error: `摆摊费要 ${fee} 两纹银` }
  return { goods, qty, unitPrice, fee }
}

/** 摊主代号：每个摊位各起一个，同一位摊主的几个摊位互不相认 */
export function stallMask(index: number) {
  return `蒙面摊主·${jiaziName(index)}`
}

// ───────────────────────── 鬼市散客摊 ─────────────────────────
/** 鬼市日：与暗拍、每日江湖事同以子时为界 */
export const stallDay = innVisitDay

export const SYSTEM_STALL_SELLER = '鬼市散客'

const byRarity = (rarity: HerbConfig['rarity']) => Object.values(HERBS).filter((herb) => herb.rarity === rarity).map(({ id }) => id)
const SYSTEM_SHELVES = [
  { ids: byRarity('COMMON'), qty: 5 },
  { ids: byRarity('UNCOMMON'), qty: 3 },
  { ids: byRarity('RARE'), qty: 1 },
]

/**
 * 每个鬼市日三摊散客货：常见、少见、稀有草药各一种，按参考价上限出售，每人每摊每天限买一次。
 * 人少时也有货可买，同时给玩家摊位的价格封了顶。
 */
export function systemStalls(day: number) {
  return SYSTEM_SHELVES.map(({ ids, qty }) => {
    const goods = stallGoods('HERB', ids[((day % ids.length) + ids.length) % ids.length])!
    return { id: `sys:${day}:${goods.id}`, goods, qty, unitPrice: goods.maxPrice }
  })
}

export function systemStallsBought(player: Pick<PlayerDTO, 'stallSystem'>, now: number) {
  return player.stallSystem?.day === stallDay(now) ? player.stallSystem.bought : []
}

/** 买下一摊散客货：整摊买走 */
export function buySystemStall(player: Pick<PlayerDTO, 'level' | 'silver' | 'stallSystem'>, inventory: StallInventory, id: unknown, now: number):
  { error: string } | { goods: StallGoods; qty: number; spent: number } {
  const day = stallDay(now)
  const stall = systemStalls(day).find((entry) => entry.id === id)
  if (!stall) return { error: '这摊散客货已经收摊，请刷新' }
  if (player.level < STALL.minLevel) return { error: `等级达到 ${STALL.minLevel} 级才能在鬼市采买` }
  const bought = systemStallsBought(player, now)
  if (bought.includes(stall.id)) return { error: '这摊散客货你今天已经买过' }
  const spent = stall.qty * stall.unitPrice
  if (player.silver < spent) return { error: '纹银不足' }
  player.silver -= spent
  player.stallSystem = { day, bought: [...bought, stall.id] }
  moveStallGoods(inventory, 'HERB', stall.goods.id, stall.qty)
  return { goods: stall.goods, qty: stall.qty, spent }
}
