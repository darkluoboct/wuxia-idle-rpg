<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { checkMailAttachments, mailAttachmentText, type AdminMailDTO, type AdminPermission } from '../../../shared/admin.ts'
import { adminApi, blankGoods, errorText, formatTime, goodsOf } from './api'
import GoodsEditor from './GoodsEditor.vue'

/** 系统邮件：单发或全服补偿，附元宝、纹银、真气、装备、残页与丹药；已发的可撤回 */
const props = defineProps<{ can: (permission: AdminPermission) => boolean; target: { id: string; nickname: string } | null }>()
const emit = defineEmits<{ clearTarget: [] }>()

const mails = ref<AdminMailDTO[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const form = reactive({
  audience: 'ALL' as 'ALL' | 'PLAYER', playerId: '', existingOnly: true, title: '', body: '', expiresInDays: 30,
})
const goods = ref(blankGoods())

watch(() => props.target, (target) => {
  if (!target) return
  form.audience = 'PLAYER'
  form.playerId = target.id
}, { immediate: true })

async function load() {
  try {
    mails.value = await adminApi<AdminMailDTO[]>('GET', '/mails')
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void load()

const attachments = computed(() => checkMailAttachments(goodsOf(goods.value)))
const preview = computed(() => 'error' in attachments.value ? '' : mailAttachmentText(attachments.value))

async function send() {
  if ('error' in attachments.value) return void (error.value = attachments.value.error)
  const who = form.audience === 'ALL' ? `全服${form.existingOnly ? '（发信时已建角的侠客）' : '（含之后新建角的侠客）'}` : (props.target?.nickname ?? form.playerId)
  if (!window.confirm(`发给 ${who}：「${form.title}」\n附件：${preview.value || '无'}\n确定发出？`)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await adminApi('POST', '/mails', {
      title: form.title, body: form.body, attachments: attachments.value, expiresInDays: form.expiresInDays,
      ...(form.audience === 'PLAYER' ? { playerId: form.playerId.trim() } : { existingOnly: form.existingOnly }),
    })
    notice.value = `已发出「${form.title}」`
    Object.assign(form, { title: '', body: '' })
    goods.value = blankGoods()
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

async function revoke(mail: AdminMailDTO) {
  if (!window.confirm(`撤回「${mail.title}」？已领过的不受影响，没领的再也领不到。`)) return
  try {
    await adminApi('POST', `/mails/${mail.id}/revoke`)
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">系统邮件</h2>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <p v-if="notice" class="ok text-sm" role="status">{{ notice }}</p>

    <form v-if="props.can('mail')" class="card space-y-3 p-4" @submit.prevent="send">
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <label class="flex items-center gap-1.5"><input v-model="form.audience" type="radio" value="ALL"> 全服</label>
        <label class="flex items-center gap-1.5"><input v-model="form.audience" type="radio" value="PLAYER"> 指定侠客</label>
        <label v-if="form.audience === 'ALL'" class="flex items-center gap-1.5"><input v-model="form.existingOnly" type="checkbox"> 只发给发信时已建角的侠客</label>
        <template v-else>
          <input v-model="form.playerId" class="input w-80 max-w-full font-mono text-xs" placeholder="角色 ID（在「玩家」页点「给他发信」自动填）" aria-label="角色 ID" required>
          <span v-if="props.target && props.target.id === form.playerId" class="tag">{{ props.target.nickname }}</span>
          <button v-if="props.target" type="button" class="btn btn-sm" @click="emit('clearTarget'); form.playerId = ''">清除</button>
        </template>
      </div>
      <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input v-model="form.title" class="input" maxlength="40" placeholder="标题（40 字内）" aria-label="标题" required>
        <label class="flex items-center gap-1.5 text-sm">有效期 <input v-model.number="form.expiresInDays" class="input w-20" type="number" min="1" max="90" aria-label="有效天数"> 天</label>
      </div>
      <textarea v-model="form.body" class="input w-full" rows="3" maxlength="500" placeholder="正文（500 字内，可空）" aria-label="正文" />
      <fieldset class="space-y-2">
        <legend class="text-sm font-medium">附件</legend>
        <GoodsEditor v-model="goods" allow-ingot />
        <p class="text-sm" :class="'error' in attachments ? 'danger' : 'muted'">{{ 'error' in attachments ? attachments.error : `附件：${preview || '无'}` }}</p>
      </fieldset>
      <button class="btn btn-primary" :disabled="busy || !form.title.trim()">发出</button>
    </form>
    <p v-else class="muted text-sm">发信需运营权限，你可以查看已发的信。</p>

    <div class="card overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>标题</th><th>收件</th><th>附件</th><th>领取</th><th>发出 / 过期</th><th /></tr></thead>
        <tbody>
          <tr v-if="!mails.length"><td colspan="6" class="muted">还没发过信。</td></tr>
          <tr v-for="mail in mails" :key="mail.id" :class="mail.revoked ? 'muted' : ''">
            <td><div class="font-medium">{{ mail.title }}</div><div class="muted text-xs">{{ mail.createdBy ?? '—' }}</div></td>
            <td>{{ mail.target ? mail.target.nickname : `全服${mail.existingOnly ? '（已建角）' : ''}` }}</td>
            <td class="max-w-64">{{ mailAttachmentText(mail.attachments) || '—' }}</td>
            <td class="tabular-nums">{{ mail.claims }}</td>
            <td class="whitespace-nowrap text-xs">{{ formatTime(mail.createdAt) }}<br>{{ formatTime(mail.expiresAt) }}</td>
            <td>
              <span v-if="mail.revoked" class="tag">已撤回</span>
              <button v-else-if="props.can('mail')" class="btn btn-sm btn-danger" @click="revoke(mail)">撤回</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
