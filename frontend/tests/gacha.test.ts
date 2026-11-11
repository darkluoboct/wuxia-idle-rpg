import { describe, expect, it, vi } from 'vitest'
import { GACHA_HARD_PITY, gachaEffectiveRedRate, REUNION_AFTER } from '@/config/gachaData'
import { rollGacha } from '@/network/mockEngine'
import { newStore } from './helpers'

/** 可复现的线性同余随机数 */
function lcg(seed = 12345) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

describe('抽取引擎（模拟服务端）', () => {
  it('10 万抽统计：各档概率与公示一致，神品间隔不超过硬保底', () => {
    const rng = lcg()
    const N = 100_000
    const cnt = { red: 0, orange: 0, purple: 0, blue: 0 }
    let pity = 0
    let gap = 0
    let maxGap = 0
    for (let i = 0; i < N; i++) {
      const r = rollGacha({ count: 1, pity, pullsSoFar: i, rng })
      pity = r.pity
      const tier = r.draws[0].tier
      cnt[tier]++
      gap++
      if (tier === 'red') {
        maxGap = Math.max(maxGap, gap)
        gap = 0
      }
    }
    const pct = (k: keyof typeof cnt) => (cnt[k] / N) * 100
    expect(maxGap).toBeLessThanOrEqual(GACHA_HARD_PITY)
    expect(Math.abs(pct('orange') - 8)).toBeLessThan(0.4)
    expect(Math.abs(pct('purple') - 30)).toBeLessThan(0.7)
    // 含保底的综合出率：公示的解析值应与模拟吻合
    expect(Math.abs(pct('red') - gachaEffectiveRedRate())).toBeLessThan(0.15)
  })

  it('软保底边界：第 59 抽仍是基础 1.5%，第 60 抽起神品概率升到 6.5%', () => {
    // 掷点 6%：第 59 抽时神品只有 1.5%，落入绝品档；第 60 抽软保底升到 6.5%，同一掷点即为神品
    const at = (pity: number) => rollGacha({ count: 1, pity, pullsSoFar: 0, rng: () => 0.06 }).draws[0].tier
    expect(at(58)).not.toBe('red') // 第 59 抽
    expect(at(59)).toBe('red') // 第 60 抽
  })

  it('公示的综合神品出率约 2.4%（规则改动必须同步修改公示）', () => {
    expect(gachaEffectiveRedRate()).toBeGreaterThan(2.3)
    expect(gachaEffectiveRedRate()).toBeLessThan(2.5)
  })

  it('十连必出上品及以上', () => {
    const rng = lcg(7)
    for (let i = 0; i < 3000; i++) {
      expect(rollGacha({ count: 10, pity: 0, pullsSoFar: 0, rng }).draws.some((d) => d.tier !== 'blue')).toBe(true)
    }
  })
})

describe('客栈结缘：结算', () => {
  it('元宝不足不能抽、不扣费', () => {
    const s = newStore('NEW')
    expect(s.player.goldIngot).toBe(300)
    s.pullGacha(10)
    expect(s.player.goldIngot).toBe(300)
    expect(s.gachaReveal).toBeNull()
  })

  it('神品抽到未拥有的洪七公 → 觉醒形态入队；再抽到 → 信物 ×40', () => {
    const s = newStore('NEW')
    vi.spyOn(Math, 'random').mockReturnValue(0) // 必落神品档首条：洪七公
    s.pullGacha(1)
    expect(s.player.goldIngot).toBe(200)
    expect(s.gacha.pulls).toBe(1)
    expect(s.gachaReveal?.results).toHaveLength(1)
    const hq = s.companionAffinity.hongqigong
    expect(hq.recruited && hq.form === 'awakened').toBe(true)
    expect(s.companionOf('hongqigong')?.tier).toBe('red')
    s.closeGachaReveal()
    s.pullGacha(1)
    expect(hq.tokens).toBe(40)
    expect(s.gachaReveal?.results[0].isNew).toBe(false)
  })

  it('绝品抽到丘处机 → 入队且资质为「上」（×1.12）', () => {
    const s = newStore('NEW')
    vi.spyOn(Math, 'random').mockReturnValue(0.05) // 绝品档首条，资质掷点 5 < 25
    s.pullGacha(1)
    expect(s.companionAffinity.qiuchuji).toMatchObject({ recruited: true, grade: '上' })
    expect(s.companionOf('qiuchuji')?.baseHp).toBe(Math.round(7000 * 1.12))
  })

  it('第 80 抽硬保底出神品，计数清零；十连保底上品；扣费正确', () => {
    const s = newStore('NEW')
    s.player.goldIngot = 5000
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // 永远落在良品档
    s.gacha.pity = GACHA_HARD_PITY - 1
    s.pullGacha(1)
    expect(s.gachaReveal?.results[0].draw).toMatchObject({ tier: 'red', pityTriggered: true })
    expect(s.gacha.pity).toBe(0)
    s.closeGachaReveal()
    s.pullGacha(10)
    expect(s.gachaReveal!.results).toHaveLength(10)
    expect(s.gachaReveal!.results.some((r) => r.draw.tier !== 'blue')).toBe(true)
    expect(s.player.goldIngot).toBe(5000 - 100 - 950)
  })

  it('揭晓动画未关闭时不能连点再抽；结缘记录与累计抽数一致', () => {
    const s = newStore('NEW')
    s.pullGacha(1)
    const gold = s.player.goldIngot
    s.pullGacha(1)
    expect(s.player.goldIngot).toBe(gold)
    s.closeGachaReveal()
    expect(s.gacha.history).toHaveLength(s.gacha.pulls)
  })
})

describe('故人重逢令', () => {
  it('只对错过的剧情送伙伴生效，固定 150 元宝', () => {
    const s = newStore('NEW')
    expect(s.reunionCandidates).toEqual([])
    s.resolvedAdventureIds.push('huangshan_bishou') // 荒山选了「夺经」
    expect(s.reunionCandidates).toContain('meichaofeng')
    s.player.goldIngot = 100
    s.redeemReunionTicket('meichaofeng')
    expect(s.companionAffinity.meichaofeng.recruited).toBe(false)
    s.player.goldIngot = 200
    s.redeemReunionTicket('meichaofeng')
    expect(s.companionAffinity.meichaofeng.recruited).toBe(true)
    expect(s.player.goldIngot).toBe(50)
    expect(s.reunionCandidates).not.toContain('meichaofeng')
  })

  it('黄蓉不在名单（叫花鸡选乙仍会结识，走客栈免费养成）', () => {
    expect(REUNION_AFTER.huangrong).toBeUndefined()
  })
})
