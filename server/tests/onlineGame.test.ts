import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { on, once } from 'node:events'
import { readdir, readFile } from 'node:fs/promises'
import { after, before, describe, it, mock } from 'node:test'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'
import pg from 'pg'
import { COMPANIONS, COOP_RAIDS, INN_GIFT_COST, ITEMS, SKILLS } from '../../shared/gameData.ts'
import { GAIBANG_FINAL_DISHES, gaibangDishFlag } from '../../shared/gaibang.ts'
import { DAILY_TASKS, INGOT } from '../../shared/economy.ts'
import { DISHES, FEAST_TARGET_FLAG } from '../../shared/feast.ts'
import { FTUE_QUESTS } from '../../shared/ftueQuests.ts'
import { GACHA_DUP_TOKENS, GACHA_HARD_PITY, GACHA_SINGLE_COST, REUNION_TICKET_COST } from '../../shared/gacha.ts'
import { STALL, stallGoods } from '../../shared/stalls.ts'
import { arenaDay, arenaWindow, DAGOU_ELDER, DAGOU_STAFF, isArenaDay, nextArenaDay } from '../../shared/artifacts.ts'
import { AUCTION_BID_STEP, AUCTION_SOFT_CLOSE_MS, auctionDay, auctionDividendAt, auctionLot, auctionWindow } from '../../shared/ghostAuction.ts'
import { computeDerivedStats } from '../../shared/battle.ts'
import { huashanSeason } from '../../shared/huashan.ts'
import { createStarterCharacter, innVisitDay, legacyAcupoints } from '../../shared/player.ts'
import type { ArtifactBoardDTO, ArtifactResult, AuctionBoardDTO, AuctionResult, AwakenResult, BattleReportDTO, BountyBoardDTO, BountyEntryDTO, FeastResult, FtueClaimResult, GachaResult, GameAction, HuashanBoardDTO, HuashanResult, IdleGain, LibraryResult, LibraryStatusDTO, OriginId, PlayerSnapshot, RaidId, ReunionResult, SectContestBoardDTO, SectContestResult, SectResult, StallBoardDTO, StallResult, StoryAdventureResult, StoryChallengeResult, WsServerEvent, XiangyangBoardDTO, XiangyangResult } from '../../shared/protocol.ts'
import { QUANZHEN_LIBRARY } from '../../shared/quanzhen.ts'
import { BETRAYAL_BOUNTY, SECT_CHIEF_SALUTE_QI, SECT_SALUTE_QI, sectContestEndsAt, sectContestWeek } from '../../shared/sectProgress.ts'
import { ONLINE_STORY_CHAPTERS, ONLINE_STORY_PROGRESS_VERSION } from '../../shared/storyData.ts'
import { xiangyangWar, xiangyangWarOf } from '../../shared/xiangyang.ts'
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

  /** 老手存档：联机新角色从 Lv.1 起步，规则类测试沿用原先 Lv.32 的演武阵容 */
  async function veteran(id: string, created: PlayerSnapshot) {
    const { player: created_player } = created
    const starter = createStarterCharacter(
      { id, nickname: created_player.nickname, avatarId: created_player.avatarId }, created_player.lastSettleAt)
    delete starter.companionAffinity.meichaofeng
    starter.presets[3].leftCompanionId = 'kezhene'
    const { id: _id, nickname: _nickname, lastSettleAt: _settled, nextLevelQi: _next, qiPerHour: _rate, equipmentAffixes: _affixes,
      chapterOneChampion: _champion, ...profile } = starter.player
    Object.assign(profile, {
      maxChapterId: 1, storyProgressVersion: ONLINE_STORY_PROGRESS_VERSION, trial: created_player.trial,
      openedAcupointIds: starter.openedAcupointIds, acupointPills: { pozhang_dan: starter.pillCount },
      alchemy: { herbs: starter.herbInventory, pity: {}, residue: 0 }, ftue: created_player.ftue,
    })
    await db.query('UPDATE players SET profile = $2, pill_count = $3 WHERE id = $1', [id, profile, starter.pillCount])
    for (const table of ['player_items', 'player_skills', 'player_companions', 'player_loadouts']) {
      await db.query(`DELETE FROM ${table} WHERE player_id = $1`, [id])
    }
    await db.query('INSERT INTO player_items (player_id, item_id) SELECT $1, unnest($2::text[])', [id, starter.ownedItemIds])
    await db.query('INSERT INTO player_skills SELECT $1, key, value::int FROM jsonb_each_text($2::jsonb)', [id, starter.learnedSkills])
    await db.query('INSERT INTO player_companions SELECT $1, key, value FROM jsonb_each($2::jsonb)', [id, starter.companionAffinity])
    await db.query(`INSERT INTO player_loadouts SELECT $1, (value->>'presetIdx')::int, value FROM jsonb_array_elements($2::jsonb)`,
      [id, JSON.stringify(Object.values(starter.presets))])
  }

  /** fresh：联机新角色；gated 时保留新手序章的玩法开放顺序，否则按老角色处理（玩法全部开放） */
  async function register(name: string, fresh: boolean, gated = false, origin: OriginId = 'xuanmen') {
    const loginName = `story_${name}`
    const registration = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { loginName, password: randomUUID() } })
    assert.equal(registration.statusCode, 201)
    const cookie = registration.cookies[0]
    const headers = { cookie: `${cookie.name}=${cookie.value}` }
    const creation = await app.inject({ method: 'POST', url: '/api/v1/player/create', headers, payload: { nickname: loginName, origin } })
    assert.equal(creation.statusCode, 200, creation.body)
    let snapshot = creation.json<PlayerSnapshot>()
    const id = snapshot.player.id
    if (!fresh) await veteran(id, snapshot)
    else if (!gated) await db.query("UPDATE players SET profile = profile - 'featureGate' WHERE id = $1", [id])
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
    if (!fresh || !gated) snapshot = await read()
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
  const createPlayer = (name: string) => register(name, false)
  const createRookie = (name: string) => register(name, true)
  const createNewcomer = (name: string) => register(name, true, true)

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
      // 结榜后收功按上周名分发元宝：首席多得，未出战不得，每周只发一次
      assert.equal((await winner.act<IdleGain>('/cultivate/settle')).result.contestIngot, INGOT.sectContestChief)
      assert.equal((await peer.act<IdleGain>('/cultivate/settle')).result.contestIngot, INGOT.sectContestJoin)
      assert.equal((await winner.act<IdleGain>('/cultivate/settle')).result.contestIngot, undefined)
      assert.equal((await idle.act<IdleGain>('/cultivate/settle')).result.contestIngot, undefined)
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

  async function ledger(id: string) {
    const { rows } = await db.query<{ delta: number; balance: number; reason: string; ref: string | null }>(
      'SELECT delta, balance, reason, ref FROM ingot_ledger WHERE player_id = $1 ORDER BY id', [id])
    return rows
  }

  async function companionState(id: string, companionId: string, patch: Record<string, unknown>) {
    await db.query('UPDATE player_companions SET state = state || $3::jsonb WHERE player_id = $1 AND companion_id = $2', [id, companionId, patch])
  }

  it('联机新角色与本地新游戏同为 Lv.1 开局，元宝里程碑由存档推出、只发一次并留流水', async () => {
    const rookie = await createRookie('rookie')
    const start = rookie.snapshot
    assert.equal(start.player.level, 1)
    assert.equal(start.player.goldIngot, INGOT.start)
    assert.deepEqual(start.ownedItemIds, ['qinggang_sword'])
    assert.deepEqual(start.learnedSkills, {})
    // 玄门出身：根骨 +3、悟性 +1，师兄松岩子开局就在右翼，其余伙伴都还没结识
    assert.equal(start.player.origin, 'xuanmen')
    assert.deepEqual(start.player.stats, { str: 10, con: 13, agi: 10, intStat: 11, luck: 10, karma: 0 })
    assert.deepEqual(Object.entries(start.companionAffinity).filter(([, { met, recruited }]) => met || recruited).map(([id]) => id), ['songyanzi'])
    assert.ok(start.loadouts.every(({ weaponId, leftCompanionId, rightCompanionId }) =>
      weaponId === 'qinggang_sword' && leftCompanionId === null && rightCompanionId === 'songyanzi'))

    await profile(rookie.id, { trial: { ...start.player.trial, rewardedStageIds: [1, 7] }, realmTier: 2 })
    const settled = await rookie.act<IdleGain>('/cultivate/settle')
    assert.equal(settled.snapshot.player.goldIngot, INGOT.start + INGOT.trialStage + INGOT.trialChapterEnd + INGOT.realmBreak)
    const again = await rookie.act<IdleGain>('/cultivate/settle')
    assert.equal(again.snapshot.player.goldIngot, settled.snapshot.player.goldIngot)
    const rows = await ledger(rookie.id)
    assert.deepEqual(rows.map(({ ref }) => ref), ['start', 'trial:1', 'trial:7', 'realm:2'])
    assert.equal(rows.at(-1)?.balance, again.snapshot.player.goldIngot)
  })

  it('建角须选家世；同一账号重复建角只认原来的家世', async () => {
    const registration = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { loginName: 'story_origin', password: randomUUID() } })
    const cookie = registration.cookies[0]
    const headers = { cookie: `${cookie.name}=${cookie.value}` }
    const create = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/v1/player/create', headers, payload: { nickname: 'origin_n', ...payload } })
    for (const origin of [undefined, 'shaolin', '__proto__']) {
      const rejected = await create({ origin })
      assert.equal(rejected.statusCode, 400)
      assert.equal(rejected.json().code, 'INVALID_ORIGIN')
    }
    const created = await create({ origin: 'yujia' })
    assert.equal(created.statusCode, 200, created.body)
    const { player, loadouts } = created.json<PlayerSnapshot>()
    assert.equal(player.origin, 'yujia')
    assert.ok(loadouts.every(({ leftCompanionId }) => leftCompanionId === 'ruanqinggao'))
    assert.equal((await create({ origin: 'yujia' })).statusCode, 200)
    assert.equal((await create({ origin: 'jiangmen' })).statusCode, 409)
  })

  it('家事只对本家开放，家传信物落库，集齐后家人可觉醒', async () => {
    const taoist = await createRookie('family')
    const fisher = await register('fish', true, false, 'yujia')
    for (const { id } of [taoist, fisher]) {
      await profile(id, { maxChapterId: 5 })
      await db.query('UPDATE players SET rewarded_chapters = $2 WHERE id = $1', [id, [1, 2, 3, 4]])
    }
    assert.equal((await taoist.post('/story/adventures/family_yujia_1', { choice: 'B' })).statusCode, 404)
    assert.equal((await fisher.post('/story/adventures/family_xuanmen_1', { choice: 'B' })).statusCode, 404)
    assert.equal((await taoist.post('/story/adventures/family_xuanmen_3', { choice: 'B' })).json().code, 'STORY_ADVENTURE_LOCKED')

    const first = await taoist.act<StoryAdventureResult>('/story/adventures/family_xuanmen_1', { choice: 'B' })
    assert.equal(first.result.firstPick, true)
    assert.ok(first.result.narration?.some((seg) => seg.type === 'text' && seg.text.includes('松岩子的家传信物 +10')))
    const second = await taoist.act<StoryAdventureResult>('/story/adventures/family_xuanmen_2', { choice: 'B' })
    assert.equal(second.snapshot.player.stats.con, 14)
    const { affinity, tokens, form } = second.snapshot.companionAffinity.songyanzi
    assert.deepEqual({ affinity, tokens, form }, { affinity: 180, tokens: 20, form: 'base' })
    assert.equal((await taoist.read()).companionAffinity.songyanzi.tokens, 20)

    assert.equal((await taoist.post('/companions/awaken', { companionId: 'songyanzi' })).statusCode, 409)
    await companionState(taoist.id, 'songyanzi', { affinity: 300, tokens: 30 })
    const awakened = await taoist.act<AwakenResult>('/companions/awaken', { companionId: 'songyanzi' })
    assert.equal(awakened.snapshot.companionAffinity.songyanzi.form, 'awakened')
    assert.equal(awakened.snapshot.companionAffinity.songyanzi.tokens, 0)
  })

  it('襄阳守卫战：随时出战、一场一门、军令可攒；值守镜像按时刻先后代打，收兵时打完余下的；收功顺带领赏', async () => {
    const war = xiangyangWarOf(xiangyangWar(Date.now()).id + 1)
    const at = (hours: number) => war.opensAt + hours * 3_600_000
    const guard = await createPlayer('xy_guard')
    const ally = await createPlayer('xy_ally')
    const sortie = (who: typeof guard, gate: string, warId = war.id) => who.post('/xiangyang', { action: 'sortie', warId, gate })
    const board = (who: typeof guard) => who.read<XiangyangBoardDTO>('/xiangyang')
    try {
      // 周三 02:00
      fixedServerTime = at(50)
      const drill = await guard.act<XiangyangResult>('/xiangyang', { action: 'drill', gate: 'NORTH', wave: 8 })
      assert.equal(drill.result.action === 'drill' && drill.result.report.sceneTitle, '城头演练 · 北门第 8 波')
      assert.equal((await guard.post('/xiangyang', { action: 'drill', gate: 'NORTH', wave: 9 })).json().code, 'XIANGYANG_INVALID_WAVE')
      const quiet = await board(guard)
      assert.deepEqual([quiet.war.id, quiet.self, quiet.post, quiet.orders, quiet.drum.active], [war.id, null, null, { count: 3, nextAt: null }, false])

      const first = await guard.act<XiangyangResult>('/xiangyang', { action: 'sortie', warId: war.id, gate: 'EAST' })
      assert.ok(first.result.action === 'sortie' && first.result.merit > 0 && !first.result.drum)
      assert.equal(first.result.action === 'sortie' && first.result.gate.defenders, 1)
      assert.equal((await sortie(guard, 'NORTH')).json().code, 'XIANGYANG_GATE_FIXED')
      assert.equal((await sortie(guard, 'EAST', war.id - 1)).json().code, 'XIANGYANG_WAR_CHANGED')
      assert.equal((await sortie(guard, 'EAST')).statusCode, 200)
      assert.equal((await sortie(guard, 'EAST')).statusCode, 200)
      assert.equal((await sortie(guard, 'EAST')).json().code, 'XIANGYANG_NO_ORDERS')
      const posted = await ally.act<XiangyangResult>('/xiangyang', { action: 'post', gate: 'WATER' })
      assert.deepEqual(posted.result, { action: 'post', gate: 'WATER', current: true })
      const moved = await guard.act<XiangyangResult>('/xiangyang', { action: 'post', gate: 'NORTH' })
      assert.deepEqual(moved.result, { action: 'post', gate: 'NORTH', current: false })
      const spent = await board(guard)
      assert.deepEqual([spent.self?.gate, spent.self?.sorties, spent.post?.gate, spent.orders], ['EAST', 3, 'NORTH', { count: 0, nextAt: at(56) }])
      assert.equal(spent.post?.nextAutoAt, at(80))
      assert.deepEqual([(await board(ally)).self, (await board(ally)).post?.nextAutoAt], [null, at(56)])

      // 周三 20:10 擂鼓：先结掉 ally 周三 08:00、16:00 两次满溢的值守，再轮到这一次亲自出战
      fixedServerTime = at(68) + 600_000
      const drummed = await ally.act<XiangyangResult>('/xiangyang', { action: 'sortie', warId: war.id, gate: 'WATER' })
      assert.ok(drummed.result.action === 'sortie' && drummed.result.drum)
      const loud = await board(ally)
      assert.deepEqual([loud.drum.active, loud.self?.sorties, loud.self?.autoSorties], [true, 3, 2])
      assert.deepEqual(loud.feed.slice(0, 3).map(({ auto, drum }) => [auto ?? false, drum ?? false]), [[false, true], [true, false], [true, false]])

      // 周四 09:00：两人周四 08:00 都满溢，各由镜像打一次。
      // guard 正在别的操作里（角色行已锁）时，看榜不等他，他的代打留给他自己那边接着打
      fixedServerTime = at(81)
      const blocker = await db.connect()
      try {
        await blocker.query('BEGIN')
        await blocker.query('SELECT 1 FROM players WHERE id = $1 FOR UPDATE', [guard.id])
        await board(ally)
        const { rows: [held] } = await db.query('SELECT sorties FROM xiangyang_entries WHERE war_id = $1 AND player_id = $2', [war.id, guard.id])
        assert.equal(held.sorties, 3)
      } finally {
        await blocker.query('ROLLBACK')
        blocker.release()
      }
      const thursday = await board(guard)
      assert.deepEqual([thursday.self?.sorties, thursday.self?.autoSorties, thursday.orders.count], [4, 1, 3])
      assert.deepEqual([(await board(ally)).self?.sorties, (await board(ally)).self?.autoSorties], [4, 3])
      assert.equal(thursday.awards.length, 0)

      // 收兵后：此后十次满溢加收兵时的三道，两人各 17 次；收功顺带领赏
      fixedServerTime = war.closesAt + 60_000
      const settled = await guard.act<IdleGain>('/cultivate/settle')
      const [award] = settled.result.xiangyang ?? []
      assert.equal(award?.warId, war.id)
      assert.equal(award.reward.ingot, INGOT.xiangyang)
      assert.deepEqual((await ledger(guard.id)).filter(({ reason }) => reason === 'xiangyang').map(({ ref }) => ref), [`xiangyang:${war.id}`])
      const after = await board(guard)
      assert.equal(after.war.id, war.id + 1)
      assert.deepEqual([after.awards, after.self, after.post?.gate], [[], null, 'NORTH'])
      assert.ok((after.last?.gates.find(({ id }) => id === 'EAST')?.wavesCleared ?? 0) >= 1)
      const allyAfter = await board(ally)
      assert.deepEqual(allyAfter.awards.map(({ warId, gate, sorties }) => [warId, gate, sorties]), [[war.id, 'WATER', 17]])
      const { rows: [entry] } = await db.query('SELECT sorties, auto_sorties FROM xiangyang_entries WHERE war_id = $1 AND player_id = $2', [war.id, guard.id])
      assert.deepEqual(entry, { sorties: 17, auto_sorties: 14 })
      const claimed = await ally.act<XiangyangResult>('/xiangyang', { action: 'claim', warId: war.id })
      assert.equal(claimed.result.action === 'claim' && claimed.result.reward.ingot, INGOT.xiangyang)
      assert.equal((await ally.post('/xiangyang', { action: 'claim', warId: war.id })).json().code, 'XIANGYANG_NO_AWARD')

      // 下一场第一次满溢：guard 的镜像改去北门
      fixedServerTime = xiangyangWarOf(war.id + 1).opensAt + 9 * 3_600_000
      const next = await board(guard)
      assert.deepEqual([next.self?.gate, next.self?.sorties, next.self?.autoSorties], ['NORTH', 1, 1])
    } finally {
      fixedServerTime = undefined
    }
    const newcomer = await createNewcomer('xy_new')
    assert.equal((await newcomer.get('/xiangyang')).json().code, 'FEATURE_LOCKED')
  })

  it('每日江湖事四件做完才能领元宝，当日只领一次', async () => {
    const actor = await createRookie('daily_a')
    await actor.act('/cultivate/settle')
    assert.equal((await actor.post('/daily/claim')).json().code, 'DAILY_NOT_READY')
    await companionState(actor.id, 'kezhene', { met: true })
    await actor.act('/market/inn/gift', { companionId: 'kezhene', favorite: false })
    assert.equal((await actor.post('/story/1-1/challenge')).statusCode, 200) // 胜负都算出战
    await profile(actor.id, { qiExp: 1000 })
    await actor.act('/alchemy/forage')
    const before = await actor.read()
    assert.deepEqual([...before.player.daily!.done].sort(), DAILY_TASKS.map(({ id }) => id).sort())
    const claimed = await actor.act<{ ingot: number }>('/daily/claim')
    assert.equal(claimed.result.ingot, INGOT.daily)
    assert.equal(claimed.snapshot.player.goldIngot, before.player.goldIngot + INGOT.daily)
    assert.equal((await actor.post('/daily/claim')).json().code, 'DAILY_NOT_READY')
    assert.equal((await ledger(actor.id)).filter(({ reason }) => reason === 'daily').length, 1)
  })

  it('新手序章后的新角色：玩法随剧情开放，服务端拦截未开放的玩法和拉新人同玩，开放剧情的已读记在存档', async () => {
    const newcomer = await createNewcomer('newcomer')
    assert.equal(newcomer.snapshot.player.featureGate, true)
    const code = async (path: string, payload?: Record<string, unknown>) => (await newcomer.post(path, payload)).json().code
    assert.equal(await code('/trial/1/challenge'), 'FEATURE_LOCKED')
    assert.equal(await code('/trial/patrol', { stageId: 1 }), 'FEATURE_LOCKED')
    assert.equal(await code('/market/inn/gift', { companionId: 'kezhene', favorite: false }), 'FEATURE_LOCKED')
    assert.equal(await code('/market/gacha', { count: 1 }), 'FEATURE_LOCKED')
    assert.equal(await code('/alchemy/forage'), 'FEATURE_LOCKED')
    assert.equal(await code('/sect', { action: 'join', sectId: 'quanzhen' }), 'FEATURE_LOCKED')
    assert.equal(await code('/huashan', { action: 'mirror', seasonId: huashanSeason(Date.now()) }), 'FEATURE_LOCKED')
    // 还没开放的玩法不能先记已读
    const early = await newcomer.act<{ featureId: string }>('/features/seen', { featureId: 'TRIAL' })
    assert.equal(early.snapshot.player.featuresSeen, undefined)
    assert.equal((await newcomer.post('/features/seen', { featureId: 'NOPE' })).statusCode, 400)

    // 序章就是主线 1-1：打赢后历练开放，客栈仍要等 1-2
    const prologue = await newcomer.act<StoryChallengeResult>('/story/1-1/challenge')
    assert.equal(prologue.result.report.winner, 'ALLY')
    assert.equal((await newcomer.post('/trial/1/challenge')).statusCode, 200)
    assert.equal(await code('/market/inn/gift', { companionId: 'kezhene', favorite: false }), 'FEATURE_LOCKED')
    const seen = await newcomer.act('/features/seen', { featureId: 'TRIAL' })
    assert.deepEqual(seen.snapshot.player.featuresSeen, ['TRIAL'])
    const again = await newcomer.act('/features/seen', { featureId: 'TRIAL' })
    assert.deepEqual(again.snapshot.player.featuresSeen, ['TRIAL'])

    // 老侠客拉新人切磋、组队、共修：对方没开放就拒绝
    const host = await createPlayer('host_n')
    assert.equal((await host.post('/duel', { action: 'invite', targetPlayerId: newcomer.id })).json().code, 'TARGET_FEATURE_LOCKED')
    assert.equal((await host.post('/raid/team', { action: 'invite', targetPlayerId: newcomer.id })).json().code, 'TARGET_FEATURE_LOCKED')
    assert.equal((await host.post('/map/co-cultivate', { action: 'invite', targetPlayerId: newcomer.id })).json().code, 'TARGET_FEATURE_LOCKED')

    // 每日江湖事要等客栈（1-2）与丹房（历练第 3 关）都开放；鬼市（历练第 8 关）开放前领赏不带红封签
    assert.equal(await code('/daily/claim'), 'FEATURE_LOCKED')
    const { player } = await newcomer.read()
    await profile(newcomer.id, { maxChapterId: 3, trial: { ...player.trial, rewardedStageIds: [1, 3] } })
    assert.equal(await code('/daily/claim'), 'DAILY_NOT_READY')
    const morning = Date.UTC(2026, 10, 18, 3) // 北京时间 11:00
    const done = DAILY_TASKS.map(({ id }) => id)
    try {
      fixedServerTime = morning
      await profile(newcomer.id, { daily: { day: innVisitDay(morning), done, claimed: false } })
      const withoutGhost = await newcomer.act<{ ticket: boolean }>('/daily/claim')
      assert.equal(withoutGhost.result.ticket, false)
      assert.equal(withoutGhost.snapshot.player.auctionTickets, undefined)

      fixedServerTime = morning + 24 * 3_600_000
      await profile(newcomer.id, { daily: { day: innVisitDay(fixedServerTime), done, claimed: false }, trial: { ...player.trial, rewardedStageIds: [1, 3, 8] } })
      const withGhost = await newcomer.act<{ ticket: boolean }>('/daily/claim')
      assert.equal(withGhost.result.ticket, true)
      assert.deepEqual(withGhost.snapshot.player.auctionTickets, [innVisitDay(fixedServerTime)])
    } finally {
      fixedServerTime = undefined
    }
  })

  it('联机结缘由服务端出签、扣元宝并记审计，觉醒形态、信物与硬保底同本地规则', async () => {
    const actor = await createRookie('gacha_a')
    assert.equal((await actor.post('/market/gacha', { count: 10 })).json().code, 'INGOT_INSUFFICIENT')
    assert.equal((await actor.post('/market/gacha', { count: 3 })).json().code, 'INVALID_GACHA_COUNT')
    mock.method(Math, 'random', () => 0)
    try {
      const first = await actor.act<GachaResult>('/market/gacha', { count: 1 })
      assert.deepEqual(first.result.draws.map(({ tier, kind, refId, isNew }) => ({ tier, kind, refId, isNew })),
        [{ tier: 'red', kind: 'COMPANION', refId: 'hongqigong', isNew: true }])
      assert.equal(first.snapshot.player.goldIngot, INGOT.start - GACHA_SINGLE_COST)
      assert.deepEqual(first.snapshot.player.gacha, { pulls: 1, pity: 0 })
      assert.equal(first.snapshot.companionAffinity.hongqigong.recruited, true)
      assert.equal(first.snapshot.companionAffinity.hongqigong.form, 'awakened')
      const duplicate = await actor.act<GachaResult>('/market/gacha', { count: 1 })
      assert.equal(duplicate.result.draws[0].isNew, false)
      assert.equal(duplicate.snapshot.companionAffinity.hongqigong.tokens, GACHA_DUP_TOKENS.red)
    } finally {
      mock.method(Math, 'random', () => 0.99)
    }
    // 第 90 抽必出神品；新学的绝技自动填进各套配装的空槽
    await profile(actor.id, { gacha: { pulls: 2, pity: GACHA_HARD_PITY - 1 } })
    mock.method(Math, 'random', () => 0.65)
    try {
      const pity = await actor.act<GachaResult>('/market/gacha', { count: 1 })
      assert.deepEqual(pity.result.draws.map(({ tier, refId, pityTriggered }) => ({ tier, refId, pityTriggered })),
        [{ tier: 'red', refId: 'kanglong_youhui', pityTriggered: true }])
      assert.deepEqual(pity.snapshot.player.gacha, { pulls: 3, pity: 0 })
      const slot = ({ INNER: 'innerSkillId', OUTER: 'outerSkillId', LIGHT: 'lightSkillId', ULT: 'ultSkillId' } as const)[SKILLS.kanglong_youhui.slot]
      assert.ok(pity.snapshot.loadouts.every((preset) => preset[slot] === 'kanglong_youhui'))
      assert.equal(pity.snapshot.player.goldIngot, 0)
    } finally {
      mock.method(Math, 'random', () => 0.99)
    }
    const { rows: audit } = await db.query('SELECT pull_no, tier FROM gacha_log WHERE player_id = $1 ORDER BY pull_no', [actor.id])
    assert.deepEqual(audit, [1, 2, 3].map((pull_no) => ({ pull_no, tier: 'red' })))
    const rows = await ledger(actor.id)
    assert.deepEqual(rows.map(({ reason, delta }) => [reason, delta]), [['start', INGOT.start], ...Array(3).fill(['gacha', -GACHA_SINGLE_COST])])
    assert.equal(rows.at(-1)?.balance, 0)
  })

  it('觉醒、故人重逢令、十道绝味与江湖行历都由服务端校验并结算', async () => {
    const actor = await createRookie('pal_a')
    assert.equal((await actor.post('/companions/awaken', { companionId: 'guojing' })).json().code, 'AWAKEN_UNAVAILABLE')
    await companionState(actor.id, 'guojing', { met: true, recruited: true, affinity: 600, tokens: COMPANIONS.guojing.awakenTokens })
    const awakened = await actor.act<AwakenResult>('/companions/awaken', { companionId: 'guojing' })
    assert.equal(awakened.result.title, COMPANIONS.guojing.awakened?.title)
    assert.equal(awakened.snapshot.companionAffinity.guojing.form, 'awakened')
    assert.equal(awakened.snapshot.companionAffinity.guojing.tokens, 0)

    const reunion = '/story/reunion/meichaofeng'
    assert.equal((await actor.post(reunion, { action: 'ticket' })).json().code, 'REUNION_UNAVAILABLE')
    await profile(actor.id, { storyAdventureChoices: { huangshan_bishou: 'A' } })
    const ticket = await actor.act<ReunionResult>(reunion, { action: 'ticket' })
    assert.equal(ticket.snapshot.companionAffinity.meichaofeng.recruited, true)
    assert.equal(ticket.snapshot.player.reunions?.meichaofeng.step, 'DONE')
    assert.equal(ticket.snapshot.player.goldIngot, INGOT.start + INGOT.adventure - REUNION_TICKET_COST)
    assert.equal((await actor.post(reunion, { action: 'ticket' })).json().code, 'REUNION_UNAVAILABLE')

    const [first, ...rest] = DISHES
    const last = rest.at(-1)!
    assert.equal((await actor.post('/market/feast', { dishId: first.id })).json().code, 'FEAST_INACTIVE')
    await companionState(actor.id, 'hongqigong', { met: true, affinity: 120 })
    await profile(actor.id, { silver: 50_000 })
    await db.query('UPDATE players SET last_settle_at = last_settle_at - 1900000 WHERE id = $1', [actor.id])
    assert.equal((await actor.act<IdleGain>('/cultivate/settle')).result.feastIngredient, first.id)
    const cooked = await actor.act<FeastResult>('/market/feast', { dishId: first.id })
    assert.deepEqual(cooked.result, { dishId: first.id, cooked: 1, affinity: 10, done: false })
    assert.equal((await actor.post('/market/feast', { dishId: first.id })).json().code, 'FEAST_UNAVAILABLE')
    await profile(actor.id, { feast: { ingredients: [last.id], cooked: [first, ...rest.slice(0, -1)].map(({ id }) => id), lastCookDay: 0 } })
    const done = await actor.act<FeastResult>('/market/feast', { dishId: last.id })
    assert.equal(done.result.done, true)
    assert.equal(done.snapshot.companionAffinity.hongqigong.recruited, true)
    assert.ok(done.snapshot.player.storyFlags?.includes(FEAST_TARGET_FLAG))
    assert.equal((await actor.post('/market/feast', { dishId: first.id })).json().code, 'FEAST_INACTIVE')

    assert.equal((await actor.post('/ftue/claim')).json().code, 'FTUE_NOT_READY')
    const { player } = await actor.read()
    await profile(actor.id, { trial: { ...player.trial, rewardedStageIds: [1] } })
    const claim = await actor.act<FtueClaimResult>('/ftue/claim')
    assert.equal(claim.result.questId, FTUE_QUESTS[0].id)
    assert.equal(claim.snapshot.player.ftue?.index, 1)
    assert.equal(claim.snapshot.player.silver, player.silver + FTUE_QUESTS[0].rewardSilver)
    assert.equal((await actor.post('/ftue/claim')).json().code, 'FTUE_NOT_READY')

    // 旧版十阶全领过的存档：接着领新加的剧情行历，下一阶是主线 1-2
    await profile(actor.id, { maxChapterId: 3, ftue: { index: 10, claimed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], forageCount: 1, refinedRecipeIds: [] } })
    const resumed = await actor.act<FtueClaimResult>('/ftue/claim')
    assert.equal(resumed.result.questId, 11)
    assert.equal(resumed.snapshot.player.ftue?.index, 11)
    assert.equal((await actor.post('/ftue/claim')).json().code, 'FTUE_NOT_READY') // 下一阶是历练第 3 关
  })

  it('鬼市暗拍：心理价全数冻结、鬼市代为跟价，被压过原数退还并推送，临近落槌顺延，落槌按成交价结算', async () => {
    const path = '/market/auction'
    const [first, second] = await Promise.all([createRookie('bid_a'), createRookie('bid_b')])
    await Promise.all([first, second].map(({ id }) => profile(id, { goldIngot: 2_000 })))
    // 拿未来的一场来测，避开真实时间正好在落槌后的两小时
    const day = auctionDay(Date.now()) + 2
    const { opensAt, closesAt } = auctionWindow(day)
    const { itemId, startPrice } = auctionLot(day)
    const step = AUCTION_BID_STEP
    const owns = (snapshot: PlayerSnapshot) => SKILLS[itemId] ? !!snapshot.learnedSkills[itemId] : snapshot.ownedItemIds.includes(itemId)
    fixedServerTime = opensAt + 3_600_000
    try {
      const board = await first.read<AuctionBoardDTO>(path)
      assert.deepEqual([board.lot.day, board.lot.itemId, board.lot.nextBid, board.lot.leaderMasked], [day, itemId, startPrice, null])

      const opening = await first.act<AuctionResult>(path, { action: 'bid', day, maxPrice: startPrice + 2 * step })
      assert.deepEqual(opening.result, { action: 'bid', day, price: startPrice, closesAt, leading: true, maxPrice: startPrice + 2 * step })
      assert.equal(opening.snapshot.player.goldIngot, 2_000 - startPrice - 2 * step)
      assert.equal((await first.post(path, { action: 'bid', day, maxPrice: startPrice + 2 * step + 10 })).json().code, 'AUCTION_BID_TOO_LOW')
      const raisedMax = await first.act<AuctionResult>(path, { action: 'bid', day, maxPrice: startPrice + 3 * step })
      assert.equal(raisedMax.snapshot.player.goldIngot, 2_000 - startPrice - 3 * step)
      assert.equal((await first.read<AuctionBoardDTO>(path)).lot.myMax, startPrice + 3 * step)
      assert.equal((await second.post(path, { action: 'bid', day, maxPrice: startPrice })).json().code, 'AUCTION_BID_TOO_LOW')

      // 没压过：first 的心理价替他跟上一口，second 不冻结元宝
      const beaten = await second.act<AuctionResult>(path, { action: 'bid', day, maxPrice: startPrice + 2 * step })
      assert.deepEqual([beaten.result.action === 'bid' && beaten.result.leading, beaten.result.action === 'bid' && beaten.result.price], [false, startPrice + 3 * step])
      assert.equal(beaten.snapshot.player.goldIngot, 2_000)
      assert.equal((await second.read<AuctionBoardDTO>(path)).lot.myMax, undefined)

      const socket = await first.connect()
      const notice = (async () => {
        for await (const [message] of on(socket, 'message', { signal: AbortSignal.timeout(5_000) })) {
          const parsed = JSON.parse(message.data) as WsServerEvent
          if (parsed.event === 'AUCTION_OUTBID') return parsed.data
        }
      })()
      const overtaken = await second.act<AuctionResult>(path, { action: 'bid', day, maxPrice: startPrice + 8 * step })
      assert.equal(overtaken.result.action === 'bid' && overtaken.result.price, startPrice + 4 * step)
      assert.equal(overtaken.snapshot.player.goldIngot, 2_000 - startPrice - 8 * step)
      assert.deepEqual(await notice, { day, itemId, refund: startPrice + 3 * step, price: startPrice + 4 * step })
      socket.close()
      assert.equal((await first.read()).player.goldIngot, 2_000)
      const viewed = await second.read<AuctionBoardDTO>(path)
      assert.deepEqual([viewed.lot.leading, viewed.lot.myMax], [true, startPrice + 8 * step])
      assert.match(viewed.lot.leaderMasked ?? '', /^蒙面客·/)
      assert.deepEqual(viewed.history.map(({ amount, self, proxy }) => [amount, self, proxy ?? false]), [
        [startPrice + 4 * step, true, false], [startPrice + 3 * step, false, true], [startPrice + 2 * step, true, false], [startPrice, false, false],
      ])

      fixedServerTime = closesAt - 60_000
      const late = await first.act<AuctionResult>(path, { action: 'bid', day, maxPrice: startPrice + 6 * step })
      assert.deepEqual(late.result, {
        action: 'bid', day, price: startPrice + 7 * step, closesAt: closesAt - 60_000 + AUCTION_SOFT_CLOSE_MS, leading: false, maxPrice: startPrice + 6 * step,
      })

      fixedServerTime = closesAt + AUCTION_SOFT_CLOSE_MS
      assert.equal((await first.post(path, { action: 'bid', day, maxPrice: startPrice + 10 * step })).json().code, 'AUCTION_CLOSED')
      assert.equal((await first.post(path, { action: 'claim', day })).json().code, 'AUCTION_NOTHING_TO_CLAIM')
      assert.deepEqual((await second.read<AuctionBoardDTO>(path)).wins, [{ day, itemId, price: startPrice + 7 * step }])
      const claimed = await second.act<AuctionResult>(path, { action: 'claim', day })
      assert.deepEqual(claimed.result, { action: 'claim', day, itemId, owned: false, refunded: step })
      assert.ok(owns(claimed.snapshot))
      assert.equal(claimed.snapshot.player.goldIngot, 2_000 - startPrice - 7 * step)
      assert.equal((await second.post(path, { action: 'claim', day })).json().code, 'AUCTION_NOTHING_TO_CLAIM')
      assert.equal((await first.read()).player.goldIngot, 2_000)

      // 下一场：领先者落槌前已从别处得到拍品，领取时冻结的元宝全数退还
      const next = auctionLot(day + 1)
      fixedServerTime = auctionWindow(day + 1).opensAt + 60_000
      await first.act(path, { action: 'bid', day: day + 1, maxPrice: next.startPrice + step })
      if (SKILLS[next.itemId]) await db.query('INSERT INTO player_skills VALUES ($1, $2, 1)', [first.id, next.itemId])
      else await db.query('INSERT INTO player_items (player_id, item_id) VALUES ($1, $2)', [first.id, next.itemId])
      fixedServerTime = auctionWindow(day + 1).closesAt
      const refund = await first.act<AuctionResult>(path, { action: 'claim', day: day + 1 })
      assert.deepEqual(refund.result, { action: 'claim', day: day + 1, itemId: next.itemId, owned: true, refunded: next.startPrice + step })
      assert.equal(refund.snapshot.player.goldIngot, 2_000)
      const reasons = (await ledger(second.id)).map(({ reason }) => reason)
      assert.deepEqual(reasons.slice(1), ['auction-bid', 'auction-refund'])
    } finally {
      fixedServerTime = undefined
    }
  })

  it('暗拍红封：当日领过每日江湖事（什么时辰都算）的侠客子时分成交价三成，人多抽签，流拍作废', async () => {
    const path = '/market/auction'
    const names = ['hb_a', 'hb_b', 'hb_c', 'hb_d', 'hb_e', 'hb_f', 'hb_late']
    const players = await Promise.all(names.map(createRookie))
    const early = players.slice(0, 6)
    const late = players[6]
    await Promise.all(players.map(({ id }) => profile(id, { goldIngot: 1_000 })))
    const finishDaily = (day: number, who = players) => Promise.all(who.map(({ id }) =>
      profile(id, { daily: { day, done: DAILY_TASKS.map(({ id: task }) => task), claimed: false } })))
    // 起拍 180 的一场：红封池 54 元宝，每份至少 10，七人持签只能中五人
    let day = auctionDay(Date.now()) + 6
    while (auctionLot(day).startPrice !== 180) day++
    const { opensAt, closesAt } = auctionWindow(day)
    try {
      fixedServerTime = opensAt + 3_600_000
      await finishDaily(day)
      for (const holder of early) {
        const claim = await holder.act<{ ingot: number; ticket: boolean }>('/daily/claim')
        assert.deepEqual([claim.result.ticket, claim.snapshot.player.auctionTickets], [true, [day]])
      }
      await early[0].act<AuctionResult>(path, { action: 'bid', day, maxPrice: 180 })
      assert.equal((await early[1].read<AuctionBoardDTO>(path)).lot.dividend, undefined)

      // 落槌之后才领每日江湖事，照样持签；子时开签前只公示人数
      fixedServerTime = closesAt + 30 * 60_000
      const tardy = await late.act<{ ingot: number; ticket: boolean }>('/daily/claim')
      assert.deepEqual([tardy.result.ticket, tardy.snapshot.player.auctionTickets], [true, [day]])
      const counting = (await late.read<AuctionBoardDTO>(path)).lot.dividend
      assert.deepEqual(counting, { eligible: 7, winners: 5, share: 10, paysAt: auctionDividendAt(day), mine: 'HELD' })
      assert.deepEqual((await late.act<AuctionResult>(path, { action: 'dividend', day })).snapshot.player.auctionTickets, [day])

      fixedServerTime = auctionDividendAt(day)
      const pending = await Promise.all(players.map(async (holder) => (await holder.read<AuctionBoardDTO>(path)).previous?.dividend))
      assert.deepEqual(pending.map((dividend) => [dividend?.eligible, dividend?.winners, dividend?.share]), players.map(() => [7, 5, 10]))
      assert.deepEqual(pending.map((dividend) => dividend?.mine).sort(), ['MISSED', 'MISSED', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'])

      for (const [index, holder] of players.entries()) {
        const before = (await holder.read()).player.goldIngot
        const settled = await holder.act<AuctionResult>(path, { action: 'dividend', day })
        const won = pending[index]?.mine === 'PENDING'
        assert.equal(settled.snapshot.player.goldIngot, before + (won ? 10 : 0))
        assert.deepEqual(settled.snapshot.player.auctionTickets, [])
        assert.deepEqual(settled.snapshot.player.auctionDividend, { day, ingot: won ? 10 : 0 })
        assert.equal((await holder.read<AuctionBoardDTO>(path)).previous?.dividend?.mine, won ? 'PAID' : 'MISSED')
        // 再催一次也不会重复入账
        assert.equal((await holder.act<AuctionResult>(path, { action: 'dividend', day })).snapshot.player.goldIngot, before + (won ? 10 : 0))
        assert.equal((await ledger(holder.id)).filter(({ reason, ref }) => reason === 'auction-dividend' && ref === `auction-dividend:${day}`).length, won ? 1 : 0)
      }

      // 次日无人出价：流拍，红封签作废
      const [solo] = early
      fixedServerTime = auctionWindow(day + 1).opensAt + 3_600_000
      await finishDaily(day + 1, [solo])
      assert.deepEqual((await solo.act('/daily/claim')).snapshot.player.auctionTickets, [day + 1])
      fixedServerTime = auctionDividendAt(day + 1)
      const passed = await solo.act<AuctionResult>(path, { action: 'dividend', day: day + 1 })
      assert.deepEqual([passed.snapshot.player.auctionTickets, passed.snapshot.player.auctionDividend], [[], { day, ingot: pending[0]?.mine === 'PENDING' ? 10 : 0 }])

      // 第三日：落槌前一分钟出价，顺延期间与子时之前都不兑付；子时独得一份，封顶 30
      const third = day + 2
      const closing = auctionWindow(third).closesAt
      fixedServerTime = closing - 60_000
      await finishDaily(third, [solo])
      await solo.act('/daily/claim')
      await solo.act<AuctionResult>(path, { action: 'bid', day: third, maxPrice: auctionLot(third).startPrice })
      fixedServerTime = closing + 60 * 60_000
      const waiting = await solo.act<AuctionResult>(path, { action: 'dividend', day: third })
      assert.deepEqual(waiting.snapshot.player.auctionTickets, [third])
      fixedServerTime = auctionDividendAt(third)
      const paid = await solo.act<AuctionResult>(path, { action: 'dividend', day: third })
      assert.equal(paid.snapshot.player.goldIngot, waiting.snapshot.player.goldIngot + 30)
      assert.deepEqual(paid.snapshot.player.auctionDividend, { day: third, ingot: 30 })
      assert.deepEqual((await solo.read<AuctionBoardDTO>(path)).previous?.dividend, { eligible: 1, winners: 1, share: 30, paysAt: auctionDividendAt(third), mine: 'PAID' })
    } finally {
      fixedServerTime = undefined
    }
  })

  it('兵器谱：打狗棒首位终考者得之，周日君山攻擂胜者执棒，久未露面或叛帮即收回由长老代守', async () => {
    const path = '/market/artifacts'
    const itemId = DAGOU_STAFF.itemId
    const [first, strong, weak] = await Promise.all(['staff_a', 'staff_b', 'staff_c'].map(createPlayer))
    const HOUR = 3_600_000
    const board = async (who = weak) => (await who.read<ArtifactBoardDTO>(path)).artifacts[0]
    const challenge = (who: typeof first, holderId: string | null) => who.post(path, { action: 'challenge', itemId, holderId })
    const fight = async (who: typeof first, holderId: string | null) => {
      const response = await challenge(who, holderId)
      assert.equal(response.statusCode, 200, response.body)
      return response.json<GameAction<ArtifactResult>>()
    }
    const blocked = async (who: typeof first, holderId: string | null) => {
      const response = await challenge(who, holderId)
      assert.equal(response.statusCode, 409, response.body)
      return response.json<{ code: string; message: string }>()
    }
    // 任何一次操作都算执棒者露面
    const showUp = (who: typeof first) => who.act('/market/auction', { action: 'dividend', day: 1 })
    const finalExam = async (who: typeof first) => {
      await profile(who.id, { currentSectId: 'gaibang', sectRank: 4, gaibangBranch: 'WUYI', sectProgressFlags: GAIBANG_FINAL_DISHES.map(({ id }) => gaibangDishFlag(id)) })
      const passed = await who.act<{ action: 'trial'; report: BattleReportDTO }>('/sect', { action: 'trial', sectId: 'gaibang', expectedRank: 4 })
      assert.equal(passed.result.report.winner, 'ALLY')
      return passed
    }
    await db.query('DELETE FROM unique_artifacts')
    await db.query('DELETE FROM artifact_duels')
    await db.query('DELETE FROM player_items WHERE item_id = $1', [itemId])
    const sunday = nextArenaDay(arenaDay(Date.now()) + 8)
    const { opensAt } = arenaWindow(sunday)
    try {
      // 周六：尚无人得棒，谁也不能上擂；首位通过终考的侠客自得衣钵，第二位只得绝学
      fixedServerTime = opensAt - 2 * HOUR
      assert.deepEqual([(await board()).state, (await board()).holderId], ['UNCLAIMED', null])
      assert.match((await blocked(strong, null)).message, /第一人自得衣钵/)
      const heir = await finalExam(first)
      assert.ok(heir.snapshot.ownedItemIds.includes(itemId))
      assert.ok(heir.result.report.rewards?.items?.some(({ id }) => id === itemId))
      assert.deepEqual(heir.snapshot.player.artifactHonors, [itemId])
      const second = await finalExam(strong)
      assert.ok(second.snapshot.learnedSkills[DAGOU_STAFF.proofSkillId])
      assert.ok(!second.snapshot.ownedItemIds.includes(itemId))
      assert.deepEqual(await board(), {
        artifactCode: 'TRUE_DAGOU', itemId, name: ITEMS[itemId].name, state: 'HELD', holderId: first.id, holderNickname: heir.snapshot.player.nickname,
        holderSect: '丐帮', heldSince: opensAt - 2 * HOUR, defendStreak: 0, recallAt: opensAt - 2 * HOUR + DAGOU_STAFF.idleRecallMs, duels: [],
      })
      await db.query('INSERT INTO player_skills VALUES ($1, $2, 1)', [weak.id, DAGOU_STAFF.proofSkillId])
      assert.match((await blocked(strong, first.id)).message, /每周日开擂/)
      assert.match((await blocked(first, first.id)).message, /就在你手里/)

      // 周日开擂：打不过的三次用尽；打得过的当场执棒，旧主配装里的棒被摘下
      fixedServerTime = opensAt + HOUR
      await showUp(first)
      await strength(first.id, 28, 26, 32, 3, 36)
      const armed = await first.read()
      await first.act('/loadout/1', { preset: { ...armed.loadouts[0], weaponId: itemId }, expectedRevision: armed.revision }, undefined, 'PUT')
      await strength(weak.id, 5, 5, 10, 1, 5)
      await strength(strong.id, 80, 80, 45, 4, 80)
      assert.equal((await blocked(strong, null)).code, 'ARTIFACT_CHANGED')
      for (const left of [2, 1, 0]) {
        const lost = await fight(weak, first.id)
        assert.deepEqual([lost.result.won, lost.result.attemptsLeft, lost.result.report.winner], [false, left, 'ENEMY'])
      }
      assert.match((await blocked(weak, first.id)).message, /已用尽/)
      const socket = await weak.connect()
      const news = (async () => {
        for await (const [message] of on(socket, 'message', { signal: AbortSignal.timeout(5_000) })) {
          const parsed = JSON.parse(message.data) as WsServerEvent
          if (parsed.event === 'UNIQUE_ARTIFACT_CHANGED') return parsed.data
        }
      })()
      const seized = await fight(strong, first.id)
      assert.deepEqual([seized.result.won, seized.result.attemptsLeft], [true, 2])
      assert.ok(seized.snapshot.ownedItemIds.includes(itemId))
      assert.deepEqual(await news, { itemId, cause: 'SEIZE', newOwner: second.snapshot.player.nickname, previousOwner: heir.snapshot.player.nickname })
      socket.close()
      const ousted = await first.read()
      assert.ok(!ousted.ownedItemIds.includes(itemId))
      assert.ok(ousted.loadouts.every(({ weaponId }) => weaponId !== itemId))
      assert.deepEqual(ousted.player.artifactLoss, { itemId, at: opensAt + HOUR, cause: 'SEIZE', iron: 0, by: second.snapshot.player.nickname })
      assert.equal((await fight(first, strong.id)).result.won, false)
      const afterSeize = await board()
      assert.deepEqual([afterSeize.holderId, afterSeize.defendStreak, afterSeize.duels.length, afterSeize.duels[0].defender], [strong.id, 0, 5, second.snapshot.player.nickname])
      assert.deepEqual(afterSeize.duels.map(({ won, self }) => [won, self]), [[false, false], [true, false], [false, true], [false, true], [false, true]])

      // 新擂主隔两天露一次面，守过下一个周日记一届
      for (const days of [2, 4, 6, 8]) {
        fixedServerTime = opensAt + days * 24 * HOUR + HOUR
        await showUp(strong)
      }
      assert.deepEqual([(await board()).state, (await board()).defendStreak], ['HELD', 1])

      // 80 小时不露面：兵器谱上已是长老代守；本人回来时棒已收回，守过一届补 15 块玄铁
      const returned = opensAt + 8 * 24 * HOUR + 81 * HOUR
      fixedServerTime = returned
      assert.deepEqual([(await board()).state, (await board()).holderId, (await board()).holderNickname], ['VACANT', strong.id, null])
      const iron = (await strong.read()).player.equipmentForge?.iron ?? 0
      const recalled = await showUp(strong)
      assert.ok(!recalled.snapshot.ownedItemIds.includes(itemId))
      assert.deepEqual(recalled.snapshot.player.artifactLoss, { itemId, at: returned, cause: 'RECALL', iron: DAGOU_STAFF.ironPerDefense, by: null })
      // 同一次操作里还结算了这 80 小时的巡历，玄铁只会更多
      assert.ok((recalled.snapshot.player.equipmentForge?.iron ?? 0) >= iron + DAGOU_STAFF.ironPerDefense)
      assert.deepEqual([(await board()).state, (await board()).holderId], ['VACANT', null])

      // 无主时任何一天都能上擂，对手是代守的传功长老
      assert.equal(isArenaDay(arenaDay(returned)), false)
      const beaten = await fight(weak, null)
      assert.deepEqual([beaten.result.won, beaten.result.report.units.some(({ name }) => name === DAGOU_ELDER.name)], [false, true])
      await strength(first.id, 80, 80, 45, 4, 80)
      const regained = await fight(first, null)
      assert.equal(regained.result.won, true)
      assert.deepEqual([(await board()).holderId, (await board()).duels[0].defender], [first.id, null])

      // 执棒者久未露面时别人来攻擂：先收回，再与长老过招
      fixedServerTime = returned + 80 * HOUR
      const taken = await fight(strong, first.id)
      assert.equal(taken.result.won, true)
      assert.equal((await first.read()).player.artifactLoss?.cause, 'RECALL')
      assert.ok(!(await first.read()).ownedItemIds.includes(itemId))
      assert.equal((await board()).holderId, strong.id)

      // 叛出丐帮：打狗棒当场收回，不补偿，此后不得再上擂
      const traitor = await strong.act('/sect', { action: 'betray', sectId: 'gaibang' })
      assert.ok(!traitor.snapshot.ownedItemIds.includes(itemId))
      assert.deepEqual([traitor.snapshot.player.artifactLoss?.cause, traitor.snapshot.player.artifactLoss?.iron], ['BETRAY', 0])
      assert.deepEqual([(await board()).state, (await board()).holderId], ['VACANT', null])
      assert.match((await blocked(strong, null)).message, /叛出丐帮/)
      const { rows: owners } = await db.query('SELECT 1 FROM player_items WHERE item_id = $1', [itemId])
      assert.equal(owners.length, 0)
    } finally {
      fixedServerTime = undefined
    }
  })

  it('鬼市蒙面摊位：上架代管并收摆摊费，限价限级，分批成交抽成，纹银在摊主下次操作入账，到期撤摊退货，散客摊每日一次', async () => {
    const path = '/market/stalls'
    const [seller, buyer] = await Promise.all(['stall_a', 'stall_b'].map(createPlayer))
    const rookie = await createRookie('stall_c')
    await profile(seller.id, { alchemy: { herbs: { sanqi: 10, linghu_cao: 2, cheqian_cao: 9 }, pity: {}, residue: 0 }, skillFragments: { luoying_zhang: 3 } })
    await profile(rookie.id, { alchemy: { herbs: { sanqi: 5 }, pity: {}, residue: 0 } })
    const reject = async (who: typeof seller, body: Record<string, unknown>) => {
      const response = await who.post(path, body)
      assert.equal(response.statusCode, 409, response.body)
      return response.json<{ code: string; message: string }>()
    }
    const board = (who: typeof seller) => who.read<StallBoardDTO>(path)
    const herbs = async (who: typeof seller) => (await who.read()).player.alchemy?.herbs ?? {}
    const start = Date.now() + 40 * 86_400_000
    fixedServerTime = start
    try {
      // 限级、限价、限量
      const sanqi = stallGoods('HERB', 'sanqi')!
      assert.deepEqual([sanqi.refPrice, sanqi.minPrice, sanqi.maxPrice], [20, 10, 40])
      assert.match((await reject(rookie, { action: 'list', kind: 'HERB', goodsId: 'sanqi', qty: 1, unitPrice: 20 })).message, /10 级/)
      for (const offer of [{ qty: 10, unitPrice: 9 }, { qty: 10, unitPrice: 41 }, { qty: 11, unitPrice: 30 }, { qty: 0, unitPrice: 30 }, { qty: 1.5, unitPrice: 30 }]) {
        assert.equal((await reject(seller, { action: 'list', kind: 'HERB', goodsId: 'sanqi', ...offer })).code, 'STALL_OFFER_REJECTED')
      }
      assert.equal((await reject(seller, { action: 'list', kind: 'ITEM', goodsId: 'qinggang_sword', qty: 1, unitPrice: 30 })).code, 'STALL_OFFER_REJECTED')

      // 上架：货物由鬼市代管，摆摊费 2% 当场收取
      const silver = (await seller.read()).player.silver
      const listed = await seller.act<StallResult & { action: 'list' }>(path, { action: 'list', kind: 'HERB', goodsId: 'sanqi', qty: 10, unitPrice: 30 })
      assert.deepEqual([listed.result.fee, listed.snapshot.player.silver, listed.snapshot.player.alchemy?.herbs.sanqi, listed.snapshot.player.stallOpen], [6, silver - 6, undefined, 1])
      const { listingId } = listed.result
      const seen = await board(buyer)
      const stall = seen.listings.find(({ id }) => id === listingId)!
      assert.deepEqual([seen.listings.filter(({ system }) => system).length, seen.mine.length], [3, 0])
      assert.deepEqual([stall.qty, stall.unitPrice, stall.system, stall.sold, stall.expiresAt], [10, 30, false, undefined, start + STALL.durationMs])
      assert.match(stall.seller, /^蒙面摊主·/)
      const own = await board(seller)
      assert.deepEqual([own.listings.some(({ id }) => id === listingId), own.mine.map(({ id, sold, proceeds }) => [id, sold, proceeds])], [false, [[listingId, 0, 0]]])
      assert.equal((await reject(seller, { action: 'buy', listingId, qty: 1, unitPrice: 30 })).code, 'STALL_OWN')
      assert.equal((await reject(rookie, { action: 'buy', listingId, qty: 1, unitPrice: 30 })).code, 'STALL_LEVEL_REQUIRED')
      assert.equal((await reject(buyer, { action: 'buy', listingId, qty: 1, unitPrice: 29 })).code, 'STALL_PRICE_CHANGED')
      assert.equal((await reject(buyer, { action: 'buy', listingId, qty: 11, unitPrice: 30 })).code, 'STALL_SHORT')

      // 分批成交：买家当场拿货；摊主收到提醒，纹银扣一成后在下次操作入账
      const socket = await seller.connect()
      const sold = (async () => {
        for await (const [message] of on(socket, 'message', { signal: AbortSignal.timeout(5_000) })) {
          const parsed = JSON.parse(message.data) as WsServerEvent
          if (parsed.event === 'STALL_SOLD') return parsed.data
        }
      })()
      const purse = (await buyer.read()).player.silver
      const stock = (await herbs(buyer)).sanqi ?? 0
      const first = await buyer.act<StallResult>(path, { action: 'buy', listingId, qty: 4, unitPrice: 30 })
      assert.deepEqual(first.result, { action: 'buy', kind: 'HERB', goodsId: 'sanqi', qty: 4, spent: 120 })
      assert.deepEqual([first.snapshot.player.silver, first.snapshot.player.alchemy?.herbs.sanqi], [purse - 120, stock + 4])
      assert.deepEqual(await sold, { kind: 'HERB', goodsId: 'sanqi', qty: 4, silver: 108 })
      socket.close()
      assert.equal((await seller.read()).player.silver, silver - 6)
      assert.deepEqual((await board(seller)).mine.map(({ qty, sold: gone, proceeds }) => [qty, gone, proceeds]), [[6, 4, 108]])
      const collected = await seller.act<StallResult>(path, { action: 'collect' })
      assert.deepEqual([collected.snapshot.player.silver, collected.snapshot.player.stallIncome, collected.snapshot.player.stallOpen],
        [silver - 6 + 108, { at: start, silver: 108, returned: 0 }, 1])
      assert.equal((await seller.act<StallResult>(path, { action: 'collect' })).snapshot.player.silver, silver - 6 + 108)
      await buyer.act<StallResult>(path, { action: 'buy', listingId, qty: 6, unitPrice: 30 })
      assert.equal((await reject(buyer, { action: 'buy', listingId, qty: 1, unitPrice: 30 })).code, 'STALL_UNAVAILABLE')
      fixedServerTime = start + 60_000
      const emptied = await seller.act<StallResult>(path, { action: 'collect' })
      assert.deepEqual([emptied.snapshot.player.silver, emptied.snapshot.player.stallIncome, emptied.snapshot.player.stallOpen],
        [silver - 6 + 108 + 162, { at: start + 60_000, silver: 162, returned: 0 }, 0])
      assert.deepEqual((await board(seller)).mine, [])
      const { rows: sales } = await db.query('SELECT qty, unit_price, tax FROM stall_sales WHERE listing_id = $1 ORDER BY id', [listingId])
      assert.deepEqual(sales, [{ qty: 4, unit_price: 30, tax: 12 }, { qty: 6, unit_price: 30, tax: 18 }])
      assert.deepEqual((await board(buyer)).recent.slice(0, 2).map(({ goodsId, qty, unitPrice }) => [goodsId, qty, unitPrice]), [['sanqi', 6, 30], ['sanqi', 4, 30]])

      // 残页也能摆；撤摊退货，摆摊费不退
      const pages = await seller.act<StallResult & { action: 'list' }>(path, { action: 'list', kind: 'FRAGMENT', goodsId: 'luoying_zhang', qty: 3, unitPrice: 400 })
      assert.deepEqual([pages.result.fee, pages.snapshot.player.skillFragments?.luoying_zhang, pages.snapshot.player.stallOpen], [24, undefined, 1])
      const cancelled = await seller.act<StallResult>(path, { action: 'cancel', listingId: pages.result.listingId })
      assert.deepEqual(cancelled.result, { action: 'cancel', kind: 'FRAGMENT', goodsId: 'luoying_zhang', returned: 3, silver: 0 })
      assert.deepEqual([cancelled.snapshot.player.skillFragments?.luoying_zhang, cancelled.snapshot.player.stallOpen, cancelled.snapshot.player.silver],
        [3, 0, emptied.snapshot.player.silver - 24])
      assert.equal((await reject(seller, { action: 'cancel', listingId: pages.result.listingId })).code, 'STALL_UNAVAILABLE')

      // 最多五摊；到期后买不到，摊主下次操作时剩货退回
      const rare = await seller.act<StallResult & { action: 'list' }>(path, { action: 'list', kind: 'HERB', goodsId: 'linghu_cao', qty: 2, unitPrice: 1500 })
      for (let index = 0; index < 4; index++) await seller.act(path, { action: 'list', kind: 'HERB', goodsId: 'cheqian_cao', qty: 1, unitPrice: 20 })
      assert.match((await reject(seller, { action: 'list', kind: 'HERB', goodsId: 'cheqian_cao', qty: 1, unitPrice: 20 })).message, /最多同时摆 5 个/)
      assert.equal((await seller.read()).player.stallOpen, 5)
      await buyer.act<StallResult>(path, { action: 'buy', listingId: rare.result.listingId, qty: 1, unitPrice: 1500 })
      fixedServerTime = start + 60_000 + STALL.durationMs
      assert.equal((await reject(buyer, { action: 'buy', listingId: rare.result.listingId, qty: 1, unitPrice: 1500 })).code, 'STALL_UNAVAILABLE')
      assert.equal((await board(buyer)).listings.filter(({ system }) => !system).length, 0)
      const closed = await seller.act<StallResult>(path, { action: 'collect' })
      assert.deepEqual([closed.snapshot.player.stallOpen, closed.snapshot.player.stallIncome], [0, { at: fixedServerTime, silver: 1350, returned: 5 }])
      assert.deepEqual([closed.snapshot.player.alchemy?.herbs.linghu_cao, closed.snapshot.player.alchemy?.herbs.cheqian_cao], [1, 9])
      const { rows: left } = await db.query('SELECT 1 FROM stall_listings WHERE seller_id = $1', [seller.id])
      assert.equal(left.length, 0)

      // 鬼市散客摊：按参考价上限整摊买走，每人每天一次，次日换货再开
      const [system] = (await board(buyer)).listings.filter(({ system: fromMarket }) => fromMarket)
      assert.deepEqual([system.seller, system.unitPrice], ['鬼市散客', stallGoods('HERB', system.goodsId)!.maxPrice])
      const had = (await herbs(buyer))[system.goodsId] ?? 0
      const before = (await buyer.read()).player.silver
      const bought = await buyer.act<StallResult>(path, { action: 'buy', listingId: system.id, qty: system.qty, unitPrice: system.unitPrice })
      assert.deepEqual([bought.snapshot.player.silver, bought.snapshot.player.alchemy?.herbs[system.goodsId]], [before - system.qty * system.unitPrice, had + system.qty])
      assert.match((await reject(buyer, { action: 'buy', listingId: system.id, qty: system.qty, unitPrice: system.unitPrice })).message, /今天已经买过/)
      assert.equal((await board(buyer)).listings.filter(({ system: fromMarket }) => fromMarket).length, 2)
      assert.match((await reject(rookie, { action: 'buy', listingId: system.id, qty: system.qty, unitPrice: system.unitPrice })).message, /10 级/)
      fixedServerTime += 86_400_000
      assert.equal((await board(buyer)).listings.filter(({ system: fromMarket }) => fromMarket).length, 3)
      assert.match((await reject(buyer, { action: 'buy', listingId: system.id, qty: system.qty, unitPrice: system.unitPrice })).message, /已经收摊/)
    } finally {
      fixedServerTime = undefined
    }
  })
})
