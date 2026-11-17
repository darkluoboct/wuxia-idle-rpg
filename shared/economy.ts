import type { CompanionState, PlayerDTO } from './protocol.ts'
import { COMPANION_SETS, SECTS } from './gameData.ts'
import { featureUnlocked, type FeatureState } from './features.ts'
import { ftueVolumeDone } from './ftueQuests.ts'
import { innVisitDay } from './player.ts'
import { STORY_CHAPTERS } from './storyData.ts'
import { STORY_SNAKE_ADVENTURE } from './storySnake.ts'
import { TRIAL_STAGES } from './trialStages.ts'

/**
 * 元宝产出规则（docs/19）。服务端按这里发放并记流水，本地试玩用同一份规则。
 * 元宝只用于结缘、故人重逢令与鬼市竞拍，不出售真气或挂机时间。
 */
export const INGOT = {
  start: 300,
  ftue: 100,
  storyNode: 30,
  storyChapterEnd: 100,
  trialStage: 10,
  trialChapterEnd: 80,
  realmBreak: 200,
  adventure: 20,
  collectionSet: 100,
  sectRank: 50,
  daily: 60,
  patrolCache: 5,
  patrolDailyCap: 30,
  raidWeekly: 50,
  sectContestJoin: 50,
  sectContestChief: 200,
  xiangyang: 40,
} as const

const lastIdOfChapter = <T extends { id: number; chapter: number }>(nodes: readonly T[]) =>
  new Set([...new Set(nodes.map(({ chapter }) => chapter))].map((chapter) =>
    Math.max(...nodes.filter((node) => node.chapter === chapter).map(({ id }) => id))))
const STORY_CHAPTER_ENDS = lastIdOfChapter(STORY_CHAPTERS)
const TRIAL_CHAPTER_ENDS = lastIdOfChapter(TRIAL_STAGES)

export interface IngotMilestone {
  key: string
  amount: number
  label: string
}

export interface MilestoneState {
  player: Pick<PlayerDTO, 'realmTier' | 'sectRank' | 'currentSectId' | 'trial' | 'ftue'>
  rewardedChapters: readonly number[]
  /** 已了结的支线奇遇 */
  adventureIds: readonly string[]
  companionAffinity: Record<string, Pick<CompanionState, 'recruited'> | undefined>
}

/** 联机存档里已了结的奇遇：各支线的抉择，加上药蛇奇遇 */
export function resolvedAdventures(player: Pick<PlayerDTO, 'storyAdventureChoices' | 'storySnakeChoice'>) {
  return [...Object.keys(player.storyAdventureChoices ?? {}), ...(player.storySnakeChoice ? [STORY_SNAKE_ADVENTURE.id] : [])]
}

/** 由存档状态推出的全部一次性里程碑；已领过的按 ingotClaims 过滤 */
export function ingotMilestones({ player, rewardedChapters, adventureIds, companionAffinity }: MilestoneState): IngotMilestone[] {
  const out: IngotMilestone[] = []
  for (const id of rewardedChapters) {
    const node = STORY_CHAPTERS.find((entry) => entry.id === id)
    if (!node) continue
    const end = STORY_CHAPTER_ENDS.has(id)
    out.push({ key: `story:${id}`, amount: end ? INGOT.storyChapterEnd : INGOT.storyNode, label: `主线首通 ${node.code}${end ? '（章末）' : ''}` })
  }
  for (const id of player.trial.rewardedStageIds) {
    const end = TRIAL_CHAPTER_ENDS.has(id)
    out.push({ key: `trial:${id}`, amount: end ? INGOT.trialChapterEnd : INGOT.trialStage, label: `历练首通第 ${String(id).padStart(2, '0')} 关${end ? '（章末）' : ''}` })
  }
  for (let tier = 2; tier <= player.realmTier; tier++) {
    out.push({ key: `realm:${tier}`, amount: INGOT.realmBreak, label: `突破第 ${tier} 重境界` })
  }
  for (const id of new Set(adventureIds)) out.push({ key: `adventure:${id}`, amount: INGOT.adventure, label: '支线奇遇了结' })
  for (const set of COMPANION_SETS) {
    if (set.memberIds.every((id) => companionAffinity[id]?.recruited)) {
      out.push({ key: `set:${set.id}`, amount: INGOT.collectionSet, label: `集齐「${set.name}」` })
    }
  }
  if (player.currentSectId && SECTS.some(({ id }) => id === player.currentSectId)) {
    for (let rank = 2; rank <= player.sectRank; rank++) out.push({ key: `sect-rank:${rank}`, amount: INGOT.sectRank, label: `门派晋升第 ${rank} 阶` })
  }
  if (ftueVolumeDone(player.ftue, 1)) out.push({ key: 'ftue', amount: INGOT.ftue, label: '江湖行历卷一圆满' })
  return out
}

/** 发放尚未领取的里程碑元宝，返回本次新发的条目 */
export function claimMilestoneIngots(state: MilestoneState & { player: Pick<PlayerDTO, 'goldIngot' | 'ingotClaims'> }) {
  const { player } = state
  const claimed = new Set(player.ingotClaims ?? [])
  const granted = ingotMilestones(state).filter(({ key }) => !claimed.has(key))
  if (!granted.length) return granted
  player.ingotClaims = [...claimed, ...granted.map(({ key }) => key)]
  player.goldIngot += granted.reduce((sum, { amount }) => sum + amount, 0)
  return granted
}

// ───────────────────────── 每日江湖事 ─────────────────────────
export const DAILY_TASKS = [
  { id: 'settle', label: '收功一次' },
  { id: 'inn', label: '客栈请酒或送礼' },
  { id: 'battle', label: '主线、历练或奇遇出战' },
  { id: 'alchemy', label: '采药或炼丹' },
] as const
export type DailyTaskId = (typeof DAILY_TASKS)[number]['id']

export function dailyState(player: Pick<PlayerDTO, 'daily'>, now: number) {
  const day = innVisitDay(now)
  return player.daily?.day === day ? player.daily : { day, done: [], claimed: false }
}

export function markDailyTask(player: Pick<PlayerDTO, 'daily'>, task: DailyTaskId, now: number) {
  const state = dailyState(player, now)
  if (state.done.includes(task)) return false
  player.daily = { ...state, done: [...state.done, task] }
  return true
}

export function claimDailyIngot(player: Pick<PlayerDTO, 'daily' | 'goldIngot' | 'auctionTickets'> & FeatureState, now: number): { error: string } | { ingot: number; ticket: boolean } {
  const state = dailyState(player, now)
  if (state.claimed) return { error: '今日的江湖事奖励已经领过' }
  if (DAILY_TASKS.some(({ id }) => !state.done.includes(id))) return { error: '今日的江湖事还没做完' }
  player.daily = { ...state, claimed: true }
  player.goldIngot += INGOT.daily
  // 顺带拿到当日鬼市暗拍的红封签，什么时辰领都算（鬼市开放之后才有）
  const ticket = featureUnlocked(player, 'GHOST')
  if (ticket) player.auctionTickets = [...(player.auctionTickets ?? []).filter((day) => day !== state.day), state.day]
  return { ingot: INGOT.daily, ticket }
}

/** 巡历宝箱顺带的元宝，每日有上限 */
export function patrolCacheIngot(player: Pick<PlayerDTO, 'patrolIngot' | 'goldIngot'>, caches: number, now: number) {
  const day = innVisitDay(now)
  const got = player.patrolIngot?.day === day ? player.patrolIngot.got : 0
  const ingot = Math.min(INGOT.patrolCache * caches, INGOT.patrolDailyCap - got)
  if (ingot <= 0) return 0
  player.patrolIngot = { day, got: got + ingot }
  player.goldIngot += ingot
  return ingot
}

/** 华山论剑每届（两周）按名次发元宝 */
export function huashanIngot(rank: number) {
  if (rank <= 1) return 500
  if (rank <= 5) return 300
  if (rank <= 100) return 150
  return 50
}
