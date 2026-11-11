import { describe, expect, it } from 'vitest'
import { ADVENTURES, COMPANIONS, ITEMS, MAPS, SECTS, SKILLS, STORY_CHAPTERS, validateGameData } from '@/config/gameData'
import { validateGachaData } from '@/config/gachaData'
import { validateQuestData } from '@/config/questData'

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
    expect(Object.keys(COMPANIONS)).toHaveLength(25)
    expect(SECTS).toHaveLength(7)
    expect(MAPS).toHaveLength(7)
    expect(Object.keys(SKILLS).length).toBeGreaterThanOrEqual(38)
    expect(Object.keys(ITEMS).length).toBeGreaterThanOrEqual(26)
  })
})
