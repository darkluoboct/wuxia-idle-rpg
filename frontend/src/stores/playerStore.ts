import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import type { PlayerSnapshot } from '@/network/protocol'
import { computeDerivedStats, simulateServerBattle as simulateBattle } from '@/network/mockEngine'
import {
  activeJianghuTitle,
  activeSetBonuses,
  totalCompanionSetBonuses,
  affinityCapFor,
  COMPANIONS,
  companionView,
  findTrioSynergy,
  meetsItemStatRequirement,
  ITEMS,
  MAPS,
  REALMS,
  SECTS,
  SKILLS,
  type CompanionGrade,
} from '@/config/gameData'
import { EQUIP_SLOT_META } from '@/config/uiMeta'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { computeCompanionDerivedStats } from '../../../shared/battle.ts'
import { battleEnvironmentAt } from '../../../shared/combatMeta.ts'
import { gaibangSilverGain } from '../../../shared/gaibang.ts'
import {
  canEnterMap,
  coCultivationRate,
  createStarterCharacter,
  cultivationRates,
  innAffinityGain,
  innGiftsRemaining,
  innVisitDay,
  legacyAcupoints,
  planMapJourney,
} from '../../../shared/player.ts'
import { effectiveMartialStats, equippedMartialSkills, hasWandererMastery } from '../../../shared/martialSchools.ts'
import { storyProgressFlags } from '../../../shared/storyData.ts'
import { STORY_SNAKE_ADVENTURE } from '../../../shared/storySnake.ts'

export const usePlayerStore = defineStore('wuxiaPlayer', () => {

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
  const herbInventory = ref(starter.herbInventory)
  const knownRecipeIds = ref(starter.knownRecipeIds)
  const furnaceResidue = ref(starter.furnaceResidue)
  const alchemyPity = ref(starter.alchemyPity)
  const presets = ref(starter.presets)
  const betrayedSectIds = ref<string[]>([])

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
  const onlineState = shallowRef<{ snapshot: PlayerSnapshot; receivedAt: number } | null>(null)
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
  const mapArrivedAt = ref(Date.now())
  /** 给“故地相候”进度条用的粗粒度时钟 */
  const nowTick = ref(Date.now())
  const worldClock = setInterval(() => (nowTick.value = Date.now()), 30_000)
  onScopeDispose(() => clearInterval(worldClock))
  const worldTime = computed(() => {
    const live = onlineState.value
    return live ? live.snapshot.serverTime + Math.max(0, nowTick.value - live.receivedAt) : nowTick.value
  })
  const mapEnvironment = (mapId: string) => battleEnvironmentAt(mapId, new Date(worldTime.value))

  function applySnapshot(snapshot: PlayerSnapshot) {
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
  }

  return {
    applySnapshot,
    learnedSkills,
    player,
    learnSkill,
    gainItem,
    martialStats,
    storyFlags,
    ownedItemIds,
    pendingAdventureId,
    pillCount,
    companionAffinity,
    recruitable,
    claimedNodeIds,
    resolvedAdventureIds,
    adventureQueue,
    simulateServerBattle,
    currentLoadout,
    onlineState,
    effectiveQiPerHour,
    mockIdleRates,
    herbInventory,
    collectionBonus,
    currentRealm,
    pillInventory,
    currentSect,
    sectFlags,
    onlineTime,
    nowTick,
    betrayedSectIds,
    limitsEnabled,
    companionOf,
    presets,
    affinityCap,
    giftsLeft,
    innDay,
    dayKey,
    innGiftsToday,
    innGiftGain,
    worldTime,
    mapArrivedAt,
    alchemyPity,
    furnaceResidue,
    openedAcupointIds,
    canTravelTo,
    onlineClock,
    journeySeconds,
    jianghuTitle,
    coCultivationInvite,
    activeCoCultivation,
    currentMap,
    gameMode,
    knownRecipeIds,
    restoreCompanionStates,
    blankCompanionStates,
    mapEnvironment,
    journeyMap,
    mapTravelTime,
    derivedStats,
    companionCombatStats,
    setBonusStates,
    effectiveSilverPerHour,
    activeTrioSynergy,
    isWandererMasteryActive,
  }
})
