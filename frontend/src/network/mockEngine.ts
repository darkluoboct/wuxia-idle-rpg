import type { GachaDrawDTO, LoadoutPresetDTO, RoomPlayerDTO, StanceType, UniqueArtifactStatusDTO } from './protocol'
import { REALMS, SECTS } from '@/config/gameData'
import { computeDerivedStats } from '../../../shared/battle.ts'
import { createStarterCharacter } from '../../../shared/player.ts'
import { trialPartId } from '../../../shared/trialStages.ts'
import {
  AWAKENABLE_IDS,
  GACHA_BASE_RATES,
  GACHA_HARD_PITY,
  GACHA_ORANGE_TOP_GRADE_RATE,
  GACHA_POOL,
  GACHA_SOFT_PITY_START,
  GACHA_SOFT_PITY_STEP,
  type GachaEntry,
  type GachaTier,
} from '@/config/gachaData'

export { calcNextLevelQi, computeDerivedStats, evaluateStanceAdvantage, simulateServerBattle } from '../../../shared/battle.ts'

/** 同地图的试玩对手。战力显示由实战配装计算。 */
export function generateRoomPlayers(mapId: string): RoomPlayerDTO[] {
  return roomPlayers(mapId).map((entry) => {
    const { player, loadout } = mockDuelOpponent(entry, mapId)
    return { ...entry, combatPower: computeDerivedStats(player, loadout).combatPower }
  })
}

function roomPlayers(mapId: string): Omit<RoomPlayerDTO, 'combatPower'>[] {
  if (mapId === 'jiaxing_suburb') {
    return [
      { id: 'rp_1', nickname: '烟雨断桥客', sectName: '逍遥散人', realmName: '融会贯通', level: 34, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_2', nickname: '清风道长', sectName: '终南全真教', realmName: '炉火纯青', level: 48, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_3', nickname: '桃花小师妹', sectName: '东海桃花岛', realmName: '略有小成', level: 27, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_4', nickname: '逆徒·尹狂刀', sectName: '全真弃徒', realmName: '融会贯通', level: 36, stance: 'FIERCE', isBetrayerBounty: true, isEscortingDart: false },
    ]
  }
  if (mapId === 'zhongnan_forest') {
    return [
      { id: 'rp_5', nickname: '活死人墓客', sectName: '终南古墓派', realmName: '炉火纯青', level: 52, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_6', nickname: '重阳执剑人', sectName: '终南全真教', realmName: '融会贯通', level: 41, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
    ]
  }
  if (mapId === 'damo_caravan') {
    return [
      { id: 'rp_7', nickname: '威远总镖头', sectName: '丐帮', realmName: '融会贯通', level: 38, stance: 'FIERCE', isBetrayerBounty: false, isEscortingDart: true },
      { id: 'rp_8', nickname: '西域毒皇·欧阳烈', sectName: '西域白驼山庄', realmName: '一代宗师', level: 63, stance: 'FIERCE', isBetrayerBounty: false, isEscortingDart: false, holdingUniqueArtifact: '真·绿玉打狗棒' },
      { id: 'rp_9', nickname: '塞外孤狼', sectName: '逍遥散人', realmName: '略有小成', level: 29, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: true },
    ]
  }
  if (mapId === 'guiyun_lake') {
    return [
      { id: 'rp_12', nickname: '归云庄少庄主', sectName: '东海桃花岛', realmName: '融会贯通', level: 36, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_13', nickname: '太湖渔隐', sectName: '逍遥散人', realmName: '融会贯通', level: 39, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
    ]
  }
  if (mapId === 'taohua_isle') {
    return [
      { id: 'rp_14', nickname: '哑仆（桃花岛）', sectName: '东海桃花岛', realmName: '炉火纯青', level: 50, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_15', nickname: '试剑亭客', sectName: '逍遥散人', realmName: '炉火纯青', level: 47, stance: 'FIERCE', isBetrayerBounty: false, isEscortingDart: false },
    ]
  }
  if (mapId === 'huashan_peak') {
    return [
      { id: 'rp_16', nickname: '论剑台守擂人', sectName: '终南全真教', realmName: '一代宗师', level: 66, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_17', nickname: '西毒门徒·白衣客', sectName: '西域白驼山庄', realmName: '一代宗师', level: 64, stance: 'FIERCE', isBetrayerBounty: true, isEscortingDart: false },
    ]
  }
  return [
    { id: 'rp_10', nickname: '湘西赶尸人', sectName: '西域白驼山庄', realmName: '炉火纯青', level: 47, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
    { id: 'rp_11', nickname: '陆乘云', sectName: '东海桃花岛', realmName: '一代宗师', level: 65, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: true, holdingUniqueArtifact: '真·桃花岛软猬甲' },
  ]
}

const duelPresets: Record<StanceType, Partial<LoadoutPresetDTO>> = {
  FIERCE: { innerSkillId: 'huntian_qigong', outerSkillId: 'dagou_bangfa', ultSkillId: 'kanglong_youhui',
    weaponId: trialPartId('jiangnan_qiguai', 'WEAPON'), armorId: trialPartId('henglian_tongjia', 'ARMOR') },
  AGILE: { innerSkillId: 'bipo_xinjue', outerSkillId: 'luoying_zhang', ultSkillId: 'tanzhi_shentong', lightSkillId: 'qimen_bufa',
    weaponId: 'qinggang_sword', armorId: 'ruanwei_armor' },
  TAICHI: { innerSkillId: 'quanzhen_tuna', outerSkillId: 'quanzhen_jianfa', ultSkillId: 'tonggui_jianfa', lightSkillId: 'jinyan_gong',
    weaponId: 'qinggang_sword', accId: 'jiuwei_fox' },
}

const sectDuelPresets: Record<string, Partial<LoadoutPresetDTO>> = {
  baituo: { innerSkillId: 'hama_gong', outerSkillId: 'lingshe_quan', ultSkillId: 'nizhuan_jiuyin', lightSkillId: 'shunxi_qianli',
    weaponId: 'lingshe_zhang', armorId: 'baituo_jinsi' },
  taohua: { outerSkillId: 'yuxiao_jianfa', ultSkillId: 'bihai_chaosheng', weaponId: 'biyu_xiao' },
  yideng: { innerSkillId: 'kurong_chan', ultSkillId: 'yiyang_zhi' },
  gaibang: { armorId: 'jiudai_baina' },
}

export function mockDuelOpponent(entry: Pick<RoomPlayerDTO, 'id' | 'nickname' | 'sectName' | 'level' | 'realmName' | 'stance' | 'isBetrayerBounty'>, mapId: string) {
  const { player, presets } = createStarterCharacter({ id: entry.id, nickname: entry.nickname, avatarId: 'hero_sword_male' }, 0)
  const sect = SECTS.find(({ name, chiefPlayerName }) => name === entry.sectName || chiefPlayerName === entry.nickname)
  const realm = REALMS.find(({ name }) => name === entry.realmName)
  const rank = entry.level
  Object.assign(player, {
    level: rank, realmTier: realm?.tier ?? player.realmTier, currentSectId: sect?.id ?? null, currentMapId: mapId,
    sectRank: entry.id.startsWith('fg_') ? 5 : 3,
  })
  Object.assign(player.stats, { str: rank, con: Math.round(rank * 1.25), agi: Math.round(rank * 0.7), intStat: rank, karma: entry.isBetrayerBounty ? -250 : 40 })
  const loadout = { ...presets[1], ...duelPresets[entry.stance], ...(sect ? sectDuelPresets[sect.id] : undefined),
    stance: entry.stance, leftCompanionId: null, rightCompanionId: null }
  const learnedSkills = Object.fromEntries([loadout.innerSkillId, loadout.outerSkillId, loadout.lightSkillId, loadout.ultSkillId]
    .filter((id) => id !== null).map((id) => [id, entry.id.startsWith('fg_') ? 5 : 3]))
  return { player, loadout, learnedSkills }
}

/** 初始全服唯一真品神兵公示表 */
export const INITIAL_UNIQUE_ARTIFACTS: UniqueArtifactStatusDTO[] = [
  { artifactCode: 'TRUE_TULONG', itemId: 'xuantie_heavysword', name: '真·屠龙宝刀', holderNickname: '萧峰传人·乔北冥', holderSect: '丐帮', defendStreak: 3, nextContestLabel: '周日20:00 王盘山扬刀大会' },
  { artifactCode: 'TRUE_DAGOU', itemId: 'dagou_stick_true', name: '真·绿玉打狗棒', holderNickname: '西域毒皇·欧阳烈', holderSect: '西域白驼山庄', defendStreak: 1, nextContestLabel: '离线>72h自动回收 / 君山擂台' },
  { artifactCode: 'TRUE_RUANWEI', itemId: 'ruanwei_armor', name: '真·桃花岛软猬甲', holderNickname: '陆乘云', holderSect: '东海桃花岛', defendStreak: 5, nextContestLabel: '周六试剑亭守擂' },
  { artifactCode: 'TRUE_YITIAN', itemId: 'biyu_xiao', name: '真·倚天剑', holderNickname: null, holderSect: '万安寺秘境待择主', defendStreak: 0, nextContestLabel: '全服首通3.0倚天篇择主' },
]

/**
 * 客栈结缘抽取（模拟服务端）：基础概率 + 软保底 + 硬保底 + 十连保底。
 * pity = 距上次神品已累计的抽数；返回本批结果与更新后的 pity。rng 可注入以便测试。
 */
export function rollGacha(params: { count: number; pity: number; pullsSoFar: number; rng?: () => number }): {
  draws: GachaDrawDTO[]
  pity: number
} {
  const rng = params.rng ?? Math.random
  let pity = params.pity
  const draws: GachaDrawDTO[] = []

  const pickEntry = (tier: GachaTier): GachaEntry => {
    const pool = GACHA_POOL[tier]
    let r = rng() * pool.reduce((s, e) => s + e.weight, 0)
    for (const e of pool) {
      r -= e.weight
      if (r < 0) return e
    }
    return pool[pool.length - 1]
  }
  const toDraw = (tier: GachaTier, e: GachaEntry, pullNo: number, pityTriggered: boolean): GachaDrawDTO => {
    const d: GachaDrawDTO = { pullNo, tier, kind: 'PILL', pityTriggered: pityTriggered || undefined }
    switch (e.kind) {
      case 'COMPANION':
        Object.assign(d, { kind: 'COMPANION', refId: e.id })
        if (tier === 'orange') d.grade = rng() * 100 < GACHA_ORANGE_TOP_GRADE_RATE ? '上' : '中'
        break
      case 'SKILL':
      case 'ITEM':
        Object.assign(d, { kind: e.kind, refId: e.id })
        break
      case 'TOKEN':
        Object.assign(d, { kind: 'TOKEN', refId: e.id, qty: e.qty })
        break
      case 'TOKEN_RANDOM':
        Object.assign(d, { kind: 'TOKEN', refId: AWAKENABLE_IDS[Math.floor(rng() * AWAKENABLE_IDS.length)], qty: e.qty })
        break
      default:
        Object.assign(d, { kind: e.kind, qty: e.qty })
    }
    return d
  }

  for (let i = 0; i < params.count; i++) {
    const n = pity + 1 // 本抽是距上次神品的第 n 抽
    const redRate =
      n >= GACHA_HARD_PITY ? 100 : n >= GACHA_SOFT_PITY_START ? GACHA_BASE_RATES.red + GACHA_SOFT_PITY_STEP * (n - GACHA_SOFT_PITY_START + 1) : GACHA_BASE_RATES.red
    const roll = rng() * 100
    // 软保底抬高的红品概率从蓝档里扣，橙 / 紫概率不变
    const tier: GachaTier =
      roll < redRate ? 'red' : roll < redRate + GACHA_BASE_RATES.orange ? 'orange' : roll < redRate + GACHA_BASE_RATES.orange + GACHA_BASE_RATES.purple ? 'purple' : 'blue'
    const pityTriggered = tier === 'red' && n >= GACHA_SOFT_PITY_START
    pity = tier === 'red' ? 0 : pity + 1
    draws.push(toDraw(tier, pickEntry(tier), params.pullsSoFar + i + 1, pityTriggered))
  }

  // 十连保底：十抽中至少一个上品（紫）及以上，否则把最后一抽改为上品
  if (params.count >= 10 && draws.every((d) => d.tier === 'blue')) {
    const last = draws[draws.length - 1]
    draws[draws.length - 1] = toDraw('purple', pickEntry('purple'), last.pullNo, true)
  }
  return { draws, pity }
}
