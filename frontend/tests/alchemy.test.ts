import { describe, expect, it, vi } from 'vitest'
import { FORAGE_QI_COST } from '../../shared/alchemy.ts'
import { HERBS, MEDICINES, ONLINE_MAPS, PILL_RECIPES, getMapHerbs } from '../../shared/gameData.ts'
import { newStore } from './helpers'

describe('百草丹房', () => {
  it('每种药材均有产地，每份丹方均引用现有药材和成药', () => {
    const mapIds = ONLINE_MAPS.map(({ id }) => id)
    for (const herb of Object.values(HERBS)) expect(mapIds, herb.id).toContain(herb.mapId)
    for (const mapId of mapIds) {
      const herbs = getMapHerbs(mapId)
      if (herbs.length) expect(herbs, mapId).toHaveLength(4)
    }
    for (const recipe of Object.values(PILL_RECIPES)) {
      expect(MEDICINES[recipe.targetMedicineId], recipe.id).toBeDefined()
      for (const { herbId } of recipe.requiredHerbs) expect(HERBS[herbId], recipe.id).toBeDefined()
    }
  })

  it('采药扣真气，并把当地药材存入库存', () => {
    const store = newStore('NEW')
    const mapId = Object.values(HERBS)[0].mapId
    store.player.qiExp = FORAGE_QI_COST
    vi.spyOn(Math, 'random').mockReturnValue(0)
    store.forageHerbs(mapId)

    expect(store.player.qiExp).toBe(0)
    expect(Object.keys(store.herbInventory).length).toBeGreaterThan(0)
    for (const id of Object.keys(store.herbInventory)) expect(HERBS[id].mapId).toBe(mapId)
    expect(store.ftue.forageCount).toBe(1)
  })

  it.each([false, true])('炼制结果进入库存或累计保底（成功 %s）', (success) => {
    const store = newStore('DEMO')
    const recipe = PILL_RECIPES.recipe_tongmai_dan
    store.player.qiExp = recipe.costQi
    store.player.silver = recipe.costSilver
    store.player.stats.intStat = recipe.minInsight
    store.alchemyPity[recipe.id] = 6
    const before = store.pillInventory[recipe.targetMedicineId]
    const residue = store.furnaceResidue
    for (const { herbId, count } of recipe.requiredHerbs) store.herbInventory[herbId] = count
    vi.spyOn(Math, 'random').mockReturnValue(success ? 0 : 0.999)

    store.refinePill(recipe.id)

    expect(store.player.qiExp).toBe(0)
    expect(store.player.silver).toBe(0)
    for (const { herbId } of recipe.requiredHerbs) expect(store.herbInventory[herbId]).toBe(0)
    expect(store.pillInventory[recipe.targetMedicineId]).toBe(before + (success ? 2 : 0))
    expect(store.alchemyPity[recipe.id]).toBe(success ? 0 : 12)
    expect(store.furnaceResidue).toBe(residue + Number(!success))
  })
})
