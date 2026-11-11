import type { WsServerEvent } from './protocol'

const entryMode = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('mode')
export const IS_GUEST_ENTRY = entryMode === 'guest'
export const IS_MOCK_MODE = IS_GUEST_ENTRY || (entryMode !== 'online' && import.meta.env.MODE !== 'online' && import.meta.env.VITE_USE_MOCK !== 'false')

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

class WuxiaApiClient {
  private ws: WebSocket | null = null

  async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, requestId?: string): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (requestId) headers['Idempotency-Key'] = requestId
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(10_000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new ApiError(response.status, data?.code ?? '', data?.message ?? '江湖暂时连不上，请稍后再试')
    }
    if (data === null) throw new Error('接口没有返回存档')
    return data as T
  }

  connectWs(onEvent: (event: WsServerEvent) => void, onDisconnect: () => void) {
    this.closeWs()
    const url = new URL('/ws', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)
    this.ws = socket
    socket.onmessage = (message) => {
      if (this.ws !== socket) return
      let event: WsServerEvent
      try { event = JSON.parse(message.data) as WsServerEvent } catch { return }
      onEvent(event)
    }
    socket.onclose = () => {
      if (this.ws !== socket) return
      this.ws = null
      onDisconnect()
    }
  }

  closeWs() {
    const socket = this.ws
    this.ws = null
    socket?.close()
  }

  sendChat(content: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify({ event: 'CHAT_SEND', data: { content } }))
    return true
  }
}

export const apiClient = new WuxiaApiClient()
