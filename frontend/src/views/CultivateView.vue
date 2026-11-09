<script setup lang="ts">
import { useGameStore } from '@/stores/gameStore'
import StageHeaderArena from '@/components/StageHeaderArena.vue'
import CultivateConsole from '@/components/CultivateConsole.vue'
import RichLogStream from '@/components/RichLogStream.vue'

const store = useGameStore()
</script>

<template>
  <div class="view">
    <StageHeaderArena />
    <CultivateConsole v-if="!store.activeBattle" />
    <RichLogStream />
  </div>
</template>
