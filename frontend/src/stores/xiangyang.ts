import { ref, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { apiClient, ApiError, IS_MOCK_MODE } from '@/network/apiClient'
import type { GameActions } from '@/network/gameActions'
import type { BattleReportDTO, XiangyangAction, XiangyangAwardDTO, XiangyangBoardDTO, XiangyangGateDTO, XiangyangGateId, XiangyangResult } from '@/network/protocol'
import { SKILLS } from '@/config/gameData'
import { forgeMaterials } from '../../../shared/equipmentForge.ts'
import {
  localXiangyangGate, xiangyangBotSorties, XIANGYANG_GATE_BY_ID, XIANGYANG_GATES, XIANGYANG_ORDERS, XIANGYANG_WAVES, xiangyangMerit, xiangyangReward,
  xiangyangRewardText, xiangyangWar, xiangyangWarOf, xiangyangWave, xiangyangWaveNeed, xiangyangWavesCleared, type XiangyangSortieLog,
} from '../../../shared/xiangyang.ts'
import { usePlayerStore } from './playerStore'
import { useGameUiStore } from './gameUiStore'
import type { useBattlePlayback } from './battlePlayback'

/** 本地试玩每场的出战记录（存进存档）；城门波次由同一份规则连同模拟守军推出 */
export interface LocalXiangyangEntry {
  gate: XiangyangGateId
  sorties: { at: number; merit: number; won: boolean; wave: number }[]
  skillId: string | null
  claimed: boolean
}

const gateName = (id: XiangyangGateId) => XIANGYANG_GATE_BY_ID[id].name.split(' · ')[0]

/** 襄阳守卫战（docs/20）：联机读写服务端；本地试玩用模拟守军，规则同 shared/xiangyang.ts */
export function useXiangyang({ actions, battle }: {
  actions: GameActions
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'isBattlePlaying' | 'startBattlePlayback' | 'startLocalBattle'>
}) {
  const playerStore = usePlayerStore()
  const { player, currentLoadout, learnedSkills } = storeToRefs(playerStore)
  const { appendLog, showToast } = useGameUiStore()
  const { isBattlePlaying, startBattlePlayback, startLocalBattle } = battle

  const localXiangyang = ref<Record<string, LocalXiangyangEntry>>({})
  const xiangyangBoard = shallowRef<XiangyangBoardDTO | null>(null)
  const xiangyangError = ref('')

  // ==================== 本地试玩 ====================
  const ownSorties = (warId: number): XiangyangSortieLog[] => {
    const entry = localXiangyang.value[warId]
    return entry ? entry.sorties.map(({ at, merit, won }) => ({ at, merit, won, gate: entry.gate, nickname: player.value.nickname })) : []
  }

  function localGates(warId: number, now: number): XiangyangGateDTO[] {
    return XIANGYANG_GATES.map(({ id }) => {
      const { state, defenders } = localXiangyangGate(warId, id, now, ownSorties(warId))
      return { id, ...state, need: xiangyangWaveNeed(defenders), defenders }
    })
  }

  function localAwards(now: number): XiangyangAwardDTO[] {
    return Object.entries(localXiangyang.value).flatMap(([key, entry]) => {
      const warId = Number(key)
      const { closesAt } = xiangyangWarOf(warId)
      if (entry.claimed || !entry.sorties.length || closesAt > now) return []
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
    const war = xiangyangWar(now)
    const entry = localXiangyang.value[war.id]
    const feed = XIANGYANG_GATES.flatMap(({ id }) => localXiangyangGate(war.id, id, now, ownSorties(war.id)).feed)
      .sort((a, b) => b.at - a.at).slice(0, 20)
    return {
      war,
      gates: localGates(war.id, now),
      self: entry ? { gate: entry.gate, sorties: entry.sorties.length, merit: entry.sorties.reduce((sum, { merit }) => sum + merit, 0) } : null,
      feed,
      awards: localAwards(now),
      last: { warId: war.id - 1, gates: localGates(war.id - 1, xiangyangWarOf(war.id - 1).closesAt).map((gate) => ({ id: gate.id, wavesCleared: xiangyangWavesCleared(gate) })) },
    }
  }

  function localBattle(gate: XiangyangGateId, wave: number, drill: boolean) {
    const encounter = xiangyangWave(gate, wave, player.value.level)
    return playerStore.simulateServerBattle({
      sceneTitle: `${drill ? '城头演练' : '襄阳守城'} · ${gateName(gate)}第 ${wave} 波`, mode: 'SOLO_STORY',
      player: player.value, loadout: currentLoadout.value, learnedSkills: learnedSkills.value,
      ...encounter, environment: { at: Date.now(), ...encounter.environment },
    })
  }

  function playLocally(input: XiangyangAction): XiangyangResult | undefined {
    const now = Date.now()
    if (input.action === 'drill') {
      const report = localBattle(input.gate, input.wave, true)
      return { action: 'drill', report, merit: xiangyangMerit(report) }
    }
    if (input.action === 'claim') {
      const award = localAwards(now).find(({ warId }) => warId === input.warId)
      if (!award) return void showToast('这一场没有待领的封赏', 'info')
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
    const war = xiangyangWar(now)
    if (!war.active) return void showToast('襄阳城头还没擂鼓：每周三、周日 20:00 开战，平日可以演练', 'info')
    if (input.warId !== war.id) return void showToast('这一场已经换过，请刷新战况', 'info')
    const entry = localXiangyang.value[war.id]
    if (entry && entry.gate !== input.gate) return void showToast(`本场你守的是${gateName(entry.gate)}，不能换门`, 'info')
    if ((entry?.sorties.length ?? 0) >= XIANGYANG_ORDERS) return void showToast(`本场 ${XIANGYANG_ORDERS} 道军令已经用完`, 'info')
    const record = localXiangyang.value[war.id] ??= { gate: input.gate, sorties: [], skillId: null, claimed: false }
    const before = localXiangyangGate(war.id, input.gate, now, ownSorties(war.id)).state
    const wave = Math.min(before.wave, XIANGYANG_WAVES)
    const report = localBattle(input.gate, wave, false)
    const merit = xiangyangMerit(report)
    record.sorties.push({ at: now, merit, won: report.winner === 'ALLY', wave })
    record.skillId = currentLoadout.value.outerSkillId
    const after = localXiangyangGate(war.id, input.gate, now, ownSorties(war.id))
    const repelled = Array.from({ length: Math.max(0, after.state.wave - before.wave) }, (_, i) => before.wave + i)
    return {
      action: 'sortie', report, merit, repelled,
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

  function announce(result: XiangyangResult) {
    if (result.action === 'claim') {
      const skill = result.skillId ? SKILLS[result.skillId]?.name : undefined
      appendLog('JIANGHU', [
        { type: 'tag', text: '襄阳论功', tone: 'gold' },
        { type: 'text', text: ` 郭靖按战功行赏：${xiangyangRewardText(result.reward, skill)}。` },
      ])
      showToast(`襄阳封赏：元宝 +${result.reward.ingot}`, 'gold')
      return
    }
    play(result.report, result.action === 'sortie')
    if (result.action === 'drill') return showToast(`演练战功 ${result.merit}（不计入城门）`, 'info')
    const name = gateName(result.gate.id)
    showToast(`${name}战功 +${result.merit}${result.repelled.length ? ` · 击退第 ${result.repelled.join('、')} 波` : ''}`, result.repelled.length ? 'gold' : 'info')
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

  return { localXiangyang, xiangyangBoard, xiangyangError, refreshXiangyang, xiangyangAction }
}
