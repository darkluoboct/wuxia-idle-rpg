import { describe, expect, it } from 'vitest'
import { ADVENTURES, STORY_CHAPTERS } from '@/config/gameData'
import type { PlayerDTO } from '@/network/protocol'
import { INGOT, ingotMilestones, patrolCacheIngot } from '../../shared/economy.ts'
import { FTUE_QUESTS } from '../../shared/ftueQuests.ts'
import { createNewGameCharacter } from '../../shared/player.ts'
import { openToOrigin } from '../../shared/origins.ts'
import { TRIAL_STAGES } from '../../shared/trialStages.ts'
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

  it('巡历宝箱每箱 5 元宝，每日最多 30，子时后重新计', () => {
    const player: Pick<PlayerDTO, 'goldIngot' | 'patrolIngot'> = { goldIngot: 0 }
    const noon = Date.UTC(2026, 10, 16, 4) // 北京时间正午
    expect(patrolCacheIngot(player, 4, noon)).toBe(20)
    expect(patrolCacheIngot(player, 4, noon + 60_000)).toBe(10)
    expect(patrolCacheIngot(player, 1, noon + 120_000)).toBe(0)
    expect(patrolCacheIngot(player, 1, noon + 86_400_000)).toBe(5)
    expect(player.goldIngot).toBe(35)
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
