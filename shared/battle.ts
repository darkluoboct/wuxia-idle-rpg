import type { BattleEventDTO, BattleReportDTO, CombatUnitDTO, LoadoutPresetDTO, PlayerDTO, RichSegment, StanceType } from './protocol.ts'
import { COMPANIONS, companionView, findTrioSynergy, ITEMS, REALMS, SECTS, SHAOSHI_RAID, SKILLS, type CompanionView, type SkillConfig } from './gameData.ts'
import { EQUIP_SLOT_META, STANCE_META, stanceRelation } from './combatMeta.ts'
import { skillPowerAtMastery } from './skillMastery.ts'

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
export function computeDerivedStats(player: PlayerDTO, loadout: LoadoutPresetDTO, bonus: CollectionBonus = {}) {
  const realm = REALMS.find((r) => r.tier === player.realmTier) ?? REALMS[0]
  const m = realm.multiplier
  const s = player.stats

  const inner = loadout.innerSkillId ? SKILLS[loadout.innerSkillId] : undefined
  const light = loadout.lightSkillId ? SKILLS[loadout.lightSkillId] : undefined
  const outer = loadout.outerSkillId ? SKILLS[loadout.outerSkillId] : undefined

  const gear = { hp: 0, atk: 0, def: 0, crit: 0, dodge: 0 }
  for (const [slot, { field }] of Object.entries(EQUIP_SLOT_META)) {
    const id = loadout[field]
    const item = id ? ITEMS[id] : undefined
    if (!item || item.slot !== slot) continue
    gear.hp += item.hpBonus ?? 0
    gear.atk += item.atkBonus ?? 0
    gear.def += item.defBonus ?? 0
    gear.crit += item.critBonus ?? 0
    gear.dodge += item.dodgeBonus ?? 0
  }

  const hpBonusMult = (1 + (player.bonusHpPct ?? 0) / 100) * (1 + (bonus.hpPct ?? 0) / 100)
  const atkBonusMult = 1 + (bonus.atkPct ?? 0) / 100
  const maxHp = Math.round((320 + player.level * 85 + s.con * 46) * m * (inner?.id === 'jiuyin_zonggang' ? 1.25 : 1.08) * hpBonusMult + gear.hp)
  const maxMp = Math.round((120 + player.level * 32 + s.con * 26 + s.intStat * 12) * m)
  const atk = Math.round(((45 + player.level * 13 + s.str * 8.5 + s.agi * 2.5) * m + gear.atk) * atkBonusMult)
  const def = Math.round((22 + player.level * 6 + s.con * 5.5 + s.str * 2.0) * m + gear.def)
  const speed = Math.round(100 + s.agi * 3.2 + (light?.speedBonus ?? 0))
  const dodge = Math.min(65, Math.round((s.agi / (s.agi + 180 + player.level * 4)) * 45 + (light?.dodgeBonus ?? 0) + gear.dodge))
  const crit = Math.min(
    75,
    Math.round(
      8 +
        ((s.agi * 0.6 + s.intStat * 0.4) / (s.agi + s.intStat + 220)) * 40 +
        gear.crit +
        (outer?.critBonus ?? 0) +
        (inner?.critBonus ?? 0)
    )
  )

  const combatPower = Math.round(maxHp * 0.35 + maxMp * 0.25 + atk * 4.2 + def * 2.8 + speed * 3.5 + crit * 45)
  return { maxHp, maxMp, atk, def, speed, dodge, crit, combatPower }
}

function playerUnit(slot: CombatUnitDTO['slot'], player: PlayerDTO, loadout: LoadoutPresetDTO, stats: ReturnType<typeof computeDerivedStats>): CombatUnitDTO {
  return {
    slot, id: player.id, name: player.nickname,
    title: player.currentSectId ? (SECTS.find((sect) => sect.id === player.currentSectId)?.name ?? '江湖侠客') : '逍遥散人',
    portraitStyle: 'hero_sword', avatarId: player.avatarId, isPlayer: true, maxHp: stats.maxHp, hp: stats.maxHp, maxMp: stats.maxMp, rage: 50,
    weaponName: loadout.weaponId ? ITEMS[loadout.weaponId]?.name : '赤手空拳',
  }
}
export function innerPressure(ownMp: number, enemyMp: number) {
  return Math.max(0.78, Math.min(1.48, 1 + 0.25 * ((ownMp - enemyMp) / Math.max(500, enemyMp))))
}
export function strikeDamage(attack: number, power: number, stance: number, pressure: number, critical: boolean, round: number) {
  const base = attack * power * stance * pressure * (critical ? 1.55 : 1)
  return Math.max(95, Math.round(base * (0.95 + ((round * 13) % 10) * 0.01)))
}
export function incomingDamage(attack: number, multiplier: number, defense: number, level: number) {
  return Math.max(70, Math.round(attack * multiplier * (1 - defense / (defense + 450 + level * 45))))
}

/** 计算不同战斗位阶下的首领狂暴起始回合（依据首领血量与战斗模式动态确定） */
export function calcBattleEnrageRound(enemyHp: number, mode?: BattleReportDTO['mode']): number {
  if (mode === 'PVP_HUASHAN' || mode === 'PVP_AMBUSH') return 15
  if (enemyHp > 50000) return 22
  if (enemyHp > 10000) return 16
  return 12
}

const BARE_HANDS: SkillConfig = {
  id: 'bare_hands', name: '寻常拳脚', slot: 'OUTER', tier: 'green', source: '无师自通', powerRatio: 1,
  desc: '未习得任何外功时的寻常拳脚。', castNarrative: '挥拳直取敌方要害。',
}
const NO_LIGHT_SKILL: SkillConfig = {
  id: 'no_light', name: '腾挪闪躲', slot: 'LIGHT', tier: 'green', source: '无师自通', powerRatio: 1,
  desc: '未习得轻功时凭身法闪躲。', castNarrative: '侧身一让，险险避开。',
}

/** 服务端权威确定性战斗推演生成器（支持 1主+2副 及 3人真实玩家结义组队） */
export function simulateServerBattle(params: {
  sceneTitle: string
  mode: BattleReportDTO['mode']
  player: PlayerDTO
  loadout: LoadoutPresetDTO
  learnedSkills?: Readonly<Record<string, number>>
  enemyMain: { name: string; title: string; portrait: CombatUnitDTO['portraitStyle']; hp: number; atk: number; mp: number; stance: StanceType }
  enemyGuards?: { name: string; title: string; portrait: CombatUnitDTO['portraitStyle']; hp: number; atk: number }[]
  coopPlayers?: { leftPlayer: { name: string; sect: string; hp: number; atk: number }; rightPlayer: { name: string; sect: string; hp: number; atk: number } }
  rewards?: BattleReportDTO['rewards']
  bonus?: CollectionBonus
  companionOf?: (id: string) => CompanionView | undefined
  /** 生存战：撑过该回合且主角仍存活即判胜 */
  surviveRounds?: number
}): BattleReportDTO {
  const { sceneTitle, mode, player, loadout, learnedSkills, enemyMain, enemyGuards, coopPlayers, rewards, surviveRounds, bonus } = params
  const pDerived = computeDerivedStats(player, loadout, bonus)
  const stanceInfo = evaluateStanceAdvantage(loadout.stance, enemyMain.stance)
  const companionOf = params.companionOf ?? ((id: string) => {
    const config = COMPANIONS[id]
    // 联机沿用原有伙伴数值，对应试玩中的觉醒形态。
    return config ? companionView(config, { form: 'awakened' }) : undefined
  })
  const leftCompanion = loadout.leftCompanionId ? companionOf(loadout.leftCompanionId) : undefined
  const rightCompanion = loadout.rightCompanionId ? companionOf(loadout.rightCompanionId) : undefined

  const units: CombatUnitDTO[] = []

  // 构建我方 3 单位（单人 1主+2伙伴 或 3真实玩家结义）
  if (coopPlayers) {
    units.push({
      slot: 'ALLY_LEFT',
      id: 'coop_p1',
      name: coopPlayers.leftPlayer.name,
      title: `${coopPlayers.leftPlayer.sect}·结义义兄`,
      portraitStyle: 'guojing',
      isPlayer: true,
      maxHp: coopPlayers.leftPlayer.hp,
      hp: coopPlayers.leftPlayer.hp,
      maxMp: 3500,
      rage: 40,
      weaponName: '乌金重剑',
    })
  } else if (leftCompanion) {
    const c = leftCompanion
    const hp = Math.round(c.baseHp * (1 + player.level * 0.04))
    units.push({
      slot: 'ALLY_LEFT',
      id: c.id,
      name: c.name,
      title: `左翼·${c.title}`,
      portraitStyle: c.portraitStyle,
      isPlayer: false,
      maxHp: hp,
      hp,
      maxMp: 2000,
      rage: 30,
    })
  }

  units.push(playerUnit('ALLY_MAIN', player, loadout, pDerived))

  if (coopPlayers) {
    units.push({
      slot: 'ALLY_RIGHT',
      id: 'coop_p2',
      name: coopPlayers.rightPlayer.name,
      title: `${coopPlayers.rightPlayer.sect}·结义义妹`,
      portraitStyle: 'huangrong',
      isPlayer: true,
      maxHp: coopPlayers.rightPlayer.hp,
      hp: coopPlayers.rightPlayer.hp,
      maxMp: 3200,
      rage: 40,
      weaponName: '东邪碧玉箫',
    })
  } else if (rightCompanion) {
    const c = rightCompanion
    const hp = Math.round(c.baseHp * (1 + player.level * 0.038))
    units.push({
      slot: 'ALLY_RIGHT',
      id: c.id,
      name: c.name,
      title: `右翼·${c.title}`,
      portraitStyle: c.portraitStyle,
      isPlayer: false,
      maxHp: hp,
      hp,
      maxMp: 2200,
      rage: 30,
    })
  }

  // 构建敌方单位
  if (enemyGuards?.[0]) {
    units.push({
      slot: 'ENEMY_LEFT',
      id: 'e_left',
      name: enemyGuards[0].name,
      title: enemyGuards[0].title,
      portraitStyle: enemyGuards[0].portrait,
      isPlayer: false,
      maxHp: enemyGuards[0].hp,
      hp: enemyGuards[0].hp,
      maxMp: 1800,
      rage: 20,
    })
  }
  units.push({
    slot: 'ENEMY_MAIN',
    id: 'e_main',
    name: enemyMain.name,
    title: enemyMain.title,
    portraitStyle: enemyMain.portrait,
    isPlayer: mode === 'PVP_HUASHAN' || mode === 'PVP_AMBUSH',
    maxHp: enemyMain.hp,
    hp: enemyMain.hp,
    maxMp: enemyMain.mp,
    rage: 35,
  })
  if (enemyGuards?.[1]) {
    units.push({
      slot: 'ENEMY_RIGHT',
      id: 'e_right',
      name: enemyGuards[1].name,
      title: enemyGuards[1].title,
      portraitStyle: enemyGuards[1].portrait,
      isPlayer: false,
      maxHp: enemyGuards[1].hp,
      hp: enemyGuards[1].hp,
      maxMp: 1800,
      rage: 20,
    })
  }

  // 克隆工作血量进行推演
  const hpState: Record<string, number> = {}
  const rageState: Record<string, number> = {}
  for (const u of units) {
    hpState[u.slot] = u.hp
    rageState[u.slot] = u.rage
  }

  const events: BattleEventDTO[] = []
  const outerSkill = (loadout.outerSkillId && SKILLS[loadout.outerSkillId]) || BARE_HANDS
  const ultSkill = loadout.ultSkillId ? SKILLS[loadout.ultSkillId] : undefined
  const lightSkill = (loadout.lightSkillId && SKILLS[loadout.lightSkillId]) || NO_LIGHT_SKILL

  // 内力深浅压制系数 K_mp
  const kMp = innerPressure(pDerived.maxMp, enemyMain.mp)
  const stanceMultAlly = stanceInfo.advantage === 'ALLY' ? 1.25 : stanceInfo.advantage === 'ENEMY' ? 0.88 : 1.0
  const stanceMultEnemy = stanceInfo.advantage === 'ENEMY' ? 1.22 : stanceInfo.advantage === 'ALLY' ? 0.82 : 1.0

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

  const trioSynergy = findTrioSynergy(loadout.leftCompanionId, loadout.rightCompanionId)

  const enrageStartRound = calcBattleEnrageRound(enemyMain.hp, mode)
  const maxRounds = enrageStartRound + 4
  let isEnraged = false
  let survived = false

  for (let round = 1; round <= maxRounds; round++) {
    if (hpState.ALLY_MAIN <= 0 || (hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0)) {
      break
    }

    // 首领进入狂暴播报（仅触发一次）
    if (round >= enrageStartRound && !isEnraged) {
      isEnraged = true
      events.push({
        round,
        type: 'BOSS_ENRAGE',
        actorSlot: 'ENEMY_MAIN',
        segments: [
          { type: 'tag', text: '首领狂暴', tone: 'red' },
          { type: 'text', text: ` ${enemyMain.name}久战不克，走火入魔陷入【狂暴】！周身杀气逆冲，招式威力暴涨且无法闪避！` },
        ],
      })
    }

    // 挑选当前存活的敌方目标
    const targetSlot: CombatUnitDTO['slot'] =
      (hpState.ENEMY_LEFT ?? 0) > 0 && (round % 2 === 1 || hpState.ENEMY_MAIN <= 0)
        ? 'ENEMY_LEFT'
        : hpState.ENEMY_MAIN > 0 ? 'ENEMY_MAIN' : 'ENEMY_RIGHT'
    const targetUnit = units.find((u) => u.slot === targetSlot)!

    // 1. 我方主角出手（满100怒气放绝技，否则放外功）
    const castUlt = rageState.ALLY_MAIN >= 100 ? ultSkill : undefined
    const isUlt = !!castUlt
    const castSkill = castUlt ?? outerSkill
    const isCrit = ((round * 37 + player.stats.agi) % 100) < pDerived.crit
    const power = skillPowerAtMastery(castSkill, learnedSkills?.[castSkill.id])
    const dmg = strikeDamage(pDerived.atk, power, stanceMultAlly, kMp, isCrit, round)

    hpState[targetSlot] = Math.max(0, hpState[targetSlot] - dmg)
    rageState.ALLY_MAIN = isUlt ? 15 : Math.min(100, rageState.ALLY_MAIN + 35)

    const segs: RichSegment[] = [
      { type: 'actor', name: player.nickname, isAlly: true, isPlayer: true },
      { type: 'text', text: '使出' },
      { type: 'skill', id: castSkill.id, name: `《${castSkill.name}》`, tier: castSkill.tier },
      { type: 'text', text: '击中' },
      { type: 'actor', name: targetUnit.name, isAlly: false },
      { type: 'text', text: '，伤害 ' },
      { type: 'damage', value: dmg, isCrit, category: castSkill.qiDamageRatio ? 'qi' : 'phys' },
    ]
    if (kMp >= 1.15) {
      segs.push({ type: 'tag', text: `内力优势 +${Math.round((kMp - 1) * 100)}% 伤害`, tone: 'gold' })
    }

    events.push({
      round,
      type: 'SKILL_CAST',
      actorSlot: 'ALLY_MAIN',
      targetSlot,
      skillId: castSkill.id,
      skillName: castSkill.name,
      skillTier: castSkill.tier,
      isUlt,
      hitResult: isCrit ? 'CRIT' : 'HIT',
      hpDelta: -dmg,
      rageDelta: isUlt ? -85 : 35,
      segments: segs,
    })

    // 2. 左翼伙伴/结义义兄连携追击判定
    const leftUnit = units.find((u) => u.slot === 'ALLY_LEFT')
    if (leftUnit && hpState[targetSlot] > 0 && (round % 2 === 1 || !!trioSynergy || !!coopPlayers)) {
      const assistDmg = Math.round(pDerived.atk * 0.78 * stanceMultAlly)
      hpState[targetSlot] = Math.max(0, hpState[targetSlot] - assistDmg)
      const compCfg = leftCompanion
      events.push({
        round,
        type: 'ASSIST_ATTACK',
        actorSlot: 'ALLY_LEFT',
        targetSlot,
        skillName: compCfg?.assistSkillName ?? '重剑横扫',
        hpDelta: -assistDmg,
        segments: [
          { type: 'tag', text: trioSynergy ? trioSynergy.name : '伙伴追击', tone: 'purple' },
          { type: 'text', text: ' ' },
          { type: 'actor', name: leftUnit.name, isAlly: true },
          { type: 'text', text: `跟上一招「${compCfg?.assistSkillName ?? '破军连击'}」，追加伤害 ` },
          { type: 'damage', value: assistDmg, category: 'phys' },
        ],
      })
    }

    if (hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0) {
      break
    }

    // 3. 敌方主将反扑
    const enemyActorSlot: CombatUnitDTO['slot'] = hpState.ENEMY_MAIN > 0
      ? 'ENEMY_MAIN'
      : (hpState.ENEMY_LEFT ?? 0) > 0 ? 'ENEMY_LEFT' : 'ENEMY_RIGHT'
    const enemyActor = units.find((u) => u.slot === enemyActorSlot)!

    // 狂暴增伤系数（每回合递增 +35% 复合增伤）
    const enrageAtkMult = isEnraged ? Math.pow(1.35, round - enrageStartRound + 1) : 1.0
    const currentEnemyAtk = Math.round(enemyMain.atk * enrageAtkMult)
    const isWipeoutRound = round >= maxRounds

    // 轻功闪避判定（狂暴后杀气锁定，无法闪避）
    const rollDodge = (round * 29 + player.stats.agi) % 100
    if (!isEnraged && rollDodge < Math.min(42, pDerived.dodge)) {
      rageState.ALLY_MAIN = Math.min(100, rageState.ALLY_MAIN + (lightSkill.id === 'lingbo_weibu' ? 25 : 10))
      events.push({
        round,
        type: 'DODGE',
        actorSlot: 'ALLY_MAIN',
        targetSlot: 'ALLY_MAIN',
        hitResult: 'DODGE',
        rageDelta: lightSkill.id === 'lingbo_weibu' ? 25 : 10,
        segments: [
          { type: 'actor', name: enemyActor.name, isAlly: false },
          { type: 'text', text: '攻来，' },
          { type: 'actor', name: player.nickname, isAlly: true, isPlayer: true },
          { type: 'text', text: '使出' },
          { type: 'skill', id: lightSkill.id, name: `《${lightSkill.name}》`, tier: lightSkill.tier },
          { type: 'text', text: '闪开了。' },
        ],
      })
      continue
    }

    let rawEnemyDmg = incomingDamage(currentEnemyAtk, stanceMultEnemy, pDerived.def, player.level)
    if (isWipeoutRound) {
      rawEnemyDmg = Math.max(99999, rawEnemyDmg * 15) // 狂暴终结回合灭顶绝杀
    }

    // 右翼奇策援护化解判定
    const rightUnit = units.find((u) => u.slot === 'ALLY_RIGHT')
    if (rightUnit && round % 2 === 0) {
      const reducedDmg = Math.round(rawEnemyDmg * 0.48)
      hpState.ALLY_MAIN = Math.max(0, hpState.ALLY_MAIN - reducedDmg)
      const rComp = rightCompanion
      events.push({
        round,
        type: 'GUARD_BLOCK',
        actorSlot: 'ALLY_RIGHT',
        targetSlot: 'ALLY_MAIN',
        hpDelta: -reducedDmg,
        segments: [
          { type: 'actor', name: enemyActor.name, isAlly: false },
          { type: 'text', text: '一招攻来，' },
          { type: 'actor', name: rightUnit.name, isAlly: true },
          { type: 'text', text: `用「${rComp?.assistSkillName ?? '玉箫封穴'}」帮你挡下一部分，你受到 ` },
          { type: 'damage', value: reducedDmg, category: 'phys' },
        ],
      })
    } else {
      hpState.ALLY_MAIN = Math.max(0, hpState.ALLY_MAIN - rawEnemyDmg)
      rageState.ALLY_MAIN = Math.min(100, rageState.ALLY_MAIN + 20)

      // 软猬甲或九阳神功反伤判定
      const hasReflect = loadout.armorId === 'ruanwei_armor' || loadout.innerSkillId === 'jiuyang_shengong' || loadout.stance === 'TAICHI'
      const reflectDmg = hasReflect ? Math.round(rawEnemyDmg * 0.38) : 0
      if (reflectDmg > 0) {
        hpState[enemyActorSlot] = Math.max(0, hpState[enemyActorSlot] - reflectDmg)
      }

      const enemySegs: RichSegment[] = [
        { type: 'actor', name: enemyActor.name, isAlly: false },
        { type: 'text', text: '击中了你，伤害 ' },
        { type: 'damage', value: rawEnemyDmg, category: 'phys' },
      ]
      if (reflectDmg > 0) {
        enemySegs.push(
          { type: 'text', text: '。你反弹伤害 ' },
          { type: 'damage', value: reflectDmg, category: 'reflect' }
        )
      }

      events.push({
        round,
        type: 'SKILL_CAST',
        actorSlot: enemyActorSlot,
        targetSlot: 'ALLY_MAIN',
        hitResult: 'HIT',
        hpDelta: -rawEnemyDmg,
        reflectDelta: reflectDmg > 0 ? -reflectDmg : undefined,
        rageDelta: 20,
        segments: enemySegs,
      })
    }

    if (surviveRounds && round >= surviveRounds && hpState.ALLY_MAIN > 0) {
      survived = true
      break
    }
  }

  const enemyDead = hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0
  const winner: 'ALLY' | 'ENEMY' = enemyDead || survived ? 'ALLY' : 'ENEMY'

  return {
    battleId: `bt_${Date.now()}`,
    sceneTitle,
    mode,
    stanceBanner: {
      allyStance: loadout.stance,
      enemyStance: enemyMain.stance,
      advantage: stanceInfo.advantage,
      description: stanceInfo.description,
    },
    units,
    winner,
    events,
    rewards: winner === 'ALLY' ? rewards : undefined,
  }
}

type RaidFighter = { player: PlayerDTO; loadout: LoadoutPresetDTO; learnedSkills: Readonly<Record<string, number>> }

export function simulateShaoshiRaid(battleId: string, lineup: readonly [RaidFighter, RaidFighter, RaidFighter]): BattleReportDTO {
  const allySlots = ['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'] as const
  const enemySlots = ['ENEMY_LEFT', 'ENEMY_RIGHT', 'ENEMY_MAIN'] as const
  const allies = lineup.map((fighter, index) => {
    const stats = computeDerivedStats(fighter.player, fighter.loadout)
    const unit = playerUnit(allySlots[index], fighter.player, fighter.loadout, stats)
    return { ...fighter, stats, unit, hp: unit.hp, rage: unit.rage }
  })
  const enemies = [...SHAOSHI_RAID.guards, SHAOSHI_RAID.boss].map((enemy, index) => {
    const slot = enemySlots[index]
    const unit: CombatUnitDTO = {
      slot, id: slot, name: enemy.name, title: enemy.title, portraitStyle: enemy.portrait,
      isPlayer: false, hp: enemy.hp, maxHp: enemy.hp, maxMp: enemy.mp, rage: 0,
    }
    return { ...enemy, unit, hp: Number(enemy.hp) }
  })
  const leadStance = lineup[0].loadout.stance
  const enemyStance = SHAOSHI_RAID.boss.stance
  const { advantage } = evaluateStanceAdvantage(leadStance, enemyStance)
  const description = `「${lineup[0].player.nickname}」带队入阵，三位侠客先破左右黑索，再战渡厄。`
  const events: BattleEventDTO[] = [
    { round: 1, type: 'STANCE_CLASH', actorSlot: 'ALLY_MAIN', segments: [{ type: 'text', text: description }] },
  ]

  const raidEnrageStart = 22
  const raidMaxRounds = 26
  let raidEnraged = false

  for (let round = 1; round <= raidMaxRounds; round++) {
    if (round >= raidEnrageStart && !raidEnraged) {
      raidEnraged = true
      events.push({
        round,
        type: 'BOSS_ENRAGE',
        actorSlot: 'ENEMY_MAIN',
        segments: [
          { type: 'tag', text: '首领狂暴', tone: 'red' },
          { type: 'text', text: ' 三位神僧久战不下，金刚伏魔圈血煞翻涌进入【狂暴】！禅杖黑索无坚不摧！' },
        ],
      })
    }
    for (const [index, fighter] of allies.entries()) {
      const target = enemies.find((enemy) => enemy.hp > 0)
      if (fighter.hp <= 0 || !target) continue
      const { player, loadout, stats, unit } = fighter
      const ult = loadout.ultSkillId ? SKILLS[loadout.ultSkillId] : undefined
      const isUlt = !!ult && fighter.rage >= 100
      const skill = isUlt ? ult : loadout.outerSkillId ? SKILLS[loadout.outerSkillId] : undefined
      const relation = stanceRelation(loadout.stance, target.stance)
      const stance = relation === 'WIN' ? 1.25 : relation === 'LOSE' ? 0.88 : 1
      const critical = ((round * 37 + player.stats.agi + index * 17) % 100) < stats.crit
      const power = skill ? skillPowerAtMastery(skill, fighter.learnedSkills[skill.id]) : 1
      const damage = strikeDamage(stats.atk, power, stance, innerPressure(stats.maxMp, target.mp), critical, round)
      target.hp = Math.max(0, target.hp - damage)
      const rageDelta = isUlt ? -85 : Math.min(35, 100 - fighter.rage)
      fighter.rage += rageDelta
      const move: RichSegment = skill
        ? { type: 'skill', id: skill.id, name: `《${skill.name}》`, tier: skill.tier }
        : { type: 'text', text: '平掌' }
      events.push({
        round, type: 'SKILL_CAST', actorSlot: unit.slot, targetSlot: target.unit.slot,
        skillId: skill?.id, skillName: skill?.name ?? '平掌', skillTier: skill?.tier,
        hitResult: critical ? 'CRIT' : 'HIT', isUlt, hpDelta: -damage, rageDelta,
        segments: [
          { type: 'actor', name: unit.name, isAlly: true, isPlayer: true }, { type: 'text', text: '使出' }, move,
          { type: 'text', text: '击中' }, { type: 'actor', name: target.name, isAlly: false },
          { type: 'text', text: '，伤害 ' }, { type: 'damage', value: damage, isCrit: critical, category: skill?.qiDamageRatio ? 'qi' : 'phys' },
        ],
      })
    }
    if (enemies.every((enemy) => enemy.hp <= 0)) break

    for (const [index, enemy] of enemies.entries()) {
      if (enemy.hp <= 0) continue
      const living = allies.filter((fighter) => fighter.hp > 0)
      if (!living.length) break
      const target = living[(round - 1 + index) % living.length]
      const relation = stanceRelation(target.loadout.stance, enemy.stance)
      const multiplier = relation === 'LOSE' ? 1.22 : relation === 'WIN' ? 0.82 : 1
      const raidAtkMult = raidEnraged ? Math.pow(1.35, round - raidEnrageStart + 1) : 1.0
      const dodged = !raidEnraged && (round * 29 + index * 13 + target.player.stats.agi) % 100 < Math.min(42, target.stats.dodge)
      const segments: RichSegment[] = [
        { type: 'actor', name: enemy.name, isAlly: false }, { type: 'text', text: '攻向' },
        { type: 'actor', name: target.unit.name, isAlly: true, isPlayer: true },
      ]
      if (dodged) {
        segments.push({ type: 'text', text: '，被闪开了。' })
        events.push({ round, type: 'DODGE', actorSlot: enemy.unit.slot, targetSlot: target.unit.slot, hitResult: 'DODGE', segments })
      } else {
        let damage = incomingDamage(Math.round(enemy.atk * raidAtkMult), multiplier, target.stats.def, target.player.level)
        if (round >= raidMaxRounds) damage = Math.max(99999, damage * 15)
        target.hp = Math.max(0, target.hp - damage)
        segments.push({ type: 'text', text: '，伤害 ' }, { type: 'damage', value: damage, category: 'phys' })
        events.push({ round, type: 'SKILL_CAST', actorSlot: enemy.unit.slot, targetSlot: target.unit.slot, hitResult: 'HIT', hpDelta: -damage, segments })
      }
    }
    if (allies.every((fighter) => fighter.hp <= 0)) break
  }

  return {
    battleId, sceneTitle: SHAOSHI_RAID.title, mode: 'COOP_3P',
    stanceBanner: { allyStance: leadStance, enemyStance, advantage, description },
    units: [...allies, ...enemies].map(({ unit }) => unit),
    winner: enemies.every((enemy) => enemy.hp <= 0) ? 'ALLY' : 'ENEMY', events,
  }
}
