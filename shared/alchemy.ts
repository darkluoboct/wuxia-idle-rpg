import { getMapHerbs, HERBS, type PillRecipeConfig } from './gameData.ts'
import type { PlayerDTO, TierColor } from './protocol.ts'

export const FORAGE_QI_COST = 200

/** 采一次药：两份打底，福缘可多一份；extraRolls 是渔家家学多得的份数 */
export function gatherHerbs(mapId: string, luck: number, shichen: number, rng = Math.random, extraRolls = 0) {
  const available = getMapHerbs(mapId)
  const gathered: { id: string; name: string; count: number; tier: TierColor }[] = []
  if (!available.length) return gathered
  const rolls = 2 + Number(rng() < luck / 100) + extraRolls
  for (let i = 0; i < rolls; i++) {
    const roll = rng() * 100
    const rarity = roll < 45 ? 'COMMON' : roll < 80 ? 'UNCOMMON' : roll < 95 ? 'RARE' : 'EPIC'
    const matches = roll < 99 ? available.filter((herb) => herb.rarity === rarity) : available
    const pool = matches.length ? matches : available
    const preferred = pool.find((herb) => herb.shichenBonus?.shichens.includes(shichen))
    const herb = preferred && rng() < 0.5 ? preferred : pool[Math.floor(rng() * pool.length)]
    const count = herb.rarity === 'COMMON' && rng() < 0.5 ? 2 : 1
    const existing = gathered.find(({ id }) => id === herb.id)
    if (existing) existing.count += count
    else gathered.push({ id: herb.id, name: herb.name, tier: herb.tier, count })
  }
  return gathered
}

/** 成丹率；bonus 是杏林家学加的百分点 */
export function pillSuccessRate(recipe: PillRecipeConfig, stats: PlayerDTO['stats'], pity = 0, bonus = 0) {
  return Math.min(98, Math.max(15, Math.round(recipe.baseRate + Math.max(0, (stats.intStat - recipe.minInsight) * 1.5) + stats.luck * 0.4 + pity + bonus)))
}

export function pillDoubleRate(stats: PlayerDTO['stats']) {
  return Math.min(40, Math.round(stats.luck * 0.8 + stats.intStat * 0.3))
}

export function extractFurnaceResidue(rng = Math.random) {
  const herbs = Object.values(HERBS)
  const herb = herbs[Math.floor(rng() * herbs.length)]
  return { id: herb.id, name: herb.name, count: 2, gainedQi: 800 }
}
