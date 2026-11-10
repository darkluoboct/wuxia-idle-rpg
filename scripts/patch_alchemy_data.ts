import fs from 'node:fs'
import path from 'node:path'

const filePath = path.resolve('shared/gameData.ts')
let content = fs.readFileSync(filePath, 'utf8')

const alchemyCode = `
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
`

if (!content.includes('export const HERBS')) {
  content = content.trimEnd() + '\n' + alchemyCode
  fs.writeFileSync(filePath, content, 'utf8')
  console.log('Successfully appended alchemy data to shared/gameData.ts');
} else {
  console.log('Alchemy data already present in shared/gameData.ts');
}
