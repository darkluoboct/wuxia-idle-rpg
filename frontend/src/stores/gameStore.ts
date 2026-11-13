import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type {
  BattleEventDTO,
  BattleReportDTO,
  BountyEntryDTO,
  CombatUnitDTO,
  CompanionWear,
  CultivationResult,
  DuelInviteDTO,
  EquipSlotType,
  ForgeInput,
  ForgeResult,
  GachaDrawDTO,
  GaibangBranch,
  GameLogEntry,
  HuashanAction,
  HuashanResult,
  IdleGain,
  InnGiftResult,
  LibraryResult,
  MapMoveResult,
  VoyageResult,
  GhostAppraisalResult,
  GhostMarketListingDTO,
  LoadoutPresetDTO,
  PendingAdventureDTO,
  PersonalEquipSlot,
  PlayerAvatarId,
  PlayerDTO,
  PlayerSnapshot,
  RaidId,
  RaidLobbyDTO,
  ReunionResult,
  ReunionStateDTO,
  RichSegment,
  RoomPlayerDTO,
  SectContestAction,
  SectContestResult,
  SectResult,
  SkillUpgradeResult,
  StanceType,
  StoryAdventureResult,
  StoryChallengeResult,
  StorySnakeChoice,
  StorySnakeChoiceResult,
  TrialChallengeResult,
  TrialPatrolStatusDTO,
  TrialReplayResult,
  TrialDropDTO,
  TierColor,
  UniqueArtifactStatusDTO,
  WsServerEvent,
} from '@/network/protocol'
import {
  calcNextLevelQi,
  computeDerivedStats,
  generateRoomPlayers,
  INITIAL_UNIQUE_ARTIFACTS,
  mockDuelOpponent,
  rollGacha,
  simulateServerBattle as simulateBattle,
} from '@/network/mockEngine'
import {
  ACUPOINTS,
  activeJianghuTitle,
  MEDICINES,
  HERBS,
  type HerbConfig,
  PILL_RECIPES,
  type PillRecipeConfig,
  getMapHerbs,
  hiddenWeaponCapacity,
  unlockedHiddenWeapons,
  activeSetBonuses,
  totalCompanionSetBonuses,
  ADVENTURES,
  adventureById,
  affinityCapFor,
  canEquipCompanionItem,
  COMPANIONS,
  COOP_RAID_RELICS,
  COOP_RAIDS,
  companionView,
  findTrioSynergy,
  getChapterDrops,
  GHOST_MARKET_LISTINGS,
  INN_GIFT_COST,
  INN_TEA_COST,
  meetsItemStatRequirement,
  ITEMS,
  MAPS,
  marketListingPrice,
  ONLINE_STORY_CHAPTERS,
  REALMS,
  SHAOSHI_RAID,
  SECTS,
  SKILLS,
  STAT_LABEL,
  STORY_CHAPTERS,
  trialRewardItems,
  validateGameData,
  type AdventureChoice,
  type CompanionGrade,
  type AdventureCtx,
  type Reward,
  type SectConfig,
} from '@/config/gameData'
import { EQUIP_SLOT_META, formatSkillPower, itemBonusLabels, shichenIdxFromDate, SKILL_SLOT_META, STANCE_META, trialDropLabel } from '@/config/uiMeta'
import { apiClient, ApiError, IS_MOCK_MODE } from '@/network/apiClient'
import { creditBattleEffectLoot, resolveBattleLoadout, spendBattleMedicines } from '../../../shared/battleEffects.ts'
import { extractFurnaceResidue, FORAGE_QI_COST, gatherHerbs, pillDoubleRate, pillSuccessRate } from '../../../shared/alchemy.ts'
import { computeCompanionDerivedStats, simulatePlayerDuel, simulateShaoshiRaid } from '../../../shared/battle.ts'
import { battleEnvironmentAt, formatBattleStatBonuses } from '../../../shared/combatMeta.ts'
import { forgeEquipment, forgeMaterialLabel, forgeMaterials, temperedItem } from '../../../shared/equipmentForge.ts'
import { GAIBANG_BRANCHES, GAIBANG_DEBATE, gaibangDishFlag, gaibangSilverGain } from '../../../shared/gaibang.ts'
import { huashanDay } from '../../../shared/huashan.ts'
import { SECT_SALUTE_QI, sectContributionGain, sectExamBlockReason, sectPromotion, sectPromotionRewards, simulateSectTrial } from '../../../shared/sectProgress.ts'
import { eligibleWandererEquipment, gaibangBeggingSilver, sectEquipmentRewardIds, sectEquipmentSetOf,
  WANDERER_EQUIPMENT } from '../../../shared/sectEquipment.ts'
import { appraiseGhostCurio as settleGhostAppraisal, canEnterMap, canReceiveSnakeRecipe, cityInspectionDue, coCultivationRate, createStarterCharacter, cultivatePlayer, cultivationRate, cultivationRates, enemySilverReward, GHOST_APPRAISAL_SWORD, ghostAppraisalCost, idleQiNumerator, innAffinityGain, innGiftsRemaining, innVisitDay, karmaAfterEvent, legacyAcupoints, planMapJourney, recipeForPlayer, resolveSeaVoyage, settlePatrolCaches } from '../../../shared/player.ts'
import {
  advancePatrol, collectTrialDrop, equippedGearSkill, hasTrialPart, patrolEncounterCount, patrolEncounterRate, recruitTrialCompanions, rollTrialDrop,
  switchPatrolStage, TRIAL_PATROL_HOURS, TRIAL_REPLAY_HOURS, TRIAL_STAGES, trialAffixLabel, trialAffixQuality, trialFirstClearKarma,
  announceChapterOneTitle, CHAPTER_ONE_FINAL_STAGE, CHAPTER_ONE_TITLE, trialItemOf, trialPartId, trialPuzzleOutcome, trialSetOf, trialStageOf, upgradesPatrolYield,
} from '../../../shared/trialStages.ts'
import { FTUE_QUESTS, HAND_THREE_YANG, type FtueQuestConfig } from '../../../shared/ftueQuests.ts'
import { MAX_SKILL_MASTERY, getSkillMasteryCap, QUSAN_CACHE_KEY, searchQusanCache, skillFragmentDiscount, skillUpgradeCost } from '../../../shared/skillMastery.ts'
import { effectiveMartialStats, equippedMartialSkills, hasWandererMastery } from '../../../shared/martialSchools.ts'
import { addAdventureObjective, adventureEncounter, storyProgressFlags } from '../../../shared/storyData.ts'
import { gainReunionClues, reunionCluesToday, reunionEncounter, reunionWaitTime } from '../../../shared/reunion.ts'
import { STORY_SNAKE_ADVENTURE, storyEncounter } from '../../../shared/storySnake.ts'
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
  GAIBANG_FINAL_DISHES,
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
const DAMAGE_POPUP_LABELS: Partial<Record<string, string>> = { poison: '毒伤 ', bleed: '流血 ', reflect: '反伤 ', true: '真伤 ' }

export type MainTab = 'CULTIVATE' | 'JIANGHU' | 'ARSENAL' | 'SECT' | 'MARKET'
type RaidTeamAction =
  | { action: 'invite'; targetPlayerId: string }
  | { action: 'accept' | 'decline'; invitationId: string }
  | { action: 'select'; teamId: string; raidId: RaidId }
  | { action: 'ready'; teamId: string; raidId: RaidId; ready: boolean }
  | { action: 'leave'; teamId: string }

export const useGameStore = defineStore('wuxiaGame', () => {
  if (import.meta.env.DEV) {
    const errs = [...validateGameData(), ...validateGachaData(), ...validateQuestData()]
    if (errs.length) console.warn('[gameData] 数据引用校验失败：\n' + errs.join('\n'))
  }

  // 主题与响应式抽屉状态（默认启动采用燕云玄墨深色护眼主题）
  const isMidnightTheme = ref(true)
  const activeTab = ref<MainTab>('CULTIVATE')
  const jianghuTab = ref<'STORY' | 'TRIAL' | 'MAPS' | 'RAID' | 'BOUNTY'>('TRIAL')
  const bountyTargetId = ref<string>()
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
  starter.player.openedAcupointIds = starter.openedAcupointIds
  const player = ref(starter.player)
  const learnedSkills = ref(starter.learnedSkills)
  const ownedItemIds = ref(starter.ownedItemIds)
  const openedAcupointIds = computed({
    get: () => player.value.openedAcupointIds ?? [],
    set: (ids: string[]) => { player.value.openedAcupointIds = ids },
  })
  const pillInventory = ref<Record<string, number>>(starter.pillInventory)
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
  const marketTab = ref<'INN' | 'GHOST' | 'ALCHEMY' | 'HUASHAN' | 'ARTIFACTS'>(IS_MOCK_MODE ? 'INN' : 'ALCHEMY')

  // 剧情进度：标记、已领取首通奖励的主线节点、已了结的奇遇、待决奇遇队列
  const storyFlags = ref<string[]>([])
  const claimedNodeIds = ref<number[]>([])
  const resolvedAdventureIds = ref<string[]>([])
  const adventureQueue = ref<string[]>([])
  const pendingAdventureId = ref<string | null>(IS_MOCK_MODE ? STORY_SNAKE_ADVENTURE.id : null)

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
  const requestedRaidId = ref<RaidId>('shaoshi')
  const selectedRaidId = computed(() => raidLobby.value.team?.raidId ?? requestedRaidId.value)
  const selectedRaidClears = computed(() => onlineState.value?.snapshot[COOP_RAIDS[selectedRaidId.value].clearField] ?? 0)
  let lastRaidBattleId: string | null = null
  const duelInvite = shallowRef<DuelInviteDTO | null>(null)
  let lastDuelBattleId: string | null = null
  const pendingDuelReport = shallowRef<BattleReportDTO | null>(null)
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
  const clock = setInterval(() => {
    if (player.value.mapJourney || (!IS_MOCK_MODE && (activeCoCultivation.value || coCultivationInvite.value || player.value.escortDart))) {
      onlineClock.value = Date.now()
    }
  }, 1_000)
  onScopeDispose(() => clearInterval(clock))

  const currentLoadout = computed(() => presets.value[player.value.activePresetIdx])
  const currentRealm = computed(() => REALMS.find((r) => r.tier === player.value.realmTier) ?? REALMS[0])
  const currentMap = computed(() => MAPS.find((m) => m.id === player.value.currentMapId) ?? MAPS[0])
  const journeyMap = computed(() => MAPS.find((map) => map.id === player.value.mapJourney?.mapId))
  const journeySeconds = computed(() => Math.max(0, Math.ceil(((player.value.mapJourney?.arrivesAt ?? 0) - onlineTime.value) / 1000)))
  const canTravelTo = (map: (typeof MAPS)[number]) => map.id === currentMap.value.id || canEnterMap(map, player.value, currentLoadout.value, !IS_MOCK_MODE)
  const mapTravelTime = (mapId: string) => (planMapJourney(player.value, mapId, currentLoadout.value, worldTime.value).arrivesAt - worldTime.value) / 1000
  const currentSect = computed(() => SECTS.find((s) => s.id === player.value.currentSectId) ?? null)
  const sectFlags = computed(() => IS_MOCK_MODE ? storyFlags.value : player.value.sectProgressFlags ?? [])
  const promotion = computed(() => currentSect.value ? sectPromotion(currentSect.value, player.value, sectFlags.value) : undefined)
  const gaibangChoicePending = computed(() => promotion.value?.choosing ?? false)
  const gaibangFinalPending = computed(() => player.value.currentSectId === 'gaibang' && promotion.value?.finale)
  const canPromoteSect = computed(() => promotion.value?.available ?? false)
  const canSaluteSect = computed(() => IS_MOCK_MODE || player.value.sectSaluteDay !== huashanDay(onlineTime.value))
  const canBegToday = computed(() => player.value.gaibangBeggingDay !== huashanDay(IS_MOCK_MODE ? nowTick.value : onlineTime.value))
  const unclaimedSectEquipment = computed(() => currentSect.value
    ? sectEquipmentRewardIds(currentSect.value.id, player.value.sectRank).filter((id) => !ownedItemIds.value.includes(id)) : [])
  const unclaimedWandererEquipment = computed(() => eligibleWandererEquipment(player.value)
    && WANDERER_EQUIPMENT.items.some(({ id }) => !ownedItemIds.value.includes(id)))
  const wandererTeamDamage = computed(() => resolveBattleLoadout(currentLoadout.value, player.value).effects
    .filter((effect) => effect.kind === 'TARGET_TRAIT_DAMAGE').find((effect) => effect.sourceId === WANDERER_EQUIPMENT.id)?.percent ?? 0)
  const sectPromotionExam = computed(() => promotion.value?.exam)
  const sectPromotionBlockReason = computed(() => sectExamBlockReason(sectPromotionExam.value, player.value.stats.con,
    currentLoadout.value, (id) => !!companionAffinity.value[id]?.recruited, !gaibangFinalPending.value || gaibangFinalReady.value))
  // 收集羁绊：已入队成员数达标即全局加成（气血 / 攻击 / 离线打坐）
  const setBonusStates = computed(() => activeSetBonuses((id) => !!companionAffinity.value[id]?.recruited))
  const collectionBonus = computed(() => totalCompanionSetBonuses(setBonusStates.value))
  const derivedStats = computed(() => onlineState.value?.snapshot.derivedStats ??
    computeDerivedStats(player.value, currentLoadout.value, collectionBonus.value, companionOf))

  /** 好感上限随主线章节推进抬高（仅新游戏）；演武模式不设限 */
  const affinityCap = computed(() => (limitsEnabled.value ? affinityCapFor(player.value.maxChapterId) : 1000))
  function giftsLeft(id: string) {
    if (!IS_MOCK_MODE) {
      const visits = player.value.innVisits
      return innGiftsRemaining(visits?.day === innVisitDay(worldTime.value) ? visits.gifts[id] : undefined)
    }
    if (!limitsEnabled.value) return { tea: Infinity, gift: Infinity }
    const used = innDay.value === dayKey() ? innGiftsToday.value[id] : undefined
    return innGiftsRemaining(used)
  }
  const innGiftGain = (id: string, favorite: boolean) => Math.max(0, Math.min(affinityCap.value - (companionAffinity.value[id]?.affinity ?? 0),
    innAffinityGain(id, favorite, jianghuTitle.value?.id)))
  /** 伙伴当前形态视图（形态 / 资质已套用），界面与战斗统一读它 */
  const companionOf = (id: string) => (COMPANIONS[id] ? companionView(COMPANIONS[id], companionAffinity.value[id]) : undefined)
  const companionCombatStats = (id: string) => computeCompanionDerivedStats(player.value, currentLoadout.value, id, companionOf)

  function simulateServerBattle(params: Parameters<typeof simulateBattle>[0]) {
    return simulateBattle({ bonus: collectionBonus.value, companionOf, ownedItemIds: ownedItemIds.value, ...params })
  }

  // 计算当前实时每小时打坐真气效率
  const mockIdleRates = computed(() => cultivationRates(player.value, currentLoadout.value, collectionBonus.value.idleQiPct))
  const effectiveQiPerHour = computed(() => {
    const live = onlineState.value?.snapshot
    if (!live) return mockIdleRates.value.qi
    return activeCoCultivation.value ? coCultivationRate(live.soloQiPerHour) : live.soloQiPerHour
  })
  const effectiveSilverPerHour = computed(() => {
    const live = onlineState.value?.snapshot
    if (!live) return gaibangSilverGain(player.value, Math.max(150, Math.round(mockIdleRates.value.silverBasis * 0.28)))
    const solo = live.soloSilverBasis ?? live.soloQiPerHour
    return Math.floor((activeCoCultivation.value ? coCultivationRate(solo) : solo) * 0.28)
  })

  // 当前激活的三人行羁绊
  const activeTrioSynergy = computed(() =>
    findTrioSynergy(currentLoadout.value.leftCompanionId, currentLoadout.value.rightCompanionId)
  )

  const martialStats = computed(() => effectiveMartialStats(player.value, currentLoadout.value))
  const jianghuTitle = computed(() => activeJianghuTitle({ ...player.value, stats: martialStats.value }, currentLoadout.value))
  const isWandererMasteryActive = computed(() => hasWandererMastery(player.value, equippedMartialSkills(currentLoadout.value)))

  // 同地图在线玩家与聊天频道
  const nearbyPlayers = ref<RoomPlayerDTO[]>(IS_MOCK_MODE ? generateRoomPlayers('jiaxing_suburb') : [])
  const roomMapId = ref<string | null>(null)
  const roomCount = ref(0)
  const ownsDagouStaff = computed(() => IS_MOCK_MODE && ownedItemIds.value.includes('dagou_stick_true'))
  const uniqueArtifacts = computed<UniqueArtifactStatusDTO[]>(() => INITIAL_UNIQUE_ARTIFACTS.map((artifact) =>
    ownsDagouStaff.value && artifact.itemId === 'dagou_stick_true'
      ? { ...artifact, holderNickname: player.value.nickname, holderSect: currentSect.value?.name ?? '逍遥散人', defendStreak: 0, nextContestLabel: '丐帮衣钵传承' }
      : artifact))
  const visibleNearbyPlayers = computed(() => ownsDagouStaff.value
    ? nearbyPlayers.value.map((nearby) => nearby.holdingUniqueArtifact === ITEMS.dagou_stick_true.name
      ? { ...nearby, holdingUniqueArtifact: undefined } : nearby)
    : nearbyPlayers.value)
  const ghostAuction = ref({ ...GHOST_MARKET_LISTINGS.find((entry) => entry.listingType === 'AUCTION')! })
  const ghostListings = computed(() => GHOST_MARKET_LISTINGS.flatMap((entry) => {
    if (entry.listingType === 'AUCTION') return IS_MOCK_MODE ? [ghostAuction.value] : []
    return player.value.ghostMarketPurchases?.includes(entry.id) || ownedItemIds.value.includes(entry.itemId) || learnedSkills.value[entry.itemId] ? [] : [entry]
  }))

  const worldMessages = ref<
    { id: string; channel: 'WORLD' | 'SECT' | 'RUMOR'; sender: string; sect: string; content: string; time: string }[]
  >(IS_MOCK_MODE ? [
    { id: 'm1', channel: 'RUMOR', sender: '江湖百晓生', sect: '天机', content: '传闻【真·绿玉打狗棒】现落入白驼山【西域毒皇·欧阳烈】之手，丐帮群豪正欲夺回！', time: '辰时' },
    { id: 'm2', channel: 'WORLD', sender: '重阳首座·清风道长', sect: '全真教', content: '松鹤楼结义秘境【少林金刚伏魔圈】2缺1高爆发少侠，来个会降龙掌的兄弟！', time: '辰时' },
    { id: 'm3', channel: 'WORLD', sender: '桃花小师妹', sect: '桃花岛', content: '哪位散人大哥鬼市淘到了《九阴残页》？诚心高价收！', time: '巳时' },
  ] : [])
  const visibleWorldMessages = computed(() => ownsDagouStaff.value
    ? worldMessages.value.map((message) => message.id === 'm1'
      ? { ...message, content: `【真·绿玉打狗棒】现由【${player.value.nickname}】执掌。` } : message)
    : worldMessages.value)

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
      stats: { ...martialStats.value },
      isWanderer: !player.value.currentSectId,
      flags: storyFlags.value,
      items: ownedItemIds.value,
      silver: player.value.silver,
    }
  }
  const choiceAvailable = (c: AdventureChoice, ctx: AdventureCtx) =>
    (!c.require || c.require(ctx)) && (c.costSilver ?? 0) <= ctx.silver
  const canChooseAdventure = (choice: AdventureChoice) => choiceAvailable(choice, adventureCtx())

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
  const battleOpponentEntry = ref<BattleEventDTO['opponentEntry']>()
  const battleUnits = computed(() => {
    const units = activeBattle.value?.units ?? []
    const entry = battleOpponentEntry.value
    return entry ? [...units.filter((unit) => !unit.slot.startsWith('ENEMY')), entry.unit, ...(entry.guards ?? [])] : units
  })
  const activeChapterId = ref<number | null>(null) // 当前战斗对应的主线节点（战斗结束才结算首通）
  const battleEventCursor = ref(0)
  const battleSpeed = ref<1 | 2>(1)
  const isBattlePlaying = ref(false)
  const liveUnitStates = ref<Record<string, {
    hp: number; maxHp: number; rage: number; mp: number; maxMp: number; anim: 'NONE' | 'LUNGE_ALLY' | 'LUNGE_ENEMY' | 'HIT'
  }>>({})
  const slashBanner = ref<{ text: string; sub: string; isUlt: boolean; isAlly: boolean; key: number; sanskrit?: true } | null>(null)
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
      const forged = player.value.equipmentForge?.items[id]
      const stars = forged?.stars ?? 0
      const details = itemBonusLabels(temperedItem(it, stars))
      const roll = player.value.equipmentAffixes?.[id]
      if (roll) details.push(`${trialAffixQuality(it, roll)} · ${trialAffixLabel(it, roll)}`)
      if (forged?.secondary) details.push(`副词条 · ${formatBattleStatBonuses({ [forged.secondary.stat]: forged.secondary.value })}`)
      if (it.signatureEffect) details.push(it.signatureEffect)
      const set = it.setId ? trialSetOf(it.setId) : undefined
      const sectSet = it.setId ? sectEquipmentSetOf(it.setId) : undefined
      if (sectSet) details.push(`${sectSet.name}（${sectSet.parts.length}件）${sectSet.bonus}`)
      if (set) {
        const tierKeys = { 2: 'two', 4: 'four', 6: 'six' } as const
        for (const bonus of set.battleBonuses ?? []) {
          details.push(`${set.name}（${bonus.pieces}件）${set.bonuses[tierKeys[bonus.pieces]]}`)
        }
      }
      openInspect({
        title: `【${it.name}】${stars ? ` +${stars} 星` : ''}`,
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
    claimedNodeIds.value = snapshot.rewardedChapters ?? []
    storyFlags.value = storyProgressFlags(claimedNodeIds.value, snapshot.player.storyFlags)
    resolvedAdventureIds.value = Object.keys(snapshot.player.storyAdventureChoices ?? {})
    if (snapshot.player.storySnakeChoice) resolvedAdventureIds.value.push(STORY_SNAKE_ADVENTURE.id)
    learnedSkills.value = snapshot.learnedSkills
    ownedItemIds.value = snapshot.ownedItemIds
    openedAcupointIds.value = snapshot.openedAcupointIds ?? snapshot.player.openedAcupointIds ?? legacyAcupoints(snapshot.player.realmTier)
    pillInventory.value = { ...(snapshot.pillInventory ?? snapshot.player.acupointPills ?? { pozhang_dan: snapshot.pillCount }) }
    herbInventory.value = snapshot.player.alchemy?.herbs ?? {}
    alchemyPity.value = snapshot.player.alchemy?.pity ?? {}
    furnaceResidue.value = snapshot.player.alchemy?.residue ?? 0
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
      if (team) requestedRaidId.value = team.raidId
      if (invitation && invitation.id !== previous.invitation?.id) showToast(`「${invitation.leaderNickname}」邀你组队，右侧江湖栏可以回应`, 'gold')
      if (team && team.id !== previous.team?.id) openRaidLobby()
    } else if (event.event === 'RAID_REPORT') {
      playRaidReport(event.data)
    } else if (event.event === 'DUEL_INVITE') {
      duelInvite.value = event.data
      if (event.data?.invitee.id === player.value.id) showToast(`「${event.data.inviter.nickname}」递来切磋请帖`, 'gold')
    } else if (event.event === 'DUEL_REPORT') {
      if (isBattlePlaying.value) pendingDuelReport.value = event.data
      else playDuelReport(event.data)
    }
  }

  function clearRoom() {
    nearbyPlayers.value = []
    roomCount.value = 0
    duelInvite.value = null
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
      pendingDuelReport.value = null
      lastDuelBattleId = null
      inspectModal.value = null
      confirmDialog.value = null
      mobileDrawer.value = 'NONE'
      activeTab.value = 'CULTIVATE'
      jianghuTab.value = 'STORY'
      bountyTargetId.value = undefined
      raidLobby.value = { team: null, invitation: null }
      raidLobbyBusy.value = false
      requestedRaidId.value = 'shaoshi'
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
      const current = snapshot.serverTime + Math.max(0, now - receivedAt)
      const amountAt = (time: number, rate: number) => idleQiNumerator(snapshot.player.lastSettleAt, time, rate, snapshot.coCultivation)
      const gained = (rate: number, scale: bigint, divisor: bigint) => Number(
        amountAt(current, rate) * scale / divisor - amountAt(snapshot.serverTime, rate) * scale / divisor,
      )
      return {
        gainedQi: snapshot.idlePreview.pendingQi + gained(snapshot.soloQiPerHour, 1n, 3_600_000n),
        gainedSilver: snapshot.idlePreview.pendingSilver + gained(snapshot.soloSilverBasis ?? snapshot.soloQiPerHour, 28n, 360_000_000n),
      }
    }
    const elapsedSec = Math.max(60, Math.floor((now - player.value.lastSettleAt) / 1000))
    const cappedHours = Math.min(12, elapsedSec / 3600)
    const gainedQi = Math.max(480, Math.round(effectiveQiPerHour.value * cappedHours))
    const gainedSilver = gaibangSilverGain(player.value, Math.max(150, Math.round(Math.round(mockIdleRates.value.silverBasis * cappedHours) * 0.28)))
    return { gainedQi, gainedSilver }
  }

  // 1. 惰性离线挂机收益结算（对应后端 POST /api/v1/cultivate/settle）
  function settleOfflineQi() {
    if (!IS_MOCK_MODE) return online.action<IdleGain>('POST', '/cultivate/settle', undefined, (result) => {
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
      else if (!result.drops?.length && !result.forgeMaterials && !result.patrolCache) showToast('还没攒够可领的收益')
      for (const drop of result.drops ?? []) logTrialDrop(drop)
      if (result.forgeMaterials) logForgeMaterials(result.forgeMaterials)
      if (result.patrolCache) logPatrolCache(result.patrolCache)
      for (const [id, gain] of Object.entries(result.reunionClues ?? {})) {
        appendLog('ADVENTURE', [
          { type: 'tag', text: '闭关打听', tone: 'jade' },
          { type: 'text', text: ` 得到${COMPANIONS[id].name}的寻访线索 +${gain}` },
        ])
      }
    })
    const now = Date.now()
    settleMockIdle(now, true)
    mockSettlePatrol(now)
  }

  function settleMockIdle(now: number, claim = false) {
    const elapsedSec = Math.max(0, Math.floor((now - player.value.lastSettleAt) / 1000))
    const hours = Math.min(12, elapsedSec / 3600)
    const { gainedQi, gainedSilver } = claim ? getIdleRewards(now) : {
      gainedQi: Math.round(mockIdleRates.value.qi * hours),
      gainedSilver: gaibangSilverGain(player.value, Math.round(Math.round(mockIdleRates.value.silverBasis * hours) * 0.28)),
    }
    player.value.qiExp += gainedQi
    player.value.silver += gainedSilver
    player.value.lastSettleAt = now
    onOfflineSettled(elapsedSec)

    // 巡历挂机顺路采获当前地图药材
    const mapHerbs = claim ? getMapHerbs(player.value.currentMapId) : []
    const gainedHerbList: string[] = []
    if (mapHerbs.length > 0) {
      const dropCount = Math.floor(Math.random() * 2) + 1
      for (let i = 0; i < dropCount; i++) {
        const h = mapHerbs[Math.floor(Math.random() * mapHerbs.length)]
        herbInventory.value[h.id] = (herbInventory.value[h.id] ?? 0) + 1
        gainedHerbList.push(h.name)
      }
    }
    if (gainedQi || gainedSilver || gainedHerbList.length) showIdleGain({ gainedQi, gainedSilver }, gainedHerbList)
  }

  function settleMockBeforeLoadoutChange(next: LoadoutPresetDTO) {
    const rate = cultivationRates(player.value, next, collectionBonus.value.idleQiPct)
    if (rate.qi !== mockIdleRates.value.qi || rate.silverBasis !== mockIdleRates.value.silverBasis) {
      const now = Date.now()
      if (now > player.value.lastSettleAt) settleMockIdle(now)
    }
  }

  function changeMockKarma(delta: number, now = Date.now()) {
    const p = player.value
    const prior = p.stats.karma
    const preset = currentLoadout.value
    const karma = karmaAfterEvent(prior, delta, preset.headId)
    if (now > p.lastSettleAt && cultivationRate({ ...p, stats: { ...p.stats, karma } }, preset, collectionBonus.value.idleQiPct) !== mockIdleRates.value.qi) {
      settleMockIdle(now)
    }
    p.stats.karma = karma
    return karma - prior
  }

  function showIdleGain({ gainedQi, gainedSilver }: IdleGain, herbs: string[] = []) {
    const herbNote = herbs.length ? `，巡历采获【${herbs.join('、')}】` : ''
    appendLog('CULTIVATE', [
      { type: 'tag', text: '修行收益', tone: 'jade' },
      { type: 'text', text: ` 领到 ${gainedQi.toLocaleString()} 真气和 ${gainedSilver.toLocaleString()} 两纹银${herbNote}。` },
    ])
    showToast(`已领 ${gainedQi.toLocaleString()} 真气、${gainedSilver.toLocaleString()} 纹银${herbs.length ? '及草药' : ''}`, 'gold')
  }

  // 修行操作在试玩和联机使用同一套经脉与丹药规则。
  function progressCultivation(input: Parameters<typeof cultivatePlayer>[3]) {
    function announce(result: CultivationResult) {
      let message: string
      let tone: ToastTone = 'gold'
      if (result.action === 'level') message = `升到了 ${result.level} 级。`
      else if (result.action === 'break') {
        if (result.success) message = `突破成功，已踏入「${currentRealm.value.name}」。`
        else {
          message = result.protectedByPill
            ? `冰魄护心丹护住心脉，下次突破保底 +${result.pityAdded} 个百分点。`
            : `突破受阻，气血微沸 15 分钟。下次突破保底 +${result.pityAdded} 个百分点。`
          tone = result.protectedByPill ? 'info' : 'danger'
        }
      } else {
        const points = result.opened.map((id) => ACUPOINTS.find((point) => point.id === id)?.name ?? id).join('、')
        const spent = result.pillId ? `服下「${MEDICINES[result.pillId].name}」` : `消耗 ${result.spentQi.toLocaleString()} 真气`
        const bonus = result.pillId === 'shaolin_xiaohuan_dan' ? '，根骨 +6，内力上限 +300'
          : result.pillId === 'jiuzhuan_tongqiao_dan' ? '，六维各 +12' : ''
        message = `${spent}，贯通${points}${bonus}。`
      }
      appendLog('CULTIVATE', [{ type: 'text', text: message }])
      showToast(message, tone)
    }
    if (!IS_MOCK_MODE) return online.action<CultivationResult>('POST', '/cultivate/progress', {
      ...input, expectedTier: player.value.realmTier,
    }, announce)
    const now = Date.now()
    const result = cultivatePlayer(player.value, currentLoadout.value, pillInventory.value, input, now, Math.random, () => {
      if (now > player.value.lastSettleAt) settleMockIdle(now)
    })
    if ('error' in result) showToast(result.error, 'danger')
    else announce(result)
  }

  function upgradeLevel() {
    return progressCultivation({ action: 'level' })
  }

  function pierceAcupoint(pointId: string, pillId?: string) {
    return progressCultivation({ action: 'pierce', pointId, usePill: pillId === 'tongmai_dan' })
  }

  function useAcupointPill(pillId: string) {
    if (pillId === 'pozhang_dan' || pillId === 'bingpo_huxin_dan') {
      selectTab('CULTIVATE')
      return
    }
    return progressCultivation({ action: 'pill', pillId })
  }

  function attemptBreakthrough(usePill: boolean) {
    return progressCultivation({ action: 'break', usePill })
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
    if (!meetsItemStatRequirement(it, player.value.stats)) return
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
      if (k === 'karma') {
        const gained = changeMockKarma(v)
        if (gained) delta.push(`${STAT_LABEL[k]} ${signed(gained)}`)
      } else {
        p.stats[k] += v
        delta.push(`${STAT_LABEL[k]} ${signed(v)}`)
      }
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
      const silver = gaibangSilverGain(p, r.silver)
      p.silver += silver
      delta.push(`纹银 ${signed(silver)}`)
    }
    if (r.pills) {
      pillCount.value += r.pills
      delta.push(`${MEDICINES.pozhang_dan.name} +${r.pills}`)
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

  function resolveAdventureChoice(choice: 'A' | 'B', adventureId: string | null) {
    const tpl = adventureId ? adventureById(adventureId) : undefined
    const c = tpl?.choices.find((x) => x.key === choice)
    if (!tpl || !c || isBattlePlaying.value || resolvedAdventureIds.value.includes(tpl.id)) return
    const snake = tpl.id === STORY_SNAKE_ADVENTURE.id
    if (snake && (player.value.storySnakeChoice || player.value.maxChapterId <= tpl.afterNodeId)) return
    if (!IS_MOCK_MODE) {
      if (snake || !claimedNodeIds.value.includes(tpl.afterNodeId)) return
      return online.action<StoryAdventureResult>('POST', `/story/adventures/${tpl.id}`, { choice }, ({ report, narration }) => {
        if (report) startBattlePlayback(report)
        else if (narration) appendLog('ADVENTURE', narration)
      })
    }
    const ctx = adventureCtx()
    if (!choiceAvailable(c, ctx)) {
      showToast(c.costSilver && ctx.silver < c.costSilver ? '纹银不足！' : (c.requirementText ?? '条件未满足'), 'danger')
      return
    }
    const reward = typeof c.reward === 'function' ? c.reward(ctx) : c.reward
    const complete = () => {
      if (resolvedAdventureIds.value.includes(tpl.id)) return
      if (c.costSilver) player.value.silver -= c.costSilver
      resolvedAdventureIds.value.push(tpl.id)
      if (snake) player.value.storySnakeChoice = choice
      if (pendingAdventureId.value === tpl.id) pendingAdventureId.value = null
      const queued = adventureQueue.value.indexOf(tpl.id)
      if (queued >= 0) adventureQueue.value.splice(queued, 1)
      applyReward(reward)
      pumpAdventureQueue()
    }
    const battle = c.battle
    if (!battle) return complete()

    const encounter = adventureEncounter(battle)
    if (!encounter) return
    const report = simulateServerBattle({
      sceneTitle: tpl.title, mode: 'SOLO_STORY', player: player.value, loadout: currentLoadout.value,
      learnedSkills: learnedSkills.value, ...encounter,
    })
    addAdventureObjective(report, tpl, encounter)
    startBattlePlayback(report, null, complete)
  }

  function resolveAdventure(choice: 'A' | 'B') {
    resolveAdventureChoice(choice, pendingAdventureId.value)
  }

  function chooseStorySnake(chapterId: number, choice: StorySnakeChoice) {
    if (isBattlePlaying.value || player.value.storySnakeChoice || chapterId > player.value.maxChapterId) return
    const chapters = IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS
    if (chapters.find((chapter) => chapter.id === chapterId)?.code !== STORY_SNAKE_ADVENTURE.chapterCode) return
    if (IS_MOCK_MODE) return resolveAdventureChoice(choice, STORY_SNAKE_ADVENTURE.id)
    return online.action<StorySnakeChoiceResult>('POST', `/story/${STORY_SNAKE_ADVENTURE.chapterCode}/adventure`, { choice }, (result) => {
      if (!result.firstPick) return
      const { tag, tone, text } = STORY_SNAKE_ADVENTURE.choices[result.choice].reward
      appendLog('ADVENTURE', [{ type: 'tag', text: tag, tone }, { type: 'text', text: ` ${text}` }])
      showToast(tag, tone === 'gold' ? 'gold' : 'info')
    })
  }

  // ==================== 战斗播放器引擎 ====================
  const initialUnitState = (unit: CombatUnitDTO) => ({
    hp: unit.hp, maxHp: unit.maxHp, rage: unit.rage, mp: unit.maxMp, maxMp: unit.maxMp, anim: 'NONE' as const,
  })
  function startBattlePlayback(report: BattleReportDTO, storyNodeId: number | null = null, onWin: (() => void) | null = null) {
    if (battleTimer) clearTimeout(battleTimer)
    if (IS_MOCK_MODE) spendBattleMedicines(player.value, report)
    mobileDrawer.value = 'NONE'
    activeBattle.value = report
    battleOpponentEntry.value = undefined
    activeChapterId.value = storyNodeId
    battleOnWin = onWin
    battleEventCursor.value = 0
    isBattlePlaying.value = true
    slashBanner.value = null
    floatingPopups.value = {}

    liveUnitStates.value = Object.fromEntries(report.units.map((unit) => [unit.slot, initialUnitState(unit)]))
    stepNextBattleEvent()
  }

  function applyBattleEvent(event: BattleEventDTO) {
    if (event.opponentEntry) {
      const entry = event.opponentEntry
      battleOpponentEntry.value = entry
      for (const slot of Object.keys(liveUnitStates.value)) {
        if (slot.startsWith('ENEMY')) delete liveUnitStates.value[slot]
      }
      for (const unit of [entry.unit, ...(entry.guards ?? [])]) liveUnitStates.value[unit.slot] = initialUnitState(unit)
    }
    const actor = liveUnitStates.value[event.actorSlot]
    const target = event.targetSlot ? liveUnitStates.value[event.targetSlot] : undefined
    const rageTarget = liveUnitStates.value[event.rageTargetSlot ?? event.actorSlot]
    if (target && event.hpDelta) {
      target.hp = Math.max(0, Math.min(target.maxHp, target.hp + event.hpDelta))
    }
    if (actor && event.reflectDelta) actor.hp = Math.max(0, actor.hp + event.reflectDelta)
    if (rageTarget && event.rageDelta) {
      rageTarget.rage = Math.max(0, Math.min(100, rageTarget.rage + event.rageDelta))
    }
    if (actor && event.mpDelta) actor.mp = Math.max(0, Math.min(actor.maxMp, actor.mp + event.mpDelta))
    appendLog('BATTLE', [{ type: 'tag', text: `第 ${event.round} 回合`, tone: 'red' }, { type: 'text', text: ' ' }, ...event.segments])
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
    const actorUnit = battleUnits.value.find((unit) => unit.slot === ev.actorSlot)
    if (ev.trueStrikeSourceId === 'jiuyin_sanskrit') {
      slashBanner.value = { text: '阴阳相济', sub: `${actorUnit?.name ?? '侠客'} · ${ev.skillName ?? '出招'}`,
        isUlt: true, isAlly: ev.actorSlot.startsWith(activeBattle.value.perspective ?? 'ALLY'), key: frameKey, sanskrit: true }
    } else if (ev.skillName) {
      slashBanner.value = {
        text: ev.skillName,
        sub: `${actorUnit?.name ?? '侠客'} · ${ev.isUlt ? '使出绝技' : ev.type === 'ASSIST_ATTACK' ? '伙伴追击' : '出招'}`,
        isUlt: !!ev.isUlt,
        isAlly: ev.actorSlot.startsWith('ALLY'),
        key: frameKey,
      }
    } else if (ev.type === 'STANCE_CLASH') {
      const { allyStance, enemyStance, advantage } = battleOpponentEntry.value?.stanceBanner ?? activeBattle.value.stanceBanner
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

    // 驱动攻击、受击与气血飘字
    const actor = liveUnitStates.value[ev.actorSlot]
    if (actor && ev.type !== 'STANCE_CLASH' && ev.type !== 'BOSS_ENRAGE' && ev.type !== 'EFFECT' && ev.type !== 'DOT_TICK') {
      actor.anim = ev.actorSlot.startsWith('ALLY') ? 'LUNGE_ALLY' : 'LUNGE_ENEMY'
    }
    if (ev.targetSlot && liveUnitStates.value[ev.targetSlot]) {
      if (ev.hitResult === 'DODGE') {
        nextPopups[ev.targetSlot] = { text: '闪避', isCrit: false, category: 'dodge', key: frameKey }
      } else if (ev.hpDelta) {
        const target = liveUnitStates.value[ev.targetSlot]
        if (ev.hpDelta < 0) target.anim = 'HIT'
        const dmgSeg = ev.segments.find((s) => s.type === 'damage')
        const cat = dmgSeg && dmgSeg.type === 'damage' ? dmgSeg.category : 'outer'
        const label = DAMAGE_POPUP_LABELS[cat] ?? (ev.hitResult === 'CRIT' ? '暴击 ' : '')
        nextPopups[ev.targetSlot] = {
          text: `${ev.hpDelta > 0 ? '+' : label}${ev.hpDelta.toLocaleString()}`,
          isCrit: ev.hitResult === 'CRIT',
          category: cat,
          key: frameKey,
        }
      } else if (ev.shieldAbsorbed) {
        nextPopups[ev.targetSlot] = { text: `护盾吸收 ${ev.shieldAbsorbed.toLocaleString()}`, isCrit: false, category: 'shield', key: frameKey }
      }
    }
    if (ev.reflectDelta && actor) {
      nextPopups[ev.actorSlot] = {
        text: `反伤 ${ev.reflectDelta.toLocaleString()}`,
        isCrit: false,
        category: 'reflect',
        key: frameKey + 1,
      }
    }
    floatingPopups.value = nextPopups

    applyBattleEvent(ev)

    const delay = battleSpeed.value === 2 ? 480 : 920
    battleTimer = setTimeout(stepNextBattleEvent, delay)
  }

  function skipBattleToEnd() {
    if (!activeBattle.value) return
    if (battleTimer) clearTimeout(battleTimer)
    while (battleEventCursor.value < activeBattle.value.events.length) {
      const ev = activeBattle.value.events[battleEventCursor.value]
      battleEventCursor.value += 1
      applyBattleEvent(ev)
    }
    finishBattleSettlement()
  }

  function finishBattleSettlement() {
    if (!activeBattle.value || !isBattlePlaying.value) return
    isBattlePlaying.value = false
    slashBanner.value = null
    floatingPopups.value = {}
    const report = activeBattle.value
    const won = report.winner === (report.perspective ?? 'ALLY')
    const duel = report.mode === 'PVP_HUASHAN' || report.mode === 'PVP_AMBUSH'
    if (IS_MOCK_MODE) creditBattleEffectLoot(player.value, report)
    if (won && report.rewards) {
      if (IS_MOCK_MODE) {
        player.value.qiExp += report.rewards.qiExp
        player.value.silver += report.rewards.silver
        if (report.rewards.sectContrib) player.value.sectContribution += report.rewards.sectContrib
        if (report.rewards.title === CHAPTER_ONE_TITLE) player.value.chapterOneChampion = true
      }

      const itemSegs: RichSegment[] = []
      if (report.rewards.items) {
        for (const drop of report.rewards.items) {
          if (SKILLS[drop.id]) {
            if (IS_MOCK_MODE) learnSkill(drop.id)
            itemSegs.push({ type: 'skill', id: drop.id, name: `《${drop.name}》`, tier: drop.tier })
          } else if (ITEMS[drop.id]) {
            if (IS_MOCK_MODE) gainItem(drop.id)
            itemSegs.push({ type: 'item', id: drop.id, name: `【${drop.name}】`, tier: drop.tier, isTrueUnique: ITEMS[drop.id].isTrueUnique })
          }
        }
      }

      const resources = report.rewards.qiExp || report.rewards.silver
      const recruitSegs: RichSegment[] = (report.rewards.companions ?? []).flatMap((id) => {
        const companion = COMPANIONS[id]
        return companion ? [{ type: 'text', text: ' ' }, { type: 'actor', name: companion.name, isAlly: true }, { type: 'text', text: '入队。' }] : []
      })
      appendLog('BATTLE', [
        { type: 'tag', text: '获胜', tone: 'gold' },
        { type: 'text', text: resources
          ? ` 「${report.sceneTitle}」告捷，领到 ${report.rewards.qiExp.toLocaleString()} 真气和 ${report.rewards.silver.toLocaleString()} 两纹银。 `
          : ` 「${report.sceneTitle}」告捷${itemSegs.length ? '，领到 ' : '。'}` },
        ...itemSegs,
        ...recruitSegs,
        ...(report.rewards.title ? [{ type: 'tag' as const, text: report.rewards.title, tone: 'gold' as const }] : []),
      ])
      showToast(report.mode === 'SECT_TRIAL' ? '门派考核通过' : !resources ? '战斗奖励已领取' : IS_MOCK_MODE
        ? `打赢了！真气 +${report.rewards.qiExp.toLocaleString()}`
        : report.mode === 'COOP_3P' ? '副本奖励已到账' : duel ? '比武收益已到账' : '首胜奖励已到账', 'gold')
    } else if (!IS_MOCK_MODE && won) {
      showToast(duel ? '比武告捷' : '打赢了，这关奖励已领过', 'gold')
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
    } else if (!won) {
      battleOnWin = null
      if (report.retreated) {
        appendLog('BATTLE', [{ type: 'tag', text: '撤退', tone: 'jade' }, { type: 'text', text: ` 从「${report.sceneTitle}」脱身，未结算通关奖励。` }])
        showToast('已脱身，可重新挑战。', 'info')
        return
      }
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
    battleOpponentEntry.value = undefined
    activeChapterId.value = null
    battleOnWin = null
    isBattlePlaying.value = false
    slashBanner.value = null
    floatingPopups.value = {}
    const report = pendingDuelReport.value
    if (report) {
      pendingDuelReport.value = null
      playDuelReport(report)
    }
  }

  function selectTab(tab: MainTab) {
    activeTab.value = tab
    mobileDrawer.value = 'NONE'
    if (activeBattle.value && !isBattlePlaying.value) closeBattleStage()
  }

  // ==================== 江湖地图、章节推进与多人交互 ====================
  function moveMap(mapId: string, action?: 'depart' | 'arrive') {
    const m = MAPS.find((x) => x.id === mapId)
    if (!m || mapId === player.value.currentMapId) return
    if (action !== 'arrive' && !canTravelTo(m)) {
      const hint = IS_MOCK_MODE ? m.unlockHint : m.onlineUnlockHint
      showToast(`【${m.name}】尚未开放：${hint ?? '请先推进主线'}`, 'danger')
      return
    }
    if (!IS_MOCK_MODE) {
      return online.action<MapMoveResult>('POST', '/map/move', { mapId, action }, (result) => {
        if (result.journey) return announceDeparture(m.name)
        if (result.gainedQi || result.gainedSilver) showIdleGain(result)
        finishVoyage(mapId, result.voyage)
      })
    }
    const now = Date.now()
    const journey = player.value.mapJourney
    if (action === 'arrive') {
      if (journey?.mapId !== mapId || journey.arrivesAt > now) return showToast('请等行程结束再抵达', 'info')
      delete player.value.mapJourney
    } else if (journey) {
      return showToast('请先抵达当前行程的目的地', 'info')
    } else if (action === 'depart' || cityInspectionDue(player.value, mapId, currentLoadout.value, now)) {
      onlineClock.value = now
      player.value.mapJourney = planMapJourney(player.value, mapId, currentLoadout.value, now)
      if (player.value.mapJourney.inspected) player.value.lastCityInspectionAt = now
      return announceDeparture(m.name)
    }
    const voyage = resolveSeaVoyage(player.value.currentMapId, mapId, currentLoadout.value.accId, player.value.silver, now)
    if (voyage?.status === 'WRECK') {
      player.value.silver -= voyage.silverLost
      finishVoyage(mapId, voyage)
      return
    }
    settleOfflineQi()
    accrueReunionWait()
    player.value.currentMapId = mapId
    mapArrivedAt.value = Date.now()
    player.value.coCultivatePartner = null
    nearbyPlayers.value = generateRoomPlayers(mapId)
    finishVoyage(mapId, voyage)
  }

  function travelTo(mapId: string) {
    return moveMap(mapId, 'depart')
  }

  function announceDeparture(name: string) {
    const seconds = journeySeconds.value
    const inspected = player.value.mapJourney?.inspected
    if (inspected) appendLog('JIANGHU', [
      { type: 'tag', text: '临安守军盘查', tone: 'red' },
      { type: 'text', text: ' 守军认出赤炼阎罗，查验耽搁了 5 秒。' },
    ])
    showToast(`${inspected ? '守军盘查，' : ''}已出发前往【${name}】，约 ${seconds} 秒后可抵达`, 'info')
  }

  function finishVoyage(mapId: string, voyage?: VoyageResult) {
    if (voyage?.status === 'WRECK') {
      const loss = voyage.silverLost ? `，救援花费 ${voyage.silverLost.toLocaleString()} 两纹银` : ''
      const notice = `海船遇险，已返回出发地${loss}。`
      appendLog('JIANGHU', [{ type: 'tag', text: '海难', tone: 'red' }, { type: 'text', text: ` ${notice}` }])
      showToast(notice, 'danger')
      return
    }
    const m = MAPS.find((x) => x.id === mapId)!
    const welcome = m.id === 'chongyang_hall' && jianghuTitle.value?.id === 'title_chongyang' ? ' 道童称你一声师叔，请你入殿。'
      : (m.id === 'taohua_isle' || m.id === 'linan_manor') && jianghuTitle.value?.id === 'title_bihai' ? ' 门前仆从认出逍遥狂生，请你入内。' : ''
    appendLog('JIANGHU', [
      ...(voyage?.status === 'PROTECTED' ? [{ type: 'tag', text: '东海鲛人定风珠 · 平安渡海', tone: 'jade' } as const] : []),
      { type: 'tag', text: m.safety === 'PEACE' ? '和平区' : '可劫镖', tone: m.safety === 'PEACE' ? 'jade' : 'red' },
      { type: 'text', text: ` 你来到了「${m.name}」。${m.ambientDesc}${welcome}` },
    ])
    if (voyage?.status === 'PROTECTED') showToast(`定风珠护航，已抵达【${m.name}】`, 'gold')
    else showToast(`已踏入【${m.name}】`, m.safety === 'CONTESTED' ? 'danger' : 'info')
  }

  function challengeChapter(chapterId: number, retreat = false) {
    if (isBattlePlaying.value) return
    const ch = (IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS).find((c) => c.id === chapterId)
    if (!ch) return
    if (chapterId > player.value.maxChapterId) {
      showToast('先打过上一关，就能挑战这里。', 'danger')
      return
    }
    const intro: RichSegment[] = [
      { type: 'tag', text: ch.code, tone: ch.isBoss ? 'red' : 'gold' },
      { type: 'text', text: ` ${ch.intro}` },
    ]
    if (!IS_MOCK_MODE) {
      return online.action<StoryChallengeResult>('POST', `/story/${ch.code}/challenge`, retreat ? { retreat } : undefined, ({ report }) => {
        appendLog('JIANGHU', intro)
        startBattlePlayback(report)
      })
    }
    const drops = getChapterDrops(ch)
      .filter((drop) => drop.kind === 'item' ? !ownedItemIds.value.includes(drop.id) : !learnedSkills.value[drop.id])
      .map(({ id, name, tier }) => ({ id, name, tier }))
    if ((chapterId === 12 || chapterId === 16) && (chapterId === 12 ? claimedNodeIds.value.includes(16) : claimedNodeIds.value.includes(12))
      && companionAffinity.value.huangrong?.recruited && !ownedItemIds.value.includes('jiuyin_sanskrit')) {
      const { id, name, tier } = ITEMS.jiuyin_sanskrit
      drops.push({ id, name, tier })
    }

    appendLog('JIANGHU', intro)

    const report = simulateServerBattle({
      sceneTitle: `${ch.code} ${ch.title}`,
      mode: 'SOLO_STORY',
      tryRetreat: retreat,
      player: player.value,
      loadout: currentLoadout.value,
      ...storyEncounter(ch, player.value.storySnakeChoice, ch.isBoss),
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
    const silver = gaibangSilverGain(player.value, quest.rewardSilver)
    player.value.qiExp += quest.rewardQi
    player.value.silver += silver
    if (quest.rewardPillId) {
      pillInventory.value[quest.rewardPillId] = (pillInventory.value[quest.rewardPillId] ?? 0) + 1
    }
    ftue.value.claimed.push(quest.id)
    ftue.value.index = Math.min(FTUE_QUESTS.length, ftue.value.index + 1)
    saveFtue()
    appendLog('JIANGHU', [
      { type: 'tag', text: '江湖行历', tone: 'gold' },
      { type: 'text', text: ` 达成「${quest.title}」，领得真气 ${quest.rewardQi.toLocaleString()}、纹银 ${silver.toLocaleString()}${quest.rewardPillId ? '，并获赠一枚丹药' : ''}。` },
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
      encounters: patrolEncounterCount(player.value.trial, stageId),
    }
  }

  /** 本地试玩版惰性巡历：进度、章末复战与 30 分钟一次的小怪掉落 */
  function mockSettlePatrol(now = Date.now()) {
    if (!IS_MOCK_MODE) return
    const t = player.value.trial
    const encounters = advancePatrol(t, now, patrolEncounterRate(currentLoadout.value.accId))
    if (!encounters) return
    const stage = trialStageOf(t.selectedStageId)
    if (!stage) return
    forgeMaterials(player.value, encounters, encounters)
    for (let i = 0; i < encounters; i++) {
      const roll = rollTrialDrop(stage, 'PATROL')
      if (roll) logTrialDrop(awardMockTrialDrop(stage, roll, now))
    }
    const cache = settlePatrolCaches(player.value, currentLoadout.value, encounters, now)
    if (cache) logPatrolCache(cache)
    logForgeMaterials(encounters)
  }

  function logPatrolCache(reward: NonNullable<IdleGain['patrolCache']>) {
    appendLog('CULTIVATE', [{ type: 'tag', text: '秘境宝箱', tone: 'gold' },
      { type: 'text', text: ` 巡历发现 ${reward.count} 个宝箱，获得 ${reward.silver.toLocaleString()} 两纹银。` }])
  }

  function openQusanCache() {
    if (!ownedItemIds.value.includes(QUSAN_CACHE_KEY)) return
    function announce({ skillId, count }: { skillId: string; count: number }) {
      const skill = SKILLS[skillId]
      appendLog('JIANGHU', [{ type: 'tag', text: '曲三酒馆暗格', tone: 'purple' },
        { type: 'skill', id: skillId, name: `《${skill.name}》`, tier: skill.tier },
        { type: 'text', text: ` 残页 +1，现有 ${count} 张。` }])
      showToast(`取得《${skill.name}》残页 1 张。`, 'gold')
    }
    if (!IS_MOCK_MODE) return online.action<{ skillId: string; count: number }>('POST', '/trial/qusan-cache', undefined, announce)
    const result = searchQusanCache(player.value, currentLoadout.value, Date.now())
    if ('error' in result) return showToast(result.error)
    announce(result)
  }

  function logForgeMaterials(count: number) {
    appendLog('CULTIVATE', [{ type: 'tag', text: '巡历材料', tone: 'gold' },
      { type: 'text', text: ` 获得${forgeMaterialLabel(count, count)}。` }])
  }

  function changeEquipmentForge(input: ForgeInput) {
    const item = ITEMS[input.itemId]
    const index = ownedItemIds.value.indexOf(input.itemId)
    if (!item || index < 0) return
    function announce(result: ForgeResult) {
      const name = `【${item.name}】`
      const message = result.action === 'temper'
        ? result.success ? `${name}淬炼至 +${result.stars} 星，消耗${forgeMaterialLabel(result.iron, result.stones)}。`
          : `${name}淬炼失败，消耗 ${result.stones} 枚淬火石，累计保底 +${result.pity} 个百分点。`
        : result.action === 'salvage' ? `分解${name}，获得${forgeMaterialLabel(result.iron, result.stones)}。`
        : `${name}重铸完成，${trialAffixLabel(item, result.affixRoll)}，${formatBattleStatBonuses({ [result.secondary.stat]: result.secondary.value })}。`
      appendLog('CULTIVATE', [{ type: 'text', text: message }])
      showToast(message, 'gold')
    }
    if (!IS_MOCK_MODE) return online.action<ForgeResult>('POST', '/equipment/forge', input, announce)
    const now = Date.now()
    mockSettlePatrol(now)
    const result = forgeEquipment(player.value, item, input, {
      presets: Object.values(presets.value), now,
      settle: () => { if (now > player.value.lastSettleAt) settleMockIdle(now) },
    })
    if ('error' in result) return showToast(result.error)
    if (result.action === 'salvage') ownedItemIds.value.splice(index, 1)
    announce(result)
  }

  function awardMockTrialDrop(
    stage: NonNullable<ReturnType<typeof trialStageOf>>, roll: NonNullable<ReturnType<typeof rollTrialDrop>>, now: number,
  ) {
    if (now > player.value.lastSettleAt && upgradesPatrolYield(player.value, currentLoadout.value, roll)) settleMockIdle(now)
    return collectTrialDrop(player.value, ownedItemIds.value, stage, roll, now)
  }

  function logTrialDrop(drop: TrialDropDTO) {
    appendLog('CULTIVATE', [
      { type: 'tag', text: '巡历掉落', tone: 'gold' },
      { type: 'text', text: ` ${trialDropLabel(drop)}` },
    ])
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
    switchPatrolStage(player.value.trial, stageId)
    showToast(`已改在「第 ${stage.code} 关」巡历`, 'info')
  }

  function challengeTrialStage(stageId: number, answer?: string, retreat = false) {
    if (!IS_MOCK_MODE) {
      if (isBattlePlaying.value) return
      return online.action<TrialChallengeResult>('POST', `/trial/${stageId}/challenge`, retreat ? { answer, retreat } : answer === undefined ? undefined : { answer }, ({ report, firstClear, drops }) => {
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
    const drops = trialRewardItems(stage, firstClear, ownedItemIds.value, {
      rewardedStageIds: t.rewardedStageIds, answer, huangrongRecruited: !!companionAffinity.value.huangrong?.recruited,
    })
    const skill = stage.clearSkillId && !learnedSkills.value[stage.clearSkillId] ? SKILLS[stage.clearSkillId] : undefined
    const recruits = stage.clearCompanionIds?.filter((id) => !companionAffinity.value[id]?.recruited) ?? []
    const rewards = firstClear || drops.length || skill || recruits.length ? {
      qiExp: firstClear ? Math.round(stage.boss.hp * 2) : 0,
      silver: firstClear ? enemySilverReward(stage.boss.hp) : 0,
      items: [...drops, ...(skill ? [skill] : [])].map(({ id, name, tier }) => ({ id, name, tier })),
      ...(recruits.length ? { companions: recruits } : {}),
    } : undefined
    const report = simulateServerBattle({
      sceneTitle: `${stage.code} ${stage.title}`,
      mode: 'SOLO_STORY',
      trial: true,
      tryRetreat: retreat,
      player: player.value,
      loadout: currentLoadout.value,
      environment: { ...battleEnvironmentAt(player.value.currentMapId), ...stage.environment },
      enemyMain: {
        ...stage.boss,
        mp: Math.round(stage.boss.hp * 0.45),
        isBoss: true,
      },
      enemyGuards: stage.guards,
      puzzleOutcome: trialPuzzleOutcome(stage, answer),
      surviveRounds: stage.victory === 'SURVIVE_ROUNDS' ? stage.surviveRounds : undefined,
      rewards,
    })
    awardMockChapterOneTitle(stageId, report)
    startBattlePlayback(report, null, firstClear || recruits.length ? () => {
      if (firstClear) {
        const renown = trialFirstClearKarma(stage)
        if (renown) changeMockKarma(renown)
        t.rewardedStageIds.push(stageId)
        mockSettlePatrol()
        t.stageHours[String(stageId)] = 0
        delete t.stageEncounters?.[String(stageId)]
        const next = Math.min(TRIAL_STAGES.length, stageId + 1)
        t.maxStageId = Math.max(t.maxStageId, next)
        switchPatrolStage(t, next)
      }
      if (recruits.length) recruitTrialCompanions(companionAffinity.value, [stageId])
    } : null)
  }

  function awardMockChapterOneTitle(stageId: number, report: BattleReportDTO) {
    if (stageId !== CHAPTER_ONE_FINAL_STAGE || report.winner !== 'ALLY' || player.value.chapterOneChampion) return
    announceChapterOneTitle(report)
  }

  function replayTrialBoss(stageId: number, answer?: string, retreat = false) {
    if (isBattlePlaying.value) return
    if (!IS_MOCK_MODE) {
      return online.action<TrialReplayResult>('POST', `/trial/${stageId}/replay`, retreat ? { answer, retreat } : answer === undefined ? undefined : { answer }, ({ report, drop }) => {
        if (drop) showToast(trialDropLabel(drop), 'gold')
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
      trial: true,
      tryRetreat: retreat,
      player: player.value,
      loadout: currentLoadout.value,
      environment: { ...battleEnvironmentAt(player.value.currentMapId), ...stage.environment },
      enemyMain: {
        ...stage.boss,
        mp: Math.round(stage.boss.hp * 0.45),
        isBoss: true,
      },
      enemyGuards: stage.guards,
      puzzleOutcome: trialPuzzleOutcome(stage, answer),
      surviveRounds: stage.victory === 'SURVIVE_ROUNDS' ? stage.surviveRounds : undefined,
    })
    if (report.winner === 'ALLY') {
      const drop = awardMockTrialDrop(stage, rollTrialDrop(stage, 'REPLAY')!, Date.now())
      showToast(trialDropLabel(drop), 'gold')
      t.replayHours[key] = 0
    }
    awardMockChapterOneTitle(stageId, report)
    startBattlePlayback(report)
  }

  function onlineHuashan(action: HuashanAction, refresh: () => void) {
    if (IS_MOCK_MODE || isBattlePlaying.value) return
    return online.action<HuashanResult>('POST', '/huashan', action, (result) => {
      if (result.action === 'challenge') {
        const delta = result.ratingDelta >= 0 ? `+${result.ratingDelta}` : String(result.ratingDelta)
        showToast(`论剑积分 ${result.rating}（${delta}）`, result.ratingDelta > 0 ? 'gold' : 'info')
        startBattlePlayback(result.report)
      } else if (result.action === 'claim' || result.action === 'respect') {
        showToast(`真气 +${result.qiExp.toLocaleString()}${result.silver ? ` · 纹银 +${result.silver.toLocaleString()}` : ''}`, 'gold')
      } else {
        showToast(result.action === 'mirror' ? '论剑镜像已更新' : '五绝判词已保存', 'gold')
      }
      refresh()
    })
  }

  function onlineSectContest(action: SectContestAction, refresh: () => void) {
    if (IS_MOCK_MODE || isBattlePlaying.value) return
    return online.action<SectContestResult>('POST', '/sect/contest', action, (result) => {
      if (result.action === 'challenge') {
        const delta = result.ratingDelta >= 0 ? `+${result.ratingDelta}` : String(result.ratingDelta)
        showToast(`演武积分 ${result.rating}（${delta}）`, result.ratingDelta > 0 ? 'gold' : 'info')
        startBattlePlayback(result.report)
      } else {
        showToast('演武镜像已登记', 'gold')
      }
      refresh()
    })
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
    if (hasTrialPart(ownedItemIds.value, item.id)) {
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
      await apiClient.request('POST', '/raid/team', body.action === 'invite' ? { ...body, raidId: selectedRaidId.value } : body)
    } catch (error) {
      if (player.value.id !== actor || online.phase.value !== 'ready') return
      if (error instanceof ApiError && error.status === 401) void online.logout()
      else showToast(error instanceof ApiError ? error.message : '组队连接中断，等重连后再试', 'danger')
    } finally {
      if (player.value.id === actor) raidLobbyBusy.value = false
    }
  }

  function selectRaid(raidId: RaidId) {
    const team = raidLobby.value.team
    if (!team) requestedRaidId.value = raidId
    else if (team.leaderId === player.value.id && team.raidId !== raidId) return raidTeamAction({ action: 'select', teamId: team.id, raidId })
  }

  function playRaidReport(report: BattleReportDTO) {
    if (lastRaidBattleId === report.battleId) return
    lastRaidBattleId = report.battleId
    openRaidLobby()
    startBattlePlayback(report)
  }

  function startThreePlayerCoopRaid() {
    if (isBattlePlaying.value) return
    if (!IS_MOCK_MODE) {
      const team = raidLobby.value.team
      if (!team || !online.roomConnected.value) return
      return online.action<BattleReportDTO>('POST', '/raid/start', { teamId: team.id, revision: team.revision }, playRaidReport)
    }
    const relic = nextRaidRelic.value
    const now = Date.now()
    const qiao = createStarterCharacter({ id: 'shaoshi_demo_qiao', nickname: '乔北冥', avatarId: 'hero_sword_male' }, now)
    const qingfeng = createStarterCharacter({ id: 'shaoshi_demo_qingfeng', nickname: '清风道长', avatarId: 'hero_sword_male' }, now)
    qiao.player.currentSectId = 'gaibang'
    qingfeng.player.currentSectId = 'quanzhen'
    Object.assign(qiao.player.stats, { str: 50, con: 110 })
    Object.assign(qingfeng.player.stats, { str: 36, con: 95 })
    const report = simulateShaoshiRaid(`bt_${now}`, [
      { player: player.value, loadout: currentLoadout.value, learnedSkills: learnedSkills.value, bonus: collectionBonus.value },
      {
        player: qiao.player,
        loadout: { ...qiao.presets[1], weaponId: trialPartId('jiangnan_qiguai', 'WEAPON'), innerSkillId: 'huntian_qigong', outerSkillId: 'dagou_bangfa', ultSkillId: 'kanglong_youhui' },
        learnedSkills: { huntian_qigong: 3, dagou_bangfa: 3, kanglong_youhui: 3 },
      },
      {
        player: qingfeng.player,
        loadout: { ...qingfeng.presets[2], outerSkillId: 'quanzhen_jianfa', ultSkillId: 'tonggui_jianfa' },
        learnedSkills: { ...qingfeng.learnedSkills, quanzhen_jianfa: 3, tonggui_jianfa: 3 },
      },
    ])
    if (report.winner === 'ALLY') report.rewards = {
      qiExp: SHAOSHI_RAID.rewardQi,
      silver: gaibangSilverGain(player.value, SHAOSHI_RAID.rewardSilver),
      items: relic ? [{ id: relic.id, name: relic.name, tier: relic.tier }] : [],
    }
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

    if (isBattlePlaying.value) return
    if (!IS_MOCK_MODE) {
      if (!online.roomConnected.value) return
      if (action === 'AMBUSH' && target.isBetrayerBounty) return openBountyBoard(target.id)
      return online.action<BattleReportDTO | null>('POST', '/duel', {
        action: action === 'SPAR' ? 'invite' : 'ambush', targetPlayerId: target.id,
      }, (report) => {
        if (report) playDuelReport(report)
        else showToast(`切磋请帖已送给「${target.nickname}」`, 'gold')
      })
    }

    if (action === 'AMBUSH') {
      // 强校验：和平区禁止恶意PK（唯独全服叛师红名逆徒可随时缉拿！）
      if (currentMap.value.safety === 'PEACE' && !target.isBetrayerBounty) {
        showToast('和平区不能劫镖。想劫镖可以去大漠商道或湘西黑沼。', 'danger')
        return
      }
      if (!target.isEscortingDart && !target.isBetrayerBounty) {
        showToast('这位侠客当前没有押镖。', 'info')
        return
      }
      if (!target.isBetrayerBounty) {
        player.value.shaQi += 15
        changeMockKarma(-40)
      } else {
        changeMockKarma(60)
      }
    }

    const titlePrefix =
      action === 'SPAR'
        ? `${target.id.startsWith('fg_') ? '华山论剑' : '点到为止 · 切磋'}【${target.nickname}】`
        : target.isBetrayerBounty
          ? `清理门户 · 追缉逆徒【${target.nickname}】`
          : `纷争劫镖 · 强夺【${target.nickname}】`

    const report = simulatePlayerDuel({
      battleId: `bt_${Date.now()}`,
      sceneTitle: titlePrefix,
      mode: action === 'SPAR' ? 'PVP_HUASHAN' : 'PVP_AMBUSH',
      huashan: action === 'SPAR' && target.id.startsWith('fg_') ? true : undefined,
      escort: action === 'AMBUSH' && !target.isBetrayerBounty ? true : undefined,
      lineup: [
        { player: player.value, loadout: currentLoadout.value, learnedSkills: learnedSkills.value, bonus: collectionBonus.value, companionOf },
        mockDuelOpponent(target, player.value.currentMapId),
      ],
    })
    if (report.winner === 'ALLY') report.rewards = action === 'SPAR'
      ? { qiExp: 1200, silver: gaibangSilverGain(player.value, 200) }
      : { qiExp: 4200, silver: gaibangSilverGain(player.value, target.isBetrayerBounty ? 10000 : 4800) }
    startBattlePlayback(report)
  }

  function playDuelReport(report: BattleReportDTO) {
    if (lastDuelBattleId === report.battleId) return
    lastDuelBattleId = report.battleId
    startBattlePlayback(report)
  }

  function replyDuel(accept: boolean) {
    const invite = duelInvite.value
    if (!invite || invite.invitee.id !== player.value.id || isBattlePlaying.value) return
    return online.action<BattleReportDTO | null>('POST', '/duel', { action: accept ? 'accept' : 'decline', inviteId: invite.id }, (report) => {
      duelInvite.value = null
      if (report) playDuelReport(report)
    })
  }

  function escortAction(action: 'start' | 'claim') {
    return online.action<{ silver: number }>('POST', '/escort', { action }, (result) => {
      showToast(action === 'start' ? '已接镖，15 分钟后可交镖' : `交镖完成，纹银 +${result.silver.toLocaleString()}`, 'gold')
    })
  }

  function openBountyBoard(targetId?: string) {
    bountyTargetId.value = targetId
    jianghuTab.value = 'BOUNTY'
    selectTab('JIANGHU')
  }

  function acceptBounty(entry: BountyEntryDTO) {
    if (IS_MOCK_MODE || isBattlePlaying.value) return
    return online.action<BountyEntryDTO>('POST', '/bounties/accept', { targetPlayerId: entry.targetId, expiresAt: entry.expiresAt },
      (accepted) => showToast(`已接下「${accepted.nickname}」的通缉令`, 'gold'))
  }

  function pursueBounty(entry: BountyEntryDTO) {
    if (IS_MOCK_MODE || !online.roomConnected.value || isBattlePlaying.value) return
    return online.action<BattleReportDTO>('POST', '/duel', { action: 'pursue', targetPlayerId: entry.targetId, expiresAt: entry.expiresAt }, playDuelReport)
  }

  function libraryAction(body: { action: 'guard'; enabled: boolean } | { action: 'steal'; skillId: string }) {
    if (IS_MOCK_MODE || isBattlePlaying.value) return
    return online.action<LibraryResult>('POST', '/sect/library', body, (result) => {
      if (result.action === 'steal') playDuelReport(result.report)
      else showToast(result.enabled ? '藏经阁防守阵容已登记' : '已结束护山值守', 'info')
    })
  }

  async function readLibraryReport(battleId: string) {
    const actor = player.value.id
    try {
      const report = await apiClient.request<BattleReportDTO>('GET', `/sect/library/reports/${battleId}`)
      if (online.phase.value === 'ready' && player.value.id === actor && !isBattlePlaying.value) startBattlePlayback(report)
    } catch (error) {
      if (online.phase.value === 'ready' && player.value.id === actor) showToast(error instanceof ApiError ? error.message : '护山战报暂时读不到', 'danger')
    }
  }

  // ==================== 门派拜师、首席请安、圆满出师与强行叛师 ====================
  function sectEligibility(sect: SectConfig) {
    if ((IS_MOCK_MODE ? betrayedSectIds.value : player.value.betrayedSectIds)?.includes(sect.id)) {
      return { ok: false, reason: '你曾叛出这个门派，不能再拜入。' }
    }
    return sect.checkReq(player.value.stats, { hasBagua: ownedItemIds.value.includes('iron_bagua'), flags: storyFlags.value })
  }

  function joinSect(sectId: string) {
    if (player.value.currentSectId) {
      showToast('你已经有师门。先出师或离开当前门派，才能拜新师父。', 'danger')
      return
    }
    const sect = SECTS.find((s) => s.id === sectId)
    if (!sect) return
    const check = sectEligibility(sect)
    if (!check.ok) {
      showToast(check.reason ?? '还不符合入门条件。', 'danger')
      return
    }

    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', { action: 'join', sectId }, (result) => {
      if (result.action !== 'join') return
      recordSectEquipment(result.items ?? [])
      showToast(`恭喜拜入【${result.name}】！`, 'gold')
    })

    const hasIntro = !!sect.introFlag && storyFlags.value.includes(sect.introFlag)
    settleMockIdle(Date.now())
    player.value.currentSectId = sect.id
    player.value.sectRank = 1
    delete player.value.gaibangBranch
    player.value.sectContribution = 100 + (hasIntro ? (sect.introBonus ?? 0) : 0)
    for (const id of sect.signatureSkills[0] ?? []) learnSkill(id)
    claimSectEquipment()

    appendLog('JIANGHU', [
      { type: 'tag', text: '奉茶拜师', tone: 'gold' },
      { type: 'text', text: ` 你向师父奉茶，拜入「${sect.name}」，成了「${sect.ranks[0]}」，也学到了本门入门武功。` },
      ...(hasIntro ? [{ type: 'text' as const, text: `（凭引荐信入门，起始门派贡献 +${sect.introBonus}）` }] : []),
    ])
    showToast(`恭喜拜入【${sect.name}】！`, 'gold')
  }

  function saluteChiefPlayer(refresh?: () => void) {
    const sect = currentSect.value
    if (!sect || !canSaluteSect.value) return
    const record = (who: string, qiExp: number, contribution: number, chiefQi = 0) => {
      appendLog('JIANGHU', [{ type: 'tag', text: '同门共勉', tone: 'jade' },
        { type: 'text', text: ` 向${who}抱拳问好。真气 +${qiExp.toLocaleString()}，门派贡献 +${contribution}。${chiefQi ? `首席真气 +${chiefQi.toLocaleString()}。` : ''}` }])
      showToast(`真气 +${qiExp.toLocaleString()}，门派贡献 +${contribution}`, 'gold')
    }
    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', { action: 'salute', sectId: sect.id }, (result) => {
      if (result.action === 'salute') {
        const { chief, qiExp, sectContrib } = result
        record(chief ? `首席弟子「${chief.nickname}」` : '传功长老', qiExp, sectContrib, chief?.qiExp)
        refresh?.()
      }
    })
    const gained = sectContributionGain(60, currentLoadout.value)
    player.value.qiExp += SECT_SALUTE_QI
    player.value.sectContribution += gained
    record(`首席弟子「${sect.chiefPlayerName}」`, SECT_SALUTE_QI, gained)
  }

  function recordSectEquipment(ids: readonly string[]) {
    if (!ids.length) return
    appendLog('JIANGHU', [{ type: 'tag', text: '师门赠装', tone: 'gold' }, ...ids.flatMap((id): RichSegment[] => {
      const item = ITEMS[id]
      return item ? [{ type: 'text', text: ' ' }, { type: 'item', id, name: `【${item.name}】`, tier: item.tier }] : []
    })])
  }

  const mayReceiveSnakeRecipe = computed(() => !player.value.snakeFeedingRecipe && canReceiveSnakeRecipe(player.value, currentLoadout.value))

  function claimSnakeRecipe() {
    if (!mayReceiveSnakeRecipe.value) return
    const announce = () => {
      appendLog('JIANGHU', [{ type: 'tag', text: '白驼饲喂秘方', tone: 'purple' },
        { type: 'text', text: ' 副总管送来一份蛇药饲喂方。从此炼制蝮蛇见血膏少用 1 株蛇涎草。' }])
      showToast('习得白驼蛇药饲喂方', 'gold')
    }
    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', { action: 'snake-recipe', sectId: 'baituo' }, announce)
    player.value.snakeFeedingRecipe = true
    announce()
  }

  function claimSectEquipment() {
    const sect = currentSect.value
    const ids = unclaimedSectEquipment.value
    if (!sect || !ids.length) return
    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', { action: 'claim-gear', sectId: sect.id }, (result) => {
      if (result.action === 'claim-gear') recordSectEquipment(result.items)
    })
    const now = Date.now()
    if (limitsEnabled.value && now > player.value.lastSettleAt) settleMockIdle(now)
    for (const id of ids) gainItem(id)
    recordSectEquipment(ids)
  }

  function claimWandererEquipment() {
    if (!unclaimedWandererEquipment.value || player.value.currentMapId !== WANDERER_EQUIPMENT.mapId) return
    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', { action: 'wanderer-gear' }, (result) => {
      if (result.action === 'wanderer-gear' && result.items.length) showToast(`获得【${WANDERER_EQUIPMENT.name}】`, 'gold')
    })
    for (const { id } of WANDERER_EQUIPMENT.items) {
      if (!ownedItemIds.value.includes(id)) gainItem(id)
    }
    showToast(`获得【${WANDERER_EQUIPMENT.name}】`, 'gold')
  }

  function begForAlms() {
    if (currentSect.value?.id !== 'gaibang' || player.value.currentMapId !== 'jiaxing_suburb' ||
      player.value.gaibangBeggingDay === huashanDay(IS_MOCK_MODE ? Date.now() : onlineTime.value)) return
    const record = (silver: number) => showToast(`化缘所得纹银 +${silver.toLocaleString()}`, 'gold')
    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', { action: 'beg', sectId: 'gaibang' }, (result) => {
      if (result.action === 'beg') record(result.silver)
    })
    const silver = gaibangSilverGain(player.value, gaibangBeggingSilver(currentLoadout.value))
    player.value.gaibangBeggingDay = huashanDay(Date.now())
    player.value.silver += silver
    record(silver)
  }

  function settleSectPromotion(sect: SectConfig, newRank: number) {
    const advanced = newRank > player.value.sectRank
    player.value.sectRank = newRank
    const grants: RichSegment[] = []
    for (const skillId of sect.signatureSkills[newRank - 1] ?? []) {
      const sk = SKILLS[skillId]
      const had = (learnedSkills.value[skillId] ?? 0) > 0
      learnSkill(skillId)
      if (sk && !had) grants.push({ type: 'text', text: '，获传绝学' }, { type: 'skill', id: skillId, name: `《${sk.name}》`, tier: sk.tier })
    }
    const itemId = sect.signatureItems?.[newRank]
    if (itemId && ITEMS[itemId] && !ownedItemIds.value.includes(itemId)) {
      const item = ITEMS[itemId]
      gainItem(itemId)
      grants.push({ type: 'text', text: '，赐下' }, { type: 'item', id: itemId, name: `【${item.name}】`, tier: item.tier, isTrueUnique: item.isTrueUnique })
    }
    claimSectEquipment()
    appendLog('JIANGHU', [
      { type: 'tag', text: advanced ? '辈分晋升' : '门派传承', tone: 'gold' },
      { type: 'text', text: advanced
        ? ` 考校通过！你晋升为【${sect.name}·${sect.ranks[newRank - 1]}】`
        : ` 你通过了${sect.name}的「${sect.promotionExams?.[newRank]?.title}」` },
      ...grants,
      { type: 'text', text: '！' },
    ])
  }

  function setGaibangBranch(branch: GaibangBranch) {
    player.value.gaibangBranch = branch
    appendLog('JIANGHU', [
      { type: 'tag', text: '轩辕台立威', tone: 'gold' },
      { type: 'text', text: ` 你已加入丐帮${GAIBANG_BRANCHES[branch].name}。` },
    ])
  }

  function answerGaibangDebate(index: number) {
    const sect = currentSect.value
    if (!sect || !gaibangChoicePending.value || isBattlePlaying.value) return
    const answer = GAIBANG_DEBATE.answers[index]
    if (!answer) return
    const incorrect = () => {
      appendLog('JIANGHU', [{ type: 'tag', text: '轩辕台论辩', tone: 'red' }, { type: 'text', text: ' 众人争论不休。彭长老请你再想想，该凭什么服众。' }])
      showToast('帮众尚未信服，可重新作答。', 'danger')
    }
    const rank = player.value.sectRank
    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', { action: 'debate', sectId: sect.id, expectedRank: rank, answer: index }, (result) => {
      if (result.action !== 'debate') return
      if (!result.correct) return incorrect()
      const contribution = result.rewards?.sectContrib
      recordSectEquipment((result.rewards?.items ?? []).map(({ id }) => id).filter((id) => !!ITEMS[id]))
      appendLog('JIANGHU', [{ type: 'tag', text: '以理服众', tone: 'gold' }, { type: 'text', text: ` 你已加入丐帮净衣派${contribution ? `，门派贡献 +${contribution}` : ''}。` }])
      showToast('你已加入丐帮净衣派', 'gold')
    })
    if (!answer.correct) return incorrect()
    const rewards = rank === 2 ? sectPromotionRewards(rank, currentLoadout.value) : undefined
    if (rewards) player.value.sectContribution += rewards.sectContrib
    applyReward({ tag: '以理服众', tone: 'gold', text: '你当众说清帮规，两派帮众都点头称是。', qiExp: rewards?.qiExp, silver: rewards?.silver }, 'JIANGHU')
    if (rank === 2) settleSectPromotion(sect, 3)
    setGaibangBranch('JINGYI')
  }

  function prepareGaibangDish(dishId: string) {
    if (!gaibangFinalPending.value || isBattlePlaying.value) return
    const dish = gaibangDishes.value.find((candidate) => candidate.id === dishId)
    if (!dish || dish.prepared) return
    if (player.value.currentMapId !== dish.mapId) {
      showToast(`请前往【${dish.mapName}】备办${dish.name}。`, 'info')
      return
    }
    const record = (name: string, silver: number) => appendLog('JIANGHU', [
      { type: 'tag', text: '百味戏老毒物', tone: 'gold' },
      { type: 'text', text: ` 你在${dish.mapName}花 ${silver.toLocaleString()} 两纹银备好【${name}】。` },
    ])
    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', {
      action: 'prepare', sectId: 'gaibang', expectedRank: player.value.sectRank, dishId,
    }, (result) => { if (result.action === 'prepare') record(result.name, result.silver) })
    if (player.value.silver < dish.silver) {
      showToast(`备办${dish.name}需 ${dish.silver} 两纹银。`, 'danger')
      return
    }
    player.value.silver -= dish.silver
    storyFlags.value.push(gaibangDishFlag(dish.id))
    record(dish.name, dish.silver)
  }

  function challengeSectPromotion(branch?: 'WUYI') {
    const sect = currentSect.value
    const rank = player.value.sectRank
    const target = promotion.value
    if (!sect || !target || isBattlePlaying.value) return
    const { choosing, available, finale, newRank, exam } = target
    if (choosing && !branch) {
      showToast('先到轩辕台完成污净抉择。', 'info')
      return
    }
    if (branch && !choosing) return
    if (!available) {
      showToast('你已经升到门派的最高一阶。', 'gold')
      return
    }
    if (sectPromotionBlockReason.value) {
      showToast(sectPromotionBlockReason.value, 'info')
      return
    }
    if (!IS_MOCK_MODE) return online.action<SectResult>('POST', '/sect', { action: 'trial', sectId: sect.id, expectedRank: rank, branch }, (result) => {
      if (result.action === 'trial') startBattlePlayback(result.report)
    })
    const report = simulateSectTrial(sect, target, { player: player.value, loadout: currentLoadout.value, learnedSkills: learnedSkills.value,
      bonus: collectionBonus.value, companionOf, ownedItemIds: ownedItemIds.value }, Date.now())
    startBattlePlayback(report, null, () => {
      if (currentSect.value?.id !== sect.id || player.value.sectRank !== rank) return
      if (newRank > rank || finale) settleSectPromotion(sect, newRank)
      if (exam?.completionFlag && !storyFlags.value.includes(exam.completionFlag)) storyFlags.value.push(exam.completionFlag)
      if (branch) setGaibangBranch(branch)
    })
  }

  function leaveSect(mode: 'GRADUATE' | 'BETRAY') {
    if (!currentSect.value || (isBattlePlaying.value && activeBattle.value?.mode === 'SECT_TRIAL')) return
    const oldSect = currentSect.value
    if (!IS_MOCK_MODE) {
      return online.action<Extract<SectResult, { action: 'graduate' | 'betray' }>>('POST', '/sect', { action: mode.toLowerCase(), sectId: oldSect.id }, (result) => {
        if (result.action === 'graduate') showToast(`已从「${result.name}」出师，学过的武功都还在。`, 'gold')
        else showToast(`已叛出「${result.name}」，侠义减少 ${Math.abs(result.karmaDelta ?? 120)} 点，追杀令持续 48 小时。`, 'danger')
      })
    }

    if (mode === 'GRADUATE') {
      if (player.value.sectRank < 4 && oldSect.id !== 'jiangnan_wuguan') {
        showToast('门派升到第 4 阶才能出师。', 'danger')
        return
      }
      settleMockIdle(Date.now())
      const graduated = player.value.graduatedSectIds ??= []
      if (!graduated.includes(oldSect.id)) graduated.push(oldSect.id)
      player.value.currentSectId = null
      player.value.sectRank = 1
      player.value.sectContribution = 0
      player.value.isGuardingLibrary = false
      delete player.value.gaibangBranch
      appendLog('JIANGHU', [
        { type: 'tag', text: '圆满出师', tone: 'gold' },
        { type: 'text', text: ` 你拜别「${oldSect.name}」，保留了学过的武功，也可以再拜别的门派。` },
      ])
      showToast(`已从「${oldSect.name}」出师，学过的武功都还在。`, 'gold')
      return
    }

    // 强行叛师：保留偷学武学，但触发全服玩家悬赏追杀令！（含叛全真入古墓原著彩蛋）
    const isQuanzhenToGumu = oldSect.id === 'quanzhen'
    settleMockIdle(Date.now())
    betrayedSectIds.value.push(oldSect.id)
    player.value.betrayedSectIds = betrayedSectIds.value
    player.value.currentSectId = null
    player.value.sectRank = 1
    player.value.sectContribution = 0
    player.value.isGuardingLibrary = false
    delete player.value.gaibangBranch
    player.value.bountyUntil = Date.now() + 1000 * 3600 * 48
    const lostKarma = Math.abs(changeMockKarma(-120))

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
      { type: 'text', text: ` 你叛出了「${oldSect.name}」，侠义减少 ${lostKarma} 点。江湖追杀令将持续 48 小时。` },
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
    return skillUpgradeCost(sk, lv, martialStats.value.intStat, currentLoadout.value.accId)
  }

  function upgradeSkillMastery(skillId: string, useFragments = false) {
    const lv = learnedSkills.value[skillId] ?? 0
    const sk = SKILLS[skillId]
    if (!sk || lv <= 0) return
    const cap = getSkillMasteryCap(sk.tier, player.value.level)
    if (lv >= cap) {
      showToast(`【经脉关隘】《${sk.name}》已达当前境界极境（第 ${cap} 重），需突破大境界方可参悟后几重！`, 'danger')
      return
    }
    if (lv >= MAX_SKILL_MASTERY) return
    if (!IS_MOCK_MODE) return online.action<SkillUpgradeResult>('POST', '/skill/upgrade', { skillId, expectedMastery: lv, useFragments }, (result) => {
      const power = result.power
      const change = power ? `，招式威力 ×${formatSkillPower(power.before)} → ×${formatSkillPower(power.after)}` : ''
      const fragments = result.spentFragments ? `，用去 ${result.spentFragments} 张残页` : ''
      showToast(`《${sk.name}》升到第 ${result.mastery} 重${change}${fragments}，臂力 +1。`, 'gold')
    })
    const { count, spentQi: cost } = skillFragmentDiscount(sk, getSkillUpgradeCost(skillId),
      useFragments ? player.value.skillFragments?.[skillId] ?? 0 : 0)
    if (player.value.qiExp < cost) {
      showToast(`还差 ${(cost - player.value.qiExp).toLocaleString()} 真气才能升级这门武功。`, 'danger')
      return
    }
    player.value.qiExp -= cost
    if (count) player.value.skillFragments![skillId] -= count
    learnedSkills.value[skillId] = lv + 1
    player.value.stats.str += 1
    showToast(`《${sk.name}》升到第 ${lv + 1} 重${count ? `，用去 ${count} 张残页` : ''}，臂力 +1。`, 'gold')
  }

  function equipItem(itemId: string) {
    const it = ITEMS[itemId]
    if (!it || !ownedItemIds.value.includes(itemId)) return
    if (!meetsItemStatRequirement(it, player.value.stats)) {
      showToast(`装备「${it.name}」需要${it.reqStat?.label}。`, 'danger')
      return
    }
    return updateLoadout({ [EQUIP_SLOT_META[it.slot].field]: itemId }, `已装备【${it.name}】`)
  }

  function equipCompanionItem(companionId: string, slot: PersonalEquipSlot, itemId: string | null) {
    const preset = currentLoadout.value
    if (companionId !== preset.leftCompanionId && companionId !== preset.rightCompanionId) return
    if (!companionAffinity.value[companionId]?.recruited) return
    const owner = companionOf(companionId)
    const item = itemId ? ITEMS[itemId] : undefined
    if (!owner || (itemId && (item?.slot !== slot || !ownedItemIds.value.includes(itemId) || !canEquipCompanionItem(owner, item)))) return
    const field = EQUIP_SLOT_META[slot].field
    const patch: Partial<LoadoutPresetDTO> = itemId && preset[field] === itemId ? { [field]: null } : {}
    if (slot === 'WEAPON') {
      const weapons = Object.fromEntries(Object.entries(preset.companionWeapons ?? {})
        .filter(([id, weapon]) => id !== companionId && weapon !== itemId))
      if (itemId) weapons[companionId] = itemId
      patch.companionWeapons = weapons
    } else {
      const equipment = Object.fromEntries(Object.entries(preset.companionEquipment ?? {}).map(([id, wear]) => [id, { ...wear }]))
      for (const [id, wear] of Object.entries(equipment)) {
        if (id === companionId || wear[slot] === itemId) delete wear[slot]
      }
      if (itemId) (equipment[companionId] ??= {})[slot] = itemId
      patch.companionEquipment = equipment
    }
    return updateLoadout(patch, item ? `${owner.name}装备了【${item.name}】` : '已卸下伙伴装备')
  }

  function equipCompanionWeapon(companionId: string, itemId: string | null) {
    return equipCompanionItem(companionId, 'WEAPON', itemId)
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
    const next = { ...currentLoadout.value, ...patch }
    if (next.gearSkillId && !equippedGearSkill(next)) next.gearSkillId = null
    if (next.hiddenWeaponIds) {
      const available = unlockedHiddenWeapons(player.value)
      next.hiddenWeaponIds = [...new Set(next.hiddenWeaponIds)]
        .filter((id) => available.some((weapon) => weapon.id === id)).slice(0, hiddenWeaponCapacity(next))
    }
    if (next.companionWeapons) {
      next.companionWeapons = Object.fromEntries(Object.entries(next.companionWeapons).filter(([id, weapon]) =>
        (id === next.leftCompanionId || id === next.rightCompanionId) && weapon !== next.weaponId,
      ))
    }
    if (next.companionEquipment) {
      const allocated = new Set(Object.values(EQUIP_SLOT_META).map(({ field }) => next[field]))
      const entries: [string, CompanionWear][] = []
      for (const [id, wear] of Object.entries(next.companionEquipment)) {
        if (id !== next.leftCompanionId && id !== next.rightCompanionId) continue
        const equipped = Object.entries(wear).filter(([, item]) => !allocated.has(item))
        for (const [, item] of equipped) allocated.add(item)
        if (equipped.length) entries.push([id, Object.fromEntries(equipped)])
      }
      next.companionEquipment = Object.fromEntries(entries)
    }
    if (!IS_MOCK_MODE) return saveOnlineLoadout(next, false, message)
    if (patrolEncounterRate(next.accId) !== patrolEncounterRate(currentLoadout.value.accId)) mockSettlePatrol()
    settleMockBeforeLoadoutChange(next)
    Object.assign(currentLoadout.value, next)
    if (message !== '配装已保存') showToast(message, 'gold')
  }

  function switchLoadout(idx: LoadoutPresetDTO['presetIdx']) {
    if (idx === player.value.activePresetIdx) return
    if (!IS_MOCK_MODE) return saveOnlineLoadout(presets.value[idx], true, '已切换配装')
    if (patrolEncounterRate(presets.value[idx].accId) !== patrolEncounterRate(currentLoadout.value.accId)) mockSettlePatrol()
    settleMockBeforeLoadoutChange(presets.value[idx])
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
    function announce({ affinityGained, taughtSkillId }: InnGiftResult) {
      const taught = taughtSkillId ? SKILLS[taughtSkillId] : undefined
      appendLog('JIANGHU', [
        { type: 'tag', text: '醉仙煮酒', tone: 'gold' },
        { type: 'text', text: ` 你${isFavorite ? `把「${c.favGift}」送给` : '请'}` },
        { type: 'actor', name: c.name, isAlly: true },
        { type: 'text', text: `，好感 +${affinityGained}（现在 ${companionAffinity.value[compId].affinity}/${affinityCap.value}）。` },
        ...(taught ? [{ type: 'text' as const, text: ' 对方向你倾囊传授' }, { type: 'skill' as const, id: taught.id, name: `《${taught.name}》`, tier: taught.tier }] : []),
      ])
      showToast(taught ? `${c.name}教会了你《${taught.name}》！` : `${c.name}好感度 +${affinityGained}`, taught ? 'gold' : 'info')
    }
    if (!IS_MOCK_MODE) return online.action<InnGiftResult>('POST', '/market/inn/gift', { companionId: compId, favorite: isFavorite }, announce)
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
    const delta = innGiftGain(compId, isFavorite)
    state.affinity += delta
    state.recruited = state.recruited || recruitable(compId, state.affinity)

    const taughtSkillId = state.affinity >= 600 && !state.taught && SKILLS[c.teachSkillId] ? c.teachSkillId : undefined
    if (taughtSkillId) {
      state.taught = true
      learnSkill(taughtSkillId)
    }
    announce({ affinityGained: delta, taughtSkillId })
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

  const ghostAppraiseCost = computed(() => ghostAppraisalCost(currentLoadout.value))

  function appraiseGhostCurio(masked = player.value.wearingMask) {
    function announce({ spentSilver, swordFound, inspection, evasionPercent, karmaDelta }: GhostAppraisalResult) {
      if (inspection !== 'NONE') {
        const caught = inspection === 'CAUGHT'
        appendLog('JIANGHU', [
          { type: 'tag', text: caught ? '戒律撞破' : '躲过盘查', tone: caught ? 'red' : 'jade' },
          { type: 'text', text: ` 避开巡夜同门的概率为 ${evasionPercent}%。${caught ? `侠义减少 ${Math.abs(karmaDelta)} 点。` : '巡夜同门没有认出你。'}` },
        ])
      }
      if (swordFound) {
        const item = ITEMS[GHOST_APPRAISAL_SWORD]
        appendLog('ADVENTURE', [
          { type: 'tag', text: '慧眼识珠', tone: 'gold' },
          { type: 'text', text: ' 你摩挲泥污铁胎，认出竟是剑冢流落的' },
          { type: 'item', id: item.id, name: `【${item.name}】`, tier: item.tier },
          { type: 'text', text: `，花 ${spentSilver} 两捡漏入手！` },
        ])
        showToast(`在旧物摊找到了「${item.name}」！`, 'gold')
        return
      }
      appendLog('JIANGHU', [
        { type: 'tag', text: '鬼市淘货', tone: 'purple' },
        { type: 'text', text: ' 你洗去旧瓷瓶泥垢，内藏一枚桃花岛【九花玉露丸】与前人练功心得（真气 +2,200）！' },
      ])
      showToast('找到 1 枚九花玉露丸，真气 +2,200。', 'gold')
    }
    if (!IS_MOCK_MODE) return online.action<GhostAppraisalResult>('POST', '/market/ghost/appraise', { masked }, announce)
    const now = Date.now()
    const result = settleGhostAppraisal(player.value, currentLoadout.value, ownedItemIds.value.includes(GHOST_APPRAISAL_SWORD), masked,
      now, (delta) => changeMockKarma(delta, now))
    if ('error' in result) return showToast(result.error, 'danger')
    if (result.swordFound) gainItem(GHOST_APPRAISAL_SWORD)
    announce(result)
  }

  const ghostListingPrice = (listing: GhostMarketListingDTO) =>
    marketListingPrice(currentLoadout.value, listing, { ...player.value, stats: martialStats.value })

  function buyOrBidMarketListing(listingId: string) {
    const listing = ghostListings.value.find(({ id }) => id === listingId)
    if (!listing) return
    if (listing.listingType === 'AUCTION') {
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

    const announce = (spentSilver: number) => showToast(`花 ${spentSilver.toLocaleString()} 两买下 ${listing.itemName}`, 'gold')
    if (!IS_MOCK_MODE) return online.action<{ spentSilver: number }>('POST', '/market/ghost/buy', { listingId }, ({ spentSilver }) => announce(spentSilver))
    const price = ghostListingPrice(listing)
    if (player.value.silver < price) {
      showToast('纹银不足！', 'danger')
      return
    }
    player.value.silver -= price
    if (SKILLS[listing.itemId]) {
      learnedSkills.value[listing.itemId] = 1
    } else {
      gainItem(listing.itemId)
    }
    const purchases = player.value.ghostMarketPurchases ??= []
    purchases.push(listing.id)
    announce(price)
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
      case 'PILL': {
        const stock = p.battleMedicines ??= {}
        const qty = d.qty ?? 1
        stock.jiuhua_yulu_wan = (stock.jiuhua_yulu_wan ?? 0) + qty
        return { draw: d, name: '九花玉露丸', detail: `×${qty}（战斗保命）`, isNew: false, glyph: '丹' }
      }
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
  type ReunionState = Omit<ReunionStateDTO, 'day'> & { day: string }
  const reunion = ref<Record<string, ReunionState>>({})
  const feast = ref<{ ingredients: string[]; cooked: string[]; lastCookDay: string }>({ ingredients: [], cooked: [], lastCookDay: '' })
  const gaibangDishes = computed(() => GAIBANG_FINAL_DISHES.map((dish) => ({
    ...dish,
    mapName: MAPS.find((map) => map.id === dish.mapId)?.name ?? dish.mapId,
    prepared: (IS_MOCK_MODE && feast.value.cooked.includes(dish.id)) || sectFlags.value.includes(gaibangDishFlag(dish.id)),
  })))
  const gaibangFinalReady = computed(() => gaibangDishes.value.every((dish) => dish.prepared))
  const mapArrivedAt = ref(Date.now())
  /** 给“故地相候”进度条用的粗粒度时钟 */
  const nowTick = ref(Date.now())
  setInterval(() => (nowTick.value = Date.now()), 30_000)
  const worldTime = computed(() => {
    const live = onlineState.value
    return live ? live.snapshot.serverTime + Math.max(0, nowTick.value - live.receivedAt) : nowTick.value
  })
  const mapEnvironment = (mapId: string) => battleEnvironmentAt(mapId, new Date(worldTime.value))

  const blankReunion = (): ReunionState => ({ clues: 0, day: '', got: { closed: 0, replay: 0, inn: 0 }, step: 'CLUES', waitSince: null, waitMs: 0 })
  const reunionOf = (id: string) => (reunion.value[id] ??= blankReunion())
  /** 只读视图（界面用，不会写入新键） */
  function reunionView(id: string) {
    const st = (IS_MOCK_MODE ? reunion.value[id] : player.value.reunions?.[id]) ?? blankReunion()
    const today = IS_MOCK_MODE ? dayKey(nowTick.value) : innVisitDay(worldTime.value)
    const got = reunionCluesToday(st, today)
    return { ...st, got, waitRatio: waitRatio(id) }
  }
  function waitRatio(id: string, now = worldTime.value) {
    const st = IS_MOCK_MODE ? reunion.value[id] : player.value.reunions?.[id]
    const q = REUNION_QUESTS[id]
    if (!st || st.step !== 'WAIT' || !q) return st && st.step !== 'CLUES' ? 1 : 0
    const arrived = IS_MOCK_MODE ? mapArrivedAt.value : player.value.mapArrivedAt
    return Math.min(1, reunionWaitTime(st, q, player.value.currentMapId, now, arrived) / (REUNION_WAIT_HOURS * 3600_000))
  }
  /** 离开地图前，把在故地的停留时长累计进去 */
  function accrueReunionWait() {
    const now = Date.now()
    for (const [id, st] of Object.entries(reunion.value)) {
      const q = REUNION_QUESTS[id]
      if (st.step === 'WAIT' && q) st.waitMs = reunionWaitTime(st, q, player.value.currentMapId, now, mapArrivedAt.value)
    }
  }

  function gainClue(id: string, source: ClueSource): number {
    const st = reunionOf(id)
    if (st.step !== 'CLUES') return 0
    const today = dayKey()
    st.got = reunionCluesToday(st, today)
    st.day = today
    const gain = gainReunionClues(st, source, Date.now())
    if (gain && st.clues >= REUNION_CLUE_TARGET) {
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
    if (!IS_MOCK_MODE) return requestReunion(id, 'inquire')
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
    if (!IS_MOCK_MODE) return requestReunion(id, 'wait')
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
    if (!IS_MOCK_MODE) return requestReunion(id, 'gift')
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
    if (isBattlePlaying.value) return
    if (!IS_MOCK_MODE) return requestReunion(id, 'battle')
    const st = reunion.value[id]
    const q = REUNION_QUESTS[id]
    if (!st || !q || st.step !== 'BATTLE') return
    appendLog('JIANGHU', [{ type: 'tag', text: '了却前尘', tone: 'red' }, { type: 'text', text: ` ${q.battleIntro}` }])
    const report = simulateServerBattle({
      sceneTitle: `故人重逢 · ${COMPANIONS[id].name}`,
      mode: 'SOLO_STORY',
      player: player.value,
      loadout: currentLoadout.value,
      learnedSkills: learnedSkills.value,
      environment: battleEnvironmentAt(q.mapId),
      ...reunionEncounter(q, player.value.level),
    })
    startBattlePlayback(report, null, () => {
      if (st.step !== 'BATTLE') return
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

  function requestReunion(id: string, action: ReunionResult['action']) {
    if (!reunionCandidates.value.includes(id)) return
    return online.action<ReunionResult>('POST', `/story/reunion/${id}`, { action }, (result) => {
      const q = REUNION_QUESTS[id]
      if (result.action === 'battle') {
        appendLog('JIANGHU', [{ type: 'tag', text: '了却前尘', tone: 'red' }, { type: 'text', text: ` ${q.battleIntro}` }])
        return startBattlePlayback(result.report)
      }
      const text = result.action === 'inquire' ? `寻访线索 +${result.clues}` : result.action === 'wait'
        ? `已寻得踪迹，可备一份${COMPANIONS[id].favGift}相邀。` : q.giftText
      appendLog('ADVENTURE', [{ type: 'tag', text: COMPANIONS[id].name, tone: 'jade' }, { type: 'text', text: ` ${text}` }])
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
    if (player.value.currentSectId === 'gaibang' && player.value.sectRank >= 4 && !learnedSkills.value.xianglong_sanshi) {
      learnedSkills.value.xianglong_sanshi = 1
    }
    if (player.value.currentSectId === 'taohua' && player.value.sectRank >= 3) {
      learnedSkills.value.yuxiao_jianfa ||= 1
      learnedSkills.value.qimen_wuzhuan ||= 1
      if (player.value.sectRank >= 4) learnedSkills.value.xuanfeng_saoye_tui ||= 1
    }
    ownedItemIds.value = saved.ownedItemIds
    openedAcupointIds.value = data.openedAcupointIds ?? saved.player.openedAcupointIds ?? (fresh ? [] : defaults.openedAcupointIds)
    pillInventory.value = data.pillInventory ?? {
      ...(fresh ? {} : defaults.pillInventory),
      pozhang_dan: data.pillCount ?? (fresh ? 0 : defaults.pillCount),
    }
    for (const [id, count] of Object.entries(pillInventory.value)) {
      const category = MEDICINES[id]?.category
      if (category !== 'BATTLE_PILL' && category !== 'WEAPON_VENOM') continue
      const stock = player.value.battleMedicines ??= {}
      stock[id] = (stock[id] ?? 0) + count
      delete pillInventory.value[id]
    }
    herbInventory.value = data.herbInventory ?? (fresh ? {} : defaults.herbInventory)
    knownRecipeIds.value = saved.knownRecipeIds
    furnaceResidue.value = data.furnaceResidue ?? (fresh ? 0 : defaults.furnaceResidue)
    alchemyPity.value = saved.alchemyPity
    betrayedSectIds.value = saved.betrayedSectIds
    player.value.betrayedSectIds = saved.player.betrayedSectIds ?? betrayedSectIds.value
    storyFlags.value = saved.storyFlags
    claimedNodeIds.value = saved.claimedNodeIds
    resolvedAdventureIds.value = saved.resolvedAdventureIds
    if (!player.value.storySnakeChoice && resolvedAdventureIds.value.includes(STORY_SNAKE_ADVENTURE.id)) {
      const bloodHpPct = STORY_SNAKE_ADVENTURE.choices.A.reward.bonusHpPct!
      player.value.storySnakeChoice = (player.value.bonusHpPct ?? 0) >= bloodHpPct ? 'A' : 'B'
    }
    adventureQueue.value = saved.adventureQueue
    pendingAdventureId.value = data.pendingAdventureId === undefined && fresh ? null : saved.pendingAdventureId
    companionAffinity.value = restoreCompanionStates(saved.companionAffinity)
    recruitTrialCompanions(companionAffinity.value, player.value.trial.rewardedStageIds)
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
    const latestRumor = visibleWorldMessages.value.find((m) => m.channel === 'RUMOR')
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
    const mapId = IS_MOCK_MODE ? targetMapId ?? player.value.currentMapId : player.value.currentMapId
    const map = MAPS.find((entry) => entry.id === mapId) ?? MAPS[0]
    const announce = (gathered: { name: string; count: number }[]) => {
      const names = gathered.map(({ name, count }) => `${name} ×${count}`).join('、')
      appendLog('CULTIVATE', [
        { type: 'tag', text: '采药寻珍', tone: 'jade' },
        { type: 'text', text: ` 在「${map.name}」采到${names}。` },
      ])
      showToast(`采获 ${names}`, 'gold')
    }
    if (!IS_MOCK_MODE) return online.action<{ herbs: { name: string; count: number }[] }>('POST', '/alchemy/forage', undefined, ({ herbs }) => announce(herbs))
    if (player.value.qiExp < FORAGE_QI_COST) {
      showToast(`采药需 ${FORAGE_QI_COST} 点真气。`, 'danger')
      return
    }
    const gathered = gatherHerbs(mapId, martialStats.value.luck, shichenIdx.value)
    if (!gathered.length) {
      showToast('此地没有可采的药材。', 'info')
      return
    }
    player.value.qiExp -= FORAGE_QI_COST
    for (const { id, count } of gathered) herbInventory.value[id] = (herbInventory.value[id] ?? 0) + count
    announce(gathered)
    ftue.value.forageCount += 1
    saveFtue()
  }

  // 丹房炼制
  function refinePill(recipeId: string) {
    const baseRecipe = PILL_RECIPES[recipeId]
    if (!baseRecipe) return
    const recipe = recipeForPlayer(baseRecipe, player.value)
    if (!IS_MOCK_MODE) return online.action<{ medicineId: string; count: number }>('POST', '/alchemy/refine', { recipeId }, ({ medicineId, count }) => {
      showToast(count ? `炼得「${MEDICINES[medicineId].name}」×${count}` : '收下药渣，丹方下次炼制成功率提高 6 个百分点', count ? 'gold' : 'info')
    })

    // 悟性要求
    if (martialStats.value.intStat < recipe.minInsight) {
      showToast(`此古方极其玄奥，需悟性达到 ${recipe.minInsight} 方能掌控火候（当前悟性 ${martialStats.value.intStat}）。`, 'danger')
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
    const finalRate = pillSuccessRate(recipe, martialStats.value, pity)

    const roll = Math.random() * 100
    const isSuccess = roll < finalRate
    const targetMed = MEDICINES[recipe.targetMedicineId]
    const medName = targetMed?.name ?? recipe.name

    if (isSuccess) {
      alchemyPity.value[recipeId] = 0 // 清空保底
      // 检验一炉双丹暴击 (基于福缘与悟性)
      const doubleRate = pillDoubleRate(martialStats.value)
      const isDouble = Math.random() * 100 < doubleRate
      const yieldCount = isDouble ? 2 : 1

      const stock = recipe.category === 'BATTLE' ? (player.value.battleMedicines ??= {}) : pillInventory.value
      stock[recipe.targetMedicineId] = (stock[recipe.targetMedicineId] ?? 0) + yieldCount

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
    if (!IS_MOCK_MODE) return online.action<ReturnType<typeof extractFurnaceResidue>>('POST', '/alchemy/extract', undefined, ({ name, count, gainedQi }) => {
      showToast(`获得「${name}」×${count}，真气 +${gainedQi}`, 'gold')
    })
    if (furnaceResidue.value < 5) {
      showToast('需积攒至少 5 团炼丹药渣方可回炉萃取灵草精微。', 'danger')
      return
    }
    furnaceResidue.value -= 5
    const { id, name, count, gainedQi } = extractFurnaceResidue()
    herbInventory.value[id] = (herbInventory.value[id] ?? 0) + count
    player.value.qiExp += gainedQi

    appendLog('CULTIVATE', [
      { type: 'tag', text: '药渣萃精', tone: 'jade' },
      { type: 'text', text: ` 萃取 5 团药渣，获得「${name}」×${count}，真气 +${gainedQi}。` },
    ])
    showToast(`获得「${name}」×${count}，真气 +${gainedQi}`, 'gold')
  }

  return {
    isMidnightTheme,
    activeTab,
    jianghuTab,
    arsenalTab,
    mobileDrawer,
    shichenIdx,
    shichenLabel: computed(() => SHICHEN_LABELS[shichenIdx.value]),
    mapEnvironment,
    toasts,
    confirmDialog,
    inspectModal,
    player,
    learnedSkills,
    ownedItemIds,
    nextRaidRelic,
    selectedRaidId,
    selectedRaidClears,
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
    journeyMap,
    journeySeconds,
    canTravelTo,
    mapTravelTime,
    currentSect,
    derivedStats,
    gameMode,
    limitsEnabled,
    startGame,
    affinityCap,
    giftsLeft,
    companionOf,
    companionCombatStats,
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
    effectiveSilverPerHour,
    onlineTime,
    activeCoCultivation,
    coCultivationInvite,
    activeTrioSynergy,
    isWandererMasteryActive,
    martialStats,
    gaibangChoicePending,
    canPromoteSect,
    canSaluteSect,
    canBegToday,
    unclaimedSectEquipment,
    unclaimedWandererEquipment,
    wandererTeamDamage,
    gaibangFinalPending,
    gaibangFinalReady,
    gaibangDishes,
    sectPromotionExam,
    sectPromotionBlockReason,
    battleOpponentEntry,
    battleEventCursor,
    battleUnits,
    onlinePhase: online.phase,
    authBusy: online.authBusy,
    authError: online.authError,
    roomConnected: online.roomConnected,
    roomMapId,
    roomCount,
    canRetryOnline: online.canRetry,
    onlineActionBusy: computed(() => online.actionBusy.value || online.canRetry.value),
    onlineRevision: computed(() => onlineState.value?.snapshot.revision ?? 0),
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
    nearbyPlayers: visibleNearbyPlayers,
    uniqueArtifacts,
    ghostListings,
    ghostListingPrice,
    worldMessages: visibleWorldMessages,
    marqueeBulletin,
    logs,
    pendingAdventure,
    chooseStorySnake,
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
    resolveAdventureChoice,
    canChooseAdventure,
    skipBattleToEnd,
    closeBattleStage,
    selectTab,
    moveMap,
    travelTo,
    challengeChapter,
    trial,
    ftue,
    ftueQuest,
    ftueReady,
    ftueProgressOf,
    claimFtueReward,
    gotoFtueTarget,
    marketTab,
    jianghuTitle,
    trialPatrolStatus,
    mockSettlePatrol,
    openQusanCache,
    setPatrolStage,
    challengeTrialStage,
    replayTrialBoss,
    onlineHuashan,
    onlineSectContest,
    redeemTrialPart,
    startThreePlayerCoopRaid,
    openRaidLobby,
    selectRaid,
    raidTeamAction,
    interactNearbyPlayer,
    duelInvite,
    replyDuel,
    escortAction,
    bountyTargetId,
    openBountyBoard,
    acceptBounty,
    pursueBounty,
    libraryAction,
    readLibraryReport,
    replyCoCultivation,
    endCoCultivation,
    joinSect,
    sectEligibility,
    saluteChiefPlayer,
    claimSectEquipment,
    mayReceiveSnakeRecipe,
    claimSnakeRecipe,
    claimWandererEquipment,
    begForAlms,
    challengeSectPromotion,
    answerGaibangDebate,
    prepareGaibangDish,
    leaveSect,
    upgradeSkillMastery,
    equipItem,
    equipCompanionItem,
    equipCompanionWeapon,
    changeEquipmentForge,
    worldTime,
    updateLoadout,
    switchLoadout,
    giftCompanionInInn,
    innGiftGain,
    ghostAppraiseCost,
    appraiseGhostCurio,
    buyOrBidMarketListing,
    sendChatMessage,
  }
})
