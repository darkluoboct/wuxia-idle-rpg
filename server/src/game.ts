import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import { calcNextLevelQi, computeDerivedStats, simulateServerBattle, simulateShaoshiRaid } from '../../shared/battle.ts'
import { EQUIP_SLOT_META, STANCE_META } from '../../shared/combatMeta.ts'
import { COOP_RAID_RELICS, getChapterDrops, ITEMS, ONLINE_MAPS, ONLINE_STORY_CHAPTERS, SHAOSHI_RAID, SKILLS } from '../../shared/gameData.ts'
import {
  PATROL_DROP_CHANCE, PATROL_ENCOUNTER_MINUTES, TRIAL_PATROL_HOURS, TRIAL_REPLAY_HOURS,
  TRIAL_STAGES, trialItemOf, trialPartId, trialSetOfStage, trialStageOf,
} from '../../shared/trialStages.ts'
import { coCultivationRate, createStarterCharacter, cultivationRate, idleQiNumerator } from '../../shared/player.ts'
import { MAX_SKILL_MASTERY, skillPowerAtMastery, skillUpgradeCost } from '../../shared/skillMastery.ts'
import type {
  BattleReportDTO, CoCultivationDTO, CoCultivationInviteDTO, GameAction, IdleGain, LoadoutPresetDTO, PlayerDTO, PlayerSnapshot,
  SkillSlotType, SkillUpgradeResult, StoryChallengeResult, TrialChallengeResult, TrialPatrolStatusDTO, TrialReplayResult,
} from '../../shared/protocol.ts'
import { requireSession } from './auth.ts'
import { serverTime, transaction } from './db.ts'
import { GameError, objectBody } from './http.ts'
import type { registerRaidLobby } from './raidLobby.ts'
import type { registerRooms } from './rooms.ts'

type Profile = Omit<PlayerDTO, 'id' | 'nickname' | 'lastSettleAt' | 'nextLevelQi' | 'qiPerHour'>
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

interface CharacterRow {
  id: string
  account_id: string
  nickname: string
  profile: Profile
  pill_count: number
  rewarded_chapters: number[]
  last_settle_at: string
  qi_remainder: number
  silver_remainder: number
  revision: number
  co_cultivation_id: string | null
  shaoshi_clears: number
}

type Character = Omit<PlayerSnapshot, 'serverTime' | 'derivedStats' | 'idlePreview' | 'soloQiPerHour'> & {
  rewardedChapters: number[]
  qiRemainder: number
  silverRemainder: number
}

function profileOf(player: PlayerDTO): Profile {
  const { id, nickname, lastSettleAt, nextLevelQi, qiPerHour, ...profile } = player
  return profile
}

async function readCharacter(client: PoolClient, accountId: string, lock = false): Promise<Character> {
  const { rows: [row] } = await client.query<CharacterRow>(
    `SELECT * FROM players WHERE account_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [accountId],
  )
  if (!row) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
  return hydrateCharacter(client, row)
}

async function hydrateCharacter(client: PoolClient, row: CharacterRow): Promise<Character> {
  const { rows: [details] } = await client.query<Pick<Character,
    'loadouts' | 'ownedItemIds' | 'learnedSkills' | 'companionAffinity' | 'coCultivation' | 'coCultivationInvite'
  >>(
    `SELECT
       (SELECT jsonb_agg(preset ORDER BY preset_idx) FROM player_loadouts WHERE player_id = $1) AS loadouts,
       ARRAY(SELECT item_id FROM player_items WHERE player_id = $1 ORDER BY item_id) AS "ownedItemIds",
       COALESCE((SELECT jsonb_object_agg(skill_id, mastery) FROM player_skills WHERE player_id = $1), '{}') AS "learnedSkills",
       COALESCE((SELECT jsonb_object_agg(companion_id, state) FROM player_companions WHERE player_id = $1), '{}') AS "companionAffinity",
       (SELECT jsonb_build_object('id', c.id, 'startsAt', c.starts_at, 'endsAt', c.ends_at,
                'partner', jsonb_build_object('id', p.id, 'nickname', p.nickname))
        FROM co_cultivations c
        JOIN players p ON p.id = CASE WHEN c.inviter_id = $1 THEN c.invitee_id ELSE c.inviter_id END
        WHERE c.id = $2) AS "coCultivation",
       (SELECT jsonb_build_object('id', c.id, 'mapId', c.map_id, 'expiresAt', c.invite_expires_at,
                'inviter', jsonb_build_object('id', a.id, 'nickname', a.nickname),
                'invitee', jsonb_build_object('id', b.id, 'nickname', b.nickname))
        FROM co_cultivations c JOIN players a ON a.id = c.inviter_id JOIN players b ON b.id = c.invitee_id
        WHERE c.starts_at IS NULL AND (c.inviter_id = $1 OR c.invitee_id = $1)
        ORDER BY c.invite_expires_at DESC LIMIT 1) AS "coCultivationInvite"`,
    [row.id, row.co_cultivation_id],
  )
  return {
    ...details,
    player: {
      ...row.profile,
      id: row.id,
      nickname: row.nickname,
      lastSettleAt: Number(row.last_settle_at),
      nextLevelQi: calcNextLevelQi(row.profile.level),
      qiPerHour: 0,
      coCultivatePartner: null,
      trial: row.profile.trial ?? {
        selectedStageId: 1, maxStageId: 1, rewardedStageIds: [], stageHours: {}, replayHours: {},
        lastPatrolAt: Number(row.last_settle_at), marks: {}, recentDrops: [],
      },
    },
    pillCount: row.pill_count,
    rewardedChapters: row.rewarded_chapters,
    qiRemainder: row.qi_remainder,
    silverRemainder: row.silver_remainder,
    revision: row.revision,
    shaoshiClears: row.shaoshi_clears,
  }
}

function activeLoadout(character: Character) {
  return character.loadouts[character.player.activePresetIdx - 1]
}

function idleRewards(character: Character, now: number, rate: number) {
  const amount = idleQiNumerator(character.player.lastSettleAt, now, rate, character.coCultivation)
  const qi = BigInt(character.qiRemainder) + amount
  const silver = BigInt(character.silverRemainder) + amount * 28n
  return {
    gainedQi: Number(qi / 3_600_000n),
    gainedSilver: Number(silver / 360_000_000n),
    qiRemainder: Number(qi % 3_600_000n),
    silverRemainder: Number(silver % 360_000_000n),
  }
}

function settle(character: Character, now: number): IdleGain {
  const { player } = character
  const rate = cultivationRate(player, activeLoadout(character))
  const { gainedQi, gainedSilver, qiRemainder, silverRemainder } = idleRewards(character, now, rate)
  player.qiExp += gainedQi
  player.silver += gainedSilver
  player.lastSettleAt = Math.max(now, player.lastSettleAt)
  character.qiRemainder = qiRemainder
  character.silverRemainder = silverRemainder
  if (character.coCultivation && character.coCultivation.endsAt <= now) character.coCultivation = null
  return { gainedQi, gainedSilver }
}

const PATROL_CAP_MS = 12 * 3_600_000
const REPLAY_STAGES = new Set(TRIAL_STAGES.filter((stage) => stage.replayPartIds).map((stage) => stage.id))

/** 惰性结算巡历：进度、章末复战进度与 30 分钟一次的小怪掉落 */
async function settlePatrol(character: Character, now: number, client: PoolClient) {
  const { player } = character
  const { trial } = player
  const since = Math.max(trial.lastPatrolAt, now - PATROL_CAP_MS)
  const elapsed = Math.max(0, now - since)
  if (elapsed <= 0) return false

  const key = String(trial.selectedStageId)
  trial.stageHours[key] = (trial.stageHours[key] ?? 0) + elapsed / 3_600_000
  if (REPLAY_STAGES.has(trial.selectedStageId)) {
    trial.replayHours[key] = Math.min(TRIAL_REPLAY_HOURS, (trial.replayHours[key] ?? 0) + elapsed / 3_600_000)
  }
  trial.lastPatrolAt = now

  const encounters = Math.floor(elapsed / (PATROL_ENCOUNTER_MINUTES * 60_000))
  const stage = trialStageOf(trial.selectedStageId)
  const set = stage ? trialSetOfStage(stage) : undefined
  if (encounters > 0 && set) {
    for (let i = 0; i < encounters; i++) {
      if (Math.random() >= PATROL_DROP_CHANCE) continue
      const part = set.parts[Math.floor(Math.random() * set.parts.length)]
      const id = trialPartId(set.id, part.slot)
      if (character.ownedItemIds.includes(id)) {
        trial.marks[key] = (trial.marks[key] ?? 0) + 1
        continue
      }
      await client.query('INSERT INTO player_items VALUES ($1, $2) ON CONFLICT DO NOTHING', [player.id, id])
      character.ownedItemIds.push(id)
      trial.recentDrops.unshift({ id, name: part.name, tier: set.tier, at: now })
    }
    trial.recentDrops = trial.recentDrops.slice(0, 10)
  }
  return true
}

function patrolStatus(character: Character): TrialPatrolStatusDTO {
  const stageId = character.player.trial.selectedStageId
  const hours = character.player.trial.stageHours[String(stageId)] ?? 0
  return {
    stageId,
    hours,
    requiredHours: TRIAL_PATROL_HOURS[stageId] ?? 0,
    encounters: Math.floor(hours * (60 / PATROL_ENCOUNTER_MINUTES)),
  }
}

function activePair(character: Character, now: number) {
  const pair = character.coCultivation
  return pair && pair.startsAt <= now && pair.endsAt > now ? pair : null
}

function pendingInvite(character: Character, now: number) {
  const invitation = character.coCultivationInvite
  return invitation && invitation.expiresAt > now ? invitation : null
}

function snapshot(character: Character, now: number): PlayerSnapshot {
  const { player, revision, loadouts, ownedItemIds, pillCount, learnedSkills, companionAffinity } = character
  const loadout = activeLoadout(character)
  const rate = cultivationRate(player, loadout)
  const pair = activePair(character, now)
  const { gainedQi, gainedSilver } = idleRewards(character, now, rate)
  return {
    revision,
    serverTime: now,
    player: { ...player, qiPerHour: pair ? coCultivationRate(rate) : rate, coCultivatePartner: pair?.partner.nickname ?? null },
    loadouts,
    ownedItemIds,
    pillCount,
    learnedSkills,
    companionAffinity,
    derivedStats: computeDerivedStats(player, loadout),
    soloQiPerHour: rate,
    coCultivation: character.coCultivation,
    coCultivationInvite: pendingInvite(character, now),
    shaoshiClears: character.shaoshiClears,
    idlePreview: { pendingQi: gainedQi, pendingSilver: gainedSilver },
  }
}

export function getSnapshot(accountId: string) {
  return transaction(async (client) => {
    const character = await readCharacter(client, accountId)
    return snapshot(character, Math.max(character.player.lastSettleAt, await serverTime(client)))
  }, true)
}

async function createPlayer(accountId: string, input: unknown) {
  const { nickname: name, avatarId = 'hero_sword' } = objectBody(input)
  const nickname = typeof name === 'string' ? name.trim().normalize('NFKC') : ''
  if (!/^[\p{L}\p{N}·_\-]{2,16}$/u.test(nickname)) {
    throw new GameError(400, 'INVALID_PLAYER', '取个 2 至 16 字的侠客名，可用文字、数字或 · _ -')
  }
  if (avatarId !== 'hero_sword' && avatarId !== 'hero_sword_male') {
    throw new GameError(400, 'INVALID_AVATAR', '请选择男侠或女侠')
  }
  return transaction(async (client) => {
    await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [accountId])
    const { rows: [existing] } = await client.query<Pick<CharacterRow, 'nickname' | 'profile'>>(
      'SELECT nickname, profile FROM players WHERE account_id = $1', [accountId],
    )
    const now = await serverTime(client)
    if (existing) {
      if (existing.nickname !== nickname || existing.profile.avatarId !== avatarId) {
        throw new GameError(409, 'PLAYER_ALREADY_CREATED', '这个账号已有角色')
      }
      const character = await readCharacter(client, accountId, true)
      return snapshot(character, Math.max(now, character.player.lastSettleAt))
    }

    const id = randomUUID()
    const starter = createStarterCharacter({ id, nickname, avatarId }, now)
    const { rowCount } = await client.query(
      `INSERT INTO players (id, account_id, nickname, profile, pill_count, last_settle_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (nickname) DO NOTHING`,
      [id, accountId, nickname, profileOf(starter.player), starter.pillCount, now],
    )
    if (!rowCount) throw new GameError(409, 'NICKNAME_TAKEN', '这位侠客的名字已有人用')

    await client.query('INSERT INTO player_items SELECT $1, unnest($2::text[])', [id, starter.ownedItemIds])
    await client.query('INSERT INTO player_skills SELECT $1, key, value::int FROM jsonb_each_text($2::jsonb)', [id, starter.learnedSkills])
    await client.query('INSERT INTO player_companions SELECT $1, key, value FROM jsonb_each($2::jsonb)', [id, starter.companionAffinity])
    await client.query(
      `INSERT INTO player_loadouts SELECT $1, (value->>'presetIdx')::int, value FROM jsonb_array_elements($2::jsonb)`,
      [id, JSON.stringify(Object.values(starter.presets))],
    )
    return snapshot(await readCharacter(client, accountId), now)
  })
}

type ReadRelated = (ids: readonly string[]) => Promise<Character[]>
type ActionChange<T> = { result: T; changed: boolean; related?: Character[] }
type ApplyAction<T> = (character: Character, now: number, client: PoolClient, readRelated: ReadRelated) => Promise<ActionChange<T>>

class RelatedLocksNeeded extends Error {
  ids: readonly string[]

  constructor(ids: readonly string[]) {
    super('Lock related characters')
    this.ids = ids
  }
}

async function saveCharacter(client: PoolClient, character: Character) {
  const { player } = character
  character.revision += 1
  await client.query(
    `UPDATE players SET profile = $2, last_settle_at = $3, qi_remainder = $4, silver_remainder = $5,
     rewarded_chapters = $6, revision = $7, co_cultivation_id = $8, shaoshi_clears = $9 WHERE id = $1`,
    [player.id, profileOf(player), player.lastSettleAt, character.qiRemainder, character.silverRemainder,
      character.rewardedChapters, character.revision, character.coCultivation?.id ?? null, character.shaoshiClears],
  )
}

async function writeAction<T>(request: FastifyRequest, apply: ApplyAction<T>): Promise<{
  response: GameAction<T>
  updates: PlayerSnapshot[]
}> {
  const { accountId } = await requireSession(request)
  const requestId = request.headers['idempotency-key']
  if (typeof requestId !== 'string' || !UUID.test(requestId)) {
    throw new GameError(400, 'INVALID_REQUEST_KEY', '操作编号有误，请重试')
  }
  const input = JSON.stringify([request.method, request.url, request.body ?? null], (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
      : value,
  )
  const fingerprint = createHash('sha256').update(input).digest('hex')

  let relatedIds: readonly string[] = []
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await transaction(async (client) => {
        const { rows } = await client.query<CharacterRow>(
          'SELECT * FROM players WHERE account_id = $1 OR id = ANY($2::uuid[]) ORDER BY id FOR UPDATE', [accountId, relatedIds],
        )
        const row = rows.find((entry) => entry.account_id === accountId)
        if (!row) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
        const character = await hydrateCharacter(client, row)
        const now = Math.max(await serverTime(client), ...rows.map((entry) => Number(entry.last_settle_at)))
        const { rows: [receipt] } = await client.query<{ fingerprint: string; result: T }>(
          'SELECT fingerprint, result FROM player_actions WHERE player_id = $1 AND request_id = $2', [row.id, requestId],
        )
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) throw new GameError(409, 'REQUEST_KEY_REUSED', '这个操作编号已用于另一件事')
          return { response: { snapshot: snapshot(character, now), result: receipt.result }, updates: [] }
        }

        const patrolChanged = await settlePatrol(character, now, client)
        const { result, changed: applied, related = [] } = await apply(character, now, client, async (ids) => {
          if (ids.includes(row.id)) throw new GameError(400, 'INVALID_PARTNER', '请选择另一位侠客')
          // 释放单人锁后按角色 ID 一起加锁，再校验当前共修关系或副本队伍。
          if (ids.some((id) => !relatedIds.includes(id))) throw new RelatedLocksNeeded(ids)
          const characters: Character[] = []
          for (const id of ids) {
            const relatedRow = rows.find((entry) => entry.id === id)
            if (!relatedRow) throw new GameError(409, 'PARTNER_UNAVAILABLE', '有侠客暂时无法加入')
            characters.push(await hydrateCharacter(client, relatedRow))
          }
          return characters
        })
        const changed = patrolChanged || applied
        if (changed) await saveCharacter(client, character)
        for (const other of related) await saveCharacter(client, other)
        await client.query('INSERT INTO player_actions VALUES ($1, $2, $3, $4)', [row.id, requestId, fingerprint, result])
        const latest = snapshot(character, now)
        const updates = changed ? [latest] : []
        for (const other of related) updates.push(snapshot(other, now))
        return { response: { snapshot: latest, result }, updates }
      })
    } catch (error) {
      if (!(error instanceof RelatedLocksNeeded)) throw error
      relatedIds = error.ids
    }
  }
  throw new GameError(409, 'PARTNERS_CHANGED', '同伴状态刚有变化，请再试一次')
}

function checkedLoadout(character: Character, idx: LoadoutPresetDTO['presetIdx'], value: unknown): LoadoutPresetDTO {
  const preset = objectBody(value)
  const { name, stance } = preset
  const invalid = (message: string) => new GameError(400, 'INVALID_LOADOUT', message)
  if (preset.presetIdx !== idx || typeof name !== 'string' || !name.trim() || name.trim().length > 32) {
    throw invalid('配装名称或编号有误')
  }
  if (typeof stance !== 'string' || !Object.hasOwn(STANCE_META, stance)) throw invalid('请选择一种战斗打法')

  function skill(value: unknown, slot: SkillSlotType) {
    if (value === null) return null
    if (typeof value !== 'string' || !character.learnedSkills[value] || SKILLS[value]?.slot !== slot) {
      throw invalid('请在对应栏位选一门已学武功')
    }
    return value
  }

  function companion(value: unknown) {
    if (value === null) return null
    if (typeof value !== 'string' || !character.companionAffinity[value]?.recruited) throw invalid('这位伙伴还未加入队伍')
    return value
  }

  const leftCompanionId = companion(preset.leftCompanionId)
  const rightCompanionId = companion(preset.rightCompanionId)
  if (leftCompanionId && leftCompanionId === rightCompanionId) throw invalid('同一位伙伴只能上一处')

  const checked: LoadoutPresetDTO = {
    presetIdx: idx,
    name: name.trim(),
    stance: stance as LoadoutPresetDTO['stance'],
    innerSkillId: skill(preset.innerSkillId, 'INNER'),
    outerSkillId: skill(preset.outerSkillId, 'OUTER'),
    lightSkillId: skill(preset.lightSkillId, 'LIGHT'),
    ultSkillId: skill(preset.ultSkillId, 'ULT'),
    leftCompanionId,
    rightCompanionId,
    weaponId: null, armorId: null, headId: null, wristId: null, beltId: null, bootsId: null, accId: null, relicBookId: null,
  }
  for (const [slot, { field, label }] of Object.entries(EQUIP_SLOT_META)) {
    const id = preset[field]
    if (id === null) continue
    if (typeof id !== 'string' || !character.ownedItemIds.includes(id)) throw invalid('这件装备还没拿到')
    const item = ITEMS[id]
    if (item?.slot !== slot) throw invalid(`这件装备不能放进${label}格`)
    if (item.reqStat && character.player.stats[item.reqStat.key] < item.reqStat.val) {
      throw invalid(`装备「${item.name}」需要${item.reqStat.label}`)
    }
    checked[field] = id
  }
  return checked
}

const NO_IDLE_GAIN: IdleGain = { gainedQi: 0, gainedSilver: 0 }

async function removeInvitation(character: Character, invitation: CoCultivationInviteDTO, client: PoolClient, readRelated: ReadRelated) {
  const otherId = invitation.inviter.id === character.player.id ? invitation.invitee.id : invitation.inviter.id
  const [partner] = await readRelated([otherId])
  await client.query('DELETE FROM co_cultivations WHERE id = $1 AND starts_at IS NULL', [invitation.id])
  character.coCultivationInvite = null
  partner.coCultivationInvite = null
  return partner
}

async function endCoCultivation(
  character: Character, pair: CoCultivationDTO, now: number, client: PoolClient, readRelated: ReadRelated,
): Promise<ActionChange<IdleGain>> {
  const [partner] = await readRelated([pair.partner.id])
  const result = settle(character, now)
  settle(partner, now)
  await client.query('UPDATE co_cultivations SET ends_at = $2 WHERE id = $1', [pair.id, now])
  character.coCultivation = null
  partner.coCultivation = null
  return { result, changed: true, related: [partner] }
}

export function registerGame(app: FastifyInstance, rooms: ReturnType<typeof registerRooms>, raid: ReturnType<typeof registerRaidLobby>) {
  app.get('/api/v1/player/me', async (request) => getSnapshot((await requireSession(request)).accountId))
  app.post('/api/v1/player/create', async (request) => createPlayer((await requireSession(request)).accountId, request.body))

  async function respond<T>(request: FastifyRequest, apply: ApplyAction<T>) {
    const { response, updates } = await writeAction(request, apply)
    for (const updated of updates) rooms.publish(updated)
    return response
  }

  app.post('/api/v1/cultivate/settle', (request) => respond(request, async (character, now) => {
    const changed = now > character.player.lastSettleAt || !!(character.coCultivation && character.coCultivation.endsAt <= now)
    return { result: settle(character, now), changed }
  }))

  app.post('/api/v1/map/move', (request) => respond(request, async (character, now, client, readRelated) => {
    const { mapId } = objectBody(request.body)
    if (typeof mapId !== 'string' || !ONLINE_MAPS.some((map) => map.id === mapId)) {
      throw new GameError(400, 'INVALID_MAP', '江湖图上找不到这个地方')
    }
    if (mapId === character.player.currentMapId) return { result: NO_IDLE_GAIN, changed: false }
    const pair = activePair(character, now)
    if (pair) {
      const stopped = await endCoCultivation(character, pair, now, client, readRelated)
      character.player.currentMapId = mapId
      return stopped
    }
    const invitation = pendingInvite(character, now)
    const related = invitation ? [await removeInvitation(character, invitation, client, readRelated)] : []
    const result = settle(character, now)
    character.player.currentMapId = mapId
    return { result, changed: true, related }
  }))

  function requireCoCultivationPartners(character: Character, partner: Character, mapId: string, now: number) {
    if (ONLINE_MAPS.find((map) => map.id === mapId)?.safety !== 'PEACE') {
      throw new GameError(409, 'CO_CULTIVATION_PEACE_ONLY', '到和平地图才能一起修行')
    }
    if ([character, partner].some(({ player }) => player.currentMapId !== mapId || !rooms.isOnlineInMap(player.id, mapId))) {
      throw new GameError(409, 'PARTNER_UNAVAILABLE', '两位侠客都在线、也在同一处，才能一起修行')
    }
    if (activePair(character, now) || activePair(partner, now)) {
      throw new GameError(409, 'CO_CULTIVATION_ACTIVE', '已有侠客正在共修，请先结束这一场')
    }
  }

  app.post('/api/v1/map/co-cultivate', (request) => respond<IdleGain>(request, async (character, now, client, readRelated) => {
    const input = objectBody(request.body)
    if (input.action === 'invite') {
      const { targetPlayerId } = input
      if (typeof targetPlayerId !== 'string' || !UUID.test(targetPlayerId)) {
        throw new GameError(400, 'INVALID_PARTNER', '请选择一位同图侠客')
      }
      const [partner] = await readRelated([targetPlayerId.toLowerCase()])
      const mapId = character.player.currentMapId
      requireCoCultivationPartners(character, partner, mapId, now)
      const existing = pendingInvite(character, now)
      if (existing?.inviter.id === character.player.id && existing.invitee.id === partner.player.id) {
        return { result: NO_IDLE_GAIN, changed: false }
      }
      if (existing || pendingInvite(partner, now)) {
        throw new GameError(409, 'CO_CULTIVATION_INVITE_PENDING', '已有共修邀请在等答复')
      }

      const invitation: CoCultivationInviteDTO = {
        id: randomUUID(), mapId, expiresAt: now + 60_000,
        inviter: { id: character.player.id, nickname: character.player.nickname },
        invitee: { id: partner.player.id, nickname: partner.player.nickname },
      }
      await client.query(
        'INSERT INTO co_cultivations (id, inviter_id, invitee_id, map_id, invite_expires_at) VALUES ($1, $2, $3, $4, $5)',
        [invitation.id, invitation.inviter.id, invitation.invitee.id, mapId, invitation.expiresAt],
      )
      character.coCultivationInvite = invitation
      partner.coCultivationInvite = invitation
      return { result: NO_IDLE_GAIN, changed: true, related: [partner] }
    }

    if (input.action === 'end') {
      const pair = activePair(character, now)
      if (!pair || pair.id !== input.coCultivationId) throw new GameError(409, 'CO_CULTIVATION_ENDED', '这场共修已经结束')
      return endCoCultivation(character, pair, now, client, readRelated)
    }

    if (input.action !== 'accept' && input.action !== 'decline') {
      throw new GameError(400, 'INVALID_CO_CULTIVATION_ACTION', '共修操作有误')
    }
    const invitation = pendingInvite(character, now)
    if (!invitation || invitation.id !== input.invitationId) throw new GameError(409, 'CO_CULTIVATION_INVITE_EXPIRED', '这封共修邀请已经失效')
    if (invitation.invitee.id !== character.player.id) throw new GameError(403, 'CO_CULTIVATION_INVITE_NOT_YOURS', '请等对方答复')
    if (input.action === 'decline') {
      const partner = await removeInvitation(character, invitation, client, readRelated)
      return { result: NO_IDLE_GAIN, changed: true, related: [partner] }
    }

    const [partner] = await readRelated([invitation.inviter.id])
    requireCoCultivationPartners(character, partner, invitation.mapId, now)
    const result = settle(character, now)
    settle(partner, now)
    const endsAt = now + 4 * 3_600_000
    await client.query('UPDATE co_cultivations SET starts_at = $2, ends_at = $3 WHERE id = $1', [invitation.id, now, endsAt])
    character.coCultivation = { id: invitation.id, partner: invitation.inviter, startsAt: now, endsAt }
    partner.coCultivation = { id: invitation.id, partner: invitation.invitee, startsAt: now, endsAt }
    character.coCultivationInvite = null
    partner.coCultivationInvite = null
    return { result, changed: true, related: [partner] }
  }))

  app.post('/api/v1/raid/start', async (request) => {
    const { teamId, revision } = objectBody(request.body)
    let finish: (() => void) | undefined
    const reports = new Map<string, BattleReportDTO>()
    try {
      const { response, updates } = await writeAction<BattleReportDTO>(request, async (leader, _now, client, readRelated) => {
        const [, leftId, rightId] = raid.lineup(leader.player.id, teamId, revision)
        const [left, right] = await readRelated([leftId, rightId])
        const party = [leader, left, right] as const
        if (party.some(({ player }) => player.currentMapId !== leader.player.currentMapId)) {
          throw new GameError(409, 'RAID_NOT_NEARBY', '三位侠客要在同一处才能入阵')
        }
        finish = raid.reserve(leader.player.id, teamId, revision)
        const fighter = (member: Character) => ({ player: member.player, loadout: activeLoadout(member), learnedSkills: member.learnedSkills })
        const battle = simulateShaoshiRaid(randomUUID(), [fighter(leader), fighter(left), fighter(right)])
        const won = battle.winner === 'ALLY'
        for (const member of party) {
          const { player } = member
          if (!won) {
            reports.set(player.id, battle)
            continue
          }

          const relic = COOP_RAID_RELICS[member.shaoshiClears]
          const drop = relic && !member.ownedItemIds.includes(relic.id) ? relic : undefined
          member.shaoshiClears++
          player.qiExp += SHAOSHI_RAID.rewardQi
          player.silver += SHAOSHI_RAID.rewardSilver
          if (drop) {
            await client.query('INSERT INTO player_items VALUES ($1, $2)', [player.id, drop.id])
            member.ownedItemIds.push(drop.id)
          }
          const items = drop ? [{ id: drop.id, name: drop.name, tier: drop.tier }] : []
          reports.set(player.id, { ...battle, rewards: { qiExp: SHAOSHI_RAID.rewardQi, silver: SHAOSHI_RAID.rewardSilver, items } })
        }
        return { result: reports.get(leader.player.id)!, changed: won, related: won ? [left, right] : [] }
      })
      for (const updated of updates) rooms.publish(updated)
      for (const [playerId, report] of reports) rooms.sendToPlayer(playerId, { event: 'RAID_REPORT', data: report })
      return response
    } finally {
      finish?.()
    }
  })

  app.put<{ Params: { presetIdx: string } }>('/api/v1/loadout/:presetIdx', (request) => respond(request, async (character, now, client) => {
    const idx = Number(request.params.presetIdx)
    const { preset, activate = false, expectedRevision } = objectBody(request.body)
    if ((idx !== 1 && idx !== 2 && idx !== 3) || typeof activate !== 'boolean' || !Number.isInteger(expectedRevision)) {
      throw new GameError(400, 'INVALID_LOADOUT', '配装编号或存档修订号有误')
    }
    if (expectedRevision !== character.revision) throw new GameError(409, 'STALE_REVISION', '装备已更新，查看最新配装后再试')
    const checked = checkedLoadout(character, idx, preset)
    const { player } = character
    const nextIdx = activate ? idx : player.activePresetIdx
    const nextActive = nextIdx === idx ? checked : activeLoadout(character)
    const rateChanged = cultivationRate(player, nextActive) !== cultivationRate(player, activeLoadout(character))
    const result = rateChanged ? settle(character, now) : NO_IDLE_GAIN
    character.loadouts[idx - 1] = checked
    player.activePresetIdx = nextIdx
    await client.query('UPDATE player_loadouts SET preset = $3 WHERE player_id = $1 AND preset_idx = $2', [player.id, idx, checked])
    return { result, changed: true }
  }))

  app.post('/api/v1/skill/upgrade', (request) => respond<SkillUpgradeResult>(request, async (character, _now, client) => {
    const { skillId, expectedMastery } = objectBody(request.body)
    if (typeof skillId !== 'string' || !Object.hasOwn(SKILLS, skillId) || !Number.isInteger(expectedMastery)) {
      throw new GameError(400, 'INVALID_SKILL_UPGRADE', '请选择一门武功升重')
    }
    const mastery = character.learnedSkills[skillId]
    if (!mastery) throw new GameError(409, 'SKILL_NOT_LEARNED', '学会这门武功后才能升级')
    if (expectedMastery !== mastery) throw new GameError(409, 'STALE_REVISION', '武功重数已变，查看后再试')
    if (mastery >= MAX_SKILL_MASTERY) throw new GameError(409, 'SKILL_MAXED', '这门武功已经练满')

    const skill = SKILLS[skillId]
    const { player } = character
    const spentQi = skillUpgradeCost(skill, mastery, player.stats.intStat)
    if (player.qiExp < spentQi) throw new GameError(409, 'SKILL_QI_REQUIRED', `还差 ${(spentQi - player.qiExp).toLocaleString('zh-CN')} 真气`)

    const nextMastery = mastery + 1
    await client.query('UPDATE player_skills SET mastery = $3 WHERE player_id = $1 AND skill_id = $2', [player.id, skillId, nextMastery])
    character.learnedSkills[skillId] = nextMastery
    player.qiExp -= spentQi
    player.stats.str += 1
    const power = skill.slot === 'OUTER' || skill.slot === 'ULT'
      ? { before: skillPowerAtMastery(skill, mastery), after: skillPowerAtMastery(skill, nextMastery) }
      : null
    return { result: { skillId, mastery: nextMastery, spentQi, power }, changed: true }
  }))

  app.post<{ Params: { chapterId: string } }>('/api/v1/story/:chapterId/challenge', (request) => respond<StoryChallengeResult>(request, async (character, _now, client) => {
    const chapter = ONLINE_STORY_CHAPTERS.find((ch) => String(ch.id) === request.params.chapterId)
    if (!chapter) throw new GameError(404, 'CHAPTER_NOT_FOUND', '江湖图上没有这一关')
    const { player } = character
    if (chapter.id > player.maxChapterId) throw new GameError(409, 'CHAPTER_LOCKED', '先打过上一关，就能挑战这里')
    const unclaimed = !character.rewardedChapters.includes(chapter.id)
    const drops = unclaimed ? getChapterDrops(chapter).filter((drop) =>
      drop.kind === 'item' ? !character.ownedItemIds.includes(drop.id) : !character.learnedSkills[drop.id],
    ) : []

    const report = simulateServerBattle({
      sceneTitle: `${chapter.code} ${chapter.title}`,
      mode: 'SOLO_STORY',
      player,
      loadout: activeLoadout(character),
      learnedSkills: character.learnedSkills,
      enemyMain: {
        name: chapter.bossName, title: chapter.bossTitle, portrait: chapter.bossPortrait,
        hp: chapter.bossHp, atk: chapter.bossAtk, mp: chapter.bossHp * 0.45, stance: chapter.bossStance,
      },
      rewards: unclaimed ? { qiExp: chapter.rewardQi, silver: chapter.rewardSilver, items: drops } : undefined,
    })
    report.battleId = randomUUID()
    if (!report.rewards) return { result: { report, firstClear: false }, changed: false }

    player.qiExp += report.rewards.qiExp
    player.silver += report.rewards.silver
    player.maxChapterId = Math.max(player.maxChapterId, chapter.id + 1)
    character.rewardedChapters.push(chapter.id)
    for (const { id, kind } of drops) {
      if (kind === 'item') {
        await client.query('INSERT INTO player_items VALUES ($1, $2)', [player.id, id])
        character.ownedItemIds.push(id)
      } else {
        await client.query('INSERT INTO player_skills VALUES ($1, $2, 1)', [player.id, id])
        character.learnedSkills[id] = 1
      }
    }
    return { result: { report, firstClear: true }, changed: true }
  }))

  app.post('/api/v1/trial/patrol', (request) => respond<TrialPatrolStatusDTO>(request, async (character) => {
    const { stageId } = objectBody(request.body)
    const stage = typeof stageId === 'number' ? trialStageOf(stageId) : undefined
    if (!stage) throw new GameError(400, 'INVALID_TRIAL_STAGE', '找不到这一关')
    if (stage.id > character.player.trial.maxStageId) {
      throw new GameError(409, 'TRIAL_STAGE_LOCKED', '先打过上一关，才能在这里巡历')
    }
    if (character.player.trial.selectedStageId === stage.id) {
      return { result: patrolStatus(character), changed: false }
    }
    character.player.trial.selectedStageId = stage.id
    return { result: patrolStatus(character), changed: true }
  }))

  function trialBattle(character: Character, stage: NonNullable<ReturnType<typeof trialStageOf>>, rewards?: BattleReportDTO['rewards']) {
    return simulateServerBattle({
      sceneTitle: `${stage.code} ${stage.title}`,
      mode: 'SOLO_STORY',
      player: character.player,
      loadout: activeLoadout(character),
      learnedSkills: character.learnedSkills,
      enemyMain: {
        name: stage.boss.name,
        title: stage.boss.title,
        portrait: stage.boss.portrait,
        hp: stage.boss.hp,
        atk: stage.boss.atk,
        mp: Math.round(stage.boss.hp * 0.45),
        stance: stage.boss.stance,
      },
      surviveRounds: stage.victory === 'SURVIVE_ROUNDS' ? stage.surviveRounds : undefined,
      rewards,
    })
  }

  app.post<{ Params: { stageId: string } }>('/api/v1/trial/:stageId/challenge', (request) => respond<TrialChallengeResult>(request, async (character, _now, client) => {
    const stage = trialStageOf(Number(request.params.stageId))
    if (!stage) throw new GameError(404, 'TRIAL_STAGE_NOT_FOUND', '江湖图上没有这一关')
    const player = character.player
    const trial = player.trial
    if (stage.id > trial.maxStageId) throw new GameError(409, 'TRIAL_STAGE_LOCKED', '先打过上一关，才能挑战这里')

    const required = TRIAL_PATROL_HOURS[stage.id] ?? 0
    const hours = trial.stageHours[String(stage.id)] ?? 0
    if (hours < required) {
      const rest = required - hours
      throw new GameError(409, 'TRIAL_PATROL_REQUIRED',
        `本关巡历还差 ${rest < 1 ? `${Math.max(1, Math.ceil(rest * 60))} 分钟` : `${rest.toFixed(1)} 小时`}`)
    }

    const firstClear = !trial.rewardedStageIds.includes(stage.id)
    const drops = firstClear
      ? stage.firstClearParts
        .map((slot) => trialItemOf(trialPartId(stage.setId, slot)))
        .filter((item): item is NonNullable<ReturnType<typeof trialItemOf>> => !!item && !character.ownedItemIds.includes(item.id))
      : []
    const rewardQi = Math.round(stage.boss.hp * 2)
    const rewardSilver = Math.round(stage.boss.hp * 0.8)
    const report = trialBattle(character, stage, firstClear
      ? { qiExp: rewardQi, silver: rewardSilver, items: drops.map(({ id, name, tier }) => ({ id, name, tier })) }
      : undefined)
    report.battleId = randomUUID()

    const patrol = patrolStatus(character)
    if (report.winner !== 'ALLY' || !firstClear) {
      return { result: { report, firstClear: false, unlockedStageId: null, drops: [], patrol }, changed: false }
    }

    player.qiExp += rewardQi
    player.silver += rewardSilver
    for (const drop of drops) {
      await client.query('INSERT INTO player_items VALUES ($1, $2) ON CONFLICT DO NOTHING', [player.id, drop.id])
      character.ownedItemIds.push(drop.id)
    }
    trial.rewardedStageIds.push(stage.id)
    trial.stageHours[String(stage.id)] = 0
    const next = Math.min(TRIAL_STAGES.length, stage.id + 1)
    trial.maxStageId = Math.max(trial.maxStageId, next)
    trial.selectedStageId = next
    return {
      result: {
        report,
        firstClear: true,
        unlockedStageId: trial.maxStageId,
        drops: drops.map(({ id, name, tier }) => ({ id, name, tier })),
        patrol: patrolStatus(character),
      },
      changed: true,
    }
  }))

  app.post<{ Params: { stageId: string } }>('/api/v1/trial/:stageId/replay', (request) => respond<TrialReplayResult>(request, async (character, _now, client) => {
    const stage = trialStageOf(Number(request.params.stageId))
    if (!stage) throw new GameError(404, 'TRIAL_STAGE_NOT_FOUND', '江湖图上没有这一关')
    if (!stage.replayPartIds) throw new GameError(400, 'TRIAL_NOT_REPLAYABLE', '这一关没有首领复战')

    const key = String(stage.id)
    const replayHours = character.player.trial.replayHours[key] ?? 0
    if (replayHours < TRIAL_REPLAY_HOURS) {
      throw new GameError(409, 'TRIAL_REPLAY_REQUIRED', `在本关巡历满 ${TRIAL_REPLAY_HOURS} 小时才能再战首领`)
    }

    const report = trialBattle(character, stage)
    report.battleId = randomUUID()
    if (report.winner !== 'ALLY') return { result: { report, drop: null, replayHours }, changed: false }

    const candidates = stage.replayPartIds
      .map((id) => trialItemOf(id))
      .filter((item): item is NonNullable<ReturnType<typeof trialItemOf>> => !!item)
    const drop = candidates.find((item) => !character.ownedItemIds.includes(item.id)) ?? candidates[0]
    if (drop) {
      if (character.ownedItemIds.includes(drop.id)) {
        character.player.trial.marks[key] = (character.player.trial.marks[key] ?? 0) + 1
      } else {
        await client.query('INSERT INTO player_items VALUES ($1, $2) ON CONFLICT DO NOTHING', [character.player.id, drop.id])
        character.ownedItemIds.push(drop.id)
      }
    }
    character.player.trial.replayHours[key] = 0
    return {
      result: {
        report,
        drop: drop ? { id: drop.id, name: drop.name, tier: drop.tier } : null,
        replayHours: 0,
      },
      changed: true,
    }
  }))

  app.post<{ Params: { stageId: string } }>('/api/v1/trial/:stageId/redeem', (request) => respond<{ itemId: string; name: string }>(request, async (character, _now, client) => {
    const stage = trialStageOf(Number(request.params.stageId))
    if (!stage) throw new GameError(404, 'TRIAL_STAGE_NOT_FOUND', '江湖图上没有这一关')
    const { slot } = objectBody(request.body)
    if (typeof slot !== 'string' || !Object.hasOwn(EQUIP_SLOT_META, slot)) {
      throw new GameError(400, 'INVALID_EQUIP_SLOT', '请选择要补的部位')
    }
    const key = String(stage.id)
    const marks = character.player.trial.marks[key] ?? 0
    if (marks < 4) throw new GameError(409, 'TRIAL_MARKS_REQUIRED', '集齐 4 枚巡历印记才能兑换')
    const item = trialItemOf(trialPartId(stage.setId, slot as keyof typeof EQUIP_SLOT_META))
    if (!item) throw new GameError(404, 'TRIAL_ITEM_NOT_FOUND', '这一关没有该部位')
    if (character.ownedItemIds.includes(item.id)) throw new GameError(409, 'TRIAL_ITEM_OWNED', '这个部位已经拿到了')

    character.player.trial.marks[key] = marks - 4
    await client.query('INSERT INTO player_items VALUES ($1, $2) ON CONFLICT DO NOTHING', [character.player.id, item.id])
    character.ownedItemIds.push(item.id)
    return { result: { itemId: item.id, name: item.name }, changed: true }
  }))
}
