/**
 * 第一章通关回归（docs/27）：新角色按《江湖行历》与剧情时间线打完第一章、一路走到拜师，
 * 钉住第一章的数值与战斗节奏。调首领强度、行历、丹方或升级曲线时，这里会先报出来。
 */
import { describe, expect, it } from 'vitest'
import { FTUE_QUESTS } from '../../shared/ftueQuests.ts'
import { STORY_TIMELINE } from '../../shared/stageScripts.ts'
import { playChapterOne } from './chapterOne'

const ORIGINS = ['yujia', 'xinglin', 'jiangmen', 'xuanmen'] as const
const CHAPTER_ONE = STORY_TIMELINE.slice(0, 10)

describe.each(ORIGINS)('第一章通关 · %s', (origin) => {
  const run = playChapterOne({ origin, until: 'T07' })
  const first = (key: string) => run.fights.find((fight) => fight.key === key)!

  it('十回都在第一次就打赢，两小时内打完', () => {
    for (const key of CHAPTER_ONE) expect(first(key), key).toMatchObject({ attempt: 1, won: true })
    expect(run.cleared.T07).toBeLessThanOrEqual(120)
  })

  it('历练首战打 3～6 回合，首领的机制来得及出手；主角不会被一路碾压，也不会刮痧', () => {
    for (const key of CHAPTER_ONE.filter((k) => k.startsWith('T') && k !== 'T07')) {
      const fight = first(key)
      expect(fight.rounds, key).toBeGreaterThanOrEqual(3)
      expect(fight.rounds, key).toBeLessThanOrEqual(6)
      expect(fight.hpLeft, key).toBeGreaterThan(0.5)
      expect(fight.lines, `${key} 的开场与胜句`).toBeGreaterThanOrEqual(2)
    }
    // 历练 02 连中三回合才重心失衡，04 攒怒掷毒菱
    expect(first('T02').rounds).toBeGreaterThanOrEqual(4)
    expect(first('T04').marks.some((mark) => mark.includes('飞天淬'))).toBe(true)
  })

  it('主线 1-2、1-3 是硬仗：打得久，掉得多', () => {
    expect(first('N1-2').rounds).toBeGreaterThanOrEqual(5)
    expect(first('N1-3').rounds).toBeGreaterThanOrEqual(8)
    expect(first('N1-3').hpLeft).toBeLessThan(0.75)
  })

  it('章末陈玄风撑到第五回合露出罩门，「靖」字匕首一击了结，柯镇恶那句台词也出现了', () => {
    const finale = first('T07')
    expect(finale.rounds).toBeGreaterThanOrEqual(5)
    expect(finale.team.startsWith('xuantie_dagger')).toBe(true)
    expect(finale.report!.events.some((event) => event.segments.some((seg) => seg.type === 'tag' && seg.text.includes('刺中肚脐罩门')))).toBe(true)
    expect(finale.report!.events.some((event) => event.segments.some((seg) => seg.type === 'text' && seg.text.includes('罩门露了')))).toBe(true)
  })
})

describe('一路走到拜师（《江湖行历》卷一圆满）', () => {
  it.each(ORIGINS)('%s：六小时内突破、拜入师门，卷一行历全部领完', (origin) => {
    const run = playChapterOne({ origin, toSect: true, maxMinutes: 6 * 60 })
    expect(run.store.player.currentSectId).toBeTruthy()
    expect(run.store.player.realmTier).toBe(2)
    const volumeOne = FTUE_QUESTS.filter(({ volume }) => volume === 1).map(({ id }) => id)
    expect(run.store.ftue.claimed).toEqual(expect.arrayContaining(volumeOne.filter((id) => id !== 9)))
  })
})
