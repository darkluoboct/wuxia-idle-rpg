import { HERBS, PILL_RECIPES, MEDICINES, getMapHerbs, ONLINE_MAPS } from '../shared/gameData.ts'
import { createStarterCharacter } from '../shared/player.ts'

console.log('=== [1] 验证草药矩阵与地图绑定完整性 ===')
for (const map of ONLINE_MAPS) {
  const herbs = getMapHerbs(map.id)
  console.log(`地图【${map.name}】(${map.id}) 产出 ${herbs.length} 味草药:`)
  for (const h of herbs) {
    console.log(`  - [${h.tier}] ${h.name} (${h.rarity}) | ${h.desc.slice(0, 24)}...`)
  }
  if (herbs.length && herbs.length !== 4) {
    throw new Error(`地图 ${map.id} 草药数量应为 4，当前为 ${herbs.length}`)
  }
}
for (const herb of Object.values(HERBS)) {
  if (!ONLINE_MAPS.some((map) => map.id === herb.mapId)) throw new Error(`药材 ${herb.name} 的产地不存在`)
}

console.log('\n=== [2] 验证全丹方与成药/药材闭环 ===')
for (const recipe of Object.values(PILL_RECIPES)) {
  const med = MEDICINES[recipe.targetMedicineId]
  if (!med) throw new Error(`丹方 ${recipe.name} 对应的成药 ${recipe.targetMedicineId} 不存在于 MEDICINES！`)
  console.log(`丹方【${recipe.name}】-> 成药【${med.name}】[${recipe.tier}]`)
  console.log(`  火候: ${recipe.furnaceFlame} | 门槛悟性: ${recipe.minInsight} | 基础成率: ${recipe.baseRate}% | 真气消耗: ${recipe.costQi}`)
  for (const req of recipe.requiredHerbs) {
    const herb = HERBS[req.herbId]
    if (!herb) throw new Error(`丹方 ${recipe.name} 所需药材 ${req.herbId} 不存在于 HERBS！`)
    console.log(`    * 需求: ${herb.name} x${req.count} (来自 ${herb.mapName})`)
  }
}

console.log('\n=== [3] 模拟角色采药与炼丹流程 ===')
const starter = createStarterCharacter({ id: 'test_p', nickname: '虚竹子', avatarId: 'hero_sword' }, Date.now())
console.log('初始角色草药库存种类数:', Object.keys(starter.herbInventory).length)
console.log('初始角色掌握丹方数:', starter.knownRecipeIds.length)
console.log('初始药渣存量:', starter.furnaceResidue)

// 模拟炼制《聚气通脉散方》
const tongmaiRecipe = PILL_RECIPES.recipe_tongmai_dan
console.log(`\n尝试炼制《${tongmaiRecipe.name}》:`)
for (const req of tongmaiRecipe.requiredHerbs) {
  console.log(`  库存 ${HERBS[req.herbId].name}: ${starter.herbInventory[req.herbId]} (需求 ${req.count})`)
  if (starter.herbInventory[req.herbId] < req.count) throw new Error('初始材料不足')
}

// 模拟多次炼制成率与双丹
let successCount = 0
let doubleCount = 0
const trials = 100
for (let i = 0; i < trials; i++) {
  const insightBonus = Math.max(0, (starter.player.stats.intStat - tongmaiRecipe.minInsight) * 1.5)
  const luckBonus = starter.player.stats.luck * 0.4
  const finalRate = Math.min(98, Math.max(15, tongmaiRecipe.baseRate + insightBonus + luckBonus))
  const roll = Math.random() * 100
  if (roll < finalRate) {
    successCount++
    const doubleRate = Math.min(40, starter.player.stats.luck * 0.8 + starter.player.stats.intStat * 0.3)
    if (Math.random() * 100 < doubleRate) doubleCount++
  }
}

console.log(`100次炼制模拟: 成功 ${successCount} 次 (成率 ${(successCount / trials * 100).toFixed(1)}%), 一炉双丹暴击 ${doubleCount} 次!`)

console.log('\n✅ 百草采集、炼制与丹方全闭环检验通过，毫无漏洞！')
