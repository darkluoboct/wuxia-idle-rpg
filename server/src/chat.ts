import type { PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'
import { FOREVER } from '../../shared/admin.ts'
import { CHAT_RULES, isChatChannel, maskBannedWords, normalizeChat } from '../../shared/chat.ts'
import type { ChatBootstrapDTO, ChatChannel, ChatConversationDTO, ChatMessageDTO, ChatPrivateBoardDTO, PlayerDTO, WsServerEvent } from '../../shared/protocol.ts'
import { requireSession } from './auth.ts'
import { db, serverTime, transaction } from './db.ts'
import { GameError, objectBody } from './http.ts'
import type { ChatSpeaker, registerRooms } from './rooms.ts'

/**
 * 江湖传音（docs/23）：世界、门派、同图、私聊。发言经 /ws，先校验、查禁言与屏蔽、过屏蔽词，
 * 留档后按频道投递；连上时经 HTTP 取回各频道最近的话与私聊会话。
 */
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const muteTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

let bannedWords: Promise<string[]> | undefined
/** 屏蔽词：进程里缓存一份，后台改了就作废重读 */
export function chatBannedWords() {
  bannedWords ??= db.query<{ word: string }>('SELECT word FROM chat_banned_words ORDER BY length(word) DESC, word')
    .then(({ rows }) => rows.map(({ word }) => word))
    .catch((error) => { bannedWords = undefined; throw error })
  return bannedWords
}
export function reloadChatBannedWords() {
  bannedWords = undefined
}

type MessageRow = {
  id: string; channel: ChatChannel; sender_id: string; sender_name: string; sender_sect: string
  recipient_id: string | null; recipient_name: string | null; content: string; created_at: string
}
export const MESSAGE_COLUMNS = `m.id::text, m.channel, m.sender_id, m.sender_name, m.sender_sect, m.recipient_id,
  r.nickname AS recipient_name, m.content, m.created_at`

export function chatMessageOf(row: MessageRow): ChatMessageDTO {
  return {
    id: row.id, channel: row.channel, sender: { id: row.sender_id, nickname: row.sender_name, sectName: row.sender_sect },
    ...(row.recipient_id ? { to: { id: row.recipient_id, nickname: row.recipient_name ?? '' } } : {}),
    content: row.content, sentAt: Number(row.created_at),
  }
}

export function registerChat(app: FastifyInstance, rooms: ReturnType<typeof registerRooms>) {
  /** 每人每个频道上次发言的时刻 */
  const lastSent = new Map<string, Partial<Record<ChatChannel, number>>>()

  rooms.onChat((speaker, message) => {
    void speak(speaker, message).catch((error) => {
      app.log.error(error)
      speaker.reply({ event: 'CHAT_REJECTED', data: { code: 'CHAT_FAILED', message: '这句话没送出去，稍后再试' } })
    })
  })

  async function speak(speaker: ChatSpeaker, message: unknown) {
    const reject = (code: string, text: string) => speaker.reply({ event: 'CHAT_REJECTED', data: { code, message: text } })
    const input = message && typeof message === 'object' ? message as Record<string, unknown> : {}
    const channel = input.channel ?? 'MAP'
    if (!isChatChannel(channel)) return reject('INVALID_CHAT', '没有这个频道')
    const content = normalizeChat(input.content)
    if (!content) return reject('INVALID_CHAT', `请输入 1 至 ${CHAT_RULES.maxLength} 字的消息`)
    if (channel === 'WORLD' && speaker.level < CHAT_RULES.worldMinLevel) return reject('CHAT_LEVEL', `${CHAT_RULES.worldMinLevel} 级之后才能在世界频道说话`)
    if (channel === 'SECT' && !speaker.sectId) return reject('CHAT_NO_SECT', '拜入门派后才能在门派频道说话')
    const to = typeof input.to === 'string' ? input.to.toLowerCase() : ''
    if (channel === 'PRIVATE' && (!UUID.test(to) || to === speaker.playerId)) return reject('CHAT_NO_TARGET', '请选择要私聊的侠客')

    const now = Date.now()
    const sent = lastSent.get(speaker.playerId) ?? {}
    const cooldown = CHAT_RULES.cooldownMs[channel]
    if (now - (sent[channel] ?? 0) < cooldown) {
      return reject('CHAT_RATE_LIMIT', channel === 'WORLD' ? `世界频道每 ${cooldown / 1000} 秒才能说一句` : '歇一歇再发')
    }
    lastSent.set(speaker.playerId, { ...sent, [channel]: now })

    const delivered = await transaction(async (client) => {
      const { rows: [self] } = await client.query<{ muted_until: string | null }>('SELECT muted_until FROM players WHERE id = $1', [speaker.playerId])
      const mutedUntil = Number(self?.muted_until ?? 0)
      if (mutedUntil > now) {
        reject('CHAT_MUTED', mutedUntil >= FOREVER ? '你已被禁言' : `你已被禁言至 ${muteTime.format(mutedUntil)}（北京时间）`)
        return
      }
      let recipient: { id: string; nickname: string } | undefined
      if (channel === 'PRIVATE') {
        const { rows: [row] } = await client.query<{ id: string; nickname: string; blocked: boolean }>(`
          SELECT p.id, p.nickname, EXISTS (SELECT 1 FROM chat_blocks b WHERE b.player_id = p.id AND b.blocked_id = $2) AS blocked
          FROM players p WHERE p.id = $1`, [to, speaker.playerId])
        if (!row) return void reject('CHAT_NO_TARGET', '找不到这位侠客')
        if (row.blocked) return void reject('CHAT_BLOCKED', '对方不便收你的私聊')
        recipient = { id: row.id, nickname: row.nickname }
      }
      const scope = channel === 'SECT' ? speaker.sectId : channel === 'MAP' ? speaker.mapId : null
      const text = maskBannedWords(content, await chatBannedWords())
      const sentAt = await serverTime(client)
      const { rows: [{ id }] } = await client.query<{ id: string }>(`
        INSERT INTO chat_messages (channel, scope, sender_id, sender_name, sender_sect, recipient_id, content, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text`,
        [channel, scope, speaker.playerId, speaker.nickname, speaker.sectName, recipient?.id ?? null, text, sentAt])
      const dto: ChatMessageDTO = {
        id, channel, sender: { id: speaker.playerId, nickname: speaker.nickname, sectName: speaker.sectName },
        ...(recipient ? { to: recipient } : {}), content: text, sentAt,
      }
      return { dto, scope }
    })
    if (!delivered) return
    const event: WsServerEvent = { event: 'CHAT_MESSAGE', data: delivered.dto }
    if (channel === 'WORLD') rooms.announce(event)
    else if (channel === 'SECT') rooms.sendToSect(delivered.scope!, event)
    else if (channel === 'MAP') rooms.sendToMap(delivered.scope!, event)
    else {
      rooms.sendToPlayer(delivered.dto.to!.id, event)
      rooms.sendToPlayer(speaker.playerId, event)
    }
  }

  type Reader = Pick<PoolClient, 'query'>
  async function me(accountId: string, reader: Reader = db) {
    const { rows: [row] } = await reader.query<{ id: string; profile: PlayerDTO }>('SELECT id, profile FROM players WHERE account_id = $1', [accountId])
    if (!row) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
    return row
  }
  const since = (now: number) => now - CHAT_RULES.retentionDays * 86_400_000

  /** 世界、门派、同图最近的话（旧的在前）；门派频道没拜师时为空 */
  app.get<{ Querystring: { channel?: string } }>('/api/v1/chat', async (request): Promise<ChatMessageDTO[]> => {
    const { accountId } = await requireSession(request)
    const channel = request.query.channel
    if (channel !== 'WORLD' && channel !== 'SECT' && channel !== 'MAP') throw new GameError(400, 'INVALID_CHANNEL', '没有这个频道')
    const player = await me(accountId)
    return history(db, player, channel)
  })

  async function history(reader: Reader, player: Awaited<ReturnType<typeof me>>, channel: Exclude<ChatChannel, 'PRIVATE'>) {
    const scope = channel === 'SECT' ? player.profile.currentSectId ?? null : channel === 'MAP' ? player.profile.currentMapId : null
    if (channel === 'SECT' && !scope) return []
    const { rows } = await reader.query<MessageRow>(`
      SELECT ${MESSAGE_COLUMNS} FROM chat_messages m LEFT JOIN players r ON r.id = m.recipient_id
      WHERE m.channel = $1 AND ${scope === null ? 'm.scope IS NULL AND $2::text IS NULL' : 'm.scope = $2'} AND NOT m.hidden ORDER BY m.id DESC LIMIT $3`,
    [channel, scope, CHAT_RULES.historyLimit])
    return rows.reverse().map(chatMessageOf)
  }

  /** 私聊会话（最近的在前）与屏蔽名单 */
  app.get('/api/v1/chat/private', async (request): Promise<ChatPrivateBoardDTO> => {
    const { accountId } = await requireSession(request)
    const player = await me(accountId)
    return privateBoard(db, player.id)
  })

  async function privateBoard(reader: Reader, playerId: string): Promise<ChatPrivateBoardDTO> {
    const now = Date.now()
    const { rows } = await reader.query<MessageRow & { peer: string; peer_name: string; unread: number }>(`
      WITH mine AS (
        SELECT m.*, CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS peer
        FROM chat_messages m WHERE m.channel = 'PRIVATE' AND NOT m.hidden AND (m.sender_id = $1 OR m.recipient_id = $1) AND m.created_at > $2
      ), latest AS (SELECT DISTINCT ON (peer) * FROM mine ORDER BY peer, id DESC)
      SELECT l.id::text, l.channel, l.sender_id, l.sender_name, l.sender_sect, l.recipient_id, r.nickname AS recipient_name, l.content, l.created_at,
        l.peer, p.nickname AS peer_name,
        (SELECT count(*)::int FROM mine u WHERE u.peer = l.peer AND u.recipient_id = $1 AND u.read_at IS NULL) AS unread
      FROM latest l JOIN players p ON p.id = l.peer LEFT JOIN players r ON r.id = l.recipient_id
      ORDER BY l.id DESC LIMIT 50`, [playerId, since(now)])
    const { rows: blocked } = await reader.query<{ id: string; nickname: string }>(`
      SELECT p.id, p.nickname FROM chat_blocks b JOIN players p ON p.id = b.blocked_id WHERE b.player_id = $1 ORDER BY b.created_at DESC`, [playerId])
    const conversations: ChatConversationDTO[] = rows.map((row) => ({ peer: { id: row.peer, nickname: row.peer_name }, last: chatMessageOf(row), unread: row.unread }))
    return { conversations, blocked }
  }

  app.get('/api/v1/chat/bootstrap', async (request): Promise<ChatBootstrapDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const player = await me(accountId, client)
      const channels = {
        WORLD: await history(client, player, 'WORLD'),
        MAP: await history(client, player, 'MAP'),
        SECT: await history(client, player, 'SECT'),
      }
      return { channels, mapId: player.profile.currentMapId, sectId: player.profile.currentSectId, ...await privateBoard(client, player.id) }
    }, true)
  })

  /** 与某人的私聊（旧的在前） */
  app.get<{ Params: { peerId: string } }>('/api/v1/chat/private/:peerId', async (request): Promise<ChatMessageDTO[]> => {
    const { accountId } = await requireSession(request)
    const player = await me(accountId)
    const peer = request.params.peerId.toLowerCase()
    if (!UUID.test(peer)) throw new GameError(404, 'PLAYER_NOT_FOUND', '找不到这位侠客')
    const { rows } = await db.query<MessageRow>(`
      SELECT ${MESSAGE_COLUMNS} FROM chat_messages m LEFT JOIN players r ON r.id = m.recipient_id
      WHERE m.channel = 'PRIVATE' AND NOT m.hidden AND m.created_at > $3
        AND ((m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1))
      ORDER BY m.id DESC LIMIT $4`, [player.id, peer, since(Date.now()), CHAT_RULES.historyLimit])
    return rows.reverse().map(chatMessageOf)
  })

  /** 读过某人的私聊 */
  app.post<{ Params: { peerId: string } }>('/api/v1/chat/private/:peerId/read', async (request) => {
    const { accountId } = await requireSession(request)
    const player = await me(accountId)
    const peer = request.params.peerId.toLowerCase()
    if (!UUID.test(peer)) throw new GameError(404, 'PLAYER_NOT_FOUND', '找不到这位侠客')
    await db.query(`UPDATE chat_messages SET read_at = $3 WHERE channel = 'PRIVATE' AND recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [player.id, peer, Date.now()])
    return { ok: true }
  })

  /** 屏蔽或解除屏蔽某人 */
  app.post('/api/v1/chat/block', async (request) => {
    const { accountId } = await requireSession(request)
    const player = await me(accountId)
    const { playerId, blocked } = objectBody(request.body)
    const target = typeof playerId === 'string' ? playerId.toLowerCase() : ''
    if (!UUID.test(target) || target === player.id || typeof blocked !== 'boolean') throw new GameError(400, 'INVALID_INPUT', '请选择要屏蔽的侠客')
    if (blocked) {
      const { rowCount } = await db.query(`INSERT INTO chat_blocks (player_id, blocked_id, created_at)
        SELECT $1, id, $3 FROM players WHERE id = $2 ON CONFLICT DO NOTHING`, [player.id, target, Date.now()])
      if (!rowCount) {
        const { rowCount: exists } = await db.query('SELECT 1 FROM players WHERE id = $1', [target])
        if (!exists) throw new GameError(404, 'PLAYER_NOT_FOUND', '找不到这位侠客')
      }
    } else await db.query('DELETE FROM chat_blocks WHERE player_id = $1 AND blocked_id = $2', [player.id, target])
    return { ok: true }
  })
}

