/**
 * 首日《江湖行历》十阶新手引导配置。
 * 对应 docs/17；目标全部落在现有系统上，便于前端直接驱动。
 */
export type FtueTargetType =
  | 'STORY'        // 通关指定历练关
  | 'PIERCE'       // 冲通指定穴位
  | 'PIERCE_ALL'   // 整条经脉贯通
  | 'COMPANION'    // 客栈结交
  | 'FORAGE'       // 采药一次
  | 'REFINE'       // 炼成指定丹方
  | 'BREAKTHROUGH' // 达到指定境界
  | 'SECT'         // 拜入师门

export interface FtueQuestConfig {
  id: number
  title: string
  subtitle: string
  desc: string
  targetType: FtueTargetType
  targetValue: string | number
  rewardQi: number
  rewardSilver: number
  rewardPillId?: string
  jumpTab: 'CULTIVATE' | 'JIANGHU' | 'ARSENAL' | 'MARKET' | 'SECT'
  jumpSub?: string
}

/** 手三阳经五穴，行历七要求全部贯通 */
export const HAND_THREE_YANG = ['shangyang', 'hegu', 'quchi', 'jianyu', 'yingxiang'] as const

export const FTUE_QUESTS: FtueQuestConfig[] = [
  {
    id: 1,
    title: '行历一 · 初试身手',
    subtitle: '前往历练，打赢第 01 关',
    desc: '南湖水畔有恶徒滋事，出手将其制服，夺回佩剑。',
    targetType: 'STORY',
    targetValue: 1,
    rewardQi: 600,
    rewardSilver: 200,
    jumpTab: 'JIANGHU',
    jumpSub: 'TRIAL',
  },
  {
    id: 2,
    title: '行历二 · 气贯周天',
    subtitle: '打坐运功冲通【商阳穴】',
    desc: '引真气归元，冲击手三阳经首穴商阳，增益臂力。',
    targetType: 'PIERCE',
    targetValue: 'shangyang',
    rewardQi: 500,
    rewardSilver: 100,
    jumpTab: 'CULTIVATE',
  },
  {
    id: 3,
    title: '行历三 · 气海凝神',
    subtitle: '继续冲通第二穴【合谷穴】',
    desc: '合谷穴乃气血大关，冲通可大幅提升外功杀伤。',
    targetType: 'PIERCE',
    targetValue: 'hegu',
    rewardQi: 600,
    rewardSilver: 150,
    jumpTab: 'CULTIVATE',
  },
  {
    id: 4,
    title: '行历四 · 醉仙会友',
    subtitle: '在醉仙客栈请柯镇恶饮酒',
    desc: '飞天蝙蝠性格刚烈，以美酒投其所好结为莫逆之交。',
    targetType: 'COMPANION',
    targetValue: 'kezhene',
    rewardQi: 800,
    rewardSilver: 300,
    jumpTab: 'MARKET',
    jumpSub: 'INN',
  },
  {
    id: 5,
    title: '行历五 · 本草寻真',
    subtitle: '在嘉兴南湖采药搜山一次',
    desc: '草甸水泽多灵草，搜山采摘田七与车前草。',
    targetType: 'FORAGE',
    targetValue: 'jiaxing_suburb',
    rewardQi: 400,
    rewardSilver: 100,
    jumpTab: 'JIANGHU',
    jumpSub: 'MAPS',
  },
  {
    id: 6,
    title: '行历六 · 八卦炉烟',
    subtitle: '在丹房炼制一丸通脉灵丹',
    desc: '以神农百草鼎起炉，炼成《聚气通脉散》。',
    targetType: 'REFINE',
    targetValue: 'recipe_tongmai_dan',
    rewardQi: 1000,
    rewardSilver: 200,
    rewardPillId: 'pozhang_dan',
    jumpTab: 'MARKET',
    jumpSub: 'ALCHEMY',
  },
  {
    id: 7,
    title: '行历七 · 经脉全通',
    subtitle: '冲通手三阳经全部 5 个穴位',
    desc: '将商阳、合谷、曲池、肩髃、迎香全部贯通。',
    targetType: 'PIERCE_ALL',
    targetValue: 'hand_three_yang',
    rewardQi: 2000,
    rewardSilver: 500,
    jumpTab: 'CULTIVATE',
  },
  {
    id: 8,
    title: '行历八 · 玄关破障',
    subtitle: '冲击大境界突破【略有小成】',
    desc: '服下纯阳破障丹，冲破大境界，引天地纯和之气。',
    targetType: 'BREAKTHROUGH',
    targetValue: 2,
    rewardQi: 3000,
    rewardSilver: 800,
    jumpTab: 'CULTIVATE',
  },
  {
    id: 9,
    title: '行历九 · 名门正派',
    subtitle: '在门派大殿拜入师门',
    desc: '在宗门大殿选择武道方向，参悟门派绝学。',
    targetType: 'SECT',
    targetValue: 'any',
    rewardQi: 1500,
    rewardSilver: 500,
    jumpTab: 'SECT',
  },
  {
    id: 10,
    title: '行历十 · 初试论剑',
    subtitle: '挑战第 05 关，初尝高手交锋',
    desc: '一路历练到塞外瀚海，与成名高手正面拆招。',
    targetType: 'STORY',
    targetValue: 5,
    rewardQi: 3000,
    rewardSilver: 1000,
    jumpTab: 'JIANGHU',
    jumpSub: 'TRIAL',
  },
]

export const FTUE_TOTAL = FTUE_QUESTS.length
