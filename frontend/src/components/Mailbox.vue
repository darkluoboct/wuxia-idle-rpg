<script setup lang="ts">
import { useGameStore } from '@/stores/gameStore'
import { mailAttachmentText } from '../../../shared/admin.ts'

/** 江湖来信（docs/22）：运营发来的系统邮件，附件领一次 */
const store = useGameStore()
const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
void store.refreshMail()
const vFocus = { mounted: (el: HTMLElement) => el.focus() }
</script>

<template>
  <div class="fixed inset-0 z-[72] flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px]" @click.self="store.mailboxOpen = false">
    <article
      class="panel anim-modal flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-hidden p-5" role="dialog" aria-modal="true"
      aria-labelledby="mailbox-title" @keydown.esc="store.mailboxOpen = false"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="seal h-7 w-7 shrink-0 text-base">信</span>
          <h4 id="mailbox-title" class="font-brush text-2xl leading-tight text-gold">江湖来信</h4>
        </div>
        <button v-focus class="btn btn-sm" @click="store.mailboxOpen = false">关上</button>
      </div>
      <ul class="min-h-0 space-y-2 overflow-y-auto border-t border-line pt-3" aria-label="信件">
        <li v-if="!store.mails.length" class="py-8 text-center text-sm text-ink3">还没有来信。</li>
        <li v-for="mail in store.mails" :key="mail.id" class="well space-y-1.5 p-3" :class="mail.claimed ? 'opacity-70' : '!border-gold'">
          <div class="flex flex-wrap items-baseline justify-between gap-x-2">
            <b class="text-sm" :class="mail.claimed ? '' : 'text-gold'">{{ mail.title }}</b>
            <span class="text-xs tabular-nums text-ink3">{{ date.format(mail.createdAt) }} · {{ date.format(mail.expiresAt) }} 前有效</span>
          </div>
          <p v-if="mail.body" class="whitespace-pre-line text-sm leading-relaxed text-ink2">{{ mail.body }}</p>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs text-ink2">{{ mailAttachmentText(mail.attachments) ? `附：${mailAttachmentText(mail.attachments)}` : '没有附件' }}</span>
            <span v-if="mail.claimed" class="chip">已领</span>
            <button v-else class="btn btn-sm btn-seal" :disabled="store.onlineActionBusy" @click="store.claimMail(mail)">
              {{ mailAttachmentText(mail.attachments) ? '领取' : '已读' }}
            </button>
          </div>
        </li>
      </ul>
    </article>
  </div>
</template>
