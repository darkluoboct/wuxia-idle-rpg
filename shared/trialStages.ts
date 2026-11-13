/**
 * 第一卷《射雕篇》30 关历练与巡历配置。
 * 数据来源：docs/13、docs/14、docs/17；数值按 30 级尺度重算。
 */
import type { BattleEffect } from './battleEffects.ts'
import { formatBattleStatBonuses, HUANG_YAOSHI_COMBAT, KE_POISON_DART, LIANG_SNAKE_GUARD, LIANG_ZIWENG_COMBAT, LINGZHI_COMBAT, OUYANG_FENG_FRENZY, PENG_LIANHU_COMBAT, QIU_QIANREN_COMBAT, QIU_QIANZHANG_COMBAT, SHA_TONGTIAN_COMBAT, SHEN_QINGGANG_COMBAT, STANCE_META, WANYAN_KANG_COMBAT, WU_QINGLIE_COMBAT, type BattleEnemyGuard, type BattleEnvironment, type BattleStatBonuses, type BattleStatusRule, type EnemyCombatConfig } from './combatMeta.ts'
import type { ItemConfig } from './gameData.ts'
import type { BattleReportDTO, CombatUnitDTO, CompanionState, EquipSlotType, LoadoutPresetDTO, PlayerDTO, SixStats, StanceType, TierColor, TrialDropDTO, TrialStateDTO } from './protocol.ts'
import { QUANZHEN_SEVEN_IDS } from './quanzhen.ts'

type PortraitStyle = CombatUnitDTO['portraitStyle']

export interface TrialPartConfig {
  slot: EquipSlotType
  name: string
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
  masteryDiscount?: ItemConfig['masteryDiscount']
  breakthroughBonus?: number
  sectContributionBonus?: number
  escortAttackPercent?: number
  marketDiscount?: number
  backpackSlots?: number
  signatureEffect?: string
  signatureOwner?: string
  resonance?: ItemConfig['resonance']
  companionUse?: ItemConfig['companionUse']
  battleEffects?: readonly BattleEffect[]
  /** 详情中额外显示的属性和词条说明 */
  extra?: string
}

export interface TrialSetConfig {
  id: string
  name: string
  tier: TierColor
  chapter: number
  bonuses: { two: string; four: string; six: string }
  battleBonuses?: readonly { pieces: 2 | 4 | 6; effects: readonly BattleEffect[] }[]
  parts: TrialPartConfig[]
}

export interface TrialStageConfig {
  id: number
  chapter: number
  code: string
  title: string
  environment?: BattleEnvironment
  recLevel: number
  boss: {
    name: string
    title: string
    portrait: PortraitStyle
    hp: number
    atk: number
    stance: StanceType
    combat?: EnemyCombatConfig
  }
  guards?: BattleEnemyGuard[]
  puzzle?: {
    name: string
    prompt: string
    options: readonly string[]
    answer: string
    round: number
    correctText: string
    wrongText: string
    statuses?: readonly BattleStatusRule[]
  }
  mechanicTip: string
  victory: 'DEFEAT_BOSS' | 'SURVIVE_ROUNDS'
  surviveRounds?: number
  setId: string
  /** 首胜必得的部位；章末关给两件 */
  firstClearParts: EquipSlotType[]
  /** 战胜时授予尚未习得的秘籍 */
  clearSkillId?: string
  clearItemId?: string
  clearItemRequiresPuzzle?: true
  clearCompanionIds?: readonly string[]
  /** 章末首领复战的招牌池，元素为 partId */
  replayPartIds?: [string, string]
  /** 该关达成后解锁的系统 */
  unlock?: 'INNER_LEFT' | 'RIGHT_ULT'
}

export function trialFirstClearKarma(stage: TrialStageConfig) {
  return stage.boss.combat?.alignment === 'HERETIC' ? 25 : 0
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

const statEffect = (stats: BattleStatBonuses): BattleEffect => ({ kind: 'STAT_BONUS', stats })

function twoPieceStats(
  stats: BattleStatBonuses, four: string, six: string, higherBonuses: TrialSetConfig['battleBonuses'] = [],
): Pick<TrialSetConfig, 'bonuses' | 'battleBonuses'> {
  return {
    bonuses: { two: formatBattleStatBonuses(stats), four, six },
    battleBonuses: [{ pieces: 2, effects: [statEffect(stats)] }, ...higherBonuses],
  }
}

function partStats(stats: BattleStatBonuses, otherExtra?: string) {
  const text = formatBattleStatBonuses(stats)
  return { extra: otherExtra ? `${text}，${otherExtra}` : text, battleEffects: [statEffect(stats)] }
}

type TrialPartEffects = Pick<TrialPartConfig, 'signatureEffect' | 'battleEffects' | 'extra'>

function partEffect(effect: BattleEffect, description: string, base: TrialPartEffects = {}): TrialPartEffects {
  return {
    ...base,
    signatureEffect: base.signatureEffect ? `${base.signatureEffect}，${description}` : description,
    battleEffects: [...(base.battleEffects ?? []), effect],
  }
}

function flatArmorPenetration(points: number, attackerStance?: StanceType, base?: TrialPartEffects) {
  const stance = attackerStance ? `${STANCE_META[attackerStance].name}架势` : ''
  return partEffect({ kind: 'FLAT_ARMOR_PENETRATION', points, attackerStance }, `${stance}常规外功固定破甲 +${points}`, base)
}

function percentArmorPenetration(percent: number, regularOuterOnly?: true, base?: TrialPartEffects) {
  return partEffect({ kind: 'ARMOR_PENETRATION', percent, regularOuterOnly },
    `${regularOuterOnly ? '常规外功' : '外功与绝技'}穿透 ${percent}% 护体防御`, base)
}

function fierceOuterDamage(percent: number, base?: TrialPartEffects) {
  return partEffect({ kind: 'OUTER_DAMAGE', attackerStance: 'FIERCE', percent }, `刚猛架势外功伤害 +${percent}%`, base)
}

function outerTrueDamage(amount: number, base?: TrialPartEffects) {
  return partEffect({ kind: 'OUTER_TRUE_DAMAGE', amount }, `常规外功附带 ${amount} 点真伤`, base)
}

function criticalDamage(percent: number, base?: TrialPartEffects) {
  return partEffect({ kind: 'CRIT_DAMAGE', percent }, `暴击伤害 +${percent}%`, base)
}

function outerComboChance(points: number, base?: TrialPartEffects) {
  return partEffect({ kind: 'OUTER_COMBO_CHANCE', points }, `连击率 +${points} 个百分点`, base)
}

const INN_FLASK_HEAL = 15
const ZUIXIAN_BLEED_EXTRA_ROUNDS = 1
const ZUIXIAN_COUNTER_PERCENT = 40
const JIANGNAN_FIERCE_DAMAGE_PERCENT = 12
const DAMO_PENETRATION_PERCENT = 15
const HUANGSHAN_POISON_BLEED_DAMAGE_PERCENT = 25
const HENGLIAN_REFLECT_DEF_PERCENT = 150
const HUANGHE_TRUE_DAMAGE_DEF_PERCENT = 10
const HUANGHE_WAVE = { kind: 'OUTER_AREA_DAMAGE', attackPercent: 80, chancePercent: 30, moveName: '翻江倒海', element: 'WATER' } as const satisfies BattleEffect
const POISON_DART = { kind: 'OUTER_FOLLOW_UP', trigger: 'OUTER_CAST', chancePercent: 50, powerRatio: 0.8, moveName: '暗器毒刺', hiddenWeapon: true,
  periodic: { status: 'dartPoison', attackPercent: 12, rounds: 2 } } as const satisfies BattleEffect
const DART_COUNTER = { kind: 'ON_DODGED_STRIKE', attackPercent: 120, moveName: '暗器回马枪', hiddenWeapon: true } as const satisfies BattleEffect
const CHANGBAI_HP_BONUS = 800
const CHANGBAI_ROUND_HEAL = 40
const CHANGBAI_SELF_HEAL_PERCENT = 50
const JIUYIN_LIFESTEAL_PERCENT = 20
const KONGMING_FOLLOW_UP_PERCENT = 45
const BAITUO_FAN_DODGE_POINTS = 8
const BAITUO_POISON_CRIT_POINTS = 18
const VENOM_BURST = { kind: 'POISON_BURST', stacks: 3, lostHpPercent: 25 } as const satisfies BattleEffect
const VENOM_ACC = { kind: 'PERIODIC_ON_HIT', rule: { status: 'venom', maxHpPercent: 4, rounds: 3, maxStacks: 3 } } as const satisfies BattleEffect
const LINGHU_COUNTER_PERCENT = 120
const LINGHU_DODGE_HEAL_PERCENT = 5
const LINGHU_DODGE_CAP = 75
const TIEZHANG_SHIELD_MULTIPLIER = 1.5
const QUANZHEN_SHIELD_PERCENT = 20
export const NILUAN_MARTIAL_FREEDOM = { setId: 'niluan_jiuyin', pieces: 6, name: '武道极境' } as const
export const CHAPTER_ONE_FINAL_STAGE = 30
export const CHAPTER_ONE_TITLE = '射雕·天下第一'
export const CHAPTER_ONE_STATUE_MAP = 'xiangyang_city'

export function announceChapterOneTitle(report: BattleReportDTO) {
  report.rewards = { ...(report.rewards ?? { qiExp: 0, silver: 0 }), title: CHAPTER_ONE_TITLE }
  report.events.push({
    round: report.events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', targetSlot: 'ALLY_MAIN',
    segments: [{ type: 'tag', text: `获授【${CHAPTER_ONE_TITLE}】，襄阳城立像`, tone: 'gold' }],
  })
}

export const TRIAL_SETS: TrialSetConfig[] = [
  {
    id: 'pomiao_caomang', name: '破庙蓑衣草莽套装', tier: 'green', chapter: 1,
    ...twoPieceStats({ hp: 120 },
      '受到野兽与草寇类普通攻击时，固定减免 8 点伤害',
      '【风雨夜行】雨天或黑夜时，自身行动速度提升 8%，与蓑草风雨衣取高',
      [
        { pieces: 4, effects: [{ kind: 'BANDIT_BEAST_REDUCTION', amount: 8 }] },
        { pieces: 6, effects: [{ kind: 'RAIN_NIGHT_SPEED', percent: 8 }] },
      ],
    ),
    parts: [
      S('WEAPON', '草莽劈柴刀', { atkBonus: 22, ...partStats({ hit: 2 }) }),
      S('HEAD', '破旧斗笠', { hpBonus: 80, ...partEffect({ kind: 'CONCEALMENT_REDUCTION', points: 5 }, '攻击隐蔽敌人时抵消至多 5 个百分点的隐蔽命中惩罚') }),
      S('ARMOR', '蓑草风雨衣', { defBonus: 18, hpBonus: 110,
        ...partEffect({ kind: 'RAIN_NIGHT_SPEED', percent: 8 }, '雨天或黑夜时出手速度 +8%，与套装取高') }),
      S('WRIST', '粗麻布护腕', { defBonus: 8, critBonus: 1 }),
      S('BELT', '草编麻绳带', { hpBonus: 60, ...partStats({ speed: 3 }) }),
      S('BOOTS', '生茧草鞋', { dodgeBonus: 1.5, ...partStats({ speed: 12 }) }),
      S('ACC', '古铜生锈钱', { attributeBonus: { luck: 3 }, patrolSilverBonus: 5 }),
    ],
  },
  {
    id: 'zuixian_xingshang', name: '醉仙短打行商套装', tier: 'green', chapter: 1,
    bonuses: {
      two: formatBattleStatBonuses({ hit: 3 }),
      four: `自身外功招式造成的流血效果持续回合数 +${ZUIXIAN_BLEED_EXTRA_ROUNDS}`,
      six: `【市井油滑】闪避后立即反击攻击者，造成攻击力 ${ZUIXIAN_COUNTER_PERCENT}% 的穿刺伤害，按外功防御和护盾结算`,
    },
    battleBonuses: [
      { pieces: 2, effects: [statEffect({ hit: 3 })] },
      { pieces: 4, effects: [{ kind: 'OUTER_BLEED_DURATION', extraRounds: ZUIXIAN_BLEED_EXTRA_ROUNDS }] },
      { pieces: 6, effects: [{ kind: 'DODGE_COUNTER', stat: 'atk', percent: ZUIXIAN_COUNTER_PERCENT, category: 'phys' }] },
    ],
    parts: [
      S('WEAPON', '酒肆镔铁刺', { atkBonus: 32, ...flatArmorPenetration(5) }),
      S('HEAD', '行商布头巾', { hpBonus: 120, ...partStats({ mp: 30 }) }),
      S('ARMOR', '青色短打马褂', { defBonus: 25, hpBonus: 160 }),
      S('WRIST', '熟皮缠手', { atkBonus: 10, ...partStats({ parry: 2 }) }),
      S('BELT', '粗皮褡裢', { hpBonus: 90, backpackSlots: 3, signatureEffect: '随身背包增加 3 格' }),
      S('BOOTS', '快步布底靴', { dodgeBonus: 2, ...partStats({ speed: 16 }) }),
      S('ACC', '雕花小酒葫芦', {
        signatureEffect: `自身行动结束时回复 ${INN_FLASK_HEAL} 点气血`,
        battleEffects: [{ kind: 'HEAL', trigger: 'ACTION_END', target: 'SELF', unit: 'HP', amount: INN_FLASK_HEAL }],
      }),
    ],
  },
  {
    id: 'fahua_zuyi', name: '法华行脚缁衣套装', tier: 'green', chapter: 1,
    ...twoPieceStats({ def: 30 },
      '招架成功时，反震实际损失气血的 20%',
      '【禅心坚毅】气血跌破 30% 且存活时，获得最大气血 15% 的护体金光，持续 2 回合',
      [
        { pieces: 4, effects: [{ kind: 'PARRY_REFLECT', percent: 20 }] },
        { pieces: 6, effects: [{ kind: 'LOW_HP_SHIELD', belowHpPercent: 30, maxHpPercent: 15, rounds: 2 }] },
      ],
    ),
    parts: [
      S('WEAPON', '行脚枣木棍', { atkBonus: 42, ...partStats({ parry: 5 }) }),
      S('HEAD', '灰布僧帽', { defBonus: 15, ...partStats({ mp: 50 }) }),
      S('ARMOR', '百衲缁衣', { defBonus: 36, hpBonus: 220 }),
      S('WRIST', '檀木念珠手串', partEffect({ kind: 'INNER_PRESSURE_REDUCTION', percent: 10 }, '内力压制增伤降低 10%', partStats({ mp: 40 }))),
      S('BELT', '粗布罗汉带', { hpBonus: 140, ...partStats({ parryAbsorb: 4 }) }),
      S('BOOTS', '绑腿僧鞋', { ...partStats({ agi: 18, speedPercent: 3 }) }),
      S('ACC', '清心菩提子', {
        ...partEffect({ kind: 'CONTROL_RESIST', chancePercent: 15, statuses: ['SEAL', 'STUN'] }, '抵抗封穴与点穴眩晕的概率 +15 个百分点'),
      }),
    ],
  },
  {
    id: 'jiangnan_qiguai', name: '江南七怪降魔套装', tier: 'blue', chapter: 1,
    ...twoPieceStats({ atk: 45, str: 4 },
      `自身对【刚猛】目标造成的伤害提升 ${JIANGNAN_FIERCE_DAMAGE_PERCENT}%`,
      '【义薄云天】伙伴合击伤害 +25%。每场首次受到致命伤时保留 1 点气血，不死意志持续至本回合末',
      [
        { pieces: 4, effects: [{ kind: 'TARGET_STANCE_DAMAGE', stance: 'FIERCE', percent: JIANGNAN_FIERCE_DAMAGE_PERCENT }] },
        { pieces: 6, effects: [{ kind: 'COMPANION_DAMAGE', percent: 25 }, { kind: 'FIRST_LETHAL_SAVE', guardRound: true }] },
      ],
    ),
    parts: [
      S('WEAPON', '沉铁熟铜杖', { atkBonus: 65, ...fierceOuterDamage(8, flatArmorPenetration(15)) }),
      S('HEAD', '蝙蝠乌纱笠', { hpBonus: 260, ...partEffect({ kind: 'NIGHT_VISION' }, '免除夜战命中惩罚', partStats({ hit: 6 })) }),
      S('ARMOR', '七怪麻皮护甲', { defBonus: 52, hpBonus: 380 }),
      S('WRIST', '沉铁护臂', { atkBonus: 18, ...partStats({ parry: 4 }) }),
      S('BELT', '嵌铁重皮带', { hpBonus: 200, ...partStats({ str: 3 }) }),
      S('BOOTS', '蹑云夜行飞靴', { dodgeBonus: 4, ...partStats({ speed: 26 }) }),
      S('ACC', '柯公淬毒铁菱', {
        ...partEffect({ kind: 'PERIODIC_ON_HIT', regularOuterOnly: true, rule: { status: 'dartBleed', maxHpPercent: 3, chancePercent: 25, rounds: 2 } },
          '常规外功命中后有 25% 概率附加毒菱流血，持续 2 回合，每回合损失目标最大气血的 3%'),
      }),
    ],
  },
  {
    id: 'damo_qibing', name: '大漠弯弓铁骑套装', tier: 'blue', chapter: 1,
    ...twoPieceStats({ speed: 25 },
      `常规外功无视目标 ${DAMO_PENETRATION_PERCENT}% 护甲，与武学自带穿透取较高值`,
      '【鹰击长空】暴击时推进下一次行动 20%，常规出手暴击时有 30% 概率追加一次无消耗轻功射击',
      [
        { pieces: 4, effects: [{ kind: 'ARMOR_PENETRATION', percent: DAMO_PENETRATION_PERCENT, regularOuterOnly: true }] },
        { pieces: 6, effects: [{ kind: 'CRIT_ACTION', advancePercent: 20, followUpChance: 30, moveName: '鹰击长空', powerRatio: 1 }] },
      ],
    ),
    parts: [
      S('WEAPON', '大漠桦木角弓', { atkBonus: 78, critBonus: 6, ...partEffect({ kind: 'OPENING_PRIORITY', chancePercent: 15 }, '15% 概率抢占开局先手', criticalDamage(15)) }),
      S('HEAD', '羊皮雪翎帽', { hpBonus: 320,
        ...partEffect({ kind: 'ELEMENT_RESISTANCE', elements: ['COLD'], percent: 10 }, '受到阴寒伤害降低 10%',
          partEffect({ kind: 'PERIODIC_REDUCTION', category: 'poison', percent: 10 }, '受到毒伤降低 10%')),
      }),
      S('ARMOR', '双层熟牛皮袄', { defBonus: 65, hpBonus: 460 }),
      S('WRIST', '马革缠臂带', { atkBonus: 22, ...partStats({ agi: 4 }) }),
      S('BELT', '狼牙铜扣皮带', { hpBonus: 240, critBonus: 3 }),
      S('BOOTS', '沙海踏雁长靴', { ...partStats({ agi: 32 }), signatureEffect: '大漠行程移动速度 +5%，当地打坐真气收益 +5 个百分点' }),
      S('ACC', '苍狼白鹿骨佩', partEffect({ kind: 'TEAM_OPENING_SPEED', percent: 10, rounds: 3 }, '战斗前 3 回合，全体出手速度提高 10%')),
    ],
  },
  {
    id: 'huangshan_kulou', name: '荒山煞风骷髅套装', tier: 'blue', chapter: 1,
    ...twoPieceStats({ crit: 5 },
      '命中时 35% 概率施加 1 回合阴寒迟缓，目标下回合速度降低 20%',
      `【九阴残煞】自身对中毒或流血目标造成的伤害提升 ${HUANGSHAN_POISON_BLEED_DAMAGE_PERCENT}%`,
      [
        { pieces: 4, effects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'SLOW', chancePercent: 35, percent: 20, rounds: 1 } }] },
        { pieces: 6, effects: [{ kind: 'POISON_BLEED_DAMAGE', percent: HUANGSHAN_POISON_BLEED_DAMAGE_PERCENT }] },
      ],
    ),
    parts: [
      S('WEAPON', '惨白骨刺匕', { atkBonus: 92, ...outerTrueDamage(25) }),
      S('HEAD', '鬼面青铜面具', { hpBonus: 380, signatureEffect: '侠义事件的得失幅度 +10%，四舍五入，侠义在 −1000 至 1000 内结算' }),
      S('ARMOR', '玄色死灵夜行袍', { defBonus: 78, hpBonus: 550 }),
      S('WRIST', '白骨扣腕甲', { atkBonus: 26, ...criticalDamage(12) }),
      S('BELT', '漆黑兽皮束腰', { hpBonus: 290, dodgeBonus: 3 }),
      S('BOOTS', '寂然无声履', { ...partStats({ agi: 38 }), signatureEffect: '未蒙面鉴宝时，避开盘查的概率 +5 个百分点' }),
      S('ACC', '镂空头骨挂坠', { ...partEffect({ kind: 'KILL_QI_GAIN', percent: 5 }, '亲自击败敌人时，汲取目标已损气血的 5% 转化为真气') }),
    ],
  },
  {
    id: 'henglian_tongjia', name: '横练铜甲摧心套装', tier: 'purple', chapter: 1,
    ...twoPieceStats({ def: 80, con: 8 },
      `每场战斗首次受到致命一击时锁血至 1 点气血，反震自身护体防御的 ${HENGLIAN_REFLECT_DEF_PERCENT}%`,
      '【铁壁铜尸】护体防御 +25%，受击时有 30% 概率降低攻击者 20% 攻击，持续 1 回合',
      [
        { pieces: 4, effects: [{ kind: 'FIRST_LETHAL_SAVE', reflectDefensePercent: HENGLIAN_REFLECT_DEF_PERCENT }] },
        { pieces: 6, effects: [
          statEffect({ defPercent: 25 }),
          { kind: 'ON_RECEIVE_STATUS', rule: { status: 'ATTACK_DOWN', chancePercent: 30, percent: 20, rounds: 1 } },
        ] },
      ],
    ),
    parts: [
      S('WEAPON', '乌金摧心匕', { atkBonus: 125, ...outerTrueDamage(45) }),
      S('HEAD', '铜铸护额发箍', {
        hpBonus: 520, ...partEffect({ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 18, criticalOnly: true }, '受到暴击伤害降低 18%'),
      }),
      S('ARMOR', '赤炼玄铁铜锁甲', { defBonus: 110, hpBonus: 780,
        ...partEffect({ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 10 }, '金钟护体：护盾吸收前减免 10% 物理伤害'),
      }),
      S('WRIST', '重铜覆手护臂', { defBonus: 35, atkBonus: 30, ...partStats({ parry: 6 }) }),
      S('BELT', '兽首吞口铜腰带', { hpBonus: 420, ...partStats({ con: 6 }) }),
      S('BOOTS', '沉铁碾地长靴', { ...partEffect({ kind: 'ABSOLUTE_PARRY', chancePercent: 5 }, '普通招架失败时有 5% 概率绝对格挡', partStats({ agi: 42 })) }),
      S('ACC', '陈玄风的人皮刺绣残片', {
        ...partStats({ mp: 180 }), masteryDiscount: { percent: 10 }, signatureEffect: '参悟武学所需真气降低 10%',
      }),
    ],
  },
  {
    id: 'huanghe_sigui', name: '黄河四鬼丧门套装', tier: 'blue', chapter: 2,
    ...twoPieceStats({ atk: 60 },
      '释放连击招式时，每次连击递增 10% 伤害',
      '【水鬼缠身】命中后 40% 概率降低目标 15% 防御与闪避，持续 2 回合',
      [
        { pieces: 4, effects: [{ kind: 'OUTER_COMBO_DAMAGE', percent: 10, perHit: true }] },
        { pieces: 6, effects: [{ kind: 'ON_HIT_STATUS', chancePercent: 40, rules: [
          { status: 'DEFENSE_DOWN', percent: 15, rounds: 2 }, { status: 'DODGE_DOWN', percent: 15, rounds: 2 },
        ] }] },
      ],
    ),
    parts: [
      S('WEAPON', '丧门分水鬼头刀', { atkBonus: 110, ...outerComboChance(5) }),
      S('HEAD', '皮扣抹额巾', { hpBonus: 480, ...partStats({ hit: 5 }) }),
      S('ARMOR', '水牛皮硬鳞甲', { defBonus: 95, hpBonus: 680 }),
      S('WRIST', '分水铜环护手', { atkBonus: 28, ...partEffect({ kind: 'WATER_BATTLE_DAMAGE', percent: 10 }, '水战出招伤害 +10%', flatArmorPenetration(12)) }),
      S('BELT', '黑索束腰带', { hpBonus: 360, ...partStats({ agi: 5 }) }),
      S('BOOTS', '泥沼疾行水靴', { ...partStats({ agi: 48 }), signatureEffect: '水路和黑沼行程的地形额外耗时减半' }),
      S('ACC', '黄河四鬼路引令', { signatureEffect: '巡历遭遇频率 +10%，约每 27 分 16 秒遇敌一次' }),
    ],
  },
  {
    id: 'jinwang_fuxiu', name: '金国王府锦绣套装', tier: 'purple', chapter: 2,
    ...twoPieceStats({ speed: 35, crit: 6 },
      '暴击时扣除目标 15 点怒气，并使自身怒气 +15',
      '【富贵逼人】绝技伤害 +30%；受击时 20% 概率金丝格挡，减免 50% 伤害',
      [
        { pieces: 4, effects: [{ kind: 'CRIT_RAGE', amount: 15 }] },
        { pieces: 6, effects: [{ kind: 'ULT_DAMAGE', percent: 30 }, { kind: 'PHYSICAL_BLOCK', chancePercent: 20, percent: 50, sharedRoll: 'goldThread' }] },
      ],
    ),
    parts: [
      S('WEAPON', '金丝镂空雁翎刀', { atkBonus: 168, critBonus: 8, ...partStats({ speed: 12 }) }),
      S('HEAD', '金冠紫玉束发簪', { hpBonus: 580, ...partStats({ intStat: 5 }) }),
      S('ARMOR', '织金团龙云锦袍', { defBonus: 120, hpBonus: 890,
        ...partEffect({ kind: 'PHYSICAL_BLOCK', chancePercent: 20, percent: 50, label: '金丝卸力', outerOnly: true, sharedRoll: 'goldThread' },
          '受到外功物伤时有 20% 概率在护盾前减伤 50%，与套装同击只判定一次') }),
      S('WRIST', '绣金护腕', { atkBonus: 35, critBonus: 5 }),
      S('BELT', '白玉玛瑙垂带', { hpBonus: 480, attributeBonus: { luck: 6 }, marketDiscount: 10, signatureEffect: '市井一口价商品以纹银九折购买，同类折扣取高' }),
      S('BOOTS', '踏云皂金官靴', { ...partStats({ agi: 55 }), signatureEffect: '江湖地图行程移动速度 +10%' }),
      S('ACC', '赵王府小王爷腰牌', { marketDiscount: 10, signatureEffect: '市井一口价商品以纹银九折购买，同类折扣取高' }),
    ],
  },
  {
    id: 'huanghe_nilang', name: '黄河逆浪分水套装', tier: 'purple', chapter: 2,
    ...twoPieceStats({ atk: 90 },
      `常规外功附带相当于自身护体防御 ${HUANGHE_TRUE_DAMAGE_DEF_PERCENT}% 的真伤`,
      '【翻江倒海】普攻 30% 概率触发全屏水浪，对敌方全体造成 80% 攻击力溅射',
      [
        { pieces: 4, effects: [{ kind: 'OUTER_TRUE_DAMAGE', defensePercent: HUANGHE_TRUE_DAMAGE_DEF_PERCENT }] },
        { pieces: 6, effects: [HUANGHE_WAVE] },
      ],
    ),
    parts: [
      S('WEAPON', '点钢分水重铁桨', { atkBonus: 195, ...flatArmorPenetration(30, undefined, partStats({ parry: 8 })) }),
      S('HEAD', '分水青龙头盔', { hpBonus: 680, defBonus: 25 }),
      S('ARMOR', '黑蛟皮扎甲', { defBonus: 140, hpBonus: 1050 }),
      S('WRIST', '钢鳞覆臂护手', { atkBonus: 42, ...partStats({ str: 7 }) }),
      S('BELT', '怒涛兽皮环带', { hpBonus: 560, ...partStats({ parry: 5 }) }),
      S('BOOTS', '逆浪分波重靴', partEffect({ kind: 'CONTROL_IMMUNITY', statuses: ['FREEZE', 'FALL_IN_WATER'] }, '免疫落水和冻结', partStats({ agi: 62 }))),
      S('ACC', '深潭辟水玄珠', {
        idleQiPerHour: 300,
        ...partEffect({ kind: 'ELEMENT_RESISTANCE', elements: ['WATER', 'COLD'], percent: 30 }, '水系与阴寒伤害 -30%，真气每小时 +300'),
      }),
    ],
  },
  {
    id: 'qianshou_panguan', name: '千手夺魄判官套装', tier: 'purple', chapter: 2,
    ...twoPieceStats({ hit: 8, crit: 6 },
      `【暗器毒刺】施展常规外功时有 ${POISON_DART.chancePercent}% 概率以 ${Math.round(POISON_DART.powerRatio * 100)}% 威力追加毒刺，命中附带 ${POISON_DART.periodic.rounds} 回合针毒，每回合损失攻击力的 ${POISON_DART.periodic.attackPercent}%`,
      `【天罗地网】敌方闪避自己的招式时，对其追加攻击力 ${DART_COUNTER.attackPercent}% 的物理伤害，该伤害无法闪避`,
      [{ pieces: 4, effects: [POISON_DART] }, { pieces: 6, effects: [DART_COUNTER] }],
    ),
    parts: [
      S('WEAPON', '镔铁点穴判官笔', { atkBonus: 150,
        ...partEffect({ kind: 'ON_HIT_STATUS', rule: { status: 'STUN', chancePercent: 8, rounds: 1 } },
          '命中有 8% 概率点穴眩晕目标 1 回合', partStats({ hit: 10 })),
      }),
      S('HEAD', '判官勾魂冠', { hpBonus: 750, ...partEffect({ kind: 'HIDDEN_WEAPON_DAMAGE', percent: 15 }, '暗器伤害 +15%') }),
      S('ARMOR', '藏珍百褶夜行皮衣', { defBonus: 155, hpBonus: 1180 }),
      S('WRIST', '淬毒护腕钢甲', { atkBonus: 48, ...criticalDamage(15) }),
      S('BELT', '暗囊排挂皮带', { hpBonus: 620, ...partEffect({ kind: 'HIDDEN_WEAPON_CAPACITY', slots: 2 }, '暗器携带上限提高至 2 件') }),
      S('BOOTS', '无影追魂尖头履', partEffect({ kind: 'OPENING_PRIORITY', chancePercent: 15 }, '15% 概率抢占开局先手', partStats({ agi: 70 }))),
      S('ACC', '千手夺魄透骨钉', {
        ...partEffect({ kind: 'ACTION_START_TRUE_DAMAGE', amount: 280 }, '自身行动开始时，对随机存活敌人造成 280 点真伤'),
      }),
    ],
  },
  {
    id: 'xiyu_mizong', name: '西域密宗金刚套装', tier: 'purple', chapter: 2,
    ...twoPieceStats({ mp: 300, def: 100 },
      '受到外功暴击时，反弹敌方攻击力 25% 的朱砂血毒伤害',
      '【密宗金刚身】负面状态持续时间减少 1 回合，气血高于 80% 时免疫控制',
      [
        { pieces: 4, effects: [{ kind: 'REFLECT_CRIT_POISON', percent: 25 }] },
        { pieces: 6, effects: [
          { kind: 'CONTROL_IMMUNITY', aboveHpPercent: 80 },
          { kind: 'STATUS_DURATION_REDUCTION', rounds: 1 },
        ] },
      ],
    ),
    parts: [
      S('WEAPON', '密宗降魔双铜钹', { atkBonus: 235,
        ...partEffect({ kind: 'PARRY_REFLECT', percent: 15 }, '招架成功时，反震实际损失气血的 15%', partStats({ parry: 12 })),
      }),
      S('HEAD', '金顶黄绫僧帽', { hpBonus: 840, ...partEffect({ kind: 'PERIODIC_REDUCTION', category: 'poison', percent: 25 }, '受到毒伤降低 25%') }),
      S('ARMOR', '西域朱砂金丝袈裟', { defBonus: 178, hpBonus: 1350 }),
      S('WRIST', '金刚密宗伏魔腕', { defBonus: 55, atkBonus: 50, ...partEffect({ kind: 'PARRY_REFLECT', percent: 10 }, '招架后反震实际损失气血的 10%') }),
      S('BELT', '密宗经文法带', { hpBonus: 700, ...partStats({ mp: 240 }) }),
      S('BOOTS', '高山厚底踏雪僧靴', { ...partEffect({ kind: 'CONTROL_IMMUNITY', statuses: ['KNOCKBACK'] }, '免疫击退', partStats({ agi: 76 })) }),
      S('ACC', '密宗赤红朱砂印', {
        ...partEffect({ kind: 'TECHNIQUE_DAMAGE', forms: ['PALM'], percent: 18 }, '掌法伤害 +18%',
          partEffect({ kind: 'PERIODIC_ON_HIT', rule: { status: 'cinnabar', rounds: 3, attackPercent: 8 } },
            '攻击命中附带 3 回合朱砂血毒，每回合损失攻击力的 8%')),
      }),
    ],
  },
  {
    id: 'changbai_canxian', name: '长白参仙药灵套装', tier: 'purple', chapter: 2,
    bonuses: {
      two: `气血上限 +${CHANGBAI_HP_BONUS}，自身装备或心法触发的回合末回血 +${CHANGBAI_SELF_HEAL_PERCENT}%`,
      four: '回合末恢复 3% 最大气血与 2% 最大内力，气血回复可受自愈加成',
      six: '【生生不息】受到致死攻击时满血复活（每场 1 次）',
    },
    battleBonuses: [
      { pieces: 2, effects: [statEffect({ hp: CHANGBAI_HP_BONUS }), { kind: 'SELF_ROUND_HEAL_BONUS', percent: CHANGBAI_SELF_HEAL_PERCENT }] },
      { pieces: 4, effects: [
        { kind: 'HEAL', trigger: 'ROUND_END', target: 'SELF', unit: 'MAX_HP_PERCENT', amount: 3 },
        { kind: 'ROUND_END_MP_RECOVERY', percent: 2 },
      ] },
      { pieces: 6, effects: [{ kind: 'FIRST_LETHAL_SAVE', revive: true }] },
    ],
    parts: [
      S('WEAPON', '子母追魂夺命枪', { atkBonus: 265, critBonus: 10, ...flatArmorPenetration(35) }),
      S('HEAD', '老参根结赤玉冠', { hpBonus: 950, patrolQiBonus: 8 }),
      S('ARMOR', '长白青缎貂皮风氅', {
        defBonus: 198, hpBonus: 1550,
        signatureEffect: `回合末回复自身 ${CHANGBAI_ROUND_HEAL} 点气血`,
        battleEffects: [{ kind: 'HEAL', trigger: 'ROUND_END', target: 'SELF', unit: 'HP', amount: CHANGBAI_ROUND_HEAL }],
      }),
      S('WRIST', '雪蚕丝裹臂', { atkBonus: 58, ...partStats({ agi: 10 }) }),
      S('BELT', '药囊百草蟒皮带', { hpBonus: 790, backpackSlots: 5,
        ...partEffect({ kind: 'PERIODIC_REDUCTION', category: 'poison', percent: 35 }, '受到毒伤降低 35%，随身背包增加 5 格') }),
      S('BOOTS', '翻山绝壁飞跃靴', { dodgeBonus: 6, ...partStats({ agi: 85 }) }),
      S('ACC', '参仙宝蛇真血玉佩', partEffect({ kind: 'LOW_HP_FURY', statusName: '蛇血狂怒', belowHpPercent: 20, attackPercent: 40, rounds: 2 },
        '每战首次气血跌破 20% 时攻击 +40%，持续 2 回合', partStats({ hpPercent: 15 }))),
    ],
  },
  {
    id: 'baituo_zheshan', name: '白驼折扇风流套装', tier: 'purple', chapter: 3,
    bonuses: {
      two: formatBattleStatBonuses({ dodge: BAITUO_FAN_DODGE_POINTS, speed: 50 }),
      four: '成功闪避后，下一次可暴击的出手必定暴击',
      six: '【灵蛇诡道】35% 概率无视目标一切招架与护盾，造成真实伤害',
    },
    battleBonuses: [
      { pieces: 2, effects: [statEffect({ dodge: BAITUO_FAN_DODGE_POINTS, speed: 50 })] },
      { pieces: 4, effects: [{ kind: 'DODGE_GUARANTEED_CRIT' }] },
      { pieces: 6, effects: [{ kind: 'TRUE_STRIKE', chancePercent: 35, moveName: '灵蛇诡道' }] },
    ],
    parts: [
      S('WEAPON', '白玉描金折扇', { atkBonus: 290, dodgeBonus: 8, ...partStats({ speed: 18 }) }),
      S('HEAD', '西域雪蚕束发带', { hpBonus: 1080, ...partStats({ intStat: 8 }) }),
      S('ARMOR', '月白风流锦缎衫', { defBonus: 220, hpBonus: 1750 }),
      S('WRIST', '镂空银丝护腕', { atkBonus: 66, critBonus: 8 }),
      S('BELT', '软金嵌玉束带', { hpBonus: 880, ...partStats({ agi: 10 }) }),
      S('BOOTS', '踏水无痕鹿皮靴', partEffect({ kind: 'COMPANION_ASSIST_CHANCE', points: 8 },
        '额外伙伴合击机会 +8 个百分点', partStats({ agi: 95 }))),
      S('ACC', '白驼少主翡翠折扇坠', partEffect({ kind: 'FEMALE_ATTACKER_DEFENSE', parryPoints: 15, dodgePoints: 10 },
        '面对女性来袭者时，本次招架率 +15、普通闪避率 +10 个百分点。闪避沿用自身上限')),
    ],
  },
  {
    id: 'taihu_shuizhai', name: '太湖水寨波澜套装', tier: 'purple', chapter: 3,
    ...twoPieceStats({ def: 120, parry: 10 },
      '招架成功时，恢复自身护体防御 50% 的气血',
      '【波澜不惊】受击时回复实际损失气血 20% 的内力；怒气积攒 +30%',
      [
        { pieces: 4, effects: [{ kind: 'PARRY_HEAL', defensePercent: 50 }] },
        { pieces: 6, effects: [{ kind: 'HIT_MP_RECOVERY', hpLossPercent: 20 }, { kind: 'RAGE_GAIN_PERCENT', percent: 30 }] },
      ],
    ),
    parts: [
      S('WEAPON', '七宝烂银分水枪', {
        atkBonus: 220,
        ...partEffect({ kind: 'ELEMENT_DAMAGE', element: 'WATER', percent: 12 }, '水系伤害 +12%', partStats({ parry: 15 })),
      }),
      S('HEAD', '浪里白条银鳞盔', { hpBonus: 1200, defBonus: 35 }),
      S('ARMOR', '太湖绿罗水战锁子甲', { defBonus: 245, hpBonus: 1980 }),
      S('WRIST', '分波铁铸护臂', { atkBonus: 75, ...partEffect({ kind: 'PARRY_REFLECT', percent: 8 }, '招架时反震实扣气血的 8%') }),
      S('BELT', '蛟龙皮错金腰带', { hpBonus: 980, ...partStats({ parryAbsorb: 8 }) }),
      S('BOOTS', '踏波浪里飞', { ...partStats({ agi: 108 }), signatureEffect: '水路行程免去地形额外耗时' }),
      S('ACC', '归云庄太湖水令', { sectContributionBonus: 20, escortAttackPercent: 10,
        signatureEffect: '门派贡献收益 +20%，押镖与劫镖战斗攻击 +10%' }),
    ],
  },
  {
    id: 'jiamian_piaoping', name: '假面飘萍戏客套装', tier: 'blue', chapter: 3,
    ...twoPieceStats({ speed: 60 },
      '鬼市鉴宝费用 -50%，子时潜入不被卫兵发现',
      '【水上漂名不虚传】闪避率 +15 个百分点，每次成功闪避掉落 5 两纹银并在战报嘲讽敌人',
      [{ pieces: 6, effects: [statEffect({ dodge: 15 }), { kind: 'DODGE_SILVER', amount: 5 }] }],
    ),
    parts: [
      S('WEAPON', '空心空锈铁掌套', { atkBonus: 280,
        ...partEffect({ kind: 'SCARE_CREATURE', chancePercent: 50 }, '闯关开场有 50% 概率吓退普通草寇和野兽') }),
      S('HEAD', '唬人高顶八卦冠', { hpBonus: 900, signatureEffect: '未蒙面鉴宝时，避开盘查的概率 +30 个百分点' }),
      S('ARMOR', '宽袍大袖戏法袍', { defBonus: 160, hpBonus: 1400 }),
      S('WRIST', '暗藏机关弹簧护手', { atkBonus: 50, ...partEffect({ kind: 'HIDDEN_WEAPON_CHANCE', points: 15 }, '概率型暗器触发率 +15 个百分点') }),
      S('BELT', '挂满机关暗格带', { hpBonus: 720, backpackSlots: 8, signatureEffect: '随身背包增加 8 格' }),
      S('BOOTS', '空心轻木水上漂鞋', { ...partStats({ agi: 120 }) }),
      S('ACC', '裘千丈的杂耍烟雾丸',
        partEffect({ kind: 'FIRST_LETHAL_SAVE', retreatBattle: true }, '单人闯关耗尽其他保命后，遇到可防止的致死伤害时带队脱身，不计通关')),
    ],
  },
  {
    id: 'jiuyin_baigu', name: '九阴白骨阴煞套装', tier: 'orange', chapter: 3,
    ...twoPieceStats({ atk: 150, crit: 10 },
      `外功命中后回复实际扣除气血的 ${JIUYIN_LIFESTEAL_PERCENT}%`,
      '【九阴白骨爪·煞】绝技必定封穴眩晕 2 回合，且无法被普通轻功闪避',
      [
        { pieces: 4, effects: [{ kind: 'OUTER_LIFESTEAL', percent: JIUYIN_LIFESTEAL_PERCENT }] },
        { pieces: 6, effects: [{ kind: 'ON_HIT_STATUS', attack: 'ULT', unavoidable: true, rule: { status: 'STUN', rounds: 2 } }] },
      ],
    ),
    parts: [
      S('WEAPON', '玄铁百炼飞抓', { atkBonus: 385, critBonus: 12, ...flatArmorPenetration(60) }),
      S('HEAD', '黑发掩面银丝骨箍', {
        hpBonus: 1450, ...partEffect({ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 20, criticalOnly: true }, '受到暴击伤害降低 20%'),
      }),
      S('ARMOR', '素白裹尸阴风袍', { defBonus: 280, hpBonus: 2350, dodgeBonus: 8 }),
      S('WRIST', '九阴白骨缠臂甲', { atkBonus: 92, ...partEffect({ kind: 'OUTER_TRUE_CONVERSION', truePercent: 15, label: '阴劲真伤' }, '常规外功和同招连击的 15% 伤害转为阴劲真伤') }),
      S('BELT', '九阴梵文刺绣腰带', { hpBonus: 1180, ...partStats({ mp: 360 }) }),
      S('BOOTS', '夜行踏骨疾风靴', { ...partEffect({ kind: 'OPENING_PRIORITY', chancePercent: 15 }, '15% 概率抢占开局先手', partStats({ agi: 125 })) }),
      S('ACC', '梅超风贴身铜人像', {
        ...partEffect({ kind: 'PERIODIC_ON_HIT', attack: 'OUTER', rule: { status: 'boneTear', maxHpPercent: 5, chancePercent: 30, rounds: 2 } },
          '外功命中有 30% 概率施加 2 回合白骨撕裂，每回合扣目标最大气血 5% 的真伤'),
      }),
    ],
  },
  {
    id: 'canghai_kuanglan', name: '沧海狂澜风暴套装', tier: 'purple', chapter: 3,
    ...twoPieceStats({ atk: 180, str: 15 },
      '受到气血伤害时，额外获得受击基准 50% 的怒气（10 点）',
      '【乘风破浪】气血高于 50% 时，出招附带自身最大气血 5% 的物理震荡，受防御和护盾减免',
      [
        { pieces: 4, effects: [{ kind: 'HIT_RAGE', baseHitRagePercent: 50 }] },
        { pieces: 6, effects: [{ kind: 'STRIKE_PHYSICAL_DAMAGE', maxHpPercent: 5, aboveHpPercent: 50 }] },
      ],
    ),
    parts: [
      S('WEAPON', '百斤沉铁破浪巨锚', { atkBonus: 420, ...fierceOuterDamage(18, flatArmorPenetration(50)) }),
      S('HEAD', '避水青鲛头盔', { hpBonus: 1580, defBonus: 45 }),
      S('ARMOR', '沧海油布防水重甲', { defBonus: 310, hpBonus: 1800 }),
      S('WRIST', '覆海龙鳞铁护手', { atkBonus: 105, ...partStats({ str: 12 }) }),
      S('BELT', '翻江巨蟒束身带', { hpBonus: 1300, ...partStats({ parry: 12 }) }),
      S('BOOTS', '踏浪千钧防滑靴', { ...partEffect({ kind: 'CONTROL_RESIST', chancePercent: 25 }, '控制抵抗 +25 个百分点', partStats({ agi: 135 })) }),
      S('ACC', '东海鲛人定风珠', partEffect({ kind: 'COMPANION_TEAM_REDUCTION', percent: 10 }, '航行免疫海难，全体伙伴物伤和持续伤害减免 10%')),
    ],
  },
  {
    id: 'qimen_dunjia', name: '奇门遁甲易数套装', tier: 'orange', chapter: 3,
    ...twoPieceStats({ intStat: 25, mp: 600 },
      '受到流派克制伤害时，将克制效果反转为自身优势',
      '【奇门生克】每 2 回合封印敌方一个核心招式 1 回合，并降低敌方全体 20% 速度',
      [
        { pieces: 4, effects: [{ kind: 'REVERSE_STANCE_DEFENSE' }] },
        { pieces: 6, effects: [
          { kind: 'ROUND_ENEMY_STATUS', every: 2, leaderOnly: true, rule: { status: 'ULT_LOCK', rounds: 1 } },
          { kind: 'ROUND_ENEMY_STATUS', every: 2, rule: { status: 'SLOW', rounds: 1, percent: 20, nextRound: false } },
        ] },
      ],
    ),
    parts: [
      S('WEAPON', '九宫推演青竹杖', { atkBonus: 460, ...outerTrueDamage(80, partStats({ intStat: 15 })) }),
      S('HEAD', '八卦乾坤紫阳冠', { hpBonus: 1750, ...partEffect({ kind: 'OUTER_CHARGE_BREAK', stance: 'AGILE', chancePercent: 10 },
        '奇门架势常规外功命中正在蓄力的存活目标时，有 10% 概率打断蓄力', partStats({ intStat: 12 })) }),
      S('ARMOR', '水墨五行两仪鹤氅', { defBonus: 340, hpBonus: 2100, ...partEffect({ kind: 'HIT_REFLECTION', percent: 15 }, '受击反伤按实扣气血的 15% 结算') }),
      S('WRIST', '奇门机括连环护腕', { atkBonus: 118, ...partStats({ parry: 15 }) }),
      S('BELT', '河图洛书星宿腰带', { hpBonus: 1450, ...partStats({ mp: 480 }) }),
      S('BOOTS', '八卦迷踪踏云履', { dodgeBonus: 12, ...partStats({ agi: 150 }) }),
      S('ACC', '黄药师亲刻曲三铁八卦', {
        ...partStats({ intStat: 20 }), masteryDiscount: { percent: 30, sectId: 'taohua' }, signatureEffect: '参悟桃花岛武学所需真气降低 30%',
      }),
    ],
  },
  {
    id: 'kongming_wantong', name: '空明顽童玄素套装', tier: 'orange', chapter: 3,
    bonuses: {
      two: '出手速度 +60，连击率 +18%',
      four: `常规外功命中后有 ${KONGMING_FOLLOW_UP_PERCENT}% 概率追加一次同招外功`,
      six: '【左右互搏】常规外功后立即追加一次同招外功，基础伤害为原招的 80%',
    },
    battleBonuses: [
      { pieces: 2, effects: [statEffect({ speed: 60 }), { kind: 'OUTER_COMBO_CHANCE', points: 18 }] },
      { pieces: 4, effects: [{ kind: 'OUTER_FOLLOW_UP', chancePercent: KONGMING_FOLLOW_UP_PERCENT }] },
      { pieces: 6, effects: [{ kind: 'OUTER_FOLLOW_UP', chancePercent: 100, trigger: 'OUTER_CAST', damagePercent: 80 }] },
    ],
    parts: [
      S('WEAPON', '周伯通亲盘桃木剑', { atkBonus: 495, ...percentArmorPenetration(20, true, outerComboChance(15)) }),
      S('HEAD', '顽童挽髻破头巾', { hpBonus: 1900,
        ...partEffect({ kind: 'STATUS_DURATION_REDUCTION', controlOnly: true, scalePercent: 50 }, '控制持续时间减半，向下取整'),
      }),
      S('ARMOR', '粗葛补丁道人袍', { defBonus: 375, hpBonus: 3200, ...partEffect({ kind: 'INNER_PRESSURE_REDUCTION', percent: 20 }, '内力压制增伤降低 20%') }),
      S('WRIST', '麻布缠裹护手腕', { atkBonus: 130, ...partEffect({ kind: 'OUTER_COMBO_DAMAGE', percent: 25 }, '连击伤害 +25%') }),
      S('BELT', '随性草绳结腰带', { hpBonus: 1600, ...partStats({ agi: 15 }) }),
      S('BOOTS', '踏破铁鞋万年履', { dodgeBonus: 15, ...partStats({ agi: 165 }) }),
      S('ACC', '周伯通心爱促织笼', {
        ...partEffect({ kind: 'OPENING_ENEMY_STATUS', rule: { status: 'ULT_LOCK', rounds: 1 } }, '开战时封住敌方绝技和蓄力招式 1 回合'),
      }),
    ],
  },
  {
    id: 'bihai_chaosheng', name: '碧海潮生青玉套装', tier: 'orange', chapter: 3,
    ...twoPieceStats({ atk: 160, intStat: 30 },
      '命中时有 40% 概率封穴 1 回合，压制目标内功被动和蓄力',
      '【碧海潮生】释放绝技时，按自身内力上限的 15% 对敌方全体造成真伤，并降低存活目标 30% 攻击，持续 1 回合',
      [
        { pieces: 4, effects: [{ kind: 'ON_HIT_STATUS', rule: { status: 'SEAL', chancePercent: 40, rounds: 1 } }] },
        { pieces: 6, effects: [{ kind: 'ULT_AREA_TRUE_DAMAGE', maxMpPercent: 15, rule: { status: 'ATTACK_DOWN', percent: 30, rounds: 1 } }] },
      ],
    ),
    parts: [
      S('WEAPON', '东海万年碧玉箫', {
        atkBonus: 420,
        ...partEffect({ kind: 'TECHNIQUE_DAMAGE', stance: 'AGILE', percent: 30 },
          '奇门架势招式伤害 +30%，桃花岛真传配用时碧海潮生曲消耗怒气减半，音律出手绕过护盾并封穴 1 回合', outerTrueDamage(120)),
        signatureOwner: '黄药师 / 桃花岛真传',
        companionUse: { owners: ['huangyaoshi'], stance: 'AGILE', outerSkillId: 'luoying_zhang', ultimate: 'bihai_chaosheng' },
        resonance: { sectId: 'taohua', rank: 4, battleEffects: [
          { kind: 'ULT_RAGE_DISCOUNT', skillId: 'bihai_chaosheng', percent: 50 },
          { kind: 'GUARD_BYPASS', guard: 'SHIELD', forms: ['SOUND'] },
          { kind: 'ON_HIT_STATUS', matches: { forms: ['SOUND'] }, rule: { status: 'SEAL', rounds: 1 } },
        ] },
      }),
      S('HEAD', '碧玉雕花束发冠', { hpBonus: 1600, ...partStats({ intStat: 20 }) }),
      S('ARMOR', '青色织锦东邪长衫', { defBonus: 310, hpBonus: 2600,
        ...partEffect({ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 25, attackerStance: 'AGILE' }, '护盾吸收前减免 25% 奇门物理伤害'),
      }),
      S('WRIST', '落英神剑金丝护腕', { atkBonus: 145, ...partEffect({ kind: 'COMPANION_ASSIST_CHANCE', points: 15 }, '额外伙伴合击机会 +15 个百分点') }),
      S('BELT', '碧海青波垂丝带', { hpBonus: 1300, ...partStats({ mp: 600 }) }),
      S('BOOTS', '青玉踏波飞云靴', { ...partEffect({ kind: 'OPENING_PRIORITY', chancePercent: 20 }, '20% 概率抢占开局先手', partStats({ agi: 180 })) }),
      S('ACC', '黄药师亲调九花玉露丸宝匣', {
        patrolQiBonus: 10, breakthroughBonus: 20, signatureEffect: '突破成功率 +20 个百分点',
      }),
    ],
  },
  {
    id: 'baituo_yushe', name: '白驼驭蛇奇毒套装', tier: 'orange', chapter: 4,
    bonuses: {
      two: `攻击已中毒的目标时，本次暴击率 +${BAITUO_POISON_CRIT_POINTS} 个百分点，受暴击上限限制`,
      four: '受到致命伤时，将自身全部负面状态转移给敌方全体',
      six: '【万蛇噬骨】敌方毒素叠满 3 层时引爆，造成已损气血 25% 真实伤害',
    },
    battleBonuses: [
      { pieces: 2, effects: [{ kind: 'POISON_TARGET_CRIT', points: BAITUO_POISON_CRIT_POINTS }] },
      { pieces: 4, effects: [{ kind: 'TRANSFER_ON_LETHAL' }] },
      { pieces: 6, effects: [VENOM_BURST] },
    ],
    parts: [
      S('WEAPON', '金环赤练蛇骨杖', {
        atkBonus: 580, ...partEffect({ kind: 'PERIODIC_TICK_DAMAGE', category: 'poison', percent: 35 }, '自身施加的毒伤 +35%', partStats({ hit: 12 })),
      }),
      S('HEAD', '蛇皮兜鍪面甲', { hpBonus: 2300, ...partEffect({ kind: 'PERIODIC_REDUCTION', category: 'poison', percent: 50 }, '受到毒伤降低 50%') }),
      S('ARMOR', '百鳞避火蛇皮软铠', {
        defBonus: 445, hpBonus: 3950,
        ...partEffect({ kind: 'PERIODIC_REDUCTION', category: 'bleed', percent: 50 }, '受到流血伤害降低 50%',
          partEffect({ kind: 'PERIODIC_REDUCTION', status: 'firePoison', percent: 50 }, '受到火毒伤害降低 50%')),
      }),
      S('WRIST', '逆鳞缠腕铜护臂', { atkBonus: 160, critBonus: 12 }),
      S('BELT', '九节响尾蛇骨带', { hpBonus: 2000, ...partStats({ agi: 18 }) }),
      S('BOOTS', '无鳞潜沙踏雪靴', { dodgeBonus: 15, ...partStats({ agi: 195 }) }),
      S('ACC', '白驼山庄万毒雄黄令', {
        ...partEffect(VENOM_ACC, `攻击命中附加 ${VENOM_ACC.rule.rounds} 回合剧毒，每层每回合损失目标最大气血的 ${VENOM_ACC.rule.maxHpPercent}%，最多 ${VENOM_ACC.rule.maxStacks} 层`),
      }),
    ],
  },
  {
    id: 'hama_nimai', name: '蛤蟆逆脉天险套装', tier: 'orange', chapter: 4,
    ...twoPieceStats({ atk: 260, hp: 1500 },
      '将外功越过护盾的伤害吸收 30% 储为劲力，下次绝技命中时返还为物理伤害',
      '【蛤蟆绝杀】怒气和内力足够时蓄力 1 回合，释放 350% 威力的排山倒海·蛤蟆扑，穿透全部护体防御',
      [
        { pieces: 4, effects: [{ kind: 'STORE_INCOMING_DAMAGE', percent: 30 }] },
        { pieces: 6, effects: [{ kind: 'CHARGED_ULT', moveName: '排山倒海·蛤蟆扑', powerRatio: 3.5 }] },
      ],
    ),
    parts: [
      S('WEAPON', '白驼陨铁金蛇软剑', { atkBonus: 620, ...outerTrueDamage(150, flatArmorPenetration(40)) }),
      S('HEAD', '西域天蚕丝织面巾', { hpBonus: 2500, ...partEffect({ kind: 'STATUS_IMMUNITY', status: 'HIT_DOWN' }, '免疫致盲与刺眼造成的命中降低') }),
      S('ARMOR', '狂蟾逆鳞护体锦袍', { defBonus: 480, hpBonus: 4300, ...partEffect({ kind: 'HIT_REFLECTION', percent: 20 }, '蛤蟆蓄气：受击反伤按实扣气血的 20% 结算') }),
      S('WRIST', '陨铁重铸金刚腕', { atkBonus: 175, ...fierceOuterDamage(20) }),
      S('BELT', '天山玄冰雪玉带', { hpBonus: 2200, ...partStats({ mp: 750 }) }),
      S('BOOTS', '瞬息千里踏空靴', { dodgeBonus: 18, ...partStats({ agi: 210 }) }),
      S('ACC', '欧阳克折断的金骨折扇', partEffect({ kind: 'WOUNDED_DEFENSE_CRIT', defensePercent: 40, critPoints: 40 },
        '按已损气血比例提高护体防御和暴击率，最多 +40% 防御、+40 个百分点暴击率。暴击沿用 75% 上限')),
    ],
  },
  {
    id: 'qianying_mixing', name: '潜影密行斥候套装', tier: 'purple', chapter: 4,
    ...twoPieceStats({ crit: 12, hit: 10 },
      '处于后排或被护卫时，伤害 +25%',
      '【密室暗杀】首回合必定暴击，且首击 50% 转化为真实穿透',
      [
        { pieces: 4, effects: [{ kind: 'GUARDED_POSITION_DAMAGE', percent: 25 }] },
        { pieces: 6, effects: [{ kind: 'OPENING_ASSASSINATION', truePercent: 50 }] },
      ],
    ),
    parts: [
      S('WEAPON', '精钢三股托天叉', { atkBonus: 580, ...outerComboChance(10, partStats({ parry: 18 })) }),
      S('HEAD', '金兵百夫长精铁盔', { hpBonus: 2400, defBonus: 40 }),
      S('ARMOR', '暗影潜行锁子轻甲', { defBonus: 460, hpBonus: 4100 }),
      S('WRIST', '金丝镂花重臂铠', { atkBonus: 165, ...flatArmorPenetration(35) }),
      S('BELT', '暗格行军皮束带', { hpBonus: 2100, ...partEffect({ kind: 'HIDDEN_WEAPON_CAPACITY', slots: 2 }, '暗器携带上限翻倍至 2 件') }),
      S('BOOTS', '夜探密室踏雪无声靴', {
        signatureEffect: '单人闯关开场主动尝试撤退时，成功率 100%',
        battleEffects: [statEffect({ agi: 205 }), { kind: 'RETREAT_CHANCE', percent: 100 }],
      }),
      S('ACC', '曲三酒馆密室暗格铁八卦钥', { signatureEffect: '佩戴后在历练第 24 关的牛家密室可每日免费搜取 1 张上品武学残页' }),
    ],
  },
  {
    id: 'jiuwei_linghu', name: '九尾灵狐泥鳅套装', tier: 'orange', chapter: 4,
    bonuses: {
      two: '出手速度 +80，绝对闪避 +12%',
      four: `闪避后立即无消耗反击攻击者，造成身法 ${LINGHU_COUNTER_PERCENT}% 的真伤，每回合最多触发 1 次`,
      six: '【泥鳅游天】每回合开始时驱散自身 1 个控制状态，并使敌方本回合命中率降低 20 个百分点',
    },
    battleBonuses: [
      { pieces: 2, effects: [statEffect({ speed: 80 }), { kind: 'ABSOLUTE_DODGE', chancePercent: 12 }] },
      { pieces: 4, effects: [{ kind: 'DODGE_COUNTER', stat: 'agi', percent: LINGHU_COUNTER_PERCENT, category: 'true', oncePerRound: true }] },
      { pieces: 6, effects: [
        { kind: 'CLEANSE_CONTROL' },
        { kind: 'ROUND_ENEMY_STATUS', rule: { status: 'HIT_DOWN', percent: 20, rounds: 1 } },
      ] },
    ],
    parts: [
      S('WEAPON', '白玉算盘七星剑', { atkBonus: 660, ...flatArmorPenetration(60, 'AGILE', partStats({ agi: 25 })) }),
      S('HEAD', '灵狐雪白毛皮披肩冠', { hpBonus: 2700, dodgeBonus: 15 }),
      S('ARMOR', '泥鳅滑体白丝轻纱袍', {
        defBonus: 510, hpBonus: 4600, ...partEffect({ kind: 'PHYSICAL_BLOCK', chancePercent: 30, percent: 100, label: '滑开卸力' }, '受击时 30% 概率在扣盾前滑开本次物理伤害'),
      }),
      S('WRIST', '灵狐白玉缠腕', {
        atkBonus: 190, ...partEffect({ kind: 'DODGE_COUNTER', stat: 'agi', percent: LINGHU_COUNTER_PERCENT, category: 'true', oncePerRound: true, chancePercent: 18 },
          `成功闪避后有 18% 概率反击本次攻击者，造成身法 ${LINGHU_COUNTER_PERCENT}% 的真伤，与灵狐四件套共用回合次数`),
      }),
      S('BELT', '河洛九宫织金带', { hpBonus: 2400, ...partStats({ intStat: 20 }) }),
      S('BOOTS', '踏泥不沉轻灵狐步履', { ...partEffect({ kind: 'DODGE_CAP', percent: LINGHU_DODGE_CAP }, '闪避上限提升至 75%',
        partEffect({ kind: 'SWAMP_DODGE', points: 25 }, '在黑沼与沼泽地形中闪避 +25 个百分点', partStats({ agi: 230 }))) }),
      S('ACC', '瑛姑贴身喂养九尾灵狐令', {
        signatureEffect: `成功闪避后回复自身最大气血的 ${LINGHU_DODGE_HEAL_PERCENT}%`,
        extra: `闪避上限提升至 ${LINGHU_DODGE_CAP}%`,
        battleEffects: [
          { kind: 'DODGE_CAP', percent: LINGHU_DODGE_CAP },
          { kind: 'HEAL', trigger: 'DODGE', target: 'SELF', unit: 'MAX_HP_PERCENT', amount: LINGHU_DODGE_HEAL_PERCENT },
        ],
      }),
    ],
  },
  {
    id: 'tiezhang_kaishan', name: '铁掌开山踏浪套装', tier: 'orange', chapter: 4,
    ...twoPieceStats({ atk: 220, str: 30 },
      '对带护盾或处于太极姿态的目标造成暴击时，本次暴击伤害翻倍',
      '【铁掌开山】施展常规外功时有 35% 概率向敌方前排追加 220% 威力的不可招架轰击，命中使目标攻击降低 30%，持续 1 回合',
      [
        { pieces: 4, effects: [{ kind: 'GUARDED_TARGET_CRIT_DAMAGE', multiplier: 2 }] },
        { pieces: 6, effects: [{
          kind: 'OUTER_FOLLOW_UP', trigger: 'OUTER_CAST', chancePercent: 35, powerRatio: 2.2, front: true, noParry: true, moveName: '铁掌震碎',
          status: { status: 'ATTACK_DOWN', percent: 30, rounds: 1 },
        }] },
      ],
    ),
    parts: [
      S('WEAPON', '玄铁千钧开山重掌套', {
        atkBonus: 520,
        ...partEffect(
          { kind: 'OUTER_SHIELD_REND', multiplier: TIEZHANG_SHIELD_MULTIPLIER },
          `常规外功消耗 ${TIEZHANG_SHIELD_MULTIPLIER} 倍盾值`,
          fierceOuterDamage(25, flatArmorPenetration(65)),
        ),
      }),
      S('HEAD', '铁掌帮主青铜虎首盔', { hpBonus: 2900, ...partStats({ atk: 60 }) }),
      S('ARMOR', '黑金重锻千层铁鳞铠', { defBonus: 380, hpBonus: 3500, ...partEffect({ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 15 }, '硬气功：护盾吸收前减免 15% 物理伤害') }),
      S('WRIST', '铁掌破石重甲臂', { atkBonus: 210, ...criticalDamage(25) }),
      S('BELT', '湘西黑金猛虎腰带', { hpBonus: 2600, ...partStats({ str: 25 }) }),
      S('BOOTS', '水上漂铁掌飞渡靴', { ...partStats({ agi: 245, speed: 30 }) }),
      S('ACC', '裘千仞亲传铁掌帮掌门指环', {
        ...partEffect({ kind: 'ON_HIT_STATUS', attackerStance: 'FIERCE', rule: { status: 'DEFENSE_DOWN', percent: 20, rounds: 3, maxStacks: 5 } },
          '刚猛命中使目标防御降低 20%，持续 3 回合，最多 5 层'),
      }),
    ],
  },
  {
    id: 'xizheng_jindao', name: '西征金刀大汗套装', tier: 'orange', chapter: 5,
    bonuses: {
      two: '全队外功攻击 +200，气血上限 +2000',
      four: '击败敌人后，全员回复 15% 气血并增加 30 怒气',
      six: '【一代天骄】上阵郭靖时，其合击概率提升至 100%，追击伤害 150%',
    },
    battleBonuses: [
      { pieces: 2, effects: [{ kind: 'TEAM_STATS', stats: { atk: 200, hp: 2000 } }] },
      { pieces: 4, effects: [{ kind: 'TEAM_KILL_RECOVERY', hpPercent: 15, rage: 30 }] },
      { pieces: 6, effects: [{ kind: 'GUOJING_COMBO', attackPercent: 150 }] },
    ],
    parts: [
      S('WEAPON', '成吉思汗亲赐金鞘宝刀', {
        atkBonus: 760, critBonus: 15, ...partEffect({ kind: 'COMPANION_ASSIST_CHANCE', points: 20 },
          '伙伴合击概率 +20 个百分点，郭靖穿戴时命中使目标攻击降低 20%，持续 1 回合', criticalDamage(25, flatArmorPenetration(80))),
        signatureOwner: '郭靖',
        companionUse: { owners: ['guojing'] },
        resonance: { companionOnly: true, battleEffects: [
          { kind: 'ON_HIT_STATUS', rule: { status: 'ATTACK_DOWN', percent: 20, rounds: 1 } },
        ] },
      }),
      S('HEAD', '大汗贴身纯金雕翎盔', { hpBonus: 3200, ...partStats({ str: 20 }) }),
      S('ARMOR', '塞外重甲鱼鳞百炼金锁铠', {
        defBonus: 590, hpBonus: 5400,
        ...partEffect({ kind: 'ELEMENT_RESISTANCE', percent: 20 }, '水系、阴寒、毒系与火系伤害 -20%'),
      }),
      S('WRIST', '百战金刀护臂铠', { atkBonus: 230, ...criticalDamage(30) }),
      S('BELT', '黄金错缕九宝皮带', { hpBonus: 2800, ...partEffect({ kind: 'TEAM_STATS', stats: { defPercent: 10 } }, '全队防御 +10%') }),
      S('BOOTS', '铁骑踏雪百战战靴', {
        ...partEffect({ kind: 'STATUS_IMMUNITY', status: 'SLOW' }, '免疫减速',
          partEffect({ kind: 'CONTROL_IMMUNITY', statuses: ['KNOCKBACK'] }, '免疫击退', partStats({ agi: 260 }))),
      }),
      S('ACC', '成吉思汗玄铁金鹰令', {
        ...partEffect({ kind: 'TEAM_STATS', stats: { atkPercent: 15 } }, '全队外功攻击 +15%',
          partEffect({ kind: 'COMPANION_ASSIST_CHANCE', points: 25 }, '伙伴合击概率 +25 个百分点')),
      }),
    ],
  },
  {
    id: 'quanzhen_beidou', name: '全真北斗玄黄套装', tier: 'orange', chapter: 5,
    ...twoPieceStats({ def: 200, mp: 800 },
      `每回合开始时，为存活队友补足相当于穿戴者内力上限 ${QUANZHEN_SHIELD_PERCENT}% 的纯阳护盾`,
      '【天罡北斗阵】三人存活时，全员招架率 +30 个百分点。单体受击时平摊伤害，直接受击者额外积攒 20 点怒气',
      [
        { pieces: 4, effects: [{ kind: 'ROUND_START_SHIELD', maxMpPercent: QUANZHEN_SHIELD_PERCENT }] },
        { pieces: 6, effects: [{ kind: 'DAMAGE_SHARE_FORMATION', parryPoints: 30, hitRageMultiplier: 2 }] },
      ],
    ),
    parts: [
      S('WEAPON', '七星龙渊道家重剑', { atkBonus: 810, ...outerTrueDamage(180, partStats({ parry: 20 })) }),
      S('HEAD', '玄天九曜纯阳道冠', { hpBonus: 3500, patrolQiBonus: 12 }),
      S('ARMOR', '太极玄黄八卦法袍', {
        defBonus: 630, hpBonus: 5800, ...partEffect({ kind: 'ROUND_CLEANSE' }, '回合开始驱散自身 1 个异常'),
      }),
      S('WRIST', '天罡北斗金丝护腕', { atkBonus: 250, ...partEffect({ kind: 'TEAM_SHIELD_BONUS', percent: 10 },
        '全队获得的新护盾量 +10%，同类不叠加', partStats({ mp: 600 })) }),
      S('BELT', '重阳纯阳真气束腰', { hpBonus: 3000, ...partEffect({ kind: 'ROUND_END_MP_RECOVERY', percent: 15 }, '回合末回复 15% 最大内力') }),
      S('BOOTS', '九天揽月凌霄云履', { dodgeBonus: 18, ...partStats({ agi: 275 }) }),
      S('ACC', '王重阳遗留纯阳八卦镜', {
        ...partEffect({ kind: 'TECHNIQUE_DAMAGE', tradition: 'TAOIST', percent: 25 }, '道家武学伤害 +25%',
          partEffect({ kind: 'PHYSICAL_DAMAGE_REDUCTION', attackerTraits: ['HERETIC'], percent: 30 }, '受邪派攻击时盾前物理伤害减少 30%')),
      }),
    ],
  },
  {
    id: 'dajin_sishi', name: '大金覆灭死士套装', tier: 'orange', chapter: 5,
    ...twoPieceStats({ atk: 380, crit: 15 },
      '气血每降低 10%，攻击与暴伤提升 8%',
      '【决死一击】每战一次。保命效果耗尽后，遭遇致死伤害时先释放必暴、100% 吸血的绝技，再承受本次伤害',
      [
        { pieces: 4, effects: [{ kind: 'WOUNDED_DAMAGE', hpStepPercent: 10, attackPercent: 8, critDamagePercent: 8 }] },
        { pieces: 6, effects: [{ kind: 'LETHAL_COUNTER' }] },
      ],
    ),
    parts: [
      S('WEAPON', '饮恨淬血透甲枪', {
        atkBonus: 860, ...partEffect({ kind: 'PERIODIC_TICK_DAMAGE', category: 'bleed', percent: 40 }, '自身施加的流血伤害 +40%', flatArmorPenetration(100)),
      }),
      S('HEAD', '死士残破青铜铁面', { hpBonus: 3800, ...partEffect({ kind: 'WOUNDED_DAMAGE', attackPercent: 30, critDamagePercent: 0, belowHpPercent: 30 }, '气血低于 30% 时出招攻击 +30%') }),
      S('ARMOR', '黑煞染血精铁甲', { defBonus: 670, hpBonus: 6200 }),
      S('WRIST', '绝命缠铁死士护手', { atkBonus: 270, critBonus: 18 }),
      S('BELT', '破阵断骨狼皮带', { hpBonus: 3200, ...partEffect({ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 25, belowHpPercent: 30 }, '受击时气血低于 30% 则在扣盾前减免 25% 物理伤害') }),
      S('BOOTS', '追风绝尘染血履', { ...partEffect({ kind: 'OPENING_PRIORITY' }, '必定抢占开局先手', partStats({ agi: 290 })) }),
      S('ACC', '完颜洪烈染血贴身金牌', {
        ...partEffect({ kind: 'KARMA_DAMAGE_MULTIPLIER', multiplier: 2 }, '侠义对敌增伤翻倍',
          partEffect({ kind: 'TARGET_TRAIT_DAMAGE', traits: ['JIN', 'HERETIC'], percent: 25 }, '对金国或邪派目标造成的伤害 +25%')),
      }),
    ],
  },
  {
    id: 'niluan_jiuyin', name: '逆乱九阴天下第一套装', tier: 'red', chapter: 5,
    ...twoPieceStats({ atk: 350, mp: 1000 },
      '暴击伤害 +35%；释放绝技后追加一次外功（每回合 1 次）',
      '【武道极境】解除自身招式的门派与兵刃限制。每战首次气血跌破 30% 时进入疯魔，清除并免疫控制、攻击 +80%、必暴，持续 3 回合',
      [
        { pieces: 4, effects: [{ kind: 'CRIT_DAMAGE', percent: 35 }, { kind: 'OUTER_FOLLOW_UP', chancePercent: 100, trigger: 'ULT_CAST' }] },
        { pieces: NILUAN_MARTIAL_FREEDOM.pieces, effects: [
          { kind: 'MARTIAL_FREEDOM' },
          { kind: 'LOW_HP_FURY', statusName: '疯魔逆九阴', belowHpPercent: 30, attackPercent: 80, rounds: 3,
            controlImmunity: true, guaranteedCrit: true },
        ] },
      ],
    ),
    parts: [
      S('WEAPON', '逆练真经·玄铁狂生剑', {
        atkBonus: 680, critBonus: 20,
        ...partEffect({ kind: 'REVERSE_BUFF', chancePercent: 40, attackPercent: 30, rounds: 3 },
          '【逆脉神锋】出招时有 40% 概率逆转目标的闪避或阵型招架增益，自身攻击 +30%，持续 3 回合',
          partEffect({ kind: 'GUARD_BYPASS', guard: 'PARRY' }, '出招无视招架',
            percentArmorPenetration(30, undefined, outerTrueDamage(180)))),
      }),
      S('HEAD', '踏雪封顶通天金冠', { hpBonus: 2800, patrolQiBonus: 15, ...partStats({ intStat: 30, con: 30 }) }),
      S('ARMOR', '逆阴阳玄煞天蚕宝甲', {
        defBonus: 520, hpBonus: 4800,
        ...partEffect({ kind: 'HIT_QI_ABSORB', chancePercent: 35 }, '受击时 35% 概率在扣盾前吸收剩余伤害，等量转为真气',
          partEffect({ kind: 'PHYSICAL_DAMAGE_REDUCTION', percent: 25, alsoPeriodic: true }, '减免 25% 受击与持续伤害')),
      }),
      S('WRIST', '逆乱乾坤通天护腕', { atkBonus: 320, ...criticalDamage(40, partStats({ parry: 25 })) }),
      S('BELT', '九阴梵文总纲通天金丝带', { hpBonus: 2600, ...partStats({ mp: 800, speed: 35 }) }),
      S('BOOTS', '华山踏雪无痕天行靴', { dodgeBonus: 20, ...partEffect({ kind: 'OPENING_PRIORITY', chancePercent: 35 }, '35% 概率抢占开局先手', partStats({ agi: 330 })) }),
      S('ACC', '天下第一·华山玉佩', { attributeBonus: { str: 20, con: 20, agi: 20, intStat: 20, luck: 20, karma: 20 } }),
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
  environment?: BattleEnvironment
  boss: [string, string, PortraitStyle]
  stance: StanceType
  combat?: EnemyCombatConfig
  guards?: (Omit<BattleEnemyGuard, 'hp' | 'atk'> & { hpPercent: number; atkPercent: number })[]
  puzzle?: TrialStageConfig['puzzle']
  setId: string
  firstClearParts: EquipSlotType[]
  clearSkillId?: string
  clearItemId?: string
  clearItemRequiresPuzzle?: true
  clearCompanionIds?: readonly string[]
  tip: string
  victory?: 'DEFEAT_BOSS' | 'SURVIVE_ROUNDS'
  surviveRounds?: number
  replayPartIds?: [string, string]
  unlock?: 'INNER_LEFT' | 'RIGHT_ULT'
}

const JIN_DEATH_GUARD: EnemyCombatConfig = {
  joinsRound: true, faction: 'JIN', alignment: 'HERETIC', weapon: { form: 'SPEAR', tier: 'blue' },
  deathBlast: { name: '死士自爆', attackPercent: 150, pushAway: { stance: 'AGILE', lightSkill: true } },
}

const STAGE_SEEDS: StageSeed[] = [
  {
    id: 1, title: '破庙夜雨 · 荒山草贼', environment: { rain: true, night: true }, boss: ['黑风寨逃寇·赖三', '绿林流寇', 'assassin'], stance: 'FIERCE',
    combat: { creature: 'BANDIT', scareable: true, weapon: { form: 'BLADE', tier: 'green' }, alignment: 'HERETIC', karma: -15,
      strikeWeakness: { name: '刀势被破', matches: [{ skillIds: ['yuenv_jian', 'kaishan_zhang', 'nanshan_zhang'] }],
        status: { status: 'ATTACK_DOWN', percent: 30, rounds: 1 } } },
    setId: 'pomiao_caomang', firstClearParts: ['WEAPON', 'ARMOR'], tip: '越女剑或开山掌命中可破刀势，使他的攻击降低 30%。',
  },
  { id: 2, title: '醉仙酒肆 · 淮南恶霸', boss: ['恶虎镖局弃徒·焦大亨', '江南酒楼恶霸', 'assassin'], stance: 'FIERCE', combat: { weapon: { form: 'ODD', tier: 'green' }, hitStreakWeakness: { rounds: 3, critPoints: 25, name: '重心失衡' } }, setId: 'zuixian_xingshang', firstClearParts: ['HEAD'], clearSkillId: 'tianchu_qigong', tip: '连续 3 回合命中可令他重心失衡，之后对他出手的暴击率提高 25 个百分点。' },
  {
    id: 3, title: '法华古寺 · 焦木盲僧', boss: ['法华寺知客·了妄和尚', '罗汉棍僧', 'monk'], stance: 'TAICHI',
    combat: { def: 80, alignment: 'RIGHTEOUS', weapon: { form: 'STAFF', tier: 'blue' },
      strikeWeakness: { name: '护体棍势被破', matches: [{ pointStrike: true }, { stance: 'AGILE', lightSkill: true }], breakDefense: true } },
    setId: 'fahua_zuyi', firstClearParts: ['WRIST'], tip: '点穴招式或装配轻功后用奇门出手，命中可破护体棍势。',
  },
  {
    id: 4, title: '醉仙楼头 · 盲侠柯镇恶', boss: ['飞天蝙蝠·柯镇恶', '江南七怪之首', 'assassin'], stance: 'FIERCE',
    combat: { alignment: 'RIGHTEOUS', weapon: { form: 'STAFF', tier: 'purple' }, openingRage: 65,
      rageMove: { ...KE_POISON_DART, lightHitPenalty: 50 } },
    setId: 'jiangnan_qiguai', firstClearParts: ['BELT'], tip: '柯镇恶平时近身使杖，攒怒后掷出毒菱。轻功可扰乱其听声辨位。',
  },
  {
    id: 5, title: '塞外瀚海 · 蒙古骑射手', boss: ['哲别麾下·帖木儿', '大漠神射斥候', 'assassin'], stance: 'AGILE',
    combat: { range: 'RANGED', faction: 'MONGOL', mounted: true, weapon: { form: 'BOW', tier: 'blue' },
      strikeWeakness: { name: '贴身乱箭', matches: [{ forms: ['FIST', 'PALM', 'CLAW', 'KICK'] }], status: { status: 'DISARM', rounds: 1 } } },
    setId: 'damo_qibing', firstClearParts: ['BOOTS'], tip: '贴身拳掌、爪法或腿法命中可使他短暂无法射箭。',
  },
  {
    id: 6, title: '荒山骷髅 · 塞外双煞残阵', boss: ['白驼山盗墓使·阴陵客', '黑风双煞爪牙', 'assassin'], stance: 'AGILE',
    combat: { alignment: 'HERETIC', karma: -30, periodicOnHit: { status: 'bonePoison', attackPercent: 12, rounds: 2 } },
    setId: 'huangshan_kulou', firstClearParts: ['ACC'], tip: '阴陵客命中附带阴寒骨毒。全真吐纳功可抵抗骨毒。',
  },
  {
    id: 7, title: '荒山绝杀 · 铜尸陈玄风', boss: ['铜尸·陈玄风', '黑风双煞', 'assassin'], stance: 'FIERCE',
    combat: { alignment: 'HERETIC', karma: -50, def: 140, openingShield: 240,
      weakSpot: { round: 5, name: '肚脐罩门', weaponId: 'xuantie_dagger', openingAttackPercent: 120, exposedAttackPercent: 150 } },
    setId: 'henglian_tongjia', firstClearParts: ['WEAPON', 'ARMOR'],
    tip: '白骨爪可加快破盾。陈玄风前四回合猛攻，第五回合露出罩门，护体防御暂时归零。',
    replayPartIds: ['henglian_tongjia_weapon', 'henglian_tongjia_armor'],
  },
  {
    id: 8, title: '张家口外 · 黄河四鬼截道', boss: ['断魂刀·沈青刚', '黄河四鬼', 'assassin'], stance: 'FIERCE',
    combat: SHEN_QINGGANG_COMBAT,
    guards: [{ name: '追命枪·吴青烈', title: '黄河四鬼', portrait: 'bandit', stance: 'FIERCE', hpPercent: 60, atkPercent: 65,
      combat: WU_QINGLIE_COMBAT }],
    setId: 'huanghe_sigui', firstClearParts: ['WEAPON'], tip: '沈青刚的刀势可封穴，吴青烈会追枪。先杀沈青刚，吴青烈攻击降低 40%。',
  },
  {
    id: 9, title: '中都擂台 · 小王爷完颜康', boss: ['赵王世子·完颜康', '金国小王爷', 'assassin'], stance: 'AGILE',
    combat: WANYAN_KANG_COMBAT,
    setId: 'jinwang_fuxiu', firstClearParts: ['HEAD'], tip: '完颜康攒满怒气时释放破盾流血的白骨爪。用太极招架可降低他的下一次攻击。',
  },
  { id: 10, title: '赵王外院 · 鬼门龙王沙通天', boss: ['鬼门龙王·沙通天', '黄河帮帮主', 'assassin'], stance: 'FIERCE', combat: SHA_TONGTIAN_COMBAT, setId: 'huanghe_nilang', firstClearParts: ['WRIST'], clearSkillId: 'duanhun_qiang', tip: '沙通天第 1 回合蓄力怒浪排壑，下一回合可用兰花拂穴手打断。获胜可习得黄河断魂枪。', unlock: 'INNER_LEFT' },
  { id: 11, title: '王府校场 · 千手人屠彭连虎', boss: ['千手人屠·彭连虎', '华北绿林大盗', 'assassin'], stance: 'AGILE', combat: PENG_LIANHU_COMBAT, setId: 'qianshou_panguan', firstClearParts: ['BELT'], tip: '他的暗器会施加针毒并有概率点穴。贴身短打命中可封住暗器。' },
  {
    id: 12, title: '药房秘坛 · 大手印灵智上人', boss: ['密宗大师·灵智上人', '西域密宗高僧', 'monk'], stance: 'FIERCE',
    combat: LINGZHI_COMBAT,
    setId: 'xiyu_mizong', firstClearParts: ['BOOTS'], tip: '灵智上人开局使密宗大手印。刀剑命中可破其双肋气门，阻止第 4 回合开始的火毒。',
  },
  {
    id: 13, title: '王府突围 · 参仙老怪梁子翁', boss: ['长白参仙·梁子翁', '长白山武学名宿', 'zhoubotong'], stance: 'AGILE',
    combat: LIANG_ZIWENG_COMBAT,
    guards: [{ ...LIANG_SNAKE_GUARD, hpPercent: 42, atkPercent: 50 }],
    setId: 'changbai_canxian', firstClearParts: ['WEAPON', 'HEAD'], tip: '药蛇会从旁叠毒。先击败药蛇会让梁子翁攻击提高 50%，但护体防御归零。',
    replayPartIds: ['changbai_canxian_weapon', 'changbai_canxian_head'],
  },
  {
    id: 14, title: '宝应松林 · 白驼少主欧阳克', boss: ['白驼山少主·欧阳克', '西毒嫡传', 'assassin'], stance: 'AGILE',
    combat: {
      speed: 210, preferFemaleCompanion: true, alignment: 'HERETIC', karma: -40, weapon: { form: 'ODD', tier: 'purple' },
      companionCounter: { id: 'huangrong', slot: 'ALLY_RIGHT', damageReductionPercent: 30, hitPenalty: 25 },
    },
    setId: 'baituo_zheshan', firstClearParts: ['ACC'], tip: '欧阳克优先攻击女伴。右翼黄蓉在场时，他的伤害降低 30%、命中降低 25 个百分点。',
  },
  {
    id: 15, title: '太湖水寨 · 归云庄翻江蛟', environment: { water: true }, boss: ['归云庄大统领·陆冠英', '太湖群盗首领', 'assassin'], stance: 'TAICHI',
    combat: { weapon: { form: 'SPEAR', tier: 'blue' }, water: { def: 160, strikeWeakness: { name: '水上枪阵被破', matches: [{ stance: 'FIERCE' }], breakDefense: true } } },
    setId: 'taihu_shuizhai', firstClearParts: ['WEAPON'], tip: '刚猛架势命中可破水上枪阵，使护体防御归零。',
  },
  { id: 16, title: '归云正堂 · 欺世盗名裘千丈', boss: ['江湖招摇客·裘千丈', '假裘千仞', 'zhoubotong'], stance: 'AGILE', combat: QIU_QIANZHANG_COMBAT, setId: 'jiamian_piaoping', firstClearParts: ['HEAD'], tip: '一次实扣气血超过 500 点便能识破障眼法，令他的防御归零。' },
  { id: 17, title: '太湖芦苇 · 铁尸梅超风', boss: ['铁尸·梅超风', '黑风双煞', 'meichaofeng'], stance: 'FIERCE', combat: { female: true, alignment: 'HERETIC', karma: -50, weapon: { form: 'WHIP', tier: 'orange' }, rageSkillId: 'jiuyin_baiguzhua', hearingWeakness: { skillIds: ['jinyan_gong', 'bihai_chaosheng'], hitPenalty: 40 } }, setId: 'jiuyin_baigu', firstClearParts: ['WRIST'], clearItemId: 'xuantie_feizhua', tip: '梅超风攒怒后施展白骨爪。装备金雁功或用碧海潮生曲命中可扰乱她的听声辨位。获胜可取得白骨镀银九节鞭。' },
  {
    id: 18, title: '东海巨舶 · 桃花哑仆舵手', environment: { water: true }, boss: ['桃花哑仆领班·铜首', '黄药师座下哑仆', 'monk'], stance: 'FIERCE',
    combat: { def: 180, speed: 65, strikeWeakness: { name: '绕后破防', matches: [{ stance: 'AGILE' }], breakDefense: true },
      statusPulse: { every: 2, lastRound: 2, name: '巨锚震浪', rule: { status: 'FALL_IN_WATER', rounds: 1, nextRound: true }, waterOnly: true } },
    setId: 'canghai_kuanglan', firstClearParts: ['BELT'], tip: '奇门架势命中可绕后破防。铜首第 2 回合出手时会以巨锚震浪，落水者下回合无法行动。逆浪分波重靴可免疫。',
  },
  {
    id: 19, title: '积翠深处 · 奇门九宫石阵', boss: ['九宫木人偶', '桃花岛石阵阵灵', 'monk'], stance: 'TAICHI',
    combat: { def: 180, ninePalace: { minInsight: 28, gates: [
      { name: '休门', defensePercent: 120, attackPercent: 85 }, { name: '生门', defensePercent: 0, attackPercent: 80, opening: true },
      { name: '伤门', defensePercent: 100, attackPercent: 125 }, { name: '杜门', defensePercent: 150, attackPercent: 95 },
      { name: '景门', defensePercent: 110, attackPercent: 110 }, { name: '死门', defensePercent: 100, attackPercent: 150 },
      { name: '惊门', defensePercent: 120, attackPercent: 120 }, { name: '开门', defensePercent: 50, attackPercent: 100 },
    ] } },
    setId: 'qimen_dunjia', firstClearParts: ['BOOTS'], tip: '八门循环，生门防御归零。悟性达到 28 的黄蓉可在生门引路，命中中宫后永久破阵。',
  },
  { id: 20, title: '清音石洞 · 老顽童周伯通', boss: ['老顽童·周伯通', '全真教师叔祖', 'zhoubotong'], stance: 'TAICHI', combat: { openingMercy: { belowInt: 35, itemId: 'kongming_wantong_acc', attackPercent: 50 } }, setId: 'kongming_wantong', firstClearParts: ['ACC'], clearItemId: 'kongming_peach_sword', tip: '悟性低于 35 或随身带着促织笼，他的攻击会减半。获胜可得空明桃木剑。' },
  {
    id: 21, title: '碧海听箫 · 东邪黄药师', boss: ['东邪·黄药师', '天下五绝·桃花岛主', 'huangyaoshi'], stance: 'AGILE', combat: HUANG_YAOSHI_COMBAT,
    puzzle: { name: '奇门背诵', prompt: '休、生、伤、杜、景、死、惊、开八门中，哪一门可直入九宫中枢？',
      options: ['休门', '生门', '开门'], answer: '生门', round: 6,
      correctText: '背诵无误，第六回合全队免受乱心。', wrongText: '背诵有误，第六回合须继续抵挡乱心。' },
    setId: 'bihai_chaosheng', firstClearParts: ['WEAPON', 'ACC'], clearItemId: 'qimen_divination_scroll', clearItemRequiresPuzzle: true,
    tip: '第三回合抗箫，第六回合背诵奇门，第九回合拆招。撑过十回合即胜，答对且获胜可得奇门遁甲易数残卷。',
    victory: 'SURVIVE_ROUNDS', surviveRounds: 10, replayPartIds: ['bihai_chaosheng_weapon', 'bihai_chaosheng_acc'], unlock: 'RIGHT_ULT',
  },
  {
    id: 22, title: '狂澜火船 · 白驼蛇奴统领', environment: { water: true }, boss: ['白驼山驭蛇长老·蛇奴统领', '白驼精锐', 'assassin'], stance: 'AGILE',
    combat: { alignment: 'HERETIC', karma: -35, def: 130,
      periodicOnHit: { status: 'snakeVenom', attackPercent: 12, rounds: 2, maxStacks: 3 },
      strikeWeakness: { name: '蛇阵被破', matches: [{ forms: ['PALM'], stance: 'FIERCE' }, { skillIds: ['mizong_da_shou'] }], breakDefense: true, stopPeriodic: true } },
    setId: 'baituo_yushe', firstClearParts: ['WEAPON'], tip: '白驼金丝锦袍可抵抗毒雾。刚猛掌法或火毒大手印命中可破蛇阵，阻止再叠蛇毒。',
  },
  { id: 23, title: '压鬼孤岛 · 西毒欧阳锋残影', boss: ['西毒·欧阳锋', '天下五绝', 'ouyangfeng'], stance: 'FIERCE', combat: { alignment: 'HERETIC', karma: -100, weapon: { form: 'STAFF', tier: 'orange' }, charge: { round: 2, name: '蛤蟆扑', damageMultiplier: 2, taichiCounterPercent: 10 } }, setId: 'hama_nimai', firstClearParts: ['HEAD'], tip: '欧阳锋第 2 回合蓄力。兰花拂穴手可打断，太极可在扑出时引他撞石。' },
  {
    id: 24, title: '牛家密室 · 侯通海与金兵斥候', boss: ['三头蛟·侯通海', '黄河帮三当家', 'assassin'], stance: 'FIERCE',
    combat: { faction: 'JIN', alignment: 'HERETIC', karma: -35, weapon: { form: 'SPEAR', tier: 'blue' },
      strikeWeakness: { name: '肉瘤被点中', matches: [{ pointStrike: true }], hits: 3, status: { status: 'STUN', rounds: 2 } } },
    guards: [{ name: '金国内廷斥候统领', title: '金兵暗探', portrait: 'assassin', stance: 'AGILE', hpPercent: 42, atkPercent: 58,
      combat: { joinsRound: true, staysBehindLeader: true, speed: 112, openingConcealment: 10, faction: 'JIN', range: 'RANGED', weapon: { form: 'BOW', tier: 'purple' },
        leaderDown: { name: '斥候阵脚大乱', attackPercent: 70 } } }],
    setId: 'qianying_mixing', firstClearParts: ['WRIST'], tip: '斥候首回合隐蔽，会从旁射击。三次点穴命中使侯通海眩晕 2 回合，侯通海落败后斥候攻击降低 30%。',
  },
  {
    id: 25, title: '湘西黑沼 · 神算子瑛姑', environment: { swamp: true }, boss: ['神算子·刘瑛姑', '前大理皇妃', 'meichaofeng'], stance: 'AGILE',
    combat: { female: true, dodge: 30, lightDodge: 30 },
    puzzle: { name: '九宫算题', prompt: '把一至九填入九宫，每数恰好用一次，横、竖与两条对角线之和均相等。中宫填几？',
      options: ['三', '五', '七'], answer: '五', round: 1, correctText: '瑛姑失神两回合，暂时无法行动和闪避。', wrongText: '瑛姑摇头，施展泥鳅功迎战。',
      statuses: [{ status: 'STUN', rounds: 2 }, { status: 'DODGE_DOWN', percent: 100, rounds: 2 }] },
    setId: 'jiuwei_linghu', firstClearParts: ['BELT'], tip: '可先答九宫算题。答对后瑛姑会失神两回合。',
  },
  { id: 26, title: '铁掌孤峰 · 水上漂裘千仞', boss: ['铁掌水上漂·裘千仞', '湘西铁掌帮主', 'ouyangfeng'], stance: 'FIERCE', combat: QIU_QIANREN_COMBAT, setId: 'tiezhang_kaishan', firstClearParts: ['WEAPON', 'ACC'], tip: '铁掌命中使疗伤降低 50%，持续 3 回合。第 2 回合蓄力焚石掌风，太极可化解，一阳指命中可打断。', replayPartIds: ['tiezhang_kaishan_weapon', 'tiezhang_kaishan_acc'] },
  { id: 27, title: '大漠西征 · 撒麻尔罕铁甲千户', boss: ['花剌子模重甲亲军帅·忽鲁忽', '撒麻尔罕守将', 'assassin'], stance: 'FIERCE', combat: { def: 300, mounted: true, heavyArmor: true, weapon: { form: 'SPEAR', tier: 'orange' } }, setId: 'xizheng_jindao', firstClearParts: ['BOOTS'], tip: '普通刀剑破不了重甲，借武穆遗书奇谋卸其战马。' },
  {
    id: 28, title: '烟雨楼头 · 全真七子天罡北斗', boss: ['长春子·丘处机', '全真七子', 'monk'], stance: 'TAICHI',
    combat: { speed: 132, parry: 30, alignment: 'RIGHTEOUS', weapon: { form: 'BLADE', tier: 'orange' }, formation: { name: '天罡北斗阵', parryPoints: 20 } },
    guards: [{ name: '玉阳子·王处一', title: '全真七子', portrait: 'daoist', stance: 'TAICHI', hpPercent: 52, atkPercent: 58,
      combat: { joinsRound: true, speed: 118, parry: 20, alignment: 'RIGHTEOUS', weapon: { form: 'BLADE', tier: 'purple' } } }],
    setId: 'quanzhen_beidou', firstClearParts: ['ACC'], clearItemId: 'beidou_formation_book', clearCompanionIds: QUANZHEN_SEVEN_IDS,
    tip: '丘处机、王处一交替护阵，当前前排招架提高 20 个百分点。出手速度超过二人可抢占阵眼。胜后获北斗阵图，尚未入队的七子也会加入。',
  },
  {
    id: 29, title: '铁枪古庙 · 完颜洪烈死士营', boss: ['大金六王爷·完颜洪烈', '死士亲卫统领', 'assassin'], stance: 'FIERCE',
    combat: { faction: 'JIN', alignment: 'HERETIC', karma: -60, weapon: { form: 'BLADE', tier: 'purple' } },
    guards: [
      { name: '金国左翼死士', title: '赵王亲卫', portrait: 'bandit', stance: 'FIERCE', hpPercent: 32, atkPercent: 45, combat: JIN_DEATH_GUARD },
      { name: '金国右翼死士', title: '赵王亲卫', portrait: 'assassin', stance: 'FIERCE', hpPercent: 30, atkPercent: 45, combat: JIN_DEATH_GUARD },
    ],
    setId: 'dajin_sishi', firstClearParts: ['WEAPON'], tip: '两名死士阵亡时各自爆一次。配轻功以奇门架势击飞，爆炸只波及己方前排。',
  },
  { id: 30, title: '华山之巅 · 疯魔逆九阴欧阳锋', boss: ['疯魔西毒·欧阳锋', '天下第一狂', 'ouyangfeng'], stance: 'FIERCE', combat: OUYANG_FENG_FRENZY, setId: 'niluan_jiuyin', firstClearParts: ['WEAPON', 'HEAD'],
    tip: '每三回合以太极抵御全体掌风。欧阳锋气血降至两成时，靖蓉可配合主角绝技破局。击败第 24、30 关且黄蓉已入队，可译成梵文总纲。',
    replayPartIds: ['niluan_jiuyin_weapon', 'niluan_jiuyin_head'] },
]

export const TRIAL_STAGES: TrialStageConfig[] = STAGE_SEEDS.map((seed) => ({
  id: seed.id,
  chapter: CHAPTER_OF[seed.id],
  code: String(seed.id).padStart(2, '0'),
  title: seed.title,
  environment: { water: false, ...seed.environment },
  recLevel: seed.id,
  boss: {
    name: seed.boss[0],
    title: seed.boss[1],
    portrait: seed.boss[2],
    hp: trialBossHp(seed.id),
    atk: trialBossAtk(seed.id),
    stance: seed.stance,
    combat: seed.combat,
  },
  guards: seed.guards?.map(({ hpPercent, atkPercent, ...guard }) => ({ ...guard,
    hp: Math.round(trialBossHp(seed.id) * hpPercent / 100), atk: Math.round(trialBossAtk(seed.id) * atkPercent / 100),
  })),
  puzzle: seed.puzzle,
  mechanicTip: seed.tip,
  victory: seed.victory ?? 'DEFEAT_BOSS',
  surviveRounds: seed.surviveRounds,
  setId: seed.setId,
  firstClearParts: seed.firstClearParts,
  clearSkillId: seed.clearSkillId,
  clearItemId: seed.clearItemId,
  clearItemRequiresPuzzle: seed.clearItemRequiresPuzzle,
  clearCompanionIds: seed.clearCompanionIds,
  replayPartIds: seed.replayPartIds,
  unlock: seed.unlock,
}))

export const TRIAL_STAGE_BY_ID = new Map(TRIAL_STAGES.map((stage) => [stage.id, stage]))

export function trialPuzzleOutcome(stage: TrialStageConfig, answer: string | undefined) {
  const puzzle = stage.puzzle
  if (!puzzle || answer === undefined || !puzzle.options.includes(answer)) return
  const correct = answer === puzzle.answer
  return { sourceId: `trial_puzzle_${stage.id}`, sourceName: puzzle.name, round: puzzle.round, correct,
    text: correct ? puzzle.correctText : puzzle.wrongText, statuses: correct ? puzzle.statuses : undefined }
}

export function trialStageOf(id: number) {
  return TRIAL_STAGE_BY_ID.get(id)
}

export function recruitTrialCompanions(affinity: Record<string, CompanionState>, clearedStageIds: readonly number[]) {
  const recruited: Record<string, CompanionState> = {}
  for (const stageId of clearedStageIds) {
    for (const id of trialStageOf(stageId)?.clearCompanionIds ?? []) {
      const prior = affinity[id]
      if (prior?.recruited) continue
      const state: CompanionState = {
        ...prior, met: true, recruited: true, affinity: Math.max(100, prior?.affinity ?? 0),
        taught: prior?.taught ?? false, form: prior?.form ?? 'base', grade: prior?.grade ?? null, tokens: prior?.tokens ?? 0,
      }
      affinity[id] = state
      recruited[id] = state
    }
  }
  return recruited
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
export const TRIAL_ITEMS: ItemConfig[] = TRIAL_SETS.flatMap((set) =>
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
    attributeBonus: part.attributeBonus,
    idleBonus: part.idleBonus,
    idleQiPerHour: part.idleQiPerHour,
    patrolQiBonus: part.patrolQiBonus,
    patrolSilverBonus: part.patrolSilverBonus,
    masteryDiscount: part.masteryDiscount,
    breakthroughBonus: part.breakthroughBonus,
    sectContributionBonus: part.sectContributionBonus,
    escortAttackPercent: part.escortAttackPercent,
    marketDiscount: part.marketDiscount,
    backpackSlots: part.backpackSlots,
    signatureEffect: part.signatureEffect,
    signatureOwner: part.signatureOwner,
    resonance: part.resonance,
    companionUse: part.companionUse,
    battleEffects: part.battleEffects,
    extra: part.extra,
    desc: `${set.name}·${part.name}`,
  })),
)

const cuixinDagger = TRIAL_ITEMS.find((item) => item.id === 'henglian_tongjia_weapon')!
const jushiBelt = TRIAL_ITEMS.find((item) => item.id === 'henglian_tongjia_belt')!
export const TRIAL_VARIANTS: readonly ItemConfig[] = [
  {
    ...cuixinDagger, id: 'henglian_tongjia_weapon_cuixin', baseItemId: cuixinDagger.id, name: `${cuixinDagger.name} · 摧心`,
    gearSkill: { name: '摧心双击', rageCost: 60, damagePercent: 75 },
    signatureEffect: `${cuixinDagger.signatureEffect ?? '常规外功附带 45 点真伤'}。摧心双击消耗 60 怒气，对同一目标连击两次，每击按外功威力的 75% 结算。试炼与复战每场可施展一次。`,
  },
  {
    ...jushiBelt, id: 'henglian_tongjia_belt_jushi', baseItemId: jushiBelt.id, name: `${jushiBelt.name} · 聚势`,
    gearSkillDiscount: 20, signatureEffect: [jushiBelt.signatureEffect, '聚势降低装备特技怒气消耗 20%。'].filter(Boolean).join('。'),
  },
]

export const TRIAL_ITEM_BY_ID = new Map([...TRIAL_ITEMS, ...TRIAL_VARIANTS].map((item) => [item.id, item]))

export function trialItemOf(id: string) {
  return TRIAL_ITEM_BY_ID.get(id)
}

export function hasTrialPart(ownedItemIds: readonly string[], baseItemId: string) {
  return ownedItemIds.includes(baseItemId) || TRIAL_VARIANTS.some((item) => item.baseItemId === baseItemId && ownedItemIds.includes(item.id))
}

export function equippedGearSkill(loadout: Pick<LoadoutPresetDTO, 'weaponId' | 'beltId' | 'gearSkillId'>) {
  const weapon = loadout.weaponId && trialItemOf(loadout.weaponId)
  if (!weapon || !weapon.gearSkill || weapon.id !== loadout.gearSkillId) return
  const belt = loadout.beltId ? trialItemOf(loadout.beltId) : undefined
  return {
    ...weapon.gearSkill, weapon,
    rageCost: Math.round(weapon.gearSkill.rageCost * (100 - (belt?.gearSkillDiscount ?? 0)) / 100),
  }
}

/** 每 30 分钟一次遭遇，25% 掉件，7 部位等概率 */
export const PATROL_ENCOUNTER_MINUTES = 30
export const PATROL_DROP_CHANCE = 0.25

export function patrolEncounterRate(accessoryId: string | null) {
  return accessoryId === trialPartId('huanghe_sigui', 'ACC') ? 110 : 100
}

export function patrolEncounterCount(trial: TrialStateDTO, stageId: number) {
  return trial.stageEncounters?.[String(stageId)] ?? Math.floor((trial.stageHours[String(stageId)] ?? 0) * 60 / PATROL_ENCOUNTER_MINUTES)
}

export function advancePatrol(trial: TrialStateDTO, now: number, encounterRate: number) {
  const elapsed = now - Math.max(trial.lastPatrolAt, now - 12 * 3_600_000)
  if (elapsed <= 0) return
  const stageId = trial.selectedStageId
  const key = String(stageId)
  const previousEncounters = patrolEncounterCount(trial, stageId)
  const progress = (trial.encounterProgress ?? 0) + elapsed * encounterRate
  const threshold = PATROL_ENCOUNTER_MINUTES * 60_000 * 100
  const encounters = Math.floor(progress / threshold)
  trial.encounterProgress = progress % threshold
  const stageEncounters = trial.stageEncounters ??= {}
  stageEncounters[key] = previousEncounters + encounters
  trial.lastPatrolAt = now
  trial.stageHours[key] = (trial.stageHours[key] ?? 0) + elapsed / 3_600_000
  if (trialStageOf(stageId)?.replayPartIds) {
    trial.replayHours[key] = Math.min(TRIAL_REPLAY_HOURS, (trial.replayHours[key] ?? 0) + elapsed / 3_600_000)
  }
  return encounters
}

export function switchPatrolStage(trial: TrialStateDTO, stageId: number) {
  if (trial.selectedStageId === stageId) return
  trial.selectedStageId = stageId
  trial.encounterProgress = 0
}

/** 成色：普通 80% / 小极品 16% / 极品 4% */
export const PATROL_QUALITY = { normal: 0.8, fine: 0.16, perfect: 0.04 } as const
export const REPLAY_QUALITY = { normal: 0.45, fine: 0.4, perfect: 0.15 } as const
export const TRIAL_VARIANT_CHANCE = 0.2

/** 装备词条数值档，用于极品展示；倍率为相对基础值的浮动 */
export const AFFIX_TIERS = {
  fine: [1.08, 1.11, 1.15],
  perfect: [1.2, 1.25, 1.3],
} as const

const AFFIX_FIELDS = {
  patrolSilverBonus: '打坐纹银', patrolQiBonus: '打坐真气', atkBonus: '外功攻击', defBonus: '护体防御',
  hpBonus: '气血上限', critBonus: '暴击率', dodgeBonus: '闪避率', idleQiPerHour: '每小时打坐真气',
} as const
type AffixField = keyof typeof AFFIX_FIELDS

const PATROL_RATE_ROLLS: Record<string, { fine: number[]; perfect: number[] }> = {
  pomiao_caomang_acc: { fine: [1, 2], perfect: [3, 4, 5] },
  changbai_canxian_head: { fine: [1, 2], perfect: [3, 4, 5] },
}

function affixRanges(basis: number) {
  const rolls = (multipliers: readonly number[], min: number) =>
    [...new Set(multipliers.map((multiplier) => Math.max(min, Math.round(basis * multiplier) - basis)))]
  const fine = rolls(AFFIX_TIERS.fine, 1)
  return { fine, perfect: rolls(AFFIX_TIERS.perfect, fine.at(-1)! + 1) }
}

function affixOf(item: ItemConfig) {
  const field = (Object.keys(AFFIX_FIELDS) as AffixField[]).find((key) => (item[key] ?? 0) > 0)
  if (field) return { field, ...(PATROL_RATE_ROLLS[item.id] ?? affixRanges(item[field]!)) }
  for (const [effectIndex, effect] of (item.battleEffects ?? []).entries()) {
    if (effect.kind !== 'STAT_BONUS') continue
    const stat = (Object.keys(effect.stats) as (keyof BattleStatBonuses)[]).find((key) => (effect.stats[key] ?? 0) > 0)
    if (stat) return { stat, effectIndex, ...affixRanges(effect.stats[stat]!) }
  }
  const stage = TRIAL_STAGES.find(({ setId }) => setId === item.setId)
  return { field: 'hpBonus' as const, ...affixRanges((stage?.id ?? 1) * 10) }
}

const TRIAL_AFFIXES = new Map(TRIAL_ITEMS.map((item) => [item.id, affixOf(item)]))

function equipmentAffix(item: ItemConfig) {
  return TRIAL_AFFIXES.get(item.baseItemId ?? item.id) ?? affixOf(item)
}

export function applyEquipmentAffix(item: ItemConfig, roll = 0, base = item): ItemConfig {
  if (roll <= 0) return item
  const affix = equipmentAffix(base)
  if ('field' in affix) return { ...item, [affix.field]: (item[affix.field] ?? 0) + roll }
  const { stat, effectIndex } = affix
  return {
    ...item,
    battleEffects: item.battleEffects?.map((effect, index) => index === effectIndex && effect.kind === 'STAT_BONUS'
      ? { ...effect, stats: { ...effect.stats, [stat]: (effect.stats[stat] ?? 0) + roll } }
      : effect),
  }
}

export function trialAffixQuality(itemOrId: string | ItemConfig, roll = 0) {
  const item = typeof itemOrId === 'string' ? trialItemOf(itemOrId) : itemOrId
  return !item || roll <= 0 ? '普通' : roll >= equipmentAffix(item).perfect[0] ? '极品' : '小极品'
}

export function trialAffixLabel(itemOrId: string | ItemConfig, roll = 0) {
  const item = typeof itemOrId === 'string' ? trialItemOf(itemOrId) : itemOrId
  if (!item || roll <= 0) return ''
  const affix = equipmentAffix(item)
  if ('stat' in affix) return formatBattleStatBonuses({ [affix.stat]: roll })
  const unit = affix.field === 'critBonus' || affix.field === 'dodgeBonus' ? ' 个百分点'
    : affix.field === 'patrolSilverBonus' || affix.field === 'patrolQiBonus' ? '%' : ''
  return `${AFFIX_FIELDS[affix.field]} +${roll}${unit}`
}

export function rollEquipmentAffix(item: ItemConfig, source: 'PATROL' | 'REPLAY' | 'REFORGE', rng: () => number) {
  const quality = source === 'PATROL' ? PATROL_QUALITY : REPLAY_QUALITY
  const roll = rng()
  if (source !== 'REFORGE' && roll < quality.normal) return 0
  const affix = equipmentAffix(item)
  const ranges = roll < 1 - quality.perfect ? affix.fine : affix.perfect
  return ranges[Math.floor(rng() * ranges.length)]
}

export function rollTrialDrop(stage: TrialStageConfig, source: 'PATROL' | 'REPLAY', rng = Math.random) {
  const ids = source === 'REPLAY' ? stage.replayPartIds : trialSetOfStage(stage)?.parts.map(({ slot }) => trialPartId(stage.setId, slot))
  if (!ids || (source === 'PATROL' && rng() >= PATROL_DROP_CHANCE)) return
  const baseId = ids[Math.floor(rng() * ids.length)]
  const base = trialItemOf(baseId)!
  const affixRoll = rollEquipmentAffix(base, source, rng)
  const variant = TRIAL_VARIANTS.find((item) => item.baseItemId === baseId)
  const item = variant && rng() < TRIAL_VARIANT_CHANCE ? variant : base
  return { id: item.id, name: item.name, tier: item.tier, affixRoll }
}

export function collectTrialDrop(
  player: Pick<PlayerDTO, 'trial' | 'equipmentAffixes'>, ownedItemIds: string[], stage: TrialStageConfig,
  roll: NonNullable<ReturnType<typeof rollTrialDrop>>, at: number,
) {
  const prior = player.equipmentAffixes?.[roll.id] ?? 0
  const outcome = !ownedItemIds.includes(roll.id) ? 'NEW' : roll.affixRoll > prior ? 'UPGRADED' : 'DUPLICATE'
  const key = String(stage.id)
  const marksEarned = outcome === 'DUPLICATE' &&
    trialSetOfStage(stage)?.parts.some(({ slot }) => !hasTrialPart(ownedItemIds, trialPartId(stage.setId, slot))) ? 1 : undefined
  if (outcome === 'NEW') ownedItemIds.push(roll.id)
  if (outcome !== 'DUPLICATE' && roll.affixRoll > 0) (player.equipmentAffixes ??= {})[roll.id] = roll.affixRoll
  if (marksEarned) player.trial.marks[key] = (player.trial.marks[key] ?? 0) + marksEarned
  const drop = { ...roll, outcome, marksEarned } satisfies TrialDropDTO
  player.trial.recentDrops = [{ ...drop, at }, ...player.trial.recentDrops].slice(0, 10)
  return drop
}

export function upgradesPatrolYield(
  player: Pick<PlayerDTO, 'equipmentAffixes'>, loadout: Pick<LoadoutPresetDTO, 'headId' | 'accId'>,
  drop: NonNullable<ReturnType<typeof rollTrialDrop>>,
) {
  if ((loadout.headId !== drop.id && loadout.accId !== drop.id) || drop.affixRoll <= (player.equipmentAffixes?.[drop.id] ?? 0)) return false
  const item = trialItemOf(drop.id)
  return !!(item?.patrolQiBonus || item?.patrolSilverBonus || item?.idleQiPerHour)
}
