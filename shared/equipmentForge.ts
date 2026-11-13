import { EQUIP_SLOT_META, jianghuHour, type BattleStatBonuses } from './combatMeta.ts'
import type { ItemConfig } from './gameData.ts'
import type { EquipSlotType, ForgeAffix, ForgeInput, ForgeResult, LoadoutPresetDTO, PlayerDTO } from './protocol.ts'
import { sectEquipmentSetOf } from './sectEquipment.ts'
import { rollEquipmentAffix } from './trialStages.ts'

const TEMPER_RATES = [100, 100, 100, 100, 100, 75, 60, 45, 30]
const SECONDARY_RANGES: Record<ForgeAffix['stat'], readonly number[]> = {
  atk: [15, 25, 40], def: [12, 20, 32], hp: [100, 180, 300], speed: [5, 8, 12], crit: [2, 3, 5],
}
const SECONDARY_STATS: Record<Exclude<EquipSlotType, 'RELIC'>, readonly ForgeAffix['stat'][]> = {
  WEAPON: ['atk', 'crit'], ARMOR: ['def', 'hp'], HEAD: ['hp', 'speed'], ACC: ['crit', 'hp'],
  WRIST: ['atk', 'def'], BELT: ['def', 'hp'], BOOTS: ['speed', 'def'],
}
const BASE_FIELDS = ['atkBonus', 'defBonus', 'hpBonus', 'critBonus', 'dodgeBonus'] as const

export type EquipmentRolls = Pick<PlayerDTO, 'equipmentAffixes' | 'equipmentForge'>

export function temperCost(stars: number, pity: number) {
  if (stars >= TEMPER_RATES.length) return
  return { iron: stars + 1, stones: Math.ceil((stars + 1) / 2), rate: Math.min(100, TEMPER_RATES[stars] + pity) }
}

export function reforgeCost(lock: boolean) {
  return lock ? 900 : 600
}

export function forgeMaterialLabel(iron: number, stones: number) {
  return `百炼玄铁 ${iron}、淬火石 ${stones}`
}

export function forgeMaterials(player: PlayerDTO, iron: number, stones: number) {
  const forge = player.equipmentForge ??= { iron: 0, stones: 0, items: {} }
  forge.iron += iron
  forge.stones += stones
  return forge
}

function scaleStats(stats: BattleStatBonuses, scale: (n: number) => number) {
  const result = { ...stats }
  for (const key of Object.keys(stats) as (keyof BattleStatBonuses)[]) {
    const value = stats[key]
    if (value && value > 0) {
      const rate = ['crit', 'dodge', 'hit', 'parry', 'parryAbsorb'].includes(key) || key.endsWith('Percent')
      result[key] = rate ? scale(value) : Math.round(scale(value))
    }
  }
  return result
}

export function temperedItem(item: ItemConfig, stars: number): ItemConfig {
  if (!stars) return item
  const scale = (n: number) => Math.round(n * (10 + stars) * 10) / 100
  const base = { ...item }
  for (const key of BASE_FIELDS) {
    const value = item[key]
    if (value && value > 0) base[key] = key === 'critBonus' || key === 'dodgeBonus' ? scale(value) : Math.round(scale(value))
  }
  if (item.attributeBonus) base.attributeBonus = scaleStats(item.attributeBonus, scale)
  if (item.battleEffects) base.battleEffects = item.battleEffects.map((effect) => effect.kind === 'STAT_BONUS'
    ? { ...effect, stats: scaleStats(effect.stats, scale) } : effect)
  return base
}

export function isForgeable(item: ItemConfig) {
  return item.slot !== 'RELIC' && (BASE_FIELDS.some((field) => !!item[field]) || !!item.attributeBonus ||
    !!item.battleEffects?.some((effect) => effect.kind === 'STAT_BONUS'))
}

export function salvageYield(item: ItemConfig) {
  if (!isForgeable(item) || item.isTrueUnique || item.id === 'iron_bagua' || item.id === 'qimei_stick' ||
    (item.setId && sectEquipmentSetOf(item.setId))) return
  if (item.tier === 'green') return { iron: 2, stones: 1 }
  if (item.tier === 'blue') return { iron: 4, stones: 2 }
}

function inUse(itemId: string, presets: readonly LoadoutPresetDTO[]) {
  return presets.some((preset) => Object.values(EQUIP_SLOT_META).some(({ field }) => preset[field] === itemId) ||
    Object.values(preset.companionWeapons ?? {}).includes(itemId) ||
    Object.values(preset.companionEquipment ?? {}).some((wear) => Object.values(wear).includes(itemId)))
}

export function forgeBlockReason(
  player: PlayerDTO, item: ItemConfig, input: ForgeInput, now: number, presets: readonly LoadoutPresetDTO[] = [],
) {
  if (!isForgeable(item)) return '这件物品无法精铸'
  const forge = player.equipmentForge
  const state = forge?.items[item.id]
  if (input.action === 'salvage') {
    if (!salvageYield(item)) return '这件装备无法分解'
    if (state?.stars || state?.pity || state?.secondary) return '已精铸的装备无法分解'
    if (inUse(item.id, presets)) return '请从所有主角与伙伴配装中卸下这件装备'
  }
  if (input.action === 'temper') {
    const cost = temperCost(state?.stars ?? 0, state?.pity ?? 0)
    if (!cost) return '这件装备已达 9 星'
    if ((forge?.iron ?? 0) < cost.iron || (forge?.stones ?? 0) < cost.stones) return '百炼玄铁或淬火石不足'
  }
  if (input.action === 'reforge') {
    if (player.currentMapId !== 'jiaxing_suburb') return '请到嘉兴南湖的鬼市铁匠炉'
    const hour = jianghuHour(new Date(now))
    if (hour !== 23 && hour !== 0) return '鬼市铁匠炉在北京时间 23:00–00:59 开炉'
    if ((input.lock === 'primary' && !player.equipmentAffixes?.[item.id]) ||
      (input.lock === 'secondary' && !state?.secondary)) return '请选择已有的词条锁定'
    if (player.silver < reforgeCost(!!input.lock)) return '纹银不足'
  }
}

export function forgeEquipment(
  player: PlayerDTO, item: ItemConfig, input: ForgeInput,
  { presets, now, settle, rng = Math.random }: {
    presets: readonly LoadoutPresetDTO[]; now: number; settle?: () => void; rng?: () => number
  },
): ForgeResult | { error: string } {
  const error = forgeBlockReason(player, item, input, now, presets)
  if (error) return { error }

  if (input.action === 'salvage') {
    const { iron, stones } = salvageYield(item)!
    forgeMaterials(player, iron, stones)
    if (player.equipmentAffixes) delete player.equipmentAffixes[item.id]
    if (player.equipmentForge) delete player.equipmentForge.items[item.id]
    return { action: 'salvage', iron, stones }
  }
  const forge = forgeMaterials(player, 0, 0)
  const state = forge.items[item.id] ??= { stars: 0, pity: 0 }
  const active = presets.find(({ presetIdx }) => presetIdx === player.activePresetIdx)
  const settleBeforeChange = active && active[EQUIP_SLOT_META[item.slot].field] === item.id ? settle : undefined
  if (input.action === 'temper') {
    const { iron, stones, rate } = temperCost(state.stars, state.pity)!
    const success = rate === 100 || rng() * 100 < rate
    if (success) {
      settleBeforeChange?.()
      forge.iron -= iron
      state.stars++
      state.pity = 0
    } else state.pity += 10
    forge.stones -= stones
    return { action: 'temper', success, stars: state.stars, pity: state.pity, iron: success ? iron : 0, stones }
  }

  const lock = input.lock
  settleBeforeChange?.()
  const silver = reforgeCost(!!lock)
  player.silver -= silver
  const primary = player.equipmentAffixes ??= {}
  if (lock !== 'primary') primary[item.id] = rollEquipmentAffix(item, 'REFORGE', rng)
  if (lock !== 'secondary') {
    const stats = SECONDARY_STATS[item.slot as Exclude<EquipSlotType, 'RELIC'>]
    const stat = stats[Math.floor(rng() * stats.length)]
    const range = SECONDARY_RANGES[stat]
    state.secondary = { stat, value: range[Math.floor(rng() * range.length)] }
  }
  return { action: 'reforge', silver, affixRoll: primary[item.id], secondary: state.secondary! }
}
