<script setup lang="ts">
import { reactive, ref } from 'vue'
import { boostLabel, RATE_KIND_LABEL, RATE_LIMITS, type AdminPermission, type AdminRateBoostDTO, type RateBoostKind } from '../../../shared/admin.ts'
import { adminApi, errorText, formatTime, fromLocalInput } from './api'

/** 倍率活动：挂机真气、挂机纹银、巡历掉落按时段加成（docs/22）；不能补到过去，提前结束不收回已累计的 */
const props = defineProps<{ can: (permission: AdminPermission) => boolean }>()

const boosts = ref<AdminRateBoostDTO[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const form = reactive({ kind: 'QI' as RateBoostKind, pct: 100, hours: 24, startsAt: '', title: '' })
const PRESETS = [{ pct: 50, label: '×1.5' }, { pct: 100, label: '×2' }, { pct: 200, label: '×3' }]

async function load() {
  try {
    boosts.value = await adminApi<AdminRateBoostDTO[]>('GET', '/boosts')
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void load()

const status = (boost: AdminRateBoostDTO, now = Date.now()) =>
  boost.endsAt <= now ? { text: '已结束', cls: '' } : boost.startsAt > now ? { text: '未开始', cls: 'tag-warn' } : { text: '进行中', cls: 'tag-ok' }

async function create() {
  const label = boostLabel({ kind: form.kind, pct: form.pct })
  const startsAt = fromLocalInput(form.startsAt)
  if (!window.confirm(`开「${form.title.trim() || label}」：${label}，${startsAt ? `从 ${formatTime(startsAt)} 起` : '即刻起'}共 ${form.hours} 小时。\n全服立刻看到，确定？`)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await adminApi('POST', '/boosts', { kind: form.kind, pct: form.pct, hours: form.hours, startsAt, ...(form.title.trim() ? { title: form.title.trim() } : {}) })
    notice.value = `已开「${form.title.trim() || label}」`
    form.title = ''
    form.startsAt = ''
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

async function end(boost: AdminRateBoostDTO) {
  const upcoming = boost.startsAt > Date.now()
  if (!window.confirm(upcoming ? `取消还没开始的「${boost.title}」？` : `现在结束「${boost.title}」？到此刻为止已累计的加成照算。`)) return
  try {
    await adminApi('POST', `/boosts/${boost.id}/end`)
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">倍率活动</h2>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <p v-if="notice" class="ok text-sm" role="status">{{ notice }}</p>

    <form v-if="props.can('rates')" class="card space-y-3 p-4" @submit.prevent="create">
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <label class="flex items-center gap-1.5">加成
          <select v-model="form.kind" class="input">
            <option v-for="(label, kind) in RATE_KIND_LABEL" :key="kind" :value="kind">{{ label }}</option>
          </select>
        </label>
        <span class="flex items-center gap-1">
          <button v-for="preset in PRESETS" :key="preset.pct" type="button" class="btn btn-sm" :aria-pressed="form.pct === preset.pct" :class="form.pct === preset.pct ? 'btn-primary' : ''" @click="form.pct = preset.pct">{{ preset.label }}</button>
        </span>
        <label class="flex items-center gap-1.5">加成 <input v-model.number="form.pct" class="input w-20" type="number" min="10" :max="RATE_LIMITS.pct" aria-label="加成百分比"> %</label>
        <label class="flex items-center gap-1.5">持续 <input v-model.number="form.hours" class="input w-20" type="number" min="1" :max="RATE_LIMITS.days * 24" aria-label="持续小时"> 小时</label>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <label class="flex items-center gap-1.5">开始 <input v-model="form.startsAt" class="input" type="datetime-local" aria-label="开始时刻（本机时间）"></label>
        <span class="muted text-xs">不填为即刻；按本机时间填写</span>
        <input v-model="form.title" class="input w-64" maxlength="30" placeholder="活动名（可空，默认如「挂机真气 ×2」）" aria-label="活动名">
      </div>
      <p class="muted text-xs">
        真气、纹银按活动时段折算挂机收益（下线挂着也算）；巡历掉落按时段提高小怪掉件几率，封顶必掉。同时段同类活动不叠加，取最高。
        开始时刻最早为此刻，不能补发过去；提前结束只停在此刻，已累计的不收回。
      </p>
      <button class="btn btn-primary" :disabled="busy">开活动 · {{ boostLabel({ kind: form.kind, pct: form.pct || 0 }) }}</button>
    </form>
    <p v-else class="muted text-sm">开活动需运营权限，你可以查看已开的活动。</p>

    <div class="card overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>活动</th><th>加成</th><th>开始 / 结束</th><th>状态</th><th /></tr></thead>
        <tbody>
          <tr v-if="!boosts.length"><td colspan="5" class="muted">还没开过活动。</td></tr>
          <tr v-for="boost in boosts" :key="boost.id">
            <td><div class="font-medium">{{ boost.title }}</div><div class="muted text-xs">{{ boost.createdBy ?? '—' }}</div></td>
            <td>{{ boostLabel(boost) }}</td>
            <td class="whitespace-nowrap text-xs tabular-nums">{{ formatTime(boost.startsAt) }}<br>{{ formatTime(boost.endsAt) }}</td>
            <td><span class="tag" :class="status(boost).cls">{{ status(boost).text }}</span></td>
            <td>
              <button v-if="props.can('rates') && status(boost).text !== '已结束'" class="btn btn-sm btn-danger" @click="end(boost)">
                {{ status(boost).text === '未开始' ? '取消' : '结束' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
