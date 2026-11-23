/**
 * 卷一通关回归（docs/27 第四期）：新角色按剧情时间线一路打到华山之巅，钉住全卷的数值与战斗节奏。
 *   · 一般玩家（新掉的装备按战力换上，伙伴入队自动编进空位）：46 回都第一次就打赢，历练首战 3～6 回合、余血过半。
 *   · 懒玩家（从不换装）：主线对他是硬仗，但每一回都能在一天内拿下，全卷打得完。
 *     主线有 B 类门槛，打不过就整卷停住，所以主线首领按懒玩家定：到 Lv.40 封顶也要打得过。
 * 调首领数值、掉落、升级曲线或巡历时长时，这里会先报出来。
 */
import { describe, expect, it } from 'vitest'
import { STORY_TIMELINE, timelineChapter } from '../../shared/stageScripts.ts'
import { playChapterOne } from './chapterOne'

const DAY = 24 * 60
const LATER = STORY_TIMELINE.filter((key) => timelineChapter(key) >= 2)

describe.each(['yujia', 'jiangmen', 'xinglin', 'xuanmen'] as const)('卷一通关 · 一般玩家 · %s', (origin) => {
  const run = playChapterOne({ origin, until: 'T30', maxMinutes: 60 * DAY, kit: 'typical', keepReports: false })
  const first = (key: string) => run.fights.find((fight) => fight.key === key)!

  it('46 回都在第一次就打赢，全卷 35 天内打完', () => {
    for (const key of STORY_TIMELINE) expect(first(key), key).toMatchObject({ attempt: 1, won: true })
    expect(run.cleared.T30! / DAY).toBeLessThan(35)
  })

  it('第二章起历练首战 3～6 回合、余血过半（黄药师听箫撑满 10 回合）；主线至少 3 回合', () => {
    for (const key of LATER) {
      const fight = first(key)
      if (key === 'T21') expect(fight.rounds, key).toBe(10)
      else if (key.startsWith('T')) {
        expect(fight.rounds, key).toBeGreaterThanOrEqual(3)
        expect(fight.rounds, key).toBeLessThanOrEqual(6)
        expect(fight.hpLeft, key).toBeGreaterThan(0.5)
      } else expect(fight.rounds, key).toBeGreaterThanOrEqual(3)
    }
  })
})

describe.each(['yujia', 'xuanmen'] as const)('卷一通关 · 懒玩家 · %s', (origin) => {
  const run = playChapterOne({ origin, until: 'T30', maxMinutes: 80 * DAY, keepReports: false })

  it('从不换装也能打完全卷：每一回从第一次开打到拿下不超过一天', () => {
    expect(run.cleared.T30, '打完历练 30').toBeDefined()
    for (const key of STORY_TIMELINE) {
      const tries = run.fights.filter((fight) => fight.key === key)
      expect(tries.at(-1)!.minute - tries[0].minute, key).toBeLessThanOrEqual(DAY)
    }
  })

  it('第二章起的主线对他是硬仗：拿下那一战至少 5 回合、余血不过七成五（玄门的松岩子会替主角挡刀）', () => {
    for (const key of LATER.filter((k) => k.startsWith('N'))) {
      const win = run.fights.find((fight) => fight.key === key && fight.won)!
      expect(win.rounds, key).toBeGreaterThanOrEqual(5)
      expect(win.hpLeft, key).toBeLessThanOrEqual(0.75)
    }
  })
})
