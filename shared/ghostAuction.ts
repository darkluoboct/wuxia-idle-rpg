import type { PlayerDTO, TierColor } from './protocol.ts'
import { ITEMS, SKILLS } from './gameData.ts'
import { innVisitDay } from './player.ts'

/**
 * 子时鬼市压轴暗拍（08 册 §二、09 册 §六、11 册 §2.5）：全服每天竞拍同一件拍品。
 * 子时（23:00）开拍，次日 21:00 落槌。出价填心理价，元宝按心理价冻结，有人来压由鬼市替你逐口跟价，不必守在落槌前；
 * 被超过时原数退还，落槌按成交价结算、多冻的退还。
 */
export const AUCTION_BID_STEP = 50
/** 落槌前 5 分钟内有人出价，落槌顺延 5 分钟 */
export const AUCTION_SOFT_CLOSE_MS = 5 * 60_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

export interface AuctionLotConfig {
  itemId: string
  startPrice: number
  seller: string
}

/** 每日轮换的压轴拍品（元宝起拍） */
export const AUCTION_LOTS: AuctionLotConfig[] = [
  { itemId: 'lingbo_weibu', startPrice: 320, seller: '鬼市压轴官拍' },
  { itemId: 'jiuyin_zonggang', startPrice: 360, seller: '全真逆徒·匿名销赃' },
  { itemId: 'bihai_chaosheng', startPrice: 360, seller: '桃花岛哑仆' },
  { itemId: 'wumu_yishu', startPrice: 300, seller: '临安府库流出' },
  { itemId: 'kanglong_youhui', startPrice: 360, seller: '丐帮污衣叛徒' },
  { itemId: 'dagou_bangfa', startPrice: 200, seller: '君山流落长老' },
  { itemId: 'biyu_xiao', startPrice: 180, seller: '桃花岛弃徒' },
]

/** 鬼市日：与客栈、每日江湖事同以子时为界 */
export const auctionDay = innVisitDay

export function auctionWindow(day: number) {
  const opensAt = day * DAY - 9 * HOUR // 北京时间前一日 23:00
  return { opensAt, closesAt: opensAt + 22 * HOUR } // 当日 21:00
}

export function auctionLot(day: number): AuctionLotConfig {
  return AUCTION_LOTS[((day % AUCTION_LOTS.length) + AUCTION_LOTS.length) % AUCTION_LOTS.length]
}

export function auctionLotInfo(itemId: string): { name: string; tier: TierColor; desc: string; kind: 'SKILL' | 'ITEM' } {
  const skill = SKILLS[itemId]
  if (skill) return { name: `《${skill.name}》`, tier: skill.tier, desc: skill.desc ?? '', kind: 'SKILL' }
  const item = ITEMS[itemId]
  return { name: `【${item.name}】`, tier: item.tier, desc: item.desc ?? '', kind: 'ITEM' }
}

export function ownsAuctionLot(itemId: string, learnedSkills: Record<string, number>, ownedItemIds: readonly string[]) {
  return SKILLS[itemId] ? !!learnedSkills[itemId] : ownedItemIds.includes(itemId)
}

/** 下一口出价：无人出价时按起拍价，否则在最高价上加一档 */
export function nextAuctionBid(lot: { price: number; bids: number }) {
  return lot.bids ? lot.price + AUCTION_BID_STEP : lot.price
}

/** 一场暗拍的竞价状态：当前价、出价次数、领先者与他的心理价 */
export interface AuctionBidState {
  price: number
  bids: number
  leader: string | null
  leaderMax: number
}

export interface AuctionBidEntry {
  bidder: string
  amount: number
  /** 鬼市按心理价替他跟的一口 */
  proxy: boolean
}

/**
 * 代出价：出价时填心理价，按心理价全数冻结。有人来压，鬼市按每口 AUCTION_BID_STEP 替领先者跟到心理价为止：
 * 当前价 = 次高心理价再加一口，不超过最高心理价；心理价相同先到者领先。领先者可以加码心理价，当前价不变。
 * charge 是出价人这回要冻结的元宝；refund 是被压过的前一位领先者原数退还的元宝。
 */
export function placeAuctionBid(lot: AuctionBidState, bidder: string, maxPrice: number):
  | { error: string }
  | { lot: AuctionBidState; charge: number; refund?: { to: string; ingot: number }; entries: AuctionBidEntry[] } {
  if (!Number.isInteger(maxPrice)) return { error: '心理价要填整数元宝' }
  if (lot.leader === bidder) {
    const least = lot.leaderMax + AUCTION_BID_STEP
    if (maxPrice < least) return { error: `加码至少要到 ${least} 元宝` }
    return { lot: { ...lot, leaderMax: maxPrice }, charge: maxPrice - lot.leaderMax, entries: [] }
  }
  const least = nextAuctionBid(lot)
  if (maxPrice < least) return { error: `心理价至少 ${least} 元宝` }
  if (!lot.leader) {
    return { lot: { price: least, bids: lot.bids + 1, leader: bidder, leaderMax: maxPrice }, charge: maxPrice, entries: [{ bidder, amount: least, proxy: false }] }
  }
  if (maxPrice > lot.leaderMax) {
    const price = Math.min(maxPrice, lot.leaderMax + AUCTION_BID_STEP)
    const entries = [...lot.leaderMax > lot.price ? [{ bidder: lot.leader, amount: lot.leaderMax, proxy: true }] : [], { bidder, amount: price, proxy: false }]
    return {
      lot: { price, bids: lot.bids + entries.length, leader: bidder, leaderMax: maxPrice },
      charge: maxPrice, refund: { to: lot.leader, ingot: lot.leaderMax }, entries,
    }
  }
  // 没压过：领先者的心理价替他跟上一口
  const price = Math.min(lot.leaderMax, maxPrice + AUCTION_BID_STEP)
  return {
    lot: { ...lot, price, bids: lot.bids + 2 }, charge: 0,
    entries: [{ bidder, amount: maxPrice, proxy: false }, { bidder: lot.leader, amount: price, proxy: true }],
  }
}

export function softCloseAt(closesAt: number, now: number) {
  return closesAt - now < AUCTION_SOFT_CLOSE_MS ? now + AUCTION_SOFT_CLOSE_MS : closesAt
}

/**
 * 落槌红封（09 册 §六）：成交价三成分给当日领过每日江湖事的侠客，其余七成回收。
 * 当日什么时辰领都算，所以等鬼市日过完（子时）才数人头开签。
 * 人头平分，每人至多 30 元宝；人多到每份不足 10 元宝时改为抽签，中签者每人至少 10。
 */
export const AUCTION_DIVIDEND = { percent: 30, minShare: 10, maxShare: 30 } as const

export function auctionDividend(price: number, eligible: number) {
  const pool = Math.floor(price * AUCTION_DIVIDEND.percent / 100)
  const winners = Math.min(eligible, Math.floor(pool / AUCTION_DIVIDEND.minShare))
  return { pool, winners, share: winners ? Math.min(AUCTION_DIVIDEND.maxShare, Math.floor(pool / winners)) : 0 }
}

/** 红封开签：这一鬼市日过完的子时（落槌顺延过了子时就等落槌） */
export const auctionDividendAt = (day: number) => auctionWindow(day + 1).opensAt

export interface AuctionTicketLot {
  price: number
  bids: number
  closesAt: number
  /** 当日持签人数 */
  eligible: number
  /** 自己在抽签次序里的名次，从 0 起 */
  rank: number
}

/**
 * 兑付到期的红封签：子时开签，流拍的作废，仍在顺延的留到落槌后。返回本次兑付的场次与到手元宝（未中签为 0）。
 * 元宝直接记到 player 上，调用方负责写流水。
 */
export function settleAuctionTickets(
  player: Pick<PlayerDTO, 'auctionTickets' | 'auctionDividend' | 'goldIngot'>, now: number,
  lotOf: (day: number) => AuctionTicketLot | undefined,
) {
  const settled: { day: number; ingot: number }[] = []
  const keep: number[] = []
  for (const day of player.auctionTickets ?? []) {
    const due = now >= auctionDividendAt(day)
    const lot = due ? lotOf(day) : undefined
    if (!due || (lot && now < lot.closesAt)) {
      keep.push(day)
      continue
    }
    if (!lot?.bids) continue
    const { winners, share } = auctionDividend(lot.price, lot.eligible)
    const ingot = lot.rank < winners ? share : 0
    player.goldIngot += ingot
    player.auctionDividend = { day, ingot }
    settled.push({ day, ingot })
  }
  if (keep.length !== (player.auctionTickets?.length ?? 0)) player.auctionTickets = keep
  return settled
}

const STEMS = '甲乙丙丁戊己庚辛壬癸'
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥'
/** 六十甲子 */
export const AUCTION_MASK_COUNT = 60

/** 六十甲子里的第 index 个名字，鬼市里用来给蒙面人起代号 */
export function jiaziName(index: number) {
  const n = ((index % AUCTION_MASK_COUNT) + AUCTION_MASK_COUNT) % AUCTION_MASK_COUNT
  return `${STEMS[n % 10]}${BRANCHES[n % 12]}`
}

/** 出价人代号：服务端按每场的随机盐把角色映射到六十甲子之一，前端只见代号 */
export function bidderMask(index: number) {
  return `蒙面客·${jiaziName(index)}`
}
