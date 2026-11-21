<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ anchor: HTMLElement; wide?: boolean }>()
const emit = defineEmits<{ dismiss: [] }>()
const card = ref<HTMLElement>()
let observer: ResizeObserver | undefined

function position() {
  if (!card.value?.matches(':popover-open')) return
  const anchor = props.anchor.getBoundingClientRect()
  const { width, height } = card.value.getBoundingClientRect()
  const edge = 10, gap = 8
  let left = (innerWidth - width) / 2
  if (anchor.right + gap + width <= innerWidth - edge) left = anchor.right + gap
  else if (anchor.left - gap - width >= edge) left = anchor.left - gap - width
  card.value.style.left = left + 'px'
  card.value.style.top = Math.max(edge, Math.min(anchor.top, innerHeight - height - edge)) + 'px'
}

function onToggle() {
  if (card.value && !card.value.matches(':popover-open')) emit('dismiss')
}
onMounted(() => {
  card.value!.showPopover()
  position()
  card.value!.focus({ preventScroll: true })
  observer = new ResizeObserver(position)
  observer.observe(card.value!)
  window.addEventListener('resize', position)
  document.addEventListener('scroll', position, true)
})
watch(() => props.anchor, position, { flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', position)
  document.removeEventListener('scroll', position, true)
})
</script>

<template>
  <div ref="card" popover="auto" role="dialog" tabindex="-1" class="item-popover" :class="{ wide }" @toggle="onToggle">
    <slot />
  </div>
</template>

<style scoped>
.item-popover {
  position: fixed; inset: auto; margin: 0; width: min(28rem, calc(100vw - 20px));
  max-height: min(85dvh, calc(100dvh - 20px)); overflow: auto; color: var(--ink);
  border: 1px solid var(--line-strong); border-top: 2px solid var(--tc, var(--gold));
  background: var(--bg-1); box-shadow: 0 .5rem 1.8rem #0008;
}
.item-popover:popover-open { display: flex; flex-direction: column; }
.item-popover:not(:popover-open) { display: none; }
.item-popover.wide { width: min(40rem, calc(100vw - 20px)); }
</style>
