import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import {
  beijingDay, checkShopGoods, MAIL_LIMITS, RATE_KIND_LABEL, RATE_LIMITS, type AdminChatMessageDTO, type AdminMeDTO, type AdminPermission,
  type AdminRateBoostDTO, type AdminReportDTO, type AdminShopGoodsDTO, type MailAttachments, type RateBoostKind,
} from '../../shared/admin.ts'
import { MAPS, REALMS, SECTS } from '../../shared/gameData.ts'
import type { ChatChannel, ShopCurrency, ShopLimitKind } from '../../shared/protocol.ts'
import { db, serverTime, transaction } from './db.ts'
import { chatBannedWords, chatMessageOf, MESSAGE_COLUMNS, reloadChatBannedWords } from './chat.ts'
import { adjustPlayerAssets } from './game.ts'
import { GameError, objectBody } from './http.ts'
import { boostOf, reloadRateBoosts } from './rates.ts'
import type { registerRooms } from './rooms.ts'

/**
 * 运营后台二期（docs/22）：报表、倍率活动、运营商店、调整玩家资产；聊天监控与屏蔽词（docs/23）。
 * 权限、审计与文字校验沿用 admin.ts 的那一套，由它传进来。
 */
const HOUR = 3_600_000
const DAY = 24 * HOUR
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const REPORT_DAYS = 14

interface AdminTools {
  requireAdmin: (request: FastifyRequest, permission: AdminPermission) => Promise<AdminMeDTO>
  audit: (client: PoolClient | typeof db, admin: AdminMeDTO, action: string, target: string | null, detail: Record<string, unknown>, now: number) => Promise<void>
  text: (value: unknown, field: string, max: number, min?: number) => string
}

const dayLabel = (day: number) => new Date(day * DAY).toISOString().slice(0, 10)
/** 北京时间分日的 SQL 片段 */
const dayOf = (column: string) => `floor((${column} + ${8 * HOUR}) / ${DAY})::int`

function integer(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new GameError(400, 'INVALID_INPUT', `${field}要填 ${min.toLocaleString()} 至 ${max.toLocaleString()} 的整数`)
  }
  return value
}

export function registerAdminOps(app: FastifyInstance, rooms: ReturnType<typeof registerRooms>, { requireAdmin, audit, text }: AdminTools) {
  // ==================== 报表 ====================
  app.get('/api/admin/reports', async (request): Promise<AdminReportDTO> => {
    await requireAdmin(request, 'view')
    return transaction(async (client) => {
      const today = beijingDay(await serverTime(client))
      const first = today - REPORT_DAYS + 1
      const since = first * DAY - 8 * HOUR
      const perDay = async (sql: string, params: unknown[] = [since]) => {
        const { rows } = await client.query<{ day: number; value: string | number }>(sql, params)
        return new Map(rows.map(({ day, value }) => [day, Number(value)]))
      }
      const created = await perDay(`SELECT ${dayOf('created_at')} AS day, count(*) AS value FROM players WHERE created_at >= $1 GROUP BY 1`)
      const active = await perDay('SELECT day, count(*) AS value FROM player_activity_days WHERE day >= $1 GROUP BY 1', [first])
      const ingotIn = await perDay(`SELECT ${dayOf('created_at')} AS day, sum(delta) AS value FROM ingot_ledger WHERE created_at >= $1 AND delta > 0 GROUP BY 1`)
      const ingotOut = await perDay(`SELECT ${dayOf('created_at')} AS day, -sum(delta) AS value FROM ingot_ledger WHERE created_at >= $1 AND delta < 0 GROUP BY 1`)
      const gacha = await perDay(`SELECT ${dayOf('created_at')} AS day, count(*) AS value FROM gacha_log WHERE created_at >= $1 GROUP BY 1`)
      const shop = await perDay(`SELECT ${dayOf('created_at')} AS day, sum(price) AS value FROM shop_purchases WHERE created_at >= $1 AND currency = 'INGOT' GROUP BY 1`)
      const peak = await perDay(`SELECT ${dayOf('at')} AS day, max(online) AS value FROM online_samples WHERE at >= $1 GROUP BY 1`)

      const { rows: cohorts } = await client.query<{ day: number; cohort: number; d1: number; d3: number; d7: number }>(`
        WITH cohort AS (SELECT id, ${dayOf('created_at')} AS day FROM players WHERE created_at >= $1)
        SELECT c.day, count(*)::int AS cohort,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM player_activity_days a WHERE a.player_id = c.id AND a.day = c.day + 1))::int AS d1,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM player_activity_days a WHERE a.player_id = c.id AND a.day = c.day + 3))::int AS d3,
          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM player_activity_days a WHERE a.player_id = c.id AND a.day = c.day + 7))::int AS d7
        FROM cohort c GROUP BY c.day ORDER BY c.day DESC`, [since])

      const spread = async (expression: string, label: (key: string) => string) => {
        const { rows } = await client.query<{ key: string | null; count: number }>(
          `SELECT ${expression} AS key, count(*)::int AS count FROM players GROUP BY 1 ORDER BY count(*) DESC, 1`)
        return rows.map(({ key, count }) => ({ label: label(key ?? ''), count }))
      }
      const levels = await spread(`(((profile->>'level')::int - 1) / 10)::text`, (key) => `${Number(key) * 10 + 1}–${Number(key) * 10 + 10} 级`)
      levels.sort((a, b) => parseInt(a.label) - parseInt(b.label))

      return {
        days: Array.from({ length: REPORT_DAYS }, (_, index) => {
          const day = today - index
          return {
            day: dayLabel(day), newPlayers: created.get(day) ?? 0, active: active.get(day) ?? 0,
            ingotIn: ingotIn.get(day) ?? 0, ingotOut: ingotOut.get(day) ?? 0, gacha: gacha.get(day) ?? 0,
            shopIngot: shop.get(day) ?? 0, peakOnline: peak.get(day) ?? null,
          }
        }),
        retention: cohorts.map(({ day, cohort, d1, d3, d7 }) => ({
          day: dayLabel(day), cohort, d1: day + 1 <= today ? d1 : null, d3: day + 3 <= today ? d3 : null, d7: day + 7 <= today ? d7 : null,
        })),
        levels,
        realms: await spread(`profile->>'realmTier'`, (key) => REALMS.find(({ tier }) => tier === Number(key))?.name ?? `第 ${key} 境`),
        sects: await spread(`profile->>'currentSectId'`, (key) => SECTS.find(({ id }) => id === key)?.name ?? '逍遥散人'),
        maps: await spread(`profile->>'currentMapId'`, (key) => MAPS.find(({ id }) => id === key)?.name ?? key),
      }
    }, true)
  })

  // ==================== 倍率活动 ====================
  type BoostRow = Parameters<typeof boostOf>[0] & { created_by: string | null; created_at: string }

  /** 活动表变了：作废缓存重读，并推给全服在线侠客 */
  async function announceBoosts() {
    rooms.announce({ event: 'RATE_BOOSTS', data: await reloadRateBoosts() })
  }

  app.get('/api/admin/boosts', async (request): Promise<AdminRateBoostDTO[]> => {
    await requireAdmin(request, 'view')
    const { rows } = await db.query<BoostRow>(`
      SELECT b.id, b.kind, b.pct, b.title, b.starts_at, b.ends_at, a.login_name AS created_by, b.created_at
      FROM rate_boosts b LEFT JOIN admin_accounts a ON a.id = b.created_by ORDER BY b.created_at DESC LIMIT 100`)
    return rows.map((row) => ({ ...boostOf(row), createdBy: row.created_by, createdAt: Number(row.created_at) }))
  })

  app.post('/api/admin/boosts', async (request) => {
    const admin = await requireAdmin(request, 'rates')
    const body = objectBody(request.body)
    const kind = body.kind as RateBoostKind
    if (typeof kind !== 'string' || !Object.hasOwn(RATE_KIND_LABEL, kind)) throw new GameError(400, 'INVALID_INPUT', '请选择加成什么')
    const pct = integer(body.pct, '加成', 10, RATE_LIMITS.pct)
    const hours = integer(body.hours, '时长（小时）', 1, RATE_LIMITS.days * 24)
    const title = text(body.title ?? `${RATE_KIND_LABEL[kind]} ×${(100 + pct) / 100}`, '活动名', 30)
    const id = await transaction(async (client) => {
      const now = await serverTime(client)
      // 不能补发过去：开始时刻最早为此刻
      const startsAt = body.startsAt === undefined || body.startsAt === null ? now : Math.max(now, integer(body.startsAt, '开始时刻', 0, Number.MAX_SAFE_INTEGER))
      if (startsAt > now + RATE_LIMITS.days * DAY) throw new GameError(400, 'INVALID_INPUT', `开始时刻最多排到 ${RATE_LIMITS.days} 天后`)
      const id = randomUUID()
      await client.query(`INSERT INTO rate_boosts (id, kind, pct, title, starts_at, ends_at, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, kind, pct, title, startsAt, startsAt + hours * HOUR, admin.id, now])
      await audit(client, admin, 'createBoost', title, { boostId: id, kind, pct, startsAt, endsAt: startsAt + hours * HOUR }, now)
      return id
    })
    await announceBoosts()
    return { id }
  })

  /** 结束活动：还没开始的直接取消；进行中的结束在此刻，已累计的加成不收回 */
  app.post<{ Params: { id: string } }>('/api/admin/boosts/:id/end', async (request) => {
    const admin = await requireAdmin(request, 'rates')
    if (!UUID.test(request.params.id)) throw new GameError(404, 'BOOST_NOT_FOUND', '找不到这个活动')
    await transaction(async (client) => {
      const now = await serverTime(client)
      const { rows: [row] } = await client.query<BoostRow>('SELECT * FROM rate_boosts WHERE id = $1 FOR UPDATE', [request.params.id])
      if (!row) throw new GameError(404, 'BOOST_NOT_FOUND', '找不到这个活动')
      if (Number(row.ends_at) <= now) throw new GameError(409, 'BOOST_ENDED', '这个活动已经结束了')
      if (Number(row.starts_at) > now) await client.query('DELETE FROM rate_boosts WHERE id = $1', [row.id])
      else await client.query('UPDATE rate_boosts SET ends_at = $2 WHERE id = $1', [row.id, now])
      await audit(client, admin, 'endBoost', row.title, { boostId: row.id, cancelled: Number(row.starts_at) > now }, now)
    })
    await announceBoosts()
    return { ok: true }
  })

  // ==================== 运营商店 ====================
  type GoodsRow = {
    id: string; title: string; description: string; goods: MailAttachments; currency: ShopCurrency; price: number
    limit_kind: ShopLimitKind | null; limit_count: number | null; stock: number | null; sold: number; starts_at: string; ends_at: string | null
    sort: number; hidden: boolean; created_by: string | null; revenue: string; buyers: number
  }

  app.get('/api/admin/shop', async (request): Promise<AdminShopGoodsDTO[]> => {
    await requireAdmin(request, 'view')
    const { rows } = await db.query<GoodsRow>(`
      SELECT g.*, a.login_name AS created_by,
        (SELECT coalesce(sum(price), 0) FROM shop_purchases p WHERE p.goods_id = g.id) AS revenue,
        (SELECT count(DISTINCT player_id)::int FROM shop_purchases p WHERE p.goods_id = g.id) AS buyers
      FROM shop_goods g LEFT JOIN admin_accounts a ON a.id = g.created_by ORDER BY g.hidden, g.sort DESC, g.created_at DESC`)
    return rows.map((row) => ({
      id: row.id, title: row.title, description: row.description, goods: row.goods, currency: row.currency, price: row.price,
      limit: row.limit_kind ? { kind: row.limit_kind, count: row.limit_count! } : null, stock: row.stock, sold: row.sold,
      startsAt: Number(row.starts_at), endsAt: row.ends_at === null ? null : Number(row.ends_at), sort: row.sort, hidden: row.hidden,
      revenue: Number(row.revenue), buyers: row.buyers, createdBy: row.created_by,
    }))
  })

  /** 上架或修改时填的字段；修改时没填的保持原样 */
  function goodsFields(body: Record<string, unknown>, partial: boolean) {
    const fields: Record<string, unknown> = {}
    const has = (key: string) => !partial || body[key] !== undefined
    if (has('title')) fields.title = text(body.title, '商品名', 30)
    if (has('description')) fields.description = text(body.description ?? '', '说明', 200, 0)
    if (has('goods')) {
      const goods = checkShopGoods(body.goods)
      if ('error' in goods) throw new GameError(400, 'INVALID_GOODS', goods.error)
      fields.goods = goods
    }
    if (has('currency')) {
      if (body.currency !== 'INGOT' && body.currency !== 'SILVER') throw new GameError(400, 'INVALID_INPUT', '请选择用元宝还是纹银买')
      fields.currency = body.currency
    }
    if (has('price')) fields.price = integer(body.price, '价格', 1, body.currency === 'SILVER' ? MAIL_LIMITS.silver : 100_000)
    if (has('limit')) {
      const limit = body.limit as { kind?: unknown; count?: unknown } | null | undefined
      if (limit === null || limit === undefined) Object.assign(fields, { limit_kind: null, limit_count: null })
      else {
        if (typeof limit !== 'object' || !['TOTAL', 'DAILY', 'WEEKLY'].includes(String(limit.kind))) throw new GameError(400, 'INVALID_INPUT', '限购方式有误')
        Object.assign(fields, { limit_kind: limit.kind, limit_count: integer(limit.count, '限购次数', 1, 999) })
      }
    }
    if (has('stock')) fields.stock = body.stock === null || body.stock === undefined ? null : integer(body.stock, '库存', 0, 1_000_000)
    if (has('sort')) fields.sort = body.sort === undefined ? 0 : integer(body.sort, '排序', -999, 999)
    if (body.hidden !== undefined) {
      if (typeof body.hidden !== 'boolean') throw new GameError(400, 'INVALID_INPUT', '上下架状态有误')
      fields.hidden = body.hidden
    }
    return fields
  }

  /** 上架时长：开始时刻不填为此刻，小时数不填为长期 */
  function goodsWindow(body: Record<string, unknown>, now: number, startsAt: number) {
    const start = body.startsAt === undefined ? startsAt : body.startsAt === null ? now : integer(body.startsAt, '开始时刻', 0, Number.MAX_SAFE_INTEGER)
    const hours = body.hours === undefined || body.hours === null ? null : integer(body.hours, '上架时长（小时）', 1, 24 * 365)
    return { starts_at: start, ...(body.hours !== undefined ? { ends_at: hours === null ? null : start + hours * HOUR } : {}) }
  }

  app.post('/api/admin/shop', async (request) => {
    const admin = await requireAdmin(request, 'shop')
    const body = objectBody(request.body)
    const fields = goodsFields(body, false)
    return transaction(async (client) => {
      const now = await serverTime(client)
      const window = goodsWindow({ hours: null, ...body }, now, now)
      const id = randomUUID()
      const row = { id, ...fields, ...window, created_by: admin.id, created_at: now }
      const columns = Object.keys(row)
      await client.query(`INSERT INTO shop_goods (${columns.join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`, Object.values(row))
      await audit(client, admin, 'createGoods', fields.title as string, { goodsId: id, ...fields, ...window }, now)
      return { id }
    })
  })

  app.post<{ Params: { id: string } }>('/api/admin/shop/:id', async (request) => {
    const admin = await requireAdmin(request, 'shop')
    if (!UUID.test(request.params.id)) throw new GameError(404, 'GOODS_NOT_FOUND', '找不到这件商品')
    const body = objectBody(request.body)
    return transaction(async (client) => {
      const now = await serverTime(client)
      const { rows: [current] } = await client.query<GoodsRow>('SELECT * FROM shop_goods WHERE id = $1 FOR UPDATE', [request.params.id])
      if (!current) throw new GameError(404, 'GOODS_NOT_FOUND', '找不到这件商品')
      // 只改价格不改币种时，按原币种校验价格
      const fields = goodsFields({ ...body, ...(body.price !== undefined && body.currency === undefined ? { currency: current.currency } : {}) }, true)
      if (body.price !== undefined && body.currency === undefined) delete fields.currency
      const changes = { ...fields, ...(body.startsAt !== undefined || body.hours !== undefined ? goodsWindow(body, now, Number(current.starts_at)) : {}) }
      if (!Object.keys(changes).length) throw new GameError(400, 'INVALID_INPUT', '没有要改的')
      const ends = 'ends_at' in changes ? changes.ends_at : current.ends_at
      const starts = 'starts_at' in changes ? changes.starts_at : Number(current.starts_at)
      if (ends !== null && Number(ends) <= Number(starts)) throw new GameError(400, 'INVALID_INPUT', '下架时刻要晚于上架时刻')
      const columns = Object.keys(changes)
      await client.query(`UPDATE shop_goods SET ${columns.map((column, index) => `${column} = $${index + 2}`).join(', ')} WHERE id = $1`,
        [current.id, ...Object.values(changes)])
      await audit(client, admin, 'updateGoods', current.title, { goodsId: current.id, ...changes }, now)
      return { ok: true }
    })
  })

  // ==================== 调整玩家资产 ====================
  app.post<{ Params: { id: string } }>('/api/admin/players/:id/adjust', async (request) => {
    const admin = await requireAdmin(request, 'adjust')
    if (!UUID.test(request.params.id)) throw new GameError(404, 'PLAYER_NOT_FOUND', '找不到这位侠客')
    const body = objectBody(request.body)
    const amount = (key: 'ingot' | 'silver' | 'qiExp', field: string) =>
      body[key] === undefined ? 0 : integer(body[key], field, -MAIL_LIMITS[key], MAIL_LIMITS[key])
    const delta = { ingot: amount('ingot', '元宝'), silver: amount('silver', '纹银'), qiExp: amount('qiExp', '真气') }
    if (!delta.ingot && !delta.silver && !delta.qiExp) throw new GameError(400, 'INVALID_INPUT', '至少调整一样')
    const reason = text(body.reason, '调整原因', 100)
    const { snapshot, after } = await transaction(async (client) => {
      const now = await serverTime(client)
      const adjusted = await adjustPlayerAssets(client, request.params.id.toLowerCase(), delta, now)
      const { player } = adjusted.snapshot
      await audit(client, admin, 'adjust', `${player.nickname}（${player.id}）`, { ...delta, after: adjusted.after, reason }, now)
      return adjusted
    })
    // 在线的话推一下，他的页面会补读档案
    rooms.publish(snapshot)
    return { ok: true, after }
  })

  // ==================== 聊天监控与屏蔽词（docs/23） ====================
  /** 最近的聊天；私聊只在按侠客查时列出（处理举报用） */
  app.get<{ Querystring: { channel?: string; playerId?: string; before?: string } }>('/api/admin/chat', async (request): Promise<AdminChatMessageDTO[]> => {
    await requireAdmin(request, 'view')
    const { channel, playerId, before } = request.query
    const conditions: string[] = []
    const params: unknown[] = []
    if (channel) {
      if (!['WORLD', 'SECT', 'MAP', 'PRIVATE'].includes(channel)) throw new GameError(400, 'INVALID_CHANNEL', '没有这个频道')
      params.push(channel as ChatChannel)
      conditions.push(`m.channel = $${params.length}`)
    }
    if (playerId) {
      if (!UUID.test(playerId)) throw new GameError(404, 'PLAYER_NOT_FOUND', '找不到这位侠客')
      params.push(playerId.toLowerCase())
      conditions.push(`(m.sender_id = $${params.length} OR m.recipient_id = $${params.length})`)
    } else conditions.push("m.channel <> 'PRIVATE'")
    if (before) {
      params.push(integer(Number(before), '翻页位置', 1, Number.MAX_SAFE_INTEGER))
      conditions.push(`m.id < $${params.length}`)
    }
    const { rows } = await db.query<Parameters<typeof chatMessageOf>[0] & { scope: string | null; hidden: boolean }>(`
      SELECT ${MESSAGE_COLUMNS}, m.scope, m.hidden FROM chat_messages m LEFT JOIN players r ON r.id = m.recipient_id
      WHERE ${conditions.join(' AND ')} ORDER BY m.id DESC LIMIT 100`, params)
    return rows.map((row) => ({ ...chatMessageOf(row), scope: row.scope, hidden: row.hidden }))
  })

  /** 删除一句话：各频道里撤掉，留档标记为已删 */
  app.post<{ Params: { id: string } }>('/api/admin/chat/:id/hide', async (request) => {
    const admin = await requireAdmin(request, 'mute')
    if (!/^\d{1,18}$/.test(request.params.id)) throw new GameError(404, 'CHAT_NOT_FOUND', '找不到这句话')
    await transaction(async (client) => {
      const now = await serverTime(client)
      const { rows: [row] } = await client.query<{ sender_name: string; sender_id: string; channel: ChatChannel; content: string }>(
        'UPDATE chat_messages SET hidden = true WHERE id = $1 AND NOT hidden RETURNING sender_name, sender_id, channel, content', [request.params.id])
      if (!row) throw new GameError(404, 'CHAT_NOT_FOUND', '找不到这句话，或已经删过')
      await audit(client, admin, 'hideChat', `${row.sender_name}（${row.sender_id}）`, { chatId: request.params.id, channel: row.channel, content: row.content }, now)
    })
    rooms.announce({ event: 'CHAT_REMOVED', data: { id: request.params.id } })
    return { ok: true }
  })

  app.get('/api/admin/chat/words', async (request): Promise<string[]> => {
    await requireAdmin(request, 'view')
    return chatBannedWords()
  })

  /** 整份替换屏蔽词：每行一个，1~20 字，最多 2000 个 */
  app.post('/api/admin/chat/words', async (request) => {
    const admin = await requireAdmin(request, 'chatWords')
    const { words } = objectBody(request.body)
    if (!Array.isArray(words) || words.length > 2000) throw new GameError(400, 'INVALID_INPUT', '屏蔽词最多 2000 个')
    const list = [...new Set(words.map((word) => typeof word === 'string' ? word.trim() : ''))].filter(Boolean)
    const bad = list.find((word) => [...word].length > 20)
    if (bad) throw new GameError(400, 'INVALID_INPUT', `屏蔽词每个最多 20 字：${bad.slice(0, 20)}…`)
    await transaction(async (client) => {
      const now = await serverTime(client)
      await client.query('DELETE FROM chat_banned_words')
      if (list.length) await client.query('INSERT INTO chat_banned_words (word) SELECT unnest($1::text[])', [list])
      await audit(client, admin, 'chatWords', null, { count: list.length }, now)
    })
    reloadChatBannedWords()
    return { ok: true, count: list.length }
  })
}
