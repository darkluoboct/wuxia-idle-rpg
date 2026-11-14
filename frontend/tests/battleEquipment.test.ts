import { describe, expect, it, vi } from 'vitest'
import { STORY_CHAPTERS } from '@/config/storyData'
import type { BattleEventDTO, BattleReportDTO, LoadoutPresetDTO } from '@/network/protocol'
import {
  computeCompanionDerivedStats,
  computeDerivedStats,
  incomingDamage,
  innerPressure,
  simulatePlayerDuel,
  simulateServerBattle,
  simulateShaoshiRaid,
  strikeDamage,
} from '../../shared/battle.ts'
import {
  applyDirectedDamage,
  applyPeriodicOnHit,
  battleDefense,
  effectsFrom,
  endStatusRound,
  resolveBattleLoadout,
  resolvePoisonBurst,
  restorePartyRound,
  type EnemyBattleState,
} from '../../shared/battleEffects.ts'
import { damageAfterDefense } from '../../shared/combatMeta.ts'
import { ITEMS, meetsItemStatRequirement, SKILLS, trialRewardItems } from '../../shared/gameData.ts'
import { sectEquipmentRewardIds } from '../../shared/sectEquipment.ts'
import { TRIAL_PATROL_HOURS, trialPartId, trialStageOf } from '../../shared/trialStages.ts'
import { newStore } from './helpers'
import { player, loadout, enemy, agileEnemy, baseCompanion, fight, effectEvents, mainUnit, mainCast, equipped, flatTag, fierceTag, fierceTags } from './battleFixtures'

describe('精铸装备的实际出战属性', () => {
  it('淬炼只按原始攻击提值，主副词条各加一次，伙伴与少室山按穿戴者读档', () => {
    const weaponId = trialPartId('pomiao_caomang', 'WEAPON')
    const forged = { ...player, equipmentAffixes: { [weaponId]: 3 }, equipmentForge: {
      iron: 0, stones: 0, items: { [weaponId]: { stars: 5, pity: 0, secondary: { stat: 'atk', value: 15 } as const } },
    } }
    const gear = { ...loadout, weaponId }
    const base = computeDerivedStats(player, gear)
    expect(computeDerivedStats(forged, gear).atk - base.atk).toBe(29)
    const hits = (owner: typeof player) => mainCast(fight(gear, { player: owner, rng: () => 0.99, surviveRounds: 1 })).hpDelta!
    expect(hits(forged)).toBeLessThan(hits(player))

    const paired = { ...loadout, leftCompanionId: 'guojing', companionWeapons: { guojing: weaponId } }
    const stats = (owner: typeof player) => computeCompanionDerivedStats(owner, paired, 'guojing', baseCompanion)!
    expect(stats(forged).atk - stats(player).atk).toBe(29)
    expect(computeDerivedStats(forged, paired).atk).toBe(computeDerivedStats(player, paired).atk)

    const raid = simulateShaoshiRaid('forge', [
      { player: { ...player, id: 'lead' }, loadout: gear, learnedSkills: {} },
      { player: { ...forged, id: 'left' }, loadout: gear, learnedSkills: {} },
      { player: { ...forged, id: 'right' }, loadout, learnedSkills: {} },
    ], () => 0.99)
    const damage = (slot: string) => raid.events.find((event) => event.actorSlot === slot && event.type === 'SKILL_CAST')?.hpDelta
    expect(damage('ALLY_LEFT')!).toBeLessThan(damage('ALLY_MAIN')!)
    expect(damage('ALLY_MAIN')!).toBeLessThan(damage('ALLY_RIGHT')!)
  })
})

describe('分册装备的独立词条', () => {
  const calm = { rain: false, night: false, swamp: false }
  const steady = () => 0.99
  const shieldSet = 'quanzhen_beidou'
  const enemyHit = (report: BattleReportDTO) => report.events.find((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN')!

  it('蓑草衣在雨或夜抢先，齐六件同次只加一次 8%', () => {
    const armorId = trialPartId('pomiao_caomang', 'ARMOR')
    const full = equipped('pomiao_caomang', ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'ACC'])
    const run = (build: Partial<LoadoutPresetDTO>, environment: typeof calm) => fight(build, {
      environment, rng: steady, surviveRounds: 1, enemyMain: { ...enemy, combat: { speed: 105 } },
    })
    const dry = run({ armorId }, calm)
    const rainy = run({ armorId }, { ...calm, rain: true })
    const night = run({ armorId }, { ...calm, night: true })
    const soaked = run(full, { ...calm, rain: true, night: true })
    const first = (report: BattleReportDTO) => report.events.find((event) => event.type === 'SKILL_CAST')!.actorSlot
    expect([dry, rainy, night, soaked].map(first)).toEqual(['ENEMY_MAIN', 'ALLY_MAIN', 'ALLY_MAIN', 'ALLY_MAIN'])
    expect(effectEvents(dry, armorId)).toEqual([])
    expect(effectEvents(rainy, armorId).flatMap((event) => event.segments)).toContainEqual({ type: 'text', text: ` ${player.nickname}出手速度 +8` })
    expect(effectEvents(soaked, armorId)).toHaveLength(1)
    expect(effectEvents(soaked, 'pomiao_caomang').every((event) => event.segments.every((segment) =>
      segment.type !== 'text' || !segment.text.includes('出手速度')))).toBe(true)
  })

  it('云锦袍独立判定外功，盾前减半，绝技跳过单件卸力', () => {
    const armorId = trialPartId('jinwang_fuxiu', 'ARMOR')
    const build = { armorId, ...equipped(shieldSet, ['WEAPON', 'HEAD', 'BELT', 'ACC']) }
    const run = (roll: number, ultimate = false) => fight(build, {
      rng: () => roll, surviveRounds: 1, environment: calm,
      enemyMain: { ...enemy, atk: 1800, combat: ultimate ? { openingRage: 100, rageSkillId: 'tonggui_jianfa' } : undefined },
    })
    const missed = enemyHit(run(0.20))
    const blocked = enemyHit(run(0.1999))
    const amount = missed.shieldAbsorbed! - missed.hpDelta!
    const reduced = Math.round(amount / 2)
    expect(blocked.shieldAbsorbed! - blocked.hpDelta!).toBe(reduced)
    expect(blocked.segments).toContainEqual({ type: 'tag', text: `织金团龙云锦袍 · 金丝卸力 · 盾前减伤 ${amount - reduced}`, tone: 'jade' })
    expect(enemyHit(run(0, true))).toMatchObject({ skillId: 'tonggui_jianfa' })
    expect(enemyHit(run(0, true)).hpDelta).toBe(enemyHit(run(0.20, true)).hpDelta)
  })

  it('紫阳冠仅在奇门常规外功命中蓄力者时按 10% 边界打断', () => {
    const headId = trialPartId('qimen_dunjia', 'HEAD')
    const run = (stance: LoadoutPresetDTO['stance'], roll: number, dodge = 0) => fight({ headId, stance }, {
      rng: () => roll, environment: calm, surviveRounds: 3,
      enemyMain: { ...enemy, atk: 25, combat: { dodge, openingShield: 8000, charge: { round: 2, name: '试招蓄力', damageMultiplier: 2 } } },
    })
    const breaks = (report: BattleReportDTO) => effectEvents(report, headId).filter((event) => event.statusRemoved === '蓄力')
    expect(breaks(run('AGILE', 0.0999))).toMatchObject([{ round: 3, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN' }])
    expect(breaks(run('AGILE', 0.10))).toEqual([])
    expect(breaks(run('FIERCE', 0))).toEqual([])
    expect(breaks(run('AGILE', 0, 100))).toEqual([])
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id, stats: { ...player.stats, str: 10, con: 300 } }, loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const raid = simulateShaoshiRaid('crown', [member('lead', {}), member('left', {}), member('right', { headId, stance: 'AGILE' })], () => 0, calm)
    expect(breaks(raid)).toMatchObject([{ round: 6, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN' }])
  })

  it('金鞘刀只在暴击提高实伤，固定破甲照常生效', () => {
    const weaponId = trialPartId('xizheng_jindao', 'WEAPON')
    const crit = fight({ weaponId, accId: trialPartId('huangshan_kulou', 'ACC') }, {
      player: { ...player, stats: { ...player.stats, agi: 65 } }, environment: calm, rng: steady, surviveRounds: 1,
      enemyMain: { ...enemy, combat: { def: 350, openingShield: 100 } },
    })
    const strike = mainCast(crit)
    expect(strike.hitResult).toBe('CRIT')
    expect(strike.segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringMatching(/暴击伤害 \+25% · 增伤 \+[1-9]/) }))
    expect(strike.segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringContaining('固定破甲 80 点防御') }))
    expect(mainCast(fight({ weaponId }, { environment: calm, rng: steady, surviveRounds: 1 })).segments.every((segment) =>
      segment.type !== 'tag' || !segment.text.includes('暴击伤害 +25%'))).toBe(true)
  })

  it('少室山由队友护腕增强护盾，重复同款取一次，护盾实际增量写入战报', () => {
    const wristId = trialPartId(shieldSet, 'WRIST')
    const defender = equipped(shieldSet, ['HEAD', 'ARMOR', 'BELT', 'ACC'])
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id, stats: { ...player.stats, con: 90 } }, loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const raid = (left: string | null, right: string | null) => simulateShaoshiRaid('shield-boost', [
      member('a', defender), member('b', { wristId: left }), member('c', { wristId: right }),
    ], steady, calm)
    const shields = (report: BattleReportDTO) => effectEvents(report, shieldSet).filter((event) => event.round === 1 && event.shieldDelta)
    const base = shields(raid(null, null))
    const enhanced = shields(raid(wristId, null))
    expect(enhanced).toHaveLength(3)
    for (const [index, event] of enhanced.entries()) {
      const delta = Math.round(base[index].shieldDelta! * 1.10)
      expect(event.shieldDelta).toBe(delta)
      expect(event.segments).toContainEqual({ type: 'tag', tone: 'jade', text: `天罡北斗金丝护腕 · 护盾增量 +${delta - base[index].shieldDelta!}` })
    }
    expect(shields(raid(wristId, wristId))).toEqual(enhanced)
  })
})

describe('梵文总纲、北斗阵图与易数残卷', () => {
  const calm = { rain: false, night: false, swamp: false }
  const trio = { leftCompanionId: 'yangtiexin', rightCompanionId: 'zhuziliu' }
  const sanskrit = 'jiuyin_sanskrit'
  const beidou = 'beidou_formation_book'
  const qimen = 'qimen_divination_scroll'
  const steady = () => 0.99
  const gear = (relicBookId: string) => ({ ...loadout, ...trio, relicBookId })
  const durable = { ...player, stats: { ...player.stats, con: 100 } }
  const entrant = (id: string, patch: Partial<LoadoutPresetDTO> = {}) => ({
    player: { ...durable, id, nickname: id }, loadout: { ...loadout, ...patch }, learnedSkills: {},
  })
  const converted = (report: BattleReportDTO) => report.events.filter((event) => event.trueStrikeSourceId === sanskrit)

  it('梵文总纲给每位队友加面板属性，主招和伙伴招式绕过防御并保留原盾', () => {
    const build = gear(sanskrit)
    const base = { ...build, relicBookId: null }
    const views = [computeDerivedStats(player, build), computeCompanionDerivedStats(player, build, 'yangtiexin', baseCompanion)!]
    const normals = [computeDerivedStats(player, base), computeCompanionDerivedStats(player, base, 'yangtiexin', baseCompanion)!]
    expect(views.map((stats, index) => [stats.atk - normals[index].atk, stats.maxMp - normals[index].maxMp, stats.crit - normals[index].crit]))
      .toEqual([[200, 1500, 15], [200, 1500, 15]])
    const options = { surviveRounds: 1, rng: steady, environment: calm }
    const target = { ...enemy, atk: 1, combat: { def: 60_000, openingShield: 600_000 } }
    const run = (enemyMain: Parameters<typeof simulateServerBattle>[0]['enemyMain']) => fight(build, { ...options, enemyMain })
    const report = run(target)
    expect(mainCast(fight(base, { ...options, enemyMain: target }))).toMatchObject({ hpDelta: 0, shieldAbsorbed: expect.any(Number) })
    expect(converted(report).map(({ actorSlot, hpDelta }) => [actorSlot, hpDelta])).toEqual(
      converted(run({ ...target, combat: { def: 0, openingShield: 0 } })).map(({ actorSlot, hpDelta }) => [actorSlot, hpDelta]),
    )
    expect(converted(report).map((event) => event.actorSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'])
    for (const event of converted(report)) {
      expect(event.hpDelta).toBeLessThan(0)
      expect(event.shieldDelta).toBeUndefined()
      expect(event.segments).toContainEqual(expect.objectContaining({ type: 'damage', value: -event.hpDelta!, category: 'true' }))
    }
    expect(mainCast(run({ ...target, hp: 3 }))).toMatchObject({ hpDelta: -3, trueStrikeSourceId: sanskrit })
  })

  it('切磋的对手和少室山第三位实际玩家均可提供梵文，队伍光环不重复叠加', () => {
    const duel = simulatePlayerDuel({ battleId: 'sanskrit-duel', sceneTitle: '试招', mode: 'PVP_HUASHAN', rng: steady, environment: calm,
      lineup: [entrant('a', equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])), entrant('b', { ...trio, relicBookId: sanskrit })] })
    const hit = converted(duel).find((event) => event.actorSlot === 'ENEMY_MAIN')!
    expect(hit).toMatchObject({ targetSlot: 'ALLY_MAIN', hpDelta: expect.any(Number) })
    expect(hit.shieldAbsorbed).toBeUndefined()
    expect(converted(duel).every((event) => event.actorSlot.startsWith('ENEMY'))).toBe(true)
    const raid = (second: boolean) => simulateShaoshiRaid('sanskrit-raid', [
      entrant('a'), entrant('b', second ? { relicBookId: sanskrit } : {}), entrant('c', { relicBookId: sanskrit }),
    ], steady, calm)
    expect(converted(raid(false)).filter((event) => event.round === 1).map((event) => event.actorSlot))
      .toEqual(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'])
    expect(raid(true).units).toEqual(raid(false).units)
  })

  it('北斗阵图只在三人存活时均摊，盾全挡者不获得阵图受击回怒', () => {
    const build = gear(beidou)
    const options = { player, surviveRounds: 1, environment: calm, rng: steady, enemyMain: { ...enemy, atk: 1400 } }
    const report = fight(build, options)
    const shares = effectEvents(report, beidou).filter((event) => event.actorSlot === 'ENEMY_MAIN')
    expect(shares).toMatchObject([
      { targetSlot: 'ALLY_LEFT', rageDelta: 30 }, { targetSlot: 'ALLY_RIGHT', rageDelta: 30 },
    ])
    expect(shares.every((event) => event.hpDelta! < 0)).toBe(true)
    const direct = report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    expect(direct).toMatchObject({ targetSlot: 'ALLY_MAIN', rageDelta: 15 })
    expect(Math.abs(direct.hpDelta! - shares[0].hpDelta!)).toBeLessThanOrEqual(1)
    const covered = fight({ ...build, ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']) }, {
      ...options, enemyMain: { ...options.enemyMain, atk: 100 },
    })
    expect(effectEvents(covered, beidou).filter((event) => event.actorSlot === 'ENEMY_MAIN')).toMatchObject([
      { hpDelta: 0, shieldAbsorbed: expect.any(Number) }, { hpDelta: 0, shieldAbsorbed: expect.any(Number) },
    ])
    expect(effectEvents(covered, beidou).every((event) => event.rageDelta === undefined)).toBe(true)
    expect(effectEvents(fight({ ...build, rightCompanionId: null }, options), beidou).filter((event) => event.actorSlot === 'ENEMY_MAIN'))
      .toEqual([])
  })

  it('北斗反震随实际招架者，少室山单击按三人盾后实扣独立回怒', () => {
    const form = gear(beidou)
    const report = fight(form, { player: { ...durable, stats: { ...durable.stats, intStat: 50 } },
      surviveRounds: 1, environment: calm, rng: steady, enemyMain: { ...enemy, atk: 1400 } })
    const parry = report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.hitResult === 'PARRY')!
    expect(parry.hpDelta!).toBeLessThan(0)
    const reflected = effectEvents(report, beidou).find((event) => event.targetSlot === 'ENEMY_MAIN')!
    expect(reflected).toMatchObject({ actorSlot: parry.targetSlot, hpDelta: -Math.round(-parry.hpDelta! * 0.2) })
    const raid = simulateShaoshiRaid('beidou-raid', [entrant('a'), entrant('b'), entrant('c', { relicBookId: beidou })], steady, calm)
    const first = raid.events.filter((event) => event.actorSlot === 'ENEMY_LEFT' && event.round === 1 && event.targetSlot?.startsWith('ALLY'))
    expect(first).toHaveLength(3)
    expect(new Set(first.map((event) => event.targetSlot)).size).toBe(3)
    expect(first.every((event) => event.hpDelta! < 0 && event.rageDelta! > 0 && event.rageTargetSlot === event.targetSlot)).toBe(true)
  })

  it('奇门残卷改变真实先手，偶数回合逐人驱毒止血，按缺口封顶回血', () => {
    const options = { surviveRounds: 2, rng: steady, environment: calm, enemyMain: { ...enemy, atk: 80, combat: { speed: 110 } } }
    const build = { ...loadout, relicBookId: qimen }
    const normal = fight({}, options)
    const report = fight(build, options)
    const first = (report: BattleReportDTO) => report.events.find((event) => event.round === 1 && event.type === 'SKILL_CAST')?.actorSlot
    expect(first(normal)).toBe('ENEMY_MAIN')
    expect(first(report)).toBe('ALLY_MAIN')
    expect(computeDerivedStats(player, build).speed).toBe(Math.round(computeDerivedStats(player, loadout).speed * 1.15))
    expect(effectEvents(report, qimen).filter((event) => event.statusApplied).map((event) => event.round)).toEqual([1, 2])
    const unit = mainUnit(report)
    const target: EnemyBattleState = { unit: { ...unit, slot: 'ALLY_RIGHT' }, atk: 100, shield: 0 }
    const source = { sourceId: 'venom', sourceName: '试毒', slot: 'ENEMY_MAIN' as const }
    const initialHp = unit.maxHp - 20
    const events: BattleEventDTO[] = []
    for (const status of ['snakeVenom', 'woundBleed', 'coldInjury'] as const) {
      applyPeriodicOnHit(source, target, initialHp, { status, attackPercent: 20, rounds: 3 }, { attack: 100, round: 1, rng: steady }, events)
    }
    const restoration = [
      { fighter: { unit: { ...unit, slot: 'ALLY_LEFT' as const } }, hp: unit.maxHp, effects: resolveBattleLoadout(build).effects },
      { fighter: target, hp: initialHp, effects: [] },
      { fighter: { unit }, hp: 0, effects: [] },
    ]
    restorePartyRound(restoration, 1, events)
    expect(restoration[1].hp).toBe(initialHp)
    restorePartyRound(restoration, 2, events)
    expect(restoration.map(({ hp }) => hp)).toEqual([unit.maxHp, unit.maxHp, 0])
    expect(Object.keys(target.ongoingDamage!)).toEqual(['coldInjury'])
    expect(events.filter((event) => event.effectSourceId === qimen)).toMatchObject([
      { round: 2, actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_RIGHT', statusRemoved: '蛇奴毒雾' },
      { round: 2, actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_RIGHT', statusRemoved: '重伤流血' },
      { round: 2, actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_RIGHT', hpDelta: 20 },
    ])
  })

  it('三件秘宝的历练与晋升授予条件支持旧档补领且不重复', () => {
    const progress = { rewardedStageIds: [24, 28, 30], huangrongRecruited: true }
    const items = (stageId: number, context: Parameters<typeof trialRewardItems>[3], owned: string[] = []) =>
      trialRewardItems(trialStageOf(stageId)!, false, owned, context).map((item) => item.id)
    expect(items(21, { ...progress, answer: '开门' })).toEqual([])
    expect(items(21, { ...progress, answer: '生门' })).toEqual([qimen])
    expect(items(28, progress)).toEqual([beidou])
    expect(sectEquipmentRewardIds('quanzhen', 2)).not.toContain(beidou)
    expect(sectEquipmentRewardIds('quanzhen', 3)).toContain(beidou)
    expect(items(30, { ...progress, huangrongRecruited: false })).toEqual([])
    expect(items(30, { ...progress, rewardedStageIds: [] })).toEqual([])
    expect(items(24, progress)).toEqual([sanskrit])
    expect(items(30, progress)).toEqual([sanskrit])
    expect(items(30, progress, [sanskrit])).toEqual([])
  })
})

describe('周伯通空明桃木剑', () => {
  const sword = 'kongming_peach_sword'
  const calm = { rain: false, night: false, swamp: false }
  const tags = (event: BattleEventDTO) => event.segments.flatMap((segment) => segment.type === 'tag' ? [segment.text] : [])

  it('两项基础属性门槛取其一，失去穿戴条件时停用剑的战斗效果', () => {
    const low = { ...player.stats, intStat: 30, agi: 39 }
    const high = { ...low, intStat: 31 }
    expect(meetsItemStatRequirement(ITEMS[sword], low)).toBe(true)
    expect(meetsItemStatRequirement(ITEMS[sword], high)).toBe(false)
    expect(meetsItemStatRequirement(ITEMS[sword], { ...high, agi: 40 })).toBe(true)
    const build = { ...loadout, weaponId: sword }
    expect(computeDerivedStats({ ...player, stats: high }, build)).toEqual(computeDerivedStats({ ...player, stats: high }, loadout))
  })

  it('普攻的 40% 判定独立于命中后的 18 点连击率，真伤只结算常规外功', () => {
    const withShield = { ...enemy, combat: { openingShield: 9999 } }
    const run = (rolls: number[], outerSkillId: string | null = null) => fight({ weaponId: sword, outerSkillId }, {
      enemyMain: withShield, environment: calm, rng: () => rolls.shift() ?? 0.99, surviveRounds: 1,
    })
    const extra = (report: BattleReportDTO) => report.events.filter((event) => tags(event).some((tag) => tag.includes('追加出手')))
    const both = run([0.39, 0.17])
    expect(extra(both)).toHaveLength(2)
    expect(mainCast(both)).toMatchObject({ hpDelta: 0, shieldAbsorbed: expect.any(Number) })
    expect(effectEvents(both, sword).filter((event) => (event.hpDelta ?? 0) < 0)).toMatchObject([{ hpDelta: -90 }])
    expect(extra(run([0.4, 0.18]))).toEqual([])
    expect(extra(run([0.17], 'kongming_quan'))).toHaveLength(1)
    expect(extra(run([0.39], 'kongming_quan'))).toEqual([])
  })

  it('旧试玩档可以在清音石洞胜利补领桃木剑，重复开战不再发剑', () => {
    const hero = newStore('DEMO')
    const stage = 20
    hero.player.stats.str = 1500
    hero.player.trial.maxStageId = stage
    hero.player.trial.selectedStageId = stage
    hero.player.trial.rewardedStageIds.push(stage)
    hero.player.trial.stageHours[String(stage)] = TRIAL_PATROL_HOURS[stage]
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      hero.challengeTrialStage(stage)
      expect(hero.activeBattle?.winner).toBe('ALLY')
      expect(hero.activeBattle?.rewards?.items?.map(({ id }) => id)).toEqual([sword])
      hero.skipBattleToEnd()
      hero.closeBattleStage()
      hero.challengeTrialStage(stage)
      expect(hero.activeBattle?.rewards?.items).toBeUndefined()
      expect(hero.ownedItemIds.filter((id) => id === sword)).toHaveLength(1)
    } finally {
      hero.closeBattleStage()
    }
  })
})

describe('两件折扇饰品与琴箫合奏', () => {
  const goldFan = 'hama_nimai_acc'
  const jadeFan = 'baituo_zheshan_acc'
  const score = 'xiaoao_qupu'
  const plain = { night: false, rain: false, swamp: false }
  const tags = (event: BattleEventDTO) => event.segments.flatMap((segment) => segment.type === 'tag' ? [segment.text] : [])
  const foeHits = (report: BattleReportDTO) => report.events.filter((event) =>
    event.actorSlot === 'ENEMY_MAIN' && event.targetSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
  const heroCasts = (report: BattleReportDTO) => report.events.filter((event) =>
    event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')

  it('金骨折扇按每击前剩余气血增加防御，出手重算并报告封顶暴击', () => {
    const stats = { ...player.stats, con: 40, agi: 0 }
    const owner = { ...player, stats }
    const gear = { accId: goldFan, weaponId: 'dadiao_jindao', outerSkillId: 'dugu_jiujian', relicBookId: score }
    const derived = computeDerivedStats(owner, { ...loadout, ...gear })
    const report = fight(gear, { player: owner, enemyMain: { ...enemy, atk: 1300 }, environment: plain, rng: () => 0.99 })
    const hits = foeHits(report)
    const firstDamage = -hits[0].hpDelta!
    const bonus = Math.round(firstDamage * 40 / derived.maxHp)
    const raised = Math.round(derived.def * (100 + bonus) / 100)
    expect(firstDamage).toBe(incomingDamage(1300, 1, derived.def, owner.level))
    expect(hits[1].hpDelta).toBe(-incomingDamage(1300, 1, raised, owner.level))
    expect(tags(hits[1])).toContain(`${ITEMS[goldFan].name} · 护体防御 +${raised - derived.def}`)
    expect(tags(heroCasts(report)[0]).some((tag) => tag.startsWith(ITEMS[goldFan].name))).toBe(false)
    expect(tags(heroCasts(report)[1])).toContain(`${ITEMS[goldFan].name} · 暴击率 +${75 - derived.crit} 个百分点（本次 75%）`)
  })

  it('翡翠折扇坠按女性来袭者增加实际闪避，接近上限时只加缺口', () => {
    const owner = { ...player, stats: { ...player.stats, agi: 12 } }
    const gear = { accId: jadeFan, lightSkillId: 'lingbo_weibu' }
    const derived = computeDerivedStats(owner, { ...loadout, ...gear })
    expect(derived.dodge).toBe(41)
    const scenario = (female?: true) => fight(gear, {
      player: owner, enemyMain: { ...enemy, combat: { female } }, surviveRounds: 1, environment: plain, rng: () => 0.99,
    })
    const evade = scenario(true).events.find((event) => event.type === 'DODGE' && event.actorSlot === 'ALLY_MAIN')!
    expect(tags(evade)).toContain(`${ITEMS[jadeFan].name} · 闪避率 +${42 - derived.dodge} 个百分点`)
    expect(foeHits(scenario())[0].hitResult).toBe('HIT')
  })

  it('翡翠折扇坠只改变实际女性攻击者一击的招架判定', () => {
    const owner = { ...player, stats: { ...player.stats, intStat: 64 } }
    const gear = { accId: jadeFan }
    const stage = trialStageOf(17)!
    const report = fight(gear, { player: owner, enemyMain: { ...stage.boss, mp: enemy.mp, atk: enemy.atk }, surviveRounds: 1, environment: plain })
    const ordinary = fight(gear, { player: owner, surviveRounds: 1, environment: plain })
    const reduced = foeHits(report)[0]
    expect(reduced).toMatchObject({ hitResult: 'PARRY' })
    expect(tags(reduced)).toContain(`${ITEMS[jadeFan].name} · 招架率 +15 个百分点`)
    expect(reduced.hpDelta).toBe(Math.round(foeHits(ordinary)[0].hpDelta! * 0.6))
    expect(foeHits(ordinary)[0].hitResult).toBe('HIT')
  })

  it('切磋按对手实际角色和协战伙伴判定女性来袭', () => {
    const build = (avatarId: typeof player.avatarId) => simulatePlayerDuel({
      battleId: 'jade-fan', sceneTitle: '翡翠折扇坠', mode: 'PVP_HUASHAN', environment: plain, rng: () => 0.73,
      lineup: [
        { player: { ...player, avatarId: 'hero_sword_male', stats: { ...player.stats, con: 100 } },
          loadout: { ...loadout, accId: jadeFan }, learnedSkills: {} },
        { player: { ...player, id: 'opponent', avatarId, stats: { ...player.stats, con: 100 } },
          loadout: { ...loadout, rightCompanionId: 'sunbuer' }, learnedSkills: {}, companionOf: baseCompanion },
      ],
    })
    const labeled = (report: BattleReportDTO) => report.events.filter((event) => event.round === 1 &&
      event.targetSlot === 'ALLY_MAIN' && tags(event).some((tag) => tag.startsWith(ITEMS[jadeFan].name)))
    expect(labeled(build('hero_sword_male')).map((event) => event.actorSlot)).toEqual(['ENEMY_RIGHT'])
    expect(labeled(build('hero_sword')).map((event) => event.actorSlot)).toEqual(['ENEMY_MAIN', 'ENEMY_RIGHT'])
  })

  it('琴箫谱按实际出战伙伴组成正邪同阵，改变先手并将怒气封顶', () => {
    const gear = { leftCompanionId: 'guojing', rightCompanionId: 'ouyangfeng', relicBookId: score }
    const base = { ...loadout, ...gear, relicBookId: null }
    const opponent = { ...enemy, atk: 90, combat: { speed: 110 } }
    const options = { enemyMain: opponent, environment: plain, surviveRounds: 2, rng: () => 0.99, companionOf: baseCompanion }
    const report = fight(gear, options)
    const source = effectEvents(report, score)
    const firstCast = (battle: BattleReportDTO) => battle.events.find((event) => event.type === 'SKILL_CAST')
    expect(firstCast(fight(base, options))?.actorSlot).toBe('ENEMY_MAIN')
    expect(firstCast(report)?.actorSlot).toBe('ALLY_MAIN')
    expect(source.filter((event) => event.round === 1).map(({ targetSlot, rageDelta }) => [targetSlot, rageDelta]))
      .toEqual([['ALLY_MAIN', 20], ['ALLY_LEFT', 20], ['ALLY_RIGHT', 20]])
    expect(source.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN')?.rageDelta).toBeUndefined()
    const sameSide = (id: string) => {
      const view = baseCompanion(id)
      return view && id === 'ouyangfeng' ? { ...view, stats: { ...view.stats, karma: 1 } } : view
    }
    const normalSpeed = computeDerivedStats(player, base, {}, sameSide).speed
    expect(computeDerivedStats(player, base, {}, baseCompanion).speed).toBe(Math.round(normalSpeed * 0.9))
    expect(computeDerivedStats(player, { ...base, relicBookId: score }, {}, baseCompanion).speed).toBe(Math.round(normalSpeed * 1.2))
    const friction = effectEvents(fight(base, options), 'alignment_friction')
    expect(friction.filter((event) => event.round === 1).map((event) => event.targetSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'])
    expect(effectEvents(report, 'alignment_friction')).toEqual([])
    const bonded = fight({ leftCompanionId: 'ouyangfeng', rightCompanionId: 'huangyaoshi' }, {
      ...options, companionOf: (id) => {
        const view = baseCompanion(id)
        return view && id === 'huangyaoshi' ? { ...view, stats: { ...view.stats, karma: 1 } } : view
      },
    })
    expect(effectEvents(bonded, 'alignment_friction')).toEqual([])
    expect(effectEvents(fight(gear, { ...options, companionOf: (id) => id === 'guojing' ? baseCompanion(id) : undefined }), score)).toEqual([])
  })

  it('少室山按实际玩家侠义和各自配装结算，同队两件琴箫谱只触发一次', () => {
    const fighter = (id: string, karma: number, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id, level: 32, stats: { ...player.stats, karma, con: 260, agi: 30 } },
      loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const positive = fighter('正派', 120, { relicBookId: score, accId: goldFan })
    const negative = fighter('邪派', -120, { relicBookId: score })
    const neutral = fighter('散人', 0, {})
    const report = simulateShaoshiRaid('mixed-score', [positive, negative, neutral], () => 0.99, plain)
    const first = effectEvents(report, score).filter((event) => event.round === 1)
    expect(first.map(({ targetSlot, rageDelta }) => [targetSlot, rageDelta]))
      .toEqual([['ALLY_MAIN', 20], ['ALLY_LEFT', 20], ['ALLY_RIGHT', 20]])
    const fanEvents = report.events.filter((event) => tags(event).some((tag) => tag.startsWith(ITEMS[goldFan].name)))
    expect(fanEvents.length).toBeGreaterThan(0)
    expect(fanEvents.every(({ actorSlot, targetSlot }) => actorSlot === 'ALLY_MAIN' || targetSlot === 'ALLY_MAIN')).toBe(true)
    const sameSide = { ...negative, player: { ...negative.player, stats: { ...negative.player.stats, karma: 120 } } }
    expect(effectEvents(simulateShaoshiRaid('same-score', [positive, sameSide, neutral], () => 0.99, plain), score)).toEqual([])
    const plainPositive = { ...positive, loadout: { ...positive.loadout, relicBookId: null } }
    const plainNegative = { ...negative, loadout: { ...negative.loadout, relicBookId: null } }
    const opposed = simulateShaoshiRaid('raid-friction', [plainPositive, plainNegative, neutral], () => 0.99, plain)
    expect(effectEvents(opposed, 'alignment_friction').filter(({ round }) => round === 1).map(({ actorSlot }) => actorSlot))
      .toEqual(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'])
    expect(effectEvents(report, 'alignment_friction')).toEqual([])
  })

  it('切磋中同阵伙伴消耗琴箫谱实际积攒的怒气施展装备绝技', () => {
    const durable = { ...player, stats: { ...player.stats, str: 15, con: 1900, agi: 0 } }
    const gear = {
      ...loadout, leftCompanionId: 'guojing', rightCompanionId: 'huangyaoshi', relicBookId: score,
      companionWeapons: { huangyaoshi: 'biyu_xiao' },
    } satisfies LoadoutPresetDTO
    const guest = (id: string) => {
      const view = baseCompanion(id)
      return view && id === 'huangyaoshi' ? { ...view, stats: { ...view.stats, karma: -1 } } : view
    }
    const report = simulatePlayerDuel({
      battleId: 'harmony-assist', sceneTitle: '琴箫合奏', mode: 'PVP_HUASHAN', rng: () => 0.8, environment: plain,
      lineup: [
        { player: durable, loadout: gear, learnedSkills: {}, companionOf: guest },
        { player: { ...durable, id: 'duelist' }, loadout, learnedSkills: {} },
      ],
    })
    const ultimateIndex = report.events.findIndex((event) => event.actorSlot === 'ALLY_RIGHT' && event.isUlt)
    const ultimate = report.events[ultimateIndex]
    expect(ultimate).toMatchObject({ round: 3, skillId: 'bihai_chaosheng', rageDelta: -55, mpDelta: expect.any(Number) })
    const rage = report.events.slice(0, ultimateIndex).filter((event) => (event.rageTargetSlot ?? event.actorSlot) === 'ALLY_RIGHT')
    expect(rage.filter((event) => event.effectSourceId === score).map((event) => event.rageDelta ?? 0)).toEqual([20, 20, 0])
    expect(rage.reduce((total, event) => total + (event.rageDelta ?? 0), 0)).toBe(100)
  })
})

describe('白驼金丝锦袍与同归绝杀', () => {
  const plain = { night: false, rain: false, swamp: false }
  const robe = 'baituo_jinsi'
  const execution = 'tonggui_jianfa'
  const ticks = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')

  it('锦袍将实际减免的一半回复为内力，以自身缺口封顶', () => {
    const gear = { armorId: robe, ultSkillId: 'yiyang_zhi' }
    const foe = { ...enemy, atk: 150, combat: { periodicOnHit: { status: 'dartPoison', attackPercent: 100, rounds: 1 } } } as const
    const report = fight(gear, { enemyMain: foe, environment: plain, rng: () => 0.99 })
    const cost = report.events.find((event) => event.isUlt && event.actorSlot === 'ALLY_MAIN')!
    expect(ticks(report)).toMatchObject([{ hpDelta: -60, round: 1 }, { hpDelta: -60, round: 2 }])
    expect(effectEvents(report, robe)).toMatchObject([
      { type: 'EFFECT', round: 2, targetSlot: 'ALLY_MAIN', mpDelta: Math.min(-cost.mpDelta!, 45) },
    ])
    expect(report.events.indexOf(effectEvents(report, robe)[0])).toBeGreaterThan(report.events.indexOf(ticks(report)[1]))
    const immune = fight(gear, { enemyMain: { ...foe, combat: { periodicOnHit: { ...foe.combat.periodicOnHit, status: 'snakeVenom' } } }, environment: plain })
    expect(ticks(immune)).toEqual([])
    expect(effectEvents(immune, robe)).toEqual([])
  })

  it('已有蛇毒抗性占用抗性上限，锦袍只转换本件额外减免', () => {
    const foe = { ...enemy, atk: 150, combat: { periodicOnHit: { status: 'staffVenom', attackPercent: 40, rounds: 1 } } } as const
    const report = fight({ armorId: robe, ultSkillId: 'yiyang_zhi' }, {
      player: { ...player, storySnakeChoice: 'A' }, enemyMain: foe, environment: plain, rng: () => 0.99,
    })
    expect(ticks(report)).toMatchObject([{ hpDelta: 0 }, { hpDelta: 0 }])
    expect(effectEvents(report, robe)).toMatchObject([{ round: 2, mpDelta: 15 }])
  })

  it('同归剑法低于三成气血时终结普通敌人，首领按攻击和气血双封顶', () => {
    const hp = computeDerivedStats(player, loadout).maxHp
    const defense = computeDerivedStats(player, loadout).def
    const hitTo = (amount: number) => Math.round(amount * (defense + 495) / 495)
    const run = (remaining: number, isBoss?: boolean, openingShield?: number) => fight({ ultSkillId: execution }, {
      enemyMain: { ...enemy, isBoss, atk: hitTo(hp - remaining), combat: { openingShield } },
      environment: plain, surviveRounds: 2, rng: () => 0.99,
    })
    const targetHp = Math.floor(hp * 0.29)
    const low = run(targetHp)
    const afterOrdinary = low.events.find((event) => event.skillId === execution)!
    expect(afterOrdinary).toMatchObject({ round: 2, isUlt: true })
    const last = effectEvents(low, execution)
    expect(last).toMatchObject([{ targetSlot: 'ENEMY_MAIN', hpDelta: -(enemy.hp + low.events
      .slice(0, low.events.indexOf(last[0])).reduce((total, event) => total + (event.targetSlot === 'ENEMY_MAIN' ? event.hpDelta ?? 0 : 0), 0)) }])
    expect(low.winner).toBe('ALLY')
    const boss = run(targetHp, true)
    expect(effectEvents(boss, execution)).toMatchObject([{ hpDelta: -Math.round(computeDerivedStats(player, loadout).atk * 1.5) }])
    expect(effectEvents(run(Math.ceil(hp * 0.3)), execution)).toEqual([])
    expect(effectEvents(run(targetHp, false, 5000), execution)).toEqual([])
  })

  it('正常历练回放显示金骨折扇在实战伤势下提供的暴击与防御', () => {
    const store = newStore('NEW')
    const fan = 'hama_nimai_acc'
    store.ownedItemIds.push(fan)
    store.equipItem(fan)
    store.updateLoadout({ ...loadout, accId: fan })
    store.challengeTrialStage(1)
    const report = store.activeBattle!
    expect(report.events.some((event) => event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.startsWith(ITEMS[fan].name)))).toBe(true)
    store.skipBattleToEnd()
    expect(store.logs.flatMap((entry) => entry.segments).some((segment) =>
      segment.type === 'tag' && segment.text.startsWith(ITEMS[fan].name))).toBe(true)
    store.closeBattleStage()
  })
})

describe('摧心双击与聚势', () => {
  const weaponId = 'henglian_tongjia_weapon_cuixin'
  const beltId = 'henglian_tongjia_belt_jushi'
  const gear = { weaponId, gearSkillId: weaponId }
  const trial = { trial: true, surviveRounds: 1, rng: () => 0.99 } as const

  it('聚势首回合消耗 48 怒气，两击分别经过护盾，且不会触发普通出手回怒', () => {
    const shield = 400
    const opponent = { ...enemy, combat: { openingShield: shield } }
    const baseline = mainCast(fight({ weaponId, beltId }, { ...trial, enemyMain: { ...enemy, combat: { openingShield: 5000 } } }))
    const report = fight({ ...gear, beltId }, { ...trial, enemyMain: opponent })
    const strikes = effectEvents(report, weaponId)
    const amount = Math.round(baseline.shieldAbsorbed! * 0.75)
    expect(mainUnit(report).rage).toBe(50)
    expect(strikes).toMatchObject([
      { type: 'EFFECT', round: 1, rageDelta: -48, targetSlot: 'ALLY_MAIN' },
      { type: 'SKILL_CAST', round: 1, skillName: '摧心双击', targetSlot: 'ENEMY_MAIN', hpDelta: 0, shieldAbsorbed: amount },
      { type: 'SKILL_CAST', round: 1, skillName: '摧心双击', targetSlot: 'ENEMY_MAIN', hpDelta: shield - amount * 2,
        shieldAbsorbed: shield - amount, statusRemoved: '护盾' },
    ])
    expect(strikes.filter(({ rageDelta }) => rageDelta).map(({ rageDelta }) => rageDelta)).toEqual([-48])
    expect(strikes[1].segments).toContainEqual({ type: 'text', text: '摧心双击' })
  })

  it('单穿等攒够 60 怒气，每战只用一次，非历练或没有选中特技时继续普通出手', () => {
    const report = fight({ ...gear, ultSkillId: 'yiyang_zhi' }, { ...trial, surviveRounds: 5 })
    expect(mainCast(report)).toMatchObject({ round: 1, rageDelta: 35 })
    expect(effectEvents(report, weaponId).filter(({ rageDelta }) => rageDelta)).toMatchObject([{ round: 2, rageDelta: -60 }])
    expect(effectEvents(fight({ ...gear, beltId }), weaponId).some((event) => event.skillName === '摧心双击')).toBe(false)
    expect(mainCast(fight({ weaponId, beltId }, trial)).skillName).not.toBe('摧心双击')
  })

  it('首击击倒当前目标后停止，不转火剩余敌人', () => {
    const report = fight({ ...gear, beltId }, {
      ...trial, enemyMain: { ...enemy, hp: 1 },
      enemyGuards: [{ name: '后方护卫', title: '', portrait: 'bandit', hp: 20_000, atk: 1, stance: 'FIERCE',
        combat: { staysBehindLeader: true } }],
    })
    expect(effectEvents(report, weaponId)).toMatchObject([
      { rageDelta: -48 },
      { skillName: '摧心双击', targetSlot: 'ENEMY_MAIN', hpDelta: -1 },
    ])
  })
})

describe('水系、阴寒、重甲与侠义克制', () => {
  const spear = trialPartId('taihu_shuizhai', 'WEAPON')
  const waveSet = 'huanghe_nilang'
  const pearl = trialPartId(waveSet, 'ACC')
  const armor = trialPartId('xizheng_jindao', 'ARMOR')
  const badge = trialPartId('dajin_sishi', 'ACC')
  const waterSkill = 'duanhun_qiang'
  const tagged = (event: BattleEventDTO, text: string) =>
    event.segments.some((segment) => segment.type === 'tag' && segment.text.includes(text))

  it('分水枪只增强水系枪法，按防御与护盾后的实扣报出增伤', () => {
    const gear = { ...loadout, weaponId: spear, outerSkillId: waterSkill }
    const stats = computeDerivedStats(player, gear)
    const shield = 100
    const defense = 110
    const options = { enemyMain: { ...enemy, combat: { def: defense, openingShield: shield } }, surviveRounds: 1 }
    const raw = strikeDamage(stats.atk, SKILLS[waterSkill].powerRatio, 1, innerPressure(stats.maxMp, enemy.mp), false, 1)
    const defended = Math.round(damageAfterDefense(raw, defense, player.level))
    const boosted = Math.round(defended * 1.12)
    const water = mainCast(fight(gear, options))
    expect(water).toMatchObject({ skillId: waterSkill, hpDelta: shield - boosted, shieldAbsorbed: shield })
    expect(tagged(water, `水系增伤 +${boosted - defended}`)).toBe(true)
    expect(tagged(mainCast(fight({ ...gear, outerSkillId: null }, options)), '水系增伤')).toBe(false)
  })

  it('翻江倒海按每名实际目标计算水系增伤与盾耗，套装的独立真伤沿用原值', () => {
    const gear = {
      ...equipped(waveSet, ['HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC']), weaponId: spear,
    }
    const stats = computeDerivedStats(player, { ...loadout, ...gear })
    const defense = 100
    const report = fight(gear, {
      enemyMain: { ...enemy, combat: { def: defense, openingShield: 8_000 } },
      enemyGuards: [enemy], surviveRounds: 1, rng: () => 0,
    })
    const base = Math.round(stats.atk * 0.8)
    const wave = effectEvents(report, waveSet).filter((event) => tagged(event, '翻江倒海'))
    expect(wave).toMatchObject([
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', hpDelta: -Math.round(base * 1.12) },
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: 0, shieldAbsorbed: Math.round(Math.round(damageAfterDefense(base, defense, player.level)) * 1.12) },
    ])
    expect(tagged(wave[0], '水系增伤')).toBe(true)
    expect(tagged(wave[1], '水系增伤')).toBe(false)
    expect(effectEvents(report, waveSet).find((event) => tagged(event, '附带真伤'))?.hpDelta).toBe(-Math.round(stats.def * 0.1))
  })

  it('辟水玄珠只减免沙通天的水系蓄力伤害，在护盾前结算', () => {
    const stage = trialStageOf(10)!
    const gear = equipped('quanzhen_beidou', ['HEAD', 'ARMOR', 'WRIST', 'BELT'])
    const options = { enemyMain: { ...stage.boss, hp: enemy.hp, mp: enemy.mp, atk: 950 }, surviveRounds: 3 }
    const hits = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN')
    const [charged, ordinary] = hits(fight(gear, options))
    const [resisted, unaffected] = hits(fight({ ...gear, accId: pearl }, options))
    const before = (charged.shieldAbsorbed ?? 0) - charged.hpDelta!
    const after = Math.round(before * 0.7)
    expect(before).toBeGreaterThan(charged.shieldAbsorbed!)
    expect(resisted).toMatchObject({ round: 2, hpDelta: Math.min(0, charged.shieldAbsorbed! - after) })
    expect(resisted.shieldAbsorbed).toBe(Math.min(after, charged.shieldAbsorbed!))
    expect(tagged(resisted, `水系伤害 · 盾前减伤 ${(before - after).toLocaleString()}`)).toBe(true)
    expect(unaffected).toMatchObject({ round: 3, hpDelta: ordinary.hpDelta, shieldAbsorbed: ordinary.shieldAbsorbed })
    expect(tagged(unaffected, '辟水玄珠')).toBe(false)
  })

  it('辟水玄珠减免阴寒直伤及内伤，塞外重甲也抵抗火系持续伤害', () => {
    const options = {
      enemyMain: { ...enemy, atk: 160, combat: { openingRage: 100, rageSkillId: 'cuixin_zhang',
        periodicOnHit: { status: 'firePoison' as const, attackPercent: 10, rounds: 1 } } },
      surviveRounds: 2,
    }
    const baseline = fight({}, options)
    const resisted = fight({ accId: pearl }, options)
    const both = fight({ accId: pearl, armorId: armor }, options)
    const cast = (report: BattleReportDTO) => report.events.find((event) => event.skillId === 'cuixin_zhang')!
    const ticks = (report: BattleReportDTO, status: string) => report.events.filter((event) => event.type === 'DOT_TICK' && tagged(event, status))
    const raw = -cast(baseline).hpDelta!
    const reduced = Math.round(raw * 0.7)
    expect(cast(resisted).hpDelta).toBe(-reduced)
    expect(tagged(cast(resisted), `阴寒伤害 · 盾前减伤 ${raw - reduced}`)).toBe(true)
    expect(ticks(resisted, '阴寒内伤').map((event) => event.hpDelta)).toEqual([-20, -20])
    expect(ticks(resisted, '火毒暗伤').map((event) => event.hpDelta)).toEqual([-16, -16])
    expect(ticks(both, '阴寒内伤').map((event) => event.hpDelta)).toEqual([-15, -15])
    expect(ticks(both, '火毒暗伤').map((event) => event.hpDelta)).toEqual([-13, -13])
  })

  it('第 27 关重甲限制实际刀剑外功，绝技、掌法和卸马分别沿用实际防御', () => {
    const stage = trialStageOf(27)!
    const options = { enemyMain: { ...stage.boss, atk: 100, mp: enemy.mp, combat: { ...stage.boss.combat, openingShield: 120 } },
      surviveRounds: 2, rng: () => 0.99 }
    const gear = { ...loadout, weaponId: 'xuantie_dagger', outerSkillId: 'quanzhen_jianfa', ultSkillId: 'yiyang_zhi' }
    const stats = computeDerivedStats(player, gear)
    const report = fight(gear, options)
    const blocked = mainCast(report)
    const raw = strikeDamage(stats.atk, SKILLS.quanzhen_jianfa.powerRatio, 1, innerPressure(stats.maxMp, enemy.mp), blocked.hitResult === 'CRIT', 1)
    const defended = Math.round(damageAfterDefense(raw, 300, player.level))
    const armorDamage = Math.round(defended / 2)
    expect(blocked).toMatchObject({ hpDelta: Math.min(0, 120 - armorDamage), shieldAbsorbed: Math.min(120, armorDamage) })
    expect(tagged(blocked, `重甲 · 刀剑破甲无效 · 盾前减伤 ${(defended - armorDamage).toLocaleString()}`)).toBe(true)
    expect(tagged(blocked, '固定破甲')).toBe(false)
    expect(tagged(blocked, '点防御')).toBe(false)
    expect(tagged(report.events.find((event) => event.skillId === 'yiyang_zhi')!, '穿透 195 点防御')).toBe(true)

    const palm = mainCast(fight({ ...gear, outerSkillId: 'lvshuang_pobing' }, options))
    expect(tagged(palm, '固定破甲 45 点防御')).toBe(true)
    expect(tagged(palm, '重甲')).toBe(false)
    const dismounted = fight({ ...gear, relicBookId: 'wumu_yishu' }, options)
    const opening = effectEvents(dismounted, 'wumu_yishu').find((event) => event.statusApplied === '卸马')!
    expect(dismounted.events.indexOf(opening)).toBeLessThan(dismounted.events.indexOf(mainCast(dismounted)))
    expect(tagged(mainCast(dismounted), '重甲')).toBe(false)
    expect(mainCast(dismounted).hpDelta!).toBeLessThan(blocked.hpDelta!)
  })

  it('侠义按实际目标的正邪判定，金牌把基础克制翻倍并单独结算金国增伤', () => {
    function strike(karma: number, accId: string | null = null, alignment: 'RIGHTEOUS' | 'HERETIC' | 'NEUTRAL' = 'HERETIC') {
      return mainCast(fight({ accId }, { player: { ...player, stats: { ...player.stats, karma } }, surviveRounds: 1,
        enemyMain: { ...enemy, combat: { alignment, faction: 'JIN', openingShield: 20 } } }))
    }
    const baseline = strike(0)
    expect(strike(99).hpDelta).toBe(baseline.hpDelta)
    expect(strike(1_000, null, 'NEUTRAL').hpDelta).toBe(baseline.hpDelta)
    expect(strike(1_500).hpDelta).toBe(strike(1_000).hpDelta)
    const baseDamage = 20 - baseline.hpDelta!
    const normal = strike(500)
    expect(normal.hpDelta).toBe(20 - Math.round(baseDamage * 1.05))
    const baseWithBadge = Math.round(baseDamage * 1.25)
    const boosted = Math.round(baseWithBadge * 1.10)
    const matching = strike(500, badge)
    expect(matching.hpDelta).toBe(20 - boosted)
    expect(tagged(matching, `侠义（完颜洪烈染血贴身金牌） · 克敌增伤 +${boosted - baseWithBadge}`)).toBe(true)
    expect(strike(-500, badge).hpDelta).toBe(20 - baseWithBadge)
    expect(strike(-500, badge, 'RIGHTEOUS').hpDelta).toBe(matching.hpDelta)
  })

  it('少室山逐个读取实际出手者的水系兵刃与侠义', () => {
    const fighter = (id: string, karma: number, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id, stats: { ...player.stats, karma } }, loadout: { ...loadout, outerSkillId: waterSkill, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-element-karma', [
      fighter('a', -500, { weaponId: spear }), fighter('b', -500, { accId: badge }), fighter('c', 500, { accId: badge }),
    ], () => 0.99)
    const hits = report.events.filter((event) => event.round === 1 && event.type === 'SKILL_CAST' && event.actorSlot.startsWith('ALLY'))
    expect(hits.filter((event) => tagged(event, '水系增伤')).map((event) => event.actorSlot)).toEqual(['ALLY_MAIN'])
    expect(hits.filter((event) => tagged(event, '侠义')).map((event) => event.actorSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT'])
    expect(tagged(hits.find((event) => event.actorSlot === 'ALLY_LEFT')!, '侠义（完颜洪烈染血贴身金牌）')).toBe(true)
  })

  it.each([false, true])('历练第 10 关按已胜过 %s 发枪谱，装配后可用水系伤害和每小时 300 真气', (previouslyCleared) => {
    const store = newStore('DEMO')
    try {
      store.player.level = 10
      store.player.realmTier = 1
      Object.assign(store.player.stats, { str: 10, con: 18, agi: 0, intStat: 10, karma: 0 })
      store.trial.maxStageId = 15
      if (previouslyCleared) store.trial.rewardedStageIds.push(10)
      store.trial.stageHours['10'] = TRIAL_PATROL_HOURS[10]
      store.updateLoadout(loadout)
      store.challengeTrialStage(10)
      expect(store.activeBattle).toMatchObject({ winner: 'ALLY' })
      expect(store.activeBattle?.rewards?.items).toContainEqual({ id: waterSkill, name: '黄河断魂枪', tier: 'blue' })
      if (previouslyCleared) expect(store.activeBattle?.rewards).toMatchObject({ qiExp: 0, silver: 0 })
      store.skipBattleToEnd()
      expect(store.learnedSkills[waterSkill]).toBe(1)
      store.closeBattleStage()

      store.ownedItemIds.push(spear, pearl)
      const rate = store.effectiveQiPerHour
      store.equipItem(pearl)
      expect(store.effectiveQiPerHour).toBe(rate + 300)
      store.equipItem(spear)
      store.updateLoadout({ outerSkillId: waterSkill })
      store.trial.stageHours['10'] = TRIAL_PATROL_HOURS[10]
      store.challengeTrialStage(10)
      expect(store.activeBattle?.rewards).toBeUndefined()
      expect(tagged(mainCast(store.activeBattle!), '水系增伤')).toBe(true)
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('参仙玉佩、雪翎帽和苍狼白鹿骨佩', () => {
  const jade = trialPartId('changbai_canxian', 'ACC')
  const cap = trialPartId('damo_qibing', 'HEAD')
  const pendant = trialPartId('damo_qibing', 'ACC')
  const dummy = { ...enemy, hp: 100_000 }

  it('玉佩提高实战气血上限，按盾后气血严格跌破两成触发一次', () => {
    const report = fight({ accId: jade }, { surviveRounds: 1 })
    expect(mainUnit(report).maxHp).toBe(Math.round(mainUnit(fight({}, { surviveRounds: 1 })).maxHp * 1.15))
    const fighter = { unit: { ...mainUnit(report), maxHp: 1000 }, shield: 100 }
    const attacker = { unit: report.units.find((unit) => unit.slot === 'ENEMY_MAIN')!, atk: dummy.atk, shield: 0 }
    const effects = resolveBattleLoadout({ ...loadout, accId: jade }).effects
    const events: BattleEventDTO[] = []
    const source = { sourceId: attacker.unit.id, sourceName: attacker.unit.name }
    const hit = (hp: number, damage: number, round: number) => applyDirectedDamage({ fighter, hp, effects, defense: 0 },
      { source, attacker, attackerHp: attacker.unit.hp, damage, round, label: '命中' }, events).hp
    expect(hit(300, 100, 1)).toBe(300)
    expect(hit(300, 100, 1)).toBe(200)
    expect(events.some((event) => event.statusApplied === '蛇血狂怒')).toBe(false)
    expect(hit(200, 1, 1)).toBe(199)
    endStatusRound(fighter, 1, events)
    endStatusRound(fighter, 2, events)
    expect(hit(300, 101, 3)).toBe(199)
    expect(events.filter((event) => event.effectSourceId === jade)).toMatchObject([
      { round: 1, statusApplied: '蛇血狂怒', statusRounds: 2 },
      { round: 2, statusRemoved: '蛇血狂怒', statusRounds: 0 },
    ])
  })

  it.each([false, true])('玉佩攻击加成在两轮实际出手生效，逆乱六件同时穿戴 %s', (withSet) => {
    const gear = withSet ? equipped('niluan_jiuyin', ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS']) : {}
    const patch = { ...gear, accId: jade }
    const wearer = { ...player, stats: { ...player.stats, agi: 45 } }
    const stats = computeDerivedStats(wearer, { ...loadout, ...patch })
    const initialMultiplier = damageAfterDefense(30, stats.def, wearer.level) * (withSet ? 0.75 : 1)
    const enemyMain = { ...dummy, atk: Math.round(stats.maxHp * 0.85 / initialMultiplier), combat: {
      speed: 5000, openingRage: 100, rageMove: { id: 'test_rage', name: '开场重击', powerRatio: 30, form: 'PALM' as const },
    } }
    const report = fight(patch, { player: wearer, enemyMain, surviveRounds: 3, rng: () => 0.99 })
    const casts = report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')
    expect(casts.map(({ round, hitResult }) => ({ round, hitResult }))).toEqual([1, 2, 3].map((round) => ({ round, hitResult: withSet ? 'CRIT' : 'HIT' })))
    const attackMultiplier = withSet ? [2.2, 2.2, 1.8] : [1.4, 1.4, 1]
    expect(casts.map((event) => event.hpDelta)).toEqual(attackMultiplier.map((multiplier, index) =>
      -strikeDamage(Math.round(stats.atk * multiplier), 1, 1, innerPressure(stats.maxMp, dummy.mp), withSet, index + 1, withSet ? 1.75 : 1)))
    expect(casts[0].segments.some((segment) => segment.type === 'tag' && segment.text.includes('蛇血狂怒 · 攻击 +40% · 增伤 +'))).toBe(true)
    expect(casts[2].segments.some((segment) => segment.type === 'tag' && segment.text.includes('蛇血狂怒'))).toBe(false)
  })

  it('羊皮雪翎帽分别抵抗阴寒直伤、阴寒跳伤和原有毒伤', () => {
    const options = {
      player: { ...player, stats: { ...player.stats, con: 40 } },
      enemyMain: { ...dummy, atk: 300, combat: { openingRage: 100, rageSkillId: 'cuixin_zhang',
        periodicOnHit: { status: 'poison' as const, attackPercent: 20, rounds: 1 } } },
      surviveRounds: 2, rng: () => 0.99,
    }
    const baseline = fight({}, options)
    const resisted = fight({ headId: cap }, options)
    const hits = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN')
    const [cold, ordinary] = hits(baseline)
    const [reduced, unaffected] = hits(resisted)
    expect(reduced.hpDelta).toBe(-Math.round(-cold.hpDelta! * 0.9))
    expect(reduced.segments.some((segment) => segment.type === 'tag' && segment.text.includes('羊皮雪翎帽 · 阴寒伤害 · 盾前减伤'))).toBe(true)
    expect(unaffected.hpDelta).toBe(ordinary.hpDelta)
    const ticks = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')
    expect(ticks(resisted).map((event) => event.hpDelta)).toEqual(ticks(baseline).map((event) => -Math.round(-event.hpDelta! * 0.9)))
    expect(ticks(resisted).some((event) => event.effectSourceId === 'cuixin_zhang')).toBe(true)
  })

  it('骨佩可由伙伴装备，实际行动前三轮提速，第四轮恢复', () => {
    const patch = { leftCompanionId: 'guojing', rightCompanionId: 'tanchuduan' }
    const speed = computeDerivedStats(player, { ...loadout, ...patch }).speed
    const options = { enemyMain: { ...dummy, atk: 100, combat: { speed: speed * 1.05 } }, surviveRounds: 4, rng: () => 0.99 }
    const baseline = fight(patch, options)
    const report = fight({ ...patch, companionEquipment: { guojing: { ACC: pendant } } }, options)
    const first = (result: BattleReportDTO, round: number) => {
      const move = result.events.find((event) => event.round === round && (event.type === 'SKILL_CAST' || event.type === 'GUARD_BLOCK'))
      return move?.type === 'GUARD_BLOCK' ? 'ENEMY_MAIN' : move?.actorSlot
    }
    expect(first(baseline, 1)).toBe('ENEMY_MAIN')
    expect([1, 2, 3, 4].map((round) => first(report, round))).toEqual(['ALLY_MAIN', 'ALLY_MAIN', 'ALLY_MAIN', 'ENEMY_MAIN'])
    expect(effectEvents(report, pendant).filter((event) => event.statusApplied).map((event) => [event.actorSlot, event.targetSlot, event.statusRounds]))
      .toEqual([['ALLY_LEFT', 'ALLY_LEFT', 3], ['ALLY_LEFT', 'ALLY_MAIN', 3], ['ALLY_LEFT', 'ALLY_RIGHT', 3]])
    expect(effectEvents(report, pendant).filter((event) => event.statusRemoved).map((event) => event.round)).toEqual([3, 3, 3])
  })

  it('少室山全员享用骨佩提速，玉佩气血加成只作用于实际穿戴者', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, con: 100 } }
    const fighter = (id: string, accId: string | null) => ({ player: { ...character, id }, loadout: { ...loadout, accId }, learnedSkills: {} })
    const report = simulateShaoshiRaid('raid-jade-and-speed', [fighter('a', jade), fighter('b', pendant), fighter('c', null)], () => 0.99)
    const members = report.units.filter((unit) => unit.slot.startsWith('ALLY'))
    const baseHp = members.find((unit) => unit.slot === 'ALLY_RIGHT')!.maxHp
    expect(mainUnit(report).maxHp).toBe(Math.round(baseHp * 1.15))
    expect(members.find((unit) => unit.slot === 'ALLY_LEFT')?.maxHp).toBe(baseHp)
    expect(effectEvents(report, pendant).filter((event) => event.statusApplied).map((event) => [event.actorSlot, event.targetSlot, event.statusRounds]))
      .toEqual([['ALLY_LEFT', 'ALLY_MAIN', 3], ['ALLY_LEFT', 'ALLY_LEFT', 3], ['ALLY_LEFT', 'ALLY_RIGHT', 3]])
  })
})

describe('描金折扇、灵蛇杖、碧玉箫与玄铁重剑', () => {
  const fan = 'baituo_fan'
  const staff = 'lingshe_zhang'
  const jade = trialPartId('bihai_chaosheng', 'WEAPON')
  const oldJade = 'biyu_xiao'
  const sword = 'xuantie_heavysword'
  const baituo = { ...player, currentSectId: 'baituo', sectRank: 1 }
  const taohua = { ...player, currentSectId: 'taohua', sectRank: 4 }
  const tagged = (event: BattleEventDTO, text: string) =>
    event.segments.some((segment) => segment.type === 'tag' && segment.text.includes(text))
  const darts = (report: BattleReportDTO) => effectEvents(report, fan).filter((event) => tagged(event, '扇底藏针'))
  const wave = (report: BattleReportDTO) => effectEvents(report, sword).filter((event) => tagged(event, '重剑余波'))
  const song = (report: BattleReportDTO) => report.events.filter((event) => event.skillId === 'bihai_chaosheng')

  it('描金折扇依次发出三针，针毒减防影响下一针，盾只吸收物伤', () => {
    const enemyMain = { ...enemy, combat: { def: 400, openingShield: 2000 } }
    const report = fight({ weaponId: fan }, { enemyMain, surviveRounds: 1 })
    expect(computeDerivedStats(player, { ...loadout, weaponId: fan })).toMatchObject({ atk: 286, speed: 158, dodge: 12 })
    expect(darts(report)).toMatchObject([
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: 0, shieldAbsorbed: 32 },
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: 0, shieldAbsorbed: 34 },
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: 0, shieldAbsorbed: 34 },
    ])
    const poison = effectEvents(report, fan).filter((event) => event.statusApplied === '扇骨针毒')
    expect(poison.map((event) => event.statusStacks)).toEqual([1, 2, 3])
    expect(tagged(poison[0], '防御 −15%')).toBe(true)
    expect(effectEvents(report, fan).find((event) => event.type === 'DOT_TICK'))
      .toMatchObject({ round: 1, hpDelta: -87, statusRounds: 1, statusStacks: 3 })
  })

  it('毒针击倒目标后改射存活敌人，追加出手仍只发一轮毒针', () => {
    const retargeted = fight({ weaponId: fan }, { enemyGuards: [{ ...enemy, hp: 335 }], surviveRounds: 1 })
    expect(darts(retargeted)).toMatchObject([
      { targetSlot: 'ENEMY_LEFT', hpDelta: -50 },
      { targetSlot: 'ENEMY_MAIN', hpDelta: -57 },
      { targetSlot: 'ENEMY_MAIN', hpDelta: -57 },
    ])
    expect(effectEvents(retargeted, fan).filter((event) => event.statusApplied)).toMatchObject([
      { targetSlot: 'ENEMY_MAIN', statusStacks: 1 }, { targetSlot: 'ENEMY_MAIN', statusStacks: 2 },
    ])
    const enemyMain = { ...enemy, combat: { statusOnHit: { status: 'STUN', rounds: 2 } } } as const
    const combo = fight({ weaponId: fan, outerSkillId: 'shuangshou_hubo' }, { enemyMain, rng: () => 0 })
    expect(effectEvents(combo, 'shuangshou_hubo').some((event) => event.round === 1 && event.type === 'SKILL_CAST')).toBe(true)
    expect(darts(combo).map((event) => event.round)).toEqual([1, 1, 1])
    expect(effectEvents(combo, fan).find((event) => event.round === 2 && event.type === 'DOT_TICK'))
      .toMatchObject({ statusRemoved: '扇骨针毒', statusStacks: 0 })
  })

  it('扇骨针毒被万蛇噬骨消耗后，15% 减防立即消失', () => {
    const report = fight()
    const target: EnemyBattleState = { unit: report.units.find((unit) => unit.slot === 'ENEMY_MAIN')!, atk: 250, shield: 0 }
    const poison = effectsFrom(ITEMS[fan]).find((effect) => effect.kind === 'ACTION_END_DARTS')!
    const source = { ...poison, slot: 'ALLY_MAIN' as const }
    const events: BattleEventDTO[] = []
    for (let hit = 0; hit < 3; hit++) applyPeriodicOnHit(source, target, 20_000, poison.rule, { attack: 286, round: 1, rng: () => 0 }, events)
    expect(battleDefense(target, 400, 1)).toBe(340)
    const effects = resolveBattleLoadout({ ...loadout, ...equipped('baituo_yushe', ['ARMOR', 'HEAD', 'WRIST', 'BELT', 'BOOTS', 'ACC']) }).effects
    expect(resolvePoisonBurst(mainUnit(report), target, 19_000, effects, 1, events)).toBe(18_750)
    expect(battleDefense(target, 400, 1)).toBe(400)
    expect(events).toContainEqual(expect.objectContaining({ statusRemoved: '扇骨针毒', statusStacks: 0 }))
  })

  it('灵蛇杖按穿戴者所属门派择主，常规命中和受击各叠两层且最多三层', () => {
    const build = { weaponId: staff }
    const report = fight(build, { player: baituo, surviveRounds: 1 })
    const applied = (result: BattleReportDTO) => effectEvents(result, staff).filter((event) => event.statusApplied === '灵蛇剧毒')
    expect(computeDerivedStats(baituo, { ...loadout, ...build }).parry).toBe(25)
    expect(applied(report)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', statusRounds: 2, statusStacks: 2 },
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', statusRounds: 2, statusStacks: 3 },
    ])
    const tick = effectEvents(report, staff).find((event) => event.type === 'DOT_TICK')!
    expect(tick).toMatchObject({ hpDelta: -158, statusRounds: 1, statusStacks: 3 })
    expect(tagged(tick, '毒伤 +32')).toBe(true)
    expect(applied(fight({ ...build, leftCompanionId: 'ouyangfeng' }, { surviveRounds: 1 }))).toEqual([])
    const dodged = fight(build, { player: baituo, enemyMain: { ...enemy, combat: { dodge: 100 } }, surviveRounds: 1 })
    expect(applied(dodged)).toMatchObject([{ statusStacks: 2 }])
    expect(effectEvents(dodged, staff).find((event) => event.type === 'DOT_TICK')?.hpDelta).toBe(-105)
  })

  it('少室山的折扇只给穿戴者发针，灵蛇杖分别给实际被攻击和攻击自己的敌人叠毒', () => {
    const report = simulateShaoshiRaid('raid-fan-staff', [
      { player, loadout, learnedSkills: {} },
      { player: baituo, loadout: { ...loadout, weaponId: staff }, learnedSkills: {} },
      { player, loadout: { ...loadout, weaponId: fan }, learnedSkills: {} },
    ], () => 0.99)
    expect(darts(report).filter((event) => event.round === 1)).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', hpDelta: -57 },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', hpDelta: -57 },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', hpDelta: -57 },
    ])
    expect(effectEvents(report, staff).filter((event) => event.round === 1 && event.statusApplied)).toMatchObject([
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', statusStacks: 2 },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_RIGHT', statusStacks: 2 },
    ])
    expect(effectEvents(report, staff).filter((event) => event.round === 1 && event.type === 'DOT_TICK'))
      .toMatchObject([{ hpDelta: -105 }, { hpDelta: -105 }])
  })

  it('东海万年碧玉箫的桃花岛真传对三个目标分别绕盾和封穴，整招只扣一次怒气', () => {
    const target = { ...enemy, combat: { openingShield: 9000, def: 400 } }
    const options = { player: taohua, enemyMain: target, enemyGuards: [target, target], surviveRounds: 3 }
    const build = { weaponId: jade, stance: 'AGILE' as const, outerSkillId: 'yuenv_jian', ultSkillId: 'bihai_chaosheng' }
    const report = fight(build, options)
    const casts = song(report)
    expect(casts).toMatchObject([
      { round: 2, targetSlot: 'ENEMY_MAIN', hpDelta: -1374, rageDelta: -43, mpDelta: -53 },
      { round: 2, targetSlot: 'ENEMY_LEFT', hpDelta: -1115 },
      { round: 2, targetSlot: 'ENEMY_RIGHT', hpDelta: -1115 },
    ])
    expect(casts.every((event) => event.shieldDelta === undefined)).toBe(true)
    expect(casts.filter((event) => event.rageDelta !== undefined)).toHaveLength(1)
    expect(tagged(casts[0], '音律绕盾 1,374 · 增伤 +1,374')).toBe(true)
    expect(tagged(casts[0], '怒气 -43（节省 42）')).toBe(true)
    expect(effectEvents(report, jade).filter((event) => event.statusApplied === '封穴').map((event) => event.targetSlot))
      .toEqual(['ENEMY_MAIN', 'ENEMY_LEFT', 'ENEMY_RIGHT'])
    const regular = report.events.find((event) => event.round === 3 && event.skillId === 'yuenv_jian')!
    expect(regular).toMatchObject({ hpDelta: 0, shieldAbsorbed: 671 })
    expect(effectEvents(report, jade).filter((event) => event.hpDelta === -120).map((event) => event.round)).toEqual([1, 3])
    const junior = fight(build, { ...options, player: { ...taohua, sectRank: 3 } })
    expect(song(junior)[0]).toMatchObject({ round: 2, rageDelta: -85, hpDelta: 0, shieldAbsorbed: 1374 })
    expect(effectEvents(junior, jade).filter((event) => event.statusApplied === '封穴')).toEqual([])
  })

  it('剧情碧玉箫按内力优势提高音律伤害，桃花弟子节省 30 怒气', () => {
    const build = { weaponId: oldJade, ultSkillId: 'bihai_chaosheng', outerSkillId: 'yuenv_jian' }
    const enemyMain = { ...enemy, mp: 100, combat: { openingShield: 9000, def: 400 } }
    const report = fight(build, { player: { ...taohua, sectRank: 1 }, enemyMain, surviveRounds: 2 })
    const hit = song(report)[0]
    expect(hit).toMatchObject({ hpDelta: -889, rageDelta: -55 })
    expect(hit.shieldDelta).toBeUndefined()
    expect(tagged(hit, '内力优势强化 +25% · 增伤 +39')).toBe(true)
    expect(effectEvents(report, oldJade).filter((event) => event.statusApplied === '封穴')).toEqual([])
    expect(song(fight(build, { enemyMain }))[0]).toMatchObject({ hpDelta: 0, shieldAbsorbed: 889, rageDelta: -85 })
  })

  it('重剑降速，实际剑招无视招架，余波分别经过其他敌人的防御和护盾', () => {
    const build = { weaponId: sword, outerSkillId: 'yuenv_jian' }
    const enemyMain = { ...enemy, combat: { def: 400, openingShield: 65 } }
    const enemyGuards = [{ ...enemy, combat: { parry: 100, openingShield: 100 } }, { ...enemy, combat: { openingShield: 5000 } }]
    const report = fight(build, { enemyMain, enemyGuards, surviveRounds: 1 })
    const primary = mainCast(report)
    expect(computeDerivedStats(player, { ...loadout, ...build }).speed).toBe(85)
    expect(primary).toMatchObject({ targetSlot: 'ENEMY_LEFT', hpDelta: -937, shieldAbsorbed: 100, hitResult: 'HIT' })
    expect(tagged(primary, '无视招架')).toBe(true)
    expect(tagged(primary, '招式伤害 +80% · 增伤 +461')).toBe(true)
    expect(wave(report)).toMatchObject([
      { targetSlot: 'ENEMY_MAIN', hpDelta: -107, shieldAbsorbed: 65, statusRemoved: '护盾' },
      { targetSlot: 'ENEMY_RIGHT', hpDelta: 0, shieldAbsorbed: 311 },
    ])
    const saber = fight({ ...build, outerSkillId: 'wuhu_duanmen_dao' }, { enemyMain, enemyGuards, surviveRounds: 1 })
    expect(mainCast(saber).hitResult).toBe('PARRY')
    expect(wave(saber)).toEqual([])
    const dodged = fight(build, { enemyMain, enemyGuards: [{ ...enemy, combat: { dodge: 100 } }], surviveRounds: 1 })
    expect(dodged.events).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', type: 'DODGE' }))
    expect(wave(dodged)).toMatchObject([{ targetSlot: 'ENEMY_MAIN', hpDelta: -107 }])
  })

  it('重剑内劲读取当前气血与基础臂力，普通伤害被全挡时仍按剩余气血截断', () => {
    const strong = { ...player, stats: { ...player.stats, str: 70 } }
    const enemyMain = { ...enemy, combat: { openingShield: 5000, speed: 50 } }
    const build = { weaponId: sword }
    const report = fight(build, { player: strong, enemyMain })
    const extra = (result: BattleReportDTO) => effectEvents(result, sword).filter((event) => tagged(event, '重剑内劲'))
    expect(extra(report)).toMatchObject([{ round: 2, targetSlot: 'ENEMY_MAIN', hpDelta: -47 }])
    expect(report.events.find((event) => event.round === 2 && event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN'))
      .toMatchObject({ hpDelta: 0, shieldAbsorbed: 1872 })
    expect(extra(fight(build, { player: strong, enemyMain: { ...enemyMain, hp: 20 } }))).toMatchObject([{ round: 2, hpDelta: -20 }])
    expect(extra(fight(build, { player: { ...strong, stats: { ...strong.stats, str: 69 } }, enemyMain }))).toEqual([])
  })

  it('柯镇恶穿戴伏魔杖后自行蓄怒，前两次伏魔杖法眩晕，第 3 回合毒菱必暴', () => {
    const weapon = 'fumo_staff'
    const enemyMain = { ...enemy, combat: { def: 400, openingShield: 9000 } }
    const report = fight({ rightCompanionId: 'kezhene', companionWeapons: { kezhene: weapon } }, { enemyMain, surviveRounds: 3 })
    expect(report.units.find((unit) => unit.slot === 'ALLY_RIGHT')?.weaponName).toBe('伏魔大铁杖')
    expect(effectEvents(report, weapon).filter((event) => event.statusApplied === '点穴眩晕')).toMatchObject([
      { round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', statusRounds: 1 },
      { round: 2, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', statusRounds: 1 },
    ])
    const dart = report.events.find((event) => event.skillId === 'ke_poison_dart')!
    expect(dart).toMatchObject({ round: 3, actorSlot: 'ALLY_RIGHT', hitResult: 'CRIT', rageDelta: -85, mpDelta: -220, shieldAbsorbed: 871 })
    expect(tagged(dart, '伏魔大铁杖 · 本次必暴')).toBe(true)
    expect(report.events).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_RIGHT', statusApplied: '暗器针毒', statusRounds: 2 }))
    const main = fight({ weaponId: weapon, rightCompanionId: 'kezhene', outerSkillId: 'fumo_zhang' }, { enemyMain, surviveRounds: 1 })
    expect(effectEvents(main, weapon).filter((event) => event.statusApplied === '点穴眩晕')).toEqual([])
  })

  it('黄药师的兵刃实际发动琴箫共鸣，怒气和内力各扣一次', () => {
    const target = { ...enemy, combat: { def: 400, openingShield: 9000 } }
    const tough = { ...player, stats: { ...player.stats, con: 40 } }
    const report = fight({ rightCompanionId: 'huangyaoshi', companionWeapons: { huangyaoshi: jade } },
      { player: tough, enemyMain: target, enemyGuards: [target], surviveRounds: 3 })
    const [front, rear] = song(report)
    expect(front).toMatchObject({ round: 3, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', hpDelta: -3516, rageDelta: -43, mpDelta: -220 })
    expect(rear).toMatchObject({ round: 3, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', hpDelta: -4929 })
    expect(rear.rageDelta).toBeUndefined()
    expect(rear.mpDelta).toBeUndefined()
    expect(song(report).every((event) => event.shieldDelta === undefined)).toBe(true)
    expect(effectEvents(report, jade).filter((event) => event.statusApplied === '封穴')).toMatchObject([
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT' }, { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN' },
    ])
  })

  it('欧阳锋和欧阳克各用自己的兵刃出招，队长的攻击不套用伙伴毒伤', () => {
    const report = fight({
      leftCompanionId: 'ouyangfeng', rightCompanionId: 'ouyangke',
      companionWeapons: { ouyangfeng: staff, ouyangke: fan },
    }, { surviveRounds: 1 })
    expect(darts(report).map((event) => event.actorSlot)).toEqual(['ALLY_RIGHT', 'ALLY_RIGHT', 'ALLY_RIGHT'])
    const bites = effectEvents(report, staff).filter((event) => event.statusApplied === '灵蛇剧毒')
    expect(bites).toMatchObject([{ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', statusStacks: 2 }])
    expect(effectEvents(report, staff).find((event) => event.type === 'DOT_TICK'))
      .toMatchObject({ actorSlot: 'ALLY_LEFT', hpDelta: -343 })
    expect(effectEvents(report, fan).find((event) => event.type === 'DOT_TICK'))
      .toMatchObject({ actorSlot: 'ALLY_RIGHT', hpDelta: -192 })
  })

  it('真·绿玉棒和金鞘宝刀按实际持有它们的伙伴触发封招和破胆', () => {
    const stick = 'dagou_stick_true'
    const saber = trialPartId('xizheng_jindao', 'WEAPON')
    const report = fight({
      rightCompanionId: 'huangrong', leftCompanionId: 'guojing',
      companionWeapons: { huangrong: stick, guojing: saber },
    }, { surviveRounds: 1, rng: () => 0.3999 })
    expect(effectEvents(report, stick).filter((event) => event.statusApplied === '封招'))
      .toMatchObject([{ round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN' }])
    expect(effectEvents(report, saber).filter((event) => event.statusApplied === '攻击降低'))
      .toMatchObject([{ round: 1, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', statusRounds: 1 }])
    expect(report.events).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_RIGHT', skillId: 'dagou_bangfa' }))
  })

  it('试玩从配装换给伙伴并进入历练，单件装备只能在当前阵容分配一次', () => {
    const store = newStore('DEMO')
    try {
      const staffId = 'fumo_staff'
      store.companionAffinity.kezhene.recruited = true
      store.companionAffinity.huangrong.recruited = true
      store.player.level = player.level
      store.player.realmTier = player.realmTier
      Object.assign(store.player.stats, player.stats, { str: 25 })
      store.trial.maxStageId = 7
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      if (!store.ownedItemIds.includes(staffId)) store.ownedItemIds.push(staffId)
      store.updateLoadout({ ...loadout, rightCompanionId: 'kezhene' })
      store.equipItem(staffId)
      expect(store.currentLoadout.weaponId).toBe(staffId)
      store.equipCompanionWeapon('kezhene', staffId)
      expect(store.currentLoadout).toMatchObject({ weaponId: null, companionWeapons: { kezhene: staffId } })
      store.challengeTrialStage(7)
      expect(store.activeBattle!.units.find((unit) => unit.slot === 'ALLY_RIGHT')?.weaponName).toBe('伏魔大铁杖')
      expect(store.activeBattle!.events).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_RIGHT', skillId: 'fumo_zhang' }))
      store.skipBattleToEnd()
      store.closeBattleStage()
      store.updateLoadout({ rightCompanionId: 'huangrong' })
      store.equipCompanionWeapon('huangrong', staffId)
      expect(store.currentLoadout.companionWeapons).toEqual({})
      store.equipItem(staffId)
      expect(store.currentLoadout.weaponId).toBe(staffId)
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('兵刃、招式与阵营克制', () => {
  const blade = { ...enemy, combat: { weapon: { form: 'BLADE', tier: 'blue' } } } as const
  const boss = (id: number) => ({ ...trialStageOf(id)!.boss, hp: 20_000, atk: 150, mp: 500 })
  const enemyCasts = (report: BattleReportDTO) =>
    report.events.filter((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')
  const applied = (report: BattleReportDTO, name: string) => report.events.filter((event) => event.statusApplied === name)
  const tag = (text: string, tone: 'gold' | 'jade' | 'purple' = 'gold') => ({ type: 'tag', text, tone })

  it('配置中的外功、绝技与兵刃都有出招分类', () => {
    expect(Object.values(SKILLS).filter((skill) => (skill.slot === 'OUTER' || skill.slot === 'ULT') && !skill.combatForm))
      .toEqual([])
    expect(Object.values(ITEMS).filter((item) => item.slot === 'WEAPON' && !item.combatForm)).toEqual([])
  })

  it('打狗棒法在 60% 阈值内缴械，持械敌人改用降攻后的徒手招式', () => {
    const build = { outerSkillId: 'dagou_bangfa' }
    const landed = fight(build, { enemyMain: blade, surviveRounds: 1, rng: () => 0.5999 })
    expect(applied(landed, '缴械')).toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN', statusRounds: 1 }])
    const defense = computeDerivedStats(player, { ...loadout, ...build }).def
    expect(enemyCasts(landed)).toMatchObject([{ skillId: 'bare_hands', hpDelta: -incomingDamage(175, 1, defense, 1) }])
    expect(enemyCasts(landed)[0].segments).toContainEqual(tag('缴械 · 徒手出招 · 攻击降低 30%', 'jade'))
    expect(applied(fight(build, { enemyMain: blade, rng: () => 0.6 }), '缴械')).toEqual([])
    expect(applied(fight(build, { rng: () => 0 }), '缴械')).toEqual([])
  })

  it('玄铁匕首按品质和 20% 概率缴械一回合，敌人留怒后可施展兵刃招式', () => {
    const build = { weaponId: 'xuantie_dagger' }
    const armed = { ...blade, combat: { ...blade.combat, openingRage: 100, rageSkillId: 'quanzhen_jianfa' } }
    const rolls = vi.fn().mockReturnValueOnce(0.1999).mockReturnValue(0.99)
    const report = fight(build, { enemyMain: armed, surviveRounds: 2, rng: rolls })
    expect(applied(report, '缴械')).toMatchObject([{ round: 1, statusRounds: 1 }])
    expect(enemyCasts(report)).toMatchObject([
      { round: 1, skillId: 'bare_hands' },
      { round: 2, skillId: 'quanzhen_jianfa' },
    ])
    expect(report.events.filter((event) => event.actorSlot === 'ENEMY_MAIN' && (event.rageDelta ?? 0) < 0))
      .toMatchObject([{ round: 2, rageDelta: -85 }])
    const purple = { ...armed, combat: { ...armed.combat, weapon: { ...blade.combat.weapon, tier: 'purple' as const } } }
    expect(applied(fight(build, { enemyMain: purple, rng: () => 0 }), '缴械')).toEqual([])
    expect(applied(fight(build, { enemyMain: armed, rng: () => 0.2 }), '缴械')).toEqual([])
    const claw = fight(build, { enemyMain: { ...armed, combat: { ...armed.combat, rageSkillId: 'jiuyin_baiguzhua' } },
      surviveRounds: 1, rng: () => 0.1999 })
    expect(applied(claw, '缴械')).toHaveLength(1)
    expect(enemyCasts(claw)).toMatchObject([{ skillId: 'jiuyin_baiguzhua' }])
  })

  it('天蚕掌套擒下刀剑外功并保留护盾，按实挡量反震与削减下一回合攻击', () => {
    const build = { ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']), weaponId: 'tiancan_glove' }
    const rolls = vi.fn().mockReturnValueOnce(0.3499).mockReturnValue(0.99)
    const report = fight(build, { enemyMain: blade, rng: rolls })
    const { def, parryAbsorb } = computeDerivedStats(player, { ...loadout, ...build })
    const blocked = incomingDamage(250, 1, def, 1)
    expect(report.events.find((event) => event.round === 1 && event.statusApplied === '护盾')?.shieldDelta).toBeGreaterThan(0)
    expect(enemyCasts(report)[0]).toMatchObject({ round: 1, hitResult: 'PARRY', hpDelta: 0 })
    expect(enemyCasts(report)[0].shieldDelta).toBeUndefined()
    expect(enemyCasts(report)[0].segments).toContainEqual(tag('天蚕金丝掌套 · 空手夺白刃', 'jade'))
    expect(effectEvents(report, 'tiancan_glove').find((event) => event.hpDelta)).toMatchObject({
      round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -Math.round(blocked * 0.30),
    })
    expect(applied(report, '攻击降低')).toMatchObject([{ round: 1, statusRounds: 1 }])
    expect(enemyCasts(report)[1]).toMatchObject({
      round: 2, hpDelta: 0, shieldAbsorbed: Math.round(incomingDamage(175, 1, def, 1) * (100 - parryAbsorb) / 100),
    })
    const [missedCatch, axe, ultimate] = [
      fight(build, { enemyMain: blade, rng: () => 0.35 }),
      fight(build, { enemyMain: { ...blade, combat: { weapon: { form: 'AXE', tier: 'blue' } } }, rng: () => 0 }),
      fight(build, { enemyMain: { ...blade, combat: { ...blade.combat, openingRage: 100, rageSkillId: 'tonggui_jianfa' } },
        surviveRounds: 1, rng: () => 0 }),
    ]
    expect(enemyCasts(ultimate)[0].skillId).toBe('tonggui_jianfa')
    expect(effectEvents(missedCatch, 'tiancan_glove')).toEqual([])
    expect(effectEvents(axe, 'tiancan_glove')).toEqual([])
    expect(effectEvents(ultimate, 'tiancan_glove')).toEqual([])
  })

  it('天蚕掌套在盾后记录实际招式增伤，少室山按穿戴者的出招分类', () => {
    const build = { weaponId: 'tiancan_glove', outerSkillId: 'xianglong_18' }
    const enemyMain = { ...enemy, combat: { def: 400, openingShield: 500 } }
    const cast = mainCast(fight(build, { enemyMain }))
    expect(cast).toMatchObject({ hpDelta: -463, shieldAbsorbed: 500 })
    expect(cast.segments).toContainEqual(tag('天蚕金丝掌套 · 招式伤害 +35% · 增伤 +250'))
    const shielded = mainCast(fight(build, { enemyMain: { ...enemyMain, combat: { ...enemyMain.combat, openingShield: 5000 } } }))
    expect(shielded).toMatchObject({ hpDelta: 0, shieldAbsorbed: 963 })
    expect(shielded.segments).toContainEqual(tag('天蚕金丝掌套 · 招式伤害 +35% · 增伤 +0'))
    const report = simulateShaoshiRaid('raid-technique-type', [
      { player, loadout, learnedSkills: {} },
      { player, loadout: { ...loadout, weaponId: build.weaponId }, learnedSkills: {} },
      { player, loadout: { ...loadout, ...build, outerSkillId: 'yuenv_jian' }, learnedSkills: {} },
    ])
    const boosted = report.events.filter((event) => event.round === 1 && event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.startsWith('天蚕金丝掌套 · 招式伤害 +35%'),
    ))
    expect(boosted).toMatchObject([{ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT' }])
  })

  it('伏魔杖只克制侠义为负的邪派，北斗镜读取实际攻击者与道家招式', () => {
    const build = { weaponId: 'fumo_staff' }
    const combat = { def: 80, alignment: 'HERETIC', karma: -1, openingShield: 180 } as const
    const cast = mainCast(fight(build, { enemyMain: { ...enemy, combat } }))
    expect(cast).toMatchObject({ hpDelta: -124, shieldAbsorbed: 180 })
    expect(cast.segments).toContainEqual(tag('伏魔大铁杖 · 克敌增伤 +70', 'purple'))
    const neutralKarma = mainCast(fight(build, { enemyMain: { ...enemy, combat: { ...combat, karma: 0 } } }))
    expect(neutralKarma).toMatchObject({ hpDelta: -54, shieldAbsorbed: 180 })
    const mirror = { accId: trialPartId('quanzhen_beidou', 'ACC'), outerSkillId: 'quanzhen_jianfa' }
    const heretic = fight(mirror, { enemyMain: { ...enemy, combat: { alignment: 'HERETIC' } } })
    const righteous = fight(mirror, { enemyMain: { ...enemy, combat: { alignment: 'RIGHTEOUS' } } })
    expect(mainCast(heretic).segments).toContainEqual(tag('王重阳遗留纯阳八卦镜 · 招式伤害 +25% · 增伤 +46'))
    expect(enemyCasts(heretic)[0].hpDelta).toBe(-145)
    expect(enemyCasts(righteous)[0].hpDelta).toBe(-207)
  })

  it('大漠金刀让主角和伙伴按各自目标获得一次 35% 阵营增伤', () => {
    const enemyGuards = [{ ...enemy, combat: { faction: 'JIN', mounted: true } }] as const
    const build = { accId: 'dadiao_jindao', leftCompanionId: 'zhebie' }
    const shots = (report: BattleReportDTO) => report.events.filter((event) => event.skillId === 'lianzhu_shenjian')
    const options = { enemyGuards: [...enemyGuards], surviveRounds: 1 }
    const eligible = fight(build, { ...options, enemyMain: { ...enemy, combat: { faction: 'MONGOL', mounted: true } } })
    const neutral = fight(build, { ...options, enemyMain: enemy })
    expect(mainCast(eligible)).toMatchObject({ targetSlot: 'ENEMY_LEFT', hpDelta: -478 })
    expect(mainCast(eligible).segments).toContainEqual(tag('大漠金刀 · 克敌增伤 +124', 'purple'))
    expect(mainCast(neutral).hpDelta).toBe(-478)
    expect(shots(eligible)).toMatchObject([
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', hpDelta: -1251 },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', hpDelta: -1251 },
    ])
    expect(shots(eligible)[0].segments).toContainEqual(tag('大漠金刀 · 克敌增伤 +324', 'purple'))
    expect(shots(neutral).map((event) => event.hpDelta)).toEqual([-927, -927])
  })

  it('双雕白羽箭忽略 30% 轻功闪避，保留目标的先天闪避', () => {
    const build = { accId: 'shuangdiao_arrow' }
    const agile = { ...player, stats: { ...player.stats, agi: 25 } }
    const options = { player: agile, surviveRounds: 1 }
    const light = { ...enemy, combat: { dodge: 30, lightDodge: 30 } }
    const natural = { ...enemy, combat: { dodge: 30 } }
    const dodged = (report: BattleReportDTO) => report.events.some((event) => event.type === 'DODGE' && event.actorSlot === 'ALLY_MAIN')
    expect(dodged(fight({}, { ...options, enemyMain: light }))).toBe(true)
    expect(dodged(fight(build, { ...options, enemyMain: natural }))).toBe(true)
    const hit = mainCast(fight(build, { ...options, enemyMain: light }))
    expect(hit).toMatchObject({ hpDelta: -205, hitResult: 'HIT' })
    expect(hit.segments).toContainEqual(tag('双雕白羽箭 · 忽略 9 个百分点轻功闪避'))
  })

  it('真绿玉打狗棒配用打狗棒法时增加本招伤害并在 40% 阈值内封招', () => {
    const build = { weaponId: 'dagou_stick_true', outerSkillId: 'dagou_bangfa' }
    const enemyMain = { ...enemy, combat: { openingRage: 100, rageSkillId: 'jiuyin_baiguzhua' } }
    const options = { enemyMain, surviveRounds: 1 }
    const report = fight(build, { ...options, rng: () => 0.3999 })
    expect(applied(report, '封招')).toMatchObject([{ targetSlot: 'ENEMY_MAIN', statusRounds: 1 }])
    expect(enemyCasts(report)[0].skillId).toBeUndefined()
    expect(mainCast(report).segments).toContainEqual(tag('真·绿玉打狗棒 · 招式伤害 +50% · 增伤 +774'))
    for (const other of [
      fight(build, { ...options, rng: () => 0.4 }),
      fight({ ...build, outerSkillId: 'yuenv_jian' }, { ...options, rng: () => 0 }),
    ]) {
      expect(applied(other, '封招')).toEqual([])
      expect(enemyCasts(other)[0].skillId).toBe('jiuyin_baiguzhua')
    }
  })

  it('了妄的棍势可由点穴或带轻功的奇门出手破除', () => {
    const options = { enemyMain: boss(3) }
    const unprepared = fight({ stance: 'AGILE' }, options)
    const light = fight({ stance: 'AGILE', lightSkillId: 'shunxi_qianli' }, options)
    expect(applied(unprepared, '护体棍势被破')).toEqual([])
    expect(applied(light, '护体棍势被破')).toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN' }])
    expect(applied(fight({ outerSkillId: 'lanhua_shou' }, options), '护体棍势被破')).toHaveLength(1)
    const follow = (report: BattleReportDTO) => report.events.find((event) => event.round === 2 && event.skillId === 'bare_hands')
    expect(follow(light)?.hpDelta).toBe(-183)
    expect(follow(unprepared)?.hpDelta).toBeGreaterThan(-183)
  })

  it('柯镇恶首回合近战可触发软猬甲，毒菱打远程且被已配备的轻功避开', () => {
    const options = { enemyMain: boss(4) }
    const report = fight({ armorId: 'ruanwei_armor' }, options)
    expect(enemyCasts(report)).toMatchObject([
      { round: 1, hpDelta: -87 },
      { round: 2, skillId: 'ke_poison_dart', hpDelta: -130 },
    ])
    expect(applied(report, '软猬剧毒')).toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN' }])
    expect(applied(report, '暗器针毒')).toMatchObject([{ round: 2, targetSlot: 'ALLY_MAIN', statusRounds: 2 }])
    expect(report.events).toContainEqual(expect.objectContaining({
      round: 2, type: 'DOT_TICK', actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: -23,
    }))
    const light = fight({ lightSkillId: 'shunxi_qianli' }, options)
    expect(light.events).toContainEqual(expect.objectContaining({ round: 2, skillId: 'ke_poison_dart', hitResult: 'MISS', hpDelta: 0 }))
    expect(applied(light, '暗器针毒')).toEqual([])
  })

  it.each([5, 11])('历练第 %i 关只有贴身招式命中才阻断兵刃和针毒', (stage) => {
    const options = { enemyMain: boss(stage), surviveRounds: 1 }
    const close = fight({ outerSkillId: 'nanshan_zhang' }, options)
    const remote = fight({ outerSkillId: 'pikong_zhang' }, options)
    expect(applied(close, '缴械')).toMatchObject([{ targetSlot: 'ENEMY_MAIN', statusRounds: 1 }])
    expect(enemyCasts(close)[0].skillId).toBe('bare_hands')
    expect(applied(close, '暗器针毒')).toEqual([])
    expect(applied(remote, '缴械')).toEqual([])
    if (stage === 11) expect(applied(remote, '暗器针毒')).toHaveLength(1)
  })

  it('灵智首回合使用密宗大手印，刀剑破气门后停用火毒', () => {
    const options = { enemyMain: boss(12), surviveRounds: 4 }
    const palm = fight({ outerSkillId: 'nanshan_zhang' }, options)
    const sword = fight({ outerSkillId: 'yuenv_jian' }, options)
    expect(enemyCasts(sword)[0]).toMatchObject({ round: 1, skillId: 'dashouyin', hpDelta: -206 })
    expect(applied(sword, '防御降低')).toMatchObject([{ round: 1, targetSlot: 'ALLY_MAIN' }])
    expect(applied(sword, '双肋气门被破')).toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN' }])
    expect(applied(sword, '火毒暗伤')).toEqual([])
    expect(applied(palm, '火毒暗伤')).toMatchObject([{ round: 4, targetSlot: 'ALLY_MAIN', statusRounds: 2 }])
  })

  it('蛇奴的毒雾可由刚猛掌法破阵，其他架势的同招仍会受毒', () => {
    const options = { enemyMain: boss(22) }
    const breaking = fight({ stance: 'FIERCE', outerSkillId: 'nanshan_zhang' }, options)
    const guarded = fight({ stance: 'TAICHI', outerSkillId: 'nanshan_zhang' }, options)
    expect(applied(breaking, '蛇阵被破')).toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN' }])
    expect(applied(breaking, '蛇奴毒雾')).toEqual([])
    expect(applied(guarded, '蛇阵被破')).toEqual([])
    expect(applied(guarded, '蛇奴毒雾').length).toBeGreaterThan(0)
  })

  it('侯通海只累计实际命中的点穴，三次命中后眩晕两回合', () => {
    const options = { enemyMain: boss(24), surviveRounds: 4 }
    const report = fight({ outerSkillId: 'lanhua_shou' }, options)
    expect(report.events.filter((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('肉瘤被点中 '))))
      .toMatchObject([{ round: 1, statusStacks: 1 }, { round: 2, statusStacks: 2 }, { round: 3, statusStacks: 3 }])
    expect(applied(report, '点穴眩晕')).toMatchObject([{ round: 3, targetSlot: 'ENEMY_MAIN', statusRounds: 2 }])
    expect(enemyCasts(report).map((event) => event.round)).toEqual([1, 2])
    expect(applied(fight({ outerSkillId: 'yuenv_jian' }, options), '点穴眩晕')).toEqual([])
  })

  it('试玩 5-1 的铁骑冲阵第 2 回合蓄力，第 3 回合按太极架势化解', () => {
    const chapter = STORY_CHAPTERS.find((entry) => entry.code === '5-1')!
    const options = { enemyMain: { ...enemy, combat: chapter.bossCombat }, surviveRounds: 3 }
    const fierce = fight({}, options)
    const taichi = fight({ stance: 'TAICHI' }, options)
    const { def } = computeDerivedStats(player, loadout)
    expect(applied(fierce, '蓄力')).toMatchObject([{ round: 2, targetSlot: 'ENEMY_MAIN' }])
    expect(enemyCasts(fierce).find((event) => event.round === 3)?.hpDelta).toBe(-incomingDamage(250, 1.7, def, 1))
    expect(enemyCasts(taichi).some((event) => event.round === 3)).toBe(false)
    expect(effectEvents(taichi, 'taichi_deflect')).toMatchObject([{
      round: 3, segments: [tag('太极借力 · 化解金国铁骑冲阵', 'jade')],
    }])
  })
})

describe('成组配置穿透', () => {
  it.each([
    ['xianglong_18', 35], ['xianglong_sanshi', 20], ['dugu_jiujian', 40], ['kongming_quan', 30], ['dingyang_zhen', 25],
    ['chongyang_jianfa', 30], ['yangjia_qiang', 20], ['fumo_zhang', 25],
  ])('%s 使用同一套 %i%% 防御穿透，护盾吸收穿透后的伤害', (id, percent) => {
    const skill = SKILLS[id]
    const patch = skill.slot === 'ULT' ? { ultSkillId: id } : { outerSkillId: id }
    const cast = (report: BattleReportDTO) => report.events.find((event) => event.skillId === id)!
    const base = -cast(fight(patch)).hpDelta!
    const defense = 400
    const ignored = Math.round(defense * percent / 100)
    const damage = Math.round(base * 495 / (495 + defense - ignored))
    const unpierced = Math.round(base * 495 / (495 + defense))
    const armored = cast(fight(patch, { enemyMain: { ...enemy, combat: { def: defense } } }))
    expect(armored.hpDelta).toBe(-damage)
    expect(armored.segments).toContainEqual({
      type: 'tag', tone: 'gold', text: `${skill.name} · 穿透 ${ignored} 点防御 · 增伤 +${damage - unpierced}`,
    })

    const shielded = cast(fight(patch, { enemyMain: { ...enemy, combat: { def: defense, openingShield: 5000 } } }))
    expect(shielded).toMatchObject({ hpDelta: 0, shieldAbsorbed: damage })
    expect(cast(fight(patch)).segments.some((segment) => segment.type === 'tag' && segment.text.includes('穿透'))).toBe(false)
  })
})

describe('装备固定破甲', () => {
  const stickId = trialPartId('jiangnan_qiguai', 'WEAPON')
  const bracerId = trialPartId('qianying_mixing', 'WRIST')
  const innWeaponId = trialPartId('zuixian_xingshang', 'WEAPON')
  const combined = { weaponId: stickId, wristId: bracerId }
  const hasFlatPenetration = (event: BattleEventDTO) =>
    event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('固定破甲'))
  const combinedName = '沉铁熟铜杖、金丝镂花重臂铠'

  it.each([
    { id: innWeaponId, points: 5 },
    { id: stickId, points: 15 },
    { id: bracerId, points: 35 },
    { id: trialPartId('huanghe_nilang', 'WEAPON'), points: 30 },
    { id: trialPartId('canghai_kuanglan', 'WEAPON'), points: 50 },
    { id: trialPartId('hama_nimai', 'WEAPON'), points: 40 },
    { id: trialPartId('tiezhang_kaishan', 'WEAPON'), points: 65 },
    { id: trialPartId('xizheng_jindao', 'WEAPON'), points: 80 },
  ])('$id 的常规外功忽略 $points 点防御', ({ id, points }) => {
    const item = ITEMS[id]
    const gear: Partial<LoadoutPresetDTO> = { stance: 'AGILE', ...(item.slot === 'WRIST' ? { wristId: id } : { weaponId: id }) }
    const base = -mainCast(fight(gear, { surviveRounds: 1, enemyMain: agileEnemy })).hpDelta!
    const defense = 400
    const armored = mainCast(fight(gear, { surviveRounds: 1, enemyMain: { ...agileEnemy, combat: { def: defense } } }))
    const withoutPenetration = Math.round(base * 495 / (495 + defense))
    const damage = Math.round(base * 495 / (495 + defense - points))
    expect(armored.hpDelta).toBe(-damage)
    expect(armored.segments).toContainEqual(flatTag(item.name, points, damage - withoutPenetration))
  })

  it('历练第 7 关先扣固定破甲再算穿透，回放显示陈玄风护盾后的增伤', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats, { str: 0 })
      store.trial.maxStageId = 7
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      store.updateLoadout({ ...loadout, outerSkillId: 'xianglong_18' })
      store.ownedItemIds.push(stickId)
      store.equipItem(stickId)
      store.inspectById('item', stickId)
      expect(store.inspectModal?.extra).toContain('常规外功固定破甲 +15')
      expect(store.inspectModal?.extra).toContain('刚猛架势外功伤害 +8%')

      store.challengeTrialStage(7)
      const cast = mainCast(store.activeBattle!)
      expect(cast).toMatchObject({ round: 1, hpDelta: -28, shieldAbsorbed: 240, shieldDelta: -240, statusRemoved: '护盾' })
      const fixed = flatTag('沉铁熟铜杖', 15, 0)
      const percent = { type: 'tag', text: '降龙十八掌 · 穿透 44 点防御 · 增伤 +8', tone: 'gold' }
      expect(cast.segments).toContainEqual(fixed)
      expect(cast.segments).toContainEqual(percent)
      expect(fierceTags(cast)).toEqual([fierceTag('沉铁熟铜杖', 20)])

      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual(fixed)
      expect(logs).toContainEqual(percent)
      expect(logs).toContainEqual(fierceTag('沉铁熟铜杖', 20))
    } finally {
      store.closeBattleStage()
    }
  })

  it('武器和护腕叠加时按低防截断，防御为零时伤害等同无防目标', () => {
    const gear: Partial<LoadoutPresetDTO> = { ...combined, outerSkillId: 'xianglong_18', stance: 'AGILE' }
    const castAt = (combat: { def: number; openingShield?: number }) =>
      mainCast(fight(gear, { surviveRounds: 1, enemyMain: { ...agileEnemy, combat } }))
    const noDefense = castAt({ def: 0 })
    expect(hasFlatPenetration(noDefense)).toBe(false)
    const lowDefense = castAt({ def: 12 })
    expect(lowDefense.hpDelta).toBe(noDefense.hpDelta)
    expect(lowDefense.segments.filter((segment) => segment.type === 'tag')).toEqual([flatTag(combinedName, 12, 19)])

    const blocked = castAt({ def: 12, openingShield: 5000 })
    expect(blocked).toMatchObject({ hpDelta: 0, shieldAbsorbed: -noDefense.hpDelta! })
    expect(blocked.segments).toContainEqual(flatTag(combinedName, 12, 0))
  })

  it('固定破甲跟随常规外功，刚猛增伤同时作用于同招追击', () => {
    const report = fight({
      ...combined, outerSkillId: 'shuangshou_hubo', ultSkillId: 'yiyang_zhi', leftCompanionId: 'guojing',
    }, { rng: () => 0, enemyMain: { ...enemy, combat: { def: 400 } } })
    const regular = mainCast(report)
    expect(regular.hpDelta).toBe(-404)
    expect(regular.segments).toContainEqual(flatTag(combinedName, 50, 21))
    const [followUp] = effectEvents(report, 'shuangshou_hubo')
    expect(followUp).toMatchObject({ round: 1, hpDelta: -381, skillId: 'shuangshou_hubo' })
    expect(fierceTags(regular)).toEqual([fierceTag('沉铁熟铜杖', 30)])
    expect(fierceTags(followUp)).toEqual([fierceTag('沉铁熟铜杖', 28)])
    expect(report.events.some((event) => event.type === 'ASSIST_ATTACK')).toBe(true)
    expect(report.events.filter((event) => fierceTags(event).length > 0)).toEqual([regular, followUp])
    expect(report.events.filter(hasFlatPenetration)).toEqual([regular])
    expect(report.events.find((event) => event.isUlt)?.segments).toContainEqual({
      type: 'tag', text: '一阳指·乾阳通脉 · 穿透 260 点防御 · 增伤 +239', tone: 'gold',
    })
  })

  it('少室山的同一目标按三位玩家各自的配装结算固定破甲', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 60, con: 100, intStat: 40 } }
    const armorId = trialPartId('henglian_tongjia', 'ARMOR')
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...character, id }, loadout: { ...loadout, armorId, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-fixed-penetration', [
      member('a', { weaponId: innWeaponId }), member('b', combined), member('c', {}),
    ])
    const bossCasts = report.events.filter((event) =>
      event.round === 5 && event.type === 'SKILL_CAST' && event.targetSlot === 'ENEMY_MAIN')
    expect(bossCasts).toMatchObject([
      { actorSlot: 'ALLY_MAIN', hpDelta: -880, shieldAbsorbed: 188, statusRemoved: '护盾' },
      { actorSlot: 'ALLY_LEFT', hpDelta: -2069 },
      { actorSlot: 'ALLY_RIGHT', hpDelta: -1043 },
    ])
    expect(bossCasts[0].segments).toContainEqual(flatTag('酒肆镔铁刺', 5, 2))
    expect(bossCasts[1].segments).toContainEqual(flatTag(combinedName, 50, 45))
    expect(fierceTags(bossCasts[1])).toEqual([fierceTag('沉铁熟铜杖', 153)])
    expect(bossCasts.filter(hasFlatPenetration)).toEqual(bossCasts.slice(0, 2))
  })
})

describe('装备刚猛外功增伤', () => {
  const stickId = trialPartId('jiangnan_qiguai', 'WEAPON')
  const anchorId = trialPartId('canghai_kuanglan', 'WEAPON')
  const wristId = trialPartId('hama_nimai', 'WRIST')
  const gauntletId = trialPartId('tiezhang_kaishan', 'WEAPON')
  const combined = { weaponId: gauntletId, wristId, outerSkillId: 'xianglong_18' }

  it.each([
    { id: stickId, percent: 8 },
    { id: anchorId, percent: 18 },
    { id: wristId, percent: 20 },
    { id: gauntletId, percent: 25 },
  ])('$id 按穿戴者的刚猛架势提升 $percent% 外功伤害', ({ id, percent }) => {
    const item = ITEMS[id]
    const gear = item.slot === 'WRIST' ? { wristId: id } : { weaponId: id }
    const neutral = mainCast(fight({ ...gear, stance: 'AGILE' }, { surviveRounds: 1, enemyMain: agileEnemy }))
    const raw = -neutral.hpDelta!
    const damage = Math.round(raw * (100 + percent) / 100)
    const fierce = mainCast(fight(gear, { surviveRounds: 1 }))
    expect(fierce.hpDelta).toBe(-damage)
    expect(fierceTags(fierce)).toEqual([fierceTag(item.name, damage - raw)])
    expect(fierceTags(neutral)).toEqual([])
  })

  it('同配装和目标切换架势时按实际出手者判断刚猛增伤', () => {
    const gear = { weaponId: stickId }
    const options = { surviveRounds: 1, enemyMain: agileEnemy }
    expect(fierceTags(mainCast(fight(gear, options)))).toHaveLength(1)
    expect(fierceTags(mainCast(fight({ ...gear, stance: 'AGILE' }, options)))).toEqual([])
    expect(fierceTags(mainCast(fight({ ...gear, stance: 'TAICHI' }, { surviveRounds: 1 })))).toEqual([])
  })

  it('武器和护腕在破甲穿透后合计增伤 45%，战报记录盾后各自的增量', () => {
    const base = -mainCast(fight({ ...combined, stance: 'AGILE' }, { surviveRounds: 1, enemyMain: agileEnemy })).hpDelta!
    const defenseAfterPenetration = 400 - 65 - 117
    const armored = Math.round(base * 495 / (495 + defenseAfterPenetration))
    const withWeapon = Math.round(armored * 1.25)
    const withBoth = Math.round(armored * 1.45)
    const openingShield = 2250
    const absorbed = 1500
    const cast = mainCast(fight(combined, { surviveRounds: 1, enemyMain: { ...enemy, combat: { def: 400, openingShield } } }))
    expect(cast).toMatchObject({ hpDelta: -(withBoth - absorbed), shieldDelta: -openingShield, shieldAbsorbed: absorbed, statusRemoved: '护盾' })
    expect(fierceTags(cast)).toEqual([
      fierceTag('玄铁千钧开山重掌套', withWeapon - absorbed),
      fierceTag('陨铁重铸金刚腕', withBoth - withWeapon),
    ])
  })

  it('护盾全吸收时，刚猛增伤计入吸收量，实扣气血为零', () => {
    const cast = mainCast(fight(combined, {
      surviveRounds: 1, enemyMain: { ...enemy, combat: { def: 400, openingShield: 5000 } },
    }))
    expect(cast).toMatchObject({ hpDelta: 0, shieldAbsorbed: 1805, shieldDelta: -2707 })
    expect(fierceTags(cast)).toEqual([])
  })

  it('少室山每位玩家按自己的架势与配装对同一目标出手', () => {
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id }, loadout: { ...loadout, outerSkillId: 'xianglong_18', ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-fierce-damage', [
      member('a', { weaponId: stickId }),
      member('b', { stance: 'AGILE', weaponId: gauntletId }),
      member('c', { weaponId: anchorId, wristId }),
    ])
    const casts = report.events.filter((event) =>
      event.round === 1 && event.type === 'SKILL_CAST' && event.targetSlot === 'ENEMY_LEFT')
    expect(casts).toMatchObject([
      { actorSlot: 'ALLY_MAIN', hpDelta: -390 },
      { actorSlot: 'ALLY_LEFT', hpDelta: -1013 },
      { actorSlot: 'ALLY_RIGHT', hpDelta: -1768 },
    ])
    expect(casts.map(fierceTags)).toEqual([
      [fierceTag('沉铁熟铜杖', 29)],
      [],
      [fierceTag('百斤沉铁破浪巨锚', 231), fierceTag('陨铁重铸金刚腕', 256)],
    ])
  })
})

describe('奇门破甲与装备破盾', () => {
  const swordId = trialPartId('jiuwei_linghu', 'WEAPON')
  const gauntletId = trialPartId('tiezhang_kaishan', 'WEAPON')
  const bracerId = trialPartId('qianying_mixing', 'WRIST')
  const swordGear = { weaponId: swordId, wristId: bracerId, stance: 'AGILE' as const }
  const gauntletGear = { weaponId: gauntletId, stance: 'AGILE' as const }
  const swordAndBracer = '白玉算盘七星剑、金丝镂花重臂铠'
  const shieldTag = (absorbed: number, spent: number) => ({
    type: 'tag', text: `护盾吸收 ${absorbed.toLocaleString()} · 撕盾 ${spent.toLocaleString()}`, tone: 'jade',
  })

  it('同配装换架势时，奇门剑破甲和护腕叠加后再算比例穿透', () => {
    const gear = { ...swordGear, outerSkillId: 'xianglong_18' }
    const options = { surviveRounds: 1, enemyMain: { ...agileEnemy, combat: { def: 200, openingShield: 1700 } } }
    const agile = mainCast(fight(gear, options))
    expect(agile).toMatchObject({ hpDelta: -240, shieldDelta: -1700, shieldAbsorbed: 1700, statusRemoved: '护盾' })
    expect(agile.segments).toContainEqual(flatTag(swordAndBracer, 95, 121))
    expect(agile.segments).toContainEqual({ type: 'tag', text: '降龙十八掌 · 穿透 37 点防御 · 增伤 +119', tone: 'gold' })

    const fierce = mainCast(fight({ ...gear, stance: 'FIERCE' }, options))
    expect(fierce.segments.filter((segment) => segment.type === 'tag' && segment.text.includes('固定破甲')))
      .toEqual([flatTag('金丝镂花重臂铠', 35, 104)])
    expect(fierce.segments).toContainEqual({ type: 'tag', text: '降龙十八掌 · 穿透 58 点防御 · 增伤 +200', tone: 'gold' })
  })

  it('奇门剑和护腕的固定破甲按实际低防截断', () => {
    const gear = { ...swordGear, outerSkillId: 'xianglong_18' }
    const options = { surviveRounds: 1, enemyMain: agileEnemy }
    const low = mainCast(fight(gear, { ...options, enemyMain: { ...agileEnemy, combat: { def: 12 } } }))
    expect(low.hpDelta).toBe(mainCast(fight(gear, options)).hpDelta)
    expect(low.segments.filter((segment) => segment.type === 'tag')).toEqual([flatTag(swordAndBracer, 12, 52)])
  })

  it('重掌套常规外功的奇数伤害按 1.5 倍向下取整消耗盾值', () => {
    const report = fight({ ...gauntletGear, outerSkillId: 'shuangshou_hubo' }, {
      surviveRounds: 1, rng: () => 0, enemyMain: { ...agileEnemy, combat: { openingShield: 5000 } },
    })
    const regular = mainCast(report)
    expect(regular).toMatchObject({ hpDelta: 0, shieldDelta: -1702, shieldAbsorbed: 1135 })
    expect(regular.segments).toContainEqual(shieldTag(1135, 1702))
    expect(effectEvents(report, 'shuangshou_hubo')).toMatchObject([{ hpDelta: 0, shieldDelta: -1135, shieldAbsorbed: 1135 }])
    expect(report.events.some((event) => event.statusApplied === '流血')).toBe(false)
  })

  it('重掌套耗尽奇数盾值后只扣实际溢出的气血', () => {
    const cast = mainCast(fight(gauntletGear, {
      surviveRounds: 1, enemyMain: { ...agileEnemy, combat: { openingShield: 241 } },
    }))
    expect(cast).toMatchObject({ hpDelta: -499, shieldDelta: -241, shieldAbsorbed: 161, statusRemoved: '护盾' })
    expect(cast.segments).toContainEqual(shieldTag(161, 241))
    expect(cast.segments).toContainEqual({ type: 'tag', text: '破盾', tone: 'red' })
    expect(cast.segments).toContainEqual(expect.objectContaining({ type: 'damage', value: 499 }))
  })

  it('重掌套与白骨爪同击取双倍撕盾，流血独立结算', () => {
    const clawId = 'jiuyin_baiguzhua'
    const report = fight({ ...gauntletGear, outerSkillId: clawId }, {
      surviveRounds: 1, enemyMain: { ...agileEnemy, combat: { openingShield: 501 } },
    })
    const cast = mainCast(report)
    expect(cast).toMatchObject({ hpDelta: -772, shieldDelta: -501, shieldAbsorbed: 251, statusRemoved: '护盾' })
    expect(cast.segments).toContainEqual(shieldTag(251, 501))
    expect(effectEvents(report, clawId)).toMatchObject([
      { type: 'EFFECT', statusApplied: '流血', statusRounds: 2 },
      { type: 'DOT_TICK', hpDelta: -133, statusRounds: 1 },
    ])
  })

  it('少室山同一首领按实际出手者的武器、护腕与架势结算', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 89, con: 100, intStat: 40 } }
    const armorId = trialPartId('henglian_tongjia', 'ARMOR')
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...character, id }, loadout: { ...loadout, armorId, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-gear-penetration', [
      member('a', { weaponId: gauntletId, lightSkillId: 'lingbo_weibu', bootsId: trialPartId('jiangnan_qiguai', 'BOOTS') }),
      member('b', swordGear),
      member('c', { ...swordGear, stance: 'FIERCE' }),
    ])
    const casts = report.events.filter((event) =>
      event.round === 3 && event.type === 'SKILL_CAST' && event.targetSlot === 'ENEMY_MAIN')
    expect(casts).toMatchObject([
      { actorSlot: 'ALLY_MAIN', hpDelta: -1451, shieldDelta: -1200, shieldAbsorbed: 800 },
      { actorSlot: 'ALLY_LEFT', hpDelta: -3038 },
      { actorSlot: 'ALLY_RIGHT', hpDelta: -2078 },
    ])
    expect(casts[0].segments).toContainEqual(shieldTag(800, 1200))
    expect(casts[1].segments).toContainEqual(flatTag(swordAndBracer, 95, 136))
    expect(casts[2].segments.filter((segment) => segment.type === 'tag' && segment.text.includes('固定破甲')))
      .toEqual([flatTag('金丝镂花重臂铠', 35, 34)])
  })

  it('装备详情和陈玄风回放显示实装词条、盾耗及实扣气血', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats)
      store.trial.maxStageId = 26
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      store.updateLoadout(loadout)
      store.ownedItemIds.push(swordId, gauntletId)
      store.inspectById('item', swordId)
      expect(store.inspectModal?.extra).toContain('身法 +25')
      expect(store.inspectModal?.extra).toContain('奇门架势常规外功固定破甲 +60')
      store.equipItem(gauntletId)
      store.inspectById('item', gauntletId)
      expect(store.inspectModal?.extra).toContain('常规外功消耗 1.5 倍盾值')

      store.challengeTrialStage(7)
      expect(mainCast(store.activeBattle!)).toMatchObject({ hpDelta: -628, shieldAbsorbed: 160, shieldDelta: -240 })
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual(shieldTag(160, 240))
      expect(logs).toContainEqual(expect.objectContaining({ type: 'damage', value: 628 }))
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('装备固定真伤', () => {
  const daggerId = trialPartId('huangshan_kulou', 'WEAPON')
  const snakeSwordId = trialPartId('hama_nimai', 'WEAPON')
  const trueSegment = (value: number) => ({ type: 'damage', value, category: 'true' })
  const trueTag = (name: string) => ({ type: 'tag', text: `${name} · 附带真伤`, tone: 'gold' })

  it.each([
    { id: daggerId, amount: 25 },
    { id: trialPartId('qimen_dunjia', 'WEAPON'), amount: 80 },
    { id: trialPartId('bihai_chaosheng', 'WEAPON'), amount: 120 },
    { id: snakeSwordId, amount: 150 },
    { id: trialPartId('quanzhen_beidou', 'WEAPON'), amount: 180 },
    { id: trialPartId('niluan_jiuyin', 'WEAPON'), amount: 180 },
  ])('$id 的普伤全被护盾吸收时，仍实扣 $amount 点真伤', ({ id, amount }) => {
    const report = fight({ weaponId: id }, {
      surviveRounds: 1, enemyMain: { ...enemy, combat: { def: 400, openingShield: 5000 } },
    })
    const cast = mainCast(report)
    expect(cast.hpDelta).toBe(0)
    expect(cast.shieldAbsorbed).toBeGreaterThan(0)
    const bonuses = effectEvents(report, id).filter((event) => (event.hpDelta ?? 0) < 0)
    expect(bonuses).toMatchObject([{ type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -amount }])
    expect(report.events[report.events.indexOf(cast) + 1]).toBe(bonuses[0])
    expect(bonuses[0].shieldDelta).toBeUndefined()
    expect(bonuses[0].segments).toContainEqual(trueTag(ITEMS[id].name))
    expect(bonuses[0].segments).toContainEqual(trueSegment(amount))
  })

  it('白驼软剑同击先结算固定破甲、比例穿透和护盾，再单列附带真伤', () => {
    const report = fight({ weaponId: snakeSwordId, outerSkillId: 'xianglong_18' }, {
      surviveRounds: 1, enemyMain: { ...enemy, combat: { def: 200, openingShield: 1200 } },
    })
    const cast = mainCast(report)
    expect(cast).toMatchObject({ hpDelta: -149, shieldAbsorbed: 1200, shieldDelta: -1200, statusRemoved: '护盾' })
    expect(cast.segments).toContainEqual(flatTag('白驼陨铁金蛇软剑', 40, 34))
    expect(cast.segments).toContainEqual({ type: 'tag', text: '降龙十八掌 · 穿透 56 点防御 · 增伤 +115', tone: 'gold' })
    const [bonus] = effectEvents(report, snakeSwordId)
    expect(report.events[report.events.indexOf(cast) + 1]).toBe(bonus)
    expect(bonus.hpDelta).toBe(-150)
    expect(bonus.segments).toContainEqual(trueSegment(150))
  })

  it('普通伤害先击杀时按剩余气血记账', () => {
    const report = fight({ weaponId: daggerId }, { enemyMain: { ...enemy, hp: 50 } })
    expect(mainCast(report).hpDelta).toBe(-50)
    expect(effectEvents(report, daggerId)).toEqual([])
    expect(report.winner).toBe('ALLY')
  })

  it('附带真伤按普伤后的剩余气血截断', () => {
    const report = fight({ weaponId: daggerId }, { enemyMain: { ...enemy, hp: 240 } })
    expect(mainCast(report).hpDelta).toBe(-234)
    expect(effectEvents(report, daggerId)).toMatchObject([{ hpDelta: -6 }])
    expect(effectEvents(report, daggerId)[0].segments).toContainEqual(trueSegment(6))
    expect(report.winner).toBe('ALLY')
  })

  it('九阴四件吸血只使用普通外功实扣气血', () => {
    const jiuyin = 'jiuyin_baigu'
    const gear = {
      weaponId: daggerId, headId: trialPartId(jiuyin, 'HEAD'), armorId: trialPartId(jiuyin, 'ARMOR'),
      wristId: trialPartId(jiuyin, 'WRIST'), beltId: trialPartId(jiuyin, 'BELT'),
    }
    const secondCast = (report: BattleReportDTO) =>
      report.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
    const heals = (report: BattleReportDTO) => effectEvents(report, jiuyin).filter((event) => (event.hpDelta ?? 0) > 0)
    const attacker = { ...enemy, atk: 800 }
    const report = fight(gear, { enemyMain: attacker })
    expect(secondCast(report)).toMatchObject({ hpDelta: -490 })
    expect(effectEvents(report, gear.wristId).find((event) => event.round === 2)).toMatchObject({ hpDelta: -86 })
    expect(effectEvents(report, daggerId).find((event) => event.round === 2)).toMatchObject({ hpDelta: -25 })
    expect(heals(report)).toMatchObject([{ round: 2, targetSlot: 'ALLY_MAIN', hpDelta: 98 }])

    const shielded = fight(gear, { enemyMain: { ...attacker, combat: { openingShield: 5000 } } })
    expect(secondCast(shielded)).toMatchObject({ hpDelta: 0, shieldAbsorbed: 490 })
    expect(effectEvents(shielded, daggerId).find((event) => event.round === 2)).toMatchObject({ hpDelta: -25 })
    expect(heals(shielded)).toEqual([])
  })

  it('附带真伤随实际出手者的常规外功结算一次', () => {
    const report = fight({
      weaponId: daggerId, outerSkillId: 'shuangshou_hubo', ultSkillId: 'yiyang_zhi', leftCompanionId: 'guojing',
    }, { rng: () => 0 })
    expect(effectEvents(report, 'shuangshou_hubo')).toHaveLength(1)
    expect(report.events.some((event) => event.type === 'ASSIST_ATTACK')).toBe(true)
    expect(report.events.some((event) => event.isUlt)).toBe(true)
    const bonuses = effectEvents(report, daggerId)
    expect(bonuses).toMatchObject([{ round: 1, hpDelta: -25 }])
    expect(report.events[report.events.indexOf(mainCast(report)) + 1]).toBe(bonuses[0])
  })

  it('少室山三位玩家对同一目标使用各自配装的真伤', () => {
    const member = (id: string, weaponId: string | null) => ({
      player: { ...player, id }, loadout: { ...loadout, weaponId }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-fixed-true-damage', [
      member('a', daggerId), member('b', snakeSwordId), member('c', null),
    ])
    const hits = report.events.filter((event) => event.round === 1 && event.targetSlot === 'ENEMY_LEFT' && event.actorSlot?.startsWith('ALLY'))
    expect(hits).toMatchObject([
      { type: 'SKILL_CAST', actorSlot: 'ALLY_MAIN', hpDelta: -190 },
      { type: 'EFFECT', actorSlot: 'ALLY_MAIN', effectSourceId: daggerId, hpDelta: -25 },
      { type: 'SKILL_CAST', actorSlot: 'ALLY_LEFT', hpDelta: -616 },
      { type: 'EFFECT', actorSlot: 'ALLY_LEFT', effectSourceId: snakeSwordId, hpDelta: -150 },
      { type: 'SKILL_CAST', actorSlot: 'ALLY_RIGHT', hpDelta: -115 },
    ])
    expect(hits[1].segments).toContainEqual(trueSegment(25))
    expect(hits[3].segments).toContainEqual(trueSegment(150))
  })

  it('历练装备详情与陈玄风回放单列穿盾的实际真伤', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats, { str: 3 })
      store.trial.maxStageId = 7
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      store.updateLoadout(loadout)
      store.ownedItemIds.push(daggerId)
      store.equipItem(daggerId)
      store.inspectById('item', daggerId)
      expect(store.inspectModal?.extra).toContain('常规外功附带 25 点真伤')
      store.challengeTrialStage(7)
      expect(mainCast(store.activeBattle!)).toMatchObject({ hpDelta: 0, shieldAbsorbed: 150 })
      expect(effectEvents(store.activeBattle!, daggerId)[0]).toMatchObject({ round: 1, hpDelta: -25 })
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual(trueTag('惨白骨刺匕'))
      expect(logs).toContainEqual(trueSegment(25))
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('乌金摧心匕与黄河逆浪分水真伤', () => {
  const setId = 'huanghe_nilang'
  const daggerId = trialPartId('henglian_tongjia', 'WEAPON')
  const three = { headId: trialPartId(setId, 'HEAD'), wristId: trialPartId(setId, 'WRIST'), beltId: trialPartId(setId, 'BELT') }
  const lightGear = { ...three, bootsId: trialPartId(setId, 'BOOTS') }
  const heavyGear = { ...three, armorId: trialPartId(setId, 'ARMOR') }
  const combined = { ...heavyGear, weaponId: daggerId }
  const character = { ...player, stats: { ...player.stats, str: 12 } }
  const options = { player: character, surviveRounds: 1 }
  const trueHits = (report: BattleReportDTO) => report.events.filter((event) =>
    (event.effectSourceId === setId || event.effectSourceId === daggerId) && (event.hpDelta ?? 0) < 0)

  it('黄河四件按穿戴者护体防御的 10% 四舍五入', () => {
    for (const [gear, owner, defense, amount] of [
      [lightGear, player, 142, 14], [lightGear, character, 146, 15], [heavyGear, character, 286, 29],
    ] as const) {
      expect(computeDerivedStats(owner, { ...loadout, ...gear }).def).toBe(defense)
      const hits = trueHits(fight(gear, { ...options, player: owner }))
      expect(hits).toMatchObject([{ effectSourceId: setId, hpDelta: -amount }])
      expect(hits[0].segments).toContainEqual({ type: 'damage', value: amount, category: 'true' })
    }
    expect(trueHits(fight(three, options))).toEqual([])
  })

  it('普伤全被护盾吸收时，按武器和套装的顺序分别扣血', () => {
    const report = fight({ ...combined, outerSkillId: 'shuangshou_hubo' }, {
      ...options, rng: () => 0, enemyMain: { ...enemy, combat: { openingShield: 5000 } },
    })
    const cast = mainCast(report)
    const ordered = report.events.slice(report.events.indexOf(cast), report.events.indexOf(cast) + 4)
    expect(ordered).toMatchObject([
      { type: 'SKILL_CAST', hpDelta: 0, shieldDelta: -817, shieldAbsorbed: 817 },
      { type: 'EFFECT', effectSourceId: daggerId, hpDelta: -45 },
      { type: 'EFFECT', effectSourceId: setId, hpDelta: -29 },
      { type: 'SKILL_CAST', effectSourceId: 'shuangshou_hubo', hpDelta: 0, shieldDelta: -817, shieldAbsorbed: 817 },
    ])
    expect(trueHits(report)).toEqual(ordered.slice(1, 3))
    expect(ordered[1].segments).toContainEqual({ type: 'damage', value: 45, category: 'true' })
    expect(ordered[2].segments).toContainEqual({ type: 'damage', value: 29, category: 'true' })
    expect(ordered[3].segments).toContainEqual({ type: 'tag', text: '护盾剩余 3,366', tone: 'jade' })
  })

  it('同击的两段真伤各自按当时剩余气血封顶', () => {
    const afterWeapon = fight(combined, { ...options, enemyMain: { ...enemy, hp: 527 } })
    expect(mainCast(afterWeapon).hpDelta).toBe(-475)
    expect(trueHits(afterWeapon)).toMatchObject([
      { effectSourceId: daggerId, hpDelta: -45 },
      { effectSourceId: setId, hpDelta: -7 },
    ])
    expect(trueHits(afterWeapon)[1].segments).toContainEqual({ type: 'damage', value: 7, category: 'true' })
    expect(afterWeapon.winner).toBe('ALLY')

    const atWeapon = fight(combined, { ...options, enemyMain: { ...enemy, hp: 480 } })
    expect(mainCast(atWeapon).hpDelta).toBe(-475)
    expect(trueHits(atWeapon)).toMatchObject([{ effectSourceId: daggerId, hpDelta: -5 }])
    expect(atWeapon.winner).toBe('ALLY')
  })

  it('少室山按各玩家自己的武器、套装和护体防御结算', () => {
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...character, id }, loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-defense-true-damage', [
      member('a', lightGear), member('b', combined), member('c', { weaponId: daggerId }),
    ])
    expect(trueHits(report).filter((event) => event.round === 1)).toMatchObject([
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', effectSourceId: setId, hpDelta: -15 },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', effectSourceId: daggerId, hpDelta: -45 },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', effectSourceId: setId, hpDelta: -29 },
      { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', effectSourceId: daggerId, hpDelta: -45 },
    ])
  })

  it('装备详情和历练回放分别展示武器与套装的真伤', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, character.stats)
      store.trial.maxStageId = 10
      store.trial.stageHours['7'] = TRIAL_PATROL_HOURS[7]
      store.updateLoadout(loadout)
      for (const id of Object.values(combined)) {
        store.ownedItemIds.push(id)
        store.equipItem(id)
      }
      store.inspectById('item', daggerId)
      expect(store.inspectModal?.extra).toContain('常规外功附带 45 点真伤')
      store.inspectById('item', heavyGear.headId)
      expect(store.inspectModal?.extra).toContain('常规外功附带相当于自身护体防御 10% 的真伤')

      store.challengeTrialStage(7)
      const report = store.activeBattle!
      expect(mainCast(report)).toMatchObject({ hpDelta: -167, shieldAbsorbed: 240 })
      expect(trueHits(report).filter((event) => event.round === 1)).toMatchObject([
        { effectSourceId: daggerId, hpDelta: -45 },
        { effectSourceId: setId, hpDelta: -29 },
      ])
      store.skipBattleToEnd()
      const logs = store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments)
      expect(logs).toContainEqual({ type: 'tag', text: '乌金摧心匕 · 附带真伤', tone: 'gold' })
      expect(logs).toContainEqual({ type: 'damage', value: 45, category: 'true' })
      expect(logs).toContainEqual({ type: 'tag', text: '黄河逆浪分水套装（4件） · 附带真伤', tone: 'gold' })
      expect(logs).toContainEqual({ type: 'damage', value: 29, category: 'true' })
    } finally {
      store.closeBattleStage()
    }
  })
})

describe('行动开始真伤、沧海震荡与铁掌暴伤', () => {
  const dart = trialPartId('qianshou_panguan', 'ACC')
  const wave = 'canghai_kuanglan'
  const waveGear = {
    headId: trialPartId(wave, 'HEAD'), armorId: trialPartId(wave, 'ARMOR'),
    wristId: trialPartId(wave, 'WRIST'), beltId: trialPartId(wave, 'BELT'),
    bootsId: trialPartId(wave, 'BOOTS'), accId: trialPartId(wave, 'ACC'),
  }
  const shocks = (report: BattleReportDTO) => effectEvents(report, wave).filter((event) => event.targetSlot?.startsWith('ENEMY'))
  const iron = 'tiezhang_kaishan'
  const ironGear = {
    headId: trialPartId(iron, 'HEAD'), armorId: trialPartId(iron, 'ARMOR'),
    wristId: trialPartId(iron, 'WRIST'), beltId: trialPartId(iron, 'BELT'),
  }
  const criticalPlayer = { ...player, stats: { ...player.stats, agi: 63 } }
  const ironTags = (event: BattleEventDTO) => event.segments.filter((segment) =>
    segment.type === 'tag' && segment.text.includes('暴击伤害 ×2'),
  )

  it('透骨钉在出招前随机命中存活敌人，绕过护盾，击杀后重新选敌', () => {
    const report = fight({ accId: dart }, {
      enemyGuards: [{ ...enemy, hp: 90, combat: { def: 900, openingShield: 999 } }],
      rng: () => 0, surviveRounds: 1,
    })
    const [hit] = effectEvents(report, dart)
    expect(hit).toMatchObject({ round: 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', hpDelta: -90 })
    expect(hit.shieldAbsorbed).toBeUndefined()
    expect(hit.rageDelta).toBeUndefined()
    expect(hit.segments).toContainEqual({ type: 'damage', value: 90, category: 'true' })
    expect(mainCast(report)).toMatchObject({ targetSlot: 'ENEMY_MAIN' })
    expect(report.events.indexOf(hit)).toBeLessThan(report.events.indexOf(mainCast(report)))

    const other = fight({ accId: dart }, { enemyGuards: [enemy], rng: () => 0.99, surviveRounds: 1 })
    expect(effectEvents(other, dart)).toMatchObject([{ targetSlot: 'ENEMY_MAIN', hpDelta: -280 }])
  })

  it('沧海震荡在普通伤害之后单独通过防御与剩余护盾', () => {
    const report = fight({ ...waveGear, outerSkillId: 'shuangshou_hubo' }, {
      enemyMain: { ...enemy, combat: { def: 150, openingShield: 1500 } },
      surviveRounds: 1, rng: () => 0.99,
    })
    expect(mainCast(report)).toMatchObject({ hpDelta: 0, shieldAbsorbed: 1308 })
    expect(shocks(report)).toMatchObject([{ hpDelta: -24, shieldAbsorbed: 192, statusRemoved: '护盾' }])
    expect(shocks(report)[0].segments).toContainEqual({ type: 'damage', value: 24, category: 'phys' })
  })

  it('沧海按每次出招前气血判定，半血不触发，外功追击与绝技各自结算', () => {
    const gear = { ...waveGear, outerSkillId: 'shuangshou_hubo', ultSkillId: 'yiyang_zhi' }
    const { def, maxHp } = computeDerivedStats(player, { ...loadout, ...gear })
    const halfHpAttack = Math.round((maxHp / 2) * (def + 495) / 495)
    expect(incomingDamage(halfHpAttack, 1, def, player.level)).toBe(maxHp / 2)
    const half = fight(gear, { enemyMain: { ...enemy, atk: halfHpAttack }, rng: () => 0 })
    expect(shocks(half)).toMatchObject([{ round: 1, hpDelta: -281 }, { round: 1, hpDelta: -281 }])
    const above = fight(gear, { enemyMain: { ...enemy, atk: halfHpAttack - 2 }, rng: () => 0 })
    expect(above.events.find((event) => event.isUlt)).toMatchObject({ round: 2 })
    expect(shocks(above)).toMatchObject([{ round: 1 }, { round: 1 }, { round: 2, hpDelta: -281 }])
  })

  it('铁掌只放大实际暴击，对开打时带盾的目标报告盾后增伤', () => {
    const ordinary = mainCast(fight(ironGear, { player: criticalPlayer, surviveRounds: 1 }))
    const ordinaryCrit = -ordinary.hpDelta!
    expect(ordinary.hitResult).toBe('CRIT')
    expect(ironTags(ordinary)).toEqual([])
    const enemyMain = { ...enemy, combat: { openingShield: ordinaryCrit + 100 } }
    const shielded = mainCast(fight(ironGear, { player: criticalPlayer, enemyMain, surviveRounds: 1 }))
    expect(shielded).toMatchObject({ hitResult: 'CRIT', shieldAbsorbed: ordinaryCrit + 100, statusRemoved: '护盾' })
    expect(shielded.hpDelta).toBeLessThan(0)
    expect(ironTags(shielded)).toEqual([{
      type: 'tag', tone: 'gold', text: `铁掌开山踏浪套装（4件） · 暴击伤害 ×2 · 增伤 +${(-shielded.hpDelta!).toLocaleString()}`,
    }])
    expect(ironTags(mainCast(fight(ironGear, { enemyMain, surviveRounds: 1 })))).toEqual([])
  })

  it('铁掌读取实际攻击目标的太极姿态，未凑足四件时不放大暴击', () => {
    const report = fight(ironGear, {
      player: criticalPlayer, enemyGuards: [{ ...enemy, stance: 'TAICHI' }], surviveRounds: 1,
    })
    const hit = mainCast(report)
    expect(hit).toMatchObject({ hitResult: 'CRIT', targetSlot: 'ENEMY_LEFT' })
    expect(ironTags(hit)).toHaveLength(1)
    const baseline = mainCast(fight({ ...ironGear, armorId: null }, {
      player: criticalPlayer, enemyGuards: [{ ...enemy, stance: 'TAICHI' }], surviveRounds: 1,
    }))
    expect(ironTags(baseline)).toEqual([])
    expect(Math.abs(hit.hpDelta! - 2 * baseline.hpDelta!)).toBeLessThanOrEqual(1)
  })

  it('少室山透骨钉和沧海震荡按本次出手者的装备、气血和目标结算', () => {
    const member = (id: string, gear: Partial<LoadoutPresetDTO>) => ({
      player: { ...player, id }, loadout: { ...loadout, ...gear }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-bonus-strikes', [
      member('lead', { accId: dart }), member('left', waveGear), member('right', {}),
    ], () => 0.75)
    expect(effectEvents(report, dart).filter((event) => event.round === 1)).toMatchObject([
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -280 },
    ])
    expect(shocks(report).filter((event) => event.round === 1)).toMatchObject([
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', hpDelta: -281 },
    ])
  })
})
