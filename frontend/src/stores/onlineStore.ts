import { defineStore, getActivePinia } from 'pinia'
import { useOnlineGame, type OnlineGameCallbacks } from './onlineGame'

export const useOnlineStore = defineStore('wuxiaOnline', () => {
  // 登录页可以先建立会话。进入角色选择后才需要载入游戏状态。
  const pinia = getActivePinia()
  let callbacks: OnlineGameCallbacks | undefined
  const online = useOnlineGame(
    {
      snapshot: (value) => callbacks?.snapshot(value),
      event: (value) => callbacks?.event(value),
      disconnected: () => callbacks?.disconnected(),
      reset: () => callbacks?.reset(),
      error: (message) => callbacks?.error(message),
    },
    async () => (await import('./gameStore')).useGameStore(pinia),
  )

  function bindGame(value: OnlineGameCallbacks) {
    callbacks = value
    return () => {
      if (callbacks === value) callbacks = undefined
    }
  }

  return { ...online, bindGame }
})
