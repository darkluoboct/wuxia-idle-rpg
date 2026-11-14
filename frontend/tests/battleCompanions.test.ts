import { describe, expect, it } from 'vitest'
import type { BattleEventDTO, BattleReportDTO, LoadoutPresetDTO } from '@/network/protocol'
import {
  computeCompanionDerivedStats,
  computeDerivedStats,
  innerPressure,
  simulateShaoshiRaid,
  strikeDamage,
} from '../../shared/battle.ts'
import {
  applyDirectedDamage,
  lethalSavesFrom,
  resolveBattleLoadout,
  resolveCompanionEquipment,
  type EnemyBattleState,
} from '../../shared/battleEffects.ts'
import { activeSetBonuses, COMPANIONS, companionView, ITEMS, totalCompanionSetBonuses } from '../../shared/gameData.ts'
import { trialPartId, trialStageOf } from '../../shared/trialStages.ts'
import { newStore } from './helpers'
import { player, loadout, nanBei, enemy, baseCompanion, fight, effectEvents, mainUnit, mainCast, equipped } from './battleFixtures'

describe('僧鞋提速与鹿皮靴伙伴合击', () => {
  const monkBoots = trialPartId('fahua_zuyi', 'BOOTS')
  const deerBoots = trialPartId('baituo_zheshan', 'BOOTS')

  it('僧鞋按含身法在内的出手速度提高 3%，实战可抢过 160 速度的对手', () => {
    const base = computeDerivedStats({ ...player, stats: { ...player.stats, agi: 18 } }, loadout)
    const wearing = { ...loadout, bootsId: monkBoots }
    expect(computeDerivedStats(player, wearing).speed).toBe(Math.round((100 + 18 * 3.2) * 1.03))
    expect(base.speed).toBeLessThan(160)
    const options = { enemyMain: { ...enemy, combat: { speed: 160 } }, surviveRounds: 1, environment: {} }
    expect(fight({}, options).events.find((event) => event.type === 'SKILL_CAST')?.actorSlot).toBe('ENEMY_MAIN')
    const report = fight(wearing, options)
    expect(report.events.find((event) => event.type === 'SKILL_CAST')?.actorSlot).toBe('ALLY_MAIN')
    expect(effectEvents(report, monkBoots)[0].segments).toContainEqual({ type: 'text', text: ' 试招侠客身法 +18，出手速度 +3%' })
  })

  it('鹿皮靴只给可追击的存活伙伴额外合击，概率与落英护腕相加并记录实际出手', () => {
    const gear = { bootsId: deerBoots, leftCompanionId: 'liuchuxuan' }
    const report = (roll: number, patch: Partial<LoadoutPresetDTO> = {}) => fight({ ...gear, ...patch }, {
      player: { ...player, stats: { ...player.stats, con: 200 } }, enemyMain: { ...enemy, atk: 40 },
      surviveRounds: 2, environment: {}, rng: () => roll,
    })
    const extras = (battle: BattleReportDTO) => battle.events.filter((event) => event.round === 2 && event.type === 'ASSIST_ATTACK')
    expect(extras(report(0.079))).toMatchObject([{ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', effectSourceId: deerBoots }])
    expect(extras(report(0.08))).toHaveLength(0)
    expect(extras(report(0.05, { leftCompanionId: null }))).toHaveLength(0)
    const combined = extras(report(0.229, { wristId: trialPartId('bihai_chaosheng', 'WRIST') }))
    expect(combined).toHaveLength(1)
    expect(combined[0].segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringContaining('额外伙伴合击 23%') }))
    expect(extras(report(0.23, { wristId: trialPartId('bihai_chaosheng', 'WRIST') }))).toHaveLength(0)
  })

  it('少室山僧鞋的出手增量跟随穿戴者，鹿皮靴不增加三位玩家的同招连击', () => {
    const member = (id: string, patch: Partial<LoadoutPresetDTO>, agi: number) => ({
      player: { ...player, id, level: 25, stats: { ...player.stats, con: 320, agi } }, loadout: { ...loadout, ...patch }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('duel-boots', [member('lead', {}, 19), member('left', { bootsId: monkBoots }, 0),
      member('right', { bootsId: deerBoots }, 0)], () => 0.01, {})
    const first = report.events.filter((event) => event.round === 1 && event.type === 'SKILL_CAST' && event.actorSlot.startsWith('ALLY'))
    expect(first.map((event) => event.actorSlot)).toEqual(['ALLY_RIGHT', 'ALLY_LEFT', 'ALLY_MAIN'])
    expect(effectEvents(report, monkBoots).map((event) => event.actorSlot)).toEqual(['ALLY_LEFT'])
    expect(effectEvents(report, deerBoots).some((event) => event.type === 'SKILL_CAST')).toBe(false)
  })
})

describe('伙伴个人装备与套装', () => {
  const partner = 'huangrong'
  const partnerView = companionView(COMPANIONS[partner], { form: 'awakened' })
  const pair = { leftCompanionId: 'luchengfeng', rightCompanionId: partner }
  const changbai = 'changbai_canxian'
  const coat = trialPartId(changbai, 'ARMOR')
  const head = trialPartId(changbai, 'HEAD')
  const hitPartner = { ...enemy, atk: 900, combat: { preferFemaleCompanion: true } } as const
  const rightUnit = (report: BattleReportDTO) => report.units.find((unit) => unit.slot === 'ALLY_RIGHT')!

  it('七个个人槽组成实际穿戴者的套装，面板与实战读取同一份配装', () => {
    const weapon = trialPartId(changbai, 'WEAPON')
    const companionEquipment = { [partner]: { ARMOR: coat, HEAD: head, WRIST: trialPartId(changbai, 'WRIST'),
      BELT: trialPartId(changbai, 'BELT'), BOOTS: trialPartId(changbai, 'BOOTS'), ACC: trialPartId(changbai, 'ACC') } }
    const gear = { ...pair, companionEquipment, companionWeapons: { [partner]: weapon } }
    const preset = { ...loadout, ...gear }
    const stats = computeCompanionDerivedStats(player, preset, partner)!
    const noGear = computeCompanionDerivedStats(player, { ...loadout, ...pair }, partner)!
    expect(resolveCompanionEquipment(preset, partnerView, new Set()).setCounts.get(changbai)).toBe(7)
    const report = fight(gear, { enemyMain: hitPartner, surviveRounds: 1 })
    expect(rightUnit(report)).toMatchObject({ maxHp: stats.maxHp, maxMp: stats.maxMp, weaponName: ITEMS[weapon].name })
    expect(stats.maxHp).toBeGreaterThan(noGear.maxHp + ITEMS[coat].hpBonus! + ITEMS[head].hpBonus! + 800)
    expect(stats.atk).toBeGreaterThan(noGear.atk + ITEMS[weapon].atkBonus!)
    expect(mainUnit(report).maxHp).toBe(mainUnit(fight(pair)).maxHp)
  })

  it('长白两件加成与回合末自愈按穿戴者计算，左右翼各两件不会凑出四件', () => {
    const gear = { ...pair, companionEquipment: {
      [partner]: { ARMOR: coat, HEAD: head },
      luchengfeng: { WRIST: trialPartId(changbai, 'WRIST'), BELT: trialPartId(changbai, 'BELT') },
    } }
    const report = fight(gear, { enemyMain: hitPartner })
    const single = fight({ ...pair, companionEquipment: { [partner]: { ARMOR: coat } } }, { enemyMain: hitPartner })
    expect(rightUnit(report).maxHp - rightUnit(single).maxHp).toBe(950 + 800)
    expect(effectEvents(report, coat)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', hpDelta: 60 },
      { round: 2, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', hpDelta: 60 },
    ])
    expect(effectEvents(single, coat).map((event) => event.hpDelta)).toEqual([40, 40])
    expect(effectEvents(report, changbai).every((event) => event.hpDelta === undefined)).toBe(true)
  })

  it('软猬甲只由实际承受近战的伙伴反伤并按该伙伴攻击力施毒', () => {
    const armor = 'ruanwei_armor'
    const gear = { ...pair, companionEquipment: { [partner]: { ARMOR: armor } } }
    const melee = fight(gear, { enemyMain: hitPartner, surviveRounds: 1 })
    const stats = computeCompanionDerivedStats(player, { ...loadout, ...gear }, partner)!
    expect(effectEvents(melee, armor)).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', hpDelta: -405, statusApplied: '软猬剧毒', statusRounds: 2 },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', type: 'DOT_TICK', hpDelta: -Math.round(stats.atk * 0.1) },
    ])
    const ranged = fight(gear, { enemyMain: { ...hitPartner, combat: { ...hitPartner.combat, weapon: { form: 'BOW', tier: 'blue' } } }, surviveRounds: 1 })
    expect(effectEvents(ranged, armor)).toEqual([])
    expect(effectEvents(fight(gear, { surviveRounds: 1 }), armor)).toEqual([])
  })

  it('北斗四件以穿戴伙伴的内力给存活全队发盾，实际受击伙伴扣自己的盾', () => {
    const beidou = 'quanzhen_beidou'
    const gear = { ...pair, companionEquipment: { [partner]: {
      HEAD: trialPartId(beidou, 'HEAD'), WRIST: trialPartId(beidou, 'WRIST'),
      BELT: trialPartId(beidou, 'BELT'), ACC: trialPartId(beidou, 'ACC'),
    } } }
    const report = fight(gear, { enemyMain: { ...hitPartner, atk: 250 }, surviveRounds: 1 })
    const shield = Math.round(Math.round(rightUnit(report).maxMp * 0.2) * 1.10)
    expect(shield).toBe(792)
    expect(effectEvents(report, beidou).filter((event) => (event.shieldDelta ?? 0) > 0)).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_LEFT', shieldDelta: shield },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_MAIN', shieldDelta: shield },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT', shieldDelta: shield },
    ])
    expect(report.events.find((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN')).toMatchObject({
      targetSlot: 'ALLY_RIGHT', hpDelta: 0, shieldAbsorbed: expect.any(Number),
    })
  })

  it('密宗四件由吃到暴击的伙伴反弹朱砂血毒，普攻与主角承伤时不触发', () => {
    const mizong = 'xiyu_mizong'
    const gear = { ...pair, companionEquipment: { [partner]: {
      HEAD: trialPartId(mizong, 'HEAD'), ARMOR: trialPartId(mizong, 'ARMOR'),
      WRIST: trialPartId(mizong, 'WRIST'), BELT: trialPartId(mizong, 'BELT'),
    } } }
    const reflect = (report: BattleReportDTO) => effectEvents(report, mizong).filter((event) => (event.hpDelta ?? 0) < 0)
    const critical = fight(gear, { enemyMain: { ...hitPartner, combat: { ...hitPartner.combat, crit: 100 } }, surviveRounds: 1 })
    expect(reflect(critical)).toMatchObject([{ actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', hpDelta: -225 }])
    expect(reflect(fight(gear, { enemyMain: hitPartner, surviveRounds: 1 }))).toEqual([])
    expect(reflect(fight(gear, { enemyMain: { ...hitPartner, combat: { crit: 100 } }, surviveRounds: 1 }))).toEqual([])
  })

  it('其他人叠满毒时，由实际穿戴白驼六件的伙伴引爆', () => {
    const set = 'baituo_yushe'
    const gear = {
      leftCompanionId: 'luchengfeng', rightCompanionId: 'ouyangke', weaponId: 'lingshe_zhang', outerSkillId: 'lingshe_quan',
      companionEquipment: { luchengfeng: { HEAD: trialPartId(set, 'HEAD'), ARMOR: trialPartId(set, 'ARMOR'),
        WRIST: trialPartId(set, 'WRIST'), BELT: trialPartId(set, 'BELT'), BOOTS: trialPartId(set, 'BOOTS'), ACC: trialPartId(set, 'ACC') } },
    }
    const report = fight(gear, { player: { ...player, currentSectId: 'baituo', sectRank: 1 }, surviveRounds: 1 })
    const bursts = effectEvents(report, set).filter((event) => (event.hpDelta ?? 0) < 0)
    expect(bursts).toMatchObject([{ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', round: 1 }])
    expect(bursts[0].segments).toContainEqual({ type: 'damage', category: 'true', value: -bursts[0].hpDelta! })
    expect(effectEvents(report, set).filter((event) => event.statusRemoved).every((event) => event.actorSlot === 'ALLY_LEFT')).toBe(true)
  })

  it('横练锁血和反震按伙伴的气血与防御结算，同一穿戴者只锁血一次', () => {
    const henglian = 'henglian_tongjia'
    const gear = { ...pair, companionEquipment: { [partner]: {
      HEAD: trialPartId(henglian, 'HEAD'), ARMOR: trialPartId(henglian, 'ARMOR'),
      WRIST: trialPartId(henglian, 'WRIST'), BELT: trialPartId(henglian, 'BELT'),
    } } }
    const report = fight(gear, { enemyMain: { ...hitPartner, atk: 50_000 }, rng: () => 0.99 })
    const stats = computeCompanionDerivedStats(player, { ...loadout, ...gear }, partner)!
    const events = effectEvents(report, henglian).filter((event) => event.segments.some((segment) =>
      segment.type === 'tag' && / · (免死|反震)$/.test(segment.text)))
    expect(events).toMatchObject([
      { round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_RIGHT' },
      { round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', hpDelta: -Math.round(stats.def * 1.5) },
    ])
    expect(report.events[report.events.indexOf(events[0]) - 1]).toMatchObject({ targetSlot: 'ALLY_RIGHT', hpDelta: 1 - stats.maxHp })
    expect(report.events.find((event) => event.round === 2 && event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN'))
      .toMatchObject({ targetSlot: 'ALLY_RIGHT', hpDelta: -1 })
  })

  it('伙伴西征两件将全队属性计入主角面板，重复分配的装备以主角穿戴为准', () => {
    const west = 'xizheng_jindao'
    const belt = trialPartId(west, 'BELT')
    const gear = { ...pair, companionEquipment: { [partner]: { HEAD: trialPartId(west, 'HEAD'), BELT: belt } } }
    const bare = computeDerivedStats(player, { ...loadout, ...pair })
    const boosted = computeDerivedStats(player, { ...loadout, ...gear })
    expect(boosted).toMatchObject({ atk: bare.atk + 200, maxHp: bare.maxHp + 2000, def: Math.round(bare.def * 1.1) })
    expect(mainUnit(fight(gear)).maxHp).toBe(boosted.maxHp)
    expect(mainUnit(fight({ ...gear, beltId: belt })).maxHp).toBe(bare.maxHp + ITEMS[belt].hpBonus!)
  })

  it('试玩可在三人间移交同一件装备，换配装可恢复该档的穿戴状态', () => {
    const store = newStore('DEMO')
    try {
      for (const id of [partner, 'guojing']) store.companionAffinity[id].recruited = true
      store.ownedItemIds.push(coat, head)
      store.updateLoadout({ ...loadout, leftCompanionId: 'guojing', rightCompanionId: partner })
      store.equipItem(coat)
      store.equipCompanionItem(partner, 'ARMOR', coat)
      store.equipCompanionItem(partner, 'HEAD', head)
      expect(store.currentLoadout).toMatchObject({ armorId: null, companionEquipment: { [partner]: { ARMOR: coat, HEAD: head } } })
      store.equipCompanionItem('guojing', 'ARMOR', coat)
      expect(store.currentLoadout.companionEquipment).toEqual({ [partner]: { HEAD: head }, guojing: { ARMOR: coat } })
      store.switchLoadout(2)
      expect(store.currentLoadout.companionEquipment?.guojing).toBeUndefined()
      store.switchLoadout(1)
      expect(store.currentLoadout.companionEquipment).toEqual({ [partner]: { HEAD: head }, guojing: { ARMOR: coat } })
      store.equipCompanionItem(partner, 'HEAD', null)
      expect(store.currentLoadout.companionEquipment).toEqual({ guojing: { ARMOR: coat } })
      store.updateLoadout({ leftCompanionId: null })
      expect(store.currentLoadout.companionEquipment).toEqual({})
      expect(store.ownedItemIds).toEqual(expect.arrayContaining([coat, head]))
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('伙伴专属协战', () => {
  it('梅超风只追击主角已命中的存活目标，白骨爪撕盾和流血沿用同一招式', () => {
    const gear = { leftCompanionId: 'meichaofeng' }
    const guard = { ...enemy, combat: { openingShield: 5000 } }
    const report = fight(gear, { enemyGuards: [guard] })
    const attacks = report.events.filter((event) => event.actorSlot === 'ALLY_LEFT' && event.type === 'ASSIST_ATTACK')
    expect(attacks).toMatchObject([
      { round: 1, skillId: 'jiuyin_baiguzhua', targetSlot: 'ENEMY_LEFT', hpDelta: 0 },
      { round: 2, skillId: 'jiuyin_baiguzhua', targetSlot: 'ENEMY_MAIN' },
    ])
    expect(attacks[0].shieldDelta).toBe(-(attacks[0].shieldAbsorbed! * 2))
    expect(effectEvents(report, 'jiuyin_baiguzhua')).toContainEqual(expect.objectContaining({
      round: 1, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', statusApplied: '流血', statusRounds: 2,
    }))
    for (const unavailable of [{ ...enemy, hp: 1 }, { ...enemy, combat: { dodge: 100 } }]) {
      const skipped = fight(gear, { enemyGuards: [unavailable], surviveRounds: 1 })
      expect(skipped.events.some((event) => event.actorSlot === 'ALLY_LEFT' && event.type === 'ASSIST_ATTACK')).toBe(false)
    }
  })

  it('杨铁心未装备原主兵刃也能用回马枪，按当次目标防御结算穿透', () => {
    const report = fight({ leftCompanionId: 'yangtiexin' }, { enemyGuards: [{ ...enemy, combat: { def: 400 } }], surviveRounds: 1 })
    const attack = report.events.find((event) => event.actorSlot === 'ALLY_LEFT' && event.type === 'ASSIST_ATTACK')!
    expect(attack).toMatchObject({ targetSlot: 'ENEMY_LEFT', skillId: 'yangjia_qiang', skillName: '回马枪' })
    expect(attack.segments).toContainEqual({ type: 'tag', text: expect.stringContaining('杨家精钢枪法 · 穿透 80 点防御'), tone: 'gold' })
  })

  it('王处一横扫实际前排，只阻止目标尚未发生的本回合出手', () => {
    const gear = { rightCompanionId: 'wangchuyi' }
    const slow = fight(gear, { enemyMain: { ...enemy, combat: { speed: 90 } } })
    expect(effectEvents(slow, 'wangchuyi')).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_RIGHT', statusApplied: '击退', statusRounds: 1 }))
    expect(slow.events.some((event) => event.round === 1 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')).toBe(false)
    expect(slow.events).toContainEqual(expect.objectContaining({ round: 2, type: 'GUARD_BLOCK', actorSlot: 'ALLY_RIGHT' }))
    const fast = fight(gear, { enemyMain: { ...enemy, combat: { speed: 110 } }, surviveRounds: 1 })
    expect(effectEvents(fast, 'wangchuyi').some((event) => event.statusApplied === '击退')).toBe(false)
    const guarded = fight(gear, { enemyGuards: [{ ...enemy }], surviveRounds: 1 })
    expect(effectEvents(guarded, 'wangchuyi')).toContainEqual(expect.objectContaining({ targetSlot: 'ENEMY_LEFT', statusApplied: '击退' }))
  })

  it('朱子柳命中后减速 20%，第二回合才改变双方出手顺序', () => {
    const report = fight({ rightCompanionId: 'zhuziliu' }, { enemyMain: { ...enemy, combat: { speed: 120 } } })
    expect(effectEvents(report, 'zhuziliu')).toContainEqual(expect.objectContaining({
      round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', statusApplied: '阴寒迟缓', statusRounds: 1,
      segments: expect.arrayContaining([{ type: 'text', text: ` ${enemy.name}阴寒迟缓 20% · 1 回合` }]),
    }))
    const firstCast = (round: number) => report.events.find((event) => event.round === round && event.type === 'SKILL_CAST')?.actorSlot
    expect(firstCast(1)).toBe('ENEMY_MAIN')
    expect(firstCast(2)).toBe('ALLY_MAIN')
  })
})

describe('伙伴治疗、净化和实际援护', () => {
  const heals = (report: BattleReportDTO, source: string) => effectEvents(report, source).filter((event) => (event.hpDelta ?? 0) > 0)
  const enemyHit = (report: BattleReportDTO, round = 1) => report.events.find((event) =>
    event.round === round && event.actorSlot === 'ENEMY_MAIN' && event.targetSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!

  it('马钰只回复主角，并在第一场有效封穴后立即驱散一次', () => {
    const report = fight({ leftCompanionId: 'munianci', rightCompanionId: 'mayu' }, { enemyMain: { ...enemy,
      combat: { speed: 130, statusOnHit: { status: 'SEAL', rounds: 1 } } }, surviveRounds: 3 })
    const cast = report.events.find((event) => event.statusApplied === '封穴' && event.targetSlot === 'ALLY_MAIN')!
    const cleared = effectEvents(report, 'mayu').filter((event) => event.statusRemoved === '封穴')
    expect(cleared).toMatchObject([{ round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_MAIN', statusRounds: 0 }])
    expect(report.events.indexOf(cleared[0])).toBeGreaterThan(report.events.indexOf(cast))
    expect(report.events.indexOf(cleared[0])).toBeLessThan(report.events.indexOf(mainCast(report)))
    expect(report.events.some((event) => event.round === 2 && event.statusApplied === '封穴' && event.targetSlot === 'ALLY_MAIN')).toBe(true)
    expect(heals(report, 'mayu')).toMatchObject([1, 2, 3].map((round) => ({
      round, actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_MAIN', hpDelta: Math.round(mainUnit(report).maxHp * 0.03),
    })))
  })

  it('一灯独立治疗存活队友且以缺失气血封顶，第三回合只封敌方主力', () => {
    const report = fight({ leftCompanionId: 'munianci', rightCompanionId: 'yideng' }, {
      enemyMain: { ...enemy, atk: 650 }, enemyGuards: [{ ...enemy }], surviveRounds: 3,
    })
    const damage = effectEvents(report, 'munianci').find((event) => event.round === 1 && event.targetSlot === 'ALLY_LEFT')!
    expect(damage.hpDelta).toBeLessThan(0)
    expect(heals(report, 'yideng').filter((event) => event.round === 1)).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_LEFT', hpDelta: -damage.hpDelta! },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_MAIN', hpDelta: Math.round(mainUnit(report).maxHp * 0.04) },
    ])
    expect(effectEvents(report, 'yideng').filter((event) => event.statusApplied === '封穴')).toMatchObject([
      { round: 3, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', statusRounds: 1 },
    ])
    const bonded = fight(nanBei, { surviveRounds: 1 })
    expect(heals(bonded, 'yideng')).toEqual([])
    expect(heals(bonded, 'nan_bei')).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ALLY_MAIN', hpDelta: Math.round(mainUnit(bonded).maxHp * 0.06) },
    ])
  })

  it('孙不二的清静剑只降低命中目标下回合的暴击概率', () => {
    const options = { enemyMain: { ...enemy, combat: { crit: 90 } }, surviveRounds: 2 }
    const baseline = fight({ rightCompanionId: 'zhuziliu' }, options)
    const report = fight({ rightCompanionId: 'sunbuer' }, options)
    expect(enemyHit(report)).toMatchObject({ hitResult: 'CRIT' })
    expect(effectEvents(report, 'sunbuer').find((event) => event.statusApplied === '暴击降低')).toMatchObject({
      round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', statusRounds: 1,
      segments: expect.arrayContaining([{ type: 'text', text: ` ${enemy.name}暴击降低 20 个百分点 · 1 回合` }]),
    })
    expect(baseline.events.find((event) => event.type === 'GUARD_BLOCK')).toMatchObject({ round: 2, hitResult: 'CRIT' })
    const guarded = report.events.find((event) => event.type === 'GUARD_BLOCK')!
    expect(guarded.round).toBe(2)
    expect(guarded.hitResult).toBeUndefined()
  })

  it.each([['munianci', 30], ['tanchuduan', 20], ['luchengfeng', 20]] as const)(
    '%s 以实际扣盾后伤害的 %s%% 援护，并独立扣血', (id, percent) => {
      const options = { enemyMain: { ...enemy, atk: 650 }, enemyGuards: [{ ...enemy }], surviveRounds: 1 }
      const baseline = fight({}, options)
      const report = fight({ leftCompanionId: id }, options)
      const raw = -enemyHit(baseline).hpDelta!
      const shared = Math.round(raw * percent / 100)
      expect(enemyHit(report)).toMatchObject({ hpDelta: -(raw - shared) })
      expect(effectEvents(report, id)).toContainEqual(expect.objectContaining({
        actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_LEFT', hpDelta: -shared,
      }))
      if (id === 'munianci') expect(effectEvents(report, id)).toContainEqual(expect.objectContaining({
        actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', type: 'ASSIST_ATTACK', skillId: 'xiaoyaoyou_quan',
      }))
      if (id === 'luchengfeng') expect(effectEvents(report, 'luoying_zhang').filter((event) => event.statusApplied === '命中降低'))
        .toMatchObject([{ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT' }, { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN' }])
    },
  )

  it('柯镇恶仅代承一次实际致死，实际装备护盾与锁血优先结算', () => {
    const gear = { rightCompanionId: 'kezhene' }
    const enemyMain = { ...enemy, atk: 1800 }
    const report = fight(gear, { enemyMain, surviveRounds: 3, rng: () => 0.99 })
    expect(enemyHit(report)).toMatchObject({ hpDelta: 0 })
    expect(effectEvents(report, 'kezhene').filter((event) => event.targetSlot === 'ALLY_RIGHT' && (event.hpDelta ?? 0) < 0))
      .toMatchObject([{ round: 1, actorSlot: 'ENEMY_MAIN', hpDelta: expect.any(Number) }])
    expect(effectEvents(report, 'kezhene').filter((event) => event.statusApplied)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', statusApplied: '命中降低' },
      { round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', statusApplied: '暗器针毒', statusRounds: 2 },
    ])
    const fox = fight({ ...gear, accId: 'jiuwei_fox' }, { enemyMain: { ...enemy, atk: 8000 }, surviveRounds: 1 })
    expect(effectEvents(fox, 'jiuwei_fox').some((event) => (event.hpDelta ?? 0) > 0)).toBe(true)
    expect(effectEvents(fox, 'kezhene').some((event) => event.statusApplied === '命中降低')).toBe(false)
    const covered = fight({ ...gear, ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']) }, { surviveRounds: 1 })
    expect(enemyHit(covered)).toMatchObject({ hpDelta: 0, shieldAbsorbed: expect.any(Number) })
    expect(effectEvents(covered, 'kezhene')).toEqual([])
  })

  it('王重阳独立代承后由实际站位净化全队封穴与中毒', () => {
    const report = fight({ leftCompanionId: 'wangchongyang', rightCompanionId: 'zhebie' }, { enemyMain: { ...enemy, atk: 2000, combat: {
      statusPulse: { every: 1, name: '试招封穴', rule: { status: 'SEAL', rounds: 2 } },
      periodicOnHit: { status: 'needlePoison', rounds: 2, attackPercent: 10 },
    } }, surviveRounds: 1 })
    const cleared = effectEvents(report, 'wangchongyang').filter((event) => event.statusRemoved)
    expect(cleared).toMatchObject([
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_LEFT', statusRemoved: '封穴' },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_LEFT', statusRemoved: '扇骨针毒' },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_MAIN', statusRemoved: '封穴' },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_RIGHT', statusRemoved: '封穴' },
    ])
    expect(enemyHit(report).hpDelta).toBe(0)
    expect(report.events.some((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_LEFT')).toBe(false)
  })

  it('觉醒黄蓉在偶数回合接走盾后伤害，北斗护盾分别扣在各自身上', () => {
    const set = 'quanzhen_beidou'
    const gear = { ...equipped(set, ['WEAPON', 'WRIST', 'HEAD', 'ACC']), rightCompanionId: 'huangrong' }
    const report = fight(gear, { enemyMain: { ...enemy, atk: 1300 }, surviveRounds: 3 })
    expect(report.events.find((event) => event.type === 'GUARD_BLOCK')).toMatchObject({ round: 2, hpDelta: -28, shieldAbsorbed: 425 })
    expect(effectEvents(report, 'huangrong')).toContainEqual(expect.objectContaining({
      round: 2, targetSlot: 'ALLY_RIGHT', hpDelta: 0, shieldAbsorbed: 31,
    }))
    expect(effectEvents(report, set)).toContainEqual(expect.objectContaining({ round: 3, targetSlot: 'ALLY_RIGHT', shieldDelta: 31 }))
  })

  it('丘处机保留轻伤后的援护次数，第一次重击由本人接下', () => {
    const gear = { leftCompanionId: 'qiuchuji' }
    const heretic = { alignment: 'HERETIC' as const }
    const weak = fight(gear, { enemyMain: { ...enemy, combat: heretic }, surviveRounds: 1 })
    expect(enemyHit(weak).hpDelta).toBeLessThan(0)
    expect(effectEvents(weak, 'qiuchuji').find((event) => event.targetSlot === 'ALLY_LEFT')).toBeUndefined()
    expect(effectEvents(weak, 'qiuchuji').find((event) => event.type === 'ASSIST_ATTACK')?.segments).toContainEqual({
      type: 'tag', text: expect.stringContaining('长春剑阵 · 克敌增伤'), tone: 'purple',
    })
    const heavy = fight(gear, { enemyMain: { ...enemy, atk: 610, combat: heretic }, surviveRounds: 2 })
    expect(enemyHit(heavy).hpDelta).toBe(0)
    expect(enemyHit(heavy, 2).hpDelta).toBeLessThan(0)
    expect(effectEvents(heavy, 'qiuchuji').filter((event) => event.targetSlot === 'ALLY_LEFT')).toMatchObject([{ round: 1, hpDelta: expect.any(Number) }])
  })
})

describe('伙伴基础与觉醒协战', () => {
  const assists = (report: BattleReportDTO, slot: 'ALLY_LEFT' | 'ALLY_RIGHT') => report.events.filter((event) =>
    event.type === 'ASSIST_ATTACK' && event.actorSlot === slot)

  it('郭靖代承主角的盾后致死攻击并反击实际来袭护卫，觉醒后可连续代承', () => {
    const gear = { leftCompanionId: 'guojing' }
    const options = { enemyMain: { ...enemy, atk: 40 }, enemyGuards: [{ ...enemy, atk: 1850, combat: { joinsRound: true as const, speed: 140 } }], surviveRounds: 2 }
    const base = fight(gear, { ...options, companionOf: baseCompanion })
    const saved = (report: BattleReportDTO) => effectEvents(report, 'guojing').filter((event) => event.actorSlot === 'ENEMY_LEFT' && event.targetSlot === 'ALLY_LEFT')
    expect(saved(base)).toMatchObject([{ round: 1, hpDelta: expect.any(Number) }])
    expect(base.winner).toBe('ENEMY')
    expect(assists(base, 'ALLY_LEFT')).toContainEqual(expect.objectContaining({ round: 1, targetSlot: 'ENEMY_LEFT', skillId: 'xianglong_18' }))
    const awakened = fight(gear, options)
    expect(saved(awakened).map((event) => event.round)).toEqual([1, 2])
    expect(awakened.winner).toBe('ALLY')
  })

  it('基础黄蓉按实际闪避上限布阵，偶数回合封穴，觉醒改用援护', () => {
    const gear = { lightSkillId: 'lingbo_weibu', rightCompanionId: 'huangrong' }
    const options = { player: { ...player, stats: { ...player.stats, agi: 12 } }, rng: () => 0.99 }
    const base = fight(gear, { ...options, companionOf: baseCompanion })
    const opening = effectEvents(base, 'huangrong').find((event) => event.targetSlot === 'ALLY_MAIN' && event.statusApplied === '闪避提高')!
    expect(opening).toMatchObject({ round: 1, actorSlot: 'ALLY_RIGHT', statusRounds: 1 })
    expect(opening.segments).toContainEqual({ type: 'text', text: ' 试招侠客闪避提高 1 个百分点 · 1 回合' })
    expect(base.events).toContainEqual(expect.objectContaining({ round: 1, type: 'DODGE', targetSlot: 'ALLY_MAIN' }))
    expect(effectEvents(base, 'huangrong')).toContainEqual(expect.objectContaining({ round: 2, targetSlot: 'ENEMY_MAIN', statusApplied: '封穴' }))
    const awake = fight(gear, options)
    expect(effectEvents(awake, 'huangrong').some((event) => event.statusApplied === '闪避提高' || event.statusApplied === '封穴')).toBe(false)
  })

  it('基础洪七公助全队增伤、破防并按 35% 追击，南帝北丐保持 20%', () => {
    const gear = { leftCompanionId: 'hongqigong' }
    const options = { surviveRounds: 1, companionOf: baseCompanion, rng: () => 0.3499 }
    const baseline = mainCast(fight({}, options))
    const base = fight(gear, options)
    expect(mainCast(base).hpDelta).toBe(-Math.round(-baseline.hpDelta! * 1.1))
    expect(assists(base, 'ALLY_LEFT')).toHaveLength(2)
    expect(assists(fight(gear, { ...options, rng: () => 0.35 }), 'ALLY_LEFT')).toHaveLength(1)
    const area = fight(gear, { ...options, enemyGuards: [{ ...enemy }] })
    expect(effectEvents(area, 'hongqigong').filter((event) => event.statusApplied === '防御降低').map((event) => event.targetSlot))
      .toEqual(['ENEMY_LEFT', 'ENEMY_MAIN'])
    const paired = mainCast(fight(nanBei, options))
    expect(paired.hpDelta).toBe(-Math.round(-baseline.hpDelta! * 1.2))
    expect(paired.segments.some((segment) => segment.type === 'tag' && segment.text.includes('神龙摆尾'))).toBe(false)
  })

  it('基础黄药师点杀实际残血目标，击杀后仍对其他存活敌人施加迟缓', () => {
    const report = fight({ rightCompanionId: 'huangyaoshi' }, { player: { ...player, stats: { ...player.stats, str: 270 } },
      enemyGuards: [{ ...enemy, hp: 1700, combat: { def: 400 } }], companionOf: baseCompanion, surviveRounds: 1 })
    expect(assists(report, 'ALLY_RIGHT')).toMatchObject([{ targetSlot: 'ENEMY_LEFT', hpDelta: -404 }])
    expect(assists(report, 'ALLY_RIGHT')[0].segments).toContainEqual({ type: 'tag', text: '弹指神通·初 · 残血点杀 · 外功增伤 +2', tone: 'purple' })
    expect(effectEvents(report, 'huangyaoshi')).toContainEqual(expect.objectContaining({ targetSlot: 'ENEMY_MAIN', statusApplied: '阴寒迟缓' }))
  })

  it('周伯通独立免疫混乱，基础互搏 25%，觉醒命中后跟进两拳', () => {
    const gear = { leftCompanionId: 'zhoubotong' }
    const options = { surviveRounds: 1, companionOf: baseCompanion }
    expect(assists(fight(gear, { ...options, rng: () => 0.2499 }), 'ALLY_LEFT').map((event) => event.skillId))
      .toEqual(['shuangshou_hubo', 'shuangshou_hubo'])
    expect(assists(fight(gear, { ...options, rng: () => 0.25 }), 'ALLY_LEFT')).toHaveLength(1)
    const awake = fight(gear, { surviveRounds: 1, rng: () => 0.99 })
    expect(assists(awake, 'ALLY_LEFT').map((event) => event.skillId)).toEqual(['shuangshou_hubo', 'shuangshou_hubo'])
    expect(assists(fight(gear, { enemyMain: { ...enemy, combat: { dodge: 100 } }, surviveRounds: 1 }), 'ALLY_LEFT')).toEqual([])
    const confused = fight(gear, { ...options, enemyMain: { ...enemy, combat: { statusPulse: {
      every: 1, name: '试招惑心', rule: { status: 'CONFUSION', rounds: 1 },
    } } } })
    expect(confused.events.filter((event) => event.statusApplied === '心神混乱').map((event) => event.targetSlot)).toEqual(['ALLY_MAIN'])
  })

  it('欧阳锋三次常规协战蓄满，第四击翻倍击退，觉醒独立施蛇毒', () => {
    const gear = { leftCompanionId: 'ouyangfeng' }
    const options = { enemyMain: { ...enemy, hp: 70_000, atk: 40 }, surviveRounds: 5 }
    const base = fight(gear, { ...options, companionOf: baseCompanion })
    expect(effectEvents(base, 'ouyangfeng').filter((event) => event.statusApplied === '蛤蟆劲' || event.statusRemoved === '蛤蟆劲')
      .map((event) => event.statusStacks)).toEqual([1, 2, 3, 0, 1])
    const fourth = assists(base, 'ALLY_LEFT').find((event) => event.round === 4)!
    expect(fourth.hpDelta).toBe(-strikeDamage(Math.round(baseCompanion('ouyangfeng').baseAtk * 1.04), 1.28 * 2, 1, 1, false, 4))
    expect(effectEvents(base, 'ouyangfeng')).toContainEqual(expect.objectContaining({ round: 4, targetSlot: 'ENEMY_MAIN', statusApplied: '击退' }))
    expect(effectEvents(base, 'ouyangfeng').some((event) => event.statusApplied === '灵蛇剧毒')).toBe(false)
    const awake = fight(gear, options)
    expect(effectEvents(awake, 'ouyangfeng')).toContainEqual(expect.objectContaining({ round: 1, targetSlot: 'ENEMY_MAIN', statusApplied: '灵蛇剧毒', statusRounds: 2 }))
  })

  it('杨康首个协战先出全真剑再出白骨爪，后续协战只用白骨爪', () => {
    const report = fight({ leftCompanionId: 'yangkang' }, { surviveRounds: 3 })
    expect(assists(report, 'ALLY_LEFT').map(({ round, skillId }) => [round, skillId]))
      .toEqual([[1, 'quanzhen_jianfa'], [1, 'jiuyin_baiguzhua'], [3, 'jiuyin_baiguzhua']])
  })

  it('瑛姑独立选择实际威力最高的蓄力护卫并使其落空，主将仍出手', () => {
    const report = fight({ rightCompanionId: 'yinggu' }, { enemyMain: { ...enemy, atk: 100 }, enemyGuards: [{ ...enemy, atk: 80,
      combat: { joinsRound: true, charge: { round: 2, name: '护卫试招', damageMultiplier: 3 } } }], surviveRounds: 3 })
    expect(effectEvents(report, 'yinggu').filter((event) => event.statusApplied === '命中降低')).toMatchObject([
      { round: 3, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', statusRounds: 1 },
    ])
    expect(report.events).toContainEqual(expect.objectContaining({ round: 3, actorSlot: 'ENEMY_LEFT', skillName: '护卫试招', hitResult: 'MISS', hpDelta: 0 }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 3, actorSlot: 'ENEMY_MAIN', type: 'SKILL_CAST', hitResult: 'HIT' }))
  })
})

describe('收集羁绊统一计算', () => {
  const totals = (recruited: string[]) => totalCompanionSetBonuses(activeSetBonuses((id) => recruited.includes(id)))

  it('每套按已招募人数只取最高档，三套按属性分别相加', () => {
    expect(totals(['mayu', 'tanchuduan', 'qiuchuji', 'yideng', 'hongqigong', 'munianci', 'yangtiexin']))
      .toEqual({ hpPct: 4, atkPct: 4, idleQiPct: 10 })
    expect(totals(['mayu', 'tanchuduan', 'qiuchuji', 'wangchuyi', 'sunbuer', 'yideng', 'hongqigong', 'huangyaoshi',
      'ouyangfeng', 'wangchongyang', 'munianci', 'yangtiexin', 'yangkang']))
      .toEqual({ hpPct: 23, atkPct: 21, idleQiPct: 20 })
  })

  it('少室山只为实际拥有羁绊的玩家计入面板和攻击', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 45, con: 65 } }
    const collection = totals(['yideng', 'hongqigong', 'huangyaoshi'])
    const fighter = (id: string, bonus?: typeof collection) => ({ player: { ...character, id }, loadout, learnedSkills: {}, bonus })
    const report = simulateShaoshiRaid('collection-test', [fighter('a', collection), fighter('b'), fighter('c')], () => 0.99)
    const boosted = computeDerivedStats(character, loadout, collection)
    const ordinary = computeDerivedStats(character, loadout)
    expect(report.units.find((unit) => unit.id === 'a')?.maxHp).toBe(boosted.maxHp)
    expect(report.units.find((unit) => unit.id === 'b')?.maxHp).toBe(ordinary.maxHp)
    const normal = simulateShaoshiRaid('collection-baseline', [fighter('a'), fighter('b'), fighter('c')], () => 0.99)
    const first = (source: BattleReportDTO) => source.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!
    expect(first(report).hpDelta).toBeLessThan(first(normal).hpDelta!)
  })
})

describe('三人分摊、伙伴选敌与羁绊', () => {
  const set = 'quanzhen_beidou'
  const gear = {
    weaponId: trialPartId(set, 'WEAPON'), headId: trialPartId(set, 'HEAD'), armorId: trialPartId(set, 'ARMOR'),
    wristId: trialPartId(set, 'WRIST'), beltId: trialPartId(set, 'BELT'), accId: trialPartId(set, 'ACC'),
  }
  const family = { leftCompanionId: 'munianci', rightCompanionId: 'yangtiexin' }
  const oyk = { ...trialStageOf(14)!.boss, hp: 100_000, mp: 500 }
  const incoming = (report: BattleReportDTO) => report.events.filter((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')
  const shares = (report: BattleReportDTO) => effectEvents(report, set).filter((event) => event.actorSlot.startsWith('ENEMY'))

  it('天罡北斗阵先招架再均摊，每位接收者独立扣盾，直接受击者回怒', () => {
    const options = { player: { ...player, stats: { ...player.stats, intStat: 1 } }, enemyMain: { ...enemy, atk: 7000 } }
    const trio = { leftCompanionId: 'kezhene', rightCompanionId: 'zhebie' }
    const report = fight({ ...gear, ...trio, ultSkillId: 'yiyang_zhi' }, options)
    expect(incoming(report)[0]).toMatchObject({ hitResult: 'PARRY', targetSlot: 'ALLY_MAIN', hpDelta: -84, shieldAbsorbed: 402, rageDelta: 15 })
    expect(shares(report).filter((event) => event.round === 1)).toMatchObject([
      { targetSlot: 'ALLY_LEFT', hpDelta: -83, shieldAbsorbed: 402 },
      { targetSlot: 'ALLY_RIGHT', hpDelta: -83, shieldAbsorbed: 402 },
    ])
    expect(report.events.find((event) => event.round === 2 && event.type === 'GUARD_BLOCK'))
      .toMatchObject({ rageTargetSlot: 'ALLY_MAIN', rageDelta: 20 })
    expect(shares(fight(gear, options))).toEqual([])

    const fell = fight({ ...gear, ...trio }, { ...options, enemyMain: { ...enemy, atk: 100_000 } })
    expect(shares(fell).map((event) => event.round)).toEqual([1, 1])
  })

  it('少室山按实际承伤者的减伤、盾值和怒气结算阵法，同一击只分摊一次', () => {
    const member = (id: string, patch: Partial<LoadoutPresetDTO>, intStat = 10) => ({
      player: { ...player, id, stats: { ...player.stats, intStat } },
      loadout: { ...loadout, ...patch }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-formation', [
      member('lead', {}), member('left', { armorId: 'wucan_baoyi' }), member('right', gear, 13),
    ], () => 0.99)
    const first = report.events.filter((event) => event.round === 1 && event.actorSlot === 'ENEMY_LEFT' && event.targetSlot?.startsWith('ALLY'))
    expect(first).toMatchObject([
      { targetSlot: 'ALLY_MAIN', shieldAbsorbed: 216, hpDelta: 0, rageTargetSlot: 'ALLY_MAIN', rageDelta: 15 },
      { targetSlot: 'ALLY_LEFT', shieldAbsorbed: 140, hpDelta: 0 },
      { targetSlot: 'ALLY_RIGHT', shieldAbsorbed: 215, hpDelta: 0 },
    ])
    expect(first.slice(1).every((event) => !event.rageDelta)).toBe(true)
    expect(incoming(report)[0]).toMatchObject({ targetSlot: 'ALLY_RIGHT', hitResult: 'PARRY' })
  })

  it('分摊伤害按实际接收者独立消耗保命次数，盾全挡保留额度', () => {
    const report = fight({})
    const unit = mainUnit(report)
    const attacker: EnemyBattleState = { unit: report.units.find((entry) => entry.slot === 'ENEMY_MAIN')!, shield: 0, atk: 250 }
    const { effects } = resolveBattleLoadout({ ...loadout, accId: 'jiuwei_fox' })
    const first = { fighter: { unit, shield: 100 }, hp: 50, defense: 0, effects, saves: lethalSavesFrom(effects) }
    const second = { ...first, fighter: { unit: { ...unit, slot: 'ALLY_LEFT' as const }, shield: 0 }, saves: lethalSavesFrom(effects) }
    const source = { sourceId: set, sourceName: '天罡北斗阵' }
    const contact = { source, attacker, attackerHp: 1000, damage: 100, round: 1 }
    const events: BattleEventDTO[] = []
    expect(applyDirectedDamage(first, contact, events).hp).toBe(50)
    expect(first.saves).toHaveLength(1)
    expect(applyDirectedDamage(second, contact, events).hp).toBeGreaterThan(0)
    expect(second.saves).toHaveLength(0)
    expect(first.saves).toHaveLength(1)
    expect(applyDirectedDamage(first, contact, events).hp).toBeGreaterThan(0)
    expect(first.saves).toHaveLength(0)
  })

  it.each([
    [family, 'ALLY_LEFT', 'ALLY_RIGHT'],
    [{ leftCompanionId: 'yangtiexin', rightCompanionId: 'munianci' }, 'ALLY_RIGHT', 'ALLY_LEFT'],
  ] as const)('父女同心按实际站位代承一次，欧阳克优先攻击穆念慈', (pair, protectedSlot, substituteSlot) => {
    const report = fight(pair, { enemyMain: { ...oyk, atk: 50_000 } })
    expect(incoming(report)).toMatchObject([
      { round: 1, targetSlot: protectedSlot, hpDelta: 0 },
      { round: 2, targetSlot: protectedSlot, hpDelta: expect.any(Number) },
    ])
    const substitute = report.units.find((unit) => unit.slot === substituteSlot)!
    expect(effectEvents(report, 'fu_nv_tong_xin')).toMatchObject([{ round: 1, targetSlot: substituteSlot, hpDelta: -substitute.maxHp }])
  })

  it('父女同心在护盾全挡时保留次数，后续致死由另一方带着自身护盾代承', () => {
    const report = fight({ ...gear, armorId: null, beltId: null, ...family }, {
      enemyMain: { ...oyk, atk: 250, combat: { ...oyk.combat, charge: { round: 2, name: '重击', damageMultiplier: 60 } } },
      surviveRounds: 3,
    })
    expect(incoming(report)[0]).toMatchObject({ round: 1, targetSlot: 'ALLY_LEFT', shieldAbsorbed: 205, hpDelta: 0 })
    expect(effectEvents(report, 'fu_nv_tong_xin')).toMatchObject([{ round: 3, targetSlot: 'ALLY_RIGHT', shieldAbsorbed: 425 }])
  })

  it('欧阳克对右翼黄蓉留手，减伤和落空按黄蓉所在的实际位置', () => {
    const options = { enemyMain: { ...oyk, atk: 250 }, surviveRounds: 4 }
    const right = fight({ leftCompanionId: 'guojing', rightCompanionId: 'huangrong' }, options)
    const left = fight({ leftCompanionId: 'huangrong', rightCompanionId: 'guojing' }, options)
    expect(incoming(right)[0]).toMatchObject({ targetSlot: 'ALLY_RIGHT', hpDelta: -144 })
    expect(incoming(left)[0]).toMatchObject({ targetSlot: 'ALLY_LEFT', hpDelta: -205 })
    expect(incoming(right)[3]).toMatchObject({ hitResult: 'MISS', targetSlot: 'ALLY_RIGHT', hpDelta: 0 })
    expect(incoming(left)[3].hitResult).toBe('HIT')
  })

  it('一生痴缠护住全队，九宫推演由实际位置的瑛姑发动并使反扑落空', () => {
    const enemyMain = { ...enemy, combat: { statusPulse: { every: 1, name: '惑心', rule: { status: 'CONFUSION' as const, rounds: 1 } } } }
    const report = fight({ leftCompanionId: 'yinggu', rightCompanionId: 'zhoubotong' }, { enemyMain })
    expect(report.events.some((event) => event.statusApplied === '心神混乱')).toBe(false)
    const plan = effectEvents(report, 'yi_sheng_chi_chan').find((event) => event.statusApplied === '命中降低')!
    expect(plan).toMatchObject({ round: 2, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN' })
    expect(incoming(report)[1]).toMatchObject({ round: 2, hitResult: 'MISS', hpDelta: 0 })
    const unpaired = fight({ leftCompanionId: 'yinggu', rightCompanionId: 'mayu' }, { enemyMain })
    expect(unpaired.events.filter((event) => event.round === 1 && event.statusApplied === '心神混乱')).toHaveLength(3)
    expect(effectEvents(unpaired, 'yi_sheng_chi_chan')).toEqual([])
  })
})

describe('混天气功、江南七怪与白驼驭蛇的出手条件', () => {
  const huntian = { innerSkillId: 'huntian_qigong' }
  const jiangnan = 'jiangnan_qiguai'
  const baituo = 'baituo_yushe'
  const jiangnanGear = {
    headId: trialPartId(jiangnan, 'HEAD'), armorId: trialPartId(jiangnan, 'ARMOR'),
    wristId: trialPartId(jiangnan, 'WRIST'), accId: trialPartId(jiangnan, 'ACC'),
  }
  const baituoGear = { headId: trialPartId(baituo, 'HEAD'), accId: trialPartId(baituo, 'ACC') }
  const poisonGear = { ...baituoGear, armorId: 'ruanwei_armor' }
  const baituoWithoutVenom = { headId: baituoGear.headId, beltId: trialPartId(baituo, 'BELT') }
  const mainCasts = (report: BattleReportDTO) => report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
  const huntianTag = (extra: number) => ({ type: 'tag', text: `混天气功 · 外功增伤 +${extra}`, tone: 'purple' })
  const jiangnanTag = (extra: number) => ({
    type: 'tag', text: `江南七怪降魔套装（4件） · 对刚猛增伤 +${extra}`, tone: 'purple',
  })
  const baituoTag = (points: number, percent: number) => ({
    type: 'tag', text: `白驼驭蛇奇毒套装（2件） · 暴击率 +${points} 个百分点（本次 ${percent}%）`, tone: 'gold',
  })
  const hasTag = (event: BattleEventDTO, text: string) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes(text))

  it('混天气功严格低于半血才增强外功，战报显示盾后实扣增量', () => {
    const half = fight(huntian, { enemyMain: { ...enemy, atk: 564 } })
    expect(mainUnit(half).maxHp).toBe(934)
    expect(half.events.find((event) => event.actorSlot === 'ENEMY_MAIN')).toMatchObject({ hpDelta: -467 })
    expect(mainCasts(half)[1].hpDelta).toBe(-147)
    expect(hasTag(mainCasts(half)[1], '混天气功 · 外功增伤')).toBe(false)

    const below = fight(huntian, { enemyMain: { ...enemy, atk: 565 } })
    expect(below.events.find((event) => event.actorSlot === 'ENEMY_MAIN')).toMatchObject({ hpDelta: -468 })
    expect(mainCasts(below)[1].hpDelta).toBe(-176)
    expect(mainCasts(below)[1].segments).toContainEqual(huntianTag(29))

    const shielded = fight(huntian, { enemyMain: { ...enemy, atk: 565, combat: { openingShield: 300 } } })
    expect(mainCasts(shielded)[1]).toMatchObject({ hpDelta: -18, shieldAbsorbed: 158, statusRemoved: '护盾' })
    expect(mainCasts(shielded)[1].segments).toContainEqual(huntianTag(18))
    const ultimate = fight({ ...huntian, ultSkillId: 'yiyang_zhi' }, { enemyMain: { ...enemy, atk: 565 } })
    expect(mainCasts(ultimate)[1].skillId).toBe('yiyang_zhi')
    expect(hasTag(mainCasts(ultimate)[1], '混天气功 · 外功增伤')).toBe(false)
  })

  it('九阴吸血越过半血线后，同回合追击按新的气血判定混天气功', () => {
    const jiuyin = 'jiuyin_baigu'
    const gear = {
      ...huntian, outerSkillId: 'shuangshou_hubo',
      weaponId: trialPartId(jiuyin, 'WEAPON'), headId: trialPartId(jiuyin, 'HEAD'),
      wristId: trialPartId(jiuyin, 'WRIST'), accId: trialPartId(jiuyin, 'ACC'),
    }
    const report = fight(gear, { rng: () => 0, enemyMain: { ...enemy, atk: 1450 } })
    expect(mainUnit(report).maxHp).toBe(2384)
    expect(report.events.find((event) => event.actorSlot === 'ENEMY_MAIN')).toMatchObject({ hpDelta: -1200 })
    const [regular, followUp] = mainCasts(report).filter((event) => event.round === 2)
    expect(regular.hpDelta).toBe(-1386)
    expect(regular.segments).toContainEqual(huntianTag(231))
    const regularIndex = report.events.indexOf(regular)
    expect(report.events.slice(regularIndex + 1, report.events.indexOf(followUp)).filter((event) => event.hpDelta)).toMatchObject([
      { effectSourceId: gear.wristId, hpDelta: -204 }, { effectSourceId: jiuyin, hpDelta: 277 },
    ])
    expect(followUp).toMatchObject({ effectSourceId: 'shuangshou_hubo', hpDelta: -1155 })
    expect(hasTag(followUp, '混天气功 · 外功增伤')).toBe(false)
  })

  it('江南四件按实际目标的架势增伤，护盾只让两点额外伤害落到气血', () => {
    const options = {
      enemyMain: { ...enemy, combat: { def: 400, openingShield: 150 } },
      enemyGuards: [{ ...enemy, name: '奇门护卫', stance: 'AGILE' as const, hp: 1000 }],
    }
    const [guard, leader] = mainCasts(fight(jiangnanGear, options))
    expect(guard).toMatchObject({ round: 1, targetSlot: 'ENEMY_LEFT', hpDelta: -239 })
    expect(hasTag(guard, '对刚猛增伤')).toBe(false)
    expect(leader).toMatchObject({ round: 2, targetSlot: 'ENEMY_MAIN', hpDelta: -2, shieldAbsorbed: 150, statusRemoved: '护盾' })
    expect(leader.segments).toContainEqual(jiangnanTag(2))
    expect(mainCasts(fight({ ...jiangnanGear, accId: null }, options))[1]).toMatchObject({ hpDelta: 0, shieldAbsorbed: 136 })
  })

  it('白驼两件对已有毒的目标增加 18 个百分点，毒效到期后恢复基础暴击率', () => {
    const character = { ...player, stats: { ...player.stats, agi: 41 } }
    const gear = { ...baituoWithoutVenom, armorId: 'ruanwei_armor' }
    const options = {
      player: character, surviveRounds: 3,
      enemyMain: { ...enemy, combat: { charge: { round: 2, name: '蓄力', damageMultiplier: 2 } } },
    }
    const report = fight(gear, options)
    const [first, poisoned, expired] = mainCasts(report)
    const { atk, crit, maxMp } = computeDerivedStats(character, { ...loadout, ...gear })
    const expected = (round: number, critical = false) => -strikeDamage(atk, 1, 1, innerPressure(maxMp, enemy.mp), critical, round)
    expect(first).toMatchObject({ round: 1, hitResult: 'HIT', hpDelta: expected(1) })
    expect(poisoned).toMatchObject({ round: 2, hitResult: 'CRIT', hpDelta: expected(2, true) })
    expect(poisoned.segments).toContainEqual(baituoTag(18, crit + 18))
    expect(mainCasts(fight({ ...gear, headId: null }, options))[1]).toMatchObject({ hitResult: 'HIT', hpDelta: expected(2) })
    expect(effectEvents(report, 'ruanwei_armor')).toContainEqual(expect.objectContaining({ round: 2, statusRemoved: '软猬剧毒' }))
    expect(expired).toMatchObject({ round: 3, hitResult: 'HIT', hpDelta: expected(3) })
    expect(mainCasts(report).filter((event) => hasTag(event, '个百分点（本次'))).toEqual([poisoned])

    const lingshe = fight({ ...baituoWithoutVenom, leftCompanionId: 'ouyangfeng', rightCompanionId: 'huangyaoshi' }, {
      enemyMain: { ...enemy, hp: 50_000 }, surviveRounds: 4, companionOf: baseCompanion,
    })
    expect(mainCasts(lingshe).filter((event) => hasTag(event, '个百分点（本次')).map((event) => event.round)).toEqual([2, 3])
  })

  it('白驼追击重选目标时重新检查中毒状态', () => {
    const gear = { ...baituoWithoutVenom, armorId: 'ruanwei_armor', outerSkillId: 'shuangshou_hubo' }
    const report = fight(gear, {
      rng: () => 0, enemyMain: { ...enemy, hp: 350 },
      enemyGuards: [{ ...enemy, name: '无毒护卫', hp: 10000 }],
    })
    const [regular, followUp] = mainCasts(report).filter((event) => event.round === 2)
    expect(regular.targetSlot).toBe('ENEMY_MAIN')
    expect(regular.segments).toContainEqual(baituoTag(18, computeDerivedStats(player, { ...loadout, ...gear }).crit + 18))
    expect(followUp).toMatchObject({ targetSlot: 'ENEMY_LEFT', effectSourceId: 'shuangshou_hubo' })
    expect(hasTag(followUp, '个百分点（本次')).toBe(false)
  })

  it('白驼战报显示封顶后的实际暴击加成，75% 阈值仍用于判定', () => {
    const gear = { ...poisonGear, outerSkillId: 'dugu_jiujian', weaponId: 'dagou_stick_true' }
    const character = { ...player, stats: { ...player.stats, agi: 35 } }
    expect(computeDerivedStats(character, { ...loadout, ...gear }).crit).toBe(72)
    expect(mainCasts(fight(gear, { player: character }))[1].segments).toContainEqual(baituoTag(3, 75))

    const capped = {
      ...gear, weaponId: trialPartId('niluan_jiuyin', 'WEAPON'), wristId: trialPartId(baituo, 'WRIST'),
    }
    const rollAtCap = { ...player, stats: { ...player.stats, agi: 1 } }
    expect(computeDerivedStats(rollAtCap, { ...loadout, ...capped }).crit).toBe(75)
    const second = mainCasts(fight(capped, { player: rollAtCap }))[1]
    expect(second).toMatchObject({ round: 2, hitResult: 'HIT' })
    expect(second.segments).toContainEqual(baituoTag(0, 75))
  })

  it('少室山按各玩家和受击目标结算气血、架势与中毒条件', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 35, con: 60 } }
    const fighter = (id: string, gear: Partial<LoadoutPresetDTO>, member = character) => ({
      player: { ...member, id }, loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-conditional-offense', [
      fighter('a', { ...jiangnanGear, armorId: 'ruanwei_armor', weaponId: trialPartId(jiangnan, 'WEAPON') }),
      fighter('b', baituoGear),
      fighter('c', huntian, { ...player, level: 20, realmTier: 2 }),
    ])
    const stanceHits = report.events.filter((event) => hasTag(event, '对刚猛增伤'))
    expect(stanceHits[0]).toMatchObject({ actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', hpDelta: -2089 })
    expect(stanceHits[0].segments).toContainEqual(jiangnanTag(224))
    expect(stanceHits.every((event) => event.actorSlot === 'ALLY_MAIN' && event.targetSlot === 'ENEMY_LEFT')).toBe(true)
    expect(stanceHits.find((event) => event.type === 'DOT_TICK')?.segments).toContainEqual(jiangnanTag(16))
    const poisonHit = report.events.find((event) => hasTag(event, '个百分点（本次'))!
    expect(poisonHit).toMatchObject({ round: 2, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', hitResult: 'HIT' })
    expect(poisonHit.segments).toContainEqual(baituoTag(18, 27))
    const lowHpHit = report.events.find((event) => hasTag(event, '混天气功 · 外功增伤'))!
    expect(lowHpHit).toMatchObject({ round: 3, actorSlot: 'ALLY_RIGHT', hpDelta: -721 })
    expect(lowHpHit.segments).toContainEqual(huntianTag(120))
  })

  it('主线试玩按护卫自己的刚猛架势显示江南增伤', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats)
      store.player.maxChapterId = 5
      store.updateLoadout(loadout)
      for (const id of Object.values(jiangnanGear)) {
        store.ownedItemIds.push(id)
        store.equipItem(id)
      }
      store.challengeChapter(5)
      const [guard, leader] = mainCasts(store.activeBattle!)
      expect(guard).toMatchObject({ targetSlot: 'ENEMY_LEFT', hpDelta: -200 })
      expect(guard.segments).toContainEqual(jiangnanTag(21))
      expect(leader.targetSlot).toBe('ENEMY_MAIN')
      expect(hasTag(leader, '对刚猛增伤')).toBe(false)
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual(jiangnanTag(21))
    } finally {
      store.closeBattleStage()
    }
  })
})
