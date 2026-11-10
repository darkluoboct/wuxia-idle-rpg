import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { REALMS, SECTS } from '../../shared/gameData.ts'
import type { PlayerSnapshot, RoomPlayerDTO, WsServerEvent } from '../../shared/protocol.ts'
import { requireSession, type Session } from './auth.ts'
import { getSnapshot } from './game.ts'

interface Connection {
  socket: WebSocket
  session: Session
  alive: boolean
}

interface Member {
  info: RoomPlayerDTO
  mapId: string
  revision: number
  connections: Set<Connection>
  lastChatAt: number
}

function publicPlayer(snapshot: PlayerSnapshot): RoomPlayerDTO {
  const { player, loadouts, derivedStats } = snapshot
  return {
    id: player.id,
    nickname: player.nickname,
    sectName: SECTS.find((sect) => sect.id === player.currentSectId)?.name ?? '逍遥散人',
    realmName: REALMS.find((realm) => realm.tier === player.realmTier)?.name ?? REALMS[0].name,
    level: player.level,
    combatPower: derivedStats.combatPower,
    stance: loadouts[player.activePresetIdx - 1].stance,
    isBetrayerBounty: false,
    isEscortingDart: false,
  }
}

export function registerRooms(app: FastifyInstance) {
  const online = new Map<string, Member>()
  const joining = new WeakMap<FastifyRequest, { session: Session; snapshot: PlayerSnapshot }>()
  let onPresence: ((playerId: string, resetReady: boolean) => void) | undefined

  // ponytail: 内测直接从在线角色筛出同图成员，在线规模增长后可按地图索引。
  function membersOn(mapId: string) {
    return [...online.values()].filter((member) => member.mapId === mapId)
  }

  function send(connection: Connection, event: WsServerEvent) {
    if (connection.socket.readyState === 1) connection.socket.send(JSON.stringify(event))
  }

  function roomSnapshot(mapId: string, members: Member[]): WsServerEvent {
    return { event: 'ROOM_SYNC', data: { mapId, onlineCount: members.length, players: members.map((member) => member.info) } }
  }

  function broadcast(mapId: string, event?: WsServerEvent) {
    const members = membersOn(mapId)
    const message = event ?? roomSnapshot(mapId, members)
    for (const member of members) for (const connection of member.connections) send(connection, message)
  }

  function leave(member: Member, connection: Connection) {
    if (!member.connections.delete(connection)) return
    if (!member.connections.size) {
      online.delete(member.info.id)
      broadcast(member.mapId)
      onPresence?.(member.info.id, true)
    }
  }

  function publish(snapshot: PlayerSnapshot) {
    const member = online.get(snapshot.player.id)
    if (!member || member.revision >= snapshot.revision) return
    const oldMap = member.mapId
    const info = publicPlayer(snapshot)
    const profileChanged = JSON.stringify(info) !== JSON.stringify(member.info)
    member.info = info
    member.mapId = snapshot.player.currentMapId
    member.revision = snapshot.revision
    if (oldMap !== member.mapId) broadcast(oldMap)
    if (profileChanged || oldMap !== member.mapId) broadcast(member.mapId)
    for (const connection of member.connections) send(connection, { event: 'PLAYER_CHANGED', data: { revision: member.revision } })
    if (oldMap !== member.mapId) onPresence?.(member.info.id, true)
  }

  function closeSession(hash: string) {
    for (const member of online.values()) {
      for (const connection of member.connections) {
        if (connection.session.tokenHash === hash) {
          leave(member, connection)
          connection.socket.close(1008, 'Session ended')
        }
      }
    }
  }

  app.get('/ws', {
    websocket: true,
    preValidation: async (request) => {
      const session = await requireSession(request)
      const snapshot = await getSnapshot(session.accountId)
      joining.set(request, { session, snapshot })
    },
  }, (socket, request) => {
    const { session, snapshot } = joining.get(request)!
    joining.delete(request)
    const id = snapshot.player.id
    const existing = online.get(id)
    const member: Member = existing ?? {
      info: publicPlayer(snapshot),
      mapId: snapshot.player.currentMapId,
      revision: snapshot.revision,
      connections: new Set(),
      lastChatAt: 0,
    }
    const connection = { socket, session, alive: true }
    member.connections.add(connection)
    online.set(id, member)

    socket.on('close', () => leave(member, connection))
    socket.on('error', () => { leave(member, connection); socket.terminate() })
    socket.on('pong', () => { connection.alive = true })
    socket.on('message', (data, binary) => {
      if (!member.connections.has(connection)) return
      const now = Date.now()
      if (session.expiresAt <= now) {
        leave(member, connection)
        socket.close(1008, 'Session expired')
        return
      }
      let content = ''
      if (!binary) {
        try {
          const message = JSON.parse(data.toString())
          if (message?.event === 'CHAT_SEND' && typeof message.data?.content === 'string') {
            content = message.data.content.trim().replace(/\s+/g, ' ')
          }
        } catch { /* 格式错误通过 CHAT_REJECTED 告知 */ }
      }
      if (!content || [...content].length > 80) {
        send(connection, { event: 'CHAT_REJECTED', data: { code: 'INVALID_CHAT', message: '请输入 1 至 80 字的消息' } })
        return
      }
      if (now - member.lastChatAt < 2_000) {
        send(connection, { event: 'CHAT_REJECTED', data: { code: 'CHAT_RATE_LIMIT', message: '歇一歇再发' } })
        return
      }
      member.lastChatAt = now
      broadcast(member.mapId, {
        event: 'ROOM_CHAT',
        data: { id: randomUUID(), mapId: member.mapId, sender: { id, nickname: member.info.nickname }, content, sentAt: now },
      })
    })

    if (existing) {
      publish(snapshot)
      send(connection, roomSnapshot(member.mapId, membersOn(member.mapId)))
    } else {
      broadcast(member.mapId)
      // 加入时可能有写入在首次读档和房间登记之间提交。
      void getSnapshot(session.accountId).then(publish).catch((error) => request.log.error(error))
    }
    send(connection, { event: 'PLAYER_CHANGED', data: { revision: member.revision } })
    onPresence?.(id, false)
  })

  const heartbeat = setInterval(() => {
    const now = Date.now()
    for (const member of online.values()) {
      for (const connection of member.connections) {
        if (connection.session.expiresAt <= now || !connection.alive) {
          leave(member, connection)
          if (connection.session.expiresAt <= now) connection.socket.close(1008, 'Session expired')
          else connection.socket.terminate()
        } else if (connection.socket.readyState === 1) {
          connection.alive = false
          connection.socket.ping()
        }
      }
    }
  }, 30_000)
  heartbeat.unref()
  app.addHook('onClose', async () => clearInterval(heartbeat))

  function onlineMap(playerId: string) {
    const member = online.get(playerId)
    return member && [...member.connections].some((connection) =>
      connection.socket.readyState === 1 && connection.session.expiresAt > Date.now(),
    ) ? member.mapId : null
  }

  return {
    publish, closeSession, onlineMap,
    isOnlineInMap: (playerId: string, mapId: string) => onlineMap(playerId) === mapId,
    onlinePlayer: (playerId: string) => onlineMap(playerId) ? online.get(playerId)?.info : undefined,
    sendToPlayer: (playerId: string, event: WsServerEvent) => {
      for (const connection of online.get(playerId)?.connections ?? []) send(connection, event)
    },
    onPresenceChange: (listener: NonNullable<typeof onPresence>) => { onPresence = listener },
  }
}
