import fs from 'fs'

// =========================================================================
// 1. Update shared/gameData.ts
// =========================================================================
let gdContent = fs.readFileSync('./shared/gameData.ts', 'utf8')
gdContent = gdContent.replace(/\r\n/g, '\n')

// 1.1 Add items in ITEMS
const itemsMarker = '  ruanwei_armor: {'
const itemsToAdd = `  tongmai_dan: {
    id: 'tongmai_dan',
    name: '玄门·聚气通脉丹',
    slot: 'ACC',
    tier: 'blue',
    desc: '全真教道家秘制通脉灵丹。温经活络，冲穴时免去全部真气消耗，瞬间冲开任意常规穴位。',
  },
  pozhang_dan: {
    id: 'pozhang_dan',
    name: '纯阳·通脉破障丹',
    slot: 'ACC',
    tier: 'purple',
    desc: '大境界生死玄关突破专属圣药，突破成功率直接提升 +35%，大幅降低玄关阻滞。',
  },
  bingpo_huxin_dan: {
    id: 'bingpo_huxin_dan',
    name: '天山·冰魄护心丹',
    slot: 'ACC',
    tier: 'purple',
    desc: '冲穴护脉神药。冲关失败时 100% 免疫走火入魔状态，返还全部消耗真气，下次突破追加 +25% 保底。',
  },
  shaolin_xiaohuan_dan: {
    id: 'shaolin_xiaohuan_dan',
    name: '少林·大乘小还丹',
    slot: 'ACC',
    tier: 'orange',
    desc: '少林药局至宝。服用后百穴齐鸣，瞬间连续贯通当前经脉 3 个穴位，永久根骨 +6、内力上限 +300。',
  },
  jiuzhuan_tongqiao_dan: {
    id: 'jiuzhuan_tongqiao_dan',
    name: '神品·九转通窍仙丹',
    slot: 'ACC',
    tier: 'red',
    desc: '天下第一冲穴至尊神丹。一丸入腹，整条经脉所有剩余未通穴道瞬间全部贯通！全属性永久 +12。',
  },
`

if (!gdContent.includes('tongmai_dan: {')) {
  gdContent = gdContent.replace(itemsMarker, itemsToAdd + itemsMarker)
}

// 1.2 Update MedicineConfig and MEDICINES
const oldMedDef = `export interface MedicineConfig {
  id: string
  name: string
  tier: TierColor
  category: 'BODY_MOD' | 'BATTLE_PILL' | 'WEAPON_VENOM'
  effectDesc: string
  narrative: string
  source: string
}

export const MEDICINES: Record<string, MedicineConfig> = {`

const newMedDef = `export interface MedicineConfig {
  id: string
  name: string
  tier: TierColor
  category: 'BODY_MOD' | 'BATTLE_PILL' | 'WEAPON_VENOM' | 'ACUPOINT_PILL'
  effectDesc: string
  narrative: string
  source: string
  acupointEffect?: {
    type: 'FREE_PIERCE' | 'BREAKTHROUGH_RATE' | 'PREVENT_DEVIATION' | 'MULTI_PIERCE' | 'ALL_MERIDIAN'
    bonusValue?: number
  }
}

/** 冲穴专属灵丹配置（专门用于经脉温养、冲穴破障与大境界突破） */
export const ACUPOINT_PILLS: Record<string, MedicineConfig> = {
  tongmai_dan: {
    id: 'tongmai_dan',
    name: '玄门·聚气通脉丹',
    tier: 'blue',
    category: 'ACUPOINT_PILL',
    effectDesc: '温经活络。冲穴时直接抵扣全部真气消耗，瞬间打通当前经脉任意常规穴位',
    narrative: '一口吞下聚气通脉丹，一股温润草木内息沿少阳经脉飞速流转，郁结之气豁然开朗，穴道顺畅贯通！',
    source: '门派丹房兑换 / 巡历小极品掉落 / 嘉兴客栈掌柜',
    acupointEffect: { type: 'FREE_PIERCE' },
  },
  pozhang_dan: {
    id: 'pozhang_dan',
    name: '纯阳·通脉破障丹',
    tier: 'purple',
    category: 'ACUPOINT_PILL',
    effectDesc: '大境界生死玄关突破专属圣药，突破成功率直接提升 +35%，真气消耗降低 20%',
    narrative: '破障丹入腹，如纯阳烈火涤荡经络，生死玄关壁障应声而碎，天地之气汇聚丹田！',
    source: '章节守关首领掉落 / 全真纯阳宫大考 / 鬼市秘宝鉴赏',
    acupointEffect: { type: 'BREAKTHROUGH_RATE', bonusValue: 35 },
  },
  bingpo_huxin_dan: {
    id: 'bingpo_huxin_dan',
    name: '天山·冰魄护心丹',
    tier: 'purple',
    category: 'ACUPOINT_PILL',
    effectDesc: '冲穴护脉神药。冲关失败时 100% 免疫走火入魔状态，返还全部消耗真气，下次突破保底成功率额外追加 +25%',
    narrative: '冰魄护心丹化作一线冰寒清流死死锁住心脉，任凭体内真气狂暴冲撞，神识灵台始终稳如泰山！',
    source: '塞外大漠雪山奇遇 / 桃花岛药房秘制 / 华山首通宝箱',
    acupointEffect: { type: 'PREVENT_DEVIATION', bonusValue: 25 },
  },
  shaolin_xiaohuan_dan: {
    id: 'shaolin_xiaohuan_dan',
    name: '少林·大乘小还丹',
    tier: 'orange',
    category: 'ACUPOINT_PILL',
    effectDesc: '少林药局至宝。服用后百穴齐鸣，瞬间连续贯通当前经脉 3 个穴位，并永久提升根骨 +6、内力上限 +300',
    narrative: '小还丹入口即化，馥郁沉香透骨而出，数十股雄浑佛门内劲分走诸穴，阻滞穴道如摧枯拉朽般被连破三道！',
    source: '少林药局藏经阁秘传 / 论剑至尊宝匣',
    acupointEffect: { type: 'MULTI_PIERCE', bonusValue: 3 },
  },
  jiuzhuan_tongqiao_dan: {
    id: 'jiuzhuan_tongqiao_dan',
    name: '神品·九转通窍仙丹',
    tier: 'red',
    category: 'ACUPOINT_PILL',
    effectDesc: '天下第一冲穴至尊神丹。一丸入腹，整条经脉所有剩余未通穴道瞬间全部贯通！直接迎来大境界突破契机，全属性永久 +12',
    narrative: '九转仙丹霞光隐现，服之周身三百六十穴无不大放光明，真气化作滔天狂澜横扫奇经八脉，整条经脉瞬间全线通达！',
    source: '第一卷华山绝巅论剑天下第一奇遇 / 万人阵营战首功奉赐',
    acupointEffect: { type: 'ALL_MERIDIAN', bonusValue: 12 },
  },
}

export const MEDICINES: Record<string, MedicineConfig> = {
  ...ACUPOINT_PILLS,`

if (gdContent.includes(oldMedDef)) {
  gdContent = gdContent.replace(oldMedDef, newMedDef)
}

fs.writeFileSync('./shared/gameData.ts', gdContent, 'utf8')
console.log('Successfully updated shared/gameData.ts with Acupoint Pills!')

// =========================================================================
// 2. Update shared/player.ts
// =========================================================================
let plContent = fs.readFileSync('./shared/player.ts', 'utf8')
plContent = plContent.replace(/\r\n/g, '\n')

const oldRet = `  return { player, ownedItemIds, learnedSkills, companionAffinity, presets, pillCount: 2 }`
const newRet = `  const openedAcupointIds = [
    'shangyang', 'hegu', 'quchi', 'jianyu', 'yingxiang', // 手三阳经 (Tier 1)
    'yinbai', 'yongquan', 'sanyinjiao', 'taichong', 'qimen', // 足三阴经 (Tier 2)
  ]
  const pillInventory: Record<string, number> = {
    pozhang_dan: 2,
    tongmai_dan: 3,
    bingpo_huxin_dan: 1,
    shaolin_xiaohuan_dan: 1,
    jiuzhuan_tongqiao_dan: 0,
  }
  return { player, ownedItemIds, learnedSkills, companionAffinity, presets, pillCount: 2, openedAcupointIds, pillInventory }`

if (plContent.includes(oldRet)) {
  plContent = plContent.replace(oldRet, newRet)
  fs.writeFileSync('./shared/player.ts', plContent, 'utf8')
  console.log('Successfully updated shared/player.ts with openedAcupointIds and pillInventory!')
}
