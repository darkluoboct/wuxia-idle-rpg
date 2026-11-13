import type { simulateServerBattle } from './battle.ts'
import { CHEN_XUANFENG_STORY, HUANG_YAOSHI_COMBAT, IRON_PALM_WOUND, LIANG_ZIWENG_COMBAT, OUYANG_FENG_FRENZY, OUYANG_FENG_ISLAND_COMBAT, PENG_LIANHU_TEMPLE_COMBAT, QIU_QIANREN_COMBAT, QIU_QIANZHANG_COMBAT, SHA_TONGTIAN_COMBAT, SHEN_QINGGANG_COMBAT, TANCHUDUAN_COMBAT, WANYAN_KANG_COMBAT, WU_QINGLIE_COMBAT, ZHAO_MANOR_GUARD, type BattleEnemyGuard, type EnemyCombatConfig } from './combatMeta.ts'
import type { BattleReportDTO, CombatUnitDTO, StanceType } from './protocol.ts'
import { canChooseStorySnake, STORY_SNAKE_ADVENTURE, storyEncounter } from './storySnake.ts'

/**
 * 第一卷《射雕英雄传》剧情数据（对应第 03 册 §2.1）：
 *   · STORY_ARCS      五章回目
 *   · STORY_CHAPTERS  16 个主线节点（每个节点一场战斗 + 首通叙事奖励）
 *   · ADVENTURES      试玩与联机共用的支线 / 奇遇
 */

export type StatKey = 'str' | 'con' | 'agi' | 'intStat' | 'luck' | 'karma'
export const STAT_LABEL: Record<StatKey, string> = {
  str: '臂力',
  con: '根骨',
  agi: '身法',
  intStat: '悟性',
  luck: '福缘',
  karma: '侠义',
}

/** 一次性奖励/效果包：首通剧情与奇遇选项共用 */
export interface Reward {
  tag: string
  tone: 'gold' | 'red' | 'jade' | 'purple'
  text: string
  stats?: Partial<Record<StatKey, number>>
  bonusHpPct?: number                 // 永久气血上限加成(%)
  qiExp?: number
  silver?: number
  pills?: number                      // 纯阳·通脉破障丹
  skills?: string[]                   // 习得(已会则保持原重数)
  skillBoost?: Record<string, number> // 参悟重数 +N（未习得则从 N 重起）
  items?: string[]
  affinity?: Record<string, number>   // 伙伴好感 +N，同时视为已结识
  flags?: string[]                    // 剧情标记，供门派门槛等引用
}

export interface AdventureCtx {
  stats: Record<StatKey, number>
  isWanderer: boolean
  flags: string[]
  items: string[]
  silver: number
}

export interface AdventureChoice {
  key: 'A' | 'B'
  label: string
  requirementText?: string
  require?: (ctx: AdventureCtx) => boolean
  costSilver?: number
  battle?: AdventureBattle | { nodeId: number; surviveRounds: number }
  reward: Reward | ((ctx: AdventureCtx) => Reward)
}

export type AdventureBattle = Pick<Parameters<typeof simulateServerBattle>[0], 'enemyMain' | 'enemyGuards' | 'escortAllies' | 'surviveRounds'>

export interface AdventureConfig {
  id: string
  title: string
  location: string
  description: string
  /** 该主线节点首通之后才会出现；0 表示随时 */
  afterNodeId: number
  choices: [AdventureChoice, AdventureChoice]
}

export interface StoryArc {
  chapter: number
  title: string
  tagline: string
  summary: string
}

export interface StoryNodeConfig {
  id: number
  chapter: number
  volume: string
  code: string
  title: string
  recLevel: number
  isBoss?: boolean
  bossName: string
  bossTitle: string
  bossPortrait: CombatUnitDTO['portraitStyle']
  bossHp: number
  bossAtk: number
  bossStance: StanceType
  bossCombat?: EnemyCombatConfig
  guards?: BattleEnemyGuard[]
  mechanicTip: string
  intro: string
  rewardQi: number
  rewardSilver: number
  dropItemIds?: string[]
  dropSkillIds?: string[]
  /** 首次通关触发的叙事与奖励（每个节点只结算一次） */
  firstClear: Reward
}

export const STORY_ARCS: StoryArc[] = [
  { chapter: 1, title: '风雪惊变，烟雨初逢', tagline: '新手入世 · Lv.1~15', summary: '嘉兴破庙得忘机客遗物，醉仙楼头识郭靖、柯镇恶，荒山夜战黑风双煞。' },
  { chapter: 2, title: '王府夜宴，全真问道', tagline: '江湖崭露 · Lv.16~30', summary: '比武招亲识穆念慈，夜探赵王府，终南金雁揭开牛家村旧案。' },
  { chapter: 3, title: '太湖归云，碧海桃花', tagline: '名扬天下 · Lv.31~45', summary: '松林逢北丐，归云庄识破假裘千丈，桃花岛三试东邪，清音洞结识老顽童。' },
  { chapter: 4, title: '荒岛洪波，铁掌孤峰', tagline: '宗师之境 · Lv.46~60', summary: '压鬼岛两败俱伤，牛家密室听《九阴》梵文，铁掌峰顶会南帝一灯。' },
  { chapter: 5, title: '大漠金刀，华山论剑', tagline: '第一卷终章 · Lv.61~75', summary: '铁骑西征，烟雨楼揭穿阴谋，华山绝巅击败逆练九阴的西毒，夺天下第一。' },
]

export const STORY_CHAPTERS: StoryNodeConfig[] = [
  // ───────────────────────── 第一章 ─────────────────────────
  {
    id: 1, chapter: 1, volume: '第一卷·射雕篇', code: '1-1', title: '荒庙残卷 · 嘉兴破庙', recLevel: 1,
    bossName: '金国密探·黑衣刺客', bossTitle: '追杀忘机客', bossPortrait: 'bandit', bossHp: 1300, bossAtk: 110, bossStance: 'AGILE',
    bossCombat: { faction: 'JIN', alignment: 'HERETIC', karma: -20, weapon: { form: 'BLADE', tier: 'green' } },
    mechanicTip: '刺客身法诡谲，摆【刚猛强攻势】可克制奇门变招，抢先压制！',
    intro: '烟雨濛濛，你在嘉兴城外一座破庙避雨，神龛后竟躺着一名身中数刀的神秘客。庙外脚步杂沓，数名黑衣人持刀追入，厉声喝问：“东西交出来！”',
    rewardQi: 900, rewardSilver: 250,
    firstClear: {
      tag: '残卷入怀', tone: 'gold', qiExp: 800, items: ['iron_bagua'], skills: ['kaishan_zhang'],
      text: '黑衣人落荒而逃。忘机客气息奄奄，将一册《武库残卷》与刻着桃花暗记的铁八卦塞入你掌心，又以掌力渡入真气——你任督二脉的初脉，竟在这一刻悄然贯通；残卷首页那一路开山掌法，你竟也看懂了。',
    },
  },
  {
    id: 2, chapter: 1, volume: '第一卷·射雕篇', code: '1-2', title: '醉仙楼头 · 烟雨试招', recLevel: 3,
    bossName: '全真弟子·赵志敬', bossTitle: '丘处机门下', bossPortrait: 'daoist', bossHp: 2000, bossAtk: 160, bossStance: 'TAICHI',
    bossCombat: { alignment: 'RIGHTEOUS', weapon: { form: 'BLADE', tier: 'blue' } },
    mechanicTip: '赵志敬剑走中正、擅以柔化刚，摆【奇门极速势】可克制太极圆转。',
    intro: '你循铁八卦的线索进了嘉兴城。醉仙楼上，江南七怪与全真丘处机正以酒碗较量内力，一个憨厚少年在旁看得出神。丘处机门下的赵志敬见你气度不凡，起身拱手：“这位朋友，可愿赐教？”',
    rewardQi: 1500, rewardSilver: 450, dropItemIds: ['qimei_stick'],
    firstClear: {
      tag: '醉仙结缘', tone: 'jade', affinity: { guojing: 120, kezhene: 120 },
      text: '一战罢，憨厚少年郭靖拍手叫好，非要拉你入座喝酒；目不能视的柯镇恶循声而至，沉声称许你“步法稳当”。你在这座酒楼上，结识了江湖里第一批朋友。',
    },
  },
  {
    id: 3, chapter: 1, volume: '第一卷·射雕篇', code: '1-3', title: '荒山夜哭 · 铜尸陈玄风', recLevel: 5, isBoss: true,
    bossName: '铜尸·陈玄风', bossTitle: '黑风双煞', bossPortrait: 'chenxuanfeng', bossHp: 3600, bossAtk: 260, bossStance: 'FIERCE',
    bossCombat: CHEN_XUANFENG_STORY,
    mechanicTip: '横练铁布衫护体，可用太极克制。第三回合露出肚脐罩门，护体防御暂时归零。',
    intro: '夜宿嘉兴郊外荒山，忽闻鬼哭般的啸声。月光下，铜尸陈玄风与铁尸梅超风正用骷髅头练功，江南七怪陷入苦战。你拔剑加入战团。',
    rewardQi: 2400, rewardSilver: 800, dropItemIds: ['xuantie_dagger', 'fumo_staff'],
    firstClear: {
      tag: '荒山断魂', tone: 'red', qiExp: 1200,
      text: '陈玄风毙命，梅超风仰天惨呼，双目血流，失足坠入荒崖。山风呜咽，崖边遗落一柄匕首与半卷人皮——这一刻你的选择，将决定她的生死。',
    },
  },

  // ───────────────────────── 第二章 ─────────────────────────
  {
    id: 4, chapter: 2, volume: '第一卷·射雕篇', code: '2-1', title: '比武招亲 · 小王爷完颜康', recLevel: 16,
    bossName: '小王爷·完颜康', bossTitle: '金国赵王府世子', bossPortrait: 'wanyankang', bossHp: 7000, bossAtk: 410, bossStance: 'TAICHI',
    bossCombat: { ...WANYAN_KANG_COMBAT, crit: undefined, rageSkillId: 'quanzhen_jianfa' },
    mechanicTip: '完颜康攒怒后使全真剑法，奇门极速势可克制其太极圆转。',
    intro: '中都北京，一座比武招亲的擂台前万头攒动。台上，“穆易”携女穆念慈抱拳四顾；忽然一位锦衣公子——金国小王爷完颜康一跃而上，言笑晏晏间却招招阴狠。',
    rewardQi: 3600, rewardSilver: 1100,
    firstClear: {
      tag: '拔刀相助', tone: 'jade', affinity: { munianci: 120 }, flags: ['met_munianci'],
      text: '你拔刀相助，逼退完颜康。穆念慈红着脸收起柳叶刀，向你深深一福：“多谢恩公……念慈愿随恩公同行，以报相助之恩。”【穆念慈】已加入你的江湖行列。',
    },
  },
  {
    id: 5, chapter: 2, volume: '第一卷·射雕篇', code: '2-2', title: '赵王府夜宴 · 参仙梁子翁', recLevel: 20, isBoss: true,
    bossName: '参仙老怪·梁子翁', bossTitle: '长白山武学名宿', bossPortrait: 'zhoubotong', bossHp: 10500, bossAtk: 400, bossStance: 'AGILE',
    bossCombat: LIANG_ZIWENG_COMBAT,
    guards: [ZHAO_MANOR_GUARD],
    mechanicTip: '梁子翁善发子午透骨钉，刚猛强攻势可克制。灵智上人攒着一招大手印，刀剑可刺破其气门。',
    intro: '为救中毒的江湖义士，你与郭靖、黄蓉夜潜赵王府。药房里，梁子翁、彭连虎、沙通天、灵智上人齐聚一堂——一场恶斗，已是避无可避。',
    rewardQi: 5600, rewardSilver: 1800, dropSkillIds: ['jiuyin_baiguzhua'], dropItemIds: ['chansi_hufan'],
    firstClear: {
      tag: '夜闯王府', tone: 'gold', qiExp: 1800,
      text: '梁子翁与灵智上人败退，你携解药翻出高墙。身后王府火起，喊杀震天。',
    },
  },
  {
    id: 6, chapter: 2, volume: '第一卷·射雕篇', code: '2-3', title: '终南金雁 · 重阳问道', recLevel: 25,
    bossName: '长真子·谭处端', bossTitle: '全真七子试手', bossPortrait: 'daoist', bossHp: 11600, bossAtk: 600, bossStance: 'TAICHI',
    bossCombat: TANCHUDUAN_COMBAT,
    mechanicTip: '谭处端以全真吐纳功回内，攒满怒气后使同归剑法。可用奇门抢攻，或封穴阻断吐纳。',
    intro: '马钰、丘处机赶至终南山。丘处机命谭处端当场检验你的吐纳功夫：“既要听老道讲十八年前牛家村的旧事，先让贫道看看你的底子。”',
    rewardQi: 4800, rewardSilver: 1500, dropSkillIds: ['tonggui_jian'],
    firstClear: {
      tag: '牛家旧案', tone: 'purple', flags: ['niujiacun_truth'], qiExp: 1500,
      affinity: { mayu: 120, tanchuduan: 120, qiuchuji: 20, wangchuyi: 20 },
      text: '谭处端收剑称善。马钰以全真正宗心法指点你吐纳正途，丘处机则在松涛声中缓缓揭开了十八年前牛家村郭、杨两家的血案——你手中那柄玄铁匕首上的“靖”字，忽然沉甸甸的。',
    },
  },

  // ───────────────────────── 第三章 ─────────────────────────
  {
    id: 7, chapter: 3, volume: '第一卷·射雕篇', code: '3-1', title: '松林长啸 · 北丐洪七公', recLevel: 31,
    bossName: '北丐·洪七公', bossTitle: '九指神丐', bossPortrait: 'hongqigong', bossHp: 14600, bossAtk: 690, bossStance: 'FIERCE',
    mechanicTip: '洪七公掌法刚猛无俦，摆【太极柔化势】借力卸劲，克制刚猛强攻。',
    intro: '宝应城外松林深处，黄蓉烹出一桌“玉笛谁家听落梅”，馋得一位蓬头丐者坐地大嚼。酒足饭饱，他抹抹嘴：“小娃娃，让老叫化瞧瞧你的掌力。”',
    rewardQi: 7000, rewardSilver: 2200, dropSkillIds: ['huntian_qigong'],
    firstClear: {
      tag: '松林论掌', tone: 'gold', affinity: { hongqigong: 30 },
      text: '洪七公大笑拍腿：“好小子，不骄不躁，是块好料！”当场演示了降龙十八掌的几式刚猛掌法，掌风过处，松针如雨。',
    },
  },
  {
    id: 8, chapter: 3, volume: '第一卷·射雕篇', code: '3-2', title: '归云庄主 · 假裘千丈', recLevel: 34,
    bossName: '铁掌帮副帮主·裘千丈', bossTitle: '铁掌水上漂（冒牌货）', bossPortrait: 'qiuqianren', bossHp: 16900, bossAtk: 770, bossStance: 'AGILE',
    bossCombat: QIU_QIANZHANG_COMBAT,
    mechanicTip: '裘千丈专靠虚招唬人。一次实扣气血超过 500 点便能识破，让他的防御归零。',
    intro: '太湖归云庄主陆乘风被一位自称“铁掌水上漂”的裘千仞蒙骗，竟要拱手让出庄子。你看出这位“裘帮主”脚下虚浮，当场拆穿他的把戏。',
    rewardQi: 8200, rewardSilver: 2600,
    firstClear: {
      tag: '识破骗局', tone: 'jade', flags: ['guiyun_ship'], silver: 1500, affinity: { luchengfeng: 120 },
      text: '假裘千丈当场跪地求饶，陆乘风又惊又愧，为谢你仗义，将庄中一艘可远航的海船相赠——从此，通往东海桃花岛的航路向你敞开。',
    },
  },
  {
    id: 9, chapter: 3, volume: '第一卷·射雕篇', code: '3-3', title: '碧海桃花 · 东邪三道试题', recLevel: 38, isBoss: true,
    bossName: '东邪·黄药师（三成力）', bossTitle: '天下五绝·桃花岛主', bossPortrait: 'huangyaoshi', bossHp: 23400, bossAtk: 1030, bossStance: 'AGILE',
    bossCombat: HUANG_YAOSHI_COMBAT,
    mechanicTip: '奇门五转箫声惑神，携带【郭靖+黄蓉】激活靖蓉羁绊可大幅提高胜率！',
    intro: '海船泊岸，桃花岛烟霞万顷。西毒欧阳锋携侄儿欧阳克登岛求亲，东邪黄药师以“箫声抗衡、奇门背诵、拆招过关”三道试题考校天下英豪。轮到你时，黄药师淡淡一笑：“且让你看看我三成功力。”',
    rewardQi: 12000, rewardSilver: 3500, dropItemIds: ['biyu_xiao'],
    firstClear: {
      tag: '桃花三试', tone: 'gold', qiExp: 2500, affinity: { huangyaoshi: 30 },
      text: '三道试题，你拆过了最后一招。黄药师收箫长笑：“好！天下英雄，今日算你一个。”桃花岛的门户，从此对你敞开。',
    },
  },
  {
    id: 10, chapter: 3, volume: '第一卷·射雕篇', code: '3-4', title: '清音石洞 · 老顽童', recLevel: 42,
    bossName: '老顽童·周伯通', bossTitle: '被困十五年的活宝', bossPortrait: 'zhoubotong', bossHp: 23800, bossAtk: 1000, bossStance: 'TAICHI',
    mechanicTip: '周伯通空明拳以柔克刚，摆【奇门极速势】抢占先机，别让他把力道化掉。',
    intro: '你误入桃花岛清音洞，洞中一位须发皆白的老者蹦跳而出，拉住你不放：“好玩好玩！快陪我打一架，打赢了我教你背《九阴真经》！”',
    rewardQi: 9800, rewardSilver: 3000,
    firstClear: {
      tag: '洞中岁月', tone: 'jade', affinity: { zhoubotong: 30 },
      text: '你与老顽童拆了三百招，他笑得满地打滚，硬拉你结拜为兄弟。洞中不知岁月，他口中念念有词的《九阴真经》总纲，被你听了个七七八八。',
    },
  },

  // ───────────────────────── 第四章 ─────────────────────────
  {
    id: 11, chapter: 4, volume: '第一卷·射雕篇', code: '4-1', title: '荒岛惊魂 · 压鬼岛', recLevel: 47,
    bossName: '西毒·欧阳锋（负伤）', bossTitle: '白驼山主', bossPortrait: 'ouyangfeng', bossHp: 36000, bossAtk: 1200, bossStance: 'FIERCE',
    bossCombat: OUYANG_FENG_ISLAND_COMBAT,
    mechanicTip: '欧阳锋第 3 回合蓄力蛤蟆功，兰花拂穴手可打断。太极可在他扑出时引其撞石。',
    intro: '海上巨舶被欧阳锋纵火焚毁，你漂流至压鬼岛。岛上，洪七公与欧阳锋比拼内力，两败俱伤。负伤的西毒阴恻恻转过头来：“多一个人知道这岛，就多一个死人。”',
    rewardQi: 14000, rewardSilver: 4000, dropItemIds: ['lingshe_zhang'],
    firstClear: {
      tag: '压鬼岛脱险', tone: 'red', qiExp: 3000,
      text: '你抓住欧阳锋运功疗伤的空隙，扶着重伤的洪七公扎筏出海。海天茫茫，身后那柄双蛇盘绕的灵蛇杖，已落入你手中。',
    },
  },
  {
    id: 12, chapter: 4, volume: '第一卷·射雕篇', code: '4-2', title: '牛家密室 · 梵文总纲', recLevel: 52,
    bossName: '杨康·完颜康（夺经）', bossTitle: '赵王府世子', bossPortrait: 'wanyankang', bossHp: 34300, bossAtk: 1450, bossStance: 'AGILE',
    bossCombat: WANYAN_KANG_COMBAT,
    mechanicTip: '杨康攒怒后使白骨爪撕盾流血，刚猛强攻势可克制其奇门。',
    intro: '你重返临安牛家村曲三酒馆的密室，隔墙之外，黄药师、全真七子、欧阳锋连环惊变；你屏息偷听黄蓉解析《九阴真经》梵文总纲，却被潜入的杨康撞破，对方一声冷笑，拔剑便刺。',
    rewardQi: 17000, rewardSilver: 4800,
    firstClear: {
      tag: '梵文总纲', tone: 'purple', flags: ['jiuyin_fanwen'], qiExp: 3500, affinity: { yangkang: 20 },
      text: '杨康负伤遁走。你默记下黄蓉口述的梵文音译，只觉经文里“天之道，损有余而补不足”几句，竟与你体内真气隐隐相合。',
    },
  },
  {
    id: 13, chapter: 4, volume: '第一卷·射雕篇', code: '4-3', title: '铁掌孤峰 · 水上漂裘千仞', recLevel: 56, isBoss: true,
    bossName: '铁掌水上漂·裘千仞', bossTitle: '湘西铁掌帮主', bossPortrait: 'qiuqianren', bossHp: 46700, bossAtk: 1650, bossStance: 'FIERCE',
    bossCombat: QIU_QIANREN_COMBAT,
    mechanicTip: `铁掌命中使疗伤效果降低 ${IRON_PALM_WOUND.percent}%，持续 ${IRON_PALM_WOUND.rounds} 回合。太极可化解焚石掌风，一阳指可打断蓄力。`,
    intro: '为寻《武穆遗书》抗金，并救治重伤的洪七公，你连闯湘西铁掌帮三山，终于登上铁掌峰顶。铁掌帮主裘千仞立于绝壁，双掌乌黑：“来者何人，敢闯我铁掌峰！”',
    rewardQi: 25000, rewardSilver: 6000, dropItemIds: ['wumu_yishu', 'tiancan_glove'], dropSkillIds: ['shuishang_piao'],
    firstClear: {
      tag: '渔樵耕读', tone: 'gold', flags: ['yuqiao_gengdu'], qiExp: 5000, affinity: { hongqigong: 30, zhuziliu: 120, qiuqianren: 20 },
      text: '你击败裘千仞，从峰顶密室取得《武穆遗书》。下山后你于桃源连闯“渔、樵、耕、读”四关，终于见到了隐居的南帝一灯大师。【大理一灯居】的山门，向你敞开。',
    },
  },

  // ───────────────────────── 第五章 ─────────────────────────
  {
    id: 14, chapter: 5, volume: '第一卷·射雕终章', code: '5-1', title: '铁骑西征 · 撒麻尔罕', recLevel: 62,
    bossName: '金国六王爷·完颜洪烈', bossTitle: '勾结西毒的幕后黑手', bossPortrait: 'wanyankang', bossHp: 50000, bossAtk: 1660, bossStance: 'FIERCE',
    bossCombat: { faction: 'JIN', alignment: 'HERETIC', karma: -60, mounted: true, weapon: { form: 'BLADE', tier: 'purple' },
      charge: { round: 2, name: '金国铁骑冲阵', damageMultiplier: 1.7, taichiGuard: true } },
    mechanicTip: '完颜洪烈第 2 回合蓄力铁骑冲阵。太极柔化势可在释放时化解。',
    intro: '你北上大漠，协助郭靖率奇兵天降撒麻尔罕城。城头，完颜洪烈与欧阳锋的阴谋被你当场识破，金国铁骑倾巢而出。',
    rewardQi: 30000, rewardSilver: 8000,
    firstClear: {
      tag: '奇兵破城', tone: 'gold', qiExp: 6000, silver: 3000,
      text: '撒麻尔罕城头易帜。完颜洪烈败走，成吉思汗亲自在金帐中召见你们，赞你们“万夫莫当”。',
    },
  },
  {
    id: 15, chapter: 5, volume: '第一卷·射雕终章', code: '5-2', title: '烟雨重逢 · 铁枪庙', recLevel: 67,
    bossName: '千手人屠·彭连虎', bossTitle: '西毒麾下', bossPortrait: 'bandit', bossHp: 62500, bossAtk: 1980, bossStance: 'AGILE',
    bossCombat: PENG_LIANHU_TEMPLE_COMBAT,
    guards: [{ name: '鬼门龙王·沙通天', title: '西毒麾下', portrait: 'qiuqianren', hp: 18000, atk: 1500, stance: 'FIERCE',
      combat: { ...SHA_TONGTIAN_COMBAT, joinsRound: true, charge: { ...SHA_TONGTIAN_COMBAT.charge, round: 2 } } }],
    mechanicTip: '彭连虎满怒以透骨银针封招，优先打击右侧后排。贴身拳掌可封住暗器，兰花拂穴手可打断沙通天蓄力。',
    intro: '八月十五，嘉兴烟雨楼。铁枪庙内，黄蓉当众揭穿杨康与欧阳锋害死江南五怪的真相。一语既出，满庙杀机——欧阳锋的爪牙彭连虎、沙通天拔刀拦路。',
    rewardQi: 38000, rewardSilver: 10500,
    firstClear: {
      tag: '真相大白', tone: 'red', flags: ['truth_revealed'], qiExp: 8000,
      text: '烟雨楼头，满庙烛火被劲风吹得乍明乍灭。真相揭开，江湖震动——而远在西方，那疯魔般的白影，已踏着华山之雪走向论剑台。',
    },
  },
  {
    id: 16, chapter: 5, volume: '第一卷·射雕终章', code: '5-3', title: '华山绝巅 · 逆九阴欧阳锋', recLevel: 72, isBoss: true,
    bossName: '疯魔西毒·欧阳锋', bossTitle: '经脉逆行·天下第一狂', bossPortrait: 'ouyangfeng', bossHp: 84000, bossAtk: 2550, bossStance: 'FIERCE',
    bossCombat: OUYANG_FENG_FRENZY,
    mechanicTip: '欧阳锋免疫点穴，每三回合以太极抵御全体掌风。心魔阶段可用靖蓉合击配合主角绝技破局。',
    intro: '白雪皑皑的华山之巅，你携两位生死伙伴，先后迎战洪七公、黄药师，最后一个对手，是因逆练九阴而疯魔的欧阳锋——他倒立行走，口中只喃喃一句：“我是谁？”',
    rewardQi: 55000, rewardSilver: 15000, dropSkillIds: ['jiuyin_zonggang'],
    firstClear: {
      tag: '天下第一', tone: 'gold', qiExp: 20000, affinity: { ouyangfeng: 30 },
      text: '这一战，你击败了疯魔的西毒。山风猎猎，五绝齐聚，众人只见你负手立于绝顶，一袭白衣胜雪——“天下第一”，自此在江湖间传开。《射雕》一卷，至此圆满。',
    },
  },
]

// ───────────────────────── 支线 / 奇遇 ─────────────────────────
const mongolRebels = { faction: 'MONGOL', alignment: 'HERETIC', mounted: true } as const

export const ADVENTURES: AdventureConfig[] = [
  {
    id: 'qusan_jiuguan', afterNodeId: 1,
    title: '曲三酒馆的暗格', location: '临安牛家村·曲三酒馆废墟',
    description: '铁八卦背面刻着一行细小的桃花暗记，指向牛家村一座早已荒废的酒馆。灶台下的青砖，似乎有些松动。',
    choices: [
      {
        key: 'A', label: '以铁八卦对准暗记，掀开灶台下的青砖',
        requirementText: '需持有【曲三铁八卦】（悟性 +5，习得《劈空掌》，得桃花岛信物）',
        require: (c) => c.items.includes('iron_bagua'),
        reward: {
          tag: '桃花暗格', tone: 'purple', stats: { intStat: 5 }, skills: ['pikong_zhang'], flags: ['taohua_token'], qiExp: 600,
          text: '青砖之下，竟藏着曲灵风生前留下的字画与一卷《劈空掌谱》，附带一枚桃花岛的信物。你对着掌谱勘悟半日，眉宇间豁然开朗。',
        },
      },
      {
        key: 'B', label: '嫌这破酒馆晦气，只取走几幅字画变卖',
        requirementText: '纹银 +1,800',
        reward: { tag: '变卖字画', tone: 'gold', silver: 1800, text: '字画纸色泛黄，落款虽不显眼，当铺掌柜却连连称赞。你揣着沉甸甸的银子走出牛家村。' },
      },
    ],
  },
  {
    id: 'dashi_shediao', afterNodeId: 2,
    title: '大漠射雕', location: '大漠草原·鹰嘴峰',
    description: '郭靖约你到鹰嘴峰下，头顶一对白雕盘旋而过。他递来一张铁胎硬弓，憨憨笑道：“你也来试试？”',
    choices: [
      {
        key: 'A', label: '拉满铁胎硬弓，射向盘旋的白雕',
        requirementText: '需臂力 ≥ 18（得【铁胎硬弓】与【双雕白羽箭】，郭靖好感 +120）',
        require: (c) => c.stats.str >= 18,
        reward: {
          tag: '一箭双雕', tone: 'gold', items: ['tiebai_bow', 'shuangdiao_arrow'], affinity: { guojing: 120 },
          text: '弓弦一响，白羽破空，双雕应声而落。郭靖拍手大笑，将弓与箭一并赠你：“兄弟，这弓箭就该跟着你！”',
        },
      },
      {
        key: 'B', label: '替郭靖拾回羽箭，陪他在草原烤羊肉',
        requirementText: '郭靖好感 +200，真气 +1,600',
        reward: { tag: '草原夜话', tone: 'jade', affinity: { guojing: 200 }, qiExp: 1600, text: '篝火噼啪，烤羊油滴落。郭靖讲起蒙古草原的大雪夜，你听得入神，只觉这少年的胸襟比天还宽。' },
      },
    ],
  },
  {
    id: 'xiaoqier_jiaohuaji', afterNodeId: 2,
    title: '小乞儿的叫花鸡', location: '张家口·聚福酒楼',
    description: '酒楼里一个浑身泥污的小乞丐正狼吞虎咽，掌柜叉腰喝骂：“没钱还吃这么多！”那双乌溜溜的眼睛却分明在偷偷打量你。',
    choices: [
      {
        key: 'A', label: '豪掷银子替她付账，再添一只八宝肥鸭',
        requirementText: '耗纹银 1,200 两（黄蓉好感 +200，得【软猬甲残片】与《逍遥游》）',
        costSilver: 1200,
        reward: {
          tag: '倾盖如故', tone: 'gold', affinity: { huangrong: 200 }, items: ['ruanwei_shard'], skills: ['xiaoyao_you'],
          text: '小乞丐吃得满嘴流油，忽然扯下脏兮兮的头巾，露出一张清秀灵动的脸庞：“你这人有意思！这个送你，可别弄丢了。”说罢塞来一块软猬甲残片与一页拳谱。',
        },
      },
      {
        key: 'B', label: '板起脸来，训诫她不可白吃白喝',
        requirementText: '侠义 +10，黄蓉好感 +30',
        reward: { tag: '正色训诫', tone: 'jade', stats: { karma: 10 }, affinity: { huangrong: 30 }, text: '小乞丐吐吐舌头，朝你扮了个鬼脸，嘻嘻哈哈地钻出了人群。' },
      },
    ],
  },
  {
    id: 'huangshan_bishou', afterNodeId: 3,
    title: '荒山遗落的匕首', location: '嘉兴郊外·荒山断崖',
    description: '陈玄风毙命后，梅超风双目失明坠入荒崖。她奄奄一息地倒在乱石间，怀中那半卷人皮经文在月光下泛着幽光。',
    choices: [
      {
        key: 'A', label: '趁虚而入，夺取她怀中的人皮经文',
        requirementText: '侠义 −100，习得残缺绝学《摧心掌》',
        reward: { tag: '趁火打劫', tone: 'red', stats: { karma: -100 }, skills: ['cuixin_zhang'], text: '你俯身探手，从她怀中抽走人皮经文。梅超风喉头嗬嗬作响，却连抬手的力气都没有。《摧心掌》的狠辣招式，从此烙进了你的脑海。' },
      },
      {
        key: 'B', label: '替她包扎引路，劝她莫再造杀孽',
        requirementText: '侠义 +100，得【白骨镀银九节鞭】，梅超风好感 +200',
        reward: { tag: '放下屠刀', tone: 'jade', stats: { karma: 100 }, items: ['xuantie_feizhua'], affinity: { meichaofeng: 200 }, text: '你撕下衣襟替她包扎，扶她循着山泉声走下荒崖。梅超风沉默良久，将腰间的白骨镀银九节鞭解下：“这东西……你拿去吧。”' },
      },
    ],
  },
  {
    id: STORY_SNAKE_ADVENTURE.id, afterNodeId: 4,
    title: STORY_SNAKE_ADVENTURE.title, location: STORY_SNAKE_ADVENTURE.location,
    description: STORY_SNAKE_ADVENTURE.description,
    choices: [
      { ...STORY_SNAKE_ADVENTURE.choices.A, require: (c) => canChooseStorySnake('A', c.stats.agi) },
      STORY_SNAKE_ADVENTURE.choices.B,
    ],
  },
  {
    id: 'huanghe_sigui', afterNodeId: 4,
    title: '黄河四鬼的悬赏', location: '黄河渡口',
    description: '黄河渡口盘踞着沈青刚、吴青烈等四名恶徒，劫掠往来商旅。渡口边的悬赏榜上，已密密麻麻贴满了受害者的血书。',
    choices: [
      {
        key: 'A', label: '提枪上岸，剿灭四恶',
        requirementText: '击退四鬼后得纹银 3,200、真气 1,800 和【丐帮引荐信】。',
        battle: {
          enemyMain: {
            name: '断魂刀·沈青刚', title: '黄河四鬼', portrait: 'assassin', hp: 2200, atk: 240, mp: 990, stance: 'FIERCE',
            combat: SHEN_QINGGANG_COMBAT,
          },
          enemyGuards: [
            { name: '追命枪·吴青烈', title: '黄河四鬼', portrait: 'bandit', hp: 1320, atk: 156, stance: 'FIERCE', combat: WU_QINGLIE_COMBAT },
            {
              name: '夺魄鞭·马青雄', title: '黄河四鬼', portrait: 'bandit', hp: 1100, atk: 130, stance: 'AGILE',
              combat: { alignment: 'HERETIC', joinsRound: true, speed: 96, weapon: { form: 'WHIP', tier: 'green' } },
            },
            {
              name: '丧门斧·钱青健', title: '黄河四鬼', portrait: 'bandit', hp: 1250, atk: 150, stance: 'FIERCE',
              combat: { alignment: 'HERETIC', joinsRound: true, staysBehindLeader: true, speed: 82, weapon: { form: 'AXE', tier: 'green' } },
            },
          ],
        },
        reward: { tag: '剿灭四鬼', tone: 'gold', silver: 3200, qiExp: 1800, flags: ['gaibang_letter'], stats: { karma: 15 }, text: '四鬼横尸渡口，商旅们感激不尽。一位路过的丐帮弟子拍着你的肩膀，写下一封引荐信：“凭这个，丐帮的鲁长老会给你个好座位。”' },
      },
      {
        key: 'B', label: '设法劝服四人洗手归田',
        requirementText: '侠义 +45，真气 +2,400',
        reward: { tag: '劝善归田', tone: 'jade', stats: { karma: 45 }, qiExp: 2400, text: '你与四鬼彻夜长谈，直说到天明。渡口的船桨重又摇动，沈青刚在晨雾里朝你深深一揖。' },
      },
    ],
  },
  {
    id: 'tieqiangmiao', afterNodeId: 5,
    title: '铁枪庙旧事', location: '中都城外·铁枪庙',
    description: '破败的铁枪庙里，杨铁心与包惜弱浑身是血，金兵的火把已逼近庙门。杨铁心喘息着对你抱拳：“少侠，求你……带我娘子走。”',
    choices: [
      {
        key: 'A', label: '背起二人，倾注真气疗伤，护送至终南山隐居',
        requirementText: '需根骨 ≥ 25。护住二人撑过 4 回合或击退追兵，得【杨家精钢烂银枪】与《杨家枪法》，穆念慈好感 +200。',
        require: (c) => c.stats.con >= 25,
        battle: {
          surviveRounds: 4,
          escortAllies: [
            { id: 'yangtiexin', name: '杨铁心', portrait: 'yangtiexin', maxHp: 1800, hp: 950, def: 100 },
            { id: 'baoxiruo', name: '包惜弱', portrait: 'baoxiruo', maxHp: 1550, hp: 850, def: 65 },
          ],
          enemyMain: {
            name: '赵王府追兵统领', title: '金国王府亲兵', portrait: 'bandit', hp: 4200, atk: 350, mp: 1900, stance: 'FIERCE',
            combat: { faction: 'JIN', alignment: 'HERETIC', def: 95, speed: 90, weapon: { form: 'BLADE', tier: 'blue' } },
          },
          enemyGuards: [
            {
              name: '持刀追兵', title: '近身拦路', portrait: 'bandit', hp: 1850, atk: 250, stance: 'FIERCE',
              combat: { faction: 'JIN', alignment: 'HERETIC', joinsRound: true, speed: 94, escortTarget: 'ALLY_ESCORT_LEFT', weapon: { form: 'BLADE', tier: 'green' } },
            },
            {
              name: '持弓追兵', title: '远处截击', portrait: 'zhebie', hp: 1600, atk: 240, stance: 'AGILE',
              combat: { faction: 'JIN', alignment: 'HERETIC', joinsRound: true, speed: 85, escortTarget: 'ALLY_ESCORT_RIGHT', weapon: { form: 'BOW', tier: 'green' } },
            },
          ],
        },
        reward: { tag: '护送隐居', tone: 'gold', stats: { karma: 40 }, items: ['yangjia_spear'], skills: ['yangjia_qiang'], affinity: { munianci: 200, yangtiexin: 120 }, text: '你以真气护住二人心脉，杀出重围。杨铁心感激涕零，将祖传的烂银枪与枪谱赠与你；而远处，穆念慈含泪遥遥一拜。' },
      },
      {
        key: 'B', label: '留下干粮与伤药，含泪告别',
        requirementText: '侠义 +20，真气 +1,800',
        reward: { tag: '含泪别过', tone: 'jade', stats: { karma: 20 }, qiExp: 1800, text: '你将所有伤药留下，转身没入夜色。身后的火光越烧越远，你只觉胸中憋着一团真气，久久不散。' },
      },
    ],
  },
  {
    id: 'kunlun_canyuan', afterNodeId: 0,
    title: '昆仑翠谷·苍猿腹痛', location: '断崖百丈幽谷',
    description: '你在山崖采药失足滑入云海翠谷，一头年迈苍猿步履蹒跚走来，指着自己隆起结疤的腹部向你哀鸣求助。',
    choices: [
      {
        key: 'A', label: '以玄铁匕首小心剖开旧疤，取出油布经书并缝合！',
        requirementText: '需悟性 ≥ 22（领悟神品《九阳神功》！）',
        require: (c) => c.stats.intStat >= 22,
        reward: { tag: '绝世神功', tone: 'gold', skills: ['jiuyang_shengong'], text: '你替昆仑老白猿缝合腹伤，竟从油布包中得获失传神品心法！' },
      },
      {
        key: 'B', label: '喂食止痛草药安抚白猿',
        requirementText: '侠义 +50，福缘 +3',
        reward: { tag: '福泽绵长', tone: 'jade', stats: { karma: 50, luck: 3 }, text: '白猿向你作揖致谢，献上两枚山间朱果。' },
      },
    ],
  },
  {
    id: 'zuoshou_huafang', afterNodeId: 10,
    title: '左手画方，右手画圆', location: '桃花岛·清音洞',
    description: '须发皆白的老顽童周伯通拉着你不放：“好兄弟，你来试试左手画方、右手画圆！心思越杂的名门弟子越学不会！”',
    choices: [
      {
        key: 'A', label: '屏弃杂念，左右双掌分使不同劲力！',
        requirementText: '散人双学《双手互搏》与《空明拳》；悟性 ≤ 35 习《双手互搏》；悟性过高则只得《空明拳》',
        reward: (c) =>
          c.isWanderer
            ? { tag: '老顽童真传', tone: 'purple', stats: { agi: 3 }, skills: ['shuangshou_hubo', 'kongming_quan'], text: '周伯通拍手大笑：“妙极！你这散人心无挂碍，不受门户拘束！”当场把双手互搏术与空明拳一并倾囊相授。' }
            : c.stats.intStat <= 35
              ? { tag: '双手互搏', tone: 'purple', stats: { agi: 3 }, skills: ['shuangshou_hubo'], text: '你心思单纯，竟一学就会，左手画方、右手画圆，丝毫不乱。周伯通乐得直蹦：“好兄弟！你比那些聪明人强多啦！”' }
              : { tag: '空明拳意', tone: 'purple', stats: { intStat: 2 }, skills: ['kongming_quan'], text: '你心思太细，两手一起动便相互牵扯，怎么也分不开。周伯通摇头晃脑：“罢了罢了，你悟性太高，只好学空明拳。”' },
      },
      {
        key: 'B', label: '陪老顽童斗促织，畅谈江湖趣闻',
        requirementText: '周伯通好感 +30，真气 +4,000',
        reward: { tag: '忘年之交', tone: 'jade', affinity: { zhoubotong: 30 }, qiExp: 4000, items: ['kongming_peach_sword'], text: '你陪老顽童斗促织大胜三局，周伯通笑得直拍大腿，把亲手削的桃木剑塞给你：“这朋友交定了！”' },
      },
    ],
  },
  {
    id: 'baituo_zheshan', afterNodeId: 9,
    title: '白驼山少主的折扇', location: '桃花岛·荒礁',
    description: '桃花岛荒礁上，白驼山少主欧阳克被一块巨石压断了双腿，正有气无力地呼救——他叔叔欧阳锋可是天下五绝之一。',
    choices: [
      {
        key: 'A', label: '暗中搬开巨石，救下欧阳克',
        requirementText: '侠义 −40，结识西毒欧阳锋（蛤蟆功传功线），得【白驼山描金折扇】',
        reward: { tag: '结交西毒', tone: 'purple', stats: { karma: -40 }, items: ['baituo_fan'], affinity: { ouyangfeng: 60, ouyangke: 60 }, flags: ['baituo_favor'], text: '欧阳克被你救下，感激之余将描金折扇相赠；远处，欧阳锋阴恻恻的目光落在你身上：“小朋友，将来到我白驼山做客。”' },
      },
      {
        key: 'B', label: '袖手旁观，转身而去',
        requirementText: '侠义 +30，黄蓉、洪七公好感各 +30',
        reward: { tag: '正邪分明', tone: 'jade', stats: { karma: 30 }, affinity: { huangrong: 30, hongqigong: 30 }, text: '你冷冷瞥了一眼，转身离去。桃花林里，黄蓉与洪七公听说了此事，相视而笑。' },
      },
    ],
  },
  {
    id: 'yinggu_suanti', afterNodeId: 11,
    title: '瑛姑的算术题', location: '湘西·黑沼泥潭',
    description: '黑沼泥潭中，神算子瑛姑正对着一幅九宫图苦思冥想，口中念念有词：“三百二十一万六千……立方根是多少？”',
    choices: [
      {
        key: 'A', label: '凝神推演九宫，一口报出立方根',
        requirementText: '需悟性 ≥ 36（得【黑沼·九尾灵狐】与《泥鳅功》，周伯通好感 +30，瑛姑好感 +40）',
        require: (c) => c.stats.intStat >= 36,
        reward: { tag: '解开九宫', tone: 'gold', items: ['jiuwei_fox'], skills: ['niqiu_gong'], affinity: { zhoubotong: 30, yinggu: 40 }, text: '瑛姑瞪着你，忽然又哭又笑，将伴她多年的九尾灵狐与泥鳅功秘籍一并送你：“多年解不开的题，今日终于……终于有人解开了。”' },
      },
      {
        key: 'B', label: '帮她采药熬汤，陪她推演三日',
        requirementText: '悟性 +2，真气 +3,000',
        reward: { tag: '陪伴推演', tone: 'jade', stats: { intStat: 2 }, qiExp: 3000, affinity: { yinggu: 30 }, text: '三日夜里，你陪着瑛姑在泥地上画满九宫格。虽未解出最后一题，你的运算之道却也大有进益。' },
      },
    ],
  },
  {
    id: 'yideng_cibei', afterNodeId: 13,
    title: '一灯大师的慈悲', location: '桃源·渔樵耕读草庐',
    description: '一灯大师为救重伤者耗尽元气，草庐中气息微弱。便在此刻，欧阳锋阴森森的笑声自林外传来：“段皇爷，我来取你的命了。”',
    choices: [
      {
        key: 'A', label: '挺身横在草庐前，死战欧阳锋五回合不退',
        requirementText: '需根骨 ≥ 30。撑过 5 回合或击退欧阳锋后，《一阳指》参悟 +3 重，习得《枯荣禅功》，侠义 +60。',
        require: (c) => c.stats.con >= 30,
        battle: { nodeId: 11, surviveRounds: 5 },
        reward: { tag: '死战不退', tone: 'gold', stats: { karma: 60 }, skillBoost: { yiyang_zhi: 3 }, skills: ['kurong_chan'], flags: ['yideng_mercy'], text: '你守在草庐前，终于逼得欧阳锋退去。一灯大师缓过一口气，当场以《一阳指》乾阳篇和枯荣禅功相授。' },
      },
      {
        key: 'B', label: '背起一灯大师，从后山密径撤离',
        requirementText: '侠义 +40，真气 +4,500',
        reward: { tag: '背师远走', tone: 'jade', stats: { karma: 40 }, qiExp: 4500, text: '你背起一灯大师，在山石荆棘间一路狂奔。身后蛤蟆声咯咯不绝，你却只觉背上的老人轻得像一片叶子。' },
      },
    ],
  },
  {
    id: 'jindao_fuma', afterNodeId: 14,
    title: '金刀驸马', location: '大漠·金帐',
    description: '成吉思汗的金帐中，大汗亲自斟满了一碗马奶酒：“桑昆的叛军尚在帐外，你若能破之，我愿封你为金刀驸马。”',
    choices: [
      {
        key: 'A', label: '率奇兵出击，平定桑昆之乱，受封金刀驸马',
        requirementText: '击退桑昆和骑兵后得纹银 6,000、【大漠金刀】和 40 点侠义。桑昆第 2 回合蓄力，太极可化解骑阵合围。',
        battle: {
          enemyMain: {
            name: '桑昆', title: '克烈部叛军首领', portrait: 'bandit', hp: 34000, atk: 1450, mp: 15300, stance: 'FIERCE',
            combat: { ...mongolRebels, def: 180, speed: 110, weapon: { form: 'BLADE', tier: 'purple' },
              charge: { round: 2, name: '骑阵合围', damageMultiplier: 1.7, taichiGuard: true } },
          },
          enemyGuards: [
            {
              name: '克烈长枪骑兵', title: '桑昆麾下', portrait: 'bandit', hp: 9500, atk: 450, stance: 'FIERCE',
              combat: { ...mongolRebels, joinsRound: true, speed: 105, weapon: { form: 'SPEAR', tier: 'blue' } },
            },
            {
              name: '克烈弓骑兵', title: '桑昆麾下', portrait: 'zhebie', hp: 8000, atk: 400, stance: 'AGILE',
              combat: { ...mongolRebels, joinsRound: true, staysBehindLeader: true, speed: 96, weapon: { form: 'BOW', tier: 'blue' } },
            },
          ],
        },
        reward: { tag: '金刀驸马', tone: 'gold', silver: 6000, items: ['dadiao_jindao'], stats: { karma: 40 }, text: '叛军在你一击之下土崩瓦解。成吉思汗亲手把一柄镶宝金刀交到你手中，帐外万人齐呼，声震草原。' },
      },
      {
        key: 'B', label: '婉拒封赏，只取战利马匹回中原',
        requirementText: '福缘 +3，真气 +8,000',
        reward: { tag: '飘然而去', tone: 'jade', stats: { luck: 3 }, qiExp: 8000, text: '你向大汗抱拳谢过封赏，牵了一匹骏马，头也不回地驰向中原。夕阳里，马蹄踏起漫天沙尘。' },
      },
    ],
  },
]

export const adventureById = (id: string) => ADVENTURES.find((a) => a.id === id)

export function storyFirstClearReward(chapter: StoryNodeConfig) {
  const plot = chapter.firstClear
  return {
    ...plot,
    qiExp: chapter.rewardQi + (plot.qiExp ?? 0),
    silver: chapter.rewardSilver + (plot.silver ?? 0),
    items: [...new Set([...(chapter.dropItemIds ?? []), ...(plot.items ?? [])])],
    skills: [...new Set([...(chapter.dropSkillIds ?? []), ...(plot.skills ?? [])])],
  }
}

// 这五个节点沿用旧联机服的敌方数值及掉落。武穆遗书仍从联机少室山获得。
export const ONLINE_STORY_CHAPTERS = STORY_CHAPTERS.map((chapter): StoryNodeConfig => {
  switch (chapter.code) {
    case '1-3':
      return { ...chapter, bossPortrait: 'assassin', dropItemIds: [...(chapter.dropItemIds ?? []), 'pine_crown'] }
    case '2-2':
      return {
        ...chapter, recLevel: 16, bossHp: 8200, bossAtk: 480,
        guards: [{ ...ZHAO_MANOR_GUARD, hp: 3650, atk: 260 }],
        dropItemIds: [...(chapter.dropItemIds ?? []), 'cloth_belt'],
      }
    case '3-3':
      return { ...chapter, recLevel: 30, bossHp: 16500, bossAtk: 790, dropItemIds: [...(chapter.dropItemIds ?? []), 'oxhide_belt'] }
    case '4-3':
      return {
        ...chapter, recLevel: 45, bossPortrait: 'ouyangfeng', bossHp: 29000, bossAtk: 1180, dropItemIds: ['tiancan_glove', 'iron_bracers'],
        firstClear: { ...chapter.firstClear, text: '你击败裘千仞，在峰顶密室找到《武穆遗书》的下落。下山后你于桃源连闯“渔、樵、耕、读”四关，终于见到了隐居的南帝一灯大师。【大理一灯居】的山门，向你敞开。' },
      }
    case '5-3':
      return { ...chapter, recLevel: 60, bossHp: 52000, bossAtk: 1750, dropItemIds: ['jade_belt', 'cloud_boots'] }
    default:
      return chapter
  }
})

const legacyChapterIds = [3, 5, 9, 13, 16] as const
export const ONLINE_STORY_PROGRESS_VERSION = 2

export function restoreOnlineStoryProgress(maxChapterId: number, rewardedChapters: number[], version?: number) {
  if (version === ONLINE_STORY_PROGRESS_VERSION) return { maxChapterId, rewardedChapters }
  const claimed = rewardedChapters.flatMap((id) => {
    const chapterId = legacyChapterIds[id - 1]
    return chapterId === undefined ? [] : [chapterId]
  })
  const next = maxChapterId > legacyChapterIds.length ? ONLINE_STORY_CHAPTERS.length + 1 : legacyChapterIds[maxChapterId - 1] ?? 1
  return { maxChapterId: Math.max(next, ...claimed.map((id) => id + 1)), rewardedChapters: claimed }
}

export function onlineStoryChapter(ref: string) {
  // 旧客户端仍发送五场战斗的数字编号。新请求发送关卡代码，避免编号歧义。
  const legacyId = /^[1-5]$/.test(ref) ? legacyChapterIds[Number(ref) - 1] : undefined
  return ONLINE_STORY_CHAPTERS.find((chapter) => chapter.code === ref || chapter.id === legacyId)
}

export function storyProgressFlags(rewardedChapters: readonly number[], adventureFlags: readonly string[] = []) {
  const chapterFlags = STORY_CHAPTERS.flatMap((chapter) => rewardedChapters.includes(chapter.id) ? chapter.firstClear.flags ?? [] : [])
  return [...new Set([...chapterFlags, ...adventureFlags])]
}

export function adventureEncounter(battle: NonNullable<AdventureChoice['battle']>, chapters = STORY_CHAPTERS): AdventureBattle | undefined {
  if (!('nodeId' in battle)) return battle
  const chapter = chapters.find((node) => node.id === battle.nodeId)
  if (!chapter) return
  return { ...storyEncounter(chapter, undefined, true), surviveRounds: battle.surviveRounds }
}

export function addAdventureObjective(report: BattleReportDTO, adventure: AdventureConfig, battle: AdventureBattle) {
  const names = battle.escortAllies?.map(({ name }) => name).join('、')
  const opponent = names ? '追兵' : '对手'
  const rounds = battle.surviveRounds
  const goal = `${names ? `保护${names}，` : ''}${rounds ? `撑过 ${rounds} 回合或` : ''}击退${opponent}`
  const lastRound = report.events.at(-1)?.round ?? 1
  report.events.unshift({
    round: 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', effectSourceId: adventure.id,
    segments: [{ type: 'tag', text: `${adventure.title} · ${goal}`, tone: 'gold' }],
  })
  if (report.winner === 'ALLY') {
    const outcome = report.survivedRounds ? `已撑过 ${report.survivedRounds} 回合` : `已击退${opponent}`
    report.events.push({
      round: lastRound, type: 'EFFECT', actorSlot: 'ALLY_MAIN', effectSourceId: adventure.id,
      segments: [{ type: 'tag', tone: 'jade', text: `${adventure.title} · ${outcome}${names ? `，${names}脱险` : ''}` }],
    })
  }
}
