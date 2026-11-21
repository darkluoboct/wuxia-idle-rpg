<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COOP_RAIDS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { gaibangSilverGain } from '../../../shared/gaibang.ts'
import RewardTray from './RewardTray.vue'

const store = useGameStore()
const raid = computed(() => COOP_RAIDS[IS_MOCK_MODE ? 'shaoshi' : store.selectedRaidId])
const rewards = computed(() => {
  const relic = IS_MOCK_MODE ? store.nextRaidRelic : raid.value.relics[store.selectedRaidClears]
  const bonus = !IS_MOCK_MODE && store.selectedRaidClears === 0 ? raid.value.firstClearBonus : undefined
  return {
    qiExp: raid.value.rewardQi + (bonus?.qiExp ?? 0),
    silver: gaibangSilverGain(store.player, raid.value.rewardSilver + (bonus?.silver ?? 0)),
    items: relic && !store.ownedItemIds.includes(relic.id) ? [relic.id] : [],
  }
})
</script>

<template><RewardTray label="下次通关可得" :source="raid.title" :rewards="rewards" /></template>
