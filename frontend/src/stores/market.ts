import { computed, ref, shallowRef } from 'vue'
import type { AuctionAction, AuctionBoardDTO, AuctionLotDTO, AuctionResult, GhostAppraisalResult, GhostMarketListingDTO } from '@/network/protocol'
import { MEDICINES, HERBS, PILL_RECIPES, GHOST_MARKET_LISTINGS, ITEMS, MAPS, marketListingPrice, SKILLS } from '@/config/gameData'
import { apiClient, IS_MOCK_MODE } from '@/network/apiClient'
import { extractFurnaceResidue, FORAGE_QI_COST, gatherHerbs, pillDoubleRate, pillSuccessRate } from '../../../shared/alchemy.ts'
import {
  appraiseGhostCurio as settleGhostAppraisal,
  GHOST_APPRAISAL_SWORD,
  ghostAppraisalCost,
  recipeForPlayer,
} from '../../../shared/player.ts'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import type { GameActions } from '@/network/gameActions'
import type { useCultivation } from './cultivation'
import { recordFtueForage, recordFtueRefine } from '../../../shared/ftueQuests.ts'
import { auctionDay, auctionLot, auctionLotInfo, auctionWindow, nextAuctionBid, ownsAuctionLot, softCloseAt } from '../../../shared/ghostAuction.ts'

export function useMarket({ actions, cultivation }: {
  actions: GameActions
  cultivation: Pick<ReturnType<typeof useCultivation>, 'changeMockKarma'>
}) {
  const playerStore = usePlayerStore()
  const {
    player,
    ownedItemIds,
    learnedSkills,
    currentLoadout,
    martialStats,
    herbInventory,
    alchemyPity,
    pillInventory,
    furnaceResidue,
  } = storeToRefs(playerStore)
  const { gainItem, learnSkill, markDaily } = playerStore
  const uiStore = useGameUiStore()
  const { shichenIdx } = storeToRefs(uiStore)
  const { appendLog, showToast } = uiStore
  const { changeMockKarma } = cultivation

  const ghostListings = computed(() => GHOST_MARKET_LISTINGS.filter((entry) =>
    !player.value.ghostMarketPurchases?.includes(entry.id) && !ownedItemIds.value.includes(entry.itemId) && !learnedSkills.value[entry.itemId]))

  const ghostAppraiseCost = computed(() => ghostAppraisalCost(currentLoadout.value))

  function appraiseGhostCurio(masked = player.value.wearingMask) {
    function announce({ spentSilver, swordFound, inspection, evasionPercent, karmaDelta }: GhostAppraisalResult) {
      if (inspection !== 'NONE') {
        const caught = inspection === 'CAUGHT'
        appendLog('JIANGHU', [
          { type: 'tag', text: caught ? '戒律撞破' : '躲过盘查', tone: caught ? 'red' : 'jade' },
          { type: 'text', text: ` 避开巡夜同门的概率为 ${evasionPercent}%。${caught ? `侠义减少 ${Math.abs(karmaDelta)} 点。` : '巡夜同门没有认出你。'}` },
        ])
      }
      if (swordFound) {
        const item = ITEMS[GHOST_APPRAISAL_SWORD]
        appendLog('ADVENTURE', [
          { type: 'tag', text: '慧眼识珠', tone: 'gold' },
          { type: 'text', text: ' 你摩挲泥污铁胎，认出竟是剑冢流落的' },
          { type: 'item', id: item.id, name: `【${item.name}】`, tier: item.tier },
          { type: 'text', text: `，花 ${spentSilver} 两捡漏入手！` },
        ])
        showToast(`在旧物摊找到了「${item.name}」！`, 'gold')
        return
      }
      appendLog('JIANGHU', [
        { type: 'tag', text: '鬼市淘货', tone: 'purple' },
        { type: 'text', text: ' 你洗去旧瓷瓶泥垢，内藏一枚桃花岛【九花玉露丸】与前人练功心得（真气 +2,200）！' },
      ])
      showToast('找到 1 枚九花玉露丸，真气 +2,200。', 'gold')
    }
    return actions.run('appraise', { masked }, announce, () => {
      const now = Date.now()
      const result = settleGhostAppraisal(player.value, currentLoadout.value, ownedItemIds.value.includes(GHOST_APPRAISAL_SWORD), masked,
        now, (delta) => changeMockKarma(delta, now))
      if ('error' in result) return showToast(result.error, 'danger')
      if (result.swordFound) gainItem(GHOST_APPRAISAL_SWORD)
      return result
    })
  }

  const ghostListingPrice = (listing: GhostMarketListingDTO) =>
    marketListingPrice(currentLoadout.value, listing, { ...player.value, stats: martialStats.value })

  function buyMarketListing(listingId: string) {
    const listing = ghostListings.value.find(({ id }) => id === listingId)
    if (!listing) return
    const announce = (spentSilver: number) => showToast(`花 ${spentSilver.toLocaleString()} 两买下 ${listing.itemName}`, 'gold')
    return actions.run('buy', { listingId }, ({ spentSilver }) => announce(spentSilver), () => {
      const price = ghostListingPrice(listing)
      if (player.value.silver < price) {
        showToast('纹银不足！', 'danger')
        return
      }
      player.value.silver -= price
      if (SKILLS[listing.itemId]) {
        learnedSkills.value[listing.itemId] = 1
      } else {
        gainItem(listing.itemId)
      }
      const purchases = player.value.ghostMarketPurchases ??= []
      purchases.push(listing.id)
      return { spentSilver: price }
    })
  }

  // 采药寻草（消耗 200 真气在指定或当前地图搜寻草药）
  function forageHerbs(targetMapId?: string) {
    const mapId = targetMapId ?? player.value.currentMapId
    const announce = (gathered: { name: string; count: number }[], sourceMapId: string) => {
      const map = MAPS.find((entry) => entry.id === sourceMapId) ?? MAPS[0]
      const names = gathered.map(({ name, count }) => `${name} ×${count}`).join('、')
      appendLog('CULTIVATE', [
        { type: 'tag', text: '采药寻珍', tone: 'jade' },
        { type: 'text', text: ` 在「${map.name}」采到${names}。` },
      ])
      showToast(`采获 ${names}`, 'gold')
    }
    return actions.run('forage', undefined, ({ herbs }) => announce(herbs, player.value.currentMapId), () => {
      if (player.value.qiExp < FORAGE_QI_COST) {
        showToast(`采药需 ${FORAGE_QI_COST} 点真气。`, 'danger')
        return
      }
      const gathered = gatherHerbs(mapId, martialStats.value.luck, shichenIdx.value)
      if (!gathered.length) {
        showToast('此地没有可采的药材。', 'info')
        return
      }
      player.value.qiExp -= FORAGE_QI_COST
      for (const { id, count } of gathered) herbInventory.value[id] = (herbInventory.value[id] ?? 0) + count
      announce(gathered, mapId)
      recordFtueForage(player.value)
      markDaily('alchemy')
    })
  }

  // 丹房炼制
  function refinePill(recipeId: string) {
    const baseRecipe = PILL_RECIPES[recipeId]
    if (!baseRecipe) return
    const recipe = recipeForPlayer(baseRecipe, player.value)
    return actions.run('refine', { recipeId }, ({ medicineId, count }) => {
      showToast(count ? `炼得「${MEDICINES[medicineId].name}」×${count}` : '收下药渣，丹方下次炼制成功率提高 6 个百分点', count ? 'gold' : 'info')
    }, () => {
      // 悟性要求
      if (martialStats.value.intStat < recipe.minInsight) {
        showToast(`此古方极其玄奥，需悟性达到 ${recipe.minInsight} 方能掌控火候（当前悟性 ${martialStats.value.intStat}）。`, 'danger')
        return
      }
      // 消耗检验
      if (player.value.qiExp < recipe.costQi) {
        showToast(`炼制需消耗 ${recipe.costQi.toLocaleString()} 真气以控炉火。`, 'danger')
        return
      }
      if (player.value.silver < recipe.costSilver) {
        showToast(`炭火鼎炉工本需 ${recipe.costSilver} 两纹银。`, 'danger')
        return
      }
      // 药材检验
      for (const req of recipe.requiredHerbs) {
        const owned = herbInventory.value[req.herbId] ?? 0
        if (owned < req.count) {
          const herbName = HERBS[req.herbId]?.name ?? req.herbId
          showToast(`药材不足：缺少「${herbName}」x${req.count - owned}（现有 ${owned}/${req.count}）。`, 'danger')
          return
        }
      }

      // 扣除材料与消耗
      player.value.qiExp -= recipe.costQi
      player.value.silver -= recipe.costSilver
      for (const req of recipe.requiredHerbs) {
        herbInventory.value[req.herbId] -= req.count
      }
      markDaily('alchemy')

      // 成功率计算 (基础 + 悟性超额加成 + 福缘加成 + 保底)
      const pity = alchemyPity.value[recipeId] ?? 0
      const finalRate = pillSuccessRate(recipe, martialStats.value, pity)

      const roll = Math.random() * 100
      const isSuccess = roll < finalRate
      const targetMed = MEDICINES[recipe.targetMedicineId]
      const medName = targetMed?.name ?? recipe.name

      if (isSuccess) {
        alchemyPity.value[recipeId] = 0 // 清空保底
        // 检验一炉双丹暴击 (基于福缘与悟性)
        const doubleRate = pillDoubleRate(martialStats.value)
        const isDouble = Math.random() * 100 < doubleRate
        const yieldCount = isDouble ? 2 : 1

        const stock = recipe.category === 'BATTLE' ? (player.value.battleMedicines ??= {}) : pillInventory.value
        stock[recipe.targetMedicineId] = (stock[recipe.targetMedicineId] ?? 0) + yieldCount

        const critText = isDouble ? '【一炉双丹】天工开物，紫火纯青，竟然一炉炼成两丸！' : '鼎盖升腾五色氤氲，丹成九品！'
        appendLog('CULTIVATE', [
          { type: 'tag', text: '开炉丹成', tone: 'gold' },
          { type: 'text', text: ` 依照《${recipe.name}》起炉炼药，${critText} 炼得「${medName}」x${yieldCount}！` },
        ])
        showToast(`炼丹大成！获得「${medName}」x${yieldCount}${isDouble ? '（一炉双丹！）' : ''}`, 'gold')
        recordFtueRefine(player.value, recipeId)
      } else {
        // 失败补偿
        alchemyPity.value[recipeId] = pity + 6
        furnaceResidue.value += 1
        appendLog('CULTIVATE', [
          { type: 'tag', text: '开炉微焦', tone: 'purple' },
          { type: 'text', text: ` 炼制《${recipe.name}》时火候稍疾，丹药焦化成药渣 1 团（已收纳）。悟性生慧，该丹方炼成率累积提升 +6%（当前保底 +${alchemyPity.value[recipeId]}%）！` },
        ])
        showToast('火候稍疾炼成药渣，悟性大涨，该丹方成功率+6%', 'info')
      }
    })
  }

  // 药渣回炉萃取（每 5 团药渣可提炼随机药草与真气）
  function exchangeFurnaceResidue() {
    return actions.run('extract', undefined, ({ name, count, gainedQi }) => {
      showToast(`获得「${name}」×${count}，真气 +${gainedQi}`, 'gold')
    }, () => {
      if (furnaceResidue.value < 5) {
        showToast('需积攒至少 5 团炼丹药渣方可回炉萃取灵草精微。', 'danger')
        return
      }
      furnaceResidue.value -= 5
      const { id, name, count, gainedQi } = extractFurnaceResidue()
      herbInventory.value[id] = (herbInventory.value[id] ?? 0) + count
      player.value.qiExp += gainedQi

      appendLog('CULTIVATE', [
        { type: 'tag', text: '药渣萃精', tone: 'jade' },
        { type: 'text', text: ` 萃取 5 团药渣，获得「${name}」×${count}，真气 +${gainedQi}。` },
      ])
      showToast(`获得「${name}」×${count}，真气 +${gainedQi}`, 'gold')
    })
  }

  // ==================== 子时鬼市压轴暗拍：全服竞拍，服务端结算；本地试玩只有你一位出价人 ====================
  type LocalLot = { price: number; bids: number; closesAt: number; at: number; claimed: boolean }
  const localAuctions = ref<Record<string, LocalLot>>({})
  const auctionBoard = shallowRef<AuctionBoardDTO | null>(null)

  function localLotView(day: number): AuctionLotDTO {
    const config = auctionLot(day)
    const window = auctionWindow(day)
    const lot = localAuctions.value[day] ?? { price: config.startPrice, bids: 0 }
    return {
      day, itemId: config.itemId, seller: config.seller, startPrice: config.startPrice, price: lot.price, nextBid: nextAuctionBid(lot),
      bids: lot.bids, opensAt: window.opensAt, closesAt: localAuctions.value[day]?.closesAt ?? window.closesAt,
      leaderMasked: lot.bids ? '你' : null, leading: lot.bids > 0,
    }
  }

  function localAuctionBoard(now: number): AuctionBoardDTO {
    const day = auctionDay(now)
    const current = localAuctions.value[day]
    return {
      serverTime: now,
      lot: localLotView(day),
      history: current ? [{ masked: '你', amount: current.price, at: current.at, self: true }] : [],
      previous: localLotView(day - 1),
      wins: Object.entries(localAuctions.value).flatMap(([won, lot]) => lot.bids && !lot.claimed && lot.closesAt <= now
        ? [{ day: Number(won), itemId: auctionLot(Number(won)).itemId, price: lot.price }] : []),
    }
  }

  async function refreshAuction() {
    if (IS_MOCK_MODE) {
      auctionBoard.value = localAuctionBoard(Date.now())
      return
    }
    try {
      auctionBoard.value = await apiClient.request<AuctionBoardDTO>('GET', '/market/auction')
    } catch {
      // 暗拍榜读不到时保留上一次的结果，下次进鬼市再取
    }
  }

  function announceAuction(result: AuctionResult) {
    const name = auctionLotInfo(result.action === 'bid' ? auctionLot(result.day).itemId : result.itemId).name
    if (result.action === 'bid') {
      appendLog('JIANGHU', [{ type: 'tag', text: '鬼市暗拍', tone: 'purple' }, { type: 'text', text: ` 你蒙面举牌，为${name}出价 ${result.price} 元宝，暂时领先。元宝已先冻结。` }])
      showToast(`出价 ${result.price} 元宝，暂时领先`, 'gold')
    } else if (result.refunded) {
      appendLog('JIANGHU', [{ type: 'tag', text: '鬼市暗拍', tone: 'purple' }, { type: 'text', text: ` 你已有${name}，拍价 ${result.refunded} 元宝原数退还。` }])
      showToast(`已有${name}，退还 ${result.refunded} 元宝`, 'info')
    } else {
      appendLog('ADVENTURE', [{ type: 'tag', text: '鬼市落槌', tone: 'gold' }, { type: 'text', text: ` 你取走了拍得的${name}。` }])
      showToast(`拍得${name}`, 'gold')
    }
  }

  /** 操作后无论成败都刷新暗拍榜：有人抢先加价时立刻看到新价 */
  function runAuction(input: AuctionAction, playLocally: () => AuctionResult | void) {
    return Promise.resolve(actions.run('auction', input, announceAuction, playLocally)).finally(refreshAuction)
  }

  function bidAuction() {
    const lot = auctionBoard.value?.lot
    if (!lot) return
    if (player.value.goldIngot < lot.nextBid) {
      showToast(`元宝不足：这一口要 ${lot.nextBid} 元宝`, 'danger')
      return
    }
    return runAuction({ action: 'bid', day: lot.day, expectedPrice: lot.nextBid }, () => {
      const now = Date.now()
      const day = auctionDay(now)
      const view = localLotView(day)
      if (day !== lot.day) return showToast('暗拍已换场，请刷新', 'info')
      if (now >= view.closesAt) return showToast('今晚的暗拍已经落槌', 'info')
      if (view.leading) return showToast('你的出价仍然领先', 'info')
      if (ownsAuctionLot(view.itemId, learnedSkills.value, ownedItemIds.value)) return showToast('你已拥有这件拍品', 'info')
      player.value.goldIngot -= view.nextBid
      const closesAt = softCloseAt(view.closesAt, now)
      localAuctions.value[day] = { price: view.nextBid, bids: view.bids + 1, closesAt, at: now, claimed: false }
      return { action: 'bid', day, price: view.nextBid, closesAt }
    })
  }

  function claimAuction(day: number) {
    return runAuction({ action: 'claim', day }, () => {
      const lot = localAuctions.value[day]
      if (!lot?.bids || lot.claimed || Date.now() < lot.closesAt) return showToast('这一场没有你的拍品可领', 'info')
      const { itemId } = auctionLot(day)
      let refunded = 0
      if (ownsAuctionLot(itemId, learnedSkills.value, ownedItemIds.value)) {
        refunded = lot.price
        player.value.goldIngot += refunded
      } else if (SKILLS[itemId]) {
        learnSkill(itemId)
      } else {
        gainItem(itemId)
      }
      lot.claimed = true
      return { action: 'claim', day, itemId, refunded }
    })
  }

  /** 服务端推送：出价被超过，元宝已原数退还 */
  function onAuctionOutbid({ itemId, refund, price }: { itemId: string; refund: number; price: number }) {
    const { name } = auctionLotInfo(itemId)
    appendLog('JIANGHU', [{ type: 'tag', text: '鬼市暗拍', tone: 'red' }, { type: 'text', text: ` 有人以 ${price} 元宝压过你对${name}的出价，你的 ${refund} 元宝已原数退还。` }])
    showToast(`暗拍被超过：退还 ${refund} 元宝`, 'danger')
    void refreshAuction()
  }

  return {
    localAuctions,
    auctionBoard,
    refreshAuction,
    bidAuction,
    claimAuction,
    onAuctionOutbid,
    forageHerbs,
    refinePill,
    exchangeFurnaceResidue,
    ghostListings,
    ghostListingPrice,
    ghostAppraiseCost,
    appraiseGhostCurio,
    buyMarketListing,
  }
}
