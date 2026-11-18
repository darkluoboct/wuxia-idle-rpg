<script setup lang="ts">
import { ref } from 'vue'
import { ADMIN_ACTION_LABEL, ADMIN_ROLE_LABEL, mailAttachmentText, type AdminAuditDTO, type AdminRole, type MailAttachments } from '../../../shared/admin.ts'
import { adminApi, errorText, formatTime } from './api'

/** 审计日志：后台的每一次登录与写操作，倒序，每页 50 条 */
const rows = ref<AdminAuditDTO[]>([])
const error = ref('')
const more = ref(true)

async function load(reset = false) {
  try {
    const before = reset ? '' : rows.value.at(-1)?.id ?? ''
    const page = await adminApi<AdminAuditDTO[]>('GET', `/audit${before ? `?before=${before}` : ''}`)
    rows.value = reset ? page : [...rows.value, ...page]
    more.value = page.length === 50
    error.value = ''
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void load(true)

const FIELD: Record<string, string> = {
  until: '至', reason: '理由', title: '标题', attachments: '附件', content: '内容', startsAt: '开始', endsAt: '结束',
  role: '权限', disabled: '停用', password: '密码', ip: 'IP', existingOnly: '只发已建角', mailId: '邮件', announcementId: '公告',
}

function detailText(detail: Record<string, unknown>) {
  return Object.entries(detail).map(([key, value]) => {
    const label = FIELD[key] ?? key
    if (typeof value === 'number' && (key === 'until' || key === 'startsAt' || key === 'endsAt')) return `${label} ${formatTime(value)}`
    if (key === 'attachments') return `${label} ${mailAttachmentText(value as MailAttachments) || '无'}`
    if (key === 'role') return `${label} ${ADMIN_ROLE_LABEL[value as AdminRole] ?? value}`
    if (key === 'mailId' || key === 'announcementId') return `${label} ${String(value).slice(0, 8)}`
    if (typeof value === 'boolean') return `${label} ${value ? '是' : '否'}`
    return `${label} ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
  }).join('；')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">审计日志</h2>
      <button class="btn btn-sm" @click="load(true)">刷新</button>
    </div>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <div class="card overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>时间</th><th>后台账号</th><th>操作</th><th>对象</th><th>详情</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="whitespace-nowrap text-xs">{{ formatTime(row.at) }}</td>
            <td>{{ row.admin }}</td>
            <td class="whitespace-nowrap">{{ ADMIN_ACTION_LABEL[row.action] ?? row.action }}</td>
            <td class="max-w-56 break-all">{{ row.target ?? '—' }}</td>
            <td class="max-w-96 break-all text-xs muted">{{ detailText(row.detail) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="more && rows.length" class="btn" @click="load()">更早的</button>
  </div>
</template>
