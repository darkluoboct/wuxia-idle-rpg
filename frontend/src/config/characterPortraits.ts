import { COMPANIONS } from './gameData'

const files = import.meta.glob<string>('../assets/portraits/*.webp', {
  eager: true, import: 'default', query: '?url',
})

export const CHARACTER_PORTRAITS: Partial<Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -5), url]),
)

const npcNames = {
  wangjike: ['忘机客'],
  jin_assassin: ['黑衣刺客', '金国细作头目', '蒙面刀客', '蒙面刀客首领', '金国死士', '死士营百夫长', '金国左翼死士', '金国右翼死士', '烟雨楼杀手'],
  zuixian_innkeeper: ['醉仙楼掌柜'],
  zuixian_attendant: ['醉仙楼伙计'],
  laisan: ['赖三'],
  jiaodaheng: ['焦大亨'],
  liaowang: ['了妄和尚'],
  tiemuer: ['帖木儿'],
  yinlingke: ['阴陵客'],
  tongshou: ['铜首', '东海巨舶铜首'],
  huluhu: ['忽鲁忽'],
  qianlaoda: ['钱老大'],
  fanjiangao: ['翻江鳌'],
  qiaobeiming: ['乔北冥'],
  qingfeng_daozhang: ['清风道长'],
  npc_bandit: [
    '荒山草贼', '草贼头目', '酒肆泼皮', '恶霸打手头', '嘉兴地痞', '盗墓贼', '双煞爪牙',
    '黑风寨喽啰', '黑风寨头目', '截道响马', '绿林悍匪', '彭家寨大头目', '黄河帮帮众',
    '黄河帮舵主', '黄河帮刀手头目', '庄上护院', '刘府护院教头', '刘府家丁',
    '王府家丁', '王府护院教头', '劫药山贼头目', '山贼',
  ],
  npc_jin_infantry: [
    '王府亲兵', '王府亲兵统领', '王府侍卫统领', '赵王府追兵统领', '赵王卫队统领',
    '持刀追兵', '金国刀手', '金国刀卫', '闸口金兵队正', '巡河金兵', '金兵斥候', '金兵什长',
  ],
  npc_jin_archer: ['金国弓手', '金国弓卫', '持弓追兵', '闸楼弓手', '金兵搜山斥候'],
  npc_quanzhen: ['全真弟子', '全真执剑弟子', '假道士', '假道士头目'],
  npc_monk: ['护寺棍僧', '罗汉堂执棍僧'],
  npc_water_raider: ['太湖水贼', '水寨喽啰', '码头打手', '芦苇荡水寇', '南湖水匪头', '归云庄头领'],
  npc_mongol_rider: ['蒙古游骑', '蒙古铁骑', '蒙古千夫长', '怯薛万夫长', '神射百夫长', '克烈长枪骑兵', '克烈弓骑兵'],
  npc_baituo: [
    '白驼山蛇奴', '白驼山护卫', '火船蛇奴', '白驼蛇阵头目', '孤岛蛇奴', '白驼山驭蛇使',
    '白驼山驭蛇长老', '蛇奴统领', '白驼山死士首领', '白驼山执事', '白驼山门人',
  ],
}

const idsByName = new Map([
  ...Object.values(COMPANIONS).map(({ name, id }) => [name, id] as const),
  ...Object.entries(npcNames).flatMap(([id, names]) => names.map((name) => [name, id] as const)),
  ['完颜康', 'yangkang'],
  ['刘瑛姑', 'yinggu'],
  ['赵志敬', 'zhaozhijing'],
  ['陈玄风', 'chenxuanfeng'],
  ['梁子翁', 'liangziweng'],
  ['裘千丈', 'qiuqianzhang'],
  ['完颜洪烈', 'wanyanhonglie'],
  ['彭连虎', 'penglianhu'],
  ['沙通天', 'shatongtian'],
  ['侯通海', 'houtonghai'],
  ['沈青刚', 'shenqinggang'],
  ['吴青烈', 'wuqinglie'],
  ['马青雄', 'maqingxiong'],
  ['钱青健', 'qianqingjian'],
  ['陆冠英', 'luguanying'],
  ['包惜弱', 'baoxiruo'],
  ['桑昆', 'sangkun'],
  ['段天德', 'duantiande'],
  ['尹志平', 'yinzhiping'],
  ['彭长老', 'gaibang_peng'],
  ['简长老', 'gaibang_jian'],
  ['梁长老', 'gaibang_liang'],
])

export function portraitByName(name: string) {
  for (const segment of name.split('·').reverse()) {
    const id = idsByName.get(segment.split(/[（(]/u, 1)[0].trim())
    if (id && CHARACTER_PORTRAITS[id]) return CHARACTER_PORTRAITS[id]
  }
}
