import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { ITEMS, ONLINE_MAPS, REALMS, SECTS } from '../../shared/gameData.ts'
import type { PlayerSnapshot, RoomPlayerDTO, WsServerEvent } from '../../shared/protocol.ts'
import { requireSession, type Session } from './auth.ts'
import { computeDerivedStats } from '../../shared/battle.ts'
import { recruitTrialCompanions } from '../../shared/trialStages.ts'
import { collectionBonus, equippedCompanion, restorePlayer, type CharacterRow } from './game.ts'
import { db, serverTime, transaction } from './db.ts'
import { GameError } from './http.ts'

interface Connection {
  socket: WebSocket
  session: Session
  alive: boolean
}

interface Presence {
  info: RoomPlayerDTO
  mapId: string
  /** 门派频道按它投递 */
  sectId: string | null
  revision: number
}

interface Member extends Presence {
  connections: Set<Connection>
}

/** 发言人：聊天模块据此校验与投递（docs/23） */
export interface ChatSpeaker {
  playerId: string
  nickname: string
  sectName: string
  sectId: string | null
  level: number
  mapId: string
  reply: (event: WsServerEvent) => void
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

function presence(player: PlayerSnapshot['player'], loadout: PlayerSnapshot['loadouts'][number], combatPower: number,
  holdingArtifact: boolean, revision: number, now: number): Presence {
  const escort = player.escortDart
  return {
    revision, mapId: player.currentMapId, sectId: player.currentSectId ?? null,
    info: {
      id: player.id, nickname: player.nickname, avatarId: player.avatarId,
      weaponName: ITEMS[loadout.weaponId ?? '']?.name,
      sectName: SECTS.find((sect) => sect.id === player.currentSectId)?.name ?? '逍遥散人',
      realmName: REALMS.find((realm) => realm.tier === player.realmTier)?.name ?? REALMS[0].name,
      level: player.level, combatPower, stance: loadout.stance,
      isBetrayerBounty: (player.bountyUntil ?? 0) > now,
      isEscortingDart: !!escort && escort.mapId === player.currentMapId && escort.endsAt > now && !escort.robbed,
      holdingUniqueArtifact: holdingArtifact ? ITEMS.dagou_stick_true.name : undefined,
    },
  }
}

type PresenceRow = CharacterRow & {
  loadout: PlayerSnapshot['loadouts'][number]
  companionAffinity: PlayerSnapshot['companionAffinity']
  affixes: Record<string, number>
  artifact: boolean
}

// 房间只需要当前方案、装备词条、真品和伙伴；各子查询使用 player_id 索引。
const presenceColumns = `p.*,
  (SELECT preset FROM player_loadouts WHERE player_id = p.id AND preset_idx = (p.profile->>'activePresetIdx')::int) AS loadout,
  COALESCE((SELECT jsonb_object_agg(item_id, affix_roll) FROM player_items WHERE player_id = p.id AND affix_roll > 0), '{}') AS affixes,
  EXISTS (SELECT 1 FROM player_items WHERE player_id = p.id AND item_id = 'dagou_stick_true') AS artifact,
  COALESCE((SELECT jsonb_object_agg(companion_id, state) FROM player_companions WHERE player_id = p.id), '{}') AS "companionAffinity"`

function presenceOfRow(row: PresenceRow, now: number) {
  const { player } = restorePlayer(row, row.affixes)
  recruitTrialCompanions(row.companionAffinity, player.trial.rewardedStageIds)
  const stats = computeDerivedStats(player, row.loadout, collectionBonus(row), (id) => equippedCompanion(row, id))
  return presence(player, row.loadout, stats.combatPower, row.artifact, row.revision, now)
}

async function readPresence(accountId: string, afterRevision = -1) {
  const { rows: [row] } = await db.query<PresenceRow & { now: string }>(
    `SELECT ${presenceColumns}, floor(extract(epoch FROM statement_timestamp()) * 1000)::bigint AS now
     FROM players p WHERE p.account_id = $1 AND p.revision > $2`, [accountId, afterRevision])
  return row && presenceOfRow(row, Math.max(Number(row.last_settle_at), Number(row.now)))
}

export function registerRooms(app: FastifyInstance) {
  const online = new Map<string, Member>()
  const rooms = new Map<string, Room>()
  const joining = new WeakMap<FastifyRequest, { session: Session; initial: Presence }>()
  let onPresence: ((playerId: string, resetReady: boolean) => void) | undefined
  let onJoin: ((playerId: string) => WsServerEvent | undefined) | undefined
  let onChat: ((speaker: ChatSpeaker, message: unknown) => void) | undefined

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
    if (!online.has(snapshot.player.id)) return
    updatePresence(presence(snapshot.player, snapshot.loadouts[snapshot.player.activePresetIdx - 1], snapshot.derivedStats.combatPower,
      snapshot.ownedItemIds.includes('dagou_stick_true'), snapshot.revision, snapshot.serverTime))
  }

  function updatePresence(next: Presence) {
    const member = online.get(next.info.id)
    if (!member || member.revision >= next.revision) return
    const oldMap = member.mapId
    const { info } = next
    const profileChanged = JSON.stringify(info) !== JSON.stringify(member.info)
    Object.assign(member, next)
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
      const initial = await readPresence(session.accountId)
      if (!initial) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
      joining.set(request, { session, initial })
    },
  }, (socket, request) => {
    const { session, initial } = joining.get(request)!
    joining.delete(request)
    const id = initial.info.id
    const existing = online.get(id)
    if (existing) updatePresence(initial)
    const member: Member = existing ?? { ...initial, connections: new Set() }
    const connection = { socket, session, alive: true }
    member.connections.add(connection)
    online.set(id, member)

    socket.on('close', () => leave(member, connection))
    socket.on('error', () => { leave(member, connection); socket.terminate() })
    socket.on('pong', () => { connection.alive = true })
    socket.on('message', (data, binary) => {
      if (!member.connections.has(connection)) return
      if (connection.session.expiresAt <= Date.now()) {
        leave(member, connection)
        socket.close(1008, 'Session expired')
        return
      }
      let message: { event?: unknown; data?: unknown } | undefined
      if (!binary) {
        try {
          message = JSON.parse(data.toString())
        } catch { /* 格式错误按发言不合规处理 */ }
      }
      if (message?.event !== 'CHAT_SEND') {
        send(connection, { event: 'CHAT_REJECTED', data: { code: 'INVALID_CHAT', message: '请输入 1 至 80 字的消息' } })
        return
      }
      onChat?.({
        playerId: id, nickname: member.info.nickname, sectName: member.info.sectName, sectId: member.sectId, level: member.info.level,
        mapId: member.mapId, reply: (event) => send(connection, event),
      }, message.data)
    })

    if (!existing) {
      roomOf(member.mapId).members.set(id, member)
      touch(member.mapId)
      // 登记后补查版本，覆盖首次读取与登记间已提交的写入；版本相同就跳过展示数据查询。
      void readPresence(session.accountId, member.revision).then((next) => {
        if (next && next.info.id === id) updatePresence(next)
      }).catch((error) => {
        request.log.error(error)
        socket.close(1011, 'Room sync failed')
      })
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

  async function absentPlayers(accountId: string): Promise<RoomPlayerDTO[]> {
    return transaction(async (client) => {
      const { rows: [self] } = await client.query<{ id: string; map: string }>(
        "SELECT id, profile->>'currentMapId' AS map FROM players WHERE account_id = $1", [accountId])
      if (!self) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
      const now = await serverTime(client)
      const peace = ONLINE_MAPS.find((map) => map.id === self.map)?.safety === 'PEACE'
      const { rows } = await client.query<PresenceRow>(`
        SELECT ${presenceColumns} FROM (
          SELECT * FROM players WHERE id <> $1 AND profile->>'currentMapId' = $2 AND NOT (profile ? 'mapJourney') AND ($4
            OR (profile->'escortDart'->>'mapId' = $2 AND (profile->'escortDart'->>'endsAt')::bigint > $3
              AND NOT COALESCE((profile->'escortDart'->>'robbed')::boolean, false))
            OR (profile->>'bountyUntil')::bigint > $3)
          ORDER BY last_settle_at DESC, id LIMIT 20
        ) p ORDER BY p.last_settle_at DESC, p.id`, [self.id, self.map, now, peace])
      return rows.filter((row) => onlineMap(row.id) !== self.map).map((row) => ({ ...presenceOfRow(row, now).info, offline: true }))
    }, true)
  }

  return {
    publish, closeSession, onlineMap, absentPlayers,
    onlineCount: () => [...online.keys()].filter((playerId) => onlineMap(playerId) !== null).length,
    isOnlineInMap: (playerId: string, mapId: string) => onlineMap(playerId) === mapId,
    onlinePlayer: (playerId: string) => onlineMap(playerId) ? online.get(playerId)?.info : undefined,
    sendToPlayer: (playerId: string, event: WsServerEvent) => {
      for (const connection of online.get(playerId)?.connections ?? []) send(connection, event)
    },
    /** 向某张地图上的在线侠客推送 */
    sendToMap: broadcast,
    /** 向某门派的在线弟子推送 */
    sendToSect: (sectId: string, event: WsServerEvent) => {
      const message = JSON.stringify(event)
      for (const member of online.values()) if (member.sectId === sectId) for (const connection of member.connections) send(connection, message)
    },
    onChat: (listener: NonNullable<typeof onChat>) => { onChat = listener },
    /** 角色被删：断开他的全部连接 */
    evict: (playerId: string) => {
      const member = online.get(playerId)
      for (const connection of [...member?.connections ?? []]) {
        leave(member!, connection)
        connection.socket.close(4001, 'Character deleted')
      }
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
