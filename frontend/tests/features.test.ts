import { describe, expect, it } from 'vitest'
import {
  FEATURES, featureLockedText, featureRequirementText, featureUnlocked, markFeatureSeen, nextFeature, unseenFeature,
} from '../../shared/features.ts'
import { currentFtueQuest, FTUE_QUESTS, ftueVolumeDone } from '../../shared/ftueQuests.ts'
import { createNewGameCharacter, createStarterCharacter } from '../../shared/player.ts'
import { newStore, playNode } from './helpers'

const fresh = () => createNewGameCharacter({ id: 'gate', nickname: '新人', avatarId: 'hero_sword' }, 0).player

describe('玩法随剧情开放 · 规则', () => {
  it('新角色带开放标记，老角色与演武阵容没有，全部开放', () => {
    const player = fresh()
    expect(player.featureGate).toBe(true)
    expect(FEATURES.every(({ id }) => !featureUnlocked(player, id))).toBe(true)
    const veteran = createStarterCharacter({ id: 'old', nickname: '老手', avatarId: 'hero_sword' }, 0).player
    expect(FEATURES.every(({ id }) => featureUnlocked(veteran, id))).toBe(true)
    expect(unseenFeature(veteran)).toBeUndefined()
  })

  it('条件从主线、历练与境界推出；每日江湖事要客栈与丹房都开放', () => {
    const player = fresh()
    player.maxChapterId = 2
    expect(featureUnlocked(player, 'TRIAL')).toBe(true)
    expect(featureUnlocked(player, 'INN')).toBe(false)
    player.maxChapterId = 3
    expect(featureUnlocked(player, 'INN')).toBe(true)
    expect(featureUnlocked(player, 'DAILY')).toBe(false)
    player.trial.rewardedStageIds = [1, 2, 3]
    expect(featureUnlocked(player, 'MAPS')).toBe(true)
    expect(featureUnlocked(player, 'DAILY')).toBe(true)
    expect(featureUnlocked(player, 'SECT')).toBe(false)
    player.realmTier = 2
    expect(featureUnlocked(player, 'SECT')).toBe(true)
    expect(nextFeature(player)?.id).toBe('GACHA')
  })

  it('开放条件写明是哪一关', () => {
    expect(featureRequirementText('INN')).toBe('通关主线 1-2「醉仙楼头 · 烟雨试招」')
    expect(featureRequirementText('MAPS')).toBe('首胜历练第 03 关「法华古寺 · 焦木盲僧」')
    expect(featureRequirementText('SECT')).toBe('突破境界「略有小成」')
    expect(featureRequirementText('DAILY')).toBe('通关主线 1-2「醉仙楼头 · 烟雨试招」，并首胜历练第 03 关「法华古寺 · 焦木盲僧」')
    expect(featureLockedText('GHOST')).toBe('「子时鬼市」尚未开放：首胜历练第 08 关「张家口外 · 黄河四鬼截道」后开放')
  })

  it('剧情卡按开放先后排队；没开放的不能先记已读', () => {
    const player = fresh()
    expect(unseenFeature(player)).toBeUndefined()
    expect(markFeatureSeen(player, 'TRIAL')).toBe(false)
    player.maxChapterId = 3
    expect(unseenFeature(player)?.id).toBe('TRIAL')
    expect(markFeatureSeen(player, 'TRIAL')).toBe(true)
    expect(markFeatureSeen(player, 'TRIAL')).toBe(false)
    expect(unseenFeature(player)?.id).toBe('INN')
  })
})

describe('玩法随剧情开放 · 本地试玩', () => {
  it('新游戏只开修行、江湖、武库；未开放的玩法不出手，只提示开放条件', () => {
    const s = newStore('NEW', { gated: true })
    expect(s.player.featureGate).toBe(true)
    expect(['CULTIVATE', 'JIANGHU', 'ARSENAL'].every((tab) => s.mainTabOpen(tab as never))).toBe(true)
    expect(s.mainTabOpen('MARKET')).toBe(false)
    expect(s.mainTabOpen('SECT')).toBe(false)
    expect(s.jianghuTab).toBe('STORY')

    s.selectTab('MARKET')
    expect(s.activeTab).not.toBe('MARKET')
    expect(s.toasts.at(-1)?.text).toBe(featureLockedText('INN'))

    // 历练页签跳不过去，直接调用也不开打
    s.jianghuTab = 'TRIAL'
    expect(s.jianghuTab).toBe('STORY')
    s.challengeTrialStage(1)
    expect(s.activeBattle).toBeNull()
    expect(s.toasts.at(-1)?.text).toBe(featureLockedText('TRIAL'))
    expect(s.featureCard).toBeUndefined()
  })

  it('打过主线 1-1 弹出忘机客的剧情卡，看完前往历练并记下已读', () => {
    const s = newStore('NEW', { gated: true })
    expect(playNode(s, 1)).toBe('ALLY')
    expect(s.featureOpen('TRIAL')).toBe(true)
    expect(s.featureCard?.id).toBe('TRIAL')
    expect(s.upcomingFeature?.id).toBe('INN')

    s.closeFeatureCard(true)
    expect(s.player.featuresSeen).toEqual(['TRIAL'])
    expect(s.featureCard).toBeUndefined()
    expect(s.activeTab).toBe('JIANGHU')
    expect(s.jianghuTab).toBe('TRIAL')

    s.saveNow()
    const resumed = newStore()
    resumed.continueGame()
    expect(resumed.player.featureGate).toBe(true)
    expect(resumed.player.featuresSeen).toEqual(['TRIAL'])
    expect(resumed.featureCard).toBeUndefined()
  })

  it('演武模式不受限', () => {
    const s = newStore('DEMO')
    expect(FEATURES.every(({ id }) => s.featureOpen(id))).toBe(true)
    expect(s.featureCard).toBeUndefined()
  })
})

describe('江湖行历 · 剧情带路', () => {
  it('旧版十阶的编号不变，新加的从 11 起；当前一阶是顺序里第一个没领的', () => {
    expect(FTUE_QUESTS.filter(({ id }) => id <= 10).map(({ id }) => id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(new Set(FTUE_QUESTS.map(({ id }) => id)).size).toBe(FTUE_QUESTS.length)
    expect(currentFtueQuest(undefined)?.id).toBe(1)
    expect(currentFtueQuest({ index: 10, claimed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], forageCount: 0, refinedRecipeIds: [] })?.id).toBe(11)
    const volumeOne = FTUE_QUESTS.filter(({ volume }) => volume === 1).map(({ id }) => id)
    expect(ftueVolumeDone({ index: 0, claimed: volumeOne, forageCount: 0, refinedRecipeIds: [] }, 1)).toBe(true)
    expect(ftueVolumeDone({ index: 0, claimed: volumeOne.slice(1), forageCount: 0, refinedRecipeIds: [] }, 1)).toBe(false)
  })

  it('每一阶的「前往」在轮到它时都已开放', () => {
    const s = newStore('NEW', { gated: true })
    s.player.maxChapterId = 2 // 行历从序章打完之后开始
    for (const quest of FTUE_QUESTS) {
      expect(s.mainTabOpen(quest.jumpTab), quest.title).toBe(true)
      if (quest.jumpTab === 'JIANGHU' && quest.jumpSub) expect(s.jianghuTabOpen(quest.jumpSub as never), quest.title).toBe(true)
      if (quest.jumpTab === 'MARKET' && quest.jumpSub) expect(s.marketTabOpen(quest.jumpSub as never), quest.title).toBe(true)
      // 达成这一阶：历练、主线、境界会推动玩法开放，其余不影响
      if (quest.targetType === 'STORY') s.player.trial.rewardedStageIds.push(Number(quest.targetValue))
      if (quest.targetType === 'NODE') s.player.maxChapterId = Math.max(s.player.maxChapterId, Number(quest.targetValue) + 1)
      if (quest.targetType === 'BREAKTHROUGH') s.player.realmTier = Number(quest.targetValue)
    }
  })

  it('新游戏过完序章，行历指向荒山，领赏后接着冲穴，并预告下一个机缘', () => {
    const s = newStore('NEW', { gated: true })
    playNode(s, 1)
    s.closeFeatureCard(false)
    expect(s.ftueQuest?.id).toBe(1)
    s.gotoFtueTarget()
    expect([s.activeTab, s.jianghuTab]).toEqual(['JIANGHU', 'TRIAL'])
    s.challengeTrialStage(1)
    s.skipBattleToEnd()
    expect(s.activeBattle?.winner).toBe('ALLY')
    s.closeBattleStage()
    s.claimFtueReward()
    expect(s.ftue.claimed).toEqual([1])
    expect(s.ftueQuest?.id).toBe(2)
    expect(s.upcomingFeature?.id).toBe('INN')
  })
})
