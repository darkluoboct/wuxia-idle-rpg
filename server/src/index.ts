import Fastify, { type FastifyError } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { registerAuth } from './auth.ts'
import { db } from './db.ts'
import { registerGame } from './game.ts'
import { GameError } from './http.ts'
import { registerRaidLobby } from './raidLobby.ts'
import { registerRooms } from './rooms.ts'

const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:5173')
const app = Fastify({ logger: true, bodyLimit: 16_384 })
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
db.on('error', (error) => app.log.error(error))
app.addHook('onClose', async () => db.end())

try {
  await db.query('SELECT co_cultivation_id, shaoshi_clears FROM players LIMIT 0')
  await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT || 8080) })
} catch (error) {
  app.log.error(error)
  await app.close()
  process.exitCode = 1
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close())
}
