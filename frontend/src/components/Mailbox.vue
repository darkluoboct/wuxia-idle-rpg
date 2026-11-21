<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Mail } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { mailAttachmentText } from '../../../shared/admin.ts'
import RewardTray from './RewardTray.vue'

const emit = defineEmits<{ bag: [id: string]; close: [] }>()
const store = useGameStore()
const dialog = ref<HTMLDialogElement>()
const selected = defineModel<string>('selected', { required: true })
const loading = ref(true)
watch(() => store.mails, (letters) => {
  if (!letters.some((letter) => letter.id === selected.value)) {
    selected.value = (letters.find((letter) => !letter.claimed) ?? letters[0])?.id ?? ''
  }
}, { immediate: true })
const index = computed(() => store.mails.findIndex((entry) => entry.id === selected.value))
const mail = computed(() => store.mails[index.value])
const hasAttachments = computed(() => mail.value && !!mailAttachmentText(mail.value.attachments))
const bagItem = computed(() => {
  const loot = mail.value?.attachments
  return loot?.items?.[0] ?? Object.keys(loot?.pills ?? {})[0] ?? Object.keys(loot?.fragments ?? {})[0]
})
const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
onMounted(async () => {
  dialog.value?.showModal()
  await store.refreshMail()
  loading.value = false
})
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <dialog ref="dialog" class="mail-dialog" aria-labelledby="mail-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="letter-paper">
      <header class="letter-head">
        <h2 id="mail-title"><Mail aria-hidden="true" />江湖来信</h2>
        <nav v-if="store.mails.length > 1" aria-label="翻阅信件">
          <button class="btn btn-sm" aria-label="上一封" :disabled="index <= 0" @click="selected = store.mails[index - 1].id"><ChevronLeft /></button>
          <span class="tabular-nums">{{ index + 1 }} / {{ store.mails.length }}</span>
          <button class="btn btn-sm" aria-label="下一封" :disabled="index >= store.mails.length - 1" @click="selected = store.mails[index + 1].id"><ChevronRight /></button>
        </nav>
        <button class="btn btn-sm" autofocus @click="emit('close')">关上</button>
      </header>
      <template v-if="mail">
        <article :key="mail.id" class="letter-content">
          <h3>{{ mail.title }}</h3>
          <p class="letter-date">{{ date.format(mail.createdAt) }} 送达</p>
          <p class="letter-body">{{ mail.body }}</p>
          <RewardTray label="随信附件" :source="mail.title" :rewards="mail.attachments" />
        </article>
        <footer class="letter-actions">
          <div><p>{{ hasAttachments ? (mail.claimed ? '附件已领取' : '附件待领取') : (mail.claimed ? '已读' : '未读') }}</p>
            <small>{{ date.format(mail.expiresAt) }} 前有效</small></div>
          <button v-if="!mail.claimed" class="btn btn-seal" :disabled="store.onlineActionBusy" @click="store.claimMail(mail)">{{ hasAttachments ? '领取附件' : '标为已读' }}</button>
          <button v-else-if="bagItem" class="btn btn-gold" @click="emit('bag', bagItem)">在背包中查看</button>
        </footer>
      </template>
      <p v-else class="letter-empty" role="status">{{ loading ? '正在收信…' : '还没有来信。' }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.mail-dialog { position: fixed; inset: 0; margin: auto; padding: 0; width: min(48rem, 94vw); height: min(31rem, 90dvh); max-width: none; max-height: none; color: var(--ink); border: 1px solid var(--frame-edge); background: var(--bg-1); }
.mail-dialog::backdrop { background: var(--scrim); }
.letter-paper { height: 100%; display: flex; flex-direction: column; padding: .8rem clamp(1rem, 4vw, 2.6rem);
  background: linear-gradient(105deg, var(--bg-1) 15%, color-mix(in srgb, var(--bg-1) 89%, transparent)), url('../assets/jiaxing-spring.webp') center/cover; }
.letter-head, .letter-head h2, .letter-head nav, .letter-actions { display: flex; align-items: center; gap: .65rem; }
.letter-head { padding-bottom: .55rem; border-bottom: 1px solid var(--frame-edge); }
.letter-head h2 { margin-right: auto; font: 1.45rem var(--font-brush); color: var(--gold); }
.letter-head svg { width: 1.12em; height: 1.12em; }
.letter-head nav, .letter-actions small, .letter-date { color: var(--ink-3); font-size: .8rem; }
.letter-content { flex: 1; min-height: 0; overflow: auto; padding-block: clamp(.65rem, 3vh, 1.6rem); }
.letter-content h3 { font: clamp(1.6rem, 4vw, 2.3rem)/1.2 var(--font-brush); overflow-wrap: anywhere; }
.letter-date { margin-top: .35rem; }
.letter-body { margin-block: 1.1rem; line-height: 1.9; white-space: pre-wrap; overflow-wrap: anywhere; }
.letter-actions { justify-content: space-between; flex: none; padding-top: .5rem; border-top: 1px solid var(--line); }
.letter-actions p { color: var(--ink-2); font-size: .88rem; }
.letter-empty { margin: auto; padding: 1rem; color: var(--ink-2); }
</style>
