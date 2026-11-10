import fs from 'node:fs'
import path from 'node:path'

const filePath = path.resolve('frontend/src/stores/gameStore.ts')
let content = fs.readFileSync(filePath, 'utf8')

// 1. Update imports from @/config/gameData
content = content.replace(
  `import {
  ACUPOINTS,
  MEDICINES,`,
  `import {
  ACUPOINTS,
  MEDICINES,
  HERBS,
  type HerbConfig,
  PILL_RECIPES,
  type PillRecipeConfig,
  getMapHerbs,`
)

// 2. Add alchemy refs after pillCount computed
const pillInventoryTarget = `  const pillCount = computed({
    get: () => pillInventory.value.pozhang_dan ?? 0,
    set: (v: number) => { pillInventory.value.pozhang_dan = v },
  })`

const alchemyRefs = `  const pillCount = computed({
    get: () => pillInventory.value.pozhang_dan ?? 0,
    set: (v: number) => { pillInventory.value.pozhang_dan = v },
  })
  const herbInventory = ref<Record<string, number>>((starter as any).herbInventory ?? {
    sanqi: 6,
    cheqian_cao: 5,
    honghua: 4,
    heding_lu: 2,
    jinyinhua: 4,
    fuling: 3,
    heshouwu: 2,
    chunyang_zhi: 1,
    mahuang: 3,
    hongjingtian: 2,
    xuelian_hua: 1,
    qushe_dan: 1,
    shexian_cao: 3,
    wugong_qiao: 2,
    duanchang_cao: 1,
    linghu_cao: 0,
  })
  const knownRecipeIds = ref<string[]>((starter as any).knownRecipeIds ?? Object.keys(PILL_RECIPES))
  const furnaceResidue = ref<number>((starter as any).furnaceResidue ?? 3)
  const alchemyPity = ref<Record<string, number>>((starter as any).alchemyPity ?? {})`

content = content.replace(pillInventoryTarget, alchemyRefs)

// 3. Update selectLocalCharacter save and load
const saveTarget = `      betrayedSectIds: betrayedSectIds.value,
      openedAcupointIds: openedAcupointIds.value,
      pillInventory: pillInventory.value,
    })`

const saveReplacement = `      betrayedSectIds: betrayedSectIds.value,
      openedAcupointIds: openedAcupointIds.value,
      pillInventory: pillInventory.value,
      herbInventory: herbInventory.value,
      knownRecipeIds: knownRecipeIds.value,
      furnaceResidue: furnaceResidue.value,
      alchemyPity: alchemyPity.value,
    })`

content = content.replace(saveTarget, saveReplacement)

const restoreTarget = `      jiuzhuan_tongqiao_dan: 0,
    }
    companionAffinity.value = save.companionAffinity`

const restoreReplacement = `      jiuzhuan_tongqiao_dan: 0,
    }
    herbInventory.value = (save as any).herbInventory ?? {
      sanqi: 6, cheqian_cao: 5, honghua: 4, heding_lu: 2, jinyinhua: 4, fuling: 3,
      heshouwu: 2, chunyang_zhi: 1, mahuang: 3, hongjingtian: 2, xuelian_hua: 1,
      qushe_dan: 1, shexian_cao: 3, wugong_qiao: 2, duanchang_cao: 1, linghu_cao: 0,
    }
    knownRecipeIds.value = (save as any).knownRecipeIds ?? Object.keys(PILL_RECIPES)
    furnaceResidue.value = (save as any).furnaceResidue ?? 3
    alchemyPity.value = (save as any).alchemyPity ?? {}
    companionAffinity.value = save.companionAffinity`

content = content.replace(restoreTarget, restoreReplacement)

// 4. Update idle gain settlement to drop map herbs
const settleTarget = `    const { gainedQi, gainedSilver } = getIdleRewards()
    player.value.qiExp += gainedQi
    player.value.silver += gainedSilver
    player.value.lastSettleAt = Date.now()
    showIdleGain({ gainedQi, gainedSilver })`

const settleReplacement = `    const { gainedQi, gainedSilver } = getIdleRewards()
    player.value.qiExp += gainedQi
    player.value.silver += gainedSilver
    player.value.lastSettleAt = Date.now()

    // 巡历挂机顺路采获当前地图药材
    const mapHerbs = getMapHerbs(player.value.currentMapId)
    const gainedHerbList: string[] = []
    if (mapHerbs.length > 0) {
      const dropCount = Math.floor(Math.random() * 2) + 1
      for (let i = 0; i < dropCount; i++) {
        const h = mapHerbs[Math.floor(Math.random() * mapHerbs.length)]
        herbInventory.value[h.id] = (herbInventory.value[h.id] ?? 0) + 1
        gainedHerbList.push(h.name)
      }
    }
    showIdleGain({ gainedQi, gainedSilver }, gainedHerbList)`

content = content.replace(settleTarget, settleReplacement)

const showGainTarget = `  function showIdleGain({ gainedQi, gainedSilver }: IdleGain) {
    appendLog('CULTIVATE', [
      { type: 'tag', text: '修行收益', tone: 'jade' },
      { type: 'text', text: \` 领到 \${gainedQi.toLocaleString()} 真气和 \${gainedSilver.toLocaleString()} 两纹银。\` },
    ])
    showToast(\`已领 \${gainedQi.toLocaleString()} 真气和 \${gainedSilver.toLocaleString()} 两纹银\`, 'gold')
  }`

const showGainReplacement = `  function showIdleGain({ gainedQi, gainedSilver }: IdleGain, herbs: string[] = []) {
    const herbNote = herbs.length ? \`，巡历采获【\${herbs.join('、')}】\` : ''
    appendLog('CULTIVATE', [
      { type: 'tag', text: '修行收益', tone: 'jade' },
      { type: 'text', text: \` 领到 \${gainedQi.toLocaleString()} 真气和 \${gainedSilver.toLocaleString()} 两纹银\${herbNote}。\` },
    ])
    showToast(\`已领 \${gainedQi.toLocaleString()} 真气、\${gainedSilver.toLocaleString()} 纹银\${herbs.length ? '及草药' : ''}\`, 'gold')
  }`

content = content.replace(showGainTarget, showGainReplacement)

// 5. Add forageHerbs, refinePill, exchangeFurnaceResidue functions
const functionsCode = `
  // 采药寻草（消耗 200 真气在指定或当前地图搜寻草药）
  function forageHerbs(targetMapId?: string) {
    const mapId = targetMapId || player.value.currentMapId
    const map = MAPS.find((m) => m.id === mapId) ?? MAPS[0]
    const mapHerbs = getMapHerbs(mapId)
    if (!mapHerbs.length) {
      showToast('此地未探明灵草植被。', 'info')
      return
    }
    const costQi = 200
    if (player.value.qiExp < costQi) {
      showToast(\`采药搜山需耗损 \${costQi} 点真气调息探路。\`, 'danger')
      return
    }
    player.value.qiExp -= costQi

    const gathered: { name: string; count: number; tier: TierColor }[] = []
    const shichen = shichenIdx.value
    const rollAttempts = 2 + (Math.random() < (player.value.stats.luck / 100) ? 1 : 0)

    for (let i = 0; i < rollAttempts; i++) {
      const rand = Math.random() * 100
      let eligible = mapHerbs.filter(h => {
        if (rand < 45) return h.rarity === 'COMMON'
        if (rand < 80) return h.rarity === 'UNCOMMON'
        if (rand < 95) return h.rarity === 'RARE'
        if (rand < 99) return h.rarity === 'EPIC'
        return true
      })
      if (!eligible.length) eligible = mapHerbs

      // 时辰加成
      const bonusHerb = eligible.find(h => h.shichenBonus?.shichens.includes(shichen))
      const chosen = (bonusHerb && Math.random() < 0.5) ? bonusHerb : eligible[Math.floor(Math.random() * eligible.length)]
      const qty = chosen.rarity === 'COMMON' ? (Math.random() < 0.5 ? 2 : 1) : 1
      herbInventory.value[chosen.id] = (herbInventory.value[chosen.id] ?? 0) + qty

      const existing = gathered.find(g => g.name === chosen.name)
      if (existing) existing.count += qty
      else gathered.push({ name: chosen.name, count: qty, tier: chosen.tier })
    }

    const descStr = gathered.map(g => \`\${g.name} x\${g.count}\`).join('、')
    appendLog('CULTIVATE', [
      { type: 'tag', text: '采药寻珍', tone: 'jade' },
      { type: 'text', text: \` 在【\${map.name}】跋山涉水巡探，采获：\${descStr}！\` },
    ])
    showToast(\`采获：\${descStr}\`, 'gold')
  }

  // 丹房炼制
  function refinePill(recipeId: string) {
    const recipe = PILL_RECIPES[recipeId]
    if (!recipe) return

    // 悟性要求
    if (player.value.stats.intStat < recipe.minInsight) {
      showToast(\`此古方极其玄奥，需悟性达到 \${recipe.minInsight} 方能掌控火候（当前悟性 \${player.value.stats.intStat}）。\`, 'danger')
      return
    }
    // 消耗检验
    if (player.value.qiExp < recipe.costQi) {
      showToast(\`炼制需消耗 \${recipe.costQi.toLocaleString()} 真气以控炉火。\`, 'danger')
      return
    }
    if (player.value.silver < recipe.costSilver) {
      showToast(\`炭火鼎炉工本需 \${recipe.costSilver} 两纹银。\`, 'danger')
      return
    }
    // 药材检验
    for (const req of recipe.requiredHerbs) {
      const owned = herbInventory.value[req.herbId] ?? 0
      if (owned < req.count) {
        const herbName = HERBS[req.herbId]?.name ?? req.herbId
        showToast(\`药材不足：缺少「\${herbName}」x\${req.count - owned}（现有 \${owned}/\${req.count}）。\`, 'danger')
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
    const insightBonus = Math.max(0, (player.value.stats.intStat - recipe.minInsight) * 1.5)
    const luckBonus = player.value.stats.luck * 0.4
    const finalRate = Math.min(98, Math.max(15, Math.round(recipe.baseRate + insightBonus + luckBonus + pity)))

    const roll = Math.random() * 100
    const isSuccess = roll < finalRate
    const targetMed = MEDICINES[recipe.targetMedicineId]
    const medName = targetMed?.name ?? recipe.name

    if (isSuccess) {
      alchemyPity.value[recipeId] = 0 // 清空保底
      // 检验一炉双丹暴击 (基于福缘与悟性)
      const doubleRate = Math.min(40, Math.round(player.value.stats.luck * 0.8 + player.value.stats.intStat * 0.3))
      const isDouble = Math.random() * 100 < doubleRate
      const yieldCount = isDouble ? 2 : 1

      pillInventory.value[recipe.targetMedicineId] = (pillInventory.value[recipe.targetMedicineId] ?? 0) + yieldCount

      const critText = isDouble ? '【一炉双丹】天工开物，紫火纯青，竟然一炉炼成两丸！' : '鼎盖升腾五色氤氲，丹成九品！'
      appendLog('CULTIVATE', [
        { type: 'tag', text: '开炉丹成', tone: 'gold' },
        { type: 'text', text: \` 依照《\${recipe.name}》起炉炼药，\${critText} 炼得「\${medName}」x\${yieldCount}！\` },
      ])
      showToast(\`炼丹大成！获得「\${medName}」x\${yieldCount}\${isDouble ? '（一炉双丹！）' : ''}\`, 'gold')
    } else {
      // 失败补偿
      alchemyPity.value[recipeId] = pity + 6
      furnaceResidue.value += 1
      appendLog('CULTIVATE', [
        { type: 'tag', text: '开炉微焦', tone: 'ink3' },
        { type: 'text', text: \` 炼制《\${recipe.name}》时火候稍疾，丹药焦化成药渣 1 团（已收纳）。悟性生慧，该丹方炼成率累积提升 +6%（当前保底 +\${alchemyPity.value[recipeId]}%）！\` },
      ])
      showToast('火候稍疾炼成药渣，悟性大涨，该丹方成功率+6%', 'info')
    }
  }

  // 药渣回炉萃取（每 5 团药渣可提炼随机药草与真气）
  function exchangeFurnaceResidue() {
    if (furnaceResidue.value < 5) {
      showToast('需积攒至少 5 团炼丹药渣方可回炉萃取灵草精微。', 'danger')
      return
    }
    furnaceResidue.value -= 5
    const allHerbIds = Object.keys(HERBS)
    const chosenId = allHerbIds[Math.floor(Math.random() * allHerbIds.length)]
    const chosen = HERBS[chosenId]
    const qty = 2
    herbInventory.value[chosenId] = (herbInventory.value[chosenId] ?? 0) + qty
    player.value.qiExp += 800

    appendLog('CULTIVATE', [
      { type: 'tag', text: '药渣萃精', tone: 'jade' },
      { type: 'text', text: \` 回炉萃取 5 团药渣残存灵性，提炼出「\${chosen.name}」x\${qty}，并汲取残余纯阳真气 800 点！\` },
    ])
    showToast(\`药渣萃取成功：获得「\${chosen.name}」x\${qty}，真气 +800\`, 'gold')
  }
`

// Place functions before export/return
const returnTarget = `    openedAcupointIds,
    pillInventory,
    pierceAcupoint,
    useAcupointPill,`

const returnReplacement = `    openedAcupointIds,
    pillInventory,
    pierceAcupoint,
    useAcupointPill,
    herbInventory,
    knownRecipeIds,
    furnaceResidue,
    alchemyPity,
    forageHerbs,
    refinePill,
    exchangeFurnaceResidue,`

content = content.replace(returnTarget, returnReplacement)

// Insert functions above return
const returnBlockIdx = content.lastIndexOf('  return {')
if (returnBlockIdx !== -1) {
  content = content.slice(0, returnBlockIdx) + functionsCode + '\n' + content.slice(returnBlockIdx)
}

fs.writeFileSync(filePath, content, 'utf8')
console.log('Successfully patched frontend/src/stores/gameStore.ts')
