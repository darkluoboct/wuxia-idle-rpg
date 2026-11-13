import { ITEMS, type SkillConfig } from './gameData.ts'
import { huashanDay } from './huashan.ts'
import { martialEffectiveness, type MartialSchoolMember } from './martialSchools.ts'
import type { LoadoutPresetDTO, PlayerDTO, TierColor } from './protocol.ts'
import { trialPartId } from './trialStages.ts'

export const MAX_SKILL_MASTERY = 10

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
    return tier === 'red' || tier === 'orange' ? 2 : 4
  }
  if (playerLevel <= 30) {
    // 第三境界【融会贯通】(Lv 21~30 阳维脉·阴维脉，第一卷《射雕篇》大圆满)
    return tier === 'red' || tier === 'orange' || tier === 'purple' ? 3 : 5
  }
  if (playerLevel <= 60) {
    // 第二卷《神雕篇》阶段 (Lv 31~60, 奇经八脉融会贯通)
    return tier === 'red' || tier === 'orange' ? 6 : 8
  }
  // 第三卷《倚天篇》及更高 (任督二脉生死玄关冲破，一代宗师以上)
  return MAX_SKILL_MASTERY
}

export function skillUpgradeCost(skill: SkillConfig, mastery: number, insight: number, accessoryId?: string | null) {
  const accessory = accessoryId ? ITEMS[accessoryId] : undefined
  const discount = accessory?.slot === 'ACC' ? accessory.masteryDiscount : undefined
  const percent = discount && (!discount.sectId || discount.sectId === skill.sectId) ? discount.percent : 0
  return Math.round(TIER_COST[skill.tier] * mastery * (1 - insight / (insight + 180)) * (1 - percent / 100))
}

export function skillFragmentDiscount(skill: SkillConfig, cost: number, fragments: number) {
  const full = skill.fragmentCount ?? 20
  const count = Math.min(full, fragments)
  const savedQi = Math.floor(cost * count / full)
  return { count: savedQi > 0 ? count : 0, spentQi: cost - savedQi }
}

export function skillPowerAtMastery(skill: SkillConfig, mastery = 1, player?: MartialSchoolMember, freedom = false) {
  const level = Math.min(MAX_SKILL_MASTERY, Math.max(1, mastery))
  return skill.powerRatio * ((100 + 5 * (level - 1)) / 100) * (martialEffectiveness(skill, player, freedom) / 100)
}
