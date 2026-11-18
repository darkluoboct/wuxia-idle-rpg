import { computed, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { ArtifactBoardDTO, ArtifactResult, PlayerDTO, UniqueArtifactStatusDTO, WsServerEvent } from '@/network/protocol'
import { ITEMS } from '@/config/gameData'
import { apiClient, IS_MOCK_MODE } from '@/network/apiClient'
import type { GameActions } from '@/network/gameActions'
import {
  artifactAttemptsLeft,
  artifactChallengeBlock,
  DAGOU_STAFF,
  defendedArenas,
  honorArtifactHolder,
  simulateElderDuel,
  spendArtifactAttempt,
  surrenderArtifact,
} from '../../../shared/artifacts.ts'
import { usePlayerStore } from './playerStore'
import { useGameUiStore } from './gameUiStore'
import type { useBattlePlayback } from './battlePlayback'
import type { useChat } from './chat'

type ArtifactNews = Extract<WsServerEvent, { event: 'UNIQUE_ARTIFACT_CHANGED' }>['data']
type ArtifactLoss = NonNullable<PlayerDTO['artifactLoss']>

/** 兵器谱 · 全服唯一真品（docs/09 §四）：联机由服务端裁定，本地试玩按同一份规则，只有你一位侠客 */
export function useArtifacts({ actions, battle, chat }: {
  actions: GameActions
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'isBattlePlaying' | 'startBattlePlayback' | 'startLocalBattle'>
  chat: Pick<ReturnType<typeof useChat>, 'postRumor'>
}) {
  const playerStore = usePlayerStore()
  const { player, ownedItemIds, learnedSkills, currentLoadout, collectionBonus, currentSect, presets, worldTime } = storeToRefs(playerStore)
  const { gainItem, companionOf } = playerStore
  const uiStore = useGameUiStore()
  const { appendLog, showToast } = uiStore
  const { isBattlePlaying, startBattlePlayback, startLocalBattle } = battle
  const { postRumor } = chat

  const staffName = ITEMS[DAGOU_STAFF.itemId].name
  const artifactBoard = shallowRef<ArtifactBoardDTO | null>(null)
  const staff = computed(() => artifactBoard.value?.artifacts[0])

  // ==================== 本地试玩：得棒时间、是否已被长老收回、上擂记录 ====================
  const blankLocal = () => ({ heldSince: 0, vacant: false, duels: [] as UniqueArtifactStatusDTO['duels'] })
  const localArtifact = ref(blankLocal())
  const ownsStaff = computed(() => ownedItemIds.value.includes(DAGOU_STAFF.itemId))

  function localBoard(now: number): ArtifactBoardDTO {
    const held = ownsStaff.value
    const { heldSince, vacant, duels } = localArtifact.value
    return {
      serverTime: now,
      artifacts: [{
        artifactCode: DAGOU_STAFF.code, itemId: DAGOU_STAFF.itemId, name: staffName,
        state: held ? 'HELD' : vacant ? 'VACANT' : 'UNCLAIMED',
        holderId: held ? player.value.id : null,
        holderNickname: held ? player.value.nickname : null,
        holderSect: held ? currentSect.value?.name ?? '逍遥散人' : null,
        heldSince: held ? heldSince : null,
        defendStreak: held ? defendedArenas(heldSince, now) : 0,
        recallAt: held ? now + DAGOU_STAFF.idleRecallMs : null,
        duels,
      }],
      registry: Object.values(ITEMS).filter((item) => item.tier === 'red' && !item.isTrueUnique)
        .map(({ id }) => ({ itemId: id, holders: ownedItemIds.value.includes(id) ? 1 : 0 })),
    }
  }

  async function refreshArtifacts() {
    if (IS_MOCK_MODE) {
      artifactBoard.value = localBoard(Date.now())
      return
    }
    try {
      artifactBoard.value = await apiClient.request<ArtifactBoardDTO>('GET', '/market/artifacts')
    } catch {
      // 兵器谱读不到时保留上一次的结果
    }
  }

  // ==================== 传闻与失棒提醒 ====================
  function rumorOf({ cause, newOwner, previousOwner }: ArtifactNews) {
    if (cause === 'GRANT') return `【${newOwner}】通过丐帮终考，洪七公亲手传下【${staffName}】！`
    if (cause === 'RECALL') return `【${previousOwner}】久未露面，【${staffName}】已由丐帮传功长老收回代守，够资格的侠客都可上君山擂台。`
    if (cause === 'BETRAY') return `【${previousOwner}】叛出丐帮，【${staffName}】已被传功长老收回。`
    return previousOwner
      ? `君山擂台易主：【${newOwner}】击败【${previousOwner}】，夺得【${staffName}】！`
      : `【${newOwner}】胜过代守的传功长老，执掌【${staffName}】！`
  }

  /** 真品易主：写进传闻频道；兵器谱开着就顺手刷新 */
  function onArtifactChanged(news: ArtifactNews) {
    postRumor('江湖百晓生', rumorOf(news))
    if (artifactBoard.value) void refreshArtifacts()
  }

  function announceLoss({ cause, iron, by }: ArtifactLoss) {
    const reason = cause === 'SEIZE' ? `【${by}】在君山擂台胜了你，夺走了【${staffName}】`
      : cause === 'RECALL' ? `你连续 ${DAGOU_STAFF.idleRecallMs / 3_600_000} 小时没有露面，【${staffName}】已由传功长老收回代守`
        : `你叛出丐帮，【${staffName}】被传功长老当场收回`
    appendLog('JIANGHU', [
      { type: 'tag', text: '兵器谱', tone: 'red' },
      { type: 'text', text: ` ${reason}。${iron ? `念你守擂有功，补偿百炼玄铁 ${iron} 块。` : ''}学过的武功都还在。` },
    ])
    showToast(`失去【${staffName}】`, 'danger')
  }

  if (!IS_MOCK_MODE) {
    // 失棒记录随存档下发；离线期间丢的，下次上线也要告知一次
    const seenKey = (id: string) => `wuxia:artifact-loss:${id}`
    watch(() => [player.value.id, player.value.artifactLoss?.at] as const, ([id, at]) => {
      if (!at) return
      try {
        if (at <= Number(localStorage.getItem(seenKey(id)))) return
        localStorage.setItem(seenKey(id), String(at))
      } catch {
        // 存不了已读标记时照常提醒
      }
      announceLoss(player.value.artifactLoss!)
    }, { immediate: true })
  }

  /** 本地试玩：打狗棒到手，记下时间与「曾执」印记，并传告江湖 */
  function holdLocally(cause: 'GRANT' | 'SEIZE') {
    gainItem(DAGOU_STAFF.itemId)
    localArtifact.value = { ...localArtifact.value, heldSince: Date.now(), vacant: false }
    honorArtifactHolder(player.value)
    onArtifactChanged({ itemId: DAGOU_STAFF.itemId, cause, newOwner: player.value.nickname, previousOwner: null })
  }

  /** 本地试玩：打狗棒离手，由长老代守 */
  function loseLocally(cause: ArtifactLoss['cause'], now: number) {
    if (!ownsStaff.value) return
    const iron = surrenderArtifact(player.value, Object.values(presets.value), localArtifact.value.heldSince, now, cause !== 'BETRAY')
    ownedItemIds.value = ownedItemIds.value.filter((id) => id !== DAGOU_STAFF.itemId)
    localArtifact.value = { ...localArtifact.value, heldSince: 0, vacant: true }
    const loss: ArtifactLoss = { itemId: DAGOU_STAFF.itemId, at: now, cause, iron, by: null }
    player.value.artifactLoss = loss
    announceLoss(loss)
    onArtifactChanged({ itemId: DAGOU_STAFF.itemId, cause, newOwner: null, previousOwner: player.value.nickname })
  }

  /** 本地读档：离上次存档已过 72 小时，打狗棒已被收回 */
  function onLocalReturn(savedAt: number) {
    if (Date.now() - savedAt >= DAGOU_STAFF.idleRecallMs) loseLocally('RECALL', Date.now())
  }

  // ==================== 上擂 ====================
  const artifactBlock = computed(() => {
    const entry = staff.value
    if (!entry) return '正在读取兵器谱'
    return artifactChallengeBlock({
      player: player.value, learnedSkills: learnedSkills.value, state: entry.state,
      isHolder: entry.holderId === player.value.id, now: worldTime.value,
    })
  })
  const artifactAttempts = computed(() => artifactAttemptsLeft(player.value, worldTime.value))

  function announceDuel({ won, attemptsLeft }: Pick<ArtifactResult, 'won' | 'attemptsLeft'>, defender: string | null) {
    const rival = defender ? `【${defender}】` : '代守的传功长老'
    appendLog(won ? 'ADVENTURE' : 'JIANGHU', [
      { type: 'tag', text: '君山擂台', tone: won ? 'gold' : 'red' },
      { type: 'text', text: won ? ` 你胜过${rival}，【${staffName}】归你执掌！` : ` 你败给了${rival}，今日还可上擂 ${attemptsLeft} 次。` },
    ])
    showToast(won ? `执掌【${staffName}】` : `擂台落败，今日还剩 ${attemptsLeft} 次`, won ? 'gold' : 'info')
  }

  function challengeArtifact() {
    const entry = staff.value
    if (!entry || isBattlePlaying.value) return
    if (artifactBlock.value) {
      showToast(artifactBlock.value, 'info')
      return
    }
    const defender = entry.state === 'HELD' ? entry.holderNickname : null
    return Promise.resolve(actions.run('artifact', { action: 'challenge', itemId: entry.itemId, holderId: entry.holderId }, (result) => {
      announceDuel(result, defender)
      startBattlePlayback(result.report)
    }, () => {
      // 本地只有你一位侠客：能上擂时对手一定是代守的长老
      const now = Date.now()
      const report = simulateElderDuel({
        player: player.value, loadout: currentLoadout.value, learnedSkills: learnedSkills.value, bonus: collectionBonus.value,
        ownedItemIds: ownedItemIds.value, companionOf,
      }, now)
      const won = report.winner === 'ALLY'
      const attemptsLeft = spendArtifactAttempt(player.value, now)
      localArtifact.value = { ...localArtifact.value, duels: [
        { at: now, challenger: player.value.nickname, defender: null, won, self: true }, ...localArtifact.value.duels,
      ].slice(0, 6) }
      if (!won) announceDuel({ won, attemptsLeft }, null)
      startLocalBattle(report, null, () => {
        holdLocally('SEIZE')
        announceDuel({ won, attemptsLeft }, null)
      })
    })).finally(refreshArtifacts)
  }

  function resetLocalArtifact() {
    localArtifact.value = blankLocal()
    artifactBoard.value = null
  }

  return {
    artifactBoard,
    artifactBlock,
    artifactAttempts,
    refreshArtifacts,
    challengeArtifact,
    onArtifactChanged,
    localArtifact,
    holdLocally,
    loseLocally,
    onLocalReturn,
    resetLocalArtifact,
  }
}
