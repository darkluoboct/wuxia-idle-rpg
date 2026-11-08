<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { EXPANSION_VOLUMES_PREVIEW, MAPS, STORY_CHAPTERS } from '@/config/gameData'
import { getStanceLabel } from '@/network/mockEngine'

const store = useGameStore()
const subView = ref<'STORY' | 'MAPS' | 'RAID'>('STORY')
</script>

<template>
  <div class="wuxia-card p-3.5 h-full min-h-0 flex flex-col gap-3 overflow-hidden">
    <!-- 顶部子导航 -->
    <div class="flex items-center justify-between border-b border-[var(--border-ink)] pb-2 shrink-0">
      <div class="flex items-center gap-1.5 text-xs">
        <button
          @click="subView = 'STORY'"
          class="px-3 py-1 cursor-pointer transition"
          :class="subView === 'STORY' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
        >
          第一卷 · 射雕主线
        </button>
        <button
          @click="subView = 'MAPS'"
          class="px-3 py-1 cursor-pointer transition"
          :class="subView === 'MAPS' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
        >
          九州舆图
        </button>
        <button
          @click="subView = 'RAID'"
          class="px-3 py-1 cursor-pointer transition"
          :class="subView === 'RAID' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
        >
          松鹤楼结义与后续长卷
        </button>
      </div>
      <span class="text-xs ink-muted tabular-nums">通关进度 {{ store.player.maxChapterId - 1 }} / 5</span>
    </div>

    <!-- 1. 射雕主线列表 -->
    <div v-if="subView === 'STORY'" class="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--border-ink)] pr-1">
      <div
        v-for="ch in STORY_CHAPTERS"
        :key="ch.id"
        class="py-3 first:pt-1 flex items-center justify-between gap-4"
      >
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2.5 flex-wrap">
            <span class="text-xs ink-gold font-bold tabular-nums">第 {{ ch.code }} 回</span>
            <span class="font-brush text-lg leading-none">{{ ch.title }}</span>
            <span class="text-xs ink-muted">
              荐 Lv.{{ ch.recLevel }} · 敌摆「{{ getStanceLabel(ch.bossStance) }}」
            </span>
          </div>
          <p class="text-xs ink-muted">{{ ch.mechanicTip }}</p>
          <div class="text-[11px] ink-muted tabular-nums">
            破阵犒赏：真气 +{{ ch.rewardQi.toLocaleString() }} · 纹银 +{{ ch.rewardSilver.toLocaleString() }}
          </div>
        </div>

        <button
          @click="store.challengeChapter(ch.id)"
          class="px-4 py-1.5 text-xs font-bold shrink-0 cursor-pointer transition"
          :class="ch.id <= store.player.maxChapterId ? 'seal-stamp' : 'token-btn ink-muted'"
        >
          {{ ch.id < store.player.maxChapterId ? '再次历练' : '拔剑闯关' }}
        </button>
      </div>
    </div>

    <!-- 2. 九州挂机舆图 -->
    <div v-else-if="subView === 'MAPS'" class="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-3 content-start pr-1">
      <div
        v-for="m in MAPS"
        :key="m.id"
        @click="store.moveMap(m.id)"
        class="wuxia-elevated p-3.5 cursor-pointer transition hover:border-[var(--border-gold)] flex flex-col justify-between gap-3"
        :class="store.player.currentMapId === m.id ? 'border-[var(--border-gold)]' : ''"
      >
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="font-brush text-lg leading-none">{{ m.name }}</span>
            <span
              class="text-[11px] shrink-0"
              :class="m.safety === 'PEACE' ? 'ink-jade' : 'ink-cinnabar'"
            >
              {{ m.safety === 'PEACE' ? '和平共修' : '限定纷争' }}
            </span>
          </div>
          <p class="text-xs ink-muted leading-relaxed">{{ m.ambientDesc }}</p>
        </div>

        <div class="flex items-center justify-between text-xs pt-2 border-t border-[var(--border-subtle)] tabular-nums">
          <span class="ink-muted">灵脉速率 <b class="text-[var(--text-ink)]">{{ m.baseQiPerHour }}/时</b></span>
          <span :class="store.player.currentMapId === m.id ? 'ink-gold font-bold' : 'ink-muted'">
            {{ store.player.currentMapId === m.id ? '当前驻留' : '动身前往 →' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 3. 松鹤楼结义与后续长卷 -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
      <div class="wuxia-elevated p-3.5 border-l-2 border-l-[var(--border-gold)] flex items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-[11px] tab-gold px-1.5 py-0.2 font-bold">三人实时组队</span>
            <span class="font-brush text-lg leading-none">松鹤楼义结金兰 · 少室山三渡金刚伏魔圈</span>
          </div>
          <p class="text-xs ink-muted">
            进入秘境后自动由“1主+2伙伴”切换为「3名真实玩家主角同场出战」。当前结义队友：乔北冥（丐帮）、清风道长（全真）。
          </p>
        </div>
        <button
          @click="store.startThreePlayerCoopRaid()"
          class="seal-stamp px-4 py-1.5 font-bold text-xs shrink-0 cursor-pointer"
        >
          结义发兵
        </button>
      </div>

      <div class="text-xs font-bold ink-muted pt-1">岁时武库 · 后续资料片演进长卷</div>
      <div class="grid grid-cols-2 gap-2.5 text-xs">
        <div
          v-for="v in EXPANSION_VOLUMES_PREVIEW"
          :key="v.vol"
          class="wuxia-elevated p-3 space-y-1"
        >
          <div class="flex items-center justify-between">
            <span class="font-brush text-base ink-gold">{{ v.vol }}</span>
            <span class="text-[11px] ink-muted">{{ v.range }}</span>
          </div>
          <div class="text-xs">{{ v.chapters }}</div>
          <div class="text-[11px] ink-muted">核心机制：{{ v.core }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
