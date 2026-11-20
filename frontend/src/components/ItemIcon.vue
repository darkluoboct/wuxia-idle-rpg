<script setup lang="ts">
import { computed } from 'vue'
import { itemIcon, itemIllustration } from '@/config/itemIcons'

const props = defineProps<{ itemId?: string | null; glyph?: string }>()
const illustration = computed(() => props.itemId ? itemIllustration(props.itemId) : undefined)
const art = computed(() => props.itemId ? itemIcon(props.itemId) : undefined)
</script>

<template>
  <span class="item-icon" :class="{ 'item-icon-standalone': illustration }" aria-hidden="true">
    <img v-if="illustration" class="item-icon-illustration" :src="illustration" alt="" loading="lazy" />
    <i v-else-if="art" class="item-icon-art" :style="art" />
    <span v-else-if="glyph" class="font-brush">{{ glyph }}</span>
  </span>
</template>

<style scoped>
.item-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--item-icon-size, 2rem);
  aspect-ratio: 1;
  vertical-align: middle;
  overflow: hidden;
  border: 1px solid var(--tc, var(--line-strong));
  color: var(--ink-3);
  background: var(--bg-2);
}
.item-icon-art {
  position: absolute;
  inset: 1px;
  background-size: 400% 400%;
  background-repeat: no-repeat;
}
.item-icon-standalone {
  width: var(--item-illustration-size, var(--item-icon-size, 2rem));
}
.item-icon-illustration {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
