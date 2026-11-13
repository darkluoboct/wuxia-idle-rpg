import { ADVENTURES, COMPANIONS, MAPS, STORY_CHAPTERS } from './gameData'
import { GAIBANG_FINAL_DISHES } from '../../../shared/gaibang.ts'
import { REUNION_CLUE_SOURCES, REUNION_CLUE_TARGET, REUNION_QUESTS } from '../../../shared/reunion.ts'

export { GAIBANG_FINAL_DISHES }
export * from '../../../shared/reunion.ts'

/**
 * 「肝时间」的免费路线（第 12 册 §十六）：
 *   · 故人寻访：错过的剧情送伙伴，按日积攒线索（约 30 天）→ 三步重逢剧情 → 入队
 *   · 北丐·十道绝味：每日烹一道，食材需在对应地图挂机采办 → 十道呈齐，洪七公同行
 * 所有“每日”均以子时（23:00）为界刷新；付费的故人重逢令可在任意阶段直接跳过寻访。
 */

// ───────────────────────── 北丐·十道绝味 ─────────────────────────
export const FEAST_TARGET_FLAG = 'hong_feast_done'
/** 采办食材：在菜品对应地图收取离线收益，且离线 ≥ 30 分钟 */
export const FEAST_GATHER_MINUTES = 30

export interface DishConfig {
  id: string
  name: string
  mapId: string
  ingredient: string
  silver: number
  poem: string
}

/** 黄蓉为洪七公所做的菜肴（原著）+ 沿途各地风味，共十道 */
export const DISHES: DishConfig[] = [
  ...GAIBANG_FINAL_DISHES,
  { id: 'haoqiu_tang', name: '好逑汤', mapId: 'zhongnan_forest', ingredient: '终南樱桃', silver: 400, poem: '樱桃去核，嵌以斑鸠肉，荷叶清香满碗。' },
  { id: 'taohua_guiyu', name: '桃花鳜鱼', mapId: 'taohua_isle', ingredient: '桃花流水鳜鱼', silver: 700, poem: '桃花流水鳜鱼肥，一箸入口不思归。' },
  { id: 'yinyu_geng', name: '太湖银鱼羹', mapId: 'guiyun_lake', ingredient: '太湖银鱼', silver: 400, poem: '银鱼细如柳叶，羹清见底，鲜得眉毛都要掉了。' },
  { id: 'niqiu_geng', name: '黑沼泥鳅羹', mapId: 'heizhao_swamp', ingredient: '黑沼泥鳅', silver: 500, poem: '瑛姑泥潭里的泥鳅，滑不留手，炖汤却极鲜。' },
  { id: 'kao_huangyang', name: '大漠烤黄羊', mapId: 'damo_caravan', ingredient: '塞外黄羊', silver: 800, poem: '篝火噼啪，羊油滴落，草原汉子的豪气全在这一口。' },
  { id: 'songzi_jiu', name: '华山松子酒', mapId: 'huashan_peak', ingredient: '华山雪松子', silver: 900, poem: '松子浸酒，雪水封坛，论剑之后正好一醉。' },
  { id: 'baicai_jiyou', name: '鸡油炒白菜', mapId: 'jiaxing_suburb', ingredient: '江南菘菜', silver: 300, poem: '只取白菜心，只用鸡油炒——越是寻常菜，越见真功夫。' },
]

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
