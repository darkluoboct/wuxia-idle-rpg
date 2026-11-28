import { computed, ref, watch } from 'vue'
import { ACUPOINTS, ITEMS } from '@/config/gameData'
import type { MainTab, useGameStore } from '@/stores/gameStore'
import { acupointCost, canOpenAcupoint } from '../../../shared/player.ts'
import { IDLE_CAP_MS } from '../../../shared/trialStages.ts'
import { useGrowthReadiness } from './useGrowthReadiness'

export function useNavBadges(store: ReturnType<typeof useGameStore>) {
  const { canBreak, canLevel } = useGrowthReadiness(store)
  const unreadGear = ref(false)
  const inBag = computed(() => store.activeTab === 'ARSENAL' && store.arsenalTab === 'BAG')

  watch(() => [store.player.id, [...store.ownedItemIds]] as const, ([id, items], [previousId, previousItems]) => {
    if (id !== previousId || inBag.value) { unreadGear.value = false; return }
    const previous = new Set(previousItems)
    if (items.some((item) => !previous.has(item) && ['purple', 'orange', 'red'].includes(ITEMS[item]?.tier))) unreadGear.value = true
  })
  watch(inBag, (reading) => { if (reading) unreadGear.value = false })

  return computed<Partial<Record<MainTab, string>>>(() => {
    const player = store.player
    const cultivation = canBreak.value ? '可以突破境界' : canLevel.value ? '可以升级'
      : !player.idleOff && store.worldTime - player.lastSettleAt >= IDLE_CAP_MS ? '挂机收益已满' : undefined
    const readyPoint = store.arsenalTabOpen('MERIDIAN') && ACUPOINTS.some((point) => point.realmTier === player.realmTier
      && !store.openedAcupointIds.includes(point.id) && canOpenAcupoint(point, store.openedAcupointIds)
      && player.qiExp >= acupointCost(point.costQi, store.martialStats.intStat))
    const auction = store.auctionBoard
    const outbid = auction && auction.lot.closesAt > store.worldTime && !auction.lot.leading && auction.history.some((bid) => bid.self)
    return {
      CULTIVATE: cultivation,
      JIANGHU: store.ftueReady || (!store.daily.claimed && store.daily.tasks.every(({ done }) => done)) ? '有待领取的赏赐'
        : store.pendingAdventure || store.adventureQueue.length ? '有待处理的奇遇' : undefined,
      ARSENAL: unreadGear.value ? '有新装备' : readyPoint ? '可以冲穴' : undefined,
      SECT: store.canPromoteSect && !store.sectPromotionBlockReason ? '可以参加晋升考核'
        : store.hasUnclaimedSectRewards || store.mayReceiveSnakeRecipe ? '有待领取的门派奖励'
          : store.canSaluteSect ? '今日可向首席请安' : undefined,
      MARKET: auction?.wins.length ? '有待领取的拍品' : outbid ? '竞拍出价已被超过' : undefined,
    }
  })
}
