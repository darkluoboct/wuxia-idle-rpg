<script setup lang="ts">
/** 六维雷达（臂力 / 根骨 / 身法 / 悟性 / 福缘 / 侠义）：一眼看出角色偏科方向 */
import { computed } from 'vue'

const props = defineProps<{
  items: { label: string; value: number }[]
  /** 外圈对应的数值；默认取 max(50, 最大值×1.25) */
  max?: number
}>()

const CX = 110
const CY = 92
const R = 58
const n = computed(() => props.items.length)
const scale = computed(() => props.max ?? Math.max(50, Math.ceil(Math.max(...props.items.map((i) => i.value), 0) * 1.25)))

const angle = (i: number) => (-90 + (360 / n.value) * i) * (Math.PI / 180)
const pt = (i: number, r: number) => `${(CX + Math.cos(angle(i)) * r).toFixed(1)},${(CY + Math.sin(angle(i)) * r).toFixed(1)}`
const ring = (k: number) => Array.from({ length: n.value }, (_, i) => pt(i, R * k)).join(' ')
const poly = computed(() =>
  props.items.map((it, i) => pt(i, R * Math.max(0.04, Math.min(1, it.value / scale.value)))).join(' ')
)
const labels = computed(() =>
  props.items.map((it, i) => {
    const a = angle(i)
    const x = CX + Math.cos(a) * (R + 15)
    const y = CY + Math.sin(a) * (R + 15)
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'
    return { ...it, x, y, anchor, neg: it.value < 0 }
  })
)
</script>

<template>
  <svg viewBox="0 0 220 186" class="mx-auto block w-full max-w-[17rem]" role="img" aria-label="六维属性雷达图">
    <!-- 同心六边形 -->
    <polygon v-for="k in [0.25, 0.5, 0.75, 1]" :key="k" :points="ring(k)" fill="none" stroke="var(--line-strong)" :stroke-width="k === 1 ? 1 : 0.6" :opacity="k === 1 ? 0.9 : 0.55" />
    <line v-for="(_, i) in items" :key="i" :x1="CX" :y1="CY" :x2="pt(i, R).split(',')[0]" :y2="pt(i, R).split(',')[1]" stroke="var(--line)" stroke-width="0.6" />
    <!-- 数据区 -->
    <polygon :points="poly" fill="var(--gold)" fill-opacity="0.2" stroke="var(--gold)" stroke-width="1.6" stroke-linejoin="round" />
    <circle v-for="(it, i) in items" :key="`d${i}`" :cx="pt(i, R * Math.max(0.04, Math.min(1, it.value / scale))).split(',')[0]" :cy="pt(i, R * Math.max(0.04, Math.min(1, it.value / scale))).split(',')[1]" r="2.4" fill="var(--gold)" />
    <!-- 标签 -->
    <g v-for="l in labels" :key="l.label" :text-anchor="l.anchor">
      <text :x="l.x" :y="l.y - 1" font-size="11" fill="var(--ink-2)">{{ l.label }}</text>
      <text :x="l.x" :y="l.y + 11.5" font-size="12" font-weight="700" :fill="l.neg ? 'var(--cinnabar-text)' : 'var(--gold)'" style="font-variant-numeric: tabular-nums">{{ l.value }}</text>
    </g>
  </svg>
</template>
