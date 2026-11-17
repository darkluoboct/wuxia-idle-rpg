import type { AdventureConfig } from './storyData.ts'

/**
 * 家事（docs/17 §七）：每个家世三段，分别在主线 1-3、2-1、2-3 首通后出现，只有这一家的侠客看得到。
 * 两个选项都给家人 10 枚家传信物，三段集齐 30 枚，加上生死之交（好感 600）即可觉醒。
 */
const TOKENS = 10

export const FAMILY_ADVENTURES: AdventureConfig[] = [
  // ───── 将门 · 义兄雷铮 ─────
  {
    id: 'family_jiangmen_1', origin: 'jiangmen', afterNodeId: 3,
    title: '风波亭旧账', location: '嘉兴城北·雷家旧宅',
    description: '深夜，几个蒙面人翻进雷家旧宅，翻箱倒柜找一只铁匣，里面是义父当年背嵬军的旧部名册。雷铮横枪守在堂前：「名册在，人就在。」',
    choices: [
      {
        key: 'A', label: '与义兄并肩守住旧宅',
        requirementText: '击退蒙面人后雷铮好感 +80，得家传信物 ×10、纹银 800。为首的会蓄力劈出「开山一刀」，背嵬枪法能打断。',
        battle: {
          enemyMain: {
            name: '蒙面刀客首领', title: '夜闯旧宅', portrait: 'bandit', hp: 2600, atk: 210, mp: 900, stance: 'AGILE',
            combat: { alignment: 'HERETIC', speed: 92, weapon: { form: 'BLADE', tier: 'green' }, charge: { round: 3, name: '开山一刀', damageMultiplier: 1.6 } },
          },
          enemyGuards: [
            { name: '蒙面刀客', title: '夜闯旧宅', portrait: 'bandit', hp: 1100, atk: 110, stance: 'AGILE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 88, weapon: { form: 'BLADE', tier: 'green' } } },
            { name: '蒙面刀客', title: '夜闯旧宅', portrait: 'bandit', hp: 1100, atk: 110, stance: 'FIERCE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 84, weapon: { form: 'BLADE', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '旧宅守夜', tone: 'gold', affinity: { leizheng: 80 }, tokens: { leizheng: TOKENS }, silver: 800,
          text: '蒙面人丢下两具同伙翻墙而逃。雷铮擦净枪头，从铁匣底层摸出一枚磨得发亮的背嵬腰牌塞给你：「义父的。他说，等你哪天挑得起枪，就交给你。」',
        },
      },
      {
        key: 'B', label: '连夜把名册转到城外义庄藏好',
        requirementText: '雷铮好感 +40，得家传信物 ×10、真气 +1,200',
        reward: {
          tag: '义庄藏册', tone: 'jade', affinity: { leizheng: 40 }, tokens: { leizheng: TOKENS }, qiExp: 1200,
          text: '你们抄小路把铁匣埋进义庄的空棺。天亮时雷铮才开口：「你比我想得周全。」临走前，他把一枚背嵬腰牌按进你手心。',
        },
      },
    ],
  },
  {
    id: 'family_jiangmen_2', origin: 'jiangmen', afterNodeId: 4,
    title: '名册落入王府', location: '中都·赵王府外',
    description: '名册还是走漏了一份抄本，落进赵王府。完颜洪烈的亲兵正按名单搜捕岳家旧部，第一个要抓的，是城南卖炊饼的老周，当年背嵬军的旗手。',
    choices: [
      {
        key: 'A', label: '夜探王府外营，截下搜捕的亲兵',
        requirementText: '击退亲兵后雷铮好感 +80，得家传信物 ×10，臂力 +2，侠义 +20',
        battle: {
          enemyMain: {
            name: '王府亲兵统领', title: '按名搜捕', portrait: 'wanyankang', hp: 5200, atk: 340, mp: 2100, stance: 'AGILE',
            combat: { faction: 'JIN', alignment: 'HERETIC', def: 80, speed: 94, weapon: { form: 'BLADE', tier: 'blue' }, charge: { round: 3, name: '铁骑冲营', damageMultiplier: 1.5 } },
          },
          enemyGuards: [
            { name: '王府亲兵', title: '按名搜捕', portrait: 'bandit', hp: 2300, atk: 210, stance: 'FIERCE', combat: { faction: 'JIN', alignment: 'HERETIC', joinsRound: true, speed: 86, weapon: { form: 'SPEAR', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '截营救人', tone: 'gold', affinity: { leizheng: 80 }, tokens: { leizheng: TOKENS }, stats: { str: 2, karma: 20 },
          text: '亲兵的火把在泥里熄了。老周拄着一根旧旗杆对雷铮直掉眼泪：「像，真像你爹。」他把当年那面背嵬旗的一角撕下来，交给你们收着。',
        },
      },
      {
        key: 'B', label: '托丐帮弟子给旧部报信，让他们先散了',
        requirementText: '雷铮好感 +40，得家传信物 ×10，侠义 +30，纹银 600',
        reward: {
          tag: '飞鸽散信', tone: 'jade', affinity: { leizheng: 40 }, tokens: { leizheng: TOKENS }, stats: { karma: 30 }, silver: 600,
          text: '一夜之间，名单上的人都换了住处。亲兵扑了个空。老周托人捎来一角旧旗，说是给雷家小子的。',
        },
      },
    ],
  },
  {
    id: 'family_jiangmen_3', origin: 'jiangmen', afterNodeId: 6,
    title: '栖霞岭祭父', location: '临安·栖霞岭',
    description: '义父来信，嘱雷铮替他去岳王坟前上一炷香。坟前松林里却伏着一队金国细作，专等岳家旧部来祭拜。',
    choices: [
      {
        key: 'A', label: '与义兄杀进松林',
        requirementText: '击退细作后雷铮好感 +100，得家传信物 ×10、真气 +4,000、纹银 2,500',
        battle: {
          enemyMain: {
            name: '金国细作头目', title: '松林伏兵', portrait: 'assassin', hp: 9000, atk: 480, mp: 3600, stance: 'AGILE',
            combat: { faction: 'JIN', alignment: 'HERETIC', def: 110, speed: 100, weapon: { form: 'BLADE', tier: 'blue' }, charge: { round: 4, name: '松林合围', damageMultiplier: 1.5, area: true } },
          },
          enemyGuards: [
            { name: '金国弓手', title: '松林伏兵', portrait: 'zhebie', hp: 3800, atk: 300, stance: 'AGILE', combat: { faction: 'JIN', alignment: 'HERETIC', joinsRound: true, speed: 90, weapon: { form: 'BOW', tier: 'green' } } },
            { name: '金国刀手', title: '松林伏兵', portrait: 'bandit', hp: 4200, atk: 320, stance: 'FIERCE', combat: { faction: 'JIN', alignment: 'HERETIC', joinsRound: true, speed: 86, weapon: { form: 'BLADE', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '坟前一炷香', tone: 'gold', affinity: { leizheng: 100 }, tokens: { leizheng: TOKENS }, qiExp: 4000, silver: 2500,
          text: '松林静下来，香才点得着。雷铮在坟前跪了很久，起身时说：「义父要我告诉岳元帅，背嵬军的枪，还有人在练。」',
        },
      },
      {
        key: 'B', label: '绕开埋伏，等夜深了再去上香',
        requirementText: '雷铮好感 +60，得家传信物 ×10、真气 +3,000',
        reward: {
          tag: '夜祭岳王', tone: 'jade', affinity: { leizheng: 60 }, tokens: { leizheng: TOKENS }, qiExp: 3000,
          text: '三更时分，你们摸到坟前插上三炷香。雷铮低声念了一遍背嵬军的旧番号，一个一个，一字不差。',
        },
      },
    ],
  },

  // ───── 渔家 · 大姐阮青篙 ─────
  {
    id: 'family_yujia_1', origin: 'yujia', afterNodeId: 3,
    title: '南湖码头', location: '嘉兴南湖·渔家码头',
    description: '渔霸钱老大带着一船打手堵住码头，要每家渔船交「湖钱」，不交就凿船。阮青篙抄起竹篙就往船头跳：「凿？先问问老娘的篙子！」',
    choices: [
      {
        key: 'A', label: '跟大姐一起把渔霸打下水',
        requirementText: '水上一战，击退渔霸后阮青篙好感 +80，得家传信物 ×10、纹银 900',
        battle: {
          environment: { water: true },
          enemyMain: {
            name: '南湖渔霸·钱老大', title: '强收湖钱', portrait: 'bandit', hp: 2300, atk: 185, mp: 800, stance: 'TAICHI',
            combat: { alignment: 'HERETIC', speed: 86, weapon: { form: 'STAFF', tier: 'green' } },
          },
          enemyGuards: [
            { name: '码头打手', title: '强收湖钱', portrait: 'bandit', hp: 1100, atk: 110, stance: 'TAICHI', combat: { alignment: 'HERETIC', joinsRound: true, speed: 84, weapon: { form: 'STAFF', tier: 'green' } } },
            { name: '码头打手', title: '强收湖钱', portrait: 'bandit', hp: 1100, atk: 110, stance: 'FIERCE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 82, weapon: { form: 'BLADE', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '码头夺回', tone: 'gold', affinity: { ruanqinggao: 80 }, tokens: { ruanqinggao: TOKENS }, silver: 900,
          text: '钱老大在湖里扑腾着喊饶命。阮青篙把他的船桨折成两截扔回去，转头揉乱你的头发：「行啊，没给阮家丢人。」她从腰间解下一只磨亮的铜铃，是阮家祖上传下的船铃。',
        },
      },
      {
        key: 'B', label: '去县衙递状子，告他强占码头',
        requirementText: '阮青篙好感 +40，得家传信物 ×10，侠义 +10，福缘 +1',
        reward: {
          tag: '一纸状子', tone: 'jade', affinity: { ruanqinggao: 40 }, tokens: { ruanqinggao: TOKENS }, stats: { karma: 10, luck: 1 },
          text: '状子递上去，县太爷竟真派了衙役。阮青篙嘴上骂你书呆子，回家却把祖传的铜船铃挂到了你的床头。',
        },
      },
    ],
  },
  {
    id: 'family_yujia_2', origin: 'yujia', afterNodeId: 4,
    title: '太湖劫船', location: '太湖·西山水道',
    description: '阮家替人运往北边的一船粮，在太湖西山水道被水寨劫了。押船的阮老爹挨了一刀，阮青篙红着眼睛解缆：「船追不回来，我就不回来。」',
    choices: [
      {
        key: 'A', label: '驾船追进水寨',
        requirementText: '水上一战，夺回粮船后阮青篙好感 +80，得家传信物 ×10，阮老爹传你《分水刺》',
        battle: {
          environment: { water: true },
          enemyMain: {
            name: '太湖水寨·翻江鳌', title: '劫粮水贼', portrait: 'bandit', hp: 5000, atk: 330, mp: 2000, stance: 'TAICHI',
            combat: { alignment: 'HERETIC', def: 70, speed: 92, weapon: { form: 'ODD', tier: 'blue' } },
          },
          enemyGuards: [
            { name: '水寨喽啰', title: '劫粮水贼', portrait: 'bandit', hp: 2300, atk: 210, stance: 'TAICHI', combat: { alignment: 'HERETIC', joinsRound: true, speed: 88, weapon: { form: 'BLADE', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '水寨夺船', tone: 'gold', affinity: { ruanqinggao: 80 }, tokens: { ruanqinggao: TOKENS }, skills: ['fenshui_ci'],
          text: '粮船追回来了。阮老爹裹着伤躺在船舱里，招手叫你过去，把一对磨得发亮的分水刺放进你手里：「你姐学了二十年，该轮到你了。」',
        },
      },
      {
        key: 'B', label: '上归云庄，求陆庄主出面说情',
        requirementText: '阮青篙好感 +40，得家传信物 ×10、纹银 1,500',
        reward: {
          tag: '归云说情', tone: 'jade', affinity: { ruanqinggao: 40 }, tokens: { ruanqinggao: TOKENS }, silver: 1500,
          text: '陆庄主一封手书送进水寨，粮船当天就放了回来，还多赔了一袋银子。阮青篙憋了半天，说：「下回打架还是叫上我。」',
        },
      },
    ],
  },
  {
    id: 'family_yujia_3', origin: 'yujia', afterNodeId: 6,
    title: '运河夜航', location: '京杭运河·嘉兴段',
    description: '一位义士揣着岳家军旧部的联络图要北上，金兵封了运河各处闸口。阮青篙解开船缆：「撑船的事交给我，你只管护住人。」',
    choices: [
      {
        key: 'A', label: '护着义士强闯闸口',
        requirementText: '水上一战，护住义士撑过 4 回合或击退追兵，阮青篙好感 +100，得家传信物 ×10、真气 +4,000，侠义 +30',
        battle: {
          environment: { water: true, night: true },
          surviveRounds: 4,
          escortAllies: [{ id: 'canal_yishi', name: '北上义士', portrait: 'yangtiexin', maxHp: 3600, hp: 2800, def: 120 }],
          enemyMain: {
            name: '闸口金兵队正', title: '封锁运河', portrait: 'wanyankang', hp: 8800, atk: 470, mp: 3500, stance: 'TAICHI',
            combat: { faction: 'JIN', alignment: 'HERETIC', def: 110, speed: 92, weapon: { form: 'SPEAR', tier: 'blue' } },
          },
          enemyGuards: [
            { name: '巡河金兵', title: '封锁运河', portrait: 'bandit', hp: 3900, atk: 300, stance: 'TAICHI',
              combat: { faction: 'JIN', alignment: 'HERETIC', joinsRound: true, speed: 88, escortTarget: 'ALLY_ESCORT_LEFT', weapon: { form: 'SPEAR', tier: 'green' } } },
            { name: '闸楼弓手', title: '封锁运河', portrait: 'zhebie', hp: 3500, atk: 290, stance: 'AGILE',
              combat: { faction: 'JIN', alignment: 'HERETIC', joinsRound: true, speed: 84, weapon: { form: 'BOW', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '夜闯闸口', tone: 'gold', affinity: { ruanqinggao: 100 }, tokens: { ruanqinggao: TOKENS }, qiExp: 4000, stats: { karma: 30 },
          text: '船冲过最后一道闸时，天边刚泛白。义士在船头朝你们一揖到地。阮青篙收了篙，难得没说话，只把你的手攥得很紧。',
        },
      },
      {
        key: 'B', label: '把义士藏进鱼舱，扮成渔船过闸',
        requirementText: '阮青篙好感 +60，得家传信物 ×10、真气 +2,500，侠义 +20',
        reward: {
          tag: '鱼舱藏人', tone: 'jade', affinity: { ruanqinggao: 60 }, tokens: { ruanqinggao: TOKENS }, qiExp: 2500, stats: { karma: 20 },
          text: '金兵掀开舱板，被一股鱼腥熏得直皱眉，挥手放行。阮青篙一边摇橹一边哼起南湖的渔歌，唱得比平时响。',
        },
      },
    ],
  },

  // ───── 杏林 · 表姐沈青黛 ─────
  {
    id: 'family_xinglin_1', origin: 'xinglin', afterNodeId: 3,
    title: '桑林村热病', location: '嘉兴城外·桑林村',
    description: '城外桑林村闹起热病，沈青黛背着药箱要进村。村口却守着一伙山贼，见药就抢，说是要拿去城里高价卖。',
    choices: [
      {
        key: 'A', label: '护着表姐闯过村口',
        requirementText: '击退山贼后沈青黛好感 +80，得家传信物 ×10，侠义 +20',
        battle: {
          enemyMain: {
            name: '劫药山贼头目', title: '堵住村口', portrait: 'bandit', hp: 2400, atk: 210, mp: 820, stance: 'FIERCE',
            combat: { alignment: 'HERETIC', speed: 88, weapon: { form: 'AXE', tier: 'green' }, statusOnHit: { status: 'SEAL', chancePercent: 30, rounds: 1 } },
          },
          enemyGuards: [
            { name: '山贼', title: '堵住村口', portrait: 'bandit', hp: 1100, atk: 110, stance: 'FIERCE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 84, weapon: { form: 'BLADE', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '闯村送药', tone: 'gold', affinity: { shenqingdai: 80 }, tokens: { shenqingdai: TOKENS }, stats: { karma: 20 },
          text: '药送进村，沈青黛三天没合眼。第四天早上村里的孩子退了烧，她才靠着药箱睡着。醒来她塞给你一个香囊：「回春堂的方子，别弄丢了。」',
        },
      },
      {
        key: 'B', label: '绕小路翻进村去，先救人',
        requirementText: '沈青黛好感 +40，得家传信物 ×10，侠义 +30，真气 +1,000',
        reward: {
          tag: '翻墙救人', tone: 'jade', affinity: { shenqingdai: 40 }, tokens: { shenqingdai: TOKENS }, stats: { karma: 30 }, qiExp: 1000,
          text: '你们背着药箱从桑林里翻进村。沈青黛一边施针一边骂你笨手笨脚，临走却把绣着回春堂字样的香囊系在了你腰上。',
        },
      },
    ],
  },
  {
    id: 'family_xinglin_2', origin: 'xinglin', afterNodeId: 4,
    title: '医书被夺', location: '嘉兴·回春堂',
    description: '几个白衣女子闯进回春堂，抢走舅父批注了三十年的《千金方》，说是少庄主要用来配蛇药。舅父追出门，被一条青蛇咬伤了手。',
    choices: [
      {
        key: 'A', label: '追上去夺回医书',
        requirementText: '击退白驼山门人后沈青黛好感 +80，得家传信物 ×10、通脉破障丹 ×2',
        battle: {
          enemyMain: {
            name: '白驼山驯蛇女', title: '夺书', portrait: 'ouyangke', hp: 4800, atk: 320, mp: 2000, stance: 'AGILE',
            combat: { alignment: 'HERETIC', speed: 98, weapon: { form: 'WHIP', tier: 'blue' }, statusOnHit: { status: 'SEAL', chancePercent: 25, rounds: 1 } },
          },
          enemyGuards: [
            { name: '白驼山门人', title: '夺书', portrait: 'ouyangke', hp: 2200, atk: 210, stance: 'AGILE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 92, weapon: { form: 'BLADE', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '夺回医书', tone: 'gold', affinity: { shenqingdai: 80 }, tokens: { shenqingdai: TOKENS }, pills: 2,
          text: '医书夺回来时缺了两页。舅父笑着说不碍事，那两页他背得出来。沈青黛连夜配了两枚破障丹给你：「方子是爹的，火候是我的。」',
        },
      },
      {
        key: 'B', label: '凭记性帮舅父把医书默出来',
        requirementText: '需悟性 ≥ 18（沈青黛好感 +60，得家传信物 ×10，悟性 +2）',
        require: (c) => c.stats.intStat >= 18,
        reward: {
          tag: '默书三日', tone: 'jade', affinity: { shenqingdai: 60 }, tokens: { shenqingdai: TOKENS }, stats: { intStat: 2 },
          text: '你在药柜间长大，那本书翻过不下百遍。三天三夜，竟默出了九成。舅父捧着新抄本手直抖，沈青黛在旁边看了半天，说：「字丑。」',
        },
      },
    ],
  },
  {
    id: 'family_xinglin_3', origin: 'xinglin', afterNodeId: 6,
    title: '终南雪莲', location: '终南山·后山雪线',
    description: '沈青黛听说终南山雪线上长着一种雪莲，能化开经脉里的郁结。她留了张字条就独自上了山，字条上只写：「药引我去采，你在山下等着。」',
    choices: [
      {
        key: 'A', label: '追上山去陪她',
        requirementText: '击退雪线狼群后沈青黛好感 +100，得家传信物 ×10，气血上限 +3%',
        battle: {
          enemyMain: {
            name: '雪线狼王', title: '守着雪莲', portrait: 'bandit', hp: 8500, atk: 470, mp: 3000, stance: 'FIERCE',
            combat: { alignment: 'NEUTRAL', speed: 104, charge: { round: 3, name: '狼王扑击', damageMultiplier: 1.5 } },
          },
          enemyGuards: [
            { name: '雪狼', title: '狼群', portrait: 'bandit', hp: 3600, atk: 290, stance: 'AGILE', combat: { alignment: 'NEUTRAL', joinsRound: true, speed: 98 } },
            { name: '雪狼', title: '狼群', portrait: 'bandit', hp: 3600, atk: 290, stance: 'FIERCE', combat: { alignment: 'NEUTRAL', joinsRound: true, speed: 96 } },
          ],
        },
        reward: {
          tag: '雪线采莲', tone: 'gold', affinity: { shenqingdai: 100 }, tokens: { shenqingdai: TOKENS }, bonusHpPct: 3,
          text: '雪莲熬成一碗苦得发涩的汤。你喝下去，只觉一股暖流在胸口转了三圈。沈青黛盯着你喝完，转过身去揉了揉眼睛：「雪大，迷眼。」',
        },
      },
      {
        key: 'B', label: '照她说的在山下等',
        requirementText: '沈青黛好感 +40，得家传信物 ×10、真气 +3,000',
        reward: {
          tag: '山下等人', tone: 'jade', affinity: { shenqingdai: 40 }, tokens: { shenqingdai: TOKENS }, qiExp: 3000,
          text: '第三天傍晚她才下山，衣角撕破了，怀里的雪莲却完好。她把药递给你，什么也没说，只是比平时多看了你一眼。',
        },
      },
    ],
  },

  // ───── 玄门 · 师兄松岩子 ─────
  {
    id: 'family_xuanmen_1', origin: 'xuanmen', afterNodeId: 3,
    title: '观产之争', location: '嘉兴城外·烟雨观',
    description: '城里的刘员外拿着一张来路不明的地契，带着家丁要占烟雨观的山田。松岩子守在山门前，一步不让：「此田是观里百年香火，贫道不敢相让。」',
    choices: [
      {
        key: 'A', label: '与师兄一同守住山门',
        requirementText: '击退刘府家丁后松岩子好感 +80，得家传信物 ×10、纹银 600，侠义 +10',
        battle: {
          enemyMain: {
            name: '刘府护院教头', title: '强占观田', portrait: 'bandit', hp: 2600, atk: 200, mp: 900, stance: 'FIERCE',
            combat: { alignment: 'HERETIC', speed: 86, weapon: { form: 'STAFF', tier: 'green' } },
          },
          enemyGuards: [
            { name: '刘府家丁', title: '强占观田', portrait: 'bandit', hp: 1100, atk: 110, stance: 'FIERCE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 82, weapon: { form: 'STAFF', tier: 'green' } } },
            { name: '刘府家丁', title: '强占观田', portrait: 'bandit', hp: 1100, atk: 110, stance: 'AGILE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 86, weapon: { form: 'STAFF', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '山门不让', tone: 'gold', affinity: { songyanzi: 80 }, tokens: { songyanzi: TOKENS }, silver: 600, stats: { karma: 10 },
          text: '家丁抬着教头下了山。松岩子扶正被撞歪的山门匾额，从袖中取出一枚旧桃木符：「观主说，等你守得住一样东西，就把这个给你。」',
        },
      },
      {
        key: 'B', label: '下山去县衙查地契的底',
        requirementText: '松岩子好感 +40，得家传信物 ×10、真气 +1,200，侠义 +15',
        reward: {
          tag: '查契辨伪', tone: 'jade', affinity: { songyanzi: 40 }, tokens: { songyanzi: TOKENS }, qiExp: 1200, stats: { karma: 15 },
          text: '县衙的旧档里查不到这张地契，刘员外只好灰溜溜撤了人。松岩子听完，对你端端正正行了一礼，把一枚旧桃木符系在你的剑穗上。',
        },
      },
    ],
  },
  {
    id: 'family_xuanmen_2', origin: 'xuanmen', afterNodeId: 4,
    title: '观主失踪', location: '嘉兴城外·烟雨观',
    description: '观主下山云游，三个月没有音信，只在丹房里留下半卷剑谱和一行字：「西去白驼。」当天夜里，就有白衣人摸上山来，翻找的正是那半卷剑谱。',
    choices: [
      {
        key: 'A', label: '守住剑谱，与师兄照谱对敌',
        requirementText: '击退白驼山门人后松岩子好感 +80，得家传信物 ×10，习得《烟雨剑法》',
        battle: {
          enemyMain: {
            name: '白驼山执事', title: '夜搜剑谱', portrait: 'ouyangke', hp: 5000, atk: 330, mp: 2100, stance: 'FIERCE',
            combat: { alignment: 'HERETIC', def: 75, speed: 94, weapon: { form: 'BLADE', tier: 'blue' } },
          },
          enemyGuards: [
            { name: '白驼山门人', title: '夜搜剑谱', portrait: 'ouyangke', hp: 2300, atk: 210, stance: 'FIERCE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 90, weapon: { form: 'BLADE', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '照谱退敌', tone: 'gold', affinity: { songyanzi: 80 }, tokens: { songyanzi: TOKENS }, skills: ['yanyu_jian'],
          text: '这一夜你们照着半卷剑谱且学且战，天亮时竟把一路《烟雨剑法》使顺了。松岩子收剑长叹：「原来观主早算到，这谱要两个人才练得成。」',
        },
      },
      {
        key: 'B', label: '先替观主守好道观，等他回来',
        requirementText: '松岩子好感 +40，得家传信物 ×10、真气 +2,000，根骨 +1',
        reward: {
          tag: '守观待归', tone: 'jade', affinity: { songyanzi: 40 }, tokens: { songyanzi: TOKENS }, qiExp: 2000, stats: { con: 1 },
          text: '你们把剑谱封进香炉底下，每日照常上早课。松岩子说观主走时最放心不下的是你，如今看来，是他多虑了。',
        },
      },
    ],
  },
  {
    id: 'family_xuanmen_3', origin: 'xuanmen', afterNodeId: 6,
    title: '终南问道', location: '终南山·重阳宫外',
    description: '松岩子带着观主留下的一句「坐忘」，上终南山向全真诸子请教。重阳宫外的山道上，却有一伙人披着全真道袍，拦路收「问道钱」。',
    choices: [
      {
        key: 'A', label: '拆穿这伙假道士',
        requirementText: '击退假道士后松岩子好感 +100，得家传信物 ×10、真气 +4,000，侠义 +20',
        battle: {
          enemyMain: {
            name: '假道士头目', title: '冒名全真', portrait: 'daoist', hp: 8500, atk: 470, mp: 3400, stance: 'FIERCE',
            combat: { alignment: 'HERETIC', def: 105, speed: 96, weapon: { form: 'BLADE', tier: 'blue' }, charge: { round: 4, name: '伪北斗剑阵', damageMultiplier: 1.4, area: true } },
          },
          enemyGuards: [
            { name: '假道士', title: '冒名全真', portrait: 'daoist', hp: 3800, atk: 300, stance: 'FIERCE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 90, weapon: { form: 'BLADE', tier: 'green' } } },
            { name: '假道士', title: '冒名全真', portrait: 'daoist', hp: 3800, atk: 300, stance: 'AGILE', combat: { alignment: 'HERETIC', joinsRound: true, speed: 92, weapon: { form: 'BLADE', tier: 'green' } } },
          ],
        },
        reward: {
          tag: '山道辨真', tone: 'gold', affinity: { songyanzi: 100 }, tokens: { songyanzi: TOKENS }, qiExp: 4000, stats: { karma: 20 },
          text: '假道士被押进重阳宫时，一位老道听说了来龙去脉，只对松岩子说了一句：「坐忘，先得把该放下的放下。」松岩子在山门外坐了一夜，下山时眉间那点拘谨不见了。',
        },
      },
      {
        key: 'B', label: '陪师兄在宫外静坐三日',
        requirementText: '松岩子好感 +60，得家传信物 ×10、真气 +5,000',
        reward: {
          tag: '宫外静坐', tone: 'jade', affinity: { songyanzi: 60 }, tokens: { songyanzi: TOKENS }, qiExp: 5000,
          text: '三日里没人来理会你们。第三天夜里下了场雪，松岩子忽然笑出声：「原来没人答，便是答了。」',
        },
      },
    ],
  },
]
