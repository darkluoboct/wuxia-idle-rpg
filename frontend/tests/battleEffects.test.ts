import { describe, expect, it, vi } from 'vitest'
import type { BattleEventDTO, BattleReportDTO, LoadoutPresetDTO } from '@/network/protocol'
import {
  computeDerivedStats,
  incomingDamage,
  innerPressure,
  simulatePlayerDuel,
  simulateShaoshiRaid,
  strikeDamage,
} from '../../shared/battle.ts'
import {
  applyBattleStatus,
  applyBleedOnHit,
  applyDirectedDamage,
  applyPeriodicOnHit,
  battleDefense,
  endStatusRound,
  lethalSavesFrom,
  recoverRoundMp,
  resolveAttackDamage,
  resolveBattleLoadout,
  resolveDamageOverTime,
  resolveIncomingPhysicalDamage,
  type EnemyBattleState,
  spendBattleMedicines,
  useCriticalHitPill,
  useLowMpPill,
  useRoundStartPill,
} from '../../shared/battleEffects.ts'
import { damageAfterDefense } from '../../shared/combatMeta.ts'
import { MEDICINES, SHAOSHI_RAID, SKILLS, VIP_SKILL_REWARDS } from '../../shared/gameData.ts'
import { TRIAL_PATROL_HOURS, trialPartId, trialStageOf } from '../../shared/trialStages.ts'
import { newStore } from './helpers'
import { player, loadout, pomiaoSet, pomiaoPieces, flaskId, nanBei, enemy, agileEnemy, baseCompanion, fight, effectEvents, mainUnit, mainCast, equipped } from './battleFixtures'

describe('百草药囊按战报扣除库存', () => {
  const yao = 'jiuhua_yulu_wan'
  const yang = 'chunyang_jindan'
  const venom = 'baituo_fushe_gao'
  const mpPill = 'dahuan_dan'
  const powder = 'tongling_huayu_san'
  const withStock = (id: string, count = 1) => ({ ...player, battleMedicines: { [id]: count } })

  it('化瘀散按暴击实扣气血触发一次，回复封顶并减伤下一次外功', () => {
    const owner = withStock(powder, 2)
    const opts = { player: { ...owner, stats: { ...owner.stats, con: 30 } }, surviveRounds: 4, rng: () => 0.99, enemyMain: { ...enemy, combat: { crit: 100 } } }
    const normal = fight({}, opts)
    const report = fight({ battlePillId: powder }, opts)
    const hits = (battle: BattleReportDTO) => battle.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN')
    const [first, second, third] = hits(normal)
    expect(hits(report).slice(0, 3).map((event) => event.hpDelta)).toEqual([first.hpDelta, -Math.round(-second.hpDelta! * 0.6), third.hpDelta])
    const activations = report.events.filter((event) => event.medicineUsed === powder)
    expect(activations).toMatchObject([{ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', statusApplied: '化瘀护身',
      hpDelta: Math.min(-first.hpDelta!, Math.round(mainUnit(report).maxHp * 0.18)) }])
    expect(hits(report)[1].segments).toContainEqual({ type: 'tag', text: `黑沼·通灵化瘀散 · 化瘀护身耗尽 · 盾前减伤 ${-second.hpDelta! - Math.round(-second.hpDelta! * 0.6)}`, tone: 'jade' })
    expect(spendBattleMedicines(owner, report)).toBe(true)
    expect(owner.battleMedicines[powder]).toBe(1)

    const shield = equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])
    const guarded = fight({ ...shield, battlePillId: powder }, { ...opts, surviveRounds: 1 })
    expect(hits(guarded)[0]).toMatchObject({ hitResult: 'CRIT', hpDelta: 0 })
    expect(effectEvents(guarded, powder)).toEqual([])
    const fatal = fight({ battlePillId: powder }, { ...opts, enemyMain: { ...opts.enemyMain, atk: 100_000 } })
    expect(effectEvents(fatal, powder)).toEqual([])
  })

  it('化瘀散受重伤减疗，绝技不消耗护身，随后外功在护盾前减伤一次', () => {
    const gear = { ...loadout, battlePillId: powder }
    const effects = resolveBattleLoadout(gear, withStock(powder)).effects
    const fighter: EnemyBattleState = { unit: { ...mainUnit(fight()), maxHp: 1000 }, shield: 0, atk: 1 }
    const events: BattleEventDTO[] = []
    const attacker: EnemyBattleState = { unit: { ...fighter.unit, slot: 'ENEMY_MAIN' }, shield: 0, atk: 100 }
    const source = { sourceId: 'enemy', sourceName: '敌人' }
    applyBattleStatus(source, { status: 'HEAL_DOWN', percent: 50, rounds: 3 }, attacker.unit.slot, fighter, { hp: 300 }, 1, () => 0, events)
    expect(useCriticalHitPill(fighter, 300, false, 100, effects, 1, events)).toBe(300)
    expect(useCriticalHitPill(fighter, 300, true, 100, effects, 1, events)).toBe(390)
    expect(events.find((event) => event.medicineUsed === powder)).toMatchObject({ hpDelta: 90 })
    fighter.shield = 100
    const contact = { round: 1, events }
    expect(resolveIncomingPhysicalDamage(fighter, 150, 390, effects, 'FIERCE', 0, contact)).toMatchObject({ damage: 50, shieldEvent: { shieldAbsorbed: 100 } })
    fighter.shield = 80
    const hit = resolveIncomingPhysicalDamage(fighter, 200, 340, effects, 'FIERCE', 0, { ...contact, outer: true })
    expect(hit).toMatchObject({ damage: 40, shieldEvent: { shieldAbsorbed: 80 } })
    expect(resolveIncomingPhysicalDamage(fighter, 200, 300, effects, 'FIERCE', 0, { ...contact, outer: true }).damage).toBe(200)
    expect(useCriticalHitPill(fighter, 100, true, 200, effects, 1, events)).toBe(100)
  })

  it('少室山按实际承受暴击的玩家使用化瘀散，库存与护身各自结算', () => {
    const enemyCombat = SHAOSHI_RAID.boss.combat as typeof SHAOSHI_RAID.boss.combat & { crit?: number }
    const before = enemyCombat.crit
    enemyCombat.crit = 100
    try {
      const member = (id: string, count: number) => ({
        player: { ...withStock(powder, count), id, stats: { ...player.stats, con: 300 } },
        loadout: { ...loadout, battlePillId: powder }, learnedSkills: {},
      })
      const [lead, left, right] = [member('lead', 2), member('left', 1), member('right', 0)] as const
      const report = simulateShaoshiRaid('powder', [lead, left, right], () => 0.99)
      const uses = report.events.filter((event) => event.medicineUsed === powder)
      expect(uses.length).toBeGreaterThan(0)
      for (const use of uses) {
        expect(use.actorSlot).toBe(use.targetSlot)
        expect(use.actorSlot).not.toBe('ALLY_RIGHT')
        expect(report.events.slice(0, report.events.indexOf(use)).some((event) => event.targetSlot === use.actorSlot &&
          event.round === use.round && event.hitResult === 'CRIT' && event.hpDelta! < 0)).toBe(true)
      }
      expect(spendBattleMedicines(lead.player, report)).toBe(uses.some(({ actorSlot }) => actorSlot === 'ALLY_MAIN'))
      expect(spendBattleMedicines(left.player, report, 'ALLY_LEFT')).toBe(uses.some(({ actorSlot }) => actorSlot === 'ALLY_LEFT'))
      expect(spendBattleMedicines(right.player, report, 'ALLY_RIGHT')).toBe(false)
    } finally {
      if (before === undefined) delete enemyCombat.crit
      else enemyCombat.crit = before
    }
  })

  it('盾挡下伤害时保留九花玉露丸，横练先锁血，下一次致死才用药', () => {
    const owner = withStock(yao, 2)
    const copper = equipped('henglian_tongjia', ['HEAD', 'ARMOR', 'WRIST', 'BELT'])
    const report = fight({ ...copper, battlePillId: yao }, { player: owner, surviveRounds: 4, enemyMain: { ...enemy, atk: 9000 } })
    const spent = report.events.filter((event) => event.medicineUsed)
    expect(spent).toMatchObject([{ round: 2, targetSlot: 'ALLY_MAIN', medicineUsed: yao, hpDelta: Math.round(mainUnit(report).maxHp * 0.4) }])
    expect(effectEvents(report, 'henglian_tongjia').some((event) => event.round === 1 && event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.endsWith(' · 免死')))).toBe(true)
    expect(owner.battleMedicines[yao]).toBe(2)
    expect(spendBattleMedicines(owner, report)).toBe(true)
    expect(owner.battleMedicines[yao]).toBe(1)
    const shield = equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])
    const guarded = fight({ ...shield, battlePillId: yao }, { player: owner, surviveRounds: 1 })
    expect(guarded.events.some((event) => event.actorSlot === 'ENEMY_MAIN' && event.shieldAbsorbed)).toBe(true)
    expect(spendBattleMedicines(owner, guarded)).toBe(false)
    expect(owner.battleMedicines[yao]).toBe(1)
  })

  it('九花玉露丸触发时清掉内伤，保留其他毒层', () => {
    const report = fight({ battlePillId: yao }, {
      player: withStock(yao), surviveRounds: 2, rng: () => 0.99,
      enemyMain: { ...enemy, atk: 300, combat: { charge: { round: 1, name: '蓄力斩', damageMultiplier: 100 } } },
      enemyGuards: [{ ...enemy, atk: 100, combat: {
        joinsRound: true, periodicOnHit: { status: 'poison', attackPercent: 8, rounds: 4 },
      } }, { ...enemy, atk: 100, combat: {
        joinsRound: true, periodicOnHit: { status: 'bihai', attackPercent: 5, rounds: 4 },
      } }],
    })
    expect(effectEvents(report, yao)).toContainEqual(expect.objectContaining({
      targetSlot: 'ALLY_MAIN', statusRemoved: '碧海内伤',
    }))
    expect(effectEvents(report, yao).some((event) => event.statusRemoved === '软猬剧毒')).toBe(false)
  })

  it('纯阳金丹第二回合净化全队并用当前防御值提高三回合', () => {
    const owner = withStock(yang)
    const equipped = { ...loadout, battlePillId: yang }
    const combat = { statusOnHit: { status: 'SEAL' as const, rounds: 1 }, periodicOnHit: { status: 'poison' as const, attackPercent: 5, rounds: 3 } }
    const report = fight(equipped, { player: owner, surviveRounds: 2, enemyMain: { ...enemy, combat } })
    expect(report.events.filter((event) => event.medicineUsed)).toMatchObject([{ round: 2, targetSlot: 'ALLY_MAIN', medicineUsed: yang }])
    expect(effectEvents(report, yang).filter((event) => event.statusRemoved).map((event) => event.statusRemoved)).toEqual(['软猬剧毒', '封穴'])
    const member = (slot: 'ALLY_MAIN' | 'ALLY_LEFT' | 'ALLY_RIGHT'): EnemyBattleState => ({
      shield: 0, atk: 10, unit: { ...mainUnit(report), slot },
    })
    const party = [member('ALLY_MAIN'), member('ALLY_LEFT'), member('ALLY_RIGHT')]
    const events: BattleEventDTO[] = []
    useRoundStartPill(party[0], resolveBattleLoadout(equipped, owner).effects, party, 2, () => 0.99, events)
    for (const fighter of party) expect([1, 2, 3, 4, 5].map((round) => battleDefense(fighter, 101, round))).toEqual([101, 131, 131, 131, 101])
    expect(events.filter((event) => event.medicineUsed).map((event) => event.actorSlot)).toEqual(['ALLY_MAIN'])
    expect(events.filter((event) => event.statusApplied === '防御提高').map((event) => event.targetSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'])
  })

  it('蝮蛇膏前三次命中叠满破甲，每跳固定 3.5%，只扣一次且空手不用药', () => {
    const gear = { weaponVenomId: venom, weaponId: 'qinggang_sword' }
    const options = { player: withStock(venom), surviveRounds: 7, enemyMain: { ...enemy, atk: 0, combat: { def: 200 } } }
    const report = fight(gear, options)
    const ticks = effectEvents(report, venom).filter((event) => event.type === 'DOT_TICK')
    expect(ticks).toHaveLength(7)
    expect(ticks.every((event) => event.hpDelta === -700)).toBe(true)
    const coatings = effectEvents(report, venom).filter((event) => event.statusApplied)
    expect(coatings.map((event) => [event.round, event.statusStacks])).toEqual([[1, 1], [2, 2], [3, 3], [4, 3], [5, 3]])
    expect(coatings[1].segments.some((segment) => segment.type === 'tag' && segment.text.includes('防御'))).toBe(false)
    expect(coatings[2].segments.some((segment) => segment.type === 'tag' && segment.text.includes('防御 −25%'))).toBe(true)
    expect(coatings.filter((event) => event.medicineUsed)).toHaveLength(1)
    expect(effectEvents(fight({ ...gear, weaponId: null }, options), venom)).toHaveLength(0)
  })

  it('大还丹在低于两成内力时按缺口回满，只加成当回合绝技', () => {
    const kit = resolveBattleLoadout({ ...loadout, battlePillId: mpPill }, withStock(mpPill)).effects
    const unit = { ...mainUnit(fight()), maxMp: 1000 }
    const owner: EnemyBattleState = { unit, shield: 0, atk: 0 }
    const events: BattleEventDTO[] = []
    expect(useLowMpPill(owner, 200, kit, 1, events)).toBe(200)
    expect(useLowMpPill(owner, 199, kit, 2, events)).toBe(1000)
    expect(owner.medicineRound).toMatchObject({ round: 2, percent: 25 })
    expect(useLowMpPill(owner, 100, kit, 3, events)).toBe(100)
    expect(events).toMatchObject([{ mpDelta: 801, medicineUsed: mpPill, round: 2 }])

    const sturdy = { ...withStock(mpPill), stats: { ...player.stats, str: 0, con: 1800 } }
    const kitGear = { ...equipped('canghai_kuanglan', ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'ACC']),
      battlePillId: mpPill, ultSkillId: 'yiyang_zhi' }
    const practice = { ...enemy, hp: 1_000_000, atk: 130 }
    const guard = { ...practice, combat: { joinsRound: true as const } }
    const options = { player: sturdy, surviveRounds: 12, rng: () => 0.99, enemyMain: practice, enemyGuards: [guard, guard] }
    const report = fight(kitGear, options)
    const baseline = fight({ ...kitGear, battlePillId: null }, options)
    const drank = effectEvents(report, mpPill).find((event) => event.medicineUsed)!
    const maxMp = mainUnit(report).maxMp
    const spent = report.events.slice(0, report.events.indexOf(drank)).filter((event) => event.actorSlot === 'ALLY_MAIN')
      .reduce((total, event) => total - (event.mpDelta ?? 0), 0)
    expect(drank).toMatchObject({ round: 10, mpDelta: spent })
    expect(maxMp - spent).toBeLessThan(maxMp / 5)
    const cast = (battle: BattleReportDTO, round: number) => battle.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.round === round && event.isUlt)!
    expect(cast(report, 10).hpDelta).toBeLessThan(cast(baseline, 10).hpDelta!)
    expect(cast(report, 10).segments.some((segment) => segment.type === 'tag' && segment.text.includes('大还丹 · 绝技威力 +25%'))).toBe(true)
    expect(cast(report, 11).segments.some((segment) => segment.type === 'tag' && segment.text.includes('大还丹'))).toBe(false)
  })

  it('药蛇宝血旧存档按毒类取 20% 或 50% 抗性，同图切磋停用药囊', () => {
    const drinker = { ...withStock(yang), storySnakeChoice: 'A' as const }
    const effects = resolveBattleLoadout(loadout, drinker).effects
    const unit = mainUnit(fight())
    const target: EnemyBattleState = { unit, shield: 0, atk: 0 }
    const events: BattleEventDTO[] = []
    const source = { sourceId: 'enemy', sourceName: '敌人', slot: 'ENEMY_MAIN' as const }
    for (const status of ['poison', 'snakeVenom'] as const) applyPeriodicOnHit(source, target, unit.hp,
      { status, attackPercent: 100, rounds: 1 }, { attack: 100, round: 1, rng: () => 0.99 }, events)
    expect(resolveDamageOverTime(target, unit.hp, 1, events, { effects, onLethal: () => undefined })).toBe(unit.hp - 130)
    expect(events.filter((event) => event.type === 'DOT_TICK').map((event) => event.hpDelta)).toEqual([-80, -50])
    const entrant = { player: drinker, loadout: { ...loadout, battlePillId: yang }, learnedSkills: {} }
    const rival = { ...entrant, player: { ...drinker, id: 'rival' } }
    const duel = simulatePlayerDuel({ battleId: 'pill', sceneTitle: '切磋', mode: 'PVP_HUASHAN', lineup: [entrant, rival], rng: () => 0.73, environment: {} })
    expect(duel.events.some((event) => event.medicineUsed)).toBe(false)
    expect(MEDICINES.yaoshe_baoxue.effectDesc).toContain('50%')
  })

  it('少室山只从实际服药的成员扣库存，其他成员共享纯阳防御', () => {
    const member = (id: string, medicine: string | null) => ({
      player: { ...withStock(yang), id, stats: { ...player.stats, con: 500 } },
      loadout: { ...loadout, battlePillId: medicine }, learnedSkills: {},
    })
    const lead = member('lead', null)
    const left = member('left', yang)
    const right = member('right', yang)
    const report = simulateShaoshiRaid('pills', [lead, left, right], () => 0.99, {})
    expect(report.events.filter((event) => event.medicineUsed)).toMatchObject([{ round: 2, actorSlot: 'ALLY_LEFT', medicineUsed: yang }])
    expect(effectEvents(report, yang).filter((event) => event.statusApplied).map((event) => event.targetSlot))
      .toEqual(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'])
    expect(spendBattleMedicines(lead.player, report, 'ALLY_MAIN')).toBe(false)
    expect(spendBattleMedicines(left.player, report, 'ALLY_LEFT')).toBe(true)
    expect(spendBattleMedicines(right.player, report, 'ALLY_RIGHT')).toBe(false)
    expect([lead, left, right].map((entry) => entry.player.battleMedicines[yang])).toEqual([1, 0, 1])
  })
})

it('天下无狗只消耗一次怒气和内力，分别命中在场对手并按各自抗性封穴', () => {
  const target = { ...enemy, atk: 70 }
  const resistant = { ...target, combat: { controlImmunity: ['SEAL' as const] } }
  const report = fight({ ultSkillId: 'tianxia_wugou' }, {
    enemyMain: target, enemyGuards: [target, resistant], surviveRounds: 3, rng: () => 0.99,
  })
  const casts = report.events.filter((event) => event.skillId === 'tianxia_wugou')
  expect(casts.map((event) => event.targetSlot).sort()).toEqual(['ENEMY_LEFT', 'ENEMY_MAIN', 'ENEMY_RIGHT'])
  expect(casts.filter((event) => (event.rageDelta ?? 0) < 0)).toHaveLength(1)
  expect(casts.filter((event) => (event.mpDelta ?? 0) < 0)).toHaveLength(1)
  expect(effectEvents(report, 'tianxia_wugou').filter((event) => event.statusApplied === '封穴').map((event) => event.targetSlot).sort())
    .toEqual(['ENEMY_LEFT', 'ENEMY_MAIN'])
})

describe('出手速度、行动推进与当前内力', () => {
  const white = 'baituo_zheshan'
  const whitePair = { headId: trialPartId(white, 'HEAD'), armorId: trialPartId(white, 'ARMOR') }
  const damo = 'damo_qibing'
  const damoSix = {
    weaponId: trialPartId(damo, 'WEAPON'), headId: trialPartId(damo, 'HEAD'), armorId: trialPartId(damo, 'ARMOR'),
    wristId: trialPartId(damo, 'WRIST'), beltId: trialPartId(damo, 'BELT'), accId: trialPartId(damo, 'ACC'),
  }
  const changbai = 'changbai_canxian'
  const longwhite = {
    headId: trialPartId(changbai, 'HEAD'), armorId: trialPartId(changbai, 'ARMOR'),
    wristId: trialPartId(changbai, 'WRIST'), beltId: trialPartId(changbai, 'BELT'), ultSkillId: 'yiyang_zhi',
  }
  const firstTarget = (report: BattleReportDTO, round: number) => report.events.find((event) =>
    event.round === round && (event.type === 'SKILL_CAST' || event.type === 'DODGE'),
  )?.targetSlot

  it('白驼两件加 50 速度，轻功和装备速度一起进入历练行动顺序', () => {
    const boss = trialStageOf(14)!.boss
    const options = { enemyMain: { ...boss, mp: 500 }, surviveRounds: 1 }
    expect(firstTarget(fight(whitePair, options), 1)).toBe('ALLY_MAIN')
    const gear = {
      ...whitePair, lightSkillId: 'lingbo_weibu',
      bootsId: trialPartId('pomiao_caomang', 'BOOTS'),
    }
    const withoutLight = computeDerivedStats(player, { ...loadout, ...whitePair, bootsId: gear.bootsId })
    expect(computeDerivedStats(player, { ...loadout, ...gear }).speed).toBeGreaterThan(withoutLight.speed)
    const report = fight(gear, options)
    expect(firstTarget(report, 1)).toBe('ENEMY_MAIN')
    expect(effectEvents(report, white)[0].segments).toContainEqual({ type: 'text', text: ' 试招侠客闪避率 +2 个百分点，出手速度 +50' })
  })

  it.each(['shunxi_qianli', 'tiebai_bow'])('%s 的先手只影响开局，之后恢复按速度排序', (id) => {
    const gear = id === 'shunxi_qianli' ? { lightSkillId: id } : { weaponId: id }
    const enemyMain = { ...enemy, combat: { speed: 180 } }
    const report = fight(gear, { enemyMain })
    expect([firstTarget(report, 1), firstTarget(report, 2)]).toEqual(['ENEMY_MAIN', 'ALLY_MAIN'])
    expect(effectEvents(report, id)).toMatchObject([{ round: 1, actorSlot: 'ALLY_MAIN' }])
  })

  it('大漠六件暴击推进下一次行动，射击按阈值触发且免耗', () => {
    const criticalPlayer = { ...player, stats: { ...player.stats, agi: 63 } }
    const options = { player: criticalPlayer, enemyMain: { ...enemy, hp: 100_000, combat: { speed: 415 } }, surviveRounds: 3 }
    const report = fight(damoSix, { ...options, rng: () => 0.30 })
    expect([1, 2, 3].map((round) => firstTarget(report, round))).toEqual(['ALLY_MAIN', 'ENEMY_MAIN', 'ALLY_MAIN'])
    expect(effectEvents(report, damo).filter((event) => event.type === 'SKILL_CAST')).toEqual([])
    expect(effectEvents(report, damo).some((event) => event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.includes('行动条 +20%'),
    ))).toBe(true)
    const [shot] = effectEvents(fight(damoSix, { ...options, rng: () => 0.299 }), damo)
      .filter((event) => event.type === 'SKILL_CAST')
    expect(shot).toMatchObject({ round: 1, targetSlot: 'ENEMY_MAIN', skillName: '鹰击长空', isUlt: false })
    expect(shot.hpDelta).toBeLessThan(0)
    expect(shot.rageDelta).toBeUndefined()
    expect(shot.mpDelta).toBeUndefined()
    expect(firstTarget(fight({ ...damoSix, accId: null }, options), 2)).toBe('ALLY_MAIN')
  })

  it('长白四件只回复穿戴者，气血吃自愈加成，内力回满时封顶', () => {
    const report = fight(longwhite)
    expect(effectEvents(report, changbai).filter((event) => event.hpDelta)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: 95 },
      { round: 2, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: 95 },
    ])
    expect(report.events.find((event) => event.isUlt)).toMatchObject({ round: 2, mpDelta: -53 })
    expect(effectEvents(report, changbai).filter((event) => event.mpDelta)).toMatchObject([{ round: 2, mpDelta: 11 }])
    const unit = mainUnit(report)
    const { effects } = resolveBattleLoadout({ ...loadout, ...longwhite })
    const events: BattleEventDTO[] = []
    expect(recoverRoundMp(unit, 1, unit.maxMp - 3, effects, 3, events)).toBe(unit.maxMp)
    expect(recoverRoundMp(unit, 0, unit.maxMp - 3, effects, 3, events)).toBe(unit.maxMp - 3)
    expect(events).toMatchObject([{ mpDelta: 3 }])
  })

  it('少室山按实际玩家速度排序，内力的消耗和回复由实际施招者记账', () => {
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id, level: 30, stats: { ...player.stats, con: 350 } },
      loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-speed-mp', [
      member('lead', {}), member('left', longwhite), member('right', { ...whitePair, lightSkillId: 'lingbo_weibu' }),
    ])
    expect(report.events.filter((event) => event.round === 1 && event.targetSlot === 'ENEMY_LEFT' && event.type === 'SKILL_CAST')
      .map((event) => event.actorSlot)).toEqual(['ALLY_RIGHT', 'ALLY_LEFT', 'ALLY_MAIN'])
    expect(report.events.find((event) => event.isUlt && event.actorSlot === 'ALLY_LEFT')).toMatchObject({ round: 3, mpDelta: expect.any(Number) })
    expect(effectEvents(report, changbai).find((event) => event.mpDelta)).toMatchObject({ round: 3, actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_LEFT' })
    expect(report.events.filter((event) => event.mpDelta).every((event) => event.actorSlot === 'ALLY_LEFT')).toBe(true)
  })

  it('灵狐令同时抬高面板与实战闪避上限，其他玩家仍以 42% 封顶', () => {
    const foxId = trialPartId('jiuwei_linghu', 'ACC')
    const gear = { ...whitePair, outerSkillId: 'wuluo_qingyan', lightSkillId: 'lingbo_weibu' }
    const runner = { ...player, stats: { ...player.stats, agi: 22 } }
    const report = fight({ ...gear, accId: foxId }, { player: runner, surviveRounds: 1 })
    expect(report.events.some((event) => event.type === 'DODGE')).toBe(true)
    expect(fight(gear, { player: runner, surviveRounds: 1 }).events.some((event) => event.type === 'DODGE')).toBe(false)
    expect(effectEvents(report, foxId)[0].segments).toContainEqual({ type: 'text', text: ' 试招侠客闪避上限提升至 75%' })
    const highAgi = { ...runner, stats: { ...runner.stats, agi: 600 } }
    expect(computeDerivedStats(highAgi, { ...loadout, ...gear }).dodge).toBe(42)
    expect(computeDerivedStats(highAgi, { ...loadout, ...gear, accId: foxId }).dodge).toBe(75)
  })
})

describe('控制、抗性、驱散和范围出招', () => {
  const bihai = 'bihai_chaosheng'
  const bihaiGear = {
    weaponId: trialPartId(bihai, 'WEAPON'), headId: trialPartId(bihai, 'HEAD'),
    armorId: trialPartId(bihai, 'ARMOR'), wristId: trialPartId(bihai, 'WRIST'),
    beltId: trialPartId(bihai, 'BELT'), accId: trialPartId(bihai, 'ACC'),
  }
  const bone = 'jiuyin_baigu'
  const boneGear = {
    weaponId: trialPartId(bone, 'WEAPON'), headId: trialPartId(bone, 'HEAD'),
    armorId: trialPartId(bone, 'ARMOR'), wristId: trialPartId(bone, 'WRIST'),
    beltId: trialPartId(bone, 'BELT'), accId: trialPartId(bone, 'ACC'),
  }
  const fox = 'jiuwei_linghu'
  const foxGear = {
    weaponId: trialPartId(fox, 'WEAPON'), headId: trialPartId(fox, 'HEAD'),
    armorId: trialPartId(fox, 'ARMOR'), wristId: trialPartId(fox, 'WRIST'),
    beltId: trialPartId(fox, 'BELT'), accId: trialPartId(fox, 'ACC'),
  }
  const applied = (report: BattleReportDTO, status: string) => report.events.filter((event) => event.statusApplied === status)
  const enemyCasts = (report: BattleReportDTO) => report.events.filter((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')

  it('碧海四件在 40% 阈值内封住实际目标的蓄力，回合结束解除', () => {
    const enemyMain = { ...enemy, combat: { charge: { round: 1, name: '蓄力试招', damageMultiplier: 4 } } }
    const gear = { ...bihaiGear, weaponId: null, accId: null }
    const report = fight(gear, { enemyMain, surviveRounds: 1, rng: () => 0.399 })
    expect(applied(report, '封穴')).toMatchObject([{ targetSlot: 'ENEMY_MAIN', statusRounds: 1 }])
    expect(applied(report, '蓄力')).toEqual([])
    expect(enemyCasts(report)).toHaveLength(1)
    expect(report.events).toContainEqual(expect.objectContaining({ targetSlot: 'ENEMY_MAIN', statusRemoved: '封穴' }))
    const failed = fight(gear, { enemyMain, surviveRounds: 1, rng: () => 0.40 })
    expect(applied(failed, '封穴')).toEqual([])
    expect(applied(failed, '蓄力')).toHaveLength(1)
  })

  it('被封穴的玩家照常出招，封穴期压制九阳反伤', () => {
    const enemyMain = { ...enemy, combat: { statusOnHit: { status: 'SEAL' as const, rounds: 1 } } }
    const report = fight({ innerSkillId: 'jiuyang_shengong' }, { enemyMain })
    expect(applied(report, '封穴')[0]).toMatchObject({ round: 1, targetSlot: 'ALLY_MAIN', statusRounds: 1 })
    expect(effectEvents(report, 'jiuyang_shengong')).toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN' }])
    expect(report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')).toHaveLength(2)
  })

  it('促织笼封住首回合蓄力，玩家封招时保留怒气与内力', () => {
    const enemyMain = {
      ...enemy, combat: {
        charge: { round: 1, name: '蓄力试招', damageMultiplier: 4 },
        statusOnHit: { status: 'ULT_LOCK' as const, rounds: 1 },
      },
    }
    const accId = trialPartId('kongming_wantong', 'ACC')
    const report = fight({ accId, ultSkillId: 'yiyang_zhi' }, { enemyMain })
    expect(applied(report, '封招').map((event) => event.targetSlot)).toEqual(['ENEMY_MAIN', 'ALLY_MAIN', 'ALLY_MAIN'])
    expect(applied(report, '蓄力')).toEqual([])
    expect(report.events.filter((event) => event.isUlt || event.mpDelta)).toEqual([])
    expect(report.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST'))
      .toMatchObject({ skillId: 'bare_hands', rageDelta: 0 })
  })

  it('九阴六件绝技绕过普通闪避，盾全挡仍眩晕两次，免控首领照常出手', () => {
    const enemyMain = { ...enemy, combat: { dodge: 100, openingShield: 50_000 } }
    const gear = { ...boneGear, ultSkillId: 'yiyang_zhi' }
    const report = fight(gear, { enemyMain, surviveRounds: 4 })
    expect(report.events.find((event) => event.round === 1 && event.actorSlot === 'ALLY_MAIN' && event.type === 'DODGE'))
      .toMatchObject({ targetSlot: 'ENEMY_MAIN', hpDelta: 0 })
    expect(report.events.find((event) => event.isUlt)).toMatchObject({ round: 2, hitResult: 'HIT', hpDelta: 0 })
    expect(applied(report, '点穴眩晕')).toMatchObject([{ round: 2, statusRounds: 2, targetSlot: 'ENEMY_MAIN' }])
    expect(enemyCasts(report).map((event) => event.round)).toEqual([1, 4])
    const frenzy = fight(gear, { enemyMain: { ...enemy, combat: trialStageOf(30)!.boss.combat }, surviveRounds: 2 })
    expect(applied(frenzy, '点穴眩晕')).toEqual([])
    expect(effectEvents(frenzy, bone).some((event) => event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.includes('抵抗点穴眩晕'),
    ))).toBe(true)
    expect(enemyCasts(frenzy)).toHaveLength(2)
  })

  it('清心菩提子按 15% 阈值抵抗彭连虎，泥鳅功免疫点穴，头巾缩短控制', () => {
    const enemyMain = { ...enemy, combat: trialStageOf(11)!.boss.combat }
    const resist = { accId: trialPartId('fahua_zuyi', 'ACC'), outerSkillId: 'yuenv_jian' }
    const hitRng = (resistRoll: number) => vi.fn().mockReturnValueOnce(0).mockReturnValue(resistRoll)
    expect(applied(fight(resist, { enemyMain, surviveRounds: 1, rng: hitRng(0.149) }), '点穴眩晕')).toEqual([])
    expect(applied(fight(resist, { enemyMain, surviveRounds: 1, rng: hitRng(0.15) }), '点穴眩晕')).toHaveLength(1)
    expect(applied(fight({ lightSkillId: 'niqiu_gong', outerSkillId: 'yuenv_jian' }, { enemyMain, surviveRounds: 1, rng: () => 0 }), '点穴眩晕')).toEqual([])
    const longControl = { ...enemy, combat: { statusOnHit: { status: 'STUN' as const, rounds: 3 } } }
    const headId = trialPartId('kongming_wantong', 'HEAD')
    expect(applied(fight({ headId }, { enemyMain: longControl, surviveRounds: 1 }), '点穴眩晕'))
      .toMatchObject([{ statusRounds: 1, targetSlot: 'ALLY_MAIN' }])
  })

  it('灵狐六件回合初驱散旧控制，命中降低造成落空时不触发闪避收益', () => {
    const enemyMain = { ...enemy, combat: { statusOnHit: { status: 'STUN' as const, rounds: 1 } } }
    const missed = fight(foxGear, { enemyMain, surviveRounds: 1 })
    expect(enemyCasts(missed)).toMatchObject([{ hitResult: 'MISS', hpDelta: 0 }])
    expect(missed.events.some((event) => event.type === 'DODGE')).toBe(false)
    expect(applied(missed, '点穴眩晕')).toEqual([])
    const wearer = { ...player, stats: { ...player.stats, agi: 20 } }
    const cleansed = fight(foxGear, { player: wearer, enemyMain, rng: () => 0.99 })
    expect(applied(cleansed, '点穴眩晕')[0]).toMatchObject({ round: 1, targetSlot: 'ALLY_MAIN' })
    expect(effectEvents(cleansed, fox)).toContainEqual(expect.objectContaining({ round: 2, targetSlot: 'ALLY_MAIN', statusRemoved: '点穴眩晕' }))
    expect(cleansed.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')).toBeDefined()
  })

  it('密宗六件按命中后气血判定免控，气血较低时缩短状态一回合', () => {
    const set = 'xiyu_mizong'
    const gear = {
      weaponId: trialPartId(set, 'WEAPON'), headId: trialPartId(set, 'HEAD'),
      armorId: trialPartId(set, 'ARMOR'), wristId: trialPartId(set, 'WRIST'),
      beltId: trialPartId(set, 'BELT'), accId: trialPartId(set, 'ACC'),
    }
    const { def, maxHp } = computeDerivedStats(player, { ...loadout, ...gear })
    const combat = { statusOnHit: { status: 'STUN' as const, rounds: 3 } }
    const high = fight(gear, { enemyMain: { ...enemy, combat }, surviveRounds: 1 })
    expect(applied(high, '点穴眩晕')).toEqual([])
    expect(high.events.some((event) => event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.includes('西域密宗金刚套装（6件） · 抵抗点穴眩晕'),
    ))).toBe(true)
    const atk = Math.round(maxHp * 0.25 * (def + 495) / 495)
    const low = fight(gear, { enemyMain: { ...enemy, atk, combat }, surviveRounds: 1 })
    expect(applied(low, '点穴眩晕')).toMatchObject([{ targetSlot: 'ALLY_MAIN', statusRounds: 2 }])
  })

  it('荒山迟缓从下一回合影响先后顺序，横练震麻只降低本次攻击者后续攻击', () => {
    const set = 'huangshan_kulou'
    const gear = {
      headId: trialPartId(set, 'HEAD'), armorId: trialPartId(set, 'ARMOR'),
      wristId: trialPartId(set, 'WRIST'), beltId: trialPartId(set, 'BELT'),
    }
    const rng = vi.fn().mockReturnValueOnce(0.349).mockReturnValue(0.35)
    const slowed = fight(gear, { enemyMain: { ...enemy, combat: { speed: 110 } }, surviveRounds: 3, rng })
    const firstActor = (round: number) => slowed.events.find((event) => event.round === round && event.type === 'SKILL_CAST')?.actorSlot
    expect([1, 2, 3].map(firstActor)).toEqual(['ENEMY_MAIN', 'ALLY_MAIN', 'ENEMY_MAIN'])
    expect(applied(slowed, '阴寒迟缓')).toMatchObject([{ round: 1, statusRounds: 1 }])

    const armorSet = 'henglian_tongjia'
    const armor = {
      weaponId: trialPartId(armorSet, 'WEAPON'), headId: trialPartId(armorSet, 'HEAD'),
      armorId: trialPartId(armorSet, 'ARMOR'), wristId: trialPartId(armorSet, 'WRIST'),
      beltId: trialPartId(armorSet, 'BELT'), accId: trialPartId(armorSet, 'ACC'),
    }
    const stats = computeDerivedStats(player, { ...loadout, ...armor })
    const base = computeDerivedStats(player, { ...loadout, ...armor, accId: null })
    expect(Math.abs(stats.def - Math.round(base.def * 1.25))).toBeLessThanOrEqual(1)
    const weakened = fight(armor, { rng: () => 0.299 })
    expect(enemyCasts(weakened).map((event) => event.hpDelta)).toEqual(
      [250, 200].map((atk) => -Math.round(incomingDamage(atk, 1, stats.def, player.level) * 0.9)),
    )
    expect(applied(fight(armor, { rng: () => 0.30 }), '攻击降低')).toEqual([])
  })

  it('碧海潮生曲命中全体时只消耗一次资源，套装海啸绕盾并按实际内力与气血记账', () => {
    const options = {
      enemyGuards: [enemy, enemy], enemyMain: { ...enemy, combat: { openingShield: 40_000 } }, rng: () => 0.99,
    }
    const report = fight({ ...bihaiGear, ultSkillId: 'bihai_chaosheng' }, options)
    const targets = ['ENEMY_LEFT', 'ENEMY_MAIN', 'ENEMY_RIGHT']
    expect(report.events.filter((event) => event.skillId === 'bihai_chaosheng').map((event) => event.targetSlot).sort()).toEqual(targets)
    expect(report.events.filter((event) => event.isUlt && event.mpDelta)).toHaveLength(1)
    expect(applied(report, '心神混乱')).toHaveLength(3)
    const hitAmount = Math.round(mainUnit(report).maxMp * 0.15)
    const area = effectEvents(report, bihai).filter((event) => event.hpDelta)
    expect(area.map((event) => event.targetSlot).sort()).toEqual(targets)
    expect(area.every((event) => event.hpDelta === -hitAmount && !event.shieldAbsorbed)).toBe(true)

    const single = fight({ ...bihaiGear, ultSkillId: 'yiyang_zhi' }, options)
    const { def } = computeDerivedStats(player, { ...loadout, ...bihaiGear })
    expect(enemyCasts(single)[1]).toMatchObject({ round: 2, hpDelta: -incomingDamage(175, 1, def, player.level) })
  })

  it('少室山的眩晕来自实际穿戴者，只跳过被命中首领的行动', () => {
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id, stats: { ...player.stats, con: 200 } },
      loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-control', [
      member('lead', {}), member('left', { ...boneGear, ultSkillId: 'yiyang_zhi' }), member('right', {}),
    ], () => 0.99)
    const stun = applied(report, '点穴眩晕')[0]
    expect(stun).toMatchObject({ round: 3, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', statusRounds: 2 })
    expect(report.events.some((event) => event.round === 3 && event.type === 'SKILL_CAST' && event.actorSlot === stun.targetSlot)).toBe(false)
    expect(report.events.some((event) => event.round === 3 && event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_RIGHT')).toBe(true)
  })

  it('历练黄药师第三回合全队乱心，周伯通护体化解箫声', () => {
    const boss = trialStageOf(21)!.boss
    const sturdy = { ...player, level: 30, stats: { ...player.stats, con: 150 } }
    const options = { player: sturdy, enemyMain: { ...boss, hp: 100_000, mp: 500 }, surviveRounds: 4 }
    const report = fight({ leftCompanionId: 'guojing', rightCompanionId: 'huangrong' }, options)
    expect(applied(report, '心神混乱').map((event) => event.targetSlot).sort()).toEqual(['ALLY_LEFT', 'ALLY_MAIN', 'ALLY_RIGHT'])
    expect(report.events.some((event) => event.round === 4 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')).toBe(false)
    const guarded = fight({ leftCompanionId: 'zhoubotong', rightCompanionId: 'yinggu' }, options)
    expect(applied(guarded, '心神混乱')).toEqual([])
    expect(effectEvents(guarded, 'zhoubotong').find((event) => event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.includes('空明拳护住全队')))).toMatchObject({ round: 3, actorSlot: 'ALLY_LEFT' })
    const longer = fight({}, { ...options, surviveRounds: 12 })
    expect(applied(longer, '心神混乱').map((event) => event.round)).toEqual([3, 6, 9])
  })
})

describe('同一追加出手机制接入武学和装备', () => {
  it.each([['shuangshou_hubo', 0.25], ['lianzhu_shenjian', 0.30]])('%s 追加同一招式且只判定一次', (id, chance) => {
    const rng = vi.fn(() => chance - 0.001)
    const report = fight({ outerSkillId: id }, { rng, surviveRounds: 1 })
    const regular = report.events.find((event) => event.skillId === id)!
    const extra = effectEvents(report, id)
    expect(rng).toHaveBeenCalledTimes(1)
    expect(extra).toMatchObject([{ round: 1, actorSlot: 'ALLY_MAIN', skillId: id, hpDelta: regular.hpDelta }])
    expect(extra[0].rageDelta).toBeUndefined()
    expect(effectEvents(fight({ outerSkillId: id }, { rng: () => chance, surviveRounds: 1 }), id)).toEqual([])
  })

  it('回马破甲只跟随常规外功，以 150% 攻击力造成真伤', () => {
    const wielder = { ...player, stats: { ...player.stats, str: 30 } }
    const patch = { weaponId: 'yangjia_spear', ultSkillId: 'yiyang_zhi' }
    const attack = computeDerivedStats(wielder, { ...loadout, ...patch }).atk
    const damage = Math.round(attack * 1.5)
    const target = { ...enemy, combat: { def: 400, openingShield: 5000 } }
    const report = fight(patch, { player: wielder, enemyMain: target, rng: () => 0.299 })
    const extra = effectEvents(report, 'yangjia_spear')
    expect(extra).toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN', skillName: '回马枪', hpDelta: -damage }])
    expect(extra[0].segments).toContainEqual({ type: 'damage', value: damage, isCrit: false, category: 'true' })
    expect(extra[0].shieldAbsorbed).toBeUndefined()
    expect(extra[0].skillId).toBeUndefined()
    expect(extra[0].rageDelta).toBeUndefined()
    expect(report.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN')?.skillId).toBe('yiyang_zhi')
    expect(effectEvents(fight(patch, { player: wielder, enemyMain: target, rng: () => 0.30 }), 'yangjia_spear')).toEqual([])
  })

  it('少室山复用追加出手，读取各玩家自己的武学重数与兵刃', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 45, con: 75 } }
    const first = { ...loadout, outerSkillId: 'shuangshou_hubo' }
    const second = { ...loadout, weaponId: 'yangjia_spear' }
    const report = simulateShaoshiRaid('raid-follow-ups', [
      { player: { ...character, id: 'a' }, loadout: first, learnedSkills: { shuangshou_hubo: 3 } },
      { player: { ...character, id: 'b' }, loadout: second, learnedSkills: {} },
      { player: { ...character, id: 'c' }, loadout, learnedSkills: {} },
    ], () => 0)
    const original = report.events.find((event) => event.round === 1 && event.skillId === 'shuangshou_hubo' && !event.effectSourceId)!
    expect(effectEvents(report, 'shuangshou_hubo')[0]).toMatchObject({
      round: 1, actorSlot: 'ALLY_MAIN', targetSlot: original.targetSlot, hpDelta: original.hpDelta,
    })
    const damage = Math.round(computeDerivedStats(character, second).atk * 1.5)
    expect(effectEvents(report, 'yangjia_spear')[0]).toMatchObject({ round: 1, actorSlot: 'ALLY_LEFT', hpDelta: -damage })
    expect(report.events.filter((event) => event.effectSourceId).every((event) => event.rageDelta === undefined)).toBe(true)
  })
})

describe('空明追击、大漠穿透与九阴吸血', () => {
  const kongming = 'kongming_wantong'
  const damo = 'damo_qibing'
  const jiuyin = 'jiuyin_baigu'
  const kongmingGear = {
    headId: trialPartId(kongming, 'HEAD'), armorId: trialPartId(kongming, 'ARMOR'),
    wristId: trialPartId(kongming, 'WRIST'), accId: trialPartId(kongming, 'ACC'),
  }
  const damoGear = {
    headId: trialPartId(damo, 'HEAD'), armorId: trialPartId(damo, 'ARMOR'),
    wristId: trialPartId(damo, 'WRIST'), accId: trialPartId(damo, 'ACC'),
  }
  const jiuyinGear = {
    weaponId: trialPartId(jiuyin, 'WEAPON'), headId: trialPartId(jiuyin, 'HEAD'),
    wristId: trialPartId(jiuyin, 'WRIST'), accId: trialPartId(jiuyin, 'ACC'),
  }
  const mainCasts = (report: BattleReportDTO) => report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
  const followUps = (report: BattleReportDTO) => effectEvents(report, kongming).filter((event) => event.type === 'SKILL_CAST')
  const lifesteals = (report: BattleReportDTO) => effectEvents(report, jiuyin).filter((event) => (event.hpDelta ?? 0) > 0)
  const damoTag = (defense: number, extra: number) => ({
    type: 'tag', text: `大漠弯弓铁骑套装（4件） · 穿透 ${defense} 点防御 · 增伤 +${extra}`, tone: 'gold',
  })

  it('空明四件在常规外功后只判一次 45%，绝技和三件套不触发', () => {
    const gear = { ...kongmingGear, ultSkillId: 'yiyang_zhi' }
    const rng = vi.fn(() => 0.4499)
    const report = fight(gear, { rng })
    expect(rng).toHaveBeenCalledTimes(2)
    expect(mainCasts(report)).toMatchObject([
      { round: 1, skillId: 'bare_hands', hpDelta: -272 },
      { round: 1, skillId: 'bare_hands', hpDelta: -340, effectSourceId: kongming },
      { round: 2, skillId: 'yiyang_zhi' },
    ])
    const [followUp] = followUps(report)
    expect(followUp.rageDelta).toBeUndefined()
    expect(followUp.segments).toContainEqual({ type: 'tag', text: '空明顽童玄素套装（4件） · 追加出手', tone: 'purple' })
    expect(followUps(fight(gear, { rng: () => 0.45 }))).toEqual([])
    expect(followUps(fight({ ...gear, accId: null }, { rng: () => 0.20 }))).toEqual([])
  })

  it('空明追击重选存活目标，并按护盾与剩余气血记录伤害', () => {
    const retargeted = fight(kongmingGear, { rng: () => 0.20, surviveRounds: 1, enemyGuards: [{ ...enemy, name: '护卫', hp: 1 }] })
    expect(mainCasts(retargeted).map((event) => event.targetSlot)).toEqual(['ENEMY_LEFT', 'ENEMY_MAIN'])

    const finishing = fight(kongmingGear, { rng: () => 0.20, surviveRounds: 1, enemyMain: { ...enemy, hp: 312 } })
    const [followUp] = followUps(finishing)
    expect(followUp).toMatchObject({ hpDelta: -40, targetSlot: 'ENEMY_MAIN' })
    expect(followUp.segments).toContainEqual({ type: 'damage', value: 40, isCrit: false, category: 'phys' })
    expect(finishing.winner).toBe('ALLY')

    const shielded = fight(kongmingGear, {
      rng: () => 0.20, surviveRounds: 1, enemyMain: { ...enemy, combat: { openingShield: 300 } },
    })
    expect(followUps(shielded)).toMatchObject([{ hpDelta: -312, shieldAbsorbed: 28, statusRemoved: '护盾' }])
  })

  it('大漠四件的 15% 穿透先于护盾，和武学穿透取较高值', () => {
    const gear = { ...damoGear, ultSkillId: 'yiyang_zhi' }
    const options = { enemyMain: { ...enemy, combat: { def: 400, openingShield: 100 } }, surviveRounds: 1 }
    const [withSet] = mainCasts(fight(gear, options))
    const [threePieces] = mainCasts(fight({ ...gear, accId: null }, options))
    expect(threePieces).toMatchObject({ hpDelta: 0, shieldAbsorbed: 96 })
    expect(withSet).toMatchObject({ hpDelta: -3, shieldAbsorbed: 100, statusRemoved: '护盾' })
    expect(withSet.segments).toContainEqual(damoTag(60, 3))

    const [strongerSkill] = mainCasts(fight({ ...damoGear, outerSkillId: 'xianglong_18' }, options))
    expect(strongerSkill).toMatchObject({ hpDelta: -146, shieldAbsorbed: 100 })
    expect(strongerSkill.segments.filter((segment) => segment.type === 'tag' && segment.text.includes('穿透'))).toEqual([
      { type: 'tag', text: '降龙十八掌 · 穿透 140 点防御 · 增伤 +39', tone: 'gold' },
    ])
    const [noDefense] = mainCasts(fight(damoGear, { surviveRounds: 1 }))
    expect(noDefense.hpDelta).toBe(-174)
    expect(noDefense.segments.some((segment) => segment.type === 'tag' && segment.text.includes('穿透'))).toBe(false)
  })

  it('大漠套装穿透只作用于穿戴者的常规外功', () => {
    const report = fight({ ...damoGear, outerSkillId: 'shuangshou_hubo', ultSkillId: 'luanpi_chai', leftCompanionId: 'guojing' }, {
      rng: () => 0, enemyMain: { ...enemy, combat: { def: 400 } },
    })
    expect(mainCasts(report)).toMatchObject([
      { round: 1, skillId: 'shuangshou_hubo', hpDelta: -178 },
      { round: 1, effectSourceId: 'shuangshou_hubo', hpDelta: -166 },
      { round: 2, skillId: 'luanpi_chai' },
    ])
    expect(report.events.filter((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('大漠弯弓铁骑') && segment.text.includes('穿透'))))
      .toEqual([mainCasts(report)[0]])
  })

  it('九阴四件按盾后实扣气血吸血，护盾全挡时没有回血', () => {
    const report = fight(jiuyinGear, { rng: () => 0.99, enemyMain: { ...enemy, combat: { openingShield: 852 } } })
    expect(mainCasts(report)).toMatchObject([
      { round: 1, hpDelta: 0, shieldAbsorbed: 652 },
      { round: 2, hpDelta: -471, shieldAbsorbed: 200 },
    ])
    expect(lifesteals(report)).toMatchObject([{ round: 2, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: 94 }])
    expect(lifesteals(report)[0].segments).toContainEqual({ type: 'damage', value: 94, category: 'heal' })
    const blocked = fight(jiuyinGear, { enemyMain: { ...enemy, combat: { openingShield: 5000 } } })
    expect(mainCasts(blocked)[1].hpDelta).toBe(0)
    expect(lifesteals(blocked)).toEqual([])
  })

  it('九阴吸血以击杀前剩余气血为基数，实际回复以缺失气血封顶', () => {
    const finishing = fight(jiuyinGear, { rng: () => 0.99, enemyMain: { ...enemy, hp: 811 } })
    expect(mainCasts(finishing)[0].hpDelta).toBe(-652)
    expect(lifesteals(finishing)).toMatchObject([{ round: 2, hpDelta: 9 }])
    expect(finishing.winner).toBe('ALLY')

    const nearlyFull = fight(jiuyinGear, { enemyMain: { ...enemy, atk: 1 } })
    expect(mainCasts(nearlyFull)[1].hpDelta).toBe(-671)
    expect(lifesteals(nearlyFull)).toMatchObject([{ round: 2, hpDelta: 70 }])
    expect(lifesteals(fight({ ...jiuyinGear, accId: null }))).toEqual([])
  })

  it('九阴吸血逐次结算追加外功，绝技和流血各走原有伤害结算', () => {
    const chained = fight({ ...jiuyinGear, outerSkillId: 'shuangshou_hubo' }, { rng: () => 0, enemyMain: { ...enemy, atk: 1500 } })
    expect(lifesteals(chained)).toMatchObject([{ round: 2, hpDelta: 231 }, { round: 2, hpDelta: 231 }])
    const secondHealIndex = chained.events.indexOf(lifesteals(chained)[1])
    expect(chained.events.slice(0, secondHealIndex).filter((event) => event.hpDelta).slice(-2)).toMatchObject([
      { effectSourceId: 'shuangshou_hubo' }, { effectSourceId: jiuyinGear.wristId, hpDelta: -204 },
    ])

    const mixed = fight({ ...jiuyinGear, outerSkillId: 'jiuyin_baiguzhua', ultSkillId: 'yiyang_zhi' })
    expect(mainCasts(mixed)[1]).toMatchObject({ round: 2, skillId: 'yiyang_zhi' })
    expect(mixed.events.some((event) => event.type === 'DOT_TICK')).toBe(true)
    expect(lifesteals(mixed)).toEqual([])
  })

  it('少室山按三位玩家各自的配装结算追击、穿透和吸血', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 35, con: 100 } }
    const fighter = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...character, id }, loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-outer-set-effects', [
      fighter('a', kongmingGear), fighter('b', damoGear), fighter('c', jiuyinGear),
    ], () => 0.20)
    expect(followUps(report)[0]).toMatchObject({ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', hpDelta: -2299 })
    const penetration = report.events.find((event) => (event.hpDelta ?? 0) < 0 &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('大漠弯弓铁骑套装（4件） · 穿透')))!
    expect(penetration).toMatchObject({ round: 4, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', hpDelta: -817 })
    expect(penetration.segments).toContainEqual(damoTag(36, 14))
    expect(lifesteals(report)[0]).toMatchObject({ round: 2, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', hpDelta: 844 })
    expect(lifesteals(report).every((event) => event.actorSlot === 'ALLY_RIGHT' && event.targetSlot === 'ALLY_RIGHT')).toBe(true)
  })

  it('历练正常配装在物品详情和回放中显示大漠穿透', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats)
      store.trial.maxStageId = 7
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      store.updateLoadout(loadout)
      for (const id of Object.values(damoGear)) {
        store.ownedItemIds.push(id)
        store.equipItem(id)
      }
      store.inspectById('item', damoGear.headId)
      expect(store.inspectModal?.extra).toContain('常规外功无视目标 15% 护甲，与武学自带穿透取较高值')
      store.challengeTrialStage(7)
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual(damoTag(21, 5))
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('毒层、装备触发、低血保命与资源', () => {
  const sixSlots = ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS'] as const
  const venomSet = 'baituo_yushe'
  const darts = 'qianshou_panguan'
  const river = 'huanghe_nilang'
  const shieldSet = 'fahua_zuyi'
  const jiangnan = 'jiangnan_qiguai'

  it('雄黄令逐层加毒，蛇骨杖增毒伤，第三层按已损气血引爆并清层', () => {
    const gear = equipped(venomSet, ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'ACC'])
    const enemyMain = { ...enemy, combat: { def: 400, openingShield: 50_000 } }
    const report = fight(gear, { enemyMain, surviveRounds: 4 })
    const venom = effectEvents(report, gear.accId!).filter((event) => event.statusApplied === '剧毒')
    expect(venom.map((event) => event.statusStacks)).toEqual([1, 2, 3, 1])
    expect(effectEvents(report, gear.accId!).filter((event) => event.type === 'DOT_TICK').map((event) => [event.round, event.hpDelta]))
      .toEqual([[1, -1080], [2, -2160], [4, -1080]])
    const burst = effectEvents(report, venomSet).find((event) => event.hpDelta)!
    expect(burst).toMatchObject({ round: 3, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -810 })
    expect(burst.segments).toContainEqual({ type: 'damage', value: 810, category: 'true' })
    expect(burst.shieldAbsorbed).toBeUndefined()
    expect(effectEvents(report, venomSet)).toContainEqual(expect.objectContaining({ round: 3, statusRemoved: '剧毒', statusStacks: 0 }))
    expect(effectEvents(fight({ ...gear, beltId: null }, { enemyMain, surviveRounds: 3 }), venomSet)
      .some((event) => event.statusRemoved === '剧毒')).toBe(false)
  })

  it('实际致死时把剩余重伤和针毒转给每个存活敌人，仍可消耗一次免死', () => {
    const gear = { ...equipped(venomSet, ['WEAPON', 'HEAD', 'WRIST', 'BELT']), accId: 'jiuwei_fox' }
    const { maxHp, def } = computeDerivedStats(player, { ...loadout, ...gear })
    const atk = Math.round(maxHp * 0.63 * (def + 495) / 495)
    const enemyMain = {
      ...enemy, hp: 100_000, atk,
      combat: {
        speed: 1,
        statusOnHit: { status: 'HEAL_DOWN' as const, rounds: 3, percent: 50 },
        periodicOnHit: { status: 'dartPoison' as const, rounds: 3, attackPercent: 6 },
      },
    }
    const report = fight(gear, { enemyMain, enemyGuards: [{ ...enemy, hp: 100_000 }, { ...enemy, hp: 100_000 }] })
    expect(effectEvents(report, 'jiuwei_fox').filter((event) => event.hpDelta)).toMatchObject([{ round: 2, hpDelta: 1930 }])
    const transferred = effectEvents(report, venomSet)
    expect(transferred.filter((event) => event.statusRemoved).map((event) => [event.targetSlot, event.statusRemoved]))
      .toEqual([['ALLY_MAIN', '重伤减疗'], ['ALLY_MAIN', '暗器针毒']])
    for (const statusApplied of ['重伤减疗', '暗器针毒']) {
      expect(transferred.filter((event) => event.statusApplied === statusApplied)).toMatchObject(
        ['ENEMY_LEFT', 'ENEMY_MAIN', 'ENEMY_RIGHT'].map((targetSlot) => ({ round: 2, actorSlot: 'ALLY_MAIN', targetSlot, statusRounds: 2 })),
      )
    }
    expect(transferred.filter((event) => event.type === 'DOT_TICK').map((event) => event.hpDelta)).toEqual([-294, -294, -294])
  })

  it('阴陵客的骨毒在友方实际扣血，吐纳免疫，密宗套缩短持续时间', () => {
    const boss = trialStageOf(6)!.boss
    const enemyMain = { ...boss, hp: 100_000, mp: 500 }
    const ticks = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')
    const raw = Math.round(boss.atk * 0.12)
    expect(ticks(fight({}, { enemyMain }))).toMatchObject([{ hpDelta: -raw, statusRounds: 1 }, { hpDelta: -raw, statusRounds: 1 }])
    const immune = fight({ innerSkillId: 'quanzhen_tuna' }, { enemyMain })
    expect(ticks(immune)).toHaveLength(0)
    expect(immune.events.flatMap((event) => event.segments)).toContainEqual({ type: 'tag', text: '全真吐纳功 · 抵抗阴寒骨毒', tone: 'jade' })
    const short = fight(equipped('xiyu_mizong', sixSlots), { enemyMain, surviveRounds: 1 })
    expect(ticks(short)).toMatchObject([{ hpDelta: -Math.round(raw * 0.75), statusRounds: 0, statusRemoved: '阴寒骨毒' }])
  })

  it('暗器毒刺在常规外功后单独出手，命中施加按攻击力结算的针毒', () => {
    const gear = equipped(darts, ['HEAD', 'ARMOR', 'WRIST', 'BELT'])
    const report = fight(gear, { rng: () => 0.4999, surviveRounds: 1 })
    const stats = computeDerivedStats(player, { ...loadout, ...gear })
    const dartAttack = Math.round(stats.atk * 1.15)
    const damage = strikeDamage(dartAttack, 0.8, 1, innerPressure(stats.maxMp, enemy.mp), false, 1)
    const events = effectEvents(report, darts)
    expect(events.find((event) => event.type === 'SKILL_CAST')).toMatchObject({ skillName: '暗器毒刺', hpDelta: -damage })
    expect(events.find((event) => event.statusApplied)).toMatchObject({ statusApplied: '暗器针毒', statusRounds: 2 })
    expect(events.find((event) => event.type === 'DOT_TICK')).toMatchObject({ hpDelta: -Math.round(dartAttack * 0.12), statusRounds: 1 })
    expect(effectEvents(fight(gear, { rng: () => 0.50, surviveRounds: 1 }), darts).some((event) => event.type === 'SKILL_CAST')).toBe(false)
    const spring = { ...equipped(darts, ['HEAD', 'ARMOR', 'BELT', 'ACC']), wristId: trialPartId('jiamian_piaoping', 'WRIST') }
    expect(effectEvents(fight(spring, { rng: () => 0.64, surviveRounds: 1 }), darts).some((event) => event.skillName === '暗器毒刺')).toBe(true)
    expect(effectEvents(fight(spring, { rng: () => 0.65, surviveRounds: 1 }), darts).some((event) => event.skillName === '暗器毒刺')).toBe(false)
  })

  it('天罗地网只对实际闪避的敌人反打，按其防御和护盾扣血', () => {
    const gear = equipped(darts, sixSlots)
    const enemyMain = { ...enemy, combat: { dodge: 90, def: 400, openingShield: 60 } }
    const wielder = { ...player, stats: { ...player.stats, agi: 4 } }
    const report = fight(gear, { player: wielder, enemyMain, rng: () => 0.99, surviveRounds: 1 })
    const dodge = report.events.find((event) => event.type === 'DODGE')!
    expect(dodge).toMatchObject({ actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hitResult: 'DODGE' })
    const atk = computeDerivedStats(wielder, { ...loadout, ...gear }).atk
    const amount = Math.round(damageAfterDefense(Math.round(atk * 1.15 * 1.2), 400, player.level))
    const counter = effectEvents(report, darts).find((event) => event.targetSlot === 'ENEMY_MAIN')!
    expect(counter).toMatchObject({ hpDelta: 60 - amount, shieldAbsorbed: 60, statusRemoved: '护盾' })
    expect(counter.segments).toContainEqual({ type: 'damage', value: amount - 60, category: 'phys' })
    expect(report.events.indexOf(dodge)).toBeLessThan(report.events.indexOf(counter))
  })

  it('翻江倒海判一次概率，对所有存活目标分别结算防御和护盾', () => {
    const gear = { ...equipped(river, sixSlots), ultSkillId: 'yiyang_zhi' }
    const options = {
      enemyGuards: [{ ...enemy, name: '左卫' }, { ...enemy, name: '右卫', combat: { def: 400, openingShield: 60 } }],
      surviveRounds: 2,
    }
    const waves = (report: BattleReportDTO) => effectEvents(report, river).filter((event) =>
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('翻江倒海')))
    const report = fight(gear, { ...options, rng: () => 0.2999 })
    const raw = Math.round(computeDerivedStats(player, { ...loadout, ...gear }).atk * 0.8)
    expect(waves(report)).toMatchObject([
      { round: 1, targetSlot: 'ENEMY_LEFT', hpDelta: -raw },
      { round: 1, targetSlot: 'ENEMY_MAIN', hpDelta: -raw },
      { round: 1, targetSlot: 'ENEMY_RIGHT', hpDelta: 60 - Math.round(damageAfterDefense(raw, 400, player.level)), shieldAbsorbed: 60 },
    ])
    expect(report.events.find((event) => event.isUlt)).toMatchObject({ round: 2 })
    expect(waves(fight(gear, { ...options, rng: () => 0.30 }))).toHaveLength(0)
  })

  it('灵蛇诡道将本次招式转成实际真伤，保留目标护盾且绕过招架', () => {
    const gear = equipped('baituo_zheshan', sixSlots)
    const target = { ...enemy, combat: { def: 400, openingShield: 5000, parry: 100 } }
    const converted = mainCast(fight(gear, { enemyMain: target, rng: () => 0.3499, surviveRounds: 1 }))
    const clear = mainCast(fight(gear, { rng: () => 0.35, surviveRounds: 1 }))
    expect(converted).toMatchObject({ hpDelta: clear.hpDelta, hitResult: 'HIT' })
    expect(converted.shieldAbsorbed).toBeUndefined()
    expect(converted.segments).toContainEqual({ type: 'damage', value: -clear.hpDelta!, isCrit: false, category: 'true' })
    expect(mainCast(fight(gear, { enemyMain: target, rng: () => 0.35, surviveRounds: 1 })))
      .toMatchObject({ hpDelta: 0, hitResult: 'PARRY' })
  })

  it('法华气血跌破三成时立即获得 15% 气血护盾，两回合后移除剩余护盾', () => {
    const gear = equipped(shieldSet, sixSlots)
    const { def, maxHp } = computeDerivedStats(player, { ...loadout, ...gear })
    const raw = Math.round((Math.floor(maxHp * 0.70) + 1) * (def + 495) / 495)
    const report = fight(gear, { enemyMain: { ...enemy, atk: raw, combat: { charge: { round: 2, name: '蓄力', damageMultiplier: 1 } } } })
    const points = Math.round(maxHp * 0.15)
    expect(effectEvents(report, shieldSet).filter((event) => event.shieldDelta)).toMatchObject([
      { round: 1, targetSlot: 'ALLY_MAIN', shieldDelta: points, statusApplied: '护盾' },
      { round: 2, targetSlot: 'ALLY_MAIN', shieldDelta: -points, statusRemoved: '护盾' },
    ])
  })

  it('义薄云天保留盾全挡时的次数，同回合连续致死只消耗一次，少室山按实际受击者记录', () => {
    const gear = equipped(jiangnan, sixSlots)
    const unit = mainUnit(fight(gear, { surviveRounds: 1 }))
    const effects = resolveBattleLoadout({ ...loadout, ...gear }).effects
    const saves = lethalSavesFrom([...effects, { kind: 'FIRST_LETHAL_SAVE', sourceId: 'revive', sourceName: '复活测试', revive: true }])
    const fighter = { unit, shield: 50 }
    const attacker: EnemyBattleState = { unit: { ...unit, slot: 'ENEMY_MAIN', isPlayer: false }, atk: 250, shield: 0 }
    const contact = { source: { sourceId: 'enemy', sourceName: '敌招' }, attacker, attackerHp: 5000, damage: 50, round: 1 }
    const events: BattleEventDTO[] = []
    const receive = (hp: number, round = 1) => applyDirectedDamage({ fighter, hp, defense: 0, effects, saves }, { ...contact, round }, events)
    expect(receive(50).hp).toBe(50)
    expect(saves).toHaveLength(2)
    expect(receive(50).hp).toBe(1)
    expect(receive(1).hp).toBe(1)
    expect(saves).toHaveLength(1)
    expect(events.filter((event) => event.statusApplied === '不死意志')).toHaveLength(1)
    endStatusRound(fighter, 1, events)
    expect(receive(1, 2).hp).toBe(unit.maxHp)

    const member = (id: string, patch: Partial<LoadoutPresetDTO> = {}) =>
      ({ player: { ...player, id }, loadout: { ...loadout, ...patch }, learnedSkills: {} })
    const raid = simulateShaoshiRaid('raid-jiangnan-guard', [member('a'), member('b'), member('c', gear)], () => 0.99)
    expect(raid.events.filter((event) => event.statusApplied === '不死意志')).toMatchObject([
      { round: 2, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', statusRounds: 1 },
    ])
  })

  it('义薄云天只加实际伙伴的合击伤害', () => {
    const gear = { ...equipped(jiangnan, sixSlots), leftCompanionId: 'luchengfeng' }
    const assist = (report: BattleReportDTO) => report.events.find((event) => event.type === 'ASSIST_ATTACK')!
    const normal = fight({ ...gear, bootsId: null }, { surviveRounds: 1 })
    const bonded = fight(gear, { surviveRounds: 1 })
    expect(mainCast(bonded).hpDelta).toBe(mainCast(normal).hpDelta)
    expect(assist(bonded)).toMatchObject({ actorSlot: 'ALLY_LEFT', hpDelta: -Math.round(-assist(normal).hpDelta! * 1.25) })
  })

  it('金国四件按实际怒气扣加，推迟完颜康的白骨爪', () => {
    const set = 'jinwang_fuxiu'
    const boss = trialStageOf(9)!.boss
    const gear = equipped(set, ['HEAD', 'ARMOR', 'BELT', 'ACC'])
    const options = {
      player: { ...player, stats: { ...player.stats, con: 160, agi: 75 } },
      enemyMain: { ...boss, hp: 100_000, mp: 500, atk: 250 }, surviveRounds: 4,
    }
    const report = fight(gear, options)
    const moves = (battle: BattleReportDTO) => battle.events.filter((event) => event.actorSlot === 'ENEMY_MAIN' && event.rageDelta === -85)
    expect(moves(fight({ ...gear, accId: null }, options))).toMatchObject([{ round: 3 }])
    expect(moves(report)).toMatchObject([{ round: 4 }])
    expect(effectEvents(report, set).filter((event) => event.rageDelta)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', rageTargetSlot: 'ENEMY_MAIN', rageDelta: -15 },
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', rageDelta: 15 },
    ])
  })

  it('完颜康满怒后撕盾并造成流血，太极实际招架会反拧降攻', () => {
    const boss = trialStageOf(9)!.boss
    const gear = { ...equipped('quanzhen_beidou', ['WEAPON', 'HEAD', 'ARMOR', 'BELT']), stance: 'TAICHI' as const }
    const report = fight(gear, {
      player: { ...player, stats: { ...player.stats, con: 160, intStat: 41 } },
      enemyMain: { ...boss, hp: 100_000, mp: 500, atk: 250 }, surviveRounds: 3,
    })
    const claw = report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.skillId === 'jiuyin_baiguzhua')!
    expect(claw).toMatchObject({ round: 3, isUlt: true, hitResult: 'PARRY', hpDelta: 0 })
    expect(claw.shieldDelta).toBe(-2 * claw.shieldAbsorbed!)
    expect(report.events.find((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')).toMatchObject({ round: 3, hpDelta: -50 })
    expect(effectEvents(report, 'taichi_counter')).toMatchObject([{ targetSlot: 'ENEMY_MAIN', statusApplied: '攻击降低', statusRounds: 1 }])
  })

  it('金国六件只给绝技增伤，金丝格挡按 20% 判定并在护盾前减半', () => {
    const gear = { ...equipped('jinwang_fuxiu', sixSlots), ultSkillId: 'yiyang_zhi' }
    const unblocked = fight(gear, { rng: () => 0.20 })
    const blocked = fight(gear, { rng: () => 0.1999 })
    const firstEnemyHit = (battle: BattleReportDTO) => battle.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    const damage = -firstEnemyHit(unblocked).hpDelta!
    expect(firstEnemyHit(blocked).hpDelta).toBe(-Math.round(damage / 2))
    expect(firstEnemyHit(blocked).segments).toContainEqual({
      type: 'tag', text: `织金团龙云锦袍 · 金丝卸力 · 盾前减伤 ${damage - Math.round(damage / 2)}`, tone: 'jade',
    })
    const baseline = fight({ ...gear, armorId: null }, { rng: () => 0.20 })
    const ult = (battle: BattleReportDTO) => battle.events.find((event) => event.isUlt && event.actorSlot === 'ALLY_MAIN')!
    expect(ult(unblocked).hpDelta).toBe(-Math.round(-ult(baseline).hpDelta! * 1.3))
    expect(mainCast(unblocked).hpDelta).toBe(mainCast(baseline).hpDelta)
  })

  it('受暴减伤只降低真实暴击，密宗反弹按本次攻击者的攻击力结算', () => {
    const set = 'xiyu_mizong'
    const gear = { ...equipped(set, ['ARMOR', 'WRIST', 'BELT', 'BOOTS']), headId: trialPartId('henglian_tongjia', 'HEAD') }
    const enemyMain = { ...enemy, combat: { crit: 100, openingShield: 5000 } }
    const report = fight(gear, { enemyMain, surviveRounds: 1 })
    const def = computeDerivedStats(player, { ...loadout, ...gear }).def
    const attack = report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    expect(attack).toMatchObject({ hitResult: 'CRIT', hpDelta: -Math.round(incomingDamage(250, 1.55, def, player.level) * 0.82) })
    expect(effectEvents(report, set).filter((event) => event.hpDelta)).toMatchObject([
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -63 },
    ])
    expect(effectEvents(fight(gear, { surviveRounds: 1 }), set).some((event) => event.hpDelta)).toBe(false)
  })

  it('太湖六件加快怒气积攒，按盾后实扣气血回内并以缺失内力封顶', () => {
    const set = 'taihu_shuizhai'
    const gear = { ...equipped(set, sixSlots), ultSkillId: 'yiyang_zhi' }
    const report = fight(gear, { enemyMain: { ...enemy, atk: 1000 }, surviveRounds: 2 })
    expect(mainCast(report).rageDelta).toBe(46)
    const ult = report.events.find((event) => event.isUlt)!
    const hit = report.events.find((event) => event.round === 2 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    const restored = Math.min(-ult.mpDelta!, Math.round(-hit.hpDelta! * 0.20))
    expect(restored).toBeGreaterThan(0)
    expect(effectEvents(report, set).filter((event) => event.mpDelta)).toMatchObject([{ round: 2, actorSlot: 'ALLY_MAIN', mpDelta: restored }])
  })

  it('蛤蟆四件储存盾后外功伤害并在下次绝技时返还一次', () => {
    const set = 'hama_nimai'
    const gear = { ...equipped(set, ['HEAD', 'ARMOR', 'WRIST', 'BELT']), ultSkillId: 'yiyang_zhi' }
    const enemyMain = { ...enemy, combat: { def: 400 } }
    const report = fight(gear, { enemyMain })
    const def = computeDerivedStats(player, { ...loadout, ...gear }).def
    const damage = incomingDamage(enemy.atk, 1, def, player.level)
    const stored = Math.round(damage * 0.30)
    const hit = report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    expect(hit.hpDelta).toBe(stored - damage)
    expect(hit.segments).toContainEqual({ type: 'tag', text: `蛤蟆逆脉天险套装（4件） · 储劲 +${stored}（共 ${stored}）`, tone: 'jade' })
    expect(effectEvents(report, set).filter((event) => event.targetSlot === 'ENEMY_MAIN' && event.hpDelta)).toMatchObject([
      { round: 2, hpDelta: -Math.round(damageAfterDefense(stored, 400, player.level)) },
    ])
  })

  it('铁掌震碎选中前排，绕过招架并以实际命中施加降攻', () => {
    const set = 'tiezhang_kaishan'
    const gear = equipped(set, sixSlots)
    const report = fight(gear, {
      enemyGuards: [{ ...enemy, combat: { parry: 100, openingShield: 500 } }],
      surviveRounds: 1, rng: () => 0.3499,
    })
    expect(mainCast(report)).toMatchObject({ targetSlot: 'ENEMY_LEFT', hitResult: 'PARRY' })
    const hits = effectEvents(report, set)
    expect(hits.find((event) => event.skillName === '铁掌震碎')).toMatchObject({ targetSlot: 'ENEMY_LEFT', hitResult: 'HIT' })
    expect(hits.find((event) => event.statusApplied === '攻击降低')).toMatchObject({ targetSlot: 'ENEMY_LEFT', statusRounds: 1 })
  })

  it('九阳净化存活队友的寒毒，八卦法袍每回合清除自己一个异常', () => {
    const combat = { ...trialStageOf(6)!.boss.combat, charge: { round: 2, name: '蓄力', damageMultiplier: 1 } }
    const enemyMain = { ...enemy, combat }
    const armorId = trialPartId('quanzhen_beidou', 'ARMOR')
    const armored = fight({ armorId }, { enemyMain })
    expect(effectEvents(armored, armorId).filter((event) => event.statusRemoved)).toMatchObject([
      { round: 2, targetSlot: 'ALLY_MAIN', statusRemoved: '阴寒骨毒' },
    ])
    const team = fight({ rightCompanionId: 'huangrong', innerSkillId: 'jiuyang_shengong' }, {
      enemyMain: { ...enemyMain, combat: { ...combat, preferFemaleCompanion: true } },
    })
    expect(effectEvents(team, 'jiuyang_shengong').filter((event) => event.statusRemoved)).toMatchObject([
      { round: 2, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_RIGHT', statusRemoved: '阴寒骨毒' },
    ])
  })

  it('白蟒鞭对每个存活目标施加流血，死士枪只增加跳伤', () => {
    const gear = { outerSkillId: 'baimang_bian', weaponId: trialPartId('dajin_sishi', 'WEAPON') }
    const report = fight(gear, { enemyGuards: [{ ...enemy }, { ...enemy }], surviveRounds: 1 })
    const { atk } = computeDerivedStats(player, { ...loadout, ...gear })
    const amount = Math.round(Math.round(atk * 0.15) * 1.4)
    const ticks = effectEvents(report, gear.outerSkillId).filter((event) => event.type === 'DOT_TICK')
    expect(ticks).toMatchObject(['ENEMY_LEFT', 'ENEMY_MAIN', 'ENEMY_RIGHT'].map((targetSlot) => ({ targetSlot, hpDelta: -amount, statusRounds: 1 })))
  })

  it('奇门四件按实际来袭架势反转克制，盾前数值与普通克制可对照', () => {
    const set = 'qimen_dunjia'
    const gear = { ...equipped(set, ['HEAD', 'ARMOR', 'WRIST', 'BELT']), stance: 'TAICHI' as const }
    const options = { enemyMain: { ...agileEnemy, atk: 500 }, surviveRounds: 1 }
    const report = fight(gear, options)
    const def = computeDerivedStats(player, { ...loadout, ...gear }).def
    const normal = incomingDamage(500, 1.22, def, player.level)
    const adjusted = incomingDamage(500, 0.82, def, player.level)
    const hit = (battle: BattleReportDTO) => battle.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    expect(hit(fight({ ...gear, beltId: null }, options))).toMatchObject({ hpDelta: -normal })
    expect(hit(report)).toMatchObject({ hpDelta: -adjusted })
    expect(hit(report).segments).toContainEqual({
      type: 'tag', text: `奇门遁甲易数套装（4件） · 反转克制 · 盾前减伤 ${normal - adjusted}`, tone: 'jade',
    })
    expect(hit(fight(gear, { ...options, enemyMain: { ...enemy, atk: 500 } })).hpDelta).toBe(-adjusted)
  })

  it('奇门六件逢双数回合只封主将并立即减速全部存活敌人', () => {
    const set = 'qimen_dunjia'
    const gear = equipped(set, sixSlots)
    const wielder = { ...player, stats: { ...player.stats, agi: 12 } }
    const speed = computeDerivedStats(wielder, { ...loadout, ...gear }).speed
    const options = {
      enemyMain: { ...enemy, hp: 100_000, combat: { speed: speed + 10, charge: { round: 2, name: '蓄力招式', damageMultiplier: 2 } } },
      enemyGuards: [{ ...enemy, hp: 100_000 }, { ...enemy, hp: 100_000 }], player: wielder, surviveRounds: 2,
    }
    const report = fight(gear, options)
    const applied = effectEvents(report, set).filter((event) => event.statusApplied)
    expect(applied.map((event) => [event.round, event.targetSlot, event.statusApplied])).toEqual([
      [2, 'ENEMY_MAIN', '封招'], [2, 'ENEMY_LEFT', '阴寒迟缓'], [2, 'ENEMY_MAIN', '阴寒迟缓'], [2, 'ENEMY_RIGHT', '阴寒迟缓'],
    ])
    const actions = (round: number) => report.events.filter((event) => event.round === round && event.type === 'SKILL_CAST').map((event) => event.actorSlot)
    expect(actions(1)).toEqual(['ENEMY_MAIN', 'ALLY_MAIN'])
    expect(actions(2)).toEqual(['ALLY_MAIN', 'ENEMY_MAIN'])
    expect(report.events.some((event) => event.statusApplied === '蓄力')).toBe(false)
  })

  it('潜影后排增伤随实际阵位生效，少室山前排与后排各自结算', () => {
    const set = 'qianying_mixing'
    const gear = equipped(set, ['HEAD', 'ARMOR', 'WRIST', 'BELT'])
    const first = mainCast(fight(gear, { surviveRounds: 1 }))
    const rear = mainCast(fight({ ...gear, leftCompanionId: 'luchengfeng' }, { surviveRounds: 1 }))
    expect(rear.hpDelta).toBe(-Math.round(-first.hpDelta! * 1.25))
    const member = (id: string, patch: Partial<LoadoutPresetDTO>) =>
      ({ player: { ...player, id }, loadout: { ...loadout, ...patch }, learnedSkills: {} })
    const raid = simulateShaoshiRaid('raid-qianying-rear', [member('a', {}), member('b', gear), member('c', gear)], () => 0.99)
    const withBonus = raid.events.filter((event) => event.round === 1 && event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.includes('后排与援护伤害')))
    expect(withBonus).toMatchObject([{ actorSlot: 'ALLY_RIGHT' }])
  })

  it('潜影首回合必暴且只将第一次命中的一半转成真伤', () => {
    const set = 'qianying_mixing'
    const skill = SKILLS.shuangshou_hubo
    const gear = { ...equipped(set, sixSlots), outerSkillId: skill.id }
    const report = fight(gear, { enemyMain: { ...enemy, combat: { def: 400, openingShield: 50_000 } }, rng: () => 0 })
    const { atk, maxMp } = computeDerivedStats(player, { ...loadout, ...gear })
    const total = strikeDamage(atk, skill.powerRatio, 1, innerPressure(maxMp, enemy.mp), true, 1)
    const casts = report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
    expect(casts.slice(0, 2)).toMatchObject([{ round: 1, hitResult: 'CRIT', hpDelta: 0 }, { round: 1, hitResult: 'CRIT', hpDelta: 0 }])
    expect(effectEvents(report, set).filter((event) => event.hpDelta)).toMatchObject([
      { round: 1, targetSlot: 'ENEMY_MAIN', hpDelta: -Math.round(total * 0.5) },
    ])
    expect(casts.filter((event) => event.round === 2).some((event) => event.hitResult === 'CRIT')).toBe(false)
  })
})

describe('装备命中、降防与重伤减疗', () => {
  const iron = 'tiezhang_kaishan'
  const heroCasts = (battle: BattleReportDTO) => battle.events.filter((event) =>
    event.actorSlot === 'ALLY_MAIN' && (event.type === 'SKILL_CAST' || event.type === 'DODGE'))

  it('醉仙两件的实际命中修正按百分点抵消目标闪避', () => {
    const gear = { headId: trialPartId('zuixian_xingshang', 'HEAD'), armorId: trialPartId('zuixian_xingshang', 'ARMOR') }
    const wielder = { ...player, stats: { ...player.stats, agi: 63 } }
    const options = { player: wielder, enemyMain: { ...enemy, combat: { dodge: 64 } }, surviveRounds: 1 }
    expect(heroCasts(fight({ headId: gear.headId }, options))[0]).toMatchObject({ hitResult: 'DODGE', hpDelta: 0 })
    const hit = mainCast(fight(gear, options))
    expect(hit.hitResult).toBe('CRIT')
    expect(hit.segments).toContainEqual({ type: 'tag', text: '命中修正 +3 个百分点', tone: 'gold' })
    const noDodge = mainCast(fight(gear, { ...options, enemyMain: enemy }))
    expect(noDodge.hpDelta).toBe(hit.hpDelta)
    expect(noDodge.segments.some((segment) => segment.type === 'tag' && segment.text.includes('命中修正'))).toBe(false)
  })

  it('落英神剑掌命中后使全部存活敌人下回合降命中，实际令敌招落空', () => {
    const options = {
      player: { ...player, stats: { ...player.stats, agi: 52 } },
      enemyGuards: [{ ...enemy, name: '护卫' }], enemyMain: { ...enemy, combat: { speed: 1 } },
    }
    const report = fight({ outerSkillId: 'luoying_zhang' }, options)
    const roundOne = effectEvents(report, 'luoying_zhang').filter((event) => event.round === 1)
    expect(roundOne.map((event) => [event.targetSlot, event.statusApplied, event.statusRounds])).toEqual([
      ['ENEMY_LEFT', '命中降低', 1], ['ENEMY_MAIN', '命中降低', 1],
    ])
    expect(heroCasts(report).filter((event) => event.round === 1)).toMatchObject([{ targetSlot: 'ENEMY_LEFT' }])
    expect(report.events.find((event) => event.round === 2 && event.actorSlot === 'ENEMY_MAIN' && event.hitResult === 'MISS'))
      .toMatchObject({ targetSlot: 'ALLY_MAIN' })
    expect(fight({}, options).events.some((event) => event.hitResult === 'MISS')).toBe(false)
  })

  it('水鬼缠身只判一次 40%，两项减益同时生效并改变实际命中', () => {
    const set = 'huanghe_sigui'
    const gear = {
      headId: trialPartId(set, 'HEAD'), armorId: trialPartId(set, 'ARMOR'), wristId: trialPartId(set, 'WRIST'),
      beltId: trialPartId(set, 'BELT'), bootsId: trialPartId(set, 'BOOTS'), accId: trialPartId(set, 'ACC'),
    }
    const options = { player: { ...player, stats: { ...player.stats, agi: 97 } }, enemyMain: { ...enemy, combat: { def: 400, dodge: 40 } } }
    const rng = vi.fn(() => 0.3999)
    const opening = fight(gear, { ...options, rng, surviveRounds: 1 })
    expect(rng).toHaveBeenCalledTimes(1)
    expect(effectEvents(opening, set).filter((event) => event.statusApplied)).toMatchObject([
      { targetSlot: 'ENEMY_MAIN', statusApplied: '防御降低', statusRounds: 2 },
      { targetSlot: 'ENEMY_MAIN', statusApplied: '闪避降低', statusRounds: 2 },
    ])
    const failed = fight(gear, { ...options, rng: () => 0.40 })
    expect(heroCasts(failed)[1]).toMatchObject({ round: 2, hitResult: 'DODGE' })
    const passed = fight(gear, { ...options, rng: () => 0.3999 })
    expect(heroCasts(passed)[1].hpDelta!).toBeLessThan(0)
  })

  it('大手印下回合降防，随后才扣固定破甲与百分比穿透', () => {
    const gear = {
      outerSkillId: 'dashouyin', weaponId: trialPartId('niluan_jiuyin', 'WEAPON'), wristId: trialPartId('huanghe_sigui', 'WRIST'),
    }
    const report = fight(gear, { enemyMain: { ...enemy, combat: { def: 400 } }, surviveRounds: 2 })
    const [first, next] = heroCasts(report)
    expect(effectEvents(report, 'dashouyin').find((event) => event.statusApplied)).toMatchObject({
      round: 1, targetSlot: 'ENEMY_MAIN', statusApplied: '防御降低', statusRounds: 1,
    })
    expect(first.segments.some((segment) => segment.type === 'tag' && segment.text.includes('穿透 116 点防御'))).toBe(true)
    expect(next.segments.some((segment) => segment.type === 'tag' && segment.text.includes('穿透 80 点防御'))).toBe(true)
    expect(next.segments.some((segment) => segment.type === 'tag' && segment.text.includes('固定破甲 12 点防御'))).toBe(true)
  })

  it('铁掌指环只在刚猛架势叠加降防，至 5 层归零', () => {
    const accId = trialPartId(iron, 'ACC')
    const options = {
      player: { ...player, stats: { ...player.stats, con: 160 } },
      enemyMain: { ...enemy, hp: 100_000, combat: { def: 400 } }, surviveRounds: 6,
    }
    const report = fight({ accId }, options)
    expect(effectEvents(report, accId).map((event) => event.statusStacks)).toEqual([1, 2, 3, 4, 5, 5])
    const zeroDefense = fight({}, { ...options, enemyMain: { ...enemy, hp: 100_000 } })
    expect(heroCasts(report)[5].hpDelta).toBe(heroCasts(zeroDefense)[5].hpDelta)
    expect(effectEvents(fight({ accId, stance: 'TAICHI' }, options), accId)).toEqual([])
  })

  it('历练裘千仞使本回合末自愈和下次行动回血按减疗后的数值结算', () => {
    const boss = trialStageOf(26)!.boss
    const enemyMain = { ...boss, hp: 100_000, atk: 250, mp: 500, combat: { ...boss.combat, speed: 1 } }
    const coat = trialPartId('changbai_canxian', 'ARMOR')
    const gear = { armorId: coat, beltId: trialPartId('changbai_canxian', 'BELT'), accId: flaskId }
    const report = fight(gear, { enemyMain })
    const baseline = fight(gear, { enemyMain: { ...enemyMain, combat: { ...enemyMain.combat, statusOnHit: undefined } } })
    expect(report.events.find((event) => event.statusApplied === '重伤减疗')).toMatchObject({
      round: 1, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN', statusRounds: 3,
    })
    expect(effectEvents(baseline, coat).filter((event) => event.hpDelta)[0].hpDelta).toBe(60)
    const heal = effectEvents(report, coat).find((event) => event.hpDelta)!
    expect(heal).toMatchObject({ round: 1, hpDelta: 30 })
    expect(heal.segments).toContainEqual({ type: 'tag', text: '重伤减疗 -30', tone: 'red' })
    expect(effectEvents(report, flaskId).filter((event) => event.hpDelta)).toMatchObject([{ round: 2, hpDelta: 8 }])
    expect(effectEvents(baseline, flaskId).filter((event) => event.hpDelta)).toMatchObject([{ round: 2, hpDelta: 15 }])
  })

  it('伙伴铁掌连环按实际站位使前排重伤，主角用同招也能施加', () => {
    const options = { enemyGuards: [{ ...enemy, name: '前排' }], surviveRounds: 1 }
    const report = fight({ rightCompanionId: 'qiuqianren', outerSkillId: 'tiezhang_gong' }, options)
    expect(effectEvents(report, 'qiuqianren')).toMatchObject([
      { type: 'ASSIST_ATTACK', actorSlot: 'ALLY_RIGHT', skillId: 'tiezhang_gong', targetSlot: 'ENEMY_LEFT' },
    ])
    expect(effectEvents(report, 'tiezhang_gong').filter((event) => event.statusApplied)).toMatchObject([
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', statusApplied: '重伤减疗', statusRounds: 3 },
    ])
    const onlyCompanion = fight({ rightCompanionId: 'qiuqianren' }, options)
    expect(effectEvents(onlyCompanion, 'tiezhang_gong')).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', statusApplied: '重伤减疗', statusRounds: 3 },
    ])
  })
})

describe('装备暴伤、受伤增攻与连击', () => {
  const reverse = 'niluan_jiuyin'
  const reverseGear = {
    headId: trialPartId(reverse, 'HEAD'), armorId: trialPartId(reverse, 'ARMOR'),
    wristId: trialPartId(reverse, 'WRIST'), beltId: trialPartId(reverse, 'BELT'),
  }
  const kongming = 'kongming_wantong'
  const casts = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')

  it('单件和套装暴伤相加，只增加暴击伤害，各自记录过盾增量', () => {
    const weaponId = trialPartId('damo_qibing', 'WEAPON')
    const gear = { ...reverseGear, weaponId }
    const wielder = { ...player, stats: { ...player.stats, agi: 63 } }
    const { atk, maxMp } = computeDerivedStats(wielder, { ...loadout, ...gear })
    const crit = (percent: number) => strikeDamage(atk, 1, 1, innerPressure(maxMp, enemy.mp), true, 1, percent / 100)
    const shield = crit(100) + 20
    const enemyMain = { ...enemy, combat: { openingShield: shield } }
    const hit = mainCast(fight(gear, { player: wielder, enemyMain, surviveRounds: 1 }))
    expect(hit).toMatchObject({ hitResult: 'CRIT', hpDelta: shield - crit(190), shieldAbsorbed: shield })
    expect(hit.segments.filter((segment) => segment.type === 'tag' && segment.text.includes('暴击伤害 +'))).toEqual([
      { type: 'tag', text: `大漠桦木角弓 · 暴击伤害 +15% · 增伤 +${(crit(115) - shield).toLocaleString()}`, tone: 'gold' },
      { type: 'tag', text: `逆乱乾坤通天护腕 · 暴击伤害 +40% · 增伤 +${(crit(155) - crit(115)).toLocaleString()}`, tone: 'gold' },
      { type: 'tag', text: `逆乱九阴天下第一套装（4件） · 暴击伤害 +35% · 增伤 +${(crit(190) - crit(155)).toLocaleString()}`, tone: 'gold' },
    ])
    const normal = mainCast(fight(gear, { enemyMain, surviveRounds: 1 }))
    expect(normal.hitResult).toBe('HIT')
    expect(normal.segments.some((segment) => segment.type === 'tag' && segment.text.includes('暴击伤害 +'))).toBe(false)
    const absorbed = mainCast(fight(gear, {
      player: wielder, enemyMain: { ...enemy, combat: { openingShield: 20_000 } }, surviveRounds: 1,
    }))
    expect(absorbed).toMatchObject({ hpDelta: 0, shieldAbsorbed: crit(190) })
    expect(absorbed.segments).toContainEqual({
      type: 'tag', text: '逆乱九阴天下第一套装（4件） · 暴击伤害 +35% · 增伤 +0', tone: 'gold',
    })
  })

  it('大金四件按出招前已损气血的整档提升攻击和暴伤', () => {
    const set = 'dajin_sishi'
    const gear = {
      headId: trialPartId(set, 'HEAD'), armorId: trialPartId(set, 'ARMOR'),
      wristId: trialPartId(set, 'WRIST'), beltId: trialPartId(set, 'BELT'),
    }
    const wielder = { ...player, stats: { ...player.stats, agi: 26 } }
    const { def, maxHp, atk, maxMp } = computeDerivedStats(wielder, { ...loadout, ...gear })
    const strikeAtLoss = (loss: number) => {
      const enemyAtk = Math.round(loss * (def + 495) / 495)
      expect(incomingDamage(enemyAtk, 1, def, player.level)).toBe(loss)
      return casts(fight(gear, { player: wielder, enemyMain: { ...enemy, atk: enemyAtk, combat: { speed: 1 } } }))[1]
    }
    const pressure = innerPressure(maxMp, enemy.mp)
    const baseline = strikeDamage(atk, 1, 1, pressure, true, 2)
    expect(strikeAtLoss(Math.ceil(maxHp * 0.10) - 1).hpDelta).toBe(-baseline)
    for (const steps of [1, 3]) {
      const bonus = steps * 8
      const hit = strikeAtLoss(Math.ceil(maxHp * steps / 10))
      const actual = strikeDamage(Math.round(atk * (100 + bonus) / 100), 1, 1, pressure, true, 2, 1 + bonus / 100)
      expect(hit).toMatchObject({ hitResult: 'CRIT', hpDelta: -actual })
      expect(hit.segments).toContainEqual({
        type: 'tag', text: `大金覆灭死士套装（4件） · 攻击 +${bonus}%、暴击伤害 +${bonus}% · 增伤 +${(actual - baseline).toLocaleString()}`, tone: 'gold',
      })
    }
  })

  it('武器和空明两件的连击率相加，只判一次', () => {
    const gear = { weaponId: trialPartId(kongming, 'WEAPON'), headId: trialPartId(kongming, 'HEAD') }
    const rng = vi.fn(() => 0.3299)
    const [first, extra] = casts(fight(gear, { rng, surviveRounds: 1 }))
    expect(rng).toHaveBeenCalledTimes(1)
    expect(extra).toMatchObject({ hpDelta: first.hpDelta, effectSourceId: gear.weaponId, skillId: first.skillId })
    expect(extra.rageDelta).toBeUndefined()
    expect(casts(fight(gear, { rng: () => 0.33, surviveRounds: 1 }))).toHaveLength(1)
  })

  it('同招连击按顺序增加伤害，武学追击和装备连击共用序号', () => {
    const set = 'huanghe_sigui'
    const gear = {
      weaponId: trialPartId(set, 'WEAPON'), headId: trialPartId(set, 'HEAD'), armorId: trialPartId(set, 'ARMOR'),
      beltId: trialPartId(set, 'BELT'), wristId: trialPartId(kongming, 'WRIST'), outerSkillId: 'shuangshou_hubo',
    }
    const [first, double, weapon] = casts(fight(gear, { surviveRounds: 1, rng: () => 0.0499 }))
    expect(double).toMatchObject({ effectSourceId: 'shuangshou_hubo', hpDelta: -Math.round(-first.hpDelta! * 1.35) })
    expect(weapon).toMatchObject({ effectSourceId: gear.weaponId, hpDelta: -Math.round(-first.hpDelta! * 1.45) })
    expect(weapon.segments.some((segment) => segment.type === 'tag' && segment.text.includes('第 2 次连击 · 连击伤害 +20%'))).toBe(true)
    expect(casts(fight(gear, { surviveRounds: 1, rng: () => 0.05 }))).toHaveLength(2)
  })

  it('左右互搏保证第二次出手为原招的 80%，原有追击可另行触发且不递归', () => {
    const gear = {
      weaponId: trialPartId(kongming, 'WEAPON'), headId: trialPartId(kongming, 'HEAD'), armorId: trialPartId(kongming, 'ARMOR'),
      beltId: trialPartId(kongming, 'BELT'), bootsId: trialPartId(kongming, 'BOOTS'), accId: trialPartId(kongming, 'ACC'),
      outerSkillId: 'xianglong_18',
    }
    const [first, extra] = casts(fight(gear, { surviveRounds: 1, rng: () => 0.99 }))
    expect(extra).toMatchObject({ effectSourceId: kongming, skillId: first.skillId, hpDelta: -Math.round(-first.hpDelta! * 0.8) })
    expect(extra.rageDelta).toBeUndefined()
    const triggered = casts(fight(gear, { surviveRounds: 1, rng: () => 0 }))
    expect(triggered.map((event) => event.effectSourceId)).toEqual([undefined, kongming, kongming, gear.weaponId])
    expect(triggered[1].segments).toContainEqual({
      type: 'tag', text: '空明顽童玄素套装（6件） · 追加出手 · 原伤害 80%', tone: 'purple',
    })
  })

  it('逆乱四件绝技后只追加本人的外功，少室山重选存活目标且不再次消耗资源', () => {
    const gear = { ...reverseGear, outerSkillId: 'xianglong_18', ultSkillId: 'yiyang_zhi' }
    const options = { surviveRounds: 2, rng: () => 0.99 }
    const solo = fight(gear, options)
    const [extra] = effectEvents(solo, reverse).filter((event) => event.type === 'SKILL_CAST')
    expect(extra).toMatchObject({ round: 2, skillId: 'xianglong_18', isUlt: false })
    expect(extra.mpDelta).toBeUndefined()
    expect(extra.rageDelta).toBeUndefined()
    const missingPiece = fight({ ...gear, armorId: null }, options)
    expect(effectEvents(missingPiece, reverse).filter((event) => event.type === 'SKILL_CAST')).toHaveLength(0)

    const member = (id: string, patch: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id, level: 32, realmTier: 3, stats: { ...player.stats, str: 35, con: 100 } },
      loadout: { ...loadout, ...patch }, learnedSkills: {},
    })
    const raid = simulateShaoshiRaid('raid-ult-extra', [member('a', gear), member('b', {}), member('c', {})], () => 0.99)
    const ultimate = raid.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.isUlt)!
    expect(ultimate).toMatchObject({ targetSlot: 'ENEMY_RIGHT', skillId: 'yiyang_zhi' })
    expect(effectEvents(raid, reverse).filter((event) => event.type === 'SKILL_CAST')).toMatchObject([
      { round: ultimate.round, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', skillId: 'xianglong_18', isUlt: false },
    ])
  })
})

describe('绝技专属暴击', () => {
  const mainCasts = (report: BattleReportDTO) => report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
  const critTags = (event: BattleEventDTO) => event.segments.filter((segment) => segment.type === 'tag' && segment.text.includes('暴击率 +'))
  const critTag = (name: string, points: number, percent: number) => ({
    type: 'tag', text: `${name} · 暴击率 +${points} 个百分点（本次 ${percent}%）`, tone: 'gold',
  })
  const agile = (agi: number) => ({ ...player, stats: { ...player.stats, agi } })

  it.each([
    ['huima_qiang', 18], ['luanpi_chai', 10], ['shisheng_chuang', 8], ['duanmen_pikan', 10], ['tonggui_jianfa', 25],
  ])('%s 只给本次绝技增加 %i 个百分点暴击率', (id, points) => {
    const character = agile(45)
    const gear = { ultSkillId: id }
    expect(computeDerivedStats(character, { ...loadout, ...gear }).crit).toBe(13)
    const [first, ult, next] = mainCasts(fight(gear, { player: character, surviveRounds: 3 }))
    expect(ult).toMatchObject({ round: 2, isUlt: true, skillId: id, hitResult: 'CRIT' })
    expect(critTags(ult)).toEqual([critTag(SKILLS[id].name, points, 13 + points)])
    expect([first.hitResult, next.hitResult]).toEqual(['HIT', 'HIT'])
    expect([...critTags(first), ...critTags(next)]).toEqual([])
  })

  it('绝技与白驼中毒暴击共用 75% 上限，战报分别记录实际加成', () => {
    const baituo = 'baituo_yushe'
    const poisonGear = {
      headId: trialPartId(baituo, 'HEAD'), accId: trialPartId(baituo, 'ACC'),
      armorId: 'ruanwei_armor', outerSkillId: 'dugu_jiujian', ultSkillId: 'tonggui_jianfa',
    }
    const ultName = SKILLS.tonggui_jianfa.name
    const baituoName = '白驼驭蛇奇毒套装（2件）'
    const atCap = mainCasts(fight(poisonGear, { player: agile(1) }))[1]
    expect(atCap).toMatchObject({ isUlt: true, hitResult: 'HIT' })
    expect(critTags(atCap)).toEqual([critTag(ultName, 25, 75), critTag(baituoName, 6, 75)])

    const highCrit = { ...poisonGear, weaponId: 'dagou_stick_true' }
    const clipped = mainCasts(fight(highCrit, { player: agile(0) }))[1]
    expect(clipped).toMatchObject({ isUlt: true, hitResult: 'CRIT' })
    expect(critTags(clipped)).toEqual([critTag(ultName, 6, 75), critTag(baituoName, 0, 75)])
  })

  it('全真·同归剑法权益与实际绝技倍率和暴击数值一致', () => {
    const benefit = VIP_SKILL_REWARDS.find((reward) => reward.skillId === 'tonggui_jianfa')
    expect(benefit?.marketingDesc).toContain('威力倍率 2.80')
    expect(benefit?.marketingDesc).toContain('本次绝技暴击率 +25 个百分点，上限 75%')
  })

  it('历练回放显示绝技的实际暴击加成和凌波微步的实回怒气', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, agile(71).stats)
      store.trial.maxStageId = 21
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      store.updateLoadout({ ...loadout, lightSkillId: 'lingbo_weibu', ultSkillId: 'tonggui_jianfa' })
      store.challengeTrialStage(7)
      expect(store.activeBattle?.events.find((event) => event.round === 1 && event.type === 'DODGE'))
        .toMatchObject({ actorSlot: 'ALLY_MAIN', rageDelta: 15 })
      expect(store.activeBattle?.events.find((event) => event.round === 2 && event.isUlt))
        .toMatchObject({ actorSlot: 'ALLY_MAIN', skillId: 'tonggui_jianfa' })
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual({ type: 'text', text: '闪开了，怒气 +15。' })
      expect(logs).toContainEqual(critTag(SKILLS.tonggui_jianfa.name, 25, 39))
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('武学、装备与羁绊效果', () => {
  it('破庙蓑衣两件套给面板和初始气血加 120，穿第三件时两件加成只结算一次', () => {
    const single = { ...loadout, armorId: pomiaoPieces.armorId }
    const baseHp = computeDerivedStats(player, single).maxHp
    const pairStats = computeDerivedStats(player, { ...loadout, ...pomiaoPieces })
    expect(pairStats.maxHp).toBe(baseHp + 120)
    const report = fight(pomiaoPieces)
    expect(mainUnit(report)).toMatchObject({ hp: pairStats.maxHp, maxHp: pairStats.maxHp })
    expect(effectEvents(report, pomiaoSet)).toMatchObject([{
      round: 1, targetSlot: 'ALLY_MAIN',
      segments: [
        { type: 'tag', text: '破庙蓑衣草莽套装（2件）' },
        { type: 'text', text: expect.stringContaining('气血上限 +120') },
      ],
    }])
    expect(effectEvents(fight({ ...pomiaoPieces, headId: trialPartId(pomiaoSet, 'HEAD') }), pomiaoSet)).toHaveLength(1)
    expect(effectEvents(fight({ weaponId: pomiaoPieces.weaponId, accId: pomiaoPieces.armorId }), pomiaoSet)).toHaveLength(0)
  })

  it('江南七怪两件与腰带叠加臂力，只有有效部位计入套装，原始属性不变', () => {
    const set = 'jiangnan_qiguai'
    const weaponId = trialPartId(set, 'WEAPON')
    const beltId = trialPartId(set, 'BELT')
    const single = computeDerivedStats(player, { ...loadout, weaponId })
    expect(computeDerivedStats(player, { ...loadout, weaponId, accId: beltId })).toEqual(single)
    const pair = computeDerivedStats(player, { ...loadout, weaponId, beltId })
    expect(pair).toMatchObject({ atk: single.atk + 105, def: single.def + 14, maxHp: single.maxHp + 200 })
    expect(player.stats.str).toBe(10)
    const report = fight({ weaponId, beltId, headId: trialPartId(set, 'HEAD') })
    expect(effectEvents(report, beltId)).toMatchObject([{
      round: 1, segments: [{ type: 'tag' }, { type: 'text', text: ' 试招侠客臂力 +3' }],
    }])
    expect(effectEvents(report, set)).toMatchObject([{
      round: 1, segments: [{ type: 'tag' }, { type: 'text', text: ' 试招侠客外功攻击 +45，臂力 +4' }],
    }])
  })

  it('大金覆灭两件套的暴击率按战斗上限报出实际增加值', () => {
    const set = 'dajin_sishi'
    const character = { ...player, stats: { ...player.stats, agi: 35 } }
    const single = { ...loadout, weaponId: 'dagou_stick_true', outerSkillId: 'dugu_jiujian', headId: trialPartId(set, 'HEAD') }
    const pair = { ...single, beltId: trialPartId(set, 'BELT') }
    expect(computeDerivedStats(character, single).crit).toBe(72)
    expect(computeDerivedStats(character, pair).crit).toBe(75)
    expect(effectEvents(fight(pair, { player: character }), set)).toMatchObject([{
      round: 1, segments: [{ type: 'tag' }, { type: 'text', text: ' 试招侠客外功攻击 +380，暴击率 +3%' }],
    }])
  })

  it('历练通过正常配装、物品详情和战斗入口使用同一组属性', () => {
    const store = newStore('NEW')
    const set = 'fahua_zuyi'
    const headId = trialPartId(set, 'HEAD')
    const weaponId = trialPartId(set, 'WEAPON')
    try {
      Object.assign(store.player.stats, player.stats)
      store.trial.maxStageId = 3
      store.trial.stageHours['3'] = TRIAL_PATROL_HOURS[3]
      store.ownedItemIds.push(headId, weaponId)
      store.updateLoadout(loadout)
      const base = store.derivedStats
      store.equipItem(headId)
      store.equipItem(weaponId)
      expect(store.derivedStats).toMatchObject({ maxMp: base.maxMp + 50, def: base.def + 45 })
      store.inspectById('item', headId)
      expect(store.inspectModal?.extra).toContain('内力上限 +50')
      expect(store.inspectModal?.extra).toContain('法华行脚缁衣套装（2件）护体防御 +30')

      store.challengeTrialStage(3)
      const report = store.activeBattle!
      expect(mainUnit(report).maxMp).toBe(base.maxMp + 50)
      expect(effectEvents(report, set)).toMatchObject([{
        round: 1, targetSlot: 'ALLY_MAIN', segments: [{ type: 'tag' }, { type: 'text', text: expect.stringContaining('护体防御 +30') }],
      }])
    } finally {
      store.closeBattleStage()
    }
  })

  it('枯荣禅功在回合末低于 30% 时回复 12% 最大气血', () => {
    // 1000 最大气血，敌方两档攻击力分别打掉 700 和 701。
    const character = { ...player, bonusHpPct: 7 }
    const build = { innerSkillId: 'kurong_chan' }
    const atThreshold = fight(build, { player: character, enemyMain: { ...enemy, atk: 846 }, surviveRounds: 1 })
    expect(mainUnit(atThreshold).maxHp).toBe(1000)
    expect(atThreshold.events.at(-1)).toMatchObject({ targetSlot: 'ALLY_MAIN', hpDelta: -700 })
    expect(effectEvents(atThreshold, 'kurong_chan')).toEqual([])

    const belowThreshold = fight(build, { player: character, enemyMain: { ...enemy, atk: 847 }, surviveRounds: 1 })
    expect(belowThreshold.events.at(-2)).toMatchObject({ targetSlot: 'ALLY_MAIN', hpDelta: -701 })
    expect(effectEvents(belowThreshold, 'kurong_chan')).toMatchObject([{ round: 1, targetSlot: 'ALLY_MAIN', hpDelta: 120 }])
    expect(belowThreshold.events.at(-1)?.segments).toContainEqual({ type: 'damage', value: 120, category: 'heal' })

    const defeated = fight(build, { player: character, enemyMain: { ...enemy, atk: 1300 }, surviveRounds: 1 })
    expect(defeated.winner).toBe('ENEMY')
    expect(effectEvents(defeated, 'kurong_chan')).toEqual([])
  })

  it('小酒葫芦在持有者出手后回复 15，满血跳过且回满时按实际值播报', () => {
    const solo = fight({ accId: flaskId })
    const [heal] = effectEvents(solo, flaskId)
    expect(effectEvents(solo, flaskId)).toHaveLength(1)
    expect(heal).toMatchObject({ round: 2, targetSlot: 'ALLY_MAIN', hpDelta: 15 })
    expect(solo.events[solo.events.indexOf(heal) - 1]).toMatchObject({ type: 'SKILL_CAST', actorSlot: 'ALLY_MAIN', round: 2 })

    const capped = fight({ accId: flaskId, ...nanBei }, { enemyMain: { ...enemy, atk: 1 } })
    expect(effectEvents(capped, flaskId)).toMatchObject([{ round: 2, hpDelta: 14 }])
    expect(effectEvents(capped, flaskId)[0].segments).toContainEqual({ type: 'damage', value: 14, category: 'heal' })
    expect(effectEvents(capped, 'nan_bei').map((event) => event.hpDelta)).toEqual([56, 34])
  })

  it('南帝北丐为外功和追击增伤 20%，绝技沿用原伤害', () => {
    const baseline = fight({ leftCompanionId: nanBei.leftCompanionId, ultSkillId: 'yiyang_zhi' })
    const paired = fight({ ...nanBei, ultSkillId: 'yiyang_zhi' })
    for (const actorSlot of ['ALLY_MAIN', 'ALLY_LEFT']) {
      const original = baseline.events.find((event) => event.round === 1 && event.actorSlot === actorSlot && event.hpDelta)!
      const boosted = paired.events.find((event) => event.round === 1 && event.actorSlot === actorSlot && event.hpDelta)!
      const expected = Math.round(-original.hpDelta! * 1.2)
      expect(boosted.hpDelta).toBe(-expected)
      expect(boosted.segments).toContainEqual({ type: 'tag', text: `南帝北丐 · 外功增伤 +${expected + original.hpDelta!}`, tone: 'purple' })
    }
    const baselineUlt = baseline.events.find((event) => event.isUlt)!
    expect(baselineUlt.skillId).toBe('yiyang_zhi')
    expect(paired.events.find((event) => event.isUlt)).toMatchObject({ skillId: 'yiyang_zhi', hpDelta: baselineUlt.hpDelta })
    expect(effectEvents(baseline, 'nan_bei')).toEqual([])
  })

  it('南帝北丐按敌方剩余气血记录实际增伤', () => {
    const report = fight(nanBei, { enemyMain: { ...enemy, hp: 160 } })
    const hit = report.events.find((event) => event.type === 'SKILL_CAST')!
    expect(hit.hpDelta).toBe(-160)
    expect(hit.segments).toContainEqual({ type: 'tag', text: '南帝北丐 · 外功增伤 +18', tone: 'purple' })
  })

  it('南帝北丐在闪避回合照常回复气血并完成生存轮次', () => {
    const report = fight({ ...nanBei, lightSkillId: 'lingbo_weibu' }, { player: { ...player, stats: { ...player.stats, agi: 60 } } })
    const recovery = Math.round(mainUnit(report).maxHp * 0.06)
    expect(effectEvents(report, 'nan_bei')).toMatchObject([
      { round: 1, targetSlot: 'ALLY_MAIN', hpDelta: recovery },
      { round: 2, targetSlot: 'ALLY_MAIN', hpDelta: recovery },
    ])
    expect(report.events.at(-2)).toMatchObject({ type: 'DODGE', round: 2 })
    expect(report.events.at(-1)).toMatchObject({ effectSourceId: 'nan_bei', round: 2 })
    expect(report.winner).toBe('ALLY')
  })

  it('结义队友替代左右翼时，预设中的两位伙伴不提供南帝北丐', () => {
    const partner = { name: '结义侠客', sect: '丐帮', hp: 3000, atk: 300 }
    const report = fight(nanBei, { mode: 'COOP_3P', coopPlayers: { leftPlayer: partner, rightPlayer: partner } })
    expect(effectEvents(report, 'nan_bei')).toEqual([])
    expect(report.events.flatMap((event) => event.segments)).not.toContainEqual(expect.objectContaining({
      type: 'tag', text: expect.stringContaining('南帝北丐'),
    }))
  })

  it('少室山按各玩家配装结算套装、酒葫芦和枯荣禅功', () => {
    const character = { ...player, stats: { ...player.stats, con: 100 } }
    const equipped = { ...loadout, ...pomiaoPieces, accId: flaskId, innerSkillId: 'kurong_chan' }
    const fighter = (id: string, preset: LoadoutPresetDTO) => ({ player: { ...character, id }, loadout: preset, learnedSkills: {} })
    const report = simulateShaoshiRaid('raid-effects', [fighter('a', equipped), fighter('b', loadout), fighter('c', loadout)])
    expect(mainUnit(report).maxHp).toBe(computeDerivedStats(character, equipped).maxHp)
    expect(effectEvents(report, pomiaoSet)).toMatchObject([{ round: 1, targetSlot: 'ALLY_MAIN' }])
    expect(effectEvents(report, flaskId)[0]).toMatchObject({ round: 2, targetSlot: 'ALLY_MAIN', hpDelta: 15 })
    expect(effectEvents(report, 'kurong_chan')[0]).toMatchObject({ targetSlot: 'ALLY_MAIN', hpDelta: Math.round(mainUnit(report).maxHp * 0.12) })
    expect(report.events.filter((event) => event.effectSourceId).every((event) => event.targetSlot === 'ALLY_MAIN')).toBe(true)
  })
})

describe('醉仙短打与荒山煞风的流血、中毒联动', () => {
  const claw = SKILLS.jiuyin_baiguzhua
  const wine = 'zuixian_xingshang'
  const bones = 'huangshan_kulou'
  const wineGear = {
    weaponId: trialPartId(wine, 'WEAPON'), headId: trialPartId(wine, 'HEAD'),
    wristId: trialPartId(wine, 'WRIST'), beltId: trialPartId(wine, 'BELT'),
  }
  const boneGear = {
    weaponId: trialPartId(bones, 'WEAPON'), headId: trialPartId(bones, 'HEAD'),
    wristId: trialPartId(bones, 'WRIST'), beltId: trialPartId(bones, 'BELT'),
    bootsId: trialPartId(bones, 'BOOTS'), accId: trialPartId(bones, 'ACC'),
  }
  const bonusTag = (amount: number) => ({
    type: 'tag', text: `荒山煞风骷髅套装（6件） · 异常增伤 +${amount}`, tone: 'purple',
  })
  const hasBonus = (event: BattleEventDTO) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('异常增伤'))
  const targetState = (shield = 0): EnemyBattleState => ({
    shield, atk: enemy.atk,
    unit: {
      slot: 'ENEMY_MAIN', id: 'dummy', name: enemy.name, title: '', portraitStyle: 'bandit',
      isPlayer: false, hp: 1000, maxHp: 1000, maxMp: 500, rage: 0,
    },
  })

  it.each([
    ['四件外功', wineGear, 'OUTER', 3],
    ['三件外功', { ...wineGear, wristId: null }, 'OUTER', 2],
    ['四件绝技', wineGear, 'ULT', 2],
  ] as const)('%s 流血持续 %i 回合并按时解除', (_label, gear, slot, rounds) => {
    const target = targetState()
    const effects = resolveBattleLoadout({ ...loadout, ...gear }).effects
    const events: BattleEventDTO[] = []
    applyBleedOnHit({ ...claw, slot }, target, { actorSlot: 'ALLY_MAIN', attackerAtk: 100, targetHp: 1000, round: 1 }, effects, events)
    expect(events[0]).toMatchObject({ statusApplied: '流血', statusRounds: rounds })
    expect(events[0].segments).toContainEqual({ type: 'text', text: ` 试招木桩流血 ${rounds} 回合。` })

    let hp = target.unit.hp
    for (let round = 1; round <= 4; round++) hp = resolveDamageOverTime(target, hp, round, events)
    expect(hp).toBe(1000 - 20 * rounds)
    expect(events.slice(1)).toHaveLength(rounds)
    expect(events.at(-1)).toMatchObject({ round: rounds, hpDelta: -20, statusRemoved: '流血', statusRounds: 0 })
  })

  it.each([
    ['流血', { outerSkillId: claw.id }],
    ['中毒', { armorId: 'ruanwei_armor' }],
    ['中毒和流血', { outerSkillId: claw.id, armorId: 'ruanwei_armor' }],
  ] as const)('荒山六件对%s只增加一次 25%%，绝技、持续伤害和反伤共用结算', (_status, patch) => {
    const gear = { ...boneGear, ...patch, ultSkillId: 'yiyang_zhi' }
    const options = { enemyMain: { ...enemy, combat: { def: 400 } } }
    const report = fight(gear, options)
    const baseline = fight({ ...gear, accId: null }, options)
    const casts = (battle: BattleReportDTO) => battle.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')
    const [first, ult] = casts(report)
    expect(first.hpDelta).toBe(casts(baseline)[0].hpDelta)
    expect(hasBonus(first)).toBe(false)
    expect(casts(baseline)[1]).toMatchObject({ skillId: 'yiyang_zhi', hpDelta: -783 })
    expect(ult).toMatchObject({ skillId: 'yiyang_zhi', hpDelta: -979 })
    expect(ult.segments).toContainEqual(bonusTag(196))
    expect(ult.segments.filter((segment) => segment.type === 'tag' && segment.text.includes('异常增伤'))).toHaveLength(1)

    const ticks = report.events.filter((event) => event.type === 'DOT_TICK')
    const baselineTicks = baseline.events.filter((event) => event.type === 'DOT_TICK')
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks).toHaveLength(baselineTicks.length)
    for (const [index, tick] of ticks.entries()) {
      const base = -baselineTicks[index].hpDelta!
      const damage = Math.round(base * 1.25)
      expect(tick).toMatchObject({ effectSourceId: baselineTicks[index].effectSourceId, hpDelta: -damage })
      expect(tick.segments).toContainEqual(bonusTag(damage - base))
    }
    if ('armorId' in patch) {
      const reflection = effectEvents(report, patch.armorId).find((event) => event.type === 'EFFECT' && event.round === 2)!
      expect(reflection.hpDelta).toBe(-141)
      expect(reflection.segments).toContainEqual(bonusTag(28))
    }
  })

  it('灵蛇奇毒消耗后停止增伤，独立出手的伙伴沿用自己的效果', () => {
    const report = fight({ ...boneGear, leftCompanionId: 'ouyangfeng', rightCompanionId: 'huangyaoshi' }, {
      enemyMain: { ...enemy, hp: 50_000 }, surviveRounds: 4, companionOf: baseCompanion,
    })
    expect(report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && hasBonus(event))).toMatchObject([
      { round: 2, type: 'SKILL_CAST' },
      { round: 2, type: 'EFFECT', effectSourceId: boneGear.weaponId, hpDelta: -31 },
      { round: 3, type: 'SKILL_CAST' },
      { round: 3, type: 'EFFECT', effectSourceId: boneGear.weaponId, hpDelta: -31 },
    ])
    expect(effectEvents(report, 'dong_xi')).toContainEqual(expect.objectContaining({ round: 3, statusRemoved: '灵蛇奇毒' }))
    expect(report.events.some((event) => event.actorSlot !== 'ALLY_MAIN' && hasBonus(event))).toBe(false)
  })

  it('异常增伤按盾后实扣和目标剩余气血记账，单独内伤不触发', () => {
    const effects = resolveBattleLoadout({ ...loadout, ...boneGear }).effects
    const status = { sourceId: 'dong_xi', sourceSlot: 'ALLY_LEFT' as const, damage: 20, remainingRounds: 1 }
    const partialShield = { ...targetState(80), ongoingDamage: { lingshe: status } }
    const hit = resolveAttackDamage(100, partialShield, 30, 1, undefined, effects)
    expect(hit).toMatchObject({ damage: 30, shieldEvent: { shieldAbsorbed: 80, shieldDelta: -80 } })
    expect(hit.segments).toContainEqual(bonusTag(10))

    const fullShield = { ...targetState(200), ongoingDamage: { lingshe: status } }
    const blocked = resolveAttackDamage(100, fullShield, 30, 1, undefined, effects)
    expect(blocked).toMatchObject({ damage: 0, shieldEvent: { shieldAbsorbed: 125, shieldDelta: -125 } })
    expect(blocked.segments.some((segment) => segment.type === 'tag' && segment.text.includes('异常增伤'))).toBe(false)

    const innerInjury = { ...targetState(), ongoingDamage: { bihai: status } }
    expect(resolveAttackDamage(100, innerInjury, 1000, 1, undefined, effects)).toMatchObject({ damage: 100, segments: [] })
  })

  it('白骨爪施加流血后，荒山穿戴者的回马枪真伤获得一次增伤', () => {
    const gear = { ...boneGear, armorId: trialPartId(bones, 'ARMOR'), weaponId: 'yangjia_spear', outerSkillId: claw.id }
    const wielder = { ...player, stats: { ...player.stats, str: 30 } }
    const report = fight(gear, {
      player: wielder, enemyMain: { ...enemy, combat: { def: 400, openingShield: 5000 } },
      rng: () => 0, surviveRounds: 1,
    })
    const base = Math.round(computeDerivedStats(wielder, { ...loadout, ...gear }).atk * 1.5)
    const damage = Math.round(base * 1.25)
    const [followUp] = effectEvents(report, 'yangjia_spear')
    expect(followUp).toMatchObject({ hpDelta: -damage })
    expect(followUp.shieldAbsorbed).toBeUndefined()
    expect(followUp.segments).toContainEqual(bonusTag(damage - base))
  })

  it('少室山按施招者配装延长流血，并只给荒山穿戴者增伤', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 35, con: 100 } }
    const fighter = (id: string, preset: LoadoutPresetDTO) => ({ player: { ...character, id }, loadout: preset, learnedSkills: {} })
    const report = simulateShaoshiRaid('raid-status-gear', [
      fighter('a', { ...loadout, ...wineGear, outerSkillId: claw.id, lightSkillId: 'shunxi_qianli' }),
      fighter('b', { ...loadout, ...boneGear }),
      fighter('c', loadout),
    ])
    const firstRound = report.events.filter((event) => event.round === 1 && event.targetSlot === 'ENEMY_LEFT')
    const applied = firstRound.find((event) => event.statusApplied === '流血')!
    expect(applied).toMatchObject({ actorSlot: 'ALLY_MAIN', statusRounds: 3 })
    expect(applied.segments).toContainEqual({ type: 'tag', text: '醉仙短打行商套装（4件） · 流血 +1 回合', tone: 'jade' })
    const wearer = firstRound.find((event) => event.actorSlot === 'ALLY_LEFT' && event.type === 'SKILL_CAST')!
    expect(wearer.hpDelta).toBe(-2535)
    expect(wearer.segments).toContainEqual(bonusTag(507))
    const attached = firstRound.find((event) => event.effectSourceId === boneGear.weaponId)!
    expect(attached).toMatchObject({ actorSlot: 'ALLY_LEFT', hpDelta: -31 })
    expect(attached.segments).toContainEqual(bonusTag(6))
    expect(firstRound.filter(hasBonus)).toEqual([wearer, attached])
    expect(firstRound.find((event) => event.type === 'DOT_TICK')).toMatchObject({ actorSlot: 'ALLY_MAIN', hpDelta: -236, statusRounds: 2 })
  })

  it('历练正常配装显示荒山档位和回放中的实际增伤', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats)
      store.trial.maxStageId = 16
      store.trial.stageHours['16'] = TRIAL_PATROL_HOURS[16]
      store.learnedSkills[claw.id] = 1
      store.updateLoadout({ ...loadout, outerSkillId: claw.id })
      for (const id of Object.values(boneGear)) {
        store.ownedItemIds.push(id)
        store.equipItem(id)
      }
      store.inspectById('item', boneGear.headId)
      expect(store.inspectModal?.extra).toContain('【九阴残煞】自身对中毒或流血目标造成的伤害提升 25%')
      store.challengeTrialStage(16)
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual(bonusTag(267))
      expect(logs).toContainEqual(bonusTag(18))
    } finally {
      store.closeBattleStage()
    }
  })
})

it('普通、倍速和跳过回放得到同样的气血、反伤、怒气和战报', () => {
  vi.useFakeTimers()
  try {
    function replay(speed: 1 | 2 | 'skip') {
      const store = newStore('DEMO')
      store.companionAffinity.yideng.recruited = true
      store.updateLoadout({ ...pomiaoPieces, ...nanBei, accId: flaskId, stance: 'TAICHI' })
      if (speed !== 'skip') store.battleSpeed = speed
      store.challengeChapter(5)
      const report = store.activeBattle!
      const healIndex = report.events.findIndex((event) => event.hpDelta && event.hpDelta > 0)
      expect(healIndex).toBeGreaterThan(0)
      expect(report.events.some((event) => event.reflectDelta)).toBe(true)
      expect(report.events.some((event) => event.rageTargetSlot === 'ALLY_MAIN')).toBe(true)
      if (speed === 'skip') {
        store.skipBattleToEnd()
      } else {
        const delay = speed === 1 ? 920 : 480
        vi.advanceTimersByTime(healIndex * delay)
        expect(store.floatingPopups.ALLY_MAIN).toMatchObject({ category: 'heal', text: `+${report.events[healIndex].hpDelta}` })
        vi.advanceTimersByTime((report.events.length - healIndex) * delay)
      }
      expect(store.isBattlePlaying).toBe(false)
      const result = {
        units: Object.values(store.liveUnitStates).map(({ hp, maxHp, rage }) => ({ hp, maxHp, rage })),
        logs: store.logs.filter((entry) => entry.channel === 'BATTLE').map((entry) => entry.segments),
      }
      store.closeBattleStage()
      return result
    }
    const normal = replay(1)
    expect(replay(2)).toEqual(normal)
    expect(replay('skip')).toEqual(normal)
  } finally {
    vi.useRealTimers()
  }
})
