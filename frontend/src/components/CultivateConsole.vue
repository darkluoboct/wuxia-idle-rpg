<script setup lang="ts">
/**
 * 修行控制台：放置游戏最核心的三个动作 —— 收功领真气、运转周天升级、冲穴破境。
 * 原先藏在左侧栏的小字按钮，在这里升格为舞台正下方的主操作区。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { REALMS } from '@/config/gameData'

const store = useGameStore()
const usePill = ref(false)

const p = computed(() => store.player)
const nextRealm = computed(() => REALMS.find((r) => r.tier === p.value.realmTier + 1) ?? null)

const breakRate = computed(() => {
  if (!nextRealm.value) return 100
  const bonus = usePill.value && store.pillCount > 0 ? 25 : 0
  return Math.min(100, Math.round(nextRealm.value.baseBreakRate + p.value.stats.con * 0.3 + p.value.breakPityRate + bonus))
})

const expPct = computed(() => Math.min(100, Math.round((p.value.qiExp / Math.max(1, p.value.nextLevelQi)) * 100)))
const atCap = computed(() => p.value.level >= store.currentRealm.maxLevel)
const canLevel = computed(() => !atCap.value && p.value.qiExp >= p.value.nextLevelQi)
const levelHint = computed(() => {
  if (atCap.value) return `已达【${store.currentRealm.name}】极境，需冲穴破境`
  if (p.value.qiExp < p.value.nextLevelQi) return `尚差真气 ${(p.value.nextLevelQi - p.value.qiExp).toLocaleString()}`
  return `Lv.${p.value.level} → Lv.${p.value.level + 1}`
})

/** 离线待领真气（与 store.settleOfflineQi 的公式保持一致，仅作预览） */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 5000)))
onUnmounted(() => clearInterval(timer))
const pending = computed(() => {
  const sec = Math.max(60, Math.floor((now.value - p.value.lastSettleAt) / 1000))
  return Math.max(480, Math.round(store.effectiveQiPerHour * Math.min(12, sec / 3600)))
})

const RING_R = 26
const ringLen = 2 * Math.PI * RING_R
const ringOffset = computed(() => ringLen * (1 - expPct.value / 100))
</script>

<template>
  <section class="panel shrink-0 p-3 md:p-4">
    <div class="grid items-center gap-x-4 gap-y-3 sm:grid-cols-[auto_1fr] xl:grid-cols-[auto_1fr_auto]">
      <!-- 丹田气海环 -->
      <button
        class="group relative mx-auto h-[4.75rem] w-[4.75rem] shrink-0 rounded-full transition-transform hover:scale-[1.04]"
        title="点击丹田：立即收功聚气"
        @click="store.settleOfflineQi()"
      >
        <svg viewBox="0 0 64 64" class="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r="30.5" fill="none" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="1 4.2" />
          <circle cx="32" cy="32" :r="RING_R" fill="color-mix(in srgb, var(--bg-2) 80%, transparent)" stroke="var(--line)" stroke-width="4" />
          <circle
            cx="32" cy="32" :r="RING_R" fill="none" stroke="var(--gold)" stroke-width="4" stroke-linecap="round"
            :stroke-dasharray="ringLen" :stroke-dashoffset="ringOffset" class="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <span class="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span class="text-base font-bold tabular-nums text-gold">{{ expPct }}%</span>
          <span class="font-brush mt-1 text-xs text-ink3">丹田</span>
        </span>
      </button>

      <!-- 读数 -->
      <div class="min-w-0 space-y-2">
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <div class="text-sm text-ink2">
            吐纳效率 <b class="text-base text-jade tabular-nums">+{{ store.effectiveQiPerHour.toLocaleString() }}</b><span class="text-xs">/时</span>
          </div>
          <div class="text-xs text-ink3">
            离线待领 <b class="text-gold tabular-nums">≈ +{{ pending.toLocaleString() }}</b> 真气
          </div>
        </div>
        <div class="bar bar-gold"><i :style="{ width: `${expPct}%` }" /></div>
        <div class="flex items-center justify-between text-xs tabular-nums text-ink3">
          <span>储气 {{ p.qiExp.toLocaleString() }} / {{ p.nextLevelQi.toLocaleString() }}</span>
          <span :class="canLevel ? 'text-gold' : ''">{{ levelHint }}</span>
        </div>
      </div>

      <!-- 动作 -->
      <div class="flex gap-2 sm:col-span-2 xl:col-span-1 xl:flex-col">
        <button class="btn flex-1" @click="store.settleOfflineQi()">凝神收功</button>
        <button class="btn btn-gold flex-1" :class="canLevel ? 'anim-pulse-glow' : ''" :disabled="!canLevel" @click="store.upgradeLevel()">
          运转周天
        </button>
      </div>
    </div>

    <!-- 冲穴破境：窄屏自然换行，说明文字单行省略（完整内容在 title） -->
    <div class="mt-3 border-t border-line pt-3">
      <div v-if="nextRealm" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div class="min-w-[14rem] flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="font-brush text-lg leading-none">冲穴 · {{ nextRealm.name }}</span>
            <span class="chip" :class="atCap ? 'chip-gold' : ''">{{ atCap ? '修为圆满 · 可冲击' : `境内 Lv.${p.level} / ${store.currentRealm.maxLevel}` }}</span>
          </div>
          <p class="hint truncate" :title="`${nextRealm.meridian} · ${nextRealm.unlockDesc}`">{{ nextRealm.meridian }} · {{ nextRealm.unlockDesc }}</p>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            class="flex items-center gap-2 text-left text-xs text-ink2 disabled:opacity-45"
            role="switch" :aria-checked="usePill" :disabled="store.pillCount <= 0" @click="usePill = !usePill"
          >
            <span class="switch" :aria-checked="usePill" />
            <span>九花玉露丸 <b class="text-jade">+25%</b><span class="text-ink3">（余 {{ store.pillCount }}）</span></span>
          </button>

          <div class="w-[5.5rem]">
            <div class="flex items-baseline justify-between text-xs"><span class="text-ink3">成率</span><b class="text-base tabular-nums text-gold">{{ breakRate }}%</b></div>
            <div class="bar bar-thin bar-gold"><i :style="{ width: `${breakRate}%` }" /></div>
          </div>

          <button class="btn" :class="atCap ? 'btn-seal' : 'btn-gold'" @click="store.attemptBreakthrough(usePill)">
            冲击玄关<span v-if="p.breakPityRate" class="text-xs font-normal opacity-80">（保底 +{{ p.breakPityRate }}%）</span>
          </button>
        </div>
      </div>
      <p v-else class="text-center text-sm text-gold">你已臻至极境，天人合一。</p>
    </div>
  </section>
</template>
