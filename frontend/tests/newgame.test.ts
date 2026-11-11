import { describe, expect, it, vi } from 'vitest'
import { affinityCapFor, COMPANIONS, STORY_CHAPTERS } from '@/config/gameData'
import { simulateServerBattle } from '@/network/mockEngine'
import { boost, newStore, playNode, resolvePending } from './helpers'

describe('新游戏：开局与新手引导', () => {
  it('Lv.1、0 伙伴、无武学，只有青钢剑', () => {
    const s = newStore('NEW')
    expect(s.gameMode).toBe('NEW')
    expect(s.limitsEnabled).toBe(true)
    expect(s.player.level).toBe(1)
    expect(s.player.maxChapterId).toBe(1)
    expect(s.pendingAdventure).toBeNull()
    expect(Object.values(s.companionAffinity).every((c) => !c.recruited && !c.met)).toBe(true)
    expect(s.currentLoadout.outerSkillId).toBeNull()
    expect(s.currentLoadout.ultSkillId).toBeNull()
    expect(s.currentLoadout.leftCompanionId).toBeNull()
    expect(s.currentLoadout.weaponId).toBe('qinggang_sword')
  })

  it('空武学槽不会白送《亢龙有悔》；空手能赢 1-1，奖励自动装配到三套预设', () => {
    const s = newStore('NEW')
    s.challengeChapter(1)
    expect(s.activeBattle!.events.every((e) => e.skillId !== 'kanglong_youhui')).toBe(true)
    s.skipBattleToEnd()
    expect(s.activeBattle?.winner).toBe('ALLY')
    s.closeBattleStage()
    expect(s.player.maxChapterId).toBe(2)
    expect(s.currentLoadout.outerSkillId).toBe('kaishan_zhang')
    expect(s.currentLoadout.accId).toBe('iron_bagua')
    expect(Object.values(s.presets).every((p) => p.outerSkillId === 'kaishan_zhang')).toBe(true)
  })

  it('剧情送：1-2 通关后郭靖、柯镇恶直接入队，郭靖为少年紫品形态', () => {
    const s = newStore('NEW')
    playNode(s, 1)
    s.player.level = 3
    expect(playNode(s, 2)).toBe('ALLY')
    expect(s.companionAffinity.guojing.recruited).toBe(true)
    expect(s.companionAffinity.kezhene.recruited).toBe(true)
    expect(s.companionOf('guojing')).toMatchObject({ tier: 'purple', form: 'base' })
  })
})

describe('新游戏：客栈送礼限制', () => {
  function withGuojing() {
    const s = newStore('NEW')
    playNode(s, 1)
    s.player.level = 3
    playNode(s, 2)
    s.player.silver = 999999
    return s
  }

  it('每日清茶 3 次、爱物 1 次，被拒时不扣银', () => {
    const s = withGuojing()
    const g = s.companionAffinity.guojing
    const before = g.affinity
    for (let i = 0; i < 5; i++) s.giftCompanionInInn('guojing', false)
    expect(g.affinity - before).toBe(60)
    expect(s.giftsLeft('guojing')).toEqual({ tea: 0, gift: 1 })
    const silver = s.player.silver
    s.giftCompanionInInn('guojing', false)
    expect(s.player.silver).toBe(silver)
    s.giftCompanionInInn('guojing', true)
    s.giftCompanionInInn('guojing', true)
    expect(g.affinity - before).toBe(140)
  })

  it('子时之后次数刷新', () => {
    const s = withGuojing()
    for (let i = 0; i < 3; i++) s.giftCompanionInInn('guojing', false)
    expect(s.giftsLeft('guojing').tea).toBe(0)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 86400_000)
    expect(s.giftsLeft('guojing')).toEqual({ tea: 3, gift: 1 })
  })

  it('好感随章节封顶（300 / 600 / 1000），触顶不涨好感、不扣银', () => {
    const s = withGuojing()
    expect(s.affinityCap).toBe(300)
    s.companionAffinity.kezhene.affinity = 299
    s.giftCompanionInInn('kezhene', false)
    expect(s.companionAffinity.kezhene.affinity).toBe(300)
    const silver = s.player.silver
    s.giftCompanionInInn('kezhene', true)
    expect(s.companionAffinity.kezhene.affinity).toBe(300)
    expect(s.player.silver).toBe(silver)
    expect([1, 10, 11, 16, 17].map(affinityCapFor)).toEqual([300, 300, 600, 600, 1000])
  })

  it('演武模式不设限', () => {
    const s = newStore('DEMO')
    expect(s.affinityCap).toBe(1000)
    expect(s.giftsLeft('guojing').tea).toBe(Infinity)
  })
})

describe('新游戏：形态与觉醒', () => {
  it('郭靖：信物不足不能觉醒；觉醒后为橙品成熟形态，战斗中血量随之提升', () => {
    const s = newStore('NEW')
    const gj = s.companionAffinity.guojing
    Object.assign(gj, { met: true, recruited: true, affinity: 700, tokens: 10 })
    s.awakenCompanion('guojing')
    expect(gj.form).toBe('base')

    s.currentLoadout.leftCompanionId = 'guojing'
    const leftHp = () =>
      simulateServerBattle({
        sceneTitle: 'x', mode: 'SOLO_STORY', player: s.player, loadout: s.currentLoadout,
        enemyMain: { name: '木桩', title: '', portrait: 'bandit', hp: 9999, atk: 10, mp: 10, stance: 'FIERCE' },
        companionOf: s.companionOf,
      }).units.find((u) => u.slot === 'ALLY_LEFT')!.maxHp
    const baseHp = leftHp()
    gj.tokens = 30
    s.awakenCompanion('guojing')
    expect(gj.form).toBe('awakened')
    expect(gj.tokens).toBe(0)
    expect(s.companionOf('guojing')).toMatchObject({ tier: 'orange', baseHp: 7500 })
    expect(leftHp()).toBeGreaterThan(baseHp)
  })

  it('洪七公：基础为橙·下（×0.88），觉醒为红品', () => {
    const s = newStore('NEW')
    const hq = s.companionAffinity.hongqigong
    hq.met = true
    expect(s.companionOf('hongqigong')).toMatchObject({ tier: 'orange', grade: '下', baseHp: Math.round(7600 * 0.88) })
    Object.assign(hq, { recruited: true, affinity: 650, tokens: 60 })
    s.awakenCompanion('hongqigong')
    expect(s.companionOf('hongqigong')).toMatchObject({ tier: 'red', grade: null, baseHp: 9600 })
  })
})

describe('新游戏：通关射雕后伙伴路线一致', () => {
  it('剧情送全部入队，好感线只结识，抽卡线未结识', () => {
    const s = newStore('NEW')
    s.player.silver = 9_999_999
    boost(s)
    s.player.stats.karma = 100
    for (let id = 1; id <= 16; id++) {
      expect(playNode(s, id), STORY_CHAPTERS[id - 1].code).toBe('ALLY')
      // 荒山抉择选「放下屠刀」让梅超风入队，其余优先选可选的甲
      resolvePending(s, (tid) => (tid === 'huangshan_bishou' ? 'B' : undefined))
    }
    const CA = s.companionAffinity
    const of = (r: string) => Object.values(COMPANIONS).filter((c) => c.route === r)
    for (const c of of('STORY')) expect(CA[c.id].recruited, `${c.name} 好感 ${CA[c.id].affinity}`).toBe(true)
    for (const c of of('AFFINITY')) expect(CA[c.id].met && !CA[c.id].recruited, `${c.name} 好感 ${CA[c.id].affinity}`).toBe(true)
    for (const c of of('GACHA')) expect(CA[c.id].met, c.name).toBe(false)
  })
})
