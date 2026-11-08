<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import type { TierColor } from '@/network/protocol'

const store = useGameStore()
const filterChannel = ref<'ALL' | 'CULTIVATE' | 'BATTLE' | 'ADVENTURE'>('ALL')

const filterTabs = [
  { k: 'ALL', l: '全部纪事' },
  { k: 'CULTIVATE', l: '吐纳修行' },
  { k: 'BATTLE', l: '刀剑战报' },
  { k: 'ADVENTURE', l: '奇遇传功' },
] as const

const filteredLogs = computed(() => {
  if (store.activeBattle) {
    return store.logs.filter((l) => l.channel === 'BATTLE' || l.channel === 'ADVENTURE')
  }
  if (filterChannel.value === 'ALL') return store.logs
  return store.logs.filter(
    (l) => l.channel === filterChannel.value || (filterChannel.value === 'CULTIVATE' && l.channel === 'JIANGHU')
  )
})

/** 收敛五彩词条：仅绝品/神品呈现暗金或朱砂，其余保持素雅墨色带虚线下划线 */
function tierTextClass(tier: TierColor) {
  if (tier === 'red') return 'ink-cinnabar border-[var(--accent-cinnabar)]/50 font-bold'
  if (tier === 'orange') return 'ink-gold border-[var(--border-gold)] font-semibold'
  return 'text-[var(--text-ink)] border-[var(--border-ink)]'
}

function tagClass(tone: 'gold' | 'red' | 'jade' | 'purple') {
  if (tone === 'red') return 'ink-cinnabar border-[var(--accent-cinnabar)]/40'
  if (tone === 'gold') return 'ink-gold border-[var(--border-gold-subtle)]'
  return 'ink-muted border-[var(--border-ink)]'
}
</script>

<template>
  <div class="wuxia-card p-3 flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
    <!-- 待抉择江湖奇遇（克制左线引导，去除杂色图标） -->
    <div
      v-if="store.pendingAdventure && !store.activeBattle"
      class="wuxia-elevated p-2.5 border-l-2 border-l-[var(--border-gold)] space-y-2 shrink-0"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-[11px] tab-gold px-1.5 py-0.2 font-bold">奇遇</span>
          <span class="font-bold text-sm">{{ store.pendingAdventure.title }}</span>
        </div>
        <span class="text-xs ink-muted">{{ store.pendingAdventure.location }}</span>
      </div>
      <p class="text-xs leading-relaxed ink-muted">
        {{ store.pendingAdventure.description }}
      </p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="opt in store.pendingAdventure.options"
          :key="opt.key"
          @click="store.resolveAdventure(opt.key)"
          class="token-btn text-left px-2.5 py-1.5 cursor-pointer"
        >
          <div class="text-xs font-semibold">
            抉择{{ opt.key === 'A' ? '甲' : '乙' }} · {{ opt.label }}
          </div>
          <div v-if="opt.requirementText" class="text-[11px] ink-gold mt-0.5">
            {{ opt.requirementText }}
          </div>
        </button>
      </div>
    </div>

    <!-- 日志筛选栏 -->
    <div class="flex items-center justify-between border-b border-[var(--border-ink)] pb-1.5 shrink-0">
      <div class="flex items-center gap-1.5 text-xs">
        <template v-if="store.activeBattle">
          <span class="font-bold ink-gold">演武招式拆解实录</span>
        </template>
        <template v-else>
          <button
            v-for="tab in filterTabs"
            :key="tab.k"
            @click="filterChannel = tab.k"
            class="px-2.5 py-0.5 transition cursor-pointer"
            :class="filterChannel === tab.k ? 'tab-gold font-bold' : 'ink-muted hover:text-[var(--text-ink)]'"
          >
            {{ tab.l }}
          </button>
        </template>
      </div>

      <button
        v-if="!store.activeBattle"
        @click="store.triggerRandomAdventure()"
        class="token-btn text-xs px-2.5 py-0.5 ink-gold cursor-pointer"
      >
        游历寻访机缘
      </button>
    </div>

    <!-- 干净通透的江湖纪事流（去除背景竖条纹与五彩斑斓底块） -->
    <div class="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
      <div
        v-for="entry in filteredLogs"
        :key="entry.id"
        class="text-[13px] leading-6 border-b border-[var(--border-subtle)] pb-1"
      >
        <span class="text-[11px] ink-muted mr-2 tabular-nums">{{ entry.timeLabel }}</span>
        <template v-for="(seg, idx) in entry.segments" :key="idx">
          <span v-if="seg.type === 'text'">{{ seg.text }}</span>

          <span
            v-else-if="seg.type === 'tag'"
            class="inline-block text-[11px] px-1.5 py-0 border mx-0.5 leading-snug"
            :class="tagClass(seg.tone)"
          >
            {{ seg.text }}
          </span>

          <span
            v-else-if="seg.type === 'actor'"
            class="font-bold mx-0.5"
            :class="seg.isAlly ? 'text-[var(--text-ink)]' : 'ink-cinnabar'"
          >
            「{{ seg.name }}」
          </span>

          <button
            v-else-if="seg.type === 'skill'"
            @click="store.inspectById('skill', seg.id)"
            class="inline-block mx-0.5 border-b border-dashed hover:text-[var(--accent-gold)] cursor-pointer transition"
            :class="tierTextClass(seg.tier)"
            title="点击查看武学详情"
          >
            {{ seg.name }}
          </button>

          <button
            v-else-if="seg.type === 'item'"
            @click="store.inspectById('item', seg.id)"
            class="inline-block mx-0.5 border-b border-dashed hover:text-[var(--accent-gold)] cursor-pointer transition"
            :class="tierTextClass(seg.tier)"
            title="点击查看器物详情"
          >
            {{ seg.name }}
          </button>

          <span
            v-else-if="seg.type === 'damage'"
            class="font-bold tabular-nums mx-0.5"
            :class="seg.isCrit || seg.category === 'qi' ? 'ink-gold' : 'ink-cinnabar'"
          >
            {{ seg.isCrit ? '暴击 ' : '' }}-{{ seg.value.toLocaleString() }}
            <span class="text-[11px] font-normal ink-muted">
              ({{ seg.category === 'qi' ? '内劲' : seg.category === 'reflect' ? '反震' : '外功' }})
            </span>
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
