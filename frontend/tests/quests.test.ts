import { describe, expect, it, vi } from 'vitest'
import { DISHES } from '@/config/questData'
import { forgeEquipment, forgeMaterials } from '../../shared/equipmentForge.ts'
import { backpackCapacity, equipmentItem, ITEMS, LINAN_CITY_MAP, MAPS, PILL_RECIPES, SKILLS } from '../../shared/gameData.ts'
import { appraiseGhostCurio, canEnterMap, cultivationRates, GHOST_APPRAISAL_SWORD, innVisitDay, karmaAfterEvent, mapTravelMilliseconds, planMapJourney, recipeForPlayer, settlePatrolCaches, SNAKE_FEEDING_RECIPE } from '../../shared/player.ts'
import { QUSAN_CACHE_KEY, QUSAN_CACHE_STAGE, skillFragmentDiscount } from '../../shared/skillMastery.ts'
import { collectTrialDrop, rollTrialDrop, TRIAL_ITEMS, trialAffixQuality, trialPartId, trialStageOf } from '../../shared/trialStages.ts'
import { boost, newStore, playNode, type Store } from './helpers'

const DAY = 86400_000
const SAVE_KEY = 'wuxia_idle_save'

describe('称号的客栈与白驼互动', () => {
  it('塞外浪子只对周伯通与洪七公加倍，按实际好感缺口封顶并沿用送礼次数', () => {
    const store = newStore('NEW')
    store.player.maxChapterId = 17
    store.player.silver = 4000
    store.learnedSkills.huyan_qiang = 1
    store.updateLoadout({ titleId: 'title_tabo', outerSkillId: 'huyan_qiang' })
    for (const id of ['zhoubotong', 'hongqigong', 'guojing']) store.companionAffinity[id].met = true
    store.companionAffinity.zhoubotong.affinity = 985
    expect(store.innGiftGain('zhoubotong', true)).toBe(15)
    expect(store.innGiftGain('hongqigong', false)).toBe(40)
    expect(store.innGiftGain('guojing', true)).toBe(80)
    store.giftCompanionInInn('zhoubotong', true)
    store.giftCompanionInInn('zhoubotong', true)
    expect(store.companionAffinity.zhoubotong.affinity).toBe(1000)
    expect(store.player.silver).toBe(2800)
    expect(store.giftsLeft('zhoubotong').gift).toBe(0)
    store.player.graduatedSectIds = ['gaibang']
    expect(store.innGiftGain('hongqigong', false)).toBe(20)
    const midnight = Date.parse('2026-11-13T23:00:00+08:00')
    expect(innVisitDay(midnight) - innVisitDay(midnight - 1)).toBe(1)
  })

  it('祖师殿和别院按实际称号或师门放行，赤炼阎罗进临安遇查延迟 5 秒', () => {
    const store = newStore('NEW')
    const map = (id: string) => MAPS.find((zone) => zone.id === id)!
    const hall = map('chongyang_hall')
    const manor = map('linan_manor')
    const island = map('taohua_isle')
    const { player, currentLoadout } = store
    expect(canEnterMap(hall, player, currentLoadout)).toBe(false)
    player.currentSectId = 'quanzhen'
    expect(canEnterMap(hall, player, currentLoadout, true)).toBe(true)
    player.currentSectId = null
    player.stats.karma = 200
    const hermit = { ...currentLoadout, titleId: 'title_chongyang', innerSkillId: 'quanzhen_tuna' }
    expect(canEnterMap(hall, player, hermit)).toBe(true)
    player.stats.karma = 199
    expect(canEnterMap(hall, player, hermit)).toBe(false)
    const wanderer = { ...currentLoadout, titleId: 'title_bihai', outerSkillId: 'luoying_zhang' }
    expect(canEnterMap(manor, player, wanderer)).toBe(true)
    expect(canEnterMap(island, player, wanderer, true)).toBe(true)
    expect(canEnterMap(island, player, currentLoadout, true)).toBe(false)

    const now = Date.parse('2026-11-13T16:00:00+08:00')
    player.stats.karma = -300
    const demon = { ...currentLoadout, titleId: 'title_youming', outerSkillId: 'jiuyin_baiguzhua' }
    expect(planMapJourney(player, LINAN_CITY_MAP, demon, now)).toMatchObject({ arrivesAt: now + 15000, inspected: true })
    expect(planMapJourney(player, 'jiaxing_suburb', demon, now)).not.toHaveProperty('inspected')
    player.lastCityInspectionAt = now
    expect(planMapJourney(player, LINAN_CITY_MAP, demon, now + 10_000)).toEqual({ mapId: LINAN_CITY_MAP, arrivesAt: now + 20_000 })
    expect(planMapJourney(player, LINAN_CITY_MAP, demon, now + 3_600_000)).toHaveProperty('inspected', true)
    expect(planMapJourney(player, LINAN_CITY_MAP, currentLoadout, now + 3_600_000)).not.toHaveProperty('inspected')
  })

  it('噬魂蛇君在白驼领一次秘方，换配装和读档后仍按秘方实际扣料', () => {
    const store = newStore('NEW')
    store.player.stats.karma = -200
    store.learnedSkills.lingshe_quan = 1
    store.updateLoadout({ titleId: 'title_wandu', outerSkillId: 'lingshe_quan' })
    expect(store.mayReceiveSnakeRecipe).toBe(false)
    store.player.currentSectId = 'baituo'
    expect(store.mayReceiveSnakeRecipe).toBe(true)
    store.claimSnakeRecipe()
    expect(store.player.snakeFeedingRecipe).toBe(true)
    expect(store.mayReceiveSnakeRecipe).toBe(false)
    store.updateLoadout({ titleId: null })
    store.saveNow()
    const restored = newStore()
    restored.continueGame()
    const recipe = PILL_RECIPES[SNAKE_FEEDING_RECIPE]
    expect(recipe.requiredHerbs.find(({ herbId }) => herbId === 'shexian_cao')?.count).toBe(3)
    const adjusted = recipeForPlayer(recipe, restored.player)
    expect(adjusted.requiredHerbs.find(({ herbId }) => herbId === 'shexian_cao')?.count).toBe(2)
    restored.player.qiExp = adjusted.costQi
    restored.player.silver = adjusted.costSilver
    restored.player.stats.intStat = 50
    for (const { herbId, count } of adjusted.requiredHerbs) restored.herbInventory[herbId] = count
    const rolls = vi.spyOn(Math, 'random').mockReturnValue(0)
    try { restored.refinePill(recipe.id) } finally { rolls.mockRestore() }
    expect(restored.player.battleMedicines?.[recipe.targetMedicineId]).toBe(2)
    expect(restored.herbInventory.shexian_cao).toBe(0)
  })
})

describe('赶路与随身背包', () => {
  const desert = 'damo_caravan'
  const swamp = 'heizhao_swamp'
  const lake = 'guiyun_lake'
  const home = 'jiaxing_suburb'
  const dunes = trialPartId('damo_qibing', 'BOOTS')
  const courier = trialPartId('jinwang_fuxiu', 'BOOTS')
  const mud = trialPartId('huanghe_sigui', 'BOOTS')
  const water = trialPartId('taihu_shuizhai', 'BOOTS')

  it('只按行程地形和出发时实穿的鞋计算耗时', () => {
    expect(mapTravelMilliseconds(home, desert)).toBe(10000)
    expect(mapTravelMilliseconds(home, desert, dunes)).toBe(9524)
    expect(mapTravelMilliseconds(desert, home, dunes)).toBe(9524)
    expect(mapTravelMilliseconds(home, swamp, dunes)).toBe(15000)
    expect(mapTravelMilliseconds(home, swamp, mud)).toBe(12500)
    expect(mapTravelMilliseconds(swamp, lake, mud)).toBe(12500)
    expect(mapTravelMilliseconds(lake, home, water)).toBe(10000)
    expect(mapTravelMilliseconds(home, swamp, water)).toBe(15000)
    expect(mapTravelMilliseconds(home, lake, courier)).toBe(13636)
  })

  it('出发后原地等候，提前抵达与改道无效，换装或读档保留原定时间', () => {
    vi.useFakeTimers()
    try {
      const time = Date.parse('2026-11-13T10:00:00+08:00')
      vi.setSystemTime(time)
      const store = newStore('NEW')
      store.ownedItemIds.push(dunes)
      store.equipItem(dunes)
      store.travelTo(desert)
      expect(store.player.mapJourney).toEqual({ mapId: desert, arrivesAt: time + 9524 })
      store.updateLoadout({ bootsId: null })
      store.moveMap(desert, 'arrive')
      store.travelTo(swamp)
      expect(store.player.currentMapId).toBe(home)
      expect(store.journeyMap?.id).toBe(desert)
      store.saveNow()
      vi.setSystemTime(time + 9524)
      const restored = newStore()
      restored.continueGame()
      expect(restored.player.mapJourney).toEqual({ mapId: desert, arrivesAt: time + 9524 })
      restored.moveMap(desert, 'arrive')
      expect(restored.player.currentMapId).toBe(desert)
      expect(restored.player.mapJourney).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('背包容量随当前腰带换装，并保留其余物品和原装备词条', () => {
    const store = newStore('NEW')
    const belts = [trialPartId('zuixian_xingshang', 'BELT'), trialPartId('changbai_canxian', 'BELT'), trialPartId('jiamian_piaoping', 'BELT')]
    store.ownedItemIds.push(...belts)
    expect(backpackCapacity(store.currentLoadout)).toBe(24)
    for (const [i, belt] of belts.entries()) {
      store.equipItem(belt)
      expect(backpackCapacity(store.currentLoadout)).toBe(24 + [3, 5, 8][i])
      expect(store.ownedItemIds).toEqual(expect.arrayContaining(belts))
    }
    expect(ITEMS[belts[1]].battleEffects).toContainEqual({ kind: 'PERIODIC_REDUCTION', category: 'poison', percent: 35 })
    store.updateLoadout({ beltId: null })
    expect(backpackCapacity(store.currentLoadout)).toBe(24)
  })
})

describe('鬼市一口价', () => {
  it('垂带与腰牌各自打九折，同时佩戴取高，按实际标价扣银且存档保留成交', () => {
    const store = newStore('NEW')
    const listing = store.ghostListings.find(({ id }) => id === 'mk_2')!
    const belt = trialPartId('jinwang_fuxiu', 'BELT')
    const token = trialPartId('jinwang_fuxiu', 'ACC')
    store.ownedItemIds.push(belt, token)
    expect(store.ghostListingPrice(listing)).toBe(8500)
    store.equipItem(belt)
    expect(store.ghostListingPrice(listing)).toBe(7650)
    store.updateLoadout({ beltId: null })
    store.equipItem(token)
    expect(store.ghostListingPrice(listing)).toBe(7650)
    store.equipItem(belt)
    expect(store.ghostListingPrice(listing)).toBe(7650)
    const auction = store.ghostListings.find(({ listingType }) => listingType === 'AUCTION')!
    expect(store.ghostListingPrice(auction)).toBe(auction.price)
    store.player.silver = 7649
    store.buyOrBidMarketListing(listing.id)
    expect(store.player.silver).toBe(7649)
    expect(store.ownedItemIds).not.toContain(listing.itemId)
    store.player.silver = 7650
    store.buyOrBidMarketListing(listing.id)
    store.buyOrBidMarketListing(listing.id)
    expect(store.player.silver).toBe(0)
    expect(store.ownedItemIds.filter((id) => id === listing.itemId)).toEqual([listing.itemId])
    expect(store.player.ghostMarketPurchases).toEqual([listing.id])
    expect(store.ghostListings.some(({ id }) => id === listing.id)).toBe(false)
    store.saveNow()
    const restored = newStore()
    restored.continueGame()
    expect(restored.player.ghostMarketPurchases).toEqual([listing.id])
    expect(restored.ghostListings.some(({ id }) => id === listing.id)).toBe(false)
  })

  it('赤炼阎罗生效时一口价取八折，叠穿九折装备仍只按八折结算', () => {
    const store = newStore('NEW')
    const listing = store.ghostListings.find(({ id }) => id === 'mk_2')!
    store.player.stats.karma = -300
    store.learnedSkills.jiuyin_baiguzhua = 1
    const beltId = trialPartId('jinwang_fuxiu', 'BELT')
    store.ownedItemIds.push(beltId)
    store.updateLoadout({ titleId: 'title_youming', outerSkillId: 'jiuyin_baiguzhua', beltId })
    expect(store.ghostListingPrice(listing)).toBe(6800)
    store.player.stats.karma++
    expect(store.ghostListingPrice(listing)).toBe(7650)
    store.player.stats.karma--
    store.player.silver = 6800
    store.buyOrBidMarketListing(listing.id)
    expect(store.player.silver).toBe(0)
    expect(store.ownedItemIds).toContain(listing.itemId)
  })
})

describe('鬼市鉴宝与侠义装备', () => {
  const daytime = Date.parse('2026-11-13T12:00:00+08:00')
  const costume = trialPartId('jiamian_piaoping', 'HEAD')
  const shoes = trialPartId('huangshan_kulou', 'BOOTS')
  const bronzeMask = trialPartId('huangshan_kulou', 'HEAD')

  it('以实际穿戴累加 35 个百分点避查，命中概率边界时照常扣侠义', () => {
    const store = newStore('NEW')
    const player = store.player
    player.currentSectId = 'quanzhen'
    player.silver = 1800
    player.stats.karma = 50
    const preset = { ...store.currentLoadout, headId: costume, bootsId: shoes }
    const change = vi.fn((delta: number) => delta)
    expect(appraiseGhostCurio(player, preset, true, false, daytime, change, () => 0.349)).toMatchObject({ inspection: 'EVADED', evasionPercent: 35, karmaDelta: 0 })
    expect(appraiseGhostCurio(player, preset, true, false, daytime, change, () => 0.35)).toMatchObject({ inspection: 'CAUGHT', evasionPercent: 35, karmaDelta: -25 })
    expect(appraiseGhostCurio(player, preset, true, true, daytime, change, () => 0.99)).toMatchObject({ inspection: 'NONE', karmaDelta: 0 })
    expect(change).toHaveBeenCalledExactlyOnceWith(-25)
    expect(player.silver).toBe(0)
    expect(player.battleMedicines?.jiuhua_yulu_wan).toBe(3)
    expect(appraiseGhostCurio(player, preset, true, false, daytime, change, () => 0.99)).toHaveProperty('error')
    expect(player.wearingMask).toBe(true)
  })

  it('鬼面按实际侠义事件增减，越过上下限时按实际差额记，鉴出重剑后仍可淘丹', () => {
    const store = newStore('NEW')
    store.ownedItemIds.push(bronzeMask)
    store.equipItem(bronzeMask)
    store.player.stats.intStat = 28
    store.player.stats.karma = -980
    store.player.currentSectId = 'quanzhen'
    store.player.silver = 1800
    const qi = store.player.qiExp
    store.appraiseGhostCurio(false)
    expect(store.player.stats.karma).toBe(-1000)
    expect(store.ownedItemIds.filter((id) => id === GHOST_APPRAISAL_SWORD)).toHaveLength(1)
    expect(store.player.battleMedicines?.jiuhua_yulu_wan).toBeUndefined()
    store.appraiseGhostCurio(true)
    expect(store.player.battleMedicines?.jiuhua_yulu_wan).toBe(1)
    expect(store.player.qiExp - qi).toBe(2200)
    expect(store.player.silver).toBe(600)
    expect(karmaAfterEvent(0, -25, bronzeMask)).toBe(-28)
    expect(karmaAfterEvent(0, 25, bronzeMask)).toBe(28)
    expect(karmaAfterEvent(980, 25, bronzeMask)).toBe(1000)
    expect(karmaAfterEvent(0, -25, costume)).toBe(-25)
  })
})

describe('巡历遭遇', () => {
  it('保留短间隔结算余量，路引令只加快遭遇，换关清空旧池余量', () => {
    const t = clock()
    const store = newStore('NEW')
    const token = trialPartId('huanghe_sigui', 'ACC')
    store.ownedItemIds.push(token)
    store.trial.maxStageId = 2
    vi.spyOn(Math, 'random').mockReturnValue(0)
    t.add(15 * 60_000)
    store.mockSettlePatrol()
    expect(store.trialPatrolStatus().encounters).toBe(0)
    store.equipItem(token)
    t.add(13 * 60_000)
    store.mockSettlePatrol()
    expect(store.trialPatrolStatus().encounters).toBe(0)
    t.add(60_000)
    store.mockSettlePatrol()
    expect(store.trialPatrolStatus().hours).toBeCloseTo(29 / 60)
    expect(store.trialPatrolStatus().encounters).toBe(1)
    expect(store.trial.recentDrops[0]?.id).toBe(trialPartId('pomiao_caomang', 'WEAPON'))
    store.mockSettlePatrol()
    expect(store.trial.recentDrops).toHaveLength(1)
    t.add(20 * 60_000)
    store.setPatrolStage(2)
    t.add(9 * 60_000)
    store.mockSettlePatrol()
    expect(store.trialPatrolStatus()).toMatchObject({ stageId: 2, hours: 9 / 60, encounters: 0 })
    expect(store.trial.recentDrops).toHaveLength(1)
  })

  it('掉落按来源分别掷部位和成色，特技款与极品可同时出现', () => {
    const stage = trialStageOf(7)!
    const roll = (source: 'PATROL' | 'REPLAY', ...values: number[]) => rollTrialDrop(stage, source, () => values.shift()!)
    const dagger = trialPartId(stage.setId, 'WEAPON')
    expect(roll('PATROL', 0.25)).toBeUndefined()
    expect(roll('PATROL', 0, 0, 0.799, 0.2)).toMatchObject({ id: dagger, affixRoll: 0 })
    expect(roll('PATROL', 0, 0, 0.8, 0.5, 0.2)).toMatchObject({ id: dagger, affixRoll: 14 })
    expect(roll('PATROL', 0, 0, 0.96, 0.99, 0.19)).toMatchObject({ id: `${dagger}_cuixin`, affixRoll: 38 })
    expect(roll('PATROL', 0, 0.6, 0, 0)).toMatchObject({ id: trialPartId(stage.setId, 'BELT') + '_jushi' })
    expect(roll('REPLAY', 0, 0.449, 0.2)).toMatchObject({ id: dagger, affixRoll: 0 })
    expect(roll('REPLAY', 0, 0.45, 0, 0.2)).toMatchObject({ id: dagger, affixRoll: 10 })
    expect(roll('REPLAY', 0, 0.85, 0.5, 0.19)).toMatchObject({ id: `${dagger}_cuixin`, affixRoll: 31 })
    expect(roll('REPLAY', 0.5, 0)).toMatchObject({ id: trialPartId(stage.setId, 'ARMOR'), affixRoll: 0 })
  })

  it('同款保留较高值，特殊款独立持有，集齐部位后重复件只记明细', () => {
    const store = newStore('NEW')
    const stage = trialStageOf(7)!
    const dagger = trialPartId(stage.setId, 'WEAPON')
    const variant = dagger + '_cuixin'
    const award = (id: string, affixRoll: number) => collectTrialDrop(store.player, store.ownedItemIds, stage, {
      id, name: ITEMS[id].name, tier: ITEMS[id].tier, affixRoll,
    }, Date.now())

    expect(award(dagger, 25)).toMatchObject({ outcome: 'NEW' })
    store.equipItem(dagger)
    const before = store.derivedStats.atk
    expect(award(dagger, 31)).toMatchObject({ outcome: 'UPGRADED' })
    expect(store.derivedStats.atk - before).toBe(6)
    expect(award(dagger, 31)).toMatchObject({ outcome: 'DUPLICATE', marksEarned: 1 })
    expect(award(variant, 19)).toMatchObject({ outcome: 'NEW' })
    expect(equipmentItem(dagger, store.player)?.atkBonus).toBe(156)
    expect(equipmentItem(variant, store.player)?.atkBonus).toBe(144)
    expect(equipmentItem(dagger)?.atkBonus).toBe(125)
    const belt = trialPartId(stage.setId, 'BELT')
    for (const item of TRIAL_ITEMS.filter((item) => item.setId === stage.setId && item.id !== dagger)) {
      award(item.id === belt ? belt + '_jushi' : item.id, 0)
    }
    expect(award(dagger, 0)).toMatchObject({ outcome: 'DUPLICATE', marksEarned: undefined })
    expect(store.trial.recentDrops[0]).toMatchObject({ id: dagger, affixRoll: 0, outcome: 'DUPLICATE' })
    expect(store.trial.marks['7']).toBe(1)
    store.trial.marks['7'] = 4
    store.redeemTrialPart(7, 'BELT')
    expect(store.trial.marks['7']).toBe(4)
    expect(store.ownedItemIds).not.toContain(belt)
    store.saveNow()
    const restored = newStore()
    restored.continueGame()
    expect(restored.player.equipmentAffixes).toEqual({ [dagger]: 31, [variant]: 19 })
    expect(restored.derivedStats.atk).toBe(store.derivedStats.atk)
  })

  it('已穿戴的收益装升档前先按旧词条结清，再按新档累积', () => {
    const t = clock()
    const store = newStore('NEW')
    const id = trialPartId('pomiao_caomang', 'ACC')
    store.ownedItemIds.push(id)
    store.equipItem(id)
    const before = cultivationRates(store.player, store.currentLoadout)
    const silver = store.player.silver
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
      .mockReturnValueOnce(0).mockReturnValueOnce(0.9).mockReturnValueOnce(0.99).mockReturnValueOnce(0.99)
    t.add(30 * 60_000)
    store.mockSettlePatrol()
    expect(store.trial.recentDrops[0]).toMatchObject({ id, affixRoll: 5, outcome: 'UPGRADED' })
    expect(trialAffixQuality(id, 5)).toBe('极品')
    expect(store.player.lastSettleAt).toBe(t.now)
    expect(store.player.silver - silver).toBe(Math.round(Math.round(before.silverBasis * 0.5) * 0.28))
    const after = cultivationRates(store.player, store.currentLoadout)
    expect(after.silverBasis).toBeGreaterThan(before.silverBasis)
    expect(after.qi).toBe(before.qi)
    expect(equipmentItem(id, store.player)?.patrolSilverBonus).toBe(10)
  })

  it('固定每小时真气的辟水玄珠升级也先结清旧时段', () => {
    const t = clock()
    const store = newStore('NEW')
    const stage = trialStageOf(10)!
    const id = trialPartId(stage.setId, 'ACC')
    store.trial.maxStageId = stage.id
    store.setPatrolStage(stage.id)
    store.ownedItemIds.push(id)
    store.equipItem(id)
    const before = cultivationRates(store.player, store.currentLoadout)
    const qi = store.player.qiExp
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
      .mockReturnValueOnce(0).mockReturnValueOnce(0.9).mockReturnValueOnce(0.99).mockReturnValueOnce(0.99)
    t.add(30 * 60_000)
    store.mockSettlePatrol()
    expect(store.trial.recentDrops[0]).toMatchObject({ id, affixRoll: 90, outcome: 'UPGRADED' })
    expect(store.player.qiExp - qi).toBe(Math.round(before.qi / 2))
    expect(cultivationRates(store.player, store.currentLoadout).qi).toBe(before.qi + 90)
  })
})

/** 接管 Date.now，返回一个可随时改时间的设置器（afterEach 自动还原） */
function clock(start = Date.now()) {
  let t = start
  vi.spyOn(Date, 'now').mockImplementation(() => t)
  return {
    set: (v: number) => (t = v),
    add: (ms: number) => (t += ms),
    get now() {
      return t
    },
  }
}

describe('装备淬炼与鬼市重铸', () => {
  const ghostHour = Date.UTC(2026, 10, 13, 15)

  it('巡历材料按完整遭遇发放，分解扣装备且重复结算不会多发，读档保留星级', () => {
    const t = clock()
    const store = newStore('NEW')
    const itemId = 'cloth_bracers'
    store.ownedItemIds.push(itemId)
    store.player.equipmentAffixes = { [itemId]: 2 }
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    t.add(29 * 60_000)
    store.mockSettlePatrol()
    expect(store.player.equipmentForge).toBeUndefined()
    t.add(60_000)
    store.mockSettlePatrol()
    store.mockSettlePatrol()
    expect(store.player.equipmentForge).toMatchObject({ iron: 1, stones: 1 })
    store.changeEquipmentForge({ action: 'salvage', itemId })
    store.changeEquipmentForge({ action: 'salvage', itemId })
    expect(store.ownedItemIds).not.toContain(itemId)
    expect(store.player.equipmentAffixes?.[itemId]).toBeUndefined()
    expect(store.player.equipmentForge).toMatchObject({ iron: 3, stones: 2 })
    store.changeEquipmentForge({ action: 'temper', itemId: 'qinggang_sword' })
    expect(store.player.equipmentForge).toMatchObject({ iron: 2, stones: 1, items: { qinggang_sword: { stars: 1, pity: 0 } } })
    store.saveNow()
    const restored = newStore()
    restored.continueGame()
    expect(restored.player.equipmentForge).toEqual(store.player.equipmentForge)
    expect(restored.ownedItemIds).not.toContain(itemId)
    expect(restored.derivedStats.atk).toBe(store.derivedStats.atk)
  })

  it('五星保底后失败只扣石，逐次提高成功率，九星封顶且仍按基础叠加', () => {
    const store = newStore('NEW')
    const item = ITEMS.qinggang_sword
    const input = { action: 'temper', itemId: item.id } as const
    const materials = forgeMaterials(store.player, 100, 100)
    const rng = vi.fn(() => 0.99)
    const attempt = () => forgeEquipment(store.player, item, input, { presets: [], now: ghostHour, rng })
    for (let stars = 1; stars <= 5; stars++) expect(attempt()).toMatchObject({ success: true, stars, pity: 0 })
    expect(rng).not.toHaveBeenCalled()
    expect(materials).toMatchObject({ iron: 85, stones: 91 })
    for (let pity = 10; pity <= 30; pity += 10) {
      expect(attempt()).toMatchObject({ success: false, stars: 5, pity, iron: 0, stones: 3 })
    }
    expect(materials).toMatchObject({ iron: 85, stones: 82 })
    expect(attempt()).toMatchObject({ success: true, stars: 6, pity: 0, iron: 6, stones: 3 })
    rng.mockReturnValue(0)
    for (let stars = 7; stars <= 9; stars++) expect(attempt()).toMatchObject({ success: true, stars, pity: 0 })
    expect(attempt()).toHaveProperty('error')
    expect(materials).toMatchObject({ iron: 55, stones: 66 })
    expect(equipmentItem(item.id, store.player)).toMatchObject({
      atkBonus: 86, critBonus: 5.7, battleEffects: [{ kind: 'STAT_BONUS', stats: { agi: 10 } }],
    })
    expect(item.atkBonus).toBe(45)
  })

  it('闲置才可分解，所有预设的伙伴、已淬炼装备与门派装备受保护', () => {
    const store = newStore('NEW')
    const item = ITEMS.cloth_bracers
    const input = { action: 'salvage', itemId: item.id } as const
    const other = { ...store.currentLoadout, presetIdx: 3 as const, companionEquipment: { huangrong: { WRIST: item.id } } }
    const options = { presets: [other], now: ghostHour }
    expect(forgeEquipment(store.player, item, input, options)).toHaveProperty('error')
    expect(store.player.equipmentForge).toBeUndefined()
    expect(forgeEquipment(store.player, ITEMS.iron_bagua, { ...input, itemId: 'iron_bagua' }, options)).toHaveProperty('error')
    const material = forgeMaterials(store.player, 10, 10)
    material.items[item.id] = { stars: 1, pity: 0 }
    expect(forgeEquipment(store.player, item, input, { ...options, presets: [] })).toHaveProperty('error')
    expect(material).toMatchObject({ iron: 10, stones: 10, items: { [item.id]: { stars: 1 } } })
  })

  it('只在嘉兴子时重铸，分别锁定主副词条且旧巡历词条独立加在基础星级上', () => {
    const store = newStore('NEW')
    const item = ITEMS.pomiao_caomang_acc
    const { player } = store
    const costs = forgeMaterials(player, 1, 1)
    costs.items[item.id] = { stars: 5, pity: 0 }
    player.equipmentAffixes = { [item.id]: 5 }
    player.silver = 3000
    const input = { action: 'reforge', itemId: item.id, lock: 'primary' } as const
    const settle = vi.fn(() => expect(player.equipmentAffixes?.[item.id]).toBe(5))
    const options = { presets: [{ ...store.currentLoadout, accId: item.id }], now: ghostHour, settle, rng: () => 0 }
    player.currentMapId = 'damo_caravan'
    expect(forgeEquipment(player, item, input, options)).toHaveProperty('error')
    player.currentMapId = 'jiaxing_suburb'
    expect(forgeEquipment(player, item, input, { ...options, now: ghostHour - 1 })).toHaveProperty('error')
    expect(forgeEquipment(player, item, input, { ...options, now: ghostHour + 2 * 3_600_000 })).toHaveProperty('error')
    expect(forgeEquipment(player, item, { ...input, lock: 'secondary' }, options)).toHaveProperty('error')
    expect(player.silver).toBe(3000)
    const lockedPrimary = forgeEquipment(player, item, input, options)
    expect(lockedPrimary).toMatchObject({ affixRoll: 5, silver: 900, secondary: { stat: 'crit', value: 2 } })
    expect(equipmentItem(item.id, player)).toMatchObject({ attributeBonus: { luck: 5 }, patrolSilverBonus: 10 })
    const lockedSecondary = forgeEquipment(player, item, { ...input, lock: 'secondary' }, { ...options, now: ghostHour + 3_600_000 })
    expect(lockedSecondary).toMatchObject({ affixRoll: 1, silver: 900, secondary: { stat: 'crit', value: 2 } })
    expect(player.silver).toBe(1200)
    expect(settle).toHaveBeenCalledTimes(2)
    expect(equipmentItem(item.id, player)).toMatchObject({ patrolSilverBonus: 6, battleEffects: [{ kind: 'STAT_BONUS', stats: { crit: 2 } }] })
  })
})

describe('巡历与武学残页', () => {
  it('沙海长靴只在大漠增加真气，穿脱先结清旧时段，纹银沿用原值', () => {
    const t = clock()
    const store = newStore('NEW')
    const bootsId = trialPartId('damo_qibing', 'BOOTS')
    store.player.stats.con = 0
    store.ownedItemIds.push(bootsId)
    const gear = { ...store.currentLoadout, bootsId }
    expect(cultivationRates(store.player, gear)).toEqual(cultivationRates(store.player, store.currentLoadout))
    store.player.currentMapId = 'damo_caravan'
    const before = cultivationRates(store.player, store.currentLoadout)
    const after = cultivationRates(store.player, gear)
    expect(after.qi).toBe(Math.round(before.qi * 1.05))
    expect(after.silverBasis).toBe(before.silverBasis)
    store.player.lastSettleAt = t.now
    const qi = store.player.qiExp
    t.add(3_600_000)
    store.equipItem(bootsId)
    expect(store.player.qiExp - qi).toBe(before.qi)
    expect(store.effectiveQiPerHour).toBe(after.qi)
    t.add(3_600_000)
    store.updateLoadout({ bootsId: null })
    expect(store.player.qiExp - qi).toBe(before.qi + after.qi)
  })

  it('铁八卦按巡历遭遇提高宝箱相对概率 15%，福缘读取真实配装', () => {
    const store = newStore('NEW')
    const { player } = store
    player.stats.luck = 0
    const none = { ...store.currentLoadout, accId: null }
    const bagua = { ...none, accId: 'iron_bagua' }
    const roll = () => 0.055
    expect(settlePatrolCaches(player, none, 2, Date.now(), roll)).toBeUndefined()
    const silver = player.silver
    expect(settlePatrolCaches(player, bagua, 2, Date.now(), roll)).toEqual({ count: 2, silver: 240 })
    expect(player.silver - silver).toBe(240)
    expect(player.trial.recentCache).toMatchObject({ count: 2, silver: 240 })
    const lucky = { ...none, accId: trialPartId('niluan_jiuyin', 'ACC') }
    expect(settlePatrolCaches(player, lucky, 1, Date.now(), roll)).toEqual({ count: 1, silver: 120 })
    expect(settlePatrolCaches(player, bagua, 1, Date.now(), () => 0.0576)).toBeUndefined()
  })

  it('曲三酒馆暗格需持钥巡历第 24 关，零点刷新且残页只在对应武学成功参悟时扣除', () => {
    const t = clock(Date.parse('2026-11-13T23:59:59+08:00'))
    const store = newStore('NEW')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    store.trial.maxStageId = QUSAN_CACHE_STAGE + 1
    store.openQusanCache()
    expect(store.player.skillFragments).toBeUndefined()
    store.ownedItemIds.push(QUSAN_CACHE_KEY)
    store.equipItem(QUSAN_CACHE_KEY)
    store.trial.rewardedStageIds.push(QUSAN_CACHE_STAGE)
    store.openQusanCache()
    expect(store.player.skillFragments).toBeUndefined()
    store.setPatrolStage(QUSAN_CACHE_STAGE)
    store.openQusanCache()
    store.openQusanCache()
    const id = 'luoying_zhang'
    expect(store.player.skillFragments).toEqual({ [id]: 1 })
    t.add(1000)
    store.openQusanCache()
    expect(store.player.skillFragments).toEqual({ [id]: 2 })
    store.saveNow()
    const restored = newStore()
    restored.continueGame()
    restored.openQusanCache()
    expect(restored.player.skillFragments).toEqual({ [id]: 2 })
    restored.learnedSkills[id] = 1
    const full = restored.getSkillUpgradeCost(id)
    const discounted = skillFragmentDiscount(SKILLS[id], full, 2)
    restored.player.qiExp = discounted.spentQi - 1
    restored.upgradeSkillMastery(id, true)
    expect(restored.learnedSkills[id]).toBe(1)
    expect(restored.player.skillFragments).toEqual({ [id]: 2 })
    restored.player.qiExp = discounted.spentQi
    restored.upgradeSkillMastery(id, true)
    expect(restored.learnedSkills[id]).toBe(2)
    expect(restored.player.skillFragments).toEqual({ [id]: 0 })
    expect(restored.player.qiExp).toBe(0)
    expect(discounted.spentQi).toBe(full - Math.floor(full * 0.1))
  })
})

describe('本地存档', () => {
  it('保存后重启可继续，主线进度与配装都恢复', () => {
    const s1 = newStore()
    expect(s1.savedGame).toBeNull()
    s1.startGame('NEW')
    playNode(s1, 1)
    s1.saveNow()
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()

    const s2 = newStore()
    expect(s2.gameMode).toBeNull()
    expect(s2.savedGame).toMatchObject({ mode: 'NEW', node: '1-2' })
    s2.continueGame()
    expect(s2.gameMode).toBe('NEW')
    expect(s2.player.maxChapterId).toBe(2)
    expect(s2.currentLoadout.outerSkillId).toBe('kaishan_zhang')
  })

  it('旧档缺字段时补默认值，已删除的伙伴被丢弃', () => {
    const s1 = newStore('NEW')
    s1.saveNow()
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!)
    delete raw.data.reunion
    delete raw.data.feast
    delete raw.data.player.trial
    raw.data.companionAffinity = { guojing: { affinity: 150, recruited: true, taught: false, met: true }, ghost_companion: { affinity: 1 } }
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw))

    const s = newStore()
    s.continueGame()
    expect(s.companionAffinity.guojing).toMatchObject({ affinity: 150, tokens: 0, form: 'base' })
    expect('ghost_companion' in s.companionAffinity).toBe(false)
    expect(s.companionAffinity.zhebie).toBeDefined()
    expect(s.feast.cooked).toEqual([])
    expect(s.reunionView('meichaofeng').clues).toBe(0)
    expect(s.trial).toMatchObject({ selectedStageId: 1, maxStageId: 1, rewardedStageIds: [] })
  })

  it('历练、巡历、行历和炼丹数据随试玩角色存档恢复', () => {
    const t = clock()
    const s = newStore('DEMO')
    s.challengeTrialStage(1)
    s.skipBattleToEnd()
    expect(s.activeBattle?.winner).toBe('ALLY')
    s.closeBattleStage()
    s.claimFtueReward()
    s.setPatrolStage(2)
    t.add(35 * 60_000)
    s.mockSettlePatrol()
    s.forageHerbs()
    expect(s.trialPatrolStatus().hours).toBeGreaterThan(0)
    expect(s.ftue.claimed).toEqual([1])
    s.saveNow()

    const resumed = newStore()
    resumed.continueGame()
    expect(resumed.trial).toEqual(s.trial)
    expect(resumed.trial.rewardedStageIds).toEqual([1])
    expect(resumed.ftue.claimed).toEqual([1])
    expect(resumed.herbInventory).toEqual(s.herbInventory)
    expect(resumed.openedAcupointIds).toEqual(s.openedAcupointIds)
    expect(resumed.ownedItemIds).toEqual(s.ownedItemIds)
  })

  it('本地角色切换及重启后保留角色身份和各自的剧情进度', () => {
    const s = newStore('DEMO')
    const defaultId = s.player.id
    const createdId = s.createLocalCharacter('归云侠客', 'hero_sword_male')!
    s.selectLocalCharacter(createdId)
    s.startGame('NEW')
    expect(playNode(s, 1)).toBe('ALLY')
    s.selectLocalCharacter(defaultId)
    expect(s.player.maxChapterId).toBe(5)
    s.selectLocalCharacter(createdId)
    expect(s.player).toMatchObject({ id: createdId, nickname: '归云侠客', avatarId: 'hero_sword_male', maxChapterId: 2 })
    expect(s.claimedNodeIds).toEqual([1])
    s.saveNow()

    const resumed = newStore()
    expect(resumed.savedGame?.playerId).toBe(createdId)
    resumed.selectLocalCharacter(createdId)
    resumed.continueGame()
    expect(resumed.player).toMatchObject({ id: createdId, maxChapterId: 2 })
    expect(resumed.claimedNodeIds).toEqual([1])
  })

  it('版本不符的存档被忽略；可删除存档', () => {
    const s1 = newStore('NEW')
    s1.saveNow()
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!)
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...raw, version: 999 }))
    expect(newStore().savedGame).toBeNull()

    s1.saveNow()
    s1.deleteSave()
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    expect(s1.savedGame).toBeNull()
  })

  it('VITE_LOCAL_SAVE=false 时不读不写', async () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 1, data: { gameMode: 'NEW' } }))
    vi.stubEnv('VITE_LOCAL_SAVE', 'false')
    vi.resetModules()
    const p = await import('@/stores/persistence')
    expect(p.LOCAL_SAVE_ENABLED).toBe(false)
    expect(p.readSave()).toBeNull()
    expect(p.writeSave({ x: 1 })).toBe(false)
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).savedAt).toBe(1)
  })

  it('同一会话里玩过新游戏，再选演武模式会完整还原', () => {
    const s = newStore('NEW')
    playNode(s, 1)
    s.backToTitle()
    expect(s.gameMode).toBeNull()
    s.startGame('DEMO')
    expect(s.player.level).toBe(32)
    expect(s.player.maxChapterId).toBe(5)
    expect(s.companionAffinity.huangyaoshi.recruited).toBe(true)
  })
})

describe('故人寻访', () => {
  function setup() {
    const s = newStore('NEW')
    boost(s)
    s.player.maxChapterId = 6
    s.player.silver = 9_999_999
    s.resolvedAdventureIds.push('huangshan_bishou')
    const c = clock(Date.now() + 3 * 3600_000)
    const settleAfter = (mins: number) => {
      s.player.lastSettleAt = c.now - mins * 60_000
      s.settleOfflineQi()
    }
    return { s, c, settleAfter }
  }

  function gatherClues(s: Store, id: string, node: number, c: ReturnType<typeof clock>) {
    let days = 0
    while (s.reunionView(id).step === 'CLUES' && days < 60) {
      if (days > 0) c.add(DAY)
      days++
      s.player.lastSettleAt = c.now - 2 * 3600_000
      s.settleOfflineQi()
      expect(playNode(s, node)).toBe('ALLY')
      s.inquireReunion(id)
    }
    return days
  }

  it('三种线索来源各有每日上限，被拒时不扣银', () => {
    const { s, settleAfter } = setup()
    expect(s.reunionCandidates).toContain('meichaofeng')
    settleAfter(120)
    settleAfter(120)
    expect(s.reunionView('meichaofeng').clues, '闭关打听每日上限 5').toBe(5)
    playNode(s, 3)
    playNode(s, 3)
    expect(s.reunionView('meichaofeng').clues, '旧地重游每日上限 3').toBe(8)
    const silver = s.player.silver
    s.inquireReunion('meichaofeng')
    s.inquireReunion('meichaofeng')
    expect(s.reunionView('meichaofeng').clues).toBe(10)
    expect(s.player.silver).toBe(silver - 300)
  })

  it('每日满额恰好 30 天集齐；故地累计相候 2 小时（离开不计时）→ 备礼 → 重逢战 → 入队', () => {
    const { s, c } = setup()
    const days = gatherClues(s, 'meichaofeng', 3, c)
    expect(days).toBe(30)
    expect(s.reunionView('meichaofeng').step).toBe('WAIT')

    s.completeReunionWait('meichaofeng')
    expect(s.reunionView('meichaofeng').step, '未候满不能赴约').toBe('WAIT')
    const t0 = c.now
    c.set(t0 + 3600_000)
    s.moveMap('zhongnan_forest') // 已候 1 小时，离开
    c.set(t0 + 5 * 3600_000)
    s.moveMap('jiaxing_suburb') // 离开期间不计时
    c.set(t0 + 6 * 3600_000 + 60_000)
    s.completeReunionWait('meichaofeng')
    expect(s.reunionView('meichaofeng').step).toBe('GIFT')

    s.reunionGift('meichaofeng')
    expect(s.reunionView('meichaofeng').step).toBe('BATTLE')
    s.player.stats.agi = 80
    s.reunionBattle('meichaofeng')
    expect(s.activeBattle).toMatchObject({ sceneTitle: '故人重逢 · 梅超风', winner: 'ALLY' })
    expect(s.activeBattle?.units.find((unit) => unit.slot === 'ENEMY_LEFT')?.name).toBe('全真执剑弟子')
    expect(s.activeBattle?.events.find((event) => event.actorSlot === 'ENEMY_LEFT' && event.type === 'SKILL_CAST')).toBeDefined()
    const maxMp = s.activeBattle!.units.find((unit) => unit.slot === 'ENEMY_MAIN')!.maxMp
    expect(s.activeBattle?.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && (event.mpDelta ?? 0) < 0))
      .toMatchObject({ round: 3, mpDelta: -Math.round(maxMp * 0.25), rageDelta: -85 })
    expect(s.activeBattle?.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.skillId === 'quanzhen_jianfa'))
      .toMatchObject({ round: 3, isUlt: true })
    expect(s.activeBattle?.events.find((event) => event.actorSlot === 'ENEMY_MAIN' && event.effectSourceId === 'quanzhen_tuna' && (event.mpDelta ?? 0) > 0))
      .toBeDefined()
    expect(s.companionAffinity.meichaofeng.recruited).toBe(false)
    s.skipBattleToEnd()
    expect(s.companionAffinity.meichaofeng.recruited).toBe(true)
    expect(s.reunionView('meichaofeng').step).toBe('DONE')
    expect(s.reunionCandidates).not.toContain('meichaofeng')
    s.closeBattleStage()
  })

  it('铁枪庙告别后可寻访杨铁心，段天德蓄力可用太极化解，金兵斥候独立出手', () => {
    const s = newStore('NEW')
    boost(s)
    s.player.maxChapterId = 5
    s.player.silver = 9_999_999
    expect(playNode(s, 5)).toBe('ALLY')
    expect(s.pendingAdventure?.templateId).toBe('tieqiangmiao')
    s.resolveAdventure('B')
    expect(s.reunionCandidates).toContain('yangtiexin')
    const c = clock(Date.now() + 3 * 3600_000)
    expect(gatherClues(s, 'yangtiexin', 5, c)).toBe(30)
    s.moveMap('zhongnan_forest')
    c.add(2 * 3600_000 + 60_000)
    s.completeReunionWait('yangtiexin')
    s.reunionGift('yangtiexin')
    expect(s.reunionView('yangtiexin').step).toBe('BATTLE')
    s.player.level = 32
    s.player.realmTier = 3
    Object.assign(s.player.stats, { str: 35, con: 55, agi: 29, intStat: 32 })
    s.updateLoadout({ stance: 'TAICHI' })
    try {
      s.reunionBattle('yangtiexin')
      const report = s.activeBattle
      expect(report).toMatchObject({ sceneTitle: '故人重逢 · 杨铁心', winner: 'ALLY' })
      expect(report?.units.find((unit) => unit.slot === 'ENEMY_MAIN')).toMatchObject({ name: '金兵统领·段天德', maxHp: 13140 })
      expect(report?.units.find((unit) => unit.slot === 'ENEMY_LEFT')).toMatchObject({ name: '金兵搜山斥候', maxHp: 3942 })
      expect(report?.events.find((event) => event.actorSlot === 'ENEMY_LEFT' && event.type === 'SKILL_CAST')).toBeDefined()
      expect(report?.events.find((event) => event.effectSourceId === 'taichi_deflect')).toMatchObject({
        round: 3, targetSlot: 'ENEMY_MAIN', segments: [{ text: '太极借力 · 化解金兵合围' }],
      })
      s.reunionBattle('yangtiexin')
      expect(s.activeBattle).toBe(report)
      expect(s.companionAffinity.yangtiexin.recruited).toBe(false)
      s.skipBattleToEnd()
      s.skipBattleToEnd()
      expect(s.companionAffinity.yangtiexin).toMatchObject({ recruited: true, affinity: 100 })
      expect(s.reunionView('yangtiexin').step).toBe('DONE')
    } finally {
      s.closeBattleStage()
    }
  })
})

describe('北丐·十道绝味', () => {
  it('结识洪七公后开启；未呈齐时好感再高也不入队', () => {
    const s = newStore('NEW')
    s.player.maxChapterId = 17
    s.player.silver = 9_999_999
    expect(s.feastActive).toBe(false)
    s.companionAffinity.hongqigong.met = true
    expect(s.feastActive).toBe(true)
    s.companionAffinity.hongqigong.affinity = 300
    s.giftCompanionInInn('hongqigong', false)
    expect(s.companionAffinity.hongqigong.recruited).toBe(false)
  })

  it('食材在对应地图挂机采办，每日只能掌勺一道，十天呈齐后入队', () => {
    const s = newStore('NEW')
    s.player.maxChapterId = 17
    s.player.silver = 9_999_999
    s.companionAffinity.hongqigong.met = true
    const c = clock(Date.now() + 10 * DAY + 4 * 3600_000)
    for (const d of DISHES) {
      c.add(DAY)
      if (s.player.currentMapId !== d.mapId) s.moveMap(d.mapId)
      s.player.lastSettleAt = c.now - 40 * 60_000
      s.settleOfflineQi()
      expect(s.feast.ingredients.includes(d.id) || s.feast.cooked.includes(d.id), d.ingredient).toBe(true)
      s.cookDish(d.id)
      const another = DISHES.find((x) => x.id !== d.id && s.feast.ingredients.includes(x.id))
      if (another) {
        const n = s.feast.cooked.length
        s.cookDish(another.id)
        expect(s.feast.cooked.length, '每日只能掌勺一道').toBe(n)
      }
    }
    expect(s.feast.cooked).toHaveLength(10)
    expect(s.companionAffinity.hongqigong.recruited).toBe(true)
    expect(s.storyFlags).toContain('hong_feast_done')
    expect(s.feastActive).toBe(false)
  })

  it('离线不足 30 分钟采不到食材；已入队（抽卡 / 演武）则不开启', () => {
    const s = newStore('NEW')
    s.companionAffinity.hongqigong.met = true
    s.player.lastSettleAt = Date.now() - 10 * 60_000
    s.settleOfflineQi()
    expect(s.feast.ingredients).toEqual([])
    expect(newStore('DEMO').feastActive).toBe(false)
  })
})
