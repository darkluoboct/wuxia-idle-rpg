import type { CompanionState, FtueClaimResult, FtueStateDTO, PlayerDTO } from './protocol.ts'
import { gaibangSilverGain } from './gaibang.ts'

/**
 * 《江湖行历》剧情引导（docs/17 §五、§六）：接着序章，一位人物说一句话、指一件事，
 * 先教打坐、历练、客栈、采药炼丹这些基础，再一路带到各项玩法随剧情开放的关口。
 * 目标全部落在现有系统上，进度由存档推出。
 *
 * 编号沿用旧版十阶（1~10 含义不变，老存档的已领记录照常有效），新加的从 11 起；
 * 先后以数组顺序为准，当前一阶是顺序里第一个还没领的。
 */
export type FtueTargetType =
  | 'STORY'        // 首胜指定历练关
  | 'NODE'         // 通关指定主线节点
  | 'PIERCE'       // 冲通指定穴位
  | 'PIERCE_ALL'   // 整条经脉贯通
  | 'COMPANION'    // 客栈结交
  | 'FORAGE'       // 采药一次
  | 'REFINE'       // 炼成指定丹方
  | 'BREAKTHROUGH' // 达到指定境界
  | 'SECT'         // 拜入师门

export interface FtueQuestConfig {
  id: number
  /** 卷次：1 卷一 · 嘉兴烟雨，2 卷二 · 北上燕京 */
  volume: 1 | 2
  title: string
  subtitle: string
  /** 引路的人和他说的话 */
  speaker: string
  line: string
  targetType: FtueTargetType
  targetValue: string | number
  rewardQi: number
  rewardSilver: number
  rewardPillId?: string
  jumpTab: 'CULTIVATE' | 'JIANGHU' | 'ARSENAL' | 'MARKET' | 'SECT'
  jumpSub?: string
}

export const FTUE_VOLUMES = { 1: '卷一 · 嘉兴烟雨', 2: '卷二 · 北上燕京' } as const

/** 手三阳经五穴，「经脉全通」要求全部贯通 */
export const HAND_THREE_YANG = ['shangyang', 'hegu', 'quchi', 'jianyu', 'yingxiang'] as const

export const FTUE_QUESTS: FtueQuestConfig[] = [
  // ───────────── 卷一 · 嘉兴烟雨：序章之后到拜师 ─────────────
  {
    id: 1, volume: 1, title: '荒山练手', subtitle: '首胜历练第 01 关「破庙夜雨 · 荒山草贼」',
    speaker: '忘机客', line: '城外荒山有草寇出没，先拿他们练练手。',
    targetType: 'STORY', targetValue: 1, rewardQi: 600, rewardSilver: 200, jumpTab: 'JIANGHU', jumpSub: 'TRIAL',
  },
  {
    id: 2, volume: 1, title: '气贯周天', subtitle: '打坐攒真气，冲通手三阳经【商阳穴】',
    speaker: '武库残卷', line: '气聚商阳，臂力自生。静坐吐纳，真气自来，人不在也不停。',
    targetType: 'PIERCE', targetValue: 'shangyang', rewardQi: 500, rewardSilver: 100, jumpTab: 'CULTIVATE',
  },
  {
    id: 11, volume: 1, title: '醉仙楼头', subtitle: '通关主线 1-2「醉仙楼头 · 烟雨试招」',
    speaker: '忘机客', line: '练出了门道，去嘉兴醉仙楼……找……',
    targetType: 'NODE', targetValue: 2, rewardQi: 600, rewardSilver: 200, jumpTab: 'JIANGHU', jumpSub: 'STORY',
  },
  {
    id: 4, volume: 1, title: '醉仙会友', subtitle: '在醉仙客栈与柯镇恶结交（好感 100）',
    speaker: '郭靖', line: '大师父嘴上凶，心里热。你多陪他喝两碗，他就认你这个朋友。',
    targetType: 'COMPANION', targetValue: 'kezhene', rewardQi: 800, rewardSilver: 300, jumpTab: 'MARKET', jumpSub: 'INN',
  },
  {
    id: 3, volume: 1, title: '气海凝神', subtitle: '冲通手三阳经第二穴【合谷穴】',
    speaker: '武库残卷', line: '合谷乃气血大关，一通则拳脚自重。',
    targetType: 'PIERCE', targetValue: 'hegu', rewardQi: 600, rewardSilver: 150, jumpTab: 'CULTIVATE',
  },
  {
    id: 12, volume: 1, title: '法华古寺', subtitle: '首胜历练第 03 关「法华古寺 · 焦木盲僧」',
    speaker: '柯镇恶', line: '法华寺的和尚棍子使得不坏，你去讨教讨教——别把人打坏了。',
    targetType: 'STORY', targetValue: 3, rewardQi: 700, rewardSilver: 200, jumpTab: 'JIANGHU', jumpSub: 'TRIAL',
  },
  {
    id: 5, volume: 1, title: '本草寻真', subtitle: '在江湖地图上采药一次',
    speaker: '了妄和尚', line: '南湖草甸就长着田七、车前草，搜一搜山便有。',
    targetType: 'FORAGE', targetValue: 'any', rewardQi: 400, rewardSilver: 100, jumpTab: 'JIANGHU', jumpSub: 'MAPS',
  },
  {
    id: 6, volume: 1, title: '八卦炉烟', subtitle: '在百草丹房照《聚气通脉散方》起炉炼丹',
    speaker: '了妄和尚', line: '药采回来，炉火要文，心要静。炼成的丹药冲穴用得上。',
    targetType: 'REFINE', targetValue: 'recipe_tongmai_dan', rewardQi: 1000, rewardSilver: 200, rewardPillId: 'pozhang_dan',
    jumpTab: 'MARKET', jumpSub: 'ALCHEMY',
  },
  {
    id: 13, volume: 1, title: '荒山夜哭', subtitle: '通关主线 1-3「荒山夜哭 · 铜尸陈玄风」',
    speaker: '柯镇恶', line: '黑风双煞害死了我五弟张阿生。这笔账，今夜在荒山了结。',
    targetType: 'NODE', targetValue: 3, rewardQi: 1200, rewardSilver: 300, jumpTab: 'JIANGHU', jumpSub: 'STORY',
  },
  {
    id: 10, volume: 1, title: '塞外瀚海', subtitle: '首胜历练第 05 关「塞外瀚海 · 蒙古骑射手」',
    speaker: '郭靖', line: '我在大漠长大，那边的射雕手箭法可准了。你要去，可得当心！',
    targetType: 'STORY', targetValue: 5, rewardQi: 3000, rewardSilver: 1000, jumpTab: 'JIANGHU', jumpSub: 'TRIAL',
  },
  {
    id: 14, volume: 1, title: '黄河四鬼', subtitle: '首胜历练第 08 关「张家口外 · 黄河四鬼截道」',
    speaker: '郭靖', line: '黄河四鬼在张家口外截道，专抢过路客商。咱们去会会他们！',
    targetType: 'STORY', targetValue: 8, rewardQi: 1500, rewardSilver: 400, jumpTab: 'JIANGHU', jumpSub: 'TRIAL',
  },
  {
    id: 7, volume: 1, title: '经脉全通', subtitle: '冲通手三阳经全部 5 个穴位',
    speaker: '武库残卷', line: '商阳、合谷、曲池、肩髃、迎香，五穴贯通，方可叩玄关。',
    targetType: 'PIERCE_ALL', targetValue: 'hand_three_yang', rewardQi: 2000, rewardSilver: 500, jumpTab: 'CULTIVATE',
  },
  {
    id: 8, volume: 1, title: '玄关破障', subtitle: '突破境界「略有小成」',
    speaker: '武库残卷', line: '十级一道玄关。服下破障丹冲关，冲过去便是另一番天地。',
    targetType: 'BREAKTHROUGH', targetValue: 2, rewardQi: 3000, rewardSilver: 800, jumpTab: 'CULTIVATE',
  },
  {
    id: 9, volume: 1, title: '名门正派', subtitle: '在门派大殿拜入师门',
    speaker: '柯镇恶', line: '野路子练到这儿就到头了，去拜个正经师父。',
    targetType: 'SECT', targetValue: 'any', rewardQi: 1500, rewardSilver: 500, jumpTab: 'SECT',
  },
  // ───────────── 卷二 · 北上燕京：比武招亲到松林逢北丐 ─────────────
  {
    id: 15, volume: 2, title: '比武招亲', subtitle: '通关主线 2-1「比武招亲 · 小王爷完颜康」',
    speaker: '郭靖', line: '中都有人摆擂台比武招亲，那小王爷仗势欺人……咱们去看看！',
    targetType: 'NODE', targetValue: 4, rewardQi: 3000, rewardSilver: 800, jumpTab: 'JIANGHU', jumpSub: 'STORY',
  },
  {
    id: 16, volume: 2, title: '王府夜宴', subtitle: '通关主线 2-2「赵王府夜宴 · 参仙梁子翁」',
    speaker: '黄蓉', line: '王府药房里锁着救人的解药。今夜咱们一起去取，你走前头，我替你看路。',
    targetType: 'NODE', targetValue: 5, rewardQi: 4000, rewardSilver: 1000, jumpTab: 'JIANGHU', jumpSub: 'STORY',
  },
  {
    id: 17, volume: 2, title: '终南问道', subtitle: '通关主线 2-3「终南金雁 · 重阳问道」',
    speaker: '丘处机', line: '终南山上有先师遗泽，你若有心，便上山来。',
    targetType: 'NODE', targetValue: 6, rewardQi: 5000, rewardSilver: 1200, jumpTab: 'JIANGHU', jumpSub: 'STORY',
  },
  {
    id: 18, volume: 2, title: '松林长啸', subtitle: '通关主线 3-1「松林长啸 · 北丐洪七公」',
    speaker: '黄蓉', line: '宝应城外松林里有位老叫化，馋得很。我做几道菜引他出来，你可得接住他的掌力。',
    targetType: 'NODE', targetValue: 7, rewardQi: 6000, rewardSilver: 1500, jumpTab: 'JIANGHU', jumpSub: 'STORY',
  },
]

export const FTUE_TOTAL = FTUE_QUESTS.length

export const emptyFtue = (): FtueStateDTO => ({ index: 0, claimed: [], forageCount: 0, refinedRecipeIds: [] })

/** 当前一阶：顺序里第一个还没领的；全部领完为 undefined */
export function currentFtueQuest(ftue: FtueStateDTO | undefined) {
  const claimed = ftue?.claimed ?? []
  return FTUE_QUESTS.find(({ id }) => !claimed.includes(id))
}

/** 卷一领完即「江湖行历卷一圆满」 */
export function ftueVolumeDone(ftue: FtueStateDTO | undefined, volume: FtueQuestConfig['volume']) {
  return FTUE_QUESTS.every((quest) => quest.volume !== volume || ftue?.claimed.includes(quest.id))
}

export interface FtueProgressState {
  player: Pick<PlayerDTO, 'trial' | 'realmTier' | 'currentSectId' | 'ftue' | 'maxChapterId'>
  openedAcupointIds: readonly string[]
  companionAffinity: Record<string, Pick<CompanionState, 'recruited' | 'affinity'> | undefined>
}

/** 当前行历目标是否达成（0 / 1）。进度由现有系统状态推导，联机与本地共用 */
export function ftueProgress(quest: FtueQuestConfig, { player, openedAcupointIds, companionAffinity }: FtueProgressState): number {
  const ftue = player.ftue ?? emptyFtue()
  switch (quest.targetType) {
    case 'STORY':
      return player.trial.rewardedStageIds.includes(Number(quest.targetValue)) ? 1 : 0
    case 'NODE':
      return player.maxChapterId > Number(quest.targetValue) ? 1 : 0
    case 'PIERCE':
      return openedAcupointIds.includes(String(quest.targetValue)) ? 1 : 0
    case 'PIERCE_ALL':
      return HAND_THREE_YANG.every((id) => openedAcupointIds.includes(id)) ? 1 : 0
    case 'COMPANION': {
      const state = companionAffinity[String(quest.targetValue)]
      return state?.recruited && state.affinity >= 100 ? 1 : 0
    }
    case 'FORAGE':
      return ftue.forageCount >= 1 ? 1 : 0
    case 'REFINE':
      return ftue.refinedRecipeIds.includes(String(quest.targetValue)) ? 1 : 0
    case 'BREAKTHROUGH':
      return player.realmTier >= Number(quest.targetValue) ? 1 : 0
    case 'SECT':
      return player.currentSectId ? 1 : 0
  }
}

/** 领取当前一阶行历奖励：校验达成后发真气、纹银与丹药，并推进到下一阶 */
export function claimFtueQuest(
  state: FtueProgressState & { player: Pick<PlayerDTO, 'qiExp' | 'silver' | 'sectRank' | 'gaibangBranch'> },
  pills: Record<string, number>,
): { error: string } | FtueClaimResult {
  const { player } = state
  const ftue = player.ftue ?? emptyFtue()
  const quest = currentFtueQuest(ftue)
  if (!quest) return { error: '江湖行历已全部完成' }
  if (ftueProgress(quest, state) < 1) return { error: `「${quest.title}」还没有达成` }
  const silver = gaibangSilverGain(player, quest.rewardSilver)
  player.qiExp += quest.rewardQi
  player.silver += silver
  if (quest.rewardPillId) pills[quest.rewardPillId] = (pills[quest.rewardPillId] ?? 0) + 1
  const claimed = [...ftue.claimed, quest.id]
  player.ftue = { ...ftue, claimed, index: claimed.length }
  return { questId: quest.id, qiExp: quest.rewardQi, silver, pillId: quest.rewardPillId }
}

/** 采药、炼丹这两阶行历要记次数 */
export function recordFtueForage(player: Pick<PlayerDTO, 'ftue'>) {
  const ftue = player.ftue ?? emptyFtue()
  player.ftue = { ...ftue, forageCount: ftue.forageCount + 1 }
}

export function recordFtueRefine(player: Pick<PlayerDTO, 'ftue'>, recipeId: string) {
  const ftue = player.ftue ?? emptyFtue()
  if (!ftue.refinedRecipeIds.includes(recipeId)) player.ftue = { ...ftue, refinedRecipeIds: [...ftue.refinedRecipeIds, recipeId] }
}
