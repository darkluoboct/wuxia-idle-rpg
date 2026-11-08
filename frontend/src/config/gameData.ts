import type { EquipSlotType, PortraitStyle, SkillSlotType, StanceType, TierColor, ZoneSafety } from './typesHelper'

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
}

export interface CompanionConfig {
  id: string
  name: string
  title: string
  tier: TierColor
  role: 'LEFT' | 'RIGHT'
  portraitStyle: PortraitStyle
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
    role: 'LEFT',
    portraitStyle: 'zhoubotong',
    poem: '左手画方右画圆，清音洞里乐忘年。',
    favGift: '大将军促织(蟋蟀)',
    teachSkillId: 'kongming_quan',
    assistSkillName: '双手互搏连击',
    assistDesc: '每次触发协战必定连出两拳，且免疫一切心神混乱状态！',
    baseHp: 8900,
    baseAtk: 860,
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
]

export interface SectConfig {
  id: string
  name: string
  alignment: 'RIGHTEOUS' | 'HERETIC' | 'NEUTRAL'
  chiefPlayerName: string // 当前本服真实玩家【首席大弟子】
  chiefPower: number
  reqDesc: string
  checkReq: (stats: { str: number; con: number; agi: number; intStat: number; karma: number }, hasBagua: boolean) => { ok: boolean; reason?: string }
  perkDesc: string
  ranks: string[]
  signatureSkills: string[]
}

export const SECTS: SectConfig[] = [
  {
    id: 'gaibang',
    name: '丐帮',
    alignment: 'RIGHTEOUS',
    chiefPlayerName: '萧峰传人·乔北冥',
    chiefPower: 148200,
    reqDesc: '无属性门槛，仅需【侠义 ≥ 0】即可奉酒入帮',
    checkReq: (s) => (s.karma >= 0 ? { ok: true } : { ok: false, reason: '行事偏邪（侠义 < 0），鲁有脚拒收' }),
    perkDesc: '越战越勇，残血爆发 +25%；可参与君山升袋大比继承【打狗棒法】与【降龙十八掌】。',
    ranks: ['一袋弟子', '三袋弟子', '六袋精锐', '九袋护法长老', '神丐衣钵传人'],
    signatureSkills: ['huntian_qigong', 'dagou_bangfa', 'xianglong_18'],
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
    signatureSkills: ['quanzhen_tuna', 'jinyan_gong'],
  },
  {
    id: 'taohua',
    name: '东海桃花岛',
    alignment: 'NEUTRAL',
    chiefPlayerName: '桃花首座·陆乘云',
    chiefPower: 162400,
    reqDesc: '高门槛：需【悟性 ≥ 28】【身法 ≥ 24】且持有【曲三铁八卦】',
    checkReq: (s, hasBagua) =>
      s.intStat >= 28 && s.agi >= 24 && hasBagua
        ? { ok: true }
        : { ok: false, reason: '需悟性≥28、身法≥24 并持有【曲三铁八卦】方可破桃花阵登岛' },
    perkDesc: '奇门五行，音律控场；离线额外炼制【九花玉露丸】，招式灵动飘逸。',
    ranks: ['候补扫花童', '记名弟子', '入室师兄', '桃花岛真传', '东邪衣钵传人'],
    signatureSkills: ['luoying_zhang', 'bihai_chaosheng'],
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
    signatureSkills: ['hama_gong'],
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
]

export interface StoryChapterConfig {
  id: number
  volume: string
  code: string
  title: string
  recLevel: number
  bossName: string
  bossTitle: string
  bossPortrait: PortraitStyle
  bossHp: number
  bossAtk: number
  bossStance: StanceType
  mechanicTip: string
  rewardQi: number
  rewardSilver: number
  dropItemId?: string
  dropSkillId?: string
}

export const STORY_CHAPTERS: StoryChapterConfig[] = [
  {
    id: 1,
    volume: '第一卷·射雕篇',
    code: '1-3',
    title: '荒山夜哭 · 铜尸陈玄风',
    recLevel: 5,
    bossName: '铜尸·陈玄风',
    bossTitle: '黑风双煞',
    bossPortrait: 'assassin',
    bossHp: 3600,
    bossAtk: 260,
    bossStance: 'FIERCE',
    mechanicTip: '横练铁布衫护体，建议用【太极柔化势】或高暴击玄铁匕首刺其肚脐罩门！',
    rewardQi: 2400,
    rewardSilver: 800,
    dropItemId: 'xuantie_dagger',
  },
  {
    id: 2,
    volume: '第一卷·射雕篇',
    code: '2-2',
    title: '赵王府夜宴 · 参仙梁子翁',
    recLevel: 16,
    bossName: '参仙老怪·梁子翁',
    bossTitle: '长白山武学名宿',
    bossPortrait: 'zhoubotong',
    bossHp: 8200,
    bossAtk: 480,
    bossStance: 'AGILE',
    mechanicTip: '身法滑溜善发子午透骨钉，建议摆出【刚猛强攻势】一力降十会！',
    rewardQi: 5600,
    rewardSilver: 1800,
    dropSkillId: 'jiuyin_baiguzhua',
  },
  {
    id: 3,
    volume: '第一卷·射雕篇',
    code: '3-3',
    title: '碧海桃花 · 东邪三道试题',
    recLevel: 30,
    bossName: '东邪·黄药师（三成力）',
    bossTitle: '天下五绝·桃花岛主',
    bossPortrait: 'huangyaoshi',
    bossHp: 16500,
    bossAtk: 790,
    bossStance: 'AGILE',
    mechanicTip: '奇门五转箫声惑神，携带【郭靖+黄蓉】激活靖蓉羁绊可大幅提高胜率！',
    rewardQi: 12000,
    rewardSilver: 3500,
    dropItemId: 'biyu_xiao',
  },
  {
    id: 4,
    volume: '第一卷·射雕篇',
    code: '4-3',
    title: '铁掌孤峰 · 水上漂裘千仞',
    recLevel: 45,
    bossName: '铁掌水上漂·裘千仞',
    bossTitle: '湘西铁掌帮主',
    bossPortrait: 'ouyangfeng',
    bossHp: 29000,
    bossAtk: 1180,
    bossStance: 'FIERCE',
    mechanicTip: '铁掌功刚猛重伤，务必切换【太极柔化势】借力打力化解掌劲！',
    rewardQi: 25000,
    rewardSilver: 6000,
    dropItemId: 'wumu_yishu',
  },
  {
    id: 5,
    volume: '第一卷·射雕终章',
    code: '5-3',
    title: '华山绝巅 · 逆九阴欧阳锋',
    recLevel: 60,
    bossName: '疯魔西毒·欧阳锋',
    bossTitle: '经脉逆行·天下第一狂',
    bossPortrait: 'ouyangfeng',
    bossHp: 52000,
    bossAtk: 1750,
    bossStance: 'FIERCE',
    mechanicTip: '倒立行走免疫点穴！需深厚内力压制并配合神品绝技一举定鼎五绝！',
    rewardQi: 55000,
    rewardSilver: 15000,
    dropSkillId: 'jiuyin_zonggang',
  },
]

/** 后续资料片路线预览（对应第07册） */
export const EXPANSION_VOLUMES_PREVIEW = [
  { vol: '2.0 神雕篇', range: 'Lv.76~90 · 登峰造极', chapters: '赤练魔踪 → 华山双绝 → 绝情断肠 → 独孤剑冢 → 襄阳飞石', core: '剑冢择剑 / 自创黯然销魂 / 古墓双修' },
  { vol: '3.0 倚天篇', range: 'Lv.91~105 · 出神入化', chapters: '冰火狮吼 → 蝴蝶医仙 → 六派围攻光明顶 → 武当太极 → 金刚伏魔圈', core: '九阳护体 / 刀剑互砍 / 正邪全服光明顶大战' },
  { vol: '4.0 笑傲篇', range: 'Lv.106~120 · 震古烁今', chapters: '衡山琴箫 → 思过崖风清扬 → 梅庄西湖牢 → 黑木崖东方不败', core: '独孤九剑破招 / 吸星与葵花极端流' },
  { vol: '5.0 天龙&侠客', range: 'Lv.121~150 · 天人合一', chapters: '琅嬛六脉 → 聚贤庄血战 → 少室山扫地僧 → 侠客岛二十四石室', core: '北宋高武溯源 / 断肠腊八粥 / 太玄经大圆满' },
]
