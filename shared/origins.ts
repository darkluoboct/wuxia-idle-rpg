import type { OriginId, PlayerDTO, SixStats } from './protocol.ts'

/**
 * 开局家世（docs/17 §七）：创角时四选一，定下六维微调、一项家学和一位自编的家人伙伴。
 * 家人开局就在队里，陪你打序章那一战；别家的伙伴结识不到。老角色没有家世，一切照旧。
 */
export type OriginPerkKind = 'TRIAL_SILVER' | 'HERB_ROLL' | 'PILL_RATE' | 'IDLE_QI'

export interface OriginConfig {
  id: OriginId
  name: string
  house: string
  glyph: string
  blurb: string
  stats: Partial<Record<keyof SixStats, number>>
  /** 家学：只碰新手要学的历练、采药、丹房、打坐，不碰战斗 */
  perk: { kind: OriginPerkKind; amount: number; text: string }
  companionId: string
  kin: string
  school: string
  /** 序章前两页（{name} 换成侠客名），第三页里家人的动作，忘机客剧情卡末尾家人的话 */
  prologue: { title: string; home: string; temple: string; stand: string; trialLine: string }
}

const TEMPLE = '神龛后头蜷着一位白发老者，浑身是血，怀里死死护着一只布包。他睁眼看了看你，嘴唇动了动，没说出话来。'

export const ORIGINS: Record<OriginId, OriginConfig> = {
  jiangmen: {
    id: 'jiangmen', name: '将门', house: '背嵬旧家', glyph: '将',
    blurb: '父亲是岳家军背嵬军的旧校尉，风波亭后解甲归隐嘉兴。',
    stats: { str: 3, con: 1 },
    perk: { kind: 'TRIAL_SILVER', amount: 10, text: '历练首胜纹银 +10%' },
    companionId: 'leizheng', kin: '义兄', school: '刚猛 · 长枪',
    prologue: {
      title: '楔子 · 将门',
      home: '南宋嘉定年间，金兵压境，朝廷偏安临安。嘉兴城北住着一户解甲的人家：家主当年是岳家军背嵬军的校尉，风波亭之后便归隐乡里。他教了{name}十年枪，可你生来奇经郁结、六脉微弱，那杆枪始终挑不起来。',
      temple: `这一夜风雨大作，你和义兄雷铮替父亲去城外祭扫旧部的坟，回程躲进一座破庙。${TEMPLE}`,
      stand: '雷铮一言不发，横枪挡在你身前。',
      trialLine: '雷铮收了枪，低声道：「义父说过，经脉不通，就从别处找路。这条路，我陪你走。」',
    },
  },
  yujia: {
    id: 'yujia', name: '渔家', house: '南湖阮家', glyph: '渔',
    blurb: '阮家世代在南湖撑船打鱼，烟雨楼下的船家都认得阮家的橹声。',
    stats: { agi: 3, luck: 1 },
    perk: { kind: 'HERB_ROLL', amount: 1, text: '采药每次多得一份' },
    companionId: 'ruanqinggao', kin: '大姐', school: '奇门 · 分水刺',
    prologue: {
      title: '楔子 · 渔家',
      home: '南宋嘉定年间，金兵压境，朝廷偏安临安。嘉兴南湖边住着阮家，世代撑船打鱼。{name}是阮老爹从湖里捞起来的弃婴，生来奇经郁结、六脉微弱；城里三家武馆都不肯收，大姐阮青篙替你骂上门去，也没骂出个结果。',
      temple: `这一夜风雨大作，你跟着大姐给城外的主顾送鱼，船进不了港，只好躲进岸边一座破庙。${TEMPLE}`,
      stand: '阮青篙把竹篙往地上一顿，骂道：「哪来的野狗！」',
      trialLine: '阮青篙一巴掌拍在你背上：「愣着做什么？能练了就练，打不过的，姐撑船带你跑。」',
    },
  },
  xinglin: {
    id: 'xinglin', name: '杏林', house: '回春堂', glyph: '杏',
    blurb: '舅父在嘉兴城里开回春堂药铺，你在药柜间长大。',
    stats: { intStat: 3, agi: 1 },
    perk: { kind: 'PILL_RATE', amount: 5, text: '炼丹成丹率 +5%' },
    companionId: 'shenqingdai', kin: '表姐', school: '银针点穴 · 回血解控',
    prologue: {
      title: '楔子 · 杏林',
      home: '南宋嘉定年间，金兵压境，朝廷偏安临安。嘉兴城里有家回春堂药铺，{name}自幼父母双亡，跟着舅父在药柜间长大，生来奇经郁结、六脉微弱。舅父翻了十年医书想治好你，城里三家武馆却早早把你拒之门外：「这副身子骨，学不得武。」',
      temple: `这一夜风雨大作，表姐沈青黛出城给猎户人家看病，舅父放心不下，让你提灯跟去。回城时雨越下越大，你们躲进一座破庙。${TEMPLE}`,
      stand: '沈青黛已扑到老者身边按住伤口，银针夹在指间。',
      trialLine: '沈青黛替老者合上眼，回头瞪你：「看我做什么？经脉通了也得按时喝药。」',
    },
  },
  xuanmen: {
    id: 'xuanmen', name: '玄门', house: '烟雨观', glyph: '玄',
    blurb: '三岁被送进城外烟雨观寄养，十年静坐，心比谁都静。',
    stats: { con: 3, intStat: 1 },
    perk: { kind: 'IDLE_QI', amount: 5, text: '打坐真气 +5%' },
    companionId: 'songyanzi', kin: '师兄', school: '太极 · 剑',
    prologue: {
      title: '楔子 · 玄门',
      home: '南宋嘉定年间，金兵压境，朝廷偏安临安。嘉兴城外有座烟雨观，{name}三岁就被送进观里寄养，生来奇经郁结、六脉微弱。观主说静坐可养经脉，十年坐下来，经脉没通，心却静了。',
      temple: `这一夜风雨大作，大师兄松岩子带你下山化缘，回观的山路被雨冲断，你们只好躲进半山一座破庙。${TEMPLE}`,
      stand: '松岩子拂尘一摆，长剑出鞘半寸。',
      trialLine: '松岩子对着老者端端正正行了一礼：「观主说的机缘，大概就是今夜了。」',
    },
  },
}

export const ORIGIN_IDS = Object.keys(ORIGINS) as OriginId[]

export const isOriginId = (value: unknown): value is OriginId => typeof value === 'string' && Object.hasOwn(ORIGINS, value)

/** 家学加成：不是这一家就是 0 */
export function originPerk(player: Pick<PlayerDTO, 'origin'>, kind: OriginPerkKind) {
  const perk = player.origin ? ORIGINS[player.origin]?.perk : undefined
  return perk?.kind === kind ? perk.amount : 0
}

/** 家人伙伴与家事只对这一家出身的侠客开放；不带家世的条目人人可见 */
export const openToOrigin = (entry: { origin?: OriginId }, player: Pick<PlayerDTO, 'origin'>) =>
  !entry.origin || entry.origin === player.origin

export function originStatsText(origin: OriginConfig) {
  const LABEL: Record<keyof SixStats, string> = { str: '臂力', con: '根骨', agi: '身法', intStat: '悟性', luck: '福缘', karma: '侠义' }
  return Object.entries(origin.stats).map(([key, value]) => `${LABEL[key as keyof SixStats]} +${value}`).join('、')
}
