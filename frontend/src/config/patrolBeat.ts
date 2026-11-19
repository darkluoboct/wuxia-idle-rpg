import type { BattleEventDTO, CombatUnitDTO, TierColor } from '@/network/protocol'
import type { PortraitStyle } from '@/config/typesHelper'
import { SKILLS } from '@/config/gameData'
import type { AttackForm, DamageElement } from '../../../shared/combatMeta.ts'

/**
 * 巡历画面的一招怎么演（docs/25）：谁冲上去、打在谁身上、出什么特效、飘什么字。
 * 只看战报里的这一条，不改战斗结果。
 */
type Slot = CombatUnitDTO['slot']
export type StrikeFx = 'slash' | 'palm' | 'thrust' | 'claw' | 'ripple' | 'lash'
export type BeatFx = StrikeFx | 'heal' | 'guard' | 'dodge' | 'burst'
export type BeatTone = 'steel' | 'gold' | 'jade' | 'venom' | 'blood' | 'frost' | 'flame'
export interface BeatPopup { text: string; tone: 'hurt' | 'crit' | 'qi' | 'venom' | 'heal' | 'dodge' }

export interface PatrolBeat {
  /** 冲上去出招的人；持续伤害、被动效果没有 */
  attacker?: Slot
  target?: Slot
  fx?: BeatFx
  tone: BeatTone
  /** 掉了气血：击退加受击红闪 */
  hit: boolean
  crit: boolean
  /** 出招者头顶的招式名；绝技改用横幅 */
  callout?: { text: string; sub?: string; tier?: TierColor }
  ult?: { text: string; sub: string }
  popups: Partial<Record<Slot, BeatPopup>>
}

const FORM_FX: Record<AttackForm, StrikeFx> = {
  BLADE: 'slash', AXE: 'slash', STAFF: 'thrust', SPEAR: 'thrust', BOW: 'thrust', WHIP: 'lash', ODD: 'thrust', SOUND: 'ripple',
  FIST: 'palm', PALM: 'palm', FINGER: 'thrust', CLAW: 'claw', KICK: 'palm', PROJECTILE: 'thrust', QI: 'ripple',
}
/** 小怪没有招式，按画像的随身兵器出特效 */
const PORTRAIT_FX: Partial<Record<PortraitStyle, StrikeFx>> = { bandit: 'slash', daoist: 'slash', assassin: 'thrust', monk: 'palm' }
const ELEMENT_TONE: Record<DamageElement, BeatTone> = { FIRE: 'flame', COLD: 'frost', WATER: 'frost', POISON: 'venom' }
const CATEGORY_TONE: Partial<Record<string, BeatTone>> = { qi: 'gold', true: 'gold', poison: 'venom', bleed: 'blood', heal: 'jade' }
const DAMAGE_LABELS: Partial<Record<string, string>> = { poison: '毒伤 ', bleed: '流血 ', reflect: '反伤 ', true: '真伤 ' }

export function patrolBeat(event: BattleEventDTO, units: readonly CombatUnitDTO[]): PatrolBeat {
  const damage = event.segments.find((segment) => segment.type === 'damage')
  const category = damage?.type === 'damage' ? damage.category : 'phys'
  const skill = SKILLS[event.skillId ?? '']
  const delta = event.hpDelta ?? 0
  const crit = event.hitResult === 'CRIT'
  const dodged = event.hitResult === 'DODGE'
  const target = event.targetSlot
  const beat: PatrolBeat = {
    target, hit: delta < 0, crit, popups: {},
    tone: delta > 0 ? 'jade' : (skill?.element && ELEMENT_TONE[skill.element]) ?? CATEGORY_TONE[category] ?? 'steel',
  }

  if (target && dodged) beat.popups[target] = { text: '闪避', tone: 'dodge' }
  else if (target && delta) {
    const label = DAMAGE_LABELS[category] ?? (crit ? '暴击 ' : event.hitResult === 'PARRY' ? '招架 ' : '')
    beat.popups[target] = {
      text: delta > 0 ? `+${delta.toLocaleString()}` : `${label}${delta.toLocaleString()}`,
      tone: delta > 0 ? 'heal' : crit ? 'crit' : category === 'poison' ? 'venom' : category === 'qi' || category === 'true' ? 'qi' : 'hurt',
    }
  } else if (target && event.shieldAbsorbed) beat.popups[target] = { text: `护盾吸收 ${event.shieldAbsorbed.toLocaleString()}`, tone: 'heal' }
  if (event.reflectDelta) beat.popups[event.actorSlot] = { text: `反伤 ${event.reflectDelta.toLocaleString()}`, tone: 'hurt' }

  const striking = event.type === 'SKILL_CAST' || event.type === 'ASSIST_ATTACK'
  if (dodged) {
    // 闪避这一条记在闪开的人名下，冲上来的是对面的主将
    const side = target?.startsWith('ALLY') ? 'ENEMY' : 'ALLY'
    beat.attacker = units.find((unit) => unit.slot === `${side}_MAIN`)?.slot ?? units.find((unit) => unit.slot.startsWith(side))?.slot
    beat.fx = 'dodge'
  } else if (event.type === 'GUARD_BLOCK') {
    beat.attacker = event.actorSlot
    beat.fx = 'guard'
  } else if (striking && delta < 0) {
    beat.attacker = event.actorSlot
    const portrait = units.find((unit) => unit.slot === event.actorSlot)?.portraitStyle
    beat.fx = skill ? FORM_FX[skill.combatForm ?? 'FIST'] : (portrait && PORTRAIT_FX[portrait]) ?? 'palm'
  } else beat.fx = delta > 0 ? 'heal' : event.shieldAbsorbed ? 'guard' : 'burst'

  if (striking && event.skillName && event.isUlt) {
    const actor = units.find((unit) => unit.slot === event.actorSlot)
    beat.ult = { text: event.skillName, sub: `${actor?.name ?? '侠客'} · 使出绝技` }
  } else if (striking && event.skillName && skill) {
    beat.callout = { text: event.skillName, sub: event.type === 'ASSIST_ATTACK' ? '追击' : undefined, tier: event.skillTier }
  }
  return beat
}
