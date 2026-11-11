import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  BattleReportDTO,
  CombatUnitDTO,
  GameLogEntry,
  GhostMarketListingDTO,
  LoadoutPresetDTO,
  PendingAdventureDTO,
  PlayerDTO,
  RichSegment,
  RoomPlayerDTO,
  StanceType,
  TierColor,
  UniqueArtifactStatusDTO,
} from '@/network/protocol'
import {
  calcNextLevelQi,
  computeDerivedStats,
  generateRoomPlayers,
  INITIAL_GHOST_LISTINGS,
  INITIAL_UNIQUE_ARTIFACTS,
  simulateServerBattle,
} from '@/network/mockEngine'
import {
  activeSetBonuses,
  ADVENTURES,
  adventureById,
  COMPANIONS,
  findTrioSynergy,
  GHOST_APPRAISE_COST,
  INN_GIFT_COST,
  INN_TEA_COST,
  isMapUnlocked,
  ITEMS,
  MAPS,
  REALMS,
  SECTS,
  SKILLS,
  STAT_LABEL,
  STORY_CHAPTERS,
  validateGameData,
  type AdventureChoice,
  type AdventureCtx,
  type Reward,
} from '@/config/gameData'
import { EQUIP_SLOT_META, shichenIdxFromDate, SKILL_SLOT_META } from '@/config/uiMeta'

const SHICHEN_LABELS = ['子时·夜半', '寅时·平旦', '辰时·烟雨', '午时·日正', '申时·斜阳', '戌时·黄昏']

export type MainTab = 'CULTIVATE' | 'JIANGHU' | 'ARSENAL' | 'SECT' | 'MARKET'

export const useGameStore = defineStore('wuxiaGame', () => {
  if (import.meta.env.DEV) {
    const errs = validateGameData()
    if (errs.length) console.warn('[gameData] 数据引用校验失败：\n' + errs.join('\n'))
  }

  // 主题与响应式抽屉状态（默认启动采用燕云玄墨深色护眼主题）
  const isMidnightTheme = ref(true)
  const activeTab = ref<MainTab>('CULTIVATE')
  // 窄屏下左 / 右侧栏以抽屉形式呈现
  const mobileDrawer = ref<'NONE' | 'CHAR' | 'WORLD'>('NONE')
  // 时辰随真实时间流转（驱动场景昼夜与日志时间标签）
  const shichenIdx = ref(shichenIdxFromDate())
  setInterval(() => {
    shichenIdx.value = shichenIdxFromDate()
  }, 60_000)

  // 轻提示：可堆叠，每条独立计时（避免同文案连发时被旧计时器提前清掉）
  type ToastTone = 'info' | 'gold' | 'danger'
  const toasts = ref<{ id: number; text: string; tone: ToastTone }[]>([])
  let toastSeq = 0

  // 二次确认弹窗（叛师等不可逆操作）
  const confirmDialog = ref<{
    title: string
    body: string
    confirmText: string
    tone: 'danger' | 'gold'
    onConfirm: () => void
  } | null>(null)

  // 点击富文本词条弹出的详情浮窗
  const inspectModal = ref<{ title: string; subtitle: string; tier: TierColor; desc: string; extra?: string } | null>(null)

  // 玩家核心状态（开局默认：无门派·逍遥散人，方便体验散人特权与自由择师）
  const player = ref<PlayerDTO>({
    id: 'p_10086',
    nickname: '陆小鱼',
    avatarId: 'hero_sword',
    level: 32,
    realmTier: 3,
    realmStage: 1,
    breakPityRate: 0,
    qiExp: 14200,
    nextLevelQi: calcNextLevelQi(32),
    silver: 18600,
    goldIngot: 520,
    stats: {
      str: 28,
      con: 26,
      agi: 29,
      intStat: 32,
      luck: 25,
      karma: 40,
    },
    shaQi: 0,
    currentSectId: null,
    sectRank: 1,
    sectContribution: 120,
    isGuardingLibrary: false,
    currentMapId: 'jiaxing_suburb',
    maxChapterId: 5, // 已通关 1-1 ~ 2-1，当前停在 2-2「赵王府夜宴」
    qiPerHour: 3650,
    lastSettleAt: Date.now() - 1000 * 60 * 42, // 默认模拟已有42分钟未领取离线真气
    coCultivatePartner: null,
    bountyUntil: null,
    wearingMask: false,
    activePresetIdx: 1,
  })

  // 已解锁武学秘籍重数 (skillId -> level 1~10)
  const learnedSkills = ref<Record<string, number>>({
    quanzhen_tuna: 3,
    yuenv_jian: 4,
    luoying_zhang: 2,
    jinyan_gong: 3,
    yiyang_zhi: 1,
  })

  // 背包拥有的装备ID集合与丹药数量
  const ownedItemIds = ref<string[]>([
    'qinggang_sword',
    'xuantie_dagger',
    'quanzhen_robe',
    'iron_bagua',
  ])
  const pillCount = ref(2) // 九花玉露丸数量（提升冲穴成功率+25%）
  const betrayedSectIds = ref<string[]>([])

  // 剧情进度：标记、已领取首通奖励的主线节点、已了结的奇遇、待决奇遇队列
  const storyFlags = ref<string[]>([])
  const claimedNodeIds = ref<number[]>([])
  const resolvedAdventureIds = ref<string[]>([])
  const adventureQueue = ref<string[]>([])
  const pendingAdventureId = ref<string | null>('shedu_baoxue')

  // 伙伴好感度与招募状态（met=已结识，客栈才会显示；recruited=好感≥100可编入左右翼）
  type CompanionState = { affinity: number; recruited: boolean; taught: boolean; met: boolean }
  const companionAffinity = ref<Record<string, CompanionState>>({
    kezhene: { affinity: 180, recruited: true, taught: true, met: true },
    meichaofeng: { affinity: 140, recruited: true, taught: false, met: true },
    guojing: { affinity: 340, recruited: true, taught: false, met: true },
    huangrong: { affinity: 360, recruited: true, taught: false, met: true },
    hongqigong: { affinity: 540, recruited: true, taught: false, met: true }, // 差60满600即可体验请叫花鸡触发《亢龙有悔》倾囊传功！
    huangyaoshi: { affinity: 220, recruited: true, taught: false, met: true },
    zhoubotong: { affinity: 480, recruited: true, taught: false, met: true },
    // 射雕篇新伙伴：通过主线 / 支线剧情结识
    munianci: { affinity: 0, recruited: false, taught: false, met: false },
    ouyangfeng: { affinity: 0, recruited: false, taught: false, met: false },
    // 第一批扩充（第12册）：剧情送 / 好感线靠主线与支线结识，抽卡线待客栈「结缘」开放
    yideng: { affinity: 0, recruited: false, taught: false, met: false },
    wangchongyang: { affinity: 0, recruited: false, taught: false, met: false },
    qiuchuji: { affinity: 0, recruited: false, taught: false, met: false },
    qiuqianren: { affinity: 0, recruited: false, taught: false, met: false },
    yangkang: { affinity: 0, recruited: false, taught: false, met: false },
    zhebie: { affinity: 0, recruited: false, taught: false, met: false },
    lingzhi: { affinity: 0, recruited: false, taught: false, met: false },
    yinggu: { affinity: 0, recruited: false, taught: false, met: false },
    mayu: { affinity: 0, recruited: false, taught: false, met: false },
    tanchuduan: { affinity: 0, recruited: false, taught: false, met: false },
    wangchuyi: { affinity: 0, recruited: false, taught: false, met: false },
    sunbuer: { affinity: 0, recruited: false, taught: false, met: false },
    ouyangke: { affinity: 0, recruited: false, taught: false, met: false },
    yangtiexin: { affinity: 0, recruited: false, taught: false, met: false },
    luchengfeng: { affinity: 0, recruited: false, taught: false, met: false },
    zhuziliu: { affinity: 0, recruited: false, taught: false, met: false },
  })

  // 3套配装预设
  const presets = ref<Record<1 | 2 | 3, LoadoutPresetDTO>>({
    1: {
      presetIdx: 1,
      name: '预设壹·靖蓉均衡',
      stance: 'FIERCE',
      innerSkillId: 'quanzhen_tuna',
      outerSkillId: 'luoying_zhang',
      lightSkillId: 'jinyan_gong',
      ultSkillId: 'yiyang_zhi',
      leftCompanionId: 'guojing',
      rightCompanionId: 'huangrong',
      weaponId: 'xuantie_dagger',
      armorId: 'quanzhen_robe',
      accId: 'iron_bagua',
      relicBookId: null,
    },
    2: {
      presetIdx: 2,
      name: '预设贰·太极反震',
      stance: 'TAICHI',
      innerSkillId: 'quanzhen_tuna',
      outerSkillId: 'yuenv_jian',
      lightSkillId: 'jinyan_gong',
      ultSkillId: 'yiyang_zhi',
      leftCompanionId: 'guojing',
      rightCompanionId: 'kezhene',
      weaponId: 'qinggang_sword',
      armorId: 'quanzhen_robe',
      accId: 'iron_bagua',
      relicBookId: null,
    },
    3: {
      presetIdx: 3,
      name: '预设叁·奇门极速',
      stance: 'AGILE',
      innerSkillId: 'quanzhen_tuna',
      outerSkillId: 'luoying_zhang',
      lightSkillId: 'jinyan_gong',
      ultSkillId: 'yiyang_zhi',
      leftCompanionId: 'meichaofeng',
      rightCompanionId: 'huangrong',
      weaponId: 'xuantie_dagger',
      armorId: 'quanzhen_robe',
      accId: 'iron_bagua',
      relicBookId: null,
    },
  })

  const currentLoadout = computed(() => presets.value[player.value.activePresetIdx])
  const currentRealm = computed(() => REALMS.find((r) => r.tier === player.value.realmTier) ?? REALMS[0])
  const currentMap = computed(() => MAPS.find((m) => m.id === player.value.currentMapId) ?? MAPS[0])
  const currentSect = computed(() => SECTS.find((s) => s.id === player.value.currentSectId) ?? null)
  // 收集羁绊：已入队成员数达标即全局加成（气血 / 攻击 / 离线打坐）
  const setBonusStates = computed(() => activeSetBonuses((id) => !!companionAffinity.value[id]?.recruited))
  const collectionBonus = computed(() => {
    const sum = { hpPct: 0, atkPct: 0, idleQiPct: 0 }
    for (const { tier } of setBonusStates.value) {
      sum.hpPct += tier?.hpPct ?? 0
      sum.atkPct += tier?.atkPct ?? 0
      sum.idleQiPct += tier?.idleQiPct ?? 0
    }
    return sum
  })
  const derivedStats = computed(() => computeDerivedStats(player.value, currentLoadout.value, collectionBonus.value))

  // 计算当前实时每小时打坐真气效率
  const effectiveQiPerHour = computed(() => {
    const base = currentMap.value.baseQiPerHour
    const conMult = 1 + player.value.stats.con / 100
    const innerBonus = (currentLoadout.value.innerSkillId ? SKILLS[currentLoadout.value.innerSkillId]?.idleQiBonus ?? 0 : 0) / 100
    const armorBonus = (currentLoadout.value.armorId ? ITEMS[currentLoadout.value.armorId]?.idleBonus ?? 0 : 0) / 100
    const sectBonus = player.value.currentSectId === 'quanzhen' ? 0.25 : 0
    const coCultBonus = player.value.coCultivatePartner ? 0.15 : 0
    const setBonus = collectionBonus.value.idleQiPct / 100
    return Math.round(base * conMult * (1 + innerBonus + armorBonus + sectBonus + coCultBonus + setBonus))
  })

  // 当前激活的三人行羁绊
  const activeTrioSynergy = computed(() =>
    findTrioSynergy(currentLoadout.value.leftCompanionId, currentLoadout.value.rightCompanionId)
  )

  // 散人百家混搭特权判定
  const isWandererMasteryActive = computed(() => !player.value.currentSectId)

  // 同地图在线玩家与聊天频道
  const nearbyPlayers = ref<RoomPlayerDTO[]>(generateRoomPlayers('jiaxing_suburb'))
  const uniqueArtifacts = ref<UniqueArtifactStatusDTO[]>([...INITIAL_UNIQUE_ARTIFACTS])
  const ghostListings = ref<GhostMarketListingDTO[]>([...INITIAL_GHOST_LISTINGS])

  const worldMessages = ref<
    { id: string; channel: 'WORLD' | 'SECT' | 'RUMOR'; sender: string; sect: string; content: string; time: string }[]
  >([
    { id: 'm1', channel: 'RUMOR', sender: '江湖百晓生', sect: '天机', content: '传闻【真·绿玉打狗棒】现落入白驼山【西域毒皇·欧阳烈】之手，丐帮群豪正欲夺回！', time: '辰时' },
    { id: 'm2', channel: 'WORLD', sender: '重阳首座·清风道长', sect: '全真教', content: '松鹤楼结义秘境【少林金刚伏魔圈】2缺1高爆发少侠，来个会降龙掌的兄弟！', time: '辰时' },
    { id: 'm3', channel: 'WORLD', sender: '桃花小师妹', sect: '桃花岛', content: '哪位散人大哥鬼市淘到了《九阴残页》？诚心高价收！', time: '巳时' },
  ])

  // 滚动富文本日志流
  const logs = ref<GameLogEntry[]>([
    {
      id: 'init_1',
      timeLabel: '辰时·入世',
      channel: 'JIANGHU',
      segments: [
        { type: 'tag', text: '江湖纪元', tone: 'gold' },
        { type: 'text', text: ' 南宋嘉定十四年，烟雨迷蒙。你怀揣忘机客所留' },
        { type: 'item', id: 'iron_bagua', name: '【曲三铁八卦】', tier: 'blue' },
        { type: 'text', text: '踏入嘉兴南湖，当前身份为自由自在的' },
        { type: 'tag', text: '无门派·逍遥散人', tone: 'jade' },
        { type: 'text', text: '。' },
      ],
    },
    {
      id: 'init_2',
      timeLabel: '辰时·共鸣',
      channel: 'CULTIVATE',
      segments: [
        { type: 'text', text: '伴行在侧的' },
        { type: 'actor', name: '黄蓉', isAlly: true },
        { type: 'text', text: '巧笑嫣然：“靖哥哥，咱们三人同行，便是那西毒欧阳锋来了也不惧他！”（已激活羁绊' },
        { type: 'tag', text: '靖蓉同心', tone: 'purple' },
        { type: 'text', text: '）' },
      ],
    },
  ])

  // 待抉择奇遇：由模板 + 当前角色状态实时推导，选项可选性随属性 / 银两变化
  function adventureCtx(): AdventureCtx {
    return {
      stats: { ...player.value.stats },
      isWanderer: !player.value.currentSectId,
      flags: storyFlags.value,
      items: ownedItemIds.value,
      silver: player.value.silver,
    }
  }
  const choiceAvailable = (c: AdventureChoice, ctx: AdventureCtx) =>
    (!c.require || c.require(ctx)) && (c.costSilver ?? 0) <= ctx.silver

  const pendingAdventure = computed<PendingAdventureDTO | null>(() => {
    const tpl = pendingAdventureId.value ? adventureById(pendingAdventureId.value) : undefined
    if (!tpl) return null
    const ctx = adventureCtx()
    return {
      id: `adv_${tpl.id}`,
      templateId: tpl.id,
      title: tpl.title,
      location: tpl.location,
      description: tpl.description,
      options: tpl.choices.map((c) => ({
        key: c.key,
        label: c.label,
        requirementText: c.requirementText,
        canSelect: choiceAvailable(c, ctx),
      })),
    }
  })

  // 战斗回放播放器状态与破屏书法招式/飘字状态
  const activeBattle = ref<BattleReportDTO | null>(null)
  const activeChapterId = ref<number | null>(null) // 当前战斗对应的主线节点（战斗结束才结算首通）
  const battleEventCursor = ref(0)
  const battleSpeed = ref<1 | 2>(1)
  const isBattlePlaying = ref(false)
  const liveUnitStates = ref<Record<string, { hp: number; maxHp: number; rage: number; anim: 'NONE' | 'LUNGE_ALLY' | 'LUNGE_ENEMY' | 'HIT' }>>({})
  const slashBanner = ref<{ text: string; sub: string; isUlt: boolean; isAlly: boolean; key: number } | null>(null)
  const floatingPopups = ref<Record<string, { text: string; isCrit: boolean; category: string; key: number }>>({})
  let battleTimer: ReturnType<typeof setTimeout> | null = null

  function showToast(text: string, tone: ToastTone = 'info') {
    const id = ++toastSeq
    toasts.value.push({ id, text, tone })
    if (toasts.value.length > 3) toasts.value.shift()
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 3600)
  }

  function askConfirm(opts: NonNullable<typeof confirmDialog.value>) {
    confirmDialog.value = opts
  }
  function resolveConfirm(accepted: boolean) {
    const d = confirmDialog.value
    confirmDialog.value = null
    if (accepted && d) d.onConfirm()
  }

  function appendLog(channel: GameLogEntry['channel'], segments: RichSegment[]) {
    logs.value.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timeLabel: SHICHEN_LABELS[shichenIdx.value],
      channel,
      segments,
    })
    if (logs.value.length > 80) logs.value.pop()
  }

  function toggleTheme(forceMidnight?: boolean) {
    isMidnightTheme.value = forceMidnight !== undefined ? forceMidnight : !isMidnightTheme.value
    document.documentElement.classList.toggle('theme-midnight', isMidnightTheme.value)
  }

  function openInspect(payload: { title: string; subtitle: string; tier: TierColor; desc: string; extra?: string }) {
    inspectModal.value = payload
  }

  function inspectById(kind: 'skill' | 'item', id: string) {
    if (kind === 'skill' && SKILLS[id]) {
      const s = SKILLS[id]
      const lv = learnedSkills.value[id] ?? 1
      openInspect({
        title: `《${s.name}》`,
        subtitle: `${SKILL_SLOT_META[s.slot].label} · 第 ${lv} 重 · 来源：${s.source}`,
        tier: s.tier,
        desc: s.desc,
        extra: `招式意境：“${s.castNarrative}”`,
      })
    } else if (kind === 'item' && ITEMS[id]) {
      const it = ITEMS[id]
      openInspect({
        title: `【${it.name}】`,
        subtitle: `${EQUIP_SLOT_META[it.slot].label}${it.reqStat ? ` · 门槛：${it.reqStat.label}` : ''}`,
        tier: it.tier,
        desc: it.desc,
        extra: it.signatureEffect ? `${it.signatureEffect}（共鸣者：${it.signatureOwner}）` : undefined,
      })
    }
  }

  // 1. 惰性离线挂机收益结算（对应后端 POST /api/v1/cultivate/settle）
  function settleOfflineQi() {
    const elapsedSec = Math.max(60, Math.floor((Date.now() - player.value.lastSettleAt) / 1000))
    const cappedHours = Math.min(12, elapsedSec / 3600)
    const gainedQi = Math.max(480, Math.round(effectiveQiPerHour.value * cappedHours))
    const gainedSilver = Math.max(150, Math.round(gainedQi * 0.28))

    player.value.qiExp += gainedQi
    player.value.silver += gainedSilver
    player.value.lastSettleAt = Date.now()

    appendLog('CULTIVATE', [
      { type: 'tag', text: '闭关吐纳', tone: 'jade' },
      { type: 'text', text: ` 你收功睁眼，周天真气归入丹田，共获修为真气 +${gainedQi.toLocaleString()}，纹银 +${gainedSilver.toLocaleString()} 两！` },
    ])
    showToast(`闭关收功：真气 +${gainedQi.toLocaleString()}`, 'gold')
  }

  // 升级与冲穴突破
  function upgradeLevel() {
    const realm = currentRealm.value
    if (player.value.level >= realm.maxLevel) {
      showToast(`已达【${realm.name}】极境上限，请先冲击【${REALMS[player.value.realmTier]?.meridian ?? '生死玄关'}】！`, 'gold')
      return
    }
    if (player.value.qiExp < player.value.nextLevelQi) {
      showToast('丹田储存真气不足，可先领取闭关收益或闯荡江湖', 'danger')
      return
    }
    player.value.qiExp -= player.value.nextLevelQi
    player.value.level += 1
    player.value.stats.str += 1
    player.value.stats.con += 1
    player.value.stats.agi += 1
    if (player.value.level % 2 === 0) player.value.stats.intStat += 1
    player.value.nextLevelQi = calcNextLevelQi(player.value.level)

    appendLog('CULTIVATE', [
      { type: 'tag', text: '修为精进', tone: 'gold' },
      { type: 'text', text: ` 百尺竿头更进一步！你的等级提升至 Lv.${player.value.level}，全身筋骨愈发强健。` },
    ])
  }

  function attemptBreakthrough(usePill: boolean) {
    const nextRealm = REALMS.find((r) => r.tier === player.value.realmTier + 1)
    if (!nextRealm) {
      showToast('你已臻至第十重【天人合一】神话极境！', 'gold')
      return
    }
    let pillBonus = 0
    if (usePill) {
      if (pillCount.value <= 0) {
        showToast('行囊中已无【九花玉露丸】！', 'danger')
        return
      }
      pillCount.value -= 1
      pillBonus = 25
    }
    const rate = Math.min(
      100,
      Math.round(nextRealm.baseBreakRate + player.value.stats.con * 0.3 + player.value.breakPityRate + pillBonus)
    )
    const roll = Math.random() * 100
    if (roll <= rate) {
      player.value.realmTier = nextRealm.tier
      player.value.level = Math.max(player.value.level, nextRealm.minLevel)
      player.value.nextLevelQi = calcNextLevelQi(player.value.level)
      player.value.breakPityRate = 0
      player.value.stats.con += 4
      player.value.stats.str += 4
      player.value.stats.intStat += 3

      appendLog('CULTIVATE', [
        { type: 'tag', text: '破境功成', tone: 'gold' },
        { type: 'text', text: ` 轰然一声内息贯通【${nextRealm.meridian}】！你正式踏入第 ${nextRealm.tier} 重境界——【${nextRealm.name}】！` },
      ])
      showToast(`冲穴大成！踏入【${nextRealm.name}】！`, 'gold')
    } else {
      player.value.breakPityRate += 15
      appendLog('CULTIVATE', [
        { type: 'tag', text: '小走火', tone: 'red' },
        { type: 'text', text: ` 冲击【${nextRealm.meridian}】差了一线火候，真气激荡（下次冲穴保底成功率永久 +15%）！` },
      ])
      showToast('玄关未破，已累积 +15% 破境保底率', 'danger')
    }
  }

  // ==================== 剧情奖励 / 支线奇遇 ====================
  /** 统一结算一个 Reward（首通剧情与奇遇选项共用）：属性 / 资源 / 武学 / 装备 / 好感 / 标记，并写一条富文本日志 */
  function applyReward(r: Reward, channel: GameLogEntry['channel'] = 'ADVENTURE') {
    const p = player.value
    const delta: string[] = []
    const links: RichSegment[] = []
    const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`

    for (const [k, v] of Object.entries(r.stats ?? {}) as [keyof typeof STAT_LABEL, number][]) {
      p.stats[k] += v
      delta.push(`${STAT_LABEL[k]} ${signed(v)}`)
    }
    if (r.bonusHpPct) {
      p.bonusHpPct = (p.bonusHpPct ?? 0) + r.bonusHpPct
      delta.push(`气血上限 +${r.bonusHpPct}%`)
    }
    if (r.qiExp) {
      p.qiExp += r.qiExp
      delta.push(`真气 ${signed(r.qiExp)}`)
    }
    if (r.silver) {
      p.silver += r.silver
      delta.push(`纹银 ${signed(r.silver)}`)
    }
    if (r.pills) {
      pillCount.value += r.pills
      delta.push(`九花玉露丸 +${r.pills}`)
    }

    for (const id of r.skills ?? []) {
      const sk = SKILLS[id]
      if (!sk) continue
      const had = (learnedSkills.value[id] ?? 0) > 0
      learnedSkills.value[id] = Math.max(1, learnedSkills.value[id] ?? 0)
      if (!had) links.push({ type: 'text', text: ' 习得' }, { type: 'skill', id, name: `《${sk.name}》`, tier: sk.tier })
    }
    for (const [id, n] of Object.entries(r.skillBoost ?? {})) {
      const sk = SKILLS[id]
      if (!sk) continue
      const next = Math.min(10, (learnedSkills.value[id] ?? 0) + n)
      learnedSkills.value[id] = next
      links.push({ type: 'text', text: ' ' }, { type: 'skill', id, name: `《${sk.name}》`, tier: sk.tier }, { type: 'text', text: `参悟至第 ${next} 重` })
    }
    for (const id of r.items ?? []) {
      const it = ITEMS[id]
      if (!it) continue
      if (!ownedItemIds.value.includes(id)) {
        ownedItemIds.value.push(id)
        links.push({ type: 'text', text: ' 获得' }, { type: 'item', id, name: `【${it.name}】`, tier: it.tier, isTrueUnique: it.isTrueUnique })
      }
    }
    for (const [id, n] of Object.entries(r.affinity ?? {})) {
      const c = COMPANIONS[id]
      const st = companionAffinity.value[id]
      if (!c || !st) continue
      const wasRecruited = st.recruited
      st.met = true
      st.affinity = Math.min(1000, st.affinity + n)
      st.recruited = st.affinity >= 100
      delta.push(`${c.name}好感 ${signed(n)}`)
      if (st.recruited && !wasRecruited) links.push({ type: 'text', text: ' ' }, { type: 'actor', name: c.name, isAlly: true }, { type: 'text', text: '已加入你的江湖行列' })
    }
    for (const f of r.flags ?? []) {
      if (!storyFlags.value.includes(f)) storyFlags.value.push(f)
    }

    appendLog(channel, [
      { type: 'tag', text: r.tag, tone: r.tone },
      { type: 'text', text: ` ${r.text}` },
      ...(delta.length ? [{ type: 'text' as const, text: `（${delta.join('，')}）` }] : []),
      ...links,
    ])
    showToast(r.tag, r.tone === 'red' ? 'danger' : r.tone === 'gold' ? 'gold' : 'info')
  }

  /** 主线节点首通：写叙事、发奖励，并把该节点解锁的支线排进奇遇队列 */
  function claimNodeFirstClear(nodeId: number) {
    if (claimedNodeIds.value.includes(nodeId)) return
    const node = STORY_CHAPTERS.find((n) => n.id === nodeId)
    if (!node) return
    claimedNodeIds.value.push(nodeId)
    applyReward(node.firstClear, 'JIANGHU')
    queueAdventuresAfter(nodeId)
  }

  function queueAdventuresAfter(nodeId: number) {
    for (const a of ADVENTURES) {
      if (a.afterNodeId !== nodeId) continue
      if (resolvedAdventureIds.value.includes(a.id) || adventureQueue.value.includes(a.id) || pendingAdventureId.value === a.id) continue
      adventureQueue.value.push(a.id)
    }
    pumpAdventureQueue()
  }

  function pumpAdventureQueue() {
    if (pendingAdventureId.value || !adventureQueue.value.length) return
    pendingAdventureId.value = adventureQueue.value.shift()!
    const tpl = adventureById(pendingAdventureId.value)
    if (tpl) showToast(`触发江湖奇遇：【${tpl.title}】`, 'gold')
  }

  // 游历寻访：从“主线已推进到、且尚未了结”的支线中随机抽取
  function triggerRandomAdventure() {
    activeTab.value = 'CULTIVATE'
    if (pendingAdventureId.value) {
      showToast('尚有奇遇等你抉择，请先在纪事卷轴中做出选择', 'info')
      return
    }
    const pool = ADVENTURES.filter(
      (a) =>
        a.afterNodeId < player.value.maxChapterId &&
        !resolvedAdventureIds.value.includes(a.id) &&
        !adventureQueue.value.includes(a.id)
    )
    if (!pool.length) {
      showToast('江湖近日风平浪静，暂无新的奇遇——推进主线可解锁更多支线', 'info')
      return
    }
    const tpl = pool[Math.floor(Math.random() * pool.length)]
    pendingAdventureId.value = tpl.id
    showToast(`触发江湖奇遇：【${tpl.title}】`, 'gold')
  }

  function resolveAdventure(choice: 'A' | 'B') {
    const tpl = pendingAdventureId.value ? adventureById(pendingAdventureId.value) : undefined
    const c = tpl?.choices.find((x) => x.key === choice)
    if (!tpl || !c) return
    const ctx = adventureCtx()
    if (!choiceAvailable(c, ctx)) {
      showToast(c.costSilver && ctx.silver < c.costSilver ? '纹银不足！' : (c.requirementText ?? '条件未满足'), 'danger')
      return
    }
    const reward = typeof c.reward === 'function' ? c.reward(ctx) : c.reward
    if (c.costSilver) player.value.silver -= c.costSilver
    resolvedAdventureIds.value.push(tpl.id)
    pendingAdventureId.value = null
    applyReward(reward)
    pumpAdventureQueue()
  }

  // ==================== 战斗播放器引擎 ====================
  function startBattlePlayback(report: BattleReportDTO, storyNodeId: number | null = null) {
    if (battleTimer) clearTimeout(battleTimer)
    activeBattle.value = report
    activeChapterId.value = storyNodeId
    battleEventCursor.value = 0
    isBattlePlaying.value = true
    slashBanner.value = null
    floatingPopups.value = {}

    const initStates: Record<string, { hp: number; maxHp: number; rage: number; anim: 'NONE' | 'LUNGE_ALLY' | 'LUNGE_ENEMY' | 'HIT' }> = {}
    for (const u of report.units) {
      initStates[u.slot] = { hp: u.hp, maxHp: u.maxHp, rage: u.rage, anim: 'NONE' }
    }
    liveUnitStates.value = initStates
    stepNextBattleEvent()
  }

  function stepNextBattleEvent() {
    if (!activeBattle.value) return
    if (battleEventCursor.value >= activeBattle.value.events.length) {
      finishBattleSettlement()
      return
    }

    const ev = activeBattle.value.events[battleEventCursor.value]
    battleEventCursor.value += 1
    const frameKey = Date.now() + battleEventCursor.value * 7

    // 重置上一帧动效与飘字
    for (const key of Object.keys(liveUnitStates.value)) {
      liveUnitStates.value[key].anim = 'NONE'
    }
    const nextPopups: Record<string, { text: string; isCrit: boolean; category: string; key: number }> = {}

    // 破屏水墨书法招式横幅驱动
    const actorUnit = activeBattle.value.units.find((u) => u.slot === ev.actorSlot)
    if (ev.skillName) {
      slashBanner.value = {
        text: ev.skillName,
        sub: `${actorUnit?.name ?? '侠客'} · ${ev.isUlt ? '绝学奥义破阵' : ev.type === 'ASSIST_ATTACK' ? '左右翼奇策合击' : '出招拆解'}`,
        isUlt: !!ev.isUlt,
        isAlly: ev.actorSlot.startsWith('ALLY'),
        key: frameKey,
      }
    } else if (ev.type === 'STANCE_CLASH') {
      slashBanner.value = {
        text: '三才气机交锋',
        sub: activeBattle.value.stanceBanner.description,
        isUlt: false,
        isAlly: activeBattle.value.stanceBanner.advantage !== 'ENEMY',
        key: frameKey,
      }
    } else {
      slashBanner.value = null
    }

    // 驱动攻击方冲刺与受击方抖动扣血 + 伤害飘字
    const actor = liveUnitStates.value[ev.actorSlot]
    if (actor && ev.type !== 'STANCE_CLASH') {
      actor.anim = ev.actorSlot.startsWith('ALLY') ? 'LUNGE_ALLY' : 'LUNGE_ENEMY'
      if (ev.rageDelta) {
        actor.rage = Math.max(0, Math.min(100, actor.rage + ev.rageDelta))
      }
    }
    if (ev.targetSlot && liveUnitStates.value[ev.targetSlot]) {
      if (ev.hitResult === 'DODGE') {
        nextPopups[ev.targetSlot] = { text: '身法闪避', isCrit: false, category: 'dodge', key: frameKey }
      } else if (ev.hpDelta) {
        const target = liveUnitStates.value[ev.targetSlot]
        target.hp = Math.max(0, target.hp + ev.hpDelta)
        target.anim = 'HIT'
        const dmgSeg = ev.segments.find((s) => s.type === 'damage')
        const cat = dmgSeg && dmgSeg.type === 'damage' ? dmgSeg.category : 'outer'
        nextPopups[ev.targetSlot] = {
          text: `${ev.hitResult === 'CRIT' ? '暴击 ' : ''}${ev.hpDelta.toLocaleString()}`,
          isCrit: ev.hitResult === 'CRIT',
          category: cat,
          key: frameKey,
        }
      }
    }
    if (ev.reflectDelta && actor) {
      actor.hp = Math.max(0, actor.hp + ev.reflectDelta)
      nextPopups[ev.actorSlot] = {
        text: `反震 ${ev.reflectDelta.toLocaleString()}`,
        isCrit: false,
        category: 'reflect',
        key: frameKey + 1,
      }
    }
    floatingPopups.value = nextPopups

    appendLog('BATTLE', [{ type: 'tag', text: `第${ev.round}回`, tone: 'red' }, { type: 'text', text: ' ' }, ...ev.segments])

    const delay = battleSpeed.value === 2 ? 480 : 920
    battleTimer = setTimeout(stepNextBattleEvent, delay)
  }

  function skipBattleToEnd() {
    if (!activeBattle.value) return
    if (battleTimer) clearTimeout(battleTimer)
    while (battleEventCursor.value < activeBattle.value.events.length) {
      const ev = activeBattle.value.events[battleEventCursor.value]
      battleEventCursor.value += 1
      if (ev.targetSlot && liveUnitStates.value[ev.targetSlot] && ev.hpDelta) {
        liveUnitStates.value[ev.targetSlot].hp = Math.max(0, liveUnitStates.value[ev.targetSlot].hp + ev.hpDelta)
      }
      appendLog('BATTLE', [{ type: 'tag', text: `第${ev.round}回`, tone: 'red' }, { type: 'text', text: ' ' }, ...ev.segments])
    }
    finishBattleSettlement()
  }

  function finishBattleSettlement() {
    if (!activeBattle.value) return
    isBattlePlaying.value = false
    slashBanner.value = null
    floatingPopups.value = {}
    const report = activeBattle.value
    if (report.winner === 'ALLY' && report.rewards) {
      player.value.qiExp += report.rewards.qiExp
      player.value.silver += report.rewards.silver
      if (report.rewards.sectContrib) player.value.sectContribution += report.rewards.sectContrib

      const itemSegs: RichSegment[] = []
      if (report.rewards.items) {
        for (const drop of report.rewards.items) {
          if (SKILLS[drop.id]) {
            learnedSkills.value[drop.id] = Math.max(1, learnedSkills.value[drop.id] ?? 0)
            itemSegs.push({ type: 'skill', id: drop.id, name: `《${drop.name}》`, tier: drop.tier })
          } else if (ITEMS[drop.id]) {
            if (!ownedItemIds.value.includes(drop.id)) ownedItemIds.value.push(drop.id)
            itemSegs.push({ type: 'item', id: drop.id, name: `【${drop.name}】`, tier: drop.tier })
          }
        }
      }

      appendLog('BATTLE', [
        { type: 'tag', text: '大获全胜', tone: 'gold' },
        { type: 'text', text: ` 【${report.sceneTitle}】告捷！获真气 +${report.rewards.qiExp.toLocaleString()}、纹银 +${report.rewards.silver.toLocaleString()} ` },
        ...itemSegs,
      ])
      showToast(`战果辉煌！真气 +${report.rewards.qiExp.toLocaleString()}`, 'gold')

      // 主线节点：推进进度 + 首通剧情（每节点只结算一次，重复历练只拿战利）
      const nodeId = activeChapterId.value
      if (nodeId !== null) {
        if (nodeId >= player.value.maxChapterId) player.value.maxChapterId = nodeId + 1
        claimNodeFirstClear(nodeId)
      }
    } else if (report.winner === 'ENEMY') {
      appendLog('BATTLE', [
        { type: 'tag', text: '惜败收剑', tone: 'red' },
        { type: 'text', text: ` 你在【${report.sceneTitle}】力战不敌，借轻功抽身退走。不妨调整【三才架势】或提升武学重数再战！` },
      ])
      showToast('惜败而归，可调整三才架势针对克制敌方！', 'danger')
    }
  }

  function closeBattleStage() {
    if (battleTimer) clearTimeout(battleTimer)
    activeBattle.value = null
    activeChapterId.value = null
    isBattlePlaying.value = false
    slashBanner.value = null
    floatingPopups.value = {}
  }

  // ==================== 江湖地图、章节推进与多人交互 ====================
  function moveMap(mapId: string) {
    const m = MAPS.find((x) => x.id === mapId)
    if (!m) return
    if (!isMapUnlocked(m, player.value.maxChapterId)) {
      showToast(`【${m.name}】尚未开放：${m.unlockHint ?? '请先推进主线'}`, 'danger')
      return
    }
    settleOfflineQi()
    player.value.currentMapId = mapId
    player.value.coCultivatePartner = null
    nearbyPlayers.value = generateRoomPlayers(mapId)
    appendLog('JIANGHU', [
      { type: 'tag', text: m.safety === 'PEACE' ? '和平共修区' : '限定纷争区', tone: m.safety === 'PEACE' ? 'jade' : 'red' },
      { type: 'text', text: ` 你施展轻功抵达【${m.name}】。${m.ambientDesc}` },
    ])
    showToast(`已踏入【${m.name}】`, m.safety === 'CONTESTED' ? 'danger' : 'info')
  }

  function challengeChapter(chapterId: number) {
    const ch = STORY_CHAPTERS.find((c) => c.id === chapterId)
    if (!ch) return
    if (chapterId > player.value.maxChapterId) {
      showToast('前路未通：需先通关上一回，方可挑战此关', 'danger')
      return
    }
    const drops: { id: string; name: string; tier: TierColor }[] = []
    for (const id of ch.dropItemIds ?? []) {
      if (ITEMS[id]) drops.push({ id, name: ITEMS[id].name, tier: ITEMS[id].tier })
    }
    for (const id of ch.dropSkillIds ?? []) {
      if (SKILLS[id]) drops.push({ id, name: SKILLS[id].name, tier: SKILLS[id].tier })
    }

    appendLog('JIANGHU', [
      { type: 'tag', text: ch.code, tone: ch.isBoss ? 'red' : 'gold' },
      { type: 'text', text: ` ${ch.intro}` },
    ])

    const report = simulateServerBattle({
      bonus: collectionBonus.value,
      sceneTitle: `${ch.code} ${ch.title}`,
      mode: 'SOLO_STORY',
      player: player.value,
      loadout: currentLoadout.value,
      enemyMain: {
        name: ch.bossName,
        title: ch.bossTitle,
        portrait: ch.bossPortrait,
        hp: ch.bossHp,
        atk: ch.bossAtk,
        mp: ch.bossHp * 0.45,
        stance: ch.bossStance,
      },
      enemyGuards: ch.guards,
      rewards: {
        qiExp: ch.rewardQi,
        silver: ch.rewardSilver,
        items: drops,
      },
    })
    // 主线进度与首通剧情在战斗演绎结束后统一结算（见 finishBattleSettlement）
    startBattlePlayback(report, chapterId)
  }

  /** 松鹤楼：3名真实玩家主角实时结义组队战（破少林三渡金刚伏魔圈） */
  function startThreePlayerCoopRaid() {
    const report = simulateServerBattle({
      bonus: collectionBonus.value,
      sceneTitle: '松鹤楼结义 · 少室山三渡金刚伏魔圈',
      mode: 'COOP_3P',
      player: player.value,
      loadout: currentLoadout.value,
      coopPlayers: {
        leftPlayer: { name: '乔北冥(玩家)', sect: '丐帮少帮主', hp: 16800, atk: 1350 },
        rightPlayer: { name: '清风道长(玩家)', sect: '全真掌教首座', hp: 14500, atk: 1120 },
      },
      enemyMain: {
        name: '少林·渡厄神僧',
        title: '金刚伏魔圈主阵',
        portrait: 'monk',
        hp: 26000,
        atk: 1150,
        mp: 9500,
        stance: 'TAICHI',
      },
      enemyGuards: [
        { name: '渡难神僧', title: '黑索左阵', portrait: 'monk', hp: 12000, atk: 780 },
        { name: '渡劫神僧', title: '黑索右阵', portrait: 'monk', hp: 12000, atk: 780 },
      ],
      rewards: {
        qiExp: 18500,
        silver: 5200,
        items: [{ id: 'wumu_yishu', name: '岳武穆遗书', tier: 'red' }],
      },
    })
    startBattlePlayback(report)
  }

  /** 同地图玩家交互：抱拳共修 / 友好切磋 / 限定纷争区劫镖与追杀逆徒 */
  function interactNearbyPlayer(target: RoomPlayerDTO, action: 'CO_CULT' | 'SPAR' | 'AMBUSH') {
    if (action === 'CO_CULT') {
      player.value.coCultivatePartner = target.nickname
      appendLog('JIANGHU', [
        { type: 'tag', text: '双人共修', tone: 'jade' },
        { type: 'text', text: ' 你向同图少侠' },
        { type: 'actor', name: target.nickname, isAlly: true, isPlayer: true },
        { type: 'text', text: '抱拳论道，对坐结印，双方打坐真气效率共同提升 +15%！' },
      ])
      showToast(`已与【${target.nickname}】结成共修蒲团（打坐+15%）`, 'gold')
      return
    }

    if (action === 'AMBUSH') {
      // 强校验：和平区禁止恶意PK（唯独全服叛师红名逆徒可随时缉拿！）
      if (currentMap.value.safety === 'PEACE' && !target.isBetrayerBounty) {
        showToast('【天道铁则】当前为和平共修区，禁止拔刀偷袭！请前往大漠商道或黑沼纷争区。', 'danger')
        return
      }
      if (!target.isBetrayerBounty) {
        player.value.shaQi += 15
        player.value.stats.karma -= 40
      } else {
        player.value.stats.karma += 60
      }
    }

    const titlePrefix =
      action === 'SPAR'
        ? `点到为止 · 切磋【${target.nickname}】`
        : target.isBetrayerBounty
          ? `清理门户 · 追缉逆徒【${target.nickname}】`
          : `纷争劫镖 · 强夺【${target.nickname}】`

    const report = simulateServerBattle({
      bonus: collectionBonus.value,
      sceneTitle: titlePrefix,
      mode: action === 'SPAR' ? 'PVP_HUASHAN' : 'PVP_AMBUSH',
      player: player.value,
      loadout: currentLoadout.value,
      enemyMain: {
        name: target.nickname,
        title: target.sectName,
        portrait: target.isBetrayerBounty ? 'assassin' : 'hero_sword',
        hp: Math.round(target.combatPower * 0.55),
        atk: Math.round(target.combatPower * 0.045),
        mp: Math.round(target.combatPower * 0.25),
        stance: target.stance,
      },
      rewards:
        action === 'SPAR'
          ? { qiExp: 1200, silver: 200 }
          : { qiExp: 4200, silver: target.isBetrayerBounty ? 10000 : 4800 },
    })
    startBattlePlayback(report)
  }

  // ==================== 门派拜师、首席请安、圆满出师与强行叛师 ====================
  const sectCheckCtx = () => ({ hasBagua: ownedItemIds.value.includes('iron_bagua'), flags: storyFlags.value })

  function joinSect(sectId: string) {
    if (player.value.currentSectId) {
      showToast('你已有师承在身，需先四阶【圆满出师】或【破门叛师】方可改投他派！', 'danger')
      return
    }
    if (betrayedSectIds.value.includes(sectId)) {
      showToast('你曾欺师背叛该门派，好感度为【不共戴天】，永不可再入山门！', 'danger')
      return
    }
    const sect = SECTS.find((s) => s.id === sectId)
    if (!sect) return
    const check = sect.checkReq(player.value.stats, sectCheckCtx())
    if (!check.ok) {
      showToast(check.reason ?? '未满足入门门槛', 'danger')
      return
    }

    const hasIntro = !!sect.introFlag && storyFlags.value.includes(sect.introFlag)
    player.value.currentSectId = sect.id
    player.value.sectRank = 1
    player.value.sectContribution = 100 + (hasIntro ? (sect.introBonus ?? 0) : 0)
    const entrySkill = sect.signatureSkills[0]
    if (entrySkill) learnedSkills.value[entrySkill] = Math.max(1, learnedSkills.value[entrySkill] ?? 0)

    appendLog('JIANGHU', [
      { type: 'tag', text: '奉茶拜师', tone: 'gold' },
      { type: 'text', text: ` 你于祖师牌位前恭敬奉茶，正式拜入【${sect.name}】，位列「${sect.ranks[0]}」，获传入门心法！` },
      ...(hasIntro ? [{ type: 'text' as const, text: `（凭引荐信入门，起始门派贡献 +${sect.introBonus}）` }] : []),
    ])
    showToast(`恭喜拜入【${sect.name}】！`, 'gold')
  }

  function saluteChiefPlayer() {
    if (!currentSect.value) return
    player.value.qiExp += 1800
    player.value.sectContribution += 60
    appendLog('JIANGHU', [
      { type: 'tag', text: '同门共勉', tone: 'jade' },
      { type: 'text', text: ` 你向本派玩家首席【${currentSect.value.chiefPlayerName}】抱拳请安，获指点迷津，真气 +1,800，门派贡献 +60！` },
    ])
    showToast(`向大师兄请安：真气 +1800，贡献 +60`, 'gold')
  }

  function challengeSectPromotion() {
    if (!currentSect.value) return
    if (player.value.sectRank >= 5) {
      showToast('你已是本门最高五阶衣钵传人！', 'gold')
      return
    }
    const nextRankName = currentSect.value.ranks[player.value.sectRank]
    const report = simulateServerBattle({
      bonus: collectionBonus.value,
      sceneTitle: `${currentSect.value.name}升阶大考 · 晋升「${nextRankName}」`,
      mode: 'SECT_TRIAL',
      player: player.value,
      loadout: currentLoadout.value,
      enemyMain: {
        name: `${currentSect.value.name}传功长老`,
        title: `考校官 · 第${player.value.sectRank + 1}阶试剑`,
        portrait: 'huangyaoshi',
        hp: 5500 * player.value.sectRank,
        atk: 420 * player.value.sectRank,
        mp: 3000 * player.value.sectRank,
        stance: 'TAICHI',
      },
      rewards: {
        qiExp: 4500 * player.value.sectRank,
        silver: 1500,
        sectContrib: 200,
      },
    })

    if (report.winner === 'ALLY') {
      player.value.sectRank += 1
      const sect = currentSect.value
      const newRank = player.value.sectRank
      const grants: RichSegment[] = []

      // 按新阶位授武 / 赠装备（signatureSkills 下标 = 阶位 - 1）
      const skillId = sect.signatureSkills[newRank - 1]
      if (skillId && SKILLS[skillId]) {
        const sk = SKILLS[skillId]
        const had = (learnedSkills.value[skillId] ?? 0) > 0
        learnedSkills.value[skillId] = Math.max(1, learnedSkills.value[skillId] ?? 0)
        if (!had) grants.push({ type: 'text', text: '，获传绝学' }, { type: 'skill', id: skillId, name: `《${sk.name}》`, tier: sk.tier })
      }
      const itemId = sect.signatureItems?.[newRank]
      if (itemId && ITEMS[itemId] && !ownedItemIds.value.includes(itemId)) {
        ownedItemIds.value.push(itemId)
        grants.push({ type: 'text', text: '，赐下' }, { type: 'item', id: itemId, name: `【${ITEMS[itemId].name}】`, tier: ITEMS[itemId].tier })
      }

      appendLog('JIANGHU', [
        { type: 'tag', text: '辈分晋升', tone: 'gold' },
        { type: 'text', text: ` 考校通过！你晋升为【${sect.name}·${nextRankName}】` },
        ...grants,
        { type: 'text', text: '！' },
      ])
    }
    startBattlePlayback(report)
  }

  function leaveSect(mode: 'GRADUATE' | 'BETRAY') {
    if (!currentSect.value) return
    const oldSect = currentSect.value

    if (mode === 'GRADUATE') {
      if (player.value.sectRank < 4) {
        showToast('需达到本派第 4 阶（护法长老/真传）方可堂堂正正【圆满出师】！', 'danger')
        return
      }
      player.value.currentSectId = null
      player.value.sectRank = 1
      appendLog('JIANGHU', [
        { type: 'tag', text: '圆满出师', tone: 'gold' },
        { type: 'text', text: ` 你接过掌门赐予的【出师玉牒】拜别【${oldSect.name}】，完好保留所学武功重归自由之身，可兼修百家！` },
      ])
      showToast(`圆满出师！已保留【${oldSect.name}】武学恢复自由身`, 'gold')
      return
    }

    // 强行叛师：保留偷学武学，但触发全服玩家悬赏追杀令！（含叛全真入古墓原著彩蛋）
    const isQuanzhenToGumu = oldSect.id === 'quanzhen'
    betrayedSectIds.value.push(oldSect.id)
    player.value.currentSectId = null
    player.value.sectRank = 1
    player.value.bountyUntil = Date.now() + 1000 * 3600 * 48
    player.value.stats.karma -= 120

    worldMessages.value.unshift({
      id: `bounty_${Date.now()}`,
      channel: 'RUMOR',
      sender: '清理门户悬赏令',
      sect: oldSect.name,
      content: `⚠️逆徒【${player.value.nickname}】私携秘籍叛出${oldSect.name}！全服侠士可在任意地图将其截杀，赏纹银十万两！`,
      time: '刚刚',
    })

    appendLog('JIANGHU', [
      { type: 'tag', text: '破门叛师', tone: 'red' },
      { type: 'text', text: ` 你震断门规碑石，强携所学秘籍叛出【${oldSect.name}】！全服已发布【甲字号追杀令】！` },
      ...(isQuanzhenToGumu
        ? [{ type: 'tag' as const, text: '彩蛋触发：叛全真孤鸿（身法+5，对名门伤害+25%）', tone: 'purple' as const }]
        : []),
    ])
    if (isQuanzhenToGumu) player.value.stats.agi += 5
    showToast(`你已强行叛出${oldSect.name}！全服追杀令已发出！`, 'danger')
  }

  // ==================== 武库装配与秘籍参悟 ====================
  /** 参悟升重所需真气（代入第06册悟性减免公式）；UI 用它显示价格并判断是否买得起 */
  function getSkillUpgradeCost(skillId: string): number {
    const lv = learnedSkills.value[skillId] ?? 0
    const sk = SKILLS[skillId]
    if (!sk || lv <= 0) return 0
    const tierBase = sk.tier === 'green' ? 400 : sk.tier === 'blue' ? 900 : sk.tier === 'purple' ? 2200 : sk.tier === 'orange' ? 5000 : 11000
    return Math.round(tierBase * lv * (1 - player.value.stats.intStat / (player.value.stats.intStat + 180)))
  }

  function upgradeSkillMastery(skillId: string) {
    const lv = learnedSkills.value[skillId] ?? 0
    if (lv <= 0 || lv >= 10) return
    const sk = SKILLS[skillId]
    const cost = getSkillUpgradeCost(skillId)
    if (player.value.qiExp < cost) {
      showToast(`参悟所需真气不足（需 ${cost.toLocaleString()} 真气，高悟性可减免消耗）`, 'danger')
      return
    }
    player.value.qiExp -= cost
    learnedSkills.value[skillId] = lv + 1
    player.value.stats.str += 1
    showToast(`《${sk.name}》参悟至第 ${lv + 1} 重！`, 'gold')
  }

  function equipItem(itemId: string) {
    const it = ITEMS[itemId]
    if (!it) return
    if (it.reqStat && player.value.stats[it.reqStat.key] < it.reqStat.val) {
      showToast(`属性未达穿戴门槛：需【${it.reqStat.label}】！`, 'danger')
      return
    }
    const p = presets.value[player.value.activePresetIdx]
    if (it.slot === 'WEAPON') p.weaponId = itemId
    else if (it.slot === 'ARMOR') p.armorId = itemId
    else if (it.slot === 'ACC') p.accId = itemId
    else if (it.slot === 'RELIC') p.relicBookId = itemId
    showToast(`已装备【${it.name}】`, 'gold')
  }

  // ==================== 市井：醉仙客栈请酒传功 & 子时鬼市鉴宝 ====================
  function giftCompanionInInn(compId: string, isFavorite: boolean) {
    const c = COMPANIONS[compId]
    const state = companionAffinity.value[compId]
    if (!c || !state) return
    if (!state.met) {
      showToast(`尚未结识【${c.name}】：${c.meetHint ?? '请先推进主线与支线'}`, 'danger')
      return
    }
    const cost = isFavorite ? INN_GIFT_COST : INN_TEA_COST
    if (player.value.silver < cost) {
      showToast('囊中羞涩，纹银不足以置办酒席！', 'danger')
      return
    }
    player.value.silver -= cost
    const delta = isFavorite ? 80 : 20
    state.affinity = Math.min(1000, state.affinity + delta)
    state.recruited = state.affinity >= 100

    appendLog('JIANGHU', [
      { type: 'tag', text: '醉仙煮酒', tone: 'gold' },
      { type: 'text', text: ` 你在二楼雅座奉上「${isFavorite ? c.favGift : '江南水酒'}」与` },
      { type: 'actor', name: c.name, isAlly: true },
      { type: 'text', text: `把酒言欢，好感度 +${delta}（当前 ${state.affinity}/1000）！` },
    ])

    // 满600点【生死之交】触发倾囊传功！
    if (state.affinity >= 600 && !state.taught && SKILLS[c.teachSkillId]) {
      state.taught = true
      learnedSkills.value[c.teachSkillId] = Math.max(1, learnedSkills.value[c.teachSkillId] ?? 0)
      const taughtSk = SKILLS[c.teachSkillId]
      appendLog('ADVENTURE', [
        { type: 'tag', text: '生死之交·倾囊传功', tone: 'gold' },
        { type: 'actor', name: c.name, isAlly: true },
        { type: 'text', text: '拍案长啸：“人生得一知己足矣！今日便将这看家本领传予你！”你已习得' },
        { type: 'skill', id: taughtSk.id, name: `《${taughtSk.name}》`, tier: taughtSk.tier },
        { type: 'text', text: '！' },
      ])
      showToast(`达成生死之交！【${c.name}】倾囊传授《${taughtSk.name}》！`, 'gold')
    } else {
      showToast(`${c.name}好感度 +${delta}`, 'info')
    }
  }

  function appraiseGhostCurio() {
    if (player.value.silver < GHOST_APPRAISE_COST) {
      showToast(`鉴宝需花费 ${GHOST_APPRAISE_COST} 两纹银！`, 'danger')
      return
    }
    // 正派弟子未蒙面抓包判定
    const isRighteousSect = currentSect.value?.alignment === 'RIGHTEOUS'
    if (isRighteousSect && !player.value.wearingMask) {
      player.value.stats.karma -= 25
      appendLog('JIANGHU', [
        { type: 'tag', text: '戒律撞破', tone: 'red' },
        { type: 'text', text: ' 你未戴【夜行蒙面巾】便踏入五更鬼市淘货，被巡夜同门师兄撞个正着！（侠义 -25）' },
      ])
    }

    player.value.silver -= GHOST_APPRAISE_COST
    const highInsight = player.value.stats.intStat >= 28 || player.value.stats.luck >= 28
    if (highInsight && !ownedItemIds.value.includes('xuantie_heavysword')) {
      ownedItemIds.value.push('xuantie_heavysword')
      appendLog('ADVENTURE', [
        { type: 'tag', text: '慧眼识珠', tone: 'gold' },
        { type: 'text', text: ' 你摩挲泥污铁胎，凭过人悟性认出竟是剑冢流落的' },
        { type: 'item', id: 'xuantie_heavysword', name: '【乌金玄铁重剑】', tier: 'red' },
        { type: 'text', text: '，仅花六百两捡漏入手！' },
      ])
      showToast('奇门鉴宝大赚！捡漏神品【乌金玄铁重剑】！', 'gold')
    } else {
      pillCount.value += 1
      player.value.qiExp += 2200
      appendLog('JIANGHU', [
        { type: 'tag', text: '鬼市淘货', tone: 'purple' },
        { type: 'text', text: ' 你洗去旧瓷瓶泥垢，内藏一枚桃花岛【九花玉露丸】与前人练功心得（真气 +2,200）！' },
      ])
      showToast('淘得【九花玉露丸 ×1】与真气心得！', 'gold')
    }
  }

  function buyOrBidMarketListing(listing: GhostMarketListingDTO) {
    if (listing.currency === 'SILVER') {
      if (player.value.silver < listing.price) {
        showToast('纹银不足！', 'danger')
        return
      }
      player.value.silver -= listing.price
    } else {
      if (player.value.goldIngot < listing.price + 50) {
        showToast('元宝不足以加价竞拍！', 'danger')
        return
      }
      player.value.goldIngot -= 50
      listing.price += 50
      listing.highestBidderMasked = '蒙面客·你自己'
      learnedSkills.value[listing.itemId] = 1
      showToast(`出价领先！已锁定《凌波微步》帛卷！`, 'gold')
      return
    }

    if (SKILLS[listing.itemId]) {
      learnedSkills.value[listing.itemId] = 1
    } else if (ITEMS[listing.itemId] && !ownedItemIds.value.includes(listing.itemId)) {
      ownedItemIds.value.push(listing.itemId)
    }
    ghostListings.value = ghostListings.value.filter((x) => x.id !== listing.id)
    showToast(`匿名交易成功！购得 ${listing.itemName}`, 'gold')
  }

  function sendChatMessage(content: string, channel: 'WORLD' | 'SECT' = 'WORLD') {
    const trimmed = content.trim()
    if (!trimmed) return
    worldMessages.value.unshift({
      id: `msg_${Date.now()}`,
      channel,
      sender: player.value.nickname,
      sect: currentSect.value?.name ?? '逍遥散人',
      content: trimmed,
      time: '刚刚',
    })
  }

  // 每5秒模拟一次在线打坐微跳与江湖时辰推进
  setInterval(() => {
    const tickQi = Math.max(8, Math.round(effectiveQiPerHour.value / 720))
    player.value.qiExp += tickQi
  }, 5000)

  // 顶部飞鸽江湖邸报走马灯实时拼接文本（无彩色Emoji，纯正武侠邸报文风）
  const marqueeBulletin = computed(() => {
    const items: string[] = []
    if (player.value.bountyUntil) {
      items.push(`【海捕文书】逆徒「${player.value.nickname}」携秘籍叛出师门，诸派侠士皆可拔刀缉拿领赏`)
    }
    for (const art of uniqueArtifacts.value) {
      if (art.holderNickname) {
        items.push(`【兵器谱孤品】传世神兵「${art.name}」现由 ${art.holderSect}·${art.holderNickname} 执掌（连守 ${art.defendStreak} 届）`)
      } else {
        items.push(`【秘境风声】无主孤品「${art.name}」将于 ${art.nextContestLabel} 现世，群雄静候夺魁`)
      }
    }
    const latestRumor = worldMessages.value.find((m) => m.channel === 'RUMOR')
    if (latestRumor) {
      items.push(`【百晓生传书】${latestRumor.content}`)
    }
    items.push('【松鹤楼结义】三人组队秘境《少室山三渡金刚伏魔圈》开启，破阵可获神品武学残卷')
    return items.join('　　·　　')
  })

  return {
    isMidnightTheme,
    activeTab,
    mobileDrawer,
    shichenIdx,
    shichenLabel: computed(() => SHICHEN_LABELS[shichenIdx.value]),
    toasts,
    confirmDialog,
    inspectModal,
    player,
    learnedSkills,
    ownedItemIds,
    pillCount,
    companionAffinity,
    presets,
    currentLoadout,
    currentRealm,
    currentMap,
    currentSect,
    derivedStats,
    setBonusStates,
    collectionBonus,
    effectiveQiPerHour,
    activeTrioSynergy,
    isWandererMasteryActive,
    nearbyPlayers,
    uniqueArtifacts,
    ghostListings,
    worldMessages,
    marqueeBulletin,
    logs,
    pendingAdventure,
    adventureQueue,
    resolvedAdventureIds,
    claimedNodeIds,
    storyFlags,
    activeBattle,
    isBattlePlaying,
    battleSpeed,
    liveUnitStates,
    slashBanner,
    floatingPopups,
    toggleTheme,
    askConfirm,
    resolveConfirm,
    getSkillUpgradeCost,
    openInspect,
    inspectById,
    settleOfflineQi,
    upgradeLevel,
    attemptBreakthrough,
    triggerRandomAdventure,
    resolveAdventure,
    skipBattleToEnd,
    closeBattleStage,
    moveMap,
    challengeChapter,
    startThreePlayerCoopRaid,
    interactNearbyPlayer,
    joinSect,
    saluteChiefPlayer,
    challengeSectPromotion,
    leaveSect,
    upgradeSkillMastery,
    equipItem,
    giftCompanionInInn,
    appraiseGhostCurio,
    buyOrBidMarketListing,
    sendChatMessage,
  }
})
