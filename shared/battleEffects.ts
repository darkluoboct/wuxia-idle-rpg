import {
  companionItemId, damageAfterDefense, EQUIP_SLOT_META, formatBattleStatBonuses, isWeaponForm, matchesEnemyTrait, NIGHT_HIT_PENALTY, PERSONAL_EQUIP_SLOTS, STANCE_META, STANDARD_HIT_RAGE,
  type AttackForm, type BattleEnvironment, type BattleStatBonuses, type BattleStatusRule, type ControlKind, type DamageElement, type EnemyCombatConfig, type EnemyTrait, type ModifierStatus, type StrikeMatch,
  type EnemyBattleReaction, type PeriodicKind, type PeriodicRule,
} from './combatMeta.ts'
import { ACUPOINTS, activeJianghuTitle, canEquipCompanionItem, equippedBattleMedicines, equipmentItem, ITEMS, meetsItemStatRequirement, SKILLS, type CompanionView, type ItemConfig, type SkillConfig } from './gameData.ts'
import { gaibangAttributeBonus, gaibangPerks, gaibangSilverGain } from './gaibang.ts'
import { clampKarma, equippedMartialSkills, hasWandererMastery, martialEffectiveness, wandererStatBonuses, WANDERER_MASTERY } from './martialSchools.ts'
import { enemySilverReward } from './player.ts'
import type { BattleEventDTO, BattleReportDTO, CombatUnitDTO, LoadoutPresetDTO, PlayerDTO, RichSegment, StanceType } from './protocol.ts'
import { STORY_SNAKE_ADVENTURE } from './storySnake.ts'
import { sectEquipmentSetOf, WANDERER_EQUIPMENT, wandererEquipmentBonus } from './sectEquipment.ts'
import { trialSetOf } from './trialStages.ts'

type HealingTrigger = 'ACTION_END' | 'ROUND_END' | 'DODGE'
type OnHit = {
  attack?: 'OUTER' | 'ULT'; attackerStance?: StanceType; unavoidable?: true; regularOuterOnly?: true;
  skillIds?: readonly string[]; matches?: StrikeMatch;
}

export type BattleEffect =
  | { kind: 'STAT_BONUS'; stats: BattleStatBonuses; stance?: StanceType }
  | { kind: 'MARTIAL_FREEDOM' }
  | { kind: 'RETREAT_CHANCE'; percent: number }
  | { kind: 'SCARE_CREATURE'; chancePercent: number }
  | { kind: 'CONCEALMENT_REDUCTION'; points: number }
  | { kind: 'PARRY_MP_DISCOUNT'; percent: number }
  | { kind: 'REAR_OUTER_TARGET' }
  | { kind: 'TEAM_STATS'; stats: BattleStatBonuses }
  | { kind: 'MIXED_KARMA_HARMONY'; speedPercent: number; rage: number }
  | { kind: 'TEAM_OUTER_DAMAGE'; percent: number }
  | { kind: 'OPENING_TEAM_DODGE'; points: number }
  | { kind: 'RAIN_NIGHT_SPEED'; percent: number }
  | { kind: 'SWAMP_DODGE'; points: number }
  | { kind: 'NIGHT_VISION' }
  | { kind: 'WATER_BATTLE_DAMAGE'; percent: number }
  | { kind: 'COMPANION_TEAM_REDUCTION'; percent: number }
  | { kind: 'TEAM_KILL_RECOVERY'; hpPercent: number; rage: number }
  | { kind: 'KILL_QI_GAIN'; percent: number }
  | { kind: 'KILL_SILVER_GAIN'; percent: number }
  | { kind: 'LETHAL_POISON_REFLECT'; percent: number }
  | { kind: 'TEAM_AREA_REDUCTION'; percent: number }
  | { kind: 'DISMOUNT_CAVALRY' }
  | { kind: 'GUOJING_COMBO'; attackPercent: number }
  | { kind: 'COMPANION_ASSIST_CHANCE'; points: number }
  | { kind: 'OUTER_DAMAGE'; percent: number; belowHpPercent?: number; attackerStance?: StanceType; skillOnly?: true }
  | ({ kind: 'TECHNIQUE_DAMAGE'; percent: number } & StrikeMatch)
  | ({ kind: 'INNER_PRESSURE_DAMAGE'; percent: number } & StrikeMatch)
  | { kind: 'INNER_PRESSURE_REDUCTION'; percent: number }
  | ({ kind: 'GUARD_BYPASS'; guard: 'PARRY' | 'SHIELD' } & StrikeMatch)
  | { kind: 'REVERSE_BUFF'; chancePercent: number; attackPercent: number; rounds: number }
  | ({ kind: 'GUARANTEED_CRIT' } & StrikeMatch)
  | ({ kind: 'STRIKE_SPLASH'; percent: number } & StrikeMatch)
  | ({ kind: 'WOUNDED_TRUE_DAMAGE'; attackPercent: number } & StrikeMatch)
  | ({ kind: 'ULT_RAGE_DISCOUNT'; skillId: string } & ({ points: number } | { percent: number }))
  | { kind: 'GUARDED_POSITION_DAMAGE'; percent: number }
  | { kind: 'OPENING_ASSASSINATION'; truePercent: number }
  | { kind: 'OUTER_TRUE_CONVERSION'; truePercent: number; label: string; anyOuter?: true }
  | { kind: 'LETHAL_COUNTER' }
  | { kind: 'OUTER_TRUE_DAMAGE'; amount: number }
  | { kind: 'OUTER_TRUE_DAMAGE'; defensePercent: number }
  | { kind: 'ACTION_START_TRUE_DAMAGE'; amount: number }
  | { kind: 'ACTION_END_DARTS'; count: number; attackPercent: number; rule: PeriodicRule }
  | { kind: 'HIDDEN_WEAPON_DAMAGE'; percent: number }
  | { kind: 'HIDDEN_WEAPON_CHANCE'; points: number }
  | { kind: 'HIDDEN_WEAPON_CAPACITY'; slots: number }
  | { kind: 'STRIKE_PHYSICAL_DAMAGE'; maxHpPercent: number; aboveHpPercent: number }
  | { kind: 'GUARDED_TARGET_CRIT_DAMAGE'; multiplier: number }
  | { kind: 'CRIT_DAMAGE'; percent: number }
  | { kind: 'ULT_DAMAGE'; percent: number }
  | { kind: 'CRIT_RAGE'; amount: number }
  | { kind: 'WOUNDED_DEFENSE_CRIT'; defensePercent: number; critPoints: number }
  | { kind: 'DESPERATE_EXECUTION'; belowHpPercent: number; bossMaxHpPercent: number; bossAttackPercent: number }
  | ({ kind: 'WOUNDED_DAMAGE'; attackPercent: number; critDamagePercent: number; damageMultiplier?: number } &
      ({ hpStepPercent: number } | { belowHpPercent: number }))
  | { kind: 'ARMOR_PENETRATION'; percent: number; regularOuterOnly?: true }
  | { kind: 'FLAT_ARMOR_PENETRATION'; points: number; attackerStance?: StanceType }
  | { kind: 'ROUND_START_SHIELD'; maxMpPercent: number; openingSelfOnly?: true }
  | { kind: 'TEAM_SHIELD_BONUS'; percent: number }
  | { kind: 'LOW_HP_SHIELD'; belowHpPercent: number; maxHpPercent: number; rounds: number }
  | { kind: 'LOW_HP_FURY'; belowHpPercent: number; attackPercent: number; rounds: number; statusName: string; controlImmunity?: true; guaranteedCrit?: true }
  | { kind: 'TEAM_OPENING_SPEED'; percent: number; rounds: number }
  | { kind: 'CHARGED_ULT'; moveName: string; powerRatio: number }
  | { kind: 'POINT_CAST_IMMUNITY' }
  | { kind: 'SHIELD_REND'; multiplier: number; bleedRounds: number; bleedAttackPercent: number }
  | { kind: 'OUTER_SHIELD_REND'; multiplier: number }
  | { kind: 'OUTER_BLEED_DURATION'; extraRounds: number }
  | { kind: 'POISON_BLEED_DAMAGE'; percent: number }
  | { kind: 'PERIODIC_TICK_DAMAGE'; category: 'poison' | 'bleed'; percent: number }
  | { kind: 'POISON_BURST'; stacks: number; lostHpPercent: number }
  | { kind: 'CRIT_POISON_BURST' }
  | { kind: 'TRANSFER_ON_LETHAL' }
  | { kind: 'PERIODIC_ON_HIT'; rule: PeriodicRule; regularOuterOnly?: true; attack?: 'OUTER' | 'ULT'; lastRound?: number }
  | { kind: 'ROUND_START_PILL'; round: number; defensePercent: number; rounds: number }
  | { kind: 'LOW_MP_PILL'; belowMpPercent: number; ultDamagePercent: number }
  | { kind: 'CRIT_RECEIVE_PILL'; healPercent: number; outerReduction: number }
  | { kind: 'PERIODIC_ON_RECEIVE'; rule: PeriodicRule }
  | { kind: 'PERIODIC_IMMUNITY'; status: PeriodicKind }
  | ({ kind: 'PERIODIC_REDUCTION'; percent: number } & ({ category: 'poison' | 'bleed' } | { status: PeriodicKind }))
  | { kind: 'POISON_MP_RECOVERY'; resistancePercent: number; recoverPercent: number }
  | { kind: 'TARGET_STANCE_DAMAGE'; stance: StanceType; percent: number }
  | { kind: 'TARGET_TRAIT_DAMAGE'; traits?: readonly EnemyTrait[]; percent: number; team?: true; negativeKarma?: true }
  | { kind: 'ELEMENT_DAMAGE'; element: DamageElement; percent: number }
  | { kind: 'ELEMENT_RESISTANCE'; elements?: readonly DamageElement[]; percent: number }
  | { kind: 'KARMA_DAMAGE_MULTIPLIER'; multiplier: number }
  | { kind: 'POISON_TARGET_CRIT'; points: number; perStack?: true }
  | { kind: 'COMPANION_ARCHERY'; extraArrows: number }
  | { kind: 'COMPANION_POISON_CRIT'; pointsPerStack: number }
  | { kind: 'COMPANION_DAMAGE'; percent: number }
  | { kind: 'ROUND_OUTER_COMBO'; chancePercent: number }
  | { kind: 'OUTER_FOLLOW_UP'; chancePercent: number; moveName?: string; trueAtkPercent?: number; damagePercent?: number;
      powerRatio?: number; periodic?: PeriodicRule; status?: BattleStatusRule; noParry?: true; front?: true; hiddenWeapon?: true;
      basicOnly?: true; trigger?: 'OUTER_CAST' | 'ULT_CAST' }
  | { kind: 'OUTER_COMBO_CHANCE'; points: number }
  | { kind: 'OUTER_COMBO_DAMAGE'; percent: number; perHit?: true }
  | { kind: 'OUTER_LIFESTEAL' | 'ATTACK_LIFESTEAL'; percent: number }
  | { kind: 'PHYSICAL_DAMAGE_REDUCTION'; percent: number; attackerStance?: StanceType; attackerTraits?: readonly EnemyTrait[]; criticalOnly?: true; belowHpPercent?: number; alsoPeriodic?: true }
  | { kind: 'BLADE_CATCH'; parryPoints: number; chancePercent: number; reflectPercent: number; attackDownPercent: number }
  | { kind: 'MELEE_PARRY'; points: number }
  | { kind: 'FEMALE_ATTACKER_DEFENSE'; parryPoints: number; dodgePoints: number }
  | { kind: 'PHYSICAL_BLOCK'; chancePercent: number; percent: number; label?: string; outerOnly?: true; sharedRoll?: string }
  | { kind: 'HIT_QI_ABSORB'; chancePercent: number }
  | { kind: 'BANDIT_BEAST_REDUCTION'; amount: number }
  | { kind: 'REVERSE_STANCE_DEFENSE' }
  | { kind: 'STORE_INCOMING_DAMAGE'; percent: number }
  | { kind: 'REFLECT_CRIT_POISON'; percent: number }
  | { kind: 'HIT_REFLECTION'; percent: number }
  | { kind: 'PARRY_REFLECT'; percent: number; team?: true }
  | { kind: 'PARRY_HEAL'; defensePercent: number }
  | { kind: 'DAMAGE_SHARE_FORMATION'; parryPoints: number; hitRageMultiplier: number; sharedRage?: true }
  | { kind: 'COMPANION_LETHAL_INTERCEPT' }
  | { kind: 'COMPANION_TURN_STATUS'; companionId: string; moveName: string; every: number; rule: BattleStatusRule }
  | { kind: 'LEADER_COVER'; trigger: 'HIT' | 'HEAVY' | 'LETHAL' | 'GUARD'; percent: number; repeat?: true;
      counter?: { skillId: string; stance: StanceType; target: 'FRONT' | 'ATTACKER' }; status?: BattleStatusRule; poison?: PeriodicRule; cleanseTeam?: true }
  | ({ kind: 'ON_HIT_STATUS' } & OnHit &
      ({ rule: BattleStatusRule; area?: true } | { rules: readonly BattleStatusRule[]; chancePercent: number }))
  | { kind: 'ON_RECEIVE_STATUS'; rule: BattleStatusRule }
  | { kind: 'ULT_AREA_TRUE_DAMAGE'; maxMpPercent: number; rule: BattleStatusRule }
  | { kind: 'OUTER_AREA_DAMAGE'; attackPercent: number; chancePercent: number; moveName: string; element?: DamageElement }
  | { kind: 'ON_DODGED_STRIKE'; attackPercent: number; moveName: string; hiddenWeapon?: true }
  | { kind: 'TRUE_STRIKE'; chancePercent: number; moveName: string; team?: true }
  | { kind: 'OUTER_CHARGE_BREAK'; stance: StanceType; chancePercent: number }
  | { kind: 'OPENING_ENEMY_STATUS'; rule: BattleStatusRule }
  | { kind: 'ROUND_ENEMY_STATUS'; rule: BattleStatusRule; every?: number; leaderOnly?: true; requiresOuterSkillId?: string }
  | { kind: 'CLEANSE_CONTROL' }
  | { kind: 'FIRST_LEADER_CLEANSE'; status: ControlKind }
  | { kind: 'ROUND_CLEANSE'; statuses?: readonly PeriodicKind[]; team?: true }
  | { kind: 'ROUND_TEAM_RESTORE'; every: number; hpPercent: number }
  | { kind: 'CONTROL_IMMUNITY'; statuses?: readonly ControlKind[]; aboveHpPercent?: number }
  | { kind: 'STATUS_IMMUNITY'; status: ModifierStatus }
  | { kind: 'CONTROL_RESIST'; chancePercent: number; statuses?: readonly ControlKind[] }
  | { kind: 'STATUS_DURATION_REDUCTION'; rounds?: number; scalePercent?: number; controlOnly?: true }
  | { kind: 'HIT_RAGE'; amount: number }
  | { kind: 'HIT_RAGE'; baseHitRagePercent: number }
  | { kind: 'RAGE_GAIN_PERCENT'; percent: number }
  | { kind: 'HIT_MP_RECOVERY'; hpLossPercent: number }
  | { kind: 'SELF_ROUND_HEAL_BONUS'; percent: number }
  | { kind: 'DODGE_RAGE'; amount: number }
  | { kind: 'DODGE_CAP'; percent: number }
  | { kind: 'LIGHT_DODGE_PENETRATION'; percent: number }
  | { kind: 'ABSOLUTE_DODGE' | 'ABSOLUTE_PARRY'; chancePercent: number }
  | { kind: 'DODGE_SILVER'; amount: number }
  | { kind: 'OPENING_PRIORITY'; chancePercent?: number }
  | { kind: 'CRIT_ACTION'; advancePercent: number; followUpChance: number; moveName: string; powerRatio: number }
  | { kind: 'ROUND_END_MP_RECOVERY'; percent: number }
  | { kind: 'MP_RECOVERY_BONUS'; percent: number }
  | { kind: 'DODGE_GUARANTEED_CRIT' }
  | { kind: 'DODGE_STATUS'; rule: BattleStatusRule }
  | { kind: 'DODGE_COUNTER'; stat: 'atk' | 'agi'; percent: number; category: 'phys' | 'true'; oncePerRound?: true; chancePercent?: number }
  | {
      kind: 'FIRST_LETHAL_SAVE'
      heal?: { percent: number; restoreToPercent?: true }
      revive?: true
      reflectDefensePercent?: number
      guardRound?: true
      escapeNextRound?: true
      retreatBattle?: true
      cleanseInnerInjury?: true
    }
  | { kind: 'DUAL_STATUS_BURST'; stacks: number; rounds: number; tickAtkPercent: number; burstHpPercent: number; bossAtkMultiplier: number }
  | { kind: 'INTERRUPT_CHARGE' }
  | { kind: 'MELEE_RETALIATION'; reflectPercent: number; poisonRounds: number; poisonAttackPercent: number }
  | { kind: 'MELEE_RETALIATION'; reflectPercent: number; fromHpLoss: true }
  | {
      kind: 'HEAL'
      trigger: HealingTrigger
      target: 'SELF' | 'ALLIES' | 'LEADER'
      amount: number
      unit: 'HP' | 'MAX_HP_PERCENT'
      belowHpPercent?: number
    }

type EffectSource = { id: string; name: string; battleEffects?: readonly BattleEffect[] }
export type ActiveEffect = BattleEffect & { sourceId: string; sourceName: string; sourceType?: 'EQUIPMENT' | 'INNER' | 'TITLE' | 'MEDICINE' }
type MeleeRetaliation = Extract<ActiveEffect, { kind: 'MELEE_RETALIATION' }>
type LethalSave = Extract<ActiveEffect, { kind: 'FIRST_LETHAL_SAVE' }>
type BuffReversal = Extract<ActiveEffect, { kind: 'REVERSE_BUFF' }>
type DualStatusBurst = Extract<ActiveEffect, { kind: 'DUAL_STATUS_BURST' }>
export type CritAction = Extract<ActiveEffect, { kind: 'CRIT_ACTION' }>
export type DamageShareFormation = Extract<ActiveEffect, { kind: 'DAMAGE_SHARE_FORMATION' }>
export type TrueStrike = Extract<ActiveEffect, { kind: 'TRUE_STRIKE' }>

export interface DodgeEffectState {
  pendingCrit?: Extract<ActiveEffect, { kind: 'DODGE_GUARANTEED_CRIT' }>
  lastCounterRound?: number
}

const RUANWEI_POISON = '软猬剧毒'
const BLEEDING = '流血'
const CHARGING = '蓄力'
const SHIELDED = '护盾'
const ELEMENT_LABELS: Record<DamageElement, string> = { WATER: '水系', COLD: '阴寒', POISON: '毒系', FIRE: '火系' }

const PERIODIC_DAMAGE = {
  poison: { name: RUANWEI_POISON, label: '毒伤', category: 'poison', expires: '，毒效结束。' },
  needlePoison: { name: '扇骨针毒', label: '毒伤', category: 'poison', expires: '，针毒结束。' },
  venom: { name: '剧毒', label: '毒伤', category: 'poison', expires: '，剧毒结束。' },
  snakeVenom: { name: '蛇奴毒雾', label: '毒伤', category: 'poison', expires: '，蛇毒结束。' },
  dartPoison: { name: '暗器针毒', label: '毒伤', category: 'poison', expires: '，针毒结束。' },
  bonePoison: { name: '阴寒骨毒', label: '毒伤', category: 'poison', element: 'COLD', expires: '，骨毒结束。' },
  cinnabar: { name: '朱砂血毒', label: '毒伤', category: 'poison', expires: '，血毒结束。' },
  heartPoison: { name: '阴寒心毒', label: '毒伤', category: 'poison', element: 'COLD', expires: '，心毒结束。' },
  firePoison: { name: '火毒暗伤', label: '毒伤', category: 'poison', element: 'FIRE', expires: '，火毒结束。' },
  bleed: { name: BLEEDING, label: '流血伤害', category: 'bleed', expires: '，流血结束。' },
  dartBleed: { name: '毒菱流血', label: '流血伤害', category: 'bleed', expires: '，流血结束。' },
  needleBleed: { name: '银针流血', label: '流血伤害', category: 'bleed', expires: '，银针流血结束。' },
  woundBleed: { name: '重伤流血', label: '流血伤害', category: 'bleed', expires: '，重伤流血结束。' },
  boneTear: { name: '白骨撕裂', label: '撕裂真伤', category: 'true', expires: '，白骨撕裂结束。' },
  bihai: { name: '碧海内伤', label: '内伤', category: 'qi', expires: '，碧海内伤结束。' },
  coldInjury: { name: '阴寒内伤', label: '内伤', category: 'qi', element: 'COLD', expires: '，阴寒内伤结束。' },
  lingshe: { name: '灵蛇奇毒', label: '毒伤', category: 'poison', expires: '，灵蛇奇毒结束。' },
  staffVenom: { name: '灵蛇剧毒', label: '毒伤', category: 'poison', expires: '，灵蛇剧毒结束。' },
  fusheVenom: { name: '见血封喉', label: '毒伤', category: 'poison', expires: '，见血封喉结束。' },
} as const satisfies Record<PeriodicKind, { name: string; label: string; category: 'poison' | 'bleed' | 'qi' | 'true'; element?: DamageElement; expires: string }>
const periodicStatuses = Object.keys(PERIODIC_DAMAGE) as PeriodicKind[]

type OngoingDamage = {
  sourceId: string
  sourceSlot: CombatUnitDTO['slot']
  sourceUnitId?: string
  sourceEffects?: readonly ActiveEffect[]
  damage: number
  remainingRounds: number
  stacks?: number
  defenseDownPercent?: number
}

interface ShieldedUnit {
  unit: CombatUnitDTO
  shield: number
  shieldBonus?: Extract<ActiveEffect, { kind: 'TEAM_SHIELD_BONUS' }>
  timedShield?: { points: number; lastRound: number; sourceId: string; sourceName: string }
}

type StatusKind = BattleStatusRule['status']
type AppliedStatus = { rule: BattleStatusRule; firstRound: number; lastRound: number; sourceId: string; stacks?: number }
type StatusSource = Pick<ActiveEffect, 'sourceId' | 'sourceName'>
type PoisonRecovery = { amount: number; effect: Extract<ActiveEffect, { kind: 'POISON_MP_RECOVERY' }> }
export interface StatusTarget {
  unit: CombatUnitDTO
  statuses?: Partial<Record<StatusKind, AppliedStatus>>
  ongoingDamage?: Partial<Record<PeriodicKind, OngoingDamage>>
  stance?: StanceType
  lethalGuard?: { round: number; effect: LethalSave }
  lethalEscape?: { round: number; effect: LethalSave }
  storedDamage?: number
  openingHitUsed?: boolean
  chargedUlt?: Extract<ActiveEffect, { kind: 'CHARGED_ULT' }>
  furies?: { effect: Extract<ActiveEffect, { kind: 'LOW_HP_FURY' }>; lastRound: number }[]
  reversal?: { effect: BuffReversal; lastRound: number }
  lethalCounterUsed?: true
  medicineRound?: { round: number; sourceId: string; sourceName: string; percent: number }
  usedVenom?: true
  usedMpPill?: true
  lethalPoisonReflectUsed?: true
  retreated?: true
  critPill?: { effect: Extract<ActiveEffect, { kind: 'CRIT_RECEIVE_PILL' }>; protection: boolean }
  actedRound?: number
  partySpeed?: { round: number; percent: number }
  displaced?: true
  combat?: EnemyCombatConfig
  environment?: BattleEnvironment
}

const statusLabels: Record<StatusKind, string> = {
  SEAL: '封穴', STUN: '点穴眩晕', ULT_LOCK: '封招', CONFUSION: '心神混乱', FREEZE: '冻结', DISARM: '缴械', KNOCKBACK: '击退',
  MERIDIAN_BREAK: '破脉', FALL_IN_WATER: '落水',
  SLOW: '阴寒迟缓', SPEED_UP: '出手速度提高', ATTACK_DOWN: '攻击降低', HIT_DOWN: '命中降低', CRIT_DOWN: '暴击降低',
  DEFENSE_DOWN: '防御降低', DEFENSE_UP: '防御提高', DODGE_DOWN: '闪避降低', DODGE_UP: '闪避提高', HEAL_DOWN: '重伤减疗',
}

export function remainingBattleStatuses(target: StatusTarget, round: number) {
  const statuses = Object.values(target.statuses ?? {}).filter(({ lastRound }) => lastRound >= round).map((status) => {
    const rounds = status.lastRound - Math.max(round, status.firstRound) + 1
    return `${statusLabels[status.rule.status]}${status.stacks ? ` ${status.stacks} 层` : ''} ${rounds} 回合`
  })
  for (const kind of periodicStatuses) {
    const damage = target.ongoingDamage?.[kind]
    if (damage) statuses.push(`${PERIODIC_DAMAGE[kind].name}${damage.stacks ? ` ${damage.stacks} 层` : ''} ${damage.remainingRounds} 回合`)
  }
  if (target.lethalEscape && target.lethalEscape.round >= round) statuses.push('灵狐遁逃 1 回合')
  if (target.chargedUlt) statuses.push(CHARGING)
  for (const { effect, lastRound } of target.furies ?? []) {
    if (lastRound >= round) statuses.push(`${effect.statusName} ${lastRound - round + 1} 回合`)
  }
  if (target.reversal && target.reversal.lastRound >= round) statuses.push(`逆脉狂暴 ${target.reversal.lastRound - round + 1} 回合`)
  return statuses
}

function isControl(status: StatusKind): status is ControlKind {
  return status === 'SEAL' || status === 'STUN' || status === 'ULT_LOCK' || status === 'CONFUSION' || status === 'FREEZE' ||
    status === 'DISARM' || status === 'KNOCKBACK' || status === 'MERIDIAN_BREAK' || status === 'FALL_IN_WATER'
}

function beneficialStatus(status: StatusKind) {
  return status === 'SPEED_UP' || status === 'DODGE_UP' || status === 'DEFENSE_UP'
}

export interface EnemyBattleState extends ShieldedUnit, StatusTarget {
  atk: number
  isBoss?: boolean
  playerGuard?: {
    effects: readonly ActiveEffect[]
    dodge: number
    dodgeCap?: number
    lightDodge: number
    parry: number
    parryAbsorb: number
    saves: LethalSave[]
    recoverPoison?: (hp: number, recovery: PoisonRecovery, round: number) => void
    beforeLethal?: (hp: number, round: number, sourceSlot: CombatUnitDTO['slot']) => number | undefined
    onLethal?: (saved: ReturnType<typeof resolveLethalSave>, round: number, remainingHp: number, sourceSlot: CombatUnitDTO['slot']) => number
  }
  rage?: number
  mp?: number
  defeat?: { round: number; actorSlot: CombatUnitDTO['slot'] }
  stance?: StanceType
  combat?: EnemyCombatConfig
  chargeState?: 'CHARGING' | 'INTERRUPTED'
  defenseBroken?: boolean
  formationParry?: number
  palaceGate?: NonNullable<EnemyCombatConfig['ninePalace']>['gates'][number]
  palaceGuide?: CombatUnitDTO['slot']
  leaderReactionUsed?: true
  hitStreak?: { round: number; count: number }
  weaknessHits?: number
  hearingDisrupted?: true
  weakSpotOpen?: boolean
  heartDemon?: 'ENRAGED' | 'DISTRACTED'
}

export function applyEnemyReaction(
  enemy: EnemyBattleState, reaction: EnemyBattleReaction, round: number, events: BattleEventDTO[],
  actorSlot = enemy.unit.slot, sourceId = enemy.unit.id,
) {
  const oldAttack = enemy.atk
  enemy.atk = Math.round(oldAttack * reaction.attackPercent / 100)
  if (reaction.breakDefense) enemy.defenseBroken = true
  events.push({
    round, type: 'EFFECT', actorSlot, targetSlot: enemy.unit.slot, effectSourceId: sourceId, statusApplied: reaction.name,
    segments: [{ type: 'tag', text: `${enemy.unit.name} · ${reaction.name} · 攻击 ${oldAttack} → ${enemy.atk}${reaction.breakDefense ? ' · 防御归零' : ''}`, tone: 'red' }],
  })
}

export function prepareEnemyRound(enemy: EnemyBattleState, round: number, events: BattleEventDTO[]) {
  const opening = enemy.combat?.openingReaction
  if (round === 1 && opening) applyEnemyReaction(enemy, opening, round, events)
  const palace = enemy.combat?.ninePalace
  if (palace && !enemy.defenseBroken) {
    const previous = enemy.palaceGate
    const gate = palace.gates[(round - 1) % palace.gates.length]
    enemy.palaceGate = gate
    delete enemy.palaceGuide
    events.push({
      round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, effectSourceId: 'nine_palace',
      statusRemoved: previous?.name, statusApplied: gate.name, statusRounds: 1,
      segments: [{ type: 'tag', text: `九宫石阵 · ${gate.name} · 防御 ${gate.defensePercent}% · 攻击 ${gate.attackPercent}%`, tone: gate.opening ? 'jade' : 'gold' }],
    })
  }
  if (enemy.combat?.reverseMeridians) {
    const stance = round % 2 === 1 ? 'FIERCE' : 'AGILE'
    if (enemy.stance !== stance) {
      enemy.stance = stance
      events.push({
        round, type: 'STANCE_CLASH', actorSlot: enemy.unit.slot,
        segments: [{ type: 'tag', tone: 'purple', text: `${enemy.unit.name} · 逆乱换势 · ${STANCE_META[stance].name}` }],
      })
    }
  }
  const spot = enemy.combat?.weakSpot
  if (!spot) return
  enemy.weakSpotOpen = round === spot.round
  if (round === 1 && spot.openingAttackPercent) {
    events.push({
      round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot,
      segments: [{ type: 'tag', tone: 'red', text: `${enemy.unit.name}前 ${spot.round - 1} 回合猛攻，攻击 +${spot.openingAttackPercent - 100}%` }],
    })
  }
  if (round !== spot.round && round !== spot.round + 1) return
  events.push({
    round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot,
    statusApplied: enemy.weakSpotOpen ? spot.name : undefined, statusRemoved: enemy.weakSpotOpen ? undefined : spot.name,
    statusRounds: enemy.weakSpotOpen ? 1 : 0,
    segments: [{ type: 'tag', tone: 'gold', text: enemy.weakSpotOpen
      ? `${enemy.unit.name}摆出摧心掌起手，露出${spot.name}，本回合防御归零。`
      : `${enemy.unit.name}重新护住${spot.name}。` }],
  })
}

export function enemyPhaseAttackPercent(enemy: EnemyBattleState, round: number) {
  if (enemy.palaceGate) return enemy.palaceGate.attackPercent
  const spot = enemy.combat?.weakSpot
  if (!spot) return enemy.heartDemon === 'ENRAGED' ? enemy.combat?.reverseMeridians?.heartAttackPercent ?? 100 : 100
  if (round < spot.round) return spot.openingAttackPercent ?? 100
  return enemy.weakSpotOpen ? spot.exposedAttackPercent : 100
}

export function reactToEnemyDamage(
  enemy: EnemyBattleState, hpLost: number, hpRemaining: number, actorSlot: CombatUnitDTO['slot'], round: number, events: BattleEventDTO[],
) {
  if (hpLost > 0 && hpRemaining <= 0 && actorSlot.startsWith('ALLY')) enemy.defeat = { round, actorSlot }
  const rule = enemy.combat?.defenseBreakOnHit
  if (rule && !enemy.defenseBroken && hpLost > rule.threshold) {
    enemy.defenseBroken = true
    events.push({
      round, type: 'EFFECT', actorSlot, targetSlot: enemy.unit.slot, statusApplied: rule.name,
      segments: [{ type: 'tag', tone: 'gold', text: `${enemy.unit.name} · ${rule.name}，护体防御归零` }],
    })
  }
  const frenzy = enemy.combat?.reverseMeridians
  if (frenzy && !enemy.heartDemon && hpLost > 0 && hpRemaining > 0 && hpRemaining * 100 <= enemy.unit.maxHp * frenzy.heartThresholdPercent) {
    enemy.heartDemon = 'ENRAGED'
    events.push({
      round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, statusApplied: '心魔',
      segments: [{ type: 'tag', tone: 'red', text: `${enemy.unit.name}陷入心魔，攻击 +${frenzy.heartAttackPercent - 100}%` }],
    })
  }
}

export function recordEnemyHit(enemy: EnemyBattleState, hp: number, actorSlot: CombatUnitDTO['slot'], round: number, events: BattleEventDTO[]) {
  const rule = enemy.combat?.hitStreakWeakness
  const streak = enemy.hitStreak
  if (!rule || hp <= 0 || streak?.round === round || (streak?.count ?? 0) >= rule.rounds) return
  const count = streak?.round === round - 1 ? streak.count + 1 : 1
  enemy.hitStreak = { round, count }
  if (count === rule.rounds) events.push({
    round, type: 'EFFECT', actorSlot, targetSlot: enemy.unit.slot, effectSourceId: enemy.unit.id, statusApplied: rule.name,
    segments: [{ type: 'tag', text: `${enemy.unit.name} · ${rule.name} · 受暴击率 +${rule.critPoints} 个百分点`, tone: 'gold' }],
  })
}

export function disruptEnemyHearing(
  enemy: EnemyBattleState, skill: SkillConfig | undefined, hp: number, actorSlot: CombatUnitDTO['slot'], round: number, events: BattleEventDTO[],
) {
  const weakness = enemy.combat?.hearingWeakness
  if (!weakness || !skill || hp <= 0 || enemy.hearingDisrupted || !weakness.skillIds.includes(skill.id)) return
  enemy.hearingDisrupted = true
  events.push({
    round, type: 'EFFECT', actorSlot, targetSlot: enemy.unit.slot, effectSourceId: skill.id, statusApplied: '听声辨位受扰',
    segments: [{ type: 'tag', text: `${skill.name} · 扰乱${enemy.unit.name}听声辨位 · 命中降低 ${weakness.hitPenalty} 个百分点`, tone: 'jade' }],
  })
}

function activeStatus(target: StatusTarget, kind: StatusKind, round: number) {
  const status = target.statuses?.[kind]
  return status && status.firstRound <= round && round <= status.lastRound ? status : undefined
}

export function hasStatus(target: StatusTarget, kind: ControlKind, round: number) {
  return !!activeStatus(target, kind, round)
}

export function activeFuries(target: StatusTarget, round: number) {
  return target.furies?.filter(({ lastRound }) => round <= lastRound).map(({ effect }) => effect) ?? []
}

export function activeReversal(target: StatusTarget, round: number) {
  return target.reversal && round <= target.reversal.lastRound ? target.reversal.effect : undefined
}

export function escapeFromAttack(target: StatusTarget, round: number) {
  return target.lethalEscape?.round === round ? target.lethalEscape.effect : undefined
}

export function endUltCharge(target: StatusTarget, round: number, events: BattleEventDTO[], interrupted: boolean) {
  const effect = target.chargedUlt
  if (!effect) return
  delete target.chargedUlt
  events.push({
    round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: effect.sourceId,
    statusRemoved: CHARGING, statusRounds: 0,
    segments: [{ type: 'tag', tone: 'gold', text: `${effect.moveName} · ${interrupted ? '蓄力中断' : '蓄力完成'}` }],
  })
  return effect
}

export function statusPercent(target: StatusTarget, kind: ModifierStatus, round: number) {
  const rule = activeStatus(target, kind, round)?.rule
  return rule && 'percent' in rule ? rule.percent : 0
}

export function enemyHitPenalty(enemy: EnemyBattleState, round: number) {
  return statusPercent(enemy, 'HIT_DOWN', round) + (enemy.environment?.night ? NIGHT_HIT_PENALTY : 0) +
    (enemy.hearingDisrupted ? enemy.combat?.hearingWeakness?.hitPenalty ?? 0 : 0)
}

export function lostHpBonus(hp: number, maxHp: number, maximum: number) {
  return maxHp > 0 ? Math.round(Math.max(0, maxHp - hp) * maximum / maxHp) : 0
}

export function battleDefense(target: StatusTarget, defense: number, round: number,
  current?: { hp: number; effects: readonly ActiveEffect[]; segments?: RichSegment[] },
) {
  let reduction = statusPercent(target, 'DEFENSE_DOWN', round)
  for (const damage of Object.values(target.ongoingDamage ?? {})) {
    reduction = Math.max(reduction, damage?.defenseDownPercent ?? 0)
  }
  const increased = statusPercent(target, 'DEFENSE_UP', round)
  const atPercent = (points: number) => Math.max(0, Math.round(defense * (100 + increased + points) / 100 * (100 - reduction) / 100))
  const effect = current?.effects.find((candidate) => candidate.kind === 'WOUNDED_DEFENSE_CRIT')
  if (!current || !effect) return atPercent(0)
  const adjusted = atPercent(lostHpBonus(current.hp, target.unit.maxHp, effect.defensePercent))
  const added = adjusted - atPercent(0)
  if (added > 0) current.segments?.push({ type: 'tag', text: `${effect.sourceName} · 护体防御 +${added.toLocaleString()}`, tone: 'jade' })
  return adjusted
}

export function battleDodge(target: StatusTarget, dodge: number, round: number) {
  return (dodge + statusPercent(target, 'DODGE_UP', round)) * (100 - statusPercent(target, 'DODGE_DOWN', round)) / 100
}

export function effectsDuringAction(effects: readonly ActiveEffect[], target: StatusTarget, round: number) {
  return hasStatus(target, 'SEAL', round) || hasStatus(target, 'STUN', round) || hasStatus(target, 'FREEZE', round)
    ? effects.filter((effect) => effect.sourceType !== 'INNER')
    : effects
}

export function applyBattleStatus(
  source: StatusSource, rule: BattleStatusRule, actorSlot: CombatUnitDTO['slot'], target: StatusTarget,
  protection: { hp: number; effects?: readonly ActiveEffect[] }, round: number, rng: () => number, events: BattleEventDTO[],
) {
  const { hp, effects = [] } = protection
  if (rule.status === 'DISARM') {
    const weapon = target.combat?.weapon
    if (!weapon || (rule.weaponTiers && !rule.weaponTiers.includes(weapon.tier))) return
  }
  const chance = rule.chancePercent ?? 100
  if (hp <= 0 || chance <= 0 || (chance < 100 && rng() >= chance / 100)) return
  const name = statusLabels[rule.status]
  let rounds = rule.rounds
  let blockedBy = effects.find((effect) => effect.kind === 'STATUS_IMMUNITY' && effect.status === rule.status)?.sourceName
  if (isControl(rule.status)) {
    const control = rule.status
    const immunity = effects.find((effect) => effect.kind === 'CONTROL_IMMUNITY' &&
      (!effect.statuses || effect.statuses.includes(control)) &&
      (effect.aboveHpPercent === undefined || hp * 100 > target.unit.maxHp * effect.aboveHpPercent))
    const fury = activeFuries(target, round).find((effect) => effect.controlImmunity)
    if (target.combat?.controlImmunity?.includes(control) || immunity || fury) {
      blockedBy = fury?.sourceName ?? immunity?.sourceName ?? target.unit.name
    } else {
      const resist = effects.filter((effect) => effect.kind === 'CONTROL_RESIST')
        .filter((effect) => !effect.statuses || effect.statuses.includes(control))
      const resistChance = resist.reduce((sum, effect) => sum + effect.chancePercent, 0)
      if (resistChance > 0 && rng() < resistChance / 100) blockedBy = resist.map((effect) => effect.sourceName).join('、')
    }
  }
  for (const effect of effects) {
    if (blockedBy || effect.kind !== 'STATUS_DURATION_REDUCTION' || (effect.controlOnly && !isControl(rule.status))) continue
    rounds = Math.floor(rounds * (effect.scalePercent ?? 100) / 100) - (effect.rounds ?? 0)
    if (rounds <= 0) blockedBy = effect.sourceName
  }
  if (blockedBy) {
    events.push({
      round, type: 'EFFECT', actorSlot, targetSlot: target.unit.slot, effectSourceId: source.sourceId,
      segments: [{ type: 'tag', text: `${blockedBy} · 抵抗${name}`, tone: 'jade' }],
    })
    return
  }

  const defensive = rule.status === 'DEFENSE_DOWN' || rule.status === 'DEFENSE_UP' || rule.status === 'DODGE_DOWN' || rule.status === 'HEAL_DOWN'
  const delayed = ('nextRound' in rule ? rule.nextRound : undefined) ?? (rule.status === 'SLOW' || (!defensive && target.actedRound === round))
  const firstRound = delayed ? round + 1 : round
  const lastRound = firstRound + rounds - 1
  const statuses = target.statuses ??= {}
  const previous = statuses[rule.status]
  const maxStacks = 'maxStacks' in rule ? rule.maxStacks : undefined
  const stacks = maxStacks && previous?.sourceId === source.sourceId && previous.lastRound >= round
    ? Math.min(maxStacks, (previous.stacks ?? 1) + 1)
    : 1
  const percent = 'percent' in rule ? Math.min(100, rule.percent * stacks) : 0
  const points = rule.status === 'HIT_DOWN' || rule.status === 'CRIT_DOWN' || rule.status === 'DODGE_UP'
  const percentText = percent ? ` ${percent}${points ? ' 个百分点' : '%'}` : ''
  if (previous && previous.lastRound >= round) {
    const previousPercent = 'percent' in previous.rule ? previous.rule.percent : 0
    if (previousPercent > percent || (previousPercent === percent && previous.lastRound >= lastRound)) return
  }
  const start = previous && previous.lastRound >= round ? Math.min(previous.firstRound, firstRound) : firstRound
  const remaining = lastRound - Math.max(round, start) + 1
  statuses[rule.status] = {
    rule: 'percent' in rule ? { ...rule, percent } : rule,
    firstRound: start, lastRound, sourceId: source.sourceId, stacks: maxStacks ? stacks : undefined,
  }
  if (rule.status === 'KNOCKBACK' && target.combat?.deathBlast) target.displaced = true
  events.push({
    round, type: 'EFFECT', actorSlot, targetSlot: target.unit.slot, effectSourceId: source.sourceId,
    statusApplied: name, statusRounds: remaining, statusStacks: maxStacks ? stacks : undefined,
    segments: [
      { type: 'tag', text: source.sourceName, tone: 'purple' },
      { type: 'text', text: ` ${target.unit.name}${name}${percentText}${maxStacks ? ` · ${stacks} 层` : ''} · ${remaining} 回合` },
    ],
  })
}

function removeStatus(target: StatusTarget, status: AppliedStatus, round: number, events: BattleEventDTO[],
  cleanser?: StatusSource & { slot?: CombatUnitDTO['slot'] },
) {
  delete target.statuses?.[status.rule.status]
  const name = statusLabels[status.rule.status]
  events.push({
    round, type: 'EFFECT', actorSlot: cleanser?.slot ?? target.unit.slot, targetSlot: target.unit.slot, statusRemoved: name, statusRounds: 0,
    effectSourceId: cleanser?.sourceId ?? status.sourceId,
    segments: [{ type: 'tag', text: cleanser ? `${cleanser.sourceName} · 驱散${name}` : `${name}解除`, tone: 'jade' }],
  })
}

export function reverseEnemyBuffs(
  actor: StatusTarget, target: EnemyBattleState, effect: BuffReversal, round: number, rng: () => number, events: BattleEventDTO[],
) {
  const dodge = activeStatus(target, 'DODGE_UP', round)
  const parry = target.formationParry ?? 0
  if ((!dodge && parry <= 0) || rng() >= effect.chancePercent / 100) return

  const slot = actor.unit.slot
  if (dodge) removeStatus(target, dodge, round, events, { ...effect, slot })
  if (parry > 0) {
    delete target.formationParry
    events.push({
      round, type: 'EFFECT', actorSlot: slot, targetSlot: target.unit.slot, effectSourceId: effect.sourceId,
      statusRemoved: '阵型招架', statusRounds: 0,
      segments: [{ type: 'tag', text: `${effect.sourceName} · 逆转 ${parry} 个百分点阵型招架`, tone: 'gold' }],
    })
  }
  actor.reversal = { effect, lastRound: round + effect.rounds - 1 }
  events.push({
    round, type: 'EFFECT', actorSlot: slot, targetSlot: slot, effectSourceId: effect.sourceId,
    statusApplied: '逆脉狂暴', statusRounds: effect.rounds,
    segments: [{ type: 'tag', text: `${effect.sourceName} · 逆脉狂暴 · 攻击 +${effect.attackPercent}% · ${effect.rounds} 回合`, tone: 'gold' }],
  })
}

export function cleanseControlStatus(target: StatusTarget, kind: ControlKind, source: StatusSource & { slot: CombatUnitDTO['slot'] },
  round: number, events: BattleEventDTO[],
) {
  const status = target.statuses?.[kind]
  if (!status) return false
  removeStatus(target, status, round, events, source)
  return true
}

function removePeriodicStatus(target: StatusTarget, kind: PeriodicKind, source: StatusSource & { slot: CombatUnitDTO['slot'] },
  round: number, events: BattleEventDTO[],
) {
  if (!target.ongoingDamage?.[kind]) return false
  delete target.ongoingDamage[kind]
  const name = PERIODIC_DAMAGE[kind].name
  events.push({
    round, type: 'EFFECT', actorSlot: source.slot, targetSlot: target.unit.slot, effectSourceId: source.sourceId,
    statusRemoved: name, statusRounds: 0,
    segments: [{ type: 'tag', text: `${source.sourceName} · 驱散${name}`, tone: 'jade' }],
  })
  return true
}

export function cleansePoison(target: StatusTarget, source: StatusSource & { slot: CombatUnitDTO['slot'] },
  round: number, events: BattleEventDTO[],
) {
  for (const kind of periodicStatuses) {
    if (PERIODIC_DAMAGE[kind].category === 'poison') removePeriodicStatus(target, kind, source, round, events)
  }
}

export function useRoundStartPill(owner: StatusTarget, effects: readonly ActiveEffect[], allies: readonly StatusTarget[],
  round: number, rng: () => number, events: BattleEventDTO[],
) {
  const pill = effects.find((effect) => effect.kind === 'ROUND_START_PILL')
  if (!pill || pill.round !== round) return
  const slot = owner.unit.slot
  const source = { ...pill, slot }
  const before = events.length
  for (const ally of allies) {
    cleansePoison(ally, source, round, events)
    cleanseControlStatus(ally, 'SEAL', source, round, events)
    applyBattleStatus(source, { status: 'DEFENSE_UP', percent: pill.defensePercent, rounds: pill.rounds }, slot, ally, { hp: 1 }, round, rng, events)
  }
  if (events.length > before) events.splice(before, 0, {
    round, type: 'EFFECT', actorSlot: slot, targetSlot: slot, effectSourceId: pill.sourceId, medicineUsed: pill.sourceId,
    segments: [{ type: 'tag', text: `服用${pill.sourceName}`, tone: 'jade' }],
  })
}

export function spreadHitStatus<T extends EnemyBattleState>(
  skill: SkillConfig | undefined, unit: CombatUnitDTO, primary: T, enemies: Iterable<T>, hpOf: (enemy: T) => number,
  round: number, rng: () => number, events: BattleEventDTO[],
) {
  if (!skill) return
  for (const effect of skill.battleEffects ?? []) {
    if (effect.kind !== 'ON_HIT_STATUS' || !('rule' in effect) || !effect.area) continue
    for (const target of enemies) {
      if (target === primary) continue
      applyBattleStatus({ sourceId: skill.id, sourceName: skill.name }, effect.rule, unit.slot, target,
        { hp: hpOf(target), effects: target.playerGuard?.effects }, round, rng, events)
    }
  }
}

export function startStatusRound<T extends StatusTarget & Pick<EnemyBattleState, 'playerGuard'>>(
  owner: StatusTarget, effects: readonly ActiveEffect[], enemies: Iterable<T>, hpOf: (target: T) => number,
  round: number, rng: () => number, events: BattleEventDTO[], allies: readonly StatusTarget[] = [owner],
) {
  const targets = [...enemies]
  for (const effect of effects) {
    if (effect.kind === 'CLEANSE_CONTROL') {
      const status = Object.values(owner.statuses ?? {}).find((entry) => isControl(entry.rule.status))
      if (status) removeStatus(owner, status, round, events, effect)
    } else if (effect.kind === 'ROUND_CLEANSE') {
      if (effect.sourceType === 'INNER' && !effectsDuringAction(effects, owner, round).includes(effect)) continue
      for (const target of effect.team ? allies : [owner]) {
        const status = !effect.statuses && Object.values(target.statuses ?? {}).find((entry) => !beneficialStatus(entry.rule.status))
        if (status) {
          removeStatus(target, status, round, events, effect)
          continue
        }
        for (const kind of periodicStatuses) {
          if (effect.statuses && !effect.statuses.includes(kind)) continue
          if (removePeriodicStatus(target, kind, { ...effect, slot: owner.unit.slot }, round, events) && !effect.statuses) break
        }
      }
    } else if (effect.kind === 'TEAM_OPENING_SPEED' && round === 1) {
      for (const target of allies) {
        applyBattleStatus(effect, { status: 'SPEED_UP', percent: effect.percent, rounds: effect.rounds, nextRound: false },
          owner.unit.slot, target, { hp: target.unit.hp }, round, rng, events)
      }
    } else if (effect.kind === 'ROUND_ENEMY_STATUS' || (effect.kind === 'OPENING_ENEMY_STATUS' && round === 1)) {
      if (effect.kind === 'ROUND_ENEMY_STATUS' && effect.every && round % effect.every !== 0) continue
      const living = targets.filter((target) => hpOf(target) > 0)
      const leader = effect.kind === 'ROUND_ENEMY_STATUS' && effect.leaderOnly
        ? living.find((target) => target.unit.slot.endsWith('_MAIN')) ?? living[0]
        : undefined
      for (const enemy of leader ? [leader] : living) {
        applyBattleStatus(effect, effect.rule, owner.unit.slot, enemy, { hp: hpOf(enemy), effects: enemy.playerGuard?.effects }, round, rng, events)
      }
    }
  }
}

export function endStatusRound(target: StatusTarget, round: number, events: BattleEventDTO[]) {
  for (const status of Object.values(target.statuses ?? {})) {
    if (status.lastRound <= round) removeStatus(target, status, round, events)
  }
  if (target.lethalGuard?.round === round) {
    const { effect } = target.lethalGuard
    delete target.lethalGuard
    events.push({
      round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: effect.sourceId,
      statusRemoved: '不死意志', statusRounds: 0,
      segments: [{ type: 'tag', text: `${effect.sourceName} · 不死意志解除`, tone: 'jade' }],
    })
  }
  const escape = escapeFromAttack(target, round)
  if (escape) {
    delete target.lethalEscape
    events.push({
      round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: escape.sourceId,
      statusRemoved: '灵狐遁逃', statusRounds: 0,
      segments: [{ type: 'tag', text: `${escape.sourceName} · 灵狐遁逃结束`, tone: 'jade' }],
    })
  }
  if (target.reversal?.lastRound === round) {
    const { effect } = target.reversal
    delete target.reversal
    events.push({
      round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: effect.sourceId,
      statusRemoved: '逆脉狂暴', statusRounds: 0,
      segments: [{ type: 'tag', tone: 'gold', text: `${effect.sourceName} · 逆脉狂暴结束` }],
    })
  }
  for (const { effect, lastRound } of target.furies ?? []) {
    if (lastRound !== round) continue
    events.push({
      round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: effect.sourceId,
      statusRemoved: effect.statusName, statusRounds: 0,
      segments: [{ type: 'tag', tone: 'red', text: `${effect.statusName}结束` }],
    })
  }
}

export function blockingActionStatus(target: StatusTarget, round: number, ignorePointStun = false) {
  return (ignorePointStun ? undefined : activeStatus(target, 'STUN', round)) ??
    activeStatus(target, 'CONFUSION', round) ?? activeStatus(target, 'FREEZE', round) ?? activeStatus(target, 'KNOCKBACK', round) ??
    activeStatus(target, 'MERIDIAN_BREAK', round) ?? activeStatus(target, 'FALL_IN_WATER', round)
}

export function startControlledAction(
  target: StatusTarget, round: number, events: BattleEventDTO[],
  { ignoreControl, ignorePointStun }: { ignoreControl?: boolean; ignorePointStun?: boolean } = {},
) {
  target.actedRound = round
  if (ignoreControl) return true
  const blocked = blockingActionStatus(target, round, ignorePointStun)
  if (!blocked) return true
  endUltCharge(target, round, events, true)
  events.push({
    round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: blocked.sourceId,
    segments: [{ type: 'tag', text: `${target.unit.name} · ${statusLabels[blocked.rule.status]}，跳过行动`, tone: 'red' }],
  })
  return false
}

export function strikeAvoidance(roll: number, dodge: number, hitPenalty: number): 'DODGE' | 'MISS' | undefined {
  if (roll < dodge) return 'DODGE'
  if (roll < dodge + hitPenalty) return 'MISS'
}

export function rollAbsoluteDefense(effects: readonly ActiveEffect[], kind: 'ABSOLUTE_DODGE' | 'ABSOLUTE_PARRY', rng: () => number) {
  const effect = effects.find((effect): effect is Extract<ActiveEffect, { kind: 'ABSOLUTE_DODGE' | 'ABSOLUTE_PARRY' }> => effect.kind === kind)
  return effect && rng() < effect.chancePercent / 100 ? effect : undefined
}

export function applyIncomingStatuses(
  attacker: EnemyBattleState, attackerHp: number, defender: StatusTarget, hp: number,
  effects: readonly ActiveEffect[], round: number, rng: () => number, events: BattleEventDTO[], attack = attacker.atk, weaponSuppressed = false,
) {
  const source = { sourceId: attacker.unit.id, sourceName: attacker.unit.name, slot: attacker.unit.slot, unitId: attacker.unit.id }
  const rule = attacker.combat?.statusOnHit
  if (rule && !weaponSuppressed) {
    applyBattleStatus(source, rule, attacker.unit.slot, defender, { hp, effects }, round, rng, events)
  }
  if (!weaponSuppressed && attacker.combat?.periodicOnHit && !(attacker.defenseBroken && attacker.combat.strikeWeakness?.stopPeriodic)) {
    applyPeriodicOnHit(source, defender, hp, attacker.combat.periodicOnHit, { round, attack, rng, protection: effects }, events)
  }
  const protection = attacker.playerGuard && effectsDuringAction(attacker.playerGuard.effects, attacker, round)
  for (const effect of effects) {
    if (hp > 0 && effect.kind === 'ON_RECEIVE_STATUS') {
      applyBattleStatus(effect, effect.rule, defender.unit.slot, attacker, { hp: attackerHp, effects: protection }, round, rng, events)
    }
  }
}

export function applyEnemyStatusPulse(
  enemy: EnemyBattleState, targets: readonly { fighter: StatusTarget; hp: number; effects?: readonly ActiveEffect[] }[],
  round: number, rng: () => number, events: BattleEventDTO[],
) {
  const pulse = enemy.combat?.statusPulse
  if (!pulse || (pulse.waterOnly && !enemy.environment?.water) || round % pulse.every !== 0 ||
      (pulse.lastRound !== undefined && round > pulse.lastRound)) return
  const shield = targets.find(({ fighter, hp }) => hp > 0 && !fighter.unit.isPlayer && fighter.unit.id === pulse.shieldedByCompanion)
  if (shield) {
    events.push({
      round, type: 'EFFECT', actorSlot: shield.fighter.unit.slot, effectSourceId: shield.fighter.unit.id,
      segments: [{ type: 'tag', text: `${shield.fighter.unit.name} · 空明拳护住全队，化解${pulse.name}`, tone: 'jade' }],
    })
    return
  }
  const source = { sourceId: enemy.unit.id, sourceName: pulse.name }
  for (const { fighter, hp, effects } of targets) {
    applyBattleStatus(source, pulse.rule, enemy.unit.slot, fighter, { hp, effects }, round, rng, events)
  }
}

export function effectsFrom(source: EffectSource, sourceType?: ActiveEffect['sourceType']): ActiveEffect[] {
  return (source.battleEffects ?? []).map((effect) => ({
    ...effect,
    sourceId: source.id,
    sourceName: source.name,
    sourceType,
  }))
}

function scaledMartialPassive(effect: ActiveEffect, percent: number): ActiveEffect {
  if (percent === 100) return effect
  const scale = (amount: number) => amount * percent / 100
  switch (effect.kind) {
    case 'STAT_BONUS':
      return { ...effect, stats: Object.fromEntries(Object.entries(effect.stats).map(([key, value]) => [key, scale(value)])) }
    case 'CONTROL_RESIST':
      return { ...effect, chancePercent: scale(effect.chancePercent) }
    case 'ATTACK_LIFESTEAL':
    case 'STORE_INCOMING_DAMAGE':
    case 'OUTER_DAMAGE':
    case 'PHYSICAL_DAMAGE_REDUCTION':
    case 'PERIODIC_REDUCTION':
      return { ...effect, percent: scale(effect.percent) }
    case 'HIT_RAGE':
      return 'amount' in effect ? { ...effect, amount: Math.round(scale(effect.amount)) } : effect
    case 'PERIODIC_ON_HIT':
      return { ...effect, rule: 'attackPercent' in effect.rule
        ? { ...effect.rule, attackPercent: scale(effect.rule.attackPercent) }
        : { ...effect.rule, maxHpPercent: scale(effect.rule.maxHpPercent) } }
    case 'HEAL':
      return { ...effect, amount: scale(effect.amount) }
    default:
      return effect
  }
}

export function resolveBattleLoadout(loadout: LoadoutPresetDTO, player?: Pick<PlayerDTO, 'currentSectId' | 'sectRank' | 'graduatedSectIds' | 'betrayedSectIds' | 'gaibangBranch' | 'stats' | 'storySnakeChoice' | 'battleMedicines' | 'equipmentAffixes' | 'equipmentForge' | 'openedAcupointIds'>) {
  const effects: ActiveEffect[] = []
  for (const point of ACUPOINTS) {
    if (!player?.openedAcupointIds?.includes(point.id)) continue
    const source = { sourceId: point.id, sourceName: point.name }
    const { key, value } = point.statBonus
    switch (key) {
      case 'atk': case 'def': case 'mp': case 'hp': case 'crit': case 'dodge': case 'hit': case 'parry':
        effects.push({ ...source, kind: 'STAT_BONUS', stats: { [key]: value } })
        break
      case 'spd': effects.push({ ...source, kind: 'STAT_BONUS', stats: { speed: value } }); break
      case 'pierce': effects.push({ ...source, kind: 'FLAT_ARMOR_PENETRATION', points: value }); break
      case 'critDef': effects.push({ ...source, kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: value, criticalOnly: true }); break
      case 'qiDmg': effects.push({ ...source, kind: 'OUTER_TRUE_CONVERSION', truePercent: value, label: '内劲转化', anyOuter: true }); break
      case 'rageGain': effects.push({ ...source, kind: 'HIT_RAGE', amount: value }); break
    }
  }
  const items = Object.entries(EQUIP_SLOT_META).flatMap(([slot, { field }]) => {
    const id = loadout[field]
    const item = typeof id === 'string' ? equipmentItem(id, player) : undefined
    if (item?.slot !== slot) return []
    // 基础悟性会上升，带上限的穿戴条件在开战时重新判定。
    if (player && item.reqStat && 'any' in item.reqStat && !meetsItemStatRequirement(item, player.stats)) return []
    return [item]
  })
  const skills = equippedMartialSkills(loadout)
  const wanderer = player && hasWandererMastery(player, skills) ? wandererStatBonuses(player.stats) : undefined
  const baseKarma = (player?.stats.karma ?? 0) + (wanderer?.karma ?? 0)
  const gear = resolveItemEffects(items, loadout.outerSkillId, baseKarma, loadout.stance, (item) => {
    const resonance = item.resonance
    return !!(resonance && player && ('sectId' in resonance
      ? player.currentSectId === resonance.sectId && player.sectRank >= (resonance.rank ?? 1)
      : 'minStrength' in resonance && player.stats.str >= resonance.minStrength))
  })
  const freedom = gear.effects.some((effect) => effect.kind === 'MARTIAL_FREEDOM')
  if (wanderer) {
    const source = { sourceId: WANDERER_MASTERY.id, sourceName: WANDERER_MASTERY.name }
    effects.push({ ...source, kind: 'STAT_BONUS', stats: wanderer }, { ...source, kind: 'OUTER_COMBO_CHANCE', points: WANDERER_MASTERY.comboPoints })
  }
  const mixed = player ? wandererEquipmentBonus(player.currentSectId, loadout, (id) => items.find((item) => item.id === id)) : 0
  if (mixed) effects.push({ kind: 'TARGET_TRAIT_DAMAGE', percent: mixed, team: true,
    sourceId: WANDERER_EQUIPMENT.id, sourceName: WANDERER_EQUIPMENT.sourceName })
  const karma = gear.karma
  const title = player && activeJianghuTitle({ ...player, stats: { ...player.stats, karma } }, loadout)
  if (title) effects.push(...effectsFrom({ ...title, name: title.titleName }, 'TITLE'))
  const gaibang = player && gaibangPerks(player)
  if (player && gaibang) effects.push({
    kind: 'STAT_BONUS', sourceId: 'gaibang_branch', sourceName: gaibang.name,
    stats: { ...gaibangAttributeBonus(player), defPercent: gaibang.defensePercent },
  })
  if (player?.storySnakeChoice === 'A') {
    const source = { sourceId: STORY_SNAKE_ADVENTURE.id, sourceName: STORY_SNAKE_ADVENTURE.title }
    effects.push({ ...source, kind: 'PERIODIC_REDUCTION', category: 'poison', percent: STORY_SNAKE_ADVENTURE.poisonResistance })
    for (const status of ['venom', 'snakeVenom', 'lingshe', 'staffVenom', 'fusheVenom'] as const) {
      effects.push({ ...source, kind: 'PERIODIC_REDUCTION', status,
        percent: STORY_SNAKE_ADVENTURE.snakePoisonResistance - STORY_SNAKE_ADVENTURE.poisonResistance })
    }
  }
  for (const skill of skills) {
    const percent = martialEffectiveness(skill, player, freedom)
    const passives = effectsFrom(skill, skill.slot === 'INNER' ? 'INNER' : undefined)
    effects.push(...(skill.slot === 'INNER' ? passives.map((effect) => scaledMartialPassive(effect, percent)) : passives))
    if (skill.slot === 'OUTER' && (skill.dodgeBonus || skill.speedBonus)) {
      effects.push({
        kind: 'STAT_BONUS', stats: { dodge: (skill.dodgeBonus ?? 0) * percent / 100, speed: (skill.speedBonus ?? 0) * percent / 100 },
        sourceId: skill.id, sourceName: skill.name,
      })
    }
  }
  const karmaPercent = Math.min(10, Math.floor(Math.abs(karma) / 100))
  if (karmaPercent > 0) {
    const bonus = gear.effects.find((effect) => effect.kind === 'KARMA_DAMAGE_MULTIPLIER')
    gear.effects.push({
      kind: 'TARGET_TRAIT_DAMAGE', traits: [karma > 0 ? 'HERETIC' : 'RIGHTEOUS'],
      percent: karmaPercent * (bonus?.multiplier ?? 1), sourceId: 'karma',
      sourceName: bonus ? `侠义（${bonus.sourceName}）` : '侠义',
    })
  }
  const medicines = player ? equippedBattleMedicines(player, loadout).flatMap((medicine) => effectsFrom(medicine, 'MEDICINE')) : []
  return { items, effects: [...effects, ...gear.effects, ...medicines], setCounts: gear.setCounts, freedom }
}

function resolveItemEffects(items: readonly ItemConfig[], outerSkillId: string | null | undefined, baseKarma: number, stance: StanceType, resonates: (item: ItemConfig) => boolean) {
  const effects: ActiveEffect[] = []
  const setCounts = new Map<string, number>()
  let karma = clampKarma(baseKarma)
  for (const item of items) {
    if (item.attributeBonus) {
      const stats = { ...item.attributeBonus }
      if (stats.karma) {
        const next = clampKarma(karma + stats.karma)
        stats.karma = next - karma
        karma = next
      }
      effects.push({ kind: 'STAT_BONUS', stats, sourceId: item.id, sourceName: item.name, sourceType: 'EQUIPMENT' })
    }
    effects.push(...effectsFrom(item, 'EQUIPMENT').filter((effect) => effect.kind !== 'ROUND_ENEMY_STATUS' ||
      !effect.requiresOuterSkillId || outerSkillId === effect.requiresOuterSkillId))
    const resonance = item.resonance
    if (resonance && resonates(item)) {
      effects.push(...effectsFrom({ ...item, battleEffects: resonance.battleEffects }, 'EQUIPMENT'))
    }
    if (item.setId) setCounts.set(item.setId, (setCounts.get(item.setId) ?? 0) + 1)
  }
  for (const [id, count] of setCounts) {
    const sectSet = sectEquipmentSetOf(id)
    if (sectSet && count >= sectSet.parts.length) {
      const battleEffects = (sectSet.battleEffects ?? []).filter((effect) => effect.kind !== 'STAT_BONUS' || !effect.stance || effect.stance === stance)
      if (sectSet.attributeBonus) battleEffects.push({ kind: 'STAT_BONUS', stats: sectSet.attributeBonus })
      effects.push(...effectsFrom({ id, name: `${sectSet.name}（${sectSet.parts.length}件）`, battleEffects }, 'EQUIPMENT'))
      continue
    }
    const set = trialSetOf(id)
    if (!set?.battleBonuses) continue
    for (const bonus of set.battleBonuses) {
      if (count >= bonus.pieces) {
        effects.push(...effectsFrom({ id, name: `${set.name}（${bonus.pieces}件）`, battleEffects: bonus.effects }, 'EQUIPMENT'))
      }
    }
  }
  return { effects, setCounts, karma }
}

export function resolveCompanionEquipment(loadout: LoadoutPresetDTO, companion: CompanionView, allocated: Set<string>, player?: Pick<PlayerDTO, 'equipmentAffixes' | 'equipmentForge'>) {
  const items: ItemConfig[] = []
  for (const slot of PERSONAL_EQUIP_SLOTS) {
    const id = companionItemId(loadout, companion.id, slot)
    const item = equipmentItem(id, player)
    if (item?.slot !== slot || allocated.has(item.id) || !canEquipCompanionItem(companion, item)) continue
    items.push(item)
    allocated.add(item.id)
  }
  const weapon = items.find((item) => item.slot === 'WEAPON')
  const use = weapon?.companionUse?.owners.includes(companion.id) ? weapon.companionUse : undefined
  const gear = resolveItemEffects(items, use?.outerSkillId ?? companion.battleAttack?.skillId, companion.stats.karma, use?.stance ?? companion.battleAttack?.stance ?? loadout.stance, (item) =>
    !!item.companionUse?.owners.includes(companion.id) ||
    (!!item.resonance && 'minStrength' in item.resonance && companion.stats.str >= item.resonance.minStrength),
  )
  const ult = use?.ultimate
  return { items, ...gear, weapon, use, ultimate: typeof ult === 'string' ? SKILLS[ult] : ult && rageMoveSkill(ult, weapon!.name) }
}

export function teamStatBonuses(effects: readonly ActiveEffect[]) {
  const seen = new Set<string>()
  return effects.flatMap((effect) => {
    if (effect.kind !== 'TEAM_STATS' || seen.has(effect.sourceId)) return []
    seen.add(effect.sourceId)
    return [{ ...effect, kind: 'STAT_BONUS' as const }]
  })
}

export function isSharedCombatEffect(effect: ActiveEffect) {
  return effect.kind === 'TEAM_SHIELD_BONUS' ||
    ((effect.kind === 'TARGET_TRAIT_DAMAGE' || effect.kind === 'PARRY_REFLECT' || effect.kind === 'TRUE_STRIKE') && effect.team)
}

export function teamCombatEffects(effects: readonly ActiveEffect[]) {
  const bySource = new Map<string, ActiveEffect>()
  for (const effect of effects.filter(isSharedCombatEffect)) {
    const key = `${effect.kind}:${effect.sourceId}`
    const existing = bySource.get(key)
    if (!existing || (effect.kind === 'TARGET_TRAIT_DAMAGE' && existing.kind === 'TARGET_TRAIT_DAMAGE' && effect.percent > existing.percent)) {
      bySource.set(key, effect)
    }
  }
  return [...bySource.values()]
}

export function teamTrueStrike(effects: readonly ActiveEffect[]) {
  return effects.find((effect): effect is TrueStrike => effect.kind === 'TRUE_STRIKE' && !!effect.team)
}

export function damageShareFormation(effects: readonly ActiveEffect[]) {
  return effects.filter((effect) => effect.kind === 'DAMAGE_SHARE_FORMATION')
    .sort((a, b) => b.parryPoints - a.parryPoints || b.hitRageMultiplier - a.hitRageMultiplier)[0]
}

export function dismountCavalry(
  actor: CombatUnitDTO, effects: readonly ActiveEffect[], enemies: Iterable<EnemyBattleState>, events: BattleEventDTO[], round = 1,
) {
  const plan = effects.find((effect) => effect.kind === 'DISMOUNT_CAVALRY')
  if (!plan) return
  for (const enemy of enemies) {
    if (!enemy.combat?.mounted || enemy.defenseBroken) continue
    enemy.defenseBroken = true
    events.push({
      round, type: 'EFFECT', actorSlot: actor.slot, targetSlot: enemy.unit.slot, effectSourceId: plan.sourceId,
      statusApplied: '卸马', segments: [{ type: 'tag', text: `${plan.sourceName} · 奇谋卸马 · ${enemy.unit.name}防御归零`, tone: 'gold' }],
    })
  }
}

export function appendStatBonusEffects(
  unit: CombatUnitDTO, effects: readonly ActiveEffect[], addedCrit: number, addedDodge: number, events: BattleEventDTO[],
) {
  for (const effect of effects) {
    let description: string
    if (effect.kind === 'MARTIAL_FREEDOM') {
      description = '解除自身招式的门派与兵刃限制'
    } else if (effect.kind === 'DODGE_CAP') {
      description = `闪避上限提升至 ${effect.percent}%`
    } else if (effect.kind === 'PERIODIC_REDUCTION' && effect.sourceId === STORY_SNAKE_ADVENTURE.id && 'category' in effect) {
      description = `毒伤抗性 +${effect.percent}%`
    } else if (effect.kind === 'STAT_BONUS') {
      const crit = Math.min(effect.stats.crit ?? 0, addedCrit)
      const dodge = Math.min(effect.stats.dodge ?? 0, addedDodge)
      addedCrit -= crit
      addedDodge -= dodge
      description = formatBattleStatBonuses({ ...effect.stats, crit, dodge })
    } else continue
    if (!description) continue
    events.push({
      round: 1,
      type: 'EFFECT',
      actorSlot: unit.slot,
      targetSlot: unit.slot,
      effectSourceId: effect.sourceId,
      segments: [
        { type: 'tag', text: effect.sourceName, tone: 'jade' },
        { type: 'text', text: ` ${unit.name}${description}` },
      ],
    })
  }
}

export function recoverRoundMp(
  unit: CombatUnitDTO, hp: number, mp: number, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[],
) {
  if (hp <= 0 || mp >= unit.maxMp) return mp
  for (const effect of effects) {
    if (effect.kind !== 'ROUND_END_MP_RECOVERY') continue
    mp = restoreMp(unit, mp, Math.round(unit.maxMp * effect.percent / 100), effect, round, events, effects)
  }
  return mp
}

export function recoverEnemyRoundMp(enemy: EnemyBattleState, hp: number, round: number, events: BattleEventDTO[]) {
  const inner = enemy.combat?.innerEndurance
  if (!inner || enemy.mp === undefined || enemy.mp >= enemy.unit.maxMp || hp <= 0) return
  const recovery: ActiveEffect = {
    kind: 'ROUND_END_MP_RECOVERY', percent: inner.recoveryPercent, sourceType: 'INNER',
    sourceId: inner.skillId, sourceName: SKILLS[inner.skillId]?.name ?? enemy.unit.name,
  }
  enemy.mp = recoverRoundMp(enemy.unit, hp, enemy.mp, effectsDuringAction([recovery], enemy, round), round, events)
}

function restoreMp(unit: CombatUnitDTO, mp: number, amount: number, effect: ActiveEffect, round: number, events: BattleEventDTO[],
  effects: readonly ActiveEffect[] = [],
) {
  const capacity = unit.maxMp - mp
  let restored = Math.min(capacity, amount)
  const bonuses: RichSegment[] = []
  for (const bonus of effects) {
    if (bonus.kind !== 'MP_RECOVERY_BONUS' || restored >= capacity) continue
    const gained = Math.min(capacity - restored, Math.round(amount * bonus.percent / 100))
    if (gained <= 0) continue
    restored += gained
    bonuses.push({ type: 'tag', tone: 'jade', text: `${bonus.sourceName} · 额外回复 ${gained.toLocaleString()} 点内力` })
  }
  if (restored <= 0) return mp
  events.push({
    round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: unit.slot, mpDelta: restored, effectSourceId: effect.sourceId,
    medicineUsed: effect.sourceType === 'MEDICINE' ? effect.sourceId : undefined,
    segments: [{ type: 'tag', tone: 'jade', text: `${effect.sourceName} · 内力 +${restored.toLocaleString()}` }, ...bonuses],
  })
  return mp + restored
}

export function recoverPoisonMp(unit: CombatUnitDTO, hp: number, mp: number, recovery: PoisonRecovery | undefined, round: number, events: BattleEventDTO[]) {
  if (hp <= 0 || !recovery) return mp
  return restoreMp(unit, mp, recovery.amount, recovery.effect, round, events)
}

export function useLowMpPill(owner: StatusTarget, mp: number, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[]) {
  if (owner.usedMpPill) return mp
  const pill = effects.find((effect) => effect.kind === 'LOW_MP_PILL')
  if (!pill || mp * 100 >= owner.unit.maxMp * pill.belowMpPercent) return mp
  owner.usedMpPill = true
  owner.medicineRound = { round, sourceId: pill.sourceId, sourceName: pill.sourceName, percent: pill.ultDamagePercent }
  return restoreMp(owner.unit, mp, owner.unit.maxMp - mp, pill, round, events)
}

export function recoverHitMp(
  unit: CombatUnitDTO, hp: number, mp: number, hpLost: number, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[],
) {
  if (hp <= 0 || hpLost <= 0 || mp >= unit.maxMp) return mp
  for (const effect of effects) {
    if (effect.kind === 'HIT_MP_RECOVERY') mp = restoreMp(unit, mp, Math.round(hpLost * effect.hpLossPercent / 100), effect, round, events, effects)
  }
  return mp
}

export function advanceOnCrit(
  unit: CombatUnitDTO, effect: CritAction | undefined, advance: number, round: number, events: BattleEventDTO[],
) {
  if (!effect) return advance
  const gained = Math.min(100 - advance, effect.advancePercent)
  if (gained <= 0) return advance
  events.push({
    round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: unit.slot, effectSourceId: effect.sourceId,
    segments: [{ type: 'tag', tone: 'jade', text: `${effect.sourceName} · 行动条 +${gained}%` }],
  })
  return advance + gained
}

export function restoreHp(target: StatusTarget, hp: number, amount: number, effect: ActiveEffect, round: number, events: BattleEventDTO[],
  sourceSlot = target.unit.slot,
) {
  const { unit } = target
  const missing = unit.maxHp - hp
  const restored = Math.min(Math.round(amount * (100 - statusPercent(target, 'HEAL_DOWN', round)) / 100), missing)
  const reduced = Math.min(amount, missing) - restored
  if (restored <= 0 && reduced <= 0) return hp

  events.push({
    round,
    type: 'EFFECT',
    actorSlot: sourceSlot,
    targetSlot: unit.slot,
    effectSourceId: effect.sourceId,
    hpDelta: restored || undefined,
    segments: [
      { type: 'tag', text: effect.sourceName, tone: 'jade' },
      { type: 'text', text: ' ' },
      { type: 'actor', name: unit.name, isAlly: unit.slot.startsWith('ALLY'), isPlayer: unit.isPlayer },
      { type: 'text', text: effect.kind === 'OUTER_LIFESTEAL' || effect.kind === 'ATTACK_LIFESTEAL' || effect.kind === 'LETHAL_COUNTER'
        ? '吸血回复气血 ' : '恢复气血 ' },
      { type: 'damage', value: restored, category: 'heal' },
      ...(reduced > 0 ? [{ type: 'tag', tone: 'red', text: `重伤减疗 -${reduced.toLocaleString()}` } as const] : []),
    ],
  })
  return hp + restored
}

export function useCriticalHitPill(
  target: StatusTarget, hp: number, critical: boolean, lost: number, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[],
) {
  if (!critical || hp <= 0 || lost <= 0 || target.critPill) return hp
  const pill = effects.find((effect) => effect.kind === 'CRIT_RECEIVE_PILL')
  if (!pill) return hp
  target.critPill = { effect: pill, protection: true }
  const healEventIndex = events.length
  const restored = restoreHp(target, hp, Math.round(target.unit.maxHp * pill.healPercent / 100), pill, round, events)
  const status = {
    round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: pill.sourceId,
    medicineUsed: pill.sourceId, statusApplied: '化瘀护身',
    segments: [{ type: 'tag', text: `${pill.sourceName} · 化瘀护身 · 下一次外功物伤降低 ${pill.outerReduction}%`, tone: 'jade' }],
  } satisfies BattleEventDTO
  const healEvent = events[healEventIndex]
  if (healEvent) {
    healEvent.medicineUsed = status.medicineUsed
    healEvent.statusApplied = status.statusApplied
    healEvent.segments.push(...status.segments)
  } else events.push(status)
  return restored
}

export function resolveKillRewards(
  enemies: Iterable<EnemyBattleState>, members: { fighter: StatusTarget; hp: number; rage: number; effects: readonly ActiveEffect[] }[],
  round: number, events: BattleEventDTO[],
) {
  const reward = members.find((member) => member.hp > 0 && member.effects.some((effect) => effect.kind === 'TEAM_KILL_RECOVERY'))
    ?.effects.find((effect) => effect.kind === 'TEAM_KILL_RECOVERY')
  for (const enemy of enemies) {
    if (enemy.defeat?.round !== round) continue
    const { actorSlot } = enemy.defeat
    delete enemy.defeat
    const killer = members.find(({ fighter }) => fighter.unit.slot === actorSlot)
    const absorb = killer?.effects.find((effect) => effect.kind === 'KILL_QI_GAIN')
    if (absorb) {
      const qiDrop = Math.round(enemy.unit.maxHp * absorb.percent / 100)
      if (qiDrop > 0) events.push({
        round, type: 'EFFECT', actorSlot, targetSlot: enemy.unit.slot, effectSourceId: absorb.sourceId, qiDrop,
        segments: [{ type: 'tag', text: `${absorb.sourceName} · 击败${enemy.unit.name} · 真气 +${qiDrop.toLocaleString()}`, tone: 'jade' }],
      })
    }
    const silverGain = killer?.effects.find((effect) => effect.kind === 'KILL_SILVER_GAIN')
    const silverDrop = silverGain ? Math.round(enemySilverReward(enemy.unit.maxHp) * silverGain.percent / 100) : 0
    if (silverGain && silverDrop > 0 && !enemy.unit.isPlayer) events.push({
      round, type: 'EFFECT', actorSlot, targetSlot: enemy.unit.slot, effectSourceId: silverGain.sourceId, silverDrop,
      segments: [{ type: 'tag', text: `${silverGain.sourceName} · 击败${enemy.unit.name} · 纹银 +${silverDrop.toLocaleString()}`, tone: 'gold' }],
    })
    if (!reward) continue
    for (const member of members) {
      if (member.hp <= 0) continue
      const { unit } = member.fighter
      const healed = Math.round(unit.maxHp * reward.hpPercent / 100)
      member.hp = restoreHp(member.fighter, member.hp, healed, reward, round, events)
      const rageDelta = gainRage(member.rage, reward.rage, member.effects)
      if (rageDelta <= 0) continue
      member.rage += rageDelta
      events.push({
        round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: unit.slot, rageDelta, effectSourceId: reward.sourceId,
        segments: [{ type: 'tag', text: `${reward.sourceName} · 击败${enemy.unit.name} · 怒气 +${rageDelta}`, tone: 'gold' }],
      })
    }
  }
}

export function resolveHealing(
  target: StatusTarget,
  hp: number,
  effects: readonly ActiveEffect[],
  timing: { trigger: HealingTrigger; round: number; isOwner?: boolean; sourceSlot?: CombatUnitDTO['slot'] },
  events: BattleEventDTO[],
) {
  const { unit } = target
  if (hp <= 0 || hp >= unit.maxHp) return hp

  const selfHealBonus = timing.trigger === 'ROUND_END'
    ? effects.find((effect) => effect.kind === 'SELF_ROUND_HEAL_BONUS')?.percent ?? 0
    : 0
  let currentHp = hp
  for (const effect of effects) {
    if (effect.kind !== 'HEAL' || effect.trigger !== timing.trigger) continue
    if (timing.isOwner === false && effect.target === 'SELF') continue
    if (effect.target === 'LEADER' && !unit.slot.endsWith('_MAIN')) continue
    if (effect.belowHpPercent !== undefined && currentHp * 100 >= unit.maxHp * effect.belowHpPercent) continue

    const selfHeal = effect.target === 'SELF' && (effect.sourceType === 'EQUIPMENT' || effect.sourceType === 'INNER')
    const base = effect.unit === 'HP' ? effect.amount : unit.maxHp * effect.amount / 100
    const amount = Math.round(base * (100 + (selfHeal ? selfHealBonus : 0)) / 100)
    currentHp = restoreHp(target, currentHp, amount, effect, timing.round, events, timing.sourceSlot)
  }
  return currentHp
}

export function restorePartyRound(
  members: { fighter: StatusTarget; hp: number; effects: readonly ActiveEffect[] }[], round: number, events: BattleEventDTO[],
) {
  const owner = members.find(({ hp, effects }) => hp > 0 && effects.some((effect) => effect.kind === 'ROUND_TEAM_RESTORE'))
  const effect = owner?.effects.find((candidate) => candidate.kind === 'ROUND_TEAM_RESTORE')
  if (!owner || !effect || round % effect.every !== 0) return
  const slot = owner.fighter.unit.slot
  for (const member of members) {
    if (member.hp <= 0) continue
    for (const kind of periodicStatuses) {
      const { category } = PERIODIC_DAMAGE[kind]
      if (category === 'poison' || category === 'bleed') removePeriodicStatus(member.fighter, kind, { ...effect, slot }, round, events)
    }
    member.hp = restoreHp(member.fighter, member.hp, Math.round(member.fighter.unit.maxHp * effect.hpPercent / 100), effect, round, events, slot)
  }
}

export function resolveAttackLifesteal(
  target: StatusTarget, hp: number, damageToHp: number, outer: boolean,
  effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[],
) {
  if (hp <= 0 || hp >= target.unit.maxHp || damageToHp <= 0) return hp
  let lifesteal: Extract<ActiveEffect, { kind: 'OUTER_LIFESTEAL' | 'ATTACK_LIFESTEAL' }> | undefined
  for (const effect of effects) {
    if (effect.kind !== 'ATTACK_LIFESTEAL' && !(outer && effect.kind === 'OUTER_LIFESTEAL')) continue
    if (!lifesteal || effect.percent > lifesteal.percent) lifesteal = effect
  }
  if (!lifesteal) return hp
  return restoreHp(target, hp, Math.round(damageToHp * lifesteal.percent / 100), lifesteal, round, events)
}

export function grantShield(
  target: ShieldedUnit, amount: number, sourceSlot: CombatUnitDTO['slot'], round: number,
  events: BattleEventDTO[], effect?: ActiveEffect, baseAmount = amount,
) {
  if (amount <= target.shield) return

  const shieldDelta = amount - target.shield
  const extra = amount - Math.max(target.shield, baseAmount)
  const statusApplied = target.shield === 0 ? SHIELDED : undefined
  target.shield = amount
  events.push({
    round, type: 'EFFECT', actorSlot: sourceSlot, targetSlot: target.unit.slot,
    effectSourceId: effect?.sourceId, shieldDelta, statusApplied,
    segments: [
      { type: 'tag', text: effect?.sourceName ?? SHIELDED, tone: 'jade' },
      { type: 'text', text: ' ' },
      { type: 'actor', name: target.unit.name, isAlly: target.unit.slot.startsWith('ALLY'), isPlayer: target.unit.isPlayer },
      { type: 'text', text: `护盾 +${shieldDelta.toLocaleString()}，当前 ${amount.toLocaleString()}。` },
      ...(target.shieldBonus && extra > 0 ? [{ type: 'tag', text: `${target.shieldBonus.sourceName} · 护盾增量 +${extra.toLocaleString()}`, tone: 'jade' } as const] : []),
      ...(effect?.kind === 'LOW_HP_SHIELD' ? [{ type: 'tag', text: `护体金光 · ${effect.rounds} 回合`, tone: 'jade' } as const] : []),
    ],
  })
}

function shieldPoints(target: ShieldedUnit, base: number) {
  return Math.round(base * (100 + (target.shieldBonus?.percent ?? 0)) / 100)
}

export function grantRoundShields(
  owner: CombatUnitDTO, effects: readonly ActiveEffect[], livingAllies: readonly ShieldedUnit[], round: number, events: BattleEventDTO[],
) {
  for (const effect of effects) {
    if (effect.kind !== 'ROUND_START_SHIELD') continue
    if (effect.openingSelfOnly && round !== 1) continue
    const amount = Math.round(owner.maxMp * effect.maxMpPercent / 100)
    for (const ally of livingAllies) {
      if (effect.openingSelfOnly && ally.unit.slot !== owner.slot) continue
      const timed = ally.timedShield?.points ?? 0
      grantShield(ally, shieldPoints(ally, amount) + timed, owner.slot, round, events, effect, amount + timed)
    }
  }
}

export function triggerLowHpEffects(
  target: ShieldedUnit & StatusTarget, hpBefore: number, hp: number, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[],
) {
  if (hp <= 0 || hp >= hpBefore) return
  for (const effect of effects) {
    if (effect.kind !== 'LOW_HP_SHIELD' && effect.kind !== 'LOW_HP_FURY') continue
    const threshold = target.unit.maxHp * effect.belowHpPercent
    if (hpBefore * 100 < threshold || hp * 100 >= threshold) continue
    if (effect.kind === 'LOW_HP_FURY') {
      const furies = target.furies ??= []
      if (furies.some(({ effect: prior }) => prior.sourceId === effect.sourceId)) continue
      furies.push({ effect, lastRound: round + effect.rounds - 1 })
      if (effect.controlImmunity) for (const status of Object.values(target.statuses ?? {})) {
        if (isControl(status.rule.status)) removeStatus(target, status, round, events, effect)
      }
      const bonuses = `攻击 +${effect.attackPercent}%${effect.controlImmunity ? '，免控' : ''}${effect.guaranteedCrit ? '、必暴' : ''}`
      events.push({
        round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: effect.sourceId,
        statusApplied: effect.statusName, statusRounds: effect.rounds,
        segments: [{ type: 'tag', tone: 'red', text: `${effect.sourceName} · ${effect.statusName} · ${bonuses}` }],
      })
    } else {
      const base = Math.round(target.unit.maxHp * effect.maxHpPercent / 100)
      const points = shieldPoints(target, base)
      const existing = target.timedShield?.points ?? 0
      grantShield(target, target.shield + Math.max(0, points - existing), target.unit.slot, round, events, effect,
        target.shield + Math.max(0, base - existing))
      target.timedShield = {
        points: Math.max(existing, points), lastRound: round + effect.rounds - 1,
        sourceId: effect.sourceId, sourceName: effect.sourceName,
      }
    }
  }
}

export function expireTimedShield(target: ShieldedUnit, round: number, events: BattleEventDTO[]) {
  const shield = target.timedShield
  if (!shield || round < shield.lastRound) return
  delete target.timedShield
  if (shield.points <= 0) return
  target.shield -= shield.points
  events.push({
    round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: shield.sourceId,
    shieldDelta: -shield.points, statusRemoved: target.shield === 0 ? SHIELDED : undefined,
    segments: [{ type: 'tag', text: `${shield.sourceName} · 护体金光消散 ${shield.points.toLocaleString()} 点护盾`, tone: 'jade' }],
  })
}

export function resolveShieldDamage(target: ShieldedUnit, damage: number, targetHp: number, multiplier = 1) {
  const segments: RichSegment[] = []
  if (target.shield <= 0 || damage <= 0) return { damage, shieldEvent: {}, segments }

  const spent = Math.min(target.shield, Math.floor(damage * multiplier))
  // 撕盾倍率只作用于盾值。最后不足一个伤害点的护盾仍吸收 1 点伤害。
  const absorbed = Math.ceil(spent / multiplier)
  target.shield -= spent
  if (target.timedShield) target.timedShield = { ...target.timedShield, points: Math.max(0, target.timedShield.points - spent) }
  const broken = target.shield === 0
  const rend = multiplier > 1 ? ` · 撕盾 ${spent.toLocaleString()}` : ''
  segments.push({ type: 'tag', text: `护盾吸收 ${absorbed.toLocaleString()}${rend}`, tone: 'jade' })
  if (broken) segments.push({ type: 'tag', text: '破盾', tone: 'red' })
  else segments.push({ type: 'tag', text: `护盾剩余 ${target.shield.toLocaleString()}`, tone: 'jade' })
  return {
    damage: Math.min(targetHp, damage - absorbed),
    shieldEvent: { shieldDelta: -spent, shieldAbsorbed: absorbed, statusRemoved: broken ? SHIELDED : undefined },
    segments,
  }
}

function parryDamage(damage: number, absorb: number, segments: RichSegment[]) {
  if (absorb <= 0) return damage
  const reduced = Math.round(damage * (100 - absorb) / 100)
  segments.push({ type: 'tag', text: `招架 · 盾前减伤 ${(damage - reduced).toLocaleString()}`, tone: 'jade' })
  return reduced
}

export function splitFormationDamage<T extends ShieldedUnit>(
  formation: DamageShareFormation | undefined, target: T, living: readonly T[], damage: number, parryAbsorb: number,
) {
  const segments: RichSegment[] = []
  const shares: { recipient: T; damage: number }[] = []
  if (!formation) return { damage, shares, parryAbsorb, segments }
  damage = parryDamage(damage, parryAbsorb, segments)
  const each = Math.floor(damage / living.length)
  const remainder = damage % living.length
  const others = living.filter((unit) => unit !== target)
  for (const [index, recipient] of others.entries()) {
    const amount = each + Number(index + 1 < remainder)
    if (amount > 0) shares.push({ recipient, damage: amount })
  }
  const count = living.length === 3 ? '三' : living.length === 7 ? '七' : String(living.length)
  segments.push({ type: 'tag', text: `${formation.sourceName} · ${count}人均摊 ${damage.toLocaleString()}`, tone: 'jade' })
  return { damage: each + Number(remainder > 0), shares, parryAbsorb: 0, segments }
}

export function storedDamageEffect(effects: readonly ActiveEffect[]) {
  return effects.filter((effect) => effect.kind === 'STORE_INCOMING_DAMAGE').sort((a, b) => b.percent - a.percent)[0]
}

function resistsElement(effect: ActiveEffect, element: DamageElement | undefined): effect is Extract<ActiveEffect, { kind: 'ELEMENT_RESISTANCE' }> {
  return !!element && effect.kind === 'ELEMENT_RESISTANCE' && (!effect.elements || effect.elements.includes(element))
}

export function resolveIncomingPhysicalDamage(
  target: ShieldedUnit & StatusTarget, damage: number, targetHp: number, effects: readonly ActiveEffect[],
  attackerStance?: StanceType, parryAbsorb = 0, contact?: {
    round: number; events: BattleEventDTO[];
    rng?: () => number; critical?: boolean; shieldMultiplier?: number; ordinaryCreature?: EnemyCombatConfig['creature'];
    attackerCombat?: EnemyCombatConfig; element?: DamageElement; bypassShield?: true; recordRewards?: boolean; outer?: boolean;
    ignoreTriggeredProtection?: true;
  },
) {
  const segments: RichSegment[] = []
  const element = contact?.element
  let poisonRecovery: PoisonRecovery | undefined
  const rolledBlocks = new Set<string>()
  damage = parryDamage(damage, parryAbsorb, segments)
  for (const effect of effects) {
    if (effect.kind === 'BANDIT_BEAST_REDUCTION' && contact?.ordinaryCreature) {
      const prevented = Math.min(damage, effect.amount)
      damage -= prevented
      if (prevented > 0) segments.push({ type: 'tag', tone: 'jade', text: `${effect.sourceName} · 固定减伤 ${prevented}` })
      continue
    }
    if (effect.kind === 'PHYSICAL_BLOCK') {
      if ((effect.outerOnly && !contact?.outer) || (effect.sharedRoll && rolledBlocks.has(effect.sharedRoll))) continue
      if (effect.sharedRoll) rolledBlocks.add(effect.sharedRoll)
      if (damage <= 0 || !contact?.rng || contact.rng() >= effect.chancePercent / 100) continue
    } else if (effect.kind === 'PHYSICAL_DAMAGE_REDUCTION') {
      if (effect.attackerStance && effect.attackerStance !== attackerStance) continue
      if (effect.attackerTraits && !matchesEnemyTrait(contact?.attackerCombat, effect.attackerTraits)) continue
      if (effect.criticalOnly && !contact?.critical) continue
      if (effect.belowHpPercent !== undefined && targetHp * 100 >= target.unit.maxHp * effect.belowHpPercent) continue
    } else if (effect.kind === 'POISON_MP_RECOVERY') {
      if (element !== 'POISON') continue
    } else if (!resistsElement(effect, element)) continue
    const reduced = Math.round(damage * (100 - (effect.kind === 'POISON_MP_RECOVERY' ? effect.resistancePercent : effect.percent)) / 100)
    const prevented = damage - reduced
    if (prevented > 0) {
      if (effect.kind === 'POISON_MP_RECOVERY') {
        poisonRecovery = { effect, amount: Math.round(prevented * effect.recoverPercent / 100) }
      }
      const label = effect.kind === 'PHYSICAL_BLOCK' ? `${effect.label ?? '金丝格挡'} · `
        : effect.kind === 'POISON_MP_RECOVERY' ? '毒伤 · '
          : effect.kind === 'ELEMENT_RESISTANCE' && element ? `${ELEMENT_LABELS[element]}伤害 · ` : ''
      segments.push({ type: 'tag', text: `${effect.sourceName} · ${label}盾前减伤 ${prevented.toLocaleString()}`, tone: 'jade' })
    }
    damage = reduced
  }
  const powder = target.critPill
  const absorb = effects.find((effect) => effect.kind === 'HIT_QI_ABSORB')
  if (absorb && damage > 0 && contact?.rng && contact.rng() < absorb.chancePercent / 100) {
    const { slot } = target.unit
    contact.events.push({
      round: contact.round, type: 'EFFECT', actorSlot: slot, targetSlot: slot, effectSourceId: absorb.sourceId,
      qiDrop: contact.recordRewards === false ? undefined : damage,
      segments: [{ type: 'tag', text: `${absorb.sourceName} · 经脉逆转 · 吸收 ${damage.toLocaleString()}${contact.recordRewards === false ? '' : ` · 真气 +${damage.toLocaleString()}`}`, tone: 'jade' }],
    })
    damage = 0
  }
  if (powder?.protection && !contact?.ignoreTriggeredProtection && contact?.outer && damage > 0) {
    const reduced = Math.round(damage * (100 - powder.effect.outerReduction) / 100)
    segments.push({ type: 'tag', text: `${powder.effect.sourceName} · 化瘀护身耗尽 · 盾前减伤 ${damage - reduced}`, tone: 'jade' })
    target.critPill = { ...powder, protection: false }
    damage = reduced
  }
  const hit = contact?.bypassShield ? { damage, shieldEvent: {}, segments: [] } : resolveShieldDamage(target, damage, targetHp, contact?.shieldMultiplier)
  const store = storedDamageEffect(effects)
  const postShield = damage - (hit.shieldEvent.shieldAbsorbed ?? 0)
  const stored = store ? Math.round(postShield * store.percent / 100) : 0
  const log = [...segments, ...hit.segments]
  if (store && stored > 0) {
    target.storedDamage = (target.storedDamage ?? 0) + stored
    log.push({ type: 'tag', text: `${store.sourceName} · 储劲 +${stored.toLocaleString()}（共 ${target.storedDamage.toLocaleString()}）`, tone: 'jade' })
  }
  const uncappedDamage = postShield - stored
  return { ...hit, damage: stored > 0 ? Math.min(targetHp, uncappedDamage) : hit.damage, uncappedDamage, segments: log, poisonRecovery }
}

function rageRateBonus(amount: number, effects: readonly ActiveEffect[]) {
  const boost = effects.find((effect) => effect.kind === 'RAGE_GAIN_PERCENT')
  return boost ? { boost, amount: Math.round(amount * boost.percent / 100) } : undefined
}

export function gainRage(rage: number, amount: number, effects: readonly ActiveEffect[]) {
  return Math.max(0, Math.min(100 - rage, amount + (rageRateBonus(amount, effects)?.amount ?? 0)))
}

export function resolveHitRage(
  rage: number, baseGain: number, hpLost: number, effects: readonly ActiveEffect[], formation?: DamageShareFormation,
) {
  const capacity = Math.max(0, 100 - rage)
  const sharedHit = formation?.sharedRage && hpLost > 0
  let gained = Math.min(capacity, sharedHit ? Math.max(baseGain, STANDARD_HIT_RAGE) : baseGain)
  const segments: RichSegment[] = []
  for (const effect of effects) {
    if (effect.kind !== 'HIT_RAGE') continue
    if ('baseHitRagePercent' in effect && hpLost <= 0) continue
    const amount = 'amount' in effect ? effect.amount : Math.round(STANDARD_HIT_RAGE * effect.baseHitRagePercent / 100)
    const actual = Math.min(capacity - gained, amount)
    if (actual <= 0) continue
    gained += actual
    segments.push({ type: 'tag', text: `${effect.sourceName} · 受击怒气 +${actual}`, tone: 'gold' })
  }
  if (formation && (!formation.sharedRage || sharedHit)) {
    const extra = Math.round(STANDARD_HIT_RAGE * (formation.hitRageMultiplier - 1))
    const actual = Math.min(capacity - gained, extra)
    if (actual > 0) {
      gained += actual
      segments.push({ type: 'tag', text: `${formation.sourceName} · 受击怒气 +${actual}`, tone: 'gold' })
    }
  }
  const boost = rageRateBonus(gained, effects)
  const extra = Math.min(capacity - gained, boost?.amount ?? 0)
  if (boost && extra > 0) {
    gained += extra
    segments.push({ type: 'tag', text: `${boost.boost.sourceName} · 怒气积攒 +${extra}`, tone: 'gold' })
  }
  return { gained, segments }
}

export function resolveCritRage(
  unit: CombatUnitDTO, rage: number, target: EnemyBattleState, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[],
) {
  const effect = effects.find((candidate) => candidate.kind === 'CRIT_RAGE')
  if (!effect) return rage
  const targetRage = target.rage ?? target.unit.rage
  const drained = Math.min(targetRage, effect.amount)
  const gained = gainRage(rage, effect.amount, effects)
  target.rage = targetRage - drained
  if (drained > 0) events.push({
    round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: target.unit.slot, effectSourceId: effect.sourceId,
    rageTargetSlot: target.unit.slot, rageDelta: -drained,
    segments: [{ type: 'tag', text: `${effect.sourceName} · ${target.unit.name}怒气 -${drained}`, tone: 'gold' }],
  })
  if (gained > 0) events.push({
    round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: unit.slot, effectSourceId: effect.sourceId, rageDelta: gained,
    segments: [{ type: 'tag', text: `${effect.sourceName} · 怒气 +${gained}`, tone: 'gold' }],
  })
  return rage + gained
}

function rageMoveSkill(move: NonNullable<EnemyCombatConfig['rageMove']>, source: string): SkillConfig {
  const battleEffects: BattleEffect[] = []
  if (move.periodic) battleEffects.push({ kind: 'PERIODIC_ON_HIT', rule: move.periodic })
  if (move.statusOnHit) battleEffects.push({ kind: 'ON_HIT_STATUS', rule: move.statusOnHit })
  return {
    id: move.id, name: move.name, combatForm: move.form, powerRatio: move.powerRatio, slot: 'ULT', tier: 'blue',
    source, desc: move.name, castNarrative: move.name,
    battleEffects,
  }
}

function enemyRageSkill(enemy: EnemyBattleState) {
  const skillId = enemy.combat?.rageSkillId
  const move = enemy.combat?.rageMove
  return move ? rageMoveSkill(move, enemy.unit.name) : skillId ? SKILLS[skillId] : undefined
}

export function enemyInnerMp(enemy: EnemyBattleState) {
  return enemy.mp ?? enemy.unit.maxMp
}

function enemyUltMpCost(enemy: EnemyBattleState) {
  return Math.round(enemy.unit.maxMp * (enemy.combat?.innerEndurance?.ultCostPercent ?? 0) / 100)
}

function canUseEnemyRage(enemy: EnemyBattleState, skill: SkillConfig, round: number, mpCost: number) {
  const disarmed = hasStatus(enemy, 'DISARM', round) && (isWeaponForm(skill.combatForm) || !!enemy.combat?.rageMove)
  return (enemy.rage ?? enemy.unit.rage) >= 100 && enemyInnerMp(enemy) >= mpCost &&
    !disarmed && !hasStatus(enemy, 'ULT_LOCK', round) && !hasStatus(enemy, 'SEAL', round)
}

export function readyEnemyRagePower(enemy: EnemyBattleState, round: number) {
  const skill = enemyRageSkill(enemy)
  return skill && canUseEnemyRage(enemy, skill, round, enemyUltMpCost(enemy)) ? skill.powerRatio : 1
}

export function canInterruptEnemyUltimate(enemy: EnemyBattleState, round: number) {
  const skill = enemyRageSkill(enemy)
  const chargingThisRound = enemy.combat?.charge?.round === round &&
    !(enemy.combat.charge.requiresWeapon && hasStatus(enemy, 'DISARM', round))
  return !blockingActionStatus(enemy, round) && enemy.chargeState === undefined && !chargingThisRound &&
    !!skill && canUseEnemyRage(enemy, skill, round, enemyUltMpCost(enemy))
}

export function enemyPreferredTarget<T extends StatusTarget>(enemy: EnemyBattleState, skill: SkillConfig | undefined, living: readonly T[]) {
  const move = enemy.combat?.rageMove
  if (!move?.target || skill?.id !== move.id) return
  const front = living.find(({ unit }) => unit.slot === 'ALLY_LEFT') ?? living.find(({ unit }) => unit.slot === 'ALLY_MAIN') ?? living[0]
  return move.target === 'REAR' ? living.find(({ unit }) => unit.slot === 'ALLY_RIGHT') ?? front : front
}

export function enemyRageAction(enemy: EnemyBattleState, round: number, events: BattleEventDTO[]) {
  const skill = enemyRageSkill(enemy)
  if (!skill) return
  const rage = enemy.rage ?? enemy.unit.rage
  const cost = enemyUltMpCost(enemy)
  const ready = canUseEnemyRage(enemy, skill, round, cost)
  const delta = ready ? -85 : Math.min(35, 100 - rage)
  const spent = ready ? cost : 0
  enemy.rage = rage + delta
  if (spent > 0) enemy.mp = enemyInnerMp(enemy) - spent
  if (delta) events.push({
    round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, rageDelta: delta,
    mpDelta: spent > 0 ? -spent : undefined,
    segments: [
      { type: 'tag', text: ready ? `${enemy.unit.name} · ${skill.name} · 怒气 ${delta}` : `${enemy.unit.name} · 怒气 +${delta}`, tone: 'gold' },
      ...(spent > 0 ? [{ type: 'tag', text: `内力 -${spent.toLocaleString()}`, tone: 'gold' } as const] : []),
    ],
  })
  if (!delta && cost > enemyInnerMp(enemy)) events.push({
    round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, effectSourceId: skill.id,
    segments: [{ type: 'tag', text: `${skill.name} · 内力不足（${enemyInnerMp(enemy)} / ${cost}）`, tone: 'gold' }],
  })
  return ready ? skill : undefined
}

export function lethalSavesFrom(effects: readonly ActiveEffect[], allowRetreat = false) {
  const order = (effect: LethalSave) => effect.retreatBattle ? 3 : effect.revive ? 2 : effect.sourceType === 'MEDICINE' ? 1 : 0
  return effects.filter((effect): effect is LethalSave => effect.kind === 'FIRST_LETHAL_SAVE' && (allowRetreat || !effect.retreatBattle))
    .sort((a, b) => order(a) - order(b))
}

export function canCounterLethal(
  target: StatusTarget, saves: readonly LethalSave[] | undefined, hp: number, damage: number, round: number,
) {
  return !target.lethalCounterUsed && hp > 0 && damage >= hp && !saves?.some((effect) => !effect.retreatBattle) &&
    target.lethalGuard?.round !== round
}

export function resolveLethalSave(
  remaining: LethalSave[] | undefined, target: StatusTarget, hp: number, damage: number, round: number,
) {
  if (!remaining || hp <= 0 || damage < hp) return
  const { unit } = target
  const guarding = target.lethalGuard?.round === round ? target.lethalGuard.effect : undefined
  const effect = guarding ?? remaining.shift()
  if (!effect) return
  if (effect.retreatBattle) {
    target.retreated = true
    const event: BattleEventDTO = {
      round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: unit.slot, effectSourceId: effect.sourceId, statusApplied: '烟雾脱身',
      segments: [{ type: 'tag', text: `${effect.sourceName} · 烟雾脱身`, tone: 'jade' },
        { type: 'text', text: ` ${unit.name}掷出烟雾丸，带队撤离。` }],
    }
    return { damage: hp - 1, savedHp: 1, event, effect, target }
  }

  if (effect.guardRound && !guarding) target.lethalGuard = { round, effect }
  if (effect.escapeNextRound) target.lethalEscape = { round: round + 1, effect }
  const hpAfterHit = effect.revive ? 0 : 1
  const healPercent = (effect.heal?.percent ?? 0) * (effect.sourceType === 'MEDICINE' ? (100 - statusPercent(target, 'HEAL_DOWN', round)) / 100 : 1)
  const healing = Math.round(unit.maxHp * healPercent / 100)
  const savedHp = effect.revive
    ? unit.maxHp
    : Math.min(unit.maxHp, effect.heal?.restoreToPercent ? Math.max(1, healing) : hpAfterHit + healing)
  const restored = savedHp - hpAfterHit
  const action = effect.revive ? '倒地后复活' : '遭遇致命一击，锁血至 1 点气血'
  const segments: RichSegment[] = [
    { type: 'tag', text: `${effect.sourceName} · ${guarding ? '不死意志护体' : effect.revive ? '复活' : '免死'}`, tone: 'jade' },
    { type: 'text', text: ` ${unit.name}${action}${restored > 0 ? '，回复气血 ' : '。'}` },
  ]
  if (restored > 0) segments.push({ type: 'damage', value: restored, category: 'heal' })
  if (effect.sourceType === 'MEDICINE') {
    const prevented = Math.min(unit.maxHp - hpAfterHit, Math.round(unit.maxHp * (effect.heal?.percent ?? 0) / 100)) - restored
    if (prevented > 0) segments.push({ type: 'tag', text: `重伤减疗 −${prevented.toLocaleString()}`, tone: 'red' })
  }
  if (effect.escapeNextRound) segments.push({ type: 'tag', text: '下一回合灵狐遁逃', tone: 'jade' })
  const event: BattleEventDTO = {
    round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: unit.slot,
    effectSourceId: effect.sourceId, hpDelta: restored > 0 ? restored : undefined, segments,
    medicineUsed: effect.sourceType === 'MEDICINE' ? effect.sourceId : undefined,
    statusApplied: effect.escapeNextRound ? '灵狐遁逃' : effect.guardRound && !guarding ? '不死意志' : undefined,
    statusRounds: effect.escapeNextRound || (effect.guardRound && !guarding) ? 1 : undefined,
  }
  return { damage: hp - hpAfterHit, savedHp, event, effect, target }
}

export function recordLethalSave(saved: NonNullable<ReturnType<typeof resolveLethalSave>>, events: BattleEventDTO[]) {
  events.push(saved.event)
  if (saved.effect.cleanseInnerInjury) {
    const source = { ...saved.effect, slot: saved.target.unit.slot }
    for (const kind of periodicStatuses) {
      if (PERIODIC_DAMAGE[kind].category === 'qi') removePeriodicStatus(saved.target, kind, source, saved.event.round, events)
    }
  }
}

export function applyLethalSave(
  saved: NonNullable<ReturnType<typeof resolveLethalSave>>, defenderDefense: number,
  attacker: EnemyBattleState, attackerHp: number, events: BattleEventDTO[],
) {
  recordLethalSave(saved, events)
  const reflected = Math.min(attackerHp, Math.round(defenderDefense * (saved.effect.reflectDefensePercent ?? 0) / 100))
  if (reflected <= 0) return attackerHp
  if (attacker.playerGuard) return applyBonusDamage(saved.effect, resolveTrueDamage(reflected, attacker, attackerHp, []), attacker, {
    actorSlot: saved.event.actorSlot, targetHp: attackerHp, round: saved.event.round, label: '反震', category: 'reflect',
  }, events)

  events.push({
    round: saved.event.round, type: 'EFFECT', actorSlot: saved.event.actorSlot, targetSlot: attacker.unit.slot,
    effectSourceId: saved.effect.sourceId, hpDelta: -reflected,
    segments: [
      { type: 'tag', text: `${saved.effect.sourceName} · 反震`, tone: 'purple' },
      { type: 'text', text: ' ' },
      { type: 'actor', name: attacker.unit.name, isAlly: attacker.unit.slot.startsWith('ALLY'), isPlayer: attacker.unit.isPlayer },
      { type: 'text', text: '受到反伤 ' },
      { type: 'damage', value: reflected, category: 'reflect' },
    ],
  })
  reactToEnemyDamage(attacker, reflected, attackerHp - reflected, saved.event.actorSlot, saved.event.round, events)
  return attackerHp - reflected
}

export function applyDirectedDamage(
  receiver: {
    fighter: ShieldedUnit & StatusTarget; hp: number; defense: number; effects: readonly ActiveEffect[]; saves?: LethalSave[];
    interceptLethal?: boolean; beforeLethal?: (hp: number) => { hp: number; attackerHp: number } | undefined;
  },
  contact: {
    source: StatusSource; attacker: EnemyBattleState; attackerHp: number; damage: number; round: number;
    label?: '命中' | '代承' | '掌风' | '爆炸' | '逆行冲击'; parryAbsorb?: number; hitResult?: 'HIT' | 'PARRY' | 'CRIT'; rageDelta?: number; segments?: RichSegment[];
    hitRage?: { current: number; base: number; formation?: DamageShareFormation }; ignoreDamageReduction?: true; rng?: () => number; critical?: boolean; shieldMultiplier?: number;
    ordinaryCreature?: EnemyCombatConfig['creature']; outer?: boolean;
    element?: DamageElement;
    cast?: Pick<BattleEventDTO, 'skillId' | 'skillName' | 'skillTier' | 'isUlt'>;
  },
  events: BattleEventDTO[],
) {
  const { fighter, defense, effects, saves } = receiver
  const { source, attacker, attackerHp, damage, round, label = '分摊', hitResult } = contact
  const hit = resolveIncomingPhysicalDamage(fighter, damage, receiver.hp, contact.ignoreDamageReduction ? [] : effects, attacker.stance, contact.parryAbsorb,
    { ...contact, events, attackerCombat: attacker.combat, ignoreTriggeredProtection: contact.ignoreDamageReduction })
  const redirectedDamage = receiver.interceptLethal && hit.damage >= receiver.hp ? hit.damage : 0
  const counter = !redirectedDamage && canCounterLethal(fighter, saves, receiver.hp, hit.damage, round)
    ? receiver.beforeLethal?.(receiver.hp) : undefined
  const hp = counter?.hp ?? receiver.hp
  const incoming = counter ? Math.min(hp, hit.uncappedDamage) : hit.damage
  const saved = redirectedDamage ? undefined : resolveLethalSave(saves, fighter, hp, incoming, round)
  const lost = redirectedDamage ? 0 : Math.min(hp, saved?.damage ?? incoming)
  const rage = contact.hitRage ? resolveHitRage(contact.hitRage.current, contact.hitRage.base, lost, effects, contact.hitRage.formation) : undefined
  const rageDelta = contact.rageDelta ?? (rage?.gained || undefined)
  events.push({
    round, type: hitResult ? 'SKILL_CAST' : 'EFFECT', actorSlot: attacker.unit.slot, targetSlot: fighter.unit.slot,
    effectSourceId: source.sourceId, hpDelta: lost > 0 ? -lost : 0, ...hit.shieldEvent,
    ...contact.cast,
    hitResult, rageDelta, rageTargetSlot: rageDelta ? fighter.unit.slot : undefined,
    segments: [
      { type: 'tag', text: `${source.sourceName} · ${label} ${damage.toLocaleString()}`, tone: 'jade' },
      { type: 'text', text: ` ${fighter.unit.name}${redirectedDamage ? '的致命伤被代承，实际受到 ' : '受到 '}` },
      { type: 'damage', value: lost, category: 'phys' },
      ...(contact.segments ?? []),
      ...hit.segments,
      ...(rage?.segments ?? []),
    ],
  })
  const postHitHp = saved?.savedHp ?? hp - lost
  let newAttackerHp = saved ? applyLethalSave(saved, defense, attacker, attackerHp, events) : counter?.attackerHp ?? attackerHp
  if (!fighter.retreated && !contact.ignoreDamageReduction) newAttackerHp = resolveHitReflection(fighter.unit, attacker, newAttackerHp, lost, effects, round, events)
  if (!fighter.retreated) triggerLowHpEffects(fighter, hp, postHitHp, effects, round, events)
  const newHp = fighter.retreated ? postHitHp : useCriticalHitPill(fighter, postHitHp, !!contact.critical && !contact.ignoreDamageReduction, lost, effects, round, events)
  return {
    hp: newHp,
    attackerHp: newAttackerHp,
    lethal: !redirectedDamage && hp > 0 && incoming >= hp,
    hpLost: lost,
    redirectedDamage,
    rageGained: rage?.gained ?? 0,
    poisonRecovery: hit.poisonRecovery,
  }
}

function damageToHp(damage: number, targetHp: number, shieldCover: number) {
  return Math.max(0, Math.min(targetHp, damage - shieldCover))
}

export function isPoisoned(target: StatusTarget) {
  return poisonStacks(target) > 0
}

export function hiddenWeaponDamage(attack: number, effects: readonly ActiveEffect[]) {
  const percent = effects.reduce((total, effect) => effect.kind === 'HIDDEN_WEAPON_DAMAGE' ? total + effect.percent : total, 100)
  return attack * percent / 100
}

export function hiddenWeaponChance(chance: number, effects: readonly ActiveEffect[]) {
  return Math.min(100, effects.reduce((total, effect) => effect.kind === 'HIDDEN_WEAPON_CHANCE' ? total + effect.points : total, chance))
}

export function poisonStacks(target: StatusTarget) {
  let count = 0
  for (const kind of periodicStatuses) {
    if (PERIODIC_DAMAGE[kind].category !== 'poison') continue
    const effect = target.ongoingDamage?.[kind]
    if (effect) count += effect.stacks ?? 1
  }
  return count
}

export function applyPeriodicOnHit(
  source: StatusSource & { slot: CombatUnitDTO['slot']; unitId?: string }, target: StatusTarget, targetHp: number, rule: PeriodicRule,
  hit: { round: number; attack: number; rng: () => number; effects?: readonly ActiveEffect[]; protection?: readonly ActiveEffect[]; outer?: boolean },
  events: BattleEventDTO[],
) {
  const chance = rule.chancePercent ?? 100
  if (targetHp <= 0 || hit.round < (rule.firstRound ?? 1) || chance <= 0 || (chance < 100 && hit.rng() >= chance / 100)) return
  const { name, category } = PERIODIC_DAMAGE[rule.status]
  let rounds = rule.rounds
  if (hit.outer && category === 'bleed') rounds += hit.effects?.find((effect) => effect.kind === 'OUTER_BLEED_DURATION')?.extraRounds ?? 0
  let blockedBy: string | undefined
  for (const effect of hit.protection ?? []) {
    if (effect.kind === 'PERIODIC_IMMUNITY' && effect.status === rule.status) blockedBy = effect.sourceName
    if (effect.kind === 'STATUS_DURATION_REDUCTION' && !effect.controlOnly) {
      rounds = Math.floor(rounds * (effect.scalePercent ?? 100) / 100) - (effect.rounds ?? 0)
      if (rounds <= 0) blockedBy = effect.sourceName
    }
    if (blockedBy) break
  }
  if (blockedBy) {
    events.push({
      round: hit.round, type: 'EFFECT', actorSlot: source.slot, targetSlot: target.unit.slot, effectSourceId: source.sourceId,
      segments: [{ type: 'tag', text: `${blockedBy} · 抵抗${name}`, tone: 'jade' }],
    })
    return
  }
  const ongoing = target.ongoingDamage ??= {}
  const previous = ongoing[rule.status]
  const stacks = rule.maxStacks ? Math.min(rule.maxStacks, (previous?.stacks ?? 0) + (rule.stacksPerHit ?? 1)) : undefined
  const armorReduction = !rule.defenseDownAtMaxStacks || stacks === rule.maxStacks ? rule.defenseDownPercent ?? 0 : 0
  const defenseDownPercent = Math.max(armorReduction, previous?.defenseDownPercent ?? 0)
  const perLayer = 'attackPercent' in rule ? hit.attack * rule.attackPercent / 100 : target.unit.maxHp * rule.maxHpPercent / 100
  ongoing[rule.status] = {
    sourceId: source.sourceId, sourceSlot: source.slot, sourceUnitId: source.unitId, stacks, sourceEffects: hit.effects,
    damage: Math.round(perLayer) * (rule.maxHpDamageTotal ? 1 : stacks ?? 1), remainingRounds: rounds, defenseDownPercent: defenseDownPercent || undefined,
  }
  events.push({
    round: hit.round, type: 'EFFECT', actorSlot: source.slot, targetSlot: target.unit.slot, effectSourceId: source.sourceId,
    statusApplied: name, statusRounds: rounds, statusStacks: stacks,
    segments: [{ type: 'tag', text: `${source.sourceName} · ${name}${stacks ? ` ${stacks} 层` : ''}，持续 ${rounds} 回合${defenseDownPercent ? ` · 防御 −${defenseDownPercent}%` : ''}`, tone: 'red' }],
  })
  return true
}

export function applyTargetDamageBonuses(
  damage: number, target: StatusTarget, targetHp: number, effects: readonly ActiveEffect[],
  segments: RichSegment[], shieldCover = 0, element?: DamageElement, projectedHpLoss?: (damage: number) => number,
) {
  if (damage <= 0) return damage
  const hpLoss = projectedHpLoss ?? ((value: number) => damageToHp(value, targetHp, shieldCover))
  for (const effect of effects) {
    let label: string
    if (effect.kind === 'POISON_BLEED_DAMAGE') {
      if (!isPoisoned(target) && !periodicStatuses.some((kind) => PERIODIC_DAMAGE[kind].category === 'bleed' && target.ongoingDamage?.[kind])) continue
      label = '异常增伤'
    } else if (effect.kind === 'TARGET_STANCE_DAMAGE') {
      if (target.stance !== effect.stance) continue
      label = `对${STANCE_META[effect.stance].name}增伤`
    } else if (effect.kind === 'TARGET_TRAIT_DAMAGE') {
      if ((effect.traits && !matchesEnemyTrait(target.combat, effect.traits)) || (effect.negativeKarma && (target.combat?.karma ?? 0) >= 0)) continue
      label = effect.traits ? '克敌增伤' : `全队伤害 +${effect.percent}%`
    } else if (effect.kind === 'ELEMENT_DAMAGE') {
      if (effect.element !== element) continue
      label = `${ELEMENT_LABELS[effect.element]}增伤`
    } else continue

    const boosted = Math.min(projectedHpLoss ? Infinity : targetHp + shieldCover, Math.round(damage * (100 + effect.percent) / 100))
    const extra = hpLoss(boosted) - hpLoss(damage)
    if (extra > 0) {
      segments.push({ type: 'tag', text: `${effect.sourceName} · ${label} +${extra.toLocaleString()}`, tone: 'purple' })
    }
    damage = boosted
  }
  return damage
}

export function resolveAttackDamage(
  baseDamage: number, target: EnemyBattleState, targetHp: number, attackerLevel: number,
  skill?: SkillConfig, effects: readonly ActiveEffect[] = [],
  attacker?: { hp: number; maxHp: number; regularOuter: boolean; stance?: StanceType; outerForm?: AttackForm; shieldBypass?: StatusSource & { label?: string } },
  parryAbsorb = 0, round = 0, element = skill?.element,
  playerHit?: { stance: StanceType; critical: boolean; rng: () => number; events: BattleEventDTO[];
    preview?: true; combat?: EnemyCombatConfig; outer?: boolean;
    shareDamage?: (damage: number, preview: boolean) => { damage: number; segments: RichSegment[] } },
) {
  const segments: RichSegment[] = []
  let multiplier = skill?.battleEffects?.find((effect) => effect.kind === 'SHIELD_REND')?.multiplier ?? 1
  const baseDefense = Math.round((target.combat?.def ?? 0) * (target.palaceGate?.defensePercent ?? 100) / 100)
  const defense = target.defenseBroken || target.weakSpotOpen ? 0 : battleDefense(target, baseDefense, round,
    target.playerGuard && { hp: targetHp, effects: target.playerGuard.effects, segments })
  const skillPenetration = skill?.battleEffects?.find((effect) => effect.kind === 'ARMOR_PENETRATION')
  let penetrationPercent = skillPenetration?.percent ?? 0
  let penetrationSource = skill?.name
  let flatPenetration = 0
  const flatSources: string[] = []
  if (attacker) {
    for (const effect of effects) {
      if (effect.kind === 'FLAT_ARMOR_PENETRATION') {
        if (!attacker.regularOuter) continue
        if (effect.attackerStance && effect.attackerStance !== attacker.stance) continue
        flatPenetration += effect.points
        flatSources.push(effect.sourceName)
      } else if (effect.kind === 'ARMOR_PENETRATION' && (effect.sourceType === 'EQUIPMENT' || effect.regularOuterOnly) &&
        (!effect.regularOuterOnly || attacker.regularOuter) && effect.percent > penetrationPercent) {
        penetrationPercent = effect.percent
        penetrationSource = effect.sourceName
      } else if (effect.kind === 'OUTER_SHIELD_REND' && attacker.regularOuter) {
        multiplier = Math.max(multiplier, effect.multiplier)
      }
    }
  }
  const shieldBypass = attacker?.shieldBypass
  const shieldBefore = target.shield
  const shieldCover = shieldBypass ? 0 : Math.ceil(shieldBefore / multiplier)
  const guard = target.playerGuard
  const protection = guard && playerHit ? effectsDuringAction(guard.effects, target, round) : undefined
  const rolls: number[] = []
  const guardDamage = playerHit && protection ? (damage: number, preview: boolean, bypass = !!shieldBypass) => {
    let index = 0
    const rng = () => {
      rolls[index] ??= playerHit.rng()
      return rolls[index++]
    }
    const share = playerHit.shareDamage?.(damage, preview)
    const result = resolveIncomingPhysicalDamage(preview ? { ...target } : target, share?.damage ?? damage, targetHp, protection, playerHit.stance, 0, {
      round, events: preview ? [] : playerHit.events, rng,
      critical: playerHit.critical, shieldMultiplier: multiplier, element, attackerCombat: playerHit.combat,
      bypassShield: bypass ? true : undefined, recordRewards: false, outer: playerHit.outer,
    })
    return share ? { ...result, segments: [...share.segments, ...result.segments] } : result
  } : undefined
  const damageLimit = guardDamage ? Infinity : targetHp + shieldCover
  const hpLoss = (damage: number) => guardDamage
    ? Math.min(targetHp, guardDamage(damage, true).damage) : damageToHp(damage, targetHp, shieldCover)

  const heavyBlade = !!target.combat?.heavyArmor && defense > 0 && attacker?.outerForm === 'BLADE'
  const flatIgnored = heavyBlade ? 0 : Math.min(defense, flatPenetration)
  const defenseAfterFlat = defense - flatIgnored
  const percentIgnored = heavyBlade ? 0 : Math.min(defenseAfterFlat, Math.round(defenseAfterFlat * penetrationPercent / 100))
  const parriedBase = parryAbsorb > 0 ? Math.round(baseDamage * (100 - parryAbsorb) / 100) : baseDamage
  const damageAtDefense = (effectiveDefense: number) => parriedBase <= 0 ? 0
    : Math.max(1, Math.round(damageAfterDefense(parriedBase, effectiveDefense, attackerLevel)))
  const damageAfterFlat = defense > 0 ? damageAtDefense(defenseAfterFlat) : parriedBase
  const defendedDamage = percentIgnored > 0 ? damageAtDefense(defenseAfterFlat - percentIgnored) : damageAfterFlat
  const armoredDamage = heavyBlade ? Math.round(defendedDamage / 2) : defendedDamage
  let damage = flatIgnored > 0 || percentIgnored > 0 ? Math.min(damageLimit, armoredDamage) : armoredDamage
  if (parryAbsorb > 0) {
    const unguarded = Math.round(damageAfterDefense(baseDamage, defenseAfterFlat - percentIgnored, attackerLevel))
    segments.push({ type: 'tag', text: `招架 · 盾前减伤 ${(unguarded - defendedDamage).toLocaleString()}`, tone: 'jade' })
  }
  if (heavyBlade) {
    segments.push({
      type: 'tag', text: `重甲 · 刀剑破甲无效 · 盾前减伤 ${(defendedDamage - armoredDamage).toLocaleString()}`, tone: 'jade',
    })
  }
  if (flatIgnored > 0) {
    const extraDamage = hpLoss(damageAfterFlat) - hpLoss(damageAtDefense(defense))
    segments.push({
      type: 'tag',
      text: `${flatSources.join('、')} · 固定破甲 ${flatIgnored.toLocaleString()} 点防御 · 增伤 +${extraDamage.toLocaleString()}`,
      tone: 'gold',
    })
  }
  if (percentIgnored > 0 && penetrationSource) {
    const extraDamage = hpLoss(armoredDamage) - hpLoss(damageAfterFlat)
    const extra = extraDamage > 0 ? ` · 增伤 +${extraDamage.toLocaleString()}` : ''
    segments.push({ type: 'tag', text: `${penetrationSource} · 穿透 ${percentIgnored.toLocaleString()} 点防御${extra}`, tone: 'gold' })
  }

  const outerEffects = skill && skill.slot !== 'OUTER' ? [] : effects
  let bonusPercent = 0
  for (const effect of outerEffects) {
    if (effect.kind !== 'OUTER_DAMAGE') continue
    if (effect.skillOnly && skill?.id !== effect.sourceId) continue
    if (effect.attackerStance && attacker?.stance !== effect.attackerStance) continue
    if (effect.belowHpPercent !== undefined && (!attacker || attacker.hp * 100 >= attacker.maxHp * effect.belowHpPercent)) continue

    bonusPercent += effect.percent
    const boosted = Math.min(damageLimit, Math.round(armoredDamage * (100 + bonusPercent) / 100))
    const extra = hpLoss(boosted) - hpLoss(damage)
    if (extra > 0) {
      const label = effect.attackerStance ? `${STANCE_META[effect.attackerStance].name}外功增伤` : '外功增伤'
      segments.push({ type: 'tag', text: `${effect.sourceName} · ${label} +${extra.toLocaleString()}`, tone: 'purple' })
    }
    damage = boosted
  }

  damage = applyTargetDamageBonuses(damage, target, targetHp, effects, segments, shieldCover, element, guardDamage ? hpLoss : undefined)
  const ordinaryHit = shieldBypass && shieldBefore > 0 ? guardDamage?.(damage, true, false) : undefined
  const defendedHit = guardDamage?.(damage, !!playerHit?.preview)
  const hit = defendedHit ??
    (shieldBypass ? { damage: Math.min(targetHp, damage), shieldEvent: {}, segments: [] }
      : resolveShieldDamage(target, damage, targetHp, multiplier))
  if (shieldBypass && shieldBefore > 0 && hit.damage > 0) {
    const absorbed = ordinaryHit ? ordinaryHit.shieldEvent.shieldAbsorbed ?? 0 : Math.min(damage, Math.ceil(shieldBefore / multiplier))
    const extra = Math.min(targetHp, hit.damage) - (ordinaryHit?.damage ?? damageToHp(damage, targetHp, absorbed))
    if (absorbed > 0) segments.push({ type: 'tag',
      text: `${shieldBypass.sourceName} · ${shieldBypass.label ?? '音律绕盾'} ${absorbed.toLocaleString()} · 增伤 +${Math.max(0, extra).toLocaleString()}`, tone: 'gold' })
  }
  return { uncappedDamage: hit.damage, ...hit, ignoredDefense: flatIgnored + percentIgnored, segments: [...segments, ...hit.segments],
    poisonRecovery: defendedHit?.poisonRecovery }
}

export function resolveTrueDamage(damage: number, target: EnemyBattleState, targetHp: number, effects: readonly ActiveEffect[], element?: DamageElement) {
  const segments: RichSegment[] = []
  const adjusted = applyTargetDamageBonuses(damage, target, targetHp, effects, segments, 0, element)
  const poison = element === 'POISON' ? target.playerGuard?.effects.find((entry) => entry.kind === 'POISON_MP_RECOVERY') : undefined
  const reduced = poison ? Math.round(adjusted * (100 - poison.resistancePercent) / 100) : adjusted
  const prevented = adjusted - reduced
  if (poison && prevented > 0) {
    segments.push({ type: 'tag', tone: 'jade', text: `${poison.sourceName} · 毒伤减免 ${prevented.toLocaleString()}` })
  }
  const actual = Math.min(targetHp, reduced)
  return { damage: actual, uncappedDamage: effects.length ? actual : reduced, shieldEvent: {}, ignoredDefense: 0, segments,
    poisonRecovery: poison && prevented > 0 ? { effect: poison, amount: Math.round(prevented * poison.recoverPercent / 100) } : undefined }
}

export function finishDesperateStrike(
  skill: SkillConfig | undefined, source: CombatUnitDTO, target: EnemyBattleState, hp: number,
  strike: { hp: number; attack: number; damage: number; round: number }, events: BattleEventDTO[],
) {
  const effect = skill?.battleEffects?.find((entry) => entry.kind === 'DESPERATE_EXECUTION')
  if (!skill || !effect || hp <= 0 || strike.damage <= 0 ||
    target.unit.isPlayer || target.playerGuard || target.shield > 0 || strike.hp * 100 >= source.maxHp * effect.belowHpPercent) return hp
  const amount = target.isBoss
    ? Math.min(Math.round(target.unit.maxHp * effect.bossMaxHpPercent / 100), Math.round(strike.attack * effect.bossAttackPercent / 100))
    : hp
  return applyBonusDamage({ sourceId: skill.id, sourceName: skill.name }, resolveTrueDamage(amount, target, hp, []), target, {
    actorSlot: source.slot, targetHp: hp, round: strike.round, label: '舍身绝杀', category: 'true',
  }, events)
}

export function applyBonusDamage(
  source: StatusSource, hit: ReturnType<typeof resolveAttackDamage>, target: EnemyBattleState,
  action: { actorSlot: CombatUnitDTO['slot']; targetHp: number; round: number; label: string; category: 'phys' | 'true' | 'reflect' | 'poison';
    critical?: true; onLoss?: (damage: number) => void },
  events: BattleEventDTO[],
) {
  const { actorSlot, targetHp, round, label, category } = action
  const guard = target.playerGuard
  const before = guard && hit.damage >= targetHp && canCounterLethal(target, guard.saves, targetHp, hit.damage, round)
    ? guard.beforeLethal?.(targetHp, round, actorSlot) ?? targetHp : targetHp
  const incoming = Math.min(before, hit.uncappedDamage)
  const saved = guard && resolveLethalSave(guard.saves, target, before, incoming, round)
  const actual = saved?.damage ?? incoming
  action.onLoss?.(actual)
  if (actual <= 0 && !saved && !hit.shieldEvent.shieldAbsorbed) {
    if (hit.poisonRecovery) guard?.recoverPoison?.(before, hit.poisonRecovery, round)
    return before
  }
  events.push({
    round, type: 'EFFECT', actorSlot, targetSlot: target.unit.slot, hpDelta: actual > 0 ? -actual : 0,
    effectSourceId: source.sourceId, hitResult: action.critical ? 'CRIT' : undefined, ...hit.shieldEvent,
    segments: [
      { type: 'tag', text: `${source.sourceName} · ${label}`, tone: 'gold' },
      { type: 'text', text: ' ' },
      { type: 'actor', name: target.unit.name, isAlly: target.unit.slot.startsWith('ALLY'), isPlayer: target.unit.isPlayer },
      { type: 'text', text: '受到 ' },
      { type: 'damage', value: actual, category, ...(action.critical ? { isCrit: true } : {}) },
      ...hit.segments,
    ],
  })
  let remaining = saved ? saved.savedHp : before - actual
  reactToEnemyDamage(target, actual, remaining, actorSlot, round, events)
  if (guard && before > 0 && incoming >= before) remaining = guard.onLethal?.(saved || undefined, round, remaining, actorSlot) ?? remaining
  if (guard) triggerLowHpEffects(target, before, remaining, effectsDuringAction(guard.effects, target, round), round, events)
  if (hit.poisonRecovery) guard?.recoverPoison?.(remaining, hit.poisonRecovery, round)
  if (guard && category === 'phys' && action.critical) {
    remaining = useCriticalHitPill(target, remaining, true, actual, guard.effects, round, events)
  }
  return remaining
}

export function reflectCriticalPoison(
  unit: CombatUnitDTO, attacker: EnemyBattleState, hp: number, attack: number, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[],
) {
  const effect = effects.find((candidate) => candidate.kind === 'REFLECT_CRIT_POISON')
  if (!effect || hp <= 0) return hp
  const amount = Math.round(attack * effect.percent / 100)
  return applyBonusDamage(effect, resolveTrueDamage(amount, attacker, hp, effects, 'POISON'), attacker, {
    actorSlot: unit.slot, targetHp: hp, round, label: '朱砂血毒反弹', category: 'poison',
  }, events)
}

export function resolveHitReflection(
  unit: CombatUnitDTO, attacker: EnemyBattleState, hp: number, hpLost: number, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[],
) {
  if (hpLost <= 0) return hp
  for (const effect of effects) {
    if (effect.kind !== 'HIT_REFLECTION' || hp <= 0) continue
    const amount = Math.round(hpLost * effect.percent / 100)
    hp = applyBonusDamage(effect, resolveTrueDamage(amount, attacker, hp, effects), attacker, {
      actorSlot: unit.slot, targetHp: hp, round, label: '受击反伤', category: 'reflect',
    }, events)
  }
  return hp
}

export function resolvePoisonBurst(
  unit: CombatUnitDTO, target: EnemyBattleState, hp: number, effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[], critical = false,
) {
  if (hp <= 0) return hp
  const burst = (critical ? effects.find((effect) => effect.kind === 'CRIT_POISON_BURST') : undefined) ??
    effects.find((effect) => effect.kind === 'POISON_BURST')
  if (!burst || poisonStacks(target) < (burst.kind === 'POISON_BURST' ? burst.stacks : 1)) return hp
  let remainingPoisonDamage = 0
  for (const kind of periodicStatuses) {
    const poison = target.ongoingDamage?.[kind]
    if (PERIODIC_DAMAGE[kind].category !== 'poison' || !poison) continue
    remainingPoisonDamage += poison.damage * poison.remainingRounds
    delete target.ongoingDamage![kind]
    events.push({
      round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: target.unit.slot, effectSourceId: burst.sourceId,
      statusRemoved: PERIODIC_DAMAGE[kind].name, statusRounds: 0, statusStacks: 0,
      segments: [{ type: 'tag', text: `${burst.sourceName} · 引爆${PERIODIC_DAMAGE[kind].name}`, tone: 'red' }],
    })
  }
  const amount = burst.kind === 'POISON_BURST' ? Math.round((target.unit.maxHp - hp) * burst.lostHpPercent / 100) : remainingPoisonDamage
  return applyBonusDamage(burst, resolveTrueDamage(amount, target, hp, []), target, {
    actorSlot: unit.slot, targetHp: hp, round, label: burst.kind === 'POISON_BURST' ? '万蛇噬骨' : '万毒噬体', category: 'true',
  }, events)
}

export function resolveReceivePeriodic(
  defender: StatusTarget, hp: number, effects: readonly ActiveEffect[],
  contact: { attacker: EnemyBattleState; attackerHp: number; defenderAttack: number; round: number; rng: () => number },
  events: BattleEventDTO[],
) {
  const { attacker, attackerHp, round, rng } = contact
  if (hp <= 0 || attackerHp <= 0) return attackerHp
  const effect = effects.find((entry) => entry.kind === 'PERIODIC_ON_RECEIVE')
  if (!effect) return attackerHp
  const attack = Math.round(contact.defenderAttack * (100 - statusPercent(defender, 'ATTACK_DOWN', round)) / 100)
  const protection = attacker.playerGuard && effectsDuringAction(attacker.playerGuard.effects, attacker, round)
  applyPeriodicOnHit({ ...effect, slot: defender.unit.slot }, attacker, attackerHp, effect.rule, { round, attack, rng, effects, protection }, events)
  return resolvePoisonBurst(defender.unit, attacker, attackerHp, effects, round, events)
}

export function transferLethalStatuses<T extends EnemyBattleState>(
  fighter: StatusTarget, effects: readonly ActiveEffect[], enemies: Iterable<T>, hpOf: (enemy: T) => number, round: number, events: BattleEventDTO[],
) {
  const transfer = effects.find((effect) => effect.kind === 'TRANSFER_ON_LETHAL')
  if (!transfer) return
  const targets = [...enemies].filter((enemy) => hpOf(enemy) > 0)
  if (!targets.length) return
  const report = (target: StatusTarget, name: string, rounds: number, stacks?: number) => {
    events.push({
      round, type: 'EFFECT', actorSlot: fighter.unit.slot, targetSlot: target.unit.slot, effectSourceId: transfer.sourceId,
      statusRemoved: rounds === 0 ? name : undefined, statusApplied: rounds > 0 ? name : undefined,
      statusRounds: rounds, statusStacks: stacks,
      segments: [{ type: 'tag', text: `${transfer.sourceName} · ${rounds > 0 ? '转移' : '移除'}${name}`, tone: 'red' }],
    })
  }
  for (const status of Object.values(fighter.statuses ?? {})) {
    if (status.lastRound < round || beneficialStatus(status.rule.status)) continue
    const kind = status.rule.status
    delete fighter.statuses?.[kind]
    report(fighter, statusLabels[kind], 0)
    const rounds = status.lastRound - Math.max(round, status.firstRound) + 1
    for (const target of targets) {
      if (isControl(kind) && target.combat?.controlImmunity?.includes(kind)) continue
      const previous = target.statuses?.[kind]
      const potency = 'percent' in status.rule ? status.rule.percent : 0
      const priorPotency = previous && 'percent' in previous.rule ? previous.rule.percent : 0
      if (previous && previous.lastRound >= round &&
        (priorPotency > potency || (priorPotency === potency && previous.lastRound >= status.lastRound))) continue
      const statuses = target.statuses ??= {}
      statuses[kind] = { ...status, sourceId: transfer.sourceId }
      report(target, statusLabels[kind], rounds, status.stacks)
    }
  }
  for (const kind of periodicStatuses) {
    const periodic = fighter.ongoingDamage?.[kind]
    if (!periodic) continue
    delete fighter.ongoingDamage?.[kind]
    const { name } = PERIODIC_DAMAGE[kind]
    report(fighter, name, 0)
    for (const target of targets) {
      const previous = target.ongoingDamage?.[kind]
      if (previous && (previous.damage > periodic.damage || (previous.damage === periodic.damage && previous.remainingRounds >= periodic.remainingRounds))) continue
      const ongoing = target.ongoingDamage ??= {}
      ongoing[kind] = { ...periodic, sourceSlot: fighter.unit.slot, sourceId: transfer.sourceId, sourceUnitId: fighter.unit.id, sourceEffects: undefined }
      report(target, name, periodic.remainingRounds, periodic.stacks)
    }
  }
}

export function resolveCastArea<T extends EnemyBattleState>(
  unit: CombatUnitDTO, cast: { isUlt: boolean; attack: number; level: number; stance?: StanceType; combat?: EnemyCombatConfig },
  effects: readonly ActiveEffect[], enemies: Iterable<T>, hpOf: (enemy: T) => number,
  round: number, rng: () => number, events: BattleEventDTO[],
) {
  const effect = cast.isUlt ? effects.find((candidate) => candidate.kind === 'ULT_AREA_TRUE_DAMAGE')
    : effects.find((candidate) => candidate.kind === 'OUTER_AREA_DAMAGE')
  if (!effect) return []
  if (effect.kind === 'OUTER_AREA_DAMAGE' && rng() >= effect.chancePercent / 100) return []
  const hits: { target: T; hp: number }[] = []
  const ultimate = effect.kind === 'ULT_AREA_TRUE_DAMAGE'
  const conversion = ultimate ? undefined : teamTrueStrike(effects)
  const amount = ultimate ? Math.round(unit.maxMp * effect.maxMpPercent / 100) : Math.round(cast.attack * effect.attackPercent / 100)
  const damageEffects = ultimate ? effects : effects.filter((entry) => entry.kind === 'TARGET_STANCE_DAMAGE' ||
    entry.kind === 'POISON_BLEED_DAMAGE' || entry.kind === 'TARGET_TRAIT_DAMAGE' || entry.kind === 'ELEMENT_DAMAGE')
  for (const target of enemies) {
    const targetHp = hpOf(target)
    if (targetHp <= 0) continue
    const hit = ultimate || conversion ? resolveTrueDamage(amount, target, targetHp, damageEffects, ultimate ? undefined : effect.element)
      : resolveAttackDamage(amount, target, targetHp, cast.level, undefined, damageEffects, undefined, 0, round, effect.element,
        cast.stance ? { stance: cast.stance, combat: cast.combat, critical: false, outer: true, rng, events } : undefined)
    const hp = applyBonusDamage(conversion ?? effect, hit, target, {
      actorSlot: unit.slot, targetHp, round, label: ultimate ? '音律海啸' : conversion ? `${conversion.moveName} · ${effect.moveName}` : effect.moveName,
      category: ultimate || conversion ? 'true' : 'phys',
    }, events)
    if (ultimate) applyBattleStatus(effect, effect.rule, unit.slot, target, { hp, effects: target.playerGuard?.effects }, round, rng, events)
    hits.push({ target, hp })
  }
  return hits
}

type StrikeSplash = { source: StatusSource; damage: number; trueStrike?: TrueStrike }

export function resolveStrikeSplash<T extends EnemyBattleState>(
  unit: CombatUnitDTO, splash: StrikeSplash | undefined, primary: T, enemies: Iterable<T>, hpOf: (enemy: T) => number,
  level: number, round: number, effects: readonly ActiveEffect[], events: BattleEventDTO[],
  playerHit?: { stance: StanceType; combat?: EnemyCombatConfig; rng: () => number },
) {
  if (!splash || splash.damage <= 0) return []
  const hits: { target: T; hp: number }[] = []
  const bonuses = effects.filter((effect) =>
    effect.kind === 'TARGET_STANCE_DAMAGE' || effect.kind === 'POISON_BLEED_DAMAGE' || effect.kind === 'TARGET_TRAIT_DAMAGE',
  )
  for (const target of enemies) {
    const targetHp = hpOf(target)
    if (target === primary || targetHp <= 0) continue
    const hit = splash.trueStrike ? resolveTrueDamage(splash.damage, target, targetHp, bonuses)
      : resolveAttackDamage(splash.damage, target, targetHp, level, undefined, bonuses, undefined, 0, round, undefined,
      playerHit && { ...playerHit, critical: false, outer: true, events })
    const hp = applyBonusDamage(splash.trueStrike ?? splash.source, hit, target, { actorSlot: unit.slot, targetHp, round,
      label: splash.trueStrike ? `${splash.trueStrike.moveName} · 重剑余波` : '重剑余波', category: splash.trueStrike ? 'true' : 'phys' }, events)
    hits.push({ target, hp })
  }
  return hits
}

export function resolveActionEndDarts<T extends EnemyBattleState>(
  unit: CombatUnitDTO, effects: readonly ActiveEffect[], action: {
    target: () => T | undefined; hpOf: (enemy: T) => number; setHp: (enemy: T, hp: number) => void;
    attack: number; level: number; round: number; rng: () => number; stance?: StanceType;
  }, events: BattleEventDTO[],
) {
  const effect = effects.find((entry) => entry.kind === 'ACTION_END_DARTS')
  if (!effect) return
  const { attack, level, round, rng } = action
  const damage = Math.round(hiddenWeaponDamage(attack, effects) * effect.attackPercent / 100)
  const bonuses = effects.filter((entry) =>
    entry.kind === 'TARGET_STANCE_DAMAGE' || entry.kind === 'POISON_BLEED_DAMAGE' || entry.kind === 'TARGET_TRAIT_DAMAGE',
  )
  for (let dart = 0; dart < effect.count; dart++) {
    const target = action.target()
    if (!target) break
    const targetHp = action.hpOf(target)
    const hit = resolveAttackDamage(damage, target, targetHp, level, undefined, bonuses, undefined, 0, round, undefined,
      target.playerGuard ? { stance: action.stance ?? 'FIERCE', critical: false, rng, events } : undefined)
    const hp = applyBonusDamage(effect, hit, target, { actorSlot: unit.slot, targetHp, round, label: '扇底藏针', category: 'phys' }, events)
    const protection = target.playerGuard && effectsDuringAction(target.playerGuard.effects, target, round)
    applyPeriodicOnHit({ ...effect, slot: unit.slot }, target, hp, effect.rule,
      { round, attack: hiddenWeaponDamage(attack, effects), rng, effects, protection }, events)
    action.setHp(target, resolvePoisonBurst(unit, target, hp, effects, round, events))
  }
}

export function resolveParryEffects(
  defender: StatusTarget & { hp: number; def: number; hpLost: number; effects: readonly ActiveEffect[] },
  attacker: EnemyBattleState, attackerHp: number, round: number, events: BattleEventDTO[],
) {
  const { unit, def, hpLost, effects } = defender
  let { hp } = defender
  for (const effect of effects) {
    if (effect.kind === 'PARRY_HEAL' && hp > 0) {
      hp = restoreHp(defender, hp, Math.round(def * effect.defensePercent / 100), effect, round, events)
    } else if (effect.kind === 'PARRY_REFLECT' && attackerHp > 0 && hpLost > 0) {
      const hit = resolveTrueDamage(Math.round(hpLost * effect.percent / 100), attacker, attackerHp, effects)
      attackerHp = applyBonusDamage(effect, hit, attacker, {
        actorSlot: unit.slot, targetHp: attackerHp, round, label: '招架反震', category: 'reflect',
      }, events)
    }
  }
  return { hp, attackerHp }
}

export function resolveActionStartDamage<T extends EnemyBattleState>(
  unit: CombatUnitDTO, effects: readonly ActiveEffect[], enemies: Iterable<T>, hpOf: (target: T) => number,
  round: number, rng: () => number, events: BattleEventDTO[],
) {
  const dart = effects.find((effect) => effect.kind === 'ACTION_START_TRUE_DAMAGE')
  if (!dart) return
  const living = Array.from(enemies).filter((target) => hpOf(target) > 0)
  if (!living.length) return
  const target = living.length === 1 ? living[0] : living[Math.floor(rng() * living.length)]
  const targetHp = hpOf(target)
  const hit = resolveTrueDamage(Math.round(hiddenWeaponDamage(dart.amount, effects)), target, targetHp, effects)
  const hp = applyBonusDamage(dart, hit, target, {
    actorSlot: unit.slot, targetHp, round, label: '行动开始', category: 'true',
  }, events)
  return { target, hp }
}

export function dodgeRageGain(rage: number, effects: readonly ActiveEffect[], baseGain = 0) {
  const gain = effects.find((effect) => effect.kind === 'DODGE_RAGE')?.amount ?? baseGain
  return gainRage(rage, gain, effects)
}

export function resolveDodgeEffects(
  defender: StatusTarget & {
    hp: number; level: number; atk: number; agi: number;
    effects: readonly ActiveEffect[]; state: DodgeEffectState;
  },
  attacker: EnemyBattleState, attackerHp: number, round: number, rng: () => number, events: BattleEventDTO[], recordRewards = true,
) {
  const { unit, effects, state } = defender
  for (const effect of effects) {
    if (effect.kind === 'DODGE_STATUS' && attackerHp > 0) {
      const protection = attacker.playerGuard && effectsDuringAction(attacker.playerGuard.effects, attacker, round)
      applyBattleStatus(effect, effect.rule, unit.slot, attacker, { hp: attackerHp, effects: protection }, round, rng, events)
    }
    if (effect.kind === 'DODGE_SILVER' && recordRewards) events.push({
      round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: attacker.unit.slot, effectSourceId: effect.sourceId, silverDrop: effect.amount,
      segments: [
        { type: 'tag', text: `${effect.sourceName} · 水上漂名不虚传`, tone: 'gold' },
        { type: 'text', text: ` ${unit.name}擦肩戏敌：「这也打得中？」${attacker.unit.name}扑空，掉落 ${effect.amount} 两纹银。` },
      ],
    })
    if (effect.kind === 'DODGE_GUARANTEED_CRIT' && !state.pendingCrit) {
      state.pendingCrit = effect
      events.push({
        round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: unit.slot, effectSourceId: effect.sourceId,
        segments: [
          { type: 'tag', text: `${effect.sourceName} · 闪避触发`, tone: 'gold' },
          { type: 'text', text: ' 下一次可暴击出手必暴。' },
        ],
      })
    }
    if (effect.kind !== 'DODGE_COUNTER' || attackerHp <= 0 || (effect.oncePerRound && state.lastCounterRound === round)) continue
    if (effect.chancePercent !== undefined) {
      const guaranteed = effects.some((entry) => entry.kind === 'DODGE_COUNTER' && entry.chancePercent === undefined &&
        entry.stat === effect.stat && entry.category === effect.category && entry.oncePerRound === effect.oncePerRound)
      if (guaranteed || rng() >= effect.chancePercent / 100) continue
    }
    if (effect.oncePerRound) state.lastCounterRound = round

    const baseDamage = Math.round(defender[effect.stat] * effect.percent / 100)
    const hit = effect.category === 'true'
      ? resolveTrueDamage(baseDamage, attacker, attackerHp, effects)
      : resolveAttackDamage(baseDamage, attacker, attackerHp, defender.level, undefined, effects.filter((entry) => entry.kind !== 'OUTER_DAMAGE'), undefined, 0, round)
    if (attacker.playerGuard) {
      attackerHp = applyBonusDamage(effect, hit, attacker, {
        actorSlot: unit.slot, targetHp: attackerHp, round, label: '闪避反击', category: effect.category,
      }, events)
      continue
    }
    const damage = Math.min(attackerHp, hit.damage)
    attackerHp -= damage
    events.push({
      round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: attacker.unit.slot,
      effectSourceId: effect.sourceId, hpDelta: damage > 0 ? -damage : 0, ...hit.shieldEvent,
      segments: [
        { type: 'tag', text: `${effect.sourceName} · 闪避反击`, tone: 'purple' },
        { type: 'text', text: ' ' },
        { type: 'actor', name: attacker.unit.name, isAlly: false },
        { type: 'text', text: '受到反击伤害 ' },
        { type: 'damage', value: damage, category: effect.category },
        ...hit.segments,
      ],
    })
    reactToEnemyDamage(attacker, damage, attackerHp, unit.slot, round, events)
  }
  const defenderHp = resolveHealing(defender, defender.hp, effects, { trigger: 'DODGE', round }, events)
  return { attackerHp, defenderHp }
}

export function battleEffectLoot(report: BattleReportDTO, slot: CombatUnitDTO['slot'] = 'ALLY_MAIN') {
  const loot = { silver: 0, qiExp: 0 }
  for (const event of report.events) {
    if (event.actorSlot !== slot) continue
    loot.silver += event.silverDrop ?? 0
    loot.qiExp += event.qiDrop ?? 0
  }
  return loot
}

export function appendGaibangLootBonus(player: PlayerDTO, slot: CombatUnitDTO['slot'], events: BattleEventDTO[]) {
  const branch = gaibangPerks(player)
  if (!branch?.silverPercent) return
  const earned = events.reduce((total, event) => total + (event.actorSlot === slot ? event.silverDrop ?? 0 : 0), 0)
  const silverDrop = gaibangSilverGain(player, earned) - earned
  if (silverDrop > 0) events.push({
    round: events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: slot, effectSourceId: 'gaibang_branch', silverDrop,
    segments: [{ type: 'tag', text: `${branch.name} · 战斗所得纹银 +${silverDrop.toLocaleString()}`, tone: 'gold' }],
  })
}

export function creditBattleEffectLoot(player: PlayerDTO, report: BattleReportDTO, slot?: CombatUnitDTO['slot']) {
  const loot = battleEffectLoot(report, slot)
  player.silver += loot.silver
  player.qiExp += loot.qiExp
  return loot.silver > 0 || loot.qiExp > 0
}

export function spendBattleMedicines(player: PlayerDTO, report: BattleReportDTO, slot: CombatUnitDTO['slot'] = 'ALLY_MAIN') {
  const stock = player.battleMedicines
  if (!stock) return false
  let spent = false
  for (const event of report.events) {
    const id = event.medicineUsed
    if (event.actorSlot !== slot || !id || !(stock[id] > 0)) continue
    stock[id]--
    spent = true
  }
  return spent
}

export function meleeRetaliationFor(effects: readonly ActiveEffect[]): MeleeRetaliation | undefined {
  return effects.find((effect) => effect.kind === 'MELEE_RETALIATION' && 'poisonRounds' in effect)
    ?? effects.find((effect) => effect.kind === 'MELEE_RETALIATION')
}

export function resolveMeleeRetaliation(
  effect: MeleeRetaliation,
  enemy: EnemyBattleState,
  hit: { attackerHp: number; attackerAtk: number; hpLost: number; defenderSlot: CombatUnitDTO['slot']; defenderAtk: number; round: number; rng?: () => number },
  effects: readonly ActiveEffect[], events: BattleEventDTO[],
) {
  const bonusSegments: RichSegment[] = []
  const base = 'fromHpLoss' in effect ? hit.hpLost : hit.attackerAtk
  const baseDamage = Math.round(base * effect.reflectPercent / 100)
  if (enemy.playerGuard) {
    const remaining = applyBonusDamage(effect, resolveTrueDamage(baseDamage, enemy, hit.attackerHp, effects), enemy, {
      actorSlot: hit.defenderSlot, targetHp: hit.attackerHp, round: hit.round,
      label: 'poisonRounds' in effect ? '倒刺反伤' : '受击反伤', category: 'reflect',
    }, events)
    if ('poisonRounds' in effect) {
      applyPeriodicOnHit({ ...effect, slot: hit.defenderSlot }, enemy, remaining,
        { status: 'poison', rounds: effect.poisonRounds, attackPercent: effect.poisonAttackPercent },
        { round: hit.round, attack: hit.defenderAtk, rng: hit.rng ?? Math.random, effects, protection: effectsDuringAction(enemy.playerGuard.effects, enemy, hit.round) }, events)
    }
    return remaining
  }
  const reflected = Math.min(hit.attackerHp, applyTargetDamageBonuses(baseDamage, enemy, hit.attackerHp, effects, bonusSegments))
  const remainingHp = hit.attackerHp - reflected
  const poison = remainingHp > 0 && 'poisonRounds' in effect ? effect : undefined
  if (reflected <= 0 && !poison) return remainingHp
  const segments: RichSegment[] = [
    { type: 'tag', text: effect.sourceName, tone: 'purple' },
    { type: 'text', text: ' ' },
    { type: 'actor', name: enemy.unit.name, isAlly: false },
  ]
  if (reflected > 0) {
    const text = 'poisonRounds' in effect ? '受到倒刺反伤 ' : '受到反伤 '
    segments.push({ type: 'text', text }, { type: 'damage', value: reflected, category: 'reflect' }, ...bonusSegments)
  }
  if (poison) {
    const ongoing = enemy.ongoingDamage ??= {}
    ongoing.poison = {
      sourceId: effect.sourceId,
      sourceSlot: hit.defenderSlot,
      sourceEffects: effects,
      damage: Math.max(1, Math.round(hit.defenderAtk * poison.poisonAttackPercent / 100)),
      remainingRounds: poison.poisonRounds,
    }
    segments.push({ type: 'tag', text: `${RUANWEI_POISON} · ${poison.poisonRounds} 回合`, tone: 'red' })
  }
  events.push({
    round: hit.round, type: 'EFFECT', actorSlot: hit.defenderSlot, targetSlot: enemy.unit.slot,
    effectSourceId: effect.sourceId,
    hpDelta: reflected > 0 ? -reflected : undefined,
    statusApplied: poison ? RUANWEI_POISON : undefined,
    statusRounds: poison?.poisonRounds,
    segments,
  })
  reactToEnemyDamage(enemy, reflected, remainingHp, hit.defenderSlot, hit.round, events)
  return remainingHp
}

export function applyBleedOnHit(
  skill: SkillConfig | undefined, enemy: EnemyBattleState,
  hit: { actorSlot: CombatUnitDTO['slot']; attackerAtk: number; targetHp: number; round: number },
  effects: readonly ActiveEffect[], events: BattleEventDTO[],
) {
  const rend = skill?.battleEffects?.find((effect) => effect.kind === 'SHIELD_REND')
  if (!skill || !rend || hit.targetHp <= 0) return

  const extension = skill.slot === 'OUTER' ? effects.find((effect) => effect.kind === 'OUTER_BLEED_DURATION') : undefined
  const rounds = rend.bleedRounds + (extension?.extraRounds ?? 0)
  const ongoing = enemy.ongoingDamage ??= {}
  ongoing.bleed = {
    sourceId: skill.id,
    sourceSlot: hit.actorSlot,
    sourceEffects: effects,
    damage: Math.max(1, Math.round(hit.attackerAtk * rend.bleedAttackPercent / 100)),
    remainingRounds: rounds,
  }
  const segments: RichSegment[] = [
    { type: 'tag', text: `${skill.name} · ${BLEEDING}`, tone: 'red' },
    { type: 'text', text: ` ${enemy.unit.name}流血 ${rounds} 回合。` },
  ]
  if (extension) {
    segments.push({ type: 'tag', text: `${extension.sourceName} · 流血 +${extension.extraRounds} 回合`, tone: 'jade' })
  }
  events.push({
    round: hit.round, type: 'EFFECT', actorSlot: hit.actorSlot, targetSlot: enemy.unit.slot,
    effectSourceId: skill.id, statusApplied: BLEEDING, statusRounds: rounds, segments,
  })
}

type PeriodicProtection = {
  effects: readonly ActiveEffect[]
  saves?: LethalSave[]
  beforeLethal?: (sourceSlot: CombatUnitDTO['slot'], hp: number, sourceUnitId?: string) => number | undefined
  onLethal: (sourceSlot: CombatUnitDTO['slot'], saved: ReturnType<typeof resolveLethalSave>, remainingHp: number, sourceUnitId?: string) => number | void
  recoverPoison?: (hp: number, recovery: PoisonRecovery) => void
  reflectPoison?: (effect: Extract<ActiveEffect, { kind: 'LETHAL_POISON_REFLECT' }>, sourceSlot: CombatUnitDTO['slot'], sourceUnitId?: string) => void
}

export function reflectLethalPoison(
  defender: StatusTarget, effect: Extract<ActiveEffect, { kind: 'LETHAL_POISON_REFLECT' }>,
  attacker: EnemyBattleState, hp: number, round: number, events: BattleEventDTO[],
) {
  if (hp <= 0 || defender === attacker) return hp
  defender.lethalPoisonReflectUsed = true
  const hit = resolveTrueDamage(Math.round(attacker.unit.maxHp * effect.percent / 100), attacker, hp, [])
  return applyBonusDamage(effect, hit, attacker, { actorSlot: defender.unit.slot, targetHp: hp, round, label: '致死毒伤反震', category: 'reflect' }, events)
}

export function resolveDamageOverTime(
  target: EnemyBattleState | (StatusTarget & ShieldedUnit), hp: number, round: number, events: BattleEventDTO[], protection?: PeriodicProtection,
) {
  if (!target.ongoingDamage) return hp
  for (const kind of periodicStatuses) {
    hp = tickDamage(target, kind, hp, round, events, protection)
    if (hp <= 0 || target.retreated) break
  }
  return hp
}

function tickDamage(
  target: EnemyBattleState | (StatusTarget & ShieldedUnit), kind: PeriodicKind, hp: number, round: number,
  events: BattleEventDTO[], protection?: PeriodicProtection,
) {
  const ongoing = target.ongoingDamage
  if (!ongoing || hp <= 0) return hp
  const effect = ongoing[kind]
  if (!effect) return hp

  const status = PERIODIC_DAMAGE[kind]
  const { name, label, category, expires } = status
  const element = 'element' in status ? status.element : category === 'poison' ? 'POISON' : undefined
  const sourceEffects = effect.sourceEffects ?? []
  const bonusSegments: RichSegment[] = []
  let amount = effect.damage
  for (const boost of sourceEffects) {
    if (boost.kind !== 'PERIODIC_TICK_DAMAGE' || boost.category !== category) continue
    const increased = Math.round(amount * (100 + boost.percent) / 100)
    const extra = Math.min(hp, increased) - Math.min(hp, amount)
    if (extra > 0) bonusSegments.push({ type: 'tag', text: `${boost.sourceName} · ${label} +${extra.toLocaleString()}`, tone: 'purple' })
    amount = increased
  }
  amount = applyTargetDamageBonuses(amount, target, hp, sourceEffects, bonusSegments, 0, element)
  const resistance = (protection?.effects ?? []).reduce((total, effect) =>
    resistsElement(effect, element) || (effect.kind === 'PERIODIC_REDUCTION' && ('category' in effect ? effect.category === category : effect.status === kind))
      ? total + effect.percent : total, 0)
  const poison = category === 'poison' ? protection?.effects.find((effect) => effect.kind === 'POISON_MP_RECOVERY') : undefined
  const afterOtherResistance = Math.round(amount * (100 - Math.min(100, resistance)) / 100)
  const afterResistance = poison
    ? Math.round(amount * (100 - Math.min(100, resistance + poison.resistancePercent)) / 100) : afterOtherResistance
  let incoming = afterResistance
  for (const effect of protection?.effects ?? []) {
    if (effect.kind !== 'PHYSICAL_DAMAGE_REDUCTION' || !effect.alsoPeriodic) continue
    const reduced = Math.round(incoming * (100 - effect.percent) / 100)
    const prevented = incoming - reduced
    if (prevented > 0) bonusSegments.push({ type: 'tag', text: `${effect.sourceName} · 持续伤害减免 ${prevented.toLocaleString()}`, tone: 'jade' })
    incoming = reduced
  }
  if (canCounterLethal(target, protection?.saves, hp, incoming, round)) hp = protection?.beforeLethal?.(effect.sourceSlot, hp, effect.sourceUnitId) ?? hp
  const actual = Math.min(hp, incoming)
  const prevented = Math.min(hp, amount) - Math.min(hp, afterResistance)
  if (prevented > 0) bonusSegments.push({ type: 'tag', text: `${label}减免 ${prevented.toLocaleString()}`, tone: 'jade' })
  const lethal = actual >= hp
  const saved = resolveLethalSave(protection?.saves, target, hp, actual, round)
  const damage = saved?.damage ?? actual
  let remainingHp = saved?.savedHp ?? hp - damage
  const transferring = lethal && protection?.effects.some((effect) => effect.kind === 'TRANSFER_ON_LETHAL')
  const remainingRounds = remainingHp > 0 || transferring ? effect.remainingRounds - 1 : 0
  if (remainingRounds > 0) effect.remainingRounds = remainingRounds
  else delete ongoing[kind]

  events.push({
    round, type: 'DOT_TICK', actorSlot: effect.sourceSlot, targetSlot: target.unit.slot,
    effectSourceId: effect.sourceId,
    hpDelta: damage > 0 ? -damage : 0,
    statusRemoved: remainingRounds === 0 ? name : undefined,
    statusRounds: remainingRounds,
    statusStacks: effect.stacks === undefined ? undefined : remainingRounds > 0 ? effect.stacks : 0,
    segments: [
      { type: 'tag', text: name, tone: 'red' },
      { type: 'text', text: ' ' },
      { type: 'actor', name: target.unit.name, isAlly: target.unit.slot.startsWith('ALLY'), isPlayer: target.unit.isPlayer },
      { type: 'text', text: `受到${label} ` },
      { type: 'damage', value: damage, category },
      { type: 'text', text: remainingRounds > 0 ? `，剩余 ${remainingRounds} 回合。` : expires },
      ...bonusSegments,
    ],
  })
  if ('atk' in target) reactToEnemyDamage(target, damage, remainingHp, effect.sourceSlot, round, events)
  if (lethal) remainingHp = protection?.onLethal(effect.sourceSlot, saved, remainingHp, effect.sourceUnitId) ?? remainingHp
  if (target.retreated) return remainingHp
  if (lethal && category === 'poison' && !target.lethalPoisonReflectUsed) {
    const reflect = protection?.effects.find((active) => active.kind === 'LETHAL_POISON_REFLECT')
    if (reflect) protection?.reflectPoison?.(reflect, effect.sourceSlot, effect.sourceUnitId)
  }
  if (remainingHp <= 0) delete ongoing[kind]
  if (protection) triggerLowHpEffects(target, hp, remainingHp, protection.effects, round, events)
  if (poison && remainingHp > 0 && afterOtherResistance > afterResistance) {
    protection?.recoverPoison?.(remainingHp, {
      effect: poison, amount: Math.round((afterOtherResistance - afterResistance) * poison.recoverPercent / 100),
    })
  }
  return remainingHp
}

export function resolveDualStatusBurst(
  effect: DualStatusBurst, enemy: EnemyBattleState, hp: number,
  cast: { attack: number; bihaiSlot: CombatUnitDTO['slot']; lingsheSlot: CombatUnitDTO['slot']; round: number; boss: boolean },
  events: BattleEventDTO[],
) {
  if (hp <= 0) return hp
  const ongoing = enemy.ongoingDamage ??= {}
  const statuses = [['bihai', cast.bihaiSlot], ['lingshe', cast.lingsheSlot]] as const
  for (const [kind, actorSlot] of statuses) {
    const stacks = Math.min(effect.stacks, (ongoing[kind]?.stacks ?? 0) + 1)
    const { name } = PERIODIC_DAMAGE[kind]
    ongoing[kind] = {
      sourceId: effect.sourceId, sourceSlot: actorSlot, stacks,
      damage: Math.max(1, Math.round(cast.attack * effect.tickAtkPercent * stacks / 100)),
      remainingRounds: effect.rounds,
    }
    events.push({
      round: cast.round, type: 'EFFECT', actorSlot, targetSlot: enemy.unit.slot, effectSourceId: effect.sourceId,
      statusApplied: name, statusStacks: stacks, statusRounds: effect.rounds,
      segments: [
        { type: 'tag', text: effect.sourceName, tone: 'purple' },
        { type: 'text', text: ` ${enemy.unit.name}的${name}叠至 ${stacks} 层，持续 ${effect.rounds} 回合。` },
      ],
    })
  }
  if (statuses.some(([kind]) => ongoing[kind]?.stacks !== effect.stacks)) return hp

  for (const [kind, actorSlot] of statuses) {
    delete ongoing[kind]
    const { name } = PERIODIC_DAMAGE[kind]
    events.push({
      round: cast.round, type: 'EFFECT', actorSlot, targetSlot: enemy.unit.slot, effectSourceId: effect.sourceId,
      statusRemoved: name, statusStacks: 0, statusRounds: 0,
      segments: [{ type: 'tag', text: `${name}消耗 ${effect.stacks} 层`, tone: 'purple' }],
    })
  }
  const burst = Math.round(enemy.unit.maxHp * effect.burstHpPercent / 100)
  const amount = cast.boss ? Math.min(burst, Math.round(cast.attack * effect.bossAtkMultiplier)) : burst
  return applyBonusDamage(effect, resolveTrueDamage(amount, enemy, hp, []), enemy, {
    actorSlot: cast.bihaiSlot, targetHp: hp, round: cast.round, label: '引爆', category: 'true',
  }, events)
}

export function interruptibleEnemyCharge(enemy: EnemyBattleState, skill: SkillConfig | undefined, enraged: boolean) {
  const charge = enemy.combat?.charge
  if (!charge || enraged || enemy.chargeState !== 'CHARGING' || !skill) return
  if (skill.battleEffects?.some((effect) => effect.kind === 'INTERRUPT_CHARGE') || charge.interruptSkillIds?.includes(skill.id)) return charge
}

export function interruptEnemyCharge(
  skill: SkillConfig | undefined,
  enemy: EnemyBattleState,
  hit: { actorSlot: CombatUnitDTO['slot']; targetHp: number; round: number; enraged: boolean },
  events: BattleEventDTO[],
) {
  if (!skill || hit.targetHp <= 0) return
  if ((enemy.chargedUlt && skill.battleEffects?.some((effect) => effect.kind === 'INTERRUPT_CHARGE')) ||
    interruptibleEnemyCharge(enemy, skill, hit.enraged)) {
    breakCharge(enemy, { sourceId: skill.id, sourceName: `《${skill.name}》`, slot: hit.actorSlot }, hit.round, events)
  }
}

export function breakCharge(enemy: EnemyBattleState, source: StatusSource & { slot: CombatUnitDTO['slot'] }, round: number, events: BattleEventDTO[]) {
  const charge = enemy.chargedUlt?.moveName ?? (enemy.chargeState === 'CHARGING' ? enemy.combat?.charge?.name : undefined)
  if (!charge) return
  if (enemy.chargedUlt) delete enemy.chargedUlt
  else enemy.chargeState = 'INTERRUPTED'
  events.push({
    round, type: 'EFFECT', actorSlot: source.slot, targetSlot: enemy.unit.slot,
    effectSourceId: source.sourceId, statusRemoved: CHARGING,
    segments: [
      { type: 'tag', text: '打断蓄力', tone: 'jade' },
      { type: 'text', text: ` ${source.sourceName}打断了${enemy.unit.name}的【${charge}】。` },
    ],
  })
}

/** 敌方回合开始蓄力，下一次行动释放或消耗被打断的行动。 */
export function resolveEnemyAction(
  enemy: EnemyBattleState, round: number, enraged: boolean, events: BattleEventDTO[], forceAction = false,
): number | null {
  const charge = enemy.combat?.charge
  const ready = startControlledAction(enemy, round, events, { ignoreControl: forceAction })
  const cannotCharge = !enraged && (hasStatus(enemy, 'SEAL', round) || hasStatus(enemy, 'ULT_LOCK', round) ||
    (charge?.requiresWeapon && hasStatus(enemy, 'DISARM', round)))
  if (!ready || cannotCharge) {
    const pending = enemy.chargeState
    delete enemy.chargeState
    if (pending === 'CHARGING' || (ready && !pending && charge?.round === round)) {
      events.push({
        round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot,
        statusRemoved: pending === 'CHARGING' ? CHARGING : undefined,
        segments: [{ type: 'tag', text: `${enemy.unit.name} · 受制无法施展${charge?.name ?? '蓄力招式'}`, tone: 'jade' }],
      })
    }
    return ready && pending !== 'INTERRUPTED' ? 1 : null
  }
  if (!charge) return 1

  if (enemy.chargeState) {
    const interrupted = enemy.chargeState === 'INTERRUPTED'
    delete enemy.chargeState
    if (interrupted) return enraged ? 1 : null

    events.push({
      round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, statusRemoved: CHARGING,
      segments: [
        { type: 'tag', text: enraged ? '蓄力结束' : charge.name, tone: 'red' },
        { type: 'text', text: enraged ? ` ${enemy.unit.name}进入狂暴，散去蓄力。` : ` ${enemy.unit.name}聚力已成，施展【${charge.name}】！` },
      ],
    })
    return enraged ? 1 : charge.damageMultiplier
  }

  if (enraged || round !== charge.round) return 1
  enemy.chargeState = 'CHARGING'
  events.push({
    round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, statusApplied: CHARGING, statusRounds: 1,
    segments: [
      { type: 'tag', text: CHARGING, tone: 'red' },
      { type: 'text', text: ` ${enemy.unit.name}开始蓄力【${charge.name}】，下一回合出招。` },
    ],
  })
  return null
}
