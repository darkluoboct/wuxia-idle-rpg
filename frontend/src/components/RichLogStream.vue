<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { TIER_META } from '@/config/uiMeta'
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
const DMG_LABEL = { phys: '外功', qi: '内力', poison: '毒伤', reflect: '反伤', heal: '疗伤' } as const
</script>

<template>
  <section class="world-logs" aria-label="系统日志">
    <h2 class="rail-heading"><span>系统日志</span></h2>
    <div class="rail-tabs log-tabs" role="tablist" aria-label="纪事筛选">
      <button v-for="tab in tabs" :key="tab.key" role="tab" :aria-selected="filter === tab.key" @click="filter = tab.key">{{ tab.label }}</button>
    </div>

    <ol ref="list" class="log-entries">
      <li v-if="!filteredLogs.length" class="log-empty">暂无此类消息。</li>
      <li v-for="entry in filteredLogs" :key="entry.id" class="log-entry">
        <span class="log-time" :title="entry.timeLabel">[{{ entry.timeLabel.split('·')[0] }}]</span>
        <p>
          <template v-for="(seg, idx) in entry.segments" :key="idx">
            <span v-if="seg.type === 'text'">{{ seg.text }}</span>
            <span v-else-if="seg.type === 'tag'" class="log-tag" :data-tone="seg.tone">【{{ seg.text }}】</span>
            <b v-else-if="seg.type === 'actor'" :class="seg.isAlly ? 'text-jade' : 'text-cinnabar'">「{{ seg.name }}」</b>
            <button
              v-else-if="seg.type === 'skill' || seg.type === 'item'"
              class="log-item tier-text" :class="TIER_META[seg.tier].cls"
              :title="`${TIER_META[seg.tier].label} · 点击查看详情`" @click="store.inspectById(seg.type, seg.id)"
            >{{ seg.name }}</button>
            <b
              v-else-if="seg.type === 'damage'" class="tabular-nums"
              :class="seg.category === 'heal' ? 'text-jade' : seg.isCrit || seg.category === 'qi' ? 'text-gold' : 'text-cinnabar'"
            >
              {{ seg.isCrit ? '暴击 ' : '' }}{{ seg.category === 'heal' ? '+' : '-' }}{{ seg.value.toLocaleString() }}
              <small>({{ DMG_LABEL[seg.category] }})</small>
            </b>
          </template>
        </p>
      </li>
    </ol>
  </section>
</template>
