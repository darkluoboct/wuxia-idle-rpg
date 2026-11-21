<script setup lang="ts">
import { ref, useId } from 'vue'
import { CircleHelp } from 'lucide-vue-next'

defineProps<{ label: string; text: string }>()
const open = ref(false)
const id = useId()
</script>

<template>
  <span class="info-tip" :data-open="open">
    <button type="button" :aria-label="label" :aria-describedby="id" :aria-expanded="open"
      @click="open = !open" @blur="open = false" @keydown.esc.stop="open = false">
      <CircleHelp :size="16" aria-hidden="true" />
    </button>
    <span :id="id" class="tip-content" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.info-tip { position: relative; display: inline-flex; flex: none; vertical-align: middle; }
.info-tip button { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; }
.tip-content {
  position: absolute;
  z-index: var(--z-floating);
  inset: auto 0 calc(100% + .3rem) auto;
  width: min(15rem, 67vw);
  visibility: hidden;
  padding: .45rem .6rem;
  border: 1px solid var(--line-strong);
  border-radius: 3px;
  background: var(--bg-1);
  color: var(--ink);
  box-shadow: 0 .3rem .9rem var(--scrim);
  font-size: .82rem;
  text-align: start;
  white-space: normal;
}
.info-tip[data-open="true"] .tip-content,
.info-tip:has(:focus-visible) .tip-content { visibility: visible; }
@media (hover: hover) { .info-tip:hover .tip-content { visibility: visible; } }
</style>
