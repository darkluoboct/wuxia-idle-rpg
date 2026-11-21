<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGameUiStore } from '@/stores/gameUiStore'

const ui = useGameUiStore()
const host = ref<HTMLElement>()
const supportsPopover = typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function'
const glyph = { gold: '喜', danger: '警', info: '讯' }

watch([host, () => ui.toasts.at(-1)?.id], ([element, latest]) => {
  if (!supportsPopover || !element) return
  // 新消息加入时重新入栈，确保它出现在当前模态窗口上方。
  if (element.matches(':popover-open')) element.hidePopover()
  if (latest !== undefined) element.showPopover()
}, { flush: 'post' })
</script>

<template>
  <div ref="host" :popover="supportsPopover ? 'manual' : undefined" class="toast-stack" role="status" aria-live="polite">
    <div v-for="toast in ui.toasts" :key="toast.id" class="toast-message anim-toast" :data-tone="toast.tone">
      <span class="seal toast-stamp" aria-hidden="true">{{ glyph[toast.tone] }}</span>
      <span>{{ toast.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  z-index: 90;
  inset: auto auto calc(3.9rem + env(safe-area-inset-bottom)) 50%;
  width: min(92vw, 26rem);
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  overflow: visible;
  transform: translateX(-50%);
  pointer-events: none;
}
.toast-stack:is(:popover-open, :not([popover])) { display: flex; flex-direction: column-reverse; gap: .45rem; }
.toast-message {
  display: flex;
  align-items: center;
  gap: .6rem;
  padding: .5rem .75rem;
  border: 1px solid var(--line-strong);
  border-radius: 3px;
  background: var(--bg-1);
  box-shadow: 0 6px 24px var(--scrim);
  font-size: .875rem;
}
.toast-message[data-tone="gold"] { color: var(--gold); border-color: var(--gold); }
.toast-message[data-tone="danger"] { color: var(--cinnabar-text); border-color: var(--cinnabar-text); }
.toast-stamp { flex: none; width: 1.5rem; height: 1.5rem; font-size: .875rem; }
.toast-message:not([data-tone="danger"]) .toast-stamp {
  background: transparent;
  color: var(--gold);
  outline-color: var(--gold);
  box-shadow: none;
}
@media (min-width: 768px) { .toast-stack { inset-block-end: 1.5rem; } }
</style>
