<script setup lang="ts">
import { onMounted } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import type { ShopGoodsDTO } from '@/network/protocol'
import { mailAttachmentText } from '../../../shared/admin.ts'

/** 江湖商行（docs/22）：运营上架的商品，用元宝或纹银买，有的限购、有的限量 */
const store = useGameStore()
const LIMIT_TEXT = { TOTAL: '限购', DAILY: '每日限购', WEEKLY: '每周限购' } as const
const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const priceText = (goods: ShopGoodsDTO) => goods.currency === 'INGOT' ? `${goods.price.toLocaleString()} 元宝` : `${goods.price.toLocaleString()} 两`
function blocked(goods: ShopGoodsDTO) {
  if (goods.stockLeft === 0) return '已售罄'
  if (goods.limit && goods.bought >= goods.limit.count) return '已达限购'
  const balance = goods.currency === 'INGOT' ? store.player.goldIngot : store.player.silver
  if (balance < goods.price) return goods.currency === 'INGOT' ? '元宝不足' : '纹银不足'
  return ''
}

onMounted(() => void store.refreshShop())
</script>

<template>
  <div class="view-scroll -mr-1 space-y-3 pr-1">
    <p v-if="!store.shopGoods.length" class="well p-6 text-center text-sm text-ink3">商行掌柜还没上新货，过些时日再来看看。</p>
    <ul v-else class="grid gap-3 md:grid-cols-2" aria-label="商行货架">
      <li v-for="goods in store.shopGoods" :key="goods.id" class="well flex flex-col gap-2 p-3.5">
        <div class="flex items-start justify-between gap-2">
          <h4 class="font-brush text-xl leading-tight text-gold">{{ goods.title }}</h4>
          <b class="shrink-0 tabular-nums" :class="goods.currency === 'INGOT' ? 'text-gold' : 'text-ink'">{{ priceText(goods) }}</b>
        </div>
        <p v-if="goods.description" class="text-sm leading-relaxed text-ink2">{{ goods.description }}</p>
        <p class="text-sm">内含：{{ mailAttachmentText(goods.goods) }}</p>
        <div class="flex flex-wrap gap-1.5 text-xs">
          <span v-if="goods.limit" class="chip tabular-nums">{{ LIMIT_TEXT[goods.limit.kind] }} {{ goods.limit.count }} 次 · 已买 {{ goods.bought }}</span>
          <span v-if="goods.stockLeft !== null" class="chip chip-gold tabular-nums">全服剩 {{ goods.stockLeft }} 件</span>
          <span v-if="goods.endsAt" class="chip tabular-nums">{{ date.format(goods.endsAt) }} 下架</span>
        </div>
        <button
          class="btn btn-seal mt-auto" :disabled="!!blocked(goods) || store.onlineActionBusy"
          :aria-label="`购买${goods.title}`" @click="store.buyShopGoods(goods)"
        >
          {{ blocked(goods) || `购买 · ${priceText(goods)}` }}
        </button>
      </li>
    </ul>
  </div>
</template>
