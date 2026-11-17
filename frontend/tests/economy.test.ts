import { describe, expect, it } from 'vitest'
import { ADVENTURES, STORY_CHAPTERS } from '@/config/gameData'
import type { PlayerDTO } from '@/network/protocol'
import { INGOT, ingotMilestones, patrolCacheIngot } from '../../shared/economy.ts'
import { sectContestEndsAt, sectContestWeek } from '../../shared/sectProgress.ts'
import { FTUE_QUESTS } from '../../shared/ftueQuests.ts'
import { createNewGameCharacter, idleQiNumerator } from '../../shared/player.ts'
import { openToOrigin } from '../../shared/origins.ts'
import { advancePatrol, IDLE_CAP_MS, TRIAL_STAGES } from '../../shared/trialStages.ts'
import { boost, newStore, playNode } from './helpers'

describe('元宝产出规则（docs/19）', () => {
  it('第一卷一次性奖励约 3,000：章末节点与章末复战关按高档发放', () => {
    const { player, companionAffinity } = createNewGameCharacter({ id: 'ledger', nickname: '算账', avatarId: 'hero_sword' }, 0, 'jiangmen')
    const all = ingotMilestones({
      player: {
        ...player, realmTier: 3, sectRank: 5, currentSectId: 'gaibang',
        ftue: { index: FTUE_QUESTS.length, claimed: FTUE_QUESTS.map(({ id }) => id), forageCount: 0, refinedRecipeIds: [] },
        trial: { ...player.trial, rewardedStageIds: TRIAL_STAGES.map(({ id }) => id) },
      },
      rewardedChapters: STORY_CHAPTERS.map(({ id }) => id),
      // 公共支线 13 段 + 本家家事 3 段
      adventureIds: ADVENTURES.filter((adventure) => openToOrigin(adventure, player)).map(({ id }) => id),
      companionAffinity: Object.fromEntries(Object.keys(companionAffinity).map((id) => [id, { recruited: true }])),
    })
    const amount = Object.fromEntries(all.map(({ key, amount }) => [key, amount]))
    expect([3, 6, 10, 13, 16].map((id) => amount[`story:${id}`])).toEqual(Array(5).fill(INGOT.storyChapterEnd))
    expect(amount['story:1']).toBe(INGOT.storyNode)
    expect([7, 13, 21, 26, 30].map((id) => amount[`trial:${id}`])).toEqual(Array(5).fill(INGOT.trialChapterEnd))
    expect(amount['trial:1']).toBe(INGOT.trialStage)
    expect(all.filter(({ key }) => key.startsWith('adventure:'))).toHaveLength(16)
    expect(new Set(all.map(({ key }) => key)).size).toBe(all.length)
    const total = INGOT.start + all.reduce((sum, { amount }) => sum + amount, 0)
    expect(total).toBeGreaterThan(2_800)
    expect(total).toBeLessThan(3_400)
  })

  it('巡历宝箱每箱 5 元宝，每周最多 210，隔几天上线一次也不吃亏', () => {
    const player: Pick<PlayerDTO, 'goldIngot' | 'patrolIngot'> = { goldIngot: 0 }
    const week = sectContestWeek(Date.UTC(2026, 10, 16, 4))
    const start = sectContestEndsAt(week - 1)
    expect(INGOT.patrolWeeklyCap).toBe(210)
    expect(patrolCacheIngot(player, 30, start + 3_600_000)).toBe(150)
    expect(patrolCacheIngot(player, 30, start + 4 * 86_400_000)).toBe(60)
    expect(patrolCacheIngot(player, 1, start + 6 * 86_400_000)).toBe(0)
    expect(patrolCacheIngot(player, 1, sectContestEndsAt(week) + 3_600_000)).toBe(5)
    expect(player.goldIngot).toBe(215)
  })

  it('打坐与巡历最多累计 24 小时未领：一天上线一次不吃亏', () => {
    const now = Date.UTC(2026, 10, 16, 4)
    const hour = 3_600_000
    expect(IDLE_CAP_MS).toBe(24 * hour)
    expect(idleQiNumerator(now - 20 * hour, now, 3_600, null)).toBe(BigInt(20 * hour * 3_600))
    expect(idleQiNumerator(now - 40 * hour, now, 3_600, null)).toBe(BigInt(24 * hour * 3_600))
    const trial = { ...createNewGameCharacter({ id: 'cap', nickname: '挂机', avatarId: 'hero_sword_male' }, now - 40 * hour).player.trial }
    trial.lastPatrolAt = now - 40 * hour
    advancePatrol(trial, now, 100)
    expect(trial.stageHours[String(trial.selectedStageId)]).toBe(24)
  })
})

describe('本地试玩与联机同一套元宝规则', () => {
  it('新游戏的首通、突破当场入账并记入纪事，同一里程碑只发一次；演武模式不发', () => {
    const s = newStore('NEW')
    expect(s.player.goldIngot).toBe(INGOT.start)
    s.player.trial.rewardedStageIds.push(1)
    expect(s.player.goldIngot).toBe(INGOT.start + INGOT.trialStage)
    s.player.realmTier = 2
    expect(s.player.goldIngot).toBe(INGOT.start + INGOT.trialStage + INGOT.realmBreak)
    expect(s.player.ingotClaims).toEqual(['trial:1', 'realm:2'])
    expect(s.logs.some((log) => log.segments.some((seg) => seg.type === 'tag' && seg.text === '元宝入账'))).toBe(true)
    s.player.trial.rewardedStageIds = [1]
    expect(s.player.goldIngot).toBe(INGOT.start + INGOT.trialStage + INGOT.realmBreak)

    const demo = newStore('DEMO')
    const gold = demo.player.goldIngot
    demo.player.realmTier = 5
    expect(demo.player.goldIngot).toBe(gold)
  })

  it('每日江湖事：收功、请酒、出战、采药都做完才能领元宝，当日只领一次', () => {
    const s = newStore('NEW')
    s.settleOfflineQi()
    s.claimDailyIngot()
    expect(s.daily.claimed).toBe(false)
    s.companionAffinity.kezhene.met = true
    s.giftCompanionInInn('kezhene', false)
    boost(s)
    playNode(s, 1)
    s.player.qiExp = 5_000
    s.forageHerbs()
    expect(s.daily.tasks.every(({ done }) => done)).toBe(true)
    const gold = s.player.goldIngot
    s.claimDailyIngot()
    expect(s.player.goldIngot).toBe(gold + INGOT.daily)
    expect(s.daily.claimed).toBe(true)
    s.claimDailyIngot()
    expect(s.player.goldIngot).toBe(gold + INGOT.daily)
  })
})
