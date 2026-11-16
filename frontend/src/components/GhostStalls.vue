<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { TIER_META } from '@/config/uiMeta'
import type { StallListingDTO } from '@/network/protocol'
import { STALL, stallFee, stallGoods, stallTax } from '../../../shared/stalls.ts'

const store = useGameStore()
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })
const allowed = computed(() => store.player.level >= STALL.minLevel)
const mine = computed(() => store.stallBoard?.mine ?? [])
const goodsOf = (entry: Pick<StallListingDTO, 'kind' | 'goodsId'>) => stallGoods(entry.kind, entry.goodsId)!
const listings = computed(() => (store.stallBoard?.listings ?? []).map((entry) => ({ ...entry, goods: goodsOf(entry) })))
const left = (expiresAt: number) => {
  const minutes = Math.max(0, Math.ceil((expiresAt - store.worldTime) / 60_000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时` : `${minutes} 分`
}

/* ---------- 摆摊 ---------- */
const wareKey = ref('')
const ware = computed(() => store.stallWares.find((entry) => `${entry.kind}:${entry.id}` === wareKey.value) ?? store.stallWares[0])
const qty = ref(1)
const unitPrice = ref(0)
// 换一样货：数量默认全摆出来，单价默认参考价
watch(() => ware.value && `${ware.value.kind}:${ware.value.id}`, () => {
  if (!ware.value) return
  qty.value = Math.min(ware.value.stock, STALL.maxQty)
  unitPrice.value = ware.value.refPrice
}, { immediate: true })
const offerError = computed(() => {
  const goods = ware.value
  if (!goods) return '背包里没有可摆卖的草药或残页'
  if (mine.value.length >= STALL.maxOpen) return `最多同时摆 ${STALL.maxOpen} 个摊位`
  if (!Number.isInteger(qty.value) || qty.value < 1 || qty.value > Math.min(goods.stock, STALL.maxQty)) return `数量须在 1~${Math.min(goods.stock, STALL.maxQty)} 之间`
  if (!Number.isInteger(unitPrice.value) || unitPrice.value < goods.minPrice || unitPrice.value > goods.maxPrice) return `单价须在 ${goods.minPrice}~${goods.maxPrice} 两之间`
  if (store.player.silver < stallFee(qty.value * unitPrice.value)) return '纹银不够付摆摊费'
  return ''
})
const total = computed(() => (offerError.value ? 0 : qty.value * unitPrice.value))
function list() {
  if (!ware.value || offerError.value) return
  void store.listStall({ kind: ware.value.kind, goodsId: ware.value.id, qty: qty.value, unitPrice: unitPrice.value })
}

/* ---------- 采买 ---------- */
const wanted = reactive<Record<string, number>>({})
const amount = (entry: StallListingDTO) => entry.system ? entry.qty : Math.min(entry.qty, Math.max(1, Math.floor(wanted[entry.id] ?? 1)))

// 进鬼市先看一次摊，停留期间每半分钟刷新，看得到别人新摆的货
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void store.refreshStalls()
  timer = setInterval(() => void store.refreshStalls(), 30_000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <article class="well space-y-3 p-4" aria-label="蒙面摊位">
    <div>
      <div class="flex items-center gap-2">
        <span class="seal h-8 w-8 text-lg">摊</span>
        <h4 class="font-brush text-xl leading-none">蒙面摊位</h4>
      </div>
      <p class="hint mt-1.5">
        侠客之间用纹银买卖草药与武学残页，买卖双方都只见代号。单价须在参考价的 {{ STALL.minPricePercent }}%~{{ STALL.maxPricePercent }}% 之间；摆摊费 {{ STALL.feePercent }}%，上架时付、不退；成交后抽 {{ STALL.taxPercent }}%。每摊挂 {{ STALL.durationMs / 3_600_000 }} 小时，至多 {{ STALL.maxOpen }} 摊，没卖掉的退回。
      </p>
    </div>

    <p v-if="!allowed" class="text-sm text-ink3">等级达到 {{ STALL.minLevel }} 级后，才能在鬼市摆摊与采买。</p>

    <template v-else>
      <!-- 摆摊 -->
      <form v-if="ware" class="space-y-2 border-t border-line pt-2.5" aria-label="摆摊" @submit.prevent="list">
        <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_auto]">
          <label class="min-w-0 text-xs text-ink3">货物
            <select v-model="wareKey" class="well border border-line bg-raised p-1.5 text-sm text-ink mt-1 w-full">
              <option v-for="entry in store.stallWares" :key="`${entry.kind}:${entry.id}`" :value="`${entry.kind}:${entry.id}`">
                {{ entry.name }}（有 {{ entry.stock }}）
              </option>
            </select>
          </label>
          <label class="text-xs text-ink3">数量
            <input v-model.number="qty" class="well border border-line bg-raised p-1.5 text-sm text-ink mt-1 w-full tabular-nums" type="number" inputmode="numeric" min="1" :max="Math.min(ware.stock, STALL.maxQty)">
          </label>
          <label class="text-xs text-ink3">单价（两）
            <input v-model.number="unitPrice" class="well border border-line bg-raised p-1.5 text-sm text-ink mt-1 w-full tabular-nums" type="number" inputmode="numeric" :min="ware.minPrice" :max="ware.maxPrice">
          </label>
          <button class="btn btn-seal self-end" type="submit" :disabled="store.onlineActionBusy || !!offerError">摆摊</button>
        </div>
        <p class="text-xs" :class="offerError ? 'text-cinnabar' : 'text-ink3'">
          <template v-if="offerError">{{ offerError }}</template>
          <template v-else>
            参考价 {{ ware.refPrice }} 两，可定 {{ ware.minPrice }}~{{ ware.maxPrice }} 两。合计 {{ total.toLocaleString() }} 两 · 摆摊费 {{ stallFee(total) }} 两 · 全部卖出到手 {{ (total - stallTax(total)).toLocaleString() }} 两
          </template>
        </p>
      </form>
      <p v-else class="border-t border-line pt-2.5 text-xs text-ink3">背包里没有可摆卖的草药或残页。草药到百草丹房去采，残页可在牛家村密室的暗格里搜到。</p>

      <!-- 我的摊位 -->
      <ul v-if="mine.length" class="space-y-1.5 border-t border-line pt-2.5" aria-label="我的摊位">
        <li v-for="stall in mine" :key="stall.id" class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span class="min-w-0" :class="TIER_META[goodsOf(stall).tier].cls">
            <b class="tier-text">{{ goodsOf(stall).name }}</b>
            <span class="tabular-nums"> ×{{ stall.qty }}</span>
            <span class="text-xs text-ink3"> · 每份 {{ stall.unitPrice }} 两 · 已卖 {{ stall.sold ?? 0 }}<template v-if="stall.proceeds"> · 待入账 {{ stall.proceeds.toLocaleString() }} 两</template> · 还挂 {{ left(stall.expiresAt) }}</span>
          </span>
          <button class="btn btn-sm shrink-0" :disabled="store.onlineActionBusy" @click="store.cancelStall(stall.id)">撤摊</button>
        </li>
      </ul>
    </template>

    <!-- 市面上的摊位 -->
    <div class="space-y-1.5 border-t border-line pt-2.5">
      <div class="flex items-baseline justify-between gap-2">
        <h5 class="text-sm font-bold">市面上的摊位</h5>
        <span class="text-xs text-ink3">纹银 {{ store.player.silver.toLocaleString() }} 两</span>
      </div>
      <p v-if="!store.stallBoard" class="text-xs text-ink3">正在看摊。</p>
      <p v-else-if="!listings.length" class="text-xs text-ink3">眼下没有摊位，散客货今天也已买过。</p>
      <ul v-else class="space-y-1.5" aria-label="市面上的摊位">
        <li v-for="entry in listings" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 text-sm" :class="TIER_META[entry.goods.tier].cls">
          <span class="min-w-0">
            <b class="tier-text">{{ entry.goods.name }}</b>
            <span class="tabular-nums"> ×{{ entry.qty }}</span>
            <span class="text-xs text-ink3"> · 每份 <b class="tabular-nums text-ink2">{{ entry.unitPrice }}</b> 两（参考 {{ entry.goods.refPrice }}）· {{ entry.seller }}{{ entry.system ? ' · 每日一次，整摊买走' : ` · 还挂 ${left(entry.expiresAt)}` }}</span>
          </span>
          <span class="flex shrink-0 items-center gap-1.5">
            <input
              v-if="!entry.system && entry.qty > 1" v-model.number="wanted[entry.id]" class="well border border-line bg-raised p-1.5 text-sm text-ink w-16 tabular-nums" type="number" inputmode="numeric"
              min="1" :max="entry.qty" placeholder="1" :aria-label="`买几份${entry.goods.name}`"
            >
            <button
              class="btn btn-sm" :disabled="store.onlineActionBusy || !allowed || store.player.silver < amount(entry) * entry.unitPrice"
              @click="store.buyStall(entry, amount(entry))"
            >买 {{ amount(entry) }} 份 · {{ (amount(entry) * entry.unitPrice).toLocaleString() }} 两</button>
          </span>
        </li>
      </ul>
    </div>

    <ol v-if="store.stallBoard?.recent.length" class="space-y-0.5 border-t border-line pt-2 text-xs text-ink3" aria-label="最近成交">
      <li v-for="sale in store.stallBoard.recent" :key="sale.at + sale.goodsId + sale.qty" class="flex justify-between gap-2">
        <span>{{ goodsOf(sale).name }} ×{{ sale.qty }} · 每份 {{ sale.unitPrice }} 两成交</span>
        <span class="tabular-nums">{{ time.format(sale.at) }}</span>
      </li>
    </ol>
  </article>
</template>
