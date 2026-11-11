import type {
  BattleEventDTO,
  BattleReportDTO,
  CombatUnitDTO,
  GhostMarketListingDTO,
  LoadoutPresetDTO,
  PlayerDTO,
  RichSegment,
  RoomPlayerDTO,
  StanceType,
  UniqueArtifactStatusDTO,
} from './protocol'
import { COMPANIONS, companionView, findTrioSynergy, ITEMS, REALMS, SECTS, SKILLS, type CompanionView, type SkillConfig } from '@/config/gameData'

export function calcNextLevelQi(level: number): number {
  return Math.round(500 * Math.pow(level, 1.55) * Math.pow(1.08, Math.floor(level / 5)))
}

export function getStanceLabel(stance: StanceType): string {
  if (stance === 'FIERCE') return '刚猛强攻势'
  if (stance === 'AGILE') return '奇门极速势'
  return '太极柔化势'
}

export function evaluateStanceAdvantage(ally: StanceType, enemy: StanceType): {
  advantage: 'ALLY' | 'ENEMY' | 'NONE'
  description: string
} {
  if (ally === enemy) {
    return {
      advantage: 'NONE',
      description: `双方同摆【${getStanceLabel(ally)}】，旗鼓相当，正面硬撼！`,
    }
  }
  const winMap: Record<StanceType, StanceType> = {
    FIERCE: 'AGILE',
    AGILE: 'TAICHI',
    TAICHI: 'FIERCE',
  }
  if (winMap[ally] === enemy) {
    const flavor =
      ally === 'FIERCE'
        ? '一力降十会！我方掌风霸道，压制敌方奇门变招（伤害 +25%）'
        : ally === 'AGILE'
          ? '唯快不破！我方抢占先机看穿虚实（暴击与破招 +25%）'
          : '借力打力！我方太极圆转卸劲反震敌方刚猛掌力（减伤与反震 +25%）'
    return { advantage: 'ALLY', description: `【架势克制】${flavor}` }
  }
  return {
    advantage: 'ENEMY',
    description: `【架势受制】敌方【${getStanceLabel(enemy)}】克制我方【${getStanceLabel(ally)}】，需靠深厚内力与伙伴连携破局！`,
  }
}

const BARE_HANDS: SkillConfig = {
  id: 'bare_hands', name: '寻常拳脚', slot: 'OUTER', tier: 'green', source: '无师自通', powerRatio: 1.0,
  desc: '未习得任何外功时的寻常拳脚。', castNarrative: '挥拳直取敌方要害，虽无章法，却也虎虎生风',
}
const NO_LIGHT_SKILL: SkillConfig = {
  id: 'no_light', name: '腾挪闪躲', slot: 'LIGHT', tier: 'green', source: '无师自通', powerRatio: 1.0,
  desc: '未习得轻功时凭身法闪躲。', castNarrative: '侧身一让，险险避开',
}

/** 计算玩家二级战斗面板（严格对应第06册公式） */
/** 收集羁绊带来的全局百分比加成（见 gameData.COMPANION_SETS） */
export interface CollectionBonus {
  hpPct?: number
  atkPct?: number
}

export function computeDerivedStats(player: PlayerDTO, loadout: LoadoutPresetDTO, bonus: CollectionBonus = {}) {
  const realm = REALMS.find((r) => r.tier === player.realmTier) ?? REALMS[0]
  const m = realm.multiplier
  const s = player.stats

  const w = loadout.weaponId ? ITEMS[loadout.weaponId] : undefined
  const ar = loadout.armorId ? ITEMS[loadout.armorId] : undefined
  const ac = loadout.accId ? ITEMS[loadout.accId] : undefined
  const rl = loadout.relicBookId ? ITEMS[loadout.relicBookId] : undefined
  const inner = loadout.innerSkillId ? SKILLS[loadout.innerSkillId] : undefined
  const light = loadout.lightSkillId ? SKILLS[loadout.lightSkillId] : undefined
  const outer = loadout.outerSkillId ? SKILLS[loadout.outerSkillId] : undefined

  const equipHp = (ar?.hpBonus ?? 0) + (ac?.hpBonus ?? 0) + (rl?.hpBonus ?? 0)
  const equipAtk = w?.atkBonus ?? 0
  const equipDef = (ar?.defBonus ?? 0) + (rl?.defBonus ?? 0)

  const hpBonusMult = (1 + (player.bonusHpPct ?? 0) / 100) * (1 + (bonus.hpPct ?? 0) / 100)
  const atkBonusMult = 1 + (bonus.atkPct ?? 0) / 100
  const maxHp = Math.round((320 + player.level * 85 + s.con * 46) * m * (inner?.id === 'jiuyin_zonggang' ? 1.25 : 1.08) * hpBonusMult + equipHp)
  const maxMp = Math.round((120 + player.level * 32 + s.con * 26 + s.intStat * 12) * m)
  const atk = Math.round(((45 + player.level * 13 + s.str * 8.5 + s.agi * 2.5) * m + equipAtk) * atkBonusMult)
  const def = Math.round((22 + player.level * 6 + s.con * 5.5 + s.str * 2.0) * m + equipDef)
  const speed = Math.round(100 + s.agi * 3.2 + (light?.speedBonus ?? 0))
  const dodge = Math.min(65, Math.round((s.agi / (s.agi + 180 + player.level * 4)) * 45 + (light?.dodgeBonus ?? 0)))
  const crit = Math.min(
    75,
    Math.round(
      8 +
        ((s.agi * 0.6 + s.intStat * 0.4) / (s.agi + s.intStat + 220)) * 40 +
        (w?.critBonus ?? 0) +
        (ac?.critBonus ?? 0) +
        (outer?.critBonus ?? 0) +
        (inner?.critBonus ?? 0)
    )
  )

  const combatPower = Math.round(maxHp * 0.35 + maxMp * 0.25 + atk * 4.2 + def * 2.8 + speed * 3.5 + crit * 45)
  return { maxHp, maxMp, atk, def, speed, dodge, crit, combatPower }
}

/** 模拟同地图在线真实玩家池 */
export function generateRoomPlayers(mapId: string): RoomPlayerDTO[] {
  if (mapId === 'jiaxing_suburb') {
    return [
      { id: 'rp_1', nickname: '烟雨断桥客', sectName: '逍遥散人', realmName: '融会贯通', level: 34, combatPower: 14200, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_2', nickname: '清风道长', sectName: '终南全真教', realmName: '炉火纯青', level: 48, combatPower: 26800, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_3', nickname: '桃花小师妹', sectName: '东海桃花岛', realmName: '略有小成', level: 27, combatPower: 10900, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_4', nickname: '逆徒·尹狂刀', sectName: '全真弃徒', realmName: '融会贯通', level: 36, combatPower: 15600, stance: 'FIERCE', isBetrayerBounty: true, isEscortingDart: false },
    ]
  }
  if (mapId === 'zhongnan_forest') {
    return [
      { id: 'rp_5', nickname: '活死人墓客', sectName: '终南古墓派', realmName: '炉火纯青', level: 52, combatPower: 33400, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_6', nickname: '重阳执剑人', sectName: '终南全真教', realmName: '融会贯通', level: 41, combatPower: 21500, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
    ]
  }
  if (mapId === 'damo_caravan') {
    return [
      { id: 'rp_7', nickname: '威远总镖头', sectName: '丐帮', realmName: '融会贯通', level: 38, combatPower: 18500, stance: 'FIERCE', isBetrayerBounty: false, isEscortingDart: true },
      { id: 'rp_8', nickname: '西域毒皇·欧阳烈', sectName: '西域白驼山庄', realmName: '一代宗师', level: 63, combatPower: 64200, stance: 'FIERCE', isBetrayerBounty: false, isEscortingDart: false, holdingUniqueArtifact: '真·绿玉打狗棒' },
      { id: 'rp_9', nickname: '塞外孤狼', sectName: '逍遥散人', realmName: '略有小成', level: 29, combatPower: 12800, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: true },
    ]
  }
  if (mapId === 'guiyun_lake') {
    return [
      { id: 'rp_12', nickname: '归云庄少庄主', sectName: '东海桃花岛', realmName: '融会贯通', level: 36, combatPower: 17200, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_13', nickname: '太湖渔隐', sectName: '逍遥散人', realmName: '融会贯通', level: 39, combatPower: 19800, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
    ]
  }
  if (mapId === 'taohua_isle') {
    return [
      { id: 'rp_14', nickname: '哑仆（桃花岛）', sectName: '东海桃花岛', realmName: '炉火纯青', level: 50, combatPower: 30500, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_15', nickname: '试剑亭客', sectName: '逍遥散人', realmName: '炉火纯青', level: 47, combatPower: 27400, stance: 'FIERCE', isBetrayerBounty: false, isEscortingDart: false },
    ]
  }
  if (mapId === 'huashan_peak') {
    return [
      { id: 'rp_16', nickname: '论剑台守擂人', sectName: '终南全真教', realmName: '一代宗师', level: 66, combatPower: 58200, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_17', nickname: '西毒门徒·白衣客', sectName: '西域白驼山庄', realmName: '一代宗师', level: 64, combatPower: 55400, stance: 'FIERCE', isBetrayerBounty: true, isEscortingDart: false },
    ]
  }
  return [
    { id: 'rp_10', nickname: '湘西赶尸人', sectName: '西域白驼山庄', realmName: '炉火纯青', level: 47, combatPower: 27900, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
    { id: 'rp_11', nickname: '陆乘云', sectName: '东海桃花岛', realmName: '一代宗师', level: 65, combatPower: 71000, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: true, holdingUniqueArtifact: '真·桃花岛软猬甲' },
  ]
}

/** 服务端权威确定性战斗推演生成器（支持 1主+2副 及 3人真实玩家结义组队） */
export function simulateServerBattle(params: {
  sceneTitle: string
  mode: BattleReportDTO['mode']
  player: PlayerDTO
  loadout: LoadoutPresetDTO
  enemyMain: { name: string; title: string; portrait: CombatUnitDTO['portraitStyle']; hp: number; atk: number; mp: number; stance: StanceType }
  enemyGuards?: { name: string; title: string; portrait: CombatUnitDTO['portraitStyle']; hp: number; atk: number }[]
  coopPlayers?: { leftPlayer: { name: string; sect: string; hp: number; atk: number }; rightPlayer: { name: string; sect: string; hp: number; atk: number } }
  rewards?: BattleReportDTO['rewards']
  bonus?: CollectionBonus
  /** 取伙伴的当前形态视图（形态 / 资质已套用）；缺省按基础形态 */
  companionOf?: (id: string) => CompanionView | undefined
}): BattleReportDTO {
  const { sceneTitle, mode, player, loadout, enemyMain, enemyGuards, coopPlayers, rewards, bonus, companionOf } = params
  const comp = (id: string | null): CompanionView | undefined =>
    !id ? undefined : companionOf ? companionOf(id) : COMPANIONS[id] ? companionView(COMPANIONS[id]) : undefined
  const pDerived = computeDerivedStats(player, loadout, bonus)
  const stanceInfo = evaluateStanceAdvantage(loadout.stance, enemyMain.stance)

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
  } else if (loadout.leftCompanionId && comp(loadout.leftCompanionId)) {
    const c = comp(loadout.leftCompanionId)!
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

  const mainWeapon = loadout.weaponId ? ITEMS[loadout.weaponId]?.name : '赤手空拳'
  units.push({
    slot: 'ALLY_MAIN',
    id: player.id,
    name: player.nickname,
    title: player.currentSectId ? (SECTS.find((s) => s.id === player.currentSectId)?.name ?? '江湖侠客') : '逍遥散人',
    portraitStyle: 'hero_sword',
    isPlayer: true,
    maxHp: pDerived.maxHp,
    hp: pDerived.maxHp,
    maxMp: pDerived.maxMp,
    rage: 50,
    weaponName: mainWeapon,
  })

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
  } else if (loadout.rightCompanionId && comp(loadout.rightCompanionId)) {
    const c = comp(loadout.rightCompanionId)!
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
  // 槽位为空时：外功退化为寻常拳脚，绝技槽空则不放绝技，轻功槽空则仅凭身法闪躲
  const outerSkill = (loadout.outerSkillId && SKILLS[loadout.outerSkillId]) || BARE_HANDS
  const ultSkill = (loadout.ultSkillId && SKILLS[loadout.ultSkillId]) || null
  const lightSkill = (loadout.lightSkillId && SKILLS[loadout.lightSkillId]) || NO_LIGHT_SKILL

  // 内力深浅压制系数 K_mp
  const kMp = Math.max(0.78, Math.min(1.48, 1 + 0.25 * ((pDerived.maxMp - enemyMain.mp) / Math.max(500, enemyMain.mp))))
  const stanceMultAlly = stanceInfo.advantage === 'ALLY' ? 1.25 : stanceInfo.advantage === 'ENEMY' ? 0.88 : 1.0
  const stanceMultEnemy = stanceInfo.advantage === 'ENEMY' ? 1.22 : stanceInfo.advantage === 'ALLY' ? 0.82 : 1.0

  // 开场三才架势交锋播报
  events.push({
    round: 1,
    type: 'STANCE_CLASH',
    actorSlot: 'ALLY_MAIN',
    segments: [
      { type: 'tag', text: '阵势对决', tone: stanceInfo.advantage === 'ALLY' ? 'jade' : 'gold' },
      { type: 'text', text: ` ${stanceInfo.description}` },
    ],
  })

  const trioSynergy = findTrioSynergy(loadout.leftCompanionId, loadout.rightCompanionId) ?? undefined

  for (let round = 1; round <= 12; round++) {
    if (hpState.ALLY_MAIN <= 0 || (hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0)) {
      break
    }

    // 挑选当前存活的敌方目标
    const targetSlot: CombatUnitDTO['slot'] =
      (hpState.ENEMY_LEFT ?? 0) > 0 && round % 2 === 1
        ? 'ENEMY_LEFT'
        : hpState.ENEMY_MAIN > 0
          ? 'ENEMY_MAIN'
          : (hpState.ENEMY_RIGHT ?? 0) > 0
            ? 'ENEMY_RIGHT'
            : 'ENEMY_MAIN'
    const targetUnit = units.find((u) => u.slot === targetSlot)!

    // 1. 我方主角出手（满100怒气放绝技，否则放外功）
    const isUlt = !!ultSkill && rageState.ALLY_MAIN >= 100
    const castSkill = isUlt ? ultSkill! : outerSkill
    const isCrit = ((round * 37 + player.stats.agi) % 100) < pDerived.crit
    const baseDmg = pDerived.atk * castSkill.powerRatio * stanceMultAlly * kMp * (isCrit ? 1.55 : 1.0)
    const dmg = Math.max(95, Math.round(baseDmg * (0.95 + ((round * 13) % 10) * 0.01)))

    hpState[targetSlot] = Math.max(0, hpState[targetSlot] - dmg)
    rageState.ALLY_MAIN = isUlt ? 15 : Math.min(100, rageState.ALLY_MAIN + 35)

    const segs: RichSegment[] = [
      { type: 'actor', name: player.nickname, isAlly: true, isPlayer: true },
      { type: 'text', text: `${castSkill.castNarrative}，使出` },
      { type: 'skill', id: castSkill.id, name: `《${castSkill.name}》`, tier: castSkill.tier },
      { type: 'text', text: '直击' },
      { type: 'actor', name: targetUnit.name, isAlly: false },
      { type: 'text', text: '！造成 ' },
      { type: 'damage', value: dmg, isCrit, category: castSkill.qiDamageRatio ? 'qi' : 'phys' },
    ]
    if (kMp >= 1.15) {
      segs.push({ type: 'tag', text: `内力碾压+${Math.round((kMp - 1) * 100)}%`, tone: 'gold' })
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
      const compCfg = loadout.leftCompanionId ? comp(loadout.leftCompanionId) : undefined
      events.push({
        round,
        type: 'ASSIST_ATTACK',
        actorSlot: 'ALLY_LEFT',
        targetSlot,
        skillName: compCfg?.assistSkillName ?? '重剑横扫',
        hpDelta: -assistDmg,
        segments: [
          { type: 'tag', text: trioSynergy ? `羁绊·${trioSynergy.name}` : '左翼破阵', tone: 'purple' },
          { type: 'text', text: ' 身旁的' },
          { type: 'actor', name: leftUnit.name, isAlly: true },
          { type: 'text', text: `踏步跟进，施展「${compCfg?.assistSkillName ?? '破军连击'}」首尾相衔！追加 ` },
          { type: 'damage', value: assistDmg, category: 'phys' },
        ],
      })
    }

    if (hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0) {
      break
    }

    // 3. 敌方主将反扑
    const enemyActorSlot: CombatUnitDTO['slot'] = hpState.ENEMY_MAIN > 0 ? 'ENEMY_MAIN' : 'ENEMY_LEFT'
    const enemyActor = units.find((u) => u.slot === enemyActorSlot)!

    // 轻功闪避判定
    const rollDodge = (round * 29 + player.stats.agi) % 100
    if (rollDodge < Math.min(42, pDerived.dodge)) {
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
          { type: 'text', text: '掌风凌厉袭来，' },
          { type: 'actor', name: player.nickname, isAlly: true, isPlayer: true },
          { type: 'text', text: lightSkill.castNarrative + '，使出' },
          { type: 'skill', id: lightSkill.id, name: `《${lightSkill.name}》`, tier: lightSkill.tier },
          { type: 'tag', text: '飘然闪避', tone: 'jade' },
        ],
      })
      continue
    }

    let rawEnemyDmg = Math.round(enemyMain.atk * stanceMultEnemy * (1 - pDerived.def / (pDerived.def + 700 + player.level * 55)))
    rawEnemyDmg = Math.max(70, rawEnemyDmg)

    // 右翼奇策援护化解判定
    const rightUnit = units.find((u) => u.slot === 'ALLY_RIGHT')
    if (rightUnit && round % 2 === 0) {
      const reducedDmg = Math.round(rawEnemyDmg * 0.48)
      hpState.ALLY_MAIN = Math.max(0, hpState.ALLY_MAIN - reducedDmg)
      const rComp = loadout.rightCompanionId ? comp(loadout.rightCompanionId) : undefined
      events.push({
        round,
        type: 'GUARD_BLOCK',
        actorSlot: 'ALLY_RIGHT',
        targetSlot: 'ALLY_MAIN',
        hpDelta: -reducedDmg,
        segments: [
          { type: 'actor', name: enemyActor.name, isAlly: false },
          { type: 'text', text: '狠招直取咽喉！右翼' },
          { type: 'actor', name: rightUnit.name, isAlly: true },
          { type: 'text', text: `眼疾手快施展「${rComp?.assistSkillName ?? '玉箫封穴'}」卸去大半劲力，你仅受 ` },
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
        { type: 'text', text: '催动全身真气猛烈扑击，震得你气血翻涌，承受 ' },
        { type: 'damage', value: rawEnemyDmg, category: 'phys' },
      ]
      if (reflectDmg > 0) {
        enemySegs.push(
          { type: 'text', text: '；你的护体劲力/软猬宝甲瞬间反震其 ' },
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
  }

  const enemyDead = hpState.ENEMY_MAIN <= 0 && (hpState.ENEMY_LEFT ?? 0) <= 0 && (hpState.ENEMY_RIGHT ?? 0) <= 0
  const winner: 'ALLY' | 'ENEMY' = enemyDead || hpState.ALLY_MAIN > hpState.ENEMY_MAIN ? 'ALLY' : 'ENEMY'

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

/** 初始全服唯一真品神兵公示表 */
export const INITIAL_UNIQUE_ARTIFACTS: UniqueArtifactStatusDTO[] = [
  { artifactCode: 'TRUE_TULONG', itemId: 'xuantie_heavysword', name: '真·屠龙宝刀', holderNickname: '萧峰传人·乔北冥', holderSect: '丐帮', defendStreak: 3, nextContestLabel: '周日20:00 王盘山扬刀大会' },
  { artifactCode: 'TRUE_DAGOU', itemId: 'dagou_stick_true', name: '真·绿玉打狗棒', holderNickname: '西域毒皇·欧阳烈', holderSect: '西域白驼山庄', defendStreak: 1, nextContestLabel: '离线>72h自动回收 / 君山擂台' },
  { artifactCode: 'TRUE_RUANWEI', itemId: 'ruanwei_armor', name: '真·桃花岛软猬甲', holderNickname: '陆乘云', holderSect: '东海桃花岛', defendStreak: 5, nextContestLabel: '周六试剑亭守擂' },
  { artifactCode: 'TRUE_YITIAN', itemId: 'biyu_xiao', name: '真·倚天剑', holderNickname: null, holderSect: '万安寺秘境待择主', defendStreak: 0, nextContestLabel: '全服首通3.0倚天篇择主' },
]

/** 初始子时鬼市匿名寄售与竞拍单 */
export const INITIAL_GHOST_LISTINGS: GhostMarketListingDTO[] = [
  { id: 'mk_1', maskedSeller: '蒙面客·甲戌', itemId: 'kongming_quan', itemName: '《空明拳》手抄拓本', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 6800, desc: '清音洞孤本拓印，至柔化刚拳谱。' },
  { id: 'mk_2', maskedSeller: '黑衣人·丙辰', itemId: 'wucan_baoyi', itemName: '大雪山乌蚕宝衣', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 8500, desc: '刀枪不入，外功减免30%。' },
  { id: 'mk_3', maskedSeller: '全真逆徒·匿名销赃', itemId: 'jiuwei_fox', itemName: '黑沼·九尾灵狐', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 9200, desc: '通灵白狐，速度大增并可替死一次。' },
  { id: 'mk_4', maskedSeller: '鬼市压轴官拍', itemId: 'lingbo_weibu', itemName: '《凌波微步》琅嬛帛卷', tier: 'red', listingType: 'AUCTION', currency: 'GOLD', price: 320, highestBidderMasked: '蒙面客·癸亥', desc: '21:00子时压轴竞拍！足踏六十四卦，闪避回怒神技！' },
]
