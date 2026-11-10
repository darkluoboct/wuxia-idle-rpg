import pg, { type PoolClient } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('请先设置 DATABASE_URL')

export const db = new pg.Pool({ connectionString })

export async function transaction<T>(run: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
  const client = await db.connect()
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
    const value = await run(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function serverTime(client: PoolClient) {
  const { rows } = await client.query<{ ms: string }>(
    'SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms',
  )
  return Number(rows[0].ms)
}
