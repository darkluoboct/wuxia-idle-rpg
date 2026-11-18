<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { checkShopGoods, mailAttachmentText, type AdminPermission, type AdminShopGoodsDTO } from '../../../shared/admin.ts'
import type { ShopCurrency, ShopLimitKind } from '../../../shared/protocol.ts'
import { adminApi, blankGoods, errorText, formatTime, fromLocalInput, goodsOf } from './api'
import GoodsEditor from './GoodsEditor.vue'

/** 运营商店：上架装备、残页、丹药、纹银、真气，用元宝或纹银卖；可限购、限量、定时下架（docs/22） */
const props = defineProps<{ can: (permission: AdminPermission) => boolean }>()

const list = ref<AdminShopGoodsDTO[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const form = reactive({
  title: '', description: '', currency: 'INGOT' as ShopCurrency, price: 100, limitKind: '' as ShopLimitKind | '', limitCount: 1,
  stock: '' as number | '', hours: '' as number | '', startsAt: '', sort: 0,
})
const goods = ref(blankGoods())
const LIMIT_LABEL: Record<ShopLimitKind, string> = { TOTAL: '每人总计', DAILY: '每人每日', WEEKLY: '每人每周' }
const currencyText = (currency: ShopCurrency, amount: number) => currency === 'INGOT' ? `${amount.toLocaleString()} 元宝` : `${amount.toLocaleString()} 两`

async function load() {
  try {
    list.value = await adminApi<AdminShopGoodsDTO[]>('GET', '/shop')
  } catch (cause) {
    error.value = errorText(cause)
  }
}
void load()

const checked = computed(() => checkShopGoods(goodsOf(goods.value)))
const empty = computed(() => !mailAttachmentText(goodsOf(goods.value)))
const onSale = (entry: AdminShopGoodsDTO, now = Date.now()) =>
  entry.hidden ? '已下架' : entry.startsAt > now ? '未开售' : entry.endsAt !== null && entry.endsAt <= now ? '已过期' : entry.stock !== null && entry.sold >= entry.stock ? '售罄' : '在售'

async function create() {
  if ('error' in checked.value) return void (error.value = checked.value.error)
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await adminApi('POST', '/shop', {
      title: form.title, description: form.description, goods: checked.value, currency: form.currency, price: form.price,
      limit: form.limitKind ? { kind: form.limitKind, count: form.limitCount } : null,
      stock: form.stock === '' ? null : form.stock, hours: form.hours === '' ? null : form.hours,
      startsAt: fromLocalInput(form.startsAt), sort: form.sort,
    })
    notice.value = `已上架「${form.title}」`
    Object.assign(form, { title: '', description: '', stock: '', hours: '', startsAt: '' })
    goods.value = blankGoods()
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    busy.value = false
  }
}

async function update(entry: AdminShopGoodsDTO, changes: Record<string, unknown>) {
  error.value = ''
  try {
    await adminApi('POST', `/shop/${entry.id}`, changes)
    await load()
  } catch (cause) {
    error.value = errorText(cause)
  }
}

function ask(message: string, current: number | null) {
  const answer = window.prompt(message, current === null ? '' : String(current))
  if (answer === null) return undefined
  return answer.trim() === '' ? null : Number(answer)
}
function reprice(entry: AdminShopGoodsDTO) {
  const price = ask(`「${entry.title}」新价格（${entry.currency === 'INGOT' ? '元宝' : '纹银'}）`, entry.price)
  if (price !== undefined && price !== null) void update(entry, { price })
}
function restock(entry: AdminShopGoodsDTO) {
  const stock = ask(`「${entry.title}」全服总库存（已售 ${entry.sold}；留空为不限量）`, entry.stock)
  if (stock !== undefined) void update(entry, { stock })
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">商店</h2>
    <p v-if="error" class="danger text-sm" role="alert">{{ error }}</p>
    <p v-if="notice" class="ok text-sm" role="status">{{ notice }}</p>

    <form v-if="props.can('shop')" class="card space-y-3 p-4" @submit.prevent="create">
      <div class="grid gap-3 sm:grid-cols-[16rem_1fr]">
        <input v-model="form.title" class="input" maxlength="30" placeholder="商品名（30 字内）" aria-label="商品名" required>
        <input v-model="form.description" class="input" maxlength="200" placeholder="说明（可空，玩家能看到）" aria-label="说明">
      </div>
      <fieldset class="space-y-2">
        <legend class="text-sm font-medium">商品内容</legend>
        <GoodsEditor v-model="goods" />
        <p v-if="empty" class="muted text-sm">还没加东西</p>
        <p v-else class="text-sm" :class="'error' in checked ? 'danger' : 'muted'">{{ 'error' in checked ? checked.error : `内含：${mailAttachmentText(checked)}` }}</p>
      </fieldset>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <label class="flex items-center gap-1.5"><input v-model="form.currency" type="radio" value="INGOT"> 元宝</label>
        <label class="flex items-center gap-1.5"><input v-model="form.currency" type="radio" value="SILVER"> 纹银</label>
        <label class="flex items-center gap-1.5">价格 <input v-model.number="form.price" class="input w-28" type="number" min="1" aria-label="价格" required></label>
        <label class="flex items-center gap-1.5">限购
          <select v-model="form.limitKind" class="input" aria-label="限购方式">
            <option value="">不限购</option>
            <option v-for="(label, kind) in LIMIT_LABEL" :key="kind" :value="kind">{{ label }}</option>
          </select>
        </label>
        <label v-if="form.limitKind" class="flex items-center gap-1.5"><input v-model.number="form.limitCount" class="input w-16" type="number" min="1" max="999" aria-label="限购次数"> 次</label>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <label class="flex items-center gap-1.5">全服库存 <input v-model.number="form.stock" class="input w-24" type="number" min="0" placeholder="不限" aria-label="全服库存"></label>
        <label class="flex items-center gap-1.5">开售 <input v-model="form.startsAt" class="input" type="datetime-local" aria-label="开售时刻（本机时间）"></label>
        <label class="flex items-center gap-1.5">上架 <input v-model.number="form.hours" class="input w-24" type="number" min="1" placeholder="长期" aria-label="上架小时数"> 小时</label>
        <label class="flex items-center gap-1.5">排序 <input v-model.number="form.sort" class="input w-20" type="number" min="-999" max="999" aria-label="排序（大的在前）"></label>
      </div>
      <p class="muted text-xs">每日限购在子时（23:00）换日，每周限购在周六 20:00 换周，与每日江湖事、门派演武同步。开售留空为即刻。</p>
      <button class="btn btn-primary" :disabled="busy || !form.title.trim() || 'error' in checked">上架</button>
    </form>
    <p v-else class="muted text-sm">上架商品需运营权限，你可以查看货架与销量。</p>

    <div class="card overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>商品</th><th>内容</th><th>价格</th><th>限购</th><th>库存 / 已售</th><th>收入 / 买家</th><th>上架期</th><th>状态</th><th /></tr></thead>
        <tbody>
          <tr v-if="!list.length"><td colspan="9" class="muted">货架还是空的。</td></tr>
          <tr v-for="entry in list" :key="entry.id" :class="entry.hidden ? 'muted' : ''">
            <td><div class="font-medium">{{ entry.title }}</div><div class="muted text-xs">{{ entry.createdBy ?? '—' }} · 排序 {{ entry.sort }}</div></td>
            <td class="max-w-64">{{ mailAttachmentText(entry.goods) }}</td>
            <td class="whitespace-nowrap tabular-nums">{{ currencyText(entry.currency, entry.price) }}</td>
            <td class="whitespace-nowrap">{{ entry.limit ? `${LIMIT_LABEL[entry.limit.kind]} ${entry.limit.count}` : '不限' }}</td>
            <td class="whitespace-nowrap tabular-nums">{{ entry.stock ?? '不限' }} / {{ entry.sold }}</td>
            <td class="whitespace-nowrap tabular-nums">{{ currencyText(entry.currency, entry.revenue) }} / {{ entry.buyers }} 人</td>
            <td class="whitespace-nowrap text-xs tabular-nums">{{ formatTime(entry.startsAt) }}<br>{{ entry.endsAt ? formatTime(entry.endsAt) : '长期' }}</td>
            <td><span class="tag" :class="onSale(entry) === '在售' ? 'tag-ok' : ''">{{ onSale(entry) }}</span></td>
            <td>
              <div v-if="props.can('shop')" class="flex flex-wrap gap-1">
                <button class="btn btn-sm" @click="reprice(entry)">改价</button>
                <button class="btn btn-sm" @click="restock(entry)">库存</button>
                <button class="btn btn-sm" :class="entry.hidden ? '' : 'btn-danger'" @click="update(entry, { hidden: !entry.hidden })">{{ entry.hidden ? '重新上架' : '下架' }}</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
