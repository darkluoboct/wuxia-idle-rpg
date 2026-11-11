/**
 * 第一卷《射雕篇》30 关历练与巡历配置。
 * 数据来源：docs/13、docs/14、docs/17；数值按 30 级尺度重算。
 */
import type { CombatUnitDTO, EquipSlotType, StanceType, TierColor } from './protocol.ts'

type PortraitStyle = CombatUnitDTO['portraitStyle']

export interface TrialPartConfig {
  slot: EquipSlotType
  name: string
  atkBonus?: number
  defBonus?: number
  hpBonus?: number
  critBonus?: number
  dodgeBonus?: number
  idleBonus?: number
  signatureEffect?: string
  /** 未进入二级面板的破甲、招架、内力、速度等属性 */
  extra?: string
}

export interface TrialSetConfig {
  id: string
  name: string
  tier: TierColor
  chapter: number
  bonuses: { two: string; four: string; six: string }
  parts: TrialPartConfig[]
}

export interface TrialStageConfig {
  id: number
  chapter: number
  code: string
  title: string
  recLevel: number
  boss: {
    name: string
    title: string
    portrait: PortraitStyle
    hp: number
    atk: number
    stance: StanceType
  }
  mechanicTip: string
  victory: 'DEFEAT_BOSS' | 'SURVIVE_ROUNDS'
  surviveRounds?: number
  setId: string
  /** 首胜必得的部位；章末关给两件 */
  firstClearParts: EquipSlotType[]
  /** 章末首领复战的招牌池，元素为 partId */
  replayPartIds?: [string, string]
  /** 该关达成后解锁的系统 */
  unlock?: 'INNER_LEFT' | 'RIGHT_ULT'
}

export function trialPartId(setId: string, slot: EquipSlotType) {
  return `${setId}_${slot.toLowerCase()}`
}

export function trialBossHp(level: number) {
  return Math.round(260 * Math.pow(1.17, level - 1))
}

export function trialBossAtk(level: number) {
  return Math.round(28 * Math.pow(1.14, level - 1))
}

const S = (slot: EquipSlotType, name: string, rest: Omit<TrialPartConfig, 'slot' | 'name'> = {}): TrialPartConfig =>
  ({ slot, name, ...rest })

export const TRIAL_SETS: TrialSetConfig[] = [
  {
    id: 'pomiao_caomang', name: '破庙蓑衣草莽套装', tier: 'green', chapter: 1,
    bonuses: {
      two: '气血上限 +120',
      four: '受到野兽与草寇类普通攻击时，固定减免 8 点伤害',
      six: '【风雨夜行】雨天或黑夜时，自身行动速度提升 8%',
    },
    parts: [
      S('WEAPON', '草莽劈柴刀', { atkBonus: 22, extra: '命中率 +2%' }),
      S('HEAD', '破旧斗笠', { hpBonus: 80, extra: '反隐蔽 +5' }),
      S('ARMOR', '蓑草风雨衣', { defBonus: 18, hpBonus: 110 }),
      S('WRIST', '粗麻布护腕', { defBonus: 8, critBonus: 1 }),
      S('BELT', '草编麻绳带', { hpBonus: 60, extra: '行动速度 +3' }),
      S('BOOTS', '生茧草鞋', { dodgeBonus: 1.5, extra: '身法速度 +12' }),
      S('ACC', '古铜生锈钱', { extra: '福缘 +3，历练铜钱 +5%' }),
    ],
  },
  {
    id: 'zuixian_xingshang', name: '醉仙短打行商套装', tier: 'green', chapter: 1,
    bonuses: {
      two: '命中率 +3%',
      four: '外功招式造成的流血效果持续回合数 +1',
      six: '【市井油滑】闪避后立刻反击，造成自身攻击力 40% 的穿刺伤害',
    },
    parts: [
      S('WEAPON', '酒肆镔铁刺', { atkBonus: 32, extra: '破甲 +5' }),
      S('HEAD', '行商布头巾', { hpBonus: 120, extra: '内力上限 +30' }),
      S('ARMOR', '青色短打马褂', { defBonus: 25, hpBonus: 160 }),
      S('WRIST', '熟皮缠手', { atkBonus: 10, extra: '招架率 +2%' }),
      S('BELT', '粗皮褡裢', { hpBonus: 90, extra: '背包负重提升' }),
      S('BOOTS', '快步布底靴', { dodgeBonus: 2, extra: '身法速度 +16' }),
      S('ACC', '雕花小酒葫芦', { signatureEffect: '每回合行动结束恢复 15 点气血' }),
    ],
  },
  {
    id: 'fahua_zuyi', name: '法华行脚缁衣套装', tier: 'green', chapter: 1,
    bonuses: {
      two: '护体防御 +30',
      four: '招架成功时，将所受伤害的 20% 反震给攻击者',
      six: '【禅心坚毅】气血低于 30% 时，获得最大气血 15% 的护体金光（2 回合）',
    },
    parts: [
      S('WEAPON', '行脚枣木棍', { atkBonus: 42, extra: '招架率 +5%' }),
      S('HEAD', '灰布僧帽', { defBonus: 15, extra: '内力上限 +50' }),
      S('ARMOR', '百衲缁衣', { defBonus: 36, hpBonus: 220 }),
      S('WRIST', '檀木念珠手串', { extra: '内力 +40，内力压制伤害 -10%' }),
      S('BELT', '粗布罗汉带', { hpBonus: 140, extra: '格挡吸伤 +4%' }),
      S('BOOTS', '绑腿僧鞋', { extra: '身法 +18，行动条推进 +3%' }),
      S('ACC', '清心菩提子', { signatureEffect: '受到眩晕或点穴时，抗性概率 +15%' }),
    ],
  },
  {
    id: 'jiangnan_qiguai', name: '江南七怪降魔套装', tier: 'blue', chapter: 1,
    bonuses: {
      two: '外功攻击 +45，臂力 +4',
      four: '对【刚猛】姿态敌人造成的伤害提升 12%',
      six: '【义薄云天】伙伴合击伤害 +25%；主角受致命伤时获得 1 回合不死意志',
    },
    parts: [
      S('WEAPON', '沉铁熟铜杖', { atkBonus: 65, extra: '破甲 +15，刚猛增伤 +8%' }),
      S('HEAD', '蝙蝠乌纱笠', { hpBonus: 260, extra: '反潜伏与命中 +6%' }),
      S('ARMOR', '七怪麻皮护甲', { defBonus: 52, hpBonus: 380 }),
      S('WRIST', '沉铁护臂', { atkBonus: 18, extra: '招架率 +4%' }),
      S('BELT', '嵌铁重皮带', { hpBonus: 200, extra: '臂力 +3' }),
      S('BOOTS', '蹑云夜行飞靴', { dodgeBonus: 4, extra: '身法速度 +26' }),
      S('ACC', '柯公淬毒铁菱', { signatureEffect: '普攻命中时 25% 概率附加毒菱流血（每回合 3% 最大气血）' }),
    ],
  },
  {
    id: 'damo_qibing', name: '大漠弯弓铁骑套装', tier: 'blue', chapter: 1,
    bonuses: {
      two: '身法速度 +25',
      four: '普通攻击必定附带穿甲，无视目标 15% 护甲',
      six: '【鹰击长空】暴击时推进自身行动条 20%，30% 概率追加一次无消耗轻功射击',
    },
    parts: [
      S('WEAPON', '大漠桦木角弓', { atkBonus: 78, critBonus: 6, extra: '暴伤 +15%' }),
      S('HEAD', '羊皮雪翎帽', { hpBonus: 320, extra: '抗寒与毒抗 +10' }),
      S('ARMOR', '双层熟牛皮袄', { defBonus: 65, hpBonus: 460 }),
      S('WRIST', '马革缠臂带', { atkBonus: 22, extra: '身法 +4' }),
      S('BELT', '狼牙铜扣皮带', { hpBonus: 240, critBonus: 3 }),
      S('BOOTS', '沙海踏雁长靴', { extra: '身法 +32，大漠移动与修行收益 +5%' }),
      S('ACC', '苍狼白鹿骨佩', { signatureEffect: '战斗前 3 回合，全体速度提升 10%' }),
    ],
  },
  {
    id: 'huangshan_kulou', name: '荒山煞风骷髅套装', tier: 'blue', chapter: 1,
    bonuses: {
      two: '暴击率 +5%',
      four: '命中时 35% 概率施加【阴寒刺骨】（降低目标 20% 行动速度）',
      six: '【九阴残煞】对带有中毒或流血状态的目标，所有伤害提升 25%',
    },
    parts: [
      S('WEAPON', '惨白骨刺匕', { atkBonus: 92, extra: '内力真实伤害 +25' }),
      S('HEAD', '鬼面青铜面具', { hpBonus: 380, extra: '侠义倾向修正速度 +10%' }),
      S('ARMOR', '玄色死灵夜行袍', { defBonus: 78, hpBonus: 550 }),
      S('WRIST', '白骨扣腕甲', { atkBonus: 26, extra: '暴伤 +12%' }),
      S('BELT', '漆黑兽皮束腰', { hpBonus: 290, dodgeBonus: 3 }),
      S('BOOTS', '寂然无声履', { extra: '身法 +38，潜行闪避 +5%' }),
      S('ACC', '镂空头骨挂坠', { signatureEffect: '击败敌人时，汲取目标已损气血的 5% 转化为真气' }),
    ],
  },
  {
    id: 'henglian_tongjia', name: '横练铜甲摧心套装', tier: 'purple', chapter: 1,
    bonuses: {
      two: '护体防御 +80，根骨 +8',
      four: '受到致命一击时免疫死亡并保留 1 点气血，反弹等同自身护甲 150% 的反震伤害',
      six: '【铁壁铜尸】护甲提升 25%；受外功攻击时 30% 概率使攻击者手腕震麻（攻击 -20%）',
    },
    parts: [
      S('WEAPON', '乌金摧心匕', { atkBonus: 125, extra: '真实破甲 +45' }),
      S('HEAD', '铜铸护额发箍', { hpBonus: 520, extra: '受暴击伤害 -18%' }),
      S('ARMOR', '赤炼玄铁铜锁甲', { defBonus: 110, hpBonus: 780, extra: '金钟护体：物理伤害 -10%' }),
      S('WRIST', '重铜覆手护臂', { defBonus: 35, atkBonus: 30, extra: '招架率 +6%' }),
      S('BELT', '兽首吞口铜腰带', { hpBonus: 420, extra: '根骨 +6' }),
      S('BOOTS', '沉铁碾地长靴', { extra: '身法 +42，绝对格挡 +5%' }),
      S('ACC', '陈玄风的人皮刺绣残片', { signatureEffect: '参悟武学真气 -10%，内力上限 +180' }),
    ],
  },
  {
    id: 'huanghe_sigui', name: '黄河四鬼丧门套装', tier: 'blue', chapter: 2,
    bonuses: {
      two: '外功攻击 +60',
      four: '释放连击招式时，每次连击递增 10% 伤害',
      six: '【水鬼缠身】命中后 40% 概率降低目标 15% 防御与闪避',
    },
    parts: [
      S('WEAPON', '丧门分水鬼头刀', { atkBonus: 110, extra: '连击率 +5%' }),
      S('HEAD', '皮扣抹额巾', { hpBonus: 480, extra: '命中 +5%' }),
      S('ARMOR', '水牛皮硬鳞甲', { defBonus: 95, hpBonus: 680 }),
      S('WRIST', '分水铜环护手', { atkBonus: 28, extra: '破防 +12' }),
      S('BELT', '黑索束腰带', { hpBonus: 360, extra: '身法 +5' }),
      S('BOOTS', '泥沼疾行水靴', { extra: '身法 +48，水中与黑沼移动减免' }),
      S('ACC', '黄河四鬼路引令', { signatureEffect: '历练遭遇战遇敌频率 +10%' }),
    ],
  },
  {
    id: 'jinwang_fuxiu', name: '金国王府锦绣套装', tier: 'purple', chapter: 2,
    bonuses: {
      two: '身法速度 +35，暴击率 +6%',
      four: '暴击时扣除目标 15 点怒气，并使自身怒气 +15',
      six: '【富贵逼人】绝技伤害 +30%；受击时 20% 概率金丝格挡，减免 50% 伤害',
    },
    parts: [
      S('WEAPON', '金丝镂空雁翎刀', { atkBonus: 168, critBonus: 8, extra: '速度 +12' }),
      S('HEAD', '金冠紫玉束发簪', { hpBonus: 580, extra: '悟性 +5' }),
      S('ARMOR', '织金团龙云锦袍', { defBonus: 120, hpBonus: 890 }),
      S('WRIST', '绣金护腕', { atkBonus: 35, critBonus: 5 }),
      S('BELT', '白玉玛瑙垂带', { hpBonus: 480, extra: '福缘 +6' }),
      S('BOOTS', '踏云皂金官靴', { extra: '身法 +55，移动速度 +10%' }),
      S('ACC', '赵王府小王爷腰牌', { signatureEffect: '市井购买物品享受 10% 银两折扣' }),
    ],
  },
  {
    id: 'huanghe_nilang', name: '黄河逆浪分水套装', tier: 'purple', chapter: 2,
    bonuses: {
      two: '外功攻击 +90',
      four: '攻击命中时，将自身护甲防御的 10% 转化为当次外功真实伤害',
      six: '【翻江倒海】普攻 30% 概率触发全屏水浪，对敌方全体造成 80% 攻击力溅射',
    },
    parts: [
      S('WEAPON', '点钢分水重铁桨', { atkBonus: 195, extra: '破甲 +30，招架 +8%' }),
      S('HEAD', '分水青龙头盔', { hpBonus: 680, defBonus: 25 }),
      S('ARMOR', '黑蛟皮扎甲', { defBonus: 140, hpBonus: 1050 }),
      S('WRIST', '钢鳞覆臂护手', { atkBonus: 42, extra: '臂力 +7' }),
      S('BELT', '怒涛兽皮环带', { hpBonus: 560, extra: '招架 +5%' }),
      S('BOOTS', '逆浪分波重靴', { extra: '身法 +62，落水与冰冻免疫' }),
      S('ACC', '深潭辟水玄珠', { signatureEffect: '水系与阴寒伤害 -30%，真气每小时 +300' }),
    ],
  },
  {
    id: 'qianshou_panguan', name: '千手夺魄判官套装', tier: 'purple', chapter: 2,
    bonuses: {
      two: '命中率 +8%，暴击率 +6%',
      four: '施展外功时 50% 概率追加一记暗器毒刺',
      six: '【天罗地网】敌方闪避时触发暗器回马枪，承受 120% 不可闪避物理伤害',
    },
    parts: [
      S('WEAPON', '镔铁点穴判官笔', { atkBonus: 150, extra: '命中 +10%，点穴眩晕 +8%' }),
      S('HEAD', '判官勾魂冠', { hpBonus: 750, extra: '暗器伤害 +15%' }),
      S('ARMOR', '藏珍百褶夜行皮衣', { defBonus: 155, hpBonus: 1180 }),
      S('WRIST', '淬毒护腕钢甲', { atkBonus: 48, extra: '暴伤 +15%' }),
      S('BELT', '暗囊排挂皮带', { hpBonus: 620, extra: '暗器携带上限提升' }),
      S('BOOTS', '无影追魂尖头履', { extra: '身法 +70，速度抢位提升' }),
      S('ACC', '千手夺魄透骨钉', { signatureEffect: '行动开始时必定射出一枚透骨钉，造成 280 点破防真伤' }),
    ],
  },
  {
    id: 'xiyu_mizong', name: '西域密宗金刚套装', tier: 'purple', chapter: 2,
    bonuses: {
      two: '内力上限 +300，护体防御 +100',
      four: '受到外功暴击时，反弹敌方攻击力 25% 的朱砂血毒伤害',
      six: '【密宗金刚身】负面状态持续 -1 回合；气血高于 80% 时免疫控制',
    },
    parts: [
      S('WEAPON', '密宗降魔双铜钹', { atkBonus: 235, extra: '招架 +12%，反震 +15%' }),
      S('HEAD', '金顶黄绫僧帽', { hpBonus: 840, extra: '毒抗 +25' }),
      S('ARMOR', '西域朱砂金丝袈裟', { defBonus: 178, hpBonus: 1350 }),
      S('WRIST', '金刚密宗伏魔腕', { defBonus: 55, atkBonus: 50 }),
      S('BELT', '密宗经文法带', { hpBonus: 700, extra: '内力上限 +240' }),
      S('BOOTS', '高山厚底踏雪僧靴', { extra: '身法 +76，受击击退免疫' }),
      S('ACC', '密宗赤红朱砂印', { signatureEffect: '掌法伤害 +18%，攻击附带 3 回合毒性内伤' }),
    ],
  },
  {
    id: 'changbai_canxian', name: '长白参仙药灵套装', tier: 'purple', chapter: 2,
    bonuses: {
      two: '气血上限 +800，自愈能力 +50%',
      four: '每回合恢复 3% 最大气血与 2% 内力',
      six: '【生生不息】受到致死攻击时满血复活（每场 1 次）',
    },
    parts: [
      S('WEAPON', '子母追魂夺命枪', { atkBonus: 265, critBonus: 10, extra: '穿透 +35' }),
      S('HEAD', '老参根结赤玉冠', { hpBonus: 950, extra: '挂机阅历收益 +8%' }),
      S('ARMOR', '长白青缎貂皮风氅', { defBonus: 198, hpBonus: 1550, extra: '自愈 +40/回合' }),
      S('WRIST', '雪蚕丝裹臂', { atkBonus: 58, extra: '身法 +10' }),
      S('BELT', '药囊百草蟒皮带', { hpBonus: 790, extra: '百毒抗性 +35' }),
      S('BOOTS', '翻山绝壁飞跃靴', { dodgeBonus: 6, extra: '身法 +85' }),
      S('ACC', '参仙宝蛇真血玉佩', { signatureEffect: '气血上限 +15%；低于 20% 气血时攻击 +40%（2 回合）' }),
    ],
  },
  {
    id: 'baituo_zheshan', name: '白驼折扇风流套装', tier: 'purple', chapter: 3,
    bonuses: {
      two: '身法速度 +50，闪避率 +8%',
      four: '成功闪避后，下一次出招必定暴击',
      six: '【灵蛇诡道】35% 概率无视目标一切招架与护盾，造成真实伤害',
    },
    parts: [
      S('WEAPON', '白玉描金折扇', { atkBonus: 290, dodgeBonus: 8, extra: '速度 +18' }),
      S('HEAD', '西域雪蚕束发带', { hpBonus: 1080, extra: '悟性 +8' }),
      S('ARMOR', '月白风流锦缎衫', { defBonus: 220, hpBonus: 1750 }),
      S('WRIST', '镂空银丝护腕', { atkBonus: 66, critBonus: 8 }),
      S('BELT', '软金嵌玉束带', { hpBonus: 880, extra: '身法 +10' }),
      S('BOOTS', '踏水无痕鹿皮靴', { extra: '身法 +95，追击连携 +8%' }),
      S('ACC', '白驼少主翡翠折扇坠', { signatureEffect: '对女性目标招架 +15%，闪避 +10%' }),
    ],
  },
  {
    id: 'taihu_shuizhai', name: '太湖水寨波澜套装', tier: 'purple', chapter: 3,
    bonuses: {
      two: '护体防御 +120，招架率 +10%',
      four: '招架成功时恢复等同护甲值 50% 的气血',
      six: '【波澜不惊】受击伤害的 20% 转化为内力；怒气积攒 +30%',
    },
    parts: [
      S('WEAPON', '七宝烂银分水枪', { atkBonus: 220, extra: '招架 +15%，水系增伤 +12%' }),
      S('HEAD', '浪里白条银鳞盔', { hpBonus: 1200, defBonus: 35 }),
      S('ARMOR', '太湖绿罗水战锁子甲', { defBonus: 245, hpBonus: 1980 }),
      S('WRIST', '分波铁铸护臂', { atkBonus: 75, extra: '反震 +8%' }),
      S('BELT', '蛟龙皮错金腰带', { hpBonus: 980, extra: '招架吸伤 +8%' }),
      S('BOOTS', '踏波浪里飞', { extra: '身法 +108，水面轻功无视阻力' }),
      S('ACC', '归云庄太湖水令', { signatureEffect: '门派贡献 +20%，押镖与劫镖胜率提升' }),
    ],
  },
  {
    id: 'jiamian_piaoping', name: '假面飘萍戏客套装', tier: 'blue', chapter: 3,
    bonuses: {
      two: '身法速度 +60',
      four: '鬼市鉴宝费用 -50%，子时潜入不被卫兵发现',
      six: '【水上漂名不虚传】闪避 +15%；每次闪避掉落铜钱并嘲讽敌人',
    },
    parts: [
      S('WEAPON', '空心空锈铁掌套', { atkBonus: 280, extra: '进战 50% 概率吓退野怪' }),
      S('HEAD', '唬人高顶八卦冠', { hpBonus: 900, extra: '伪装欺瞒 +30%' }),
      S('ARMOR', '宽袍大袖戏法袍', { defBonus: 160, hpBonus: 1400 }),
      S('WRIST', '暗藏机关弹簧护手', { atkBonus: 50, extra: '暗器触发 +15%' }),
      S('BELT', '挂满机关暗格带', { hpBonus: 720, extra: '背包格子 +8' }),
      S('BOOTS', '空心轻木水上漂鞋', { extra: '身法 +120' }),
      S('ACC', '裘千丈的杂耍烟雾丸', { signatureEffect: '必死局面时有 1 次 100% 烟雾逃跑机会' }),
    ],
  },
  {
    id: 'jiuyin_baigu', name: '九阴白骨阴煞套装', tier: 'orange', chapter: 3,
    bonuses: {
      two: '外功攻击 +150，暴击率 +10%',
      four: '所有外功招式附带 20% 吸血',
      six: '【九阴白骨爪·煞】绝技必定封穴眩晕 2 回合，且无法被普通轻功闪避',
    },
    parts: [
      S('WEAPON', '玄铁百炼飞抓', { atkBonus: 385, critBonus: 12, extra: '真实破甲 +60' }),
      S('HEAD', '黑发掩面银丝骨箍', { hpBonus: 1450, extra: '受暴伤减免 +20%' }),
      S('ARMOR', '素白裹尸阴风袍', { defBonus: 280, hpBonus: 2350, dodgeBonus: 8 }),
      S('WRIST', '九阴白骨缠臂甲', { atkBonus: 92, extra: '外功 15% 转阴劲真伤' }),
      S('BELT', '九阴梵文刺绣腰带', { hpBonus: 1180, extra: '内力上限 +360' }),
      S('BOOTS', '夜行踏骨疾风靴', { extra: '身法 +125，速度抢位 +15%' }),
      S('ACC', '梅超风贴身铜人像', { signatureEffect: '外功 30% 概率施加白骨撕裂（每回合 5% 真实伤害）' }),
    ],
  },
  {
    id: 'canghai_kuanglan', name: '沧海狂澜风暴套装', tier: 'purple', chapter: 3,
    bonuses: {
      two: '外功攻击 +180，臂力 +15',
      four: '受到伤害时，自身怒气积攒额外增加 50%',
      six: '【乘风破浪】气血高于 50% 时，出手附带最大气血 5% 的震荡伤害',
    },
    parts: [
      S('WEAPON', '百斤沉铁破浪巨锚', { atkBonus: 420, extra: '破甲 +50，刚猛增伤 +18%' }),
      S('HEAD', '避水青鲛头盔', { hpBonus: 1580, defBonus: 45 }),
      S('ARMOR', '沧海油布防水重甲', { defBonus: 310, hpBonus: 1800 }),
      S('WRIST', '覆海龙鳞铁护手', { atkBonus: 105, extra: '臂力 +12' }),
      S('BELT', '翻江巨蟒束身带', { hpBonus: 1300, extra: '格挡率 +12%' }),
      S('BOOTS', '踏浪千钧防滑靴', { extra: '身法 +135，控制抵抗 +25%' }),
      S('ACC', '东海鲛人定风珠', { signatureEffect: '海难概率归零，全体伙伴减伤 +10%' }),
    ],
  },
  {
    id: 'qimen_dunjia', name: '奇门遁甲易数套装', tier: 'orange', chapter: 3,
    bonuses: {
      two: '悟性 +25，内力上限 +600',
      four: '受到流派克制伤害时，将克制效果反转为自身优势',
      six: '【奇门生克】每 2 回合封印敌方一个核心招式 1 回合，并降低敌方全体 20% 速度',
    },
    parts: [
      S('WEAPON', '九宫推演青竹杖', { atkBonus: 460, extra: '悟性 +15，内力真伤 +80' }),
      S('HEAD', '八卦乾坤紫阳冠', { hpBonus: 1750, extra: '悟性 +12' }),
      S('ARMOR', '水墨五行两仪鹤氅', { defBonus: 340, hpBonus: 2100, extra: '反弹 +15%' }),
      S('WRIST', '奇门机括连环护腕', { atkBonus: 118, extra: '招架 +15%' }),
      S('BELT', '河图洛书星宿腰带', { hpBonus: 1450, extra: '内力上限 +480' }),
      S('BOOTS', '八卦迷踪踏云履', { dodgeBonus: 12, extra: '身法 +150' }),
      S('ACC', '黄药师亲刻曲三铁八卦', { signatureEffect: '悟性 +20，桃花岛武学修炼消耗 -30%' }),
    ],
  },
  {
    id: 'kongming_wantong', name: '空明顽童玄素套装', tier: 'orange', chapter: 3,
    bonuses: {
      two: '连击率 +18%，身法速度 +60',
      four: '普通外功命中后 45% 概率触发第二次连击追击',
      six: '【左右互搏】同一回合可释放两次外功，第二次为原始伤害的 80%',
    },
    parts: [
      S('WEAPON', '周伯通亲盘桃木剑', { atkBonus: 495, extra: '连击 +15%，无视防御 +20%' }),
      S('HEAD', '顽童挽髻破头巾', { hpBonus: 1900, extra: '控制持续时间减半' }),
      S('ARMOR', '粗葛补丁道人袍', { defBonus: 375, hpBonus: 3200, extra: '内力减免 +20%' }),
      S('WRIST', '麻布缠裹护手腕', { atkBonus: 130, extra: '连击伤害 +25%' }),
      S('BELT', '随性草绳结腰带', { hpBonus: 1600, extra: '身法 +15' }),
      S('BOOTS', '踏破铁鞋万年履', { dodgeBonus: 15, extra: '身法 +165' }),
      S('ACC', '周伯通心爱促织笼', { signatureEffect: '战斗开始召唤促织，敌方首回合无法释放绝技' }),
    ],
  },
  {
    id: 'bihai_chaosheng', name: '碧海潮生青玉套装', tier: 'orange', chapter: 3,
    bonuses: {
      two: '外功攻击 +160，悟性 +30',
      four: '命中时 40% 概率封穴，使目标无法施展内功被动',
      six: '【碧海潮生】释放绝技时全屏音律海啸，造成内力上限 15% 真伤并降低敌方 30% 攻击',
    },
    parts: [
      S('WEAPON', '东海万年碧玉箫', { atkBonus: 420, extra: '内力化劲真伤 +120' }),
      S('HEAD', '碧玉雕花束发冠', { hpBonus: 1600, extra: '悟性 +20' }),
      S('ARMOR', '青色织锦东邪长衫', { defBonus: 310, hpBonus: 2600, extra: '奇门伤害减免 25%' }),
      S('WRIST', '落英神剑金丝护腕', { atkBonus: 145, extra: '连携率 +15%' }),
      S('BELT', '碧海青波垂丝带', { hpBonus: 1300, extra: '内力上限 +600' }),
      S('BOOTS', '青玉踏波飞云靴', { extra: '身法 +180，绝对先手 +20%' }),
      S('ACC', '黄药师亲调九花玉露丸宝匣', { signatureEffect: '冲穴成功率 +20%，离线打坐真气 +25%' }),
    ],
  },
  {
    id: 'baituo_yushe', name: '白驼驭蛇奇毒套装', tier: 'orange', chapter: 4,
    bonuses: {
      two: '攻击命中中毒目标时，暴击率 +18%',
      four: '受到致命伤时，将自身全部负面状态转移给敌方全体',
      six: '【万蛇噬骨】敌方毒素叠满 3 层时引爆，造成已损气血 25% 真实伤害',
    },
    parts: [
      S('WEAPON', '金环赤练蛇骨杖', { atkBonus: 580, extra: '毒伤 +35%，命中 +12%' }),
      S('HEAD', '蛇皮兜鍪面甲', { hpBonus: 2300, extra: '毒抗 +50' }),
      S('ARMOR', '百鳞避火蛇皮软铠', { defBonus: 445, hpBonus: 3950, extra: '火焰与流血伤害减半' }),
      S('WRIST', '逆鳞缠腕铜护臂', { atkBonus: 160, critBonus: 12 }),
      S('BELT', '九节响尾蛇骨带', { hpBonus: 2000, extra: '身法 +18' }),
      S('BOOTS', '无鳞潜沙踏雪靴', { dodgeBonus: 15, extra: '身法 +195' }),
      S('ACC', '白驼山庄万毒雄黄令', { signatureEffect: '攻击必定附加剧毒（每回合 4% 最大气血，可叠 3 层）' }),
    ],
  },
  {
    id: 'hama_nimai', name: '蛤蟆逆脉天险套装', tier: 'orange', chapter: 4,
    bonuses: {
      two: '外功攻击 +260，气血上限 +1500',
      four: '受到外功伤害时吸收 30% 储存，释放下一个绝技时返还',
      six: '【蛤蟆绝杀】蓄力 1 回合后释放 350% 破甲爆发',
    },
    parts: [
      S('WEAPON', '白驼陨铁金蛇软剑', { atkBonus: 620, extra: '真实内劲 +150，破甲 +40' }),
      S('HEAD', '西域天蚕丝织面巾', { hpBonus: 2500, extra: '免疫致盲与刺眼' }),
      S('ARMOR', '狂蟾逆鳞护体锦袍', { defBonus: 480, hpBonus: 4300, extra: '受击反伤 +20%' }),
      S('WRIST', '陨铁重铸金刚腕', { atkBonus: 175, extra: '刚猛增伤 +20%' }),
      S('BELT', '天山玄冰雪玉带', { hpBonus: 2200, extra: '内力上限 +750' }),
      S('BOOTS', '瞬息千里踏空靴', { dodgeBonus: 18, extra: '身法 +210' }),
      S('ACC', '欧阳克折断的金骨折扇', { signatureEffect: '气血越低，防御与暴击越高（最高 +40%）' }),
    ],
  },
  {
    id: 'qianying_mixing', name: '潜影密行斥候套装', tier: 'purple', chapter: 4,
    bonuses: {
      two: '暴击率 +12%，命中率 +10%',
      four: '处于后排或被护卫时，伤害 +25%',
      six: '【密室暗杀】首回合必定暴击，且首击 50% 转化为真实穿透',
    },
    parts: [
      S('WEAPON', '精钢三股托天叉', { atkBonus: 580, extra: '招架 +18%，连击 +10%' }),
      S('HEAD', '金兵百夫长精铁盔', { hpBonus: 2400, defBonus: 40 }),
      S('ARMOR', '暗影潜行锁子轻甲', { defBonus: 460, hpBonus: 4100 }),
      S('WRIST', '金丝镂花重臂铠', { atkBonus: 165, extra: '破甲 +35' }),
      S('BELT', '暗格行军皮束带', { hpBonus: 2100, extra: '暗器容量翻倍' }),
      S('BOOTS', '夜探密室踏雪无声靴', { extra: '身法 +205，脱战与逃跑成功率 100%' }),
      S('ACC', '曲三酒馆密室暗格铁八卦钥', { signatureEffect: '每日免费摸取 1 次随机上品残页' }),
    ],
  },
  {
    id: 'jiuwei_linghu', name: '九尾灵狐泥鳅套装', tier: 'orange', chapter: 4,
    bonuses: {
      two: '身法速度 +80，绝对闪避 +12%',
      four: '闪避后立刻获得一次无消耗反击，造成身法 120% 真实伤害',
      six: '【泥鳅游天】每回合驱散 1 个负面状态，并使敌方命中 -20%',
    },
    parts: [
      S('WEAPON', '白玉算盘七星剑', { atkBonus: 660, extra: '身法 +25，奇门破甲 +60' }),
      S('HEAD', '灵狐雪白毛皮披肩冠', { hpBonus: 2700, dodgeBonus: 15 }),
      S('ARMOR', '泥鳅滑体白丝轻纱袍', { defBonus: 510, hpBonus: 4600, extra: '30% 概率滑开卸力' }),
      S('WRIST', '灵狐白玉缠腕', { atkBonus: 190, extra: '闪避反击 +18%' }),
      S('BELT', '河洛九宫织金带', { hpBonus: 2400, extra: '悟性 +20' }),
      S('BOOTS', '踏泥不沉轻灵狐步履', { extra: '身法 +230，沼泽闪避 +25%' }),
      S('ACC', '瑛姑贴身喂养九尾灵狐令', { signatureEffect: '闪避上限提升至 75%，闪避恢复 5% 气血' }),
    ],
  },
  {
    id: 'tiezhang_kaishan', name: '铁掌开山踏浪套装', tier: 'orange', chapter: 4,
    bonuses: {
      two: '外功攻击 +220，臂力 +30',
      four: '攻击带护盾或防御姿态的目标时，造成双倍暴击伤害',
      six: '【铁掌开山】35% 概率触发 220% 不可招架轰击，并使目标攻击 -30%',
    },
    parts: [
      S('WEAPON', '玄铁千钧开山重掌套', { atkBonus: 520, extra: '刚猛 +25%，破甲 +65，破盾 +50%' }),
      S('HEAD', '铁掌帮主青铜虎首盔', { hpBonus: 2900, extra: '外攻 +60' }),
      S('ARMOR', '黑金重锻千层铁鳞铠', { defBonus: 380, hpBonus: 3500, extra: '硬气功减伤 +15%' }),
      S('WRIST', '铁掌破石重甲臂', { atkBonus: 210, extra: '暴伤 +25%' }),
      S('BELT', '湘西黑金猛虎腰带', { hpBonus: 2600, extra: '臂力 +25' }),
      S('BOOTS', '水上漂铁掌飞渡靴', { extra: '身法 +245，轻功速度 +30' }),
      S('ACC', '裘千仞亲传铁掌帮掌门指环', { signatureEffect: '刚猛命中剥夺目标 20% 护甲（3 回合，可叠）' }),
    ],
  },
  {
    id: 'xizheng_jindao', name: '西征金刀大汗套装', tier: 'orange', chapter: 5,
    bonuses: {
      two: '全队外功攻击 +200，气血上限 +2000',
      four: '击败敌人后，全员回复 15% 气血并增加 30 怒气',
      six: '【一代天骄】上阵郭靖时，其合击概率提升至 100%，追击伤害 150%',
    },
    parts: [
      S('WEAPON', '成吉思汗亲赐金鞘宝刀', { atkBonus: 760, critBonus: 15, extra: '破甲 +80，指挥连携 +20%' }),
      S('HEAD', '大汗贴身纯金雕翎盔', { hpBonus: 3200, extra: '臂力 +20' }),
      S('ARMOR', '塞外重甲鱼鳞百炼金锁铠', { defBonus: 590, hpBonus: 5400, extra: '全系抗性 +20' }),
      S('WRIST', '百战金刀护臂铠', { atkBonus: 230, extra: '暴伤 +30%' }),
      S('BELT', '黄金错缕九宝皮带', { hpBonus: 2800, extra: '全队防御 +10%' }),
      S('BOOTS', '铁骑踏雪百战战靴', { extra: '身法 +260，免疫减速与击退' }),
      S('ACC', '成吉思汗玄铁金鹰令', { signatureEffect: '全体伙伴追击 +25%，全队外攻 +15%' }),
    ],
  },
  {
    id: 'quanzhen_beidou', name: '全真北斗玄黄套装', tier: 'orange', chapter: 5,
    bonuses: {
      two: '护体防御 +200，内力上限 +800',
      four: '每回合为全队施加等同内力上限 20% 的纯阳护盾',
      six: '【天罡北斗阵】三人同时在场时招架 +30%，伤害由三人均摊，受击者回怒翻倍',
    },
    parts: [
      S('WEAPON', '七星龙渊道家重剑', { atkBonus: 810, extra: '纯阳真伤 +180，招架 +20%' }),
      S('HEAD', '玄天九曜纯阳道冠', { hpBonus: 3500, extra: '离线打坐收益 +35%' }),
      S('ARMOR', '太极玄黄八卦法袍', { defBonus: 630, hpBonus: 5800, extra: '每回合驱散 1 个异常' }),
      S('WRIST', '天罡北斗金丝护腕', { atkBonus: 250, extra: '内力上限 +600' }),
      S('BELT', '重阳纯阳真气束腰', { hpBonus: 3000, extra: '回内 +15%' }),
      S('BOOTS', '九天揽月凌霄云履', { dodgeBonus: 18, extra: '身法 +275' }),
      S('ACC', '王重阳遗留纯阳八卦镜', { signatureEffect: '受邪派攻击减伤 30%，道家武学威力 +25%' }),
    ],
  },
  {
    id: 'dajin_sishi', name: '大金覆灭死士套装', tier: 'orange', chapter: 5,
    bonuses: {
      two: '外功攻击 +380，暴击率 +15%',
      four: '气血每降低 10%，攻击与暴伤提升 8%',
      six: '【决死一击】受致死攻击时插队释放一次必暴、100% 吸血的绝技',
    },
    parts: [
      S('WEAPON', '饮恨淬血透甲枪', { atkBonus: 860, extra: '真实破甲 +100，流血 +40%' }),
      S('HEAD', '死士残破青铜铁面', { hpBonus: 3800, extra: '临死狂暴增伤 +30%' }),
      S('ARMOR', '黑煞染血精铁甲', { defBonus: 670, hpBonus: 6200 }),
      S('WRIST', '绝命缠铁死士护手', { atkBonus: 270, critBonus: 18 }),
      S('BELT', '破阵断骨狼皮带', { hpBonus: 3200, extra: '濒死减伤 +25%' }),
      S('BOOTS', '追风绝尘染血履', { extra: '身法 +290，必定先手' }),
      S('ACC', '完颜洪烈染血贴身金牌', { signatureEffect: '侠义对敌加成翻倍，对金国与邪派伤害 +25%' }),
    ],
  },
  {
    id: 'niluan_jiuyin', name: '逆乱九阴天下第一套装', tier: 'red', chapter: 5,
    bonuses: {
      two: '外功攻击 +350，内力上限 +1000',
      four: '暴击伤害 +35%；释放绝技后追加一次外功（每回合 1 次）',
      six: '【武道极境】解除招式门派与兵器限制；气血低于 30% 时进入疯魔（免控、攻击 +80%、必暴，3 回合）',
    },
    parts: [
      S('WEAPON', '逆练真经·玄铁狂生剑', { atkBonus: 680, critBonus: 20, extra: '真伤 +180，全穿透 +30%' }),
      S('HEAD', '踏雪封顶通天金冠', { hpBonus: 2800, extra: '悟性 +30，根骨 +30，离线阅历 +50%' }),
      S('ARMOR', '逆阴阳玄煞天蚕宝甲', { defBonus: 520, hpBonus: 4800, extra: '减伤 25%，35% 吸收伤害转真气' }),
      S('WRIST', '逆乱乾坤通天护腕', { atkBonus: 320, extra: '暴伤 +40%，招架 +25%' }),
      S('BELT', '九阴梵文总纲通天金丝带', { hpBonus: 2600, extra: '内力 +800，速度 +35' }),
      S('BOOTS', '华山踏雪无痕天行靴', { dodgeBonus: 20, extra: '身法 +330，先手 +35%' }),
      S('ACC', '天下第一·华山玉佩', { signatureEffect: '六维各 +20；全服襄阳雕像与【射雕·天下第一】称号' }),
    ],
  },
]

const SET_BY_ID = new Map(TRIAL_SETS.map((set) => [set.id, set]))

export function trialSetOf(setId: string) {
  return SET_BY_ID.get(setId)
}

export function trialPartOf(setId: string, slot: EquipSlotType) {
  return trialSetOf(setId)?.parts.find((part) => part.slot === slot)
}

const CHAPTER_OF: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1,
  8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 13: 2,
  14: 3, 15: 3, 16: 3, 17: 3, 18: 3, 19: 3, 20: 3, 21: 3,
  22: 4, 23: 4, 24: 4, 25: 4, 26: 4,
  27: 5, 28: 5, 29: 5, 30: 5,
}

/** 01~15 关按分钟配平，16 关起按小时；见 docs/14 */
export const TRIAL_PATROL_HOURS: Record<number, number> = {
  1: 0, 2: 3 / 60, 3: 5 / 60, 4: 7 / 60, 5: 9 / 60,
  6: 11 / 60, 7: 13 / 60, 8: 15 / 60, 9: 17 / 60, 10: 20 / 60,
  11: 22 / 60, 12: 24 / 60, 13: 26 / 60, 14: 28 / 60, 15: 30 / 60,
  16: 42, 17: 42, 18: 42, 19: 42, 20: 42, 21: 42,
  22: 48, 23: 48, 24: 48, 25: 48, 26: 48, 27: 48, 28: 48, 29: 48,
  30: 64,
}

interface StageSeed {
  id: number
  title: string
  boss: [string, string, PortraitStyle]
  stance: StanceType
  setId: string
  firstClearParts: EquipSlotType[]
  tip: string
  victory?: 'DEFEAT_BOSS' | 'SURVIVE_ROUNDS'
  surviveRounds?: number
  replayPartIds?: [string, string]
  unlock?: 'INNER_LEFT' | 'RIGHT_ULT'
}

const STAGE_SEEDS: StageSeed[] = [
  { id: 1, title: '破庙夜雨 · 荒山草贼', boss: ['黑风寨逃寇·赖三', '绿林流寇', 'assassin'], stance: 'FIERCE', setId: 'pomiao_caomang', firstClearParts: ['WEAPON', 'ARMOR'], tip: '绕开他大开大合的刀势，直取中宫。' },
  { id: 2, title: '醉仙酒肆 · 淮南恶霸', boss: ['恶虎镖局弃徒·焦大亨', '江南酒楼恶霸', 'assassin'], stance: 'FIERCE', setId: 'zuixian_xingshang', firstClearParts: ['HEAD'], tip: '连续受击 3 回合后他会重心失衡，暴击更好打。' },
  { id: 3, title: '法华古寺 · 焦木盲僧', boss: ['法华寺知客·了妄和尚', '罗汉棍僧', 'monk'], stance: 'TAICHI', setId: 'fahua_zuyi', firstClearParts: ['WRIST'], tip: '他防御厚，用身法切到背后破招。' },
  { id: 4, title: '醉仙楼头 · 盲侠柯镇恶', boss: ['飞天蝙蝠·柯镇恶', '江南七怪之首', 'assassin'], stance: 'FIERCE', setId: 'jiangnan_qiguai', firstClearParts: ['BELT'], tip: '他靠风声辨位，轻功身法可让毒菱落空。' },
  { id: 5, title: '塞外瀚海 · 蒙古骑射手', boss: ['哲别麾下·帖木儿', '大漠神射斥候', 'assassin'], stance: 'AGILE', setId: 'damo_qibing', firstClearParts: ['BOOTS'], tip: '贴身短打，他的箭术就施展不开。' },
  { id: 6, title: '荒山骷髅 · 塞外双煞残阵', boss: ['白驼山盗墓使·阴陵客', '黑风双煞爪牙', 'assassin'], stance: 'AGILE', setId: 'huangshan_kulou', firstClearParts: ['ACC'], tip: '阴寒掌力怕纯阳内功，先换全真吐纳。' },
  { id: 7, title: '荒山绝杀 · 铜尸陈玄风', boss: ['铜尸·陈玄风', '黑风双煞', 'assassin'], stance: 'FIERCE', setId: 'henglian_tongjia', firstClearParts: ['WEAPON', 'ARMOR'], tip: '撑过前 4 回合，等他露出肚脐罩门再一击制胜。', replayPartIds: ['henglian_tongjia_weapon', 'henglian_tongjia_armor'] },
  { id: 8, title: '张家口外 · 黄河四鬼截道', boss: ['断魂刀·沈青刚', '黄河四鬼', 'assassin'], stance: 'FIERCE', setId: 'huanghe_sigui', firstClearParts: ['WEAPON'], tip: '先杀控场的沈青刚，吴青烈枪法自乱。' },
  { id: 9, title: '中都擂台 · 小王爷完颜康', boss: ['赵王世子·完颜康', '金国小王爷', 'assassin'], stance: 'AGILE', setId: 'jinwang_fuxiu', firstClearParts: ['HEAD'], tip: '他怒气满时会冒进，用太极招架反拧。' },
  { id: 10, title: '赵王外院 · 鬼门龙王沙通天', boss: ['鬼门龙王·沙通天', '黄河帮帮主', 'assassin'], stance: 'FIERCE', setId: 'huanghe_nilang', firstClearParts: ['WRIST'], tip: '怒浪排壑有蓄力起手，抓住时机打断。', unlock: 'INNER_LEFT' },
  { id: 11, title: '王府校场 · 千手人屠彭连虎', boss: ['千手人屠·彭连虎', '华北绿林大盗', 'assassin'], stance: 'AGILE', setId: 'qianshou_panguan', firstClearParts: ['BELT'], tip: '贴身缠斗，封住他释放暗器的通道。' },
  { id: 12, title: '药房秘坛 · 大手印灵智上人', boss: ['密宗大师·灵智上人', '西域密宗高僧', 'monk'], stance: 'FIERCE', setId: 'xiyu_mizong', firstClearParts: ['BOOTS'], tip: '别和他对掌超过三回合，用利刃刺双肋气门。' },
  { id: 13, title: '王府突围 · 参仙老怪梁子翁', boss: ['长白参仙·梁子翁', '长白山武学名宿', 'zhoubotong'], stance: 'AGILE', setId: 'changbai_canxian', firstClearParts: ['WEAPON', 'HEAD'], tip: '药蛇死后他会狂怒露出破绽，刚猛掌力克制他。', replayPartIds: ['changbai_canxian_weapon', 'changbai_canxian_head'] },
  { id: 14, title: '宝应松林 · 白驼少主欧阳克', boss: ['白驼山少主·欧阳克', '西毒嫡传', 'assassin'], stance: 'AGILE', setId: 'baituo_zheshan', firstClearParts: ['ACC'], tip: '右翼上阵黄蓉，他的招式会留手三成。' },
  { id: 15, title: '太湖水寨 · 归云庄翻江蛟', boss: ['归云庄大统领·陆冠英', '太湖群盗首领', 'assassin'], stance: 'TAICHI', setId: 'taihu_shuizhai', firstClearParts: ['WEAPON'], tip: '他借水势以柔克刚，用纯刚猛强行破枪阵。' },
  { id: 16, title: '归云正堂 · 欺世盗名裘千丈', boss: ['江湖招摇客·裘千丈', '假裘千仞', 'zhoubotong'], stance: 'AGILE', setId: 'jiamian_piaoping', firstClearParts: ['HEAD'], tip: '对他造成一次超过 500 点伤害，障眼法就破了。' },
  { id: 17, title: '太湖芦苇 · 铁尸梅超风', boss: ['铁尸·梅超风', '黑风双煞', 'meichaofeng'], stance: 'FIERCE', setId: 'jiuyin_baigu', firstClearParts: ['WRIST'], tip: '金雁功或桃花音律能扰乱她的听声辨位。' },
  { id: 18, title: '东海巨舶 · 桃花哑仆舵手', boss: ['桃花哑仆领班·铜首', '黄药师座下哑仆', 'monk'], stance: 'FIERCE', setId: 'canghai_kuanglan', firstClearParts: ['BELT'], tip: '体型大、出招慢，绕到背后打。' },
  { id: 19, title: '积翠深处 · 奇门九宫石阵', boss: ['九宫木人偶', '桃花岛石阵阵灵', 'monk'], stance: 'TAICHI', setId: 'qimen_dunjia', firstClearParts: ['BOOTS'], tip: '按坎一坤二震三巽四踏离九生门，直破中宫。' },
  { id: 20, title: '清音石洞 · 老顽童周伯通', boss: ['老顽童·周伯通', '全真教师叔祖', 'zhoubotong'], stance: 'TAICHI', setId: 'kongming_wantong', firstClearParts: ['ACC'], tip: '悟性低于 35 或带着蟋蟀，他会主动放水。' },
  { id: 21, title: '碧海听箫 · 东邪黄药师', boss: ['东邪·黄药师', '天下五绝·桃花岛主', 'huangyaoshi'], stance: 'AGILE', setId: 'bihai_chaosheng', firstClearParts: ['WEAPON', 'ACC'], tip: '撑过他的三道试题十回合，音律一停便算过关。', victory: 'SURVIVE_ROUNDS', surviveRounds: 10, replayPartIds: ['bihai_chaosheng_weapon', 'bihai_chaosheng_acc'], unlock: 'RIGHT_ULT' },
  { id: 22, title: '狂澜火船 · 白驼蛇奴统领', boss: ['白驼山驭蛇长老·蛇奴统领', '白驼精锐', 'assassin'], stance: 'AGILE', setId: 'baituo_yushe', firstClearParts: ['WEAPON'], tip: '毒蛇畏火，刚猛掌风能扫落蛇阵。' },
  { id: 23, title: '压鬼孤岛 · 西毒欧阳锋残影', boss: ['西毒·欧阳锋', '天下五绝', 'ouyangfeng'], stance: 'FIERCE', setId: 'hama_nimai', firstClearParts: ['HEAD'], tip: '蛤蟆功蓄力不可力敌，用太极引他撞石。' },
  { id: 24, title: '牛家密室 · 侯通海与金兵斥候', boss: ['三头蛟·侯通海', '黄河帮三当家', 'assassin'], stance: 'FIERCE', setId: 'qianying_mixing', firstClearParts: ['WRIST'], tip: '点他脑门三颗肉瘤，立刻抱头痛嚎。' },
  { id: 25, title: '湘西黑沼 · 神算子瑛姑', boss: ['神算子·刘瑛姑', '前大理皇妃', 'meichaofeng'], stance: 'AGILE', setId: 'jiuwei_linghu', firstClearParts: ['BELT'], tip: '解开九宫算术题，她心神失守才好制住。' },
  { id: 26, title: '铁掌孤峰 · 水上漂裘千仞', boss: ['铁掌水上漂·裘千仞', '湘西铁掌帮主', 'ouyangfeng'], stance: 'FIERCE', setId: 'tiezhang_kaishan', firstClearParts: ['WEAPON', 'ACC'], tip: '太极或一阳指能化解他的焚石掌风。', replayPartIds: ['tiezhang_kaishan_weapon', 'tiezhang_kaishan_acc'] },
  { id: 27, title: '大漠西征 · 撒麻尔罕铁甲千户', boss: ['花剌子模重甲亲军帅·忽鲁忽', '撒麻尔罕守将', 'assassin'], stance: 'FIERCE', setId: 'xizheng_jindao', firstClearParts: ['BOOTS'], tip: '普通刀剑破不了重甲，借武穆遗书奇谋卸其战马。' },
  { id: 28, title: '烟雨楼头 · 全真七子天罡北斗', boss: ['长春子·丘处机', '全真七子', 'monk'], stance: 'TAICHI', setId: 'quanzhen_beidou', firstClearParts: ['ACC'], tip: '抢占北极天枢位，大阵气机自解。' },
  { id: 29, title: '铁枪古庙 · 完颜洪烈死士营', boss: ['大金六王爷·完颜洪烈', '死士亲卫统领', 'assassin'], stance: 'FIERCE', setId: 'dajin_sishi', firstClearParts: ['WEAPON'], tip: '死士会自爆，用轻功逐一击飞远离中军。' },
  { id: 30, title: '华山之巅 · 疯魔逆九阴欧阳锋', boss: ['疯魔西毒·欧阳锋', '天下第一狂', 'ouyangfeng'], stance: 'FIERCE', setId: 'niluan_jiuyin', firstClearParts: ['WEAPON', 'HEAD'], tip: '他经脉逆行免疫点穴；血量两成时让黄蓉攻心。', replayPartIds: ['niluan_jiuyin_weapon', 'niluan_jiuyin_head'] },
]

export const TRIAL_STAGES: TrialStageConfig[] = STAGE_SEEDS.map((seed) => ({
  id: seed.id,
  chapter: CHAPTER_OF[seed.id],
  code: String(seed.id).padStart(2, '0'),
  title: seed.title,
  recLevel: seed.id,
  boss: {
    name: seed.boss[0],
    title: seed.boss[1],
    portrait: seed.boss[2],
    hp: trialBossHp(seed.id),
    atk: trialBossAtk(seed.id),
    stance: seed.stance,
  },
  mechanicTip: seed.tip,
  victory: seed.victory ?? 'DEFEAT_BOSS',
  surviveRounds: seed.surviveRounds,
  setId: seed.setId,
  firstClearParts: seed.firstClearParts,
  replayPartIds: seed.replayPartIds,
  unlock: seed.unlock,
}))

export const TRIAL_STAGE_BY_ID = new Map(TRIAL_STAGES.map((stage) => [stage.id, stage]))

export function trialStageOf(id: number) {
  return TRIAL_STAGE_BY_ID.get(id)
}

export function trialSetOfStage(stage: TrialStageConfig) {
  return trialSetOf(stage.setId)
}

export function trialPartIdOfStage(stage: TrialStageConfig, slot: EquipSlotType) {
  return trialPartId(stage.setId, slot)
}

/** 章末首领复战开放，需在本关累计巡历满 4 小时 */
export const TRIAL_REPLAY_HOURS = 4

/** 首胜、复战、巡历都从这套池子里取件 */
export const TRIAL_ITEMS = TRIAL_SETS.flatMap((set) =>
  set.parts.map((part) => ({
    id: trialPartId(set.id, part.slot),
    name: part.name,
    slot: part.slot,
    tier: set.tier,
    setId: set.id,
    atkBonus: part.atkBonus,
    defBonus: part.defBonus,
    hpBonus: part.hpBonus,
    critBonus: part.critBonus,
    dodgeBonus: part.dodgeBonus,
    idleBonus: part.idleBonus,
    signatureEffect: part.signatureEffect,
    extra: part.extra,
    desc: `${set.name}·${part.name}`,
  })),
)

export const TRIAL_ITEM_BY_ID = new Map(TRIAL_ITEMS.map((item) => [item.id, item]))

export function trialItemOf(id: string) {
  return TRIAL_ITEM_BY_ID.get(id)
}

/** 每 30 分钟一次遭遇，25% 掉件，7 部位等概率 */
export const PATROL_ENCOUNTER_MINUTES = 30
export const PATROL_DROP_CHANCE = 0.25

/** 成色：普通 80% / 小极品 16% / 极品 4% */
export const PATROL_QUALITY = { normal: 0.8, fine: 0.16, perfect: 0.04 } as const

/** 装备词条数值档，用于极品展示；倍率为相对基础值的浮动 */
export const AFFIX_TIERS = {
  fine: [1.08, 1.11, 1.15],
  perfect: [1.2, 1.25, 1.3],
} as const
