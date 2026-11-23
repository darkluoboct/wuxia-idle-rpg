/**
 * 关卡剧情演出（docs/27）：每关首通时分「起 · 战 · 结」三段。
 *   · 起  before  开打前的入关卷轴
 *   · 战  lines   回放前插进战报的对白
 *   · 结  after   首通胜利后的回目结语
 *
 * 46 回都已写完：主线在 STORY_TEXT（入关末页与缺省结语沿用 storyData 的 intro、firstClear），历练在 TRIAL_SCRIPTS。
 * 全文可用 scripts/export_stage_scripts.ts 导出审稿。
 */
import type { BattleEventDTO, BattleReportDTO, CombatUnitDTO, OriginId, PlayerDTO, RichSegment } from './protocol.ts'
import { STORY_CHAPTERS, type StoryNodeConfig } from './storyData.ts'
import { STORY_SNAKE_ADVENTURE } from './storySnake.ts'
import { TRIAL_STAGES, type TrialStageConfig } from './trialStages.ts'

type PortraitStyle = CombatUnitDTO['portraitStyle']

/** 'N1-3' 是主线节点，'T07' 是历练关 */
export type StageKey = `N${string}` | `T${string}`

/** 卷轴背景，缺省为嘉兴暮色 */
export type SceneId = 'jiaxing-dusk' | 'jiaxing-spring' | 'zhongnan' | 'damo' | 'heizhao'

export interface ScriptPage {
  speaker?: string
  portrait?: PortraitStyle
  /** 用 \n 分段 */
  text: string
}

export interface ScriptLine {
  at: 'OPEN' | 'ROUND' | 'ENRAGE' | 'WIN' | 'LOSE'
  /** at 为 ROUND 时用 */
  round?: number
  /** 首领名或伙伴名；不写就是旁白 */
  speaker?: string
  text: string
  /** 同一时点可写几句，按顺序取第一句条件满足的。choice 也认药蛇宝血（shedu_baoxue），取 player.storySnakeChoice */
  when?: { flag?: string; origin?: OriginId; companion?: string; choice?: [adventureId: string, key: 'A' | 'B'] }
}

export interface StageScript {
  scene?: SceneId
  before: ScriptPage[]
  lines: ScriptLine[]
  after: ScriptPage[]
  /** 下回预告，一句 */
  hook?: string
  /** 通关后卡片上的一句话小结 */
  recap?: string
  /** 首胜后世界频道里传开的江湖传闻，{name} 换成侠客名 */
  rumor?: string
}

/** 四种家世的家人伙伴（shared/origins.ts 的 companionId 对应的名字），阵中会插话 */
export const KIN_NAMES: Record<OriginId, string> = { jiangmen: '雷铮', yujia: '阮青篙', xinglin: '沈青黛', xuanmen: '松岩子' }

/** 家人插一句：同一时点按家世各写一句，只有带着这位家人的才会说 */
function kin(round: number, lines: Record<OriginId, string>): ScriptLine[] {
  return (Object.keys(lines) as OriginId[]).map((origin) => ({ at: 'ROUND', round, speaker: KIN_NAMES[origin], text: lines[origin], when: { origin } }))
}

/** 每页字数上限；历练入关最多 2 页，主线最多 4 页 */
export const SCRIPT_PAGE_MAX_CHARS = 120
export const SCRIPT_MAX_PAGES = { N: 4, T: 2 } as const

export const storyKey = (code: string): StageKey => `N${code}`
export const trialKey = (code: string): StageKey => `T${code}`

/**
 * 故事的唯一先后顺序，共 46 回（docs/27 §四）。
 * 第一期只用来决定结语里「前往」去哪一关；门槛和行历重排在第三期接上。
 */
export const STORY_TIMELINE: readonly StageKey[] = [
  // 第一章 · 嘉兴烟雨，大漠荒山
  'N1-1', 'T01', 'N1-2', 'T02', 'T03', 'T04', 'N1-3', 'T05', 'T06', 'T07',
  // 第二章 · 中都风云，二闯王府
  'T08', 'T09', 'N2-1', 'T10', 'T11', 'T12', 'N2-2', 'T13', 'N2-3',
  // 第三章 · 太湖归云，碧海桃花
  'N3-1', 'T14', 'T15', 'N3-2', 'T16', 'T17', 'T18', 'T19', 'N3-3', 'N3-4', 'T20', 'T21',
  // 第四章 · 荒岛洪波，铁掌孤峰
  'T22', 'T23', 'N4-1', 'T24', 'N4-2', 'T25', 'T26', 'N4-3',
  // 第五章 · 大漠金刀，华山论剑
  'T27', 'N5-1', 'T28', 'N5-2', 'T29', 'N5-3', 'T30',
]

/** 每章的第一回；章与章之间的结语预告下一章 */
const CHAPTER_OPENERS: readonly StageKey[] = ['N1-1', 'T08', 'N3-1', 'T22', 'T27']
export const TIMELINE_CHAPTER_TITLES = ['嘉兴烟雨，大漠荒山', '中都风云，二闯王府', '太湖归云，碧海桃花', '荒岛洪波，铁掌孤峰', '大漠金刀，华山论剑'] as const

/** 某一章的各回，按时间线先后 */
export function timelineChapterStages(chapter: number) {
  return STORY_TIMELINE.filter((key) => timelineChapter(key) === chapter)
}

/** 这一回在时间线上属于第几章 */
export function timelineChapter(key: StageKey) {
  const at = STORY_TIMELINE.indexOf(key)
  return CHAPTER_OPENERS.filter((opener) => STORY_TIMELINE.indexOf(opener) <= at).length
}

/** A 类门槛：主线节点在时间线上紧挨着的前一回是历练时，要先过那一关（docs/27 §四） */
export function storyGateStage(code: string): TrialStageConfig | undefined {
  const before = STORY_TIMELINE[STORY_TIMELINE.indexOf(storyKey(code)) - 1]
  return before?.startsWith('T') ? TRIAL_STAGES.find((stage) => trialKey(stage.code) === before) : undefined
}

/**
 * 眼下挡住这个主线节点的历练关，没有就放行。
 * 只管新角色（featureGate）还没打的最前一个节点；老角色、已通关和补打的节点都不拦，免得老存档突然卡住。
 */
export function storyGateBlock(node: Pick<StoryNodeConfig, 'id' | 'code'>, player: Pick<PlayerDTO, 'featureGate' | 'maxChapterId' | 'trial'>) {
  if (!player.featureGate || node.id < player.maxChapterId) return
  const stage = storyGateStage(node.code)
  const { rewardedStageIds, maxStageId } = player.trial
  return stage && !rewardedStageIds.includes(stage.id) && stage.id >= maxStageId ? stage : undefined
}

export const storyGateText = (stage: Pick<TrialStageConfig, 'code' | 'title'>) => `先过历练第 ${stage.code} 关「${stage.title}」，再来这里。`

/** B 类门槛：历练关在时间线上紧挨着的前一回是主线时，要先打过那个节点（docs/27 §四） */
export function trialGateNode(code: string): StoryNodeConfig | undefined {
  const before = STORY_TIMELINE[STORY_TIMELINE.indexOf(trialKey(code)) - 1]
  return before?.startsWith('N') ? STORY_CHAPTERS.find((node) => storyKey(node.code) === before) : undefined
}

/**
 * 眼下挡住这关历练首战的主线节点，没有就放行。与 A 类一样只管新角色（featureGate），
 * 已经首胜的关照常复战；巡历不拦，挂机的收益不受影响。
 */
export function trialGateBlock(stage: Pick<TrialStageConfig, 'id' | 'code'>, player: Pick<PlayerDTO, 'featureGate' | 'maxChapterId' | 'trial'>) {
  if (!player.featureGate || player.trial.rewardedStageIds.includes(stage.id)) return
  const node = trialGateNode(stage.code)
  return node && node.id >= player.maxChapterId ? node : undefined
}

export const trialGateText = (node: Pick<StoryNodeConfig, 'code' | 'title'>) => `先打主线 ${node.code}「${node.title}」，再来这里。`

/** 时间线上排在 key 后面、还没通关的第一回 */
export function nextStage(key: StageKey, cleared: (key: StageKey) => boolean) {
  const from = STORY_TIMELINE.indexOf(key)
  return from < 0 ? undefined : STORY_TIMELINE.slice(from + 1).find((next) => !cleared(next))
}

// ==================== 主线 ====================
const STORY_SCENES: Partial<Record<string, SceneId>> = { '1-2': 'jiaxing-spring', '2-3': 'zhongnan', '5-1': 'damo' }

/**
 * 写好的主线回目。入关的末页总是节点上的 intro（日志里记的也是它），lead 是排在它前面的前情；
 * 结语缺省用节点的 firstClear.text，写了 after 就用 after。
 */
interface StoryNodeText {
  lead?: ScriptPage[]
  lines: ScriptLine[]
  after?: ScriptPage[]
  hook?: string
  recap?: string
  rumor?: string
}

const STORY_TEXT: Partial<Record<string, StoryNodeText>> = {
  // 第 1 回：开场由序章演，结语就是忘机客的剧情卡（features.ts 的 TRIAL）
  '1-1': {
    lines: [
      { at: 'OPEN', speaker: '金国密探·黑衣刺客', text: '哪来的野小子？连他一起剁了！' },
      { at: 'WIN', speaker: '金国密探·黑衣刺客', text: '点子扎手……撤！' },
    ],
    recap: '嘉兴破庙救下忘机客，得《武库残卷》与铁八卦。',
    rumor: '嘉兴城外的破庙昨夜起了火光，有人看见几个黑衣人捂着伤，连夜出了城。',
  },
  // 第 3 回
  '1-2': {
    lead: [{ text: '忘机客临终只说了半句：「去嘉兴醉仙楼……找……」找谁，他没说完。\n赖三说，楼上这几天来了七个怪人和一个道士，天天斗酒。' }],
    lines: [
      { at: 'OPEN', speaker: '全真弟子·赵志敬', text: '全真门下赵志敬，请了！' },
      ...kin(2, {
        jiangmen: '全真剑法讲究守中。他守得住，你就绕着打。',
        yujia: '道士的剑倒是好看，可惜没下过水。',
        xinglin: '他左肩有旧伤，出剑总慢半拍。',
        xuanmen: '全真吐纳……他这口气，还差点火候。',
      }),
      { at: 'WIN', speaker: '全真弟子·赵志敬', text: '哼，算你走运。' },
      { at: 'LOSE', speaker: '全真弟子·赵志敬', text: '野路子终归是野路子。' },
    ],
    hook: '郭靖拉你下楼喝酒，楼下却有人在闹事。',
    recap: '醉仙楼上与赵志敬试招，结识郭靖和柯镇恶。',
    rumor: '醉仙楼上，有个叫{name}的年轻人接下了全真弟子赵志敬的剑，江南七怪里那位瞎眼的柯大侠都点了头。',
  },
  // 第 7 回 · 陈玄风【上】：这一回他负伤北逃，历练 07 才了结
  '1-3': {
    lead: [{ text: '子时，你随江南七怪摸上荒山。山风里飘着腥气，柯镇恶走在最前头，铁杖一路点着山石：「双煞害死了我五弟张阿生。这笔账，今夜了结。」' }],
    lines: [
      { at: 'OPEN', speaker: '铜尸·陈玄风', text: '江南七怪，阴魂不散！今夜连这小子一起埋了！' },
      ...kin(2, {
        jiangmen: '骷髅练功……这等邪术，背嵬军见一个杀一个！',
        yujia: '这人是铜铸的？刺都扎不进去！',
        xinglin: '他身上有尸毒的味道，别让他抓伤你！',
        xuanmen: '铁布衫总有罩门，等他换气那一下。',
      }),
      // 主线的陈玄风第三回合露出罩门（combatMeta 的 CHEN_XUANFENG_STORY）
      { at: 'ROUND', round: 3, speaker: '郭靖', text: '肚脐！他肚脐露出来了！' },
      { at: 'WIN', speaker: '铜尸·陈玄风', text: '贼婆娘！' },
      { at: 'LOSE', speaker: '铜尸·陈玄风', text: '铁布衫练了十年，就凭你们？' },
    ],
    after: [
      { text: '柯镇恶的毒菱打中梅超风双目，她惨呼一声，失足坠入荒崖。陈玄风扑过去没抓住，肩头又挨了郭靖一匕首，怒吼着遁入夜色，往北去了。' },
      { text: '匕首掉在乱石间。你拾起来，柄上刻着一个「靖」字。\n崖下，梅超风还有气息，怀里那半卷人皮在月光下泛着幽光。这一刻你的选择，将决定她的生死。' },
    ],
    hook: '铜尸负伤北逃。追！',
    recap: '荒山夜战双煞，梅超风坠崖，陈玄风负伤北逃，拾得「靖」字匕首。',
    rumor: '嘉兴荒山夜里的鬼哭停了。黑风双煞一个瞎了眼坠下山崖，一个负伤往北逃了——出手的除了江南七怪，还有个叫{name}的年轻人。',
  },
  // ───────── 第二章 · 中都风云，二闯王府 ─────────
  // 第 13 回 · 完颜康【下】：擂台上的事在历练 09
  '2-1': {
    lead: [{ text: '你放心不下，送穆家父女回了客店。那老汉自称「穆易」，一路上盯着你腰间那柄刻字的匕首，几次欲言又止。' }],
    lines: [
      { at: 'OPEN', speaker: '小王爷·完颜康', text: '给我拿下！一个也别放走！' },
      { at: 'WIN', speaker: '小王爷·完颜康', text: '……走着瞧。' },
      { at: 'LOSE', speaker: '小王爷·完颜康', text: '这一回，看谁还护得住她。' },
    ],
    after: [
      { text: '你逼退完颜康，亲兵护着他退出了院子。穆念慈收起柳叶刀，向你深深一福：「念慈愿随恩公同行。」' },
      { text: '院门外一声长笑，一个道人大步进来，正是丘处机。他盯着那「穆易」看了半晌，忽然变了脸色：「杨兄弟？你是杨铁心！」\n老汉双手发抖，眼泪滚了下来。' },
    ],
    hook: '杨铁心说，赵王府里的王妃，就是他失散十八年的妻子。',
    recap: '客店夜战击退完颜康，穆念慈同行；丘处机认出「穆易」就是杨铁心。',
  },
  // 第 17 回 · 梁子翁【上】：药蛇怎么处置在这一回定
  '2-2': {
    lead: [{ text: '王处一的手臂肿得发亮，毒已过了肘。当晚，张家口那个小乞儿又冒了出来，换了一身女装，自称黄蓉：「王府今晚设宴，人都在前厅——正好去药房取药。」' }],
    lines: [
      { at: 'OPEN', speaker: '参仙老怪·梁子翁', text: '你们……竟敢喝了我宝蛇的血！', when: { choice: ['shedu_baoxue', 'A'] } },
      { at: 'OPEN', speaker: '参仙老怪·梁子翁', text: '我的宝蛇呢？我的宝蛇呢？！', when: { choice: ['shedu_baoxue', 'B'] } },
      { at: 'OPEN', speaker: '参仙老怪·梁子翁', text: '哪来的小贼，敢动老夫的药房！宝蛇，咬死他们！' },
      { at: 'WIN', speaker: '参仙老怪·梁子翁', text: '我的药……我二十年的心血！' },
      { at: 'LOSE', speaker: '参仙老怪·梁子翁', text: '留下来，给老夫的药圃当肥料吧！' },
    ],
    after: [{ text: '梁子翁与灵智上人败退，你一把抓起架上的解药揣进怀里，掉头往外冲。\n身后王府火起，喊杀震天，梁子翁的怒吼一声近过一声。' }],
    hook: '梁子翁追上来了。',
    recap: '二闯王府取得解药，梁子翁与灵智上人败退。',
  },
  // 第 19 回 · 第二章完
  '2-3': {
    lead: [{ text: '你陪王处一回到终南山，在重阳宫歇了两日。王处一看过你那柄匕首，脸色凝重，派人往各处送信，请师兄们回山。' }],
    lines: [
      { at: 'OPEN', speaker: '长真子·谭处端', text: '全真吐纳，讲究一个「静」字。你且试试！' },
      { at: 'WIN', speaker: '长真子·谭处端', text: '气息绵长，根底不坏。' },
      { at: 'LOSE', speaker: '长真子·谭处端', text: '心浮气躁，回去再练三年。' },
    ],
    after: [
      { text: '谭处端收剑称善，马钰以全真心法指点你吐纳的正途。松涛声里，丘处机缓缓讲起十八年前牛家村的那一夜。' },
      { text: '那年他在牛家村结识郭啸天、杨铁心，赠了两柄匕首，一柄刻「靖」，一柄刻「康」。\n郭靖，杨康——两个孩子的名字，都是他取的。你手里那柄匕首，忽然沉甸甸的。' },
    ],
    hook: '南下江南。宝应城外的松林里，有个嘴馋的老叫化。',
    recap: '终南山上丘处机道出牛家村旧案，「靖」字匕首有了来历。',
  },

  // ───────── 第三章 · 太湖归云，碧海桃花 ─────────
  // 第 20 回
  '3-1': {
    lead: [{ text: '下了终南山，你与郭靖、黄蓉结伴南下。到宝应城外，黄蓉忽然停步，嗅了嗅风里的酒气：「有个老叫化，跟了咱们三里地了。」' }],
    lines: [
      { at: 'OPEN', speaker: '北丐·洪七公', text: '吃人的嘴软，老叫化陪你过几招！' },
      { at: 'WIN', speaker: '北丐·洪七公', text: '好小子，不骄不躁！' },
      { at: 'LOSE', speaker: '北丐·洪七公', text: '掌力还嫩，多吃几碗饭再来。' },
    ],
    hook: '松林里还藏着一个人，一路尾随着黄蓉。',
    recap: '宝应松林以一桌菜引来洪七公，学得几式降龙掌法。',
  },
  // 第 23 回 · 裘千丈【上】
  '3-2': {
    lead: [{ text: '归云庄正堂上，一个白须老头大剌剌坐着，手托一块青砖，一捏就碎：「陆庄主，这庄子老夫看上了。」\n陆乘风脸色铁青，却不敢作声。' }],
    lines: [
      { at: 'OPEN', speaker: '铁掌帮副帮主·裘千丈', text: '老夫一掌开山碎石，小辈还不跪下！' },
      { at: 'WIN', speaker: '铁掌帮副帮主·裘千丈', text: '好汉饶命！老夫……老夫是闹着玩的！' },
      { at: 'LOSE', speaker: '铁掌帮副帮主·裘千丈', text: '哈哈，铁掌水上漂的名头，可不是白叫的！' },
    ],
    hook: '那老头不死心，第二天又登门了。',
    recap: '归云庄识破假「铁掌水上漂」，陆乘风赠你海船。',
  },
  // 第 28 回 · 黄药师【上】
  '3-3': {
    lead: [{ text: '桃林尽头，一个青袍人负手而立，手按一支碧玉箫——东邪黄药师。他还没开口，海边传来一阵怪笑：西毒欧阳锋带着欧阳克，登岛求亲来了。' }],
    lines: [
      { at: 'OPEN', speaker: '东邪·黄药师（三成力）', text: '三成功力，接得住，就算你过了。' },
      { at: 'WIN', speaker: '东邪·黄药师（三成力）', text: '好！' },
      { at: 'LOSE', speaker: '东邪·黄药师（三成力）', text: '回去吧。' },
    ],
    hook: '岛上有个山洞，洞里有人在自己跟自己打架。',
    recap: '桃花岛三道试题，你拆过了黄药师的最后一招。',
  },
  // 第 29 回 · 周伯通【上】
  '3-4': {
    lead: [{ text: '桃花岛东边有座清音洞，黄蓉说那里关着一个人，一关就是十五年。你好奇心起，独自摸了过去。' }],
    lines: [
      { at: 'OPEN', speaker: '老顽童·周伯通', text: '好玩好玩！打赢了我，教你背《九阴真经》！' },
      { at: 'WIN', speaker: '老顽童·周伯通', text: '不玩了不玩了，你赖皮！' },
      { at: 'LOSE', speaker: '老顽童·周伯通', text: '哈哈，你输了，再来再来！' },
    ],
    hook: '「好兄弟」，第二天又来拉你进洞。',
    recap: '清音洞与老顽童拆了三百招，被他硬拉着结拜。',
  },

  // ───────── 第四章 · 荒岛洪波，铁掌孤峰 ─────────
  // 第 34 回 · 欧阳锋（压鬼岛）【下】
  '4-1': {
    lead: [{ text: '石堆「轰」地炸开，碎石溅了满地。洪七公一把将你们推到身后：「你们退开，这老毒物交给我。」' }],
    lines: [
      { at: 'OPEN', speaker: '西毒·欧阳锋（负伤）', text: '先收拾了你，再收拾老叫化。' },
      // 欧阳锋第三回合蓄力蛤蟆功（mechanicTip）
      { at: 'ROUND', round: 3, speaker: '洪七公', text: '蛤蟆功要来了，打断他！' },
      { at: 'WIN', speaker: '西毒·欧阳锋（负伤）', text: '……好，好得很。' },
      { at: 'LOSE', speaker: '西毒·欧阳锋（负伤）', text: '老叫化，你的晚辈不中用啊。' },
    ],
    hook: '回临安，找个安静的地方给洪七公疗伤。',
    recap: '压鬼岛上洪七公与西毒两败俱伤，你扶他扎筏出海，夺得灵蛇杖。',
  },
  // 第 36 回
  '4-2': {
    lead: [{ text: '洪七公的伤一天天见好。这一夜，密室墙外人声杂沓：黄药师、全真七子、欧阳锋先后到了酒馆。你屏住呼吸，从墙缝里往外看。' }],
    lines: [
      { at: 'OPEN', speaker: '杨康·完颜康（夺经）', text: '经文交出来，我留你全尸。' },
      { at: 'WIN', speaker: '杨康·完颜康（夺经）', text: '……我们走着瞧。' },
      { at: 'LOSE', speaker: '杨康·完颜康（夺经）', text: '梵文总纲，归我了。' },
    ],
    hook: '洪七公的伤，只有南帝一灯能治。去湘西，要过一片黑沼。',
    recap: '牛家密室听得《九阴》梵文总纲，杨康夺经未成，负伤遁走。',
  },
  // 第 39 回 · 裘千仞【下】，第四章完
  '4-3': {
    lead: [{ text: '后山禁地里横着十几具白骨，都是闯山的人。山路越走越陡，峰顶的石屋前，裘千仞已经在等你了。' }],
    lines: [
      { at: 'OPEN', speaker: '铁掌水上漂·裘千仞', text: '铁掌之下，从无活口！' },
      { at: 'WIN', speaker: '铁掌水上漂·裘千仞', text: '我……竟败了……' },
      { at: 'LOSE', speaker: '铁掌水上漂·裘千仞', text: '后山的白骨，再添一具！' },
    ],
    hook: '北上大漠。郭靖随成吉思汗西征，正缺一个破城的法子。',
    recap: '铁掌峰顶击败裘千仞，下山连闯渔樵耕读，见到一灯大师。',
  },

  // ───────── 第五章 · 大漠金刀，华山论剑 ─────────
  // 第 41 回
  '5-1': {
    lead: [{ text: '城破那夜，你在城头巡哨，瞥见两个人影闪进箭楼：一个锦袍玉带，是完颜洪烈；一个白衣倒提蛇杖，是欧阳锋。' }],
    lines: [
      { at: 'OPEN', speaker: '金国六王爷·完颜洪烈', text: '坏我大事……给我杀！' },
      // 完颜洪烈第二回合蓄力铁骑冲阵（mechanicTip）
      { at: 'ROUND', round: 2, speaker: '郭靖', text: '铁骑要冲阵了，稳住阵脚！' },
      { at: 'WIN', speaker: '金国六王爷·完颜洪烈', text: '撤！撤回中原！' },
      { at: 'LOSE', speaker: '金国六王爷·完颜洪烈', text: '大金的铁骑，还没败！' },
    ],
    hook: '八月十五，嘉兴烟雨楼。江湖上的旧账，都约在了那一天。',
    recap: '撒麻尔罕城头识破完颜洪烈与欧阳锋，完颜洪烈败走。',
  },
  // 第 43 回
  '5-2': {
    lead: [{ text: '铁枪庙里挤满了人。黄蓉走到神像前，把桃花岛上那一夜的事一件件说了出来——每一句，都指向杨康和欧阳锋。' }],
    lines: [
      { at: 'OPEN', speaker: '千手人屠·彭连虎', text: '少废话，今天谁也别想走出这座庙！' },
      { at: 'WIN', speaker: '千手人屠·彭连虎', text: '点子太硬，撤！' },
      { at: 'LOSE', speaker: '千手人屠·彭连虎', text: '铁枪庙，就是你们的坟！' },
    ],
    hook: '完颜洪烈带着死士，封住了铁枪庙。',
    recap: '铁枪庙前黄蓉揭穿真凶，打退彭连虎、沙通天。',
  },
  // 第 45 回 · 欧阳锋（华山）【上】：「天下第一」在历练 30
  '5-3': {
    lead: [{ text: '华山之巅，大雪封山。论剑台上积雪没膝，洪七公、黄药师都到了，各自盘膝等着。\n五绝之约，二十五年一回。' }],
    lines: [
      { at: 'OPEN', speaker: '疯魔西毒·欧阳锋', text: '我是谁？你知道我是谁吗？！' },
      { at: 'ENRAGE', speaker: '疯魔西毒·欧阳锋', text: '天下第一……是我！是我！' },
      { at: 'WIN', speaker: '疯魔西毒·欧阳锋', text: '哈哈哈……我是谁……' },
      { at: 'LOSE', speaker: '疯魔西毒·欧阳锋', text: '天下第一，是我！' },
    ],
    after: [{ text: '你一掌印在他胸口，欧阳锋倒飞出去，在雪地里翻了几个跟头，竟倒立着狂笑起来，一路蹦下了山。\n五绝面面相觑。论剑，还没完。' }],
    hook: '当夜，雪地里又响起了那阵狂笑。',
    recap: '华山论剑击退疯魔的欧阳锋，他倒立着狂笑下山。',
  },
}

function storyNodeScript(node: StoryNodeConfig): StageScript {
  const text = STORY_TEXT[node.code]
  // 1-1 的开场是序章，结语是忘机客的剧情卡，卷轴不再放，卡片上留小结
  if (node.code === '1-1') return { before: [], lines: text?.lines ?? [], after: [], recap: text?.recap, rumor: text?.rumor }
  return {
    scene: STORY_SCENES[node.code],
    before: [...text?.lead ?? [], { text: node.intro }],
    lines: text?.lines ?? [],
    after: text?.after ?? [{ text: node.firstClear.text }],
    hook: text?.hook,
    recap: text?.recap,
    rumor: text?.rumor,
  }
}

// ==================== 历练 ====================
/** 30 关历练的剧情，按 docs/13 的对白与过关播报改写（与时间线冲突的几处已重写） */
const TRIAL_SCRIPTS: Record<string, StageScript> = {
  // ───────── 第一章 · 嘉兴烟雨，大漠荒山 ─────────
  // 第 2 回
  '01': {
    before: [{ text: '雨又下起来了。你在荒山半腰一座塌了半边的山神庙里生火烤衣，残卷贴着胸口，还带着忘机客掌心的余温。\n庙门外火把晃动，一个满脸横肉的汉子提着破铁刀踱进来，看看你的剑，又看看你鼓囊囊的衣襟，咧嘴笑了。' }],
    lines: [
      { at: 'OPEN', speaker: '黑风寨逃寇·赖三', text: '小娃娃，看你细皮嫩肉，识相的交出盘缠，滚出这破庙！' },
      ...kin(2, {
        jiangmen: '稳住下盘，别跟他拼刀！',
        yujia: '打他下盘！这种货色，一绊就倒。',
        xinglin: '他刀上有锈，划破了要发烧——别让他碰着你。',
        xuanmen: '心静。看他的肩，肩一动，刀就来了。',
      }),
      { at: 'WIN', speaker: '黑风寨逃寇·赖三', text: '好汉饶命！小的有眼无珠！' },
      { at: 'LOSE', speaker: '黑风寨逃寇·赖三', text: '毛还没长齐，也学人走江湖？' },
    ],
    after: [{ text: '你侧身让过劈面一刀，一掌击中他小腹。赖三抱着肚子缩在墙角，把劫来的碎银全倒了出来：「好汉要找人？嘉兴醉仙楼这几天可热闹了，七个怪人跟一个道士天天在楼上斗酒，满城都在传。」' }],
    hook: '醉仙楼上斗酒的，是什么人？',
    recap: '荒山练手，赶跑草贼赖三，听说醉仙楼来了七个怪人。',
    rumor: '荒山上劫道的赖三被人打跑了，下山一路嚷嚷：醉仙楼来了七个怪人，还有个不要命的年轻人在打听他们。',
  },
  // 第 4 回
  '02': {
    scene: 'jiaxing-spring',
    before: [{ text: '郭靖非拉你下楼喝酒，说楼上斗酒的都是他师父，楼下才喝得痛快。\n酒刚满上，一个敞着怀的汉子踹翻了邻桌，青铜分水刺往桌上一插，斜眼打量着你们俩。' }],
    lines: [
      { at: 'OPEN', speaker: '恶虎镖局弃徒·焦大亨', text: '哪来的叫花雏儿，也配在醉仙楼吃酒？识相的磕三个响头，滚出去！' },
      { at: 'WIN', speaker: '恶虎镖局弃徒·焦大亨', text: '好汉饶命！这顿酒……小的请了！' },
      { at: 'LOSE', speaker: '恶虎镖局弃徒·焦大亨', text: '乡下雏儿，也敢在嘉兴撒野？' },
    ],
    after: [{ text: '你趁他酒气上涌，一脚踹碎酒坛，碎陶片划破他膝盖，焦大亨跪地求饶。\n柯镇恶在楼梯口听完了全程，铁杖一顿：「小子，替我跑一趟城外法华寺，把这封信交给焦木大师。寺里和尚的棍子使得不坏，别把人打坏了。」' }],
    hook: '一封信，送往城外法华寺。',
    recap: '醉仙楼下教训恶霸焦大亨，柯镇恶托你往法华寺送信。',
    rumor: '恶虎镖局那个焦大亨在醉仙楼跪地求饶，那天楼下的酒钱，全是他付的。',
  },
  // 第 5 回：焦木赠《百草图》由随后的剧情卡（features.ts 的 MAPS）演
  '03': {
    before: [{ text: '法华寺在城外山坳里，晨钟刚歇。你揣着柯镇恶的信叩开山门，知客僧了妄一眼瞥见你腰间的剑，横过长棍拦在门口。' }],
    lines: [
      { at: 'OPEN', speaker: '法华寺知客·了妄和尚', text: '阿弥陀佛，施主身带兵刃杀气腾腾，且留步受贫僧一棍禅机！' },
      { at: 'WIN', speaker: '法华寺知客·了妄和尚', text: '阿弥陀佛……施主手下留情！' },
      { at: 'LOSE', speaker: '法华寺知客·了妄和尚', text: '佛门清净地，施主请回。' },
    ],
    after: [{ text: '长棍应声落地，了妄还要再争，后堂传来一声「住手」。焦木大师拆开柯镇恶的信，看罢长叹：「柯大侠问的事，确有其事。城外荒山近来夜夜鬼哭，已有三个樵夫没回来。」' }],
    hook: '荒山夜哭，樵夫失踪。回醉仙楼报信。',
    recap: '法华寺与了妄不打不相识，焦木大师说荒山夜夜鬼哭。',
    rumor: '法华寺的了妄和尚手腕肿了三天，逢人就说：那位施主下手有分寸，是个好人。',
  },
  // 第 6 回
  '04': {
    scene: 'jiaxing-spring',
    before: [{ text: '你把焦木的话带回醉仙楼，七怪的笑声一下子停了。柯镇恶铁杖重重一顿：「骷髅、鬼哭……是黑风双煞。」\n他转向你：「今夜我们上荒山。你要跟着，先接老瞎子几杖。」' }],
    lines: [
      { at: 'OPEN', speaker: '飞天蝙蝠·柯镇恶', text: '接老瞎子这一招『狂风扫叶』！接不住，今夜就别跟来！' },
      ...kin(2, {
        jiangmen: '这是真正的练家子。打完了，要好好谢他。',
        yujia: '瞎子耳朵灵，脚步放轻些！',
        xinglin: '毒菱！别用手去接——中了也别慌，我带着解药。',
        xuanmen: '他听声辨位。屏住气，让他听不见你。',
      }),
      { at: 'WIN', speaker: '飞天蝙蝠·柯镇恶', text: '好后生！七怪认你这个朋友！' },
      { at: 'LOSE', speaker: '飞天蝙蝠·柯镇恶', text: '脚下还虚，再练练。' },
    ],
    after: [{ text: '铁杖破风擦耳而过，你俯身滑步，杖头点空，击碎一块青石板。\n柯镇恶收杖，脸上头一回有了笑意：「好！子时，荒山见。」' }],
    hook: '子时，荒山。',
    recap: '接下柯镇恶的伏魔杖，七怪许你同上荒山。',
    rumor: '柯大侠的伏魔杖，嘉兴城里能接得住的年轻人，满打满算只有一个，叫{name}。',
  },
  // 第 8 回
  '05': {
    scene: 'damo',
    before: [{ text: '铜尸的血迹一路往北。你随柯镇恶、郭靖出了关，眼前是望不到头的草原。\n郭靖落在后头饮马，一支响箭「嗖」地钉在你脚边——远处一骑张弓搭箭，把你当成了金国的奸细。' }],
    lines: [
      { at: 'OPEN', speaker: '哲别麾下·帖木儿', text: '南方的羊羔，也敢踏入成吉思汗的草场？且看草原苍鹰的利箭！' },
      ...kin(2, {
        jiangmen: '骑射手离得越远越凶，贴上去打！',
        yujia: '草原上没处躲，那就离他近点！',
        xinglin: '箭上没毒，是个好箭手——别伤他性命。',
        xuanmen: '风从西边来，他的箭会偏右。',
      }),
      { at: 'WIN', speaker: '哲别麾下·帖木儿', text: '你……不是金狗？' },
      { at: 'LOSE', speaker: '哲别麾下·帖木儿', text: '金狗，滚回你的南边去！' },
    ],
    after: [{ text: '羽箭擦着脸颊带出一道血痕，你钻到马腹下，一掌击碎马鞍，帖木儿跌进黄沙。郭靖这才赶到，用蒙古话喊了几句，他红着脸收了弓——原来是哲别的部下。\n他往西一指：「那座秃山崖上摆着骷髅头，牧民都绕着走。」' }],
    hook: '西边那座崖上摆着骷髅头的秃山。',
    recap: '追铜尸出关，与哲别的部下帖木儿不打不相识，问出骷髅秃山。',
    rumor: '草原上传开了：哲别的斥候让一个南边来的年轻人一掌打下了马，后来两人倒成了朋友。',
  },
  // 第 9 回
  '06': {
    scene: 'damo',
    before: [{ text: '秃山脚下，九颗骷髅头在崖壁上摆成一排，眼窝里插着燃尽的香。\n山口蹲着个灰袍人，十指又长又白，正拿指甲刮着一块头骨。' }],
    lines: [
      { at: 'OPEN', speaker: '白驼山盗墓使·阴陵客', text: '桀桀桀……这荒山绝壁上的九个骷髅头，正好差阁下一颗新鲜顶骨！' },
      { at: 'WIN', speaker: '白驼山盗墓使·阴陵客', text: '双煞……不会放过你的……' },
      { at: 'LOSE', speaker: '白驼山盗墓使·阴陵客', text: '又一颗顶骨，桀桀……' },
    ],
    after: [{ text: '幽暗鬼火里，他的白骨爪抓破你的衣襟。你运一口纯阳气反震，震断他三根指骨。\n阴陵客滚下山坡，一路尖笑：「骷髅摆的是阵，铜尸就在阵眼上等你！」' }],
    hook: '九颗骷髅摆成的阵眼上，铜尸在等。',
    recap: '闯过骷髅山口，打退铜尸的爪牙阴陵客。',
    rumor: '塞外那座摆满骷髅头的秃山，牧民都绕着走——前几天，有人从山口闯了进去。',
  },
  // 第 10 回 · 陈玄风【下】，第一章完
  '07': {
    scene: 'damo',
    before: [
      { text: '绝壁上那九颗骷髅头，摆成了一个阵。\n柯镇恶铁杖点地，侧耳听了半晌：「山顶有人在吐纳，气又长又沉，是铜尸。他肩上的伤还没好。」' },
      { text: '山顶平台上，陈玄风赤着上身盘膝而坐，月光照在他身上，泛出青铜一样的光。\n他睁开眼，盯着你手里那柄匕首，一字一顿：「就是你们，害瞎了她。」' },
    ],
    lines: [
      // 按「荒山遗落的匕首」的选择换开场
      { at: 'OPEN', speaker: '铜尸·陈玄风', text: '你救了她？……那也得死！', when: { choice: ['huangshan_bishou', 'B'] } },
      { at: 'OPEN', speaker: '铜尸·陈玄风', text: '她怀里的经文……是你拿的！纳命来！', when: { choice: ['huangshan_bishou', 'A'] } },
      { at: 'OPEN', speaker: '铜尸·陈玄风', text: '贼婆娘瞎了眼，老子便将你们这群江南走狗一个个剥皮抽筋！纳命来！' },
      ...kin(3, {
        jiangmen: '再撑两回合！他换气的时候，就是破绽！',
        yujia: '这铜皮硬得很，留着力气，等他露出肚子！',
        xinglin: '他气息乱了，再过两招必露破绽。',
        xuanmen: '前四招最狠，熬过去。',
      }),
      // 罩门机制认「靖」字匕首（trialStages 第 07 关 weakSpot），台词就落在机制上
      { at: 'ROUND', round: 5, speaker: '柯镇恶', text: '罩门露了！用那柄匕首！' },
      { at: 'WIN', speaker: '铜尸·陈玄风', text: '贼婆娘……' },
      { at: 'LOSE', speaker: '铜尸·陈玄风', text: '刀枪不入，你拿什么杀我？' },
    ],
    after: [
      { text: '柯镇恶毒菱破空，你手里的「靖」字匕首正中陈玄风肚脐。他仰天惨嚎，气破丹田，轰然倒地。' },
      { text: '郭靖摩挲着柄上那个「靖」字，半晌才说：「我娘说，这是一位道长送的。我爹是怎么死的，她从来不肯讲。」\n他把匕首推回你手里：「你先替我收着。」' },
    ],
    hook: '南下中都。匕首上的「靖」字，连着十八年前牛家村的一桩血案。',
    recap: '大漠荒山了结铜尸陈玄风，郭靖托你收好「靖」字匕首。',
    rumor: '铜尸陈玄风死在大漠荒山，肚脐上插着一柄刻「靖」字的匕首。出手的是江南七怪的朋友，一个叫{name}的年轻人。',
  },
  // ───────── 第二章 · 中都风云，二闯王府 ─────────
  // 第 11 回：鬼市腰牌由随后的剧情卡（features.ts 的 GHOST）演
  '08': {
    before: [{ text: '郭靖要去中都打听匕首的来历，你们一路南下，到了张家口。\n街口一个脏兮兮的小乞儿从赌坊里窜出来，怀里抱着一摞银子，身后追着两个提刀拿枪的汉子。小乞儿一头扎到你身后：「大哥救命！」' }],
    lines: [
      { at: 'OPEN', speaker: '断魂刀·沈青刚', text: '臭要饭的敢砸我家赌坊，今日连同你这小崽子一起剁了扔进冰河！' },
      { at: 'WIN', speaker: '断魂刀·沈青刚', text: '风紧，扯呼！' },
      { at: 'LOSE', speaker: '断魂刀·沈青刚', text: '小崽子，下辈子少管闲事！' },
    ],
    after: [{ text: '郭靖飞身一掌替你挡下长枪，你反手挑飞沈青刚的鬼头刀，四鬼丢盔弃甲地逃了。\n小乞儿拍手笑道：「他们的师父是赵王府的鬼门龙王沙通天，这下有热闹看了。」一眨眼，人就没了影。' }],
    hook: '中都城里，有人摆了比武招亲的擂台。',
    recap: '张家口外打跑黄河四鬼，救下一个古怪的小乞儿。',
  },
  // 第 12 回 · 完颜康【上】
  '09': {
    before: [{ text: '中都城西，一座擂台前万头攒动。旗上写着「比武招亲」，台上的红衣少女刀法利落，台下的老汉抱拳四顾。\n一个锦衣公子跃上台去，三招夺了少女的绣鞋，揣进怀里不肯还。' }],
    lines: [
      { at: 'OPEN', speaker: '赵王世子·完颜康', text: '哪来的乡野村夫，也敢管小王比武招亲的闲事？' },
      { at: 'WIN', speaker: '赵王世子·完颜康', text: '……今日之辱，小王记下了。' },
      { at: 'LOSE', speaker: '赵王世子·完颜康', text: '乡巴佬，也配上这擂台？' },
    ],
    after: [{ text: '绣鞋横飞，他暗藏的白骨爪劲被你一掌拍开，人狼狈摔下擂台。\n完颜康掸了掸锦袍，冷笑一声，在亲兵簇拥下拂袖而去——比武招亲的事，他一个字也不认。' }],
    hook: '小王爷吃了亏，岂肯罢休？',
    recap: '中都擂台把完颜康打下台，他不认账，拂袖而去。',
  },
  // 第 14 回
  '10': {
    before: [{ text: '杨铁心一刻也不肯再等。三更天，你陪他翻进赵王府外院，贴着墙根往后宅摸。\n假山后转出一个秃头无眉的汉子，肩扛铁桨，正是黄河四鬼的师父沙通天。' }],
    lines: [
      { at: 'OPEN', speaker: '鬼门龙王·沙通天', text: '敢伤我徒儿，今夜赵王府中便叫你死无葬身之地！' },
      { at: 'WIN', speaker: '鬼门龙王·沙通天', text: '来人……有刺客！' },
      { at: 'LOSE', speaker: '鬼门龙王·沙通天', text: '张家口的账，今夜一并算清！' },
    ],
    after: [{ text: '点钢桨擦地迸出火星，你一个鹞子翻身，踏着他的桨头借力飞渡，一脚踹中他面门。\n沙通天捂着脸大喊「有刺客」，王府里的灯一盏接一盏亮了起来。' }],
    hook: '王府惊动，校场上巡夜的人马正往这边来。',
    recap: '夜探赵王府，外院打退沙通天，惊动了王府。',
  },
  // 第 15 回
  '11': {
    before: [{ text: '你们抄近路穿过校场，正撞上巡夜的人马。领头的矮胖子双手各握一支镔铁判官笔，咧嘴一笑，露出满口黄牙。' }],
    lines: [
      { at: 'OPEN', speaker: '千手人屠·彭连虎', text: '老子铁笔判生死，你这条小命，阎王爷今夜收定了！' },
      { at: 'WIN', speaker: '千手人屠·彭连虎', text: '点子扎手，快叫梁老怪来！' },
      { at: 'LOSE', speaker: '千手人屠·彭连虎', text: '进了王府还想走？' },
    ],
    after: [{ text: '漫天透骨钉如雨落下，你踏壁横空，凌空一掌拍偏他的判官笔，震落了袖中的毒箭。\n杨铁心拉着你钻进后园：「往里走，王妃就住在后头！」' }],
    hook: '后园深处，有一间亮着灯的药房。',
    recap: '穿过王府校场，打退巡夜的彭连虎。',
  },
  // 第 16 回
  '12': {
    before: [{ text: '后园药房的门虚掩着，药香刺鼻。竹篓里盘着一条通体赤红的大蛇，昂起头冲你吐信。\n坛前坐着个红衣番僧，双掌赤红，睁眼便是一声狮子吼。' }],
    lines: [
      { at: 'OPEN', speaker: '密宗大师·灵智上人', text: '中原小辈，尝尝西藏密宗红教大手印的滋味！' },
      { at: 'WIN', speaker: '密宗大师·灵智上人', text: '大手印……竟被你破了！' },
      { at: 'LOSE', speaker: '密宗大师·灵智上人', text: '中原武人，不过如此。' },
    ],
    after: [{ text: '赤红的双掌劈来，一个道人抢进门替你硬接了一掌，正是全真教的王处一。你一剑削断番僧的念珠，灵智上人退进了内堂。\n王处一却脸色发青，掌心一片乌黑：「掌上有毒……解药在梁子翁的药房里。」' }],
    hook: '为了王道长的解药，得再闯一回王府。',
    recap: '误闯王府药房，王处一替你挡下灵智上人的毒掌。',
  },
  // 第 18 回 · 梁子翁【下】：台词按药蛇的抉择换
  '13': {
    before: [{ text: '你们刚冲到王府后墙，一道人影从屋脊上扑下来，白发倒竖，手中的追魂枪直指你心口——梁子翁追来了。' }],
    lines: [
      { at: 'OPEN', speaker: '长白参仙·梁子翁', text: '我二十年的宝蛇心血，竟让你们喝了！今日剥了你们的皮也难消我心头之恨！', when: { choice: ['shedu_baoxue', 'A'] } },
      { at: 'OPEN', speaker: '长白参仙·梁子翁', text: '我养了二十年的宝蛇，你说放就放了？！拿命来赔！', when: { choice: ['shedu_baoxue', 'B'] } },
      { at: 'OPEN', speaker: '长白参仙·梁子翁', text: '还我二十年宝蛇心血！今日剥了你们的皮、吸干你们的血也难消我心头之恨！' },
      { at: 'WIN', speaker: '长白参仙·梁子翁', text: '好……好！这笔账，老夫记下了！' },
      { at: 'LOSE', speaker: '长白参仙·梁子翁', text: '想走？没那么容易！' },
    ],
    after: [{ text: '黄蓉的软猬甲扎得他双掌鲜血淋漓，你趁机一掌印在他背心。梁子翁狂吐一口血，翻墙遁走。\n你们也翻出了高墙。墙外月色正好，王处一服下解药，长长出了一口气。' }],
    hook: '王处一要回终南山，邀你同去。',
    recap: '王府后墙打退追来的梁子翁，翻墙而出，王处一服下解药。',
  },

  // ───────── 第三章 · 太湖归云，碧海桃花 ─────────
  // 第 21 回
  '14': {
    before: [{ text: '洪七公刚走，松林里飘出一阵香风。一个白衣公子摇着折扇踱出来，身后跟着几个白衣女子，一双眼睛只盯着黄蓉。' }],
    lines: [
      { at: 'OPEN', speaker: '白驼山少主·欧阳克', text: '小娘子何必跟着这粗鄙汉子？随我去西域白驼山，岂不美哉？' },
      { at: 'WIN', speaker: '白驼山少主·欧阳克', text: '好，好得很。' },
      { at: 'LOSE', speaker: '白驼山少主·欧阳克', text: '就这点本事，也配护花？' },
    ],
    after: [{ text: '折扇「啪」地一展点向你面门，你反手削落他的扇骨，黄蓉的竹棒斜刺他膝盖，欧阳克纵身飘退。\n他摇着半截扇子笑：「过些日子，我叔叔要上桃花岛求亲。小娘子，咱们岛上见。」' }],
    hook: '去桃花岛，得先有一条能出海的船。',
    recap: '宝应松林逼退欧阳克，听说西毒要上桃花岛求亲。',
  },
  // 第 22 回
  '15': {
    before: [{ text: '太湖八百里烟波，湖上最大的船都泊在归云庄。你们的小船刚靠近水寨，一杆烂银枪就从芦苇里探了出来。' }],
    lines: [
      { at: 'OPEN', speaker: '归云庄大统领·陆冠英', text: '太湖八百里浩渺，归云庄不见无名之辈！且看陆某这杆烂银枪！' },
      { at: 'WIN', speaker: '归云庄大统领·陆冠英', text: '好功夫！贵客请庄内叙话！' },
      { at: 'LOSE', speaker: '归云庄大统领·陆冠英', text: '回去再练几年，再来太湖。' },
    ],
    after: [{ text: '枪出如蛟龙出水，你踏中水寨八卦方阵的逆位，一拳震偏枪尖。陆冠英掷枪抱拳，把你们迎进庄去。\n庄主陆乘风却愁眉不展：庄上来了一位「铁掌水上漂」，要他拱手让出归云庄。' }],
    hook: '归云庄正堂上，坐着一位「铁掌水上漂」。',
    recap: '太湖水寨与陆冠英不打不相识，进了归云庄。',
  },
  // 第 24 回 · 裘千丈【下】
  '16': {
    before: [{ text: '第二天一早，那老头又来了，还带了一群看热闹的江湖客。他当众托起一块青砖：「昨日老夫没睡醒。今天，让你们开开眼！」' }],
    lines: [
      { at: 'OPEN', speaker: '江湖招摇客·裘千丈', text: '老夫铁掌水上漂威名赫赫，你们这群后生小辈还不速速跪拜受降？！' },
      { at: 'WIN', speaker: '江湖招摇客·裘千丈', text: '好汉饶命！' },
      { at: 'LOSE', speaker: '江湖招摇客·裘千丈', text: '瞧见没有？这就是铁掌水上漂！' },
    ],
    after: [{ text: '你屈指弹出一颗石子，正中他掌中那块砖——砖是空的，面粉扬了他一头一脸。\n满堂哄笑里，他抱头求饶：「好汉饶命！我只是千仞的同胞大哥裘千丈！」' }],
    hook: '庄外芦苇荡里，有人在找陆乘风。',
    recap: '面粉砖露馅，假冒的「铁掌水上漂」原来是裘千丈。',
  },
  // 第 25 回：台词按「荒山遗落的匕首」的选择换
  '17': {
    before: [{ text: '夜里，庄外芦苇荡传来一阵阴风般的长啸。陆乘风一听就白了脸：「是梅师姐……她找来了。」\n月光下，一个披发的盲眼女人立在船头，十指如钩。' }],
    lines: [
      { at: 'OPEN', speaker: '铁尸·梅超风', text: '荒山上替我裹伤的，是你？……贼汉子死在你们手里，这笔账照样要算！', when: { choice: ['huangshan_bishou', 'B'] } },
      { at: 'OPEN', speaker: '铁尸·梅超风', text: '偷我经文的小贼，原来躲在这里！', when: { choice: ['huangshan_bishou', 'A'] } },
      { at: 'OPEN', speaker: '铁尸·梅超风', text: '贼汉子已死，老娘活在这世上唯有杀尽天下负心之人！拿命来！' },
      { at: 'WIN', speaker: '铁尸·梅超风', text: '这曲子……是师父的……' },
      { at: 'LOSE', speaker: '铁尸·梅超风', text: '瞎了眼，一样杀得了你！' },
    ],
    after: [{ text: '阴风扑面，五指险险抠进你的肩骨。黄蓉忽然吹起一支桃花岛的旧曲，梅超风浑身一震，泪流满面，收手伏地。\n她哑着嗓子说：「你们要去桃花岛？替我给师父磕个头。」' }],
    hook: '驾船出海，往东去桃花岛。',
    recap: '太湖芦苇荡遇梅超风，黄蓉一曲桃花岛旧调让她收了手。',
  },
  // 第 26 回：哑仆不会说话，对白按旁白插
  '18': {
    before: [{ text: '海船出了长江口，一路向东。第三天清晨，一艘巨舶横在前头，船头站着个铁塔似的汉子，肩扛一只生铁船锚。\n黄蓉低声道：「是我爹的哑仆。他们不会说话，也不会让路。」' }],
    lines: [
      { at: 'OPEN', text: '哑仆怒目圆睁，口中发出咿呀狂啸，挥动百斤生铁船锚当头砸落！' },
      { at: 'WIN', speaker: '黄蓉', text: '他服了。走，上岛！' },
      { at: 'LOSE', text: '巨锚砸裂了船舷，海船只得掉头。' },
    ],
    after: [{ text: '巨锚砸碎甲板，木屑横飞。郭靖托住锚链，你与黄蓉贴地滑行，双剑切断他背上的绑带，哑仆轰然跪倒，纳头称服。\n他调转船头，替你们引路。' }],
    hook: '桃花岛到了。岛上的路，会自己动。',
    recap: '东海上制服桃花岛的哑仆舵手，由他引路上岛。',
  },
  // 第 27 回：石阵没有人说话
  '19': {
    before: [{ text: '桃花岛上落英缤纷，走不到百步，来路就不见了。竹林倒转，乱石横飞，一具木人手持竹剑，从石阵深处呼啸而来。' }],
    lines: [
      { at: 'OPEN', text: '木人手持机关竹剑，暗合河图洛书方位，呼啸而来！' },
      { at: 'ROUND', round: 2, speaker: '黄蓉', text: '别看木人，看脚下的石头！' },
      { at: 'WIN', text: '中枢机括「咔」地一响，整片石阵停了下来。' },
      { at: 'LOSE', text: '石阵一转，你又回到了岛边。' },
    ],
    after: [{ text: '黄蓉娇声指点：「坎一坤二震三巽四，踏离九生门！」你一掌切断中枢的青铜机括，整片石阵应声平息。\n石阵尽头的桃林里，传出一缕箫声。' }],
    hook: '岛上来了客人：西毒带着侄儿登岛求亲。',
    recap: '黄蓉指点方位，闯过桃花岛的奇门石阵。',
  },
  // 第 30 回 · 周伯通【下】
  '20': {
    before: [{ text: '第二天天没亮，老顽童就蹲在你窗外：「好兄弟，昨天的不算，今天比新的！」\n他把你拽进洞里，左手画方，右手画圆，得意洋洋。' }],
    lines: [
      { at: 'OPEN', speaker: '老顽童·周伯通', text: '好兄弟！你若能破我这空明拳，我便教你世间最妙的神功！' },
      { at: 'WIN', speaker: '老顽童·周伯通', text: '妙极！妙极！' },
      { at: 'LOSE', speaker: '老顽童·周伯通', text: '破不了吧？再想想！' },
    ],
    after: [{ text: '他的拳力至虚至柔，像羽毛掠过水面。你心无杂念，闭目挥掌，正合「大成若缺」之理。\n周伯通拍手大叫：「妙极！好兄弟，空明拳你算是摸着门道了！」' }],
    hook: '该离岛了。黄药师却不肯让黄蓉走。',
    recap: '清音洞破了老顽童的空明拳，他拍手叫妙。',
  },
  // 第 31 回 · 黄药师【下】，第三章完
  '21': {
    before: [
      { text: '离岛那天，海边起了雾。黄药师立在礁石上，背对着你们：「蓉儿，留下。」\n黄蓉攥着你的衣袖，一步也没动。' },
      { text: '黄药师叹了口气，举起玉箫：「好。接得住这一曲，你们就走。」\n箫声一起，海浪都跟着涨了起来。' },
    ],
    lines: [
      { at: 'OPEN', speaker: '东邪·黄药师', text: '这碧海潮生之曲，且看你们有几分定力抵挡！' },
      // 第六回合考奇门背诵（trialStages 第 21 关 puzzle）
      { at: 'ROUND', round: 6, speaker: '黄蓉', text: '箫声里藏着方位，跟着我念！' },
      { at: 'WIN', text: '一曲终了，海面渐渐平了。' },
      { at: 'LOSE', speaker: '东邪·黄药师', text: '定力不够。蓉儿，回家。' },
    ],
    after: [{ text: '箫声如狂澜怒涛。郭靖默诵口诀守住心神，你引内力与箫声相和，一剑挑在玉箫的气孔上，音律戛然而止。\n黄药师放下玉箫，望着女儿看了很久：「去吧。」' }],
    hook: '离岛的巨舶上，有人悄悄点了一把火。',
    recap: '碧海潮生曲中守住心神，黄药师放黄蓉随你们离岛。',
  },

  // ───────── 第四章 · 荒岛洪波，铁掌孤峰 ─────────
  // 第 32 回
  '22': {
    before: [{ text: '欧阳锋「好心」送你们一程。船行半日，底舱冒起黑烟，火舌顺着帆索往上窜。\n甲板缝里钻出成群的毒蛇，一个白衣蛇奴吹着竹哨，站在船头冷笑。' }],
    lines: [
      { at: 'OPEN', speaker: '白驼山驭蛇长老·蛇奴统领', text: '烈火焚舟，四海皆浪！白驼山的毒蛇会让你们连骨头都不剩！' },
      { at: 'WIN', speaker: '白驼山驭蛇长老·蛇奴统领', text: '主人……救我……' },
      { at: 'LOSE', speaker: '白驼山驭蛇长老·蛇奴统领', text: '下海喂鱼去吧！' },
    ],
    after: [{ text: '你抄起燃烧的火把，掌风卷着烈焰把漫天毒蛇扫落大海，蛇奴统领一脚踏空，葬身鱼腹。\n船却保不住了。你们抱着一块船板，漂上了一座荒岛。' }],
    hook: '荒岛上，西毒正等着。',
    recap: '火船上打退白驼蛇奴，抱着船板漂上荒岛。',
  },
  // 第 33 回 · 欧阳锋（压鬼岛）【上】
  '23': {
    before: [{ text: '这座荒岛叫压鬼岛。你们刚生起火，欧阳锋就从林子里走了出来，衣衫焦了一半，眼里全是血丝。\n他要黄蓉默出《九阴真经》，否则一个也别想活。' }],
    lines: [
      { at: 'OPEN', speaker: '西毒·欧阳锋', text: '好侄儿的腿断了，今日若不默出真经，老夫便将你们一个个沉尸这荒岛之下！' },
      { at: 'WIN', speaker: '西毒·欧阳锋', text: '区区巨石，也想压住老夫？' },
      { at: 'LOSE', speaker: '西毒·欧阳锋', text: '真经，拿来。' },
    ],
    after: [{ text: '欧阳锋挟山超海扑来，郭靖以空明拳虚接他三成力，你趁机一指点在他右肩大穴，崖上巨石崩塌，把他大半个身子压在了石下。\n没过一炷香，石堆里传出一声蛤蟆般的低鸣。' }],
    hook: '巨石压不住西毒。',
    recap: '压鬼岛上设计用巨石压住欧阳锋，他却以蛤蟆功脱困。',
  },
  // 第 35 回：曲三酒馆暗格在这一关（skillMastery 的 QUSAN_CACHE_STAGE）
  '24': {
    before: [{ text: '筏子漂回江南。你们躲进临安牛家村一间废弃的酒馆，在密室里给洪七公运功疗伤。\n第三天夜里，外头脚步杂乱，有人一脚踢开了酒馆的门。' }],
    lines: [
      { at: 'OPEN', speaker: '三头蛟·侯通海', text: '密室里的小崽子们滚出来！大金王爷有令，曲三酒馆内一只耗子也休想逃脱！' },
      { at: 'WIN', speaker: '三头蛟·侯通海', text: '我的瘤子！我的瘤子！' },
      { at: 'LOSE', speaker: '三头蛟·侯通海', text: '找到了，在这儿！' },
    ],
    after: [{ text: '你隔着木板暗格一剑刺出，正中他额角的肉瘤。侯通海杀猪般惨嚎着倒退，金兵斥候阵脚大乱，一哄而散。\n密室重归寂静，可墙外的脚步声，并没有走远。' }],
    hook: '有人摸进了酒馆，听墙根的不止你一个。',
    recap: '牛家村密室里打退侯通海与金兵斥候。',
  },
  // 第 37 回
  '25': {
    scene: 'heizhao',
    before: [{ text: '一灯大师隐居湘西，要去先得穿过一片黑沼。泥潭边有间茅屋，一个白发女人坐在门口，面前摊着一张写满算筹的九宫图。\n她头也不抬：「过路的，先把这道题算出来。」' }],
    lines: [
      { at: 'OPEN', speaker: '神算子·刘瑛姑', text: '二四为肩，六八为足，左三右七，戴九履一！算不出九宫之数，休想借道过我黑沼泥潭！' },
      { at: 'WIN', speaker: '神算子·刘瑛姑', text: '世间竟真有如此聪慧之人……' },
      { at: 'LOSE', speaker: '神算子·刘瑛姑', text: '算不出来，就在泥潭里待着吧。' },
    ],
    after: [{ text: '黄蓉脱口解开九宫图，你踏着泥沼里的木桩滑步切入，一记擒拿扣住她的手腕。\n瑛姑听说你们和铁掌帮结了仇，眼里忽然烧起一团火：「裘千仞……上铁掌峰，走后山小路。」' }],
    hook: '铁掌峰，裘千仞的山门。',
    recap: '黑沼算题服了瑛姑，她指给你上铁掌峰的路。',
  },
  // 第 38 回 · 裘千仞【上】
  '26': {
    before: [{ text: '铁掌峰下五座山峰，形如五指。你们刚过山门，一块三尺见方的花岗岩就在面前炸成了碎片。\n山道尽头，一个黄衫老者收回乌黑的手掌：「黄毛丫头也敢闯我铁掌峰？」' }],
    lines: [
      { at: 'OPEN', speaker: '铁掌水上漂·裘千仞', text: '受老夫一记铁掌开山！' },
      { at: 'WIN', speaker: '铁掌水上漂·裘千仞', text: '后山禁地，有种就追来！' },
      { at: 'LOSE', speaker: '铁掌水上漂·裘千仞', text: '铁掌帮的山门，不是谁都进得来。' },
    ],
    after: [{ text: '一掌击碎岩石，碎石如刀。郭靖以降龙掌硬接，震退半步；你趁隙一剑刺他肩井，裘千仞右臂一麻，踉跄着退进了后山。\n后山是铁掌帮的禁地，据说《武穆遗书》就藏在峰顶。' }],
    hook: '追进后山禁地。',
    recap: '铁掌峰山门逼退裘千仞，他遁入后山禁地。',
  },

  // ───────── 第五章 · 大漠金刀，华山论剑 ─────────
  // 第 40 回
  '27': {
    scene: 'damo',
    before: [{ text: '一灯大师治好了洪七公，你辞别南方，一路北上，在西征大军里找到了郭靖。\n撒麻尔罕城高池深，攻了半月不下。城门前，一员铁甲大将横刀立马。' }],
    lines: [
      { at: 'OPEN', speaker: '花剌子模重甲亲军帅·忽鲁忽', text: '撒麻尔罕是坚不可摧的雄城！东方蛮人休想踏破城门半步！' },
      { at: 'WIN', speaker: '花剌子模重甲亲军帅·忽鲁忽', text: '……城破了。' },
      { at: 'LOSE', speaker: '花剌子模重甲亲军帅·忽鲁忽', text: '再来一千次，城门也不会开！' },
    ],
    after: [{ text: '郭靖以巨木冻冰为道，奇兵从城后杀出。你飞身攀上城楼，一剑挑落敌帅的头盔，铁甲千户掷刀跪降。\n撒麻尔罕的城门，开了。' }],
    hook: '城头上，有两个本不该在这里的人。',
    recap: '大漠西征，城楼上挑落敌帅头盔，撒麻尔罕城破。',
  },
  // 第 42 回：全真七子误认黄药师是凶手
  '28': {
    scene: 'jiaxing-spring',
    before: [{ text: '八月十五，你回到嘉兴，才听说江南五怪死在了桃花岛，周伯通也下落不明——人人都说是黄药师下的手。\n烟雨楼前，全真七子已布下天罡北斗阵，黄药师就在楼上。' }],
    lines: [
      { at: 'OPEN', speaker: '长春子·丘处机', text: '黄药师杀我师叔，天地不容！今日烟雨楼前，全真七子与尔等邪魔外道决一死战！' },
      { at: 'WIN', speaker: '长春子·丘处机', text: '……这阵，竟被你破了。' },
      { at: 'LOSE', speaker: '长春子·丘处机', text: '让开！今日不关你的事！' },
    ],
    after: [{ text: '七剑如星斗连珠，寒光照彻南湖。你踏着九宫逆位抢入天枢，以空明掌力格开丘处机的长剑，大阵气机登时瓦解。\n黄蓉站上楼栏：「要知道真凶是谁，去铁枪庙！」' }],
    hook: '铁枪庙里，真相要见光了。',
    recap: '烟雨楼前破了全真七子的天罡北斗阵。',
  },
  // 第 44 回
  '29': {
    before: [{ text: '庙门「轰」地关上，门外火把连成一片。完颜洪烈披着斗篷走进来，身后是一排身缚炸药的死士。\n杨康站在他身边，脸色青白，指尖已经发黑。' }],
    lines: [
      { at: 'OPEN', speaker: '大金六王爷·完颜洪烈', text: '大金江山毁于一旦，本王得不到包惜弱，也绝不让你们这群宋人活着走出铁枪庙！' },
      { at: 'WIN', speaker: '大金六王爷·完颜洪烈', text: '康儿……' },
      { at: 'LOSE', speaker: '大金六王爷·完颜洪烈', text: '点火！' },
    ],
    after: [{ text: '铁枪庙里群鸦惊飞。杨康毒发，发狂般扑向墙上那杆铁枪，死在了铁枪之下；你挺剑刺穿了死士头领的咽喉。\n完颜洪烈瘫坐在神龛前，万念俱灰。' }],
    hook: '华山论剑的日子到了。',
    recap: '铁枪庙里杨康毒发身死，完颜洪烈万念俱灰。',
  },
  // 第 46 回 · 欧阳锋（华山）【下】，《射雕》一卷完；「射雕·天下第一」在这一关发
  '30': {
    before: [
      { text: '半夜，绝顶上的篝火只剩一点余烬。雪地里又响起那阵狂笑，越来越近——欧阳锋回来了，双手撑地，倒立着走上论剑台。' },
      { text: '他的眼睛红得像要滴血，口中反反复复只有一句：「我是谁？天下第一是谁？」\n洪七公、黄药师都受了伤。站着的，只剩你、郭靖和黄蓉。' },
    ],
    lines: [
      { at: 'OPEN', speaker: '疯魔西毒·欧阳锋', text: '我是谁？！欧阳锋是谁？！天下第一是谁？！你们这群蝼蚁，统统都要死在老夫掌下！' },
      { at: 'ENRAGE', speaker: '黄蓉', text: '欧阳锋，你身后那人武功比你还高！' },
      { at: 'WIN', speaker: '疯魔西毒·欧阳锋', text: '我是……谁……' },
      { at: 'LOSE', speaker: '疯魔西毒·欧阳锋', text: '天下第一！是我！' },
    ],
    after: [
      { text: '他回头与自己的影子疯狂斗打。你与郭靖、黄蓉三人合力，刚柔并济，一掌印在他背心天宗穴。西毒怪叫一声，手舞足蹈，狂笑着跃下了华山绝顶的雪线。' },
      { text: '天亮了，风雪初霁。五绝俯首，谁也没有说话——「射雕·天下第一」，从此是你的名号。\n后来襄阳城里立起一尊像，就是你今天的样子。《射雕》一卷，至此圆满。' },
    ],
    recap: '华山绝顶了结西毒，获「射雕·天下第一」，《射雕》一卷完。',
  },
}

/** 一回的剧情；主线节点按当前模式的节点表取（联机首通文字与试玩略有不同） */
export function stageScript(key: StageKey, nodes: readonly StoryNodeConfig[]): StageScript | undefined {
  const code = key.slice(1)
  if (key.startsWith('T')) return TRIAL_SCRIPTS[code]
  const node = nodes.find((n) => n.code === code)
  return node && storyNodeScript(node)
}

// ==================== 阵中对白 ====================
export const STAGE_LINE_SOURCE = 'stage_script'

/** 插句时判断条件用的角色状态 */
export type StageLineContext = Pick<PlayerDTO, 'origin' | 'storyAdventureChoices' | 'storySnakeChoice'> & { flags: readonly string[] }

function lineApplies(line: ScriptLine, report: BattleReportDTO, ctx: StageLineContext) {
  const when = line.when
  if (!when) return true
  if (when.flag && !ctx.flags.includes(when.flag)) return false
  if (when.origin && ctx.origin !== when.origin) return false
  if (when.companion && !report.units.some((unit) => unit.slot.startsWith('ALLY') && unit.id === when.companion)) return false
  if (when.choice) {
    const [adventureId, key] = when.choice
    const chosen = adventureId === STORY_SNAKE_ADVENTURE.id ? ctx.storySnakeChoice : ctx.storyAdventureChoices?.[adventureId]
    if (chosen !== key) return false
  }
  return true
}

/** 插在哪条战报之前；undefined 表示这场打不到这一时点 */
function insertAt(events: readonly BattleEventDTO[], line: ScriptLine, report: BattleReportDTO) {
  const won = report.winner === (report.perspective ?? 'ALLY')
  switch (line.at) {
    case 'OPEN':
      return events.findIndex((event) => event.type === 'STANCE_CLASH') + 1
    case 'ROUND': {
      const start = events.findIndex((event) => event.round >= (line.round ?? 1))
      if (start < 0 || events[start].round !== line.round) return
      // 跟在本回合开头的机制提示（如「露出罩门」）后面
      let at = start
      while (at < events.length && events[at].round === line.round && events[at].type === 'EFFECT') at++
      return at
    }
    case 'ENRAGE': {
      const at = events.findIndex((event) => event.type === 'BOSS_ENRAGE')
      return at < 0 ? undefined : at + 1
    }
    case 'WIN': {
      if (!won) return
      // 落在最后一击之后、结算叙事之前
      let last = events.length
      while (last > 0 && !events[last - 1].hpDelta) last--
      return last || events.length
    }
    case 'LOSE':
      return won || report.retreated ? undefined : events.length
  }
}

function lineEvent(line: ScriptLine, report: BattleReportDTO, round: number): BattleEventDTO {
  const unit = line.speaker ? report.units.find((u) => u.name === line.speaker) : undefined
  const isAlly = !unit?.slot.startsWith('ENEMY')
  const segments: RichSegment[] = line.speaker
    ? [{ type: 'actor', name: line.speaker, isAlly }, { type: 'text', text: `：「${line.text}」` }]
    : [{ type: 'text', text: line.text }]
  return {
    round, type: 'EFFECT', actorSlot: unit?.slot ?? (isAlly ? 'ALLY_MAIN' : 'ENEMY_MAIN'),
    effectSourceId: STAGE_LINE_SOURCE, segments,
  }
}

/** 回放前把对白插进战报，联机战报一样插，服务端不用改 */
export function addStageLines(report: BattleReportDTO, lines: readonly ScriptLine[], ctx: StageLineContext) {
  const picked = new Map<string, ScriptLine>()
  for (const line of lines) {
    const slot = `${line.at}:${line.round ?? ''}`
    if (!picked.has(slot) && lineApplies(line, report, ctx)) picked.set(slot, line)
  }
  const original = report.events
  const inserts = [...picked.values()].flatMap((line) => {
    const at = insertAt(original, line, report)
    if (at === undefined) return []
    // 回合句记在它自己的回合上；其余跟着前一条战报
    const round = line.at === 'ROUND' ? line.round ?? 1 : original[Math.max(0, at - 1)]?.round ?? 1
    return [{ at, event: lineEvent(line, report, round) }]
  })
  if (!inserts.length) return
  const events: BattleEventDTO[] = []
  original.forEach((event, index) => {
    for (const insert of inserts) if (insert.at === index) events.push(insert.event)
    events.push(event)
  })
  for (const insert of inserts) if (insert.at >= original.length) events.push(insert.event)
  report.events = events
}
