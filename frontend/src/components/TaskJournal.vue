<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ScrollText } from 'lucide-vue-next'
import JournalActivities from './JournalActivities.vue'

const page = defineModel<'quest' | 'play'>('page', { required: true })
const choice = defineModel<string>('choice', { required: true })
const emit = defineEmits<{ close: []; navigate: [] }>()
const dialog = ref<HTMLDialogElement>()
const targetStage = ref<number>()
function tab(next: typeof page.value) {
  targetStage.value = undefined
  page.value = next
}
function enterActivity() {
  if (targetStage.value) { page.value = 'quest'; choice.value = 'guide' }
  emit('navigate')
}
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog ref="dialog" class="task-journal" aria-labelledby="task-journal-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <section class="journal-frame">
      <header class="journal-head">
        <h2 id="task-journal-title"><ScrollText aria-hidden="true" />任务与玩法</h2>
        <button class="btn btn-sm" @click="emit('close')">关上</button>
      </header>
      <nav class="tabs" role="tablist" aria-label="任务栏目">
        <button role="tab" class="tab" :aria-selected="page === 'quest'" @click="tab('quest')">任务</button>
        <button role="tab" class="tab" :aria-selected="page === 'play'" @click="tab('play')">玩法</button>
      </nav>
      <JournalActivities v-model="choice" :page="page" :target-stage="targetStage"
        @trial="targetStage = $event; page = 'play'; choice = 'trial'" @back="tab('quest'); choice = 'guide'" @navigate="enterActivity" />
    </section>
  </dialog>
</template>

<style>
.task-journal { position: fixed; inset: 0; margin: auto; padding: 0; width: min(75rem, 96vw); height: min(40rem, 92dvh); max-width: none; max-height: none; color: var(--ink); background: var(--bg-1); border: 1px solid var(--frame-edge); }
.task-journal::backdrop { background: var(--scrim); }
.journal-frame { height: 100%; display: flex; flex-direction: column; gap: .65rem; padding: .8rem 1rem; }
.journal-head, .journal-head h2, .journal-actions { display: flex; align-items: center; gap: .6rem; }
.journal-head { justify-content: space-between; }.journal-head h2 { color: var(--gold); font: 1.55rem var(--font-brush); }
.journal-head svg { width: 1.1em; height: 1.1em; }
.journal-list button[aria-pressed=true] { color: var(--gold); background: var(--gold-soft); box-shadow: inset 0 -1px var(--gold); }
.journal-columns { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(9rem,26%) minmax(0,1fr); gap: .7rem; }
.journal-list,.journal-sheet { min-width: 0; min-height: 0; border: 1px solid var(--line); padding: .9rem; }
.journal-list { overflow: auto; }.journal-list .sec-title { margin-bottom: .65rem; }
.journal-row { display: block; width: 100%; text-align: left; padding: .7rem; border-bottom: 1px solid var(--line); }
.journal-row :is(b,small) { display: block; }.journal-row small,.journal-actions small { color: var(--ink-3); }
.journal-sheet { display: flex; flex-direction: column; gap: .6rem; }
.journal-scroll { flex: 1; min-height: 0; overflow: auto; }
.journal-kicker { color: var(--gold); font-size: .83rem; }
.journal-scroll h2 { margin: .15rem 0 .35rem; font: 2.1rem/1.2 var(--font-brush); }
.journal-scroll > .sec-title { margin: 1rem 0 .5rem; }
.journal-scroll blockquote { margin: 1rem 0; color: var(--gold); font: 1.25rem/1.7 var(--font-brush); }
.journal-figure { float: right; width: min(28%,12rem); margin: .3rem 0 .6rem 1rem; text-align: center; background: var(--bg-2); border: 1px solid var(--line); }
.journal-figure img { width: 100%; height: min(21vh,11rem); object-fit: contain; }.journal-figure figcaption { font-size: .8rem; color: var(--ink-2); }
.journal-actions { flex: none; justify-content: end; padding-top: .45rem; border-top: 1px solid var(--line); }.journal-actions small { margin-right: auto; }
.journal-sheet .reward-tray { max-height: 34%; overflow: auto; flex: none; }
</style>
