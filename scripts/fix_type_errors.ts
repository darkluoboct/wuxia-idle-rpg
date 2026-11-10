import fs from 'fs'

// 1. Fix frontend/src/stores/gameStore.ts
let store = fs.readFileSync('./frontend/src/stores/gameStore.ts', 'utf8')
store = store.replace(/\r\n/g, '\n')

// 1.1 Add ACUPOINTS, MEDICINES to imports
if (!store.includes('  ACUPOINTS,\n')) {
  store = store.replace(
    'import {\n  COMPANIONS,',
    'import {\n  ACUPOINTS,\n  MEDICINES,\n  COMPANIONS,'
  )
}

// 1.2 Update selectLocalCharacter save and load
const oldSaveObj = `    if (current !== -1) localCharacters.value[current] = cloneCharacter({
      player: player.value, learnedSkills: learnedSkills.value, ownedItemIds: ownedItemIds.value,
      pillCount: pillCount.value, companionAffinity: companionAffinity.value, presets: presets.value,
      betrayedSectIds: betrayedSectIds.value,
    })`

const newSaveObj = `    if (current !== -1) localCharacters.value[current] = cloneCharacter({
      player: player.value, learnedSkills: learnedSkills.value, ownedItemIds: ownedItemIds.value,
      pillCount: pillCount.value, companionAffinity: companionAffinity.value, presets: presets.value,
      betrayedSectIds: betrayedSectIds.value,
      openedAcupointIds: openedAcupointIds.value,
      pillInventory: pillInventory.value,
    })`

if (store.includes(oldSaveObj)) {
  store = store.replace(oldSaveObj, newSaveObj)
}

const oldLoadObj = `    pillCount.value = save.pillCount
    companionAffinity.value = save.companionAffinity`

const newLoadObj = `    pillCount.value = save.pillCount
    openedAcupointIds.value = save.openedAcupointIds ?? [
      'shangyang', 'hegu', 'quchi', 'jianyu', 'yingxiang',
      'yinbai', 'yongquan', 'sanyinjiao', 'taichong', 'qimen',
    ]
    pillInventory.value = save.pillInventory ?? {
      pozhang_dan: save.pillCount ?? 2,
      tongmai_dan: 3,
      bingpo_huxin_dan: 1,
      shaolin_xiaohuan_dan: 1,
      jiuzhuan_tongqiao_dan: 0,
    }
    companionAffinity.value = save.companionAffinity`

if (store.includes(oldLoadObj)) {
  store = store.replace(oldLoadObj, newLoadObj)
}

fs.writeFileSync('./frontend/src/stores/gameStore.ts', store, 'utf8')
console.log('Fixed gameStore.ts!')

// 2. Fix frontend/src/views/ArsenalView.vue
let view = fs.readFileSync('./frontend/src/views/ArsenalView.vue', 'utf8')
view = view.replace(/\r\n/g, '\n')

view = view.replace(
  `<b class="text-sm font-brush" :class="TIER_META[pill.tier].textCls">{{ pill.name }}</b>`,
  `<b class="text-sm font-brush">{{ pill.name }}</b>`
)

fs.writeFileSync('./frontend/src/views/ArsenalView.vue', view, 'utf8')
console.log('Fixed ArsenalView.vue!')
