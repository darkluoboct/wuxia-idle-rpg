import type { GameActions } from './gameActions'
import type { RoomPlayerDTO } from './protocol'

function unavailable(): never {
  throw new Error('试玩引擎只在游客入口开放')
}

export const mockGameActions: GameActions = { run: unavailable }
export const mockDuelOpponent = unavailable
export function generateRoomPlayers(): RoomPlayerDTO[] { return [] }
