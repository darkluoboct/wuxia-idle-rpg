/**
 * 本地存档（浏览器 localStorage）。
 * - 设置 VITE_LOCAL_SAVE=false 即整体关闭：不读、不写，每次启动都是全新开局。
 * - 正式环境应由服务端保存进度；届时关闭本地存档即可，store 的 snapshot / applySave 可直接复用为上传 / 下发格式。
 * - 读写失败（隐私模式、配额已满、数据损坏）一律静默降级，不影响游戏运行。
 */
export const LOCAL_SAVE_ENABLED = import.meta.env.VITE_LOCAL_SAVE !== 'false'

const SAVE_KEY = 'wuxia_idle_save'
/** 存档结构版本：结构有不兼容变化时 +1，旧档将被忽略 */
export const SAVE_VERSION = 1

export interface SaveEnvelope<T> {
  version: number
  savedAt: number
  data: T
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readSave<T>(): SaveEnvelope<T> | null {
  if (!LOCAL_SAVE_ENABLED) return null
  try {
    const raw = storage()?.getItem(SAVE_KEY)
    if (!raw) return null
    const env = JSON.parse(raw) as SaveEnvelope<T>
    return env && env.version === SAVE_VERSION && env.data ? env : null
  } catch {
    return null
  }
}

export function writeSave<T>(data: T): boolean {
  if (!LOCAL_SAVE_ENABLED) return false
  try {
    const env: SaveEnvelope<T> = { version: SAVE_VERSION, savedAt: Date.now(), data }
    storage()?.setItem(SAVE_KEY, JSON.stringify(env))
    return true
  } catch {
    return false
  }
}

export function clearSave() {
  try {
    storage()?.removeItem(SAVE_KEY)
  } catch {
    /* 忽略 */
  }
}
