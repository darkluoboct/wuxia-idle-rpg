import { computed, ref, watch } from 'vue'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { gaibangSilverGain } from '../../../shared/gaibang.ts'
import { FTUE_QUESTS, HAND_THREE_YANG, type FtueQuestConfig } from '../../../shared/ftueQuests.ts'
import { LOCAL_SAVE_ENABLED } from './persistence'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import { type MainTab } from './gameUiStore'

export function useFtue({ selectTab }: {
  selectTab: (tab: MainTab) => void
}) {
  const playerStore = usePlayerStore()
  const { player, openedAcupointIds, companionAffinity, pillInventory } = storeToRefs(playerStore)
  const uiStore = useGameUiStore()
  const { jianghuTab, marketTab } = storeToRefs(uiStore)
  const { appendLog, showToast } = uiStore

  // 首日《江湖行历》：进度按现有系统状态推导，领取记录按角色本地保存
  interface FtueState { index: number; claimed: number[]; forageCount: number; refinedRecipeIds: string[] }
  const FTUE_KEY = (id: string) => `wuxia-ftue-${id}`
  const emptyFtue = (): FtueState => ({ index: 0, claimed: [], forageCount: 0, refinedRecipeIds: [] })
  function loadFtue(id: string): FtueState {
    if (IS_MOCK_MODE && !LOCAL_SAVE_ENABLED) return emptyFtue()
    try {
      const raw = localStorage.getItem(FTUE_KEY(id))
      if (!raw) return emptyFtue()
      const saved = JSON.parse(raw) as Partial<FtueState>
      return { ...emptyFtue(), ...saved, claimed: saved.claimed ?? [], refinedRecipeIds: saved.refinedRecipeIds ?? [] }
    } catch {
      return emptyFtue()
    }
  }
  const ftue = ref<FtueState>(loadFtue(player.value.id))
  function saveFtue() {
    if (IS_MOCK_MODE && !LOCAL_SAVE_ENABLED) return
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(FTUE_KEY(player.value.id), JSON.stringify(ftue.value))
    } catch {
      // 仍可在当前会话中继续江湖行历。
    }
  }
  watch(() => player.value.id, (id) => { ftue.value = loadFtue(id) }, { flush: 'sync' })

  const ftueQuest = computed(() => FTUE_QUESTS[ftue.value.index] ?? null)

  function ftueProgressOf(quest: FtueQuestConfig): number {
    switch (quest.targetType) {
      case 'STORY':
        return player.value.trial.rewardedStageIds.includes(Number(quest.targetValue)) ? 1 : 0
      case 'PIERCE':
        return openedAcupointIds.value.includes(String(quest.targetValue)) ? 1 : 0
      case 'PIERCE_ALL':
        return HAND_THREE_YANG.every((id) => openedAcupointIds.value.includes(id)) ? 1 : 0
      case 'COMPANION': {
        const state = companionAffinity.value[String(quest.targetValue)]
        return state?.recruited && state.affinity >= 100 ? 1 : 0
      }
      case 'FORAGE':
        return ftue.value.forageCount >= 1 ? 1 : 0
      case 'REFINE':
        return ftue.value.refinedRecipeIds.includes(String(quest.targetValue)) ? 1 : 0
      case 'BREAKTHROUGH':
        return player.value.realmTier >= Number(quest.targetValue) ? 1 : 0
      case 'SECT':
        return player.value.currentSectId ? 1 : 0
    }
  }

  const ftueReady = computed(() => {
    const quest = ftueQuest.value
    return !!quest && ftueProgressOf(quest) >= 1
  })

  function claimFtueReward() {
    const quest = ftueQuest.value
    if (!quest || ftueProgressOf(quest) < 1) return
    const silver = gaibangSilverGain(player.value, quest.rewardSilver)
    player.value.qiExp += quest.rewardQi
    player.value.silver += silver
    if (quest.rewardPillId) {
      pillInventory.value[quest.rewardPillId] = (pillInventory.value[quest.rewardPillId] ?? 0) + 1
    }
    ftue.value.claimed.push(quest.id)
    ftue.value.index = Math.min(FTUE_QUESTS.length, ftue.value.index + 1)
    saveFtue()
    appendLog('JIANGHU', [
      { type: 'tag', text: '江湖行历', tone: 'gold' },
      { type: 'text', text: ` 达成「${quest.title}」，领得真气 ${quest.rewardQi.toLocaleString()}、纹银 ${silver.toLocaleString()}${quest.rewardPillId ? '，并获赠一枚丹药' : ''}。` },
    ])
    showToast(`行历达成：${quest.title}`, 'gold')
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
    saveFtue,
    emptyFtue,
    ftueQuest,
    ftueReady,
    ftueProgressOf,
    claimFtueReward,
    gotoFtueTarget,
  }
}
