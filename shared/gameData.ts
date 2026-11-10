import type { CombatUnitDTO, EquipSlotType, SkillSlotType, StanceType, TierColor, ZoneSafety } from './protocol.ts'

type PortraitStyle = CombatUnitDTO['portraitStyle']

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
  { tier: 1, name: '初窥门径', meridian: '手三阳经', minLevel: 1, maxLevel: 10, multiplier: 1.0, baseBreakRate: 100, unlockDesc: '解锁外功/轻功/暗器槽，打坐倍率 1.0x' },
  { tier: 2, name: '略有小成', meridian: '足三阴经', minLevel: 11, maxLevel: 20, multiplier: 1.25, baseBreakRate: 85, unlockDesc: '解锁内功心法槽与左翼破阵伙伴位' },
  { tier: 3, name: '融会贯通', meridian: '阳维脉·阴维脉', minLevel: 21, maxLevel: 30, multiplier: 1.5, baseBreakRate: 75, unlockDesc: '解锁右翼奇策伙伴位与绝技奥义槽(射雕篇大圆满)' },
  { tier: 4, name: '炉火纯青', meridian: '阳跷脉·阴跷脉', minLevel: 31, maxLevel: 40, multiplier: 1.8, baseBreakRate: 65, unlockDesc: '神雕前期开启，神功解锁第4~5重，侠侣合璧' },
  { tier: 5, name: '出类拔萃', meridian: '带脉固摄', minLevel: 41, maxLevel: 50, multiplier: 2.15, baseBreakRate: 55, unlockDesc: '绝情幽谷试炼，免疫毒功吸内，自创绝学雏形' },
  { tier: 6, name: '神乎其技', meridian: '冲脉贯顶', minLevel: 51, maxLevel: 60, multiplier: 2.55, baseBreakRate: 50, unlockDesc: '神雕篇大圆满，神功解锁第6重，玄铁重剑粉碎格挡' },
  { tier: 7, name: '登峰造极', meridian: '奇经小周天', minLevel: 61, maxLevel: 70, multiplier: 3.0, baseBreakRate: 45, unlockDesc: '倚天前期开启，武当太极借力反伤' },
  { tier: 8, name: '一代宗师', meridian: '任脉纯和', minLevel: 71, maxLevel: 80, multiplier: 3.6, baseBreakRate: 40, unlockDesc: '光明顶决战，解锁全队宗师秘宝槽' },
  { tier: 9, name: '震古烁今', meridian: '督脉·生死玄关', minLevel: 81, maxLevel: 90, multiplier: 4.3, baseBreakRate: 35, unlockDesc: '倚天篇大圆满，神功大圆满解封(第7~10重)' },
  { tier: 10, name: '天人合一', meridian: '泥丸天门', minLevel: 91, maxLevel: 100, multiplier: 5.2, baseBreakRate: 30, unlockDesc: '侠客岛太玄经，万法随心化气为无形' },
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
  dropStage?: number     // 对应历练关卡推荐掉落点 (1~30)
  dropRate?: number      // 巡历挂机基准爆率
  vipTier?: number       // VIP获取门槛 (1=首充6元, 4=进阶累充, 9=至尊)
  fragmentCount?: number // 升重合成所需残卷数 (默认20)
  desc: string
  castNarrative: string
}

export const SKILLS: Record<string, SkillConfig> = {
  // =========================================================================
  // 第一卷《射雕篇》金字塔武学总典（共102门 · 纯正原著风貌）
  // 金字塔分布：
  //   - 神品 (Red, 6门, 5.9%)：武林至尊绝顶神学，极其稀罕珍贵
  //   - 绝品 (Orange, 12门, 11.8%)：宗门镇派神功、掌门级绝学
  //   - 上品 (Purple, 22门, 21.6%)：名门中坚精锐、一流好手看家武艺
  //   - 良品 (Blue, 35门, 34.3%)：江湖名门进阶、江南七怪、成名游侠招式
  //   - 凡品 (Green, 27门, 26.5%)：市井粗浅功法、初学拳脚、江湖底层大路招式
  // =========================================================================

  // -------------------------------------------------------------------------
  // 一、 神品 (Red · 共6门 · 武林至尊天花板)
  // -------------------------------------------------------------------------
  // 1. 内功心法
  jiuyin_zonggang: {
    id: 'jiuyin_zonggang',
    name: '九阴真经总纲',
    slot: 'INNER',
    tier: 'red',
    source: '集齐九阴上下卷与梵文总纲拼合参悟',
    powerRatio: 1.60,
    idleQiBonus: 45,
    desc: '九阴真经总纲。天之道损有余而补不足，阴阳互济，全属性极致升华。',
    castNarrative: '默诵九阴梵音，体内阴阳真气交融流转，招式忽刚忽柔，浑若天成',
  },
  yijin_duangu: {
    id: 'yijin_duangu',
    name: '九阴·易筋锻骨篇',
    slot: 'INNER',
    tier: 'red',
    vipTier: 9,
    dropStage: 20,
    source: 'VIP 9 至尊大礼包 / 桃花岛清音洞石壁梵文破译',
    powerRatio: 1.55,
    idleQiBonus: 50,
    desc: '九阴真经最正宗的道家筑基神篇。换骨易筋，大幅拔高气血上限与内力底蕴。',
    castNarrative: '体内骨节如爆豆般连珠作响，易筋洗髓，九阴玄功自十二重楼奔涌而下，浑身无瑕无垢',
  },

  // 2. 外功招式
  xianglong_18: {
    id: 'xianglong_18',
    name: '降龙十八掌',
    slot: 'OUTER',
    tier: 'red',
    source: '洪七公倾囊相授 / 丐帮九袋护法考核',
    powerRatio: 2.15,
    critBonus: 25,
    qiDamageRatio: 0.35,
    desc: '天下刚猛第一掌法。至刚无俦，无坚不摧，掌劲化龙轰散敌方防御。',
    castNarrative: '左腿微屈，右臂内弯，呼的一掌推出，正是【见龙在田】，掌风如怒涛狂龙席卷全场',
  },
  dugu_jiujian: {
    id: 'dugu_jiujian',
    name: '独孤九剑',
    slot: 'OUTER',
    tier: 'red',
    source: '思过崖风清扬 / 隐世散人剑冢奇遇',
    powerRatio: 2.10,
    critBonus: 35,
    qiDamageRatio: 0.40,
    desc: '剑魔独孤求败绝学。料敌先机，有进无退，破尽天下兵刃拳脚与内家真气。',
    castNarrative: '一眼看穿敌方招式中三处破绽，长剑斜指，后发先至，一式【破气式】直贯丹田气海',
  },

  // 3. 轻功身法
  lingbo_weibu: {
    id: 'lingbo_weibu',
    name: '凌波微步',
    slot: 'LIGHT',
    tier: 'red',
    source: '大理无量山琅嬛玉洞仙人遗秘',
    powerRatio: 1.0,
    speedBonus: 65,
    dodgeBonus: 38,
    desc: '极道身法。足踏伏羲六十四卦，罗袜生尘，每次成功闪避时积蓄 25 点怒气。',
    castNarrative: '足踏伏羲六十四卦，自“明夷”踩至“既济”，罗袜生尘，万军之中片叶不沾身',
  },

  // 4. 绝技奥义
  kanglong_youhui: {
    id: 'kanglong_youhui',
    name: '降龙·亢龙有悔',
    slot: 'ULT',
    tier: 'red',
    source: '降龙十八掌终极奥义 / 洪七公满好感传授',
    powerRatio: 3.20,
    qiDamageRatio: 0.50,
    desc: '降龙掌至高绝诣。推出时有十分力，留在自身更有二十分后劲，排山倒海。',
    castNarrative: '长啸一声，全身真气凝聚右掌，推出时有十分力，留在自身更有二十分后劲！狂龙吟啸，天地变色',
  },

  // -------------------------------------------------------------------------
  // 二、 绝品 (Orange · 共12门 · 宗门镇派神功与掌门级绝学)
  // -------------------------------------------------------------------------
  // 1. 内功心法
  hama_gong: {
    id: 'hama_gong',
    name: '蛤蟆功',
    slot: 'INNER',
    tier: 'orange',
    source: '白驼山庄镇派心法 / 西毒欧阳锋真传',
    powerRatio: 1.45,
    idleQiBonus: 30,
    desc: '欧阳锋独门内功。受击时聚气蓄力，爆发时如怒涛排山，威不可当。',
    castNarrative: '俯身弯腰，双手弯与肩齐，口中发出咯咯蛙鸣，蓄积排山倒海之劲',
  },
  xiantian_gong: {
    id: 'xiantian_gong',
    name: '全真·先天功',
    slot: 'INNER',
    tier: 'orange',
    source: '终南山纯阳祖师殿大考 / 华山绝巅首通',
    powerRatio: 1.48,
    idleQiBonus: 35,
    desc: '王重阳压箱底道家无上心法。内息回环往复，生生不息，极大提升防御与修行速度。',
    castNarrative: '道骨仙风，头顶三花聚顶、五气朝元，先天纯阳真气浩然护体，万邪难侵',
  },
  nizhuan_jingmai: {
    id: 'nizhuan_jingmai',
    name: '西毒·逆转经脉',
    slot: 'INNER',
    tier: 'orange',
    source: '白驼山庄三阶考核 / 荒岛救助发狂欧阳锋',
    powerRatio: 1.42,
    idleQiBonus: 28,
    desc: '欧阳锋逆练九阴而成的怪异心法。穴道移位，免疫致命点穴并积聚狂乱真气。',
    castNarrative: '倒立而行，周身经脉逆乱反行，全身要害尽数移位，怪异罡风让对手招式全然落空',
  },

  // 2. 外功招式
  dagou_bangfa: {
    id: 'dagou_bangfa',
    name: '打狗棒法',
    slot: 'OUTER',
    tier: 'orange',
    source: '丐帮镇帮绝学 / 帮主代代相传',
    powerRatio: 1.78,
    critBonus: 22,
    desc: '丐帮帮主相传之棒法。绊、劈、缠、戳变化莫测，高概率缴械敌方兵刃。',
    castNarrative: '手中竹棒青光点点，使出打狗棒法【缠字诀】，棒影如青蛇盘旋锁死敌方要害',
  },
  kongming_quan: {
    id: 'kongming_quan',
    name: '空明拳',
    slot: 'OUTER',
    tier: 'orange',
    source: '桃花岛清音洞老顽童周伯通结拜传授',
    powerRatio: 1.72,
    qiDamageRatio: 0.30,
    desc: '周伯通被囚十五年自创拳法。似轻实重，以柔克刚，教对手有力无处使。',
    castNarrative: '拳力若有若无，似轻实重，使出一招「空碗盛饭」，教敌方有力无处使',
  },
  da_fumo_quan: {
    id: 'da_fumo_quan',
    name: '九阴·大伏魔拳',
    slot: 'OUTER',
    tier: 'orange',
    source: '九阴下卷梵文拼合 / 华山绝巅破招奇遇',
    powerRatio: 1.88,
    qiDamageRatio: 0.35,
    critBonus: 20,
    desc: '九阴真经所载至刚至猛之拳。拳势沉雄，刚猛降魔，威力直逼降龙掌。',
    castNarrative: '身形巍峨如金刚怒目，大伏魔拳势大力沉轰出，拳风激荡震裂三丈青石！',
  },

  // 3. 轻功身法
  luoxuan_jiuying: {
    id: 'luoxuan_jiuying',
    name: '九阴·螺旋九影',
    slot: 'LIGHT',
    tier: 'orange',
    source: '牛家村密室石洞破解 / 周伯通好感切磋',
    powerRatio: 1.0,
    speedBonus: 58,
    dodgeBonus: 35,
    desc: '九阴真经上乘幻化身法。真气旋转喷薄化生残影，虚实莫辨，先手制人。',
    castNarrative: '真气旋转喷薄，瞬息间化出九道虚实莫辨的残影分立八方，真身早已悄然切至敌后',
  },
  shunxi_qianli: {
    id: 'shunxi_qianli',
    name: '白驼·瞬息千里',
    slot: 'LIGHT',
    tier: 'orange',
    source: '白驼山晋升副总管传授 / 欧阳克密室搜查',
    powerRatio: 1.0,
    speedBonus: 52,
    dodgeBonus: 30,
    desc: '西域白驼山顶级直线步法。直线突进如离弦之箭，必定抢占开局先手。',
    castNarrative: '袍袖一抖，足下微不可察地一蹬，如离弦之箭破空划过数十丈，狂风骤起',
  },

  // 4. 绝技奥义
  yiyang_zhi: {
    id: 'yiyang_zhi',
    name: '一阳指·乾阳通脉',
    slot: 'ULT',
    tier: 'orange',
    source: '南帝一灯大师救治黄蓉后真传',
    powerRatio: 2.75,
    qiDamageRatio: 0.65,
    desc: '大理南帝一灯大师纯阳神技。隔空指力直透重铠，兼具点穴截脉奇效。',
    castNarrative: '神色庄严，食指缓缓冲出，嗤的一声轻响，一道纯阳指力凌空射穿敌方重甲',
  },
  bihai_chaosheng: {
    id: 'bihai_chaosheng',
    name: '碧海潮生曲',
    slot: 'ULT',
    tier: 'orange',
    source: '东邪黄药师压箱绝技 / 桃花岛声望崇敬',
    powerRatio: 2.50,
    qiDamageRatio: 0.75,
    desc: '黄药师独门玉箫绝技。音律化气全屏乱心，造成大范围破甲穿透内伤。',
    castNarrative: '取过玉箫横于唇边，箫声初如大海浩淼，忽如群魔弄潮！敌方心神剧震，真气逆行喷血',
  },
  yihun_dafa: {
    id: 'yihun_dafa',
    name: '九阴·移魂大法',
    slot: 'ULT',
    tier: 'orange',
    source: '集齐九阴全卷梵文真解 / 桃花岛清音洞悟道',
    powerRatio: 2.85,
    qiDamageRatio: 0.70,
    desc: '九阴真经摄魂夺魄奇术。四目相对瓦解心志，无视敌方大部分护甲。',
    castNarrative: '双眸如渊潭摄魂夺魄，梵音魔音直灌脑髓，敌方只觉神智迷乱，气血逆流狂喷鲜血！',
  },
  feilong_zaitian: {
    id: 'feilong_zaitian',
    name: '降龙·飞龙在天',
    slot: 'ULT',
    tier: 'orange',
    source: '洪七公好感度450传授 / 丐帮晋升护法长老',
    powerRatio: 2.95,
    qiDamageRatio: 0.40,
    desc: '降龙十八掌至高升龙奥义。跃起居高临下轰击，具有摧枯拉朽之威。',
    castNarrative: '跃起半空居高临下，双掌携万钧雷霆怒劈而下！金色龙影咆哮撕裂云霄，轰然爆裂！',
  },

  // -------------------------------------------------------------------------
  // 三、 上品 (Purple · 共22门 · 一流高手看家绝学与门派核心真传)
  // -------------------------------------------------------------------------
  // 1. 内功心法
  huntian_qigong: {
    id: 'huntian_qigong',
    name: '混天气功',
    slot: 'INNER',
    tier: 'purple',
    source: '丐帮精锐心法 / 洪七公指点',
    powerRatio: 1.30,
    idleQiBonus: 20,
    desc: '丐帮高阶心法。气血低于50%时外功增伤20%，越战越勇。',
    castNarrative: '体内混天真气滚滚如沸，双拳隐现赤红罡气，豪气干云',
  },
  kurong_changong: {
    id: 'kurong_changong',
    name: '大理·枯荣禅功',
    slot: 'INNER',
    tier: 'purple',
    source: '大理天龙寺佛门真传 / 渔樵耕读四象试炼',
    powerRatio: 1.32,
    idleQiBonus: 22,
    desc: '天龙寺不传之秘。非枯非荣，稳定心神，极大降低所受控制效果。',
    castNarrative: '面容半边红润如婴童、半边焦槁如枯木，枯荣交替之间，万念俱寂，内息渊渟岳峙',
  },
  bipo_shengong: {
    id: 'bipo_shengong',
    name: '桃花·碧波神功',
    slot: 'INNER',
    tier: 'purple',
    source: '桃花岛入室弟子传授 / 黄药师手书内功',
    powerRatio: 1.34,
    idleQiBonus: 24,
    desc: '桃花岛上乘内功。心如止水，真气若惊涛骇浪连绵不绝。',
    castNarrative: '周身真气如海潮平缓起伏，看似柔和，遇力反震时却如怒涛卷霜雪',
  },
  chongyang_ziqi: {
    id: 'chongyang_ziqi',
    name: '全真·重阳紫气诀',
    slot: 'INNER',
    tier: 'purple',
    source: '全真教三代精锐心法 / 丘处机传授',
    powerRatio: 1.35,
    idleQiBonus: 25,
    desc: '全真教正宗玄门紫气心法。紫气东来，护持心脉，每回合自愈伤势。',
    castNarrative: '面透紫气，玄门内息自百会直通涌泉，丹田紫焰流转，伤势以肉眼可见之速愈合',
  },
  jiuyin_cuixin_jue: {
    id: 'jiuyin_cuixin_jue',
    name: '九阴·摧心诀',
    slot: 'INNER',
    tier: 'purple',
    source: '荒山夜战夺得梅超风人皮残卷',
    powerRatio: 1.28,
    idleQiBonus: 18,
    desc: '九阴真经所载阴寒内劲。攻击附带阴寒心毒，持续瓦解对手气血。',
    castNarrative: '体内阴寒真气悄然涌动，掌风过处寒气逼人，震动敌方脏腑要穴',
  },

  // 2. 外功招式
  jiuyin_baiguzhua: {
    id: 'jiuyin_baiguzhua',
    name: '九阴白骨爪',
    slot: 'OUTER',
    tier: 'purple',
    source: '荒山夜战黑风双煞残卷 / 骷髅洞穴搜查',
    powerRatio: 1.55,
    critBonus: 20,
    desc: '黑风双煞练偏的阴狠爪法。指如钢锥，对护盾造成双倍撕裂流血伤害。',
    castNarrative: '五指箕张，指尖凝聚森森阴风，直插敌方天灵盖，正是狠辣无比的【九阴白骨爪】',
  },
  luoying_zhang: {
    id: 'luoying_zhang',
    name: '落英神剑掌',
    slot: 'OUTER',
    tier: 'purple',
    source: '桃花岛武学 / 陆乘风引荐',
    powerRatio: 1.48,
    critBonus: 15,
    desc: '桃花岛招牌掌法。掌影如落英纷飞，大幅虚弱敌方全体命中率。',
    castNarrative: '双臂挥舞，四面八方俱是掌影，宛如漫天桃花随风飘落，虚实难测',
  },
  lanhua_shou: {
    id: 'lanhua_shou',
    name: '桃花·兰花拂穴手',
    slot: 'OUTER',
    tier: 'purple',
    source: '桃花岛外门试炼 / 黄蓉好感度300点传授',
    powerRatio: 1.45,
    critBonus: 18,
    desc: '桃花岛绝妙手法。姿态优雅，出指如兰，打断聚气并封敌重穴。',
    castNarrative: '姿态端庄幽雅，十指如春兰绽放，指风轻拂间已悄然封死敌方三处气海重穴',
  },
  lingshe_quan: {
    id: 'lingshe_quan',
    name: '白驼·灵蛇拳法',
    slot: 'OUTER',
    tier: 'orange',
    vipTier: 4,
    dropStage: 14,
    source: 'VIP 4 特权礼包备选 / 白驼山二阶传授 / 历练第14关掉落',
    powerRatio: 1.52,
    critBonus: 18,
    desc: '欧阳锋秘创拳法。手臂随处曲折无骨，自不可思议死角诡异钻入。',
    castNarrative: '右臂宛无骨骼般曲折探出，拳势如灵蛇昂首吐信，自不可思议的死角直钻敌方胸口',
  },
  yinyang_mo: {
    id: 'yinyang_mo',
    name: '铁掌帮·阴阳磨',
    slot: 'OUTER',
    tier: 'purple',
    source: '铁掌峰禁地密室盗谱 / 击败裘千仞',
    powerRatio: 1.58,
    qiDamageRatio: 0.25,
    desc: '铁掌帮高深掌法。一掌阴柔一掌阳刚互为磨盘，专破敌方护体硬气功。',
    castNarrative: '双掌合围如巨大石磨碾转，一阴一阳两重刚柔暗劲疯狂盘旋绞杀，撕裂敌方护体真罡',
  },
  tiezhang_gong: {
    id: 'tiezhang_gong',
    name: '铁掌神功',
    slot: 'OUTER',
    tier: 'purple',
    source: '湘西铁掌帮镇派掌法 / 铁掌峰试炼',
    powerRatio: 1.62,
    critBonus: 16,
    desc: '铁掌水上漂裘千仞看家武学。刚猛霸道，掌风呼啸，专打内伤重创。',
    castNarrative: '双掌漆黑如墨，运足铁掌十成功力呼啸拍出，掌力沉雄刚烈无匹！',
  },
  lvshuang_pobing: {
    id: 'lvshuang_pobing',
    name: '全真·履霜破冰掌',
    slot: 'OUTER',
    tier: 'purple',
    source: '全真七子传授 / 终南山重阳宫大考',
    powerRatio: 1.50,
    qiDamageRatio: 0.20,
    desc: '全真教高阶玄门掌法。看似平淡如覆雪霜，发劲时若破冰奔雷。',
    castNarrative: '袍袖轻拂，掌法如清风拂过冰湖，接触刹那沛然道门纯阳真劲崩裂爆发！',
  },
  xuanfeng_saoye_tui: {
    id: 'xuanfeng_saoye_tui',
    name: '桃花·旋风扫叶腿',
    slot: 'OUTER',
    tier: 'purple',
    source: '黄药师指点曲灵风陆乘风传授',
    powerRatio: 1.46,
    speedBonus: 15,
    desc: '桃花岛狂猛腿法。狂风卷叶，连环飞踢，以极快速度压制敌方攻势。',
    castNarrative: '身形腾空而起，双腿化作重重旋风残影，如秋风扫落叶般连环踢中胸腹重穴',
  },
  chongyang_jianfa: {
    id: 'chongyang_jianfa',
    name: '全真·重阳剑法',
    slot: 'OUTER',
    tier: 'purple',
    source: '全真教三代核心真传 / 终南剑碑参悟',
    powerRatio: 1.56,
    critBonus: 18,
    desc: '王重阳亲创全真剑意。剑势如天河倒悬，恢宏中正，破甲力极强。',
    castNarrative: '道剑出鞘长吟如龙，一招「白虹贯日」化作堂堂纯阳剑芒直贯重阵！',
  },
  wuluo_qingyan: {
    id: 'wuluo_qingyan',
    name: '大理·五罗轻烟掌',
    slot: 'OUTER',
    tier: 'purple',
    source: '大理段氏家传绝艺 / 渔樵耕读支线获赠',
    powerRatio: 1.44,
    dodgeBonus: 10,
    desc: '大理段氏柔云名掌。招式如轻烟缥缈无迹，令对手攻势尽数走空。',
    castNarrative: '双掌飘摇如山岚雾霭，轻烟渺渺之中五指穿云点穴，虚实难辨',
  },

  // 3. 轻功身法
  niqiu_gong: {
    id: 'niqiu_gong',
    name: '泥鳅功',
    slot: 'LIGHT',
    tier: 'purple',
    source: '黑沼泥潭瑛姑赠书',
    powerRatio: 1.0,
    speedBonus: 38,
    dodgeBonus: 25,
    desc: '瑛姑独门轻功。身子滑不留手，极大提高躲闪机率并化解点穴。',
    castNarrative: '身形滑不留手，宛如泥沼游鱼，在凌厉招式缝隙中一滑而过',
  },
  shuishang_piao: {
    id: 'shuishang_piao',
    name: '铁掌·水上漂',
    slot: 'LIGHT',
    tier: 'purple',
    source: '铁掌帮真传轻功 / 洞庭湖水寨奇遇',
    powerRatio: 1.0,
    speedBonus: 42,
    dodgeBonus: 22,
    desc: '裘千仞闻名天下轻功。双足踏水不沉，飞檐走壁如履平地。',
    castNarrative: '足尖在水面芦苇轻点数下，身轻如叶，刹那间掠过十数丈开阔水面',
  },
  qimen_bufa: {
    id: 'qimen_bufa',
    name: '桃花·奇门八卦步',
    slot: 'LIGHT',
    tier: 'purple',
    source: '桃花岛奇门阵法参悟 / 黄蓉传授',
    powerRatio: 1.0,
    speedBonus: 36,
    dodgeBonus: 28,
    desc: '依后天八卦方位行步。颠倒阴阳虚实，极易让对手招式全然击空。',
    castNarrative: '踏乾踩坤，步法依照奇门遁甲瞬息百变，敌方只觉眼前虚影重重全然打空',
  },

  // 4. 绝技奥义
  hanyin_shenjian: {
    id: 'hanyin_shenjian',
    name: '黑沼·寒阴神箭',
    slot: 'ULT',
    tier: 'purple',
    source: '黑沼泥潭瑛姑好感达400赠书',
    powerRatio: 2.60,
    qiDamageRatio: 0.60,
    desc: '瑛姑数十载怨恨所悟冰寒指力。寒箭穿空，冻结敌方经脉气血。',
    castNarrative: '咬破舌尖喷吐寒雾，双手骈指激射出森蓝箭芒，所过之处空气凝霜，直透敌方膻中大穴',
  },
  tonggui_jianfa: {
    id: 'tonggui_jianfa',
    name: '全真·同归剑法',
    slot: 'ULT',
    tier: 'orange',
    vipTier: 4,
    dropStage: 28,
    source: 'VIP 4 累充特权礼包 / 全真三代真传考核 / 历练第28关',
    powerRatio: 2.80,
    critBonus: 25,
    qiDamageRatio: 0.25,
    desc: '全真七子惨烈杀招。弃绝防守孤注一掷，爆发出令人胆寒的必杀一击。',
    castNarrative: '长剑一抖弃绝防守，剑锋如烈日崩裂直刺中门，一往无前、抱必死之心斩出同归于尽之剑！',
  },
  tanzhi_shentong: {
    id: 'tanzhi_shentong',
    name: '桃花·弹指神通',
    slot: 'ULT',
    tier: 'purple',
    source: '东邪黄药师压箱点穴绝技传授',
    powerRatio: 2.65,
    qiDamageRatio: 0.55,
    desc: '黄药师独步江湖指法。曲指一扣激射破空暗劲，精准断封敌方大穴。',
    castNarrative: '中指屈起按在大指之下，轻轻一弹，一道无形指力嗤然破空，直打敌方面门重穴！',
  },
  tiezhang_pikan: {
    id: 'tiezhang_pikan',
    name: '铁掌·开山裂石',
    slot: 'ULT',
    tier: 'purple',
    source: '铁掌帮高阶绝杀技 / 战胜裘千丈裘千仞',
    powerRatio: 2.70,
    qiDamageRatio: 0.35,
    desc: '铁掌帮刚猛终结式。黑铁双掌高举怒砸，将千钧之力灌入敌方前胸。',
    castNarrative: '狂吼如雷双掌合十如巨斧砸落，黑煞掌力爆轰震裂地面，直教对手脏腑翻涌吐血！',
  },

  // -------------------------------------------------------------------------
  // 四、 良品 (Blue · 共35门 · 江湖成名侠客中坚武艺与名门中层功法)
  // -------------------------------------------------------------------------
  // 1. 内功心法
  quanzhen_tuna: {
    id: 'quanzhen_tuna',
    name: '全真吐纳功',
    slot: 'INNER',
    tier: 'blue',
    source: '全真教入门 / 马钰荒山传授',
    powerRatio: 1.15,
    idleQiBonus: 15,
    desc: '马钰传下的玄门正宗内功。调息平稳，打坐时真气稳步积累。',
    castNarrative: '气沉丹田，依马钰真人所授玄门正宗缓缓吐纳，周身浊气尽散',
  },
  feixu_jin: {
    id: 'feixu_jin',
    name: '九阴·飞絮劲',
    slot: 'INNER',
    tier: 'blue',
    source: '牛家村密室字画暗格 / 归云庄梅超风赠卷',
    powerRatio: 1.18,
    idleQiBonus: 12,
    desc: '九阴真经柔和化劲法门。受力即散，巧妙化解敌方刚猛力道。',
    castNarrative: '真气如春蚕抽丝，身形软如柳絮，迎着对方凶猛劲道随风飘扬，消弭力道于无形',
  },
  bipo_xinjue: {
    id: 'bipo_xinjue',
    name: '桃花·碧波心诀',
    slot: 'INNER',
    tier: 'blue',
    source: '桃花岛听潮入门心法 / 陆乘风手抄本',
    powerRatio: 1.16,
    idleQiBonus: 14,
    desc: '桃花岛基础心诀。心静如海潮沉降，气顺脉和。',
    castNarrative: '默诵东海听潮口诀，气息沉稳如无风波面，内力缓缓充盈经脉',
  },
  baituo_daoyin: {
    id: 'baituo_daoyin',
    name: '白驼强体导引',
    slot: 'INNER',
    tier: 'blue',
    source: '白驼山庄蛇奴卫士导引图谱',
    powerRatio: 1.14,
    idleQiBonus: 12,
    desc: '西域养蛇强身锻体口诀。强筋健体，抵御寻常蛇毒寒气。',
    castNarrative: '行西域导引古法，吐纳腥涩药气，周身骨骼微微发热抗寒御毒',
  },
  gaibang_lianhua_jue: {
    id: 'gaibang_lianhua_jue',
    name: '莲花落吐气诀',
    slot: 'INNER',
    tier: 'blue',
    source: '丐帮三袋长老传授 / 冬夜乞讨御寒诀',
    powerRatio: 1.12,
    idleQiBonus: 10,
    desc: '丐帮弟子街头御寒吐纳。内息沉稳，恢复体能快。',
    castNarrative: '依丐帮莲花落节律敲竹吐气，胸口一团暖阳真气缓缓散向四肢百骸',
  },
  dali_chanshi_jue: {
    id: 'dali_chanshi_jue',
    name: '大理禅定心诀',
    slot: 'INNER',
    tier: 'blue',
    source: '大理王府家臣修心书卷 / 天龙寺俗家弟子',
    powerRatio: 1.15,
    idleQiBonus: 14,
    desc: '大理段氏家传凝神内法。祛除心魔烦扰，内力绵长稳定。',
    castNarrative: '低诵梵音真言，宝相庄严，体内段家纯和心法流转无滞',
  },
  shaolin_luohan_neigong: {
    id: 'shaolin_luohan_neigong',
    name: '少林罗汉心经残篇',
    slot: 'INNER',
    tier: 'blue',
    source: '江南武馆流传少林俗家抄本',
    powerRatio: 1.18,
    idleQiBonus: 16,
    desc: '少林俗家强身内功残卷。佛门刚正真气护持筋骨，抗击打能力强。',
    castNarrative: '双掌合十暗运罗汉刚正内劲，骨骼隐现微芒，硬抗敌方锋芒',
  },

  // 2. 外功招式
  yangjia_qiang: {
    id: 'yangjia_qiang',
    name: '杨家精钢枪法',
    slot: 'OUTER',
    tier: 'blue',
    source: '中都王府杨铁心包惜弱支线赠谱',
    powerRatio: 1.28,
    critBonus: 12,
    desc: '杨家世代相传枪法。一招回马枪神鬼莫测，招法刚直实用，破甲力极强。',
    castNarrative: '虚晃一枪拔步便走，突然腰眼一拧，一式神鬼莫测的「回马枪」如电芒直透前胸',
  },
  xiaoyaoyou_quan: {
    id: 'xiaoyaoyou_quan',
    name: '丐帮·逍遥游拳法',
    slot: 'OUTER',
    tier: 'blue',
    source: '张家口救小乞丐黄蓉赠书 / 穆念慈好感传授',
    powerRatio: 1.25,
    speedBonus: 12,
    desc: '洪七公创制轻灵外功。步法飘忽灵动，拳掌兼施，潇洒自在。',
    castNarrative: '身形回旋宛若乘风归去，拳式散淡如行云流水，乘虚蹈隙间连点敌方周身大穴',
  },
  miaoshou_kongkong: {
    id: 'miaoshou_kongkong',
    name: '妙手分筋错骨手',
    slot: 'OUTER',
    tier: 'blue',
    source: '嘉兴客栈朱聪结交 / 醉仙楼比试过关',
    powerRatio: 1.26,
    critBonus: 10,
    desc: '江南七怪朱聪看家绝技。近身缠斗奇巧绝伦，专卸关节错分骨骼。',
    castNarrative: '袍袖飘飘，折扇一合，双手化作漫天幻影切入近身，咔嚓两声卸掉对方肘肩关节',
  },
  baimang_bian: {
    id: 'baimang_bian',
    name: '九阴·白蟒鞭法',
    slot: 'OUTER',
    tier: 'purple',
    vipTier: 1,
    dropStage: 17,
    source: 'VIP 1 首充6元礼包赠送 / 历练第17关梅超风掉落',
    powerRatio: 1.30,
    critBonus: 12,
    desc: '九阴真经速成外功。长鞭挥舞如毒蟒出洞，软硬兼备，横扫敌方阵线。',
    castNarrative: '抖开长鞭，雪白鞭影宛如银蟒狂舞卷起狂风，森冷鞭梢破空直点面门！',
  },
  fumo_zhang: {
    id: 'fumo_zhang',
    name: '柯家伏魔杖法',
    slot: 'OUTER',
    tier: 'blue',
    source: '飞天蝙蝠柯镇恶手传纯钢铁杖法',
    powerRatio: 1.32,
    critBonus: 10,
    desc: '柯镇恶看家杖法。沉雄刚硬，一杖击出携风带雷，破甲力极高。',
    castNarrative: '铁杖破空狂啸，势沉力大如黑龙出渊，一记重杖横扫敌方腰肋空门！',
  },
  quanzhen_jianfa: {
    id: 'quanzhen_jianfa',
    name: '全真剑法',
    slot: 'OUTER',
    tier: 'blue',
    source: '全真教门派传授 / 知客道长指导',
    powerRatio: 1.30,
    critBonus: 10,
    desc: '终南山全真道门剑术。剑法平正中和，连绵不绝，无瑕可寻。',
    castNarrative: '平平递出一柄长剑，正是一式「分花拂柳」，剑势稳若泰山教人无法破招',
  },
  duanjia_jianfa: {
    id: 'duanjia_jianfa',
    name: '大理段家剑法',
    slot: 'OUTER',
    tier: 'blue',
    source: '大理四卫家臣传授 / 褚万里剑谱',
    powerRatio: 1.28,
    critBonus: 10,
    desc: '大理段氏家传名门剑术。严谨端方，招招刺向要害，攻守兼备。',
    castNarrative: '段家名门剑招沉着稳健，长剑寒光一闪，斜指敌方右肩琵琶骨！',
  },
  bipo_zhang: {
    id: 'bipo_zhang',
    name: '桃花·碧波掌法',
    slot: 'OUTER',
    tier: 'blue',
    source: '桃花岛入门掌法 / 归云庄庄丁传授',
    powerRatio: 1.25,
    dodgeBonus: 8,
    desc: '桃花岛入门柔劲掌法。一掌叠一掌如碧波千层，善借力卸力。',
    castNarrative: '双掌柔柔推出，暗劲如碧水暗涌，一层叠一层化解对方攻势并顺势反击',
  },
  pikong_zhang: {
    id: 'pikong_zhang',
    name: '曲家劈空掌力',
    slot: 'OUTER',
    tier: 'blue',
    source: '临安牛家村曲三酒馆密室字画参悟',
    powerRatio: 1.32,
    qiDamageRatio: 0.15,
    desc: '曲灵风暗传劈空掌功。隔空以掌力击伤强敌，造成真实内劲伤害。',
    castNarrative: '隔着三步开外凌空劈出一掌，破空劲风骤起，硬生生隔空震痛敌方面门！',
  },
  gaibang_tongchui: {
    id: 'gaibang_tongchui',
    name: '丐帮铜锤手',
    slot: 'OUTER',
    tier: 'blue',
    source: '丐帮四袋弟子传授 / 鲁有脚指点',
    powerRatio: 1.28,
    critBonus: 8,
    desc: '丐帮硬功拳法。双拳硬若生铁铜锤，直来直往，刚硬抗揍。',
    castNarrative: '大喝一声，双拳裹挟呼呼风声横冲直撞，硬生生砸碎敌方硬木防牌！',
  },
  huyan_qiang: {
    id: 'huyan_qiang',
    name: '呼延精钢枪法',
    slot: 'OUTER',
    tier: 'blue',
    source: '闹市隐侠全金发传授军伍枪法',
    powerRatio: 1.26,
    critBonus: 8,
    desc: '全金发所习呼延家名枪。破阵杀敌实用至极，招招封堵敌方退路。',
    castNarrative: '手中精钢长枪一抖，抖出六个斗大枪花，直刺敌方咽喉与左肋！',
  },
  duanhun_qiang: {
    id: 'duanhun_qiang',
    name: '黄河断魂枪',
    slot: 'OUTER',
    tier: 'blue',
    source: '击败鬼门龙王沙通天掉落枪谱',
    powerRatio: 1.34,
    critBonus: 10,
    desc: '黄河帮沙通天看家杀手。出招狠辣断魂，专走死角扎穿肋下要害。',
    castNarrative: '枪走下三路寒芒暴现，一招凶狠的「断魂索命」自斜下方急刺而上！',
  },
  tiesha_zhang: {
    id: 'tiesha_zhang',
    name: '江南铁砂掌',
    slot: 'OUTER',
    tier: 'blue',
    source: '江南威武镖局总镖头相赠',
    powerRatio: 1.30,
    critBonus: 10,
    desc: '镖局保镖练就之铁砂硬功。双掌硬如焦铁，拍中筋骨必裂。',
    castNarrative: '深吸一口气双掌赤红，啪的一声脆响重重拍在敌方胸膛肋骨之上！',
  },
  kuangfeng_daofa: {
    id: 'kuangfeng_daofa',
    name: '狂风快刀',
    slot: 'OUTER',
    tier: 'blue',
    source: '塞外刀客秘传 / 嘉兴黑市购置',
    powerRatio: 1.28,
    speedBonus: 10,
    desc: '狂风快刀手所用刀法。刀刀紧逼如狂风骤雨，出刀速度极快。',
    castNarrative: '单刀呼啸劈出，刀光如狂风扫叶一口气连砍七刀，逼得敌方步步后退',
  },
  zheshan_dianxue: {
    id: 'zheshan_dianxue',
    name: '江南折扇点穴术',
    slot: 'OUTER',
    tier: 'blue',
    source: '朱聪醉仙楼拆招传授',
    powerRatio: 1.24,
    critBonus: 12,
    desc: '江南名士所创奇门手法。铁骨折扇合拢如笔，精准截击腕脉穴道。',
    castNarrative: '折扇嗒的一声合拢，扇端铁骨如灵蛇吐信，轻巧点击敌方手腕要穴',
  },
  mizong_da_shou: {
    id: 'mizong_da_shou',
    name: '密宗大手印入门',
    slot: 'OUTER',
    tier: 'blue',
    source: '中都王府大战灵智上人缴获秘籍',
    powerRatio: 1.35,
    qiDamageRatio: 0.15,
    desc: '吐蕃密宗门人刚猛手印。红砂掌力沉雄无匹，击中伴有火毒暗伤。',
    castNarrative: '双手结不动明王法印，大喝一声推出一道赤红大手印，罡风逼人！',
  },

  // 3. 轻功身法
  jinyan_gong: {
    id: 'jinyan_gong',
    name: '金雁功',
    slot: 'LIGHT',
    tier: 'blue',
    source: '终南山马钰传授 / 全真门派晋升',
    powerRatio: 1.0,
    speedBonus: 25,
    dodgeBonus: 12,
    desc: '全真教轻功。练成后身轻如雁，拔高数丈，轻巧避开贴身锋芒。',
    castNarrative: '足尖一点，身形如金雁盘空拔高数丈，轻巧避开锋芒',
  },
  shexing_lifan: {
    id: 'shexing_lifan',
    name: '九阴·蛇形狸翻',
    slot: 'LIGHT',
    tier: 'blue',
    source: '大漠枯井遗卷 / 荒山救助梅超风赠录',
    powerRatio: 1.0,
    speedBonus: 28,
    dodgeBonus: 15,
    desc: '九阴真经小巧身法。伏地如蛇游，腾挪如野狸翻滚，专在绝境中闪躲。',
    castNarrative: '贴地滑行如蛇行草莽，半空中又如野狸敏捷翻身，于千钧一发之际避开致命杀招',
  },
  caoshang_fei: {
    id: 'caoshang_fei',
    name: '草上飞',
    slot: 'LIGHT',
    tier: 'blue',
    source: '江湖独行游侠相传身法图谱',
    powerRatio: 1.0,
    speedBonus: 26,
    dodgeBonus: 12,
    desc: '流传极广的上乘提气轻功。踏草无痕，快速游走掠击。',
    castNarrative: '提气轻身，足下踩着荒草树梢疾掠如飞，眨眼间拉开数丈身位',
  },
  yanzi_chuanyun: {
    id: 'yanzi_chuanyun',
    name: '燕子穿云纵',
    slot: 'LIGHT',
    tier: 'blue',
    source: '江南绿林好汉传授身法',
    powerRatio: 1.0,
    speedBonus: 24,
    dodgeBonus: 14,
    desc: '江南轻身纵跃绝技。攀房越脊如春燕穿云，闪转腾挪极快。',
    castNarrative: '半空中身形一个倒卷巧燕穿云，斜斜滑开半尺，避开敌方突刺',
  },
  dengping_dushui: {
    id: 'dengping_dushui',
    name: '登萍渡水',
    slot: 'LIGHT',
    tier: 'blue',
    source: '太湖渔民游侠水上借力步法',
    powerRatio: 1.0,
    speedBonus: 25,
    dodgeBonus: 13,
    desc: '江南水乡借物借力身法。落脚浮萍即借力腾跃，闪避灵活。',
    castNarrative: '足尖在浮石乱枝上轻踩借力，身子轻飘飘横掠丈余，身轻似燕',
  },
  babu_ganchan: {
    id: 'babu_ganchan',
    name: '八步赶蝉',
    slot: 'LIGHT',
    tier: 'blue',
    source: '北方武馆压箱提速步法',
    powerRatio: 1.0,
    speedBonus: 28,
    dodgeBonus: 10,
    desc: '短距离瞬间爆发冲刺身法。八步之内如猎鹰捕蝉，抢先制敌。',
    castNarrative: '深吸一口气暴起发力，八步连环如流星赶月，眨眼抢至敌方身前！',
  },
  tingfeng_bianwei: {
    id: 'tingfeng_bianwei',
    name: '柯家听风辨位',
    slot: 'LIGHT',
    tier: 'blue',
    source: '柯镇恶双目失明悟出之听音避招术',
    powerRatio: 1.0,
    speedBonus: 20,
    dodgeBonus: 18,
    desc: '飞天蝙蝠辨音绝技。以耳代目听风辨位，近身格挡闪避率极高。',
    castNarrative: '耳朵微微一动听风辨位，在暗器兵刃破空毫厘之间偏头轻巧避过',
  },
  qixing_bu: {
    id: 'qixing_bu',
    name: '全真·七星踏罡步',
    slot: 'LIGHT',
    tier: 'blue',
    source: '全真教道童踏罡步斗必修步法',
    powerRatio: 1.0,
    speedBonus: 22,
    dodgeBonus: 16,
    desc: '依北斗七星方位沉着踏移。步法严谨，令敌方招式极难命中。',
    castNarrative: '足下依照北斗方位踏步而行，虚步侧闪，正规玄门步法稳妥避招',
  },

  // 4. 绝技奥义
  feitian_shending: {
    id: 'feitian_shending',
    name: '飞天神顶·含怒一杖',
    slot: 'ULT',
    tier: 'blue',
    source: '柯镇恶怒斥奸邪掷出之绝杀铁杖',
    powerRatio: 2.25,
    qiDamageRatio: 0.20,
    desc: '柯镇恶含怒甩出之脱手重杖。纯钢铁杖呼啸飞掷，砸裂胸骨。',
    castNarrative: '怒骂一声妖邪，纯钢伏魔杖挟万钧怒火脱手狂掷，轰然砸碎敌方护具！',
  },
  huima_qiang: {
    id: 'huima_qiang',
    name: '杨家绝杀回马枪',
    slot: 'ULT',
    tier: 'blue',
    source: '杨铁心临安血战舍命枪术奥义',
    powerRatio: 2.30,
    critBonus: 18,
    desc: '杨家枪法精髓。假意败走突然拧腰回马一刺，神鬼莫测。',
    castNarrative: '佯败拖枪数步，电光石火间腰身拧转，一式暴烈绝伦的回马枪凌空扎穿重铠！',
  },
  dingyang_zhen: {
    id: 'dingyang_zhen',
    name: '全真·定阳针极意',
    slot: 'ULT',
    tier: 'blue',
    source: '全真剑法凝神突刺奥义 / 马钰指点',
    powerRatio: 2.20,
    qiDamageRatio: 0.25,
    desc: '全真剑法最凌厉单点突破式。纯阳之劲聚于剑尖一寸，透穴刺破。',
    castNarrative: '凝神屏气长剑斜指，纯阳真气注于剑端，如定阳古针刺破坚硬护甲！',
  },
  cuixin_zhang: {
    id: 'cuixin_zhang',
    name: '摧心穿云劲',
    slot: 'ULT',
    tier: 'blue',
    source: '梅超风人皮残卷阴柔绝杀掌力',
    powerRatio: 2.35,
    qiDamageRatio: 0.30,
    desc: '九阴残篇阴狠掌劲。掌中附带刺骨寒气，直接震伤对手脏腑。',
    castNarrative: '黑气缠绕右掌无声无息印上敌方胸口，阴毒劲力如针芒直贯心脉气海！',
  },

  // -------------------------------------------------------------------------
  // 五、 凡品 (Green · 共27门 · 市井粗浅、门派入门与江湖底层功法)
  // -------------------------------------------------------------------------
  // 1. 内功心法
  jianghu_tuna: {
    id: 'jianghu_tuna',
    name: '市井吐纳要诀',
    slot: 'INNER',
    tier: 'green',
    source: '嘉兴地摊三文钱购得之粗浅行气诀',
    powerRatio: 1.05,
    idleQiBonus: 5,
    desc: '市井流传最广的粗浅吐纳。调和气息，略微助益打坐修行。',
    castNarrative: '气沉腹部，依大路吐纳法粗浅调息，缓缓驱散体内疲倦',
  },
  zhuanggu_jue: {
    id: 'zhuanggu_jue',
    name: '壮骨正筋诀',
    slot: 'INNER',
    tier: 'green',
    source: '江湖武馆教头传授打熬筋骨口诀',
    powerRatio: 1.06,
    idleQiBonus: 6,
    desc: '粗浅锻体功法。强筋健骨，提升气血韧性。',
    castNarrative: '浑身筋肉微微绷紧，运起武馆壮骨粗浅口诀护持骨肉',
  },
  daoyin_shu: {
    id: 'daoyin_shu',
    name: '乡野粗浅导引',
    slot: 'INNER',
    tier: 'green',
    source: '乡野老道士祈福延寿呼吸法',
    powerRatio: 1.05,
    idleQiBonus: 5,
    desc: '乡野道人粗浅导引法。吐故纳新，平复狂躁血气。',
    castNarrative: '缓缓吐出胸中浊气，依照粗浅导引之法恢复气力',
  },
  tianchu_qigong: {
    id: 'tianchu_qigong',
    name: '田厨调息法',
    slot: 'INNER',
    tier: 'green',
    source: '挑夫火头军负重强身调气经验',
    powerRatio: 1.08,
    idleQiBonus: 8,
    desc: '苦力挑夫搬运重物摸索之气力法。皮实耐打，体魄坚韧。',
    castNarrative: '腹腔鼓胀运足粗力，稳扎脚跟顶住正面冲击',
  },

  // 2. 外功招式
  yuenv_jian: {
    id: 'yuenv_jian',
    name: '越女剑法',
    slot: 'OUTER',
    tier: 'green',
    source: '江南七怪·韩小莹传授 / 嘉兴主线',
    powerRatio: 1.15,
    critBonus: 12,
    desc: '韩小莹传下的越女快剑残式。出招轻快如白虹贯日，容易打出暴击。',
    castNarrative: '手腕轻抖，剑光如白虹贯日，使出一式「越女追风」直刺敌方腕脉',
  },
  taizu_changquan: {
    id: 'taizu_changquan',
    name: '太祖长拳',
    slot: 'OUTER',
    tier: 'green',
    source: '江湖走街卖艺最常见三十二势拳路',
    powerRatio: 1.14,
    critBonus: 6,
    desc: '江湖流传最普遍的大路长拳。招式朴实大开大合，规整稳当。',
    castNarrative: '弓步冲拳，使出一招正正经经的「双龙出海」，拳风沉着击向正面',
  },
  nanshan_zhang: {
    id: 'nanshan_zhang',
    name: '南山开山掌',
    slot: 'OUTER',
    tier: 'green',
    source: '南山樵子南希仁传授掌法',
    powerRatio: 1.16,
    critBonus: 6,
    desc: '南希仁质朴刚毅掌法。招式极拙极重，不求花巧，直击要害。',
    castNarrative: '沉闷不语猛踏一步，双掌如山石倾倒沉重推向敌方前胸！',
  },
  kaishan_fu: {
    id: 'kaishan_fu',
    name: '纯钢柴斧法',
    slot: 'OUTER',
    tier: 'green',
    source: '南希仁纯钢柴斧劈柴破木招式',
    powerRatio: 1.18,
    critBonus: 8,
    desc: '樵夫劈柴实战化成之斧法。大开大合力劈华山，势不可当。',
    castNarrative: '大开大合挥动纯钢柴斧，一记暴烈刚猛的竖劈猛劈向敌方天灵！',
  },
  tuniu_daofa: {
    id: 'tuniu_daofa',
    name: '屠牛短刀法',
    slot: 'OUTER',
    tier: 'green',
    source: '笑弥陀张阿生杀猪宰牛所悟刀法',
    powerRatio: 1.17,
    critBonus: 8,
    desc: '屠夫庖丁解牛近身短刀。专找骨节缝隙下刀，短促凶狠。',
    castNarrative: '咧嘴一笑短刀斜切，刀尖精准自肋骨缝隙狠狠剔入！',
  },
  jinlong_bian: {
    id: 'jinlong_bian',
    name: '金龙软鞭法',
    slot: 'OUTER',
    tier: 'green',
    source: '马王神韩宝驹所传牧马赶马软鞭',
    powerRatio: 1.15,
    speedBonus: 6,
    desc: '韩宝驹所用软鞭。鞭梢灵巧破空，专卷敌方兵刃马脚。',
    castNarrative: '手腕抖动金龙鞭甩出一朵鞭花，啪的一声脆响扫向敌方小腿！',
  },
  yanqing_quan: {
    id: 'yanqing_quan',
    name: '燕青扑跌拳',
    slot: 'OUTER',
    tier: 'green',
    source: '韩宝驹贴身矮汉扑跌拳术',
    powerRatio: 1.14,
    critBonus: 6,
    desc: '灵活敏捷之扑跌近身打法。贴身翻摔，专攻下盘。',
    castNarrative: '身子滴溜溜一矮抱住对方大腿，翻身一记燕青过肩摔狠狠绊摔敌方！',
  },
  wuhu_duanmen_dao: {
    id: 'wuhu_duanmen_dao',
    name: '五虎断门刀',
    slot: 'OUTER',
    tier: 'green',
    source: '绿林黑道好汉普及劈砍大刀谱',
    powerRatio: 1.18,
    critBonus: 8,
    desc: '绿林好汉最普及凶猛刀式。连环劈砍直取首级，悍勇凶横。',
    castNarrative: '手提阔背大砍刀呼呼带风，使出五虎断门刀「白虎跳涧」凌空剁下！',
  },
  fengmo_zhang: {
    id: 'fengmo_zhang',
    name: '疯魔颠狂杖',
    slot: 'OUTER',
    tier: 'green',
    source: '丐帮乞丐街头乱打竹棍法',
    powerRatio: 1.19,
    critBonus: 6,
    desc: '如疯似魔狂舞竹杖。全无规矩章法，乱打一通破开敌方套路。',
    castNarrative: '口中念念有词发足乱跑，粗竹杖如雨点般劈头盖脸乱打而下！',
  },
  jiaohua_bang: {
    id: 'jiaohua_bang',
    name: '叫花乱打棒',
    slot: 'OUTER',
    tier: 'green',
    source: '丐帮一袋弟子街头防恶犬套路',
    powerRatio: 1.12,
    speedBonus: 8,
    desc: '叫花防恶犬打狗小技。出棒敏捷迅速，专打下三路脚踝。',
    castNarrative: '手里竹竿一转专点脚跟，快打快收，打得恶徒跳脚后撤',
  },
  chaquan: {
    id: 'chaquan',
    name: '十路查拳',
    slot: 'OUTER',
    tier: 'green',
    source: '北方镖局武师基础演练套路',
    powerRatio: 1.13,
    critBonus: 5,
    desc: '北方流传甚广的传统套路。拳打一条线，进退有据。',
    castNarrative: '提步踏前打出一记查拳直冲，拳架端正刚劲扎实',
  },
  luohan_quan: {
    id: 'luohan_quan',
    name: '少林俗家罗汉拳',
    slot: 'OUTER',
    tier: 'green',
    source: '少林寺俗家弟子演练大路拳术',
    powerRatio: 1.15,
    critBonus: 6,
    desc: '佛门入门拳法。姿势工整，发力威猛直接。',
    castNarrative: '摆出少林罗汉桩式，沉喝一声正步推打，刚健有力',
  },
  ditang_dao: {
    id: 'ditang_dao',
    name: '地堂扫腿刀',
    slot: 'OUTER',
    tier: 'green',
    source: '江湖游侠短刀下盘滚刀法',
    powerRatio: 1.16,
    critBonus: 8,
    desc: '地堂翻滚短刀。专打对手脚踝膝盖，险恶难防。',
    castNarrative: '一个就地翻滚伏低身躯，单刀顺着青石板暴斩敌方脚踝要害！',
  },
  pan_guan_bi: {
    id: 'pan_guan_bi',
    name: '七星判官笔',
    slot: 'OUTER',
    tier: 'green',
    source: '彭连虎门下传授短兵点穴式',
    powerRatio: 1.15,
    critBonus: 10,
    desc: '短兵判官笔法。双笔翻飞，专戳双眼喉头与穴位。',
    castNarrative: '短笔在掌心滴溜溜一转，如毒蝎倒刺直扎敌方前胸重穴！',
  },
  yehu_quan: {
    id: 'yehu_quan',
    name: '辽东野狐拳',
    slot: 'OUTER',
    tier: 'green',
    source: '参仙老怪梁子翁随从拳术',
    powerRatio: 1.16,
    critBonus: 8,
    desc: '关东猎户所创阴狠小拳法。指节反凸，专撕面皮喉骨。',
    castNarrative: '身形如野狐扑食诡诈窜出，五指如钢爪直抓向敌方面门！',
  },
  dagan_dianxue: {
    id: 'dagan_dianxue',
    name: '市井秤杆点穴招',
    slot: 'OUTER',
    tier: 'green',
    source: '全金发小商贩秤杆防身巧招',
    powerRatio: 1.14,
    critBonus: 8,
    desc: '全金发以铁小秤演化之招。秤钩勾兵刃，秤砣击人腕。',
    castNarrative: '手中铁秤杆灵巧一别，秤砣带风狠狠敲在敌方拿兵刃的手腕之上！',
  },

  // 3. 轻功身法
  tizong_shu: {
    id: 'tizong_shu',
    name: '小巧提纵术',
    slot: 'LIGHT',
    tier: 'green',
    source: '衙门捕快翻墙追贼基本功',
    powerRatio: 1.0,
    speedBonus: 12,
    dodgeBonus: 6,
    desc: '寻常武师走壁提气之术。攀高跳跃，身形轻健。',
    castNarrative: '提一口气蹬墙而上，身子轻巧跃上矮墙，避开追兵',
  },
  lianhua_luo_bu: {
    id: 'lianhua_luo_bu',
    name: '莲花落滑步',
    slot: 'LIGHT',
    tier: 'green',
    source: '市井乞丐在人群中钻空子逃跑碎步',
    powerRatio: 1.0,
    speedBonus: 14,
    dodgeBonus: 8,
    desc: '泥泞巷弄钻缝隙碎步。灵活钻身，令敌方抓握落空。',
    castNarrative: '腰身一扭如游鱼钻入泥潭，滑步从敌方腋下空档一钻而过',
  },
  gundao_bu: {
    id: 'gundao_bu',
    name: '市井滚地避打',
    slot: 'LIGHT',
    tier: 'green',
    source: '市井泼皮街头抱头滚地防身法',
    powerRatio: 1.0,
    speedBonus: 10,
    dodgeBonus: 10,
    desc: '无赖泼皮抱头滚地。虽姿态狼狈，却常能在千钧一发时避开重击。',
    castNarrative: '眼看躲避不及就地一滚抱紧头颅，狼狈翻滚堪堪擦着重兵刃滚开',
  },
  tiaoxi_bu: {
    id: 'tiaoxi_bu',
    name: '山民挑担碎步',
    slot: 'LIGHT',
    tier: 'green',
    source: '大漠挑夫山民走险峻山道碎步',
    powerRatio: 1.0,
    speedBonus: 13,
    dodgeBonus: 6,
    desc: '山野行脚夫长途跋涉步伐。步频极密，脚底生根。',
    castNarrative: '踩着细碎碎步灵巧挪移，身躯虽晃动却稳如泰山避开刀锋',
  },

  // 4. 绝技奥义
  luanpi_chai: {
    id: 'luanpi_chai',
    name: '劈山开石·柴斧一击',
    slot: 'ULT',
    tier: 'green',
    source: '南希仁樵夫舍命当头一斧',
    powerRatio: 1.85,
    critBonus: 10,
    desc: '樵夫怒喝力劈千钧。倾尽浑身蛮力劈下之柴斧，重创顽敌。',
    castNarrative: '怒目圆睁吐气开声，双臂纯钢柴斧挟全身蛮力轰然下斩！',
  },
  shisheng_chuang: {
    id: 'shisheng_chuang',
    name: '蛮牛横撞',
    slot: 'ULT',
    tier: 'green',
    source: '张阿生屠夫舍身迎面飞撞',
    powerRatio: 1.80,
    critBonus: 8,
    desc: '张阿生庞大肉躯猛撞。迎面冲撞击退敌方，以命相搏。',
    castNarrative: '大吼一声以厚实胸膛迎面悍然撞去，硬碰硬将对手直接撞飞数步！',
  },
  duanmen_pikan: {
    id: 'duanmen_pikan',
    name: '断门暴烈横砍',
    slot: 'ULT',
    tier: 'green',
    source: '五虎断门刀最后一式乱披风横扫',
    powerRatio: 1.90,
    critBonus: 10,
    desc: '五虎断门刀绝门凶招。阔背大刀发疯般连横乱剁，暴烈无比。',
    castNarrative: '赤红双目单刀横拉，疯狂剁出一记血色横斩，狂暴劈退敌方前锋！',
  },
};


export interface VipSkillBenefit {
  vipTier: number
  priceRmb: number
  skillId: string
  skillName: string
  tier: TierColor
  slot: SkillSlotType
  benefitTitle: string
  marketingDesc: string
}

export const VIP_SKILL_REWARDS: VipSkillBenefit[] = [
  {
    vipTier: 1,
    priceRmb: 6,
    skillId: 'baimang_bian',
    skillName: '九阴·白蟒鞭法',
    tier: 'purple',
    slot: 'OUTER',
    benefitTitle: '【首充推图割草】',
    marketingDesc: '首充6元即赠！远距离横扫+割裂流血，前10关推怪速度飙升300%，开荒割草神器！',
  },
  {
    vipTier: 4,
    priceRmb: 198,
    skillId: 'tonggui_jianfa',
    skillName: '全真·同归剑法',
    tier: 'orange',
    slot: 'ULT',
    benefitTitle: '【中期越战翻盘】',
    marketingDesc: '残血孤注一掷绝杀！2.95倍率+30%暴击，逆天改命一剑斩杀高难Boss！',
  },
  {
    vipTier: 9,
    priceRmb: 1998,
    skillId: 'yijin_duangu',
    skillName: '九阴·易筋锻骨篇',
    tier: 'red',
    slot: 'INNER',
    benefitTitle: '【至尊修行神功】',
    marketingDesc: '全游戏唯一修行神器！挂机真气收益永久+50%，气血上限+25%，全流派通用，终生收益！',
  },
]

export const SKILL_DROP_RATES = {
  green: { bookRate: 0.035, fragmentRate: 0, guaranteeBattles: 0, note: '凡品大路书，约30场爆一本' },
  blue: { bookRate: 0.006, fragmentRate: 0.025, guaranteeBattles: 300, note: '良品中阶书，约160场爆一本，残卷约40场一张' },
  purple: { bookRate: 0.0006, fragmentRate: 0.006, guaranteeBattles: 1200, note: '上品名门书，约1600场爆一本，残卷约160场一张' },
  orange: { bookRate: 0.00005, bossBookRate: 0.0035, fragmentRate: 0.0005, bossFragmentRate: 0.08, guaranteeBattles: 15, note: '绝品镇派书，首领大爆约300场一本，首领残卷15场必保底' },
  red: { bookRate: 0, fragmentRate: 0.01, specialAcquireOnly: true, note: '神品绝世功法，华山绝巅首通与梵文拼合大成产出' },
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
  dodgeBonus?: number
  idleBonus?: number
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
    desc: '丘处机送给郭杨两家的信物，刀刃上刻着一个「靖」字。',
  },
  biyu_xiao: {
    id: 'biyu_xiao',
    name: '东邪·碧玉箫',
    slot: 'WEAPON',
    tier: 'orange',
    reqStat: { key: 'intStat', val: 35, label: '悟性达到 35' },
    atkBonus: 190,
    critBonus: 18,
    desc: '黄药师常带在身边的碧玉箫，既是乐器，也能当兵器。',
  },
  xuantie_heavysword: {
    id: 'xuantie_heavysword',
    name: '乌金玄铁重剑',
    slot: 'WEAPON',
    tier: 'red',
    reqStat: { key: 'str', val: 40, label: '臂力达到 40' },
    atkBonus: 360,
    desc: '独孤求败用过的重剑，足有六十四斤。剑无锋，重在力道。',
  },
  dagou_stick_true: {
    id: 'dagou_stick_true',
    name: '真·绿玉打狗棒',
    slot: 'WEAPON',
    tier: 'red',
    isTrueUnique: true,
    reqStat: { key: 'agi', val: 35, label: '身法达到 35' },
    atkBonus: 420,
    critBonus: 25,
    desc: '丐帮帮主世代相传的信物，碧绿如玉，轻便又结实。',
  },
  quanzhen_robe: {
    id: 'quanzhen_robe',
    name: '终南玄门道袍',
    slot: 'ARMOR',
    tier: 'blue',
    defBonus: 55,
    hpBonus: 650,
    idleBonus: 15,
    desc: '全真弟子常穿的青色道袍。穿上后，修行能攒到更多真气。',
  },
  wucan_baoyi: {
    id: 'wucan_baoyi',
    name: '大雪山乌蚕宝衣',
    slot: 'ARMOR',
    tier: 'orange',
    defBonus: 165,
    hpBonus: 2400,
    desc: '大雪山的乌蚕丝织成的宝衣，轻便结实，能护住要害。',
  },
  tongmai_dan: {
    id: 'tongmai_dan',
    name: '玄门·聚气通脉丹',
    slot: 'ACC',
    tier: 'blue',
    desc: '全真教道家秘制通脉灵丹。温经活络，冲穴时免去全部真气消耗，瞬间冲开任意常规穴位。',
  },
  pozhang_dan: {
    id: 'pozhang_dan',
    name: '纯阳·通脉破障丹',
    slot: 'ACC',
    tier: 'purple',
    desc: '大境界生死玄关突破专属圣药，突破成功率直接提升 +35%，大幅降低玄关阻滞。',
  },
  bingpo_huxin_dan: {
    id: 'bingpo_huxin_dan',
    name: '天山·冰魄护心丹',
    slot: 'ACC',
    tier: 'purple',
    desc: '冲穴护脉神药。冲关失败时 100% 免疫走火入魔状态，返还全部消耗真气，下次突破追加 +25% 保底。',
  },
  shaolin_xiaohuan_dan: {
    id: 'shaolin_xiaohuan_dan',
    name: '少林·大乘小还丹',
    slot: 'ACC',
    tier: 'orange',
    desc: '少林药局至宝。服用后百穴齐鸣，瞬间连续贯通当前经脉 3 个穴位，永久根骨 +6、内力上限 +300。',
  },
  jiuzhuan_tongqiao_dan: {
    id: 'jiuzhuan_tongqiao_dan',
    name: '神品·九转通窍仙丹',
    slot: 'ACC',
    tier: 'red',
    desc: '天下第一冲穴至尊神丹。一丸入腹，整条经脉所有剩余未通穴道瞬间全部贯通！全属性永久 +12。',
  },
  ruanwei_armor: {
    id: 'ruanwei_armor',
    name: '桃花岛·软猬甲',
    slot: 'ARMOR',
    tier: 'red',
    defBonus: 260,
    hpBonus: 3800,
    signatureEffect: '挨打时，甲上的倒刺能反弹部分伤害。',
    desc: '桃花岛的护身宝甲，外头密密长着一层倒刺。',
  },
  iron_bagua: {
    id: 'iron_bagua',
    name: '曲三铁八卦',
    slot: 'ACC',
    tier: 'blue',
    hpBonus: 350,
    idleBonus: 10,
    desc: '忘机客留下的铁八卦，刻着桃花岛的记号。拜师桃花岛时要带上它。',
  },
  jiuwei_fox: {
    id: 'jiuwei_fox',
    name: '黑沼·九尾灵狐',
    slot: 'ACC',
    tier: 'orange',
    critBonus: 15,
    hpBonus: 1200,
    desc: '瑛姑送来的白狐。带它同行能提高气血上限和暴击率。',
  },
  wumu_yishu: {
    id: 'wumu_yishu',
    name: '岳武穆遗书',
    slot: 'RELIC',
    tier: 'red',
    defBonus: 150,
    hpBonus: 2000,
    desc: '岳飞留下的兵书。带上它能提高防御和气血上限。',
  },
  xiaoao_qupu: {
    id: 'xiaoao_qupu',
    name: '笑傲江湖琴箫谱',
    slot: 'RELIC',
    tier: 'red',
    critBonus: 20,
    desc: '刘正风与曲洋留下的琴箫合奏谱。带上它，出招更容易打出暴击。',
  },
  bamboo_hat: {
    id: 'bamboo_hat',
    name: '竹编斗笠',
    slot: 'HEAD',
    tier: 'green',
    defBonus: 10,
    hpBonus: 180,
    desc: '行走江湖常戴的斗笠，能挡日头，也能挡几下擦伤。',
  },
  pine_crown: {
    id: 'pine_crown',
    name: '松纹发冠',
    slot: 'HEAD',
    tier: 'blue',
    defBonus: 18,
    hpBonus: 300,
    desc: '一顶雕着松枝的木冠，内衬比寻常发冠厚实。',
  },
  snow_hood: {
    id: 'snow_hood',
    name: '雪狐风帽',
    slot: 'HEAD',
    tier: 'purple',
    defBonus: 24,
    hpBonus: 550,
    desc: '边地客商带来的皮帽，防风，也能护住头颈。',
  },
  cloth_bracers: {
    id: 'cloth_bracers',
    name: '缠布护腕',
    slot: 'WRIST',
    tier: 'green',
    atkBonus: 12,
    desc: '把手腕缠紧，运掌和握剑时都更稳。',
  },
  swallow_bracers: {
    id: 'swallow_bracers',
    name: '飞燕护腕',
    slot: 'WRIST',
    tier: 'green',
    atkBonus: 4,
    critBonus: 4,
    desc: '绣着一双飞燕的薄护腕。出招力道稍轻，更容易打出暴击。',
  },
  iron_bracers: {
    id: 'iron_bracers',
    name: '铁鳞护腕',
    slot: 'WRIST',
    tier: 'blue',
    atkBonus: 24,
    defBonus: 12,
    desc: '小片铁鳞缝在腕带上，护腕结实，挥掌也有分量。',
  },
  cloth_belt: {
    id: 'cloth_belt',
    name: '青布腰带',
    slot: 'BELT',
    tier: 'green',
    hpBonus: 260,
    desc: '赵王府护卫用的束腰布带，扎紧后跑跳都方便。',
  },
  oxhide_belt: {
    id: 'oxhide_belt',
    name: '牛皮腰带',
    slot: 'BELT',
    tier: 'blue',
    hpBonus: 430,
    defBonus: 14,
    desc: '厚牛皮配铜扣，赶路不松脱，还能护住腰腹。',
  },
  jade_belt: {
    id: 'jade_belt',
    name: '盘玉腰带',
    slot: 'BELT',
    tier: 'purple',
    hpBonus: 680,
    defBonus: 22,
    desc: '几块青玉缝进厚皮带，扎实得能挡下一点刀劲。',
  },
  cloth_boots: {
    id: 'cloth_boots',
    name: '练功布靴',
    slot: 'BOOTS',
    tier: 'green',
    dodgeBonus: 3,
    desc: '轻巧耐穿的布靴，闪身时不容易绊脚。',
  },
  deerskin_boots: {
    id: 'deerskin_boots',
    name: '鹿皮快靴',
    slot: 'BOOTS',
    tier: 'blue',
    dodgeBonus: 5,
    defBonus: 8,
    desc: '鹿皮柔韧，鞋底抓地，急转时脚下也稳。',
  },
  cloud_boots: {
    id: 'cloud_boots',
    name: '踏云靴',
    slot: 'BOOTS',
    tier: 'purple',
    dodgeBonus: 8,
    defBonus: 14,
    desc: '靴面绣着云纹，穿上迈步轻快，更容易闪开对手的招式。',
  },
}

export const COOP_RAID_RELICS = [ITEMS.wumu_yishu, ITEMS.xiaoao_qupu]

export const SHAOSHI_RAID = {
  title: '少室山 · 金刚伏魔圈',
  boss: { name: '少林·渡厄神僧', title: '金刚伏魔圈主阵', portrait: 'monk', hp: 26000, atk: 1150, mp: 9500, stance: 'TAICHI' },
  guards: [
    { name: '渡难神僧', title: '黑索左阵', portrait: 'monk', hp: 12000, atk: 780, mp: 1800, stance: 'FIERCE' },
    { name: '渡劫神僧', title: '黑索右阵', portrait: 'monk', hp: 12000, atk: 780, mp: 1800, stance: 'AGILE' },
  ],
  rewardQi: 18500,
  rewardSilver: 5200,
} as const

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
    assistDesc: '听声辨位，掷出铁菱替你挡下一招。',
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
    assistDesc: '趁你打中对手，跟上补一记白骨爪。',
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
    assistDesc: '紧跟你的招式，补上一记降龙掌。',
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
    assistDesc: '见对手攻来，用打狗棒替你挡下一部分伤害。',
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
    assistDesc: '看准时机，用降龙掌跟进追击。',
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
    assistDesc: '弹指打偏对手的招式，替你挡下一部分伤害。',
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
    assistDesc: '使出双手互搏，在你出招后跟进。',
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
    bonusText: '郭靖与黄蓉，一个追击，一个挡招。',
  },
  {
    id: 'dong_bei',
    name: '东邪北丐',
    leftId: 'hongqigong',
    rightId: 'huangyaoshi',
    bonusText: '洪七公追击，黄药师替你挡招。',
  },
  {
    id: 'tong_rong',
    name: '顽童戏蓉',
    leftId: 'zhoubotong',
    rightId: 'huangrong',
    bonusText: '周伯通跟进出拳，黄蓉替你挡招。',
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
    reqDesc: '侠义至少 0 点',
    checkReq: (s) => (s.karma >= 0 ? { ok: true } : { ok: false, reason: '侠义至少要有 0 点，才能拜入丐帮。' }),
    perkDesc: '拜师可学混天气功。通过晋升考核，还能学打狗棒法和降龙十八掌。',
    ranks: ['一袋弟子', '三袋弟子', '六袋精锐', '九袋护法长老', '神丐衣钵传人'],
    signatureSkills: ['huntian_qigong', 'dagou_bangfa', 'xianglong_18'],
  },
  {
    id: 'quanzhen',
    name: '终南全真教',
    alignment: 'RIGHTEOUS',
    chiefPlayerName: '重阳首座·清风道长',
    chiefPower: 139500,
    reqDesc: '根骨至少 22 点，侠义至少 20 点',
    checkReq: (s) =>
      s.con >= 22 && s.karma >= 20
        ? { ok: true }
        : { ok: false, reason: '拜入全真教需要根骨至少 22 点，侠义至少 20 点。' },
    perkDesc: '全真弟子修行多得 25% 真气。拜师先学全真吐纳功，晋升后可学金雁功。',
    ranks: ['知客道童', '四代弟子', '三代精锐', '北斗护法真人', '玄门掌教候选'],
    signatureSkills: ['quanzhen_tuna', 'jinyan_gong'],
  },
  {
    id: 'taohua',
    name: '东海桃花岛',
    alignment: 'NEUTRAL',
    chiefPlayerName: '桃花首座·陆乘云',
    chiefPower: 162400,
    reqDesc: '悟性至少 28 点，身法至少 24 点，背包里有曲三铁八卦',
    checkReq: (s, hasBagua) =>
      s.intStat >= 28 && s.agi >= 24 && hasBagua
        ? { ok: true }
        : { ok: false, reason: '拜师要有 28 点悟性、24 点身法，还要带上曲三铁八卦。' },
    perkDesc: '拜入黄药师门下先学落英神剑掌，晋升后可学碧海潮生曲。',
    ranks: ['候补扫花童', '记名弟子', '入室师兄', '桃花岛真传', '东邪衣钵传人'],
    signatureSkills: ['luoying_zhang', 'bihai_chaosheng'],
  },
  {
    id: 'baituo',
    name: '西域白驼山庄',
    alignment: 'HERETIC',
    chiefPlayerName: '西域毒皇·欧阳烈',
    chiefPower: 155900,
    reqDesc: '根骨至少 24 点，侠义不高于 0 点',
    checkReq: (s) =>
      s.con >= 24 && s.karma <= 0
        ? { ok: true }
        : { ok: false, reason: '拜师需要根骨至少 24 点，侠义不高于 0 点。' },
    perkDesc: '欧阳锋的门下，拜师可学蛤蟆功。来鬼市鉴宝也可以不戴蒙面巾。',
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
    ambientDesc: '南湖烟雨正好。岸边可安心修行，也能找同路的侠客切磋。',
  },
  {
    id: 'zhongnan_forest',
    name: '终南山·后山密林',
    volumeLabel: '射雕/神雕',
    safety: 'PEACE',
    baseQiPerHour: 2900,
    onlineCount: 42,
    ambientDesc: '松林里听得见道观钟声。这里修行收益更高，适合和人一起练功。',
  },
  {
    id: 'damo_caravan',
    name: '大漠古商道（押镖线）',
    volumeLabel: '纷争·塞外',
    safety: 'CONTESTED',
    baseQiPerHour: 4200,
    onlineCount: 31,
    ambientDesc: '商道上驼铃不断。这里修行收益更高，也有人拦路劫镖。',
  },
  {
    id: 'heizhao_swamp',
    name: '湘西·黑沼泥潭',
    volumeLabel: '纷争·铁掌禁地',
    safety: 'CONTESTED',
    baseQiPerHour: 5100,
    onlineCount: 24,
    ambientDesc: '黑沼常年起雾。这里真气攒得最快，遇上押镖的人也能出手拦截。',
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
  dropItemIds?: string[]
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
    mechanicTip: '陈玄风用刚猛打法。到武库换成太极，打他更占上风。',
    rewardQi: 2400,
    rewardSilver: 800,
    dropItemIds: ['xuantie_dagger', 'pine_crown'],
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
    mechanicTip: '梁子翁擅长奇门变招，用刚猛更好打。',
    rewardQi: 5600,
    rewardSilver: 1800,
    dropItemIds: ['cloth_belt'],
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
    mechanicTip: '用刚猛对付黄药师的奇门。也可以带上郭靖和黄蓉，让郭靖多帮你追击。',
    rewardQi: 12000,
    rewardSilver: 3500,
    dropItemIds: ['biyu_xiao', 'oxhide_belt'],
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
    mechanicTip: '裘千仞的铁掌走刚猛路数。试试太极，借力还击。',
    rewardQi: 25000,
    rewardSilver: 6000,
    dropItemIds: ['iron_bracers'],
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
    mechanicTip: '欧阳锋出手重。先换成太极，再练高些等级、换上更强的绝技。',
    rewardQi: 55000,
    rewardSilver: 15000,
    dropItemIds: ['jade_belt', 'cloud_boots'],
    dropSkillId: 'jiuyin_zonggang',
  },
]

export function getChapterDrops(chapter: StoryChapterConfig) {
  const items = (chapter.dropItemIds ?? []).map((id) => ITEMS[id]).filter(Boolean)
  const skill = chapter.dropSkillId ? SKILLS[chapter.dropSkillId] : undefined
  const drops: { id: string; name: string; tier: TierColor; kind: 'item' | 'skill' }[] =
    items.map(({ id, name, tier }) => ({ id, name, tier, kind: 'item' }))
  if (skill) drops.push({ id: skill.id, name: skill.name, tier: skill.tier, kind: 'skill' })
  return drops
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

// =========================================================================
// 四大金庸特色扩展系统：经脉穴位、百草丹毒、暗器奇门与江湖绰号
// =========================================================================

// --- 1. 经脉核心穴位配置 ---
export interface AcupointConfig {
  id: string
  name: string
  meridianId: string
  realmTier: number
  order: number
  costQi: number
  statBonus: { key: string; label: string; value: number }
  narrative: string
}

export const ACUPOINTS: AcupointConfig[] = [
  // 第一重：手三阳经 (Lv 1~10)
  { id: 'shangyang', name: '商阳穴', meridianId: 'shousanyang', realmTier: 1, order: 1, costQi: 300, statBonus: { key: 'str', label: '臂力', value: 2 }, narrative: '指尖微温，大肠经商阳穴贯通，出掌隐带风声' },
  { id: 'hegu', name: '合谷穴', meridianId: 'shousanyang', realmTier: 1, order: 2, costQi: 500, statBonus: { key: 'atk', label: '外功攻击', value: 18 }, narrative: '虎口大开，合谷穴内息贯穿，拳脚刚劲倍增' },
  { id: 'quchi', name: '曲池穴', meridianId: 'shousanyang', realmTier: 1, order: 3, costQi: 800, statBonus: { key: 'pierce', label: '护甲穿透', value: 10 }, narrative: '肘弯轻震，曲池穴气机通畅，直透敌方重甲' },
  { id: 'jianyu', name: '肩髃穴', meridianId: 'shousanyang', realmTier: 1, order: 4, costQi: 1200, statBonus: { key: 'parry', label: '招架率(%)', value: 2 }, narrative: '两肩沉稳如磐石，肩髃穴打通，御敌架拆游刃有余' },
  { id: 'yingxiang', name: '迎香穴', meridianId: 'shousanyang', realmTier: 1, order: 5, costQi: 1800, statBonus: { key: 'hit', label: '命中率(%)', value: 3 }, narrative: '鼻翼微张，清气直冲灵台，迎香穴通，明察秋毫' },

  // 第二重：足三阴经 (Lv 11~20)
  { id: 'yinbai', name: '隐白穴', meridianId: 'zusanyin', realmTier: 2, order: 1, costQi: 2500, statBonus: { key: 'con', label: '根骨', value: 3 }, narrative: '足趾踏地稳如泰山，脾经隐白穴透，体魄益健' },
  { id: 'yongquan', name: '涌泉穴', meridianId: 'zusanyin', realmTier: 2, order: 2, costQi: 3500, statBonus: { key: 'spd', label: '出手速度', value: 12 }, narrative: '足心涌泉真气喷薄，步履如飞，身法轻灵' },
  { id: 'sanyinjiao', name: '三阴交', meridianId: 'zusanyin', realmTier: 2, order: 3, costQi: 4800, statBonus: { key: 'mp', label: '内力上限', value: 120 }, narrative: '足踝三脉汇聚，气沉丹田，三阴交汇真气绵长' },
  { id: 'taichong', name: '太冲穴', meridianId: 'zusanyin', realmTier: 2, order: 4, costQi: 6500, statBonus: { key: 'crit', label: '暴击率(%)', value: 2.5 }, narrative: '肝火化气，太冲穴通，杀机内敛，骤发雷霆' },
  { id: 'qimen', name: '期门穴', meridianId: 'zusanyin', realmTier: 2, order: 5, costQi: 8500, statBonus: { key: 'critDef', label: '暴击免伤(%)', value: 5 }, narrative: '肋下期门护住脏腑，气劲反弹，化解敌方致命重创' },

  // 第三重：阳维脉·阴维脉 (Lv 21~30 · 射雕大圆满)
  { id: 'jinmen', name: '金门穴', meridianId: 'yangweimai', realmTier: 3, order: 1, costQi: 11000, statBonus: { key: 'def', label: '护体防御', value: 25 }, narrative: '足踝金门闭合，真气化铠，防御大增' },
  { id: 'yangjiao', name: '阳交穴', meridianId: 'yangweimai', realmTier: 3, order: 2, costQi: 14000, statBonus: { key: 'dodge', label: '闪避率(%)', value: 3 }, narrative: '阳维之郄阳交穴通，残影重重，避开杀招' },
  { id: 'zhubin', name: '筑宾穴', meridianId: 'yinweimai', realmTier: 3, order: 3, costQi: 18000, statBonus: { key: 'qiDmg', label: '内劲转化(%)', value: 4 }, narrative: '阴维之郄筑宾穴通，内劲化气，隔空伤人' },
  { id: 'fushe', name: '府舍穴', meridianId: 'yinweimai', realmTier: 3, order: 4, costQi: 23000, statBonus: { key: 'hp', label: '气血上限', value: 450 }, narrative: '腹内府舍气血充盈，生机旺盛，体魄坚韧' },
  { id: 'tiantu', name: '天突穴', meridianId: 'yinweimai', realmTier: 3, order: 5, costQi: 29000, statBonus: { key: 'rageGain', label: '受击回怒', value: 3 }, narrative: '喉头天突穴通，任脉贯联，受击怒气生生不息' },
  { id: 'lianquan', name: '廉泉穴', meridianId: 'yinweimai', realmTier: 3, order: 6, costQi: 36000, statBonus: { key: 'idleGain', label: '吐纳效率(%)', value: 8 }, narrative: '津液甘泉涌出，廉泉穴透，吐纳真气收益长久拔高' },
]

// --- 2. 百草药理与丹毒奇珍配置 ---
export interface MedicineConfig {
  id: string
  name: string
  tier: TierColor
  category: 'BODY_MOD' | 'BATTLE_PILL' | 'WEAPON_VENOM' | 'ACUPOINT_PILL'
  effectDesc: string
  narrative: string
  source: string
  acupointEffect?: {
    type: 'FREE_PIERCE' | 'BREAKTHROUGH_RATE' | 'PREVENT_DEVIATION' | 'MULTI_PIERCE' | 'ALL_MERIDIAN'
    bonusValue?: number
  }
}

/** 冲穴专属灵丹配置（专门用于经脉温养、冲穴破障与大境界突破） */
export const ACUPOINT_PILLS: Record<string, MedicineConfig> = {
  tongmai_dan: {
    id: 'tongmai_dan',
    name: '玄门·聚气通脉丹',
    tier: 'blue',
    category: 'ACUPOINT_PILL',
    effectDesc: '温经活络。冲穴时直接抵扣全部真气消耗，瞬间打通当前经脉任意常规穴位',
    narrative: '一口吞下聚气通脉丹，一股温润草木内息沿少阳经脉飞速流转，郁结之气豁然开朗，穴道顺畅贯通！',
    source: '门派丹房兑换 / 巡历小极品掉落 / 嘉兴客栈掌柜',
    acupointEffect: { type: 'FREE_PIERCE' },
  },
  pozhang_dan: {
    id: 'pozhang_dan',
    name: '纯阳·通脉破障丹',
    tier: 'purple',
    category: 'ACUPOINT_PILL',
    effectDesc: '大境界生死玄关突破专属圣药，突破成功率直接提升 +35%，真气消耗降低 20%',
    narrative: '破障丹入腹，如纯阳烈火涤荡经络，生死玄关壁障应声而碎，天地之气汇聚丹田！',
    source: '章节守关首领掉落 / 全真纯阳宫大考 / 鬼市秘宝鉴赏',
    acupointEffect: { type: 'BREAKTHROUGH_RATE', bonusValue: 35 },
  },
  bingpo_huxin_dan: {
    id: 'bingpo_huxin_dan',
    name: '天山·冰魄护心丹',
    tier: 'purple',
    category: 'ACUPOINT_PILL',
    effectDesc: '冲穴护脉神药。冲关失败时 100% 免疫走火入魔状态，返还全部消耗真气，下次突破保底成功率额外追加 +25%',
    narrative: '冰魄护心丹化作一线冰寒清流死死锁住心脉，任凭体内真气狂暴冲撞，神识灵台始终稳如泰山！',
    source: '塞外大漠雪山奇遇 / 桃花岛药房秘制 / 华山首通宝箱',
    acupointEffect: { type: 'PREVENT_DEVIATION', bonusValue: 25 },
  },
  shaolin_xiaohuan_dan: {
    id: 'shaolin_xiaohuan_dan',
    name: '少林·大乘小还丹',
    tier: 'orange',
    category: 'ACUPOINT_PILL',
    effectDesc: '少林药局至宝。服用后百穴齐鸣，瞬间连续贯通当前经脉 3 个穴位，并永久提升根骨 +6、内力上限 +300',
    narrative: '小还丹入口即化，馥郁沉香透骨而出，数十股雄浑佛门内劲分走诸穴，阻滞穴道如摧枯拉朽般被连破三道！',
    source: '少林药局藏经阁秘传 / 论剑至尊宝匣',
    acupointEffect: { type: 'MULTI_PIERCE', bonusValue: 3 },
  },
  jiuzhuan_tongqiao_dan: {
    id: 'jiuzhuan_tongqiao_dan',
    name: '神品·九转通窍仙丹',
    tier: 'red',
    category: 'ACUPOINT_PILL',
    effectDesc: '天下第一冲穴至尊神丹。一丸入腹，整条经脉所有剩余未通穴道瞬间全部贯通！直接迎来大境界突破契机，全属性永久 +12',
    narrative: '九转仙丹霞光隐现，服之周身三百六十穴无不大放光明，真气化作滔天狂澜横扫奇经八脉，整条经脉瞬间全线通达！',
    source: '第一卷华山绝巅论剑天下第一奇遇 / 万人阵营战首功奉赐',
    acupointEffect: { type: 'ALL_MERIDIAN', bonusValue: 12 },
  },
}

export const MEDICINES: Record<string, MedicineConfig> = {
  ...ACUPOINT_PILLS,
  yaoshe_baoxue: {
    id: 'yaoshe_baoxue',
    name: '梁子翁·二十年药蛇宝血',
    tier: 'orange',
    category: 'BODY_MOD',
    effectDesc: '永久气血上限 +15%，永久毒素抗性 +50%',
    narrative: '温热蛇血滚滚入喉，腹内如烈火焚烧，全身筋脉贲张，百毒难侵之体初成！',
    source: '赵王府药房击杀宝蛇分饮',
  },
  jiuhua_yulu_wan: {
    id: 'jiuhua_yulu_wan',
    name: '桃花岛·九花玉露丸',
    tier: 'orange',
    category: 'BATTLE_PILL',
    effectDesc: '濒死时锁血1点并回复40%最大气血与全部内伤(每场限1次)',
    narrative: '心脉欲裂之际急服九花玉露丸，幽香扑鼻，强提一口先天纯阳真气逆转死局！',
    source: '黄蓉好感度赠予 / 桃花岛药房秘制',
  },
  chunyang_jindan: {
    id: 'chunyang_jindan',
    name: '全真教·纯阳金丹',
    tier: 'purple',
    category: 'BATTLE_PILL',
    effectDesc: '战斗第2回合自动服用，净化全队中毒与封穴，3回合防御+30%',
    narrative: '纯阳金丹入腹，浩然正气流转全身，毛孔逼出黑紫浊血，万邪皆避！',
    source: '全真教三代精锐配给 / 纯阳殿大考奖励',
  },
  baituo_fushe_gao: {
    id: 'baituo_fushe_gao',
    name: '白驼山·蝮蛇见血膏',
    tier: 'purple',
    category: 'WEAPON_VENOM',
    effectDesc: '外功命中附带流血剧毒，每回合损失3.5%最大气血，叠3层破甲25%',
    narrative: '剑锋淬毒幽蓝，白驼剧毒见血封喉，敌方面色青紫，气血止不住狂涌！',
    source: '白驼山庄暗器库 / 宝应松林缴获',
  },
  dahuan_dan: {
    id: 'dahuan_dan',
    name: '少林·大还丹',
    tier: 'orange',
    category: 'BATTLE_PILL',
    effectDesc: '内力低于20%时瞬补满真气池，本回合绝技威力+25%',
    narrative: '大还丹入口即化，澎湃真气如长河决堤自气海奔涌而出，招式光华大盛！',
    source: '江南客栈高僧奇遇 / 论剑至尊宝匣',
  },
}

// --- 3. 暗器机括与副手奇门配置 ---
export interface HiddenWeaponConfig {
  id: string
  name: string
  tier: TierColor
  triggerCondition: 'BATTLE_START' | 'ENEMY_ULT_READY' | 'SELF_HP_LOW' | 'ROUND_THREE'
  effectDesc: string
  castNarrative: string
  source: string
}

export const HIDDEN_WEAPONS: Record<string, HiddenWeaponConfig> = {
  feitian_tieling: {
    id: 'feitian_tieling',
    name: '柯家·飞天淬毒黑菱',
    tier: 'purple',
    triggerCondition: 'BATTLE_START',
    effectDesc: '开局抢先掷出！造成95%穿透伤害，并使敌方命中率降低35%(持续2回合)',
    castNarrative: '未及交兵，你手腕一翻，三枚淬毒铁菱裹挟尖啸激射！毒雾弥散，激得敌方双目泪流！',
    source: '柯镇恶好感度传授 / 嘉兴主线',
  },
  feihuang_shi: {
    id: 'feihuang_shi',
    name: '黄药师·弹指飞蝗玉石',
    tier: 'orange',
    triggerCondition: 'ENEMY_ULT_READY',
    effectDesc: '敌方怒气达100时触发！造成120%真实伤害并强行打散40点怒气，破其大招！',
    castNarrative: '屈指一弹，一枚碧玉飞蝗石如流星贯日打中敌方右腕要穴，敌方气机一滞，蓄力大招硬生生被破！',
    source: '桃花岛外门试炼 / 黄药师好感赠予',
  },
  dulong_yinzhen: {
    id: 'dulong_yinzhen',
    name: '彭连虎·毒龙透骨银针',
    tier: 'purple',
    triggerCondition: 'SELF_HP_LOW',
    effectDesc: '自身气血低于30%时触发！造成高额流血并封脉(本回合无法施展招式)',
    castNarrative: '生死一线间，肘后机括咔嗒轻响，三根毒龙细针电射直透敌方胸口大穴，令其气滞退后！',
    source: '王府校场战胜彭连虎掉落',
  },
  yanwei_jian: {
    id: 'yanwei_jian',
    name: '郭靖·玄铁燕尾利箭',
    tier: 'orange',
    triggerCondition: 'ROUND_THREE',
    effectDesc: '第3回合初挽雕弓射出！必定暴击造成220%穿透破甲伤害并击碎护盾',
    castNarrative: '深吸一口气挽弓如满月，弦响如雷！玄铁利箭呼啸穿透敌方重铠护盾，带出一蓬血雨！',
    source: '大漠塞外郭靖传授 / 射雕奇遇',
  },
}

// --- 4. 江湖绰号规则与称号光环 ---
export interface JianghuTitleConfig {
  id: string
  titleName: string
  tier: TierColor
  reqAlignment: 'RIGHTEOUS' | 'EVIL' | 'HERMIT'
  minReputation: number
  statBuffDesc: string
  greetingText: string
}

export const JIANGHU_TITLES: JianghuTitleConfig[] = [
  {
    id: 'title_jinlong',
    titleName: '金龙震岳 · 仁义狂客',
    tier: 'orange',
    reqAlignment: 'RIGHTEOUS',
    minReputation: 300,
    statBuffDesc: '全队外功防御 +6%，对邪派敌人伤害 +10%',
    greetingText: '哎哟！原来是威震大江南北的仁义狂客少侠！快快请进上席！',
  },
  {
    id: 'title_chongyang',
    titleName: '纯阳拂尘 · 终南逸士',
    tier: 'purple',
    reqAlignment: 'RIGHTEOUS',
    minReputation: 200,
    statBuffDesc: '离线打坐真气收益 +12%，封穴抗性 +20%',
    greetingText: '玄门正宗少侠光临，终南仙风拂面，失迎失迎！',
  },
  {
    id: 'title_youming',
    titleName: '幽冥裂骨 · 赤炼阎罗',
    tier: 'orange',
    reqAlignment: 'EVIL',
    minReputation: -300,
    statBuffDesc: '暴击率 +6%，外功招式附带2回合重伤流血',
    greetingText: '阎罗少侠手下留情！黑市暗折已为尊驾备好，切莫妄动杀念！',
  },
  {
    id: 'title_bihai',
    titleName: '碧海落梅 · 逍遥狂生',
    tier: 'purple',
    reqAlignment: 'HERMIT',
    minReputation: 0,
    statBuffDesc: '出手速度 +15，闪避率 +4%',
    greetingText: '落英缤纷客，不染世俗尘。狂生少侠请坐，且饮此盏寒梅酿！',
  },
]

// =========================================================================
// 5. 百草药材、大千灵植与神农丹方系统（金庸特色采药与炼制体系）
// =========================================================================

export interface HerbConfig {
  id: string
  name: string
  tier: TierColor
  mapId: string
  mapName: string
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
  desc: string
  ambientTip: string
  shichenBonus?: { shichens: number[]; desc: string }
}

export const HERBS: Record<string, HerbConfig> = {
  // --- 嘉兴烟雨楼外 (江南水乡泽地) ---
  sanqi: {
    id: 'sanqi',
    name: '田七三七',
    tier: 'green',
    mapId: 'jiaxing_suburb',
    mapName: '嘉兴烟雨楼外',
    rarity: 'COMMON',
    desc: '甘微苦温，止血散瘀、消肿定痛。江南潮湿草泽中成片滋生，为筑基通脉散基础辅药。',
    ambientTip: '南湖芦苇荡边青翠可人，信手拔起带着湿泥的块根。',
  },
  cheqian_cao: {
    id: 'cheqian_cao',
    name: '车前草',
    tier: 'green',
    mapId: 'jiaxing_suburb',
    mapName: '嘉兴烟雨楼外',
    rarity: 'COMMON',
    desc: '清热利尿，渗湿通淋。叶如牛舌贴地而生，调和体内燥热真气不可或缺。',
    ambientTip: '古道车辙旁叶片青翠，雨后微风带来淡淡药草清香。',
  },
  honghua: {
    id: 'honghua',
    name: '淮南红花',
    tier: 'blue',
    mapId: 'jiaxing_suburb',
    mapName: '嘉兴烟雨楼外',
    rarity: 'UNCOMMON',
    desc: '活血通经，散瘀止痛。花冠金黄初开、转红时采收，药力雄劲，助冲关破滞。',
    ambientTip: '江畔花田宛如晚霞铺地，采撷时指尖留下一抹明艳丹朱。',
  },
  heding_lu: {
    id: 'heding_lu',
    name: '南湖荷顶露',
    tier: 'blue',
    mapId: 'jiaxing_suburb',
    mapName: '嘉兴烟雨楼外',
    rarity: 'RARE',
    desc: '卯时清晨大荷叶心凝聚的纯净水珠，浸染荷香仙气，能中和天下虎狼药之火燥。',
    ambientTip: '清晨撑一叶扁舟荡入湖心，荷叶随波轻晃，玉露圆转滚入白瓷药瓶。',
    shichenBonus: { shichens: [3, 4], desc: '卯辰之交朝露最盛，采获概率大增' }, // 卯时(5-7)、辰时(7-9)
  },

  // --- 终南山·后山密林 (道门玄宗灵山) ---
  jinyinhua: {
    id: 'jinyinhua',
    name: '终南金银花',
    tier: 'green',
    mapId: 'zhongnan_forest',
    mapName: '终南山·后山密林',
    rarity: 'COMMON',
    desc: '一蒂二花，初开白后变黄，黄白相映。清热解毒、疏散风热，化解炼丹炉火微毒。',
    ambientTip: '攀援在古松树干上藤蔓丛生，芳香四溢，引来成群深山灵蝶。',
  },
  fuling: {
    id: 'fuling',
    name: '终南赤茯苓',
    tier: 'blue',
    mapId: 'zhongnan_forest',
    mapName: '终南山·后山密林',
    rarity: 'UNCOMMON',
    desc: '千岁松脂渗入地底结聚化神。皮黑肉红，宁心安神、益脾和胃，乃玄门筑基仙草。',
    ambientTip: '在枯朽老松树根三尺之下刨出，色泽如深褐赤玉，敲之声如鸣石。',
  },
  heshouwu: {
    id: 'heshouwu',
    name: '百年何首乌',
    tier: 'purple',
    mapId: 'zhongnan_forest',
    mapName: '终南山·后山密林',
    rarity: 'RARE',
    desc: '百年以上方成形体，初具人形面目。大补气血精气，补肝肾、益精血、坚筋骨。',
    ambientTip: '隐于终南绝壁石缝深处，藤蔓交错缠绕，通体紫黑莹润。',
  },
  chunyang_zhi: {
    id: 'chunyang_zhi',
    name: '全真纯阳芝',
    tier: 'orange',
    mapId: 'zhongnan_forest',
    mapName: '终南山·后山密林',
    rarity: 'EPIC',
    desc: '相传王重阳昔年活死人墓外讲道处所遗灵种，汲取九重先天纯阳紫气而成，赤霞如云。',
    ambientTip: '密林断崖迎曦之处，金红灵芝华盖亭亭，隐隐有祥瑞仙光氤氲。',
    shichenBonus: { shichens: [5, 6], desc: '巳午正阳当空时药力喷涌' },
  },

  // --- 大漠古商道 (西域塞外苍茫) ---
  mahuang: {
    id: 'mahuang',
    name: '塞外麻黄',
    tier: 'green',
    mapId: 'damo_caravan',
    mapName: '大漠古商道',
    rarity: 'COMMON',
    desc: '发汗解表、宣肺平喘、利水通窍。直立细茎，根性深固，走奇经八脉如飞箭。',
    ambientTip: '狂风吹过戈壁沙垄，几丛顽强的绿色细茎在乱石中摇曳。',
  },
  hongjingtian: {
    id: 'hongjingtian',
    name: '天山红景天',
    tier: 'blue',
    mapId: 'damo_caravan',
    mapName: '大漠古商道',
    rarity: 'UNCOMMON',
    desc: '生长于雪线绝壁碎石滩中，红白交织，强心补气、抗高寒阴霾，乃绝顶跋涉御寒奇药。',
    ambientTip: '在风蚀岩石裂隙里绽开绯红小花，采之根须清香，嚼之舌底生津。',
  },
  xuelian_hua: {
    id: 'xuelian_hua',
    name: '西域天山雪莲',
    tier: 'purple',
    mapId: 'damo_caravan',
    mapName: '大漠古商道',
    rarity: 'RARE',
    desc: '生于万年积雪极寒峭壁，五年方始绽花。叶密如毡，花色皎白，解天下奇热剧毒。',
    ambientTip: '飞雪覆冰的峰峦绝顶，一朵白玉雪莲迎着朔风傲然傲立，瓣尖微泛冷香。',
  },
  qushe_dan: {
    id: 'qushe_dan',
    name: '菩斯曲蛇胆',
    tier: 'orange',
    mapId: 'damo_caravan',
    mapName: '大漠古商道',
    rarity: 'EPIC',
    desc: '大漠荒冢奇蛇菩斯曲蛇之胆。身具金光，头生肉角，其胆深紫腥香，服之神力暴增、内力狂飙！',
    ambientTip: '深山荒谷之间忽见金鳞隐现，斩杀异蛇剥得蛇胆，握在掌心滚烫生温。',
    shichenBonus: { shichens: [11, 0], desc: '子夜阴阳交割异蛇出洞' },
  },

  // --- 湘西·黑沼泥潭 (毒障禁地泥沼) ---
  shexian_cao: {
    id: 'shexian_cao',
    name: '幽潭蛇涎草',
    tier: 'blue',
    mapId: 'heizhao_swamp',
    mapName: '湘西·黑沼泥潭',
    rarity: 'UNCOMMON',
    desc: '受万千毒蛇涎液日夜浇灌的幽暗毒草，通体呈墨绿斑纹，以毒攻毒、活络透骨。',
    ambientTip: '在泥潭毒雾咕嘟冒泡的枯木根部生长，带着一丝微甜腥气。',
  },
  wugong_qiao: {
    id: 'wugong_qiao',
    name: '百足赤蜈蚣',
    tier: 'blue',
    mapId: 'heizhao_swamp',
    mapName: '湘西·黑沼泥潭',
    rarity: 'UNCOMMON',
    desc: '黑沼泥潭百年赤背大蜈蚣蜕下之硬壳，性猛烈走窜，通关透骨，白驼山庄秘制淬毒灵料。',
    ambientTip: '在湿烂黑腐泥下一铲挖出，红甲斑斓，甲壳硬如精铁。',
  },
  duanchang_cao: {
    id: 'duanchang_cao',
    name: '绝情断肠草',
    tier: 'purple',
    mapId: 'heizhao_swamp',
    mapName: '湘西·黑沼泥潭',
    rarity: 'RARE',
    desc: '生于情花丛下三尺之内。见血封喉、剧毒断肠，然而物极必反，乃天下一等一化腐生肌之解毒圣药。',
    ambientTip: '花叶细碎泛黄，散发出清冷异香，采摘时必须以厚鹿皮手套严密包裹。',
  },
  linghu_cao: {
    id: 'linghu_cao',
    name: '黑沼灵狐仙草',
    tier: 'red',
    mapId: 'heizhao_swamp',
    mapName: '湘西·黑沼泥潭',
    rarity: 'LEGENDARY',
    desc: '唯有九尾通灵白狐出没之处方能偶遇的旷世仙草。九叶九瓣，夜间荧光如炬，神丹九转至尊引！',
    ambientTip: '黑沼深处雾气被清风吹散，一株九色荧光仙草幽幽吐蕊，灵气扑面！',
    shichenBonus: { shichens: [11, 0], desc: '子时灵狐出穴觅食，仙草方吐华光' },
  },
}

export function getMapHerbs(mapId: string): HerbConfig[] {
  return Object.values(HERBS).filter((h) => h.mapId === mapId)
}

export interface PillRecipeConfig {
  id: string
  name: string
  targetMedicineId: string
  tier: TierColor
  category: 'ACUPOINT' | 'BATTLE' | 'BODY'
  costQi: number
  costSilver: number
  minInsight: number
  baseRate: number // 基础炼成概率 (0~100)
  furnaceFlame: 'WEN' | 'WU' | 'SAMADHI' // 文火温养 / 武火猛炼 / 三昧真火
  requiredHerbs: { herbId: string; count: number }[]
  desc: string
  flameHint: string
}

export const PILL_RECIPES: Record<string, PillRecipeConfig> = {
  recipe_tongmai_dan: {
    id: 'recipe_tongmai_dan',
    name: '《聚气通脉散方》',
    targetMedicineId: 'tongmai_dan',
    tier: 'blue',
    category: 'ACUPOINT',
    costQi: 300,
    costSilver: 60,
    minInsight: 20,
    baseRate: 95,
    furnaceFlame: 'WEN',
    requiredHerbs: [
      { herbId: 'sanqi', count: 2 },
      { herbId: 'cheqian_cao', count: 2 },
      { herbId: 'fuling', count: 1 },
    ],
    desc: '玄门入门冲穴方，以温和药力温润气脉，服后无需消耗真气即可冲通一处经脉穴道。',
    flameHint: '文火细熬，待药香清透即可起炉。',
  },
  recipe_pozhang_dan: {
    id: 'recipe_pozhang_dan',
    name: '《纯阳破障金丹方》',
    targetMedicineId: 'pozhang_dan',
    tier: 'purple',
    category: 'ACUPOINT',
    costQi: 1200,
    costSilver: 180,
    minInsight: 26,
    baseRate: 80,
    furnaceFlame: 'WU',
    requiredHerbs: [
      { herbId: 'chunyang_zhi', count: 1 },
      { herbId: 'honghua', count: 3 },
      { herbId: 'heshouwu', count: 1 },
    ],
    desc: '突破大境界生死玄关至宝，纯阳正气激荡，冲关成功率直接提升 +35%，真气消耗降低 20%。',
    flameHint: '武火猛烈逼出纯阳紫气，需以内力紧锁炉盖。',
  },
  recipe_bingpo_huxin_dan: {
    id: 'recipe_bingpo_huxin_dan',
    name: '《天山冰魄护心方》',
    targetMedicineId: 'bingpo_huxin_dan',
    tier: 'purple',
    category: 'ACUPOINT',
    costQi: 1500,
    costSilver: 240,
    minInsight: 28,
    baseRate: 75,
    furnaceFlame: 'WEN',
    requiredHerbs: [
      { herbId: 'xuelian_hua', count: 2 },
      { herbId: 'hongjingtian', count: 2 },
      { herbId: 'heding_lu', count: 2 },
    ],
    desc: '冲关护脉奇药。失败时 100% 免疫走火入魔状态，返还全部消耗真气，下次突破保底成功率额外追加 +25%。',
    flameHint: '需南湖荷顶露点化天山雪莲，炉温极寒极热之间精准交替。',
  },
  recipe_shaolin_xiaohuan_dan: {
    id: 'recipe_shaolin_xiaohuan_dan',
    name: '《少林大乘小还丹谱》',
    targetMedicineId: 'shaolin_xiaohuan_dan',
    tier: 'orange',
    category: 'ACUPOINT',
    costQi: 2600,
    costSilver: 520,
    minInsight: 30,
    baseRate: 60,
    furnaceFlame: 'SAMADHI',
    requiredHerbs: [
      { herbId: 'heshouwu', count: 2 },
      { herbId: 'qushe_dan', count: 1 },
      { herbId: 'fuling', count: 3 },
      { herbId: 'chunyang_zhi', count: 1 },
    ],
    desc: '少林药局大药，百穴齐鸣，瞬间连续贯通当前经脉 3 个穴位，并永久提升根骨 +6。',
    flameHint: '佛门禅功真火化炼，三昧烈焰连烧七炷香方成。',
  },
  recipe_jiuzhuan_tongqiao_dan: {
    id: 'recipe_jiuzhuan_tongqiao_dan',
    name: '《神品九转通窍仙方》',
    targetMedicineId: 'jiuzhuan_tongqiao_dan',
    tier: 'red',
    category: 'ACUPOINT',
    costQi: 5000,
    costSilver: 1600,
    minInsight: 32,
    baseRate: 45,
    furnaceFlame: 'SAMADHI',
    requiredHerbs: [
      { herbId: 'linghu_cao', count: 1 },
      { herbId: 'qushe_dan', count: 2 },
      { herbId: 'xuelian_hua', count: 2 },
      { herbId: 'chunyang_zhi', count: 2 },
    ],
    desc: '天下第一冲穴至尊神丹，整条经脉所有剩余未通穴道瞬间全部贯通！全属性永久 +12。',
    flameHint: '九转九变，紫电隐隐自鼎口喷吐，需宗师级悟性护炉。',
  },
  recipe_jiuhua_yulu_wan: {
    id: 'recipe_jiuhua_yulu_wan',
    name: '《桃花九花玉露秘卷》',
    targetMedicineId: 'jiuhua_yulu_wan',
    tier: 'orange',
    category: 'BATTLE',
    costQi: 2200,
    costSilver: 400,
    minInsight: 28,
    baseRate: 70,
    furnaceFlame: 'WEN',
    requiredHerbs: [
      { herbId: 'heding_lu', count: 3 },
      { herbId: 'xuelian_hua', count: 1 },
      { herbId: 'honghua', count: 2 },
      { herbId: 'jinyinhua', count: 3 },
    ],
    desc: '濒死时锁血1点并回复40%最大气血与全部内伤(每场限1次)，清香甘美。',
    flameHint: '黄药师独门药道，荷露浸九花，温火九蒸九晒。',
  },
  recipe_chunyang_jindan: {
    id: 'recipe_chunyang_jindan',
    name: '《全真纯阳金丹录》',
    targetMedicineId: 'chunyang_jindan',
    tier: 'purple',
    category: 'BATTLE',
    costQi: 1000,
    costSilver: 150,
    minInsight: 24,
    baseRate: 85,
    furnaceFlame: 'WU',
    requiredHerbs: [
      { herbId: 'chunyang_zhi', count: 1 },
      { herbId: 'fuling', count: 2 },
      { herbId: 'jinyinhua', count: 2 },
    ],
    desc: '战斗第2回合自动服用，净化全队中毒与封穴，3回合防御+30%。',
    flameHint: '重阳祖师炼丹古法，金光破障，纯阳涤体。',
  },
  recipe_baituo_fushe_gao: {
    id: 'recipe_baituo_fushe_gao',
    name: '《白驼蝮蛇见血膏方》',
    targetMedicineId: 'baituo_fushe_gao',
    tier: 'purple',
    category: 'BATTLE',
    costQi: 1100,
    costSilver: 160,
    minInsight: 24,
    baseRate: 82,
    furnaceFlame: 'WU',
    requiredHerbs: [
      { herbId: 'shexian_cao', count: 3 },
      { herbId: 'wugong_qiao', count: 2 },
      { herbId: 'duanchang_cao', count: 1 },
    ],
    desc: '外功命中附带流血剧毒，每回合损失3.5%最大气血，叠3层破甲25%。',
    flameHint: '幽火慢熬，毒雾如墨，需闭气运功谨防反噬。',
  },
  recipe_dahuan_dan: {
    id: 'recipe_dahuan_dan',
    name: '《少林大还丹大宗秘典》',
    targetMedicineId: 'dahuan_dan',
    tier: 'orange',
    category: 'BATTLE',
    costQi: 3000,
    costSilver: 680,
    minInsight: 30,
    baseRate: 55,
    furnaceFlame: 'SAMADHI',
    requiredHerbs: [
      { herbId: 'heshouwu', count: 3 },
      { herbId: 'mahuang', count: 3 },
      { herbId: 'qushe_dan', count: 1 },
      { herbId: 'hongjingtian', count: 2 },
    ],
    desc: '内力低于20%时瞬补满真气池，本回合绝技威力+25%。少林镇寺之宝。',
    flameHint: '金刚伏魔真火熬炼，丹成时满室生香。',
  },
}
