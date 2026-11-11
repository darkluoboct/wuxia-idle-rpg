import { computeDerivedStats, strikeDamage, incomingDamage, innerPressure, evaluateStanceAdvantage } from '../shared/battle.ts'
import { ITEMS, SKILLS, REALMS, ONLINE_STORY_CHAPTERS as STORY_CHAPTERS, COMPANIONS } from '../shared/gameData.ts'
import { skillPowerAtMastery } from '../shared/skillMastery.ts'
import type { PlayerDTO, LoadoutPresetDTO, StanceType, SkillTier } from '../shared/protocol.ts'

interface SimConfig {
  name: string
  playerLevel: number
  realmTier: number
  stats: { str: number; agi: number; con: number; intStat: number }
  gear: {
    weaponId?: string
    armorId?: string
    headId?: string
    wristId?: string
    beltId?: string
    bootsId?: string
    accId?: string
    relicId?: string
  }
  skills: {
    outerSkillId: string
    innerSkillId: string
    lightSkillId: string
    ultSkillId: string
    mastery: Record<string, number>
  }
  companions?: {
    leftCompanionId?: string
    rightCompanionId?: string
  }
  stance: StanceType
  boss: {
    name: string
    hp: number
    atk: number
    mp: number
    stance: StanceType
  }
}

interface BattleResult {
  winner: 'ALLY' | 'ENEMY'
  rounds: number
  playerHpRemain: number
  playerHpPercent: number
  bossHpRemain: number
  bossHpPercent: number
  enrageTriggered: boolean
  eventsCount: number
}

function simulateCombat(
  cfg: SimConfig,
  enrageStartRound: number = 999, // default no enrage
  enrageAtkMultPerRound: number = 0.35 // +35% ATK per round compound after enrage
): BattleResult {
  const player: PlayerDTO = {
    id: 'test_player',
    nickname: '侠士',
    realmTier: cfg.realmTier,
    level: cfg.playerLevel,
    stats: cfg.stats,
    qiExp: 0,
    silver: 0,
    avatarId: 'hero',
    stance: cfg.stance,
    maxChapterId: 10,
    currentSectId: 'huashan',
    sectRank: 'INNER',
    pvpScore: 1000,
  }

  const loadout: LoadoutPresetDTO = {
    id: 'test_loadout',
    name: '测试配置',
    stance: cfg.stance,
    outerSkillId: cfg.skills.outerSkillId,
    innerSkillId: cfg.skills.innerSkillId,
    lightSkillId: cfg.skills.lightSkillId,
    ultSkillId: cfg.skills.ultSkillId,
    leftCompanionId: cfg.companions?.leftCompanionId,
    rightCompanionId: cfg.companions?.rightCompanionId,
    relicBookId: cfg.gear.relicId,
    ...cfg.gear,
  }

  const pDerived = computeDerivedStats(player, loadout)
  const stanceInfo = evaluateStanceAdvantage(loadout.stance, cfg.boss.stance)

  const stanceMultAlly = stanceInfo.advantage === 'ALLY' ? 1.25 : stanceInfo.advantage === 'ENEMY' ? 0.88 : 1.0
  const stanceMultEnemy = stanceInfo.advantage === 'ENEMY' ? 1.22 : stanceInfo.advantage === 'ALLY' ? 0.82 : 1.0

  let playerHp = pDerived.maxHp
  let playerRage = 50
  let bossHp = cfg.boss.hp
  const bossMaxHp = cfg.boss.hp

  const kMp = innerPressure(pDerived.maxMp, cfg.boss.mp)

  const outerSkill = SKILLS[cfg.skills.outerSkillId] || SKILLS.yuenv_jian
  const ultSkill = SKILLS[cfg.skills.ultSkillId] || SKILLS.kanglong_youhui
  const lightSkill = SKILLS[cfg.skills.lightSkillId] || SKILLS.jinyan_gong

  let enrageTriggered = false
  let round = 1
  const maxRounds = 50 // cap at 50 rounds to prevent true infinite loop

  for (; round <= maxRounds; round++) {
    if (playerHp <= 0 || bossHp <= 0) break

    // Check enrage condition
    let currentEnemyAtk = cfg.boss.atk
    if (round >= enrageStartRound) {
      enrageTriggered = true
      const enrageRounds = round - enrageStartRound + 1
      // Compound damage increase: +35% per round after enrage
      currentEnemyAtk = Math.round(cfg.boss.atk * Math.pow(1 + enrageAtkMultPerRound, enrageRounds))
    }

    // 1. Ally Main Turn
    const isUlt = playerRage >= 100
    const castSkill = isUlt ? ultSkill : outerSkill
    const isCrit = ((round * 37 + player.stats.agi) % 100) < pDerived.crit
    const power = skillPowerAtMastery(castSkill, cfg.skills.mastery[castSkill.id])
    const dmg = strikeDamage(pDerived.atk, power, stanceMultAlly, kMp, isCrit, round)

    bossHp = Math.max(0, bossHp - dmg)
    playerRage = isUlt ? 15 : Math.min(100, playerRage + 35)

    // Left companion assist
    if (cfg.companions?.leftCompanionId && bossHp > 0 && round % 2 === 1) {
      const assistDmg = Math.round(pDerived.atk * 0.78 * stanceMultAlly)
      bossHp = Math.max(0, bossHp - assistDmg)
    }

    if (bossHp <= 0) break

    // 2. Boss Turn
    // Dodge check: during enrage, boss cannot be dodged
    const rollDodge = (round * 29 + player.stats.agi) % 100
    if (!enrageTriggered && rollDodge < Math.min(42, pDerived.dodge)) {
      playerRage = Math.min(100, playerRage + (lightSkill.id === 'lingbo_weibu' ? 25 : 10))
      continue
    }

    const rawEnemyDmg = incomingDamage(currentEnemyAtk, stanceMultEnemy, pDerived.def, player.level)

    // Right companion block
    if (cfg.companions?.rightCompanionId && round % 2 === 0 && !enrageTriggered) {
      const reducedDmg = Math.round(rawEnemyDmg * 0.48)
      playerHp = Math.max(0, playerHp - reducedDmg)
    } else {
      playerHp = Math.max(0, playerHp - rawEnemyDmg)
      playerRage = Math.min(100, playerRage + 20)

      // Reflect check
      const hasReflect = loadout.armorId === 'ruanwei_armor' || loadout.innerSkillId === 'jiuyang_shengong' || loadout.stance === 'TAICHI'
      const reflectDmg = hasReflect ? Math.round(rawEnemyDmg * 0.38) : 0
      if (reflectDmg > 0) {
        bossHp = Math.max(0, bossHp - reflectDmg)
      }
    }
  }

  const finalRound = Math.min(round, maxRounds)
  const winner = bossHp <= 0 ? 'ALLY' : 'ENEMY'

  return {
    winner,
    rounds: finalRound,
    playerHpRemain: playerHp,
    playerHpPercent: Math.round((playerHp / pDerived.maxHp) * 100),
    bossHpRemain: bossHp,
    bossHpPercent: Math.round((bossHp / bossMaxHp) * 100),
    enrageTriggered,
    eventsCount: finalRound,
  }
}

// Benchmark Test Suites
export function runEmpiricalBenchmarks() {
  console.log('========================================================================')
  console.log('          【武侠系统·战斗回合与狂暴机制实测模拟分析】')
  console.log('========================================================================\n')

  const testSuites: SimConfig[] = [
    // -------------------------------------------------------------
    // Chapter 1: 铜尸·陈玄风 (Lv 5 ~ 7)
    // -------------------------------------------------------------
    {
      name: '第01章-陈玄风 [标准配装]',
      playerLevel: 5,
      realmTier: 1,
      stats: { str: 18, agi: 14, con: 16, intStat: 14 },
      gear: {
        weaponId: 'qinggang_sword', // Atk 45
        headId: 'bamboo_hat',       // Def 10, Hp 180
        armorId: 'quanzhen_robe',   // Def 55, Hp 650
        wristId: 'cloth_bracers',   // Atk 12
        beltId: 'cloth_belt',       // Hp 260
        bootsId: 'cloth_boots',     // Dodge 3
      },
      skills: {
        outerSkillId: 'yuenv_jian',
        innerSkillId: 'tuna_mind',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'kanglong_youhui',
        mastery: { yuenv_jian: 2, tuna_mind: 2, jinyan_gong: 2, kanglong_youhui: 1 },
      },
      stance: 'TAICHI', // 克制陈玄风的FIERCE
      boss: {
        name: '铜尸·陈玄风',
        hp: 3600,
        atk: 260,
        mp: 1600,
        stance: 'FIERCE',
      },
    },
    {
      name: '第01章-陈玄风 [未穿当图装备/低配]',
      playerLevel: 4,
      realmTier: 1,
      stats: { str: 14, agi: 12, con: 12, intStat: 12 },
      gear: {
        weaponId: 'qinggang_sword',
        // 缺少大部分防具
      },
      skills: {
        outerSkillId: 'yuenv_jian',
        innerSkillId: 'tuna_mind',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'kanglong_youhui',
        mastery: { yuenv_jian: 1, tuna_mind: 1, jinyan_gong: 1, kanglong_youhui: 1 },
      },
      stance: 'FIERCE', // 同架势不占优
      boss: {
        name: '铜尸·陈玄风',
        hp: 3600,
        atk: 260,
        mp: 1600,
        stance: 'FIERCE',
      },
    },

    // -------------------------------------------------------------
    // Chapter 2: 参仙老怪·梁子翁 (Lv 16)
    // -------------------------------------------------------------
    {
      name: '第02章-梁子翁 [标准配装]',
      playerLevel: 16,
      realmTier: 2,
      stats: { str: 32, agi: 26, con: 30, intStat: 26 },
      gear: {
        weaponId: 'xuantie_dagger', // Atk 95, Crit 15
        headId: 'pine_crown',       // Def 18, Hp 300
        armorId: 'quanzhen_robe',   // Def 55, Hp 650
        wristId: 'iron_bracers',    // Atk 24, Def 12
        beltId: 'oxhide_belt',      // Hp 430, Def 14
        bootsId: 'deerskin_boots',  // Dodge 5, Def 8
        accId: 'iron_bagua',        // Hp 350
      },
      skills: {
        outerSkillId: 'jiuyin_baiguzhua',
        innerSkillId: 'hunyuan_gong',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'kanglong_youhui',
        mastery: { jiuyin_baiguzhua: 3, hunyuan_gong: 2, jinyan_gong: 2, kanglong_youhui: 2 },
      },
      companions: {
        leftCompanionId: 'guojing',
      },
      stance: 'FIERCE', // 克制梁子翁的AGILE
      boss: {
        name: '参仙老怪·梁子翁',
        hp: 8200,
        atk: 480,
        mp: 3600,
        stance: 'AGILE',
      },
    },
    {
      name: '第02章-梁子翁 [纯防龟缩刮痧流]',
      playerLevel: 16,
      realmTier: 2,
      stats: { str: 15, agi: 20, con: 50, intStat: 20 },
      gear: {
        weaponId: 'qinggang_sword', // 极其低攻
        headId: 'pine_crown',
        armorId: 'quanzhen_robe',
        beltId: 'oxhide_belt',
        bootsId: 'deerskin_boots',
      },
      skills: {
        outerSkillId: 'yuenv_jian',
        innerSkillId: 'tuna_mind',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'kanglong_youhui',
        mastery: { yuenv_jian: 1, tuna_mind: 3, jinyan_gong: 2, kanglong_youhui: 1 },
      },
      stance: 'TAICHI',
      boss: {
        name: '参仙老怪·梁子翁',
        hp: 8200,
        atk: 480,
        mp: 3600,
        stance: 'AGILE',
      },
    },

    // -------------------------------------------------------------
    // 【策划案 docs/13_ 精准数值验证】
    // -------------------------------------------------------------
    // Stage 1: 破庙草贼·赖三 (Lv 1)
    {
      name: '第01关-赖三 [绿装蓑衣套·单人]',
      playerLevel: 1,
      realmTier: 1,
      stats: { str: 12, agi: 10, con: 10, intStat: 10 },
      gear: {
        weaponId: 'qinggang_sword', // 模拟劈柴刀 Atk 22~45
        headId: 'bamboo_hat',
        armorId: 'quanzhen_robe',
        wristId: 'cloth_bracers',
        beltId: 'cloth_belt',
        bootsId: 'cloth_boots',
      },
      skills: {
        outerSkillId: 'yuenv_jian',
        innerSkillId: 'tuna_mind',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'kanglong_youhui',
        mastery: { yuenv_jian: 1, tuna_mind: 1, jinyan_gong: 1, kanglong_youhui: 1 },
      },
      stance: 'TAICHI',
      boss: {
        name: '黑风寨逃寇·赖三',
        hp: 800,
        atk: 65,
        mp: 300,
        stance: 'FIERCE',
      },
    },
    // Stage 7: 铜尸·陈玄风 (Lv 7 · docs/13 完整数值 HP 4500, ATK 320)
    {
      name: '第07关-陈玄风 [蓝装大漠套·单人无随从]',
      playerLevel: 7,
      realmTier: 1,
      stats: { str: 20, agi: 16, con: 18, intStat: 15 },
      gear: {
        weaponId: 'xuantie_dagger', // Atk 95
        headId: 'pine_crown',
        armorId: 'quanzhen_robe',
        wristId: 'iron_bracers',
        beltId: 'cloth_belt',
        bootsId: 'deerskin_boots',
      },
      skills: {
        outerSkillId: 'yuenv_jian',
        innerSkillId: 'tuna_mind',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'kanglong_youhui',
        mastery: { yuenv_jian: 2, tuna_mind: 2, jinyan_gong: 2, kanglong_youhui: 1 },
      },
      stance: 'TAICHI',
      boss: {
        name: '铜尸·陈玄风(高难)',
        hp: 4500,
        atk: 320,
        mp: 2200,
        stance: 'FIERCE',
      },
    },
    // Stage 13: 梁子翁 (Lv 13 · docs/13 完整数值 HP 15000, ATK 750)
    {
      name: '第13关-梁子翁 [紫装摧心套·单人]',
      playerLevel: 13,
      realmTier: 2,
      stats: { str: 28, agi: 24, con: 26, intStat: 22 },
      gear: {
        weaponId: 'xuantie_dagger',
        headId: 'pine_crown',
        armorId: 'quanzhen_robe',
        wristId: 'iron_bracers',
        beltId: 'oxhide_belt',
        bootsId: 'deerskin_boots',
        accId: 'iron_bagua',
      },
      skills: {
        outerSkillId: 'jiuyin_baiguzhua',
        innerSkillId: 'hunyuan_gong',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'kanglong_youhui',
        mastery: { jiuyin_baiguzhua: 3, hunyuan_gong: 2, jinyan_gong: 2, kanglong_youhui: 2 },
      },
      stance: 'FIERCE',
      boss: {
        name: '参仙老怪·梁子翁(高难)',
        hp: 15000,
        atk: 750,
        mp: 6800,
        stance: 'AGILE',
      },
    },
    // Stage 13: 梁子翁 [带郭靖协同]
    {
      name: '第13关-梁子翁 [紫装摧心套+郭靖追击]',
      playerLevel: 13,
      realmTier: 2,
      stats: { str: 28, agi: 24, con: 26, intStat: 22 },
      gear: {
        weaponId: 'xuantie_dagger',
        headId: 'pine_crown',
        armorId: 'quanzhen_robe',
        wristId: 'iron_bracers',
        beltId: 'oxhide_belt',
        bootsId: 'deerskin_boots',
        accId: 'iron_bagua',
      },
      skills: {
        outerSkillId: 'jiuyin_baiguzhua',
        innerSkillId: 'hunyuan_gong',
        lightSkillId: 'jinyan_gong',
        ultSkillId: 'kanglong_youhui',
        mastery: { jiuyin_baiguzhua: 3, hunyuan_gong: 2, jinyan_gong: 2, kanglong_youhui: 2 },
      },
      companions: {
        leftCompanionId: 'guojing',
      },
      stance: 'FIERCE',
      boss: {
        name: '参仙老怪·梁子翁(高难)',
        hp: 15000,
        atk: 750,
        mp: 6800,
        stance: 'AGILE',
      },
    },
    // Stage 21: 黄药师 (Lv 21 · docs/13 完整数值 HP 45000, ATK 1650)
    {
      name: '第21关-黄药师 [橙装玉笛套+郭靖黄蓉]',
      playerLevel: 21,
      realmTier: 3,
      stats: { str: 42, agi: 38, con: 40, intStat: 36 },
      gear: {
        weaponId: 'biyu_xiao',
        headId: 'snow_hood',
        armorId: 'wucan_baoyi',
        wristId: 'iron_bracers',
        beltId: 'jade_belt',
        bootsId: 'cloud_boots',
        accId: 'jiuwei_fox',
      },
      skills: {
        outerSkillId: 'luoying_shenzhang',
        innerSkillId: 'bihai_chaotiao',
        lightSkillId: 'lingbo_weibu',
        ultSkillId: 'kanglong_youhui',
        mastery: { luoying_shenzhang: 3, bihai_chaotiao: 3, lingbo_weibu: 3, kanglong_youhui: 3 },
      },
      companions: {
        leftCompanionId: 'guojing',
        rightCompanionId: 'huangrong',
      },
      stance: 'FIERCE',
      boss: {
        name: '东邪·黄药师(高难)',
        hp: 45000,
        atk: 1650,
        mp: 22000,
        stance: 'AGILE',
      },
    },
    // Stage 26: 裘千仞 (Lv 26 · docs/13 完整数值 HP 82000, ATK 2400)
    {
      name: '第26关-裘千仞 [橙装铁掌套+郭黄]',
      playerLevel: 26,
      realmTier: 3,
      stats: { str: 52, agi: 46, con: 50, intStat: 45 },
      gear: {
        weaponId: 'xuantie_heavysword',
        headId: 'snow_hood',
        armorId: 'wucan_baoyi',
        wristId: 'iron_bracers',
        beltId: 'jade_belt',
        bootsId: 'cloud_boots',
        accId: 'jiuwei_fox',
        relicId: 'wumu_yishu',
      },
      skills: {
        outerSkillId: 'tianzuo_blade',
        innerSkillId: 'jiuyang_shengong',
        lightSkillId: 'lingbo_weibu',
        ultSkillId: 'kanglong_youhui',
        mastery: { tianzuo_blade: 3, jiuyang_shengong: 3, lingbo_weibu: 3, kanglong_youhui: 3 },
      },
      companions: {
        leftCompanionId: 'guojing',
        rightCompanionId: 'huangrong',
      },
      stance: 'TAICHI',
      boss: {
        name: '铁掌水上漂·裘千仞(高难)',
        hp: 82000,
        atk: 2400,
        mp: 38000,
        stance: 'FIERCE',
      },
    },
    // Stage 30: 疯魔欧阳锋 (Lv 30 · docs/13 完整数值 HP 140000, ATK 3600)
    {
      name: '第30关-欧阳锋 [第一卷终极满配神装]',
      playerLevel: 30,
      realmTier: 3,
      stats: { str: 65, agi: 58, con: 62, intStat: 55 },
      gear: {
        weaponId: 'dagou_stick_true',
        headId: 'snow_hood',
        armorId: 'ruanwei_armor',
        wristId: 'iron_bracers',
        beltId: 'jade_belt',
        bootsId: 'cloud_boots',
        accId: 'jiuwei_fox',
        relicId: 'wumu_yishu',
      },
      skills: {
        outerSkillId: 'dagou_stick',
        innerSkillId: 'jiuyin_zonggang',
        lightSkillId: 'lingbo_weibu',
        ultSkillId: 'kanglong_youhui',
        mastery: { dagou_stick: 3, jiuyin_zonggang: 3, lingbo_weibu: 3, kanglong_youhui: 3 },
      },
      companions: {
        leftCompanionId: 'guojing',
        rightCompanionId: 'huangrong',
      },
      stance: 'TAICHI',
      boss: {
        name: '疯魔逆九阴欧阳锋(第一卷终极大Boss)',
        hp: 140000,
        atk: 3600,
        mp: 68000,
        stance: 'FIERCE',
      },
    },
    // Stage 30: 疯魔欧阳锋 [纯肉盾反伤流·输出严重不足·故意拖局]
    {
      name: '第30关-欧阳锋 [纯肉盾刮痧故意拖局]',
      playerLevel: 30,
      realmTier: 3,
      stats: { str: 20, agi: 20, con: 120, intStat: 40 },
      gear: {
        weaponId: 'qinggang_sword', // 极其低攻，故意不出伤害
        headId: 'snow_hood',
        armorId: 'ruanwei_armor',   // 依靠反伤和超高血防苟活
        wristId: 'iron_bracers',
        beltId: 'jade_belt',
        bootsId: 'cloud_boots',
        accId: 'jiuwei_fox',
        relicId: 'wumu_yishu',
      },
      skills: {
        outerSkillId: 'yuenv_jian',
        innerSkillId: 'jiuyang_shengong',
        lightSkillId: 'lingbo_weibu',
        ultSkillId: 'kanglong_youhui',
        mastery: { yuenv_jian: 1, jiuyang_shengong: 3, lingbo_weibu: 3, kanglong_youhui: 1 },
      },
      stance: 'TAICHI',
      boss: {
        name: '疯魔逆九阴欧阳锋(第一卷终极大Boss)',
        hp: 140000,
        atk: 3600,
        mp: 68000,
        stance: 'FIERCE',
      },
    },
  ]

  // Phase 1: Natural Round Count without Enrage
  console.log('--- 阶段一：在无回合限制/无狂暴下，各关卡正常自然战斗所需回合数 ---')
  console.log('| 关卡与配装形态 | 胜负 | 实际交锋回合 | 玩家剩余气血 | 首领剩余气血 |')
  console.log('| :--- | :---: | :---: | :---: | :---: |')
  for (const tc of testSuites) {
    const res = simulateCombat(tc, 999)
    console.log(`| ${tc.name.padEnd(20)} | ${res.winner === 'ALLY' ? '✅胜利' : '❌失败'} | 第 ${String(res.rounds).padStart(2)} 回合 | ${String(res.playerHpPercent).padStart(3)}% | ${String(res.bossHpPercent).padStart(3)}% |`)
  }

  // Phase 2: Testing different Enrage Round Caps
  const testEnrageCaps = [10, 12, 14, 15, 16, 18, 20]
  console.log('\n--- 阶段二：不同狂暴起始回合（Enrage Round）对标准配装通关的影响测试 ---')
  console.log('测试标准配装在各狂暴阈值下的表现：')

  for (const cap of testEnrageCaps) {
    let allStandardPassed = true
    const details: string[] = []
    for (const tc of testSuites) {
      if (tc.name.includes('未穿') || tc.name.includes('龟缩')) continue // 只看正常标准流
      const res = simulateCombat(tc, cap, 0.35)
      const passed = res.winner === 'ALLY'
      if (!passed) allStandardPassed = false
      details.push(`${tc.name.split(' ')[0]}: ${passed ? '✅通关(' + res.rounds + 'R)' : '❌超时被狂暴秒杀'}`)
    }
    console.log(`- 狂暴线 = 第 ${String(cap).padStart(2)} 回合: ${allStandardPassed ? '【全部正常通关】' : '【部分误杀标准玩家】'} -> ${details.join(' | ')}`)
  }

  // Phase 4: Tiered / Dynamic Enrage Policy Test
  console.log('\n--- 阶段四：阶梯式动态狂暴机制（根据首领血量/位阶动态定线）实测 ---')
  console.log('阶梯规则：')
  console.log('  - 前期小试牛刀（首领HP <= 10,000）：第 12 回合进入狂暴')
  console.log('  - 中期渐入佳境（首领HP 10,001 ~ 50,000）：第 16 回合进入狂暴')
  console.log('  - 后期绝巅决战（首领HP > 50,000）：第 22 回合进入狂暴')
  console.log('狂暴机制：')
  console.log('  - 触发狂暴后，首领双目赤红，攻击力每回合递增 +35%（破除闪避与格挡）')
  console.log('  - 狂暴后上限宽限 4 回合，若仍未分胜负，第 (狂暴线+4) 回合首领施展【狂血焚天】强制绝杀\n')

  console.log('| 关卡与配装形态 | 首领气血 | 狂暴线 | 实际回合 | 战斗结果 | 剩余血量 | 机制体验评价 |')
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :--- |')

  for (const tc of testSuites) {
    const bossHp = tc.boss.hp
    const dynamicEnrageRound = bossHp > 50000 ? 22 : bossHp > 10000 ? 16 : 12
    const res = simulateCombat(tc, dynamicEnrageRound, 0.35)

    let comment = ''
    if (tc.name.includes('未穿')) {
      comment = res.winner === 'ALLY' ? '侥幸过关' : '❌低配受挫，狂暴前即被击败，驱动回图刷装备'
    } else if (tc.name.includes('龟缩')) {
      comment = res.winner === 'ALLY' ? '⚠️刮痧勉强通过' : '❌纯肉无输出，被狂暴惩罚秒杀，促使换攻装'
    } else {
      if (res.rounds < dynamicEnrageRound) {
        comment = `✅正规通关（余量 ${dynamicEnrageRound - res.rounds} 回合，容错健康）`
      } else if (res.rounds === dynamicEnrageRound) {
        comment = '🔥压哨极限通关（心跳拉满）'
      } else {
        comment = '💥狂暴期爆发反杀或被终结'
      }
    }

    console.log(
      `| ${tc.name.padEnd(20)} | ${String(bossHp).padStart(6)} | 第${String(dynamicEnrageRound).padStart(2)}R | 第${String(res.rounds).padStart(2)}R | ${res.winner === 'ALLY' ? '✅获胜' : '❌落败'} | 玩家${String(res.playerHpPercent).padStart(3)}% | ${comment} |`
    )
  }
}

runEmpiricalBenchmarks()
