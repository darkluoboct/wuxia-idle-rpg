import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BattleReportDTO } from '@/network/protocol'
import {
  advanceXiangyangGate, localXiangyangGate, xiangyangBotSorties, XIANGYANG_ORDERS, XIANGYANG_WAVES, xiangyangMerit, xiangyangReward,
  xiangyangWar, xiangyangWarOf, xiangyangWave, xiangyangWaveNeed,
} from '../../shared/xiangyang.ts'
import { featureRequirementText } from '../../shared/features.ts'
import { boost, newStore } from './helpers'

const beijing = (text: string) => Date.parse(`${text}+08:00`)

describe('襄阳守卫战 · 规则', () => {
  it('每周三、周日 20:00 开战半个时辰；场次连号，未开战时给下一场', () => {
    const wednesday = xiangyangWar(beijing('2026-11-18T20:10:00'))
    expect(wednesday).toMatchObject({ opensAt: beijing('2026-11-18T20:00:00'), closesAt: beijing('2026-11-18T20:30:00'), active: true })
    const sunday = xiangyangWar(beijing('2026-11-18T20:30:00'))
    expect(sunday).toMatchObject({ id: wednesday.id + 1, opensAt: beijing('2026-11-22T20:00:00'), active: false })
    expect(xiangyangWar(beijing('2026-11-23T09:00:00'))).toMatchObject({ id: wednesday.id + 2, opensAt: beijing('2026-11-25T20:00:00') })
    expect(xiangyangWarOf(wednesday.id - 1).opensAt).toBe(beijing('2026-11-15T20:00:00'))
    expect(featureRequirementText('XIANGYANG')).toBe('通关主线 2-3「终南金雁 · 重阳问道」')
  })

  it('敌军随波次与等级变强；第五波起首领蓄力，第八波换作大将；三门各有特点', () => {
    const first = xiangyangWave('EAST', 1, 30)
    const last = xiangyangWave('EAST', 8, 30)
    expect(last.enemyMain.hp).toBeGreaterThan(first.enemyMain.hp)
    expect(xiangyangWave('EAST', 1, 40).enemyMain.atk).toBeGreaterThan(first.enemyMain.atk)
    expect(first.enemyMain.combat?.charge).toBeUndefined()
    expect(xiangyangWave('EAST', 5, 30).enemyMain.combat?.charge?.name).toBe('铁骑践踏')
    expect(last.enemyMain).toMatchObject({ name: '怯薛万夫长', isBoss: true })
    expect(first.enemyGuards).toHaveLength(2)
    expect(first.enemyMain.combat).toMatchObject({ faction: 'MONGOL', mounted: true })
    expect(xiangyangWave('NORTH', 1, 30).enemyMain.combat?.heavyArmor).toBe(true)
    expect(xiangyangWave('WATER', 1, 30).environment).toEqual({ water: true, night: true })
  })

  it('战功按打掉的气血折算：首领三份、兵卒各一份，满额 50，打赢加 5', () => {
    const unit = (slot: string, hp: number) => ({ slot, hp, maxHp: hp }) as BattleReportDTO['units'][number]
    const units = [unit('ALLY_MAIN', 1000), unit('ENEMY_MAIN', 1000), unit('ENEMY_LEFT', 400), unit('ENEMY_RIGHT', 400)]
    const hit = (targetSlot: string, hpDelta: number) => ({ round: 1, type: 'ATTACK', actorSlot: 'ALLY_MAIN', targetSlot, hpDelta, segments: [] }) as unknown as BattleReportDTO['events'][number]
    expect(xiangyangMerit({ units, events: [hit('ENEMY_MAIN', -500), hit('ENEMY_LEFT', -9999), hit('ALLY_MAIN', -300)], winner: 'ENEMY' })).toBe(25)
    expect(xiangyangMerit({ units, events: [hit('ENEMY_MAIN', -1000), hit('ENEMY_LEFT', -400), hit('ENEMY_RIGHT', -400)], winner: 'ALLY' })).toBe(55)
  })

  it('每波所需随守军人数；一份战功可连破数波，八波破完封顶', () => {
    expect(xiangyangWaveNeed(0)).toBe(30)
    expect(xiangyangWaveNeed(4)).toBe(120)
    expect(advanceXiangyangGate({ wave: 1, progress: 20 }, 55, 2)).toEqual({ wave: 2, progress: 15, repelled: [1] })
    expect(advanceXiangyangGate({ wave: 7, progress: 0 }, 70, 1)).toEqual({ wave: 9, progress: 0, repelled: [7, 8] })
    expect(advanceXiangyangGate({ wave: 9, progress: 0 }, 55, 1)).toEqual({ wave: 9, progress: 0, repelled: [] })
  })

  it('封赏：参战即有元宝与铸造材料，击退越多材料越多，本门前三加赏', () => {
    expect(xiangyangReward({ merit: 0, sorties: 0 }, 8, 30, true)).toBeUndefined()
    expect(xiangyangReward({ merit: 220, sorties: 5 }, 6, 30, false)).toEqual({ ingot: 20, iron: 4, stones: 2, fragments: 3, qiExp: 3300, silver: 880 })
    expect(xiangyangReward({ merit: 275, sorties: 5 }, 8, 30, true)).toMatchObject({ iron: 6, stones: 3, fragments: 5 })
  })

  it('本地模拟守军由场次与城门定死，按时间先后记入城门', () => {
    const war = xiangyangWarOf(3000)
    expect(xiangyangBotSorties(3000, 'EAST')).toEqual(xiangyangBotSorties(3000, 'EAST'))
    const bots = xiangyangBotSorties(3000, 'NORTH')
    expect(bots.every(({ at }) => at >= war.opensAt && at < war.closesAt)).toBe(true)
    expect(bots.length % XIANGYANG_ORDERS).toBe(0)
    const before = localXiangyangGate(3000, 'NORTH', war.opensAt - 1, [])
    expect(before.state).toEqual({ wave: 1, progress: 0 })
    const after = localXiangyangGate(3000, 'NORTH', war.closesAt, [])
    expect(after.state.wave).toBeGreaterThan(1)
    expect(after.feed).toHaveLength(bots.length)
  })
})

describe('襄阳守卫战 · 本地试玩', () => {
  afterEach(() => { vi.useRealTimers() })

  it('开战时选一门出战，五道军令用完为止；收兵后领赏，残页落在出战时的外功上', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(beijing('2026-11-18T20:05:00'))
    const s = newStore('NEW', { origin: 'jiangmen' })
    boost(s, 30)
    s.learnedSkills.beiwei_qiang = 1
    s.updateLoadout({ outerSkillId: 'beiwei_qiang' })
    const war = xiangyangWar(Date.now())
    const fight = (gate: 'EAST' | 'NORTH') => {
      s.xiangyangAction({ action: 'sortie', warId: war.id, gate })
      s.skipBattleToEnd()
      s.closeBattleStage()
    }
    fight('EAST')
    expect(s.xiangyangBoard?.self).toMatchObject({ gate: 'EAST', sorties: 1 })
    fight('NORTH')
    expect(s.toasts.at(-1)?.text).toBe('本场你守的是东门，不能换门')
    for (let i = 0; i < XIANGYANG_ORDERS; i++) fight('EAST')
    expect(s.xiangyangBoard?.self?.sorties).toBe(XIANGYANG_ORDERS)
    expect(s.toasts.at(-1)?.text).toBe(`本场 ${XIANGYANG_ORDERS} 道军令已经用完`)
    const merit = s.xiangyangBoard!.self!.merit
    expect(merit).toBeGreaterThan(0)
    expect(s.xiangyangBoard!.gates.find(({ id }) => id === 'EAST')!.wave).toBeGreaterThan(1)

    vi.setSystemTime(war.closesAt + 60_000)
    void s.refreshXiangyang()
    const [award] = s.xiangyangBoard!.awards
    expect(award).toMatchObject({ warId: war.id, gate: 'EAST', merit, sorties: XIANGYANG_ORDERS, skillId: 'beiwei_qiang' })
    const ingot = s.player.goldIngot
    s.xiangyangAction({ action: 'claim', warId: war.id })
    expect(s.player.goldIngot).toBe(ingot + award.reward.ingot)
    expect(s.player.skillFragments?.beiwei_qiang).toBe(award.reward.fragments)
    expect(s.player.equipmentForge?.iron).toBeGreaterThanOrEqual(award.reward.iron)
    expect(s.xiangyangBoard!.awards).toEqual([])
    s.xiangyangAction({ action: 'claim', warId: war.id })
    expect(s.player.goldIngot).toBe(ingot + award.reward.ingot)
  })

  it('平日只能演练：不耗军令、不记战功；存档读回出战记录', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(beijing('2026-11-19T10:00:00'))
    const s = newStore('NEW', { origin: 'yujia' })
    boost(s, 30)
    const war = xiangyangWar(Date.now())
    s.xiangyangAction({ action: 'sortie', warId: war.id, gate: 'WATER' })
    expect(s.activeBattle).toBeNull()
    s.xiangyangAction({ action: 'drill', gate: 'WATER', wave: XIANGYANG_WAVES })
    expect(s.activeBattle?.sceneTitle).toBe('城头演练 · 水路粮道第 8 波')
    s.skipBattleToEnd()
    s.closeBattleStage()
    expect(s.xiangyangBoard?.self).toBeNull()

    vi.setSystemTime(war.opensAt + 60_000)
    s.xiangyangAction({ action: 'sortie', warId: war.id, gate: 'WATER' })
    s.skipBattleToEnd()
    s.closeBattleStage()
    s.saveNow()
    const resumed = newStore()
    resumed.continueGame()
    void resumed.refreshXiangyang()
    expect(resumed.xiangyangBoard?.self).toMatchObject({ gate: 'WATER', sorties: 1 })
  })

  it('新角色打过主线 2-3 才开放', () => {
    const s = newStore('NEW', { gated: true })
    expect(s.jianghuTabOpen('XIANGYANG')).toBe(false)
    s.player.maxChapterId = 7
    expect(s.jianghuTabOpen('XIANGYANG')).toBe(true)
  })
})
