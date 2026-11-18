<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import type { AdminPermission, AdminPlayerDetailDTO, AdminPlayerRowDTO } from '../../../shared/admin.ts'
import { ITEMS, MAPS, REALMS, SECTS, SKILLS } from '../../../shared/gameData.ts'
import { isOriginId, ORIGINS } from '../../../shared/origins.ts'
import { adminApi, errorText, formatTime, INGOT_REASON_LABEL } from './api'

/** 玩家：按昵称、账号或角色 ID 查侠客，看资产与流水，封号、禁言、踢下线、重置密码、调整资产、给他发信 */
const props = defineProps<{ can: (permission: AdminPermission) => boolean }>()
const emit = defineEmits<{ write: [player: { id: string; nickname: string }] }>()

const query = ref('')
const rows = ref<AdminPlayerRowDTO[]>([])
const searched = ref(false)
const detail = ref<AdminPlayerDetailDTO | null>(null)
const detailPanel = ref<HTMLElement | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const tempPassword = ref('')
const DURATIONS = [{ label: '1 小时', hours: 1 }, { label: '1 天', hours: 24 }, { label: '3 天', hours: 72 }, { label: '7 天', hours: 168 }, { label: '30 天', hours: 720 }, { label: '永久', hours: null }]
const ban = reactive<{ hours: number | null; reason: string }>({ hours: 24, reason: '' })
const mute = reactive<{ hours: number | null }>({ hours: 24 })
const adjust = reactive({ ingot: 0, silver: 0, qiExp: 0, reason: '' })

const mapName = (id: string) => MAPS.find((map) => map.id === id)?.name ?? id
const realmName = (tier: number) => REALMS.find((realm) => realm.tier === tier)?.name ?? `第 ${tier} 境`
const active = (until: number | null, now = Date.now()) => until !== null && until > now

async function search() {
  error.value = ''
  try {
    rows.value = await adminApi<AdminPlayerRowDTO[]>('GET', `/players?q=${encodeURIComponent(query.value.trim())}`)
    searched.value = true
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void search()

async function open(id: string, reveal = false) {
  error.value = ''
  notice.value = ''
  tempPassword.value = ''
  try {
    detail.value = await adminApi<AdminPlayerDetailDTO>('GET', `/players/${id}`)
    // 窄屏时详情在列表下面，选中后滚过去
    if (reveal && window.matchMedia('(max-width: 1279px)').matches) {
      await nextTick()
      detailPanel.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  } catch (cause) {
    error.value = errorText(cause)
  }
}

const ACTION_TEXT = { ban: '封号', unban: '解封', mute: '禁言', unmute: '解除禁言', kick: '踢下线', resetPassword: '重置密码' } as const
async function act(action: keyof typeof ACTION_TEXT, body: Record<string, unknown> = {}) {
  const player = detail.value
  if (!player || !window.confirm(`确定对「${player.nickname}」${ACTION_TEXT[action]}？`)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await adminApi<{ ok: true; password?: string }>('POST', `/players/${player.id}`, { action, ...body })
    await open(player.id)
    notice.value = `已${ACTION_TEXT[action]}`
    tempPassword.value = result.password ?? ''
    if (action === 'ban') ban.reason = ''
    await search()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

/** 调整资产：正数加、负数扣，必须写原因；元宝进流水，审计留底 */
async function adjustAssets() {
  const player = detail.value
  if (!player) return
  const parts = ([['元宝', adjust.ingot], ['纹银', adjust.silver], ['真气', adjust.qiExp]] as const)
    .filter(([, amount]) => amount).map(([label, amount]) => `${label} ${amount > 0 ? '+' : ''}${amount.toLocaleString()}`)
  if (!parts.length || !window.confirm(`给「${player.nickname}」调整：${parts.join('、')}\n原因：${adjust.reason}\n确定？`)) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await adminApi('POST', `/players/${player.id}/adjust`, { ...adjust, reason: adjust.reason.trim() })
    await open(player.id)
    notice.value = `已调整：${parts.join('、')}`
    Object.assign(adjust, { ingot: 0, silver: 0, qiExp: 0, reason: '' })
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

const assets = computed(() => {
  const player = detail.value
  if (!player) return []
  return [
    ['账号', player.login], ['角色 ID', player.id], ['等级', `Lv.${player.level} · ${realmName(player.realmTier)}`], ['所在', mapName(player.mapId)],
    ['门派', SECTS.find((sect) => sect.id === player.sectId)?.name ?? '散人'], ['家世', player.origin && isOriginId(player.origin) ? ORIGINS[player.origin].name : '—'],
    ['元宝', player.goldIngot.toLocaleString()], ['纹银', player.silver.toLocaleString()], ['真气', player.qiExp.toLocaleString()],
    ['装备', `${player.items} 件`], ['武学', `${player.skills} 门`], ['伙伴', `${player.companions} 位`],
    ['建角', formatTime(player.createdAt)], ['上次收功', formatTime(player.lastSettleAt)],
  ]
})
const gachaName = (kind: string, refId: string | null) => !refId ? kind : (ITEMS[refId]?.name ?? SKILLS[refId]?.name ?? refId)
</script>

<template>
  <div class="space-y-4">
    <form class="flex flex-wrap gap-2" @submit.prevent="search">
      <input v-model="query" class="input min-w-56 flex-1" placeholder="昵称、账号或角色 ID；不填列最近建角的" aria-label="查找侠客">
      <button class="btn btn-primary">查找</button>
    </form>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div class="card overflow-x-auto">
        <table class="table">
          <thead><tr><th>侠客</th><th>等级</th><th>状态</th><th>建角</th></tr></thead>
          <tbody>
            <tr v-if="searched && !rows.length"><td colspan="4" class="muted">没有找到。</td></tr>
            <tr
              v-for="row in rows" :key="row.id" class="cursor-pointer" :class="detail?.id === row.id ? 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : ''"
              tabindex="0" @click="open(row.id, true)" @keydown.enter="open(row.id, true)"
            >
              <td><div class="font-medium">{{ row.nickname }}</div><div class="muted text-xs">{{ row.login }}</div></td>
              <td class="tabular-nums">{{ row.level }}</td>
              <td class="space-x-1">
                <span v-if="row.online" class="tag tag-ok">在线</span>
                <span v-if="active(row.bannedUntil)" class="tag tag-danger">封禁</span>
                <span v-if="active(row.mutedUntil)" class="tag tag-warn">禁言</span>
              </td>
              <td class="muted whitespace-nowrap text-xs">{{ formatTime(row.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="detail" ref="detailPanel" class="card scroll-mt-4 space-y-4 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold">{{ detail.nickname }}</h3>
            <span v-if="detail.online" class="tag tag-ok">在线</span>
          </div>
          <button v-if="props.can('mail')" class="btn btn-sm" @click="emit('write', { id: detail.id, nickname: detail.nickname })">给他发信</button>
        </div>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          <div v-for="[label, value] in assets" :key="label" class="min-w-0"><dt class="muted text-xs">{{ label }}</dt><dd class="truncate" :title="value">{{ value }}</dd></div>
        </dl>

        <div class="space-y-1 text-sm">
          <p v-if="active(detail.bannedUntil)" class="danger">封禁至 {{ formatTime(detail.bannedUntil) }}{{ detail.banReason ? `：${detail.banReason}` : '' }}</p>
          <p v-if="active(detail.mutedUntil)" class="warn">禁言至 {{ formatTime(detail.mutedUntil) }}</p>
          <p v-if="notice" class="ok" role="status">{{ notice }}</p>
          <p v-if="tempPassword" class="card p-2" role="status">临时密码 <b class="font-mono text-base select-all">{{ tempPassword }}</b> <span class="muted">只显示这一次，请转告玩家登录后自行保管</span></p>
        </div>

        <div class="space-y-3 border-t border-[var(--line)] pt-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="w-14 text-sm muted">禁言</span>
            <select v-model="mute.hours" class="input" aria-label="禁言时长" :disabled="!props.can('mute')">
              <option v-for="option in DURATIONS" :key="option.label" :value="option.hours">{{ option.label }}</option>
            </select>
            <button class="btn btn-sm" :disabled="busy || !props.can('mute')" @click="act('mute', { hours: mute.hours })">禁言</button>
            <button v-if="active(detail.mutedUntil)" class="btn btn-sm" :disabled="busy || !props.can('mute')" @click="act('unmute')">解除禁言</button>
            <button class="btn btn-sm" :disabled="busy || !props.can('kick')" @click="act('kick')">踢下线</button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="w-14 text-sm muted">封号</span>
            <select v-model="ban.hours" class="input" aria-label="封号时长" :disabled="!props.can('ban')">
              <option v-for="option in DURATIONS" :key="option.label" :value="option.hours">{{ option.label }}</option>
            </select>
            <input v-model="ban.reason" class="input min-w-40 flex-1" placeholder="封号理由（玩家登录时会看到）" aria-label="封号理由" :disabled="!props.can('ban')">
            <button class="btn btn-sm btn-danger" :disabled="busy || !props.can('ban') || !ban.reason.trim()" @click="act('ban', { hours: ban.hours, reason: ban.reason })">封号</button>
            <button v-if="active(detail.bannedUntil)" class="btn btn-sm" :disabled="busy || !props.can('ban')" @click="act('unban')">解封</button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="w-14 text-sm muted">密码</span>
            <button class="btn btn-sm" :disabled="busy || !props.can('resetPassword')" @click="act('resetPassword')">重置为临时密码</button>
            <span class="muted text-xs">核实身份后再重置；会让他所有设备下线</span>
          </div>
          <div v-if="props.can('adjust')" class="flex flex-wrap items-center gap-2">
            <span class="w-14 text-sm muted">资产</span>
            <label class="flex items-center gap-1 text-sm">元宝 <input v-model.number="adjust.ingot" class="input w-24" type="number" aria-label="元宝增减"></label>
            <label class="flex items-center gap-1 text-sm">纹银 <input v-model.number="adjust.silver" class="input w-28" type="number" aria-label="纹银增减"></label>
            <label class="flex items-center gap-1 text-sm">真气 <input v-model.number="adjust.qiExp" class="input w-28" type="number" aria-label="真气增减"></label>
            <input v-model="adjust.reason" class="input min-w-40 flex-1" maxlength="100" placeholder="调整原因（必填，记进审计）" aria-label="调整原因">
            <button class="btn btn-sm" :disabled="busy || !adjust.reason.trim() || !(adjust.ingot || adjust.silver || adjust.qiExp)" @click="adjustAssets">调整</button>
            <span class="muted w-full pl-16 text-xs">正数为加、负数为扣，扣完不能为负；他在线的话页面会自动刷新。</span>
          </div>
          <p v-if="!props.can('ban')" class="muted text-xs">客服权限只能禁言与踢下线；封号、重置密码、调整资产、发信需运营。</p>
        </div>

        <div class="overflow-x-auto">
          <h4 class="mb-1 font-semibold">元宝流水（最近 50 笔）</h4>
          <table class="table text-sm">
            <thead><tr><th>时间</th><th>来源</th><th class="text-right">变动</th><th class="text-right">余额</th></tr></thead>
            <tbody>
              <tr v-if="!detail.ledger.length"><td colspan="4" class="muted">没有流水。</td></tr>
              <tr v-for="(entry, index) in detail.ledger" :key="index">
                <td class="whitespace-nowrap text-xs">{{ formatTime(entry.at) }}</td>
                <td>{{ INGOT_REASON_LABEL[entry.reason] ?? entry.reason }} <span v-if="entry.ref" class="muted text-xs">{{ entry.ref }}</span></td>
                <td class="text-right tabular-nums" :class="entry.delta < 0 ? 'danger' : 'ok'">{{ entry.delta > 0 ? '+' : '' }}{{ entry.delta }}</td>
                <td class="text-right tabular-nums">{{ entry.balance.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="detail.gacha.length" class="overflow-x-auto">
          <h4 class="mb-1 font-semibold">结缘（最近 20 抽）</h4>
          <table class="table text-sm">
            <thead><tr><th>第几抽</th><th>品阶</th><th>结果</th><th>时间</th></tr></thead>
            <tbody>
              <tr v-for="pull in detail.gacha" :key="pull.pullNo">
                <td class="tabular-nums">{{ pull.pullNo }}</td><td>{{ pull.tier }}</td><td>{{ gachaName(pull.kind, pull.refId) }}</td>
                <td class="whitespace-nowrap text-xs">{{ formatTime(pull.at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="card grid place-items-center p-8 muted">点列表里的侠客查看详情。</div>
    </div>
  </div>
</template>
