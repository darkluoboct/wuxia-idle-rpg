import { FOREVER } from '../../../shared/admin.ts'

/** 后台接口（/api/admin，docs/22）；失败时抛出带服务端提示的错误 */
export class AdminError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

export async function adminApi<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method, credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  // 会话过期或被停用：通知外壳回到登录页
  if (response.status === 401 && path !== '/login' && path !== '/me') window.dispatchEvent(new Event('admin-expired'))
  if (!response.ok) throw new AdminError(response.status, data.code ?? 'ERROR', data.message ?? '请求失败，稍后再试')
  return data as T
}

const beijing = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

/** 北京时间；永久与未设置单独写 */
export const formatTime = (at: number | null | undefined) => at === null || at === undefined ? '—' : at >= FOREVER ? '永久' : beijing.format(at)

export const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败，稍后再试'

/** 元宝流水的来源 */
export const INGOT_REASON_LABEL: Record<string, string> = {
  start: '开局', milestone: '里程碑', daily: '每日江湖事', patrol: '巡历宝箱', huashan: '华山论剑', 'sect-contest': '门派演武',
  raid: '结义副本', xiangyang: '襄阳守卫战', mail: '系统邮件', gacha: '结缘抽卡', 'reunion-ticket': '故人重逢令',
  'auction-bid': '暗拍出价', 'auction-refund': '暗拍退还', 'auction-dividend': '暗拍红封',
}
