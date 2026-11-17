<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { FTUE_TOTAL, FTUE_VOLUMES } from '../../../shared/ftueQuests.ts'
import { featureRequirementText } from '../../../shared/features.ts'

const store = useGameStore()
const quest = computed(() => store.ftueQuest)
const done = computed(() => !!quest.value && store.ftueProgressOf(quest.value) >= 1)
const claimed = computed(() => store.ftue.claimed.length)
/** 新角色才有：下一项随剧情开放的玩法 */
const upcoming = computed(() => store.upcomingFeature && {
  name: store.upcomingFeature.name, when: featureRequirementText(store.upcomingFeature.id),
})
</script>

<template>
  <article v-if="quest" class="well quest-card mb-2 space-y-2 p-3">
    <div class="flex items-center justify-between gap-2">
      <span class="chip chip-gold">江湖行历 · {{ FTUE_VOLUMES[quest.volume] }}</span>
      <span class="text-[0.7rem] tabular-nums text-ink3">{{ Math.min(claimed + 1, FTUE_TOTAL) }} / {{ FTUE_TOTAL }}</span>
    </div>
    <div>
      <h4 class="font-brush text-lg leading-tight">{{ quest.title }}</h4>
      <p class="text-sm">{{ quest.subtitle }}</p>
    </div>
    <p class="hint"><b class="text-ink2">{{ quest.speaker }}</b>「{{ quest.line }}」</p>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-[0.7rem] tabular-nums text-ink3">
        真气 +{{ quest.rewardQi.toLocaleString() }} · 纹银 +{{ quest.rewardSilver.toLocaleString() }}{{ quest.rewardPillId ? ' · 丹药 1 枚' : '' }}
      </span>
      <button v-if="done" class="btn btn-sm btn-seal" @click="store.claimFtueReward()">领赏</button>
      <button v-else class="btn btn-sm btn-gold" @click="store.gotoFtueTarget()">前往</button>
    </div>
    <p v-if="upcoming" class="border-t border-line pt-1.5 text-[0.72rem] leading-snug text-ink3">
      下一个机缘 · <b class="text-ink2">{{ upcoming.name }}</b>：{{ upcoming.when }}后开放
    </p>
  </article>
  <article v-else class="well mb-2 space-y-1 p-3">
    <span class="chip chip-jade">江湖行历 · 已圆满</span>
    <p class="hint">两卷行历都已走完。江湖路远，往后的路自己闯。</p>
    <p v-if="upcoming" class="text-[0.72rem] text-ink3">下一个机缘 · <b class="text-ink2">{{ upcoming.name }}</b>：{{ upcoming.when }}后开放</p>
  </article>
</template>
