<script setup lang="ts">
import { computed } from 'vue'
import type { PortraitStyle } from '@/config/typesHelper'
import InkFigure from './InkFigure.vue'

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
  pose?: 'stand' | 'sit'
  /** 打坐场景里不需要卡片底板，只要人物 + 名牌 */
  bare?: boolean
  popup?: { text: string; isCrit: boolean; category: string; key: number } | null
}>()

const hpPercent = computed(() => {
  if (props.hp === undefined || !props.maxHp) return 100
  return Math.max(0, Math.min(100, Math.round((props.hp / props.maxHp) * 100)))
})
const isDown = computed(() => props.hp !== undefined && props.hp <= 0)
const rageFull = computed(() => (props.rage ?? 0) >= 100 && !isDown.value)

const figureBox = computed(() => {
  if (props.size === 'sm') return 'h-[5rem]'
  if (props.size === 'lg') return 'h-[8.5rem] md:h-[11rem]'
  return 'h-[6rem] md:h-[8rem]'
})

const animClass = computed(() => {
  if (props.anim === 'LUNGE_ALLY') return 'anim-lunge-ally'
  if (props.anim === 'LUNGE_ENEMY') return 'anim-lunge-enemy'
  if (props.anim === 'HIT') return 'anim-hit'
  return ''
})

const popupClass = computed(() => {
  if (!props.popup) return ''
  if (props.popup.category === 'dodge') return 'text-jade text-lg'
  if (props.popup.category === 'heal') return 'text-jade text-xl'
  if (props.popup.isCrit) return 'text-gold text-2xl'
  if (props.popup.category === 'qi') return 'text-gold text-xl'
  return 'text-cinnabar text-xl'
})

/** 竖排题名取“姓名”部分（去掉【称号】与“·”前缀） */
const verticalName = computed(() => {
  const cleaned = props.name.replace(/【.*?】/g, '').replace(/.*·/, '').trim()
  return (cleaned || props.name).slice(0, 4)
})
</script>

<template>
  <div
    class="relative select-none transition-opacity duration-300"
    :class="[
      bare ? '' : 'well',
      !bare && isMain ? 'border-t-2 !border-t-[var(--gold)]' : '',
      rageFull ? 'anim-pulse-glow' : '',
      isDown ? 'opacity-45 grayscale' : '',
    ]"
  >
    <!-- 战斗飘字 -->
    <div
      v-if="popup"
      :key="popup.key"
      class="pointer-events-none absolute left-1/2 top-0 z-30 whitespace-nowrap font-brush font-bold [animation:dmgFloat_0.9s_ease-out_forwards] [text-shadow:0_2px_6px_rgba(0,0,0,0.85)]"
      :class="popupClass"
    >
      {{ popup.text }}
    </div>

    <!-- 人物舞台 -->
    <div class="relative overflow-hidden" :class="[figureBox, bare ? '' : 'rounded-[1px]']">
      <template v-if="!bare">
        <div
          class="absolute inset-0"
          :style="{
            background: isEnemy
              ? 'radial-gradient(ellipse at 50% 85%, color-mix(in srgb, var(--cinnabar) 22%, transparent), transparent 70%)'
              : 'radial-gradient(ellipse at 50% 85%, var(--gold-soft), transparent 70%)',
          }"
        />
        <svg viewBox="0 0 100 100" class="absolute inset-0 h-full w-full opacity-60" preserveAspectRatio="xMidYMid slice">
          <circle cx="50" cy="52" r="34" fill="none" :stroke="isEnemy ? 'var(--cinnabar)' : 'var(--gold)'" stroke-width="0.7" opacity="0.4" />
          <path d="M0,100 L0,80 Q22,64 44,80 T100,72 L100,100 Z" fill="currentColor" opacity="0.08" />
        </svg>
      </template>

      <div class="relative flex h-full items-end justify-center" :class="animClass">
        <div class="h-full" :class="[isEnemy ? '[transform:scaleX(-1)]' : '', pose === 'sit' ? 'anim-breathe' : '']">
          <InkFigure :style-type="styleType" :pose="pose ?? 'stand'" />
        </div>
      </div>

      <!-- 受击红闪 -->
      <div
        v-if="anim === 'HIT'"
        class="pointer-events-none absolute inset-0 [animation:hitFlash_0.4s_ease-out_forwards]"
        style="background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--cinnabar) 70%, transparent), transparent 70%)"
      />

      <!-- 竖排题名 -->
      <div
        v-if="!bare"
        class="vertical-rl font-brush absolute left-1.5 top-1.5 z-20 text-xs leading-none text-ink3 opacity-90"
      >
        {{ verticalName }}
      </div>

      <div v-if="isDown" class="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
        <span class="chip bg-black/40">力竭</span>
      </div>
    </div>

    <!-- 名牌 -->
    <div
      class="text-center"
      :class="bare ? 'mx-auto mt-1 w-fit max-w-full rounded-[2px] border border-line bg-[color-mix(in_srgb,var(--bg-1)_76%,transparent)] px-2 py-0.5 backdrop-blur-[2px]' : 'px-1.5 pb-1.5 pt-1'"
    >
      <div class="truncate text-sm font-bold leading-tight" :class="[isEnemy ? 'text-cinnabar' : isMain ? 'text-gold' : '']">
        {{ name }}
      </div>
      <div v-if="subtitle" class="mt-0.5 truncate text-xs leading-tight text-ink3">{{ subtitle }}</div>

      <!-- 气血 / 怒气 -->
      <div v-if="hp !== undefined && maxHp" class="mt-1.5 space-y-1">
        <div class="bar bar-thin" :class="isEnemy ? 'bar-red' : 'bar-jade'">
          <i :style="{ width: `${hpPercent}%` }" />
        </div>
        <div v-if="rage !== undefined" class="bar bar-thin bar-gold" style="height: 0.18rem">
          <i :style="{ width: `${Math.min(100, Math.max(0, rage))}%` }" />
        </div>
        <div class="flex items-center justify-between text-xs leading-none tabular-nums text-ink2">
          <span>{{ hp.toLocaleString() }}</span>
          <span v-if="rage !== undefined" :class="rageFull ? 'font-bold text-gold' : 'text-ink3'">
            {{ rageFull ? '怒满' : `怒 ${rage}` }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
