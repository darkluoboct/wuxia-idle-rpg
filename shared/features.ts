import type { CombatUnitDTO, FeatureId, PlayerDTO } from './protocol.ts'
import { REALMS } from './gameData.ts'
import { STORY_CHAPTERS } from './storyData.ts'
import { TRIAL_STAGES } from './trialStages.ts'

export type { FeatureId } from './protocol.ts'

/**
 * 玩法随剧情开放（docs/17 §六）：新角色先过序章，之后按主线、历练与境界逐个开放。
 * 条件全部从现有进度推出，联机由服务端拦截，本地试玩用同一份规则。
 * 老角色没有 featureGate 标记，全部开放。
 */
type Requirement =
  | { node: number }                // 主线节点首通
  | { stage: number }               // 历练关首胜
  | { realm: number }               // 突破到该境界
  | { features: FeatureId[] }       // 这几项都已开放

type Tab = 'CULTIVATE' | 'JIANGHU' | 'ARSENAL' | 'SECT' | 'MARKET'

export interface FeatureConfig {
  id: FeatureId
  name: string
  /** 剧情卡标题，缺省为「新机缘 · 玩法名」 */
  title?: string
  requirement: Requirement
  /** 开放的具体内容，写在剧情卡末页 */
  opens: readonly string[]
  speaker: string
  portrait: CombatUnitDTO['portraitStyle']
  /** 剧情卡：一页一段，点一下翻页 */
  pages: readonly string[]
  goto?: { tab: Tab; sub?: string; label: string }
}

/** 按开放先后排列 */
export const FEATURES: readonly FeatureConfig[] = [
  {
    id: 'TRIAL', name: '三十关历练', title: '序章 · 忘机遗言', requirement: { node: 1 },
    opens: ['修行：打坐吐纳、冲穴、突破', '江湖：三十关历练与巡历挂机', '武库：武学、装备与伙伴编队'],
    speaker: '忘机客', portrait: 'wangchongyang',
    pages: [
      '黑衣人落荒而逃。老者倚着神龛喘息，把一册残卷和一枚铁八卦塞进你手里：「老朽自号忘机客……这卷《武库残卷》不载招式，却映得出天下武学。旁人说你经脉郁结、学不得武，那是他们不识货。」',
      '他一掌按在你后心，一股暖流冲开了胸口的郁结：「从今往后，你静坐也好、赶路也好、睡着也好，残卷都替你吐纳真气。真气攒够了，就去冲开穴道——穴道每通一处，你便强一分。」',
      '「城外荒山有草寇出没，先拿他们练练手……练出了门道，去嘉兴醉仙楼……找……」话没说完，老者已合上了眼。庙外雨停了。',
    ],
    goto: { tab: 'JIANGHU', sub: 'TRIAL', label: '去荒山历练' },
  },
  {
    id: 'INN', name: '醉仙客栈', requirement: { node: 2 },
    opens: ['市井：醉仙客栈，请酒、送礼、结交伙伴'],
    speaker: '郭靖', portrait: 'guojing',
    pages: [
      '郭靖把你按在酒桌边，给你满上一大碗：「大哥好身手！我师父们说，闯江湖光靠自己不成，得有朋友。」',
      '「醉仙楼南来北往的人多，你常来喝酒、给投缘的朋友送点心意，处得熟了，他们就肯跟你一道上阵。我和柯大师父也算一个！」',
    ],
    goto: { tab: 'MARKET', sub: 'INN', label: '去醉仙客栈' },
  },
  {
    id: 'MAPS', name: '江湖地图与百草丹房', requirement: { stage: 3 },
    opens: ['江湖：江湖地图，赶路、采药、同图共修', '市井：百草丹房，炼制冲穴与疗伤的丹药'],
    speaker: '了妄和尚', portrait: 'monk',
    pages: [
      '了妄和尚揉着被你打肿的手腕，倒也服气：「施主拳脚虽硬，身上的暗伤可不少。」他从袖中摸出一卷发黄的册子，「这是寺里药房抄的《百草图》。」',
      '「南湖草甸就长着田七、车前草，走远些还有更好的药。采回来送进丹房，炼成丹药，冲穴疗伤都用得上。」',
    ],
    goto: { tab: 'JIANGHU', sub: 'MAPS', label: '去采药' },
  },
  {
    id: 'DAILY', name: '每日江湖事', requirement: { features: ['INN', 'MAPS'] },
    opens: [`每日江湖事：收功、请酒、出战、采药各一回，办齐领元宝`],
    speaker: '柯镇恶', portrait: 'assassin',
    pages: [
      '柯镇恶用铁杖敲了敲地面：「练武贵在日日不辍。每天收一回功，打一场，采一回药，再来楼里跟朋友喝杯酒——一样都别落下。」',
      '「办齐了来找我，醉仙楼不会亏待勤快人。」',
    ],
  },
  {
    id: 'GACHA', name: '醉仙楼结缘', requirement: { node: 3 },
    opens: ['醉仙客栈：结缘，用元宝请江湖豪客喝酒结识', '醉仙客栈：故人寻访，找回错过的伙伴'],
    speaker: '醉仙楼掌柜', portrait: 'luchengfeng',
    pages: [
      '你在荒山斩了铜尸陈玄风，第二天整个嘉兴城都传遍了。醉仙楼掌柜亲自迎出门来：「少侠，楼上好几位江湖豪客点名要见你。」',
      '「楼上设了结缘席，元宝摆一桌酒，有缘的自会过来同坐。早先错过的旧识，也可托小店四处打听。」',
    ],
    goto: { tab: 'MARKET', sub: 'INN', label: '去醉仙楼' },
  },
  {
    id: 'GHOST', name: '子时鬼市', requirement: { stage: 8 },
    opens: ['市井：子时鬼市，鉴宝、挂单买卖、暗拍', '鬼市蒙面摊位（Lv.10 起可摆摊采买）'],
    speaker: '醉仙楼伙计', portrait: 'bandit',
    pages: [
      '你从黄河四鬼的行囊里翻出一块乌木腰牌，正面阴刻一个「鬼」字。醉仙楼的伙计一见，忙压低了嗓子：',
      '「这是子时鬼市的腰牌！每晚子时，城南旧码头挂起灯笼，戴上面巾进去，外头买不到的东西那里都有——只是真假，得凭您自己的眼力。」',
    ],
    goto: { tab: 'MARKET', sub: 'GHOST', label: '去鬼市' },
  },
  {
    id: 'SECT', name: '门派', requirement: { realm: 2 },
    opens: ['门派：拜师学艺、门派日常与晋升考核'],
    speaker: '柯镇恶', portrait: 'assassin',
    pages: [
      '「略有小成了？」柯镇恶侧耳听你运气，点了点头，「野路子练到这儿也就到头了。」',
      '「全真、丐帮、桃花岛都在收徒，去拜个正经师父。不想受人管束，做个逍遥散人也成——只是路得自己选。」',
    ],
    goto: { tab: 'SECT', label: '去拜师' },
  },
  {
    id: 'HUASHAN', name: '华山论剑', requirement: { node: 4 },
    opens: ['市井：华山论剑与兵器谱', '江湖：悬赏榜；同图侠客可递帖切磋、押镖劫镖'],
    speaker: '丘处机', portrait: 'daoist',
    pages: [
      '比武招亲的擂台散了，丘处机在人群外拦住你，捋须而笑：「擂台上那几招，有点意思。」',
      '「华山之巅有座论剑台，天下侠客都在那里切磋排座次。你若有胆，去会会他们；江湖上的恩怨悬赏，也该让你知道了。」',
    ],
    goto: { tab: 'MARKET', sub: 'HUASHAN', label: '去华山论剑' },
  },
  {
    id: 'RAID', name: '结义副本', requirement: { node: 5 },
    opens: ['江湖：结义副本，约两位侠客三人同闯'],
    speaker: '黄蓉', portrait: 'huangrong',
    pages: [
      '翻出王府高墙，黄蓉拍了拍衣上的灰：「今晚要不是三个人互相照应，谁也出不来。」',
      '「往后碰上硬仗，别一个人逞强。约两位侠客结伴，少室山、重阳宫、聚贤庄，都去闯一闯。」',
    ],
    goto: { tab: 'JIANGHU', sub: 'RAID', label: '去结义副本' },
  },
  {
    id: 'FEAST', name: '十道绝味', requirement: { node: 7 },
    opens: ['醉仙客栈：北丐·十道绝味，各地采办食材，每日做一道'],
    speaker: '洪七公', portrait: 'hongqigong',
    pages: [
      '洪七公咂着嘴意犹未尽：「这一桌只算开胃。天下有十道绝味，蓉儿也只会做一半。」',
      '「你若肯在醉仙楼掌勺，把它们一道道做出来，老叫化就再教你几手。食材各地都有，挂机时顺手采办。」',
    ],
    goto: { tab: 'MARKET', sub: 'INN', label: '去醉仙客栈' },
  },
]

export const FEATURE_BY_ID = Object.fromEntries(FEATURES.map((feature) => [feature.id, feature])) as Record<FeatureId, FeatureConfig>

export type FeatureState = Pick<PlayerDTO, 'featureGate' | 'maxChapterId' | 'realmTier' | 'trial'>

export function featureUnlocked(player: FeatureState, id: FeatureId): boolean {
  if (!player.featureGate) return true
  const { requirement } = FEATURE_BY_ID[id]
  if ('node' in requirement) return player.maxChapterId > requirement.node
  if ('stage' in requirement) return player.trial.rewardedStageIds.includes(requirement.stage)
  if ('realm' in requirement) return player.realmTier >= requirement.realm
  return requirement.features.every((feature) => featureUnlocked(player, feature))
}

/** 开放条件，如「通关主线 1-2「醉仙楼头 · 烟雨试招」」 */
export function featureRequirementText(id: FeatureId): string {
  const { requirement } = FEATURE_BY_ID[id]
  if ('node' in requirement) {
    const node = STORY_CHAPTERS.find(({ id }) => id === requirement.node)!
    return `通关主线 ${node.code}「${node.title}」`
  }
  if ('stage' in requirement) {
    const stage = TRIAL_STAGES.find(({ id }) => id === requirement.stage)!
    return `首胜历练第 ${String(stage.id).padStart(2, '0')} 关「${stage.title}」`
  }
  if ('realm' in requirement) return `突破境界「${REALMS.find(({ tier }) => tier === requirement.realm)!.name}」`
  return requirement.features.map(featureRequirementText).join('，并')
}

export function featureLockedText(id: FeatureId) {
  return `「${FEATURE_BY_ID[id].name}」尚未开放：${featureRequirementText(id)}后开放`
}

/** 下一项将开放的玩法；全部开放后为 undefined */
export function nextFeature(player: FeatureState) {
  return FEATURES.find(({ id }) => !featureUnlocked(player, id))
}

/** 已开放、还没看过开放剧情的第一项（老角色没有剧情卡） */
export function unseenFeature(player: FeatureState & Pick<PlayerDTO, 'featuresSeen'>) {
  if (!player.featureGate) return
  return FEATURES.find(({ id }) => featureUnlocked(player, id) && !player.featuresSeen?.includes(id))
}

/** 记下看过的开放剧情；返回是否有变化 */
export function markFeatureSeen(player: FeatureState & Pick<PlayerDTO, 'featuresSeen'>, id: FeatureId) {
  if (!FEATURE_BY_ID[id] || !featureUnlocked(player, id) || player.featuresSeen?.includes(id)) return false
  player.featuresSeen = [...(player.featuresSeen ?? []), id]
  return true
}
