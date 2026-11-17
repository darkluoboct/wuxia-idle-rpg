import { describe, expect, it, vi } from 'vitest'
import { SKILLS } from '@/config/gameData'
import { claimDailyIngot, DAILY_TASKS, INGOT } from '../../shared/economy.ts'
import { AUCTION_BID_STEP, AUCTION_MASK_COUNT, AUCTION_SOFT_CLOSE_MS, auctionDay, auctionDividend, auctionDividendAt, auctionLot, auctionWindow, bidderMask, placeAuctionBid } from '../../shared/ghostAuction.ts'
import { newStore } from './helpers'

const BEIJING = 8 * 3_600_000
const noon = Date.UTC(2026, 10, 16, 4) // 北京时间 11 月 16 日正午

describe('子时鬼市压轴暗拍', () => {
  it('子时开拍、次日 21:00 落槌，落槌后到子时公示并开红封签；拍品七日一轮，代号取自六十甲子', () => {
    const day = auctionDay(noon)
    const { opensAt, closesAt } = auctionWindow(day)
    expect(new Date(opensAt + BEIJING).toISOString()).toBe('2026-11-15T23:00:00.000Z')
    expect(new Date(closesAt + BEIJING).toISOString()).toBe('2026-11-16T21:00:00.000Z')
    expect(new Date(auctionDividendAt(day) + BEIJING).toISOString()).toBe('2026-11-16T23:00:00.000Z')
    expect(auctionDay(closesAt + 3_600_000)).toBe(day)
    expect(auctionDay(closesAt + 2 * 3_600_000)).toBe(day + 1)
    expect(auctionLot(day + 7)).toEqual(auctionLot(day))
    expect(new Set(Array.from({ length: AUCTION_MASK_COUNT }, (_, i) => bidderMask(i))).size).toBe(AUCTION_MASK_COUNT)
  })

  it('代出价：心理价全数冻结，鬼市按每口替领先者跟到心理价为止；相同心理价先到者领先', () => {
    const empty = { price: 300, bids: 0, leader: null, leaderMax: 300 }
    expect(placeAuctionBid(empty, 'a', 250)).toEqual({ error: '心理价至少 300 元宝' })
    expect(placeAuctionBid(empty, 'a', 300.5)).toEqual({ error: '心理价要填整数元宝' })
    const first = placeAuctionBid(empty, 'a', 600)
    expect(first).toMatchObject({ lot: { price: 300, bids: 1, leader: 'a', leaderMax: 600 }, charge: 600 })
    if ('error' in first) throw new Error(first.error)
    // b 心理价 400 没压过：a 的代出价跟到 450，b 不冻结元宝
    const lower = placeAuctionBid(first.lot, 'b', 400)
    expect(lower).toEqual({
      lot: { price: 450, bids: 3, leader: 'a', leaderMax: 600 }, charge: 0,
      entries: [{ bidder: 'b', amount: 400, proxy: false }, { bidder: 'a', amount: 450, proxy: true }],
    })
    if ('error' in lower) throw new Error(lower.error)
    expect(placeAuctionBid(lower.lot, 'b', 600)).toMatchObject({ lot: { price: 600, leader: 'a' }, charge: 0 })
    // c 心理价 900 压过：当前价为 a 的心理价再加一口，a 冻结的 600 原数退还
    const higher = placeAuctionBid(lower.lot, 'c', 900)
    expect(higher).toEqual({
      lot: { price: 600 + AUCTION_BID_STEP, bids: 5, leader: 'c', leaderMax: 900 }, charge: 900, refund: { to: 'a', ingot: 600 },
      entries: [{ bidder: 'a', amount: 600, proxy: true }, { bidder: 'c', amount: 650, proxy: false }],
    })
    if ('error' in higher) throw new Error(higher.error)
    // 领先者加码：只冻结差额，当前价不动
    expect(placeAuctionBid(higher.lot, 'c', 920)).toEqual({ error: `加码至少要到 ${900 + AUCTION_BID_STEP} 元宝` })
    expect(placeAuctionBid(higher.lot, 'c', 1_000)).toEqual({ lot: { ...higher.lot, leaderMax: 1_000 }, charge: 100, entries: [] })
  })

  it('本地试玩与联机同一套规则：心理价先冻结，领先时再出价即加码，落槌按成交价结算、多冻的退还', async () => {
    let now = noon
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const s = newStore('NEW')
    s.player.goldIngot = 1_000
    await s.refreshAuction()
    const { day } = s.auctionBoard!.lot
    const { itemId, startPrice } = auctionLot(day)
    const owns = () => (SKILLS[itemId] ? !!s.learnedSkills[itemId] : s.ownedItemIds.includes(itemId))
    expect(s.auctionBoard!.lot).toMatchObject({ itemId, nextBid: startPrice, leading: false, leaderMasked: null })

    await s.bidAuction(startPrice + 100)
    expect(s.player.goldIngot).toBe(1_000 - startPrice - 100)
    expect(s.auctionBoard!.lot).toMatchObject({ price: startPrice, leading: true, leaderMasked: '你', bids: 1, myMax: startPrice + 100 })
    await s.bidAuction(startPrice + 120)
    expect(s.player.goldIngot).toBe(1_000 - startPrice - 100)
    await s.bidAuction(startPrice + 200)
    expect(s.player.goldIngot).toBe(1_000 - startPrice - 200)
    expect(s.auctionBoard!.lot).toMatchObject({ price: startPrice, bids: 1, myMax: startPrice + 200 })
    await s.claimAuction(day)
    expect(owns()).toBe(false)

    now = auctionWindow(day).closesAt
    await s.refreshAuction()
    expect(s.auctionBoard!.wins).toEqual([{ day, itemId, price: startPrice }])
    await s.claimAuction(day)
    expect(owns()).toBe(true)
    expect(s.auctionBoard!.wins).toEqual([])
    expect(s.player.goldIngot).toBe(1_000 - startPrice)
  })

  it('落槌前 5 分钟内出价，落槌顺延 5 分钟；领先者加码不顺延', async () => {
    const day = auctionDay(noon)
    let now = auctionWindow(day).closesAt - 60_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const s = newStore('NEW')
    s.player.goldIngot = 1_000
    await s.refreshAuction()
    const { startPrice } = auctionLot(day)
    await s.bidAuction(startPrice)
    const extended = now + AUCTION_SOFT_CLOSE_MS
    expect(s.auctionBoard!.lot.closesAt).toBe(extended)
    now += 60_000
    await s.bidAuction(startPrice + AUCTION_BID_STEP)
    expect(s.auctionBoard!.lot).toMatchObject({ closesAt: extended, myMax: startPrice + AUCTION_BID_STEP })
  })

  it('红封：成交价三成按人头平分，每人至多 30；每份不足 10 元宝时改抽签', () => {
    expect(auctionDividend(180, 0)).toEqual({ pool: 54, winners: 0, share: 0 })
    expect(auctionDividend(180, 1)).toEqual({ pool: 54, winners: 1, share: 30 })
    expect(auctionDividend(180, 3)).toEqual({ pool: 54, winners: 3, share: 18 })
    expect(auctionDividend(180, 6)).toEqual({ pool: 54, winners: 5, share: 10 })
    expect(auctionDividend(410, 100)).toEqual({ pool: 123, winners: 12, share: 10 })
  })

  it('本地红封：当日什么时辰领每日江湖事都得签，子时开签到账；流拍作废', async () => {
    let now = noon
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const s = newStore('NEW')
    s.player.goldIngot = 1_000
    const finishDaily = () => { s.player.daily = { day: auctionDay(now), done: DAILY_TASKS.map(({ id }) => id), claimed: false } }
    const day = auctionDay(now)
    const { startPrice } = auctionLot(day)

    await s.refreshAuction()
    await s.bidAuction(startPrice)
    // 落槌之后才领每日江湖事，照样持签
    now = auctionWindow(day).closesAt + 30 * 60_000
    finishDaily()
    await s.claimDailyIngot()
    expect(s.player.auctionTickets).toEqual([day])
    await s.refreshAuction()
    const held = 1_000 + INGOT.daily - startPrice
    expect(s.player.goldIngot).toBe(held)
    expect(s.auctionBoard!.lot.dividend).toMatchObject({ eligible: 1, share: 30, paysAt: auctionDividendAt(day), mine: 'HELD' })

    now = auctionDividendAt(day)
    await s.refreshAuction()
    expect(s.player.goldIngot).toBe(held + 30)
    expect(s.player.auctionTickets).toEqual([])
    expect(s.auctionBoard!.previous!.dividend).toEqual({
      pool: Math.floor(startPrice * 0.3), eligible: 1, winners: 1, share: 30, paysAt: auctionDividendAt(day), mine: 'PAID',
    })

    // 次日领了但无人出价：流拍作废
    now = auctionWindow(day + 1).opensAt + 3_600_000
    finishDaily()
    expect(claimDailyIngot(s.player, now)).toEqual({ ingot: INGOT.daily, ticket: true })
    expect(s.player.auctionTickets).toEqual([day + 1])
    now = auctionDividendAt(day + 1)
    await s.refreshAuction()
    expect(s.player.auctionTickets).toEqual([])
    expect(s.player.goldIngot).toBe(held + 30 + INGOT.daily)
  })
})
