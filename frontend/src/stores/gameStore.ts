import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type {
  BattleReportDTO,
  CombatUnitDTO,
  EquipSlotType,
  GachaDrawDTO,
  GameLogEntry,
  IdleGain,
  GhostMarketListingDTO,
  LoadoutPresetDTO,
  PendingAdventureDTO,
  PlayerAvatarId,
  PlayerDTO,
  PlayerSnapshot,
  RaidLobbyDTO,
  RichSegment,
  RoomPlayerDTO,
  SkillUpgradeResult,
  StanceType,
  StoryChallengeResult,
  TrialChallengeResult,
  TrialPatrolStatusDTO,
  TrialReplayResult,
  TierColor,
  UniqueArtifactStatusDTO,
  WsServerEvent,
} from '@/network/protocol'
import {
  calcNextLevelQi,
  computeDerivedStats,
  generateRoomPlayers,
  INITIAL_GHOST_LISTINGS,
  INITIAL_UNIQUE_ARTIFACTS,
  rollGacha,
  simulateServerBattle as simulateBattle,
} from '@/network/mockEngine'
import {
  ACUPOINTS,
  MEDICINES,
  HERBS,
  type HerbConfig,
  PILL_RECIPES,
  type PillRecipeConfig,
  getMapHerbs,
  activeSetBonuses,
  ADVENTURES,
  adventureById,
  affinityCapFor,
  COMPANIONS,
  COOP_RAID_RELICS,
  companionView,
  findTrioSynergy,
  getChapterDrops,
  GHOST_APPRAISE_COST,
  INN_GIFT_COST,
  INN_GIFT_DAILY,
  INN_TEA_COST,
  INN_TEA_DAILY,
  isMapUnlocked,
  ITEMS,
  MAPS,
  REALMS,
  SHAOSHI_RAID,
  SECTS,
  SKILLS,
  STAT_LABEL,
  STORY_CHAPTERS,
  validateGameData,
  type AdventureChoice,
  type CompanionGrade,
  type AdventureCtx,
  type Reward,
} from '@/config/gameData'
import { EQUIP_SLOT_META, formatSkillPower, itemBonusLabels, shichenIdxFromDate, SKILL_SLOT_META, STANCE_META } from '@/config/uiMeta'
import { apiClient, ApiError, IS_MOCK_MODE } from '@/network/apiClient'
import { coCultivationRate, createStarterCharacter, cultivationRate, idleQiNumerator } from '../../../shared/player.ts'
import {
  PATROL_DROP_CHANCE, PATROL_ENCOUNTER_MINUTES, TRIAL_PATROL_HOURS, TRIAL_REPLAY_HOURS,
  TRIAL_STAGES, trialItemOf, trialPartId, trialSetOf, trialStageOf,
} from '../../../shared/trialStages.ts'
import { FTUE_QUESTS, HAND_THREE_YANG, type FtueQuestConfig } from '../../../shared/ftueQuests.ts'
import { MAX_SKILL_MASTERY, getSkillMasteryCap, skillUpgradeCost } from '../../../shared/skillMastery.ts'
import { useOnlineGame } from './onlineGame'
import {
  GACHA_DUP_SILVER,
  GACHA_DUP_TOKENS,
  GACHA_SINGLE_COST,
  GACHA_TEN_COST,
  REUNION_AFTER,
  REUNION_TICKET_COST,
  validateGachaData,
} from '@/config/gachaData'
import type { PortraitStyle } from '@/config/typesHelper'
import {
  DISHES,
  FEAST_GATHER_MINUTES,
  FEAST_TARGET_FLAG,
  REUNION_CLUE_SOURCES,
  REUNION_CLUE_TARGET,
  REUNION_INQUIRE_COST,
  REUNION_QUESTS,
  REUNION_WAIT_HOURS,
  validateQuestData,
  type ClueSource,
} from '@/config/questData'
import { clearSave, LOCAL_SAVE_ENABLED, readSave, writeSave } from './persistence'

/** 抽卡揭晓卡片：服务端结果 + 本地结算后的展示信息 */
export interface GachaResultView {
  draw: GachaDrawDTO
  name: string
  detail: string
  isNew: boolean
  portrait?: PortraitStyle // 伙伴用水墨人像
  glyph: string // 其余用印章字
}

const SHICHEN_LABELS = ['子时·夜半', '寅时·平旦', '辰时·烟雨', '午时·日正', '申时·斜阳', '戌时·黄昏']

export type MainTab = 'CULTIVATE' | 'JIANGHU' | 'ARSENAL' | 'SECT' | 'MARKET'
type RaidTeamAction =
  | { action: 'invite'; targetPlayerId: string }
  | { action: 'accept' | 'decline'; invitationId: string }
  | { action: 'ready'; teamId: string; ready: boolean }
  | { action: 'leave'; teamId: string }

export const useGameStore = defineStore('wuxiaGame', () => {
  if (import.meta.env.DEV) {
    const errs = [...validateGameData(), ...validateGachaData(), ...validateQuestData()]
    if (errs.length) console.warn('[gameData] 数据引用校验失败：\n' + errs.join('\n'))
  }

  // 主题与响应式抽屉状态（默认启动采用燕云玄墨深色护眼主题）
  const isMidnightTheme = ref(true)
  const activeTab = ref<MainTab>('CULTIVATE')
  const jianghuTab = ref<'STORY' | 'TRIAL' | 'MAPS' | 'RAID'>('TRIAL')
  const arsenalTab = ref<'SKILLS' | 'SQUAD' | 'EQUIP' | 'MERIDIAN'>('SKILLS')
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

  const starter = createStarterCharacter({ id: 'p_10086', nickname: '陆小鱼', avatarId: 'hero_sword' }, Date.now() - 42 * 60_000)
  if (IS_MOCK_MODE) starter.player.maxChapterId = 5
  const player = ref(starter.player)
  const learnedSkills = ref(starter.learnedSkills)
  const ownedItemIds = ref(starter.ownedItemIds)
  const openedAcupointIds = ref<string[]>((starter as any).openedAcupointIds ?? [
    'shangyang', 'hegu', 'quchi', 'jianyu', 'yingxiang',
    'yinbai', 'yongquan', 'sanyinjiao', 'taichong', 'qimen',
  ])
  const pillInventory = ref<Record<string, number>>((starter as any).pillInventory ?? {
    pozhang_dan: 2,
    tongmai_dan: 3,
    bingpo_huxin_dan: 1,
    shaolin_xiaohuan_dan: 1,
    jiuzhuan_tongqiao_dan: 0,
  })
  const pillCount = computed({
    get: () => pillInventory.value.pozhang_dan ?? 0,
    set: (v: number) => { pillInventory.value.pozhang_dan = v },
  })
  const herbInventory = ref<Record<string, number>>((starter as any).herbInventory ?? {
    sanqi: 6,
    cheqian_cao: 5,
    honghua: 4,
    heding_lu: 2,
    jinyinhua: 4,
    fuling: 3,
    heshouwu: 2,
    chunyang_zhi: 1,
    mahuang: 3,
    hongjingtian: 2,
    xuelian_hua: 1,
    qushe_dan: 1,
    shexian_cao: 3,
    wugong_qiao: 2,
    duanchang_cao: 1,
    linghu_cao: 0,
  })
  const knownRecipeIds = ref<string[]>((starter as any).knownRecipeIds ?? Object.keys(PILL_RECIPES))
  const furnaceResidue = ref<number>((starter as any).furnaceResidue ?? 3)
  const alchemyPity = ref<Record<string, number>>((starter as any).alchemyPity ?? {})
  const presets = ref(starter.presets)
  const betrayedSectIds = ref<string[]>([])
  const marketTab = ref<'INN' | 'GHOST' | 'ALCHEMY' | 'HUASHAN' | 'ARTIFACTS'>('INN')

  // 剧情进度：标记、已领取首通奖励的主线节点、已了结的奇遇、待决奇遇队列
  const storyFlags = ref<string[]>([])
  const claimedNodeIds = ref<number[]>([])
  const resolvedAdventureIds = ref<string[]>([])
  const adventureQueue = ref<string[]>([])
  const pendingAdventureId = ref<string | null>(IS_MOCK_MODE ? 'shedu_baoxue' : null)

  // 开局模式：null=尚未选择（显示开局界面）；NEW=新游戏（正式规则）；DEMO=演武模式（旧版全伙伴 Demo，后续版本移除）
  const gameMode = ref<'NEW' | 'DEMO' | null>(null)
  const limitsEnabled = computed(() => gameMode.value === 'NEW')

  // 伙伴好感度与招募状态（met=已结识，客栈才会显示；recruited=好感≥100可编入左右翼）
  type CompanionState = {
    affinity: number
    recruited: boolean
    taught: boolean
    met: boolean
    form: 'base' | 'awakened'
    grade: CompanionGrade | null
    tokens: number // 伙伴信物，用于觉醒进阶
  }
  const blankCompanionStates = (): Record<string, CompanionState> =>
    Object.fromEntries(
      Object.values(COMPANIONS).map((c) => [
        c.id,
        { affinity: 0, recruited: false, taught: false, met: false, form: 'base' as const, grade: c.grade ?? null, tokens: 0 },
      ])
    )
  function restoreCompanionStates(states: Record<string, Partial<CompanionState>>, legacy = false) {
    const result = blankCompanionStates()
    for (const [id, defaults] of Object.entries(result)) {
      const state = states[id]
      if (!state) continue
      result[id] = {
        ...defaults,
        met: state.recruited ?? false,
        form: legacy && state.recruited && COMPANIONS[id].awakened ? 'awakened' : 'base',
        ...state,
      }
    }
    return result
  }
  const companionAffinity = ref(restoreCompanionStates(starter.companionAffinity, true))
  /** 免费入队判定：好感 ≥100，且满足伙伴的剧情门槛（如洪七公须呈齐十道绝味）。抽卡 / 重逢令不受此限 */
  function recruitable(id: string, affinity: number) {
    const flag = COMPANIONS[id]?.recruitFlag
    return affinity >= 100 && (!flag || storyFlags.value.includes(flag))
  }

  // 客栈送礼：每日次数（以子时为界刷新，仅新游戏生效）
  const innDay = ref('')
  const innGiftsToday = ref<Record<string, { tea: number; gift: number }>>({})
  const dayKey = (t = Date.now()) => {
    const d = new Date(t + 3600_000) // 23:00 起算新的一天（子时）
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  }

  // 首日《江湖行历》：进度按现有系统状态推导，领取记录按角色本地保存
  interface FtueState { index: number; claimed: number[]; forageCount: number; refinedRecipeIds: string[] }
  const FTUE_KEY = (id: string) => `wuxia-ftue-${id}`
  const emptyFtue = (): FtueState => ({ index: 0, claimed: [], forageCount: 0, refinedRecipeIds: [] })
  function loadFtue(id: string): FtueState {
    if (IS_MOCK_MODE && !LOCAL_SAVE_ENABLED) return emptyFtue()
    try {
      const raw = localStorage.getItem(FTUE_KEY(id))
      if (!raw) return emptyFtue()
      const saved = JSON.parse(raw) as Partial<FtueState>
      return { ...emptyFtue(), ...saved, claimed: saved.claimed ?? [], refinedRecipeIds: saved.refinedRecipeIds ?? [] }
    } catch {
      return emptyFtue()
    }
  }
  const ftue = ref<FtueState>(loadFtue(player.value.id))
  function saveFtue() {
    if (IS_MOCK_MODE && !LOCAL_SAVE_ENABLED) return
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(FTUE_KEY(player.value.id), JSON.stringify(ftue.value))
    } catch {
      // 仍可在当前会话中继续江湖行历。
    }
  }
  watch(() => player.value.id, (id) => { ftue.value = loadFtue(id) }, { flush: 'sync' })
  const onlineState = shallowRef<{ snapshot: PlayerSnapshot; receivedAt: number } | null>(null)
  const shaoshiClears = computed(() => onlineState.value?.snapshot.shaoshiClears ?? 0)
  const nextRaidRelic = computed(() => IS_MOCK_MODE
    ? COOP_RAID_RELICS.find((item) => !ownedItemIds.value.includes(item.id))
    : COOP_RAID_RELICS[shaoshiClears.value])
  const raidLobby = shallowRef<RaidLobbyDTO>({ team: null, invitation: null })
  const raidLobbyBusy = ref(false)
  let lastRaidBattleId: string | null = null
  const onlineClock = ref(Date.now())
  const onlineTime = computed(() => {
    const live = onlineState.value
    return live ? live.snapshot.serverTime + Math.max(0, onlineClock.value - live.receivedAt) : onlineClock.value
  })
  const activeCoCultivation = computed(() => {
    const pair = onlineState.value?.snapshot.coCultivation
    return pair && pair.startsAt <= onlineTime.value && pair.endsAt > onlineTime.value ? pair : null
  })
  const coCultivationInvite = computed(() => {
    const invite = onlineState.value?.snapshot.coCultivationInvite
    return invite && invite.expiresAt > onlineTime.value ? invite : null
  })
  if (!IS_MOCK_MODE) {
    const clock = setInterval(() => {
      if (activeCoCultivation.value || coCultivationInvite.value) onlineClock.value = Date.now()
    }, 1_000)
    onScopeDispose(() => clearInterval(clock))
  }

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
  const derivedStats = computed(() => onlineState.value?.snapshot.derivedStats ?? computeDerivedStats(player.value, currentLoadout.value, collectionBonus.value))

  /** 好感上限随主线章节推进抬高（仅新游戏）；演武模式不设限 */
  const affinityCap = computed(() => (limitsEnabled.value ? affinityCapFor(player.value.maxChapterId) : 1000))
  function giftsLeft(id: string) {
    if (!limitsEnabled.value) return { tea: Infinity, gift: Infinity }
    const used = innDay.value === dayKey() ? innGiftsToday.value[id] : undefined
    return { tea: INN_TEA_DAILY - (used?.tea ?? 0), gift: INN_GIFT_DAILY - (used?.gift ?? 0) }
  }
  /** 伙伴当前形态视图（形态 / 资质已套用），界面与战斗统一读它 */
  const companionOf = (id: string) => (COMPANIONS[id] ? companionView(COMPANIONS[id], companionAffinity.value[id]) : undefined)

  function simulateServerBattle(params: Parameters<typeof simulateBattle>[0]) {
    return simulateBattle({ bonus: collectionBonus.value, companionOf, ...params })
  }

  // 计算当前实时每小时打坐真气效率
  const effectiveQiPerHour = computed(() => {
    const live = onlineState.value?.snapshot
    if (!live) return cultivationRate(player.value, currentLoadout.value, collectionBonus.value.idleQiPct)
    return activeCoCultivation.value ? coCultivationRate(live.soloQiPerHour) : live.soloQiPerHour
  })

  // 当前激活的三人行羁绊
  const activeTrioSynergy = computed(() =>
    findTrioSynergy(currentLoadout.value.leftCompanionId, currentLoadout.value.rightCompanionId)
  )

  // 散人百家混搭特权判定
  const isWandererMasteryActive = computed(() => !player.value.currentSectId)

  // 同地图在线玩家与聊天频道
  const nearbyPlayers = ref<RoomPlayerDTO[]>(IS_MOCK_MODE ? generateRoomPlayers('jiaxing_suburb') : [])
  const roomMapId = ref<string | null>(null)
  const roomCount = ref(0)
  const uniqueArtifacts = ref<UniqueArtifactStatusDTO[]>([...INITIAL_UNIQUE_ARTIFACTS])
  const ghostListings = ref<GhostMarketListingDTO[]>([...INITIAL_GHOST_LISTINGS])

  const worldMessages = ref<
    { id: string; channel: 'WORLD' | 'SECT' | 'RUMOR'; sender: string; sect: string; content: string; time: string }[]
  >(IS_MOCK_MODE ? [
    { id: 'm1', channel: 'RUMOR', sender: '江湖百晓生', sect: '天机', content: '传闻【真·绿玉打狗棒】现落入白驼山【西域毒皇·欧阳烈】之手，丐帮群豪正欲夺回！', time: '辰时' },
    { id: 'm2', channel: 'WORLD', sender: '重阳首座·清风道长', sect: '全真教', content: '松鹤楼结义秘境【少林金刚伏魔圈】2缺1高爆发少侠，来个会降龙掌的兄弟！', time: '辰时' },
    { id: 'm3', channel: 'WORLD', sender: '桃花小师妹', sect: '桃花岛', content: '哪位散人大哥鬼市淘到了《九阴残页》？诚心高价收！', time: '巳时' },
  ] : [])

  // 滚动富文本日志流
  const logs = ref<GameLogEntry[]>(IS_MOCK_MODE ? [
    {
      id: 'init_1',
      timeLabel: '辰时·入世',
      channel: 'JIANGHU',
      segments: [
        { type: 'tag', text: '初入江湖', tone: 'gold' },
        { type: 'text', text: ' 你带着忘机客留下的' },
        { type: 'item', id: 'iron_bagua', name: '【曲三铁八卦】', tier: 'blue' },
        { type: 'text', text: '来到嘉兴南湖。你还未拜师，是个' },
        { type: 'tag', text: '逍遥散人', tone: 'jade' },
        { type: 'text', text: '。' },
      ],
    },
    {
      id: 'init_2',
      timeLabel: '辰时·共鸣',
      channel: 'CULTIVATE',
      segments: [
        { type: 'text', text: ' ' },
        { type: 'actor', name: '黄蓉', isAlly: true },
        { type: 'text', text: '笑道：“靖哥哥，咱们一块儿闯江湖！”郭靖和黄蓉一起上阵，搭档' },
        { type: 'tag', text: '靖蓉同心', tone: 'purple' },
        { type: 'text', text: '已生效。' },
      ],
    },
  ] : [])

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
  let battleOnWin: (() => void) | null = null // 非主线战斗的胜利回调（如故人重逢）

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
    // 无 DOM 环境（测试 / 服务端渲染）下只更新状态
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('theme-midnight', isMidnightTheme.value)
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
        subtitle: `${SKILL_SLOT_META[s.slot].label} · 第 ${lv} 重 · ${s.source}`,
        tier: s.tier,
        desc: s.desc,
        extra: s.castNarrative,
      })
    } else if (kind === 'item' && ITEMS[id]) {
      const it = ITEMS[id]
      const details = itemBonusLabels(it)
      if (it.signatureEffect) details.push(it.signatureEffect)
      openInspect({
        title: `【${it.name}】`,
        subtitle: `${EQUIP_SLOT_META[it.slot].label}${it.isTrueUnique ? ' · 全服唯一' : ''}${it.reqStat ? ` · 需要${it.reqStat.label}` : ''}`,
        tier: it.tier,
        desc: it.desc,
        extra: details.join(' · '),
      })
    }
  }

  function applySnapshot(snapshot: PlayerSnapshot) {
    const previous = onlineState.value
    const previousPair = activeCoCultivation.value
    player.value = snapshot.player
    learnedSkills.value = snapshot.learnedSkills
    ownedItemIds.value = snapshot.ownedItemIds
    pillCount.value = snapshot.pillCount
    companionAffinity.value = restoreCompanionStates(snapshot.companionAffinity, true)
    for (const preset of snapshot.loadouts) presets.value[preset.presetIdx] = preset
    const receivedAt = Date.now()
    onlineClock.value = receivedAt
    onlineState.value = { snapshot, receivedAt }
    const invitation = coCultivationInvite.value
    if (invitation && invitation.invitee.id === player.value.id && invitation.id !== previous?.snapshot.coCultivationInvite?.id) {
      showToast(`「${invitation.inviter.nickname}」邀你共修，右侧江湖栏可以回应`, 'gold')
    }
    const pair = activeCoCultivation.value
    if (previous && pair && pair.id !== previousPair?.id) showToast(`已与「${pair.partner.nickname}」开始共修`, 'gold')
    else if (previousPair && !pair) showToast('共修已结束', 'info')
  }

  function handleRoomEvent(event: WsServerEvent) {
    if (event.event === 'ROOM_SYNC') {
      if (roomMapId.value !== event.data.mapId) worldMessages.value = []
      roomMapId.value = event.data.mapId
      roomCount.value = event.data.onlineCount
      nearbyPlayers.value = event.data.players.filter((entry) => entry.id !== player.value.id)
    } else if (event.event === 'ROOM_CHAT' && event.data.mapId === roomMapId.value) {
      const { id, content, sender, sentAt } = event.data
      worldMessages.value.unshift({
        id, channel: 'WORLD', sender: sender.nickname, sect: '同图', content,
        time: new Date(sentAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      })
      if (worldMessages.value.length > 60) worldMessages.value.pop()
    } else if (event.event === 'CHAT_REJECTED') {
      showToast(event.data.message, 'danger')
    } else if (event.event === 'TEAM_ROOM_SYNC') {
      const previous = raidLobby.value
      raidLobby.value = event.data
      const { team, invitation } = event.data
      if (invitation && invitation.id !== previous.invitation?.id) showToast(`「${invitation.leaderNickname}」邀你组队，右侧江湖栏可以回应`, 'gold')
      if (team && team.id !== previous.team?.id) openRaidLobby()
    } else if (event.event === 'RAID_REPORT') {
      playRaidReport(event.data)
    }
  }

  function clearRoom() {
    nearbyPlayers.value = []
    roomCount.value = 0
  }

  const online = useOnlineGame({
    snapshot: applySnapshot,
    event: handleRoomEvent,
    disconnected: clearRoom,
    reset: () => {
      clearRoom()
      roomMapId.value = null
      worldMessages.value = []
      logs.value = []
      toasts.value = []
      onlineState.value = null
      inspectModal.value = null
      confirmDialog.value = null
      mobileDrawer.value = 'NONE'
      activeTab.value = 'CULTIVATE'
      jianghuTab.value = 'STORY'
      raidLobby.value = { team: null, invitation: null }
      raidLobbyBusy.value = false
      lastRaidBattleId = null
      closeBattleStage()
    },
    error: (message) => showToast(message, 'danger'),
  })

  // 角色列表保留本次会话中各角色的进度，浏览器存档继续保存最近游玩的角色。
  type LocalCharacter = { player: PlayerDTO; progress?: SaveData }
  const localCharacters = ref<LocalCharacter[]>(IS_MOCK_MODE ? [{ player: starter.player }] : [])
  const characterList = computed(() => localCharacters.value.map((save) => {
    const role = save.player.id === player.value.id ? player.value : save.player
    return { id: role.id, nickname: role.nickname, avatarId: role.avatarId, level: role.level, currentSectId: role.currentSectId }
  }))

  function selectLocalCharacter(id: string) {
    if (!IS_MOCK_MODE || id === player.value.id) return
    const selected = localCharacters.value.find((role) => role.player.id === id)
    if (!selected) return
    const current = localCharacters.value.find((role) => role.player.id === player.value.id)
    if (current) {
      saveNow()
      current.progress = cloneSave(snapshot())
      current.player = current.progress.player
    }

    closeBattleStage()
    const progress = selected.progress ? cloneSave(selected.progress) : demoFor(selected.player, selected.player.lastSettleAt)
    applySave(progress)
    gameMode.value = progress.gameMode
    activeTab.value = 'CULTIVATE'
    jianghuTab.value = 'TRIAL'
    mobileDrawer.value = 'NONE'
    inspectModal.value = null
    confirmDialog.value = null
    gachaReveal.value = null
    toasts.value = []
  }

  function createLocalCharacter(name: string, avatarId: PlayerAvatarId = 'hero_sword') {
    if (!IS_MOCK_MODE || localCharacters.value.length >= 4) return
    const nickname = name.trim().normalize('NFKC')
    if (!/^[\p{L}\p{N}·_\-]{2,16}$/u.test(nickname)) throw new Error('侠客名须为 2–16 位汉字、字母或数字，可用 · _ -')
    if (characterList.value.some((role) => role.nickname === nickname)) throw new Error('这个名字已在江湖中，请换一个')
    const id = crypto.randomUUID()
    localCharacters.value.push({ player: createStarterCharacter({ id, nickname, avatarId }, Date.now()).player })
    return id
  }

  function deleteLocalCharacter(id: string) {
    if (!IS_MOCK_MODE) return
    localCharacters.value = localCharacters.value.filter((save) => save.player.id !== id)
    if (savedGame.value?.playerId === id) deleteSave()
    if (player.value.id === id) {
      gameMode.value = null
      if (localCharacters.value[0]) selectLocalCharacter(localCharacters.value[0].player.id)
    }
  }

  function getIdleRewards(now = Date.now()) {
    const live = onlineState.value
    if (live) {
      const { snapshot, receivedAt } = live
      const amountAt = (time: number) => idleQiNumerator(snapshot.player.lastSettleAt, time, snapshot.soloQiPerHour, snapshot.coCultivation)
      const atSnapshot = amountAt(snapshot.serverTime)
      const current = amountAt(snapshot.serverTime + Math.max(0, now - receivedAt))
      return {
        gainedQi: snapshot.idlePreview.pendingQi + Number(current / 3_600_000n - atSnapshot / 3_600_000n),
        gainedSilver: snapshot.idlePreview.pendingSilver + Number(current * 28n / 360_000_000n - atSnapshot * 28n / 360_000_000n),
      }
    }
    const elapsedSec = Math.max(60, Math.floor((now - player.value.lastSettleAt) / 1000))
    const cappedHours = Math.min(12, elapsedSec / 3600)
    const gainedQi = Math.max(480, Math.round(effectiveQiPerHour.value * cappedHours))
    const gainedSilver = Math.max(150, Math.round(gainedQi * 0.28))
    return { gainedQi, gainedSilver }
  }

  // 1. 惰性离线挂机收益结算（对应后端 POST /api/v1/cultivate/settle）
  function settleOfflineQi() {
    if (!IS_MOCK_MODE) return online.action<IdleGain>('POST', '/cultivate/settle', undefined, (result) => {
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
      else showToast('还没攒够可领的收益')
    })
    const now = Date.now()
    const elapsedSec = Math.max(0, Math.floor((now - player.value.lastSettleAt) / 1000))
    const { gainedQi, gainedSilver } = getIdleRewards(now)
    player.value.qiExp += gainedQi
    player.value.silver += gainedSilver
    player.value.lastSettleAt = now
    onOfflineSettled(elapsedSec)

    // 巡历挂机顺路采获当前地图药材
    const mapHerbs = getMapHerbs(player.value.currentMapId)
    const gainedHerbList: string[] = []
    if (mapHerbs.length > 0) {
      const dropCount = Math.floor(Math.random() * 2) + 1
      for (let i = 0; i < dropCount; i++) {
        const h = mapHerbs[Math.floor(Math.random() * mapHerbs.length)]
        herbInventory.value[h.id] = (herbInventory.value[h.id] ?? 0) + 1
        gainedHerbList.push(h.name)
      }
    }
    showIdleGain({ gainedQi, gainedSilver }, gainedHerbList)
  }

  function showIdleGain({ gainedQi, gainedSilver }: IdleGain, herbs: string[] = []) {
    const herbNote = herbs.length ? `，巡历采获【${herbs.join('、')}】` : ''
    appendLog('CULTIVATE', [
      { type: 'tag', text: '修行收益', tone: 'jade' },
      { type: 'text', text: ` 领到 ${gainedQi.toLocaleString()} 真气和 ${gainedSilver.toLocaleString()} 两纹银${herbNote}。` },
    ])
    showToast(`已领 ${gainedQi.toLocaleString()} 真气、${gainedSilver.toLocaleString()} 纹银${herbs.length ? '及草药' : ''}`, 'gold')
  }

  // 升级与冲穴突破
  function upgradeLevel() {
    const realm = currentRealm.value
    if (player.value.level >= realm.maxLevel) {
      showToast(`已到「${realm.name}」的等级上限，先突破境界再升级。`, 'gold')
      return
    }
    if (player.value.qiExp < player.value.nextLevelQi) {
      showToast('真气不够。领修行收益或闯关，都能攒真气。', 'danger')
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
      { type: 'tag', text: '角色升级', tone: 'gold' },
      { type: 'text', text: ` 升到了 ${player.value.level} 级。` },
    ])
  }

  // 贯通经脉穴位（支持真气冲穴与使用聚气通脉丹冲穴）
  function pierceAcupoint(acupointId: string, pillId?: string) {
    if (openedAcupointIds.value.includes(acupointId)) {
      showToast('此穴道早已贯通。', 'info')
      return
    }
    const pt = ACUPOINTS.find((a) => a.id === acupointId)
    if (!pt) return

    if (pt.realmTier > player.value.realmTier) {
      showToast(`需先踏入第 ${pt.realmTier} 境界方可冲击此穴。` , 'danger')
      return
    }

    const sameMeridian = ACUPOINTS.filter((a) => a.meridianId === pt.meridianId).sort((a, b) => a.order - b.order)
    const prevPoints = sameMeridian.filter((a) => a.order < pt.order)
    const unpiercedPrev = prevPoints.find((a) => !openedAcupointIds.value.includes(a.id))
    if (unpiercedPrev) {
      showToast(`须按经络循行，先冲通前置【${unpiercedPrev.name}】！`, 'danger')
      return
    }

    let usedPillName = ''
    if (pillId === 'tongmai_dan') {
      if ((pillInventory.value.tongmai_dan ?? 0) <= 0) {
        showToast('聚气通脉丹已用完。', 'danger')
        return
      }
      pillInventory.value.tongmai_dan -= 1
      usedPillName = '【玄门·聚气通脉丹】'
    } else {
      const intDiscount = player.value.stats.intStat / (player.value.stats.intStat + 250)
      const cost = Math.max(100, Math.round(pt.costQi * (1 - intDiscount * 0.28)))
      if (player.value.qiExp < cost) {
        showToast(`冲通「${pt.name}」尚需 ${cost.toLocaleString()} 真气（可用聚气通脉丹免真气冲穴）。`, 'danger')
        return
      }
      player.value.qiExp -= cost
    }

    openedAcupointIds.value.push(acupointId)

    if (pt.statBonus.key === 'str') player.value.stats.str += pt.statBonus.value
    else if (pt.statBonus.key === 'con') player.value.stats.con += pt.statBonus.value
    else if (pt.statBonus.key === 'agi') player.value.stats.agi += pt.statBonus.value
    else if (pt.statBonus.key === 'intStat') player.value.stats.intStat += pt.statBonus.value

    appendLog('CULTIVATE', [
      { type: 'tag', text: '冲穴贯通', tone: 'jade' },
      { type: 'text', text: ` ${usedPillName ? '服下 ' + usedPillName + ' ' : ''}运转内息，成功冲通「${pt.name}」！${pt.narrative}，${pt.statBonus.label} +${pt.statBonus.value}。` },
    ])
    showToast(`冲穴成功！「${pt.name}」贯通，${pt.statBonus.label} +${pt.statBonus.value}`, 'gold')
  }

  // 使用冲穴专属灵丹
  function useAcupointPill(pillId: string) {
    const count = pillInventory.value[pillId] ?? 0
    if (count <= 0) {
      showToast('该冲穴灵丹已用尽。', 'danger')
      return
    }
    const med = MEDICINES[pillId]
    if (!med) return

    if (pillId === 'tongmai_dan') {
      const candidate = ACUPOINTS.find((a) => a.realmTier <= player.value.realmTier && !openedAcupointIds.value.includes(a.id))
      if (candidate) {
        pierceAcupoint(candidate.id, 'tongmai_dan')
      } else {
        showToast('当前境界经脉穴位已全线畅通，无需再用通脉丹。', 'info')
      }
    } else if (pillId === 'shaolin_xiaohuan_dan') {
      pillInventory.value.shaolin_xiaohuan_dan -= 1
      player.value.stats.con += 6
      const unpierced = ACUPOINTS.filter((a) => a.realmTier <= player.value.realmTier && !openedAcupointIds.value.includes(a.id)).slice(0, 3)
      for (const pt of unpierced) {
        openedAcupointIds.value.push(pt.id)
        if (pt.statBonus.key === 'str') player.value.stats.str += pt.statBonus.value
        else if (pt.statBonus.key === 'con') player.value.stats.con += pt.statBonus.value
        else if (pt.statBonus.key === 'agi') player.value.stats.agi += pt.statBonus.value
        else if (pt.statBonus.key === 'intStat') player.value.stats.intStat += pt.statBonus.value
      }
      appendLog('CULTIVATE', [
        { type: 'tag', text: '佛门圣药', tone: 'gold' },
        { type: 'text', text: ` 服下【少林·大乘小还丹】！百穴齐鸣，连续贯通 ${unpierced.map((p) => '「' + p.name + '」').join('、') || '全部穴位'}，根骨永久 +6！` },
      ])
      showToast(`服用小还丹成功！贯通 ${unpierced.length} 个穴道，根骨 +6！`, 'gold')
    } else if (pillId === 'jiuzhuan_tongqiao_dan') {
      pillInventory.value.jiuzhuan_tongqiao_dan -= 1
      player.value.stats.str += 12
      player.value.stats.con += 12
      player.value.stats.agi += 12
      player.value.stats.intStat += 12
      const unpierced = ACUPOINTS.filter((a) => a.realmTier <= player.value.realmTier && !openedAcupointIds.value.includes(a.id))
      for (const pt of unpierced) {
        openedAcupointIds.value.push(pt.id)
      }
      appendLog('CULTIVATE', [
        { type: 'tag', text: '九转通仙', tone: 'gold' },
        { type: 'text', text: ' 吞服【神品·九转通窍仙丹】！天地霞光流转奇经八脉，整条经脉全部豁然贯通，全属性永久 +12！' },
      ])
      showToast('神品仙丹药力爆发！整脉穴道全部贯通，全属性 +12！', 'gold')
    } else if (pillId === 'pozhang_dan') {
      showToast('【纯阳·通脉破障丹】将在冲击大境界突破时自动生效（成功率 +35%）。', 'info')
    } else if (pillId === 'bingpo_huxin_dan') {
      showToast('【天山·冰魄护心丹】已在心脉备妥，若突破受阻将自动触发辟除心魔与真气返还。', 'info')
    }
  }

  function attemptBreakthrough(usePill: boolean) {
    const nextRealm = REALMS.find((r) => r.tier === player.value.realmTier + 1)
    if (!nextRealm) {
      showToast('你已达到最高境界「天人合一」。', 'gold')
      return
    }

    // 突破前硬检验：必须已贯通当前经脉所有穴道
    const currentRealmPoints = ACUPOINTS.filter((ap) => ap.realmTier === player.value.realmTier)
    const unpierced = currentRealmPoints.filter((ap) => !openedAcupointIds.value.includes(ap.id))
    if (unpierced.length > 0) {
      showToast(`当前经脉尚有【${unpierced[0].name}】等 ${unpierced.length} 个穴位未通，须先贯通诸穴方可冲关！`, 'danger')
      return
    }

    let pillBonus = 0
    let usedPozhang = false
    if (usePill) {
      if ((pillInventory.value.pozhang_dan ?? 0) <= 0) {
        showToast('纯阳通脉破障丹用完了，可通过历练首领、鬼市鉴宝或门派兑换获取。', 'danger')
        return
      }
      pillInventory.value.pozhang_dan -= 1
      pillBonus = 35 // 纯阳破障丹提供 +35% 成功率
      usedPozhang = true
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
        { type: 'tag', text: '突破成功', tone: 'gold' },
        { type: 'text', text: ` ${usedPozhang ? '服下【纯阳·通脉破障丹】浩荡纯阳内息冲开玄关，' : ''}真气贯通「${nextRealm.meridian}」，踏入「${nextRealm.name}」大境界！` },
      ])
      showToast(`突破成功，已踏入「${nextRealm.name}」！`, 'gold')
    } else {
      const hasHuxin = (pillInventory.value.bingpo_huxin_dan ?? 0) > 0
      if (hasHuxin) {
        pillInventory.value.bingpo_huxin_dan -= 1
        player.value.breakPityRate += 25
        appendLog('CULTIVATE', [
          { type: 'tag', text: '护心辟魔', tone: 'jade' },
          { type: 'text', text: ' 虽冲击未果，但含服的【天山·冰魄护心丹】化解了狂暴逆流，神识完好无损，下次突破保底成功率额外 +25%！' },
        ])
        showToast('突破受阻，但【冰魄护心丹】护住心脉，下次成功率 +25%！', 'info')
      } else {
        player.value.breakPityRate += 15
        appendLog('CULTIVATE', [
          { type: 'tag', text: '突破失败', tone: 'red' },
          { type: 'text', text: ' 这次差了一点火候，真气微乱，下次突破成功率 +15%。' },
        ])
        showToast('这次没能突破，下次成功率 +15%。', 'danger')
      }
    }
  }

  // ==================== 武学 / 装备入手（新游戏下空槽自动装配，免去新手手动穿戴） ====================
  function learnSkill(id: string) {
    const sk = SKILLS[id]
    if (!sk) return
    learnedSkills.value[id] = Math.max(1, learnedSkills.value[id] ?? 0)
    if (!limitsEnabled.value) return
    const key = ({ INNER: 'innerSkillId', OUTER: 'outerSkillId', LIGHT: 'lightSkillId', ULT: 'ultSkillId' } as const)[sk.slot]
    for (const p of Object.values(presets.value)) if (!p[key]) p[key] = id
  }
  function gainItem(id: string) {
    const it = ITEMS[id]
    if (!it) return
    if (!ownedItemIds.value.includes(id)) ownedItemIds.value.push(id)
    if (!limitsEnabled.value) return
    if (it.reqStat && player.value.stats[it.reqStat.key] < it.reqStat.val) return
    const key = EQUIP_SLOT_META[it.slot].field
    for (const p of Object.values(presets.value)) if (!p[key]) p[key] = id
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
      learnSkill(id)
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
        gainItem(id)
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
      st.recruited = st.recruited || recruitable(id, st.affinity)
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
  function startBattlePlayback(report: BattleReportDTO, storyNodeId: number | null = null, onWin: (() => void) | null = null) {
    if (battleTimer) clearTimeout(battleTimer)
    mobileDrawer.value = 'NONE'
    activeBattle.value = report
    activeChapterId.value = storyNodeId
    battleOnWin = onWin
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
        sub: `${actorUnit?.name ?? '侠客'} · ${ev.isUlt ? '使出绝技' : ev.type === 'ASSIST_ATTACK' ? '伙伴追击' : '出招'}`,
        isUlt: !!ev.isUlt,
        isAlly: ev.actorSlot.startsWith('ALLY'),
        key: frameKey,
      }
    } else if (ev.type === 'STANCE_CLASH') {
      const { allyStance, enemyStance, advantage } = activeBattle.value.stanceBanner
      slashBanner.value = {
        text: '战斗打法',
        sub: `${STANCE_META[allyStance].name} 对 ${STANCE_META[enemyStance].name}`,
        isUlt: false,
        isAlly: advantage !== 'ENEMY',
        key: frameKey,
      }
    } else if (ev.type === 'BOSS_ENRAGE') {
      slashBanner.value = {
        text: '首领狂暴',
        sub: `${actorUnit?.name ?? '首领'} · 气血逆乱 杀气焚天！`,
        isUlt: true,
        isAlly: false,
        key: frameKey,
      }
    } else {
      slashBanner.value = null
    }

    // 驱动攻击方冲刺与受击方抖动扣血 + 伤害飘字
    const actor = liveUnitStates.value[ev.actorSlot]
    if (actor && ev.type !== 'STANCE_CLASH' && ev.type !== 'BOSS_ENRAGE') {
      actor.anim = ev.actorSlot.startsWith('ALLY') ? 'LUNGE_ALLY' : 'LUNGE_ENEMY'
      if (ev.rageDelta) {
        actor.rage = Math.max(0, Math.min(100, actor.rage + ev.rageDelta))
      }
    }
    if (ev.targetSlot && liveUnitStates.value[ev.targetSlot]) {
      if (ev.hitResult === 'DODGE') {
        nextPopups[ev.targetSlot] = { text: '闪避', isCrit: false, category: 'dodge', key: frameKey }
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
        text: `反伤 ${ev.reflectDelta.toLocaleString()}`,
        isCrit: false,
        category: 'reflect',
        key: frameKey + 1,
      }
    }
    floatingPopups.value = nextPopups

    appendLog('BATTLE', [{ type: 'tag', text: `第 ${ev.round} 回合`, tone: 'red' }, { type: 'text', text: ' ' }, ...ev.segments])

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
      appendLog('BATTLE', [{ type: 'tag', text: `第 ${ev.round} 回合`, tone: 'red' }, { type: 'text', text: ' ' }, ...ev.segments])
    }
    finishBattleSettlement()
  }

  function finishBattleSettlement() {
    if (!activeBattle.value || !isBattlePlaying.value) return
    isBattlePlaying.value = false
    slashBanner.value = null
    floatingPopups.value = {}
    const report = activeBattle.value
    if (report.winner === 'ALLY' && report.rewards) {
      if (IS_MOCK_MODE) {
        player.value.qiExp += report.rewards.qiExp
        player.value.silver += report.rewards.silver
        if (report.rewards.sectContrib) player.value.sectContribution += report.rewards.sectContrib
      }

      const itemSegs: RichSegment[] = []
      if (report.rewards.items) {
        for (const drop of report.rewards.items) {
          if (SKILLS[drop.id]) {
            if (IS_MOCK_MODE) learnSkill(drop.id)
            itemSegs.push({ type: 'skill', id: drop.id, name: `《${drop.name}》`, tier: drop.tier })
          } else if (ITEMS[drop.id]) {
            if (IS_MOCK_MODE) gainItem(drop.id)
            itemSegs.push({ type: 'item', id: drop.id, name: `【${drop.name}】`, tier: drop.tier })
          }
        }
      }

      appendLog('BATTLE', [
        { type: 'tag', text: '获胜', tone: 'gold' },
        { type: 'text', text: ` 「${report.sceneTitle}」告捷，领到 ${report.rewards.qiExp.toLocaleString()} 真气和 ${report.rewards.silver.toLocaleString()} 两纹银。 ` },
        ...itemSegs,
      ])
      showToast(IS_MOCK_MODE
        ? `打赢了！真气 +${report.rewards.qiExp.toLocaleString()}`
        : report.mode === 'COOP_3P' ? '副本奖励已到账' : '首胜奖励已到账', 'gold')
    } else if (!IS_MOCK_MODE && report.winner === 'ALLY') {
      showToast('打赢了，这关奖励已领过', 'gold')
    }
    if (IS_MOCK_MODE && report.winner === 'ALLY') {
      const nodeId = activeChapterId.value
      if (nodeId !== null) {
        if (nodeId >= player.value.maxChapterId) player.value.maxChapterId = nodeId + 1
        claimNodeFirstClear(nodeId)
        onStoryNodeWon(nodeId)
      }
      const hook = battleOnWin
      battleOnWin = null
      hook?.()
    } else if (report.winner === 'ENEMY') {
      battleOnWin = null
      appendLog('BATTLE', [
        { type: 'tag', text: '惜败', tone: 'red' },
        { type: 'text', text: ` 「${report.sceneTitle}」没打过。去武库换个打法或装备，再来一战。` },
      ])
      showToast('这次没打过，试试换个打法再战。', 'danger')
    }
  }

  function closeBattleStage() {
    if (battleTimer) clearTimeout(battleTimer)
    activeBattle.value = null
    activeChapterId.value = null
    battleOnWin = null
    isBattlePlaying.value = false
    slashBanner.value = null
    floatingPopups.value = {}
  }

  function selectTab(tab: MainTab) {
    activeTab.value = tab
    mobileDrawer.value = 'NONE'
    if (activeBattle.value && !isBattlePlaying.value) closeBattleStage()
  }

  // ==================== 江湖地图、章节推进与多人交互 ====================
  function moveMap(mapId: string) {
    const m = MAPS.find((x) => x.id === mapId)
    if (!m || mapId === player.value.currentMapId) return
    if (!IS_MOCK_MODE) {
      if (m.reqCleared !== undefined) return
      return online.action<IdleGain>('POST', '/map/move', { mapId }, (result) => {
        if (result.gainedQi || result.gainedSilver) showIdleGain(result)
        announceMap(mapId)
      })
    }
    if (!isMapUnlocked(m, player.value.maxChapterId)) {
      showToast(`【${m.name}】尚未开放：${m.unlockHint ?? '请先推进主线'}`, 'danger')
      return
    }
    settleOfflineQi()
    accrueReunionWait()
    player.value.currentMapId = mapId
    mapArrivedAt.value = Date.now()
    player.value.coCultivatePartner = null
    nearbyPlayers.value = generateRoomPlayers(mapId)
    announceMap(mapId)
  }

  function announceMap(mapId: string) {
    const m = MAPS.find((x) => x.id === mapId)!
    appendLog('JIANGHU', [
      { type: 'tag', text: m.safety === 'PEACE' ? '和平区' : '可劫镖', tone: m.safety === 'PEACE' ? 'jade' : 'red' },
      { type: 'text', text: ` 你来到了「${m.name}」。${m.ambientDesc}` },
    ])
    showToast(`已踏入【${m.name}】`, m.safety === 'CONTESTED' ? 'danger' : 'info')
  }

  function challengeChapter(chapterId: number) {
    if (!IS_MOCK_MODE) {
      if (isBattlePlaying.value) return
      return online.action<StoryChallengeResult>('POST', `/story/${chapterId}/challenge`, undefined, ({ report }) => startBattlePlayback(report))
    }
    if (isBattlePlaying.value) return
    const ch = STORY_CHAPTERS.find((c) => c.id === chapterId)
    if (!ch) return
    if (chapterId > player.value.maxChapterId) {
      showToast('先打过上一关，就能挑战这里。', 'danger')
      return
    }
    const drops = getChapterDrops(ch)
      .filter((drop) => drop.kind === 'item' ? !ownedItemIds.value.includes(drop.id) : !learnedSkills.value[drop.id])
      .map(({ id, name, tier }) => ({ id, name, tier }))

    appendLog('JIANGHU', [
      { type: 'tag', text: ch.code, tone: ch.isBoss ? 'red' : 'gold' },
      { type: 'text', text: ` ${ch.intro}` },
    ])

    const report = simulateServerBattle({
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

  const trial = computed(() => player.value.trial)

  const ftueQuest = computed(() => FTUE_QUESTS[ftue.value.index] ?? null)

  function ftueProgressOf(quest: FtueQuestConfig): number {
    switch (quest.targetType) {
      case 'STORY':
        return player.value.trial.rewardedStageIds.includes(Number(quest.targetValue)) ? 1 : 0
      case 'PIERCE':
        return openedAcupointIds.value.includes(String(quest.targetValue)) ? 1 : 0
      case 'PIERCE_ALL':
        return HAND_THREE_YANG.every((id) => openedAcupointIds.value.includes(id)) ? 1 : 0
      case 'COMPANION': {
        const state = companionAffinity.value[String(quest.targetValue)]
        return state?.recruited && state.affinity >= 100 ? 1 : 0
      }
      case 'FORAGE':
        return ftue.value.forageCount >= 1 ? 1 : 0
      case 'REFINE':
        return ftue.value.refinedRecipeIds.includes(String(quest.targetValue)) ? 1 : 0
      case 'BREAKTHROUGH':
        return player.value.realmTier >= Number(quest.targetValue) ? 1 : 0
      case 'SECT':
        return player.value.currentSectId ? 1 : 0
    }
  }

  const ftueReady = computed(() => {
    const quest = ftueQuest.value
    return !!quest && ftueProgressOf(quest) >= 1
  })

  function claimFtueReward() {
    const quest = ftueQuest.value
    if (!quest || ftueProgressOf(quest) < 1) return
    player.value.qiExp += quest.rewardQi
    player.value.silver += quest.rewardSilver
    if (quest.rewardPillId) {
      pillInventory.value[quest.rewardPillId] = (pillInventory.value[quest.rewardPillId] ?? 0) + 1
    }
    ftue.value.claimed.push(quest.id)
    ftue.value.index = Math.min(FTUE_QUESTS.length, ftue.value.index + 1)
    saveFtue()
    appendLog('JIANGHU', [
      { type: 'tag', text: '江湖行历', tone: 'gold' },
      { type: 'text', text: ` 达成「${quest.title}」，领得真气 ${quest.rewardQi.toLocaleString()}、纹银 ${quest.rewardSilver.toLocaleString()}${quest.rewardPillId ? '，并获赠一枚丹药' : ''}。` },
    ])
    showToast(`行历达成：${quest.title}`, 'gold')
  }

  function gotoFtueTarget() {
    const quest = ftueQuest.value
    if (!quest) return
    selectTab(quest.jumpTab)
    if (quest.jumpTab === 'JIANGHU' && quest.jumpSub) {
      jianghuTab.value = quest.jumpSub as typeof jianghuTab.value
    }
    if (quest.jumpTab === 'MARKET' && quest.jumpSub) {
      marketTab.value = quest.jumpSub as typeof marketTab.value
    }
  }

  function trialPatrolStatus(stageId = player.value.trial.selectedStageId): TrialPatrolStatusDTO {
    const hours = player.value.trial.stageHours[String(stageId)] ?? 0
    return {
      stageId,
      hours,
      requiredHours: TRIAL_PATROL_HOURS[stageId] ?? 0,
      encounters: Math.floor(hours * (60 / PATROL_ENCOUNTER_MINUTES)),
    }
  }

  /** 本地试玩版惰性巡历：进度、章末复战与 30 分钟一次的小怪掉落 */
  function mockSettlePatrol() {
    if (!IS_MOCK_MODE) return
    const t = player.value.trial
    const now = Date.now()
    const since = Math.max(t.lastPatrolAt, now - 12 * 3_600_000)
    const elapsed = now - since
    if (elapsed <= 0) return

    const key = String(t.selectedStageId)
    t.stageHours[key] = (t.stageHours[key] ?? 0) + elapsed / 3_600_000
    if (TRIAL_STAGES.find((stage) => stage.id === t.selectedStageId)?.replayPartIds) {
      t.replayHours[key] = Math.min(TRIAL_REPLAY_HOURS, (t.replayHours[key] ?? 0) + elapsed / 3_600_000)
    }
    t.lastPatrolAt = now

    const encounters = Math.floor(elapsed / (PATROL_ENCOUNTER_MINUTES * 60_000))
    const stage = trialStageOf(t.selectedStageId)
    const set = stage ? trialSetOf(stage.setId) : undefined
    if (encounters <= 0 || !set) return
    for (let i = 0; i < encounters; i++) {
      if (Math.random() >= PATROL_DROP_CHANCE) continue
      const part = set.parts[Math.floor(Math.random() * set.parts.length)]
      const id = trialPartId(set.id, part.slot)
      if (ownedItemIds.value.includes(id)) {
        t.marks[key] = (t.marks[key] ?? 0) + 1
        continue
      }
      ownedItemIds.value.push(id)
      t.recentDrops.unshift({ id, name: part.name, tier: set.tier, at: now })
    }
    t.recentDrops = t.recentDrops.slice(0, 10)
  }

  function setPatrolStage(stageId: number) {
    if (!IS_MOCK_MODE) {
      return online.action<TrialPatrolStatusDTO>('POST', '/trial/patrol', { stageId }, (status) => {
        showToast(`已改在「第 ${String(status.stageId).padStart(2, '0')} 关」巡历`, 'info')
      })
    }
    mockSettlePatrol()
    const stage = trialStageOf(stageId)
    if (!stage || stageId > player.value.trial.maxStageId) return
    player.value.trial.selectedStageId = stageId
    showToast(`已改在「第 ${stage.code} 关」巡历`, 'info')
  }

  function challengeTrialStage(stageId: number) {
    if (!IS_MOCK_MODE) {
      if (isBattlePlaying.value) return
      return online.action<TrialChallengeResult>('POST', `/trial/${stageId}/challenge`, undefined, ({ report, firstClear, drops }) => {
        if (firstClear) showToast(`首胜奖励：${drops.length ? drops.map((drop) => drop.name).join('、') : '真气与纹银'}`, 'gold')
        startBattlePlayback(report)
      })
    }
    mockSettlePatrol()
    const stage = trialStageOf(stageId)
    if (!stage) return
    const t = player.value.trial
    if (stageId > t.maxStageId) {
      showToast('先打过上一关，才能挑战这里。', 'danger')
      return
    }
    const required = TRIAL_PATROL_HOURS[stageId] ?? 0
    const hours = t.stageHours[String(stageId)] ?? 0
    if (hours < required) {
      const rest = required - hours
      showToast(`本关巡历还差 ${rest < 1 ? `${Math.max(1, Math.ceil(rest * 60))} 分钟` : `${rest.toFixed(1)} 小时`}。`, 'danger')
      return
    }

    const firstClear = !t.rewardedStageIds.includes(stageId)
    const drops = firstClear
      ? stage.firstClearParts
        .map((slot) => trialItemOf(trialPartId(stage.setId, slot)))
        .filter((item): item is NonNullable<ReturnType<typeof trialItemOf>> => !!item && !ownedItemIds.value.includes(item.id))
      : []
    const rewardQi = Math.round(stage.boss.hp * 2)
    const rewardSilver = Math.round(stage.boss.hp * 0.8)
    const report = simulateServerBattle({
      sceneTitle: `${stage.code} ${stage.title}`,
      mode: 'SOLO_STORY',
      player: player.value,
      loadout: currentLoadout.value,
      enemyMain: {
        name: stage.boss.name,
        title: stage.boss.title,
        portrait: stage.boss.portrait,
        hp: stage.boss.hp,
        atk: stage.boss.atk,
        mp: Math.round(stage.boss.hp * 0.45),
        stance: stage.boss.stance,
      },
      surviveRounds: stage.victory === 'SURVIVE_ROUNDS' ? stage.surviveRounds : undefined,
      rewards: firstClear
        ? { qiExp: rewardQi, silver: rewardSilver, items: drops.map(({ id, name, tier }) => ({ id, name, tier })) }
        : undefined,
    })
    if (report.winner === 'ALLY' && firstClear) {
      player.value.qiExp += rewardQi
      player.value.silver += rewardSilver
      for (const drop of drops) ownedItemIds.value.push(drop.id)
      t.rewardedStageIds.push(stageId)
      t.stageHours[String(stageId)] = 0
      const next = Math.min(TRIAL_STAGES.length, stageId + 1)
      t.maxStageId = Math.max(t.maxStageId, next)
      t.selectedStageId = next
    }
    startBattlePlayback(report)
  }

  function replayTrialBoss(stageId: number) {
    if (!IS_MOCK_MODE) {
      if (isBattlePlaying.value) return
      return online.action<TrialReplayResult>('POST', `/trial/${stageId}/replay`, undefined, ({ report, drop }) => {
        if (drop) showToast(`首领复战：${drop.name}`, 'gold')
        startBattlePlayback(report)
      })
    }
    mockSettlePatrol()
    const stage = trialStageOf(stageId)
    if (!stage?.replayPartIds) return
    const t = player.value.trial
    const key = String(stageId)
    if ((t.replayHours[key] ?? 0) < TRIAL_REPLAY_HOURS) {
      showToast(`在本关巡历满 ${TRIAL_REPLAY_HOURS} 小时才能再战首领。`, 'danger')
      return
    }
    const report = simulateServerBattle({
      sceneTitle: `${stage.code} ${stage.title} · 首领复战`,
      mode: 'SOLO_STORY',
      player: player.value,
      loadout: currentLoadout.value,
      enemyMain: {
        name: stage.boss.name,
        title: stage.boss.title,
        portrait: stage.boss.portrait,
        hp: stage.boss.hp,
        atk: stage.boss.atk,
        mp: Math.round(stage.boss.hp * 0.45),
        stance: stage.boss.stance,
      },
      surviveRounds: stage.victory === 'SURVIVE_ROUNDS' ? stage.surviveRounds : undefined,
    })
    if (report.winner === 'ALLY') {
      const candidates = stage.replayPartIds
        .map((id) => trialItemOf(id))
        .filter((item): item is NonNullable<ReturnType<typeof trialItemOf>> => !!item)
      const drop = candidates.find((item) => !ownedItemIds.value.includes(item.id)) ?? candidates[0]
      if (drop) {
        if (ownedItemIds.value.includes(drop.id)) t.marks[key] = (t.marks[key] ?? 0) + 1
        else ownedItemIds.value.push(drop.id)
        showToast(`首领复战：${drop.name}`, 'gold')
      }
      t.replayHours[key] = 0
    }
    startBattlePlayback(report)
  }

  function redeemTrialPart(stageId: number, slot: EquipSlotType) {
    if (!IS_MOCK_MODE) {
      return online.action<{ itemId: string; name: string }>('POST', `/trial/${stageId}/redeem`, { slot }, ({ name }) => {
        showToast(`兑换：${name}`, 'gold')
      })
    }
    mockSettlePatrol()
    const stage = trialStageOf(stageId)
    if (!stage) return
    const t = player.value.trial
    const key = String(stageId)
    if ((t.marks[key] ?? 0) < 4) {
      showToast('集齐 4 枚巡历印记才能兑换。', 'danger')
      return
    }
    const item = trialItemOf(trialPartId(stage.setId, slot))
    if (!item) return
    if (ownedItemIds.value.includes(item.id)) {
      showToast('这个部位已经拿到了。', 'danger')
      return
    }
    t.marks[key] = (t.marks[key] ?? 0) - 4
    ownedItemIds.value.push(item.id)
    showToast(`兑换：${item.name}`, 'gold')
  }

  function openRaidLobby() {
    jianghuTab.value = 'RAID'
    selectTab('JIANGHU')
  }

  async function raidTeamAction(body: RaidTeamAction) {
    if (IS_MOCK_MODE || !online.roomConnected.value || raidLobbyBusy.value) return
    const actor = player.value.id
    raidLobbyBusy.value = true
    try {
      await apiClient.request('POST', '/raid/team', body)
    } catch (error) {
      if (player.value.id !== actor || online.phase.value !== 'ready') return
      if (error instanceof ApiError && error.status === 401) void online.logout()
      else showToast(error instanceof ApiError ? error.message : '组队连接中断，等重连后再试', 'danger')
    } finally {
      if (player.value.id === actor) raidLobbyBusy.value = false
    }
  }

  function playRaidReport(report: BattleReportDTO) {
    if (lastRaidBattleId === report.battleId) return
    lastRaidBattleId = report.battleId
    openRaidLobby()
    startBattlePlayback(report)
  }

  /** 少室山副本按个人通关次数发放秘宝。 */
  function startThreePlayerCoopRaid() {
    if (!IS_MOCK_MODE) {
      const team = raidLobby.value.team
      if (!team || !online.roomConnected.value || isBattlePlaying.value) return
      return online.action<BattleReportDTO>('POST', '/raid/start', { teamId: team.id, revision: team.revision }, playRaidReport)
    }
    const relic = nextRaidRelic.value
    const report = simulateServerBattle({
      sceneTitle: '松鹤楼结义 · 少室山三渡金刚伏魔圈',
      mode: 'COOP_3P',
      player: player.value,
      loadout: currentLoadout.value,
      coopPlayers: {
        leftPlayer: { name: '乔北冥(玩家)', sect: '丐帮少帮主', hp: 16800, atk: 1350 },
        rightPlayer: { name: '清风道长(玩家)', sect: '全真掌教首座', hp: 14500, atk: 1120 },
      },
      enemyMain: SHAOSHI_RAID.boss,
      enemyGuards: [...SHAOSHI_RAID.guards],
      rewards: {
        qiExp: SHAOSHI_RAID.rewardQi,
        silver: SHAOSHI_RAID.rewardSilver,
        items: relic ? [{ id: relic.id, name: relic.name, tier: relic.tier }] : [],
      },
    })
    startBattlePlayback(report)
  }

  function replyCoCultivation(accept: boolean) {
    const invitation = coCultivationInvite.value
    if (!invitation || invitation.invitee.id !== player.value.id) return
    return online.action<IdleGain>('POST', '/map/co-cultivate', {
      action: accept ? 'accept' : 'decline', invitationId: invitation.id,
    }, (result) => {
      if (!accept) showToast('已婉拒共修邀请')
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
    })
  }

  function endCoCultivation() {
    const pair = activeCoCultivation.value
    if (!pair) return
    return online.action<IdleGain>('POST', '/map/co-cultivate', { action: 'end', coCultivationId: pair.id }, (result) => {
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
    })
  }

  /** 同地图玩家交互：抱拳共修 / 友好切磋 / 限定纷争区劫镖与追杀逆徒 */
  function interactNearbyPlayer(target: RoomPlayerDTO, action: 'CO_CULT' | 'SPAR' | 'AMBUSH') {
    if (action === 'CO_CULT') {
      if (!IS_MOCK_MODE) return online.action<IdleGain>('POST', '/map/co-cultivate', {
        action: 'invite', targetPlayerId: target.id,
      }, () => showToast(`已邀「${target.nickname}」一起修行`, 'gold'))
      player.value.coCultivatePartner = target.nickname
      appendLog('JIANGHU', [
        { type: 'tag', text: '双人共修', tone: 'jade' },
        { type: 'text', text: ' 你向同图少侠' },
        { type: 'actor', name: target.nickname, isAlly: true, isPlayer: true },
        { type: 'text', text: '一起修行，真气收益 +15%。' },
      ])
      showToast(`正在与「${target.nickname}」一起修行，真气收益 +15%`, 'gold')
      return
    }

    if (action === 'AMBUSH') {
      // 强校验：和平区禁止恶意PK（唯独全服叛师红名逆徒可随时缉拿！）
      if (currentMap.value.safety === 'PEACE' && !target.isBetrayerBounty) {
        showToast('和平区不能劫镖。想劫镖可以去大漠商道或湘西黑沼。', 'danger')
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
      showToast('你已经有师门。先出师或离开当前门派，才能拜新师父。', 'danger')
      return
    }
    if (betrayedSectIds.value.includes(sectId)) {
      showToast('你曾叛出这个门派，不能再拜入。', 'danger')
      return
    }
    const sect = SECTS.find((s) => s.id === sectId)
    if (!sect) return
    const check = sect.checkReq(player.value.stats, sectCheckCtx())
    if (!check.ok) {
      showToast(check.reason ?? '还不符合入门条件。', 'danger')
      return
    }

    const hasIntro = !!sect.introFlag && storyFlags.value.includes(sect.introFlag)
    player.value.currentSectId = sect.id
    player.value.sectRank = 1
    player.value.sectContribution = 100 + (hasIntro ? (sect.introBonus ?? 0) : 0)
    const entrySkill = sect.signatureSkills[0]
    if (entrySkill) learnSkill(entrySkill)

    appendLog('JIANGHU', [
      { type: 'tag', text: '奉茶拜师', tone: 'gold' },
      { type: 'text', text: ` 你向师父奉茶，拜入「${sect.name}」，成了「${sect.ranks[0]}」，也学到了本门入门武功。` },
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
      { type: 'text', text: ` 向首席弟子「${currentSect.value.chiefPlayerName}」抱拳问好。真气 +1,800，门派贡献 +60。` },
    ])
    showToast('真气 +1,800，门派贡献 +60', 'gold')
  }

  function challengeSectPromotion() {
    if (!currentSect.value) return
    if (player.value.sectRank >= 5) {
      showToast('你已经升到门派的最高一阶。', 'gold')
      return
    }
    const nextRankName = currentSect.value.ranks[player.value.sectRank]
    const report = simulateServerBattle({
      sceneTitle: `${currentSect.value.name} · 晋升考核`,
      mode: 'SECT_TRIAL',
      player: player.value,
      loadout: currentLoadout.value,
      enemyMain: {
        name: `${currentSect.value.name}传功长老`,
        title: `第 ${player.value.sectRank + 1} 阶考核`,
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
        learnSkill(skillId)
        if (!had) grants.push({ type: 'text', text: '，获传绝学' }, { type: 'skill', id: skillId, name: `《${sk.name}》`, tier: sk.tier })
      }
      const itemId = sect.signatureItems?.[newRank]
      if (itemId && ITEMS[itemId] && !ownedItemIds.value.includes(itemId)) {
        gainItem(itemId)
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
        showToast('门派升到第 4 阶才能出师。', 'danger')
        return
      }
      player.value.currentSectId = null
      player.value.sectRank = 1
      appendLog('JIANGHU', [
        { type: 'tag', text: '圆满出师', tone: 'gold' },
        { type: 'text', text: ` 你拜别「${oldSect.name}」，保留了学过的武功，也可以再拜别的门派。` },
      ])
      showToast(`已从「${oldSect.name}」出师，学过的武功都还在。`, 'gold')
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
      { type: 'text', text: ` 你叛出了「${oldSect.name}」，侠义 −120。江湖追杀令将持续 48 小时。` },
      ...(isQuanzhenToGumu
        ? [{ type: 'tag' as const, text: '叛出全真 · 身法 +5', tone: 'purple' as const }]
        : []),
    ])
    if (isQuanzhenToGumu) player.value.stats.agi += 5
    showToast(`已叛出「${oldSect.name}」，你将被通缉 48 小时。`, 'danger')
  }

  // ==================== 武库装配与秘籍参悟 ====================
  /** 参悟升重所需真气（代入第06册悟性减免公式）；UI 用它显示价格并判断是否买得起 */
  function getSkillUpgradeCost(skillId: string): number {
    const lv = learnedSkills.value[skillId] ?? 0
    const sk = SKILLS[skillId]
    if (!sk || lv <= 0) return 0
    return skillUpgradeCost(sk, lv, player.value.stats.intStat)
  }

  function upgradeSkillMastery(skillId: string) {
    const lv = learnedSkills.value[skillId] ?? 0
    const sk = SKILLS[skillId]
    if (!sk || lv <= 0) return
    const cap = getSkillMasteryCap(sk.tier, player.value.level)
    if (lv >= cap) {
      showToast(`【经脉关隘】《${sk.name}》已达当前境界极境（第 ${cap} 重），需突破大境界方可参悟后几重！`, 'danger')
      return
    }
    if (lv >= MAX_SKILL_MASTERY) return
    if (!IS_MOCK_MODE) return online.action<SkillUpgradeResult>('POST', '/skill/upgrade', { skillId, expectedMastery: lv }, (result) => {
      const power = result.power
      const change = power ? `，招式威力 ×${formatSkillPower(power.before)} → ×${formatSkillPower(power.after)}` : ''
      showToast(`《${sk.name}》升到第 ${result.mastery} 重${change}，臂力 +1。`, 'gold')
    })
    const cost = getSkillUpgradeCost(skillId)
    if (player.value.qiExp < cost) {
      showToast(`还差 ${(cost - player.value.qiExp).toLocaleString()} 真气才能升级这门武功。`, 'danger')
      return
    }
    player.value.qiExp -= cost
    learnedSkills.value[skillId] = lv + 1
    player.value.stats.str += 1
    showToast(`《${sk.name}》升到第 ${lv + 1} 重，臂力 +1。`, 'gold')
  }

  function equipItem(itemId: string) {
    const it = ITEMS[itemId]
    if (!it || !ownedItemIds.value.includes(itemId)) return
    if (it.reqStat && player.value.stats[it.reqStat.key] < it.reqStat.val) {
      showToast(`装备「${it.name}」需要${it.reqStat.label}。`, 'danger')
      return
    }
    return updateLoadout({ [EQUIP_SLOT_META[it.slot].field]: itemId }, `已装备【${it.name}】`)
  }

  function saveOnlineLoadout(preset: LoadoutPresetDTO, activate: boolean, message: string) {
    return online.action<IdleGain>('PUT', `/loadout/${preset.presetIdx}`, {
      preset: { ...preset }, activate, expectedRevision: online.revision.value,
    }, (result) => {
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
      showToast(message, 'gold')
    })
  }

  function updateLoadout(patch: Partial<LoadoutPresetDTO>, message = '配装已保存') {
    if (!IS_MOCK_MODE) return saveOnlineLoadout({ ...currentLoadout.value, ...patch }, false, message)
    Object.assign(currentLoadout.value, patch)
    if (message !== '配装已保存') showToast(message, 'gold')
  }

  function switchLoadout(idx: LoadoutPresetDTO['presetIdx']) {
    if (idx === player.value.activePresetIdx) return
    if (!IS_MOCK_MODE) return saveOnlineLoadout(presets.value[idx], true, '已切换配装')
    player.value.activePresetIdx = idx
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
    // 限制一：每日次数；限制二：好感随主线章节封顶——都在扣银之前判定，被拒不花钱
    const left = giftsLeft(compId)
    if ((isFavorite ? left.gift : left.tea) <= 0) {
      showToast(`今日已向【${c.name}】${isFavorite ? '赠过爱物' : '敬过清茶'}，明日子时再来`, 'danger')
      return
    }
    const cap = affinityCap.value
    if (state.affinity >= cap) {
      showToast(`与【${c.name}】此情已满，待江湖历练更深（通关更多章节可提高上限）`, 'info')
      return
    }
    const cost = isFavorite ? INN_GIFT_COST : INN_TEA_COST
    if (player.value.silver < cost) {
      showToast(`这次需要 ${cost.toLocaleString()} 两纹银。`, 'danger')
      return
    }
    player.value.silver -= cost
    if (limitsEnabled.value) {
      if (innDay.value !== dayKey()) {
        innDay.value = dayKey()
        innGiftsToday.value = {}
      }
      const used = (innGiftsToday.value[compId] ??= { tea: 0, gift: 0 })
      if (isFavorite) used.gift += 1
      else used.tea += 1
    }
    const delta = Math.min(isFavorite ? 80 : 20, cap - state.affinity)
    state.affinity += delta
    state.recruited = state.recruited || recruitable(compId, state.affinity)

    appendLog('JIANGHU', [
      { type: 'tag', text: '醉仙煮酒', tone: 'gold' },
      { type: 'text', text: ` 你${isFavorite ? `把「${c.favGift}」送给` : '请'}` },
      { type: 'actor', name: c.name, isAlly: true },
      { type: 'text', text: `，好感 +${delta}（现在 ${state.affinity}/${cap}）。` },
    ])

    // 满600点【生死之交】触发倾囊传功！
    if (state.affinity >= 600 && !state.taught && SKILLS[c.teachSkillId]) {
      state.taught = true
      learnSkill(c.teachSkillId)
      const taughtSk = SKILLS[c.teachSkillId]
      appendLog('ADVENTURE', [
        { type: 'tag', text: '生死之交·倾囊传功', tone: 'gold' },
        { type: 'actor', name: c.name, isAlly: true },
        { type: 'text', text: '拍案长啸：“人生得一知己足矣！今日便将这看家本领传予你！”你已习得' },
        { type: 'skill', id: taughtSk.id, name: `《${taughtSk.name}》`, tier: taughtSk.tier },
        { type: 'text', text: '！' },
      ])
      showToast(`${c.name}教会了你《${taughtSk.name}》！`, 'gold')
    } else {
      showToast(`${c.name}好感度 +${delta}`, 'info')
    }
  }

  /** 觉醒进阶：好感 ≥600（生死之交）+ 消耗伙伴信物，基础形态 → 觉醒形态（第12册 §四） */
  function awakenCompanion(compId: string) {
    const c = COMPANIONS[compId]
    const st = companionAffinity.value[compId]
    if (!c?.awakened || !st) return
    if (st.form === 'awakened') {
      showToast(`【${c.name}】已是觉醒形态`, 'info')
      return
    }
    if (!st.recruited || st.affinity < 600) {
      showToast(`觉醒需与【${c.name}】结为生死之交（好感 ≥ 600）`, 'danger')
      return
    }
    const need = c.awakenTokens ?? 30
    if (st.tokens < need) {
      showToast(`伙伴信物不足：需 ${need}，现有 ${st.tokens}`, 'danger')
      return
    }
    st.tokens -= need
    st.form = 'awakened'
    appendLog('JIANGHU', [
      { type: 'tag', text: '觉醒进阶', tone: 'gold' },
      { type: 'actor', name: c.name, isAlly: true },
      { type: 'text', text: `以信物为引，功力臻至新境，化作【${c.awakened.title}】！` },
    ])
    showToast(`【${c.name}】觉醒为「${c.awakened.title}」！`, 'gold')
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
      gainItem('xuantie_heavysword')
      appendLog('ADVENTURE', [
        { type: 'tag', text: '慧眼识珠', tone: 'gold' },
        { type: 'text', text: ' 你摩挲泥污铁胎，凭过人悟性认出竟是剑冢流落的' },
        { type: 'item', id: 'xuantie_heavysword', name: '【乌金玄铁重剑】', tier: 'red' },
        { type: 'text', text: '，仅花六百两捡漏入手！' },
      ])
      showToast('在旧物摊找到了「乌金玄铁重剑」！', 'gold')
    } else {
      pillCount.value += 1
      player.value.qiExp += 2200
      appendLog('JIANGHU', [
        { type: 'tag', text: '鬼市淘货', tone: 'purple' },
        { type: 'text', text: ' 你洗去旧瓷瓶泥垢，内藏一枚桃花岛【九花玉露丸】与前人练功心得（真气 +2,200）！' },
      ])
      showToast('找到 1 枚九花玉露丸，真气 +2,200。', 'gold')
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
      showToast('出价领先，已学会《凌波微步》。', 'gold')
      return
    }

    if (SKILLS[listing.itemId]) {
      learnedSkills.value[listing.itemId] = 1
    } else if (ITEMS[listing.itemId] && !ownedItemIds.value.includes(listing.itemId)) {
      gainItem(listing.itemId)
    }
    ghostListings.value = ghostListings.value.filter((x) => x.id !== listing.id)
    showToast(`买到了 ${listing.itemName}`, 'gold')
  }

  function sendChatMessage(content: string, channel: 'WORLD' | 'SECT' = 'WORLD') {
    const trimmed = content.trim()
    if (!trimmed) return false
    if (!IS_MOCK_MODE) {
      if (apiClient.sendChat(trimmed)) return true
      showToast('正在重连，连上后再发', 'info')
      return false
    }
    worldMessages.value.unshift({
      id: `msg_${Date.now()}`,
      channel,
      sender: player.value.nickname,
      sect: currentSect.value?.name ?? '逍遥散人',
      content: trimmed,
      time: '刚刚',
    })
    return true
  }

  // ==================== 客栈「醉仙楼·结缘」抽卡（第12册 §七、§八） ====================
  const gacha = ref({ pulls: 0, pity: 0, history: [] as GachaResultView[] })
  /** 当前待播放的揭晓动画；为 null 时不显示 */
  const gachaReveal = ref<{ key: number; results: GachaResultView[] } | null>(null)
  const GRADE_RANK: Record<CompanionGrade, number> = { 下: 1, 中: 2, 上: 3 }

  /** 结算一抽：新得入手 / 重复转化，并生成展示信息 */
  function applyGachaDraw(d: GachaDrawDTO): GachaResultView {
    const p = player.value
    switch (d.kind) {
      case 'COMPANION': {
        const cfg = COMPANIONS[d.refId!]
        const st = companionAffinity.value[d.refId!]
        if (!st.recruited) {
          st.met = true
          st.recruited = true
          st.affinity = Math.max(st.affinity, 100)
          // 神品档抽到“好感线”大侠：直接以觉醒形态入队（等于跳过免费线）
          if (d.tier === 'red' && cfg.awakened) st.form = 'awakened'
          if (d.grade) st.grade = d.grade
          const formTxt = st.form === 'awakened' ? `觉醒形态「${cfg.awakened!.title}」` : '已入队'
          return { draw: d, name: cfg.name, detail: `新结缘 · ${formTxt}${d.grade ? ` · 橙·${d.grade}` : ''}`, isNew: true, portrait: cfg.portraitStyle, glyph: '缘' }
        }
        const tokens = GACHA_DUP_TOKENS[d.tier] ?? 10
        st.tokens += tokens
        const parts = [`重复 → 信物 ×${tokens}`]
        if (d.grade && (!st.grade || GRADE_RANK[d.grade] > GRADE_RANK[st.grade])) {
          st.grade = d.grade
          parts.push(`资质提升至「${d.grade}」`)
        }
        if (!cfg.awakened && st.affinity < affinityCap.value) {
          const gain = Math.min(60, affinityCap.value - st.affinity)
          st.affinity += gain
          parts.push(`好感 +${gain}`)
        }
        return { draw: d, name: cfg.name, detail: parts.join('，'), isNew: false, portrait: cfg.portraitStyle, glyph: '缘' }
      }
      case 'SKILL': {
        const sk = SKILLS[d.refId!]
        const lv = learnedSkills.value[sk.id] ?? 0
        const base = { draw: d, name: `《${sk.name}》`, glyph: SKILL_SLOT_META[sk.slot].glyph }
        if (lv <= 0) {
          learnSkill(sk.id)
          return { ...base, detail: `习得${SKILL_SLOT_META[sk.slot].label}`, isNew: true }
        }
        if (lv < 10) {
          learnedSkills.value[sk.id] = lv + 1
          return { ...base, detail: `已会 → 参悟至第 ${lv + 1} 重`, isNew: false }
        }
        p.silver += GACHA_DUP_SILVER[sk.tier]
        return { ...base, detail: `已臻圆满 → 纹银 +${GACHA_DUP_SILVER[sk.tier]}`, isNew: false }
      }
      case 'ITEM': {
        const it = ITEMS[d.refId!]
        const base = { draw: d, name: `【${it.name}】`, glyph: EQUIP_SLOT_META[it.slot].glyph }
        if (!ownedItemIds.value.includes(it.id)) {
          gainItem(it.id)
          return { ...base, detail: `入手${EQUIP_SLOT_META[it.slot].label}`, isNew: true }
        }
        p.silver += GACHA_DUP_SILVER[it.tier]
        return { ...base, detail: `重复 → 纹银 +${GACHA_DUP_SILVER[it.tier]}`, isNew: false }
      }
      case 'TOKEN': {
        const cfg = COMPANIONS[d.refId!]
        companionAffinity.value[d.refId!].tokens += d.qty ?? 0
        return { draw: d, name: `${cfg.name}信物`, detail: `×${d.qty}（觉醒进阶用）`, isNew: false, glyph: '信' }
      }
      case 'PILL':
        pillCount.value += d.qty ?? 1
        return { draw: d, name: '九花玉露丸', detail: `×${d.qty}（冲穴成功率 +25%）`, isNew: false, glyph: '丹' }
      case 'SILVER':
        p.silver += d.qty ?? 0
        return { draw: d, name: '纹银', detail: `+${(d.qty ?? 0).toLocaleString()} 两`, isNew: false, glyph: '银' }
      case 'QI':
        p.qiExp += d.qty ?? 0
        return { draw: d, name: '真气', detail: `+${(d.qty ?? 0).toLocaleString()}`, isNew: false, glyph: '气' }
    }
  }

  function pullGacha(count: 1 | 10) {
    if (gachaReveal.value) return
    const cost = count === 10 ? GACHA_TEN_COST : GACHA_SINGLE_COST
    if (player.value.goldIngot < cost) {
      showToast(`元宝不足：结缘 ${count} 次需 ${cost} 元宝`, 'danger')
      return
    }
    player.value.goldIngot -= cost
    const { draws, pity } = rollGacha({ count, pity: gacha.value.pity, pullsSoFar: gacha.value.pulls })
    gacha.value.pity = pity
    gacha.value.pulls += count
    const results = draws.map(applyGachaDraw)
    gacha.value.history = [...results.slice().reverse(), ...gacha.value.history].slice(0, 60)
    gachaReveal.value = { key: Date.now(), results }

    const notable = results.filter((r) => r.draw.tier !== 'blue')
    const segs: RichSegment[] = []
    for (const r of notable) {
      const tier = r.draw.tier
      segs.push({ type: 'text', text: ' ' })
      if (r.draw.kind === 'COMPANION') segs.push({ type: 'actor', name: r.name, isAlly: true })
      else if (r.draw.kind === 'SKILL') segs.push({ type: 'skill', id: r.draw.refId!, name: r.name, tier })
      else if (r.draw.kind === 'ITEM') segs.push({ type: 'item', id: r.draw.refId!, name: r.name, tier })
      else segs.push({ type: 'text', text: r.name })
    }
    appendLog('JIANGHU', [
      { type: 'tag', text: '醉仙结缘', tone: results.some((r) => r.draw.tier === 'red') ? 'gold' : 'purple' },
      { type: 'text', text: ` 你于醉仙楼雅间焚香求签，结缘 ${count} 次（−${cost} 元宝）${notable.length ? '，得：' : '，皆是寻常机缘。'}` },
      ...segs,
    ])
  }

  function closeGachaReveal() {
    gachaReveal.value = null
  }

  /** 已错过、可用重逢令补救的剧情送伙伴 */
  const reunionCandidates = computed(() =>
    Object.entries(REUNION_AFTER)
      .filter(([id, adv]) => resolvedAdventureIds.value.includes(adv) && !companionAffinity.value[id]?.recruited)
      .map(([id]) => id)
  )

  function redeemReunionTicket(compId: string) {
    const c = COMPANIONS[compId]
    if (!c || !reunionCandidates.value.includes(compId)) return
    if (player.value.goldIngot < REUNION_TICKET_COST) {
      showToast(`元宝不足：故人重逢令需 ${REUNION_TICKET_COST} 元宝`, 'danger')
      return
    }
    player.value.goldIngot -= REUNION_TICKET_COST
    const st = companionAffinity.value[compId]
    st.met = true
    st.recruited = true
    st.affinity = Math.max(st.affinity, 100)
    appendLog('JIANGHU', [
      { type: 'tag', text: '故人重逢', tone: 'gold' },
      { type: 'text', text: ' 醉仙楼的伙计递来一封旧信，你循着信中所约来到渡口——' },
      { type: 'actor', name: c.name, isAlly: true },
      { type: 'text', text: '已在那里等你多时。前尘往事，一笑而过，从此同行。' },
    ])
    showToast(`故人重逢：【${c.name}】已入队`, 'gold')
  }

  // ==================== 故人寻访 & 北丐·十道绝味（以时间换取的免费路线，第12册 §十六） ====================
  type ReunionStep = 'CLUES' | 'WAIT' | 'GIFT' | 'BATTLE' | 'DONE'
  interface ReunionState {
    clues: number
    day: string
    got: Record<ClueSource, number>
    step: ReunionStep
    waitSince: number | null // 线索集齐、开始“故地相候”的时刻
    waitMs: number // 已在故地累计停留的毫秒（离开地图时结算）
  }
  const reunion = ref<Record<string, ReunionState>>({})
  const feast = ref<{ ingredients: string[]; cooked: string[]; lastCookDay: string }>({ ingredients: [], cooked: [], lastCookDay: '' })
  const mapArrivedAt = ref(Date.now())
  /** 给“故地相候”进度条用的粗粒度时钟 */
  const nowTick = ref(Date.now())
  setInterval(() => (nowTick.value = Date.now()), 30_000)

  const blankReunion = (): ReunionState => ({ clues: 0, day: '', got: { closed: 0, replay: 0, inn: 0 }, step: 'CLUES', waitSince: null, waitMs: 0 })
  const reunionOf = (id: string) => (reunion.value[id] ??= blankReunion())
  /** 只读视图（界面用，不会写入新键） */
  function reunionView(id: string) {
    const st = reunion.value[id] ?? blankReunion()
    const today = dayKey(nowTick.value)
    const got = st.day === today ? st.got : { closed: 0, replay: 0, inn: 0 }
    return { ...st, got, waitRatio: waitRatio(id) }
  }
  function waitRatio(id: string, now = nowTick.value) {
    const st = reunion.value[id]
    const q = REUNION_QUESTS[id]
    if (!st || st.step !== 'WAIT' || !q) return st && st.step !== 'CLUES' ? 1 : 0
    const here = player.value.currentMapId === q.mapId ? Math.max(0, now - Math.max(mapArrivedAt.value, st.waitSince ?? 0)) : 0
    return Math.min(1, (st.waitMs + here) / (REUNION_WAIT_HOURS * 3600_000))
  }
  /** 离开地图前，把在故地的停留时长累计进去 */
  function accrueReunionWait() {
    const now = Date.now()
    for (const [id, st] of Object.entries(reunion.value)) {
      const q = REUNION_QUESTS[id]
      if (st.step === 'WAIT' && q && player.value.currentMapId === q.mapId) {
        st.waitMs += Math.max(0, now - Math.max(mapArrivedAt.value, st.waitSince ?? 0))
      }
    }
  }

  function gainClue(id: string, source: ClueSource): number {
    const st = reunionOf(id)
    if (st.step !== 'CLUES') return 0
    const today = dayKey()
    if (st.day !== today) {
      st.day = today
      st.got = { closed: 0, replay: 0, inn: 0 }
    }
    const src = REUNION_CLUE_SOURCES[source]
    const gain = Math.min(src.gain, src.dailyCap - st.got[source], REUNION_CLUE_TARGET - st.clues)
    if (gain <= 0) return 0
    st.got[source] += gain
    st.clues += gain
    if (st.clues >= REUNION_CLUE_TARGET) {
      st.step = 'WAIT'
      st.waitSince = Date.now()
      const q = REUNION_QUESTS[id]
      const m = MAPS.find((x) => x.id === q.mapId)
      appendLog('ADVENTURE', [
        { type: 'tag', text: '线索集齐', tone: 'gold' },
        { type: 'text', text: ` 关于` },
        { type: 'actor', name: COMPANIONS[id].name, isAlly: true },
        { type: 'text', text: `的消息终于拼凑完整。${q.waitText}（前往【${m?.name}】累计停留 ${REUNION_WAIT_HOURS} 小时，离线亦可）` },
      ])
      showToast(`【${COMPANIONS[id].name}】线索集齐：前往${m?.name}相候`, 'gold')
    }
    return gain
  }

  /** 收功时：离线 ≥1 小时为寻访攒线索；离线 ≥30 分钟在当前地图采办绝味食材 */
  function onOfflineSettled(elapsedSec: number) {
    if (elapsedSec >= 3600) {
      const names = reunionCandidates.value.filter((id) => gainClue(id, 'closed') > 0).map((id) => COMPANIONS[id].name)
      if (names.length) {
        appendLog('ADVENTURE', [
          { type: 'tag', text: '闭关打听', tone: 'jade' },
          { type: 'text', text: ` 闭关时听往来客商闲谈，得了些${names.join('、')}的消息（线索 +${REUNION_CLUE_SOURCES.closed.gain}）。` },
        ])
      }
    }
    if (feastActive.value && elapsedSec >= FEAST_GATHER_MINUTES * 60) {
      const dish = DISHES.find(
        (d) => d.mapId === player.value.currentMapId && !feast.value.ingredients.includes(d.id) && !feast.value.cooked.includes(d.id)
      )
      if (dish) {
        feast.value.ingredients.push(dish.id)
        appendLog('ADVENTURE', [
          { type: 'tag', text: '采办食材', tone: 'jade' },
          { type: 'text', text: ` 你在当地寻得上好的「${dish.ingredient}」，可回客栈为洪七公烹一道【${dish.name}】。` },
        ])
        showToast(`采得食材：${dish.ingredient}`, 'gold')
      }
    }
  }

  /** 主线节点获胜：与错过伙伴相关的节点给“旧地重游”线索 */
  function onStoryNodeWon(nodeId: number) {
    for (const id of reunionCandidates.value) {
      if (REUNION_QUESTS[id]?.replayNodeIds.includes(nodeId) && gainClue(id, 'replay') > 0) {
        appendLog('ADVENTURE', [
          { type: 'tag', text: '旧地重游', tone: 'jade' },
          { type: 'text', text: ` 故地重来，你在旧战场寻到了${COMPANIONS[id].name}留下的痕迹（线索 +${REUNION_CLUE_SOURCES.replay.gain}）。` },
        ])
      }
    }
  }

  function inquireReunion(id: string) {
    if (!reunionCandidates.value.includes(id)) return
    const st = reunionOf(id)
    if (st.step !== 'CLUES') return
    // 动作判定用实时时钟（界面时钟每 30 秒才刷新，跨子时那一刻会错判“今天”）
    const gotToday = st.day === dayKey() ? st.got.inn : 0
    if (gotToday >= REUNION_CLUE_SOURCES.inn.dailyCap) {
      showToast('掌柜今日知道的都说了，明日子时再来', 'info')
      return
    }
    if (player.value.silver < REUNION_INQUIRE_COST) {
      showToast(`打听消息需 ${REUNION_INQUIRE_COST} 两纹银`, 'danger')
      return
    }
    player.value.silver -= REUNION_INQUIRE_COST
    const gain = gainClue(id, 'inn')
    appendLog('JIANGHU', [
      { type: 'tag', text: '客栈打听', tone: 'jade' },
      { type: 'text', text: ` 你塞给掌柜一锭碎银，打听${COMPANIONS[id].name}的下落（线索 +${gain}）。` },
    ])
  }

  function completeReunionWait(id: string) {
    const st = reunion.value[id]
    if (!st || st.step !== 'WAIT') return
    if (waitRatio(id, Date.now()) < 1) {
      showToast(`还需在故地多候些时辰（已候 ${Math.floor(waitRatio(id, Date.now()) * 100)}%）`, 'info')
      return
    }
    accrueReunionWait()
    st.step = 'GIFT'
    appendLog('ADVENTURE', [
      { type: 'tag', text: '故地相候', tone: 'gold' },
      { type: 'text', text: ` 你终于等到了对方出没的踪迹。下一步，备一份${COMPANIONS[id].favGift}，以礼相邀。` },
    ])
  }

  function reunionGift(id: string) {
    const st = reunion.value[id]
    if (!st || st.step !== 'GIFT') return
    if (player.value.silver < INN_GIFT_COST) {
      showToast(`备礼需 ${INN_GIFT_COST} 两纹银`, 'danger')
      return
    }
    player.value.silver -= INN_GIFT_COST
    st.step = 'BATTLE'
    appendLog('ADVENTURE', [
      { type: 'tag', text: '以礼相邀', tone: 'gold' },
      { type: 'text', text: ` ${REUNION_QUESTS[id].giftText}` },
    ])
  }

  function reunionBattle(id: string) {
    const st = reunion.value[id]
    const q = REUNION_QUESTS[id]
    if (!st || !q || st.step !== 'BATTLE') return
    // 敌人强度按主角当前等级取最近的主线节点，略打九折
    const ref = [...STORY_CHAPTERS].reverse().find((n) => n.recLevel <= player.value.level) ?? STORY_CHAPTERS[0]
    appendLog('JIANGHU', [{ type: 'tag', text: '了却前尘', tone: 'red' }, { type: 'text', text: ` ${q.battleIntro}` }])
    const report = simulateServerBattle({
      sceneTitle: `故人重逢 · ${COMPANIONS[id].name}`,
      mode: 'SOLO_STORY',
      player: player.value,
      loadout: currentLoadout.value,
      enemyMain: { ...q.enemy, hp: Math.round(ref.bossHp * 0.9), atk: Math.round(ref.bossAtk * 0.9), mp: Math.round(ref.bossHp * 0.4) },
      rewards: { qiExp: Math.round(ref.rewardQi * 0.5), silver: 0 },
    })
    startBattlePlayback(report, null, () => {
      const cs = companionAffinity.value[id]
      cs.met = true
      cs.recruited = true
      cs.affinity = Math.max(cs.affinity, 100)
      st.step = 'DONE'
      appendLog('ADVENTURE', [
        { type: 'tag', text: '故人重逢', tone: 'gold' },
        { type: 'text', text: ` ${q.outro}` },
        { type: 'actor', name: COMPANIONS[id].name, isAlly: true },
        { type: 'text', text: '已加入你的江湖行列。' },
      ])
      showToast(`故人重逢：【${COMPANIONS[id].name}】已入队`, 'gold')
    })
  }

  /** 十道绝味进行中：已结识洪七公、尚未入队（抽卡 / 演武模式已得者无需再做）、尚未呈齐 */
  const feastActive = computed(() => {
    const hq = companionAffinity.value.hongqigong
    return !!hq?.met && !hq.recruited && !storyFlags.value.includes(FEAST_TARGET_FLAG)
  })

  function cookDish(dishId: string) {
    const dish = DISHES.find((d) => d.id === dishId)
    if (!dish || !feastActive.value) return
    if (feast.value.cooked.includes(dishId)) return
    if (!feast.value.ingredients.includes(dishId)) {
      const m = MAPS.find((x) => x.id === dish.mapId)
      showToast(`缺少「${dish.ingredient}」：在【${m?.name}】挂机 ≥${FEAST_GATHER_MINUTES} 分钟后收功即可采得`, 'danger')
      return
    }
    if (feast.value.lastCookDay === dayKey()) {
      showToast('今日已为洪七公掌过勺，明日子时再来', 'info')
      return
    }
    if (player.value.silver < dish.silver) {
      showToast(`烹制需 ${dish.silver} 两纹银`, 'danger')
      return
    }
    player.value.silver -= dish.silver
    feast.value.cooked.push(dishId)
    feast.value.ingredients = feast.value.ingredients.filter((x) => x !== dishId)
    feast.value.lastCookDay = dayKey()
    const hq = companionAffinity.value.hongqigong
    const gain = Math.max(0, Math.min(10, affinityCap.value - hq.affinity))
    hq.affinity += gain
    appendLog('JIANGHU', [
      { type: 'tag', text: `绝味 ${feast.value.cooked.length}/${DISHES.length}`, tone: 'gold' },
      { type: 'text', text: ` 你呈上一道【${dish.name}】——${dish.poem}洪七公吃得眉飞色舞${gain ? `（好感 +${gain}）` : ''}。` },
    ])
    if (feast.value.cooked.length === DISHES.length) {
      storyFlags.value.push(FEAST_TARGET_FLAG)
      hq.met = true
      hq.recruited = true
      hq.affinity = Math.max(hq.affinity, 100)
      appendLog('ADVENTURE', [
        { type: 'tag', text: '十道绝味', tone: 'gold' },
        { type: 'actor', name: '洪七公', isAlly: true },
        { type: 'text', text: '抹抹嘴，拍着肚皮长笑：“十道菜，道道有心思！老叫化这辈子没吃得这般痛快——走，这江湖老叫化陪你闯一闯！”洪七公已加入你的江湖行列。' },
      ])
      showToast('十道绝味呈齐：洪七公入队！', 'gold')
    } else {
      showToast(`呈上【${dish.name}】（${feast.value.cooked.length}/${DISHES.length}）`, 'gold')
    }
  }

  // ==================== 本地存档（可用 VITE_LOCAL_SAVE=false 关闭） ====================
  function snapshot() {
    return {
      gameMode: gameMode.value,
      isMidnightTheme: isMidnightTheme.value,
      player: player.value,
      learnedSkills: learnedSkills.value,
      ownedItemIds: ownedItemIds.value,
      pillCount: pillCount.value,
      openedAcupointIds: openedAcupointIds.value,
      pillInventory: pillInventory.value,
      herbInventory: herbInventory.value,
      knownRecipeIds: knownRecipeIds.value,
      furnaceResidue: furnaceResidue.value,
      alchemyPity: alchemyPity.value,
      betrayedSectIds: betrayedSectIds.value,
      storyFlags: storyFlags.value,
      claimedNodeIds: claimedNodeIds.value,
      resolvedAdventureIds: resolvedAdventureIds.value,
      adventureQueue: adventureQueue.value,
      pendingAdventureId: pendingAdventureId.value,
      companionAffinity: companionAffinity.value,
      presets: presets.value,
      innDay: innDay.value,
      innGiftsToday: innGiftsToday.value,
      gacha: { ...gacha.value, history: gacha.value.history.slice(0, 30) },
      reunion: reunion.value,
      feast: feast.value,
      mapArrivedAt: mapArrivedAt.value,
      logs: logs.value.slice(0, 30),
    }
  }
  type SaveData = ReturnType<typeof snapshot>
  const cloneSave = (data: SaveData): SaveData => JSON.parse(JSON.stringify(data))
  const demoInitial = cloneSave(snapshot())

  function demoFor(role: Pick<PlayerDTO, 'id' | 'nickname' | 'avatarId'>, since = Date.now() - 42 * 60_000) {
    const data = cloneSave(demoInitial)
    const { id, nickname, avatarId } = role
    data.player = { ...data.player, id, nickname, avatarId, lastSettleAt: since }
    data.player.trial.lastPatrolAt = since
    data.mapArrivedAt = Date.now()
    return data
  }

  /** 旧档缺少本地历练、经脉或炼丹字段时，按开局类型补默认值。 */
  function applySave(data: Partial<SaveData>) {
    const defaults = demoFor(data.player ?? player.value)
    const saved = { ...defaults, ...data }
    const fresh = saved.gameMode === 'NEW'
    player.value = {
      ...defaults.player,
      ...saved.player,
      stats: { ...defaults.player.stats, ...saved.player.stats },
      trial: {
        ...defaults.player.trial,
        ...saved.player.trial,
        lastPatrolAt: saved.player.trial?.lastPatrolAt ?? saved.player.lastSettleAt,
      },
    }
    learnedSkills.value = saved.learnedSkills
    ownedItemIds.value = saved.ownedItemIds
    openedAcupointIds.value = data.openedAcupointIds ?? (fresh ? [] : defaults.openedAcupointIds)
    pillInventory.value = data.pillInventory ?? {
      ...(fresh ? {} : defaults.pillInventory),
      pozhang_dan: data.pillCount ?? (fresh ? 0 : defaults.pillCount),
    }
    herbInventory.value = data.herbInventory ?? (fresh ? {} : defaults.herbInventory)
    knownRecipeIds.value = saved.knownRecipeIds
    furnaceResidue.value = data.furnaceResidue ?? (fresh ? 0 : defaults.furnaceResidue)
    alchemyPity.value = saved.alchemyPity
    betrayedSectIds.value = saved.betrayedSectIds
    storyFlags.value = saved.storyFlags
    claimedNodeIds.value = saved.claimedNodeIds
    resolvedAdventureIds.value = saved.resolvedAdventureIds
    adventureQueue.value = saved.adventureQueue
    pendingAdventureId.value = data.pendingAdventureId === undefined && fresh ? null : saved.pendingAdventureId
    companionAffinity.value = restoreCompanionStates(saved.companionAffinity)
    presets.value = { ...defaults.presets, ...saved.presets }
    innDay.value = saved.innDay
    innGiftsToday.value = saved.innGiftsToday
    gacha.value = { ...defaults.gacha, ...saved.gacha }
    reunion.value = Object.fromEntries(Object.entries(saved.reunion).map(([id, r]) => [id, { ...blankReunion(), ...r }]))
    feast.value = { ...defaults.feast, ...saved.feast }
    mapArrivedAt.value = saved.mapArrivedAt
    logs.value = saved.logs
    toggleTheme(saved.isMidnightTheme)
    nearbyPlayers.value = generateRoomPlayers(player.value.currentMapId)
  }

  function savePreview(data: SaveData, savedAt: number) {
    if (!data.gameMode || !data.player) return null
    return {
      mode: data.gameMode,
      playerId: data.player.id,
      level: data.player.level,
      node: STORY_CHAPTERS[Math.min(data.player.maxChapterId, STORY_CHAPTERS.length) - 1]?.code ?? '1-1',
      savedAt,
    }
  }

  const bootSave = IS_MOCK_MODE ? readSave<SaveData>() : null
  const savedGame = ref(bootSave ? savePreview(bootSave.data, bootSave.savedAt) : null)
  if (bootSave?.data.player && savedGame.value && savedGame.value.playerId !== player.value.id) {
    localCharacters.value.push({ player: bootSave.data.player })
  }

  function continueGame() {
    if (!IS_MOCK_MODE) return
    const env = readSave<SaveData>()
    if (!env?.data.gameMode || env.data.player?.id !== player.value.id) return
    applySave(env.data)
    gameMode.value = env.data.gameMode
    showToast('读档成功，欢迎回到江湖', 'gold')
  }

  function saveNow() {
    if (!IS_MOCK_MODE || !gameMode.value) return
    const data = snapshot()
    if (writeSave(data)) savedGame.value = savePreview(data, Date.now())
  }

  /** 回到开局界面（先存档；可“继续”回来） */
  function backToTitle() {
    if (!IS_MOCK_MODE) return
    saveNow()
    closeBattleStage()
    gachaReveal.value = null
    gameMode.value = null
  }

  function deleteSave() {
    if (!IS_MOCK_MODE) return
    clearSave()
    savedGame.value = null
  }

  if (IS_MOCK_MODE && LOCAL_SAVE_ENABLED) {
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    watch(
      snapshot,
      () => {
        if (saveTimer) clearTimeout(saveTimer)
        if (gameMode.value) saveTimer = setTimeout(saveNow, 800)
      },
      { deep: true }
    )
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', saveNow)
    onScopeDispose(() => {
      if (saveTimer) clearTimeout(saveTimer)
      if (typeof window !== 'undefined') window.removeEventListener('beforeunload', saveNow)
    })
  }

  // ==================== 开局模式 ====================
  /**
   * 选择开局。DEMO 沿用 store 初始化时的“全伙伴 Lv.32”状态（后续版本移除）；
   * NEW 则整体重置为 Lv.1、0 伙伴、从主线 1-1 起步，伙伴靠剧情与客栈逐步结识。
   */
  function startGame(mode: 'NEW' | 'DEMO') {
    if (!IS_MOCK_MODE) return
    if (mode === 'NEW') {
      const now = Date.now()
      const { id, nickname, avatarId } = player.value
      player.value = {
        id,
        nickname,
        avatarId,
        level: 1,
        realmTier: 1,
        realmStage: 1,
        breakPityRate: 0,
        qiExp: 0,
        nextLevelQi: calcNextLevelQi(1),
        silver: 600,
        goldIngot: 300,
        stats: { str: 10, con: 10, agi: 10, intStat: 10, luck: 10, karma: 0 },
        shaQi: 0,
        currentSectId: null,
        sectRank: 1,
        sectContribution: 0,
        isGuardingLibrary: false,
        currentMapId: 'jiaxing_suburb',
        maxChapterId: 1,
        qiPerHour: 600,
        lastSettleAt: now - 5 * 60_000,
        coCultivatePartner: null,
        bountyUntil: null,
        wearingMask: false,
        activePresetIdx: 1,
        trial: { ...cloneSave(demoInitial).player.trial, lastPatrolAt: now },
      }
      learnedSkills.value = {}
      ownedItemIds.value = ['qinggang_sword']
      openedAcupointIds.value = []
      pillInventory.value = {}
      herbInventory.value = {}
      knownRecipeIds.value = [...demoInitial.knownRecipeIds]
      furnaceResidue.value = 0
      alchemyPity.value = {}
      betrayedSectIds.value = []
      storyFlags.value = []
      claimedNodeIds.value = []
      resolvedAdventureIds.value = []
      adventureQueue.value = []
      pendingAdventureId.value = null
      companionAffinity.value = blankCompanionStates()
      innDay.value = ''
      innGiftsToday.value = {}
      gacha.value = { pulls: 0, pity: 0, history: [] }
      reunion.value = {}
      feast.value = { ingredients: [], cooked: [], lastCookDay: '' }
      mapArrivedAt.value = Date.now()
      gachaReveal.value = null
      const blank = (idx: 1 | 2 | 3, name: string, stance: StanceType): LoadoutPresetDTO => ({
        presetIdx: idx,
        name,
        stance,
        innerSkillId: null,
        outerSkillId: null,
        lightSkillId: null,
        ultSkillId: null,
        leftCompanionId: null,
        rightCompanionId: null,
        weaponId: 'qinggang_sword',
        armorId: null,
        accId: null,
        relicBookId: null,
      })
      presets.value = {
        1: blank(1, '预设壹·刚猛强攻', 'FIERCE'),
        2: blank(2, '预设贰·太极反震', 'TAICHI'),
        3: blank(3, '预设叁·奇门极速', 'AGILE'),
      }
      nearbyPlayers.value = generateRoomPlayers('jiaxing_suburb')
      logs.value = [
        {
          id: 'init_new',
          timeLabel: SHICHEN_LABELS[shichenIdx.value],
          channel: 'JIANGHU',
          segments: [
            { type: 'tag', text: '江湖纪元', tone: 'gold' },
            { type: 'text', text: ' 南宋嘉定十四年，烟雨迷蒙。你一介白衣，孤身踏入嘉兴南湖，身份是无门无派的' },
            { type: 'tag', text: '逍遥散人', tone: 'jade' },
            { type: 'text', text: '。囊中只有几两碎银与一柄青钢剑——江湖路远，且从前方那座破庙开始。' },
          ],
        },
      ]
      activeTab.value = 'JIANGHU'
      jianghuTab.value = 'STORY'
    } else {
      applySave(demoFor(player.value))
      activeTab.value = 'CULTIVATE'
      jianghuTab.value = 'TRIAL'
    }
    ftue.value = emptyFtue()
    saveFtue()
    closeBattleStage()
    gachaReveal.value = null
    gameMode.value = mode
  }

  // 每5秒模拟一次在线打坐微跳与江湖时辰推进
  if (IS_MOCK_MODE) setInterval(() => {
    if (!gameMode.value) return
    const tickQi = Math.max(8, Math.round(effectiveQiPerHour.value / 720))
    player.value.qiExp += tickQi
  }, 5000)

  // 顶部飞鸽江湖邸报走马灯实时拼接文本（无彩色Emoji，纯正武侠邸报文风）
  const marqueeBulletin = computed(() => {
    if (!IS_MOCK_MODE) return '【江湖在线】在附近可以和同图侠客聊天。'
    const items: string[] = []
    if (player.value.bountyUntil) {
      items.push(`【海捕文书】「${player.value.nickname}」叛出师门，江湖侠客可追捕领赏。`)
    }
    for (const art of uniqueArtifacts.value) {
      if (art.holderNickname) {
        items.push(`【兵器谱孤品】「${art.name}」在${art.holderSect}的${art.holderNickname}手中，已守住 ${art.defendStreak} 届。`)
      } else {
        items.push(`【秘境风声】「${art.name}」还没有主人，${art.nextContestLabel}。`)
      }
    }
    const latestRumor = worldMessages.value.find((m) => m.channel === 'RUMOR')
    if (latestRumor) {
      items.push(`【百晓生传书】${latestRumor.content}`)
    }
    if (nextRaidRelic.value) {
      items.push(`【松鹤楼结义】打赢少室山副本，可得《${nextRaidRelic.value.name}》。`)
    }
    return items.join('　　·　　')
  })


  // 采药寻草（消耗 200 真气在指定或当前地图搜寻草药）
  function forageHerbs(targetMapId?: string) {
    const mapId = targetMapId || player.value.currentMapId
    const map = MAPS.find((m) => m.id === mapId) ?? MAPS[0]
    const mapHerbs = getMapHerbs(mapId)
    if (!mapHerbs.length) {
      showToast('此地未探明灵草植被。', 'info')
      return
    }
    const costQi = 200
    if (player.value.qiExp < costQi) {
      showToast(`采药搜山需耗损 ${costQi} 点真气调息探路。`, 'danger')
      return
    }
    player.value.qiExp -= costQi

    const gathered: { name: string; count: number; tier: TierColor }[] = []
    const shichen = shichenIdx.value
    const rollAttempts = 2 + (Math.random() < (player.value.stats.luck / 100) ? 1 : 0)

    for (let i = 0; i < rollAttempts; i++) {
      const rand = Math.random() * 100
      let eligible = mapHerbs.filter(h => {
        if (rand < 45) return h.rarity === 'COMMON'
        if (rand < 80) return h.rarity === 'UNCOMMON'
        if (rand < 95) return h.rarity === 'RARE'
        if (rand < 99) return h.rarity === 'EPIC'
        return true
      })
      if (!eligible.length) eligible = mapHerbs

      // 时辰加成
      const bonusHerb = eligible.find(h => h.shichenBonus?.shichens.includes(shichen))
      const chosen = (bonusHerb && Math.random() < 0.5) ? bonusHerb : eligible[Math.floor(Math.random() * eligible.length)]
      const qty = chosen.rarity === 'COMMON' ? (Math.random() < 0.5 ? 2 : 1) : 1
      herbInventory.value[chosen.id] = (herbInventory.value[chosen.id] ?? 0) + qty

      const existing = gathered.find(g => g.name === chosen.name)
      if (existing) existing.count += qty
      else gathered.push({ name: chosen.name, count: qty, tier: chosen.tier })
    }

    const descStr = gathered.map(g => `${g.name} x${g.count}`).join('、')
    appendLog('CULTIVATE', [
      { type: 'tag', text: '采药寻珍', tone: 'jade' },
      { type: 'text', text: ` 在【${map.name}】跋山涉水巡探，采获：${descStr}！` },
    ])
    showToast(`采获：${descStr}`, 'gold')
    ftue.value.forageCount += 1
    saveFtue()
  }

  // 丹房炼制
  function refinePill(recipeId: string) {
    const recipe = PILL_RECIPES[recipeId]
    if (!recipe) return

    // 悟性要求
    if (player.value.stats.intStat < recipe.minInsight) {
      showToast(`此古方极其玄奥，需悟性达到 ${recipe.minInsight} 方能掌控火候（当前悟性 ${player.value.stats.intStat}）。`, 'danger')
      return
    }
    // 消耗检验
    if (player.value.qiExp < recipe.costQi) {
      showToast(`炼制需消耗 ${recipe.costQi.toLocaleString()} 真气以控炉火。`, 'danger')
      return
    }
    if (player.value.silver < recipe.costSilver) {
      showToast(`炭火鼎炉工本需 ${recipe.costSilver} 两纹银。`, 'danger')
      return
    }
    // 药材检验
    for (const req of recipe.requiredHerbs) {
      const owned = herbInventory.value[req.herbId] ?? 0
      if (owned < req.count) {
        const herbName = HERBS[req.herbId]?.name ?? req.herbId
        showToast(`药材不足：缺少「${herbName}」x${req.count - owned}（现有 ${owned}/${req.count}）。`, 'danger')
        return
      }
    }

    // 扣除材料与消耗
    player.value.qiExp -= recipe.costQi
    player.value.silver -= recipe.costSilver
    for (const req of recipe.requiredHerbs) {
      herbInventory.value[req.herbId] -= req.count
    }

    // 成功率计算 (基础 + 悟性超额加成 + 福缘加成 + 保底)
    const pity = alchemyPity.value[recipeId] ?? 0
    const insightBonus = Math.max(0, (player.value.stats.intStat - recipe.minInsight) * 1.5)
    const luckBonus = player.value.stats.luck * 0.4
    const finalRate = Math.min(98, Math.max(15, Math.round(recipe.baseRate + insightBonus + luckBonus + pity)))

    const roll = Math.random() * 100
    const isSuccess = roll < finalRate
    const targetMed = MEDICINES[recipe.targetMedicineId]
    const medName = targetMed?.name ?? recipe.name

    if (isSuccess) {
      alchemyPity.value[recipeId] = 0 // 清空保底
      // 检验一炉双丹暴击 (基于福缘与悟性)
      const doubleRate = Math.min(40, Math.round(player.value.stats.luck * 0.8 + player.value.stats.intStat * 0.3))
      const isDouble = Math.random() * 100 < doubleRate
      const yieldCount = isDouble ? 2 : 1

      pillInventory.value[recipe.targetMedicineId] = (pillInventory.value[recipe.targetMedicineId] ?? 0) + yieldCount

      const critText = isDouble ? '【一炉双丹】天工开物，紫火纯青，竟然一炉炼成两丸！' : '鼎盖升腾五色氤氲，丹成九品！'
      appendLog('CULTIVATE', [
        { type: 'tag', text: '开炉丹成', tone: 'gold' },
        { type: 'text', text: ` 依照《${recipe.name}》起炉炼药，${critText} 炼得「${medName}」x${yieldCount}！` },
      ])
      showToast(`炼丹大成！获得「${medName}」x${yieldCount}${isDouble ? '（一炉双丹！）' : ''}`, 'gold')
      if (!ftue.value.refinedRecipeIds.includes(recipeId)) {
        ftue.value.refinedRecipeIds.push(recipeId)
        saveFtue()
      }
    } else {
      // 失败补偿
      alchemyPity.value[recipeId] = pity + 6
      furnaceResidue.value += 1
      appendLog('CULTIVATE', [
        { type: 'tag', text: '开炉微焦', tone: 'purple' },
        { type: 'text', text: ` 炼制《${recipe.name}》时火候稍疾，丹药焦化成药渣 1 团（已收纳）。悟性生慧，该丹方炼成率累积提升 +6%（当前保底 +${alchemyPity.value[recipeId]}%）！` },
      ])
      showToast('火候稍疾炼成药渣，悟性大涨，该丹方成功率+6%', 'info')
    }
  }

  // 药渣回炉萃取（每 5 团药渣可提炼随机药草与真气）
  function exchangeFurnaceResidue() {
    if (furnaceResidue.value < 5) {
      showToast('需积攒至少 5 团炼丹药渣方可回炉萃取灵草精微。', 'danger')
      return
    }
    furnaceResidue.value -= 5
    const allHerbIds = Object.keys(HERBS)
    const chosenId = allHerbIds[Math.floor(Math.random() * allHerbIds.length)]
    const chosen = HERBS[chosenId]
    const qty = 2
    herbInventory.value[chosenId] = (herbInventory.value[chosenId] ?? 0) + qty
    player.value.qiExp += 800

    appendLog('CULTIVATE', [
      { type: 'tag', text: '药渣萃精', tone: 'jade' },
      { type: 'text', text: ` 回炉萃取 5 团药渣残存灵性，提炼出「${chosen.name}」x${qty}，并汲取残余纯阳真气 800 点！` },
    ])
    showToast(`药渣萃取成功：获得「${chosen.name}」x${qty}，真气 +800`, 'gold')
  }

  return {
    isMidnightTheme,
    activeTab,
    jianghuTab,
    arsenalTab,
    mobileDrawer,
    shichenIdx,
    shichenLabel: computed(() => SHICHEN_LABELS[shichenIdx.value]),
    toasts,
    confirmDialog,
    inspectModal,
    player,
    learnedSkills,
    ownedItemIds,
    nextRaidRelic,
    shaoshiClears,
    raidLobby,
    raidLobbyBusy,
    pillCount,
    openedAcupointIds,
    pillInventory,
    pierceAcupoint,
    useAcupointPill,
    herbInventory,
    knownRecipeIds,
    furnaceResidue,
    alchemyPity,
    forageHerbs,
    refinePill,
    exchangeFurnaceResidue,
    companionAffinity,
    presets,
    currentLoadout,
    currentRealm,
    currentMap,
    currentSect,
    derivedStats,
    gameMode,
    limitsEnabled,
    startGame,
    affinityCap,
    giftsLeft,
    companionOf,
    awakenCompanion,
    gacha,
    gachaReveal,
    reunionView,
    inquireReunion,
    completeReunionWait,
    reunionGift,
    reunionBattle,
    feast,
    feastActive,
    cookDish,
    savedGame,
    continueGame,
    backToTitle,
    deleteSave,
    saveNow,
    pullGacha,
    closeGachaReveal,
    reunionCandidates,
    redeemReunionTicket,
    setBonusStates,
    collectionBonus,
    effectiveQiPerHour,
    onlineTime,
    activeCoCultivation,
    coCultivationInvite,
    activeTrioSynergy,
    isWandererMasteryActive,
    onlinePhase: online.phase,
    authBusy: online.authBusy,
    authError: online.authError,
    roomConnected: online.roomConnected,
    roomMapId,
    roomCount,
    canRetryOnline: online.canRetry,
    onlineActionBusy: computed(() => online.actionBusy.value || online.canRetry.value),
    onlineRetryBusy: online.actionBusy,
    resumeOnline: online.resume,
    signIn: online.signIn,
    createOnlinePlayer: online.create,
    characterList,
    selectLocalCharacter,
    createLocalCharacter,
    deleteLocalCharacter,
    logout: online.logout,
    retryOnlineAction: online.retry,
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
    getIdleRewards,
    settleOfflineQi,
    upgradeLevel,
    attemptBreakthrough,
    triggerRandomAdventure,
    resolveAdventure,
    skipBattleToEnd,
    closeBattleStage,
    selectTab,
    moveMap,
    challengeChapter,
    trial,
    ftue,
    ftueQuest,
    ftueReady,
    ftueProgressOf,
    claimFtueReward,
    gotoFtueTarget,
    marketTab,
    trialPatrolStatus,
    mockSettlePatrol,
    setPatrolStage,
    challengeTrialStage,
    replayTrialBoss,
    redeemTrialPart,
    startThreePlayerCoopRaid,
    openRaidLobby,
    raidTeamAction,
    interactNearbyPlayer,
    replyCoCultivation,
    endCoCultivation,
    joinSect,
    saluteChiefPlayer,
    challengeSectPromotion,
    leaveSect,
    upgradeSkillMastery,
    equipItem,
    updateLoadout,
    switchLoadout,
    giftCompanionInInn,
    appraiseGhostCurio,
    buyOrBidMarketListing,
    sendChatMessage,
  }
})
