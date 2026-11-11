import { afterEach, beforeEach, vi } from 'vitest'

// 测试跑在 node 环境：存档会读写 localStorage，这里给一个内存实现
const mem = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
}

beforeEach(() => mem.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
