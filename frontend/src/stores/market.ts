import { computed, ref } from 'vue'
import type { GhostAppraisalResult, GhostMarketListingDTO } from '@/network/protocol'
import { MEDICINES, HERBS, PILL_RECIPES, GHOST_MARKET_LISTINGS, ITEMS, MAPS, marketListingPrice, SKILLS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
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
import type { useFtue } from './ftue'

export function useMarket({ actions, cultivation, ftue: guide }: {
  actions: GameActions
  cultivation: Pick<ReturnType<typeof useCultivation>, 'changeMockKarma'>
  ftue: Pick<ReturnType<typeof useFtue>, 'ftue' | 'saveFtue'>
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
  const { gainItem } = playerStore
  const uiStore = useGameUiStore()
  const { shichenIdx } = storeToRefs(uiStore)
  const { appendLog, showToast } = uiStore
  const { changeMockKarma } = cultivation
  const { ftue, saveFtue } = guide

  const ghostAuction = ref({ ...GHOST_MARKET_LISTINGS.find((entry) => entry.listingType === 'AUCTION')! })
  const ghostListings = computed(() => GHOST_MARKET_LISTINGS.flatMap((entry) => {
    if (entry.listingType === 'AUCTION') return IS_MOCK_MODE ? [ghostAuction.value] : []
    return player.value.ghostMarketPurchases?.includes(entry.id) || ownedItemIds.value.includes(entry.itemId) || learnedSkills.value[entry.itemId] ? [] : [entry]
  }))

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

  function buyOrBidMarketListing(listingId: string) {
    const listing = ghostListings.value.find(({ id }) => id === listingId)
    if (!listing) return
    if (listing.listingType === 'AUCTION') {
      if (player.value.goldIngot < listing.price + 50) {
        showToast('元宝不足以加价竞拍！', 'danger')
        return
      }
      player.value.goldIngot -= 50
      listing.price += 50
      listing.highestBidderMasked = '蒙面客·你自己'
      learnedSkills.value[listing.itemId] = 1
      showToast('出价领先，已学会《凌波微步》。', 'gold')
      return
    }

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
      ftue.value.forageCount += 1
      saveFtue()
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
        if (!ftue.value.refinedRecipeIds.includes(recipeId)) {
          ftue.value.refinedRecipeIds.push(recipeId)
          saveFtue()
        }
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

  return {
    forageHerbs,
    refinePill,
    exchangeFurnaceResidue,
    ghostListings,
    ghostListingPrice,
    ghostAppraiseCost,
    appraiseGhostCurio,
    buyOrBidMarketListing,
  }
}
