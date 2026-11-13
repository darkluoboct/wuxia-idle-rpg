import { OUYANG_FENG_ISLAND_COMBAT, type BattleEscortAlly, type BattleObjective, type BattleOpponent } from './combatMeta.ts'

export const QUANZHEN_LIBRARY = {
  mapId: 'zhongnan_forest',
  skills: ['jinyan_gong', 'xiantian_gong'],
  guardSilver: 5000,
  guardContribution: 150,
} as const

export const QUANZHEN_SEVEN_IDS = ['qiuchuji', 'mayu', 'tanchuduan', 'wangchuyi', 'liuchuxuan', 'haodatong', 'sunbuer'] as const

export const QUANZHEN_GUARD_EXAM = {
  title: '天罡北斗大阵',
  intro: '欧阳锋潜入终南山，欲夺祖师留下的经书。丘处机、马钰领你结阵，王处一坐镇阵眼，四周各据一星位。',
  hint: '王处一守阵眼。单体承伤在七人间平摊。守满 8 回合，或在七个阵位均存活时击退欧阳锋。',
  mapId: 'zhongnan_forest',
  completionFlag: 'quanzhen_beidou_guard_done',
  objective: { kind: 'HOLD_FORMATION', rounds: 8, parryPoints: 20 } satisfies BattleObjective,
  formation: {
    leftCompanionId: 'qiuchuji', rightCompanionId: 'mayu',
    reserves: [
      { id: 'wangchuyi', name: '王处一', title: '阵眼 · 玉阳子', portrait: 'daoist', hp: 2200, maxHp: 2200, def: 220 },
      { id: 'tanchuduan', name: '谭处端', title: '阵位 · 长真子', portrait: 'daoist', hp: 3400, maxHp: 3400, def: 175 },
      { id: 'liuchuxuan', name: '刘处玄', title: '阵位 · 长生子', portrait: 'daoist', hp: 3100, maxHp: 3100, def: 160 },
      { id: 'haodatong', name: '郝大通', title: '阵位 · 广宁子', portrait: 'daoist', hp: 3200, maxHp: 3200, def: 170 },
    ] satisfies readonly BattleEscortAlly[],
  },
  opponent: {
    name: '西毒·欧阳锋', title: '夜闯重阳宫', portrait: 'ouyangfeng', hp: 52000, atk: 2600, mp: 7000, stance: 'FIERCE',
    combat: { ...OUYANG_FENG_ISLAND_COMBAT, def: 140, speed: 132, escortTarget: 'ALLY_ESCORT_LEFT' },
  } satisfies BattleOpponent,
} as const
