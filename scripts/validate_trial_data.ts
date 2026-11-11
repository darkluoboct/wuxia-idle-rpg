/**
 * 校验第一卷 30 关历练配置。
 * 运行：node scripts/validate_trial_data.ts
 */
import { ITEMS } from '../shared/gameData.ts'
import {
  TRIAL_ITEMS, TRIAL_PATROL_HOURS, TRIAL_SETS, TRIAL_STAGES,
  trialPartId, trialSetOf,
} from '../shared/trialStages.ts'
import type { EquipSlotType } from '../shared/protocol.ts'

const SLOTS: EquipSlotType[] = ['WEAPON', 'HEAD', 'ARMOR', 'WRIST', 'BELT', 'BOOTS', 'ACC']
const CHAPTER_RANGES: Record<number, [number, number]> = {
  1: [1, 7], 2: [8, 13], 3: [14, 21], 4: [22, 26], 5: [27, 30],
}
const REPLAY_STAGES = new Set([7, 13, 21, 26, 30])

const errors: string[] = []
const fail = (message: string) => errors.push(message)

if (TRIAL_STAGES.length !== 30) fail(`关卡数量应为 30，实际 ${TRIAL_STAGES.length}`)
TRIAL_STAGES.forEach((stage, index) => {
  if (stage.id !== index + 1) fail(`关卡编号不连续：第 ${index + 1} 项是 ${stage.id}`)
  if (stage.recLevel !== stage.id) fail(`第 ${stage.id} 关推荐等级应为 ${stage.id}，实际 ${stage.recLevel}`)
  const range = CHAPTER_RANGES[stage.chapter]
  if (!range) fail(`第 ${stage.id} 关章节 ${stage.chapter} 不存在`)
  else if (stage.id < range[0] || stage.id > range[1]) fail(`第 ${stage.id} 关不属于第 ${stage.chapter} 章`)

  const set = trialSetOf(stage.setId)
  if (!set) {
    fail(`第 ${stage.id} 关引用了不存在的套装 ${stage.setId}`)
    return
  }
  for (const slot of stage.firstClearParts) {
    if (!set.parts.some((part) => part.slot === slot)) fail(`第 ${stage.id} 关首胜部位 ${slot} 不在套装内`)
  }
  if (stage.firstClearParts.length === 0) fail(`第 ${stage.id} 关没有首胜部件`)
  if (REPLAY_STAGES.has(stage.id)) {
    if (!stage.replayPartIds) fail(`第 ${stage.id} 关是章末关，缺少复战池`)
    else {
      for (const id of stage.replayPartIds) {
        if (!TRIAL_ITEMS.some((item) => item.id === id)) fail(`第 ${stage.id} 关复战池 ${id} 不存在`)
      }
    }
  } else if (stage.replayPartIds) {
    fail(`第 ${stage.id} 关不是章末关，却有复战池`)
  }
  if (stage.victory === 'SURVIVE_ROUNDS' && !stage.surviveRounds) fail(`第 ${stage.id} 关是生存战，缺少回合数`)
})

TRIAL_SETS.forEach((set) => {
  if (set.parts.length !== SLOTS.length) fail(`套装 ${set.id} 应有 7 件，实际 ${set.parts.length}`)
  const slots = new Set(set.parts.map((part) => part.slot))
  for (const slot of SLOTS) if (!slots.has(slot)) fail(`套装 ${set.id} 缺少部位 ${slot}`)
  if (slots.size !== set.parts.length) fail(`套装 ${set.id} 有重复部位`)
  if (!set.bonuses.two || !set.bonuses.four || !set.bonuses.six) fail(`套装 ${set.id} 缺少 2/4/6 件羁绊`)
  if (set.parts.some((part) => part.slot === 'WEAPON') && !set.parts.some((part) => part.slot === 'WEAPON' && (part.atkBonus ?? 0) > 0)) {
    fail(`套装 ${set.id} 的兵刃没有攻击力`)
  }
})

if (TRIAL_ITEMS.length !== TRIAL_SETS.length * SLOTS.length) {
  fail(`装备总数应为 ${TRIAL_SETS.length * SLOTS.length}，实际 ${TRIAL_ITEMS.length}`)
}
const itemIds = new Set<string>()
for (const item of TRIAL_ITEMS) {
  if (itemIds.has(item.id)) fail(`装备 id 重复：${item.id}`)
  itemIds.add(item.id)
  if (!ITEMS[item.id]) fail(`装备 ${item.id} 未并入 ITEMS`)
  if (item.id !== trialPartId(item.setId!, item.slot)) fail(`装备 id 命名不符：${item.id}`)
}

let totalHours = 0
for (let id = 1; id <= 30; id++) {
  const hours = TRIAL_PATROL_HOURS[id]
  if (hours === undefined) fail(`第 ${id} 关缺少巡历时长`)
  else totalHours += hours
}
if (Math.abs(totalHours - 703.83) > 0.5) fail(`巡历总时长应约 703.83 小时，实际 ${totalHours.toFixed(2)}`)

const replayStage = TRIAL_STAGES.filter((stage) => stage.replayPartIds)
const unlockStage = TRIAL_STAGES.filter((stage) => stage.unlock)
console.log(`关卡 ${TRIAL_STAGES.length} 关｜套装 ${TRIAL_SETS.length} 套｜装备 ${TRIAL_ITEMS.length} 件`)
console.log(`章末复战 ${replayStage.map((stage) => stage.id).join('、')}｜解锁 ${unlockStage.map((stage) => `${stage.id}:${stage.unlock}`).join('、')}`)
console.log(`巡历合计 ${totalHours.toFixed(2)} 小时（01~15 关 ${(Object.values(TRIAL_PATROL_HOURS).slice(0, 15).reduce((sum, hours) => sum + hours, 0) * 60).toFixed(0)} 分钟）`)

if (errors.length) {
  console.error(`\n发现 ${errors.length} 个问题：`)
  for (const message of errors) console.error(`- ${message}`)
  process.exit(1)
}
console.log('配置校验通过。')
