<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ADMIN_ROLE_LABEL, type AdminAccountDTO, type AdminMeDTO, type AdminRole } from '../../../shared/admin.ts'
import { adminApi, errorText, formatTime } from './api'

/** 后台账号（仅超管）：建号、改权限、停用或启用、重设密码；不能对自己降权或停用 */
const props = defineProps<{ me: AdminMeDTO }>()
const ROLES = Object.keys(ADMIN_ROLE_LABEL) as AdminRole[]
const list = ref<AdminAccountDTO[]>([])
const error = ref('')
const notice = ref('')
const form = reactive({ loginName: '', password: '', role: 'SUPPORT' as AdminRole })

async function load() {
  try {
    list.value = await adminApi<AdminAccountDTO[]>('GET', '/admins')
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void load()

async function run(task: () => Promise<unknown>, done: string) {
  error.value = ''
  notice.value = ''
  try {
    await task()
    notice.value = done
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  }
}

const create = () => run(async () => {
  await adminApi('POST', '/admins', form)
  form.loginName = ''
  form.password = ''
}, '已建好后台账号')
const update = (row: AdminAccountDTO, body: Record<string, unknown>, done: string) => run(() => adminApi('POST', `/admins/${row.id}`, body), done)
function resetPassword(row: AdminAccountDTO) {
  const password = window.prompt(`给「${row.login}」设新密码（至少 12 位）`)
  if (password) void update(row, { password }, `已重设「${row.login}」的密码，他需要重新登录`)
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">后台账号</h2>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <p v-if="notice" class="ok text-sm" role="status">{{ notice }}</p>
    <form class="card flex flex-wrap items-center gap-2 p-4" @submit.prevent="create">
      <input v-model="form.loginName" class="input" placeholder="账号（字母、数字、下划线）" aria-label="新账号" autocomplete="off" required>
      <input v-model="form.password" class="input" type="password" placeholder="初始密码（至少 12 位）" aria-label="初始密码" autocomplete="new-password" required>
      <select v-model="form.role" class="input" aria-label="权限">
        <option v-for="role in ROLES" :key="role" :value="role">{{ ADMIN_ROLE_LABEL[role] }}</option>
      </select>
      <button class="btn btn-primary">新建</button>
    </form>
    <p class="muted text-xs">客服：查看、禁言、踢下线。运营：再加封号、重置玩家密码、发邮件、发公告。超管：再加管理后台账号。</p>
    <div class="card overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>账号</th><th>权限</th><th>状态</th><th>建立</th><th /></tr></thead>
        <tbody>
          <tr v-for="row in list" :key="row.id">
            <td>{{ row.login }}<span v-if="row.id === props.me.id" class="muted text-xs">（你）</span></td>
            <td>
              <select
                class="input" :value="row.role" :disabled="row.id === props.me.id" :aria-label="`${row.login} 的权限`"
                @change="update(row, { role: ($event.target as HTMLSelectElement).value }, `已改「${row.login}」的权限`)"
              >
                <option v-for="role in ROLES" :key="role" :value="role">{{ ADMIN_ROLE_LABEL[role] }}</option>
              </select>
            </td>
            <td><span class="tag" :class="row.disabled ? 'tag-danger' : 'tag-ok'">{{ row.disabled ? '已停用' : '启用' }}</span></td>
            <td class="whitespace-nowrap text-xs">{{ formatTime(row.createdAt) }}</td>
            <td class="space-x-1 whitespace-nowrap">
              <button class="btn btn-sm" @click="resetPassword(row)">重设密码</button>
              <button
                v-if="row.id !== props.me.id" class="btn btn-sm" :class="row.disabled ? '' : 'btn-danger'"
                @click="update(row, { disabled: !row.disabled }, row.disabled ? `已启用「${row.login}」` : `已停用「${row.login}」`)"
              >{{ row.disabled ? '启用' : '停用' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
