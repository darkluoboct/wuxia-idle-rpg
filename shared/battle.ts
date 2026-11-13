import type { BattleEventDTO, BattleReportDTO, CombatUnitDTO, LoadoutPresetDTO, PlayerDTO, RaidId, RichSegment, StanceType } from './protocol.ts'
import { activeJianghuTitle, COMPANIONS, companionView, COOP_RAIDS, findTrioSynergy, hiddenWeaponCapacity, ITEMS, REALMS, SECTS, SKILLS, unlockedHiddenWeapons, type CompanionConfig, type CompanionView, type CoopRaidConfig, type HiddenWeaponConfig, type SkillConfig } from './gameData.ts'
import {
  advanceOnCrit, appendGaibangLootBonus, appendStatBonusEffects, applyBleedOnHit, applyBonusDamage, applyLethalSave, applyTargetDamageBonuses, damageShareFormation, dismountCavalry, dodgeRageGain, effectsFrom, gainRage,
  activeFuries, activeReversal, blockingActionStatus, canCounterLethal, disruptEnemyHearing, endUltCharge, enemyHitPenalty, escapeFromAttack, expireTimedShield, finishDesperateStrike, triggerLowHpEffects, grantRoundShields, grantShield, interruptEnemyCharge, interruptibleEnemyCharge, isPoisoned, recordEnemyHit, reverseEnemyBuffs,
  lethalSavesFrom, lostHpBonus, meleeRetaliationFor, recoverEnemyRoundMp, recoverRoundMp, recoverHitMp, recoverPoisonMp, resolveActionStartDamage, resolveAttackDamage, resolveBattleLoadout, resolveDamageOverTime, resolveEnemyAction,
  resolveDodgeEffects, resolveDualStatusBurst, resolveHealing, resolveHitRage, resolveIncomingPhysicalDamage, resolveLethalSave, resolveMeleeRetaliation,
  resolveAttackLifesteal, resolveParryEffects, resolveHitReflection, resolveTrueDamage, resolveCastArea, resolvePoisonBurst, resolveKillRewards, restoreHp, restorePartyRound, rollAbsoluteDefense, storedDamageEffect, teamStatBonuses, teamCombatEffects, teamTrueStrike, isSharedCombatEffect,
  resolveActionEndDarts, resolveCompanionEquipment, resolveReceivePeriodic, resolveStrikeSplash,
  applyBattleStatus, applyDirectedDamage, applyEnemyReaction, applyEnemyStatusPulse, applyIncomingStatuses, applyPeriodicOnHit, cleanseControlStatus, cleansePoison,
  battleDefense, battleDodge, breakCharge, canInterruptEnemyUltimate, effectsDuringAction, endStatusRound, hasStatus, hiddenWeaponChance, hiddenWeaponDamage, poisonStacks,
  enemyInnerMp, enemyPhaseAttackPercent, enemyRageAction, enemyPreferredTarget, prepareEnemyRound, reactToEnemyDamage, readyEnemyRagePower, reflectCriticalPoison, resolveCritRage, splitFormationDamage,
  recordLethalSave, reflectLethalPoison, remainingBattleStatuses, spreadHitStatus, startControlledAction, startStatusRound, statusPercent, strikeAvoidance, transferLethalStatuses, useCriticalHitPill, useLowMpPill, useRoundStartPill,
  type ActiveEffect, type CritAction, type DamageShareFormation, type DodgeEffectState, type EnemyBattleState, type StatusTarget, type TrueStrike,
} from './battleEffects.ts'
import {
  BASE_ACTION_SPEED, BASE_PARRY_ABSORB, BASE_PARRY_CHANCE, battleEnvironmentAt, battleObjectiveText, damageAfterDefense, DEFAULT_DODGE_CAP, MAX_CRIT_PERCENT, STANCE_META,
  isWeaponForm, matchesStrike, NIGHT_HIT_PENALTY, stanceRelation, STANDARD_HIT_RAGE, ULT_MP_COST_PERCENT, type AttackForm, type BattleEnemyGuard, type BattleEnvironment, type BattleEscortAlly, type BattleObjective, type BattleOpponent, type BattleStatBonuses, type BattleStatusRule, type EnemyCombatConfig, type PeriodicRule,
} from './combatMeta.ts'
import { skillPowerAtMastery } from './skillMastery.ts'
import { gaibangSilverGain } from './gaibang.ts'
import { effectiveMartialStats, martialEffectiveness, type MartialSchoolMember } from './martialSchools.ts'
import { CHAPTER_ONE_TITLE, equippedGearSkill, type trialPuzzleOutcome } from './trialStages.ts'

export function calcNextLevelQi(level: number): number {
  return Math.round(500 * Math.pow(level, 1.55) * Math.pow(1.08, Math.floor(level / 5)))
}

export function evaluateStanceAdvantage(ally: StanceType, enemy: StanceType): {
  advantage: 'ALLY' | 'ENEMY' | 'NONE'
  description: string
} {
  const relation = stanceRelation(ally, enemy)
  const ourStyle = STANCE_META[ally].name
  const theirStyle = STANCE_META[enemy].name
  if (relation === 'EVEN') {
    return {
      advantage: 'NONE',
      description: `双方都用「${ourStyle}」，打法上谁也不占优。`,
    }
  }
  if (relation === 'WIN') {
    return {
      advantage: 'ALLY',
      description: `你的「${ourStyle}」克制对手的「${theirStyle}」，出手更重，挨打更轻。`,
    }
  }
  return {
    advantage: 'ENEMY',
    description: `对手的「${theirStyle}」克制你的「${ourStyle}」，这场交手对手占上风。`,
  }
}

interface CollectionBonus {
  hpPct?: number
  atkPct?: number
}

/** 计算玩家二级战斗面板（严格对应第06册公式） */
export function computeDerivedStats(player: PlayerDTO, loadout: LoadoutPresetDTO, bonus: CollectionBonus = {}, companionOf = defaultCompanionOf) {
  const { main, teamStats, harmony, friction } = resolvePartyEquipment(player, loadout, companionOf)
  return withPartySpeed(deriveStats(player, loadout, main, bonus, teamStats).stats, harmony?.speedPercent ?? (friction ? ALIGNMENT_FRICTION_PERCENT : 0))
}

function defaultCompanionOf(id: string) {
  const config = COMPANIONS[id]
  return config ? companionView(config, { form: 'awakened' }) : undefined
}

function resolvePartyEquipment(player: PlayerDTO, loadout: LoadoutPresetDTO, companionOf: typeof defaultCompanionOf, includeCompanions = true) {
  const main = resolveBattleLoadout(loadout, player)
  const allocated = new Set(main.items.map((item) => item.id))
  function member(id: string | null) {
    const view = includeCompanions && id ? companionOf(id) : undefined
    return view ? { view, equipment: resolveCompanionEquipment(loadout, view, allocated, player) } : undefined
  }
  const left = member(loadout.leftCompanionId)
  const right = loadout.rightCompanionId !== left?.view.id ? member(loadout.rightCompanionId) : undefined
  const companionEffects = [...(left?.equipment.effects ?? []), ...(right?.equipment.effects ?? [])]
  const affinity = partyAffinity(main.effects, [left?.equipment.karma ?? 0, right?.equipment.karma ?? 0],
    !!findTrioSynergy(left?.view.id ?? null, right?.view.id ?? null))
  return { main, left, right, companionEffects, ...affinity, teamStats: teamStatBonuses([...main.effects, ...companionEffects]) }
}

function battleStatTotal(effects: readonly ActiveEffect[], stat: keyof BattleStatBonuses) {
  return effects.reduce((total, effect) => total + (effect.kind === 'STAT_BONUS' ? effect.stats[stat] ?? 0 : 0), 0)
}

function combatPowerOf(hp: number, mp: number, atk: number, def: number, speed: number, crit: number) {
  return Math.round(hp * 0.35 + mp * 0.25 + atk * 4.2 + def * 2.8 + speed * 3.5 + crit * 45)
}

function deriveCompanionStats(
  member: NonNullable<ReturnType<typeof resolvePartyEquipment>['left']>, level: number, side: 'ALLY_LEFT' | 'ALLY_RIGHT',
  team: readonly ActiveEffect[], environment: BattleEnvironment,
) {
  const { view, equipment } = member
  const { items, effects, karma } = equipment
  const own = (stat: keyof BattleStatBonuses) => battleStatTotal(effects, stat)
  const shared = (stat: keyof BattleStatBonuses) => battleStatTotal(team, stat)
  const agi = own('agi') + shared('agi')
  const str = own('str') + shared('str')
  const con = own('con') + shared('con')
  const insight = own('intStat') + shared('intStat')
  const equipmentHp = items.reduce((sum, item) => sum + (item.hpBonus ?? 0), 0)
  const equipmentAtk = items.reduce((sum, item) => sum + (item.atkBonus ?? 0), 0)
  const equipmentDef = items.reduce((sum, item) => sum + (item.defBonus ?? 0), 0)
  const scale = side === 'ALLY_LEFT' ? 0.04 : 0.038
  const maxHp = Math.round((Math.round(view.baseHp * (1 + level * scale)) + equipmentHp + own('hp') + shared('hp') + con * 46) *
    (100 + own('hpPercent') + shared('hpPercent')) / 100)
  const maxMp = Math.round(((side === 'ALLY_LEFT' ? 2000 : 2200) + own('mp') + shared('mp') + con * 26 + insight * 12) *
    (100 + own('mpPercent') + shared('mpPercent')) / 100)
  const atk = Math.round((Math.round(view.baseAtk * (1 + level * 0.04)) + equipmentAtk + own('atk') + shared('atk') + str * 8.5 + agi * 2.5) *
    (100 + shared('atkPercent')) / 100 * (100 + own('atkPercent')) / 100)
  const def = Math.round((equipmentDef + own('def') + shared('def') + con * 5.5 + str * 2) *
    (100 + shared('defPercent')) / 100 * (100 + own('defPercent')) / 100)
  const baseSpeed = Math.round((BASE_ACTION_SPEED + agi * 3.2 + own('speed') + shared('speed')) * (100 + own('speedPercent') + shared('speedPercent')) / 100)
  const weather = environment.rain || environment.night ? effects.find((effect) => effect.kind === 'RAIN_NIGHT_SPEED') : undefined
  const speed = baseSpeed + (weather ? Math.round(baseSpeed * weather.percent / 100) : 0)
  const dodgeCap = effects.reduce((cap, effect) => effect.kind === 'DODGE_CAP' ? Math.max(cap, effect.percent) : cap, DEFAULT_DODGE_CAP)
  const swamp = environment.swamp ? effects.find((effect) => effect.kind === 'SWAMP_DODGE') : undefined
  const dodge = Math.min(dodgeCap, Math.round(agi * 45 / (agi + 180 + level * 4) + items.reduce((sum, item) => sum + (item.dodgeBonus ?? 0), 0)) +
    own('dodge') + shared('dodge') + (swamp?.points ?? 0))
  const outer = SKILLS[equipment.use?.outerSkillId ?? view.battleAttack?.skillId ?? '']
  const crit = Math.min(MAX_CRIT_PERCENT, Math.round(8 + (agi * 0.6 + insight * 0.4) * 40 / (agi + insight + 220) +
    items.reduce((sum, item) => sum + (item.critBonus ?? 0), 0) + own('crit') + shared('crit')))
  const parryPoints = own('parry') + shared('parry')
  const absorbPoints = own('parryAbsorb') + shared('parryAbsorb')
  const parry = parryPoints || absorbPoints || effects.some((effect) => effect.kind === 'PARRY_REFLECT' || effect.kind === 'PARRY_HEAL')
    ? Math.min(100, BASE_PARRY_CHANCE + parryPoints) : 0
  const displayedCrit = Math.min(MAX_CRIT_PERCENT, crit + (outer?.critBonus ?? 0))
  const attributes = {
    str: view.stats.str + str, con: view.stats.con + con, agi: view.stats.agi + agi,
    intStat: view.stats.intStat + insight, luck: view.stats.luck + own('luck') + shared('luck'), karma,
  }
  return { maxHp, maxMp, atk, def, speed, dodge, dodgeCap, crit, displayedCrit, agi: attributes.agi, intStat: attributes.intStat, equipmentAgi: agi, parry,
    attributes,
    parryAbsorb: Math.min(100, BASE_PARRY_ABSORB + absorbPoints), combatPower: combatPowerOf(maxHp, maxMp, atk, def, speed, displayedCrit) }
}

export function computeCompanionDerivedStats(player: PlayerDTO, loadout: LoadoutPresetDTO, id: string, companionOf = defaultCompanionOf) {
  const { left, right, teamStats, harmony, friction } = resolvePartyEquipment(player, loadout, companionOf)
  const isLeft = left?.view.id === id
  const member = isLeft ? left : right?.view.id === id ? right : undefined
  if (!member) return
  const stats = deriveCompanionStats(member, player.level, isLeft ? 'ALLY_LEFT' : 'ALLY_RIGHT', teamStats, battleEnvironmentAt(player.currentMapId))
  return withPartySpeed({ ...stats, crit: stats.displayedCrit }, harmony?.speedPercent ?? (friction ? ALIGNMENT_FRICTION_PERCENT : 0))
}

function deriveStats(
  player: PlayerDTO,
  loadout: LoadoutPresetDTO,
  { items, effects, freedom }: ReturnType<typeof resolveBattleLoadout>,
  bonus: CollectionBonus = {},
  sharedStats = teamStatBonuses(effects),
  environment?: BattleEnvironment,
) {
  const realm = REALMS.find((r) => r.tier === player.realmTier) ?? REALMS[0]
  const m = realm.multiplier
  const s = { ...player.stats }

  const inner = loadout.innerSkillId ? SKILLS[loadout.innerSkillId] : undefined
  const light = loadout.lightSkillId ? SKILLS[loadout.lightSkillId] : undefined
  const outer = loadout.outerSkillId ? SKILLS[loadout.outerSkillId] : undefined
  const lightEfficiency = light?.slot === 'LIGHT' ? martialEffectiveness(light, player, freedom) / 100 : 0

  const gear = { hp: 0, atk: 0, def: 0, crit: 0, dodge: 0 }
  for (const item of items) {
    gear.hp += item.hpBonus ?? 0
    gear.atk += item.atkBonus ?? 0
    gear.def += item.defBonus ?? 0
    gear.crit += item.critBonus ?? 0
    gear.dodge += item.dodgeBonus ?? 0
  }
  let flatHp = 0
  let flatMp = 0
  let flatCrit = 0
  let flatDodge = 0
  let flatSpeed = 0
  let flatParry = 0
  let flatParryAbsorb = 0
  let defensePercent = 0
  let attackPercent = 0
  let hpPercent = 0
  let mpPercent = 0
  let speedPercent = 0
  let dodgeCap = DEFAULT_DODGE_CAP
  for (const effect of [...effects, ...sharedStats]) {
    if (effect.kind === 'DODGE_CAP') dodgeCap = Math.max(dodgeCap, effect.percent)
    if (effect.kind !== 'STAT_BONUS') continue
    const { hp, mp, atk, def, crit, dodge, speed, parry, parryAbsorb, defPercent, atkPercent, str, con, agi, intStat } = effect.stats
    flatHp += hp ?? 0
    flatMp += mp ?? 0
    flatCrit += crit ?? 0
    flatDodge += dodge ?? 0
    flatSpeed += speed ?? 0
    flatParry += parry ?? 0
    flatParryAbsorb += parryAbsorb ?? 0
    defensePercent += defPercent ?? 0
    attackPercent += atkPercent ?? 0
    hpPercent += effect.stats.hpPercent ?? 0
    mpPercent += effect.stats.mpPercent ?? 0
    speedPercent += effect.stats.speedPercent ?? 0
    gear.atk += atk ?? 0
    gear.def += def ?? 0
    s.str += str ?? 0
    s.con += con ?? 0
    s.agi += agi ?? 0
    s.intStat += intStat ?? 0
  }

  const hpBonusMult = (1 + (player.bonusHpPct ?? 0) / 100) * (1 + (bonus.hpPct ?? 0) / 100)
  const atkBonusMult = (1 + (bonus.atkPct ?? 0) / 100) * (1 + attackPercent / 100)
  const baseHp = Math.round((320 + player.level * 85 + s.con * 46) * m * (inner?.id === 'jiuyin_zonggang' ? 1.25 : 1.08) * hpBonusMult + gear.hp) + flatHp
  const baseMp = Math.round((120 + player.level * 32 + s.con * 26 + s.intStat * 12) * m) + flatMp + (player.bonusMp ?? 0)
  const isDeviating = (player.qiDeviationUntil ?? 0) > (environment?.at ?? Date.now())
  const fullHp = Math.round(baseHp * (100 + hpPercent) / 100)
  const maxHp = isDeviating ? Math.round(fullHp * 0.9) : fullHp
  const maxMp = Math.round(baseMp * (100 + mpPercent) / 100)
  const atk = Math.round(((45 + player.level * 13 + s.str * 8.5 + s.agi * 2.5) * m + gear.atk) * atkBonusMult)
  const def = Math.round(((22 + player.level * 6 + s.con * 5.5 + s.str * 2.0) * m + gear.def) * (100 + defensePercent) / 100)
  const lightSpeed = (light?.speedBonus ?? 0) * lightEfficiency
  const baseSpeed = Math.round((BASE_ACTION_SPEED + s.agi * 3.2 + lightSpeed + flatSpeed) * (100 + speedPercent) / 100)
  const weather = environment?.rain || environment?.night ? effects.find((effect) => effect.kind === 'RAIN_NIGHT_SPEED') : undefined
  const weatherSpeed = weather ? Math.round(baseSpeed * weather.percent / 100) : 0
  const speed = baseSpeed + weatherSpeed
  const swampDodge = environment?.swamp ? effects.find((effect) => effect.kind === 'SWAMP_DODGE') : undefined
  flatDodge += swampDodge?.points ?? 0
  const baseDodge = Math.round((s.agi / (s.agi + 180 + player.level * 4)) * 45 + (light?.dodgeBonus ?? 0) * lightEfficiency + gear.dodge)
  const dodge = Math.min(dodgeCap, baseDodge + flatDodge)
  const baseCrit = Math.round(
    8 + ((s.agi * 0.6 + s.intStat * 0.4) / (s.agi + s.intStat + 220)) * 40 +
       gear.crit + (outer ? (outer.critBonus ?? 0) * martialEffectiveness(outer, player, freedom) / 100 : 0) + (inner?.critBonus ?? 0),
  )
  const crit = Math.min(MAX_CRIT_PERCENT, baseCrit + flatCrit)
  const canParry = flatParry > 0 || flatParryAbsorb > 0 || effects.some((effect) => effect.kind === 'PARRY_REFLECT' || effect.kind === 'PARRY_HEAL')
  const parry = canParry ? Math.min(100, BASE_PARRY_CHANCE + flatParry) : 0
  const parryAbsorb = Math.min(100, BASE_PARRY_ABSORB + flatParryAbsorb)

  const combatPower = combatPowerOf(maxHp, maxMp, atk, def, speed, crit)
  return {
    stats: { maxHp, maxMp, atk, def, speed, dodge, crit, parry, parryAbsorb, combatPower },
    addedCrit: crit - Math.min(MAX_CRIT_PERCENT, baseCrit),
    addedDodge: dodge - Math.min(dodgeCap, baseDodge),
    dodgeCap,
    agi: s.agi,
    intStat: s.intStat,
    environmentBonuses: [
      ...(isDeviating ? [{ kind: 'STAT_BONUS' as const, sourceId: 'qi_deviation', sourceName: '气血微沸',
        stats: { hp: maxHp - fullHp } }] : []),
      ...(weather ? [{ ...weather, kind: 'STAT_BONUS' as const, stats: { speed: weatherSpeed } }] : []),
      ...(swampDodge ? [{ ...swampDodge, kind: 'STAT_BONUS' as const, stats: { dodge: swampDodge.points } }] : []),
    ],
  }
}

function playerUnit(slot: CombatUnitDTO['slot'], player: PlayerDTO, loadout: LoadoutPresetDTO, stats: ReturnType<typeof computeDerivedStats>, weaponName = '赤手空拳'): CombatUnitDTO {
  return {
    slot, id: player.id, name: player.nickname,
    title: player.chapterOneChampion ? CHAPTER_ONE_TITLE : activeJianghuTitle({ ...player, stats: effectiveMartialStats(player, loadout) }, loadout)?.titleName ??
      (player.currentSectId ? (SECTS.find((sect) => sect.id === player.currentSectId)?.name ?? '江湖侠客') : '逍遥散人'),
    portraitStyle: 'hero_sword', avatarId: player.avatarId, isPlayer: true, maxHp: stats.maxHp, hp: stats.maxHp, maxMp: stats.maxMp, rage: 50,
    weaponName,
  }
}
export function innerPressure(ownMp: number, enemyMp: number) {
  return Math.max(0.78, Math.min(1.48, 1 + 0.25 * ((ownMp - enemyMp) / Math.max(500, enemyMp))))
}

function reduceInnerPressure(pressure: number, effects: readonly ActiveEffect[], damageAt: (pressure: number) => number,
  segments: RichSegment[], label: '盾前减伤' | '盾后减伤',
) {
  if (pressure <= 1) return pressure
  let reduction = 0
  let current = pressure
  for (const effect of effects) {
    if (effect.kind !== 'INNER_PRESSURE_REDUCTION' || reduction >= 100) continue
    reduction = Math.min(100, reduction + effect.percent)
    const next = 1 + (pressure - 1) * (100 - reduction) / 100
    const prevented = damageAt(current) - damageAt(next)
    segments.push({ type: 'tag', tone: 'jade', text: `${effect.sourceName} · 内力压制 · ${label} ${prevented.toLocaleString()}` })
    current = next
  }
  return current
}

export function strikeDamage(attack: number, power: number, stance: number, pressure: number, critical: boolean, round: number, critScale = 1) {
  const base = attack * power * stance * pressure * (critical ? 1.55 * critScale : 1)
  return Math.max(95, Math.round(base * (0.95 + ((round * 13) % 10) * 0.01)))
}
export function incomingDamage(attack: number, multiplier: number, defense: number, level: number) {
  return Math.max(70, Math.round(damageAfterDefense(attack * multiplier, defense, level)))
}

function actionTime(speed: number, advance = 0) {
  return (1000 - advance * 10) / (50 + speed * 1.2)
}

function battleSpeed(target: StatusTarget, base: number, round: number) {
  const partyPercent = target.partySpeed?.round === round ? target.partySpeed.percent : 0
  const boosted = base * (100 + statusPercent(target, 'SPEED_UP', round)) / 100
  return boosted * (100 - statusPercent(target, 'SLOW', round)) / 100 * (100 + partyPercent) / 100
}

function enemySpeed(enemy: EnemyBattleState, round: number) {
  return battleSpeed(enemy, enemy.combat?.speed ?? BASE_ACTION_SPEED, round)
}

function createEnemyFormation<T extends EnemyBattleState>(
  enemies: readonly T[], hpOf: (enemy: T) => number, events: BattleEventDTO[], firstRound = 1,
) {
  const leader = enemies.find((enemy) => enemy.unit.slot === 'ENEMY_MAIN')
  const rule = leader?.combat?.formation
  if (!rule) return
  const { name, parryPoints } = rule
  const members = enemies.filter((enemy) => enemy === leader || enemy.combat?.joinsRound)
  let front: T | undefined
  let broken = false

  function breakFormation(round: number, actorSlot: CombatUnitDTO['slot'], reason: string) {
    broken = true
    front = undefined
    for (const enemy of members) delete enemy.formationParry
    events.push({
      round, type: 'EFFECT', actorSlot, targetSlot: 'ENEMY_MAIN', effectSourceId: 'enemy_formation', statusRemoved: name,
      segments: [{ type: 'tag', text: `${name} · ${reason}，阵势瓦解`, tone: 'jade' }],
    })
  }

  return {
    get front() { return front },
    get broken() { return broken },
    advance(round: number, challengers: readonly { fighter: StatusTarget; speed: number }[]) {
      if (broken || members.length < 2) return
      let fastest = Math.max(...members.map((enemy) => enemySpeed(enemy, round)))
      let breaker: StatusTarget | undefined
      for (const { fighter, speed } of challengers) {
        if (speed <= fastest || blockingActionStatus(fighter, round)) continue
        fastest = speed
        breaker = fighter
      }
      if (breaker) {
        breakFormation(round, breaker.unit.slot, `${breaker.unit.name}抢占北极星位`)
        return
      }
      const nextFront = members[(round - firstRound) % members.length]
      const action = front && front !== nextFront ? '换至前排' : '居前'
      front = nextFront
      for (const member of members) member.formationParry = member === front ? parryPoints : 0
      const baseParry = front.playerGuard?.parry ?? front.combat?.parry ?? 0
      const bonus = Math.min(100, baseParry + parryPoints) - Math.min(100, baseParry)
      events.push({
        round, type: 'EFFECT', actorSlot: front.unit.slot, targetSlot: front.unit.slot, effectSourceId: 'enemy_formation',
        segments: [{ type: 'tag', text: `${name} · ${front.unit.name}${action} · 招架 +${bonus} 个百分点`, tone: 'jade' }],
      })
    },
    removeFallen(round: number) {
      if (broken) return
      const fallen = members.find((enemy) => hpOf(enemy) <= 0)
      if (fallen) breakFormation(round, fallen.defeat?.actorSlot ?? 'ALLY_MAIN', `${fallen.unit.name}退场`)
    },
  }
}

const ALIGNMENT_FRICTION_PERCENT = -10

function partyAffinity(effects: readonly ActiveEffect[], karma: readonly number[], hasBond = false) {
  if (!karma.some((value) => value > 0) || !karma.some((value) => value < 0)) return {}
  const harmony = effects.find((effect) => effect.kind === 'MIXED_KARMA_HARMONY')
  return { harmony, friction: !harmony && !hasBond }
}

function withPartySpeed<T extends { maxHp: number; maxMp: number; atk: number; def: number; speed: number; crit: number; combatPower: number }>(
  stats: T, percent = 0,
) {
  if (!percent) return stats
  const speed = Math.round(stats.speed * (100 + percent) / 100)
  return { ...stats, speed, combatPower: combatPowerOf(stats.maxHp, stats.maxMp, stats.atk, stats.def, speed, stats.crit) }
}

function applyAlignmentFriction(
  target: StatusTarget, speed: number, round: number, events: BattleEventDTO[],
) {
  const before = battleSpeed(target, speed, round)
  target.partySpeed = { round, percent: ALIGNMENT_FRICTION_PERCENT }
  const lost = Math.round(before) - Math.round(battleSpeed(target, speed, round))
  events.push({
    round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: 'alignment_friction',
    segments: [{ type: 'tag', text: `正邪相斥 · 出手速度 −${lost}`, tone: 'red' }],
  })
}

function startHarmony(
  target: StatusTarget, speed: number, rage: number, effect: Extract<ActiveEffect, { kind: 'MIXED_KARMA_HARMONY' }>, round: number, events: BattleEventDTO[],
) {
  const before = battleSpeed(target, speed, round)
  target.partySpeed = { round, percent: effect.speedPercent }
  const gained = gainRage(rage, effect.rage, [])
  const addedSpeed = Math.round(battleSpeed(target, speed, round)) - Math.round(before)
  events.push({
    round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, effectSourceId: effect.sourceId, rageDelta: gained || undefined,
    segments: [{ type: 'tag', text: `${effect.sourceName} · 琴箫合奏 · 出手速度 +${addedSpeed} · 怒气 +${gained}`, tone: 'jade' }],
  })
  return rage + gained
}

function announceMiss(attacker: CombatUnitDTO, target: CombatUnitDTO, penalty: number, round: number, events: BattleEventDTO[],
  cast: Pick<BattleEventDTO, 'skillId' | 'skillName' | 'skillTier' | 'isUlt'> = {},
) {
  events.push({
    round, type: 'SKILL_CAST', actorSlot: attacker.slot, targetSlot: target.slot, hitResult: 'MISS', hpDelta: 0, ...cast,
    segments: [
      { type: 'actor', name: attacker.name, isAlly: false },
      { type: 'text', text: `命中率降低 ${penalty} 个百分点，招式落空。` },
    ],
  })
}

function announceOpening(unit: CombatUnitDTO, effect: ActiveEffect | undefined, events: BattleEventDTO[]) {
  if (!effect) return
  events.push({
    round: 1, type: 'EFFECT', actorSlot: unit.slot, effectSourceId: effect.sourceId,
    segments: [{ type: 'tag', text: `${effect.sourceName} · 抢占先手`, tone: 'gold' }],
  })
}

function openingPriority(effects: readonly ActiveEffect[], rng: () => number) {
  const openings = effects.filter((effect) => effect.kind === 'OPENING_PRIORITY')
  return openings.find((effect) => effect.chancePercent === undefined) ??
    openings.find((effect) => rng() < (effect.chancePercent ?? 0) / 100)
}

function announceBattleEnvironment(environment: BattleEnvironment, events: BattleEventDTO[]) {
  const conditions = [environment.water && '水战', environment.storm ? '风暴' : environment.rain && '雨天', environment.night && '黑夜'].filter(Boolean)
  if (conditions.length) events.push({
    round: 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', effectSourceId: 'battle_environment',
    segments: [{ type: 'tag', text: conditions.join(' · '), tone: 'gold' }],
  })
}

function counterChargedAttack(
  unit: CombatUnitDTO, stance: StanceType, enemy: EnemyBattleState, multiplier: number, hp: number, round: number, events: BattleEventDTO[],
) {
  const charge = enemy.combat?.charge
  if (multiplier <= 1 || stance !== 'TAICHI' || !charge) return
  if (charge.taichiCounterPercent) {
    const damage = Math.round(enemy.unit.maxHp * charge.taichiCounterPercent / 100)
    return applyBonusDamage({ sourceId: 'taichi_deflect', sourceName: '太极借力' }, resolveTrueDamage(damage, enemy, hp, []), enemy, {
      actorSlot: unit.slot, targetHp: hp, round, label: '引敌撞石', category: 'true',
    }, events)
  }
  if (!charge.taichiGuard) return
  events.push({
    round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: enemy.unit.slot, effectSourceId: 'taichi_deflect',
    segments: [{ type: 'tag', text: `太极借力 · 化解${charge.name}`, tone: 'jade' }],
  })
  return hp
}

function ultMpCost(unit: CombatUnitDTO) {
  return Math.round(unit.maxMp * ULT_MP_COST_PERCENT / 100)
}

const ULT_RAGE_SPEND = 85

function ultRageCost(skill: SkillConfig, effects: readonly ActiveEffect[]) {
  const discount = effects.find((effect): effect is Extract<ActiveEffect, { kind: 'ULT_RAGE_DISCOUNT' }> =>
    effect.kind === 'ULT_RAGE_DISCOUNT' && effect.skillId === skill.id,
  )
  const cost = !discount ? ULT_RAGE_SPEND : 'points' in discount
    ? Math.max(0, ULT_RAGE_SPEND - discount.points)
    : Math.round(ULT_RAGE_SPEND * (100 - discount.percent) / 100)
  return { cost, discount }
}

/** 计算不同战斗位阶下的首领狂暴起始回合（依据首领血量与战斗模式动态确定） */
export function calcBattleEnrageRound(enemyHp: number, mode?: BattleReportDTO['mode']): number {
  if (mode === 'PVP_HUASHAN' || mode === 'PVP_AMBUSH') return 15
  if (enemyHp > 50000) return 22
  if (enemyHp > 10000) return 16
  return 12
}

const BARE_HANDS: SkillConfig = {
  id: 'bare_hands', name: '寻常拳脚', slot: 'OUTER', tier: 'green', source: '无师自通', powerRatio: 1, combatForm: 'FIST',
  desc: '未习得任何外功时的寻常拳脚。', castNarrative: '挥拳直取敌方要害。',
}
const NO_LIGHT_SKILL: SkillConfig = {
  id: 'no_light', name: '腾挪闪躲', slot: 'LIGHT', tier: 'green', source: '无师自通', powerRatio: 1,
  desc: '未习得轻功时凭身法闪躲。', castNarrative: '侧身一让，险险避开。',
}

type ExtraAttackSource = {
  sourceId: string; sourceName: string; moveName?: string; trueAtkPercent?: number; powerRatio?: number;
  damagePercent?: number; comboIndex?: number; periodic?: PeriodicRule; status?: BattleStatusRule; noParry?: true; front?: true; hiddenWeapon?: true;
  gearSkill?: true;
}

const HUASHAN_FIERCE = { sourceId: 'huashan_fierce', sourceName: '刚猛强攻', critPoints: 25 }
const HUASHAN_AGILE = { sourceId: 'huashan_agile', sourceName: '奇门极速', openingSpeedPercent: 30 }
const HUASHAN_TAICHI = { sourceId: 'huashan_taichi', sourceName: '太极柔化', parryPoints: 35, reflectPercent: 40 }

function criticalShot(effect: CritAction | undefined, rng: () => number): ExtraAttackSource | undefined {
  if (!effect || rng() >= effect.followUpChance / 100) return
  return { sourceId: effect.sourceId, sourceName: effect.sourceName, moveName: effect.moveName, powerRatio: effect.powerRatio }
}

function extraCompanionAssist(effects: readonly ActiveEffect[], rng: () => number): ExtraAttackSource | undefined {
  const bonuses = effects.filter((effect) => effect.kind === 'COMPANION_ASSIST_CHANCE')
  const chance = Math.min(100, bonuses.reduce((sum, effect) => sum + effect.points, 0))
  if (chance <= 0 || (chance < 100 && rng() >= chance / 100)) return
  return { sourceId: bonuses[0].sourceId, sourceName: `${bonuses.map((effect) => effect.sourceName).join('、')} · 额外伙伴合击 ${chance}%` }
}

function outerFollowUps(effects: readonly ActiveEffect[], isUlt: boolean, landed: boolean, rng: () => number, basicAttack = false) {
  const result: ExtraAttackSource[] = []
  for (const effect of effects) {
    if (effect.kind !== 'OUTER_FOLLOW_UP') continue
    if (effect.basicOnly && !basicAttack) continue
    const ready = effect.trigger === 'ULT_CAST' ? isUlt : !isUlt && (landed || effect.trigger === 'OUTER_CAST')
    const chance = effect.hiddenWeapon ? hiddenWeaponChance(effect.chancePercent, effects) : effect.chancePercent
    if (!ready || (chance < 100 && rng() >= chance / 100)) continue
    if (effect.trigger === 'OUTER_CAST' && effect.damagePercent !== undefined) result.unshift(effect)
    else result.push(effect)
  }
  if (!isUlt && landed) {
    const chances = effects.filter((effect) => effect.kind === 'OUTER_COMBO_CHANCE')
    const chance = Math.min(100, chances.reduce((total, effect) => total + effect.points, 0))
    if (chance > 0 && (chance === 100 || rng() < chance / 100)) {
      result.push({ sourceId: chances[0].sourceId, sourceName: chances.map((effect) => effect.sourceName).join('、') })
    }
  }
  let comboIndex = 0
  return result.map((extra) => extra.trueAtkPercent === undefined && extra.powerRatio === undefined ? { ...extra, comboIndex: ++comboIndex } : extra)
}

function trueStrikeForAction(effects: readonly ActiveEffect[], rng: () => number) {
  if (teamTrueStrike(effects)) return
  const effect = effects.find((candidate): candidate is TrueStrike => candidate.kind === 'TRUE_STRIKE' && !candidate.team)
  return effect && rng() < effect.chancePercent / 100 ? effect : undefined
}

const CHARGED_ULT_ID = 'hama_nimai_pounce'

function equippedHiddenWeapons(player: PlayerDTO, loadout: LoadoutPresetDTO) {
  const unlocked = unlockedHiddenWeapons(player)
  return [...new Set(loadout.hiddenWeaponIds ?? [])].slice(0, hiddenWeaponCapacity(loadout))
    .flatMap((id) => unlocked.filter((weapon) => weapon.id === id))
}

function throwHiddenWeapon(
  owner: StatusTarget & { weapons: HiddenWeaponConfig[]; usedWeapons?: Set<string> },
  target: EnemyBattleState, trigger: HiddenWeaponConfig['triggerCondition'],
  action: { hp: number; targetHp: number; attack: number; level: number; effects: readonly ActiveEffect[]; round: number; rng: () => number },
  events: BattleEventDTO[],
) {
  const { hp, targetHp, effects, round, rng } = action
  if (hp <= 0 || targetHp <= 0 || blockingActionStatus(owner, round) || hasStatus(owner, 'DISARM', round)) return targetHp
  const weapon = owner.weapons.find((item) => item.triggerCondition === trigger && !owner.usedWeapons?.has(item.id))
  if (!weapon || (weapon.triggerCondition === 'SELF_HP_LOW' && hp * 100 >= owner.unit.maxHp * weapon.belowHpPercent)) return targetHp
  const used = owner.usedWeapons ??= new Set()
  used.add(weapon.id)
  const slot = owner.unit.slot
  const source = { sourceId: weapon.id, sourceName: weapon.name, slot }
  const attack = hiddenWeaponDamage(action.attack * (100 - statusPercent(owner, 'ATTACK_DOWN', round)) / 100, effects)
  const protection = target.playerGuard && effectsDuringAction(target.playerGuard.effects, target, round)
  const arrow = weapon.triggerCondition === 'ROUND_THREE'
  const trueDamage = weapon.triggerCondition === 'ENEMY_ULT_READY'
  events.push({
    round, type: 'EFFECT', actorSlot: slot, targetSlot: target.unit.slot, effectSourceId: weapon.id,
    segments: [{ type: 'tag', text: weapon.name, tone: 'purple' }, { type: 'text', text: weapon.castNarrative }],
  })
  if (arrow && target.shield > 0) {
    const spent = target.shield
    target.shield = 0
    delete target.timedShield
    events.push({
      round, type: 'EFFECT', actorSlot: slot, targetSlot: target.unit.slot, effectSourceId: weapon.id, shieldDelta: -spent,
      statusRemoved: '护盾', segments: [{ type: 'tag', text: `燕尾利箭 · 击碎护盾 ${spent.toLocaleString()} 点`, tone: 'gold' }],
    })
  }
  if (weapon.triggerCondition === 'SELF_HP_LOW') {
    applyBattleStatus(source, weapon.status, slot, target, { hp: targetHp, effects: protection }, round, rng, events)
    applyPeriodicOnHit(source, target, targetHp, weapon.bleed, { round, attack, rng, protection, effects }, events)
    return targetHp
  }
  const amount = Math.round(attack * weapon.attackPercent / 100 * (arrow ? 1.55 : 1))
  const piercing: SkillConfig = {
    id: weapon.id, name: weapon.name, source: weapon.source, slot: 'OUTER', tier: weapon.tier, powerRatio: 1,
    desc: weapon.effectDesc, castNarrative: weapon.castNarrative, battleEffects: [{ kind: 'ARMOR_PENETRATION', percent: 100 }],
  }
  const bonuses = effects.filter((effect) => effect.kind === 'TARGET_TRAIT_DAMAGE' || effect.kind === 'TARGET_STANCE_DAMAGE' || effect.kind === 'POISON_BLEED_DAMAGE')
  const hit = trueDamage ? resolveTrueDamage(amount, target, targetHp, bonuses)
    : resolveAttackDamage(amount, target, targetHp, action.level, piercing, bonuses, undefined, 0, round, undefined,
      target.playerGuard ? { stance: owner.stance ?? 'FIERCE', critical: arrow, rng, events, combat: owner.combat } : undefined)
  const remaining = applyBonusDamage(source, hit, target, {
    actorSlot: slot, targetHp, round, label: arrow ? '必暴破甲' : trueDamage ? '截断怒气' : '先手破甲',
    category: trueDamage ? 'true' : 'phys', critical: arrow || undefined,
  }, events)
  if (remaining > 0 && trueDamage) {
    const removed = Math.min(weapon.rageLoss, target.rage ?? target.unit.rage)
    target.rage = (target.rage ?? target.unit.rage) - removed
    events.push({
      round, type: 'EFFECT', actorSlot: slot, targetSlot: target.unit.slot, rageTargetSlot: target.unit.slot,
      rageDelta: -removed, effectSourceId: weapon.id, segments: [{ type: 'tag', text: `${target.unit.name} · 怒气 −${removed}`, tone: 'gold' }],
    })
    breakCharge(target, source, round, events)
  } else if (weapon.triggerCondition === 'BATTLE_START') {
    applyBattleStatus(source, weapon.status, slot, target, { hp: remaining, effects: protection }, round, rng, events)
  }
  return remaining
}

function protectsPointCast(skill: SkillConfig | undefined) {
  return !!skill?.battleEffects?.some((effect) => effect.kind === 'POINT_CAST_IMMUNITY')
}

function targetsRearWithWeapon(effects: readonly ActiveEffect[], extra?: ExtraAttackSource) {
  return !extra?.front && !extra?.gearSkill && extra?.powerRatio === undefined && extra?.trueAtkPercent === undefined &&
    effects.some((effect) => effect.kind === 'REAR_OUTER_TARGET')
}

function weaponUsableSkill(skill: SkillConfig | undefined, weaponLimited: boolean) {
  return weaponLimited && isWeaponForm(skill?.combatForm) ? undefined : skill
}

function battleWeapon(item?: (typeof ITEMS)[string]) {
  return item?.combatForm && isWeaponForm(item.combatForm) ? { form: item.combatForm, tier: item.tier } : undefined
}

function weaponEffects(effects: readonly ActiveEffect[], weaponId: string | null | undefined, disarmed: boolean) {
  return disarmed && weaponId ? effects.filter((effect) => effect.sourceId !== weaponId) : effects
}

function startPlayerAction(
  actor: StatusTarget, ultimate: SkillConfig | undefined, effects: readonly ActiveEffect[], ready: boolean,
  round: number, events: BattleEventDTO[],
) {
  const ignorePointStun = ready && protectsPointCast(ultimate) && !hasStatus(actor, 'ULT_LOCK', round) &&
    !actor.chargedUlt && !effects.some((effect) => effect.kind === 'CHARGED_ULT')
  return startControlledAction(actor, round, events, { ignorePointStun })
}

function chooseUltimate(
  actor: StatusTarget, ordinary: SkillConfig | undefined, effects: readonly ActiveEffect[], ready: boolean,
  round: number, events: BattleEventDTO[],
): SkillConfig | undefined | null {
  const unlocked = ready && !hasStatus(actor, 'ULT_LOCK', round)
  const canCharge = unlocked && !hasStatus(actor, 'SEAL', round)
  if (actor.chargedUlt) {
    const charge = endUltCharge(actor, round, events, !canCharge)
    return canCharge && charge ? {
      id: CHARGED_ULT_ID, name: charge.moveName, slot: 'ULT', tier: 'orange', source: charge.sourceName, powerRatio: charge.powerRatio,
      desc: '蓄力后全力扑击，穿透全部护体防御。', castNarrative: '蛤蟆蓄力已成，纵身扑向敌方核心！',
      battleEffects: [{ kind: 'ARMOR_PENETRATION', percent: 100 }],
    } : undefined
  }
  const charge = effects.find((effect) => effect.kind === 'CHARGED_ULT')
  if (charge && canCharge) {
    actor.chargedUlt = charge
    events.push({
      round, type: 'EFFECT', actorSlot: actor.unit.slot, targetSlot: actor.unit.slot, effectSourceId: charge.sourceId,
      statusApplied: '蓄力', statusRounds: 1,
      segments: [{ type: 'tag', tone: 'gold', text: `${charge.moveName} · 蓄力 1 回合` }],
    })
    return null
  }
  return unlocked && !charge ? ordinary : undefined
}

function woundedSteps(unit: CombatUnitDTO, hp: number, effect: Extract<ActiveEffect, { kind: 'WOUNDED_DAMAGE' }>) {
  if ('belowHpPercent' in effect) return Number(hp * 100 < unit.maxHp * effect.belowHpPercent)
  return Math.max(0, Math.floor((unit.maxHp - hp) * 100 / (unit.maxHp * effect.hpStepPercent)))
}

function enemyTechniqueOnHit(
  enemy: EnemyBattleState, skill: SkillConfig | undefined, attack: number, enemyHp: number, defender: StatusTarget, hp: number, parried: boolean,
  effects: readonly ActiveEffect[], round: number, rng: () => number, events: BattleEventDTO[],
) {
  if (!skill) return
  const source = { sourceId: skill.id, sourceName: skill.name, slot: enemy.unit.slot, unitId: enemy.unit.id }
  for (const effect of skill.battleEffects ?? []) {
    if (effect.kind === 'ON_HIT_STATUS' && 'rule' in effect) applyBattleStatus(source, effect.rule, enemy.unit.slot, defender, { hp, effects }, round, rng, events)
    if (effect.kind === 'PERIODIC_ON_HIT') applyPeriodicOnHit(source, defender, hp, effect.rule, { attack, round, rng, protection: effects }, events)
  }
  const rend = skill.battleEffects?.find((effect) => effect.kind === 'SHIELD_REND')
  if (!rend) return
  applyPeriodicOnHit(source, defender, hp, {
    status: 'bleed', attackPercent: rend.bleedAttackPercent, rounds: rend.bleedRounds,
  }, { attack, round, rng, protection: effects }, events)
  if (parried && defender.stance === 'TAICHI') {
    applyBattleStatus({ sourceId: 'taichi_counter', sourceName: '太极反拧' }, {
      status: 'ATTACK_DOWN', percent: 25, rounds: 1, nextRound: true,
    }, defender.unit.slot, enemy, { hp: enemyHp }, round, rng, events)
  }
}

function incomingStrikePower(
  defender: StanceType, attacker: StanceType | undefined, multiplier: number, power: number, attack: number, defense: number, level: number,
  effects: readonly ActiveEffect[], pressure = 1,
) {
  const reverse = attacker && stanceRelation(defender, attacker) === 'LOSE'
    ? effects.find((effect) => effect.kind === 'REVERSE_STANCE_DEFENSE') : undefined
  const segments: RichSegment[] = []
  const damageAt = (factor: number) => incomingDamage(attack, (reverse ? 0.82 : multiplier) * power * factor, defense, level)
  const reducedPressure = reduceInnerPressure(pressure, effects, damageAt, segments, '盾前减伤')
  const damage = damageAt(reducedPressure)
  if (reducedPressure > 1) {
    segments.push({ type: 'tag', text: `内力优势 +${Math.round((reducedPressure - 1) * 100)}% 伤害`, tone: 'gold' })
  }
  const prevented = reverse ? incomingDamage(attack, 1.22 * power * pressure, defense, level) - damageAt(pressure) : 0
  if (reverse && prevented > 0) {
    segments.unshift({ type: 'tag', text: `${reverse.sourceName} · 反转克制 · 盾前减伤 ${prevented.toLocaleString()}`, tone: 'jade' })
  }
  return { damage, segments }
}

function enemyContact(enemy: EnemyBattleState, skill: SkillConfig | undefined, multiplier: number, round: number, forced: boolean) {
  const weaponSuppressed = !forced && hasStatus(enemy, 'DISARM', round)
  const disarmed = weaponSuppressed && multiplier === 1 && !skill
  const attackForm = skill?.combatForm ?? enemy.combat?.weapon?.form
  const form = multiplier === 1 && !disarmed ? attackForm : undefined
  const outer = !skill || skill.slot === 'OUTER'
  const ranged = !disarmed && (attackForm === 'PROJECTILE' || attackForm === 'BOW' || attackForm === 'SOUND' ||
    (!skill?.combatForm && enemy.combat?.range === 'RANGED'))
  const element = forced ? undefined : multiplier === 1 ? skill?.element : enemy.combat?.charge?.element
  return { disarmed, weaponSuppressed, form, outer, ranged, element }
}

function lightCounterPenalty(enemy: EnemyBattleState, skill: SkillConfig | undefined, lightSkill: SkillConfig | undefined) {
  const move = enemy.combat?.rageMove
  return move && skill?.id === move.id && lightSkill?.slot === 'LIGHT' ? move.lightHitPenalty ?? 0 : 0
}

function isFemaleCombatant(fighter: StatusTarget) {
  return fighter.unit.isPlayer ? fighter.unit.avatarId === 'hero_sword'
    : !!(fighter.combat?.female || COMPANIONS[fighter.unit.id]?.female)
}

function conditionalDefense(effects: readonly ActiveEffect[], attacker: StatusTarget) {
  return isFemaleCombatant(attacker) ? effects.find((effect) => effect.kind === 'FEMALE_ATTACKER_DEFENSE') : undefined
}

function dodgeAgainst(
  target: StatusTarget, dodge: number, cap: number, round: number, effect: ReturnType<typeof conditionalDefense>,
) {
  const base = battleDodge(target, dodge, round)
  if (!effect) return { chance: base }
  const bonus = Math.max(0, Math.min(effect.dodgePoints, cap - dodge - statusPercent(target, 'DODGE_UP', round)))
  const chance = battleDodge(target, dodge + bonus, round)
  const gained = Number((chance - base).toFixed(2))
  return { chance, segment: gained > 0 ? {
    type: 'tag', text: `${effect.sourceName} · 闪避率 +${gained} 个百分点`, tone: 'jade',
  } as const : undefined }
}

function parryIncoming(
  stats: { parry: number; parryAbsorb: number }, formationPoints: number, roll: number,
  contact: { form?: AttackForm; outer: boolean; ranged: boolean }, effects: readonly ActiveEffect[], rng: () => number,
  conditional?: ReturnType<typeof conditionalDefense>,
) {
  const bladeCatch = contact.form === 'BLADE' ? effects.find((effect) => effect.kind === 'BLADE_CATCH') : undefined
  const extraPoints = (bladeCatch?.parryPoints ?? 0) + (contact.ranged ? 0 : effects.reduce((sum, effect) =>
    effect.kind === 'MELEE_PARRY' ? sum + effect.points : sum, 0))
  const baseChance = (stats.parry || (extraPoints || conditional ? BASE_PARRY_CHANCE : 0)) + formationPoints + extraPoints
  const chance = Math.min(100, baseChance + (conditional?.parryPoints ?? 0))
  const caught = bladeCatch && contact.outer && rng() < bladeCatch.chancePercent / 100 ? bladeCatch : undefined
  const absolute = !caught && roll >= chance ? rollAbsoluteDefense(effects, 'ABSOLUTE_PARRY', rng) : undefined
  const parried = !!caught || !!absolute || roll < chance
  const segments: RichSegment[] = []
  if (conditional && chance > baseChance) {
    segments.push({ type: 'tag', text: `${conditional.sourceName} · 招架率 +${chance - baseChance} 个百分点`, tone: 'jade' })
  }
  if (caught) segments.push({ type: 'tag', text: `${caught.sourceName} · 空手夺白刃`, tone: 'jade' })
  if (absolute) segments.push({ type: 'tag', text: `${absolute.sourceName} · 绝对格挡`, tone: 'jade' })
  return { parried, absorb: caught ? 100 : parried ? stats.parryAbsorb : 0, caught, segments }
}

function spendParryMp(fighter: StatusTarget, mp: number, parry: ReturnType<typeof parryIncoming>, damage: number,
  effects: readonly ActiveEffect[], round: number, events: BattleEventDTO[]) {
  if (parry.caught || mp <= 0 || Math.round(damage * (100 - parry.absorb) / 100) >= damage) return mp
  const base = 10
  const discount = !hasStatus(fighter, 'DISARM', round) && effects.find((effect) => effect.kind === 'PARRY_MP_DISCOUNT')
  const spent = Math.min(mp, discount ? Math.round(base * (100 - discount.percent) / 100) : base)
  const saved = Math.min(mp, base) - spent
  const { slot } = fighter.unit
  events.push({
    round, type: 'EFFECT', actorSlot: slot, targetSlot: slot, mpDelta: -spent, effectSourceId: discount ? discount.sourceId : undefined,
    segments: [{ type: 'tag', text: `招架 · 内力 −${spent}`, tone: 'jade' },
      ...(saved > 0 && discount ? [{ type: 'tag', text: `${discount.sourceName} · 节省 ${saved} 点内力`, tone: 'gold' } as const] : [])],
  })
  return mp - spent
}

function finishBladeCatch(
  effect: Extract<ActiveEffect, { kind: 'BLADE_CATCH' }>, unit: CombatUnitDTO, enemy: EnemyBattleState, hp: number, blocked: number,
  round: number, effects: readonly ActiveEffect[], rng: () => number, events: BattleEventDTO[],
) {
  const reflected = resolveTrueDamage(Math.round(blocked * effect.reflectPercent / 100), enemy, hp, effects)
  const remaining = applyBonusDamage(effect, reflected, enemy, { actorSlot: unit.slot, targetHp: hp, round, label: '擒刃反震', category: 'reflect' }, events)
  applyBattleStatus(effect, { status: 'ATTACK_DOWN', percent: effect.attackDownPercent, rounds: 1, nextRound: true },
    unit.slot, enemy, { hp: remaining }, round, rng, events)
  return remaining
}

function exploitStrikeWeakness(
  enemy: EnemyBattleState, hp: number, unit: CombatUnitDTO, actual: Parameters<typeof matchesStrike>[1], round: number,
  rng: () => number, events: BattleEventDTO[],
) {
  const rule = enemy.combat?.strikeWeakness
  if (!rule || hp <= 0 || !rule.matches.some((entry) => matchesStrike(entry, actual))) return
  const required = rule.hits ?? 1
  if (required > 1) {
    if ((enemy.weaknessHits ?? 0) >= required) return
    enemy.weaknessHits = (enemy.weaknessHits ?? 0) + 1
    events.push({
      round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: enemy.unit.slot, effectSourceId: enemy.unit.id, statusStacks: enemy.weaknessHits,
      segments: [{ type: 'tag', text: `${enemy.unit.name} · ${rule.name} ${enemy.weaknessHits}/${required}`, tone: 'jade' }],
    })
    if (enemy.weaknessHits < required) return
  }
  if (rule.breakDefense && !enemy.defenseBroken) {
    enemy.defenseBroken = true
    events.push({
      round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: enemy.unit.slot, effectSourceId: enemy.unit.id, statusApplied: rule.name,
      segments: [{ type: 'tag', text: `${enemy.unit.name} · ${rule.name} · 护体防御归零`, tone: 'jade' }],
    })
  }
  if (rule.status) applyBattleStatus({ sourceId: enemy.unit.id, sourceName: rule.name }, rule.status, unit.slot, enemy, { hp }, round, rng, events)
}

function performStrike(
  unit: CombatUnitDTO, target: EnemyBattleState,
  strike: {
    round: number; targetHp: number; attackerHp: number; attackerLevel: number; attackerAtk: number; attackerDef: number;
    power: number; stance: StanceType; form?: AttackForm; stanceMultiplier: number; pressure: number; showPressure?: true;
    skill?: SkillConfig; critPercent: number; critRoll: number; isUlt: boolean; rageDelta?: number; mpDelta?: number; enraged: boolean;
    extra?: ExtraAttackSource; areaHit?: boolean; weaponId?: string | null; dodgeState: DodgeEffectState; actor: StatusTarget & { hp?: number }; rng: () => number;
    trueStrike?: TrueStrike; guardedPosition?: boolean; counterSource?: ActiveEffect; hasLightSkill?: boolean;
    companion?: { sourceId: string; tag: string; moveName: string };
    schoolMember?: MartialSchoolMember;
    huashan?: true;
    shareDamage?: (damage: number, preview: boolean) => { damage: number; segments: RichSegment[] };
    redirectDamage?: (damage: number) => number;
  },
  effects: readonly ActiveEffect[], events: BattleEventDTO[],
) {
  const { round, targetHp, attackerLevel, stanceMultiplier, pressure, enraged, extra } = strike
  const guard = target.playerGuard
  const attackerHpNow = () => guard ? strike.actor.hp ?? strike.attackerHp : strike.attackerHp
  const protection = guard ? effectsDuringAction(guard.effects, target, round) : []
  const attackerIsAlly = unit.slot.startsWith('ALLY')
  const targetIsAlly = target.unit.slot.startsWith('ALLY')
  const attackScale = 100 - statusPercent(strike.actor, 'ATTACK_DOWN', round)
  const furies = activeFuries(strike.actor, round)
  const trueAtkPercent = extra?.trueAtkPercent
  const trueAttack = trueAtkPercent !== undefined
  const trueStrike = (!trueAttack && !extra?.hiddenWeapon && teamTrueStrike(effects)) || strike.trueStrike
  const storedEffect = strike.isUlt && !extra && !strike.areaHit ? storedDamageEffect(effects) : undefined
  const stored = storedEffect ? strike.actor.storedDamage ?? 0 : 0
  if (stored > 0) delete strike.actor.storedDamage
  const skill = trueAttack || extra?.powerRatio !== undefined ? undefined : strike.skill
  const freedom = effects.some((effect) => effect.kind === 'MARTIAL_FREEDOM')
  const effectiveness = skill && !extra?.gearSkill ? martialEffectiveness(skill, strike.schoolMember, freedom) : 100
  const power = (extra?.powerRatio ?? strike.power) * (effectiveness / 100)
  const outer = !trueAttack && !strike.isUlt && (!skill || skill.slot === 'OUTER')
  const regularOuter = outer && !extra
  const fierce = strike.huashan && strike.stance === 'FIERCE' && outer
  const technique = skill ?? (regularOuter ? BARE_HANDS : undefined)
  const form = strike.form ?? (technique?.id === BARE_HANDS.id
    ? (strike.weaponId ? ITEMS[strike.weaponId]?.combatForm : undefined) ?? technique.combatForm : technique?.combatForm)
  const actual = technique && {
    form, skillId: technique.id, tradition: technique.tradition, stance: strike.stance,
    pointStrike: technique.pointStrike ?? (strike.form === 'FINGER' ? true : undefined), lightSkill: strike.hasLightSkill,
  }
  const guardBypasses = actual ? effects.filter((effect): effect is Extract<ActiveEffect, { kind: 'GUARD_BYPASS' }> =>
    effect.kind === 'GUARD_BYPASS' && matchesStrike(effect, actual),
  ) : []
  const splashEffect = actual && !strike.areaHit && (!trueStrike || trueStrike.team) && !extra?.gearSkill
    ? effects.find((effect): effect is Extract<ActiveEffect, { kind: 'STRIKE_SPLASH' }> =>
      effect.kind === 'STRIKE_SPLASH' && matchesStrike(effect, actual),
    ) : undefined
  const splashFrom = (damage: number) => splashEffect
    ? { source: splashEffect, damage: Math.round(damage * splashEffect.percent / 100), trueStrike: trueStrike || undefined } : undefined
  const onHit = trueAttack ? [] : effects.filter((effect) => effect.kind === 'ON_HIT_STATUS').filter((effect) =>
    (effect.sourceType === 'EQUIPMENT' || effect.sourceType === 'TITLE' || effect.sourceId === skill?.id) &&
    (!effect.regularOuterOnly || regularOuter) && (!effect.skillIds || (!!skill && effect.skillIds.includes(skill.id))) &&
    (!effect.matches || (!!actual && matchesStrike(effect.matches, actual))) &&
    (!effect.attackerStance || effect.attackerStance === strike.stance) &&
    (!effect.attack || (effect.attack === 'ULT' ? strike.isUlt : outer)),
  )
  const skillName = strike.companion?.moveName ?? extra?.moveName ?? skill?.name ?? '平掌'
  const move: RichSegment = skill && !extra?.gearSkill
    ? { type: 'skill', id: skill.id, name: `《${skillName}》`, tier: skill.tier }
    : { type: 'text', text: skillName }
  const cast = {
    round, actorSlot: unit.slot, targetSlot: target.unit.slot,
    skillId: extra?.gearSkill ? undefined : skill?.id, skillName: strike.areaHit ? undefined : skillName,
    skillTier: extra?.gearSkill ? undefined : skill?.tier, isUlt: strike.areaHit ? undefined : strike.isUlt,
    rageDelta: extra ? undefined : strike.rageDelta, mpDelta: extra ? undefined : strike.mpDelta,
    effectSourceId: strike.counterSource?.sourceId ?? strike.companion?.sourceId ?? extra?.sourceId,
  }
  const actionType = strike.companion ? 'ASSIST_ATTACK' : strike.areaHit ? 'EFFECT' : 'SKILL_CAST'
  const assistTag: RichSegment[] = strike.companion ? [{ type: 'tag', text: strike.companion.tag, tone: 'purple' }] : []
  if (strike.counterSource) assistTag.push({ type: 'tag', text: `${strike.counterSource.sourceName} · 决死一击`, tone: 'red' })
  const costTags: RichSegment[] = cast.mpDelta ? [{ type: 'tag', text: `内力 -${(-cast.mpDelta).toLocaleString()}`, tone: 'gold' }] : []
  if (effectiveness < 100) costTags.push({ type: 'tag', text: `真气冲突 · 本招威力 ${effectiveness}%`, tone: 'red' })
  const rearTargeting = outer && targetsRearWithWeapon(effects, extra) && effects.find((effect) => effect.kind === 'REAR_OUTER_TARGET')
  if (rearTargeting && (target.unit.slot.endsWith('_RIGHT') || target.unit.slot === 'ENEMY_REAR')) {
    costTags.push({ type: 'tag', text: `${rearTargeting.sourceName} · 索命盘绕 · 后排`, tone: 'purple' })
  }
  if (strike.isUlt && skill && cast.rageDelta !== undefined) {
    const { cost, discount } = ultRageCost(skill, effects)
    if (discount) costTags.push({
      type: 'tag', text: `${discount.sourceName} · 怒气 -${cost}（节省 ${ULT_RAGE_SPEND - cost}）`, tone: 'gold',
    })
    if (protectsPointCast(skill) && (hasStatus(strike.actor, 'SEAL', round) || hasStatus(strike.actor, 'STUN', round))) {
      costTags.push({ type: 'tag', text: `${skill.name} · 经脉逆行，免疫本次点穴控制`, tone: 'jade' })
    }
  }
  if (actual && !extra && !strike.areaHit && !strike.counterSource && (!strike.companion || strike.rageDelta !== undefined)) {
    const effect = effects.find((candidate) => candidate.kind === 'REVERSE_BUFF')
    if (effect) reverseEnemyBuffs(strike.actor, target, effect, round, strike.rng, events)
  }
  const reversal = activeReversal(strike.actor, round)
  const opponentDefense = guard && conditionalDefense(protection, strike.actor)
  const dodgeDisabled = (guard && enraged) || onHit.some((effect) => effect.unavoidable)
  const escape = guard && !enraged && !trueAttack ? escapeFromAttack(target, round) : undefined
  const targetEvasion = dodgeDisabled ? { chance: 0 } :
    dodgeAgainst(target, guard?.dodge ?? target.combat?.dodge ?? 0, guard?.dodgeCap ?? DEFAULT_DODGE_CAP, round, opponentDefense)
  const fullDodge = targetEvasion.chance
  const lightDodge = Math.min(fullDodge, battleDodge(target, guard?.lightDodge ?? target.combat?.lightDodge ?? 0, round))
  const dodgePenetration = effects.find((effect) => effect.kind === 'LIGHT_DODGE_PENETRATION')
  const ignoredDodge = dodgePenetration ? lightDodge * dodgePenetration.percent / 100 : 0
  const targetDodge = fullDodge - ignoredDodge
  const night = strike.actor.environment?.night
  const nightVision = night && effects.find((effect) => effect.kind === 'NIGHT_VISION')
  const nightPenalty = night && !nightVision ? NIGHT_HIT_PENALTY : 0
  const concealment = !trueAttack && round === 1 ? target.combat?.openingConcealment ?? 0 : 0
  const detection = concealment > 0 ? effects.find((effect) => effect.kind === 'CONCEALMENT_REDUCTION') : undefined
  const revealed = Math.min(concealment, detection?.points ?? 0)
  const concealmentPenalty = concealment - revealed
  const hitPenalty = statusPercent(strike.actor, 'HIT_DOWN', round) + nightPenalty + concealmentPenalty
  const accuracy = Math.min(targetDodge + hitPenalty,
    effects.reduce((sum, effect) => sum + (effect.kind === 'STAT_BONUS' ? effect.stats.hit ?? 0 : 0), 0))
  const accuracyTag: RichSegment[] = !trueAttack && accuracy > 0
    ? [{ type: 'tag', text: `命中修正 +${Number(accuracy.toFixed(2))} 个百分点`, tone: 'gold' }] : []
  if (!trueAttack && !escape && targetEvasion.segment) accuracyTag.push(targetEvasion.segment)
  const effectiveConcealment = Math.min(concealmentPenalty, Math.max(0, hitPenalty - accuracy))
  if (effectiveConcealment > 0) accuracyTag.push({
    type: 'tag', text: `隐蔽 · 命中 −${Number(effectiveConcealment.toFixed(2))} 个百分点`, tone: 'gold',
  })
  if (revealed > 0 && detection) accuracyTag.push({
    type: 'tag', text: `${detection.sourceName} · 反隐蔽抵消 ${revealed} 个百分点`, tone: 'jade',
  })
  if (!trueAttack && night) {
    const actualPenalty = Math.min(nightPenalty, Math.max(0, hitPenalty - accuracy - effectiveConcealment))
    if (nightVision) accuracyTag.push({ type: 'tag', text: `${nightVision.sourceName} · 免除夜战命中惩罚`, tone: 'jade' })
    if (actualPenalty > 0) accuracyTag.push({ type: 'tag', text: `夜色 · 命中 −${Number(actualPenalty.toFixed(2))} 个百分点`, tone: 'gold' })
  }
  if (!trueAttack && dodgePenetration && ignoredDodge > 0) accuracyTag.push({
    type: 'tag', text: `${dodgePenetration.sourceName} · 忽略 ${Number(ignoredDodge.toFixed(2))} 个百分点轻功闪避`, tone: 'gold',
  })
  const rolledAvoidance = !trueAttack && strikeAvoidance(
    (strike.critRoll + 61) % 100, Math.max(0, targetDodge - Math.max(0, accuracy - hitPenalty)), Math.max(0, hitPenalty - accuracy),
  )
  const absolute = guard && !enraged && !trueAttack && !rolledAvoidance && !escape
    ? rollAbsoluteDefense(protection, 'ABSOLUTE_DODGE', strike.rng) : undefined
  const avoidance = escape || absolute ? 'DODGE' : rolledAvoidance
  if (avoidance) {
    const storageTag: RichSegment[] = storedEffect && stored > 0
      ? [{ type: 'tag', text: `${storedEffect.sourceName} · ${stored.toLocaleString()} 点储劲落空`, tone: 'jade' }] : []
    events.push({
      ...cast, type: avoidance === 'DODGE' ? 'DODGE' : actionType, hitResult: avoidance, hpDelta: 0,
      segments: [
        ...assistTag,
        { type: 'actor', name: unit.name, isAlly: attackerIsAlly, isPlayer: unit.isPlayer }, { type: 'text', text: '使出' }, move,
        { type: 'text', text: avoidance === 'DODGE' ? `，被${target.unit.name}闪开。` : '，招式落空。' },
        ...(escape || absolute ? [{ type: 'tag', text: `${(escape ?? absolute)!.sourceName} · ${escape ? '灵狐遁逃' : '绝对闪避'}`, tone: 'jade' } as const] : []),
        ...accuracyTag, ...costTags, ...storageTag,
      ],
    })
    const wounded = effects.reduce((percent, effect) => effect.kind === 'WOUNDED_DAMAGE'
      ? percent + woundedSteps(unit, strike.attackerHp, effect) * effect.attackPercent : percent,
    100 + furies.reduce((total, effect) => total + effect.attackPercent, 0) + (reversal?.attackPercent ?? 0))
    const attackerAtk = Math.round(strike.attackerAtk * wounded / 100 * attackScale / 100)
    const counter = avoidance === 'DODGE' ? effects.find((effect) => effect.kind === 'ON_DODGED_STRIKE') : undefined
    let remaining = targetHp
    if (counter) {
      const attack = counter.hiddenWeapon ? hiddenWeaponDamage(attackerAtk, effects) : attackerAtk
      const amount = Math.round(attack * counter.attackPercent / 100)
      const targetBonuses = effects.filter((effect) => effect.kind === 'TARGET_STANCE_DAMAGE' || effect.kind === 'POISON_BLEED_DAMAGE' || effect.kind === 'TARGET_TRAIT_DAMAGE')
      const absorb = (strike.critRoll + 47) % 100 < (target.combat?.parry ?? 0) ? BASE_PARRY_ABSORB : 0
      const hit = resolveAttackDamage(amount, target, targetHp, attackerLevel, undefined, targetBonuses, undefined, absorb, round)
      remaining = applyBonusDamage(counter, hit, target, { actorSlot: unit.slot, targetHp, round, label: counter.moveName, category: 'phys' }, events)
    }
    const swingBonus = splashEffect && actual ? effects.reduce((percent, effect) =>
      effect.kind === 'TECHNIQUE_DAMAGE' && matchesStrike(effect, actual) ? percent + effect.percent : percent, 100) : 100
    const splash = splashEffect
      ? splashFrom(Math.round(strikeDamage(attackerAtk, power, stanceMultiplier, pressure, false, round) *
        swingBonus / 100 * (extra?.damagePercent ?? 100) / 100))
      : undefined
    return { targetHp: remaining, attackerHp: attackerHpNow(), attackerAtk, critical: false, landed: false, ignoredDefense: 0, splash,
      dodged: avoidance === 'DODGE' }
  }
  const trueDamageEffects = effects.filter((effect) => effect.kind === 'OUTER_TRUE_DAMAGE' || effect.kind === 'WOUNDED_TRUE_DAMAGE')
    .filter((effect) => effect.kind === 'OUTER_TRUE_DAMAGE' ? regularOuter
      : !strike.areaHit && !!actual && matchesStrike(effect, actual))
  const shockEffect = !trueAttack && !extra?.gearSkill ? effects.find((effect) => effect.kind === 'STRIKE_PHYSICAL_DAMAGE') : undefined
  const shock = shockEffect && strike.attackerHp * 100 > unit.maxHp * shockEffect.aboveHpPercent ? shockEffect : undefined
  const opening = !trueAttack && round === 1 ? effects.find((effect) => effect.kind === 'OPENING_ASSASSINATION') : undefined
  const weaponCrit = actual && effects.find((effect) => effect.kind === 'GUARANTEED_CRIT' && matchesStrike(effect, actual))
  const furyCrit = furies.find((effect) => effect.guaranteedCrit)
  const guaranteedCrit = trueAttack ? undefined : strike.counterSource ?? strike.dodgeState.pendingCrit ?? opening ?? furyCrit ?? weaponCrit
  if (guaranteedCrit) delete strike.dodgeState.pendingCrit
  const openingSplit = opening && !trueStrike && !strike.actor.openingHitUsed ? opening : undefined
  if (openingSplit) strike.actor.openingHitUsed = true
  const splitEffect = openingSplit ?? (outer && !trueStrike && (!extra || extra.comboIndex !== undefined)
    ? effects.filter((effect) => effect.kind === 'OUTER_TRUE_CONVERSION')
      .filter((effect) => effect.anyOuter || effect.sourceType === 'EQUIPMENT' || effect.sourceId === skill?.id)
      .sort((a, b) => b.truePercent - a.truePercent)[0] : undefined)
  const ultCritBonus = !guaranteedCrit && strike.isUlt && skill?.slot === 'ULT' ? (skill.critBonus ?? 0) * effectiveness / 100 : 0
  const poisonCrit = !trueAttack && !guaranteedCrit && isPoisoned(target)
    ? effects.find((effect) => effect.kind === 'POISON_TARGET_CRIT')
    : undefined
  const baseCritPercent = Math.min(MAX_CRIT_PERCENT, Math.max(0, strike.critPercent - statusPercent(strike.actor, 'CRIT_DOWN', round)))
  const stanceCritPercent = Math.min(MAX_CRIT_PERCENT, baseCritPercent + (fierce && !guaranteedCrit ? HUASHAN_FIERCE.critPoints : 0))
  const wounded = !trueAttack && !guaranteedCrit ? effects.find((effect) => effect.kind === 'WOUNDED_DEFENSE_CRIT') : undefined
  const woundedCritPercent = Math.min(MAX_CRIT_PERCENT, stanceCritPercent + (wounded ? lostHpBonus(strike.attackerHp, unit.maxHp, wounded.critPoints) : 0))
  const ultCritPercent = Math.min(MAX_CRIT_PERCENT, woundedCritPercent + ultCritBonus)
  const poisonCount = poisonCrit?.perStack ? poisonStacks(target) : 1
  const poisonCritPercent = Math.min(MAX_CRIT_PERCENT, ultCritPercent + (poisonCrit?.points ?? 0) * poisonCount)
  const weakness = target.combat?.hitStreakWeakness
  const vulnerable = !trueAttack && !guaranteedCrit && weakness && (target.hitStreak?.count ?? 0) >= weakness.rounds ? weakness : undefined
  const critPercent = Math.min(MAX_CRIT_PERCENT, poisonCritPercent + (vulnerable?.critPoints ?? 0))
  const parryBypass = guardBypasses.find((effect) => effect.guard === 'PARRY')
  const targetParry = Math.min(100, (guard?.parry ?? target.combat?.parry ?? 0) + (target.formationParry ?? 0))
  const canParry = !trueAttack && !trueStrike && !extra?.noParry
  const ranged = form === 'BOW' || form === 'SOUND' || form === 'PROJECTILE'
  const playerParry = guard && canParry && !parryBypass
    ? parryIncoming(guard, target.formationParry ?? 0, (strike.critRoll + 47) % 100, { form, outer, ranged }, protection, strike.rng, opponentDefense) : undefined
  const wouldParry = canParry && (strike.critRoll + 47) % 100 < targetParry
  const parried = playerParry?.parried ?? (wouldParry && !parryBypass)
  const parryAbsorb = playerParry?.absorb ?? (parried ? BASE_PARRY_ABSORB : 0)
  const critical = !trueAttack && !playerParry?.caught && (!!guaranteedCrit || strike.critRoll < critPercent)
  const guardedCrit = critical && (target.shield > 0 || target.stance === 'TAICHI')
    ? effects.find((effect) => effect.kind === 'GUARDED_TARGET_CRIT_DAMAGE')
    : undefined
  const attacker = {
    hp: strike.attackerHp, maxHp: unit.maxHp, regularOuter, stance: outer ? strike.stance : undefined,
    outerForm: outer ? form : undefined,
    shieldBypass: guardBypasses.find((effect) => effect.guard === 'SHIELD') ?? (fierce ? { ...HUASHAN_FIERCE, label: '外功绕盾' } : undefined),
  }
  let attackPercent = 100
  let critDamagePercent = 100
  let critMultiplier = 1
  let comboDamagePercent = 100
  let ultimateDamagePercent = 100
  let situationalDamagePercent = 100
  let techniqueDamagePercent = 100
  let woundedDamageMultiplier = 1
  let effectivePressure = pressure
  const guardRolls: number[] = []
  const currentAttack = () => Math.round((extra?.hiddenWeapon ? hiddenWeaponDamage(strike.attackerAtk, effects) : strike.attackerAtk) *
    attackPercent / 100 * attackScale / 100)
  const hitAgainst = (recipient: EnemyBattleState, preview = false, pressureMultiplier = effectivePressure) => {
    if (trueAttack) {
      return { hit: resolveTrueDamage(Math.round(currentAttack() * trueAtkPercent / 100 * situationalDamagePercent / 100 * woundedDamageMultiplier), recipient, targetHp, effects) }
    }
    const amount = Math.round(strikeDamage(currentAttack(), power, stanceMultiplier, pressureMultiplier, critical, round, critDamagePercent * critMultiplier / 100)
      * (extra?.damagePercent ?? 100) / 100 * comboDamagePercent / 100 * ultimateDamagePercent / 100 * situationalDamagePercent / 100
      * techniqueDamagePercent / 100 * woundedDamageMultiplier)
    if (trueStrike) return { hit: resolveTrueDamage(amount, recipient, targetHp, effects, skill?.element), physicalBase: amount }
    const split = splitEffect ? Math.round(amount * splitEffect.truePercent / 100) : 0
    let rollIndex = 0
    const guardRng = () => {
      guardRolls[rollIndex] ??= strike.rng()
      return guardRolls[rollIndex++]
    }
    const hit = resolveAttackDamage(amount - split, recipient, targetHp, attackerLevel, skill, effects, attacker, parryAbsorb, round, skill?.element,
      guard ? { stance: strike.stance, critical, rng: guardRng, events, preview: preview ? true : undefined,
        combat: strike.actor.combat, shareDamage: strike.shareDamage, outer } : undefined)
    const piercing = split > 0 ? resolveTrueDamage(split, recipient, Math.max(0, targetHp - hit.damage), effects, skill?.element) : undefined
    return { hit, piercing, physicalBase: amount - split }
  }
  const damageBonuses: RichSegment[] = []
  const projectedDamage = (pressureMultiplier = effectivePressure) => {
    const result = hitAgainst({ ...target }, true, pressureMultiplier)
    return Math.min(targetHp, result.hit.damage) + (result.piercing?.damage ?? 0)
  }
  const recordBonus = (effect: ActiveEffect, label: string, apply: () => void) => {
    const before = projectedDamage()
    apply()
    const after = projectedDamage()
    damageBonuses.push({ type: 'tag', tone: 'gold', text: `${effect.sourceName} · ${label} · 增伤 +${(after - before).toLocaleString()}` })
  }
  for (const fury of furies) {
    recordBonus(fury, `${fury.statusName} · 攻击 +${fury.attackPercent}%`, () => { attackPercent += fury.attackPercent })
  }
  if (reversal) recordBonus(reversal, `逆脉狂暴 · 攻击 +${reversal.attackPercent}%`, () => { attackPercent += reversal.attackPercent })
  for (const effect of effects) {
    if (effect.kind === 'WOUNDED_DAMAGE') {
      const steps = woundedSteps(unit, strike.attackerHp, effect)
      if (steps <= 0) continue
      const attackBonus = steps * effect.attackPercent
      const critBonus = critical ? steps * effect.critDamagePercent : 0
      const label = effect.damageMultiplier ? `濒死出招伤害 ×${effect.damageMultiplier}` : `攻击 +${attackBonus}%${critBonus ? `、暴击伤害 +${critBonus}%` : ''}`
      recordBonus(effect, label, () => {
        attackPercent += attackBonus
        critDamagePercent += critBonus
        woundedDamageMultiplier *= effect.damageMultiplier ?? 1
      })
    } else if (effect.kind === 'CRIT_DAMAGE' && critical) {
      recordBonus(effect, `暴击伤害 +${effect.percent}%`, () => { critDamagePercent += effect.percent })
    } else if (effect.kind === 'ULT_DAMAGE' && strike.isUlt) {
      recordBonus(effect, `绝技伤害 +${effect.percent}%`, () => { ultimateDamagePercent += effect.percent })
    } else if (effect.kind === 'GUARDED_POSITION_DAMAGE' && strike.guardedPosition) {
      recordBonus(effect, `后排与援护伤害 +${effect.percent}%`, () => { situationalDamagePercent += effect.percent })
    } else if (effect.kind === 'WATER_BATTLE_DAMAGE' && strike.actor.environment?.water) {
      recordBonus(effect, `水战伤害 +${effect.percent}%`, () => { situationalDamagePercent += effect.percent })
    } else if (effect.kind === 'TECHNIQUE_DAMAGE' && actual && matchesStrike(effect, actual)) {
      recordBonus(effect, `招式伤害 +${effect.percent}%`, () => { techniqueDamagePercent += effect.percent })
    } else if (effect.kind === 'INNER_PRESSURE_DAMAGE' && pressure > 1 && actual && matchesStrike(effect, actual)) {
      recordBonus(effect, `内力优势强化 +${effect.percent}%`, () => { effectivePressure += (pressure - 1) * effect.percent / 100 })
    } else if (effect.kind === 'OUTER_COMBO_DAMAGE' && outer && extra?.comboIndex) {
      const percent = effect.percent * (effect.perHit ? extra.comboIndex : 1)
      recordBonus(effect, `第 ${extra.comboIndex} 次连击 · 连击伤害 +${percent}%`, () => { comboDamagePercent += percent })
    }
  }
  if (guardedCrit) {
    recordBonus(guardedCrit, `暴击伤害 ×${guardedCrit.multiplier}`, () => { critMultiplier = guardedCrit.multiplier })
  }
  const medicine = strike.actor.medicineRound
  if (strike.isUlt && medicine?.round === round) {
    recordBonus({ ...medicine, kind: 'ULT_DAMAGE' }, `绝技威力 +${medicine.percent}%`, () => { ultimateDamagePercent += medicine.percent })
  }
  if (!trueAttack) effectivePressure = reduceInnerPressure(effectivePressure, protection, projectedDamage, damageBonuses, '盾后减伤')
  const attackerAtk = currentAttack()
  const { hit, piercing, physicalBase } = hitAgainst(target)
  const redirected = !trueAttack && !trueStrike && hit.uncappedDamage > 0 ? strike.redirectDamage?.(hit.uncappedDamage) ?? 0 : 0
  const directDamage = hit.uncappedDamage - redirected
  const fullyCovered = redirected > 0 && directDamage <= 0
  const beforeHit = guard && canCounterLethal(target, guard.saves, targetHp, directDamage, round)
    ? guard.beforeLethal?.(targetHp, round, unit.slot) ?? targetHp : targetHp
  const incoming = Math.min(beforeHit, directDamage)
  const saved = guard && resolveLethalSave(guard.saves, target, beforeHit, incoming, round)
  const damage = saved?.damage ?? incoming
  let hpAfterDirectHit = saved?.savedHp ?? beforeHit - damage
  const segments: RichSegment[] = [
    ...assistTag,
    { type: 'actor', name: unit.name, isAlly: attackerIsAlly, isPlayer: unit.isPlayer }, { type: 'text', text: '使出' }, move,
    { type: 'text', text: '击中' }, { type: 'actor', name: target.unit.name, isAlly: targetIsAlly, isPlayer: target.unit.isPlayer },
    { type: 'text', text: '，伤害 ' },
    { type: 'damage', value: damage, isCrit: critical, category: trueAttack || trueStrike ? 'true' : skill?.qiDamageRatio ? 'qi' : 'phys' },
    ...(playerParry?.segments ?? []), ...hit.segments, ...damageBonuses,
  ]
  if (extra) segments.unshift({
    type: 'tag', text: `${extra.sourceName} · ${extra.gearSkill ? '装备特技' : '追加出手'}${extra.damagePercent === undefined ? '' : ` · 原伤害 ${extra.damagePercent}%`}`, tone: 'purple',
  }, { type: 'text', text: ' ' })
  if (wouldParry && parryBypass) segments.push({ type: 'tag', text: `${parryBypass.sourceName} · 无视招架`, tone: 'gold' })
  if (trueStrike) segments.push({ type: 'tag', text: `${trueStrike.sourceName} · ${trueStrike.moveName} · 真伤 ${damage.toLocaleString()}`, tone: 'gold' })
  const rageBoost = !extra && effects.find((effect) => effect.kind === 'RAGE_GAIN_PERCENT')
  if (rageBoost && (strike.rageDelta ?? 0) > 0) {
    segments.push({ type: 'tag', text: `${rageBoost.sourceName} · 行动怒气 +${strike.rageDelta}`, tone: 'gold' })
  }
  if (guaranteedCrit) segments.push({ type: 'tag', text: `${guaranteedCrit.sourceName} · 本次必暴`, tone: 'gold' })
  if (strike.huashan && stanceMultiplier === 1.3) segments.push({ type: 'tag', text: `${STANCE_META[strike.stance].name} · 架势克制伤害 +30%`, tone: 'gold' })
  if (fierce && !guaranteedCrit) {
    segments.push({ type: 'tag', text: `${HUASHAN_FIERCE.sourceName} · 暴击率 +${stanceCritPercent - baseCritPercent} 个百分点（本次 ${critPercent}%）`, tone: 'gold' })
  }
  if (wounded && woundedCritPercent > stanceCritPercent) {
    segments.push({ type: 'tag', text: `${wounded.sourceName} · 暴击率 +${woundedCritPercent - stanceCritPercent} 个百分点（本次 ${critPercent}%）`, tone: 'gold' })
  }
  if (ultCritBonus) {
    segments.push({
      type: 'tag',
      text: `${skillName} · 暴击率 +${ultCritPercent - woundedCritPercent} 个百分点（本次 ${critPercent}%）`,
      tone: 'gold',
    })
  }
  if (poisonCrit) {
    segments.push({
      type: 'tag',
      text: `${poisonCrit.sourceName} · ${poisonCrit.perStack ? `毒伤 ${poisonCount} 层，` : ''}暴击率 +${poisonCritPercent - ultCritPercent} 个百分点（本次 ${critPercent}%）`,
      tone: 'gold',
    })
  }
  if (vulnerable) segments.push({ type: 'tag', text: `${vulnerable.name} · 暴击率 +${critPercent - poisonCritPercent} 个百分点（本次 ${critPercent}%）`, tone: 'gold' })
  if (!trueAttack && strike.showPressure && effectivePressure >= 1.15) {
    segments.push({ type: 'tag', text: `内力优势 +${Math.round((effectivePressure - 1) * 100)}% 伤害`, tone: 'gold' })
  }
  segments.push(...accuracyTag, ...costTags)
  events.push({
    ...cast, type: actionType,
    hitResult: parried ? 'PARRY' : critical ? 'CRIT' : 'HIT', hpDelta: damage > 0 ? -damage : 0,
    trueStrikeSourceId: trueStrike && trueStrike.team ? trueStrike.sourceId : undefined,
    ...hit.shieldEvent, segments,
  })
  if (playerParry?.parried && target.mp !== undefined) target.mp = spendParryMp(target, target.mp, playerParry, physicalBase ?? 0, protection, round, events)
  if (playerParry?.caught) return {
    targetHp, attackerHp: attackerHpNow(), attackerAtk, critical: false, landed: false, ignoredDefense: 0, hpLost: 0,
    parried, caught: playerParry.caught, rawDamage: physicalBase, ranged, contact: true,
  }
  reactToEnemyDamage(target, damage, hpAfterDirectHit, unit.slot, round, events)
  if (guard && beforeHit > 0 && incoming >= beforeHit) hpAfterDirectHit = guard.onLethal?.(saved || undefined, round, hpAfterDirectHit, unit.slot) ?? hpAfterDirectHit
  if (guard) triggerLowHpEffects(target, beforeHit, hpAfterDirectHit, protection, round, events)
  if (hit.poisonRecovery) guard?.recoverPoison?.(hpAfterDirectHit, hit.poisonRecovery, round)
  if (guard && !trueAttack && !trueStrike) hpAfterDirectHit = useCriticalHitPill(target, hpAfterDirectHit, critical, damage, protection, round, events)
  let remaining = strike.isUlt && !strike.counterSource && !extra
    ? finishDesperateStrike(skill, unit, target, hpAfterDirectHit, { hp: strike.attackerHp, attack: attackerAtk, damage, round }, events)
    : hpAfterDirectHit
  if (splitEffect && piercing) {
    const label = splitEffect.kind === 'OPENING_ASSASSINATION' ? '密室暗杀' : splitEffect.label
    remaining = applyBonusDamage(splitEffect, piercing, target, { actorSlot: unit.slot, targetHp: remaining, round, label, category: 'true' }, events)
  }
  if (storedEffect && stored > 0 && remaining > 0) {
    const conversion = trueStrike && trueStrike.team ? trueStrike : undefined
    const hit = conversion ? resolveTrueDamage(stored, target, remaining, []) :
      resolveAttackDamage(stored, target, remaining, attackerLevel, undefined, [], undefined, 0, round)
    remaining = applyBonusDamage(conversion ?? storedEffect, hit, target, { actorSlot: unit.slot, targetHp: remaining, round,
      label: conversion ? `${conversion.moveName} · 返还储劲` : '返还储劲', category: conversion ? 'true' : 'phys' }, events)
  }
  if (shock && remaining > 0) {
    const targetBonuses = effects.filter((effect) => effect.kind === 'TARGET_STANCE_DAMAGE' || effect.kind === 'POISON_BLEED_DAMAGE' || effect.kind === 'TARGET_TRAIT_DAMAGE')
    const amount = Math.round(unit.maxHp * shock.maxHpPercent / 100)
    const conversion = trueStrike && trueStrike.team ? trueStrike : undefined
    const bonus = conversion ? resolveTrueDamage(amount, target, remaining, targetBonuses) :
      resolveAttackDamage(amount, target, remaining, attackerLevel, undefined, targetBonuses, undefined, 0, round)
    remaining = applyBonusDamage(conversion ?? shock, bonus, target, {
      actorSlot: unit.slot, targetHp: remaining, round, label: conversion ? `${conversion.moveName} · 震荡` : '震荡', category: conversion ? 'true' : 'phys',
    }, events)
  }
  // 配装先收集单件效果，再收集套装效果。
  for (const effect of trueDamageEffects) {
    if (remaining <= 0) break
    const amount = effect.kind === 'WOUNDED_TRUE_DAMAGE'
      ? Math.round(attackerAtk * effect.attackPercent / 100 * (unit.maxHp - strike.attackerHp) / unit.maxHp)
      : 'amount' in effect ? effect.amount : Math.round(strike.attackerDef * effect.defensePercent / 100)
    if (amount <= 0) continue
    const bonus = resolveTrueDamage(amount, target, remaining, effects)
    remaining = applyBonusDamage(effect, bonus, target, {
      actorSlot: unit.slot, targetHp: remaining, round, label: effect.kind === 'WOUNDED_TRUE_DAMAGE' ? '重剑内劲' : '附带真伤', category: 'true',
    }, events)
  }
  const weakSpot = target.combat?.weakSpot
  if (regularOuter && target.weakSpotOpen && weakSpot && strike.weaponId === weakSpot.weaponId && target.shield === 0 && remaining > 0) {
    const source = { sourceId: weakSpot.weaponId, sourceName: ITEMS[weakSpot.weaponId]?.name ?? weakSpot.weaponId }
    const bonus = resolveTrueDamage(remaining, target, remaining, [])
    remaining = applyBonusDamage(source, bonus, target, {
      actorSlot: unit.slot, targetHp: remaining, round, label: `刺中${weakSpot.name}`, category: 'true',
    }, events)
  }
  if (!fullyCovered) {
    applyBleedOnHit(skill, target, { actorSlot: unit.slot, attackerAtk, targetHp: remaining, round }, effects, events)
    interruptEnemyCharge(skill, target, { actorSlot: unit.slot, targetHp: remaining, round, enraged }, events)
    if (regularOuter && !enraged && remaining > 0 && (target.chargedUlt || target.chargeState === 'CHARGING')) {
      const interrupt = effects.filter((effect) => effect.kind === 'OUTER_CHARGE_BREAK').find((effect) => effect.stance === strike.stance)
      if (interrupt && strike.rng() < interrupt.chancePercent / 100) {
        breakCharge(target, { ...interrupt, slot: unit.slot }, round, events)
      }
    }
  }
  recordEnemyHit(target, remaining, unit.slot, round, events)
  disruptEnemyHearing(target, skill, remaining, unit.slot, round, events)
  if (actual) exploitStrikeWeakness(target, remaining, unit, actual, round, strike.rng, events)
  if (target.palaceGuide && target.palaceGate?.opening && remaining > 0 && remaining < targetHp) {
    const gate = target.palaceGate.name
    target.defenseBroken = true
    events.push({
      round, type: 'EFFECT', actorSlot: target.palaceGuide, targetSlot: target.unit.slot, effectSourceId: 'nine_palace',
      statusRemoved: gate, statusApplied: '阵眼已破',
      segments: [{ type: 'tag', text: '九宫石阵 · 循生门命中中宫，阵势瓦解 · 防御归零', tone: 'jade' }],
    })
    delete target.palaceGate
    delete target.palaceGuide
  }
  const blast = target.combat?.deathBlast
  if (actual && blast && !target.displaced && matchesStrike(blast.pushAway, actual)) {
    target.displaced = true
    const source = { sourceId: target.unit.id, sourceName: '轻功击飞' }
    events.push({
      round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: target.unit.slot, effectSourceId: source.sourceId, statusApplied: '远离中军',
      segments: [{ type: 'tag', text: `${source.sourceName} · ${target.unit.name}被推离中军`, tone: 'jade' }],
    })
    applyBattleStatus(source, { status: 'KNOCKBACK', rounds: 1 }, unit.slot, target, { hp: remaining }, round, strike.rng, events)
  }
  for (const effect of fullyCovered ? [] : onHit) {
    if (remaining <= 0) break
    if ('rule' in effect) {
      applyBattleStatus(effect, effect.rule, unit.slot, target, { hp: remaining, effects: protection }, round, strike.rng, events)
    } else if (effect.chancePercent >= 100 || strike.rng() < effect.chancePercent / 100) {
      for (const rule of effect.rules) applyBattleStatus(effect, rule, unit.slot, target, { hp: remaining, effects: protection }, round, strike.rng, events)
    }
  }
  if (!trueAttack && !fullyCovered) {
    const hit = { round, attack: attackerAtk, rng: strike.rng, effects, outer, protection }
    for (const effect of effects) {
      if (effect.kind !== 'PERIODIC_ON_HIT' || (effect.regularOuterOnly && !regularOuter)) continue
      if (effect.attack && (effect.attack === 'ULT' ? !strike.isUlt : !outer)) continue
      if (!effect.sourceType && effect.sourceId !== skill?.id) continue
      if (effect.lastRound !== undefined && round > effect.lastRound) continue
      const venom = effect.sourceType === 'MEDICINE'
      if (venom && (!strike.weaponId || extra?.hiddenWeapon)) continue
      const applied = applyPeriodicOnHit({ ...effect, slot: unit.slot }, target, remaining, effect.rule, hit, events)
      if (venom && applied && !strike.actor.usedVenom) {
        strike.actor.usedVenom = true
        events[events.length - 1].medicineUsed = effect.sourceId
      }
    }
    if (extra?.periodic) applyPeriodicOnHit({ ...extra, slot: unit.slot }, target, remaining, extra.periodic, hit, events)
    if (extra?.status) applyBattleStatus(extra, extra.status, unit.slot, target, { hp: remaining, effects: protection }, round, strike.rng, events)
    remaining = resolvePoisonBurst(unit, target, remaining, effects, round, events, critical && !trueStrike)
  }
  const attackerHp = (outer || strike.isUlt) && !trueAttack && !trueStrike && !extra?.periodic && !strike.counterSource
    ? resolveAttackLifesteal(strike.actor, attackerHpNow(), damage, outer, effects, round, events)
    : attackerHpNow()
  return { targetHp: remaining, attackerHp, attackerAtk, critical, landed: true, ignoredDefense: hit.ignoredDefense, hpLost: damage,
    parried, rawDamage: physicalBase, ranged, contact: !trueAttack && !trueStrike && !fullyCovered,
    splash: physicalBase === undefined ? undefined : splashFrom(physicalBase) }
}

const DYING_STRIKE: SkillConfig = {
  id: 'dajin_last_strike', name: '决死一击', slot: 'ULT', tier: 'orange', source: '大金覆灭死士套装', powerRatio: 2,
  desc: '濒死反击。', castNarrative: '催尽气血，发出最后一击！',
}

function counterBeforeDeath(
  owner: {
    fighter: StatusTarget & { hp?: number }; hp: number; level: number; agi: number; stance: StanceType; skill?: SkillConfig; atk: number; def: number;
    effects: readonly ActiveEffect[]; learnedSkills?: Readonly<Record<string, number>>; dodgeState: DodgeEffectState;
    schoolMember?: MartialSchoolMember;
  },
  opponents: { enemy: EnemyBattleState; hp: number }[], attacker: EnemyBattleState | undefined,
  round: number, rng: () => number, events: BattleEventDTO[],
) {
  const { fighter, hp, level, agi, stance, effects } = owner
  const effect = effects.find((entry) => entry.kind === 'LETHAL_COUNTER')
  if (!effect || fighter.lethalCounterUsed) return
  const living = opponents.filter((opponent) => opponent.hp > 0)
  const first = living.find((opponent) => opponent.enemy === attacker) ?? living[0]
  if (!first) return
  fighter.lethalCounterUsed = true
  const skill = owner.skill ?? DYING_STRIKE
  const targets = skill.area === 'ENEMIES' ? [first, ...living.filter((opponent) => opponent !== first)] : [first]
  let damage = 0
  for (const opponent of targets) {
    const relation = stanceRelation(stance, opponent.enemy.stance ?? stance)
    const hit = performStrike(fighter.unit, opponent.enemy, {
      round, targetHp: opponent.hp, attackerHp: hp, attackerLevel: level, attackerAtk: owner.atk, attackerDef: owner.def,
      power: skillPowerAtMastery(skill, owner.learnedSkills?.[skill.id]), stance,
      stanceMultiplier: relation === 'WIN' ? 1.25 : relation === 'LOSE' ? 0.88 : 1,
      pressure: innerPressure(fighter.unit.maxMp, enemyInnerMp(opponent.enemy)), skill,
      critPercent: 0, critRoll: (round * 37 + agi) % 100, isUlt: true, enraged: false,
      areaHit: opponent !== first, actor: fighter, dodgeState: owner.dodgeState, rng, counterSource: effect, schoolMember: owner.schoolMember,
    }, effectsDuringAction(effects, fighter, round), events)
    damage += opponent.hp - hit.targetHp
    opponent.hp = hit.targetHp
  }
  const currentHp = fighter.hp ?? hp
  return currentHp > 0 ? restoreHp(fighter, currentHp, damage, effect, round, events) : 0
}

/** 共享战斗推演，支持单人带伙伴及三人结义组队。 */
function grantOpeningTeamDodge(
  owner: StatusTarget, effects: readonly ActiveEffect[],
  allies: readonly { target: StatusTarget; hp: number; dodge: number; cap: number }[],
  rng: () => number, events: BattleEventDTO[],
) {
  const effect = effects.find((candidate) => candidate.kind === 'OPENING_TEAM_DODGE')
  if (!effect || blockingActionStatus(owner, 1)) return
  for (const { target, hp, dodge, cap } of allies) {
    const points = Math.max(0, Math.min(effect.points, cap - dodge))
    if (points) applyBattleStatus(effect, { status: 'DODGE_UP', percent: points, rounds: 1, nextRound: false },
      owner.unit.slot, target, { hp }, 1, rng, events)
  }
}

export function simulateServerBattle(params: {
  sceneTitle: string
  mode: BattleReportDTO['mode']
  player: PlayerDTO
  loadout: LoadoutPresetDTO
  ownedItemIds?: readonly string[]
  learnedSkills?: Readonly<Record<string, number>>
  enemyMain: BattleOpponent
  nextOpponents?: readonly BattleOpponent[]
  enemyGuards?: readonly BattleEnemyGuard[]
  puzzleOutcome?: ReturnType<typeof trialPuzzleOutcome>
  trial?: true
  tryRetreat?: boolean
  coopPlayers?: { leftPlayer: { name: string; sect: string; hp: number; atk: number }; rightPlayer: { name: string; sect: string; hp: number; atk: number } }
  rewards?: BattleReportDTO['rewards']
  bonus?: CollectionBonus
  companionOf?: (id: string) => CompanionView | undefined
  rng?: () => number
  environment?: BattleEnvironment
  escortAllies?: readonly BattleEscortAlly[]
  objective?: BattleObjective
  /** 生存战：撑过该回合且主角与护送目标仍存活即判胜 */
  surviveRounds?: number
}): BattleReportDTO {
  const { sceneTitle, mode, player, loadout, learnedSkills, enemyGuards, coopPlayers, rewards, objective, bonus } = params
  const nextOpponents = params.nextOpponents ?? []
  let enemyMain = params.enemyMain
  let surviveRounds = params.surviveRounds
  const meridians = objective?.kind === 'ENDURE_MERIDIANS' ? objective : undefined
  const enoughRoot = !meridians || player.stats.con >= meridians.minCon
  const canRetreat = mode === 'SOLO_STORY' && !params.escortAllies?.length && !objective && !coopPlayers && !nextOpponents.length
  if (objective || nextOpponents.length) {
    surviveRounds = objective?.kind === 'COMPOSURE' || objective?.kind === 'HOLD_FORMATION' || objective?.kind === 'ENDURE_MERIDIANS'
      ? objective.rounds : undefined
  }
  const enduringHits = objective?.kind === 'ENDURE_HITS'
  const guardFormation: DamageShareFormation | undefined = objective?.kind === 'HOLD_FORMATION' ? {
    kind: 'DAMAGE_SHARE_FORMATION', sourceId: 'quanzhen_guard_formation', sourceName: '天罡北斗阵',
    parryPoints: objective.parryPoints, hitRageMultiplier: 1,
  } : undefined
  const rng = params.rng ?? Math.random
  const { main: resolvedLoadout, left, right, companionEffects, teamStats, harmony, friction } =
    resolvePartyEquipment(player, loadout, params.companionOf ?? defaultCompanionOf, !coopPlayers && !meridians)
  const playerWeapon = resolvedLoadout.items.find((item) => item.slot === 'WEAPON')
  const leftCompanion = left?.view
  const rightCompanion = right?.view
  const environment = { ...battleEnvironmentAt(player.currentMapId), ...params.environment }
  const { stats: pDerived, addedCrit, addedDodge, dodgeCap: playerDodgeCap, agi, intStat, environmentBonuses } = deriveStats(player, loadout, resolvedLoadout, bonus, teamStats, environment)
  const leftStats = left && deriveCompanionStats(left, player.level, 'ALLY_LEFT', teamStats, environment)
  const rightStats = right && deriveCompanionStats(right, player.level, 'ALLY_RIGHT', teamStats, environment)
  const teamHp = teamStats.reduce((hp, effect) => hp + (effect.stats.hp ?? 0), 0)
  const teamAttack = teamStats.reduce((atk, effect) => atk + (effect.stats.atk ?? 0), 0)
  const teamAttackPercent = teamStats.reduce((percent, effect) => percent + (effect.stats.atkPercent ?? 0), 100)
  const teamDefense = teamStats.reduce((def, effect) => def + (effect.stats.def ?? 0), 0)
  const teamDefensePercent = teamStats.reduce((percent, effect) => percent + (effect.stats.defPercent ?? 0), 100)
  const partnerDefense = Math.round(teamDefense * teamDefensePercent / 100)
  const partnerAttack = (attack: number) => (attack + teamAttack) * teamAttackPercent / 100
  const assistBase = teamStats.length ? deriveStats(player, loadout, resolvedLoadout, bonus, []).stats.atk : pDerived.atk
  let mp = pDerived.maxMp
  let actionAdvance = 0
  const stanceBannerFor = (enemyStance: StanceType) => ({
    allyStance: loadout.stance, enemyStance, ...evaluateStanceAdvantage(loadout.stance, enemyStance),
  })
  const firstStanceBanner = stanceBannerFor(enemyMain.stance)
  let stanceInfo = firstStanceBanner
  const trioSynergy = !coopPlayers && leftCompanion && rightCompanion
    ? findTrioSynergy(leftCompanion.id, rightCompanion.id)
    : null
  const synergyEffects = trioSynergy ? effectsFrom(trioSynergy) : []
  const bondHealing = synergyEffects.find((effect) => effect.kind === 'HEAL')
  const bondOuter = synergyEffects.filter((effect) => effect.kind === 'OUTER_DAMAGE')
  const sharedCombat = teamCombatEffects([...resolvedLoadout.effects, ...companionEffects])
  const personal = resolvedLoadout.effects.filter((effect) => !isSharedCombatEffect(effect))
  const effects = [...personal, ...teamStats, ...sharedCombat, ...synergyEffects.filter((effect) => effect !== bondHealing)]
  const companionWard = [...effects, ...companionEffects].find((effect) => effect.kind === 'COMPANION_TEAM_REDUCTION')
  const companionProtection: ActiveEffect[] = companionWard ? [{ ...companionWard, kind: 'PHYSICAL_DAMAGE_REDUCTION', alsoPeriodic: true }] : []

  const units: CombatUnitDTO[] = []
  const escortSlots = ['ALLY_ESCORT_LEFT', 'ALLY_ESCORT_RIGHT', 'ALLY_ESCORT_REAR_LEFT', 'ALLY_ESCORT_REAR_RIGHT'] as const
  const escorts = escortSlots.flatMap((slot, index) => {
    const ally = params.escortAllies?.[index]
    return ally ? [{ ...ally, slot }] : []
  })

  // 构建我方 3 单位（单人 1主+2伙伴 或 3真实玩家结义）
  if (coopPlayers) {
    units.push({
      slot: 'ALLY_LEFT',
      id: 'coop_p1',
      name: coopPlayers.leftPlayer.name,
      title: `${coopPlayers.leftPlayer.sect}·结义义兄`,
      portraitStyle: 'guojing',
      isPlayer: true,
      maxHp: coopPlayers.leftPlayer.hp + teamHp,
      hp: coopPlayers.leftPlayer.hp + teamHp,
      maxMp: 3500,
      rage: 40,
      weaponName: '乌金重剑',
    })
  } else if (left && leftStats) {
    const c = left.view
    units.push({
      slot: 'ALLY_LEFT',
      id: c.id,
      name: c.name,
      title: `左翼·${c.title}`,
      portraitStyle: c.portraitStyle,
      isPlayer: false,
      maxHp: leftStats.maxHp,
      hp: leftStats.maxHp,
      maxMp: leftStats.maxMp,
      rage: 30,
      weaponName: left.equipment.weapon?.name,
    })
  }

  const mainUnit = playerUnit('ALLY_MAIN', player, loadout, pDerived, playerWeapon?.name)
  units.push(mainUnit)

  if (coopPlayers) {
    units.push({
      slot: 'ALLY_RIGHT',
      id: 'coop_p2',
      name: coopPlayers.rightPlayer.name,
      title: `${coopPlayers.rightPlayer.sect}·结义义妹`,
      portraitStyle: 'huangrong',
      isPlayer: true,
      maxHp: coopPlayers.rightPlayer.hp + teamHp,
      hp: coopPlayers.rightPlayer.hp + teamHp,
      maxMp: 3200,
      rage: 40,
      weaponName: '东邪碧玉箫',
    })
  } else if (right && rightStats) {
    const c = right.view
    units.push({
      slot: 'ALLY_RIGHT',
      id: c.id,
      name: c.name,
      title: `右翼·${c.title}`,
      portraitStyle: c.portraitStyle,
      isPlayer: false,
      maxHp: rightStats.maxHp,
      hp: rightStats.maxHp,
      maxMp: rightStats.maxMp,
      rage: 30,
      weaponName: right.equipment.weapon?.name,
    })
  }

  for (const escort of escorts) {
    units.push({
      slot: escort.slot, id: escort.id, name: escort.name, title: escort.title ?? '护送目标', portraitStyle: escort.portrait,
      hp: escort.hp, maxHp: escort.maxHp, maxMp: 0, rage: 0, isPlayer: false,
    })
  }

  function buildEnemy(slot: CombatUnitDTO['slot'], id: string, config: BattleEnemyGuard, maxMp: number): EnemyBattleState {
    const isMain = slot === 'ENEMY_MAIN'
    const unit: CombatUnitDTO = {
      slot, id, name: config.name, title: config.title, portraitStyle: config.portrait,
      hp: config.hp, maxHp: config.hp, maxMp,
      rage: config.combat?.openingRage ?? (isMain ? 35 : 20),
      isPlayer: isMain && (mode === 'PVP_HUASHAN' || mode === 'PVP_AMBUSH'),
    }
    const water = environment.water ? config.combat?.water : undefined
    const combat = water ? { ...config.combat, ...water } : config.combat
    const atk = water?.attackPercent ? Math.round(config.atk * water.attackPercent / 100) : config.atk
    return { unit, shield: 0, atk, stance: config.stance, combat, environment,
      isBoss: isMain && 'isBoss' in config && config.isBoss === true }
  }
  function buildEnemyWave(opponent: BattleOpponent, guards: readonly BattleEnemyGuard[] = [], suffix = '') {
    const configs = [
      { slot: 'ENEMY_LEFT', id: 'e_left', config: guards[0] },
      { slot: 'ENEMY_MAIN', id: 'e_main', config: opponent },
      { slot: 'ENEMY_RIGHT', id: 'e_right', config: guards[1] },
      { slot: 'ENEMY_REAR', id: 'e_rear', config: guards[2] },
    ] as const
    return configs.flatMap(({ slot, id, config }) => config
      ? [buildEnemy(slot, id + suffix, config, slot === 'ENEMY_MAIN' ? opponent.mp : 1800)] : [])
  }
  const firstWave = buildEnemyWave(enemyMain, enemyGuards ?? enemyMain.guards)
  const enemies = new Map(firstWave.map((enemy) => [enemy.unit.slot, enemy]))
  units.push(...firstWave.map((enemy) => enemy.unit))
  function waveNames(leader: BattleOpponent, wave: readonly EnemyBattleState[]) {
    return [leader.name, ...wave.filter((enemy) => enemy.unit.slot !== 'ENEMY_MAIN').map((enemy) => enemy.unit.name)].join('、')
  }

  // 克隆工作血量进行推演
  const hpState: Record<string, number> = {}
  const rageState: Record<string, number> = {}
  for (const u of units) {
    hpState[u.slot] = u.hp
    rageState[u.slot] = u.rage
  }
  const fallenEscort = () => escorts.find(({ slot }) => hpState[slot] <= 0)
  const formationUnits = guardFormation ? units.filter(({ slot }) => slot.startsWith('ALLY')) : []
  const missingFormation = !!guardFormation && formationUnits.length !== 7
  const fallenFormationMember = () => formationUnits.find(({ slot }) => hpState[slot] <= 0)
  const partyDefeated = () => hpState.ALLY_MAIN <= 0 || !!fallenEscort() || missingFormation || !!fallenFormationMember()

  const events: BattleEventDTO[] = []
  if (nextOpponents.length) events.push({
    round: 1, type: 'EFFECT', actorSlot: 'ENEMY_MAIN', effectSourceId: 'battle_bout',
    segments: [{ type: 'tag', text: `车轮战 · 第 1 场 · ${waveNames(enemyMain, firstWave)}入场`, tone: 'gold' }],
  })
  if (objective) events.push({
    round: 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', effectSourceId: 'battle_objective',
    segments: [{ type: 'tag', text: `考核目标 · ${battleObjectiveText(objective, enemyMain.name)}`, tone: 'gold' }],
  })
  const outerSkill = (loadout.outerSkillId && SKILLS[loadout.outerSkillId]) || BARE_HANDS
  const ultSkill = loadout.ultSkillId ? SKILLS[loadout.ultSkillId] : undefined
  const gearSkill = params.trial ? equippedGearSkill(loadout) : undefined
  let gearSkillUsed = false
  const ultCost = ultMpCost(mainUnit)
  const opening = openingPriority(effects, rng)
  const critAction = effects.find((effect) => effect.kind === 'CRIT_ACTION')
  const interceptEffect = synergyEffects.find((effect) => effect.kind === 'COMPANION_LETHAL_INTERCEPT')
  const bondPlan = synergyEffects.find((effect) => effect.kind === 'COMPANION_TURN_STATUS')
  const archeryBond = synergyEffects.find((effect) => effect.kind === 'COMPANION_ARCHERY')
  const poisonBond = synergyEffects.find((effect) => effect.kind === 'COMPANION_POISON_CRIT')
  let intercepted = false
  const lightSkill = (loadout.lightSkillId && SKILLS[loadout.lightSkillId]) || NO_LIGHT_SKILL

  // 内力深浅压制系数 K_mp
  const stanceMultAlly = () => stanceInfo.advantage === 'ALLY' ? 1.25 : stanceInfo.advantage === 'ENEMY' ? 0.88 : 1.0
  const stanceMultEnemy = () => stanceInfo.advantage === 'ENEMY' ? 1.22 : stanceInfo.advantage === 'ALLY' ? 0.82 : 1.0

  // 开场三才架势交锋播报
  events.push({
    round: 1,
    type: 'STANCE_CLASH',
    actorSlot: 'ALLY_MAIN',
    segments: [
      { type: 'tag', text: '战斗打法', tone: stanceInfo.advantage === 'ALLY' ? 'jade' : 'gold' },
      { type: 'text', text: ` ${stanceInfo.description}` },
    ],
  })

  announceBattleEnvironment(environment, events)
  appendStatBonusEffects(mainUnit, [...effects, ...environmentBonuses], addedCrit, addedDodge, events)
  for (const ally of units) {
    if (ally !== mainUnit && ally.slot.startsWith('ALLY') && !ally.slot.startsWith('ALLY_ESCORT_')) {
      const equipment = ally.slot === 'ALLY_LEFT' ? left?.equipment : right?.equipment
      appendStatBonusEffects(ally, [...teamStats, ...(equipment?.effects ?? [])], 0, 0, events)
    }
  }
  dismountCavalry(mainUnit, effects, enemies.values(), events)
  const equippedLight = loadout.lightSkillId ? SKILLS[loadout.lightSkillId] : undefined
  function prepareOpponent(enemy: EnemyBattleState, round: number) {
    const water = environment.water ? enemy.combat?.water : undefined
    if (water?.attackPercent || water?.def) {
      const bonuses = [water.attackPercent && `攻击 ${enemy.atk.toLocaleString()}（+${water.attackPercent - 100}%）`,
        water.def && `护体防御 ${water.def.toLocaleString()}`].filter(Boolean)
      events.push({
        round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, effectSourceId: enemy.unit.id,
        segments: [{ type: 'tag', text: `${enemy.unit.name} · 水上借势 · ${bonuses.join('、')}`, tone: 'gold' }],
      })
    }
    const mercy = enemy.combat?.openingMercy
    if (mercy && (intStat < mercy.belowInt || params.ownedItemIds?.includes(mercy.itemId) || resolvedLoadout.items.some((item) => item.id === mercy.itemId))) {
      const attack = enemy.atk
      enemy.atk = Math.round(attack * mercy.attackPercent / 100)
      events.push({
        round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, effectSourceId: enemy.unit.id, statusApplied: '手下留情',
        segments: [{ type: 'tag', text: `${enemy.unit.name} · 手下留情 · 攻击 ${attack} → ${enemy.atk}`, tone: 'jade' }],
      })
    }
    if (equippedLight?.slot === 'LIGHT') disruptEnemyHearing(enemy, equippedLight, enemy.unit.hp, mainUnit.slot, round, events)
    grantShield(enemy, enemy.combat?.openingShield ?? 0, enemy.unit.slot, round, events)
    const trap = enemy.combat?.openingTrap
    if (trap?.stance === loadout.stance) applyBattleStatus(trap, trap.rule, mainUnit.slot, enemy, { hp: enemy.unit.hp }, round, rng, events)
  }
  for (const enemy of enemies.values()) prepareOpponent(enemy, 1)
  const shieldBonus = sharedCombat.find((effect) => effect.kind === 'TEAM_SHIELD_BONUS')
  const allies = units.filter((unit) => unit.slot.startsWith('ALLY')).map((unit): StatusTarget & {
    shield: number; shieldBonus?: typeof shieldBonus
  } => {
    const member = unit.slot === 'ALLY_LEFT' ? left : unit.slot === 'ALLY_RIGHT' ? right : undefined
    const stance = unit.slot === 'ALLY_MAIN' ? loadout.stance : member?.equipment.use?.stance ?? member?.view.battleAttack?.stance ??
      (member?.equipment.items.length ? 'FIERCE' : undefined)
    const weapon = battleWeapon(unit.slot === 'ALLY_MAIN' ? playerWeapon : member?.equipment.weapon)
    return { unit, shield: 0, shieldBonus, stance, environment, combat: weapon && { weapon } }
  })
  const mainShield = Object.assign(allies.find(({ unit }) => unit.slot === 'ALLY_MAIN')!, {
    weapons: enduringHits || meridians ? [] : equippedHiddenWeapons(player, loadout),
  })
  const disarmTarget = objective?.kind === 'DISARM' ? enemies.get('ENEMY_MAIN') : undefined
  // 状态已施加即可判定，缴械或混乱可能要到目标下次行动才限制出手。
  const disarmed = () => !!disarmTarget?.statuses?.DISARM && hpState.ENEMY_MAIN > 0
  const lostComposure = () => objective?.kind === 'COMPOSURE' && !!mainShield.statuses?.CONFUSION
  const objectiveEnded = () => disarmed() || lostComposure()
  const canContinue = () => enoughRoot && !mainShield.retreated && !partyDefeated() && !objectiveEnded()
  const leftFighter = allies.find(({ unit }) => unit.slot === 'ALLY_LEFT')
  const rightFighter = allies.find(({ unit }) => unit.slot === 'ALLY_RIGHT')
  const leftUnit = units.find((unit) => unit.slot === 'ALLY_LEFT')
  const companions = [
    { fighter: leftFighter, member: left, stats: leftStats },
    { fighter: rightFighter, member: right, stats: rightStats },
  ].flatMap(({ fighter, member, stats }) => {
    if (!fighter || !member || !stats || fighter.unit.id !== member.view.id) return []
    const { view, equipment } = member
    const support = effectsFrom({ id: view.id, name: view.assistSkillName, battleEffects: view.battleSupport })
      .map((effect) => view.id === 'yideng' && bondHealing && effect.kind === 'HEAL' ? bondHealing : effect)
    return [{ ...member, fighter, stats, support, mp: fighter.unit.maxMp, dodgeState: {} as DodgeEffectState, actionAdvance: 0, regularActions: 0,
      opening: openingPriority(equipment.effects, rng), lethalSaves: lethalSavesFrom(equipment.effects) }]
  })
  const companionFor = (fighter: StatusTarget) => companions.find((member) => member.fighter === fighter)
  const canAssist = (fighter: StatusTarget, round: number) => hpState[fighter.unit.slot] > 0 && !blockingActionStatus(fighter, round)
  function allyEffects(fighter: StatusTarget) {
    if (fighter === mainShield) return effects
    const member = companionFor(fighter)
    return member ? [...synergyEffects, ...member.equipment.effects.filter((effect) => !isSharedCombatEffect(effect)), ...sharedCombat, ...companionProtection,
      ...member.support.filter((effect) => effect.kind === 'CONTROL_IMMUNITY')] : synergyEffects
  }
  function innateTeamOuter(): ActiveEffect[] {
    if (bondOuter.length) return []
    return companions.filter(({ fighter }) => hpState[fighter.unit.slot] > 0).flatMap(({ support }) => support.flatMap((effect) =>
      effect.kind === 'TEAM_OUTER_DAMAGE' ? [{ ...effect, kind: 'OUTER_DAMAGE' as const }] : []))
  }
  function allyDefense(fighter: StatusTarget, round: number, segments?: RichSegment[]) {
    const escort = escorts.find(({ slot }) => slot === fighter.unit.slot)
    const defense = fighter === mainShield ? pDerived.def : escort?.def ?? companionFor(fighter)?.stats.def ?? partnerDefense
    return battleDefense(fighter, defense, round, { hp: hpState[fighter.unit.slot], effects: allyEffects(fighter), segments })
  }
  const guoCombo = [...effects, ...companionEffects].filter((effect) => effect.kind === 'GUOJING_COMBO')
    .sort((a, b) => b.attackPercent - a.attackPercent)[0]
  const assistEffectsForRound = (round: number) => [
    ...effectsDuringAction(effects, mainShield, round),
    ...companions.filter(({ fighter }) => hpState[fighter.unit.slot] > 0).flatMap(({ equipment }) => equipment.effects),
  ]
  const namedAttacks = companions.flatMap((member) => {
    const { view, equipment } = member
    const equipped = equipment.items.length > 0
    const signature = equipment.use
    const native = view.battleAttack
    const guaranteed = view.id === 'guojing' && guoCombo
    const unlocked = native && (!native.requiresBond || equipment.weapon || guaranteed || trioSynergy?.id === native.requiresBond) ? native : undefined
    const attack: CompanionConfig['battleAttack'] = signature?.outerSkillId
      ? { stance: signature.stance ?? 'FIERCE', target: native?.target ?? 'FRONT', skillId: signature.outerSkillId, everyRound: true,
          afterLeaderHit: native?.afterLeaderHit, burst: native?.burst, poison: native?.poison }
      : unlocked ?? (equipped ? { stance: 'FIERCE', target: 'FRONT' } : undefined)
    if (!attack) return []
    return [{ member, attack: guaranteed ? { ...attack, powerRatio: guaranteed.attackPercent / 100 } : attack }]
  })
  const companionDamage: ActiveEffect[] = coopPlayers ? [] : [...effects, ...companionEffects].filter((effect) => effect.kind === 'COMPANION_DAMAGE')
    .map((effect) => ({ ...effect, kind: 'OUTER_DAMAGE' }))
  const assistEffects = [...effects.filter((effect) => effect.kind === 'OUTER_DAMAGE'), ...companionDamage, ...sharedCombat]
  const combo = effects.find((effect) => effect.kind === 'ROUND_OUTER_COMBO')
  const heartBond = trioSynergy?.id === 'jing_rong' ? trioSynergy : undefined
  const heartGuo = heartBond && companions.find(({ view }) => view.id === 'guojing')
  const heartHuang = heartBond && companions.find(({ view }) => view.id === 'huangrong')
  const lethalSaves = lethalSavesFrom(effects, canRetreat)
  const dodgeState: DodgeEffectState = {}
  const hasKillReward = [...effects, ...companionEffects].some((effect) => effect.kind === 'TEAM_KILL_RECOVERY' || effect.kind === 'KILL_QI_GAIN' || effect.kind === 'KILL_SILVER_GAIN')
  const statusBurst = effects.find((effect) => effect.kind === 'DUAL_STATUS_BURST')
  const bihaiSlot = allies.find(({ unit }) => unit.id === 'huangyaoshi')?.unit.slot
  const lingsheSlot = allies.find(({ unit }) => unit.id === 'ouyangfeng')?.unit.slot

  let enrageStartRound = calcBattleEnrageRound(enemyMain.hp, mode)
  let maxRounds = enrageStartRound + 4
  let opponentIndex = 0
  let receivedHits = 0
  let isEnraged = false
  let survived = false
  const enemyHp = (enemy: EnemyBattleState) => hpState[enemy.unit.slot]
  let enemyFormation = createEnemyFormation(firstWave, enemyHp, events)
  let leaderFell = false
  const exploded = new Set<EnemyBattleState>()

  function enterOpponent(opponent: BattleOpponent, round: number) {
    opponentIndex++
    enemyMain = opponent
    stanceInfo = stanceBannerFor(opponent.stance)
    for (const slot of enemies.keys()) {
      delete hpState[slot]
      delete rageState[slot]
    }
    enemies.clear()
    const wave = buildEnemyWave(opponent, opponent.guards, `_${opponentIndex + 1}`)
    for (const enemy of wave) {
      const { slot, hp, rage } = enemy.unit
      enemies.set(slot, enemy)
      hpState[slot] = hp
      rageState[slot] = rage
    }
    const leader = enemies.get('ENEMY_MAIN')!.unit
    const guards = wave.filter((enemy) => enemy.unit !== leader).map((enemy) => enemy.unit)
    enrageStartRound = round - 1 + calcBattleEnrageRound(opponent.hp, mode)
    maxRounds = enrageStartRound + 4
    isEnraged = false
    leaderFell = false
    enemyFormation = createEnemyFormation(wave, enemyHp, events, round)
    events.push({
      round, type: 'EFFECT', actorSlot: 'ENEMY_MAIN', effectSourceId: 'battle_bout',
      opponentEntry: { unit: leader, guards, stanceBanner: stanceInfo },
      segments: [
        { type: 'tag', text: `车轮战 · 第 ${opponentIndex + 1} 场 · ${waveNames(opponent, wave)}入场`, tone: 'gold' },
        { type: 'text', text: ` 我方延续气血 ${hpState.ALLY_MAIN.toLocaleString()}、内力 ${mp.toLocaleString()}、怒气 ${rageState.ALLY_MAIN}。` },
      ],
    })
    dismountCavalry(mainUnit, effects, wave, events, round)
    for (const enemy of wave) prepareOpponent(enemy, round)
  }

  function livingTarget(round: number) {
    const formationFront = enemyFormation?.front
    if (formationFront && enemyHp(formationFront) > 0 && !hasStatus(formationFront, 'KNOCKBACK', round)) {
      return formationFront
    }
    const front = enemies.get('ENEMY_LEFT')
    if (front && hpState.ENEMY_LEFT > 0 && (hpState.ENEMY_MAIN <= 0 ||
      (!front.combat?.staysBehindLeader && !enemyFormation?.broken && round % 2 === 1 && !hasStatus(front, 'KNOCKBACK', round)))) {
      return front
    }
    const rightGuard = enemies.get('ENEMY_RIGHT')
    if ((!front || hpState.ENEMY_LEFT <= 0) && rightGuard?.combat?.frontAfterGuard && hpState.ENEMY_RIGHT > 0 &&
      round % 2 === 1 && !hasStatus(rightGuard, 'KNOCKBACK', round)) return rightGuard
    if (hpState.ENEMY_MAIN > 0) return enemies.get('ENEMY_MAIN')
    if (hpState.ENEMY_RIGHT > 0) return rightGuard
    if (hpState.ENEMY_REAR > 0) return enemies.get('ENEMY_REAR')
  }

  function rearOuterTarget(round: number) {
    for (const slot of ['ENEMY_REAR', 'ENEMY_RIGHT'] as const) {
      const candidate = enemies.get(slot)
      if (candidate && hpState[slot] > 0 && candidate !== enemyFormation?.front && !hasStatus(candidate, 'KNOCKBACK', round)) return candidate
    }
    return livingTarget(round)
  }

  function useHiddenWeapon(target: EnemyBattleState, trigger: HiddenWeaponConfig['triggerCondition'], round: number) {
    const slot = target.unit.slot
    hpState[slot] = throwHiddenWeapon(mainShield, target, trigger, {
      hp: hpState.ALLY_MAIN, targetHp: hpState[slot], attack: pDerived.atk, level: player.level, effects, round, rng,
    }, events)
  }

  function rewardKills(round: number) {
    for (;;) {
      const enemy = [...enemies.values()].find((candidate) => candidate.combat?.deathBlast && hpState[candidate.unit.slot] <= 0 && !exploded.has(candidate))
      const blast = enemy?.combat?.deathBlast
      if (!enemy || !blast) break
      exploded.add(enemy)
      const source = { sourceId: enemy.unit.id, sourceName: blast.name }
      events.push({
        round, type: 'EFFECT', actorSlot: enemy.unit.slot, effectSourceId: source.sourceId,
        segments: [{ type: 'tag', text: `${enemy.unit.name} · ${blast.name}${enemy.displaced ? ' · 只波及前排' : ' · 波及全队'}`, tone: 'red' }],
      })
      const attack = Math.round(enemy.atk * blast.attackPercent / 100)
      for (const recipient of allies) {
        if (hpState[recipient.unit.slot] <= 0 || (enemy.displaced && recipient !== leftFighter)) continue
        const damage = incomingDamage(attack, 1, allyDefense(recipient, round), player.level)
        receiveSoloDamage(recipient, { source, attacker: enemy, damage, round, label: '爆炸' })
      }
    }
    enemyFormation?.removeFallen(round)
    const leader = enemies.get('ENEMY_MAIN')!
    if (hpState.ENEMY_MAIN > 0) for (const enemy of enemies.values()) {
      const reaction = enemy.combat?.leaderOnDeath
      if (!reaction || enemy.leaderReactionUsed || hpState[enemy.unit.slot] > 0) continue
      enemy.leaderReactionUsed = true
      applyEnemyReaction(leader, reaction, round, events, enemy.defeat?.actorSlot ?? enemy.unit.slot, enemy.unit.id)
    }
    if (!leaderFell && hpState.ENEMY_MAIN <= 0) {
      leaderFell = true
      for (const enemy of enemies.values()) {
        const rule = enemy.combat?.leaderDown
        if (!rule || hpState[enemy.unit.slot] <= 0) continue
        enemy.atk = Math.round(enemy.atk * rule.attackPercent / 100)
        events.push({
          round, type: 'EFFECT', actorSlot: enemy.unit.slot, targetSlot: enemy.unit.slot, effectSourceId: enemy.unit.id, statusApplied: rule.name,
          segments: [{ type: 'tag', text: `${enemy.unit.name} · ${rule.name} · 攻击 -${100 - rule.attackPercent}%`, tone: 'red' }],
        })
      }
    }
    if (!hasKillReward) return
    const members = allies.map((fighter) => {
      const slot = fighter.unit.slot
      return { fighter, hp: hpState[slot], rage: rageState[slot], effects: allyEffects(fighter) }
    })
    resolveKillRewards(enemies.values(), members, round, events)
    for (const member of members) {
      hpState[member.fighter.unit.slot] = member.hp
      rageState[member.fighter.unit.slot] = member.rage
    }
  }

  function strikeWithSkill(
    target: EnemyBattleState, castSkill: SkillConfig, isUlt: boolean, round: number, extra?: ExtraAttackSource, areaHit = false, trueStrike?: TrueStrike,
  ) {
    const targetSlot = target.unit.slot
    const critRoll = (round * 37 + player.stats.agi + (extra?.periodic || extra?.status ? 17 : 0)) % 100
    const power = skillPowerAtMastery(castSkill, learnedSkills?.[castSkill.id])
    const primary = !extra && !areaHit
    const mpDelta = primary && isUlt ? -ultCost : undefined
    const relation = castSkill.area || castSkill.id === CHARGED_ULT_ID || target.combat?.reverseMeridians
      ? stanceRelation(loadout.stance, target.stance ?? enemyMain.stance) : undefined
    const stanceMultiplier = relation === 'WIN' ? 1.25 : relation === 'LOSE' ? 0.88 : relation ? 1 : stanceMultAlly()
    const disarmed = hasStatus(mainShield, 'DISARM', round)
    const active = weaponEffects(effectsDuringAction([...effects, ...innateTeamOuter()], mainShield, round), loadout.weaponId, disarmed)
    const guardedPosition = hpState.ALLY_LEFT > 0 || (!!rightFighter && hpState.ALLY_RIGHT > 0 && round % 2 === 0 && !blockingActionStatus(rightFighter, round))
    const rageDelta = primary ? (isUlt ? -ultRageCost(castSkill, active).cost : gainRage(rageState.ALLY_MAIN, 35, active)) : undefined
    const hit = performStrike(mainUnit, target, {
      round, targetHp: hpState[targetSlot], attackerHp: hpState.ALLY_MAIN, attackerLevel: player.level,
      attackerAtk: disarmed ? Math.round(pDerived.atk * 0.7) : pDerived.atk, attackerDef: allyDefense(mainShield, round),
      power, stance: loadout.stance, stanceMultiplier,
      pressure: innerPressure(pDerived.maxMp, castSkill.area || target.combat?.innerEndurance ? enemyInnerMp(target) : enemyMain.mp),
      showPressure: true, skill: castSkill, critPercent: pDerived.crit, critRoll, isUlt,
      rageDelta,
      mpDelta, enraged: isEnraged, extra, areaHit, weaponId: disarmed ? null : playerWeapon?.id, dodgeState,
      actor: mainShield, rng, trueStrike, guardedPosition, hasLightSkill: equippedLight?.slot === 'LIGHT', schoolMember: player,
    }, active, events)
    hpState[targetSlot] = hit.targetHp
    hpState.ALLY_MAIN = hit.attackerHp
    for (const wave of resolveStrikeSplash(mainUnit, hit.splash, target, enemies.values(),
      (enemy) => hpState[enemy.unit.slot], player.level, round, active, events)) {
      hpState[wave.target.unit.slot] = wave.hp
    }
    mp += mpDelta ?? 0
    rageState.ALLY_MAIN += rageDelta ?? 0
    distractHeartDemon(target, round)
    if (isUlt && !extra && hit.landed) finishHeartDemon(target, round)
    if (hit.critical) {
      actionAdvance = advanceOnCrit(mainUnit, critAction, actionAdvance, round, events)
      rageState.ALLY_MAIN = resolveCritRage(mainUnit, rageState.ALLY_MAIN, target, active, round, events)
    }
    rewardKills(round)
    return hit
  }

  function strikeWithAssist(target: EnemyBattleState, round: number, extra?: ExtraAttackSource) {
    if (!leftUnit) return
    const targetSlot = target.unit.slot
    const targetHp = hpState[targetSlot]
    const assistBaseDamage = Math.round(partnerAttack(assistBase * 0.78) * stanceMultAlly())
    const active = [...assistEffects, ...innateTeamOuter()]
    const conversion = teamTrueStrike(active)
    const hit = conversion ? resolveTrueDamage(assistBaseDamage, target, targetHp, active)
      : resolveAttackDamage(assistBaseDamage, target, targetHp, player.level, undefined, active, undefined, 0, round)
    const damage = Math.min(targetHp, hit.damage)
    hpState[targetSlot] = targetHp - damage
    events.push({
      round,
      type: 'ASSIST_ATTACK',
      actorSlot: 'ALLY_LEFT',
      targetSlot,
      skillName: leftCompanion?.assistSkillName ?? '重剑横扫',
      hpDelta: damage > 0 ? -damage : 0,
      ...hit.shieldEvent,
      effectSourceId: extra?.sourceId ?? conversion?.sourceId,
      trueStrikeSourceId: conversion?.sourceId,
      segments: [
        { type: 'tag', text: extra ? `${extra.sourceName} · 追加出手` : trioSynergy?.name ?? '伙伴追击', tone: 'purple' },
        { type: 'text', text: ' ' },
        { type: 'actor', name: leftUnit.name, isAlly: true },
        { type: 'text', text: `跟上一招「${leftCompanion?.assistSkillName ?? '破军连击'}」，追加伤害 ` },
        { type: 'damage', value: damage, category: conversion ? 'true' : 'phys' },
        ...(conversion ? [{ type: 'tag' as const, text: `${conversion.sourceName} · ${conversion.moveName} · 真伤 ${damage.toLocaleString()}`, tone: 'gold' as const }] : []),
        ...hit.segments,
      ],
    })
    reactToEnemyDamage(target, Math.min(damage, targetHp), hpState[targetSlot], leftUnit.slot, round, events)
    recordEnemyHit(target, hpState[targetSlot], leftUnit.slot, round, events)
    rewardKills(round)
  }

  function pickCompanionTarget(mode: (typeof namedAttacks)[number]['attack']['target'], round: number) {
    const living = [...enemies.values()].filter(({ unit }) => hpState[unit.slot] > 0)
    const front = living.find((target) => target.unit.slot !== 'ENEMY_MAIN' && !target.combat?.staysBehindLeader && !hasStatus(target, 'KNOCKBACK', round))
    const leader = living.find(({ unit }) => unit.slot === 'ENEMY_MAIN')
    if (mode === 'FRONT' && enemyFormation?.front) return livingTarget(round)
    if (mode === 'FRONT') return front ?? leader ?? living[0]
    if (mode === 'REAR') {
      const rear = living.find(({ unit }) => unit.slot === 'ENEMY_REAR')
      if (rear) return rear
      if (front && leader) return leader
    }
    return living.sort((a, b) => hpState[a.unit.slot] / a.unit.maxHp - hpState[b.unit.slot] / b.unit.maxHp)[0]
  }

  function strikeByCompanion(
    actor: (typeof companions)[number], attack: NonNullable<CompanionConfig['battleAttack']>, target: EnemyBattleState, round: number,
    action: { sourceId: string; tag: string; sequence: number; bonuses?: readonly ActiveEffect[]; moveName?: string;
      ultimate?: SkillConfig; rageDelta?: number; mpDelta?: number; areaHit?: true; extra?: ExtraAttackSource; trueStrike?: TrueStrike;
      burst?: NonNullable<CompanionConfig['battleAttack']>['burst'] },
  ) {
    const { fighter, view, equipment, stats } = actor
    const { unit } = fighter
    const equipped = equipment.items.length > 0
    const disarmed = hasStatus(fighter, 'DISARM', round)
    const weaponLimited = disarmed && !equipment.effects.some((effect) => effect.kind === 'MARTIAL_FREEDOM')
    const native = attack.skillId ? SKILLS[attack.skillId] : equipped ? BARE_HANDS : undefined
    const skill = action.ultimate ?? (weaponLimited && isWeaponForm(native?.combatForm ?? equipment.weapon?.combatForm) ? BARE_HANDS : native)
    const targetHp = hpState[target.unit.slot]
    const finisher = !action.ultimate && !action.extra && attack.finisher && targetHp * 100 < target.unit.maxHp * attack.finisher.belowHpPercent
      ? attack.finisher : undefined
    const active = weaponEffects(effectsDuringAction([
      ...(skill ? effectsFrom(skill) : []),
      ...equipment.effects.filter((effect) => !isSharedCombatEffect(effect)),
      ...actor.support.filter((effect) => effect.kind === 'TARGET_TRAIT_DAMAGE'),
      ...bondOuter, ...innateTeamOuter(), ...companionDamage, ...sharedCombat, ...(action.bonuses ?? []),
      ...(finisher ? [{ kind: 'OUTER_DAMAGE' as const, percent: finisher.damagePercent, sourceId: unit.id, sourceName: `${view.assistSkillName} · 残血点杀` }] : []),
    ], fighter, round), equipment.weapon?.id, disarmed)
    const relation = stanceRelation(attack.stance, target.stance ?? enemyMain.stance)
    const stanceMultiplier = relation === 'WIN' ? 1.25 : relation === 'LOSE' ? 0.88 : 1
    const hit = performStrike(unit, target, {
      round, targetHp, attackerHp: hpState[unit.slot], attackerLevel: player.level,
      attackerAtk: disarmed ? Math.round(stats.atk * 0.7) : stats.atk, attackerDef: allyDefense(fighter, round),
      power: (action.ultimate?.powerRatio ?? (skill === native ? attack.powerRatio : undefined) ?? skill?.powerRatio ?? 1) * (action.burst?.powerMultiplier ?? 1),
      stance: attack.stance, form: action.ultimate || disarmed ? undefined : attack.form,
      stanceMultiplier, pressure: equipped ? innerPressure(unit.maxMp, enemyInnerMp(target)) : 1, skill,
      critPercent: stats.crit + (action.ultimate ? 0 : skill?.critBonus ?? 0),
      critRoll: (round * 37 + (unit.slot === 'ALLY_LEFT' ? 11 : 23) + action.sequence * 13) % 100,
      isUlt: !!action.ultimate, enraged: isEnraged, actor: fighter, dodgeState: actor.dodgeState, rng, weaponId: disarmed ? null : equipment.weapon?.id,
      rageDelta: action.rageDelta, mpDelta: action.mpDelta, areaHit: action.areaHit, extra: action.extra, trueStrike: action.trueStrike,
      companion: {
        sourceId: action.sourceId, tag: action.tag,
        moveName: action.moveName ?? (skill && (equipment.use?.outerSkillId || action.ultimate) ? skill.name : view.assistSkillName),
      },
    }, active, events)
    hpState[target.unit.slot] = hit.targetHp
    hpState[unit.slot] = hit.attackerHp
    for (const wave of resolveStrikeSplash(unit, hit.splash, target, enemies.values(), (enemy) => hpState[enemy.unit.slot],
      player.level, round, active, events)) {
      hpState[wave.target.unit.slot] = wave.hp
    }
    const source = { sourceId: unit.id, sourceName: view.assistSkillName, slot: unit.slot }
    if (attack.hitStatus && hit.landed && !action.ultimate && !action.extra &&
        (attack.hitStatus.status !== 'KNOCKBACK' || target.actedRound !== round)) {
      for (const affected of attack.hitStatusArea ? enemies.values() : [target]) {
        applyBattleStatus(source, attack.hitStatus, unit.slot, affected, { hp: hpState[affected.unit.slot] }, round, rng, events)
      }
    }
    if (action.burst && hit.landed) applyBattleStatus(source, action.burst.rule, unit.slot, target, { hp: hpState[target.unit.slot] }, round, rng, events)
    const poison = attack.poison
    if (poison && hit.landed && !active.some((effect) => effect.kind === 'PERIODIC_ON_HIT' && effect.rule.status === poison.status)) {
      applyPeriodicOnHit(source, target, hpState[target.unit.slot], poison, { attack: hit.attackerAtk, round, rng, effects: active }, events)
      hpState[target.unit.slot] = resolvePoisonBurst(unit, target, hpState[target.unit.slot], active, round, events, hit.critical && !!hit.contact)
      hpState[target.unit.slot] = resolvePoisonBurst(mainUnit, target, hpState[target.unit.slot], effects, round, events)
    }
    if (hit.critical && equipped) {
      const critAction = active.find((effect) => effect.kind === 'CRIT_ACTION')
      actor.actionAdvance = advanceOnCrit(unit, critAction, actor.actionAdvance, round, events)
      rageState[unit.slot] = resolveCritRage(unit, rageState[unit.slot], target, active, round, events)
    }
    distractHeartDemon(target, round)
    rewardKills(round)
    return { ...hit, targetHp: hpState[target.unit.slot] }
  }

  function distractHeartDemon(target: EnemyBattleState, round: number) {
    if (target.heartDemon !== 'ENRAGED' || !heartBond || !heartGuo || !heartHuang) return
    if (hpState[heartGuo.fighter.unit.slot] <= 0 || hpState[heartHuang.fighter.unit.slot] <= 0 || hpState[target.unit.slot] <= 0) return
    if (blockingActionStatus(heartHuang.fighter, round)) return
    heartHuang.fighter.actedRound = round
    target.heartDemon = 'DISTRACTED'
    events.push({
      round, type: 'EFFECT', actorSlot: heartHuang.fighter.unit.slot, targetSlot: target.unit.slot,
      effectSourceId: heartBond.id, statusRemoved: '心魔', statusApplied: '心防动摇',
      segments: [
        { type: 'tag', tone: 'gold', text: `${heartBond.name} · 黄蓉攻心` },
        { type: 'text', text: ` ${target.unit.name}分神，心魔增伤解除。` },
      ],
    })
  }

  function finishHeartDemon(target: EnemyBattleState, round: number) {
    if (target.heartDemon !== 'DISTRACTED' || !heartBond || !heartGuo || !heartHuang) return
    const attack = heartGuo.view.battleAttack
    if (!attack || hpState[target.unit.slot] <= 0 || hpState[heartGuo.fighter.unit.slot] <= 0 || hpState[heartHuang.fighter.unit.slot] <= 0) return
    if (!startControlledAction(heartGuo.fighter, round, events)) return
    const hit = strikeByCompanion(heartGuo, attack, target, round, { sourceId: heartBond.id, tag: `${heartBond.name} · 降龙合击`, sequence: 0 })
    if (!hit.landed || hit.targetHp <= 0) return
    const remaining = hit.targetHp
    hpState[target.unit.slot] = applyBonusDamage({ sourceId: heartBond.id, sourceName: heartBond.name },
      resolveTrueDamage(remaining, target, remaining, []), target, {
        actorSlot: heartGuo.fighter.unit.slot, targetHp: remaining, round, label: '攻破心魔', category: 'true',
      }, events)
    rewardKills(round)
  }

  type CompanionTurn = { member: (typeof companions)[number]; attack: NonNullable<CompanionConfig['battleAttack']>; sequence: number }

  function performCompanionAttacks(round: number, leaderTarget?: EnemyBattleState) {
    const completed: CompanionTurn[] = []
    const paired = !!leftFighter && !!rightFighter && hpState.ALLY_LEFT > 0 && hpState.ALLY_RIGHT > 0
    let dragonPenetrated = false
    const turnOrder = [...namedAttacks].sort((a, b) => {
      const openingDifference = round === 1 ? Number(!!b.member.opening) - Number(!!a.member.opening) : 0
      return openingDifference || Number(!!b.attack.poison) - Number(!!a.attack.poison) ||
        Number(a.attack.target === 'REAR') - Number(b.attack.target === 'REAR') ||
        actionTime(battleSpeed(a.member.fighter, a.member.stats.speed, round), a.member.actionAdvance) -
        actionTime(battleSpeed(b.member.fighter, b.member.stats.speed, round), b.member.actionAdvance)
    })
    for (const { member, attack } of turnOrder) {
      if (!canContinue()) break
      const { fighter, equipment } = member
      const { unit } = fighter
      const guaranteed = unit.id === 'guojing' ? guoCombo : undefined
      if (hpState[unit.slot] <= 0 || (attack.afterLeaderHit && (!leaderTarget || (!guaranteed && hpState[leaderTarget.unit.slot] <= 0))) ||
        (!attack.everyRound && !leaderTarget)) continue
      const needsExtraAssist = !attack.everyRound && !guaranteed && round % 2 === 0 && !trioSynergy
      const extraAssist = needsExtraAssist ? extraCompanionAssist(assistEffectsForRound(round), rng) : undefined
      if (needsExtraAssist && !extraAssist) continue
      const disarmed = hasStatus(fighter, 'DISARM', round)
      const weaponLimited = disarmed && !equipment.effects.some((effect) => effect.kind === 'MARTIAL_FREEDOM')
      const equippedUlt = weaponUsableSkill(equipment.ultimate, weaponLimited)
      const mpCost = ultMpCost(unit)
      const ultReady = () => rageState[unit.slot] >= 100 && member.mp >= mpCost
      if (!startPlayerAction(fighter, equippedUlt, equipment.effects, ultReady(), round, events)) continue
      member.actionAdvance = 0
      if (round === 1) announceOpening(unit, member.opening, events)
      const active = weaponEffects(effectsDuringAction([...equipment.effects.filter((effect) => !isSharedCombatEffect(effect)), ...sharedCombat, ...member.support], fighter, round), equipment.weapon?.id, disarmed)
      const dart = resolveActionStartDamage(unit, active, enemies.values(), (enemy) => hpState[enemy.unit.slot], round, rng, events)
      if (dart) {
        hpState[dart.target.unit.slot] = dart.hp
        rewardKills(round)
      }
      if (!canContinue()) break
      if (hpState[unit.slot] <= 0) continue
      const bonuses: ActiveEffect[] = []
      if (paired && poisonBond && unit.id === 'yangkang') {
        bonuses.push({ kind: 'POISON_TARGET_CRIT', points: poisonBond.pointsPerStack, perStack: true,
          sourceId: poisonBond.sourceId, sourceName: poisonBond.sourceName })
      }
      let sequence = 0
      const ordinaryTarget = () => attack.afterLeaderHit && leaderTarget && hpState[leaderTarget.unit.slot] > 0
        ? leaderTarget : pickCompanionTarget(attack.target, round)
      const preferredTarget = (extra?: ExtraAttackSource) => targetsRearWithWeapon(active, extra) ? rearOuterTarget(round) : ordinaryTarget()
      const strike = (tag: string, sourceId = unit.id, target = preferredTarget(),
        action?: Pick<Parameters<typeof strikeByCompanion>[4], 'ultimate' | 'rageDelta' | 'mpDelta' | 'areaHit' | 'extra' | 'trueStrike' | 'burst'>) => {
        if (target && hpState[unit.slot] > 0 && canContinue()) {
          return strikeByCompanion(member, attack, target, round, { sourceId, tag, sequence: sequence++, bonuses, ...action })
        }
      }
      const initial = ordinaryTarget()
      if (!initial || hpState[initial.unit.slot] <= 0) continue
      const fireDarts = (target: EnemyBattleState, power: number) => {
        if (!canContinue()) return
        resolveActionEndDarts(unit, active, {
          target: () => hpState[target.unit.slot] > 0 ? target : pickCompanionTarget(attack.target, round),
          hpOf: (enemy) => hpState[enemy.unit.slot],
          setHp: (enemy, hp) => { hpState[enemy.unit.slot] = hp },
          attack: power, level: player.level, round, rng,
        }, events)
        rewardKills(round)
      }
      const equipped = equipment.items.length > 0
      const ultimate = chooseUltimate(fighter, equippedUlt, active, ultReady(), round, events)
      if (ultimate === null) {
        hpState[unit.slot] = resolveHealing(fighter, hpState[unit.slot], active, { trigger: 'ACTION_END', round }, events)
        fireDarts(initial, Math.round(member.stats.atk * (100 - statusPercent(fighter, 'ATTACK_DOWN', round)) / 100))
        continue
      }
      const target = ultimate ? initial : preferredTarget()
      if (!target) continue
      const rageDelta = equipped ? (ultimate ? -ultRageCost(ultimate, active).cost : gainRage(rageState[unit.slot], 35, active)) : undefined
      rageState[unit.slot] += rageDelta ?? 0
      if (ultimate) member.mp -= mpCost
      const trueStrike = trueStrikeForAction(active, rng)
      if (!ultimate && member.regularActions === 0 && attack.openingSkillId) {
        const openingSkill = SKILLS[attack.openingSkillId]
        strikeByCompanion(member, { stance: attack.stance, target: attack.target, skillId: openingSkill.id }, target, round,
          { sourceId: unit.id, tag: '伙伴协战 · 起手', moveName: openingSkill.name, sequence: sequence++ })
      }
      if (!canContinue()) break
      const actionTarget = hpState[target.unit.slot] > 0 ? target : ultimate ? ordinaryTarget() : preferredTarget()
      if (!actionTarget || hpState[unit.slot] <= 0 || hpState.ALLY_MAIN <= 0) continue
      const charged = attack.burst && !ultimate ? member.regularActions % (attack.burst.charges + 1) : 0
      const burst = attack.burst && charged === attack.burst.charges ? attack.burst : undefined
      const tag = guaranteed ? `${guaranteed.sourceName} · 降龙合击` : burst ? `${member.view.assistSkillName} · 威力 ×${burst.powerMultiplier}` : extraAssist?.sourceName ?? '伙伴协战'
      const first = strike(tag, guaranteed?.sourceId ?? extraAssist?.sourceId ?? unit.id, actionTarget,
        { ultimate, rageDelta, mpDelta: ultimate ? -mpCost : undefined, trueStrike, burst })
      if (!canContinue()) break
      if (first && !ultimate) {
        member.regularActions++
        if (attack.burst) {
          const stacks = burst ? 0 : charged + 1
          events.push({
            round, type: 'EFFECT', actorSlot: unit.slot, targetSlot: unit.slot, effectSourceId: unit.id,
            statusApplied: stacks ? '蛤蟆劲' : undefined, statusRemoved: stacks ? undefined : '蛤蟆劲', statusStacks: stacks,
            segments: [{ type: 'tag', tone: 'gold', text: stacks ? `蛤蟆劲 · 蓄势 ${stacks}/${attack.burst.charges}` : '蛤蟆劲 · 蓄势释放' }],
          })
        }
      }
      if (hpState[unit.slot] <= 0 || hpState.ALLY_MAIN <= 0) continue
      if (ultimate) {
        if (ultimate.area === 'ENEMIES') {
          for (const other of enemies.values()) {
            if (other !== actionTarget && hpState[other.unit.slot] > 0) strike('伙伴协战', unit.id, other, { ultimate, areaHit: true, trueStrike })
          }
        }
      }
      if (first?.landed) spreadHitStatus(ultimate ?? SKILLS[attack.skillId ?? ''], unit, actionTarget, enemies.values(),
        (enemy) => hpState[enemy.unit.slot], round, rng, events)
      if (first && equipped) {
        const area = resolveCastArea(unit, { isUlt: !!ultimate, attack: first.attackerAtk, level: player.level }, active,
          enemies.values(), (enemy) => hpState[enemy.unit.slot], round, rng, events)
        for (const hit of area) hpState[hit.target.unit.slot] = hit.hp
        hpState[unit.slot] = resolveHealing(fighter, hpState[unit.slot], active, { trigger: 'ACTION_END', round }, events)
        rewardKills(round)
      }
      if (unit.id === 'guojing' && first?.ignoredDefense) dragonPenetrated = true
      for (let arrow = 0; arrow < (attack.followUpShots ?? 0); arrow++) strike('连珠神箭 · 追加一箭')
      if (paired && archeryBond && unit.id === 'zhebie') {
        for (let arrow = 0; arrow < archeryBond.extraArrows; arrow++) strike(`${archeryBond.sourceName} · 追加一箭`, archeryBond.sourceId)
        if (dragonPenetrated) strike(`${archeryBond.sourceName} · 降龙破甲合击`, archeryBond.sourceId)
      }
      if (first) {
        const critAction = first.critical && active.find((effect) => effect.kind === 'CRIT_ACTION')
        const shot = critAction ? criticalShot(critAction, rng) : undefined
        if (shot) strike(`${shot.sourceName} · 追加出手`, shot.sourceId, preferredTarget(), { extra: shot })
        const nativeSkill = !ultimate && attack.skillId ? SKILLS[attack.skillId] : undefined
        const skillExtras = nativeSkill && !attack.followUpShots && !member.support.some((effect) => effect.kind === 'OUTER_FOLLOW_UP')
          ? effectsFrom(nativeSkill) : []
        for (const followUp of outerFollowUps([...active, ...skillExtras], !!ultimate, first.landed, rng, equipped && !attack.skillId)) {
          strike(`${followUp.sourceName} · 追加出手`, followUp.sourceId, preferredTarget(followUp), { extra: followUp })
        }
        if (equipped && hpState[unit.slot] > 0 && hpState.ALLY_MAIN > 0) fireDarts(actionTarget, first.attackerAtk)
        if (!ultimate) completed.push({ member, attack, sequence })
      }
    }
    return completed
  }

  function resolveTrioCombo(round: number, turns: CompanionTurn[], outer?: SkillConfig, assisted = false, comboIndex = 1) {
    if (!combo || !canContinue() || (!outer && !assisted && !turns.length)) return
    const target = livingTarget(round)
    if (!target || rng() >= combo.chancePercent / 100) return
    if (outer) strikeWithSkill(!hasStatus(mainShield, 'DISARM', round) && targetsRearWithWeapon(effects) ? rearOuterTarget(round) ?? target : target,
      outer, false, round, { ...combo, comboIndex })
    const assistTarget = assisted && canContinue() && livingTarget(round)
    if (assistTarget && hpState.ALLY_LEFT > 0) strikeWithAssist(assistTarget, round, combo)
    for (const { member, attack, sequence } of turns) {
      if (!canContinue()) break
      if (hpState[member.fighter.unit.slot] <= 0) continue
      const currentTarget = !hasStatus(member.fighter, 'DISARM', round) && targetsRearWithWeapon(member.equipment.effects)
        ? rearOuterTarget(round) : pickCompanionTarget(attack.target, round)
      if (currentTarget) strikeByCompanion(member, attack, currentTarget, round,
        { sourceId: combo.sourceId, tag: combo.sourceName, sequence, extra: combo })
    }
  }

  function playerTurn(round: number) {
    actionAdvance = 0
    const disarmed = hasStatus(mainShield, 'DISARM', round)
    const weaponLimited = disarmed && !resolvedLoadout.freedom
    const equippedUlt = weaponUsableSkill(ultSkill, weaponLimited)
    const equippedOuter = weaponLimited && isWeaponForm(outerSkill === BARE_HANDS ? playerWeapon?.combatForm : outerSkill.combatForm) ? BARE_HANDS : outerSkill
    if (!blockingActionStatus(mainShield, round)) mp = useLowMpPill(mainShield, mp, effects, round, events)
    const ultReady = () => rageState.ALLY_MAIN >= 100 && mp >= ultCost
    const gearCast = gearSkill && !gearSkillUsed && rageState.ALLY_MAIN >= gearSkill.rageCost &&
      !hasStatus(mainShield, 'DISARM', round) && !hasStatus(mainShield, 'ULT_LOCK', round) && !hasStatus(mainShield, 'SEAL', round)
    if (!startPlayerAction(mainShield, equippedUlt, effects, !gearCast && ultReady(), round, events)) {
      resolveTrioCombo(round, performCompanionAttacks(round))
      return
    }
    if (round === 1) announceOpening(mainUnit, opening, events)
    const active = weaponEffects(effectsDuringAction(effects, mainShield, round), loadout.weaponId, disarmed)
    const dart = resolveActionStartDamage(mainUnit, active, enemies.values(), (enemy) => hpState[enemy.unit.slot], round, rng, events)
    if (dart) hpState[dart.target.unit.slot] = dart.hp
    rewardKills(round)
    if (hpState.ALLY_MAIN <= 0) return
    const firstTarget = livingTarget(round)
    if (!firstTarget) return
    const finishDarts = (preferred: EnemyBattleState, attack: number) => {
      if (!canContinue()) return
      resolveActionEndDarts(mainUnit, active, {
        target: () => hpState[preferred.unit.slot] > 0 ? preferred : livingTarget(round),
        hpOf: (enemy) => hpState[enemy.unit.slot],
        setHp: (enemy, hp) => { hpState[enemy.unit.slot] = hp },
        attack, level: player.level, round, rng,
      }, events)
      rewardKills(round)
    }
    if (gearCast) {
      gearSkillUsed = true
      rageState.ALLY_MAIN -= gearSkill.rageCost
      if (mainShield.chargedUlt) endUltCharge(mainShield, round, events, true)
      events.push({
        round, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN',
        effectSourceId: gearSkill.weapon.id, rageDelta: -gearSkill.rageCost,
        segments: [{ type: 'tag', text: `${gearSkill.weapon.name} · ${gearSkill.name} · 消耗怒气 ${gearSkill.rageCost}`, tone: 'gold' }],
      })
    }
    const castUlt = gearCast ? undefined : chooseUltimate(mainShield, equippedUlt, active, ultReady(), round, events)
    if (castUlt === null) {
      hpState.ALLY_MAIN = resolveHealing(mainShield, hpState.ALLY_MAIN, active, { trigger: 'ACTION_END', round }, events)
      resolveTrioCombo(round, performCompanionAttacks(round))
      if (hpState.ALLY_MAIN > 0) finishDarts(firstTarget, Math.round(pDerived.atk * (100 - statusPercent(mainShield, 'ATTACK_DOWN', round)) / 100))
      return
    }
    const target = castUlt?.id === CHARGED_ULT_ID && hpState.ENEMY_MAIN > 0 ? enemies.get('ENEMY_MAIN')! :
      !castUlt && !gearCast && targetsRearWithWeapon(active) ? rearOuterTarget(round) ?? firstTarget : firstTarget
    const castSkill = castUlt ?? equippedOuter
    const trueStrike = gearCast ? undefined : trueStrikeForAction(active, rng)
    const doubleStrike: ExtraAttackSource | undefined = gearCast ? {
      sourceId: gearSkill.weapon.id, sourceName: gearSkill.weapon.name, moveName: gearSkill.name,
      damagePercent: gearSkill.damagePercent, gearSkill: true,
    } : undefined
    const firstHit = strikeWithSkill(target, castSkill, !!castUlt, round, doubleStrike, false, trueStrike)
    if (!canContinue()) return
    const secondHit = doubleStrike && hpState[target.unit.slot] > 0
      ? strikeWithSkill(target, castSkill, false, round, doubleStrike) : undefined
    if (!canContinue()) return
    const landed = firstHit.landed || !!secondHit?.landed
    const { critical, attackerAtk } = firstHit
    if (landed && !gearCast) spreadHitStatus(castSkill, mainUnit, target, enemies.values(), (enemy) => hpState[enemy.unit.slot], round, rng, events)
    if (!gearCast && castSkill.area === 'ENEMIES') {
      for (const recipient of enemies.values()) {
        if (recipient !== target && hpState[recipient.unit.slot] > 0) strikeWithSkill(recipient, castSkill, !!castUlt, round, undefined, true, trueStrike)
        if (!canContinue()) return
      }
    }
    const hits = gearCast ? [] : resolveCastArea(mainUnit, { isUlt: !!castUlt, attack: attackerAtk, level: player.level },
      active, enemies.values(), (recipient) => hpState[recipient.unit.slot], round, rng, events)
    for (const hit of hits) hpState[hit.target.unit.slot] = hit.hp
    rewardKills(round)
    if (hpState.ALLY_MAIN <= 0) return
    hpState.ALLY_MAIN = resolveHealing(mainShield, hpState.ALLY_MAIN, active, { trigger: 'ACTION_END', round }, events)
    const shotTarget = !gearCast && critical && critAction ? livingTarget(round) : undefined
    const shot = shotTarget && criticalShot(critAction, rng)
    if (shot && shotTarget) strikeWithSkill(shotTarget, BARE_HANDS, false, round, shot)
    if (!canContinue()) return
    const followUps = !gearCast && livingTarget(round) ? outerFollowUps(active, !!castUlt, landed, rng, equippedOuter === BARE_HANDS) : []
    for (const followUp of followUps) {
      const followTarget = followUp.front ? pickCompanionTarget('FRONT', round) : targetsRearWithWeapon(active, followUp) ? rearOuterTarget(round) : livingTarget(round)
      if (!followTarget) break
      strikeWithSkill(followTarget, equippedOuter, false, round, followUp)
      if (!canContinue()) return
    }

    const companionTurns = performCompanionAttacks(round, landed ? target : undefined)
    if (!canContinue()) return
    const canFollow = landed && !!leftFighter && !namedAttacks.some(({ member }) => member.fighter === leftFighter) &&
      hpState.ALLY_LEFT > 0 && hpState[target.unit.slot] > 0
    const regularAssist = round % 2 === 1 || !!trioSynergy || !!coopPlayers
    const extraAssist = canFollow && !regularAssist ? extraCompanionAssist(assistEffectsForRound(round), rng) : undefined
    const assisted = canFollow && (regularAssist || !!extraAssist) && startControlledAction(leftFighter, round, events)
    if (assisted) strikeWithAssist(target, round, extraAssist)

    const comboIndex = followUps.filter((followUp) => followUp.comboIndex !== undefined).length + 1
    resolveTrioCombo(round, companionTurns, !gearCast && castSkill.slot === 'OUTER' ? castSkill : undefined, assisted, comboIndex)
    if (hpState.ALLY_MAIN > 0) finishDarts(target, attackerAtk)
  }

  function attackingEnemy() {
    if (hpState.ENEMY_MAIN > 0) return enemies.get('ENEMY_MAIN')!
    return [...enemies.values()].find(({ unit }) => hpState[unit.slot] > 0)!
  }

  function transferSoloStatuses(fighter: StatusTarget, round: number) {
    transferLethalStatuses(fighter, allyEffects(fighter), enemies.values(), (enemy) => hpState[enemy.unit.slot], round, events)
  }

  function lastStand(fighter: StatusTarget, hp: number, attacker: EnemyBattleState | undefined, round: number) {
    const opponents = [...enemies.values()].map((enemy) => ({ enemy, hp: hpState[enemy.unit.slot] }))
    const member = companionFor(fighter)
    const restored = counterBeforeDeath({
      fighter, hp, level: player.level, agi: member?.stats.agi ?? player.stats.agi, stance: fighter.stance ?? loadout.stance,
      skill: member ? member.equipment.ultimate : ultSkill, atk: member?.stats.atk ?? pDerived.atk, def: allyDefense(fighter, round),
      effects: allyEffects(fighter), learnedSkills: member ? undefined : learnedSkills, dodgeState: member?.dodgeState ?? dodgeState,
      schoolMember: member ? undefined : player,
    }, opponents, attacker, round, rng, events)
    if (restored === undefined) return
    for (const { enemy, hp } of opponents) hpState[enemy.unit.slot] = hp
    return restored
  }

  function receiveSoloDamage(recipient: (typeof allies)[number],
    contact: Omit<Parameters<typeof applyDirectedDamage>[1], 'attackerHp'> & { attack?: number; melee?: boolean },
  ) {
    const slot = recipient.unit.slot
    const attackerSlot = contact.attacker.unit.slot
    const otherPartner = recipient === leftFighter ? rightFighter : recipient === rightFighter ? leftFighter : undefined
    const interceptor = interceptEffect && !intercepted && otherPartner && hpState[otherPartner.unit.slot] > 0 ? otherPartner : undefined
    const isMain = recipient === mainShield
    const active = effectsDuringAction(allyEffects(recipient), recipient, contact.round)
    const member = companionFor(recipient)
    const defense = allyDefense(recipient, contact.round)
    const result = applyDirectedDamage({
      fighter: recipient, hp: hpState[slot], defense,
      effects: active,
      saves: isMain ? lethalSaves : member?.lethalSaves, interceptLethal: !!interceptor,
      beforeLethal: (hp) => {
        const restored = lastStand(recipient, hp, contact.attacker, contact.round)
        return restored === undefined ? undefined : { hp: restored, attackerHp: hpState[attackerSlot] }
      },
    }, { rng, ...contact, attackerHp: hpState[attackerSlot] }, events)
    hpState[slot] = result.hp
    hpState[attackerSlot] = result.attackerHp
    rageState[slot] += result.rageGained
    if (recipient.retreated) return
    if (contact.critical && contact.attack !== undefined) {
      hpState[attackerSlot] = reflectCriticalPoison(recipient.unit, contact.attacker, hpState[attackerSlot], contact.attack, active, contact.round, events)
    }
    if (contact.hitResult && contact.damage > 0 && !contact.ignoreDamageReduction) {
      hpState[attackerSlot] = resolveReceivePeriodic(recipient, result.hp, active, {
        attacker: contact.attacker, attackerHp: hpState[attackerSlot],
        defenderAttack: member?.stats.atk ?? pDerived.atk, round: contact.round, rng,
      }, events)
      if (contact.hitResult === 'PARRY') {
        const parry = resolveParryEffects({ ...recipient, hp: hpState[slot], def: defense,
          hpLost: result.hpLost, effects: active }, contact.attacker, hpState[attackerSlot], contact.round, events)
        hpState[slot] = parry.hp
        hpState[attackerSlot] = parry.attackerHp
      }
      const retaliation = contact.melee ? meleeRetaliationFor(active) : undefined
      if (retaliation && contact.attack !== undefined && hpState[attackerSlot] > 0) {
        hpState[attackerSlot] = resolveMeleeRetaliation(retaliation, contact.attacker, {
          attackerHp: hpState[attackerSlot], attackerAtk: contact.attack, hpLost: result.hpLost,
          defenderSlot: slot, defenderAtk: member?.stats.atk ?? pDerived.atk, round: contact.round,
        }, active, events)
        hpState[attackerSlot] = resolvePoisonBurst(recipient.unit, contact.attacker, hpState[attackerSlot], active, contact.round, events)
      }
    }
    if (isMain) {
      mp = recoverHitMp(mainUnit, result.hp, mp, result.hpLost, active, contact.round, events)
      mp = recoverPoisonMp(mainUnit, result.hp, mp, result.poisonRecovery, contact.round, events)
    }
    if (member) {
      member.mp = recoverHitMp(member.fighter.unit, result.hp, member.mp, result.hpLost, active, contact.round, events)
      member.mp = recoverPoisonMp(member.fighter.unit, result.hp, member.mp, result.poisonRecovery, contact.round, events)
    }
    if (result.lethal) transferSoloStatuses(recipient, contact.round)
    if (interceptor && interceptEffect && result.redirectedDamage > 0) {
      intercepted = true
      receiveSoloDamage(interceptor, {
        source: interceptEffect, attacker: contact.attacker,
        damage: result.redirectedDamage, round: contact.round, label: '代承', element: contact.element,
      })
    }
  }

  function receiveFormationShares(shares: { recipient: (typeof allies)[number]; damage: number }[], formation: DamageShareFormation,
    attacker: EnemyBattleState, round: number, critical: boolean, ordinaryCreature: EnemyCombatConfig['creature'], element: SkillConfig['element'],
    outer: boolean) {
    for (const { recipient, damage } of shares) {
      const slot = recipient.unit.slot
      if (hpState[slot] <= 0) continue
      receiveSoloDamage(recipient, { source: formation, attacker, damage, round, critical, ordinaryCreature, element, outer,
        hitRage: formation.sharedRage ? { current: rageState[slot], base: 0, formation } : undefined })
      if (mainShield.retreated) break
    }
  }

  const usedCovers = new Set<string>()
  let rightGuardedRound = 0
  function leaderCover(damage: number, round: number, guarding: boolean, formation: DamageShareFormation | undefined) {
    if (damage <= 0) return
    const lethal = damage >= hpState.ALLY_MAIN
    const hasSave = !!lethalSaves.length || mainShield.lethalGuard?.round === round
    const candidates = companions.flatMap((member) => {
      const { fighter, support } = member
      const effect = support.find((entry) => entry.kind === 'LEADER_COVER')
      if (!effect || !canAssist(fighter, round) || usedCovers.has(fighter.unit.id)) return []
      if (effect.cleanseTeam && trioSynergy?.id === 'chong_yang_yi_ze') return []
      if (effect.trigger === 'LETHAL' && (!lethal || hasSave)) return []
      if (effect.trigger === 'HEAVY' && (damage * 100 < mainUnit.maxHp * 30 || (lethal && hasSave))) return []
      if ((effect.trigger === 'HIT' || effect.trigger === 'GUARD') && formation) return []
      if (effect.trigger === 'GUARD' && (!guarding || fighter !== rightFighter)) return []
      const amount = Math.round(damage * effect.percent / 100)
      return amount > 0 ? [{ member, effect, amount }] : []
    })
    return candidates.sort((a, b) => b.amount - a.amount)[0]
  }

  function cleanseParty(source: { sourceId: string; sourceName: string; slot: CombatUnitDTO['slot'] }, round: number) {
    for (const recipient of allies) {
      if (hpState[recipient.unit.slot] <= 0) continue
      cleanseControlStatus(recipient, 'SEAL', source, round, events)
      cleansePoison(recipient, source, round, events)
    }
  }

  function cleanseOnBondSave(sourceId: string | undefined, round: number) {
    if (sourceId !== 'chong_yang_yi_ze') return
    const master = companions.find(({ view, fighter }) => view.id === 'wangchongyang' && hpState[fighter.unit.slot] > 0)
    if (master) cleanseParty({ sourceId, sourceName: '重阳遗泽', slot: master.fighter.unit.slot }, round)
  }

  function enemyAttackThreat(attacker: EnemyBattleState, round: number) {
    const wave = attacker.combat?.reverseMeridians
    const rawAttack = attacker.atk * enemyPhaseAttackPercent(attacker, round) * (100 - statusPercent(attacker, 'ATTACK_DOWN', round)) / 10_000
    if (wave && round % wave.waveEvery === 0) {
      return loadout.stance === 'TAICHI' ? rawAttack * wave.guardedDamagePercent / 100 * allies.filter(({ unit }) => hpState[unit.slot] > 0).length : Infinity
    }
    if (blockingActionStatus(attacker, round) || (!isEnraged && attacker.chargeState === 'INTERRUPTED')) return 0
    if (isEnraged) return rawAttack
    const charge = attacker.combat?.charge
    const sealed = hasStatus(attacker, 'SEAL', round) || hasStatus(attacker, 'ULT_LOCK', round)
    if (charge && !sealed) {
      if (attacker.chargeState === 'CHARGING') return rawAttack * charge.damageMultiplier
      if (round === charge.round) return 0
    }
    return rawAttack * readyEnemyRagePower(attacker, round)
  }

  function enemyTurn(attacker: EnemyBattleState, round: number) {
    const enemyActor = attacker.unit
    const enemyActorSlot = enemyActor.slot
    const isWipeoutRound = round >= maxRounds
    const reverse = attacker.combat?.reverseMeridians
    const wave = reverse && !isWipeoutRound && round % reverse.waveEvery === 0
    if (mainShield.weapons.length && !isWipeoutRound && !wave) {
      if (!blockingActionStatus(attacker, round)) useHiddenWeapon(attacker, 'SELF_HP_LOW', round)
      if (!isEnraged && canInterruptEnemyUltimate(attacker, round)) useHiddenWeapon(attacker, 'ENEMY_ULT_READY', round)
      if (hpState[enemyActorSlot] <= 0 || !canContinue()) return
    }
    const exam = attacker.combat?.peachTrials && (round === 3 ? '箫声抗衡' : round === 6 ? '奇门背诵' : round === 9 ? '拆招过关' : undefined)
    const quiz = params.puzzleOutcome?.round === round ? params.puzzleOutcome : undefined
    const reciter = exam && round === 6 && !quiz ? companions.find(({ view, fighter, stats }) =>
      view.id === 'huangrong' && stats.intStat >= 28 && canAssist(fighter, round)) : undefined
    const recited = exam && round === 6 && (!!quiz?.correct || !!reciter)
    const disarmedTrial = exam && round === 9 && attacker.chargeState === 'INTERRUPTED'
    if (exam) {
      events.push({
        round, type: 'EFFECT', actorSlot: reciter?.fighter.unit.slot ?? enemyActorSlot, targetSlot: 'ALLY_MAIN', effectSourceId: 'peach_trials',
        segments: [{ type: 'tag', tone: recited || disarmedTrial ? 'jade' : 'gold',
          text: `${exam}${reciter ? ' · 黄蓉背诵通过' : disarmedTrial ? ' · 已打断试招' : ''}` }],
      })
    }
    const chargeMultiplier = resolveEnemyAction(attacker, round, isEnraged, events, isWipeoutRound || !!wave)

    if (chargeMultiplier !== null) {
      const deflectedTrial = exam && round === 9 && chargeMultiplier > 1 && loadout.stance === 'TAICHI'
      if (attacker.combat?.statusPulse && !recited && !deflectedTrial) {
        applyEnemyStatusPulse(attacker, allies.map((fighter) => ({
          fighter, hp: hpState[fighter.unit.slot], effects: allyEffects(fighter),
        })), round, rng, events)
        if (lostComposure()) return
      }
      // 狂暴增伤系数（每回合递增 +35% 复合增伤）
      const enrageAtkMult = isEnraged ? Math.pow(1.35, round - enrageStartRound + 1) : 1.0
      let currentEnemyAtk = Math.round(attacker.atk * enrageAtkMult * enemyPhaseAttackPercent(attacker, round) / 100 *
        (100 - statusPercent(attacker, 'ATTACK_DOWN', round)) / 100)
      const relation = (reverse || attacker.combat?.joinsRound) && attacker.stance ? stanceRelation(loadout.stance, attacker.stance) : undefined
      const enemyMultiplier = relation === 'LOSE' ? 1.22 : relation === 'WIN' ? 0.82 : relation ? 1 : stanceMultEnemy()
      const active = effectsDuringAction(effects, mainShield, round)
      const living = allies.filter(({ unit }) => hpState[unit.slot] > 0)
      const attackerMp = enemyInnerMp(attacker)
      const enemySkill = !wave && !isEnraged && chargeMultiplier === 1 ? enemyRageAction(attacker, round, events) : undefined
      const femaleTarget = !isWipeoutRound && attacker.combat?.preferFemaleCompanion
        ? living.find(({ unit }) => !unit.isPlayer && COMPANIONS[unit.id]?.female) : undefined
      const escortTarget = isWipeoutRound ? undefined : living.find(({ unit }) => unit.slot === attacker.combat?.escortTarget)
      const preferred = enemyPreferredTarget(attacker, enemySkill, living)
      const sideTarget = (preferred?.unit.slot === 'ALLY_RIGHT' ? preferred : undefined) ?? escortTarget ?? femaleTarget
      if (!isWipeoutRound && enemyHitPenalty(attacker, round) >= 100) {
        const skillName = wave ? '九阴逆行·天崩地裂' : chargeMultiplier > 1 ? attacker.combat?.charge?.name : enemySkill?.name
        announceMiss(enemyActor, (wave ? mainUnit : sideTarget?.unit) ?? mainUnit, 100, round, events,
          { skillId: enemySkill?.id, skillName, skillTier: enemySkill?.tier, isUlt: enemySkill ? true : undefined })
        return
      }
      if (wave) {
        const source = { sourceId: 'jiuyin_nixing', sourceName: '九阴逆行·天崩地裂' }
        const guarded = loadout.stance === 'TAICHI'
        const cover = guarded ? active.find((effect) => effect.kind === 'TEAM_AREA_REDUCTION') : undefined
        events.push({
          round, type: 'EFFECT', actorSlot: enemyActorSlot, effectSourceId: source.sourceId,
          segments: [{ type: 'tag', tone: 'red', text: guarded ? `${source.sourceName} · 全队以太极御掌` : `${source.sourceName} · 掌风重击全队` }],
        })
        for (const recipient of living) {
          const slot = recipient.unit.slot
          if (hpState[slot] <= 0) continue
          const isMain = recipient === mainShield
          const damage = guarded
            ? incomingDamage(currentEnemyAtk, enemyMultiplier * reverse.guardedDamagePercent / 100, allyDefense(recipient, round), player.level)
            : hpState[slot] + recipient.shield
          const reduced = cover ? Math.round(damage * cover.percent / 100) : 0
          receiveSoloDamage(recipient, {
            source, attacker, damage: damage - reduced, round, label: '掌风', hitResult: 'HIT', ignoreDamageReduction: guarded ? undefined : true,
            segments: cover ? [{ type: 'tag', text: `${cover.sourceName} · 范围减伤 ${reduced}`, tone: 'jade' }] : undefined,
            hitRage: { current: rageState[slot], base: isMain ? STANDARD_HIT_RAGE : 0 },
          })
        }
        return
      }
      const counteredHp = counterChargedAttack(mainUnit, loadout.stance, attacker, chargeMultiplier, hpState[enemyActorSlot], round, events)
      if (counteredHp !== undefined) {
        hpState[enemyActorSlot] = counteredHp
        return
      }
      const contact = enemyContact(attacker, enemySkill, chargeMultiplier, round, isWipeoutRound)
      if (contact.disarmed) currentEnemyAtk = Math.round(currentEnemyAtk * 0.7)
      const enemyCast = enemySkill ? { skillId: enemySkill.id, skillName: enemySkill.name, skillTier: enemySkill.tier, isUlt: true }
        : contact.disarmed ? { skillId: BARE_HANDS.id, skillName: '徒手反击', skillTier: BARE_HANDS.tier } : {}
      const outer = !isWipeoutRound && chargeMultiplier === 1 && contact.outer
      const shieldMultiplier = enemySkill?.battleEffects?.find((effect) => effect.kind === 'SHIELD_REND')?.multiplier
      const ordinaryCreature = !isWipeoutRound && !enemySkill && chargeMultiplier === 1 ? attacker.combat?.creature : undefined
      const critical = !isWipeoutRound && (round * 41) % 100 < (attacker.combat?.crit ?? 0) - statusPercent(attacker, 'CRIT_DOWN', round)
      const hitPower = chargeMultiplier * (enemySkill?.powerRatio ?? 1) * (critical ? 1.55 : 1)
      const isEscortTarget = sideTarget?.unit.slot.startsWith('ALLY_ESCORT_')
      const livingFighters = !guardFormation && escorts.length ? living.filter(({ unit }) => !unit.slot.startsWith('ALLY_ESCORT_')) : living
      let formation = !isWipeoutRound ? guardFormation : undefined
      if (!formation && !enduringHits && !isWipeoutRound && !isEscortTarget && livingFighters.length === 3) {
        formation = damageShareFormation(assistEffectsForRound(round))
      }
      const counterConfig = isWipeoutRound ? undefined : attacker.combat?.companionCounter
      const counterOwner = counterConfig && living.find(({ unit }) => unit.slot === counterConfig.slot && unit.id === counterConfig.id)
      const counter = counterConfig && counterOwner ? { ...counterConfig, unit: counterOwner.unit } : undefined

      // 轻功闪避判定（狂暴后杀气锁定，无法闪避）
      const target = sideTarget ?? mainShield
      const member = sideTarget && companionFor(sideTarget)
      const equipped = !!member?.equipment.items.length
      const baseDodge = sideTarget ? member?.stats.dodge ?? 0 : pDerived.dodge
      const rollDodge = (round * 29 + (sideTarget ? member?.stats.equipmentAgi ?? 0 : player.stats.agi)) % 100
      const penalty = isWipeoutRound ? 0 : Math.min(100, enemyHitPenalty(attacker, round) + (counter?.hitPenalty ?? 0) +
        (sideTarget ? 0 : lightCounterPenalty(attacker, enemySkill, equippedLight)))
      const escape = isEnraged || enduringHits ? undefined : escapeFromAttack(target, round)
      const dodgeEffects = sideTarget ? effectsDuringAction(allyEffects(sideTarget), sideTarget, round) : active
      const opponentDefense = !isWipeoutRound && !enduringHits ? conditionalDefense(dodgeEffects, attacker) : undefined
      const evasion = isEnraged || enduringHits ? { chance: 0 } :
        dodgeAgainst(target, baseDodge, member?.stats.dodgeCap ?? playerDodgeCap, round, opponentDefense)
      const avoidance = escape ? 'DODGE' : strikeAvoidance(rollDodge, evasion.chance, penalty)
      const absoluteDodge = !enduringHits && !isEnraged && (!sideTarget || equipped) && !avoidance ? rollAbsoluteDefense(dodgeEffects, 'ABSOLUTE_DODGE', rng) : undefined
      if (avoidance === 'MISS') {
        announceMiss(enemyActor, sideTarget?.unit ?? mainUnit, penalty, round, events, enemyCast)
        return
      }
      if (avoidance === 'DODGE' || absoluteDodge) {
        const slot = target.unit.slot
        const evadeSkill = sideTarget ? NO_LIGHT_SKILL : lightSkill
        const rageDelta = dodgeRageGain(rageState[slot], dodgeEffects, sideTarget ? 0 : 10)
        rageState[slot] += rageDelta
        events.push({
          round,
          type: 'DODGE',
          actorSlot: slot,
          targetSlot: slot,
          hitResult: 'DODGE',
          rageDelta: rageDelta || undefined,
          effectSourceId: escape?.sourceId,
          segments: [
            { type: 'actor', name: enemyActor.name, isAlly: false },
            { type: 'text', text: enemyCast.skillName ? `以「${enemyCast.skillName}」攻来，` : '攻来，' },
            { type: 'actor', name: target.unit.name, isAlly: true, isPlayer: target.unit.isPlayer },
            { type: 'text', text: '使出' },
            { type: 'skill', id: evadeSkill.id, name: `《${evadeSkill.name}》`, tier: evadeSkill.tier },
            { type: 'text', text: rageDelta > 0 ? `闪开了，怒气 +${rageDelta}。` : '闪开了。' },
            ...(!escape && evasion.segment ? [evasion.segment] : []),
            ...(escape ? [{ type: 'tag', text: `${escape.sourceName} · 灵狐遁逃`, tone: 'jade' } as const] : []),
            ...(absoluteDodge ? [{ type: 'tag', text: `${absoluteDodge.sourceName} · 绝对闪避`, tone: 'jade' } as const] : []),
          ],
        })
        const dodge = resolveDodgeEffects({
          ...target, hp: hpState[slot], level: player.level, atk: member?.stats.atk ?? pDerived.atk,
          agi: sideTarget ? member?.stats.agi ?? 0 : agi, effects: dodgeEffects, state: member?.dodgeState ?? dodgeState,
        }, attacker, hpState[enemyActorSlot], round, rng, events)
        hpState[enemyActorSlot] = dodge.attackerHp
        hpState[slot] = dodge.defenderHp
      } else {
        const defenseSegments: RichSegment[] = evasion.segment ? [evasion.segment] : []
        const defense = isWipeoutRound && !sideTarget ? battleDefense(mainShield, pDerived.def, round) : allyDefense(target, round, defenseSegments)
        const targetStance = sideTarget && equipped ? sideTarget.stance ?? 'FIERCE' : loadout.stance
        const stanceMatch = sideTarget && equipped ? stanceRelation(targetStance, attacker.stance ?? enemyMain.stance) : undefined
        const stancePower = isEscortTarget ? 1 : stanceMatch ? (stanceMatch === 'LOSE' ? 1.22 : stanceMatch === 'WIN' ? 0.82 : 1) : enemyMultiplier
        const pressure = !isWipeoutRound && (attacker.combat?.innerEndurance || (chargeMultiplier > 1 && attacker.combat?.charge?.innerPressure))
          ? Math.max(1, innerPressure(attackerMp, sideTarget ? member?.mp ?? sideTarget.unit.maxMp : mp)) : 1
        const stanceHit = incomingStrikePower(targetStance, attacker.stance, stancePower, hitPower, currentEnemyAtk,
          defense, player.level, isWipeoutRound ? [] : dodgeEffects, pressure)
        const raw = stanceHit.damage
        let rawEnemyDmg = counter ? Math.round(raw * (100 - counter.damageReductionPercent) / 100) : raw
        const counterSegments: RichSegment[] = counter
          ? [{ type: 'tag', text: `${counter.unit.name} · 盾前减伤 ${(raw - rawEnemyDmg).toLocaleString()}`, tone: 'jade' }] : []
        counterSegments.unshift(...defenseSegments, ...stanceHit.segments)
        if (sideTarget) {
          const targetSlot = sideTarget.unit.slot
          const defenseStats = member?.stats ?? { parry: 0, parryAbsorb: BASE_PARRY_ABSORB }
          const parry = parryIncoming(defenseStats, formation?.parryPoints ?? 0, (round * 53) % 100, contact,
            equipped ? dodgeEffects : [], rng, opponentDefense)
          if (member && parry.parried) member.mp = spendParryMp(sideTarget, member.mp, parry, rawEnemyDmg, dodgeEffects, round, events)
          const split = splitFormationDamage(formation, sideTarget, livingFighters, rawEnemyDmg, parry.absorb)
          const hitRage = equipped || formation?.sharedRage
            ? { current: rageState[targetSlot], base: equipped ? STANDARD_HIT_RAGE : 0, formation } : undefined
          const legacyRage = !hitRage ? resolveHitRage(rageState[targetSlot], 0, 0, [], formation) : undefined
          rageState[targetSlot] += legacyRage?.gained ?? 0
          receiveSoloDamage(sideTarget, {
            source: { sourceId: attacker.unit.id, sourceName: attacker.unit.name }, attacker, damage: split.damage,
            round, label: '命中', hitResult: parry.parried ? 'PARRY' : critical ? 'CRIT' : 'HIT', parryAbsorb: split.parryAbsorb,
            critical, shieldMultiplier, ordinaryCreature, cast: enemyCast, element: contact.element, outer,
            attack: currentEnemyAtk, melee: !contact.ranged && !parry.caught,
            hitRage,
            rageDelta: legacyRage?.gained || undefined, segments: [...counterSegments, ...parry.segments, ...split.segments, ...(legacyRage?.segments ?? [])],
          })
          if (formation) receiveFormationShares(split.shares, formation, attacker, round, critical, ordinaryCreature, contact.element, outer)
          if (mainShield.retreated) return
          if (parry.caught) hpState[enemyActorSlot] = finishBladeCatch(parry.caught, sideTarget.unit, attacker, hpState[enemyActorSlot], rawEnemyDmg, round, dodgeEffects, rng, events)
          else {
            applyIncomingStatuses(attacker, hpState[enemyActorSlot], sideTarget, hpState[targetSlot], dodgeEffects, round, rng, events, currentEnemyAtk, contact.weaponSuppressed)
            enemyTechniqueOnHit(attacker, enemySkill, currentEnemyAtk, hpState[enemyActorSlot], sideTarget, hpState[targetSlot], parry.parried, dodgeEffects, round, rng, events)
          }
          return
        }
        if (isWipeoutRound) {
          rawEnemyDmg = Math.max(99999, rawEnemyDmg * 15) // 狂暴终结回合灭顶绝杀
        }

        // 右翼奇策援护化解判定
        const retaliation = contact.ranged ? undefined : meleeRetaliationFor(active)
        const rightUnit = rightFighter?.unit
        const guarding = !!(!enduringHits && rightFighter && rightUnit && hpState.ALLY_RIGHT > 0 && round % 2 === 0 && rightGuardedRound !== round &&
          startControlledAction(rightFighter, round, events))
        if (guarding) rightGuardedRound = round
        const personalGuard = rightFighter && !formation && !isWipeoutRound && companionFor(rightFighter)?.support
          .some((effect) => effect.kind === 'LEADER_COVER' && effect.trigger === 'GUARD')
        const incoming = guarding && !personalGuard ? Math.round(rawEnemyDmg * 0.48) : rawEnemyDmg
        const incomingEffects = isWipeoutRound ? [] : active
        const parry = parryIncoming(pDerived, formation?.parryPoints ?? 0, isWipeoutRound ? 100 : (round * 53 + player.stats.intStat) % 100,
          contact, incomingEffects, rng, opponentDefense)
        const { parried } = parry
        if (parried) mp = spendParryMp(mainShield, mp, parry, incoming, incomingEffects, round, events)
        counterSegments.push(...parry.segments)
        if (contact.disarmed) counterSegments.push({ type: 'tag', text: '缴械 · 徒手出招 · 攻击降低 30%', tone: 'jade' })
        const split = splitFormationDamage(formation, mainShield, livingFighters, incoming, parry.absorb)
        const hit = resolveIncomingPhysicalDamage(
          mainShield, split.damage, hpState.ALLY_MAIN, incomingEffects, attacker.stance, split.parryAbsorb,
          { round, events, rng, critical, shieldMultiplier, ordinaryCreature, attackerCombat: attacker.combat, element: contact.element, outer,
            ignoreTriggeredProtection: isWipeoutRound ? true : undefined },
        )
        const cover = !enduringHits && !isWipeoutRound && !parry.caught ? leaderCover(hit.uncappedDamage, round, guarding, formation) : undefined
        const redirected = cover?.amount ?? 0
        const uncappedDamage = hit.uncappedDamage - redirected
        const damageAfterCover = Math.min(hpState.ALLY_MAIN, uncappedDamage)
        const fullCover = redirected > 0 && uncappedDamage === 0
        const mainContact = !fullCover || (hit.shieldEvent.shieldAbsorbed ?? 0) > 0
        if (cover) counterSegments.push({ type: 'tag', text: `${cover.member.view.name} · ${cover.effect.sourceName} · 分摊 ${redirected.toLocaleString()}`, tone: 'jade' })
        const lastStandHp = !isWipeoutRound && canCounterLethal(mainShield, lethalSaves, hpState.ALLY_MAIN, damageAfterCover, round)
          ? lastStand(mainShield, hpState.ALLY_MAIN, attacker, round) : undefined
        const hpBefore = lastStandHp ?? hpState.ALLY_MAIN
        const pendingDamage = Math.min(hpBefore, uncappedDamage)
        const saved = resolveLethalSave(isWipeoutRound ? undefined : lethalSaves, mainShield, hpBefore, pendingDamage, round)
        const takenDamage = saved?.damage ?? pendingDamage
        hpState.ALLY_MAIN = hpBefore
        const hpLost = Math.min(hpState.ALLY_MAIN, takenDamage)
        hpState.ALLY_MAIN = Math.max(0, hpState.ALLY_MAIN - takenDamage)
        const rageGain = mainContact
          ? resolveHitRage(rageState.ALLY_MAIN, guarding ? 0 : STANDARD_HIT_RAGE, hpLost, incomingEffects, formation)
          : { gained: 0, segments: [] }
        rageState.ALLY_MAIN += rageGain.gained
        if (guarding && rightUnit) {
          const rComp = rightCompanion
          events.push({
            round,
            type: 'GUARD_BLOCK',
            actorSlot: 'ALLY_RIGHT',
            targetSlot: 'ALLY_MAIN',
            ...enemyCast,
            hitResult: parried ? 'PARRY' : critical ? 'CRIT' : undefined,
            hpDelta: takenDamage > 0 ? -takenDamage : 0,
            ...hit.shieldEvent,
            rageDelta: rageGain.gained || undefined,
            rageTargetSlot: rageGain.gained > 0 ? 'ALLY_MAIN' : undefined,
            segments: [
              { type: 'actor', name: enemyActor.name, isAlly: false },
              { type: 'text', text: '一招攻来，' },
              { type: 'actor', name: rightUnit.name, isAlly: true },
              { type: 'text', text: `用「${rComp?.assistSkillName ?? '玉箫封穴'}」帮你挡下一部分，你受到 ` },
              { type: 'damage', value: takenDamage, category: 'phys' },
              ...counterSegments,
              ...split.segments,
              ...hit.segments,
              ...rageGain.segments,
            ],
          })
        } else {
          const hasReflect = !retaliation && loadout.stance === 'TAICHI'
          const reflectSegments: RichSegment[] = []
          const reflectDmg = hasReflect
            ? Math.min(hpState[enemyActorSlot], applyTargetDamageBonuses(Math.round(takenDamage * 0.38),
                attacker, hpState[enemyActorSlot], active, reflectSegments))
            : 0
          if (reflectDmg > 0) {
            hpState[enemyActorSlot] = Math.max(0, hpState[enemyActorSlot] - reflectDmg)
          }

          const enemySegs: RichSegment[] = [
            { type: 'actor', name: enemyActor.name, isAlly: false },
            { type: 'text', text: enemySkill ? `使出「${enemySkill.name}」击中了你，伤害 ` : '击中了你，伤害 ' },
            { type: 'damage', value: takenDamage, category: 'phys', isCrit: critical || undefined },
            ...counterSegments,
            ...split.segments,
            ...hit.segments,
            ...rageGain.segments,
          ]
          if (reflectDmg > 0) {
            enemySegs.push(
              { type: 'text', text: '。你反弹伤害 ' },
              { type: 'damage', value: reflectDmg, category: 'reflect' },
              ...reflectSegments,
            )
          }

          events.push({
            round,
            type: 'SKILL_CAST',
            actorSlot: enemyActorSlot,
            targetSlot: 'ALLY_MAIN',
            ...enemyCast,
            hitResult: parried ? 'PARRY' : critical ? 'CRIT' : 'HIT',
            hpDelta: takenDamage > 0 ? -takenDamage : 0,
            ...hit.shieldEvent,
            reflectDelta: reflectDmg > 0 ? -reflectDmg : undefined,
            rageDelta: rageGain.gained || undefined,
            rageTargetSlot: rageGain.gained > 0 ? 'ALLY_MAIN' : undefined,
            segments: enemySegs,
          })
          reactToEnemyDamage(attacker, reflectDmg, hpState[enemyActorSlot], mainUnit.slot, round, events)
        }
        if (saved) {
          hpState.ALLY_MAIN = saved.savedHp
          hpState[enemyActorSlot] = applyLethalSave(saved, defense, attacker, hpState[enemyActorSlot], events)
        }
        if (!isWipeoutRound && !mainShield.retreated) {
          if (pendingDamage >= hpBefore) transferSoloStatuses(mainShield, round)
          triggerLowHpEffects(mainShield, hpBefore, hpState.ALLY_MAIN, active, round, events)
          hpState.ALLY_MAIN = useCriticalHitPill(mainShield, hpState.ALLY_MAIN, critical, hpLost, active, round, events)
          mp = recoverHitMp(mainUnit, hpState.ALLY_MAIN, mp, hpLost, active, round, events)
          mp = recoverPoisonMp(mainUnit, hpState.ALLY_MAIN, mp, hit.poisonRecovery, round, events)
          if (critical && mainContact) hpState[enemyActorSlot] = reflectCriticalPoison(mainUnit, attacker, hpState[enemyActorSlot], currentEnemyAtk, active, round, events)
        }
        if (mainShield.retreated) return
        if (cover) {
          const { member: protector, effect } = cover
          const slot = protector.fighter.unit.slot
          const source = { ...effect, slot }
          if (!effect.repeat && (effect.trigger === 'HEAVY' || effect.trigger === 'LETHAL')) usedCovers.add(protector.fighter.unit.id)
          if (hpState[slot] > 0) receiveSoloDamage(protector.fighter, {
            source, attacker, damage: redirected, round, label: '代承', critical, ordinaryCreature, element: contact.element, outer,
            hitResult: fullCover ? (critical ? 'CRIT' : 'HIT') : undefined,
            attack: fullCover ? currentEnemyAtk : undefined, melee: fullCover && !contact.ranged,
            hitRage: fullCover ? { current: rageState[slot], base: STANDARD_HIT_RAGE } : undefined,
          })
          if (fullCover) {
            const protection = allyEffects(protector.fighter)
            applyIncomingStatuses(attacker, hpState[enemyActorSlot], protector.fighter, hpState[slot], protection, round, rng, events, currentEnemyAtk, contact.weaponSuppressed)
            enemyTechniqueOnHit(attacker, enemySkill, currentEnemyAtk, hpState[enemyActorSlot], protector.fighter, hpState[slot], false, protection, round, rng, events)
          }
          if (effect.cleanseTeam) cleanseParty(source, round)
          if (effect.status) applyBattleStatus(source, effect.status, slot, attacker, { hp: hpState[enemyActorSlot] }, round, rng, events)
          if (effect.poison) applyPeriodicOnHit(source, attacker, hpState[enemyActorSlot], effect.poison, { round, attack: protector.stats.atk, rng }, events)
          if (effect.counter && canAssist(protector.fighter, round)) {
            const retaliated = effect.counter.target === 'ATTACKER' ? attacker : pickCompanionTarget('FRONT', round)
            if (retaliated && hpState[retaliated.unit.slot] > 0) {
              strikeByCompanion(protector, { stance: effect.counter.stance, target: 'FRONT', skillId: effect.counter.skillId }, retaliated, round,
                { sourceId: effect.sourceId, tag: `${effect.sourceName} · 反击`, sequence: 1, extra: source })
            }
          }
        }
        if (formation) receiveFormationShares(split.shares, formation, attacker, round, critical, ordinaryCreature, contact.element, outer)
        if (mainShield.retreated) return
        if (!isWipeoutRound && !parry.caught && !fullCover) {
          applyIncomingStatuses(attacker, hpState[enemyActorSlot], mainShield, hpState.ALLY_MAIN, active, round, rng, events, currentEnemyAtk, contact.weaponSuppressed)
          enemyTechniqueOnHit(attacker, enemySkill, currentEnemyAtk, hpState[enemyActorSlot], mainShield, hpState.ALLY_MAIN, parried, active, round, rng, events)
          hpState[enemyActorSlot] = resolveReceivePeriodic(mainShield, hpState.ALLY_MAIN, active, {
            attacker, attackerHp: hpState[enemyActorSlot], defenderAttack: pDerived.atk, round, rng,
          }, events)
        }
        cleanseOnBondSave(saved?.effect.sourceId, round)
        if (parry.caught) hpState[enemyActorSlot] = finishBladeCatch(parry.caught, mainUnit, attacker, hpState[enemyActorSlot], incoming, round, active, rng, events)
        if (parried) {
          const result = resolveParryEffects({ ...mainShield, hp: hpState.ALLY_MAIN, def: defense, hpLost, effects: active },
            attacker, hpState[enemyActorSlot], round, events)
          hpState.ALLY_MAIN = result.hp
          hpState[enemyActorSlot] = result.attackerHp
        }
        if (retaliation && !parry.caught && hpState[enemyActorSlot] > 0) {
          hpState[enemyActorSlot] = resolveMeleeRetaliation(retaliation, attacker, {
            attackerHp: hpState[enemyActorSlot], attackerAtk: currentEnemyAtk,
            hpLost, defenderSlot: mainUnit.slot, defenderAtk: pDerived.atk, round,
          }, active, events)
          hpState[enemyActorSlot] = resolvePoisonBurst(mainUnit, attacker, hpState[enemyActorSlot], active, round, events)
        }
        hpState[enemyActorSlot] = resolveHitReflection(mainUnit, attacker, hpState[enemyActorSlot], hpLost, incomingEffects, round, events)
      }
    }
  }

  const usedCleanses = new Set<string>()
  function takeEnemyTurn(round: number, attacker: EnemyBattleState) {
    if (meridians) {
      // 冲击来自自身经脉，保命效果照常判定。
      const pulse = applyDirectedDamage({
        fighter: mainShield, hp: hpState.ALLY_MAIN, defense: 0,
        effects: effectsDuringAction(effects, mainShield, round), saves: lethalSaves,
      }, {
        source: { sourceId: 'baituo_meridian_trial', sourceName: '逆转经脉' },
        attacker, attackerHp: hpState[attacker.unit.slot], damage: meridians.initialDamage + (round - 1) * meridians.damageStep,
        round, label: '逆行冲击', ignoreDamageReduction: true,
      }, events)
      hpState.ALLY_MAIN = pulse.hp
      return
    }
    const before = events.length
    enemyTurn(attacker, round)
    if (enduringHits && attacker.unit.slot === 'ENEMY_MAIN' && events.slice(before).some((event) =>
      event.type === 'SKILL_CAST' && event.actorSlot === 'ENEMY_MAIN' && event.targetSlot === 'ALLY_MAIN' &&
      (event.hitResult === 'HIT' || event.hitResult === 'CRIT' || event.hitResult === 'PARRY'))) {
      receivedHits++
      events.push({
        round, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', effectSourceId: 'battle_objective',
        segments: [{ type: 'tag', text: `硬接${attacker.unit.name}第 ${receivedHits} 掌`, tone: 'gold' }],
      })
    }
    if (canContinue()) {
      for (const { fighter, support } of companions) {
        if (!canAssist(fighter, round) || usedCleanses.has(fighter.unit.id)) continue
        const cleanse = support.find((effect) => effect.kind === 'FIRST_LEADER_CLEANSE')
        if (cleanse && cleanseControlStatus(mainShield, cleanse.status, { ...cleanse, slot: fighter.unit.slot }, round, events)) {
          usedCleanses.add(fighter.unit.id)
        }
      }
    }
    rewardKills(round)
  }

  const retreat = params.tryRetreat && canRetreat && effects.find((effect) => effect.kind === 'RETREAT_CHANCE')
  if (retreat) {
    const { percent: chance } = retreat
    if (chance === 100 || rng() * 100 < chance) mainShield.retreated = true
    events.push({
      round: 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN', effectSourceId: retreat.sourceId,
      statusApplied: mainShield.retreated ? '脱身' : undefined,
      segments: [{ type: 'tag', text: `${retreat.sourceName} · ${mainShield.retreated ? '成功撤退' : '撤退失败'}（${chance}%）`,
        tone: mainShield.retreated ? 'jade' : 'red' }],
    })
  }
  const scare = canRetreat && !mainShield.retreated && effects.find((effect) => effect.kind === 'SCARE_CREATURE')
  if (scare) for (const enemy of enemies.values()) {
    if (!enemy.combat?.creature || (enemy.isBoss && !enemy.combat.scareable) || rng() * 100 >= scare.chancePercent) continue
    const slot = enemy.unit.slot
    const hp = hpState[slot]
    hpState[slot] = 0
    events.push({
      round: 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: slot, effectSourceId: scare.sourceId,
      hpDelta: -hp, statusApplied: '吓退',
      segments: [{ type: 'tag', text: `${scare.sourceName} · 吓退${enemy.unit.name}`, tone: 'jade' }],
    })
  }
  for (let round = 1; round <= Math.min(objective?.rounds ?? maxRounds, maxRounds); round++) {
    if (!canContinue() || !livingTarget(round)) break
    if (round >= enrageStartRound && !isEnraged) {
      isEnraged = true
      const enraged = attackingEnemy().unit
      events.push({
        round,
        type: 'BOSS_ENRAGE',
        actorSlot: enraged.slot,
        segments: [
          { type: 'tag', text: '首领狂暴', tone: 'red' },
          { type: 'text', text: ` ${enraged.name}久战不克，走火入魔陷入【狂暴】！周身杀气逆冲，招式威力暴涨且无法闪避！` },
        ],
      })
    }
    for (const enemy of enemies.values()) if (hpState[enemy.unit.slot] > 0) {
      prepareEnemyRound(enemy, round, events)
      distractHeartDemon(enemy, round)
      const palace = enemy.combat?.ninePalace
      if (palace && enemy.palaceGate?.opening) {
        const guide = companions.find(({ view, fighter, stats }) => view.id === 'huangrong' &&
          stats.intStat >= palace.minInsight && canAssist(fighter, round))
        if (guide) {
          enemy.palaceGuide = guide.fighter.unit.slot
          events.push({
            round, type: 'EFFECT', actorSlot: guide.fighter.unit.slot, targetSlot: enemy.unit.slot, effectSourceId: guide.view.id,
            segments: [{ type: 'tag', text: `黄蓉 · 悟性 ${guide.stats.intStat} · 推演生门，可直取中宫`, tone: 'jade' }],
          })
        }
      }
    }
    const quiz = params.puzzleOutcome
    if (quiz?.round === round && hpState.ENEMY_MAIN > 0) {
      const opponent = enemies.get('ENEMY_MAIN')!
      events.push({
        round, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: opponent.unit.slot, effectSourceId: quiz.sourceId,
        segments: [{ type: 'tag', text: quiz.sourceName, tone: quiz.correct ? 'jade' : 'gold' }, { type: 'text', text: ` ${quiz.text}` }],
      })
      for (const rule of quiz.statuses ?? []) {
        applyBattleStatus(quiz, rule, 'ALLY_MAIN', opponent, { hp: hpState[opponent.unit.slot] }, round, rng, events)
      }
    }
    const livingAllies = allies.filter(({ unit }) => hpState[unit.slot] > 0)
    if (hpState.ALLY_MAIN > 0) useRoundStartPill(mainShield, effects, livingAllies, round, rng, events)
    const openingDodgeTargets = round === 1 ? livingAllies.map((target) => {
      const member = companionFor(target)
      return {
        target, hp: hpState[target.unit.slot], cap: member?.stats.dodgeCap ?? playerDodgeCap,
        dodge: member?.stats.dodge ?? (target === mainShield ? pDerived.dodge : 0),
      }
    }) : []
    startStatusRound(mainShield, effects, enemies.values(), (enemy) => hpState[enemy.unit.slot], round, rng, events, livingAllies)
    if (round === 1) grantOpeningTeamDodge(mainShield, effects, openingDodgeTargets, rng, events)
    const active = effectsDuringAction(effects, mainShield, round)
    grantRoundShields(mainUnit, active, livingAllies, round, events)
    for (const { fighter, equipment, support } of companions) {
      if (hpState[fighter.unit.slot] <= 0) continue
      startStatusRound(fighter, equipment.effects, enemies.values(), (enemy) => hpState[enemy.unit.slot], round, rng, events, livingAllies)
      if (support.length && canAssist(fighter, round)) {
        startStatusRound(fighter, support, enemies.values(), (enemy) => hpState[enemy.unit.slot], round, rng, events, livingAllies)
        if (round === 1) grantOpeningTeamDodge(fighter, support, openingDodgeTargets, rng, events)
      }
      grantRoundShields(fighter.unit, effectsDuringAction(equipment.effects, fighter, round), livingAllies, round, events)
    }
    if ((harmony || friction) && companions.every(({ fighter }) => hpState[fighter.unit.slot] > 0) && hpState.ALLY_MAIN > 0) {
      if (harmony) rageState.ALLY_MAIN = startHarmony(mainShield, pDerived.speed, rageState.ALLY_MAIN, harmony, round, events)
      else applyAlignmentFriction(mainShield, pDerived.speed, round, events)
      for (const { fighter, stats } of companions) {
        const slot = fighter.unit.slot
        if (harmony) rageState[slot] = startHarmony(fighter, stats.speed, rageState[slot], harmony, round, events)
        else applyAlignmentFriction(fighter, stats.speed, round, events)
      }
    }
    const roundTarget = livingTarget(round)
    if (mainShield.weapons.length && roundTarget && (round === 1 || round === 3)) {
      useHiddenWeapon(roundTarget, round === 1 ? 'BATTLE_START' : 'ROUND_THREE', round)
      rewardKills(round)
      if (!canContinue() || !livingTarget(round)) {
        const next = nextOpponents[opponentIndex]
        if (next && canContinue()) {
          enterOpponent(next, round + 1)
          continue
        }
        break
      }
    }
    const attacker = attackingEnemy()
    const enemyTurns = [attacker, ...[...enemies.values()].filter((enemy) =>
      enemy !== attacker && hpState[enemy.unit.slot] > 0 && enemy.combat?.joinsRound)]
    if (!enduringHits && round < maxRounds) for (const { fighter, support } of companions) {
      const ownPlan = support.find((effect) => effect.kind === 'COMPANION_TURN_STATUS')
      const plan = bondPlan?.companionId === fighter.unit.id ? bondPlan : ownPlan
      if (!plan || round % plan.every !== 0 || !canAssist(fighter, round)) continue
      const strongest = enemyTurns.map((enemy) => ({ enemy, threat: enemyAttackThreat(enemy, round) })).sort((a, b) => b.threat - a.threat)[0]
      if (!strongest?.threat) continue
      const source = { sourceId: plan.sourceId, sourceName: plan.sourceId === fighter.unit.id ? plan.moveName : `${plan.sourceName} · ${plan.moveName}` }
      applyBattleStatus(source, plan.rule, fighter.unit.slot, strongest.enemy, { hp: hpState[strongest.enemy.unit.slot] }, round, rng, events)
    }
    const playerSpeed = battleSpeed(mainShield, pDerived.speed, round)
    enemyFormation?.advance(round, hpState.ALLY_MAIN > 0 ? [{ fighter: mainShield, speed: playerSpeed }] : [])
    const turns = [
      ...(enduringHits || meridians ? [] : [{ enemy: undefined, time: round === 1 && opening ? -Infinity : actionTime(playerSpeed, actionAdvance) }]),
      ...enemyTurns.map((enemy) => ({ enemy, time: actionTime(enemySpeed(enemy, round)) })),
    ].sort((a, b) => a.time - b.time)
    for (const turn of turns) {
      if (!canContinue() || !livingTarget(round)) break
      if (!turn.enemy) playerTurn(round)
      else {
        const actor = enemyTurns.length === 1 ? attackingEnemy() : turn.enemy
        if (hpState[actor.unit.slot] > 0) takeEnemyTurn(round, actor)
      }
    }
    if (mainShield.retreated || fallenEscort() || objectiveEnded() || (!livingTarget(round) && !nextOpponents[opponentIndex])) break

    if (hpState.ALLY_MAIN > 0) {
      const statusTarget = statusBurst && livingTarget(round)
      if (statusBurst && statusTarget && bihaiSlot && lingsheSlot) {
        const slot = statusTarget.unit.slot
        hpState[slot] = resolveDualStatusBurst(statusBurst, statusTarget, hpState[slot], {
          attack: pDerived.atk, bihaiSlot, lingsheSlot, round,
          boss: slot === 'ENEMY_MAIN' && !!enemyMain.isBoss,
        }, events)
      }
      const venomOwner = allies.find((fighter) => hpState[fighter.unit.slot] > 0 && allyEffects(fighter).some((effect) => effect.kind === 'POISON_BURST'))
      const venomEffects = venomOwner ? effectsDuringAction(allyEffects(venomOwner), venomOwner, round) : []
      for (const enemy of enemies.values()) {
        const slot = enemy.unit.slot
        const hp = venomOwner ? resolvePoisonBurst(venomOwner.unit, enemy, hpState[slot], venomEffects, round, events) : hpState[slot]
        hpState[slot] = resolveDamageOverTime(enemy, hp, round, events)
        rewardKills(round)
      }
    }

    const restoration = allies.filter(({ unit }) => !unit.slot.startsWith('ALLY_ESCORT_')).map((fighter) => ({
      fighter, hp: hpState[fighter.unit.slot], effects: allyEffects(fighter),
    }))
    restorePartyRound(restoration, round, events)
    for (const { fighter, hp } of restoration) hpState[fighter.unit.slot] = hp
    for (const fighter of allies) {
      const slot = fighter.unit.slot
      const member = companionFor(fighter)
      const protection = effectsDuringAction(allyEffects(fighter), fighter, round)
      hpState[slot] = resolveDamageOverTime(fighter, hpState[slot], round, events, {
        effects: protection, saves: fighter === mainShield ? lethalSaves : member?.lethalSaves,
        recoverPoison: (hp, recovery) => {
          if (member) member.mp = recoverPoisonMp(fighter.unit, hp, member.mp, recovery, round, events)
          else if (fighter === mainShield) mp = recoverPoisonMp(mainUnit, hp, mp, recovery, round, events)
        },
        beforeLethal: (source, hp) => lastStand(fighter, hp, enemies.get(source), round),
        reflectPoison: (effect, source) => {
          const attacker = enemies.get(source)
          if (attacker) hpState[source] = reflectLethalPoison(fighter, effect, attacker, hpState[source], round, events)
        },
        onLethal: (source, saved) => {
          const attacker = enemies.get(source)
          if (saved && attacker) hpState[source] = applyLethalSave(saved, allyDefense(fighter, round), attacker, hpState[source], events)
          else if (saved) recordLethalSave(saved, events)
          if (fighter.retreated) return
          cleanseOnBondSave(saved?.effect.sourceId, round)
          transferSoloStatuses(fighter, round)
        },
      })
      if (mainShield.retreated) break
      rewardKills(round)
      hpState[slot] = resolveHealing(fighter, hpState[slot], effectsDuringAction(effects, mainShield, round), {
        trigger: 'ROUND_END', round, isOwner: slot === 'ALLY_MAIN',
      }, events)
      if (member) {
        const personal = effectsDuringAction(member.equipment.effects, fighter, round)
        member.mp = recoverRoundMp(fighter.unit, hpState[slot], member.mp, personal, round, events)
      }
      expireTimedShield(fighter, round, events)
    }
    if (mainShield.retreated) break
    for (const { fighter, equipment, support } of companions) {
      if (hpState[fighter.unit.slot] <= 0) continue
      const personal = effectsDuringAction(equipment.effects, fighter, round)
      for (const recipient of allies) {
        const slot = recipient.unit.slot
        const source = { trigger: 'ROUND_END' as const, round, isOwner: recipient === fighter, sourceSlot: fighter.unit.slot }
        hpState[slot] = resolveHealing(recipient, hpState[slot], personal, source, events)
        if (canAssist(fighter, round)) hpState[slot] = resolveHealing(recipient, hpState[slot], support, source, events)
      }
    }
    mp = recoverRoundMp(mainUnit, hpState.ALLY_MAIN, mp, effects, round, events)
    for (const fighter of allies) endStatusRound(fighter, round, events)
    for (const enemy of enemies.values()) {
      if (hpState.ALLY_MAIN > 0) recoverEnemyRoundMp(enemy, hpState[enemy.unit.slot], round, events)
      endStatusRound(enemy, round, events)
    }

    if (surviveRounds && round >= surviveRounds && canContinue()) {
      survived = true
      break
    }
    const next = nextOpponents[opponentIndex]
    if (next && canContinue() && !livingTarget(round)) enterOpponent(next, round + 1)
  }

  const enemyDead = opponentIndex === nextOpponents.length && [...enemies.values()].every(({ unit }) => hpState[unit.slot] <= 0)
  let metGoal = enemyDead || survived
  if (objective?.kind === 'DISARM') metGoal = disarmed()
  if (objective?.kind === 'COMPOSURE' || meridians) metGoal = survived
  if (objective?.kind === 'ENDURE_HITS') metGoal = receivedHits >= objective.rounds
  const winner: 'ALLY' | 'ENEMY' = !mainShield.retreated && !partyDefeated() && metGoal ? 'ALLY' : 'ENEMY'
  appendGaibangLootBonus(player, 'ALLY_MAIN', events)
  if (objective) {
    const round = events.at(-1)?.round ?? 1
    const won = winner === 'ALLY'
    let result: string
    if (objective.kind === 'HOLD_FORMATION') {
      const fallen = fallenFormationMember()
      const eye = escorts[0]
      if (fallen) result = `${fallen.name}倒下，阵眼失守`
      else if (won && eye) {
        const outcome = enemyDead ? `击退${enemyMain.name}` : `守满 ${objective.rounds} 回合`
        result = `${outcome}，阵眼${eye.name}剩余气血 ${hpState[eye.slot].toLocaleString()}`
      } else result = '北斗阵未能守成'
    } else if (meridians) {
      if (!enoughRoot) result = `基础根骨 ${player.stats.con} 未达 ${meridians.minCon}`
      else if (won) result = `撑过 ${meridians.rounds} 轮逆行冲击，剩余气血 ${hpState.ALLY_MAIN.toLocaleString()}`
      else result = `第 ${round} 回合未能撑住逆行冲击，考核失败`
    } else if (hpState.ALLY_MAIN <= 0) {
      result = '主角倒下，考核失败'
    } else if (objective.kind === 'DISARM') {
      if (won) result = `第 ${round} 回合卸下${enemyMain.name}的兵刃，对方仍存活`
      else if (hpState.ENEMY_MAIN <= 0) result = `${enemyMain.name}倒下，未达成卸械条件`
      else result = `${objective.rounds} 回合内未能卸下${enemyMain.name}的兵刃`
    } else if (objective.kind === 'COMPOSURE') {
      if (won) result = `撑过 ${objective.rounds} 回合，心神不乱`
      else if (lostComposure()) result = `第 ${round} 回合心神混乱，考核失败`
      else result = `未完成 ${objective.rounds} 回合守战`
    } else if (objective.kind === 'ENDURE_HITS') {
      result = won ? `接满 ${objective.rounds} 掌，主角仍站立` : `只接下 ${receivedHits} 掌，考核未通过`
    } else {
      result = won ? `第 ${round} 回合击倒${enemyMain.name}` : `${objective.rounds} 回合内未击倒${enemyMain.name}`
    }
    events.push({
      round, type: 'EFFECT', actorSlot: 'ALLY_MAIN', effectSourceId: 'battle_objective',
      segments: [{ type: 'tag', text: result, tone: won ? 'jade' : 'red' }],
    })
  }
  if (nextOpponents.length) events.push({
    round: events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', effectSourceId: 'battle_bout',
    segments: [{
      type: 'tag', tone: winner === 'ALLY' ? 'jade' : 'red',
      text: winner === 'ALLY' ? `车轮战 · 连胜 ${nextOpponents.length + 1} 场` : `车轮战 · 第 ${opponentIndex + 1} 场未通过`,
    }],
  })
  const lostEscort = fallenEscort()
  if (lostEscort && !guardFormation) events.push({
    round: events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: lostEscort.slot,
    effectSourceId: lostEscort.id,
    segments: [{ type: 'tag', text: `${lostEscort.name}气血耗尽，护送失败`, tone: 'red' }],
  })

  return {
    battleId: `bt_${Date.now()}`,
    sceneTitle,
    mode,
    stanceBanner: firstStanceBanner,
    units,
    winner,
    retreated: mainShield.retreated,
    ...(winner === 'ALLY' && survived && !enemyDead ? { survivedRounds: surviveRounds } : {}),
    events,
    rewards: winner === 'ALLY' && rewards ? { ...rewards, silver: gaibangSilverGain(player, rewards.silver) } : undefined,
  }
}

type FighterSnapshot = { player: PlayerDTO; loadout: LoadoutPresetDTO; learnedSkills: Readonly<Record<string, number>>; bonus?: CollectionBonus }
type DuelSnapshot = FighterSnapshot & { companionOf?: typeof defaultCompanionOf }

export function simulatePlayerDuel(params: {
  battleId: string; sceneTitle: string; mode: 'PVP_HUASHAN' | 'PVP_AMBUSH'; lineup: readonly [DuelSnapshot, DuelSnapshot];
  rng?: () => number; environment?: BattleEnvironment; escort?: true; huashan?: true;
}): BattleReportDTO {
  const { battleId, sceneTitle, mode, lineup, huashan } = params
  const rng = params.rng ?? Math.random
  const environment = params.environment ?? battleEnvironmentAt(lineup[0].player.currentMapId)
  const hpOf = (member: { hp: number }) => member.hp
  type DuelStats = ReturnType<typeof deriveStats>['stats']
  type DuelUnitOptions = {
    level: number; agi: number; stance: StanceType; effects: ActiveEffect[]; combat: EnemyCombatConfig; dodgeCap: number;
    learnedSkills?: Readonly<Record<string, number>>; outer?: SkillConfig; ultimate?: SkillConfig; light?: SkillConfig;
    weapon?: (typeof ITEMS)[string]; attack?: CompanionConfig['battleAttack']; support?: ActiveEffect[];
    schoolMember?: MartialSchoolMember;
  }
  function prepareUnit(unit: CombatUnitDTO, stats: DuelStats, options: DuelUnitOptions) {
    const parry = Math.min(100, stats.parry + (huashan && options.stance === 'TAICHI' ? HUASHAN_TAICHI.parryPoints : 0))
    const playerGuard: NonNullable<EnemyBattleState['playerGuard']> = {
      effects: options.effects, dodge: stats.dodge, dodgeCap: options.dodgeCap,
      lightDodge: options.light ? (options.light.dodgeBonus ?? 0) * martialEffectiveness(options.light, options.schoolMember,
        options.effects.some((effect) => effect.kind === 'MARTIAL_FREEDOM')) / 100 : 0,
      parry, parryAbsorb: stats.parryAbsorb, saves: lethalSavesFrom(options.effects),
    }
    return {
      ...options, unit, stats, playerGuard, environment, hp: unit.hp, mp: unit.maxMp, rage: unit.rage, shield: 0, atk: stats.atk,
      shieldBonus: options.effects.find((effect) => effect.kind === 'TEAM_SHIELD_BONUS'),
      dodgeState: {} as DodgeEffectState, opening: openingPriority(options.effects, rng), actionAdvance: 0,
      critAction: options.effects.find((effect) => effect.kind === 'CRIT_ACTION'),
      guardedRound: 0, openedSeal: false, coverUsed: false, usedLeaderCleanse: false, regularActions: 0,
      actedRound: 0, dragonPenetratedRound: 0,
    }
  }
  type DuelUnit = ReturnType<typeof prepareUnit> & EnemyBattleState

  function makeTeam(snapshot: DuelSnapshot, side: 'ALLY' | 'ENEMY') {
    const { player, loadout, bonus } = snapshot
    const party = resolvePartyEquipment(mode === 'PVP_HUASHAN' ? { ...player, battleMedicines: undefined } : player,
      loadout, snapshot.companionOf ?? defaultCompanionOf)
    const { main: resolved, left, right, teamStats: team } = party
    const bond = left && right ? findTrioSynergy(left.view.id, right.view.id) : undefined
    const bondEffects = bond ? effectsFrom(bond) : []
    const accessory = resolved.items.find((item) => item.slot === 'ACC' && item.escortAttackPercent)
    const escortEffect = params.escort && accessory?.escortAttackPercent ? [{
      kind: 'STAT_BONUS' as const, stats: { atkPercent: accessory.escortAttackPercent }, sourceId: accessory.id, sourceName: accessory.name,
    }] : []
    const derived = deriveStats(player, loadout, resolved, bonus, [...team, ...escortEffect], environment)
    const { stats } = derived
    const sharedCombat = teamCombatEffects([...resolved.effects, ...party.companionEffects])
    const personal = resolved.effects.filter((effect) => !isSharedCombatEffect(effect))
    const weapon = resolved.items.find((item) => item.slot === 'WEAPON')
    const leader = { ...prepareUnit(playerUnit(`${side}_MAIN`, player, loadout, stats, weapon?.name), stats, {
      level: player.level, agi: derived.agi, stance: loadout.stance, dodgeCap: derived.dodgeCap,
      effects: [...personal, ...team, ...escortEffect, ...derived.environmentBonuses, ...sharedCombat],
      combat: { def: stats.def, karma: effectiveMartialStats(player, loadout).karma, alignment: SECTS.find((sect) => sect.id === player.currentSectId)?.alignment, weapon: battleWeapon(weapon) },
      outer: SKILLS[loadout.outerSkillId ?? ''], ultimate: SKILLS[loadout.ultSkillId ?? ''], light: SKILLS[loadout.lightSkillId ?? ''],
      learnedSkills: snapshot.learnedSkills, weapon, schoolMember: player,
    }), weapons: equippedHiddenWeapons(player, loadout), usedWeapons: new Set<string>() }
    const memberAt = (member: typeof left, wing: 'LEFT' | 'RIGHT'): DuelUnit | undefined => {
      if (!member) return
      const stats = deriveCompanionStats(member, player.level, `ALLY_${wing}`, team, environment)
      const { equipment, view } = member
      const slot = `${side}_${wing}` as const
      const unit: CombatUnitDTO = {
        slot, id: view.id, name: view.name, title: `${wing === 'LEFT' ? '左翼' : '右翼'}·${view.title}`,
        portraitStyle: view.portraitStyle, isPlayer: false, hp: stats.maxHp, maxHp: stats.maxHp, maxMp: stats.maxMp, rage: 0,
        weaponName: equipment.weapon?.name,
      }
      const support = effectsFrom({ id: view.id, name: view.assistSkillName, battleEffects: view.battleSupport })
      const attack = view.battleAttack
      return prepareUnit(unit, stats, {
        level: player.level, agi: stats.agi, dodgeCap: stats.dodgeCap, stance: equipment.use?.stance ?? attack?.stance ?? loadout.stance,
        combat: { def: stats.def, alignment: COMPANIONS[view.id].alignment, karma: stats.attributes.karma, weapon: battleWeapon(equipment.weapon) },
        effects: [...equipment.effects.filter((effect) => !isSharedCombatEffect(effect)), ...team, ...sharedCombat], support, attack: equipment.use?.outerSkillId
          ? { ...attack, stance: equipment.use.stance ?? attack?.stance ?? loadout.stance, target: attack?.target ?? 'FRONT', everyRound: true }
          : attack,
        outer: SKILLS[equipment.use?.outerSkillId ?? attack?.skillId ?? ''], ultimate: equipment.ultimate, weapon: equipment.weapon,
      })
    }
    const front = memberAt(left, 'LEFT')
    const rear = memberAt(right, 'RIGHT')
    const companions = [front, rear].filter((member): member is DuelUnit => !!member)
    const members: DuelUnit[] = [leader, ...companions]
    const sharedSave = lethalSavesFrom(bondEffects)[0]
    if (sharedSave) for (const member of members) member.playerGuard.saves = lethalSavesFrom([...member.effects, sharedSave])
    return {
      leader, front, rear, companions, members, bond, bondEffects, sharedSave, harmony: party.harmony, friction: party.friction,
      addedCrit: derived.addedCrit, addedDodge: derived.addedDodge, intercepted: false,
    }
  }
  const ally = makeTeam(lineup[0], 'ALLY')
  const enemy = makeTeam(lineup[1], 'ENEMY')
  const teams = [ally, enemy] as const
  type DuelTeam = typeof ally
  const members = teams.flatMap((team) => team.members)
  const teamOf = (unit: DuelUnit) => unit.unit.slot.startsWith('ALLY') ? ally : enemy
  const rivalsOf = (unit: DuelUnit) => teamOf(unit) === ally ? enemy : ally
  const bySlot = new Map(members.map((unit) => [unit.unit.slot, unit]))
  const living = (team: DuelTeam) => team.members.filter((unit) => unit.hp > 0)
  const canHelp = (unit: DuelUnit | undefined, round: number): unit is DuelUnit => !!unit && unit.hp > 0 && !blockingActionStatus(unit, round)
  const bondIsActive = (team: DuelTeam) => team.companions.length === 2 && team.companions.every((unit) => unit.hp > 0)
  const canContinue = () => ally.leader.hp > 0 && enemy.leader.hp > 0
  const stanceBanner = { allyStance: ally.leader.stance, enemyStance: enemy.leader.stance,
    ...evaluateStanceAdvantage(ally.leader.stance, enemy.leader.stance) }
  const events: BattleEventDTO[] = [{ round: 1, type: 'STANCE_CLASH', actorSlot: ally.leader.unit.slot, segments: [{ type: 'text', text: stanceBanner.description }] }]
  announceBattleEnvironment(environment, events)

  function activeEffects(member: DuelUnit, round: number) {
    return effectsDuringAction(member.playerGuard.effects, member, round)
  }

  function lastStand(member: DuelUnit, hp: number, round: number, sourceSlot: CombatUnitDTO['slot']) {
    const opponents = living(rivalsOf(member)).map((opponent) => ({ enemy: opponent, hp: opponent.hp }))
    const effects = activeEffects(member, round)
    const restored = counterBeforeDeath({
      fighter: member, hp, level: member.level, agi: member.agi, stance: member.stance, atk: member.atk,
      def: battleDefense(member, member.stats.def, round, { hp, effects }), effects,
      skill: member.ultimate, learnedSkills: member.learnedSkills, dodgeState: member.dodgeState, schoolMember: member.schoolMember,
    }, opponents, bySlot.get(sourceSlot), round, rng, events)
    if (restored !== undefined) for (const { enemy, hp } of opponents) enemy.hp = hp
    return restored
  }

  function finishLethal(member: DuelUnit, saved: ReturnType<typeof resolveLethalSave>, round: number, hp: number, sourceSlot: CombatUnitDTO['slot']) {
    member.hp = hp
    const team = teamOf(member)
    const attacker = bySlot.get(sourceSlot)
    if (team.sharedSave && (saved?.effect === team.sharedSave || !bondIsActive(team))) {
      for (const friend of team.members) friend.playerGuard.saves = friend.playerGuard.saves.filter((effect) => effect !== team.sharedSave)
    }
    if (!bondIsActive(team)) for (const friend of team.members) {
      friend.playerGuard.effects = [...friend.effects, ...(friend.support ?? [])]
    }
    if (saved) {
      const defense = battleDefense(member, member.stats.def, round, { hp, effects: activeEffects(member, round) })
      if (attacker && attacker !== member) attacker.hp = applyLethalSave(saved, defense, attacker, attacker.hp, events)
      else recordLethalSave(saved, events)
    }
    transferLethalStatuses(member, activeEffects(member, round), living(rivalsOf(member)), hpOf, round, events)
    return member.hp
  }

  for (const team of teams) {
    appendStatBonusEffects(team.leader.unit, team.leader.effects, team.addedCrit, team.addedDodge, events)
    for (const member of team.members) {
      const guard = member.playerGuard
      guard.effects = [...member.effects, ...(member.support ?? []), ...team.bondEffects.filter((effect) => effect.kind === 'CONTROL_IMMUNITY')]
      guard.beforeLethal = (hp, round, sourceSlot) => lastStand(member, hp, round, sourceSlot)
      guard.onLethal = (saved, round, hp, sourceSlot) => finishLethal(member, saved, round, hp, sourceSlot)
      guard.recoverPoison = (hp, recovery, round) => {
        member.mp = recoverPoisonMp(member.unit, hp, member.mp, recovery, round, events)
      }
      if (huashan && member.stance === 'TAICHI') events.push({
        round: 1, type: 'EFFECT', actorSlot: member.unit.slot, targetSlot: member.unit.slot, effectSourceId: HUASHAN_TAICHI.sourceId,
        segments: [{ type: 'tag', text: `太极柔化 · 招架率 +${guard.parry - member.stats.parry} 个百分点`, tone: 'jade' }],
      })
    }
  }

  function targetAt(team: DuelTeam, position: 'FRONT' | 'REAR' | 'LOWEST_HP', round: number) {
    const candidates = living(team)
    if (position === 'LOWEST_HP') return candidates.sort((a, b) => a.hp / a.unit.maxHp - b.hp / b.unit.maxHp)[0]
    const wing = position === 'FRONT' ? team.front : team.rear
    if (wing && wing.hp > 0 && !hasStatus(wing, 'KNOCKBACK', round)) return wing
    return candidates.find((unit) => !hasStatus(unit, 'KNOCKBACK', round)) ?? candidates[0]
  }

  function useHiddenWeapon(owner: DuelTeam, target: DuelUnit, trigger: HiddenWeaponConfig['triggerCondition'], round: number) {
    const actor = owner.leader
    if (actor.hp <= 0 || target.hp <= 0) return
    target.hp = throwHiddenWeapon(actor, target, trigger, {
      hp: actor.hp, targetHp: target.hp, attack: actor.atk, level: actor.level, effects: activeEffects(actor, round), round, rng,
    }, events)
  }

  function reactToStrike(actor: DuelUnit, target: DuelUnit, hit: Pick<ReturnType<typeof performStrike>,
    'dodged' | 'contact' | 'hpLost' | 'caught' | 'rawDamage' | 'attackerAtk' | 'ranged' | 'parried' | 'critical'>, round: number, targetHp: number,
    formation?: DamageShareFormation, stance = actor.stance) {
    const defense = activeEffects(target, round)
    if (hit.dodged) {
      const gained = dodgeRageGain(target.rage, defense, 10)
      target.rage += gained
      if (gained > 0) events.push({ round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, rageDelta: gained,
        segments: [{ type: 'tag', text: `${target.unit.name} · 闪避怒气 +${gained}`, tone: 'jade' }] })
      const reaction = resolveDodgeEffects({ ...target, state: target.dodgeState, effects: defense }, actor, actor.hp, round, rng, events, false)
      target.hp = reaction.defenderHp
      actor.hp = reaction.attackerHp
      return
    }
    if (!hit.contact || actor.hp <= 0) return
    const hpLost = hit.hpLost ?? 0
    const gained = resolveHitRage(target.rage, STANDARD_HIT_RAGE, hpLost, defense, formation)
    target.rage += gained.gained
    if (gained.gained > 0) events.push({ round, type: 'EFFECT', actorSlot: target.unit.slot, targetSlot: target.unit.slot, rageDelta: gained.gained,
      segments: [{ type: 'tag', text: `${target.unit.name} · 受击怒气 +${gained.gained}`, tone: 'jade' }, ...gained.segments] })
    target.mp = recoverHitMp(target.unit, target.hp, target.mp, hpLost, defense, round, events)
    if (hit.caught) actor.hp = finishBladeCatch(hit.caught, target.unit, actor, actor.hp, hit.rawDamage ?? 0, round, defense, rng, events)
    else {
      applyIncomingStatuses(actor, actor.hp, target, target.hp, defense, round, rng, events, hit.attackerAtk)
      actor.hp = resolveReceivePeriodic(target, target.hp, defense, {
        attacker: actor, attackerHp: actor.hp, defenderAttack: target.atk, round, rng,
      }, events)
      const retaliation = (!hit.ranged && meleeRetaliationFor(defense)) ||
        (huashan && target.stance === 'TAICHI' && stance === 'FIERCE'
          ? { ...HUASHAN_TAICHI, kind: 'MELEE_RETALIATION' as const, fromHpLoss: true as const } : undefined)
      if (retaliation && actor.hp > 0) actor.hp = resolveMeleeRetaliation(retaliation, actor, {
        attackerHp: actor.hp, attackerAtk: hit.attackerAtk, hpLost, defenderSlot: target.unit.slot, defenderAtk: target.atk, round, rng,
      }, defense, events)
    }
    if (hit.parried) {
      const response = resolveParryEffects({ ...target, def: battleDefense(target, target.stats.def, round, { hp: targetHp, effects: defense }),
        hpLost, effects: defense }, actor, actor.hp, round, events)
      target.hp = response.hp
      actor.hp = response.attackerHp
    }
    if (hit.critical) actor.hp = reflectCriticalPoison(target.unit, actor, actor.hp, hit.attackerAtk, defense, round, events)
    actor.hp = resolveHitReflection(target.unit, actor, actor.hp, hpLost, defense, round, events)
    actor.hp = resolvePoisonBurst(target.unit, actor, actor.hp, defense, round, events)
  }

  function shareHit(actor: DuelUnit, recipient: DuelUnit, damage: number, source: Pick<ActiveEffect, 'sourceId' | 'sourceName'>,
    label: string, round: number, critical: boolean, skill: SkillConfig) {
    if (recipient.hp <= 0) return { lost: 0, before: 0 }
    const protection = activeEffects(recipient, round)
    const before = recipient.hp
    const hit = resolveIncomingPhysicalDamage(recipient, damage, before, protection, actor.stance, 0, {
      round, events, rng, critical, element: skill.element, attackerCombat: actor.combat, recordRewards: false, outer: skill.slot === 'OUTER',
    })
    let lost = 0
    recipient.hp = applyBonusDamage(source, { ...hit, ignoredDefense: 0 }, recipient, {
      actorSlot: actor.unit.slot, targetHp: before, round, label: `${label} ${damage.toLocaleString()}`, category: 'phys', critical: critical || undefined,
      onLoss: (amount) => { lost = amount },
    }, events)
    return { lost, before }
  }

  function coverLeader(team: DuelTeam, target: DuelUnit, damage: number, round: number) {
    if (target !== team.leader) return
    const lethal = damage >= target.hp
    const hasSave = target.playerGuard.saves.length > 0 || target.lethalGuard?.round === round
    const covers = team.companions.flatMap((unit) => {
      if (!canHelp(unit, round) || unit.coverUsed) return []
      const effect = unit.support?.find((entry) => entry.kind === 'LEADER_COVER')
      if (!effect) return []
      if (effect.cleanseTeam && bondIsActive(team) && team.sharedSave) return []
      if (effect.trigger === 'LETHAL' && (!lethal || hasSave)) return []
      if (effect.trigger === 'HEAVY' && (damage * 100 < target.unit.maxHp * 30 || (lethal && hasSave))) return []
      if (effect.trigger === 'GUARD' && (unit !== team.rear || round % 2 !== 0 || unit.guardedRound === round)) return []
      return [{ unit, effect, damage: Math.round(damage * effect.percent / 100) }]
    })
    const strongest = covers.sort((a, b) => b.damage - a.damage)[0]
    if (strongest?.damage) return { ...strongest, source: strongest.effect }
    const unit = team.rear
    if (!canHelp(unit, round) || unit.guardedRound === round || round % 2 !== 0) return
    const amount = Math.round(damage * 0.52)
    if (amount > 0) return { unit, damage: amount, effect: undefined, source: { sourceId: unit.unit.id, sourceName: `${unit.unit.name} · 右翼援护` } }
  }

  function battleStrike(actor: DuelUnit, target: DuelUnit, attack: {
    skill: SkillConfig; round: number; power: number; effects: readonly ActiveEffect[]; attackMultiplier: number; pressure?: number; stance?: StanceType;
    isUlt?: boolean; areaHit?: true; extra?: ExtraAttackSource; rageDelta?: number; mpDelta?: number;
    trueStrike?: TrueStrike; form?: AttackForm; tag?: string; sourceId?: string; noCover?: true;
  }) {
    const { round, skill, isUlt, areaHit, extra, effects, attackMultiplier } = attack
    const stance = attack.stance ?? actor.stance
    const team = teamOf(actor)
    const defenders = teamOf(target)
    const area = !!areaHit || skill.area === 'ENEMIES'
    const participants = area || attack.noCover ? [] : living(defenders)
    const formation = participants.length === 3
      ? damageShareFormation(participants.flatMap((member) => activeEffects(member, round))) : undefined
    target.formationParry = formation?.parryPoints
    let shares: { recipient: DuelUnit; damage: number }[] = []
    let cover: ReturnType<typeof coverLeader>
    let intercept: { unit: DuelUnit; damage: number; source: Pick<ActiveEffect, 'sourceId' | 'sourceName'> } | undefined
    const relation = stanceRelation(stance, target.stance)
    const reverse = relation === 'WIN' && activeEffects(target, round).some((effect) => effect.kind === 'REVERSE_STANCE_DEFENSE')
    const advantage = huashan ? 1.3 : 1.25
    const stanceMultiplier = reverse ? 0.82 : relation === 'WIN' ? advantage : relation === 'LOSE' ? 0.88 : 1
    const targetHp = target.hp
    const hit = performStrike(actor.unit, target, {
      round, targetHp, attackerHp: actor.hp, attackerLevel: actor.level, attackerAtk: Math.round(actor.atk * attackMultiplier),
      attackerDef: battleDefense(actor, actor.stats.def, round, { hp: actor.hp, effects }), power: attack.power,
      stance, stanceMultiplier, pressure: attack.pressure ?? innerPressure(actor.mp, target.mp), showPressure: true, skill,
      critPercent: actor.stats.crit + (!actor.unit.isPlayer && !isUlt ? skill.critBonus ?? 0 : 0),
      critRoll: Math.floor(rng() * 100), isUlt: !!isUlt, rageDelta: attack.rageDelta, mpDelta: attack.mpDelta,
      enraged: round >= enrageStart, extra, areaHit, weaponId: hasStatus(actor, 'DISARM', round) ? null : actor.weapon?.id,
      dodgeState: actor.dodgeState, actor, rng, trueStrike: attack.trueStrike, hasLightSkill: !!actor.light, form: attack.form,
      schoolMember: actor.schoolMember,
      guardedPosition: actor === team.rear || (actor === team.leader &&
        (canHelp(team.front, round) || (round % 2 === 0 && canHelp(team.rear, round)))),
      companion: actor.unit.isPlayer ? undefined : { sourceId: attack.sourceId ?? extra?.sourceId ?? actor.unit.id,
        tag: attack.tag ?? '伙伴协战', moveName: extra?.moveName ?? skill.name },
      huashan,
      shareDamage: formation && ((damage, preview) => {
        const result = splitFormationDamage(formation, target, participants, damage, 0)
        if (!preview) shares = result.shares
        return result
      }),
      redirectDamage: area || attack.noCover ? undefined : (damage) => {
        if (!formation) cover = coverLeader(defenders, target, damage, round)
        if (cover) return cover.damage
        if (defenders.intercepted || target === defenders.leader || damage < target.hp || !bondIsActive(defenders)) return 0
        const source = defenders.bondEffects.find((effect) => effect.kind === 'COMPANION_LETHAL_INTERCEPT')
        const partner = defenders.companions.find((member) => member !== target && canHelp(member, round))
        if (!source || !partner) return 0
        defenders.intercepted = true
        intercept = { unit: partner, damage, source }
        return damage
      },
    }, effects, events)
    target.formationParry = undefined
    target.hp = hit.targetHp
    actor.hp = hit.attackerHp
    if (hit.critical) {
      actor.actionAdvance = advanceOnCrit(actor.unit, actor.critAction, actor.actionAdvance, round, events)
      actor.rage = resolveCritRage(actor.unit, actor.rage, target, effects, round, events)
    }
    const protector = cover ?? intercept
    if (protector) {
      if (protector.unit === defenders.rear) protector.unit.guardedRound = round
      if (cover?.effect && !cover.effect.repeat && (cover.effect.trigger === 'LETHAL' || cover.effect.trigger === 'HEAVY')) protector.unit.coverUsed = true
      const { lost, before } = shareHit(actor, protector.unit, protector.damage, protector.source, '代承', round, hit.critical, skill)
      if (!hit.contact) {
        reactToStrike(actor, protector.unit, { ...hit, contact: true, parried: false, hpLost: lost }, round, before, undefined, stance)
        enemyTechniqueOnHit(actor, skill, hit.attackerAtk, actor.hp, protector.unit, protector.unit.hp, false, activeEffects(protector.unit, round), round, rng, events)
      } else {
        const protection = activeEffects(protector.unit, round)
        actor.hp = resolveHitReflection(protector.unit.unit, actor, actor.hp, lost, protection, round, events)
        protector.unit.mp = recoverHitMp(protector.unit.unit, protector.unit.hp, protector.unit.mp, lost, protection, round, events)
      }
      const effect = cover?.effect
      if (effect?.cleanseTeam) for (const member of living(defenders)) {
        cleanseControlStatus(member, 'SEAL', { ...effect, slot: protector.unit.unit.slot }, round, events)
        cleansePoison(member, { ...effect, slot: protector.unit.unit.slot }, round, events)
      }
      if (effect?.status) applyBattleStatus(effect, effect.status, protector.unit.unit.slot, actor, { hp: actor.hp, effects }, round, rng, events)
      if (effect?.poison) applyPeriodicOnHit({ ...effect, slot: protector.unit.unit.slot }, actor, actor.hp, effect.poison, {
        attack: protector.unit.atk, round, rng, protection: effects,
      }, events)
      const retaliation = effect?.counter && (effect.counter.target === 'ATTACKER' ? actor : targetAt(team, 'FRONT', round))
      if (effect?.counter && retaliation && retaliation.hp > 0 && canHelp(protector.unit, round)) {
        const counter = SKILLS[effect.counter.skillId]
        if (counter) battleStrike(protector.unit, retaliation, { skill: counter, round, power: counter.powerRatio, attackMultiplier,
          effects: [...activeEffects(protector.unit, round), ...effectsFrom(counter)], stance: effect.counter.stance, tag: `${effect.sourceName} · 反击`, sourceId: effect.sourceId, noCover: true })
      }
    }
    if (formation) for (const { recipient, damage } of shares) {
      const { lost } = shareHit(actor, recipient, damage, formation, '分摊', round, hit.critical, skill)
      const protection = activeEffects(recipient, round)
      if (formation.sharedRage && lost > 0) {
        const rage = resolveHitRage(recipient.rage, 0, lost, protection, formation)
        recipient.rage += rage.gained
        if (rage.gained > 0) events.push({ round, type: 'EFFECT', actorSlot: recipient.unit.slot, targetSlot: recipient.unit.slot,
          effectSourceId: formation.sourceId, rageDelta: rage.gained, segments: rage.segments })
      }
      actor.hp = resolveHitReflection(recipient.unit, actor, actor.hp, lost, protection, round, events)
      recipient.mp = recoverHitMp(recipient.unit, recipient.hp, recipient.mp, lost, protection, round, events)
    }
    reactToStrike(actor, target, hit, round, targetHp, formation, stance)
    if (huashan && stance === 'AGILE' && hit.landed && !extra && !areaHit && !attack.noCover &&
      !actor.openedSeal && actor.hp > 0 && target.hp > 0) {
      actor.openedSeal = true
      const sealed = protector && !hit.contact ? protector.unit : target
      applyBattleStatus(HUASHAN_AGILE, { status: 'ULT_LOCK', rounds: 1 }, actor.unit.slot, sealed,
        { hp: sealed.hp, effects: activeEffects(sealed, round) }, round, rng, events)
    }
    for (const wave of resolveStrikeSplash(actor.unit, hit.splash, target, defenders.members, hpOf, actor.level, round, effects, events,
      { stance, combat: actor.combat, rng })) wave.target.hp = wave.hp
    return hit
  }

  type DuelOuter = { actor: DuelUnit; repeat: (source: ExtraAttackSource) => void }
  function takeTurn(actor: DuelUnit, round: number, attackMultiplier: number, leaderTarget?: DuelUnit, assist?: ExtraAttackSource,
    completedOuters?: DuelOuter[]) {
    const team = teamOf(actor)
    const opposition = rivalsOf(actor)
    const active = activeEffects(actor, round)
    const disarmed = hasStatus(actor, 'DISARM', round)
    const weaponLimited = disarmed && !active.some((effect) => effect.kind === 'MARTIAL_FREEDOM')
    const ultimate = weaponUsableSkill(actor.ultimate, weaponLimited)
    const cost = ultMpCost(actor.unit)
    const ready = () => actor.rage >= 100 && actor.mp >= cost && (!disarmed || !!ultimate) &&
      (!hasStatus(actor, 'SEAL', round) || protectsPointCast(ultimate))
    if (!blockingActionStatus(actor, round)) {
      actor.mp = useLowMpPill(actor, actor.mp, active, round, events)
      useHiddenWeapon(opposition, actor, 'SELF_HP_LOW', round)
    }
    if (opposition.leader.weapons.length && ready() && !blockingActionStatus(actor, round, protectsPointCast(ultimate)) &&
      !hasStatus(actor, 'ULT_LOCK', round) && (actor.chargedUlt ? !hasStatus(actor, 'SEAL', round) : ultimate && !active.some((effect) => effect.kind === 'CHARGED_ULT'))) {
      useHiddenWeapon(opposition, actor, 'ENEMY_ULT_READY', round)
    }
    if (!canContinue() || actor.hp <= 0 || !startPlayerAction(actor, ultimate, active, ready(), round, events)) return
    announceOpening(actor.unit, round === 1 ? actor.opening : undefined, events)
    const dart = resolveActionStartDamage(actor.unit, active, opposition.members, hpOf, round, rng, events)
    if (dart) dart.target.hp = dart.hp
    if (!canContinue() || actor.hp <= 0) return
    const cast = chooseUltimate(actor, ultimate, active, ready(), round, events)
    const outer = weaponLimited && isWeaponForm(actor.outer?.combatForm ?? actor.weapon?.combatForm) ? BARE_HANDS : actor.outer ?? BARE_HANDS
    const skill = cast ?? outer
    const form = disarmed ? undefined : actor.attack?.form
    const attackingEffects = [...weaponEffects(active, actor.weapon?.id, disarmed)]
    const bondOuter = bondIsActive(team) ? team.bondEffects.filter((effect) => effect.kind === 'OUTER_DAMAGE') : []
    attackingEffects.push(...(bondOuter.length ? bondOuter : team.companions.filter((unit) => unit.hp > 0)
      .flatMap((unit) => (unit.support ?? []).flatMap((effect) =>
        effect.kind === 'TEAM_OUTER_DAMAGE' ? [{ ...effect, kind: 'OUTER_DAMAGE' as const }] : []))))
    const attack = disarmed ? undefined : actor.attack
    const companionDamage = !actor.unit.isPlayer ? living(team).flatMap((member) => activeEffects(member, round).flatMap((effect) =>
      effect.kind === 'COMPANION_DAMAGE' ? [{ ...effect, kind: 'OUTER_DAMAGE' as const }] : [])) : []
    attackingEffects.push(...companionDamage)
    const chooseTarget = (move: SkillConfig, extra?: ExtraAttackSource) => {
      if (extra?.front) return targetAt(opposition, 'FRONT', round)
      if (move.id === CHARGED_ULT_ID && opposition.leader.hp > 0) return opposition.leader
      if (move.slot === 'OUTER' && targetsRearWithWeapon(attackingEffects, extra)) return targetAt(opposition, 'REAR', round)
      if (attack?.afterLeaderHit && leaderTarget && leaderTarget.hp > 0) return leaderTarget
      const formOfMove = (move === outer ? form : undefined) ?? move.combatForm ?? (move === BARE_HANDS && !disarmed ? actor.weapon?.combatForm : undefined)
      const ranged = formOfMove === 'BOW' || formOfMove === 'PROJECTILE' || formOfMove === 'SOUND'
      return targetAt(opposition, (move === outer ? attack?.target : undefined) ?? (ranged ? 'REAR' : 'FRONT'), round)
    }
    let initial = chooseTarget(skill)
    if (!initial) return
    const attackScale = attackMultiplier * (disarmed ? 0.7 : 1)
    const currentAttack = Math.round(actor.atk * attackScale)
    const fire = (move: SkillConfig, target: DuelUnit, options: Pick<Parameters<typeof battleStrike>[2], 'areaHit' | 'extra' | 'trueStrike' |
      'rageDelta' | 'mpDelta' | 'tag' | 'sourceId' | 'pressure'> & { power?: number } = {}) => {
      const effects = [...attackingEffects, ...effectsFrom(move).filter((effect) => !attackingEffects.some((entry) => entry.sourceId === effect.sourceId))]
      const isUlt = !!cast && move === cast && !options.extra
      if (!isUlt && !options.extra && attack?.finisher && target.hp * 100 < target.unit.maxHp * attack.finisher.belowHpPercent) {
        effects.push({ kind: 'OUTER_DAMAGE', percent: attack.finisher.damagePercent, sourceId: actor.unit.id, sourceName: `${actor.unit.name} · 残血点杀` })
      }
      return battleStrike(actor, target, { skill: move, round, attackMultiplier: attackScale, effects, isUlt,
        form: move === outer ? form : undefined, ...options, power: options.power ?? skillPowerAtMastery(move, actor.learnedSkills?.[move.id]),
      })
    }
    let dealtWith: ReturnType<typeof performStrike> | undefined
    if (cast !== null) {
      const opening = !cast && actor.regularActions === 0 ? SKILLS[attack?.openingSkillId ?? ''] : undefined
      if (opening) {
        fire(opening, initial, { tag: '伙伴协战 · 起手' })
        const next = initial.hp > 0 ? initial : chooseTarget(skill)
        if (!next || actor.hp <= 0 || !canContinue()) return
        initial = next
      }
      const trueStrike = trueStrikeForAction(attackingEffects, rng)
      const rageDelta = cast ? -ultRageCost(cast, attackingEffects).cost : actor.unit.isPlayer || actor.ultimate ? gainRage(actor.rage, 35, attackingEffects) : undefined
      const mpDelta = cast ? -cost : undefined
      const primaryPressure = innerPressure(actor.mp, initial.mp)
      actor.rage += rageDelta ?? 0
      actor.mp += mpDelta ?? 0
      const support = actor.support
      const guoCombo = actor.unit.id === 'guojing' && leaderTarget ? [team.leader, ...team.companions].filter((unit) => unit.hp > 0)
        .flatMap((unit) => activeEffects(unit, round)).filter((effect) => effect.kind === 'GUOJING_COMBO').sort((a, b) => b.attackPercent - a.attackPercent)[0] : undefined
      if (support && bondIsActive(team) && actor.unit.id === 'yangkang') {
        const poison = team.bondEffects.find((effect) => effect.kind === 'COMPANION_POISON_CRIT')
        if (poison) attackingEffects.push({ ...poison, kind: 'POISON_TARGET_CRIT', points: poison.pointsPerStack, perStack: true })
      }
      const burst = !cast && attack?.burst && actor.regularActions % (attack.burst.charges + 1) === attack.burst.charges ? attack.burst : undefined
      const power = cast ? undefined : (guoCombo ? guoCombo.attackPercent / 100 : attack?.powerRatio ?? skillPowerAtMastery(skill, actor.learnedSkills?.[skill.id])) *
        (burst?.powerMultiplier ?? 1)
      dealtWith = fire(skill, initial, { rageDelta, mpDelta, trueStrike, tag: guoCombo ? `${guoCombo.sourceName} · 降龙合击` : assist?.sourceName,
        sourceId: guoCombo?.sourceId ?? assist?.sourceId, pressure: primaryPressure, power })
      if (!cast) actor.regularActions++
      if (dealtWith.landed) {
        spreadHitStatus(skill, actor.unit, initial, opposition.members, hpOf, round, rng, events)
        if (actor.unit.id === 'guojing' && dealtWith.ignoredDefense > 0) actor.dragonPenetratedRound = round
        if (!cast && attack) {
          const source = { sourceId: actor.unit.id, sourceName: actor.unit.name, slot: actor.unit.slot }
          if (attack.poison) applyPeriodicOnHit(source, initial, initial.hp, attack.poison, {
            attack: dealtWith.attackerAtk, round, rng, effects: attackingEffects, protection: activeEffects(initial, round),
          }, events)
          const rule = burst?.rule ?? attack.hitStatus
          if (rule && (rule.status !== 'KNOCKBACK' || initial.actedRound !== round)) for (const target of attack.hitStatusArea ? living(opposition) : [initial]) {
            applyBattleStatus(source, rule, actor.unit.slot, target, { hp: target.hp, effects: activeEffects(target, round) }, round, rng, events)
          }
        }
      }
      if (skill.area === 'ENEMIES') for (const target of living(opposition)) {
        if (actor.hp <= 0) break
        if (target !== initial && target.hp > 0) fire(skill, target, { areaHit: true, trueStrike })
      }
      if (actor.hp > 0) for (const area of resolveCastArea(actor.unit, { isUlt: !!cast, attack: dealtWith.attackerAtk,
        level: actor.level, stance: actor.stance, combat: actor.combat }, attackingEffects, opposition.members, hpOf, round, rng, events)) area.target.hp = area.hp
      if (canContinue() && actor.hp > 0) {
        const shot = dealtWith.critical && criticalShot(actor.critAction, rng)
        const nativeFollowUps = !actor.unit.isPlayer && !cast && !attack?.followUpShots &&
          !actor.support?.some((effect) => effect.kind === 'OUTER_FOLLOW_UP')
          ? effectsFrom(skill).filter((effect) => effect.kind === 'OUTER_FOLLOW_UP') : []
        const followUps = outerFollowUps([...attackingEffects, ...nativeFollowUps], !!cast, dealtWith.landed, rng, outer === BARE_HANDS)
        for (const extra of shot ? [shot, ...followUps] : followUps) {
          const target = chooseTarget(outer, extra)
          if (!target || actor.hp <= 0 || !canContinue()) break
          fire(outer, target, { extra })
        }
        const archery = bondIsActive(team) && actor.unit.id === 'zhebie'
          ? team.bondEffects.find((effect) => effect.kind === 'COMPANION_ARCHERY') : undefined
        const penetrated = archery && team.companions.some((unit) => unit.unit.id === 'guojing' && unit.dragonPenetratedRound === round)
        const arrows = cast ? 0 : (attack?.followUpShots ?? 0) + (archery?.extraArrows ?? 0) + Number(!!penetrated)
        for (let arrow = 0; arrow < arrows && canContinue() && actor.hp > 0; arrow++) {
          const target = chooseTarget(outer)
          if (target) fire(outer, target, { tag: '连珠神箭 · 追加一箭', sourceId: arrow >= (attack?.followUpShots ?? 0) ? archery?.sourceId : undefined })
        }
      }
      if (!cast && completedOuters) completedOuters.push({ actor, repeat(source) {
        const target = chooseTarget(outer)
        if (target && actor.hp > 0 && canContinue()) fire(outer, target, { extra: source, tag: `${source.sourceName} · 追加出手` })
      } })
    }
    actor.hp = resolveHealing(actor, actor.hp, active, { trigger: 'ACTION_END', round }, events)
    if (canContinue() && actor.hp > 0) resolveActionEndDarts(actor.unit, attackingEffects, {
      target: () => chooseTarget(skill), hpOf, setHp: (opponent, hp) => { opponent.hp = hp },
      attack: dealtWith?.attackerAtk ?? currentAttack, level: actor.level, round, rng, stance: actor.stance,
    }, events)
    return dealtWith?.landed ? initial : undefined
  }

  function roundStart(team: DuelTeam, opposition: DuelTeam, round: number) {
    const allies = living(team)
    useRoundStartPill(team.leader, team.leader.effects, allies, round, rng, events)
    const plans = bondIsActive(team) ? team.bondEffects : []
    for (const member of allies) {
      const effects = activeEffects(member, round)
      const canSupport = !member.support || !blockingActionStatus(member, round)
      startStatusRound(member, canSupport ? effects : member.effects, opposition.members, hpOf, round, rng, events, allies)
      if (round === 1 && canSupport) grantOpeningTeamDodge(member, effects, allies.map((target) =>
        ({ target, hp: target.hp, dodge: target.stats.dodge, cap: target.dodgeCap })), rng, events)
      grantRoundShields(member.unit, effects, allies, round, events)
      if (!canSupport) continue
      const plan = [...plans, ...(member.support ?? [])].find((effect): effect is Extract<ActiveEffect, { kind: 'COMPANION_TURN_STATUS' }> =>
        effect.kind === 'COMPANION_TURN_STATUS' && effect.companionId === member.unit.id && round % effect.every === 0)
      if (plan) applyBattleStatus(plan, plan.rule, member.unit.slot, opposition.leader,
        { hp: opposition.leader.hp, effects: activeEffects(opposition.leader, round) }, round, rng, events)
      const cleanse = member.support?.find((effect) => effect.kind === 'FIRST_LEADER_CLEANSE')
      if (cleanse && !member.usedLeaderCleanse && cleanseControlStatus(team.leader, cleanse.status, { ...cleanse, slot: member.unit.slot }, round, events)) {
        member.usedLeaderCleanse = true
      }
    }
    if ((team.harmony || team.friction) && bondIsActive(team)) for (const member of allies) {
      if (team.harmony) member.rage = startHarmony(member, member.stats.speed, member.rage, team.harmony, round, events)
      else applyAlignmentFriction(member, member.stats.speed, round, events)
    }
  }

  function applyRoundEndBond(team: DuelTeam, round: number) {
    const opposition = rivalsOf(team.leader)
    const burst = bondIsActive(team) && team.bondEffects.find((effect) => effect.kind === 'DUAL_STATUS_BURST')
    const target = burst && targetAt(opposition, 'FRONT', round)
    const xiao = burst && team.companions.find((member) => member.unit.id === 'huangyaoshi')
    const snake = burst && team.companions.find((member) => member.unit.id === 'ouyangfeng')
    if (burst && target && xiao && snake) target.hp = resolveDualStatusBurst(burst, target, target.hp, {
      attack: team.leader.atk, bihaiSlot: xiao.unit.slot, lingsheSlot: snake.unit.slot, round, boss: false,
    }, events)
  }

  function roundEnd(team: DuelTeam, round: number) {
    const restoration = living(team).map((fighter) => ({ fighter, hp: fighter.hp, effects: activeEffects(fighter, round) }))
    restorePartyRound(restoration, round, events)
    for (const { fighter, hp } of restoration) fighter.hp = hp
    for (const member of living(team)) {
      if (member.hp <= 0) continue
      const effects = activeEffects(member, round)
      member.hp = resolveDamageOverTime(member, member.hp, round, events, {
        effects, saves: member.playerGuard.saves, beforeLethal: (source, hp) => lastStand(member, hp, round, source),
        onLethal: (source, saved, hp) => finishLethal(member, saved, round, hp, source),
        reflectPoison: (effect, source) => {
          const attacker = bySlot.get(source)
          if (attacker) attacker.hp = reflectLethalPoison(member, effect, attacker, attacker.hp, round, events)
        },
        recoverPoison: (hp, recovery) => member.playerGuard.recoverPoison?.(hp, recovery, round),
      })
      member.hp = resolveHealing(member, member.hp, effects.filter((effect) => !member.support?.includes(effect)), { trigger: 'ROUND_END', round }, events)
      member.mp = recoverRoundMp(member.unit, member.hp, member.mp, effects, round, events)
    }
    const bondHeal = bondIsActive(team) ? team.bondEffects.find((effect) => effect.kind === 'HEAL') : undefined
    for (const provider of team.companions.filter((unit) => canHelp(unit, round))) {
      const support = provider.unit.id === 'yideng' && bondHeal ? [bondHeal] : provider.support ?? []
      for (const target of living(team)) target.hp = resolveHealing(target, target.hp, support,
        { trigger: 'ROUND_END', round, isOwner: provider === target, sourceSlot: provider.unit.slot }, events)
    }
    for (const member of team.members) {
      endStatusRound(member, round, events)
      expireTimedShield(member, round, events)
    }
  }

  const enrageStart = calcBattleEnrageRound(enemy.leader.unit.maxHp, mode)
  const lastRound = enrageStart + 4
  let tiebreak = ally
  for (let round = 1; round <= lastRound && canContinue(); round++) {
    if (round === enrageStart) for (const { leader } of teams) events.push({
      round, type: 'BOSS_ENRAGE', actorSlot: leader.unit.slot,
      segments: [{ type: 'tag', text: `${leader.unit.name} · 狂暴`, tone: 'red' }],
    })
    roundStart(ally, enemy, round)
    roundStart(enemy, ally, round)
    const openingSpeed = (member: DuelUnit) => huashan && round === 1 && member.stance === 'AGILE'
      ? Math.round(battleSpeed(member, member.stats.speed, round) * HUASHAN_AGILE.openingSpeedPercent / 100) : 0
    if (huashan && round === 1) for (const member of members) {
      const added = openingSpeed(member)
      if (added > 0) events.push({ round, type: 'EFFECT', actorSlot: member.unit.slot, targetSlot: member.unit.slot, effectSourceId: HUASHAN_AGILE.sourceId,
        segments: [{ type: 'tag', text: `奇门极速 · 首回合出手速度 +${added}`, tone: 'jade' }] })
    }
    const timing = (member: DuelUnit) => actionTime(battleSpeed(member, member.stats.speed, round) + openingSpeed(member), member.actionAdvance)
    const compareOrder = (left: DuelUnit, right: DuelUnit) =>
      (round === 1 ? Number(!!right.opening) - Number(!!left.opening) : 0) || timing(left) - timing(right)
    const order = compareOrder(ally.leader, enemy.leader)
    const first = order < 0 || (order === 0 && rng() < 0.5) ? ally : enemy
    const second = first === ally ? enemy : ally
    tiebreak = first
    if (round === 1 || round === 3) {
      const trigger = round === 1 ? 'BATTLE_START' : 'ROUND_THREE'
      useHiddenWeapon(first, second.leader, trigger, round)
      useHiddenWeapon(second, first.leader, trigger, round)
      if (!canContinue()) break
    }
    if (round === lastRound) {
      const remaining = ally.leader.hp * enemy.leader.unit.maxHp - enemy.leader.hp * ally.leader.unit.maxHp
      const victor = (remaining === 0 ? first : remaining > 0 ? ally : enemy).leader
      const loser = victor === ally.leader ? enemy.leader : ally.leader
      events.push({ round, type: 'SKILL_CAST', actorSlot: victor.unit.slot, targetSlot: loser.unit.slot, hitResult: 'HIT', hpDelta: -loser.hp,
        segments: [{ type: 'tag', text: '狂暴终结 · 以剩余气血比例定胜负', tone: 'red' }, { type: 'damage', value: loser.hp, category: 'true' }] })
      loser.hp = 0
      break
    }
    const attackMultiplier = round >= enrageStart ? 1.35 ** (round - enrageStart + 1) : 1
    const leaderHits = new Map<DuelUnit, DuelUnit>()
    const completedOuters: DuelOuter[] = []
    const turns = [...living(first), ...living(second)].sort(compareOrder)
    while (turns.length) {
      const member = turns.shift()!
      if (!canContinue()) break
      if (member.hp <= 0) continue
      const team = teamOf(member)
      const target = leaderHits.get(team.leader)
      const { attack } = member
      const requiresLeaderHit = !member.unit.isPlayer && (attack?.afterLeaderHit || member === team.front && !attack?.everyRound)
      if (requiresLeaderHit && !target) {
        const leaderTurn = turns.indexOf(team.leader)
        if (leaderTurn >= 0) turns.splice(leaderTurn + 1, 0, member)
        continue
      }
      if (attack?.requiresBond && !member.weapon && (!bondIsActive(team) || team.bond?.id !== attack.requiresBond)) continue
      const ordinary = member.unit.isPlayer || attack?.everyRound || round % 2 !== 0 || (!!target && bondIsActive(team) && !!team.bond)
      const assist = !ordinary && requiresLeaderHit ? extraCompanionAssist(living(team).flatMap((unit) => activeEffects(unit, round)), rng) : undefined
      if (!ordinary && !assist) continue
      member.actionAdvance = 0
      const hit = takeTurn(member, round, attackMultiplier, target, assist, completedOuters)
      if (member.unit.isPlayer && hit) leaderHits.set(member, hit)
    }
    for (const team of [first, second]) {
      if (!canContinue() || !bondIsActive(team)) continue
      const combo = team.bondEffects.find((effect) => effect.kind === 'ROUND_OUTER_COMBO')
      const eligible = completedOuters.filter(({ actor }) => teamOf(actor) === team && canHelp(actor, round))
      if (combo && eligible.length && rng() < combo.chancePercent / 100) {
        for (const { repeat } of eligible) repeat({ ...combo, comboIndex: 1 })
      }
    }
    if (!canContinue()) break
    applyRoundEndBond(first, round)
    if (canContinue()) applyRoundEndBond(second, round)
    if (!canContinue()) break
    roundEnd(first, round)
    roundEnd(second, round)
  }
  const winner = ally.leader.hp > 0 ? 'ALLY' : enemy.leader.hp > 0 ? 'ENEMY' : tiebreak === ally ? 'ALLY' : 'ENEMY'
  return { battleId, sceneTitle, mode, stanceBanner, units: members.map(({ unit }) => unit), winner, events }
}

export function simulateCoopRaid(
  raidId: RaidId, battleId: string, lineup: readonly [FighterSnapshot, FighterSnapshot, FighterSnapshot], rng = Math.random,
  environment = battleEnvironmentAt(COOP_RAIDS[raidId].mapId),
): BattleReportDTO {
  const raid = COOP_RAIDS[raidId]
  const survival = raid.survival
  const allySlots = ['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'] as const
  const guardSlots = ['ENEMY_LEFT', 'ENEMY_RIGHT', 'ENEMY_REAR'] as const
  const loadouts = lineup.map((fighter) => resolveBattleLoadout(fighter.loadout, fighter.player))
  const karmas = lineup.map(({ player, loadout }) => effectiveMartialStats(player, loadout).karma)
  const harmonyOwners = loadouts.flatMap(({ effects }, index) =>
    effects.filter((effect) => effect.kind === 'MIXED_KARMA_HARMONY').map((effect) => ({ effect, index })))
  const teamStats = teamStatBonuses(loadouts.flatMap(({ effects }) => effects))
  const sharedCombat = teamCombatEffects(loadouts.flatMap(({ effects }) => effects))
  const allies = lineup.map((fighter, index) => {
    const resolvedLoadout = loadouts[index]
    const { stats, addedCrit, addedDodge, dodgeCap, agi, environmentBonuses } = deriveStats(fighter.player, fighter.loadout, resolvedLoadout, fighter.bonus ?? {}, teamStats, environment)
    const weapon = resolvedLoadout.items.find((item) => item.slot === 'WEAPON')
    const unit = playerUnit(allySlots[index], fighter.player, fighter.loadout, stats, weapon?.name)
    const personal = resolvedLoadout.effects.filter((effect) => !isSharedCombatEffect(effect))
    const effects = [...personal, ...teamStats, ...sharedCombat, ...environmentBonuses]
    const dodgeState: DodgeEffectState = {}
    return {
      ...fighter, stats, addedCrit, addedDodge, dodgeCap, agi, unit, effects, dodgeState, environment, stance: fighter.loadout.stance,
      shieldBonus: effects.find((effect) => effect.kind === 'TEAM_SHIELD_BONUS'),
      freedom: resolvedLoadout.freedom, weapon, combat: { weapon: battleWeapon(weapon) },
      weapons: equippedHiddenWeapons(fighter.player, fighter.loadout),
      opening: openingPriority(effects, rng),
      critAction: effects.find((effect) => effect.kind === 'CRIT_ACTION'), actionAdvance: 0,
      lethalSaves: lethalSavesFrom(effects), hp: unit.hp, rage: unit.rage, mp: unit.maxMp, ultCost: ultMpCost(unit), shield: 0,
    }
  })
  function buildWave(group: Pick<CoopRaidConfig, 'boss' | 'guards'>, waveNumber = 1) {
    const enemyLineup: { slot: CombatUnitDTO['slot']; config: BattleOpponent }[] = [
      ...group.guards.map((config, index) => ({ slot: guardSlots[index], config })),
      { slot: 'ENEMY_MAIN', config: group.boss },
    ]
    return enemyLineup.map(({ config: enemy, slot }): EnemyBattleState & { hp: number; stance: StanceType; name: string } => {
      const unit: CombatUnitDTO = {
        slot, id: waveNumber === 1 ? slot : `${slot}_${waveNumber}`, name: enemy.name, title: enemy.title, portraitStyle: enemy.portrait,
        isPlayer: false, hp: enemy.hp, maxHp: enemy.hp, maxMp: enemy.mp, rage: 0,
      }
      return { ...enemy, unit, hp: enemy.hp, shield: 0, environment, isBoss: true }
    })
  }
  let enemies = buildWave(raid)
  const initialUnits = [...allies, ...enemies].map(({ unit }) => unit)
  const leadStance = lineup[0].loadout.stance
  function stanceFor(enemyStance: StanceType, description: string) {
    return { allyStance: leadStance, enemyStance, advantage: evaluateStanceAdvantage(leadStance, enemyStance).advantage, description }
  }
  const stanceBanner = stanceFor(raid.boss.stance, `「${lineup[0].player.nickname}」带队入阵。${raid.description}`)
  const events: BattleEventDTO[] = [
    { round: 1, type: 'STANCE_CLASH', actorSlot: 'ALLY_MAIN', segments: [{ type: 'text', text: stanceBanner.description }] },
  ]
  function announceWave(round: number, waveNumber: number) {
    const { unit, stance } = enemies.at(-1)!
    const guards = enemies.slice(0, -1).map((enemy) => enemy.unit)
    const entry = `第 ${waveNumber} 波 · ${[unit, ...guards].map(({ name }) => name).join('、')}入场`
    const segments: RichSegment[] = [{ type: 'tag', text: entry, tone: 'gold' }]
    if (waveNumber > 1) {
      for (const fighter of allies) {
        const { unit, hp, mp, rage, shield, lethalSaves } = fighter
        const status = remainingBattleStatuses(fighter, round)
        segments.push({ type: 'text', text: ` ${unit.name}${hp <= 0 ? '（已倒下）' : ''} · 气血 ${hp.toLocaleString()} · 内力 ${mp.toLocaleString()} · 怒气 ${rage} · 护盾 ${shield.toLocaleString()} · 剩余保命 ${lethalSaves.length} 次 · 异常与增益 ${status.join('、') || '无'}。` })
      }
    }
    events.push({
      round, type: 'EFFECT', actorSlot: 'ENEMY_MAIN', effectSourceId: 'raid_wave', segments,
      opponentEntry: waveNumber > 1 ? { unit, guards, stanceBanner: stanceFor(stance, entry) } : undefined,
    })
  }
  if (survival) announceWave(1, 1)
  announceBattleEnvironment(environment, events)
  for (const fighter of allies) appendStatBonusEffects(fighter.unit, fighter.effects, fighter.addedCrit, fighter.addedDodge, events)
  for (const enemy of enemies) grantShield(enemy, enemy.combat?.openingShield ?? 0, enemy.unit.slot, 1, events)

  let leader = enemies.at(-1)!
  let enemyFormation = createEnemyFormation(enemies, (enemy) => enemy.hp, events)
  const periodicAttacker = (slot: CombatUnitDTO['slot'], unitId?: string) =>
    enemies.find((enemy) => enemy.unit.slot === slot && (unitId === undefined || enemy.unit.id === unitId))
  const hasKillReward = allies.some((fighter) => fighter.effects.some((effect) =>
    effect.kind === 'TEAM_KILL_RECOVERY' || effect.kind === 'KILL_QI_GAIN' || effect.kind === 'KILL_SILVER_GAIN'))
  const rewardKills = (round: number) => {
    enemyFormation?.removeFallen(round)
    if (!hasKillReward) return
    const members = allies.map((fighter) => ({ fighter, hp: fighter.hp, rage: fighter.rage, effects: fighter.effects }))
    resolveKillRewards(enemies, members, round, events)
    for (const { fighter, hp, rage } of members) {
      fighter.hp = hp
      fighter.rage = rage
    }
  }
  const canTarget = (enemy: (typeof enemies)[number], round: number) => enemy.hp > 0 && !hasStatus(enemy, 'KNOCKBACK', round)
  const livingTarget = (round: number) => {
    const front = enemyFormation?.front ?? (enemyFormation?.broken ? leader : undefined)
    if (front && canTarget(front, round)) return front
    return enemies.find((enemy) => canTarget(enemy, round)) ?? enemies.find((enemy) => enemy.hp > 0)
  }
  const rearTarget = (round: number) => {
    const front = enemyFormation && livingTarget(round)
    return enemies.find((enemy) => canTarget(enemy, round) && (front ? enemy !== front : enemy.unit.slot === 'ENEMY_RIGHT')) ?? livingTarget(round)
  }

  const lastStand = (fighter: (typeof allies)[number], hp: number, attacker: EnemyBattleState | undefined, round: number) => {
    const opponents = enemies.map((enemy) => ({ enemy, hp: enemy.hp }))
    const restored = counterBeforeDeath({
      fighter, hp, level: fighter.player.level, agi: fighter.player.stats.agi, stance: fighter.loadout.stance,
      skill: SKILLS[fighter.loadout.ultSkillId ?? ''], atk: fighter.stats.atk,
      def: battleDefense(fighter, fighter.stats.def, round), effects: fighter.effects, learnedSkills: fighter.learnedSkills, dodgeState: fighter.dodgeState,
      schoolMember: fighter.player,
    }, opponents, attacker, round, rng, events)
    if (restored === undefined) return
    for (const { enemy, hp } of opponents) enemy.hp = hp
    return restored
  }

  const raidEnrageStart = 22
  const raidMaxRounds = 26
  const roundLimit = survival?.rounds ?? raidMaxRounds
  function useHiddenWeapon(
    fighter: (typeof allies)[number], target: (typeof enemies)[number], trigger: HiddenWeaponConfig['triggerCondition'], round: number,
  ) {
    target.hp = throwHiddenWeapon(fighter, target, trigger, {
      hp: fighter.hp, targetHp: target.hp, attack: fighter.stats.atk, level: fighter.player.level, effects: fighter.effects, round, rng,
    }, events)
  }
  let raidEnraged = false
  let nextWaveIndex = 0
  let completedRounds = 0

  for (let round = 1; round <= roundLimit; round++) {
    const livingAllies = allies.filter((fighter) => fighter.hp > 0)
    if (!livingAllies.length) break
    const nextWave = survival?.nextWaves[nextWaveIndex]
    if (nextWave?.round === round) {
      nextWaveIndex++
      const waveNumber = nextWaveIndex + 1
      enemies = buildWave(nextWave, waveNumber)
      leader = enemies.at(-1)!
      enemyFormation = createEnemyFormation(enemies, (enemy) => enemy.hp, events, round)
      announceWave(round, waveNumber)
      for (const enemy of enemies) grantShield(enemy, enemy.combat?.openingShield ?? 0, enemy.unit.slot, round, events)
    }
    const frontEnemy = livingTarget(round)
    if (!survival && !frontEnemy) break
    if (!survival && frontEnemy && round >= raidEnrageStart && !raidEnraged) {
      raidEnraged = true
      events.push({
        round,
        type: 'BOSS_ENRAGE',
        actorSlot: leader.hp > 0 ? leader.unit.slot : frontEnemy.unit.slot,
        segments: [
          { type: 'tag', text: '首领狂暴', tone: 'red' },
          { type: 'text', text: ` ${raid.enrageText}` },
        ],
      })
    }
    const openingDodgeTargets = round === 1 ? livingAllies.map((target) => ({
      target, hp: target.hp, dodge: target.stats.dodge, cap: target.dodgeCap,
    })) : []
    for (const enemy of enemies) if (enemy.hp > 0) prepareEnemyRound(enemy, round, events)
    for (const fighter of livingAllies) {
      useRoundStartPill(fighter, fighter.effects, livingAllies, round, rng, events)
      startStatusRound(fighter, fighter.effects, enemies, (enemy) => enemy.hp, round, rng, events, livingAllies)
      if (round === 1) grantOpeningTeamDodge(fighter, fighter.effects, openingDodgeTargets, rng, events)
      grantRoundShields(fighter.unit, effectsDuringAction(fighter.effects, fighter, round), livingAllies, round, events)
    }
    const { harmony, friction } = partyAffinity(harmonyOwners.filter(({ index }) => allies[index].hp > 0).map(({ effect }) => effect),
      karmas.filter((_, index) => allies[index].hp > 0))
    if (harmony || friction) for (const fighter of livingAllies) {
      if (harmony) fighter.rage = startHarmony(fighter, fighter.stats.speed, fighter.rage, harmony, round, events)
      else applyAlignmentFriction(fighter, fighter.stats.speed, round, events)
    }
    enemyFormation?.advance(round, livingAllies.map((fighter) => ({ fighter, speed: battleSpeed(fighter, fighter.stats.speed, round) })))
    if (round === 1 || round === 3) {
      for (const fighter of livingAllies) {
        const target = livingTarget(round)
        if (target) useHiddenWeapon(fighter, target, round === 1 ? 'BATTLE_START' : 'ROUND_THREE', round)
      }
      rewardKills(round)
    }
    const turnOrder = allies.map((fighter, index) => ({ fighter, index, opening: round === 1 ? fighter.opening : undefined }))
    turnOrder.sort((a, b) => Number(!!b.opening) - Number(!!a.opening) ||
      actionTime(battleSpeed(a.fighter, a.fighter.stats.speed, round), a.fighter.actionAdvance) -
      actionTime(battleSpeed(b.fighter, b.fighter.stats.speed, round), b.fighter.actionAdvance))
    for (const { fighter, index, opening } of turnOrder) {
      if (fighter.hp <= 0) continue
      if (enemies.every((enemy) => enemy.hp <= 0)) break
      fighter.actionAdvance = 0
      const { player, loadout, stats, unit } = fighter
      const disarmed = hasStatus(fighter, 'DISARM', round)
      const weaponLimited = disarmed && !fighter.freedom
      const ult = weaponUsableSkill(loadout.ultSkillId ? SKILLS[loadout.ultSkillId] : undefined, weaponLimited)
      if (!blockingActionStatus(fighter, round)) fighter.mp = useLowMpPill(fighter, fighter.mp, fighter.effects, round, events)
      const ultReady = () => fighter.rage >= 100 && fighter.mp >= fighter.ultCost
      if (!startPlayerAction(fighter, ult, fighter.effects, ultReady(), round, events)) continue
      const active = weaponEffects(effectsDuringAction(fighter.effects, fighter, round), loadout.weaponId, disarmed)
      announceOpening(fighter.unit, opening, events)
      const dart = resolveActionStartDamage(fighter.unit, active, enemies, (enemy) => enemy.hp, round, rng, events)
      if (dart) dart.target.hp = dart.hp
      rewardKills(round)
      const firstTarget = livingTarget(round)
      if (!firstTarget) break
      const finishDarts = (preferred: (typeof enemies)[number], attack: number) => {
        resolveActionEndDarts(unit, active, {
          target: () => preferred.hp > 0 ? preferred : livingTarget(round),
          hpOf: (enemy) => enemy.hp,
          setHp: (enemy, hp) => { enemy.hp = hp },
          attack, level: player.level, round, rng,
        }, events)
        rewardKills(round)
      }
      const guardedPosition = unit.slot === 'ALLY_RIGHT' || (unit.slot === 'ALLY_MAIN' &&
        allies.some((ally) => ally.unit.slot === 'ALLY_LEFT' && ally.hp > 0))
      const castUlt = chooseUltimate(fighter, ult, active, ultReady(), round, events)
      if (castUlt === null) {
        fighter.hp = resolveHealing(fighter, fighter.hp, active, { trigger: 'ACTION_END', round }, events)
        finishDarts(firstTarget, Math.round(stats.atk * (100 - statusPercent(fighter, 'ATTACK_DOWN', round)) / 100))
        continue
      }
      const isUlt = !!castUlt
      const outer = weaponUsableSkill(loadout.outerSkillId ? SKILLS[loadout.outerSkillId] : undefined, weaponLimited)
      const skill = castUlt ?? outer
      const crownCanInterrupt = !isUlt && !raidEnraged && active.some((effect) => effect.kind === 'OUTER_CHARGE_BREAK' && effect.stance === loadout.stance)
      const charging = enemies.find((enemy) => enemy.hp > 0 &&
        (interruptibleEnemyCharge(enemy, skill, raidEnraged) || (crownCanInterrupt && enemy.chargeState === 'CHARGING')))
      const mainTarget = castUlt?.id === CHARGED_ULT_ID && leader.hp > 0 ? leader : undefined
      const target = charging ?? mainTarget ?? (!isUlt && targetsRearWithWeapon(active) ? rearTarget(round) : undefined) ?? firstTarget
      const trueStrike = trueStrikeForAction(active, rng)
      const rageDelta = castUlt ? -ultRageCost(castUlt, active).cost : gainRage(fighter.rage, 35, active)
      const mpDelta = isUlt ? -fighter.ultCost : undefined
      const strike = (recipient: (typeof enemies)[number], extra?: ExtraAttackSource, areaHit = false, castSkill = skill) => {
        const critRoll = (round * 37 + player.stats.agi + index * 17 + (extra?.periodic || extra?.status ? 17 : 0)) % 100
        const relation = stanceRelation(loadout.stance, recipient.stance)
        const stanceMultiplier = relation === 'WIN' ? 1.25 : relation === 'LOSE' ? 0.88 : 1
        const pressure = innerPressure(stats.maxMp, enemyInnerMp(recipient))
        const power = castSkill ? skillPowerAtMastery(castSkill, fighter.learnedSkills[castSkill.id]) : 1
        const hit = performStrike(unit, recipient, {
          round, targetHp: recipient.hp, attackerHp: fighter.hp, attackerLevel: player.level,
          attackerAtk: disarmed ? Math.round(stats.atk * 0.7) : stats.atk, attackerDef: battleDefense(fighter, stats.def, round, { hp: fighter.hp, effects: active }),
          power, stance: loadout.stance, stanceMultiplier, pressure, skill: castSkill, critPercent: stats.crit, critRoll,
          isUlt: !extra && isUlt, rageDelta: areaHit ? undefined : rageDelta, mpDelta: areaHit ? undefined : mpDelta, enraged: raidEnraged,
          extra, areaHit, weaponId: disarmed ? null : fighter.weapon?.id, dodgeState: fighter.dodgeState, actor: fighter, rng,
          trueStrike: extra ? undefined : trueStrike, guardedPosition, schoolMember: player,
          hasLightSkill: !!loadout.lightSkillId && SKILLS[loadout.lightSkillId]?.slot === 'LIGHT',
        }, active, events)
        recipient.hp = hit.targetHp
        fighter.hp = hit.attackerHp
        for (const wave of resolveStrikeSplash(unit, hit.splash, recipient, enemies, (enemy) => enemy.hp, player.level, round, active, events)) {
          wave.target.hp = wave.hp
        }
        if (!extra && !areaHit) fighter.rage += rageDelta
        if (hit.critical) {
          fighter.actionAdvance = advanceOnCrit(unit, fighter.critAction, fighter.actionAdvance, round, events)
          fighter.rage = resolveCritRage(unit, fighter.rage, recipient, active, round, events)
        }
        rewardKills(round)
        return hit
      }
      const { critical, landed, attackerAtk } = strike(target)
      if (landed) spreadHitStatus(skill, unit, target, enemies, (enemy) => enemy.hp, round, rng, events)
      fighter.mp += mpDelta ?? 0
      if (skill?.area === 'ENEMIES') {
        for (const recipient of enemies) if (recipient !== target && recipient.hp > 0) strike(recipient, undefined, true)
      }
      const hits = resolveCastArea(unit, { isUlt, attack: attackerAtk, level: player.level },
        active, enemies, (recipient) => recipient.hp, round, rng, events)
      for (const hit of hits) hit.target.hp = hit.hp
      rewardKills(round)
      fighter.hp = resolveHealing(fighter, fighter.hp, active, { trigger: 'ACTION_END', round }, events)
      const shotTarget = critical && fighter.critAction ? livingTarget(round) : undefined
      const shot = shotTarget && criticalShot(fighter.critAction, rng)
      if (shot && shotTarget) strike(shotTarget, shot)
      if (enemies.some((enemy) => enemy.hp > 0)) {
        for (const followUp of outerFollowUps(active, isUlt, landed, rng, !outer || outer === BARE_HANDS)) {
          const recipient = targetsRearWithWeapon(active, followUp) ? rearTarget(round) : livingTarget(round)
          if (!recipient) break
          strike(recipient, followUp, false, outer ?? BARE_HANDS)
        }
      }
      finishDarts(target, attackerAtk)
    }
    if (!survival && enemies.every((enemy) => enemy.hp <= 0)) break

    const enemyOrder = enemies.map((enemy, index) => ({ enemy, index, speed: enemySpeed(enemy, round) }))
    enemyOrder.sort((a, b) => b.speed - a.speed)
    const isWipeoutRound = !survival && round === raidMaxRounds
    for (const { index, enemy } of enemyOrder) {
      if (enemy.hp <= 0) continue
      const living = allies.filter((fighter) => fighter.hp > 0)
      if (!living.length) break
      if (!isWipeoutRound) {
        for (const fighter of living) {
          if (!blockingActionStatus(enemy, round)) useHiddenWeapon(fighter, enemy, 'SELF_HP_LOW', round)
          if (!raidEnraged && canInterruptEnemyUltimate(enemy, round)) useHiddenWeapon(fighter, enemy, 'ENEMY_ULT_READY', round)
          if (enemy.hp <= 0) break
        }
        rewardKills(round)
        if (enemy.hp <= 0) continue
      }
      const chargeMultiplier = resolveEnemyAction(enemy, round, raidEnraged, events, isWipeoutRound)
      if (chargeMultiplier === null) continue
      if (enemy.combat?.statusPulse) {
        applyEnemyStatusPulse(enemy, living.map((fighter) => ({ fighter, hp: fighter.hp, effects: fighter.effects })), round, rng, events)
      }
      const attackerMp = enemyInnerMp(enemy)
      const enemySkill = !raidEnraged && chargeMultiplier === 1 ? enemyRageAction(enemy, round, events) : undefined
      const selected = enemyPreferredTarget(enemy, enemySkill, living) ?? living[(round - 1 + index) % living.length]
      const charge = chargeMultiplier > 1 ? enemy.combat?.charge : undefined
      const area = charge?.area
      const cover = area && living.some((fighter) => fighter.stance === 'TAICHI')
        ? living.flatMap((fighter) => effectsDuringAction(fighter.effects, fighter, round)).find((effect) => effect.kind === 'TEAM_AREA_REDUCTION')
        : undefined
      const formation = !isWipeoutRound && living.length === 3 ? damageShareFormation(living.flatMap((fighter) => fighter.effects)) : undefined
      for (const target of area ? living : [selected]) {
        const counteredHp = counterChargedAttack(target.unit, target.loadout.stance, enemy, chargeMultiplier, enemy.hp, round, events)
        if (counteredHp !== undefined) {
          enemy.hp = counteredHp
          continue
        }
        const active = effectsDuringAction(target.effects, target, round)
        const relation = stanceRelation(target.loadout.stance, enemy.stance)
        const multiplier = relation === 'LOSE' ? 1.22 : relation === 'WIN' ? 0.82 : 1
        const raidAtkMult = raidEnraged ? Math.pow(1.35, round - raidEnrageStart + 1) : 1.0
        const contact = enemyContact(enemy, enemySkill, chargeMultiplier, round, isWipeoutRound)
        const outer = !isWipeoutRound && chargeMultiplier === 1 && contact.outer
        const enemyCast = enemySkill ? { skillId: enemySkill.id, skillName: enemySkill.name, skillTier: enemySkill.tier, isUlt: true }
          : charge ? { skillName: charge.name, isUlt: true }
            : contact.disarmed ? { skillId: BARE_HANDS.id, skillName: '徒手反击', skillTier: BARE_HANDS.tier } : {}
        const shieldMultiplier = enemySkill?.battleEffects?.find((effect) => effect.kind === 'SHIELD_REND')?.multiplier
        const ordinaryCreature = !isWipeoutRound && !enemySkill && chargeMultiplier === 1 ? enemy.combat?.creature : undefined
        const critical = !isWipeoutRound && (round * 41 + index * 13) % 100 < (enemy.combat?.crit ?? 0) - statusPercent(enemy, 'CRIT_DOWN', round)
        const roll = (round * 29 + index * 13 + target.player.stats.agi) % 100
        const light = target.loadout.lightSkillId ? SKILLS[target.loadout.lightSkillId] : undefined
        const penalty = isWipeoutRound ? 0 : Math.min(100, enemyHitPenalty(enemy, round) + lightCounterPenalty(enemy, enemySkill, light))
        const escape = raidEnraged ? undefined : escapeFromAttack(target, round)
        const opponentDefense = !isWipeoutRound ? conditionalDefense(active, enemy) : undefined
        const evasion = raidEnraged ? { chance: 0 } : dodgeAgainst(target, target.stats.dodge, target.dodgeCap, round, opponentDefense)
        const avoidance = escape ? 'DODGE' : strikeAvoidance(roll, evasion.chance, penalty)
        const absoluteDodge = !raidEnraged && !avoidance ? rollAbsoluteDefense(active, 'ABSOLUTE_DODGE', rng) : undefined
        if (avoidance === 'MISS') {
          announceMiss(enemy.unit, target.unit, penalty, round, events, enemyCast)
          continue
        }
        const segments: RichSegment[] = [
          { type: 'actor', name: enemy.name, isAlly: false },
          { type: 'text', text: enemyCast.skillName ? `施展【${enemyCast.skillName}】攻向` : '攻向' },
          { type: 'actor', name: target.unit.name, isAlly: true, isPlayer: true },
        ]
        if (!escape && evasion.segment) segments.push(evasion.segment)
        if (avoidance === 'DODGE' || absoluteDodge) {
          const rageDelta = dodgeRageGain(target.rage, active)
          target.rage += rageDelta
          segments.push({ type: 'text', text: rageDelta > 0 ? `，被闪开了，怒气 +${rageDelta}。` : '，被闪开了。' })
          if (escape) segments.push({ type: 'tag', text: `${escape.sourceName} · 灵狐遁逃`, tone: 'jade' })
          if (absoluteDodge) segments.push({ type: 'tag', text: `${absoluteDodge.sourceName} · 绝对闪避`, tone: 'jade' })
          events.push({
            round, type: 'DODGE', actorSlot: enemy.unit.slot, targetSlot: target.unit.slot, ...enemyCast, hitResult: 'DODGE',
            rageDelta: rageDelta || undefined, rageTargetSlot: rageDelta > 0 ? target.unit.slot : undefined, segments,
            effectSourceId: escape?.sourceId,
          })
          const dodge = resolveDodgeEffects({
            ...target, hp: target.hp, level: target.player.level, atk: target.stats.atk, agi: target.agi,
            effects: active, state: target.dodgeState,
          }, enemy, enemy.hp, round, rng, events)
          enemy.hp = dodge.attackerHp
          target.hp = dodge.defenderHp
        } else {
          const rawAttack = Math.round(enemy.atk * raidAtkMult * enemyPhaseAttackPercent(enemy, round) / 100 *
            (100 - statusPercent(enemy, 'ATTACK_DOWN', round)) / 100)
          const attack = contact.disarmed ? Math.round(rawAttack * 0.7) : rawAttack
          const defense = battleDefense(target, target.stats.def, round, isWipeoutRound ? undefined : { hp: target.hp, effects: active, segments })
          const pressure = !isWipeoutRound && (enemy.combat?.innerEndurance || charge?.innerPressure)
            ? Math.max(1, innerPressure(attackerMp, target.mp)) : 1
          const incoming = incomingStrikePower(target.loadout.stance, enemy.stance, multiplier,
            chargeMultiplier * (enemySkill?.powerRatio ?? 1) * (critical ? 1.55 : 1),
            attack, defense, target.player.level, isWipeoutRound ? [] : active, pressure)
          let damage = incoming.damage
          if (isWipeoutRound) damage = Math.max(99999, damage * 15)
          const incomingEffects = isWipeoutRound ? [] : active
          const covered = cover ? Math.round(damage * cover.percent / 100) : 0
          damage -= covered
          if (cover && covered > 0) segments.push({ type: 'tag', text: `${cover.sourceName} · 范围减伤 ${covered.toLocaleString()}`, tone: 'jade' })
          const parry = parryIncoming(target.stats, formation?.parryPoints ?? 0,
            isWipeoutRound ? 100 : (round * 53 + index * 17 + target.player.stats.intStat) % 100, contact, incomingEffects, rng, opponentDefense)
          const { parried } = parry
          if (parried) target.mp = spendParryMp(target, target.mp, parry, damage, incomingEffects, round, events)
          segments.push(...parry.segments)
          if (contact.disarmed) segments.push({ type: 'tag', text: '缴械 · 徒手出招 · 攻击降低 30%', tone: 'jade' })
          const split = splitFormationDamage(area ? undefined : formation, target, living, damage, parry.absorb)
          const hit = resolveIncomingPhysicalDamage(target, split.damage, target.hp, incomingEffects, enemy.stance, split.parryAbsorb,
            { round, events, rng, critical, shieldMultiplier, ordinaryCreature, attackerCombat: enemy.combat, element: contact.element, outer,
              ignoreTriggeredProtection: isWipeoutRound ? true : undefined })
          const lastStandHp = !isWipeoutRound && canCounterLethal(target, target.lethalSaves, target.hp, hit.damage, round)
            ? lastStand(target, target.hp, enemy, round) : undefined
          const hpBefore = lastStandHp ?? target.hp
          const pendingDamage = Math.min(hpBefore, hit.uncappedDamage)
          const saved = resolveLethalSave(isWipeoutRound ? undefined : target.lethalSaves, target, hpBefore, pendingDamage, round)
          const takenDamage = saved?.damage ?? pendingDamage
          const hpLost = Math.min(target.hp, takenDamage)
          target.hp = Math.max(0, hpBefore - takenDamage)
          const rageGain = resolveHitRage(target.rage, 0, hpLost, incomingEffects, area ? undefined : formation)
          target.rage += rageGain.gained
          segments.push({ type: 'text', text: '，伤害 ' }, { type: 'damage', value: takenDamage, category: 'phys', isCrit: critical || undefined },
            ...incoming.segments, ...split.segments, ...hit.segments, ...rageGain.segments)
          events.push({
            round, type: 'SKILL_CAST', actorSlot: enemy.unit.slot, targetSlot: target.unit.slot,
            ...enemyCast, hitResult: parried ? 'PARRY' : critical ? 'CRIT' : 'HIT', hpDelta: takenDamage > 0 ? -takenDamage : 0, ...hit.shieldEvent,
            rageDelta: rageGain.gained || undefined, rageTargetSlot: rageGain.gained > 0 ? target.unit.slot : undefined, segments,
          })
          if (saved) {
            target.hp = saved.savedHp
            enemy.hp = applyLethalSave(saved, defense, enemy, enemy.hp, events)
          }
          if (!isWipeoutRound) {
            if (pendingDamage >= hpBefore) transferLethalStatuses(target, active, enemies, (recipient) => recipient.hp, round, events)
            triggerLowHpEffects(target, hpBefore, target.hp, active, round, events)
            target.hp = useCriticalHitPill(target, target.hp, critical, hpLost, active, round, events)
            target.mp = recoverHitMp(target.unit, target.hp, target.mp, hpLost, active, round, events)
            target.mp = recoverPoisonMp(target.unit, target.hp, target.mp, hit.poisonRecovery, round, events)
            if (critical) enemy.hp = reflectCriticalPoison(target.unit, enemy, enemy.hp, attack, active, round, events)
          }
          if (formation && !area) {
            for (const { recipient, damage } of split.shares) {
              const result = applyDirectedDamage({
                fighter: recipient, hp: recipient.hp, defense: battleDefense(recipient, recipient.stats.def, round),
                effects: effectsDuringAction(recipient.effects, recipient, round), saves: recipient.lethalSaves,
                beforeLethal: (hp) => {
                  const restored = lastStand(recipient, hp, enemy, round)
                  return restored === undefined ? undefined : { hp: restored, attackerHp: enemy.hp }
                },
              }, { source: formation, attacker: enemy, attackerHp: enemy.hp, damage, round, rng, critical, ordinaryCreature, element: contact.element, outer,
                hitRage: formation.sharedRage ? { current: recipient.rage, base: 0, formation } : undefined }, events)
              recipient.hp = result.hp
              recipient.rage += result.rageGained
              enemy.hp = result.attackerHp
              if (result.lethal) transferLethalStatuses(recipient, recipient.effects, enemies, (target) => target.hp, round, events)
              recipient.mp = recoverHitMp(recipient.unit, recipient.hp, recipient.mp, result.hpLost, recipient.effects, round, events)
              recipient.mp = recoverPoisonMp(recipient.unit, recipient.hp, recipient.mp, result.poisonRecovery, round, events)
            }
          }
          if (!isWipeoutRound && !parry.caught) {
            applyIncomingStatuses(enemy, enemy.hp, target, target.hp, active, round, rng, events, attack, contact.weaponSuppressed)
            enemyTechniqueOnHit(enemy, enemySkill, attack, enemy.hp, target, target.hp, parried, active, round, rng, events)
            enemy.hp = resolveReceivePeriodic(target, target.hp, active, {
              attacker: enemy, attackerHp: enemy.hp, defenderAttack: target.stats.atk, round, rng,
            }, events)
          }
          if (parry.caught) enemy.hp = finishBladeCatch(parry.caught, target.unit, enemy, enemy.hp, damage, round, active, rng, events)
          if (parried) {
            const result = resolveParryEffects({ ...target, hp: target.hp, def: defense, hpLost, effects: active },
              enemy, enemy.hp, round, events)
            target.hp = result.hp
            enemy.hp = result.attackerHp
          }
          const retaliation = contact.ranged ? undefined : meleeRetaliationFor(active)
          if (retaliation && !parry.caught && enemy.hp > 0) {
            enemy.hp = resolveMeleeRetaliation(retaliation, enemy, {
              attackerHp: enemy.hp, attackerAtk: attack,
              hpLost, defenderSlot: target.unit.slot, defenderAtk: target.stats.atk, round,
            }, active, events)
            enemy.hp = resolvePoisonBurst(target.unit, enemy, enemy.hp, active, round, events)
          }
          enemy.hp = resolveHitReflection(target.unit, enemy, enemy.hp, hpLost, incomingEffects, round, events)
        }
      }
      rewardKills(round)
    }
    if (allies.every((fighter) => fighter.hp <= 0)) break
    const venomOwner = allies.find((fighter) => fighter.hp > 0 && fighter.effects.some((effect) => effect.kind === 'POISON_BURST'))
    for (const enemy of enemies) {
      if (venomOwner) enemy.hp = resolvePoisonBurst(venomOwner.unit, enemy, enemy.hp, venomOwner.effects, round, events)
      enemy.hp = resolveDamageOverTime(enemy, enemy.hp, round, events)
      rewardKills(round)
    }
    const restoration = allies.map((fighter) => ({ fighter, hp: fighter.hp, effects: fighter.effects }))
    restorePartyRound(restoration, round, events)
    for (const { fighter, hp } of restoration) fighter.hp = hp
    for (const fighter of allies) {
      const active = effectsDuringAction(fighter.effects, fighter, round)
      fighter.hp = resolveDamageOverTime(fighter, fighter.hp, round, events, {
        effects: active, saves: fighter.lethalSaves,
        recoverPoison: (hp, recovery) => {
          fighter.mp = recoverPoisonMp(fighter.unit, hp, fighter.mp, recovery, round, events)
        },
        beforeLethal: (source, hp, sourceUnitId) => lastStand(fighter, hp, periodicAttacker(source, sourceUnitId), round),
        reflectPoison: (effect, source, sourceUnitId) => {
          const attacker = periodicAttacker(source, sourceUnitId)
          if (attacker) attacker.hp = reflectLethalPoison(fighter, effect, attacker, attacker.hp, round, events)
        },
        onLethal: (source, saved, _remainingHp, sourceUnitId) => {
          const attacker = periodicAttacker(source, sourceUnitId)
          if (saved && attacker) attacker.hp = applyLethalSave(saved, battleDefense(fighter, fighter.stats.def, round), attacker, attacker.hp, events)
          else if (saved) recordLethalSave(saved, events)
          transferLethalStatuses(fighter, active, enemies, (enemy) => enemy.hp, round, events)
        },
      })
      rewardKills(round)
      fighter.hp = resolveHealing(fighter, fighter.hp, active, { trigger: 'ROUND_END', round }, events)
      fighter.mp = recoverRoundMp(fighter.unit, fighter.hp, fighter.mp, fighter.effects, round, events)
      endStatusRound(fighter, round, events)
      expireTimedShield(fighter, round, events)
    }
    const alliesStanding = allies.some((fighter) => fighter.hp > 0)
    for (const enemy of enemies) {
      if (alliesStanding) recoverEnemyRoundMp(enemy, enemy.hp, round, events)
      endStatusRound(enemy, round, events)
    }
    if (alliesStanding) completedRounds = round
  }

  allies.forEach((fighter, index) => appendGaibangLootBonus(lineup[index].player, fighter.unit.slot, events))
  const survivors = allies.filter((fighter) => fighter.hp > 0).length
  const won = survivors > 0 && (survival ? completedRounds === survival.rounds : enemies.every((enemy) => enemy.hp <= 0))
  if (survival) {
    events.push({
      round: Math.min(survival.rounds, won ? completedRounds : completedRounds + 1), type: 'EFFECT', actorSlot: 'ALLY_MAIN', effectSourceId: 'raid_survival',
      segments: [{ type: 'tag', tone: won ? 'gold' : 'red', text: won
        ? `撑满 ${completedRounds} 回合 · ${survivors} 人存活 · 萧远山接应破围`
        : `全队倒下 · 撑过 ${completedRounds} / ${survival.rounds} 回合` }],
    })
  }
  return {
    battleId, sceneTitle: raid.title, mode: 'COOP_3P', raidId, stanceBanner, units: initialUnits,
    winner: won ? 'ALLY' : 'ENEMY', events,
    ...(survival ? { survivedRounds: completedRounds } : {}),
  }
}

export function simulateShaoshiRaid(
  battleId: string, lineup: readonly [FighterSnapshot, FighterSnapshot, FighterSnapshot], rng = Math.random,
  environment = battleEnvironmentAt('shaoshi'),
): BattleReportDTO {
  return simulateCoopRaid('shaoshi', battleId, lineup, rng, environment)
}
