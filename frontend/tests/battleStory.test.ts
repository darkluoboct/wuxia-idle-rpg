import { describe, expect, it, vi } from 'vitest'
import { ADVENTURES, STORY_CHAPTERS } from '@/config/storyData'
import type { BattleEventDTO, BattleReportDTO } from '@/network/protocol'
import {
  computeDerivedStats,
  incomingDamage,
  innerPressure,
  simulatePlayerDuel,
  simulateShaoshiRaid,
  strikeDamage,
} from '../../shared/battle.ts'
import {
  battleEffectLoot,
  effectsFrom,
  enemyRageAction,
  recoverEnemyRoundMp,
  resolveBattleLoadout,
  resolveDamageOverTime,
  resolveDualStatusBurst,
  type EnemyBattleState,
} from '../../shared/battleEffects.ts'
import { battleEnvironmentAt } from '../../shared/combatMeta.ts'
import {
  COMPANIONS,
  companionView,
  hiddenWeaponCapacity,
  isMapUnlocked,
  MAPS,
  ONLINE_STORY_CHAPTERS,
  SKILLS,
  TRIO_SYNERGIES,
} from '../../shared/gameData.ts'
import { cultivationRate, resolveSeaVoyage } from '../../shared/player.ts'
import { storyEncounter } from '../../shared/storySnake.ts'
import {
  CHAPTER_ONE_TITLE,
  TRIAL_PATROL_HOURS,
  TRIAL_REPLAY_HOURS,
  trialPartId,
  trialPuzzleOutcome,
  trialStageOf,
} from '../../shared/trialStages.ts'
import { newStore } from './helpers'
import { player, loadout, enemy, baseCompanion, fight, effectEvents, mainUnit, mainCast, equipped } from './battleFixtures'

describe('撤退与驱退', () => {
  const bootsId = trialPartId('qianying_mixing', 'BOOTS')
  const smoke = trialPartId('jiamian_piaoping', 'ACC')
  const scare = trialPartId('jiamian_piaoping', 'WEAPON')
  const rewards = { qiExp: 100, silver: 100 }

  it('踏雪靴随主角实际配装保证脱身，直接复用历练入口和同一份回放', () => {
    const store = newStore('NEW')
    store.ownedItemIds.push(bootsId)
    store.equipItem(bootsId)
    const qi = store.player.qiExp
    store.challengeTrialStage(1, undefined, true)
    store.skipBattleToEnd()
    expect(store.activeBattle).toMatchObject({ retreated: true, winner: 'ENEMY' })
    expect(store.activeBattle?.rewards).toBeUndefined()
    expect(store.activeBattle?.events.some((event) => event.type === 'SKILL_CAST')).toBe(false)
    expect(store.player.qiExp).toBe(qi)
    expect(store.trial.rewardedStageIds).not.toContain(1)
    expect(effectEvents(store.activeBattle!, bootsId).filter((event) => event.statusApplied)).toMatchObject([{ statusApplied: '脱身' }])
    expect(fight({}, { tryRetreat: true, rewards }).retreated).toBeUndefined()
  })

  it('烟雾丸等实际致死后撤退，盾全挡保留，先触发九花保命，回放无奖励', () => {
    const high = { ...enemy, atk: 20_000 }
    const options = { enemyMain: high, surviveRounds: 4, rng: () => 0.99, rewards }
    const escaped = fight({ accId: smoke }, options)
    expect(escaped.retreated).toBe(true)
    expect(escaped.rewards).toBeUndefined()
    expect(escaped.winner).toBe('ENEMY')
    expect(escaped.events.at(-1)).toMatchObject({ effectSourceId: smoke, statusApplied: '烟雾脱身', round: 1 })
    const firstHit = escaped.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    expect(firstHit.hpDelta).toBe(1 - mainUnit(escaped).maxHp)
    const yao = 'jiuhua_yulu_wan'
    const saved = fight({ accId: smoke, battlePillId: yao }, {
      ...options, player: { ...player, battleMedicines: { [yao]: 1 } },
    })
    expect(saved.events.find((event) => event.medicineUsed === yao)?.round).toBe(1)
    expect(effectEvents(saved, smoke)).toMatchObject([{ statusApplied: '烟雾脱身', round: 2 }])
    const shield = equipped('quanzhen_beidou', ['WEAPON', 'HEAD', 'WRIST', 'BELT'])
    const covered = fight({ ...shield, accId: smoke }, { ...options, enemyMain: enemy, surviveRounds: 1 })
    expect(covered.events.some((event) => event.shieldAbsorbed && event.targetSlot === 'ALLY_MAIN')).toBe(true)
    expect(covered.retreated).toBeUndefined()
    const member = (id: string) => ({ player: { ...player, id }, loadout: { ...loadout, accId: smoke }, learnedSkills: {} })
    const raid = simulateShaoshiRaid('smoke', [member('lead'), member('left'), member('right')], () => 0.99)
    expect(raid.retreated).toBeUndefined()
    expect(effectEvents(raid, smoke)).toEqual([])
  })

  it('铁掌套只对普通草寇和野兽掷开场驱退，首领和概率边界照常迎战', () => {
    const foe = { ...enemy, combat: { creature: 'BANDIT' as const } }
    const run = (roll: number, isBoss = false) => fight({ weaponId: scare }, {
      enemyMain: { ...foe, isBoss }, rng: () => roll, surviveRounds: 1, rewards,
    })
    const fled = run(0.499)
    expect(fled.winner).toBe('ALLY')
    expect(effectEvents(fled, scare)).toMatchObject([{ statusApplied: '吓退', hpDelta: -foe.hp, targetSlot: 'ENEMY_MAIN' }])
    expect(fled.events.some((event) => event.type === 'SKILL_CAST')).toBe(false)
    expect(effectEvents(run(0.5), scare)).toEqual([])
    expect(effectEvents(run(0, true), scare)).toEqual([])
  })

  it('持续伤害触发烟雾丸时停止结算其他持续伤害', () => {
    const foe = { ...enemy, atk: 100, combat: { periodicOnHit: { status: 'poison' as const, attackPercent: 10000, rounds: 2 } } }
    const guard = { ...foe, combat: { joinsRound: true as const, periodicOnHit: { status: 'bleed' as const, attackPercent: 100, rounds: 2 } } }
    const report = fight({ accId: smoke }, { enemyMain: foe, enemyGuards: [guard], rng: () => 0.99, surviveRounds: 2 })
    expect(report.retreated).toBe(true)
    expect(report.events.filter((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')).toHaveLength(1)
    expect(report.events.at(-1)).toMatchObject({ effectSourceId: smoke, statusApplied: '烟雾脱身' })
  })
})

describe('蛇君与塞外浪子称号', () => {
  it('实际致死毒伤反震施毒者，按其剩余气血截断，未致死和气血伤害不触发', () => {
    const titleId = 'title_wandu'
    const build = { innerSkillId: 'hama_gong', titleId }
    const owner = { ...player, stats: { ...player.stats, str: 0, karma: -200 } }
    const run = (attackPercent: number, status: 'poison' | 'bleed' = 'poison', chosen = owner) => fight(build, {
      player: chosen, rng: () => 0.99, surviveRounds: 1,
      enemyMain: { ...enemy, hp: 20_000, atk: 100, combat: { periodicOnHit: { status, attackPercent, rounds: 2 }, openingShield: 10_000 } },
    })
    const report = run(1500)
    const loss = report.events.find((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')!
    expect(loss.hpDelta).toBeLessThan(0)
    expect(effectEvents(report, titleId)).toMatchObject([{ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -3000 }])
    expect(report.winner).toBe('ENEMY')
    expect(effectEvents(run(8), titleId)).toEqual([])
    expect(effectEvents(run(1500, 'bleed'), titleId)).toEqual([])
    expect(effectEvents(run(1500, 'poison', { ...owner, stats: { ...owner.stats, karma: -199 } }), titleId)).toEqual([])
    const runLow = fight(build, {
      player: owner, rng: () => 0.99, surviveRounds: 1,
      enemyMain: { ...enemy, hp: 400, atk: 100, combat: { openingShield: 10_000, periodicOnHit: { status: 'poison', attackPercent: 1500, rounds: 2 } } },
    })
    expect(effectEvents(runLow, titleId)[0]).toMatchObject({ hpDelta: -60 })
  })

  it('浪子仅给从未拜师的中立玩家加连击和实得纹银，少室山按击杀者记账', () => {
    const titleId = 'title_tabo'
    const gear = { ...loadout, titleId, outerSkillId: 'duanhun_qiang' }
    const build = { ...player, stats: { ...player.stats, str: 1000 } }
    const effects = resolveBattleLoadout(gear, build).effects.filter((effect) => effect.sourceId === titleId)
    expect(effects).toMatchObject([{ kind: 'OUTER_COMBO_CHANCE', points: 5 }, { kind: 'KILL_SILVER_GAIN', percent: 20 }])
    for (const history of [{ currentSectId: 'jiangnan_wuguan' }, { graduatedSectIds: ['jiangnan_wuguan'] }, { betrayedSectIds: ['baituo'] }]) {
      expect(resolveBattleLoadout(gear, { ...build, ...history }).effects.some((effect) => effect.sourceId === titleId)).toBe(false)
    }
    const report = fight(gear, { player: build, enemyMain: { ...enemy, hp: 1000 }, rng: () => 0.99 })
    expect(battleEffectLoot(report).silver).toBe(160)
    expect(effectEvents(report, titleId)).toContainEqual(expect.objectContaining({ targetSlot: 'ENEMY_MAIN', silverDrop: 160 }))
    const raid = simulateShaoshiRaid('title-silver', [
      { player: { ...player, id: 'lead' }, loadout, learnedSkills: {} },
      { player: { ...build, id: 'left', stats: { ...build.stats, str: 50_000 } }, loadout: gear, learnedSkills: {} },
      { player: { ...player, id: 'right' }, loadout, learnedSkills: {} },
    ], () => 0.99)
    expect(battleEffectLoot(raid, 'ALLY_MAIN').silver).toBe(0)
    expect(battleEffectLoot(raid, 'ALLY_LEFT').silver).toBeGreaterThan(0)
    expect(effectEvents(raid, titleId).filter((event) => event.silverDrop).every((event) => event.actorSlot === 'ALLY_LEFT')).toBe(true)
  })
})

describe('第一卷终章荣誉', () => {
  it('终章战败不立像，首胜播放结算写入存档，复战不重复授予', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const store = newStore('DEMO')
    const trial = store.player.trial
    trial.maxStageId = trial.selectedStageId = 30
    trial.stageHours['30'] = TRIAL_PATROL_HOURS[30]
    Object.assign(store.player.stats, { str: 1, con: 1, agi: 1, intStat: 1 })
    try {
      store.challengeTrialStage(30)
      expect(store.activeBattle?.winner).toBe('ENEMY')
      store.skipBattleToEnd()
      expect(store.player.chapterOneChampion).toBeUndefined()
      store.closeBattleStage()

      Object.assign(store.player.stats, { str: 15000, con: 1500, agi: 23, intStat: 1500 })
      store.challengeTrialStage(30)
      expect(store.activeBattle?.winner).toBe('ALLY')
      expect(store.activeBattle?.rewards?.title).toBe(CHAPTER_ONE_TITLE)
      expect(store.activeBattle?.events.at(-1)?.segments).toContainEqual({
        type: 'tag', text: `获授【${CHAPTER_ONE_TITLE}】，襄阳城立像`, tone: 'gold',
      })
      store.skipBattleToEnd()
      expect(store.player.chapterOneChampion).toBe(true)
      expect(store.ownedItemIds).not.toContain('niluan_jiuyin_acc')
      store.saveNow()
    } finally {
      store.closeBattleStage()
    }

    const resumed = newStore()
    resumed.continueGame()
    expect(resumed.player.chapterOneChampion).toBe(true)
    resumed.player.trial.replayHours['30'] = TRIAL_REPLAY_HOURS
    try {
      resumed.replayTrialBoss(30)
      expect(resumed.activeBattle?.winner).toBe('ALLY')
      expect(resumed.activeBattle?.rewards?.title).toBeUndefined()
      expect(mainUnit(resumed.activeBattle!).title).toBe(CHAPTER_ONE_TITLE)
    } finally {
      resumed.closeBattleStage()
    }
  })
})

describe('水战、夜战与渡海', () => {
  const land = { water: false, night: false, rain: false, storm: false }
  const wristId = trialPartId('huanghe_sigui', 'WRIST')
  const pendant = trialPartId('canghai_kuanglan', 'ACC')
  const stormTime = Date.parse('2026-11-13T00:00:00+08:00')

  it('同一时刻各端使用同一天气和夜色，风暴两小时后转雨', () => {
    expect(battleEnvironmentAt('taohua_isle', new Date(stormTime))).toMatchObject({ night: true, rain: true, storm: true })
    expect(battleEnvironmentAt('taohua_isle', new Date(stormTime + 7_200_000))).toMatchObject({ night: true, rain: true, storm: false })
    expect(battleEnvironmentAt('guiyun_lake', new Date(stormTime + 21_600_000))).toMatchObject({ water: true, night: false, rain: false })
    expect(battleEnvironmentAt('damo_caravan', new Date(stormTime))).toMatchObject({ water: false, rain: false, storm: false })
  })

  it('蝙蝠乌纱笠免除夜战惩罚，保留其他命中降低', () => {
    const actor = { ...player, stats: { ...player.stats, agi: 4 } }
    const options = { player: actor, enemyMain: { ...enemy, combat: { speed: 1 } }, surviveRounds: 1, rng: () => 0.99 }
    const night = { ...land, night: true }
    const headId = trialPartId('jiangnan_qiguai', 'HEAD')
    expect(mainCast(fight({}, { ...options, environment: land })).hitResult).toBe('HIT')
    expect(mainCast(fight({}, { ...options, environment: night }))).toMatchObject({ hitResult: 'MISS', hpDelta: 0 })
    const protectedHit = mainCast(fight({ headId }, { ...options, environment: night }))
    expect(protectedHit.hitResult).toBe('HIT')
    expect(protectedHit.segments).toContainEqual({ type: 'tag', text: '蝙蝠乌纱笠 · 免除夜战命中惩罚', tone: 'jade' })

    const blinded = fight({ headId }, { ...options, environment: night, enemyMain: { ...enemy, combat: {
      speed: 1000, statusPulse: { every: 1, name: '扬尘', rule: { status: 'HIT_DOWN', percent: 30, rounds: 1 } },
    } } })
    expect(mainCast(blinded)).toMatchObject({ hitResult: 'MISS', hpDelta: 0 })
  })

  it('分水铜环保留破甲，水战只报告护盾后实际多扣的气血', () => {
    const options = { surviveRounds: 1, rng: () => 0.99 }
    const gear = { wristId, outerSkillId: 'nanshan_zhang' }
    const combat = { def: 70 }
    const dry = mainCast(fight(gear, { ...options, enemyMain: { ...enemy, combat }, environment: land }))
    const damage = -dry.hpDelta!
    const compare = (openingShield: number, water: boolean) => mainCast(fight(gear, {
      ...options, enemyMain: { ...enemy, combat: { ...combat, openingShield } }, environment: { ...land, water },
    }))
    expect(dry.segments.some((segment) => segment.type === 'tag' && segment.text.includes('固定破甲 12'))).toBe(true)
    expect(dry.segments.some((segment) => segment.type === 'tag' && segment.text.includes('水战伤害'))).toBe(false)
    const afterShield = compare(damage, true)
    expect(afterShield.shieldAbsorbed).toBe(damage)
    expect(afterShield.hpDelta).toBeLessThan(0)
    expect(afterShield.segments).toContainEqual({ type: 'tag', text: `分水铜环护手 · 水战伤害 +10% · 增伤 +${-afterShield.hpDelta!}`, tone: 'gold' })
    expect(compare(damage * 3, true)).toMatchObject({ hpDelta: 0 })
    expect(compare(damage * 3, true).segments).toContainEqual({ type: 'tag', text: '分水铜环护手 · 水战伤害 +10% · 增伤 +0', tone: 'gold' })
  })

  it('沙通天只在水战强化攻击，陆冠英枪阵只在水上成阵并可击破', () => {
    const compare = (stageId: number, water: boolean) => fight({ outerSkillId: 'nanshan_zhang' }, {
      enemyMain: { ...trialStageOf(stageId)!.boss, hp: enemy.hp, atk: 200, mp: enemy.mp },
      environment: { ...land, water }, surviveRounds: 3, rng: () => 0.99,
    })
    const incoming = (report: BattleReportDTO) => report.events.find((event) => event.round === 2 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    const drySha = compare(10, false)
    const wetSha = compare(10, true)
    expect(incoming(wetSha).hpDelta).toBeLessThan(incoming(drySha).hpDelta!)
    expect(effectEvents(wetSha, 'e_main').some((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('攻击 250（+25%）')))).toBe(true)
    const dryLu = compare(15, false)
    const wetLu = compare(15, true)
    expect(mainCast(wetLu).hpDelta).toBeGreaterThan(mainCast(dryLu).hpDelta!)
    expect(wetLu.events.find((event) => event.statusApplied === '水上枪阵被破')).toMatchObject({ round: 1, targetSlot: 'ENEMY_MAIN' })
    expect(dryLu.events.some((event) => event.statusApplied === '水上枪阵被破')).toBe(false)
    expect(wetLu.events.find((event) => event.round === 2 && event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')?.hpDelta)
      .toBe(dryLu.events.find((event) => event.round === 2 && event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')?.hpDelta)
  })

  it('东海巨舶在水战施加一回合落水，重靴仅保护实际穿戴者', () => {
    const stage = trialStageOf(18)!
    const options = { enemyMain: { ...stage.boss, hp: enemy.hp, atk: 100, mp: enemy.mp }, surviveRounds: 4, rng: () => 0.99 }
    const gear = { leftCompanionId: 'guojing' }
    const hit = fight(gear, { ...options, environment: { ...land, ...stage.environment } })
    const ward = fight({ ...gear, bootsId: trialPartId('huanghe_nilang', 'BOOTS') }, { ...options, environment: { ...land, ...stage.environment } })
    const dry = fight(gear, { ...options, environment: land })
    const fallen = (report: BattleReportDTO) => report.events.filter((event) => event.statusApplied === '落水')
    const actions = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN').map(({ round }) => round)
    expect(fallen(hit)).toMatchObject([
      { round: 2, targetSlot: 'ALLY_LEFT', statusRounds: 1 }, { round: 2, targetSlot: 'ALLY_MAIN', statusRounds: 1 },
    ])
    expect(fallen(ward)).toMatchObject([{ round: 2, targetSlot: 'ALLY_LEFT', statusRounds: 1 }])
    expect(fallen(dry)).toEqual([])
    expect(actions(hit)).toEqual([1, 2, 4])
    expect(actions(ward)).toEqual([1, 2, 3, 4])
    expect(ward.events).toContainEqual(expect.objectContaining({ targetSlot: 'ALLY_MAIN', segments: [{ type: 'tag', text: '逆浪分波重靴 · 抵抗落水', tone: 'jade' }] }))
  })

  it('定风珠减免实际受击伙伴的物伤和跳伤，主角承伤保持原值', () => {
    const options = { surviveRounds: 1, environment: land, rng: () => 0.99, companionOf: baseCompanion,
      enemyMain: { ...enemy, combat: { preferFemaleCompanion: true as const,
        periodicOnHit: { status: 'needlePoison' as const, attackPercent: 40, rounds: 1 } } },
      enemyGuards: [{ ...enemy, combat: { speed: 10, joinsRound: true as const } }],
    }
    const gear = { leftCompanionId: 'huangrong', rightCompanionId: 'guojing' }
    const base = fight(gear, options)
    const protectedReport = fight({ ...gear, companionEquipment: { guojing: { ACC: pendant } } }, options)
    const delta = (report: BattleReportDTO, type: 'SKILL_CAST' | 'DOT_TICK', targetSlot: string) =>
      report.events.find((event) => event.actorSlot.startsWith('ENEMY') && event.type === type && event.targetSlot === targetSlot)!.hpDelta!
    const expected = (amount: number) => -Math.round(-amount * 0.9)
    expect(delta(protectedReport, 'SKILL_CAST', 'ALLY_LEFT')).toBe(expected(delta(base, 'SKILL_CAST', 'ALLY_LEFT')))
    expect(delta(protectedReport, 'DOT_TICK', 'ALLY_LEFT')).toBe(expected(delta(base, 'DOT_TICK', 'ALLY_LEFT')))
    expect(delta(protectedReport, 'SKILL_CAST', 'ALLY_MAIN')).toBe(delta(base, 'SKILL_CAST', 'ALLY_MAIN'))
    expect(protectedReport.events.some((event) => event.targetSlot === 'ALLY_LEFT' && event.segments.some((segment) =>
      segment.type === 'tag' && segment.text.includes('东海鲛人定风珠 · 盾前减伤')))).toBe(true)
  })

  it('只有风暴渡海判海难，失败按现有银两封顶，定风珠保护往返', () => {
    const origin = 'guiyun_lake'
    const island = 'taohua_isle'
    expect(resolveSeaVoyage(origin, island, null, 450, stormTime, () => 0.24)).toEqual({ status: 'WRECK', silverLost: 300 })
    expect(resolveSeaVoyage(island, origin, null, 80, stormTime, () => 0)).toEqual({ status: 'WRECK', silverLost: 80 })
    expect(resolveSeaVoyage(origin, island, null, 450, stormTime, () => 0.25)).toBeUndefined()
    const roll = vi.fn(() => 0)
    expect(resolveSeaVoyage(island, origin, pendant, 450, stormTime, roll)).toEqual({ status: 'PROTECTED' })
    expect(resolveSeaVoyage(origin, island, pendant, 450, stormTime + 7_200_000, roll)).toBeUndefined()
    expect(resolveSeaVoyage('jiaxing_suburb', origin, null, 450, stormTime, roll)).toBeUndefined()
    expect(roll).not.toHaveBeenCalled()
  })

  it('试玩从地图渡海，失败留在原地，实际佩戴定风珠后可登岛', () => {
    vi.spyOn(Date, 'now').mockReturnValue(stormTime)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const store = newStore('NEW')
    const island = MAPS.find(({ id }) => id === 'taohua_isle')!
    expect(isMapUnlocked(island, 8, true)).toBe(false)
    expect(isMapUnlocked(island, 9, true)).toBe(true)
    expect(isMapUnlocked(island, 4)).toBe(false)
    store.player.maxChapterId = 9
    store.player.currentMapId = 'guiyun_lake'
    store.player.silver = 200
    store.ownedItemIds.push(pendant)
    store.moveMap(island.id)
    expect(store.player).toMatchObject({ currentMapId: 'guiyun_lake', silver: 0 })
    store.equipItem(pendant)
    store.moveMap(island.id)
    expect(store.player.currentMapId).toBe(island.id)
  })
})

describe('护送目标共享结算', () => {
  const battle = ADVENTURES.find(({ id }) => id === 'tieqiangmiao')?.choices[0].battle
  if (!battle || 'nodeId' in battle || !battle.escortAllies) throw new Error('缺少铁枪庙护送配置')
  const [yang, bao] = battle.escortAllies
  const [swordsman, archer] = battle.enemyGuards!

  it('护住两名伤员并提前击退全部追兵可直接判胜', () => {
    const report = fight({}, {
      ...battle, enemyMain: { ...battle.enemyMain, hp: 1 },
      enemyGuards: [{ ...swordsman, hp: 1 }, { ...archer, hp: 1 }],
      rng: () => 0.99,
    })
    expect(report.winner).toBe('ALLY')
    expect(report.events.at(-1)?.round).toBe(3)
    for (const slot of ['ENEMY_LEFT', 'ENEMY_MAIN', 'ENEMY_RIGHT']) {
      expect(report.events.find((event) => event.targetSlot === slot && (event.hpDelta ?? 0) < 0)).toBeDefined()
    }
  })

  it('队伍护盾与治疗分别作用于两名伤员，北斗分摊保留在三个出战位', () => {
    const gear = equipped('quanzhen_beidou', ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'ACC'])
    const report = fight({ ...gear, leftCompanionId: 'guojing', rightCompanionId: 'yideng' }, {
      ...battle, enemyMain: { ...battle.enemyMain, hp: 50_000, atk: 650 },
      enemyGuards: [{ ...swordsman, hp: 50_000 }, { ...archer, hp: 50_000 }],
      companionOf: baseCompanion, rng: () => 0.99,
    })
    expect(report.winner).toBe('ALLY')
    expect(report.events.at(-1)?.round).toBe(4)
    const opening = report.events.filter((event) => event.round === 1)
    for (const [slot, attacker, absorbed, recovered] of [
      ['ALLY_ESCORT_LEFT', 'ENEMY_LEFT', 208, 72],
      ['ALLY_ESCORT_RIGHT', 'ENEMY_RIGHT', 212, 62],
    ] as const) {
      expect(opening.find((event) => event.targetSlot === slot && event.shieldDelta && event.shieldDelta > 0))
        .toMatchObject({ effectSourceId: 'quanzhen_beidou', actorSlot: 'ALLY_MAIN' })
      expect(opening.find((event) => event.targetSlot === slot && event.actorSlot === attacker))
        .toMatchObject({ hpDelta: 0, shieldAbsorbed: absorbed })
      expect(opening.find((event) => event.targetSlot === slot && event.actorSlot === 'ALLY_RIGHT' && event.hpDelta))
        .toMatchObject({ effectSourceId: 'yideng', hpDelta: recovered })
    }
    const shares = opening.filter((event) => event.actorSlot === 'ENEMY_MAIN' && event.effectSourceId === 'quanzhen_beidou')
    expect(shares.map(({ targetSlot }) => targetSlot)).toEqual(['ALLY_LEFT', 'ALLY_RIGHT'])
    expect(report.events.filter((event) => event.actorSlot.startsWith('ALLY_ESCORT_') && event.type === 'SKILL_CAST')).toEqual([])
  })

  it('达成回合门槛时先扣实际持续伤害，失去护送目标仍判负', () => {
    const report = fight({}, {
      ...battle, surviveRounds: 1, escortAllies: [yang, { ...bao, hp: 360 }],
      enemyGuards: [swordsman, { ...archer, combat: { ...archer.combat, periodicOnHit: { status: 'dartPoison', attackPercent: 120, rounds: 2 } } }],
      rng: () => 0.99, rewards: { qiExp: 500, silver: 500 },
    })
    expect(report.events.find((event) => event.actorSlot === 'ENEMY_RIGHT' && event.type === 'SKILL_CAST'))
      .toMatchObject({ round: 1, targetSlot: 'ALLY_ESCORT_RIGHT', hpDelta: -212 })
    expect(report.events.find((event) => event.type === 'DOT_TICK'))
      .toMatchObject({ round: 1, targetSlot: 'ALLY_ESCORT_RIGHT', hpDelta: -148 })
    expect(report.events.at(-1)).toMatchObject({ targetSlot: 'ALLY_ESCORT_RIGHT', segments: [{ type: 'tag', text: '包惜弱气血耗尽，护送失败' }] })
    expect(report.winner).toBe('ENEMY')
    expect(report.rewards).toBeUndefined()
  })
})

describe('四名独立敌人的选敌与胜负', () => {
  const battle = ADVENTURES.find(({ id }) => id === 'huanghe_sigui')?.choices[0].battle
  if (!battle || 'nodeId' in battle || !battle.enemyGuards) throw new Error('缺少黄河四鬼配置')
  const [left, right, rear] = battle.enemyGuards

  it('击退前三人后还要继续与第四人交手', () => {
    const report = fight({}, {
      ...battle, surviveRounds: undefined, enemyMain: { ...battle.enemyMain, hp: 1, atk: 70 },
      enemyGuards: [{ ...left, hp: 1, atk: 70 }, { ...right, hp: 1, atk: 70 }, { ...rear, hp: 25_000, atk: 160 }],
      player: { ...player, level: 16, stats: { ...player.stats, con: 30 } },
      rng: () => 0.99, rewards: { qiExp: 100, silver: 100 },
    })
    expect(report.winner).toBe('ENEMY')
    expect(report.rewards).toBeUndefined()
    for (const slot of ['ENEMY_LEFT', 'ENEMY_MAIN', 'ENEMY_RIGHT']) {
      expect(report.events.some((event) => event.targetSlot === slot && (event.hpDelta ?? 0) < 0)).toBe(true)
    }
    expect(report.events.find((event) => event.round > 3 && event.actorSlot === 'ENEMY_REAR' && event.type === 'SKILL_CAST'))
      .toMatchObject({ targetSlot: 'ALLY_MAIN' })
    expect(report.events.find((event) => event.round > 3 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST'))
      .toMatchObject({ targetSlot: 'ENEMY_REAR' })
  })

  it('哲别的后排射击优先选实际存活的第四敌位', () => {
    const report = fight({ leftCompanionId: 'zhebie' }, { ...battle, surviveRounds: 1, companionOf: baseCompanion, rng: () => 0.99 })
    expect(report.events.find((event) => event.actorSlot === 'ALLY_LEFT' && event.skillId === 'lianzhu_shenjian'))
      .toMatchObject({ targetSlot: 'ENEMY_REAR' })
  })
})

describe('终南金雁与铁枪庙的战斗机制', () => {
  const tanchuduan = STORY_CHAPTERS.find((node) => node.code === '2-3')!
  const temple = STORY_CHAPTERS.find((node) => node.code === '5-2')!
  const silverNeedles = 'peng_tougu_yinzhen'
  const tanEnemy = { ...enemy, atk: 100, mp: 1000, stance: 'TAICHI' as const, combat: { ...tanchuduan.bossCombat, openingRage: 100 } }
  const pengEnemy = { ...enemy, atk: 100, stance: 'AGILE' as const, combat: { ...temple.bossCombat, openingRage: 100 } }
  const mainCasts = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')

  it('谭处端耗费实际内力施展同归剑法，出手时按当前内力计算压制', () => {
    const gear = { ...loadout, stance: 'TAICHI' as const }
    const report = fight(gear, { enemyMain: tanEnemy, surviveRounds: 3 })
    const cost = report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.mpDelta === -250)!
    expect(cost).toMatchObject({ round: 1, targetSlot: 'ENEMY_MAIN', rageDelta: -85 })
    expect(report.events.find((event) => event.skillId === 'tonggui_jianfa')).toMatchObject({ round: 1, actorSlot: 'ENEMY_MAIN' })
    expect(effectEvents(report, 'quanzhen_tuna')).toMatchObject([
      { round: 1, actorSlot: 'ENEMY_MAIN', mpDelta: 60 }, { round: 2, mpDelta: 60 }, { round: 3, mpDelta: 60 },
    ])
    const stats = computeDerivedStats(player, gear)
    expect(mainCasts(report).map((event) => event.hpDelta)).toEqual(
      [1000, 810, 870].map((mp, index) => -strikeDamage(stats.atk, 1, 1, innerPressure(stats.maxMp, mp), false, index + 1)),
    )
  })

  it('封穴暂停谭处端回内及绝技，解除后按剩余内力接着结算', () => {
    const report = fight({ stance: 'TAICHI', ultSkillId: 'dingyang_zhen' }, { player: { ...player, bonusHpPct: 100 }, enemyMain: tanEnemy, surviveRounds: 6 })
    expect(report.events.filter((event) => event.statusApplied === '封穴').map((event) => event.round)).toEqual([2, 5])
    expect(effectEvents(report, 'quanzhen_tuna').map((event) => [event.round, event.mpDelta])).toEqual([[1, 60], [3, 60], [4, 60], [6, 60]])
    expect(report.events.filter((event) => event.skillId === 'tonggui_jianfa').map((event) => event.round)).toEqual([1, 6])
  })

  it('谭处端以内力压制出手，念珠和道人袍只抵消额外部分并保留盾值', () => {
    const gear = { stance: 'TAICHI' as const, wristId: trialPartId('fahua_zuyi', 'WRIST'), armorId: trialPartId('kongming_wantong', 'ARMOR') }
    const attackerMp = 1_300
    const attackerAtk = 400
    const sets = equipped('quanzhen_beidou', ['HEAD', 'BELT', 'WEAPON', 'ACC'])
    const active = { ...sets, ...gear }
    // 四件套在回合初补盾。两件装备的实际面板用于计算同一次受击。
    const target = { ...player, stats: { ...player.stats, con: 0, intStat: 0 } }
    const stats = computeDerivedStats(target, { ...loadout, ...active })
    const pressure = innerPressure(attackerMp, stats.maxMp)
    const attack = (factor: number) => incomingDamage(attackerAtk, SKILLS.tonggui_jianfa.powerRatio * factor, stats.def, target.level)
    const reducedPressure = (reduction: number) => 1 + (pressure - 1) * (1 - reduction)
    const report = fight(active, { player: target, enemyMain: { ...tanEnemy, atk: attackerAtk, mp: attackerMp }, surviveRounds: 1, rng: () => 0.99 })
    const hit = report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.skillId === 'tonggui_jianfa')!
    expect(pressure).toBeGreaterThan(1)
    expect(hit.shieldAbsorbed! - hit.hpDelta!).toBe(attack(reducedPressure(0.3)))
    expect(hit.segments).toContainEqual({ type: 'tag', text: `粗葛补丁道人袍 · 内力压制 · 盾前减伤 ${attack(pressure) - attack(reducedPressure(0.2))}`, tone: 'jade' })
    expect(hit.segments).toContainEqual({ type: 'tag', text: `檀木念珠手串 · 内力压制 · 盾前减伤 ${attack(reducedPressure(0.2)) - attack(reducedPressure(0.3))}`, tone: 'jade' })
    const weaker = fight(active, { player: target, enemyMain: { ...tanEnemy, atk: attackerAtk, mp: 100 }, surviveRounds: 1, rng: () => 0.99 })
    expect(weaker.events.some((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('内力压制 ·')))).toBe(false)
  })

  it('内力不足保留满怒，回内以缺失值封顶', () => {
    const report = fight({ stance: 'TAICHI' }, { enemyMain: tanEnemy, surviveRounds: 1 })
    const unit = report.units.find((entry) => entry.slot === 'ENEMY_MAIN')!
    const boss: EnemyBattleState = { unit, shield: 0, atk: 100, combat: tanEnemy.combat, rage: 100, mp: 249 }
    const events: BattleEventDTO[] = []
    expect(enemyRageAction(boss, 1, events)).toBeUndefined()
    expect(boss).toMatchObject({ rage: 100, mp: 249 })
    expect(events[0].segments).toContainEqual({ type: 'tag', text: '全真·同归剑法 · 内力不足（249 / 250）', tone: 'gold' })
    boss.mp = 975
    recoverEnemyRoundMp(boss, unit.hp, 1, events)
    expect(boss.mp).toBe(1000)
    expect(events.at(-1)).toMatchObject({ actorSlot: 'ENEMY_MAIN', targetSlot: 'ENEMY_MAIN', mpDelta: 25 })
    recoverEnemyRoundMp(boss, unit.hp, 2, events)
    expect(events).toHaveLength(2)
  })

  it('透骨银针命中后排才给后排封招，缺少后排时能封住主角下一次绝技', () => {
    const options = { enemyMain: pengEnemy, surviveRounds: 3, companionOf: baseCompanion, rng: () => 0.99 }
    const rear = fight({ outerSkillId: 'yuenv_jian', rightCompanionId: 'mayu' }, options)
    expect(rear.events.find((event) => event.skillId === silverNeedles)).toMatchObject({ round: 1, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_RIGHT', hitResult: 'HIT' })
    expect(effectEvents(rear, silverNeedles).filter((event) => event.statusApplied)).toMatchObject([{ targetSlot: 'ALLY_RIGHT', statusApplied: '封招', statusRounds: 1 }])
    expect(rear.events.find((event) => event.round === 3 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST'))
      .toMatchObject({ targetSlot: 'ALLY_MAIN' })

    const leader = fight({ outerSkillId: 'yuenv_jian', ultSkillId: 'yiyang_zhi' }, options)
    expect(leader.events.find((event) => event.skillId === silverNeedles)).toMatchObject({ targetSlot: 'ALLY_MAIN' })
    expect(mainCasts(leader).map((event) => event.skillId)).toEqual(['yuenv_jian', 'yuenv_jian', 'yiyang_zhi'])
    expect(effectEvents(leader, silverNeedles).find((event) => event.statusRemoved)).toMatchObject({ round: 2, targetSlot: 'ALLY_MAIN', statusRemoved: '封招' })
  })

  it('后排闪避时银针落空，贴身缴械时彭连虎保留怒气并改用徒手', () => {
    const options = { enemyMain: pengEnemy, surviveRounds: 1, companionOf: baseCompanion }
    const dodged = fight({
      outerSkillId: 'yuenv_jian', rightCompanionId: 'mayu', companionWeapons: { mayu: 'qinggang_sword' },
      companionEquipment: { mayu: { HEAD: trialPartId('jiuwei_linghu', 'HEAD'), BELT: trialPartId('jiuwei_linghu', 'BELT') } },
    }, { ...options, rng: () => 0 })
    expect(dodged.events.find((event) => event.type === 'DODGE')).toMatchObject({ round: 1, targetSlot: 'ALLY_RIGHT', hitResult: 'DODGE' })
    expect(dodged.events.some((event) => event.statusApplied === '封招')).toBe(false)

    const disarmed = fight({ outerSkillId: 'luoying_zhang', rightCompanionId: 'mayu' }, { ...options, rng: () => 0.99 })
    expect(disarmed.events.find((event) => event.statusApplied === '缴械')).toMatchObject({ targetSlot: 'ENEMY_MAIN' })
    expect(disarmed.events.find((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN'))
      .toMatchObject({ skillId: 'bare_hands', targetSlot: 'ALLY_MAIN' })
    expect(disarmed.events.some((event) => event.actorSlot === 'ENEMY_MAIN' && (event.rageDelta ?? 0) < 0)).toBe(false)
    expect(disarmed.events.some((event) => event.statusApplied === '封招' || event.statusApplied === '暗器针毒')).toBe(false)
  })

  it('试玩 2-3 正常挑战的内力变化会进入战斗回放面板', () => {
    const store = newStore('DEMO')
    try {
      store.player.maxChapterId = tanchuduan.id
      store.player.level = 25
      store.player.realmTier = 3
      Object.assign(store.player.stats, { str: 10, con: 95, agi: 0, intStat: 20, karma: 0 })
      store.updateLoadout({ ...loadout, stance: 'TAICHI' })
      store.challengeChapter(tanchuduan.id)
      const report = store.activeBattle!
      const unit = report.units.find((entry) => entry.slot === 'ENEMY_MAIN')!
      const changes = report.events.filter((event) => event.actorSlot === unit.slot && event.mpDelta)
      expect(changes[0]).toMatchObject({ round: 3, rageDelta: -85, mpDelta: -1305 })
      expect(changes[1]).toMatchObject({ round: 3, effectSourceId: 'quanzhen_tuna', mpDelta: 313 })
      expect(store.liveUnitStates.ENEMY_MAIN.mp).toBe(unit.maxMp)
      store.skipBattleToEnd()
      expect(store.liveUnitStates.ENEMY_MAIN.mp).toBe(unit.maxMp + changes.reduce((total, event) => total + event.mpDelta!, 0))
    } finally {
      store.closeBattleStage()
    }
  })

  it('试玩 5-2 正常挑战让彭连虎独立蓄怒并封住实战后排', () => {
    const store = newStore('DEMO')
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      store.player.maxChapterId = temple.id
      store.player.level = 67
      store.player.realmTier = 7
      Object.assign(store.player.stats, { str: 32, con: 100, agi: 0, intStat: 25, karma: 0 })
      store.updateLoadout({ ...loadout, outerSkillId: 'yuenv_jian', rightCompanionId: 'kezhene' })
      store.challengeChapter(temple.id)
      const report = store.activeBattle!
      expect(report.events.find((event) => event.skillId === silverNeedles))
        .toMatchObject({ round: 3, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_RIGHT', hitResult: 'HIT' })
      expect(effectEvents(report, silverNeedles)[0]).toMatchObject({ targetSlot: 'ALLY_RIGHT', statusApplied: '封招', statusRounds: 1 })
      expect(report.events.some((event) => event.actorSlot === 'ENEMY_LEFT' && event.statusApplied === '蓄力')).toBe(true)
    } finally {
      rng.mockRestore()
      store.closeBattleStage()
    }
  })
})

describe('主线药蛇的共享战斗结算', () => {
  it('灵智上人先守前排，药蛇独立出手，实际阵亡后才触发梁子翁惊怒', () => {
    const chapter = STORY_CHAPTERS.find((node) => node.code === '2-2')!
    const { enemyMain, enemyGuards } = storyEncounter(chapter)
    const report = fight({}, {
      enemyMain: { ...enemyMain, hp: 20_000, atk: 65, mp: 500 },
      enemyGuards: [{ ...enemyGuards![0], hp: 1, atk: 40 }, { ...enemyGuards![1], hp: 280, atk: 70 }],
      surviveRounds: 5, rng: () => 0.99,
    })
    expect(mainCast(report)).toMatchObject({ targetSlot: 'ENEMY_LEFT' })
    expect(report.units.find((unit) => unit.slot === 'ENEMY_RIGHT')?.name).toBe('赤腹药蛇')
    expect(report.events.some((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_RIGHT')).toBe(true)
    expect(report.events.some((event) => event.type === 'DOT_TICK' && event.actorSlot === 'ENEMY_RIGHT')).toBe(true)
    const reaction = report.events.filter((event) => event.statusApplied === '药蛇惊怒')
    expect(reaction).toMatchObject([{ effectSourceId: 'e_right', targetSlot: 'ENEMY_MAIN' }])
    const index = report.events.indexOf(reaction[0])
    const before = report.events.slice(0, index)
    expect(before.filter((event) => event.targetSlot === 'ENEMY_RIGHT').reduce((sum, event) => sum - (event.hpDelta ?? 0), 0)).toBeGreaterThanOrEqual(280)
    expect(reaction[0].segments).toContainEqual({
      type: 'tag', text: '参仙老怪·梁子翁 · 药蛇惊怒 · 攻击 65 → 98 · 防御归零', tone: 'red',
    })
  })

  it('饮过宝血的角色在其他战斗里仍按毒抗减少实际跳伤', () => {
    const enemyMain = { ...enemy, atk: 250, combat: { periodicOnHit: { status: 'dartPoison' as const, rounds: 2, attackPercent: 8 } } }
    const plain = fight({}, { enemyMain, surviveRounds: 1 })
    const drank = fight({}, { enemyMain, surviveRounds: 1, player: { ...player, storySnakeChoice: 'A', bonusHpPct: 15 } })
    expect(mainUnit(drank).maxHp).toBe(Math.round(865 * 1.08 * 1.15))
    const poison = (report: BattleReportDTO) => report.events.find((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')!
    expect(poison(plain).hpDelta).toBe(-20)
    expect(poison(drank).hpDelta).toBe(-16)
    expect(poison(drank).segments).toContainEqual({ type: 'tag', text: '毒伤减免 4', tone: 'jade' })
    expect(effectEvents(drank, 'shedu_baoxue')).toMatchObject([{ actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN' }])
  })
})

describe('历练暗器与江湖称号', () => {
  const veteran = { ...player, trial: { ...player.trial, rewardedStageIds: [4, 5, 11, 21] } }

  it('首胜暗器先过护甲和护盾再致盲，卸下腰带只保留首件', () => {
    const ids = ['feitian_tieling', 'yanwei_jian']
    const gear = { hiddenWeaponIds: ids, beltId: trialPartId('qianshou_panguan', 'BELT') }
    const options = { player: veteran, surviveRounds: 3, enemyMain: { ...enemy, combat: { def: 600, openingShield: 900 } } }
    const report = fight(gear, options)
    const attack = computeDerivedStats(veteran, { ...loadout, ...gear }).atk
    const first = effectEvents(report, ids[0]).find((event) => event.shieldAbsorbed)!
    expect(first).toMatchObject({ round: 1, targetSlot: 'ENEMY_MAIN', shieldAbsorbed: Math.round(attack * 0.95), hpDelta: 0 })
    expect(report.events.indexOf(first)).toBeLessThan(report.events.indexOf(mainCast(report)))
    expect(effectEvents(report, ids[0])).toContainEqual(expect.objectContaining({ round: 1, statusApplied: '命中降低', statusRounds: 2 }))
    const arrow = effectEvents(report, ids[1])
    const shields = report.events.slice(0, report.events.indexOf(arrow.find((event) => event.statusRemoved === '护盾')!))
      .filter((event) => event.targetSlot === 'ENEMY_MAIN').reduce((sum, event) => sum + (event.shieldDelta ?? 0), 0)
    expect(arrow.find((event) => event.statusRemoved === '护盾')).toMatchObject({ round: 3, shieldDelta: -shields })
    expect(arrow.find((event) => event.hitResult === 'CRIT')).toMatchObject({ round: 3, hpDelta: -Math.round(attack * 2.2 * 1.55) })
    expect(effectEvents(fight(gear, { ...options, player }), ids[0])).toHaveLength(0)
    expect(effectEvents(fight({ ...gear, beltId: null }, options), ids[1])).toHaveLength(0)
    expect(hiddenWeaponCapacity({ beltId: trialPartId('qianying_mixing', 'BELT') })).toBe(2)
  })

  it('飞蝗玉石在敌方实际出绝技前只截一次怒气，固定轮次蓄力由原打断规则处理', () => {
    const gear = { hiddenWeaponIds: ['feihuang_shi'] }
    const combat = { def: 500, openingShield: 999, openingRage: 100, rageSkillId: 'yiyang_zhi' }
    const report = fight(gear, { player: veteran, surviveRounds: 3, enemyMain: { ...enemy, combat } })
    const hits = effectEvents(report, 'feihuang_shi')
    expect(hits.filter((event) => event.hpDelta)).toMatchObject([{ round: 1, hpDelta: -Math.round(computeDerivedStats(veteran, loadout).atk * 1.2) }])
    expect(hits.filter((event) => event.rageDelta)).toMatchObject([{ round: 1, rageDelta: -40, rageTargetSlot: 'ENEMY_MAIN' }])
    expect(report.events.some((event) => event.round === 1 && event.actorSlot === 'ENEMY_MAIN' && event.isUlt)).toBe(false)
    const charge = fight(gear, { player: veteran, surviveRounds: 2,
      enemyMain: { ...enemy, combat: { ...combat, charge: { round: 1, name: '试招', damageMultiplier: 2 } } } })
    expect(effectEvents(charge, 'feihuang_shi')).toHaveLength(0)
    expect(charge.events.some((event) => event.statusApplied === '蓄力')).toBe(true)
  })

  it('银针以施放者实际气血触发一次，破脉跳过目标本回合，流血独立跳伤', () => {
    const report = fight({ hiddenWeaponIds: ['dulong_yinzhen'] }, { player: veteran, surviveRounds: 5,
      enemyMain: { ...enemy, atk: 270, combat: { speed: 155 } }, rng: () => 0.99 })
    const hits = effectEvents(report, 'dulong_yinzhen')
    expect(hits.filter((event) => event.statusApplied === '破脉')).toMatchObject([{ round: 4, statusRounds: 1 }])
    expect(hits.filter((event) => event.type === 'DOT_TICK')).toMatchObject([
      { round: 4, hpDelta: -43, statusRounds: 1 }, { round: 5, hpDelta: -43, statusRounds: 0 },
    ])
    expect(report.events.some((event) => event.round === 4 && event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN')).toBe(false)
  })

  it('少室山与切磋分别从每位出战玩家读取暗器槽', () => {
    const lead = { player: veteran, loadout, learnedSkills: {} }
    const left = { ...lead, player: { ...veteran, id: 'left' }, loadout: { ...loadout, hiddenWeaponIds: ['feitian_tieling'] } }
    const right = { ...lead, player: { ...veteran, id: 'right' }, loadout: { ...loadout, hiddenWeaponIds: ['feitian_tieling'] } }
    const raid = simulateShaoshiRaid('test', [lead, left, right], () => 0.99, {})
    expect(effectEvents(raid, 'feitian_tieling').filter((event) => event.hpDelta)).toMatchObject([
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT' }, { actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT' },
    ])
    const duel = simulatePlayerDuel({ battleId: 'test', sceneTitle: '切磋', mode: 'PVP_HUASHAN',
      lineup: [lead, left], rng: () => 0.73, environment: {} })
    expect(effectEvents(duel, 'feitian_tieling').filter((event) => event.hpDelta)).toMatchObject([{ actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN' }])
  })

  it('按当前预设武学和侠义启用称号，全队收益与邪派目标分别结算', () => {
    const righteous = { ...veteran, stats: { ...veteran.stats, karma: 300 } }
    const dragon = { ...loadout, outerSkillId: 'xianglong_18', titleId: 'title_jinlong', leftCompanionId: 'zhebie' }
    const withoutTitle = { ...dragon, titleId: null }
    const report = fight(dragon, { player: righteous, enemyMain: { ...enemy, combat: { alignment: 'HERETIC' } } })
    expect(mainUnit(report).title).toContain('仁义狂客')
    expect(computeDerivedStats(righteous, dragon).def).toBe(Math.round(computeDerivedStats(righteous, withoutTitle).def * 1.06))
    expect(mainCast(report).segments.some((entry) => entry.type === 'tag' && entry.text.includes('仁义狂客 · 克敌增伤'))).toBe(true)
    const neutral = fight(dragon, { player: righteous })
    expect(mainCast(neutral).segments.some((entry) => entry.type === 'tag' && entry.text.includes('仁义狂客 · 克敌增伤'))).toBe(false)
    expect(computeDerivedStats(righteous, { ...dragon, outerSkillId: 'quanzhen_jianfa' }).def).toBe(computeDerivedStats(righteous, withoutTitle).def)
    const mountain = { ...loadout, outerSkillId: 'quanzhen_jianfa', titleId: 'title_chongyang' }
    expect(cultivationRate(righteous, mountain)).toBeGreaterThan(cultivationRate(righteous, { ...mountain, titleId: null }))
    expect(resolveBattleLoadout(mountain, righteous).effects).toContainEqual(expect.objectContaining({ kind: 'CONTROL_RESIST', chancePercent: 20, statuses: ['SEAL'] }))
    const hermit = { ...loadout, outerSkillId: 'luoying_zhang', titleId: 'title_bihai' }
    const base = computeDerivedStats(veteran, { ...hermit, titleId: null })
    expect(computeDerivedStats(veteran, hermit)).toMatchObject({ speed: base.speed + 15, dodge: base.dodge + 4 })
  })

  it('赤炼阎罗在负侠义边界生效，白骨爪流血和称号重伤独立结算', () => {
    const evil = { ...veteran, stats: { ...veteran.stats, karma: -300 } }
    const gear = { outerSkillId: 'jiuyin_baiguzhua', titleId: 'title_youming' }
    const report = fight(gear, { player: evil })
    expect(effectEvents(report, 'title_youming').filter((event) => event.round === 1 && event.statusApplied)).toMatchObject([
      { statusApplied: '重伤减疗', statusRounds: 2 }, { statusApplied: '重伤流血', statusRounds: 2 },
    ])
    const dots = report.events.filter((event) => event.round === 1 && event.type === 'DOT_TICK')
    expect(dots.map((event) => event.effectSourceId)).toEqual(['jiuyin_baiguzhua', 'title_youming'])
    expect(effectEvents(fight(gear, { player: { ...evil, stats: { ...evil.stats, karma: -299 } } }), 'title_youming')).toHaveLength(0)
  })
})

describe('敌方护卫协战、阵型与阵亡反应', () => {
  const casts = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot.startsWith('ENEMY'))

  it('历练第 8 关双将各行动一次，沈青刚倒地后吴青烈当回合降攻 40%', () => {
    const stage = trialStageOf(8)!
    const options = { enemyMain: { ...stage.boss, mp: 500 }, enemyGuards: stage.guards, surviveRounds: 1, rng: () => 0.99 }
    const duo = fight({}, options)
    expect(casts(duo).map((event) => event.actorSlot)).toEqual(['ENEMY_MAIN', 'ENEMY_LEFT'])
    expect(mainCast(duo).targetSlot).toBe('ENEMY_MAIN')
    const defeated = fight({}, { ...options, enemyMain: { ...options.enemyMain, hp: 1 } })
    expect(casts(defeated).map((event) => event.actorSlot)).toEqual(['ENEMY_LEFT'])
    const debuff = defeated.events.find((event) => event.statusApplied === '枪法大乱')!
    expect(debuff).toMatchObject({ round: 1, actorSlot: 'ENEMY_LEFT', targetSlot: 'ENEMY_LEFT' })
    expect(defeated.events.indexOf(debuff)).toBeLessThan(defeated.events.indexOf(casts(defeated)[0]))
    expect(casts(defeated)[0].hpDelta).toBe(-incomingDamage(Math.round(stage.guards![0].atk * 0.6), 1, computeDerivedStats(player, loadout).def, player.level))
  })

  it('协战护卫按自身受控状态跳过行动，主将照常出手', () => {
    const report = fight({ rightCompanionId: 'wangchuyi' }, { enemyMain: { ...enemy, combat: { speed: 90 } },
      enemyGuards: [{ ...enemy, combat: { speed: 80, joinsRound: true } }], surviveRounds: 1 })
    expect(effectEvents(report, 'wangchuyi')).toContainEqual(expect.objectContaining({ targetSlot: 'ENEMY_LEFT', statusApplied: '击退' }))
    expect(casts(report).map((event) => event.actorSlot)).toEqual(['ENEMY_MAIN'])
    expect(report.events).toContainEqual(expect.objectContaining({ actorSlot: 'ENEMY_LEFT', targetSlot: 'ENEMY_LEFT', effectSourceId: 'wangchuyi' }))
  })

  it('历练第 24 关斥候先射，后排斥候不替侯通海承受点穴', () => {
    const stage = trialStageOf(24)!
    const report = fight({ outerSkillId: 'lanhua_shou' }, {
      enemyMain: { ...stage.boss, hp: 30_000, atk: 45, mp: 500 }, enemyGuards: stage.guards!.map((guard) => ({ ...guard, atk: 30 })), surviveRounds: 4,
    })
    expect(casts(report)[0]).toMatchObject({ round: 1, actorSlot: 'ENEMY_LEFT' })
    expect(report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.skillId === 'lanhua_shou').map((event) => event.targetSlot))
      .toEqual(['ENEMY_MAIN', 'ENEMY_MAIN', 'ENEMY_MAIN', 'ENEMY_MAIN'])
    expect(report.events).toContainEqual(expect.objectContaining({ round: 3, targetSlot: 'ENEMY_MAIN', statusApplied: '点穴眩晕', statusRounds: 2 }))
  })

  it('破旧斗笠只抵消实际出手者对隐蔽敌人的首回合命中惩罚', () => {
    const hat = trialPartId('pomiao_caomang', 'HEAD')
    const concealed = { ...enemy, combat: { openingConcealment: 10 } }
    const run = (headId: string | null, enemyMain = concealed) => fight({ headId }, {
      player: { ...player, stats: { ...player.stats, agi: 9 } }, enemyMain, environment: {},
    })
    const baseline = run(null)
    expect(mainCast(baseline).hitResult).toBe('MISS')
    const revealed = run(hat)
    expect(mainCast(revealed).hitResult).toBe('HIT')
    expect(mainCast(revealed).segments).toContainEqual({ type: 'tag', text: '破旧斗笠 · 反隐蔽抵消 5 个百分点', tone: 'jade' })
    expect(revealed.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')?.segments)
      .not.toContainEqual(expect.objectContaining({ text: expect.stringContaining('反隐蔽') }))
    expect(mainCast(run(hat, { ...enemy, combat: { openingConcealment: 0 } })).segments)
      .not.toContainEqual(expect.objectContaining({ text: expect.stringContaining('反隐蔽') }))
  })

  it('历练第 28 关交换实际前排与招架加成，快于两人时抢位破阵', () => {
    const stage = trialStageOf(28)!
    const options = { player: { ...player, stats: { ...player.stats, agi: 9 } }, enemyMain: { ...stage.boss, atk: 45, mp: 500 },
      enemyGuards: stage.guards!.map((guard) => ({ ...guard, atk: 30 })), surviveRounds: 2 }
    const slow = fight({}, options)
    expect(effectEvents(slow, 'enemy_formation')).toMatchObject([
      { round: 1, targetSlot: 'ENEMY_LEFT', segments: [{ type: 'tag', text: expect.stringContaining('招架 +20 个百分点') }] },
      { round: 2, targetSlot: 'ENEMY_MAIN' },
    ])
    expect(slow.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST').map((event) => event.targetSlot))
      .toEqual(['ENEMY_LEFT', 'ENEMY_MAIN'])
    const roundTwoStrike = (report: BattleReportDTO) => report.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST' && event.round === 2)
    expect(roundTwoStrike(slow)?.hitResult).toBe('PARRY')
    const fast = fight({ lightSkillId: 'lingbo_weibu' }, options)
    expect(effectEvents(fast, 'enemy_formation')).toMatchObject([{ round: 1, actorSlot: 'ALLY_MAIN', statusRemoved: '天罡北斗阵' }])
    expect(mainCast(fast).targetSlot).toBe('ENEMY_MAIN')
    expect(roundTwoStrike(fast)?.hitResult).toBe('HIT')
    expect(fast.events.indexOf(effectEvents(fast, 'enemy_formation')[0])).toBeLessThan(fast.events.indexOf(mainCast(fast)))
  })

  it('历练第 29 关死士仅自爆一次，奇门配轻功击飞后只波及己方前排', () => {
    const stage = trialStageOf(29)!
    const formation = { leftCompanionId: 'guojing', rightCompanionId: 'zhebie' }
    const options = { enemyMain: { ...stage.boss, atk: 45, mp: 500 },
      enemyGuards: stage.guards!.map((guard, index) => ({ ...guard, hp: index === 0 ? 1 : guard.hp, atk: 180 })), surviveRounds: 1 }
    const burst = (report: BattleReportDTO) => report.events.filter((event) => event.actorSlot === 'ENEMY_LEFT' && event.effectSourceId ===
      report.units.find((unit) => unit.slot === 'ENEMY_LEFT')?.id && event.type === 'EFFECT')
    const ordinary = fight(formation, options)
    expect(burst(ordinary).map((event) => event.targetSlot)).toEqual([undefined, 'ALLY_LEFT', 'ALLY_MAIN', 'ALLY_RIGHT'])
    expect(burst(ordinary).filter((event) => event.targetSlot).every((event) => (event.hpDelta ?? 0) < 0)).toBe(true)
    expect(casts(ordinary).some((event) => event.actorSlot === 'ENEMY_LEFT')).toBe(false)
    const pushed = fight({ ...formation, stance: 'AGILE', lightSkillId: 'lingbo_weibu' }, options)
    expect(pushed.events).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', statusApplied: '远离中军' }))
    expect(burst(pushed).map((event) => event.targetSlot)).toEqual([undefined, 'ALLY_LEFT'])
  })

  it('阵亡伤害先由实际目标的盾吸收，最后一名敌人自爆带走主角时判负', () => {
    const deathBlast = trialStageOf(29)!.guards![0].combat!.deathBlast!
    const combat = { deathBlast: { ...deathBlast, attackPercent: 600 } }
    const fatal = fight({}, { enemyMain: { ...enemy, hp: 1, atk: 1000, combat }, surviveRounds: 1 })
    expect(fatal.winner).toBe('ENEMY')
    expect(fatal.events.at(-1)).toMatchObject({ actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: -mainUnit(fatal).maxHp })
    const shielded = fight(equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']), {
      enemyMain: { ...enemy, hp: 1, atk: 30, combat }, surviveRounds: 1,
    })
    expect(shielded.winner).toBe('ALLY')
    expect(shielded.events.at(-1)).toMatchObject({ actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: 0, shieldAbsorbed: expect.any(Number) })
  })

  it('试玩历练的正常挑战入口使用第 8 关实装的吴青烈', () => {
    const store = newStore('DEMO')
    try {
      store.player.level = 8
      store.player.realmTier = 1
      Object.assign(store.player.stats, player.stats)
      store.trial.maxStageId = 8
      store.trial.stageHours['8'] = TRIAL_PATROL_HOURS[8]
      store.updateLoadout(loadout)
      store.challengeTrialStage(8)
      expect(store.activeBattle!.units).toContainEqual(expect.objectContaining({ slot: 'ENEMY_LEFT', name: '追命枪·吴青烈' }))
      expect(casts(store.activeBattle!)).toContainEqual(expect.objectContaining({ round: 1, actorSlot: 'ENEMY_LEFT' }))
    } finally {
      store.closeBattleStage()
    }
  })

  it('主线试玩和联机配置的灵智上人在梁子翁仍存活时独立放大手印', () => {
    for (const scene of [STORY_CHAPTERS.find((chapter) => chapter.code === '2-2')!, ONLINE_STORY_CHAPTERS.find((chapter) => chapter.code === '2-2')!]) {
      const report = fight({}, { enemyMain: { name: scene.bossName, title: scene.bossTitle, portrait: scene.bossPortrait,
        hp: scene.bossHp, atk: 200, mp: 500, stance: scene.bossStance, combat: scene.bossCombat }, enemyGuards: scene.guards,
      player: { ...player, stats: { ...player.stats, con: 30 } }, surviveRounds: 1 })
      expect(casts(report)).toMatchObject([
        { round: 1, actorSlot: 'ENEMY_LEFT', skillId: 'dashouyin', isUlt: true }, { round: 1, actorSlot: 'ENEMY_MAIN' },
      ])
    }
  })
})

describe('历练阵眼、试题和药蛇', () => {
  it('第 13 关药蛇实际阵亡后梁子翁才狂怒并清零防御', () => {
    const stage = trialStageOf(13)!
    const enemyMain = { ...stage.boss, hp: 20_000, atk: 100, mp: 500 }
    const options = { enemyMain, surviveRounds: 2 }
    const alive = fight({}, { ...options, enemyGuards: stage.guards })
    expect(alive.events.some((event) => event.statusApplied === '药蛇惊怒')).toBe(false)
    const slain = fight({}, { ...options, enemyGuards: stage.guards!.map((guard) => ({ ...guard, hp: 1, atk: 20 })) })
    expect(slain.events.filter((event) => event.statusApplied === '药蛇惊怒')).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', segments: [{ type: 'tag', text: expect.stringContaining('攻击 100 → 150 · 防御归零') }] },
    ])
    const roundTwo = (report: BattleReportDTO) => report.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!
    expect(roundTwo(slain).hpDelta).toBeLessThan(roundTwo(alive).hpDelta!)
  })

  it('第 19 关八门真实变动防御，实际高悟性黄蓉在生门引路且命中才破阵', () => {
    const stage = trialStageOf(19)!
    const enemyMain = { ...stage.boss, hp: 70_000, atk: 30, mp: 500 }
    const plain = fight({}, { enemyMain, surviveRounds: 8 })
    expect(effectEvents(plain, 'nine_palace').map((event) => event.statusApplied)).toEqual(['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'])
    const casts = plain.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')
    expect(casts[1].hpDelta).toBeLessThan(casts[0].hpDelta!)
    const gear = { rightCompanionId: 'huangrong', companionEquipment: { huangrong: { HEAD: trialPartId('jinwang_fuxiu', 'HEAD') } } }
    const options = { enemyMain, surviveRounds: 3, companionOf: baseCompanion }
    const broken = fight(gear, options)
    expect(effectEvents(broken, 'nine_palace').map((event) => event.statusApplied)).toEqual(['休门', '生门', '阵眼已破'])
    expect(effectEvents(broken, 'nine_palace').at(-1)).toMatchObject({ round: 2, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN' })
    const noHit = fight(gear, { ...options, enemyMain: { ...enemyMain, combat: { ...enemyMain.combat, dodge: 100 } } })
    expect(effectEvents(noHit, 'nine_palace').map((event) => event.statusApplied)).toEqual(['休门', '生门', '伤门'])
    const lowInsight = fight({ rightCompanionId: 'huangrong' }, options)
    expect(effectEvents(lowInsight, 'nine_palace').some((event) => event.statusApplied === '阵眼已破')).toBe(false)
  })

  it('第 21 关正确背诵只化解第二试，第三试可打断并按十回合生存获胜', () => {
    const stage = trialStageOf(21)!
    const options = { player: { ...player, stats: { ...player.stats, con: 100 } },
      enemyMain: { ...stage.boss, hp: 100_000, atk: 45, mp: 500 }, surviveRounds: 10 }
    const normal = fight({}, options)
    const solved = fight({ outerSkillId: 'lanhua_shou' }, { ...options, puzzleOutcome: trialPuzzleOutcome(stage, '生门') })
    expect(effectEvents(solved, 'peach_trials').map((event) => event.round)).toEqual([3, 6, 9])
    expect(normal.events.filter((event) => event.statusApplied === '心神混乱').map((event) => event.round)).toEqual([3, 6, 9])
    expect(solved.events.filter((event) => event.statusApplied === '心神混乱').map((event) => event.round)).toEqual([3])
    expect(effectEvents(solved, 'lanhua_shou')).toContainEqual(expect.objectContaining({ round: 9, targetSlot: 'ENEMY_MAIN', statusRemoved: '蓄力' }))
    expect(solved.winner).toBe('ALLY')
    expect(solved.events.at(-1)!.round).toBe(10)
  })

  it('试玩第 25 关正常挑战按所选答案结算，答对失神与降闪避，答错正常迎战', () => {
    for (const [answer, correct] of [['五', true], ['三', false]] as const) {
      const store = newStore('DEMO')
      try {
        store.player.level = 25
        Object.assign(store.player.stats, { str: 20, agi: 0, con: 55 })
        store.trial.maxStageId = 25
        store.trial.stageHours['25'] = TRIAL_PATROL_HOURS[25]
        store.updateLoadout(loadout)
        store.challengeTrialStage(25, answer)
        const report = store.activeBattle!
        expect(effectEvents(report, 'trial_puzzle_25')[0]).toMatchObject({ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN' })
        expect(effectEvents(report, 'trial_puzzle_25').filter((event) => event.statusApplied).map((event) => event.statusApplied))
          .toEqual(correct ? ['点穴眩晕', '闪避降低'] : [])
        expect(report.events.some((event) => event.round === 1 && event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN')).toBe(!correct)
      } finally {
        store.closeBattleStage()
      }
    }
  })
})

describe('历练连击弱点、听声辨位与焚石掌风', () => {
  const bossOf = (id: number) => ({ ...trialStageOf(id)!.boss, hp: 20_000, atk: 150, mp: 500 })

  it('焦大亨连续三个回合被命中才失衡，多段出手只记一回合', () => {
    const boss = bossOf(2)
    const skilled = { ...player, stats: { ...player.stats, agi: 82 } }
    const options = { player: skilled, enemyMain: boss, surviveRounds: 4, rng: () => 0 }
    const report = fight({ outerSkillId: 'shuangshou_hubo' }, options)
    expect(report.events.filter((event) => event.statusApplied === '重心失衡')).toMatchObject([{ round: 3, targetSlot: 'ENEMY_MAIN' }])
    const fourth = report.events.find((event) => event.round === 4 && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!
    expect(fourth.hitResult).toBe('CRIT')
    const base = computeDerivedStats(skilled, { ...loadout, outerSkillId: 'shuangshou_hubo' }).crit
    expect(fourth.segments).toContainEqual({ type: 'tag', text: `重心失衡 · 暴击率 +25 个百分点（本次 ${base + 25}%）`, tone: 'gold' })
    const dodging = fight({}, { ...options, enemyMain: { ...boss, combat: { ...boss.combat, dodge: 30 } } })
    expect(dodging.events.some((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' && event.hitResult === 'DODGE')).toBe(true)
    expect(dodging.events.some((event) => event.statusApplied === '重心失衡')).toBe(false)
  })

  it('梅超风攒怒释放白骨爪，金雁功和碧海潮生曲实际扰乱听声辨位', () => {
    const options = { enemyMain: bossOf(17), surviveRounds: 3 }
    const baseline = fight({}, options)
    expect(baseline.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.skillId === 'jiuyin_baiguzhua')).toMatchObject({ round: 3, targetSlot: 'ALLY_MAIN' })
    expect(effectEvents(baseline, 'jiuyin_baiguzhua').some((event) => event.statusApplied === '流血')).toBe(true)
    const light = fight({ lightSkillId: 'jinyan_gong' }, options)
    expect(effectEvents(light, 'jinyan_gong').find((event) => event.statusApplied)).toMatchObject({ round: 1, statusApplied: '听声辨位受扰' })
    expect(light.events.find((event) => event.round === 1 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')).toMatchObject({ hitResult: 'MISS', hpDelta: 0 })
    const melody = fight({ ultSkillId: 'bihai_chaosheng' }, options)
    expect(effectEvents(melody, 'bihai_chaosheng').find((event) => event.statusApplied === '听声辨位受扰')).toMatchObject({ round: 2, targetSlot: 'ENEMY_MAIN' })
  })

  it('周伯通按战斗快照的实际悟性与随身促织笼放水，35 点悟性为边界', () => {
    const boss = bossOf(20)
    const options = { surviveRounds: 1, enemyMain: boss, player: { ...player, stats: { ...player.stats, intStat: 35 } } }
    const baseline = fight({}, options)
    const blow = (report: BattleReportDTO) => report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    expect(baseline.events.some((event) => event.statusApplied === '手下留情')).toBe(false)
    const lowInsight = { ...options, player: { ...player, stats: { ...player.stats, intStat: 34 } } }
    const mercy = fight({}, lowInsight)
    expect(blow(mercy).hpDelta).toBe(-incomingDamage(75, 1.22, computeDerivedStats(player, loadout).def, player.level))
    const cricket = fight({}, { ...options, ownedItemIds: [trialPartId('kongming_wantong', 'ACC')] })
    expect(blow(cricket).hpDelta).toBe(blow(mercy).hpDelta)
    expect(fight({ headId: trialPartId('qimen_dunjia', 'HEAD') }, lowInsight).events.some((event) => event.statusApplied === '手下留情')).toBe(false)
  })

  it('裘千仞第 2 回合蓄力，太极化解释放，一阳指命中打断', () => {
    const boss = bossOf(26)
    const options = { surviveRounds: 3, enemyMain: { ...boss, combat: { ...boss.combat, speed: 1500 } } }
    const normal = fight({}, options)
    const chargedHit = (report: BattleReportDTO) => report.events.find((event) => event.round === 3 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')
    expect(normal.events.find((event) => event.statusApplied === '蓄力')).toMatchObject({ round: 2, actorSlot: 'ENEMY_MAIN' })
    expect(chargedHit(normal)?.hpDelta).toBe(-incomingDamage(150, 2, computeDerivedStats(player, loadout).def, player.level))
    const guarded = fight({ stance: 'TAICHI' }, options)
    expect(effectEvents(guarded, 'taichi_deflect')).toMatchObject([{ round: 3, targetSlot: 'ENEMY_MAIN' }])
    expect(chargedHit(guarded)).toBeUndefined()
    const interrupted = fight({ ultSkillId: 'yiyang_zhi' }, options)
    expect(effectEvents(interrupted, 'yiyang_zhi').find((event) => event.statusRemoved === '蓄力')).toMatchObject({ round: 2, targetSlot: 'ENEMY_MAIN' })
    expect(chargedHit(interrupted)).toBeUndefined()
  })
})

describe('陈玄风罩门与裘千丈破防', () => {
  const chen = { ...trialStageOf(7)!.boss, hp: 20_000, atk: 250, mp: 500 }
  const sturdy = { ...player, stats: { ...player.stats, con: 100 } }
  const dagger = 'xuantie_dagger'
  const playerCasts = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')

  it('历练陈玄风前四回合猛攻，第五回合防御归零，之后重新护住罩门', () => {
    const report = fight({}, { player: sturdy, enemyMain: chen, surviveRounds: 6 })
    const attacks = report.events.filter((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')
    const { def } = computeDerivedStats(sturdy, loadout)
    expect(attacks.slice(0, 4).every((event) => event.hpDelta === -incomingDamage(300, 1, def, sturdy.level))).toBe(true)
    expect(report.events.find((event) => event.statusApplied === '肚脐罩门')).toMatchObject({ round: 5, targetSlot: 'ENEMY_MAIN', statusRounds: 1 })
    expect(report.events.find((event) => event.statusRemoved === '肚脐罩门')).toMatchObject({ round: 6, targetSlot: 'ENEMY_MAIN' })
    const casts = playerCasts(report)
    expect(-casts[4].hpDelta!).toBeGreaterThan(-casts[5].hpDelta!)
  })

  it('玄铁匕首先用常规外功穿透，破盾后命中罩门按剩余气血结算', () => {
    const build = { weaponId: dagger }
    const options = { player: sturdy, enemyMain: chen, surviveRounds: 6 }
    const report = fight(build, options)
    expect(mainCast(report).segments).toContainEqual({
      type: 'tag', text: expect.stringContaining('牛家村玄铁匕首 · 固定破甲 45 点防御'), tone: 'gold',
    })
    expect(mainCast(report).segments).toContainEqual({
      type: 'tag', text: expect.stringContaining('牛家村玄铁匕首 · 穿透 24 点防御'), tone: 'gold',
    })
    const [finisher] = effectEvents(report, dagger)
    expect(finisher).toMatchObject({ round: 5, targetSlot: 'ENEMY_MAIN', hpDelta: expect.any(Number) })
    expect(finisher.segments).toContainEqual({ type: 'tag', text: '牛家村玄铁匕首 · 刺中肚脐罩门', tone: 'gold' })
    expect(finisher.hpDelta).toBe(-(chen.hp + playerCasts(report).reduce((hp, event) => hp + (event.hpDelta ?? 0), 0)))
    expect(report.winner).toBe('ALLY')
    const shielded = fight(build, { ...options, enemyMain: { ...chen, combat: { ...chen.combat, openingShield: 50_000 } } })
    expect(effectEvents(shielded, dagger)).toEqual([])
    const story = ONLINE_STORY_CHAPTERS.find((chapter) => chapter.code === '1-3')!
    const storyReport = fight(build, { ...options, enemyMain: { ...chen, combat: story.bossCombat } })
    expect(effectEvents(storyReport, dagger)).toMatchObject([{ round: 3, targetSlot: 'ENEMY_MAIN' }])
  })

  it('裘千丈只在单次实扣超过 500 点时永久清零防御', () => {
    const boss = trialStageOf(16)!.boss
    const target = { ...boss, hp: 20_000, atk: 250, mp: 500 }
    const gear = { weaponId: 'dagou_stick_true' }
    const raw = -mainCast(fight(gear, { enemyMain: target, surviveRounds: 1 })).hpDelta!
    expect(raw).toBeGreaterThan(501)
    const exactly = fight(gear, { enemyMain: { ...target, combat: { ...target.combat, openingShield: raw - 500 } }, surviveRounds: 1 })
    expect(mainCast(exactly).hpDelta).toBe(-500)
    expect(exactly.events.some((event) => event.statusApplied === '肝胆俱裂')).toBe(false)
    const shielded = fight(gear, { enemyMain: { ...target, combat: { ...target.combat, openingShield: 5000 } }, surviveRounds: 1 })
    expect(mainCast(shielded).hpDelta).toBe(0)
    expect(shielded.events.some((event) => event.statusApplied === '肝胆俱裂')).toBe(false)
    const broken = fight(gear, { enemyMain: { ...target, combat: { ...target.combat, openingShield: raw - 501 } }, surviveRounds: 2 })
    expect(mainCast(broken).hpDelta).toBe(-501)
    expect(broken.events.filter((event) => event.statusApplied === '肝胆俱裂')).toMatchObject([{ round: 1, targetSlot: 'ENEMY_MAIN' }])
    const unarmored = fight(gear, { enemyMain: { ...target, combat: { def: 0 } }, surviveRounds: 2 })
    expect(playerCasts(broken)[1].hpDelta).toBe(playerCasts(unarmored)[1].hpDelta)
  })
})

describe('射雕双雄与王府双璧', () => {
  const archery = { leftCompanionId: 'guojing', rightCompanionId: 'zhebie' }
  const poison = { leftCompanionId: 'yangkang', rightCompanionId: 'ouyangke' }
  const arrows = (report: BattleReportDTO) => report.events.filter((event) => event.round === 1 && event.skillId === 'lianzhu_shenjian')
  const claw = (report: BattleReportDTO) => report.events.filter((event) => event.type === 'ASSIST_ATTACK' && event.skillId === 'jiuyin_baiguzhua')
  const archeryTags = (report: BattleReportDTO) => effectEvents(report, 'she_diao_shuang_xiong').flatMap((event) => event.segments)

  it('哲别单独连射两箭，双雄多一箭，郭靖实际穿透后再合击一箭', () => {
    expect(arrows(fight({ rightCompanionId: 'zhebie' }, { surviveRounds: 1 }))).toHaveLength(2)
    const paired = fight(archery, { surviveRounds: 1 })
    expect(arrows(paired)).toHaveLength(3)
    expect(archeryTags(paired)).toContainEqual({ type: 'tag', text: '射雕双雄 · 追加一箭', tone: 'purple' })
    expect(archeryTags(paired)).not.toContainEqual({ type: 'tag', text: '射雕双雄 · 降龙破甲合击', tone: 'purple' })

    const guarded = fight(archery, { enemyGuards: [{ ...enemy, combat: { def: 400, openingShield: 5000 } }], surviveRounds: 1 })
    const palm = guarded.events.find((event) => event.skillId === 'xianglong_18')!
    expect(palm).toMatchObject({ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_LEFT', hpDelta: 0 })
    expect(palm.segments).toContainEqual({ type: 'tag', text: '降龙十八掌 · 穿透 140 点防御', tone: 'gold' })
    expect(arrows(guarded)).toHaveLength(4)
    expect(arrows(guarded).every((event) => event.actorSlot === 'ALLY_RIGHT' && event.targetSlot === 'ENEMY_MAIN')).toBe(true)
    expect(archeryTags(guarded)).toContainEqual({ type: 'tag', text: '射雕双雄 · 降龙破甲合击', tone: 'purple' })
  })

  it('哲别按当前存活目标重选，郭靖按实际觉醒形态出掌', () => {
    const options = {
      enemyMain: { ...enemy, hp: 200 }, enemyGuards: [{ ...enemy, combat: { def: 300 } }], surviveRounds: 1,
    }
    const base = fight({ leftCompanionId: 'zhebie', rightCompanionId: 'guojing' }, {
      ...options, companionOf: (id) => companionView(COMPANIONS[id], { form: 'base' }),
    })
    const awakened = fight({ leftCompanionId: 'zhebie', rightCompanionId: 'guojing' }, {
      ...options, companionOf: (id) => companionView(COMPANIONS[id], { form: 'awakened' }),
    })
    expect(arrows(base).map((event) => event.targetSlot)).toEqual(['ENEMY_MAIN', 'ENEMY_LEFT', 'ENEMY_LEFT', 'ENEMY_LEFT'])
    expect(arrows(base).every((event) => event.actorSlot === 'ALLY_LEFT')).toBe(true)
    expect(arrows(base)[0].hpDelta).toBe(-200)
    const palm = (report: BattleReportDTO) => report.events.find((event) => event.skillId === 'xianglong_18')!
    expect(palm(base)).toMatchObject({ actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_LEFT', skillName: '降龙初式' })
    expect(palm(awakened).hpDelta!).toBeLessThan(palm(base).hpDelta!)
  })

  it('欧阳克先施针毒，杨康按当前目标的实际层数加暴击，主角白骨爪独立', () => {
    const report = fight({ ...poison, outerSkillId: 'jiuyin_baiguzhua' }, {
      enemyMain: { ...enemy, hp: 100_000 }, surviveRounds: 4,
    })
    const doses = effectEvents(report, 'ouyangke').filter((event) => event.statusApplied === '扇骨针毒')
    expect(doses.map((event) => event.statusStacks)).toEqual([1, 2, 3, 3])
    expect(doses.every((event) => event.actorSlot === 'ALLY_RIGHT' && event.targetSlot === 'ENEMY_MAIN')).toBe(true)
    expect(claw(report)).toHaveLength(4)
    for (const [index, event] of claw(report).entries()) {
      const stacks = Math.min(3, index + 1)
      expect(report.events.indexOf(doses[index])).toBeLessThan(report.events.indexOf(event))
      expect(event).toMatchObject({ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN' })
      expect(event.segments).toContainEqual({
        type: 'tag', text: `王府双璧 · 毒伤 ${stacks} 层，暴击率 +${stacks * 8} 个百分点（本次 ${28 + stacks * 8}%）`, tone: 'gold',
      })
    }
    expect(report.events.filter((event) => event.actorSlot === 'ALLY_MAIN').flatMap((event) => event.segments)
      .some((segment) => segment.type === 'tag' && segment.text.includes('王府双璧 · 毒伤'))).toBe(false)
    const ticks = effectEvents(report, 'ouyangke').filter((event) => event.type === 'DOT_TICK')
    expect(ticks.map((event) => event.statusStacks)).toEqual([1, 2, 3, 3])
  })

  it('针毒与软猬剧毒独立计层，换目标后按新目标计算', () => {
    const report = fight({ ...poison, armorId: 'ruanwei_armor' }, {
      enemyMain: { ...enemy, hp: 100_000 }, enemyGuards: [{ ...enemy, hp: 2200 }], surviveRounds: 4,
    })
    const casts = claw(report)
    expect(casts[0].targetSlot).toBe('ENEMY_LEFT')
    const mainClaw = casts.find((event) => event.targetSlot === 'ENEMY_MAIN')!
    expect(mainClaw.segments).toContainEqual({
      type: 'tag', text: '王府双璧 · 毒伤 1 层，暴击率 +8 个百分点（本次 36%）', tone: 'gold',
    })
    expect(casts.find((event) => event.round === 3 && event.targetSlot === 'ENEMY_MAIN')?.segments).toContainEqual({
      type: 'tag', text: '王府双璧 · 毒伤 2 层，暴击率 +16 个百分点（本次 44%）', tone: 'gold',
    })
    const solo = fight({ leftCompanionId: 'yangkang', rightCompanionId: 'mayu', armorId: 'ruanwei_armor' }, { surviveRounds: 3 })
    expect(claw(solo).some((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('王府双璧')))).toBe(false)
  })
})

describe('疯魔欧阳锋的逆乱换势与心魔', () => {
  const boss = { ...trialStageOf(30)!.boss, hp: 100_000, atk: 250, mp: 500 }
  const strong = { ...player, stats: { ...player.stats, con: 160 } }
  const jingRong = { leftCompanionId: 'huangrong', rightCompanionId: 'guojing' }
  const waveHits = (report: BattleReportDTO) => effectEvents(report, 'jiuyin_nixing').filter((event) => event.type === 'SKILL_CAST')

  it('交替切换刚猛、奇门，并按当回合架势改变实际伤害', () => {
    const report = fight({}, { player: strong, enemyMain: boss, surviveRounds: 3 })
    const staticStance = fight({}, {
      player: strong, enemyMain: { ...boss, combat: { ...boss.combat, reverseMeridians: undefined } }, surviveRounds: 2,
    })
    const changes = report.events.filter((event) => event.type === 'STANCE_CLASH' && event.actorSlot === 'ENEMY_MAIN')
    expect(changes.map((event) => event.round)).toEqual([2, 3])
    expect(changes[0].segments).toContainEqual({ type: 'tag', text: `${boss.name} · 逆乱换势 · 奇门`, tone: 'purple' })
    expect(changes[1].segments).toContainEqual({ type: 'tag', text: `${boss.name} · 逆乱换势 · 刚猛`, tone: 'purple' })
    const allyHits = (battle: BattleReportDTO) => battle.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN')
    expect(allyHits(report)[0].hpDelta).toBe(allyHits(staticStance)[0].hpDelta)
    expect(allyHits(report)[1].hpDelta!).toBeLessThan(allyHits(staticStance)[1].hpDelta!)
  })

  it('每三回合各自承受掌风，太极可御掌，致死时仍可保命', () => {
    const options = { player: strong, enemyMain: boss, surviveRounds: 6 }
    const guarded = fight({ ...jingRong, stance: 'TAICHI' }, options)
    expect(guarded.winner).toBe('ALLY')
    expect(waveHits(guarded).map((hit) => [hit.round, hit.targetSlot, hit.hpDelta])).toEqual([
      [3, 'ALLY_LEFT', -133], [3, 'ALLY_MAIN', -70], [3, 'ALLY_RIGHT', -133],
      [6, 'ALLY_LEFT', -198], [6, 'ALLY_MAIN', -70], [6, 'ALLY_RIGHT', -198],
    ])

    const exposed = fight(jingRong, options)
    expect(exposed.winner).toBe('ENEMY')
    for (const hit of waveHits(exposed)) {
      const unit = exposed.units.find((entry) => entry.slot === hit.targetSlot)!
      const prior = exposed.events.slice(0, exposed.events.indexOf(hit))
      const hpBefore = unit.hp + prior.filter((event) => event.targetSlot === unit.slot)
        .reduce((hp, event) => hp + (event.hpDelta ?? 0), 0)
      expect(hit.round).toBe(3)
      expect(hit.hpDelta).toBe(-hpBefore)
    }
    expect(waveHits(exposed)).toHaveLength(3)

    const saved = fight({ ...jingRong, accId: 'jiuwei_fox' }, { ...options, surviveRounds: 3 })
    expect(saved.winner).toBe('ALLY')
    const restore = effectEvents(saved, 'jiuwei_fox').find((event) => event.round === 3 && event.hpDelta! > 0)
    expect(restore).toMatchObject({ actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: 2876 })
  })

  it('存活气血降到两成才进入心魔，实际提高接下来的敌方攻击', () => {
    const options = { enemyMain: { ...boss, hp: 177 }, surviveRounds: 1 }
    const heart = fight({}, options)
    const above = fight({}, { ...options, enemyMain: { ...boss, hp: 178 } })
    const enemyCast = (report: BattleReportDTO) => report.events.find((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN')!
    const def = computeDerivedStats(player, loadout).def
    expect(mainCast(heart).hpDelta).toBe(-142)
    expect(mainCast(above).hpDelta).toBe(-142)
    expect(heart.events.filter((event) => event.statusApplied === '心魔')).toHaveLength(1)
    expect(above.events.some((event) => event.statusApplied === '心魔')).toBe(false)
    expect(enemyCast(heart).hpDelta).toBe(-incomingDamage(300, 1, def, player.level))
    expect(enemyCast(above).hpDelta).toBe(-incomingDamage(250, 1, def, player.level))
  })

  it('黄蓉按实际站位破心防，主角绝技命中后郭靖合击并扣除剩余气血', () => {
    const enemyMain = { ...boss, hp: 10_300 }
    const report = fight({ ...jingRong, stance: 'TAICHI', outerSkillId: 'xianglong_18', ultSkillId: 'yiyang_zhi' }, {
      player: strong, enemyMain, surviveRounds: undefined, companionOf: (id) => companionView(COMPANIONS[id], { form: 'base' }),
    })
    const [distraction, palm, finish] = effectEvents(report, 'jing_rong')
    expect(distraction).toMatchObject({ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', statusRemoved: '心魔', statusApplied: '心防动摇' })
    expect(palm).toMatchObject({ round: distraction.round, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', skillId: 'xianglong_18', hpDelta: -1597 })
    expect(finish).toMatchObject({ round: palm.round, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', hpDelta: -49 })
    const ultimate = report.events.find((event) => event.round === palm.round && event.actorSlot === 'ALLY_MAIN' && event.isUlt)!
    expect(ultimate).toMatchObject({ targetSlot: 'ENEMY_MAIN', skillId: 'yiyang_zhi', hpDelta: -1105 })
    expect(report.events.indexOf(ultimate)).toBeLessThan(report.events.indexOf(palm))
    const totalLost = report.events.reduce((sum, event) => sum
      - (event.targetSlot === 'ENEMY_MAIN' ? event.hpDelta ?? 0 : 0)
      - (event.actorSlot === 'ENEMY_MAIN' ? event.reflectDelta ?? 0 : 0), 0)
    expect(totalLost).toBe(enemyMain.hp)
    expect(report.winner).toBe('ALLY')
  })
})

describe('射雕三绝、重阳遗泽与东邪西毒', () => {
  const sheDiao = { leftCompanionId: 'hongqigong', rightCompanionId: 'zhoubotong' }
  const chongYang = { leftCompanionId: 'wangchongyang', rightCompanionId: 'mayu' }
  const dongXi = { leftCompanionId: 'ouyangfeng', rightCompanionId: 'huangyaoshi' }
  const trueDamage = (report: BattleReportDTO) => effectEvents(report, 'dong_xi')
    .filter((event) => event.segments.some((segment) => segment.type === 'damage' && segment.category === 'true'))

  it('射雕三绝每回合只判一次 35%，三位已出招者各额外出手一次', () => {
    const rng = vi.fn(() => 0.3499)
    const report = fight(sheDiao, { rng })
    expect(rng).toHaveBeenCalledTimes(2)
    const extra = effectEvents(report, 'she_diao_san_jue')
    expect(extra).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -142 },
      { round: 1, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', hpDelta: -2016 },
      { round: 1, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', hpDelta: -1884 },
      { round: 2, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -147 },
      { round: 2, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', hpDelta: -2078 },
      { round: 2, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', hpDelta: -632 },
    ])
    expect(extra.every((event) => event.rageDelta === undefined)).toBe(true)
    const atThreshold = fight(sheDiao, { rng: () => 0.35 })
    expect(effectEvents(atThreshold, 'she_diao_san_jue')).toEqual([])
    expect(effectEvents(fight({ leftCompanionId: sheDiao.rightCompanionId, rightCompanionId: sheDiao.leftCompanionId }, { rng }), 'she_diao_san_jue'))
      .toHaveLength(6)
  })

  it('两次正常开战独立判定同一回合的射雕三绝', () => {
    const rng = vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.8)
    try {
      expect(effectEvents(fight(sheDiao, { surviveRounds: 1 }), 'she_diao_san_jue')).toHaveLength(3)
      expect(effectEvents(fight(sheDiao, { surviveRounds: 1 }), 'she_diao_san_jue')).toHaveLength(0)
      expect(rng).toHaveBeenCalledTimes(2)
    } finally {
      rng.mockRestore()
    }
  })

  it('射雕三绝重新选择存活目标，绝技回合只追加已完成的追击', () => {
    const guard = { ...enemy, name: '护卫', hp: 300 }
    const retargeted = fight(sheDiao, { rng: () => 0, surviveRounds: 1, enemyGuards: [guard] })
    expect(effectEvents(retargeted, 'she_diao_san_jue')).toMatchObject([
      { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', hpDelta: -142 },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', hpDelta: -2016 },
    ])

    const ultimate = fight({ ...sheDiao, ultSkillId: 'yiyang_zhi' }, { rng: vi.fn().mockReturnValueOnce(1).mockReturnValue(0) })
    expect(ultimate.events.some((event) => event.round === 2 && event.skillId === 'yiyang_zhi')).toBe(true)
    expect(effectEvents(ultimate, 'she_diao_san_jue')).toMatchObject([
      { round: 2, actorSlot: 'ALLY_LEFT', type: 'ASSIST_ATTACK' }, { round: 2, actorSlot: 'ALLY_RIGHT', type: 'ASSIST_ATTACK' },
    ])
  })

  it('重阳遗泽在盾后保留 1 点气血并回到 30%，第二次致死无法再触发', () => {
    const report = fight(chongYang, { enemyMain: { ...enemy, atk: 1700 }, surviveRounds: 3 })
    const [saved] = effectEvents(report, 'chong_yang_yi_ze')
    expect(effectEvents(report, 'chong_yang_yi_ze')).toMatchObject([
      { round: 1, targetSlot: 'ALLY_MAIN', hpDelta: 279 },
    ])
    expect(report.events[report.events.indexOf(saved) - 1]).toMatchObject({ hpDelta: 1 - mainUnit(report).maxHp })
    expect(saved.segments).toContainEqual({ type: 'tag', text: '重阳遗泽 · 免死', tone: 'jade' })
    expect(report.events.at(-1)).toMatchObject({ round: 2, type: 'GUARD_BLOCK', targetSlot: 'ALLY_MAIN' })
    expect(report.winner).toBe('ENEMY')

    const guarded = fight(chongYang, { enemyMain: { ...enemy, atk: 800 }, surviveRounds: 2 })
    const guardSave = effectEvents(guarded, 'chong_yang_yi_ze')[0]
    expect(guarded.events[guarded.events.indexOf(guardSave) - 1]).toMatchObject({ type: 'GUARD_BLOCK', round: 2 })
    expect(guarded.winner).toBe('ALLY')
  })

  it('护盾全挡不消耗重阳遗泽，狂暴最后一击也不会触发免死', () => {
    const set = 'quanzhen_beidou'
    const equipped = {
      ...chongYang, weaponId: trialPartId(set, 'WEAPON'), wristId: trialPartId(set, 'WRIST'),
      headId: trialPartId(set, 'HEAD'), accId: trialPartId(set, 'ACC'),
    }
    const shielded = fight(equipped, {
      player: { ...player, stats: { ...player.stats, intStat: 60 } }, surviveRounds: 3,
      enemyMain: { ...enemy, combat: { charge: { round: 2, name: '蓄力一击', damageMultiplier: 65 } } },
    })
    expect(shielded.events.find((event) => event.round === 1 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST'))
      .toMatchObject({ targetSlot: 'ALLY_MAIN', hitResult: 'PARRY', hpDelta: 0, shieldAbsorbed: 93 })
    expect(effectEvents(shielded, 'chong_yang_yi_ze')).toMatchObject([{ round: 3, hpDelta: 1329 }])

    const hardEnrage = fight(chongYang, {
      player: { ...player, stats: { ...player.stats, con: 100 } }, surviveRounds: undefined,
      enemyMain: { ...enemy, atk: 1 },
    })
    expect(hardEnrage.winner).toBe('ENEMY')
    expect(hardEnrage.events.at(-1)).toMatchObject({ round: 20, targetSlot: 'ALLY_MAIN' })
    expect(effectEvents(hardEnrage, 'chong_yang_yi_ze')).toEqual([])
  })

  it('东邪西毒两种状态各叠三层后消耗，以真伤引爆且首领按攻击力封顶', () => {
    const options = { ...enemy, combat: { openingShield: 10000 } }
    const report = fight(dongXi, { enemyMain: options, surviveRounds: 3 })
    const events = effectEvents(report, 'dong_xi')
    expect(events.filter((event) => event.statusApplied).map((event) => [event.statusApplied, event.statusStacks, event.actorSlot])).toEqual([
      ['碧海内伤', 1, 'ALLY_RIGHT'], ['灵蛇奇毒', 1, 'ALLY_LEFT'],
      ['碧海内伤', 2, 'ALLY_RIGHT'], ['灵蛇奇毒', 2, 'ALLY_LEFT'],
      ['碧海内伤', 3, 'ALLY_RIGHT'], ['灵蛇奇毒', 3, 'ALLY_LEFT'],
    ])
    expect(events.filter((event) => event.type === 'DOT_TICK').map((event) => event.hpDelta)).toEqual([-7, -7, -14, -14])
    expect(events.filter((event) => event.statusRemoved)).toMatchObject([
      { round: 3, statusRemoved: '碧海内伤', statusStacks: 0 },
      { round: 3, statusRemoved: '灵蛇奇毒', statusStacks: 0 },
    ])
    expect(trueDamage(report)).toMatchObject([{ round: 3, targetSlot: 'ENEMY_MAIN', hpDelta: -5000 }])
    expect(trueDamage(report)[0].shieldDelta).toBeUndefined()
    const boss = fight(dongXi, { enemyMain: { ...options, isBoss: true }, surviveRounds: 3 })
    expect(trueDamage(boss)).toMatchObject([{ round: 3, hpDelta: -429 }])
  })

  it('东邪西毒换目标后独立计层，停止叠加时两种状态分别到期', () => {
    const guard = { ...enemy, name: '护卫', hp: 20000 }
    const report = fight(dongXi, { enemyGuards: [guard], surviveRounds: 5 })
    expect(trueDamage(report)).toMatchObject([{ round: 5, targetSlot: 'ENEMY_LEFT', hpDelta: -5000 }])
    expect(effectEvents(report, 'dong_xi').filter((event) => event.statusApplied && event.targetSlot === 'ENEMY_MAIN')
      .map((event) => event.statusStacks)).toEqual([1, 1, 2, 2])

    const effect = effectsFrom(TRIO_SYNERGIES.find((synergy) => synergy.id === 'dong_xi')!)
      .find((entry) => entry.kind === 'DUAL_STATUS_BURST')!
    const target = { unit: report.units.find((unit) => unit.slot === 'ENEMY_MAIN')!, shield: 0, atk: enemy.atk }
    const events: BattleReportDTO['events'] = []
    let hp = resolveDualStatusBurst(effect, target, target.unit.hp, {
      attack: 143, bihaiSlot: 'ALLY_RIGHT', lingsheSlot: 'ALLY_LEFT', round: 1, boss: false,
    }, events)
    for (let round = 1; round <= 4; round++) hp = resolveDamageOverTime(target, hp, round, events)
    expect(hp).toBe(target.unit.hp - 42)
    expect(events.filter((event) => event.statusRemoved)).toMatchObject([
      { round: 3, statusRemoved: '碧海内伤', statusRounds: 0 },
      { round: 3, statusRemoved: '灵蛇奇毒', statusRounds: 0 },
    ])
  })

  it('历练正常入口按首领上限结算东邪西毒，跳过回放保留引爆战报和气血', () => {
    const store = newStore('NEW')
    try {
      Object.assign(store.player.stats, player.stats, { con: 95 })
      store.trial.maxStageId = 22
      store.trial.stageHours['22'] = TRIAL_PATROL_HOURS[22]
      for (const id of Object.values(dongXi)) store.companionAffinity[id].recruited = true
      store.updateLoadout({ ...loadout, ...dongXi })
      const damage = store.derivedStats.atk * 3
      store.challengeTrialStage(22)
      const report = store.activeBattle!
      expect(trueDamage(report)[0]).toMatchObject({ round: 3, hpDelta: -damage })
      store.skipBattleToEnd()
      expect(store.liveUnitStates.ENEMY_MAIN.hp).toBe(0)
      expect(store.logs.filter((entry) => entry.channel === 'BATTLE').flatMap((entry) => entry.segments))
        .toContainEqual({ type: 'damage', value: damage, category: 'true' })
    } finally {
      store.closeBattleStage()
    }
  })
})
