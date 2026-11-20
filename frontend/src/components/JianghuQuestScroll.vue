<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { FTUE_TOTAL, FTUE_VOLUMES } from '../../../shared/ftueQuests.ts'
import { featureRequirementText } from '../../../shared/features.ts'

const store = useGameStore()
defineEmits<{ open: [] }>()
const quest = computed(() => store.ftueQuest)
const done = computed(() => !!quest.value && store.ftueProgressOf(quest.value) >= 1)
const claimed = computed(() => store.ftue.claimed.length)
/** 新角色才有：下一项随剧情开放的玩法 */
const upcoming = computed(() => store.upcomingFeature && {
  name: store.upcomingFeature.name, when: featureRequirementText(store.upcomingFeature.id),
})
</script>

<template>
  <article v-if="quest" class="well quest-card mb-2 space-y-1.5 px-3 py-2.5">
    <button class="flex w-full items-center gap-2 text-left" aria-haspopup="dialog" @click="$emit('open')">
      <span class="chip chip-gold shrink-0">江湖行历 · {{ FTUE_VOLUMES[quest.volume] }}</span>
      <span class="ml-auto text-[0.75rem] tabular-nums text-ink3">{{ Math.min(claimed + 1, FTUE_TOTAL) }} / {{ FTUE_TOTAL }}</span>
      <ChevronRight :size="14" class="shrink-0 text-ink3" aria-hidden="true" />
    </button>
    <div class="min-w-0">
      <h4 class="font-brush truncate text-lg leading-tight">{{ quest.title }}</h4>
      <p class="truncate text-sm" :title="quest.subtitle">{{ quest.subtitle }}</p>
    </div>
    <div class="flex items-center justify-between gap-2">
      <span class="min-w-0 truncate text-[0.75rem] tabular-nums text-ink3">
        真气 +{{ quest.rewardQi.toLocaleString() }} · 纹银 +{{ quest.rewardSilver.toLocaleString() }}{{ quest.rewardPillId ? ' · 丹药 1 枚' : '' }}
      </span>
      <button v-if="done" class="btn btn-sm btn-seal shrink-0" @click="store.claimFtueReward()">领赏</button>
      <button v-else class="btn btn-sm btn-gold shrink-0" @click="store.gotoFtueTarget()">前往</button>
    </div>
  </article>
  <article v-else class="well mb-2 space-y-1 px-3 py-2.5">
    <span class="chip chip-jade">江湖行历 · 已圆满</span>
    <p v-if="upcoming" class="text-[0.75rem] text-ink3">下一个机缘 · <b class="text-ink2">{{ upcoming.name }}</b>：{{ upcoming.when }}后开放</p>
    <p v-else class="hint">两卷行历都已走完。江湖路远，往后的路自己闯。</p>
  </article>
</template>
