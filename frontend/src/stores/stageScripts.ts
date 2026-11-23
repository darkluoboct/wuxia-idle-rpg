import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { BattleReportDTO, CombatUnitDTO } from '@/network/protocol'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { ONLINE_STORY_CHAPTERS, STORY_CHAPTERS } from '@/config/gameData'
import {
  addStageLines,
  nextStage,
  storyGateBlock,
  trialGateBlock,
  STORY_TIMELINE,
  timelineChapter,
  stageScript,
  storyKey,
  TIMELINE_CHAPTER_TITLES,
  timelineChapterStages,
  trialKey,
  type SceneId,
  type ScriptPage,
  type StageKey,
  type StageScript,
} from '../../../shared/stageScripts.ts'
import { TRIAL_STAGES } from '../../../shared/trialStages.ts'
import { SECT_LORE } from '../../../shared/sectLore.ts'
import { SECTS } from '@/config/gameData'
import { usePlayerStore } from './playerStore'
import { useGameUiStore, type MainTab } from './gameUiStore'
import { useInterfacePrefs } from './interfacePrefs'
import type { BattleStaging, useBattlePlayback } from './battlePlayback'
import type { useStory } from './story'
import type { useTrial } from './trial'
import type { useChat } from './chat'

/** 卷轴上的一回：主线节点或历练关 */
export interface StageInfo {
  key: StageKey
  /** 卷轴左上角的印章与小字 */
  seal: string
  label: string
  title: string
  foe: { name: string; title: string; portrait: CombatUnitDTO['portraitStyle'] }
}

/** 章末结语附上这一章各回的小结 */
export interface ChapterEnd {
  chapter: number
  title: string
  entries: { key: StageKey; title: string; recap?: string }[]
}

/** 不属于哪一回的一段剧情，例如拜师（shared/sectLore.ts） */
export interface Tale { seal: string; label: string; title: string; pages: ScriptPage[]; scene?: SceneId }

/**
 * BEFORE 入关卷轴，末页「拔剑」开战；AFTER 首通结语，列出所得与下一回；REVIEW 重温看过的剧情；TALE 其他剧情
 */
export type StageScroll =
  | ({ phase: 'TALE' } & Tale)
  | { phase: 'BEFORE'; stage: StageInfo; script: StageScript; pages: ScriptPage[]; start: () => void }
  | {
    phase: 'AFTER'; stage: StageInfo; script: StageScript; pages: ScriptPage[]; rewards?: BattleReportDTO['rewards']
    /** 下一回；hook 只在它正是时间线上紧接着的那一回时给，newChapter 表示跨章 */
    next?: StageInfo & { hook?: string; newChapter: boolean }
    chapterEnd?: ChapterEnd
  }
  | { phase: 'REVIEW'; stage: StageInfo; script: StageScript; pages: ScriptPage[] }

const SEEN_KEY = (playerId: string) => `wuxia.stageSeen.${playerId}`

/** 看过的入关剧情记在本机，丢了只是多看一遍，不进存档也不改协议 */
function readSeen(playerId: string): StageKey[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SEEN_KEY(playerId)) ?? '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

/**
 * 关卡剧情演出（docs/27）：首通前放入关卷轴，回放里插对白，首通胜利后放结语；复战与挂机不打扰。
 * 页面上的「拔剑闯关」「拔剑试炼」走这里，store 里原有的挑战函数不变。
 */
export function useStageScripts({ story, trial, battle, chat, selectTab }: {
  story: Pick<ReturnType<typeof useStory>, 'challengeChapter'>
  chat: Pick<ReturnType<typeof useChat>, 'postRumor'>
  trial: Pick<ReturnType<typeof useTrial>, 'challengeTrialStage'>
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'activeBattle' | 'isBattlePlaying' | 'closeBattleStage'>
  selectTab: (tab: MainTab) => void
}) {
  const playerStore = usePlayerStore()
  const { player, claimedNodeIds, storyFlags } = storeToRefs(playerStore)
  const uiStore = useGameUiStore()
  const { jianghuTab, stageFocus } = storeToRefs(uiStore)
  const prefs = useInterfacePrefs()
  const chapters = IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS

  const stageScroll = ref<StageScroll | null>(null)
  const seen = ref<StageKey[]>([])
  watch(() => player.value.id, (id) => {
    seen.value = id ? readSeen(id) : []
    stageScroll.value = null
  }, { immediate: true })

  function markSeen(key: StageKey) {
    if (seen.value.includes(key)) return
    seen.value = [...seen.value, key]
    try { localStorage.setItem(SEEN_KEY(player.value.id), JSON.stringify(seen.value)) } catch { /* 本次会话内仍记得 */ }
  }

  function stageInfo(key: StageKey): StageInfo | undefined {
    const code = key.slice(1)
    if (key.startsWith('N')) {
      const node = chapters.find((n) => n.code === code)
      return node && {
        key, seal: '主线', label: `射雕主线 · ${node.code}`, title: node.title,
        foe: { name: node.bossName, title: node.bossTitle, portrait: node.bossPortrait },
      }
    }
    const stage = TRIAL_STAGES.find((s) => s.code === code)
    return stage && {
      key, seal: '历练', label: `三十关历练 · 第 ${stage.code} 关`, title: stage.title,
      foe: { name: stage.boss.name, title: stage.boss.title, portrait: stage.boss.portrait },
    }
  }

  /** 与江湖页的「已通关」一致 */
  function stageCleared(key: StageKey) {
    const code = key.slice(1)
    if (key.startsWith('N')) {
      const node = chapters.find((n) => n.code === code)
      if (!node) return false
      return IS_MOCK_MODE ? node.id < player.value.maxChapterId : claimedNodeIds.value.includes(node.id)
    }
    const stage = TRIAL_STAGES.find((s) => s.code === code)
    const { rewardedStageIds, maxStageId } = player.value.trial
    return !!stage && (rewardedStageIds.includes(stage.id) || stage.id < maxStageId)
  }

  const scriptOf = (key: StageKey) => stageScript(key, chapters)

  /** 跟着这场首通战斗走的演出：回放前插对白，打赢后放结语 */
  function staging(key: StageKey, script: StageScript): BattleStaging {
    return {
      prepare: (report) => addStageLines(report, script.lines, {
        origin: player.value.origin, storyAdventureChoices: player.value.storyAdventureChoices,
        storySnakeChoice: player.value.storySnakeChoice, flags: storyFlags.value,
      }),
      onWon: (report) => {
        const stage = stageInfo(key)
        // 没写结语的（1-1 由忘机客的剧情卡收尾）不弹
        if (!stage || !script.after.length) return
        const nextKey = nextStage(key, stageCleared)
        const nextInfo = nextKey && stageInfo(nextKey)
        const next = nextInfo && {
          ...nextInfo,
          hook: nextKey === STORY_TIMELINE[STORY_TIMELINE.indexOf(key) + 1] ? script.hook : undefined,
          newChapter: timelineChapter(nextKey) !== timelineChapter(key),
        }
        stageScroll.value = { phase: 'AFTER', stage, script, pages: script.after, rewards: report.rewards, next, chapterEnd: chapterEndOf(key) }
        if (script.rumor) chat.postRumor('江湖百晓生', script.rumor.replaceAll('{name}', player.value.nickname))
      },
    }
  }

  /** 打完一章的最后一回：附上这一章各回的小结 */
  function chapterEndOf(key: StageKey): ChapterEnd | undefined {
    const chapter = timelineChapter(key)
    const stages = timelineChapterStages(chapter)
    if (stages.at(-1) !== key) return
    return {
      chapter, title: TIMELINE_CHAPTER_TITLES[chapter - 1],
      entries: stages.map((entry) => ({ key: entry, title: stageInfo(entry)?.title ?? entry, recap: scriptOf(entry)?.recap })),
    }
  }

  function showTale(tale: Tale) {
    stageScroll.value = { phase: 'TALE', ...tale }
  }

  /** 拜师那一段：拜入门派时放，门派页上可以重温 */
  function showSectTale(sectId: string) {
    const sect = SECTS.find(({ id }) => id === sectId)
    const lore = SECT_LORE[sectId]
    if (!sect || !lore) return
    showTale({ seal: lore.glyph, label: `拜师 · ${lore.seat}`, title: `奉茶拜师 · ${sect.name}`, pages: [...lore.initiation], scene: lore.scene })
  }

  /** 首通走演出；已通关、入场即撤退、关了演出、这一回没有要演的（1-1）都直接开打 */
  function enter(key: StageKey, retreat: boolean, start: (staging?: BattleStaging) => unknown) {
    if (battle.isBattlePlaying.value) return
    const script = scriptOf(key)
    const stage = stageInfo(key)
    if (retreat || !script || !stage || prefs.stageScripts === 'OFF' || stageCleared(key)) return start()
    if (!script.before.length && !script.lines.length && !script.after.length) return start()
    const play = staging(key, script)
    if (prefs.stageScripts === 'FULL' && script.before.length && !seen.value.includes(key)) {
      stageScroll.value = {
        phase: 'BEFORE', stage, script, pages: script.before,
        // 看过就记下，打输了重来不再放
        start: () => {
          markSeen(key)
          stageScroll.value = null
          start(play)
        },
      }
      return
    }
    return start(play)
  }

  function enterStoryNode(chapterId: number, retreat = false) {
    const node = chapters.find((n) => n.id === chapterId)
    if (!node) return
    // 还被历练挡着的节点不放入关卷轴，由挑战函数提示先去哪一关
    if (storyGateBlock(node, player.value)) return story.challengeChapter(chapterId, retreat)
    return enter(storyKey(node.code), retreat, (play) => story.challengeChapter(chapterId, retreat, play))
  }

  function enterTrialStage(stageId: number, answer?: string, retreat = false) {
    const stage = TRIAL_STAGES.find((s) => s.id === stageId)
    if (!stage) return
    // 还被主线挡着的历练不放入关卷轴，由挑战函数提示先打哪个节点
    if (trialGateBlock(stage, player.value)) return trial.challengeTrialStage(stageId, answer, retreat)
    return enter(trialKey(stage.code), retreat, (play) => trial.challengeTrialStage(stageId, answer, retreat, play))
  }

  /** 重温：入关与结语连起来读；还没通关的只读入关 */
  function reviewStage(key: StageKey) {
    const script = scriptOf(key)
    const stage = stageInfo(key)
    if (!script || !stage) return
    const pages = [...script.before, ...stageCleared(key) ? script.after : []]
    if (pages.length) stageScroll.value = { phase: 'REVIEW', stage, script, pages }
  }

  /** 卡片上的一句：通关前是前情，通关后是小结 */
  function stageBlurb(key: StageKey) {
    const script = scriptOf(key)
    if (!script) return
    const cleared = stageCleared(key)
    const text = (cleared ? script.recap ?? script.after[0]?.text ?? script.before[0]?.text : script.before[0]?.text)?.replaceAll('\n', '')
    const reviewable = (cleared && (script.before.length || script.after.length)) || seen.value.includes(key)
    return text ? { text, reviewable: !!reviewable } : undefined
  }

  function gotoStage(key: StageKey) {
    selectTab('JIANGHU')
    jianghuTab.value = key.startsWith('N') ? 'STORY' : 'TRIAL'
    stageFocus.value = key
  }

  /** 合上卷轴。结语已列出所得，合上时一并收起战场；go 时前往下一回 */
  function closeStageScroll(go = false) {
    const scroll = stageScroll.value
    if (!scroll) return
    stageScroll.value = null
    if (scroll.phase !== 'AFTER') return
    if (battle.activeBattle.value && !battle.isBattlePlaying.value) battle.closeBattleStage()
    if (go && scroll.next) gotoStage(scroll.next.key)
  }

  return { stageScroll, enterStoryNode, enterTrialStage, reviewStage, stageBlurb, closeStageScroll, showTale, showSectTale, gotoStage }
}
