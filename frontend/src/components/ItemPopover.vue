<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ anchor: HTMLElement; wide?: boolean }>()
const emit = defineEmits<{ dismiss: [] }>()
const card = ref<HTMLElement>()
const supportsPopover = typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function'
let observer: ResizeObserver | undefined

function position() {
  if (!card.value || (supportsPopover && !card.value.matches(':popover-open'))) return
  const anchor = props.anchor.getBoundingClientRect()
  const { width, height } = card.value.getBoundingClientRect()
  const edge = 10
  const gap = 8
  const right = anchor.right + gap
  const left = anchor.left - gap - width
  const below = anchor.bottom + gap
  const above = anchor.top - gap - height
  const maxLeft = innerWidth - width - edge
  const maxTop = innerHeight - height - edge
  const side = right <= maxLeft ? right : left >= edge ? left : null
  const top = side !== null ? anchor.top : below <= maxTop ? below : above
  card.value.style.left = `${side ?? Math.max(edge, Math.min(anchor.left, maxLeft))}px`
  card.value.style.top = `${Math.max(edge, Math.min(top, maxTop))}px`
}

function onToggle() {
  if (supportsPopover && card.value && !card.value.matches(':popover-open')) emit('dismiss')
}
function dismissOutside(event: PointerEvent) {
  const path = event.composedPath()
  if (!path.includes(props.anchor) && card.value && !path.includes(card.value)) emit('dismiss')
}
function dismissEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('dismiss')
  }
}
onMounted(() => {
  const element = card.value!
  if (supportsPopover) element.showPopover()
  else {
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissEscape)
  }
  position()
  element.focus({ preventScroll: true })
  observer = new ResizeObserver(position)
  observer.observe(element)
  window.addEventListener('resize', position)
  document.addEventListener('scroll', position, true)
})
watch(() => props.anchor, position, { flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', position)
  document.removeEventListener('scroll', position, true)
  document.removeEventListener('pointerdown', dismissOutside)
  document.removeEventListener('keydown', dismissEscape)
})
</script>

<template>
  <div ref="card" :popover="supportsPopover ? 'auto' : undefined" role="dialog" tabindex="-1" class="item-popover" :class="{ wide }" @toggle="onToggle">
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
.item-popover:is(:popover-open, :not([popover])) { display: flex; flex-direction: column; }
.item-popover:not([popover]) { z-index: 90; }
.item-popover.wide { width: min(40rem, calc(100vw - 20px)); }
</style>
