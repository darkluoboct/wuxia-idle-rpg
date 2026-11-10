import type { SkillConfig } from './gameData.ts'
import type { TierColor } from './protocol.ts'

export const MAX_SKILL_MASTERY = 10

const TIER_COST: Record<TierColor, number> = { green: 400, blue: 900, purple: 2200, orange: 5000, red: 11000 }

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

export function skillUpgradeCost(skill: SkillConfig, mastery: number, insight: number) {
  return Math.round(TIER_COST[skill.tier] * mastery * (1 - insight / (insight + 180)))
}

export function skillPowerAtMastery(skill: SkillConfig, mastery = 1) {
  const level = Math.min(MAX_SKILL_MASTERY, Math.max(1, mastery))
  return skill.powerRatio * ((100 + 5 * (level - 1)) / 100)
}
