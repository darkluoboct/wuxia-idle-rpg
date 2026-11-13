import { afterEach, beforeEach, vi } from 'vitest'

// 测试跑在 node 环境：存档会读写 localStorage，这里给一个内存实现
const mem = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

beforeEach(() => {
  mem.clear()
  // 常规回归使用固定晴天。天气与夜战用例单独传入时刻或场景。
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-13T08:00:00+08:00'))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
