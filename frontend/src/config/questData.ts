import type { PortraitStyle, StanceType } from './typesHelper'
import { ADVENTURES, COMPANIONS, MAPS, STORY_CHAPTERS } from './gameData'

/**
 * 「肝时间」的免费路线（第 12 册 §十六）：
 *   · 故人寻访：错过的剧情送伙伴，按日积攒线索（约 30 天）→ 三步重逢剧情 → 入队
 *   · 北丐·十道绝味：每日烹一道，食材需在对应地图挂机采办 → 十道呈齐，洪七公同行
 * 所有“每日”均以子时（23:00）为界刷新；付费的故人重逢令可在任意阶段直接跳过寻访。
 */

// ───────────────────────── 故人寻访 ─────────────────────────
export const REUNION_CLUE_TARGET = 300
/** 线索来源：每次所得 / 每日上限（三项合计每日 10 点 → 约 30 天） */
export const REUNION_CLUE_SOURCES = {
  closed: { label: '闭关打听', gain: 5, dailyCap: 5, hint: '收取离线收益时离线 ≥ 1 小时' },
  replay: { label: '旧地重游', gain: 3, dailyCap: 3, hint: '再次历练与其相关的主线节点并获胜' },
  inn: { label: '客栈打听', gain: 2, dailyCap: 2, hint: '花 300 纹银向掌柜打听' },
} as const
export type ClueSource = keyof typeof REUNION_CLUE_SOURCES
export const REUNION_INQUIRE_COST = 300
/** 故地相候：线索集齐后，须在指定地图累计停留的时长（可离线） */
export const REUNION_WAIT_HOURS = 2

export interface ReunionQuestConfig {
  companionId: string
  /** 错过的判定：该支线已了结、伙伴却未入队 */
  afterAdventure: string
  replayNodeIds: number[]
  mapId: string
  waitText: string
  giftText: string
  enemy: { name: string; title: string; portrait: PortraitStyle; stance: StanceType }
  battleIntro: string
  outro: string
}

export const REUNION_QUESTS: Record<string, ReunionQuestConfig> = {
  meichaofeng: {
    companionId: 'meichaofeng',
    afterAdventure: 'huangshan_bishou',
    replayNodeIds: [3],
    mapId: 'jiaxing_suburb',
    waitText: '传闻那位盲眼的黑衣女子每逢月圆便回荒山崖下。你在嘉兴城外守候，等她现身。',
    giftText: '你托人将一壶桃花岛的旧酒放在崖下石上——那是她当年在师门喝惯的味道。',
    enemy: { name: '全真弟子·尹志平', title: '奉命追剿铁尸', portrait: 'daoist', stance: 'TAICHI' },
    battleIntro: '酒壶刚放下，林中闪出一队全真弟子：“铁尸梅超风作恶多端，今日不留活口！”',
    outro: '你挡在崖前击退追兵。梅超风沉默良久，终于开口：“你当年夺了我的经，如今又救我一命……罢了，这条命，跟你走一程。”',
  },
  yangtiexin: {
    companionId: 'yangtiexin',
    afterAdventure: 'tieqiangmiao',
    replayNodeIds: [4, 5],
    mapId: 'zhongnan_forest',
    waitText: '有樵夫说，终南山深处住着一对从中都逃来的夫妇。你在后山密林里静候消息。',
    giftText: '你备下一壶临安桂花酿，托樵夫送进山中——那是杨铁心故乡的酒。',
    enemy: { name: '金兵统领·段天德', title: '追捕杨家余孽', portrait: 'bandit', stance: 'FIERCE' },
    battleIntro: '山道上马蹄声急，段天德领着金兵搜山而来：“杨铁心！看你还往哪里逃！”',
    outro: '金兵溃散。杨铁心拄枪而立，向你深深一揖：“当日铁枪庙一别，杨某没齿难忘。从今往后，杨家枪随你差遣。”',
  },
}

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
  { id: 'jiaohuaji', name: '叫化鸡', mapId: 'jiaxing_suburb', ingredient: '江南肥鸡', silver: 300, poem: '泥封荷叶，火煨半日，一开泥壳满林香。' },
  { id: 'yudi_luomei', name: '玉笛谁家听落梅', mapId: 'jiaxing_suburb', ingredient: '五般肉条', silver: 600, poem: '羊羔坐臀、小猪耳朵、小牛腰子……五味入口，各有其妙。' },
  { id: 'ershisi_qiao', name: '二十四桥明月夜', mapId: 'guiyun_lake', ingredient: '太湖嫩豆腐', silver: 500, poem: '火腿剜孔，豆腐削球，一轮明月浮于汤中。' },
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
  if (new Set(DISHES.map((x) => x.id)).size !== DISHES.length) errs.push('十道绝味：菜品 id 重复')
  DISHES.forEach((x) => MAPS.some((m) => m.id === x.mapId) || errs.push(`十道绝味 ${x.name}: 未知地图 ${x.mapId}`))
  if (COMPANIONS.hongqigong?.recruitFlag !== FEAST_TARGET_FLAG) errs.push('十道绝味：洪七公的 recruitFlag 应为 ' + FEAST_TARGET_FLAG)
  return errs
}
