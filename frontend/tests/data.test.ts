import { describe, expect, it } from 'vitest'
import { ADVENTURES, COMPANIONS, ITEMS, MAPS, SECTS, SKILLS, STORY_CHAPTERS, validateGameData } from '@/config/gameData'
import { validateGachaData } from '@/config/gachaData'
import { validateQuestData } from '@/config/questData'
import { HUASHAN_SEASON_MS, huashanDay, huashanRankReward, huashanRatingSwing, huashanSeason, huashanSeasonEndsAt } from '../../shared/huashan'

describe('配置数据自检', () => {
  it('gameData 引用全部有效', () => {
    expect(validateGameData()).toEqual([])
  })
  it('抽卡配置有效', () => {
    expect(validateGachaData()).toEqual([])
  })
  it('寻访 / 绝味配置有效', () => {
    expect(validateQuestData()).toEqual([])
  })
  it('射雕篇内容规模', () => {
    expect(STORY_CHAPTERS).toHaveLength(16)
    expect(ADVENTURES.length).toBeGreaterThanOrEqual(13)
    expect(Object.keys(COMPANIONS)).toHaveLength(27)
    expect(SECTS).toHaveLength(7)
    expect(MAPS).toHaveLength(11)
    expect(MAPS.map(({ id }) => id)).toEqual(expect.arrayContaining(['linan_city', 'linan_manor', 'chongyang_hall']))
    expect(MAPS.find(({ id }) => id === 'xiangyang_city')).toMatchObject({ name: '襄阳·城中广场', safety: 'PEACE' })
    expect(Object.keys(SKILLS).length).toBeGreaterThanOrEqual(38)
    expect(Object.keys(ITEMS).length).toBeGreaterThanOrEqual(26)
  })
})

describe('华山论剑赛季规则', () => {
  it('北京时间周一零点更换赛季，两届间隔 14 天', () => {
    const rollover = Date.parse('2024-01-15T00:00:00+08:00')
    expect(huashanSeason(rollover - 1)).toBe(0)
    expect(huashanSeason(rollover)).toBe(1)
    expect(huashanSeasonEndsAt(1)).toBe(rollover + HUASHAN_SEASON_MS)
    expect(huashanDay(rollover)).toBe(huashanDay(rollover - 1) + 1)
  })

  it('同分转移 16 分，以下克上多得分，败方积分最低为零', () => {
    expect(huashanRatingSwing(1_000, 1_000)).toBe(16)
    expect(huashanRatingSwing(1_000, 1_400)).toBeGreaterThan(16)
    expect(huashanRatingSwing(1_400, 1_000)).toBeLessThan(16)
    expect(huashanRatingSwing(1_000, 1)).toBe(1)
    expect(huashanRatingSwing(1_000, 0)).toBe(0)
  })

  it('第 5、100 名仍领取所在档的赛季奖励', () => {
    expect(huashanRankReward(5)).toEqual({ qiExp: 10_000, silver: 3_000 })
    expect(huashanRankReward(6)).toEqual({ qiExp: 3_000, silver: 1_000 })
    expect(huashanRankReward(100)).toEqual(huashanRankReward(6))
    expect(huashanRankReward(101)).toEqual({ qiExp: 1_000, silver: 300 })
  })
})
