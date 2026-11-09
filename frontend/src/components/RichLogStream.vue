<script setup lang="ts">
/**
 * 江湖纪事流：左侧时间轴 + 结构化富文本（词条可点开鉴赏，五色品阶皆有呈现）。
 * 新消息从顶部滑入并短暂泛金，方便挂机回来一眼看到“刚发生了什么”。
 * 待抉择的奇遇以展开的卷轴置于时间轴最上方（随列表一起滚动，不再占死一块固定高度）。
 */
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { TIER_META } from '@/config/uiMeta'
import type { GameLogEntry } from '@/network/protocol'

const store = useGameStore()
type Filter = 'ALL' | 'CULTIVATE' | 'BATTLE' | 'ADVENTURE'
const filter = ref<Filter>('ALL')

const tabs: { k: Filter; l: string }[] = [
  { k: 'ALL', l: '全部' },
  { k: 'CULTIVATE', l: '吐纳' },
  { k: 'BATTLE', l: '战报' },
  { k: 'ADVENTURE', l: '奇遇' },
]

const matches = (l: GameLogEntry, f: Filter) =>
  f === 'ALL' || l.channel === f || (f === 'CULTIVATE' && l.channel === 'JIANGHU')

const filteredLogs = computed(() => {
  if (store.activeBattle) return store.logs.filter((l) => l.channel === 'BATTLE' || l.channel === 'ADVENTURE')
  return store.logs.filter((l) => matches(l, filter.value))
})
const countOf = (f: Filter) => store.logs.filter((l) => matches(l, f)).length

const CHANNEL_DOT: Record<GameLogEntry['channel'], string> = {
  CULTIVATE: 'bg-jade',
  BATTLE: 'bg-seal',
  ADVENTURE: 'bg-goldfill',
  JIANGHU: 'bg-ink3',
}

/** 刚生成（2.5 秒内）的条目才播入场动画 */
function isFresh(e: GameLogEntry) {
  const t = Number(e.id.split('_')[1])
  return Number.isFinite(t) && Date.now() - t < 2500
}

function tagClass(tone: 'gold' | 'red' | 'jade' | 'purple') {
  return tone === 'gold' ? 'chip-gold' : tone === 'red' ? 'chip-red' : tone === 'jade' ? 'chip-jade' : 'chip-purple'
}

const DMG_LABEL = { phys: '外功', qi: '内劲', poison: '毒伤', reflect: '反震', heal: '疗伤' } as const
</script>

<template>
  <section class="panel flex flex-col gap-2 p-3 md:min-h-[14rem] md:flex-1 md:p-4">
    <!-- 筛选 -->
    <div class="flex shrink-0 items-center justify-between gap-2">
      <div v-if="store.activeBattle" class="sec-title flex-1">演武招式拆解实录</div>
      <div v-else class="tabs flex-1 border-b-0" role="tablist" aria-label="纪事筛选">
        <button v-for="t in tabs" :key="t.k" class="tab !px-3" role="tab" :aria-selected="filter === t.k" @click="filter = t.k">
          {{ t.l }}<span class="ml-1 text-xs tabular-nums opacity-60">{{ countOf(t.k) }}</span>
        </button>
      </div>
      <button v-if="!store.activeBattle" class="btn btn-sm shrink-0 !text-gold" @click="store.triggerRandomAdventure()">游历寻访机缘</button>
    </div>

    <div class="border-t border-line md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
      <!-- 待抉择奇遇：展开的竹简卷轴 -->
      <div
        v-if="store.pendingAdventure && !store.activeBattle"
        class="relative mx-1 my-3 border border-line bg-raised"
        style="background-image: linear-gradient(180deg, var(--gold-soft), transparent 45%)"
      >
        <div class="absolute inset-x-[-0.35rem] -top-[0.3rem] h-[0.45rem] rounded-full bg-gradient-to-b from-goldfill to-[color-mix(in_srgb,var(--gold)_55%,#000)]" />
        <div class="absolute inset-x-[-0.35rem] -bottom-[0.3rem] h-[0.45rem] rounded-full bg-gradient-to-b from-goldfill to-[color-mix(in_srgb,var(--gold)_55%,#000)]" />

        <div class="space-y-2.5 px-3.5 py-3.5">
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div class="flex items-center gap-2.5">
              <span class="seal h-7 w-7 text-base">遇</span>
              <h4 class="font-brush text-xl leading-none">{{ store.pendingAdventure.title }}</h4>
            </div>
            <span class="text-xs text-ink3">{{ store.pendingAdventure.location }}</span>
          </div>
          <p class="text-sm leading-relaxed text-ink2">{{ store.pendingAdventure.description }}</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="opt in store.pendingAdventure.options" :key="opt.key" class="well well-hover group px-3 py-2.5 text-left"
              :disabled="!opt.canSelect" @click="store.resolveAdventure(opt.key)"
            >
              <div class="flex items-start gap-2">
                <span class="seal-gold seal mt-0.5 h-5 w-5 text-xs">{{ opt.key === 'A' ? '甲' : '乙' }}</span>
                <div class="min-w-0">
                  <div class="text-sm font-semibold leading-snug group-hover:text-gold">{{ opt.label }}</div>
                  <div v-if="opt.requirementText" class="mt-0.5 text-xs text-gold">{{ opt.requirementText }}</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- 时间轴 -->
      <ol class="relative">
        <li v-if="!filteredLogs.length" class="py-8 text-center text-sm text-ink3">江湖暂无此类消息，去游历一番吧。</li>
        <li
          v-for="entry in filteredLogs" :key="entry.id" class="relative border-b border-line py-2.5 pl-6 last:border-b-0"
          :class="isFresh(entry) ? 'anim-log-in' : ''"
        >
          <span class="absolute bottom-0 left-[0.4rem] top-0 w-px bg-linestrong opacity-60" />
          <span class="absolute left-[0.18rem] top-[1.05rem] h-[0.5rem] w-[0.5rem] rotate-45" :class="CHANNEL_DOT[entry.channel]" />

          <div class="mb-0.5 text-xs tabular-nums text-ink3">{{ entry.timeLabel }}</div>
          <p class="text-[0.9375rem] leading-[1.85]">
            <template v-for="(seg, idx) in entry.segments" :key="idx">
              <span v-if="seg.type === 'text'">{{ seg.text }}</span>

              <span v-else-if="seg.type === 'tag'" class="chip mx-0.5 align-[0.1em]" :class="tagClass(seg.tone)">{{ seg.text }}</span>

              <span v-else-if="seg.type === 'actor'" class="mx-0.5 font-bold" :class="seg.isAlly ? '' : 'text-cinnabar'">「{{ seg.name }}」</span>

              <button
                v-else-if="seg.type === 'skill' || seg.type === 'item'"
                class="tier-text mx-0.5 border-b border-dashed border-[var(--tc)] font-semibold transition-opacity hover:opacity-75"
                :class="[TIER_META[seg.tier].cls, seg.type === 'item' && seg.isTrueUnique ? 'glow-border px-1' : '']"
                :title="`${TIER_META[seg.tier].label} · 点击查看详情`" @click="store.inspectById(seg.type, seg.id)"
              >
                {{ seg.name }}
              </button>

              <span
                v-else-if="seg.type === 'damage'" class="mx-0.5 font-bold tabular-nums"
                :class="seg.category === 'heal' ? 'text-jade' : seg.isCrit || seg.category === 'qi' ? 'text-gold' : 'text-cinnabar'"
              >
                {{ seg.isCrit ? '暴击 ' : '' }}{{ seg.category === 'heal' ? '+' : '-' }}{{ seg.value.toLocaleString() }}
                <span class="text-xs font-normal text-ink3">({{ DMG_LABEL[seg.category] }})</span>
              </span>
            </template>
          </p>
        </li>
      </ol>
    </div>
  </section>
</template>
