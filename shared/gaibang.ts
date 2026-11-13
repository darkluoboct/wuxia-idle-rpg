import { OUYANG_FENG_ISLAND_COMBAT, type BattleObjective, type BattleOpponent } from './combatMeta.ts'
import type { GaibangBranch, PlayerDTO } from './protocol.ts'

export const GAIBANG_FINAL_DISHES = [
  { id: 'jiaohuaji', name: '叫花鸡', mapId: 'jiaxing_suburb', ingredient: '江南肥鸡', silver: 300, poem: '泥封荷叶，火煨半日，一开泥壳满林香。' },
  { id: 'yudi_luomei', name: '玉笛谁家听落梅', mapId: 'jiaxing_suburb', ingredient: '五般肉条', silver: 600, poem: '羊羔坐臀、小猪耳朵、小牛腰子……五味入口，各有其妙。' },
  { id: 'ershisi_qiao', name: '二十四桥明月夜', mapId: 'guiyun_lake', ingredient: '太湖嫩豆腐', silver: 500, poem: '火腿剜孔，豆腐削球，一轮明月浮于汤中。' },
] as const

export const gaibangDishFlag = (id: string) => `gaibang_baiwei_${id}`

export const GAIBANG_BRANCHES = {
  WUYI: { name: '污衣派', conPercent: 15, defensePercent: 15, agiPercent: 0, silverPercent: 0 },
  JINGYI: { name: '净衣派', conPercent: 0, defensePercent: 0, agiPercent: 20, silverPercent: 20 },
} as const satisfies Record<GaibangBranch, {
  name: string; conPercent: number; defensePercent: number; agiPercent: number; silverPercent: number
}>

type GaibangMember = Pick<PlayerDTO, 'currentSectId' | 'sectRank' | 'gaibangBranch'>

export function gaibangPerks(player: GaibangMember) {
  return player.currentSectId === 'gaibang' && player.sectRank >= 3 && player.gaibangBranch
    ? GAIBANG_BRANCHES[player.gaibangBranch] : undefined
}

export function gaibangAttributeBonus(player: GaibangMember & Pick<PlayerDTO, 'stats'>) {
  const perks = gaibangPerks(player)
  return {
    con: Math.round(player.stats.con * (perks?.conPercent ?? 0) / 100),
    agi: Math.round(player.stats.agi * (perks?.agiPercent ?? 0) / 100),
  }
}

export function gaibangSilverGain(player: GaibangMember, amount: number) {
  const percent = gaibangPerks(player)?.silverPercent
  return percent && amount > 0 ? Math.round(amount * (100 + percent) / 100) : amount
}

export const GAIBANG_DIVISION = {
  title: '轩辕台立威',
  intro: '彭长老在轩辕台前拦住你。你可以站定接他三掌，也可以当众陈明帮规。',
  objective: { kind: 'ENDURE_HITS', rounds: 3 },
  opponent: {
    name: '彭长老', title: '轩辕台试掌', portrait: 'hongqigong', hp: 25000, atk: 760, mp: 4500, stance: 'FIERCE',
    combat: { alignment: 'NEUTRAL', def: 120, speed: 104 },
  },
} as const satisfies { title: string; intro: string; objective: BattleObjective; opponent: BattleOpponent }

export const GAIBANG_DEBATE = {
  question: '彭长老问你，凭什么让污衣、净衣两派都肯听从帮中号令？',
  answers: [
    { text: '请两派当众对照帮规，按护帮行义的功劳服众。', correct: true },
    { text: '净衣派家底厚，门中座次理应都由净衣派来定。', correct: false },
  ],
} as const

export const JUNSHAN_EXAM = {
  title: '君山大会',
  intro: '杨康意图假借打狗棒发号施令，简、彭二位长老各执一词。你当众揭明夺权之事，接下三位长老的连番考校。',
  opponent: {
    name: '简长老', title: '第一场 · 杖法试招', portrait: 'hongqigong', hp: 7800, atk: 540, mp: 2700, stance: 'FIERCE',
    combat: { alignment: 'NEUTRAL', def: 65, speed: 92, weapon: { form: 'STAFF', tier: 'blue' }, rageSkillId: 'fengmo_zhang' },
  },
  nextOpponents: [
    {
      name: '彭长老', title: '第二场 · 净衣试掌', portrait: 'hongqigong', hp: 9200, atk: 635, mp: 3800, stance: 'AGILE',
      combat: { alignment: 'NEUTRAL', def: 105, speed: 109, rageSkillId: 'xiaoyao_you' },
    },
    {
      name: '梁长老', title: '第三场 · 九袋考校', portrait: 'hongqigong', hp: 10800, atk: 720, mp: 4800, stance: 'TAICHI',
      combat: { alignment: 'NEUTRAL', def: 145, speed: 100, weapon: { form: 'STAFF', tier: 'purple' }, rageSkillId: 'dagou_bangfa' },
    },
  ],
  hint: '依次击退简长老、彭长老和梁长老。每场继续使用上一场剩余的气血、内力、怒气和保命次数。',
} as const satisfies { title: string; intro: string; opponent: BattleOpponent; nextOpponents: readonly BattleOpponent[]; hint: string }

export const GAIBANG_FINAL_EXAM = {
  title: '百味戏老毒物',
  intro: '洪七公尝过三道佳肴，邀你同赴压鬼岛。欧阳锋抄起灵蛇杖守住渡口，洪七公挽袖迎了上去。',
  mapId: 'yagui_island',
  completionFlag: 'gaibang_baiwei_done',
  guestCompanionId: 'hongqigong',
  opponent: {
    name: '西毒·欧阳锋', title: '压鬼岛 · 白驼山主', portrait: 'ouyangfeng', hp: 36000, atk: 1160, mp: 5700, stance: 'FIERCE',
    combat: { ...OUYANG_FENG_ISLAND_COMBAT, def: 150, speed: 112 },
  },
  hint: '备齐三道佳肴后，与洪七公一同在压鬼岛迎战欧阳锋。兰花拂穴手可打断蛤蟆扑，太极可在他扑出时引其撞石。',
} as const satisfies { title: string; intro: string; mapId: string; completionFlag: string; guestCompanionId: string; opponent: BattleOpponent; hint: string }
