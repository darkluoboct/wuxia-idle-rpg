import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '@/stores/gameStore'

export type Store = ReturnType<typeof useGameStore>

/** 新建一个隔离的 store；可直接选择开局模式 */
export function newStore(mode?: 'NEW' | 'DEMO'): Store {
  setActivePinia(createPinia())
  const s = useGameStore()
  if (mode) s.startGame(mode)
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
