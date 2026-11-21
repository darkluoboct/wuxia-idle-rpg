<script setup lang="ts">
import type { TierColor } from '@/network/protocol'
import { TIER_META } from '@/config/uiMeta'
import ItemIcon from './ItemIcon.vue'

defineProps<{ name: string; icon: string; type: string; count: number; tier?: TierColor; stars?: number }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <header class="item-card-heading" :class="tier && TIER_META[tier].cls">
    <ItemIcon :item-id="icon" />
    <div class="min-w-0 flex-1">
      <h3 class="font-brush text-2xl leading-tight" :class="tier ? 'tier-text' : 'text-gold'">{{ name }}<small v-if="stars"> +{{ stars }} 星</small></h3>
      <span v-if="tier" class="chip tier-chip">{{ TIER_META[tier].label }}</span>
      <small>{{ type }} · ×{{ count.toLocaleString() }}</small>
    </div>
    <button class="btn btn-sm self-start" aria-label="关闭道具浮窗" @click="$emit('close')">关闭</button>
  </header>
</template>

<style scoped>
.item-card-heading { flex: none; display: flex; align-items: center; gap: .65rem; padding: .65rem .85rem; --item-icon-size: 4.25rem; border-bottom: 1px solid var(--line); background: linear-gradient(105deg, var(--bg-2), var(--bg-1)); }
.item-card-heading .chip { margin: .3rem .5rem 0 0; }
.item-card-heading small { color: var(--ink-2); font-size: .82rem; }
</style>
