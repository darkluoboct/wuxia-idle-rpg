import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import type { GameAction, OriginId, PlayerAvatarId, PlayerSnapshot, WsServerEvent } from '@/network/protocol'
import { apiClient, ApiError, IS_MOCK_MODE } from '@/network/apiClient'

export interface OnlineGameCallbacks {
  snapshot: (value: PlayerSnapshot) => void
  event: (value: WsServerEvent) => void
  disconnected: () => void
  reset: () => void
  error: (message: string) => void
}

export function useOnlineGame(callbacks: OnlineGameCallbacks, prepare: () => Promise<unknown>) {
  const phase = ref<'loading' | 'login' | 'create' | 'ready' | 'error'>(IS_MOCK_MODE ? 'ready' : 'loading')
  const authBusy = ref(false)
  const authError = ref('')
  const roomConnected = ref(false)
  const submitting = shallowRef<{ path: string; body: unknown } | null>(null)
  const actionBusy = computed(() => submitting.value !== null)
  const retryAction = shallowRef<(() => Promise<void>) | null>(null)
  const revision = ref(0)
  let lastServerTime = 0
  let announcedRevision = 0
  let session = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectDelay = 1_000

  function apply(snapshot: PlayerSnapshot) {
    if (snapshot.revision < revision.value || (snapshot.revision === revision.value && snapshot.serverTime < lastServerTime)) return
    revision.value = snapshot.revision
    lastServerTime = snapshot.serverTime
    callbacks.snapshot(snapshot)
  }

  /** 结束本次在江湖的会话：登出回登录页；角色被删回建角（账号仍登录着） */
  function endSession(next: 'login' | 'create' = 'login') {
    session++
    clearTimeout(reconnectTimer)
    apiClient.closeWs()
    roomConnected.value = false
    submitting.value = null
    retryAction.value = null
    revision.value = 0
    lastServerTime = 0
    announcedRevision = 0
    reconnectDelay = 1_000
    phase.value = next
    callbacks.reset()
  }

  async function refresh() {
    const started = session
    try {
      const snapshot = await apiClient.request<PlayerSnapshot>('GET', '/player/me')
      if (started !== session || phase.value !== 'ready') return false
      apply(snapshot)
      return true
    } catch (error) {
      if (started === session && error instanceof ApiError && error.status === 401) endSession()
      // 别的设备上删了角色：回到建角
      else if (started === session && error instanceof ApiError && error.code === 'PLAYER_NOT_CREATED') endSession('create')
      return false
    }
  }

  function connect() {
    apiClient.connectWs((event) => {
      if (event.event === 'ROOM_SYNC') {
        roomConnected.value = true
        reconnectDelay = 1_000
      }
      if (event.event === 'PLAYER_CHANGED') {
        announcedRevision = Math.max(announcedRevision, event.data.revision)
        if (!actionBusy.value && announcedRevision > revision.value) void refresh()
        return
      }
      callbacks.event(event)
    }, () => {
      roomConnected.value = false
      callbacks.disconnected()
      reconnect()
    })
  }

  function reconnect() {
    if (phase.value !== 'ready') return
    reconnectTimer = setTimeout(async () => {
      const started = session
      const restored = await refresh()
      if (started !== session || phase.value !== 'ready') return
      if (restored) connect()
      else reconnect()
    }, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 15_000)
  }

  async function enter(snapshot: PlayerSnapshot) {
    const started = session
    await prepare()
    if (started !== session) return
    apply(snapshot)
    phase.value = 'ready'
    connect()
  }

  async function restore() {
    try {
      await enter(await apiClient.request<PlayerSnapshot>('GET', '/player/me'))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) phase.value = 'login'
      else if (error instanceof ApiError && error.code === 'PLAYER_NOT_CREATED') phase.value = 'create'
      else throw error
    }
  }

  async function authorize(task: () => Promise<void>) {
    if (authBusy.value) return
    authBusy.value = true
    authError.value = ''
    try {
      await task()
    } catch (error) {
      authError.value = error instanceof ApiError ? error.message : '暂时连不上江湖，请稍后再试'
      if (phase.value === 'loading') phase.value = 'error'
      if (phase.value === 'ready') callbacks.error(authError.value)
    } finally {
      authBusy.value = false
    }
  }

  function resume() {
    if (IS_MOCK_MODE) return
    return authorize(async () => {
      phase.value = 'loading'
      await restore()
    })
  }

  function signIn(mode: 'login' | 'register', loginName: string, password: string) {
    return authorize(async () => {
      const { hasPlayer } = await apiClient.request<{ hasPlayer: boolean }>('POST', `/auth/${mode}`, { loginName, password })
      if (IS_MOCK_MODE) return // 登录页将重新载入联机模式，由 resume 恢复服务端角色。
      if (hasPlayer) await restore()
      else phase.value = 'create'
    })
  }

  function create(nickname: string, avatarId: PlayerAvatarId, origin: OriginId) {
    return authorize(async () => {
      await enter(await apiClient.request<PlayerSnapshot>('POST', '/player/create', { nickname, avatarId, origin }))
    })
  }

  /** 删除角色（docs/24）：要角色名与账号密码，删后回到建角 */
  function deleteCharacter(nickname: string, password: string) {
    return authorize(async () => {
      await apiClient.request('POST', '/player/delete', { nickname, password })
      endSession('create')
    })
  }

  function logout() {
    return authorize(async () => {
      await apiClient.request('POST', '/auth/logout')
      endSession()
    })
  }

  function action<T>(method: 'POST' | 'PUT', path: string, body: unknown, done: (result: T) => void) {
    if (phase.value !== 'ready' || actionBusy.value || retryAction.value) return
    const requestId = crypto.randomUUID()
    const started = session
    async function execute() {
      if (started !== session || actionBusy.value || phase.value !== 'ready') return
      submitting.value = { path, body }
      try {
        const response = await apiClient.request<GameAction<T>>(method, path, body, requestId)
        if (started !== session) return
        apply(response.snapshot)
        retryAction.value = null
        done(response.result)
      } catch (error) {
        if (started !== session) return
        if (error instanceof ApiError && error.status < 500) {
          retryAction.value = null
          if (error.status === 401) endSession()
          else {
            callbacks.error(error.message)
            if (error.code === 'STALE_REVISION' || error.code.startsWith('CO_CULTIVATION_')) void refresh()
          }
        } else {
          retryAction.value = execute
          callbacks.error('连接中断，可以重试这次操作')
        }
      } finally {
        if (started === session) {
          submitting.value = null
          if (announcedRevision > revision.value) void refresh()
        }
      }
    }
    return execute()
  }

  function isSubmitting(path: string, fields: Record<string, unknown> = {}) {
    if (submitting.value?.path !== path) return false
    const body = submitting.value.body as Record<string, unknown> | undefined
    return Object.entries(fields).every(([key, value]) => body?.[key] === value)
  }

  onScopeDispose(() => {
    session++
    clearTimeout(reconnectTimer)
    apiClient.closeWs()
  })

  return {
    phase, authBusy, authError, roomConnected, revision,
    actionBusy, isSubmitting, canRetry: computed(() => retryAction.value !== null),
    resume, signIn, create, deleteCharacter, logout, action, retry: () => retryAction.value?.(),
  }
}
