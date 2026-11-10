import fs from 'fs'

// 1. Update frontend/src/stores/gameStore.ts
let storeContent = fs.readFileSync('./frontend/src/stores/gameStore.ts', 'utf8')
const storeTarget = `    } else {
      slashBanner.value = null
    }

    // 驱动攻击方冲刺与受击方抖动扣血 + 伤害飘字
    const actor = liveUnitStates.value[ev.actorSlot]
    if (actor && ev.type !== 'STANCE_CLASH') {`

const storeReplacement = `    } else if (ev.type === 'BOSS_ENRAGE') {
      slashBanner.value = {
        text: '首领狂暴',
        sub: \`\${actorUnit?.name ?? '首领'} · 气血逆乱 杀气焚天！\`,
        isUlt: true,
        isAlly: false,
        key: frameKey,
      }
    } else {
      slashBanner.value = null
    }

    // 驱动攻击方冲刺与受击方抖动扣血 + 伤害飘字
    const actor = liveUnitStates.value[ev.actorSlot]
    if (actor && ev.type !== 'STANCE_CLASH' && ev.type !== 'BOSS_ENRAGE') {`

// Normalize newlines
storeContent = storeContent.replace(/\r\n/g, '\n')
if (storeContent.includes(storeTarget)) {
  storeContent = storeContent.replace(storeTarget, storeReplacement)
  fs.writeFileSync('./frontend/src/stores/gameStore.ts', storeContent, 'utf8')
  console.log('Successfully patched frontend/src/stores/gameStore.ts')
} else {
  console.warn('Target not found in frontend/src/stores/gameStore.ts')
}
