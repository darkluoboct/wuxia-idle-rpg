import { computed, onScopeDispose, ref, watch } from 'vue'
import type { OriginId, PlayerAvatarId, PlayerDTO } from '@/network/protocol'
import { generateRoomPlayers } from '@/network/mockEngine'
import { MEDICINES, STORY_CHAPTERS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { createNewGameCharacter, createStarterCharacter } from '../../../shared/player.ts'
import { emptyFtue } from '../../../shared/ftueQuests.ts'
import { recruitTrialCompanions } from '../../../shared/trialStages.ts'
import { STORY_SNAKE_ADVENTURE } from '../../../shared/storySnake.ts'
import { clearSave, LOCAL_SAVE_ENABLED, readSave, writeSave } from './persistence'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import type { useBattlePlayback } from './battlePlayback'
import { useGameUiStore } from './gameUiStore'
import type { GachaResultView, useCompanions } from './companions'
import type { useWorld } from './world'
import { DAGOU_STAFF } from '../../../shared/artifacts.ts'
import type { useMarket } from './market'
import type { useArtifacts } from './artifacts'
import type { useStalls } from './stalls'
import type { useXiangyang } from './xiangyang'
import { legacyFtue } from './ftue'
import { SHICHEN_LABELS } from './gameUiStore'

/** 旧版存档把结缘计数、十道绝味放在角色之外 */
type LegacySave = {
  gacha?: { pulls: number; pity: number; history?: GachaResultView[] }
  feast?: { ingredients: string[]; cooked: string[] }
}

export function useLocalGame({ battle, companions, world, market, artifacts, stalls, xiangyang }: {
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'closeBattleStage'>
  companions: Pick<ReturnType<typeof useCompanions>, 'gachaReveal' | 'gachaHistory' | 'reunion' | 'blankReunion'>
  world: Pick<ReturnType<typeof useWorld>, 'nearbyPlayers'>
  market: Pick<ReturnType<typeof useMarket>, 'localAuctions'>
  artifacts: Pick<ReturnType<typeof useArtifacts>, 'localArtifact' | 'onLocalReturn' | 'resetLocalArtifact'>
  stalls: Pick<ReturnType<typeof useStalls>, 'localStalls' | 'stallBoard'>
  xiangyang: Pick<ReturnType<typeof useXiangyang>, 'localXiangyang' | 'localXiangyangPost' | 'xiangyangBoard'>
}) {
  const playerStore = usePlayerStore()
  const {
    player,
    gameMode,
    learnedSkills,
    ownedItemIds,
    pillCount,
    openedAcupointIds,
    pillInventory,
    herbInventory,
    knownRecipeIds,
    furnaceResidue,
    alchemyPity,
    betrayedSectIds,
    storyFlags,
    claimedNodeIds,
    resolvedAdventureIds,
    adventureQueue,
    pendingAdventureId,
    companionAffinity,
    presets,
    innDay,
    innGiftsToday,
    mapArrivedAt,
    effectiveQiPerHour,
  } = storeToRefs(playerStore)
  const { restoreCompanionStates } = playerStore
  const { closeBattleStage } = battle
  const uiStore = useGameUiStore()
  const { activeTab, jianghuTab, mobileDrawer, inspectModal, confirmDialog, toasts, isMidnightTheme, logs, shichenIdx } = storeToRefs(uiStore)
  const { toggleTheme, showToast } = uiStore
  const { gachaReveal, gachaHistory, reunion, blankReunion } = companions
  const { nearbyPlayers } = world
  const { localAuctions } = market
  const { localArtifact, onLocalReturn, resetLocalArtifact } = artifacts
  const { localStalls, stallBoard } = stalls
  const { localXiangyang, localXiangyangPost, xiangyangBoard } = xiangyang

  // 角色列表保留本次会话中各角色的进度，浏览器存档继续保存最近游玩的角色。
  type LocalCharacter = { player: PlayerDTO; progress?: SaveData }
  const localCharacters = ref<LocalCharacter[]>(IS_MOCK_MODE ? [{ player: player.value }] : [])
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
    if (!/^[\p{L}\p{N}·_-]{2,16}$/u.test(nickname)) throw new Error('侠客名须为 2–16 位汉字、字母或数字，可用 · _ -')
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
      gachaHistory: gachaHistory.value.slice(0, 30),
      reunion: reunion.value,
      ghostAuctions: localAuctions.value,
      artifact: localArtifact.value,
      stalls: localStalls.value,
      xiangyang: localXiangyang.value,
      xiangyangPost: localXiangyangPost.value,
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
    const legacy = data as LegacySave
    if (legacy.gacha && !player.value.gacha) player.value.gacha = { pulls: legacy.gacha.pulls, pity: legacy.gacha.pity }
    gachaHistory.value = data.gachaHistory ?? legacy.gacha?.history ?? []
    reunion.value = Object.fromEntries(Object.entries(saved.reunion).map(([id, r]) => [id, { ...blankReunion(), ...r }]))
    localAuctions.value = data.ghostAuctions ?? {}
    localStalls.value = data.stalls ?? []
    stallBoard.value = null
    // 襄阳改为每周一场之前的出战记录（没有军令）按场次对不上，丢掉
    localXiangyang.value = Object.fromEntries(Object.entries(data.xiangyang ?? {}).filter(([, entry]) => 'orders' in entry))
    localXiangyangPost.value = data.xiangyangPost ?? null
    xiangyangBoard.value = null
    resetLocalArtifact()
    if (data.artifact) localArtifact.value = data.artifact
    // 旧档没有记得棒时间：从读档这一刻算起
    if (ownedItemIds.value.includes(DAGOU_STAFF.itemId) && !localArtifact.value.heldSince) localArtifact.value.heldSince = Date.now()
    if (legacy.feast && !player.value.feast) player.value.feast = { ingredients: legacy.feast.ingredients, cooked: legacy.feast.cooked, lastCookDay: 0 }
    player.value.ftue ??= legacyFtue(player.value.id)
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
    onLocalReturn(env.savedAt)
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
   * NEW 则整体重置为 Lv.1、从主线 1-1 起步，只带所选家世的家人伙伴，其余伙伴靠剧情与客栈逐步结识。
   */
  function startGame(mode: 'NEW' | 'DEMO', origin?: OriginId) {
    if (!IS_MOCK_MODE) return
    if (mode === 'NEW') {
      const now = Date.now()
      const { id, nickname, avatarId } = player.value
      // 与联机新角色同一套开局；首次收功能看到几分钟的打坐收益
      const start = createNewGameCharacter({ id, nickname, avatarId }, now, origin)
      player.value = { ...start.player, lastSettleAt: now - 5 * 60_000 }
      learnedSkills.value = start.learnedSkills
      ownedItemIds.value = start.ownedItemIds
      openedAcupointIds.value = start.openedAcupointIds
      pillInventory.value = start.pillInventory
      herbInventory.value = start.herbInventory
      knownRecipeIds.value = start.knownRecipeIds
      furnaceResidue.value = start.furnaceResidue
      alchemyPity.value = start.alchemyPity
      betrayedSectIds.value = []
      storyFlags.value = []
      claimedNodeIds.value = []
      resolvedAdventureIds.value = []
      adventureQueue.value = []
      pendingAdventureId.value = null
      companionAffinity.value = restoreCompanionStates(start.companionAffinity)
      innDay.value = ''
      innGiftsToday.value = {}
      gachaHistory.value = []
      reunion.value = {}
      localAuctions.value = {}
      localStalls.value = []
      localXiangyang.value = {}
      localXiangyangPost.value = null
      xiangyangBoard.value = null
      stallBoard.value = null
      resetLocalArtifact()
      mapArrivedAt.value = Date.now()
      gachaReveal.value = null
      presets.value = start.presets
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
      // 序章盖在修行页上，打完 1-1 由忘机客的剧情卡带去历练
      activeTab.value = 'CULTIVATE'
      jianghuTab.value = 'STORY'
    } else {
      applySave(demoFor(player.value))
      activeTab.value = 'CULTIVATE'
      jianghuTab.value = 'TRIAL'
    }
    player.value.ftue = emptyFtue()
    closeBattleStage()
    gachaReveal.value = null
    gameMode.value = mode
  }

  // 每5秒模拟一次在线打坐微跳与江湖时辰推进
  if (IS_MOCK_MODE) {
    const idleTick = setInterval(() => {
      if (!gameMode.value) return
      const tickQi = Math.max(8, Math.round(effectiveQiPerHour.value / 720))
      player.value.qiExp += tickQi
    }, 5000)
    onScopeDispose(() => clearInterval(idleTick))
  }

  return {
    startGame,
    savedGame,
    continueGame,
    backToTitle,
    deleteSave,
    saveNow,
    characterList,
    selectLocalCharacter,
    createLocalCharacter,
    deleteLocalCharacter,
  }
}
