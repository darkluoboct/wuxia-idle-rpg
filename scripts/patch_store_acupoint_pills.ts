import fs from 'fs'

let store = fs.readFileSync('./frontend/src/stores/gameStore.ts', 'utf8')
store = store.replace(/\r\n/g, '\n')

// 1. Add ACUPOINTS and MEDICINES import if not present
if (!store.includes('ACUPOINTS')) {
  store = store.replace(
    "import { REALMS, SKILLS } from '@/config/gameData'",
    "import { ACUPOINTS, MEDICINES, REALMS, SKILLS } from '@/config/gameData'"
  )
}

// 2. Add openedAcupointIds & pillInventory state declaration
const stateTarget = `  const ownedItemIds = ref(starter.ownedItemIds)
  const pillCount = ref(starter.pillCount)`

const stateRep = `  const ownedItemIds = ref(starter.ownedItemIds)
  const openedAcupointIds = ref<string[]>((starter as any).openedAcupointIds ?? [
    'shangyang', 'hegu', 'quchi', 'jianyu', 'yingxiang',
    'yinbai', 'yongquan', 'sanyinjiao', 'taichong', 'qimen',
  ])
  const pillInventory = ref<Record<string, number>>((starter as any).pillInventory ?? {
    pozhang_dan: 2,
    tongmai_dan: 3,
    bingpo_huxin_dan: 1,
    shaolin_xiaohuan_dan: 1,
    jiuzhuan_tongqiao_dan: 0,
  })
  const pillCount = computed({
    get: () => pillInventory.value.pozhang_dan ?? 0,
    set: (v: number) => { pillInventory.value.pozhang_dan = v },
  })`

if (store.includes(stateTarget)) {
  store = store.replace(stateTarget, stateRep)
}

// 3. Add pierceAcupoint and useAcupointPill and replace attemptBreakthrough
const oldBreakthrough = `  function attemptBreakthrough(usePill: boolean) {
    const nextRealm = REALMS.find((r) => r.tier === player.value.realmTier + 1)
    if (!nextRealm) {
      showToast('你已达到最高境界「天人合一」。', 'gold')
      return
    }
    let pillBonus = 0
    if (usePill) {
      if (pillCount.value <= 0) {
        showToast('九花玉露丸用完了。', 'danger')
        return
      }
      pillCount.value -= 1
      pillBonus = 25
    }
    const rate = Math.min(
      100,
      Math.round(nextRealm.baseBreakRate + player.value.stats.con * 0.3 + player.value.breakPityRate + pillBonus)
    )
    const roll = Math.random() * 100
    if (roll <= rate) {
      player.value.realmTier = nextRealm.tier
      player.value.level = Math.max(player.value.level, nextRealm.minLevel)
      player.value.nextLevelQi = calcNextLevelQi(player.value.level)
      player.value.breakPityRate = 0
      player.value.stats.con += 4
      player.value.stats.str += 4
      player.value.stats.intStat += 3

      appendLog('CULTIVATE', [
        { type: 'tag', text: '突破成功', tone: 'gold' },
        { type: 'text', text: \` 真气贯通「\${nextRealm.meridian}」，你踏入了「\${nextRealm.name}」境界。\` },
      ])
      showToast(\`突破成功，已踏入「\${nextRealm.name}」！\`, 'gold')
    } else {
      player.value.breakPityRate += 15
      appendLog('CULTIVATE', [
        { type: 'tag', text: '突破失败', tone: 'red' },
        { type: 'text', text: ' 这次差了一点火候，下次突破成功率 +15%。' },
      ])
      showToast('这次没能突破，下次成功率 +15%。', 'danger')
    }
  }`

const newBreakthroughAndAcupoints = `  // 贯通经脉穴位（支持真气冲穴与使用聚气通脉丹冲穴）
  function pierceAcupoint(acupointId: string, pillId?: string) {
    if (openedAcupointIds.value.includes(acupointId)) {
      showToast('此穴道早已贯通。', 'info')
      return
    }
    const pt = ACUPOINTS.find((a) => a.id === acupointId)
    if (!pt) return

    if (pt.realmTier > player.value.realmTier) {
      showToast(\`需先踏入第 \${pt.realmTier} 境界方可冲击此穴。\` , 'danger')
      return
    }

    const sameMeridian = ACUPOINTS.filter((a) => a.meridianId === pt.meridianId).sort((a, b) => a.order - b.order)
    const prevPoints = sameMeridian.filter((a) => a.order < pt.order)
    const unpiercedPrev = prevPoints.find((a) => !openedAcupointIds.value.includes(a.id))
    if (unpiercedPrev) {
      showToast(\`须按经络循行，先冲通前置【\${unpiercedPrev.name}】！\`, 'danger')
      return
    }

    let usedPillName = ''
    if (pillId === 'tongmai_dan') {
      if ((pillInventory.value.tongmai_dan ?? 0) <= 0) {
        showToast('聚气通脉丹已用完。', 'danger')
        return
      }
      pillInventory.value.tongmai_dan -= 1
      usedPillName = '【玄门·聚气通脉丹】'
    } else {
      const intDiscount = player.value.stats.intStat / (player.value.stats.intStat + 250)
      const cost = Math.max(100, Math.round(pt.costQi * (1 - intDiscount * 0.28)))
      if (player.value.qiExp < cost) {
        showToast(\`冲通「\${pt.name}」尚需 \${cost.toLocaleString()} 真气（可用聚气通脉丹免真气冲穴）。\`, 'danger')
        return
      }
      player.value.qiExp -= cost
    }

    openedAcupointIds.value.push(acupointId)

    if (pt.statBonus.key === 'str') player.value.stats.str += pt.statBonus.value
    else if (pt.statBonus.key === 'con') player.value.stats.con += pt.statBonus.value
    else if (pt.statBonus.key === 'agi') player.value.stats.agi += pt.statBonus.value
    else if (pt.statBonus.key === 'intStat') player.value.stats.intStat += pt.statBonus.value

    appendLog('CULTIVATE', [
      { type: 'tag', text: '冲穴贯通', tone: 'jade' },
      { type: 'text', text: \` \${usedPillName ? '服下 ' + usedPillName + ' ' : ''}运转内息，成功冲通「\${pt.name}」！\${pt.narrative}，\${pt.statBonus.label} +\${pt.statBonus.value}。\` },
    ])
    showToast(\`冲穴成功！「\${pt.name}」贯通，\${pt.statBonus.label} +\${pt.statBonus.value}\`, 'gold')
  }

  // 使用冲穴专属灵丹
  function useAcupointPill(pillId: string) {
    const count = pillInventory.value[pillId] ?? 0
    if (count <= 0) {
      showToast('该冲穴灵丹已用尽。', 'danger')
      return
    }
    const med = MEDICINES[pillId]
    if (!med) return

    if (pillId === 'tongmai_dan') {
      const candidate = ACUPOINTS.find((a) => a.realmTier <= player.value.realmTier && !openedAcupointIds.value.includes(a.id))
      if (candidate) {
        pierceAcupoint(candidate.id, 'tongmai_dan')
      } else {
        showToast('当前境界经脉穴位已全线畅通，无需再用通脉丹。', 'info')
      }
    } else if (pillId === 'shaolin_xiaohuan_dan') {
      pillInventory.value.shaolin_xiaohuan_dan -= 1
      player.value.stats.con += 6
      const unpierced = ACUPOINTS.filter((a) => a.realmTier <= player.value.realmTier && !openedAcupointIds.value.includes(a.id)).slice(0, 3)
      for (const pt of unpierced) {
        openedAcupointIds.value.push(pt.id)
        if (pt.statBonus.key === 'str') player.value.stats.str += pt.statBonus.value
        else if (pt.statBonus.key === 'con') player.value.stats.con += pt.statBonus.value
        else if (pt.statBonus.key === 'agi') player.value.stats.agi += pt.statBonus.value
        else if (pt.statBonus.key === 'intStat') player.value.stats.intStat += pt.statBonus.value
      }
      appendLog('CULTIVATE', [
        { type: 'tag', text: '佛门圣药', tone: 'gold' },
        { type: 'text', text: \` 服下【少林·大乘小还丹】！百穴齐鸣，连续贯通 \${unpierced.map((p) => '「' + p.name + '」').join('、') || '全部穴位'}，根骨永久 +6！\` },
      ])
      showToast(\`服用小还丹成功！贯通 \${unpierced.length} 个穴道，根骨 +6！\`, 'gold')
    } else if (pillId === 'jiuzhuan_tongqiao_dan') {
      pillInventory.value.jiuzhuan_tongqiao_dan -= 1
      player.value.stats.str += 12
      player.value.stats.con += 12
      player.value.stats.agi += 12
      player.value.stats.intStat += 12
      const unpierced = ACUPOINTS.filter((a) => a.realmTier <= player.value.realmTier && !openedAcupointIds.value.includes(a.id))
      for (const pt of unpierced) {
        openedAcupointIds.value.push(pt.id)
      }
      appendLog('CULTIVATE', [
        { type: 'tag', text: '九转通仙', tone: 'gold' },
        { type: 'text', text: ' 吞服【神品·九转通窍仙丹】！天地霞光流转奇经八脉，整条经脉全部豁然贯通，全属性永久 +12！' },
      ])
      showToast('神品仙丹药力爆发！整脉穴道全部贯通，全属性 +12！', 'gold')
    } else if (pillId === 'pozhang_dan') {
      showToast('【纯阳·通脉破障丹】将在冲击大境界突破时自动生效（成功率 +35%）。', 'info')
    } else if (pillId === 'bingpo_huxin_dan') {
      showToast('【天山·冰魄护心丹】已在心脉备妥，若突破受阻将自动触发辟除心魔与真气返还。', 'info')
    }
  }

  function attemptBreakthrough(usePill: boolean) {
    const nextRealm = REALMS.find((r) => r.tier === player.value.realmTier + 1)
    if (!nextRealm) {
      showToast('你已达到最高境界「天人合一」。', 'gold')
      return
    }

    // 突破前硬检验：必须已贯通当前经脉所有穴道
    const currentRealmPoints = ACUPOINTS.filter((ap) => ap.realmTier === player.value.realmTier)
    const unpierced = currentRealmPoints.filter((ap) => !openedAcupointIds.value.includes(ap.id))
    if (unpierced.length > 0) {
      showToast(\`当前经脉尚有【\${unpierced[0].name}】等 \${unpierced.length} 个穴位未通，须先贯通诸穴方可冲关！\`, 'danger')
      return
    }

    let pillBonus = 0
    let usedPozhang = false
    if (usePill) {
      if ((pillInventory.value.pozhang_dan ?? 0) <= 0) {
        showToast('纯阳通脉破障丹用完了，可通过历练首领、鬼市鉴宝或门派兑换获取。', 'danger')
        return
      }
      pillInventory.value.pozhang_dan -= 1
      pillBonus = 35 // 纯阳破障丹提供 +35% 成功率
      usedPozhang = true
    }

    const rate = Math.min(
      100,
      Math.round(nextRealm.baseBreakRate + player.value.stats.con * 0.3 + player.value.breakPityRate + pillBonus)
    )
    const roll = Math.random() * 100
    if (roll <= rate) {
      player.value.realmTier = nextRealm.tier
      player.value.level = Math.max(player.value.level, nextRealm.minLevel)
      player.value.nextLevelQi = calcNextLevelQi(player.value.level)
      player.value.breakPityRate = 0
      player.value.stats.con += 4
      player.value.stats.str += 4
      player.value.stats.intStat += 3

      appendLog('CULTIVATE', [
        { type: 'tag', text: '突破成功', tone: 'gold' },
        { type: 'text', text: \` \${usedPozhang ? '服下【纯阳·通脉破障丹】浩荡纯阳内息冲开玄关，' : ''}真气贯通「\${nextRealm.meridian}」，踏入「\${nextRealm.name}」大境界！\` },
      ])
      showToast(\`突破成功，已踏入「\${nextRealm.name}」！\`, 'gold')
    } else {
      const hasHuxin = (pillInventory.value.bingpo_huxin_dan ?? 0) > 0
      if (hasHuxin) {
        pillInventory.value.bingpo_huxin_dan -= 1
        player.value.breakPityRate += 25
        appendLog('CULTIVATE', [
          { type: 'tag', text: '护心辟魔', tone: 'jade' },
          { type: 'text', text: ' 虽冲击未果，但含服的【天山·冰魄护心丹】化解了狂暴逆流，神识完好无损，下次突破保底成功率额外 +25%！' },
        ])
        showToast('突破受阻，但【冰魄护心丹】护住心脉，下次成功率 +25%！', 'info')
      } else {
        player.value.breakPityRate += 15
        appendLog('CULTIVATE', [
          { type: 'tag', text: '突破失败', tone: 'red' },
          { type: 'text', text: ' 这次差了一点火候，真气微乱，下次突破成功率 +15%。' },
        ])
        showToast('这次没能突破，下次成功率 +15%。', 'danger')
      }
    }
  }`

if (store.includes(oldBreakthrough)) {
  store = store.replace(oldBreakthrough, newBreakthroughAndAcupoints)
}

// 4. Update return export list in gameStore.ts
const oldReturn = `    pillCount,
    companionAffinity,`

const newReturn = `    pillCount,
    openedAcupointIds,
    pillInventory,
    pierceAcupoint,
    useAcupointPill,
    companionAffinity,`

if (store.includes(oldReturn)) {
  store = store.replace(oldReturn, newReturn)
}

fs.writeFileSync('./frontend/src/stores/gameStore.ts', store, 'utf8')
console.log('Successfully updated frontend/src/stores/gameStore.ts with Acupoint Pill mechanics!')
