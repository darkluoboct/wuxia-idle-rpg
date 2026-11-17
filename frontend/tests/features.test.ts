import { describe, expect, it } from 'vitest'
import {
  FEATURES, featureLockedText, featureRequirementText, featureUnlocked, markFeatureSeen, nextFeature, unseenFeature,
} from '../../shared/features.ts'
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
