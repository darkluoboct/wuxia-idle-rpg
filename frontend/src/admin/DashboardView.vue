<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { AdminDashboardDTO } from '../../../shared/admin.ts'
import { adminApi, errorText, formatTime, INGOT_REASON_LABEL } from './api'

/** 总览：在线、侠客数、今日新增与活跃、封禁中、今日结缘与元宝流水；每半分钟刷新 */
const data = ref<AdminDashboardDTO | null>(null)
const error = ref('')

async function load() {
  try {
    data.value = await adminApi<AdminDashboardDTO>('GET', '/dashboard')
    error.value = ''
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void load()
const timer = setInterval(load, 30_000)
onUnmounted(() => clearInterval(timer))

const stats = computed(() => data.value ? [
  { label: '在线', value: data.value.online },
  { label: '侠客总数', value: data.value.players },
  { label: '今日新增', value: data.value.newToday },
  { label: '今日活跃', value: data.value.activeToday },
  { label: '封禁中', value: data.value.banned },
  { label: '今日结缘抽数', value: data.value.gachaToday },
] : [])
const produced = computed(() => data.value?.ingotToday.filter(({ amount }) => amount > 0).reduce((sum, { amount }) => sum + amount, 0) ?? 0)
const spent = computed(() => data.value?.ingotToday.filter(({ amount }) => amount < 0).reduce((sum, { amount }) => sum - amount, 0) ?? 0)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">总览</h2>
      <span class="muted text-sm">今日按北京时间零点起算 · {{ data ? `更新于 ${formatTime(data.serverTime)}` : '' }}</span>
    </div>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div v-for="stat in stats" :key="stat.label" class="card p-3">
        <div class="muted text-xs">{{ stat.label }}</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums">{{ stat.value.toLocaleString() }}</div>
      </div>
    </div>
    <div v-if="data" class="card overflow-x-auto">
      <div class="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3">
        <h3 class="font-semibold">今日元宝流水</h3>
        <span class="text-sm tabular-nums"><span class="ok">产出 {{ produced.toLocaleString() }}</span> · <span class="danger">消耗 {{ spent.toLocaleString() }}</span></span>
      </div>
      <table class="table mt-2">
        <thead><tr><th>来源</th><th>笔数</th><th class="text-right">合计</th></tr></thead>
        <tbody>
          <tr v-if="!data.ingotToday.length"><td colspan="3" class="muted">今天还没有元宝流水。</td></tr>
          <tr v-for="row in data.ingotToday" :key="row.reason">
            <td>{{ INGOT_REASON_LABEL[row.reason] ?? row.reason }} <span class="muted text-xs">{{ row.reason }}</span></td>
            <td class="tabular-nums">{{ row.count.toLocaleString() }}</td>
            <td class="text-right tabular-nums" :class="row.amount < 0 ? 'danger' : 'ok'">{{ row.amount > 0 ? '+' : '' }}{{ row.amount.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
