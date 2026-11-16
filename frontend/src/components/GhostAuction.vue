<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { TIER_META } from '@/config/uiMeta'
import { AUCTION_BID_STEP, auctionLotInfo, ownsAuctionLot } from '../../../shared/ghostAuction.ts'

const store = useGameStore()
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })
const lot = computed(() => store.auctionBoard?.lot)
const info = computed(() => lot.value && auctionLotInfo(lot.value.itemId))
const previous = computed(() => {
  const last = store.auctionBoard?.previous
  return last && { ...last, name: auctionLotInfo(last.itemId).name }
})
const closed = computed(() => !!lot.value && store.worldTime >= lot.value.closesAt)
const owned = computed(() => !!lot.value && ownsAuctionLot(lot.value.itemId, store.learnedSkills, store.ownedItemIds))
const countdown = computed(() => {
  if (!lot.value) return ''
  const minutes = Math.max(0, Math.ceil((lot.value.closesAt - store.worldTime) / 60_000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分`
})
const bidLabel = computed(() => {
  if (!lot.value) return '出价'
  if (closed.value) return '已落槌'
  if (lot.value.leading) return '你仍领先'
  if (owned.value) return '你已拥有'
  return `出价 ${lot.value.nextBid} 元宝`
})

// 进鬼市先取一次暗拍榜，停留期间每半分钟刷新，看得到别人加价
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void store.refreshAuction()
  timer = setInterval(() => void store.refreshAuction(), 30_000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <article
    v-if="lot && info" class="well relative space-y-3 overflow-hidden p-4" :class="[TIER_META[info.tier].cls, 'tier-edge', info.tier === 'red' ? 'glow-border' : '']"
    aria-label="子时压轴暗拍"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="seal h-8 w-8 text-lg">拍</span>
          <h4 class="font-brush text-xl leading-none">子时压轴暗拍</h4>
        </div>
        <p class="hint mt-1.5">子时开拍，次日 21:00 落槌，每口加 {{ AUCTION_BID_STEP }} 元宝。领先时元宝先冻结，被人压过原数退还；落槌前 5 分钟有人出价顺延 5 分钟。</p>
      </div>
      <span class="chip shrink-0" :class="closed ? '' : 'chip-gold'">{{ closed ? `已于 ${time.format(lot.closesAt)} 落槌` : `距落槌 ${countdown}` }}</span>
    </div>

    <div class="space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <b class="font-brush tier-text text-2xl leading-tight">{{ info.name }}</b>
        <span class="chip tier-chip">{{ TIER_META[info.tier].label }}</span>
      </div>
      <p class="hint">{{ info.desc }}</p>
      <p class="text-xs text-ink3">拍主 {{ lot.seller }} · 起拍 {{ lot.startPrice }} 元宝 · 已出价 {{ lot.bids }} 次</p>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
      <span class="text-sm">
        <span class="text-ink3">当前</span>
        <b class="mx-1 text-lg tabular-nums text-gold">{{ lot.price }}</b><span class="text-xs">元宝</span>
        <span class="ml-2 text-xs" :class="lot.leading ? 'text-gold' : 'text-ink3'">{{ lot.leading ? '你领先' : lot.leaderMasked ? `领先 ${lot.leaderMasked}` : '尚无人出价' }}</span>
      </span>
      <button
        class="btn btn-seal" :disabled="store.onlineActionBusy || closed || lot.leading || owned || store.player.goldIngot < lot.nextBid"
        @click="store.bidAuction()"
      >{{ bidLabel }}</button>
    </div>

    <ol v-if="store.auctionBoard?.history.length" class="space-y-0.5 text-xs" aria-label="出价记录">
      <li v-for="entry in store.auctionBoard.history" :key="entry.at + entry.masked" class="flex justify-between gap-2" :class="entry.self ? 'text-gold' : 'text-ink3'">
        <span>{{ entry.self ? '你' : entry.masked }}</span>
        <span class="tabular-nums">{{ entry.amount }} 元宝 · {{ time.format(entry.at) }}</span>
      </li>
    </ol>

    <div v-for="win in store.auctionBoard?.wins ?? []" :key="win.day" class="flex flex-wrap items-center justify-between gap-2 border border-gold px-2.5 py-2 text-sm">
      <span>你以 {{ win.price }} 元宝拍得{{ auctionLotInfo(win.itemId).name }}</span>
      <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy" @click="store.claimAuction(win.day)">领取</button>
    </div>

    <p v-if="previous" class="text-xs text-ink3">
      上一场{{ previous.name }}：{{ previous.bids ? `${previous.price} 元宝成交（${previous.leading ? '你' : previous.leaderMasked}）` : '流拍' }}
    </p>
  </article>
</template>
