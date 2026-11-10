import type { GhostMarketListingDTO, PendingAdventureDTO, RoomPlayerDTO, UniqueArtifactStatusDTO } from './protocol'
import { ITEMS } from '@/config/gameData'

export { calcNextLevelQi, computeDerivedStats, evaluateStanceAdvantage, simulateServerBattle } from '../../../shared/battle.ts'

/** 模拟同地图在线真实玩家池 */
export function generateRoomPlayers(mapId: string): RoomPlayerDTO[] {
  if (mapId === 'jiaxing_suburb') {
    return [
      { id: 'rp_1', nickname: '烟雨断桥客', sectName: '逍遥散人', realmName: '融会贯通', level: 34, combatPower: 14200, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_2', nickname: '清风道长', sectName: '终南全真教', realmName: '炉火纯青', level: 48, combatPower: 26800, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_3', nickname: '桃花小师妹', sectName: '东海桃花岛', realmName: '略有小成', level: 27, combatPower: 10900, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_4', nickname: '逆徒·尹狂刀', sectName: '全真弃徒', realmName: '融会贯通', level: 36, combatPower: 15600, stance: 'FIERCE', isBetrayerBounty: true, isEscortingDart: false },
    ]
  }
  if (mapId === 'zhongnan_forest') {
    return [
      { id: 'rp_5', nickname: '活死人墓客', sectName: '终南古墓派', realmName: '炉火纯青', level: 52, combatPower: 33400, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
      { id: 'rp_6', nickname: '重阳执剑人', sectName: '终南全真教', realmName: '融会贯通', level: 41, combatPower: 21500, stance: 'TAICHI', isBetrayerBounty: false, isEscortingDart: false },
    ]
  }
  if (mapId === 'damo_caravan') {
    return [
      { id: 'rp_7', nickname: '威远总镖头', sectName: '丐帮', realmName: '融会贯通', level: 38, combatPower: 18500, stance: 'FIERCE', isBetrayerBounty: false, isEscortingDart: true },
      { id: 'rp_8', nickname: '西域毒皇·欧阳烈', sectName: '西域白驼山庄', realmName: '一代宗师', level: 63, combatPower: 64200, stance: 'FIERCE', isBetrayerBounty: false, isEscortingDart: false, holdingUniqueArtifact: '真·绿玉打狗棒' },
      { id: 'rp_9', nickname: '塞外孤狼', sectName: '逍遥散人', realmName: '略有小成', level: 29, combatPower: 12800, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: true },
    ]
  }
  return [
    { id: 'rp_10', nickname: '湘西赶尸人', sectName: '西域白驼山庄', realmName: '炉火纯青', level: 47, combatPower: 27900, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: false },
    { id: 'rp_11', nickname: '陆乘云', sectName: '东海桃花岛', realmName: '一代宗师', level: 65, combatPower: 71000, stance: 'AGILE', isBetrayerBounty: false, isEscortingDart: true, holdingUniqueArtifact: '真·桃花岛软猬甲' },
  ]
}

/** 初始全服唯一真品神兵公示表 */
export const INITIAL_UNIQUE_ARTIFACTS: UniqueArtifactStatusDTO[] = [
  { artifactCode: 'TRUE_TULONG', itemId: 'xuantie_heavysword', name: '真·屠龙宝刀', holderNickname: '萧峰传人·乔北冥', holderSect: '丐帮', defendStreak: 3, nextContestLabel: '周日20:00 王盘山扬刀大会' },
  { artifactCode: 'TRUE_DAGOU', itemId: 'dagou_stick_true', name: '真·绿玉打狗棒', holderNickname: '西域毒皇·欧阳烈', holderSect: '西域白驼山庄', defendStreak: 1, nextContestLabel: '离线>72h自动回收 / 君山擂台' },
  { artifactCode: 'TRUE_RUANWEI', itemId: 'ruanwei_armor', name: '真·桃花岛软猬甲', holderNickname: '陆乘云', holderSect: '东海桃花岛', defendStreak: 5, nextContestLabel: '周六试剑亭守擂' },
  { artifactCode: 'TRUE_YITIAN', itemId: 'biyu_xiao', name: '真·倚天剑', holderNickname: null, holderSect: '万安寺秘境待择主', defendStreak: 0, nextContestLabel: '全服首通3.0倚天篇择主' },
]

/** 初始子时鬼市匿名寄售与竞拍单 */
export const INITIAL_GHOST_LISTINGS: GhostMarketListingDTO[] = [
  { id: 'mk_1', maskedSeller: '蒙面客·甲戌', itemId: 'kongming_quan', itemName: '《空明拳》手抄拓本', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 6800, desc: '清音洞孤本拓印，至柔化刚拳谱。' },
  { id: 'mk_2', maskedSeller: '黑衣人·丙辰', itemId: 'wucan_baoyi', itemName: '大雪山乌蚕宝衣', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 8500, desc: '穿上能提高防御和气血上限。' },
  { id: 'mk_3', maskedSeller: '全真逆徒·匿名销赃', itemId: 'jiuwei_fox', itemName: '黑沼·九尾灵狐', tier: 'orange', listingType: 'FIXED', currency: 'SILVER', price: 9200, desc: '白狐伴你同行，提高气血上限和暴击率。' },
  { id: 'mk_4', maskedSeller: '鬼市压轴官拍', itemId: 'lingbo_weibu', itemName: '《凌波微步》琅嬛帛卷', tier: 'red', listingType: 'AUCTION', currency: 'GOLD', price: 320, highestBidderMasked: '蒙面客·癸亥', desc: '一门轻功，能让你更容易闪避。躲开攻击还能攒怒气。' },
  { id: 'mk_5', maskedSeller: '关外客商', itemId: 'snow_hood', itemName: ITEMS.snow_hood.name, tier: ITEMS.snow_hood.tier, listingType: 'FIXED', currency: 'SILVER', price: 8800, desc: ITEMS.snow_hood.desc },
  { id: 'mk_6', maskedSeller: '走镖人', itemId: 'deerskin_boots', itemName: ITEMS.deerskin_boots.name, tier: ITEMS.deerskin_boots.tier, listingType: 'FIXED', currency: 'SILVER', price: 4800, desc: ITEMS.deerskin_boots.desc },
]

/** 随机奇遇事件模板池 */
export const ADVENTURE_POOL: Omit<PendingAdventureDTO, 'id'>[] = [
  {
    title: '赵王府药房·宝蛇异香',
    location: '中都赵王府后院',
    description: '你溜进梁子翁的药房，一条红蛇突然从竹篓里蹿出来。这条蛇吃了二十年的灵药，听说它的血能助人练功。',
    options: [
      { key: 'A', label: '抓住宝蛇，饮下蛇血', requirementText: '根骨 +4，真气 +3,500', canSelect: true },
      { key: 'B', label: '放走宝蛇，取走桌上的银两', requirementText: '侠义 +30，纹银 +2,500', canSelect: true },
    ],
  },
  {
    title: '昆仑翠谷·苍猿腹痛',
    location: '断崖百丈幽谷',
    description: '你采药时跌进山谷。一只老白猿慢慢走过来，指着肚子上的旧伤，像在求你帮忙。',
    options: [
      { key: 'A', label: '给白猿处理旧伤', requirementText: '学会《九阳神功》', canSelect: true },
      { key: 'B', label: '喂白猿吃些止痛草药', requirementText: '侠义 +50，福缘 +3', canSelect: true },
    ],
  },
  {
    title: '桃花清音洞·画方画圆',
    location: '桃花岛石洞',
    description: '老顽童周伯通拉住你，笑道：“好兄弟，来试试左手画方，右手画圆！”',
    options: [
      { key: 'A', label: '试试一手画方，一手画圆', requirementText: '身法 +3，学会《空明拳》', canSelect: true },
      { key: 'B', label: '陪老顽童斗蟋蟀', requirementText: '周伯通好感 +120，真气 +4,000', canSelect: true },
    ],
  },
]
