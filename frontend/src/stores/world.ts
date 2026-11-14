import { computed, ref, shallowRef } from 'vue'
import type {
  BattleReportDTO,
  BountyEntryDTO,
  DuelInviteDTO,
  HuashanAction,
  VoyageResult,
  RaidId,
  RaidLobbyDTO,
  RoomPlayerDTO,
  SectContestAction,
  UniqueArtifactStatusDTO,
  WsServerEvent,
} from '@/network/protocol'
import { generateRoomPlayers, INITIAL_UNIQUE_ARTIFACTS, mockDuelOpponent } from '@/network/mockEngine'
import { COOP_RAID_RELICS, COOP_RAIDS, ITEMS, MAPS, SHAOSHI_RAID } from '@/config/gameData'
import { apiClient, ApiError, IS_MOCK_MODE } from '@/network/apiClient'
import { simulatePlayerDuel, simulateShaoshiRaid } from '../../../shared/battle.ts'
import { gaibangSilverGain } from '../../../shared/gaibang.ts'
import { cityInspectionDue, createStarterCharacter, planMapJourney, resolveSeaVoyage } from '../../../shared/player.ts'
import { trialPartId } from '../../../shared/trialStages.ts'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import type { useBattlePlayback } from './battlePlayback'
import type { GameActions } from '@/network/gameActions'
import { useOnlineStore } from './onlineStore'
import type { useCultivation } from './cultivation'
import type { useCompanions } from './companions'
import { type MainTab } from './gameUiStore'

type RaidTeamAction =
  | { action: 'invite'; targetPlayerId: string }
  | { action: 'accept' | 'decline'; invitationId: string }
  | { action: 'select'; teamId: string; raidId: RaidId }
  | { action: 'ready'; teamId: string; raidId: RaidId; ready: boolean }
  | { action: 'leave'; teamId: string }

export function useWorld({ battle, actions, selectTab, cultivation, companions }: {
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'isBattlePlaying' | 'startBattlePlayback' | 'startLocalBattle'>
  actions: GameActions
  selectTab: (tab: MainTab) => void
  cultivation: Pick<ReturnType<typeof useCultivation>, 'showIdleGain' | 'settleOfflineQi' | 'changeMockKarma'>
  companions: Pick<ReturnType<typeof useCompanions>, 'accrueReunionWait'>
}) {
  const online = useOnlineStore()
  const playerStore = usePlayerStore()
  const {
    onlineState,
    ownedItemIds,
    player,
    currentSect,
    currentLoadout,
    onlineClock,
    mapArrivedAt,
    journeySeconds,
    jianghuTitle,
    learnedSkills,
    collectionBonus,
    coCultivationInvite,
    activeCoCultivation,
    currentMap,
  } = storeToRefs(playerStore)
  const { canTravelTo, companionOf } = playerStore
  const uiStore = useGameUiStore()
  const { jianghuTab, bountyTargetId } = storeToRefs(uiStore)
  const { showToast, appendLog } = uiStore
  const { isBattlePlaying, startBattlePlayback, startLocalBattle } = battle
  const { showIdleGain, settleOfflineQi, changeMockKarma } = cultivation
  const { accrueReunionWait } = companions

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

  // ==================== 江湖地图、章节推进与多人交互 ====================
  function moveMap(mapId: string, action?: 'depart' | 'arrive') {
    const m = MAPS.find((x) => x.id === mapId)
    if (!m || mapId === player.value.currentMapId) return
    if (action !== 'arrive' && !canTravelTo(m)) {
      const hint = IS_MOCK_MODE ? m.unlockHint : m.onlineUnlockHint
      showToast(`【${m.name}】尚未开放：${hint ?? '请先推进主线'}`, 'danger')
      return
    }
    return actions.run('move', { mapId, action }, (result) => {
      if (result.journey) return announceDeparture(m.name)
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
      finishVoyage(mapId, result.voyage)
    }, () => {
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
    })
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

  function onlineHuashan(action: HuashanAction, refresh: () => void) {
    if (IS_MOCK_MODE || isBattlePlaying.value) return
    return actions.run('huashan', action, (result) => {
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
    return actions.run('sectContest', action, (result) => {
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

  function openRaidLobby() {
    jianghuTab.value = 'RAID'
    selectTab('JIANGHU')
  }

  async function raidTeamAction(body: RaidTeamAction) {
    if (!online.roomConnected || raidLobbyBusy.value) return
    const actor = player.value.id
    raidLobbyBusy.value = true
    try {
      await apiClient.request('POST', '/raid/team', body.action === 'invite' ? { ...body, raidId: selectedRaidId.value } : body)
    } catch (error) {
      if (player.value.id !== actor || online.phase !== 'ready') return
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
    const team = raidLobby.value.team
    return actions.run('raid', team && online.roomConnected ? { teamId: team.id, revision: team.revision } : undefined, playRaidReport, () => {
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
      startLocalBattle(report)
    })
  }

  function replyCoCultivation(accept: boolean) {
    const invitation = coCultivationInvite.value
    if (!invitation || invitation.invitee.id !== player.value.id) return
    return actions.run('coCultivate', {
      action: accept ? 'accept' : 'decline', invitationId: invitation.id,
    }, (result) => {
      if (!accept) showToast('已婉拒共修邀请')
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
    })
  }

  function endCoCultivation() {
    const pair = activeCoCultivation.value
    if (!pair) return
    return actions.run('coCultivate', { action: 'end', coCultivationId: pair.id }, (result) => {
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
    })
  }

  /** 同地图玩家交互：抱拳共修 / 友好切磋 / 限定纷争区劫镖与追杀逆徒 */
  function interactNearbyPlayer(target: RoomPlayerDTO, action: 'CO_CULT' | 'SPAR' | 'AMBUSH') {
    if (action === 'CO_CULT') {
      return actions.run('coCultivate', {
        action: 'invite', targetPlayerId: target.id,
      }, () => showToast(`已邀「${target.nickname}」一起修行`, 'gold'), () => {
        player.value.coCultivatePartner = target.nickname
        appendLog('JIANGHU', [
          { type: 'tag', text: '双人共修', tone: 'jade' },
          { type: 'text', text: ' 你向同图少侠' },
          { type: 'actor', name: target.nickname, isAlly: true, isPlayer: true },
          { type: 'text', text: '一起修行，真气收益 +15%。' },
        ])
        showToast(`正在与「${target.nickname}」一起修行，真气收益 +15%`, 'gold')
        return
      })
    }

    if (isBattlePlaying.value) return
    const bounty = action === 'AMBUSH' && target.isBetrayerBounty
    if (bounty && online.roomConnected) return openBountyBoard(target.id)
    const request = online.roomConnected ? {
      action: action === 'SPAR' ? 'invite' as const : 'ambush' as const,
      targetPlayerId: target.id,
    } : undefined
    return actions.run('duel', request, (report) => {
      if (report) playDuelReport(report)
      else showToast(`切磋请帖已送给「${target.nickname}」`, 'gold')
    }, () => duelLocally(target, action))
  }

  function duelLocally(target: RoomPlayerDTO, action: 'SPAR' | 'AMBUSH') {
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
    startLocalBattle(report)
  }

  function playDuelReport(report: BattleReportDTO) {
    if (lastDuelBattleId === report.battleId) return
    lastDuelBattleId = report.battleId
    startBattlePlayback(report)
  }

  function replyDuel(accept: boolean) {
    const invite = duelInvite.value
    if (!invite || invite.invitee.id !== player.value.id || isBattlePlaying.value) return
    return actions.run('duel', { action: accept ? 'accept' : 'decline', inviteId: invite.id }, (report) => {
      duelInvite.value = null
      if (report) playDuelReport(report)
    })
  }

  function escortAction(action: 'start' | 'claim') {
    return actions.run('escort', { action }, (result) => {
      showToast(action === 'start' ? '已接镖，15 分钟后可交镖' : `交镖完成，纹银 +${result.silver.toLocaleString()}`, 'gold')
    })
  }

  function openBountyBoard(targetId?: string) {
    bountyTargetId.value = targetId
    jianghuTab.value = 'BOUNTY'
    selectTab('JIANGHU')
  }

  function acceptBounty(entry: BountyEntryDTO) {
    if (isBattlePlaying.value) return
    return actions.run('acceptBounty', { targetPlayerId: entry.targetId, expiresAt: entry.expiresAt }, (accepted) => showToast(`已接下「${accepted.nickname}」的通缉令`, 'gold'))
  }

  function pursueBounty(entry: BountyEntryDTO) {
    if (!online.roomConnected || isBattlePlaying.value) return
    return actions.run('duel', { action: 'pursue', targetPlayerId: entry.targetId, expiresAt: entry.expiresAt }, (report) => {
      if (report) playDuelReport(report)
    })
  }

  function libraryAction(body: { action: 'guard'; enabled: boolean } | { action: 'steal'; skillId: string }) {
    if (IS_MOCK_MODE || isBattlePlaying.value) return
    return actions.run('library', body, (result) => {
      if (result.action === 'steal') playDuelReport(result.report)
      else showToast(result.enabled ? '藏经阁防守阵容已登记' : '已结束护山值守', 'info')
    })
  }

  async function readLibraryReport(battleId: string) {
    const actor = player.value.id
    try {
      const report = await apiClient.request<BattleReportDTO>('GET', `/sect/library/reports/${battleId}`)
      if (online.phase === 'ready' && player.value.id === actor && !isBattlePlaying.value) startBattlePlayback(report)
    } catch (error) {
      if (online.phase === 'ready' && player.value.id === actor) showToast(error instanceof ApiError ? error.message : '护山战报暂时读不到', 'danger')
    }
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

  function playPendingDuel() {
    const report = pendingDuelReport.value
    if (report) {
      pendingDuelReport.value = null
      playDuelReport(report)
    }
  }

  function resetWorld() {
    clearRoom()
    roomMapId.value = null
    worldMessages.value = []
    pendingDuelReport.value = null
    lastDuelBattleId = null
    raidLobby.value = { team: null, invitation: null }
    raidLobbyBusy.value = false
    requestedRaidId.value = 'shaoshi'
    lastRaidBattleId = null
  }

  return {
    playPendingDuel,
    worldMessages,
    nearbyPlayers,
    handleRoomEvent,
    roomMapId,
    raidLobby,
    raidLobbyBusy,
    nextRaidRelic,
    selectedRaidId,
    selectedRaidClears,
    roomCount,
    visibleNearbyPlayers,
    uniqueArtifacts,
    visibleWorldMessages,
    marqueeBulletin,
    moveMap,
    travelTo,
    onlineHuashan,
    onlineSectContest,
    startThreePlayerCoopRaid,
    openRaidLobby,
    selectRaid,
    raidTeamAction,
    interactNearbyPlayer,
    duelInvite,
    replyDuel,
    escortAction,
    openBountyBoard,
    acceptBounty,
    pursueBounty,
    libraryAction,
    readLibraryReport,
    replyCoCultivation,
    endCoCultivation,
    sendChatMessage,
    clearRoom,
    resetWorld,
  }
}
