import type { CombatUnitDTO, EquipSlotType, EscortSlot, LoadoutPresetDTO, StanceType, TierColor } from './protocol.ts'

export const MAX_CRIT_PERCENT = 75
export const DEFAULT_DODGE_CAP = 42
export const STANDARD_HIT_RAGE = 20
export const BASE_ACTION_SPEED = 100
export const ULT_MP_COST_PERCENT = 10
export const BASE_PARRY_CHANCE = 10
export const BASE_PARRY_ABSORB = 40

export interface BattleEnvironment {
  at?: number
  night?: boolean
  rain?: boolean
  swamp?: boolean
  water?: boolean
  storm?: boolean
}

export const NIGHT_HIT_PENALTY = 10

export function jianghuHour(date = new Date(Date.now())) {
  return (Math.floor(date.getTime() / 3_600_000) + 8) % 24
}

export function battleEnvironmentAt(mapId: string, date = new Date(Date.now())): BattleEnvironment {
  const hour = Math.floor(date.getTime() / 3_600_000) + 8
  const water = mapId === 'guiyun_lake'
  const coastal = water || mapId === 'taohua_isle'
  const weatherPhase = Math.floor(hour / 2) % 8
  const storm = coastal && weatherPhase === 0
  const rain = coastal ? weatherPhase < 3 : mapId === 'jiaxing_suburb' && weatherPhase >= 5
  return {
    at: date.getTime(),
    night: (jianghuHour(date) + 1) % 24 < 4, rain, storm, water, swamp: mapId === 'heizhao_swamp',
  }
}

export function shichenIdxFromDate(date = new Date()) {
  return Math.floor(((jianghuHour(date) + 1) % 24) / 4)
}

export type WeaponForm = 'BLADE' | 'AXE' | 'STAFF' | 'SPEAR' | 'BOW' | 'WHIP' | 'ODD' | 'SOUND'
export type AttackForm = WeaponForm | 'FIST' | 'PALM' | 'FINGER' | 'CLAW' | 'KICK' | 'PROJECTILE' | 'QI'
export type DamageElement = 'WATER' | 'COLD' | 'POISON' | 'FIRE'
export type CombatAlignment = 'RIGHTEOUS' | 'HERETIC' | 'NEUTRAL'

export type CombatFaction = 'JIN' | 'MONGOL'
export type EnemyTrait = CombatFaction | 'RIGHTEOUS' | 'HERETIC' | 'MOUNTED' | 'HEAVY_ARMOR'

export interface StrikeMatch {
  forms?: readonly AttackForm[]
  skillIds?: readonly string[]
  tradition?: 'TAOIST'
  stance?: StanceType
  pointStrike?: true
  lightSkill?: true
}

export function matchesStrike(rule: StrikeMatch, actual: {
  form?: AttackForm; skillId: string; tradition?: 'TAOIST'; stance: StanceType; pointStrike?: true; lightSkill?: boolean;
}) {
  return (!rule.forms || (!!actual.form && rule.forms.includes(actual.form))) &&
    (!rule.skillIds || rule.skillIds.includes(actual.skillId)) && (!rule.tradition || rule.tradition === actual.tradition) &&
    (!rule.stance || rule.stance === actual.stance) && (!rule.pointStrike || !!actual.pointStrike) && (!rule.lightSkill || !!actual.lightSkill)
}

export function isWeaponForm(form: AttackForm | undefined): form is WeaponForm {
  return form === 'BLADE' || form === 'AXE' || form === 'STAFF' || form === 'SPEAR' || form === 'BOW' || form === 'WHIP' || form === 'ODD' || form === 'SOUND'
}

export type ControlKind = 'SEAL' | 'STUN' | 'ULT_LOCK' | 'CONFUSION' | 'FREEZE' | 'DISARM' | 'KNOCKBACK' | 'MERIDIAN_BREAK' | 'FALL_IN_WATER'
export type ModifierStatus = 'SLOW' | 'SPEED_UP' | 'ATTACK_DOWN' | 'HIT_DOWN' | 'CRIT_DOWN' | 'DEFENSE_DOWN' | 'DEFENSE_UP' | 'DODGE_DOWN' | 'DODGE_UP' | 'HEAL_DOWN'
export type BattleStatusRule =
  | { status: Exclude<ControlKind, 'DISARM'>; rounds: number; chancePercent?: number; nextRound?: boolean }
  | { status: 'DISARM'; rounds: number; chancePercent?: number; weaponTiers?: readonly TierColor[] }
  | { status: ModifierStatus; rounds: number; percent: number; chancePercent?: number; nextRound?: boolean; maxStacks?: number }

export type PeriodicKind = 'poison' | 'needlePoison' | 'venom' | 'snakeVenom' | 'dartPoison' | 'bonePoison' | 'cinnabar' | 'heartPoison' | 'firePoison' |
  'bleed' | 'dartBleed' | 'needleBleed' | 'woundBleed' | 'boneTear' | 'bihai' | 'coldInjury' | 'lingshe' | 'staffVenom' | 'fusheVenom'
export type PeriodicRule = {
  status: PeriodicKind; rounds: number; chancePercent?: number; maxStacks?: number; stacksPerHit?: number;
  firstRound?: number; defenseDownPercent?: number; defenseDownAtMaxStacks?: true; maxHpDamageTotal?: true;
} &
  ({ attackPercent: number } | { maxHpPercent: number })

export interface EnemyBattleReaction {
  name: string
  attackPercent: number
  breakDefense?: true
}

export interface EnemyCombatConfig {
  female?: true
  creature?: 'BANDIT' | 'BEAST'
  scareable?: true
  openingConcealment?: number
  weapon?: { form: WeaponForm; tier: TierColor }
  faction?: CombatFaction
  alignment?: CombatAlignment
  karma?: number
  mounted?: true
  heavyArmor?: true
  def?: number
  openingShield?: number
  speed?: number
  parry?: number
  dodge?: number
  lightDodge?: number
  crit?: number
  openingRage?: number
  openingReaction?: EnemyBattleReaction
  openingTrap?: { sourceId: string; sourceName: string; stance: StanceType; rule: BattleStatusRule }
  rageSkillId?: string
  rageMove?: {
    id: string; name: string; powerRatio: number; form: AttackForm; target?: 'FRONT' | 'REAR';
    periodic?: PeriodicRule; statusOnHit?: BattleStatusRule; lightHitPenalty?: number;
  }
  innerEndurance?: { skillId: string; recoveryPercent: number; ultCostPercent: number }
  statusOnHit?: BattleStatusRule
  periodicOnHit?: PeriodicRule
  statusPulse?: { every: number; lastRound?: number; name: string; rule: BattleStatusRule; shieldedByCompanion?: string; waterOnly?: true }
  preferFemaleCompanion?: true
  escortTarget?: EscortSlot
  companionCounter?: { id: string; slot: 'ALLY_LEFT' | 'ALLY_RIGHT'; damageReductionPercent: number; hitPenalty: number }
  controlImmunity?: readonly ControlKind[]
  range?: 'MELEE' | 'RANGED'
  joinsRound?: true
  staysBehindLeader?: true
  frontAfterGuard?: true
  leaderDown?: { name: string; attackPercent: number }
  leaderOnDeath?: EnemyBattleReaction
  formation?: { name: string; parryPoints: number }
  deathBlast?: { name: string; attackPercent: number; pushAway: StrikeMatch }
  ninePalace?: { minInsight: number; gates: readonly { name: string; defensePercent: number; attackPercent: number; opening?: true }[] }
  peachTrials?: true
  charge?: {
    round: number; name: string; damageMultiplier: number; element?: DamageElement; area?: true; requiresWeapon?: true;
    taichiCounterPercent?: number; taichiGuard?: true; interruptSkillIds?: readonly string[]; innerPressure?: true;
  }
  defenseBreakOnHit?: { threshold: number; name: string }
  hitStreakWeakness?: { rounds: number; critPoints: number; name: string }
  strikeWeakness?: {
    name: string; matches: readonly StrikeMatch[]; hits?: number; breakDefense?: true; stopPeriodic?: true; status?: BattleStatusRule;
  }
  water?: Pick<EnemyCombatConfig, 'def' | 'strikeWeakness'> & { attackPercent?: number }
  hearingWeakness?: { skillIds: readonly string[]; hitPenalty: number }
  openingMercy?: { belowInt: number; itemId: string; attackPercent: number }
  weakSpot?: { round: number; name: string; weaponId: string; openingAttackPercent?: number; exposedAttackPercent: number }
  reverseMeridians?: { waveEvery: number; guardedDamagePercent: number; heartThresholdPercent: number; heartAttackPercent: number }
}

export interface BattleEnemyGuard {
  name: string
  title: string
  portrait: CombatUnitDTO['portraitStyle']
  hp: number
  atk: number
  stance?: StanceType
  combat?: EnemyCombatConfig
}

export interface BattleOpponent extends BattleEnemyGuard {
  mp: number
  stance: StanceType
  isBoss?: boolean
  guards?: readonly BattleEnemyGuard[]
}

export type BattleObjective =
  | { kind: 'DEFEAT' | 'DISARM' | 'COMPOSURE' | 'ENDURE_HITS'; rounds: number }
  | { kind: 'HOLD_FORMATION'; rounds: number; parryPoints: number }
  | { kind: 'ENDURE_MERIDIANS'; rounds: number; minCon: number; initialDamage: number; damageStep: number }

export function battleObjectiveText(objective: BattleObjective, opponent: string) {
  const { kind, rounds } = objective
  if (kind === 'DEFEAT') return `在 ${rounds} 回合内击倒${opponent}。`
  if (kind === 'DISARM') return `在 ${rounds} 回合内卸下${opponent}的兵刃，且对方仍存活。`
  if (kind === 'ENDURE_HITS') return `站定承接${opponent}的 ${rounds} 掌，主角须撑住。`
  if (kind === 'HOLD_FORMATION') return `守住全部阵位 ${rounds} 回合，或提前击退${opponent}。`
  if (kind === 'ENDURE_MERIDIANS') return `基础根骨至少 ${objective.minCon} 点，独自撑过 ${rounds} 轮逆行冲击。`
  return `撑过 ${rounds} 回合，主角全程保持心神不乱。`
}

export interface BattleEscortAlly {
  id: string
  name: string
  title?: string
  portrait: CombatUnitDTO['portraitStyle']
  maxHp: number
  hp: number
  def: number
}

export const HUANG_YAOSHI_COMBAT: EnemyCombatConfig = {
  range: 'RANGED',
  weapon: { form: 'SOUND', tier: 'red' },
  peachTrials: true,
  statusPulse: { every: 3, lastRound: 9, name: '碧海潮生曲', rule: { status: 'CONFUSION', rounds: 1 }, shieldedByCompanion: 'zhoubotong' },
  charge: { round: 8, name: '桃花试招', damageMultiplier: 1.6, taichiGuard: true, interruptSkillIds: ['yiyang_zhi'] },
}

export const OUYANG_FENG_ISLAND_COMBAT = {
  alignment: 'HERETIC', karma: -100, weapon: { form: 'STAFF', tier: 'orange' },
  charge: { round: 3, name: '蛤蟆扑', damageMultiplier: 2, taichiCounterPercent: 10 },
} as const satisfies EnemyCombatConfig

export const OUYANG_FENG_FRENZY: EnemyCombatConfig = {
  alignment: 'HERETIC', karma: -100,
  controlImmunity: ['SEAL', 'STUN', 'ULT_LOCK'],
  reverseMeridians: { waveEvery: 3, guardedDamagePercent: 65, heartThresholdPercent: 20, heartAttackPercent: 120 },
}
export const CHEN_XUANFENG_STORY: EnemyCombatConfig = {
  alignment: 'HERETIC', karma: -50, def: 120, weakSpot: { round: 3, name: '肚脐罩门', weaponId: 'xuantie_dagger', exposedAttackPercent: 120 },
}
export const QIU_QIANZHANG_COMBAT: EnemyCombatConfig = {
  def: 80, defenseBreakOnHit: { threshold: 500, name: '肝胆俱裂' },
}
export const SHEN_QINGGANG_COMBAT: EnemyCombatConfig = {
  alignment: 'HERETIC', karma: -30, weapon: { form: 'BLADE', tier: 'blue' },
  statusOnHit: { status: 'SEAL', chancePercent: 25, rounds: 1 },
}
export const WU_QINGLIE_COMBAT: EnemyCombatConfig = {
  joinsRound: true, staysBehindLeader: true, speed: 88, alignment: 'HERETIC',
  weapon: { form: 'SPEAR', tier: 'blue' }, leaderDown: { name: '枪法大乱', attackPercent: 60 },
}
export const IRON_PALM_WOUND = { status: 'HEAL_DOWN', rounds: 3, percent: 50 } as const satisfies BattleStatusRule
export const QIU_QIANREN_COMBAT: EnemyCombatConfig = {
  alignment: 'HERETIC', karma: -60, def: 260, statusOnHit: IRON_PALM_WOUND,
  charge: { round: 2, name: '焚石掌风', damageMultiplier: 2, taichiGuard: true, interruptSkillIds: ['yiyang_zhi'] },
}
export const LIANG_ZIWENG_COMBAT: EnemyCombatConfig = {
  range: 'RANGED', faction: 'JIN', alignment: 'HERETIC', karma: -40, def: 140, weapon: { form: 'ODD', tier: 'purple' },
  periodicOnHit: { status: 'dartPoison', attackPercent: 8, rounds: 2 },
}

export const LIANG_SNAKE_GUARD = {
  name: '赤腹药蛇', title: '梁子翁所饲灵蛇', portrait: 'bandit', stance: 'AGILE',
  combat: {
    joinsRound: true, creature: 'BEAST', speed: 110,
    periodicOnHit: { status: 'snakeVenom', rounds: 2, attackPercent: 8 },
    leaderOnDeath: { name: '药蛇惊怒', attackPercent: 150, breakDefense: true },
  },
} as const satisfies Omit<BattleEnemyGuard, 'hp' | 'atk'>

export const SHA_TONGTIAN_COMBAT = {
  faction: 'JIN', alignment: 'HERETIC', karma: -40, weapon: { form: 'STAFF', tier: 'blue' },
  charge: { round: 1, name: '怒浪排壑', damageMultiplier: 2, element: 'WATER' },
  water: { attackPercent: 125 },
} as const satisfies EnemyCombatConfig

export const WANYAN_KANG_COMBAT: EnemyCombatConfig = {
  faction: 'JIN', alignment: 'HERETIC', karma: -45, weapon: { form: 'BLADE', tier: 'blue' }, rageSkillId: 'jiuyin_baiguzhua', crit: 25,
}

export const KE_POISON_DART = {
  id: 'ke_poison_dart', name: '飞天淬毒铁菱', powerRatio: 1.5, form: 'PROJECTILE',
  periodic: { status: 'dartPoison', attackPercent: 15, rounds: 2 },
} as const satisfies NonNullable<EnemyCombatConfig['rageMove']>

export const PENG_LIANHU_COMBAT: EnemyCombatConfig = {
  range: 'RANGED', faction: 'JIN', alignment: 'HERETIC', karma: -45, weapon: { form: 'ODD', tier: 'blue' },
  statusOnHit: { status: 'STUN', chancePercent: 8, rounds: 1 }, periodicOnHit: { status: 'dartPoison', attackPercent: 10, rounds: 2 },
  strikeWeakness: { name: '贴身封暗器', matches: [{ forms: ['FIST', 'PALM', 'CLAW', 'KICK'] }], status: { status: 'DISARM', rounds: 1 } },
}

export const TANCHUDUAN_COMBAT: EnemyCombatConfig = {
  alignment: 'RIGHTEOUS', weapon: { form: 'BLADE', tier: 'purple' }, rageSkillId: 'tonggui_jianfa',
  innerEndurance: { skillId: 'quanzhen_tuna', recoveryPercent: 6, ultCostPercent: 25 },
}

export const PENG_LIANHU_TEMPLE_COMBAT: EnemyCombatConfig = {
  ...PENG_LIANHU_COMBAT,
  rageMove: { id: 'peng_tougu_yinzhen', name: '透骨银针', powerRatio: 1.4, form: 'PROJECTILE', target: 'REAR',
    statusOnHit: { status: 'ULT_LOCK', rounds: 1 } },
}

export const LINGZHI_COMBAT: EnemyCombatConfig = {
  faction: 'JIN', alignment: 'HERETIC', karma: -30, def: 140, speed: 190, openingRage: 100, rageSkillId: 'dashouyin',
  periodicOnHit: { status: 'firePoison', firstRound: 4, attackPercent: 10, rounds: 2 },
  strikeWeakness: { name: '双肋气门被破', matches: [{ forms: ['BLADE'] }], breakDefense: true, stopPeriodic: true },
}

export const ZHAO_MANOR_GUARD: BattleEnemyGuard = {
  name: '灵智上人', title: '密宗大手印', portrait: 'monk', hp: 3800, atk: 340, stance: 'FIERCE',
  combat: { ...LINGZHI_COMBAT, joinsRound: true },
}

export function matchesEnemyTrait(combat: EnemyCombatConfig | undefined, traits: readonly EnemyTrait[]) {
  return !!combat && traits.some((trait) => trait === combat.faction || trait === combat.alignment ||
    (trait === 'MOUNTED' && combat.mounted) || (trait === 'HEAVY_ARMOR' && combat.heavyArmor))
}

export function damageAfterDefense(damage: number, defense: number, attackerLevel: number) {
  return damage * (1 - defense / (defense + 450 + attackerLevel * 45))
}

const BATTLE_STAT_LABELS = {
  hp: '气血上限', mp: '内力上限', atk: '外功攻击', def: '护体防御', crit: '暴击率', dodge: '闪避率', speed: '出手速度',
  parry: '招架率', parryAbsorb: '招架吸伤', defPercent: '护体防御', atkPercent: '外功攻击', hpPercent: '气血上限', mpPercent: '内力上限', hit: '命中率',
  str: '臂力', con: '根骨', agi: '身法', intStat: '悟性', luck: '福缘', karma: '侠义', speedPercent: '出手速度',
}

export type BattleStatBonuses = Partial<Record<keyof typeof BATTLE_STAT_LABELS, number>>

export function formatBattleStatBonuses(stats: BattleStatBonuses) {
  return (Object.keys(stats) as (keyof BattleStatBonuses)[])
    .filter((stat) => stats[stat])
    .map((stat) => {
      const unit = stat === 'dodge' || stat === 'parry' || stat === 'parryAbsorb' || stat === 'hit'
        ? ' 个百分点' : stat === 'crit' || stat.endsWith('Percent') ? '%' : ''
      const value = stats[stat]!
      return `${BATTLE_STAT_LABELS[stat]} ${value < 0 ? '−' : '+'}${Math.abs(value).toLocaleString('zh-CN')}${unit}`
    })
    .join('，')
}

export const EQUIP_SLOT_META = {
  WEAPON: { label: '武器', glyph: '兵', field: 'weaponId' },
  ARMOR: { label: '衣甲', glyph: '甲', field: 'armorId' },
  ACC: { label: '佩饰', glyph: '佩', field: 'accId' },
  RELIC: { label: '秘宝', glyph: '秘', field: 'relicBookId' },
  HEAD: { label: '头饰', glyph: '冠', field: 'headId' },
  WRIST: { label: '护腕', glyph: '腕', field: 'wristId' },
  BELT: { label: '腰带', glyph: '带', field: 'beltId' },
  BOOTS: { label: '靴子', glyph: '靴', field: 'bootsId' },
} as const satisfies Record<EquipSlotType, { label: string; glyph: string; field: keyof LoadoutPresetDTO }>

export const PERSONAL_EQUIP_SLOTS = (Object.keys(EQUIP_SLOT_META) as EquipSlotType[]).filter((slot) => slot !== 'RELIC')

export function companionItemId(loadout: LoadoutPresetDTO, companionId: string, slot: (typeof PERSONAL_EQUIP_SLOTS)[number]) {
  return slot === 'WEAPON' ? loadout.companionWeapons?.[companionId] : loadout.companionEquipment?.[companionId]?.[slot]
}

/** 三才架势：刚猛 克 奇门，奇门 克 太极，太极 克 刚猛 */
export const STANCE_META: Record<StanceType, { name: string; beats: StanceType; style: string }> = {
  FIERCE: { name: '刚猛', beats: 'AGILE', style: '正面强攻' },
  AGILE: { name: '奇门', beats: 'TAICHI', style: '灵活变招' },
  TAICHI: { name: '太极', beats: 'FIERCE', style: '挨打可反伤' },
}

export function stanceRelation(mine: StanceType, foe: StanceType): 'WIN' | 'LOSE' | 'EVEN' {
  if (mine === foe) return 'EVEN'
  return STANCE_META[mine].beats === foe ? 'WIN' : 'LOSE'
}
