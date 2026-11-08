<script setup lang="ts">
import { computed } from 'vue'
import type { PortraitStyle } from '@/config/typesHelper'

const props = defineProps<{
  name: string
  subtitle?: string
  styleType: PortraitStyle
  hp?: number
  maxHp?: number
  rage?: number
  isMain?: boolean
  isEnemy?: boolean
  anim?: 'NONE' | 'LUNGE_ALLY' | 'LUNGE_ENEMY' | 'HIT'
  size?: 'sm' | 'md' | 'lg'
  popup?: { text: string; isCrit: boolean; category: string; key: number } | null
}>()

const hpPercent = computed(() => {
  if (props.hp === undefined || !props.maxHp) return 100
  return Math.max(0, Math.min(100, Math.round((props.hp / props.maxHp) * 100)))
})

const verticalName = computed(() => {
  const cleaned = props.name.replace(/【.*?】/g, '').replace(/.*·/, '').trim()
  return (cleaned || props.name).slice(0, 4)
})

/** 低饱和宋画水墨衣冠色，彻底告别高饱和五颜六色 */
const palette = computed(() => {
  switch (props.styleType) {
    case 'hero_sword':
      return { robe: '#273138', lapel: '#1b2228', accent: '#b89964', weapon: 'sword' }
    case 'guojing':
      return { robe: '#3a312a', lapel: '#26201b', accent: '#a88754', weapon: 'palm' }
    case 'huangrong':
      return { robe: '#293935', lapel: '#1b2623', accent: '#c2a46e', weapon: 'staff' }
    case 'hongqigong':
      return { robe: '#3d2c28', lapel: '#281d1a', accent: '#9e8256', weapon: 'gourd' }
    case 'huangyaoshi':
      return { robe: '#253533', lapel: '#182422', accent: '#9db0a8', weapon: 'flute' }
    case 'ouyangfeng':
      return { robe: '#332a36', lapel: '#211b24', accent: '#a85a52', weapon: 'snake' }
    case 'meichaofeng':
      return { robe: '#2e2933', lapel: '#1e1b22', accent: '#9a7e8f', weapon: 'claw' }
    case 'zhoubotong':
      return { robe: '#31363d', lapel: '#202429', accent: '#b59b68', weapon: 'taiji' }
    case 'monk':
      return { robe: '#423426', lapel: '#2b2218', accent: '#c29e63', weapon: 'palm' }
    default:
      return { robe: '#2e2c2b', lapel: '#1e1d1c', accent: '#a8524d', weapon: 'sword' }
  }
})

const animClass = computed(() => {
  if (props.anim === 'LUNGE_ALLY') return 'animate-lunge-ally border-[var(--border-gold)]'
  if (props.anim === 'LUNGE_ENEMY') return 'animate-lunge-enemy border-[var(--accent-cinnabar)]'
  if (props.anim === 'HIT') return 'animate-hit-shake border-[var(--accent-cinnabar)]'
  return ''
})

const portraitBoxHeight = computed(() => {
  if (props.size === 'sm') return 'h-[60px]'
  if (props.size === 'lg') return 'h-[106px]'
  return props.isMain ? 'h-[90px]' : 'h-[78px]'
})

const popupColorClass = computed(() => {
  if (!props.popup) return ''
  if (props.popup.category === 'dodge') return 'ink-jade'
  if (props.popup.isCrit || props.popup.category === 'qi') return 'ink-gold text-base'
  return 'ink-cinnabar'
})
</script>

<template>
  <div
    class="wuxia-elevated relative overflow-visible transition-all duration-200 select-none p-1.5"
    :class="[
      animClass,
      isMain ? 'border-t border-t-[var(--border-gold)]' : '',
      hp !== undefined && hp <= 0 ? 'opacity-40 grayscale' : '',
    ]"
  >
    <!-- 战斗飘字 -->
    <div
      v-if="popup"
      :key="popup.key"
      class="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap font-brush text-sm font-bold animate-dmg-float drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
      :class="popupColorClass"
    >
      {{ popup.text }}
    </div>

    <!-- 左上素雅竖排题名（去掉右上重复红章） -->
    <div
      class="vertical-rl font-brush absolute top-1.5 left-1.5 z-20 text-[11px] leading-none px-0.5 py-0.5 ink-muted opacity-85"
    >
      {{ verticalName }}
    </div>

    <!-- 水墨半身剪影画框 -->
    <div
      class="relative mx-auto flex items-end justify-center bg-black/15 overflow-hidden w-full"
      :class="portraitBoxHeight"
    >
      <svg viewBox="0 0 160 120" class="absolute inset-0 w-full h-full opacity-15" preserveAspectRatio="none">
        <path d="M0,120 L0,84 Q42,56 82,86 T160,68 L160,120 Z" fill="currentColor" />
      </svg>

      <svg viewBox="0 0 120 120" class="relative z-10 h-full w-auto">
        <line
          v-if="palette.weapon === 'sword'"
          x1="24" y1="18" x2="94" y2="96"
          :stroke="palette.accent" stroke-width="2.5" stroke-linecap="round" opacity="0.8"
        />
        <line
          v-if="palette.weapon === 'flute'"
          x1="28" y1="68" x2="94" y2="48"
          :stroke="palette.accent" stroke-width="2.5" stroke-linecap="round" opacity="0.8"
        />
        <line
          v-if="palette.weapon === 'staff' || palette.weapon === 'snake'"
          x1="90" y1="14" x2="82" y2="112"
          :stroke="palette.accent" stroke-width="3" stroke-linecap="round" opacity="0.8"
        />
        <circle
          v-if="palette.weapon === 'taiji' || palette.weapon === 'palm'"
          cx="60" cy="54" r="34"
          fill="none" :stroke="palette.accent" stroke-width="1.2" stroke-dasharray="5 5" opacity="0.45"
        />

        <rect x="52" y="14" width="16" height="9" rx="2" fill="#181716" />
        <line x1="46" y1="18" x2="74" y2="18" :stroke="palette.accent" stroke-width="2" />
        <circle cx="60" cy="34" r="12.5" fill="#c9b8a6" />
        <path d="M26,118 C29,76 41,52 60,52 C79,52 91,76 94,118 Z" :fill="palette.robe" />
        <path d="M37,118 C40,84 48,60 60,60 C72,60 80,84 83,118 Z" :fill="palette.lapel" opacity="0.6" />
        <path d="M47,54 L60,82 L73,54" fill="none" :stroke="palette.accent" stroke-width="2.2" opacity="0.85" />
      </svg>

      <div
        v-if="hp !== undefined && hp <= 0"
        class="absolute inset-0 z-20 bg-black/70 flex items-center justify-center"
      >
        <span class="text-[10px] ink-muted border border-[var(--border-ink)] px-2 py-0.5">力竭</span>
      </div>
    </div>

    <div class="mt-1 text-center truncate">
      <div class="text-xs font-bold leading-tight truncate" :class="isEnemy ? 'ink-cinnabar' : ''">
        {{ name }}
      </div>
      <div v-if="subtitle" class="text-[10px] ink-muted truncate mt-0.5">
        {{ subtitle }}
      </div>
    </div>

    <!-- 极简气血与怒气细线 -->
    <div v-if="hp !== undefined && maxHp" class="mt-1 space-y-0.5">
      <div class="h-[3px] w-full bg-black/30 overflow-hidden">
        <div
          class="h-full transition-all duration-300"
          :class="isEnemy ? 'bg-[var(--accent-cinnabar)]' : 'bg-[var(--accent-jade)]'"
          :style="{ width: `${hpPercent}%` }"
        />
      </div>
      <div v-if="rage !== undefined" class="h-[2px] w-full bg-black/20 overflow-hidden">
        <div
          class="h-full bg-[var(--accent-gold)] opacity-80 transition-all duration-300"
          :style="{ width: `${Math.min(100, Math.max(0, rage))}%` }"
        />
      </div>
      <div class="flex items-center justify-between text-[10px] tabular-nums ink-muted leading-none pt-0.5">
        <span>{{ hp.toLocaleString() }}</span>
        <span v-if="rage !== undefined" class="ink-gold">怒 {{ rage }}%</span>
      </div>
    </div>
  </div>
</template>
