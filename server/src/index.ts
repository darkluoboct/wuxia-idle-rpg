import Fastify, { type FastifyError } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { registerAdmin } from './admin.ts'
import { registerAuth } from './auth.ts'
import { registerChat } from './chat.ts'
import { CHAT_RULES } from '../../shared/chat.ts'
import { db } from './db.ts'
import { registerGame } from './game.ts'
import { GameError, TRUST_PROXY } from './http.ts'
import { registerRaidLobby } from './raidLobby.ts'
import { freshRateBoosts } from './rates.ts'
import { registerRooms } from './rooms.ts'

const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:5173')
const app = Fastify({ logger: true, bodyLimit: 16_384, trustProxy: TRUST_PROXY })
await app.register(cookie)
await app.register(rateLimit, { global: false })
await app.register(websocket, { options: { maxPayload: 4_096 } })

app.addHook('onRequest', async (request, reply) => {
  reply.header('Cache-Control', 'no-store')
  if ((request.method !== 'GET' || request.headers.upgrade?.toLowerCase() === 'websocket') && request.headers.origin !== origin.origin) {
    throw new GameError(403, 'ORIGIN_NOT_ALLOWED', '请从游戏页面连接江湖')
  }
})

app.setErrorHandler<FastifyError>((error, _request, reply) => {
  if (error instanceof GameError) return reply.code(error.statusCode).send({ code: error.code, message: error.message })
  if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
    const message = error.statusCode === 429 ? '稍等一会儿再试' : '提交的内容有误'
    return reply.code(error.statusCode).send({ code: error.code ?? 'INVALID_REQUEST', message })
  }
  app.log.error(error)
  return reply.code(500).send({ code: 'SERVER_ERROR', message: '江湖暂时连不上，请稍后再试' })
})

const rooms = registerRooms(app)
const raid = registerRaidLobby(app, rooms)
registerAuth(app, origin.protocol === 'https:', rooms.closeSession)
registerGame(app, rooms, raid)
registerChat(app, rooms)
registerAdmin(app, rooms, origin.protocol === 'https:')
db.on('error', (error) => app.log.error(error))

// 报表的在线人数：每 5 分钟留一个点，保留 35 天
const onlineSampler = setInterval(() => {
  const now = Date.now()
  db.query('INSERT INTO online_samples (at, online) VALUES ($1, $2) ON CONFLICT DO NOTHING', [now, rooms.onlineCount()])
    .then(() => db.query('DELETE FROM online_samples WHERE at < $1', [now - 35 * 86_400_000]))
    .catch((error) => app.log.error(error))
}, 5 * 60_000)
onlineSampler.unref()
// 聊天留档 180 天、删除的角色转存 30 天，每 6 小时清一次过期的
const chatPruner = setInterval(() => {
  db.query('DELETE FROM chat_messages WHERE created_at < $1', [Date.now() - CHAT_RULES.retentionDays * 86_400_000])
    .then(() => db.query('DELETE FROM deleted_players WHERE purge_after < $1', [Date.now()]))
    .catch((error) => app.log.error(error))
}, 6 * 3_600_000)
chatPruner.unref()
app.addHook('onClose', async () => {
  clearInterval(onlineSampler)
  clearInterval(chatPruner)
  await db.end()
})

try {
  await db.query('SELECT co_cultivation_id, shaoshi_clears, chongyang_clears, juxian_clears FROM players LIMIT 0')
  await db.query('SELECT chapter FROM chapter_one_statue LIMIT 0')
  await db.query('SELECT 1 FROM sect_contest_entries, sect_contest_results LIMIT 0')
  await db.query('SELECT 1 FROM admin_accounts, mails, mail_claims, announcements LIMIT 0')
  await db.query('SELECT 1 FROM rate_boosts, shop_goods, shop_purchases, player_activity_days, online_samples LIMIT 0')
  await db.query('SELECT 1 FROM chat_messages, chat_blocks, chat_banned_words, deleted_players LIMIT 0')
  await freshRateBoosts()
  await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT || 8080) })
} catch (error) {
  app.log.error(error)
  await app.close()
  process.exitCode = 1
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close())
}
