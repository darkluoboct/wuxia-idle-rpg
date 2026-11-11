<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { FTUE_TOTAL } from '../../../shared/ftueQuests.ts'

const store = useGameStore()
const quest = computed(() => store.ftueQuest)
const done = computed(() => !!quest.value && store.ftueProgressOf(quest.value) >= 1)
const indexLabel = computed(() => quest.value ? `${store.ftue.index + 1} / ${FTUE_TOTAL}` : `${FTUE_TOTAL} / ${FTUE_TOTAL}`)
</script>

<template>
  <article v-if="quest" class="well quest-card mb-2 space-y-2 p-3">
    <div class="flex items-center justify-between gap-2">
      <span class="chip chip-gold">江湖行历 · 卷一</span>
      <span class="text-[0.7rem] tabular-nums text-ink3">{{ indexLabel }}</span>
    </div>
    <div>
      <h4 class="font-brush text-lg leading-tight">{{ quest.title }}</h4>
      <p class="text-sm">{{ quest.subtitle }}</p>
    </div>
    <p class="hint">{{ quest.desc }}</p>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-[0.7rem] tabular-nums text-ink3">
        真气 +{{ quest.rewardQi.toLocaleString() }} · 纹银 +{{ quest.rewardSilver.toLocaleString() }}
      </span>
      <button v-if="done" class="btn btn-sm btn-seal" @click="store.claimFtueReward()">领赏</button>
      <button v-else class="btn btn-sm btn-gold" @click="store.gotoFtueTarget()">前往寻缘</button>
    </div>
  </article>
  <article v-else class="well mb-2 space-y-1 p-3">
    <span class="chip chip-jade">江湖行历 · 已圆满</span>
    <p class="hint">十阶行历全部达成，江湖路远，好自为之。</p>
  </article>
</template>
