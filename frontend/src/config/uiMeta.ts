import type { EquipSlotType, SkillSlotType, StanceType, TierColor } from './typesHelper'

/** 品质：五色阶 → 中文品名 / CSS 色阶类（见 style.css 的 .t-*） */
export const TIER_META: Record<TierColor, { label: string; cls: string; rank: number }> = {
  green: { label: '凡品', cls: 't-green', rank: 1 },
  blue: { label: '良品', cls: 't-blue', rank: 2 },
  purple: { label: '上品', cls: 't-purple', rank: 3 },
  orange: { label: '绝品', cls: 't-orange', rank: 4 },
  red: { label: '神品', cls: 't-red', rank: 5 },
}

export const SKILL_SLOT_META: Record<SkillSlotType, { label: string; glyph: string }> = {
  INNER: { label: '内功心法', glyph: '内' },
  OUTER: { label: '外功招式', glyph: '外' },
  LIGHT: { label: '轻功身法', glyph: '轻' },
  ULT: { label: '绝技奥义', glyph: '绝' },
}

export const EQUIP_SLOT_META: Record<EquipSlotType, { label: string; glyph: string }> = {
  WEAPON: { label: '兵刃', glyph: '兵' },
  ARMOR: { label: '衣甲', glyph: '甲' },
  ACC: { label: '佩饰', glyph: '佩' },
  RELIC: { label: '秘宝', glyph: '秘' },
}

/** 三才架势：刚猛 克 奇门，奇门 克 太极，太极 克 刚猛 */
export const STANCE_META: Record<StanceType, { name: string; short: string; beats: StanceType; hint: string }> = {
  FIERCE: { name: '刚猛强攻势', short: '刚猛', beats: 'AGILE', hint: '一力降十会 · 爆发 +25%' },
  AGILE: { name: '奇门极速势', short: '奇门', beats: 'TAICHI', hint: '唯快不破 · 暴击 +25%' },
  TAICHI: { name: '太极柔化势', short: '太极', beats: 'FIERCE', hint: '借力卸劲 · 反震 +25%' },
}

export function stanceRelation(mine: StanceType, foe: StanceType): 'WIN' | 'LOSE' | 'EVEN' {
  if (mine === foe) return 'EVEN'
  return STANCE_META[mine].beats === foe ? 'WIN' : 'LOSE'
}

/** 时辰：与 store 的 SHICHEN_LABELS 一一对应（0 子夜 / 1 平旦 / 2 辰时 / 3 日正 / 4 斜阳 / 5 黄昏） */
export type DayPeriod = 'night' | 'dawn' | 'morning' | 'noon' | 'golden' | 'dusk'
export const PERIOD_BY_SHICHEN: DayPeriod[] = ['night', 'dawn', 'morning', 'noon', 'golden', 'dusk']

export function shichenIdxFromDate(d = new Date()): number {
  return Math.floor(((d.getHours() + 1) % 24) / 4)
}

/** 地图 → 场景气候 */
export type MapAmbience = 'rain' | 'pine' | 'desert' | 'swamp'
export const AMBIENCE_BY_MAP: Record<string, MapAmbience> = {
  jiaxing_suburb: 'rain',
  zhongnan_forest: 'pine',
  damo_caravan: 'desert',
  heizhao_swamp: 'swamp',
}
export const MAP_MOOD_LABEL: Record<string, string> = {
  jiaxing_suburb: '江南烟雨',
  zhongnan_forest: '终南松云',
  damo_caravan: '塞外风沙',
  heizhao_swamp: '瘴林夜雾',
}

/** 门派阵营色 */
export const ALIGNMENT_META = {
  RIGHTEOUS: { label: '名门正派', cls: 'text-jade' },
  HERETIC: { label: '邪异旁门', cls: 'text-cinnabar' },
  NEUTRAL: { label: '中立隐世', cls: 'text-gold' },
} as const
