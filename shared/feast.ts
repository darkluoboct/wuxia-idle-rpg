import type { CompanionState, PlayerDTO } from './protocol.ts'
import { GAIBANG_FINAL_DISHES } from './gaibang.ts'
import { innVisitDay } from './player.ts'

/**
 * 北丐·十道绝味（伙伴专题 §十六）：每日烹一道，食材需在对应地图挂机采办，十道呈齐洪七公同行。
 * 每日以子时（23:00）为界刷新。
 */
export const FEAST_TARGET_FLAG = 'hong_feast_done'
/** 采办食材：在菜品对应地图收取离线收益，且离线 ≥ 30 分钟 */
export const FEAST_GATHER_MINUTES = 30
export const FEAST_AFFINITY_PER_DISH = 10

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

export type FeastState = NonNullable<PlayerDTO['feast']>
export const emptyFeast = (): FeastState => ({ ingredients: [], cooked: [], lastCookDay: 0 })

/** 十道绝味进行中：已结识洪七公、尚未入队（抽卡已得者无需再做）、尚未呈齐 */
export function feastActive(hong: CompanionState | undefined, flags: readonly string[]) {
  return !!hong?.met && !hong.recruited && !flags.includes(FEAST_TARGET_FLAG)
}

/** 收功时离线够久，就在当前地图采一份还没有的食材 */
export function gatherFeastIngredient(player: Pick<PlayerDTO, 'feast' | 'currentMapId'>, elapsedSec: number) {
  if (elapsedSec < FEAST_GATHER_MINUTES * 60) return
  const feast = player.feast ?? emptyFeast()
  const dish = DISHES.find((d) => d.mapId === player.currentMapId && !feast.ingredients.includes(d.id) && !feast.cooked.includes(d.id))
  if (!dish) return
  player.feast = { ...feast, ingredients: [...feast.ingredients, dish.id] }
  return dish
}

export type CookResult = { error: string } | { dish: DishConfig; cooked: number; affinity: number; done: boolean }

/** 为洪七公掌勺：每日一道，扣纹银、加好感；十道呈齐时打上剧情标记并让洪七公入队 */
export function cookFeastDish(
  player: Pick<PlayerDTO, 'feast' | 'silver' | 'storyFlags'>, hong: CompanionState, dishId: string, now: number, affinityCap: number,
): CookResult {
  const dish = DISHES.find((d) => d.id === dishId)
  const feast = player.feast ?? emptyFeast()
  if (!dish || feast.cooked.includes(dishId)) return { error: '这道菜已经呈过了' }
  if (!feast.ingredients.includes(dishId)) {
    return { error: `缺少「${dish.ingredient}」：在对应地图挂机 ≥${FEAST_GATHER_MINUTES} 分钟后收功即可采得` }
  }
  const day = innVisitDay(now)
  if (feast.lastCookDay === day) return { error: '今日已为洪七公掌过勺，明日子时再来' }
  if (player.silver < dish.silver) return { error: `烹制需 ${dish.silver} 两纹银` }
  player.silver -= dish.silver
  const cooked = [...feast.cooked, dishId]
  player.feast = { ingredients: feast.ingredients.filter((id) => id !== dishId), cooked, lastCookDay: day }
  const affinity = Math.max(0, Math.min(FEAST_AFFINITY_PER_DISH, affinityCap - hong.affinity))
  hong.affinity += affinity
  const done = cooked.length === DISHES.length
  if (done) {
    player.storyFlags = [...new Set([...(player.storyFlags ?? []), FEAST_TARGET_FLAG])]
    hong.met = true
    hong.recruited = true
    hong.affinity = Math.max(hong.affinity, 100)
  }
  return { dish, cooked: cooked.length, affinity, done }
}
