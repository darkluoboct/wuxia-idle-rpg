import { describe, expect, it, vi } from 'vitest'
import { STORY_CHAPTERS } from '@/config/storyData'
import type { BattleEventDTO, BattleReportDTO, LoadoutPresetDTO } from '@/network/protocol'
import {
  computeCompanionDerivedStats,
  computeDerivedStats,
  incomingDamage,
  innerPressure,
  simulatePlayerDuel,
  simulateShaoshiRaid,
  strikeDamage,
} from '../../shared/battle.ts'
import { applyPeriodicOnHit, resolveBattleLoadout, resolvePoisonBurst, type EnemyBattleState } from '../../shared/battleEffects.ts'
import { EQUIP_SLOT_META } from '../../shared/combatMeta.ts'
import { ITEMS, SECTS, SKILLS } from '../../shared/gameData.ts'
import { GAIBANG_DIVISION, JUNSHAN_EXAM } from '../../shared/gaibang.ts'
import { QUANZHEN_GUARD_EXAM } from '../../shared/quanzhen.ts'
import { TAOHUA_RESCUE_EXAM } from '../../shared/taohua.ts'
import { cultivationRate } from '../../shared/player.ts'
import {
  effectiveMartialStats,
  equippedMartialSkills,
  hasMartialFreedom,
  hasWandererMastery,
  martialEffectiveness,
  WANDERER_MASTERY,
} from '../../shared/martialSchools.ts'
import { skillPowerAtMastery } from '../../shared/skillMastery.ts'
import {
  activeSectEquipmentSets,
  SECT_EQUIPMENT_SETS,
  sectEquipmentPartId,
  sectEquipmentRewardIds,
  WANDERER_EQUIPMENT,
  wandererEquipmentBonus,
} from '../../shared/sectEquipment.ts'
import { TRIAL_PATROL_HOURS, trialPartId, trialStageOf } from '../../shared/trialStages.ts'
import { newStore } from './helpers'
import { player, loadout, enemy, baseCompanion, fight, effectEvents, mainUnit, mainCast, equipped } from './battleFixtures'

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
