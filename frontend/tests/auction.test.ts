import { describe, expect, it, vi } from 'vitest'
import { SKILLS } from '@/config/gameData'
import { AUCTION_MASK_COUNT, AUCTION_SOFT_CLOSE_MS, auctionDay, auctionLot, auctionWindow, bidderMask } from '../../shared/ghostAuction.ts'
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
})
