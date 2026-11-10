import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import type {
  BattleReportDTO,
  CombatUnitDTO,
  GameLogEntry,
  IdleGain,
  GhostMarketListingDTO,
  LoadoutPresetDTO,
  PendingAdventureDTO,
  PlayerAvatarId,
  PlayerSnapshot,
  RaidLobbyDTO,
  RichSegment,
  RoomPlayerDTO,
  SkillUpgradeResult,
  StanceType,
  StoryChallengeResult,
  TierColor,
  UniqueArtifactStatusDTO,
  WsServerEvent,
} from '@/network/protocol'
import {
  ADVENTURE_POOL,
  calcNextLevelQi,
  computeDerivedStats,
  generateRoomPlayers,
  INITIAL_GHOST_LISTINGS,
  INITIAL_UNIQUE_ARTIFACTS,
  simulateServerBattle,
} from '@/network/mockEngine'
import {
  ACUPOINTS,
  MEDICINES,
  HERBS,
  type HerbConfig,
  PILL_RECIPES,
  type PillRecipeConfig,
  getMapHerbs,
  COMPANIONS,
  COOP_RAID_RELICS,
  getChapterDrops,
  GHOST_APPRAISE_COST,
  INN_GIFT_COST,
  INN_TEA_COST,
  ITEMS,
  MAPS,
  REALMS,
  SHAOSHI_RAID,
  SECTS,
  SKILLS,
  STORY_CHAPTERS,
  TRIO_SYNERGIES,
} from '@/config/gameData'
import { EQUIP_SLOT_META, formatSkillPower, itemBonusLabels, shichenIdxFromDate, SKILL_SLOT_META, STANCE_META } from '@/config/uiMeta'
import { apiClient, ApiError, IS_MOCK_MODE } from '@/network/apiClient'
import { coCultivationRate, createStarterCharacter, cultivationRate, idleQiNumerator } from '../../../shared/player.ts'
import { MAX_SKILL_MASTERY, getSkillMasteryCap, skillUpgradeCost } from '../../../shared/skillMastery.ts'
import { useOnlineGame } from './onlineGame'

const SHICHEN_LABELS = ['子时·夜半', '寅时·平旦', '辰时·烟雨', '午时·日正', '申时·斜阳', '戌时·黄昏']

export type MainTab = 'CULTIVATE' | 'JIANGHU' | 'ARSENAL' | 'SECT' | 'MARKET'
type RaidTeamAction =
  | { action: 'invite'; targetPlayerId: string }
  | { action: 'accept' | 'decline'; invitationId: string }
  | { action: 'ready'; teamId: string; ready: boolean }
  | { action: 'leave'; teamId: string }

export const useGameStore = defineStore('wuxiaGame', () => {
  // 主题与响应式抽屉状态（默认启动采用燕云玄墨深色护眼主题）
  const isMidnightTheme = ref(true)
  const activeTab = ref<MainTab>('CULTIVATE')
  const jianghuTab = ref<'STORY' | 'MAPS' | 'RAID'>('STORY')
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
  const companionAffinity = ref(starter.companionAffinity)
  const presets = ref(starter.presets)
  const betrayedSectIds = ref<string[]>([])
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
  const derivedStats = computed(() => onlineState.value?.snapshot.derivedStats ?? computeDerivedStats(player.value, currentLoadout.value))
  const effectiveQiPerHour = computed(() => {
    const live = onlineState.value?.snapshot
    if (!live) return cultivationRate(player.value, currentLoadout.value)
    return activeCoCultivation.value ? coCultivationRate(live.soloQiPerHour) : live.soloQiPerHour
  })

  // 当前激活的三人行羁绊
  const activeTrioSynergy = computed(() =>
    TRIO_SYNERGIES.find(
      (s) =>
        s.leftId === currentLoadout.value.leftCompanionId &&
        s.rightId === currentLoadout.value.rightCompanionId
    ) ?? null
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

  // 待抉择奇遇
  const pendingAdventure = ref<PendingAdventureDTO | null>(IS_MOCK_MODE ? {
    id: 'adv_init',
    ...ADVENTURE_POOL[0],
  } : null)

  // 战斗回放播放器状态与破屏书法招式/飘字状态
  const activeBattle = ref<BattleReportDTO | null>(null)
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
    companionAffinity.value = snapshot.companionAffinity
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

  // 本地试玩角色沿用同一套开局数据；联机角色仍由服务端管理。
  type LocalCharacter = ReturnType<typeof createStarterCharacter> & { betrayedSectIds: string[] }
  const cloneCharacter = (value: LocalCharacter): LocalCharacter => JSON.parse(JSON.stringify(value))
  const localCharacters = ref<LocalCharacter[]>(IS_MOCK_MODE ? [cloneCharacter({ ...starter, betrayedSectIds: [] })] : [])
  const characterList = computed(() => localCharacters.value.map((save) => {
    const role = save.player.id === player.value.id ? player.value : save.player
    return { id: role.id, nickname: role.nickname, avatarId: role.avatarId, level: role.level, currentSectId: role.currentSectId }
  }))

  function selectLocalCharacter(id: string) {
    if (!IS_MOCK_MODE) return
    const current = localCharacters.value.findIndex((save) => save.player.id === player.value.id)
    if (current !== -1) localCharacters.value[current] = cloneCharacter({
      player: player.value, learnedSkills: learnedSkills.value, ownedItemIds: ownedItemIds.value,
      pillCount: pillCount.value, companionAffinity: companionAffinity.value, presets: presets.value,
      betrayedSectIds: betrayedSectIds.value,
      openedAcupointIds: openedAcupointIds.value,
      pillInventory: pillInventory.value,
      herbInventory: herbInventory.value,
      knownRecipeIds: knownRecipeIds.value,
      furnaceResidue: furnaceResidue.value,
      alchemyPity: alchemyPity.value,
    })
    const selected = localCharacters.value.find((save) => save.player.id === id)
    if (!selected || id === player.value.id) return
    const save = cloneCharacter(selected)
    closeBattleStage()
    player.value = save.player
    learnedSkills.value = save.learnedSkills
    ownedItemIds.value = save.ownedItemIds
    pillCount.value = save.pillCount
    openedAcupointIds.value = save.openedAcupointIds ?? [
      'shangyang', 'hegu', 'quchi', 'jianyu', 'yingxiang',
      'yinbai', 'yongquan', 'sanyinjiao', 'taichong', 'qimen',
    ]
    pillInventory.value = save.pillInventory ?? {
      pozhang_dan: save.pillCount ?? 2,
      tongmai_dan: 3,
      bingpo_huxin_dan: 1,
      shaolin_xiaohuan_dan: 1,
      jiuzhuan_tongqiao_dan: 0,
    }
    herbInventory.value = (save as any).herbInventory ?? {
      sanqi: 6, cheqian_cao: 5, honghua: 4, heding_lu: 2, jinyinhua: 4, fuling: 3,
      heshouwu: 2, chunyang_zhi: 1, mahuang: 3, hongjingtian: 2, xuelian_hua: 1,
      qushe_dan: 1, shexian_cao: 3, wugong_qiao: 2, duanchang_cao: 1, linghu_cao: 0,
    }
    knownRecipeIds.value = (save as any).knownRecipeIds ?? Object.keys(PILL_RECIPES)
    furnaceResidue.value = (save as any).furnaceResidue ?? 3
    alchemyPity.value = (save as any).alchemyPity ?? {}
    companionAffinity.value = save.companionAffinity
    presets.value = save.presets
    betrayedSectIds.value = save.betrayedSectIds
    activeTab.value = 'CULTIVATE'
    mobileDrawer.value = 'NONE'
    inspectModal.value = null
    confirmDialog.value = null
    pendingAdventure.value = null
    logs.value = []
    toasts.value = []
    nearbyPlayers.value = generateRoomPlayers(player.value.currentMapId)
  }

  function createLocalCharacter(name: string, avatarId: PlayerAvatarId = 'hero_sword') {
    if (!IS_MOCK_MODE || localCharacters.value.length >= 4) return
    const nickname = name.trim().normalize('NFKC')
    if (!/^[\p{L}\p{N}·_\-]{2,16}$/u.test(nickname)) throw new Error('侠客名须为 2–16 位汉字、字母或数字，可用 · _ -')
    if (characterList.value.some((role) => role.nickname === nickname)) throw new Error('这个名字已在江湖中，请换一个')
    const id = crypto.randomUUID()
    localCharacters.value.push({ ...createStarterCharacter({ id, nickname, avatarId }, Date.now()), betrayedSectIds: [] })
    return id
  }

  function deleteLocalCharacter(id: string) {
    if (!IS_MOCK_MODE) return
    localCharacters.value = localCharacters.value.filter((save) => save.player.id !== id)
    if (player.value.id === id && localCharacters.value[0]) selectLocalCharacter(localCharacters.value[0].player.id)
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
    const { gainedQi, gainedSilver } = getIdleRewards()
    player.value.qiExp += gainedQi
    player.value.silver += gainedSilver
    player.value.lastSettleAt = Date.now()

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

  // 触发与选择奇遇
  function triggerRandomAdventure() {
    const tpl = ADVENTURE_POOL[Math.floor(Math.random() * ADVENTURE_POOL.length)]
    pendingAdventure.value = {
      id: `adv_${Date.now()}`,
      ...tpl,
    }
    activeTab.value = 'CULTIVATE'
    showToast(`遇到新奇遇「${tpl.title}」，去任务里看看。`, 'gold')
  }

  function resolveAdventure(choice: 'A' | 'B') {
    if (!pendingAdventure.value) return
    const adv = pendingAdventure.value
    pendingAdventure.value = null

    if (adv.title.includes('宝蛇')) {
      if (choice === 'A') {
        player.value.stats.con += 4
        player.value.qiExp += 3500
        appendLog('ADVENTURE', [
          { type: 'tag', text: '奇遇机缘', tone: 'gold' },
          { type: 'text', text: ' 饮下蛇血后，你只觉一股暖意升起。根骨 +4，真气 +3,500。' },
        ])
      } else {
        player.value.stats.karma += 30
        player.value.silver += 2500
        appendLog('ADVENTURE', [
          { type: 'tag', text: '仁心侠义', tone: 'jade' },
          { type: 'text', text: ' 你放生宝蛇，顺手取走赵王府纹银 +2,500 两，侠义 +30。' },
        ])
      }
    } else if (adv.title.includes('苍猿')) {
      if (choice === 'A') {
        learnedSkills.value['jiuyang_shengong'] = 1
        appendLog('ADVENTURE', [
          { type: 'tag', text: '绝世神功', tone: 'gold' },
          { type: 'text', text: ' 你替白猿处理旧伤，取出了一个油布包，里面竟藏着' },
          { type: 'skill', id: 'jiuyang_shengong', name: '《九阳神功》', tier: 'red' },
          { type: 'text', text: '！' },
        ])
        showToast('学会了《九阳神功》，可以去武库换上。', 'gold')
      } else {
        player.value.stats.karma += 50
        player.value.stats.luck += 3
        appendLog('ADVENTURE', [
          { type: 'tag', text: '福泽绵长', tone: 'jade' },
          { type: 'text', text: ' 白猿向你作揖致谢，献上两枚山间朱果，福缘 +3，侠义 +50！' },
        ])
      }
    } else {
      if (choice === 'A') {
        learnedSkills.value['kongming_quan'] = 1
        player.value.stats.agi += 3
        appendLog('ADVENTURE', [
          { type: 'tag', text: '老顽童真传', tone: 'purple' },
          { type: 'text', text: ' 周伯通拍手大笑：“妙极！你这散人心无挂碍！”当场传授你' },
          { type: 'skill', id: 'kongming_quan', name: '《空明拳》', tier: 'orange' },
          { type: 'text', text: '！' },
        ])
        showToast('习得绝品外功《空明拳》！', 'gold')
      } else {
        companionAffinity.value.zhoubotong.affinity = Math.min(1000, companionAffinity.value.zhoubotong.affinity + 120)
        player.value.qiExp += 4000
        appendLog('ADVENTURE', [
          { type: 'tag', text: '忘年之交', tone: 'jade' },
          { type: 'text', text: ' 你陪周伯通斗了几局蟋蟀。周伯通好感 +120，真气 +4,000。' },
        ])
      }
    }
  }

  // ==================== 战斗播放器引擎 ====================
  function startBattlePlayback(report: BattleReportDTO) {
    if (battleTimer) clearTimeout(battleTimer)
    mobileDrawer.value = 'NONE'
    activeBattle.value = report
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
    if (!activeBattle.value) return
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
            if (IS_MOCK_MODE) learnedSkills.value[drop.id] = Math.max(1, learnedSkills.value[drop.id] ?? 0)
            itemSegs.push({ type: 'skill', id: drop.id, name: `《${drop.name}》`, tier: drop.tier })
          } else if (ITEMS[drop.id]) {
            if (IS_MOCK_MODE && !ownedItemIds.value.includes(drop.id)) ownedItemIds.value.push(drop.id)
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
    } else if (report.winner === 'ENEMY') {
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
    if (!IS_MOCK_MODE) {
      if (mapId === player.value.currentMapId) return
      return online.action<IdleGain>('POST', '/map/move', { mapId }, (result) => {
        if (result.gainedQi || result.gainedSilver) showIdleGain(result)
        announceMap(mapId)
      })
    }
    settleOfflineQi()
    player.value.currentMapId = mapId
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
    const ch = STORY_CHAPTERS.find((c) => c.id === chapterId)
    if (!ch) return
    if (chapterId > player.value.maxChapterId) {
      showToast('先打过上一关，就能挑战这里。', 'danger')
      return
    }
    const drops = getChapterDrops(ch)
      .filter((drop) => drop.kind === 'item' ? !ownedItemIds.value.includes(drop.id) : !learnedSkills.value[drop.id])
      .map(({ id, name, tier }) => ({ id, name, tier }))

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
      rewards: {
        qiExp: ch.rewardQi,
        silver: ch.rewardSilver,
        items: drops,
      },
    })
    if (report.winner === 'ALLY' && chapterId >= player.value.maxChapterId) {
      player.value.maxChapterId = chapterId + 1
    }
    startBattlePlayback(report)
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
    const check = sect.checkReq(player.value.stats, ownedItemIds.value.includes('iron_bagua'))
    if (!check.ok) {
      showToast(check.reason ?? '还不符合入门条件。', 'danger')
      return
    }

    player.value.currentSectId = sect.id
    player.value.sectRank = 1
    player.value.sectContribution = 100
    for (const sk of sect.signatureSkills.slice(0, 1)) {
      learnedSkills.value[sk] = Math.max(1, learnedSkills.value[sk] ?? 0)
    }

    appendLog('JIANGHU', [
      { type: 'tag', text: '奉茶拜师', tone: 'gold' },
      { type: 'text', text: ` 你向师父奉茶，拜入「${sect.name}」，成了「${sect.ranks[0]}」，也学到了本门入门武功。` },
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
      const unlockedSkill = currentSect.value.signatureSkills[Math.min(currentSect.value.signatureSkills.length - 1, player.value.sectRank - 2)]
      if (unlockedSkill && SKILLS[unlockedSkill]) {
        learnedSkills.value[unlockedSkill] = Math.max(1, learnedSkills.value[unlockedSkill] ?? 0)
        appendLog('JIANGHU', [
          { type: 'tag', text: '辈分晋升', tone: 'gold' },
          { type: 'text', text: ` 考核通过。你升为「${nextRankName}」，学会了` },
          { type: 'skill', id: unlockedSkill, name: `《${SKILLS[unlockedSkill].name}》`, tier: SKILLS[unlockedSkill].tier },
          { type: 'text', text: '！' },
        ])
      }
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
    const cost = isFavorite ? INN_GIFT_COST : INN_TEA_COST
    if (player.value.silver < cost) {
      showToast(`这次需要 ${cost.toLocaleString()} 两纹银。`, 'danger')
      return
    }
    player.value.silver -= cost
    const delta = isFavorite ? 80 : 20
    state.affinity = Math.min(1000, state.affinity + delta)
    state.recruited = state.affinity >= 100

    appendLog('JIANGHU', [
      { type: 'tag', text: '醉仙煮酒', tone: 'gold' },
      { type: 'text', text: ` 你${isFavorite ? `把「${c.favGift}」送给` : '请'}` },
      { type: 'actor', name: c.name, isAlly: true },
      { type: 'text', text: `${isFavorite ? '' : '喝茶'}，好感 +${delta}（现在 ${state.affinity}/1000）。` },
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
      showToast(`${c.name}教会了你《${taughtSk.name}》！`, 'gold')
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
    const isRighteousSect = player.value.currentSectId === 'quanzhen' || player.value.currentSectId === 'gaibang'
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
      ownedItemIds.value.push(listing.itemId)
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

  // 每5秒模拟一次在线打坐微跳与江湖时辰推进
  if (IS_MOCK_MODE) setInterval(() => {
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
