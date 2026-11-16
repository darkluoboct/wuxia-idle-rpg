import { computed, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { StallAction, StallBoardDTO, StallListingDTO, StallResult, WsServerEvent } from '@/network/protocol'
import { apiClient, IS_MOCK_MODE } from '@/network/apiClient'
import type { GameActions } from '@/network/gameActions'
import {
  buySystemStall,
  checkStallOffer,
  moveStallGoods,
  STALL,
  stallDay,
  stallGoods,
  stallMask,
  SYSTEM_STALL_SELLER,
  systemStalls,
  systemStallsBought,
  type StallGoods,
  type StallGoodsKind,
  type StallInventory,
  type StallOffer,
} from '../../../shared/stalls.ts'
import { auctionWindow } from '../../../shared/ghostAuction.ts'
import { usePlayerStore } from './playerStore'
import { useGameUiStore } from './gameUiStore'

type LocalStall = { id: string; kind: StallGoodsKind; goodsId: string; qty: number; unitPrice: number; createdAt: number; expiresAt: number }
type StallSold = Extract<WsServerEvent, { event: 'STALL_SOLD' }>['data']

/** 子时鬼市蒙面摊位（docs/19 §七）：联机由服务端代管与结算；本地试玩同一套规则，只是没有别的侠客来买 */
export function useStalls({ actions }: { actions: GameActions }) {
  const playerStore = usePlayerStore()
  const { player, herbInventory } = storeToRefs(playerStore)
  const uiStore = useGameUiStore()
  const { appendLog, showToast } = uiStore

  const stallBoard = shallowRef<StallBoardDTO | null>(null)
  const localStalls = ref<LocalStall[]>([])
  /** 草药与残页在本地和联机都从这两处读写 */
  const inventory = (): StallInventory => ({ herbs: herbInventory.value, fragments: player.value.skillFragments ??= {} })
  const nameOf = (kind: StallGoodsKind, goodsId: string) => stallGoods(kind, goodsId)?.name ?? goodsId

  /** 背包里能摆出来卖的东西 */
  const stallWares = computed(() => {
    const wares: (StallGoods & { stock: number })[] = []
    for (const [kind, goods] of [['HERB', herbInventory.value], ['FRAGMENT', player.value.skillFragments ?? {}]] as const) {
      for (const [id, stock] of Object.entries(goods)) {
        const entry = stallGoods(kind, id)
        if (entry && stock > 0) wares.push({ ...entry, stock })
      }
    }
    return wares
  })

  // ==================== 本地试玩 ====================
  /** 到期的摊位把剩货退回 */
  function settleLocalStalls(now: number) {
    const expired = localStalls.value.filter((stall) => now >= stall.expiresAt)
    if (!expired.length) return
    for (const stall of expired) moveStallGoods(inventory(), stall.kind, stall.goodsId, stall.qty)
    localStalls.value = localStalls.value.filter((stall) => now < stall.expiresAt)
    announceIncome({ silver: 0, returned: expired.reduce((sum, { qty }) => sum + qty, 0) })
  }

  function localBoard(now: number): StallBoardDTO {
    const day = stallDay(now)
    const bought = systemStallsBought(player.value, now)
    return {
      serverTime: now,
      listings: systemStalls(day).filter(({ id }) => !bought.includes(id)).map(({ id, goods, qty, unitPrice }): StallListingDTO => ({
        id, kind: goods.kind, goodsId: goods.id, qty, unitPrice, seller: SYSTEM_STALL_SELLER, system: true, expiresAt: auctionWindow(day + 1).opensAt,
      })),
      mine: localStalls.value.map((stall, index) => ({ ...stall, seller: stallMask(index), system: false, sold: 0, proceeds: 0 })),
      recent: [],
    }
  }

  // ==================== 看摊 ====================
  let collectedAt = 0
  async function refreshStalls() {
    if (IS_MOCK_MODE) {
      settleLocalStalls(Date.now())
      stallBoard.value = localBoard(Date.now())
      return
    }
    try {
      stallBoard.value = await apiClient.request<StallBoardDTO>('GET', '/market/stalls')
    } catch {
      // 摊位读不到时保留上一次的结果
      return
    }
    // 自己的摊位有钱没入账、卖完了或到期了：看摊时顺手收一次，十秒内不重复催
    const { mine, serverTime } = stallBoard.value
    if (mine.some((stall) => stall.proceeds || !stall.qty || serverTime >= stall.expiresAt) && Date.now() - collectedAt > 10_000) {
      collectedAt = Date.now()
      await runStall({ action: 'collect' }, () => undefined)
    }
  }

  function announceIncome({ silver, returned }: { silver: number; returned: number }) {
    if (!silver && !returned) return
    const parts = [...(silver ? [`卖得的 ${silver.toLocaleString()} 两纹银已入账`] : []), ...(returned ? [`没卖掉的 ${returned} 份货物已退回`] : [])]
    appendLog('JIANGHU', [{ type: 'tag', text: '鬼市摊位', tone: silver ? 'gold' : 'purple' }, { type: 'text', text: ` ${parts.join('，')}。` }])
    if (silver) showToast(`鬼市摊位：纹银 +${silver.toLocaleString()}`, 'gold')
  }
  if (!IS_MOCK_MODE) {
    // 服务端在摊主的下一次操作前结账；对比前后存档写进江湖纪事
    watch(() => [player.value.id, player.value.stallIncome] as const, ([id, income], [previousId, previous]) => {
      if (id === previousId && income && income.at !== previous?.at) announceIncome(income)
    })
  }

  function announceStall(result: StallResult) {
    if (result.action === 'collect') return
    const name = nameOf(result.kind, result.goodsId)
    if (result.action === 'list') {
      appendLog('JIANGHU', [{ type: 'tag', text: '鬼市摆摊', tone: 'purple' }, {
        type: 'text', text: ` 你蒙面摆出${name} ×${result.qty}，每份 ${result.unitPrice} 两，付摆摊费 ${result.fee} 两。${STALL.durationMs / 3_600_000} 小时内没卖掉的会退回。`,
      }])
      showToast(`已摆出${name} ×${result.qty}`, 'gold')
    } else if (result.action === 'buy') {
      appendLog('JIANGHU', [{ type: 'tag', text: '鬼市采买', tone: 'purple' }, { type: 'text', text: ` 你买下${name} ×${result.qty}，花去 ${result.spent.toLocaleString()} 两纹银。` }])
      showToast(`买下${name} ×${result.qty}`, 'gold')
    } else {
      appendLog('JIANGHU', [{ type: 'tag', text: '鬼市收摊', tone: 'purple' }, {
        type: 'text', text: ` 你收了摊，${name} ×${result.returned} 退回背包${result.silver ? `，摊上卖得的 ${result.silver.toLocaleString()} 两一并入账` : ''}。摆摊费不退。`,
      }])
      showToast(`已收摊，退回${name} ×${result.returned}`, 'info')
    }
  }

  /** 操作后无论成败都刷新摊位：别人抢先买走时立刻看到 */
  function runStall(input: StallAction, playLocally: () => StallResult | void): Promise<unknown> {
    return Promise.resolve(actions.run('stall', input, announceStall, playLocally)).finally(refreshStalls)
  }

  function listStall(offer: StallOffer) {
    const now = Date.now()
    const checked = checkStallOffer({
      level: player.value.level, silver: player.value.silver, inventory: inventory(),
      openCount: IS_MOCK_MODE ? localStalls.value.length : stallBoard.value?.mine.length ?? 0,
    }, { ...offer })
    if ('error' in checked) {
      showToast(checked.error, 'danger')
      return
    }
    return runStall({ action: 'list', ...offer }, () => {
      const { goods, qty, unitPrice, fee } = checked
      moveStallGoods(inventory(), goods.kind, goods.id, -qty)
      player.value.silver -= fee
      const id = crypto.randomUUID()
      localStalls.value = [...localStalls.value, { id, kind: goods.kind, goodsId: goods.id, qty, unitPrice, createdAt: now, expiresAt: now + STALL.durationMs }]
      return { action: 'list', listingId: id, kind: goods.kind, goodsId: goods.id, qty, unitPrice, fee }
    })
  }

  function buyStall(listing: Pick<StallListingDTO, 'id' | 'unitPrice' | 'qty' | 'system'>, qty: number) {
    const amount = listing.system ? listing.qty : Math.min(listing.qty, Math.max(1, Math.floor(qty)))
    if (player.value.level < STALL.minLevel) return showToast(`等级达到 ${STALL.minLevel} 级才能在鬼市采买`, 'info')
    if (player.value.silver < amount * listing.unitPrice) return showToast('纹银不足', 'danger')
    return runStall({ action: 'buy', listingId: listing.id, qty: amount, unitPrice: listing.unitPrice }, () => {
      // 本地只有鬼市散客摊可买
      const bought = buySystemStall(player.value, inventory(), listing.id, Date.now())
      if ('error' in bought) return showToast(bought.error, 'info')
      return { action: 'buy', kind: bought.goods.kind, goodsId: bought.goods.id, qty: bought.qty, spent: bought.spent }
    })
  }

  function cancelStall(listingId: string) {
    return runStall({ action: 'cancel', listingId }, () => {
      const stall = localStalls.value.find(({ id }) => id === listingId)
      if (!stall) return showToast('这个摊位已经收掉了', 'info')
      moveStallGoods(inventory(), stall.kind, stall.goodsId, stall.qty)
      localStalls.value = localStalls.value.filter(({ id }) => id !== listingId)
      return { action: 'cancel', kind: stall.kind, goodsId: stall.goodsId, returned: stall.qty, silver: 0 }
    })
  }

  /** 服务端推送：有人买走了你摊上的东西。顺手结一次账，纹银立刻到手 */
  function onStallSold({ kind, goodsId, qty, silver }: StallSold) {
    appendLog('JIANGHU', [{ type: 'tag', text: '鬼市摊位', tone: 'gold' }, {
      type: 'text', text: ` 有蒙面客买走了你摊上的${nameOf(kind, goodsId)} ×${qty}，扣去一成抽成，卖得 ${silver.toLocaleString()} 两。`,
    }])
    collectedAt = Date.now()
    void runStall({ action: 'collect' }, () => undefined)
  }

  return {
    stallBoard,
    stallWares,
    localStalls,
    refreshStalls,
    listStall,
    buyStall,
    cancelStall,
    onStallSold,
  }
}
