import { computed } from 'vue'
import { ACUPOINTS } from '@/config/gameData'
import type { useGameStore } from '@/stores/gameStore'
import { nextCultivationRealm } from '../../../shared/player.ts'

export function useGrowthReadiness(store: ReturnType<typeof useGameStore>) {
  const nextRealm = computed(() => nextCultivationRealm(store.player.realmTier))
  const atCap = computed(() => store.player.level >= store.currentRealm.maxLevel)
  const canLevel = computed(() => !atCap.value && store.player.qiExp >= store.player.nextLevelQi)
  const missingPoint = computed(() => ACUPOINTS.find((point) => point.realmTier === store.player.realmTier && !store.openedAcupointIds.includes(point.id)))
  const canBreak = computed(() => !!nextRealm.value && atCap.value && !missingPoint.value)
  return { nextRealm, atCap, canLevel, missingPoint, canBreak }
}
