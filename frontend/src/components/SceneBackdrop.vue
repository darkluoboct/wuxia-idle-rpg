<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import jiaxing from '@/assets/_optimized/scenes/jiaxing-spring.webp'
import jiaxingDusk from '@/assets/_optimized/scenes/jiaxing-dusk.webp'

const props = defineProps<{ mapId: string; shichenIdx: number; battle?: boolean; priority?: boolean }>()
const scenes: Partial<Record<string, () => Promise<{ default: string }>>> = {
  zhongnan_forest: () => import('@/assets/_optimized/scenes/zhongnan.webp'),
  damo_caravan: () => import('@/assets/_optimized/scenes/damo.webp'),
  heizhao_swamp: () => import('@/assets/_optimized/scenes/heizhao.webp'),
}
const dusk = computed(() => props.shichenIdx === 0 || props.shichenIdx === 5)
const fallback = computed(() => dusk.value ? jiaxingDusk : jiaxing)
const image = ref(fallback.value)
watch([() => props.mapId, fallback], async ([id, jiaxingScene], _, onCleanup) => {
  const load = scenes[id]
  if (!load) { image.value = jiaxingScene; return }
  let active = true
  onCleanup(() => { active = false })
  try {
    const { default: scene } = await load()
    if (active) image.value = scene
  } catch { if (active) image.value = jiaxingScene }
}, { immediate: true })
</script>

<template>
  <div class="scene-backdrop" :class="{ 'scene-battle': battle, 'scene-night': dusk && mapId !== 'jiaxing_suburb' }" aria-hidden="true">
    <img :src="image" alt="" decoding="async" :loading="priority || battle ? 'eager' : 'lazy'" :fetchpriority="priority ? 'high' : 'auto'" />
  </div>
</template>
