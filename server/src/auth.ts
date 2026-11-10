import { argon2, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import { db, transaction } from './db.ts'
import { GameError, objectBody } from './http.ts'

const COOKIE = 'wuxia_session'
const SESSION_SECONDS = 7 * 24 * 60 * 60
const derive = promisify(argon2)

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function sessionHash(request: FastifyRequest) {
  const token = request.cookies[COOKIE]
  return token && /^[\w-]{43}$/.test(token) ? hashToken(token) : null
}

function passwordKey(password: string, salt: Buffer) {
  return derive('argon2id', { message: password, nonce: salt, memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 })
}

function credentials(body: unknown) {
  const { loginName, password } = objectBody(body)
  const login = typeof loginName === 'string' ? loginName.trim().toLowerCase() : ''
  if (!/^[a-z0-9_]{3,24}$/.test(login) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new GameError(400, 'INVALID_CREDENTIALS', '账号用 3 至 24 位字母、数字或下划线，密码至少 8 位')
  }
  return { login, password }
}

async function addSession(client: typeof db | PoolClient, accountId: string) {
  const token = randomBytes(32).toString('base64url')
  await client.query(
    'INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, clock_timestamp() + make_interval(secs => $3))',
    [hashToken(token), accountId, SESSION_SECONDS],
  )
  return token
}

export async function requireSession(request: FastifyRequest) {
  const tokenHash = sessionHash(request)
  if (tokenHash) {
    const { rows } = await db.query<{ account_id: string; expires_at: Date }>(
      'SELECT account_id, expires_at FROM sessions WHERE token_hash = $1 AND expires_at > clock_timestamp()',
      [tokenHash],
    )
    if (rows[0]) return { accountId: rows[0].account_id, expiresAt: rows[0].expires_at.getTime(), tokenHash }
  }
  throw new GameError(401, 'SESSION_EXPIRED', '请重新登录')
}

export type Session = Awaited<ReturnType<typeof requireSession>>

export function registerAuth(app: FastifyInstance, secure: boolean, closeSession: (hash: string) => void) {
  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure }
  const limit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }
  const setSession = (reply: FastifyReply, token: string) => {
    reply.setCookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS })
  }

  app.post('/api/v1/auth/register', limit, async (request, reply) => {
    const { login, password } = credentials(request.body)
    const salt = randomBytes(16)
    const key = await passwordKey(password, salt)
    const token = await transaction(async (client) => {
      const id = randomUUID()
      const { rowCount } = await client.query(
        'INSERT INTO accounts (id, login_name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (login_name) DO NOTHING',
        [id, login, `${salt.toString('hex')}:${key.toString('hex')}`],
      )
      if (!rowCount) throw new GameError(409, 'LOGIN_TAKEN', '这个账号名已有人使用')
      return addSession(client, id)
    })
    setSession(reply, token)
    return reply.code(201).send({ hasPlayer: false })
  })

  app.post('/api/v1/auth/login', limit, async (request, reply) => {
    const { login, password } = credentials(request.body)
    const { rows } = await db.query<{ id: string; password_hash: string; has_player: boolean }>(
      'SELECT a.id, a.password_hash, EXISTS (SELECT 1 FROM players WHERE account_id = a.id) AS has_player FROM accounts a WHERE login_name = $1',
      [login],
    )
    const account = rows[0]
    const [salt, hash] = account ? account.password_hash.split(':') : ['0'.repeat(32), '0'.repeat(64)]
    const key = await passwordKey(password, Buffer.from(salt, 'hex'))
    if (!timingSafeEqual(key, Buffer.from(hash, 'hex')) || !account) {
      throw new GameError(401, 'BAD_CREDENTIALS', '账号或密码不对')
    }
    setSession(reply, await addSession(db, account.id))
    return { hasPlayer: account.has_player }
  })

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const hash = sessionHash(request)
    if (hash) {
      await db.query('DELETE FROM sessions WHERE token_hash = $1', [hash])
      closeSession(hash)
    }
    reply.clearCookie(COOKIE, cookieOptions)
    return { ok: true }
  })
}
