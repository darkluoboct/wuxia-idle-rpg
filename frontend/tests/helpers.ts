import { createPinia, disposePinia } from 'pinia'
import { createApp } from 'vue'
import { afterEach } from 'vitest'
import { useGameStore } from '@/stores/gameStore'
import type { OriginId } from '@/network/protocol'

export type Store = ReturnType<typeof useGameStore>
const activeGames: ReturnType<typeof createPinia>[] = []

afterEach(() => {
  for (const pinia of activeGames.splice(0)) disposePinia(pinia)
})

/**
 * 新建一个隔离的 store；可直接选择开局模式。
 * 新游戏默认按老角色处理（玩法全部开放），专门验证各玩法本身；gated 时按新手序章逐步开放（shared/features.ts）。
 * origin 给新游戏选家世（shared/origins.ts），不给就是没有家世的老式开局。
 */
export function newStore(mode?: 'NEW' | 'DEMO', { gated = false, origin }: { gated?: boolean; origin?: OriginId } = {}): Store {
  const pinia = createPinia()
  createApp({}).use(pinia)
  activeGames.push(pinia)
  const s = useGameStore(pinia)
  if (mode) s.startGame(mode, origin)
  if (mode === 'NEW' && !gated) delete s.player.featureGate
  return s
}

/** 把主角抬到足以打通全部主线的强度（用于验证流程，数值平衡见 balance.test.ts） */
export function boost(s: Store, level = 90) {
  s.player.level = level
  s.player.realmTier = 6
  Object.assign(s.player.stats, { str: 120, con: 120, agi: 120, intStat: 120 })
}

/** 打一个主线节点并跳到结算，返回胜负并关闭战场 */
export function playNode(s: Store, nodeId: number) {
  s.challengeChapter(nodeId)
  s.skipBattleToEnd()
  const winner = s.activeBattle?.winner
  s.closeBattleStage()
  return winner
}

/** 逐个了结待决奇遇：pick 返回 undefined 时选第一个可选项 */
export function resolvePending(s: Store, pick?: (templateId: string) => 'A' | 'B' | undefined) {
  for (let guard = 0; s.pendingAdventure && guard < 20; guard++) {
    const p = s.pendingAdventure
    const key = pick?.(p.templateId!) ?? p.options.find((o) => o.canSelect)?.key
    if (!key) throw new Error(`奇遇「${p.title}」没有可选项`)
    s.resolveAdventure(key)
    if (s.isBattlePlaying) {
      s.skipBattleToEnd()
      const won = s.activeBattle?.winner === 'ALLY'
      s.closeBattleStage()
      if (!won) break
    }
  }
}
