import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { ITEMS, REALMS, SECTS } from '../../shared/gameData.ts'
import type { PlayerSnapshot, RoomPlayerDTO, WsServerEvent } from '../../shared/protocol.ts'
import { FOREVER } from '../../shared/admin.ts'
import { requireSession, type Session } from './auth.ts'
import { db } from './db.ts'
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

/** 同图在线的侠客；members 按进图先后，shown 与 count 是上次推送出去的名单与人数 */
interface Room {
  members: Map<string, Member>
  shown: Map<string, RoomPlayerDTO>
  count: number
  timer?: ReturnType<typeof setTimeout>
}

/** 附近名单最多列这么多位；同图人数照常全数 */
export const ROOM_LIST_LIMIT = 50
/** 同图的变动攒半秒合成一条推送，重启后全服同时重连也不会每进一人就给全图发一次 */
const ROOM_FLUSH_MS = 500

/** 附近名单列谁：能出手的（被通缉、押镖、执真品）排前面，其余按进图先后，先来的一直在名单里，推送最少 */
export function roomWindow(players: RoomPlayerDTO[], limit = ROOM_LIST_LIMIT) {
  const target = (player: RoomPlayerDTO) => player.isBetrayerBounty || player.isEscortingDart || !!player.holdingUniqueArtifact
  return [...players.filter(target), ...players.filter((player) => !target(player))].slice(0, limit)
}

const muteTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function publicPlayer(snapshot: PlayerSnapshot): RoomPlayerDTO {
  const { player, loadouts, derivedStats } = snapshot
  const escort = player.escortDart
  return {
    id: player.id,
    nickname: player.nickname,
    sectName: SECTS.find((sect) => sect.id === player.currentSectId)?.name ?? '逍遥散人',
    realmName: REALMS.find((realm) => realm.tier === player.realmTier)?.name ?? REALMS[0].name,
    level: player.level,
    combatPower: derivedStats.combatPower,
    stance: loadouts[player.activePresetIdx - 1].stance,
    isBetrayerBounty: (player.bountyUntil ?? 0) > snapshot.serverTime,
    isEscortingDart: !!escort && escort.mapId === player.currentMapId && escort.endsAt > snapshot.serverTime && !escort.robbed,
    holdingUniqueArtifact: snapshot.ownedItemIds.includes('dagou_stick_true') ? ITEMS.dagou_stick_true.name : undefined,
  }
}

export function registerRooms(app: FastifyInstance) {
  const online = new Map<string, Member>()
  const rooms = new Map<string, Room>()
  const joining = new WeakMap<FastifyRequest, { session: Session; snapshot: PlayerSnapshot }>()
  let onPresence: ((playerId: string, resetReady: boolean) => void) | undefined
  let onJoin: ((playerId: string) => WsServerEvent | undefined) | undefined

  function roomOf(mapId: string) {
    let room = rooms.get(mapId)
    if (!room) rooms.set(mapId, room = { members: new Map(), shown: new Map(), count: 0 })
    return room
  }

  /** 已序列化的消息原样发出，广播只序列化一次 */
  function send(connection: Connection, event: WsServerEvent | string) {
    if (connection.socket.readyState === 1) connection.socket.send(typeof event === 'string' ? event : JSON.stringify(event))
  }

  function broadcast(mapId: string, event: WsServerEvent) {
    const message = JSON.stringify(event)
    for (const member of rooms.get(mapId)?.members.values() ?? []) for (const connection of member.connections) send(connection, message)
  }

  /** 给刚连上或刚进图的人：上次推送出去的名单，此后的 ROOM_UPDATE 都以它为准 */
  function roomSync(mapId: string): WsServerEvent {
    const room = roomOf(mapId)
    return { event: 'ROOM_SYNC', data: { mapId, onlineCount: room.members.size, players: [...room.shown.values()] } }
  }

  function touch(mapId: string) {
    const room = roomOf(mapId)
    room.timer ??= setTimeout(() => flush(mapId), ROOM_FLUSH_MS)
  }

  /** 把攒下的变动和上次推送的名单比，只推差别 */
  function flush(mapId: string) {
    const room = rooms.get(mapId)
    if (!room) return
    room.timer = undefined
    const next = new Map(roomWindow([...room.members.values()].map(({ info }) => info)).map((info) => [info.id, info]))
    const players = [...next.values()].filter((info) => JSON.stringify(info) !== JSON.stringify(room.shown.get(info.id)))
    const left = [...room.shown.keys()].filter((id) => !next.has(id))
    const changed = players.length > 0 || left.length > 0 || room.count !== room.members.size
    room.shown = next
    room.count = room.members.size
    if (!room.members.size) rooms.delete(mapId)
    else if (changed) broadcast(mapId, { event: 'ROOM_UPDATE', data: { mapId, onlineCount: room.count, players, left } })
  }

  function leave(member: Member, connection: Connection) {
    if (!member.connections.delete(connection)) return
    if (!member.connections.size) {
      online.delete(member.info.id)
      rooms.get(member.mapId)?.members.delete(member.info.id)
      touch(member.mapId)
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
    if (oldMap !== member.mapId) {
      rooms.get(oldMap)?.members.delete(info.id)
      touch(oldMap)
      roomOf(member.mapId).members.set(info.id, member)
      for (const connection of member.connections) send(connection, roomSync(member.mapId))
    }
    if (profileChanged || oldMap !== member.mapId) touch(member.mapId)
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
      // 禁言由运营后台设置（docs/22），每次发言查一次
      void db.query<{ muted_until: string | null }>('SELECT muted_until FROM players WHERE id = $1', [id]).then(({ rows: [row] }) => {
        const until = Number(row?.muted_until ?? 0)
        if (until > Date.now()) {
          const message = until >= FOREVER ? '你已被禁言' : `你已被禁言至 ${muteTime.format(until)}（北京时间）`
          send(connection, { event: 'CHAT_REJECTED', data: { code: 'CHAT_MUTED', message } })
          return
        }
        broadcast(member.mapId, {
          event: 'ROOM_CHAT',
          data: { id: randomUUID(), mapId: member.mapId, sender: { id, nickname: member.info.nickname }, content, sentAt: now },
        })
      }).catch((error) => request.log.error(error))
    })

    if (existing) publish(snapshot)
    else {
      roomOf(member.mapId).members.set(id, member)
      touch(member.mapId)
      // 加入时可能有写入在首次读档和房间登记之间提交。
      void getSnapshot(session.accountId).then(publish).catch((error) => request.log.error(error))
    }
    send(connection, roomSync(member.mapId))
    send(connection, { event: 'PLAYER_CHANGED', data: { revision: member.revision } })
    const welcome = onJoin?.(id)
    if (welcome) send(connection, welcome)
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
  app.addHook('onClose', async () => {
    clearInterval(heartbeat)
    for (const room of rooms.values()) clearTimeout(room.timer)
  })

  function onlineMap(playerId: string) {
    const member = online.get(playerId)
    return member && [...member.connections].some((connection) =>
      connection.socket.readyState === 1 && connection.session.expiresAt > Date.now(),
    ) ? member.mapId : null
  }

  return {
    publish, closeSession, onlineMap, publicPlayer,
    onlineCount: () => [...online.keys()].filter((playerId) => onlineMap(playerId) !== null).length,
    isOnlineInMap: (playerId: string, mapId: string) => onlineMap(playerId) === mapId,
    onlinePlayer: (playerId: string) => onlineMap(playerId) ? online.get(playerId)?.info : undefined,
    sendToPlayer: (playerId: string, event: WsServerEvent) => {
      for (const connection of online.get(playerId)?.connections ?? []) send(connection, event)
    },
    /** 向全服在线侠客推送 */
    announce: (event: WsServerEvent) => {
      const message = JSON.stringify(event)
      for (const member of online.values()) for (const connection of member.connections) send(connection, message)
    },
    onPresenceChange: (listener: NonNullable<typeof onPresence>) => { onPresence = listener },
    onJoin: (listener: NonNullable<typeof onJoin>) => { onJoin = listener },
  }
}
