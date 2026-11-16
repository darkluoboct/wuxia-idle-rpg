import { describe, expect, it, vi } from 'vitest'
import { HERBS } from '@/config/gameData'
import {
  buySystemStall, checkStallOffer, STALL, stallDay, stallFee, stallGoods, stallMask, stallTax, systemStalls, type StallInventory,
} from '../../shared/stalls.ts'
import { newStore } from './helpers'

const noon = Date.UTC(2026, 10, 16, 4) // 北京时间 11 月 16 日正午

describe('子时鬼市蒙面摊位', () => {
  it('只有草药与武学残页可摆卖；单价限在参考价的 50%~200%', () => {
    expect(stallGoods('HERB', 'sanqi')).toMatchObject({ name: '田七三七', refPrice: 20, minPrice: 10, maxPrice: 40 })
    expect(stallGoods('HERB', 'linghu_cao')).toMatchObject({ refPrice: 1500, minPrice: 750, maxPrice: 3000 })
    expect(stallGoods('FRAGMENT', 'luoying_zhang')).toMatchObject({ name: '《落英神剑掌》残页', refPrice: 400, minPrice: 200, maxPrice: 800 })
    expect(stallGoods('HERB', 'luoying_zhang')).toBeUndefined()
    expect(stallGoods('ITEM', 'qinggang_sword')).toBeUndefined()
    expect(stallGoods('HERB', 'constructor')).toBeUndefined()
    expect([stallFee(300), stallFee(10), stallTax(300), stallTax(9)]).toEqual([6, 1, 30, 0])
    expect(stallMask(0)).toBe('蒙面摊主·甲子')
  })

  it('上架检查：等级、摊位数、数量、库存、单价、摆摊费', () => {
    const inventory: StallInventory = { herbs: { sanqi: 10 }, fragments: {} }
    const seller = { level: 10, silver: 100, openCount: 0, inventory }
    const offer = { kind: 'HERB', goodsId: 'sanqi', qty: 10, unitPrice: 30 }
    expect(checkStallOffer(seller, offer)).toMatchObject({ qty: 10, unitPrice: 30, fee: 6 })
    const error = (who: Partial<typeof seller>, change: Record<string, unknown> = {}) => {
      const result = checkStallOffer({ ...seller, ...who }, { ...offer, ...change })
      return 'error' in result ? result.error : ''
    }
    expect(error({ level: 9 })).toContain('10 级')
    expect(error({ openCount: STALL.maxOpen })).toContain('最多同时摆 5 个')
    expect(error({}, { qty: 0 })).toContain('1~99')
    expect(error({}, { qty: 100 })).toContain('1~99')
    expect(error({}, { qty: 2.5 })).toContain('1~99')
    expect(error({}, { qty: 11 })).toContain('不够 11 份')
    expect(error({}, { unitPrice: 9 })).toContain('10~40')
    expect(error({}, { unitPrice: 41 })).toContain('10~40')
    expect(error({}, { unitPrice: '30' })).toContain('10~40')
    expect(error({ silver: 5 })).toContain('摆摊费要 6 两')
    expect(error({}, { kind: 'ITEM' })).toContain('不能在鬼市摆卖')
  })

  it('散客摊每个鬼市日三摊：常见、少见、稀有草药各一种，按参考价上限出售，每人每摊每天一次', () => {
    const day = stallDay(noon)
    const stalls = systemStalls(day)
    expect(stalls.map(({ goods }) => HERBS[goods.id].rarity)).toEqual(['COMMON', 'UNCOMMON', 'RARE'])
    expect(stalls.map(({ qty }) => qty)).toEqual([5, 3, 1])
    expect(stalls.every(({ goods, unitPrice }) => unitPrice === goods.maxPrice)).toBe(true)
    expect(systemStalls(day)).toEqual(stalls)
    expect(systemStalls(day + 1).map(({ id }) => id)).not.toEqual(stalls.map(({ id }) => id))

    const player = { level: 10, silver: 1_000, stallSystem: undefined as { day: number; bought: string[] } | undefined }
    const inventory: StallInventory = { herbs: {}, fragments: {} }
    const [common] = stalls
    expect(buySystemStall({ ...player, level: 9 }, inventory, common.id, noon)).toEqual({ error: '等级达到 10 级才能在鬼市采买' })
    expect(buySystemStall({ ...player, silver: 10 }, inventory, common.id, noon)).toEqual({ error: '纹银不足' })
    expect(buySystemStall(player, inventory, common.id, noon)).toMatchObject({ qty: 5, spent: 5 * common.unitPrice })
    expect([player.silver, inventory.herbs[common.goods.id]]).toEqual([1_000 - 5 * common.unitPrice, 5])
    expect(buySystemStall(player, inventory, common.id, noon)).toEqual({ error: '这摊散客货你今天已经买过' })
    expect(buySystemStall(player, inventory, common.id, noon + 86_400_000)).toEqual({ error: '这摊散客货已经收摊，请刷新' })
  })

  it('本地试玩同一套规则：上架代管收摆摊费，撤摊与到期退货，散客摊可买；Lv.10 以下不能摆摊', async () => {
    let now = noon
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const s = newStore('DEMO')
    await s.refreshStalls()
    expect(s.stallBoard!.listings.map(({ system, seller }) => [system, seller])).toEqual([[true, '鬼市散客'], [true, '鬼市散客'], [true, '鬼市散客']])
    const ware = s.stallWares[0]
    const { silver } = s.player

    await s.listStall({ kind: ware.kind, goodsId: ware.id, qty: ware.stock, unitPrice: ware.maxPrice })
    const fee = stallFee(ware.stock * ware.maxPrice)
    expect(s.player.silver).toBe(silver - fee)
    expect(s.stallWares.some(({ id }) => id === ware.id)).toBe(false)
    expect(s.stallBoard!.mine).toMatchObject([{ goodsId: ware.id, qty: ware.stock, unitPrice: ware.maxPrice, sold: 0, expiresAt: now + STALL.durationMs }])
    await s.listStall({ kind: ware.kind, goodsId: ware.id, qty: 1, unitPrice: ware.maxPrice })
    expect(s.stallBoard!.mine).toHaveLength(1)

    await s.cancelStall(s.stallBoard!.mine[0].id)
    expect(s.stallBoard!.mine).toEqual([])
    expect(s.stallWares.find(({ id }) => id === ware.id)?.stock).toBe(ware.stock)
    expect(s.player.silver).toBe(silver - fee)

    await s.listStall({ kind: ware.kind, goodsId: ware.id, qty: 1, unitPrice: ware.minPrice })
    expect(s.stallWares.find(({ id }) => id === ware.id)?.stock ?? 0).toBe(ware.stock - 1)
    now += STALL.durationMs
    await s.refreshStalls()
    expect(s.stallBoard!.mine).toEqual([])
    expect(s.stallWares.find(({ id }) => id === ware.id)?.stock).toBe(ware.stock)

    const [system] = s.stallBoard!.listings
    const had = s.stallWares.find(({ id }) => id === system.goodsId)?.stock ?? 0
    const purse = s.player.silver
    await s.buyStall(system, 1)
    expect(s.player.silver).toBe(purse - system.qty * system.unitPrice)
    expect(s.stallWares.find(({ id }) => id === system.goodsId)?.stock).toBe(had + system.qty)
    expect(s.stallBoard!.listings.some(({ id }) => id === system.id)).toBe(false)

    const rookie = newStore('NEW')
    await rookie.refreshStalls()
    rookie.player.silver = 5_000
    await rookie.buyStall(rookie.stallBoard!.listings[0], 1)
    expect(rookie.player.silver).toBe(5_000)
    expect(rookie.stallBoard!.listings).toHaveLength(3)
  })
})
