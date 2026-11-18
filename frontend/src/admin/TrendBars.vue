<script setup lang="ts">
import { computed } from 'vue'

/**
 * 近若干天单一指标的柱状图：一种颜色、一根基线，悬停看当天数值；
 * 只直接标出最高与最近一天，其余看下面的明细表。
 */
const props = defineProps<{ title: string; points: { label: string; value: number }[]; unit?: string }>()
const SLOT = 28
const PLOT = 110
const TOP = 16

const peak = computed(() => Math.max(0, ...props.points.map(({ value }) => value)))
const bars = computed(() => props.points.map((point, index) => {
  const height = peak.value ? point.value / peak.value * (PLOT - TOP) : 0
  const x = index * SLOT + 3
  const width = SLOT - 6
  const y = PLOT - height
  const radius = Math.min(4, height / 2, width / 2)
  // 只圆上沿，柱脚贴着基线
  const path = height > 0
    ? `M${x},${PLOT}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${PLOT}Z`
    : ''
  const last = index === props.points.length - 1
  const labelled = height > 0 && (last || (point.value === peak.value && props.points.findIndex(({ value }) => value === peak.value) === index))
  return { ...point, x, width, y, path, labelled, center: x + width / 2 }
}))
const ticks = computed(() => {
  const count = props.points.length
  return [0, Math.floor((count - 1) / 2), count - 1].filter((index, position, all) => count > 0 && all.indexOf(index) === position)
})
const width = computed(() => Math.max(1, props.points.length) * SLOT)
</script>

<template>
  <figure class="card p-3">
    <figcaption class="flex items-baseline justify-between gap-2">
      <span class="font-semibold">{{ props.title }}</span>
      <span class="muted text-xs tabular-nums">最高 {{ peak.toLocaleString() }}{{ props.unit ?? '' }}</span>
    </figcaption>
    <svg class="trend mt-2 w-full" :viewBox="`0 0 ${width} ${PLOT + 18}`" role="img" :aria-label="`${props.title}，近 ${props.points.length} 天`">
      <line x1="0" :x2="width" :y1="PLOT" :y2="PLOT" class="trend-base" />
      <g v-for="bar in bars" :key="bar.label" class="trend-bar">
        <rect :x="bar.x - 2" y="0" :width="bar.width + 4" :height="PLOT" class="trend-hit">
          <title>{{ bar.label }}：{{ bar.value.toLocaleString() }}{{ props.unit ?? '' }}</title>
        </rect>
        <path v-if="bar.path" :d="bar.path" class="trend-fill" />
        <text v-if="bar.labelled" :x="bar.center" :y="bar.y - 4" text-anchor="middle" class="trend-value">{{ bar.value.toLocaleString() }}</text>
      </g>
      <text v-for="index in ticks" :key="index" :x="bars[index].center" :y="PLOT + 14" text-anchor="middle" class="trend-tick">{{ bars[index].label.slice(5) }}</text>
    </svg>
  </figure>
</template>

<style scoped>
.trend { height: auto; max-height: 11rem; overflow: visible; }
.trend-base { stroke: var(--line); stroke-width: 1; }
.trend-fill { fill: var(--accent); pointer-events: none; }
.trend-hit { fill: transparent; }
.trend-bar:hover .trend-hit { fill: color-mix(in srgb, var(--accent) 10%, transparent); }
.trend-value { fill: var(--ink); font-size: 10px; font-variant-numeric: tabular-nums; }
.trend-tick { fill: var(--muted); font-size: 10px; }
</style>
