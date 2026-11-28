import { describe, expect, it } from 'vitest'
import {
  computeDerivedStats,
  simulatePlayerDuel,
  simulateServerBattle,
  simulateShaoshiRaid,
} from '../../shared/battle.ts'
import { combatRampStacks, resolveBattleLoadout } from '../../shared/battleEffects.ts'
import { SECTS, SKILLS } from '../../shared/gameData.ts'
import { martialEffectiveness } from '../../shared/martialSchools.ts'
import { cultivationRate, createStarterCharacter } from '../../shared/player.ts'
import {
  getSkillMasteryCap,
  jiuyinZonggangHpMultiplier,
  masteryPassiveScale,
  resolveSkillForMastery,
  skillArmorPenetrationAtMastery,
  skillPowerAtMastery,
  skillShieldRendAtMastery,
  skillUltAreaMaxMpAtMastery,
  skillUpgradeCost,
} from '../../shared/skillMastery.ts'
import {
  accrueWandererNotes,
  drawWandererNotes,
  eligibleWandererNotes,
  resetWandererNotes,
  SHICHEN,
  WANDERER_NOTE_MAX,
  WANDERER_NOTE_MS,
} from '../../shared/sectDaily.ts'
import { sectEquipmentPartId, WANDERER_EQUIPMENT } from '../../shared/sectEquipment.ts'
import { grantJiangnanGraduationGift, JIANGNAN_GRADUATION_GIFT, sectSkillRewardIds } from '../../shared/sectProgress.ts'
import type { BattleReportDTO, LoadoutPresetDTO, PlayerDTO, StanceType } from '../../shared/protocol.ts'
import { IDLE_CAP_MS, trialPartId } from '../../shared/trialStages.ts'
import { newStore } from './helpers'

const baseStarter = createStarterCharacter({ id: 'balance_hero', nickname: '试招少侠', avatarId: 'hero_sword' }, 0)

const basePlayer: PlayerDTO = {
  ...baseStarter.player,
  level: 10,
  realmTier: 1,
  stats: { str: 30, con: 30, agi: 30, intStat: 30, luck: 30, karma: 0 },
}

const emptyLoadout: LoadoutPresetDTO = {
  presetIdx: 1,
  name: '试招预设',
  stance: 'FIERCE',
  innerSkillId: null,
  outerSkillId: null,
  lightSkillId: null,
  ultSkillId: null,
  leftCompanionId: null,
  rightCompanionId: null,
  weaponId: null,
  armorId: null,
  headId: null,
  wristId: null,
  beltId: null,
  bootsId: null,
  accId: null,
  relicBookId: null,
}

const dummyEnemy = {
  name: '木人桩',
  title: '试招靶子',
  portrait: 'bandit' as const,
  hp: 20_000,
  atk: 120,
  mp: 800,
  stance: 'FIERCE' as const,
}

const calmEnv = { night: false, rain: false, swamp: false }
const BENCH_STANCES: readonly StanceType[] = ['FIERCE', 'TAICHI', 'AGILE']

function seedRng(seed: number) {
  let state = (seed >>> 0) || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function makeSectPreset(
  sectId: string | null,
  opts: {
    name: string
    stats: PlayerDTO['stats']
    loadout: Partial<LoadoutPresetDTO>
    gaibangBranch?: PlayerDTO['gaibangBranch']
  },
) {
  const sect = sectId ? SECTS.find((entry) => entry.id === sectId) : undefined
  const learnedSkills: Record<string, number> = {}
  for (const field of ['innerSkillId', 'outerSkillId', 'lightSkillId', 'ultSkillId'] as const) {
    const id = opts.loadout[field]
    if (id) learnedSkills[id] = getSkillMasteryCap(SKILLS[id].tier, 30)
  }
  const player: PlayerDTO = {
    ...baseStarter.player,
    id: `bench_${sectId ?? 'wanderer'}`,
    nickname: opts.name,
    level: 30,
    realmTier: 3,
    currentSectId: sectId,
    sectRank: sectId ? 5 : 0,
    gaibangBranch: opts.gaibangBranch ?? undefined,
    currentMapId: 'linan_city',
    stats: opts.stats,
  }
  if (sect) {
    for (const id of sectSkillRewardIds(sect, 5)) {
      const cap = getSkillMasteryCap(SKILLS[id].tier, 30)
      learnedSkills[id] = Math.max(learnedSkills[id] ?? 0, cap)
    }
  }
  return {
    player,
    loadout: { ...emptyLoadout, ...opts.loadout },
    learnedSkills,
  }
}

describe('门派效力、新武学、新套装与散人/武馆/补领机制', () => {
  it('martialEffectiveness 正确区分 105 / 100 / 85 / 80 / 70 效力档位', () => {
    const quanzhen = { currentSectId: 'quanzhen', graduatedSectIds: ['baituo'] }
    const taohua = { currentSectId: 'taohua', graduatedSectIds: ['quanzhen'] }
    const wanderer = { currentSectId: null, graduatedSectIds: ['quanzhen'] }

    // 本门/专属 105%（即使穿戴逆乱六件自由效力也保留本门契合 105%）
    expect(martialEffectiveness(SKILLS.xiantian_gong, quanzhen)).toBe(105)
    expect(martialEffectiveness(SKILLS.xiantian_gong, quanzhen, true)).toBe(105)
    expect(martialEffectiveness(SKILLS.beidou_jianfa, quanzhen)).toBe(105)
    expect(martialEffectiveness(SKILLS.tiezhang_cuibei, { currentSectId: 'tiezhang', graduatedSectIds: [] })).toBe(105)
    expect(martialEffectiveness(SKILLS.xiantian_yiyang, { currentSectId: 'yideng', graduatedSectIds: [] })).toBe(105)

    // 自由 / 散人 / 江湖通传 / 非超模通用招 100%
    expect(martialEffectiveness(SKILLS.xiantian_gong, wanderer)).toBe(100)
    expect(martialEffectiveness(SKILLS.nizhuan_jiuyin, taohua, true)).toBe(100)
    expect(martialEffectiveness(SKILLS.wuluo_qingyan, taohua)).toBe(100)

    // 出师后红品镇派（或先天功）在他派 80%（优先级高于中立 85% / 阵营 70%）
    expect(martialEffectiveness(SKILLS.xiantian_gong, taohua)).toBe(80)
    expect(martialEffectiveness(SKILLS.nijiuyin_hama_gong, quanzhen)).toBe(80)

    // 中立门派（桃花/铁掌）跨门携带非出师且非本门的橙/红品 INNER / ULT 降为 85%
    expect(martialEffectiveness(SKILLS.nijiuyin_hama_gong, taohua)).toBe(85)
    expect(martialEffectiveness(SKILLS.kanglong_youhui, taohua)).toBe(85)
    expect(martialEffectiveness(SKILLS.kurong_chunyang, { currentSectId: 'tiezhang', graduatedSectIds: [] })).toBe(85)
    // 中立门派跨门携带 OUTER / LIGHT 仍为 100%
    expect(martialEffectiveness(SKILLS.xianglong_18, taohua)).toBe(100)
    expect(martialEffectiveness(SKILLS.shunxi_qianli, taohua)).toBe(100)

    // 正邪冲突 70%（未出师）
    expect(martialEffectiveness(SKILLS.hama_gong, { currentSectId: 'quanzhen', graduatedSectIds: [] })).toBe(70)
    expect(martialEffectiveness(SKILLS.yiyang_zhi, { currentSectId: 'baituo', graduatedSectIds: [] })).toBe(70)
  })

  it('逆九阴·蛤蟆功的防御惩罚不随门派效力缩水，且总防御不为负', () => {
    const lowEff = { ...basePlayer, currentSectId: 'quanzhen', graduatedSectIds: [] }
    const resolved = resolveBattleLoadout({ ...emptyLoadout, innerSkillId: 'nijiuyin_hama_gong' }, lowEff)
    const penaltyEffect = resolved.effects.find((effect) => effect.sourceId === 'nijiuyin_hama_gong' && effect.kind === 'STAT_BONUS')
    expect(penaltyEffect).toMatchObject({ stats: { defPercent: -20 } })

    const glassCanon = { ...basePlayer, currentSectId: 'baituo', stats: { ...basePlayer.stats, con: 0 } }
    const derived = computeDerivedStats(glassCanon, {
      ...emptyLoadout,
      innerSkillId: 'nijiuyin_hama_gong',
      accId: null,
    })
    expect(derived.def).toBeGreaterThanOrEqual(0)
  })

  it('9 门新增武学：北斗剑招架回血、一气化三清真伤及标签隔离、铁掌摧碑、一灯南帝指与枯荣禅毒清', () => {
    // 1. 全真天罡北斗剑：招架+10 & 招架回防御 22% 气血（intStat=50 时首回合 (53+50)%100=3 < 招架率，必触发招架）
    const qzBuild = {
      ...emptyLoadout,
      outerSkillId: 'beidou_jianfa',
      weaponId: trialPartId('quanzhen_beidou', 'WEAPON'),
    }
    const parryReport = simulateServerBattle({
      sceneTitle: '北斗招架回血',
      mode: 'SOLO_STORY',
      player: { ...basePlayer, currentSectId: 'quanzhen', stats: { ...basePlayer.stats, agi: 0, con: 60, intStat: 50 } },
      loadout: qzBuild,
      enemyMain: { ...dummyEnemy, atk: 500 },
      surviveRounds: 1,
      rng: () => 0.99,
    })
    expect(parryReport.events.some((event) => event.effectSourceId === 'beidou_jianfa' && (event.hpDelta ?? 0) > 0)).toBe(true)

    // 2. 一气化三清：群攻按 maxMp 11% 真伤 + 降攻 15% + 标签「三清剑罡」，且不会污染其他绝技
    const yqReport = simulateServerBattle({
      sceneTitle: '一气化三清',
      mode: 'SOLO_STORY',
      player: { ...basePlayer, currentSectId: 'quanzhen', stats: { ...basePlayer.stats, con: 80 } },
      loadout: { ...emptyLoadout, ultSkillId: 'yiqi_huasanqing' },
      enemyMain: dummyEnemy,
      enemyGuards: [{ ...dummyEnemy, name: '乙桩' }],
      surviveRounds: 2,
      rng: () => 0.99,
    })
    const sanqingTags = yqReport.events.filter((event) =>
      event.segments.some((seg) => seg.type === 'tag' && seg.text.includes('三清剑罡')),
    )
    expect(sanqingTags).toHaveLength(2)
    expect(yqReport.events.filter((event) => event.effectSourceId === 'yiqi_huasanqing' && event.statusApplied === '攻击降低')).toHaveLength(2)

    // 3. 铁掌十三式·摧碑：45% 穿透 + 2.5 倍撕盾 + 重伤减疗 70% + 流血
    const tzReport = simulateServerBattle({
      sceneTitle: '铁掌摧碑',
      mode: 'SOLO_STORY',
      player: { ...basePlayer, currentSectId: 'tiezhang', stats: { ...basePlayer.stats, str: 80 } },
      loadout: { ...emptyLoadout, ultSkillId: 'tiezhang_cuibei' },
      enemyMain: { ...dummyEnemy, combat: { def: 300, openingShield: 5000 } },
      surviveRounds: 2,
      rng: () => 0.99,
    })
    const cuibeiCast = tzReport.events.find((event) => event.skillId === 'tiezhang_cuibei')!
    expect(cuibeiCast.segments.some((seg) => seg.type === 'tag' && seg.text.includes('穿透 120 点防御'))).toBe(true)
    expect(cuibeiCast.segments.some((seg) => seg.type === 'tag' && seg.text.includes('撕盾'))).toBe(true)
    expect(tzReport.events.some((event) => event.statusApplied === '重伤减疗')).toBe(true)
    expect(tzReport.events.some((event) => event.statusApplied === '流血')).toBe(true)

    // 4. 一灯南帝·纯阳枯荣禅（全队清毒 + 每2回合回8%血 + 先天一阳指 75% 穿透 + 封穴）
    const ydReport = simulateServerBattle({
      sceneTitle: '枯荣清毒与先天一阳指',
      mode: 'SOLO_STORY',
      player: { ...basePlayer, currentSectId: 'yideng', stats: { ...basePlayer.stats, con: 80 } },
      loadout: { ...emptyLoadout, innerSkillId: 'kurong_chunyang', ultSkillId: 'xiantian_yiyang', lightSkillId: 'tiannan_bufa', outerSkillId: 'yiyang_dianxue' },
      enemyMain: { ...dummyEnemy, atk: 50, combat: { def: 400, periodicOnHit: { status: 'snakeVenom', attackPercent: 50, rounds: 3 } } },
      surviveRounds: 3,
      rng: () => 0.99,
    })
    expect(ydReport.events.some((event) => event.statusApplied === '蛇奴毒雾')).toBe(true)
    expect(ydReport.events.some((event) => event.effectSourceId === 'kurong_chunyang' && event.statusRemoved === '蛇奴毒雾')).toBe(true)
    expect(ydReport.events.some((event) => event.effectSourceId === 'kurong_chunyang' && (event.hpDelta ?? 0) > 0)).toBe(true)
    const xtyyCast = ydReport.events.find((event) => event.skillId === 'xiantian_yiyang')!
    expect(xtyyCast.segments.some((seg) => seg.type === 'tag' && seg.text.includes('穿透 300 点防御'))).toBe(true)
    expect(ydReport.events.some((event) => event.effectSourceId === 'xiantian_yiyang' && event.statusApplied === '封穴')).toBe(true)
  })

  it('铁掌与一灯 6 套宗门装备及全真北斗护法 +15% 全队护盾加成正常生效', () => {
    // 铁掌五指峰玄铁套：外功翻倍撕盾 + 命中降防 15%
    const wuzhiLoadout: LoadoutPresetDTO = {
      ...emptyLoadout,
      armorId: sectEquipmentPartId('sect_tiezhang_wuzhi', 'ARMOR'),
      wristId: sectEquipmentPartId('sect_tiezhang_wuzhi', 'WRIST'),
      beltId: sectEquipmentPartId('sect_tiezhang_wuzhi', 'BELT'),
      headId: sectEquipmentPartId('sect_tiezhang_wuzhi', 'HEAD'),
    }
    const tzGearReport = simulateServerBattle({
      sceneTitle: '铁掌五指峰套',
      mode: 'SOLO_STORY',
      player: { ...basePlayer, currentSectId: 'tiezhang', stats: { ...basePlayer.stats, str: 60 } },
      loadout: wuzhiLoadout,
      enemyMain: { ...dummyEnemy, combat: { def: 300, openingShield: 5000 } },
      surviveRounds: 1,
      rng: () => 0.99,
    })
    const tzCast = tzGearReport.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!
    expect((tzCast.shieldDelta ?? 0) / (tzCast.shieldAbsorbed ?? 1)).toBeCloseTo(-2, 1)
    expect(tzGearReport.events.some((event) => event.effectSourceId === 'sect_tiezhang_wuzhi' && event.statusApplied === '防御降低')).toBe(true)

    // 一灯南帝慈悲法相套：全队防御+12%，常规外功穿透 20% 防御
    const cibeiLoadout: LoadoutPresetDTO = {
      ...emptyLoadout,
      armorId: sectEquipmentPartId('sect_yideng_cibei', 'ARMOR'),
      wristId: sectEquipmentPartId('sect_yideng_cibei', 'WRIST'),
      accId: sectEquipmentPartId('sect_yideng_cibei', 'ACC'),
      headId: sectEquipmentPartId('sect_yideng_cibei', 'HEAD'),
    }
    const ydGearReport = simulateServerBattle({
      sceneTitle: '南帝慈悲法相套',
      mode: 'SOLO_STORY',
      player: { ...basePlayer, currentSectId: 'yideng' },
      loadout: cibeiLoadout,
      enemyMain: { ...dummyEnemy, combat: { def: 300 } },
      surviveRounds: 1,
      rng: () => 0.99,
    })
    const ydCast = ydGearReport.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!
    expect(ydCast.segments.some((seg) => seg.type === 'tag' && seg.text.includes('穿透 60 点防御'))).toBe(true)

    // 全真北斗护法真人套 +15% 全队护盾在少室山可作用于全队护盾
    const qzArmorLoadout: LoadoutPresetDTO = {
      ...emptyLoadout,
      armorId: sectEquipmentPartId('sect_quanzhen_hufa', 'ARMOR'),
      weaponId: sectEquipmentPartId('sect_quanzhen_hufa', 'WEAPON'),
      accId: sectEquipmentPartId('sect_quanzhen_hufa', 'ACC'),
      headId: sectEquipmentPartId('sect_quanzhen_hufa', 'HEAD'),
    }
    const raid = simulateShaoshiRaid('hufa-team-shield', [
      { player: { ...basePlayer, id: 'p1', currentSectId: 'quanzhen' }, loadout: qzArmorLoadout, learnedSkills: {} },
      { player: { ...basePlayer, id: 'p2', currentSectId: 'quanzhen' }, loadout: emptyLoadout, learnedSkills: {} },
      { player: { ...basePlayer, id: 'p3', currentSectId: 'quanzhen' }, loadout: emptyLoadout, learnedSkills: {} },
    ], () => 0.99, calmEnv)
    const p1Unit = raid.units.find((u) => u.slot === 'ALLY_MAIN')!
    const hufaShield = raid.events.find((event) => event.effectSourceId === 'sect_quanzhen_hufa' && (event.shieldDelta ?? 0) > 0)
    expect(hufaShield?.shieldDelta).toBe(Math.round(Math.round(p1Unit.maxMp * 0.3) * 1.15))
  })

  it('旧档补领、江南武馆 3 阶出师礼与散人江湖散记工作正常', () => {
    // 1. 旧档补领：同时补 missing 装备和 missing sectSkillRewardIds，且幂等
    const tiezhang = SECTS.find((entry) => entry.id === 'tiezhang')!
    const store = newStore('DEMO')
    store.player.currentSectId = 'tiezhang'
    store.player.sectRank = 5
    store.learnedSkills.tiezhang_gong = 3
    const expectedSkills = sectSkillRewardIds(tiezhang, 5)
    expect(store.unclaimedSectSkills.length).toBeGreaterThan(0)
    store.claimSectEquipment()
    for (const id of expectedSkills) {
      expect(store.learnedSkills[id]).toBeGreaterThanOrEqual(1)
    }
    expect(store.learnedSkills.tiezhang_gong).toBe(3)
    expect(store.unclaimedSectEquipment).toEqual([])
    expect(store.unclaimedSectSkills).toEqual([])
    const countBefore = store.ownedItemIds.length
    store.claimSectEquipment()
    expect(store.ownedItemIds.length).toBe(countBefore)

    // 2. 江南武馆 3 阶出师礼
    const heroStats = { ...basePlayer.stats }
    const pills: Record<string, number> = {}
    const flags: string[] = []
    expect(grantJiangnanGraduationGift({ stats: heroStats }, pills, 'jiangnan_wuguan', 2, flags)).toBeUndefined()
    expect(pills[JIANGNAN_GRADUATION_GIFT.pillId]).toBeUndefined()
    const gift = grantJiangnanGraduationGift({ stats: heroStats }, pills, 'jiangnan_wuguan', 3, flags)
    expect(gift).toEqual({ pillId: 'tongmai_dan', pillQty: 2, str: 2, con: 2 })
    expect(pills.tongmai_dan).toBe(2)
    expect(heroStats.str).toBe(basePlayer.stats.str + 2)
    expect(heroStats.con).toBe(basePlayer.stats.con + 2)
    expect(grantJiangnanGraduationGift({ stats: heroStats }, pills, 'jiangnan_wuguan', 5, flags)).toBeUndefined()

    // 3. 散人江湖散记：12 时辰各有 >= 2 条文案，24 小时上限，400~600 银两 & 15% 掉率，拜师清零
    for (const sc of SHICHEN) {
      expect(eligibleWandererNotes(sc).length).toBeGreaterThanOrEqual(2)
    }
    const wanderer = { currentSectId: null as string | null, idleOff: undefined as PlayerDTO['idleOff'], silver: 0, wandererNotes: undefined as PlayerDTO['wandererNotes'] }
    accrueWandererNotes(wanderer, IDLE_CAP_MS + 10_000_000)
    expect(wanderer.wandererNotes?.ms).toBe(IDLE_CAP_MS)
    const stock = { herbs: {}, fragments: {} }
    const drawn = drawWandererNotes(wanderer, stock, { luoying_zhang: 2 }, Date.UTC(2026, 0, 1, 12), seedRng(42))!
    expect(drawn.count).toBe(WANDERER_NOTE_MAX)
    expect(drawn.entries).toHaveLength(WANDERER_NOTE_MAX)
    for (const entry of drawn.entries) {
      expect(entry.silver).toBeGreaterThanOrEqual(400)
      expect(entry.silver).toBeLessThanOrEqual(600)
    }
    expect(wanderer.wandererNotes?.ms).toBe(IDLE_CAP_MS - WANDERER_NOTE_MAX * WANDERER_NOTE_MS)
    resetWandererNotes(wanderer)
    expect(wanderer.wandererNotes).toBeUndefined()
    accrueWandererNotes({ ...wanderer, currentSectId: 'gaibang' }, 3_600_000)
    expect(wanderer.wandererNotes).toBeUndefined()
  })
})

describe('Lv.30 七派与散人基准平衡性仿真校验', () => {
  const builds = [
    makeSectPreset('gaibang', {
      name: '丐帮长老',
      gaibangBranch: 'WUYI',
      stats: { str: 70, con: 55, agi: 35, intStat: 30, luck: 30, karma: 100 },
      loadout: {
        stance: 'FIERCE',
        innerSkillId: 'huntian_qigong',
        outerSkillId: 'xianglong_18',
        lightSkillId: 'xiaoyao_you',
        ultSkillId: 'feilong_zaitian',
        weaponId: trialPartId('huanghe_sigui', 'WEAPON'),
        armorId: sectEquipmentPartId('sect_gaibang_zhanglao', 'ARMOR'),
        beltId: sectEquipmentPartId('sect_gaibang_zhanglao', 'BELT'),
        accId: sectEquipmentPartId('sect_gaibang_zhanglao', 'ACC'),
        wristId: sectEquipmentPartId('sect_gaibang_zhanglao', 'WRIST'),
      },
    }),
    makeSectPreset('quanzhen', {
      name: '全真护法',
      stats: { str: 40, con: 75, agi: 30, intStat: 45, luck: 30, karma: 100 },
      loadout: {
        stance: 'TAICHI',
        innerSkillId: 'xiantian_gong',
        outerSkillId: 'beidou_jianfa',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'yiqi_huasanqing',
        weaponId: sectEquipmentPartId('sect_quanzhen_hufa', 'WEAPON'),
        armorId: sectEquipmentPartId('sect_quanzhen_hufa', 'ARMOR'),
        accId: sectEquipmentPartId('sect_quanzhen_hufa', 'ACC'),
        headId: sectEquipmentPartId('sect_quanzhen_hufa', 'HEAD'),
        relicBookId: 'beidou_formation_book',
      },
    }),
    makeSectPreset('taohua', {
      name: '桃花圣客',
      stats: { str: 35, con: 45, agi: 55, intStat: 55, luck: 30, karma: 0 },
      loadout: {
        stance: 'AGILE',
        innerSkillId: 'jiuyin_taohua',
        outerSkillId: 'yuxiao_jianfa',
        lightSkillId: 'qimen_bufa',
        ultSkillId: 'bihai_chaosheng',
        weaponId: 'biyu_xiao',
        armorId: sectEquipmentPartId('sect_taohua_yibo', 'ARMOR'),
        accId: sectEquipmentPartId('sect_taohua_yibo', 'ACC'),
        bootsId: sectEquipmentPartId('sect_taohua_yibo', 'BOOTS'),
        wristId: sectEquipmentPartId('sect_taohua_yibo', 'WRIST'),
      },
    }),
    makeSectPreset('baituo', {
      name: '白驼少主',
      stats: { str: 45, con: 65, agi: 45, intStat: 35, luck: 30, karma: -100 },
      loadout: {
        stance: 'FIERCE',
        innerSkillId: 'nijiuyin_hama_gong',
        outerSkillId: 'lingshe_quan',
        lightSkillId: 'shunxi_qianli',
        ultSkillId: 'nizhuan_jiuyin',
        weaponId: 'lingshe_zhang',
        armorId: sectEquipmentPartId('sect_baituo_shaozhuang', 'ARMOR'),
        wristId: sectEquipmentPartId('sect_baituo_shaozhuang', 'WRIST'),
        accId: sectEquipmentPartId('sect_baituo_shaozhuang', 'ACC'),
        headId: sectEquipmentPartId('sect_baituo_shaozhuang', 'HEAD'),
      },
    }),
    makeSectPreset('tiezhang', {
      name: '铁掌帮主',
      stats: { str: 75, con: 55, agi: 30, intStat: 30, luck: 30, karma: 0 },
      loadout: {
        stance: 'FIERCE',
        innerSkillId: 'tiezhang_lianggu',
        outerSkillId: 'yinyang_mo',
        lightSkillId: 'shuishang_piao',
        ultSkillId: 'tiezhang_cuibei',
        weaponId: trialPartId('huanghe_sigui', 'WEAPON'),
        armorId: sectEquipmentPartId('sect_tiezhang_wuzhi', 'ARMOR'),
        wristId: sectEquipmentPartId('sect_tiezhang_wuzhi', 'WRIST'),
        beltId: sectEquipmentPartId('sect_tiezhang_wuzhi', 'BELT'),
        headId: sectEquipmentPartId('sect_tiezhang_wuzhi', 'HEAD'),
      },
    }),
    makeSectPreset('yideng', {
      name: '南帝禅宗',
      stats: { str: 40, con: 75, agi: 35, intStat: 40, luck: 30, karma: 100 },
      loadout: {
        stance: 'TAICHI',
        innerSkillId: 'kurong_chunyang',
        outerSkillId: 'yiyang_dianxue',
        lightSkillId: 'tiannan_bufa',
        ultSkillId: 'xiantian_yiyang',
        weaponId: trialPartId('huanghe_sigui', 'WEAPON'),
        armorId: sectEquipmentPartId('sect_yideng_cibei', 'ARMOR'),
        wristId: sectEquipmentPartId('sect_yideng_cibei', 'WRIST'),
        accId: sectEquipmentPartId('sect_yideng_cibei', 'ACC'),
        headId: sectEquipmentPartId('sect_yideng_cibei', 'HEAD'),
      },
    }),
    makeSectPreset(null, {
      name: '逍遥散人',
      stats: { str: 50, con: 50, agi: 50, intStat: 40, luck: 30, karma: 0 },
      loadout: {
        stance: 'AGILE',
        innerSkillId: 'hama_gong',
        outerSkillId: 'kongming_quan',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'yiyang_zhi',
        weaponId: trialPartId('huanghe_sigui', 'WEAPON'),
        armorId: WANDERER_EQUIPMENT.items[0].id,
        beltId: WANDERER_EQUIPMENT.items[1].id,
        wristId: sectEquipmentPartId('sect_gaibang_zhanglao', 'WRIST'),
        headId: sectEquipmentPartId('sect_baituo_shaozhuang', 'HEAD'),
        accId: sectEquipmentPartId('sect_taohua_yibo', 'ACC'),
      },
    }),
  ]

  function duelRounds(report: BattleReportDTO) {
    return report.events.reduce((max, event) => Math.max(max, event.round), 1)
  }

  it('闭关打坐真气效率：全真稳居第一', () => {
    const rates = builds.map((b) => ({
      id: b.player.currentSectId ?? 'wanderer',
      qi: cultivationRate(b.player, b.loadout),
    })).sort((a, b) => b.qi - a.qi)
    console.info('[Bench] Idle qi/hr:', rates.map((r) => `${r.id}:${r.qi}`).join(' | '))
    expect(rates[0].id).toBe('quanzhen')
    expect(rates[0].qi).toBeGreaterThan(rates[1].qi)
  })

  it('标准化木桩与特化 PVE 靶标定位表现符合门派特征', () => {
    const standardDummy = {
      name: '三十级木桩',
      title: '基准木人',
      portrait: 'bandit' as const,
      hp: 31_000,
      atk: 240,
      mp: 1_500,
      stance: 'FIERCE' as StanceType,
      combat: { def: 320 },
    }
    const roundsList = builds.map((b) => {
      const report = simulateServerBattle({
        sceneTitle: '标准木桩',
        mode: 'SOLO_STORY',
        player: b.player,
        loadout: b.loadout,
        learnedSkills: b.learnedSkills,
        enemyMain: standardDummy,
        rng: seedRng(100),
      })
      return { id: b.player.currentSectId ?? 'wanderer', winner: report.winner, rounds: duelRounds(report) }
    })
    console.info('[Bench] Standard PVE rounds:', roundsList.map((r) => `${r.id}:${r.rounds}r(${r.winner})`).join(' | '))
    for (const r of roundsList) {
      expect(r.winner).toBe('ALLY')
      expect(r.rounds).toBeGreaterThanOrEqual(4)
      expect(r.rounds).toBeLessThanOrEqual(6)
    }
    const maxR = Math.max(...roundsList.map((r) => r.rounds))
    const minR = Math.min(...roundsList.map((r) => r.rounds))
    expect(maxR - minR).toBeLessThanOrEqual(2)

    // 特化靶 1：高盾高甲铁桶首领 -> 铁掌/一灯处于第一梯队
    const tankBoss = {
      name: '玄铁石俑',
      title: '重盾高防',
      portrait: 'bandit' as const,
      hp: 8_500,
      atk: 240,
      mp: 1_200,
      stance: 'TAICHI' as StanceType,
      combat: { def: 750, openingShield: 5_000 },
    }
    const tankResults = builds.map((b) => {
      const report = simulateServerBattle({
        sceneTitle: '高盾高甲首领',
        mode: 'SOLO_STORY',
        player: b.player,
        loadout: b.loadout,
        learnedSkills: b.learnedSkills,
        enemyMain: tankBoss,
        rng: seedRng(200),
      })
      return { id: b.player.currentSectId ?? 'wanderer', winner: report.winner, rounds: duelRounds(report) }
    }).sort((a, b) => a.rounds - b.rounds)
    console.info('[Bench] Tank Boss rounds:', tankResults.map((r) => `${r.id}:${r.rounds}r(${r.winner})`).join(' | '))
    const bestTankRounds = tankResults[0].rounds
    expect(tankResults.find((r) => r.id === 'tiezhang')!.rounds).toBeLessThanOrEqual(bestTankRounds + 1)
    expect(tankResults.find((r) => r.id === 'yideng')!.rounds).toBeLessThanOrEqual(bestTankRounds + 1)

    // 特化靶 2：三毒多目标群战 -> 一灯/全真保命强，丐帮/桃花群清快
    const poisonMob = {
      name: '毒林蛇卫',
      title: '群体施毒',
      portrait: 'bandit' as const,
      hp: 4_500,
      atk: 260,
      mp: 1_200,
      stance: 'AGILE' as StanceType,
      combat: { def: 150, periodicOnHit: { status: 'snakeVenom' as const, attackPercent: 20, rounds: 3 } },
    }
    const mobResults = builds.map((b) => {
      const loadout = b.player.currentSectId === 'gaibang'
        ? { ...b.loadout, ultSkillId: 'tianxia_wugou' }
        : b.loadout
      const report = simulateServerBattle({
        sceneTitle: '三毒多目标',
        mode: 'SOLO_STORY',
        player: b.player,
        loadout,
        learnedSkills: b.learnedSkills,
        enemyMain: poisonMob,
        enemyGuards: [{ ...poisonMob, name: '左蛇卫' }, { ...poisonMob, name: '右蛇卫' }],
        rng: seedRng(300),
      })
      const ally = report.units.find((u) => u.slot === 'ALLY_MAIN')!
      const lost = report.events.reduce((s, e) => s + (e.targetSlot === 'ALLY_MAIN' ? (e.hpDelta ?? 0) : 0), 0)
      const hpPct = Math.max(0, Math.round((ally.hp + lost) * 100 / ally.maxHp))
      return { id: b.player.currentSectId ?? 'wanderer', winner: report.winner, rounds: duelRounds(report), hpPct }
    })
    console.info('[Bench] Poison/AoE Mob:', mobResults.map((r) => `${r.id}:${r.rounds}r/hp${r.hpPct}%(${r.winner})`).join(' | '))
    const fastestAoE = Math.min(...mobResults.filter((r) => r.winner === 'ALLY').map((r) => r.rounds))
    expect(mobResults.find((r) => r.id === 'taohua')!.rounds).toBeLessThanOrEqual(fastestAoE + 1)
    expect(mobResults.find((r) => r.id === 'gaibang')!.rounds).toBeLessThanOrEqual(fastestAoE + 1)
    expect(mobResults.find((r) => r.id === 'yideng')!.winner).toBe('ALLY')
    expect(mobResults.find((r) => r.id === 'quanzhen')!.winner).toBe('ALLY')
  })

  it('7x7 门派单挑循环赛总体胜率在 42%~58%，无克制对局超过 70%', () => {
    const ids = builds.map((b) => b.player.currentSectId ?? 'wanderer')
    const matrix: Record<string, Record<string, number>> = Object.fromEntries(ids.map((id) => [id, {}]))
    const totals: Record<string, { wins: number; games: number }> = Object.fromEntries(ids.map((id) => [id, { wins: 0, games: 0 }]))

    const ROUNDS_PER_STANCE = 20
    for (let i = 0; i < builds.length; i++) {
      for (let j = i + 1; j < builds.length; j++) {
        const a = builds[i]
        const b = builds[j]
        const idA = ids[i]
        const idB = ids[j]
        let winsA = 0
        for (const stance of BENCH_STANCES) {
          for (let s = 1; s <= ROUNDS_PER_STANCE; s++) {
            const snapA = { ...a, loadout: { ...a.loadout, stance } }
            const snapB = { ...b, loadout: { ...b.loadout, stance } }
            const r1 = simulatePlayerDuel({
              battleId: `duel-${idA}-${idB}-${stance}-${s}`,
              sceneTitle: '华山论剑',
              mode: 'PVP_HUASHAN',
              environment: calmEnv,
              lineup: [snapA, snapB],
              rng: seedRng(s * 97 + i * 13 + j * 31 + stance.length * 7),
            })
            if (r1.winner === 'ALLY') winsA++

            const r2 = simulatePlayerDuel({
              battleId: `duel-${idB}-${idA}-${stance}-${s}`,
              sceneTitle: '华山论剑',
              mode: 'PVP_HUASHAN',
              environment: calmEnv,
              lineup: [snapB, snapA],
              rng: seedRng(s * 97 + i * 13 + j * 31 + stance.length * 7 + 1),
            })
            if (r2.winner === 'ENEMY') winsA++
          }
        }
        const totalGames = BENCH_STANCES.length * ROUNDS_PER_STANCE * 2
        const rateA = winsA / totalGames
        const rateB = 1 - rateA
        matrix[idA][idB] = Math.round(rateA * 100)
        matrix[idB][idA] = Math.round(rateB * 100)
        totals[idA].wins += winsA
        totals[idA].games += totalGames
        totals[idB].wins += totalGames - winsA
        totals[idB].games += totalGames
      }
      matrix[ids[i]][ids[i]] = 50
    }

    console.info('\n[Bench] 7x7 Winrate Matrix (% row beats col):')
    console.info(`         ${ids.map((id) => id.padEnd(9)).join('')}| TOTAL`)
    for (const row of ids) {
      const cols = ids.map((col) => `${matrix[row][col]}%`.padEnd(9)).join('')
      const overall = Math.round((totals[row].wins / totals[row].games) * 1000) / 10
      console.info(`${row.padEnd(9)}${cols}| ${overall}%`)
    }

    for (const id of ids) {
      const winrate = totals[id].wins / totals[id].games
      expect(winrate, `${id} overall winrate ${(winrate * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.42)
      expect(winrate, `${id} overall winrate ${(winrate * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.58)
      for (const opp of ids) {
        if (opp === id) continue
        expect(matrix[id][opp], `${id} vs ${opp} = ${matrix[id][opp]}%`).toBeLessThanOrEqual(70)
      }
    }
  })

  it('反嫖毕业红武学验证：出师白驼+全真转投桃花混搭绝学对纯正单门派胜率 <= 55%', () => {
    const poacher = makeSectPreset('taohua', {
      name: '出师混搭客',
      stats: { str: 35, con: 65, agi: 45, intStat: 45, luck: 30, karma: 0 },
      loadout: {
        stance: 'TAICHI',
        innerSkillId: 'xiantian_gong',
        outerSkillId: 'xianglong_18',
        lightSkillId: 'qimen_bufa',
        ultSkillId: 'nizhuan_jiuyin',
        weaponId: 'biyu_xiao',
        armorId: sectEquipmentPartId('sect_taohua_yibo', 'ARMOR'),
        accId: sectEquipmentPartId('sect_taohua_yibo', 'ACC'),
        bootsId: sectEquipmentPartId('sect_taohua_yibo', 'BOOTS'),
        wristId: sectEquipmentPartId('sect_taohua_yibo', 'WRIST'),
      },
    })
    poacher.player.graduatedSectIds = ['baituo', 'quanzhen']
    for (const id of ['xiantian_gong', 'xianglong_18', 'qimen_bufa', 'nizhuan_jiuyin']) {
      poacher.learnedSkills[id] = getSkillMasteryCap(SKILLS[id].tier, 30)
    }

    const pureSects = builds.slice(0, 6)
    let wins = 0
    let games = 0
    const ROUNDS_PER_STANCE = 7
    for (let i = 0; i < pureSects.length; i++) {
      const opp = pureSects[i]
      for (const stance of BENCH_STANCES) {
        for (let s = 1; s <= ROUNDS_PER_STANCE; s++) {
          const pSnap = { ...poacher, loadout: { ...poacher.loadout, stance } }
          const oSnap = { ...opp, loadout: { ...opp.loadout, stance } }
          const r1 = simulatePlayerDuel({
            battleId: `poach-1-${i}-${stance}-${s}`,
            sceneTitle: '纯正与混搭之争',
            mode: 'PVP_HUASHAN',
            environment: calmEnv,
            lineup: [pSnap, oSnap],
            rng: seedRng(s * 73 + i * 19 + stance.length * 7),
          })
          if (r1.winner === 'ALLY') wins++
          const r2 = simulatePlayerDuel({
            battleId: `poach-2-${i}-${stance}-${s}`,
            sceneTitle: '纯正与混搭之争',
            mode: 'PVP_HUASHAN',
            environment: calmEnv,
            lineup: [oSnap, pSnap],
            rng: seedRng(s * 73 + i * 19 + stance.length * 7 + 1),
          })
          if (r2.winner === 'ENEMY') wins++
          games += 2
        }
      }
    }
    const winrate = wins / games
    console.info(`[Bench] Anti-poaching cross-school winrate: ${(winrate * 100).toFixed(1)}% (${wins}/${games})`)
    expect(winrate).toBeLessThanOrEqual(0.55)
  })
})

describe('双轨成长曲线：速成前期优势、晚成后期反超与战斗回合节奏', () => {
  it('重数上限严格单调递增、25 门精选功法配置完整且公式正确', () => {
    const tiers = ['green', 'blue', 'purple', 'orange', 'red'] as const
    const levels = [1, 10, 11, 20, 21, 30, 31, 60, 61]
    for (const tier of tiers) {
      for (let i = 1; i < levels.length; i++) {
        expect(getSkillMasteryCap(tier, levels[i])).toBeGreaterThanOrEqual(getSkillMasteryCap(tier, levels[i - 1]))
      }
    }
    expect(getSkillMasteryCap('purple', 20)).toBe(3)
    expect(getSkillMasteryCap('purple', 30)).toBe(4)

    const earlySkills = Object.values(SKILLS).filter((s) => s.growthProfile === 'EARLY')
    const lateSkills = Object.values(SKILLS).filter((s) => s.growthProfile === 'LATE')
    expect(earlySkills).toHaveLength(12)
    expect(lateSkills).toHaveLength(13)

    // 升重费用：速成 0.85x，晚成 1.15x
    expect(skillUpgradeCost(SKILLS.xianglong_sanshi, 1, 0)).toBe(Math.round(5000 * 0.85))
    expect(skillUpgradeCost(SKILLS.kongming_quan, 1, 0)).toBe(Math.round(5000 * 1.15))

    // 威力倍数与被动缩放
    expect(skillPowerAtMastery(SKILLS.wuhu_duanmen_dao, 1)).toBeCloseTo(SKILLS.wuhu_duanmen_dao.powerRatio * 1.14, 4)
    expect(skillPowerAtMastery(SKILLS.xianglong_18, 1)).toBeCloseTo(SKILLS.xianglong_18.powerRatio * 0.84, 4)
    expect(skillPowerAtMastery(SKILLS.xianglong_18, 3)).toBeCloseTo(SKILLS.xianglong_18.powerRatio * 1.10, 4)
    expect(skillPowerAtMastery(SKILLS.xianglong_18, 6)).toBeCloseTo(SKILLS.xianglong_18.powerRatio * 1.38, 4)
    expect(masteryPassiveScale('EARLY', 1)).toBe(1.0)
    expect(masteryPassiveScale('LATE', 1)).toBe(0.7)
    expect(masteryPassiveScale('LATE', 3)).toBe(1.0)
    expect(masteryPassiveScale('LATE', 6)).toBe(1.18)

    // 破境阶段解析
    expect(skillArmorPenetrationAtMastery(SKILLS.xianglong_18, 1)).toBe(15)
    expect(skillArmorPenetrationAtMastery(SKILLS.xianglong_18, 3)).toBe(35)
    expect(skillArmorPenetrationAtMastery(SKILLS.xianglong_18, 6)).toBe(42)
    expect(resolveSkillForMastery(SKILLS.xianglong_18, 1).critBonus).toBe(15)
    expect(skillShieldRendAtMastery(SKILLS.tiezhang_cuibei, 1)).toBe(1.5)
    expect(skillShieldRendAtMastery(SKILLS.tiezhang_cuibei, 3)).toBe(2.5)
    expect(skillUltAreaMaxMpAtMastery(SKILLS.yiqi_huasanqing, 1)).toBe(7)
    expect(skillUltAreaMaxMpAtMastery(SKILLS.yiqi_huasanqing, 3)).toBe(13)
    expect(skillUltAreaMaxMpAtMastery(SKILLS.yiqi_huasanqing, 6)).toBe(16)
    expect(jiuyinZonggangHpMultiplier(1)).toBe(1.18)
    expect(jiuyinZonggangHpMultiplier(2)).toBe(1.22)
    expect(jiuyinZonggangHpMultiplier(3)).toBe(1.25)

    // 逆九阴·蛤蟆功 1重全额吃 -20% 降防但仅 14% 吸血，3重恢复 20% 吸血
    const lv1Resolved = resolveBattleLoadout({ ...emptyLoadout, innerSkillId: 'nijiuyin_hama_gong' }, { ...basePlayer, currentSectId: 'baituo' }, { nijiuyin_hama_gong: 1 })
    const defPenaltyLv1 = lv1Resolved.effects.find((e) => e.sourceId === 'nijiuyin_hama_gong' && e.kind === 'STAT_BONUS')
    const lifestealLv1 = lv1Resolved.effects.find((e) => e.sourceId === 'nijiuyin_hama_gong' && e.kind === 'ATTACK_LIFESTEAL')
    expect(defPenaltyLv1).toMatchObject({ stats: { defPercent: -20 } })
    expect(lifestealLv1).toBeDefined()
    if (lifestealLv1?.kind === 'ATTACK_LIFESTEAL') expect(lifestealLv1.percent).toBeCloseTo(14.7, 4)

    const lv3Resolved = resolveBattleLoadout({ ...emptyLoadout, innerSkillId: 'nijiuyin_hama_gong' }, { ...basePlayer, currentSectId: 'baituo' }, { nijiuyin_hama_gong: 3 })
    const lifestealLv3 = lv3Resolved.effects.find((e) => e.sourceId === 'nijiuyin_hama_gong' && e.kind === 'ATTACK_LIFESTEAL')
    expect(lifestealLv3).toMatchObject({ percent: 20 * 1.05 })
  })

  it('Lv.10 速成碾压 → Lv.20 黄金交叉 → Lv.30 晚成全面反超且保留速成战术价值', () => {
    const heroAt = (level: number, realmTier: number): PlayerDTO => ({
      ...baseStarter.player,
      level,
      realmTier,
      currentSectId: null,
      stats: { str: 10 + level * 2, con: 10 + level * 2, agi: 10 + level * 2, intStat: 10 + level * 2, luck: 20, karma: 0 },
    })
    const firstStrikeDamage = (level: number, realmTier: number, skillId: string, mastery: number, enemyDef = 180) => {
      const report = simulateServerBattle({
        sceneTitle: '曲线对比',
        mode: 'SOLO_STORY',
        player: heroAt(level, realmTier),
        loadout: { ...emptyLoadout, outerSkillId: skillId },
        learnedSkills: { [skillId]: mastery },
        enemyMain: { ...dummyEnemy, hp: 90_000, atk: 10, combat: { def: enemyDef } },
        surviveRounds: 1,
        rng: () => 0.99,
      })
      return report.events.filter((e) => e.type === 'SKILL_CAST' && e.actorSlot === 'ALLY_MAIN')
        .reduce((sum, e) => sum + Math.max(0, -(e.hpDelta ?? 0)), 0)
    }

    // Lv.10（一境）：速成绿/紫/铁掌明显高于 1 重晚成红/橙
    const lv10Wuhu = firstStrikeDamage(10, 1, 'wuhu_duanmen_dao', 3)
    const lv10Baigu = firstStrikeDamage(10, 1, 'jiuyin_baiguzhua', 3)
    const lv10Tiezhang = firstStrikeDamage(10, 1, 'tiezhang_gong', 3)
    const lv10Xianglong = firstStrikeDamage(10, 1, 'xianglong_18', 1)
    const lv10Kongming = firstStrikeDamage(10, 1, 'kongming_quan', 1)
    expect(lv10Wuhu).toBeGreaterThan(lv10Xianglong)
    expect(lv10Baigu).toBeGreaterThan(lv10Xianglong)
    expect(lv10Tiezhang).toBeGreaterThan(lv10Kongming)

    // Lv.10 内功面板：1 重壮骨气血、2 重蛤蟆气血/防御优于蛰伏期晚成心法
    const lv10Player = heroAt(10, 1)
    const lv10Zhuanggu = computeDerivedStats(lv10Player, { ...emptyLoadout, innerSkillId: 'zhuanggu_jue' }, {}, undefined, { zhuanggu_jue: 1 })
    const lv10Hama = computeDerivedStats(lv10Player, { ...emptyLoadout, innerSkillId: 'hama_gong' }, {}, undefined, { hama_gong: 2 })
    const lv10Xiantian = computeDerivedStats(lv10Player, { ...emptyLoadout, innerSkillId: 'xiantian_gong' }, {}, undefined, { xiantian_gong: 1 })
    const lv10Nijiuyin = computeDerivedStats(lv10Player, { ...emptyLoadout, innerSkillId: 'nijiuyin_hama_gong' }, {}, undefined, { nijiuyin_hama_gong: 1 })
    expect(lv10Zhuanggu.maxHp).toBeGreaterThan(lv10Xiantian.maxHp)
    expect(lv10Hama.maxHp).toBeGreaterThan(lv10Xiantian.maxHp)
    expect(lv10Hama.def).toBeGreaterThan(lv10Nijiuyin.def)

    // Lv.20（二境交叉区）：2 重降龙逼近 4 重九阴白骨爪
    const lv20Baigu = firstStrikeDamage(20, 2, 'jiuyin_baiguzhua', 4)
    const lv20Xianglong = firstStrikeDamage(20, 2, 'xianglong_18', 2)
    expect(Math.abs(lv20Xianglong - lv20Baigu) / lv20Baigu).toBeLessThanOrEqual(0.25)

    // Lv.30（三境小成）：3 重降龙十八掌全面反超 4 重九阴白骨爪 与 5 重五虎断门刀
    const lv30Wuhu = firstStrikeDamage(30, 3, 'wuhu_duanmen_dao', 5, 320)
    const lv30Baigu = firstStrikeDamage(30, 3, 'jiuyin_baiguzhua', 4, 320)
    const lv30Xianglong = firstStrikeDamage(30, 3, 'xianglong_18', 3, 320)
    expect(lv30Xianglong).toBeGreaterThan(lv30Baigu)
    expect(lv30Xianglong).toBeGreaterThan(lv30Wuhu)

    // Lv.30 先天功（3重）打坐与面板超越速成内功
    const lv30Player = heroAt(30, 3)
    expect(cultivationRate(lv30Player, { ...emptyLoadout, innerSkillId: 'xiantian_gong' }, 0, { xiantian_gong: 3 }))
      .toBeGreaterThan(cultivationRate(lv30Player, { ...emptyLoadout, innerSkillId: 'hama_gong' }, 0, { hama_gong: 3 }))
    expect(cultivationRate(lv30Player, { ...emptyLoadout, innerSkillId: 'xiantian_gong' }, 0, { xiantian_gong: 3 }))
      .toBeGreaterThan(cultivationRate(lv30Player, { ...emptyLoadout, innerSkillId: 'xiantian_gong' }, 0, { xiantian_gong: 1 }))

    // 速成后期战术定位仍成立：九阴白骨爪高盾撕盾 + 流血、瞬息千里开局必先手、定阳针稳定封穴
    const shieldReport = simulateServerBattle({
      sceneTitle: '高盾测试',
      mode: 'SOLO_STORY',
      player: lv30Player,
      loadout: { ...emptyLoadout, outerSkillId: 'jiuyin_baiguzhua', lightSkillId: 'shunxi_qianli', ultSkillId: 'dingyang_zhen' },
      learnedSkills: { jiuyin_baiguzhua: 4, shunxi_qianli: 3, dingyang_zhen: 5 },
      enemyMain: { ...dummyEnemy, hp: 40_000, combat: { def: 200, openingShield: 5000, speed: 999 } },
      surviveRounds: 3,
      rng: () => 0.99,
    })
    expect(shieldReport.events.some((e) => e.segments.some((s) => s.type === 'tag' && s.text.includes('撕盾')))).toBe(true)
    expect(shieldReport.events.some((e) => e.segments.some((s) => s.type === 'tag' && s.text.includes('抢占先手')))).toBe(true)
    expect(shieldReport.events.some((e) => e.statusApplied === '封穴')).toBe(true)
  })

  it('8 门回合节奏武学（抢攻衰落 & 越战越勇）行为与战报标签正确', () => {
    const dummy = { ...dummyEnemy, hp: 500_000, atk: 10, combat: { def: 100 } }
    const hero: PlayerDTO = { ...baseStarter.player, level: 30, realmTier: 3, currentSectId: null, stats: { str: 70, con: 70, agi: 40, intStat: 40, luck: 20, karma: 0 } }
    const strikeDamageAtRound = (
      loadoutPatch: Partial<LoadoutPresetDTO>,
      learnedSkills: Record<string, number>,
      rounds = 5,
      statsOverride?: Partial<PlayerDTO['stats']>,
    ) => {
      const report = simulateServerBattle({
        sceneTitle: '回合曲线验证',
        mode: 'SOLO_STORY',
        player: statsOverride ? { ...hero, stats: { ...hero.stats, ...statsOverride } } : hero,
        loadout: { ...emptyLoadout, ...loadoutPatch },
        learnedSkills,
        enemyMain: dummy,
        surviveRounds: rounds,
        rng: () => 0.99,
      })
      const byRound = new Map<number, number>()
      for (const e of report.events) {
        if (e.type === 'SKILL_CAST' && e.actorSlot === 'ALLY_MAIN' && !e.isUlt && e.skillId) {
          byRound.set(e.round, -(e.hpDelta ?? 0))
        }
      }
      return { report, byRound }
    }

    // 抢攻系：五虎断门刀、狂风快刀、铁掌神功 R1 > R5（agi=0, intStat=0 确保 R1/R5 均不暴击以纯测伤害曲线）
    for (const [id, m] of [['wuhu_duanmen_dao', 5], ['kuangfeng_daofa', 5], ['tiezhang_gong', 4]] as const) {
      const { report, byRound } = strikeDamageAtRound({ outerSkillId: id }, { [id]: m }, 5, { agi: 0, intStat: 0 })
      expect(byRound.get(1)!, id).toBeGreaterThan(byRound.get(5)!)
      expect(report.events.some((e) => e.round === 1 && e.segments.some((s) => s.type === 'tag' && (s.text.includes('抢攻') || s.text.includes('强压'))))).toBe(true)
      expect(report.events.some((e) => e.round === 5 && e.segments.some((s) => s.type === 'tag' && (s.text.includes('气衰') || s.text.includes('渐衰'))))).toBe(true)
    }
    const { report: tzCritReport } = strikeDamageAtRound({ outerSkillId: 'tiezhang_gong' }, { tiezhang_gong: 4 }, 5, { agi: 0, intStat: 0 })
    expect(tzCritReport.events.some((e) => e.round === 1 && e.segments.some((s) => s.type === 'tag' && s.text.includes('铁掌强压 · 暴击率 +10 个百分点')))).toBe(true)
    expect(tzCritReport.events.some((e) => e.round === 5 && e.segments.some((s) => s.type === 'tag' && s.text.includes('铁掌强压 · 暴击率')))).toBe(false)

    // 慢热系：空明拳、独孤九剑、先天功 R5 > R1
    for (const [patch, ls] of [
      [{ outerSkillId: 'kongming_quan' }, { kongming_quan: 3 }],
      [{ outerSkillId: 'dugu_jiujian' }, { dugu_jiujian: 3 }],
      [{ innerSkillId: 'xiantian_gong', outerSkillId: 'quanzhen_jianfa' }, { xiantian_gong: 3, quanzhen_jianfa: 5 }],
    ] as const) {
      const { report, byRound } = strikeDamageAtRound(patch, ls)
      expect(byRound.get(5)!).toBeGreaterThan(byRound.get(1)!)
      expect(report.events.some((e) => e.round === 1 && e.segments.some((s) => s.type === 'tag' && s.text.includes('初蓄')))).toBe(true)
      expect(report.events.some((e) => e.round === 5 && e.segments.some((s) => s.type === 'tag' && s.text.includes('4 层')))).toBe(true)
    }
    expect(combatRampStacks(SKILLS.dugu_jiujian.battleEffects!.find((e) => e.kind === 'COMBAT_RAMP')!, 6)).toBe(5)

    // 瞬息千里：R4 起闪避下降
    const shunxiEffects = resolveBattleLoadout({ ...emptyLoadout, lightSkillId: 'shunxi_qianli' }, hero, { shunxi_qianli: 3 }).effects
    expect(shunxiEffects.some((e) => e.kind === 'OPENING_SURGE')).toBe(true)

    // 纯阳枯荣禅：R4 起激活「禅定圆满」物减 + 疗伤提升
    const kurongReport = simulateServerBattle({
      sceneTitle: '禅定圆满',
      mode: 'SOLO_STORY',
      player: { ...hero, currentSectId: 'yideng' },
      loadout: { ...emptyLoadout, innerSkillId: 'kurong_chunyang' },
      learnedSkills: { kurong_chunyang: 3 },
      enemyMain: { ...dummyEnemy, hp: 500_000, atk: 1800, combat: { def: 50 } },
      surviveRounds: 4,
      rng: () => 0.99,
    })
    const earlyWard = kurongReport.events.filter((e) => e.round < 4 && e.segments.some((s) => s.type === 'tag' && s.text.includes('禅定圆满')))
    const r4Ward = kurongReport.events.filter((e) => e.round === 4 && e.segments.some((s) => s.type === 'tag' && s.text.includes('禅定圆满')))
    expect(earlyWard).toHaveLength(0)
    expect(r4Ward.length).toBeGreaterThan(0)
    const healR2 = kurongReport.events.find((e) => e.round === 2 && e.effectSourceId === 'kurong_chunyang' && (e.hpDelta ?? 0) > 0)?.hpDelta ?? 0
    const healR4 = kurongReport.events.find((e) => e.round === 4 && e.effectSourceId === 'kurong_chunyang' && (e.hpDelta ?? 0) > 0)?.hpDelta ?? 0
    expect(healR4).toBeGreaterThan(healR2)
  })
})
