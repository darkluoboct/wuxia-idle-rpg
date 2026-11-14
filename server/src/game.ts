import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import { calcNextLevelQi, computeDerivedStats, simulateCoopRaid, simulatePlayerDuel, simulateServerBattle } from '../../shared/battle.ts'
import { creditBattleEffectLoot, spendBattleMedicines } from '../../shared/battleEffects.ts'
import { battleEnvironmentAt, EQUIP_SLOT_META, shichenIdxFromDate, STANCE_META } from '../../shared/combatMeta.ts'
import { extractFurnaceResidue, FORAGE_QI_COST, gatherHerbs, pillDoubleRate, pillSuccessRate } from '../../shared/alchemy.ts'
import { forgeEquipment, forgeMaterials } from '../../shared/equipmentForge.ts'
import { activeJianghuTitle, activeSetBonuses, canEquipCompanionItem, companionView, COMPANIONS, COOP_RAIDS, GHOST_MARKET_LISTINGS, hiddenWeaponCapacity, INN_GIFT_COST, INN_TEA_COST, ITEMS, JIANGHU_TITLES, marketListingPrice, MEDICINES, meetsItemStatRequirement, ONLINE_MAPS, PILL_RECIPES, SECTS, SKILLS, totalCompanionSetBonuses, trialRewardItems, unlockedHiddenWeapons } from '../../shared/gameData.ts'
import {
  advancePatrol, announceChapterOneTitle, CHAPTER_ONE_FINAL_STAGE, collectTrialDrop, equippedGearSkill, hasTrialPart, patrolEncounterCount, patrolEncounterRate, recruitTrialCompanions, rollTrialDrop,
  switchPatrolStage, TRIAL_PATROL_HOURS, TRIAL_REPLAY_HOURS, TRIAL_STAGES, trialFirstClearKarma, trialItemOf, trialPartId, trialPuzzleOutcome,
  trialStageOf, upgradesPatrolYield, type TrialStageConfig,
} from '../../shared/trialStages.ts'
import { appraiseGhostCurio, canEnterMap, canReceiveSnakeRecipe, cityInspectionDue, coCultivationRate, createStarterCharacter, cultivatePlayer, cultivationRate, cultivationRates, enemySilverReward, GHOST_APPRAISAL_SWORD, idleQiNumerator, innAffinityGain, innGiftsRemaining, innVisitDay, karmaAfterEvent, legacyAcupoints, planMapJourney, recipeForPlayer, resolveSeaVoyage, settlePatrolCaches } from '../../shared/player.ts'
import { HUASHAN_HONORS, HUASHAN_RESPECT_QI, huashanDay, huashanRankReward, huashanRatingSwing, huashanSeason, huashanSeasonEndsAt } from '../../shared/huashan.ts'
import { GAIBANG_DEBATE, GAIBANG_FINAL_DISHES, gaibangDishFlag, gaibangSilverGain } from '../../shared/gaibang.ts'
import { BETRAYAL_BOUNTY, SECT_CHIEF_SALUTE_QI, SECT_CONTEST_MIN_RANK, SECT_SALUTE_QI, sectContestEndsAt, sectContestWeek, sectContributionGain, sectExamBlockReason, sectPromotion, sectPromotionRewards, simulateSectTrial } from '../../shared/sectProgress.ts'
import { eligibleWandererEquipment, gaibangBeggingSilver, sectEquipmentRewardIds, WANDERER_EQUIPMENT } from '../../shared/sectEquipment.ts'
import { MAX_SKILL_MASTERY, QUSAN_CACHE_KEY, searchQusanCache, skillFragmentDiscount, skillPowerAtMastery, skillUpgradeCost } from '../../shared/skillMastery.ts'
import { effectiveMartialStats, hasMartialFreedom } from '../../shared/martialSchools.ts'
import { addAdventureObjective, adventureById, adventureEncounter, onlineStoryChapter, ONLINE_STORY_PROGRESS_VERSION, restoreOnlineStoryProgress, STAT_LABEL, storyFirstClearReward, storyProgressFlags, type AdventureBattle, type Reward, type StatKey } from '../../shared/storyData.ts'
import { canChooseStorySnake, STORY_SNAKE_ADVENTURE, storyEncounter } from '../../shared/storySnake.ts'
import { QUANZHEN_LIBRARY } from '../../shared/quanzhen.ts'
import { gainReunionClues, newReunion, reunionCluesToday, reunionEncounter, reunionWaitTime, REUNION_INQUIRE_COST, REUNION_QUESTS, REUNION_WAIT_HOURS, type ClueSource, type ReunionQuestConfig } from '../../shared/reunion.ts'
import type {
  BattleReportDTO, BountyBoardDTO, BountyEntryDTO, ChapterOneStatueDTO, CoCultivationDTO, CoCultivationInviteDTO, CompanionState, CompanionWear, CultivationResult, DuelInviteDTO, ForgeInput, ForgeResult, GameAction, HuashanBoardDTO, HuashanEntryDTO, HuashanResult, IdleGain, InnGiftResult, LibraryResult, LibraryStatusDTO, LoadoutPresetDTO, MapMoveResult, PersonalEquipSlot, PlayerDTO, PlayerSnapshot,
  MirrorRankEntryDTO, ReunionResult, RichSegment, SectChiefDTO, SectContestBoardDTO, SectContestResult, SectResult, SkillSlotType, SkillUpgradeResult, StoryAdventureResult, StoryChallengeResult, StorySnakeChoiceResult, TrialChallengeResult, TrialDropDTO, TrialPatrolStatusDTO, TrialReplayResult,
  UniqueArtifactStatusDTO,
} from '../../shared/protocol.ts'
import { requireSession } from './auth.ts'
import { serverTime, transaction } from './db.ts'
import { GameError, objectBody } from './http.ts'
import type { registerRaidLobby } from './raidLobby.ts'
import type { registerRooms } from './rooms.ts'

type Profile = Omit<PlayerDTO, 'id' | 'nickname' | 'lastSettleAt' | 'nextLevelQi' | 'qiPerHour' | 'equipmentAffixes' | 'chapterOneChampion'> & {
  storyProgressVersion?: number
}
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
  chongyang_clears: number
  juxian_clears: number
}

type Character = Omit<PlayerSnapshot, 'serverTime' | 'derivedStats' | 'idlePreview' | 'soloQiPerHour' | 'soloSilverBasis' | 'pillCount'> & {
  rewardedChapters: number[]
  qiRemainder: number
  silverRemainder: number
  patrolDrops?: TrialDropDTO[]
  patrolForgeMaterials?: number
  patrolCache?: IdleGain['patrolCache']
  patrolIdleGain?: IdleGain
  patrolIdleFrom?: number
}

function profileOf(player: PlayerDTO): Profile {
  const { id, nickname, lastSettleAt, nextLevelQi, qiPerHour, equipmentAffixes, chapterOneChampion, ...profile } = player
  return { ...profile, storyProgressVersion: ONLINE_STORY_PROGRESS_VERSION }
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
  const { rows: [{ equipmentAffixes, chapterOneChampion, ...details }] } = await client.query<Pick<Character,
    'loadouts' | 'ownedItemIds' | 'learnedSkills' | 'companionAffinity' | 'coCultivation' | 'coCultivationInvite'
  > & Pick<PlayerDTO, 'equipmentAffixes'> & { chapterOneChampion: boolean }>(
    `SELECT
       (SELECT jsonb_agg(preset ORDER BY preset_idx) FROM player_loadouts WHERE player_id = $1) AS loadouts,
       ARRAY(SELECT item_id FROM player_items WHERE player_id = $1 ORDER BY item_id) AS "ownedItemIds",
       COALESCE((SELECT jsonb_object_agg(item_id, affix_roll) FROM player_items WHERE player_id = $1 AND affix_roll > 0), '{}') AS "equipmentAffixes",
       COALESCE((SELECT jsonb_object_agg(skill_id, mastery) FROM player_skills WHERE player_id = $1), '{}') AS "learnedSkills",
       COALESCE((SELECT jsonb_object_agg(companion_id, state) FROM player_companions WHERE player_id = $1), '{}') AS "companionAffinity",
       EXISTS (SELECT 1 FROM chapter_one_statue WHERE player_id = $1) AS "chapterOneChampion",
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
  recruitTrialCompanions(details.companionAffinity, row.profile.trial?.rewardedStageIds ?? [])
  const { storyProgressVersion, ...profile } = row.profile
  const progress = restoreOnlineStoryProgress(profile.maxChapterId, row.rewarded_chapters, storyProgressVersion)
  return {
    ...details,
    player: {
      ...profile,
      maxChapterId: progress.maxChapterId,
      openedAcupointIds: row.profile.openedAcupointIds ?? legacyAcupoints(row.profile.realmTier),
      acupointPills: row.profile.acupointPills ?? { pozhang_dan: row.pill_count },
      equipmentAffixes,
      chapterOneChampion: chapterOneChampion ? true : undefined,
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
    rewardedChapters: progress.rewardedChapters,
    qiRemainder: row.qi_remainder,
    silverRemainder: row.silver_remainder,
    revision: row.revision,
    shaoshiClears: row.shaoshi_clears,
    chongyangClears: row.chongyang_clears,
    juxianClears: row.juxian_clears,
  }
}

function activeLoadout(character: Character) {
  return character.loadouts[character.player.activePresetIdx - 1]
}

function reunionAvailable(character: Character, quest: ReunionQuestConfig) {
  return !!character.player.storyAdventureChoices?.[quest.afterAdventure] && !character.companionAffinity[quest.companionId]?.recruited
}

function recordReunionClue(character: Character, quest: ReunionQuestConfig, source: ClueSource, now: number) {
  const { player } = character
  const state = player.reunions?.[quest.companionId] ?? newReunion()
  if (state.step !== 'CLUES') return 0
  const today = innVisitDay(now)
  state.got = reunionCluesToday(state, today)
  state.day = today
  const gained = gainReunionClues(state, source, now)
  if (gained) {
    const reunions = player.reunions ??= {}
    reunions[quest.companionId] = state
  }
  return gained
}

function enterMap(player: PlayerDTO, mapId: string, now: number) {
  for (const [id, state] of Object.entries(player.reunions ?? {})) {
    const quest = REUNION_QUESTS[id]
    if (quest && state.step === 'WAIT') state.waitMs = reunionWaitTime(state, quest, player.currentMapId, now, player.mapArrivedAt)
  }
  player.currentMapId = mapId
  player.mapArrivedAt = now
  if (mapId !== QUANZHEN_LIBRARY.mapId) player.isGuardingLibrary = false
}

function equippedCompanion(character: Character, id: string) {
  const state = character.companionAffinity[id]
  const config = COMPANIONS[id]
  return state?.recruited && config ? companionView(config, { ...state, form: state.form ?? 'awakened' }) : undefined
}

function collectionBonus(character: Character) {
  return totalCompanionSetBonuses(activeSetBonuses((id) => !!character.companionAffinity[id]?.recruited))
}

function duelFighter(character: Character) {
  return {
    player: character.player, loadout: activeLoadout(character), learnedSkills: character.learnedSkills,
    bonus: collectionBonus(character), companionOf: (id: string) => equippedCompanion(character, id),
  }
}

function defenseMirror(character: Character) {
  const { player, loadout, learnedSkills, bonus, companionOf } = duelFighter(character)
  const companionIds = [loadout.leftCompanionId, loadout.rightCompanionId].flatMap((id) => id && companionOf(id) ? [id] : [])
  const companionStates = Object.fromEntries(companionIds.map((id) => [id, character.companionAffinity[id]]))
  const { id, nickname, avatarId, level, realmTier, stats, currentSectId, sectRank, gaibangBranch,
    graduatedSectIds, betrayedSectIds, bonusHpPct, bonusMp, storySnakeChoice, equipmentAffixes, equipmentForge, trial, chapterOneChampion, openedAcupointIds, qiDeviationUntil } = player
  const frozenPlayer = {
    ...createStarterCharacter({ id, nickname, avatarId }, 0).player,
    level, realmTier, stats, currentSectId, sectRank, gaibangBranch, graduatedSectIds, betrayedSectIds, bonusHpPct, bonusMp, storySnakeChoice, equipmentAffixes, chapterOneChampion,
    openedAcupointIds, qiDeviationUntil,
    equipmentForge: equipmentForge && { iron: 0, stones: 0, items: equipmentForge.items },
    trial: { ...trial, recentDrops: [] },
  }
  const identity = { id, nickname, avatarId, sectId: currentSectId, stance: loadout.stance,
    weaponName: loadout.weaponId ? ITEMS[loadout.weaponId]?.name : undefined, companions: companionIds.map((id) => COMPANIONS[id].name) }
  return { fighter: { player: frozenPlayer, loadout, learnedSkills, bonus }, companionStates, identity }
}

type DefenseMirror = ReturnType<typeof defenseMirror>
type MirrorRankRow = { player_id: string; mirror: DefenseMirror; rating: number; wins: number; matches: number }
type HuashanRow = MirrorRankRow & {
  season_id: number;
  claimed: boolean; honor: string | null; suffix: string; inscription: string;
}
type HuashanRanked = HuashanRow & { rank: number }
const MIRROR_RANK_ORDER = 'rating DESC, wins DESC, player_id'

function mirrorRankEntry(row: MirrorRankRow & { rank: number }): MirrorRankEntryDTO {
  return { ...row.mirror.identity, rating: row.rating, wins: row.wins, matches: row.matches, rank: row.rank }
}

function huashanEntry(row: HuashanRanked, honor?: string): HuashanEntryDTO {
  return { ...mirrorRankEntry(row), honor, suffix: row.suffix, inscription: row.inscription }
}

function rankedHuashan(seasonWhere: string) {
  return `SELECT *, row_number() OVER (PARTITION BY season_id ORDER BY ${MIRROR_RANK_ORDER})::integer AS rank
          FROM huashan_entries WHERE ${seasonWhere}`
}

function mirrorFighter({ fighter, companionStates }: DefenseMirror) {
  return {
    ...fighter,
    companionOf: (id: string) => {
      const state = companionStates[id]
      return state?.recruited && COMPANIONS[id] ? companionView(COMPANIONS[id], { ...state, form: state.form ?? 'awakened' }) : undefined
    },
  }
}

function mirrorDuel(character: Character, attacker: MirrorRankRow, defender: MirrorRankRow, now: number, sceneTitle: string, huashan?: true) {
  const report = simulatePlayerDuel({
    battleId: randomUUID(), sceneTitle, mode: 'PVP_HUASHAN', huashan,
    lineup: [duelFighter(character), mirrorFighter(defender.mirror)],
    environment: battleEnvironmentAt(huashan ? 'huashan_peak' : 'sect_contest', new Date(now)),
  })
  const won = report.winner === 'ALLY'
  const delta = won ? huashanRatingSwing(attacker.rating, defender.rating) : -huashanRatingSwing(defender.rating, attacker.rating)
  return { report, winnerId: won ? attacker.player_id : defender.player_id, delta }
}

async function lockSectContest(client: PoolClient, sectId: string) {
  // ponytail: 每派一把事务锁串行结榜和对战，单服规模增长后再缩小锁的粒度。
  await client.query('SELECT pg_advisory_xact_lock(832, hashtext($1))', [sectId])
  return serverTime(client)
}

async function closeSectContestWeek(client: PoolClient, sectId: string, currentWeek: number) {
  const previous = currentWeek - 1
  const result = await client.query('SELECT 1 FROM sect_contest_results WHERE sect_id = $1 AND week_id = $2', [sectId, previous])
  if (result.rowCount) return
  const { rows: [entry] } = await client.query<Pick<MirrorRankRow, 'player_id'>>(`
    SELECT e.player_id FROM sect_contest_entries e JOIN players p ON p.id = e.player_id
    WHERE e.sect_id = $1 AND e.week_id = $2 AND e.matches > 0 AND NOT e.withdrawn
      AND p.profile->>'currentSectId' = $1 AND (p.profile->>'sectRank')::integer >= $3
    ORDER BY ${MIRROR_RANK_ORDER} LIMIT 1`, [sectId, previous, SECT_CONTEST_MIN_RANK])
  await client.query(`INSERT INTO sect_contest_results (sect_id, week_id, chief_id) VALUES ($1, $2, $3)
    ON CONFLICT (sect_id, week_id) DO NOTHING`, [sectId, previous, entry?.player_id ?? null])
}

async function readSectChief(client: PoolClient, sectId: string, currentWeek: number): Promise<SectChiefDTO | null> {
  const { rows: [chief] } = await client.query<SectChiefDTO>(`
    SELECT p.id, p.nickname, p.profile->>'avatarId' AS "avatarId"
    FROM sect_contest_results r JOIN players p ON p.id = r.chief_id
    WHERE r.sect_id = $1 AND r.week_id = $2 AND p.profile->>'currentSectId' = $1
      AND (p.profile->>'sectRank')::integer >= $3`, [sectId, currentWeek - 1, SECT_CONTEST_MIN_RANK])
  return chief ?? null
}

async function settleSectContest(client: PoolClient, sectId: string) {
  const now = await lockSectContest(client, sectId)
  const weekId = sectContestWeek(now)
  await closeSectContestWeek(client, sectId, weekId)
  return { weekId, now }
}

function bountyReward(player: PlayerDTO, sectId: string) {
  return { silver: BETRAYAL_BOUNTY.silver, sectContrib: player.currentSectId === sectId ? BETRAYAL_BOUNTY.sectContrib : 0 }
}

async function lockHuashanSeason(client: PoolClient, seasonId: number, current: boolean) {
  await client.query('SELECT pg_advisory_xact_lock(831, $1)', [seasonId])
  if ((huashanSeason(await serverTime(client)) === seasonId) !== current) {
    throw new GameError(409, 'HUASHAN_SEASON_CHANGED', '论剑赛季已变，请刷新群豪榜')
  }
}

function idleRewards(character: Character, now: number, rate: ReturnType<typeof cultivationRates>) {
  const earned = (hourly: number) => idleQiNumerator(character.player.lastSettleAt, now, hourly, character.coCultivation)
  const qi = BigInt(character.qiRemainder) + earned(rate.qi)
  const silver = BigInt(character.silverRemainder) + earned(gaibangSilverGain(character.player, rate.silverBasis)) * 28n
  return {
    gainedQi: Number(qi / 3_600_000n),
    gainedSilver: Number(silver / 360_000_000n),
    qiRemainder: Number(qi % 3_600_000n),
    silverRemainder: Number(silver % 360_000_000n),
  }
}

function creditIdle(character: Character, now: number): IdleGain {
  const { player } = character
  const rate = cultivationRates(player, activeLoadout(character), collectionBonus(character).idleQiPct)
  const { gainedQi, gainedSilver, qiRemainder, silverRemainder } = idleRewards(character, now, rate)
  player.qiExp += gainedQi
  player.silver += gainedSilver
  player.lastSettleAt = Math.max(now, player.lastSettleAt)
  character.qiRemainder = qiRemainder
  character.silverRemainder = silverRemainder
  if (character.coCultivation && character.coCultivation.endsAt <= now) character.coCultivation = null
  return { gainedQi, gainedSilver }
}

function settle(character: Character, now: number): IdleGain {
  const gain = creditIdle(character, now)
  const patrol = character.patrolIdleGain
  if (!patrol) return gain
  character.patrolIdleGain = undefined
  return { gainedQi: gain.gainedQi + patrol.gainedQi, gainedSilver: gain.gainedSilver + patrol.gainedSilver }
}

function changeKarma(character: Character, delta: number, now: number) {
  const { player } = character
  const loadout = activeLoadout(character)
  const prior = player.stats.karma
  const karma = karmaAfterEvent(prior, delta, loadout.headId)
  const bonus = collectionBonus(character).idleQiPct
  if (cultivationRate({ ...player, stats: { ...player.stats, karma } }, loadout, bonus) !== cultivationRate(player, loadout, bonus)) settle(character, now)
  player.stats.karma = karma
  return karma - prior
}

/** 惰性结算巡历：进度、章末复战进度与 30 分钟一次的小怪掉落 */
async function settlePatrol(character: Character, now: number, client: PoolClient) {
  const { player } = character
  const { trial } = player
  const encounters = advancePatrol(trial, now, patrolEncounterRate(activeLoadout(character).accId))
  if (encounters === undefined) return false
  const stage = trialStageOf(trial.selectedStageId)
  if (encounters > 0 && stage) {
    forgeMaterials(player, encounters, encounters)
    character.patrolForgeMaterials = encounters
    for (let i = 0; i < encounters; i++) {
      const roll = rollTrialDrop(stage, 'PATROL')
      if (roll) (character.patrolDrops ??= []).push(await awardTrialDrop(character, stage, roll, now, client))
    }
    character.patrolCache = settlePatrolCaches(player, activeLoadout(character), encounters, now)
  }
  return true
}

async function awardTrialDrop(
  character: Character, stage: TrialStageConfig, roll: NonNullable<ReturnType<typeof rollTrialDrop>>, now: number, client: PoolClient,
) {
  const { player } = character
  if (!character.patrolIdleGain && upgradesPatrolYield(player, activeLoadout(character), roll)) {
    character.patrolIdleFrom = player.lastSettleAt
    character.patrolIdleGain = creditIdle(character, now)
  }
  const drop = collectTrialDrop(player, character.ownedItemIds, stage, roll, now)
  if (drop.outcome !== 'DUPLICATE') {
    await client.query(
      `INSERT INTO player_items (player_id, item_id, affix_roll) VALUES ($1, $2, $3)
       ON CONFLICT (player_id, item_id) DO UPDATE SET affix_roll = EXCLUDED.affix_roll`,
      [player.id, drop.id, drop.affixRoll],
    )
  }
  return drop
}

function patrolStatus(character: Character): TrialPatrolStatusDTO {
  const stageId = character.player.trial.selectedStageId
  const hours = character.player.trial.stageHours[String(stageId)] ?? 0
  return {
    stageId,
    hours,
    requiredHours: TRIAL_PATROL_HOURS[stageId] ?? 0,
    encounters: patrolEncounterCount(character.player.trial, stageId),
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
  const { player, revision, loadouts, ownedItemIds, learnedSkills, companionAffinity } = character
  const loadout = activeLoadout(character)
  const bonus = collectionBonus(character)
  const rate = cultivationRates(player, loadout, bonus.idleQiPct)
  const pair = activePair(character, now)
  const { gainedQi, gainedSilver } = idleRewards(character, now, rate)
  return {
    rewardedChapters: character.rewardedChapters,
    revision,
    serverTime: now,
    player: { ...player, qiPerHour: pair ? coCultivationRate(rate.qi) : rate.qi, coCultivatePartner: pair?.partner.nickname ?? null },
    loadouts,
    ownedItemIds,
    pillCount: player.acupointPills?.pozhang_dan ?? 0,
    openedAcupointIds: player.openedAcupointIds,
    pillInventory: player.acupointPills,
    learnedSkills,
    companionAffinity,
    derivedStats: computeDerivedStats(player, loadout, bonus, (id) => equippedCompanion(character, id)),
    soloQiPerHour: rate.qi,
    soloSilverBasis: gaibangSilverGain(player, rate.silverBasis),
    coCultivation: character.coCultivation,
    coCultivationInvite: pendingInvite(character, now),
    shaoshiClears: character.shaoshiClears,
    chongyangClears: character.chongyangClears,
    juxianClears: character.juxianClears,
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
  if (!/^[\p{L}\p{N}·_-]{2,16}$/u.test(nickname)) {
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
    starter.player.maxChapterId = 1
    delete starter.companionAffinity.meichaofeng
    starter.presets[3].leftCompanionId = 'kezhene'
    starter.player.openedAcupointIds = starter.openedAcupointIds
    starter.player.acupointPills = { pozhang_dan: starter.pillCount }
    starter.player.alchemy = { herbs: starter.herbInventory, pity: {}, residue: 0 }
    const { rowCount } = await client.query(
      `INSERT INTO players (id, account_id, nickname, profile, pill_count, last_settle_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (nickname) DO NOTHING`,
      [id, accountId, nickname, profileOf(starter.player), starter.pillCount, now],
    )
    if (!rowCount) throw new GameError(409, 'NICKNAME_TAKEN', '这位侠客的名字已有人用')

    await client.query('INSERT INTO player_items (player_id, item_id) SELECT $1, unnest($2::text[])', [id, starter.ownedItemIds])
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
     rewarded_chapters = $6, revision = $7, co_cultivation_id = $8, shaoshi_clears = $9, chongyang_clears = $10, juxian_clears = $11 WHERE id = $1`,
    [player.id, profileOf(player), player.lastSettleAt, character.qiRemainder, character.silverRemainder,
      character.rewardedChapters, character.revision, character.coCultivation?.id ?? null, character.shaoshiClears, character.chongyangClears, character.juxianClears],
  )
}

async function writeAction<T>(request: FastifyRequest, apply: ApplyAction<T>): Promise<{
  response: GameAction<T>
  updates: PlayerSnapshot[]
  replayed?: true
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
          return { response: { snapshot: snapshot(character, now), result: receipt.result }, updates: [], replayed: true as const }
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
    if (id == null) continue
    if (typeof id !== 'string' || !character.ownedItemIds.includes(id)) throw invalid('这件装备还没拿到')
    const item = ITEMS[id]
    if (item?.slot !== slot) throw invalid(`这件装备不能放进${label}格`)
    if (!meetsItemStatRequirement(item, character.player.stats)) {
      throw invalid(`装备「${item.name}」需要${item.reqStat?.label}`)
    }
    checked[field] = id
  }
  if (preset.gearSkillId != null) {
    if (typeof preset.gearSkillId !== 'string') throw invalid('请选择已穿戴装备的特技')
    checked.gearSkillId = preset.gearSkillId
    if (!equippedGearSkill(checked)) throw invalid('请选择已穿戴装备的特技')
  }
  const hiddenWeapons = preset.hiddenWeaponIds ?? []
  if (!Array.isArray(hiddenWeapons) || hiddenWeapons.length > hiddenWeaponCapacity(checked) ||
    new Set(hiddenWeapons).size !== hiddenWeapons.length ||
    hiddenWeapons.some((id) => !unlockedHiddenWeapons(character.player).some((weapon) => weapon.id === id))) {
    throw invalid('请选择已解锁的暗器，并检查腰带的携带上限')
  }
  if (hiddenWeapons.length) checked.hiddenWeaponIds = hiddenWeapons
  if (preset.titleId != null) {
    const title = JIANGHU_TITLES.find(({ id }) => id === preset.titleId)
    if (!title) throw invalid('请选择已有的江湖称号')
    checked.titleId = title.id
  }
  for (const [field, category] of [['battlePillId', 'BATTLE_PILL'], ['weaponVenomId', 'WEAPON_VENOM']] as const) {
    const id = preset[field]
    if (id == null) continue
    if (typeof id !== 'string' || MEDICINES[id]?.category !== category ||
      ((character.player.battleMedicines?.[id] ?? 0) <= 0 && character.loadouts[idx - 1][field] !== id)) {
      throw invalid('请选择药囊对应栏位里已有的药物')
    }
    checked[field] = id
  }
  const allocated = new Set(Object.values(EQUIP_SLOT_META).map(({ field }) => checked[field]))
  function companionItem(companionId: string, slot: PersonalEquipSlot, id: unknown) {
    if (companionId !== leftCompanionId && companionId !== rightCompanionId) throw invalid('请先让这位伙伴上阵')
    const owner = equippedCompanion(character, companionId)
    const item = typeof id === 'string' ? ITEMS[id] : undefined
    if (!owner || item?.slot !== slot || !character.ownedItemIds.includes(item.id) || !canEquipCompanionItem(owner, item)) {
      throw invalid('这位伙伴无法穿戴该装备')
    }
    if (allocated.has(item.id)) throw invalid('同一件装备只能穿戴给一人')
    allocated.add(item.id)
    return item.id
  }
  if (preset.companionWeapons !== undefined) {
    const entries: [string, string][] = []
    for (const [companionId, id] of Object.entries(objectBody(preset.companionWeapons))) {
      entries.push([companionId, companionItem(companionId, 'WEAPON', id)])
    }
    if (entries.length) checked.companionWeapons = Object.fromEntries(entries)
  }
  if (preset.companionEquipment !== undefined) {
    const entries: [string, CompanionWear][] = []
    for (const [companionId, value] of Object.entries(objectBody(preset.companionEquipment))) {
      if (companionId !== leftCompanionId && companionId !== rightCompanionId) throw invalid('请先让这位伙伴上阵')
      const wear: CompanionWear = {}
      for (const [slot, id] of Object.entries(objectBody(value))) {
        if (slot === 'RELIC' || slot === 'WEAPON' || !Object.hasOwn(EQUIP_SLOT_META, slot)) throw invalid('伙伴的装备部位有误')
        const position = slot as keyof CompanionWear
        wear[position] = companionItem(companionId, position, id)
      }
      if (Object.keys(wear).length) entries.push([companionId, wear])
    }
    if (entries.length) checked.companionEquipment = Object.fromEntries(entries)
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
  const duelInvites = new Map<string, DuelInviteDTO>()
  const duelTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const pendingDuelPlayers = new Set<string>()
  function clearDuelInvite(invite: DuelInviteDTO) {
    if (duelInvites.get(invite.inviter.id)?.id !== invite.id) return
    clearTimeout(duelTimers.get(invite.id))
    duelTimers.delete(invite.id)
    for (const member of [invite.inviter, invite.invitee]) {
      duelInvites.delete(member.id)
      rooms.sendToPlayer(member.id, { event: 'DUEL_INVITE', data: null })
    }
  }
  function sendDuelInvite(invite: DuelInviteDTO) {
    for (const member of [invite.inviter, invite.invitee]) {
      duelInvites.set(member.id, invite)
      rooms.sendToPlayer(member.id, { event: 'DUEL_INVITE', data: invite })
    }
    const timer = setTimeout(() => clearDuelInvite(invite), Math.max(0, invite.expiresAt - Date.now()))
    timer.unref()
    duelTimers.set(invite.id, timer)
  }
  rooms.onJoin((playerId) => {
    const invite = duelInvites.get(playerId)
    if (invite && invite.expiresAt > Date.now() && rooms.isOnlineInMap(playerId, invite.mapId)) {
      return { event: 'DUEL_INVITE', data: invite }
    }
  })
  app.addHook('onClose', async () => {
    for (const timer of duelTimers.values()) clearTimeout(timer)
  })

  app.get('/api/v1/player/me', async (request) => getSnapshot((await requireSession(request)).accountId))
  app.post('/api/v1/player/create', async (request) => createPlayer((await requireSession(request)).accountId, request.body))

  app.get('/api/v1/trial/champion', async (request): Promise<{ statue: ChapterOneStatueDTO | null }> => {
    await requireSession(request)
    return transaction(async (client) => {
      const { rows: [row] } = await client.query<Omit<ChapterOneStatueDTO, 'wonAt'> & { wonAt: string }>(`
        SELECT players.id AS "playerId", players.nickname, players.profile ->> 'avatarId' AS "avatarId", statue.won_at AS "wonAt"
        FROM chapter_one_statue statue JOIN players ON players.id = statue.player_id
        WHERE statue.chapter = 1`)
      return { statue: row ? { ...row, wonAt: Number(row.wonAt) } : null }
    }, true)
  })

  async function respond<T>(request: FastifyRequest, apply: ApplyAction<T>) {
    const { response, updates } = await writeAction(request, apply)
    for (const updated of updates) rooms.publish(updated)
    return response
  }

  app.get('/api/v1/huashan', async (request): Promise<HuashanBoardDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const character = await readCharacter(client, accountId)
      const now = await serverTime(client)
      const season = huashanSeason(now)
      const id = character.player.id
      const current = rankedHuashan('season_id = $1')
      const { rows } = await client.query<HuashanRanked>(`WITH ranked AS (${current})
        SELECT * FROM ranked WHERE rank <= 100 OR player_id = $2 ORDER BY rank`, [season, id])
      const self = rows.find((row) => row.player_id === id)
      const { rows: opponents } = await client.query<HuashanRanked>(`WITH ranked AS (${current})
        SELECT * FROM ranked WHERE player_id <> $2 ORDER BY abs(rating - $3), rank LIMIT 12`, [season, id, self?.rating ?? 1000])
      const { rows: prior } = await client.query<HuashanRanked>(`WITH ranked AS (${rankedHuashan(
        'season_id < $1 AND matches > 0 AND (season_id IN (SELECT season_id FROM huashan_entries WHERE player_id = $2 AND NOT claimed AND matches > 0) OR season_id = (SELECT max(season_id) FROM huashan_entries WHERE season_id < $1 AND matches > 0))',
      )}) SELECT * FROM ranked WHERE (player_id = $2 AND NOT claimed AND matches > 0) OR rank <= 5 ORDER BY season_id DESC, rank`, [season, id])
      const lastSeason = prior.find((row) => row.rank <= 5 && row.matches > 0)?.season_id ?? null
      const awards = prior.filter((row) => row.player_id === id && !row.claimed && row.matches > 0)
      const defaultHonors = (entry: HuashanRanked) => {
        const taken = prior.filter((row) => row.season_id === entry.season_id && row.honor).map((row) => row.honor)
        return entry.rank <= 5 ? HUASHAN_HONORS.filter((honor) => !taken.includes(honor)) : []
      }
      const greats = prior.filter((row) => row.season_id === lastSeason && row.rank <= 5)
      const available = HUASHAN_HONORS.filter((honor) => !greats.some((row) => row.honor === honor))
      return {
        seasonId: season, endsAt: huashanSeasonEndsAt(season),
        self: self ? huashanEntry(self) : null,
        leaderboard: rows.filter((row) => row.rank <= 100).map((row) => huashanEntry(row)),
        opponents: opponents.map((row) => huashanEntry(row)), lastSeason,
        fiveGreats: greats.map((row) => huashanEntry(row, row.honor ?? available.shift())),
        awards: awards.map((row) => ({ seasonId: row.season_id, rank: row.rank, availableHonors: defaultHonors(row) })),
        canRespect: lastSeason !== null && character.player.huashanRespectDay !== huashanDay(now),
      }
    }, true)
  })

  app.post('/api/v1/huashan', (request) => respond<HuashanResult>(request, async (character, now, client, readRelated) => {
    const { action, seasonId, targetPlayerId, honor, suffix, inscription } = objectBody(request.body)
    if (typeof seasonId !== 'number' || !Number.isInteger(seasonId)) throw new GameError(400, 'HUASHAN_INVALID_SEASON', '请选择一届华山论剑')
    const currentSeason = huashanSeason(now)
    const id = character.player.id
    const currentAction = action === 'mirror' || action === 'challenge'
    if (currentAction ? seasonId !== currentSeason : seasonId >= currentSeason) {
      throw new GameError(409, 'HUASHAN_SEASON_CHANGED', '论剑赛季已变，请刷新群豪榜')
    }

    if (action === 'mirror') {
      await lockHuashanSeason(client, seasonId, true)
      await client.query(`INSERT INTO huashan_entries (season_id, player_id, mirror) VALUES ($1, $2, $3)
        ON CONFLICT (season_id, player_id) DO UPDATE SET mirror = EXCLUDED.mirror`, [seasonId, id, defenseMirror(character)])
      return { result: { action }, changed: false }
    }

    if (action === 'challenge') {
      if (typeof targetPlayerId !== 'string' || !UUID.test(targetPlayerId)) {
        throw new GameError(400, 'HUASHAN_INVALID_TARGET', '请选择一名榜上侠客')
      }
      const target = targetPlayerId.toLowerCase()
      await readRelated([target])
      await lockHuashanSeason(client, seasonId, true)
      const { rows: entries } = await client.query<HuashanRow>(`SELECT * FROM huashan_entries
        WHERE season_id = $1 AND player_id = ANY($2::uuid[]) ORDER BY player_id FOR UPDATE`, [seasonId, [id, target]])
      const attacker = entries.find((entry) => entry.player_id === id)
      const defender = entries.find((entry) => entry.player_id === target)
      if (!attacker || !defender) throw new GameError(409, 'HUASHAN_MIRROR_REQUIRED', '请先登记镜像，并选择本届在榜对手')
      const { report, winnerId, delta } = mirrorDuel(character, attacker, defender, now, '华山论剑 · 镜像挑战', true)
      await client.query(`UPDATE huashan_entries SET matches = matches + 1,
        wins = wins + CASE WHEN player_id = $3 THEN 1 ELSE 0 END,
        rating = rating + CASE WHEN player_id = $2 THEN $4::integer ELSE -$4::integer END
        WHERE season_id = $1 AND player_id = ANY($5::uuid[])`, [seasonId, id, winnerId, delta, [id, target]])
      return { result: { action, report, rating: attacker.rating + delta, ratingDelta: delta }, changed: false }
    }

    if (action === 'respect') {
      const { rows: [recent] } = await client.query<{ season_id: number }>(
        'SELECT max(season_id) AS season_id FROM huashan_entries WHERE season_id < $1 AND matches > 0', [currentSeason],
      )
      if (seasonId !== recent.season_id || typeof targetPlayerId !== 'string' || !UUID.test(targetPlayerId)) {
        throw new GameError(409, 'HUASHAN_FIVE_GREAT_REQUIRED', '请选择最近一届的五绝')
      }
      const target = targetPlayerId.toLowerCase()
      await lockHuashanSeason(client, seasonId, false)
      const { rowCount } = await client.query(`SELECT 1 FROM (${rankedHuashan('season_id = $1 AND matches > 0')}) ranked
        WHERE player_id = $2 AND rank <= 5`, [seasonId, target])
      if (!rowCount || target === id) throw new GameError(409, 'HUASHAN_FIVE_GREAT_REQUIRED', '请选择另一位五绝侠客')
      const today = huashanDay(now)
      if (character.player.huashanRespectDay === today) throw new GameError(409, 'HUASHAN_ALREADY_RESPECTED', '今日已抱拳论道')
      character.player.huashanRespectDay = today
      character.player.qiExp += HUASHAN_RESPECT_QI
      return { result: { action, qiExp: HUASHAN_RESPECT_QI, silver: 0 }, changed: true }
    }

    if (action !== 'claim' && action !== 'inscription') throw new GameError(400, 'HUASHAN_INVALID_ACTION', '请选择论剑操作')
    await lockHuashanSeason(client, seasonId, false)
    const { rows: [entry] } = await client.query<HuashanRanked>(`SELECT * FROM (${rankedHuashan('season_id = $1 AND matches > 0')}) ranked
      WHERE player_id = $2`, [seasonId, id])
    if (!entry) throw new GameError(409, 'HUASHAN_NO_AWARD', '该赛季需要完成至少一场论剑')
    const textValue = (value: unknown, max: number) => {
      if (value === undefined) return ''
      if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value) || [...value.trim()].length > max) {
        throw new GameError(400, 'HUASHAN_INVALID_INSCRIPTION', '后缀最多 12 字，判词最多 60 字')
      }
      return value.trim()
    }
    if (action === 'inscription') {
      if (!entry.honor) throw new GameError(409, 'HUASHAN_HONOR_REQUIRED', '领取五绝封号后可题写判词')
      await client.query('UPDATE huashan_entries SET suffix = $3, inscription = $4 WHERE season_id = $1 AND player_id = $2',
        [seasonId, id, textValue(suffix, 12), textValue(inscription, 60)])
      return { result: { action }, changed: false }
    }
    if (entry.claimed) throw new GameError(409, 'HUASHAN_ALREADY_CLAIMED', '该届论剑奖励已领取')
    let selectedHonor: string | null = null
    if (entry.rank <= 5) {
      const { rows: taken } = await client.query<{ honor: string }>(
        'SELECT honor FROM huashan_entries WHERE season_id = $1 AND honor IS NOT NULL', [seasonId],
      )
      const choices = HUASHAN_HONORS.filter((choice) => !taken.some((row) => row.honor === choice))
      if (honor !== undefined && !choices.some((choice) => choice === honor)) {
        throw new GameError(409, 'HUASHAN_HONOR_TAKEN', '这个封号已有人选，请另选一个')
      }
      selectedHonor = choices.find((choice) => choice === honor) ?? choices.find((choice) => choice === HUASHAN_HONORS[entry.rank - 1]) ?? choices[0] ?? null
    }
    await client.query(`UPDATE huashan_entries SET claimed = true, honor = $3, suffix = $4, inscription = $5
      WHERE season_id = $1 AND player_id = $2`, [seasonId, id, selectedHonor, selectedHonor ? textValue(suffix, 12) : '', selectedHonor ? textValue(inscription, 60) : ''])
    const award = huashanRankReward(entry.rank)
    award.silver = gaibangSilverGain(character.player, award.silver)
    character.player.qiExp += award.qiExp
    character.player.silver += award.silver
    return { result: { action, ...award }, changed: true }
  }))

  app.get('/api/v1/sect/contest', async (request): Promise<SectContestBoardDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const { rows: [row] } = await client.query<{ id: string; sect_id: string | null }>(
        `SELECT id, profile->>'currentSectId' AS sect_id FROM players WHERE account_id = $1 FOR SHARE`, [accountId],
      )
      if (!row) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
      const { id, sect_id: sectId } = row
      if (!sectId) throw new GameError(409, 'SECT_CONTEST_MEMBERSHIP_REQUIRED', '拜入师门后可查看本门演武')
      const { weekId } = await settleSectContest(client, sectId)
      const chief = await readSectChief(client, sectId, weekId)
      const { rows } = await client.query<MirrorRankRow & { rank: number }>(`WITH ranked AS (
        SELECT *, row_number() OVER (ORDER BY ${MIRROR_RANK_ORDER})::integer AS rank
        FROM sect_contest_entries WHERE sect_id = $1 AND week_id = $2 AND NOT withdrawn
      ) SELECT * FROM ranked WHERE rank <= 100 OR player_id = $3 ORDER BY rank`, [sectId, weekId, id])
      const self = rows.find((row) => row.player_id === id)
      return { sectId, weekId, endsAt: sectContestEndsAt(weekId), chief,
        self: self ? mirrorRankEntry(self) : null, leaderboard: rows.filter((row) => row.rank <= 100).map(mirrorRankEntry) }
    })
  })

  app.post('/api/v1/sect/contest', (request) => respond<SectContestResult>(request, async (character, _now, client, readRelated) => {
    const { action, sectId, weekId, targetPlayerId } = objectBody(request.body)
    const { id, currentSectId, sectRank } = character.player
    const sect = SECTS.find(({ id }) => id === sectId)
    if (!sect || sect.id !== currentSectId || sectRank < SECT_CONTEST_MIN_RANK) {
      throw new GameError(409, 'SECT_CONTEST_RANK_REQUIRED', '本门三阶及以上弟子可参加演武')
    }
    if (typeof weekId !== 'number' || !Number.isInteger(weekId) || (action !== 'mirror' && action !== 'challenge')) {
      throw new GameError(400, 'SECT_CONTEST_INVALID_ACTION', '请选择本届演武操作')
    }
    let target: string | undefined
    if (action === 'challenge') {
      if (typeof targetPlayerId !== 'string' || !UUID.test(targetPlayerId) || targetPlayerId.toLowerCase() === id) {
        throw new GameError(400, 'SECT_CONTEST_INVALID_TARGET', '请选择另一位同门弟子')
      }
      target = targetPlayerId.toLowerCase()
      const [other] = await readRelated([target])
      if (other.player.currentSectId !== sect.id || other.player.sectRank < SECT_CONTEST_MIN_RANK) {
        throw new GameError(409, 'SECT_CONTEST_TARGET_INELIGIBLE', '只能挑战本门三阶及以上弟子')
      }
    }

    const now = await lockSectContest(client, sect.id)
    if (weekId !== sectContestWeek(now)) throw new GameError(409, 'SECT_CONTEST_WEEK_CHANGED', '演武已换届，请刷新周榜')
    await closeSectContestWeek(client, sect.id, weekId)
    if (action === 'mirror') {
      const update = await client.query(`INSERT INTO sect_contest_entries (sect_id, week_id, player_id, mirror) VALUES ($1, $2, $3, $4)
        ON CONFLICT (sect_id, week_id, player_id) DO UPDATE SET mirror = EXCLUDED.mirror WHERE NOT sect_contest_entries.withdrawn`,
      [sect.id, weekId, id, defenseMirror(character)])
      if (!update.rowCount) throw new GameError(409, 'SECT_CONTEST_WITHDRAWN', '离派后已退出本届演武，下届可重新登记')
      return { result: { action }, changed: false }
    }

    const { rows: entries } = await client.query<MirrorRankRow>(`SELECT player_id, mirror, rating, wins, matches
      FROM sect_contest_entries WHERE sect_id = $1 AND week_id = $2 AND NOT withdrawn AND player_id = ANY($3::uuid[])`,
    [sect.id, weekId, [id, target]])
    const attacker = entries.find((entry) => entry.player_id === id)
    const defender = entries.find((entry) => entry.player_id === target)
    if (!attacker || !defender) throw new GameError(409, 'SECT_CONTEST_MIRROR_REQUIRED', '请先登记镜像，并选择本届在榜同门')
    const { report, winnerId, delta } = mirrorDuel(character, attacker, defender, now, `${sect.name} · 门派演武`)
    await client.query(`UPDATE sect_contest_entries SET matches = matches + 1,
      wins = wins + CASE WHEN player_id = $4 THEN 1 ELSE 0 END,
      rating = rating + CASE WHEN player_id = $3 THEN $5::integer ELSE -$5::integer END
      WHERE sect_id = $1 AND week_id = $2 AND player_id = ANY($6::uuid[])`, [sect.id, weekId, id, winnerId, delta, [id, target]])
    return { result: { action, report, rating: attacker.rating + delta, ratingDelta: delta }, changed: false }
  }))

  app.post('/api/v1/cultivate/settle', (request) => respond(request, async (character, now) => {
    let changed = now > character.player.lastSettleAt || !!(character.coCultivation && character.coCultivation.endsAt <= now)
    const reunionClues: NonNullable<IdleGain['reunionClues']> = {}
    if (now - (character.patrolIdleFrom ?? character.player.lastSettleAt) >= 3_600_000) {
      for (const quest of Object.values(REUNION_QUESTS)) {
        if (!reunionAvailable(character, quest)) continue
        const gained = recordReunionClue(character, quest, 'closed', now)
        if (gained) {
          reunionClues[quest.companionId] = gained
          changed = true
        }
      }
    }
    const gain = settle(character, now)
    return { result: { ...gain, drops: character.patrolDrops, forgeMaterials: character.patrolForgeMaterials, patrolCache: character.patrolCache, reunionClues }, changed }
  }))

  app.post('/api/v1/equipment/forge', (request) => respond<ForgeResult>(request, async (character, now, client) => {
    const { action, itemId, lock } = objectBody(request.body)
    if (typeof itemId !== 'string' || (action !== 'temper' && action !== 'salvage' && action !== 'reforge') ||
      (lock !== undefined && (action !== 'reforge' || (lock !== 'primary' && lock !== 'secondary')))) {
      throw new GameError(400, 'INVALID_FORGE_ACTION', '请选择装备和精铸操作')
    }
    const index = character.ownedItemIds.indexOf(itemId)
    const item = index >= 0 ? ITEMS[itemId] : undefined
    if (!item) throw new GameError(404, 'FORGE_ITEM_NOT_OWNED', '背包里没有这件装备')
    const input: ForgeInput = action === 'reforge' ? { action, itemId, lock } : { action, itemId }
    const result = forgeEquipment(character.player, item, input, {
      presets: character.loadouts, now, settle: () => { settle(character, now) },
    })
    if ('error' in result) throw new GameError(409, 'FORGE_UNAVAILABLE', result.error)
    if (result.action === 'salvage') {
      await client.query('DELETE FROM player_items WHERE player_id = $1 AND item_id = $2', [character.player.id, itemId])
      character.ownedItemIds.splice(index, 1)
    }
    if (result.action === 'reforge' && lock !== 'primary') {
      await client.query('UPDATE player_items SET affix_roll = $3 WHERE player_id = $1 AND item_id = $2',
        [character.player.id, itemId, result.affixRoll])
    }
    return { result, changed: true }
  }))

  app.post('/api/v1/cultivate/progress', (request) => respond<CultivationResult>(request, async (character, now) => {
    const { action, pointId, pillId, usePill, expectedTier } = objectBody(request.body)
    const player = character.player
    if (expectedTier !== player.realmTier) throw new GameError(409, 'REALM_CHANGED', '境界已变化，请按当前经脉操作')
    const preset = activeLoadout(character)
    const stock = player.acupointPills ??= {}
    const progress = (input: Parameters<typeof cultivatePlayer>[3]) =>
      cultivatePlayer(player, preset, stock, input, now, Math.random, () => { settle(character, now) })
    const result = action === 'level' ? progress({ action })
      : action === 'pierce' && typeof pointId === 'string' && typeof usePill === 'boolean' ? progress({ action, pointId, usePill })
        : action === 'pill' && typeof pillId === 'string' && Object.hasOwn(MEDICINES, pillId) && MEDICINES[pillId].category === 'ACUPOINT_PILL'
          ? progress({ action, pillId })
          : action === 'break' && typeof usePill === 'boolean' ? progress({ action, usePill }) : undefined
    if (!result) throw new GameError(400, 'INVALID_CULTIVATION_ACTION', '请选择有效的修行操作')
    if ('error' in result) throw new GameError(409, 'CULTIVATION_UNAVAILABLE', result.error)
    return { result, changed: true }
  }))

  async function grantSkill(client: PoolClient, character: Character, id: string) {
    const skill = SKILLS[id]
    if (!skill || character.learnedSkills[id]) return
    await client.query('INSERT INTO player_skills VALUES ($1, $2, 1)', [character.player.id, id])
    character.learnedSkills[id] = 1
    return { id, name: skill.name, tier: skill.tier }
  }

  async function grantItems(client: PoolClient, character: Character, ids: readonly string[]) {
    const added = []
    for (const id of ids) {
      if (!ITEMS[id] || character.ownedItemIds.includes(id)) continue
      const { rowCount } = await client.query('INSERT INTO player_items (player_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [character.player.id, id])
      if (rowCount) {
        character.ownedItemIds.push(id)
        added.push(id)
      }
    }
    return added
  }

  app.get('/api/v1/sect/library', async (request): Promise<LibraryStatusDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const { rows: [player] } = await client.query<{ id: string }>('SELECT id FROM players WHERE account_id = $1', [accountId])
      if (!player) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
      const { rows: [availability] } = await client.query<{ available: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM quanzhen_library_guards g JOIN players p ON p.id = g.player_id
          WHERE p.profile->>'isGuardingLibrary' = 'true' AND p.id <> $1) AS available`, [player.id])
      const { rows } = await client.query<{
        battleId: string; occurredAt: string; intruder: string; won: boolean; silver: number | null; sectContrib: number | null
      }>(`
        SELECT battle_id AS "battleId", occurred_at AS "occurredAt", report->'units'->0->>'name' AS intruder,
          report->>'winner' = 'ENEMY' AS won, (report->'rewards'->>'silver')::int AS silver,
          (report->'rewards'->>'sectContrib')::int AS "sectContrib"
        FROM quanzhen_library_reports WHERE guard_id = $1
        ORDER BY occurred_at DESC, battle_id LIMIT 20`, [player.id])
      return {
        guardAvailable: availability.available,
        reports: rows.map((row) => ({ ...row, occurredAt: Number(row.occurredAt), silver: row.silver ?? 0, sectContrib: row.sectContrib ?? 0 })),
      }
    }, true)
  })

  app.get<{ Params: { battleId: string } }>('/api/v1/sect/library/reports/:battleId', async (request): Promise<BattleReportDTO> => {
    const { accountId } = await requireSession(request)
    const { battleId } = request.params
    if (!UUID.test(battleId)) throw new GameError(404, 'LIBRARY_REPORT_NOT_FOUND', '找不到这份护山战报')
    return transaction(async (client) => {
      const { rows: [entry] } = await client.query<{ report: BattleReportDTO }>(`
        SELECT r.report FROM quanzhen_library_reports r JOIN players p ON p.id = r.guard_id
        WHERE p.account_id = $1 AND r.battle_id = $2`, [accountId, battleId])
      if (!entry) throw new GameError(404, 'LIBRARY_REPORT_NOT_FOUND', '找不到这份护山战报')
      return entry.report
    }, true)
  })

  app.post('/api/v1/sect/library', (request) => respond<LibraryResult>(request, async (character, now, client, readRelated) => {
    const { action, enabled, skillId } = objectBody(request.body)
    const { player } = character
    if (action === 'guard') {
      if (typeof enabled !== 'boolean') throw new GameError(400, 'LIBRARY_ACTION_INVALID', '请选择开始或结束值守')
      if (player.currentSectId !== 'quanzhen' || (enabled && (player.currentMapId !== QUANZHEN_LIBRARY.mapId || player.mapJourney))) {
        throw new GameError(409, 'LIBRARY_GUARD_REQUIRED', '全真弟子抵达终南后山后才能登记值守')
      }
      if (enabled) await client.query(`INSERT INTO quanzhen_library_guards (player_id, mirror) VALUES ($1, $2)
        ON CONFLICT (player_id) DO UPDATE SET mirror = EXCLUDED.mirror`, [player.id, defenseMirror(character)])
      const changed = player.isGuardingLibrary !== enabled
      player.isGuardingLibrary = enabled
      return { result: { action, enabled }, changed }
    }
    if (action !== 'steal' || typeof skillId !== 'string' || !QUANZHEN_LIBRARY.skills.some((id) => id === skillId)) {
      throw new GameError(400, 'LIBRARY_ACTION_INVALID', '请选择值守或要偷学的武功')
    }
    if (player.currentMapId !== QUANZHEN_LIBRARY.mapId || player.mapJourney || (player.currentSectId && player.currentSectId !== 'baituo')) {
      throw new GameError(409, 'LIBRARY_STEAL_REQUIRED', '散人或白驼弟子抵达终南后山后才能潜入')
    }
    if (character.learnedSkills[skillId]) throw new GameError(409, 'LIBRARY_SKILL_KNOWN', '你已习得这门武功')
    if (player.silver < QUANZHEN_LIBRARY.guardSilver) {
      throw new GameError(409, 'SILVER_INSUFFICIENT', `潜入需备足 ${QUANZHEN_LIBRARY.guardSilver.toLocaleString()} 两纹银`)
    }

    // ponytail: 单服内测按角色 ID 选一位值守者。值守人数增长后再按战力匹配。
    const { rows: [candidate] } = await client.query<{ player_id: string }>(`
      SELECT g.player_id FROM quanzhen_library_guards g JOIN players p ON p.id = g.player_id
      WHERE p.profile->>'isGuardingLibrary' = 'true' AND g.player_id <> $1
      ORDER BY g.player_id LIMIT 1`, [player.id])
    if (!candidate) throw new GameError(409, 'LIBRARY_NO_GUARD', '现在无人值守，稍后再来')
    const [guard] = await readRelated([candidate.player_id])
    if (!guard.player.isGuardingLibrary || guard.player.currentSectId !== 'quanzhen' || guard.player.currentMapId !== QUANZHEN_LIBRARY.mapId || guard.player.mapJourney) {
      throw new GameError(409, 'LIBRARY_GUARD_CHANGED', '值守者已换班，请再试一次')
    }
    const { rows: [entry] } = await client.query<{ mirror: DefenseMirror }>(
      'SELECT mirror FROM quanzhen_library_guards WHERE player_id = $1', [guard.player.id],
    )
    if (!entry) throw new GameError(409, 'LIBRARY_GUARD_CHANGED', '值守者已换班，请再试一次')

    const report = simulatePlayerDuel({
      battleId: randomUUID(), sceneTitle: '全真藏经阁 · 潜入偷师', mode: 'PVP_HUASHAN',
      lineup: [duelFighter(character), mirrorFighter(entry.mirror)],
      environment: battleEnvironmentAt(QUANZHEN_LIBRARY.mapId, new Date(now)),
    })
    const won = report.winner === 'ALLY'
    const defense: BattleReportDTO = { ...report, sceneTitle: '全真藏经阁 · 护山值守', perspective: 'ENEMY', rewards: undefined }
    if (won) {
      const skill = (await grantSkill(client, character, skillId))!
      report.rewards = { qiExp: 0, silver: 0, items: [skill] }
    } else {
      player.silver -= QUANZHEN_LIBRARY.guardSilver
      guard.player.silver += QUANZHEN_LIBRARY.guardSilver
      guard.player.sectContribution += QUANZHEN_LIBRARY.guardContribution
      defense.rewards = { qiExp: 0, silver: QUANZHEN_LIBRARY.guardSilver, sectContrib: QUANZHEN_LIBRARY.guardContribution }
    }
    report.events.push({ round: report.events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: won ? 'ALLY_MAIN' : 'ENEMY_MAIN', segments: [
      { type: 'tag', text: won ? '潜入得手' : '护山立功', tone: 'gold' },
      { type: 'text', text: won ? ` ${player.nickname}取得《${SKILLS[skillId].name}》。` :
        ` ${guard.player.nickname}击退${player.nickname}，缴获 ${QUANZHEN_LIBRARY.guardSilver.toLocaleString()} 两纹银，门派贡献 +${QUANZHEN_LIBRARY.guardContribution}。` },
    ] })
    await client.query(`INSERT INTO quanzhen_library_reports (battle_id, guard_id, occurred_at, report) VALUES ($1, $2, $3, $4)`,
      [report.battleId, guard.player.id, now, defense])
    // 守方失守时也更新修订号，让在线守方能看到新增的战报。
    return { result: { action, report }, changed: true, related: [guard] }
  }))

  async function grantStoryReward(client: PoolClient, character: Character, reward: Reward, now: number) {
    const { player } = character
    const qiExp = reward.qiExp ?? 0
    const silver = gaibangSilverGain(player, reward.silver ?? 0)
    const items: NonNullable<NonNullable<BattleReportDTO['rewards']>['items']> = []
    const companions: string[] = []
    const deltas: string[] = []
    const addDelta = (label: string, amount: number, suffix = '') => {
      if (amount) deltas.push(`${label} ${amount > 0 ? '+' : '−'}${Math.abs(amount).toLocaleString()}${suffix}`)
    }

    if (reward.stats || reward.affinity) settle(character, now)
    for (const [stat, amount] of Object.entries(reward.stats ?? {}) as [StatKey, number][]) {
      if (stat === 'karma') addDelta(STAT_LABEL[stat], changeKarma(character, amount, now))
      else {
        player.stats[stat] += amount
        addDelta(STAT_LABEL[stat], amount)
      }
    }
    if (reward.bonusHpPct) {
      player.bonusHpPct = (player.bonusHpPct ?? 0) + reward.bonusHpPct
      addDelta('气血上限', reward.bonusHpPct, '%')
    }
    if (reward.pills) {
      const pills = player.acupointPills ??= {}
      pills.pozhang_dan = (pills.pozhang_dan ?? 0) + reward.pills
      addDelta(MEDICINES.pozhang_dan.name, reward.pills)
    }
    if (reward.flags?.length) player.storyFlags = [...new Set([...(player.storyFlags ?? []), ...reward.flags])]
    player.qiExp += qiExp
    player.silver += silver

    for (const id of reward.skills ?? []) {
      const grant = await grantSkill(client, character, id)
      if (grant) items.push(grant)
    }
    for (const [id, amount] of Object.entries(reward.skillBoost ?? {})) {
      const skill = SKILLS[id]
      if (!skill) continue
      const before = character.learnedSkills[id] ?? 0
      const mastery = Math.min(MAX_SKILL_MASTERY, before + amount)
      if (mastery === before) continue
      await client.query(`INSERT INTO player_skills VALUES ($1, $2, $3)
        ON CONFLICT (player_id, skill_id) DO UPDATE SET mastery = EXCLUDED.mastery`, [player.id, id, mastery])
      character.learnedSkills[id] = mastery
      addDelta(`《${skill.name}》参悟`, mastery - before, ' 重')
      if (!before) items.push({ id, name: skill.name, tier: skill.tier })
    }
    for (const id of await grantItems(client, character, reward.items ?? [])) {
      items.push({ id, name: ITEMS[id].name, tier: ITEMS[id].tier })
    }

    const flags = storyProgressFlags(character.rewardedChapters, player.storyFlags)
    for (const [id, amount] of Object.entries(reward.affinity ?? {})) {
      const companion = COMPANIONS[id]
      if (!companion) continue
      const state = character.companionAffinity[id] ??= { affinity: 0, recruited: false, taught: false, form: 'base' }
      const before = state.affinity
      state.met = true
      state.affinity = Math.min(1000, before + amount)
      if (!state.recruited && state.affinity >= 100 && (!companion.recruitFlag || flags.includes(companion.recruitFlag))) {
        state.recruited = true
        companions.push(id)
      }
      addDelta(`${companion.name}好感`, state.affinity - before)
      await client.query(`INSERT INTO player_companions VALUES ($1, $2, $3)
        ON CONFLICT (player_id, companion_id) DO UPDATE SET state = EXCLUDED.state`, [player.id, id, state])
    }

    const narration: RichSegment[] = [{ type: 'tag', text: reward.tag, tone: reward.tone }, { type: 'text', text: ` ${reward.text}` }]
    if (deltas.length) narration.push({ type: 'text', text: `（${deltas.join('，')}）` })
    return { rewards: { qiExp, silver, items, companions }, narration }
  }

  function storyBattle(character: Character, now: number, sceneTitle: string, battle: AdventureBattle, retreat: boolean, mapId = character.player.currentMapId) {
    const report = simulateServerBattle({
      ...duelFighter(character), ...battle, sceneTitle, mode: 'SOLO_STORY', tryRetreat: retreat,
      ownedItemIds: character.ownedItemIds,
      environment: battleEnvironmentAt(mapId, new Date(now)),
    })
    report.battleId = randomUUID()
    const gainedLoot = creditBattleEffectLoot(character.player, report)
    const usedMedicine = spendBattleMedicines(character.player, report)
    return { report, changed: gainedLoot || usedMedicine }
  }

  function addStoryNarration(report: BattleReportDTO, segments: RichSegment[]) {
    report.events.push({ round: report.events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', segments })
  }

  async function grantSectPromotion(client: PoolClient, character: Character, sect: (typeof SECTS)[number], rank: number) {
    const items: NonNullable<NonNullable<BattleReportDTO['rewards']>['items']> = []
    for (const id of sect.signatureSkills[rank - 1] ?? []) {
      const grant = await grantSkill(client, character, id)
      if (grant) items.push(grant)
    }
    const itemIds = sectEquipmentRewardIds(sect.id, rank)
    const signature = sect.signatureItems?.[rank]
    if (signature) itemIds.push(signature)
    const added = await grantItems(client, character, itemIds)
    for (const id of added) items.push({ id, name: ITEMS[id].name, tier: ITEMS[id].tier })
    character.player.sectRank = rank
    return items
  }

  app.get('/api/v1/sect/dagou-staff', async (request): Promise<{ staff: UniqueArtifactStatusDTO }> => {
    await requireSession(request)
    return transaction(async (client) => {
      const item = ITEMS.dagou_stick_true
      const { rows: [holder] } = await client.query<{ nickname: string; sectId: string | null }>(`
        SELECT players.nickname, players.profile ->> 'currentSectId' AS "sectId"
        FROM player_items JOIN players ON players.id = player_items.player_id WHERE item_id = $1`, [item.id])
      return { staff: { artifactCode: 'TRUE_DAGOU', itemId: item.id, name: item.name,
        holderNickname: holder?.nickname ?? null, holderSect: holder ? SECTS.find(({ id }) => id === holder.sectId)?.name ?? '逍遥散人' : '丐帮',
        defendStreak: 0, nextContestLabel: '丐帮衣钵传承' } }
    }, true)
  })

  app.post('/api/v1/sect', (request) => respond<SectResult>(request, async (character, now, client, readRelated) => {
    const { action, sectId, expectedRank, branch, answer, dishId } = objectBody(request.body)
    const { player } = character
    if (action === 'wanderer-gear') {
      if (!eligibleWandererEquipment(player)) throw new GameError(409, 'WANDERER_GEAR_LOCKED', '散人胜过历练第 13 关后可领取千机任侠套装')
      if (player.currentMapId !== WANDERER_EQUIPMENT.mapId) throw new GameError(409, 'WANDERER_GEAR_MAP', '请到嘉兴烟雨楼领取千机任侠套装')
      const items = await grantItems(client, character, WANDERER_EQUIPMENT.items.map(({ id }) => id))
      return { result: { action, items }, changed: items.length > 0 }
    }
    if (action === 'join') {
      const sect = SECTS.find((entry) => entry.id === sectId)
      if (!sect) throw new GameError(400, 'INVALID_SECT', '请选择一个门派')
      if (player.currentSectId) throw new GameError(409, 'ALREADY_IN_SECT', '先离开现在的师门才能拜师')
      if (player.betrayedSectIds?.includes(sect.id)) throw new GameError(409, 'SECT_BETRAYED', '你曾叛出这个门派，不能再拜入')
      const flags = storyProgressFlags(character.rewardedChapters, player.storyFlags)
      const check = sect.checkReq(player.stats, { hasBagua: character.ownedItemIds.includes('iron_bagua'), flags })
      if (!check.ok) throw new GameError(409, 'SECT_REQUIREMENTS', check.reason ?? '还不符合入门条件')
      settle(character, now)
      player.currentSectId = sect.id
      player.sectRank = 1
      delete player.gaibangBranch
      player.sectContribution = 100 + (sect.introFlag && flags.includes(sect.introFlag) ? sect.introBonus ?? 0 : 0)
      const items = await grantSectPromotion(client, character, sect, 1)
      return { result: { action, name: sect.name, items: items.filter(({ id }) => !!ITEMS[id]).map(({ id }) => id) }, changed: true }
    }
    const sect = SECTS.find((entry) => entry.id === player.currentSectId)
    if (!sect || sect.id !== sectId) throw new GameError(409, 'SECT_CHANGED', '当前师门已变更')
    const loadout = activeLoadout(character)
    if (action === 'snake-recipe') {
      if (player.snakeFeedingRecipe) return { result: { action }, changed: false }
      if (!canReceiveSnakeRecipe(player, loadout)) throw new GameError(409, 'SNAKE_TITLE_REQUIRED', '白驼弟子以噬魂蛇君之名来访时可领取蛇药饲喂方')
      player.snakeFeedingRecipe = true
      return { result: { action }, changed: true }
    }
    if (action === 'salute') {
      const { weekId, now: settledAt } = await settleSectContest(client, sect.id)
      const today = huashanDay(settledAt)
      if (player.sectSaluteDay === today) throw new GameError(409, 'SECT_SALUTE_CLAIMED', '今天已经向师门请过安了')
      let chief = await readSectChief(client, sect.id, weekId)
      if (chief?.id === player.id) chief = null
      // readRelated 需要加锁时会回滚本次事务，重开后按 ID 顺序先锁住双方。
      const [recipient] = chief ? await readRelated([chief.id]) : []
      if (recipient) recipient.player.qiExp += SECT_CHIEF_SALUTE_QI
      const sectContrib = sectContributionGain(60, loadout)
      player.sectSaluteDay = today
      player.qiExp += SECT_SALUTE_QI
      player.sectContribution += sectContrib
      return { result: { action, qiExp: SECT_SALUTE_QI, sectContrib,
        chief: chief && recipient ? { ...chief, qiExp: SECT_CHIEF_SALUTE_QI } : undefined }, changed: true, related: recipient ? [recipient] : [] }
    }
    if (action === 'claim-gear') {
      const items = await grantItems(client, character, sectEquipmentRewardIds(sect.id, player.sectRank))
      return { result: { action, items }, changed: items.length > 0 }
    }
    if (action === 'beg') {
      if (sect.id !== 'gaibang') throw new GameError(409, 'GAIBANG_REQUIRED', '拜入丐帮才可接化缘差事')
      if (player.currentMapId !== 'jiaxing_suburb') throw new GameError(409, 'GAIBANG_BEGGING_MAP', '请回嘉兴南湖化缘')
      const today = huashanDay(now)
      if (player.gaibangBeggingDay === today) throw new GameError(409, 'GAIBANG_BEGGING_CLAIMED', '今天已经化过缘了')
      const silver = gaibangSilverGain(player, gaibangBeggingSilver(loadout))
      player.gaibangBeggingDay = today
      player.silver += silver
      return { result: { action, silver }, changed: true }
    }
    if (action === 'trial' || action === 'debate' || action === 'prepare') {
      const rank = player.sectRank
      if (rank !== expectedRank) throw new GameError(409, 'SECT_RANK_CHANGED', '门派阶位已变，请重新选择考核')
      const flags = player.sectProgressFlags ?? []
      const promotion = sectPromotion(sect, player, flags)
      const { available, choosing, finale, exam, newRank } = promotion
      if (action === 'prepare') {
        const dish = GAIBANG_FINAL_DISHES.find(({ id }) => id === dishId)
        if (sect.id !== 'gaibang' || !finale || !dish) throw new GameError(409, 'SECT_DISH_UNAVAILABLE', '现在没有这道考核菜品可备办')
        const flag = gaibangDishFlag(dish.id)
        if (flags.includes(flag)) throw new GameError(409, 'SECT_DISH_PREPARED', '这道菜已经备好了')
        if (player.currentMapId !== dish.mapId) throw new GameError(409, 'SECT_DISH_MAP', '请到菜谱所示地点备办')
        settle(character, now)
        if (player.silver < dish.silver) throw new GameError(409, 'NOT_ENOUGH_SILVER', `备办${dish.name}需 ${dish.silver} 两纹银`)
        player.silver -= dish.silver
        player.sectProgressFlags = [...flags, flag]
        return { result: { action, name: dish.name, silver: dish.silver }, changed: true }
      }
      if (action === 'debate') {
        if (!choosing) throw new GameError(409, 'SECT_BRANCH_UNAVAILABLE', '当前无需参加轩辕台论辩')
        const choice = typeof answer === 'number' && Number.isInteger(answer) ? GAIBANG_DEBATE.answers[answer] : undefined
        if (!choice) throw new GameError(400, 'INVALID_SECT_ANSWER', '请选择一道帮规答复')
        if (!choice.correct) return { result: { action, correct: false }, changed: false }
        settle(character, now)
        const rewards = newRank > rank ? sectPromotionRewards(rank, loadout) : undefined
        if (rewards) {
          player.qiExp += rewards.qiExp
          player.silver += rewards.silver
          player.sectContribution += rewards.sectContrib
          const items = await grantSectPromotion(client, character, sect, newRank)
          player.gaibangBranch = 'JINGYI'
          return { result: { action, correct: true, rewards: { ...rewards, items } }, changed: true }
        }
        player.gaibangBranch = 'JINGYI'
        return { result: { action, correct: true, rewards }, changed: true }
      }
      if (!available) throw new GameError(409, 'SECT_RANK_MAX', '你已完成本门考核')
      if (branch !== (choosing ? 'WUYI' : undefined)) throw new GameError(409, 'SECT_BRANCH_REQUIRED', '请到轩辕台选择合适的考核')
      const dishesReady = sect.id !== 'gaibang' || !finale || GAIBANG_FINAL_DISHES.every(({ id }) => flags.includes(gaibangDishFlag(id)))
      const blocked = sectExamBlockReason(exam, player.stats.con, loadout, (id) => !!character.companionAffinity[id]?.recruited, dishesReady)
      if (blocked) throw new GameError(409, 'SECT_EXAM_REQUIREMENTS', blocked)
      const report = simulateSectTrial(sect, promotion, {
        player, loadout, learnedSkills: character.learnedSkills, bonus: collectionBonus(character), ownedItemIds: character.ownedItemIds,
        companionOf: (id) => equippedCompanion(character, id),
      }, now)
      report.battleId = randomUUID()
      const gainedLoot = creditBattleEffectLoot(player, report)
      const usedMedicine = spendBattleMedicines(player, report)
      if (report.winner !== 'ALLY') return { result: { action, report }, changed: gainedLoot || usedMedicine }
      settle(character, now)
      const items = newRank > rank || finale ? await grantSectPromotion(client, character, sect, newRank) : []
      if (exam?.completionFlag && !flags.includes(exam.completionFlag)) player.sectProgressFlags = [...flags, exam.completionFlag]
      if (choosing) player.gaibangBranch = 'WUYI'
      const rewards = report.rewards ?? { qiExp: 0, silver: 0 }
      player.qiExp += rewards.qiExp
      player.silver += rewards.silver
      player.sectContribution += rewards.sectContrib ?? 0
      report.rewards = { ...rewards, items }
      report.events.push({ round: report.events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', segments: [
        { type: 'tag', text: newRank > rank ? `晋升${sect.ranks[newRank - 1]}` : '门派考核通过', tone: 'gold' },
        ...(rewards.sectContrib ? [{ type: 'text' as const, text: ` 门派贡献 +${rewards.sectContrib}` }] : []),
      ] })
      return { result: { action, report }, changed: true }
    }
    if (action !== 'graduate' && action !== 'betray') throw new GameError(400, 'INVALID_SECT_ACTION', '请选择门派操作')
    if (action === 'graduate' && player.sectRank < 4 && sect.id !== 'jiangnan_wuguan') {
      throw new GameError(409, 'SECT_RANK_REQUIRED', '门派升到第 4 阶才能出师')
    }
    const { weekId } = await settleSectContest(client, sect.id)
    await client.query(`UPDATE sect_contest_entries SET withdrawn = true
      WHERE sect_id = $1 AND week_id = $2 AND player_id = $3`, [sect.id, weekId, player.id])
    await client.query(`UPDATE sect_contest_results SET chief_id = NULL
      WHERE sect_id = $1 AND week_id = $2 AND chief_id = $3`, [sect.id, weekId - 1, player.id])
    settle(character, now)
    player.currentSectId = null
    player.sectRank = 1
    player.sectContribution = 0
    player.isGuardingLibrary = false
    delete player.gaibangBranch
    if (action === 'graduate') {
      const graduated = player.graduatedSectIds ??= []
      if (!graduated.includes(sect.id)) graduated.push(sect.id)
      return { result: { action, name: sect.name }, changed: true }
    }
    const betrayed = player.betrayedSectIds ??= []
    betrayed.push(sect.id)
    const karmaDelta = changeKarma(character, -120, now)
    player.bountyUntil = now + BETRAYAL_BOUNTY.hours * 3_600_000
    return { result: { action, name: sect.name, karmaDelta }, changed: true }
  }))

  app.post('/api/v1/market/ghost/appraise', (request) => respond(request, async (character, now, client) => {
    const { masked } = objectBody(request.body)
    if (typeof masked !== 'boolean') throw new GameError(400, 'INVALID_GHOST_MASK', '请选择是否蒙面')
    const result = appraiseGhostCurio(character.player, activeLoadout(character), character.ownedItemIds.includes(GHOST_APPRAISAL_SWORD),
      masked, now, (delta) => changeKarma(character, delta, now))
    if ('error' in result) throw new GameError(409, 'SILVER_INSUFFICIENT', result.error)
    if (result.swordFound) await grantItems(client, character, [GHOST_APPRAISAL_SWORD])
    return { result, changed: true }
  }))

  app.post('/api/v1/market/inn/gift', (request) => respond<InnGiftResult>(request, async (character, now, client) => {
    const { companionId, favorite } = objectBody(request.body)
    const companion = typeof companionId === 'string' && Object.hasOwn(COMPANIONS, companionId) ? COMPANIONS[companionId] : undefined
    if (!companion || typeof favorite !== 'boolean') throw new GameError(400, 'INVALID_INN_GIFT', '请选择结识的侠客与要送的礼物')
    const state = character.companionAffinity[companion.id]
    if (!state || !(state.met || state.recruited)) throw new GameError(409, 'COMPANION_NOT_MET', '你还没有结识这位侠客')
    const { player } = character
    const kind = favorite ? 'gift' : 'tea'
    const day = innVisitDay(now)
    const visits = player.innVisits?.day === day ? player.innVisits : { day, gifts: {} }
    const used = visits.gifts[companion.id]
    if (!innGiftsRemaining(used)[kind]) throw new GameError(409, 'INN_GIFTS_EXHAUSTED', '今天的送礼次数已用尽')
    const cost = favorite ? INN_GIFT_COST : INN_TEA_COST
    if (player.silver < cost) throw new GameError(409, 'SILVER_INSUFFICIENT', '纹银不足')
    const loadout = activeLoadout(character)
    const title = activeJianghuTitle({ ...player, stats: effectiveMartialStats(player, loadout) }, loadout)
    const affinityGained = Math.max(0, Math.min(innAffinityGain(companion.id, favorite, title?.id), 1000 - state.affinity))
    if (!affinityGained) throw new GameError(409, 'AFFINITY_FULL', '好感已满')

    if (!state.recruited && state.affinity + affinityGained >= 100 && !companion.recruitFlag) {
      settle(character, now)
      state.recruited = true
    }
    player.silver -= cost
    player.innVisits = visits
    const counters = visits.gifts[companion.id] ??= { tea: 0, gift: 0 }
    counters[kind]++
    state.affinity += affinityGained
    const taught = state.affinity >= 600 && !state.taught ? await grantSkill(client, character, companion.teachSkillId) : undefined
    if (state.affinity >= 600 && SKILLS[companion.teachSkillId]) state.taught = true
    await client.query(`INSERT INTO player_companions (player_id, companion_id, state) VALUES ($1, $2, $3)
      ON CONFLICT (player_id, companion_id) DO UPDATE SET state = EXCLUDED.state`, [player.id, companion.id, state])
    return { result: { affinityGained, taughtSkillId: taught?.id }, changed: true }
  }))

  app.post('/api/v1/market/ghost/buy', (request) => respond(request, async (character, _now, client) => {
    const { listingId } = objectBody(request.body)
    const listing = GHOST_MARKET_LISTINGS.find(({ id }) => id === listingId)
    if (listing?.listingType !== 'FIXED' || listing.currency !== 'SILVER') {
      throw new GameError(404, 'GHOST_LISTING_NOT_FOUND', '找不到这件一口价商品')
    }
    const { player, learnedSkills, ownedItemIds } = character
    if (player.ghostMarketPurchases?.includes(listing.id)) throw new GameError(409, 'GHOST_LISTING_SOLD', '这件商品已买下')
    const skill = SKILLS[listing.itemId]
    if (skill ? learnedSkills[listing.itemId] : ownedItemIds.includes(listing.itemId)) {
      throw new GameError(409, 'GHOST_ITEM_OWNED', '你已拥有这件商品')
    }
    const loadout = activeLoadout(character)
    const spentSilver = marketListingPrice(loadout, listing, { ...player, stats: effectiveMartialStats(player, loadout) })
    if (player.silver < spentSilver) throw new GameError(409, 'SILVER_INSUFFICIENT', '纹银不足')
    if (skill) {
      await client.query('INSERT INTO player_skills VALUES ($1, $2, 1)', [player.id, listing.itemId])
      learnedSkills[listing.itemId] = 1
    } else {
      await client.query('INSERT INTO player_items (player_id, item_id) VALUES ($1, $2)', [player.id, listing.itemId])
      ownedItemIds.push(listing.itemId)
    }
    player.silver -= spentSilver
    const purchases = player.ghostMarketPurchases ??= []
    purchases.push(listing.id)
    return { result: { spentSilver }, changed: true }
  }))

  app.post('/api/v1/alchemy/forage', (request) => respond(request, async (character, now) => {
    const { player } = character
    if (player.qiExp < FORAGE_QI_COST) throw new GameError(409, 'QI_INSUFFICIENT', `采药需 ${FORAGE_QI_COST} 点真气`)
    const herbs = gatherHerbs(player.currentMapId, effectiveMartialStats(player, activeLoadout(character)).luck, shichenIdxFromDate(new Date(now)))
    if (!herbs.length) throw new GameError(409, 'NO_HERBS', '此地没有可采的药材')
    const alchemy = player.alchemy ??= { herbs: {}, pity: {}, residue: 0 }
    player.qiExp -= FORAGE_QI_COST
    for (const herb of herbs) alchemy.herbs[herb.id] = (alchemy.herbs[herb.id] ?? 0) + herb.count
    return { result: { herbs }, changed: true }
  }))

  app.post('/api/v1/alchemy/refine', (request) => respond(request, async (character) => {
    const { player } = character
    const { recipeId } = objectBody(request.body)
    const baseRecipe = typeof recipeId === 'string' && Object.hasOwn(PILL_RECIPES, recipeId) ? PILL_RECIPES[recipeId] : undefined
    if (!baseRecipe || baseRecipe.category === 'BODY') throw new GameError(400, 'INVALID_RECIPE', '请选择一份可用的药方')
    const recipe = recipeForPlayer(baseRecipe, player)
    const alchemy = player.alchemy ??= { herbs: {}, pity: {}, residue: 0 }
    const stats = effectiveMartialStats(player, activeLoadout(character))
    if (stats.intStat < recipe.minInsight || player.qiExp < recipe.costQi || player.silver < recipe.costSilver ||
      recipe.requiredHerbs.some(({ herbId, count }) => (alchemy.herbs[herbId] ?? 0) < count)) {
      throw new GameError(409, 'CANNOT_REFINE', '炼药所需的悟性、真气、纹银或药材不足')
    }
    player.qiExp -= recipe.costQi
    player.silver -= recipe.costSilver
    for (const { herbId, count } of recipe.requiredHerbs) alchemy.herbs[herbId] -= count
    const success = Math.random() * 100 < pillSuccessRate(recipe, stats, alchemy.pity[recipe.id])
    const count = success ? (Math.random() * 100 < pillDoubleRate(stats) ? 2 : 1) : 0
    if (count) {
      const stock = recipe.category === 'BATTLE' ? (player.battleMedicines ??= {}) : (player.acupointPills ??= {})
      stock[recipe.targetMedicineId] = (stock[recipe.targetMedicineId] ?? 0) + count
      delete alchemy.pity[recipe.id]
    } else {
      alchemy.pity[recipe.id] = (alchemy.pity[recipe.id] ?? 0) + 6
      alchemy.residue++
    }
    return { result: { medicineId: recipe.targetMedicineId, count }, changed: true }
  }))

  app.post('/api/v1/alchemy/extract', (request) => respond(request, async ({ player }) => {
    const alchemy = player.alchemy
    if (!alchemy || alchemy.residue < 5) throw new GameError(409, 'RESIDUE_INSUFFICIENT', '攒够 5 团药渣即可萃取')
    const result = extractFurnaceResidue()
    alchemy.residue -= 5
    alchemy.herbs[result.id] = (alchemy.herbs[result.id] ?? 0) + result.count
    player.qiExp += result.gainedQi
    return { result, changed: true }
  }))

  app.post('/api/v1/map/move', (request) => {
    let voyageRoll: number | undefined
    return respond<MapMoveResult>(request, async (character, now, client, readRelated) => {
      const { mapId, action } = objectBody(request.body)
      if (action !== undefined && action !== 'depart' && action !== 'arrive') throw new GameError(400, 'INVALID_MAP_ACTION', '请选择出发或抵达')
      const map = ONLINE_MAPS.find((entry) => entry.id === mapId)
      if (!map) throw new GameError(400, 'INVALID_MAP', '江湖图上找不到这个地方')
      const { player } = character
      const journey = player.mapJourney
      if (action === 'arrive') {
        if (journey?.mapId !== map.id) throw new GameError(409, 'JOURNEY_CHANGED', '当前没有前往此处的行程')
        if (now < journey.arrivesAt) throw new GameError(409, 'JOURNEY_NOT_READY', '请等行程结束再抵达')
      } else if (journey) throw new GameError(409, 'JOURNEY_ACTIVE', '请先抵达当前行程的目的地')
      if (map.id === player.currentMapId) return { result: NO_IDLE_GAIN, changed: false }
      const loadout = activeLoadout(character)
      if (!journey && !canEnterMap(map, player, loadout, true)) {
        throw new GameError(409, 'MAP_LOCKED', map.onlineUnlockHint ?? '请先推进主线')
      }
      if ((player.escortDart?.endsAt ?? 0) > now) {
        throw new GameError(409, 'ESCORT_IN_TRANSIT', '镖车仍在途中，抵达后即可离开')
      }
      if (action === 'depart' || (!journey && cityInspectionDue(player, map.id, loadout, now))) {
        player.mapJourney = planMapJourney(player, map.id, loadout, now)
        player.isGuardingLibrary = false
        if (player.mapJourney.inspected) player.lastCityInspectionAt = now
        return { result: { ...NO_IDLE_GAIN, journey: player.mapJourney }, changed: true }
      }
      delete player.mapJourney
      const voyage = resolveSeaVoyage(player.currentMapId, map.id, loadout.accId, player.silver, now, () => voyageRoll ??= Math.random())
      if (voyage?.status === 'WRECK') {
        player.silver -= voyage.silverLost
        return { result: { ...NO_IDLE_GAIN, voyage }, changed: !!journey || voyage.silverLost > 0 }
      }
      const pair = activePair(character, now)
      if (pair) {
        const stopped = await endCoCultivation(character, pair, now, client, readRelated)
        enterMap(player, map.id, now)
        return { ...stopped, result: { ...stopped.result, voyage } }
      }
      const invitation = pendingInvite(character, now)
      const related = invitation ? [await removeInvitation(character, invitation, client, readRelated)] : []
      const result = settle(character, now)
      enterMap(player, map.id, now)
      return { result: { ...result, voyage }, changed: true, related }
    })
  })

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

  app.post('/api/v1/escort', (request) => respond(request, async (character, now) => {
    const { action } = objectBody(request.body)
    const { player } = character
    if (action === 'start') {
      if (player.mapJourney) throw new GameError(409, 'JOURNEY_ACTIVE', '请先抵达当前行程的目的地')
      if (ONLINE_MAPS.find((map) => map.id === player.currentMapId)?.safety !== 'CONTESTED') {
        throw new GameError(409, 'ESCORT_MAP_REQUIRED', '请到纷争区接镖')
      }
      if (player.escortDart) throw new GameError(409, 'ESCORT_ACTIVE', '请先结算当前镖车')
      player.escortDart = { mapId: player.currentMapId, silver: 4800, endsAt: now + 15 * 60_000 }
      return { result: { silver: 0 }, changed: true }
    }
    if (action !== 'claim') throw new GameError(400, 'INVALID_ESCORT_ACTION', '请选择接镖或交镖')
    const escort = player.escortDart
    if (!escort || escort.mapId !== player.currentMapId || now < escort.endsAt) throw new GameError(409, 'ESCORT_NOT_READY', '请在原地等待本趟镖车抵达')
    const silver = escort.silver
    player.silver += silver
    delete player.escortDart
    return { result: { silver }, changed: true }
  }))

  app.get('/api/v1/bounties', async (request): Promise<BountyBoardDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const { player } = await readCharacter(client, accountId)
      const now = await serverTime(client)
      const { rows } = await client.query<{ id: string; nickname: string; expiresAt: string; sectId: string | null }>(`
        SELECT id, nickname, profile->>'bountyUntil' AS "expiresAt", profile->'betrayedSectIds'->>-1 AS "sectId"
        FROM players WHERE id <> $1 AND (profile->>'bountyUntil')::bigint > $2
        ORDER BY (profile->>'bountyUntil')::bigint, id`, [player.id, now])
      return { entries: rows.map(({ id, nickname, expiresAt, sectId }) => {
        const expires = Number(expiresAt)
        const accepted = player.bountyAccepted?.targetId === id && player.bountyAccepted.expiresAt === expires
        const issuer = sectId ?? ''
        return {
          targetId: id, nickname, sectId: issuer, expiresAt: expires, accepted,
          ...bountyReward(player, issuer), mapId: accepted ? rooms.onlineMap(id) ?? undefined : undefined,
        }
      }) }
    }, true)
  })

  app.post('/api/v1/bounties/accept', (request) => respond<BountyEntryDTO>(request, async (character, now, _client, readRelated) => {
    const { targetPlayerId, expiresAt } = objectBody(request.body)
    if (typeof targetPlayerId !== 'string' || !UUID.test(targetPlayerId)) throw new GameError(400, 'INVALID_PARTNER', '请选择悬赏榜上的侠客')
    const [target] = await readRelated([targetPlayerId.toLowerCase()])
    const { id, nickname, bountyUntil, betrayedSectIds } = target.player
    if (!bountyUntil || bountyUntil <= now || expiresAt !== bountyUntil) throw new GameError(409, 'BOUNTY_UNAVAILABLE', '这道通缉令已结束')
    const { player } = character
    const changed = player.bountyAccepted?.targetId !== id || player.bountyAccepted.expiresAt !== bountyUntil
    if (changed) player.bountyAccepted = { targetId: id, expiresAt: bountyUntil }
    const sectId = betrayedSectIds?.at(-1) ?? ''
    return {
      result: { targetId: id, nickname, sectId, expiresAt: bountyUntil, accepted: true,
        ...bountyReward(player, sectId), mapId: rooms.onlineMap(id) ?? undefined },
      changed,
    }
  }))

  app.post('/api/v1/duel', async (request) => {
    const input = objectBody(request.body)
    const { action, targetPlayerId } = input
    const pursuing = action === 'pursue'
    const isAmbush = action === 'ambush' || pursuing
    if (action !== 'invite' && action !== 'accept' && action !== 'decline' && !isAmbush) {
      throw new GameError(400, 'INVALID_DUEL_ACTION', '请选择切磋、劫镖或追捕')
    }
    type DuelResult = { invitation?: DuelInviteDTO; report?: BattleReportDTO }
    let reserved: [string, string] | undefined
    try {
      const { response, updates, replayed } = await writeAction<DuelResult>(request, async (character, now, _client, readRelated) => {
        const { player } = character
        let invitation = duelInvites.get(player.id)
        let otherId: string
        if (action === 'accept' || action === 'decline') {
          if (!invitation || invitation.id !== input.inviteId || invitation.expiresAt <= now || invitation.invitee.id !== player.id) {
            throw new GameError(409, 'DUEL_INVITE_EXPIRED', '这封切磋请帖已经失效')
          }
          otherId = invitation.inviter.id
        } else {
          if (typeof targetPlayerId !== 'string' || !UUID.test(targetPlayerId)) throw new GameError(400, 'INVALID_PARTNER', '请选择一位同图侠客')
          otherId = targetPlayerId.toLowerCase()
        }
        const [other] = await readRelated([otherId])
        const expiresAt = other.player.bountyUntil ?? 0
        const bounty = expiresAt > now
        if (pursuing) {
          if (input.expiresAt !== expiresAt || !bounty) throw new GameError(409, 'BOUNTY_UNAVAILABLE', '这道通缉令已结束')
          const accepted = player.bountyAccepted?.targetId === otherId && player.bountyAccepted.expiresAt === expiresAt
          if (!accepted) throw new GameError(409, 'BOUNTY_NOT_ACCEPTED', '请先到悬赏榜接令')
          if (player.mapJourney || other.player.mapJourney) throw new GameError(409, 'BOUNTY_IN_TRANSIT', '等双方抵达地图后再追捕')
        }
        invitation = duelInvites.get(player.id)
        if (!isAmbush) {
          if (pendingDuelPlayers.has(player.id) || pendingDuelPlayers.has(otherId)) {
            throw new GameError(409, 'DUEL_REPLY_PENDING', '切磋请帖正在结算，请稍后重试')
          }
          reserved = [player.id, otherId]
          for (const id of reserved) pendingDuelPlayers.add(id)
        }
        if (action === 'accept' || action === 'decline') {
          if (!invitation || invitation.id !== input.inviteId || invitation.expiresAt <= Date.now()) {
            throw new GameError(409, 'DUEL_INVITE_EXPIRED', '这封切磋请帖已经失效')
          }
        }
        if (action === 'decline') {
          return { result: { invitation }, changed: false }
        }
        const mapId = player.currentMapId
        if (mapId !== other.player.currentMapId || !rooms.isOnlineInMap(player.id, mapId) || !rooms.isOnlineInMap(otherId, mapId)) {
          throw new GameError(409, 'DUEL_NOT_NEARBY', '两位侠客须在同一张地图并保持在线')
        }
        if (action === 'invite') {
          const otherInvite = duelInvites.get(otherId)
          if (invitation || otherInvite) {
            throw new GameError(409, 'DUEL_INVITE_PENDING', '已有一封切磋请帖在等答复')
          }
          const invite = { id: randomUUID(), inviter: { id: player.id, nickname: player.nickname },
            invitee: { id: otherId, nickname: other.player.nickname }, expiresAt: now + 60_000, mapId }
          return { result: { invitation: invite }, changed: false }
        }
        const escort = other.player.escortDart
        if (!isAmbush && invitation?.mapId !== mapId) throw new GameError(409, 'DUEL_INVITE_EXPIRED', '已离开递帖地点，请重新发帖')
        if (action === 'ambush' && bounty) throw new GameError(409, 'BOUNTY_NOT_ACCEPTED', '请先到悬赏榜接令')
        if (action === 'ambush' && (ONLINE_MAPS.find((map) => map.id === mapId)?.safety !== 'CONTESTED' ||
          !escort || escort.mapId !== mapId || escort.robbed || escort.endsAt <= now)) {
          throw new GameError(409, 'ESCORT_NOT_RAIDABLE', '只能在纷争区拦截正在押镖的侠客')
        }
        const report = simulatePlayerDuel({
          battleId: randomUUID(), sceneTitle: pursuing ? '清理门户 · 追缉逆徒' : isAmbush ? '大漠纷争 · 劫镖' : '点到为止 · 切磋',
          mode: isAmbush ? 'PVP_AMBUSH' : 'PVP_HUASHAN', lineup: [duelFighter(character), duelFighter(other)],
          environment: battleEnvironmentAt(mapId, new Date(now)), escort: action === 'ambush' ? true : undefined,
        })
        let changed = isAmbush && spendBattleMedicines(player, report, 'ALLY_MAIN')
        let otherChanged = isAmbush && spendBattleMedicines(other.player, report, 'ENEMY_MAIN')
        if (action === 'ambush') {
          player.shaQi += 15
          changeKarma(character, -40, now)
          changed = true
          if (report.winner === 'ALLY' && escort) {
            const silver = Math.floor(escort.silver * 0.3)
            escort.silver -= silver
            escort.robbed = true
            player.silver += silver
            report.rewards = { qiExp: 0, silver }
            otherChanged = true
          }
        } else if (pursuing) {
          const won = report.winner === 'ALLY'
          if (won) {
            const { silver, sectContrib } = bountyReward(player, other.player.betrayedSectIds?.at(-1) ?? '')
            const karma = changeKarma(character, BETRAYAL_BOUNTY.karma, now)
            player.silver += silver
            player.sectContribution += sectContrib
            delete player.bountyAccepted
            other.player.bountyUntil = null
            report.rewards = { qiExp: 0, silver, sectContrib, karma }
            changed = otherChanged = true
          }
          report.events.push({ round: report.events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', segments: [
            { type: 'tag', text: won ? '悬赏结案' : '追缉未果', tone: won ? 'gold' : 'red' },
            { type: 'text', text: won ? ' 本次通缉已解除，赏金按战报到账。' : ' 通缉令仍有效，备好阵容可再追缉。' },
          ] })
        }
        return { result: { invitation: isAmbush ? undefined : invitation, report }, changed, related: otherChanged ? [other] : [] }
      })
      const { invitation, report } = response.result
      if (invitation && !replayed) {
        if (action === 'invite') sendDuelInvite(invitation)
        else clearDuelInvite(invitation)
      }
      for (const updated of updates) rooms.publish(updated)
      const defender = report?.units.find((unit) => unit.slot === 'ENEMY_MAIN')
      if (report && defender && !replayed) rooms.sendToPlayer(defender.id, { event: 'DUEL_REPORT', data: { ...report, perspective: 'ENEMY', rewards: undefined } })
      return { ...response, result: report ?? null }
    } finally {
      for (const id of reserved ?? []) pendingDuelPlayers.delete(id)
    }
  })

  app.post('/api/v1/raid/start', async (request) => {
    const { teamId, revision } = objectBody(request.body)
    let finish: (() => void) | undefined
    const reports = new Map<string, BattleReportDTO>()
    try {
      const { response, updates } = await writeAction<BattleReportDTO>(request, async (leader, now, client, readRelated) => {
        const { raidId, playerIds: [, leftId, rightId] } = raid.lineup(leader.player.id, teamId, revision)
        const config = COOP_RAIDS[raidId]
        const clears = config.clearField
        const [left, right] = await readRelated([leftId, rightId])
        const party = [leader, left, right] as const
        if (party.some(({ player }) => player.currentMapId !== leader.player.currentMapId)) {
          throw new GameError(409, 'RAID_NOT_NEARBY', '三位侠客要在同一处才能入阵')
        }
        finish = raid.reserve(leader.player.id, teamId, revision)
        const fighter = (member: Character) => ({ player: member.player, loadout: activeLoadout(member), learnedSkills: member.learnedSkills, bonus: collectionBonus(member) })
        const battle = simulateCoopRaid(raidId, randomUUID(), [fighter(leader), fighter(left), fighter(right)], undefined,
          battleEnvironmentAt(config.mapId, new Date(now)))
        const won = battle.winner === 'ALLY'
        const lootRecipients = new Set<string>()
        for (const member of party) {
          const { player } = member
          const unit = battle.units.find((entry) => entry.id === player.id && entry.isPlayer)
          if (unit) {
            const gainedLoot = creditBattleEffectLoot(player, battle, unit.slot)
            if (spendBattleMedicines(player, battle, unit.slot) || gainedLoot) lootRecipients.add(player.id)
          }
          if (!won) {
            reports.set(player.id, battle)
            continue
          }

          const relic = config.relics[member[clears]]
          const bonus = member[clears] === 0 ? config.firstClearBonus : undefined
          member[clears]++
          const qiExp = config.rewardQi + (bonus?.qiExp ?? 0)
          player.qiExp += qiExp
          const silver = gaibangSilverGain(player, config.rewardSilver + (bonus?.silver ?? 0))
          player.silver += silver
          const granted = relic && (await grantItems(client, member, [relic.id])).length > 0
          const items = granted ? [{ id: relic.id, name: relic.name, tier: relic.tier }] : []
          reports.set(player.id, { ...battle, rewards: { qiExp, silver, items } })
        }
        return {
          result: reports.get(leader.player.id)!,
          changed: won || lootRecipients.has(leader.player.id),
          related: [left, right].filter(({ player }) => won || lootRecipients.has(player.id)),
        }
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
    const idleBonus = collectionBonus(character).idleQiPct
    const oldRate = cultivationRates(player, activeLoadout(character), idleBonus)
    const newRate = cultivationRates(player, nextActive, idleBonus)
    const rateChanged = oldRate.qi !== newRate.qi || oldRate.silverBasis !== newRate.silverBasis
    const result = rateChanged || character.patrolIdleGain ? settle(character, now) : NO_IDLE_GAIN
    character.loadouts[idx - 1] = checked
    player.activePresetIdx = nextIdx
    await client.query('UPDATE player_loadouts SET preset = $3 WHERE player_id = $1 AND preset_idx = $2', [player.id, idx, checked])
    return { result, changed: true }
  }))

  app.post('/api/v1/skill/upgrade', (request) => respond<SkillUpgradeResult>(request, async (character, _now, client) => {
    const { skillId, expectedMastery, useFragments = false } = objectBody(request.body)
    if (typeof skillId !== 'string' || !Object.hasOwn(SKILLS, skillId) || !Number.isInteger(expectedMastery) || typeof useFragments !== 'boolean') {
      throw new GameError(400, 'INVALID_SKILL_UPGRADE', '请选择一门武功升重')
    }
    const mastery = character.learnedSkills[skillId]
    if (!mastery) throw new GameError(409, 'SKILL_NOT_LEARNED', '学会这门武功后才能升级')
    if (expectedMastery !== mastery) throw new GameError(409, 'STALE_REVISION', '武功重数已变，查看后再试')
    if (mastery >= MAX_SKILL_MASTERY) throw new GameError(409, 'SKILL_MAXED', '这门武功已经练满')

    const skill = SKILLS[skillId]
    const { player } = character
    const loadout = activeLoadout(character)
    const cost = skillUpgradeCost(skill, mastery, effectiveMartialStats(player, loadout).intStat, loadout.accId)
    const { count: spentFragments, spentQi } = skillFragmentDiscount(skill, cost, useFragments ? player.skillFragments?.[skillId] ?? 0 : 0)
    if (player.qiExp < spentQi) throw new GameError(409, 'SKILL_QI_REQUIRED', `还差 ${(spentQi - player.qiExp).toLocaleString('zh-CN')} 真气`)

    const nextMastery = mastery + 1
    await client.query('UPDATE player_skills SET mastery = $3 WHERE player_id = $1 AND skill_id = $2', [player.id, skillId, nextMastery])
    character.learnedSkills[skillId] = nextMastery
    player.qiExp -= spentQi
    if (spentFragments) player.skillFragments![skillId] -= spentFragments
    player.stats.str += 1
    const freedom = hasMartialFreedom(loadout)
    const power = skill.slot === 'OUTER' || skill.slot === 'ULT'
      ? { before: skillPowerAtMastery(skill, mastery, player, freedom), after: skillPowerAtMastery(skill, nextMastery, player, freedom) }
      : null
    return { result: { skillId, mastery: nextMastery, spentQi, power, spentFragments }, changed: true }
  }))

  app.post('/api/v1/trial/qusan-cache', (request) => respond(request, async (character, now) => {
    if (!character.ownedItemIds.includes(QUSAN_CACHE_KEY)) throw new GameError(409, 'QUSAN_KEY_REQUIRED', '还没有曲三酒馆暗格钥')
    const result = searchQusanCache(character.player, activeLoadout(character), now)
    if ('error' in result) throw new GameError(409, 'QUSAN_CACHE_UNAVAILABLE', result.error)
    return { result, changed: true }
  }))

  app.post<{ Params: { chapterId: string } }>('/api/v1/story/:chapterId/adventure', (request) => respond<StorySnakeChoiceResult>(request, async (character, now, client) => {
    const chapter = onlineStoryChapter(request.params.chapterId)
    if (chapter?.code !== STORY_SNAKE_ADVENTURE.chapterCode) throw new GameError(404, 'STORY_ADVENTURE_NOT_FOUND', '这里没有可选的奇遇')
    const { player } = character
    if (chapter.id > player.maxChapterId) throw new GameError(409, 'CHAPTER_LOCKED', '先打过上一关，就能来此寻药')
    const { choice } = objectBody(request.body)
    if (choice !== 'A' && choice !== 'B') throw new GameError(400, 'STORY_ADVENTURE_CHOICE_INVALID', '请选择分饮或放生')
    if (player.storySnakeChoice) {
      if (player.storySnakeChoice !== choice) throw new GameError(409, 'STORY_ADVENTURE_RESOLVED', '药蛇宝血的去向已经选定')
      return { result: { choice, firstPick: false }, changed: false }
    }
    if (!canChooseStorySnake(choice, effectiveMartialStats(player, activeLoadout(character)).agi)) {
      throw new GameError(409, 'STORY_ADVENTURE_REQUIREMENT', STORY_SNAKE_ADVENTURE.choices[choice].requirementText)
    }
    await grantStoryReward(client, character, STORY_SNAKE_ADVENTURE.choices[choice].reward, now)
    player.storySnakeChoice = choice
    return { result: { choice, firstPick: true }, changed: true }
  }))

  app.post<{ Params: { chapterId: string } }>('/api/v1/story/:chapterId/challenge', (request) => respond<StoryChallengeResult>(request, async (character, now, client) => {
    const chapter = onlineStoryChapter(request.params.chapterId)
    if (!chapter) throw new GameError(404, 'CHAPTER_NOT_FOUND', '江湖图上没有这一关')
    const { player, rewardedChapters } = character
    if (chapter.id > player.maxChapterId) throw new GameError(409, 'CHAPTER_LOCKED', '先打过上一关，就能挑战这里')

    const { report, changed } = storyBattle(character, now, `${chapter.code} ${chapter.title}`,
      storyEncounter(chapter, player.storySnakeChoice, chapter.isBoss), battleRetreatRequested(request.body))
    if (report.winner !== 'ALLY') return { result: { report, firstClear: false }, changed }

    const firstClear = !rewardedChapters.includes(chapter.id)
    if (firstClear) {
      rewardedChapters.push(chapter.id)
      player.maxChapterId = Math.max(player.maxChapterId, chapter.id + 1)
      const { rewards, narration } = await grantStoryReward(client, character, {
        ...storyFirstClearReward(chapter),
        flags: undefined, // 主线标记从首胜记录读取，旧档同样生效。
      }, now)
      report.rewards = rewards
      addStoryNarration(report, narration)
    }

    const otherSanskritChapter = chapter.code === '4-2' ? 16 : chapter.code === '5-3' ? 12 : undefined
    const sanskrit = firstClear && otherSanskritChapter !== undefined && rewardedChapters.includes(otherSanskritChapter) &&
      character.companionAffinity.huangrong?.recruited
      ? await grantItems(client, character, ['jiuyin_sanskrit'])
      : []
    if (sanskrit.length && report.rewards) {
      const { id, name, tier } = ITEMS.jiuyin_sanskrit
      report.rewards.items = [...(report.rewards.items ?? []), { id, name, tier }]
    }
    let gainedClues = false
    for (const quest of Object.values(REUNION_QUESTS)) {
      if (!quest.replayNodeIds.includes(chapter.id) || !reunionAvailable(character, quest)) continue
      const gained = recordReunionClue(character, quest, 'replay', now)
      if (!gained) continue
      gainedClues = true
      addStoryNarration(report, [{ type: 'tag', text: '旧地重游', tone: 'jade' }, { type: 'text', text: ` ${COMPANIONS[quest.companionId].name}的寻访线索 +${gained}` }])
    }
    return { result: { report, firstClear }, changed: changed || firstClear || gainedClues }
  }))

  app.post<{ Params: { adventureId: string } }>('/api/v1/story/adventures/:adventureId', (request) => respond<StoryAdventureResult>(request, async (character, now, client) => {
    const adventure = adventureById(request.params.adventureId)
    if (!adventure?.afterNodeId || adventure.id === STORY_SNAKE_ADVENTURE.id) {
      throw new GameError(404, 'STORY_ADVENTURE_NOT_FOUND', '江湖图上没有这段奇遇')
    }
    const { player, rewardedChapters, ownedItemIds } = character
    if (!rewardedChapters.includes(adventure.afterNodeId)) {
      throw new GameError(409, 'STORY_ADVENTURE_LOCKED', '先打过相关的主线关卡')
    }
    const { choice } = objectBody(request.body)
    if (choice !== 'A' && choice !== 'B') throw new GameError(400, 'STORY_ADVENTURE_CHOICE_INVALID', '请选择奇遇选项')
    const previous = player.storyAdventureChoices?.[adventure.id]
    if (previous) {
      if (previous !== choice) throw new GameError(409, 'STORY_ADVENTURE_RESOLVED', '这段奇遇的去向已经选定')
      return { result: { choice, firstPick: false }, changed: false }
    }
    const option = adventure.choices.find((entry) => entry.key === choice)!
    const ctx = {
      stats: effectiveMartialStats(player, activeLoadout(character)), isWanderer: !player.currentSectId,
      flags: storyProgressFlags(rewardedChapters, player.storyFlags), items: ownedItemIds, silver: player.silver,
    }
    if (option.costSilver && ctx.silver < option.costSilver) throw new GameError(409, 'SILVER_INSUFFICIENT', '纹银不足')
    if (option.require && !option.require(ctx)) {
      throw new GameError(409, 'STORY_ADVENTURE_REQUIREMENT', option.requirementText ?? '条件未满足')
    }
    let report: BattleReportDTO | undefined
    if (option.battle) {
      const encounter = adventureEncounter(option.battle)
      if (!encounter) throw new GameError(404, 'STORY_BATTLE_NOT_FOUND', '江湖图上没有这一战')
      const battle = storyBattle(character, now, adventure.title, encounter, battleRetreatRequested(request.body))
      report = battle.report
      addAdventureObjective(report, adventure, encounter)
      if (report.winner !== 'ALLY') return { result: { choice, firstPick: false, report }, changed: battle.changed }
    }

    const reward = typeof option.reward === 'function' ? option.reward(ctx) : option.reward
    player.silver -= option.costSilver ?? 0
    const choices = player.storyAdventureChoices ??= {}
    choices[adventure.id] = choice
    const { rewards, narration } = await grantStoryReward(client, character, reward, now)
    if (report) {
      report.rewards = rewards
      addStoryNarration(report, narration)
      return { result: { choice, firstPick: true, report }, changed: true }
    }
    const links: RichSegment[] = rewards.items.flatMap(({ id, name, tier }): RichSegment[] => SKILLS[id]
      ? [{ type: 'skill', id, name: `《${name}》`, tier }]
      : [{ type: 'item', id, name: `【${name}】`, tier, isTrueUnique: ITEMS[id].isTrueUnique }])
    const resources = [rewards.qiExp ? `真气 +${rewards.qiExp.toLocaleString()}` : '', rewards.silver ? `纹银 +${rewards.silver.toLocaleString()}` : ''].filter(Boolean)
    if (resources.length) narration.push({ type: 'text', text: `（${resources.join('，')}）` })
    return { result: { choice, firstPick: true, narration: [...narration, ...links] }, changed: true }
  }))

  app.post<{ Params: { companionId: string } }>('/api/v1/story/reunion/:companionId', (request) => respond<ReunionResult>(request, async (character, now, client) => {
    const id = request.params.companionId
    const quest = Object.hasOwn(REUNION_QUESTS, id) ? REUNION_QUESTS[id] : undefined
    if (!quest || !reunionAvailable(character, quest)) throw new GameError(409, 'REUNION_UNAVAILABLE', '此时没有可寻访的这位故人')
    const { action } = objectBody(request.body)
    const { player } = character
    const state = player.reunions?.[id]
    if (action === 'inquire' && (!state || state.step === 'CLUES')) {
      if (player.silver < REUNION_INQUIRE_COST) throw new GameError(409, 'SILVER_INSUFFICIENT', '纹银不足')
      const clues = recordReunionClue(character, quest, 'inn', now)
      if (!clues) throw new GameError(409, 'REUNION_DAILY_CAP', '掌柜今日知道的都说了，明日子时再来')
      player.silver -= REUNION_INQUIRE_COST
      return { result: { action, clues }, changed: true }
    }
    if (action === 'wait' && state?.step === 'WAIT') {
      const wait = reunionWaitTime(state, quest, player.currentMapId, now, player.mapArrivedAt)
      if (wait < REUNION_WAIT_HOURS * 3_600_000) throw new GameError(409, 'REUNION_WAIT_REQUIRED', '还需在故地多候些时辰')
      state.waitMs = wait
      state.step = 'GIFT'
      return { result: { action }, changed: true }
    }
    if (action === 'gift' && state?.step === 'GIFT') {
      if (player.silver < INN_GIFT_COST) throw new GameError(409, 'SILVER_INSUFFICIENT', '纹银不足')
      player.silver -= INN_GIFT_COST
      state.step = 'BATTLE'
      return { result: { action }, changed: true }
    }
    if (action === 'battle' && state?.step === 'BATTLE') {
      const { rewards: encounterRewards, ...encounter } = reunionEncounter(quest, player.level)
      const name = COMPANIONS[id].name
      const { report, changed } = storyBattle(character, now, `故人重逢 · ${name}`, encounter, battleRetreatRequested(request.body), quest.mapId)
      if (report.winner !== 'ALLY') return { result: { action, report }, changed }

      const { rewards, narration } = await grantStoryReward(client, character, {
        tag: '故人重逢', tone: 'gold', text: quest.outro, ...encounterRewards,
        affinity: { [id]: Math.max(0, 100 - (character.companionAffinity[id]?.affinity ?? 0)) },
      }, now)
      state.step = 'DONE'
      report.rewards = rewards
      addStoryNarration(report, narration)
      return { result: { action, report }, changed: true }
    }
    throw new GameError(409, 'REUNION_STEP_REQUIRED', '请按故人寻访的进度继续')
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
    switchPatrolStage(character.player.trial, stage.id)
    return { result: patrolStatus(character), changed: true }
  }))

  function trialAnswer(stage: TrialStageConfig, body: unknown) {
    const answer = body == null ? undefined : objectBody(body).answer
    if (answer === undefined) return
    if (typeof answer !== 'string' || !stage.puzzle?.options.includes(answer)) {
      throw new GameError(400, 'INVALID_TRIAL_ANSWER', '请选择本关的一项答案')
    }
    return answer
  }

  function battleRetreatRequested(body: unknown) {
    const retreat = body == null ? undefined : objectBody(body).retreat
    if (retreat !== undefined && typeof retreat !== 'boolean') throw new GameError(400, 'INVALID_RETREAT', '撤退选项有误')
    return retreat === true
  }

  function trialBattle(
    character: Character, stage: TrialStageConfig, now: number, rewards?: BattleReportDTO['rewards'], answer?: string, tryRetreat = false,
  ) {
    return simulateServerBattle({
      sceneTitle: `${stage.code} ${stage.title}`,
      mode: 'SOLO_STORY',
      trial: true,
      tryRetreat,
      player: character.player,
      loadout: activeLoadout(character),
      companionOf: (id) => equippedCompanion(character, id),
      bonus: collectionBonus(character),
      ownedItemIds: character.ownedItemIds,
      learnedSkills: character.learnedSkills,
      environment: { ...battleEnvironmentAt(character.player.currentMapId, new Date(now)), ...stage.environment },
      enemyMain: {
        ...stage.boss,
        mp: Math.round(stage.boss.hp * 0.45),
        isBoss: true,
      },
      enemyGuards: stage.guards,
      puzzleOutcome: trialPuzzleOutcome(stage, answer),
      surviveRounds: stage.victory === 'SURVIVE_ROUNDS' ? stage.surviveRounds : undefined,
      rewards,
    })
  }

  async function awardChapterOneTitle(player: PlayerDTO, stageId: number, report: BattleReportDTO, client: PoolClient) {
    if (stageId !== CHAPTER_ONE_FINAL_STAGE || player.chapterOneChampion || report.winner !== 'ALLY') return false
    const { rowCount } = await client.query(`INSERT INTO chapter_one_statue (chapter, player_id)
      VALUES (1, $1) ON CONFLICT (chapter) DO NOTHING`, [player.id])
    if (!rowCount) return false
    player.chapterOneChampion = true
    announceChapterOneTitle(report)
    return true
  }

  app.post<{ Params: { stageId: string } }>('/api/v1/trial/:stageId/challenge', (request) => respond<TrialChallengeResult>(request, async (character, now, client) => {
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
    const answer = trialAnswer(stage, request.body)
    const drops = trialRewardItems(stage, firstClear, character.ownedItemIds, {
      rewardedStageIds: trial.rewardedStageIds, answer, huangrongRecruited: !!character.companionAffinity.huangrong?.recruited,
    })
    const skill = stage.clearSkillId && !character.learnedSkills[stage.clearSkillId] ? SKILLS[stage.clearSkillId] : undefined
    const skillDrop = skill ? { id: skill.id, name: skill.name, tier: skill.tier } : undefined
    const rewardDrops = [...drops.map(({ id, name, tier }) => ({ id, name, tier })), ...(skillDrop ? [skillDrop] : [])]
    const recruits = stage.clearCompanionIds?.filter((id) => !character.companionAffinity[id]?.recruited) ?? []
    const rewardQi = firstClear ? Math.round(stage.boss.hp * 2) : 0
    const rewardSilver = firstClear ? enemySilverReward(stage.boss.hp) : 0
    const report = trialBattle(character, stage, now, firstClear || drops.length || skillDrop || recruits.length
      ? { qiExp: rewardQi, silver: rewardSilver, items: rewardDrops, ...(recruits.length ? { companions: recruits } : {}) }
      : undefined, answer, battleRetreatRequested(request.body))
    report.battleId = randomUUID()
    const gainedLoot = creditBattleEffectLoot(player, report)
    const usedMedicine = spendBattleMedicines(player, report)

    const patrol = patrolStatus(character)
    if (report.winner !== 'ALLY') {
      return { result: { report, firstClear: false, unlockedStageId: null, drops: [], patrol }, changed: gainedLoot || usedMedicine }
    }
    if (skillDrop) {
      await client.query('INSERT INTO player_skills VALUES ($1, $2, 1) ON CONFLICT DO NOTHING', [player.id, skillDrop.id])
      character.learnedSkills[skillDrop.id] = 1
    }
    if (recruits.length) {
      const states = recruitTrialCompanions(character.companionAffinity, [stage.id])
      await client.query(`INSERT INTO player_companions (player_id, companion_id, state)
        SELECT $1, key, value FROM jsonb_each($2::jsonb)
        ON CONFLICT (player_id, companion_id) DO UPDATE SET state = EXCLUDED.state`, [player.id, states])
    }
    for (const drop of drops) {
      await client.query('INSERT INTO player_items (player_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [player.id, drop.id])
      character.ownedItemIds.push(drop.id)
    }
    const champion = await awardChapterOneTitle(player, stage.id, report, client)
    if (!firstClear) {
      return { result: { report, firstClear: false, unlockedStageId: null, drops: rewardDrops, patrol }, changed: champion || gainedLoot || usedMedicine || !!skillDrop || drops.length > 0 || recruits.length > 0 }
    }

    player.qiExp += rewardQi
    player.silver += report.rewards?.silver ?? rewardSilver
    const renown = trialFirstClearKarma(stage)
    if (renown) changeKarma(character, renown, now)
    trial.rewardedStageIds.push(stage.id)
    trial.stageHours[String(stage.id)] = 0
    delete trial.stageEncounters?.[String(stage.id)]
    const next = Math.min(TRIAL_STAGES.length, stage.id + 1)
    trial.maxStageId = Math.max(trial.maxStageId, next)
    switchPatrolStage(trial, next)
    return {
      result: {
        report,
        firstClear: true,
        unlockedStageId: trial.maxStageId,
        drops: rewardDrops,
        patrol: patrolStatus(character),
      },
      changed: true,
    }
  }))

  app.post<{ Params: { stageId: string } }>('/api/v1/trial/:stageId/replay', (request) => respond<TrialReplayResult>(request, async (character, now, client) => {
    const stage = trialStageOf(Number(request.params.stageId))
    if (!stage) throw new GameError(404, 'TRIAL_STAGE_NOT_FOUND', '江湖图上没有这一关')
    if (!stage.replayPartIds) throw new GameError(400, 'TRIAL_NOT_REPLAYABLE', '这一关没有首领复战')

    const key = String(stage.id)
    const replayHours = character.player.trial.replayHours[key] ?? 0
    if (replayHours < TRIAL_REPLAY_HOURS) {
      throw new GameError(409, 'TRIAL_REPLAY_REQUIRED', `在本关巡历满 ${TRIAL_REPLAY_HOURS} 小时才能再战首领`)
    }

    const report = trialBattle(character, stage, now, undefined, trialAnswer(stage, request.body), battleRetreatRequested(request.body))
    report.battleId = randomUUID()
    const gainedLoot = creditBattleEffectLoot(character.player, report)
    const usedMedicine = spendBattleMedicines(character.player, report)
    if (report.winner !== 'ALLY') return { result: { report, drop: null, replayHours }, changed: gainedLoot || usedMedicine }

    const drop = await awardTrialDrop(character, stage, rollTrialDrop(stage, 'REPLAY')!, now, client)
    await awardChapterOneTitle(character.player, stage.id, report, client)
    character.player.trial.replayHours[key] = 0
    return {
      result: {
        report,
        drop,
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
    if (hasTrialPart(character.ownedItemIds, item.id)) throw new GameError(409, 'TRIAL_ITEM_OWNED', '这个部位已经拿到了')

    character.player.trial.marks[key] = marks - 4
    await client.query('INSERT INTO player_items (player_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [character.player.id, item.id])
    character.ownedItemIds.push(item.id)
    return { result: { itemId: item.id, name: item.name }, changed: true }
  }))
}
