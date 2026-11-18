import { ref, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { apiClient, ApiError, IS_MOCK_MODE } from '@/network/apiClient'
import type { GameActions } from '@/network/gameActions'
import type {
  BattleReportDTO, XiangyangAction, XiangyangAwardDTO, XiangyangBoardDTO, XiangyangGateDTO, XiangyangGateId, XiangyangResult, XiangyangRewardDTO,
} from '@/network/protocol'
import { SKILLS } from '@/config/gameData'
import { forgeMaterials } from '../../../shared/equipmentForge.ts'
import { defenseMirror, mirrorFighter, type DefenseMirror } from '../../../shared/mirror.ts'
import {
  localXiangyangGate, xiangyangAutoTurn, xiangyangBotSorties, xiangyangDrum, xiangyangDrumMerit, xiangyangFullOrders, XIANGYANG_GATE_BY_ID, XIANGYANG_GATES,
  XIANGYANG_WAVES, xiangyangMerit, xiangyangNextAuto, xiangyangNextOrderAt, xiangyangOrdersAt, xiangyangReward, xiangyangRewardText, xiangyangSpendOrder,
  xiangyangWar, xiangyangWarOf, xiangyangWave, xiangyangWaveNeed, xiangyangWavesCleared, type XiangyangOrders, type XiangyangSortieLog, type XiangyangWar,
} from '../../../shared/xiangyang.ts'
import { usePlayerStore } from './playerStore'
import { useGameUiStore } from './gameUiStore'
import type { useBattlePlayback } from './battlePlayback'

/** 本地试玩每场的出战记录与手上的军令（存进存档）；城门波次由同一份规则连同模拟守军推出 */
export interface LocalXiangyangEntry {
  gate: XiangyangGateId
  sorties: { at: number; merit: number; won: boolean; wave: number; auto?: true; drum?: true }[]
  orders: XiangyangOrders
  skillId: string | null
  claimed: boolean
}

/** 本地试玩的值守：跨场保留，due 是镜像下一次替你出战的时刻与场次 */
export interface LocalXiangyangPost {
  gate: XiangyangGateId
  mirror: DefenseMirror
  mirrorAt: number
  due: { at: number; warId: number }
}

const gateName = (id: XiangyangGateId) => XIANGYANG_GATE_BY_ID[id].name.split(' · ')[0]

/** 襄阳守卫战（docs/20）：联机读写服务端；本地试玩用模拟守军，规则同 shared/xiangyang.ts */
export function useXiangyang({ actions, battle }: {
  actions: GameActions
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'isBattlePlaying' | 'startBattlePlayback' | 'startLocalBattle'>
}) {
  const playerStore = usePlayerStore()
  const { player, currentLoadout, learnedSkills, companionAffinity, collectionBonus } = storeToRefs(playerStore)
  const { appendLog, showToast } = useGameUiStore()
  const { isBattlePlaying, startBattlePlayback, startLocalBattle } = battle

  const localXiangyang = ref<Record<string, LocalXiangyangEntry>>({})
  const localXiangyangPost = ref<LocalXiangyangPost | null>(null)
  const xiangyangBoard = shallowRef<XiangyangBoardDTO | null>(null)
  const xiangyangError = ref('')

  // ==================== 本地试玩 ====================
  const ownSorties = (warId: number): XiangyangSortieLog[] => {
    const entry = localXiangyang.value[warId]
    return entry ? entry.sorties.map(({ wave: _wave, ...sortie }) => ({ ...sortie, gate: entry.gate, nickname: player.value.nickname })) : []
  }

  function localGates(warId: number, now: number): XiangyangGateDTO[] {
    return XIANGYANG_GATES.map(({ id }) => {
      const { state, defenders } = localXiangyangGate(warId, id, now, ownSorties(warId))
      return { id, ...state, need: xiangyangWaveNeed(defenders), defenders }
    })
  }

  const entryOrders = (warId: number, at: number) => localXiangyang.value[warId]?.orders ?? xiangyangFullOrders(at)

  /** 与联机一样：镜像冻结当下的境界、配装与同行侠客（按 JSON 存，之后改配装不影响它） */
  function freezeMirror(): DefenseMirror {
    return JSON.parse(JSON.stringify(defenseMirror({
      player: player.value, loadout: currentLoadout.value, learnedSkills: learnedSkills.value, bonus: collectionBonus.value,
      companionAffinity: companionAffinity.value, companionOf: playerStore.companionOf,
    })))
  }

  function savePost(gate: XiangyangGateId, war: XiangyangWar, orders: XiangyangOrders, now: number) {
    localXiangyangPost.value = { gate, mirror: freezeMirror(), mirrorAt: now, due: xiangyangNextAuto(war, orders) }
  }

  function localBattle(gate: XiangyangGateId, wave: number, at: number, scene: string, mirror?: DefenseMirror) {
    const fighter = mirror
      ? { ...mirrorFighter(mirror), ownedItemIds: [] }
      : { player: player.value, loadout: currentLoadout.value, learnedSkills: learnedSkills.value }
    const encounter = xiangyangWave(gate, wave, fighter.player.level)
    return playerStore.simulateServerBattle({
      sceneTitle: `${scene} · ${gateName(gate)}第 ${wave} 波`, mode: 'SOLO_STORY',
      ...fighter, ...encounter, environment: { at, ...encounter.environment },
    })
  }

  /** 把到期的值守出战按时刻先后打完：攒满后每回一道打一次，收兵时把余下的打完 */
  function resolveLocalPost(now: number) {
    const post = localXiangyangPost.value
    while (post && post.due.at <= now) {
      const war = xiangyangWarOf(post.due.warId)
      const { at } = post.due
      const gate = localXiangyang.value[war.id]?.gate ?? post.gate
      const turn = xiangyangAutoTurn(war, entryOrders(war.id, at), at)
      if (turn.count) {
        const record = localXiangyang.value[war.id] ??= { gate, sorties: [], orders: turn.orders, skillId: null, claimed: false }
        for (let order = 0; order < turn.count; order++) {
          const wave = Math.min(localXiangyangGate(war.id, gate, at, ownSorties(war.id)).state.wave, XIANGYANG_WAVES)
          const report = localBattle(gate, wave, at, '襄阳值守', post.mirror)
          record.sorties.push({ at, merit: xiangyangMerit(report), won: report.winner === 'ALLY', wave, auto: true })
        }
        record.orders = turn.orders
        record.skillId = post.mirror.fighter.loadout.outerSkillId
      }
      post.due = xiangyangNextAuto(war, turn.orders)
    }
  }

  function localAwards(now: number): XiangyangAwardDTO[] {
    return Object.entries(localXiangyang.value).flatMap(([key, entry]) => {
      const warId = Number(key)
      const { closesAt } = xiangyangWarOf(warId)
      // 值守的镜像还没把这一场打完，先不论功
      const pending = localXiangyangPost.value && localXiangyangPost.value.due.at <= closesAt
      if (entry.claimed || !entry.sorties.length || closesAt > now || pending) return []
      const merit = entry.sorties.reduce((sum, sortie) => sum + sortie.merit, 0)
      const wavesCleared = xiangyangWavesCleared(localXiangyangGate(warId, entry.gate, closesAt, ownSorties(warId)).state)
      const totals = new Map<string, number>()
      for (const bot of xiangyangBotSorties(warId, entry.gate)) totals.set(bot.nickname, (totals.get(bot.nickname) ?? 0) + bot.merit)
      const topThree = [...totals.values()].filter((total) => total > merit).length < 3
      return [{
        warId, gate: entry.gate, wavesCleared, merit, sorties: entry.sorties.length, topThree, skillId: entry.skillId,
        reward: xiangyangReward({ merit, sorties: entry.sorties.length }, wavesCleared, player.value.level, topThree)!,
      }]
    })
  }

  function localBoard(now: number): XiangyangBoardDTO {
    resolveLocalPost(now)
    const war = xiangyangWar(now)
    const entry = localXiangyang.value[war.id]
    const orders = entryOrders(war.id, now)
    const post = localXiangyangPost.value
    const feed = XIANGYANG_GATES.flatMap(({ id }) => localXiangyangGate(war.id, id, now, ownSorties(war.id)).feed)
      .sort((a, b) => b.at - a.at).slice(0, 20)
    return {
      war,
      drum: xiangyangDrum(now),
      gates: localGates(war.id, now),
      self: entry ? {
        gate: entry.gate, sorties: entry.sorties.length, autoSorties: entry.sorties.filter(({ auto }) => auto).length,
        merit: entry.sorties.reduce((sum, { merit }) => sum + merit, 0),
      } : null,
      orders: { count: xiangyangOrdersAt(war, orders, now), nextAt: xiangyangNextOrderAt(war, orders, now) },
      post: post ? { gate: post.gate, mirrorAt: post.mirrorAt, nextAutoAt: post.due.at } : null,
      feed,
      awards: localAwards(now),
      last: { warId: war.id - 1, gates: localGates(war.id - 1, xiangyangWarOf(war.id - 1).closesAt).map((gate) => ({ id: gate.id, wavesCleared: xiangyangWavesCleared(gate) })) },
    }
  }

  function grantLocalAward(award: XiangyangAwardDTO): Extract<XiangyangResult, { action: 'claim' }> {
    localXiangyang.value[award.warId].claimed = true
    const { reward, skillId } = award
    player.value.goldIngot += reward.ingot
    forgeMaterials(player.value, reward.iron, reward.stones)
    if (skillId) {
      const fragments = player.value.skillFragments ??= {}
      fragments[skillId] = (fragments[skillId] ?? 0) + reward.fragments
    }
    player.value.qiExp += reward.qiExp
    player.value.silver += reward.silver
    return { action: 'claim', warId: award.warId, skillId, reward }
  }

  function playLocally(input: XiangyangAction): XiangyangResult | undefined {
    const now = Date.now()
    if (input.action === 'drill') {
      const report = localBattle(input.gate, input.wave, now, '城头演练')
      return { action: 'drill', report, merit: xiangyangMerit(report) }
    }
    resolveLocalPost(now)
    if (input.action === 'claim') {
      const award = localAwards(now).find(({ warId }) => warId === input.warId)
      if (!award) return void showToast('这一场没有待领的封赏', 'info')
      return grantLocalAward(award)
    }
    const war = xiangyangWar(now)
    const entry = localXiangyang.value[war.id]
    if (input.action === 'post') {
      savePost(input.gate, war, entryOrders(war.id, now), now)
      return { action: 'post', gate: input.gate, current: !entry || entry.gate === input.gate }
    }
    if (input.warId !== war.id) return void showToast('这一场已经换过，请刷新战况', 'info')
    if (entry && entry.gate !== input.gate) return void showToast(`本场你守的是${gateName(entry.gate)}，不能换门；改值守从下一场起算`, 'info')
    const orders = entryOrders(war.id, now)
    if (xiangyangOrdersAt(war, orders, now) <= 0) return void showToast('手上没有军令了，每 8 小时回一道', 'info')
    const drum = xiangyangDrum(now).active
    const record = localXiangyang.value[war.id] ??= { gate: input.gate, sorties: [], orders, skillId: null, claimed: false }
    const before = localXiangyangGate(war.id, input.gate, now, ownSorties(war.id)).state
    const wave = Math.min(before.wave, XIANGYANG_WAVES)
    const report = localBattle(input.gate, wave, now, '襄阳守城')
    const merit = drum ? xiangyangDrumMerit(xiangyangMerit(report)) : xiangyangMerit(report)
    record.sorties.push({ at: now, merit, won: report.winner === 'ALLY', wave, ...(drum ? { drum } : {}) })
    record.orders = xiangyangSpendOrder(war, orders, now)
    record.skillId = currentLoadout.value.outerSkillId
    savePost(input.gate, war, record.orders, now)
    const after = localXiangyangGate(war.id, input.gate, now, ownSorties(war.id))
    const repelled = Array.from({ length: Math.max(0, after.state.wave - before.wave) }, (_, i) => before.wave + i)
    return {
      action: 'sortie', report, merit, drum, repelled,
      gate: { id: input.gate, ...after.state, need: xiangyangWaveNeed(after.defenders), defenders: after.defenders },
    }
  }

  // ==================== 两端共用 ====================
  function play(report: BattleReportDTO, counted: boolean) {
    if (!IS_MOCK_MODE) startBattlePlayback(report)
    // 本地出战与服务端一样记每日江湖事、结算战斗里用掉的药；演练只看不算
    else if (counted) startLocalBattle(report)
    else startBattlePlayback(report)
  }

  function announceAward({ reward, skillId }: { reward: XiangyangRewardDTO; skillId: string | null }) {
    const skill = skillId ? SKILLS[skillId]?.name : undefined
    appendLog('JIANGHU', [
      { type: 'tag', text: '襄阳论功', tone: 'gold' },
      { type: 'text', text: ` 郭靖按战功行赏：${xiangyangRewardText(reward, skill)}。` },
    ])
    showToast(`襄阳封赏：元宝 +${reward.ingot}`, 'gold')
  }

  function announce(result: XiangyangResult) {
    if (result.action === 'claim') return announceAward(result)
    if (result.action === 'post') {
      const name = gateName(result.gate)
      return showToast(result.current ? `值守${name}：镜像按当下配装，军令攒满就替你出战` : `本场仍守原门，下一场起改守${name}`, 'gold')
    }
    play(result.report, result.action === 'sortie')
    if (result.action === 'drill') return showToast(`演练战功 ${result.merit}（不计入城门）`, 'info')
    const name = gateName(result.gate.id)
    const drum = result.drum ? '（擂鼓加五成）' : ''
    showToast(`${name}战功 +${result.merit}${drum}${result.repelled.length ? ` · 击退第 ${result.repelled.join('、')} 波` : ''}`, result.repelled.length ? 'gold' : 'info')
    if (result.repelled.includes(XIANGYANG_WAVES)) {
      appendLog('JIANGHU', [{ type: 'tag', text: '襄阳大捷', tone: 'gold' }, { type: 'text', text: ` ${name}八波敌军尽数击退！` }])
    }
  }

  async function refreshXiangyang() {
    xiangyangError.value = ''
    if (IS_MOCK_MODE) {
      xiangyangBoard.value = localBoard(Date.now())
      return
    }
    try {
      xiangyangBoard.value = await apiClient.request<XiangyangBoardDTO>('GET', '/xiangyang')
    } catch (cause) {
      xiangyangError.value = cause instanceof ApiError ? cause.message : '襄阳战况暂时无法读取'
    }
  }

  function xiangyangAction(input: XiangyangAction) {
    if (isBattlePlaying.value) return
    return actions.run('xiangyang', input, (result) => {
      announce(result)
      void refreshXiangyang()
    }, () => {
      const result = playLocally(input)
      if (result) announce(result)
      void refreshXiangyang()
    })
  }

  /** 本地收功：与联机一样顺带领已论功的封赏；另报 since 之后值守镜像代打的次数与战功，供江湖邸报 */
  function claimLocalXiangyang(now: number, since: number) {
    resolveLocalPost(now)
    const awards = localAwards(now).map((award) => {
      const { warId, skillId, reward } = grantLocalAward(award)
      announceAward({ skillId, reward })
      return { warId, skillId, reward }
    })
    const auto = Object.values(localXiangyang.value).flatMap(({ sorties }) => sorties.filter((sortie) => sortie.auto && sortie.at > since && sortie.at <= now))
    return { awards, ...(auto.length ? { xiangyang: { sorties: auto.length, merit: auto.reduce((sum, { merit }) => sum + merit, 0) } } : {}) }
  }

  return {
    localXiangyang, localXiangyangPost, xiangyangBoard, xiangyangError, refreshXiangyang, xiangyangAction, announceAward, claimLocalXiangyang,
  }
}
