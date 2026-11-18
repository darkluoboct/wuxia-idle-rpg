import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import {
  adminCan, checkMailAttachments, FOREVER, isAdminRole, type AdminAccountDTO, type AdminAnnouncementDTO, type AdminAuditDTO,
  type AdminDashboardDTO, type AdminMailDTO, type AdminMeDTO, type AdminPermission, type AdminPlayerDetailDTO, type AdminPlayerRowDTO,
  type AdminRole, type MailAttachments,
} from '../../shared/admin.ts'
import type { PlayerDTO } from '../../shared/protocol.ts'
import { registerAdminOps } from './adminOps.ts'
import { hashPassword, hashToken, newToken, verifyPassword } from './auth.ts'
import { db, serverTime, transaction } from './db.ts'
import { GameError, objectBody } from './http.ts'
import type { registerRooms } from './rooms.ts'

/**
 * 运营管理后台（docs/22）：后台账号与会话、总览、玩家查询与处置、系统邮件、全服公告、审计日志、后台账号管理。
 * 后台账号与玩家账号分开；每次写操作都记进 admin_audit。
 */
const COOKIE = 'wuxia_admin'
const SESSION_SECONDS = 12 * 60 * 60
const HOUR = 3_600_000
const DAY = 24 * HOUR
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

type Admin = AdminMeDTO
type Rooms = ReturnType<typeof registerRooms>

function checkAdminLogin(value: unknown) {
  const login = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!/^[a-z0-9_]{3,24}$/.test(login)) throw new GameError(400, 'INVALID_ADMIN_LOGIN', '后台账号用 3 至 24 位字母、数字或下划线')
  return login
}

function checkAdminPassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new GameError(400, 'WEAK_ADMIN_PASSWORD', '后台密码至少 12 位')
  }
  return value
}

/** 建后台账号；命令行建首个超管与超管在后台建号共用 */
export async function createAdminAccount(client: PoolClient | typeof db, loginName: string, password: string, role: AdminRole, now = Date.now()) {
  const login = checkAdminLogin(loginName)
  const id = randomUUID()
  const { rowCount } = await client.query(
    `INSERT INTO admin_accounts (id, login_name, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (login_name) DO NOTHING`, [id, login, await hashPassword(checkAdminPassword(password)), role, now])
  if (!rowCount) throw new GameError(409, 'ADMIN_LOGIN_TAKEN', '这个后台账号已存在')
  return id
}

/** 玩家的临时密码：易读，不含 0/O、1/l */
function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return [...randomBytes(12)].map((byte) => alphabet[byte % alphabet.length]).join('')
}

function text(value: unknown, field: string, max: number, min = 1) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if ([...trimmed].length < min || [...trimmed].length > max) throw new GameError(400, 'INVALID_INPUT', `${field}要写 ${min} 至 ${max} 字`)
  return trimmed
}

/** 封号、禁言时长：小时数，不填为永久 */
function untilOf(hours: unknown, now: number) {
  if (hours === undefined || hours === null) return FOREVER
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 24 * 3650) {
    throw new GameError(400, 'INVALID_DURATION', '时长要填 1 小时至 10 年，不填为永久')
  }
  return now + hours * HOUR
}

/** 北京时间的当日零点 */
const dayStartOf = (now: number) => Math.floor((now + 8 * HOUR) / DAY) * DAY - 8 * HOUR

export function registerAdmin(app: FastifyInstance, rooms: Rooms, secure: boolean) {
  const cookieOptions = { path: '/api/admin', httpOnly: true, sameSite: 'strict' as const, secure }

  async function requireAdmin(request: FastifyRequest, permission: AdminPermission): Promise<Admin> {
    const token = request.cookies[COOKIE]
    const { rows: [row] } = token && /^[\w-]{43}$/.test(token) ? await db.query<{ id: string; login_name: string; role: AdminRole; disabled: boolean }>(`
      SELECT a.id, a.login_name, a.role, a.disabled FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_id
      WHERE s.token_hash = $1 AND s.expires_at > clock_timestamp()`, [hashToken(token)]) : { rows: [] }
    if (!row || row.disabled) throw new GameError(401, 'ADMIN_SESSION_EXPIRED', '请重新登录后台')
    if (!adminCan(row.role, permission)) throw new GameError(403, 'ADMIN_FORBIDDEN', '你的后台权限不够')
    return { id: row.id, login: row.login_name, role: row.role }
  }

  async function audit(client: PoolClient | typeof db, admin: Admin, action: string, target: string | null, detail: Record<string, unknown>, now: number) {
    await client.query('INSERT INTO admin_audit (admin_id, admin_login, action, target, detail, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [admin.id, admin.login, action, target, detail, now])
  }

  /** 踢下线：删掉玩家账号的全部会话，断开在线连接 */
  async function endPlayerSessions(client: PoolClient, accountId: string) {
    const { rows } = await client.query<{ token_hash: string }>('DELETE FROM sessions WHERE account_id = $1 RETURNING token_hash', [accountId])
    return () => { for (const { token_hash: hash } of rows) rooms.closeSession(hash) }
  }

  // ==================== 登录 ====================
  app.post('/api/admin/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { loginName, password } = objectBody(request.body)
    const login = typeof loginName === 'string' ? loginName.trim().toLowerCase() : ''
    const { rows: [row] } = await db.query<{ id: string; password_hash: string; role: AdminRole; disabled: boolean }>(
      'SELECT id, password_hash, role, disabled FROM admin_accounts WHERE login_name = $1', [login])
    if (typeof password !== 'string' || !(await verifyPassword(password, row?.password_hash)) || row.disabled) {
      throw new GameError(401, 'BAD_ADMIN_CREDENTIALS', '后台账号或密码不对，或已停用')
    }
    const token = newToken()
    await db.query('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, clock_timestamp() + make_interval(secs => $3))',
      [hashToken(token), row.id, SESSION_SECONDS])
    const admin = { id: row.id, login, role: row.role }
    await audit(db, admin, 'login', null, { ip: request.ip }, Date.now())
    reply.setCookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS })
    return admin
  })

  app.post('/api/admin/logout', async (request, reply) => {
    const token = request.cookies[COOKIE]
    if (token) await db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(token)])
    reply.clearCookie(COOKIE, cookieOptions)
    return { ok: true }
  })

  app.get('/api/admin/me', (request) => requireAdmin(request, 'view'))
  registerAdminOps(app, rooms, { requireAdmin, audit, text })

  // ==================== 总览 ====================
  app.get('/api/admin/dashboard', async (request): Promise<AdminDashboardDTO> => {
    await requireAdmin(request, 'view')
    return transaction(async (client) => {
      const now = await serverTime(client)
      const dayStart = dayStartOf(now)
      const { rows: [counts] } = await client.query<{ players: number; new_today: number; active_today: number; banned: number; gacha_today: number }>(`
        SELECT (SELECT count(*)::int FROM players) AS players,
          (SELECT count(*)::int FROM players WHERE created_at >= $1) AS new_today,
          (SELECT count(*)::int FROM players WHERE last_settle_at >= $1 OR (profile->'trial'->>'lastPatrolAt')::bigint >= $1) AS active_today,
          (SELECT count(*)::int FROM accounts WHERE banned_until > $2) AS banned,
          (SELECT count(*)::int FROM gacha_log WHERE created_at >= $1) AS gacha_today`, [dayStart, now])
      const { rows: ingot } = await client.query<{ reason: string; amount: string; count: number }>(`
        SELECT reason, sum(delta) AS amount, count(*)::int AS count FROM ingot_ledger WHERE created_at >= $1
        GROUP BY reason ORDER BY abs(sum(delta)) DESC`, [dayStart])
      return {
        serverTime: now, online: rooms.onlineCount(), players: counts.players, newToday: counts.new_today, activeToday: counts.active_today,
        banned: counts.banned, gachaToday: counts.gacha_today,
        ingotToday: ingot.map(({ reason, amount, count }) => ({ reason, amount: Number(amount), count })),
      }
    }, true)
  })

  // ==================== 玩家 ====================
  type PlayerRow = {
    id: string; nickname: string; login_name: string; profile: PlayerDTO; created_at: string; last_settle_at: string
    banned_until: string | null; ban_reason: string | null; muted_until: string | null; account_id: string
  }
  const PLAYER_COLUMNS = `p.id, p.nickname, a.login_name, p.profile, p.created_at, p.last_settle_at,
    a.banned_until, a.ban_reason, p.muted_until, p.account_id`
  const nullableTime = (value: string | null) => value === null ? null : Number(value)

  function playerRow(row: PlayerRow): AdminPlayerRowDTO {
    return {
      id: row.id, nickname: row.nickname, login: row.login_name, level: row.profile.level, realmTier: row.profile.realmTier,
      mapId: row.profile.currentMapId, online: rooms.onlineMap(row.id) !== null,
      createdAt: Number(row.created_at), lastSettleAt: Number(row.last_settle_at),
      bannedUntil: nullableTime(row.banned_until), mutedUntil: nullableTime(row.muted_until),
    }
  }

  async function findPlayer(client: PoolClient | typeof db, id: string, lock = false) {
    if (!UUID.test(id)) throw new GameError(404, 'PLAYER_NOT_FOUND', '找不到这位侠客')
    const { rows: [row] } = await client.query<PlayerRow>(
      `SELECT ${PLAYER_COLUMNS} FROM players p JOIN accounts a ON a.id = p.account_id WHERE p.id = $1 ${lock ? 'FOR UPDATE OF a' : ''}`, [id])
    if (!row) throw new GameError(404, 'PLAYER_NOT_FOUND', '找不到这位侠客')
    return row
  }

  /** 按昵称、账号或角色 ID 找侠客；不填就列最近建角的 */
  app.get<{ Querystring: { q?: string } }>('/api/admin/players', async (request): Promise<AdminPlayerRowDTO[]> => {
    await requireAdmin(request, 'view')
    const q = (request.query.q ?? '').trim().slice(0, 40)
    const { rows } = await db.query<PlayerRow>(`
      SELECT ${PLAYER_COLUMNS} FROM players p JOIN accounts a ON a.id = p.account_id
      WHERE $1 = '' OR p.nickname ILIKE '%' || $1 || '%' OR a.login_name ILIKE '%' || $1 || '%' OR p.id::text = lower($1)
      ORDER BY p.created_at DESC, p.id LIMIT 50`, [q.replace(/[%_\\]/g, '\\$&')])
    return rows.map(playerRow)
  })

  app.get<{ Params: { id: string } }>('/api/admin/players/:id', async (request): Promise<AdminPlayerDetailDTO> => {
    await requireAdmin(request, 'view')
    const row = await findPlayer(db, request.params.id)
    const { rows: [counts] } = await db.query<{ items: number; skills: number; companions: number }>(`
      SELECT (SELECT count(*)::int FROM player_items WHERE player_id = $1) AS items,
        (SELECT count(*)::int FROM player_skills WHERE player_id = $1) AS skills,
        (SELECT count(*)::int FROM player_companions WHERE player_id = $1 AND (state->>'recruited')::boolean) AS companions`, [row.id])
    const { rows: ledger } = await db.query<{ delta: number; balance: number; reason: string; ref: string | null; created_at: string }>(
      'SELECT delta, balance, reason, ref, created_at FROM ingot_ledger WHERE player_id = $1 ORDER BY id DESC LIMIT 50', [row.id])
    const { rows: gacha } = await db.query<{ pull_no: number; tier: string; kind: string; ref_id: string | null; created_at: string }>(
      'SELECT pull_no, tier, kind, ref_id, created_at FROM gacha_log WHERE player_id = $1 ORDER BY pull_no DESC LIMIT 20', [row.id])
    const { profile } = row
    return {
      ...playerRow(row), ...counts, banReason: row.ban_reason,
      goldIngot: profile.goldIngot, silver: profile.silver, qiExp: profile.qiExp, sectId: profile.currentSectId ?? null, origin: profile.origin ?? null,
      ledger: ledger.map(({ created_at: at, ...entry }) => ({ ...entry, at: Number(at) })),
      gacha: gacha.map(({ pull_no: pullNo, tier, kind, ref_id: refId, created_at: at }) => ({ pullNo, tier, kind, refId, at: Number(at) })),
    }
  })

  const PLAYER_ACTIONS: Record<string, AdminPermission> = {
    ban: 'ban', unban: 'ban', mute: 'mute', unmute: 'mute', kick: 'kick', resetPassword: 'resetPassword',
  }

  /** 处置侠客：封号 / 解封 / 禁言 / 解除禁言 / 踢下线 / 重置密码 */
  app.post<{ Params: { id: string } }>('/api/admin/players/:id', async (request) => {
    const { action, hours, reason } = objectBody(request.body)
    const permission = typeof action === 'string' ? PLAYER_ACTIONS[action] : undefined
    if (!permission) throw new GameError(400, 'INVALID_ADMIN_ACTION', '请选择处置方式')
    const admin = await requireAdmin(request, permission)
    let after: (() => void) | undefined
    const result = await transaction(async (client) => {
      const now = await serverTime(client)
      const row = await findPlayer(client, request.params.id, true)
      const target = `${row.nickname}（${row.id}）`
      if (action === 'ban') {
        const why = text(reason, '封号理由', 100)
        const until = untilOf(hours, now)
        await client.query('UPDATE accounts SET banned_until = $2, ban_reason = $3 WHERE id = $1', [row.account_id, until, why])
        after = await endPlayerSessions(client, row.account_id)
        await audit(client, admin, 'ban', target, { until, reason: why }, now)
        return { ok: true }
      }
      if (action === 'unban') {
        await client.query('UPDATE accounts SET banned_until = NULL, ban_reason = NULL WHERE id = $1', [row.account_id])
        await audit(client, admin, 'unban', target, {}, now)
        return { ok: true }
      }
      if (action === 'mute') {
        const until = untilOf(hours, now)
        const why = typeof reason === 'string' ? reason.trim().slice(0, 100) : ''
        await client.query('UPDATE players SET muted_until = $2 WHERE id = $1', [row.id, until])
        await audit(client, admin, 'mute', target, { until, ...(why ? { reason: why } : {}) }, now)
        return { ok: true }
      }
      if (action === 'unmute') {
        await client.query('UPDATE players SET muted_until = NULL WHERE id = $1', [row.id])
        await audit(client, admin, 'unmute', target, {}, now)
        return { ok: true }
      }
      if (action === 'kick') {
        after = await endPlayerSessions(client, row.account_id)
        await audit(client, admin, 'kick', target, {}, now)
        return { ok: true }
      }
      // 重置密码：临时密码只在这次回执里出现一次，审计不记密码
      const password = temporaryPassword()
      await client.query('UPDATE accounts SET password_hash = $2 WHERE id = $1', [row.account_id, await hashPassword(password)])
      after = await endPlayerSessions(client, row.account_id)
      await audit(client, admin, 'resetPassword', target, {}, now)
      return { ok: true, password }
    })
    after?.()
    return result
  })

  // ==================== 系统邮件 ====================
  app.get('/api/admin/mails', async (request): Promise<AdminMailDTO[]> => {
    await requireAdmin(request, 'view')
    const { rows } = await db.query<{
      id: string; title: string; body: string; attachments: MailAttachments; player_id: string | null; nickname: string | null
      existing_only: boolean; created_by: string | null; created_at: string; expires_at: string; revoked: boolean; claims: number
    }>(`
      SELECT m.*, p.nickname, a.login_name AS created_by, (SELECT count(*)::int FROM mail_claims c WHERE c.mail_id = m.id) AS claims
      FROM mails m LEFT JOIN players p ON p.id = m.player_id LEFT JOIN admin_accounts a ON a.id = m.created_by
      ORDER BY m.created_at DESC LIMIT 100`)
    return rows.map((row) => ({
      id: row.id, title: row.title, body: row.body, attachments: row.attachments,
      target: row.player_id ? { id: row.player_id, nickname: row.nickname ?? '' } : null, existingOnly: row.existing_only,
      createdBy: row.created_by, createdAt: Number(row.created_at), expiresAt: Number(row.expires_at), revoked: row.revoked, claims: row.claims,
    }))
  })

  app.post('/api/admin/mails', async (request) => {
    const admin = await requireAdmin(request, 'mail')
    const body = objectBody(request.body)
    const title = text(body.title, '标题', 40)
    const content = text(body.body, '正文', 500, 0)
    const attachments = checkMailAttachments(body.attachments)
    if ('error' in attachments) throw new GameError(400, 'INVALID_ATTACHMENTS', attachments.error)
    const days = body.expiresInDays ?? 30
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 90) throw new GameError(400, 'INVALID_INPUT', '有效期要填 1 至 90 天')
    const playerId = body.playerId ?? null
    if (playerId !== null && (typeof playerId !== 'string' || !UUID.test(playerId))) throw new GameError(404, 'PLAYER_NOT_FOUND', '找不到这位侠客')
    const existingOnly = body.existingOnly === true
    const mail = await transaction(async (client) => {
      const now = await serverTime(client)
      const target = playerId ? await findPlayer(client, playerId) : null
      const id = randomUUID()
      await client.query(`INSERT INTO mails (id, title, body, attachments, player_id, existing_only, created_by, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, title, content, attachments, target?.id ?? null, existingOnly, admin.id, now, now + days * DAY])
      await audit(client, admin, 'mail', target ? `${target.nickname}（${target.id}）` : '全服',
        { mailId: id, title, attachments, ...(existingOnly ? { existingOnly } : {}) }, now)
      return { id, targetId: target?.id ?? null }
    })
    const event = { event: 'MAIL_NEW' as const, data: { title } }
    if (mail.targetId) rooms.sendToPlayer(mail.targetId, event)
    else rooms.announce(event)
    return { id: mail.id }
  })

  app.post<{ Params: { id: string } }>('/api/admin/mails/:id/revoke', async (request) => {
    const admin = await requireAdmin(request, 'mail')
    if (!UUID.test(request.params.id)) throw new GameError(404, 'MAIL_NOT_FOUND', '找不到这封邮件')
    return transaction(async (client) => {
      const now = await serverTime(client)
      const { rows: [mail] } = await client.query<{ title: string }>('UPDATE mails SET revoked = true WHERE id = $1 AND NOT revoked RETURNING title', [request.params.id])
      if (!mail) throw new GameError(404, 'MAIL_NOT_FOUND', '找不到这封邮件，或已撤回')
      await audit(client, admin, 'revokeMail', mail.title, { mailId: request.params.id }, now)
      return { ok: true }
    })
  })

  // ==================== 全服公告 ====================
  app.get('/api/admin/announcements', async (request): Promise<AdminAnnouncementDTO[]> => {
    await requireAdmin(request, 'view')
    const { rows } = await db.query<{ id: string; content: string; starts_at: string; ends_at: string; created_by: string | null; created_at: string; revoked: boolean }>(`
      SELECT n.id, n.content, n.starts_at, n.ends_at, a.login_name AS created_by, n.created_at, n.revoked
      FROM announcements n LEFT JOIN admin_accounts a ON a.id = n.created_by ORDER BY n.created_at DESC LIMIT 100`)
    return rows.map((row) => ({
      id: row.id, content: row.content, startsAt: Number(row.starts_at), endsAt: Number(row.ends_at),
      createdBy: row.created_by, createdAt: Number(row.created_at), revoked: row.revoked,
    }))
  })

  app.post('/api/admin/announcements', async (request) => {
    const admin = await requireAdmin(request, 'announce')
    const body = objectBody(request.body)
    const content = text(body.content, '公告', 120)
    const created = await transaction(async (client) => {
      const now = await serverTime(client)
      const startsAt = body.startsAt === undefined || body.startsAt === null ? now : body.startsAt
      const endsAt = body.endsAt
      if (typeof startsAt !== 'number' || typeof endsAt !== 'number' || !Number.isInteger(startsAt) || !Number.isInteger(endsAt) ||
        endsAt <= Math.max(startsAt, now) || endsAt - startsAt > 90 * DAY) {
        throw new GameError(400, 'INVALID_INPUT', '公告要有结束时间，晚于开始与现在，最长 90 天')
      }
      const id = randomUUID()
      await client.query('INSERT INTO announcements (id, content, starts_at, ends_at, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, content, startsAt, endsAt, admin.id, now])
      await audit(client, admin, 'announce', null, { announcementId: id, content, startsAt, endsAt }, now)
      return { id, content, startsAt, endsAt, live: startsAt <= now }
    })
    const { live, ...announcement } = created
    if (live) rooms.announce({ event: 'ANNOUNCEMENT', data: announcement })
    return { id: created.id }
  })

  app.post<{ Params: { id: string } }>('/api/admin/announcements/:id/revoke', async (request) => {
    const admin = await requireAdmin(request, 'announce')
    if (!UUID.test(request.params.id)) throw new GameError(404, 'ANNOUNCEMENT_NOT_FOUND', '找不到这条公告')
    return transaction(async (client) => {
      const now = await serverTime(client)
      const { rows: [row] } = await client.query<{ content: string }>(
        'UPDATE announcements SET revoked = true WHERE id = $1 AND NOT revoked RETURNING content', [request.params.id])
      if (!row) throw new GameError(404, 'ANNOUNCEMENT_NOT_FOUND', '找不到这条公告，或已撤下')
      await audit(client, admin, 'revokeAnnouncement', row.content, { announcementId: request.params.id }, now)
      return { ok: true }
    })
  })

  // ==================== 审计日志 ====================
  app.get<{ Querystring: { before?: string } }>('/api/admin/audit', async (request): Promise<AdminAuditDTO[]> => {
    await requireAdmin(request, 'view')
    const before = Number(request.query.before)
    const { rows } = await db.query<{ id: string; admin_login: string; action: string; target: string | null; detail: Record<string, unknown>; created_at: string }>(
      `SELECT id, admin_login, action, target, detail, created_at FROM admin_audit
       WHERE $1::bigint IS NULL OR id < $1 ORDER BY id DESC LIMIT 50`, [Number.isInteger(before) && before > 0 ? before : null])
    return rows.map((row) => ({ id: Number(row.id), admin: row.admin_login, action: row.action, target: row.target, detail: row.detail, at: Number(row.created_at) }))
  })

  // ==================== 后台账号 ====================
  app.get('/api/admin/admins', async (request): Promise<AdminAccountDTO[]> => {
    await requireAdmin(request, 'admins')
    const { rows } = await db.query<{ id: string; login_name: string; role: AdminRole; disabled: boolean; created_at: string }>(
      'SELECT id, login_name, role, disabled, created_at FROM admin_accounts ORDER BY created_at, login_name')
    return rows.map((row) => ({ id: row.id, login: row.login_name, role: row.role, disabled: row.disabled, createdAt: Number(row.created_at) }))
  })

  app.post('/api/admin/admins', async (request) => {
    const admin = await requireAdmin(request, 'admins')
    const { loginName, password, role } = objectBody(request.body)
    if (!isAdminRole(role)) throw new GameError(400, 'INVALID_ADMIN_ROLE', '请选择权限')
    return transaction(async (client) => {
      const now = await serverTime(client)
      const id = await createAdminAccount(client, String(loginName ?? ''), checkAdminPassword(password), role, now)
      await audit(client, admin, 'createAdmin', String(loginName).trim().toLowerCase(), { role }, now)
      return { id }
    })
  })

  /** 改权限、停用或启用、重设密码；不能对自己降权或停用，免得把自己锁在外面 */
  app.post<{ Params: { id: string } }>('/api/admin/admins/:id', async (request) => {
    const admin = await requireAdmin(request, 'admins')
    const { role, disabled, password } = objectBody(request.body)
    const { id } = request.params
    if (!UUID.test(id)) throw new GameError(404, 'ADMIN_NOT_FOUND', '找不到这个后台账号')
    if (role !== undefined && !isAdminRole(role)) throw new GameError(400, 'INVALID_ADMIN_ROLE', '请选择权限')
    if (disabled !== undefined && typeof disabled !== 'boolean') throw new GameError(400, 'INVALID_INPUT', '停用状态有误')
    if (id === admin.id && ((role !== undefined && role !== admin.role) || disabled === true)) {
      throw new GameError(409, 'ADMIN_SELF_LOCK', '不能给自己降权或停用自己')
    }
    const hash = password === undefined ? undefined : await hashPassword(checkAdminPassword(password))
    return transaction(async (client) => {
      const now = await serverTime(client)
      const { rows: [row] } = await client.query<{ login_name: string }>(`
        UPDATE admin_accounts SET role = COALESCE($2, role), disabled = COALESCE($3, disabled), password_hash = COALESCE($4, password_hash)
        WHERE id = $1 RETURNING login_name`, [id, role ?? null, disabled ?? null, hash ?? null])
      if (!row) throw new GameError(404, 'ADMIN_NOT_FOUND', '找不到这个后台账号')
      // 停用或改密码后，原有后台会话作废
      if (disabled === true || hash) await client.query('DELETE FROM admin_sessions WHERE admin_id = $1', [id])
      await audit(client, admin, 'updateAdmin', row.login_name, {
        ...(role !== undefined ? { role } : {}), ...(disabled !== undefined ? { disabled } : {}), ...(hash ? { password: '已重设' } : {}),
      }, now)
      return { ok: true }
    })
  })
}
