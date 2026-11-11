import type { EquipSlotType, PortraitStyle, SkillSlotType, StanceType, TierColor, ZoneSafety } from './typesHelper'
import { ADVENTURES, STORY_CHAPTERS } from './storyData'
import type { AdventureCtx, Reward } from './storyData'

export type { PortraitStyle }

export interface RealmConfig {
  tier: number
  name: string
  meridian: string
  minLevel: number
  maxLevel: number
  multiplier: number
  baseBreakRate: number
  unlockDesc: string
}

export const REALMS: RealmConfig[] = [
  { tier: 1, name: '初窥门径', meridian: '手三阳经', minLevel: 1, maxLevel: 15, multiplier: 1.0, baseBreakRate: 100, unlockDesc: '外功与轻功槽开启，打坐倍率 1.0x' },
  { tier: 2, name: '略有小成', meridian: '足三阴经', minLevel: 16, maxLevel: 30, multiplier: 1.25, baseBreakRate: 85, unlockDesc: '解锁内功心法槽，全属性 +10%' },
  { tier: 3, name: '融会贯通', meridian: '阳维脉·阴维脉', minLevel: 31, maxLevel: 45, multiplier: 1.5, baseBreakRate: 75, unlockDesc: '解锁左翼破阵伙伴位，打坐倍率 1.5x' },
  { tier: 4, name: '炉火纯青', meridian: '阳跷脉·阴跷脉', minLevel: 46, maxLevel: 60, multiplier: 1.75, baseBreakRate: 65, unlockDesc: '解锁右翼奇策伙伴位与绝技奥义槽' },
  { tier: 5, name: '一代宗师', meridian: '任督二脉·生死玄关', minLevel: 61, maxLevel: 75, multiplier: 2.1, baseBreakRate: 50, unlockDesc: '解锁全队秘宝槽，真气生生不息(1.0满境)' },
  { tier: 6, name: '登峰造极', meridian: '冲脉贯顶', minLevel: 76, maxLevel: 90, multiplier: 2.5, baseBreakRate: 45, unlockDesc: '神雕剑冢共鸣，重剑真气破甲 +20%' },
  { tier: 7, name: '出神入化', meridian: '带脉交泰', minLevel: 91, maxLevel: 105, multiplier: 3.0, baseBreakRate: 40, unlockDesc: '倚天九阳护体，解锁自创绝学词条' },
  { tier: 8, name: '震古烁今', meridian: '奇经小周天', minLevel: 106, maxLevel: 120, multiplier: 3.6, baseBreakRate: 35, unlockDesc: '笑傲无招胜有招，实战看破封招' },
  { tier: 9, name: '返璞归真', meridian: '奇经大周天', minLevel: 121, maxLevel: 135, multiplier: 4.3, baseBreakRate: 30, unlockDesc: '天龙六脉化气，隔空无视外功护甲' },
  { tier: 10, name: '天人合一', meridian: '泥丸天门', minLevel: 136, maxLevel: 150, multiplier: 5.2, baseBreakRate: 25, unlockDesc: '侠客岛太玄天成，万法归宗无拘束' },
]

export interface SkillConfig {
  id: string
  name: string
  slot: SkillSlotType
  tier: TierColor
  source: string
  powerRatio: number
  qiDamageRatio?: number // 无视护甲的内劲真实转化率
  speedBonus?: number
  dodgeBonus?: number
  critBonus?: number
  idleQiBonus?: number   // 离线打坐加成(%)
  desc: string
  castNarrative: string
}

export const SKILLS: Record<string, SkillConfig> = {
  // 内功心法 (INNER)
  quanzhen_tuna: {
    id: 'quanzhen_tuna',
    name: '全真吐纳功',
    slot: 'INNER',
    tier: 'blue',
    source: '全真教 / 马钰传授',
    powerRatio: 1.0,
    idleQiBonus: 20,
    desc: '道家玄门筑基心法，行住坐卧皆在吐纳。每回合回复8%气血，离线打坐真气效率 +20%。',
    castNarrative: '气沉丹田，依马钰真人所授玄门正宗缓缓吐纳，周身浊气尽散',
  },
  huntian_qigong: {
    id: 'huntian_qigong',
    name: '混天气功',
    slot: 'INNER',
    tier: 'purple',
    source: '丐帮精锐心法',
    powerRatio: 1.15,
    idleQiBonus: 15,
    desc: '丐帮刚猛内功，越战越勇。气血低于50%时外功伤害提升35%。',
    castNarrative: '体内混天真气滚滚如沸，双拳隐现赤红罡气，豪气干云',
  },
  hama_gong: {
    id: 'hama_gong',
    name: '蛤蟆功',
    slot: 'INNER',
    tier: 'orange',
    source: '白驼山庄 / 西毒真传',
    powerRatio: 1.35,
    idleQiBonus: 25,
    desc: '西毒欧阳锋绝学，静若处子，受击蓄势，积满三层下一击狂暴翻倍！',
    castNarrative: '俯身弯腰，双手弯与肩齐，口中发出咯咯蛙鸣，蓄积排山倒海之劲',
  },
  jiuyin_zonggang: {
    id: 'jiuyin_zonggang',
    name: '九阴真经总纲',
    slot: 'INNER',
    tier: 'red',
    source: '集齐上下卷与梵文总纲',
    powerRatio: 1.6,
    critBonus: 18,
    idleQiBonus: 40,
    desc: '“天之道，损有余而补不足。”全属性+30%，攻击无视30%护甲，离线打坐 +40%。',
    castNarrative: '默诵九阴梵音，体内阴阳真气交融流转，招式忽刚忽柔，浑若天成',
  },
  jiuyang_shengong: {
    id: 'jiuyang_shengong',
    name: '九阳神功',
    slot: 'INNER',
    tier: 'red',
    source: '昆仑翠谷白猿奇遇',
    powerRatio: 1.65,
    idleQiBonus: 45,
    desc: '“他强由他强，清风拂山岗！”反弹40%近战伤害，每回合自动净化全队寒毒。',
    castNarrative: '周身九阳真气沛然运转，护体金芒大盛，将敌方劲力尽数震回',
  },

  // 外功招式 (OUTER)
  yuenv_jian: {
    id: 'yuenv_jian',
    name: '越女剑法',
    slot: 'OUTER',
    tier: 'green',
    source: '江南七怪·韩小莹传授',
    powerRatio: 1.15,
    critBonus: 15,
    desc: '江南轻灵剑术，剑招迅捷精准，必定命中且暴击率 +15%。',
    castNarrative: '手腕轻抖，剑光如白虹贯日，使出一式「越女追风」直刺敌方腕脉',
  },
  jiuyin_baiguzhua: {
    id: 'jiuyin_baiguzhua',
    name: '九阴白骨爪',
    slot: 'OUTER',
    tier: 'purple',
    source: '荒山夜战黑风双煞',
    powerRatio: 1.48,
    critBonus: 20,
    desc: '五指发劲狠辣绝伦，附加【撕裂流血】，对护盾目标造成双倍伤害。',
    castNarrative: '五指箕张，指尖凝聚森森阴风，直插敌方天灵盖，正是狠辣无比的【九阴白骨爪】',
  },
  luoying_zhang: {
    id: 'luoying_zhang',
    name: '落英神剑掌',
    slot: 'OUTER',
    tier: 'purple',
    source: '桃花岛武学',
    powerRatio: 1.42,
    desc: '掌风如剑，五色缤纷。令敌方眼花缭乱，命中率下降25%。',
    castNarrative: '双臂挥舞，四面八方俱是掌影，宛如漫天桃花随风飘落，虚实难测',
  },
  kongming_quan: {
    id: 'kongming_quan',
    name: '空明拳',
    slot: 'OUTER',
    tier: 'orange',
    source: '清音洞老顽童周伯通结拜',
    powerRatio: 1.68,
    qiDamageRatio: 0.25,
    desc: '天下至柔拳术，“空朦洞松、风通容梦”，化解敌方30%攻击力反伤对手。',
    castNarrative: '拳力若有若无，似轻实重，使出一招「空碗盛饭」，教敌方有力无处使',
  },
  dagou_bangfa: {
    id: 'dagou_bangfa',
    name: '打狗棒法',
    slot: 'OUTER',
    tier: 'orange',
    source: '丐帮镇帮绝学',
    powerRatio: 1.75,
    critBonus: 22,
    desc: '绊、劈、缠、戳四诀精妙绝伦，40%概率封锁敌方行动1回合。',
    castNarrative: '手中竹棒青光点点，使出打狗棒法【缠字诀】，棒影如青蛇盘旋锁死敌方要害',
  },
  xianglong_18: {
    id: 'xianglong_18',
    name: '降龙十八掌',
    slot: 'OUTER',
    tier: 'red',
    source: '洪七公倾囊传功 / 丐帮五阶',
    powerRatio: 2.15,
    qiDamageRatio: 0.35,
    desc: '天下第一阳刚掌法！无法被闪避与格挡，附带巨额护甲穿透。',
    castNarrative: '左腿微屈，右臂内弯，呼的一掌推出，正是【见龙在田】，掌风如怒涛狂龙席卷全场',
  },
  dugu_jiujian: {
    id: 'dugu_jiujian',
    name: '独孤九剑',
    slot: 'OUTER',
    tier: 'red',
    source: '思过崖风清扬 / 散人奇遇',
    powerRatio: 2.1,
    critBonus: 35,
    qiDamageRatio: 0.4,
    desc: '无招胜有招！看破敌方招式破绽，直接封印敌方主动绝学2回合。',
    castNarrative: '一眼看穿敌方招式中三处破绽，长剑斜指，后发先至，一式【破气式】直贯丹田气海',
  },

  // 轻功身法 (LIGHT)
  jinyan_gong: {
    id: 'jinyan_gong',
    name: '金雁功',
    slot: 'LIGHT',
    tier: 'blue',
    source: '终南山马钰传授',
    powerRatio: 1.0,
    speedBonus: 25,
    dodgeBonus: 12,
    desc: '全真派轻功，身如金雁盘空，出手速度 +25，闪避 +12%。',
    castNarrative: '足尖一点，身形如金雁盘空拔高数丈，轻巧避开锋芒',
  },
  niqiu_gong: {
    id: 'niqiu_gong',
    name: '泥鳅功',
    slot: 'LIGHT',
    tier: 'purple',
    source: '黑沼泥潭瑛姑赠书',
    powerRatio: 1.0,
    speedBonus: 35,
    dodgeBonus: 22,
    desc: '滑不留手如游鱼，闪避 +22%，受到点穴控制时60%概率直接滑脱。',
    castNarrative: '身形滑不留手，宛如泥沼游鱼，在凌厉招式缝隙中一滑而过',
  },
  lingbo_weibu: {
    id: 'lingbo_weibu',
    name: '凌波微步',
    slot: 'LIGHT',
    tier: 'red',
    source: '大理无量山琅嬛玉洞',
    powerRatio: 1.0,
    speedBonus: 65,
    dodgeBonus: 38,
    desc: '足踏伏羲六十四卦，闪避率 +38%，每次成功闪避回复自身25点怒气！',
    castNarrative: '足踏伏羲六十四卦，自“明夷”踩至“既济”，罗袜生尘，万军之中片叶不沾身',
  },

  // 绝技奥义 (ULT)
  kanglong_youhui: {
    id: 'kanglong_youhui',
    name: '亢龙有悔',
    slot: 'ULT',
    tier: 'red',
    source: '降龙十八掌终极奥义',
    powerRatio: 3.1,
    qiDamageRatio: 0.5,
    desc: '发十分力，留二十分后劲！对敌方主将造成毁天灭地的刚猛终结一击。',
    castNarrative: '长啸一声，全身真气凝聚右掌，推出时有十分力，留在自身更有二十分后劲！狂龙吟啸，天地变色',
  },
  bihai_chaosheng: {
    id: 'bihai_chaosheng',
    name: '碧海潮生曲',
    slot: 'ULT',
    tier: 'red',
    source: '东邪黄药师压箱绝技',
    powerRatio: 2.35,
    qiDamageRatio: 0.75,
    desc: '以箫声催动无形音律内劲，全屏真实伤害并令敌方心神错乱！',
    castNarrative: '取过玉箫横于唇边，箫声初如大海浩淼，忽如群魔弄潮！敌方心神剧震，真气逆行喷血',
  },
  yiyang_zhi: {
    id: 'yiyang_zhi',
    name: '一阳指·乾阳通脉',
    slot: 'ULT',
    tier: 'orange',
    source: '南帝一灯大师真传',
    powerRatio: 2.55,
    qiDamageRatio: 0.65,
    desc: '纯阳指力凌空透甲，重创敌方核心并为我方全体回复15%气血。',
    castNarrative: '神色庄严，食指缓缓冲出，嗤的一声轻响，一道纯阳指力凌空射穿敌方重甲',
  },

  // ───────── 射雕篇补全（第03册 §3 / 第05册 各派武学） ─────────
  // 内功
  xiantian_gong: {
    id: 'xiantian_gong',
    name: '先天功',
    slot: 'INNER',
    tier: 'orange',
    source: '全真镇派 / 王重阳遗学',
    powerRatio: 1.42,
    idleQiBonus: 30,
    desc: '王重阳毕生所学。绝境中先天纯阳真气生生不息，免疫首次致死伤害，离线打坐 +30%。',
    castNarrative: '绝境之中，体内一缕先天纯阳真气生生不息，刹那间破而后立',
  },
  kurong_chan: {
    id: 'kurong_chan',
    name: '枯荣禅功',
    slot: 'INNER',
    tier: 'orange',
    source: '大理一灯居 / 南帝亲授',
    powerRatio: 1.38,
    idleQiBonus: 22,
    desc: '枯荣相生，一灯大师疗伤之本。气血低于30%时每回合回复12%气血，离线打坐 +22%。',
    castNarrative: '运起枯荣禅功，左半身枯寂如槁木，右半身生机勃发，伤势转眼愈合大半',
  },

  // 外功
  kaishan_zhang: {
    id: 'kaishan_zhang',
    name: '开山掌',
    slot: 'OUTER',
    tier: 'green',
    source: '江南武馆入门掌法',
    powerRatio: 1.1,
    critBonus: 6,
    desc: '江南武馆的入门掌法，朴实无华，一掌击出势大力沉。',
    castNarrative: '沉腰立马，一掌平平拍出，掌风竟带着开山裂石的闷响',
  },
  fengmo_zhang: {
    id: 'fengmo_zhang',
    name: '疯魔杖法',
    slot: 'OUTER',
    tier: 'blue',
    source: '江南武馆 / 丐帮三袋',
    powerRatio: 1.28,
    critBonus: 10,
    desc: '杖影狂乱，攻势如疯似魔，暴击率 +10%。',
    castNarrative: '手中木杖舞得风雨不透，杖影如疯似魔，招招不留余地',
  },
  pikong_zhang: {
    id: 'pikong_zhang',
    name: '劈空掌',
    slot: 'OUTER',
    tier: 'blue',
    source: '牛家村曲三酒馆暗格',
    powerRatio: 1.3,
    qiDamageRatio: 0.15,
    desc: '隔空发劲，掌力可及丈外，无视部分护甲。',
    castNarrative: '凌空一掌拍出，掌风呼啸而至，离敌尚有丈余，劲力已透体而入',
  },
  cuixin_zhang: {
    id: 'cuixin_zhang',
    name: '摧心掌',
    slot: 'OUTER',
    tier: 'purple',
    source: '梅超风人皮经文（邪道残卷）',
    powerRatio: 1.5,
    critBonus: 12,
    qiDamageRatio: 0.2,
    desc: '掌力阴毒，直透心脉，暴击率 +12%。修习者心性易偏。',
    castNarrative: '掌心泛起一丝诡异的青黑，无声无息按向敌方心口，正是阴毒无比的【摧心掌】',
  },
  tiezhang_gong: {
    id: 'tiezhang_gong',
    name: '铁掌功',
    slot: 'OUTER',
    tier: 'purple',
    source: '湘西铁掌帮 / 裘千仞',
    powerRatio: 1.52,
    desc: '重伤机制，使敌方3回合内受到的疗伤效果降低70%。',
    castNarrative: '双掌黑气隐现，掌力刚猛绝伦，一招【推窗望月】硬生生震裂敌方护体气墙',
  },
  lanhua_fuxue: {
    id: 'lanhua_fuxue',
    name: '兰花拂穴手',
    slot: 'OUTER',
    tier: 'purple',
    source: '东海桃花岛 · 二阶',
    powerRatio: 1.4,
    critBonus: 15,
    desc: '指尖如兰花轻拂，点穴封脉于无形，暴击率 +15%。',
    castNarrative: '十指翻飞如兰花绽放，轻轻拂过敌方周身要穴，几乎不见力道，却教人半身酸麻',
  },
  lingshe_quan: {
    id: 'lingshe_quan',
    name: '灵蛇拳',
    slot: 'OUTER',
    tier: 'purple',
    source: '西域白驼山庄',
    powerRatio: 1.46,
    critBonus: 8,
    desc: '拳势如灵蛇游走，诡谲难测，命中附带蛇毒持续损耗气血。',
    castNarrative: '拳臂如无骨灵蛇般扭曲探出，猛地缠住敌方腕脉，毒气顺着拳劲透入',
  },
  tonggui_jian: {
    id: 'tonggui_jian',
    name: '同归剑法',
    slot: 'OUTER',
    tier: 'purple',
    source: '全真教 · 三代精锐',
    powerRatio: 1.5,
    critBonus: 8,
    desc: '以命搏命的全真剑招，气血越低出剑越猛。',
    castNarrative: '剑尖抵向敌方，竟全不理对方来招，一式【同归于尽】的决绝剑意已锁死对手',
  },
  yangjia_qiang: {
    id: 'yangjia_qiang',
    name: '杨家枪法',
    slot: 'OUTER',
    tier: 'purple',
    source: '杨家祖传 / 穆念慈',
    powerRatio: 1.55,
    qiDamageRatio: 0.15,
    desc: '枪出如银龙出水，强力破甲；招式佯败而回马一枪，防不胜防。',
    castNarrative: '枪出如银龙出水！你佯装败退，骤然拧腰回身，烂银枪尖一点寒星直透敌方咽喉',
  },
  xiaoyao_you: {
    id: 'xiaoyao_you',
    name: '逍遥游',
    slot: 'OUTER',
    tier: 'blue',
    source: '黄蓉所赠拳谱',
    powerRatio: 1.25,
    critBonus: 8,
    desc: '丐帮三袋弟子常习的拳法，飘逸灵动，暴击率 +8%。',
    castNarrative: '拳势如闲云野鹤，忽左忽右，似是随意挥洒，却把对手逼得处处受制',
  },
  shuangshou_hubo: {
    id: 'shuangshou_hubo',
    name: '双手互搏',
    slot: 'OUTER',
    tier: 'orange',
    source: '清音洞老顽童周伯通',
    powerRatio: 1.72,
    critBonus: 10,
    desc: '左手画方、右手画圆，两路武功同时使出——每回合普通外功有概率触发二次连击！',
    castNarrative: '左手使一路刚猛掌法，右手使一路阴柔拳招，两股劲力各不相扰，同时轰向敌方',
  },
  tanzhi_shentong: {
    id: 'tanzhi_shentong',
    name: '弹指神通',
    slot: 'OUTER',
    tier: 'orange',
    source: '东海桃花岛 · 四阶',
    powerRatio: 1.7,
    critBonus: 18,
    qiDamageRatio: 0.3,
    desc: '指力凌空，精准击穿敌方后排，暴击率 +18%。',
    castNarrative: '中指在拇指上轻轻一弹，嗤的一声锐响，一缕指风穿过人群，直取敌方后排要害',
  },

  // 轻功
  shuishang_piao: {
    id: 'shuishang_piao',
    name: '水上漂',
    slot: 'LIGHT',
    tier: 'purple',
    source: '铁掌帮 / 裘千仞',
    powerRatio: 1.0,
    speedBonus: 38,
    dodgeBonus: 20,
    desc: '踏水无痕，出手速度 +38，闪避 +20%。',
    castNarrative: '足尖在水面一点，身形凌波掠出数丈，衣袂都不曾沾湿',
  },
  shunxi_qianli: {
    id: 'shunxi_qianli',
    name: '瞬息千里',
    slot: 'LIGHT',
    tier: 'orange',
    source: '西域白驼山庄',
    powerRatio: 1.0,
    speedBonus: 55,
    dodgeBonus: 30,
    desc: '白衣一闪，已在千步之外。出手速度 +55，闪避 +30%，闪避后伺机反击。',
    castNarrative: '白衣飘动，脚下快得只剩一道残影，刹那间已欺近敌方背后',
  },

  // 绝技
  yinyang_mo: {
    id: 'yinyang_mo',
    name: '阴阳磨',
    slot: 'ULT',
    tier: 'orange',
    source: '湘西铁掌帮镇派绝技',
    powerRatio: 2.4,
    qiDamageRatio: 0.5,
    desc: '双掌一阴一阳，如磨盘旋转，对敌方主将造成沉重内伤。',
    castNarrative: '双掌一刚一柔，转如磨盘，掌风在敌方身周织成一道无形的阴阳漩涡',
  },
  nizhuan_jiuyin: {
    id: 'nizhuan_jiuyin',
    name: '逆转九阴',
    slot: 'ULT',
    tier: 'red',
    source: '白驼山庄五阶 · 欧阳锋真传',
    powerRatio: 3.0,
    qiDamageRatio: 0.6,
    desc: '倒转经脉，换来毁天灭地的狂暴一击，释放时免疫点穴控制。',
    castNarrative: '倒立而行，周身经脉逆转，一股诡异而磅礴的内劲自头顶贯下，所过之处无不摧折',
  },
  lianzhu_shenjian: {
    id: 'lianzhu_shenjian',
    name: '连珠神箭',
    slot: 'OUTER',
    tier: 'purple',
    source: '蒙古神箭手哲别',
    powerRatio: 1.52,
    critBonus: 14,
    desc: '弓弦连响，数箭首尾相衔，每次出手有概率追加一箭，暴击率 +14%。',
    castNarrative: '弓如满月，一箭未落二箭已出，三支羽箭首尾相衔，如流星般连珠射向敌方要害',
  },
  dashouyin: {
    id: 'dashouyin',
    name: '密宗大手印',
    slot: 'OUTER',
    tier: 'orange',
    source: '雪域灵智上人',
    powerRatio: 1.66,
    qiDamageRatio: 0.25,
    desc: '密宗至刚掌法，重掌震散护体罡气，使敌方下回合防御大减。',
    castNarrative: '口诵梵咒，一掌缓缓按出，掌心泛起暗红，所过之处空气都似凝成了铁',
  },
}

export interface ItemConfig {
  id: string
  name: string
  slot: EquipSlotType
  tier: TierColor
  isTrueUnique?: boolean
  reqStat?: { key: 'str' | 'con' | 'agi' | 'intStat'; val: number; label: string }
  atkBonus?: number
  defBonus?: number
  hpBonus?: number
  critBonus?: number
  idleBonus?: number
  signatureOwner?: string // 名器择主共鸣角色ID/名称
  signatureEffect?: string
  desc: string
}

export const ITEMS: Record<string, ItemConfig> = {
  qinggang_sword: {
    id: 'qinggang_sword',
    name: '青钢长剑',
    slot: 'WEAPON',
    tier: 'blue',
    atkBonus: 45,
    desc: '嘉兴名匠打造的百炼精钢剑，轻灵顺手。',
  },
  xuantie_dagger: {
    id: 'xuantie_dagger',
    name: '牛家村玄铁匕首',
    slot: 'WEAPON',
    tier: 'purple',
    atkBonus: 95,
    critBonus: 15,
    desc: '丘处机赠郭杨两家信物，刃刻“靖”字，削铁如泥，无视25%护甲。',
  },
  biyu_xiao: {
    id: 'biyu_xiao',
    name: '东邪·碧玉箫',
    slot: 'WEAPON',
    tier: 'orange',
    reqStat: { key: 'intStat', val: 35, label: '悟性 ≥ 35' },
    atkBonus: 190,
    critBonus: 18,
    signatureOwner: '黄药师 / 桃花岛传人',
    signatureEffect: '【名器择主】释放《碧海潮生曲》伤害额外 +35%，音律无视护盾！',
    desc: '通体晶莹碧绿的玉箫，既可奏曲惑敌，亦可施展精妙点穴剑招。',
  },
  xuantie_heavysword: {
    id: 'xuantie_heavysword',
    name: '乌金玄铁重剑',
    slot: 'WEAPON',
    tier: 'red',
    reqStat: { key: 'str', val: 40, label: '臂力 ≥ 40' },
    atkBonus: 360,
    signatureOwner: '杨过 / 高臂力重剑宗师',
    signatureEffect: '【重剑无锋，大巧不工】100%无视招架格挡，每次挥剑劲风溅射敌方两翼！',
    desc: '剑魔独孤求败四十岁前所用，重八八六十四斤，无尖无锋，霸道绝伦。',
  },
  dagou_stick_true: {
    id: 'dagou_stick_true',
    name: '真·绿玉打狗棒',
    slot: 'WEAPON',
    tier: 'red',
    isTrueUnique: true,
    reqStat: { key: 'agi', val: 35, label: '身法 ≥ 35' },
    atkBonus: 420,
    critBonus: 25,
    signatureOwner: '洪七公 / 黄蓉',
    signatureEffect: '【全服唯一真品】号令群丐，必定命中，40%概率直接打断敌方绝技！',
    desc: '丐帮帮主世代相传信物，竹碧如玉，坚韧无匹。',
  },
  quanzhen_robe: {
    id: 'quanzhen_robe',
    name: '终南玄门道袍',
    slot: 'ARMOR',
    tier: 'blue',
    defBonus: 55,
    hpBonus: 650,
    idleBonus: 15,
    desc: '全真教制式青色道袍，清心寡欲，离线打坐真气收益 +15%。',
  },
  wucan_baoyi: {
    id: 'wucan_baoyi',
    name: '大雪山乌蚕宝衣',
    slot: 'ARMOR',
    tier: 'orange',
    defBonus: 165,
    hpBonus: 2400,
    desc: '大雪山乌蚕丝织就，刀枪不入，外功伤害减免 30%。',
  },
  ruanwei_armor: {
    id: 'ruanwei_armor',
    name: '桃花岛·软猬甲',
    slot: 'ARMOR',
    tier: 'red',
    defBonus: 260,
    hpBonus: 3800,
    signatureOwner: '黄蓉 / 桃花岛主',
    signatureEffect: '【刀枪不入·倒刺含毒】受到近战攻击必定反弹 40% 伤害并令敌方中毒！',
    desc: '桃花岛镇岛宝甲，生满坚韧倒刺，水火不侵，护身第一神物。',
  },
  iron_bagua: {
    id: 'iron_bagua',
    name: '曲三铁八卦',
    slot: 'ACC',
    tier: 'blue',
    hpBonus: 350,
    idleBonus: 10,
    desc: '序章忘机客遗物，刻有桃花岛暗记。拜入桃花岛必备信物，奇遇触发率 +15%。',
  },
  jiuwei_fox: {
    id: 'jiuwei_fox',
    name: '黑沼·九尾灵狐',
    slot: 'ACC',
    tier: 'orange',
    critBonus: 15,
    hpBonus: 1200,
    desc: '黑沼瑛姑所赠通灵白狐，行动速度 +25%，每场战斗可替主引开一次致命攻击。',
  },
  wumu_yishu: {
    id: 'wumu_yishu',
    name: '岳武穆遗书',
    slot: 'RELIC',
    tier: 'red',
    defBonus: 150,
    hpBonus: 2000,
    desc: '【全队秘宝光环】三人站位暗合岳家军掎角之势：全队防御 +25%，左右翼连携合击率 +25%！',
  },
  xiaoao_qupu: {
    id: 'xiaoao_qupu',
    name: '笑傲江湖琴箫谱',
    slot: 'RELIC',
    tier: 'red',
    critBonus: 20,
    desc: '【全队秘宝光环】刘正风与曲洋绝唱：消除正邪伙伴同队排斥，每回合全队额外回怒 +20！',
  },

  // ───────── 射雕篇补全（第04册 兵刃 / 衣甲 / 佩饰） ─────────
  qimei_stick: {
    id: 'qimei_stick',
    name: '齐眉熟铜棍',
    slot: 'WEAPON',
    tier: 'blue',
    atkBonus: 52,
    desc: '江南武馆的制式铜棍，势大力沉，善于守御。',
  },
  tiebai_bow: {
    id: 'tiebai_bow',
    name: '铁胎硬弓',
    slot: 'WEAPON',
    tier: 'blue',
    reqStat: { key: 'str', val: 18, label: '臂力 ≥ 18' },
    atkBonus: 58,
    desc: '郭靖在大漠射雕所用的铁胎硬弓，弓如满月，开局必定先声夺人。',
  },
  chansi_hufan: {
    id: 'chansi_hufan',
    name: '玄铁缠丝护腕',
    slot: 'WEAPON',
    tier: 'blue',
    atkBonus: 55,
    critBonus: 6,
    desc: '赵王府武库所藏，双拳相击铮然作响，空手拳掌伤害 +12%。',
  },
  fumo_staff: {
    id: 'fumo_staff',
    name: '伏魔大铁杖',
    slot: 'WEAPON',
    tier: 'purple',
    reqStat: { key: 'str', val: 25, label: '臂力 ≥ 25' },
    atkBonus: 118,
    signatureOwner: '柯镇恶 / 江南七怪',
    signatureEffect: '【降魔辟邪】对阵侠义 < 0 的邪派敌人，最终伤害提升 30%！',
    desc: '六十斤重的伏魔铁杖当头砸落，风声恶厉，震得地面青砖寸寸碎裂。',
  },
  yangjia_spear: {
    id: 'yangjia_spear',
    name: '杨家精钢烂银枪',
    slot: 'WEAPON',
    tier: 'purple',
    reqStat: { key: 'str', val: 30, label: '臂力 ≥ 30' },
    atkBonus: 108,
    critBonus: 8,
    signatureOwner: '杨铁心 / 穆念慈',
    signatureEffect: '【回马破甲】施展外功后有 25% 概率触发回马枪，造成 120% 穿刺伤害！',
    desc: '杨家祖传的烂银枪，枪出如银龙出水。',
  },
  xuantie_feizhua: {
    id: 'xuantie_feizhua',
    name: '玄铁飞抓',
    slot: 'WEAPON',
    tier: 'purple',
    reqStat: { key: 'agi', val: 28, label: '身法 ≥ 28' },
    atkBonus: 100,
    critBonus: 12,
    signatureOwner: '梅超风',
    signatureEffect: '【索命盘绕】命中时有 30% 概率缠住敌方，使其下回合无法闪避！',
    desc: '梅超风成名兵刃，银鞭如毒蛇出洞，悄无声息地卷向敌方后心要害。',
  },
  baituo_fan: {
    id: 'baituo_fan',
    name: '白驼山描金折扇',
    slot: 'WEAPON',
    tier: 'purple',
    reqStat: { key: 'intStat', val: 30, label: '悟性 ≥ 30' },
    atkBonus: 98,
    critBonus: 10,
    signatureOwner: '欧阳克 / 白驼山传人',
    signatureEffect: '【扇骨暗箭】每回合行动结束，扇骨机括自动激发三枚喂毒钢针！',
    desc: '风流儒雅的描金折扇，笑吟吟间猛地一按扇柄，三道乌光自扇骨中激射而出。',
  },
  lingshe_zhang: {
    id: 'lingshe_zhang',
    name: '西毒·怪蛇灵蛇杖',
    slot: 'WEAPON',
    tier: 'orange',
    reqStat: { key: 'con', val: 36, label: '根骨 ≥ 36' },
    atkBonus: 205,
    critBonus: 14,
    signatureOwner: '欧阳锋 / 白驼山传人',
    signatureEffect: '【双蛇噬魂】每次普攻或受击，杖头毒蛇自动咬击敌方，叠加两层剧毒！',
    desc: '杖头盘踞两条活毒蛇，欧阳锋纵横西域的成名兵刃。',
  },
  tiancan_glove: {
    id: 'tiancan_glove',
    name: '天蚕金丝掌套',
    slot: 'WEAPON',
    tier: 'orange',
    reqStat: { key: 'con', val: 34, label: '根骨 ≥ 34' },
    atkBonus: 185,
    critBonus: 12,
    signatureEffect: '【空手夺白刃】拳掌类武学最终伤害 +30%，受刀剑攻击有 35% 概率格挡并震麻对手！',
    desc: '铁掌峰密室所藏，以天蚕金丝织就，面对劈面而来的利刃，戴着它的肉掌可直接抓住剑锋。',
  },
  jiudai_baina: {
    id: 'jiudai_baina',
    name: '九袋百衲丐衣',
    slot: 'ARMOR',
    tier: 'purple',
    defBonus: 90,
    hpBonus: 1500,
    desc: '丐帮长老方可穿着的百衲衣，每受一击额外积攒怒气，受暴击伤害降低 25%。',
  },
  baituo_jinsi: {
    id: 'baituo_jinsi',
    name: '白驼金丝锦袍',
    slot: 'ARMOR',
    tier: 'purple',
    defBonus: 85,
    hpBonus: 1400,
    desc: '熏制西域奇香的金丝锦袍，免疫普通蛇虫毒雾，受毒属性伤害降低 60%。',
  },
  ruanwei_shard: {
    id: 'ruanwei_shard',
    name: '软猬甲残片',
    slot: 'ACC',
    tier: 'blue',
    hpBonus: 500,
    desc: '黄蓉所赠的软猬甲一角，满是细密倒刺，贴身佩戴可稍御外力。',
  },
  shuangdiao_arrow: {
    id: 'shuangdiao_arrow',
    name: '双雕白羽箭',
    slot: 'ACC',
    tier: 'purple',
    critBonus: 12,
    hpBonus: 800,
    desc: '郭靖一箭双雕所用的白羽箭，百步穿杨，暴击率 +12%。',
  },
  dadiao_jindao: {
    id: 'dadiao_jindao',
    name: '大漠金刀',
    slot: 'ACC',
    tier: 'orange',
    reqStat: { key: 'str', val: 32, label: '臂力 ≥ 32' },
    critBonus: 10,
    hpBonus: 1800,
    signatureEffect: '【草原雄鹰】对阵金国、蒙古军团及骑兵 Boss，全队伤害提升 35%！',
    desc: '成吉思汗亲赐的镶宝金刀，封"金刀驸马"的信物。',
  },
}

export interface CompanionConfig {
  id: string
  name: string
  title: string
  tier: TierColor
  /** EITHER：左右翼皆可编入（如周伯通，可与洪七公组成「射雕三绝」） */
  role: 'LEFT' | 'RIGHT' | 'EITHER'
  /** 获取路线：STORY 剧情直接入队 / AFFINITY 剧情结识后靠好感养成 / GACHA 客栈结缘抽取（第12册） */
  route: 'STORY' | 'AFFINITY' | 'GACHA'
  /** 好感线橙品的资质（下/中/上），影响属性系数；其余为 undefined */
  grade?: '下' | '中' | '上'
  portraitStyle: PortraitStyle
  /** 尚未结识时，客栈卡片上显示的结识线索 */
  meetHint?: string
  poem: string
  favGift: string
  teachSkillId: string // 好感度达到600(生死之交)传授给主角的绝学
  assistSkillName: string
  assistDesc: string
  baseHp: number
  baseAtk: number
}

export const COMPANIONS: Record<string, CompanionConfig> = {
  kezhene: {
    id: 'kezhene',
    name: '柯镇恶',
    title: '飞天蝙蝠',
    tier: 'blue',
    role: 'RIGHT',
    route: 'STORY',
    portraitStyle: 'assassin',
    poem: '双目虽盲心如铁，伏魔杖下斩邪魔。',
    favGift: '嘉兴黄酒',
    teachSkillId: 'yuenv_jian',
    assistSkillName: '听声毒菱',
    assistDesc: '破除敌方闪避残影，投掷喂毒铁菱削弱护甲。',
    baseHp: 2800,
    baseAtk: 310,
  },
  meichaofeng: {
    id: 'meichaofeng',
    name: '梅超风',
    title: '铁尸·黑风孤影',
    tier: 'purple',
    role: 'LEFT',
    route: 'STORY',
    portraitStyle: 'meichaofeng',
    poem: '桃花岛畔负师恩，大漠荒山泣断魂。',
    favGift: '人皮残卷线索',
    teachSkillId: 'jiuyin_baiguzhua',
    assistSkillName: '白骨锁喉',
    assistDesc: '左翼高暴击追击，撕裂敌方护盾造成流血。',
    baseHp: 4200,
    baseAtk: 520,
  },
  guojing: {
    id: 'guojing',
    name: '郭靖',
    title: '北侠·侠之大者',
    tier: 'orange',
    role: 'LEFT',
    route: 'STORY',
    portraitStyle: 'guojing',
    poem: '弯弓射雕大漠北，赤胆忠魂守襄阳。',
    favGift: '蒙古马奶酒',
    teachSkillId: 'xianglong_18',
    assistSkillName: '双龙取水',
    assistDesc: '至强护卫副C：主角受重创时跨步挡刀，并以刚猛降龙掌连携追击！',
    baseHp: 7500,
    baseAtk: 680,
  },
  huangrong: {
    id: 'huangrong',
    name: '黄蓉',
    title: '桃花仙子·丐帮女侠',
    tier: 'orange',
    role: 'RIGHT',
    route: 'STORY',
    portraitStyle: 'huangrong',
    poem: '白衣金带摇竹杖，巧笑嫣然破千军。',
    favGift: '八宝肥鸭',
    teachSkillId: 'dagou_bangfa',
    assistSkillName: '打狗绊字诀',
    assistDesc: '顶级奇策控场：布奇门阵加全队闪避，每2回合精准封穴打断敌方主力。',
    baseHp: 5200,
    baseAtk: 560,
  },
  hongqigong: {
    id: 'hongqigong',
    name: '洪七公',
    title: '北丐·九指神丐',
    tier: 'red',
    role: 'LEFT',
    route: 'AFFINITY',
    portraitStyle: 'hongqigong',
    poem: '朱红酒葫绿玉杖，神龙摆尾傲苍穹。',
    favGift: '荷叶叫花鸡',
    teachSkillId: 'kanglong_youhui',
    assistSkillName: '神龙摆尾',
    assistDesc: '神话破阵：全队刚猛外功伤害 +25%，高频触发霸道掌风连击。',
    baseHp: 9600,
    baseAtk: 920,
  },
  huangyaoshi: {
    id: 'huangyaoshi',
    name: '黄药师',
    title: '东邪·桃花岛主',
    tier: 'red',
    role: 'RIGHT',
    route: 'AFFINITY',
    portraitStyle: 'huangyaoshi',
    poem: '桃花影落飞神剑，碧海潮生按玉箫。',
    favGift: '广陵散古谱',
    teachSkillId: 'bihai_chaosheng',
    assistSkillName: '弹指神通',
    assistDesc: '神话奇策：压制敌方全体出手速度，凌空弹指秒杀残血目标。',
    baseHp: 7800,
    baseAtk: 890,
  },
  zhoubotong: {
    id: 'zhoubotong',
    name: '周伯通',
    title: '老顽童',
    tier: 'red',
    role: 'EITHER',
    route: 'AFFINITY',
    portraitStyle: 'zhoubotong',
    poem: '左手画方右画圆，清音洞里乐忘年。',
    favGift: '大将军促织(蟋蟀)',
    teachSkillId: 'kongming_quan',
    assistSkillName: '双手互搏连击',
    assistDesc: '每次触发协战必定连出两拳，且免疫一切心神混乱状态！',
    baseHp: 8900,
    baseAtk: 860,
  },
  munianci: {
    id: 'munianci',
    name: '穆念慈',
    title: '红衣女侠·杨家后人',
    tier: 'purple',
    role: 'LEFT',
    route: 'STORY',
    portraitStyle: 'munianci',
    meetHint: '通关主线「2-1 比武招亲」后入队',
    poem: '红衣劲装柳叶刀，三分英气七分愁。',
    favGift: '牛家村桂花酿',
    teachSkillId: 'yangjia_qiang',
    assistSkillName: '逍遥铁掌',
    assistDesc: '替主角分摊 30% 单体伤害，并反击敌方前排。',
    baseHp: 4600,
    baseAtk: 480,
  },
  ouyangfeng: {
    id: 'ouyangfeng',
    name: '欧阳锋',
    title: '西毒·白驼山主',
    tier: 'red',
    role: 'LEFT',
    route: 'AFFINITY',
    portraitStyle: 'ouyangfeng',
    meetHint: '救下欧阳克（折扇支线）结交，或击败「5-3 华山绝巅」后重逢',
    poem: '灵蛇出洞风云变，一式蛤蟆震八荒。',
    favGift: '西域蛇胆酒',
    teachSkillId: 'hama_gong',
    assistSkillName: '蛤蟆劲',
    assistDesc: '蓄势三层后下一击伤害翻倍，震退敌方前排，攻击附带蛇毒。',
    baseHp: 9200,
    baseAtk: 900,
  },
  // ───────── 第一批扩充：五绝补全 / 全真 / 大漠 / 杨家 / 桃花等（第12册 §三） ─────────
  yideng: {
    id: 'yideng',
    name: '一灯大师',
    title: '南帝·大理段皇爷',
    tier: 'red',
    role: 'RIGHT',
    route: 'GACHA',
    portraitStyle: 'yideng',
    meetHint: '客栈「结缘」抽取；或完成「一灯大师的慈悲」后重逢',
    poem: '一指洞明千重甲，枯荣禅里见真空。',
    favGift: '桃源山泉清茗',
    teachSkillId: 'kurong_chan',
    assistSkillName: '一阳回春',
    assistDesc: '顶级疗伤奇策：每回合为全队回复气血，并以一阳指点穴封住敌方主力。',
    baseHp: 8400,
    baseAtk: 820,
  },
  wangchongyang: {
    id: 'wangchongyang',
    name: '王重阳',
    title: '中神通·重阳祖师（遗泽）',
    tier: 'red',
    role: 'LEFT',
    route: 'GACHA',
    portraitStyle: 'wangchongyang',
    meetHint: '客栈「结缘」限定抽取（祖师已仙逝，以遗泽残影相助）',
    poem: '先天一炁贯终南，华山论剑第一人。',
    favGift: '终南古松茶',
    teachSkillId: 'xiantian_gong',
    assistSkillName: '先天遗泽',
    assistDesc: '遗泽残影替主角承受首次致命一击，并清除全队中毒与封穴。',
    baseHp: 10200,
    baseAtk: 980,
  },
  qiuchuji: {
    id: 'qiuchuji',
    name: '丘处机',
    title: '长春子·全真七子',
    tier: 'orange',
    role: 'LEFT',
    route: 'AFFINITY',
    grade: '下',
    portraitStyle: 'daoist',
    meetHint: '通关主线「2-3 终南金雁」后结识，客栈养好感',
    poem: '一剑江湖四十载，侠名长在牛家村。',
    favGift: '嘉兴黄酒',
    teachSkillId: 'tonggui_jian',
    assistSkillName: '长春剑阵',
    assistDesc: '侠义满格的前排输出：对邪派敌人伤害提升，并为主角挡下一次重击。',
    baseHp: 7000,
    baseAtk: 650,
  },
  qiuqianren: {
    id: 'qiuqianren',
    name: '裘千仞',
    title: '铁掌水上漂',
    tier: 'orange',
    role: 'LEFT',
    route: 'AFFINITY',
    grade: '下',
    portraitStyle: 'qiuqianren',
    meetHint: '通关主线「4-3 铁掌孤峰」后结识，客栈养好感',
    poem: '铁掌横绝湘西路，一念回头是旧恩。',
    favGift: '湘西腊肉',
    teachSkillId: 'tiezhang_gong',
    assistSkillName: '铁掌连环',
    assistDesc: '重伤前排：命中使敌方 3 回合内受到的疗伤效果大幅降低。',
    baseHp: 7400,
    baseAtk: 700,
  },
  yangkang: {
    id: 'yangkang',
    name: '杨康',
    title: '金国小王爷',
    tier: 'orange',
    role: 'LEFT',
    route: 'AFFINITY',
    grade: '下',
    portraitStyle: 'wanyankang',
    meetHint: '通关主线「4-2 牛家密室」后结识，客栈养好感',
    poem: '一身兼得全真与白骨，半是侠名半是奸。',
    favGift: '赵王府贡酒',
    teachSkillId: 'jiuyin_baiguzhua',
    assistSkillName: '白骨双爪',
    assistDesc: '高暴击刺客：以全真剑法起手，白骨爪收尾，专取残血目标。',
    baseHp: 6600,
    baseAtk: 640,
  },
  zhebie: {
    id: 'zhebie',
    name: '哲别',
    title: '蒙古神箭手',
    tier: 'orange',
    role: 'EITHER',
    route: 'GACHA',
    portraitStyle: 'zhebie',
    meetHint: '客栈「结缘」抽取；通关「5-1 铁骑西征」后概率更高',
    poem: '一箭穿云三百步，草原万里认神箭。',
    favGift: '蒙古马奶酒',
    teachSkillId: 'lianzhu_shenjian',
    assistSkillName: '连珠神箭',
    assistDesc: '远程输出：每回合追加数箭，优先射杀敌方后排与残血单位。',
    baseHp: 6800,
    baseAtk: 680,
  },
  lingzhi: {
    id: 'lingzhi',
    name: '灵智上人',
    title: '密宗大手印',
    tier: 'orange',
    role: 'RIGHT',
    route: 'GACHA',
    portraitStyle: 'monk',
    meetHint: '客栈「结缘」抽取',
    poem: '雪域梵音生杀意，一印可碎百重甲。',
    favGift: '雪山酥油茶',
    teachSkillId: 'dashouyin',
    assistSkillName: '大手印',
    assistDesc: '密宗控场：重掌震散敌方护体罡气，使其下回合防御大减。',
    baseHp: 6400,
    baseAtk: 620,
  },
  yinggu: {
    id: 'yinggu',
    name: '瑛姑',
    title: '神算子',
    tier: 'orange',
    role: 'RIGHT',
    route: 'AFFINITY',
    grade: '下',
    portraitStyle: 'yinggu',
    meetHint: '完成支线「瑛姑的算术题」后结识，客栈养好感',
    poem: '九宫立方算不尽，一生痴恨一生情。',
    favGift: '黑沼莲子羹',
    teachSkillId: 'niqiu_gong',
    assistSkillName: '九宫推演',
    assistDesc: '奇门算术：推演敌方出手顺序，使其本回合最强一击落空。',
    baseHp: 5400,
    baseAtk: 560,
  },
  mayu: {
    id: 'mayu',
    name: '马钰',
    title: '丹阳子·全真七子之首',
    tier: 'purple',
    role: 'RIGHT',
    route: 'STORY',
    portraitStyle: 'daoist',
    meetHint: '通关主线「2-3 终南金雁」后入队',
    poem: '清静无为守玄关，一路春风度弟子。',
    favGift: '终南山泉',
    teachSkillId: 'quanzhen_tuna',
    assistSkillName: '丹阳调息',
    assistDesc: '玄门疗伤：每回合为主角回复气血，并化解一次封穴。',
    baseHp: 4800,
    baseAtk: 430,
  },
  tanchuduan: {
    id: 'tanchuduan',
    name: '谭处端',
    title: '长真子',
    tier: 'purple',
    role: 'LEFT',
    route: 'STORY',
    portraitStyle: 'daoist',
    meetHint: '击败「2-3 终南金雁」中的谭处端后入队',
    poem: '剑出中正不偏锋，守得云开见月明。',
    favGift: '终南松子',
    teachSkillId: 'jinyan_gong',
    assistSkillName: '长真剑',
    assistDesc: '稳健前排：替主角分担伤害，并以剑势稳稳压住对手。',
    baseHp: 4900,
    baseAtk: 470,
  },
  wangchuyi: {
    id: 'wangchuyi',
    name: '王处一',
    title: '玉阳子·铁脚仙',
    tier: 'purple',
    role: 'RIGHT',
    route: 'AFFINITY',
    portraitStyle: 'daoist',
    meetHint: '通关主线「2-3 终南金雁」后结识，客栈养好感；或客栈「结缘」抽取',
    poem: '铁脚踏破千重岭，一身是胆不言倦。',
    favGift: '山野蜂蜜',
    teachSkillId: 'pikong_zhang',
    assistSkillName: '铁脚横扫',
    assistDesc: '近身奇策：低扫腿招打乱敌方站位，使其前排本回合行动受阻。',
    baseHp: 4700,
    baseAtk: 450,
  },
  sunbuer: {
    id: 'sunbuer',
    name: '孙不二',
    title: '清静散人',
    tier: 'purple',
    role: 'RIGHT',
    route: 'GACHA',
    portraitStyle: 'sunbuer',
    meetHint: '客栈「结缘」抽取',
    poem: '清静无为女冠子，剑底一缕冷香浮。',
    favGift: '桂花糕',
    teachSkillId: 'yuenv_jian',
    assistSkillName: '清静剑',
    assistDesc: '灵巧奇策：以快剑封住敌方腕脉，使其暴击率下降。',
    baseHp: 4400,
    baseAtk: 500,
  },
  ouyangke: {
    id: 'ouyangke',
    name: '欧阳克',
    title: '白驼山少主',
    tier: 'purple',
    role: 'RIGHT',
    route: 'AFFINITY',
    portraitStyle: 'ouyangke',
    meetHint: '完成支线「白驼山少主的折扇」后结识，客栈养好感',
    poem: '折扇轻摇风流客，一朝蛇毒付东流。',
    favGift: '西域葡萄酒',
    teachSkillId: 'lingshe_quan',
    assistSkillName: '扇骨毒针',
    assistDesc: '毒系辅助：每回合射出喂毒钢针，使敌方持续损耗气血。',
    baseHp: 4200,
    baseAtk: 480,
  },
  yangtiexin: {
    id: 'yangtiexin',
    name: '杨铁心',
    title: '穆易·杨家后人',
    tier: 'purple',
    role: 'EITHER',
    route: 'STORY',
    portraitStyle: 'yangtiexin',
    meetHint: '支线「铁枪庙旧事」选择救治后入队',
    poem: '一杆烂银枪在手，不负汴京旧时月。',
    favGift: '临安桂花酿',
    teachSkillId: 'yangjia_qiang',
    assistSkillName: '回马枪',
    assistDesc: '稳健破阵：佯败回身一枪，强力破甲，并与穆念慈同队时互相庇护。',
    baseHp: 4900,
    baseAtk: 500,
  },
  luchengfeng: {
    id: 'luchengfeng',
    name: '陆乘风',
    title: '归云庄主·桃花岛门人',
    tier: 'purple',
    role: 'LEFT',
    route: 'STORY',
    portraitStyle: 'luchengfeng',
    meetHint: '通关主线「3-2 归云庄主」后入队',
    poem: '太湖云水归庄晚，一掌桃花是故人。',
    favGift: '太湖银鱼',
    teachSkillId: 'luoying_zhang',
    assistSkillName: '归云掌',
    assistDesc: '桃花门下稳健前排：落英掌法削弱敌方命中，为主角分担伤害。',
    baseHp: 4600,
    baseAtk: 460,
  },
  zhuziliu: {
    id: 'zhuziliu',
    name: '朱子柳',
    title: '读书人·一灯弟子',
    tier: 'purple',
    role: 'RIGHT',
    route: 'STORY',
    portraitStyle: 'zhuziliu',
    meetHint: '通关主线「4-3 铁掌孤峰」后（渔樵耕读之“读”）入队',
    poem: '一支判官笔，写尽江湖字字锋。',
    favGift: '松烟墨锭',
    teachSkillId: 'yiyang_zhi',
    assistSkillName: '书法点穴',
    assistDesc: '以笔代指：一笔点向敌方要穴，使其下一回合出招迟滞。',
    baseHp: 4300,
    baseAtk: 440,
  },
}

/** 1主+2副 经典三人行羁绊共鸣 */
export const TRIO_SYNERGIES = [
  {
    id: 'jing_rong',
    name: '靖蓉同心',
    leftId: 'guojing',
    rightId: 'huangrong',
    bonusText: '郭靖护甲 +35%，黄蓉点穴率 +20%；黄蓉控场瞬间主角与郭靖必定发动双龙合击！',
  },
  {
    id: 'dong_bei',
    name: '东邪北丐',
    leftId: 'hongqigong',
    rightId: 'huangyaoshi',
    bonusText: '五绝争辉：全队内力压制系数上限突破至 1.65x，开局额外获得 35 点怒气！',
  },
  {
    id: 'tong_rong',
    name: '顽童戏蓉',
    leftId: 'zhoubotong',
    rightId: 'huangrong',
    bonusText: '奇思妙想：全队闪避率 +20%，每回合30%概率骗空敌方单体大招！',
  },
  {
    id: 'dong_xi',
    name: '东邪西毒',
    leftId: 'ouyangfeng',
    rightId: 'huangyaoshi',
    bonusText: '正邪逆乱：敌方每回合既承受【碧海内伤】又承受【灵蛇奇毒】，两种状态叠满三层引爆，造成其最大气血 25% 的真实伤害！',
  },
  {
    id: 'she_diao_san_jue',
    name: '射雕三绝',
    leftId: 'hongqigong',
    rightId: 'zhoubotong',
    bonusText: '猜拳连击：全队每回合行动后有 35% 概率触发老顽童与北丐的“猜拳连击”，无消耗再打一轮外功！',
  },
  {
    id: 'chong_yang_yi_ze',
    name: '重阳遗泽',
    leftId: 'wangchongyang',
    rightId: 'mayu',
    bonusText: '师徒传承：遗泽残影与马钰同守玄关，全队首次受到致命伤时免死，并回复 30% 气血！',
  },
  {
    id: 'fu_nv_tong_xin',
    name: '父女同心',
    leftId: 'munianci',
    rightId: 'yangtiexin',
    bonusText: '杨家枪与柳叶刀并肩：两人互相庇护，任一人受到致命伤时由另一人代为承受一次！',
  },
  {
    id: 'nan_bei',
    name: '南帝北丐',
    leftId: 'hongqigong',
    rightId: 'yideng',
    bonusText: '五绝之二同阵：降龙掌破阵、一阳指回春，全队每回合回复 6% 气血，外功伤害 +20%！',
  },
  {
    id: 'yi_sheng_chi_chan',
    name: '一生痴缠',
    leftId: 'zhoubotong',
    rightId: 'yinggu',
    bonusText: '老顽童与神算子半生纠葛：全队免疫心神混乱，瑛姑的九宫推演必定命中！',
  },
  {
    id: 'she_diao_shuang_xiong',
    name: '射雕双雄',
    leftId: 'guojing',
    rightId: 'zhebie',
    bonusText: '大漠双箭：哲别的连珠神箭追加次数 +1，郭靖降龙掌破甲后必定触发合击！',
  },
  {
    id: 'wang_fu_shuang_bi',
    name: '王府双璧',
    leftId: 'yangkang',
    rightId: 'ouyangke',
    bonusText: '赵王府座上宾：毒针与白骨爪交织，敌方每层毒伤都令白骨爪暴击率 +8%！',
  },
]

/** 左右翼可互换（周伯通为 EITHER），按无序配对查找羁绊 */
export function findTrioSynergy(leftId: string | null, rightId: string | null) {
  if (!leftId || !rightId) return null
  return (
    TRIO_SYNERGIES.find(
      (s) => (s.leftId === leftId && s.rightId === rightId) || (s.leftId === rightId && s.rightId === leftId)
    ) ?? null
  )
}

/** 收集羁绊：拥有（已入队）该套装 N 位成员即获得全局加成，档位叠加取最高一档 */
export interface CompanionSetTier {
  count: number
  label: string
  hpPct?: number
  atkPct?: number
  idleQiPct?: number
}
export interface CompanionSetConfig {
  id: string
  name: string
  desc: string
  memberIds: string[]
  /** 尚未登场的成员（后续批次），仅用于展示“还差几位”，不参与计数 */
  plannedMembers?: string[]
  tiers: CompanionSetTier[]
}

export const COMPANION_SETS: CompanionSetConfig[] = [
  {
    id: 'quanzhen_qizi',
    name: '全真七子',
    desc: '终南全真教七位真人。集齐北斗七星，可布「天罡北斗阵」。',
    memberIds: ['qiuchuji', 'mayu', 'tanchuduan', 'wangchuyi', 'sunbuer'],
    plannedMembers: ['刘处玄', '郝大通'],
    tiers: [
      { count: 3, label: '三才初成', idleQiPct: 10 },
      { count: 5, label: '五行归元', idleQiPct: 20, hpPct: 5 },
      { count: 7, label: '天罡北斗阵', idleQiPct: 30, hpPct: 10, atkPct: 8 },
    ],
  },
  {
    id: 'wu_jue',
    name: '天下五绝',
    desc: '东邪、西毒、南帝、北丐、中神通。五绝齐聚，华山论剑之资。',
    memberIds: ['huangyaoshi', 'ouyangfeng', 'yideng', 'hongqigong', 'wangchongyang'],
    tiers: [
      { count: 2, label: '二绝并立', atkPct: 4 },
      { count: 3, label: '三足鼎立', atkPct: 8, hpPct: 4 },
      { count: 5, label: '五绝争辉', atkPct: 15, hpPct: 10 },
    ],
  },
  {
    id: 'yang_jia',
    name: '杨门忠烈',
    desc: '牛家村杨氏一脉：杨铁心、穆念慈、杨康，骨肉分合，家国情长。',
    memberIds: ['yangtiexin', 'munianci', 'yangkang'],
    tiers: [
      { count: 2, label: '骨肉相认', hpPct: 4 },
      { count: 3, label: '杨门忠烈', hpPct: 8, atkPct: 6 },
    ],
  },
]

/** 当前已激活的收集羁绊（每套取已达成的最高一档） */
export function activeSetBonuses(isOwned: (companionId: string) => boolean) {
  return COMPANION_SETS.map((set) => {
    const owned = set.memberIds.filter(isOwned).length
    const tier = [...set.tiers].reverse().find((t) => owned >= t.count) ?? null
    return { set, owned, tier }
  })
}

/** 拜师门槛判定所需的上下文：六维 + 持有信物 + 剧情标记 */
export interface SectCheckCtx {
  hasBagua: boolean
  flags: string[]
}

export interface SectConfig {
  id: string
  name: string
  alignment: 'RIGHTEOUS' | 'HERETIC' | 'NEUTRAL'
  chiefPlayerName: string // 当前本服真实玩家【首席大弟子】
  chiefPower: number
  reqDesc: string
  checkReq: (stats: { str: number; con: number; agi: number; intStat: number; karma: number }, ctx: SectCheckCtx) => { ok: boolean; reason?: string }
  perkDesc: string
  ranks: string[]
  /** 按阶位授武：下标 = 阶位 - 1，第 1 阶在拜师时传授；null 表示该阶无新武学 */
  signatureSkills: (string | null)[]
  /** 晋升到指定阶位时额外赠予的装备（阶位 → 装备ID） */
  signatureItems?: Record<number, string>
  /** 持有此剧情标记入门，起始门派贡献额外 +introBonus */
  introFlag?: string
  introBonus?: number
}

export const SECTS: SectConfig[] = [
  {
    id: 'gaibang',
    name: '丐帮',
    alignment: 'RIGHTEOUS',
    chiefPlayerName: '萧峰传人·乔北冥',
    chiefPower: 148200,
    reqDesc: '无属性门槛，仅需【侠义 ≥ 0】即可奉酒入帮；持【丐帮引荐信】入门贡献 +150',
    checkReq: (s) => (s.karma >= 0 ? { ok: true } : { ok: false, reason: '行事偏邪（侠义 < 0），鲁有脚拒收' }),
    perkDesc: '越战越勇，残血爆发 +25%；可参与君山升袋大比继承【打狗棒法】与【降龙十八掌】。',
    ranks: ['一袋弟子', '三袋弟子', '六袋精锐', '九袋护法长老', '神丐衣钵传人'],
    signatureSkills: ['huntian_qigong', 'fengmo_zhang', 'xiaoyao_you', 'dagou_bangfa', 'xianglong_18'],
    signatureItems: { 4: 'jiudai_baina' },
    introFlag: 'gaibang_letter',
    introBonus: 150,
  },
  {
    id: 'quanzhen',
    name: '终南全真教',
    alignment: 'RIGHTEOUS',
    chiefPlayerName: '重阳首座·清风道长',
    chiefPower: 139500,
    reqDesc: '需【根骨 ≥ 22】且【侠义 ≥ 20】',
    checkReq: (s) =>
      s.con >= 22 && s.karma >= 20
        ? { ok: true }
        : { ok: false, reason: '需根骨 ≥ 22 且侠义 ≥ 20 方可入重阳宫' },
    perkDesc: '玄门正宗，离线闭关打坐真气额外 +25%！可与同门结天罡北斗阵（注：叛全真可触发古墓派隐藏线）。',
    ranks: ['知客道童', '四代弟子', '三代精锐', '北斗护法真人', '玄门掌教候选'],
    signatureSkills: ['quanzhen_tuna', 'jinyan_gong', 'tonggui_jian', null, 'xiantian_gong'],
  },
  {
    id: 'taohua',
    name: '东海桃花岛',
    alignment: 'NEUTRAL',
    chiefPlayerName: '桃花首座·陆乘云',
    chiefPower: 162400,
    reqDesc: '高门槛：需【悟性 ≥ 28】【身法 ≥ 24】且持有【曲三铁八卦】或桃花岛信物',
    checkReq: (s, ctx) =>
      s.intStat >= 28 && s.agi >= 24 && (ctx.hasBagua || ctx.flags.includes('taohua_token'))
        ? { ok: true }
        : { ok: false, reason: '需悟性≥28、身法≥24 并持有【曲三铁八卦】或桃花岛信物方可破桃花阵登岛' },
    perkDesc: '奇门五行，音律控场；离线额外炼制【九花玉露丸】，招式灵动飘逸。',
    ranks: ['候补扫花童', '记名弟子', '入室师兄', '桃花岛真传', '东邪衣钵传人'],
    signatureSkills: ['luoying_zhang', 'lanhua_fuxue', null, 'tanzhi_shentong', 'bihai_chaosheng'],
  },
  {
    id: 'baituo',
    name: '西域白驼山庄',
    alignment: 'HERETIC',
    chiefPlayerName: '西域毒皇·欧阳烈',
    chiefPower: 155900,
    reqDesc: '邪派门槛：需【根骨 ≥ 24】且【侠义 ≤ 0】',
    checkReq: (s) =>
      s.con >= 24 && s.karma <= 0
        ? { ok: true }
        : { ok: false, reason: '需根骨≥24 且心狠手辣（侠义 ≤ 0）方可入万蛇窟' },
    perkDesc: '万蛇淬毒，普攻叠毒持续扣血；进入子时鬼市免蒙面享 9 折特权！',
    ranks: ['捕蛇杂役', '饲毒使者', '白衣护卫', '白驼副总管', '西毒少庄主'],
    signatureSkills: ['hama_gong', 'lingshe_quan', 'shunxi_qianli', null, 'nizhuan_jiuyin'],
    signatureItems: { 3: 'baituo_jinsi' },
  },
  {
    id: 'jiangnan_wuguan',
    name: '江南武馆',
    alignment: 'NEUTRAL',
    chiefPlayerName: '武馆总教头·铁拳张',
    chiefPower: 31800,
    reqDesc: '无任何条件，新手随时可入，可随时无损出师转投名门',
    checkReq: () => ({ ok: true }),
    perkDesc: '基础属性均衡成长，适合新手过渡；馆中教头会倾囊传授入门武学，出师后绝不追究。',
    ranks: ['打杂学徒', '记名弟子', '入室弟子', '武馆教头', '馆主衣钵'],
    signatureSkills: ['kaishan_zhang', 'fengmo_zhang', 'yuenv_jian', null, null],
    signatureItems: { 2: 'qimei_stick' },
  },
  {
    id: 'tiezhang',
    name: '湘西铁掌帮',
    alignment: 'NEUTRAL',
    chiefPlayerName: '铁掌少帮主·裘千尺',
    chiefPower: 98400,
    reqDesc: '无善恶限制，需【臂力 ≥ 20】',
    checkReq: (s) => (s.str >= 20 ? { ok: true } : { ok: false, reason: '需臂力 ≥ 20 方能硬接铁掌帮的入门三掌' }),
    perkDesc: '刚猛霸道，专精破甲与内伤；适合走纯粹暴力输出流的玩家。',
    ranks: ['挑水杂役', '外堂弟子', '内堂掌刑', '铁掌堂主', '帮主衣钵'],
    signatureSkills: ['tiezhang_gong', 'shuishang_piao', null, 'yinyang_mo', null],
  },
  {
    id: 'yideng',
    name: '大理一灯居',
    alignment: 'RIGHTEOUS',
    chiefPlayerName: '渡厄居士·段无涯',
    chiefPower: 66800,
    reqDesc: '高门槛：需【根骨 ≥ 30】【侠义 ≥ 80】，并已通过「渔樵耕读」四关（通关主线 4-3）',
    checkReq: (s, ctx) =>
      s.con >= 30 && s.karma >= 80 && ctx.flags.includes('yuqiao_gengdu')
        ? { ok: true }
        : { ok: false, reason: '需根骨≥30、侠义≥80，且通关「4-3 铁掌孤峰」通过渔樵耕读四关' },
    perkDesc: '指力化气，无视敌方铁布衫等外功防御；兼具极强的点穴封招与疗伤能力。',
    ranks: ['洒扫沙弥', '樵子弟子', '渔隐弟子', '耕读高徒', '南帝衣钵传人'],
    signatureSkills: ['kurong_chan', null, 'yiyang_zhi', null, null],
  },
]

export interface MapZoneConfig {
  id: string
  name: string
  volumeLabel: string
  safety: ZoneSafety
  baseQiPerHour: number
  onlineCount: number
  ambientDesc: string
  /** 需已通关的主线节点ID（maxChapterId > reqCleared 即解锁）；缺省表示开局可达 */
  reqCleared?: number
  unlockHint?: string
}

export const MAPS: MapZoneConfig[] = [
  {
    id: 'jiaxing_suburb',
    name: '嘉兴烟雨楼外',
    volumeLabel: '射雕·江南',
    safety: 'PEACE',
    baseQiPerHour: 1800,
    onlineCount: 58,
    ambientDesc: '南湖烟雨迷蒙，画舫凌波，岸边垂柳下不少初涉江湖的少侠正在吐纳论剑。',
  },
  {
    id: 'zhongnan_forest',
    name: '终南山·后山密林',
    volumeLabel: '射雕/神雕',
    safety: 'PEACE',
    baseQiPerHour: 2900,
    onlineCount: 42,
    ambientDesc: '终南山道观钟声悠远，古墓寒气隐隐透林而出，最宜清心打坐共修。',
  },
  {
    id: 'damo_caravan',
    name: '大漠古商道（押镖线）',
    volumeLabel: '纷争·塞外',
    safety: 'CONTESTED',
    baseQiPerHour: 4200,
    onlineCount: 31,
    ambientDesc: '【限定纷争区】黄沙漫天，驼铃声急。灵脉收益 +30%，但随时可能遭遇白驼山与绿林侠客拔刀劫镖。',
  },
  {
    id: 'heizhao_swamp',
    name: '湘西·黑沼泥潭',
    volumeLabel: '纷争·铁掌禁地',
    safety: 'CONTESTED',
    baseQiPerHour: 5100,
    onlineCount: 24,
    ambientDesc: '【限定纷争区】瘴气弥漫，泥沼深处藏有九宫灵脉与铁掌峰秘宝，正邪高手在此频频交手夺脉。',
  },
  {
    id: 'guiyun_lake',
    name: '太湖·归云庄',
    volumeLabel: '射雕·江南',
    safety: 'PEACE',
    baseQiPerHour: 3600,
    onlineCount: 36,
    ambientDesc: '太湖烟波浩渺，归云庄的白墙黛瓦倒映湖心，陆庄主门下弟子常在水榭中论剑清修。',
    reqCleared: 7,
    unlockHint: '通关主线「3-1 松林长啸」后开启',
  },
  {
    id: 'taohua_isle',
    name: '东海·桃花岛',
    volumeLabel: '射雕·东海',
    safety: 'PEACE',
    baseQiPerHour: 5600,
    onlineCount: 27,
    ambientDesc: '桃花万株，奇门遍布，海风里隐隐传来碧海潮生的箫声；闲人莫入，入者须自求出路。',
    reqCleared: 8,
    unlockHint: '通关主线「3-2 归云庄主」获赠海船后开启',
  },
  {
    id: 'huashan_peak',
    name: '华山·论剑绝顶',
    volumeLabel: '纷争·华山',
    safety: 'CONTESTED',
    baseQiPerHour: 7400,
    onlineCount: 19,
    ambientDesc: '【限定纷争区】云海翻涌，群峰如剑；每二十五年一度的华山论剑，使这里成了天下高手觊觎之所。灵脉收益 +40%。',
    reqCleared: 15,
    unlockHint: '通关主线「5-2 烟雨重逢」后开启',
  },
]

/** 地图是否已对当前主线进度开放 */
export const isMapUnlocked = (m: MapZoneConfig, maxChapterId: number) => m.reqCleared === undefined || maxChapterId > m.reqCleared

// 第一卷主线 / 支线数据见 storyData.ts，这里统一再导出，保持对外 import 路径稳定
export { STORY_ARCS, STORY_CHAPTERS, ADVENTURES, adventureById, STAT_LABEL } from './storyData'
export type { StoryNodeConfig as StoryChapterConfig, Reward, AdventureConfig, AdventureChoice, AdventureCtx, StatKey } from './storyData'

/**
 * 数据引用自检：任何 skill / item / companion / map / 节点 id 写错，都会在这里报出来。
 * 开发期由 gameStore 初始化时调用并 console.warn；冒烟测试里断言为空。
 */
export function validateGameData(): string[] {
  const errs: string[] = []
  const chk = (ok: boolean, msg: string) => {
    if (!ok) errs.push(msg)
  }
  const nodeIds = STORY_CHAPTERS.map((c) => c.id)
  chk(nodeIds.every((id, i) => id === i + 1), '主线节点 id 必须从 1 起连续递增')

  const checkReward = (r: Reward, where: string) => {
    r.skills?.forEach((id) => chk(!!SKILLS[id], `${where}: 未知武学 ${id}`))
    Object.keys(r.skillBoost ?? {}).forEach((id) => chk(!!SKILLS[id], `${where}: 未知武学(skillBoost) ${id}`))
    r.items?.forEach((id) => chk(!!ITEMS[id], `${where}: 未知装备 ${id}`))
    Object.keys(r.affinity ?? {}).forEach((id) => chk(!!COMPANIONS[id], `${where}: 未知伙伴 ${id}`))
  }

  for (const n of STORY_CHAPTERS) {
    const w = `主线 ${n.code}`
    n.dropItemIds?.forEach((id) => chk(!!ITEMS[id], `${w}: 未知掉落装备 ${id}`))
    n.dropSkillIds?.forEach((id) => chk(!!SKILLS[id], `${w}: 未知掉落武学 ${id}`))
    checkReward(n.firstClear, `${w} 首通`)
  }

  const ctxs: AdventureCtx[] = [
    { stats: { str: 10, con: 10, agi: 10, intStat: 10, luck: 10, karma: 0 }, isWanderer: false, flags: [], items: [], silver: 0 },
    { stats: { str: 99, con: 99, agi: 99, intStat: 99, luck: 99, karma: 0 }, isWanderer: true, flags: [], items: ['iron_bagua'], silver: 99999 },
    { stats: { str: 30, con: 30, agi: 30, intStat: 30, luck: 30, karma: 0 }, isWanderer: false, flags: [], items: [], silver: 99999 },
  ]
  for (const a of ADVENTURES) {
    const w = `奇遇「${a.title}」`
    chk(a.afterNodeId === 0 || nodeIds.includes(a.afterNodeId), `${w}: afterNodeId=${a.afterNodeId} 不存在`)
    chk(a.choices.some((c) => !c.require && !c.costSilver), `${w}: 至少要有一个无门槛选项，否则可能卡死`)
    for (const c of a.choices) {
      for (const ctx of ctxs) checkReward(typeof c.reward === 'function' ? c.reward(ctx) : c.reward, `${w} 选项${c.key}`)
    }
  }

  for (const c of Object.values(COMPANIONS)) chk(!!SKILLS[c.teachSkillId], `伙伴 ${c.name}: 未知传功武学 ${c.teachSkillId}`)
  for (const s of SECTS) {
    chk(s.ranks.length === 5, `门派 ${s.name}: 必须五阶`)
    chk(s.signatureSkills.length === 5, `门派 ${s.name}: signatureSkills 必须与五阶等长`)
    s.signatureSkills.forEach((id) => id && chk(!!SKILLS[id], `门派 ${s.name}: 未知武学 ${id}`))
    Object.values(s.signatureItems ?? {}).forEach((id) => chk(!!ITEMS[id], `门派 ${s.name}: 未知装备 ${id}`))
  }
  for (const m of MAPS) chk(m.reqCleared === undefined || nodeIds.includes(m.reqCleared), `地图 ${m.name}: reqCleared 不存在`)
  // 剧情送的伙伴最多紫品（第12册 §一）。郭靖/黄蓉的橙品成熟形态待“少年/成熟”进阶机制落地后再收紧
  const STORY_TIER_EXEMPT = ['guojing', 'huangrong']
  for (const c of Object.values(COMPANIONS)) {
    if (c.route === 'STORY' && !STORY_TIER_EXEMPT.includes(c.id)) chk(c.tier === 'blue' || c.tier === 'purple' || c.tier === 'green', `伙伴 ${c.name}: 剧情送伙伴不得高于紫品`)
    if (c.route === 'GACHA') chk(!!c.meetHint, `伙伴 ${c.name}: 抽卡伙伴需要 meetHint`)
    if (c.grade) chk(c.tier === 'orange', `伙伴 ${c.name}: 资质仅用于橙品`)
  }
  for (const set of COMPANION_SETS) {
    set.memberIds.forEach((id) => chk(!!COMPANIONS[id], `套装 ${set.name}: 未知伙伴 ${id}`))
    chk(set.tiers.every((t, i) => i === 0 || t.count > set.tiers[i - 1].count), `套装 ${set.name}: 档位必须递增`)
  }
  for (const t of TRIO_SYNERGIES) {
    chk(!!COMPANIONS[t.leftId] && !!COMPANIONS[t.rightId], `羁绊 ${t.name}: 伙伴不存在`)
    const l = COMPANIONS[t.leftId]
    const r = COMPANIONS[t.rightId]
    if (l && r) chk(l.role !== 'RIGHT' && r.role !== 'LEFT', `羁绊 ${t.name}: 伙伴站位与左右翼冲突`)
  }
  return errs
}

/** 后续资料片路线预览（对应第07册） */
/** 市井消费定价（store 与 UI 共用，避免两处硬编码不一致） */
export const INN_TEA_COST = 300
export const INN_GIFT_COST = 1200
export const GHOST_APPRAISE_COST = 600

export const EXPANSION_VOLUMES_PREVIEW = [
  { vol: '2.0 神雕篇', range: 'Lv.76~90 · 登峰造极', chapters: '赤练魔踪 → 华山双绝 → 绝情断肠 → 独孤剑冢 → 襄阳飞石', core: '剑冢择剑 / 自创黯然销魂 / 古墓双修' },
  { vol: '3.0 倚天篇', range: 'Lv.91~105 · 出神入化', chapters: '冰火狮吼 → 蝴蝶医仙 → 六派围攻光明顶 → 武当太极 → 金刚伏魔圈', core: '九阳护体 / 刀剑互砍 / 正邪全服光明顶大战' },
  { vol: '4.0 笑傲篇', range: 'Lv.106~120 · 震古烁今', chapters: '衡山琴箫 → 思过崖风清扬 → 梅庄西湖牢 → 黑木崖东方不败', core: '独孤九剑破招 / 吸星与葵花极端流' },
  { vol: '5.0 天龙&侠客', range: 'Lv.121~150 · 天人合一', chapters: '琅嬛六脉 → 聚贤庄血战 → 少室山扫地僧 → 侠客岛二十四石室', core: '北宋高武溯源 / 断肠腊八粥 / 太玄经大圆满' },
]
