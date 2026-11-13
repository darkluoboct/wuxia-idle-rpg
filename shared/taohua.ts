import { TANCHUDUAN_COMBAT, type BattleOpponent, type EnemyCombatConfig } from './combatMeta.ts'

const JIN_GUARD = { faction: 'JIN', alignment: 'HERETIC', karma: -50, joinsRound: true } as const
const WUXING_TRAP = {
  sourceId: 'taohua_wuxing', sourceName: '奇门五行阵', stance: 'AGILE', rule: { status: 'CONFUSION', rounds: 2 },
} as const satisfies EnemyCombatConfig['openingTrap']

export const TAOHUA_RESCUE_EXAM = {
  title: '归云庄救师兄',
  intro: '完颜洪烈的卫队闯进太湖归云庄。陆乘风迎住统领，你依五行方位布阵，将分进的亲卫困在庄中。',
  hint: '以奇门架势开战。两名亲卫受困 2 回合，陆乘风随队迎战统领。',
  mapId: 'guiyun_lake',
  requiredStance: WUXING_TRAP.stance,
  guestCompanionId: 'luchengfeng',
  opponent: {
    name: '赵王卫队统领', title: '完颜洪烈麾下', portrait: 'assassin', hp: 14200, atk: 720, mp: 3300, stance: 'FIERCE',
    combat: { ...JIN_GUARD, speed: 112, def: 115, openingShield: 600, weapon: { form: 'BLADE', tier: 'purple' } },
    guards: [
      {
        name: '金国刀卫', title: '左路亲卫', portrait: 'bandit', hp: 4700, atk: 430, stance: 'FIERCE',
        combat: { ...JIN_GUARD, speed: 105, def: 60, weapon: { form: 'BLADE', tier: 'blue' }, openingTrap: WUXING_TRAP },
      },
      {
        name: '金国弓卫', title: '右路亲卫', portrait: 'zhebie', hp: 4600, atk: 400, stance: 'FIERCE',
        combat: { ...JIN_GUARD, speed: 107, def: 45, range: 'RANGED', weapon: { form: 'BOW', tier: 'blue' }, openingTrap: WUXING_TRAP },
      },
    ],
  } satisfies BattleOpponent,
} as const

const QUANZHEN_SWORD = { joinsRound: true, alignment: 'RIGHTEOUS', weapon: { form: 'BLADE', tier: 'purple' } } as const
const BEIDOU_FORMATION = { name: '天罡北斗阵', parryPoints: 20 }

export const TAOHUA_FINAL_EXAM = {
  title: '烟雨楼独抗群雄',
  intro: '烟雨楼前，群雄误认黄药师害了江南七怪。你携两位同伴上前，丘处机率四人起阵，王处一领三人随后接阵。',
  hint: '携两位已入队伙伴出战。两阵各轮换前排，抢过所有阵中对手的先手或击退一人可破阵，击退七人才通过考核。',
  mapId: 'jiaxing_suburb',
  completionFlag: 'taohua_yanyu_done',
  requiresTwoCompanions: true,
  opponent: {
    name: '长春子·丘处机', title: '全真七子 · 第一阵', portrait: 'daoist', hp: 11800, atk: 620, mp: 3300, stance: 'TAICHI',
    combat: { ...QUANZHEN_SWORD, speed: 230, def: 125, parry: 15, formation: BEIDOU_FORMATION, rageSkillId: 'quanzhen_jianfa' },
    guards: [
      {
        name: '丹阳子·马钰', title: '全真七子', portrait: 'daoist', hp: 6100, atk: 410, stance: 'TAICHI',
        combat: { ...QUANZHEN_SWORD, speed: 200, def: 85, parry: 10, rageSkillId: 'quanzhen_jianfa' },
      },
      {
        name: '长真子·谭处端', title: '全真七子', portrait: 'daoist', hp: 5800, atk: 405, stance: 'TAICHI',
        combat: { ...TANCHUDUAN_COMBAT, ...QUANZHEN_SWORD, speed: 186, def: 85, parry: 10 },
      },
      {
        name: '长生子·刘处玄', title: '全真七子', portrait: 'daoist', hp: 5100, atk: 365, stance: 'TAICHI',
        combat: { ...QUANZHEN_SWORD, speed: 179, def: 75, rageSkillId: 'quanzhen_jianfa' },
      },
    ],
  } satisfies BattleOpponent,
  nextOpponents: [
    {
      name: '玉阳子·王处一', title: '全真七子 · 第二阵', portrait: 'daoist', hp: 13200, atk: 690, mp: 3700, stance: 'TAICHI',
      combat: { ...QUANZHEN_SWORD, speed: 241, def: 140, parry: 16, formation: BEIDOU_FORMATION, rageSkillId: 'chongyang_jianfa' },
      guards: [
        {
          name: '广宁子·郝大通', title: '全真七子', portrait: 'daoist', hp: 6800, atk: 475, stance: 'TAICHI',
          combat: { ...QUANZHEN_SWORD, speed: 212, def: 100, parry: 10, rageSkillId: 'quanzhen_jianfa' },
        },
        {
          name: '清静散人·孙不二', title: '全真七子', portrait: 'sunbuer', hp: 6400, atk: 440, stance: 'TAICHI',
          combat: { ...QUANZHEN_SWORD, female: true, speed: 205, def: 90, rageSkillId: 'quanzhen_jianfa' },
        },
      ],
    },
  ] satisfies readonly BattleOpponent[],
} as const
