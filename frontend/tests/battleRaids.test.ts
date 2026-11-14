import { describe, expect, it } from 'vitest'
import type { BattleEventDTO, BattleReportDTO, LoadoutPresetDTO } from '@/network/protocol'
import {
  computeDerivedStats,
  innerPressure,
  simulateCoopRaid,
  simulatePlayerDuel,
  simulateShaoshiRaid,
  strikeDamage,
} from '../../shared/battle.ts'
import { damageAfterDefense } from '../../shared/combatMeta.ts'
import { COOP_RAIDS, ITEMS, SHAOSHI_RAID } from '../../shared/gameData.ts'
import { createStarterCharacter } from '../../shared/player.ts'
import { sectEquipmentPartId } from '../../shared/sectEquipment.ts'
import { trialPartId } from '../../shared/trialStages.ts'
import { player, loadout, effectEvents, equipped } from './battleFixtures'

describe('重阳宫三人副本', () => {
  function fighter(id: string, agi: number, str = 40) {
    return { player: { ...player, id, nickname: id, level: 28, stats: { ...player.stats, agi, str, con: 250 } }, loadout, learnedSkills: {} }
  }

  function run(rightAgi = 43, leftStr = 40) {
    return simulateCoopRaid('chongyang', 'chongyang', [fighter('队长', 10), fighter('左翼', 0, leftStr), fighter('右翼', rightAgi)], () => 0.99, {})
  }

  function allyCasts(report: BattleReportDTO, round: number) {
    return report.events.filter((event) => event.type === 'SKILL_CAST' && event.actorSlot.startsWith('ALLY') && event.round === round)
  }

  it('速度打平时仍换位，三人打实际前排并计入该阵位的招架', () => {
    expect(computeDerivedStats(fighter('右翼', 43).player, loadout, {}).speed).toBe(COOP_RAIDS.chongyang.boss.combat!.speed)
    const report = run()
    expect(report).toMatchObject({ mode: 'COOP_3P', raidId: 'chongyang', sceneTitle: '重阳宫·天罡北斗大阵' })
    expect(effectEvents(report, 'enemy_formation').slice(0, 3)).toMatchObject([
      { round: 1, targetSlot: 'ENEMY_LEFT', segments: [{ text: expect.stringContaining('王处一居前 · 招架 +20 个百分点') }] },
      { round: 2, targetSlot: 'ENEMY_MAIN', segments: [{ text: expect.stringContaining('丘处机换至前排 · 招架 +20 个百分点') }] },
      { round: 3, targetSlot: 'ENEMY_LEFT', segments: [{ text: expect.stringContaining('王处一换至前排 · 招架 +20 个百分点') }] },
    ])
    expect(allyCasts(report, 1).map(({ targetSlot }) => targetSlot)).toEqual(Array(3).fill('ENEMY_LEFT'))
    expect(allyCasts(report, 2).map(({ targetSlot }) => targetSlot)).toEqual(Array(3).fill('ENEMY_MAIN'))
    expect(allyCasts(report, 2).find((event) => event.actorSlot === 'ALLY_MAIN')?.hitResult).toBe('PARRY')
  })

  it('右翼实际速度超过两名守阵者即可抢位，招架加成当场移除', () => {
    const report = run(44)
    expect(effectEvents(report, 'enemy_formation')).toMatchObject([
      { round: 1, actorSlot: 'ALLY_RIGHT', statusRemoved: '天罡北斗阵', segments: [{ text: expect.stringContaining('右翼抢占北极星位') }] },
    ])
    expect(allyCasts(report, 1)[0]).toMatchObject({ actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN' })
    const hit = (battle: BattleReportDTO) => allyCasts(battle, 2).find((event) => event.actorSlot === 'ALLY_MAIN')!
    expect(hit(report).hitResult).toBe('HIT')
    expect(-hit(report).hpDelta!).toBeGreaterThan(-hit(run()).hpDelta!)
  })

  it('默认配装仍会遇到第一轮护阵', () => {
    const party = ([1, 2, 3] as const).map((index) => {
      const member = createStarterCharacter({ id: `starter_${index}`, nickname: `新侠客${index}`, avatarId: 'hero_sword' }, 0)
      return { player: member.player, loadout: member.presets[index], learnedSkills: member.learnedSkills }
    })
    const report = simulateCoopRaid('chongyang', 'starter_raid', [party[0], party[1], party[2]], () => 0.99, {})
    expect(effectEvents(report, 'enemy_formation')[0]).toMatchObject({ round: 1, actorSlot: 'ENEMY_LEFT', targetSlot: 'ENEMY_LEFT' })
  })

  it('一名守阵者退场时立即破阵，剩余队友改打存活的守阵者', () => {
    const report = run(0, 8_000)
    expect(effectEvents(report, 'enemy_formation')).toMatchObject([
      { round: 1, targetSlot: 'ENEMY_LEFT' },
      { round: 1, actorSlot: 'ALLY_LEFT', statusRemoved: '天罡北斗阵', segments: [{ text: expect.stringContaining('王处一退场') }] },
    ])
    expect(allyCasts(report, 1).map(({ actorSlot, targetSlot }) => [actorSlot, targetSlot])).toEqual([
      ['ALLY_MAIN', 'ENEMY_LEFT'], ['ALLY_LEFT', 'ENEMY_LEFT'], ['ALLY_RIGHT', 'ENEMY_MAIN'],
    ])
  })
})

describe('聚贤庄三人副本', () => {
  const config = COOP_RAIDS.juxian
  const hufa = 'sect_quanzhen_hufa'
  const copper = 'henglian_tongjia'
  const lockGear = equipped(copper, ['WEAPON', 'HEAD', 'ARMOR', 'WRIST'])

  function fighter(id: string, patch: Partial<LoadoutPresetDTO> = {}, stats: Partial<typeof player.stats> = {}) {
    return {
      player: { ...player, id, nickname: id, level: 28, stats: { ...player.stats, str: 40, con: 250, ...stats } },
      loadout: { ...loadout, ...patch }, learnedSkills: {},
    }
  }

  function run(...party: Parameters<typeof simulateCoopRaid>[2]) {
    return simulateCoopRaid('juxian', 'juxian', party, () => 0.99, { at: 0 })
  }

  it('五波按回合换敌，战报逐人列出实际气血、内力、怒气、护盾、异常和保命', () => {
    const leader = fighter('队长', { ultSkillId: 'yiyang_zhi' })
    const left = fighter('左翼', {
      ultSkillId: 'yiyang_zhi', weaponId: sectEquipmentPartId(hufa, 'WEAPON'), headId: sectEquipmentPartId(hufa, 'HEAD'),
      armorId: sectEquipmentPartId(hufa, 'ARMOR'), accId: sectEquipmentPartId(hufa, 'ACC'),
    })
    left.player = { ...left.player, currentSectId: 'quanzhen', sectRank: 4 }
    const report = run(leader, left, fighter('右翼', lockGear))
    const waves = effectEvents(report, 'raid_wave')
    expect(report).toMatchObject({ raidId: 'juxian', winner: 'ALLY', survivedRounds: 15 })
    expect(report.units.find(({ slot }) => slot === 'ENEMY_MAIN')?.name).toBe('游骥')
    expect(waves.map(({ round, opponentEntry }) => [round, opponentEntry?.unit.name])).toEqual([
      [1, undefined], [4, '玄难'], [7, '奚长老'], [10, '白世镜'], [13, '玄难'],
    ])
    expect(waves[1].opponentEntry).toMatchObject({ unit: { id: 'ENEMY_MAIN_2' }, guards: [{ name: '玄寂' }] })
    expect(waves[4].opponentEntry?.unit.id).toBe('ENEMY_MAIN_5')
    const beforeWave = report.events.filter(({ round }) => round < 4)
    const participants = report.units.filter(({ isPlayer }) => isPlayer)
    for (const [index, unit] of participants.entries()) {
      const state = { hp: unit.hp, mp: unit.maxMp, rage: unit.rage, shield: 0 }
      for (const event of beforeWave) {
        if (event.targetSlot === unit.slot) {
          state.hp = Math.max(0, Math.min(unit.maxHp, state.hp + (event.hpDelta ?? 0)))
          state.shield += event.shieldDelta ?? 0
        }
        if (event.actorSlot === unit.slot) {
          state.hp += event.reflectDelta ?? 0
          state.mp = Math.max(0, Math.min(unit.maxMp, state.mp + (event.mpDelta ?? 0)))
        }
        if ((event.rageTargetSlot ?? event.actorSlot) === unit.slot) state.rage = Math.max(0, Math.min(100, state.rage + (event.rageDelta ?? 0)))
      }
      expect(waves[1].segments[index + 1]).toMatchObject({
        text: expect.stringContaining(`${unit.name} · 气血 ${state.hp.toLocaleString()} · 内力 ${state.mp.toLocaleString()} · 怒气 ${state.rage} · 护盾 ${state.shield.toLocaleString()} · 剩余保命 ${unit.slot === 'ALLY_RIGHT' ? 1 : 0} 次`),
      })
      if (unit.slot === 'ALLY_LEFT') expect(state.shield).toBeGreaterThan(0)
      if (unit.slot === 'ALLY_MAIN') expect(state.mp).toBeLessThan(unit.maxMp)
    }
    expect(waves[1].segments[1]).toMatchObject({ text: expect.stringContaining('阴寒迟缓 2 回合') })
    expect(waves[1].segments[2]).toMatchObject({ text: expect.stringContaining('流血 1 回合') })
    const bleed = (round: number) => report.events.find((event) => event.round === round && event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_LEFT')
    expect(bleed(4)).toMatchObject({ effectSourceId: bleed(3)!.effectSourceId, hpDelta: bleed(3)!.hpDelta, statusRemoved: '流血' })
    expect(report.events.find((event) => event.round === 4 && event.actorSlot.startsWith('ENEMY') && event.targetSlot === 'ALLY_LEFT' && event.type === 'SKILL_CAST'))
      .toMatchObject({ shieldAbsorbed: expect.any(Number), hpDelta: 0 })
  })

  it('跨波流血继续跳伤，保命各消耗一次，旧敌造成的流血不会反震新敌', () => {
    const { boss, guards } = config
    config.boss = { ...boss, hp: 10_000_000, atk: 0,
      combat: { periodicOnHit: { status: 'bleed', rounds: 2, maxHpPercent: 120, firstRound: 3 } } }
    config.guards = []
    try {
      const report = run(fighter('队长'), fighter('左翼'), fighter('右翼', { ...lockGear, accId: 'jiuwei_fox' }))
      const saves = report.events.filter((event) => event.actorSlot === 'ALLY_RIGHT' &&
        event.segments.some((segment) => segment.type === 'tag' && segment.text.endsWith(' · 免死')))
      expect(saves.map(({ round, effectSourceId }) => [round, effectSourceId])).toEqual([[3, 'jiuwei_fox'], [4, copper]])
      expect(effectEvents(report, 'raid_wave')[1].segments[3]).toMatchObject({ text: expect.stringContaining('剩余保命 1 次 · 异常与增益 流血 1 回合、灵狐遁逃 1 回合') })
      expect(effectEvents(report, 'raid_wave')[2].segments[3]).toMatchObject({ text: expect.stringContaining('剩余保命 0 次') })
      expect(effectEvents(report, copper).some((event) => event.round === 4 && event.targetSlot?.startsWith('ENEMY'))).toBe(false)
    } finally {
      config.boss = boss
      config.guards = guards
    }
  })

  it('每波提前清场后仍等到第 15 回合结算', () => {
    const strong = (id: string) => fighter(id, {}, { str: 4_000, con: 900 })
    const report = run(strong('队长'), strong('左翼'), strong('右翼'))
    expect(effectEvents(report, 'raid_wave').map(({ round }) => round)).toEqual([1, 4, 7, 10, 13])
    expect(report.events.filter(({ type }) => type === 'SKILL_CAST').map(({ round }) => round)).toEqual([1, 1, 4, 4, 7, 7, 10, 10, 13, 13])
    expect(report.events.at(-1)).toMatchObject({ round: 15, effectSourceId: 'raid_survival', segments: [{ text: expect.stringContaining('撑满 15 回合') }] })
    expect(report).toMatchObject({ winner: 'ALLY', survivedRounds: 15 })
  })

  it('只剩右翼时仍可通关，全灭时停止换波', () => {
    const weak = (id: string) => {
      const member = fighter(id, {}, { str: 1, con: 0 })
      member.player.level = 1
      return member
    }
    const won = run(weak('队长'), weak('左翼'), fighter('右翼', {}, { con: 900 }))
    expect(won).toMatchObject({ winner: 'ALLY', survivedRounds: 15 })
    expect(won.events.at(-1)?.segments).toMatchObject([{ text: expect.stringContaining('1 人存活') }])
    const lost = run(weak('队长'), weak('左翼'), weak('右翼'))
    expect(lost).toMatchObject({ winner: 'ENEMY', survivedRounds: expect.any(Number) })
    expect(lost.survivedRounds).toBeLessThan(15)
    expect(effectEvents(lost, 'raid_wave')).toHaveLength(1)
    expect(lost.events.at(-1)?.segments).toMatchObject([{ text: expect.stringContaining('全队倒下') }])
  })

  it('第 15 回合的合围打完才判胜，全队倒下仍判负', () => {
    const survival = config.survival!
    const last = survival.nextWaves.at(-1)!
    config.survival = {
      ...survival,
      nextWaves: [...survival.nextWaves.slice(0, -1), {
        ...last, boss: { ...last.boss, hp: 10_000_000, atk: 1_000_000, stance: 'FIERCE' }, guards: [],
      }],
    }
    try {
      const sturdy = (id: string) => fighter(id, {}, { con: 900 })
      const report = run(sturdy('队长'), sturdy('左翼'), sturdy('右翼'))
      const finalHits = report.events.filter((event) => event.round === 15 && event.type === 'SKILL_CAST' && event.skillName === '群豪合围')
      expect(finalHits.length).toBeGreaterThan(0)
      expect(finalHits.every((event) => (event.hpDelta ?? 0) < 0)).toBe(true)
      expect(report).toMatchObject({ winner: 'ENEMY', survivedRounds: 14 })
      expect(report.events.at(-1)).toMatchObject({ round: 15, segments: [{ text: '全队倒下 · 撑过 14 / 15 回合' }] })
    } finally {
      config.survival = survival
    }
  })
})

describe('双方配装的切磋与劫镖', () => {
  const fighter = (id: string, patch: Partial<LoadoutPresetDTO> = {}, stats: Partial<typeof player.stats> = {}, learnedSkills: Record<string, number> = {}) => ({
    player: { ...player, id, nickname: id, stats: { ...player.stats, con: 75, ...stats } }, loadout: { ...loadout, ...patch }, learnedSkills,
  })
  const duel = (lineup: Parameters<typeof simulatePlayerDuel>[0]['lineup'], options: Partial<Parameters<typeof simulatePlayerDuel>[0]> = {}) =>
    simulatePlayerDuel({ battleId: 'duel', sceneTitle: '试招', mode: 'PVP_HUASHAN', lineup, environment: {}, rng: () => 0.73, ...options })
  const cast = (report: BattleReportDTO, slot: 'ALLY_MAIN' | 'ENEMY_MAIN') =>
    report.events.find((event) => event.round === 1 && event.type === 'SKILL_CAST' && event.actorSlot === slot)!

  it('左右各按自己的兵刃、架势、武学重数与护体防御结算', () => {
    const attacker = fighter('攻', { stance: 'AGILE', outerSkillId: 'luoying_zhang', weaponId: 'qinggang_sword' }, { agi: 15 })
    const defender = fighter('守', { stance: 'TAICHI', outerSkillId: 'quanzhen_jianfa', weaponId: 'xuantie_dagger' }, {}, { quanzhen_jianfa: 3 })
    const report = duel([attacker, defender])
    const baseline = duel([attacker, { ...defender, learnedSkills: { quanzhen_jianfa: 1 } }])
    expect(report.units.map((unit) => [unit.slot, unit.name, unit.weaponName, unit.isPlayer])).toEqual([
      ['ALLY_MAIN', '攻', ITEMS.qinggang_sword.name, true], ['ENEMY_MAIN', '守', ITEMS.xuantie_dagger.name, true],
    ])
    expect(report.stanceBanner).toMatchObject({ allyStance: 'AGILE', enemyStance: 'TAICHI', advantage: 'ALLY' })
    expect(cast(report, 'ALLY_MAIN')).toMatchObject({ skillId: 'luoying_zhang', targetSlot: 'ENEMY_MAIN' })
    expect(cast(report, 'ENEMY_MAIN')).toMatchObject({ skillId: 'quanzhen_jianfa', targetSlot: 'ALLY_MAIN' })
    expect(cast(report, 'ENEMY_MAIN').hpDelta).toBeLessThan(cast(baseline, 'ENEMY_MAIN').hpDelta!)
  })

  it('盾后实扣、软猬反伤、毒伤与保命都跟随实际承伤方', () => {
    const shield = equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])
    const attacker = fighter('攻', { outerSkillId: 'jiuyin_baiguzhua', accId: 'jiuwei_fox' }, { str: 200, agi: 10, con: 35 })
    const defender = fighter('守', { ...shield, armorId: 'ruanwei_armor' }, { str: 15 })
    const report = duel([attacker, defender])
    const first = cast(report, 'ALLY_MAIN')
    expect(first.shieldAbsorbed).toBeGreaterThan(0)
    expect(first.targetSlot).toBe('ENEMY_MAIN')
    expect(effectEvents(report, 'ruanwei_armor')).toContainEqual(expect.objectContaining({ actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN' }))
    expect(report.events.some((event) => event.type === 'DOT_TICK' && event.targetSlot === 'ALLY_MAIN')).toBe(true)
    const weak = fighter('守', { accId: 'jiuwei_fox' }, { con: 0 })
    const lethal = duel([attacker, weak])
    expect(effectEvents(lethal, 'jiuwei_fox').filter((event) => event.statusApplied)).toMatchObject([
      { targetSlot: 'ENEMY_MAIN', statusApplied: '灵狐遁逃' },
    ])
  })

  it('双方切磋只减去内力优势的附加伤害，盾全挡时气血减伤记零', () => {
    const armorId = trialPartId('kongming_wantong', 'ARMOR')
    const attacker = fighter('攻', {}, { con: 500, agi: 20, str: 200 })
    const defender = fighter('守', { armorId }, { con: 1 })
    const ownStats = computeDerivedStats(attacker.player, attacker.loadout)
    const targetStats = computeDerivedStats(defender.player, defender.loadout)
    const pressure = innerPressure(ownStats.maxMp, targetStats.maxMp)
    const damage = (factor: number) => Math.round(damageAfterDefense(strikeDamage(ownStats.atk, 1, 1, factor, false, 1), targetStats.def, attacker.player.level))
    const actual = damage(1 + (pressure - 1) * 0.8)
    const hit = cast(duel([attacker, defender]), 'ALLY_MAIN')
    expect(hit.hpDelta).toBe(-actual)
    expect(hit.segments).toContainEqual({ type: 'tag', text: `粗葛补丁道人袍 · 内力压制 · 盾后减伤 ${damage(pressure) - actual}`, tone: 'jade' })

    const shielding = fighter('守', { ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']), armorId }, { con: 75 })
    const shielded = cast(duel([{ ...attacker, player: { ...attacker.player, stats: { ...attacker.player.stats, str: 10 } } }, shielding]), 'ALLY_MAIN')
    expect(shielded.hpDelta).toBe(0)
    expect(shielded.shieldAbsorbed).toBeGreaterThan(0)
    expect(shielded.segments).toContainEqual({ type: 'tag', text: '粗葛补丁道人袍 · 内力压制 · 盾后减伤 0', tone: 'jade' })
  })

  it('双方都触发抢先时按出手速度排序', () => {
    const bow = fighter('角弓', { weaponId: trialPartId('damo_qibing', 'WEAPON') }, { agi: 0 })
    const faster = fighter('快手', { weaponId: 'tiebai_bow' }, { agi: 30 })
    const first = duel([bow, faster], { rng: () => 0.14 }).events.find((event) => event.type === 'SKILL_CAST')!
    expect(first).toMatchObject({ round: 1, actorSlot: 'ENEMY_MAIN' })
  })

  it('横练反震造成致死时，出手方可以消耗自己的保命次数', () => {
    const copper = equipped('henglian_tongjia', ['HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC'])
    const attacker = fighter('攻', { accId: 'jiuwei_fox' }, { str: 12_000, con: 0, agi: 200 })
    const defender = fighter('守', copper, { str: 0, con: 200 })
    const report = duel([attacker, defender])
    expect(effectEvents(report, 'henglian_tongjia').filter((event) => event.round === 1 && event.segments.some((segment) =>
      segment.type === 'tag' && / · (免死|反震)$/.test(segment.text)))).toMatchObject([
      { actorSlot: 'ENEMY_MAIN', targetSlot: 'ENEMY_MAIN' },
      { actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN' },
    ])
    expect(effectEvents(report, 'jiuwei_fox')).toContainEqual(expect.objectContaining({
      round: 1, targetSlot: 'ALLY_MAIN', statusApplied: '灵狐遁逃', hpDelta: expect.any(Number),
    }))
    for (const unit of report.units) {
      let hp = unit.hp
      for (const event of report.events.filter((entry) => entry.targetSlot === unit.slot)) {
        hp += event.hpDelta ?? 0
        expect(hp).toBeGreaterThanOrEqual(0)
        expect(hp).toBeLessThanOrEqual(unit.maxHp)
      }
      expect(hp > 0).toBe(report.winner === (unit.slot === 'ALLY_MAIN' ? 'ALLY' : 'ENEMY'))
    }
  })

  it('擒刃挡下整次刀剑外功，保留护盾并按格挡量反震', () => {
    const attacker = fighter('攻', { weaponId: 'qinggang_sword', outerSkillId: 'quanzhen_jianfa' }, { str: 50, agi: 100 })
    const shield = equipped('quanzhen_beidou', ['HEAD', 'ARMOR', 'WRIST', 'BELT'])
    const defender = fighter('守', { ...shield, weaponId: 'tiancan_glove' })
    const report = duel([attacker, defender], { rng: () => 0 })
    const hit = cast(report, 'ALLY_MAIN')
    expect(hit).toMatchObject({ hitResult: 'PARRY', hpDelta: 0 })
    expect(hit.shieldAbsorbed).toBeUndefined()
    expect(effectEvents(report, 'tiancan_glove')).toContainEqual(expect.objectContaining({
      round: 1, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN', hpDelta: expect.any(Number),
    }))
  })

  it('兰花拂穴手命中蛤蟆蓄力时打断施放，保留对手的内力', () => {
    const gear = equipped('hama_nimai', ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'ACC'])
    const charger = fighter('蓄力', gear, { str: 0, con: 200, agi: 200 })
    const attacker = fighter('打断', { outerSkillId: 'lanhua_fuxue' }, { str: 10, con: 250 })
    const report = duel([charger, attacker])
    const charge = effectEvents(report, 'hama_nimai').find((event) => event.statusApplied === '蓄力')!
    expect(charge).toBeDefined()
    expect(effectEvents(report, 'lanhua_fuxue')).toContainEqual(expect.objectContaining({
      round: charge.round, actorSlot: 'ENEMY_MAIN', targetSlot: 'ALLY_MAIN', statusRemoved: '蓄力',
    }))
    expect(report.events.some((event) => event.actorSlot === 'ALLY_MAIN' && (event.mpDelta ?? 0) < 0)).toBe(false)
    expect(report.events.some((event) => event.skillId === 'hama_nimai_pounce')).toBe(false)
  })

  it('双方镜像协战读取各自伙伴，太湖水令只增加镖战穿戴者的攻击', () => {
    const attacker = fighter('攻', { leftCompanionId: 'zhebie', accId: trialPartId('taihu_shuizhai', 'ACC') }, { agi: 20 })
    const defender = fighter('守', { leftCompanionId: 'liuchuxuan' })
    const normal = duel([attacker, defender])
    const escort = duel([attacker, defender], { mode: 'PVP_AMBUSH', escort: true })
    expect(normal.units.map((unit) => [unit.slot, unit.id])).toEqual([
      ['ALLY_MAIN', '攻'], ['ALLY_LEFT', 'zhebie'], ['ENEMY_MAIN', '守'], ['ENEMY_LEFT', 'liuchuxuan'],
    ])
    expect(escort.events).toContainEqual(expect.objectContaining({ actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', type: 'ASSIST_ATTACK' }))
    expect(escort.events).toContainEqual(expect.objectContaining({ actorSlot: 'ENEMY_LEFT', targetSlot: 'ALLY_LEFT', type: 'ASSIST_ATTACK' }))
    expect(cast(escort, 'ALLY_MAIN').hpDelta).toBeLessThan(cast(normal, 'ALLY_MAIN').hpDelta!)
    expect(cast(escort, 'ENEMY_MAIN').hpDelta).toBe(cast(normal, 'ENEMY_MAIN').hpDelta)
  })

  it.each(['PVP_HUASHAN', 'PVP_AMBUSH'] as const)('%s 第 15 轮双方狂暴，第 19 轮强制分胜负', (mode) => {
    const sturdy = { str: 0, con: 700 }
    const report = duel([fighter('攻', {}, sturdy), fighter('守', {}, sturdy)], { mode })
    expect(report.events.filter((event) => event.type === 'BOSS_ENRAGE').map(({ round, actorSlot }) => [round, actorSlot]))
      .toEqual([[15, 'ALLY_MAIN'], [15, 'ENEMY_MAIN']])
    expect(report.events.at(-1)).toMatchObject({ round: 19, type: 'SKILL_CAST', hitResult: 'HIT' })
    expect(report.events.filter((event) => event.round >= 15 && event.type === 'DODGE')).toEqual([])
    expect(report.events.every((event) => event.silverDrop === undefined && event.qiDrop === undefined)).toBe(true)
    const finish = report.events.at(-1)!
    const fallen = report.units.find((unit) => unit.slot === finish.targetSlot)!
    expect(report.events.reduce((hp, event) => hp + (event.targetSlot === fallen.slot ? event.hpDelta ?? 0 : 0), fallen.hp)).toBe(0)
  })

  it('近战打左翼前排，连珠神箭打右翼，前排倒下后再打主将', () => {
    const attacker = fighter('攻', { outerSkillId: 'taizu_changquan', stance: 'FIERCE' }, { str: 720, agi: 125 })
    const defender = fighter('守', { leftCompanionId: 'liuchuxuan', rightCompanionId: 'sunbuer', stance: 'FIERCE' }, { con: 250 })
    const report = duel([attacker, defender])
    const front = report.units.find((unit) => unit.slot === 'ENEMY_LEFT')!
    expect(cast(report, 'ALLY_MAIN')).toMatchObject({ targetSlot: 'ENEMY_LEFT', hpDelta: -front.hp })
    expect(report.events.some((event) => event.actorSlot === 'ENEMY_LEFT' && event.type === 'ASSIST_ATTACK')).toBe(false)
    expect(report.events).toContainEqual(expect.objectContaining({ round: 2, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', type: 'SKILL_CAST' }))

    const bow = duel([{ ...attacker, loadout: { ...attacker.loadout, outerSkillId: 'lianzhu_shenjian' } }, defender])
    expect(cast(bow, 'ALLY_MAIN').targetSlot).toBe('ENEMY_RIGHT')
  })

  it('一招碧海潮生分别结算三个目标的盾与乱心，怒气内力各扣一次', () => {
    const attacker = fighter('攻', { ultSkillId: 'bihai_chaosheng' }, { agi: 200, con: 200 })
    const defender = fighter('守', { ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']),
      leftCompanionId: 'liuchuxuan', rightCompanionId: 'sunbuer' }, { con: 450 })
    const report = duel([attacker, defender])
    const casts = report.events.filter((event) => event.actorSlot === 'ALLY_MAIN' && event.skillId === 'bihai_chaosheng')
    const first = casts[0]
    const wave = casts.filter((event) => event.round === first.round)
    expect(wave.map((event) => event.targetSlot)).toEqual(['ENEMY_RIGHT', 'ENEMY_MAIN', 'ENEMY_LEFT'])
    expect(wave.every((event) => (event.shieldAbsorbed ?? 0) > 0)).toBe(true)
    expect(wave.filter((event) => event.mpDelta !== undefined)).toHaveLength(1)
    expect(wave.filter((event) => event.rageDelta !== undefined)).toHaveLength(1)
    expect(effectEvents(report, 'bihai_chaosheng').filter((event) => event.round === first.round && event.statusApplied === '心神混乱')
      .map((event) => event.targetSlot)).toEqual(['ENEMY_RIGHT', 'ENEMY_MAIN', 'ENEMY_LEFT'])
  })

  it('右翼按盾后伤害代承，盾全吸收时保留气血和援护机会', () => {
    const attacker = fighter('攻', {}, { agi: 120 })
    const defender = fighter('守', { rightCompanionId: 'huangrong' }, { con: 50 })
    const firstHit = (report: BattleReportDTO) => report.events.find((event) => event.round === 2 && event.actorSlot === 'ALLY_MAIN' &&
      event.targetSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')!
    const ordinary = duel([attacker, { ...defender, loadout: { ...defender.loadout, rightCompanionId: null } }])
    const guarded = duel([attacker, defender])
    const cover = guarded.events.find((event) => event.round === 2 && event.targetSlot === 'ENEMY_RIGHT' &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('代承')))
    expect(cover?.hpDelta).toBe(Math.round(firstHit(ordinary).hpDelta! * 0.52))
    expect(firstHit(guarded).hpDelta! + cover!.hpDelta!).toBe(firstHit(ordinary).hpDelta)

    const shield = equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC'])
    const shielded = duel([attacker, { ...defender, loadout: { ...defender.loadout, ...shield } }])
    expect(firstHit(shielded)).toMatchObject({ hpDelta: 0, shieldAbsorbed: expect.any(Number) })
    expect(shielded.events.some((event) => event.round === 2 && event.targetSlot === 'ENEMY_RIGHT' &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('代承')))).toBe(false)
  })

  it('父女同心让实际濒死的左翼保留气血，右翼使用自己的保命', () => {
    const attacker = fighter('攻', {}, { agi: 300, str: 800 })
    const defender = fighter('守', { leftCompanionId: 'munianci', rightCompanionId: 'yangtiexin',
      companionEquipment: { yangtiexin: { ACC: 'jiuwei_fox' } } }, { con: 300 })
    const report = duel([attacker, defender])
    expect(cast(report, 'ALLY_MAIN')).toMatchObject({ targetSlot: 'ENEMY_LEFT', hpDelta: 0 })
    expect(effectEvents(report, 'fu_nv_tong_xin')).toMatchObject([{ round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_RIGHT' }])
    expect(effectEvents(report, 'jiuwei_fox').some((event) => event.targetSlot === 'ENEMY_RIGHT' && event.statusApplied === '灵狐遁逃')).toBe(true)
  })

  it('华山刚猛外功提高封顶后的暴击率并绕盾，绝技仍扣盾', () => {
    const attacker = fighter('攻', { ultSkillId: 'yiyang_zhi', stance: 'FIERCE', weaponId: 'qinggang_sword' }, { agi: 130, con: 300 })
    const defender = fighter('守', { ...equipped('quanzhen_beidou', ['HEAD', 'WRIST', 'BELT', 'ACC']), stance: 'AGILE' }, { con: 450 })
    const report = duel([attacker, defender], { huashan: true })
    const outer = cast(report, 'ALLY_MAIN')
    expect(outer.hpDelta).toBeLessThan(0)
    expect(outer.shieldDelta).toBeUndefined()
    expect(outer.segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringMatching(/^刚猛强攻 · 外功绕盾 \d+/) }))
    expect(outer.segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringContaining('刚猛强攻 · 暴击率 +25 个百分点') }))
    expect(outer.segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringContaining('架势克制伤害 +30%') }))
    const castUlt = report.events.find((event) => event.isUlt && event.actorSlot === 'ALLY_MAIN')!
    expect(castUlt.shieldAbsorbed).toBeGreaterThan(0)
    expect(castUlt.segments.some((segment) => segment.type === 'tag' && segment.text.startsWith('刚猛强攻'))).toBe(false)
  })

  it('华山奇门首轮提速，首次命中对实际目标封招一回合', () => {
    const agile = fighter('奇门', { stance: 'AGILE' }, { agi: 0, con: 280 })
    const foe = fighter('太极', { stance: 'TAICHI', ultSkillId: 'yiyang_zhi' }, { agi: 5, con: 280 })
    const first = (report: BattleReportDTO) => report.events.find((event) => event.type === 'SKILL_CAST' || event.type === 'DODGE')
    expect(first(duel([agile, foe]))?.actorSlot).toBe('ENEMY_MAIN')
    const report = duel([agile, foe], { huashan: true })
    expect(first(report)?.actorSlot).toBe('ALLY_MAIN')
    expect(effectEvents(report, 'huashan_agile').filter((event) => event.statusApplied)).toMatchObject([
      { round: 1, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', statusApplied: '封招', statusRounds: 1 },
    ])
    expect(report.events.find((event) => event.round === 2 && event.type === 'SKILL_CAST')?.actorSlot).toBe('ENEMY_MAIN')
  })

  it('华山太极招架并反弹刚猛来袭实扣的四成，九阳只结算一次近战反伤', () => {
    const attacker = fighter('攻', { stance: 'FIERCE' }, { agi: 40, con: 200 })
    const defender = fighter('守', { stance: 'TAICHI' }, { con: 200 })
    const report = duel([attacker, defender], { huashan: true })
    const blow = cast(report, 'ALLY_MAIN')
    expect(blow.hitResult).toBe('PARRY')
    expect(effectEvents(report, 'huashan_taichi')).toContainEqual(expect.objectContaining({ round: 1, actorSlot: 'ENEMY_MAIN',
      targetSlot: 'ALLY_MAIN', hpDelta: Math.round(blow.hpDelta! * 0.4) }))
    const jiuyang = duel([attacker, { ...defender, loadout: { ...defender.loadout, innerSkillId: 'jiuyang_shengong' } }], { huashan: true })
    expect(effectEvents(jiuyang, 'huashan_taichi').some((event) => event.targetSlot === 'ALLY_MAIN')).toBe(false)
    expect(effectEvents(jiuyang, 'jiuyang_shengong').some((event) => event.targetSlot === 'ALLY_MAIN' && (event.hpDelta ?? 0) < 0)).toBe(true)
  })

  it('北斗单体均摊按各自盾值，前排阵亡后解阵', () => {
    const attacker = fighter('攻', {}, { agi: 200, str: 2_100, con: 1_200 })
    const defender = fighter('守', { ...equipped('quanzhen_beidou', ['HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC']),
      leftCompanionId: 'liuchuxuan', rightCompanionId: 'sunbuer' }, { con: 1_300 })
    const report = duel([attacker, defender])
    expect(cast(report, 'ALLY_MAIN').segments).toContainEqual(expect.objectContaining({ type: 'tag', text: expect.stringContaining('三人均摊') }))
    expect(effectEvents(report, 'quanzhen_beidou').filter((event) => event.round === 1 && event.actorSlot === 'ALLY_MAIN' && event.shieldAbsorbed)
      .map((event) => event.targetSlot)).toEqual(['ENEMY_MAIN', 'ENEMY_RIGHT'])
    const left = report.units.find((unit) => unit.slot === 'ENEMY_LEFT')!
    let hp = left.hp
    const defeat = report.events.find((event) => {
      if (event.targetSlot === left.slot) hp += event.hpDelta ?? 0
      return hp === 0
    })
    expect(defeat).toBeDefined()
    expect(report.events.slice(report.events.indexOf(defeat!) + 1).some((event) => event.actorSlot === 'ALLY_MAIN' &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('三人均摊')))).toBe(false)
  })

  it('射雕三绝在双方阵位战斗中每轮共掷一次，并按实际出手者追加免耗外功', () => {
    const attacker = fighter('攻', { leftCompanionId: 'hongqigong', rightCompanionId: 'zhoubotong' }, { con: 250 })
    const defender = fighter('守', {}, { con: 1_200 })
    const report = duel([attacker, defender], { rng: () => 0.2 })
    const added = effectEvents(report, 'she_diao_san_jue').filter((event) => event.round === 1 && event.skillId)
    expect(added.map((event) => event.actorSlot).sort()).toEqual(['ALLY_LEFT', 'ALLY_MAIN', 'ALLY_RIGHT'])
    expect(added.every((event) => event.targetSlot === 'ENEMY_MAIN' && event.rageDelta === undefined && event.mpDelta === undefined)).toBe(true)
    const skipped = duel([attacker, defender], { rng: () => 0.35 })
    expect(effectEvents(skipped, 'she_diao_san_jue')).toHaveLength(0)
  })

  it('东邪西毒在双方阵位战斗中将内伤和蛇毒叠在实际前排', () => {
    const attacker = fighter('攻', { leftCompanionId: 'ouyangfeng', rightCompanionId: 'huangyaoshi' }, { con: 250, str: 0 })
    const defender = fighter('守', { leftCompanionId: 'wangchongyang', rightCompanionId: 'mayu' }, { con: 1_200, str: 0 })
    const report = duel([attacker, defender], { rng: () => 0.73 })
    const combo = effectEvents(report, 'dong_xi')
    expect(combo.filter((event) => event.round === 1 && event.statusApplied).map(({ actorSlot, targetSlot, statusStacks }) =>
      [actorSlot, targetSlot, statusStacks])).toEqual([['ALLY_RIGHT', 'ENEMY_LEFT', 1], ['ALLY_LEFT', 'ENEMY_LEFT', 1]])
    expect(combo.some((event) => event.round === 3 && event.targetSlot === 'ENEMY_LEFT' &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text === '东邪西毒 · 引爆') && (event.hpDelta ?? 0) < 0)).toBe(true)
  })
})

describe('少室山三渡出招', () => {
  const member = (id: string, patch: Partial<LoadoutPresetDTO> = {}, con = 450, agi = 0) => ({
    player: { ...player, id, stats: { ...player.stats, con, agi } }, loadout: { ...loadout, ...patch }, learnedSkills: {},
  })
  const run = (lineup: Parameters<typeof simulateShaoshiRaid>[1]) => simulateShaoshiRaid('shaoshi-three-monks', lineup, () => 0.99, {})
  const front = SHAOSHI_RAID.guards[0].combat.rageMove.id
  const rear = SHAOSHI_RAID.guards[1].combat.rageMove.id
  const wave = SHAOSHI_RAID.boss.combat.charge.name
  const waveHits = (report: BattleReportDTO) => report.events.filter((event) => event.skillName === wave && event.actorSlot === 'ENEMY_MAIN')
  const beidou = equipped('quanzhen_beidou', ['HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC'])

  it.each([
    [450, 450, 'ALLY_LEFT', 'ALLY_RIGHT'],
    [0, 450, 'ALLY_MAIN', 'ALLY_RIGHT'],
    [450, 0, 'ALLY_LEFT', 'ALLY_LEFT'],
  ] as const)('两侧黑索按实际存活前后排选敌，左翼根骨 %i，右翼根骨 %i', (leftCon, rightCon, frontSlot, rearSlot) => {
    const report = run([member('lead'), member('left', {}, leftCon), member('right', {}, rightCon)])
    expect(report.events.filter((event) => event.round === 4 && (event.skillId === front || event.skillId === rear))).toMatchObject([
      { actorSlot: 'ENEMY_LEFT', skillId: front, targetSlot: frontSlot, isUlt: true },
      { actorSlot: 'ENEMY_RIGHT', skillId: rear, targetSlot: rearSlot, isUlt: true },
    ])
    if (rightCon === 0) expect(waveHits(report).map((event) => event.targetSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT'])
  })

  it('渡厄第五轮蓄力，第六轮逐人扣盾，范围招沿用独立防护并跳过均摊', () => {
    const report = run([member('lead', beidou, 450, 60), member('left', { armorId: 'ruanwei_armor' }), member('right')])
    expect(report.events).toContainEqual(expect.objectContaining({ round: 1, targetSlot: 'ENEMY_MAIN', shieldDelta: 1200 }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 5, actorSlot: 'ENEMY_MAIN', statusApplied: '蓄力' }))
    const hits = waveHits(report)
    expect(hits).toMatchObject(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'].map((targetSlot) => ({ round: 6, type: 'SKILL_CAST', targetSlot, hpDelta: 0 })))
    expect(hits.every((hit) => (hit.shieldAbsorbed ?? 0) > 0)).toBe(true)
    expect(new Set(hits.map((hit) => hit.shieldAbsorbed)).size).toBeGreaterThan(1)
    expect(hits.every((hit) => !hit.segments.some((segment) => segment.type === 'tag' && segment.text.includes('三人均摊')))).toBe(true)
    expect(report.events.some((event) => event.actorSlot === 'ENEMY_RIGHT' && event.skillId === rear &&
      event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('三人均摊')))).toBe(true)
    expect(report.events.filter((event) => event.type === 'BOSS_ENRAGE').map((event) => event.round)).toEqual([22])
    const finishing = report.events.find((event) => event.round === 26 && event.actorSlot?.startsWith('ENEMY') && (event.hpDelta ?? 0) < 0)!
    const receiver = report.units.find((unit) => unit.slot === finishing.targetSlot)!
    const remaining = report.events.slice(0, report.events.indexOf(finishing)).reduce((hp, event) =>
      event.targetSlot === receiver.slot ? hp + (event.hpDelta ?? 0) : hp, receiver.hp)
    expect(finishing.hpDelta).toBe(-remaining)
    expect(report.winner).toBe('ENEMY')
  })

  it('实际太极队员化解自己的黑索，岳武穆遗书减免其他队员的范围伤害', () => {
    const scenario = (stance: LoadoutPresetDTO['stance']) => run([
      member('lead', beidou, 450, 60), member('left', { armorId: 'ruanwei_armor' }), member('right', { stance, relicBookId: 'wumu_yishu' }),
    ])
    const before = waveHits(scenario('FIERCE')).find((event) => event.targetSlot === 'ALLY_LEFT')!
    const defended = scenario('TAICHI')
    const hits = waveHits(defended)
    expect(hits.map((event) => event.targetSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT'])
    expect(effectEvents(defended, 'taichi_deflect')).toContainEqual(expect.objectContaining({ round: 6, actorSlot: 'ALLY_RIGHT', targetSlot: 'ENEMY_MAIN' }))
    const hit = hits.find((event) => event.targetSlot === 'ALLY_LEFT')!
    const reduction = Math.round(before.shieldAbsorbed! * 0.4)
    expect(hit.shieldAbsorbed).toBe(before.shieldAbsorbed! - reduction)
    expect(hit.segments).toContainEqual({ type: 'tag', text: `岳武穆遗书 · 范围减伤 ${reduction}`, tone: 'jade' })
  })

  it('渡厄只按被命中者的当前内力判压制，念珠减伤跟随实际穿戴者', () => {
    const wristId = trialPartId('fahua_zuyi', 'WRIST')
    const report = run([member('lead', {}, 175), member('left', { wristId }, 175), member('right', {}, 450)])
    const hits = waveHits(report)
    expect(hits.map((event) => event.targetSlot)).toEqual(['ALLY_MAIN', 'ALLY_LEFT', 'ALLY_RIGHT'])
    const tag = (event: BattleEventDTO, text: string) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes(text))
    expect(hits.filter((event) => tag(event, '念珠手串 · 内力压制')).map((event) => event.targetSlot)).toEqual(['ALLY_LEFT'])
    expect(tag(hits[0], '内力优势')).toBe(true)
    expect(tag(hits[2], '内力优势')).toBe(false)
    expect(hits[1].hpDelta).toBeGreaterThan(hits[0].hpDelta!)
  })

  it('兰花拂穴手在黑索未破时也会优先命中蓄力的渡厄', () => {
    const report = run([member('lead'), member('left', { outerSkillId: 'lanhua_fuxue' }), member('right')])
    expect(report.events).toContainEqual(expect.objectContaining({ round: 5, actorSlot: 'ENEMY_MAIN', statusApplied: '蓄力' }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 6, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', type: 'SKILL_CAST' }))
    expect(report.events).toContainEqual(expect.objectContaining({ round: 6, actorSlot: 'ALLY_LEFT', targetSlot: 'ENEMY_MAIN', skillId: 'lanhua_fuxue' }))
    expect(effectEvents(report, 'lanhua_fuxue')).toContainEqual(expect.objectContaining({ round: 6, targetSlot: 'ENEMY_MAIN', statusRemoved: '蓄力' }))
    expect(waveHits(report)).toEqual([])
    expect(report.events.some((event) => event.round === 7 && event.actorSlot === 'ENEMY_MAIN' && event.type === 'SKILL_CAST')).toBe(true)
  })

  it('一阳指命中时打断渡厄，照常扣本次绝技怒气和内力', () => {
    const report = run([member('lead'), member('left', { ultSkillId: 'yiyang_zhi', innerSkillId: 'nizhuan_jingmai' }), member('right')])
    const cast = report.events.find((event) => event.round === 6 && event.actorSlot === 'ALLY_LEFT' && event.skillId === 'yiyang_zhi')
    expect(cast).toMatchObject({ targetSlot: 'ENEMY_MAIN', rageDelta: -85 })
    expect(cast?.mpDelta).toBeLessThan(0)
    expect(effectEvents(report, 'yiyang_zhi')).toContainEqual(expect.objectContaining({ round: 6, targetSlot: 'ENEMY_MAIN', statusRemoved: '蓄力' }))
    expect(waveHits(report)).toEqual([])
  })
})
