<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const doneCount = computed(() => store.daily.tasks.filter(({ done }) => done).length)
const ready = computed(() => !store.daily.claimed && doneCount.value === store.daily.tasks.length)
/** 平时只占一行：进度与领赏；点开看四件事和奖励 */
const expanded = ref(false)
</script>

<template>
  <article class="well mb-2 space-y-2 px-3 py-2">
    <div class="flex items-center gap-2">
      <button class="flex min-w-0 flex-1 items-center gap-2 text-left" :aria-expanded="expanded" aria-controls="daily-more" @click="expanded = !expanded">
        <span class="chip chip-gold shrink-0">每日江湖事</span>
        <span class="flex shrink-0 gap-0.5" aria-hidden="true">
          <i v-for="task in store.daily.tasks" :key="task.id" class="h-1.5 w-3 rounded-sm" :class="task.done ? 'bg-[var(--jade)]' : 'bg-[var(--line-strong)]'" />
        </span>
        <span class="truncate text-[0.7rem] tabular-nums text-ink3" title="子时（23:00）刷新">{{ doneCount }}/{{ store.daily.tasks.length }}</span>
        <ChevronDown :size="14" class="ml-auto shrink-0 text-ink3 transition-transform" :class="{ 'rotate-180': expanded }" aria-hidden="true" />
      </button>
      <span v-if="store.daily.claimed" class="chip chip-jade shrink-0">已领</span>
      <button v-else class="btn btn-sm shrink-0" :class="ready ? 'btn-seal' : ''" :disabled="!ready" @click="store.claimDailyIngot()">领赏</button>
    </div>
    <div v-if="expanded" id="daily-more" class="space-y-1.5">
      <ul class="grid grid-cols-2 gap-1 text-xs">
        <li v-for="task in store.daily.tasks" :key="task.id" class="truncate" :class="task.done ? 'text-jade' : 'text-ink3'">
          {{ task.done ? '✓' : '·' }} {{ task.label }}
        </li>
      </ul>
      <p class="text-[0.7rem] tabular-nums text-ink3">
        元宝 +{{ store.daily.reward }} · 子时刷新
        <template v-if="store.daily.ticket === 'OPEN'"> · 领赏另得鬼市红封签</template>
        <span v-else-if="store.daily.ticket === 'HELD'" class="text-gold"> · 已持今日红封签</span>
      </p>
    </div>
  </article>
</template>
