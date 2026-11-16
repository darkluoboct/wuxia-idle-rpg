import type { PlayerDTO, TierColor } from './protocol.ts'
import { ITEMS, SKILLS } from './gameData.ts'
import { innVisitDay } from './player.ts'

/**
 * 子时鬼市压轴暗拍（08 册 §二、09 册 §六、11 册 §2.5）：全服每天竞拍同一件拍品。
 * 子时（23:00）开拍，次日 21:00 落槌；领先者的元宝先冻结，被超过时原数退还。
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

export function softCloseAt(closesAt: number, now: number) {
  return closesAt - now < AUCTION_SOFT_CLOSE_MS ? now + AUCTION_SOFT_CLOSE_MS : closesAt
}

/**
 * 落槌红封（09 册 §六）：成交价三成分给当日 21:00 前领过每日江湖事的侠客，其余七成回收。
 * 人头平分，每人至多 30 元宝；人多到每份不足 10 元宝时改为抽签，中签者每人至少 10。
 */
export const AUCTION_DIVIDEND = { percent: 30, minShare: 10, maxShare: 30 } as const

export function auctionDividend(price: number, eligible: number) {
  const pool = Math.floor(price * AUCTION_DIVIDEND.percent / 100)
  const winners = Math.min(eligible, Math.floor(pool / AUCTION_DIVIDEND.minShare))
  return { pool, winners, share: winners ? Math.min(AUCTION_DIVIDEND.maxShare, Math.floor(pool / winners)) : 0 }
}

/** 领每日江湖事时是否还赶得上当晚的红封：以 21:00 为准，不随顺延变化，落槌后人数即定 */
export function earnsAuctionTicket(day: number, now: number) {
  return now < auctionWindow(day).closesAt
}

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
 * 兑付到期的红封签：流拍的作废，仍在顺延的留到落槌后。返回本次兑付的场次与到手元宝（未中签为 0）。
 * 元宝直接记到 player 上，调用方负责写流水。
 */
export function settleAuctionTickets(
  player: Pick<PlayerDTO, 'auctionTickets' | 'auctionDividend' | 'goldIngot'>, now: number,
  lotOf: (day: number) => AuctionTicketLot | undefined,
) {
  const settled: { day: number; ingot: number }[] = []
  const keep: number[] = []
  for (const day of player.auctionTickets ?? []) {
    const due = now >= auctionWindow(day).closesAt
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

/** 出价人代号：服务端按每场的随机盐把角色映射到六十甲子之一，前端只见代号 */
export function bidderMask(index: number) {
  const n = ((index % AUCTION_MASK_COUNT) + AUCTION_MASK_COUNT) % AUCTION_MASK_COUNT
  return `蒙面客·${STEMS[n % 10]}${BRANCHES[n % 12]}`
}
