<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const doneCount = computed(() => store.daily.tasks.filter(({ done }) => done).length)
const ready = computed(() => !store.daily.claimed && doneCount.value === store.daily.tasks.length)
</script>

<template>
  <article class="well mb-2 space-y-2 p-3">
    <div class="flex items-center justify-between gap-2">
      <span class="chip chip-gold">每日江湖事</span>
      <span class="text-[0.7rem] tabular-nums text-ink3">{{ doneCount }} / {{ store.daily.tasks.length }} · 子时刷新</span>
    </div>
    <ul class="grid grid-cols-2 gap-1 text-xs">
      <li v-for="task in store.daily.tasks" :key="task.id" class="truncate" :class="task.done ? 'text-jade' : 'text-ink3'">
        {{ task.done ? '✓' : '·' }} {{ task.label }}
      </li>
    </ul>
    <div class="flex items-center justify-between gap-2">
      <span class="min-w-0 text-[0.7rem] tabular-nums text-ink3">
        元宝 +{{ store.daily.reward }}
        <template v-if="store.daily.ticket === 'OPEN'"> · 领赏另得鬼市红封签</template>
        <span v-else-if="store.daily.ticket === 'HELD'" class="text-gold"> · 已持今日红封签</span>
      </span>
      <span v-if="store.daily.claimed" class="chip chip-jade shrink-0">今日已领</span>
      <button v-else class="btn btn-sm shrink-0" :class="ready ? 'btn-seal' : ''" :disabled="!ready" @click="store.claimDailyIngot()">领赏</button>
    </div>
  </article>
</template>
