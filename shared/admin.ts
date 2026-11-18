import { ITEMS, SKILLS } from './gameData.ts'
import type { MailAttachments } from './protocol.ts'

export type { MailAttachments }

/**
 * 运营管理后台（docs/22）：权限、邮件附件规则与后台接口的数据形状。
 * 后台账号与玩家账号分开，三档权限逐级包含。
 */
export type AdminRole = 'SUPER' | 'OPERATOR' | 'SUPPORT'

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = { SUPER: '超管', OPERATOR: '运营', SUPPORT: '客服' }

/** 各项操作所需的最低权限 */
export const ADMIN_PERMISSIONS = {
  view: 'SUPPORT', kick: 'SUPPORT', mute: 'SUPPORT',
  ban: 'OPERATOR', resetPassword: 'OPERATOR', mail: 'OPERATOR', announce: 'OPERATOR',
  admins: 'SUPER',
} as const satisfies Record<string, AdminRole>
export type AdminPermission = keyof typeof ADMIN_PERMISSIONS

const RANK: Record<AdminRole, number> = { SUPPORT: 1, OPERATOR: 2, SUPER: 3 }
export const adminCan = (role: AdminRole, permission: AdminPermission) => RANK[role] >= RANK[ADMIN_PERMISSIONS[permission]]
export const isAdminRole = (value: unknown): value is AdminRole => typeof value === 'string' && Object.hasOwn(RANK, value)

/** 封号、禁言的「永久」 */
export const FOREVER = 253_402_300_799_000

// ==================== 系统邮件附件 ====================

/** 单封邮件的附件上限，防手滑 */
export const MAIL_LIMITS = { ingot: 10_000, silver: 10_000_000, qiExp: 100_000_000, items: 10, fragments: 100 } as const

/** 校验后台填的附件；返回整理好的附件，或一句错误 */
export function checkMailAttachments(value: unknown): MailAttachments | { error: string } {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return { error: '附件格式有误' }
  const input = value as Record<string, unknown>
  const result: MailAttachments = {}
  for (const key of ['ingot', 'silver', 'qiExp'] as const) {
    const amount = input[key]
    if (amount === undefined || amount === 0) continue
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0 || amount > MAIL_LIMITS[key]) {
      return { error: `${MAIL_LABEL[key]}要填 0 至 ${MAIL_LIMITS[key].toLocaleString()} 的整数` }
    }
    result[key] = amount
  }
  if (input.items !== undefined) {
    const items = input.items
    if (!Array.isArray(items) || items.length > MAIL_LIMITS.items) return { error: `装备一封最多 ${MAIL_LIMITS.items} 件` }
    const unknown = items.find((id) => typeof id !== 'string' || !ITEMS[id])
    if (unknown !== undefined) return { error: `没有这件装备：${String(unknown)}` }
    if (items.length) result.items = [...new Set(items as string[])]
  }
  if (input.fragments !== undefined) {
    const fragments = input.fragments
    if (!fragments || typeof fragments !== 'object' || Array.isArray(fragments)) return { error: '残页格式有误' }
    const entries = Object.entries(fragments as Record<string, unknown>)
    for (const [id, count] of entries) {
      if (!SKILLS[id]) return { error: `没有这门武学：${id}` }
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAIL_LIMITS.fragments) {
        return { error: `残页每门要填 1 至 ${MAIL_LIMITS.fragments} 张` }
      }
    }
    if (entries.length) result.fragments = Object.fromEntries(entries) as Record<string, number>
  }
  return result
}

const MAIL_LABEL = { ingot: '元宝', silver: '纹银', qiExp: '真气' } as const

export function mailAttachmentText(attachments: MailAttachments) {
  const parts: string[] = []
  for (const key of ['ingot', 'silver', 'qiExp'] as const) {
    if (attachments[key]) parts.push(`${MAIL_LABEL[key]} ${attachments[key]!.toLocaleString()}`)
  }
  for (const id of attachments.items ?? []) parts.push(`【${ITEMS[id]?.name ?? id}】`)
  for (const [id, count] of Object.entries(attachments.fragments ?? {})) parts.push(`《${SKILLS[id]?.name ?? id}》残页 ${count}`)
  return parts.join('、')
}

// ==================== 后台接口的数据形状 ====================

export interface AdminMeDTO { id: string; login: string; role: AdminRole }

export interface AdminDashboardDTO {
  serverTime: number
  online: number
  players: number
  newToday: number
  /** 今日收过功或有过操作的侠客 */
  activeToday: number
  banned: number
  /** 今日元宝流水按来源合计（正为产出，负为消耗） */
  ingotToday: { reason: string; amount: number; count: number }[]
  gachaToday: number
}

export interface AdminPlayerRowDTO {
  id: string
  nickname: string
  login: string
  level: number
  realmTier: number
  mapId: string
  online: boolean
  createdAt: number
  lastSettleAt: number
  bannedUntil: number | null
  mutedUntil: number | null
}

export interface AdminPlayerDetailDTO extends AdminPlayerRowDTO {
  banReason: string | null
  goldIngot: number
  silver: number
  qiExp: number
  sectId: string | null
  origin: string | null
  items: number
  skills: number
  companions: number
  ledger: { delta: number; balance: number; reason: string; ref: string | null; at: number }[]
  gacha: { pullNo: number; tier: string; kind: string; refId: string | null; at: number }[]
}

export interface AdminMailDTO {
  id: string
  title: string
  body: string
  attachments: MailAttachments
  /** 收件侠客；空为全服 */
  target: { id: string; nickname: string } | null
  existingOnly: boolean
  createdBy: string | null
  createdAt: number
  expiresAt: number
  revoked: boolean
  claims: number
}

export interface AdminAnnouncementDTO {
  id: string
  content: string
  startsAt: number
  endsAt: number
  createdBy: string | null
  createdAt: number
  revoked: boolean
}

export interface AdminAuditDTO { id: number; admin: string; action: string; target: string | null; detail: Record<string, unknown>; at: number }

export interface AdminAccountDTO { id: string; login: string; role: AdminRole; disabled: boolean; createdAt: number }

/** 审计日志里的操作名 */
export const ADMIN_ACTION_LABEL: Record<string, string> = {
  login: '登录', ban: '封号', unban: '解封', mute: '禁言', unmute: '解除禁言', kick: '踢下线', resetPassword: '重置密码',
  mail: '发邮件', revokeMail: '撤回邮件', announce: '发公告', revokeAnnouncement: '撤下公告',
  createAdmin: '新建后台账号', updateAdmin: '修改后台账号',
}
