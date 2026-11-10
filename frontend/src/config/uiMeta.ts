import type { SkillSlotType, TierColor } from './typesHelper'
import type { ItemConfig } from './gameData'
import type { PlayerAvatarId } from '@/network/protocol'
import heroine from '@/assets/selection-heroine.webp'
import hero from '@/assets/selection-hero.webp'
export { EQUIP_SLOT_META, STANCE_META, stanceRelation } from '../../../shared/combatMeta.ts'

export const PLAYER_AVATARS: Record<PlayerAvatarId, { label: string; image: string }> = {
  hero_sword: { label: '女侠', image: heroine },
  hero_sword_male: { label: '男侠', image: hero },
}

/** 品质：五色阶 → 中文品名 / CSS 色阶类（见 style.css 的 .t-*） */
export const TIER_META: Record<TierColor, { label: string; cls: string; rank: number }> = {
  green: { label: '凡品', cls: 't-green', rank: 1 },
  blue: { label: '良品', cls: 't-blue', rank: 2 },
  purple: { label: '上品', cls: 't-purple', rank: 3 },
  orange: { label: '绝品', cls: 't-orange', rank: 4 },
  red: { label: '神品', cls: 't-red', rank: 5 },
}

export const SKILL_SLOT_META: Record<SkillSlotType, { label: string; glyph: string }> = {
  INNER: { label: '内功', glyph: '内' },
  OUTER: { label: '外功', glyph: '外' },
  LIGHT: { label: '轻功', glyph: '轻' },
  ULT: { label: '绝技', glyph: '绝' },
}

export const BASE_STAT_LABELS = { str: '臂力', con: '根骨', agi: '身法', intStat: '悟性', luck: '福缘', karma: '侠义' }

const skillPowerFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 })
export const formatSkillPower = (power: number) => skillPowerFormat.format(power)

export function itemBonusLabels(item: ItemConfig) {
  const labels: string[] = []
  if (item.atkBonus) labels.push(`攻击 +${item.atkBonus.toLocaleString()}`)
  if (item.defBonus) labels.push(`防御 +${item.defBonus.toLocaleString()}`)
  if (item.hpBonus) labels.push(`气血 +${item.hpBonus.toLocaleString()}`)
  if (item.critBonus) labels.push(`暴击率 +${item.critBonus}%`)
  if (item.dodgeBonus) labels.push(`闪避率 +${item.dodgeBonus}%`)
  if (item.slot === 'ARMOR' && item.idleBonus) labels.push(`修行真气 +${item.idleBonus}%`)
  return labels
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
