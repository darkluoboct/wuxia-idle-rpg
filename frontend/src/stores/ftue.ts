import { computed } from 'vue'
import { claimFtueQuest, currentFtueQuest, emptyFtue, ftueProgress, type FtueQuestConfig } from '../../../shared/ftueQuests.ts'
import type { FtueStateDTO } from '@/network/protocol'
import type { GameActions } from '@/network/gameActions'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import { type MainTab } from './gameUiStore'

/** 旧版本地存档把行历进度单独存在 localStorage，读档时并回角色 */
export function legacyFtue(playerId: string): FtueStateDTO | undefined {
  try {
    const raw = localStorage.getItem(`wuxia-ftue-${playerId}`)
    if (!raw) return
    const saved = JSON.parse(raw) as Partial<FtueStateDTO>
    return { ...emptyFtue(), ...saved, claimed: saved.claimed ?? [], refinedRecipeIds: saved.refinedRecipeIds ?? [] }
  } catch {
    return
  }
}

export function useFtue({ selectTab, actions }: {
  selectTab: (tab: MainTab) => void
  actions: GameActions
}) {
  const playerStore = usePlayerStore()
  const { player, openedAcupointIds, companionAffinity, pillInventory } = storeToRefs(playerStore)
  const uiStore = useGameUiStore()
  const { jianghuTab, marketTab } = storeToRefs(uiStore)
  const { appendLog, showToast } = uiStore

  // 《江湖行历》：进度按现有系统状态推导，领取记录随角色存档（联机由服务端校验发奖）
  const ftue = computed(() => player.value.ftue ?? emptyFtue())
  const ftueQuest = computed(() => currentFtueQuest(ftue.value) ?? null)
  const progressState = () => ({ player: player.value, openedAcupointIds: openedAcupointIds.value, companionAffinity: companionAffinity.value })

  function ftueProgressOf(quest: FtueQuestConfig): number {
    return ftueProgress(quest, progressState())
  }

  const ftueReady = computed(() => {
    const quest = ftueQuest.value
    return !!quest && ftueProgressOf(quest) >= 1
  })

  function claimFtueReward() {
    const quest = ftueQuest.value
    if (!quest || ftueProgressOf(quest) < 1) return
    return actions.run('ftueClaim', undefined, ({ qiExp, silver, pillId }) => {
      appendLog('JIANGHU', [
        { type: 'tag', text: '江湖行历', tone: 'gold' },
        { type: 'text', text: ` 达成「${quest.title}」，领得真气 ${qiExp.toLocaleString()}、纹银 ${silver.toLocaleString()}${pillId ? '，并获赠一枚丹药' : ''}。` },
      ])
      showToast(`行历达成：${quest.title}`, 'gold')
    }, () => {
      const result = claimFtueQuest(progressState(), pillInventory.value)
      return 'error' in result ? undefined : result
    })
  }

  function gotoFtueTarget() {
    const quest = ftueQuest.value
    if (!quest) return
    selectTab(quest.jumpTab)
    if (quest.jumpTab === 'JIANGHU' && quest.jumpSub) {
      jianghuTab.value = quest.jumpSub as typeof jianghuTab.value
    }
    if (quest.jumpTab === 'MARKET' && quest.jumpSub) {
      marketTab.value = quest.jumpSub as typeof marketTab.value
    }
  }

  return {
    ftue,
    ftueQuest,
    ftueReady,
    ftueProgressOf,
    claimFtueReward,
    gotoFtueTarget,
  }
}
