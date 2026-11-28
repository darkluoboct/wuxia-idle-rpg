import { ITEMS, type SkillConfig } from './gameData.ts'
import { huashanDay } from './huashan.ts'
import { martialEffectiveness, type MartialSchoolMember } from './martialSchools.ts'
import type { LoadoutPresetDTO, PlayerDTO, TierColor } from './protocol.ts'
import { trialPartId } from './trialStages.ts'

export const MAX_SKILL_MASTERY = 10

export type SkillGrowthProfile = 'EARLY' | 'BALANCED' | 'LATE'

export interface SkillMasteryStage {
  minMastery: number
  label: string
  summary: string
  armorPenetration?: number
  shieldRendMultiplier?: number
  ultAreaMaxMpPercent?: number
  critBonus?: number
}

export const GROWTH_PROFILE_META: Record<SkillGrowthProfile, { label: string; shortLabel: string; desc: string }> = {
  EARLY: {
    label: '速成 · 初猛后乏',
    shortLabel: '速成',
    desc: '1 重即成型且参悟省真气，附带前期固定属性，后期成长见顶但保留战术特长。',
  },
  BALANCED: {
    label: '中正 · 稳步精进',
    shortLabel: '中正',
    desc: '各重数平稳递增，攻守均衡。',
  },
  LATE: {
    label: '晚成 · 厚积薄发',
    shortLabel: '晚成',
    desc: '1~2 重蛰伏且更吃真气，第 3 重小成、第 6 重大成破境质变，后期上限极高。',
  },
}

const EARLY_POWER = [1.14, 1.17, 1.20, 1.22, 1.24, 1.25, 1.26, 1.27, 1.28, 1.29] as const
const LATE_POWER = [0.84, 0.95, 1.10, 1.18, 1.26, 1.38, 1.46, 1.54, 1.62, 1.72] as const
const EARLY_PASSIVE = [1.00, 1.03, 1.05, 1.07, 1.08, 1.09, 1.10, 1.10, 1.11, 1.12] as const
const LATE_PASSIVE = [0.70, 0.85, 1.00, 1.05, 1.10, 1.18, 1.22, 1.26, 1.30, 1.35] as const

const TIER_COST: Record<TierColor, number> = { green: 400, blue: 900, purple: 2200, orange: 5000, red: 11000 }
export const QUSAN_CACHE_STAGE = 24
export const QUSAN_CACHE_KEY = trialPartId('qianying_mixing', 'ACC')
const QUSAN_FRAGMENT_IDS = ['luoying_zhang', 'lanhua_shou', 'jiuyin_baiguzhua', 'niqiu_gong'] as const

export function qusanCacheBlockReason(player: PlayerDTO, preset: LoadoutPresetDTO, now: number) {
  if (!player.trial.rewardedStageIds.includes(QUSAN_CACHE_STAGE) || player.trial.selectedStageId !== QUSAN_CACHE_STAGE) {
    return '先通关第 24 关，再巡历牛家密室'
  }
  if (preset.accId !== QUSAN_CACHE_KEY) return '请在主角的佩饰栏装上曲三酒馆密室暗格铁八卦钥'
  if (player.qusanCacheDay === huashanDay(now)) return '今日已搜过暗格，北京时间零点可再来'
}

export function searchQusanCache(
  player: PlayerDTO, preset: LoadoutPresetDTO, now: number, rng = Math.random,
): { error: string } | { skillId: string; count: number } {
  const error = qusanCacheBlockReason(player, preset, now)
  if (error) return { error }
  const skillId = QUSAN_FRAGMENT_IDS[Math.floor(rng() * QUSAN_FRAGMENT_IDS.length)]
  const fragments = player.skillFragments ??= {}
  const count = (fragments[skillId] ?? 0) + 1
  fragments[skillId] = count
  player.qusanCacheDay = huashanDay(now)
  return { skillId, count }
}

/**
 * 金庸原著【经脉关隘与重数封印】阶梯：
 * 功法并非一蹴而就，越是高深莫测的神功绝学，越需要深厚的经脉负荷支撑。
 * 第一卷《射雕篇》（Lv 1 ~ 30）：
 *   - 凡品(绿) / 良品(蓝)：易于入门，第一卷允许最高修至第 5 重 (登堂入室)
 *   - 上品(紫) / 绝品(橙)：内息要求较高，第一卷最高允许修至第 3 重 (初窥堂奥)
 *   - 神品(红)：如九阴真经、降龙十八掌，因任督二脉未开，第一卷严格封顶在第 3 重 (初领神髓)
 * 第二卷《神雕篇》（Lv 31 ~ 60，融会贯通/炉火纯青）：
 *   - 凡/良品：最高修至第 8 重
 *   - 上/绝/神品：最高修至第 6 重
 * 第三卷《倚天篇》（Lv 61+，任督贯通·一代宗师）：
 *   - 开放第 7 ~ 10 重 (登峰造极·大圆满)
 */
export function getSkillMasteryCap(tier: TierColor, playerLevel: number): number {
  if (playerLevel <= 10) {
    // 第一境界【初窥门径】(Lv 1~10 手三阳经，初入江湖)
    return tier === 'red' || tier === 'orange' ? 2 : 3
  }
  if (playerLevel <= 20) {
    // 第二境界【略有小成】(Lv 11~20 足三阴经)
    return tier === 'red' || tier === 'orange' ? 2 : tier === 'purple' ? 3 : 4
  }
  if (playerLevel <= 30) {
    // 第三境界【融会贯通】(Lv 21~30 阳维脉·阴维脉，第一卷《射雕篇》大圆满)
    return tier === 'red' || tier === 'orange' ? 3 : tier === 'purple' ? 4 : 5
  }
  if (playerLevel <= 60) {
    // 第二卷《神雕篇》阶段 (Lv 31~60, 奇经八脉融会贯通)
    return tier === 'red' || tier === 'orange' ? 6 : 8
  }
  // 第三卷《倚天篇》及更高 (任督二脉生死玄关冲破，一代宗师以上)
  return MAX_SKILL_MASTERY
}

function clampMastery(mastery = 1) {
  return Math.min(MAX_SKILL_MASTERY, Math.max(1, mastery))
}

export function masteryPowerMultiplier(profile: SkillGrowthProfile | undefined, mastery = 1) {
  const level = clampMastery(mastery)
  if (profile === 'EARLY') return EARLY_POWER[level - 1]
  if (profile === 'LATE') return LATE_POWER[level - 1]
  return (100 + 5 * (level - 1)) / 100
}

export function masteryPassiveScale(profile: SkillGrowthProfile | undefined, mastery = 1) {
  const level = clampMastery(mastery)
  if (profile === 'EARLY') return EARLY_PASSIVE[level - 1]
  if (profile === 'LATE') return LATE_PASSIVE[level - 1]
  return 1
}

export function skillMasteryFrom(
  skill: Pick<SkillConfig, 'id' | 'growthProfile'>,
  learnedSkills?: Readonly<Record<string, number>>,
): number {
  const recorded = learnedSkills?.[skill.id]
  if (recorded && recorded > 0) return clampMastery(recorded)
  return skill.growthProfile === 'LATE' ? 3 : 1
}

export function skillUpgradeCostScale(profile: SkillGrowthProfile | undefined): number {
  if (profile === 'EARLY') return 0.85
  if (profile === 'LATE') return 1.15
  return 1
}

export function skillUpgradeCost(skill: SkillConfig, mastery: number, insight: number, accessoryId?: string | null) {
  const accessory = accessoryId ? ITEMS[accessoryId] : undefined
  const discount = accessory?.slot === 'ACC' ? accessory.masteryDiscount : undefined
  const percent = discount && (!discount.sectId || discount.sectId === skill.sectId) ? discount.percent : 0
  return Math.round(TIER_COST[skill.tier] * mastery * (1 - insight / (insight + 180)) * (1 - percent / 100) * skillUpgradeCostScale(skill.growthProfile))
}

export function skillFragmentDiscount(skill: SkillConfig, cost: number, fragments: number) {
  const full = skill.fragmentCount ?? 20
  const count = Math.min(full, fragments)
  const savedQi = Math.floor(cost * count / full)
  return { count: savedQi > 0 ? count : 0, spentQi: cost - savedQi }
}

export function skillPowerAtMastery(skill: SkillConfig, mastery = 1, player?: MartialSchoolMember, freedom = false) {
  return skill.powerRatio * masteryPowerMultiplier(skill.growthProfile, mastery) * (martialEffectiveness(skill, player, freedom) / 100)
}

export function activeMasteryStage(skill: SkillConfig, mastery: number): SkillMasteryStage | undefined {
  const level = clampMastery(mastery)
  return skill.masteryStages?.filter((stage) => stage.minMastery <= level).sort((a, b) => b.minMastery - a.minMastery)[0]
}

export function nextMasteryStage(skill: SkillConfig, mastery: number): SkillMasteryStage | undefined {
  const level = clampMastery(mastery)
  return skill.masteryStages?.filter((stage) => stage.minMastery > level).sort((a, b) => a.minMastery - b.minMastery)[0]
}

export function skillCritBonusAtMastery(skill: SkillConfig, mastery: number): number {
  return activeMasteryStage(skill, mastery)?.critBonus ?? skill.critBonus ?? 0
}

export function skillArmorPenetrationAtMastery(skill: SkillConfig, mastery: number): number | undefined {
  return activeMasteryStage(skill, mastery)?.armorPenetration ?? skill.battleEffects?.find((e) => e.kind === 'ARMOR_PENETRATION')?.percent
}

export function skillShieldRendAtMastery(skill: SkillConfig, mastery: number): number | undefined {
  return activeMasteryStage(skill, mastery)?.shieldRendMultiplier ?? skill.battleEffects?.find((e) => e.kind === 'SHIELD_REND')?.multiplier
}

export function skillUltAreaMaxMpAtMastery(skill: SkillConfig, mastery: number): number | undefined {
  return activeMasteryStage(skill, mastery)?.ultAreaMaxMpPercent ?? skill.battleEffects?.find((e) => e.kind === 'ULT_AREA_TRUE_DAMAGE')?.maxMpPercent
}

export function resolveSkillForMastery(skill: SkillConfig, mastery: number): SkillConfig {
  if (!skill.masteryStages?.length) return skill
  const stage = activeMasteryStage(skill, mastery)
  if (!stage) return skill
  const critBonus = stage.critBonus ?? skill.critBonus
  const battleEffects = skill.battleEffects?.map((effect) => {
    if (effect.kind === 'ARMOR_PENETRATION' && stage.armorPenetration !== undefined) {
      return { ...effect, percent: stage.armorPenetration }
    }
    if (effect.kind === 'SHIELD_REND' && stage.shieldRendMultiplier !== undefined) {
      return { ...effect, multiplier: stage.shieldRendMultiplier }
    }
    if (effect.kind === 'ULT_AREA_TRUE_DAMAGE' && stage.ultAreaMaxMpPercent !== undefined) {
      return { ...effect, maxMpPercent: stage.ultAreaMaxMpPercent }
    }
    return effect
  })
  return { ...skill, critBonus, battleEffects }
}

export function skillIdleQiBonusAtMastery(skill: SkillConfig, mastery: number, player?: MartialSchoolMember, freedom = false) {
  return (skill.idleQiBonus ?? 0) * (martialEffectiveness(skill, player, freedom) / 100) * masteryPassiveScale(skill.growthProfile, mastery)
}

export function jiuyinZonggangHpMultiplier(mastery: number) {
  return mastery <= 1 ? 1.18 : mastery === 2 ? 1.22 : 1.25
}
