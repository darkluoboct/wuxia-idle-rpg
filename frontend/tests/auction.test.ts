import { describe, expect, it, vi } from 'vitest'
import { SKILLS } from '@/config/gameData'
import { claimDailyIngot, DAILY_TASKS, INGOT } from '../../shared/economy.ts'
import { AUCTION_MASK_COUNT, AUCTION_SOFT_CLOSE_MS, auctionDay, auctionDividend, auctionLot, auctionWindow, bidderMask } from '../../shared/ghostAuction.ts'
import { newStore } from './helpers'

const BEIJING = 8 * 3_600_000
const noon = Date.UTC(2026, 10, 16, 4) // 北京时间 11 月 16 日正午

describe('子时鬼市压轴暗拍', () => {
  it('子时开拍、次日 21:00 落槌，落槌后到子时公示；拍品七日一轮，代号取自六十甲子', () => {
    const day = auctionDay(noon)
    const { opensAt, closesAt } = auctionWindow(day)
    expect(new Date(opensAt + BEIJING).toISOString()).toBe('2026-11-15T23:00:00.000Z')
    expect(new Date(closesAt + BEIJING).toISOString()).toBe('2026-11-16T21:00:00.000Z')
    expect(auctionDay(closesAt + 3_600_000)).toBe(day)
    expect(auctionDay(closesAt + 2 * 3_600_000)).toBe(day + 1)
    expect(auctionLot(day + 7)).toEqual(auctionLot(day))
    expect(new Set(Array.from({ length: AUCTION_MASK_COUNT }, (_, i) => bidderMask(i))).size).toBe(AUCTION_MASK_COUNT)
  })

  it('本地试玩与联机同一套规则：出价先冻结元宝，领先时不能再出，落槌后才可领取', async () => {
    let now = noon
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const s = newStore('NEW')
    s.player.goldIngot = 1_000
    await s.refreshAuction()
    const { day } = s.auctionBoard!.lot
    const { itemId, startPrice } = auctionLot(day)
    const owns = () => (SKILLS[itemId] ? !!s.learnedSkills[itemId] : s.ownedItemIds.includes(itemId))
    expect(s.auctionBoard!.lot).toMatchObject({ itemId, nextBid: startPrice, leading: false, leaderMasked: null })

    await s.bidAuction()
    expect(s.player.goldIngot).toBe(1_000 - startPrice)
    expect(s.auctionBoard!.lot).toMatchObject({ leading: true, leaderMasked: '你', bids: 1 })
    await s.bidAuction()
    expect(s.player.goldIngot).toBe(1_000 - startPrice)
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

  it('落槌前 5 分钟内出价，落槌顺延 5 分钟', async () => {
    const day = auctionDay(noon)
    const now = auctionWindow(day).closesAt - 60_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const s = newStore('NEW')
    s.player.goldIngot = 1_000
    await s.refreshAuction()
    await s.bidAuction()
    expect(s.auctionBoard!.lot.closesAt).toBe(now + AUCTION_SOFT_CLOSE_MS)
  })

  it('红封：成交价三成按人头平分，每人至多 30；每份不足 10 元宝时改抽签', () => {
    expect(auctionDividend(180, 0)).toEqual({ pool: 54, winners: 0, share: 0 })
    expect(auctionDividend(180, 1)).toEqual({ pool: 54, winners: 1, share: 30 })
    expect(auctionDividend(180, 3)).toEqual({ pool: 54, winners: 3, share: 18 })
    expect(auctionDividend(180, 6)).toEqual({ pool: 54, winners: 5, share: 10 })
    expect(auctionDividend(410, 100)).toEqual({ pool: 123, winners: 12, share: 10 })
  })

  it('本地红封：21:00 前领每日江湖事得签，落槌后到账；流拍或过了 21:00 都没有', async () => {
    let now = noon
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const s = newStore('NEW')
    s.player.goldIngot = 1_000
    const finishDaily = () => { s.player.daily = { day: auctionDay(now), done: DAILY_TASKS.map(({ id }) => id), claimed: false } }
    const day = auctionDay(now)
    const { startPrice } = auctionLot(day)

    finishDaily()
    await s.claimDailyIngot()
    expect(s.player.auctionTickets).toEqual([day])
    await s.refreshAuction()
    await s.bidAuction()
    expect(s.auctionBoard!.lot.dividend).toBeUndefined()
    const held = 1_000 + INGOT.daily - startPrice

    now = auctionWindow(day).closesAt
    await s.refreshAuction()
    expect(s.player.goldIngot).toBe(held + 30)
    expect(s.player.auctionTickets).toEqual([])
    expect(s.auctionBoard!.lot.dividend).toEqual({ pool: Math.floor(startPrice * 0.3), eligible: 1, winners: 1, share: 30, mine: 'PAID' })

    // 次日过了 21:00 才领：没有签；再次日领了但无人出价：流拍作废
    now = auctionWindow(day + 1).closesAt
    finishDaily()
    expect(claimDailyIngot(s.player, now)).toEqual({ ingot: INGOT.daily, ticket: false })
    expect(s.player.auctionTickets).toEqual([])
    now = auctionWindow(day + 2).opensAt + 3_600_000
    finishDaily()
    expect(claimDailyIngot(s.player, now)).toEqual({ ingot: INGOT.daily, ticket: true })
    expect(s.player.auctionTickets).toEqual([day + 2])
    now = auctionWindow(day + 2).closesAt
    await s.refreshAuction()
    expect(s.player.auctionTickets).toEqual([])
    expect(s.player.goldIngot).toBe(held + 30 + 2 * INGOT.daily)
  })
})
