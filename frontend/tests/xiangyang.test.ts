import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BattleReportDTO } from '@/network/protocol'
import {
  advanceXiangyangGate, localXiangyangGate, xiangyangAutoTurn, xiangyangBotSorties, xiangyangDrum, xiangyangDrumMerit, xiangyangFullOrders,
  XIANGYANG_ORDERS, XIANGYANG_WAVES, xiangyangMerit, xiangyangNextAuto, xiangyangNextOrderAt, xiangyangOrdersAt, xiangyangReward, xiangyangSpendOrder,
  xiangyangWar, xiangyangWarOf, xiangyangWave, xiangyangWaveNeed,
} from '../../shared/xiangyang.ts'
import { INGOT } from '../../shared/economy.ts'
import { featureRequirementText } from '../../shared/features.ts'
import { boost, newStore } from './helpers'

const beijing = (text: string) => Date.parse(`${text}+08:00`)
const HOUR = 3_600_000

describe('襄阳守卫战 · 规则', () => {
  it('每周一场，周一 00:00 到下周一 00:00，一场接一场；周三、周日 20:00 起擂鼓一个时辰', () => {
    const war = xiangyangWar(beijing('2026-11-18T10:00:00'))
    expect(war).toEqual({ id: war.id, opensAt: beijing('2026-11-16T00:00:00'), closesAt: beijing('2026-11-23T00:00:00') })
    expect(xiangyangWar(war.closesAt)).toEqual(xiangyangWarOf(war.id + 1))
    expect(xiangyangWarOf(war.id + 1).opensAt).toBe(war.closesAt)
    expect(xiangyangDrum(beijing('2026-11-18T20:10:00'))).toEqual({ opensAt: beijing('2026-11-18T20:00:00'), closesAt: beijing('2026-11-18T21:00:00'), active: true })
    expect(xiangyangDrum(beijing('2026-11-18T21:00:00'))).toMatchObject({ opensAt: beijing('2026-11-22T20:00:00'), active: false })
    expect(xiangyangDrum(beijing('2026-11-22T21:30:00'))).toMatchObject({ opensAt: beijing('2026-11-25T20:00:00'), active: false })
    expect(featureRequirementText('XIANGYANG')).toBe('通关主线 2-3「终南金雁 · 重阳问道」')
  })

  it('军令每 8 小时回一道、最多三道；一场最多打出 23 道', () => {
    const war = xiangyangWarOf(3000)
    const at = (hours: number) => war.opensAt + hours * HOUR
    expect(XIANGYANG_ORDERS).toBe(23)
    const fresh = xiangyangFullOrders(at(10))
    expect(xiangyangOrdersAt(war, fresh, at(30))).toBe(3)
    expect(xiangyangNextOrderAt(war, fresh, at(30))).toBeNull()
    const spent = xiangyangSpendOrder(war, xiangyangSpendOrder(war, fresh, at(10)), at(10))
    expect(spent).toEqual({ stored: 1, asOf: at(10) })
    expect(xiangyangOrdersAt(war, spent, at(15))).toBe(1)
    expect(xiangyangNextOrderAt(war, spent, at(15))).toBe(at(16))
    expect(xiangyangOrdersAt(war, spent, at(16))).toBe(2)
    expect(xiangyangOrdersAt(war, spent, at(40))).toBe(3)
    // 收兵那一刻不再回
    expect(xiangyangOrdersAt(war, { stored: 0, asOf: at(161) }, war.closesAt)).toBe(0)
    expect(xiangyangNextOrderAt(war, { stored: 0, asOf: at(161) }, at(161))).toBeNull()
  })

  it('值守：攒满后再回一道时镜像出战一次；收兵时把余下的打完；本场打完排到下一场第一次满溢', () => {
    const war = xiangyangWarOf(3000)
    const at = (hours: number) => war.opensAt + hours * HOUR
    expect(xiangyangNextAuto(war, xiangyangFullOrders(war.opensAt))).toEqual({ at: at(8), warId: war.id })
    expect(xiangyangNextAuto(war, { stored: 0, asOf: at(10) })).toEqual({ at: at(40), warId: war.id })
    expect(xiangyangAutoTurn(war, xiangyangFullOrders(at(39)), at(40))).toEqual({ count: 1, orders: xiangyangFullOrders(at(40)) })
    expect(xiangyangNextAuto(war, { stored: 1, asOf: at(150) })).toEqual({ at: war.closesAt, warId: war.id })
    expect(xiangyangAutoTurn(war, { stored: 1, asOf: at(150) }, war.closesAt)).toEqual({ count: 3, orders: { stored: 0, asOf: war.closesAt } })
    const next = xiangyangWarOf(war.id + 1)
    expect(xiangyangNextAuto(war, { stored: 0, asOf: war.closesAt })).toEqual({ at: next.opensAt + 8 * HOUR, warId: next.id })
    // 一直挂机：开场三道 + 二十次回复，全由镜像打出
    let orders = xiangyangFullOrders(war.opensAt)
    let fought = 0
    for (let due = xiangyangNextAuto(war, orders); due.warId === war.id; due = xiangyangNextAuto(war, orders)) {
      const turn = xiangyangAutoTurn(war, orders, due.at)
      fought += turn.count
      orders = turn.orders
    }
    expect(fought).toBe(XIANGYANG_ORDERS)
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

  it('战功按打掉的气血折算：首领三份、兵卒各一份，满额 50，打赢加 5；擂鼓时亲自出战加五成', () => {
    const unit = (slot: string, hp: number) => ({ slot, hp, maxHp: hp }) as BattleReportDTO['units'][number]
    const units = [unit('ALLY_MAIN', 1000), unit('ENEMY_MAIN', 1000), unit('ENEMY_LEFT', 400), unit('ENEMY_RIGHT', 400)]
    const hit = (targetSlot: string, hpDelta: number) => ({ round: 1, type: 'ATTACK', actorSlot: 'ALLY_MAIN', targetSlot, hpDelta, segments: [] }) as unknown as BattleReportDTO['events'][number]
    expect(xiangyangMerit({ units, events: [hit('ENEMY_MAIN', -500), hit('ENEMY_LEFT', -9999), hit('ALLY_MAIN', -300)], winner: 'ENEMY' })).toBe(25)
    expect(xiangyangMerit({ units, events: [hit('ENEMY_MAIN', -1000), hit('ENEMY_LEFT', -400), hit('ENEMY_RIGHT', -400)], winner: 'ALLY' })).toBe(55)
    expect(xiangyangDrumMerit(55)).toBe(83)
  })

  it('每波所需随守军人数；一份战功可连破数波，八波破完封顶', () => {
    expect(xiangyangWaveNeed(0)).toBe(140)
    expect(xiangyangWaveNeed(4)).toBe(560)
    expect(advanceXiangyangGate({ wave: 1, progress: 100 }, 55, 1)).toEqual({ wave: 2, progress: 15, repelled: [1] })
    expect(advanceXiangyangGate({ wave: 7, progress: 0 }, 290, 1)).toEqual({ wave: 9, progress: 0, repelled: [7, 8] })
    expect(advanceXiangyangGate({ wave: 9, progress: 0 }, 55, 1)).toEqual({ wave: 9, progress: 0, repelled: [] })
  })

  it('封赏：参战即有元宝与铸造材料，击退越多材料越多，本门前三加赏', () => {
    expect(INGOT.xiangyang).toBe(40)
    expect(xiangyangReward({ merit: 0, sorties: 0 }, 8, 30, true)).toBeUndefined()
    expect(xiangyangReward({ merit: 1100, sorties: 23 }, 6, 30, false)).toEqual({ ingot: 40, iron: 8, stones: 5, fragments: 7, qiExp: 6600, silver: 2200 })
    expect(xiangyangReward({ merit: 1700, sorties: 23 }, 8, 30, true)).toMatchObject({ iron: 12, stones: 6, fragments: 12 })
  })

  it('本地模拟守军由场次与城门定死，一周里各把军令打满，按时间先后记入城门', () => {
    const war = xiangyangWarOf(3000)
    expect(xiangyangBotSorties(3000, 'EAST')).toEqual(xiangyangBotSorties(3000, 'EAST'))
    const bots = xiangyangBotSorties(3000, 'NORTH')
    expect(bots.every(({ at }) => at >= war.opensAt && at < war.closesAt)).toBe(true)
    expect(bots.length % XIANGYANG_ORDERS).toBe(0)
    expect(bots.some(({ auto }) => auto)).toBe(true)
    const before = localXiangyangGate(3000, 'NORTH', war.opensAt - 1, [])
    expect(before.state).toEqual({ wave: 1, progress: 0 })
    const after = localXiangyangGate(3000, 'NORTH', war.closesAt, [])
    expect(after.state.wave).toBeGreaterThan(1)
    expect(after.feed).toHaveLength(bots.length)
  })
})

describe('襄阳守卫战 · 本地试玩', () => {
  afterEach(() => { vi.useRealTimers() })

  const fight = (s: ReturnType<typeof newStore>, gate: 'EAST' | 'NORTH' | 'WATER') => {
    s.xiangyangAction({ action: 'sortie', warId: s.xiangyangBoard!.war.id, gate })
    s.skipBattleToEnd()
    s.closeBattleStage()
  }

  it('随时可出战，一场只守一门；出战即值守，下线后军令攒满由镜像替你出战，收兵时打完余下的；收功顺带领赏', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(beijing('2026-11-18T10:00:00'))
    const s = newStore('NEW', { origin: 'jiangmen' })
    boost(s, 30)
    s.learnedSkills.beiwei_qiang = 1
    s.updateLoadout({ outerSkillId: 'beiwei_qiang' })
    await s.refreshXiangyang()
    const war = s.xiangyangBoard!.war
    expect(s.xiangyangBoard).toMatchObject({ self: null, post: null, orders: { count: 3, nextAt: null } })

    fight(s, 'EAST')
    expect(s.xiangyangBoard).toMatchObject({ self: { gate: 'EAST', sorties: 1, autoSorties: 0 }, post: { gate: 'EAST' }, orders: { count: 2 } })
    fight(s, 'NORTH')
    expect(s.toasts.at(-1)?.text).toBe('本场你守的是东门，不能换门；改值守从下一场起算')
    fight(s, 'EAST')
    fight(s, 'EAST')
    fight(s, 'EAST')
    expect(s.toasts.at(-1)?.text).toBe('手上没有军令了，每 8 小时回一道')
    expect(s.xiangyangBoard).toMatchObject({
      self: { sorties: 3 }, orders: { count: 0, nextAt: beijing('2026-11-18T16:00:00') }, post: { nextAutoAt: beijing('2026-11-19T16:00:00') },
    })

    // 周四上午：回了三道还没满溢，镜像没动
    vi.setSystemTime(beijing('2026-11-19T10:00:00'))
    await s.refreshXiangyang()
    expect(s.xiangyangBoard).toMatchObject({ self: { sorties: 3, autoSorties: 0 }, orders: { count: 3, nextAt: null } })
    // 周五上午：周四 16:00、周五 00:00、08:00 三次满溢，镜像各打一次
    vi.setSystemTime(beijing('2026-11-20T10:00:00'))
    await s.refreshXiangyang()
    expect(s.xiangyangBoard).toMatchObject({ self: { sorties: 6, autoSorties: 3 }, orders: { count: 3 } })
    expect(s.xiangyangBoard!.feed.some(({ auto, nickname }) => auto && nickname === s.player.nickname)).toBe(true)

    // 收兵后：此后七次满溢加收兵时的三道，一共 16 次；收功顺带领赏
    vi.setSystemTime(war.closesAt + 60_000)
    await s.refreshXiangyang()
    const [award] = s.xiangyangBoard!.awards
    expect(award).toMatchObject({ warId: war.id, gate: 'EAST', sorties: 16, skillId: 'beiwei_qiang' })
    const ingot = s.player.goldIngot
    // 只看封赏：巡历与打坐刚结算过，收功不再掉别的元宝
    s.player.lastSettleAt = Date.now()
    s.player.trial.lastPatrolAt = Date.now()
    s.settleOfflineQi()
    expect(s.player.goldIngot).toBe(ingot + INGOT.xiangyang)
    expect(s.player.skillFragments?.beiwei_qiang).toBe(award.reward.fragments)
    await s.refreshXiangyang()
    expect(s.xiangyangBoard!.awards).toEqual([])
    s.xiangyangAction({ action: 'claim', warId: war.id })
    expect(s.player.goldIngot).toBe(ingot + INGOT.xiangyang)
  })

  it('擂鼓时亲自出战战功加五成；改值守从下一场起算；演练随时可打、不耗军令；存档读回值守', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(beijing('2026-11-18T20:05:00'))
    const s = newStore('NEW', { origin: 'yujia' })
    boost(s, 30)
    await s.refreshXiangyang()
    const war = s.xiangyangBoard!.war
    s.xiangyangAction({ action: 'drill', gate: 'WATER', wave: XIANGYANG_WAVES })
    expect(s.activeBattle?.sceneTitle).toBe('城头演练 · 水路粮道第 8 波')
    s.skipBattleToEnd()
    s.closeBattleStage()
    expect(s.xiangyangBoard).toMatchObject({ self: null, orders: { count: 3 } })

    fight(s, 'WATER')
    expect(s.toasts.at(-1)?.text).toContain('擂鼓加五成')
    expect(s.xiangyangBoard!.feed.find(({ nickname }) => nickname === s.player.nickname)).toMatchObject({ drum: true })
    s.xiangyangAction({ action: 'post', gate: 'NORTH' })
    expect(s.toasts.at(-1)?.text).toBe('本场仍守原门，下一场起改守北门')
    expect(s.xiangyangBoard).toMatchObject({ self: { gate: 'WATER' }, post: { gate: 'NORTH' } })

    s.saveNow()
    const resumed = newStore()
    resumed.continueGame()
    await resumed.refreshXiangyang()
    expect(resumed.xiangyangBoard).toMatchObject({ self: { gate: 'WATER', sorties: 1 }, post: { gate: 'NORTH' } })

    // 下一场第一次满溢，镜像去北门
    const next = xiangyangWarOf(war.id + 1)
    vi.setSystemTime(next.opensAt + 9 * HOUR)
    await resumed.refreshXiangyang()
    expect(resumed.xiangyangBoard).toMatchObject({ war: { id: next.id }, self: { gate: 'NORTH', sorties: 1, autoSorties: 1 } })
    expect(resumed.xiangyangBoard!.awards).toMatchObject([{ warId: war.id, gate: 'WATER' }])
  })

  it('新角色打过主线 2-3 才开放', () => {
    const s = newStore('NEW', { gated: true })
    expect(s.jianghuTabOpen('XIANGYANG')).toBe(false)
    s.player.maxChapterId = 7
    expect(s.jianghuTabOpen('XIANGYANG')).toBe(true)
  })
})
