import type { CombatUnitDTO } from './protocol.ts'
import type { ScriptPage, SceneId } from './stageScripts.ts'

type PortraitStyle = CombatUnitDTO['portraitStyle']

/**
 * 门派的山门、引路人、门规和拜师那一段剧情（docs/27 第一章收尾）。
 * 拜师时按这里放一段卷轴；门派页在拜师前后都摆出山门与门规。
 * 能接上第一章的地方都接上了：江南武馆就是序章里把你拒之门外的那家，全真引路的是醉仙楼上的赵志敬，
 * 桃花岛认的是忘机客留下的曲三铁八卦。
 */
export interface SectLore {
  /** 印章上的一个字 */
  glyph: string
  /** 山门所在 */
  seat: string
  /** 收你入门的人 */
  mentor: { name: string; portrait: PortraitStyle }
  /** 门派页上的一句江湖传言 */
  hearsay: string
  /** 三条门规 */
  rules: readonly [string, string, string]
  /** 拜师那一段，每页不超过 120 字 */
  initiation: readonly ScriptPage[]
  scene?: SceneId
}

export const SECT_LORE: Record<string, SectLore> = {
  jiangnan_wuguan: {
    glyph: '武',
    seat: '嘉兴城南 · 江南武馆',
    mentor: { name: '铁拳张', portrait: 'hero_sword' },
    hearsay: '城南的老字号武馆，什么人都收，学成了随时可以转投名门。当年说「这孩子学不得武」的，也是这里的总教头。',
    rules: ['卯时练桩，午时对拆。', '同门切磋，点到为止。', '想走随时走，武馆从不留人。'],
    initiation: [
      { text: '江南武馆在嘉兴城南，门口那两尊石狮子你再熟悉不过——当年你就是在这里吃的闭门羹。\n这一回，总教头铁拳张亲自迎到了门口。' },
      { speaker: '铁拳张', portrait: 'hero_sword', text: '当年说你学不得武的，是我张某人。荒山那一战传遍了嘉兴，我有眼无珠。这碗拜师茶，该我先敬你。' },
      { text: '武馆的规矩简单：卯时练桩，午时对拆，出师不问去处。\n你在练武场上站完第一个桩，手心全是汗，心里却是满的。' },
    ],
    scene: 'jiaxing-spring',
  },
  quanzhen: {
    glyph: '全',
    seat: '终南山 · 重阳宫',
    mentor: { name: '丘处机', portrait: 'daoist' },
    hearsay: '天下武学正宗。全真弟子打坐比旁人多得两成半真气，只是规矩也多。',
    rules: ['每日早晚两课吐纳，不可间断。', '不得滥杀，不得欺压良善。', '同门有难，必援之。'],
    initiation: [
      { text: '终南山上松涛如海。重阳宫前，那个在醉仙楼上和你过过招的赵志敬黑着脸替你引路，一路上一句话也没说。' },
      { speaker: '丘处机', portrait: 'daoist', text: '醉仙楼上那几招，贫道记着呢。全真门下，先学做人，再学练剑。吐纳功夫每日不可间断，你记住了？' },
      { text: '你行过拜师礼，换上一身灰布道袍，成了全真教的知客道童。\n当晚在重阳宫后殿打坐，你第一次觉得真气走得这样顺。' },
    ],
    scene: 'zhongnan',
  },
  gaibang: {
    glyph: '丐',
    seat: '洞庭君山 · 丐帮总舵',
    mentor: { name: '简长老', portrait: 'hongqigong' },
    hearsay: '天下第一大帮，帮主洪七公神龙见首不见尾。持引荐信入门，长老们会高看一眼。',
    rules: ['帮中兄弟有难，打狗棒下护之。', '不偷不抢，讨来的饭才吃得心安。', '见了金兵，绕不过去就打。'],
    initiation: [
      { text: '丐帮总舵在洞庭君山，可嘉兴南湖边的破庙里，也蹲着几个背布袋的叫花子。你递上名帖，一个白须长老眯着眼看了你半天。' },
      { speaker: '简长老', portrait: 'hongqigong', text: '穿得这么齐整，也想当叫花子？先背一袋。讨得到饭，才算丐帮的人。' },
      { text: '你把破布袋往肩上一甩，成了丐帮的一袋弟子。\n当晚你蹲在南湖边，讨来了平生第一碗饭。饭是冷的，叫花子们的笑声却是热的。' },
    ],
  },
  taohua: {
    glyph: '桃',
    seat: '东海 · 桃花岛',
    mentor: { name: '黄药师', portrait: 'huangyaoshi' },
    hearsay: '东邪黄药师的岛，奇门阵法遍地，外人上不去。听说只认一样信物：刻着桃花暗记的铁八卦。',
    rules: ['不问出身，只问天分。', '岛上奇门阵法，不得泄于外人。', '别给为师丢人。'],
    initiation: [
      { text: '你按铁八卦背面的暗记，在东海上漂了三天，终于看见满岛桃花。哑仆领你穿过石阵，一个青袍人背对着你，手里把玩着一支玉箫。' },
      { speaker: '黄药师', portrait: 'huangyaoshi', text: '这铁八卦，是我那不成器的徒儿曲灵风的东西。他把它给了你，便是认了你。桃花岛只有一条规矩：别给我丢人。' },
      { text: '你在桃林里扫了三天落花，成了候补扫花童。\n第四天清晨，你在花瓣落下的轨迹里，忽然看懂了落英神剑掌的第一式。' },
    ],
  },
  baituo: {
    glyph: '驼',
    seat: '西域 · 白驼山庄',
    mentor: { name: '欧阳锋', portrait: 'ouyangfeng' },
    hearsay: '西毒欧阳锋的山庄，不讲侠义，只讲本事。名门正派瞧不上的人，白驼山瞧得上。',
    rules: ['山庄只认本事，不问正邪。', '庄主的蛇，不许碰。', '叛出山庄者，蛇毒追之。'],
    initiation: [
      { text: '白驼山远在西域，山庄的人却在中原到处走动。你在嘉兴的客栈里收到一封无字信，信封上画着一条盘起来的白蛇。' },
      { speaker: '欧阳锋', portrait: 'ouyangfeng', text: '江湖上那些名门正派瞧不上你，白驼山瞧得上。在我这里，本事就是规矩。' },
      { text: '你喝下那碗泛着腥气的拜师酒，成了白驼山庄的捕蛇杂役。\n第二天醒来，手心多了一道蛇牙印。从此百毒难侵——至少，他们是这么告诉你的。' },
    ],
    scene: 'damo',
  },
  tiezhang: {
    glyph: '铁',
    seat: '湘西 · 铁掌峰',
    mentor: { name: '裘千仞', portrait: 'qiuqianren' },
    hearsay: '湘西五指峰下的大帮，帮主裘千仞一双铁掌罕逢敌手。不问善恶，只要臂力够。',
    rules: ['帮中只认掌力，掌力就是规矩。', '帮主之命，不得违逆。', '先断退路，方能向前。'],
    initiation: [
      { text: '铁掌峰在湘西，五座山峰形如五指。山门前的铁牌上刻着八个字：「入我帮者，先断退路。」' },
      { speaker: '裘千仞', portrait: 'qiuqianren', text: '掌力倒还有几分。铁掌帮不收软骨头——挑三个月的水，再来学掌。' },
      { text: '那一掌拍在你肩头，你膝盖一软，硬是没跪。\n你挑着水桶走上第一级石阶，成了铁掌帮的挑水杂役。山风里有铁锈的味道，你没回头。' },
    ],
    scene: 'heizhao',
  },
  yideng: {
    glyph: '灯',
    seat: '大理 · 一灯居',
    mentor: { name: '一灯大师', portrait: 'yideng' },
    hearsay: '南帝一灯大师隐居的草庐，上山要过渔、樵、耕、读四关。指力能化开铁布衫，也能救人性命。',
    rules: ['以慈悲为本，指力不伤无辜。', '渔樵耕读，各守其职。', '心中有灯，路便不暗。'],
    initiation: [
      { text: '渔、樵、耕、读四关之后，山顶的茅庐里坐着一位白眉僧人。他抬手示意你坐下，桌上一壶茶刚刚沏好。' },
      { speaker: '一灯大师', portrait: 'yideng', text: '你一路打上山来，伤了我四个弟子的面子，却没伤他们的人。一灯居收徒，只看这一点。' },
      { text: '你在佛前叩了三个头，成了一灯居的洒扫沙弥。\n晨钟响起时，你扫完了第一级台阶上的落叶。' },
    ],
  },
}
