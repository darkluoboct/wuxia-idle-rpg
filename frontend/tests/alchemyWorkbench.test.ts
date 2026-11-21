// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { expect, it } from 'vitest'
import AlchemyWorkbench from '@/components/AlchemyWorkbench.vue'
import { useGameStore } from '@/stores/gameStore'
import { PILL_RECIPES } from '@/config/gameData'

it('对决灵丹的丹方名录和丹炉都显示战斗药囊库存', async () => {
  const pinia = createPinia()
  const store = useGameStore(pinia)
  store.player.battleMedicines = { ...store.player.battleMedicines, chunyang_jindan: 7 }
  store.pillInventory.chunyang_jindan = 1
  const view = mount(AlchemyWorkbench, { global: { plugins: [pinia] } })
  try {
    const filter = view.findAll('button').find((button) => button.text() === '对决灵丹')!
    await filter.trigger('click')
    const recipe = view.findAll('.workbench-entry').find((button) => button.text().includes(PILL_RECIPES.recipe_chunyang_jindan.name))!
    await recipe.trigger('click')
    expect(view.get('.workbench-entry[aria-pressed="true"]').text()).toContain('库存 7')
    expect(view.get('[aria-label="丹炉"]').text()).toMatch(/背包已有：\s*7\s*丸/)
  } finally {
    view.unmount()
    disposePinia(pinia)
  }
})
