import { isAdminRole } from '../../shared/admin.ts'
import { createAdminAccount } from './admin.ts'
import { db } from './db.ts'

/** 建后台账号（首个超管只能这样建，不留默认密码）：ADMIN_PASSWORD=至少12位 npm run admin:create -- <账号> [SUPER|OPERATOR|SUPPORT] */
const [login, role = 'SUPER'] = process.argv.slice(2)
const password = process.env.ADMIN_PASSWORD
try {
  if (!login || !isAdminRole(role) || !password) {
    console.error('用法：ADMIN_PASSWORD=<至少 12 位> npm run admin:create -- <账号> [SUPER|OPERATOR|SUPPORT]')
    process.exitCode = 1
  } else {
    await createAdminAccount(db, login, password, role)
    console.log(`后台账号「${login}」已建好（${role}）`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await db.end()
}
