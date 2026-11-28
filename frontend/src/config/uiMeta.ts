import type { SkillSlotType, TierColor } from './typesHelper'
import type { ItemConfig, MedicineConfig, SkillConfig } from './gameData'
import type { PlayerAvatarId } from '@/network/protocol'
import { EQUIP_SLOT_META, formatBattleStatBonuses, isWeaponForm, type BattleStatBonuses } from '../../../shared/combatMeta.ts'
import type { TrialDropDTO } from '../../../shared/protocol.ts'
import { GROWTH_PROFILE_META, skillUpgradeCostScale, type SkillMasteryStage } from '../../../shared/skillMastery.ts'
import { trialAffixLabel, trialAffixQuality } from '../../../shared/trialStages.ts'
import heroine from '@/assets/_optimized/avatars-full/selection-heroine.webp'
import hero from '@/assets/_optimized/avatars-full/selection-hero.webp'
import heroineThumb from '@/assets/_optimized/avatars/selection-heroine.webp'
import heroThumb from '@/assets/_optimized/avatars/selection-hero.webp'
export { EQUIP_SLOT_META, STANCE_META, stanceRelation } from '../../../shared/combatMeta.ts'

export const PLAYER_AVATARS: Record<PlayerAvatarId, { label: string; image: string; thumbnail: string }> = {
  hero_sword: { label: '女侠', image: heroine, thumbnail: heroineThumb },
  hero_sword_male: { label: '男侠', image: hero, thumbnail: heroThumb },
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

export type SkillGrowthUiInfo = {
  profile: 'EARLY' | 'LATE'
  label: string
  shortLabel: string
  desc: string
  tone: 'gold' | 'purple'
  chipClass: 'chip-gold' | 'chip-purple'
  costScale: number
  costText: '0.85x' | '1.15x'
  costLabel: string
  costShort: string
  costBadge: string
  costTone: 'jade' | 'red'
  costChipClass: 'chip-jade' | 'chip-red'
}

export function skillGrowthInfo(skill: Pick<SkillConfig, 'growthProfile'>): SkillGrowthUiInfo | undefined {
  const profile = skill.growthProfile
  if (profile !== 'EARLY' && profile !== 'LATE') return undefined
  const meta = GROWTH_PROFILE_META[profile]
  const costScale = skillUpgradeCostScale(profile)
  const isEarly = profile === 'EARLY'
  const costText = isEarly ? '0.85x' : '1.15x'
  return {
    profile,
    label: meta.label,
    shortLabel: meta.shortLabel,
    desc: meta.desc,
    tone: isEarly ? 'gold' : 'purple',
    chipClass: isEarly ? 'chip-gold' : 'chip-purple',
    costScale,
    costText,
    costLabel: isEarly ? '参悟消耗 0.85x（省 15%）' : '参悟消耗 1.15x（多 15%）',
    costShort: `消耗 ${costText}`,
    costBadge: `${meta.shortLabel} ${costText}`,
    costTone: isEarly ? 'jade' : 'red',
    costChipClass: isEarly ? 'chip-jade' : 'chip-red',
  }
}

export type SkillTempoUiInfo = {
  kind: 'OPENING_SURGE' | 'COMBAT_RAMP'
  tag: 'SURGE' | 'RAMP'
  shortLabel: '前段抢攻' | '越战越勇'
  label: string
  tone: 'red' | 'jade'
  chipClass: 'chip-red' | 'chip-jade'
  summary: string
}

export function skillTempoInfo(skill: Pick<SkillConfig, 'battleEffects'>): SkillTempoUiInfo | undefined {
  const surge = skill.battleEffects?.find((effect) => effect.kind === 'OPENING_SURGE')
  if (surge) {
    const earlyParts: string[] = []
    if (surge.speedPercent) earlyParts.push(`出手速度 +${surge.speedPercent}%`)
    if (surge.damagePercent) earlyParts.push(`${surge.outerOnly ? '外功' : ''}伤害 +${surge.damagePercent}%`)
    if (surge.critPoints) earlyParts.push(`暴击率 +${surge.critPoints}%`)
    const fadeParts: string[] = []
    if (surge.fadeDamagePercent) fadeParts.push(`伤害 ${surge.fadeDamagePercent}%`)
    if (surge.fadeDodgePoints) fadeParts.push(`闪避 −${surge.fadeDodgePoints}%`)
    const summaryParts = [
      earlyParts.length ? `第 1~${surge.surgeUntilRound} 回合${surge.surgeLabel ? `「${surge.surgeLabel}」` : ''}${earlyParts.join('、')}` : '',
      fadeParts.length ? `第 ${surge.fadeFromRound} 回合起${surge.fadeLabel ? `「${surge.fadeLabel}」` : ''}${fadeParts.join('、')}` : '',
    ].filter(Boolean)
    return {
      kind: 'OPENING_SURGE',
      tag: 'SURGE',
      shortLabel: '前段抢攻',
      label: surge.surgeLabel ? `前段抢攻 · ${surge.surgeLabel}` : '前段抢攻',
      tone: 'red',
      chipClass: 'chip-red',
      summary: summaryParts.join('；'),
    }
  }
  const ramp = skill.battleEffects?.find((effect) => effect.kind === 'COMBAT_RAMP')
  if (ramp) {
    const parts: string[] = []
    if (ramp.activateRound) {
      const buffs: string[] = []
      if (ramp.physReductionPercent) buffs.push(`物理减伤 +${ramp.physReductionPercent}%`)
      if (ramp.healBonusPercent) buffs.push(`回血效果 +${ramp.healBonusPercent}%`)
      if (buffs.length) parts.push(`第 ${ramp.activateRound} 回合起激活「${ramp.rampLabel}」：${buffs.join('、')}`)
    } else {
      if (ramp.startDamagePercent) parts.push(`首回合伤害 ${ramp.startDamagePercent}%`)
      const perRound: string[] = []
      if (ramp.damagePerRound) perRound.push(`伤害 +${ramp.damagePerRound}%`)
      if (ramp.critPerRound) perRound.push(`暴击率 +${ramp.critPerRound}%`)
      if (perRound.length) {
        parts.push(`第 2 回合起每回合叠加「${ramp.rampLabel}」：${perRound.join('、')}${ramp.maxStacks ? `（最多 ${ramp.maxStacks} 层）` : ''}`)
      }
    }
    return {
      kind: 'COMBAT_RAMP',
      tag: 'RAMP',
      shortLabel: '越战越勇',
      label: `越战越勇 · ${ramp.rampLabel}`,
      tone: 'jade',
      chipClass: 'chip-jade',
      summary: parts.join('；'),
    }
  }
  return undefined
}

export type SkillMasteryTimelineItem = SkillMasteryStage & {
  state: 'current' | 'reached' | 'upcoming' | 'preview'
}

export function skillMasteryTimeline(
  skill: Pick<SkillConfig, 'masteryStages'>,
  currentMastery?: number,
): SkillMasteryTimelineItem[] {
  const stages = [...(skill.masteryStages ?? [])].sort((a, b) => a.minMastery - b.minMastery)
  if (!stages.length) return []
  if (!currentMastery || currentMastery <= 0) {
    return stages.map((stage) => ({ ...stage, state: 'preview' }))
  }
  const active = [...stages].reverse().find((stage) => stage.minMastery <= currentMastery)
  return stages.map((stage) => ({
    ...stage,
    state: active?.minMastery === stage.minMastery
      ? 'current'
      : stage.minMastery <= currentMastery
        ? 'reached'
        : 'upcoming',
  }))
}

export function equipmentType(item: ItemConfig) {
  const slot = EQUIP_SLOT_META[item.slot].label
  if (item.slot === 'RELIC') return '全队装备 · ' + slot
  if (item.slot !== 'WEAPON') return '装备 · ' + slot
  const forms = { BLADE: '刀剑', AXE: '斧', STAFF: '棍杖', SPEAR: '枪', BOW: '弓', WHIP: '鞭', ODD: '奇门', SOUND: '音律' }
  if (item.name.endsWith('匕首')) return '武器 · 匕首'
  if (item.name.endsWith('长剑')) return '武器 · 长剑'
  return isWeaponForm(item.combatForm) ? '武器 · ' + forms[item.combatForm] : '装备 · ' + slot
}

export function medicineType(medicine: MedicineConfig) {
  if (medicine.acupointEffect?.type === 'BREAKTHROUGH_RATE' || medicine.acupointEffect?.type === 'PREVENT_DEVIATION') return '丹药 · 突破'
  return { BODY_MOD: '丹药 · 体质奇珍', BATTLE_PILL: '丹药 · 战斗', WEAPON_VENOM: '药物 · 兵刃毒膏', ACUPOINT_PILL: '丹药 · 冲穴' }[medicine.category]
}

export function itemBonusRows(item: ItemConfig) {
  const rows: { key: string; label: string; value: string }[] = []
  function add(key: string, label: string, amount?: number, unit = '') {
    if (amount) rows.push({ key, label, value: `${amount > 0 ? '+' : '−'}${Math.abs(amount).toLocaleString('zh-CN')}${unit}` })
  }
  add('atkBonus', '攻击', item.atkBonus)
  add('defBonus', '防御', item.defBonus)
  add('hpBonus', '气血', item.hpBonus)
  add('critBonus', '暴击率', item.critBonus, '%')
  add('dodgeBonus', '闪避率', item.dodgeBonus, '%')
  if (item.slot === 'ARMOR') add('idleBonus', '修行真气', item.idleBonus, '%')
  add('patrolQiBonus', '打坐真气', item.patrolQiBonus, '%（巡历装备合计上限 20%）')
  add('patrolSilverBonus', '打坐纹银', item.patrolSilverBonus, '%')
  add('idleQiPerHour', '每小时打坐真气', item.idleQiPerHour)
  function addStats(stats: BattleStatBonuses) {
    for (const [key, amount] of Object.entries(stats)) {
      if (!amount) continue
      const text = formatBattleStatBonuses({ [key]: amount })
      const separator = text.indexOf(' ')
      const previous = rows.find((row) => row.key === key)
      const value = text.slice(separator + 1)
      if (previous) previous.value += '、' + value
      else rows.push({ key, label: text.slice(0, separator), value })
    }
  }
  if (item.attributeBonus) addStats(item.attributeBonus)
  for (const effect of item.battleEffects ?? []) {
    if (effect.kind === 'STAT_BONUS') addStats(effect.stats)
  }
  return rows
}

export function itemBonusLabels(item: ItemConfig) {
  return itemBonusRows(item).map(({ label, value }) => `${label} ${value}`)
}

export function trialDropLabel(drop: TrialDropDTO) {
  const outcome = drop.outcome === 'UPGRADED' ? '已提升' : drop.outcome === 'DUPLICATE' ? '重复' : '获得'
  return [drop.battle && `第 ${drop.battle} 场`, drop.name, trialAffixQuality(drop.id, drop.affixRoll), trialAffixLabel(drop.id, drop.affixRoll), outcome, drop.marksEarned && '印记 +1']
    .filter(Boolean).join(' · ')
}

/** 时辰：与 store 的 SHICHEN_LABELS 一一对应（0 子夜 / 1 平旦 / 2 辰时 / 3 日正 / 4 斜阳 / 5 黄昏） */
export type DayPeriod = 'night' | 'dawn' | 'morning' | 'noon' | 'golden' | 'dusk'
export const PERIOD_BY_SHICHEN: DayPeriod[] = ['night', 'dawn', 'morning', 'noon', 'golden', 'dusk']

export { shichenIdxFromDate } from '../../../shared/combatMeta.ts'

/** 地图 → 场景气候 */
export type MapAmbience = 'rain' | 'pine' | 'desert' | 'swamp'
export const AMBIENCE_BY_MAP: Record<string, MapAmbience> = {
  jiaxing_suburb: 'rain',
  zhongnan_forest: 'pine',
  damo_caravan: 'desert',
  heizhao_swamp: 'swamp',
  guiyun_lake: 'rain',
  taohua_isle: 'pine',
  huashan_peak: 'pine',
}
export const MAP_MOOD_LABEL: Record<string, string> = {
  jiaxing_suburb: '江南烟雨',
  zhongnan_forest: '终南松云',
  damo_caravan: '塞外风沙',
  heizhao_swamp: '瘴林夜雾',
  guiyun_lake: '太湖烟波',
  taohua_isle: '桃岛落英',
  huashan_peak: '华山云海',
  xiangyang_city: '襄阳城中广场',
}

/** 门派阵营色 */
export const ALIGNMENT_META = {
  RIGHTEOUS: { label: '名门正派', cls: 'text-jade' },
  HERETIC: { label: '邪异旁门', cls: 'text-cinnabar' },
  NEUTRAL: { label: '中立隐世', cls: 'text-gold' },
} as const
