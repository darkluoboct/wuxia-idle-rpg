<script setup lang="ts">
import { ref, useId } from 'vue'
import { CircleHelp } from 'lucide-vue-next'

defineProps<{ title: string; label?: string; wide?: boolean }>()
const dialog = ref<HTMLDialogElement>()
const heading = useId()
const close = () => dialog.value?.close()
</script>

<template>
  <button type="button" class="btn btn-sm" aria-haspopup="dialog" :aria-label="label ?? title" :title="title" @click="dialog?.showModal()">
    <template v-if="label">{{ label }}</template>
    <CircleHelp v-else :size="16" aria-hidden="true" />
  </button>
  <dialog ref="dialog" class="workbench-dialog" :class="{ wide }" :aria-labelledby="heading" @click.self="close">
    <section class="flex max-h-[86dvh] flex-col gap-3 p-4 md:p-5">
      <header class="flex shrink-0 items-center justify-between gap-3 border-b border-line pb-2">
        <h3 :id="heading" class="font-brush text-2xl text-gold">{{ title }}</h3>
        <button type="button" class="btn btn-sm" autofocus @click="close">关上</button>
      </header>
      <div class="min-h-0 space-y-2.5 overflow-auto text-sm leading-relaxed text-ink2"><slot :close="close" /></div>
    </section>
  </dialog>
</template>

<style scoped>
.workbench-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(31rem, 94vw);
  max-width: none;
  max-height: 86dvh;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--frame-edge);
  background: var(--bg-1);
  color: var(--ink);
}
.workbench-dialog.wide { width: min(63rem, 94vw); }
.workbench-dialog::backdrop { background: var(--scrim); }
</style>
