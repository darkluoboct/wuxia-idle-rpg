import type { BattleEnemyGuard, BattleEnvironment, BattleOpponent, EnemyCombatConfig } from './combatMeta.ts'
import { INGOT } from './economy.ts'
import type { BattleReportDTO, CombatUnitDTO, StanceType, XiangyangGateId, XiangyangRewardDTO } from './protocol.ts'
import { trialBossAtk, trialBossHp } from './trialStages.ts'

/**
 * 襄阳守卫战（docs/20）：每周三、周日 20:00 起半个时辰，蒙古大军分攻襄阳东门、北门与水路粮道。
 * 每人每场五道军令，首次出战选定一门；按打掉的敌方气血记战功，全门战功攒够一波即击退一波，共八波。
 * 敌军按出战者的等级缩放，强弱不同的侠客都能出力。战后凭战功领赏。联机为准，本地试玩以同一份规则模拟守军。
 */
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const UTC8 = 8 * HOUR
const FIRST_MONDAY = Date.UTC(2024, 0, 1) - UTC8
/** 周三、周日 20:00（北京时间） */
const WAR_OFFSETS = [2 * DAY + 20 * HOUR, 6 * DAY + 20 * HOUR]

export const XIANGYANG_WAR_MS = 30 * MINUTE
export const XIANGYANG_ORDERS = 5
export const XIANGYANG_WAVES = 8
/** 每波所需战功 = 本门守军人数 × 30；人人五道军令都打满约可击退八波 */
export const XIANGYANG_WAVE_MERIT = 30

export interface XiangyangWar {
  id: number
  opensAt: number
  closesAt: number
  active: boolean
}

export function xiangyangWarOf(id: number): XiangyangWar {
  const opensAt = FIRST_MONDAY + Math.floor(id / 2) * WEEK + WAR_OFFSETS[id % 2]
  return { id, opensAt, closesAt: opensAt + XIANGYANG_WAR_MS, active: false }
}

/** 正在打的一场，或下一场 */
export function xiangyangWar(now: number): XiangyangWar {
  for (let id = Math.floor((now - FIRST_MONDAY) / WEEK) * 2; ; id++) {
    const war = xiangyangWarOf(id)
    if (now < war.closesAt) return { ...war, active: now >= war.opensAt }
  }
}

type Foe = Pick<BattleEnemyGuard, 'name' | 'title' | 'portrait'> & { weapon: NonNullable<NonNullable<BattleEnemyGuard['combat']>['weapon']>['form'] }

export interface XiangyangGateConfig {
  id: XiangyangGateId
  name: string
  blurb: string
  /** 敌军的架势；克制它的是 */
  stance: StanceType
  counter: StanceType
  environment?: BattleEnvironment
  mounted?: true
  heavyArmor?: true
  captain: Foe
  soldier: Foe
  general: Foe
  /** 第五波起首领会蓄力 */
  charge: string
}

export const XIANGYANG_GATES: readonly XiangyangGateConfig[] = [
  {
    id: 'EAST', name: '东门 · 铁骑冲阵', blurb: '蒙古骑兵一波接一波冲城门，马快刀沉。骑兵吃背嵬枪法与破骑的兵刃。',
    stance: 'FIERCE', counter: 'TAICHI', mounted: true,
    captain: { name: '蒙古千夫长', title: '东门冲阵', portrait: 'zhebie', weapon: 'BLADE' },
    soldier: { name: '蒙古铁骑', title: '东门冲阵', portrait: 'bandit', weapon: 'SPEAR' },
    general: { name: '怯薛万夫长', title: '大汗亲军', portrait: 'zhebie', weapon: 'BLADE' },
    charge: '铁骑践踏',
  },
  {
    id: 'NORTH', name: '北门 · 云梯攻城', blurb: '重甲步卒扛着云梯攀城，后面推着撞城锤。重甲难破，撞城锤蓄力时要打断。',
    stance: 'TAICHI', counter: 'AGILE', heavyArmor: true,
    captain: { name: '攻城百夫长', title: '北门攀城', portrait: 'bandit', weapon: 'AXE' },
    soldier: { name: '重甲步卒', title: '北门攀城', portrait: 'bandit', weapon: 'BLADE' },
    general: { name: '回回炮营统领', title: '攻城营', portrait: 'qiuqianren', weapon: 'STAFF' },
    charge: '撞城锤',
  },
  {
    id: 'WATER', name: '水路粮道 · 水军夜袭', blurb: '蒙古水军趁夜摸向汉水粮道，船上交手，水性好的占便宜。',
    stance: 'AGILE', counter: 'FIERCE', environment: { water: true, night: true },
    captain: { name: '蒙古水军百户', title: '夜袭粮道', portrait: 'bandit', weapon: 'ODD' },
    soldier: { name: '水鬼', title: '夜袭粮道', portrait: 'assassin', weapon: 'BLADE' },
    general: { name: '蒙古水军都统', title: '汉水舟师', portrait: 'wanyankang', weapon: 'SPEAR' },
    charge: '火船冲阵',
  },
]

export const XIANGYANG_GATE_BY_ID = Object.fromEntries(XIANGYANG_GATES.map((gate) => [gate.id, gate])) as Record<XiangyangGateId, XiangyangGateConfig>

export const isXiangyangGate = (value: unknown): value is XiangyangGateId =>
  typeof value === 'string' && Object.hasOwn(XIANGYANG_GATE_BY_ID, value)

/** 第 wave 波敌军（按出战者等级缩放）：一名首领、两名兵卒；第八波换作大将 */
export function xiangyangWave(gateId: XiangyangGateId, wave: number, level: number) {
  const gate = XIANGYANG_GATE_BY_ID[gateId]
  const stage = Math.min(XIANGYANG_WAVES, Math.max(1, wave))
  const scale = 0.75 + 0.1 * (stage - 1)
  const hp = trialBossHp(level) * scale
  const atk = trialBossAtk(level) * scale
  const combat = (foe: Foe): EnemyCombatConfig => ({
    faction: 'MONGOL', alignment: 'HERETIC', weapon: { form: foe.weapon, tier: stage >= 6 ? 'blue' : 'green' },
    mounted: gate.mounted, heavyArmor: gate.heavyArmor,
  })
  const leader = stage === XIANGYANG_WAVES ? gate.general : gate.captain
  const enemyMain: BattleOpponent = {
    name: leader.name, title: `${leader.title} · 第 ${stage} 波`, portrait: leader.portrait,
    hp: Math.round(hp * 0.6), atk: Math.round(atk * 0.8), mp: Math.round(hp * 0.27), stance: gate.stance, isBoss: stage === XIANGYANG_WAVES,
    combat: { ...combat(leader), ...(stage >= 5 ? { charge: { round: 3, name: gate.charge, damageMultiplier: 1.5 } } : {}) },
  }
  const soldier = (stance: StanceType): BattleEnemyGuard => ({
    name: gate.soldier.name, title: gate.soldier.title, portrait: gate.soldier.portrait, stance,
    hp: Math.round(hp * 0.25), atk: Math.round(atk * 0.5), combat: { ...combat(gate.soldier), joinsRound: true },
  })
  return {
    enemyMain,
    enemyGuards: [soldier(gate.stance), soldier(gate.counter === 'TAICHI' ? 'AGILE' : gate.counter === 'AGILE' ? 'FIERCE' : 'TAICHI')],
    environment: gate.environment,
  }
}

/** 战功：首领按 3 份、兵卒各 1 份，按打掉的气血比例折算，满额 50；打赢再加 5 */
export function xiangyangMerit(report: Pick<BattleReportDTO, 'units' | 'events' | 'winner'>) {
  const hp = new Map<CombatUnitDTO['slot'], number>(report.units.map((unit) => [unit.slot, unit.hp]))
  const maxHp = new Map(report.units.map((unit) => [unit.slot, unit.maxHp]))
  for (const { targetSlot, hpDelta } of report.events) {
    if (!targetSlot || !hpDelta || !hp.has(targetSlot)) continue
    hp.set(targetSlot, Math.max(0, Math.min(maxHp.get(targetSlot)!, hp.get(targetSlot)! + hpDelta)))
  }
  let share = 0
  for (const unit of report.units) {
    if (!unit.slot.startsWith('ENEMY') || !unit.maxHp) continue
    share += (1 - hp.get(unit.slot)! / unit.maxHp) * (unit.slot === 'ENEMY_MAIN' ? 3 : 1)
  }
  return Math.round(share * 10) + (report.winner === 'ALLY' ? 5 : 0)
}

export interface XiangyangGateState {
  /** 正在打的一波；全部击退后为 XIANGYANG_WAVES + 1 */
  wave: number
  progress: number
}

export const xiangyangWaveNeed = (defenders: number) => XIANGYANG_WAVE_MERIT * Math.max(1, defenders)

/** 记入一份战功，攒够即击退一波；返回新状态与本次击退的波次 */
export function advanceXiangyangGate(state: XiangyangGateState, merit: number, defenders: number) {
  const need = xiangyangWaveNeed(defenders)
  let { wave, progress } = state
  const repelled: number[] = []
  if (wave > XIANGYANG_WAVES) return { wave, progress: 0, repelled }
  progress += merit
  while (wave <= XIANGYANG_WAVES && progress >= need) {
    progress -= need
    repelled.push(wave)
    wave++
  }
  return { wave, progress: wave > XIANGYANG_WAVES ? 0 : progress, repelled }
}

export const xiangyangWavesCleared = (state: Pick<XiangyangGateState, 'wave'>) => Math.min(XIANGYANG_WAVES, state.wave - 1)

/** 战后封赏：参战即得元宝与铸造材料，城门击退得越多材料越多；残页落在出战时装着的外功上，本门战功前三加赏 */
export function xiangyangReward(entry: { merit: number; sorties: number }, wavesCleared: number, level: number, topThree: boolean): XiangyangRewardDTO | undefined {
  if (entry.sorties <= 0) return
  return {
    ingot: INGOT.xiangyang,
    iron: 1 + Math.floor(wavesCleared / 2) + (topThree ? 1 : 0),
    stones: 1 + Math.floor(wavesCleared / 4),
    fragments: Math.min(4, 1 + Math.floor(entry.merit / 100)) + (topThree ? 2 : 0),
    qiExp: Math.round(entry.merit * level * 0.5),
    silver: entry.merit * 4,
  }
}

export function xiangyangRewardText(reward: XiangyangRewardDTO, skillName?: string) {
  return [
    `元宝 +${reward.ingot}`, `百炼玄铁 +${reward.iron}`, `淬火石 +${reward.stones}`,
    ...(skillName ? [`《${skillName}》残页 +${reward.fragments}`] : []),
    `真气 +${reward.qiExp.toLocaleString()}`, `纹银 +${reward.silver.toLocaleString()}`,
  ].join('，')
}

// ==================== 本地试玩：模拟守军 ====================

const DEFENDER_NAMES = ['柳寒舟', '沈听雪', '顾长风', '叶孤帆', '林照影', '萧问天', '唐小棠', '温如玉', '陆无忧', '秦惊鸿', '白鹭洲', '杜若']

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export interface XiangyangSortieLog {
  at: number
  nickname: string
  gate: XiangyangGateId
  merit: number
  won: boolean
}

/** 本地试玩的同门守军：每门二到五人，各打五次，战功与出战时刻由场次与城门定死 */
export function xiangyangBotSorties(warId: number, gateId: XiangyangGateId): XiangyangSortieLog[] {
  const gateIndex = XIANGYANG_GATES.findIndex(({ id }) => id === gateId)
  const rng = seeded(warId * 97 + gateIndex * 13 + 7)
  const { opensAt } = xiangyangWarOf(warId)
  const count = 2 + Math.floor(rng() * 4)
  const names = [...DEFENDER_NAMES].sort(() => rng() - 0.5).slice(0, count)
  return names.flatMap((nickname) => Array.from({ length: XIANGYANG_ORDERS }, (_, order) => {
    const merit = 20 + Math.floor(rng() * 36)
    return { at: opensAt + Math.floor(XIANGYANG_WAR_MS * 0.95 * (order + rng()) / XIANGYANG_ORDERS), nickname, gate: gateId, merit, won: merit >= 45 }
  }))
}

/** 把本地守军与自己的出战按时间先后记入城门，得出当下的波次；守军人数与联机一样按出过战的人累计 */
export function localXiangyangGate(warId: number, gateId: XiangyangGateId, now: number, own: readonly XiangyangSortieLog[]) {
  const log = [...xiangyangBotSorties(warId, gateId).filter(({ at }) => at <= now), ...own.filter((sortie) => sortie.gate === gateId)]
    .sort((a, b) => a.at - b.at)
  const joined = new Set<string>()
  let state: XiangyangGateState = { wave: 1, progress: 0 }
  const feed: (XiangyangSortieLog & { wave: number; repelled?: number })[] = []
  for (const sortie of log) {
    joined.add(sortie.nickname)
    const wave = Math.min(state.wave, XIANGYANG_WAVES)
    const { repelled, ...next } = advanceXiangyangGate(state, sortie.merit, joined.size)
    state = next
    feed.push({ ...sortie, wave, ...(repelled.length ? { repelled: repelled.at(-1) } : {}) })
  }
  return { state, defenders: joined.size, feed }
}
