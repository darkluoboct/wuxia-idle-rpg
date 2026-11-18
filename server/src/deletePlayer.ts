import type { PoolClient } from 'pg'
import { GameError } from './http.ts'

/**
 * 删除角色（docs/24）：删前把角色整份转存进 deleted_players，30 天内可由后台恢复。
 * 删掉 players 行后，装备、武学、伙伴、榜单、摊位等随外键一并清掉；聊天、元宝流水、结缘与商行记录留档。
 */
export const DELETED_KEEP_MS = 30 * 86_400_000

/** 转存并删除；返回被删角色的 ID 与名号 */
export async function archiveAndDeletePlayer(client: PoolClient, playerId: string, deletedBy: string, now: number) {
  const { rows: [archived] } = await client.query<{ id: string; nickname: string }>(`
    INSERT INTO deleted_players (id, account_id, nickname, level, snapshot, deleted_at, deleted_by, purge_after)
    SELECT p.id, p.account_id, p.nickname, (p.profile->>'level')::int,
      jsonb_build_object(
        'player', to_jsonb(p),
        'items', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM player_items i WHERE i.player_id = p.id), '[]'),
        'skills', COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM player_skills s WHERE s.player_id = p.id), '[]'),
        'companions', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM player_companions c WHERE c.player_id = p.id), '[]'),
        'loadouts', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM player_loadouts l WHERE l.player_id = p.id), '[]')
      ), $2, $3, $2::bigint + $4::bigint
    FROM players p WHERE p.id = $1
    ON CONFLICT (id) DO UPDATE SET account_id = EXCLUDED.account_id, nickname = EXCLUDED.nickname, level = EXCLUDED.level,
      snapshot = EXCLUDED.snapshot, deleted_at = EXCLUDED.deleted_at, deleted_by = EXCLUDED.deleted_by,
      purge_after = EXCLUDED.purge_after, restored_at = NULL
    RETURNING id, nickname`, [playerId, now, deletedBy, DELETED_KEEP_MS])
  if (!archived) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
  await client.query('DELETE FROM players WHERE id = $1', [playerId])
  return archived
}

/** 恢复转存的角色：账号此刻没有角色、名号没被别人占才行；共修、榜单等随删除清掉的不再回来 */
export async function restoreDeletedPlayer(client: PoolClient, id: string, now: number) {
  const { rows: [row] } = await client.query<{ account_id: string; nickname: string; purge_after: string; restored_at: string | null }>(
    'SELECT account_id, nickname, purge_after, restored_at FROM deleted_players WHERE id = $1 FOR UPDATE', [id])
  if (!row || row.restored_at !== null || Number(row.purge_after) <= now) throw new GameError(404, 'DELETED_PLAYER_NOT_FOUND', '找不到这个已删除的角色，或已恢复、已过保留期')
  await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [row.account_id])
  const { rowCount: hasPlayer } = await client.query('SELECT 1 FROM players WHERE account_id = $1', [row.account_id])
  if (hasPlayer) throw new GameError(409, 'ACCOUNT_HAS_PLAYER', '这个账号已经新建了角色，不能再恢复旧角色')
  const { rowCount: taken } = await client.query('SELECT 1 FROM players WHERE nickname = $1', [row.nickname])
  if (taken) throw new GameError(409, 'NICKNAME_TAKEN', '这个名号已被别的角色占用')
  await client.query(`INSERT INTO players SELECT r.* FROM deleted_players d,
    jsonb_populate_record(NULL::players, d.snapshot->'player' || '{"co_cultivation_id": null}') r WHERE d.id = $1`, [id])
  for (const table of ['player_items', 'player_skills', 'player_companions', 'player_loadouts']) {
    const key = table.slice('player_'.length)
    await client.query(`INSERT INTO ${table} SELECT r.* FROM deleted_players d, jsonb_populate_recordset(NULL::${table}, d.snapshot->'${key}') r
      WHERE d.id = $1`, [id])
  }
  await client.query('UPDATE deleted_players SET restored_at = $2 WHERE id = $1', [id, now])
  return { accountId: row.account_id, nickname: row.nickname }
}

/** 名号保留：30 天内删掉的角色名只留给原账号 */
export async function nicknameReserved(client: PoolClient, nickname: string, accountId: string, now: number) {
  const { rowCount } = await client.query(
    'SELECT 1 FROM deleted_players WHERE nickname = $1 AND account_id <> $2 AND restored_at IS NULL AND purge_after > $3', [nickname, accountId, now])
  return !!rowCount
}
