import type { BattleReportDTO, LoadoutPresetDTO, PlayerDTO, WsServerEvent } from './protocol'

/**
 * 双模网络配置：
 * 默认启用内置本地模拟引擎 (VITE_USE_MOCK !== 'false')，让您无需启动后端即可完整交互体验所有玩法；
 * 当您的后端接口就绪时，在 .env.local 中设置 VITE_USE_MOCK=false 即可无缝直连真实服务端！
 */
export const IS_MOCK_MODE = import.meta.env.VITE_USE_MOCK !== 'false'
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8080/ws'

export class WuxiaApiClient {
  private token: string | null = localStorage.getItem('wuxia_jwt')
  private ws: WebSocket | null = null

  setToken(token: string) {
    this.token = token
    localStorage.setItem('wuxia_jwt', token)
  }

  async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    const resp = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(errText || `HTTP ${resp.status}`)
    }
    return (await resp.json()) as T
  }

  /** 连接真实后端的 WebSocket 房间广播网关 */
  connectWs(onEvent: (ev: WsServerEvent) => void) {
    if (IS_MOCK_MODE) return
    if (this.ws) this.ws.close()
    const url = this.token ? `${WS_URL}?token=${encodeURIComponent(this.token)}` : WS_URL
    this.ws = new WebSocket(url)
    this.ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as WsServerEvent
        onEvent(parsed)
      } catch {
        // ignore malformed frame
      }
    }
  }

  // 对应《第11册》REST路由契约的真实请求封装方法（供切换真实后端时直接调用）
  settleIdle() {
    return this.request<{ gainedQi: number; gainedSilver: number; player: PlayerDTO }>('POST', '/cultivate/settle')
  }
  breakthrough(usePill: boolean) {
    return this.request<{ success: boolean; message: string; player: PlayerDTO }>('POST', '/cultivate/breakthrough', { usePill })
  }
  saveLoadout(preset: LoadoutPresetDTO) {
    return this.request<void>('PUT', `/loadout/${preset.presetIdx}`, preset)
  }
  challengeHuashan(targetId: string) {
    return this.request<BattleReportDTO>('POST', '/huashan/challenge', { targetId })
  }
}

export const apiClient = new WuxiaApiClient()
