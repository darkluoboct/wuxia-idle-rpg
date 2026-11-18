<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { AdminAnnouncementDTO, AdminPermission } from '../../../shared/admin.ts'
import { adminApi, errorText, formatTime } from './api'

/** 全服公告：在线侠客立刻收到，之后上线的在江湖快报看到；到期或撤下即止 */
const props = defineProps<{ can: (permission: AdminPermission) => boolean }>()
const HOUR = 3_600_000
const DURATIONS = [{ label: '1 小时', hours: 1 }, { label: '3 小时', hours: 3 }, { label: '12 小时', hours: 12 }, { label: '1 天', hours: 24 }, { label: '3 天', hours: 72 }, { label: '7 天', hours: 168 }]

const list = ref<AdminAnnouncementDTO[]>([])
const error = ref('')
const busy = ref(false)
const form = reactive({ content: '', startsAt: '', hours: 24 })

async function load() {
  try {
    list.value = await adminApi<AdminAnnouncementDTO[]>('GET', '/announcements')
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void load()

function status(row: AdminAnnouncementDTO, now = Date.now()) {
  if (row.revoked) return { text: '已撤下', cls: '' }
  if (now < row.startsAt) return { text: '未开始', cls: 'tag-warn' }
  if (now >= row.endsAt) return { text: '已结束', cls: '' }
  return { text: '生效中', cls: 'tag-ok' }
}

async function publish() {
  // datetime-local 按浏览器所在时区解释
  const startsAt = form.startsAt ? new Date(form.startsAt).getTime() : Date.now()
  if (!window.confirm(`发布公告：\n${form.content}\n${form.startsAt ? `自 ${formatTime(startsAt)} 起` : '立即生效'}，持续 ${DURATIONS.find(({ hours }) => hours === form.hours)?.label}`)) return
  busy.value = true
  error.value = ''
  try {
    await adminApi('POST', '/announcements', { content: form.content, ...(form.startsAt ? { startsAt } : {}), endsAt: startsAt + form.hours * HOUR })
    form.content = ''
    form.startsAt = ''
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

async function revoke(row: AdminAnnouncementDTO) {
  if (!window.confirm(`撤下这条公告？\n${row.content}`)) return
  try {
    await adminApi('POST', `/announcements/${row.id}/revoke`)
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">全服公告</h2>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <form v-if="props.can('announce')" class="card space-y-3 p-4" @submit.prevent="publish">
      <textarea v-model="form.content" class="input w-full" rows="2" maxlength="120" placeholder="公告内容（120 字内），如：今晚 23:00 停服维护半小时" aria-label="公告内容" required />
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <label class="flex items-center gap-1.5">开始 <input v-model="form.startsAt" class="input" type="datetime-local" aria-label="开始时间"></label>
        <span class="muted text-xs">不填为立即；按你电脑的时区</span>
        <label class="flex items-center gap-1.5">持续
          <select v-model.number="form.hours" class="input" aria-label="持续时长">
            <option v-for="option in DURATIONS" :key="option.hours" :value="option.hours">{{ option.label }}</option>
          </select>
        </label>
        <button class="btn btn-primary" :disabled="busy || !form.content.trim()">发布</button>
      </div>
    </form>
    <p v-else class="muted text-sm">发布公告需运营权限。</p>
    <div class="card overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>内容</th><th>状态</th><th>时段（北京时间）</th><th>发布人</th><th /></tr></thead>
        <tbody>
          <tr v-if="!list.length"><td colspan="5" class="muted">还没有公告。</td></tr>
          <tr v-for="row in list" :key="row.id">
            <td class="max-w-96">{{ row.content }}</td>
            <td><span class="tag" :class="status(row).cls">{{ status(row).text }}</span></td>
            <td class="whitespace-nowrap text-xs">{{ formatTime(row.startsAt) }}<br>{{ formatTime(row.endsAt) }}</td>
            <td>{{ row.createdBy ?? '—' }}</td>
            <td><button v-if="props.can('announce') && !row.revoked && row.endsAt > Date.now()" class="btn btn-sm btn-danger" @click="revoke(row)">撤下</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
