import { ADVENTURES, COMPANIONS, MAPS, STORY_CHAPTERS } from './gameData'
import { GAIBANG_FINAL_DISHES } from '../../../shared/gaibang.ts'
import { REUNION_CLUE_SOURCES, REUNION_CLUE_TARGET, REUNION_QUESTS } from '../../../shared/reunion.ts'
import { DISHES, FEAST_TARGET_FLAG } from '../../../shared/feast.ts'

export { GAIBANG_FINAL_DISHES }
export * from '../../../shared/reunion.ts'
export * from '../../../shared/feast.ts'

/**
 * 「肝时间」的免费路线（伙伴专题 §十六）：
 *   · 故人寻访：错过的剧情送伙伴，按日积攒线索（约 30 天）→ 三步重逢剧情 → 入队
 *   · 北丐·十道绝味：每日烹一道，食材需在对应地图挂机采办 → 十道呈齐，洪七公同行
 * 所有“每日”均以子时（23:00）为界刷新；付费的故人重逢令可在任意阶段直接跳过寻访。
 */

export function validateQuestData(): string[] {
  const errs: string[] = []
  const nodeIds = STORY_CHAPTERS.map((n) => n.id)
  for (const [id, r] of Object.entries(REUNION_QUESTS)) {
    const c = COMPANIONS[id]
    if (!c || c.route !== 'STORY') errs.push(`寻访 ${id}: 必须是剧情送伙伴`)
    if (r.companionId !== id) errs.push(`寻访 ${id}: companionId 不一致`)
    if (!ADVENTURES.some((a) => a.id === r.afterAdventure)) errs.push(`寻访 ${id}: 未知支线 ${r.afterAdventure}`)
    if (!MAPS.some((m) => m.id === r.mapId)) errs.push(`寻访 ${id}: 未知地图 ${r.mapId}`)
    r.replayNodeIds.forEach((n) => nodeIds.includes(n) || errs.push(`寻访 ${id}: 未知节点 ${n}`))
  }
  const daily = Object.values(REUNION_CLUE_SOURCES).reduce((s, x) => s + x.dailyCap, 0)
  if (Math.ceil(REUNION_CLUE_TARGET / daily) < 25) errs.push(`寻访：线索节奏过快（约 ${Math.ceil(REUNION_CLUE_TARGET / daily)} 天）`)
  if (DISHES.length !== 10) errs.push('十道绝味：必须正好十道')
  if (GAIBANG_FINAL_DISHES.length !== 3) errs.push('百味戏老毒物：必须有三道考核菜品')
  if (new Set(DISHES.map((x) => x.id)).size !== DISHES.length) errs.push('十道绝味：菜品 id 重复')
  DISHES.forEach((x) => MAPS.some((m) => m.id === x.mapId) || errs.push(`十道绝味 ${x.name}: 未知地图 ${x.mapId}`))
  if (COMPANIONS.hongqigong?.recruitFlag !== FEAST_TARGET_FLAG) errs.push('十道绝味：洪七公的 recruitFlag 应为 ' + FEAST_TARGET_FLAG)
  return errs
}
