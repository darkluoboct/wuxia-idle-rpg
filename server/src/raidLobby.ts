import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { RaidLobbyDTO, RaidTeamDTO } from '../../shared/protocol.ts'
import { requireSession } from './auth.ts'
import { db } from './db.ts'
import { GameError, objectBody } from './http.ts'
import type { registerRooms } from './rooms.ts'

type Identity = { id: string; nickname: string }
type Team = {
  id: string
  leaderId: string
  members: Identity[]
  ready: Set<string>
  starting: boolean
  revision: number
}
type Invitation = { id: string; team: Team; target: Identity; expiresAt: number; timer: ReturnType<typeof setTimeout> }

export function registerRaidLobby(app: FastifyInstance, rooms: ReturnType<typeof registerRooms>) {
  // ponytail: 单服内测只在进程中维护候场队伍，通关结果和奖励走数据库事务。
  const memberships = new Map<string, Team>()
  const invitations = new Map<string, Invitation>()

  const conflict = (code: string, message: string) => new GameError(409, code, message)
  const teamInvites = (team: Team) => [...invitations.values()].filter((entry) => entry.team === team && entry.expiresAt > Date.now())

  function view(team: Team): RaidTeamDTO {
    return {
      id: team.id, leaderId: team.leaderId, starting: team.starting, revision: team.revision,
      members: team.members.map((member) => ({ ...member, ready: team.ready.has(member.id), online: rooms.onlineMap(member.id) !== null })),
      invited: teamInvites(team).map((entry) => entry.target),
    }
  }

  function sync(playerId: string) {
    const team = memberships.get(playerId)
    const invite = invitations.get(playerId)
    const data: RaidLobbyDTO = {
      team: team ? view(team) : null,
      invitation: invite && invite.expiresAt > Date.now()
        ? { id: invite.id, leaderNickname: invite.team.members[0].nickname, expiresAt: invite.expiresAt }
        : null,
    }
    rooms.sendToPlayer(playerId, { event: 'TEAM_ROOM_SYNC', data })
  }

  function changed(team: Team) {
    team.revision++
    for (const member of team.members) sync(member.id)
  }

  function dropInvitation(invite: Invitation) {
    clearTimeout(invite.timer)
    if (invitations.get(invite.target.id) === invite) invitations.delete(invite.target.id)
  }

  function expireInvitation(invite: Invitation) {
    if (invitations.get(invite.target.id) !== invite) return
    dropInvitation(invite)
    changed(invite.team)
    sync(invite.target.id)
  }

  function sameMap(left: string, right: string) {
    const map = rooms.onlineMap(left)
    return map !== null && rooms.isOnlineInMap(right, map)
  }

  function currentTeam(playerId: string, teamId: unknown) {
    const team = memberships.get(playerId)
    if (!team || team.id !== teamId) throw conflict('RAID_TEAM_CHANGED', '队伍有变化，请查看当前队伍')
    if (team.starting) throw conflict('RAID_STARTING', '正在破阵，请稍等')
    return team
  }

  function invitePlayer(actor: Identity, targetId: unknown) {
    if (typeof targetId !== 'string' || targetId === actor.id || !sameMap(actor.id, targetId)) {
      throw conflict('RAID_NOT_NEARBY', '请选择一位同图在线的侠客')
    }
    const target = rooms.onlinePlayer(targetId)
    if (!target || memberships.has(targetId)) throw conflict('RAID_ALREADY_GROUPED', '这位侠客已经在别的队伍里')
    const team = memberships.get(actor.id)
    if (team && (team.leaderId !== actor.id || team.starting)) throw conflict('RAID_LEADER_ONLY', '由队长邀请侠客入队')
    const incoming = invitations.get(actor.id)
    if (incoming && incoming.expiresAt > Date.now()) throw conflict('RAID_INVITE_PENDING', '先回应收到的组队邀请')
    const pending = invitations.get(targetId)
    if (pending && pending.expiresAt > Date.now()) {
      if (pending.team === team) return
      throw conflict('RAID_INVITE_PENDING', '这位侠客已有组队邀请在等回复')
    }
    if (pending) expireInvitation(pending)
    if (team && team.members.length + teamInvites(team).length >= 3) throw conflict('RAID_TEAM_FULL', '队伍的三个席位已占满')

    const party: Team = team ?? { id: randomUUID(), leaderId: actor.id, members: [actor], ready: new Set(), starting: false, revision: 0 }
    memberships.set(actor.id, party)
    const invitation: Invitation = {
      id: randomUUID(), team: party, target: { id: target.id, nickname: target.nickname }, expiresAt: Date.now() + 60_000,
      timer: setTimeout(() => expireInvitation(invitation), 60_000),
    }
    invitation.timer.unref()
    invitations.set(targetId, invitation)
    changed(party)
    sync(targetId)
  }

  function replyInvitation(actor: Identity, id: unknown, accept: boolean) {
    const invite = invitations.get(actor.id)
    if (!invite || invite.id !== id || invite.expiresAt <= Date.now()) throw conflict('RAID_INVITE_EXPIRED', '这封组队邀请已经失效')
    const { team } = invite
    if (accept) {
      if (memberships.has(actor.id) || team.members.length >= 3 || team.starting) throw conflict('RAID_TEAM_CHANGED', '队伍有变化，请重新邀请')
      if (!sameMap(team.leaderId, actor.id)) throw conflict('RAID_NOT_NEARBY', '与队长同图在线时才能入队')
      team.members.push(actor)
      team.ready.clear()
      memberships.set(actor.id, team)
    }
    dropInvitation(invite)
    changed(team)
    if (!accept) sync(actor.id)
  }

  function leaveTeam(actorId: string, team: Team) {
    if (actorId === team.leaderId) {
      for (const invite of invitations.values()) {
        if (invite.team !== team) continue
        dropInvitation(invite)
        sync(invite.target.id)
      }
      for (const member of team.members) {
        memberships.delete(member.id)
        sync(member.id)
      }
    } else {
      memberships.delete(actorId)
      team.members = team.members.filter((member) => member.id !== actorId)
      team.ready.clear()
      changed(team)
      sync(actorId)
    }
  }

  app.post('/api/v1/raid/team', async (request) => {
    const { accountId } = await requireSession(request)
    const { rows: [actor] } = await db.query<Identity>('SELECT id, nickname FROM players WHERE account_id = $1', [accountId])
    if (!actor) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
    const input = objectBody(request.body)
    switch (input.action) {
      case 'invite': invitePlayer(actor, input.targetPlayerId); break
      case 'accept': replyInvitation(actor, input.invitationId, true); break
      case 'decline': replyInvitation(actor, input.invitationId, false); break
      case 'leave': leaveTeam(actor.id, currentTeam(actor.id, input.teamId)); break
      case 'ready': {
        const team = currentTeam(actor.id, input.teamId)
        if (typeof input.ready !== 'boolean') throw new GameError(400, 'INVALID_RAID_READY', '准备状态有误')
        if (input.ready && (team.members.length !== 3 || !sameMap(team.leaderId, actor.id))) {
          throw conflict('RAID_NOT_READY', '三人到齐并与队长同图后再准备')
        }
        if (input.ready) team.ready.add(actor.id)
        else team.ready.delete(actor.id)
        changed(team)
        break
      }
      default: throw new GameError(400, 'INVALID_RAID_ACTION', '组队操作有误')
    }
    return { ok: true }
  })

  function readyTeam(leaderId: string, teamId: unknown, revision: unknown) {
    const team = currentTeam(leaderId, teamId)
    if (team.leaderId !== leaderId) throw conflict('RAID_LEADER_ONLY', '由队长带大家入阵')
    if (revision !== team.revision || team.members.length !== 3 || team.ready.size !== 3 ||
      team.members.some((member) => !sameMap(leaderId, member.id))) {
      throw conflict('RAID_NOT_READY', '等三位侠客同图并确认准备后再开打')
    }
    return team
  }

  function lineup(leaderId: string, teamId: unknown, revision: unknown) {
    const [leader, left, right] = readyTeam(leaderId, teamId, revision).members
    return [leader.id, left.id, right.id] as const
  }

  function reserve(leaderId: string, teamId: unknown, revision: unknown) {
    const team = readyTeam(leaderId, teamId, revision)
    team.starting = true
    changed(team)
    return () => {
      team.starting = false
      team.ready.clear()
      changed(team)
    }
  }

  rooms.onPresenceChange((playerId, resetReady) => {
    const team = memberships.get(playerId)
    if (!team) return sync(playerId)
    if (resetReady && team.ready.size) {
      team.ready.clear()
      changed(team)
    } else {
      for (const member of team.members) sync(member.id)
    }
  })
  app.addHook('onClose', async () => {
    for (const invite of invitations.values()) clearTimeout(invite.timer)
  })

  return { lineup, reserve }
}
