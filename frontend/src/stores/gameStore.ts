import { defineStore, storeToRefs } from 'pinia'
import { computed, onScopeDispose } from 'vue'
import { MAPS, ONLINE_MAPS, ONLINE_STORY_CHAPTERS, STORY_CHAPTERS, validateGameData } from '@/config/gameData'
import type { RoomPlayerDTO } from '@/network/protocol'
import { useOnlineStore } from './onlineStore'
import { actionFeature, onlineGameActions, type GameActions } from '@/network/gameActions'
import { mockGameActions } from '@/network/mockEngine'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { validateGachaData } from '@/config/gachaData'
import { validateQuestData } from '@/config/questData'
import { usePlayerStore } from './playerStore'
import { SHICHEN_LABELS, useGameUiStore, type MainTab } from './gameUiStore'
import { useBattlePlayback } from './battlePlayback'
import { useFtue } from './ftue'
import { useCompanions } from './companions'
import { useCultivation } from './cultivation'
import { useStory } from './story'
import { useTrial } from './trial'
import { useLoadout } from './loadout'
import { useWorld } from './world'
import { useChat } from './chat'
import { useSect } from './sect'
import { useMarket } from './market'
import { useArtifacts } from './artifacts'
import { useStalls } from './stalls'
import { useLocalGame } from '@/stores/localGame'
import { useEconomy } from './economy'
import { useXiangyang } from './xiangyang'
import { useFeatures } from './features'
import { useStageScripts } from './stageScripts'
import { featureLockedText, featureUnlocked } from '../../../shared/features.ts'

export type { MainTab } from './gameUiStore'
export type { GachaResultView } from './companions'

type NearbyPlayerAction = {
  key: string
  label: string
  ariaLabel?: string
  danger?: boolean
  disabled?: boolean
  busy?: boolean
  run: () => void | Promise<void>
}

// 组合各玩法和会话，并保留现有页面使用的游戏状态入口。
export const useGameStore = defineStore('wuxiaGame', () => {
  if (import.meta.env.DEV) {
    const errs = [...validateGameData(), ...validateGachaData(), ...validateQuestData()]
    if (errs.length) console.warn('[gameData] 数据引用校验失败：\n' + errs.join('\n'))
  }

  const onlineStore = useOnlineStore()
  const session = storeToRefs(onlineStore)
  const playerStore = usePlayerStore()
  const uiStore = useGameUiStore()

  // 随剧情开放的玩法没开放时不发请求，只提示开放条件
  const baseActions = IS_MOCK_MODE ? mockGameActions : onlineGameActions(onlineStore.action)
  const actions: GameActions = {
    run(action, input, onResult, playLocally) {
      const feature = actionFeature(action, input)
      if (feature && !featureUnlocked(playerStore.player, feature)) return uiStore.showToast(featureLockedText(feature), 'info')
      return baseActions.run(action, input, onResult, playLocally)
    },
  }

  const battle = useBattlePlayback({
    claimNodeFirstClear: (nodeId) => story.claimNodeFirstClear(nodeId),
    onStoryNodeWon: (nodeId) => companions.onStoryNodeWon(nodeId),
    playPendingDuel: () => world.playPendingDuel(),
  })

  const ftue = useFtue({ selectTab, actions })

  const companions = useCompanions({ actions, battle })

  const cultivation = useCultivation({
    actions, selectTab, companions,
    logTrialDrop: (drop) => trial.logTrialDrop(drop),
    logPatrolBattles: (battles, elites) => trial.logPatrolBattles(battles, elites),
    logPatrolCache: (reward) => trial.logPatrolCache(reward),
    mockSettlePatrol: (now) => trial.mockSettlePatrol(now),
    announceXiangyangAward: (award) => xiangyang.announceAward(award),
    claimLocalXiangyang: (now, since) => xiangyang.claimLocalXiangyang(now, since),
  })

  const story = useStory({ cultivation, battle, actions })

  const trial = useTrial({ actions, cultivation, battle })

  const loadout = useLoadout({ actions, revision: session.revision, trial, cultivation })

  const world = useWorld({ battle, actions, selectTab, cultivation, companions, latestRumor: () => chat.latestRumor.value })

  const chat = useChat({ roomMapId: world.roomMapId })

  const artifacts = useArtifacts({ actions, battle, chat })

  const sect = useSect({ actions, cultivation, battle, story, chat, companions, artifacts, onJoined: (sectId) => stageScripts.showSectTale(sectId) })

  const market = useMarket({ actions, cultivation })

  const stalls = useStalls({ actions })

  const xiangyang = useXiangyang({ actions, battle })

  const local = useLocalGame({ battle, companions, world, market, artifacts, stalls, xiangyang })

  const economy = useEconomy({ actions })

  const features = useFeatures({ actions, selectTab })

  const stageScripts = useStageScripts({ story, trial, battle, chat, selectTab })

  const playerRefs = storeToRefs(playerStore)
  const { onlineState, activeCoCultivation, player, coCultivationInvite } = playerRefs
  const uiRefs = storeToRefs(uiStore)
  const { logs, toasts, inspectModal, confirmDialog, mobileDrawer, activeTab, jianghuTab, bountyTargetId } = uiRefs
  const { showToast } = uiStore
  const { closeBattleStage, activeBattle, isBattlePlaying } = battle
  const onlineActionBusy = computed(() => session.actionBusy.value || session.canRetry.value)

  function getNearbyPlayerActions(target: RoomPlayerDTO, canInviteRaid: boolean) {
    const available: NearbyPlayerAction[] = []
    const connected = session.roomConnected.value
    const safety = playerStore.currentMap.safety
    const busy = onlineActionBusy.value || !connected
    if (features.featureOpen('MAPS') && (IS_MOCK_MODE || safety === 'PEACE')) {
      available.push({ key: 'cultivate', label: IS_MOCK_MODE ? '一起修行' : '邀请共修',
        ariaLabel: IS_MOCK_MODE ? undefined : `邀请${target.nickname}共修`,
        disabled: !IS_MOCK_MODE && (busy || !!playerStore.activeCoCultivation || !!playerStore.coCultivationInvite),
        run: () => world.interactNearbyPlayer(target, 'CO_CULT') })
    }
    if (features.featureOpen('HUASHAN')) {
      available.push({ key: 'spar', label: IS_MOCK_MODE ? '切磋' : '递帖切磋',
        ariaLabel: IS_MOCK_MODE ? undefined : `邀请${target.nickname}切磋`,
        disabled: !IS_MOCK_MODE && (busy || !!world.duelInvite.value || isBattlePlaying.value),
        busy: onlineStore.isSubmitting('/duel', { targetPlayerId: target.id, action: 'invite' }),
        run: () => world.interactNearbyPlayer(target, 'SPAR') })
      if ((safety === 'CONTESTED' && target.isEscortingDart) || target.isBetrayerBounty) {
        available.push({ key: 'ambush', label: target.isBetrayerBounty ? '追捕' : '劫镖', danger: true,
          disabled: !IS_MOCK_MODE && (busy || isBattlePlaying.value),
          run: () => world.interactNearbyPlayer(target, 'AMBUSH') })
      }
    }
    if (!IS_MOCK_MODE) {
      const team = world.raidLobby.value.team
      if (features.featureOpen('RAID') && canInviteRaid && !team?.members.some(({ id }) => id === target.id)
        && !team?.invited.some(({ id }) => id === target.id)) {
        available.push({ key: 'raid', label: '邀请组队', ariaLabel: `邀请${target.nickname}组队`,
          disabled: world.raidLobbyBusy.value || !connected,
          run: () => world.raidTeamAction({ action: 'invite', targetPlayerId: target.id }) })
      }
      available.push({ key: 'chat', label: '私聊', ariaLabel: `私聊${target.nickname}`, run: () => chat.openChatThread(target) })
    }
    return available
  }

  const modeCapabilities = computed(() => ({
    isLocal: IS_MOCK_MODE,
    maxCharacters: IS_MOCK_MODE ? 4 : 1,
    hasBounty: !IS_MOCK_MODE,
    hasShop: !IS_MOCK_MODE,
    supportsRealChat: !IS_MOCK_MODE,
    inlineAdventures: !IS_MOCK_MODE,
    availableMaps: IS_MOCK_MODE ? MAPS : ONLINE_MAPS,
    storyChapters: IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS,
    getNearbyPlayerActions,
  }))

  const unbindGame = onlineStore.bindGame({
    snapshot: (snapshot) => {
      const previous = onlineState.value
      const previousPair = activeCoCultivation.value
      playerStore.applySnapshot(snapshot)
      const invitation = coCultivationInvite.value
      if (invitation && invitation.invitee.id === player.value.id && invitation.id !== previous?.snapshot.coCultivationInvite?.id) {
        showToast(`「${invitation.inviter.nickname}」邀你共修，右侧江湖栏可以回应`, 'gold')
      }
      const pair = activeCoCultivation.value
      if (previous && pair && pair.id !== previousPair?.id) showToast(`已与「${pair.partner.nickname}」开始共修`, 'gold')
      else if (previousPair && !pair) showToast('共修已结束', 'info')
    },
    event: (event) => {
      if (event.event === 'AUCTION_OUTBID') market.onAuctionOutbid(event.data)
      else if (event.event === 'UNIQUE_ARTIFACT_CHANGED') artifacts.onArtifactChanged(event.data)
      else if (event.event === 'STALL_SOLD') stalls.onStallSold(event.data)
      else if (event.event === 'RATE_BOOSTS') playerStore.applyRateBoosts(event.data)
      else if (event.event === 'CHAT_MESSAGE' || event.event === 'CHAT_REMOVED' || event.event === 'CHAT_REJECTED') chat.handleChatEvent(event)
      else world.handleRoomEvent(event)
    },
    disconnected: world.clearRoom,
    reset: () => {
      world.resetWorld()
      chat.resetChat()
      logs.value = []
      toasts.value = []
      onlineState.value = null
      inspectModal.value = null
      confirmDialog.value = null
      mobileDrawer.value = 'NONE'
      activeTab.value = 'CULTIVATE'
      jianghuTab.value = 'STORY'
      bountyTargetId.value = undefined
      closeBattleStage()
    },
    error: (message) => showToast(message, 'danger'),
  })
  onScopeDispose(unbindGame)

  function selectTab(tab: MainTab) {
    if (!features.mainTabOpen(tab)) {
      const feature = tab === 'SECT' ? 'SECT' : 'INN'
      return showToast(featureLockedText(feature), 'info')
    }
    activeTab.value = tab
    mobileDrawer.value = 'NONE'
    if (activeBattle.value && !isBattlePlaying.value) closeBattleStage()
  }

  return {
    modeCapabilities,
    isMidnightTheme: uiRefs.isMidnightTheme,
    activeTab: uiRefs.activeTab,
    jianghuTab: uiRefs.jianghuTab,
    arsenalTab: uiRefs.arsenalTab,
    mobileDrawer: uiRefs.mobileDrawer,
    worldPane: uiRefs.worldPane,
    mapPickerOpen: uiRefs.mapPickerOpen,
    shichenIdx: uiRefs.shichenIdx,
    shichenLabel: computed(() => SHICHEN_LABELS[uiRefs.shichenIdx.value]),
    mapEnvironment: playerStore.mapEnvironment,
    toasts: uiRefs.toasts,
    confirmDialog: uiRefs.confirmDialog,
    inspectModal: uiRefs.inspectModal,
    player: playerRefs.player,
    learnedSkills: playerRefs.learnedSkills,
    ownedItemIds: playerRefs.ownedItemIds,
    nextRaidRelic: world.nextRaidRelic,
    selectedRaidId: world.selectedRaidId,
    selectedRaidClears: world.selectedRaidClears,
    raidLobby: world.raidLobby,
    raidMirrors: world.raidMirrors,
    raidLobbyBusy: world.raidLobbyBusy,
    pillCount: playerRefs.pillCount,
    openedAcupointIds: playerRefs.openedAcupointIds,
    pillInventory: playerRefs.pillInventory,
    pierceAcupoint: cultivation.pierceAcupoint,
    useAcupointPill: cultivation.useAcupointPill,
    herbInventory: playerRefs.herbInventory,
    knownRecipeIds: playerRefs.knownRecipeIds,
    furnaceResidue: playerRefs.furnaceResidue,
    alchemyPity: playerRefs.alchemyPity,
    forageHerbs: market.forageHerbs,
    refinePill: market.refinePill,
    exchangeFurnaceResidue: market.exchangeFurnaceResidue,
    companionAffinity: playerRefs.companionAffinity,
    presets: playerRefs.presets,
    currentLoadout: playerRefs.currentLoadout,
    currentRealm: playerRefs.currentRealm,
    currentMap: playerRefs.currentMap,
    journeyMap: playerRefs.journeyMap,
    journeySeconds: playerRefs.journeySeconds,
    canTravelTo: playerStore.canTravelTo,
    mapTravelTime: playerStore.mapTravelTime,
    currentSect: playerRefs.currentSect,
    derivedStats: playerRefs.derivedStats,
    gameMode: playerRefs.gameMode,
    limitsEnabled: playerRefs.limitsEnabled,
    startGame: local.startGame,
    affinityCap: playerRefs.affinityCap,
    giftsLeft: playerStore.giftsLeft,
    companionOf: playerStore.companionOf,
    companionCombatStats: playerStore.companionCombatStats,
    awakenCompanion: companions.awakenCompanion,
    gacha: companions.gacha,
    gachaReveal: companions.gachaReveal,
    reunionView: companions.reunionView,
    inquireReunion: companions.inquireReunion,
    completeReunionWait: companions.completeReunionWait,
    reunionGift: companions.reunionGift,
    reunionBattle: companions.reunionBattle,
    feast: companions.feast,
    feastActive: companions.feastActive,
    cookDish: companions.cookDish,
    savedGame: local.savedGame,
    continueGame: local.continueGame,
    backToTitle: local.backToTitle,
    deleteSave: local.deleteSave,
    saveNow: local.saveNow,
    pullGacha: companions.pullGacha,
    closeGachaReveal: companions.closeGachaReveal,
    reunionCandidates: companions.reunionCandidates,
    redeemReunionTicket: companions.redeemReunionTicket,
    setBonusStates: playerRefs.setBonusStates,
    collectionBonus: playerRefs.collectionBonus,
    effectiveQiPerHour: playerRefs.effectiveQiPerHour,
    effectiveSilverPerHour: playerRefs.effectiveSilverPerHour,
    rateBoosts: playerRefs.rateBoosts,
    onlineTime: playerRefs.onlineTime,
    activeCoCultivation: playerRefs.activeCoCultivation,
    coCultivationInvite: playerRefs.coCultivationInvite,
    activeTrioSynergy: playerRefs.activeTrioSynergy,
    isWandererMasteryActive: playerRefs.isWandererMasteryActive,
    martialStats: playerRefs.martialStats,
    gaibangChoicePending: sect.gaibangChoicePending,
    canPromoteSect: sect.canPromoteSect,
    canSaluteSect: sect.canSaluteSect,
    canBegToday: sect.canBegToday,
    unclaimedSectEquipment: sect.unclaimedSectEquipment,
    unclaimedWandererEquipment: sect.unclaimedWandererEquipment,
    wandererTeamDamage: sect.wandererTeamDamage,
    gaibangFinalPending: sect.gaibangFinalPending,
    gaibangFinalReady: sect.gaibangFinalReady,
    gaibangDishes: sect.gaibangDishes,
    sectPromotionExam: sect.sectPromotionExam,
    sectPromotionBlockReason: sect.sectPromotionBlockReason,
    sectTreasury: sect.sectTreasury,
    sectGoodsList: sect.sectGoodsList,
    battleOpponentEntry: battle.battleOpponentEntry,
    battleEventCursor: battle.battleEventCursor,
    currentBattleEvent: battle.currentBattleEvent,
    battleUnits: battle.battleUnits,
    onlinePhase: session.phase,
    authBusy: session.authBusy,
    authError: session.authError,
    roomConnected: session.roomConnected,
    roomMapId: world.roomMapId,
    roomCount: world.roomCount,
    canRetryOnline: session.canRetry,
    onlineActionBusy,
    isSubmitting: onlineStore.isSubmitting,
    onlineRevision: computed(() => onlineState.value?.snapshot.revision ?? 0),
    onlineRetryBusy: session.actionBusy,
    resumeOnline: onlineStore.resume,
    signIn: onlineStore.signIn,
    createOnlinePlayer: onlineStore.create,
    deleteOnlineCharacter: onlineStore.deleteCharacter,
    characterList: local.characterList,
    selectLocalCharacter: local.selectLocalCharacter,
    createLocalCharacter: local.createLocalCharacter,
    deleteLocalCharacter: local.deleteLocalCharacter,
    logout: onlineStore.logout,
    retryOnlineAction: onlineStore.retry,
    nearbyPlayers: world.nearbyPlayers,
    mails: world.mails,
    mailboxOpen: world.mailboxOpen,
    unreadMail: world.unreadMail,
    refreshMail: world.refreshMail,
    claimMail: world.claimMail,
    shopGoods: world.shopGoods,
    refreshShop: world.refreshShop,
    buyShopGoods: world.buyShopGoods,
    announcements: world.announcements,
    absentPlayers: world.absentPlayers,
    ghostListings: market.ghostListings,
    ghostListingPrice: market.ghostListingPrice,
    ...chat,
    marqueeBulletin: world.marqueeBulletin,
    logs: uiRefs.logs,
    pendingAdventure: story.pendingAdventure,
    chooseStorySnake: story.chooseStorySnake,
    adventureQueue: playerRefs.adventureQueue,
    resolvedAdventureIds: playerRefs.resolvedAdventureIds,
    claimedNodeIds: playerRefs.claimedNodeIds,
    storyFlags: playerRefs.storyFlags,
    activeBattle: battle.activeBattle,
    isBattlePlaying: battle.isBattlePlaying,
    liveUnitStates: battle.liveUnitStates,
    slashBanner: battle.slashBanner,
    floatingPopups: battle.floatingPopups,
    toggleTheme: uiStore.toggleTheme,
    askConfirm: uiStore.askConfirm,
    resolveConfirm: uiStore.resolveConfirm,
    getSkillUpgradeCost: loadout.getSkillUpgradeCost,
    openInspect: uiStore.openInspect,
    inspectById: uiStore.inspectById,
    getIdleRewards: cultivation.getIdleRewards,
    settleOfflineQi: cultivation.settleOfflineQi,
    setIdle: cultivation.setIdle,
    awayReport: cultivation.awayReport,
    closeAwayReport: cultivation.closeAwayReport,
    upgradeLevel: cultivation.upgradeLevel,
    attemptBreakthrough: cultivation.attemptBreakthrough,
    triggerRandomAdventure: story.triggerRandomAdventure,
    resolveAdventure: story.resolveAdventure,
    resolveAdventureChoice: story.resolveAdventureChoice,
    canChooseAdventure: story.canChooseAdventure,
    skipBattleToEnd: battle.skipBattleToEnd,
    closeBattleStage: battle.closeBattleStage,
    selectTab,
    moveMap: world.moveMap,
    travelTo: world.travelTo,
    challengeChapter: story.challengeChapter,
    stageScroll: stageScripts.stageScroll,
    stageFocus: uiRefs.stageFocus,
    enterStoryNode: stageScripts.enterStoryNode,
    enterTrialStage: stageScripts.enterTrialStage,
    reviewStage: stageScripts.reviewStage,
    stageBlurb: stageScripts.stageBlurb,
    closeStageScroll: stageScripts.closeStageScroll,
    showTale: stageScripts.showTale,
    showSectTale: stageScripts.showSectTale,
    gotoStage: stageScripts.gotoStage,
    trial: trial.trial,
    daily: economy.daily,
    claimDailyIngot: economy.claimDailyIngot,
    ftue: ftue.ftue,
    ftueQuest: ftue.ftueQuest,
    ftueReady: ftue.ftueReady,
    ftueProgressOf: ftue.ftueProgressOf,
    claimFtueReward: ftue.claimFtueReward,
    gotoFtueTarget: ftue.gotoFtueTarget,
    marketTab: uiRefs.marketTab,
    jianghuTitle: playerRefs.jianghuTitle,
    trialPatrolStatus: trial.trialPatrolStatus,
    patrolFight: trial.patrolFight,
    mockSettlePatrol: trial.mockSettlePatrol,
    openQusanCache: trial.openQusanCache,
    setPatrolStage: trial.setPatrolStage,
    challengeTrialStage: trial.challengeTrialStage,
    replayTrialBoss: trial.replayTrialBoss,
    onlineHuashan: world.onlineHuashan,
    xiangyangBoard: xiangyang.xiangyangBoard,
    xiangyangError: xiangyang.xiangyangError,
    refreshXiangyang: xiangyang.refreshXiangyang,
    xiangyangAction: xiangyang.xiangyangAction,
    onlineSectContest: world.onlineSectContest,
    redeemTrialPart: trial.redeemTrialPart,
    startThreePlayerCoopRaid: world.startThreePlayerCoopRaid,
    refreshRaidMirrors: world.refreshRaidMirrors,
    registerRaidMirror: world.registerRaidMirror,
    startMirrorRaid: world.startMirrorRaid,
    openRaidLobby: world.openRaidLobby,
    selectRaid: world.selectRaid,
    raidTeamAction: world.raidTeamAction,
    interactNearbyPlayer: world.interactNearbyPlayer,
    duelInvite: world.duelInvite,
    replyDuel: world.replyDuel,
    escortAction: world.escortAction,
    bountyTargetId: uiRefs.bountyTargetId,
    openBountyBoard: world.openBountyBoard,
    acceptBounty: world.acceptBounty,
    pursueBounty: world.pursueBounty,
    libraryAction: world.libraryAction,
    readLibraryReport: world.readLibraryReport,
    replyCoCultivation: world.replyCoCultivation,
    endCoCultivation: world.endCoCultivation,
    cancelCoCultivationInvite: world.cancelCoCultivationInvite,
    joinSect: sect.joinSect,
    exchangeSectGood: sect.exchangeSectGood,
    sectEligibility: sect.sectEligibility,
    saluteChiefPlayer: sect.saluteChiefPlayer,
    claimSectEquipment: sect.claimSectEquipment,
    mayReceiveSnakeRecipe: sect.mayReceiveSnakeRecipe,
    claimSnakeRecipe: sect.claimSnakeRecipe,
    claimWandererEquipment: sect.claimWandererEquipment,
    begForAlms: sect.begForAlms,
    challengeSectPromotion: sect.challengeSectPromotion,
    answerGaibangDebate: sect.answerGaibangDebate,
    prepareGaibangDish: sect.prepareGaibangDish,
    leaveSect: sect.leaveSect,
    upgradeSkillMastery: loadout.upgradeSkillMastery,
    equipItem: loadout.equipItem,
    equipCompanionItem: loadout.equipCompanionItem,
    equipCompanionWeapon: loadout.equipCompanionWeapon,
    changeEquipmentForge: loadout.changeEquipmentForge,
    worldTime: playerRefs.worldTime,
    updateLoadout: loadout.updateLoadout,
    switchLoadout: loadout.switchLoadout,
    giftCompanionInInn: companions.giftCompanionInInn,
    innGiftGain: playerStore.innGiftGain,
    ghostAppraiseCost: market.ghostAppraiseCost,
    appraiseGhostCurio: market.appraiseGhostCurio,
    buyMarketListing: market.buyMarketListing,
    auctionBoard: market.auctionBoard,
    refreshAuction: market.refreshAuction,
    bidAuction: market.bidAuction,
    claimAuction: market.claimAuction,
    stallBoard: stalls.stallBoard,
    stallWares: stalls.stallWares,
    refreshStalls: stalls.refreshStalls,
    listStall: stalls.listStall,
    buyStall: stalls.buyStall,
    cancelStall: stalls.cancelStall,
    artifactBoard: artifacts.artifactBoard,
    artifactBlock: artifacts.artifactBlock,
    artifactAttempts: artifacts.artifactAttempts,
    refreshArtifacts: artifacts.refreshArtifacts,
    challengeArtifact: artifacts.challengeArtifact,
    featureOpen: features.featureOpen,
    mainTabOpen: features.mainTabOpen,
    jianghuTabOpen: features.jianghuTabOpen,
    marketTabOpen: features.marketTabOpen,
    arsenalTabOpen: features.arsenalTabOpen,
    guardFeature: features.guardFeature,
    featureCard: features.featureCard,
    closeFeatureCard: features.closeFeatureCard,
    upcomingFeature: features.upcomingFeature,
  }
})
