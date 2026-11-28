import type { CoCultivationDTO, CompanionState, CultivationResult, GhostAppraisalResult, LoadoutPresetDTO, OriginId, PatrolCacheReward, PlayerDTO, RateBoostDTO, SixStats, VoyageResult } from './protocol.ts'
import { calcNextLevelQi } from './battle.ts'
import { resolveBattleLoadout } from './battleEffects.ts'
import { battleEnvironmentAt, EQUIP_SLOT_META, jianghuHour } from './combatMeta.ts'
import { ACUPOINTS, ACUPOINT_PILLS, activeJianghuTitle, COMPANIONS, equipmentItem, GHOST_APPRAISE_COST, INN_GIFT_DAILY, INN_TEA_DAILY, isMapUnlocked, ITEMS, LINAN_CITY_MAP, MAPS, meetsItemStatRequirement, REALMS, SECTS, SKILLS, PILL_RECIPES, type AcupointConfig, type MapZoneConfig, type PillRecipeConfig } from './gameData.ts'
import { gaibangAttributeBonus, gaibangSilverGain } from './gaibang.ts'
import { huashanDay } from './huashan.ts'
import { clampKarma, effectiveMartialStats, hasMartialFreedom } from './martialSchools.ts'
import { ORIGINS, originPerk } from './origins.ts'
import { skillIdleQiBonusAtMastery, skillMasteryFrom } from './skillMastery.ts'
import { IDLE_CAP_MS, PATROL_ELITE_EVERY, trialPartId } from './trialStages.ts'
import { activeSectEquipmentSets } from './sectEquipment.ts'

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
  const openedAcupointIds = legacyAcupoints(player.realmTier)
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

/**
 * 正式开局（本地「新游戏」与联机新角色共用）：Lv.1、主线 1-1 起步。
 * 选了家世的，六维按家世微调，家人伙伴开局就在队里（docs/17 §七）；其余伙伴靠剧情与客栈逐步结识。
 */
export function createNewGameCharacter(identity: Pick<PlayerDTO, 'id' | 'nickname' | 'avatarId'>, now: number, originId?: OriginId) {
  const origin = originId ? ORIGINS[originId] : undefined
  const stats: SixStats = { str: 10, con: 10, agi: 10, intStat: 10, luck: 10, karma: 0 }
  for (const [key, value] of Object.entries(origin?.stats ?? {})) stats[key as keyof SixStats] += value
  const player: PlayerDTO = {
    ...identity,
    level: 1,
    realmTier: 1,
    realmStage: 1,
    breakPityRate: 0,
    qiExp: 0,
    nextLevelQi: calcNextLevelQi(1),
    silver: 600,
    goldIngot: 300,
    stats,
    shaQi: 0,
    currentSectId: null,
    sectRank: 1,
    sectContribution: 0,
    isGuardingLibrary: false,
    currentMapId: 'jiaxing_suburb',
    maxChapterId: 1,
    qiPerHour: 600,
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
    featureGate: true,
    idleOff: true,
    ...(origin ? { origin: origin.id } : {}),
  }
  const kin = origin ? COMPANIONS[origin.companionId] : undefined
  const blank = (presetIdx: 1 | 2 | 3, name: string, stance: LoadoutPresetDTO['stance']): LoadoutPresetDTO => ({
    presetIdx, name, stance,
    innerSkillId: null, outerSkillId: null, lightSkillId: null, ultSkillId: null,
    leftCompanionId: kin?.role === 'LEFT' ? kin.id : null, rightCompanionId: kin?.role === 'RIGHT' ? kin.id : null,
    weaponId: 'qinggang_sword', armorId: null, accId: null, relicBookId: null,
  })
  const companionAffinity: Record<string, CompanionState> = Object.fromEntries(Object.values(COMPANIONS).map((c) => [
    c.id, { affinity: 0, recruited: false, taught: false, met: false, form: 'base' as const, grade: c.grade ?? null, tokens: 0 },
  ]))
  if (kin) Object.assign(companionAffinity[kin.id], { affinity: 100, recruited: true, met: true })
  return {
    player,
    ownedItemIds: ['qinggang_sword'],
    learnedSkills: {} as Record<string, number>,
    companionAffinity,
    presets: {
      1: blank(1, '预设壹·刚猛强攻', 'FIERCE'),
      2: blank(2, '预设贰·太极反震', 'TAICHI'),
      3: blank(3, '预设叁·奇门极速', 'AGILE'),
    } as Record<LoadoutPresetDTO['presetIdx'], LoadoutPresetDTO>,
    pillCount: 0,
    openedAcupointIds: [] as string[],
    pillInventory: {} as Record<string, number>,
    herbInventory: {} as Record<string, number>,
    knownRecipeIds: Object.keys(PILL_RECIPES),
    furnaceResidue: 0,
    alchemyPity: {} as Record<string, number>,
  }
}

const SKILL_FIELD = { INNER: 'innerSkillId', OUTER: 'outerSkillId', LIGHT: 'lightSkillId', ULT: 'ultSkillId' } as const

/** 新学的武功自动填进各套配装的空槽，免去新手手动装配；返回是否改了配装 */
export function autoEquipSkill(presets: Iterable<LoadoutPresetDTO>, skillId: string) {
  const skill = SKILLS[skillId]
  if (!skill) return false
  const key = SKILL_FIELD[skill.slot]
  let changed = false
  for (const preset of presets) {
    if (preset[key]) continue
    preset[key] = skillId
    changed = true
  }
  return changed
}

/** 剧情里递到手上的兵刃：1-3 拾得「靖」字匕首，历练 07 的罩门要它才能一击制敌（docs/27） */
export const STORY_WEAPONS: Partial<Record<string, string>> = { '1-3': 'xuantie_dagger' }

/** 首通剧情节点时把那件兵刃换到手上；手上已有更锋利的就不换，免得冲掉玩家自己挑的兵刃 */
export function wieldStoryWeapon(presets: Iterable<LoadoutPresetDTO>, code: string, ownedItemIds: readonly string[]) {
  const id = STORY_WEAPONS[code]
  const weapon = id ? ITEMS[id] : undefined
  if (!id || !weapon || !ownedItemIds.includes(id)) return false
  let changed = false
  for (const preset of presets) {
    if ((ITEMS[preset.weaponId ?? '']?.atkBonus ?? 0) >= (weapon.atkBonus ?? 0)) continue
    preset.weaponId = id
    changed = true
  }
  return changed
}

/** 新得的装备在属性达标时自动穿到空槽 */
export function autoEquipItem(presets: Iterable<LoadoutPresetDTO>, itemId: string, stats: SixStats) {
  const item = ITEMS[itemId]
  if (!item || !meetsItemStatRequirement(item, stats)) return false
  const key = EQUIP_SLOT_META[item.slot].field
  let changed = false
  for (const preset of presets) {
    if (preset[key]) continue
    Object.assign(preset, { [key]: itemId })
    changed = true
  }
  return changed
}

/** 已入队的伙伴 */
export const recruitedCompanionIds = (affinity: Readonly<Record<string, CompanionState>>) =>
  Object.keys(affinity).filter((id) => affinity[id]?.recruited)

/**
 * 新入队的伙伴在左右翼空着时自动编入，与新得的装备、武功自动装到空槽一个规矩。
 * 只排这一回新入队的；玩家自己腾空的位置，不会被已经在册的伙伴补回去。
 */
export function autoSeatCompanions(presets: Iterable<LoadoutPresetDTO>, newcomers: readonly string[]) {
  let changed = false
  for (const preset of presets) {
    for (const id of newcomers) {
      if (preset.leftCompanionId === id || preset.rightCompanionId === id) continue
      const field = !preset.leftCompanionId ? 'leftCompanionId' : !preset.rightCompanionId ? 'rightCompanionId' : undefined
      if (!field) break
      preset[field] = id
      changed = true
    }
  }
  return changed
}

export function cultivationRate(
  player: PlayerDTO,
  preset: LoadoutPresetDTO,
  collectionBonus = 0,
  learnedSkills?: Readonly<Record<string, number>>,
) {
  return cultivationRates(player, preset, collectionBonus, learnedSkills).qi
}

export function cultivationRates(
  player: PlayerDTO,
  preset: LoadoutPresetDTO,
  collectionBonus = 0,
  learnedSkills?: Readonly<Record<string, number>>,
) {
  const map = MAPS.find((zone) => zone.id === player.currentMapId) ?? MAPS[0]
  const innerSkill = SKILLS[preset.innerSkillId ?? '']
  const inner = innerSkill?.slot === 'INNER'
    ? skillIdleQiBonusAtMastery(innerSkill, skillMasteryFrom(innerSkill, learnedSkills), player, hasMartialFreedom(preset))
    : 0
  const armor = preset.armorId ? ITEMS[preset.armorId]?.idleBonus ?? 0 : 0
  const head = equipmentItem(preset.headId, player)
  const accessory = equipmentItem(preset.accId, player)
  const accessoryBonus = accessory?.slot === 'ACC' ? accessory.idleBonus ?? 0 : 0
  const patrolBonus = Math.min(20, (head?.slot === 'HEAD' ? head.patrolQiBonus ?? 0 : 0) + (accessory?.slot === 'ACC' ? accessory.patrolQiBonus ?? 0 : 0))
  const flatQi = accessory?.slot === 'ACC' ? accessory.idleQiPerHour ?? 0 : 0
  const sect = player.currentSectId === 'quanzhen' ? 25 : 0
  const stats = effectiveMartialStats(player, preset)
  const title = activeJianghuTitle({ ...player, stats }, preset)?.idleQiBonus ?? 0
  const coCultivate = player.coCultivatePartner ? 15 : 0
  const con = stats.con + gaibangAttributeBonus(player).con
  const base = map.baseQiPerHour * (1 + con / 100)
  const setQiBonus = activeSectEquipmentSets(preset).reduce((total, set) => total + (set.idleQiBonus ?? 0), 0)
  const meridianQiBonus = player.openedAcupointIds?.includes('lianquan') ? 8 : 0
  const desertQiBonus = map.id === 'damo_caravan' && preset.bootsId === trialPartId('damo_qibing', 'BOOTS') ? 5 : 0
  const bonus = inner + armor + accessoryBonus + sect + coCultivate + collectionBonus + title
  const silverBonus = accessory?.slot === 'ACC' ? accessory.patrolSilverBonus ?? 0 : 0
  const originQiBonus = originPerk(player, 'IDLE_QI')
  return {
    qi: Math.round(base * (100 + bonus + patrolBonus + setQiBonus + meridianQiBonus + desertQiBonus + originQiBonus) / 100) + flatQi,
    silverBasis: Math.round((Math.round(base * (100 + bonus) / 100) + flatQi) * (100 + silverBonus) / 100),
  }
}

/** 巡历宝箱按场掷：每 30 场的几率与原先每次遭遇相同（docs/25） */
export function settlePatrolCaches(player: PlayerDTO, preset: LoadoutPresetDTO, battles: number, now: number, rng = Math.random) {
  const luck = effectiveMartialStats(player, preset).luck
  const baseChance = Math.min(30, 5 + Math.floor(Math.max(0, luck) / 20))
  const chance = baseChance * (preset.accId === 'iron_bagua' ? 1.15 : 1) / PATROL_ELITE_EVERY
  let count = 0
  for (let battle = 0; battle < battles; battle++) {
    if (rng() * 100 < chance) count++
  }
  if (!count) return
  const silver = gaibangSilverGain(player, 120 * count)
  player.silver += silver
  const reward: PatrolCacheReward = { count, silver }
  player.trial.recentCache = { ...reward, at: now }
  return reward
}

export function enemySilverReward(maxHp: number) {
  return Math.round(maxHp * 0.8)
}

/** 历练首胜的纹银：将门家学再加一成 */
export function trialFirstClearSilver(bossHp: number, player: Pick<PlayerDTO, 'origin'>) {
  return Math.round(enemySilverReward(bossHp) * (100 + originPerk(player, 'TRIAL_SILVER')) / 100)
}

export function realmBreakChance(player: PlayerDTO, preset: LoadoutPresetDTO, baseRate: number, usePill: boolean) {
  const accessory = preset.accId ? ITEMS[preset.accId] : undefined
  const bonus = accessory?.slot === 'ACC' ? accessory.breakthroughBonus ?? 0 : 0
  const base = player.realmTier === 1 ? 100 : baseRate
  return Math.min(100, Math.round(base + effectiveMartialStats(player, preset).con * 0.3 + player.breakPityRate + bonus + (usePill ? 35 : 0)))
}

export function legacyAcupoints(tier: number) {
  return ACUPOINTS.filter((point) => point.realmTier < tier).map((point) => point.id)
}

export function acupointCost(cost: number, insight: number) {
  return Math.max(100, Math.round(cost * (1 - insight / (insight + 250) * 0.28)))
}

function acupointPrerequisite(point: AcupointConfig, opened: readonly string[]) {
  return ACUPOINTS.find((prior) => prior.realmTier === point.realmTier && prior.order < point.order && !opened.includes(prior.id))
}

export function canOpenAcupoint(point: AcupointConfig, opened: readonly string[]) {
  return !opened.includes(point.id) && !acupointPrerequisite(point, opened)
}

export function nextCultivationRealm(tier: number) {
  return ACUPOINTS.some((point) => point.realmTier === tier) ? REALMS.find((realm) => realm.tier === tier + 1) : undefined
}

type CultivationAction = { action: 'level' } | { action: 'break'; usePill: boolean } |
  { action: 'pierce'; pointId: string; usePill: boolean } | { action: 'pill'; pillId: string }

export function cultivatePlayer(player: PlayerDTO, preset: LoadoutPresetDTO, stock: Record<string, number>,
  input: CultivationAction, now: number, rng = Math.random, settle: () => void = () => {},
): CultivationResult | { error: string } {
  const realm = REALMS.find(({ tier }) => tier === player.realmTier)
  if (!realm) return { error: '当前境界未开放' }
  const opened = player.openedAcupointIds ?? []
  const remaining = ACUPOINTS.filter((point) => point.realmTier === realm.tier && !opened.includes(point.id))
  if (input.action === 'level') {
    if (player.level >= realm.maxLevel) return { error: `已到「${realm.name}」的等级上限，请先突破境界` }
    const cost = calcNextLevelQi(player.level)
    if (player.qiExp < cost) return { error: '升级所需真气不足' }
    settle()
    player.qiExp -= cost
    player.level++
    player.nextLevelQi = calcNextLevelQi(player.level)
    player.stats.str++
    player.stats.con++
    player.stats.agi++
    if (player.level % 2 === 0) player.stats.intStat++
    return { action: 'level', level: player.level }
  }
  if (input.action === 'break') {
    const next = nextCultivationRealm(realm.tier)
    if (!next) return { error: '下一境界尚未开放' }
    if (player.level < realm.maxLevel) return { error: `达到 ${realm.maxLevel} 级方可冲关` }
    if (remaining.length) return { error: `请先冲通「${remaining[0].name}」等 ${remaining.length} 个穴位` }
    if (input.usePill && !(stock.pozhang_dan > 0)) return { error: '纯阳通脉破障丹已用尽' }
    const rate = realmBreakChance(player, preset, next.baseBreakRate, input.usePill)
    if (input.usePill) stock.pozhang_dan--
    if (rng() * 100 < rate) {
      settle()
      player.realmTier = next.tier
      player.level = Math.max(player.level, next.minLevel)
      player.nextLevelQi = calcNextLevelQi(player.level)
      player.breakPityRate = 0
      delete player.qiDeviationUntil
      player.stats.con += 4
      player.stats.str += 4
      player.stats.intStat += 3
      return { action: 'break', success: true, rate, protectedByPill: false, pityAdded: 0 }
    }
    const protectedByPill = stock.bingpo_huxin_dan > 0
    const pityAdded = protectedByPill ? 25 : 20
    if (protectedByPill) stock.bingpo_huxin_dan--
    else player.qiDeviationUntil = now + 15 * 60_000
    player.breakPityRate += pityAdded
    return { action: 'break', success: false, rate, protectedByPill, pityAdded }
  }

  let points: AcupointConfig[]
  let spentQi = 0
  const pillId = input.action === 'pierce' ? (input.usePill ? 'tongmai_dan' : undefined) : input.pillId
  if (pillId && !(stock[pillId] > 0)) return { error: '该冲穴丹药已用尽' }
  if (input.action === 'pierce') {
    const point = ACUPOINTS.find(({ id }) => id === input.pointId)
    if (!point || point.realmTier > realm.tier) return { error: '此穴尚未开放' }
    if (opened.includes(point.id)) return { error: '此穴道早已贯通' }
    const prior = acupointPrerequisite(point, opened)
    if (prior) return { error: `请先冲通「${prior.name}」` }
    if (!pillId) spentQi = acupointCost(point.costQi, effectiveMartialStats(player, preset).intStat)
    if (player.qiExp < spentQi) return { error: `冲通「${point.name}」需 ${spentQi.toLocaleString()} 真气` }
    points = [point]
  } else {
    const effect = ACUPOINT_PILLS[input.pillId]?.acupointEffect
    if (effect?.type === 'FREE_PIERCE') points = remaining.slice(0, 1)
    else if (effect?.type === 'MULTI_PIERCE') points = remaining.slice(0, effect.bonusValue ?? 3)
    else if (effect?.type === 'ALL_MERIDIAN') points = remaining
    else return { error: '请选择用于冲穴的丹药' }
    if (!points.length) return { error: '当前经脉穴位已全部贯通' }
  }

  if (points.some((point) => point.statBonus.key === 'con' || point.statBonus.key === 'idleGain') ||
    pillId === 'shaolin_xiaohuan_dan' || pillId === 'jiuzhuan_tongqiao_dan') settle()
  player.qiExp -= spentQi
  if (pillId) stock[pillId]--
  if (pillId === 'shaolin_xiaohuan_dan') {
    player.stats.con += 6
    player.bonusMp = (player.bonusMp ?? 0) + 300
  } else if (pillId === 'jiuzhuan_tongqiao_dan') {
    for (const key of Object.keys(player.stats) as (keyof SixStats)[]) player.stats[key] += 12
    player.stats.karma = clampKarma(player.stats.karma)
  }
  for (const { statBonus: { key, value } } of points) {
    if (key === 'str' || key === 'con' || key === 'agi' || key === 'intStat') player.stats[key] += value
  }
  player.openedAcupointIds = [...opened, ...points.map(({ id }) => id)]
  return { action: input.action, opened: points.map(({ id }) => id), spentQi, pillId }
}

export function resolveSeaVoyage(fromMapId: string, toMapId: string, accessoryId: string | null, silver: number, now: number, rng = Math.random): VoyageResult | undefined {
  if (fromMapId === toMapId || ![fromMapId, toMapId].includes('taohua_isle')) return
  if (!battleEnvironmentAt('taohua_isle', new Date(now)).storm) return
  if (accessoryId === trialPartId('canghai_kuanglan', 'ACC')) return { status: 'PROTECTED' }
  if (rng() < 0.25) return { status: 'WRECK', silverLost: Math.min(silver, 300) }
}

export function mapTravelMilliseconds(fromMapId: string, toMapId: string, bootsId?: string | null) {
  const maps = [fromMapId, toMapId]
  const water = maps.includes('guiyun_lake') || maps.includes('taohua_isle')
  const swamp = maps.includes('heizhao_swamp')
  const mudBoots = bootsId === trialPartId('huanghe_sigui', 'BOOTS')
  const waterPenalty = water && bootsId !== trialPartId('taihu_shuizhai', 'BOOTS') ? 5000 : 0
  const terrain = Math.max(waterPenalty, swamp ? 5000 : 0) / (mudBoots ? 2 : 1)
  const speed = bootsId === trialPartId('jinwang_fuxiu', 'BOOTS') ? 110
    : bootsId === trialPartId('damo_qibing', 'BOOTS') && maps.includes('damo_caravan') ? 105 : 100
  return Math.round((10000 + terrain) * 100 / speed)
}

export function canEnterMap(map: MapZoneConfig, player: PlayerDTO, preset: LoadoutPresetDTO, online = false) {
  if (map.guestSectId ? map.guestSectId === player.currentSectId : isMapUnlocked(map, player.maxChapterId, online)) return true
  return !!map.guestTitleId && activeJianghuTitle({ ...player, stats: effectiveMartialStats(player, preset) }, preset)?.id === map.guestTitleId
}

export function cityInspectionDue(player: PlayerDTO, toMapId: string, preset: LoadoutPresetDTO, now: number) {
  return toMapId === LINAN_CITY_MAP && activeJianghuTitle({ ...player, stats: effectiveMartialStats(player, preset) }, preset)?.id === 'title_youming' &&
    (player.lastCityInspectionAt === undefined || now - player.lastCityInspectionAt >= 3_600_000)
}

export function planMapJourney(player: PlayerDTO, toMapId: string, preset: LoadoutPresetDTO, now: number): NonNullable<PlayerDTO['mapJourney']> {
  const inspected = cityInspectionDue(player, toMapId, preset, now)
  const duration = mapTravelMilliseconds(player.currentMapId, toMapId, preset.bootsId) + (inspected ? 5000 : 0)
  return { mapId: toMapId, arrivesAt: now + duration, ...(inspected ? { inspected: true } : {}) }
}

export function karmaAfterEvent(karma: number, delta: number, headId?: string | null) {
  const amount = headId === trialPartId('huangshan_kulou', 'HEAD')
    ? Math.sign(delta) * Math.round(Math.abs(delta) * 110 / 100) : delta
  return clampKarma(karma + amount)
}

export function innAffinityGain(companionId: string, favorite: boolean, titleId?: string) {
  const double = titleId === 'title_tabo' && (companionId === 'zhoubotong' || companionId === 'hongqigong')
  return (favorite ? 80 : 20) * (double ? 2 : 1)
}

export function innVisitDay(now: number) {
  return huashanDay(now + 3_600_000)
}

export function innGiftsRemaining(used?: { tea: number; gift: number }) {
  return { tea: Math.max(0, INN_TEA_DAILY - (used?.tea ?? 0)), gift: Math.max(0, INN_GIFT_DAILY - (used?.gift ?? 0)) }
}

export const SNAKE_FEEDING_RECIPE = 'recipe_baituo_fushe_gao'

export function recipeForPlayer(recipe: PillRecipeConfig, player: Pick<PlayerDTO, 'snakeFeedingRecipe'>): PillRecipeConfig {
  if (recipe.id !== SNAKE_FEEDING_RECIPE || !player.snakeFeedingRecipe) return recipe
  return { ...recipe, requiredHerbs: recipe.requiredHerbs.map((entry) => entry.herbId === 'shexian_cao' ? { ...entry, count: entry.count - 1 } : entry) }
}

export function canReceiveSnakeRecipe(player: PlayerDTO, preset: LoadoutPresetDTO) {
  return player.currentSectId === 'baituo' && activeJianghuTitle({ ...player, stats: effectiveMartialStats(player, preset) }, preset)?.id === 'title_wandu'
}

export const GHOST_APPRAISAL_SWORD = 'xuantie_heavysword'

export function hasGhostCostume(preset: LoadoutPresetDTO) {
  return (resolveBattleLoadout(preset).setCounts.get('jiamian_piaoping') ?? 0) >= 4
}

export function ghostAppraisalCost(preset: LoadoutPresetDTO) {
  return hasGhostCostume(preset) ? GHOST_APPRAISE_COST / 2 : GHOST_APPRAISE_COST
}

export function appraiseGhostCurio(
  player: PlayerDTO, preset: LoadoutPresetDTO, ownsSword: boolean, masked: boolean, now: number,
  changeKarma: (delta: number) => number, rng = Math.random,
): GhostAppraisalResult | { error: string } {
  const cost = ghostAppraisalCost(preset)
  if (player.silver < cost) return { error: `鉴宝需花费 ${cost} 两纹银。` }

  const { intStat, luck } = effectiveMartialStats(player, preset)
  const swordFound = !ownsSword && (intStat >= 28 || luck >= 28)
  const righteous = SECTS.some((sect) => sect.id === player.currentSectId && sect.alignment === 'RIGHTEOUS')
  let inspection: GhostAppraisalResult['inspection'] = 'NONE'
  let evasionPercent = 0
  if (righteous && !masked) {
    const hour = jianghuHour(new Date(now))
    evasionPercent = cost < GHOST_APPRAISE_COST && (hour === 23 || hour === 0) ? 100
      : (preset.headId === trialPartId('jiamian_piaoping', 'HEAD') ? 30 : 0) + (preset.bootsId === trialPartId('huangshan_kulou', 'BOOTS') ? 5 : 0)
    inspection = evasionPercent === 100 || (evasionPercent > 0 && rng() * 100 < evasionPercent) ? 'EVADED' : 'CAUGHT'
  }
  const karmaDelta = inspection === 'CAUGHT' ? changeKarma(-25) : 0
  player.wearingMask = masked
  player.silver -= cost
  if (!swordFound) {
    const medicines = player.battleMedicines ??= {}
    medicines.jiuhua_yulu_wan = (medicines.jiuhua_yulu_wan ?? 0) + 1
    player.qiExp += 2200
  }
  return { spentSilver: cost, swordFound, inspection, evasionPercent, karmaDelta }
}

export function coCultivationRate(soloQiPerHour: number) {
  return Math.round(soloQiPerHour * 115 / 100)
}

/** 倍率活动的一段：pct 为加成百分比，100 即双倍（docs/22） */
export type BoostWindow = Pick<RateBoostDTO, 'startsAt' | 'endsAt' | 'pct'>

/** [from, to] 整段都在活动里的最高加成；同时段同类活动不叠加 */
export function boostPctOver(boosts: readonly BoostWindow[], from: number, to: number) {
  return boosts.reduce((best, boost) => boost.startsAt <= from && boost.endsAt >= to ? Math.max(best, boost.pct) : best, 0)
}

/** 把 [from, to] 按共修与活动的起止切段 */
function idleSegments(from: number, to: number, windows: readonly Pick<BoostWindow, 'startsAt' | 'endsAt'>[]) {
  const cuts = new Set([from, to])
  for (const { startsAt, endsAt } of windows) for (const at of [startsAt, endsAt]) if (at > from && at < to) cuts.add(at)
  const points = [...cuts].sort((a, b) => a - b)
  return points.slice(1).map((end, index) => [points[index], end] as const)
}

/** 一段时间里活动加成的时间加权平均（巡历掉落用）；区间为空时取那一刻的加成 */
export function averageBoostPct(boosts: readonly BoostWindow[], from: number, to: number) {
  if (to <= from) return boostPctOver(boosts, to, to)
  const weighted = idleSegments(from, to, boosts).reduce((total, [start, end]) => total + (end - start) * boostPctOver(boosts, start, end), 0)
  return weighted / (to - from)
}

/** 开始挂机：打坐与巡历都从这一刻起算，停着的那段不补。已在挂机返回 false */
export function startIdle(player: Pick<PlayerDTO, 'idleOff' | 'lastSettleAt' | 'trial'>, now: number) {
  if (!player.idleOff) return false
  delete player.idleOff
  player.lastSettleAt = Math.max(now, player.lastSettleAt)
  player.trial.lastPatrolAt = now
  return true
}

export function idleQiNumerator(
  lastSettleAt: number, now: number, soloRate: number, pair: Pick<CoCultivationDTO, 'startsAt' | 'endsAt'> | null,
  boosts: readonly BoostWindow[] = [],
) {
  const since = Math.max(lastSettleAt, now - IDLE_CAP_MS)
  if (now <= since) return 0n
  let total = 0n
  for (const [from, to] of idleSegments(since, now, pair ? [pair, ...boosts] : boosts)) {
    const together = !!pair && pair.startsAt <= from && pair.endsAt >= to
    const rate = BigInt(together ? coCultivationRate(soloRate) : soloRate)
    total += BigInt(to - from) * rate * BigInt(100 + boostPctOver(boosts, from, to)) / 100n
  }
  return total
}
