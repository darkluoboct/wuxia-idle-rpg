import { describe, expect, it, vi } from 'vitest'
import { ADVENTURES, STORY_CHAPTERS } from '@/config/storyData'
import type { BattleEventDTO, BattleReportDTO, EquipSlotType, LoadoutPresetDTO } from '@/network/protocol'
import { computeCompanionDerivedStats, computeDerivedStats, incomingDamage, innerPressure, simulateCoopRaid, simulatePlayerDuel, simulateServerBattle, simulateShaoshiRaid, strikeDamage } from '../../shared/battle.ts'
import {
  applyBattleStatus, applyBleedOnHit, applyDirectedDamage, applyPeriodicOnHit, battleDefense, battleEffectLoot, effectsFrom, endStatusRound, enemyRageAction, lethalSavesFrom,
  recoverEnemyRoundMp, recoverHitMp, recoverRoundMp, resolveAttackDamage, resolveBattleLoadout, resolveCompanionEquipment, resolveDamageOverTime, resolveDualStatusBurst, resolveIncomingPhysicalDamage, resolvePoisonBurst, restorePartyRound, type EnemyBattleState,
  spendBattleMedicines, useCriticalHitPill, useLowMpPill, useRoundStartPill,
} from '../../shared/battleEffects.ts'
import { battleEnvironmentAt, damageAfterDefense, EQUIP_SLOT_META } from '../../shared/combatMeta.ts'
import { activeSetBonuses, COMPANIONS, companionView, COOP_RAIDS, hiddenWeaponCapacity, isMapUnlocked, ITEMS, MAPS, MEDICINES, meetsItemStatRequirement, ONLINE_STORY_CHAPTERS, SECTS, SHAOSHI_RAID, SKILLS, totalCompanionSetBonuses, trialRewardItems, TRIO_SYNERGIES, VIP_SKILL_REWARDS } from '../../shared/gameData.ts'
import { GAIBANG_DIVISION, JUNSHAN_EXAM } from '../../shared/gaibang.ts'
import { QUANZHEN_GUARD_EXAM } from '../../shared/quanzhen.ts'
import { TAOHUA_RESCUE_EXAM } from '../../shared/taohua.ts'
import { createStarterCharacter, cultivationRate, resolveSeaVoyage } from '../../shared/player.ts'
import { effectiveMartialStats, equippedMartialSkills, hasMartialFreedom, hasWandererMastery, martialEffectiveness, WANDERER_MASTERY } from '../../shared/martialSchools.ts'
import { skillPowerAtMastery } from '../../shared/skillMastery.ts'
import { activeSectEquipmentSets, SECT_EQUIPMENT_SETS, sectEquipmentPartId, sectEquipmentRewardIds, WANDERER_EQUIPMENT, wandererEquipmentBonus } from '../../shared/sectEquipment.ts'
import { storyEncounter } from '../../shared/storySnake.ts'
import { CHAPTER_ONE_TITLE, TRIAL_PATROL_HOURS, TRIAL_REPLAY_HOURS, trialPartId, trialPuzzleOutcome, trialStageOf } from '../../shared/trialStages.ts'
import { newStore } from './helpers'

const starter = createStarterCharacter({ id: 'fighter', nickname: '试招侠客', avatarId: 'hero_sword' }, 0)
const player = {
  ...starter.player,
  level: 1,
  realmTier: 1,
  stats: { str: 10, con: 10, agi: 0, intStat: 10, luck: 10, karma: 0 },
}
const loadout: LoadoutPresetDTO = {
  presetIdx: 1, name: '试招', stance: 'FIERCE',
  innerSkillId: null, outerSkillId: null, lightSkillId: null, ultSkillId: null,
  leftCompanionId: null, rightCompanionId: null,
  weaponId: null, armorId: null, accId: null, relicBookId: null,
}
const pomiaoSet = 'pomiao_caomang'
const pomiaoPieces = { armorId: trialPartId(pomiaoSet, 'ARMOR'), weaponId: trialPartId(pomiaoSet, 'WEAPON') }
const flaskId = trialPartId('zuixian_xingshang', 'ACC')
const nanBei = { leftCompanionId: 'hongqigong', rightCompanionId: 'yideng' }
const enemy = {
  name: '试招木桩', title: '', portrait: 'bandit', hp: 20_000, atk: 250, mp: 500, stance: 'FIERCE',
} as const
const agileEnemy = { ...enemy, stance: 'AGILE' as const }
const baseCompanion = (id: string) => COMPANIONS[id] && companionView(COMPANIONS[id], { form: 'base' })

function fight(patch: Partial<LoadoutPresetDTO> = {}, options: Partial<Parameters<typeof simulateServerBattle>[0]> = {}) {
  return simulateServerBattle({
    sceneTitle: '词条试招', mode: 'SOLO_STORY', player, enemyMain: enemy, surviveRounds: 2,
    ...options,
    loadout: { ...loadout, ...patch },
  })
}

const effectEvents = (report: BattleReportDTO, sourceId: string) => report.events.filter((event) => event.effectSourceId === sourceId)

describe('重阳宫三人副本', () => {
  function fighter(id: string, agi: number, str = 40) {
    return { player: { ...player, id, nickname: id, level: 28, stats: { ...player.stats, agi, str, con: 250 } }, loadout, learnedSkills: {} }
  }

  function run(rightAgi = 43, leftStr = 40) {
    return simulateCoopRaid('chongyang', 'chongyang', [fighter('队长', 10), fighter('左翼', 0, leftStr), fighter('右翼', rightAgi)], () => 0.99, {})
  }

  function allyCasts(report: BattleReportDTO, round: number) {
    return report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot.startsWith('ALLY') && event.round === round)
  }

  it('速度打平时仍换位，三人打实际前排并计入该阵位的招架', () => {
    expect(computeDerivedStats(fighter('右翼', 43).player, loadout, {}).speed).toBe(COOP_RAIDS.chongyang.boss.combat!.speed)
    const report = run()
    expect(report).toMatchObject({ mode: 'COOP_3P', raidId: 'chongyang', sceneTitle: '重阳宫·天罡北斗大阵' })
    expect(effectEvents(report, 'enemy_formation').slice(0, 3)).toMatchObject([
      { round: 1, targetSlot: 'ENEMY_LEFT', segments: [{ text: expect.stringContaining('王处一居前 · 招架 +20 个百分点') }] },
      { round: 2, targetSlot: 'ENEMY_MAIN', segments: [{ text: expect.stringContaining('丘处机换至前排 · 招架 +20 个百分点') }] },
      { round: 3, targetSlot: 'ENEMY_LEFT', segments: [{ text: expect.stringContaining('王处一换至前排 · 招架 +20 个百分点') }] },
    ])
    expect(allyCasts(report, 1).map(({ targetSlot }) => targetSlot)).toEqual(Array(3).fill('ENEMY_LEFT'))
    expect(allyCasts(report, 2).map(({ targetSlot }) => targetSlot)).toEqual(Array(3).fill('ENEMY_MAIN'))
    expect(allyCasts(report, 2).find((event) => event.actorSlot === 'ALLY_MAIN')?.hitResult).toBe('PARRY')
  })

  it('右翼实际速度超过两名守阵者即可抢位，招架加成当场移除', () => {
    const report = run(44)
    expect(effectEvents(report, 'enemy_formation')).toMatchObject([
      { round: 1, actorSlot: 'ALLY_RIGHT', statusRemoved: '天罡北斗阵', segments: [{ text: expect.stringContaining('右翼抢占北极星位') }] },
    ])
    expect(allyCasts(report, 1)[0]).toMatchObject({ actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN' })
    const hit = (battle: BattleReportDTO) => allyCasts(battle, 2).find((event) => event.actorSlot === 'ALLY_MAIN')!
    expect(hit(report).hitResult).toBe('HIT')
    expect(-hit(report).hpDelta!).toBeGreaterThan(-hit(run()).hpDelta!)
  })

  it('默认配装仍会遇到第一轮护阵', () => {
    const party = ([1, 2, 3] as const).map((index) => {
      const member = createStarterCharacter({ id: `starter_${index}`, nickname: `新侠客${index}`, avatarId: 'hero_sword' }, 0)
      return { player: member.player, loadout: member.presets[index], learnedSkills: member.learnedSkills }
    })
    const report = simulateCoopRaid('chongyang', 'starter_raid', [party[0], party[1], party[2]], () => 0.99, {})
    expect(effectEvents(report, 'enemy_formation')[0]).toMatchObject({ round: 1, actorSlot: 'ENEMY_LEFT', targetSlot: 'ENEMY_LEFT' })
  })

  it('一名守阵者退场时立即破阵，剩余队友改打存活的守阵者', () => {
    const report = run(0, 8_000)
    expect(effectEvents(report, 'enemy_formation')).toMatchObject([
      { round: 1, targetSlot: 'ENEMY_LEFT' },
      { round: 1, actorSlot: 'ALLY_LEFT', statusRemoved: '天罡北斗阵', segments: [{ text: expect.stringContaining('王处一退场') }] },
    ])
    expect(allyCasts(report, 1).map(({ actorSlot, targetSlot }) => [actorSlot, targetSlot])).toEqual([
      ['ALLY_MAIN', 'ENEMY_LEFT'], ['ALLY_LEFT', 'ENEMY_LEFT'], ['ALLY_RIGHT', 'ENEMY_MAIN'],
    ])
  })
})
const mainUnit = (report: BattleReportDTO) => report.units.find((unit) => unit.slot === 'ALLY_MAIN')!
const mainCast = (report: BattleReportDTO) => report.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!
const equipped = (set: string, slots: readonly EquipSlotType[]) =>
  Object.fromEntries(slots.map((slot) => [EQUIP_SLOT_META[slot].field, trialPartId(set, slot)])) as Partial<LoadoutPresetDTO>
const flatTag = (name: string, points: number, extra: number) => ({
  type: 'tag', text: `${name} · 固定破甲 ${points.toLocaleString()} 点防御 · 增伤 +${extra.toLocaleString()}`, tone: 'gold',
})
const fierceTag = (name: string, extra: number) => ({
  type: 'tag', text: `${name} · 刚猛外功增伤 +${extra.toLocaleString()}`, tone: 'purple',
})
const fierceTags = (event: BattleEventDTO) =>
  event.segments.filter((segment) => segment.type === 'tag' && segment.text.includes(' · 刚猛外功增伤 +'))

describe('聚贤庄三人副本', () => {
  const config = COOP_RAIDS.juxian
  const hufa = 'sect_quanzhen_hufa'
  const copper = 'henglian_tongjia'
  const lockGear = equipped(copper, ['WEAPON', 'HEAD', 'ARMOR', 'WRIST'])

  function fighter(id: string, patch: Partial<LoadoutPresetDTO> = {}, stats: Partial<typeof player.stats> = {}) {
    return {
      player: { ...player, id, nickname: id, level: 28, stats: { ...player.stats, str: 40, con: 250, ...stats } },
      loadout: { ...loadout, ...patch }, learnedSkills: {},
    }
  }

  function run(...party: Parameters<typeof simulateCoopRaid>[2]) {
    return simulateCoopRaid('juxian', 'juxian', party, () => 0.99, { at: 0 })
  }

  it('五波按回合换敌，战报逐人列出实际气血、内力、怒气、护盾、异常和保命', () => {
    const leader = fighter('队长', { ultSkillId: 'yiyang_zhi' })
    const left = fighter('左翼', {
      ultSkillId: 'yiyang_zhi', weaponId: sectEquipmentPartId(hufa, 'WEAPON'), headId: sectEquipmentPartId(hufa, 'HEAD'),
      armorId: sectEquipmentPartId(hufa, 'ARMOR'), accId: sectEquipmentPartId(hufa, 'ACC'),
    })
    left.player = { ...left.player, currentSectId: 'quanzhen', sectRank: 4 }
    const report = run(leader, left, fighter('右翼', lockGear))
    const waves = effectEvents(report, 'raid_wave')
    expect(report).toMatchObject({ raidId: 'juxian', winner: 'ALLY', survivedRounds: 15 })
    expect(report.units.find(({ slot }) => slot === 'ENEMY_MAIN')?.name).toBe('游骥')
    expect(waves.map(({ round, opponentEntry }) => [round, opponentEntry?.unit.name])).toEqual([
      [1, undefined], [4, '玄难'], [7, '奚长老'], [10, '白世镜'], [13, '玄难'],
    ])
    expect(waves[1].opponentEntry).toMatchObject({ unit: { id: 'ENEMY_MAIN_2' }, guards: [{ name: '玄寂' }] })
    expect(waves[4].opponentEntry?.unit.id).toBe('ENEMY_MAIN_5')
    const beforeWave = report.events.filter(({ round }) => round < 4)
    const participants = report.units.filter(({ isPlayer }) => isPlayer)
    for (const [index, unit] of participants.entries()) {
      const state = { hp: unit.hp, mp: unit.maxMp, rage: unit.rage, shield: 0 }
      for (const event of beforeWave) {
        if (event.targetSlot === unit.slot) {
          state.hp = Math.max(0, Math.min(unit.maxHp, state.hp + (event.hpDelta ?? 0)))
          state.shield += event.shieldDelta ?? 0
        }
        if (event.actorSlot === unit.slot) {
          state.hp += event.reflectDelta ?? 0
          state.mp = Math.max(0, Math.min(unit.maxMp, state.mp + (event.mpDelta ?? 0)))
        }
        if ((event.rageTargetSlot ?? event.actorSlot) === unit.slot) state.rage = Math.max(0, Math.min(100, state.rage + (event.rageDelta ?? 0)))
      }
      expect(waves[1].segments[index + 1]).toMatchObject({
        text: expect.stringContaining(`${unit.name} · 气血 ${state.hp.toLocaleString()} · 内力 ${state.mp.toLocaleString()} · 怒气 ${state.rage} · 护盾 ${state.shield.toLocaleString()} · 剩余保命 ${unit.slot === 'ALLY_RIGHT' ? 1 : 0} 次`),
      })
      if (unit.slot === 'ALLY_LEFT') expect(state.shield).toBeGreaterThan(0)
      if (unit.slot === 'ALLY_MAIN') expect(state.mp).toBeLessThan(unit.maxMp)
    }
    expect(waves[1].segments[1]).toMatchObject({ text: expect.stringContaining('阴寒迟缓 2 回合') })
    expect(waves[1].segments[2]).toMatchObject({ text: expect.stringContaining('流血 1 回合') })
    const bleed = (round: number) => report.events.find((event) => event.round === round && event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_LEFT')
    expect(bleed(4)).toMatchObject({ effectSourceId: bleed(3)!.effectSourceId, hpDelta: bleed(3)!.hpDelta, statusRemoved: '流血' })
    expect(report.events.find((event) => event.round === 4 && event.actorSlot.startsWith('ENEMY') && event.targetSlot === 'ALLY_LEFT' && event.type === 'SKILL_CAST'))
      .toMatchObject({ shieldAbsorbed: expect.any(Number), hpDelta: 0 })
  })

  it('跨波流血继续跳伤，保命各消耗一次，旧敌造成的流血不会反震新敌', () => {
    const { boss, guards } = config
    config.boss = { ...boss, hp: 10_000_000, atk: 0,
      combat: { periodicOnHit: { status: 'bleed', rounds: 2, maxHpPercent: 120, firstRound: 3 } } }
    config.guards = []
    try {
      const report = run(fighter('队长'), fighter('左翼'), fighter('右翼', { ...lockGear, accId: 'jiuwei_fox' }))
      const saves = report.events.filter((event) => event.actorSlot === 'ALLY_RIGHT' &&
        event.segments.some((segment) => segment.type === 'tag' && segment.text.endsWith(' · 免死')))
      expect(saves.map(({ round, effectSourceId }) => [round, effectSourceId])).toEqual([[3, 'jiuwei_fox'], [4, copper]])
      expect(effectEvents(report, 'raid_wave')[1].segments[3]).toMatchObject({ text: expect.stringContaining('剩余保命 1 次 · 异常与增益 流血 1 回合、灵狐遁逃 1 回合') })
      expect(effectEvents(report, 'raid_wave')[2].segments[3]).toMatchObject({ text: expect.stringContaining('剩余保命 0 次') })
      expect(effectEvents(report, copper).some((event) => event.round === 4 && event.targetSlot?.startsWith('ENEMY'))).toBe(false)
    } finally {
      config.boss = boss
      config.guards = guards
    }
  })

  it('每波提前清场后仍等到第 15 回合结算', () => {
    const strong = (id: string) => fighter(id, {}, { str: 4_000, con: 900 })
    const report = run(strong('队长'), strong('左翼'), strong('右翼'))
    expect(effectEvents(report, 'raid_wave').map(({ round }) => round)).toEqual([1, 4, 7, 10, 13])
    expect(report.events.filter(({ type }) => type === 'SKILL_CAST').map(({ round }) => round)).toEqual([1, 1, 4, 4, 7, 7, 10, 10, 13, 13])
    expect(report.events.at(-1)).toMatchObject({ round: 15, effectSourceId: 'raid_survival', segments: [{ text: expect.stringContaining('撑满 15 回合') }] })
    expect(report).toMatchObject({ winner: 'ALLY', survivedRounds: 15 })
  })

  it('只剩右翼时仍可通关，全灭时停止换波', () => {
    const weak = (id: string) => {
      const member = fighter(id, {}, { str: 1, con: 0 })
      member.player.level = 1
      return member
    }
    const won = run(weak('队长'), weak('左翼'), fighter('右翼', {}, { con: 900 }))
    expect(won).toMatchObject({ winner: 'ALLY', survivedRounds: 15 })
    expect(won.events.at(-1)?.segments).toMatchObject([{ text: expect.stringContaining('1 人存活') }])
    const lost = run(weak('队长'), weak('左翼'), weak('右翼'))
    expect(lost).toMatchObject({ winner: 'ENEMY', survivedRounds: expect.any(Number) })
    expect(lost.survivedRounds).toBeLessThan(15)
    expect(effectEvents(lost, 'raid_wave')).toHaveLength(1)
    expect(lost.events.at(-1)?.segments).toMatchObject([{ text: expect.stringContaining('全队倒下') }])
  })

  it('第 15 回合的合围打完才判胜，全队倒下仍判负', () => {
    const survival = config.survival!
    const last = survival.nextWaves.at(-1)!
    config.survival = {
      ...survival,
      nextWaves: [...survival.nextWaves.slice(0, -1), {
        ...last, boss: { ...last.boss, hp: 10_000_000, atk: 1_000_000, stance: 'FIERCE' }, guards: [],
      }],
    }
    try {
      const sturdy = (id: string) => fighter(id, {}, { con: 900 })
      const report = run(sturdy('队长'), sturdy('左翼'), sturdy('右翼'))
      const finalHits = report.events.filter((event) => event.round === 15 && event.type === 'SKILL_CAST' && event.skillName === '群豪合围')
      expect(finalHits.length).toBeGreaterThan(0)
      expect(finalHits.every((event) => (event.hpDelta ?? 0) < 0)).toBe(true)
      expect(report).toMatchObject({ winner: 'ENEMY', survivedRounds: 14 })
      expect(report.events.at(-1)).toMatchObject({ round: 15, segments: [{ text: '全队倒下 · 撑过 14 / 15 回合' }] })
    } finally {
      config.survival = survival
    }
  })
})

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

describe('武学出处与门派效力', () => {
  const calm = { rain: false, night: false, swamp: false }
  const fourSchools = {
    ...loadout, innerSkillId: 'quanzhen_tuna', outerSkillId: 'jiuyin_baiguzhua', lightSkillId: 'shunxi_qianli', ultSkillId: 'yiyang_zhi',
  }
  const quanzhen = { ...player, currentSectId: 'quanzhen' }
  const claw = SKILLS.jiuyin_baiguzhua
  const conflict = { type: 'tag', text: '真气冲突 · 本招威力 70%', tone: 'red' }

  it('敌派白骨爪按重数折算本招威力，护盾倍率和流血独立结算', () => {
    const options = {
      player: quanzhen, enemyMain: { ...enemy, combat: { openingShield: 20 }, atk: 1 },
      surviveRounds: 1, environment: calm, learnedSkills: { [claw.id]: 3 }, rng: () => 0.99,
    }
    const report = fight({ outerSkillId: claw.id }, options)
    const power = claw.powerRatio * 1.1 * 0.7
    expect(skillPowerAtMastery(claw, 3, quanzhen)).toBeCloseTo(power)
    const { atk, maxMp } = computeDerivedStats(quanzhen, loadout)
    const ordinary = strikeDamage(atk, power, 1, innerPressure(maxMp, enemy.mp), false, 1)
    expect(mainCast(report)).toMatchObject({ hpDelta: -(ordinary - 10), shieldAbsorbed: 10, shieldDelta: -20 })
    expect(mainCast(report).segments).toContainEqual(conflict)
    const natural = fight({ outerSkillId: claw.id }, { ...options, player })
    const bleed = (battle: BattleReportDTO) => battle.events.find((event) => event.type === 'DOT_TICK' && event.effectSourceId === claw.id)?.hpDelta
    expect(bleed(report)).toBeLessThan(0)
    expect(bleed(report)).toBe(bleed(natural))
    expect(martialEffectiveness(SKILLS.quanzhen_jianfa, quanzhen)).toBe(100)
    expect(martialEffectiveness(SKILLS.luoying_zhang, quanzhen)).toBe(100)
  })

  it('出师后的镇派心法在另一派按八成提供属性、控制抵抗、吸血和打坐', () => {
    const disciple = { ...player, currentSectId: 'baituo' }
    const graduate = { ...disciple, graduatedSectIds: ['quanzhen', 'taohua'] }
    const build = { ...loadout, innerSkillId: 'xiantian_gong' }
    const defense = computeDerivedStats(disciple, loadout).def
    expect(computeDerivedStats(disciple, build).def).toBe(Math.round(defense * 1.14))
    expect(computeDerivedStats(graduate, build).def).toBe(Math.round(defense * 1.16))
    const base = cultivationRate(disciple, loadout)
    expect(cultivationRate(graduate, build)).toBe(Math.round(base * 1.28))
    expect(resolveBattleLoadout({ ...loadout, innerSkillId: 'jiuyin_taohua' }, graduate).effects).toContainEqual(expect.objectContaining({
      kind: 'CONTROL_RESIST', chancePercent: 28, sourceId: 'jiuyin_taohua',
    }))
    expect(resolveBattleLoadout({ ...loadout, innerSkillId: 'nijiuyin_hama_gong' }, { ...quanzhen, graduatedSectIds: ['baituo'] }).effects)
      .toContainEqual(expect.objectContaining({ kind: 'ATTACK_LIFESTEAL', percent: 24, sourceId: 'nijiuyin_hama_gong' }))
    expect(martialEffectiveness(SKILLS.xiantian_gong, { ...graduate, currentSectId: null })).toBe(100)
    expect(resolveBattleLoadout({ ...loadout, innerSkillId: 'jiuyin_cuixin_jue' }, quanzhen).effects)
      .toContainEqual(expect.objectContaining({ kind: 'PERIODIC_ON_HIT', rule: { status: 'heartPoison', attackPercent: 8.4, rounds: 2 } }))
  })

  it('散人四槽异源才提高六维和连击概率，换同源或拜师立即失效', () => {
    const wanderer = { ...player, stats: { str: 25, con: 25, agi: 25, intStat: 25, luck: 25, karma: 45 } }
    const bonuses = { str: 5, con: 5, agi: 5, intStat: 5, luck: 5, karma: 9 }
    const sameOrigin = { ...fourSchools, lightSkillId: 'jinyan_gong' }
    expect(hasWandererMastery(wanderer, equippedMartialSkills({ ...fourSchools, lightSkillId: claw.id }))).toBe(false)
    expect(effectiveMartialStats(wanderer, fourSchools)).toEqual({ str: 30, con: 30, agi: 30, intStat: 30, luck: 30, karma: 54 })
    expect(effectiveMartialStats(wanderer, sameOrigin)).toEqual(wanderer.stats)
    expect(effectiveMartialStats({ ...wanderer, currentSectId: 'quanzhen' }, fourSchools)).toEqual(wanderer.stats)
    expect(resolveBattleLoadout(fourSchools, wanderer).effects.filter((effect) => effect.sourceId === WANDERER_MASTERY.id)).toEqual([
      expect.objectContaining({ kind: 'STAT_BONUS', stats: bonuses }), expect.objectContaining({ kind: 'OUTER_COMBO_CHANCE', points: 15 }),
    ])
    const rollAt = (roll: number) => fight(fourSchools, {
      player: wanderer, enemyMain: { ...enemy, atk: 1 }, surviveRounds: 1, environment: calm, rng: () => roll,
    })
    const low = effectEvents(rollAt(0.149), WANDERER_MASTERY.id)
    expect(low.find((event) => event.type === 'SKILL_CAST')?.hpDelta).toBeLessThan(0)
    expect(low[0].segments).toContainEqual({ type: 'text', text: ' 试招侠客臂力 +5，根骨 +5，身法 +5，悟性 +5，福缘 +5，侠义 +9' })
    expect(effectEvents(rollAt(0.15), WANDERER_MASTERY.id).every((event) => event.type !== 'SKILL_CAST')).toBe(true)
    expect(wanderer.stats.con).toBe(25)
  })

  it('试玩换武学和拜师时分别按此前的打坐速度结清，出师恢复混搭', () => {
    const store = newStore('NEW')
    store.player.stats = { str: 25, con: 30, agi: 25, intStat: 25, luck: 25, karma: 40 }
    for (const skill of equippedMartialSkills({ ...fourSchools, lightSkillId: 'jinyan_gong' })) store.learnedSkills[skill.id] = 1
    store.learnedSkills.shunxi_qianli = 1
    store.updateLoadout({ innerSkillId: 'quanzhen_tuna', outerSkillId: claw.id, lightSkillId: 'jinyan_gong', ultSkillId: 'yiyang_zhi' })
    expect(store.isWandererMasteryActive).toBe(false)
    const hour = 3_600_000
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      store.player.lastSettleAt = now - hour
      const originalRate = store.effectiveQiPerHour
      const originalQi = store.player.qiExp
      store.updateLoadout({ lightSkillId: 'shunxi_qianli' })
      expect(store.player.qiExp - originalQi).toBe(originalRate)
      expect(store.player.lastSettleAt).toBe(now)
      expect(store.isWandererMasteryActive).toBe(true)
      const boostedRate = store.effectiveQiPerHour
      expect(boostedRate).toBeGreaterThan(originalRate)
      clock.mockReturnValue(now + hour)
      const boostedQi = store.player.qiExp
      store.joinSect('quanzhen')
      expect(store.player.qiExp - boostedQi).toBe(boostedRate)
      expect(store.isWandererMasteryActive).toBe(false)
      store.player.sectRank = 4
      store.leaveSect('GRADUATE')
      expect(store.player.graduatedSectIds).toEqual(['quanzhen'])
      expect(store.isWandererMasteryActive).toBe(true)
    } finally {
      clock.mockRestore()
    }
  })

  it('切磋和少室山按实际玩家判定，队友共享阵容时仍独立', () => {
    const build = { ...loadout, outerSkillId: claw.id }
    const fighter = (id: string, currentSectId: string | null) => ({
      player: { ...player, id, level: 32, realmTier: 3, currentSectId, stats: { ...player.stats, str: 45, con: 100 } },
      loadout: build, learnedSkills: {},
    })
    const rival = simulatePlayerDuel({
      battleId: 'martial-school-duel', sceneTitle: '真气冲突', mode: 'PVP_HUASHAN', environment: calm,
      lineup: [fighter('ally', 'quanzhen'), fighter('enemy', 'baituo')], rng: () => 0.99,
    })
    const isClaw = (event: BattleEventDTO) => event.skillId === claw.id && event.round === 1
    expect(rival.events.find((event) => isClaw(event) && event.actorSlot === 'ALLY_MAIN')?.segments).toContainEqual(conflict)
    expect(rival.events.find((event) => isClaw(event) && event.actorSlot === 'ENEMY_MAIN')?.segments).not.toContainEqual(conflict)
    const raid = simulateShaoshiRaid('martial-school-raid', [fighter('a', 'quanzhen'), fighter('b', 'baituo'), fighter('c', null)], () => 0.99, calm)
    const casts = raid.events.filter(isClaw)
    expect(new Set(casts.map((event) => event.actorSlot))).toEqual(new Set(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT']))
    expect(casts.filter((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text === conflict.text))
      .map((event) => event.actorSlot)).toEqual(['ALLY_MAIN'])
  })
})

describe('华山玉佩、武道极境和白骨九节鞭', () => {
  const red = 'niluan_jiuyin'
  const jade = trialPartId(red, 'ACC')
  const whip = 'xuantie_feizhua'
  const calm = { rain: false, night: false, swamp: false }
  const six = equipped(red, ['HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC'])
  const five = { ...six, headId: null }
  const sect = { ...player, currentSectId: 'quanzhen', level: 32, realmTier: 3, stats: { str: 65, con: 85, agi: 30, intStat: 35, luck: 30, karma: 90 } }
  const casts = (report: BattleReportDTO, actorSlot = 'ALLY_MAIN') => report.events.filter((event) =>
    event.actorSlot === actorSlot && (event.type === 'SKILL_CAST' || event.type === 'ASSIST_ATTACK'))
  const tags = (event: BattleEventDTO) => event.segments.flatMap((segment) => segment.type === 'tag' ? [segment.text] : [])

  it('玉佩只加实际穿戴者的六维，修行、侠义增伤与面板使用对应数值', () => {
    const stats = { str: 85, con: 105, agi: 50, intStat: 55, luck: 50, karma: 110 }
    const build = { ...loadout, accId: jade }
    expect(effectiveMartialStats(sect, build)).toEqual(stats)
    expect(computeDerivedStats(sect, build)).toEqual(computeDerivedStats({ ...sect, stats }, loadout))
    expect(cultivationRate(sect, build)).toBe(cultivationRate({ ...sect, stats }, loadout))
    const report = fight({ accId: jade }, { player: sect, enemyMain: { ...enemy, combat: { alignment: 'HERETIC' } }, surviveRounds: 1, environment: calm })
    expect(effectEvents(report, jade)[0]).toMatchObject({ actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', segments: [
      { type: 'tag', text: ITEMS[jade].name }, { type: 'text', text: ' 试招侠客臂力 +20，根骨 +20，身法 +20，悟性 +20，福缘 +20，侠义 +20' },
    ] })
    expect(tags(mainCast(report)).some((text) => text.startsWith('侠义 · 克敌增伤'))).toBe(true)
    expect(sect.stats).toMatchObject({ con: 85, karma: 90 })
    const capped = fight({ accId: jade }, { player: { ...sect, stats: { ...sect.stats, karma: 995 } }, environment: calm })
    expect(effectEvents(capped, jade)[0].segments[1]).toMatchObject({ text: expect.stringContaining('侠义 +5') })
    const companionBuild = { ...loadout, leftCompanionId: 'meichaofeng', companionEquipment: { meichaofeng: { ACC: jade } } }
    const partner = computeCompanionDerivedStats(sect, companionBuild, 'meichaofeng', baseCompanion)!
    const original = baseCompanion('meichaofeng').stats
    for (const key of Object.keys(original) as (keyof typeof original)[]) expect(partner.attributes[key]).toBe(original[key] + 20)
    expect(effectiveMartialStats(sect, companionBuild)).toEqual(sect.stats)
  })

  it('玉佩和六件档在少室山按实际配装生效，队友和五件档仍按各自门派结算', () => {
    const build = { ...loadout, outerSkillId: 'jiuyin_baiguzhua', innerSkillId: 'hama_gong', lightSkillId: 'shunxi_qianli' }
    const fighter = (id: string, gear: Partial<LoadoutPresetDTO>) => ({ player: { ...sect, id }, loadout: { ...build, ...gear }, learnedSkills: {} })
    expect(hasMartialFreedom({ ...build, ...six })).toBe(true)
    expect(hasMartialFreedom({ ...build, ...five })).toBe(false)
    expect(cultivationRate(sect, { ...build, ...six })).toBeGreaterThan(cultivationRate(sect, { ...build, ...five }))
    const storage = (gear: Partial<LoadoutPresetDTO>) => resolveBattleLoadout({ ...build, ...gear }, sect).effects.find((effect) => effect.kind === 'STORE_INCOMING_DAMAGE')
    expect(storage(five)).toMatchObject({ percent: 14 })
    expect(storage(six)).toMatchObject({ percent: 20 })
    const report = simulateShaoshiRaid('86-freedom', [fighter('a', six), fighter('b', five), fighter('c', { accId: null })], () => 0.99, calm)
    const first = report.events.filter((event) => event.skillId === build.outerSkillId && event.round === 1 && event.type === 'SKILL_CAST')
    expect(first).toHaveLength(3)
    expect(first.filter((event) => tags(event).includes('真气冲突 · 本招威力 70%')).map((event) => event.actorSlot)).toEqual(['ALLY_LEFT', 'ALLY_RIGHT'])
    expect(effectEvents(report, jade).map(({ actorSlot }) => actorSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT'])
    const freedom = effectEvents(report, red).find((event) => event.segments.some((part) => part.type === 'text' && part.text.includes('解除自身招式')))
    expect(freedom?.actorSlot).toBe('ALLY_MAIN')
    expect(mainUnit(report).maxHp).toBe(computeDerivedStats(sect, { ...build, ...six }).maxHp)
  })

  it('武道极境在缴械时保留兵刃招式，实际兵刃特效随缴械停用', () => {
    const build = { weaponId: whip, outerSkillId: 'quanzhen_jianfa', ultSkillId: 'tonggui_jianfa' }
    const opponent = { ...enemy, hp: 400_000, atk: 250, combat: {
      speed: 3000, statusOnHit: { status: 'DISARM' as const, rounds: 1 },
    } }
    const options = { player: sect, enemyMain: opponent, surviveRounds: 4, environment: calm, rng: () => 0.99 }
    const limited = fight({ ...five, ...build }, options)
    const free = fight({ ...six, ...build }, options)
    expect(limited.events.some((event) => event.statusApplied === '缴械')).toBe(true)
    expect(free.events.some((event) => event.statusApplied === '缴械')).toBe(true)
    expect(casts(limited)[0].skillId).toBe('bare_hands')
    expect(casts(free)[0].skillId).toBe(build.outerSkillId)
    const afterDisarm = (report: BattleReportDTO, round: number) => {
      const start = report.events.findIndex((event) => event.round === round && event.statusApplied === '缴械')
      return start >= 0 ? report.events.slice(start + 1).find((event) => event.round === round && event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST') : undefined
    }
    expect(afterDisarm(free, 2)).toMatchObject({ skillId: build.ultSkillId, isUlt: true })
    expect(afterDisarm(limited, 2)).toMatchObject({ skillId: 'bare_hands' })
    expect(casts(free).filter((event) => event.round === 1).every((event) => !tags(event).some((tag) => tag.includes('索命盘绕')))).toBe(true)
  })

  it('九节鞭先选真实后排，命中一次判定缠身，后排倒下后换回正常目标', () => {
    const { mp: _, ...guard } = enemy
    const front = { ...guard, name: '前排', atk: 1, combat: { speed: 130 } }
    const rear = { ...guard, name: '后排', atk: 1, combat: { speed: 450, openingShield: 50_000 } }
    const build = { weaponId: whip, outerSkillId: 'quanzhen_jianfa' }
    const options = { player: sect, enemyMain: { ...enemy, atk: 1 }, enemyGuards: [front, rear], surviveRounds: 2, environment: calm }
    const success = fight(build, { ...options, rng: () => 0.299 })
    expect(mainCast(success)).toMatchObject({ targetSlot: 'ENEMY_RIGHT', hpDelta: 0 })
    expect(tags(mainCast(success))).toContain(`${ITEMS[whip].name} · 索命盘绕 · 后排`)
    const landed = effectEvents(success, whip).filter((event) => event.round === 1)
    expect(landed).toMatchObject([
      { targetSlot: 'ENEMY_RIGHT', statusApplied: '闪避降低', statusRounds: 1 },
      { targetSlot: 'ENEMY_RIGHT', statusApplied: '阴寒迟缓', statusRounds: 1 },
    ])
    const misses = fight(build, { ...options, rng: () => 0.30 })
    expect(effectEvents(misses, whip)).toHaveLength(0)
    const defeated = fight(build, { ...options, enemyGuards: [front, { ...rear, hp: 1, combat: { speed: 450 } }], rng: () => 0.99 })
    expect(casts(defeated).slice(0, 2).map((event) => event.targetSlot)).toEqual(['ENEMY_RIGHT', 'ENEMY_MAIN'])
    expect(mainCast(fight(build, { ...options, enemyGuards: [front, rear, { ...rear, name: '更后方' }] })).targetSlot).toBe('ENEMY_REAR')
  })

  it('九节鞭跟随穿戴者，在切磋后排和少室山右阵生效', () => {
    const fighter = (id: string, gear: Partial<LoadoutPresetDTO>) => ({ player: { ...sect, id }, loadout: { ...loadout, ...gear }, learnedSkills: {} })
    const duel = simulatePlayerDuel({ battleId: '86-whip', sceneTitle: '试鞭', mode: 'PVP_HUASHAN', environment: calm, rng: () => 0.99,
      lineup: [fighter('a', { leftCompanionId: 'meichaofeng', companionWeapons: { meichaofeng: whip } }), fighter('b', { leftCompanionId: 'kezhene', rightCompanionId: 'huangrong' })],
    })
    expect(mainCast(duel).targetSlot).toBe('ENEMY_LEFT')
    expect(casts(duel, 'ALLY_LEFT')[0]).toMatchObject({ targetSlot: 'ENEMY_RIGHT', skillId: 'jiuyin_baiguzhua' })
    const raid = simulateShaoshiRaid('86-whip-raid', [fighter('a', {}), fighter('b', { weaponId: whip }), fighter('c', {})], () => 0.99, calm)
    expect(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'].map((slot) => casts(raid, slot)[0].targetSlot)).toEqual(['ENEMY_LEFT', 'ENEMY_RIGHT', 'ENEMY_LEFT'])
  })

  it('旧试玩存档可在第 17 关补领九节鞭，已有同 ID 只保留一件', () => {
    const store = newStore('DEMO')
    store.player.stats.str = 900
    store.player.stats.agi = 42
    store.player.trial.maxStageId = 18
    store.player.trial.selectedStageId = 17
    store.player.trial.rewardedStageIds.push(17)
    store.player.trial.stageHours['17'] = TRIAL_PATROL_HOURS[17]
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      store.challengeTrialStage(17)
      expect(store.activeBattle?.winner).toBe('ALLY')
      expect(store.activeBattle?.rewards?.items?.map(({ id }) => id)).toEqual([whip])
      store.skipBattleToEnd()
      store.equipItem(whip)
      expect(store.currentLoadout.weaponId).toBe(whip)
      store.closeBattleStage()
      store.challengeTrialStage(17)
      expect(store.activeBattle?.rewards?.items).toBeUndefined()
      expect(store.ownedItemIds.filter((id) => id === whip)).toHaveLength(1)
    } finally {
      store.closeBattleStage()
      rng.mockRestore()
    }
  })
})

describe('宗门装备', () => {
  const gear = (id: string): LoadoutPresetDTO => {
    const set = SECT_EQUIPMENT_SETS.find((entry) => entry.id === id)!
    return { ...loadout, ...Object.fromEntries(set.parts.map(({ slot }) => [EQUIP_SLOT_META[slot].field, sectEquipmentPartId(id, slot)])) }
  }
  const calm = { rain: false, night: false, swamp: false }

  it('修行与参悟只读取本预设齐套，拆套立即恢复原值', () => {
    const green = gear('sect_quanzhen_zhike')
    expect(cultivationRate(player, green) - cultivationRate(player, { ...green, bootsId: null })).toBe(297)
    const purple = gear('sect_taohua_rushi')
    expect(activeSectEquipmentSets(purple).map(({ id }) => id)).toEqual(['sect_taohua_rushi'])
    expect(effectiveMartialStats(player, purple).intStat).toBe(player.stats.intStat + 20)
    expect(effectiveMartialStats(player, { ...purple, accId: null }).intStat).toBe(player.stats.intStat)
    expect(mainUnit(fight(purple, { environment: calm })).maxMp - mainUnit(fight({ ...purple, accId: null }, { environment: calm })).maxMp).toBe(240)
  })

  it('刚猛暴击和奇门闪避随实际架势与穿戴者生效，少室山逐人结算', () => {
    const fierce = gear('sect_gaibang_pozhen')
    const agile = { ...gear('sect_taohua_saohua'), stance: 'AGILE' as const }
    expect(computeDerivedStats(player, fierce).crit - computeDerivedStats(player, { ...fierce, stance: 'TAICHI' }).crit).toBe(12)
    expect(computeDerivedStats(player, agile).dodge - computeDerivedStats(player, { ...agile, stance: 'FIERCE' }).dodge).toBe(8)
    const teammate = (id: string, loadout: LoadoutPresetDTO) => ({ player: { ...player, id, nickname: id }, loadout, learnedSkills: {} })
    const raid = simulateShaoshiRaid('sect-gear-raid', [teammate('刚猛', fierce), teammate('奇门', agile), teammate('太极', { ...fierce, stance: 'TAICHI' })], () => 0.99, calm)
    expect(effectEvents(raid, 'sect_gaibang_pozhen').map(({ actorSlot }) => actorSlot)).toEqual(['ALLY_MAIN'])
    expect(effectEvents(raid, 'sect_taohua_saohua').map(({ actorSlot }) => actorSlot)).toEqual(['ALLY_LEFT'])
    const wearer = 'huangyaoshi'
    const companion = computeCompanionDerivedStats(player, { ...loadout, leftCompanionId: wearer, companionEquipment: {
      [wearer]: { ARMOR: agile.armorId ?? undefined, HEAD: agile.headId ?? undefined },
    } }, wearer, baseCompanion)!
    const base = computeCompanionDerivedStats(player, { ...loadout, leftCompanionId: wearer }, wearer, baseCompanion)!
    expect(companion.dodge - base.dodge).toBe(8)
  })

  it('毒抗只减毒伤，白驼三件外功命中同时施加两种跳伤', () => {
    const novice = gear('sect_baituo_bushe')
    const foe = { ...enemy, atk: 150, combat: { periodicOnHit: { status: 'staffVenom', attackPercent: 40, rounds: 1 } } } as const
    const run = (gear: LoadoutPresetDTO) => fight(gear, { enemyMain: foe, environment: calm, rng: () => 0.99 })
    const tick = (report: BattleReportDTO) => report.events.find((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')!
    expect(tick(run(novice)).hpDelta).toBe(Math.round(tick(run({ ...novice, wristId: null })).hpDelta! * 0.8))
    const full = run(gear('sect_baituo_sidu'))
    const applied = effectEvents(full, 'sect_baituo_sidu').filter((event) => event.round === 1 && event.statusApplied)
    expect(applied).toMatchObject([{ statusApplied: '流血', statusRounds: 2 }, { statusApplied: '朱砂血毒', statusRounds: 2 }])
    expect(effectEvents(run({ ...gear('sect_baituo_sidu'), accId: null }), 'sect_baituo_sidu')).toEqual([])
  })

  it('重阳剑修齐套只减内力压制的额外伤害，并显示实际减伤', () => {
    const armor = { ...gear('sect_quanzhen_chongyang'), stance: 'TAICHI' as const }
    const exam = STORY_CHAPTERS.find((node) => node.code === '2-3')!
    const foe = { ...enemy, atk: 300, mp: 2500, stance: 'TAICHI' as const, combat: { ...exam.bossCombat, openingRage: 100 } }
    const hit = (build: LoadoutPresetDTO) => fight(build, { enemyMain: foe, environment: calm, rng: () => 0.99, surviveRounds: 1 })
      .events.find(({ actorSlot, skillId }) => actorSlot === 'ENEMY_MAIN' && skillId === 'tonggui_jianfa')!
    const guarded = hit(armor)
    const partial = hit({ ...armor, beltId: null })
    expect(guarded.hpDelta!).toBeGreaterThan(partial.hpDelta!)
    expect(guarded.segments).toContainEqual({ type: 'tag', text: `三代重阳剑修套（3件） · 内力压制 · 盾前减伤 ${guarded.hpDelta! - partial.hpDelta!}`, tone: 'jade' })
  })

  it('旧档补领与新拜师发放同套部件，嘉兴化缘按当日实际配装结算一次', () => {
    const store = newStore('DEMO')
    store.joinSect('gaibang')
    const ids = sectEquipmentRewardIds('gaibang', 1)
    expect(ids.every((id) => store.ownedItemIds.includes(id))).toBe(true)
    const missing = ids[0]
    store.ownedItemIds.splice(store.ownedItemIds.indexOf(missing), 1)
    expect(store.unclaimedSectEquipment).toEqual([missing])
    store.claimSectEquipment()
    store.claimSectEquipment()
    expect(store.ownedItemIds.filter((id) => id === missing)).toHaveLength(1)
    const worn = gear('sect_gaibang_xingqi')
    store.updateLoadout({ armorId: worn.armorId, weaponId: worn.weaponId })
    const before = store.player.silver
    store.begForAlms()
    store.begForAlms()
    expect(store.player.silver - before).toBe(120)
    expect(store.canBegToday).toBe(false)
  })

  it('北斗护法四件按穿戴者实际内力开盾一次，少室山只保护该玩家', () => {
    const id = 'sect_quanzhen_hufa'
    const worn = gear(id)
    const solo = fight(worn, { environment: calm, rng: () => 0.99 })
    expect(effectEvents(solo, id)).toMatchObject([{ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', shieldDelta: Math.round(mainUnit(solo).maxMp * 0.3) }])
    expect(effectEvents(fight({ ...worn, headId: null }, { environment: calm, rng: () => 0.99 }), id)).toEqual([])
    const teammate = (id: string, loadout: LoadoutPresetDTO) => ({ player: { ...player, id, nickname: id }, loadout, learnedSkills: {} })
    const raid = simulateShaoshiRaid('sect-shields', [teammate('甲', loadout), teammate('乙', worn), teammate('丙', loadout)], () => 0.99, calm)
    expect(effectEvents(raid, id)).toMatchObject([{ round: 1, actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_LEFT',
      shieldDelta: Math.round(raid.units.find(({ slot }) => slot === 'ALLY_LEFT')!.maxMp * 0.3) }])
  })

  it('降龙之怒随已损气血逐档增伤，跌破一成时按扣盾后实伤记录翻倍', () => {
    const worn = gear('sect_gaibang_zhanglao')
    const hp = computeDerivedStats(player, worn).maxHp
    const defense = computeDerivedStats(player, worn).def
    const at = (remaining: number) => {
      const atk = Math.round((hp - remaining) * (defense + 495) / 495)
      return fight(worn, { environment: calm, rng: () => 0.99, surviveRounds: 1, enemyMain: {
        ...enemy, atk, combat: { speed: 200, openingShield: 100 },
      } })
    }
    const tags = (report: BattleReportDTO) => mainCast(report).segments.flatMap((segment) => segment.type === 'tag' ? [segment.text] : [])
    expect(tags(at(Math.round(hp * 0.35)))).toContainEqual(expect.stringContaining('攻击 +60%'))
    expect(tags(at(Math.round(hp * 0.1) + 3)).some((tag) => tag.includes('濒死出招'))).toBe(false)
    const desperate = at(Math.round(hp * 0.08))
    expect(tags(desperate)).toContainEqual(expect.stringMatching(/濒死出招伤害 ×2 · 增伤 \+[1-9]/))
    expect(mainCast(desperate).shieldAbsorbed).toBe(100)
  })

  it('东邪衣钵只点中闪避的来袭者，下回合减速并保留自身出手', () => {
    const id = 'sect_taohua_yibo'
    const worn = { ...gear(id), lightSkillId: 'lingbo_weibu' }
    const report = fight(worn, { environment: calm, rng: () => 0.4, enemyMain: { ...enemy, atk: 70 }, surviveRounds: 2 })
    expect(report.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.hitResult === 'DODGE')).toBeDefined()
    expect(effectEvents(report, id)[0]).toMatchObject({ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', statusRounds: 1 })
    expect(effectEvents(report, id)[0].segments).toContainEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('20%') }))
    expect(mainCast(report).round).toBe(1)
    expect(effectEvents(fight({ ...worn, wristId: null }, { environment: calm, rng: () => 0.4 }), id)).toEqual([])
  })

  it('万毒噬体只在暴击引爆目标剩余毒伤，保留流血与护盾', () => {
    const id = 'sect_baituo_shaozhuang'
    const worn = { ...gear(id), weaponId: 'yangjia_spear', outerSkillId: 'jiuyin_baiguzhua' }
    const report = fight(worn, { environment: calm, rng: () => 0.99 })
    const unit = report.units.find(({ slot }) => slot === 'ENEMY_MAIN')!
    const target: EnemyBattleState = { unit, shield: 999, atk: 250 }
    const source = { sourceId: 'seed', sourceName: '试毒', slot: 'ALLY_MAIN' as const }
    const events: BattleEventDTO[] = []
    const context = { round: 1, attack: 300, rng: () => 0.99 }
    applyPeriodicOnHit(source, target, unit.hp, { status: 'cinnabar', attackPercent: 10, rounds: 2 }, context, events)
    applyPeriodicOnHit(source, target, unit.hp, { status: 'staffVenom', attackPercent: 5, rounds: 3, maxStacks: 3, stacksPerHit: 2 }, context, events)
    applyPeriodicOnHit(source, target, unit.hp, { status: 'bleed', attackPercent: 5, rounds: 3 }, context, events)
    const active = resolveBattleLoadout(worn, player).effects
    expect(resolvePoisonBurst(mainUnit(report), target, unit.hp, active, 1, events)).toBe(unit.hp)
    expect(resolvePoisonBurst(mainUnit(report), target, 125, active, 1, events, true)).toBe(0)
    expect(events.filter((event) => event.effectSourceId === id).map((event) => event.statusRemoved ?? event.hpDelta))
      .toEqual(['朱砂血毒', '灵蛇剧毒', -125])
    expect(target.shield).toBe(999)
    expect(target.ongoingDamage?.bleed?.remainingRounds).toBe(3)
    expect(target.ongoingDamage?.staffVenom).toBeUndefined()
  })

  it('白驼少庄主的实战暴击引爆当次施加的灵蛇剧毒并记录实伤', () => {
    const owner = { ...player, currentSectId: 'baituo', stats: { ...player.stats, agi: 65 } }
    const worn = { ...gear('sect_baituo_shaozhuang'), weaponId: 'lingshe_zhang', outerSkillId: 'lingshe_quan' }
    const report = fight(worn, { player: owner, environment: calm, rng: () => 0.99, surviveRounds: 1 })
    const strike = mainCast(report)
    expect(strike.hitResult).toBe('CRIT')
    const poison = effectEvents(report, 'lingshe_zhang').find((event) => event.statusApplied === '灵蛇剧毒')
    const burst = effectEvents(report, 'sect_baituo_shaozhuang')
    expect(poison).toMatchObject({ targetSlot: 'ENEMY_MAIN', statusStacks: 2, statusRounds: 2 })
    const attack = computeDerivedStats(owner, worn).atk
    expect(burst).toMatchObject([{ statusRemoved: '灵蛇剧毒' }, { hpDelta: -Math.round(attack * 0.12) * 4 }])
  })
})

describe('千机任侠百家无拘', () => {
  const armor = WANDERER_EQUIPMENT.items[0].id
  const belt = WANDERER_EQUIPMENT.items[1].id
  const calm = { rain: false, night: false, swamp: false }
  const itemOf = (id: string) => ITEMS[id]
  const full = { ...loadout, armorId: armor, weaponId: 'qimei_stick', headId: 'quanzhen_beidou_head', wristId: 'sect_baituo_bushe_wrist',
    beltId: 'tiezhang_kaishan_belt', bootsId: 'fahua_zuyi_boots', accId: 'bihai_chaosheng_acc' }
  const partial = { ...full, weaponId: null, headId: null, armorId: 'sect_baituo_bushe_armor', beltId: belt }
  const tags = (event: BattleEventDTO) => event.segments.filter((segment) => segment.type === 'tag').map((segment) => segment.text)

  it('有效槽位按门派去重，六门封顶，拜师和脱下千机任侠后停止', () => {
    expect(wandererEquipmentBonus(null, full, itemOf)).toBe(30)
    expect(wandererEquipmentBonus(null, partial, itemOf)).toBe(15)
    expect(wandererEquipmentBonus(null, { ...partial, bootsId: 'quanzhen_robe' }, itemOf)).toBe(10)
    expect(wandererEquipmentBonus('quanzhen', full, itemOf)).toBe(0)
    expect(wandererEquipmentBonus(null, { ...full, armorId: 'quanzhen_robe' }, itemOf)).toBe(0)
  })

  it('全队受益、护盾全挡无实伤，少室山多个散人同类取最高', () => {
    const solo = fight({ ...partial, leftCompanionId: 'guojing', rightCompanionId: 'zhebie' }, { environment: calm, rng: () => 0.99 })
    const casts = solo.events.filter((event) => tags(event).some((tag) => tag.startsWith('百家无拘 · 全队伤害 +15%')))
    expect(new Set(casts.map(({ actorSlot }) => actorSlot))).toEqual(new Set(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT']))
    const shielded = fight(partial, { enemyMain: { ...enemy, combat: { openingShield: 20000 } }, environment: calm, rng: () => 0.99 })
    expect(mainCast(shielded).hpDelta).toBe(0)
    expect(tags(mainCast(shielded)).some((tag) => tag.includes('百家无拘'))).toBe(false)
    const teammate = (id: string, loadout: LoadoutPresetDTO) => ({ player: { ...player, id, nickname: id }, loadout, learnedSkills: {} })
    const raid = simulateShaoshiRaid('wanderer-gear', [teammate('甲', full), teammate('乙', loadout), teammate('丙', partial)], () => 0.99, calm)
    const hit = raid.events.find((event) => event.actorSlot === 'ALLY_LEFT' && event.type === 'SKILL_CAST' && (event.hpDelta ?? 0) < 0)!
    expect(tags(hit).filter((tag) => tag.includes('百家无拘'))).toEqual([expect.stringMatching(/全队伤害 \+30% \+[1-9]/)])
  })

  it('散人过关后可在嘉兴补领，已领的装备不重复发放', () => {
    const store = newStore('DEMO')
    store.claimWandererEquipment()
    expect(store.ownedItemIds).not.toContain(armor)
    store.player.trial.rewardedStageIds.push(WANDERER_EQUIPMENT.stage)
    store.moveMap('damo_caravan')
    store.claimWandererEquipment()
    expect(store.ownedItemIds).not.toContain(armor)
    store.moveMap(WANDERER_EQUIPMENT.mapId)
    store.claimWandererEquipment()
    store.claimWandererEquipment()
    expect(store.ownedItemIds.filter((id) => id === armor || id === belt)).toEqual([armor, belt])
    expect(store.unclaimedWandererEquipment).toBe(false)
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

describe('丐帮三掌、分支面板和君山车轮战', () => {
  it('站定接三次实际命中，盾全吸收仍计入，主角和伙伴都不主动出招', () => {
    const gear = equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])
    const report = fight({ ...gear, lightSkillId: 'lingbo_weibu', leftCompanionId: 'guojing', rightCompanionId: 'huangrong' }, {
      mode: 'SECT_TRIAL', objective: GAIBANG_DIVISION.objective, enemyMain: { ...GAIBANG_DIVISION.opponent, atk: 70 },
      companionOf: baseCompanion, rng: () => 0,
    })
    const hits = report.events.filter((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')
    expect(hits).toMatchObject([1, 2, 3].map((round) => ({ round, targetSlot: 'ALLY_MAIN', hpDelta: 0, shieldAbsorbed: 70 })))
    expect(report.events.some((event) => event.type === 'GUARD_BLOCK' || event.type === 'DODGE' || event.type === 'ASSIST_ATTACK' ||
      (event.type === 'SKILL_CAST' && event.actorSlot.startsWith('ALLY')))).toBe(false)
    expect(report.winner).toBe('ALLY')
    expect(report.events.at(-1)).toMatchObject({ round: 3, segments: [{ text: '接满 3 掌，主角仍站立' }] })

    const failed = fight({}, {
      mode: 'SECT_TRIAL', objective: GAIBANG_DIVISION.objective, enemyMain: { ...GAIBANG_DIVISION.opponent, atk: 6000 },
      rewards: { qiExp: 100, silver: 100 },
    })
    expect(failed.winner).toBe('ENEMY')
    expect(failed.rewards).toBeUndefined()
    expect(failed.events.at(-1)).toMatchObject({ round: 1, segments: [{ text: '主角倒下，考核失败' }] })
  })

  it('污衣和净衣按实际玩家的入帮分支改变派生面板及战斗结算', () => {
    const disciple = { ...player, currentSectId: 'gaibang', sectRank: 3, stats: { ...player.stats, con: 40, agi: 25 } }
    const dirty = { ...disciple, gaibangBranch: 'WUYI' as const }
    const clean = { ...disciple, gaibangBranch: 'JINGYI' as const }
    const root = computeDerivedStats({ ...disciple, stats: { ...disciple.stats, con: 46 } }, loadout)
    expect(computeDerivedStats(dirty, loadout)).toMatchObject({ maxHp: root.maxHp, maxMp: root.maxMp, def: Math.round(root.def * 1.15) })
    expect(computeDerivedStats(clean, loadout)).toEqual(computeDerivedStats({ ...disciple, stats: { ...disciple.stats, agi: 30 } }, loadout))
    expect(computeDerivedStats({ ...clean, currentSectId: null }, loadout)).toEqual(computeDerivedStats(disciple, loadout))

    const report = fight({}, { player: clean, rewards: { qiExp: 25, silver: 125 } })
    expect(effectEvents(report, 'gaibang_branch').at(0)?.segments).toMatchObject([
      { type: 'tag', text: '净衣派' }, { type: 'text', text: ' 试招侠客身法 +5' },
    ])
    expect(report.rewards).toEqual({ qiExp: 25, silver: 150 })
    expect(disciple.stats).toMatchObject({ con: 40, agi: 25 })
  })

  it('连续三位对手各自入场，实际气血、内力和怒气按此前战报延续', () => {
    const bout = {
      enemyMain: { ...JUNSHAN_EXAM.opponent, hp: 2900, atk: 190 },
      nextOpponents: JUNSHAN_EXAM.nextOpponents.map((opponent) => ({ ...opponent, hp: 2100, atk: 190 })),
    }
    const report = fight({ outerSkillId: 'yuenv_jian', ultSkillId: 'yiyang_zhi' }, {
      ...bout, mode: 'SECT_TRIAL', player: { ...player, level: 20, realmTier: 2, stats: { ...player.stats, con: 75 } },
      rng: () => 0.99,
    })
    const lead = mainUnit(report)
    const state = { hp: lead.hp, mp: lead.maxMp, rage: lead.rage }
    const entrants = []
    for (const event of report.events) {
      if (event.opponentEntry) {
        entrants.push(event.opponentEntry)
        expect(event.segments[1]).toMatchObject({
          text: ` 我方延续气血 ${state.hp.toLocaleString()}、内力 ${state.mp.toLocaleString()}、怒气 ${state.rage}。`,
        })
        expect(state.hp).toBeLessThan(lead.maxHp)
        expect(state.mp).toBeLessThan(lead.maxMp)
      }
      if (event.targetSlot === 'ALLY_MAIN') state.hp = Math.max(0, Math.min(lead.maxHp, state.hp + (event.hpDelta ?? 0)))
      if (event.actorSlot === 'ALLY_MAIN') {
        state.hp = Math.max(0, state.hp + (event.reflectDelta ?? 0))
        state.mp = Math.max(0, Math.min(lead.maxMp, state.mp + (event.mpDelta ?? 0)))
      }
      if ((event.rageTargetSlot ?? event.actorSlot) === 'ALLY_MAIN') state.rage = Math.max(0, Math.min(100, state.rage + (event.rageDelta ?? 0)))
    }
    expect(entrants).toMatchObject([
      { unit: { name: '彭长老', hp: 2100 }, stanceBanner: { enemyStance: 'AGILE', advantage: 'ALLY' } },
      { unit: { name: '梁长老', hp: 2100 }, stanceBanner: { enemyStance: 'TAICHI', advantage: 'ENEMY' } },
    ])
    expect(report.units.find((unit) => unit.slot === 'ENEMY_MAIN')?.name).toBe('简长老')
    expect(report.winner).toBe('ALLY')
    expect(report.events.at(-1)).toMatchObject({ segments: [{ text: '车轮战 · 连胜 3 场' }] })
  })

  it('第一场用掉的锁血不在第二场刷新，战败时余下对手不会入场', () => {
    const gear = equipped('henglian_tongjia', ['WEAPON', 'HEAD', 'ARMOR', 'WRIST'])
    const opponent = { ...enemy, hp: 1, atk: 30_000, combat: { speed: 300 } }
    const report = fight(gear, {
      mode: 'SECT_TRIAL', enemyMain: opponent, nextOpponents: [{ ...opponent, name: '次场考官' }, { ...opponent, name: '末场考官' }],
      rewards: { qiExp: 100, silver: 100 }, rng: () => 0.99,
    })
    const saves = effectEvents(report, 'henglian_tongjia').filter((event) =>
      event.segments.some((segment) => segment.type === 'tag' && segment.text.endsWith(' · 免死')),
    )
    expect(saves).toMatchObject([{ actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN' }])
    expect(report.events.filter((event) => event.opponentEntry).map((event) => event.opponentEntry?.unit.name)).toEqual(['次场考官'])
    expect(report.winner).toBe('ENEMY')
    expect(report.rewards).toBeUndefined()
    expect(report.events.at(-1)).toMatchObject({ segments: [{ text: '车轮战 · 第 2 场未通过' }] })
  })
})

describe('门派晋升的共享胜负条件', () => {
  const gaibang = SECTS.find(({ id }) => id === 'gaibang')!.promotionExams![2]!
  const peach = SECTS.find(({ id }) => id === 'taohua')!.promotionExams!
  const disarm = peach[2]!
  const composure = peach[4]!

  it('丐帮第 3 回合的流血击倒仍算过关，剩 1 点气血即超时', () => {
    const fightThief = (hp: number) => fight({ outerSkillId: 'jiuyin_baiguzhua' }, {
      mode: 'SECT_TRIAL', objective: gaibang.objective, enemyMain: { ...gaibang.opponent, hp, atk: 70 },
      rewards: { qiExp: 100, silver: 100 }, rng: () => 0.99,
    })
    const probe = fightThief(20_000)
    const wounds = probe.events.filter((event) => event.targetSlot === 'ENEMY_MAIN' && (event.hpDelta ?? 0) < 0)
    const damage = -wounds.reduce((total, event) => total + event.hpDelta!, 0)
    expect(wounds.at(-1)).toMatchObject({ round: 3, type: 'DOT_TICK' })

    const onTime = fightThief(damage)
    expect(onTime.winner).toBe('ALLY')
    expect(onTime.events.at(-1)).toMatchObject({ round: 3, segments: [{ text: '第 3 回合击倒采花贼' }] })
    expect(onTime.rewards).toBeDefined()

    const late = fightThief(damage + 1)
    expect(late.winner).toBe('ENEMY')
    expect(late.rewards).toBeUndefined()
    expect(late.events.at(-1)).toMatchObject({ round: 3, segments: [{ text: '3 回合内未击倒采花贼' }] })
    expect(late.events.some((event) => event.type === 'BOSS_ENRAGE')).toBe(false)
  })

  it('哑仆已经出手时也可在当回合卸械，成功后停止会继续伤人的伙伴追击', () => {
    const report = fight({ stance: 'AGILE', outerSkillId: 'luoying_zhang', leftCompanionId: 'guojing' }, {
      mode: 'SECT_TRIAL', objective: disarm.objective, enemyMain: { ...disarm.opponent, hp: 420, atk: 70 },
      companionOf: baseCompanion, rng: () => 0.99,
    })
    const counter = report.events.findIndex((event) => event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')
    const applied = report.events.findIndex((event) => event.statusApplied === '缴械' && event.targetSlot === 'ENEMY_MAIN')
    expect(counter).toBeGreaterThanOrEqual(0)
    expect(applied).toBeGreaterThan(counter)
    expect(report.events.find((event) => event.type === 'ASSIST_ATTACK')).toBeUndefined()
    expect(report.winner).toBe('ALLY')
    expect(report.events.at(-1)).toMatchObject({ round: 1, segments: [{ text: '第 1 回合卸下桃花岛哑仆的兵刃，对方仍存活' }] })
  })

  it('现有玄铁匕首实际缴械可以过关，伤及性命与缴械抵抗均判失败', () => {
    const settings = { mode: 'SECT_TRIAL' as const, objective: disarm.objective, rng: () => 0, rewards: { qiExp: 100, silver: 100 } }
    const opponent = { ...disarm.opponent, atk: 70 }
    const dagger = fight({ weaponId: 'xuantie_dagger' }, { ...settings, enemyMain: opponent })
    expect(dagger.events.find((event) => event.statusApplied === '缴械')).toMatchObject({ effectSourceId: 'xuantie_dagger', targetSlot: 'ENEMY_MAIN' })
    expect(dagger.winner).toBe('ALLY')

    const lethal = fight({ stance: 'AGILE', outerSkillId: 'luoying_zhang' }, { ...settings, enemyMain: { ...opponent, hp: 1 } })
    expect(lethal.winner).toBe('ENEMY')
    expect(lethal.rewards).toBeUndefined()
    expect(lethal.events.some((event) => event.statusApplied === '缴械')).toBe(false)
    expect(lethal.events.at(-1)).toMatchObject({ segments: [{ text: '桃花岛哑仆倒下，未达成卸械条件' }] })

    const blocked = fight({ stance: 'AGILE', outerSkillId: 'luoying_zhang' }, {
      ...settings, enemyMain: { ...opponent, combat: { ...opponent.combat, controlImmunity: ['DISARM'] } },
    })
    expect(blocked.winner).toBe('ENEMY')
    expect(blocked.events.at(-1)).toMatchObject({ round: 10, segments: [{ text: '10 回合内未能卸下桃花岛哑仆的兵刃' }] })
    expect(blocked.events.some((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('抵抗缴械')))).toBe(true)
  })

  it('定力守战按实际状态判定，已出手主角被箫声施加混乱时立即失败', () => {
    const report = fight({}, {
      mode: 'SECT_TRIAL', objective: composure.objective, enemyMain: { ...composure.opponent, atk: 70 },
      player: { ...player, stats: { ...player.stats, agi: 10 } }, rng: () => 0,
    })
    const thirdRound = report.events.filter((event) => event.round === 3)
    expect(thirdRound[0]).toMatchObject({ actorSlot: 'ALLY_MAIN', type: 'SKILL_CAST' })
    expect(thirdRound.find((event) => event.statusApplied === '心神混乱')).toMatchObject({ targetSlot: 'ALLY_MAIN' })
    expect(thirdRound.some((event) => event.actorSlot === 'ENEMY_MAIN' && !!event.hpDelta)).toBe(false)
    expect(report.winner).toBe('ENEMY')
    expect(report.events.at(-1)).toMatchObject({ round: 3, segments: [{ text: '第 3 回合心神混乱，考核失败' }] })
  })

  it('主角抵抗箫声后完整撑过 8 回合可胜，提前击倒考官不计过关', () => {
    const options = {
      mode: 'SECT_TRIAL' as const, objective: composure.objective, enemyMain: { ...composure.opponent, atk: 70 },
      companionOf: baseCompanion, rng: () => 0,
    }
    const survived = fight({ innerSkillId: 'dali_chanshi_jue', leftCompanionId: 'guojing' }, options)
    expect(survived.events.filter((event) => event.targetSlot === 'ALLY_MAIN' && event.segments.some((segment) =>
      segment.type === 'tag' && segment.text === '大理禅定心诀 · 抵抗心神混乱')).map(({ round }) => round)).toEqual([3, 6])
    expect(survived.events.some((event) => event.statusApplied === '心神混乱' && event.targetSlot === 'ALLY_LEFT')).toBe(true)
    expect(survived.winner).toBe('ALLY')
    expect(survived.events.at(-1)).toMatchObject({ round: 8, segments: [{ text: '撑过 8 回合，心神不乱' }] })

    const early = fight({}, { ...options, enemyMain: { ...options.enemyMain, hp: 1 } })
    expect(early.winner).toBe('ENEMY')
    expect(early.events.at(-1)).toMatchObject({ round: 1, segments: [{ text: '未完成 8 回合守战' }] })
  })
})

describe('桃花岛奇门困阵与传承', () => {
  it('开战按主角实际奇门架势困住两名亲卫，第三回合恢复行动', () => {
    const rescue = TAOHUA_RESCUE_EXAM.opponent
    const opponent = { ...rescue, hp: 30_000, atk: 70, guards: rescue.guards.map((guard) => ({ ...guard, hp: 10_000, atk: 70 })) }
    const options = { enemyMain: opponent, surviveRounds: 3, rng: () => 0.99 }
    const trapped = fight({ stance: 'AGILE' }, options)
    const casts = (report: BattleReportDTO, slot: BattleEventDTO['actorSlot']) =>
      report.events.filter((event) => event.actorSlot === slot && event.type === 'SKILL_CAST').map((event) => event.round)
    expect(casts(trapped, 'ENEMY_LEFT')).toEqual([3])
    expect(casts(trapped, 'ENEMY_RIGHT')).toEqual([3])
    expect(casts(trapped, 'ENEMY_MAIN')).toEqual([1, 2, 3])
    const untrapped = fight({ stance: 'FIERCE' }, options)
    expect(effectEvents(untrapped, 'taohua_wuxing')).toEqual([])
    expect(casts(untrapped, 'ENEMY_LEFT')).toEqual([1, 2, 3])
    expect(casts(untrapped, 'ENEMY_RIGHT')).toEqual([1, 2, 3])
  })

  it('奇门五转的全队开局闪避按实际出战者与各自上限结算', () => {
    const lightSkillId = 'qimen_wuzhuan'
    const status = (report: BattleReportDTO) => effectEvents(report, lightSkillId).filter((event) => event.statusApplied === '闪避提高')
    const solo = fight({ lightSkillId, leftCompanionId: 'luchengfeng', rightCompanionId: 'huangrong' }, { companionOf: baseCompanion, rng: () => 0.99 })
    expect(status(solo).map((event) => event.targetSlot).sort()).toEqual(['ALLY_LEFT', 'ALLY_MAIN', 'ALLY_RIGHT'])
    expect(status(solo).every((event) => event.round === 1 && event.statusRounds === 1 && event.actorSlot === 'ALLY_MAIN')).toBe(true)
    expect(effectEvents(solo, 'huangrong').some((event) => event.statusApplied === '闪避提高')).toBe(false)
    expect(computeDerivedStats(player, { ...loadout, lightSkillId }).speed).toBe(computeDerivedStats(player, loadout).speed + 18)

    const raid = simulateShaoshiRaid('raid-qimen-opening', [
      { player, loadout, learnedSkills: {} },
      { player: { ...player, id: 'left', stats: { ...player.stats, agi: 280 } }, loadout: { ...loadout, lightSkillId }, learnedSkills: {} },
      { player: { ...player, id: 'right', stats: { ...player.stats, agi: 60 } }, loadout: { ...loadout, lightSkillId: 'lingbo_weibu' }, learnedSkills: {} },
    ], () => 0.99)
    expect(status(raid)).toMatchObject([
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_MAIN', round: 1, statusRounds: 1, segments: [{ text: '奇门五转' }, { text: expect.stringContaining('20 个百分点') }] },
      { actorSlot: 'ALLY_LEFT', targetSlot: 'ALLY_LEFT', round: 1, statusRounds: 1, segments: [{ text: '奇门五转' }, { text: expect.stringContaining('15 个百分点') }] },
    ])
  })

  it('玉箫剑法按音律绕盾封穴，桃花九阴提高实际内力并抵抗控制', () => {
    const disciple = { ...player, currentSectId: 'taohua', sectRank: 5, stats: { ...player.stats, intStat: 60 } }
    const gear = { weaponId: 'biyu_xiao', outerSkillId: 'yuxiao_jianfa', innerSkillId: 'jiuyin_taohua' }
    const baseMp = computeDerivedStats(disciple, { ...loadout, ...gear, innerSkillId: null }).maxMp
    const report = fight(gear, {
      player: disciple, rng: () => 0.34,
      enemyMain: { ...enemy, mp: 100, combat: { openingShield: 10_000, statusOnHit: { status: 'STUN', rounds: 1 } } },
    })
    expect(mainUnit(report).maxMp).toBe(Math.round(baseMp * 1.25))
    const cast = mainCast(report)
    expect(cast.hpDelta).toBeLessThan(0)
    expect(cast.segments.some((segment) => segment.type === 'tag' && segment.text.includes('内力优势强化 +25%'))).toBe(true)
    expect(cast.shieldAbsorbed ?? 0).toBe(0)
    expect(effectEvents(report, 'yuxiao_jianfa')).toContainEqual(expect.objectContaining({ targetSlot: 'ENEMY_MAIN', statusApplied: '封穴', statusRounds: 1 }))
    expect(report.events.some((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('九阴真经·桃花岛推演 · 抵抗点穴眩晕')))).toBe(true)
  })
})

describe('全真天罡北斗大阵', () => {
  const { objective, formation, opponent } = QUANZHEN_GUARD_EXAM
  const { reserves, ...lineup } = formation
  const disciple = { ...player, stats: { ...player.stats, con: 80 } }
  const options = { mode: 'SECT_TRIAL' as const, player: disciple, objective, escortAllies: reserves, companionOf: baseCompanion, rng: () => 0.99 }
  const guardedOpponent = { ...opponent, atk: 1000 }

  it('欧阳锋的单体伤害先招架再分给实际七阵位，阵眼按实扣气血结算', () => {
    const report = fight({ ...lineup, stance: 'TAICHI' }, { ...options, enemyMain: guardedOpponent })
    const eye = report.units.find((unit) => unit.id === 'wangchuyi')!
    expect(eye).toMatchObject({ slot: 'ALLY_ESCORT_LEFT', title: '阵眼 · 玉阳子', hp: reserves[0].hp })
    const strike = report.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.targetSlot === eye.slot && event.type === 'SKILL_CAST')!
    const shared = effectEvents(report, 'quanzhen_guard_formation').filter((event) => event.round === 1 && (event.hpDelta ?? 0) < 0)
    expect(new Set(shared.map((event) => event.targetSlot)).size).toBe(6)
    expect(shared.every((event) => event.targetSlot !== eye.slot)).toBe(true)
    const sum = -strike.hpDelta! - shared.reduce((hp, event) => hp + event.hpDelta!, 0)
    expect(sum).toBe(incomingDamage(guardedOpponent.atk, 1, reserves[0].def, disciple.level))
    expect(strike.segments).toContainEqual({ type: 'tag', text: `天罡北斗阵 · 七人均摊 ${sum.toLocaleString()}`, tone: 'jade' })
    expect(report.events.find((event) => event.round === 2 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')?.hitResult).toBe('PARRY')
    expect(effectEvents(report, 'taichi_deflect')).toMatchObject([{ round: 4 }])
    const eyeHp = report.events.filter((event) => event.targetSlot === eye.slot).reduce((hp, event) => hp + (event.hpDelta ?? 0), eye.hp)
    expect(report.winner).toBe('ALLY')
    expect(report.events.at(-1)).toMatchObject({ round: 8, segments: [{ text: `守满 8 回合，阵眼王处一剩余气血 ${eyeHp.toLocaleString()}` }] })
  })

  it.each([0, 2])('阵位 %i 实际气血耗尽即败，提前击退仍须保住所有阵位', (index) => {
    const injured = reserves.map((ally, i) => i === index ? { ...ally, hp: 1 } : ally)
    const report = fight(lineup, { ...options, enemyMain: guardedOpponent, escortAllies: injured, rewards: { qiExp: 10, silver: 10 } })
    expect(report.winner).toBe('ENEMY')
    expect(report.rewards).toBeUndefined()
    expect(report.events.at(-1)).toMatchObject({ round: 1, segments: [{ text: `${injured[index].name}倒下，阵眼失守` }] })

    const repel = fight(lineup, { ...options, enemyMain: { ...opponent, hp: 1, atk: 1 } })
    expect(repel.winner).toBe('ALLY')
    expect(repel.events.at(-1)).toMatchObject({ round: 1, segments: [{ text: expect.stringContaining('击退西毒·欧阳锋') }] })
  })
})

it('刘处玄和郝大通按实际出手目标结算防御和攻击削弱', () => {
  const report = fight({ leftCompanionId: 'liuchuxuan', rightCompanionId: 'haodatong' }, { companionOf: baseCompanion, rng: () => 0.99 })
  expect(effectEvents(report, 'liuchuxuan')).toContainEqual(expect.objectContaining({
    actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', statusApplied: '防御降低', statusRounds: 1,
    segments: [{ type: 'tag', text: '长生剑', tone: 'purple' }, { type: 'text', text: expect.stringContaining('防御降低 15%') }],
  }))
  expect(effectEvents(report, 'haodatong')).toContainEqual(expect.objectContaining({
    actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN', statusApplied: '攻击降低', statusRounds: 1,
    segments: [{ type: 'tag', text: '广宁剑', tone: 'purple' }, { type: 'text', text: expect.stringContaining('攻击降低 12%') }],
  }))
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

describe('双方配装的切磋与劫镖', () => {
  const fighter = (id: string, patch: Partial<LoadoutPresetDTO> = {}, stats: Partial<typeof player.stats> = {}, learnedSkills: Record<string, number> = {}) => ({
    player: { ...player, id, nickname: id, stats: { ...player.stats, con: 75, ...stats } }, loadout: { ...loadout, ...patch }, learnedSkills,
  })
  const duel = (lineup: Parameters<typeof simulatePlayerDuel>[0]['lineup'], options: Partial<Parameters<typeof simulatePlayerDuel>[0]> = {}) =>
    simulatePlayerDuel({ battleId: 'duel', sceneTitle: '试招', mode: 'PVP_HUASHAN', lineup, environment: {}, rng: () => 0.73, ...options })
  const cast = (report: BattleReportDTO, slot: 'ALLY_MAIN' | 'ENEMY_MAIN') =>
    report.events.find((event) => event.round === 1 && event.type === 'SKILL_CAST' && event.actorSlot === slot)!

  it('左右各按自己的兵刃、架势、武学重数与护体防御结算', () => {
    const attacker = fighter('攻', { stance: 'AGILE', outerSkillId: 'luoying_zhang', weaponId: 'qinggang_sword' }, { agi: 15 })
    const defender = fighter('守', { stance: 'TAICHI', outerSkillId: 'quanzhen_jianfa', weaponId: 'xuantie_dagger' }, {}, { quanzhen_jianfa: 3 })
    const report = duel([attacker, defender])
    const baseline = duel([attacker, { ...defender, learnedSkills: { quanzhen_jianfa: 1 } }])
    expect(report.units.map((unit) => [unit.slot, unit.name, unit.weaponName, unit.isPlayer])).toEqual([
      ['ALLY_MAIN', '攻', ITEMS.qinggang_sword.name, true], ['ENEMY_MAIN', '守', ITEMS.xuantie_dagger.name, true],
    ])
    expect(report.stanceBanner).toMatchObject({ allyStance: 'AGILE', enemyStance: 'TAICHI', advantage: 'ALLY' })
    expect(cast(report, 'ALLY_MAIN')).toMatchObject({ skillId: 'luoying_zhang', targetSlot: 'ENEMY_MAIN' })
    expect(cast(report, 'ENEMY_MAIN')).toMatchObject({ skillId: 'quanzhen_jianfa', targetSlot: 'ALLY_MAIN' })
    expect(cast(report, 'ENEMY_MAIN').hpDelta).toBeLessThan(cast(baseline, 'ENEMY_MAIN').hpDelta!)
  })

  it('盾后实扣、软猬反伤、毒伤与保命都跟随实际承伤方', () => {
    const shield = equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])
    const attacker = fighter('攻', { outerSkillId: 'jiuyin_baiguzhua', accId: 'jiuwei_fox' }, { str: 200, agi: 10, con: 35 })
    const defender = fighter('守', { ...shield, armorId: 'ruanwei_armor' }, { str: 15 })
    const report = duel([attacker, defender])
    const first = cast(report, 'ALLY_MAIN')
    expect(first.shieldAbsorbed).toBeGreaterThan(0)
    expect(first.targetSlot).toBe('ENEMY_MAIN')
    expect(effectEvents(report, 'ruanwei_armor')).toContainEqual(expect.objectContaining({ actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN' }))
    expect(report.events.some((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')).toBe(true)
    const weak = fighter('守', { accId: 'jiuwei_fox' }, { con: 0 })
    const lethal = duel([attacker, weak])
    expect(effectEvents(lethal, 'jiuwei_fox').filter((event) => event.statusApplied)).toMatchObject([
      { targetSlot: 'ENEMY_MAIN', statusApplied: '灵狐遁逃' },
    ])
  })

  it('双方切磋只减去内力优势的附加伤害，盾全挡时气血减伤记零', () => {
    const armorId = trialPartId('kongming_wantong', 'ARMOR')
    const attacker = fighter('攻', {}, { con: 500, agi: 20, str: 200 })
    const defender = fighter('守', { armorId }, { con: 1 })
    const ownStats = computeDerivedStats(attacker.player, attacker.loadout)
    const targetStats = computeDerivedStats(defender.player, defender.loadout)
    const pressure = innerPressure(ownStats.maxMp, targetStats.maxMp)
    const damage = (factor: number) => Math.round(damageAfterDefense(strikeDamage(ownStats.atk, 1, 1, factor, false, 1), targetStats.def, attacker.player.level))
    const actual = damage(1 + (pressure - 1) * 0.8)
    const hit = cast(duel([attacker, defender]), 'ALLY_MAIN')
    expect(hit.hpDelta).toBe(-actual)
    expect(hit.segments).toContainEqual({ type: 'tag', text: `粗葛补丁道人袍 · 内力压制 · 盾后减伤 ${damage(pressure) - actual}`, tone: 'jade' })

    const shielding = fighter('守', { ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']), armorId }, { con: 75 })
    const shielded = cast(duel([{ ...attacker, player: { ...attacker.player, stats: { ...attacker.player.stats, str: 10 } } }, shielding]), 'ALLY_MAIN')
    expect(shielded.hpDelta).toBe(0)
    expect(shielded.shieldAbsorbed).toBeGreaterThan(0)
    expect(shielded.segments).toContainEqual({ type: 'tag', text: '粗葛补丁道人袍 · 内力压制 · 盾后减伤 0', tone: 'jade' })
  })

  it('双方都触发抢先时按出手速度排序', () => {
    const bow = fighter('角弓', { weaponId: trialPartId('damo_qibing', 'WEAPON') }, { agi: 0 })
    const faster = fighter('快手', { weaponId: 'tiebai_bow' }, { agi: 30 })
    const first = duel([bow, faster], { rng: () => 0.14 }).events.find((event) => event.type === 'SKILL_CAST')!
    expect(first).toMatchObject({ round: 1, actorSlot: 'ENEMY_MAIN' })
  })

  it('横练反震造成致死时，出手方可以消耗自己的保命次数', () => {
    const copper = equipped('henglian_tongjia', ['HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC'])
    const attacker = fighter('攻', { accId: 'jiuwei_fox' }, { str: 12_000, con: 0, agi: 200 })
    const defender = fighter('守', copper, { str: 0, con: 200 })
    const report = duel([attacker, defender])
    expect(effectEvents(report, 'henglian_tongjia').filter((event) => event.round === 1 && event.segments.some((segment) =>
      segment.type === 'tag' && / · (免死|反震)$/.test(segment.text)))).toMatchObject([
      { actorSlot: 'ENEMY_MAIN', targetSlot: 'ENEMY_MAIN' },
      { actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN' },
    ])
    expect(effectEvents(report, 'jiuwei_fox')).toContainEqual(expect.objectContaining({
      round: 1, targetSlot: 'ALLY_MAIN', statusApplied: '灵狐遁逃', hpDelta: expect.any(Number),
    }))
    for (const unit of report.units) {
      let hp = unit.hp
      for (const event of report.events.filter((entry) => entry.targetSlot === unit.slot)) {
        hp += event.hpDelta ?? 0
        expect(hp).toBeGreaterThanOrEqual(0)
        expect(hp).toBeLessThanOrEqual(unit.maxHp)
      }
      expect(hp > 0).toBe(report.winner === (unit.slot === 'ALLY_MAIN' ? 'ALLY' : 'ENEMY'))
    }
  })

  it('擒刃挡下整次刀剑外功，保留护盾并按格挡量反震', () => {
    const attacker = fighter('攻', { weaponId: 'qinggang_sword', outerSkillId: 'quanzhen_jianfa' }, { str: 50, agi: 100 })
    const shield = equipped('quanzhen_beidou', ['HEAD', 'ARMOR', 'WRIST', 'BELT'])
    const defender = fighter('守', { ...shield, weaponId: 'tiancan_glove' })
    const report = duel([attacker, defender], { rng: () => 0 })
    const hit = cast(report, 'ALLY_MAIN')
    expect(hit).toMatchObject({ hitResult: 'PARRY', hpDelta: 0 })
    expect(hit.shieldAbsorbed).toBeUndefined()
    expect(effectEvents(report, 'tiancan_glove')).toContainEqual(expect.objectContaining({
      round: 1, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: expect.any(Number),
    }))
  })

  it('兰花拂穴手命中蛤蟆蓄力时打断施放，保留对手的内力', () => {
    const gear = equipped('hama_nimai', ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'ACC'])
    const charger = fighter('蓄力', gear, { str: 0, con: 200, agi: 200 })
    const attacker = fighter('打断', { outerSkillId: 'lanhua_fuxue' }, { str: 10, con: 250 })
    const report = duel([charger, attacker])
    const charge = effectEvents(report, 'hama_nimai').find((event) => event.statusApplied === '蓄力')!
    expect(charge).toBeDefined()
    expect(effectEvents(report, 'lanhua_fuxue')).toContainEqual(expect.objectContaining({
      round: charge.round, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN', statusRemoved: '蓄力',
    }))
    expect(report.events.some((event) => event.actorSlot === 'ALLY_MAIN' && (event.mpDelta ?? 0) < 0)).toBe(false)
    expect(report.events.some((event) => event.skillId === 'hama_nimai_pounce')).toBe(false)
  })

  it('双方镜像协战读取各自伙伴，太湖水令只增加镖战穿戴者的攻击', () => {
    const attacker = fighter('攻', { leftCompanionId: 'zhebie', accId: trialPartId('taihu_shuizhai', 'ACC') }, { agi: 20 })
    const defender = fighter('守', { leftCompanionId: 'liuchuxuan' })
    const normal = duel([attacker, defender])
    const escort = duel([attacker, defender], { mode: 'PVP_AMBUSH', escort: true })
    expect(normal.units.map((unit) => [unit.slot, unit.id])).toEqual([
      ['ALLY_MAIN', '攻'], ['ALLY_LEFT', 'zhebie'], ['ENEMY_MAIN', '守'], ['ENEMY_LEFT', 'liuchuxuan'],
    ])
    expect(escort.events).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', type: 'ASSIST_ATTACK' }))
    expect(escort.events).toContainEqual(expect.objectContaining({ actorSlot: 'ENEMY_LEFT', targetSlot: 'ALLY_LEFT', type: 'ASSIST_ATTACK' }))
    expect(cast(escort, 'ALLY_MAIN').hpDelta).toBeLessThan(cast(normal, 'ALLY_MAIN').hpDelta!)
    expect(cast(escort, 'ENEMY_MAIN').hpDelta).toBe(cast(normal, 'ENEMY_MAIN').hpDelta)
  })

  it.each(['PVP_HUASHAN', 'PVP_AMBUSH'] as const)('%s 第 15 轮双方狂暴，第 19 轮强制分胜负', (mode) => {
    const sturdy = { str: 0, con: 700 }
    const report = duel([fighter('攻', {}, sturdy), fighter('守', {}, sturdy)], { mode })
    expect(report.events.filter((event) => event.type === 'BOSS_ENRAGE').map(({ round, actorSlot }) => [round, actorSlot]))
      .toEqual([[15, 'ALLY_MAIN'], [15, 'ENEMY_MAIN']])
    expect(report.events.at(-1)).toMatchObject({ round: 19, type: 'SKILL_CAST', hitResult: 'HIT' })
    expect(report.events.filter((event) => event.round >= 15 && event.type === 'DODGE')).toEqual([])
    expect(report.events.every((event) => event.silverDrop === undefined && event.qiDrop === undefined)).toBe(true)
    const finish = report.events.at(-1)!
    const fallen = report.units.find((unit) => unit.slot === finish.targetSlot)!
    expect(report.events.reduce((hp, event) => hp + (event.targetSlot === fallen.slot ? event.hpDelta ?? 0 : 0), fallen.hp)).toBe(0)
  })

  it('近战打左翼前排，连珠神箭打右翼，前排倒下后再打主将', () => {
    const attacker = fighter('攻', { outerSkillId: 'taizu_changquan', stance: 'FIERCE' }, { str: 720, agi: 125 })
    const defender = fighter('守', { leftCompanionId: 'liuchuxuan', rightCompanionId: 'sunbuer', stance: 'FIERCE' }, { con: 250 })
    const report = duel([attacker, defender])
    const front = report.units.find((unit) => unit.slot === 'ENEMY_LEFT')!
    expect(cast(report, 'ALLY_MAIN')).toMatchObject({ targetSlot: 'ENEMY_LEFT', hpDelta: -front.hp })
    expect(report.events.some((event) => event.actorSlot === 'ENEMY_LEFT' && event.type === 'ASSIST_ATTACK')).toBe(false)
    expect(report.events).toContainEqual(expect.objectContaining({ round: 2, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', type: 'SKILL_CAST' }))

    const bow = duel([{ ...attacker, loadout: { ...attacker.loadout, outerSkillId: 'lianzhu_shenjian' } }, defender])
    expect(cast(bow, 'ALLY_MAIN').targetSlot).toBe('ENEMY_RIGHT')
  })

  it('一招碧海潮生分别结算三个目标的盾与乱心，怒气内力各扣一次', () => {
    const attacker = fighter('攻', { ultSkillId: 'bihai_chaosheng' }, { agi: 200, con: 200 })
    const defender = fighter('守', { ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']),
      leftCompanionId: 'liuchuxuan', rightCompanionId: 'sunbuer' }, { con: 450 })
    const report = duel([attacker, defender])
    const casts = report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.skillId === 'bihai_chaosheng')
    const first = casts[0]
    const wave = casts.filter((event) => event.round === first.round)
    expect(wave.map((event) => event.targetSlot)).toEqual(['ENEMY_RIGHT', 'ENEMY_MAIN', 'ENEMY_LEFT'])
    expect(wave.every((event) => (event.shieldAbsorbed ?? 0) > 0)).toBe(true)
    expect(wave.filter((event) => event.mpDelta !== undefined)).toHaveLength(1)
    expect(wave.filter((event) => event.rageDelta !== undefined)).toHaveLength(1)
    expect(effectEvents(report, 'bihai_chaosheng').filter((event) => event.round === first.round && event.statusApplied === '心神混乱')
      .map((event) => event.targetSlot)).toEqual(['ENEMY_RIGHT', 'ENEMY_MAIN', 'ENEMY_LEFT'])
  })

  it('右翼按盾后伤害代承，盾全吸收时保留气血和援护机会', () => {
    const attacker = fighter('攻', {}, { agi: 120 })
    const defender = fighter('守', { rightCompanionId: 'huangrong' }, { con: 50 })
    const firstHit = (report: BattleReportDTO) => report.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' &&
      event.targetSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    const ordinary = duel([attacker, { ...defender, loadout: { ...defender.loadout, rightCompanionId: null } }])
    const guarded = duel([attacker, defender])
    const cover = guarded.events.find((event) => event.round === 2 && event.targetSlot === 'ENEMY_RIGHT' &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('代承')))
    expect(cover?.hpDelta).toBe(Math.round(firstHit(ordinary).hpDelta! * 0.52))
    expect(firstHit(guarded).hpDelta! + cover!.hpDelta!).toBe(firstHit(ordinary).hpDelta)

    const shield = equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])
    const shielded = duel([attacker, { ...defender, loadout: { ...defender.loadout, ...shield } }])
    expect(firstHit(shielded)).toMatchObject({ hpDelta: 0, shieldAbsorbed: expect.any(Number) })
    expect(shielded.events.some((event) => event.round === 2 && event.targetSlot === 'ENEMY_RIGHT' &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('代承')))).toBe(false)
  })

  it('父女同心让实际濒死的左翼保留气血，右翼使用自己的保命', () => {
    const attacker = fighter('攻', {}, { agi: 300, str: 800 })
    const defender = fighter('守', { leftCompanionId: 'munianci', rightCompanionId: 'yangtiexin',
      companionEquipment: { yangtiexin: { ACC: 'jiuwei_fox' } } }, { con: 300 })
    const report = duel([attacker, defender])
    expect(cast(report, 'ALLY_MAIN')).toMatchObject({ targetSlot: 'ENEMY_LEFT', hpDelta: 0 })
    expect(effectEvents(report, 'fu_nv_tong_xin')).toMatchObject([{ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_RIGHT' }])
    expect(effectEvents(report, 'jiuwei_fox').some((event) => event.targetSlot === 'ENEMY_RIGHT' && event.statusApplied === '灵狐遁逃')).toBe(true)
  })

  it('华山刚猛外功提高封顶后的暴击率并绕盾，绝技仍扣盾', () => {
    const attacker = fighter('攻', { ultSkillId: 'yiyang_zhi', stance: 'FIERCE', weaponId: 'qinggang_sword' }, { agi: 130, con: 300 })
    const defender = fighter('守', { ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']), stance: 'AGILE' }, { con: 450 })
    const report = duel([attacker, defender], { huashan: true })
    const outer = cast(report, 'ALLY_MAIN')
    expect(outer.hpDelta).toBeLessThan(0)
    expect(outer.shieldDelta).toBeUndefined()
    expect(outer.segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringMatching(/^刚猛强攻 · 外功绕盾 \d+/) }))
    expect(outer.segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringContaining('刚猛强攻 · 暴击率 +25 个百分点') }))
    expect(outer.segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringContaining('架势克制伤害 +30%') }))
    const castUlt = report.events.find((event) => event.isUlt && event.actorSlot === 'ALLY_MAIN')!
    expect(castUlt.shieldAbsorbed).toBeGreaterThan(0)
    expect(castUlt.segments.some((segment) => segment.type === 'tag' && segment.text.startsWith('刚猛强攻'))).toBe(false)
  })

  it('华山奇门首轮提速，首次命中对实际目标封招一回合', () => {
    const agile = fighter('奇门', { stance: 'AGILE' }, { agi: 0, con: 280 })
    const foe = fighter('太极', { stance: 'TAICHI', ultSkillId: 'yiyang_zhi' }, { agi: 5, con: 280 })
    const first = (report: BattleReportDTO) => report.events.find((event) => event.type === 'SKILL_CAST' || event.type === 'DODGE')
    expect(first(duel([agile, foe]))?.actorSlot).toBe('ENEMY_MAIN')
    const report = duel([agile, foe], { huashan: true })
    expect(first(report)?.actorSlot).toBe('ALLY_MAIN')
    expect(effectEvents(report, 'huashan_agile').filter((event) => event.statusApplied)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', statusApplied: '封招', statusRounds: 1 },
    ])
    expect(report.events.find((event) => event.round === 2 && event.type === 'SKILL_CAST')?.actorSlot).toBe('ENEMY_MAIN')
  })

  it('华山太极招架并反弹刚猛来袭实扣的四成，九阳只结算一次近战反伤', () => {
    const attacker = fighter('攻', { stance: 'FIERCE' }, { agi: 40, con: 200 })
    const defender = fighter('守', { stance: 'TAICHI' }, { con: 200 })
    const report = duel([attacker, defender], { huashan: true })
    const blow = cast(report, 'ALLY_MAIN')
    expect(blow.hitResult).toBe('PARRY')
    expect(effectEvents(report, 'huashan_taichi')).toContainEqual(expect.objectContaining({ round: 1, actorSlot: 'ENEMY_MAIN',
      targetSlot: 'ALLY_MAIN', hpDelta: Math.round(blow.hpDelta! * 0.4) }))
    const jiuyang = duel([attacker, { ...defender, loadout: { ...defender.loadout, innerSkillId: 'jiuyang_shengong' } }], { huashan: true })
    expect(effectEvents(jiuyang, 'huashan_taichi').some((event) => event.targetSlot === 'ALLY_MAIN')).toBe(false)
    expect(effectEvents(jiuyang, 'jiuyang_shengong').some((event) => event.targetSlot === 'ALLY_MAIN' && (event.hpDelta ?? 0) < 0)).toBe(true)
  })

  it('北斗单体均摊按各自盾值，前排阵亡后解阵', () => {
    const attacker = fighter('攻', {}, { agi: 200, str: 2_100, con: 1_200 })
    const defender = fighter('守', { ...equipped('quanzhen_beidou', ['HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC']),
      leftCompanionId: 'liuchuxuan', rightCompanionId: 'sunbuer' }, { con: 1_300 })
    const report = duel([attacker, defender])
    expect(cast(report, 'ALLY_MAIN').segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringContaining('三人均摊') }))
    expect(effectEvents(report, 'quanzhen_beidou').filter((event) => event.round === 1 && event.actorSlot === 'ALLY_MAIN' && event.shieldAbsorbed)
      .map((event) => event.targetSlot)).toEqual(['ENEMY_MAIN', 'ENEMY_RIGHT'])
    const left = report.units.find((unit) => unit.slot === 'ENEMY_LEFT')!
    let hp = left.hp
    const defeat = report.events.find((event) => {
      if (event.targetSlot === left.slot) hp += event.hpDelta ?? 0
      return hp === 0
    })
    expect(defeat).toBeDefined()
    expect(report.events.slice(report.events.indexOf(defeat!) + 1).some((event) => event.actorSlot === 'ALLY_MAIN' &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('三人均摊')))).toBe(false)
  })

  it('射雕三绝在双方阵位战斗中每轮共掷一次，并按实际出手者追加免耗外功', () => {
    const attacker = fighter('攻', { leftCompanionId: 'hongqigong', rightCompanionId: 'zhoubotong' }, { con: 250 })
    const defender = fighter('守', {}, { con: 1_200 })
    const report = duel([attacker, defender], { rng: () => 0.2 })
    const added = effectEvents(report, 'she_diao_san_jue').filter((event) => event.round === 1 && event.skillId)
    expect(added.map((event) => event.actorSlot).sort()).toEqual(['ALLY_LEFT', 'ALLY_MAIN', 'ALLY_RIGHT'])
    expect(added.every((event) => event.targetSlot === 'ENEMY_MAIN' && event.rageDelta === undefined && event.mpDelta === undefined)).toBe(true)
    const skipped = duel([attacker, defender], { rng: () => 0.35 })
    expect(effectEvents(skipped, 'she_diao_san_jue')).toHaveLength(0)
  })

  it('东邪西毒在双方阵位战斗中将内伤和蛇毒叠在实际前排', () => {
    const attacker = fighter('攻', { leftCompanionId: 'ouyangfeng', rightCompanionId: 'huangyaoshi' }, { con: 250, str: 0 })
    const defender = fighter('守', { leftCompanionId: 'wangchongyang', rightCompanionId: 'mayu' }, { con: 1_200, str: 0 })
    const report = duel([attacker, defender], { rng: () => 0.73 })
    const combo = effectEvents(report, 'dong_xi')
    expect(combo.filter((event) => event.round === 1 && event.statusApplied).map(({ actorSlot, targetSlot, statusStacks }) =>
      [actorSlot, targetSlot, statusStacks])).toEqual([['ALLY_RIGHT', 'ENEMY_LEFT', 1], ['ALLY_LEFT', 'ENEMY_LEFT', 1]])
    expect(combo.some((event) => event.round === 3 && event.targetSlot === 'ENEMY_LEFT' &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text === '东邪西毒 · 引爆') && (event.hpDelta ?? 0) < 0)).toBe(true)
  })
})

describe('少室山三渡出招', () => {
  const member = (id: string, patch: Partial<LoadoutPresetDTO> = {}, con = 450, agi = 0) => ({
    player: { ...player, id, stats: { ...player.stats, con, agi } }, loadout: { ...loadout, ...patch }, learnedSkills: {},
  })
  const run = (lineup: Parameters<typeof simulateShaoshiRaid>[1]) => simulateShaoshiRaid('shaoshi-three-monks', lineup, () => 0.99, {})
  const front = SHAOSHI_RAID.guards[0].combat.rageMove.id
  const rear = SHAOSHI_RAID.guards[1].combat.rageMove.id
  const wave = SHAOSHI_RAID.boss.combat.charge.name
  const waveHits = (report: BattleReportDTO) => report.events.filter((event) => event.skillName === wave && event.actorSlot === 'ENEMY_MAIN')
  const beidou = equipped('quanzhen_beidou', ['HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC'])

  it.each([
    [450, 450, 'ALLY_LEFT', 'ALLY_RIGHT'],
    [0, 450, 'ALLY_MAIN', 'ALLY_RIGHT'],
    [450, 0, 'ALLY_LEFT', 'ALLY_LEFT'],
  ] as const)('两侧黑索按实际存活前后排选敌，左翼根骨 %i，右翼根骨 %i', (leftCon, rightCon, frontSlot, rearSlot) => {
    const report = run([member('lead'), member('left', {}, leftCon), member('right', {}, rightCon)])
    expect(report.events.filter((event) => event.round === 4 && (event.skillId === front || event.skillId === rear))).toMatchObject([
      { actorSlot: 'ENEMY_LEFT', skillId: front, targetSlot: frontSlot, isUlt: true },
      { actorSlot: 'ENEMY_RIGHT', skillId: rear, targetSlot: rearSlot, isUlt: true },
    ])
    if (rightCon === 0) expect(waveHits(report).map((event) => event.targetSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT'])
  })

  it('渡厄第五轮蓄力，第六轮逐人扣盾，范围招沿用独立防护并跳过均摊', () => {
    const report = run([member('lead', beidou, 450, 60), member('left', { armorId: 'ruanwei_armor' }), member('right')])
    expect(report.events).toContainEqual(expect.objectContaining({ round: 1, targetSlot: 'ENEMY_MAIN', shieldDelta: 1200 }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 5, actorSlot: 'ENEMY_MAIN', statusApplied: '蓄力' }))
    const hits = waveHits(report)
    expect(hits).toMatchObject(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'].map((targetSlot) => ({ round: 6, type: 'SKILL_CAST', targetSlot, hpDelta: 0 })))
    expect(hits.every((hit) => (hit.shieldAbsorbed ?? 0) > 0)).toBe(true)
    expect(new Set(hits.map((hit) => hit.shieldAbsorbed)).size).toBeGreaterThan(1)
    expect(hits.every((hit) => !hit.segments.some((segment) => segment.type === 'tag' && segment.text.includes('三人均摊')))).toBe(true)
    expect(report.events.some((event) => event.actorSlot === 'ENEMY_RIGHT' && event.skillId === rear &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('三人均摊')))).toBe(true)
    expect(report.events.filter((event) => event.type === 'BOSS_ENRAGE').map((event) => event.round)).toEqual([22])
    const finishing = report.events.find((event) => event.round === 26 && event.actorSlot?.startsWith('ENEMY') && (event.hpDelta ?? 0) < 0)!
    const receiver = report.units.find((unit) => unit.slot === finishing.targetSlot)!
    const remaining = report.events.slice(0, report.events.indexOf(finishing)).reduce((hp, event) =>
      event.targetSlot === receiver.slot ? hp + (event.hpDelta ?? 0) : hp, receiver.hp)
    expect(finishing.hpDelta).toBe(-remaining)
    expect(report.winner).toBe('ENEMY')
  })

  it('实际太极队员化解自己的黑索，岳武穆遗书减免其他队员的范围伤害', () => {
    const scenario = (stance: LoadoutPresetDTO['stance']) => run([
      member('lead', beidou, 450, 60), member('left', { armorId: 'ruanwei_armor' }), member('right', { stance, relicBookId: 'wumu_yishu' }),
    ])
    const before = waveHits(scenario('FIERCE')).find((event) => event.targetSlot === 'ALLY_LEFT')!
    const defended = scenario('TAICHI')
    const hits = waveHits(defended)
    expect(hits.map((event) => event.targetSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT'])
    expect(effectEvents(defended, 'taichi_deflect')).toContainEqual(expect.objectContaining({ round: 6, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN' }))
    const hit = hits.find((event) => event.targetSlot === 'ALLY_LEFT')!
    const reduction = Math.round(before.shieldAbsorbed! * 0.4)
    expect(hit.shieldAbsorbed).toBe(before.shieldAbsorbed! - reduction)
    expect(hit.segments).toContainEqual({ type: 'tag', text: `岳武穆遗书 · 范围减伤 ${reduction}`, tone: 'jade' })
  })

  it('渡厄只按被命中者的当前内力判压制，念珠减伤跟随实际穿戴者', () => {
    const wristId = trialPartId('fahua_zuyi', 'WRIST')
    const report = run([member('lead', {}, 175), member('left', { wristId }, 175), member('right', {}, 450)])
    const hits = waveHits(report)
    expect(hits.map((event) => event.targetSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'])
    const tag = (event: BattleEventDTO, text: string) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes(text))
    expect(hits.filter((event) => tag(event, '念珠手串 · 内力压制')).map((event) => event.targetSlot)).toEqual(['ALLY_LEFT'])
    expect(tag(hits[0], '内力优势')).toBe(true)
    expect(tag(hits[2], '内力优势')).toBe(false)
    expect(hits[1].hpDelta).toBeGreaterThan(hits[0].hpDelta!)
  })

  it('兰花拂穴手在黑索未破时也会优先命中蓄力的渡厄', () => {
    const report = run([member('lead'), member('left', { outerSkillId: 'lanhua_fuxue' }), member('right')])
    expect(report.events).toContainEqual(expect.objectContaining({ round: 5, actorSlot: 'ENEMY_MAIN', statusApplied: '蓄力' }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 6, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', type: 'SKILL_CAST' }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 6, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', skillId: 'lanhua_fuxue' }))
    expect(effectEvents(report, 'lanhua_fuxue')).toContainEqual(expect.objectContaining({ round: 6, targetSlot: 'ENEMY_MAIN', statusRemoved: '蓄力' }))
    expect(waveHits(report)).toEqual([])
    expect(report.events.some((event) => event.round === 7 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')).toBe(true)
  })

  it('一阳指命中时打断渡厄，照常扣本次绝技怒气和内力', () => {
    const report = run([member('lead'), member('left', { ultSkillId: 'yiyang_zhi', innerSkillId: 'nizhuan_jingmai' }), member('right')])
    const cast = report.events.find((event) => event.round === 6 && event.actorSlot === 'ALLY_LEFT' && event.skillId === 'yiyang_zhi')
    expect(cast).toMatchObject({ targetSlot: 'ENEMY_MAIN', rageDelta: -85 })
    expect(cast?.mpDelta).toBeLessThan(0)
    expect(effectEvents(report, 'yiyang_zhi')).toContainEqual(expect.objectContaining({ round: 6, targetSlot: 'ENEMY_MAIN', statusRemoved: '蓄力' }))
    expect(waveHits(report)).toEqual([])
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

describe('白驼五阶试练与逆九阴蛤蟆功', () => {
  const skillId = 'nijiuyin_hama_gong'

  it('逆行冲击按基础根骨准入，主角气血耗尽即失败', () => {
    const exam = SECTS.find(({ id }) => id === 'baituo')!.promotionExams![5]!
    const scenario = (con: number) => fight({ leftCompanionId: 'yideng', rightCompanionId: 'hongqigong' }, {
      player: { ...player, stats: { ...player.stats, con } }, objective: exam.objective, enemyMain: exam.opponent,
    })
    const refused = scenario(64)
    expect(refused.winner).toBe('ENEMY')
    expect(effectEvents(refused, 'baituo_meridian_trial')).toEqual([])
    expect(effectEvents(refused, 'battle_objective').at(-1)?.segments)
      .toContainEqual({ type: 'tag', text: '基础根骨 64 未达 65', tone: 'red' })

    const failed = scenario(65)
    const pulses = effectEvents(failed, 'baituo_meridian_trial')
    expect(failed.winner).toBe('ENEMY')
    expect(pulses.length).toBeGreaterThan(0)
    expect(pulses.length).toBeLessThan(5)
    expect(pulses.reduce((lost, pulse) => lost - pulse.hpDelta!, 0)).toBe(mainUnit(failed).maxHp)
    expect(failed.units.map((unit) => unit.slot)).toEqual(['ALLY_MAIN', 'ENEMY_MAIN'])
    expect(failed.events.some((event) => event.type === 'SKILL_CAST')).toBe(false)
  })

  it('逆行冲击使用实际盾量，回合末自愈照常结算', () => {
    const exam = SECTS.find(({ id }) => id === 'baituo')!.promotionExams![5]!
    const armorId = trialPartId('changbai_canxian', 'ARMOR')
    const report = fight({ ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']), armorId }, {
      player: { ...player, level: 32, realmTier: 3, stats: { ...player.stats, con: 65 } },
      objective: exam.objective, enemyMain: exam.opponent, rng: () => 0.99,
    })
    const pulses = effectEvents(report, 'baituo_meridian_trial')
    expect(report.winner).toBe('ALLY')
    expect(pulses).toHaveLength(5)
    expect(pulses[0].shieldAbsorbed).toBeGreaterThan(0)
    expect(pulses.map((pulse) => (pulse.shieldAbsorbed ?? 0) - pulse.hpDelta!)).toEqual([900, 1100, 1300, 1500, 1700])
    expect(effectEvents(report, armorId).some((event) => event.hpDelta === 40)).toBe(true)
  })

  it.each([['SEAL', '封穴'], ['STUN', '点穴眩晕'], ['CONFUSION', '心神混乱']] as const)('心法按控制类型判定 %s', (status, label) => {
    const options = {
      enemyMain: { ...enemy, combat: { statusPulse: { every: 1, lastRound: 1, name: '试招', rule: { status, rounds: 1 } } } },
      surviveRounds: 1, rng: () => 0.99,
    }
    const hasStatus = (report: BattleReportDTO) => report.events.some((event) => event.targetSlot === 'ALLY_MAIN' && event.statusApplied === label)
    expect(hasStatus(fight({}, options))).toBe(true)
    expect(hasStatus(fight({ innerSkillId: skillId }, options))).toBe(status === 'CONFUSION')
  })

  it('外功与绝技按实扣吸血，盾全挡时不回，和九阴四件取高', () => {
    const gear = equipped('jiuyin_baigu', ['HEAD', 'ARMOR', 'WRIST', 'ACC'])
    const patch = { ...gear, innerSkillId: skillId, ultSkillId: 'yiyang_zhi', weaponId: trialPartId('henglian_tongjia', 'WEAPON') }
    const combatant = { ...player, stats: { ...player.stats, con: 60 } }
    const opponent = { ...enemy, hp: 100000, atk: 1000 }
    const report = fight(patch, { player: combatant, enemyMain: opponent, surviveRounds: 4, rng: () => 0.99 })
    const heals = effectEvents(report, skillId).filter((event) => (event.hpDelta ?? 0) > 0)
    expect(heals.length).toBeGreaterThan(1)
    const casts = heals.map((heal) => {
      const prior = report.events.slice(0, report.events.indexOf(heal))
      const cast = prior.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot === 'ALLY_MAIN').at(-1)!
      const missing = prior.reduce((lost, event) => event.targetSlot === 'ALLY_MAIN' ? lost - (event.hpDelta ?? 0) : lost, 0)
      expect(heal).toMatchObject({ targetSlot: 'ALLY_MAIN', hpDelta: Math.min(missing, Math.round(-cast.hpDelta! * 0.3)) })
      return cast
    })
    expect(casts.some((event) => event.isUlt)).toBe(true)
    expect(casts.some((event) => !event.isUlt)).toBe(true)
    expect(effectEvents(report, 'jiuyin_baigu').some((event) => (event.hpDelta ?? 0) > 0)).toBe(false)

    const blocked = fight(patch, { player: combatant, enemyMain: { ...opponent, combat: { openingShield: 100000 } }, rng: () => 0.99 })
    expect(effectEvents(blocked, patch.weaponId).some((event) => event.hpDelta === -45)).toBe(true)
    expect(effectEvents(blocked, skillId).filter((event) => (event.hpDelta ?? 0) > 0)).toEqual([])
  })

  it('少室山只有配入蛤蟆功的实际出手玩家吸血', () => {
    const character = { ...player, level: 32, realmTier: 3, stats: { ...player.stats, str: 35, con: 100 } }
    const fighter = (id: string, innerSkillId: string | null = null) => ({
      player: { ...character, id }, loadout: { ...loadout, innerSkillId }, learnedSkills: {},
    })
    const report = simulateShaoshiRaid('raid-nijiuyin-hama', [fighter('a'), fighter('b', skillId), fighter('c')], () => 0.20)
    const heals = effectEvents(report, skillId).filter((event) => (event.hpDelta ?? 0) > 0)
    expect(heals.length).toBeGreaterThan(0)
    expect(heals.every((event) => event.actorSlot === 'ALLY_LEFT' && event.targetSlot === 'ALLY_LEFT')).toBe(true)
  })
})

describe('九阴心法、逆转九阴与狂生剑', () => {
  const action = (report: BattleReportDTO, round: number) =>
    report.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST' && event.round === round)
  const tagged = (event: BattleEventDTO | undefined, text: string) =>
    event?.segments.some((segment) => segment.type === 'tag' && segment.text.includes(text)) ?? false

  it('九阴总纲保留基础气血倍率，面板与少室山只增强实际配用者', () => {
    const gear = { ...loadout, accId: 'iron_bagua' }
    const equipped = { ...gear, innerSkillId: 'jiuyin_zonggang' }
    const base = computeDerivedStats(player, gear)
    const enhanced = computeDerivedStats(player, equipped)
    expect(enhanced).toMatchObject({
      maxHp: Math.round((320 + 85 + 10 * 46) * 1.25 + 350),
      maxMp: Math.round(base.maxMp * 1.25), atk: Math.round(base.atk * 1.25),
      def: Math.round(base.def * 1.25), speed: Math.round(base.speed * 1.25),
    })
    const solo = fight(equipped, { surviveRounds: 1 })
    expect(mainUnit(solo)).toMatchObject({ maxHp: enhanced.maxHp, maxMp: enhanced.maxMp })
    expect(mainCast(solo).hpDelta!).toBeLessThan(mainCast(fight(gear, { surviveRounds: 1 })).hpDelta!)
    const report = simulateShaoshiRaid('raid-jiuyin', [
      { player, loadout: gear, learnedSkills: {} },
      { player: { ...player, id: 'equipped' }, loadout: equipped, learnedSkills: {} },
      { player: { ...player, id: 'unequipped' }, loadout: gear, learnedSkills: {} },
    ], () => 0.99)
    expect(report.units.filter((unit) => unit.slot.startsWith('ALLY')).map((unit) => unit.maxMp))
      .toEqual([base.maxMp, enhanced.maxMp, base.maxMp])
    expect(report.events.find((event) => event.type === 'SKILL_CAST')).toMatchObject({ actorSlot: 'ALLY_LEFT' })
  })

  it.each([['STUN', '点穴眩晕'], ['SEAL', '封穴']] as const)('逆转九阴在 %s 中只保护实际施展的绝技', (status, label) => {
    const options = {
      enemyMain: { ...enemy, atk: 65, combat: { def: 300,
        statusPulse: { every: 3, lastRound: 3, name: '试招点穴', rule: { status, rounds: 2 } } } },
      surviveRounds: 6,
    }
    const report = fight({ ultSkillId: 'nizhuan_jiuyin' }, options)
    expect(report.events).toContainEqual(expect.objectContaining({ round: 3, statusApplied: label, statusRounds: 2 }))
    expect(action(report, 4)?.skillId).toBe(status === 'STUN' ? undefined : 'bare_hands')
    const cast = action(report, 5)
    expect(cast).toMatchObject({ skillId: 'nizhuan_jiuyin', rageDelta: -85, mpDelta: -53 })
    expect(tagged(cast, '穿透 180 点防御')).toBe(true)
    expect(tagged(cast, '免疫本次点穴控制')).toBe(true)
    const ended = report.events.find((event) => event.statusRemoved === label)!
    expect(ended.round).toBe(5)
    expect(report.events.indexOf(ended)).toBeGreaterThan(report.events.indexOf(cast!))
    expect(tagged(action(report, 6), '免疫本次点穴控制')).toBe(false)
    if (status === 'STUN') expect(action(fight({ ultSkillId: 'yiyang_zhi' }, options), 5)).toBeUndefined()
  })

  it.each(['ULT_LOCK', 'CONFUSION'] as const)('逆转九阴仍受 %s 限制', (status) => {
    const report = fight({ ultSkillId: 'nizhuan_jiuyin' }, {
      enemyMain: { ...enemy, atk: 65, combat: { statusPulse: { every: 3, lastRound: 3, name: '试招控制', rule: { status, rounds: 2 } } } },
      surviveRounds: 6,
    })
    expect(action(report, 5)?.skillId).toBe(status === 'ULT_LOCK' ? 'bare_hands' : undefined)
    expect(action(report, 6)).toMatchObject({ skillId: 'nizhuan_jiuyin', rageDelta: -85 })
  })

  it('狂生剑按 40% 阈值逆转历练第 28 关实际前排的阵型招架，狂暴增伤三回合', () => {
    const stage = trialStageOf(28)!
    const sword = trialPartId('niluan_jiuyin', 'WEAPON')
    const scenario = (firstRoll: number) => {
      let rolls = 0
      return fight({ weaponId: sword }, {
        player: { ...player, stats: { ...player.stats, agi: 9 } },
        enemyMain: { ...stage.boss, atk: 45, mp: 500 },
        enemyGuards: stage.guards!.map((guard) => ({ ...guard, atk: 30 })),
        surviveRounds: 4, rng: () => rolls++ === 0 ? firstRoll : 0.99,
      })
    }
    const missed = scenario(0.4)
    const reversed = scenario(0.399)
    expect(effectEvents(missed, sword).some((event) => event.statusApplied === '逆脉狂暴')).toBe(false)
    expect(effectEvents(reversed, sword).filter((event) => event.statusApplied || event.statusRemoved)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', statusRemoved: '阵型招架' },
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', statusApplied: '逆脉狂暴', statusRounds: 3 },
      { round: 3, targetSlot: 'ALLY_MAIN', statusRemoved: '逆脉狂暴' },
    ])
    for (const round of [1, 2, 3]) {
      const actual = action(reversed, round)
      const extra = action(missed, round)!.hpDelta! - actual!.hpDelta!
      expect(extra).toBeGreaterThan(0)
      expect(tagged(actual, `攻击 +30% · 增伤 +${extra.toLocaleString()}`)).toBe(true)
    }
    expect(action(reversed, 4)?.hpDelta).toBe(action(missed, 4)?.hpDelta)
    expect(tagged(action(missed, 2), '无视招架')).toBe(true)
  })

  it('狂生剑绕过实际招架，护盾照常吸收，无可逆转的增益时不掷骰', () => {
    const sword = trialPartId('niluan_jiuyin', 'WEAPON')
    const rng = vi.fn(() => 0)
    const report = fight({ weaponId: sword }, {
      enemyMain: { ...enemy, combat: { parry: 100, openingShield: 5_000 } }, surviveRounds: 1, rng,
    })
    expect(rng).not.toHaveBeenCalled()
    expect(mainCast(report)).toMatchObject({ hitResult: 'HIT', hpDelta: 0, shieldAbsorbed: expect.any(Number) })
    expect(tagged(mainCast(report), '无视招架')).toBe(true)
    expect(effectEvents(report, sword).map((event) => event.hpDelta)).toEqual([-180])
  })

  it('历练取得狂生剑后，通过配装再次挑战第 28 关可实际逆转阵型招架', () => {
    const store = newStore('DEMO')
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0)
    const sword = trialPartId('niluan_jiuyin', 'WEAPON')
    try {
      store.player.level = 30
      Object.assign(store.player.stats, { str: 50, con: 45, agi: 6 })
      store.trial.maxStageId = 30
      store.trial.rewardedStageIds.push(28, 30)
      store.trial.stageHours['28'] = TRIAL_PATROL_HOURS[28]
      store.updateLoadout(loadout)
      store.ownedItemIds.push(sword)
      store.equipItem(sword)
      expect(store.currentLoadout.weaponId).toBe(sword)
      store.challengeTrialStage(28)
      expect(effectEvents(store.activeBattle!, sword)).toContainEqual(expect.objectContaining({
        round: 1, targetSlot: 'ENEMY_LEFT', statusRemoved: '阵型招架',
      }))
    } finally {
      rng.mockRestore()
      store.closeBattleStage()
    }
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
    expect(computeDerivedStats(player, { ...loadout, ...gear }).speed).toBe(227)
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
    expect(shot).toMatchObject({ round: 1, targetSlot: 'ENEMY_MAIN', skillName: '鹰击长空', isUlt: false, hpDelta: -729 })
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
