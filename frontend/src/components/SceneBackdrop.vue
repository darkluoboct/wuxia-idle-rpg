<script setup lang="ts">
/**
 * 水墨山水场景：随【时辰】换天色与日月，随【地图】换气候（烟雨 / 松云 / 风沙 / 瘴雾）。
 * 纯 SVG + CSS 动画；animated=false 时（舆图缩略卡）完全静止。
 */
import { computed, useId } from 'vue'
import { AMBIENCE_BY_MAP, PERIOD_BY_SHICHEN, type DayPeriod, type MapAmbience } from '@/config/uiMeta'

const props = withDefaults(
  defineProps<{
    mapId: string
    shichenIdx: number
    dark: boolean
    animated?: boolean
    /** 战斗：整体压暗并略带血色，突出人物 */
    battle?: boolean
  }>(),
  { animated: true, battle: false }
)

interface Pal {
  skyA: string
  skyB: string
  orb: string
  m1: string
  m2: string
  m3: string
  mist: string
  orbX: number
  orbY: number
  moon?: boolean
  stars?: boolean
}

/** 玄墨：夜色底的山水画 */
const DARK: Record<DayPeriod, Pal> = {
  night: { skyA: '#04060b', skyB: '#101a2c', orb: '#e9eeff', m1: '#18222f', m2: '#101823', m3: '#0a0f16', mist: '#8ea6c9', orbX: 610, orbY: 70, moon: true, stars: true },
  dawn: { skyA: '#171f35', skyB: '#a8695a', orb: '#ffd8a6', m1: '#3b3649', m2: '#272535', m3: '#15141d', mist: '#e8bfa6', orbX: 540, orbY: 196 },
  morning: { skyA: '#1b2c3e', skyB: '#86a0a4', orb: '#f7ebd1', m1: '#3a4d54', m2: '#26363c', m3: '#141f24', mist: '#c8d6d3', orbX: 250, orbY: 104 },
  noon: { skyA: '#223a4f', skyB: '#a7bbbf', orb: '#fff4d2', m1: '#3f565e', m2: '#2a3d43', m3: '#17252a', mist: '#dae6e3', orbX: 410, orbY: 58 },
  golden: { skyA: '#292a40', skyB: '#d28b52', orb: '#ffd08c', m1: '#4a3d44', m2: '#2e262d', m3: '#17121a', mist: '#f0c89b', orbX: 610, orbY: 132 },
  dusk: { skyA: '#0d0f1f', skyB: '#5b3a52', orb: '#f1d9c2', m1: '#2a2438', m2: '#1a1626', m3: '#0d0b14', mist: '#b78fa7', orbX: 690, orbY: 150, moon: true, stars: true },
}

/** 宋宣：宣纸上的淡墨山水 */
const LIGHT: Record<DayPeriod, Pal> = {
  night: { skyA: '#c4c9d3', skyB: '#e3e1da', orb: '#f8f6ee', m1: '#aeb4bb', m2: '#808a93', m3: '#4d5963', mist: '#ffffff', orbX: 610, orbY: 70, moon: true },
  dawn: { skyA: '#ecd6c8', skyB: '#f6ece0', orb: '#c8503f', m1: '#c9b7ad', m2: '#9d8d89', m3: '#675c5c', mist: '#ffffff', orbX: 540, orbY: 196 },
  morning: { skyA: '#dfe4de', skyB: '#f4f1e6', orb: '#c8503f', m1: '#b7c1bb', m2: '#8b9a96', m3: '#59696a', mist: '#ffffff', orbX: 250, orbY: 104 },
  noon: { skyA: '#e6eae3', skyB: '#f7f4ea', orb: '#c8503f', m1: '#b9c3bb', m2: '#8d9c97', m3: '#566667', mist: '#ffffff', orbX: 410, orbY: 58 },
  golden: { skyA: '#efdcc1', skyB: '#f7ecd8', orb: '#c8503f', m1: '#cdb9a3', m2: '#a1907f', m3: '#6c5e55', mist: '#fff8ec', orbX: 610, orbY: 132 },
  dusk: { skyA: '#d9cbd0', skyB: '#efe5df', orb: '#f8f4ec', m1: '#b5a9b3', m2: '#887e8c', m3: '#564e5d', mist: '#ffffff', orbX: 690, orbY: 150, moon: true },
}

const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
const ambience = computed<MapAmbience>(() => AMBIENCE_BY_MAP[props.mapId] ?? 'rain')
const period = computed(() => PERIOD_BY_SHICHEN[props.shichenIdx] ?? 'morning')

const pal = computed<Pal>(() => {
  const base = { ...(props.dark ? DARK : LIGHT)[period.value] }
  if (ambience.value === 'desert') {
    // 大漠：山色换成沙丘暖褐
    Object.assign(base, props.dark
      ? { m1: '#7b5b3d', m2: '#5d4330', m3: '#3d2c20' }
      : { m1: '#d8bc8e', m2: '#c29c64', m3: '#9b7442' })
  }
  return base
})

const MOUNTS = {
  far: 'M0,200 Q60,148 120,190 T240,150 T360,192 T480,128 T600,182 T720,140 T800,172 L800,320 L0,320 Z',
  mid: 'M0,238 Q80,190 170,232 T330,206 T500,242 T660,200 T800,232 L800,320 L0,320 Z',
  near: 'M0,284 Q120,250 240,282 T480,268 T720,286 T800,272 L800,320 L0,320 Z',
}
const DUNES = {
  far: 'M0,232 Q150,168 300,226 T600,208 T800,240 L800,320 L0,320 Z',
  mid: 'M0,260 Q200,206 380,258 T800,250 L800,320 L0,320 Z',
  near: 'M0,294 Q160,262 340,292 T800,284 L800,320 L0,320 Z',
}
const shapes = computed(() => (ambience.value === 'desert' ? DUNES : MOUNTS))

function pine(x: number, y: number, s: number) {
  const p = (a: number, b: number) => `${(x + a * s).toFixed(1)},${(y + b * s).toFixed(1)}`
  return `M${p(0, -34)} L${p(-8, -18)} L${p(-4, -18)} L${p(-11, -6)} L${p(-5, -6)} L${p(-13, 6)} L${p(13, 6)} L${p(5, -6)} L${p(11, -6)} L${p(4, -18)} L${p(8, -18)} Z`
}
const PINES: [number, number, number][] = [
  [92, 286, 1.5], [150, 292, 1.1], [236, 296, 1.3], [640, 290, 1.4], [706, 294, 1.8], [764, 288, 1.2],
]

const STARS = Array.from({ length: 16 }, (_, i) => ({
  x: (i * 197 + 43) % 780 + 10,
  y: (i * 71 + 17) % 120 + 8,
  r: i % 4 === 0 ? 1.5 : 0.9,
  d: (i % 5) * 0.7,
}))

const FIREFLIES = [
  { l: '12%', t: '58%', d: '0s' }, { l: '24%', t: '70%', d: '1.2s' }, { l: '38%', t: '52%', d: '2.1s' },
  { l: '55%', t: '66%', d: '0.6s' }, { l: '68%', t: '55%', d: '1.7s' }, { l: '81%', t: '72%', d: '2.6s' },
  { l: '90%', t: '60%', d: '0.9s' },
]

const rainColor = computed(() => (props.dark ? '200,216,236' : '70,84,96'))
const tint = computed(() => {
  switch (ambience.value) {
    case 'desert': return { c: '#d89a4a', o: props.dark ? 0.16 : 0.1 }
    case 'swamp': return { c: '#3d7a62', o: props.dark ? 0.26 : 0.16 }
    case 'pine': return { c: '#4f7d70', o: props.dark ? 0.12 : 0.07 }
    default: return { c: '#7f98ad', o: props.dark ? 0.12 : 0.06 }
  }
})
const driftClass = computed(() => (props.animated ? '[animation:drift_26s_ease-in-out_infinite_alternate]' : ''))
</script>

<template>
  <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <svg viewBox="0 0 800 320" preserveAspectRatio="xMidYMax slice" class="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient :id="`sky-${uid}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="pal.skyA" />
          <stop offset="1" :stop-color="pal.skyB" />
        </linearGradient>
        <radialGradient :id="`glow-${uid}`">
          <stop offset="0" :stop-color="pal.orb" stop-opacity="0.6" />
          <stop offset="1" :stop-color="pal.orb" stop-opacity="0" />
        </radialGradient>
        <linearGradient :id="`mist-${uid}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="pal.mist" stop-opacity="0" />
          <stop offset="0.55" :stop-color="pal.mist" :stop-opacity="dark ? 0.32 : 0.7" />
          <stop offset="1" :stop-color="pal.mist" stop-opacity="0" />
        </linearGradient>
      </defs>

      <rect width="800" height="320" :fill="`url(#sky-${uid})`" />

      <!-- 星 -->
      <g v-if="pal.stars && dark">
        <circle
          v-for="(s, i) in STARS" :key="i" :cx="s.x" :cy="s.y" :r="s.r" fill="#fff"
          :class="animated ? '[animation:twinkle_3.4s_ease-in-out_infinite]' : 'opacity-60'"
          :style="{ animationDelay: `${s.d}s` }"
        />
      </g>

      <!-- 日 / 月 -->
      <circle :cx="pal.orbX" :cy="pal.orbY" r="74" :fill="`url(#glow-${uid})`" />
      <circle :cx="pal.orbX" :cy="pal.orbY" :r="pal.moon ? 17 : 21" :fill="pal.orb" :opacity="pal.moon ? 0.96 : 0.92" />
      <circle v-if="pal.moon" :cx="pal.orbX + 6" :cy="pal.orbY - 3" r="15" :fill="pal.skyA" :opacity="dark ? 0.55 : 0.28" />

      <!-- 远山 / 雾 / 中山 / 雾 / 近山 -->
      <path :d="shapes.far" :fill="pal.m1" />
      <g :class="driftClass"><rect x="-90" y="150" width="980" height="90" :fill="`url(#mist-${uid})`" /></g>

      <!-- 终南：道观远影 -->
      <g v-if="ambience === 'pine'" :fill="pal.m2" opacity="0.95">
        <path d="M534,212 L560,198 L586,212 Z" />
        <path d="M544,200 L560,188 L576,200 Z" />
        <rect x="546" y="212" width="28" height="20" />
      </g>

      <path :d="shapes.mid" :fill="pal.m2" />
      <g :class="driftClass" :style="animated ? { animationDuration: '34s', animationDirection: 'alternate-reverse' } : {}">
        <rect x="-90" y="196" width="980" height="80" :fill="`url(#mist-${uid})`" />
      </g>
      <path :d="shapes.near" :fill="pal.m3" />

      <!-- 嘉兴：南湖水面与垂柳 -->
      <g v-if="ambience === 'rain'">
        <rect x="0" y="292" width="800" height="28" :fill="pal.mist" :opacity="dark ? 0.1 : 0.22" />
        <path d="M60,300 h120 M260,306 h150 M500,298 h130 M660,308 h110" :stroke="pal.mist" stroke-width="1" :opacity="dark ? 0.3 : 0.5" />
        <g fill="none" :stroke="pal.m3" stroke-linecap="round">
          <path d="M34,320 C32,262 44,208 76,168" stroke-width="3.4" />
          <path d="M76,168 C112,176 122,226 112,268" stroke-width="1.5" />
          <path d="M76,168 C98,184 104,228 96,262" stroke-width="1.3" />
          <path d="M76,168 C60,190 52,232 56,270" stroke-width="1.5" />
          <path d="M76,168 C46,176 34,220 40,258" stroke-width="1.3" />
        </g>
      </g>

      <!-- 终南：古松 -->
      <g v-if="ambience === 'pine'" :fill="pal.m3">
        <path v-for="(p, i) in PINES" :key="i" :d="pine(p[0], p[1], p[2])" />
      </g>

      <!-- 大漠：驼队 -->
      <g v-if="ambience === 'desert'" :stroke="pal.m3" stroke-linecap="round" fill="none">
        <path v-for="i in 4" :key="i" :d="`M${420 + i * 26},${252 - (i % 2) * 2} q2,-6 5,-1 q3,-5 5,1 M${420 + i * 26},${252 - (i % 2) * 2} v5 M${430 + i * 26},${251 - (i % 2) * 2} v6`" stroke-width="1.6" />
      </g>

      <!-- 黑沼：枯木 -->
      <g v-if="ambience === 'swamp'" fill="none" :stroke="pal.m3" stroke-linecap="round">
        <path d="M708,320 L704,226 M705,250 L676,214 M704,234 L732,204 M677,215 L660,198 M731,205 L750,194" stroke-width="3" />
        <path d="M92,320 L96,246 M95,262 L72,236 M96,250 L118,228" stroke-width="2.6" />
      </g>

      <rect width="800" height="320" :fill="tint.c" :opacity="tint.o" />
    </svg>

    <!-- 烟雨 -->
    <div
      v-if="ambience === 'rain' && animated"
      class="absolute inset-0"
      :class="dark ? 'opacity-60' : 'opacity-30'"
      :style="{
        backgroundImage: `linear-gradient(100deg, transparent 46%, rgba(${rainColor},.5) 50%, transparent 54%), linear-gradient(100deg, transparent 46%, rgba(${rainColor},.3) 50%, transparent 54%)`,
        backgroundSize: '28px 120px, 41px 160px',
        animation: 'rainfall .85s linear infinite',
      }"
    />
    <!-- 风沙 -->
    <div
      v-if="ambience === 'desert' && animated"
      class="absolute inset-0 opacity-50"
      style="
        background-image: radial-gradient(circle, rgba(230, 190, 120, 0.55) 0 1px, transparent 1.5px),
          radial-gradient(circle, rgba(230, 190, 120, 0.35) 0 1px, transparent 1.5px);
        background-size: 46px 38px, 71px 55px;
        animation: sandblow 5s linear infinite;
      "
    />
    <!-- 瘴雾 + 萤火 -->
    <template v-if="ambience === 'swamp'">
      <div
        class="absolute inset-x-0 bottom-0 h-3/5"
        :class="driftClass"
        :style="{ background: `linear-gradient(0deg, color-mix(in srgb, ${pal.mist} ${dark ? 34 : 60}%, transparent), transparent)` }"
      />
      <template v-if="animated">
        <i
          v-for="(f, i) in FIREFLIES" :key="i"
          class="absolute h-1 w-1 rounded-full bg-[#b6f2a0] shadow-[0_0_8px_2px_rgba(182,242,160,0.7)]"
          :style="{ left: f.l, top: f.t, animation: `firefly 5s ease-in-out ${f.d} infinite` }"
        />
      </template>
    </template>

    <!-- 压暗四周 / 战斗红晕 -->
    <div
      class="absolute inset-0"
      :style="{
        background: battle
          ? 'radial-gradient(ellipse at 50% 60%, transparent 30%, rgba(0,0,0,.55)), linear-gradient(0deg, color-mix(in srgb, var(--cinnabar) 14%, transparent), transparent 50%)'
          : 'radial-gradient(ellipse at 50% 55%, transparent 45%, rgba(0,0,0,.35))',
      }"
    />
  </div>
</template>
