<script setup lang="ts">
import { computed } from 'vue'
import jiaxing from '@/assets/jiaxing-spring.webp'
import jiaxingDusk from '@/assets/jiaxing-dusk.webp'
import zhongnan from '@/assets/zhongnan.webp'
import damo from '@/assets/damo.webp'
import heizhao from '@/assets/heizhao.webp'

const props = defineProps<{ mapId: string; shichenIdx: number; battle?: boolean; priority?: boolean }>()
const scenes: Record<string, string> = { zhongnan_forest: zhongnan, damo_caravan: damo, heizhao_swamp: heizhao }
const dusk = computed(() => props.shichenIdx === 0 || props.shichenIdx === 5)
const image = computed(() => scenes[props.mapId] ?? (dusk.value ? jiaxingDusk : jiaxing))
</script>

<template>
  <div class="scene-backdrop" :class="{ 'scene-battle': battle, 'scene-night': dusk && mapId !== 'jiaxing_suburb' }" aria-hidden="true">
    <img :src="image" alt="" :loading="priority || battle ? 'eager' : 'lazy'" :fetchpriority="priority ? 'high' : 'auto'" />
  </div>
</template>
