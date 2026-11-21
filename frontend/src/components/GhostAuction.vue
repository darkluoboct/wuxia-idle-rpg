<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { TIER_META } from '@/config/uiMeta'
import WorkbenchDialog from './WorkbenchDialog.vue'
import ItemIcon from './ItemIcon.vue'
import type { AuctionLotDTO } from '@/network/protocol'
import { AUCTION_BID_STEP, AUCTION_DIVIDEND, auctionLotInfo, ownsAuctionLot } from '../../../shared/ghostAuction.ts'

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
/** 红封签：当日领过每日江湖事就有，什么时辰领都算 */
const ticket = computed(() => {
  if (!lot.value || closed.value) return ''
  if (store.player.auctionTickets?.includes(lot.value.day)) return '你已持今日的红封签，子时开签'
  return '领完今日的每日江湖事，可得今日的红封签'
})
const MINE = { PAID: '你已领到', PENDING: '你的一份即将到账', MISSED: '这一回没抽中你', HELD: '你持签，等子时开签', NONE: '你没有持签' } as const
function dividendText({ dividend }: AuctionLotDTO) {
  if (!dividend) return ''
  if (!dividend.eligible && store.worldTime >= dividend.paysAt) return '红封：无人持签，全数回收'
  const drawn = dividend.winners < dividend.eligible ? `，抽中 ${dividend.winners} 人` : ''
  const counting = store.worldTime < dividend.paysAt ? `（${time.format(dividend.paysAt)} 开签，人数还会增加）` : ''
  return `红封：${dividend.eligible} 人持签${drawn}，每人 ${dividend.share} 元宝${counting} · ${MINE[dividend.mine]}`
}

/** 心理价：没领先时至少下一口，领先时加码至少再高一口 */
const leastBid = computed(() => !lot.value ? 0 : lot.value.leading ? (lot.value.myMax ?? lot.value.price) + AUCTION_BID_STEP : lot.value.nextBid)
const maxPrice = ref(0)
watch(leastBid, (least) => { if (maxPrice.value < least) maxPrice.value = least }, { immediate: true })
const freeze = computed(() => maxPrice.value - (lot.value?.leading ? lot.value.myMax ?? lot.value.price : 0))
const bidBlocked = computed(() => store.onlineActionBusy || closed.value || owned.value || !Number.isInteger(maxPrice.value) ||
  maxPrice.value < leastBid.value || store.player.goldIngot < freeze.value)
const bidLabel = computed(() => {
  if (!lot.value) return '出价'
  if (closed.value) return '已落槌'
  if (owned.value) return '你已拥有'
  return lot.value.leading ? `加码到 ${maxPrice.value}` : `出价，心理价 ${maxPrice.value}`
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
          <WorkbenchDialog title="鬼市暗拍规则"><p>
          子时开拍，次日 21:00 落槌，每口加 {{ AUCTION_BID_STEP }} 元宝。出价填心理价，元宝按心理价先冻结；有人来压，鬼市按每口替你跟到心理价为止，不必守在落槌前。
          被人压过原数退还，落槌按成交价结算、多冻的退还；落槌前 5 分钟有人出价顺延 5 分钟。
          成交价的 {{ AUCTION_DIVIDEND.percent }}% 作红封，子时分给当日领过每日江湖事的侠客，每人至多 {{ AUCTION_DIVIDEND.maxShare }} 元宝。
        </p></WorkbenchDialog>
        </div>
      </div>
      <span class="chip shrink-0" :class="closed ? '' : 'chip-gold'">{{ closed ? `已于 ${time.format(lot.closesAt)} 落槌` : `距落槌 ${countdown}` }}</span>
    </div>

    <div class="space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <ItemIcon :item-id="lot.itemId" :glyph="info.kind === 'SKILL' ? '诀' : '器'" /><b class="font-brush tier-text text-2xl leading-tight">{{ info.name }}</b>
        <span class="chip tier-chip">{{ TIER_META[info.tier].label }}</span>
      </div>
      <p class="hint">{{ info.desc }}</p>
      <p class="text-xs text-ink3">拍主 {{ lot.seller }} · 起拍 {{ lot.startPrice }} 元宝 · 已出价 {{ lot.bids }} 次</p>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
      <span class="text-sm">
        <span class="text-ink3">当前</span>
        <b class="mx-1 text-lg tabular-nums text-gold">{{ lot.price }}</b><span class="text-xs">元宝</span>
        <span class="ml-2 text-xs" :class="lot.leading ? 'text-gold' : 'text-ink3'">
          {{ lot.leading ? `你领先 · 心理价 ${lot.myMax}` : lot.leaderMasked ? `领先 ${lot.leaderMasked}` : '尚无人出价' }}
        </span>
      </span>
      <div v-if="!closed && !owned" class="flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-1.5 text-xs text-ink3">心理价
          <input v-model.number="maxPrice" class="field w-24 tabular-nums" type="number" :min="leastBid" :step="AUCTION_BID_STEP" aria-label="心理价（元宝）">
        </label>
        <button class="btn btn-seal" :disabled="bidBlocked" @click="store.bidAuction(maxPrice)">{{ bidLabel }}</button>
      </div>
      <span v-else class="chip">{{ bidLabel }}</span>
    </div>

    <p v-if="ticket || lot.dividend" class="text-xs" :class="lot.dividend?.mine === 'PAID' || store.player.auctionTickets?.includes(lot.day) ? 'text-gold' : 'text-ink3'">{{ lot.dividend ? dividendText(lot) : ticket }}</p>

    <ol v-if="store.auctionBoard?.history.length" class="space-y-0.5 text-xs" aria-label="出价记录">
      <li v-for="entry in store.auctionBoard.history" :key="entry.at + entry.masked" class="flex justify-between gap-2" :class="entry.self ? 'text-gold' : 'text-ink3'">
        <span>{{ entry.self ? '你' : entry.masked }}<template v-if="entry.proxy"> · 代跟</template></span>
        <span class="tabular-nums">{{ entry.amount }} 元宝 · {{ time.format(entry.at) }}</span>
      </li>
    </ol>

    <div v-for="win in store.auctionBoard?.wins ?? []" :key="win.day" class="flex flex-wrap items-center justify-between gap-2 border border-gold px-2.5 py-2 text-sm">
      <span>你以 {{ win.price }} 元宝拍得{{ auctionLotInfo(win.itemId).name }}</span>
      <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy" @click="store.claimAuction(win.day)">领取</button>
    </div>

    <p v-if="previous" class="text-xs text-ink3">
      上一场{{ previous.name }}：{{ previous.bids ? `${previous.price} 元宝成交（${previous.leading ? '你' : previous.leaderMasked ?? '已归隐的侠客'}）` : '流拍' }}
      <template v-if="previous.dividend"><br>{{ dividendText(previous) }}</template>
    </p>
  </article>
</template>
