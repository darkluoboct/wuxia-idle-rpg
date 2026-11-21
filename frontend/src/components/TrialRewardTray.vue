<script setup lang="ts">
import { computed } from 'vue'
import { trialPartId, type TrialStageConfig } from '../../../shared/trialStages.ts'
import RewardTray from './RewardTray.vue'

const props = defineProps<{ stage: TrialStageConfig; answer?: string | null }>()
const items = computed(() => {
  const ids = props.stage.firstClearParts.map((slot) => trialPartId(props.stage.setId, slot))
  if (props.stage.clearItemId && (!props.stage.clearItemRequiresPuzzle || props.stage.puzzle?.answer === props.answer)) ids.push(props.stage.clearItemId)
  return ids
})
</script>

<template><RewardTray label="首胜掉落" :source="stage.title" :rewards="{ items }" :skills="stage.clearSkillId ? [stage.clearSkillId] : []" /></template>
