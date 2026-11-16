import { describe, expect, it } from 'vitest'
import {
  arenaDay, arenaWindow, artifactAttemptsLeft, artifactChallengeBlock, artifactState, DAGOU_STAFF, defendedArenas, isArenaDay, nextArenaDay,
  spendArtifactAttempt, surrenderArtifact,
} from '../../shared/artifacts.ts'
import { createStarterCharacter } from '../../shared/player.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const beijing = (month: number, day: number, hour = 0) => Date.UTC(2026, month - 1, day, hour - 8)
const sunday = beijing(11, 22) // 北京时间 2026-11-22 周日零点

describe('兵器谱 · 君山擂台规矩', () => {
  it('周日北京时间零点开擂、午夜收擂；非周日指向下一个周日', () => {
    const day = arenaDay(sunday)
    expect(isArenaDay(day)).toBe(true)
    expect(arenaWindow(day)).toEqual({ opensAt: sunday, closesAt: sunday + DAY })
    expect(isArenaDay(arenaDay(sunday - 1))).toBe(false)
    expect(isArenaDay(arenaDay(sunday + DAY))).toBe(false)
    expect(nextArenaDay(day)).toBe(day)
    for (let offset = 1; offset <= 6; offset++) expect(nextArenaDay(day + offset)).toBe(day + 7)
  })

  it('守住的届数只算得棒之后完整经历的周日，得棒当天那一场不算', () => {
    expect(defendedArenas(sunday - 3 * DAY, sunday + DAY - 1)).toBe(0)
    expect(defendedArenas(sunday - 3 * DAY, sunday + DAY)).toBe(1)
    expect(defendedArenas(sunday, sunday + DAY)).toBe(1)
    expect(defendedArenas(sunday + HOUR, sunday + 7 * DAY)).toBe(0)
    expect(defendedArenas(sunday + HOUR, sunday + 8 * DAY)).toBe(1)
    expect(defendedArenas(sunday + HOUR, sunday + 22 * DAY)).toBe(3)
  })

  it('从未有人得棒是 UNCLAIMED；执棒者 72 小时不露面视同无主', () => {
    expect(artifactState(undefined, sunday)).toBe('UNCLAIMED')
    expect(artifactState({ holderId: 'a', seenAt: sunday }, sunday + DAGOU_STAFF.idleRecallMs - 1)).toBe('HELD')
    expect(artifactState({ holderId: 'a', seenAt: sunday }, sunday + DAGOU_STAFF.idleRecallMs)).toBe('VACANT')
    expect(artifactState({ holderId: null, seenAt: sunday }, sunday)).toBe('VACANT')
  })

  it('上擂资格：终考绝学、未叛丐帮；有主只在周日，无主天天可上；每天三次', () => {
    const { player } = createStarterCharacter({ id: 'p', nickname: '试棒客', avatarId: 'hero_sword_male' }, sunday)
    const learned = { [DAGOU_STAFF.proofSkillId]: 1 }
    const block = (over: Partial<Parameters<typeof artifactChallengeBlock>[0]> = {}) =>
      artifactChallengeBlock({ player, learnedSkills: learned, state: 'HELD', isHolder: false, now: sunday + HOUR, ...over })
    expect(block()).toBeUndefined()
    expect(block({ state: 'UNCLAIMED' })).toContain('第一人自得衣钵')
    expect(block({ isHolder: true })).toContain('就在你手里')
    expect(block({ learnedSkills: {} })).toContain('天下无狗')
    expect(block({ player: { ...player, betrayedSectIds: ['gaibang'] } })).toContain('叛出丐帮')
    expect(block({ now: sunday - HOUR })).toContain('每周日开擂')
    expect(block({ now: sunday - HOUR, state: 'VACANT' })).toBeUndefined()
    // 久未露面的执棒者自己回来，棒已不在手里，照样可以找长老夺回
    expect(block({ now: sunday - HOUR, state: 'VACANT', isHolder: true })).toBeUndefined()

    expect(artifactAttemptsLeft(player, sunday)).toBe(3)
    expect([1, 2, 3].map(() => spendArtifactAttempt(player, sunday + HOUR))).toEqual([2, 1, 0])
    expect(block()).toContain('已用尽')
    expect(artifactAttemptsLeft(player, sunday + DAY)).toBe(3)
  })

  it('失棒：所有配装摘下打狗棒；每守住一届补 15 块玄铁、封顶 60，叛帮不补', () => {
    const lose = (heldDays: number, compensate = true) => {
      const { player, presets } = createStarterCharacter({ id: 'p', nickname: '试棒客', avatarId: 'hero_sword_male' }, sunday)
      presets[1].weaponId = DAGOU_STAFF.itemId
      presets[2].weaponId = DAGOU_STAFF.itemId
      const kept = presets[3].weaponId
      const iron = surrenderArtifact(player, Object.values(presets), sunday - DAY, sunday - DAY + heldDays * DAY, compensate)
      expect([presets[1].weaponId, presets[2].weaponId, presets[3].weaponId]).toEqual([null, null, kept])
      expect(player.equipmentForge?.iron ?? 0).toBe(iron)
      return iron
    }
    expect(lose(1)).toBe(0)
    expect(lose(2)).toBe(15)
    expect(lose(9)).toBe(30)
    expect(lose(60)).toBe(60)
    expect(lose(60, false)).toBe(0)
  })
})
