<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  size?: 'sm' | 'md' | 'lg' | 'wide'
  role?: 'dialog' | 'alertdialog'
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
}>(), { size: 'md', closeOnBackdrop: true, closeOnEsc: true })
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()

watch([dialog, () => props.open], ([element, open]) => {
  if (!element || element.open === open) return
  if (open) element.showModal()
  else element.close()
}, { flush: 'post' })
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog ref="dialog" class="base-modal panel anim-modal" :data-size="size" :role="role" :aria-label="title"
    @cancel.prevent="closeOnEsc && emit('close')" @click.self="closeOnBackdrop && emit('close')">
    <div class="base-modal-content"><slot /></div>
  </dialog>
</template>

<style scoped>
.base-modal {
  position: fixed;
  inset: 0;
  width: min(var(--modal-width, 32rem), calc(100% - 1.25rem));
  max-width: none;
  max-height: 92dvh;
  margin: auto;
  padding: 0;
  overflow: auto;
  border: 1px solid var(--frame-edge);
  color: var(--ink);
}
.base-modal[data-size="sm"] { --modal-width: 24rem; }
.base-modal[data-size="lg"] { --modal-width: 43rem; }
.base-modal[data-size="wide"] { --modal-width: 63rem; }
.base-modal::backdrop { background: var(--scrim); }
.base-modal-content { position: relative; }
</style>
