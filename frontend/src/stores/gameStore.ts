import { defineStore, storeToRefs } from 'pinia'
import { computed, onScopeDispose } from 'vue'
import { validateGameData } from '@/config/gameData'
import { useOnlineStore } from './onlineStore'
import { onlineGameActions } from '@/network/gameActions'
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
import { useSect } from './sect'
import { useMarket } from './market'
import { useLocalGame } from './localGame'

export type { MainTab } from './gameUiStore'
export type { GachaResultView } from './companions'

// 组合各玩法和会话，并保留现有页面使用的游戏状态入口。
export const useGameStore = defineStore('wuxiaGame', () => {
  if (import.meta.env.DEV) {
    const errs = [...validateGameData(), ...validateGachaData(), ...validateQuestData()]
    if (errs.length) console.warn('[gameData] 数据引用校验失败：\n' + errs.join('\n'))
  }

  const onlineStore = useOnlineStore()
  const session = storeToRefs(onlineStore)
  const actions = IS_MOCK_MODE ? mockGameActions : onlineGameActions(onlineStore.action)

  const playerStore = usePlayerStore()
  const uiStore = useGameUiStore()

  const battle = useBattlePlayback({
    claimNodeFirstClear: (nodeId) => story.claimNodeFirstClear(nodeId),
    onStoryNodeWon: (nodeId) => companions.onStoryNodeWon(nodeId),
    playPendingDuel: () => world.playPendingDuel(),
  })

  const ftue = useFtue({ selectTab })

  const companions = useCompanions({ actions, battle })

  const cultivation = useCultivation({
    actions, selectTab, companions,
    logTrialDrop: (drop) => trial.logTrialDrop(drop),
    logForgeMaterials: (count) => trial.logForgeMaterials(count),
    logPatrolCache: (reward) => trial.logPatrolCache(reward),
    mockSettlePatrol: (now) => trial.mockSettlePatrol(now),
  })

  const story = useStory({ cultivation, battle, actions })

  const trial = useTrial({ actions, cultivation, battle })

  const loadout = useLoadout({ actions, revision: session.revision, trial, cultivation })

  const world = useWorld({ battle, actions, selectTab, cultivation, companions })

  const sect = useSect({ actions, cultivation, battle, story, world, companions })

  const market = useMarket({ actions, cultivation, ftue })

  const local = useLocalGame({ battle, companions, world, ftue })

  const playerRefs = storeToRefs(playerStore)
  const { onlineState, activeCoCultivation, player, coCultivationInvite } = playerRefs
  const uiRefs = storeToRefs(uiStore)
  const { logs, toasts, inspectModal, confirmDialog, mobileDrawer, activeTab, jianghuTab, bountyTargetId } = uiRefs
  const { showToast } = uiStore
  const { closeBattleStage, activeBattle, isBattlePlaying } = battle

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
    event: world.handleRoomEvent,
    disconnected: world.clearRoom,
    reset: () => {
      world.resetWorld()
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
    activeTab.value = tab
    mobileDrawer.value = 'NONE'
    if (activeBattle.value && !isBattlePlaying.value) closeBattleStage()
  }

  return {
    isMidnightTheme: uiRefs.isMidnightTheme,
    activeTab: uiRefs.activeTab,
    jianghuTab: uiRefs.jianghuTab,
    arsenalTab: uiRefs.arsenalTab,
    mobileDrawer: uiRefs.mobileDrawer,
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
    battleOpponentEntry: battle.battleOpponentEntry,
    battleEventCursor: battle.battleEventCursor,
    battleUnits: battle.battleUnits,
    onlinePhase: session.phase,
    authBusy: session.authBusy,
    authError: session.authError,
    roomConnected: session.roomConnected,
    roomMapId: world.roomMapId,
    roomCount: world.roomCount,
    canRetryOnline: session.canRetry,
    onlineActionBusy: computed(() => session.actionBusy.value || session.canRetry.value),
    onlineRevision: computed(() => onlineState.value?.snapshot.revision ?? 0),
    onlineRetryBusy: session.actionBusy,
    resumeOnline: onlineStore.resume,
    signIn: onlineStore.signIn,
    createOnlinePlayer: onlineStore.create,
    characterList: local.characterList,
    selectLocalCharacter: local.selectLocalCharacter,
    createLocalCharacter: local.createLocalCharacter,
    deleteLocalCharacter: local.deleteLocalCharacter,
    logout: onlineStore.logout,
    retryOnlineAction: onlineStore.retry,
    nearbyPlayers: world.visibleNearbyPlayers,
    uniqueArtifacts: world.uniqueArtifacts,
    ghostListings: market.ghostListings,
    ghostListingPrice: market.ghostListingPrice,
    worldMessages: world.visibleWorldMessages,
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
    battleSpeed: battle.battleSpeed,
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
    trial: trial.trial,
    ftue: ftue.ftue,
    ftueQuest: ftue.ftueQuest,
    ftueReady: ftue.ftueReady,
    ftueProgressOf: ftue.ftueProgressOf,
    claimFtueReward: ftue.claimFtueReward,
    gotoFtueTarget: ftue.gotoFtueTarget,
    marketTab: uiRefs.marketTab,
    jianghuTitle: playerRefs.jianghuTitle,
    trialPatrolStatus: trial.trialPatrolStatus,
    mockSettlePatrol: trial.mockSettlePatrol,
    openQusanCache: trial.openQusanCache,
    setPatrolStage: trial.setPatrolStage,
    challengeTrialStage: trial.challengeTrialStage,
    replayTrialBoss: trial.replayTrialBoss,
    onlineHuashan: world.onlineHuashan,
    onlineSectContest: world.onlineSectContest,
    redeemTrialPart: trial.redeemTrialPart,
    startThreePlayerCoopRaid: world.startThreePlayerCoopRaid,
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
    joinSect: sect.joinSect,
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
    buyOrBidMarketListing: market.buyOrBidMarketListing,
    sendChatMessage: world.sendChatMessage,
  }
})
