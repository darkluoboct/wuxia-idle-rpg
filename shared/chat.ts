import type { ChatChannel } from './protocol.ts'

export type { ChatChannel }

/**
 * 江湖传音（docs/23）：世界、门派、同图、私聊四个频道的规则，前后端共用。
 * 世界频道要到 10 级才能说话、10 秒一句，挡住小号刷屏；其余频道几秒一句。
 */
export const CHAT_RULES = {
  maxLength: 80,
  worldMinLevel: 10,
  cooldownMs: { WORLD: 10_000, SECT: 3_000, MAP: 2_000, PRIVATE: 1_000 } satisfies Record<ChatChannel, number>,
  /** 连上时每个频道取回的条数 */
  historyLimit: 50,
  /** 前端每个频道最多留的条数 */
  keepLimit: 100,
  /** 服务端留档天数 */
  retentionDays: 180,
} as const

export const CHAT_CHANNEL_LABEL: Record<ChatChannel, string> = { WORLD: '世界', SECT: '门派', MAP: '附近', PRIVATE: '私聊' }

export const isChatChannel = (value: unknown): value is ChatChannel => typeof value === 'string' && Object.hasOwn(CHAT_RULES.cooldownMs, value)

/** 去掉首尾空白、合并连续空白；不合规时返回空串 */
export function normalizeChat(value: unknown) {
  if (typeof value !== 'string') return ''
  const content = value.trim().replace(/\s+/g, ' ')
  return [...content].length <= CHAT_RULES.maxLength ? content : ''
}

/** 屏蔽词换成同样长度的 ＊；不分大小写 */
export function maskBannedWords(content: string, words: readonly string[]) {
  let masked = content
  for (const word of words) {
    if (!word) continue
    const lower = masked.toLowerCase()
    const target = word.toLowerCase()
    let at = lower.indexOf(target)
    while (at !== -1) {
      masked = masked.slice(0, at) + '＊'.repeat([...word].length) + masked.slice(at + word.length)
      at = masked.toLowerCase().indexOf(target, at + [...word].length)
    }
  }
  return masked
}
