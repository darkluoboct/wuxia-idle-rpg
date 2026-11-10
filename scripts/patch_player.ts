import fs from 'node:fs'
import path from 'node:path'

const filePath = path.resolve('shared/player.ts')
let content = fs.readFileSync(filePath, 'utf8')

content = content.replace(
  "import { ITEMS, MAPS, SKILLS } from './gameData.ts'",
  "import { ITEMS, MAPS, SKILLS, PILL_RECIPES } from './gameData.ts'"
)

const target = `  const pillInventory: Record<string, number> = {
    pozhang_dan: 2,
    tongmai_dan: 3,
    bingpo_huxin_dan: 1,
    shaolin_xiaohuan_dan: 1,
    jiuzhuan_tongqiao_dan: 0,
  }
  return { player, ownedItemIds, learnedSkills, companionAffinity, presets, pillCount: 2, openedAcupointIds, pillInventory }`

const replacement = `  const pillInventory: Record<string, number> = {
    pozhang_dan: 2,
    tongmai_dan: 3,
    bingpo_huxin_dan: 1,
    shaolin_xiaohuan_dan: 1,
    jiuzhuan_tongqiao_dan: 0,
  }
  const herbInventory: Record<string, number> = {
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
  }
  const knownRecipeIds = Object.keys(PILL_RECIPES)
  const furnaceResidue = 3
  const alchemyPity: Record<string, number> = {}

  return {
    player,
    ownedItemIds,
    learnedSkills,
    companionAffinity,
    presets,
    pillCount: 2,
    openedAcupointIds,
    pillInventory,
    herbInventory,
    knownRecipeIds,
    furnaceResidue,
    alchemyPity,
  }`

content = content.replace(target, replacement)
fs.writeFileSync(filePath, content, 'utf8')
console.log('Patched shared/player.ts')
