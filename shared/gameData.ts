import type { BattleEffect } from './battleEffects.ts'
import { temperedItem, type EquipmentRolls } from './equipmentForge.ts'
import { BASE_ACTION_SPEED, HUANG_YAOSHI_COMBAT, IRON_PALM_WOUND, KE_POISON_DART, MAX_CRIT_PERCENT, type AttackForm, type BattleEnemyGuard, type BattleEscortAlly, type BattleObjective, type BattleOpponent, type BattleStatusRule, type CombatAlignment, type DamageElement, type EnemyCombatConfig, type PeriodicRule } from './combatMeta.ts'
import type { CombatUnitDTO, EquipSlotType, GhostMarketListingDTO, LoadoutPresetDTO, PlayerDTO, PlayerSnapshot, RaidId, SixStats, SkillSlotType, StanceType, TierColor, ZoneSafety } from './protocol.ts'
import { GAIBANG_DIVISION, GAIBANG_FINAL_EXAM, JUNSHAN_EXAM } from './gaibang.ts'
import { QUANZHEN_GUARD_EXAM, QUANZHEN_SEVEN_IDS } from './quanzhen.ts'
import { TAOHUA_FINAL_EXAM, TAOHUA_RESCUE_EXAM } from './taohua.ts'
import { SECT_EQUIPMENT_ITEMS, WANDERER_EQUIPMENT } from './sectEquipment.ts'
import { applyEquipmentAffix, CHAPTER_ONE_STATUE_MAP, trialPartId, trialStageOf, TRIAL_ITEMS, TRIAL_VARIANTS, type TrialStageConfig } from './trialStages.ts'

type PortraitStyle = CombatUnitDTO['portraitStyle']

export type { PortraitStyle }
export { ONLINE_STORY_CHAPTERS } from './storyData.ts'

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
  sectId?: string
  powerRatio: number
  combatForm?: AttackForm
  element?: DamageElement
  tradition?: 'TAOIST'
  pointStrike?: true
  area?: 'ENEMIES'
  qiDamageRatio?: number // 无视护甲的内劲真实转化率
  speedBonus?: number
  dodgeBonus?: number
  critBonus?: number
  idleQiBonus?: number   // 离线打坐加成(%)
  dropStage?: number     // 对应历练关卡推荐掉落点 (1~30)
  dropRate?: number      // 巡历挂机基准爆率
  vipTier?: number       // VIP获取门槛 (1=首充6元, 4=进阶累充, 9=至尊)
  fragmentCount?: number // 升重合成所需残卷数 (默认20)
  battleEffects?: readonly BattleEffect[]
  desc: string
  castNarrative: string
}

const KURONG_HEAL = {
  kind: 'HEAL', trigger: 'ROUND_END', target: 'SELF', unit: 'MAX_HP_PERCENT', amount: 12, belowHpPercent: 30,
} as const satisfies BattleEffect
const HUNTIAN_LOW_HP = { kind: 'OUTER_DAMAGE', percent: 20, belowHpPercent: 50 } as const satisfies BattleEffect
const LINGBO_DODGE_RAGE = { kind: 'DODGE_RAGE', amount: 25 } as const satisfies BattleEffect
const armorPenetration = (percent: number) => ({ kind: 'ARMOR_PENETRATION', percent } as const satisfies BattleEffect)
const YIYANG_PENETRATION = armorPenetration(65)
const LANHUA_INTERRUPT = { kind: 'INTERRUPT_CHARGE' } as const satisfies BattleEffect
const LUOYING_HIT_DOWN = { kind: 'ON_HIT_STATUS', area: true, rule: { status: 'HIT_DOWN', percent: 15, rounds: 1, nextRound: true } } as const satisfies BattleEffect
const DASHOUYIN_BREAK = { kind: 'ON_HIT_STATUS', rule: { status: 'DEFENSE_DOWN', percent: 30, rounds: 1, nextRound: true } } as const satisfies BattleEffect
const RUANWEI_RETALIATION = {
  kind: 'MELEE_RETALIATION', reflectPercent: 45, poisonRounds: 2, poisonAttackPercent: 10,
} as const satisfies BattleEffect
const JIUWEI_SAVE = { kind: 'FIRST_LETHAL_SAVE', heal: { percent: 30 }, escapeNextRound: true } as const satisfies BattleEffect
const BAIGU_REND = { kind: 'SHIELD_REND', multiplier: 2, bleedRounds: 2, bleedAttackPercent: 20 } as const satisfies BattleEffect
const HUBO_FOLLOW_UP = { kind: 'OUTER_FOLLOW_UP', chancePercent: 25 } as const satisfies BattleEffect
const LIANZHU_FOLLOW_UP = { kind: 'OUTER_FOLLOW_UP', chancePercent: 30 } as const satisfies BattleEffect
const HUIMA_FOLLOW_UP = {
  kind: 'OUTER_FOLLOW_UP', chancePercent: 30, moveName: '回马枪', trueAtkPercent: 150,
} as const satisfies BattleEffect

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
    battleEffects: [{ kind: 'STAT_BONUS', stats: { mpPercent: 25, atkPercent: 25, defPercent: 25, speedPercent: 25 } }],
    desc: '配入心法时，基础气血倍率为 1.25，内力上限、外功攻击、护体防御和出手速度各提高 25%。',
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
    battleEffects: [{ kind: 'STAT_BONUS', stats: { hpPercent: 25, mpPercent: 20 } }],
    desc: '九阴真经的道家筑基神篇。配入心法时，最大气血提高 25%，最大内力提高 20%。',
    castNarrative: '体内骨节如爆豆般连珠作响，易筋洗髓，九阴玄功自十二重楼奔涌而下，浑身无瑕无垢',
  },
  jiuyin_taohua: {
    id: 'jiuyin_taohua',
    sectId: 'taohua',
    name: '九阴真经·桃花岛推演',
    slot: 'INNER',
    tier: 'red',
    source: '桃花岛五阶终考「烟雨楼独抗群雄」',
    powerRatio: 1.65,
    idleQiBonus: 45,
    battleEffects: [{ kind: 'STAT_BONUS', stats: { mpPercent: 25 } }, { kind: 'CONTROL_RESIST', chancePercent: 35 }],
    desc: '黄药师以五行推演九阴心法。最大内力提高 25%，抵抗控制的概率提高 35 个百分点，修行收益提高 45%。',
    castNarrative: '按五行方位推运九阴真气，吐纳之间，胸中烦乱归于沉静',
  },
  nijiuyin_hama_gong: {
    id: 'nijiuyin_hama_gong',
    name: '逆九阴·蛤蟆功',
    slot: 'INNER',
    tier: 'red',
    source: '白驼山庄五阶终考「逆转经脉」',
    powerRatio: 1.60,
    battleEffects: [{ kind: 'CONTROL_IMMUNITY', statuses: ['SEAL', 'STUN'] }, { kind: 'ATTACK_LIFESTEAL', percent: 30 }],
    desc: '免疫封穴和点穴眩晕。外功与绝技按普通伤害实际扣除的气血吸血 30%，与同招吸血取高。',
    castNarrative: '逆运九阴，以蛤蟆劲催动掌力，内劲随每一击回流。',
  },

  // 2. 外功招式
  xianglong_18: {
    id: 'xianglong_18',
    name: '降龙十八掌',
    slot: 'OUTER',
    tier: 'red',
    source: '丐帮五阶终考「百味戏老毒物」 / 郭靖倾囊相授',
    powerRatio: 2.15,
    critBonus: 25,
    qiDamageRatio: 0.35,
    battleEffects: [armorPenetration(35)],
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
    battleEffects: [armorPenetration(40)],
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
    battleEffects: [LINGBO_DODGE_RAGE],
    desc: `极道身法。足踏伏羲六十四卦，罗袜生尘，每次成功闪避时积蓄 ${LINGBO_DODGE_RAGE.amount} 点怒气。`,
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
    battleEffects: [armorPenetration(50)],
    desc: '降龙掌至高绝诣。推出时有十分力，留在自身更有二十分后劲，排山倒海。',
    castNarrative: '长啸一声，全身真气凝聚右掌，推出时有十分力，留在自身更有二十分后劲！狂龙吟啸，天地变色',
  },
  tianxia_wugou: {
    id: 'tianxia_wugou',
    name: '天下无狗',
    slot: 'ULT',
    tier: 'red',
    source: '丐帮五阶终考「百味戏老毒物」',
    powerRatio: 2.65,
    area: 'ENEMIES',
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'SEAL', rounds: 1 } }],
    desc: '打狗棒法的末诀。攻击全部存活敌人，命中使目标封穴 1 回合。',
    castNarrative: '一式天下无狗，碧绿棒影密如急雨，直指敌方周身大穴',
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
    battleEffects: [{ kind: 'STORE_INCOMING_DAMAGE', percent: 20 }],
    desc: '欧阳锋独门内功。把护盾后外功伤害的 20% 储为劲力，下次绝技命中时返还。与蛤蟆套装的储劲比例取高。',
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
    battleEffects: [{ kind: 'STAT_BONUS', stats: { defPercent: 20 } }],
    desc: '王重阳的道家心法。护体防御提高 20%，修行收益提高 35%。',
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
    battleEffects: [{ kind: 'CONTROL_IMMUNITY', statuses: ['SEAL', 'STUN'] }, { kind: 'HIT_RAGE', amount: 10 }],
    desc: '欧阳锋逆练九阴而成的心法。免疫封穴和点穴眩晕，每次被击中额外积攒 10 点怒气。',
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'DISARM', chancePercent: 60, rounds: 1 } }],
    desc: '丐帮帮主相传之棒法。命中持兵刃的敌人时有 60% 概率缴械 1 回合。',
    castNarrative: '手中竹棒青光点点，使出打狗棒法【缠字诀】，棒影如青蛇盘旋锁死敌方要害',
  },
  xianglong_sanshi: {
    id: 'xianglong_sanshi',
    name: '降龙掌·残篇三式',
    slot: 'OUTER',
    tier: 'orange',
    source: '丐帮四阶考核「君山大会」',
    powerRatio: 1.78,
    critBonus: 15,
    qiDamageRatio: 0.2,
    battleEffects: [armorPenetration(20)],
    desc: '降龙掌的三式残篇。出招时穿透目标 20% 护体防御。',
    castNarrative: '沉肩坠肘，使出残篇中的【见龙在田】，刚猛掌劲直透护体真气',
  },
  yuxiao_jianfa: {
    id: 'yuxiao_jianfa',
    sectId: 'taohua',
    name: '玉箫剑法',
    slot: 'OUTER',
    tier: 'purple',
    source: '桃花岛三阶考核「归云庄救师兄」',
    powerRatio: 1.58,
    critBonus: 12,
    combatForm: 'SOUND',
    pointStrike: true,
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'SEAL', chancePercent: 35, rounds: 1 } }],
    desc: '以箫作剑，箫声与剑势相合。命中有 35% 概率封穴 1 回合，按音律出手结算。',
    castNarrative: '一式【凤曲长鸣】点向敌手腕间，箫孔中传出一缕幽声',
  },
  qimen_wuzhuan: {
    id: 'qimen_wuzhuan',
    sectId: 'taohua',
    name: '奇门五转',
    slot: 'LIGHT',
    tier: 'purple',
    source: '桃花岛三阶考核「归云庄救师兄」',
    powerRatio: 1,
    speedBonus: 18,
    battleEffects: [{ kind: 'OPENING_TEAM_DODGE', points: 20 }],
    desc: '出手速度 +18。开战为存活队友提高 20 个百分点闪避，持续 1 回合，沿用各自闪避上限。',
    castNarrative: '踏五行方位移步，带同伴转进生门，让开敌人锋芒',
  },
  kongming_quan: {
    id: 'kongming_quan',
    name: '空明拳',
    slot: 'OUTER',
    tier: 'orange',
    source: '桃花岛清音洞老顽童周伯通结拜传授',
    powerRatio: 1.72,
    qiDamageRatio: 0.30,
    battleEffects: [armorPenetration(30)],
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
    battleEffects: [armorPenetration(35)],
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
    battleEffects: [{ kind: 'OPENING_PRIORITY' }],
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
    battleEffects: [YIYANG_PENETRATION],
    desc: `大理南帝一灯大师的纯阳神技，隔空指力无视目标 ${YIYANG_PENETRATION.percent}% 防御。`,
    castNarrative: '神色庄严，食指缓缓冲出，嗤的一声轻响，一道纯阳指力凌空射穿敌方重甲',
  },
  bihai_chaosheng: {
    id: 'bihai_chaosheng',
    sectId: 'taohua',
    name: '碧海潮生曲',
    slot: 'ULT',
    tier: 'red',
    source: '桃花岛五阶终考「烟雨楼独抗群雄」 / 黄药师倾囊相授',
    powerRatio: 2.50,
    qiDamageRatio: 0.75,
    area: 'ENEMIES',
    battleEffects: [armorPenetration(75), { kind: 'ON_HIT_STATUS', rule: { status: 'CONFUSION', rounds: 1 } }],
    desc: '黄药师独门玉箫绝技。攻击全部存活敌人，穿透 75% 护体防御，命中使目标心神混乱 1 回合。',
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
    battleEffects: [armorPenetration(70), { kind: 'ON_HIT_STATUS', rule: { status: 'CONFUSION', rounds: 1 } }],
    desc: '九阴真经摄魂夺魄奇术。穿透目标 70% 护体防御，命中使目标心神混乱 1 回合。',
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
    battleEffects: [armorPenetration(40)],
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
    battleEffects: [HUNTIAN_LOW_HP],
    desc: `丐帮高阶心法。自身气血低于 ${HUNTIAN_LOW_HP.belowHpPercent}% 时，外功增伤 ${HUNTIAN_LOW_HP.percent}%。`,
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
    battleEffects: [{ kind: 'CONTROL_RESIST', chancePercent: 40 }],
    desc: '天龙寺不传之秘。非枯非荣，稳定心神，抵抗控制的概率提高 40 个百分点。',
    castNarrative: '面容半边红润如婴童、半边焦槁如枯木，枯荣交替之间，万念俱寂，内息渊渟岳峙',
  },
  bipo_shengong: {
    id: 'bipo_shengong',
    sectId: 'taohua',
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
    battleEffects: [{ kind: 'HEAL', trigger: 'ROUND_END', target: 'SELF', unit: 'MAX_HP_PERCENT', amount: 3 }],
    desc: '全真教正宗玄门紫气心法。每回合结束时回复自身最大气血的 3%。',
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
    battleEffects: [{ kind: 'PERIODIC_ON_HIT', rule: { status: 'heartPoison', attackPercent: 12, rounds: 2 } }],
    desc: '攻击命中附带 2 回合阴寒心毒，每回合损失相当于施招者攻击力 12% 的气血。',
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
    battleEffects: [BAIGU_REND],
    desc: `黑风双煞练偏的阴狠爪法，指如钢锥。对护盾造成 ${BAIGU_REND.multiplier} 倍损耗。命中使存活目标流血 ${BAIGU_REND.bleedRounds} 回合，每回合末直接扣除相当于施招者攻击力 ${BAIGU_REND.bleedAttackPercent}% 的气血。再次命中刷新流血。`,
    castNarrative: '五指箕张，指尖凝聚森森阴风，直插敌方天灵盖，正是狠辣无比的【九阴白骨爪】',
  },
  luoying_zhang: {
    id: 'luoying_zhang',
    sectId: 'taohua',
    name: '落英神剑掌',
    slot: 'OUTER',
    tier: 'purple',
    source: '桃花岛武学 / 陆乘风引荐',
    powerRatio: 1.48,
    critBonus: 15,
    battleEffects: [LUOYING_HIT_DOWN],
    desc: `掌影如落英纷飞，命中使全部存活敌人下回合的命中率降低 ${LUOYING_HIT_DOWN.rule.percent} 个百分点。`,
    castNarrative: '双臂挥舞，四面八方俱是掌影，宛如漫天桃花随风飘落，虚实难测',
  },
  lanhua_shou: {
    id: 'lanhua_shou',
    sectId: 'taohua',
    name: '桃花·兰花拂穴手',
    slot: 'OUTER',
    tier: 'purple',
    source: '桃花岛外门试炼 / 黄蓉好感度300点传授',
    powerRatio: 1.45,
    critBonus: 18,
    battleEffects: [LANHUA_INTERRUPT],
    desc: '桃花岛绝妙手法，出指如兰。命中正在蓄力的敌人时，打断其本次蓄力招式。',
    castNarrative: '十指如春兰绽放，指风轻拂，直取敌方气海重穴',
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
    battleEffects: [armorPenetration(25)],
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: IRON_PALM_WOUND }],
    desc: `裘千仞看家武学。命中造成重伤，使目标的疗伤效果降低 ${IRON_PALM_WOUND.percent}%，持续 ${IRON_PALM_WOUND.rounds} 回合。`,
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
    battleEffects: [armorPenetration(20)],
    desc: '全真教高阶玄门掌法。看似平淡如覆雪霜，发劲时若破冰奔雷。',
    castNarrative: '袍袖轻拂，掌法如清风拂过冰湖，接触刹那沛然道门纯阳真劲崩裂爆发！',
  },
  xuanfeng_saoye_tui: {
    id: 'xuanfeng_saoye_tui',
    sectId: 'taohua',
    name: '桃花·旋风扫叶腿',
    slot: 'OUTER',
    tier: 'orange',
    source: '桃花岛四阶考核「冯氏墓前」',
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
    battleEffects: [armorPenetration(30)],
    desc: '王重阳亲创全真剑意。出招穿透目标 30% 护体防御。',
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
    battleEffects: [{ kind: 'CONTROL_IMMUNITY', statuses: ['SEAL', 'STUN'] }],
    desc: '瑛姑独门轻功。身子滑不留手，提高闪避并免疫封穴与点穴眩晕。',
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
    sectId: 'taohua',
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
    element: 'COLD',
    qiDamageRatio: 0.60,
    battleEffects: [armorPenetration(60), { kind: 'ON_HIT_STATUS', rule: { status: 'FREEZE', rounds: 1 } }],
    desc: '瑛姑所悟冰寒指力。穿透目标 60% 护体防御，命中后冻结目标 1 回合。',
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
    battleEffects: [armorPenetration(25), { kind: 'DESPERATE_EXECUTION', belowHpPercent: 30, bossMaxHpPercent: 10, bossAttackPercent: 150 }],
    desc: '气血低于 30% 时施展，若本招实际扣血且目标已无盾，可终结非玩家、非首领目标。首领改受最多 10% 最大气血、同时不超过自身攻击力 150% 的真伤。',
    castNarrative: '长剑一抖弃绝防守，剑锋如烈日崩裂直刺中门，一往无前、抱必死之心斩出同归于尽之剑！',
  },
  tanzhi_shentong: {
    id: 'tanzhi_shentong',
    sectId: 'taohua',
    name: '桃花·弹指神通',
    slot: 'ULT',
    tier: 'orange',
    source: '桃花岛四阶考核「冯氏墓前」',
    powerRatio: 2.65,
    qiDamageRatio: 0.55,
    battleEffects: [armorPenetration(55), { kind: 'ON_HIT_STATUS', rule: { status: 'SEAL', rounds: 1 } }],
    desc: '黄药师独步江湖的指法。穿透目标 55% 护体防御，命中后封穴 1 回合。',
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
    battleEffects: [armorPenetration(35)],
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
    battleEffects: [{ kind: 'PERIODIC_IMMUNITY', status: 'bonePoison' }],
    desc: '马钰传下的玄门正宗内功。打坐时真气稳步积累，抵抗阴陵客的阴寒骨毒。',
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
    battleEffects: [{ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 15, attackerStance: 'FIERCE' }],
    desc: '九阴真经柔和化劲的法门。护盾吸收前减免来自刚猛攻击者的 15% 物理伤害。',
    castNarrative: '真气如春蚕抽丝，身形软如柳絮，迎着对方凶猛劲道随风飘扬，消弭力道于无形',
  },
  bipo_xinjue: {
    id: 'bipo_xinjue',
    sectId: 'taohua',
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
    battleEffects: [
      { kind: 'PERIODIC_REDUCTION', category: 'poison', percent: 20 },
      { kind: 'PERIODIC_REDUCTION', status: 'coldInjury', percent: 20 },
    ],
    desc: '西域养蛇强身锻体口诀。受到的毒伤和阴寒内伤降低 20%。',
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
    battleEffects: [{ kind: 'CONTROL_RESIST', chancePercent: 20, statuses: ['CONFUSION'] }],
    desc: '大理段氏家传凝神内法。抵抗心神混乱的概率提高 20 个百分点。',
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
    battleEffects: [{ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 8 }],
    desc: '少林俗家强身内功残卷。护盾吸收前减免 8% 物理伤害。',
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
    battleEffects: [armorPenetration(20)],
    desc: '杨家世代相传的枪法。出招穿透目标 20% 护体防御。',
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'ATTACK_DOWN', chancePercent: 25, percent: 20, rounds: 1 } }],
    desc: '江南七怪朱聪的近身擒拿。命中有 25% 概率使目标攻击降低 20%，持续 1 回合。',
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
    area: 'ENEMIES',
    battleEffects: [{ kind: 'PERIODIC_ON_HIT', rule: { status: 'bleed', attackPercent: 15, rounds: 2 } }],
    desc: '挥鞭横扫所有存活敌人。命中使目标流血 2 回合，每回合损失相当于施招者攻击力 15% 的气血。',
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
    battleEffects: [armorPenetration(25)],
    desc: '柯镇恶的看家杖法。出招穿透目标 25% 护体防御。',
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
    sectId: 'taohua',
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
    sectId: 'taohua',
    name: '曲家劈空掌力',
    slot: 'OUTER',
    tier: 'blue',
    source: '临安牛家村曲三酒馆密室字画参悟',
    powerRatio: 1.32,
    qiDamageRatio: 0.15,
    battleEffects: [{ kind: 'OUTER_TRUE_CONVERSION', truePercent: 15, label: '隔空真劲' }],
    desc: '曲灵风暗传的劈空掌功。出招时将本招 15% 伤害化为真实内劲。',
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
    element: 'WATER',
    critBonus: 10,
    desc: '黄河帮沙通天的水系枪法。出招狠辣断魂，专走死角扎穿肋下要害。',
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'SEAL', chancePercent: 20, rounds: 1 } }],
    desc: '铁骨折扇截击腕脉。命中有 20% 概率封穴 1 回合。',
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
    battleEffects: [armorPenetration(15), { kind: 'PERIODIC_ON_HIT', rule: { status: 'firePoison', attackPercent: 10, rounds: 2 } }],
    desc: '穿透目标 15% 护体防御。命中附带 2 回合火毒暗伤，每回合损失相当于施招者攻击力 10% 的气血。',
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
    battleEffects: [{ kind: 'MELEE_PARRY', points: 15 }],
    desc: '飞天蝙蝠辨音绝技。受到近战攻击时，招架率提高 15 个百分点。',
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
    battleEffects: [armorPenetration(20)],
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
    battleEffects: [armorPenetration(25), { kind: 'ON_HIT_STATUS', rule: { status: 'SEAL', rounds: 1 } }],
    desc: '全真剑法最凌厉单点突破式。穿透目标 25% 护体防御，命中时封穴 1 回合。',
    castNarrative: '凝神屏气长剑斜指，纯阳真气注于剑端，如定阳古针刺破坚硬护甲！',
  },
  cuixin_zhang: {
    id: 'cuixin_zhang',
    name: '摧心穿云劲',
    slot: 'ULT',
    tier: 'blue',
    source: '梅超风人皮残卷阴柔绝杀掌力',
    powerRatio: 2.35,
    element: 'COLD',
    qiDamageRatio: 0.30,
    battleEffects: [armorPenetration(30), { kind: 'PERIODIC_ON_HIT', rule: { status: 'coldInjury', attackPercent: 18, rounds: 2 } }],
    desc: '穿透目标 30% 护体防御。命中附带 2 回合阴寒内伤，每回合损失相当于施招者攻击力 18% 的气血。',
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
    battleEffects: [{ kind: 'STAT_BONUS', stats: { hpPercent: 5 } }],
    desc: '粗浅锻体功法。配入心法时最大气血 +5%。',
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
    battleEffects: [{ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 5 }],
    desc: '苦力挑夫搬运重物摸索之气力法。配入心法时，护盾吸收前减免 5% 物理伤害。',
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'DISARM', chancePercent: 20, rounds: 1 } }],
    desc: '韩宝驹所用软鞭。命中持兵刃的敌人时有 20% 概率缴械 1 回合。',
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'KNOCKBACK', chancePercent: 15, rounds: 1 } }],
    desc: '贴身翻摔，专攻下盘。命中有 15% 概率击退目标 1 回合。',
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'SEAL', chancePercent: 15, rounds: 1 } }],
    desc: '短兵判官笔法。命中有 15% 概率封穴 1 回合。',
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'DISARM', chancePercent: 15, rounds: 1 } }],
    desc: '秤钩勾兵刃，秤砣击人腕。命中持兵刃的敌人时有 15% 概率缴械 1 回合。',
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
    battleEffects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'KNOCKBACK', rounds: 1 } }],
    desc: '张阿生以肉身冲撞，命中后击退目标 1 回合。',
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
  jiuyang_shengong: {
    id: 'jiuyang_shengong',
    name: '九阳神功',
    slot: 'INNER',
    tier: 'red',
    source: '昆仑翠谷白猿奇遇',
    powerRatio: 1.65,
    idleQiBonus: 45,
    battleEffects: [
      { kind: 'MELEE_RETALIATION', reflectPercent: 40, fromHpLoss: true }, { kind: 'HIT_RAGE', amount: 10 },
      { kind: 'ROUND_CLEANSE', team: true, statuses: ['bonePoison', 'heartPoison', 'coldInjury'] },
    ],
    desc: '受击额外积攒 10 点怒气，受到近战命中时反弹实际损失气血的 40%。回合开始净化存活队友的阴寒骨毒、心毒与内伤。',
    castNarrative: '周身九阳真气沛然运转，护体金芒大盛，将敌方劲力尽数震回',
  },
  kurong_chan: {
    id: 'kurong_chan',
    name: '枯荣禅功',
    slot: 'INNER',
    tier: 'orange',
    source: '大理一灯居 / 南帝亲授',
    powerRatio: 1.38,
    idleQiBonus: 22,
    battleEffects: [KURONG_HEAL],
    desc: `枯荣相生，一灯大师疗伤之本。回合末气血低于 ${KURONG_HEAL.belowHpPercent}% 时，回复最大气血的 ${KURONG_HEAL.amount}%。离线打坐 +22%。`,
    castNarrative: '运起枯荣禅功，左半身枯寂如槁木，右半身生机勃发，伤势转眼愈合大半',
  },
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
  lanhua_fuxue: {
    id: 'lanhua_fuxue',
    sectId: 'taohua',
    name: '兰花拂穴手',
    slot: 'OUTER',
    tier: 'purple',
    source: '东海桃花岛 · 二阶',
    powerRatio: 1.4,
    critBonus: 15,
    battleEffects: [LANHUA_INTERRUPT],
    desc: '指尖如兰花轻拂，暴击率 +15%。命中正在蓄力的敌人时，打断其本次蓄力招式。',
    castNarrative: '十指翻飞如兰花绽放，轻轻拂向敌方周身要穴',
  },
  tonggui_jian: {
    id: 'tonggui_jian',
    name: '同归剑法',
    slot: 'OUTER',
    tier: 'purple',
    source: '全真教 · 三代精锐',
    powerRatio: 1.5,
    critBonus: 8,
    battleEffects: [{ kind: 'OUTER_DAMAGE', percent: 25, belowHpPercent: 30, skillOnly: true }],
    desc: '以命搏命的全真剑招。气血低于 30% 时，本招外功伤害提高 25%。',
    castNarrative: '剑尖抵向敌方，竟全不理对方来招，一式【同归于尽】的决绝剑意已锁死对手',
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
    desc: `左手画方、右手画圆。常规施展双手互搏后，有 ${HUBO_FOLLOW_UP.chancePercent}% 概率额外施展一次，免耗且不积攒怒气。`,
    battleEffects: [HUBO_FOLLOW_UP],
    castNarrative: '左手使一路刚猛掌法，右手使一路阴柔拳招，两股劲力各不相扰，同时轰向敌方',
  },
  nizhuan_jiuyin: {
    id: 'nizhuan_jiuyin',
    name: '逆转九阴',
    slot: 'ULT',
    tier: 'red',
    source: '白驼山庄五阶 · 欧阳锋真传',
    powerRatio: 3.0,
    qiDamageRatio: 0.6,
    battleEffects: [armorPenetration(60), { kind: 'POINT_CAST_IMMUNITY' }],
    desc: '倒转经脉，穿透 60% 护体防御。怒气和内力充足时，可在封穴或点穴眩晕中施展本次绝技。',
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
    desc: `弓弦连响。常规施展连珠神箭后，有 ${LIANZHU_FOLLOW_UP.chancePercent}% 概率追加一箭，免耗且不积攒怒气。暴击率 +14%。`,
    battleEffects: [LIANZHU_FOLLOW_UP],
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
    battleEffects: [DASHOUYIN_BREAK],
    desc: `重掌震散护体罡气，命中使目标下回合防御降低 ${DASHOUYIN_BREAK.rule.percent}%。`,
    castNarrative: '口诵梵咒，一掌缓缓按出，掌心泛起暗红，所过之处空气都似凝成了铁',
  },
};

const techniquesByForm = [
  ['FIST', ['kongming_quan', 'da_fumo_quan', 'lingshe_quan', 'xiaoyaoyou_quan', 'gaibang_tongchui', 'taizu_changquan', 'yanqing_quan', 'chaquan', 'luohan_quan', 'yehu_quan', 'xiaoyao_you', 'shuangshou_hubo']],
  ['PALM', ['xianglong_18', 'xianglong_sanshi', 'kanglong_youhui', 'feilong_zaitian', 'luoying_zhang', 'yinyang_mo', 'tiezhang_gong', 'lvshuang_pobing', 'wuluo_qingyan', 'tiezhang_pikan', 'bipo_zhang', 'tiesha_zhang', 'mizong_da_shou', 'cuixin_zhang', 'nanshan_zhang', 'kaishan_zhang', 'dashouyin']],
  ['FINGER', ['yiyang_zhi', 'lanhua_shou', 'hanyin_shenjian', 'tanzhi_shentong', 'lanhua_fuxue']],
  ['CLAW', ['jiuyin_baiguzhua', 'miaoshou_kongkong']],
  ['KICK', ['xuanfeng_saoye_tui', 'shisheng_chuang']],
  ['BLADE', ['dugu_jiujian', 'chongyang_jianfa', 'tonggui_jianfa', 'quanzhen_jianfa', 'duanjia_jianfa', 'kuangfeng_daofa', 'dingyang_zhen', 'yuenv_jian', 'tuniu_daofa', 'wuhu_duanmen_dao', 'ditang_dao', 'duanmen_pikan', 'tonggui_jian']],
  ['AXE', ['kaishan_fu', 'luanpi_chai']],
  ['STAFF', ['dagou_bangfa', 'tianxia_wugou', 'fumo_zhang', 'feitian_shending', 'fengmo_zhang', 'jiaohua_bang']],
  ['SPEAR', ['yangjia_qiang', 'huyan_qiang', 'duanhun_qiang', 'huima_qiang']],
  ['WHIP', ['baimang_bian', 'jinlong_bian']],
  ['ODD', ['zheshan_dianxue', 'pan_guan_bi', 'dagan_dianxue']],
  ['BOW', ['lianzhu_shenjian']], ['SOUND', ['bihai_chaosheng']], ['PROJECTILE', ['pikong_zhang']], ['QI', ['nizhuan_jiuyin', 'yihun_dafa']],
] as const satisfies readonly (readonly [AttackForm, readonly string[]])[]

for (const [form, ids] of techniquesByForm) for (const id of ids) SKILLS[id].combatForm = form
for (const id of ['quanzhen_jianfa', 'chongyang_jianfa', 'tonggui_jian', 'tonggui_jianfa', 'lvshuang_pobing', 'dingyang_zhen',
  'kongming_quan', 'da_fumo_quan', 'jiuyin_baiguzhua', 'baimang_bian', 'yihun_dafa']) SKILLS[id].tradition = 'TAOIST'
for (const id of ['yiyang_zhi', 'lanhua_shou', 'lanhua_fuxue', 'tanzhi_shentong', 'dingyang_zhen', 'zheshan_dianxue',
  'pan_guan_bi', 'dagan_dianxue', 'hanyin_shenjian']) SKILLS[id].pointStrike = true


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
    marketingDesc: '首充 6 元即赠。横扫所有存活敌人，命中后流血 2 回合，每回合损失相当于施招者攻击力 15% 的气血。',
  },
  {
    vipTier: 4,
    priceRmb: 198,
    skillId: 'tonggui_jianfa',
    skillName: '全真·同归剑法',
    tier: 'orange',
    slot: 'ULT',
    benefitTitle: '【中期越战翻盘】',
    marketingDesc: `全真七子舍命剑招，威力倍率 ${SKILLS.tonggui_jianfa.powerRatio.toFixed(2)}。本次绝技暴击率 +${SKILLS.tonggui_jianfa.critBonus} 个百分点，上限 ${MAX_CRIT_PERCENT}%。${SKILLS.tonggui_jianfa.desc}`,
  },
  {
    vipTier: 9,
    priceRmb: 1998,
    skillId: 'yijin_duangu',
    skillName: '九阴·易筋锻骨篇',
    tier: 'red',
    slot: 'INNER',
    benefitTitle: '【至尊修行神功】',
    marketingDesc: '配入心法时，挂机真气收益 +50%，气血上限 +25%，内力上限 +20%。',
  },
]

export const SKILL_DROP_RATES = {
  green: { bookRate: 0.035, fragmentRate: 0, guaranteeBattles: 0, note: '凡品大路书，约30场爆一本' },
  blue: { bookRate: 0.006, fragmentRate: 0.025, guaranteeBattles: 300, note: '良品中阶书，约160场爆一本，残卷约40场一张' },
  purple: { bookRate: 0.0006, fragmentRate: 0.006, guaranteeBattles: 1200, note: '上品名门书，约1600场爆一本，残卷约160场一张' },
  orange: { bookRate: 0.00005, bossBookRate: 0.0035, fragmentRate: 0.0005, bossFragmentRate: 0.08, guaranteeBattles: 15, note: '绝品镇派书，首领大爆约300场一本，首领残卷15场必保底' },
  red: { bookRate: 0, fragmentRate: 0.01, specialAcquireOnly: true, note: '神品绝世功法，华山绝巅首通与梵文拼合大成产出' },
}

type EquipmentStat = 'str' | 'con' | 'agi' | 'intStat'

export interface ItemConfig {
  id: string
  name: string
  slot: EquipSlotType
  combatForm?: AttackForm
  tier: TierColor
  isTrueUnique?: boolean
  reqStat?: { key: EquipmentStat; val: number; label: string } |
    { any: readonly { key: EquipmentStat; val: number; atMost?: true }[]; label: string }
  atkBonus?: number
  defBonus?: number
  hpBonus?: number
  critBonus?: number
  dodgeBonus?: number
  attributeBonus?: Partial<SixStats>
  idleBonus?: number
  idleQiPerHour?: number
  patrolQiBonus?: number
  patrolSilverBonus?: number
  masteryDiscount?: { percent: number; sectId?: string }
  breakthroughBonus?: number
  sectContributionBonus?: number
  escortAttackPercent?: number
  marketDiscount?: number
  backpackSlots?: number
  signatureOwner?: string // 名器择主共鸣角色ID/名称
  resonance?: ({ sectId: string; rank?: number } | { minStrength: number } | { companionOnly: true }) & { battleEffects: readonly BattleEffect[] }
  companionUse?: {
    owners: readonly string[];
    stance?: StanceType;
    outerSkillId?: string;
    ultimate?: string | NonNullable<EnemyCombatConfig['rageMove']>;
  }
  signatureEffect?: string
  battleEffects?: readonly BattleEffect[]
  /** 所属装备套装；散件为空 */
  setId?: string
  /** 装备的出处，用于散人混搭。 */
  sectId?: string
  baseItemId?: string
  gearSkill?: { name: string; rageCost: number; damagePercent: number }
  gearSkillDiscount?: number
  /** 详情中额外显示的属性和词条说明 */
  extra?: string
  desc: string
}

const HEAVY_SWORD_MOVES = ['bare_hands', 'dugu_jiujian', 'chongyang_jianfa', 'tonggui_jianfa',
  'quanzhen_jianfa', 'duanjia_jianfa', 'dingyang_zhen', 'yuenv_jian', 'tonggui_jian']
const STAFF_VENOM = { status: 'staffVenom', attackPercent: 12, rounds: 2, maxStacks: 3, stacksPerHit: 2 } as const

export const ITEMS: Record<string, ItemConfig> = {
  qinggang_sword: {
    id: 'qinggang_sword',
    name: '青钢长剑',
    slot: 'WEAPON',
    tier: 'blue',
    atkBonus: 45,
    critBonus: 3,
    battleEffects: [{ kind: 'STAT_BONUS', stats: { agi: 5 } }],
    desc: '嘉兴名匠打造的百炼精钢剑。身法 +5，暴击率 +3%。',
  },
  kongming_peach_sword: {
    id: 'kongming_peach_sword', name: '周伯通空明桃木剑', slot: 'WEAPON', tier: 'orange', combatForm: 'BLADE', sectId: 'quanzhen',
    reqStat: { any: [{ key: 'intStat', val: 30, atMost: true }, { key: 'agi', val: 40 }], label: '基础悟性 ≤ 30 或身法 ≥ 40' },
    atkBonus: 290,
    battleEffects: [{ kind: 'OUTER_TRUE_DAMAGE', amount: 90 }, { kind: 'OUTER_COMBO_CHANCE', points: 18 },
      { kind: 'OUTER_FOLLOW_UP', trigger: 'OUTER_CAST', basicOnly: true, chancePercent: 40, moveName: '大巧若拙' }],
    signatureEffect: '常规外功附带 90 点真伤，连击率 +18 个百分点。普攻有 40% 概率额外连击一次。',
    desc: '老顽童周伯通在清音洞削成的桃木剑。看似轻飘，实有虚柔之劲。',
  },
  xuantie_dagger: {
    id: 'xuantie_dagger',
    name: '牛家村玄铁匕首',
    slot: 'WEAPON',
    tier: 'purple',
    atkBonus: 95,
    critBonus: 15,
    battleEffects: [
      { ...armorPenetration(25), regularOuterOnly: true }, { kind: 'FLAT_ARMOR_PENETRATION', points: 45 },
      { kind: 'ON_HIT_STATUS', regularOuterOnly: true, rule: { status: 'DISARM', chancePercent: 20, rounds: 1, weaponTiers: ['green', 'blue'] } },
    ],
    signatureEffect: '常规外功固定破甲 45 点，再穿透 25% 护体防御。命中持凡品或良品兵刃的敌人时有 20% 概率缴械 1 回合。陈玄风盾破且露出罩门时可一击制敌。',
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
    battleEffects: [{ kind: 'INNER_PRESSURE_DAMAGE', forms: ['SOUND'], percent: 25 }],
    signatureOwner: '黄药师 / 桃花弟子',
    companionUse: { owners: ['huangyaoshi'], stance: 'AGILE', outerSkillId: 'luoying_zhang', ultimate: 'bihai_chaosheng' },
    resonance: { sectId: 'taohua', battleEffects: [
      { kind: 'ULT_RAGE_DISCOUNT', skillId: 'bihai_chaosheng', points: 30 },
      { kind: 'GUARD_BYPASS', guard: 'SHIELD', forms: ['SOUND'] },
    ] },
    signatureEffect: '音律出手获得的内力优势伤害加成提高 25%。桃花弟子配用时，碧海潮生曲消耗怒气减少 30 点，音律出手绕过护盾。',
    desc: '黄药师常带在身边的碧玉箫，既是乐器，也能当兵器。',
  },
  xuantie_heavysword: {
    id: 'xuantie_heavysword',
    name: '乌金玄铁重剑',
    slot: 'WEAPON',
    tier: 'red',
    reqStat: { key: 'str', val: 40, label: '臂力达到 40' },
    atkBonus: 360,
    battleEffects: [
      { kind: 'STAT_BONUS', stats: { speedPercent: -15 } },
      { kind: 'TECHNIQUE_DAMAGE', skillIds: HEAVY_SWORD_MOVES, percent: 80 },
      { kind: 'GUARD_BYPASS', guard: 'PARRY', skillIds: HEAVY_SWORD_MOVES },
      { kind: 'STRIKE_SPLASH', skillIds: HEAVY_SWORD_MOVES, percent: 30 },
    ],
    signatureOwner: '杨过 / 臂力达到 70',
    resonance: { minStrength: 70, battleEffects: [
      { kind: 'WOUNDED_TRUE_DAMAGE', skillIds: HEAVY_SWORD_MOVES, attackPercent: 25 },
    ] },
    signatureEffect: '出手速度 −15%。普攻和剑法伤害 +80%，无视招架，挥剑使其他敌人承受同招防御前伤害 30% 的余波。基础臂力达到 70 后，命中附带与已损气血比例成正比的真伤，上限为攻击力的 25%。',
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
    signatureOwner: '洪七公 / 黄蓉',
    companionUse: { owners: ['hongqigong', 'huangrong'], stance: 'AGILE', outerSkillId: 'dagou_bangfa' },
    battleEffects: [
      { kind: 'STAT_BONUS', stats: { hit: 35 } }, { kind: 'TECHNIQUE_DAMAGE', skillIds: ['dagou_bangfa'], percent: 50 },
      { kind: 'ROUND_ENEMY_STATUS', leaderOnly: true, rule: { status: 'ULT_LOCK', chancePercent: 40, rounds: 1 }, requiresOuterSkillId: 'dagou_bangfa' },
    ],
    signatureEffect: '命中率 +35 个百分点。配用打狗棒法时，本招伤害 +50%，每回合有 40% 概率缠住敌方主将，使其封招 1 回合。',
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
    battleEffects: [{ kind: 'MP_RECOVERY_BONUS', percent: 10 }],
    signatureEffect: '自身被动回复内力的数值提高 10%。',
    desc: '全真弟子常穿的青色道袍。穿上后，修行能攒到更多真气。',
  },
  wucan_baoyi: {
    id: 'wucan_baoyi',
    name: '大雪山乌蚕宝衣',
    slot: 'ARMOR',
    tier: 'orange',
    defBonus: 165,
    hpBonus: 2400,
    battleEffects: [{ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 35 }],
    signatureEffect: '受到外功攻击时，在护盾吸收前减免 35% 物理伤害。',
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
    desc: '冲关失败时自动护住心脉，免除本次走火，下次突破保底提高 25 个百分点。',
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
    battleEffects: [RUANWEI_RETALIATION],
    signatureEffect: `受到近战命中时，倒刺反伤等于攻击者攻击力的 ${RUANWEI_RETALIATION.reflectPercent}%。存活的攻击者中软猬剧毒 ${RUANWEI_RETALIATION.poisonRounds} 回合，每回合损失相当于穿戴者攻击力 ${RUANWEI_RETALIATION.poisonAttackPercent}% 的气血。再次触发时刷新持续回合。`,
    desc: '桃花岛的护身宝甲，外头密密长着一层倒刺。',
  },
  iron_bagua: {
    id: 'iron_bagua',
    name: '曲三铁八卦',
    slot: 'ACC',
    tier: 'blue',
    hpBonus: 350,
    idleBonus: 10,
    battleEffects: [{ kind: 'STAT_BONUS', stats: { intStat: 5 } }],
    signatureEffect: '悟性 +5，打坐真气收益 +10%，巡历遭遇发现秘境宝箱的概率提高 15%',
    desc: '忘机客留下的铁八卦，刻着桃花岛的记号。拜师桃花岛时要带上它。',
  },
  jiuwei_fox: {
    id: 'jiuwei_fox',
    name: '黑沼·九尾灵狐',
    slot: 'ACC',
    tier: 'orange',
    critBonus: 15,
    hpBonus: 1200,
    signatureEffect: `【灵狐跃影】出手速度 +25%，闪避率 +15 个百分点。每场战斗首次受到致命一击时锁血至 1 点气血，回复最大气血的 ${JIUWEI_SAVE.heal.percent}%，下一回合遁逃并闪避直接攻击。`,
    battleEffects: [{ kind: 'STAT_BONUS', stats: { speedPercent: 25, dodge: 15 } }, JIUWEI_SAVE],
    desc: '瑛姑送来的白狐。带它同行能提高气血上限和暴击率。',
  },
  wumu_yishu: {
    id: 'wumu_yishu',
    name: '岳武穆遗书',
    slot: 'RELIC',
    tier: 'red',
    battleEffects: [
      { kind: 'TEAM_STATS', stats: { def: 150, hp: 2000 } }, { kind: 'GUOJING_COMBO', attackPercent: 150 },
      { kind: 'TEAM_AREA_REDUCTION', percent: 40 }, { kind: 'DISMOUNT_CAVALRY' },
    ],
    desc: '岳飞留下的兵书。全队护体防御 +150，气血上限 +2000，太极御掌时额外减免 40% 掌风伤害。主角命中后，郭靖以 150% 威力的降龙掌跟进。开战卸去敌方骑兵的护体防御。',
  },
  jiuyin_sanskrit: {
    id: 'jiuyin_sanskrit', name: '九阴真经·梵文总纲', slot: 'RELIC', tier: 'red',
    battleEffects: [
      { kind: 'TEAM_STATS', stats: { atk: 200, mp: 1500, crit: 15 } },
      { kind: 'TRUE_STRIKE', chancePercent: 100, moveName: '阴阳相济', team: true },
    ],
    signatureEffect: '【阴阳相济】全队出招伤害化为真伤，无视护体防御、招架和护盾。伤害依实际命中与剩余气血结算。',
    desc: '黄蓉将牛家密室与华山绝巅的梵文拼合为一卷。全队攻击 +200、内力上限 +1500、暴击率 +15 个百分点。',
  },
  beidou_formation_book: {
    id: 'beidou_formation_book', name: '天罡北斗阵图', slot: 'RELIC', tier: 'orange',
    battleEffects: [
      { kind: 'TEAM_STATS', stats: { parry: 25 } }, { kind: 'PARRY_REFLECT', percent: 20, team: true },
      { kind: 'DAMAGE_SHARE_FORMATION', parryPoints: 0, hitRageMultiplier: 1.5, sharedRage: true },
    ],
    signatureEffect: '【七星连珠】全队招架率 +25 个百分点，招架时按实扣气血的 20% 反震。三人都存活时均摊单体伤害，各自结算护盾，实扣气血者受击怒气 +50%。',
    desc: '全真三代精锐可领阵图。历练胜过烟雨楼的全真七子也可取得。',
  },
  qimen_divination_scroll: {
    id: 'qimen_divination_scroll', name: '奇门遁甲易数残卷', slot: 'RELIC', tier: 'orange',
    battleEffects: [
      { kind: 'TEAM_STATS', stats: { speedPercent: 15 } },
      { kind: 'ROUND_ENEMY_STATUS', rule: { status: 'SLOW', percent: 10, rounds: 1, nextRound: false } },
      { kind: 'ROUND_TEAM_RESTORE', every: 2, hpPercent: 10 },
    ],
    signatureEffect: '【休生奇门】全队出手速度 +15%，每回合开始使敌方出手速度降低 10%。每逢偶数回合结束，为存活队友驱散中毒、流血并各自回复 10% 最大气血。',
    desc: '在历练「碧海听箫」答对奇门题并获胜后，由黄药师赠予。',
  },
  xiaoao_qupu: {
    id: 'xiaoao_qupu',
    name: '笑傲江湖琴箫谱',
    slot: 'RELIC',
    tier: 'red',
    critBonus: 20,
    battleEffects: [{ kind: 'MIXED_KARMA_HARMONY', speedPercent: 20, rage: 20 }],
    signatureEffect: '琴箫合奏：正邪同时在阵时，免除阵营相斥的减速，全队出手速度 +20%，每回合开始回复 20 怒气，以 100 封顶。',
    desc: '刘正风与曲洋留下的琴箫合奏谱。装备者暴击率 +20 个百分点，正邪同行时奏起合鸣。',
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
  qimei_stick: {
    id: 'qimei_stick',
    name: '齐眉熟铜棍',
    slot: 'WEAPON',
    tier: 'blue',
    battleEffects: [{ kind: 'STAT_BONUS', stats: { parry: 5 } }],
    signatureEffect: '招架率 +5 个百分点。',
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
    battleEffects: [{ kind: 'OPENING_PRIORITY' }],
    signatureEffect: '抢占开局先手。',
    desc: '郭靖在大漠射雕所用的铁胎硬弓，弓如满月，开局必定先声夺人。',
  },
  chansi_hufan: {
    id: 'chansi_hufan',
    name: '玄铁缠丝护腕',
    slot: 'WEAPON',
    tier: 'blue',
    atkBonus: 55,
    critBonus: 6,
    battleEffects: [{ kind: 'TECHNIQUE_DAMAGE', forms: ['FIST', 'PALM'], percent: 12 }, { kind: 'PARRY_MP_DISCOUNT', percent: 20 }],
    signatureEffect: '拳掌伤害 +12%。成功招架并减伤时，消耗的内力降低 20%。',
    desc: '赵王府武库所藏，双拳相击铮然作响。',
  },
  fumo_staff: {
    id: 'fumo_staff',
    name: '伏魔大铁杖',
    slot: 'WEAPON',
    tier: 'purple',
    reqStat: { key: 'str', val: 25, label: '臂力 ≥ 25' },
    atkBonus: 118,
    signatureOwner: '柯镇恶 / 江南七怪',
    companionUse: { owners: ['kezhene'], stance: 'FIERCE', outerSkillId: 'fumo_zhang', ultimate: KE_POISON_DART },
    resonance: { companionOnly: true, battleEffects: [
      { kind: 'ON_HIT_STATUS', skillIds: ['fumo_zhang'], rule: { status: 'STUN', rounds: 1 } },
      { kind: 'GUARANTEED_CRIT', skillIds: [KE_POISON_DART.id] },
    ] },
    battleEffects: [
      { kind: 'TARGET_TRAIT_DAMAGE', traits: ['HERETIC'], negativeKarma: true, percent: 30 },
      { kind: 'FLAT_ARMOR_PENETRATION', points: 25 }, { kind: 'STAT_BONUS', stats: { parryAbsorb: 8 } },
    ],
    signatureEffect: '【降魔辟邪】对侠义低于 0 的邪派敌人伤害 +30%。常规外功固定破甲 +25，招架吸伤 +8 个百分点。柯镇恶穿戴时伏魔杖法命中必眩晕 1 回合，飞天淬毒铁菱必暴。',
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
    companionUse: { owners: ['yangtiexin', 'munianci'], stance: 'FIERCE', outerSkillId: 'yangjia_qiang' },
    signatureEffect: `【回马破甲】常规外功固定破甲 +20，流血伤害 +25%。常规施展外功后有 ${HUIMA_FOLLOW_UP.chancePercent}% 概率触发回马枪，造成穿戴者攻击力 ${HUIMA_FOLLOW_UP.trueAtkPercent}% 的真实伤害。`,
    battleEffects: [HUIMA_FOLLOW_UP, { kind: 'FLAT_ARMOR_PENETRATION', points: 20 }, { kind: 'PERIODIC_TICK_DAMAGE', category: 'bleed', percent: 25 }],
    desc: '杨家祖传的烂银枪，枪出如银龙出水。',
  },
  xuantie_feizhua: {
    id: 'xuantie_feizhua',
    name: '白骨镀银九节鞭',
    slot: 'WEAPON',
    tier: 'purple',
    reqStat: { key: 'agi', val: 28, label: '身法 ≥ 28' },
    atkBonus: 195,
    critBonus: 12,
    signatureOwner: '梅超风',
    companionUse: { owners: ['meichaofeng'], stance: 'FIERCE', outerSkillId: 'jiuyin_baiguzhua' },
    battleEffects: [
      { kind: 'REAR_OUTER_TARGET' },
      { kind: 'ON_HIT_STATUS', attack: 'OUTER', chancePercent: 30, rules: [
        { status: 'DODGE_DOWN', percent: 100, nextRound: true, rounds: 1 },
        { status: 'SLOW', percent: 20, nextRound: true, rounds: 1 },
      ] },
    ],
    signatureEffect: '【索命盘绕】外功优先攻击存活后排。命中有 30% 概率使目标下回合无法普通闪避，出手速度降低 20%。',
    desc: '梅超风的成名兵刃，旧称玄铁飞抓。荒山救下梅超风或战胜历练第 17 关可得。',
  },
  baituo_fan: {
    id: 'baituo_fan',
    name: '白驼山描金折扇',
    slot: 'WEAPON',
    tier: 'purple',
    reqStat: { key: 'intStat', val: 30, label: '悟性 ≥ 30' },
    atkBonus: 98,
    critBonus: 10,
    dodgeBonus: 8,
    signatureOwner: '欧阳克 / 白驼山传人',
    companionUse: { owners: ['ouyangke'] },
    battleEffects: [
      { kind: 'STAT_BONUS', stats: { agi: 18 } },
      { kind: 'ACTION_END_DARTS', count: 3, attackPercent: 20,
        rule: { status: 'needlePoison', attackPercent: 10, rounds: 2, maxStacks: 3, defenseDownPercent: 15 } },
    ],
    signatureEffect: '【扇底藏针】身法 +18，闪避率 +8 个百分点。行动结束后连发三枚毒针，每针按攻击力 20% 结算物伤，附加 2 回合扇骨针毒，最多 3 层。每层每回合扣攻击力的 10%，中毒期间防御降低 15%。',
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
    companionUse: { owners: ['ouyangfeng'], stance: 'FIERCE', outerSkillId: 'lingshe_quan' },
    battleEffects: [
      { kind: 'PERIODIC_TICK_DAMAGE', category: 'poison', percent: 25 },
      { kind: 'STAT_BONUS', stats: { parry: 15 } },
    ],
    resonance: { sectId: 'baituo', battleEffects: [
      { kind: 'PERIODIC_ON_HIT', regularOuterOnly: true, rule: STAFF_VENOM },
      { kind: 'PERIODIC_ON_RECEIVE', rule: STAFF_VENOM },
    ] },
    signatureEffect: '【双蛇噬魂】自身施加的毒伤 +25%，招架率 +15 个百分点。白驼弟子常规外功命中或实际受击时给对方叠 2 层灵蛇剧毒，最多 3 层，持续 2 回合。每层每回合扣攻击力的 12%。',
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
    battleEffects: [
      { kind: 'TECHNIQUE_DAMAGE', forms: ['FIST', 'PALM', 'FINGER', 'CLAW'], percent: 35 },
      { kind: 'BLADE_CATCH', parryPoints: 25, chancePercent: 35, reflectPercent: 30, attackDownPercent: 30 },
    ],
    signatureEffect: '【空手夺白刃】拳掌指爪类武学伤害 +35%。受刀剑攻击时招架率 +25 个百分点。受刀剑外功攻击时另有 35% 概率擒刃挡下该击，反震格挡量的 30%，使对手下回合攻击降低 30%。',
    desc: '铁掌峰密室所藏，以天蚕金丝织就，面对劈面而来的利刃，戴着它的肉掌可直接抓住剑锋。',
  },
  jiudai_baina: {
    id: 'jiudai_baina',
    name: '九袋百衲丐衣',
    slot: 'ARMOR',
    tier: 'purple',
    defBonus: 90,
    hpBonus: 1500,
    battleEffects: [{ kind: 'HIT_RAGE', amount: 10 }, { kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 25, criticalOnly: true }],
    signatureEffect: '受到命中时额外积攒 10 点怒气，受到暴击时减免 25% 伤害。',
    desc: '丐帮长老方可穿着的百衲衣。',
  },
  baituo_jinsi: {
    id: 'baituo_jinsi',
    name: '白驼金丝锦袍',
    slot: 'ARMOR',
    tier: 'purple',
    defBonus: 85,
    hpBonus: 1400,
    battleEffects: [
      { kind: 'POISON_MP_RECOVERY', resistancePercent: 60, recoverPercent: 50 }, { kind: 'PERIODIC_IMMUNITY', status: 'snakeVenom' },
    ],
    desc: '熏制西域奇香的金丝锦袍，免疫蛇奴毒雾。毒伤减免 60%，将锦袍实际减免量的 50% 回复为内力，以缺失内力为限。',
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
    battleEffects: [{ kind: 'LIGHT_DODGE_PENETRATION', percent: 30 }],
    desc: '郭靖一箭双雕所用的白羽箭。暴击率 +12%，忽略目标轻功提供的 30% 普通闪避。',
  },
  dadiao_jindao: {
    id: 'dadiao_jindao',
    name: '大漠金刀',
    slot: 'ACC',
    tier: 'orange',
    reqStat: { key: 'str', val: 32, label: '臂力 ≥ 32' },
    critBonus: 10,
    hpBonus: 1800,
    battleEffects: [{ kind: 'STAT_BONUS', stats: { str: 25 } }, { kind: 'TARGET_TRAIT_DAMAGE', traits: ['JIN', 'MONGOL', 'MOUNTED'], percent: 35, team: true }],
    signatureEffect: '【草原雄鹰】对阵金国、蒙古军团及骑兵 Boss，全队伤害提升 35%！',
    desc: '成吉思汗亲赐的镶宝金刀，封"金刀驸马"的信物。',
  },
}

for (const item of [...TRIAL_ITEMS, ...TRIAL_VARIANTS, ...SECT_EQUIPMENT_ITEMS, ...WANDERER_EQUIPMENT.items]) ITEMS[item.id] = item

const gearBySchool = {
  quanzhen: ['quanzhen_robe', 'quanzhen_beidou_'],
  gaibang: ['dagou_stick_true', 'jiudai_baina'],
  taohua: ['biyu_xiao', 'ruanwei_armor', 'ruanwei_shard', 'bihai_chaosheng_'],
  baituo: ['lingshe_zhang', 'baituo_jinsi', 'baituo_fan', 'baituo_yushe_', 'baituo_zheshan_'],
  jiangnan_wuguan: ['qimei_stick'],
  tiezhang: ['tiezhang_kaishan_'],
  shaolin: ['fahua_zuyi_'],
} as const
for (const [sectId, ids] of Object.entries(gearBySchool)) {
  for (const item of Object.values(ITEMS)) if (ids.some((id) => id.endsWith('_') ? item.id.startsWith(id) : item.id === id)) item.sectId = sectId
}

export function equipmentItem(id: string | null | undefined, player?: EquipmentRolls) {
  const base = id ? ITEMS[id] : undefined
  if (!base) return
  const state = player?.equipmentForge?.items[base.id]
  const item = applyEquipmentAffix(temperedItem(base, state?.stars ?? 0), player?.equipmentAffixes?.[base.id], base)
  const secondary = state?.secondary
  return secondary ? { ...item, battleEffects: [
    ...(item.battleEffects ?? []),
    { kind: 'STAT_BONUS' as const, stats: { [secondary.stat]: secondary.value } },
  ] } : item
}

export function trialRewardItems(stage: TrialStageConfig, firstClear: boolean, ownedItemIds: readonly string[],
  progress?: { rewardedStageIds: readonly number[]; answer?: string; huangrongRecruited: boolean },
) {
  const ids = firstClear ? stage.firstClearParts.map((slot) => trialPartId(stage.setId, slot)) : []
  if (stage.clearItemId && (!stage.clearItemRequiresPuzzle || (stage.puzzle && stage.puzzle.answer === progress?.answer))) ids.push(stage.clearItemId)
  if (progress?.huangrongRecruited && ((stage.id === 24 && progress.rewardedStageIds.includes(30)) ||
    (stage.id === 30 && progress.rewardedStageIds.includes(24)))) ids.push('jiuyin_sanskrit')
  return ids.filter((id) => !ownedItemIds.includes(id)).map((id) => ITEMS[id])
}

export function canEquipCompanionItem(companion: CompanionView, item: ItemConfig | undefined) {
  if (!item || item.slot === 'RELIC') return false
  return meetsItemStatRequirement(item, companion.stats) || !!item.companionUse?.owners.includes(companion.id)
}

export function meetsItemStatRequirement(item: ItemConfig, stats: Pick<SixStats, EquipmentStat>) {
  const requirement = item.reqStat
  if (!requirement) return true
  if ('key' in requirement) return stats[requirement.key] >= requirement.val
  return requirement.any.some(({ key, val, atMost }) => atMost ? stats[key] <= val : stats[key] >= val)
}

const weaponsByForm = [
  ['BLADE', ['qinggang_sword', 'xuantie_dagger', 'xuantie_heavysword', 'pomiao_caomang_weapon', 'huangshan_kulou_weapon', 'henglian_tongjia_weapon', 'huanghe_sigui_weapon', 'jinwang_fuxiu_weapon', 'kongming_wantong_weapon', 'hama_nimai_weapon', 'jiuwei_linghu_weapon', 'xizheng_jindao_weapon', 'quanzhen_beidou_weapon', 'niluan_jiuyin_weapon']],
  ['STAFF', ['dagou_stick_true', 'qimei_stick', 'fumo_staff', 'lingshe_zhang', 'fahua_zuyi_weapon', 'jiangnan_qiguai_weapon', 'huanghe_nilang_weapon', 'qimen_dunjia_weapon', 'baituo_yushe_weapon']],
  ['SPEAR', ['yangjia_spear', 'changbai_canxian_weapon', 'taihu_shuizhai_weapon', 'qianying_mixing_weapon', 'dajin_sishi_weapon']],
  ['BOW', ['tiebai_bow', 'damo_qibing_weapon']], ['WHIP', ['xuantie_feizhua', 'jiuyin_baigu_weapon']],
  ['FIST', ['chansi_hufan', 'tiancan_glove', 'jiamian_piaoping_weapon', 'tiezhang_kaishan_weapon']],
  ['ODD', ['baituo_fan', 'zuixian_xingshang_weapon', 'qianshou_panguan_weapon', 'xiyu_mizong_weapon', 'baituo_zheshan_weapon', 'canghai_kuanglan_weapon']],
  ['SOUND', ['biyu_xiao', 'bihai_chaosheng_weapon']],
] as const satisfies readonly (readonly [AttackForm, readonly string[]])[]

for (const [form, ids] of weaponsByForm) for (const id of ids) ITEMS[id].combatForm = form
for (const variant of TRIAL_VARIANTS) variant.combatForm = ITEMS[variant.baseItemId!].combatForm

export const COOP_RAID_RELICS = [ITEMS.wumu_yishu, ITEMS.xiaoao_qupu]

export const SHAOSHI_RAID = {
  title: '少室山 · 金刚伏魔圈',
  boss: { name: '少林·渡厄神僧', title: '金刚伏魔圈主阵', portrait: 'monk', hp: 26000, atk: 1150, mp: 9500, stance: 'TAICHI',
    combat: { def: 240, openingShield: 1200, alignment: 'RIGHTEOUS', weapon: { form: 'WHIP', tier: 'red' },
      charge: { round: 5, name: '伏魔黑索阵', damageMultiplier: 1.35, innerPressure: true, area: true, requiresWeapon: true, taichiGuard: true, interruptSkillIds: ['yiyang_zhi'] },
    } },
  guards: [
    { name: '渡难神僧', title: '黑索左阵', portrait: 'monk', hp: 12000, atk: 780, mp: 1800, stance: 'FIERCE',
      combat: { alignment: 'RIGHTEOUS', weapon: { form: 'WHIP', tier: 'orange' },
        rageMove: { id: 'shaoshi_chain_front', name: '黑索压阵', powerRatio: 1.35, form: 'WHIP', target: 'FRONT' },
      } },
    { name: '渡劫神僧', title: '黑索右阵', portrait: 'monk', hp: 12000, atk: 780, mp: 1800, stance: 'AGILE',
      combat: { alignment: 'RIGHTEOUS', weapon: { form: 'WHIP', tier: 'orange' },
        rageMove: { id: 'shaoshi_chain_rear', name: '黑索绕后', powerRatio: 1.2, form: 'WHIP', target: 'REAR' },
      } },
  ],
  rewardQi: 18500,
  rewardSilver: 5200,
} as const

const beidouStage = trialStageOf(28)!

function scaleChongyangEnemy(enemy: BattleEnemyGuard, mp: number): BattleOpponent {
  return {
    ...enemy,
    hp: enemy.hp * 2,
    atk: Math.round(enemy.atk * 1.25),
    mp,
    stance: enemy.stance ?? beidouStage.boss.stance,
    combat: { ...enemy.combat, speed: Math.round((enemy.combat?.speed ?? BASE_ACTION_SPEED) * 1.8) },
  }
}

interface RaidEnemyGroup {
  boss: BattleOpponent
  guards: readonly BattleOpponent[]
}

export interface CoopRaidConfig extends RaidEnemyGroup {
  title: string
  mapId: string
  description: string
  enrageText?: string
  survival?: { rounds: number; nextWaves: readonly (RaidEnemyGroup & { round: number })[] }
  clearField: keyof Pick<PlayerSnapshot, 'shaoshiClears' | 'chongyangClears' | 'juxianClears'>
  rewardQi: number
  rewardSilver: number
  relics: readonly ItemConfig[]
  firstClearBonus?: { qiExp: number; silver: number }
}

export const COOP_RAIDS: Record<RaidId, CoopRaidConfig> = {
  shaoshi: {
    ...SHAOSHI_RAID,
    clearField: 'shaoshiClears',
    mapId: 'shaoshi',
    description: '渡难压左翼前排，渡劫绕袭右翼。渡厄蓄力时，一阳指和兰花拂穴手可抢先打断。',
    enrageText: '久战不下，金刚伏魔圈血煞翻涌，仍在场的神僧进入【狂暴】！',
    relics: COOP_RAID_RELICS,
  },
  chongyang: {
    title: '重阳宫·天罡北斗大阵',
    clearField: 'chongyangClears',
    mapId: 'zhongnan_forest',
    description: '王处一和丘处机轮流居前，前排招架提高 20 个百分点。任一能出手的侠客速度超过两人，即可抢占北极星位破阵。',
    enrageText: '久战不下，仍在场的全真道长进入【狂暴】！',
    boss: scaleChongyangEnemy(beidouStage.boss, 9500),
    guards: (beidouStage.guards ?? []).map((guard) => scaleChongyangEnemy(guard, 1800)),
    rewardQi: 18500,
    rewardSilver: 5200,
    relics: [ITEMS.beidou_formation_book],
  },
  juxian: {
    title: '聚贤庄·血战三百群豪',
    clearField: 'juxianClears',
    mapId: 'juxian_manor',
    description: '群豪每三回合换一波。撑满 15 回合且至少一位侠客存活，即可随萧远山破围。',
    boss: {
      name: '游骥', title: '聚贤庄庄主', portrait: 'bandit', hp: 12500, atk: 850, mp: 2400, stance: 'FIERCE',
      combat: { def: 80, weapon: { form: 'BLADE', tier: 'blue' }, statusOnHit: { status: 'SLOW', percent: 15, rounds: 2, nextRound: true } },
    },
    guards: [{
      name: '游驹', title: '聚贤庄庄主', portrait: 'bandit', hp: 10000, atk: 760, mp: 2100, stance: 'TAICHI',
      combat: { parry: 15, weapon: { form: 'BLADE', tier: 'blue' }, periodicOnHit: { status: 'bleed', attackPercent: 12, rounds: 3 } },
    }],
    survival: {
      rounds: 15,
      nextWaves: [
        {
          round: 4,
          boss: { name: '玄难', title: '少林高僧', portrait: 'monk', hp: 15500, atk: 920, mp: 4600, stance: 'TAICHI',
            combat: { def: 140, openingShield: 900, parry: 20 } },
          guards: [{ name: '玄寂', title: '少林高僧', portrait: 'monk', hp: 11500, atk: 800, mp: 3600, stance: 'FIERCE' }],
        },
        {
          round: 7,
          boss: { name: '奚长老', title: '丐帮长老', portrait: 'hongqigong', hp: 16500, atk: 1060, mp: 4200, stance: 'FIERCE',
            combat: { weapon: { form: 'STAFF', tier: 'purple' }, rageMove: { id: 'juxian_staff', name: '长杖压阵', form: 'STAFF', powerRatio: 1.2, target: 'FRONT' } } },
          guards: [{ name: '丐帮执杖弟子', title: '群豪援手', portrait: 'bandit', hp: 12000, atk: 830, mp: 2300, stance: 'AGILE' }],
        },
        {
          round: 10,
          boss: { name: '白世镜', title: '丐帮执法长老', portrait: 'hongqigong', hp: 17500, atk: 1150, mp: 4700, stance: 'AGILE',
            combat: { def: 135, weapon: { form: 'BLADE', tier: 'purple' }, statusOnHit: { status: 'STUN', chancePercent: 20, rounds: 1 } } },
          guards: [{ name: '丐帮执法弟子', title: '群豪援手', portrait: 'bandit', hp: 13000, atk: 880, mp: 2600, stance: 'TAICHI' }],
        },
        {
          round: 13,
          boss: { name: '玄难', title: '群豪合围', portrait: 'monk', hp: 20500, atk: 1220, mp: 5800, stance: 'TAICHI',
            combat: { def: 160, openingShield: 1200, charge: { round: 14, name: '群豪合围', damageMultiplier: 1.35, area: true, interruptSkillIds: ['yiyang_zhi'] } } },
          guards: [{ name: '玄寂', title: '群豪合围', portrait: 'monk', hp: 14000, atk: 950, mp: 4100, stance: 'FIERCE' }],
        },
      ],
    },
    rewardQi: 18500,
    rewardSilver: 5200,
    relics: [],
    firstClearBonus: { qiExp: 10000, silver: 3000 },
  },
}

export interface CompanionForm {
  tier: TierColor
  title: string
  assistSkillName: string
  assistDesc: string
  battleSupport?: readonly BattleEffect[]
  battleAttack?: {
    stance: StanceType
    target: 'FRONT' | 'REAR' | 'LOWEST_HP'
    skillId?: string
    form?: AttackForm
    powerRatio?: number
    everyRound?: true
    afterLeaderHit?: true
    requiresBond?: string
    openingSkillId?: string
    followUpShots?: number
    poison?: PeriodicRule
    hitStatus?: BattleStatusRule
    hitStatusArea?: true
    finisher?: { belowHpPercent: number; damagePercent: number }
    burst?: { charges: number; powerMultiplier: number; rule: BattleStatusRule }
  }
  baseHp: number
  baseAtk: number
}

export type CompanionGrade = '下' | '中' | '上'
/** 橙品资质的属性系数（第12册 §二） */
export const GRADE_MULT: Record<CompanionGrade, number> = { 下: 0.88, 中: 1.0, 上: 1.12 }

export interface CompanionConfig extends CompanionForm {
  id: string
  name: string
  female?: true
  alignment?: CombatAlignment
  /** EITHER：左右翼皆可编入（如周伯通，可与洪七公组成「射雕三绝」） */
  role: 'LEFT' | 'RIGHT' | 'EITHER'
  /** 获取路线：主线、历练、好感或客栈结缘 */
  route: 'STORY' | 'TRIAL' | 'AFFINITY' | 'GACHA'
  /** 好感线橙品的资质（下/中/上），影响属性系数；其余为 undefined */
  grade?: '下' | '中' | '上'
  /** 觉醒形态（需好感 ≥600 + 伙伴信物）；基础形态由本配置的顶层字段给出 */
  awakened?: CompanionForm
  awakenTokens?: number
  /** 入队除好感 ≥100 外还需此剧情标记（如洪七公须先呈齐「十道绝味」）；付费获得不受限 */
  recruitFlag?: string
  portraitStyle: PortraitStyle
  /** 尚未结识时，客栈卡片上显示的结识线索 */
  meetHint?: string
  poem: string
  favGift: string
  teachSkillId: string // 好感度达到600(生死之交)传授给主角的绝学
}

const GUOJING_COVER = { kind: 'LEADER_COVER', trigger: 'LETHAL', percent: 100,
  counter: { skillId: 'xianglong_18', stance: 'FIERCE', target: 'ATTACKER' } } as const satisfies BattleEffect
const ZHOU_CONFUSION_IMMUNITY = { kind: 'CONTROL_IMMUNITY', statuses: ['CONFUSION'] } as const satisfies BattleEffect
const HAMA_CHARGE = { charges: 3, powerMultiplier: 2, rule: { status: 'KNOCKBACK', rounds: 1 } } as const
const JIUGONG_PLAN = { kind: 'COMPANION_TURN_STATUS', companionId: 'yinggu', moveName: '九宫推演', every: 3,
  rule: { status: 'HIT_DOWN', percent: 100, rounds: 1 } } as const satisfies BattleEffect

export const COMPANIONS: Record<string, CompanionConfig> = {
  kezhene: {
    id: 'kezhene',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '每战替主角代承一次致命单体伤害。掷出毒菱，使攻击者命中降低 25 个百分点并中毒 2 回合。',
    battleSupport: [{ kind: 'LEADER_COVER', trigger: 'LETHAL', percent: 100,
      status: { status: 'HIT_DOWN', percent: 25, rounds: 1 }, poison: { status: 'dartPoison', rounds: 2, attackPercent: 10 } }],
    baseHp: 2800,
    baseAtk: 310,
  },
  meichaofeng: {
    id: 'meichaofeng',
    alignment: 'HERETIC',
    female: true,
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
    assistDesc: '趁你打中对手，跟上补一记白骨爪。',
    battleAttack: { skillId: 'jiuyin_baiguzhua', stance: 'FIERCE', target: 'FRONT', afterLeaderHit: true, everyRound: true },
    baseHp: 4200,
    baseAtk: 520,
  },
  guojing: {
    id: 'guojing',
    alignment: 'RIGHTEOUS',
    name: '郭靖',
    title: '憨厚少年',
    tier: 'purple',
    role: 'LEFT',
    route: 'STORY',
    portraitStyle: 'guojing',
    poem: '弯弓射雕大漠北，赤胆忠魂守襄阳。',
    favGift: '蒙古马奶酒',
    teachSkillId: 'xianglong_18',
    assistSkillName: '降龙初式',
    assistDesc: '每战首次代承主角盾后的致死单体伤害，郭靖存活时向本次攻击者回敬降龙掌。',
    battleAttack: { skillId: 'xianglong_18', stance: 'FIERCE', target: 'FRONT', requiresBond: 'she_diao_shuang_xiong' },
    battleSupport: [GUOJING_COVER],
    baseHp: 4800,
    baseAtk: 470,
    awakenTokens: 30,
    awakened: {
      tier: 'orange',
      title: '北侠·侠之大者',
      assistSkillName: '双龙取水',
      assistDesc: '追击主角本次命中的存活目标。代承主角的盾后致死单体伤害，存活时向攻击者回敬降龙掌。',
      battleAttack: { skillId: 'xianglong_18', stance: 'FIERCE', target: 'FRONT', afterLeaderHit: true, everyRound: true },
      battleSupport: [{ ...GUOJING_COVER, repeat: true }],
      baseHp: 7500,
      baseAtk: 680,
    },
  },
  huangrong: {
    id: 'huangrong',
    alignment: 'RIGHTEOUS',
    female: true,
    name: '黄蓉',
    title: '小乞儿·黄蓉',
    tier: 'purple',
    role: 'RIGHT',
    route: 'STORY',
    portraitStyle: 'huangrong',
    poem: '白衣金带摇竹杖，巧笑嫣然破千军。',
    favGift: '八宝肥鸭',
    teachSkillId: 'dagou_bangfa',
    assistSkillName: '绊字诀',
    assistDesc: '开局布下奇门五转阵，存活队友本回合闪避率提高 20 个百分点。每两回合以竹杖封敌方主力穴道 1 回合。',
    battleSupport: [{ kind: 'OPENING_TEAM_DODGE', points: 20 },
      { kind: 'ROUND_ENEMY_STATUS', leaderOnly: true, every: 2, rule: { status: 'SEAL', rounds: 1 } }],
    baseHp: 3900,
    baseAtk: 430,
    awakenTokens: 30,
    awakened: {
      tier: 'orange',
      title: '桃花仙子·丐帮女侠',
      assistSkillName: '打狗绊字诀',
      assistDesc: '偶数回合用打狗棒替主角代承 52% 盾后单体伤害。',
      battleSupport: [{ kind: 'LEADER_COVER', trigger: 'GUARD', percent: 52 }],
      baseHp: 5200,
      baseAtk: 560,
    },
  },
  hongqigong: {
    id: 'hongqigong',
    alignment: 'RIGHTEOUS',
    name: '洪七公',
    recruitFlag: 'hong_feast_done',
    title: '北丐·九指神丐',
    tier: 'orange',
    grade: '下',
    role: 'LEFT',
    route: 'AFFINITY',
    portraitStyle: 'hongqigong',
    poem: '朱红酒葫绿玉杖，神龙摆尾傲苍穹。',
    favGift: '荷叶叫花鸡',
    teachSkillId: 'kanglong_youhui',
    assistSkillName: '神龙摆尾·初',
    assistDesc: '每回合以刚猛掌力协战，命中使存活敌人下回合防御降低 20%，并有 35% 概率追击。在场时全队外功伤害提高 10%，南帝北丐生效时提高 20%。',
    battleAttack: { skillId: 'xianglong_18', stance: 'FIERCE', target: 'FRONT', powerRatio: 1.4, everyRound: true,
      hitStatus: { status: 'DEFENSE_DOWN', percent: 20, rounds: 1, nextRound: true }, hitStatusArea: true },
    battleSupport: [{ kind: 'TEAM_OUTER_DAMAGE', percent: 10 }, { kind: 'OUTER_FOLLOW_UP', chancePercent: 35 }],
    baseHp: 7600,
    baseAtk: 740,
    awakenTokens: 60,
    awakened: {
      tier: 'red',
      title: '北丐·九指神丐',
      assistSkillName: '神龙摆尾',
      assistDesc: '用降龙掌追击主角本次命中的存活目标。',
      battleAttack: { skillId: 'xianglong_18', stance: 'FIERCE', target: 'FRONT', afterLeaderHit: true, everyRound: true },
      baseHp: 9600,
      baseAtk: 920,
    },
  },
  huangyaoshi: {
    id: 'huangyaoshi',
    name: '黄药师',
    title: '东邪·桃花岛主',
    tier: 'orange',
    grade: '下',
    role: 'RIGHT',
    route: 'AFFINITY',
    portraitStyle: 'huangyaoshi',
    poem: '桃花影落飞神剑，碧海潮生按玉箫。',
    favGift: '广陵散古谱',
    teachSkillId: 'bihai_chaosheng',
    assistSkillName: '弹指神通·初',
    assistDesc: '弹指攻击气血比例最低的敌人，目标气血低于三成时本招威力提高 50%。命中后使存活敌人下回合速度降低 20%。',
    battleAttack: { stance: 'AGILE', target: 'LOWEST_HP', form: 'FINGER', powerRatio: 1.28, everyRound: true,
      finisher: { belowHpPercent: 30, damagePercent: 50 }, hitStatus: { status: 'SLOW', percent: 20, rounds: 1 }, hitStatusArea: true },
    baseHp: 6400,
    baseAtk: 720,
    awakenTokens: 60,
    awakened: {
      tier: 'red',
      title: '东邪·桃花岛主',
      assistSkillName: '弹指神通',
      assistDesc: '偶数回合弹指打偏来招，替主角代承 52% 盾后单体伤害。',
      battleSupport: [{ kind: 'LEADER_COVER', trigger: 'GUARD', percent: 52 }],
      baseHp: 7800,
      baseAtk: 890,
    },
  },
  zhoubotong: {
    id: 'zhoubotong',
    name: '周伯通',
    title: '老顽童',
    tier: 'orange',
    grade: '下',
    role: 'EITHER',
    route: 'AFFINITY',
    portraitStyle: 'zhoubotong',
    poem: '左手画方右画圆，清音洞里乐忘年。',
    favGift: '大将军促织(蟋蟀)',
    teachSkillId: 'kongming_quan',
    assistSkillName: '双手互搏·初',
    assistDesc: '以双手互搏协战，每次施展有 25% 概率再打一拳。自身免疫心神混乱。',
    battleAttack: { skillId: 'shuangshou_hubo', stance: 'TAICHI', target: 'FRONT' },
    battleSupport: [ZHOU_CONFUSION_IMMUNITY],
    baseHp: 7200,
    baseAtk: 700,
    awakenTokens: 60,
    awakened: {
      tier: 'red',
      title: '老顽童',
      assistSkillName: '双手互搏连击',
      assistDesc: '主角命中存活目标后，跟进两次双手互搏。自身免疫心神混乱。',
      battleAttack: { skillId: 'shuangshou_hubo', stance: 'TAICHI', target: 'FRONT', afterLeaderHit: true, everyRound: true },
      battleSupport: [ZHOU_CONFUSION_IMMUNITY, { kind: 'OUTER_FOLLOW_UP', chancePercent: 100, trigger: 'OUTER_CAST' }],
      baseHp: 8900,
      baseAtk: 860,
    },
  },
  munianci: {
    id: 'munianci',
    alignment: 'RIGHTEOUS',
    female: true,
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
    assistDesc: '替主角分摊 30% 盾后单体伤害，并反击敌方前排。',
    battleSupport: [{ kind: 'LEADER_COVER', trigger: 'HIT', percent: 30,
      counter: { skillId: 'xiaoyaoyou_quan', stance: 'AGILE', target: 'FRONT' } }],
    baseHp: 4600,
    baseAtk: 480,
  },
  ouyangfeng: {
    id: 'ouyangfeng',
    alignment: 'HERETIC',
    name: '欧阳锋',
    title: '西毒·白驼山主',
    tier: 'orange',
    grade: '下',
    role: 'LEFT',
    route: 'AFFINITY',
    portraitStyle: 'ouyangfeng',
    meetHint: '救下欧阳克（折扇支线）结交，或击败「5-3 华山绝巅」后重逢',
    poem: '灵蛇出洞风云变，一式蛤蟆震八荒。',
    favGift: '西域蛇胆酒',
    teachSkillId: 'hama_gong',
    assistSkillName: '蛤蟆劲·初',
    assistDesc: '每次常规协战积蓄一层蛤蟆劲，蓄满三层后下一次常规出手威力翻倍，命中时击退。',
    battleAttack: { stance: 'FIERCE', target: 'FRONT', powerRatio: 1.28, everyRound: true, burst: HAMA_CHARGE },
    baseHp: 7600,
    baseAtk: 730,
    awakenTokens: 60,
    awakened: {
      tier: 'red',
      title: '西毒·白驼山主',
      assistSkillName: '蛤蟆劲',
      assistDesc: '常规协战积蓄三层蛤蟆劲后，下一击威力翻倍并击退目标。命中附带两回合灵蛇剧毒。',
      battleAttack: { stance: 'FIERCE', target: 'FRONT', powerRatio: 1.28, everyRound: true, burst: HAMA_CHARGE,
        poison: { status: 'staffVenom', rounds: 2, maxStacks: 3, attackPercent: 12 } },
      baseHp: 9200,
      baseAtk: 900,
    },
  },
  // ───────── 第一批扩充：五绝补全 / 全真 / 大漠 / 杨家 / 桃花等（第12册 §三） ─────────
  yideng: {
    id: 'yideng',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '回合末为存活队友回复其最大气血的 4%。每三回合以一阳指封住敌方主力穴道 1 回合。',
    battleSupport: [
      { kind: 'HEAL', trigger: 'ROUND_END', target: 'ALLIES', unit: 'MAX_HP_PERCENT', amount: 4 },
      { kind: 'ROUND_ENEMY_STATUS', leaderOnly: true, every: 3, rule: { status: 'SEAL', rounds: 1 } },
    ],
    baseHp: 8400,
    baseAtk: 820,
  },
  wangchongyang: {
    id: 'wangchongyang',
    alignment: 'RIGHTEOUS',
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
    battleSupport: [{ kind: 'LEADER_COVER', trigger: 'LETHAL', percent: 100, cleanseTeam: true }],
    baseHp: 10200,
    baseAtk: 980,
  },
  qiuchuji: {
    id: 'qiuchuji',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '长春剑阵对邪派伤害增加 20%。每战替主角代承一次盾后伤害达到主角气血上限 30% 的单体重击。',
    battleAttack: { skillId: 'quanzhen_jianfa', stance: 'TAICHI', target: 'FRONT' },
    battleSupport: [{ kind: 'LEADER_COVER', trigger: 'HEAVY', percent: 100 },
      { kind: 'TARGET_TRAIT_DAMAGE', traits: ['HERETIC'], percent: 20 }],
    baseHp: 7000,
    baseAtk: 650,
  },
  qiuqianren: {
    id: 'qiuqianren',
    alignment: 'HERETIC',
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
    assistDesc: `铁掌攻向前排，命中使目标疗伤效果降低 ${IRON_PALM_WOUND.percent}%，持续 ${IRON_PALM_WOUND.rounds} 回合。`,
    battleAttack: { skillId: 'tiezhang_gong', stance: 'FIERCE', target: 'FRONT' },
    baseHp: 7400,
    baseAtk: 700,
  },
  yangkang: {
    id: 'yangkang',
    alignment: 'HERETIC',
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
    assistDesc: '首次协战先出全真剑，再用九阴白骨爪攻击气血比例最低的存活目标。',
    battleAttack: { skillId: 'jiuyin_baiguzhua', stance: 'AGILE', target: 'LOWEST_HP', openingSkillId: 'quanzhen_jianfa' },
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
    battleAttack: { skillId: 'lianzhu_shenjian', stance: 'AGILE', target: 'REAR', everyRound: true, followUpShots: 1 },
    baseHp: 6800,
    baseAtk: 680,
  },
  lingzhi: {
    id: 'lingzhi',
    alignment: 'HERETIC',
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
    assistDesc: `重掌震散护体罡气，命中使目标下回合防御降低 ${DASHOUYIN_BREAK.rule.percent}%。`,
    battleAttack: { skillId: 'dashouyin', stance: 'FIERCE', target: 'FRONT' },
    baseHp: 6400,
    baseAtk: 620,
  },
  yinggu: {
    id: 'yinggu',
    female: true,
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
    assistDesc: '每三回合以九宫推演使敌方本回合最强一击落空。一生痴缠生效时改为每两回合。',
    battleSupport: [JIUGONG_PLAN],
    baseHp: 5400,
    baseAtk: 560,
  },
  mayu: {
    id: 'mayu',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '回合末回复主角 3% 最大气血。每战为主角化解一次封穴。',
    battleSupport: [
      { kind: 'HEAL', trigger: 'ROUND_END', target: 'LEADER', unit: 'MAX_HP_PERCENT', amount: 3 },
      { kind: 'FIRST_LEADER_CLEANSE', status: 'SEAL' },
    ],
    baseHp: 4800,
    baseAtk: 430,
  },
  tanchuduan: {
    id: 'tanchuduan',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '以全真剑法协战，替主角分摊 20% 盾后单体伤害。',
    battleAttack: { skillId: 'quanzhen_jianfa', stance: 'TAICHI', target: 'FRONT' },
    battleSupport: [{ kind: 'LEADER_COVER', trigger: 'HIT', percent: 20 }],
    baseHp: 4900,
    baseAtk: 470,
  },
  wangchuyi: {
    id: 'wangchuyi',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '横扫敌方前排。命中尚未出手的目标时，使其跳过本回合行动。',
    battleAttack: { stance: 'AGILE', target: 'FRONT', hitStatus: { status: 'KNOCKBACK', rounds: 1 } },
    baseHp: 4700,
    baseAtk: 450,
  },
  liuchuxuan: {
    id: 'liuchuxuan',
    alignment: 'RIGHTEOUS',
    name: '刘处玄',
    title: '长生子·全真七子',
    tier: 'purple',
    role: 'LEFT',
    route: 'TRIAL',
    portraitStyle: 'daoist',
    meetHint: '战胜历练第 28 关「全真七子天罡北斗」后入队',
    poem: '静听松声，长生自在。',
    favGift: '终南松子',
    teachSkillId: 'quanzhen_jianfa',
    assistSkillName: '长生剑',
    assistDesc: '以全真剑法协战，命中使目标下回合护体防御降低 15%。',
    battleAttack: { skillId: 'quanzhen_jianfa', stance: 'TAICHI', target: 'FRONT',
      hitStatus: { status: 'DEFENSE_DOWN', percent: 15, rounds: 1, nextRound: true } },
    baseHp: 4650,
    baseAtk: 440,
  },
  haodatong: {
    id: 'haodatong',
    alignment: 'RIGHTEOUS',
    name: '郝大通',
    title: '广宁子·全真七子',
    tier: 'purple',
    role: 'RIGHT',
    route: 'TRIAL',
    portraitStyle: 'daoist',
    meetHint: '战胜历练第 28 关「全真七子天罡北斗」后入队',
    poem: '一剑平川，心如止水。',
    favGift: '山野蜂蜜',
    teachSkillId: 'jinyan_gong',
    assistSkillName: '广宁剑',
    assistDesc: '每回合以全真剑法协战，命中使目标下回合攻击降低 12%。',
    battleAttack: { skillId: 'quanzhen_jianfa', stance: 'TAICHI', target: 'FRONT', everyRound: true,
      hitStatus: { status: 'ATTACK_DOWN', percent: 12, rounds: 1, nextRound: true } },
    baseHp: 4750,
    baseAtk: 430,
  },
  sunbuer: {
    id: 'sunbuer',
    alignment: 'RIGHTEOUS',
    female: true,
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
    assistDesc: '以清静剑封住敌方腕脉，命中后使目标下回合暴击率降低 20 个百分点。',
    battleAttack: { skillId: 'quanzhen_jianfa', stance: 'AGILE', target: 'FRONT', everyRound: true,
      hitStatus: { status: 'CRIT_DOWN', percent: 20, rounds: 1, nextRound: true } },
    baseHp: 4400,
    baseAtk: 500,
  },
  ouyangke: {
    id: 'ouyangke',
    alignment: 'HERETIC',
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
    battleAttack: { powerRatio: 0.65, stance: 'AGILE', target: 'LOWEST_HP', everyRound: true,
      poison: { status: 'needlePoison', attackPercent: 10, maxStacks: 3, rounds: 2 } },
    baseHp: 4200,
    baseAtk: 480,
  },
  yangtiexin: {
    id: 'yangtiexin',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '以回马枪穿透目标 20% 护体防御。与穆念慈同队时互相庇护。',
    battleAttack: { skillId: 'yangjia_qiang', stance: 'FIERCE', target: 'FRONT' },
    baseHp: 4900,
    baseAtk: 500,
  },
  luchengfeng: {
    id: 'luchengfeng',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '落英掌命中使敌方下回合命中降低 15 个百分点，替主角分摊 20% 盾后单体伤害。',
    battleAttack: { skillId: 'luoying_zhang', stance: 'AGILE', target: 'FRONT' },
    battleSupport: [{ kind: 'LEADER_COVER', trigger: 'HIT', percent: 20 }],
    baseHp: 4600,
    baseAtk: 460,
  },
  zhuziliu: {
    id: 'zhuziliu',
    alignment: 'RIGHTEOUS',
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
    assistDesc: '以笔点穴，命中后使目标下一回合出手速度降低 20%。',
    battleAttack: { stance: 'AGILE', target: 'FRONT', everyRound: true, hitStatus: { status: 'SLOW', rounds: 1, percent: 20 } },
    baseHp: 4300,
    baseAtk: 440,
  },
}

/** 伙伴运行时形态（存档里只存 form / grade，其余由配置推导） */
export interface CompanionStateLike {
  form?: 'base' | 'awakened'
  grade?: CompanionGrade | null
}

/** 战斗与界面实际使用的伙伴视图：已套用形态与资质系数 */
export interface CompanionView {
  id: string
  name: string
  title: string
  tier: TierColor
  grade: CompanionGrade | null
  form: 'base' | 'awakened'
  portraitStyle: PortraitStyle
  assistSkillName: string
  assistDesc: string
  battleSupport?: readonly BattleEffect[]
  battleAttack?: CompanionForm['battleAttack']
  baseHp: number
  baseAtk: number
  stats: SixStats
}

export function companionView(cfg: CompanionConfig, st?: CompanionStateLike): CompanionView {
  const awakened = st?.form === 'awakened' && !!cfg.awakened
  const f: CompanionForm = awakened ? cfg.awakened! : cfg
  const grade = awakened ? null : f.tier === 'orange' ? (st?.grade ?? cfg.grade ?? '中') : null
  const mult = grade ? GRADE_MULT[grade] : 1
  const baseHp = Math.round(f.baseHp * mult)
  const baseAtk = Math.round(f.baseAtk * mult)
  const str = Math.max(8, Math.round(baseAtk / 27))
  const con = Math.max(12, Math.round(baseHp / 225))
  return {
    id: cfg.id,
    name: cfg.name,
    title: f.title,
    tier: f.tier,
    grade,
    form: awakened ? 'awakened' : 'base',
    portraitStyle: cfg.portraitStyle,
    assistSkillName: f.assistSkillName,
    assistDesc: f.assistDesc,
    battleSupport: f.battleSupport,
    battleAttack: f.battleAttack,
    baseHp,
    baseAtk,
    stats: {
      str, con,
      agi: Math.round((cfg.role === 'RIGHT' ? 18 : cfg.role === 'LEFT' ? 12 : 15) + str * 0.4),
      intStat: Math.round((cfg.role === 'LEFT' ? 12 : 18) + con * 0.35),
      luck: 10,
      karma: cfg.alignment === 'RIGHTEOUS' ? 1 : cfg.alignment === 'HERETIC' ? -1 : 0,
    },
  }
}

interface TrioSynergyConfig {
  id: string
  name: string
  leftId: string
  rightId: string
  bonusText: string
  battleEffects?: readonly BattleEffect[]
}

const NAN_BEI_HEAL = {
  kind: 'HEAL', trigger: 'ROUND_END', target: 'ALLIES', unit: 'MAX_HP_PERCENT', amount: 6,
} as const satisfies BattleEffect
const NAN_BEI_OUTER_DAMAGE = { kind: 'OUTER_DAMAGE', percent: 20 } as const satisfies BattleEffect
const SHEDIAO_COMBO = { kind: 'ROUND_OUTER_COMBO', chancePercent: 35 } as const satisfies BattleEffect
const CHONGYANG_SAVE = { kind: 'FIRST_LETHAL_SAVE', heal: { percent: 30, restoreToPercent: true } } as const satisfies BattleEffect
const DONGXI_BURST = {
  kind: 'DUAL_STATUS_BURST', stacks: 3, rounds: 3, tickAtkPercent: 5, burstHpPercent: 25, bossAtkMultiplier: 3,
} as const satisfies BattleEffect

/** 1主+2副 经典三人行羁绊共鸣 */
export const TRIO_SYNERGIES: TrioSynergyConfig[] = [
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
  {
    id: 'dong_xi',
    name: '东邪西毒',
    leftId: 'ouyangfeng',
    rightId: 'huangyaoshi',
    bonusText: `回合末为同一敌人叠加碧海内伤和灵蛇奇毒，各持续 ${DONGXI_BURST.rounds} 回合，每层每回合造成主角攻击力 ${DONGXI_BURST.tickAtkPercent}% 的伤害。两种状态均达 ${DONGXI_BURST.stacks} 层时消耗并引爆，造成目标最大气血 ${DONGXI_BURST.burstHpPercent}% 的真伤，对首领最多造成主角攻击力的 ${DONGXI_BURST.bossAtkMultiplier} 倍伤害。`,
    battleEffects: [DONGXI_BURST],
  },
  {
    id: 'she_diao_san_jue',
    name: '射雕三绝',
    leftId: 'hongqigong',
    rightId: 'zhoubotong',
    bonusText: `每回合我方常规行动后，有 ${SHEDIAO_COMBO.chancePercent}% 概率触发猜拳连击。本回合已施展外功或完成追击的存活队友各额外出手一次，免耗且不额外积攒怒气。`,
    battleEffects: [SHEDIAO_COMBO],
  },
  {
    id: 'chong_yang_yi_ze',
    name: '重阳遗泽',
    leftId: 'wangchongyang',
    rightId: 'mayu',
    bonusText: `每场战斗为全队挡下一次可防止的致死伤害，受击者保留 1 点气血并回复至最大气血的 ${CHONGYANG_SAVE.heal.percent}%。`,
    battleEffects: [CHONGYANG_SAVE],
  },
  {
    id: 'fu_nv_tong_xin',
    name: '父女同心',
    leftId: 'munianci',
    rightId: 'yangtiexin',
    bonusText: '杨家枪与柳叶刀并肩。每场战斗，两人中首次护盾后仍会致死的伤害由另一位存活伙伴代承。',
    battleEffects: [{ kind: 'COMPANION_LETHAL_INTERCEPT' }],
  },
  {
    id: 'nan_bei',
    name: '南帝北丐',
    leftId: 'hongqigong',
    rightId: 'yideng',
    bonusText: `五绝之二同阵。回合末为存活队友回复最大气血的 ${NAN_BEI_HEAL.amount}%，全队外功伤害 +${NAN_BEI_OUTER_DAMAGE.percent}%。`,
    battleEffects: [NAN_BEI_HEAL, NAN_BEI_OUTER_DAMAGE],
  },
  {
    id: 'yi_sheng_chi_chan',
    name: '一生痴缠',
    leftId: 'zhoubotong',
    rightId: 'yinggu',
    bonusText: '老顽童与神算子半生纠葛。全队免疫心神混乱，瑛姑每逢偶数回合以九宫推演使当前敌方反扑落空。',
    battleEffects: [
      { kind: 'CONTROL_IMMUNITY', statuses: ['CONFUSION'] },
      { ...JIUGONG_PLAN, every: 2 },
    ],
  },
  {
    id: 'she_diao_shuang_xiong',
    name: '射雕双雄',
    leftId: 'guojing',
    rightId: 'zhebie',
    bonusText: '两人存活时，哲别每回合多射一箭。郭靖的降龙掌实际穿透防御时，哲别合击一箭。',
    battleEffects: [{ kind: 'COMPANION_ARCHERY', extraArrows: 1 }],
  },
  {
    id: 'wang_fu_shuang_bi',
    name: '王府双璧',
    leftId: 'yangkang',
    rightId: 'ouyangke',
    bonusText: '两人存活时，杨康的白骨爪对本次目标的每层毒伤增加 8 个百分点暴击率，仍以 75% 封顶。',
    battleEffects: [{ kind: 'COMPANION_POISON_CRIT', pointsPerStack: 8 }],
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
  tiers: CompanionSetTier[]
}

export const COMPANION_SETS: CompanionSetConfig[] = [
  {
    id: 'quanzhen_qizi',
    name: '全真七子',
    desc: '终南全真教七位真人。集齐北斗七星，可布「天罡北斗阵」。',
    memberIds: [...QUANZHEN_SEVEN_IDS],
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

export function totalCompanionSetBonuses(sets: readonly { tier: CompanionSetTier | null }[]) {
  const total = { hpPct: 0, atkPct: 0, idleQiPct: 0 }
  for (const { tier } of sets) {
    total.hpPct += tier?.hpPct ?? 0
    total.atkPct += tier?.atkPct ?? 0
    total.idleQiPct += tier?.idleQiPct ?? 0
  }
  return total
}

/** 拜师门槛判定所需的上下文：六维 + 持有信物 + 剧情标记 */
export interface SectCheckCtx {
  hasBagua: boolean
  flags: string[]
}

export interface SectPromotionExam {
  title: string
  objective?: BattleObjective
  opponent: BattleOpponent
  nextOpponents?: readonly BattleOpponent[]
  intro?: string
  hint?: string
  mapId?: string
  completionFlag?: string
  guestCompanionId?: string
  formation?: { leftCompanionId: string; rightCompanionId: string; reserves: readonly BattleEscortAlly[] }
  requiredStance?: StanceType
  requiresTwoCompanions?: true
}

export interface SectConfig {
  id: string
  name: string
  alignment: CombatAlignment
  chiefPlayerName: string // 当前本服真实玩家【首席大弟子】
  chiefPower: number
  reqDesc: string
  checkReq: (stats: { str: number; con: number; agi: number; intStat: number; karma: number }, ctx: SectCheckCtx) => { ok: boolean; reason?: string }
  perkDesc: string
  ranks: string[]
  /** 按阶位授武，下标 = 阶位 - 1，第 1 阶在拜师时传授 */
  signatureSkills: readonly (readonly string[])[]
  /** 晋升到指定阶位时额外赠予的装备（阶位 → 装备ID） */
  signatureItems?: Record<number, string>
  /** 指定晋升目标阶位的专属考核 */
  promotionExams?: Partial<Record<number, SectPromotionExam>>
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
    reqDesc: '侠义至少 0 点；持丐帮引荐信入门可多得 150 点贡献',
    checkReq: (s) => (s.karma >= 0 ? { ok: true } : { ok: false, reason: '侠义至少要有 0 点，才能拜入丐帮。' }),
    perkDesc: '拜师可学混天气功。通过晋升考核，还能学打狗棒法和降龙十八掌。',
    ranks: ['一袋弟子', '三袋弟子', '六袋精锐', '九袋护法长老', '神丐衣钵传人'],
    signatureSkills: [['huntian_qigong'], ['fengmo_zhang'], ['xiaoyao_you'], ['dagou_bangfa', 'xianglong_sanshi'], ['xianglong_18', 'tianxia_wugou']],
    signatureItems: { 4: 'jiudai_baina', 5: 'dagou_stick_true' },
    promotionExams: {
      2: {
        title: '捉拿采花贼',
        objective: { kind: 'DEFEAT', rounds: 3 },
        opponent: {
          name: '采花贼', title: '嘉兴城外逃犯', portrait: 'bandit', hp: 4300, atk: 310, mp: 1800, stance: 'AGILE',
          combat: { creature: 'BANDIT', alignment: 'HERETIC', karma: -25, speed: 120, weapon: { form: 'BLADE', tier: 'green' } },
        },
      },
      3: GAIBANG_DIVISION,
      4: JUNSHAN_EXAM,
      5: GAIBANG_FINAL_EXAM,
    },
    introFlag: 'gaibang_letter',
    introBonus: 150,
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
    signatureSkills: [['quanzhen_tuna'], ['jinyan_gong'], ['tonggui_jian'], [], ['xiantian_gong']],
    promotionExams: { 5: QUANZHEN_GUARD_EXAM },
  },
  {
    id: 'taohua',
    name: '东海桃花岛',
    alignment: 'NEUTRAL',
    chiefPlayerName: '桃花首座·陆乘云',
    chiefPower: 162400,
    reqDesc: '悟性至少 28 点，身法至少 24 点，持曲三铁八卦或桃花岛信物',
    checkReq: (s, ctx) =>
      s.intStat >= 28 && s.agi >= 24 && (ctx.hasBagua || ctx.flags.includes('taohua_token'))
        ? { ok: true }
        : { ok: false, reason: '需悟性≥28、身法≥24 并持有【曲三铁八卦】或桃花岛信物方可破桃花阵登岛' },
    perkDesc: '拜入黄药师门下先学落英神剑掌，晋升后可学碧海潮生曲。',
    ranks: ['候补扫花童', '记名弟子', '入室师兄', '桃花岛真传', '东邪衣钵传人'],
    signatureSkills: [['luoying_zhang'], ['lanhua_fuxue'], ['luoying_zhang', 'yuxiao_jianfa', 'qimen_wuzhuan'], ['tanzhi_shentong', 'xuanfeng_saoye_tui'], ['bihai_chaosheng', 'jiuyin_taohua']],
    signatureItems: { 5: 'biyu_xiao' },
    promotionExams: {
      2: {
        title: '哑仆试剑',
        objective: { kind: 'DISARM', rounds: 10 },
        opponent: {
          name: '桃花岛哑仆', title: '持剑守阵', portrait: 'assassin', hp: 11000, atk: 270, mp: 1600, stance: 'TAICHI',
          combat: {
            alignment: 'NEUTRAL', def: 180, speed: 115, weapon: { form: 'BLADE', tier: 'blue' },
            strikeWeakness: { name: '以奇卸剑', matches: [{ stance: 'AGILE', skillIds: ['luoying_zhang'] }], status: { status: 'DISARM', rounds: 1 } },
          },
        },
        hint: '奇门架势用落英神剑掌命中可卸剑，也可用带缴械效果的武学或兵刃。',
      },
      3: TAOHUA_RESCUE_EXAM,
      4: {
        title: '冯氏墓前',
        objective: { kind: 'COMPOSURE', rounds: 8 },
        opponent: {
          name: '东邪·黄药师', title: '箫声考校', portrait: 'huangyaoshi', hp: 80000, atk: 900, mp: 8000, stance: 'TAICHI',
          combat: {
            alignment: 'NEUTRAL', def: 170, speed: 103, range: 'RANGED', weapon: { form: 'SOUND', tier: 'red' },
            statusPulse: {
              every: 3, lastRound: 6, name: '碧海潮生曲', rule: { status: 'CONFUSION', chancePercent: 40, rounds: 1 },
              shieldedByCompanion: HUANG_YAOSHI_COMBAT.statusPulse?.shieldedByCompanion,
            },
          },
        },
        hint: '黄药师在第 3、6 回合吹箫扰神。心法可以抵抗，周伯通在场时可用空明拳化解。',
      },
      5: TAOHUA_FINAL_EXAM,
    },
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
    signatureSkills: [['hama_gong'], ['lingshe_quan'], ['shunxi_qianli'], [], ['nizhuan_jiuyin', 'nijiuyin_hama_gong']],
    signatureItems: { 3: 'baituo_jinsi' },
    promotionExams: {
      5: {
        title: '逆转经脉',
        completionFlag: 'baituo_meridian_trial_done',
        intro: '欧阳锋命你试练逆九阴，在一旁守关。你独自运转内力，承受一轮强过一轮的逆行冲击。',
        hint: '逆行冲击每轮增强。护盾、回合末自愈和锁血复活可助你撑过考核。',
        objective: { kind: 'ENDURE_MERIDIANS', rounds: 5, minCon: 65, initialDamage: 900, damageStep: 200 },
        opponent: { name: '西毒·欧阳锋', title: '白驼山庄守关人', portrait: 'ouyangfeng', hp: 100000, atk: 0, mp: 7000, stance: 'FIERCE' },
      },
    },
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
    signatureSkills: [['kaishan_zhang', 'zhuanggu_jue'], ['fengmo_zhang'], ['yuenv_jian'], [], []],
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
    signatureSkills: [['tiezhang_gong'], ['shuishang_piao'], [], ['yinyang_mo'], []],
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
    signatureSkills: [['kurong_chan'], [], ['yiyang_zhi'], [], []],
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
  onlineReqCleared?: number
  onlineUnlockHint?: string
  guestTitleId?: string
  guestSectId?: string
}

export const LINAN_CITY_MAP = 'linan_city'

export const MAPS: MapZoneConfig[] = [
  {
    id: 'jiaxing_suburb',
    name: '嘉兴烟雨楼外',
    volumeLabel: '射雕·江南',
    safety: 'PEACE',
    baseQiPerHour: 1800,
    onlineCount: 58,
    ambientDesc: '南湖岸边可安心修行，也能找同路的侠客切磋。',
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
    onlineReqCleared: 7,
    onlineUnlockHint: '通关主线「3-1 松林长啸」后开启',
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
    onlineReqCleared: 8,
    onlineUnlockHint: '通关主线「3-2 归云庄主」后开启',
    guestTitleId: 'title_bihai',
  },
  {
    id: 'chongyang_hall',
    name: '终南山·祖师殿',
    volumeLabel: '射雕·终南',
    safety: 'PEACE',
    baseQiPerHour: 2900,
    onlineCount: 0,
    ambientDesc: '全真道童在殿前迎客。全真门人和终南逸士可入殿参拜。',
    unlockHint: '全真门人或佩有生效称号「终南逸士」可入内',
    onlineUnlockHint: '全真门人或佩有生效称号「终南逸士」可入内',
    guestTitleId: 'title_chongyang',
    guestSectId: 'quanzhen',
  },
  {
    id: LINAN_CITY_MAP,
    name: '临安·御街',
    volumeLabel: '射雕·江南',
    safety: 'PEACE',
    baseQiPerHour: 1800,
    onlineCount: 0,
    ambientDesc: '城门兵卒查验来往行人，街边便是客栈和茶楼。',
  },
  {
    id: 'linan_manor',
    name: '临安·官邸别院',
    volumeLabel: '射雕·江南',
    safety: 'PEACE',
    baseQiPerHour: 1800,
    onlineCount: 0,
    ambientDesc: '别院主人请桃花岛门人和逍遥狂生入内歇息。',
    unlockHint: '桃花岛门人或佩有生效称号「逍遥狂生」可入内',
    onlineUnlockHint: '桃花岛门人或佩有生效称号「逍遥狂生」可入内',
    guestTitleId: 'title_bihai',
    guestSectId: 'taohua',
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
    onlineReqCleared: 15,
    onlineUnlockHint: '通关主线「5-2 烟雨重逢」后开启',
  },
  {
    id: CHAPTER_ONE_STATUE_MAP,
    name: '襄阳·城中广场',
    volumeLabel: '射雕·襄阳',
    safety: 'PEACE',
    baseQiPerHour: 1800,
    onlineCount: 0,
    ambientDesc: '各路侠客可来城中广场瞻仰华山之巅的获胜者。',
  },
]

/** 地图是否已对当前主线进度开放 */
export function isMapUnlocked(map: MapZoneConfig, maxChapterId: number, online = false) {
  if (map.reqCleared === undefined) return true
  const threshold = online ? map.onlineReqCleared : map.reqCleared
  return threshold !== undefined && maxChapterId > threshold
}
export const ONLINE_MAPS = MAPS.filter((map) => map.reqCleared === undefined || map.onlineReqCleared !== undefined)


export function getChapterDrops(chapter: { dropItemIds?: string[]; dropSkillId?: string; dropSkillIds?: string[] }) {
  const items = (chapter.dropItemIds ?? []).map((id) => ITEMS[id]).filter(Boolean)
  const skillIds = chapter.dropSkillIds ?? (chapter.dropSkillId ? [chapter.dropSkillId] : [])
  const drops: { id: string; name: string; tier: TierColor; kind: 'item' | 'skill' }[] =
    items.map(({ id, name, tier }) => ({ id, name, tier, kind: 'item' }))
  for (const id of skillIds) {
    const skill = SKILLS[id]
    if (skill) drops.push({ id: skill.id, name: skill.name, tier: skill.tier, kind: 'skill' })
  }
  return drops
}

/** 后续资料片路线预览（对应第07册） */
/** 市井消费定价（store 与 UI 共用，避免两处硬编码不一致） */
export const INN_TEA_COST = 300
export const INN_GIFT_COST = 1200
export const INN_TEA_DAILY = 3
export const INN_GIFT_DAILY = 1
export const GHOST_APPRAISE_COST = 600

export const GHOST_MARKET_LISTINGS: readonly GhostMarketListingDTO[] = [
  { id: 'mk_1', maskedSeller: '蒙面客·甲戌', itemId: 'kongming_quan', itemName: '《空明拳》手抄拓本', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 6800, desc: '清音洞孤本拓印，至柔化刚拳谱。' },
  { id: 'mk_2', maskedSeller: '黑衣人·丙辰', itemId: 'wucan_baoyi', itemName: '大雪山乌蚕宝衣', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 8500, desc: '穿上能提高防御和气血上限。' },
  { id: 'mk_3', maskedSeller: '全真逆徒·匿名销赃', itemId: 'jiuwei_fox', itemName: '黑沼·九尾灵狐', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 9200, desc: '白狐伴你同行，提高气血上限和暴击率。' },
  { id: 'mk_4', maskedSeller: '鬼市压轴官拍', itemId: 'lingbo_weibu', itemName: '《凌波微步》琅嬛帛卷', tier: 'red', listingType: 'AUCTION', currency: 'GOLD', price: 320, highestBidderMasked: '蒙面客·癸亥', desc: '一门轻功，能让你更容易闪避。躲开攻击还能攒怒气。' },
  { id: 'mk_5', maskedSeller: '关外客商', itemId: 'snow_hood', itemName: ITEMS.snow_hood.name, tier: ITEMS.snow_hood.tier, listingType: 'FIXED', currency: 'SILVER', price: 8800, desc: ITEMS.snow_hood.desc },
  { id: 'mk_6', maskedSeller: '走镖人', itemId: 'deerskin_boots', itemName: ITEMS.deerskin_boots.name, tier: ITEMS.deerskin_boots.tier, listingType: 'FIXED', currency: 'SILVER', price: 4800, desc: ITEMS.deerskin_boots.desc },
]

export function marketListingPrice(preset: LoadoutPresetDTO, listing: GhostMarketListingDTO, player?: JianghuTitlePlayer) {
  if (listing.listingType !== 'FIXED' || listing.currency !== 'SILVER') return listing.price
  const belt = ITEMS[preset.beltId ?? '']
  const accessory = ITEMS[preset.accId ?? '']
  const titleDiscount = player ? activeJianghuTitle(player, preset)?.marketDiscount ?? 0 : 0
  const discount = Math.max(titleDiscount, belt?.slot === 'BELT' ? belt.marketDiscount ?? 0 : 0,
    accessory?.slot === 'ACC' ? accessory.marketDiscount ?? 0 : 0)
  return Math.round(listing.price * (100 - discount) / 100)
}

export function backpackCapacity(preset: Pick<LoadoutPresetDTO, 'beltId'>) {
  const belt = ITEMS[preset.beltId ?? '']
  return 24 + (belt?.slot === 'BELT' ? belt.backpackSlots ?? 0 : 0)
}

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
  battleEffects?: readonly BattleEffect[]
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
    effectDesc: '冲击大境界前可选用，本次突破成功率提高 35 个百分点。',
    narrative: '破障丹入腹，如纯阳烈火涤荡经络，生死玄关壁障应声而碎，天地之气汇聚丹田！',
    source: '章节守关首领掉落 / 全真纯阳宫大考 / 鬼市秘宝鉴赏',
    acupointEffect: { type: 'BREAKTHROUGH_RATE', bonusValue: 35 },
  },
  bingpo_huxin_dan: {
    id: 'bingpo_huxin_dan',
    name: '天山·冰魄护心丹',
    tier: 'purple',
    category: 'ACUPOINT_PILL',
    effectDesc: '冲关失败时自动消耗一枚，免除本次走火，下次突破保底提高 25 个百分点。',
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
    effectDesc: '分饮后永久气血上限 +15%，一般毒伤降低 20%，白驼蛇毒伤害降低 50%。',
    narrative: '温热蛇血滚滚入喉，腹内如烈火焚烧，全身筋脉贲张，百毒难侵之体初成！',
    source: '赵王府药房击杀宝蛇分饮',
  },
  jiuhua_yulu_wan: {
    id: 'jiuhua_yulu_wan',
    name: '桃花岛·九花玉露丸',
    tier: 'orange',
    category: 'BATTLE_PILL',
    battleEffects: [{ kind: 'FIRST_LETHAL_SAVE', heal: { percent: 40 }, cleanseInnerInjury: true }],
    effectDesc: '受到致死伤害时锁血至 1 点，回复 40% 最大气血并清除全部内伤。每战触发一次，扣除一丸。',
    narrative: '心脉欲裂之际急服九花玉露丸，幽香扑鼻，强提一口先天纯阳真气逆转死局！',
    source: '黄蓉好感度赠予 / 桃花岛药房秘制',
  },
  chunyang_jindan: {
    id: 'chunyang_jindan',
    name: '全真教·纯阳金丹',
    tier: 'purple',
    category: 'BATTLE_PILL',
    battleEffects: [{ kind: 'ROUND_START_PILL', round: 2, defensePercent: 30, rounds: 3 }],
    effectDesc: '第 2 回合初服用，清除在场存活队友的中毒与封穴，提高他们 30% 护体防御，持续 3 回合。',
    narrative: '纯阳金丹入腹，浩然正气流转全身，毛孔逼出黑紫浊血，万邪皆避！',
    source: '全真教三代精锐配给 / 纯阳殿大考奖励',
  },
  baituo_fushe_gao: {
    id: 'baituo_fushe_gao',
    name: '白驼山·蝮蛇见血膏',
    tier: 'purple',
    category: 'WEAPON_VENOM',
    battleEffects: [{
      kind: 'PERIODIC_ON_HIT', attack: 'OUTER', lastRound: 5,
      rule: { status: 'fusheVenom', rounds: 3, maxHpPercent: 3.5, maxHpDamageTotal: true, maxStacks: 3,
        defenseDownPercent: 25, defenseDownAtMaxStacks: true },
    }],
    effectDesc: '前 5 回合持兵刃的外功命中施加见血封喉，首次成功施毒扣除一盒。毒伤每回合扣目标最大气血 3.5%，刷新至 3 回合，叠满 3 层时降低护体防御 25%。',
    narrative: '剑锋淬毒幽蓝，白驼剧毒见血封喉，敌方面色青紫，气血止不住狂涌！',
    source: '白驼山庄暗器库 / 宝应松林缴获',
  },
  dahuan_dan: {
    id: 'dahuan_dan',
    name: '少林·大还丹',
    tier: 'orange',
    category: 'BATTLE_PILL',
    battleEffects: [{ kind: 'LOW_MP_PILL', belowMpPercent: 20, ultDamagePercent: 25 }],
    effectDesc: '行动开始时若内力低于 20%，瞬间回满内力，本回合绝技威力 +25%。每战触发一次，扣除一丸。',
    narrative: '大还丹入口即化，澎湃真气如长河决堤自气海奔涌而出，招式光华大盛！',
    source: '江南客栈高僧奇遇 / 论剑至尊宝匣',
  },
  tongling_huayu_san: {
    id: 'tongling_huayu_san',
    name: '黑沼·通灵化瘀散',
    tier: 'blue',
    category: 'BATTLE_PILL',
    battleEffects: [{ kind: 'CRIT_RECEIVE_PILL', healPercent: 18, outerReduction: 40 }],
    effectDesc: '每战一次，受到暴击且实扣气血后，若仍存活，回复 18% 最大气血。下一次命中的外功物伤在扣盾前降低 40%。',
    narrative: '扯开化瘀散拍在伤口，药力瞬间封住渗血裂口！',
    source: '百草丹房，以黑沼的幽潭蛇涎草炼制',
  },
}

export function equippedBattleMedicines(player: Pick<PlayerDTO, 'battleMedicines'>, loadout: LoadoutPresetDTO) {
  return [[loadout.battlePillId, 'BATTLE_PILL'], [loadout.weaponVenomId, 'WEAPON_VENOM']].flatMap(([id, category]) => {
    const medicine = id && MEDICINES[id]
    return medicine && medicine.category === category && (player.battleMedicines?.[medicine.id] ?? 0) > 0 ? [medicine] : []
  })
}

// --- 3. 暗器机括与副手奇门配置 ---
export type HiddenWeaponConfig = {
  id: string
  name: string
  tier: TierColor
  unlockStageId: number
  effectDesc: string
  castNarrative: string
  source: string
} & (
  | { triggerCondition: 'BATTLE_START'; attackPercent: number; status: BattleStatusRule }
  | { triggerCondition: 'ENEMY_ULT_READY'; attackPercent: number; rageLoss: number }
  | { triggerCondition: 'SELF_HP_LOW'; belowHpPercent: number; status: BattleStatusRule; bleed: PeriodicRule }
  | { triggerCondition: 'ROUND_THREE'; attackPercent: number }
)

export const HIDDEN_WEAPONS: Record<string, HiddenWeaponConfig> = {
  feitian_tieling: {
    id: 'feitian_tieling',
    name: '柯家·飞天淬毒黑菱',
    tier: 'purple',
    triggerCondition: 'BATTLE_START',
    unlockStageId: 4,
    attackPercent: 95,
    status: { status: 'HIT_DOWN', percent: 35, rounds: 2 },
    effectDesc: '开局先手造成攻击力 95% 的破甲伤害，使命中率降低 35 个百分点，持续 2 回合。',
    castNarrative: '未及交兵，你手腕一翻，三枚淬毒铁菱裹挟尖啸激射！毒雾弥散，激得敌方双目泪流！',
    source: '首胜历练第 04 关「盲侠柯镇恶」',
  },
  feihuang_shi: {
    id: 'feihuang_shi',
    name: '黄药师·弹指飞蝗玉石',
    tier: 'orange',
    triggerCondition: 'ENEMY_ULT_READY',
    unlockStageId: 21,
    attackPercent: 120,
    rageLoss: 40,
    effectDesc: '敌方即将以满怒施放绝技时，造成攻击力 120% 的真伤，并打散 40 点怒气。',
    castNarrative: '屈指一弹，一枚碧玉飞蝗石如流星贯日打中敌方右腕要穴，敌方气机一滞，蓄力大招硬生生被破！',
    source: '首胜历练第 21 关「东邪黄药师」',
  },
  dulong_yinzhen: {
    id: 'dulong_yinzhen',
    name: '彭连虎·毒龙透骨银针',
    tier: 'purple',
    triggerCondition: 'SELF_HP_LOW',
    unlockStageId: 11,
    belowHpPercent: 30,
    status: { status: 'MERIDIAN_BREAK', rounds: 1, nextRound: false },
    bleed: { status: 'needleBleed', rounds: 2, attackPercent: 30 },
    effectDesc: '自身气血低于 30% 时，在敌方行动前破脉并施加 2 回合流血，每回合扣攻击力的 30%。破脉令目标本回合跳过出手。',
    castNarrative: '生死一线间，肘后机括咔嗒轻响，三根毒龙细针电射直透敌方胸口大穴，令其气滞退后！',
    source: '首胜历练第 11 关「千手人屠彭连虎」',
  },
  yanwei_jian: {
    id: 'yanwei_jian',
    name: '郭靖·玄铁燕尾利箭',
    tier: 'orange',
    triggerCondition: 'ROUND_THREE',
    unlockStageId: 5,
    attackPercent: 220,
    effectDesc: '第 3 回合初先击碎目标全部护盾，再以攻击力 220% 威力打出必暴的破甲一箭。',
    castNarrative: '深吸一口气挽弓如满月，弦响如雷！玄铁利箭呼啸穿透敌方重铠护盾，带出一蓬血雨！',
    source: '首胜历练第 05 关「蒙古骑射手」',
  },
}

export function hiddenWeaponCapacity(loadout: Pick<LoadoutPresetDTO, 'beltId'>) {
  const belt = loadout.beltId ? ITEMS[loadout.beltId] : undefined
  return belt?.battleEffects?.find((effect) => effect.kind === 'HIDDEN_WEAPON_CAPACITY')?.slots ?? 1
}

export function unlockedHiddenWeapons(player: Pick<PlayerDTO, 'trial'>) {
  return Object.values(HIDDEN_WEAPONS).filter((weapon) => player.trial.rewardedStageIds.includes(weapon.unlockStageId))
}

// --- 4. 江湖绰号规则与称号光环 ---
export interface JianghuTitleConfig {
  id: string
  titleName: string
  tier: TierColor
  reqAlignment: 'RIGHTEOUS' | 'EVIL' | 'HERMIT'
  minReputation: number
  skills: readonly string[]
  outerForm?: AttackForm
  neverJoined?: true
  battleEffects: readonly BattleEffect[]
  idleQiBonus?: number
  marketDiscount?: number
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
    skills: ['xianglong_18', 'xianglong_sanshi', 'kanglong_youhui', 'feilong_zaitian'],
    outerForm: 'PALM',
    battleEffects: [
      { kind: 'TEAM_STATS', stats: { defPercent: 6 } },
      { kind: 'TARGET_TRAIT_DAMAGE', traits: ['HERETIC'], percent: 10, team: true },
    ],
    statBuffDesc: '全队外功防御 +6%，对邪派敌人伤害 +10%',
    greetingText: '哎哟！原来是威震大江南北的仁义狂客少侠！快快请进上席！',
  },
  {
    id: 'title_chongyang',
    titleName: '纯阳拂尘 · 终南逸士',
    tier: 'purple',
    reqAlignment: 'RIGHTEOUS',
    minReputation: 200,
    skills: ['quanzhen_tuna', 'quanzhen_jianfa', 'xiantian_gong', 'tonggui_jianfa'],
    idleQiBonus: 12,
    battleEffects: [{ kind: 'CONTROL_RESIST', chancePercent: 20, statuses: ['SEAL'] }],
    statBuffDesc: '离线打坐真气收益 +12%，封穴抗性 +20%',
    greetingText: '玄门正宗少侠光临，终南仙风拂面，失迎失迎！',
  },
  {
    id: 'title_youming',
    titleName: '幽冥裂骨 · 赤炼阎罗',
    tier: 'orange',
    reqAlignment: 'EVIL',
    minReputation: -300,
    skills: ['jiuyin_baiguzhua', 'lingshe_quan', 'tiezhang_pikan', 'tiezhang_gong'],
    marketDiscount: 20,
    battleEffects: [
      { kind: 'STAT_BONUS', stats: { crit: 6 } },
      { kind: 'ON_HIT_STATUS', attack: 'OUTER', rule: { status: 'HEAL_DOWN', rounds: 2, percent: 30 } },
      { kind: 'PERIODIC_ON_HIT', attack: 'OUTER', rule: { status: 'woundBleed', rounds: 2, attackPercent: 15 } },
    ],
    statBuffDesc: '暴击率 +6 个百分点。外功命中使目标减疗 30%，每回合流血扣攻击力的 15%，持续 2 回合。',
    greetingText: '阎罗少侠手下留情！黑市暗折已为尊驾备好，切莫妄动杀念！',
  },
  {
    id: 'title_wandu',
    titleName: '白驼万毒 · 噬魂蛇君',
    tier: 'orange',
    reqAlignment: 'EVIL',
    minReputation: -200,
    skills: ['hama_gong', 'nijiuyin_hama_gong', 'lingshe_quan'],
    battleEffects: [{ kind: 'LETHAL_POISON_REFLECT', percent: 15 }],
    statBuffDesc: '承受致死毒伤时，反震施毒者 15% 最大气血，每战一次。',
    greetingText: '蛇君驾临。庄主在毒窟等候多时了。',
  },
  {
    id: 'title_bihai',
    titleName: '碧海落梅 · 逍遥狂生',
    tier: 'purple',
    reqAlignment: 'HERMIT',
    minReputation: 0,
    skills: ['luoying_zhang', 'bihai_chaosheng'],
    battleEffects: [{ kind: 'STAT_BONUS', stats: { speed: 15, dodge: 4 } }],
    statBuffDesc: '出手速度 +15，闪避率 +4 个百分点。',
    greetingText: '落英缤纷客，不染世俗尘。狂生少侠请坐，且饮此盏寒梅酿！',
  },
  {
    id: 'title_tabo',
    titleName: '踏波行云 · 塞外浪子',
    tier: 'purple',
    reqAlignment: 'HERMIT',
    minReputation: 0,
    skills: ['huyan_qiang', 'duanhun_qiang', 'fumo_zhang', 'pan_guan_bi'],
    neverJoined: true,
    battleEffects: [{ kind: 'OUTER_COMBO_CHANCE', points: 5 }, { kind: 'KILL_SILVER_GAIN', percent: 20 }],
    statBuffDesc: '外功连击率 +5 个百分点。亲手击败敌人额外获得该敌基础纹银的 20%。',
    greetingText: '浪子少侠，周老前辈方才来寻，洪老帮主也给您留了一碗热茶。',
  },
]

type JianghuTitlePlayer = Pick<PlayerDTO, 'stats'> & Partial<Pick<PlayerDTO, 'currentSectId' | 'graduatedSectIds' | 'betrayedSectIds'>>

export function titleEligible(title: JianghuTitleConfig, player: JianghuTitlePlayer, loadout: LoadoutPresetDTO) {
  const karma = player.stats.karma
  const aligned = title.reqAlignment === 'HERMIT' ? Math.abs(karma) < 200
    : title.reqAlignment === 'EVIL' ? karma <= title.minReputation : karma >= title.minReputation
  if (!aligned) return false
  if (title.neverJoined && (player.currentSectId || player.graduatedSectIds?.length || player.betrayedSectIds?.length)) return false
  if (title.outerForm && SKILLS[loadout.outerSkillId ?? '']?.combatForm === title.outerForm) return true
  return [loadout.outerSkillId, loadout.innerSkillId, loadout.ultSkillId].some((id) => id && title.skills.includes(id))
}

export function activeJianghuTitle(player: JianghuTitlePlayer, loadout: LoadoutPresetDTO) {
  const title = JIANGHU_TITLES.find(({ id }) => id === loadout.titleId)
  return title && titleEligible(title, player, loadout) ? title : undefined
}

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
    desc: '突破大境界前可选用，本次突破成功率提高 35 个百分点。',
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
    desc: '冲关失败时自动护住心脉，免除本次走火，下次突破保底提高 25 个百分点。',
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
  recipe_tongling_huayu_san: {
    id: 'recipe_tongling_huayu_san',
    name: '《黑沼通灵化瘀散方》',
    targetMedicineId: 'tongling_huayu_san',
    tier: 'blue',
    category: 'BATTLE',
    costQi: 800,
    costSilver: 120,
    minInsight: 15,
    baseRate: 75,
    furnaceFlame: 'WEN',
    requiredHerbs: [
      { herbId: 'shexian_cao', count: 2 },
      { herbId: 'sanqi', count: 2 },
    ],
    desc: MEDICINES.tongling_huayu_san.effectDesc,
    flameHint: '文火焙干蛇涎草，与三七一同研成细粉。',
  },
}
