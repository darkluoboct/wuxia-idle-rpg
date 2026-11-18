import type { RateBoostDTO, RateBoostKind } from '../../shared/protocol.ts'
import { IDLE_CAP_MS } from '../../shared/trialStages.ts'
import { db } from './db.ts'

/**
 * 倍率活动（docs/22）：全服共用一张表，进程里缓存一份。每次操作前确认缓存够新，
 * 后台增改后立刻作废重读。只取挂机上限之内还会算到的活动。
 */
const FRESH_MS = 30_000
let cache: { boosts: RateBoostDTO[]; loadedAt: number } | undefined
let loading: Promise<RateBoostDTO[]> | undefined

type BoostRow = { id: string; kind: RateBoostKind; pct: number; title: string; starts_at: string; ends_at: string }

export const boostOf = (row: BoostRow): RateBoostDTO => ({
  id: row.id, kind: row.kind, pct: row.pct, title: row.title, startsAt: Number(row.starts_at), endsAt: Number(row.ends_at),
})

async function load() {
  const now = Date.now()
  const { rows } = await db.query<BoostRow>(
    'SELECT id, kind, pct, title, starts_at, ends_at FROM rate_boosts WHERE ends_at > $1 ORDER BY starts_at, id', [now - IDLE_CAP_MS])
  cache = { boosts: rows.map(boostOf), loadedAt: now }
  return cache.boosts
}

/** 缓存过期才重读；并发的请求共用同一次读取 */
export async function freshRateBoosts() {
  if (cache && Date.now() - cache.loadedAt < FRESH_MS) return cache.boosts
  loading ??= load().finally(() => { loading = undefined })
  return loading
}

/** 后台增改活动后调用，返回新表 */
export async function reloadRateBoosts() {
  cache = undefined
  return freshRateBoosts()
}

/** 已读进来的活动；结算是同步的，调用前须先 await freshRateBoosts() */
export function rateBoosts(kind?: RateBoostKind) {
  const boosts = cache?.boosts ?? []
  return kind ? boosts.filter((boost) => boost.kind === kind) : boosts
}
