<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminReportDTO } from '../../../shared/admin.ts'
import { adminApi, errorText } from './api'
import TrendBars from './TrendBars.vue'

/** 报表：近 14 天（北京时间按日）新增、活跃、元宝产销、结缘、商店收入、最高在线；留存与分布 */
const data = ref<AdminReportDTO | null>(null)
const error = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    data.value = await adminApi<AdminReportDTO>('GET', '/reports')
    error.value = ''
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    loading.value = false
  }
}
void load()

/** 图从左到右按日期先后 */
const series = (pick: (day: AdminReportDTO['days'][number]) => number) =>
  [...(data.value?.days ?? [])].reverse().map((day) => ({ label: day.day, value: pick(day) }))
const charts = computed(() => [
  { title: '每日新增', points: series(({ newPlayers }) => newPlayers), unit: ' 人' },
  { title: '每日活跃', points: series(({ active }) => active), unit: ' 人' },
  { title: '每日元宝消耗', points: series(({ ingotOut }) => ingotOut), unit: ' 元宝' },
  { title: '每日最高在线', points: series(({ peakOnline }) => peakOnline ?? 0), unit: ' 人' },
])
const rate = (count: number | null, cohort: number) => count === null ? '—' : `${count}（${cohort ? Math.round(count / cohort * 100) : 0}%）`
const spreads = computed(() => data.value ? [
  { title: '等级', rows: data.value.levels },
  { title: '境界', rows: data.value.realms },
  { title: '门派', rows: data.value.sects },
  { title: '所在地图', rows: data.value.maps },
] : [])
const widest = (rows: { count: number }[]) => Math.max(1, ...rows.map(({ count }) => count))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">报表</h2>
      <div class="flex items-center gap-2">
        <span class="muted text-sm">近 14 天 · 北京时间按日</span>
        <button class="btn btn-sm" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>

    <template v-if="data">
      <div class="grid gap-3 lg:grid-cols-2">
        <TrendBars v-for="chart in charts" :key="chart.title" :title="chart.title" :points="chart.points" :unit="chart.unit" />
      </div>

      <div class="card overflow-x-auto">
        <h3 class="px-3 pt-3 font-semibold">每日明细</h3>
        <table class="table mt-2 text-sm">
          <thead>
            <tr><th>日期</th><th class="text-right">新增</th><th class="text-right">活跃</th><th class="text-right">元宝产出</th><th class="text-right">元宝消耗</th><th class="text-right">结缘抽数</th><th class="text-right">商行元宝</th><th class="text-right">最高在线</th></tr>
          </thead>
          <tbody>
            <tr v-for="day in data.days" :key="day.day" class="tabular-nums">
              <td>{{ day.day }}</td>
              <td class="text-right">{{ day.newPlayers.toLocaleString() }}</td>
              <td class="text-right">{{ day.active.toLocaleString() }}</td>
              <td class="text-right ok">{{ day.ingotIn.toLocaleString() }}</td>
              <td class="text-right danger">{{ day.ingotOut.toLocaleString() }}</td>
              <td class="text-right">{{ day.gacha.toLocaleString() }}</td>
              <td class="text-right">{{ day.shopIngot.toLocaleString() }}</td>
              <td class="text-right">{{ day.peakOnline?.toLocaleString() ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p class="muted px-3 pb-3 text-xs">活跃：当天有过任何操作（收功、闯关、买卖等）。最高在线每 5 分钟取一次点，上线这项功能之前的日子没有数据。</p>
      </div>

      <div class="card overflow-x-auto">
        <h3 class="px-3 pt-3 font-semibold">新侠客留存</h3>
        <table class="table mt-2 text-sm">
          <thead><tr><th>建角日</th><th class="text-right">人数</th><th class="text-right">次日还来</th><th class="text-right">第 3 日</th><th class="text-right">第 7 日</th></tr></thead>
          <tbody>
            <tr v-if="!data.retention.length"><td colspan="5" class="muted">近 14 天没有新建角色。</td></tr>
            <tr v-for="row in data.retention" :key="row.day" class="tabular-nums">
              <td>{{ row.day }}</td>
              <td class="text-right">{{ row.cohort }}</td>
              <td class="text-right">{{ rate(row.d1, row.cohort) }}</td>
              <td class="text-right">{{ rate(row.d3, row.cohort) }}</td>
              <td class="text-right">{{ rate(row.d7, row.cohort) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="muted px-3 pb-3 text-xs">「—」表示还没到那一天。上线报表之前建的角色，建角日都记在那次更新的当天。</p>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <section v-for="spread in spreads" :key="spread.title" class="card p-3">
          <h3 class="font-semibold">{{ spread.title }}分布</h3>
          <ul class="mt-2 space-y-1.5 text-sm">
            <li v-for="row in spread.rows.slice(0, 12)" :key="row.label" class="grid grid-cols-[7rem_1fr_3rem] items-center gap-2">
              <span class="truncate" :title="row.label">{{ row.label }}</span>
              <span class="spread-track"><i :style="{ width: `${row.count / widest(spread.rows) * 100}%` }" /></span>
              <b class="text-right font-normal tabular-nums">{{ row.count.toLocaleString() }}</b>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.spread-track { display: block; height: 0.6rem; }
.spread-track i { display: block; height: 100%; min-width: 2px; border-radius: 0 4px 4px 0; background: var(--accent); }
</style>
