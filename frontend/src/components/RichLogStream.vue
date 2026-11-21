<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import RichLogSegments from './RichLogSegments.vue'
import type { GameLogEntry } from '@/network/protocol'

const store = useGameStore()
type Filter = 'ALL' | GameLogEntry['channel']
const filter = ref<Filter>('ALL')
const tabs = [
  { key: 'ALL', label: '全部' },
  { key: 'BATTLE', label: '战斗' },
  { key: 'ADVENTURE', label: '奇遇' },
  { key: 'CULTIVATE', label: '收益' },
] as const

const list = ref<HTMLOListElement>()
watch(filter, () => { if (list.value) list.value.scrollTop = 0 })
watch(() => store.activeBattle?.battleId, (id) => { if (id) filter.value = 'BATTLE' }, { immediate: true })
const filteredLogs = computed(() => store.logs.filter((entry) => filter.value === 'ALL' || entry.channel === filter.value))
</script>

<template>
  <section class="world-logs" aria-label="系统日志">
    <div class="rail-tabs log-tabs" role="tablist" aria-label="纪事筛选">
      <button v-for="tab in tabs" :key="tab.key" role="tab" :aria-selected="filter === tab.key" @click="filter = tab.key">{{ tab.label }}</button>
    </div>

    <ol ref="list" class="log-entries">
      <li v-if="!filteredLogs.length" class="log-empty">暂无此类消息。</li>
      <li v-for="entry in filteredLogs" :key="entry.id" class="log-entry">
        <span v-if="entry.round" class="log-time" :title="`第 ${entry.round} 回合`">{{ entry.round }}回</span>
        <span v-else class="log-time" :title="entry.timeLabel">{{ entry.timeLabel.split('·')[0] }}</span>
        <p>
          <RichLogSegments :segments="entry.segments" @inspect="store.inspectById" />
        </p>
      </li>
    </ol>
  </section>
</template>
