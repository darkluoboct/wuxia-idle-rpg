import type { CoCultivationDTO, CompanionState, LoadoutPresetDTO, PlayerDTO } from './protocol.ts'
import { calcNextLevelQi } from './battle.ts'
import { ITEMS, MAPS, SKILLS, PILL_RECIPES } from './gameData.ts'

export function createStarterCharacter(identity: Pick<PlayerDTO, 'id' | 'nickname' | 'avatarId'>, now: number) {
  const player: PlayerDTO = {
    ...identity,
    level: 32,
    realmTier: 3,
    realmStage: 1,
    breakPityRate: 0,
    qiExp: 14200,
    nextLevelQi: calcNextLevelQi(32),
    silver: 18600,
    goldIngot: 520,
    stats: {
      str: 28,
      con: 26,
      agi: 29,
      intStat: 32,
      luck: 25,
      karma: 40,
    },
    shaQi: 0,
    currentSectId: null,
    sectRank: 1,
    sectContribution: 120,
    isGuardingLibrary: false,
    currentMapId: 'jiaxing_suburb',
    maxChapterId: 2,
    qiPerHour: 3650,
    lastSettleAt: now,
    coCultivatePartner: null,
    bountyUntil: null,
    wearingMask: false,
    activePresetIdx: 1,
    trial: {
      selectedStageId: 1,
      maxStageId: 1,
      rewardedStageIds: [],
      stageHours: {},
      replayHours: {},
      lastPatrolAt: now,
      marks: {},
      recentDrops: [],
    },
  }
  const learnedSkills: Record<string, number> = {
    quanzhen_tuna: 3,
    yuenv_jian: 4,
    luoying_zhang: 2,
    jinyan_gong: 3,
    yiyang_zhi: 1,
  }
  const starterWear = {
    headId: 'bamboo_hat',
    armorId: 'quanzhen_robe',
    wristId: 'cloth_bracers',
    beltId: null,
    bootsId: 'cloth_boots',
    accId: 'iron_bagua',
    relicBookId: null,
  }
  const ownedItemIds = [
    'qinggang_sword',
    'xuantie_dagger',
    'swallow_bracers',
    ...Object.values(starterWear).filter((id): id is string => id !== null),
  ]
  const companionAffinity: Record<string, CompanionState> = {
    kezhene: { affinity: 180, recruited: true, taught: true },
    meichaofeng: { affinity: 140, recruited: true, taught: false },
    guojing: { affinity: 340, recruited: true, taught: false },
    huangrong: { affinity: 360, recruited: true, taught: false },
    hongqigong: { affinity: 540, recruited: true, taught: false }, // 差60满600即可体验请叫花鸡触发《亢龙有悔》倾囊传功！
    huangyaoshi: { affinity: 220, recruited: true, taught: false },
    zhoubotong: { affinity: 480, recruited: true, taught: false },
  }
  const presets: Record<LoadoutPresetDTO['presetIdx'], LoadoutPresetDTO> = {
    1: {
      presetIdx: 1,
      name: '方案一·靖蓉同队',
      stance: 'FIERCE',
      innerSkillId: 'quanzhen_tuna',
      outerSkillId: 'luoying_zhang',
      lightSkillId: 'jinyan_gong',
      ultSkillId: 'yiyang_zhi',
      leftCompanionId: 'guojing',
      rightCompanionId: 'huangrong',
      weaponId: 'xuantie_dagger',
      ...starterWear,
    },
    2: {
      presetIdx: 2,
      name: '方案二·太极反伤',
      stance: 'TAICHI',
      innerSkillId: 'quanzhen_tuna',
      outerSkillId: 'yuenv_jian',
      lightSkillId: 'jinyan_gong',
      ultSkillId: 'yiyang_zhi',
      leftCompanionId: 'guojing',
      rightCompanionId: 'kezhene',
      weaponId: 'qinggang_sword',
      ...starterWear,
    },
    3: {
      presetIdx: 3,
      name: '方案三·奇门变招',
      stance: 'AGILE',
      innerSkillId: 'quanzhen_tuna',
      outerSkillId: 'luoying_zhang',
      lightSkillId: 'jinyan_gong',
      ultSkillId: 'yiyang_zhi',
      leftCompanionId: 'meichaofeng',
      rightCompanionId: 'huangrong',
      weaponId: 'xuantie_dagger',
      ...starterWear,
    },
  }
  const openedAcupointIds = [
    'shangyang', 'hegu', 'quchi', 'jianyu', 'yingxiang', // 手三阳经 (Tier 1)
    'yinbai', 'yongquan', 'sanyinjiao', 'taichong', 'qimen', // 足三阴经 (Tier 2)
  ]
  const pillInventory: Record<string, number> = {
    pozhang_dan: 2,
    tongmai_dan: 3,
    bingpo_huxin_dan: 1,
    shaolin_xiaohuan_dan: 1,
    jiuzhuan_tongqiao_dan: 0,
  }
  const herbInventory: Record<string, number> = {
    sanqi: 6,
    cheqian_cao: 5,
    honghua: 4,
    heding_lu: 2,
    jinyinhua: 4,
    fuling: 3,
    heshouwu: 2,
    chunyang_zhi: 1,
    mahuang: 3,
    hongjingtian: 2,
    xuelian_hua: 1,
    qushe_dan: 1,
    shexian_cao: 3,
    wugong_qiao: 2,
    duanchang_cao: 1,
    linghu_cao: 0,
  }
  const knownRecipeIds = Object.keys(PILL_RECIPES)
  const furnaceResidue = 3
  const alchemyPity: Record<string, number> = {}

  return {
    player,
    ownedItemIds,
    learnedSkills,
    companionAffinity,
    presets,
    pillCount: 2,
    openedAcupointIds,
    pillInventory,
    herbInventory,
    knownRecipeIds,
    furnaceResidue,
    alchemyPity,
  }
}

export function cultivationRate(player: PlayerDTO, preset: LoadoutPresetDTO, collectionBonus = 0) {
  const map = MAPS.find((zone) => zone.id === player.currentMapId) ?? MAPS[0]
  const inner = preset.innerSkillId ? SKILLS[preset.innerSkillId]?.idleQiBonus ?? 0 : 0
  const armor = preset.armorId ? ITEMS[preset.armorId]?.idleBonus ?? 0 : 0
  const sect = player.currentSectId === 'quanzhen' ? 25 : 0
  const coCultivate = player.coCultivatePartner ? 15 : 0
  return Math.round(map.baseQiPerHour * (1 + player.stats.con / 100) * (1 + (inner + armor + sect + coCultivate + collectionBonus) / 100))
}

export function coCultivationRate(soloQiPerHour: number) {
  return Math.round(soloQiPerHour * 115 / 100)
}

export function idleQiNumerator(
  lastSettleAt: number, now: number, soloRate: number, pair: Pick<CoCultivationDTO, 'startsAt' | 'endsAt'> | null,
) {
  const since = Math.max(lastSettleAt, now - 43_200_000)
  const elapsed = Math.max(0, now - since)
  const together = pair ? Math.max(0, Math.min(now, pair.endsAt) - Math.max(since, pair.startsAt)) : 0
  return BigInt(elapsed - together) * BigInt(soloRate) + BigInt(together) * BigInt(coCultivationRate(soloRate))
}
