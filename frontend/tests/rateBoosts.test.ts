import { expect, it } from 'vitest'
import { checkShopGoods, mailAttachmentText } from '../../shared/admin.ts'
import { averageBoostPct, idleQiNumerator } from '../../shared/player.ts'
import { rollTrialDrop, TRIAL_STAGES } from '../../shared/trialStages.ts'

const HOUR = 3_600_000

it('倍率活动按时段折算挂机收益：同时段同类取最高，与共修加成相乘', () => {
  const rate = 1_000
  const boosts = [{ startsAt: HOUR, endsAt: 3 * HOUR, pct: 100 }, { startsAt: 2 * HOUR, endsAt: 3 * HOUR, pct: 50 }]
  expect(idleQiNumerator(0, 4 * HOUR, rate, null)).toBe(BigInt(4 * HOUR * rate))
  expect(idleQiNumerator(0, 4 * HOUR, rate, null, boosts)).toBe(BigInt(6 * HOUR * rate))
  // 共修前两小时 ×1.15，第二小时又逢双倍
  const pair = { startsAt: 0, endsAt: 2 * HOUR }
  expect(idleQiNumerator(0, 4 * HOUR, rate, pair, boosts)).toBe(BigInt(HOUR * (1_150 + 1_150 * 2 + 1_000 * 2 + 1_000)))
  // 只算上次收功之后的部分
  expect(idleQiNumerator(2 * HOUR, 4 * HOUR, rate, null, boosts)).toBe(BigInt(HOUR * (2_000 + 1_000)))
  expect(averageBoostPct(boosts, 0, 4 * HOUR)).toBe(50)
  expect(averageBoostPct(boosts, 2 * HOUR, 2 * HOUR)).toBe(100)
})

it('掉落活动提高巡历掉件几率，封顶必掉', () => {
  const stage = TRIAL_STAGES[0]
  const roll = 0.4
  expect(rollTrialDrop(stage, 'PATROL', () => roll)).toBeUndefined()
  expect(rollTrialDrop(stage, 'PATROL', () => roll, 100)).toBeDefined()
  expect(rollTrialDrop(stage, 'PATROL', () => 0.99, 400)).toBeDefined()
})

it('商店不卖元宝，丹药按枚数列出', () => {
  expect(checkShopGoods({ ingot: 10 })).toEqual({ error: '商店不卖元宝' })
  expect(checkShopGoods({})).toEqual({ error: '商品至少要有一样东西' })
  expect(checkShopGoods({ pills: { nonexistent: 1 } })).toEqual({ error: '没有这种丹药：nonexistent' })
  const goods = checkShopGoods({ pills: { pozhang_dan: 2 }, silver: 100 })
  expect(goods).toEqual({ pills: { pozhang_dan: 2 }, silver: 100 })
  expect(mailAttachmentText(goods as object)).toBe('纹银 100、纯阳·通脉破障丹 ×2')
})
