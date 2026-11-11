<script setup lang="ts">
/**
 * 醉仙楼·结缘 揭晓动画（求签意象）：
 *   SHAKE  签筒摇动，筒底光色暗示本次最高品质
 *   DRAW   一支签破筒而出，光尾拖曳
 *   REVEAL 单抽：签化作绢本卷轴自中线展开；十连：十张签卡依次翻面，绝品 / 神品停顿加光
 *   DONE   结果定格，可收下或再结缘
 * 纯 SVG + CSS；GACHA_ASSETS 里填了图片 / 音效就自动替换兜底。
 * 点击舞台或按 空格 / 回车 跳过；系统开启“减少动态效果”时直接定格。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGameStore, type GachaResultView } from '@/stores/gameStore'
import { GACHA_ASSETS, GACHA_HARD_PITY, GACHA_SINGLE_COST, GACHA_TEN_COST } from '@/config/gachaData'
import { TIER_META } from '@/config/uiMeta'
import InkFigure from './InkFigure.vue'

const store = useGameStore()

type Phase = 'SHAKE' | 'DRAW' | 'REVEAL' | 'DONE'
const phase = ref<Phase>('SHAKE')
const flipped = ref(0) // 十连已翻开的张数
let timers: ReturnType<typeof setTimeout>[] = []

const results = computed<GachaResultView[]>(() => store.gachaReveal?.results ?? [])
const isTen = computed(() => results.value.length > 1)
const TIER_ORDER = { blue: 1, purple: 2, orange: 3, red: 4 } as const
const best = computed(() => results.value.reduce((b, r) => (TIER_ORDER[r.draw.tier] > TIER_ORDER[b] ? r.draw.tier : b), 'blue' as GachaResultView['draw']['tier']))
const isRare = (r: GachaResultView) => r.draw.tier === 'red' || r.draw.tier === 'orange'
const TIER_GLYPH = { red: '神', orange: '绝', purple: '上', blue: '良' } as const
const pityLeft = computed(() => GACHA_HARD_PITY - store.gacha.pity)

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function play(src: string | null) {
  if (!src) return
  try {
    void new Audio(src).play().catch(() => {})
  } catch {
    /* 无音频环境忽略 */
  }
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}
const after = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))

function start() {
  clearTimers()
  flipped.value = 0
  if (reducedMotion) {
    finish()
    return
  }
  phase.value = 'SHAKE'
  play(GACHA_ASSETS.sfx.shake)
  after(1300, () => {
    phase.value = 'DRAW'
    play(GACHA_ASSETS.sfx.draw)
  })
  after(2100, () => {
    phase.value = 'REVEAL'
    play(best.value === 'red' || best.value === 'orange' ? GACHA_ASSETS.sfx.revealRare : GACHA_ASSETS.sfx.reveal)
    if (isTen.value) flipNext()
    else after(1100, finish)
  })
}

/** 十连逐张翻面：绝品 / 神品多停一拍 */
function flipNext() {
  if (flipped.value >= results.value.length) {
    after(300, () => (phase.value = 'DONE'))
    return
  }
  const r = results.value[flipped.value]
  flipped.value += 1
  if (isRare(r)) play(GACHA_ASSETS.sfx.stamp)
  after(isRare(r) ? 620 : 210, flipNext)
}

function finish() {
  clearTimers()
  flipped.value = results.value.length
  phase.value = 'DONE'
}

/** 点击舞台：动画中则跳过，定格后无动作 */
function skip() {
  if (phase.value !== 'DONE') finish()
}

function again(count: 1 | 10) {
  store.closeGachaReveal()
  store.pullGacha(count)
}

function onKey(e: KeyboardEvent) {
  if (!store.gachaReveal) return
  e.stopPropagation() // 动画期间屏蔽底层页签热键
  if (e.key === 'Escape') {
    if (phase.value === 'DONE') store.closeGachaReveal()
    else finish()
  } else if (e.key === ' ' || e.key === 'Enter') {
    if (phase.value !== 'DONE') {
      e.preventDefault()
      finish()
    }
  }
}

watch(
  () => store.gachaReveal?.key,
  (k) => {
    if (k) start()
  },
  { immediate: true }
)
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => {
  clearTimers()
  window.removeEventListener('keydown', onKey, true)
})

/** 签筒里露出的签：签头颜色混入最高品质色 */
const STICKS = [
  { x: 42, h: 46, r: -9 }, { x: 50, h: 54, r: -4 }, { x: 58, h: 50, r: 1 }, { x: 66, h: 56, r: 5 }, { x: 74, h: 47, r: 10 },
]
</script>

<template>
  <div
    v-if="store.gachaReveal"
    class="gacha-root fixed inset-0 z-[85] flex flex-col items-center justify-center overflow-hidden"
    :class="TIER_META[best].cls"
    role="dialog" aria-modal="true" aria-label="醉仙楼结缘揭晓"
    @click="skip"
  >
    <!-- 底景：素材优先，否则水墨晕染 -->
    <div class="absolute inset-0 bg-[#0b0a08]" />
    <img v-if="GACHA_ASSETS.background" :src="GACHA_ASSETS.background" alt="" class="absolute inset-0 h-full w-full object-cover opacity-40" />
    <div class="gacha-ink absolute inset-0" :class="phase !== 'SHAKE' ? 'is-lit' : ''" />

    <!-- ========== 求签：签筒摇动 / 出签 ========== -->
    <div v-if="phase === 'SHAKE' || phase === 'DRAW'" class="relative flex flex-col items-center">
      <div class="relative h-[17rem] w-[9rem]">
        <div class="gacha-floor-glow absolute bottom-[-1rem] left-1/2 h-8 w-56 -translate-x-1/2 rounded-[50%]" />
      </div>
      <div class="absolute top-0 h-[17rem] w-[9rem]" :class="phase === 'SHAKE' ? 'gacha-shake' : 'gacha-settle'">
        <img v-if="GACHA_ASSETS.tube" :src="GACHA_ASSETS.tube" alt="签筒" class="absolute inset-0 h-full w-full object-contain" />
        <svg v-else viewBox="0 0 116 220" class="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <!-- 筒内竹签 -->
          <g v-for="(s, i) in STICKS" :key="i" :transform="`rotate(${s.r} ${s.x} 92)`">
            <rect :x="s.x - 2.6" :y="92 - s.h" width="5.2" :height="s.h + 30" rx="1.4" fill="#d9c08f" stroke="#8a6a3a" stroke-width="0.6" />
            <rect :x="s.x - 2.6" :y="92 - s.h" width="5.2" height="9" rx="1.4" class="gacha-stick-tip" />
          </g>
          <!-- 筒身：竹节 + 描金箍 -->
          <defs>
            <linearGradient id="gacha-tube" x1="0" x2="1">
              <stop offset="0" stop-color="#4a3420" />
              <stop offset="0.45" stop-color="#8a6436" />
              <stop offset="1" stop-color="#3b2918" />
            </linearGradient>
          </defs>
          <path d="M22,88 L94,88 L90,210 Q58,218 26,210 Z" fill="url(#gacha-tube)" stroke="#2a1d10" stroke-width="1.2" />
          <ellipse cx="58" cy="88" rx="36" ry="7" fill="#2a1d10" stroke="#c9a05a" stroke-width="1.4" />
          <path d="M24,120 Q58,128 92,120 M25,170 Q58,178 91,170" stroke="#c9a05a" stroke-width="1.6" fill="none" opacity="0.85" />
          <text x="58" y="152" text-anchor="middle" fill="#f1e2bf" font-size="26" style="font-family: var(--font-brush)">缘</text>
        </svg>
      </div>

      <!-- 出签：一支签破筒而出 -->
      <div v-if="phase === 'DRAW'" class="gacha-draw absolute left-1/2 top-0 h-[9rem] w-[0.55rem] rounded-sm">
        <img v-if="GACHA_ASSETS.stick" :src="GACHA_ASSETS.stick" alt="" class="h-full w-full object-contain" />
      </div>
      <div v-if="phase === 'DRAW'" class="gacha-flash absolute left-1/2 top-[-6rem] h-40 w-40 -translate-x-1/2 rounded-full" />

      <p class="font-brush mt-8 text-2xl tracking-[0.3em] text-[#f1e2bf]" :class="phase === 'SHAKE' ? 'opacity-90' : 'opacity-0 transition-opacity duration-300'">诚心结缘</p>
      <p class="mt-2 text-xs text-[#a89a80]">点击任意处跳过</p>
    </div>

    <!-- ========== 揭晓：单抽卷轴 ========== -->
    <div v-else-if="!isTen" class="relative flex flex-col items-center px-4">
      <template v-for="r in results" :key="r.draw.pullNo">
        <!-- 神品：转光 + 泼墨 -->
        <div v-if="r.draw.tier === 'red'" class="gacha-rays pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2" />
        <img v-if="r.draw.tier === 'red' && GACHA_ASSETS.inkSplash" :src="GACHA_ASSETS.inkSplash" alt="" class="pointer-events-none absolute left-1/2 top-1/2 w-[34rem] -translate-x-1/2 -translate-y-1/2 opacity-80" />
        <template v-else-if="r.draw.tier === 'red'">
          <span v-for="i in 3" :key="i" class="gacha-splash pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 rounded-full" :style="{ animationDelay: `${i * 0.18}s` }" />
        </template>

        <div class="relative w-[min(19rem,86vw)]" :class="TIER_META[r.draw.tier].cls">
          <!-- 卷轴上下轴 -->
          <div class="gacha-rod absolute inset-x-[-0.6rem] top-[-0.5rem] z-10 h-[0.8rem] rounded-full" />
          <div class="gacha-rod absolute inset-x-[-0.6rem] bottom-[-0.5rem] z-10 h-[0.8rem] rounded-full" />
          <div class="gacha-scroll panel relative overflow-hidden px-5 pb-6 pt-5 text-center" :class="[isRare(r) ? 'glow-border' : '', phase === 'REVEAL' ? 'gacha-unroll' : '']">
            <img v-if="GACHA_ASSETS.cardFrame" :src="GACHA_ASSETS.cardFrame" alt="" class="pointer-events-none absolute inset-0 h-full w-full object-fill" />
            <div class="flex items-center justify-center gap-2">
              <span class="chip tier-chip">{{ TIER_META[r.draw.tier].label }}</span>
              <span v-if="r.draw.pityTriggered" class="chip chip-gold">保底</span>
            </div>
            <div class="relative mx-auto mt-3 flex h-56 items-end justify-center">
              <img v-if="r.portrait && r.draw.refId && GACHA_ASSETS.portraits[r.draw.refId]" :src="GACHA_ASSETS.portraits[r.draw.refId]" :alt="r.name" class="h-full object-contain" />
              <InkFigure v-else-if="r.portrait" :style-type="r.portrait" />
              <span v-else class="seal mb-6 h-28 w-28 text-7xl" :style="{ background: 'var(--tc)', boxShadow: '0 0 0 0.2rem var(--tc)' }">{{ r.glyph }}</span>
            </div>
            <h3 class="font-brush mt-3 text-4xl leading-tight" :style="{ color: 'var(--tc)' }">{{ r.name }}</h3>
            <p class="mt-1.5 text-sm text-ink2">{{ r.detail }}</p>
            <span v-if="phase === 'DONE' || phase === 'REVEAL'" class="seal anim-stamp absolute right-4 top-12 h-11 w-11 text-2xl" :style="{ animationDelay: '0.75s' }">
              {{ r.isNew ? '新' : TIER_GLYPH[r.draw.tier] }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- ========== 揭晓：十连签卡 ========== -->
    <div v-else class="relative max-h-[calc(100dvh-10rem)] w-full max-w-4xl overflow-y-auto px-4 py-4">
      <div v-if="best === 'red'" class="gacha-rays pointer-events-none absolute left-1/2 top-1/2 h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2 opacity-60" />
      <ol class="relative grid grid-cols-3 gap-2.5 sm:grid-cols-5 sm:gap-3">
        <li
          v-for="(r, i) in results" :key="r.draw.pullNo"
          class="gacha-card relative aspect-[5/7]" :class="[TIER_META[r.draw.tier].cls, i < flipped ? 'is-flipped' : '']"
          :style="{ animationDelay: `${i * 40}ms` }"
        >
          <!-- 卡背 -->
          <div class="gacha-face gacha-back flex items-center justify-center border border-[#5a4628]">
            <img v-if="GACHA_ASSETS.cardBack" :src="GACHA_ASSETS.cardBack" alt="" class="absolute inset-0 h-full w-full object-cover" />
            <span v-else class="seal h-10 w-10 text-2xl">缘</span>
          </div>
          <!-- 卡面 -->
          <div class="gacha-face gacha-front panel flex flex-col items-center overflow-hidden p-1.5 text-center" :class="isRare(r) ? 'glow-border' : ''">
            <span class="chip tier-chip !px-1.5 !py-0 !text-[0.62rem]">{{ TIER_META[r.draw.tier].label }}</span>
            <div class="relative flex min-h-0 w-full flex-1 justify-center" :class="r.portrait ? 'items-end' : 'items-center'">
              <img v-if="r.portrait && r.draw.refId && GACHA_ASSETS.portraits[r.draw.refId]" :src="GACHA_ASSETS.portraits[r.draw.refId]" :alt="r.name" class="h-full object-contain" />
              <InkFigure v-else-if="r.portrait" :style-type="r.portrait" />
              <span v-else class="seal h-14 w-14 text-3xl" :style="{ background: 'var(--tc)', boxShadow: '0 0 0 0.14rem var(--tc)' }">{{ r.glyph }}</span>
            </div>
            <b class="font-brush mt-0.5 w-full truncate text-base leading-tight" :style="{ color: 'var(--tc)' }">{{ r.name }}</b>
            <span class="line-clamp-2 text-[0.62rem] leading-tight text-ink3">{{ r.detail }}</span>
            <span v-if="r.isNew" class="seal anim-stamp absolute right-1 top-5 h-6 w-6 text-sm">新</span>
          </div>
        </li>
      </ol>
    </div>

    <!-- ========== 定格：操作 ========== -->
    <div v-if="phase === 'DONE'" class="relative mt-6 flex flex-col items-center gap-2 px-4" @click.stop>
      <div class="flex flex-wrap justify-center gap-2">
        <button class="btn btn-gold min-w-[7rem]" @click="store.closeGachaReveal()">收下</button>
        <button class="btn min-w-[7rem]" :disabled="store.player.goldIngot < GACHA_SINGLE_COST" @click="again(1)">再结缘 ×1 · {{ GACHA_SINGLE_COST }}</button>
        <button class="btn btn-seal min-w-[7rem]" :disabled="store.player.goldIngot < GACHA_TEN_COST" @click="again(10)">再结缘 ×10 · {{ GACHA_TEN_COST }}</button>
      </div>
      <p class="text-xs tabular-nums text-[#a89a80]">元宝 {{ store.player.goldIngot }} · 距神品保底还有 {{ pityLeft }} 抽</p>
    </div>
    <button v-else class="btn btn-sm absolute bottom-6 right-6" @click.stop="finish">跳过</button>
  </div>
</template>

<style>
/* 底景：品质色水墨晕染，出签后点亮 */
.gacha-ink {
  background:
    radial-gradient(ellipse 60% 45% at 50% 62%, color-mix(in srgb, var(--tc) 14%, transparent), transparent 70%),
    radial-gradient(ellipse 90% 70% at 50% 50%, transparent 40%, rgba(0, 0, 0, 0.75));
  transition: background 0.6s ease;
}
.gacha-ink.is-lit {
  background:
    radial-gradient(ellipse 55% 50% at 50% 48%, color-mix(in srgb, var(--tc) 30%, transparent), transparent 72%),
    radial-gradient(ellipse 90% 70% at 50% 50%, transparent 40%, rgba(0, 0, 0, 0.7));
}
.gacha-floor-glow {
  background: radial-gradient(closest-side, color-mix(in srgb, var(--tc) 70%, transparent), transparent);
  filter: blur(6px);
  animation: pulseGlow 1s ease-in-out infinite;
}
.gacha-stick-tip { fill: color-mix(in srgb, var(--tc) 75%, #c0453a); }

/* 摇签：以筒底为轴左右急晃 */
.gacha-shake { transform-origin: 50% 95%; animation: gachaShake 0.16s ease-in-out infinite alternate; }
.gacha-settle { transform-origin: 50% 95%; animation: gachaSettle 0.4s ease-out both; }
@keyframes gachaShake {
  from { transform: rotate(-7deg) translateY(0); }
  to { transform: rotate(7deg) translateY(-0.25rem); }
}
@keyframes gachaSettle {
  from { transform: rotate(4deg); }
  to { transform: rotate(0); opacity: 0.35; }
}

/* 出签：一支签破筒而出，带光尾 */
.gacha-draw {
  background: linear-gradient(180deg, color-mix(in srgb, var(--tc) 85%, #fff) 0 14%, #d9c08f 14%);
  box-shadow: 0 0 0.6rem 0.15rem var(--tc), 0 2.5rem 2rem -0.4rem color-mix(in srgb, var(--tc) 55%, transparent);
  animation: gachaDraw 0.8s cubic-bezier(0.3, 1.4, 0.5, 1) both;
}
@keyframes gachaDraw {
  0% { transform: translate(-50%, 5rem) scale(0.9); opacity: 0; }
  25% { opacity: 1; }
  100% { transform: translate(-50%, -7rem) scale(1.05); opacity: 1; }
}
.gacha-flash {
  background: radial-gradient(closest-side, #fff, var(--tc) 40%, transparent);
  animation: ripple 0.8s ease-out 0.45s both;
}

/* 卷轴：上下轴 + 绢本自中线展开 */
.gacha-rod {
  background: linear-gradient(180deg, var(--gold-fill), color-mix(in srgb, var(--gold) 45%, #000));
  box-shadow: 0 0.15rem 0.4rem rgba(0, 0, 0, 0.5);
}
.gacha-scroll { background-image: linear-gradient(180deg, color-mix(in srgb, var(--tc) 12%, transparent), transparent 45%); }
.gacha-unroll { animation: gachaUnroll 0.9s cubic-bezier(0.2, 0.9, 0.3, 1) both; }
@keyframes gachaUnroll {
  0% { clip-path: inset(48% 0 48% 0); opacity: 0.6; }
  100% { clip-path: inset(0 0 0 0); opacity: 1; }
}

/* 神品：旋转光芒 + 泼墨晕开 */
.gacha-rays {
  background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--tc) 30%, transparent) 0 6deg, transparent 6deg 18deg);
  mask: radial-gradient(closest-side, #000 20%, transparent);
  -webkit-mask: radial-gradient(closest-side, #000 20%, transparent);
  animation: gachaSpin 14s linear infinite;
}
@keyframes gachaSpin { to { transform: rotate(360deg); } }
.gacha-splash {
  margin: -9rem 0 0 -9rem;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--tc) 45%, transparent), transparent);
  animation: ripple 1.4s ease-out both;
}

/* 十连签卡：入场 + 翻面 */
.gacha-card { perspective: 900px; animation: modalIn 0.3s ease-out both; }
.gacha-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transition: transform 0.5s cubic-bezier(0.3, 1.2, 0.4, 1);
}
.gacha-back {
  background:
    radial-gradient(circle at 50% 45%, color-mix(in srgb, #c9a05a 22%, transparent), transparent 60%),
    linear-gradient(160deg, #2a2117, #14100b);
  box-shadow: inset 0 0 0 0.25rem #1a140d, inset 0 0 0 0.3rem #5a4628;
}
.gacha-front { transform: rotateY(180deg); }
.gacha-card.is-flipped .gacha-back { transform: rotateY(-180deg); }
.gacha-card.is-flipped .gacha-front { transform: rotateY(0); }
.gacha-card.is-flipped.t-red .gacha-front,
.gacha-card.is-flipped.t-orange .gacha-front { box-shadow: 0 0 1.4rem 0.2rem color-mix(in srgb, var(--tc) 55%, transparent); }
</style>
