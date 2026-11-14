import { describe, expect, it, vi } from 'vitest'
import type { BattleEventDTO, BattleReportDTO, LoadoutPresetDTO } from '@/network/protocol'
import { computeDerivedStats, incomingDamage, innerPressure, simulateShaoshiRaid, strikeDamage } from '../../shared/battle.ts'
import { applyDirectedDamage, battleEffectLoot, recoverHitMp, recoverRoundMp, resolveBattleLoadout } from '../../shared/battleEffects.ts'
import { COMPANIONS, companionView, ITEMS, SECTS } from '../../shared/gameData.ts'
import { TRIAL_PATROL_HOURS, trialPartId, trialStageOf } from '../../shared/trialStages.ts'
import { newStore } from './helpers'
import { player, loadout, flaskId, nanBei, enemy, agileEnemy, baseCompanion, fight, effectEvents, mainUnit, mainCast, equipped } from './battleFixtures'

it('壮骨提高实际最大气血，田厨在护盾前减免物伤，两个心法都有取得入口', () => {
  const noGear = computeDerivedStats(player, loadout)
  expect(computeDerivedStats(player, { ...loadout, innerSkillId: 'zhuanggu_jue' }).maxHp).toBe(Math.round(noGear.maxHp * 1.05))
  const baseline = fight({}, { surviveRounds: 1, rng: () => 0.99 })
  const report = fight({ innerSkillId: 'tianchu_qigong' }, { surviveRounds: 1, rng: () => 0.99 })
  const incoming = (battle: BattleReportDTO) => battle.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
  const damage = -incoming(baseline).hpDelta!
  expect(incoming(report).hpDelta).toBe(-Math.round(damage * 0.95))
  expect(incoming(report).segments).toContainEqual({ type: 'tag', text: `田厨调息法 · 盾前减伤 ${damage - Math.round(damage * 0.95)}`, tone: 'jade' })
  expect(SECTS.find(({ id }) => id === 'jiangnan_wuguan')?.signatureSkills[0]).toContain('zhuanggu_jue')
  expect(trialStageOf(2)?.clearSkillId).toBe('tianchu_qigong')
})

describe('装备免死与复活', () => {
  const henglian = 'henglian_tongjia'
  const changbai = 'changbai_canxian'
  const foxId = 'jiuwei_fox'
  const lockGear = {
    weaponId: trialPartId(henglian, 'WEAPON'), headId: trialPartId(henglian, 'HEAD'),
    armorId: trialPartId(henglian, 'ARMOR'), wristId: trialPartId(henglian, 'WRIST'),
  }
  const reviveGear = {
    weaponId: trialPartId(changbai, 'WEAPON'), headId: trialPartId(changbai, 'HEAD'),
    armorId: trialPartId(changbai, 'ARMOR'), wristId: trialPartId(changbai, 'WRIST'),
    beltId: trialPartId(changbai, 'BELT'), bootsId: trialPartId(changbai, 'BOOTS'),
  }
  const lethalEvents = (report: BattleReportDTO, sourceId: string) => effectEvents(report, sourceId)
    .filter((event) => event.segments.some((segment) => segment.type === 'tag' && / · (免死|复活|反震)$/.test(segment.text)))

  it('横练铜甲四件每战锁血一次，以实际防御反震并按敌人剩余气血截断', () => {
    const target = { ...enemy, atk: 6000 }
    const report = fight(lockGear, { enemyMain: target })
    const [saved, reflected] = lethalEvents(report, henglian)
    expect(lethalEvents(report, henglian)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN' },
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -558 },
    ])
    expect(computeDerivedStats(player, { ...loadout, ...lockGear }).def).toBe(372)
    expect(report.events[report.events.indexOf(saved) - 1]).toMatchObject({ hpDelta: 1 - mainUnit(report).maxHp })
    expect(saved.hpDelta).toBeUndefined()
    expect(saved.segments).toContainEqual({ type: 'text', text: ' 试招侠客遭遇致命一击，锁血至 1 点气血。' })
    expect(reflected.segments).toContainEqual({ type: 'damage', value: 558, category: 'reflect' })
    expect(report.events.at(-1)).toMatchObject({ round: 2, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN' })
    expect(report.winner).toBe('ENEMY')
    expect(lethalEvents(fight({ ...lockGear, wristId: null }, { enemyMain: target }), henglian)).toEqual([])

    const lowHp = fight(lockGear, { enemyMain: { ...target, hp: 500 } })
    const firstAttack = lowHp.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!
    const [weaponHit] = effectEvents(lowHp, lockGear.weaponId)
    expect(weaponHit.hpDelta).toBe(-45)
    const reflectedHp = 500 + firstAttack.hpDelta! + weaponHit.hpDelta!
    expect(reflectedHp).toBeGreaterThan(0)
    expect(reflectedHp).toBeLessThan(558)
    expect(lethalEvents(lowHp, henglian)[1]).toMatchObject({ targetSlot: 'ENEMY_MAIN', hpDelta: -reflectedHp })
    expect(lowHp.winner).toBe('ALLY')
  })

  it('九尾灵狐先锁血并回 30%，遁逃一回合后再受致死伤害才复活', () => {
    const gear = { ...reviveGear, accId: foxId }
    const wearer = { ...player, stats: { ...player.stats, agi: 10 } }
    const options = { player: wearer, enemyMain: { ...enemy, atk: 11_000 }, surviveRounds: undefined }
    const report = fight(gear, options)
    const { maxHp } = mainUnit(report)
    const recovery = Math.round(maxHp * 0.30)
    const [saved] = lethalEvents(report, foxId)
    const [revived] = lethalEvents(report, changbai)
    expect(lethalEvents(report, foxId)).toMatchObject([{ round: 1, targetSlot: 'ALLY_MAIN', hpDelta: recovery, statusApplied: '灵狐遁逃', statusRounds: 1 }])
    expect(report.events[report.events.indexOf(saved) - 1]).toMatchObject({ hpDelta: 1 - maxHp })
    expect(saved.segments).toContainEqual({ type: 'damage', value: recovery, category: 'heal' })
    expect(report.events[report.events.indexOf(saved) + 1]).toMatchObject({ effectSourceId: reviveGear.armorId, hpDelta: 60 })
    expect(report.events.find((event) => event.round === 2 && event.type === 'DODGE')?.segments).toContainEqual({
      type: 'tag', text: '黑沼·九尾灵狐 · 灵狐遁逃', tone: 'jade',
    })
    expect(effectEvents(report, foxId).find((event) => event.statusRemoved === '灵狐遁逃')).toMatchObject({ round: 2 })
    expect(lethalEvents(report, changbai)).toMatchObject([{ round: 3, targetSlot: 'ALLY_MAIN', hpDelta: maxHp }])
    const selfHeal = Math.round(maxHp * 0.045)
    expect(report.events[report.events.indexOf(saved) + 2]).toMatchObject({ effectSourceId: changbai, hpDelta: selfHeal })
    expect(report.events[report.events.indexOf(revived) - 1]).toMatchObject({ hpDelta: -(1 + recovery + 2 * (60 + selfHeal)) })
    expect(revived.segments).toContainEqual({ type: 'damage', value: maxHp, category: 'heal' })
    expect(report.events.some((event) => event.round === 3 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')).toBe(true)
    expect(report.winner).toBe('ENEMY')

    const fivePieces = fight({ ...gear, bootsId: null }, options)
    expect(lethalEvents(fivePieces, foxId)).toHaveLength(1)
    expect(lethalEvents(fivePieces, changbai)).toEqual([])
    expect(fivePieces.events.at(-1)).toMatchObject({ round: 3, actorSlot: 'ENEMY_MAIN' })
  })

  it('黑沼灵狐只给实际穿戴者加速和闪避，普通闪避仍以配装上限封顶', () => {
    const base = computeDerivedStats(player, loadout)
    expect(computeDerivedStats(player, { ...loadout, accId: foxId })).toMatchObject({
      speed: Math.round(base.speed * 1.25), dodge: base.dodge + 15,
    })
    const swift = { ...player, stats: { ...player.stats, agi: 300 } }
    expect(computeDerivedStats(swift, { ...loadout, lightSkillId: 'lingbo_weibu', accId: foxId }).dodge).toBe(42)
  })

  it('护盾全挡时保留灵狐额度，破盾后的致死才触发锁血回血', () => {
    const beidou = 'quanzhen_beidou'
    const gear = {
      weaponId: trialPartId(beidou, 'WEAPON'), headId: trialPartId(beidou, 'HEAD'),
      wristId: trialPartId(beidou, 'WRIST'), beltId: trialPartId(beidou, 'BELT'), accId: foxId,
    }
    const report = fight(gear, {
      enemyMain: { ...enemy, combat: { charge: { round: 2, name: '蓄力一击', damageMultiplier: 100 } } },
      surviveRounds: 3,
    })
    expect(report.events.find((event) => event.round === 1 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST'))
      .toMatchObject({ targetSlot: 'ALLY_MAIN', hpDelta: 0, shieldAbsorbed: 155 })
    const [saved] = lethalEvents(report, foxId)
    const { maxHp } = mainUnit(report)
    expect(lethalEvents(report, foxId)).toMatchObject([{ round: 3, targetSlot: 'ALLY_MAIN', hpDelta: Math.round(maxHp * 0.30) }])
    expect(report.events[report.events.indexOf(saved) - 1])
      .toMatchObject({ hpDelta: 1 - maxHp, shieldAbsorbed: 425, statusRemoved: '护盾' })
    expect(report.winner).toBe('ALLY')
  })

  it('重阳遗泽的锁血优先于长白参仙复活，狂暴终结无法触发复活', () => {
    const gear = { ...reviveGear, leftCompanionId: 'wangchongyang', rightCompanionId: 'mayu' }
    const report = fight(gear, { enemyMain: { ...enemy, atk: 10_000 } })
    expect(lethalEvents(report, 'chong_yang_yi_ze')).toMatchObject([{ round: 1 }])
    expect(lethalEvents(report, changbai)).toMatchObject([{ round: 2, hpDelta: mainUnit(report).maxHp }])

    const enrage = fight(reviveGear, { enemyMain: { ...enemy, hp: 100_000, atk: 1 }, surviveRounds: undefined })
    expect(lethalEvents(enrage, changbai)).toEqual([])
    expect(enrage.events.at(-1)).toMatchObject({ round: 26, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN' })
    expect(enrage.winner).toBe('ENEMY')
  })

  it('少室山的灵狐次数跟随穿戴者，队友受到致死伤害时各自结算', () => {
    const equipped = { ...loadout, accId: foxId }
    const fighter = (id: string, preset: LoadoutPresetDTO, con: number) => ({
      player: { ...player, id, stats: { ...player.stats, con } }, loadout: preset, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-lethal-saves', [
      fighter('a', equipped, 60), fighter('b', loadout, 10), fighter('c', equipped, 10),
    ])
    expect(lethalEvents(report, foxId)).toMatchObject([
      { round: 2, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', hpDelta: 640 },
      { round: 8, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: 1385 },
    ])
    expect(report.events).toContainEqual(expect.objectContaining({ round: 2, actorSlot: 'ENEMY_LEFT', targetSlot: 'ALLY_LEFT', hpDelta: -405 }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 4, actorSlot: 'ENEMY_LEFT', targetSlot: 'ALLY_MAIN', skillId: 'shaoshi_chain_front', hpDelta: -597 }))
    expect(report.events.filter((event) => event.type === 'DODGE' && event.segments.some(
      (segment) => segment.type === 'tag' && segment.text === '黑沼·九尾灵狐 · 灵狐遁逃',
    )).map((event) => [event.round, event.targetSlot])).toEqual([
      [3, 'ALLY_RIGHT'], [9, 'ALLY_MAIN'], [9, 'ALLY_MAIN'], [9, 'ALLY_MAIN'],
    ])
    expect(report.events.some((event) => event.round >= 5 && event.actorSlot === 'ALLY_RIGHT')).toBe(false)
  })

  it('历练回放在普通、倍速和跳过时都记下锁血和实际复活回血', () => {
    vi.useFakeTimers()
    try {
      function replay(speed: 1 | 2 | 'skip') {
        const store = newStore('NEW')
        try {
          Object.assign(store.player.stats, player.stats)
          store.trial.maxStageId = 28
          store.trial.stageHours['28'] = TRIAL_PATROL_HOURS[28]
          store.updateLoadout(loadout)
          for (const id of Object.values({ ...reviveGear, accId: foxId })) {
            store.ownedItemIds.push(id)
            store.equipItem(id)
          }
          if (speed !== 'skip') store.battleSpeed = speed
          store.challengeTrialStage(28)
          const report = store.activeBattle!
          const { maxHp } = mainUnit(report)
          const recovery = Math.round(maxHp * 0.30)
          expect(maxHp).toBe(6224)
          const savedAt = report.events.indexOf(lethalEvents(report, foxId)[0])
          const revivedAt = report.events.indexOf(lethalEvents(report, changbai)[0])
          expect(savedAt).toBeGreaterThan(1)
          expect(revivedAt).toBeGreaterThan(savedAt)
          if (speed === 'skip') {
            store.skipBattleToEnd()
          } else {
            const delay = speed === 1 ? 920 : 480
            vi.advanceTimersByTime((savedAt - 1) * delay)
            expect(store.liveUnitStates.ALLY_MAIN.hp).toBe(1)
            vi.advanceTimersByTime(delay)
            expect(store.liveUnitStates.ALLY_MAIN.hp).toBe(1 + recovery)
            vi.advanceTimersByTime((revivedAt - savedAt - 1) * delay)
            expect(store.liveUnitStates.ALLY_MAIN.hp).toBe(0)
            vi.advanceTimersByTime(delay)
            expect(store.liveUnitStates.ALLY_MAIN.hp).toBe(maxHp)
            expect(store.floatingPopups.ALLY_MAIN).toMatchObject({ category: 'heal', text: `+${maxHp.toLocaleString()}` })
            vi.advanceTimersByTime((report.events.length - revivedAt) * delay)
          }
          expect(store.isBattlePlaying).toBe(false)
          const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
          expect(logs).toContainEqual({ type: 'damage', value: recovery, category: 'heal' })
          expect(logs).toContainEqual({ type: 'damage', value: maxHp, category: 'heal' })
          return { logs, hp: store.liveUnitStates.ALLY_MAIN.hp }
        } finally {
          store.closeBattleStage()
        }
      }
      const normal = replay(1)
      expect(replay(2)).toEqual(normal)
      expect(replay('skip')).toEqual(normal)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('单件减伤、反伤、开局先手与武学被动', () => {
  it('终南玄门道袍增幅回合末和受击回内，额外回复以实际缺口封顶', () => {
    const gear = resolveBattleLoadout({ ...loadout, armorId: 'quanzhen_robe' }).effects
    const recovery = [...gear, { kind: 'ROUND_END_MP_RECOVERY', percent: 15, sourceId: 'test_belt', sourceName: '腰带' }] as const
    const hitRecovery = [...gear, { kind: 'HIT_MP_RECOVERY', hpLossPercent: 20, sourceId: 'test_set', sourceName: '套装' }] as const
    const unit = { ...mainUnit(fight()), maxMp: 1000 }
    const events: BattleEventDTO[] = []
    expect(recoverRoundMp(unit, unit.hp, 500, recovery, 1, events)).toBe(665)
    expect(recoverRoundMp(unit, unit.hp, 844, recovery, 2, events)).toBe(1000)
    expect(recoverHitMp(unit, unit.hp, 500, 200, hitRecovery, 2, events)).toBe(544)
    expect(recoverHitMp(unit, unit.hp, 500, 0, hitRecovery, 3, events)).toBe(500)
    expect(events.map(({ mpDelta }) => mpDelta)).toEqual([165, 156, 44])
    expect(events[1].segments).toContainEqual({ type: 'tag', text: '终南玄门道袍 · 额外回复 6 点内力', tone: 'jade' })
  })

  const redArmor = trialPartId('niluan_jiuyin', 'ARMOR')
  const teamShield = equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])
  const incoming = (report: BattleReportDTO) => report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!

  it.each([
    [trialPartId('hama_nimai', 'ARMOR'), 20], [trialPartId('qimen_dunjia', 'ARMOR'), 15],
  ] as const)('%s 对本次攻击者反伤 %i%% 实扣气血，护盾全挡时无反伤', (armorId, percent) => {
    const options = { surviveRounds: 1, enemyMain: { ...enemy, combat: { range: 'RANGED' as const } } }
    const report = fight({ armorId }, options)
    const damage = -incoming(report).hpDelta!
    expect(effectEvents(report, armorId)).toMatchObject([{ actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -Math.round(damage * percent / 100) }])
    const shielded = fight({ armorId, ...teamShield }, options)
    expect(incoming(shielded)).toMatchObject({ hpDelta: 0, shieldAbsorbed: expect.any(Number) })
    expect(effectEvents(shielded, armorId)).toEqual([])
  })

  it('天蚕宝甲先减伤 25%，经脉逆转吸收实际盾前伤害并入账为真气', () => {
    const gear = { armorId: redArmor, ...teamShield }
    const options = { surviveRounds: 1, enemyMain: { ...enemy, atk: 5000 } }
    const stats = computeDerivedStats(player, { ...loadout, ...gear })
    const damage = Math.round(incomingDamage(5000, 1, stats.def, player.level) * 0.75)
    const blocked = fight(gear, { ...options, rng: () => 0.3499 })
    expect(incoming(blocked)).toMatchObject({ hpDelta: 0 })
    expect(incoming(blocked).shieldAbsorbed).toBeUndefined()
    expect(effectEvents(blocked, redArmor)).toMatchObject([{ actorSlot: 'ALLY_MAIN', qiDrop: damage }])
    expect(battleEffectLoot(blocked)).toEqual({ silver: 0, qiExp: damage })
    const shield = Math.round(Math.round(stats.maxMp * 0.2) * 1.10)
    const hit = fight(gear, { ...options, rng: () => 0.35 })
    expect(incoming(hit)).toMatchObject({ hpDelta: shield - damage, shieldAbsorbed: shield })
    expect(battleEffectLoot(hit).qiExp).toBe(0)
  })

  it('天蚕宝甲也减免实际持续伤害，跳伤仍按原回合数结算', () => {
    const report = fight({ armorId: redArmor }, {
      surviveRounds: 1, rng: () => 0.99, enemyMain: { ...enemy, atk: 2000, combat: { periodicOnHit: { status: 'firePoison', attackPercent: 10, rounds: 2 } } },
    })
    const tick = report.events.find((event) => event.type === 'DOT_TICK')!
    expect(tick).toMatchObject({ targetSlot: 'ALLY_MAIN', hpDelta: -150, statusRounds: 1 })
    expect(tick.segments).toContainEqual({ type: 'tag', text: '逆阴阳玄煞天蚕宝甲 · 持续伤害减免 50', tone: 'jade' })
  })

  it('少室山吸伤真气归实际穿戴的受击玩家', () => {
    const member = (id: string, armorId: string | null) => ({ player: { ...player, id }, loadout: { ...loadout, armorId }, learnedSkills: {} })
    const report = simulateShaoshiRaid('qi-armor', [member('leader', null), member('left', redArmor), member('right', null)], () => 0)
    const absorptions = effectEvents(report, redArmor)
    expect(absorptions.length).toBeGreaterThan(0)
    expect(absorptions.every((event) => event.actorSlot === 'ALLY_LEFT' && event.qiDrop! > 0)).toBe(true)
    expect(battleEffectLoot(report).qiExp).toBe(0)
    expect(battleEffectLoot(report, 'ALLY_LEFT').qiExp).toBe(absorptions.reduce((sum, event) => sum + event.qiDrop!, 0))
  })

  it('试玩历练首通与挂坠击杀真气只各入账一次', () => {
    const store = newStore('NEW')
    try {
      const accId = trialPartId('huangshan_kulou', 'ACC')
      const weaponId = trialPartId('hama_nimai', 'WEAPON')
      store.ownedItemIds.push(accId, weaponId)
      store.equipItem(accId)
      store.equipItem(weaponId)
      const before = { qi: store.player.qiExp, silver: store.player.silver }
      store.challengeTrialStage(1)
      const report = store.activeBattle!
      const bossHp = trialStageOf(1)!.boss.hp
      expect(report.winner).toBe('ALLY')
      expect(effectEvents(report, accId)).toMatchObject([{ targetSlot: 'ENEMY_MAIN', qiDrop: Math.round(bossHp * 0.05) }])
      store.skipBattleToEnd()
      store.skipBattleToEnd()
      expect(store.player.qiExp - before.qi).toBe(bossHp * 2 + Math.round(bossHp * 0.05))
      expect(store.player.silver - before.silver).toBe(Math.round(bossHp * 0.8))
      expect(store.trial.rewardedStageIds).toEqual([1])
    } finally {
      store.closeBattleStage()
    }
  })

  it.each([
    [trialPartId('jiuyin_baigu', 'BOOTS'), 'bootsId', 0.15], [trialPartId('bihai_chaosheng', 'BOOTS'), 'bootsId', 0.20],
    [trialPartId('niluan_jiuyin', 'BOOTS'), 'bootsId', 0.35], [trialPartId('dajin_sishi', 'BOOTS'), 'bootsId', 1],
    [trialPartId('damo_qibing', 'WEAPON'), 'weaponId', 0.15], [trialPartId('qianshou_panguan', 'BOOTS'), 'bootsId', 0.15],
  ] as const)('%s 按阈值抢占第 1 回合先手，随后按实际速度排序', (itemId, field, threshold) => {
    const quicker = { ...enemy, combat: { speed: 1500 } }
    const option = { enemyMain: quicker, player: { ...player, stats: { ...player.stats, agi: 20 } } }
    const report = fight({ [field]: itemId }, { ...option, rng: () => threshold - 0.0001 })
    const firstCast = (report: BattleReportDTO, round: number) => report.events.find((event) => event.round === round && event.type === 'SKILL_CAST')!
    expect(firstCast(report, 1).actorSlot).toBe('ALLY_MAIN')
    expect(firstCast(report, 2).actorSlot).toBe('ENEMY_MAIN')
    expect(effectEvents(report, itemId).some((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('抢占先手')))).toBe(true)
    if (threshold < 1) expect(firstCast(fight({ [field]: itemId }, { ...option, rng: () => threshold }), 1).actorSlot).toBe('ENEMY_MAIN')
  })

  it('白骨撕裂命中后以目标最大气血计真伤，护盾不改变跳伤', () => {
    const accId = trialPartId('jiuyin_baigu', 'ACC')
    const rolls = [0.2999, 0.3]
    const options = { enemyMain: { ...enemy, hp: 8000, combat: { openingShield: 3000 } } }
    const report = fight({ accId }, { ...options, rng: () => rolls.shift() ?? 0.99 })
    expect(mainCast(report).hpDelta).toBe(0)
    expect(effectEvents(report, accId).filter((event) => event.type === 'DOT_TICK')).toMatchObject([
      { round: 1, hpDelta: -400, statusRounds: 1 }, { round: 2, hpDelta: -400, statusRemoved: '白骨撕裂' },
    ])
    expect(effectEvents(fight({ accId }, { ...options, rng: () => 0.3 }), accId)).toEqual([])
  })

  it('寒阴神箭冻结实际目标，逆浪分波重靴让穿戴者继续出招', () => {
    const ultSkillId = 'hanyin_shenjian'
    const report = fight({ ultSkillId })
    expect(effectEvents(report, ultSkillId).find((event) => event.statusApplied)).toMatchObject({ round: 2, statusApplied: '冻结', targetSlot: 'ENEMY_MAIN', statusRounds: 1 })
    expect(report.events.some((event) => event.actorSlot === 'ENEMY_MAIN' && event.round === 2 && event.type === 'SKILL_CAST')).toBe(false)
    const freezing = { ...enemy, combat: { statusOnHit: { status: 'FREEZE' as const, rounds: 1 } } }
    const bootsId = trialPartId('huanghe_nilang', 'BOOTS')
    const defended = fight({ bootsId }, { enemyMain: freezing })
    expect(defended.events.some((event) => event.statusApplied === '冻结')).toBe(false)
    expect(defended.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')).toHaveLength(2)
  })

  it('先天功与易筋锻骨篇的面板属性进入开战快照，紫气诀按最大气血自愈', () => {
    const baseline = computeDerivedStats(player, loadout)
    expect(computeDerivedStats(player, { ...loadout, innerSkillId: 'xiantian_gong' }).def).toBe(Math.round(baseline.def * 1.2))
    const fortified = mainUnit(fight({ innerSkillId: 'yijin_duangu' }))
    expect(fortified).toMatchObject({ maxHp: Math.round(baseline.maxHp * 1.25), maxMp: Math.round(baseline.maxMp * 1.20) })
    const healed = fight({ innerSkillId: 'chongyang_ziqi' }, { surviveRounds: 1 })
    expect(effectEvents(healed, 'chongyang_ziqi')).toMatchObject([{ round: 1, hpDelta: Math.round(mainUnit(healed).maxHp * 0.03) }])
  })

  it('重阳束腰在绝技后按缺失内力实际回复，满内力的回合不播报', () => {
    const beltId = trialPartId('quanzhen_beidou', 'BELT')
    const report = fight({ beltId, ultSkillId: 'yiyang_zhi' })
    const cast = report.events.find((event) => event.isUlt)!
    expect(effectEvents(report, beltId)).toMatchObject([{ round: 2, mpDelta: -cast.mpDelta! }])
  })

  it('枯荣心法和踏浪靴的控制抵抗合计 65 个百分点', () => {
    const gear = { innerSkillId: 'kurong_changong', bootsId: trialPartId('canghai_kuanglan', 'BOOTS') }
    const options = { surviveRounds: 1, enemyMain: { ...enemy, combat: { statusOnHit: { status: 'STUN' as const, rounds: 1 } } } }
    const resisted = fight(gear, { ...options, rng: () => 0.6499 })
    expect(resisted.events.some((event) => event.statusApplied === '点穴眩晕')).toBe(false)
    expect(fight(gear, { ...options, rng: () => 0.65 }).events.some((event) => event.statusApplied === '点穴眩晕')).toBe(true)
  })

  it('灵狐两件在普通闪避未触发时独立判定 12% 绝对闪避', () => {
    const gear = equipped('jiuwei_linghu', ['WEAPON', 'BELT'])
    const dodged = fight(gear, { surviveRounds: 1, rng: () => 0.1199 })
    expect(dodged.events.find((event) => event.type === 'DODGE')?.segments).toContainEqual({ type: 'tag', text: '九尾灵狐泥鳅套装（2件） · 绝对闪避', tone: 'jade' })
    expect(incoming(fight(gear, { surviveRounds: 1, rng: () => 0.12 })).hitResult).toBe('HIT')
  })

  it('横练长靴的绝对格挡在普通招架未触发时使用实际招架吸伤', () => {
    const bootsId = trialPartId('henglian_tongjia', 'BOOTS')
    const gear = { bootsId }
    const blocked = fight(gear, { surviveRounds: 1, rng: () => 0.0499 })
    const baseline = incoming(fight(gear, { surviveRounds: 1, rng: () => 0.05 }))
    expect(incoming(blocked)).toMatchObject({ hitResult: 'PARRY', hpDelta: -Math.round(-baseline.hpDelta! * 0.6) })
    expect(incoming(blocked).segments).toContainEqual({ type: 'tag', text: '沉铁碾地长靴 · 绝对格挡', tone: 'jade' })
  })

  it('灵狐轻纱袍滑开本次物伤，保留护盾且按实际命中结算', () => {
    const armorId = trialPartId('jiuwei_linghu', 'ARMOR')
    const options = { surviveRounds: 1, enemyMain: { ...enemy, atk: 1000 } }
    const dodgedDamage = fight({ armorId, ...teamShield }, { ...options, rng: () => 0.2999 })
    const hit = incoming(dodgedDamage)
    expect(hit).toMatchObject({ hpDelta: 0, hitResult: 'HIT' })
    expect(hit.shieldAbsorbed).toBeUndefined()
    expect(hit.segments.some((segment) => segment.type === 'tag' && segment.text.includes('滑开卸力'))).toBe(true)
    expect(incoming(fight({ armorId, ...teamShield }, { ...options, rng: () => 0.30 })).shieldAbsorbed).toBeGreaterThan(0)
  })

  it('灵狐护腕独立判 18% 闪避反击，四件套成型时共用一次机会', () => {
    const set = 'jiuwei_linghu'
    const wristId = trialPartId(set, 'WRIST')
    const agile = { ...player, stats: { ...player.stats, agi: 71 } }
    const options = { player: agile, surviveRounds: 1 }
    const wrist = fight({ wristId }, { ...options, rng: () => 0.1799 })
    expect(effectEvents(wrist, wristId)).toMatchObject([{ targetSlot: 'ENEMY_MAIN', hpDelta: -Math.round(71 * 1.2) }])
    expect(effectEvents(fight({ wristId }, { ...options, rng: () => 0.18 }), wristId)).toEqual([])
    const full = fight(equipped(set, ['HEAD', 'ARMOR', 'WRIST', 'BELT']), { ...options, rng: () => 0 })
    expect(effectEvents(full, wristId)).toEqual([])
    expect(effectEvents(full, set).filter((event) => event.hpDelta)).toMatchObject([{ targetSlot: 'ENEMY_MAIN', hpDelta: -Math.round(71 * 1.2) }])
  })

  it('灵狐步履独立提高上限，黑沼闪避按实际增量播报', () => {
    const bootsId = trialPartId('jiuwei_linghu', 'BOOTS')
    expect(incoming(fight({ bootsId }, { surviveRounds: 1, environment: { swamp: false } })).hitResult).toBe('HIT')
    const marsh = fight({ bootsId }, { surviveRounds: 1, environment: trialStageOf(25)!.environment })
    expect(marsh.events.some((event) => event.type === 'DODGE')).toBe(true)
    expect(effectEvents(marsh, bootsId).flatMap((event) => event.segments)).toContainEqual({
      type: 'text', text: ` ${player.nickname}闪避率 +25 个百分点`,
    })
  })
})

describe('套装团队增益、蓄力、濒死与环境效果', () => {
  const sixSlots = ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS'] as const
  const withoutBoots = ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'ACC'] as const
  const agilePlayer = { ...player, stats: { ...player.stats, agi: 20 } }
  const dummy = { ...enemy, hp: 100_000 }

  it('西征六件增益存活队友，击杀按实际缺血缺怒回复，郭靖以自己的攻击力跟进', () => {
    const set = 'xizheng_jindao'
    const companions = { leftCompanionId: 'guojing', rightCompanionId: 'huangrong' }
    const options = {
      surviveRounds: 1, rng: () => 0.99,
      enemyMain: { ...dummy, combat: { speed: 1500, preferFemaleCompanion: true as const } },
      enemyGuards: [{ ...enemy, hp: 1, name: '守卫' }],
    }
    const baseline = fight(companions, options)
    const report = fight({ ...equipped(set, sixSlots), ...companions }, options)
    for (const slot of ['ALLY_LEFT', 'ALLY_RIGHT'] as const) {
      expect(report.units.find((unit) => unit.slot === slot)!.maxHp - baseline.units.find((unit) => unit.slot === slot)!.maxHp).toBe(2000)
    }
    const reward = effectEvents(report, set).filter((event) => event.type === 'EFFECT' && (event.hpDelta || event.rageDelta))
    expect(reward.map(({ targetSlot, hpDelta, rageDelta }) => [targetSlot, hpDelta, rageDelta])).toEqual([
      ['ALLY_LEFT', undefined, 30], ['ALLY_MAIN', undefined, 15], ['ALLY_RIGHT', 250, undefined], ['ALLY_RIGHT', undefined, 30],
    ])
    const guo = companionView(COMPANIONS.guojing, { form: 'awakened' })
    const combo = effectEvents(report, set).find((event) => event.type === 'ASSIST_ATTACK')!
    expect(combo).toMatchObject({
      actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN',
      hpDelta: -strikeDamage(Math.round(guo.baseAtk * 1.04) + 200, 1.5, 1, 1, false, 1),
    })
  })

  it('少室山同名西征光环只生效一次，未穿套装的队友也用加成后的攻击力', () => {
    const west = equipped('xizheng_jindao', ['HEAD', 'BELT'])
    const ally = { player: agilePlayer, loadout, learnedSkills: {} }
    const left = { ...ally, player: { ...agilePlayer, id: 'left' } }
    const right = { ...ally, player: { ...agilePlayer, id: 'right' } }
    const withWest = (fighter: typeof ally) => ({ ...fighter, loadout: { ...loadout, ...west } })
    const simulate = (lineup: Parameters<typeof simulateShaoshiRaid>[1]) => simulateShaoshiRaid('west', lineup, () => 0.99, {})
    const baseline = simulate([ally, left, right])
    const single = simulate([withWest(ally), left, right])
    const double = simulate([withWest(ally), withWest(left), right])
    const hp = (report: BattleReportDTO) => report.units.find((unit) => unit.slot === 'ALLY_RIGHT')!.maxHp
    const cast = (report: BattleReportDTO) => report.events.find((event) => event.actorSlot === 'ALLY_RIGHT' && event.type === 'SKILL_CAST')!
    expect(hp(double)).toBe(hp(baseline) + 2000)
    expect(cast(double).hpDelta).toBeLessThan(cast(baseline).hpDelta!)
    expect(cast(double)).toEqual(cast(single))
  })

  it('蛤蟆六件先蓄力，随后穿透主将防御，按原规则扣除护盾并支付资源', () => {
    const set = 'hama_nimai'
    const gear = equipped(set, withoutBoots)
    const report = fight(gear, {
      player: agilePlayer, surviveRounds: 3, enemyGuards: [{ ...dummy, atk: 400 }],
      enemyMain: { ...dummy, atk: 2500, combat: { def: 400, openingShield: 10_000 } },
    })
    const stats = computeDerivedStats(agilePlayer, { ...loadout, ...gear })
    const damage = strikeDamage(stats.atk, 3.5, 1, innerPressure(stats.maxMp, dummy.mp), false, 3)
    expect(effectEvents(report, set).find((event) => event.statusApplied === '蓄力')).toMatchObject({
      round: 2, statusRounds: 1, actorSlot: 'ALLY_MAIN',
    })
    expect(report.events.some((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' && (event.rageDelta || event.mpDelta))).toBe(false)
    const cast = report.events.find((event) => event.skillId === 'hama_nimai_pounce')!
    expect(cast).toMatchObject({
      round: 3, targetSlot: 'ENEMY_MAIN', isUlt: true, rageDelta: -85, mpDelta: -Math.round(stats.maxMp * 0.1), hpDelta: 0, shieldAbsorbed: damage,
    })
    expect(cast.segments).toContainEqual({ type: 'tag', text: '排山倒海·蛤蟆扑 · 穿透 400 点防御', tone: 'gold' })
  })

  it('蓄力后封招会取消蛤蟆扑且保留内力', () => {
    const set = 'hama_nimai'
    const rolls = [0.99, 0]
    const report = fight(equipped(set, withoutBoots), {
      player: agilePlayer, surviveRounds: 3, rng: () => rolls.shift() ?? 0.99,
      enemyMain: { ...dummy, atk: 2500, combat: { statusOnHit: { status: 'ULT_LOCK', chancePercent: 50, rounds: 1 } } },
    })
    expect(effectEvents(report, set).find((event) => event.statusRemoved === '蓄力')).toMatchObject({
      round: 3, segments: [{ type: 'tag', text: '排山倒海·蛤蟆扑 · 蓄力中断', tone: 'gold' }],
    })
    expect(report.events.some((event) => event.isUlt || event.mpDelta)).toBe(false)
  })

  it('决死一击先必暴并吸取盾后实伤，随后承受原攻击，每场仅一次', () => {
    const set = 'dajin_sishi'
    const gear = { ...equipped(set, withoutBoots), ultSkillId: 'yiyang_zhi' }
    const stats = computeDerivedStats(agilePlayer, { ...loadout, ...gear })
    const atk = Math.round(stats.maxHp * 0.55 * (495 + stats.def) / 495)
    const options = { player: agilePlayer, surviveRounds: 2, enemyMain: { ...dummy, atk } }
    const report = fight(gear, options)
    const hits = report.events.filter((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')
    const [counter, heal] = effectEvents(report, set).filter((event) => event.hpDelta)
    expect(counter).toMatchObject({ round: 2, type: 'SKILL_CAST', targetSlot: 'ENEMY_MAIN', skillId: 'yiyang_zhi', hitResult: 'CRIT' })
    expect(counter.mpDelta).toBeUndefined()
    expect(counter.rageDelta).toBeUndefined()
    expect(heal).toMatchObject({ round: 2, targetSlot: 'ALLY_MAIN', hpDelta: Math.min(-counter.hpDelta!, -hits[0].hpDelta!) })
    expect(report.events.indexOf(heal)).toBeLessThan(report.events.indexOf(hits[1]))
    expect(hits[1].hpDelta).toBe(hits[0].hpDelta)
    expect(report.winner).toBe('ALLY')
    expect(fight(gear, { ...options, surviveRounds: 3 }).winner).toBe('ENEMY')
  })

  it('决死一击按护盾实际溢出量判断，盾全挡保留次数，超额伤害不会被回血截断', () => {
    const set = 'dajin_sishi'
    const gear = equipped(set, withoutBoots)
    const report = fight(gear, { surviveRounds: 1 })
    const unit = mainUnit(report)
    const attacker = { unit: report.units.find((entry) => entry.slot === 'ENEMY_MAIN')!, shield: 0, atk: dummy.atk }
    const beforeLethal = vi.fn(() => ({ hp: unit.maxHp, attackerHp: attacker.unit.maxHp - 500 }))
    const receiver = { fighter: { unit, shield: 500 }, hp: 100, defense: 0, effects: resolveBattleLoadout({ ...loadout, ...gear }).effects, beforeLethal }
    const contact = { source: { sourceId: attacker.unit.id, sourceName: attacker.unit.name }, attacker, attackerHp: attacker.unit.maxHp, round: 1 }
    expect(applyDirectedDamage(receiver, { ...contact, damage: 400 }, []).hp).toBe(100)
    expect(beforeLethal).not.toHaveBeenCalled()
    expect(applyDirectedDamage(receiver, { ...contact, damage: unit.maxHp * 2 }, []).hp).toBe(0)
    expect(beforeLethal).toHaveBeenCalledOnce()
  })

  it('逆乱六件在盾后跨过三成血线时生效，抵抗控制并在第三回合末解除', () => {
    const set = 'niluan_jiuyin'
    const gear = equipped(set, withoutBoots)
    const stats = computeDerivedStats(agilePlayer, { ...loadout, ...gear })
    const report = fight(gear, {
      player: agilePlayer, surviveRounds: 3, rng: () => 0.99,
      enemyMain: { ...dummy, combat: {
        speed: 1500, statusOnHit: { status: 'STUN', rounds: 1 },
        weakSpot: { round: 2, name: '卸力', weaponId: 'none', openingAttackPercent: 15_500, exposedAttackPercent: 100 },
      } },
    })
    const rage = effectEvents(report, set).filter((event) => event.statusApplied === '疯魔逆九阴' || event.statusRemoved === '疯魔逆九阴')
    expect(rage).toMatchObject([{ round: 1, statusApplied: '疯魔逆九阴', statusRounds: 3 }, { round: 3, statusRemoved: '疯魔逆九阴' }])
    expect(report.events.some((event) => event.statusApplied === '点穴眩晕')).toBe(false)
    const cast = mainCast(report)
    expect(cast).toMatchObject({ round: 1, hitResult: 'CRIT' })
    expect(cast.hpDelta).toBe(-strikeDamage(Math.round(stats.atk * 1.8), 1, 1, innerPressure(stats.maxMp, dummy.mp), true, 1, 1.75))
  })

  it('破庙六件雨夜速度改变先后手，四件只减草寇或野兽的普攻', () => {
    const set = 'pomiao_caomang'
    const gear = equipped(set, sixSlots)
    const speed = computeDerivedStats(agilePlayer, { ...loadout, ...gear }).speed
    const stage = trialStageOf(1)!
    const bandit = { ...dummy, combat: { ...stage.boss.combat, speed: speed + 2 } }
    const options = { player: agilePlayer, surviveRounds: 1, enemyMain: bandit }
    const clear = { night: false, rain: false }
    const dry = fight(gear, { ...options, environment: clear })
    const rain = fight(gear, { ...options, environment: stage.environment })
    const first = (report: BattleReportDTO) => report.events.find((event) => event.type === 'SKILL_CAST')!
    expect(first(dry).actorSlot).toBe('ENEMY_MAIN')
    expect(first(rain).actorSlot).toBe('ALLY_MAIN')
    const plain = fight(gear, { ...options, environment: clear, enemyMain: { ...bandit, combat: { speed: speed + 2 } } })
    expect(first(dry).hpDelta).toBe(first(plain).hpDelta! + 8)
    expect(first(dry).segments).toContainEqual({ type: 'tag', text: '破庙蓑衣草莽套装（4件） · 固定减伤 8', tone: 'jade' })
  })

  it.each([
    { branch: undefined, name: '无分支', percent: 0 },
    { branch: 'JINGYI' as const, name: '净衣派', percent: 20 },
  ])('假面六件在历练实际闪避后掉落纹银，$name 按战报一次入账', ({ branch, percent }) => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats, { agi: 71 })
      Object.assign(store.player, { currentSectId: 'gaibang', sectRank: 3, gaibangBranch: branch })
      store.trial.maxStageId = 21
      store.trial.stageHours['21'] = TRIAL_PATROL_HOURS[21]
      store.trial.rewardedStageIds.push(21)
      store.updateLoadout({ ...loadout })
      for (const slot of sixSlots) {
        const id = trialPartId('jiamian_piaoping', slot)
        store.ownedItemIds.push(id)
        store.equipItem(id)
      }
      store.challengeTrialStage(21)
      const report = store.activeBattle!
      const baseLoot = effectEvents(report, 'jiamian_piaoping').reduce((total, event) => total + (event.silverDrop ?? 0), 0)
      expect(baseLoot).toBeGreaterThanOrEqual(5)
      const bonusLoot = Math.round(baseLoot * percent / 100)
      const branchLoot = effectEvents(report, 'gaibang_branch').filter((event) => event.silverDrop)
      expect(branchLoot.map((event) => event.silverDrop)).toEqual(branch ? [bonusLoot] : [])
      const { silver: loot } = battleEffectLoot(report)
      expect(loot).toBe(baseLoot + bonusLoot)
      const balance = store.player.silver
      store.skipBattleToEnd()
      store.skipBattleToEnd()
      expect(store.player.silver).toBe(balance + loot)
    } finally {
      store.closeBattleStage()
    }
  })

  it('假面四件在鬼市鉴宝实付半价，只有子时免除正派未蒙面的盘查', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-12T23:30:00+08:00'))
      const store = newStore('NEW')
      store.player.currentSectId = 'quanzhen'
      store.player.silver = 1000
      store.player.wearingMask = false
      const karma = store.player.stats.karma
      expect(store.ghostAppraiseCost).toBe(600)
      for (const slot of sixSlots.slice(0, 4)) {
        const id = trialPartId('jiamian_piaoping', slot)
        store.ownedItemIds.push(id)
        store.equipItem(id)
      }
      expect(store.ghostAppraiseCost).toBe(300)
      store.appraiseGhostCurio()
      expect(store.player.silver).toBe(700)
      expect(store.player.stats.karma).toBe(karma)
      vi.setSystemTime(new Date('2026-11-13T12:00:00+08:00'))
      const roll = vi.spyOn(Math, 'random').mockReturnValue(0.99)
      try { store.appraiseGhostCurio() } finally { roll.mockRestore() }
      expect(store.player.silver).toBe(400)
      expect(store.player.stats.karma).toBe(karma - 25)
    } finally {
      vi.useRealTimers()
    }
  })

  it('岳武穆遗书开战卸马，只有骑兵的防御被清零', () => {
    const mounted = { ...dummy, combat: trialStageOf(27)!.boss.combat }
    const gear = { relicBookId: 'wumu_yishu' }
    const report = fight(gear, { enemyMain: mounted, surviveRounds: 1 })
    const infantry = fight(gear, { enemyMain: { ...mounted, combat: { def: 300 } }, surviveRounds: 1 })
    expect(effectEvents(report, gear.relicBookId).find((event) => event.statusApplied === '卸马')).toMatchObject({ round: 1, targetSlot: 'ENEMY_MAIN' })
    expect(mainCast(report).hpDelta).toBe(mainCast(fight(gear, { enemyMain: dummy, surviveRounds: 1 })).hpDelta)
    expect(mainCast(infantry).hpDelta).toBeGreaterThan(mainCast(report).hpDelta!)
  })

  it('岳武穆遗书给全队实际加气血与防御，太极御掌额外减免 40% 掌风', () => {
    const relicBookId = 'wumu_yishu'
    const enemyMain = { ...dummy, combat: trialStageOf(30)!.boss.combat }
    const report = fight({ stance: 'TAICHI', relicBookId, leftCompanionId: 'guojing' }, { enemyMain, surviveRounds: 3 })
    const partner = report.units.find((unit) => unit.slot === 'ALLY_LEFT')!
    expect(partner.maxHp).toBe(Math.round(companionView(COMPANIONS.guojing, { form: 'awakened' }).baseHp * 1.04) + 2000)
    const guarded = incomingDamage(dummy.atk, 0.65 * 0.82, 150, player.level)
    const reduction = Math.round(guarded * 0.4)
    const hit = effectEvents(report, 'jiuyin_nixing').find((event) => event.targetSlot === partner.slot)!
    expect(hit.hpDelta).toBe(reduction - guarded)
    expect(hit.segments).toContainEqual({ type: 'tag', text: `岳武穆遗书 · 范围减伤 ${reduction}`, tone: 'jade' })
  })

  it('太极在历练蛤蟆扑释放时引敌撞石，伤害按首领气血上限计算', () => {
    const boss = { ...dummy, combat: trialStageOf(23)!.boss.combat }
    const armorId = trialPartId('dajin_sishi', 'ARMOR')
    const report = fight({ stance: 'TAICHI', armorId }, { enemyMain: boss, surviveRounds: 3 })
    expect(effectEvents(report, 'taichi_deflect')).toMatchObject([{ round: 3, targetSlot: 'ENEMY_MAIN', hpDelta: -10_000 }])
    expect(report.events.some((event) => event.round === 3 && event.actorSlot === 'ENEMY_MAIN' && event.hpDelta)).toBe(false)
  })
})

describe('白驼折扇、九尾灵狐与醉仙短打的闪避效果', () => {
  const white = 'baituo_zheshan'
  const fox = 'jiuwei_linghu'
  const wine = 'zuixian_xingshang'
  const whiteGear = {
    headId: trialPartId(white, 'HEAD'), armorId: trialPartId(white, 'ARMOR'),
    beltId: trialPartId(white, 'BELT'), accId: trialPartId(white, 'ACC'),
  }
  const foxGear = {
    headId: trialPartId(fox, 'HEAD'), armorId: trialPartId(fox, 'ARMOR'),
    beltId: trialPartId(fox, 'BELT'), bootsId: trialPartId(fox, 'BOOTS'),
  }
  const wineGear = {
    weaponId: trialPartId(wine, 'WEAPON'), headId: trialPartId(wine, 'HEAD'),
    armorId: trialPartId(wine, 'ARMOR'), wristId: trialPartId(wine, 'WRIST'),
    beltId: trialPartId(wine, 'BELT'), bootsId: trialPartId(wine, 'BOOTS'),
  }
  const agile = (agi: number) => ({ ...player, stats: { ...player.stats, agi } })
  const mainCasts = (report: BattleReportDTO) => report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
  const guaranteedTag = { type: 'tag', text: '白驼折扇风流套装（4件） · 本次必暴', tone: 'gold' }
  const hasGuaranteedCrit = (event: BattleEventDTO) =>
    event.segments.some((segment) => segment.type === 'tag' && segment.text === guaranteedTag.text)
  const critTriggers = (report: BattleReportDTO) => effectEvents(report, white).filter((event) =>
    event.segments.some((segment) => segment.type === 'tag' && segment.text.endsWith(' · 闪避触发')))
  const whitePair = { headId: whiteGear.headId, armorId: whiteGear.armorId }
  const guards = [{ ...enemy, name: '护卫' }]

  function raidWithRight(gear: Partial<LoadoutPresetDTO>) {
    const weak = { ...player, stats: { ...player.stats, con: 0, str: 1 } }
    return simulateShaoshiRaid('raid-dodge-effects', [
      { player: { ...weak, id: 'a' }, loadout, learnedSkills: {} },
      { player: { ...agile(29), id: 'b' }, loadout: { ...loadout, ...foxGear }, learnedSkills: {} },
      { player: { ...agile(42), id: 'c' }, loadout: { ...loadout, ...gear }, learnedSkills: {} },
    ], () => 0)
  }

  it.each([['wuluo_qingyan', 10], ['bipo_zhang', 8]])('%s 装在外功槽时常驻闪避 +%i 个百分点', (outerSkillId, points) => {
    const character = agile(90)
    const gear = { outerSkillId }
    const options = { player: character, surviveRounds: 1 }
    expect(computeDerivedStats(character, { ...loadout, ...gear }).dodge).toBe(15 + points)
    const report = fight(gear, options)
    expect(report.events.some((event) => event.type === 'DODGE')).toBe(true)
    expect(effectEvents(report, outerSkillId)[0].segments).toContainEqual({
      type: 'text', text: ` ${player.nickname}闪避率 +${points} 个百分点`,
    })
    expect(fight({ innerSkillId: outerSkillId }, options).events.some((event) => event.type === 'DODGE')).toBe(false)
  })

  it('白驼闪避加成按有效穿戴的两件档位结算', () => {
    const options = { player: agile(90), surviveRounds: 1 }
    const report = fight(whitePair, options)
    expect(report.events.some((event) => event.type === 'DODGE')).toBe(true)
    expect(effectEvents(report, white)[0].segments).toContainEqual({ type: 'text', text: ' 试招侠客闪避率 +8 个百分点，出手速度 +50' })
    const misplaced = fight({ headId: whiteGear.headId, accId: whiteGear.armorId }, options)
    expect(misplaced.events.some((event) => event.type === 'DODGE')).toBe(false)
    expect(effectEvents(misplaced, white)).toEqual([])
  })

  it('常驻闪避战报按 42% 实战封顶记录实际增量', () => {
    const gear = { ...whitePair, outerSkillId: 'wuluo_qingyan', lightSkillId: 'lingbo_weibu' }
    const character = agile(12)
    const report = fight(gear, { player: character, surviveRounds: 1 })
    expect(computeDerivedStats(character, { ...loadout, ...gear }).dodge).toBe(42)
    expect(effectEvents(report, 'wuluo_qingyan')[0].segments).toContainEqual({ type: 'text', text: ' 试招侠客闪避率 +1 个百分点' })
    expect(effectEvents(report, white)[0].segments).toContainEqual({ type: 'text', text: ' 试招侠客出手速度 +50' })
    expect(report.events.some((event) => event.type === 'DODGE')).toBe(true)
    expect(fight(gear, { player: agile(13), surviveRounds: 1 }).events.some((event) => event.type === 'DODGE')).toBe(false)
  })

  it('少室山按受击者自己的外功和套装判定闪避', () => {
    const member = (id: string, agi: number, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...agile(agi), id }, loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-constant-dodge', [
      member('a', 90, { outerSkillId: 'wuluo_qingyan' }), member('b', 78, whitePair), member('c', 67, {}),
    ])
    expect(report.events.filter((event) => event.round === 1 && event.type === 'DODGE')).toMatchObject([
      { targetSlot: 'ALLY_MAIN' }, { targetSlot: 'ALLY_LEFT' },
    ])
    expect(effectEvents(report, 'wuluo_qingyan')[0]).toMatchObject({ actorSlot: 'ALLY_MAIN' })
    expect(effectEvents(report, white)[0]).toMatchObject({ actorSlot: 'ALLY_LEFT' })
  })

  it('白驼四件闪避后触发一次必暴，同回合后续追击沿用常规暴击判定', () => {
    const gear = { ...whiteGear, outerSkillId: 'shuangshou_hubo' }
    const options = { player: agile(71), rng: () => 0, surviveRounds: 3 }
    const report = fight(gear, options)
    expect(critTriggers(report)).toHaveLength(1)
    const [trigger] = critTriggers(report)
    expect(trigger).toMatchObject({ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN' })
    expect(report.events[report.events.indexOf(trigger) - 1]).toMatchObject({ type: 'DODGE', round: 1 })
    expect(trigger.segments).toContainEqual({ type: 'text', text: ' 下一次可暴击出手必暴。' })
    const [regular, followUp] = mainCasts(report).filter((event) => event.round === 2)
    expect(regular).toMatchObject({ hitResult: 'CRIT', hpDelta: -991 })
    expect(regular.segments).toContainEqual(guaranteedTag)
    expect(followUp).toMatchObject({ effectSourceId: 'shuangshou_hubo', hitResult: 'HIT', hpDelta: -640 })
    expect(report.events.filter(hasGuaranteedCrit)).toEqual([regular])

    const threePieces = fight({ ...gear, accId: null }, options)
    expect(threePieces.events.some((event) => event.type === 'DODGE')).toBe(true)
    expect(critTriggers(threePieces)).toEqual([])
    expect(mainCasts(threePieces).find((event) => event.round === 2)).toMatchObject({ hitResult: 'HIT' })
  })

  it('下一次可暴击的绝技消耗白驼必暴，护盾完全吸收时也记录暴击', () => {
    const report = fight({ ...whiteGear, lightSkillId: 'lingbo_weibu', ultSkillId: 'yiyang_zhi' }, {
      player: agile(71), enemyMain: { ...enemy, combat: { openingShield: 10000 } },
    })
    const ult = mainCasts(report)[1]
    expect(ult).toMatchObject({ round: 2, isUlt: true, skillId: 'yiyang_zhi', hitResult: 'CRIT', hpDelta: 0, shieldAbsorbed: 1585 })
    expect(ult.segments).toContainEqual(guaranteedTag)
  })

  it('闪避必暴优先于绝技自身的暴击率判定', () => {
    const gear = { ...whiteGear, lightSkillId: 'lingbo_weibu', ultSkillId: 'shisheng_chuang' }
    const options = { player: agile(71), enemyMain: { ...enemy, combat: { openingShield: 10000 } } }
    const ult = mainCasts(fight(gear, options))[1]
    expect(ult).toMatchObject({ isUlt: true, skillId: 'shisheng_chuang', hitResult: 'CRIT', hpDelta: 0 })
    expect(ult.segments).toContainEqual(guaranteedTag)
    expect(ult.segments.some((segment) => segment.type === 'tag' && segment.text.includes('暴击率 +'))).toBe(false)
    expect(mainCasts(fight({ ...gear, accId: null }, options))[1]).toMatchObject({ isUlt: true, hitResult: 'HIT' })
  })

  it('灵狐反击当前攻击者，按装备加成后的身法造成真伤并受剩余气血限制', () => {
    const options = {
      player: agile(71), surviveRounds: 1, enemyGuards: guards,
      enemyMain: { ...enemy, combat: { def: 400, openingShield: 1000 } },
    }
    const report = fight(foxGear, options)
    expect(mainCasts(report)[0].targetSlot).toBe('ENEMY_LEFT')
    const counters = (battle: BattleReportDTO) => effectEvents(battle, fox).filter((event) => event.targetSlot?.startsWith('ENEMY'))
    const [counter] = counters(report)
    expect(counter).toMatchObject({ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -361 })
    expect(counter.segments).toContainEqual({ type: 'damage', value: 361, category: 'true' })
    expect(report.events[report.events.indexOf(counter) - 1]).toMatchObject({ type: 'DODGE' })
    expect(counter.shieldDelta).toBeUndefined()
    expect(counter.rageDelta).toBeUndefined()

    const finishing = fight(foxGear, { ...options, enemyMain: { ...options.enemyMain, hp: 120 } })
    expect(counters(finishing)).toMatchObject([{ targetSlot: 'ENEMY_MAIN', hpDelta: -120 }])
    expect(counters(fight({ ...foxGear, beltId: null }, options))).toEqual([])
  })

  it('醉仙六件对当前攻击者结算 40% 攻击力的反击，先防御再扣盾', () => {
    const options = {
      player: agile(71), surviveRounds: 1, enemyGuards: guards,
      enemyMain: { ...enemy, combat: { def: 400, openingShield: 60 } },
    }
    expect(computeDerivedStats(options.player, { ...loadout, ...wineGear }).atk).toBe(363)
    const report = fight(wineGear, options)
    expect(mainCasts(report)[0].targetSlot).toBe('ENEMY_LEFT')
    const counters = (battle: BattleReportDTO) => effectEvents(battle, wine).filter((event) => event.targetSlot?.startsWith('ENEMY'))
    const [counter] = counters(report)
    expect(counter).toMatchObject({ actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -20, shieldAbsorbed: 60, statusRemoved: '护盾' })
    expect(counter.segments).toContainEqual({ type: 'damage', value: 20, category: 'phys' })
    expect(counter.rageDelta).toBeUndefined()

    const shielded = fight(wineGear, { ...options, enemyMain: { ...enemy, combat: { def: 400, openingShield: 100 } } })
    expect(counters(shielded)).toMatchObject([{ hpDelta: 0, shieldAbsorbed: 80, shieldDelta: -80 }])
    const finishing = fight(wineGear, { ...options, enemyMain: { ...options.enemyMain, hp: 10 } })
    expect(counters(finishing)).toMatchObject([{ hpDelta: -10, shieldAbsorbed: 60 }])
    expect(counters(fight({ ...wineGear, beltId: null }, options))).toEqual([])
    expect(counters(fight(wineGear, { ...options, player }))).toEqual([])
  })

  it('少室山两位灵狐穿戴者独立限次，同回合重复闪避保留一次反击', () => {
    const report = raidWithRight(foxGear)
    expect(report.events.filter((event) => event.round === 2 && event.type === 'DODGE' && event.targetSlot === 'ALLY_RIGHT')
      .map((event) => event.actorSlot)).toEqual(['ENEMY_LEFT', 'ENEMY_MAIN'])
    const counters = effectEvents(report, fox)
    expect(counters.filter((event) => event.round === 2)).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', hpDelta: -326 },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_RIGHT', hpDelta: -311 },
    ])
    expect(counters).toContainEqual(expect.objectContaining({ round: 3, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', hpDelta: -311 }))
  })

  it('少室山醉仙同回合闪避不同攻击者时分别反击', () => {
    const report = raidWithRight({ ...wineGear, lightSkillId: 'lingbo_weibu' })
    const counters = effectEvents(report, wine).filter((event) => event.round === 2)
    expect(counters).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', hpDelta: -116 },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', hpDelta: 0, shieldAbsorbed: 78 },
    ])
    for (const counter of counters) {
      expect(report.events[report.events.indexOf(counter) - 1]).toMatchObject({
        type: 'DODGE', actorSlot: counter.targetSlot, targetSlot: counter.actorSlot,
      })
    }
  })

  it('少室山白驼连续闪避只保留一次必暴，其他队友独立出手', () => {
    const report = raidWithRight({ ...whiteGear, lightSkillId: 'lingbo_weibu', outerSkillId: 'shuangshou_hubo' })
    expect(report.events.filter((event) => event.round === 2 && event.type === 'DODGE' && event.targetSlot === 'ALLY_RIGHT')).toHaveLength(2)
    expect(effectEvents(report, white).filter((event) => event.round === 2)).toMatchObject([{ actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT' }])
    const thirdRound = report.events.filter((event) => event.round === 3 && event.type === 'SKILL_CAST')
    expect(thirdRound.filter(hasGuaranteedCrit)).toMatchObject([{ actorSlot: 'ALLY_RIGHT', hpDelta: -634, hitResult: 'CRIT' }])
    expect(thirdRound.find((event) => event.actorSlot === 'ALLY_RIGHT' && event.effectSourceId === 'shuangshou_hubo'))
      .toMatchObject({ hitResult: 'HIT' })
  })

  it('历练正常配装与回放显示醉仙反击的实扣气血', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, agile(71).stats)
      store.trial.maxStageId = 7
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      store.updateLoadout(loadout)
      for (const id of Object.values(wineGear)) {
        store.ownedItemIds.push(id)
        store.equipItem(id)
      }
      store.inspectById('item', wineGear.headId)
      expect(store.inspectModal?.extra).toContain('按外功防御和护盾结算')
      store.challengeTrialStage(7)
      expect(effectEvents(store.activeBattle!, wine).filter((event) => event.targetSlot === 'ENEMY_MAIN'))
        .toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN', hpDelta: -113 }])
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual({ type: 'tag', text: '醉仙短打行商套装（6件） · 闪避反击', tone: 'purple' })
      expect(logs).toContainEqual({ type: 'damage', value: 113, category: 'phys' })
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('长白自愈与九尾灵狐令的闪避回血', () => {
  const changbai = 'changbai_canxian'
  const coatId = trialPartId(changbai, 'ARMOR')
  const headId = trialPartId(changbai, 'HEAD')
  const beltId = trialPartId(changbai, 'BELT')
  const foxId = trialPartId('jiuwei_linghu', 'ACC')
  const coat = { armorId: coatId }
  const pair = { ...coat, headId }
  const dodgeGear = { headId, beltId, accId: foxId }
  const agile = (agi: number) => ({ ...player, stats: { ...player.stats, agi } })
  const foxHeals = (report: BattleReportDTO) => effectEvents(report, foxId).filter((event) => (event.hpDelta ?? 0) > 0)

  it('长白青缎貂皮风氅每回合末回 40，两件套加 800 气血并把回复提高到 60', () => {
    const single = fight(coat)
    const equipped = fight(pair)
    expect(mainUnit(single).maxHp).toBe(2484)
    expect(mainUnit(equipped).maxHp).toBe(2484 + 950 + 800)
    expect(effectEvents(single, coatId)).toMatchObject([{ round: 1, hpDelta: 40 }, { round: 2, hpDelta: 40 }])
    expect(effectEvents(equipped, coatId)).toMatchObject([{ round: 1, hpDelta: 60 }, { round: 2, hpDelta: 60 }])
    expect(effectEvents(equipped, coatId)[0].segments).toContainEqual({ type: 'damage', value: 60, category: 'heal' })
    const wrongSlot = fight({ ...coat, accId: headId })
    expect(mainUnit(wrongSlot).maxHp).toBe(mainUnit(single).maxHp)
    expect(effectEvents(wrongSlot, coatId)[0].hpDelta).toBe(40)
  })

  it('长白回合末自愈按缺失气血封顶，满血时跳过回血', () => {
    const beidou = 'quanzhen_beidou'
    const shieldGear = {
      ...pair, weaponId: trialPartId(beidou, 'WEAPON'), wristId: trialPartId(beidou, 'WRIST'),
      beltId: trialPartId(beidou, 'BELT'), accId: trialPartId(beidou, 'ACC'),
    }
    const report = fight(shieldGear, { enemyMain: { ...enemy, atk: 908 }, surviveRounds: 1 })
    expect(report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST'))
      .toMatchObject({ hpDelta: -26, shieldAbsorbed: 425 })
    expect(effectEvents(report, coatId)).toMatchObject([{ round: 1, hpDelta: 26 }])

    const full = fight(pair, { player: agile(71), surviveRounds: 1 })
    expect(full.events.some((event) => event.type === 'DODGE')).toBe(true)
    expect(effectEvents(full, coatId)).toEqual([])
  })

  it('长白自愈加成同时作用于自身装备和枯荣禅功的回合末回复', () => {
    const report = fight({ ...coat, accId: trialPartId(changbai, 'ACC'), innerSkillId: 'kurong_chan' }, {
      enemyMain: { ...enemy, atk: 4300 }, surviveRounds: 1,
    })
    expect(mainUnit(report).maxHp).toBe(3777)
    expect(effectEvents(report, 'kurong_chan')).toMatchObject([{ round: 1, targetSlot: 'ALLY_MAIN', hpDelta: 680 }])
    expect(effectEvents(report, coatId)).toMatchObject([{ round: 1, targetSlot: 'ALLY_MAIN', hpDelta: 60 }])
  })

  it('长白两件的自愈加成与行动后回血、队伍治疗和吸血独立结算', () => {
    const team = fight({ headId, beltId, accId: flaskId, ...nanBei }, { enemyMain: { ...enemy, atk: 1000 } })
    expect(mainUnit(team).maxHp).toBe(3474)
    expect(effectEvents(team, flaskId)).toMatchObject([{ round: 2, hpDelta: 15 }])
    expect(effectEvents(team, 'nan_bei')).toMatchObject([{ round: 1, hpDelta: 208 }, { round: 2, hpDelta: 208 }])

    const jiuyin = 'jiuyin_baigu'
    const drain = fight({
      ...coat, beltId, weaponId: trialPartId(jiuyin, 'WEAPON'), headId: trialPartId(jiuyin, 'HEAD'),
      wristId: trialPartId(jiuyin, 'WRIST'), accId: trialPartId(jiuyin, 'ACC'),
    }, { enemyMain: { ...enemy, atk: 1200 } })
    expect(drain.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST'))
      .toMatchObject({ hpDelta: -671 })
    expect(effectEvents(drain, jiuyin).filter((event) => (event.hpDelta ?? 0) > 0)).toMatchObject([{ round: 2, hpDelta: 134 }])
    expect(effectEvents(drain, coatId)).toMatchObject([{ round: 1, hpDelta: 60 }, { round: 2, hpDelta: 60 }])
  })

  it('九尾灵狐令闪避后只按 5% 最大气血回血，并按缺失气血封顶', () => {
    const options = { player: agile(42) }
    const report = fight(dodgeGear, options)
    expect(mainUnit(report).maxHp).toBe(3474)
    const [healed] = foxHeals(report)
    expect(foxHeals(report)).toMatchObject([{ round: 2, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: 174 }])
    expect(healed.segments).toContainEqual({ type: 'damage', value: 174, category: 'heal' })
    expect(report.events[report.events.indexOf(healed) - 1]).toMatchObject({ round: 2, type: 'DODGE', targetSlot: 'ALLY_MAIN' })
    expect(foxHeals(fight(dodgeGear, { ...options, enemyMain: { ...enemy, atk: 1 } }))).toMatchObject([{ hpDelta: 70 }])
    const full = fight(dodgeGear, { player: agile(71), surviveRounds: 1 })
    expect(full.events.some((event) => event.type === 'DODGE')).toBe(true)
    expect(foxHeals(full)).toEqual([])
  })

  it('少室山只给实际闪避的灵狐令穿戴者回血，每次闪避独立记账', () => {
    const weak = { ...player, stats: { ...player.stats, con: 0, str: 1 } }
    const report = simulateShaoshiRaid('raid-recovery', [
      { player: { ...weak, id: 'a' }, loadout, learnedSkills: {} },
      { player: { ...agile(29), id: 'b' }, loadout: { ...loadout, ...pair, lightSkillId: 'lingbo_weibu' }, learnedSkills: {} },
      { player: { ...agile(42), id: 'c' }, loadout: { ...loadout, ...dodgeGear, lightSkillId: 'lingbo_weibu' }, learnedSkills: {} },
    ])
    expect(report.events.filter((event) => event.round === 2 && event.type === 'DODGE').map((event) => event.targetSlot))
      .toEqual(['ALLY_RIGHT', 'ALLY_LEFT', 'ALLY_RIGHT'])
    const heals = effectEvents(report, foxId).filter((event) => event.round === 2)
    expect(heals).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', hpDelta: 174 },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', hpDelta: 174 },
    ])
    expect(heals.map((event) => report.events[report.events.indexOf(event) - 1].actorSlot)).toEqual(['ENEMY_LEFT', 'ENEMY_MAIN'])
    expect(effectEvents(report, coatId).filter((event) => event.round <= 2)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_LEFT', hpDelta: 60 },
      { round: 2, actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_LEFT', hpDelta: 60 },
    ])
  })

  it('少室山的凌波微步按闪避者回怒并封顶，同次闪避可以触发灵狐令回血', () => {
    const weak = { ...player, stats: { ...player.stats, con: 0, str: 1 } }
    const report = simulateShaoshiRaid('raid-dodge-rage', [
      { player: { ...weak, id: 'a' }, loadout, learnedSkills: {} },
      { player: { ...agile(29), id: 'b' }, loadout: { ...loadout, ...pair, ultSkillId: 'luanpi_chai' }, learnedSkills: {} },
      {
        player: { ...agile(42), id: 'c' },
        loadout: { ...loadout, ...dodgeGear, lightSkillId: 'lingbo_weibu', ultSkillId: 'shisheng_chuang' },
        learnedSkills: {},
      },
    ])
    const dodges = report.events.filter((event) => event.type === 'DODGE')
    expect(dodges.filter((event) => event.round === 2 && event.targetSlot === 'ALLY_RIGHT'))
      .toMatchObject([{ rageDelta: undefined }, { rageDelta: undefined }])
    expect(dodges.find((event) => event.round === 2 && event.targetSlot === 'ALLY_LEFT'))
      .toMatchObject({ rageDelta: undefined })
    const gains = dodges.filter((event) => event.round <= 6 && event.rageDelta)
    expect(gains).toMatchObject([
      { round: 3, actorSlot: 'ENEMY_RIGHT', targetSlot: 'ALLY_RIGHT', rageTargetSlot: 'ALLY_RIGHT', rageDelta: 25 },
      { round: 6, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_RIGHT', rageTargetSlot: 'ALLY_RIGHT', rageDelta: 25 },
    ])
    expect(report.events).toContainEqual(expect.objectContaining({
      round: 6, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', statusApplied: '击退', statusRounds: 1,
    }))
    expect(dodges.some((event) => event.round === 6 && event.actorSlot === 'ENEMY_LEFT')).toBe(false)
    for (const dodge of gains) {
      expect(dodge.segments).toContainEqual({ type: 'text', text: `，被闪开了，怒气 +${dodge.rageDelta}。` })
      expect(report.events[report.events.indexOf(dodge) + 1])
        .toMatchObject({ effectSourceId: foxId, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', hpDelta: 174 })
    }
    const casts = report.events.filter((event) => event.round === 6 && event.isUlt && event.actorSlot?.startsWith('ALLY'))
    expect(casts)
      .toMatchObject([{ actorSlot: 'ALLY_RIGHT', skillId: 'shisheng_chuang', rageDelta: -85 }])
    expect(casts[0].segments)
      .toContainEqual({ type: 'tag', text: '蛮牛横撞 · 暴击率 +8 个百分点（本次 20%）', tone: 'gold' })
    const capped = simulateShaoshiRaid('raid-dodge-rage-cap', [
      { player, loadout, learnedSkills: {} },
      { player, loadout, learnedSkills: {} },
      { player: agile(45), loadout: { ...loadout, ...dodgeGear, lightSkillId: 'lingbo_weibu' }, learnedSkills: {} },
    ])
    expect(capped.events.find((event) => event.round === 1 && event.type === 'DODGE' && event.targetSlot === 'ALLY_RIGHT'))
      .toMatchObject({ rageDelta: 15, rageTargetSlot: 'ALLY_RIGHT' })
  })

  it('历练正常配装在物品详情和回放中显示长白自愈', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats)
      store.trial.maxStageId = 13
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      store.updateLoadout(loadout)
      for (const id of Object.values(pair)) {
        store.ownedItemIds.push(id)
        store.equipItem(id)
      }
      store.inspectById('item', coatId)
      expect(store.inspectModal?.extra).toContain('回合末回复自身 40 点气血')
      expect(store.inspectModal?.extra).toContain('气血上限 +800，自身装备或心法触发的回合末回血 +50%')
      store.challengeTrialStage(7)
      expect(mainUnit(store.activeBattle!).maxHp).toBe(4234)
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual({ type: 'damage', value: 60, category: 'heal' })
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('受击减伤、近战反伤和回怒', () => {
  const jiuyang = { innerSkillId: 'jiuyang_shengong' }
  const shieldGear = {
    headId: trialPartId('quanzhen_beidou', 'HEAD'), wristId: trialPartId('quanzhen_beidou', 'WRIST'),
    beltId: trialPartId('quanzhen_beidou', 'BELT'), accId: trialPartId('quanzhen_beidou', 'ACC'),
  }
  const waveGear = {
    headId: trialPartId('canghai_kuanglan', 'HEAD'), wristId: trialPartId('canghai_kuanglan', 'WRIST'),
    beltId: trialPartId('canghai_kuanglan', 'BELT'), accId: trialPartId('canghai_kuanglan', 'ACC'),
  }
  const hitAt = (report: BattleReportDTO, round: number) => report.events.find((event) =>
    event.round === round && event.targetSlot === 'ALLY_MAIN' &&
    (event.type === 'GUARD_BLOCK' || event.hitResult === 'HIT' || event.hitResult === 'PARRY'),
  )!

  it.each([
    ['wucan_baoyi', 35],
    [trialPartId('henglian_tongjia', 'ARMOR'), 10],
  ])('%s 的物理减伤先于护盾，战报分别记录减伤和实际吸收', (armorId, percent) => {
    const gear = { ...shieldGear, armorId }
    const { def } = computeDerivedStats(player, { ...loadout, ...gear })
    const ordinary = incomingDamage(enemy.atk, 1, def, player.level)
    const reduced = Math.round(ordinary * (100 - percent) / 100)
    const hit = hitAt(fight(gear, { surviveRounds: 1 }), 1)
    expect(hit).toMatchObject({ hpDelta: 0, shieldAbsorbed: reduced })
    expect(hit.segments).toContainEqual({
      type: 'tag', text: `${ITEMS[armorId].name} · 盾前减伤 ${ordinary - reduced}`, tone: 'jade',
    })
  })

  it('东邪长衫只减免本次攻击者的奇门伤害', () => {
    const gear = { armorId: trialPartId('bihai_chaosheng', 'ARMOR') }
    const fierce = hitAt(fight(gear, { surviveRounds: 1 }), 1)
    const agile = hitAt(fight(gear, { enemyMain: agileEnemy, surviveRounds: 1 }), 1)
    expect(fierce.hpDelta).toBe(-136)
    expect(fierce.segments.some((segment) => segment.type === 'tag' && segment.text.includes('盾前减伤'))).toBe(false)
    expect(agile.hpDelta).toBe(-84)
    expect(agile.segments).toContainEqual({ type: 'tag', text: '青色织锦东邪长衫 · 盾前减伤 28', tone: 'jade' })
  })

  it('九阳反弹援护后实扣的近战气血，远程照常回怒，软猬甲优先反伤', () => {
    const gear = { ...jiuyang, rightCompanionId: 'huangrong', ultSkillId: 'yiyang_zhi' }
    const report = fight(gear)
    expect(hitAt(report, 2)).toMatchObject({ type: 'GUARD_BLOCK', hpDelta: -99, rageDelta: 10, rageTargetSlot: 'ALLY_MAIN' })
    expect(effectEvents(report, jiuyang.innerSkillId)).toMatchObject([{ hpDelta: -83 }, { round: 2, hpDelta: -40 }])
    const ranged = fight(gear, { enemyMain: { ...enemy, combat: { range: 'RANGED' } } })
    expect(effectEvents(ranged, jiuyang.innerSkillId)).toEqual([])
    expect(hitAt(ranged, 2).rageDelta).toBe(10)
    const hedgehog = fight({ ...gear, armorId: 'ruanwei_armor', stance: 'TAICHI' })
    expect(effectEvents(hedgehog, jiuyang.innerSkillId)).toEqual([])
    expect(effectEvents(hedgehog, 'ruanwei_armor')[0]).toMatchObject({ hpDelta: -113, statusApplied: '软猬剧毒' })
    expect(hedgehog.events.some((event) => event.reflectDelta)).toBe(false)
  })

  it('九袋与九阳按命中回怒，沧海按实扣气血回怒，实际加成以 100 封顶', () => {
    const gear = { ...jiuyang, armorId: 'jiudai_baina', ultSkillId: 'yiyang_zhi' }
    const shielded = fight({ ...gear, ...shieldGear })
    const absorbed = hitAt(shielded, 2)
    expect(absorbed).toMatchObject({ hpDelta: 0, shieldAbsorbed: 139, rageDelta: 40 })
    expect(effectEvents(shielded, jiuyang.innerSkillId)).toEqual([])
    expect(absorbed.segments).toContainEqual({ type: 'tag', text: '九袋百衲丐衣 · 受击怒气 +10', tone: 'gold' })
    expect(hitAt(shielded, 1).rageDelta).toBe(15)
    expect(hitAt(shielded, 1).segments.some((segment) => segment.type === 'tag' && segment.text.includes('受击怒气'))).toBe(false)

    const wave = hitAt(fight({ ...gear, ...waveGear }), 2)
    expect(wave).toMatchObject({ hitResult: 'PARRY', hpDelta: -94, rageDelta: 50 })
    expect(wave.segments).toContainEqual({ type: 'tag', text: '沧海狂澜风暴套装（4件） · 受击怒气 +10', tone: 'gold' })
  })

  it('少室山按实际承伤玩家减伤和回怒，队友护盾全挡时保留实扣气血条件', () => {
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id, level: 30, stats: { ...player.stats, con: 350 } },
      loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const raid = simulateShaoshiRaid('raid-hit-effects', [
      member('lead', shieldGear),
      member('left', { ...jiuyang, ...waveGear, armorId: 'jiudai_baina' }),
      member('right', { armorId: 'wucan_baoyi' }),
    ])
    const hits = raid.events.filter((event) => event.round === 1 && event.hitResult === 'HIT' && event.targetSlot?.startsWith('ALLY'))
    expect(hits).toMatchObject([
      { targetSlot: 'ALLY_MAIN', hpDelta: 0 },
      { targetSlot: 'ALLY_LEFT', hpDelta: 0, rageTargetSlot: 'ALLY_LEFT', rageDelta: 15 },
      { targetSlot: 'ALLY_RIGHT', hpDelta: 0, shieldAbsorbed: 399 },
    ])
    expect(hits[0].rageDelta).toBeUndefined()
    expect(hits[1].segments).toContainEqual({ type: 'tag', text: '九袋百衲丐衣 · 受击怒气 +5', tone: 'gold' })
    expect(hits[1].segments.some((segment) => segment.type === 'tag' && segment.text.includes('沧海'))).toBe(false)
    expect(hits[2].segments).toContainEqual({ type: 'tag', text: '大雪山乌蚕宝衣 · 盾前减伤 215', tone: 'jade' })
    expect(effectEvents(raid, jiuyang.innerSkillId).filter((event) => event.round === 1)).toEqual([])
  })
})

describe('招架、法华反震和太湖回血', () => {
  const fahua = 'fahua_zuyi'
  const taihu = 'taihu_shuizhai'
  const focused = { ...player, stats: { ...player.stats, intStat: 47 } }
  const enemyHit = (report: BattleReportDTO) => report.events.find((event) =>
    event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN' && event.targetSlot === 'ALLY_MAIN',
  )!

  it('招架和吸伤按有效槽位结算，法华反震按招架后的实扣气血', () => {
    const gear = {
      weaponId: trialPartId(fahua, 'WEAPON'), headId: trialPartId(fahua, 'HEAD'),
      armorId: trialPartId(fahua, 'ARMOR'), beltId: trialPartId(fahua, 'BELT'),
    }
    const stats = computeDerivedStats(focused, { ...loadout, ...gear })
    expect(stats).toMatchObject({ parry: 15, parryAbsorb: 44 })
    expect(computeDerivedStats(focused, { ...loadout, accId: gear.weaponId }).parry).toBe(0)
    const report = fight(gear, { player: focused, surviveRounds: 1 })
    const unguarded = incomingDamage(enemy.atk, 1, stats.def, focused.level)
    const actual = Math.round(unguarded * 0.56)
    expect(enemyHit(report)).toMatchObject({ hitResult: 'PARRY', hpDelta: -actual })
    expect(enemyHit(report).segments).toContainEqual({ type: 'tag', text: `招架 · 盾前减伤 ${unguarded - actual}`, tone: 'jade' })
    expect(effectEvents(report, fahua).filter((event) => event.targetSlot === 'ENEMY_MAIN'))
      .toMatchObject([{ hpDelta: -Math.round(actual * 0.20) }])
  })

  it('招架先于护盾，盾全吸收时铜钹不反震', () => {
    const set = 'quanzhen_beidou'
    const weaponId = trialPartId('xiyu_mizong', 'WEAPON')
    const gear = {
      weaponId, headId: trialPartId(set, 'HEAD'), wristId: trialPartId(set, 'WRIST'),
      beltId: trialPartId(set, 'BELT'), accId: trialPartId(set, 'ACC'),
    }
    const report = fight(gear, { player: focused, surviveRounds: 1 })
    const stats = computeDerivedStats(focused, { ...loadout, ...gear })
    const parried = Math.round(incomingDamage(enemy.atk, 1, stats.def, focused.level) * 0.60)
    expect(enemyHit(report)).toMatchObject({ hitResult: 'PARRY', hpDelta: 0, shieldAbsorbed: parried })
    expect(effectEvents(report, weaponId).filter((event) => event.targetSlot === 'ENEMY_MAIN')).toEqual([])
  })

  it('玄铁缠丝护腕仅给实际招架者省 2 点内力，护盾全挡和少室山独立结算', () => {
    const weaponId = 'chansi_hufan'
    const wristId = trialPartId('zuixian_xingshang', 'WRIST')
    const gear = { ...equipped('quanzhen_beidou', ['HEAD', 'BELT', 'ACC', 'ARMOR']), wristId }
    const plain = fight(gear, { player: focused, surviveRounds: 1 })
    const discounted = fight({ ...gear, weaponId }, { player: focused, surviveRounds: 1 })
    expect(enemyHit(plain)).toMatchObject({ hitResult: 'PARRY', hpDelta: 0 })
    expect(enemyHit(discounted)).toMatchObject({ hitResult: 'PARRY', hpDelta: 0, shieldAbsorbed: enemyHit(plain).shieldAbsorbed })
    expect(plain.events).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_MAIN', mpDelta: -10 }))
    expect(effectEvents(discounted, weaponId)).toMatchObject([{ actorSlot: 'ALLY_MAIN', mpDelta: -8, segments: [
      { type: 'tag', text: '招架 · 内力 −8', tone: 'jade' }, { type: 'tag', text: '玄铁缠丝护腕 · 节省 2 点内力', tone: 'gold' },
    ] }])
    expect(effectEvents(fight({ weaponId }, { player: focused, surviveRounds: 1 }), weaponId)).toEqual([])

    const member = (id: string, patch: Partial<LoadoutPresetDTO>, intStat = 30) => ({
      player: { ...player, id, level: 30, stats: { ...player.stats, con: 350, intStat } },
      loadout: { ...loadout, ...patch }, learnedSkills: {},
    })
    const kit = { ...equipped(taihu, ['HEAD', 'BELT', 'ACC']), wristId: trialPartId('niluan_jiuyin', 'WRIST'), weaponId }
    const raid = simulateShaoshiRaid('raid-parry-mp', [member('lead', {}), member('left', kit), member('right', {})])
    const discount = effectEvents(raid, weaponId).filter((event) => event.mpDelta)
    expect(discount.length).toBeGreaterThan(0)
    expect(discount.every((event) => event.actorSlot === 'ALLY_LEFT' && event.mpDelta === -8)).toBe(true)
  })

  it('少室山太湖四件只为实际招架的穿戴者回血，按缺失气血封顶', () => {
    const gear = {
      weaponId: trialPartId(taihu, 'WEAPON'), headId: trialPartId(taihu, 'HEAD'),
      beltId: trialPartId(taihu, 'BELT'), accId: trialPartId(taihu, 'ACC'),
    }
    const member = (id: string, patch: Partial<LoadoutPresetDTO>, intStat = 10) => ({
      player: { ...player, id, level: 30, stats: { ...player.stats, con: 350, intStat } },
      loadout: { ...loadout, ...patch }, learnedSkills: {},
    })
    const left = member('left', gear, 30)
    const report = simulateShaoshiRaid('raid-parry', [member('lead', {}), left, member('right', {})])
    const hit = report.events.find((event) => event.round === 1 && event.hitResult === 'PARRY')!
    expect(hit).toMatchObject({ actorSlot: 'ENEMY_RIGHT', targetSlot: 'ALLY_LEFT' })
    const { def } = computeDerivedStats(left.player, left.loadout)
    expect(effectEvents(report, taihu).filter((event) => event.round === 1 && event.hpDelta)).toMatchObject([
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_LEFT', hpDelta: Math.min(-hit.hpDelta!, Math.round(def * 0.50)) },
    ])
  })

  it('历练丘处机可招架外功，独立的装备真伤仍按实扣结算', () => {
    const boss = trialStageOf(28)!.boss
    const weaponId = trialPartId('henglian_tongjia', 'WEAPON')
    const runner = { ...player, stats: { ...player.stats, agi: 16 } }
    const report = fight({ weaponId }, { player: runner, enemyMain: { ...boss, mp: 500 }, surviveRounds: 1 })
    expect(mainCast(report).hitResult).toBe('PARRY')
    expect(effectEvents(report, weaponId)).toMatchObject([{ hpDelta: -45 }])
  })
})

describe('软猬甲、一阳指与兰花拂穴手', () => {
  const armorId = 'ruanwei_armor'
  const charge = { round: 1, name: '怒浪排壑', damageMultiplier: 2 }
  const enemyAttacks = (report: BattleReportDTO) => report.events.filter((event) =>
    event.type === 'SKILL_CAST' && event.actorSlot.startsWith('ENEMY'))

  it('软猬甲以攻击者攻击力结算反伤，剧毒结算两次后解除', () => {
    const report = fight({ armorId, outerSkillId: 'lanhua_fuxue' }, {
      enemyMain: { ...enemy, combat: { charge: { ...charge, round: 2 } } },
      surviveRounds: 3,
    })
    expect(enemyAttacks(report)).toMatchObject([{ round: 1, hpDelta: -144 }])
    const [reflect, firstTick, lastTick] = effectEvents(report, armorId)
    expect(effectEvents(report, armorId)).toMatchObject([
      { round: 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -113, statusApplied: '软猬剧毒', statusRounds: 2 },
      { round: 1, type: 'DOT_TICK', targetSlot: 'ENEMY_MAIN', hpDelta: -14, statusRounds: 1 },
      { round: 2, type: 'DOT_TICK', targetSlot: 'ENEMY_MAIN', hpDelta: -14, statusRemoved: '软猬剧毒', statusRounds: 0 },
    ])
    expect(reflect.segments).toContainEqual({ type: 'damage', value: 113, category: 'reflect' })
    expect(reflect.segments).toContainEqual({ type: 'tag', text: '软猬剧毒 · 2 回合', tone: 'red' })
    expect(firstTick.segments).toContainEqual({ type: 'damage', value: 14, category: 'poison' })
    expect(lastTick.segments).toContainEqual({ type: 'text', text: '，毒效结束。' })
  })

  it('援护后的近战命中照常反伤并刷新剧毒，每回合只结算一次毒伤', () => {
    const report = fight({ armorId, stance: 'TAICHI', rightCompanionId: 'huangrong' })
    expect(report.events).toContainEqual(expect.objectContaining({ round: 2, type: 'GUARD_BLOCK', hpDelta: expect.any(Number) }))
    expect(report.events.some((event) => event.reflectDelta)).toBe(false)
    expect(effectEvents(report, armorId)).toMatchObject([
      { round: 1, type: 'EFFECT', hpDelta: -113, statusRounds: 2 },
      { round: 1, type: 'DOT_TICK', hpDelta: -14, statusRounds: 1 },
      { round: 2, type: 'EFFECT', hpDelta: -113, statusRounds: 2 },
      { round: 2, type: 'DOT_TICK', hpDelta: -14, statusRounds: 1 },
    ])
  })

  it('远程命中和闪避都不会触发软猬甲', () => {
    const ranged = fight({ armorId }, { enemyMain: { ...enemy, combat: { range: 'RANGED' } } })
    expect(enemyAttacks(ranged)).toHaveLength(2)
    expect(effectEvents(ranged, armorId)).toEqual([])

    const dodge = fight({ armorId, lightSkillId: 'lingbo_weibu' }, { surviveRounds: 1 })
    expect(dodge.events).toContainEqual(expect.objectContaining({ round: 1, type: 'DODGE' }))
    expect(effectEvents(dodge, armorId)).toEqual([])
  })

  it('反伤和毒伤封顶于实际扣除的气血，反伤击杀时不施毒', () => {
    const reflected = fight({ armorId }, { enemyMain: { ...enemy, hp: 200 } })
    expect(reflected.winner).toBe('ALLY')
    expect(effectEvents(reflected, armorId)).toMatchObject([{ type: 'EFFECT', hpDelta: -58 }])
    expect(effectEvents(reflected, armorId)[0].statusApplied).toBeUndefined()
    expect(effectEvents(reflected, armorId)[0].segments).toContainEqual({ type: 'damage', value: 58, category: 'reflect' })

    const poisoned = fight({ armorId }, { enemyMain: { ...enemy, hp: 260 } })
    expect(poisoned.winner).toBe('ALLY')
    expect(effectEvents(poisoned, armorId)).toMatchObject([
      { type: 'EFFECT', hpDelta: -113, statusApplied: '软猬剧毒' },
      { type: 'DOT_TICK', hpDelta: -5, statusRemoved: '软猬剧毒', statusRounds: 0 },
    ])
    expect(effectEvents(poisoned, armorId)[1].segments).toContainEqual({ type: 'damage', value: 5, category: 'poison' })
  })

  it('一阳指只在施展时穿透 65% 防御，战报按剩余气血显示增伤', () => {
    const build = { ultSkillId: 'yiyang_zhi' }
    const armored = { ...enemy, combat: { def: 400 } }
    const report = fight(build, { enemyMain: armored })
    const [outer, ult] = report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
    expect(outer.hpDelta).toBe(-79)
    expect(outer.segments.some((segment) => segment.type === 'tag' && segment.text.includes('穿透'))).toBe(false)
    expect(ult).toMatchObject({ skillId: 'yiyang_zhi', isUlt: true, hpDelta: -315 })
    expect(ult.segments).toContainEqual({ type: 'tag', text: '一阳指·乾阳通脉 · 穿透 260 点防御 · 增伤 +92', tone: 'gold' })

    const unarmored = fight(build).events.find((event) => event.isUlt)!
    expect(unarmored.hpDelta).toBe(-404)
    expect(unarmored.segments.some((segment) => segment.type === 'tag' && segment.text.includes('穿透'))).toBe(false)

    const capped = fight(build, { enemyMain: { ...armored, hp: 374 } }).events.find((event) => event.isUlt)!
    expect(capped.hpDelta).toBe(-295)
    expect(capped.segments).toContainEqual({ type: 'tag', text: '一阳指·乾阳通脉 · 穿透 260 点防御 · 增伤 +72', tone: 'gold' })
  })

  it.each(['lanhua_shou', 'lanhua_fuxue'])('%s 命中后取消蓄力招式，敌方下一回合恢复出手', (outerSkillId) => {
    const options = { enemyMain: { ...enemy, combat: { charge } }, surviveRounds: 3 }
    const baseline = fight({}, options)
    expect(baseline.events).toContainEqual(expect.objectContaining({ round: 2, actorSlot: 'ENEMY_MAIN', statusRemoved: '蓄力' }))
    expect(enemyAttacks(baseline)).toMatchObject([{ round: 2, hpDelta: -414 }, { round: 3, hpDelta: -207 }])

    const report = fight({ outerSkillId }, options)
    expect(report.events).toContainEqual(expect.objectContaining({
      round: 1, actorSlot: 'ENEMY_MAIN', statusApplied: '蓄力', statusRounds: 1,
    }))
    const interruptions = effectEvents(report, outerSkillId)
    expect(interruptions).toMatchObject([{ round: 2, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', statusRemoved: '蓄力' }])
    expect(interruptions[0].segments).toContainEqual({ type: 'tag', text: '打断蓄力', tone: 'jade' })
    expect(enemyAttacks(report)).toMatchObject([{ round: 3, hpDelta: -207 }])
  })

  it('兰花拂穴手打中护卫时不会打断首领的蓄力', () => {
    const report = fight({ outerSkillId: 'lanhua_fuxue' }, {
      enemyMain: { ...enemy, combat: { charge: { ...charge, round: 2 } } },
      enemyGuards: [enemy],
      surviveRounds: 3,
    })
    expect(report.events).toContainEqual(expect.objectContaining({ round: 3, skillId: 'lanhua_fuxue', targetSlot: 'ENEMY_LEFT' }))
    expect(effectEvents(report, 'lanhua_fuxue')).toEqual([])
    expect(enemyAttacks(report)).toMatchObject([{ round: 1 }, { round: 3, hpDelta: -414 }])
  })

  it('首领进入狂暴时结束蓄力并正常出手', () => {
    const report = fight({ outerSkillId: 'lanhua_fuxue' }, {
      enemyMain: { ...enemy, hp: 10_000, atk: 1, combat: { charge: { ...charge, round: 11 } } },
      surviveRounds: 12,
    })
    expect(report.events).toContainEqual(expect.objectContaining({ round: 11, statusApplied: '蓄力' }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 12, type: 'BOSS_ENRAGE' }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 12, actorSlot: 'ENEMY_MAIN', statusRemoved: '蓄力' }))
    expect(enemyAttacks(report).at(-1)).toMatchObject({ round: 12, actorSlot: 'ENEMY_MAIN' })
    expect(effectEvents(report, 'lanhua_fuxue')).toEqual([])
  })

  it('少室山按穿戴者和攻击目标结算反伤、毒伤及穿透', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 45, con: 75 } }
    const build = { ...loadout, weaponId: 'xuantie_dagger', ultSkillId: 'yiyang_zhi' }
    const fighter = (id: string, preset: LoadoutPresetDTO) => ({ player: { ...character, id }, loadout: preset, learnedSkills: {} })
    const report = simulateShaoshiRaid('raid-effects', [fighter('a', { ...build, armorId }), fighter('b', build), fighter('c', build)])
    const armorEvents = effectEvents(report, armorId)
    expect(armorEvents.every((event) => event.actorSlot === 'ALLY_MAIN')).toBe(true)
    expect(armorEvents.slice(0, 2)).toMatchObject([
      { round: 1, type: 'EFFECT', targetSlot: 'ENEMY_LEFT', hpDelta: -351, statusApplied: '软猬剧毒' },
      { round: 1, type: 'DOT_TICK', targetSlot: 'ENEMY_LEFT', hpDelta: -136 },
    ])
    const ult = report.events.find((event) => event.skillId === 'yiyang_zhi' && event.targetSlot === 'ENEMY_MAIN')!
    expect(ult).toMatchObject({ hpDelta: -1673, shieldAbsorbed: 1200, shieldDelta: -1200, statusRemoved: '护盾' })
    expect(ult.segments).toContainEqual({ type: 'tag', text: '一阳指·乾阳通脉 · 穿透 156 点防御 · 增伤 +210', tone: 'gold' })
  })

  it('历练第 10 关回放展示打断、反伤和毒伤，并同步扣除气血', () => {
    vi.useFakeTimers()
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats)
      store.trial.maxStageId = 10
      store.trial.stageHours['10'] = TRIAL_PATROL_HOURS[10]
      store.learnedSkills.lanhua_fuxue = 1
      store.ownedItemIds.push(armorId)
      store.updateLoadout({ ...loadout, outerSkillId: 'lanhua_fuxue', armorId })
      store.challengeTrialStage(10)

      const report = store.activeBattle!
      expect(effectEvents(report, 'lanhua_fuxue')).toMatchObject([{ round: 2, statusRemoved: '蓄力' }])
      const reflectIndex = report.events.findIndex((event) => event.effectSourceId === armorId && event.type === 'EFFECT')
      const poisonIndex = report.events.findIndex((event) => event.type === 'DOT_TICK')
      expect(reflectIndex).toBeGreaterThan(0)
      expect(poisonIndex).toBeGreaterThan(reflectIndex)
      vi.advanceTimersByTime(reflectIndex * 920)
      expect(store.floatingPopups.ENEMY_MAIN).toMatchObject({ category: 'reflect', text: `反伤 ${report.events[reflectIndex].hpDelta}` })
      const hpAfterReflect = store.liveUnitStates.ENEMY_MAIN.hp
      vi.advanceTimersByTime((poisonIndex - reflectIndex) * 920)
      const poison = report.events[poisonIndex]
      expect(store.floatingPopups.ENEMY_MAIN).toMatchObject({ category: 'poison', text: `毒伤 ${poison.hpDelta}` })
      expect(store.liveUnitStates.ENEMY_MAIN.hp).toBe(hpAfterReflect + poison.hpDelta!)

      store.skipBattleToEnd()
      expect(store.isBattlePlaying).toBe(false)
      const segments = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(segments).toContainEqual({ type: 'tag', text: '打断蓄力', tone: 'jade' })
      expect(segments).toContainEqual({ type: 'damage', value: -poison.hpDelta!, category: 'poison' })
    } finally {
      store.closeBattleStage()
      vi.useRealTimers()
    }
  })
})

describe('护盾与九阴白骨爪', () => {
  const clawId = 'jiuyin_baiguzhua'
  const claw = { outerSkillId: clawId }
  const beidouId = 'quanzhen_beidou'
  const beidou = {
    headId: trialPartId(beidouId, 'HEAD'), wristId: trialPartId(beidouId, 'WRIST'),
    beltId: trialPartId(beidouId, 'BELT'), accId: trialPartId(beidouId, 'ACC'),
  }
  const mainAttacks = (report: BattleReportDTO) => report.events.filter((event) =>
    event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')

  it('普攻先消耗护盾，盾破后只扣溢出的气血，追击也走同一结算', () => {
    const options = { enemyMain: { ...enemy, combat: { openingShield: 200 } }, surviveRounds: 3 }
    const report = fight({}, options)
    expect(report.events[1]).toMatchObject({ targetSlot: 'ENEMY_MAIN', statusApplied: '护盾', shieldDelta: 200 })
    const [first, second, third] = mainAttacks(report)
    expect(first).toMatchObject({ hpDelta: 0, shieldAbsorbed: 142, shieldDelta: -142 })
    expect(first.statusRemoved).toBeUndefined()
    expect(first.segments).toContainEqual({ type: 'tag', text: '护盾剩余 58', tone: 'jade' })
    expect(second).toMatchObject({ hpDelta: -89, shieldAbsorbed: 58, shieldDelta: -58, statusRemoved: '护盾' })
    expect(second.segments).toContainEqual({ type: 'tag', text: '破盾', tone: 'red' })
    expect(third.hpDelta).toBe(-151)
    expect(third.shieldAbsorbed).toBeUndefined()

    const assisted = fight({ leftCompanionId: 'guojing' }, { ...options, surviveRounds: 1, companionOf: baseCompanion })
    expect(assisted.events.find((event) => event.type === 'ASSIST_ATTACK')).toMatchObject({
      hpDelta: -54, shieldAbsorbed: 58, shieldDelta: -58, statusRemoved: '护盾',
    })
  })

  it('白骨爪双倍消耗盾值，奇数盾值用完时只按实际未吸收伤害扣血', () => {
    const shielded = fight(claw, { enemyMain: { ...enemy, combat: { openingShield: 299 } }, surviveRounds: 1 })
    const hit = mainAttacks(shielded)[0]
    expect(mainAttacks(fight(claw))[0].hpDelta).toBe(-221)
    expect(hit).toMatchObject({ hpDelta: -71, shieldDelta: -299, shieldAbsorbed: 150, statusRemoved: '护盾' })
    expect(hit.segments).toContainEqual({ type: 'tag', text: '护盾吸收 150 · 撕盾 299', tone: 'jade' })
    expect(hit.segments).toContainEqual({ type: 'damage', value: 71, category: 'phys', isCrit: false })
  })

  it('完全吸收的白骨爪仍施加流血，流血穿过护盾结算两回合后解除', () => {
    const report = fight({ ...claw, ultSkillId: 'yiyang_zhi' }, { enemyMain: { ...enemy, combat: { openingShield: 1000 } } })
    expect(mainAttacks(report)).toMatchObject([
      { round: 1, skillId: clawId, hpDelta: 0, shieldDelta: -442, shieldAbsorbed: 221 },
      { round: 2, skillId: 'yiyang_zhi', hpDelta: 0, shieldDelta: -404, shieldAbsorbed: 404 },
    ])
    const [applied, firstTick, lastTick] = effectEvents(report, clawId)
    expect(effectEvents(report, clawId)).toMatchObject([
      { round: 1, type: 'EFFECT', targetSlot: 'ENEMY_MAIN', statusApplied: '流血', statusRounds: 2 },
      { round: 1, type: 'DOT_TICK', targetSlot: 'ENEMY_MAIN', hpDelta: -29, statusRounds: 1 },
      { round: 2, type: 'DOT_TICK', targetSlot: 'ENEMY_MAIN', hpDelta: -29, statusRounds: 0, statusRemoved: '流血' },
    ])
    expect(applied.segments).toContainEqual({ type: 'tag', text: '九阴白骨爪 · 流血', tone: 'red' })
    expect(firstTick.segments).toContainEqual({ type: 'damage', value: 29, category: 'bleed' })
    expect(lastTick.segments).toContainEqual({ type: 'text', text: '，流血结束。' })
  })

  it('流血刷新时每回合结算一次，并与软猬剧毒独立结算', () => {
    const report = fight({ ...claw, armorId: 'ruanwei_armor' }, { enemyMain: { ...enemy, combat: { openingShield: 1500 } } })
    expect(effectEvents(report, clawId).filter((event) => event.statusApplied)).toMatchObject([
      { round: 1, statusApplied: '流血', statusRounds: 2 },
      { round: 2, statusApplied: '流血', statusRounds: 2 },
    ])
    expect(report.events.filter((event) => event.type === 'DOT_TICK')).toMatchObject([
      { round: 1, effectSourceId: 'ruanwei_armor', hpDelta: -14, statusRounds: 1 },
      { round: 1, effectSourceId: clawId, hpDelta: -29, statusRounds: 1 },
      { round: 2, effectSourceId: 'ruanwei_armor', hpDelta: -14, statusRounds: 1 },
      { round: 2, effectSourceId: clawId, hpDelta: -29, statusRounds: 1 },
    ])
  })

  it('流血击杀按剩余气血播报，出招直接击杀时不施加流血', () => {
    const killedByBleed = fight(claw, { enemyMain: { ...enemy, hp: 225 } })
    expect(killedByBleed.winner).toBe('ALLY')
    expect(effectEvents(killedByBleed, clawId).at(-1)).toMatchObject({
      type: 'DOT_TICK', hpDelta: -4, statusRemoved: '流血', statusRounds: 0,
    })
    expect(killedByBleed.events.at(-1)?.segments).toContainEqual({ type: 'damage', value: 4, category: 'bleed' })
    expect(effectEvents(fight(claw, { enemyMain: { ...enemy, hp: 221 } }), clawId)).toEqual([])
  })

  it('一阳指先算穿透再由护盾吸收，增伤按实际扣除的气血记录', () => {
    const report = fight({ ultSkillId: 'yiyang_zhi' }, { enemyMain: { ...enemy, hp: 105, combat: { def: 400, openingShield: 240 } } })
    const [outer, ult] = mainAttacks(report)
    expect(outer).toMatchObject({ hpDelta: 0, shieldDelta: -79 })
    expect(ult).toMatchObject({ hpDelta: -105, shieldAbsorbed: 161, statusRemoved: '护盾' })
    expect(ult.segments).toContainEqual({ type: 'tag', text: '一阳指·乾阳通脉 · 穿透 260 点防御 · 增伤 +43', tone: 'gold' })
  })

  it('全真北斗四件套为全队补足护盾，先算伙伴援护再由护盾吸收', () => {
    const report = fight({ ...beidou, rightCompanionId: 'huangrong' }, { enemyMain: { ...enemy, atk: 800 }, surviveRounds: 3,
      companionOf: (id) => COMPANIONS[id] && companionView(COMPANIONS[id], { form: 'base' }),
    })
    expect(mainUnit(report).maxMp).toBe(1932)
    expect(effectEvents(report, beidouId).filter((event) => event.shieldDelta)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', shieldDelta: 425, statusApplied: '护盾' },
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_RIGHT', shieldDelta: 425, statusApplied: '护盾' },
      { round: 2, targetSlot: 'ALLY_MAIN', shieldDelta: 425, statusApplied: '护盾' },
      { round: 3, targetSlot: 'ALLY_MAIN', shieldDelta: 238 },
    ])
    expect(report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.hpDelta)).toMatchObject({
      round: 1, hpDelta: -71, shieldAbsorbed: 425, statusRemoved: '护盾',
    })
    expect(report.events.find((event) => event.type === 'GUARD_BLOCK')).toMatchObject({ hpDelta: 0, shieldAbsorbed: 238 })
    expect(effectEvents(fight({ ...beidou, accId: null }), beidouId)).toMatchObject([{
      round: 1, segments: [{ type: 'tag', text: '全真北斗玄黄套装（2件）' }, { type: 'text', text: ' 试招侠客护体防御 +200，内力上限 +800' }],
    }])
  })

  it('少室山共用护盾与流血结算，并按实际施招玩家和受击目标记账', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 45, con: 75 } }
    const build = { ...loadout, weaponId: 'xuantie_dagger' }
    const fighter = (id: string, preset: LoadoutPresetDTO) => ({ player: { ...character, id }, loadout: preset, learnedSkills: {} })
    const report = simulateShaoshiRaid('raid-shields', [
      fighter('a', { ...build, ...beidou, ...claw }), fighter('b', { ...build, ...claw }), fighter('c', build),
    ])
    expect(effectEvents(report, beidouId).filter((event) => event.round === 1 && event.shieldDelta)).toMatchObject([
      { targetSlot: 'ALLY_MAIN', shieldDelta: 1368 },
      { targetSlot: 'ALLY_LEFT', shieldDelta: 1368 },
      { targetSlot: 'ALLY_RIGHT', shieldDelta: 1368 },
    ])
    expect(report.events).toContainEqual(expect.objectContaining({
      round: 1, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_RIGHT', hpDelta: 0, shieldAbsorbed: 894,
    }))
    expect(report.events.find((event) => event.skillId === clawId && event.statusRemoved === '护盾')).toMatchObject({
      round: 3, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -3154, shieldAbsorbed: 600, shieldDelta: -1200,
    })
    expect(effectEvents(report, clawId).filter((event) => event.type === 'DOT_TICK' && event.round === 3 && event.targetSlot === 'ENEMY_MAIN')).toMatchObject([
      { actorSlot: 'ALLY_LEFT', hpDelta: -272, statusRounds: 1 },
    ])
  })

  it('历练第 7 关普通、倍速和跳过回放同步展示盾值、破盾和流血实扣气血', () => {
    vi.useFakeTimers()
    try {
      function replay(speed: 1 | 2 | 'skip') {
        const store = newStore('NEW')
        try {
          Object.assign(store.player.stats, player.stats, { str: 3 })
          store.trial.maxStageId = 7
          store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
          store.learnedSkills[clawId] = 1
          store.updateLoadout({ ...loadout, ...claw })
          if (speed !== 'skip') store.battleSpeed = speed
          store.challengeTrialStage(7)

          const report = store.activeBattle!
          if (speed === 'skip') {
            store.skipBattleToEnd()
          } else {
            const delay = speed === 1 ? 920 : 480
            const hitIndex = report.events.findIndex((event) => event.shieldAbsorbed === 111)
            const tickIndex = report.events.findIndex((event) => event.type === 'DOT_TICK')
            expect(hitIndex).toBeGreaterThan(0)
            expect(tickIndex).toBeGreaterThan(hitIndex)
            vi.advanceTimersByTime(hitIndex * delay)
            expect(store.floatingPopups.ENEMY_MAIN).toMatchObject({ text: '护盾吸收 111', category: 'shield' })
            const hp = store.liveUnitStates.ENEMY_MAIN.hp
            expect(hp).toBe(667)
            vi.advanceTimersByTime((tickIndex - hitIndex) * delay)
            expect(store.floatingPopups.ENEMY_MAIN).toMatchObject({ text: '流血 -17', category: 'bleed' })
            expect(store.liveUnitStates.ENEMY_MAIN.hp).toBe(hp - 17)
            vi.advanceTimersByTime((report.events.length - tickIndex) * delay)
          }
          expect(store.isBattlePlaying).toBe(false)
          const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
          expect(logs).toContainEqual({ type: 'tag', text: '护盾吸收 9 · 撕盾 18', tone: 'jade' })
          expect(logs).toContainEqual({ type: 'tag', text: '破盾', tone: 'red' })
          expect(logs).toContainEqual({ type: 'damage', value: 17, category: 'bleed' })
          return { logs, hp: store.liveUnitStates.ENEMY_MAIN.hp }
        } finally {
          store.closeBattleStage()
        }
      }

      const normal = replay(1)
      expect(replay(2)).toEqual(normal)
      expect(replay('skip')).toEqual(normal)
    } finally {
      vi.useRealTimers()
    }
  })
})
