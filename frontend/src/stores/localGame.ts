import { computed, onScopeDispose, ref, watch } from 'vue'
import type { LoadoutPresetDTO, PlayerAvatarId, PlayerDTO, StanceType } from '@/network/protocol'
import { calcNextLevelQi, generateRoomPlayers } from '@/network/mockEngine'
import { MEDICINES, STORY_CHAPTERS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { createStarterCharacter } from '../../../shared/player.ts'
import { recruitTrialCompanions } from '../../../shared/trialStages.ts'
import { STORY_SNAKE_ADVENTURE } from '../../../shared/storySnake.ts'
import { clearSave, LOCAL_SAVE_ENABLED, readSave, writeSave } from './persistence'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import type { useBattlePlayback } from './battlePlayback'
import { useGameUiStore } from './gameUiStore'
import type { useCompanions } from './companions'
import type { useWorld } from './world'
import type { useFtue } from './ftue'
import { SHICHEN_LABELS } from './gameUiStore'

export function useLocalGame({ battle, companions, world, ftue: guide }: {
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'closeBattleStage'>
  companions: Pick<ReturnType<typeof useCompanions>, 'gachaReveal' | 'gacha' | 'reunion' | 'feast' | 'blankReunion'>
  world: Pick<ReturnType<typeof useWorld>, 'nearbyPlayers'>
  ftue: Pick<ReturnType<typeof useFtue>, 'ftue' | 'emptyFtue' | 'saveFtue'>
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
  const { restoreCompanionStates, blankCompanionStates } = playerStore
  const { closeBattleStage } = battle
  const uiStore = useGameUiStore()
  const { activeTab, jianghuTab, mobileDrawer, inspectModal, confirmDialog, toasts, isMidnightTheme, logs, shichenIdx } = storeToRefs(uiStore)
  const { toggleTheme, showToast } = uiStore
  const { gachaReveal, gacha, reunion, feast, blankReunion } = companions
  const { nearbyPlayers } = world
  const { ftue, emptyFtue, saveFtue } = guide

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
