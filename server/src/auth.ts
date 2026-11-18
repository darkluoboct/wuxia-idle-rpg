import { argon2, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import { FOREVER } from '../../shared/admin.ts'
import { db, transaction } from './db.ts'
import { GameError, objectBody } from './http.ts'

const COOKIE = 'wuxia_session'
const SESSION_SECONDS = 7 * 24 * 60 * 60
const derive = promisify(argon2)

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export const newToken = () => randomBytes(32).toString('base64url')

function sessionHash(request: FastifyRequest) {
  const token = request.cookies[COOKIE]
  return token && /^[\w-]{43}$/.test(token) ? hashToken(token) : null
}

function passwordKey(password: string, salt: Buffer) {
  return derive('argon2id', { message: password, nonce: salt, memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 })
}

/** 存库的密码：盐与 Argon2id 结果，十六进制以冒号分隔 */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${(await passwordKey(password, salt)).toString('hex')}`
}

/** 校验密码；没有这个账号时也算一遍，不让响应时间泄露账号是否存在 */
export async function verifyPassword(password: string, stored: string | undefined) {
  const [salt, hash] = stored ? stored.split(':') : ['0'.repeat(32), '0'.repeat(64)]
  const key = await passwordKey(password, Buffer.from(salt, 'hex'))
  return timingSafeEqual(key, Buffer.from(hash, 'hex')) && !!stored
}

const banTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 封号中的账号：登录与每次请求都拦（docs/22） */
function requireNotBanned(bannedUntil: string | number | null, reason: string | null) {
  const until = bannedUntil === null ? 0 : Number(bannedUntil)
  if (until <= Date.now()) return
  const why = reason ? `：${reason}` : ''
  throw new GameError(403, 'ACCOUNT_BANNED', until >= FOREVER ? `账号已被永久封禁${why}` : `账号封禁至 ${banTime.format(until)}（北京时间）${why}`)
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
  const token = newToken()
  await client.query(
    'INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, clock_timestamp() + make_interval(secs => $3))',
    [hashToken(token), accountId, SESSION_SECONDS],
  )
  return token
}

export async function requireSession(request: FastifyRequest) {
  const tokenHash = sessionHash(request)
  if (tokenHash) {
    const { rows } = await db.query<{ account_id: string; expires_at: Date; banned_until: string | null; ban_reason: string | null }>(
      `SELECT s.account_id, s.expires_at, a.banned_until, a.ban_reason FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > clock_timestamp()`,
      [tokenHash],
    )
    if (rows[0]) {
      requireNotBanned(rows[0].banned_until, rows[0].ban_reason)
      return { accountId: rows[0].account_id, expiresAt: rows[0].expires_at.getTime(), tokenHash }
    }
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
    const passwordHash = await hashPassword(password)
    const token = await transaction(async (client) => {
      const id = randomUUID()
      const { rowCount } = await client.query(
        'INSERT INTO accounts (id, login_name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (login_name) DO NOTHING',
        [id, login, passwordHash],
      )
      if (!rowCount) throw new GameError(409, 'LOGIN_TAKEN', '这个账号名已有人使用')
      return addSession(client, id)
    })
    setSession(reply, token)
    return reply.code(201).send({ hasPlayer: false })
  })

  app.post('/api/v1/auth/login', limit, async (request, reply) => {
    const { login, password } = credentials(request.body)
    const { rows } = await db.query<{ id: string; password_hash: string; has_player: boolean; banned_until: string | null; ban_reason: string | null }>(
      `SELECT a.id, a.password_hash, a.banned_until, a.ban_reason, EXISTS (SELECT 1 FROM players WHERE account_id = a.id) AS has_player
       FROM accounts a WHERE login_name = $1`,
      [login],
    )
    const account = rows[0]
    if (!(await verifyPassword(password, account?.password_hash))) {
      throw new GameError(401, 'BAD_CREDENTIALS', '账号或密码不对')
    }
    requireNotBanned(account.banned_until, account.ban_reason)
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
