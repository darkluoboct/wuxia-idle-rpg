<script setup lang="ts">
import type { RichSegment } from '@/network/protocol'
import { TIER_META } from '@/config/uiMeta'

defineProps<{ segments: RichSegment[] }>()
const emit = defineEmits<{ inspect: [kind: 'skill' | 'item', id: string] }>()
const DMG_LABEL = { phys: '外功', qi: '内力', true: '真伤', poison: '毒伤', bleed: '流血', reflect: '反伤', heal: '疗伤' } as const
</script>

<template>
  <template v-for="(seg, idx) in segments" :key="idx">
    <span v-if="seg.type === 'text'">{{ seg.text }}</span>
    <span v-else-if="seg.type === 'tag'" class="log-tag" :data-tone="seg.tone">【{{ seg.text }}】</span>
    <b v-else-if="seg.type === 'actor'" :class="seg.isAlly ? 'text-jade' : 'text-cinnabar'">「{{ seg.name }}」</b>
    <button
      v-else-if="seg.type === 'skill' || seg.type === 'item'"
      class="log-item tier-text" :class="TIER_META[seg.tier].cls"
      :title="`${TIER_META[seg.tier].label} · 点击查看详情`" @click="emit('inspect', seg.type, seg.id)"
    >{{ seg.name }}</button>
    <b
      v-else-if="seg.type === 'damage'" class="tabular-nums"
      :class="seg.category === 'heal' ? 'text-jade' : seg.isCrit || seg.category === 'qi' || seg.category === 'true' ? 'text-gold' : 'text-cinnabar'"
    >
      {{ seg.isCrit ? '暴击 ' : '' }}{{ seg.value === 0 ? '' : seg.category === 'heal' ? '+' : '-' }}{{ seg.value.toLocaleString() }}
      <small>({{ DMG_LABEL[seg.category] }})</small>
    </b>
  </template>
</template>
