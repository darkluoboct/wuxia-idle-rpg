import { readdir, readFile } from 'node:fs/promises'
import { db, transaction } from './db.ts'

try {
  const directory = new URL('../migrations/', import.meta.url)
  const files = (await readdir(directory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()
  await transaction(async (client) => {
    for (const file of files) await client.query(await readFile(new URL(file, directory), 'utf8'))
  })
  console.log('问道武林数据库已就绪')
} finally {
  await db.end()
}
