import { jianghuHour } from './combatMeta.ts'
import type { LoadoutPresetDTO, PlayerDTO, SectChoreEntryDTO } from './protocol.ts'
import { sectContributionGain } from './sectProgress.ts'
import { IDLE_CAP_MS } from './trialStages.ts'

/**
 * 师门差事（docs/29）：拜师之后挂机，每满一个时辰（两小时）替师门办一件差事，收功时记功、写进师门日常。
 * 差事按门派、阶位和那件事发生的时辰挑文案，记的门派贡献拿去师门宝库换东西（shared/sectExchange.ts）。
 */

export const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const
export type Shichen = (typeof SHICHEN)[number]

/** 某一刻是哪个时辰（子时 23:00 起，北京时间） */
export const shichenAt = (at: number): Shichen => SHICHEN[Math.floor(((jianghuHour(new Date(at)) + 1) % 24) / 2)]

export const SECT_CHORE_MS = 2 * 3_600_000
/** 一次收功最多记 12 件：挂机本身最多攒 24 小时 */
export const SECT_CHORE_MAX = IDLE_CAP_MS / SECT_CHORE_MS
/** 师门日常里留最近几件 */
export const SECT_CHORE_RECENT = 6

export interface SectChore {
  id: string
  place: string
  text: string
  /** 记的门派贡献（佩饰的贡献加成另算） */
  contrib: number
  /** 到这一阶才轮得到的差事 */
  minRank?: number
  /** 只在这几个时辰发生；不写就是什么时辰都行 */
  when?: readonly Shichen[]
}

const DAYTIME = ['卯', '辰', '巳', '午', '未', '申'] as const

export const SECT_CHORES: Record<string, readonly SectChore[]> = {
  jiangnan_wuguan: [
    { id: 'zhuang', place: '练武场', contrib: 35, when: ['卯', '辰'], text: '你在木人桩前站完一炷香的马步。铁拳张路过，拿棍子往你膝弯一敲：「再低三分。」' },
    { id: 'bingqi', place: '兵器架', contrib: 40, when: ['未', '申'], text: '你把兵器架上的刀枪挨个擦了一遍。有柄朴刀锈得厉害，你磨到日头偏西才见了亮。' },
    { id: 'mibao', place: '南湖码头', contrib: 35, when: ['辰', '巳', '午', '未', '申'], text: '馆里的米缸见了底，你去南湖码头扛了半日米包。回来时，师兄已经替你留好一碗饭。' },
    { id: 'zuixian', place: '醉仙楼', contrib: 45, when: ['午', '未', '申', '酉', '戌'], text: '醉仙楼掌柜来请人镇场子，说楼上两拨江湖客拍了桌子。你去站了一个时辰，谁也没敢动手。' },
    { id: 'menkou', place: '武馆门口', contrib: 50, text: '门口又来了个想学武的孩子，瘦得像根竹竿。你想起当年的自己，替他向总教头说了一句话。' },
    { id: 'xunye', place: '院墙', contrib: 35, when: ['戌', '亥', '子', '丑'], text: '你提着灯笼绕武馆巡了一圈夜。墙头黑影一闪，第二天才知道，是隔壁偷枣的猴子。' },
    { id: 'duichai', place: '对拆场', contrib: 40, when: ['午', '未'], text: '午时对拆，你和三师兄过了二十招。他输了半招，嘴上不服，晚饭却把鸡腿夹给了你。' },
    { id: 'zhangfang', place: '账房', contrib: 40, when: ['未', '申', '酉'], text: '你帮账房先生核了一下午的账，才发现武馆收穷人家的孩子，从来不收学费。' },
    { id: 'yeda', place: '后院', contrib: 35, when: ['子', '丑', '寅'], text: '半夜睡不着，你摸黑去后院打了一套开山掌。月亮底下，影子比你打得还认真。' },
    { id: 'daitu', place: '练武场', contrib: 45, minRank: 3, when: DAYTIME, text: '你替总教头带新来的学徒站桩。有个孩子摔了七回，第八回站稳了，冲你咧嘴一笑。' },
    { id: 'biaoju', place: '城北镖局', contrib: 50, minRank: 4, text: '城北镖局来借人押一趟短镖，总教头点了你的名。一路平安，镖头回来给武馆送了一坛好酒。' },
  ],
  gaibang: [
    { id: 'pomiao', place: '破庙篝火', contrib: 45, when: ['酉', '戌', '亥'], text: '你和几个污衣兄弟围着火堆分一只叫花鸡。鲁有脚长老啃着鸡腿，顺手指点了你两招棒法。' },
    { id: 'taofan', place: '南湖边', contrib: 35, when: ['辰', '巳', '午'], text: '你端着破碗在南湖边唱了半天莲花落，讨来三个冷馒头，分了两个给瘸腿的老叫花。' },
    { id: 'chuanxin', place: '土地庙', contrib: 40, text: '总舵来的兄弟塞给你一根打了结的草绳，要你送去城西土地庙。结里的暗号你看不懂，腿却跑得飞快。' },
    { id: 'chengmen', place: '城门口', contrib: 40, when: DAYTIME, text: '你蹲在城门口晒太阳，把进出的金兵数了个清楚，天黑前报给了帮里的三袋兄弟。' },
    { id: 'xishen', place: '河边', contrib: 35, when: ['巳', '午', '未'], text: '净衣派的简长老嫌你身上馊味太重，叫你去河边洗了三遍。洗完回来，他还是捏着鼻子。' },
    { id: 'touji', place: '破庙', contrib: 40, when: ['子', '丑', '寅'], text: '半夜有人在破庙外鬼鬼祟祟。你抄起竹棍喝了一声——是个偷鸡贼，偷的正是兄弟们明早那只鸡。' },
    { id: 'budai', place: '草棚', contrib: 30, text: '你坐在草棚里把背上的布袋补了又补。帮里的规矩：袋子可以破，不能丢。' },
    { id: 'jiusi', place: '酒肆后门', contrib: 35, when: ['戌', '亥', '子'], text: '酒肆打烊，伙计把剩酒剩菜倒给你们。一个老兄弟喝多了，敲着破碗唱了半宿莲花落。' },
    { id: 'laogai', place: '街口', contrib: 45, minRank: 2, when: ['午', '未', '申'], text: '一个白胡子老叫花在你讨饭的街口睡了一下午，醒来吃了你碗里的半只鸡，拍拍屁股就走。后来才听说，那是帮主。' },
    { id: 'matou', place: '码头', contrib: 50, minRank: 3, when: DAYTIME, text: '你领着几个一袋小兄弟去码头帮工，跟船老大讲好了工钱，一文也没让人克扣。' },
    { id: 'fenduo', place: '分舵', contrib: 50, minRank: 4, text: '两个分舵为一块讨饭的地盘吵到你跟前。你听完两边的话，各骂了一顿，又各请了一碗酒。' },
  ],
  quanzhen: [
    { id: 'zaoke', place: '重阳宫', contrib: 35, when: ['寅', '卯'], text: '早课钟声一响，你和师兄弟在大殿诵了一遍《道德经》。打了个哈欠，被赵志敬瞪了一眼。' },
    { id: 'wanke', place: '后殿', contrib: 40, when: ['酉', '戌', '亥'], text: '晚课吐纳，你闭目调息到月上松梢，丹田里那团气又沉实了几分。' },
    { id: 'tiaoshui', place: '石阶', contrib: 35, when: ['卯', '辰', '巳'], text: '你挑着两桶水上了重阳宫后的石阶，三百六十级，一滴没洒。知客师兄点了点头。' },
    { id: 'jinxiang', place: '山门', contrib: 40, when: ['巳', '午', '未', '申'], text: '山下来了一队进香的乡民。你领他们拜过重阳祖师像，一路把「全真」二字的来历讲了三遍。' },
    { id: 'chaojing', place: '藏经阁', contrib: 40, when: ['午', '未', '申'], text: '你在藏经阁抄了一下午《分梨十化集》，手腕酸得抬不起来，字倒是越写越端正了。' },
    { id: 'jiebei', place: '后山界碑', contrib: 35, when: ['亥', '子', '丑'], text: '后山古墓那边又传来琴声。师兄说那是古墓派的地界，叫你巡到界碑就回头。' },
    { id: 'songxia', place: '松下', contrib: 40, text: '你在松下打坐，一只松鼠跳上你的肩头又跳走了。你一动没动，事后想来，这大概就是「静」。' },
    { id: 'kaoxiao', place: '练剑坪', contrib: 45, when: ['辰', '巳', '午', '未', '申', '酉'], text: '丘处机回山考校你的剑法，看了三招说：「太老实。」又看了三招：「老实也好。」' },
    { id: 'danlu', place: '丹房', contrib: 35, when: ['子', '丑', '寅'], text: '丹房的炉火一夜不能断。你守在炉前添柴，数着炉盖上冒出的白气，数到天快亮。' },
    { id: 'beidou', place: '北斗阵', contrib: 45, minRank: 3, when: ['辰', '巳', '午', '未', '申'], text: '你随师兄们演练天罡北斗阵，站的是天权位。阵势转到第七变，你才跟上了脚步。' },
    { id: 'xiashan', place: '山下集市', contrib: 45, minRank: 4, text: '你带四代小道童下山采买，回来时身后多了个小乞丐。你给他留了一碗斋饭，没赶他走。' },
  ],
  taohua: [
    { id: 'saohua', place: '桃林', contrib: 35, when: ['辰', '巳', '午'], text: '你扫了一上午落花，风一过又落满了。哑仆比划着告诉你：岛主不许扫干净。' },
    { id: 'shijian', place: '试剑亭', contrib: 40, when: ['未', '申', '酉'], text: '你随哑仆在试剑亭对拆。他不出声，剑却极快，你衣袖上添了三道浅浅的口子。' },
    { id: 'xiaosheng', place: '竹林', contrib: 45, when: ['戌', '亥', '子'], text: '夜里竹林深处传来箫声。你顺着节拍运掌，掌风竟和箫声合上了半拍。' },
    { id: 'yishu', place: '桃花阵', contrib: 40, when: DAYTIME, text: '你奉命在桃花阵里移了三株桃树。阵眼一变，新来的哑仆在林子里转到天黑才出来。' },
    { id: 'shaishu', place: '精舍', contrib: 40, when: ['午', '未'], text: '你在精舍替岛主晒书，书里夹着几页算筹推演。你看了半日，只认出一个「易」字。' },
    { id: 'jiaoshi', place: '礁石滩', contrib: 35, when: ['卯', '辰'], text: '清晨退潮，你在礁石间捡了一篓海蛎子。厨下的哑仆冲你竖了竖大拇指。' },
    { id: 'yandong', place: '岩洞', contrib: 45, text: '你给岛东岩洞里那位老先生送饭。他隔着洞口要跟你打赌，你没理他，他便自己跟自己打了起来。' },
    { id: 'hualu', place: '药房', contrib: 40, when: ['寅', '卯', '辰'], text: '药房的九花玉露丸要用清晨的花露。你提着瓷瓶在桃林里收了一早上的露水。' },
    { id: 'chaoshui', place: '海边', contrib: 35, when: ['子', '丑', '寅'], text: '你睡不着，坐在海边看潮水一层层漫上来。岛上的灯一盏盏熄了，只有精舍那盏一直亮着。' },
    { id: 'fengmu', place: '冯夫人墓', contrib: 50, minRank: 3, text: '你在冯夫人墓前扫去落花，换上新摘的桃枝。岛主远远站着，一句话也没说。' },
    { id: 'tanzhi', place: '积翠亭', contrib: 50, minRank: 4, text: '岛主随手弹出一粒石子，打落你鬓边一片花瓣。你练了一夜，天亮时才弹中一片。' },
  ],
  baituo: [
    { id: 'weishe', place: '万蛇毒窟', contrib: 45, when: ['亥', '子', '丑'], text: '你提着竹篓下毒窟喂蛇。一条金环蛇猛地窜起，咬向你手腕，被你一指弹开。' },
    { id: 'qushe', place: '蛇谷', contrib: 35, text: '蛇奴吹着竹笛把蛇群赶进山谷。你跟在后面数，数到三千多条，就数乱了。' },
    { id: 'tuodui', place: '驼队', contrib: 40, when: ['辰', '巳', '午', '未'], text: '你随驼队去商路上收货。驼铃叮当响了一路，领队的白衣女子从头到尾没跟你说一句话。' },
    { id: 'aodu', place: '丹房', contrib: 40, when: ['未', '申', '酉'], text: '你守着一锅蛇毒熬了三个时辰，眼睛熏得通红。管事用银针蘸了一点，说火候还差一分。' },
    { id: 'hama', place: '后院', contrib: 40, text: '你在后院学着蹲成一只蛤蟆，憋气、鼓腹、发力。墙头看热闹的小蛇吓得缩回了洞里。' },
    { id: 'kefang', place: '客房', contrib: 35, when: ['酉', '戌'], text: '少庄主又从中原带回几个白衣女子。你被派去收拾客房，顺手把床底下的蛇也挪了窝。' },
    { id: 'liehu', place: '山道', contrib: 45, text: '一个误闯山庄的猎户被蛇咬了。你偷偷给他敷了解药，送他下山。管事看见了，只当没看见。' },
    { id: 'xuelian', place: '雪线', contrib: 40, when: ['寅', '卯', '辰'], text: '清早你上雪线采雪莲，回来时靴子冻成了冰坨，篓里的雪莲一朵没少。' },
    { id: 'shishi', place: '石室外', contrib: 45, minRank: 3, text: '你守在庄主练功的石室外，听见里面一声声蛤蟆叫，震得石壁上的灰簌簌往下掉。' },
    { id: 'maidu', place: '前厅', contrib: 50, minRank: 4, text: '中原来的商人想跟山庄买蛇毒。你开了三倍的价，他眼都没眨就付了银子。' },
  ],
  tiezhang: [
    { id: 'tiaoshui', place: '石阶', contrib: 35, when: ['卯', '辰'], text: '你挑着两桶水上铁掌峰，一共八百级石阶。到了山顶，桶里的水还剩七成。' },
    { id: 'tiesha', place: '练功房', contrib: 45, text: '你把双掌插进烧热的铁砂里，一下，两下……数到三百下，手掌已经不像自己的了。' },
    { id: 'zhongzhi', place: '中指峰下', contrib: 35, when: ['戌', '亥', '子'], text: '帮里有条规矩：中指峰去不得。你巡夜时远远望了一眼，峰顶黑沉沉的，连只鸟都没有。' },
    { id: 'chuanqian', place: '江边码头', contrib: 40, when: ['巳', '午', '未'], text: '你随帮众去江边码头收船钱。有个船家实在交不出，你替他垫了，回去挨了堂主一顿骂。' },
    { id: 'jinren', place: '帮主厅外', contrib: 45, when: ['亥', '子', '丑'], text: '几个金国人深夜上山见帮主，你在门外守了一夜。他们下山时，抬的箱子比来时轻了许多。' },
    { id: 'duizhang', place: '对掌坪', contrib: 40, when: ['未', '申'], text: '午后对掌，你和外堂师兄连对十二掌，两人各退三步。他甩着手说：「好硬的骨头。」' },
    { id: 'datie', place: '兵器房', contrib: 40, when: ['申', '酉'], text: '兵器房的老铁匠叫你帮着抡大锤。你打了一下午，他说你这把力气，不来打铁可惜了。' },
    { id: 'shuishang', place: '江面', contrib: 35, when: ['未', '申', '酉'], text: '你看帮主在江面上踏水而行，学了一下午，湿了十七回裤腿。' },
    { id: 'tiepai', place: '山门', contrib: 35, when: ['寅', '卯'], text: '天不亮，你和几个杂役把山门前的铁牌擦得锃亮。「先断退路」四个字，你擦了三遍。' },
    { id: 'xingtang', place: '刑堂', contrib: 50, minRank: 3, text: '一个帮众偷了帮里的银子，按规矩该断一掌。你看了看他白发的老娘，那一掌落在了桌上。' },
    { id: 'shuizhai', place: '湘江水寨', contrib: 50, minRank: 4, text: '帮主让你去收服湘江上的一处水寨。你只带三个人，对着寨门拍了一掌，寨主当晚就递来了拜帖。' },
  ],
  yideng: [
    { id: 'chenzhong', place: '山门', contrib: 35, when: ['寅', '卯'], text: '晨钟响过，你扫完山门前的落叶，又把石阶上的青苔一级一级擦干净。' },
    { id: 'yu', place: '瀑布深潭', contrib: 40, when: ['卯', '辰', '巳'], text: '你随渔隐师兄在瀑布下的深潭里捉金娃娃。他一网下去空空如也，却说今天的鱼不想上岸。' },
    { id: 'qiao', place: '山坡', contrib: 40, when: ['午', '未'], text: '你跟樵子师兄上山砍柴。他一边砍一边唱《山坡羊》，你听着听着，斧子也落在了拍子上。' },
    { id: 'geng', place: '山腰稻田', contrib: 45, when: ['辰', '巳', '午', '未', '申'], text: '你帮农夫师兄犁地。他单手托起一块挡路的大石放到田埂上，你这才知道他力气有多大。' },
    { id: 'du', place: '书斋', contrib: 40, when: ['酉', '戌'], text: '书生师兄出了个上联考你，你对了一晚上没对出来。他笑说，下联在你明天扫的落叶里。' },
    { id: 'songjing', place: '佛堂', contrib: 40, when: ['亥', '子'], text: '夜里你陪大师诵经。他念到一半停了下来，望着山下出了好一会儿神。' },
    { id: 'tuigong', place: '禅房', contrib: 45, text: '大师为山下来的病孩子推宫过血，你在旁边端着热水，看见大师额头上全是汗。' },
    { id: 'shiwu', place: '石阶', contrib: 35, text: '山路上起了雾。你坐在石阶上打坐，雾气散时，衣襟上落满了露水。' },
    { id: 'caiyuan', place: '菜园', contrib: 35, when: ['巳', '午'], text: '你在菜园里挑粪浇菜，小沙弥捂着鼻子跑开了。大师却蹲下来，帮你拔了一垄草。' },
    { id: 'tanbian', place: '潭边', contrib: 45, minRank: 3, when: ['亥', '子', '丑', '寅'], text: '你在潭边坐了一整夜。水声从吵闹到听不见，再到每一滴都听得清清楚楚。' },
    { id: 'fanjing', place: '经阁', contrib: 50, minRank: 4, text: '天竺来的僧人带来一卷梵文经书，大师让你抄录。你一个字也不识，抄得却格外仔细。' },
  ],
}

const choreIndex = new Map<string, SectChore>(Object.entries(SECT_CHORES).flatMap(([sectId, chores]) =>
  chores.map((chore) => [`${sectId}.${chore.id}`, chore] as const)))

/** 按日志里记的编号找回那件差事（文案改版后旧编号找不到就不显示） */
export const sectChoreOf = (id: string) => choreIndex.get(id)

/** 这一刻在这一阶轮得到的差事 */
export function eligibleSectChores(sectId: string, rank: number, shichen: Shichen) {
  return (SECT_CHORES[sectId] ?? []).filter((chore) => (chore.minRank ?? 1) <= rank && (!chore.when || chore.when.includes(shichen)))
}

type ChorePlayer = Pick<PlayerDTO, 'currentSectId' | 'sectRank' | 'sectContribution' | 'idleOff' | 'sectChores'>

/** 结算打坐时把这段挂机记下来：只记在师门里、正在挂机的时段，最多攒一天 */
export function accrueSectChores(player: Pick<PlayerDTO, 'currentSectId' | 'idleOff' | 'sectChores'>, elapsedMs: number) {
  if (!player.currentSectId || player.idleOff || !(elapsedMs > 0)) return
  const state = player.sectChores ??= { ms: 0, recent: [] }
  state.ms = Math.min(IDLE_CAP_MS, state.ms + elapsedMs)
}

/** 下一件差事还要挂多久；不在师门或没在挂机返回 undefined */
export function sectChoreWait(player: Pick<PlayerDTO, 'currentSectId' | 'idleOff' | 'sectChores' | 'lastSettleAt'>, now: number) {
  if (!player.currentSectId || player.idleOff) return
  const pending = Math.min(IDLE_CAP_MS, (player.sectChores?.ms ?? 0) + Math.max(0, now - player.lastSettleAt))
  const ready = Math.min(SECT_CHORE_MAX, Math.floor(pending / SECT_CHORE_MS))
  return { ready, waitMs: ready >= SECT_CHORE_MAX ? 0 : SECT_CHORE_MS - pending % SECT_CHORE_MS }
}

/** 入门、出师、叛师都从头记：上一个师门的差事不带走，日常也换一本 */
export function resetSectChores(player: Pick<PlayerDTO, 'sectChores'>) {
  delete player.sectChores
}

function pickChore(candidates: readonly SectChore[], avoid: readonly string[], previous: string | undefined, rng: () => number) {
  const fresh = candidates.filter((chore) => !avoid.includes(chore.id))
  const pool = fresh.length ? fresh : candidates.filter((chore) => chore.id !== previous)
  const list = pool.length ? pool : candidates
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

/**
 * 收功：攒满几个时辰就记几件差事。最近办过的先不重复；每件按它发生的时辰挑文案，
 * 从收功这一刻往回每两小时一件。返回这次记的差事，没有就是 undefined。
 */
export function drawSectChores(player: ChorePlayer, loadout: LoadoutPresetDTO, now: number, rng = Math.random) {
  const state = player.sectChores
  const sectId = player.currentSectId
  if (!state || !sectId || !SECT_CHORES[sectId]) return
  const count = Math.min(SECT_CHORE_MAX, Math.floor(state.ms / SECT_CHORE_MS))
  if (!count) return
  state.ms -= count * SECT_CHORE_MS
  const prefix = `${sectId}.`
  const avoid = state.recent.filter(({ id }) => id.startsWith(prefix)).map(({ id }) => id.slice(prefix.length))
  const entries: SectChoreEntryDTO[] = []
  for (let i = 0; i < count; i++) {
    const at = now - (count - 1 - i) * SECT_CHORE_MS
    const candidates = eligibleSectChores(sectId, player.sectRank, shichenAt(at))
    const chore = pickChore(candidates.length ? candidates : SECT_CHORES[sectId], avoid, avoid.at(-1), rng)
    avoid.push(chore.id)
    entries.push({ id: `${sectId}.${chore.id}`, at, contrib: sectContributionGain(chore.contrib, loadout) })
  }
  const contrib = entries.reduce((sum, entry) => sum + entry.contrib, 0)
  player.sectContribution += contrib
  state.recent = [...state.recent, ...entries].slice(-SECT_CHORE_RECENT)
  return { count, contrib, entries }
}

/** 日志里的一行：【申时·试剑亭】你随哑仆在试剑亭对拆…… */
export function sectChoreLine(entry: SectChoreEntryDTO) {
  const chore = sectChoreOf(entry.id)
  return chore && { heading: `${shichenAt(entry.at)}时·${chore.place}`, text: chore.text }
}
