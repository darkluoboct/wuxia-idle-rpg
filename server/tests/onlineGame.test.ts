import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { on, once } from 'node:events'
import { readdir, readFile } from 'node:fs/promises'
import { after, before, describe, it, mock } from 'node:test'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'
import pg from 'pg'
import { COOP_RAIDS, INN_GIFT_COST } from '../../shared/gameData.ts'
import { computeDerivedStats } from '../../shared/battle.ts'
import { huashanSeason } from '../../shared/huashan.ts'
import { legacyAcupoints } from '../../shared/player.ts'
import type { BattleReportDTO, BountyBoardDTO, BountyEntryDTO, GameAction, HuashanBoardDTO, HuashanResult, IdleGain, LibraryResult, LibraryStatusDTO, PlayerSnapshot, RaidId, ReunionResult, SectContestBoardDTO, SectContestResult, SectResult, StoryAdventureResult, StoryChallengeResult, WsServerEvent } from '../../shared/protocol.ts'
import { QUANZHEN_LIBRARY } from '../../shared/quanzhen.ts'
import { BETRAYAL_BOUNTY, SECT_CHIEF_SALUTE_QI, SECT_SALUTE_QI, sectContestEndsAt, sectContestWeek } from '../../shared/sectProgress.ts'
import { ONLINE_STORY_CHAPTERS } from '../../shared/storyData.ts'
import { GameError } from '../src/http.ts'

const connection = process.env.GAME_TEST_DATABASE_URL ?? process.env.STORY_TEST_DATABASE_URL

describe('联机战斗', { skip: connection ? false : '请设置 GAME_TEST_DATABASE_URL' }, () => {
  const app = Fastify()
  const schema = `game_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool({ connectionString: connection })
  let db: pg.Pool
  let fixedServerTime: number | undefined
  const contestWeekId = sectContestWeek(Date.now()) + 1

  before(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`)
    const testUrl = new URL(connection!)
    testUrl.searchParams.set('options', `-c search_path=${schema}`)
    process.env.DATABASE_URL = testUrl.toString()
    db = (await import('../src/db.ts')).db
    // 演武测试推进游戏时钟，账号会话仍使用真实数据库时间。
    const clientQuery = pg.Client.prototype.query as (this: pg.Client, sql: string, values?: unknown[]) => Promise<pg.QueryResult>
    mock.method(pg.Client.prototype, 'query', function (this: pg.Client, ...args: unknown[]) {
      if (fixedServerTime !== undefined && args[0] === 'SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS ms') {
        return clientQuery.call(this, 'SELECT $1::bigint AS ms', [fixedServerTime])
      }
      return Reflect.apply(clientQuery, this, args)
    })
    const migrations = new URL('../migrations/', import.meta.url)
    const files = (await readdir(migrations)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()
    for (const file of files) await db.query(await readFile(new URL(file, migrations), 'utf8'))

    const { registerRooms } = await import('../src/rooms.ts')
    const { registerRaidLobby } = await import('../src/raidLobby.ts')
    const { registerGame } = await import('../src/game.ts')
    const { registerAuth } = await import('../src/auth.ts')
    await app.register(cookie)
    await app.register(websocket)
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof GameError) return reply.code(error.statusCode).send({ code: error.code, message: error.message })
      throw error
    })
    const rooms = registerRooms(app)
    registerAuth(app, false, rooms.closeSession)
    registerGame(app, rooms, registerRaidLobby(app, rooms))
    await app.listen({ host: '127.0.0.1', port: 0 })
    mock.method(Math, 'random', () => 0.99)
  })

  after(async () => {
    mock.restoreAll()
    await app.close()
    await db?.end()
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin.end()
  })

  async function createPlayer(name: string) {
    const loginName = `story_${name}`
    const registration = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { loginName, password: randomUUID() } })
    assert.equal(registration.statusCode, 201)
    const cookie = registration.cookies[0]
    const headers = { cookie: `${cookie.name}=${cookie.value}` }
    const creation = await app.inject({ method: 'POST', url: '/api/v1/player/create', headers, payload: { nickname: loginName } })
    assert.equal(creation.statusCode, 200, creation.body)
    const snapshot = creation.json<PlayerSnapshot>()
    const id = snapshot.player.id
    const write = (method: 'POST' | 'PUT', path: string, payload?: Record<string, unknown>, requestId: string = randomUUID()) =>
      app.inject({ method, url: `/api/v1${path}`, headers: { ...headers, 'idempotency-key': requestId }, payload })
    const post = (path: string, payload?: Record<string, unknown>, key?: string) => write('POST', path, payload, key)
    const act = async <T>(path: string, payload?: Record<string, unknown>, key?: string, method: 'POST' | 'PUT' = 'POST') => {
      const response = await write(method, path, payload, key)
      assert.equal(response.statusCode, 200, response.body)
      return response.json<GameAction<T>>()
    }
    const get = (path: string) => app.inject({ method: 'GET', url: `/api/v1${path}`, headers })
    const read = async <T = PlayerSnapshot>(path = '/player/me') => {
      const response = await get(path)
      assert.equal(response.statusCode, 200, response.body)
      return response.json<T>()
    }
    const connect = async () => {
      const options = { headers }
      const socket = new WebSocket(`ws://127.0.0.1:${(app.server.address() as { port: number }).port}/ws`, options)
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('message', () => resolve(), { once: true })
        socket.addEventListener('error', reject, { once: true })
      })
      return socket
    }
    return { id, snapshot, get, post, act, read, connect }
  }

  async function profile(id: string, patch: Record<string, unknown>) {
    await db.query('UPDATE players SET profile = profile || $2::jsonb WHERE id = $1', [id, patch])
  }

  async function strength(id: string, str: number, con: number, level: number, realmTier: number, agi: number) {
    await profile(id, { level, realmTier, stats: { str, con, agi, intStat: 32, luck: 25, karma: 0 } })
  }

  async function legacyProgress(id: string, maxChapterId: number, rewarded: number[]) {
    await profile(id, { maxChapterId })
    await db.query("UPDATE players SET profile = profile - 'storyProgressVersion', rewarded_chapters = $2 WHERE id = $1", [id, rewarded])
  }

  const contestPath = '/sect/contest'

  async function contestPlayer(name: string, sectId: string, sectRank = 3) {
    const actor = await createPlayer(name)
    await profile(actor.id, { currentSectId: sectId, sectRank })
    return actor
  }

  it('门派演武校验双方阶位和同门，冻结离线镜像，独立更新双方周榜', async () => {
    const [leader, defender, novice, outsider] = await Promise.all([
      contestPlayer('contest_a', 'quanzhen'), contestPlayer('contest_b', 'quanzhen'),
      contestPlayer('contest_c', 'quanzhen', 2), contestPlayer('contest_d', 'taohua'),
    ])
    const weekId = contestWeekId
    fixedServerTime = sectContestEndsAt(weekId) - 60_000
    try {
      const mirror = { action: 'mirror', sectId: 'quanzhen', weekId }
      const challenge = { ...mirror, action: 'challenge', targetPlayerId: defender.id }
      assert.equal((await novice.post(contestPath, mirror)).json().code, 'SECT_CONTEST_RANK_REQUIRED')
      assert.equal((await leader.post(contestPath, { ...challenge, targetPlayerId: novice.id })).json().code, 'SECT_CONTEST_TARGET_INELIGIBLE')
      assert.equal((await leader.post(contestPath, { ...challenge, targetPlayerId: leader.id })).json().code, 'SECT_CONTEST_INVALID_TARGET')
      assert.equal((await leader.post(contestPath, challenge)).json().code, 'SECT_CONTEST_MIRROR_REQUIRED')
      assert.equal((await leader.post(contestPath, { ...mirror, weekId: weekId - 1 })).json().code, 'SECT_CONTEST_WEEK_CHANGED')

      const registered = await defender.read()
      const loadout = registered.loadouts.find((entry) => entry.presetIdx === registered.player.activePresetIdx)!
      await defender.act(contestPath, mirror)
      await outsider.act(contestPath, { ...mirror, sectId: 'taohua' })
      assert.equal((await leader.post(contestPath, { ...challenge, targetPlayerId: outsider.id })).json().code, 'SECT_CONTEST_TARGET_INELIGIBLE')
      const seasonId = huashanSeason(registered.serverTime)
      for (const actor of [leader, defender]) await actor.act('/huashan', { action: 'mirror', seasonId })
      const huashanBefore = await leader.read<HuashanBoardDTO>('/huashan')
      const huashanMatch = await leader.act<HuashanResult>('/huashan', { action: 'challenge', seasonId, targetPlayerId: defender.id })
      assert.equal(huashanMatch.result.action, 'challenge')
      assert.equal((await leader.read<SectContestBoardDTO>(contestPath)).leaderboard[0].matches, 0)

      await strength(leader.id, 3500, 900, 40, 4, 140)
      await leader.act(contestPath, mirror)
      await strength(defender.id, 7000, 4000, 40, 4, 1000)
      const key = randomUUID()
      const [battle, replay] = await Promise.all([leader.act<SectContestResult>(contestPath, challenge, key), leader.act<SectContestResult>(contestPath, challenge, key)])
      assert.deepEqual(replay.result, battle.result)
      const result = battle.result
      assert.equal(result.action, 'challenge')
      assert.equal(result.report.winner, 'ALLY')
      assert.equal(result.report.units.find((unit) => unit.slot === 'ENEMY_MAIN')?.maxHp, computeDerivedStats(registered.player, loadout, registered.learnedSkills).maxHp)
      assert.equal(result.rating, 1016)
      const board = await novice.read<SectContestBoardDTO>(contestPath)
      assert.deepEqual(board.leaderboard.map(({ id, rating, wins, matches }) => [id, rating, wins, matches]), [[leader.id, 1016, 1, 1], [defender.id, 984, 0, 1]])
      assert.equal(board.self, null)
      assert.deepEqual((await outsider.read<SectContestBoardDTO>(contestPath)).leaderboard.map(({ id, matches }) => [id, matches]), [[outsider.id, 0]])
      const huashanAfter = await leader.read<HuashanBoardDTO>('/huashan')
      assert.equal(huashanAfter.self?.matches, (huashanBefore.self?.matches ?? 0) + 1)
      assert.equal(huashanAfter.self?.rating, huashanMatch.result.rating)
    } finally {
      fixedServerTime = undefined
    }
  })

  it('周六换届只结榜一次，按门派产生首席并在同一事务为请安双方入账', async () => {
    const [winner, peer, idle, otherWinner, otherPeer] = await Promise.all([
      contestPlayer('chief_a', 'baituo', 4), contestPlayer('chief_b', 'baituo'), contestPlayer('chief_c', 'baituo'),
      contestPlayer('chief_d', 'tiezhang', 4), contestPlayer('chief_e', 'tiezhang'),
    ])
    await Promise.all([strength(winner.id, 3500, 900, 40, 4, 150), strength(otherWinner.id, 3500, 900, 40, 4, 150)])
    const weekId = contestWeekId
    const endsAt = sectContestEndsAt(weekId)
    fixedServerTime = endsAt - 1
    try {
      const mirror = (sectId: string) => ({ action: 'mirror', sectId, weekId })
      const participants = [[winner, peer, 'baituo'], [otherWinner, otherPeer, 'tiezhang']] as const
      for (const [captain, challenger, sectId] of participants) {
        await Promise.all([captain.act(contestPath, mirror(sectId)), challenger.act(contestPath, mirror(sectId))])
        await captain.act(contestPath, { ...mirror(sectId), action: 'challenge', targetPlayerId: challenger.id })
      }
      await idle.act(contestPath, mirror('baituo'))
      await db.query("UPDATE sect_contest_entries SET rating = 1200 WHERE sect_id = 'baituo' AND player_id = $1", [idle.id])
      const before = await peer.read<SectContestBoardDTO>(contestPath)
      assert.equal(before.weekId, weekId)
      assert.equal(before.endsAt, endsAt)
      assert.equal(before.chief, null)

      fixedServerTime = endsAt
      const salute = { action: 'salute', sectId: 'baituo' }
      const saluteKey = randomUUID()
      const [peerBefore, chiefBefore] = await Promise.all([peer.read(), winner.read()])
      const [boards, greeting, duplicate] = await Promise.all([
        Promise.all([winner, peer, idle, otherPeer].map((actor) => actor.read<SectContestBoardDTO>(contestPath))),
        peer.act<SectResult>('/sect', salute, saluteKey), peer.act<SectResult>('/sect', salute, saluteKey),
      ])
      for (const board of boards) {
        assert.equal(board.weekId, weekId + 1)
        assert.deepEqual(board.leaderboard, [])
        assert.equal(board.chief?.id, board.sectId === 'baituo' ? winner.id : otherWinner.id)
      }
      const { rows: closed } = await db.query(`SELECT sect_id, chief_id FROM sect_contest_results
        WHERE week_id = $1 AND sect_id IN ('baituo','tiezhang') ORDER BY sect_id`, [weekId])
      assert.deepEqual(closed, [{ sect_id: 'baituo', chief_id: winner.id }, { sect_id: 'tiezhang', chief_id: otherWinner.id }])
      assert.deepEqual(duplicate.result, greeting.result)
      assert.equal(greeting.result.action, 'salute')
      assert.equal(greeting.result.chief?.id, winner.id)
      assert.equal(greeting.result.chief?.qiExp, SECT_CHIEF_SALUTE_QI)
      assert.equal(greeting.snapshot.player.qiExp - peerBefore.player.qiExp, SECT_SALUTE_QI)
      assert.equal(greeting.snapshot.player.sectContribution - peerBefore.player.sectContribution, 60)
      const afterGreeting = await winner.read()
      assert.equal(afterGreeting.player.qiExp - chiefBefore.player.qiExp, SECT_CHIEF_SALUTE_QI)
      assert.equal((await peer.post('/sect', salute)).json().code, 'SECT_SALUTE_CLAIMED')
      const chiefGreeting = await winner.act<SectResult>('/sect', salute)
      assert.equal(chiefGreeting.result.action, 'salute')
      assert.equal(chiefGreeting.result.chief, undefined)
      assert.equal(chiefGreeting.snapshot.player.qiExp - afterGreeting.player.qiExp, SECT_SALUTE_QI)
      assert.equal((await winner.post(contestPath, mirror('baituo'))).json().code, 'SECT_CONTEST_WEEK_CHANGED')
      assert.equal((await peer.read<SectContestBoardDTO>(contestPath)).chief?.id, winner.id)
    } finally {
      fixedServerTime = undefined
    }
  })

  it('首席出师或叛门后空缺，演武退赛和请安回执随档保存', async () => {
    const weekId = contestWeekId
    fixedServerTime = sectContestEndsAt(weekId) - 60_000
    try {
      for (const [action, sectId] of [['graduate', 'jiangnan_wuguan'], ['betray', 'yideng']] as const) {
        const [chief, member] = await Promise.all([contestPlayer(`${action}_a`, sectId, 4), contestPlayer(`${action}_b`, sectId)])
        await strength(chief.id, 3500, 900, 40, 4, 140)
        const mirror = { action: 'mirror', sectId, weekId }
        const prior = { ...mirror, weekId: weekId - 1 }
        fixedServerTime = sectContestEndsAt(weekId - 1) - 1
        await Promise.all([chief.act(contestPath, prior), member.act(contestPath, prior)])
        await chief.act(contestPath, { ...prior, action: 'challenge', targetPlayerId: member.id })
        fixedServerTime = sectContestEndsAt(weekId) - 60_000
        await Promise.all([chief.act(contestPath, mirror), member.act(contestPath, mirror)])
        assert.equal((await member.read<SectContestBoardDTO>(contestPath)).chief?.id, chief.id)
        const requestId = randomUUID()
        const left = await chief.act<SectResult>('/sect', { action, sectId }, requestId)
        assert.equal(left.snapshot.player.currentSectId, null)
        assert.deepEqual((await chief.act<SectResult>('/sect', { action, sectId }, requestId)).result, left.result)
        assert.equal((await chief.get(contestPath)).json().code, 'SECT_CONTEST_MEMBERSHIP_REQUIRED')
        const after = await member.read<SectContestBoardDTO>(contestPath)
        assert.equal(after.chief, null)
        assert.deepEqual(after.leaderboard.map(({ id }) => id), [member.id])
        const { rows: [row] } = await db.query('SELECT chief_id FROM sect_contest_results WHERE sect_id = $1 AND week_id = $2', [sectId, weekId - 1])
        assert.equal(row.chief_id, null)
        assert.equal((await member.post(contestPath, { ...mirror, action: 'challenge', targetPlayerId: chief.id })).json().code, 'SECT_CONTEST_TARGET_INELIGIBLE')
        const before = await member.read()
        const greet = await member.act<SectResult>('/sect', { action: 'salute', sectId })
        assert.equal(greet.result.action, 'salute')
        assert.equal(greet.result.chief, undefined)
        assert.equal(greet.snapshot.player.qiExp - before.player.qiExp, SECT_SALUTE_QI)
        assert.equal((await chief.read()).player.qiExp, left.snapshot.player.qiExp)
        if (action === 'graduate') {
          await chief.act('/sect', { action: 'join', sectId })
          await profile(chief.id, { sectRank: 4 })
          assert.equal((await chief.post(contestPath, mirror)).json().code, 'SECT_CONTEST_WITHDRAWN')
          assert.equal((await member.read<SectContestBoardDTO>(contestPath)).chief, null)
        }
      }
    } finally {
      fixedServerTime = undefined
    }
  })

  type RaidEventData = { [E in Extract<WsServerEvent, { event: 'TEAM_ROOM_SYNC' | 'RAID_REPORT' }> as E['event']]: E['data'] }

  async function nextRaidEvent<K extends keyof RaidEventData>(
    socket: WebSocket, event: K, matches: (data: RaidEventData[K]) => boolean = () => true,
  ): Promise<RaidEventData[K]> {
    for await (const [message] of on(socket, 'message', { signal: AbortSignal.timeout(5_000) })) {
      const parsed = JSON.parse(message.data) as WsServerEvent
      if (parsed.event !== event) continue
      const data = parsed.data as RaidEventData[K]
      if (matches(data)) return data
    }
    throw new Error(`未收到 ${event}`)
  }

  it('三个副本共用三人队伍，独立记通关并按个人首胜发奖', async () => {
    const [leader, left, right] = await Promise.all(['raid_a', 'raid_b', 'raid_c'].map(createPlayer))
    const party = [leader, left, right]
    for (const actor of party) await strength(actor.id, 1, 0, 1, 1, 0)
    await db.query('UPDATE players SET shaoshi_clears = 1 WHERE id = $1', [left.id])
    await db.query('UPDATE players SET shaoshi_clears = 2 WHERE id = $1', [right.id])
    await db.query(`INSERT INTO player_items (player_id, item_id) VALUES
      ($1, 'wumu_yishu'), ($2, 'wumu_yishu'), ($2, 'xiaoao_qupu'), ($2, 'beidou_formation_book')`, [left.id, right.id])
    const sockets = await Promise.all(party.map((actor) => actor.connect()))
    const [leaderSocket, leftSocket, rightSocket] = sockets
    const teamPath = '/raid/team'
    const startPath = '/raid/start'
    try {
      async function invite(target: typeof left, socket: WebSocket) {
        const [lobby, response] = await Promise.all([
          nextRaidEvent(socket, 'TEAM_ROOM_SYNC', ({ invitation }) => !!invitation),
          leader.post(teamPath, { action: 'invite', targetPlayerId: target.id }),
        ])
        assert.equal(response.statusCode, 200, response.body)
        assert.equal(lobby.invitation?.raidId, 'shaoshi')
        const joined = await target.post(teamPath, { action: 'accept', invitationId: lobby.invitation!.id })
        assert.equal(joined.statusCode, 200, joined.body)
      }
      await invite(left, leftSocket)
      const [lobby] = await Promise.all([
        nextRaidEvent(leaderSocket, 'TEAM_ROOM_SYNC', ({ team }) => team?.members.length === 3),
        invite(right, rightSocket),
      ])
      const teamId = lobby.team!.id
      async function prepare(raidId: RaidId) {
        const [ready, ...replies] = await Promise.all([
          nextRaidEvent(leaderSocket, 'TEAM_ROOM_SYNC', ({ team }) => team?.raidId === raidId && team.members.every((member) => member.ready)),
          ...party.map((actor) => actor.post(teamPath, { action: 'ready', teamId, raidId, ready: true })),
        ])
        for (const reply of replies) assert.equal(reply.statusCode, 200, reply.body)
        return { teamId, revision: ready.team!.revision }
      }
      async function select(raidId: RaidId) {
        const [response, ...views] = await Promise.all([
          leader.post(teamPath, { action: 'select', teamId, raidId }),
          ...sockets.map((socket) => nextRaidEvent(socket, 'TEAM_ROOM_SYNC', ({ team }) => team?.raidId === raidId)),
        ])
        assert.equal(response.statusCode, 200, response.body)
        for (const { team } of views) {
          assert.equal(team?.id, teamId)
          assert.equal(team?.members.length, 3)
          assert.ok(team.members.every((member) => !member.ready))
        }
      }
      const oldStart = await prepare('shaoshi')
      assert.equal((await left.post(teamPath, { action: 'select', teamId, raidId: 'chongyang' })).json().code, 'RAID_LEADER_ONLY')
      await select('chongyang')
      assert.equal((await leader.post(startPath, oldStart)).json().code, 'RAID_NOT_READY')
      assert.equal((await left.post(teamPath, { action: 'ready', teamId, raidId: 'shaoshi', ready: true })).json().code, 'RAID_TEAM_CHANGED')

      const weakStart = await prepare('chongyang')
      const loss = await leader.act<BattleReportDTO>(startPath, weakStart)
      assert.equal(loss.result.raidId, 'chongyang')
      assert.equal(loss.result.winner, 'ENEMY')
      assert.equal(loss.result.rewards, undefined)
      const before = await Promise.all(party.map((actor) => actor.read()))
      assert.deepEqual(before.map((snapshot) => [snapshot.shaoshiClears, snapshot.chongyangClears]), [[0, 0], [1, 0], [2, 0]])
      assert.ok(!before[0].ownedItemIds.includes('beidou_formation_book'))

      await Promise.all(party.map((actor, index) => strength(actor.id, 3_500, 900, 40, 4, index === 2 ? 55 : 0)))
      const start = await prepare('chongyang')
      const requestId = randomUUID()
      const reserved = nextRaidEvent(leaderSocket, 'TEAM_ROOM_SYNC', ({ team }) => team?.starting === true)
      const [win, retry, duplicate, ...reports] = await Promise.all([
        leader.act<BattleReportDTO>(startPath, start, requestId),
        leader.act<BattleReportDTO>(startPath, start, requestId),
        reserved.then(() => leader.post(startPath, start)),
        ...sockets.map((socket) => nextRaidEvent(socket, 'RAID_REPORT', (report) => report.raidId === 'chongyang' && report.winner === 'ALLY')),
      ])
      assert.equal(duplicate.statusCode, 409, duplicate.body)
      assert.equal(win.result.winner, 'ALLY')
      assert.deepEqual(retry.result, win.result)
      assert.deepEqual(reports.map((report) => report.battleId), Array(3).fill(win.result.battleId))
      assert.ok(win.result.events.some((event) => event.actorSlot === 'ALLY_RIGHT' && event.statusRemoved === '天罡北斗阵'))
      const beidou = 'beidou_formation_book'
      assert.deepEqual(reports.map((report) => report.rewards?.items?.map((item) => item.id)), [[beidou], [beidou], []])
      const afterChongyang = await Promise.all(party.map((actor) => actor.read()))
      assert.deepEqual(afterChongyang.map((snapshot) => [snapshot.shaoshiClears, snapshot.chongyangClears]), [[0, 1], [1, 1], [2, 1]])
      for (const [index, snapshot] of afterChongyang.entries()) {
        assert.equal(snapshot.ownedItemIds.filter((id) => id === beidou).length, 1)
        assert.equal(snapshot.player.qiExp - before[index].player.qiExp, COOP_RAIDS.chongyang.rewardQi)
        assert.equal(snapshot.player.silver - before[index].player.silver, COOP_RAIDS.chongyang.rewardSilver)
      }

      await select('shaoshi')
      const shaoshiStart = await prepare('shaoshi')
      const [shaoshi, ...shaoshiReports] = await Promise.all([
        leader.act<BattleReportDTO>(startPath, shaoshiStart),
        ...sockets.map((socket) => nextRaidEvent(socket, 'RAID_REPORT', (report) => report.raidId === 'shaoshi')),
      ])
      assert.equal(shaoshi.result.winner, 'ALLY')
      assert.deepEqual(shaoshiReports.map((report) => report.rewards?.items?.map((item) => item.id)), [['wumu_yishu'], ['xiaoao_qupu'], []])
      const afterShaoshi = await Promise.all(party.map((actor) => actor.read()))
      assert.deepEqual(afterShaoshi.map((snapshot) => [snapshot.shaoshiClears, snapshot.chongyangClears]), [[1, 1], [2, 1], [3, 1]])
      const replay = await leader.act<BattleReportDTO>(startPath, start, requestId)
      assert.deepEqual(replay.result, win.result)
      assert.equal(replay.snapshot.player.silver, afterShaoshi[0].player.silver)

      await select('juxian')
      const beforeJuxian = await Promise.all(party.map((actor) => actor.read()))
      await Promise.all(party.map((actor) => strength(actor.id, 1, 0, 1, 1, 0)))
      const juxianLoss = await leader.act<BattleReportDTO>(startPath, await prepare('juxian'))
      assert.equal(juxianLoss.result.raidId, 'juxian')
      assert.equal(juxianLoss.result.winner, 'ENEMY')
      assert.ok(juxianLoss.result.survivedRounds! < 15)
      assert.equal(juxianLoss.result.rewards, undefined)
      const afterLoss = await Promise.all(party.map((actor) => actor.read()))
      assert.deepEqual(afterLoss.map((snapshot) => snapshot.juxianClears), [0, 0, 0])
      assert.deepEqual(afterLoss.map(({ player }) => [player.qiExp, player.silver]), beforeJuxian.map(({ player }) => [player.qiExp, player.silver]))

      await db.query(`UPDATE player_loadouts SET preset = preset || '{"weaponId":null,"armorId":null,"headId":null,"wristId":null,
        "bootsId":null,"accId":null,"innerSkillId":null,"outerSkillId":null,"lightSkillId":null,"ultSkillId":null}'::jsonb
        WHERE player_id = ANY($1::uuid[])`, [[leader.id, left.id]])
      await db.query('UPDATE players SET juxian_clears = 1 WHERE id = $1', [left.id])
      await strength(right.id, 3_500, 900, 40, 4, 0)
      const juxianStart = await prepare('juxian')
      const juxianRequest = randomUUID()
      const juxianReserved = nextRaidEvent(leaderSocket, 'TEAM_ROOM_SYNC', ({ team }) => team?.raidId === 'juxian' && team.starting)
      const [firstClear, repeated, stale, ...juxianReports] = await Promise.all([
        leader.act<BattleReportDTO>(startPath, juxianStart, juxianRequest),
        leader.act<BattleReportDTO>(startPath, juxianStart, juxianRequest),
        juxianReserved.then(() => leader.post(startPath, juxianStart)),
        ...sockets.map((socket) => nextRaidEvent(socket, 'RAID_REPORT', (report) => report.raidId === 'juxian' && report.winner === 'ALLY')),
      ])
      assert.equal(stale.statusCode, 409, stale.body)
      assert.deepEqual(repeated.result, firstClear.result)
      assert.equal(firstClear.result.survivedRounds, 15)
      assert.deepEqual(firstClear.result.events.filter((event) => event.opponentEntry).map(({ round }) => round), [4, 7, 10, 13])
      assert.ok(firstClear.result.events.at(-1)?.segments.some((segment) => segment.type === 'tag' && segment.text.includes('1 人存活')))
      const { rewardQi, rewardSilver, firstClearBonus } = COOP_RAIDS.juxian
      const firstRewards = { qiExp: rewardQi + firstClearBonus!.qiExp, silver: rewardSilver + firstClearBonus!.silver, items: [] }
      const repeatRewards = { qiExp: rewardQi, silver: rewardSilver, items: [] }
      const expectedRewards = [firstRewards, repeatRewards, firstRewards]
      for (const [index, report] of juxianReports.entries()) {
        assert.equal(report.battleId, firstClear.result.battleId)
        assert.deepEqual(report.rewards, expectedRewards[index])
      }
      const afterJuxian = await Promise.all(party.map((actor) => actor.read()))
      assert.deepEqual(afterJuxian.map((snapshot) => [snapshot.shaoshiClears, snapshot.chongyangClears, snapshot.juxianClears]), [[1, 1, 1], [2, 1, 2], [3, 1, 1]])
      for (const [index, { player }] of afterJuxian.entries()) {
        assert.equal(player.qiExp - beforeJuxian[index].player.qiExp, expectedRewards[index].qiExp)
        assert.equal(player.silver - beforeJuxian[index].player.silver, expectedRewards[index].silver)
      }
      const veteranStart = await prepare('juxian')
      const veteran = await leader.act<BattleReportDTO>(startPath, veteranStart)
      assert.deepEqual(veteran.result.rewards, repeatRewards)
      assert.equal(veteran.snapshot.juxianClears, 2)
      const original = await leader.act<BattleReportDTO>(startPath, juxianStart, juxianRequest)
      assert.deepEqual(original.result, firstClear.result)
      assert.equal(original.snapshot.juxianClears, 2)
      assert.equal(original.snapshot.player.silver, veteran.snapshot.player.silver)
    } finally {
      await Promise.all(sockets.map(async (socket) => {
        const closed = once(socket, 'close')
        socket.close()
        await closed
      }))
    }
  })

  it('悬赏接令、追捕和结案以实际通缉为准，并发只发一份赏金', async () => {
    const target = await createPlayer('fugitive')
    const first = await createPlayer('hunter_a')
    const second = await createPlayer('hunter_b')
    const weak = await createPlayer('weak')
    await target.act('/sect', { action: 'join', sectId: 'quanzhen' })
    const betrayed = await target.act('/sect', { action: 'betray', sectId: 'quanzhen' })
    const expiresAt = betrayed.snapshot.player.bountyUntil!
    assert.equal(expiresAt, betrayed.snapshot.serverTime + BETRAYAL_BOUNTY.hours * 3_600_000)
    for (const hunter of [first, second, weak]) await hunter.act('/sect', { action: 'join', sectId: 'quanzhen' })
    await strength(target.id, 1200, 600, 40, 4, 120)
    const board = await first.read<BountyBoardDTO>('/bounties')
    const order = board.entries.find((entry) => entry.targetId === target.id)!
    assert.deepEqual(order, { targetId: target.id, nickname: target.snapshot.player.nickname, sectId: 'quanzhen', expiresAt,
      silver: BETRAYAL_BOUNTY.silver, sectContrib: BETRAYAL_BOUNTY.sectContrib, accepted: false })
    assert.ok(!(await target.read<BountyBoardDTO>('/bounties')).entries.some((entry) => entry.targetId === target.id))
    const ticket = { targetPlayerId: target.id, expiresAt }
    const pursuit = { action: 'pursue', ...ticket }
    assert.equal((await target.post('/bounties/accept', ticket)).json().code, 'INVALID_PARTNER')
    assert.equal((await first.post('/duel', pursuit)).json().code, 'BOUNTY_NOT_ACCEPTED')
    assert.equal((await first.post('/bounties/accept', { ...ticket, expiresAt: expiresAt - 1 })).json().code, 'BOUNTY_UNAVAILABLE')
    const accept = await weak.act<BountyEntryDTO>('/bounties/accept', ticket)
    assert.equal(accept.result.mapId, undefined)
    assert.equal((await weak.post('/duel', pursuit)).json().code, 'DUEL_NOT_NEARBY')

    const sockets = await Promise.all([target, first, second, weak].map((actor) => actor.connect()))
    try {
      const located = (await weak.read<BountyBoardDTO>('/bounties')).entries.find((entry) => entry.targetId === target.id)
      assert.equal(located?.mapId, 'jiaxing_suburb')
      assert.equal((await weak.post('/duel', { action: 'ambush', targetPlayerId: target.id })).json().code, 'BOUNTY_NOT_ACCEPTED')
      const weakBefore = await weak.read()
      const failure = await weak.act<BattleReportDTO>('/duel', pursuit)
      assert.equal(failure.result.winner, 'ENEMY')
      assert.equal(failure.result.rewards, undefined)
      assert.equal(failure.snapshot.player.silver, weakBefore.player.silver)
      assert.equal((await target.read()).player.bountyUntil, expiresAt)
      assert.deepEqual((await weak.read()).player.bountyAccepted, { targetId: target.id, expiresAt })

      await Promise.all([first, second].map((hunter) => strength(hunter.id, 3500, 900, 40, 4, 180)))
      await Promise.all([first, second].map((hunter) => hunter.act('/bounties/accept', ticket)))
      const previous = await Promise.all([first.read(), second.read()])
      const keys = [randomUUID(), randomUUID()]
      const responses = await Promise.all([first, second].map((hunter, i) => hunter.post('/duel', pursuit, keys[i])))
      assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409])
      assert.equal(responses.find((r) => r.statusCode === 409)?.json().code, 'BOUNTY_UNAVAILABLE')
      const winnerIndex = responses.findIndex((r) => r.statusCode === 200)
      const report = responses[winnerIndex].json<GameAction<BattleReportDTO>>().result
      assert.equal(report.winner, 'ALLY')
      assert.deepEqual(report.rewards, { qiExp: 0, silver: BETRAYAL_BOUNTY.silver, sectContrib: BETRAYAL_BOUNTY.sectContrib, karma: BETRAYAL_BOUNTY.karma })
      const winner = [first, second][winnerIndex]
      const receipt = await winner.act<BattleReportDTO>('/duel', pursuit, keys[winnerIndex])
      assert.deepEqual(receipt.result, report)
      assert.equal(receipt.snapshot.player.bountyAccepted, undefined)
      const latest = await Promise.all([first.read(), second.read()])
      assert.equal(latest[winnerIndex].player.sectContribution - previous[winnerIndex].player.sectContribution, BETRAYAL_BOUNTY.sectContrib)
      assert.ok(latest[winnerIndex].player.silver - previous[winnerIndex].player.silver >= BETRAYAL_BOUNTY.silver)
      assert.equal(latest[1 - winnerIndex].player.silver, previous[1 - winnerIndex].player.silver)
      assert.equal((await target.read()).player.bountyUntil, null)
      assert.ok(!(await winner.read<BountyBoardDTO>('/bounties')).entries.some((entry) => entry.targetId === target.id))
    } finally {
      await Promise.all(sockets.map(async (socket) => {
        const closed = once(socket, 'close')
        socket.close()
        await closed
      }))
    }
  })

  it('过期通缉不会显示或触发战斗，旧接令也无法追捕同一人新的通缉', async () => {
    const hunter = await createPlayer('old_order')
    const target = await createPlayer('old_target')
    const expiresAt = target.snapshot.serverTime - 1
    await profile(target.id, { bountyUntil: expiresAt, betrayedSectIds: ['taohua'] })
    await profile(hunter.id, { bountyAccepted: { targetId: target.id, expiresAt } })
    const ticket = { targetPlayerId: target.id, expiresAt }
    assert.ok(!(await hunter.read<BountyBoardDTO>('/bounties')).entries.some((entry) => entry.targetId === target.id))
    assert.equal((await hunter.post('/bounties/accept', ticket)).json().code, 'BOUNTY_UNAVAILABLE')
    assert.equal((await hunter.post('/duel', { action: 'pursue', ...ticket })).json().code, 'BOUNTY_UNAVAILABLE')
    const newExpiry = expiresAt + 48 * 3_600_000
    await profile(target.id, { bountyUntil: newExpiry, betrayedSectIds: ['taohua', 'quanzhen'] })
    const next = (await hunter.read<BountyBoardDTO>('/bounties')).entries.find((entry) => entry.targetId === target.id)
    assert.equal(next?.accepted, false)
    assert.equal(next?.sectId, 'quanzhen')
    assert.equal((await hunter.post('/duel', { action: 'pursue', ...ticket, expiresAt: newExpiry })).json().code, 'BOUNTY_NOT_ACCEPTED')
  })

  it('离线值守使用冻结阵容，按胜负结算并持久化双方看到的同一场战报', async () => {
    const guard = await createPlayer('guard')
    const thief = await createPlayer('thief')
    const library = '/sect/library'
    const options = { action: 'steal', skillId: 'xiantian_gong' }
    await guard.act('/sect', { action: 'join', sectId: 'quanzhen' })
    assert.equal((await guard.post(library, { action: 'guard', enabled: true })).json().code, 'LIBRARY_GUARD_REQUIRED')
    assert.equal((await thief.post(library, options)).json().code, 'LIBRARY_STEAL_REQUIRED')
    for (const actor of [guard, thief]) await actor.act('/map/move', { mapId: QUANZHEN_LIBRARY.mapId })
    assert.equal((await thief.post(library, options)).json().code, 'LIBRARY_NO_GUARD')
    await strength(guard.id, 2200, 700, 40, 4, 100)
    await db.query("UPDATE player_loadouts SET preset = jsonb_set(preset, '{stance}', '\"AGILE\"') WHERE player_id = $1 AND preset_idx = 1", [guard.id])
    await guard.act<LibraryResult>(library, { action: 'guard', enabled: true })
    const beforeGuard = await guard.read()
    await strength(guard.id, 1, 1, 1, 1, 0)
    await guard.act('/loadout/1', { preset: { ...beforeGuard.loadouts[0], stance: 'FIERCE' }, expectedRevision: beforeGuard.revision }, undefined, 'PUT')

    await profile(thief.id, { silver: QUANZHEN_LIBRARY.guardSilver - 1 })
    assert.equal((await thief.post(library, options)).json().code, 'SILVER_INSUFFICIENT')
    assert.equal((await guard.read<LibraryStatusDTO>(library)).reports.length, 0)
    await profile(thief.id, { silver: 18_600 })
    const beforeThief = await thief.read()
    const key = randomUUID()
    const failed = await thief.act<LibraryResult>(library, options, key)
    assert.equal(failed.result.action, 'steal')
    const report = failed.result.report
    assert.equal(report.winner, 'ENEMY')
    assert.equal(report.stanceBanner.enemyStance, 'AGILE')
    assert.equal(report.units.find(({ slot }) => slot === 'ENEMY_MAIN')?.maxHp, beforeGuard.derivedStats.maxHp)
    assert.equal(failed.snapshot.learnedSkills.xiantian_gong, undefined)
    assert.equal(failed.snapshot.player.silver, beforeThief.player.silver - QUANZHEN_LIBRARY.guardSilver)
    assert.deepEqual((await thief.act<LibraryResult>(library, options, key)).result, failed.result)
    const defender = await guard.read()
    assert.equal(defender.player.silver, beforeGuard.player.silver + QUANZHEN_LIBRARY.guardSilver)
    assert.equal(defender.player.sectContribution, beforeGuard.player.sectContribution + QUANZHEN_LIBRARY.guardContribution)

    const guardInbox = await guard.read<LibraryStatusDTO>(library)
    assert.equal(guardInbox.reports.length, 1)
    assert.deepEqual(guardInbox.reports[0], { battleId: report.battleId, intruder: thief.snapshot.player.nickname,
      occurredAt: failed.snapshot.serverTime, won: true, silver: QUANZHEN_LIBRARY.guardSilver, sectContrib: QUANZHEN_LIBRARY.guardContribution })
    const replayPath = `${library}/reports/${report.battleId}`
    const replay = await guard.read<BattleReportDTO>(replayPath)
    assert.deepEqual(replay.events, report.events)
    assert.equal(replay.perspective, 'ENEMY')
    assert.deepEqual(replay.rewards, { qiExp: 0, silver: QUANZHEN_LIBRARY.guardSilver, sectContrib: QUANZHEN_LIBRARY.guardContribution })
    assert.equal((await thief.get(replayPath)).statusCode, 404)

    await guard.act(library, { action: 'guard', enabled: true })
    await strength(thief.id, 2500, 900, 40, 4, 160)
    const wins = await Promise.all([thief.post(library, options), thief.post(library, options)])
    assert.deepEqual(wins.map((r) => r.statusCode).sort(), [200, 409])
    assert.equal(wins.find((r) => r.statusCode === 409)?.json().code, 'LIBRARY_SKILL_KNOWN')
    const success = wins.find((r) => r.statusCode === 200)!.json<GameAction<Extract<LibraryResult, { action: 'steal' }>>>()
    assert.equal(success.result.report.winner, 'ALLY')
    assert.equal(success.result.report.stanceBanner.enemyStance, 'FIERCE')
    assert.deepEqual(success.result.report.rewards?.items?.map(({ id }) => id), ['xiantian_gong'])
    assert.equal((await thief.read()).learnedSkills.xiantian_gong, 1)
    assert.equal((await thief.read()).player.silver, failed.snapshot.player.silver)
    const reports = (await guard.read<LibraryStatusDTO>(library)).reports
    assert.equal(reports.length, 2)
    assert.equal(reports.find(({ battleId }) => battleId === success.result.report.battleId)?.won, false)
    assert.equal((await guard.read()).player.silver, defender.player.silver)
    assert.equal((await thief.post(library, { action: 'steal', skillId: 'xianglong_18' })).json().code, 'LIBRARY_ACTION_INVALID')

    await guard.act('/map/move', { action: 'depart', mapId: 'jiaxing_suburb' })
    assert.equal((await guard.read()).player.isGuardingLibrary, false)
    assert.equal((await thief.read<LibraryStatusDTO>(library)).guardAvailable, false)
    assert.equal((await guard.read<LibraryStatusDTO>(library)).reports.length, 2)
  })

  it('新档逐关开放 16 个节点，刷新、并发和原请求重放都只保留一份首胜', async () => {
    const player = await createPlayer('main')
    assert.equal(player.snapshot.player.maxChapterId, 1)
    assert.deepEqual(player.snapshot.rewardedChapters, [])
    assert.equal((await player.post('/story/1-2/challenge')).statusCode, 409)
    assert.equal((await player.post('/story/3-1/challenge')).statusCode, 409)

    const firstPath = '/story/1-1/challenge'
    const key = randomUUID()
    const first = await Promise.all([player.act<StoryChallengeResult>(firstPath, undefined, key), player.act<StoryChallengeResult>(firstPath)])
    assert.equal(first.filter(({ result }) => result.firstClear).length, 1)
    assert.ok(first.every(({ result }) => result.report.winner === 'ALLY'))
    assert.equal(first.find(({ result }) => result.firstClear)?.result.report.rewards?.qiExp, 1700)
    const replay = await player.act<StoryChallengeResult>(firstPath, undefined, key)
    assert.deepEqual(replay.result, first[0].result)
    const saved = await player.read()
    assert.deepEqual(saved.rewardedChapters, [1])
    assert.equal(saved.player.qiExp, player.snapshot.player.qiExp + 1700)
    assert.equal(saved.learnedSkills.kaishan_zhang, 1)

    // 用当前版本可取得的等级、经脉和装备跳过练级、巡历与组队时间。
    const { player: { realmTier, stats } } = saved
    await profile(player.id, {
      level: 40, realmTier: realmTier + 1, openedAcupointIds: legacyAcupoints(realmTier + 1),
      stats: { ...stats, str: 40, con: 38, agi: 37, intStat: 39, karma: 400 },
    })
    const preset = { ...saved.loadouts[0] }
    const equipment = {
      weaponId: 'tiezhang_kaishan_weapon', headId: 'tiezhang_kaishan_head', armorId: 'tiezhang_kaishan_armor',
      wristId: 'tiezhang_kaishan_wrist', beltId: 'tiezhang_kaishan_belt', bootsId: 'tiezhang_kaishan_boots',
      accId: 'tiezhang_kaishan_acc', relicBookId: 'wumu_yishu',
    }
    await db.query(`INSERT INTO player_items (player_id, item_id) SELECT $1, unnest($2::text[])`, [player.id, Object.values(equipment)])
    assert.equal(ONLINE_STORY_CHAPTERS.length, 16)
    for (const { id, code, bossName, bossStance } of ONLINE_STORY_CHAPTERS.slice(1)) {
      const stance = { AGILE: 'FIERCE', FIERCE: 'TAICHI', TAICHI: 'AGILE' }[bossStance]
      await db.query('UPDATE player_loadouts SET preset = $2 WHERE player_id = $1 AND preset_idx = 1', [player.id, { ...preset, ...equipment, stance }])
      if (code === '2-2') await player.act('/story/2-2/adventure', { choice: 'A' })
      const { result, snapshot } = await player.act<StoryChallengeResult>(`/story/${code}/challenge`)
      assert.equal(result.report.winner, 'ALLY', code)
      assert.equal(result.report.units.find((unit) => unit.slot === 'ENEMY_MAIN')?.name, bossName, code)
      if (code === '4-3') assert.ok(!result.report.rewards?.items?.some(({ id }) => id === 'wumu_yishu'))
      assert.equal(result.firstClear, true)
      assert.equal(snapshot.player.maxChapterId, id + 1)
      assert.equal(snapshot.rewardedChapters?.length, id)
    }
    const finished = await player.read()
    assert.deepEqual(finished.rewardedChapters, ONLINE_STORY_CHAPTERS.map(({ id }) => id))
    assert.equal(finished.player.maxChapterId, 17)
    assert.ok(finished.ownedItemIds.includes('jiuyin_sanskrit'))
  })

  it('旧档按原剧情关重映射开放进度、首胜及药蛇选择，旧请求可取回原回执', async () => {
    const player = await createPlayer('legacy')
    await legacyProgress(player.id, 6, [1, 2, 3, 4, 5])
    await profile(player.id, { storySnakeChoice: 'A', bonusHpPct: 15 })
    await strength(player.id, 2000, 400, 72, 3, 120)
    const key = randomUUID()
    const oldPath = '/story/2/challenge'
    const receipt = { report: { battleId: 'old-manor-report' }, firstClear: true }
    const fingerprint = createHash('sha256').update(JSON.stringify(['POST', `/api/v1${oldPath}`, null])).digest('hex')
    await db.query('INSERT INTO player_actions VALUES ($1, $2, $3, $4)', [player.id, key, fingerprint, receipt])

    const restored = await player.read()
    assert.equal(restored.player.maxChapterId, 17)
    assert.deepEqual(restored.rewardedChapters, [3, 5, 9, 13, 16])
    const oldReplay = await player.act<StoryChallengeResult>(oldPath, undefined, key)
    assert.deepEqual(oldReplay.result, receipt)
    assert.deepEqual(oldReplay.snapshot.rewardedChapters, restored.rewardedChapters)
    const manor = await player.act<StoryChallengeResult>(oldPath)
    assert.equal(manor.result.report.units.find((unit) => unit.slot === 'ENEMY_MAIN')?.maxHp, 8200)
    assert.equal(manor.result.firstClear, false)
    assert.equal(manor.result.report.rewards, undefined)
    assert.equal(manor.snapshot.player.qiExp, restored.player.qiExp)
    assert.equal(manor.snapshot.player.bonusHpPct, 15)
    assert.equal(manor.snapshot.player.storySnakeChoice, 'A')
    const sameChoice = await player.act<{ firstPick: boolean }>('/story/2-2/adventure', { choice: 'A' })
    assert.equal(sameChoice.result.firstPick, false)
    assert.equal((await player.post('/story/2/adventure', { choice: 'B' })).statusCode, 409)

    const backfill = await player.act<StoryChallengeResult>('/story/1-1/challenge')
    assert.equal(backfill.result.firstClear, true)
    assert.equal(backfill.snapshot.player.maxChapterId, 17)
    assert.deepEqual((await player.read()).rewardedChapters, [3, 5, 9, 13, 16, 1])
    const { rows: [row] } = await db.query("SELECT profile->>'storyProgressVersion' AS version, rewarded_chapters FROM players WHERE id = $1", [player.id])
    assert.deepEqual(row, { version: '2', rewarded_chapters: [3, 5, 9, 13, 16, 1] })

    const partial = await createPlayer('partial')
    await legacyProgress(partial.id, 3, [1, 2])
    assert.equal((await partial.read()).player.maxChapterId, 9)
    assert.deepEqual((await partial.read()).rewardedChapters, [3, 5])
    assert.equal((await partial.post('/story/3-4/challenge')).statusCode, 409)
    assert.equal((await partial.post('/story/adventures/huanghe_sigui', { choice: 'A' })).statusCode, 409)
    assert.equal((await partial.act('/map/move', { mapId: 'guiyun_lake' })).snapshot.player.currentMapId, 'guiyun_lake')
  })

  it('铁枪庙护送查根骨与伤员存活，败后可重试，并发胜利只结算一份奖励', async () => {
    const player = await createPlayer('escort')
    const route = '/story/adventures/tieqiangmiao'
    assert.equal((await player.post(route, { choice: 'A' })).statusCode, 409)
    await legacyProgress(player.id, 3, [1, 2])
    await db.query(`UPDATE player_loadouts SET preset = $2 WHERE player_id = $1 AND preset_idx = 1`, [player.id, { presetIdx: 1, stance: 'FIERCE' }])
    await strength(player.id, 10, 24, 12, 1, 0)
    assert.equal((await player.post(route, { choice: 'A' })).json().code, 'STORY_ADVENTURE_REQUIREMENT')
    await strength(player.id, 10, 25, 12, 1, 0)
    const { result: defeat, snapshot } = await player.act<StoryAdventureResult>(route, { choice: 'A' })
    assert.equal(defeat.report?.winner, 'ENEMY')
    assert.equal(defeat.report?.rewards, undefined)
    assert.ok(defeat.report?.events.some((event) => event.segments.some((seg) => seg.type === 'tag' && seg.text.includes('护送失败'))))
    assert.equal(snapshot.player.storyAdventureChoices?.tieqiangmiao, undefined)
    assert.ok(!snapshot.ownedItemIds.includes('yangjia_spear'))

    await strength(player.id, 600, 300, 32, 3, 80)
    const key = randomUUID()
    const choices = await Promise.all([player.act<StoryAdventureResult>(route, { choice: 'A' }, key), player.act<StoryAdventureResult>(route, { choice: 'A' })])
    const wins = choices.filter(({ result }) => result.firstPick)
    assert.equal(wins.length, 1)
    const report = wins[0].result.report!
    assert.equal(report.winner, 'ALLY')
    assert.deepEqual(report.units.filter(({ slot }) => slot.startsWith('ALLY_ESCORT')).map(({ hp }) => hp), [950, 850])
    assert.deepEqual(report.rewards?.items?.map(({ id }) => id).sort(), ['yangjia_qiang', 'yangjia_spear'])
    assert.ok(report.events.some((event) => event.segments.some((seg) => seg.type === 'tag' && seg.text.includes('杨铁心、包惜弱脱险'))))
    assert.deepEqual((await player.act<StoryAdventureResult>(route, { choice: 'A' }, key)).result, choices[0].result)
    const saved = await player.read()
    assert.equal(saved.player.storyAdventureChoices?.tieqiangmiao, 'A')
    assert.equal(saved.player.stats.karma, 40)
    assert.equal(saved.learnedSkills.yangjia_qiang, 1)
    assert.equal(saved.companionAffinity.yangtiexin.recruited, true)
    assert.equal((await player.post(route, { choice: 'B' })).json().code, 'STORY_ADVENTURE_RESOLVED')
  })

  it('黄河四鬼、一灯守战及金刀驸马在共享引擎打完后发各自奖励', async () => {
    const player = await createPlayer('branches')
    await profile(player.id, { maxChapterId: 15 })
    await db.query('UPDATE players SET rewarded_chapters = $2 WHERE id = $1', [player.id, [4, 13, 14]])
    await strength(player.id, 900, 250, 65, 3, 120)
    const yellowRiver = await player.act<StoryAdventureResult>('/story/adventures/huanghe_sigui', { choice: 'A' })
    assert.equal(yellowRiver.result.report?.winner, 'ALLY')
    assert.equal(yellowRiver.result.report?.units.filter(({ slot }) => slot.startsWith('ENEMY')).length, 4)
    assert.ok(yellowRiver.snapshot.player.storyFlags?.includes('gaibang_letter'))
    assert.equal(yellowRiver.result.report?.rewards?.silver, 3200)

    await db.query("UPDATE player_loadouts SET preset = $2 WHERE player_id = $1 AND preset_idx = 1", [player.id, { presetIdx: 1, stance: 'TAICHI' }])
    await strength(player.id, 18, 120, 48, 3, 0)
    await db.query("UPDATE player_skills SET mastery = 9 WHERE player_id = $1 AND skill_id = 'yiyang_zhi'", [player.id])
    const refuge = await player.act<StoryAdventureResult>('/story/adventures/yideng_cibei', { choice: 'A' })
    assert.equal(refuge.result.report?.winner, 'ALLY')
    assert.ok(refuge.result.report?.events.some(({ round, effectSourceId, segments }) => round === 5 && effectSourceId === 'yideng_cibei' && segments.some((seg) => seg.type === 'tag' && seg.text.includes('已撑过 5 回合'))))
    assert.equal(refuge.snapshot.learnedSkills.yiyang_zhi, 10)
    assert.equal(refuge.snapshot.learnedSkills.kurong_chan, 1)

    await strength(player.id, 1400, 250, 65, 3, 120)
    const sword = await player.act<StoryAdventureResult>('/story/adventures/jindao_fuma', { choice: 'A' })
    assert.equal(sword.result.report?.winner, 'ALLY')
    assert.equal(sword.result.report?.rewards?.silver, 6000)
    assert.ok(sword.snapshot.ownedItemIds.includes('dadiao_jindao'))
    assert.deepEqual((await player.read()).player.storyAdventureChoices, { huanghe_sigui: 'A', yideng_cibei: 'A', jindao_fuma: 'A' })
  })

  it('梅超风与杨铁心的故人寻访按日累积，过完赴约和备礼才进战，胜利只招募一次', async () => {
    const player = await createPlayer('reunion')
    assert.ok(!player.snapshot.companionAffinity.meichaofeng?.recruited)
    await legacyProgress(player.id, 3, [1, 2])
    await strength(player.id, 900, 250, 32, 3, 100)
    const quests = [
      { id: 'meichaofeng', branch: 'huangshan_bishou', choice: 'A', node: '1-3', map: 'jiaxing_suburb', enemy: '全真弟子·尹志平' },
      { id: 'yangtiexin', branch: 'tieqiangmiao', choice: 'B', node: '2-2', map: 'zhongnan_forest', enemy: '金兵统领·段天德' },
    ]
    for (const quest of quests) await player.act(`/story/adventures/${quest.branch}`, { choice: quest.choice })
    await db.query('UPDATE players SET last_settle_at = last_settle_at - 7200000 WHERE id = $1', [player.id])
    const offline = await player.act<IdleGain>('/cultivate/settle')
    assert.deepEqual(offline.result.reunionClues, { meichaofeng: 5, yangtiexin: 5 })
    for (const quest of quests) {
      const path = `/story/reunion/${quest.id}`
      const replay = await player.act<StoryChallengeResult>(`/story/${quest.node}/challenge`)
      assert.equal(replay.snapshot.player.reunions?.[quest.id].clues, 8)
      const ask = await player.act<ReunionResult>(path, { action: 'inquire' })
      assert.equal(ask.snapshot.player.reunions?.[quest.id].clues, 10)
      assert.equal((await player.post(path, { action: 'inquire' })).json().code, 'REUNION_DAILY_CAP')
      assert.equal((await player.post(path, { action: 'battle' })).json().code, 'REUNION_STEP_REQUIRED')

      const now = (await player.read()).serverTime
      await db.query("UPDATE players SET profile = jsonb_set(profile, ARRAY['reunions', $2], profile->'reunions'->$2 || '{\"clues\": 298, \"day\": -1}'::jsonb) WHERE id = $1", [player.id, quest.id])
      const waiting = await player.act<ReunionResult>(path, { action: 'inquire' })
      assert.equal(waiting.snapshot.player.reunions?.[quest.id].step, 'WAIT')
      await player.act('/map/move', { mapId: quest.map })
      assert.equal((await player.post(path, { action: 'wait' })).json().code, 'REUNION_WAIT_REQUIRED')
      const away = quest.map === 'zhongnan_forest' ? 'jiaxing_suburb' : 'zhongnan_forest'
      await db.query(`UPDATE players SET profile = jsonb_set(profile || $3::jsonb, ARRAY['reunions', $2, 'waitSince'], to_jsonb($4::bigint)) WHERE id = $1`,
        [player.id, quest.id, { mapArrivedAt: now - 3_000_000 }, now - 3_000_000])
      const leaving = await player.act('/map/move', { mapId: away })
      assert.ok(leaving.snapshot.player.reunions![quest.id].waitMs >= 3_000_000)
      assert.equal((await player.post(path, { action: 'wait' })).json().code, 'REUNION_WAIT_REQUIRED')
      await player.act('/map/move', { mapId: quest.map })
      await db.query(`UPDATE players SET profile = jsonb_set(profile || $3::jsonb, ARRAY['reunions', $2, 'waitSince'], to_jsonb($4::bigint)) WHERE id = $1`,
        [player.id, quest.id, { mapArrivedAt: now - 4_201_000 }, now - 4_201_000])
      const invited = await player.act<ReunionResult>(path, { action: 'wait' })
      assert.equal(invited.snapshot.player.reunions?.[quest.id].step, 'GIFT')
      const gift = await player.act<ReunionResult>(path, { action: 'gift' })
      assert.equal(gift.snapshot.player.silver, invited.snapshot.player.silver - INN_GIFT_COST)
      const recruited = await player.act<ReunionResult>(path, { action: 'battle' })
      assert.equal(recruited.result.action, 'battle')
      assert.equal(recruited.result.report.winner, 'ALLY')
      assert.equal(recruited.result.report.units.find(({ slot }) => slot === 'ENEMY_MAIN')?.name, quest.enemy)
      assert.deepEqual(recruited.result.report.rewards?.companions, [quest.id])
      assert.equal(recruited.snapshot.player.reunions?.[quest.id].step, 'DONE')
      assert.equal((await player.post(path, { action: 'battle' })).json().code, 'REUNION_UNAVAILABLE')
    }
    assert.equal((await player.read()).companionAffinity.yangtiexin.recruited, true)
  })
})
