<script setup lang="ts">
import { ref } from 'vue'
import type { AdminDeletedPlayerDTO, AdminPermission } from '../../../shared/admin.ts'
import { adminApi, errorText, formatTime } from './api'

/** 已删除的角色（docs/24）：保留 30 天，误删或被盗删时核实身份后恢复 */
const props = defineProps<{ can: (permission: AdminPermission) => boolean }>()
const emit = defineEmits<{ restored: [] }>()

const query = ref('')
const rows = ref<AdminDeletedPlayerDTO[]>([])
const error = ref('')
const notice = ref('')

async function load() {
  error.value = ''
  try {
    rows.value = await adminApi<AdminDeletedPlayerDTO[]>('GET', `/deleted-players?q=${encodeURIComponent(query.value.trim())}`)
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void load()

async function restore(row: AdminDeletedPlayerDTO) {
  if (!window.confirm(`恢复「${row.nickname}」（账号 ${row.login}）？\n请先核实是本人。恢复后装备、武学、伙伴回来，榜单、摊位、共修等随删除清掉的不会回来。`)) return
  notice.value = ''
  try {
    await adminApi('POST', `/deleted-players/${row.id}/restore`)
    notice.value = `已恢复「${row.nickname}」，他重新登录即可进入`
    await load()
    emit('restored')
  } catch (cause) {
    error.value = errorText(cause)
  }
}
</script>

<template>
  <section class="card space-y-3 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="font-semibold">已删除的角色 <span class="muted text-sm font-normal">保留 30 天，期间名号只留给原账号</span></h3>
      <form class="flex gap-2" @submit.prevent="load">
        <input v-model="query" class="input w-56" placeholder="昵称、账号或角色 ID" aria-label="查找已删除的角色">
        <button class="btn btn-sm">查找</button>
      </form>
    </div>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <p v-if="notice" class="ok text-sm" role="status">{{ notice }}</p>
    <div class="overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>角色</th><th>账号</th><th class="text-right">等级</th><th>删除于</th><th>保留至</th><th /></tr></thead>
        <tbody>
          <tr v-if="!rows.length"><td colspan="6" class="muted">没有已删除的角色。</td></tr>
          <tr v-for="row in rows" :key="row.id">
            <td><div class="font-medium">{{ row.nickname }}</div><div class="muted font-mono text-xs">{{ row.id }}</div></td>
            <td>{{ row.login }}</td>
            <td class="text-right tabular-nums">{{ row.level }}</td>
            <td class="whitespace-nowrap text-xs">{{ formatTime(row.deletedAt) }}<div class="muted">{{ row.deletedBy === 'PLAYER' ? '本人删除' : row.deletedBy }}</div></td>
            <td class="whitespace-nowrap text-xs">{{ formatTime(row.purgeAfter) }}</td>
            <td>
              <span v-if="row.blocked" class="tag">{{ row.blocked }}</span>
              <button v-else-if="props.can('restore')" class="btn btn-sm" @click="restore(row)">恢复</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
