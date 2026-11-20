<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
defineEmits<{ open: [] }>()
const doneCount = computed(() => store.daily.tasks.filter(({ done }) => done).length)
const ready = computed(() => !store.daily.claimed && doneCount.value === store.daily.tasks.length)
</script>

<template>
  <article class="well mb-2 space-y-2 px-3 py-2">
    <div class="flex items-center gap-2">
      <button class="flex min-w-0 flex-1 items-center gap-2 text-left" aria-haspopup="dialog" @click="$emit('open')">
        <span class="chip chip-gold shrink-0">每日江湖事</span>
        <span class="flex shrink-0 gap-0.5" aria-hidden="true">
          <i v-for="task in store.daily.tasks" :key="task.id" class="h-1.5 w-3 rounded-sm" :class="task.done ? 'bg-[var(--jade)]' : 'bg-[var(--line-strong)]'" />
        </span>
        <span class="truncate text-[0.75rem] tabular-nums text-ink3" title="子时（23:00）刷新">{{ doneCount }}/{{ store.daily.tasks.length }}</span>
        <ChevronRight :size="14" class="ml-auto shrink-0 text-ink3" aria-hidden="true" />
      </button>
      <span v-if="store.daily.claimed" class="chip chip-jade shrink-0">已领</span>
      <button v-else class="btn btn-sm shrink-0" :class="ready ? 'btn-seal' : ''" :disabled="!ready" @click="store.claimDailyIngot()">领赏</button>
    </div>
  </article>
</template>
