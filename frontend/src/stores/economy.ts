import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { IS_MOCK_MODE } from '@/network/apiClient'
import type { GameActions } from '@/network/gameActions'
import {
  claimDailyIngot as claimDailyLocally,
  claimMilestoneIngots,
  DAILY_TASKS,
  dailyState,
  INGOT,
  ingotMilestones,
  type IngotMilestone,
  type MilestoneState,
} from '../../../shared/economy.ts'
import { featureUnlocked } from '../../../shared/features.ts'
import { usePlayerStore } from './playerStore'
import { useGameUiStore } from './gameUiStore'

/** 元宝产出（docs/19）：一次性里程碑与每日江湖事。联机由服务端发放，本地试玩按同一份规则发 */
export function useEconomy({ actions }: { actions: GameActions }) {
  const playerStore = usePlayerStore()
  const { player, claimedNodeIds, resolvedAdventureIds, companionAffinity, limitsEnabled, worldTime } = storeToRefs(playerStore)
  const uiStore = useGameUiStore()
  const { appendLog, showToast } = uiStore

  const milestoneState = (): MilestoneState => ({
    player: player.value, rewardedChapters: claimedNodeIds.value, adventureIds: resolvedAdventureIds.value, companionAffinity: companionAffinity.value,
  })

  function announceMilestones(granted: IngotMilestone[]) {
    if (!granted.length) return
    const total = granted.reduce((sum, { amount }) => sum + amount, 0)
    appendLog('JIANGHU', [
      { type: 'tag', text: '元宝入账', tone: 'gold' },
      { type: 'text', text: ` ${granted.map(({ label, amount }) => `${label} +${amount}`).join('，')}` },
    ])
    showToast(`元宝 +${total}`, 'gold')
  }

  if (IS_MOCK_MODE) {
    // 「新游戏」进度里一出现新的里程碑就当场入账；演武模式不发
    const pending = computed(() => {
      if (!limitsEnabled.value) return ''
      const claimed = new Set(player.value.ingotClaims ?? [])
      return ingotMilestones(milestoneState()).filter(({ key }) => !claimed.has(key)).map(({ key }) => key).join()
    })
    watch(pending, (keys) => {
      if (keys) announceMilestones(claimMilestoneIngots({ ...milestoneState(), player: player.value }))
    }, { flush: 'sync' })
  } else {
    // 服务端在同一次操作里发放；对比前后存档，把新领到的写进江湖纪事
    watch(() => [player.value.id, player.value.ingotClaims] as const, ([id, claims], [previousId, previous]) => {
      if (id !== previousId || !claims) return
      const before = new Set(previous ?? [])
      const fresh = new Set(claims.filter((key) => !before.has(key)))
      if (fresh.size) announceMilestones(ingotMilestones(milestoneState()).filter(({ key }) => fresh.has(key)))
    })
  }

  const daily = computed(() => {
    const state = dailyState(player.value, worldTime.value)
    return {
      tasks: DAILY_TASKS.map((task) => ({ ...task, done: state.done.includes(task.id) })),
      claimed: state.claimed,
      reward: INGOT.daily,
      // 鬼市红封签：当日领赏就有，什么时辰都算
      ticket: player.value.auctionTickets?.includes(state.day) ? 'HELD' as const
        : !state.claimed && featureUnlocked(player.value, 'GHOST') ? 'OPEN' as const : 'NONE' as const,
    }
  })

  function claimDailyIngot() {
    if (daily.value.claimed || daily.value.tasks.some(({ done }) => !done)) return
    return actions.run('dailyClaim', undefined, ({ ingot, ticket }) => {
      appendLog('JIANGHU', [{ type: 'tag', text: '每日江湖事', tone: 'gold' }, { type: 'text', text: ` 今日诸事办妥，领得 ${ingot} 元宝${ticket ? '，另得今日鬼市暗拍的红封签一枚' : ''}。` }])
      showToast(`每日江湖事：元宝 +${ingot}`, 'gold')
    }, () => {
      const result = claimDailyLocally(player.value, Date.now())
      return 'error' in result ? undefined : result
    })
  }

  return { daily, claimDailyIngot }
}
