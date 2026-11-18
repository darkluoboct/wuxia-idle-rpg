import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PoolClient } from 'pg'
import { calcNextLevelQi, computeDerivedStats, simulateCoopRaid, simulatePlayerDuel, simulateServerBattle } from '../../shared/battle.ts'
import { creditBattleEffectLoot, spendBattleMedicines } from '../../shared/battleEffects.ts'
import { battleEnvironmentAt, EQUIP_SLOT_META, shichenIdxFromDate, STANCE_META } from '../../shared/combatMeta.ts'
import { extractFurnaceResidue, FORAGE_QI_COST, gatherHerbs, pillDoubleRate, pillSuccessRate } from '../../shared/alchemy.ts'
import { forgeEquipment, forgeMaterials } from '../../shared/equipmentForge.ts'
import { activeJianghuTitle, activeSetBonuses, canEquipCompanionItem, companionView, COMPANIONS, COOP_RAIDS, GHOST_MARKET_LISTINGS, hiddenWeaponCapacity, INN_GIFT_COST, INN_TEA_COST, ITEMS, JIANGHU_TITLES, marketListingPrice, MEDICINES, meetsItemStatRequirement, ONLINE_MAPS, PILL_RECIPES, REALMS, SECTS, SKILLS, totalCompanionSetBonuses, trialRewardItems, unlockedHiddenWeapons } from '../../shared/gameData.ts'
import {
  advancePatrol, announceChapterOneTitle, CHAPTER_ONE_FINAL_STAGE, collectTrialDrop, equippedGearSkill, hasTrialPart, patrolEncounterCount, patrolEncounterRate, recruitTrialCompanions, rollTrialDrop,
  switchPatrolStage, TRIAL_PATROL_HOURS, TRIAL_REPLAY_HOURS, TRIAL_STAGES, trialFirstClearKarma, trialItemOf, trialPartId, trialPuzzleOutcome,
  trialStageOf, upgradesPatrolYield, type TrialStageConfig,
} from '../../shared/trialStages.ts'
import { appraiseGhostCurio, autoEquipItem, autoEquipSkill, canEnterMap, canReceiveSnakeRecipe, cityInspectionDue, coCultivationRate, createNewGameCharacter, createStarterCharacter, cultivatePlayer, cultivationRate, cultivationRates, GHOST_APPRAISAL_SWORD, idleQiNumerator, innAffinityGain, innGiftsRemaining, innVisitDay, karmaAfterEvent, legacyAcupoints, planMapJourney, recipeForPlayer, resolveSeaVoyage, settlePatrolCaches, trialFirstClearSilver } from '../../shared/player.ts'
import { HUASHAN_HONORS, HUASHAN_RESPECT_QI, huashanDay, huashanRankReward, huashanRatingSwing, huashanSeason, huashanSeasonEndsAt } from '../../shared/huashan.ts'
import { GAIBANG_DEBATE, GAIBANG_FINAL_DISHES, gaibangDishFlag, gaibangDishPrepared, gaibangSilverGain } from '../../shared/gaibang.ts'
import { BETRAYAL_BOUNTY, SECT_CHIEF_SALUTE_QI, SECT_CONTEST_MIN_RANK, SECT_SALUTE_QI, sectContestEndsAt, sectContestWeek, sectContributionGain, sectExamBlockReason, sectPromotion, sectPromotionRewards, simulateSectTrial } from '../../shared/sectProgress.ts'
import { eligibleWandererEquipment, gaibangBeggingSilver, sectEquipmentRewardIds, WANDERER_EQUIPMENT } from '../../shared/sectEquipment.ts'
import { MAX_SKILL_MASTERY, QUSAN_CACHE_KEY, searchQusanCache, skillFragmentDiscount, skillPowerAtMastery, skillUpgradeCost } from '../../shared/skillMastery.ts'
import { effectiveMartialStats, hasMartialFreedom } from '../../shared/martialSchools.ts'
import { addAdventureObjective, adventureById, adventureEncounter, affinityCapFor, onlineStoryChapter, ONLINE_STORY_PROGRESS_VERSION, restoreOnlineStoryProgress, STAT_LABEL, storyFirstClearReward, storyProgressFlags, type AdventureBattle, type Reward, type StatKey } from '../../shared/storyData.ts'
import { canChooseStorySnake, STORY_SNAKE_ADVENTURE, storyEncounter } from '../../shared/storySnake.ts'
import { QUANZHEN_LIBRARY } from '../../shared/quanzhen.ts'
import { claimDailyIngot, claimMilestoneIngots, huashanIngot, INGOT, markDailyTask, patrolCacheIngot, resolvedAdventures, type DailyTaskId } from '../../shared/economy.ts'
import { awakenCompanion, blankCompanionState, pullGacha, REUNION_TICKET_COST } from '../../shared/gacha.ts'
import { cookFeastDish, feastActive, gatherFeastIngredient } from '../../shared/feast.ts'
import { ARENA_SCENE, artifactChallengeBlock, artifactState, DAGOU_STAFF, defendedArenas, honorArtifactHolder, simulateElderDuel, spendArtifactAttempt, surrenderArtifact } from '../../shared/artifacts.ts'
import { buySystemStall, checkStallOffer, moveStallGoods, STALL, stallDay, stallInventory, stallMask, stallTax, SYSTEM_STALL_SELLER, systemStalls, systemStallsBought, type StallGoodsKind } from '../../shared/stalls.ts'
import { AUCTION_MASK_COUNT, auctionDay, auctionDividend, auctionDividendAt, auctionLot, auctionWindow, bidderMask, nextAuctionBid, ownsAuctionLot, placeAuctionBid, settleAuctionTickets, softCloseAt, type AuctionTicketLot } from '../../shared/ghostAuction.ts'
import { claimFtueQuest, emptyFtue, recordFtueForage, recordFtueRefine } from '../../shared/ftueQuests.ts'
import { FEATURE_BY_ID, featureLockedText, featureUnlocked, markFeatureSeen, type FeatureId } from '../../shared/features.ts'
import { isOriginId, openToOrigin, originPerk } from '../../shared/origins.ts'
import {
  advanceXiangyangGate, isXiangyangGate, XIANGYANG_GATE_BY_ID, XIANGYANG_GATES, XIANGYANG_ORDER_CAP, XIANGYANG_WAVES, xiangyangAutoTurn, xiangyangDrum,
  xiangyangDrumMerit, xiangyangFullOrders, xiangyangMerit, xiangyangNextAuto, xiangyangNextOrderAt, xiangyangOrdersAt, xiangyangReward, xiangyangSpendOrder,
  xiangyangWar, xiangyangWarOf, xiangyangWave, xiangyangWaveNeed, xiangyangWavesCleared, type XiangyangGateState, type XiangyangOrders, type XiangyangWar,
} from '../../shared/xiangyang.ts'
import { defenseMirror as freezeMirror, mirrorFighter, RAID_LEND, raidLendQi, type DefenseMirror } from '../../shared/mirror.ts'
import { gainReunionClues, newReunion, reunionCluesToday, reunionEncounter, reunionWaitTime, REUNION_INQUIRE_COST, REUNION_QUESTS, REUNION_WAIT_HOURS, type ClueSource, type ReunionQuestConfig } from '../../shared/reunion.ts'
import type {
  ArtifactBoardDTO, ArtifactResult, AuctionBoardDTO, AuctionLotDTO, AuctionResult, AwakenResult, BattleReportDTO, BountyBoardDTO, BountyEntryDTO, ChapterOneStatueDTO, CoCultivationDTO, CoCultivationInviteDTO, CompanionState, CompanionWear, CultivationResult, DuelInviteDTO, FeastResult, ForgeInput, ForgeResult, FtueClaimResult, GachaResult, GameAction, HuashanBoardDTO, HuashanEntryDTO, HuashanResult, IdleGain, InnGiftResult, LibraryResult, LibraryStatusDTO, LoadoutPresetDTO, MapMoveResult, PersonalEquipSlot, PlayerDTO, PlayerSnapshot, StallBoardDTO, StallListingDTO, StallResult,
  MirrorRankEntryDTO, ReunionResult, RichSegment, SectChiefDTO, SectContestBoardDTO, SectContestResult, SectResult, SkillSlotType, SkillUpgradeResult, StoryAdventureResult, StoryChallengeResult, StorySnakeChoiceResult, TrialChallengeResult, TrialDropDTO, TrialPatrolStatusDTO, TrialReplayResult,
  AwayReportDTO, RaidId, RaidMirrorBoardDTO, RoomPlayerDTO, WsServerEvent, XiangyangAwardDTO, XiangyangBoardDTO, XiangyangGateDTO, XiangyangGateId, XiangyangResult,
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
  /** 本次操作改了存档里不随返回值体现的部分（每日江湖事等） */
  dirty?: boolean
  loadoutsDirty?: boolean
  ingotLog?: { delta: number; reason: string; ref?: string }[]
  /** 本次操作提交后要向全服在线侠客推送的消息 */
  broadcasts?: WsServerEvent[]
  /** 本次操作提交后要单独告知某位侠客的消息 */
  whispers?: { playerId: string; event: WsServerEvent }[]
}

/** 元宝变动先记在角色上，随存档一起写流水 */
function logIngot(character: Character, delta: number, reason: string, ref?: string) {
  if (!delta) return
  ;(character.ingotLog ??= []).push({ delta, reason, ref })
  character.dirty = true
}

/** 每人只发一次的周期奖励：流水里已有同一 ref 就不再发 */
async function grantIngotOnce(client: PoolClient, character: Character, amount: number, reason: string, ref: string) {
  const { rowCount } = await client.query('SELECT 1 FROM ingot_ledger WHERE player_id = $1 AND ref = $2', [character.player.id, ref])
  if (rowCount || (character.ingotLog ?? []).some((entry) => entry.ref === ref)) return 0
  character.player.goldIngot += amount
  logIngot(character, amount, reason, ref)
  return amount
}

async function saveCompanion(client: PoolClient, character: Character, id: string) {
  await client.query(`INSERT INTO player_companions (player_id, companion_id, state) VALUES ($1, $2, $3)
    ON CONFLICT (player_id, companion_id) DO UPDATE SET state = EXCLUDED.state`, [character.player.id, id, character.companionAffinity[id]])
}

/** 玩法尚未随剧情开放时拒绝（老角色全部开放） */
function requireFeature(player: PlayerDTO, id: FeatureId) {
  if (!featureUnlocked(player, id)) throw new GameError(409, 'FEATURE_LOCKED', featureLockedText(id))
}

/** 对方的玩法还没开放时，不能拉他一起来 */
function requireTargetFeature(target: PlayerDTO, id: FeatureId) {
  if (!featureUnlocked(target, id)) throw new GameError(409, 'TARGET_FEATURE_LOCKED', `「${target.nickname}」初入江湖，还没有接触这门玩法`)
}

function markDaily(character: Character, task: DailyTaskId, now: number) {
  if (markDailyTask(character.player, task, now)) character.dirty = true
}

function learnedSkill(character: Character, id: string) {
  if (autoEquipSkill(character.loadouts, id)) character.loadoutsDirty = true
}

function gainedItem(character: Character, id: string) {
  if (autoEquipItem(character.loadouts, id, character.player.stats)) character.loadoutsDirty = true
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
  return state?.recruited && config ? companionView(config, state) : undefined
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
  return freezeMirror({ ...duelFighter(character), companionAffinity: character.companionAffinity })
}

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
    const cache = settlePatrolCaches(player, activeLoadout(character), encounters, now)
    const ingot = cache ? patrolCacheIngot(player, cache.count, now) : 0
    if (cache && ingot) {
      cache.ingot = ingot
      if (player.trial.recentCache) player.trial.recentCache.ingot = ingot
      logIngot(character, ingot, 'patrol')
    }
    character.patrolCache = cache
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
  if (drop.outcome === 'NEW') gainedItem(character, drop.id)
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
  const { nickname: name, avatarId = 'hero_sword', origin } = objectBody(input)
  const nickname = typeof name === 'string' ? name.trim().normalize('NFKC') : ''
  if (!/^[\p{L}\p{N}·_-]{2,16}$/u.test(nickname)) {
    throw new GameError(400, 'INVALID_PLAYER', '取个 2 至 16 字的侠客名，可用文字、数字或 · _ -')
  }
  if (avatarId !== 'hero_sword' && avatarId !== 'hero_sword_male') {
    throw new GameError(400, 'INVALID_AVATAR', '请选择男侠或女侠')
  }
  if (!isOriginId(origin)) throw new GameError(400, 'INVALID_ORIGIN', '请选择家世')
  return transaction(async (client) => {
    await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [accountId])
    const { rows: [existing] } = await client.query<Pick<CharacterRow, 'nickname' | 'profile'>>(
      'SELECT nickname, profile FROM players WHERE account_id = $1', [accountId],
    )
    const now = await serverTime(client)
    if (existing) {
      if (existing.nickname !== nickname || existing.profile.avatarId !== avatarId || existing.profile.origin !== origin) {
        throw new GameError(409, 'PLAYER_ALREADY_CREATED', '这个账号已有角色')
      }
      const character = await readCharacter(client, accountId, true)
      return snapshot(character, Math.max(now, character.player.lastSettleAt))
    }

    const id = randomUUID()
    const starter = createNewGameCharacter({ id, nickname, avatarId }, now, origin)
    starter.player.openedAcupointIds = starter.openedAcupointIds
    starter.player.acupointPills = { pozhang_dan: starter.pillCount }
    starter.player.alchemy = { herbs: starter.herbInventory, pity: {}, residue: 0 }
    starter.player.ftue = emptyFtue()
    const { rowCount } = await client.query(
      `INSERT INTO players (id, account_id, nickname, profile, pill_count, last_settle_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (nickname) DO NOTHING`,
      [id, accountId, nickname, profileOf(starter.player), starter.pillCount, now],
    )
    if (!rowCount) throw new GameError(409, 'NICKNAME_TAKEN', '这位侠客的名字已有人用')
    await client.query(`INSERT INTO ingot_ledger (player_id, delta, balance, reason, ref, created_at)
      VALUES ($1, $2, $2, 'start', 'start', $3)`, [id, starter.player.goldIngot, now])

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

interface ArtifactRow {
  item_id: string
  holder_id: string | null
  held_since: string
  seen_at: string
}

type ArtifactLossCause = NonNullable<PlayerDTO['artifactLoss']>['cause']

/** 把真品从执棒者手里拿走：摘下配装、按守擂届数补偿玄铁、留一条失棒记录，并向全服传告 */
async function takeArtifact(client: PoolClient, holder: Character, row: ArtifactRow, now: number, cause: ArtifactLossCause, by: Character | null) {
  await client.query('DELETE FROM player_items WHERE player_id = $1 AND item_id = $2', [holder.player.id, row.item_id])
  holder.ownedItemIds = holder.ownedItemIds.filter((id) => id !== row.item_id)
  const iron = surrenderArtifact(holder.player, holder.loadouts, Number(row.held_since), now, cause !== 'BETRAY')
  holder.player.artifactLoss = { itemId: row.item_id, at: now, cause, iron, by: by?.player.nickname ?? null }
  holder.loadoutsDirty = true
  holder.dirty = true
  await client.query('UPDATE unique_artifacts SET holder_id = $2, held_since = $3, seen_at = $3 WHERE item_id = $1', [row.item_id, by?.player.id ?? null, now])
  ;(holder.broadcasts ??= []).push({ event: 'UNIQUE_ARTIFACT_CHANGED', data: {
    itemId: row.item_id, cause, newOwner: by?.player.nickname ?? null, previousOwner: holder.player.nickname,
  } })
}

/** 真品到手：进背包、空着的兵器栏自动装上、记「曾执」印记 */
async function receiveArtifact(client: PoolClient, character: Character, itemId: string) {
  await client.query('INSERT INTO player_items (player_id, item_id) VALUES ($1, $2)', [character.player.id, itemId])
  character.ownedItemIds.push(itemId)
  gainedItem(character, itemId)
  honorArtifactHolder(character.player)
  character.dirty = true
}

/**
 * 执棒者每次操作都算露面；久未露面再回来，打狗棒已由长老收回。
 * ponytail: 露面时间十分钟内只记一次，执棒者只有一位，不会成为热点。
 */
async function touchArtifact(client: PoolClient, character: Character, now: number) {
  if (!character.ownedItemIds.includes(DAGOU_STAFF.itemId)) return
  const { rows: [row] } = await client.query<ArtifactRow>(
    'SELECT * FROM unique_artifacts WHERE item_id = $1 AND holder_id = $2 FOR UPDATE', [DAGOU_STAFF.itemId, character.player.id])
  if (!row) return
  const idle = now - Number(row.seen_at)
  if (idle >= DAGOU_STAFF.idleRecallMs) await takeArtifact(client, character, row, now, 'RECALL', null)
  else if (idle > 600_000) await client.query('UPDATE unique_artifacts SET seen_at = $2 WHERE item_id = $1', [row.item_id, now])
}

interface StallRow {
  id: string
  seller_id: string
  kind: StallGoodsKind
  goods_id: string
  qty: number
  unit_price: number
  sold: number
  proceeds: number
  created_at: string
  expires_at: string
}

/** 收一个摊：卖得的纹银入账；卖完、到期或撤摊的把剩货退回并删掉数据行。返回这个摊位是否已收掉 */
async function closeStall(client: PoolClient, character: Character, row: StallRow, now: number, cancel = false) {
  const { player } = character
  player.silver += row.proceeds
  const closed = cancel || row.qty === 0 || now >= Number(row.expires_at)
  if (closed) {
    if (row.qty) moveStallGoods(stallInventory(player), row.kind, row.goods_id, row.qty)
    await client.query('DELETE FROM stall_listings WHERE id = $1', [row.id])
  } else if (row.proceeds) {
    await client.query('UPDATE stall_listings SET proceeds = 0 WHERE id = $1', [row.id])
  }
  return closed
}

/** 有摊位在外的侠客，每次操作前先结一次账 */
async function settleStalls(client: PoolClient, character: Character, now: number) {
  const { player } = character
  if (!player.stallOpen) return
  const { rows } = await client.query<StallRow>('SELECT * FROM stall_listings WHERE seller_id = $1 ORDER BY created_at, id FOR UPDATE', [player.id])
  let open = 0
  let silver = 0
  let returned = 0
  for (const row of rows) {
    silver += row.proceeds
    if (await closeStall(client, character, row, now)) returned += row.qty
    else open++
  }
  if (silver || returned) player.stallIncome = { at: now, silver, returned }
  if (silver || returned || open !== player.stallOpen) {
    player.stallOpen = open
    character.dirty = true
  }
}

interface AuctionRow {
  day: number
  item_id: string
  start_price: number
  price: number
  leader_id: string | null
  /** 领先者的心理价；早先的场次没有，按当前价算 */
  leader_max: number | null
  bids: number
  closes_at: string
  mask_salt: string
  claimed: boolean
}

/** 一场暗拍的红封签（当日领过每日江湖事）：持签人数、这位侠客是否持签、在抽签次序（按本场随机盐打乱）里的名次 */
async function auctionTicketsOf(client: PoolClient, row: Pick<AuctionRow, 'day' | 'mask_salt'>, playerId: string) {
  const { rows: [tickets] } = await client.query<{ eligible: number; holds: boolean; rank: number }>(`
    SELECT count(*)::int AS eligible, COALESCE(bool_or(player_id = $2::uuid), false) AS holds,
      (count(*) FILTER (WHERE md5($3 || player_id::text) < md5($3 || $2)))::int AS rank
    FROM ingot_ledger WHERE reason = 'daily' AND ref = $1`,
  [`daily:${row.day}`, playerId, row.mask_salt])
  return tickets
}

/** 红封开签：鬼市日过完的子时，落槌顺延过了子时就等落槌 */
const dividendPaysAt = (row: Pick<AuctionRow, 'day' | 'closes_at'>) => Math.max(auctionDividendAt(row.day), Number(row.closes_at))

/** 落槌后兑付红封签：流拍作废，未中签也销签 */
async function settleAuctionDividends(client: PoolClient, character: Character, now: number) {
  const { player } = character
  const due = (player.auctionTickets ?? []).filter((day) => now >= auctionDividendAt(day))
  if (!due.length) return []
  const { rows } = await client.query<AuctionRow>('SELECT * FROM ghost_auctions WHERE day = ANY($1::integer[])', [due])
  const lots = new Map<number, AuctionTicketLot>()
  for (const row of rows) {
    const closesAt = Number(row.closes_at)
    const tickets = now >= dividendPaysAt(row) ? await auctionTicketsOf(client, row, player.id) : { eligible: 0, rank: 0 }
    lots.set(row.day, { price: row.price, bids: row.bids, closesAt, ...tickets })
  }
  const before = player.auctionTickets!.length
  const settled = settleAuctionTickets(player, now, (day) => lots.get(day))
  for (const { day, ingot } of settled) logIngot(character, ingot, 'auction-dividend', `auction-dividend:${day}`)
  if (player.auctionTickets!.length !== before) character.dirty = true
  return settled
}

async function flushIngots(client: PoolClient, character: Character, now: number) {
  const entries = character.ingotLog ?? []
  character.ingotLog = undefined
  if (!entries.length) return
  // 流水按发生顺序重放余额；同一 ref 已入账过的条目跳过并从余额里退回
  let balance = character.player.goldIngot - entries.reduce((sum, { delta }) => sum + delta, 0)
  for (const { delta, reason, ref } of entries) {
    const { rowCount } = await client.query(`INSERT INTO ingot_ledger (player_id, delta, balance, reason, ref, created_at)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [character.player.id, delta, balance + delta, reason, ref ?? null, now])
    if (rowCount) balance += delta
  }
  character.player.goldIngot = balance
}

async function saveCharacter(client: PoolClient, character: Character, now: number) {
  const { player } = character
  await flushIngots(client, character, now)
  if (character.loadoutsDirty) {
    for (const preset of character.loadouts) {
      await client.query('UPDATE player_loadouts SET preset = $3 WHERE player_id = $1 AND preset_idx = $2', [player.id, preset.presetIdx, preset])
    }
    character.loadoutsDirty = false
  }
  character.dirty = false
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
  broadcasts?: WsServerEvent[]
  whispers?: NonNullable<Character['whispers']>
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

        await touchArtifact(client, character, now)
        await settleStalls(client, character, now)
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
        for (const { key, amount } of claimMilestoneIngots({
          player: character.player, rewardedChapters: character.rewardedChapters,
          adventureIds: resolvedAdventures(character.player), companionAffinity: character.companionAffinity,
        })) logIngot(character, amount, 'milestone', key)
        await settleAuctionDividends(client, character, now)
        const changed = patrolChanged || applied || !!character.dirty || !!character.loadoutsDirty
        if (changed) await saveCharacter(client, character, now)
        for (const other of related) await saveCharacter(client, other, now)
        await client.query('INSERT INTO player_actions VALUES ($1, $2, $3, $4)', [row.id, requestId, fingerprint, result])
        const latest = snapshot(character, now)
        const updates = changed ? [latest] : []
        for (const other of related) updates.push(snapshot(other, now))
        const involved = [character, ...related]
        return {
          response: { snapshot: latest, result }, updates,
          broadcasts: involved.flatMap((entry) => entry.broadcasts ?? []), whispers: involved.flatMap((entry) => entry.whispers ?? []),
        }
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

/** 给不在线的侠客留帖共修：一天内有效 */
const CO_CULTIVATION_NOTE_MS = 24 * 3_600_000

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
    const { response, updates, broadcasts = [], whispers = [] } = await writeAction(request, apply)
    for (const updated of updates) rooms.publish(updated)
    for (const event of broadcasts) rooms.announce(event)
    for (const { playerId, event } of whispers) rooms.sendToPlayer(playerId, event)
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
    requireFeature(character.player, 'HUASHAN')
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
    const ingot = await grantIngotOnce(client, character, huashanIngot(entry.rank), 'huashan', `huashan:${seasonId}`)
    return { result: { action, ...award, ingot }, changed: true }
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
    requireFeature(character.player, 'SECT')
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

  // ==================== 襄阳守卫战（docs/20） ====================
  interface XiangyangEntryRow {
    war_id: number; gate: XiangyangGateId; sorties: number; auto_sorties: number; merit: number
    orders: number; orders_at: string; skill_id: string | null; claimed: boolean
  }
  interface XiangyangPostRow { player_id: string; gate: XiangyangGateId; mirror: DefenseMirror; mirror_at: string; due_at: string; due_war: number }
  type XiangyangFighter = Pick<Parameters<typeof simulateServerBattle>[0], 'player' | 'loadout' | 'learnedSkills' | 'bonus' | 'companionOf'>

  const gateName = (id: XiangyangGateId) => XIANGYANG_GATE_BY_ID[id].name.split(' · ')[0]
  /** 本场还没出过战：手上三道军令 */
  const entryOrders = (entry: XiangyangEntryRow | undefined, at: number): XiangyangOrders =>
    entry ? { stored: entry.orders, asOf: Number(entry.orders_at) } : xiangyangFullOrders(at)

  async function xiangyangEntry(client: PoolClient, warId: number, playerId: string) {
    const { rows: [entry] } = await client.query<XiangyangEntryRow>(
      'SELECT * FROM xiangyang_entries WHERE war_id = $1 AND player_id = $2', [warId, playerId])
    return entry as XiangyangEntryRow | undefined
  }

  async function xiangyangGates(client: PoolClient, warId: number): Promise<XiangyangGateDTO[]> {
    const { rows } = await client.query<{ gate: XiangyangGateId; wave: number | null; progress: number | null; defenders: number }>(`
      SELECT g.id AS gate, s.wave, s.progress,
        (SELECT count(*)::int FROM xiangyang_entries e WHERE e.war_id = $1 AND e.gate = g.id) AS defenders
      FROM unnest($2::text[]) AS g(id) LEFT JOIN xiangyang_gates s ON s.war_id = $1 AND s.gate = g.id`,
    [warId, XIANGYANG_GATES.map(({ id }) => id)])
    return XIANGYANG_GATES.map(({ id }) => {
      const row = rows.find(({ gate }) => gate === id)!
      return { id, wave: row.wave ?? 1, progress: row.progress ?? 0, need: xiangyangWaveNeed(row.defenders), defenders: row.defenders }
    })
  }

  /** 已经收兵、值守也都打完了、还没领的封赏；名次按本门战功，并列同名次 */
  async function xiangyangAwards(client: PoolClient, character: Character, now: number): Promise<XiangyangAwardDTO[]> {
    const { rows } = await client.query<XiangyangEntryRow & { wave: number | null; rank: number }>(`
      SELECT e.*, g.wave,
        (SELECT count(*)::int FROM xiangyang_entries o WHERE o.war_id = e.war_id AND o.gate = e.gate AND o.merit > e.merit) + 1 AS rank
      FROM xiangyang_entries e LEFT JOIN xiangyang_gates g ON g.war_id = e.war_id AND g.gate = e.gate
      WHERE e.player_id = $1 AND NOT e.claimed AND e.sorties > 0 ORDER BY e.war_id`, [character.player.id])
    // 值守出战的时刻不晚于所在那场收兵：最早的一次还在某场收兵之前，那一场就还没打完
    const { rows: [{ due }] } = await client.query<{ due: string | null }>('SELECT min(due_at) AS due FROM xiangyang_posts')
    const settled = (warId: number) => {
      const { closesAt } = xiangyangWarOf(warId)
      return closesAt <= now && (due === null || Number(due) > closesAt)
    }
    return rows.filter(({ war_id: warId }) => settled(warId)).map((row) => {
      const wavesCleared = xiangyangWavesCleared({ wave: row.wave ?? 1 })
      const topThree = row.rank <= 3
      return {
        warId: row.war_id, gate: row.gate, wavesCleared, merit: row.merit, sorties: row.sorties, topThree,
        skillId: row.skill_id && SKILLS[row.skill_id] ? row.skill_id : null,
        reward: xiangyangReward(row, wavesCleared, character.player.level, topThree)!,
      }
    })
  }

  async function grantXiangyangAward(client: PoolClient, character: Character, { warId, reward, skillId }: XiangyangAwardDTO) {
    const { player } = character
    await client.query('UPDATE xiangyang_entries SET claimed = true WHERE war_id = $1 AND player_id = $2', [warId, player.id])
    await grantIngotOnce(client, character, reward.ingot, 'xiangyang', `xiangyang:${warId}`)
    forgeMaterials(player, reward.iron, reward.stones)
    if (skillId) {
      const fragments = player.skillFragments ??= {}
      fragments[skillId] = (fragments[skillId] ?? 0) + reward.fragments
    }
    player.qiExp += reward.qiExp
    player.silver += reward.silver
    character.dirty = true
  }

  function xiangyangBattle(fighter: XiangyangFighter, gate: XiangyangGateId, wave: number, at: number, scene: string, ownedItemIds?: readonly string[]) {
    const encounter = xiangyangWave(gate, wave, fighter.player.level)
    const report = simulateServerBattle({
      ...fighter, ...encounter, mode: 'SOLO_STORY', ownedItemIds,
      sceneTitle: `${scene} · ${gateName(gate)}第 ${wave} 波`,
      environment: { at, ...encounter.environment },
    })
    report.battleId = randomUUID()
    return report
  }

  /** 全服一把事务锁：值守结算、亲自出战与改值守都在锁内，城门推进的先后与时间一致 */
  const lockXiangyang = (client: PoolClient) => client.query('SELECT pg_advisory_xact_lock(834, 0)')

  /** 在一门打一仗：先记上出战者（守军人数算上自己），再锁城门、按当下波次开打，记战功与战报 */
  async function xiangyangFight(client: PoolClient, input: {
    warId: number; gate: XiangyangGateId; playerId: string; at: number; auto: boolean; drum: boolean
    fight: (wave: number) => BattleReportDTO
  }) {
    const { warId, gate, playerId, at, auto, drum } = input
    await client.query(`INSERT INTO xiangyang_entries (war_id, player_id, gate, orders, orders_at) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING`, [warId, playerId, gate, XIANGYANG_ORDER_CAP, at])
    await client.query('INSERT INTO xiangyang_gates (war_id, gate) VALUES ($1, $2) ON CONFLICT DO NOTHING', [warId, gate])
    const { rows: [state] } = await client.query<XiangyangGateState>(
      'SELECT wave, progress FROM xiangyang_gates WHERE war_id = $1 AND gate = $2 FOR UPDATE', [warId, gate])
    const { rows: [{ defenders }] } = await client.query<{ defenders: number }>(
      'SELECT count(*)::int AS defenders FROM xiangyang_entries WHERE war_id = $1 AND gate = $2', [warId, gate])
    const wave = Math.min(state.wave, XIANGYANG_WAVES)
    const report = input.fight(wave)
    const merit = drum ? xiangyangDrumMerit(xiangyangMerit(report)) : xiangyangMerit(report)
    const next = advanceXiangyangGate(state, merit, defenders)
    await client.query('UPDATE xiangyang_gates SET wave = $3, progress = $4 WHERE war_id = $1 AND gate = $2', [warId, gate, next.wave, next.progress])
    await client.query(`UPDATE xiangyang_entries SET sorties = sorties + 1, auto_sorties = auto_sorties + $3, merit = merit + $4
      WHERE war_id = $1 AND player_id = $2`, [warId, playerId, auto ? 1 : 0, merit])
    await client.query(`INSERT INTO xiangyang_sorties (war_id, player_id, gate, wave, merit, won, repelled, created_at, auto, drum)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [warId, playerId, gate, wave, merit, report.winner === 'ALLY', next.repelled.at(-1) ?? null, at, auto, drum])
    return {
      report, merit, repelled: next.repelled,
      gate: { id: gate, wave: next.wave, progress: next.progress, need: xiangyangWaveNeed(defenders), defenders },
    }
  }

  /** 把到期的值守出战按时刻先后逐一打完；一次最多打 limit 仗，余下的下回接着打 */
  async function sweepXiangyang(client: PoolClient, until: number, limit = 300) {
    await lockXiangyang(client)
    for (let fought = 0; fought < limit;) {
      const { rows: [post] } = await client.query<XiangyangPostRow>(
        'SELECT * FROM xiangyang_posts WHERE due_at <= $1 ORDER BY due_at, player_id LIMIT 1', [until])
      if (!post) return
      // 记出战要对角色行加外键锁：这位侠客正在别的操作里（角色行已锁、在等这把襄阳锁）就先停下，由那边接着打，免得互相等锁
      const { rowCount: free } = await client.query('SELECT 1 FROM players WHERE id = $1 FOR KEY SHARE SKIP LOCKED', [post.player_id])
      if (!free) return
      const war = xiangyangWarOf(post.due_war)
      const at = Number(post.due_at)
      const entry = await xiangyangEntry(client, war.id, post.player_id)
      const gate = entry?.gate ?? post.gate
      const turn = xiangyangAutoTurn(war, entryOrders(entry, at), at)
      const fighter = mirrorFighter(post.mirror)
      await client.query('SAVEPOINT xiangyang_auto')
      try {
        for (let order = 0; order < turn.count; order++) {
          await xiangyangFight(client, {
            warId: war.id, gate, playerId: post.player_id, at, auto: true, drum: false,
            fight: (wave) => xiangyangBattle(fighter, gate, wave, at, '襄阳值守'),
          })
        }
        await client.query('RELEASE SAVEPOINT xiangyang_auto')
      } catch (error) {
        // 镜像打不了（比如配装里的武学已下架）：这一回作罢、照常排下一回，不卡住全服的值守
        await client.query('ROLLBACK TO SAVEPOINT xiangyang_auto')
        app.log.error(error)
      }
      fought += turn.count
      await client.query('UPDATE xiangyang_entries SET orders = $3, orders_at = $4, skill_id = $5 WHERE war_id = $1 AND player_id = $2',
        [war.id, post.player_id, turn.orders.stored, turn.orders.asOf, fighter.loadout.outerSkillId])
      const next = xiangyangNextAuto(war, turn.orders)
      await client.query('UPDATE xiangyang_posts SET due_at = $2, due_war = $3 WHERE player_id = $1', [post.player_id, next.at, next.warId])
    }
  }

  async function sweepXiangyangIfDue(client: PoolClient, until: number) {
    const { rowCount } = await client.query('SELECT 1 FROM xiangyang_posts WHERE due_at <= $1 LIMIT 1', [until])
    if (rowCount) await sweepXiangyang(client, until)
  }

  // 值守出战不等人来看：每分钟结算一次到期的
  const xiangyangSweeper = setInterval(() => {
    void transaction(async (client) => sweepXiangyangIfDue(client, await serverTime(client))).catch((error) => app.log.error(error))
  }, 60_000)
  xiangyangSweeper.unref()
  app.addHook('onClose', async () => clearInterval(xiangyangSweeper))

  /** 值守此门：镜像按当下配装；镜像下一次替你出战按手上的军令重排 */
  async function saveXiangyangPost(client: PoolClient, character: Character, gate: XiangyangGateId, war: XiangyangWar, orders: XiangyangOrders, now: number) {
    const due = xiangyangNextAuto(war, orders)
    await client.query(`INSERT INTO xiangyang_posts (player_id, gate, mirror, mirror_at, due_at, due_war) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (player_id) DO UPDATE SET gate = EXCLUDED.gate, mirror = EXCLUDED.mirror, mirror_at = EXCLUDED.mirror_at,
        due_at = EXCLUDED.due_at, due_war = EXCLUDED.due_war`, [character.player.id, gate, defenseMirror(character), now, due.at, due.warId])
  }

  /** 江湖邸报（docs/21）：上次收功以来、你不在场时发生的事；助战真气与红封在这里到账 */
  async function awayReport(client: PoolClient, character: Character, now: number): Promise<AwayReportDTO> {
    const { player } = character
    const since = player.lastReportAt ?? player.lastSettleAt
    player.lastReportAt = now
    character.dirty = true
    await sweepXiangyangIfDue(client, now)
    const window = [player.id, since, now]
    const { rows: [xiangyang] } = await client.query<{ sorties: number; merit: number }>(`
      SELECT count(*)::int AS sorties, COALESCE(sum(merit), 0)::int AS merit FROM xiangyang_sorties
      WHERE player_id = $1 AND auto AND created_at > $2 AND created_at <= $3`, window)
    const { rows: [sales] } = await client.query<{ count: number; silver: number }>(`
      SELECT COALESCE(sum(qty), 0)::int AS count, COALESCE(sum(qty * unit_price - tax), 0)::int AS silver FROM stall_sales
      WHERE seller_id = $1 AND created_at > $2 AND created_at <= $3`, window)
    const { rows: [lent] } = await client.query<{ lends: number; lend_qi: string }>(`
      WITH old AS (SELECT lends, lend_qi FROM raid_mirrors WHERE player_id = $1 AND lends > 0 FOR UPDATE)
      UPDATE raid_mirrors m SET lends = 0, lend_qi = 0 FROM old WHERE m.player_id = $1 RETURNING old.lends, old.lend_qi`, [player.id])
    if (lent) player.qiExp += Number(lent.lend_qi)
    const dividends = await settleAuctionDividends(client, character, now)
    return {
      since,
      ...(xiangyang.sorties ? { xiangyang } : {}),
      ...(sales.count ? { stallSales: sales } : {}),
      ...(dividends.length ? { dividends } : {}),
      ...(lent ? { raidLends: { count: lent.lends, qiExp: Number(lent.lend_qi) } } : {}),
    }
  }

  /** 收功时顺带领已论功的襄阳封赏 */
  async function claimXiangyangAwards(client: PoolClient, character: Character, now: number) {
    const { rowCount } = await client.query('SELECT 1 FROM xiangyang_entries WHERE player_id = $1 AND NOT claimed AND war_id < $2 LIMIT 1',
      [character.player.id, xiangyangWar(now).id])
    if (!rowCount) return []
    await sweepXiangyangIfDue(client, now)
    const awards = await xiangyangAwards(client, character, now)
    for (const award of awards) await grantXiangyangAward(client, character, award)
    return awards.map(({ warId, skillId, reward }) => ({ warId, skillId, reward }))
  }

  app.get('/api/v1/xiangyang', async (request): Promise<XiangyangBoardDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const character = await readCharacter(client, accountId)
      requireFeature(character.player, 'XIANGYANG')
      const now = await serverTime(client)
      await sweepXiangyangIfDue(client, now)
      const war = xiangyangWar(now)
      const playerId = character.player.id
      const self = await xiangyangEntry(client, war.id, playerId)
      const { rows: [post] } = await client.query<XiangyangPostRow>('SELECT * FROM xiangyang_posts WHERE player_id = $1', [playerId])
      const orders = entryOrders(self, now)
      const { rows: feed } = await client.query<{ at: string; nickname: string; gate: XiangyangGateId; wave: number; merit: number; won: boolean; repelled: number | null; auto: boolean; drum: boolean }>(`
        SELECT s.created_at AS at, p.nickname, s.gate, s.wave, s.merit, s.won, s.repelled, s.auto, s.drum
        FROM xiangyang_sorties s JOIN players p ON p.id = s.player_id WHERE s.war_id = $1 ORDER BY s.id DESC LIMIT 20`, [war.id])
      const { rows: [{ last }] } = await client.query<{ last: number | null }>(
        'SELECT max(war_id) AS last FROM xiangyang_gates WHERE war_id < $1', [war.id])
      return {
        war,
        drum: xiangyangDrum(now),
        gates: await xiangyangGates(client, war.id),
        self: self ? { gate: self.gate, sorties: self.sorties, autoSorties: self.auto_sorties, merit: self.merit } : null,
        orders: { count: xiangyangOrdersAt(war, orders, now), nextAt: xiangyangNextOrderAt(war, orders, now) },
        post: post ? { gate: post.gate, mirrorAt: Number(post.mirror_at), nextAutoAt: Number(post.due_at) } : null,
        feed: feed.map(({ at, repelled, auto, drum, ...row }) => ({
          ...row, at: Number(at), ...(repelled ? { repelled } : {}), ...(auto ? { auto } : {}), ...(drum ? { drum } : {}),
        })),
        awards: await xiangyangAwards(client, character, now),
        last: last === null ? null : {
          warId: last, gates: (await xiangyangGates(client, last)).map((gate) => ({ id: gate.id, wavesCleared: xiangyangWavesCleared(gate) })),
        },
      }
    })
  })

  app.post('/api/v1/xiangyang', (request) => respond<XiangyangResult>(request, async (character, now, client) => {
    const { player } = character
    requireFeature(player, 'XIANGYANG')
    const body = objectBody(request.body)
    if (body.action === 'claim') {
      await sweepXiangyangIfDue(client, now)
      const award = (await xiangyangAwards(client, character, now)).find(({ warId }) => warId === body.warId)
      if (!award) throw new GameError(409, 'XIANGYANG_NO_AWARD', '这一场没有待领的封赏')
      await grantXiangyangAward(client, character, award)
      return { result: { action: 'claim', warId: award.warId, skillId: award.skillId, reward: award.reward }, changed: true }
    }
    const { gate } = body
    if (!isXiangyangGate(gate)) throw new GameError(400, 'XIANGYANG_INVALID_GATE', '请选择要守的城门')
    if (body.action === 'drill') {
      const wave = body.wave
      if (typeof wave !== 'number' || !Number.isInteger(wave) || wave < 1 || wave > XIANGYANG_WAVES) {
        throw new GameError(400, 'XIANGYANG_INVALID_WAVE', `演练只能选第 1 至 ${XIANGYANG_WAVES} 波`)
      }
      const report = xiangyangBattle(duelFighter(character), gate, wave, now, '城头演练', character.ownedItemIds)
      return { result: { action: 'drill', report, merit: xiangyangMerit(report) }, changed: false }
    }
    if (body.action !== 'sortie' && body.action !== 'post') throw new GameError(400, 'XIANGYANG_INVALID_ACTION', '请选择出战、值守、演练或领赏')
    const war = xiangyangWar(now)
    // 先把到期的值守出战打完，再轮到这一次
    await sweepXiangyang(client, now)
    const entry = await xiangyangEntry(client, war.id, player.id)
    if (body.action === 'post') {
      await saveXiangyangPost(client, character, gate, war, entryOrders(entry, now), now)
      return { result: { action: 'post', gate, current: !entry || entry.gate === gate }, changed: false }
    }
    if (body.warId !== war.id) throw new GameError(409, 'XIANGYANG_WAR_CHANGED', '这一场已经换过，请刷新战况')
    if (entry && entry.gate !== gate) {
      throw new GameError(409, 'XIANGYANG_GATE_FIXED', `本场你守的是${gateName(entry.gate)}，不能换门；改值守从下一场起算`)
    }
    const orders = entryOrders(entry, now)
    if (xiangyangOrdersAt(war, orders, now) <= 0) throw new GameError(409, 'XIANGYANG_NO_ORDERS', '手上没有军令了，每 8 小时回一道')
    const drum = xiangyangDrum(now).active
    const sortie = await xiangyangFight(client, {
      warId: war.id, gate, playerId: player.id, at: now, auto: false, drum,
      fight: (wave) => {
        const report = xiangyangBattle(duelFighter(character), gate, wave, now, '襄阳守城', character.ownedItemIds)
        creditBattleEffectLoot(player, report)
        spendBattleMedicines(player, report)
        return report
      },
    })
    markDaily(character, 'battle', now)
    const spent = xiangyangSpendOrder(war, orders, now)
    await client.query('UPDATE xiangyang_entries SET orders = $3, orders_at = $4, skill_id = $5 WHERE war_id = $1 AND player_id = $2',
      [war.id, player.id, spent.stored, spent.asOf, activeLoadout(character).outerSkillId])
    await saveXiangyangPost(client, character, gate, war, spent, now)
    return { result: { action: 'sortie', drum, ...sortie }, changed: true }
  }))

  app.post('/api/v1/cultivate/settle', (request) => respond(request, async (character, now, client) => {
    let changed = now > character.player.lastSettleAt || !!(character.coCultivation && character.coCultivation.endsAt <= now)
    markDaily(character, 'settle', now)
    const reunionClues: NonNullable<IdleGain['reunionClues']> = {}
    const elapsed = now - (character.patrolIdleFrom ?? character.player.lastSettleAt)
    const flags = storyProgressFlags(character.rewardedChapters, character.player.storyFlags)
    const feastIngredient = feastActive(character.companionAffinity.hongqigong, flags)
      ? gatherFeastIngredient(character.player, elapsed / 1000)?.id : undefined
    if (feastIngredient) changed = true
    const contestIngot = await claimSectContestIngots(client, character, now)
    const xiangyang = await claimXiangyangAwards(client, character, now)
    const away = await awayReport(client, character, now)
    const { defenseNotices } = character.player
    if (defenseNotices?.length) {
      delete character.player.defenseNotices
      changed = true
    }
    if (elapsed >= 3_600_000) {
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
    return {
      result: {
        ...gain, drops: character.patrolDrops, forgeMaterials: character.patrolForgeMaterials, patrolCache: character.patrolCache, reunionClues,
        ...(feastIngredient ? { feastIngredient } : {}), ...(contestIngot ? { contestIngot } : {}), ...(xiangyang.length ? { xiangyang } : {}),
        ...(defenseNotices?.length ? { defenseNotices } : {}),
        away,
      },
      changed,
    }
  }))

  /** 门派演武：已结榜的往周按参与 / 首席发元宝，每周一次 */
  async function claimSectContestIngots(client: PoolClient, character: Character, now: number) {
    const { rows } = await client.query<{ week_id: number; chief: boolean }>(`
      SELECT e.week_id, r.chief_id IS NOT DISTINCT FROM e.player_id AS chief
      FROM sect_contest_entries e JOIN sect_contest_results r ON r.sect_id = e.sect_id AND r.week_id = e.week_id
      WHERE e.player_id = $1 AND e.matches > 0 AND e.week_id < $2
        AND NOT EXISTS (SELECT 1 FROM ingot_ledger l WHERE l.player_id = e.player_id AND l.ref = 'sect-contest:' || e.week_id)`,
    [character.player.id, sectContestWeek(now)])
    let total = 0
    for (const { week_id: week, chief } of rows) {
      total += await grantIngotOnce(client, character, chief ? INGOT.sectContestChief : INGOT.sectContestJoin, 'sect-contest', `sect-contest:${week}`)
    }
    return total
  }

  app.post('/api/v1/equipment/forge', (request) => respond<ForgeResult>(request, async (character, now, client) => {
    const { action, itemId, lock } = objectBody(request.body)
    if (typeof itemId !== 'string' || (action !== 'temper' && action !== 'salvage' && action !== 'reforge') ||
      (lock !== undefined && (action !== 'reforge' || (lock !== 'primary' && lock !== 'secondary')))) {
      throw new GameError(400, 'INVALID_FORGE_ACTION', '请选择装备和精铸操作')
    }
    if (action === 'reforge') requireFeature(character.player, 'GHOST')
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
    learnedSkill(character, id)
    return { id, name: skill.name, tier: skill.tier }
  }

  async function grantItems(client: PoolClient, character: Character, ids: readonly string[]) {
    const added = []
    for (const id of ids) {
      if (!ITEMS[id] || character.ownedItemIds.includes(id)) continue
      const { rowCount } = await client.query('INSERT INTO player_items (player_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [character.player.id, id])
      if (rowCount) {
        character.ownedItemIds.push(id)
        gainedItem(character, id)
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
    requireFeature(character.player, 'SECT')
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
      if (!before) {
        learnedSkill(character, id)
        items.push({ id, name: skill.name, tier: skill.tier })
      }
    }
    for (const id of await grantItems(client, character, reward.items ?? [])) {
      items.push({ id, name: ITEMS[id].name, tier: ITEMS[id].tier })
    }

    const flags = storyProgressFlags(character.rewardedChapters, player.storyFlags)
    for (const [id, amount] of Object.entries(reward.affinity ?? {})) {
      const companion = COMPANIONS[id]
      if (!companion) continue
      const state = character.companionAffinity[id] ??= blankCompanionState(id)
      const before = state.affinity
      state.met = true
      state.affinity = Math.max(before, Math.min(affinityCapFor(player.maxChapterId), before + amount))
      if (!state.recruited && state.affinity >= 100 && (!companion.recruitFlag || flags.includes(companion.recruitFlag))) {
        state.recruited = true
        companions.push(id)
      }
      addDelta(`${companion.name}好感`, state.affinity - before)
      await client.query(`INSERT INTO player_companions VALUES ($1, $2, $3)
        ON CONFLICT (player_id, companion_id) DO UPDATE SET state = EXCLUDED.state`, [player.id, id, state])
    }

    for (const [id, amount] of Object.entries(reward.tokens ?? {})) {
      const companion = COMPANIONS[id]
      if (!companion) continue
      const state = character.companionAffinity[id] ??= blankCompanionState(id)
      state.tokens = (state.tokens ?? 0) + amount
      addDelta(`${companion.name}的${companion.route === 'FAMILY' ? '家传' : '伙伴'}信物`, amount)
      await client.query(`INSERT INTO player_companions VALUES ($1, $2, $3)
        ON CONFLICT (player_id, companion_id) DO UPDATE SET state = EXCLUDED.state`, [player.id, id, state])
    }

    const narration: RichSegment[] = [{ type: 'tag', text: reward.tag, tone: reward.tone }, { type: 'text', text: ` ${reward.text}` }]
    if (deltas.length) narration.push({ type: 'text', text: `（${deltas.join('，')}）` })
    return { rewards: { qiExp, silver, items, companions }, narration }
  }

  function storyBattle(character: Character, now: number, sceneTitle: string, battle: AdventureBattle, retreat: boolean, mapId = character.player.currentMapId) {
    markDaily(character, 'battle', now)
    const report = simulateServerBattle({
      ...duelFighter(character), ...battle, sceneTitle, mode: 'SOLO_STORY', tryRetreat: retreat,
      ownedItemIds: character.ownedItemIds,
      environment: { ...battleEnvironmentAt(mapId, new Date(now)), ...battle.environment },
    })
    report.battleId = randomUUID()
    const gainedLoot = creditBattleEffectLoot(character.player, report)
    const usedMedicine = spendBattleMedicines(character.player, report)
    return { report, changed: gainedLoot || usedMedicine }
  }

  function addStoryNarration(report: BattleReportDTO, segments: RichSegment[]) {
    report.events.push({ round: report.events.at(-1)?.round ?? 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', segments })
  }

  async function grantSectPromotion(client: PoolClient, character: Character, sect: (typeof SECTS)[number], rank: number, now: number) {
    const items: NonNullable<NonNullable<BattleReportDTO['rewards']>['items']> = []
    for (const id of sect.signatureSkills[rank - 1] ?? []) {
      const grant = await grantSkill(client, character, id)
      if (grant) items.push(grant)
    }
    const itemIds = sectEquipmentRewardIds(sect.id, rank)
    const signature = sect.signatureItems?.[rank]
    if (signature && !ITEMS[signature].isTrueUnique) itemIds.push(signature)
    const added = await grantItems(client, character, itemIds)
    if (signature && ITEMS[signature].isTrueUnique) {
      // 全服唯一真品只传给第一位通过终考的侠客；此后要到君山擂台去争
      const { rowCount } = await client.query(`INSERT INTO unique_artifacts (item_id, holder_id, held_since, seen_at)
        VALUES ($1, $2, $3, $3) ON CONFLICT (item_id) DO NOTHING`, [signature, character.player.id, now])
      if (rowCount) {
        await receiveArtifact(client, character, signature)
        added.push(signature)
        ;(character.broadcasts ??= []).push({ event: 'UNIQUE_ARTIFACT_CHANGED', data: {
          itemId: signature, cause: 'GRANT', newOwner: character.player.nickname, previousOwner: null,
        } })
      }
    }
    for (const id of added) items.push({ id, name: ITEMS[id].name, tier: ITEMS[id].tier })
    character.player.sectRank = rank
    return items
  }

  /** 神兵名录：第一卷的神品装备 */
  const REGISTRY_ITEM_IDS = Object.values(ITEMS).filter((item) => item.tier === 'red' && !item.isTrueUnique).map(({ id }) => id)

  app.get('/api/v1/market/artifacts', async (request): Promise<ArtifactBoardDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const { rows: [viewer] } = await client.query<{ id: string }>('SELECT id FROM players WHERE account_id = $1', [accountId])
      if (!viewer) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
      const now = await serverTime(client)
      const item = ITEMS[DAGOU_STAFF.itemId]
      const { rows: [row] } = await client.query<ArtifactRow & { nickname: string | null; sect_id: string | null }>(`
        SELECT a.*, p.nickname, p.profile ->> 'currentSectId' AS sect_id
        FROM unique_artifacts a LEFT JOIN players p ON p.id = a.holder_id WHERE a.item_id = $1`, [item.id])
      const { rows: duels } = await client.query<{ created_at: string; challenger_id: string; challenger: string; defender: string | null; vs_elder: boolean; won: boolean }>(`
        SELECT d.created_at, d.challenger_id, c.nickname AS challenger, f.nickname AS defender, d.vs_elder, d.won
        FROM artifact_duels d JOIN players c ON c.id = d.challenger_id LEFT JOIN players f ON f.id = d.defender_id
        WHERE d.item_id = $1 ORDER BY d.id DESC LIMIT 6`, [item.id])
      const { rows: holders } = await client.query<{ item_id: string; holders: number }>(
        'SELECT item_id, count(*)::int AS holders FROM player_items WHERE item_id = ANY($1::text[]) GROUP BY item_id', [REGISTRY_ITEM_IDS])
      const state = artifactState(row && { holderId: row.holder_id, seenAt: Number(row.seen_at) }, now)
      const held = state === 'HELD'
      return {
        serverTime: now,
        artifacts: [{
          artifactCode: DAGOU_STAFF.code, itemId: item.id, name: item.name, state,
          // 久未露面的执棒者仍报出编号：上擂时据此核对打狗棒没有再易主
          holderId: row?.holder_id ?? null,
          holderNickname: held ? row.nickname : null,
          holderSect: held ? SECTS.find(({ id }) => id === row.sect_id)?.name ?? '逍遥散人' : null,
          heldSince: held ? Number(row.held_since) : null,
          defendStreak: held ? defendedArenas(Number(row.held_since), now) : 0,
          recallAt: held ? Number(row.seen_at) + DAGOU_STAFF.idleRecallMs : null,
          duels: duels.map((duel) => ({
            at: Number(duel.created_at), challenger: duel.challenger, defender: duel.vs_elder ? null : duel.defender ?? '已归隐的侠客',
            won: duel.won, self: duel.challenger_id === viewer.id,
          })),
        }],
        registry: REGISTRY_ITEM_IDS.map((itemId) => ({ itemId, holders: holders.find((entry) => entry.item_id === itemId)?.holders ?? 0 })),
      }
    }, true)
  })

  app.post('/api/v1/market/artifacts', (request) => respond<ArtifactResult>(request, async (character, now, client, readRelated) => {
    requireFeature(character.player, 'HUASHAN')
    const { action, itemId, holderId } = objectBody(request.body)
    if (action !== 'challenge' || itemId !== DAGOU_STAFF.itemId || (holderId !== null && (typeof holderId !== 'string' || !UUID.test(holderId)))) {
      throw new GameError(400, 'INVALID_ARTIFACT_ACTION', '请选择要争夺的真品')
    }
    const { player } = character
    // 先认出执棒者并一起加锁，再锁住真品核对没有易主
    const { rows: [seen] } = await client.query<ArtifactRow>('SELECT * FROM unique_artifacts WHERE item_id = $1', [itemId])
    const [holder] = seen?.holder_id && seen.holder_id !== player.id ? await readRelated([seen.holder_id]) : []
    const { rows: [row] } = await client.query<ArtifactRow>('SELECT * FROM unique_artifacts WHERE item_id = $1 FOR UPDATE', [itemId])
    if ((row?.holder_id ?? null) !== (seen?.holder_id ?? null) || (row?.holder_id ?? null) !== (holderId?.toLowerCase() ?? null)) {
      throw new GameError(409, 'ARTIFACT_CHANGED', '打狗棒刚刚易主，请刷新兵器谱')
    }
    const state = artifactState(row && { holderId: row.holder_id, seenAt: Number(row.seen_at) }, now)
    const blocked = artifactChallengeBlock({ player, learnedSkills: character.learnedSkills, state, isHolder: row?.holder_id === player.id, now })
    if (blocked) throw new GameError(409, 'ARTIFACT_CHALLENGE_BLOCKED', blocked)

    const related: Character[] = []
    // 执棒者久未露面：先由长老收回，再与长老过招
    if (state === 'VACANT' && holder) {
      await takeArtifact(client, holder, row, now, 'RECALL', null)
      related.push(holder)
    }
    const defender = state === 'HELD' ? holder : undefined
    const report = defender
      ? simulatePlayerDuel({
        battleId: randomUUID(), sceneTitle: ARENA_SCENE, mode: 'PVP_HUASHAN', lineup: [duelFighter(character), duelFighter(defender)],
        environment: battleEnvironmentAt('sect_contest', new Date(now)),
      })
      : simulateElderDuel({
        player, loadout: activeLoadout(character), learnedSkills: character.learnedSkills, bonus: collectionBonus(character),
        ownedItemIds: character.ownedItemIds, companionOf: (id) => equippedCompanion(character, id),
      }, now)
    report.battleId = randomUUID()
    const won = report.winner === 'ALLY'
    const attemptsLeft = spendArtifactAttempt(player, now)
    await client.query('INSERT INTO artifact_duels (item_id, challenger_id, defender_id, vs_elder, won, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [itemId, player.id, defender?.player.id ?? null, !defender, won, now])
    if (won) {
      if (defender) {
        await takeArtifact(client, defender, row, now, 'SEIZE', character)
        related.push(defender)
      } else {
        await client.query('UPDATE unique_artifacts SET holder_id = $2, held_since = $3, seen_at = $3 WHERE item_id = $1', [itemId, player.id, now])
        ;(character.broadcasts ??= []).push({ event: 'UNIQUE_ARTIFACT_CHANGED', data: { itemId, cause: 'SEIZE', newOwner: player.nickname, previousOwner: null } })
      }
      await receiveArtifact(client, character, itemId)
    }
    return { result: { action, report, won, attemptsLeft }, changed: true, related }
  }))

  app.post('/api/v1/sect', (request) => respond<SectResult>(request, async (character, now, client, readRelated) => {
    requireFeature(character.player, 'SECT')
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
      const items = await grantSectPromotion(client, character, sect, 1, now)
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
        if (gaibangDishPrepared(dish.id, flags, player.feast?.cooked)) throw new GameError(409, 'SECT_DISH_PREPARED', '这道菜已经备好了')
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
          const items = await grantSectPromotion(client, character, sect, newRank, now)
          player.gaibangBranch = 'JINGYI'
          return { result: { action, correct: true, rewards: { ...rewards, items } }, changed: true }
        }
        player.gaibangBranch = 'JINGYI'
        return { result: { action, correct: true, rewards }, changed: true }
      }
      if (!available) throw new GameError(409, 'SECT_RANK_MAX', '你已完成本门考核')
      if (branch !== (choosing ? 'WUYI' : undefined)) throw new GameError(409, 'SECT_BRANCH_REQUIRED', '请到轩辕台选择合适的考核')
      const dishesReady = sect.id !== 'gaibang' || !finale || GAIBANG_FINAL_DISHES.every(({ id }) => gaibangDishPrepared(id, flags, player.feast?.cooked))
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
      const items = newRank > rank || finale ? await grantSectPromotion(client, character, sect, newRank, now) : []
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
    if (sect.id === DAGOU_STAFF.sectId && character.ownedItemIds.includes(DAGOU_STAFF.itemId)) {
      // 叛出丐帮：打狗棒当场收回，不作补偿
      const { rows: [staff] } = await client.query<ArtifactRow>(
        'SELECT * FROM unique_artifacts WHERE item_id = $1 AND holder_id = $2 FOR UPDATE', [DAGOU_STAFF.itemId, player.id])
      if (staff) await takeArtifact(client, character, staff, now, 'BETRAY', null)
    }
    const karmaDelta = changeKarma(character, -120, now)
    player.bountyUntil = now + BETRAYAL_BOUNTY.hours * 3_600_000
    return { result: { action, name: sect.name, karmaDelta }, changed: true }
  }))

  app.post('/api/v1/market/ghost/appraise', (request) => respond(request, async (character, now, client) => {
    requireFeature(character.player, 'GHOST')
    const { masked } = objectBody(request.body)
    if (typeof masked !== 'boolean') throw new GameError(400, 'INVALID_GHOST_MASK', '请选择是否蒙面')
    const result = appraiseGhostCurio(character.player, activeLoadout(character), character.ownedItemIds.includes(GHOST_APPRAISAL_SWORD),
      masked, now, (delta) => changeKarma(character, delta, now))
    if ('error' in result) throw new GameError(409, 'SILVER_INSUFFICIENT', result.error)
    if (result.swordFound) await grantItems(client, character, [GHOST_APPRAISAL_SWORD])
    return { result, changed: true }
  }))

  app.post('/api/v1/market/inn/gift', (request) => respond<InnGiftResult>(request, async (character, now, client) => {
    requireFeature(character.player, 'INN')
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
    const cap = affinityCapFor(player.maxChapterId)
    const affinityGained = Math.max(0, Math.min(innAffinityGain(companion.id, favorite, title?.id), cap - state.affinity))
    if (!affinityGained) {
      throw new GameError(409, 'AFFINITY_FULL', cap < 1000 ? '此情已满，待江湖历练更深（通关更多章节可提高上限）' : '好感已满')
    }

    const flags = storyProgressFlags(character.rewardedChapters, player.storyFlags)
    if (!state.recruited && state.affinity + affinityGained >= 100 && (!companion.recruitFlag || flags.includes(companion.recruitFlag))) {
      settle(character, now)
      state.recruited = true
    }
    player.silver -= cost
    player.innVisits = visits
    markDaily(character, 'inn', now)
    const counters = visits.gifts[companion.id] ??= { tea: 0, gift: 0 }
    counters[kind]++
    state.affinity += affinityGained
    const taught = state.affinity >= 600 && !state.taught ? await grantSkill(client, character, companion.teachSkillId) : undefined
    if (state.affinity >= 600 && SKILLS[companion.teachSkillId]) state.taught = true
    await client.query(`INSERT INTO player_companions (player_id, companion_id, state) VALUES ($1, $2, $3)
      ON CONFLICT (player_id, companion_id) DO UPDATE SET state = EXCLUDED.state`, [player.id, companion.id, state])
    return { result: { affinityGained, taughtSkillId: taught?.id }, changed: true }
  }))

  app.post('/api/v1/market/gacha', (request) => respond<GachaResult>(request, async (character, now, client) => {
    requireFeature(character.player, 'GACHA')
    const { count } = objectBody(request.body)
    if (count !== 1 && count !== 10) throw new GameError(400, 'INVALID_GACHA_COUNT', '请选择单抽或十连')
    const { player } = character
    // 新伙伴入队会改变收集羁绊的打坐加成，先按旧阵容结算
    settle(character, now)
    const outcome = pullGacha({
      player, companionAffinity: character.companionAffinity, learnedSkills: character.learnedSkills,
      ownedItemIds: character.ownedItemIds, affinityCap: affinityCapFor(player.maxChapterId),
    }, count)
    if ('error' in outcome) throw new GameError(409, 'INGOT_INSUFFICIENT', outcome.error)
    logIngot(character, -outcome.cost, 'gacha')
    const { changes, draws } = outcome
    for (const id of changes.companions) await saveCompanion(client, character, id)
    for (const id of changes.skills) {
      await client.query(`INSERT INTO player_skills VALUES ($1, $2, $3)
        ON CONFLICT (player_id, skill_id) DO UPDATE SET mastery = EXCLUDED.mastery`, [player.id, id, character.learnedSkills[id]])
    }
    for (const id of changes.newSkills) learnedSkill(character, id)
    for (const id of changes.newItems) {
      await client.query('INSERT INTO player_items (player_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [player.id, id])
      gainedItem(character, id)
    }
    for (const draw of draws) {
      await client.query(`INSERT INTO gacha_log (player_id, pull_no, tier, kind, ref_id, qty, grade, pity_triggered, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [player.id, draw.pullNo, draw.tier, draw.kind, draw.refId ?? null, draw.qty ?? null, draw.grade ?? null, !!draw.pityTriggered, now])
    }
    return { result: { cost: outcome.cost, draws }, changed: true }
  }))

  app.post('/api/v1/companions/awaken', (request) => respond<AwakenResult>(request, async (character, _now, client) => {
    requireFeature(character.player, 'INN')
    const { companionId } = objectBody(request.body)
    if (typeof companionId !== 'string' || !Object.hasOwn(COMPANIONS, companionId)) {
      throw new GameError(400, 'INVALID_COMPANION', '请选择一位伙伴')
    }
    const result = awakenCompanion(companionId, character.companionAffinity[companionId])
    if ('error' in result) throw new GameError(409, 'AWAKEN_UNAVAILABLE', result.error)
    await saveCompanion(client, character, companionId)
    return { result, changed: true }
  }))

  app.post('/api/v1/market/feast', (request) => respond<FeastResult>(request, async (character, now, client) => {
    requireFeature(character.player, 'FEAST')
    const { dishId } = objectBody(request.body)
    if (typeof dishId !== 'string') throw new GameError(400, 'INVALID_DISH', '请选择一道菜')
    const { player } = character
    const hong = character.companionAffinity.hongqigong
    if (!hong || !feastActive(hong, storyProgressFlags(character.rewardedChapters, player.storyFlags))) {
      throw new GameError(409, 'FEAST_INACTIVE', '眼下用不着为洪七公掌勺')
    }
    // 十道呈齐时洪七公入队，收集羁绊随之变化
    settle(character, now)
    const result = cookFeastDish(player, hong, dishId, now, affinityCapFor(player.maxChapterId))
    if ('error' in result) throw new GameError(409, 'FEAST_UNAVAILABLE', result.error)
    await saveCompanion(client, character, 'hongqigong')
    return { result: { dishId, cooked: result.cooked, affinity: result.affinity, done: result.done }, changed: true }
  }))

  app.post('/api/v1/ftue/claim', (request) => respond<FtueClaimResult>(request, async (character) => {
    const { player } = character
    const result = claimFtueQuest(
      { player, openedAcupointIds: player.openedAcupointIds ?? [], companionAffinity: character.companionAffinity },
      player.acupointPills ??= {},
    )
    if ('error' in result) throw new GameError(409, 'FTUE_NOT_READY', result.error)
    return { result, changed: true }
  }))

  app.post('/api/v1/features/seen', (request) => respond<{ featureId: FeatureId }>(request, async (character) => {
    const { featureId } = objectBody(request.body)
    if (typeof featureId !== 'string' || !Object.hasOwn(FEATURE_BY_ID, featureId)) throw new GameError(400, 'INVALID_FEATURE', '没有这项玩法')
    return { result: { featureId: featureId as FeatureId }, changed: markFeatureSeen(character.player, featureId as FeatureId) }
  }))

  app.post('/api/v1/daily/claim', (request) => respond<{ ingot: number; ticket: boolean }>(request, async (character, now) => {
    requireFeature(character.player, 'DAILY')
    const result = claimDailyIngot(character.player, now)
    if ('error' in result) throw new GameError(409, 'DAILY_NOT_READY', result.error)
    logIngot(character, result.ingot, 'daily', `daily:${character.player.daily!.day}`)
    return { result, changed: true }
  }))

  app.post('/api/v1/market/ghost/buy', (request) => respond(request, async (character, _now, client) => {
    requireFeature(character.player, 'GHOST')
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
    if (skill) await grantSkill(client, character, listing.itemId)
    else await grantItems(client, character, [listing.itemId])
    player.silver -= spentSilver
    const purchases = player.ghostMarketPurchases ??= []
    purchases.push(listing.id)
    return { result: { spentSilver }, changed: true }
  }))

  const maskOf = (salt: string, playerId: string) =>
    bidderMask(createHash('sha256').update(`${salt}:${playerId}`).digest().readUInt32BE(0) % AUCTION_MASK_COUNT)

  /** 还没人出价的场次没有数据行，按轮换表给出起拍状态 */
  function auctionLotView(day: number, row: AuctionRow | undefined, viewerId: string): AuctionLotDTO {
    const config = auctionLot(day)
    const { opensAt, closesAt } = auctionWindow(day)
    const lot = row ? { price: row.price, bids: row.bids } : { price: config.startPrice, bids: 0 }
    return {
      day, itemId: row?.item_id ?? config.itemId, seller: config.seller, startPrice: row?.start_price ?? config.startPrice,
      price: lot.price, nextBid: nextAuctionBid(lot), bids: lot.bids, opensAt, closesAt: row ? Number(row.closes_at) : closesAt,
      leaderMasked: row?.leader_id ? maskOf(row.mask_salt, row.leader_id) : null, leading: !!row && row.leader_id === viewerId,
      ...(row && row.leader_id === viewerId ? { myMax: row.leader_max ?? row.price } : {}),
    }
  }

  /** 已落槌且有人出价的场次公示红封；子时开签前人数还会变 */
  async function withDividend(client: PoolClient, lot: AuctionLotDTO, row: AuctionRow | undefined, viewerId: string, now: number): Promise<AuctionLotDTO> {
    if (!row?.bids || now < lot.closesAt) return lot
    const { eligible, holds, rank } = await auctionTicketsOf(client, row, viewerId)
    const { winners, share } = auctionDividend(row.price, eligible)
    const paysAt = dividendPaysAt(row)
    const { rowCount: paid } = await client.query('SELECT 1 FROM ingot_ledger WHERE player_id = $1 AND ref = $2', [viewerId, `auction-dividend:${row.day}`])
    const mine = !holds ? 'NONE' : paid ? 'PAID' : now < paysAt ? 'HELD' : rank < winners ? 'PENDING' : 'MISSED'
    return { ...lot, dividend: { eligible, winners, share, paysAt, mine } }
  }

  app.get('/api/v1/market/auction', async (request): Promise<AuctionBoardDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const { rows: [viewer] } = await client.query<{ id: string }>('SELECT id FROM players WHERE account_id = $1', [accountId])
      if (!viewer) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
      const now = await serverTime(client)
      const day = auctionDay(now)
      const { rows } = await client.query<AuctionRow>('SELECT * FROM ghost_auctions WHERE day = ANY($1::integer[])', [[day, day - 1]])
      const row = rows.find((entry) => entry.day === day)
      const { rows: bids } = await client.query<{ player_id: string; amount: number; created_at: string; proxy: boolean }>(
        'SELECT player_id, amount, created_at, proxy FROM ghost_auction_bids WHERE day = $1 ORDER BY bid_no DESC LIMIT 8', [day])
      const { rows: wins } = await client.query<{ day: number; item_id: string; price: number }>(
        'SELECT day, item_id, price FROM ghost_auctions WHERE leader_id = $1 AND NOT claimed AND closes_at <= $2 ORDER BY day', [viewer.id, now])
      const previous = rows.find((entry) => entry.day === day - 1)
      return {
        serverTime: now,
        lot: await withDividend(client, auctionLotView(day, row, viewer.id), row, viewer.id, now),
        history: bids.map(({ player_id, amount, created_at, proxy }) => ({
          masked: maskOf(row!.mask_salt, player_id), amount, at: Number(created_at), self: player_id === viewer.id, ...(proxy ? { proxy } : {}),
        })),
        previous: await withDividend(client, auctionLotView(day - 1, previous, viewer.id), previous, viewer.id, now),
        wins: wins.map(({ day: won, item_id, price }) => ({ day: won, itemId: item_id, price })),
      }
    }, true)
  })

  app.post('/api/v1/market/auction', async (request) => {
    let outbid: { playerId: string; event: WsServerEvent } | undefined
    const { response, updates } = await writeAction<AuctionResult>(request, async (character, now, client, readRelated) => {
      outbid = undefined
      requireFeature(character.player, 'GHOST')
      const { action, day, maxPrice } = objectBody(request.body)
      if (typeof day !== 'number' || !Number.isInteger(day)) throw new GameError(400, 'INVALID_AUCTION', '请选择一场暗拍')
      const { player, learnedSkills, ownedItemIds } = character
      // 红封由 writeAction 在每次操作后兑付，这里无事可做
      if (action === 'dividend') return { result: { action, day }, changed: false }

      if (action === 'claim') {
        const { rows: [won] } = await client.query<AuctionRow>(
          'SELECT * FROM ghost_auctions WHERE day = $1 AND leader_id = $2 AND NOT claimed FOR UPDATE', [day, player.id])
        if (!won) throw new GameError(409, 'AUCTION_NOTHING_TO_CLAIM', '这一场没有你的拍品可领')
        if (now < Number(won.closes_at)) throw new GameError(409, 'AUCTION_STILL_OPEN', '这一场还没落槌')
        // 按成交价结算，心理价多冻的退还；落槌后已从别处得到同一件，冻结的元宝全数退还
        const frozen = won.leader_max ?? won.price
        const owned = ownsAuctionLot(won.item_id, learnedSkills, ownedItemIds)
        const refunded = owned ? frozen : frozen - won.price
        if (refunded) {
          player.goldIngot += refunded
          logIngot(character, refunded, 'auction-refund')
        }
        if (!owned && SKILLS[won.item_id]) await grantSkill(client, character, won.item_id)
        else if (!owned) await grantItems(client, character, [won.item_id])
        await client.query('UPDATE ghost_auctions SET claimed = true WHERE day = $1', [day])
        return { result: { action, day, itemId: won.item_id, owned, refunded }, changed: true }
      }

      if (action !== 'bid' || typeof maxPrice !== 'number') throw new GameError(400, 'INVALID_AUCTION', '请填心理价出价')
      if (day !== auctionDay(now)) throw new GameError(409, 'AUCTION_CHANGED', '暗拍已换场，请刷新')
      await client.query('SELECT pg_advisory_xact_lock(833, $1)', [day])
      const config = auctionLot(day)
      await client.query(`INSERT INTO ghost_auctions (day, item_id, start_price, price, closes_at, mask_salt)
        VALUES ($1, $2, $3, $3, $4, $5) ON CONFLICT (day) DO NOTHING`,
      [day, config.itemId, config.startPrice, auctionWindow(day).closesAt, randomUUID()])
      const { rows: [lot] } = await client.query<AuctionRow>('SELECT * FROM ghost_auctions WHERE day = $1 FOR UPDATE', [day])
      if (now >= Number(lot.closes_at)) throw new GameError(409, 'AUCTION_CLOSED', '今晚的暗拍已经落槌')
      if (ownsAuctionLot(lot.item_id, learnedSkills, ownedItemIds)) throw new GameError(409, 'AUCTION_OWNED', '你已拥有这件拍品')
      const placed = placeAuctionBid({ price: lot.price, bids: lot.bids, leader: lot.leader_id, leaderMax: lot.leader_max ?? lot.price }, player.id, maxPrice)
      if ('error' in placed) throw new GameError(409, 'AUCTION_BID_TOO_LOW', placed.error)
      if (player.goldIngot < placed.charge) throw new GameError(409, 'INGOT_INSUFFICIENT', `元宝不足：心理价要先冻结 ${placed.charge} 元宝`)

      const related: Character[] = []
      if (placed.refund) {
        // 被压过的领先者，冻结的元宝原数退还，并实时告知
        const [previous] = await readRelated([placed.refund.to])
        previous.player.goldIngot += placed.refund.ingot
        logIngot(previous, placed.refund.ingot, 'auction-refund')
        related.push(previous)
        outbid = {
          playerId: previous.player.id,
          event: { event: 'AUCTION_OUTBID', data: { day, itemId: lot.item_id, refund: placed.refund.ingot, price: placed.lot.price } },
        }
      }
      player.goldIngot -= placed.charge
      logIngot(character, -placed.charge, 'auction-bid')
      // 加码心理价不算出价，不顺延落槌
      const closesAt = placed.entries.length ? softCloseAt(Number(lot.closes_at), now) : Number(lot.closes_at)
      await client.query('UPDATE ghost_auctions SET price = $2, leader_id = $3, leader_max = $4, bids = $5, closes_at = $6 WHERE day = $1',
        [day, placed.lot.price, placed.lot.leader, placed.lot.leaderMax, placed.lot.bids, closesAt])
      for (const [index, entry] of placed.entries.entries()) {
        await client.query('INSERT INTO ghost_auction_bids (day, bid_no, player_id, amount, created_at, proxy) VALUES ($1, $2, $3, $4, $5, $6)',
          [day, lot.bids + index + 1, entry.bidder, entry.amount, now, entry.proxy])
      }
      const leading = placed.lot.leader === player.id
      return { result: { action, day, price: placed.lot.price, closesAt, leading, maxPrice }, changed: placed.charge > 0, related }
    })
    for (const updated of updates) rooms.publish(updated)
    if (outbid) rooms.sendToPlayer(outbid.playerId, outbid.event)
    return response
  })

  // ==================== 子时鬼市蒙面摊位 ====================
  const stallView = (row: StallRow, mine: boolean): StallListingDTO => ({
    id: row.id, kind: row.kind, goodsId: row.goods_id, qty: row.qty, unitPrice: row.unit_price, system: false, expiresAt: Number(row.expires_at),
    seller: stallMask(createHash('sha256').update(row.id).digest().readUInt32BE(0)),
    ...(mine ? { sold: row.sold, proceeds: row.proceeds } : {}),
  })

  app.get('/api/v1/market/stalls', async (request): Promise<StallBoardDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const { rows: [viewer] } = await client.query<{ id: string; stallSystem: PlayerDTO['stallSystem'] | null }>(
        `SELECT id, profile -> 'stallSystem' AS "stallSystem" FROM players WHERE account_id = $1`, [accountId])
      if (!viewer) throw new GameError(404, 'PLAYER_NOT_CREATED', '先创建你的角色')
      const now = await serverTime(client)
      // ponytail: 内测一次取 200 摊、按货物和单价排好；摊位多起来后改成按货物分页。
      const { rows: open } = await client.query<StallRow>(`SELECT * FROM stall_listings
        WHERE qty > 0 AND expires_at > $1 AND seller_id <> $2 ORDER BY kind DESC, goods_id, unit_price, created_at LIMIT 200`, [now, viewer.id])
      const { rows: mine } = await client.query<StallRow>('SELECT * FROM stall_listings WHERE seller_id = $1 ORDER BY created_at, id', [viewer.id])
      const { rows: recent } = await client.query<{ kind: StallGoodsKind; goods_id: string; qty: number; unit_price: number; created_at: string }>(
        'SELECT kind, goods_id, qty, unit_price, created_at FROM stall_sales ORDER BY id DESC LIMIT 8')
      const day = stallDay(now)
      const bought = systemStallsBought({ stallSystem: viewer.stallSystem ?? undefined }, now)
      return {
        serverTime: now,
        listings: [
          ...systemStalls(day).filter(({ id }) => !bought.includes(id)).map(({ id, goods, qty, unitPrice }): StallListingDTO => ({
            id, kind: goods.kind, goodsId: goods.id, qty, unitPrice, seller: SYSTEM_STALL_SELLER, system: true, expiresAt: auctionWindow(day + 1).opensAt,
          })),
          ...open.map((row) => stallView(row, false)),
        ],
        mine: mine.map((row) => stallView(row, true)),
        recent: recent.map((sale) => ({ kind: sale.kind, goodsId: sale.goods_id, qty: sale.qty, unitPrice: sale.unit_price, at: Number(sale.created_at) })),
      }
    }, true)
  })

  app.post('/api/v1/market/stalls', (request) => respond<StallResult>(request, async (character, now, client) => {
    requireFeature(character.player, 'GHOST')
    const body = objectBody(request.body)
    const { action, listingId, qty, unitPrice } = body
    const { player } = character
    const inventory = stallInventory(player)
    // 收摊结算由 writeAction 在每次操作前完成，这里无事可做
    if (action === 'collect') return { result: { action }, changed: false }

    if (action === 'list') {
      const { rows: [{ count }] } = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM stall_listings WHERE seller_id = $1', [player.id])
      const offer = checkStallOffer({ level: player.level, silver: player.silver, openCount: count, inventory }, body)
      if ('error' in offer) throw new GameError(409, 'STALL_OFFER_REJECTED', offer.error)
      const { goods } = offer
      const id = randomUUID()
      moveStallGoods(inventory, goods.kind, goods.id, -offer.qty)
      player.silver -= offer.fee
      player.stallOpen = count + 1
      await client.query(`INSERT INTO stall_listings (id, seller_id, kind, goods_id, qty, unit_price, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, player.id, goods.kind, goods.id, offer.qty, offer.unitPrice, now, now + STALL.durationMs])
      return { result: { action, listingId: id, kind: goods.kind, goodsId: goods.id, qty: offer.qty, unitPrice: offer.unitPrice, fee: offer.fee }, changed: true }
    }

    if (typeof listingId !== 'string') throw new GameError(400, 'INVALID_STALL_ACTION', '请选择一个摊位')
    if (action === 'buy' && listingId.startsWith('sys:')) {
      const bought = buySystemStall(player, inventory, listingId, now)
      if ('error' in bought) throw new GameError(409, 'STALL_UNAVAILABLE', bought.error)
      return { result: { action, kind: bought.goods.kind, goodsId: bought.goods.id, qty: bought.qty, spent: bought.spent }, changed: true }
    }
    if (!UUID.test(listingId)) throw new GameError(400, 'INVALID_STALL_ACTION', '请选择一个摊位')
    const { rows: [row] } = await client.query<StallRow>('SELECT * FROM stall_listings WHERE id = $1 FOR UPDATE', [listingId])

    if (action === 'cancel') {
      if (row?.seller_id !== player.id) throw new GameError(409, 'STALL_UNAVAILABLE', '这个摊位已经收掉了')
      await closeStall(client, character, row, now, true)
      player.stallOpen = Math.max(0, (player.stallOpen ?? 1) - 1)
      return { result: { action, kind: row.kind, goodsId: row.goods_id, returned: row.qty, silver: row.proceeds }, changed: true }
    }

    if (action !== 'buy') throw new GameError(400, 'INVALID_STALL_ACTION', '请选择摆摊、采买或撤摊')
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || typeof unitPrice !== 'number') {
      throw new GameError(400, 'INVALID_STALL_ACTION', '请选择要买的数量')
    }
    if (player.level < STALL.minLevel) throw new GameError(409, 'STALL_LEVEL_REQUIRED', `等级达到 ${STALL.minLevel} 级才能在鬼市采买`)
    if (!row || now >= Number(row.expires_at) || row.qty === 0) throw new GameError(409, 'STALL_UNAVAILABLE', '这个摊位已经收摊，请刷新')
    if (row.seller_id === player.id) throw new GameError(409, 'STALL_OWN', '不能买自己摊上的东西，要收回请撤摊')
    if (row.unit_price !== unitPrice) throw new GameError(409, 'STALL_PRICE_CHANGED', '摊位已经变了，请刷新后再买')
    if (row.qty < qty) throw new GameError(409, 'STALL_SHORT', `这个摊位只剩 ${row.qty} 份`)
    const spent = qty * row.unit_price
    if (player.silver < spent) throw new GameError(409, 'SILVER_INSUFFICIENT', '纹银不足')
    const tax = stallTax(spent)
    player.silver -= spent
    moveStallGoods(inventory, row.kind, row.goods_id, qty)
    await client.query('UPDATE stall_listings SET qty = qty - $2, sold = sold + $2, proceeds = proceeds + $3 WHERE id = $1', [row.id, qty, spent - tax])
    await client.query(`INSERT INTO stall_sales (listing_id, seller_id, buyer_id, kind, goods_id, qty, unit_price, tax, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [row.id, row.seller_id, player.id, row.kind, row.goods_id, qty, row.unit_price, tax, now])
    ;(character.whispers ??= []).push({ playerId: row.seller_id, event: { event: 'STALL_SOLD', data: { kind: row.kind, goodsId: row.goods_id, qty, silver: spent - tax } } })
    return { result: { action, kind: row.kind, goodsId: row.goods_id, qty, spent }, changed: true }
  }))

  app.post('/api/v1/alchemy/forage', (request) => respond(request, async (character, now) => {
    const { player } = character
    requireFeature(player, 'MAPS')
    if (player.qiExp < FORAGE_QI_COST) throw new GameError(409, 'QI_INSUFFICIENT', `采药需 ${FORAGE_QI_COST} 点真气`)
    const herbs = gatherHerbs(player.currentMapId, effectiveMartialStats(player, activeLoadout(character)).luck, shichenIdxFromDate(new Date(now)),
      undefined, originPerk(player, 'HERB_ROLL'))
    if (!herbs.length) throw new GameError(409, 'NO_HERBS', '此地没有可采的药材')
    const alchemy = player.alchemy ??= { herbs: {}, pity: {}, residue: 0 }
    player.qiExp -= FORAGE_QI_COST
    for (const herb of herbs) alchemy.herbs[herb.id] = (alchemy.herbs[herb.id] ?? 0) + herb.count
    recordFtueForage(player)
    markDaily(character, 'alchemy', now)
    return { result: { herbs }, changed: true }
  }))

  app.post('/api/v1/alchemy/refine', (request) => respond(request, async (character, now) => {
    const { player } = character
    requireFeature(player, 'MAPS')
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
    const success = Math.random() * 100 < pillSuccessRate(recipe, stats, alchemy.pity[recipe.id], originPerk(player, 'PILL_RATE'))
    const count = success ? (Math.random() * 100 < pillDoubleRate(stats) ? 2 : 1) : 0
    if (count) {
      const stock = recipe.category === 'BATTLE' ? (player.battleMedicines ??= {}) : (player.acupointPills ??= {})
      stock[recipe.targetMedicineId] = (stock[recipe.targetMedicineId] ?? 0) + count
      delete alchemy.pity[recipe.id]
      recordFtueRefine(player, recipe.id)
    } else {
      alchemy.pity[recipe.id] = (alchemy.pity[recipe.id] ?? 0) + 6
      alchemy.residue++
    }
    markDaily(character, 'alchemy', now)
    return { result: { medicineId: recipe.targetMedicineId, count }, changed: true }
  }))

  app.post('/api/v1/alchemy/extract', (request) => respond(request, async ({ player }) => {
    requireFeature(player, 'MAPS')
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
      requireFeature(character.player, 'MAPS')
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

  /** 共修：两人停在同一张和平地图（按存档里的所在地，不必在线），都没在共修（docs/21） */
  function requireCoCultivationPartners(character: Character, partner: Character, mapId: string, now: number) {
    if (ONLINE_MAPS.find((map) => map.id === mapId)?.safety !== 'PEACE') {
      throw new GameError(409, 'CO_CULTIVATION_PEACE_ONLY', '到和平地图才能一起修行')
    }
    if ([character, partner].some(({ player }) => player.currentMapId !== mapId || player.mapJourney)) {
      throw new GameError(409, 'PARTNER_UNAVAILABLE', '两位侠客要停在同一处，才能一起修行')
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
      requireFeature(character.player, 'MAPS')
      const [partner] = await readRelated([targetPlayerId.toLowerCase()])
      requireTargetFeature(partner.player, 'MAPS')
      const mapId = character.player.currentMapId
      requireCoCultivationPartners(character, partner, mapId, now)
      const existing = pendingInvite(character, now)
      if (existing?.inviter.id === character.player.id && existing.invitee.id === partner.player.id) {
        return { result: NO_IDLE_GAIN, changed: false }
      }
      if (existing || pendingInvite(partner, now)) {
        throw new GameError(409, 'CO_CULTIVATION_INVITE_PENDING', '已有共修邀请在等答复')
      }

      // 对方在线：一分钟内答复；不在线就是留帖，一天内上线、仍在此地即可应邀
      const invitation: CoCultivationInviteDTO = {
        id: randomUUID(), mapId, expiresAt: now + (rooms.isOnlineInMap(partner.player.id, mapId) ? 60_000 : CO_CULTIVATION_NOTE_MS),
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

    if (input.action !== 'accept' && input.action !== 'decline' && input.action !== 'cancel') {
      throw new GameError(400, 'INVALID_CO_CULTIVATION_ACTION', '共修操作有误')
    }
    const invitation = pendingInvite(character, now)
    if (!invitation || invitation.id !== input.invitationId) throw new GameError(409, 'CO_CULTIVATION_INVITE_EXPIRED', '这封共修邀请已经失效')
    if (input.action === 'cancel') {
      if (invitation.inviter.id !== character.player.id) throw new GameError(403, 'CO_CULTIVATION_INVITE_NOT_YOURS', '只有发帖的人能撤回')
      const partner = await removeInvitation(character, invitation, client, readRelated)
      return { result: NO_IDLE_GAIN, changed: true, related: [partner] }
    }
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

  /**
   * 停在本图却不在线的侠客（docs/21）：纷争区列押着镖车或身负通缉的，出手由镜像应战；
   * 和平地图列所有停在这里的（最近上线的在前），可以给他们留帖共修，也可追捕被通缉的。
   */
  app.get('/api/v1/map/absent', async (request): Promise<RoomPlayerDTO[]> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const { player } = await readCharacter(client, accountId)
      const now = await serverTime(client)
      const mapId = player.currentMapId
      const peace = ONLINE_MAPS.find((map) => map.id === mapId)?.safety === 'PEACE'
      // ponytail: 单服内测每图最多列二十位（最近上线的在前），人多了再分页
      const { rows } = await client.query<CharacterRow>(`
        SELECT * FROM players WHERE id <> $1 AND profile->>'currentMapId' = $2 AND NOT (profile ? 'mapJourney') AND ($4
          OR (profile->'escortDart'->>'mapId' = $2 AND (profile->'escortDart'->>'endsAt')::bigint > $3
            AND NOT COALESCE((profile->'escortDart'->>'robbed')::boolean, false))
          OR (profile->>'bountyUntil')::bigint > $3)
        ORDER BY last_settle_at DESC, id LIMIT 20`, [player.id, mapId, now, peace])
      const absent = []
      for (const row of rows) {
        if (rooms.isOnlineInMap(row.id, mapId)) continue
        absent.push({ ...rooms.publicPlayer(snapshot(await hydrateCharacter(client, row), now)), offline: true as const })
      }
      return absent
    }, true)
  })

  app.post('/api/v1/escort', (request) => respond(request, async (character, now) => {
    requireFeature(character.player, 'HUASHAN')
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
      const { rows } = await client.query<{ id: string; nickname: string; expiresAt: string; sectId: string | null; mapId: string }>(`
        SELECT id, nickname, profile->>'bountyUntil' AS "expiresAt", profile->'betrayedSectIds'->>-1 AS "sectId", profile->>'currentMapId' AS "mapId"
        FROM players WHERE id <> $1 AND (profile->>'bountyUntil')::bigint > $2
        ORDER BY (profile->>'bountyUntil')::bigint, id`, [player.id, now])
      return { entries: rows.map(({ id, nickname, expiresAt, sectId, mapId }) => {
        const expires = Number(expiresAt)
        const accepted = player.bountyAccepted?.targetId === id && player.bountyAccepted.expiresAt === expires
        const issuer = sectId ?? ''
        return {
          targetId: id, nickname, sectId: issuer, expiresAt: expires, accepted,
          ...bountyReward(player, issuer), ...(accepted ? { mapId, online: rooms.onlineMap(id) !== null } : {}),
        }
      }) }
    }, true)
  })

  app.post('/api/v1/bounties/accept', (request) => respond<BountyEntryDTO>(request, async (character, now, _client, readRelated) => {
    requireFeature(character.player, 'HUASHAN')
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
        ...bountyReward(player, sectId), mapId: target.player.currentMapId, online: rooms.onlineMap(id) !== null },
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
        if (action !== 'decline') requireFeature(player, 'HUASHAN')
        const [other] = await readRelated([otherId])
        if (action === 'invite') requireTargetFeature(other.player, 'HUASHAN')
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
        // 切磋要双方同图在线；劫镖、追捕只要同在一张地图，对方不在就由他的镜像应战（docs/21）
        const present = rooms.isOnlineInMap(otherId, mapId)
        if (isAmbush ? mapId !== other.player.currentMapId || !!player.mapJourney
          : mapId !== other.player.currentMapId || !rooms.isOnlineInMap(player.id, mapId) || !present) {
          throw new GameError(409, 'DUEL_NOT_NEARBY', isAmbush ? '要与对方在同一张地图' : '两位侠客须在同一张地图并保持在线')
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
          battleId: randomUUID(),
          sceneTitle: `${pursuing ? '清理门户 · 追缉逆徒' : isAmbush ? '大漠纷争 · 劫镖' : '点到为止 · 切磋'}${present ? '' : ' · 镜像应战'}`,
          mode: isAmbush ? 'PVP_AMBUSH' : 'PVP_HUASHAN', lineup: [duelFighter(character), present ? duelFighter(other) : mirrorFighter(defenseMirror(other))],
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
        if (isAmbush && !present) {
          // 对方不在线：记下战果，他收功时告知
          const held = report.winner !== 'ALLY'
          other.player.defenseNotices = [...other.player.defenseNotices ?? [], {
            at: now, kind: pursuing ? 'BOUNTY' as const : 'ESCORT' as const, attacker: player.nickname, held,
            ...(!pursuing && !held && report.rewards?.silver ? { silver: report.rewards.silver } : {}),
          }].slice(-10)
          otherChanged = true
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

  // ==================== 结义镜像（docs/21） ====================
  /** 结义镜像：打过副本或主动登记时按当下配装冻结，供同伴不在线的侠客借去同闯 */
  async function saveRaidMirror(client: PoolClient, character: Character, now: number) {
    await client.query(`INSERT INTO raid_mirrors (player_id, mirror, mirror_at) VALUES ($1, $2, $3)
      ON CONFLICT (player_id) DO UPDATE SET mirror = EXCLUDED.mirror, mirror_at = EXCLUDED.mirror_at`, [character.player.id, defenseMirror(character), now])
  }

  async function borrowedMirrors(client: PoolClient, leaderId: string, ids: unknown) {
    if (!Array.isArray(ids) || ids.length !== 2 || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) {
      throw new GameError(400, 'INVALID_RAID_MIRROR', '请挑两位侠客的结义镜像')
    }
    const picked = ids.map((id: string) => id.toLowerCase())
    if (picked[0] === picked[1] || picked.includes(leaderId)) throw new GameError(400, 'INVALID_RAID_MIRROR', '请挑两位不同的侠客，不含自己')
    const { rows } = await client.query<{ player_id: string; mirror: DefenseMirror }>(
      'SELECT player_id, mirror FROM raid_mirrors WHERE player_id = ANY($1::uuid[])', [picked])
    if (rows.length !== 2) throw new GameError(409, 'RAID_MIRROR_MISSING', '有一位侠客的结义镜像已不在，请重新挑选')
    return picked.map((id) => ({ id, mirror: rows.find((row) => row.player_id === id)!.mirror }))
  }

  app.get('/api/v1/raid/mirrors', async (request): Promise<RaidMirrorBoardDTO> => {
    const { accountId } = await requireSession(request)
    return transaction(async (client) => {
      const { player } = await readCharacter(client, accountId)
      requireFeature(player, 'RAID')
      const { rows: [mine] } = await client.query<{ mirror_at: string }>('SELECT mirror_at FROM raid_mirrors WHERE player_id = $1', [player.id])
      // ponytail: 单服内测同门在前、等级相近在前取十二位，侠客多了再按战力分档
      const { rows } = await client.query<{ player_id: string; nickname: string; mirror: DefenseMirror }>(`
        SELECT m.player_id, p.nickname, m.mirror FROM raid_mirrors m JOIN players p ON p.id = m.player_id
        WHERE m.player_id <> $1
        ORDER BY ($2::text IS NOT NULL AND m.mirror->'identity'->>'sectId' = $2) DESC,
          abs((m.mirror->'fighter'->'player'->>'level')::integer - $3), m.mirror_at DESC
        LIMIT 12`, [player.id, player.currentSectId ?? null, player.level])
      return {
        mine: mine ? { mirrorAt: Number(mine.mirror_at) } : null,
        candidates: rows.map(({ player_id: id, nickname, mirror }) => {
          const { level, realmTier } = mirror.fighter.player
          const { sectId, stance, weaponName, companions } = mirror.identity
          return {
            id, nickname, level, stance, weaponName, companions, sameSect: !!sectId && sectId === player.currentSectId,
            realmName: REALMS.find((realm) => realm.tier === realmTier)?.name ?? REALMS[0].name,
            sectName: SECTS.find((sect) => sect.id === sectId)?.name ?? '逍遥散人',
          }
        }),
      }
    }, true)
  })

  app.post('/api/v1/raid/mirror', (request) => respond<{ mirrorAt: number }>(request, async (character, now, client) => {
    requireFeature(character.player, 'RAID')
    await saveRaidMirror(client, character, now)
    return { result: { mirrorAt: now }, changed: false }
  }))

  app.post('/api/v1/raid/start', async (request) => {
    const { teamId, revision, raidId: wanted, mirrorIds } = objectBody(request.body)
    const borrowing = mirrorIds !== undefined
    let finish: (() => void) | undefined
    const reports = new Map<string, BattleReportDTO>()
    try {
      const { response, updates } = await writeAction<BattleReportDTO>(request, async (leader, now, client, readRelated) => {
        requireFeature(leader.player, 'RAID')
        const fighter = (member: Character) => ({ player: member.player, loadout: activeLoadout(member), learnedSkills: member.learnedSkills, bonus: collectionBonus(member) })
        let raidId: RaidId
        let party: Character[]
        let lineup: Parameters<typeof simulateCoopRaid>[2]
        let lenders: string[] = []
        if (borrowing) {
          // 独自带两位侠客的结义镜像：奖励只发给自己，不必与谁同图
          if (typeof wanted !== 'string' || !Object.hasOwn(COOP_RAIDS, wanted)) throw new GameError(400, 'INVALID_RAID', '请选择有效的三人副本')
          if (raid.inTeam(leader.player.id)) throw new GameError(409, 'RAID_IN_TEAM', '已在队伍里：先离开队伍，再借镜像同闯')
          raidId = wanted as RaidId
          const borrowed = await borrowedMirrors(client, leader.player.id, mirrorIds)
          const [first, second] = borrowed.map(({ mirror }) => mirrorFighter(mirror))
          lenders = borrowed.map(({ id }) => id)
          party = [leader]
          lineup = [fighter(leader), first, second]
        } else {
          const team = raid.lineup(leader.player.id, teamId, revision)
          raidId = team.raidId
          const [left, right] = await readRelated([team.playerIds[1], team.playerIds[2]])
          for (const { player } of [left, right]) requireTargetFeature(player, 'RAID')
          if ([left, right].some(({ player }) => player.currentMapId !== leader.player.currentMapId)) {
            throw new GameError(409, 'RAID_NOT_NEARBY', '三位侠客要在同一处才能入阵')
          }
          finish = raid.reserve(leader.player.id, teamId, revision)
          party = [leader, left, right]
          lineup = [fighter(leader), fighter(left), fighter(right)]
        }
        const config = COOP_RAIDS[raidId]
        const clears = config.clearField
        const battle = simulateCoopRaid(raidId, randomUUID(), lineup, undefined, battleEnvironmentAt(config.mapId, new Date(now)))
        const won = battle.winner === 'ALLY'
        if (won) {
          // 镜像主人记助战真气，每天最多三次，下次收功时到账
          const day = innVisitDay(now)
          for (const id of lenders) {
            await client.query(`UPDATE raid_mirrors SET lend_day = $2, lends_today = CASE WHEN lend_day = $2 THEN lends_today + 1 ELSE 1 END,
              lends = lends + 1, lend_qi = lend_qi + $3 WHERE player_id = $1 AND (lend_day <> $2 OR lends_today < $4)`,
            [id, day, raidLendQi(config.rewardQi), RAID_LEND.dailyCap])
          }
        }
        const lootRecipients = new Set<string>()
        for (const member of party) {
          const { player } = member
          // 打过副本即登记（或刷新）自己的结义镜像
          await saveRaidMirror(client, member, now)
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
          const ingot = await grantIngotOnce(client, member, INGOT.raidWeekly, 'raid', `raid:${sectContestWeek(now)}`)
          reports.set(player.id, { ...battle, rewards: { qiExp, silver, items, ...(ingot ? { ingot } : {}) } })
        }
        return {
          result: reports.get(leader.player.id)!,
          changed: won || lootRecipients.has(leader.player.id),
          related: party.slice(1).filter(({ player }) => won || lootRecipients.has(player.id)),
        }
      })
      for (const updated of updates) rooms.publish(updated)
      // 借镜像时只有自己，战报随回执返回
      if (!borrowing) for (const [playerId, report] of reports) rooms.sendToPlayer(playerId, { event: 'RAID_REPORT', data: report })
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
    requireFeature(character.player, 'TRIAL')
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
    const { player, rewardedChapters, ownedItemIds } = character
    if (!adventure?.afterNodeId || adventure.id === STORY_SNAKE_ADVENTURE.id || !openToOrigin(adventure, player)) {
      throw new GameError(404, 'STORY_ADVENTURE_NOT_FOUND', '江湖图上没有这段奇遇')
    }
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
    requireFeature(character.player, 'GACHA')
    const id = request.params.companionId
    const quest = Object.hasOwn(REUNION_QUESTS, id) ? REUNION_QUESTS[id] : undefined
    if (!quest || !reunionAvailable(character, quest)) throw new GameError(409, 'REUNION_UNAVAILABLE', '此时没有可寻访的这位故人')
    const { action } = objectBody(request.body)
    const { player } = character
    const state = player.reunions?.[id]
    if (action === 'ticket') {
      if (player.goldIngot < REUNION_TICKET_COST) throw new GameError(409, 'INGOT_INSUFFICIENT', `元宝不足：故人重逢令需 ${REUNION_TICKET_COST} 元宝`)
      settle(character, now)
      player.goldIngot -= REUNION_TICKET_COST
      logIngot(character, -REUNION_TICKET_COST, 'reunion-ticket', undefined)
      const companion = character.companionAffinity[id] ??= blankCompanionState(id)
      companion.met = true
      companion.recruited = true
      companion.affinity = Math.max(companion.affinity, 100)
      const reunions = player.reunions ??= {}
      reunions[id] = { ...(state ?? newReunion()), step: 'DONE' }
      await saveCompanion(client, character, id)
      return { result: { action }, changed: true }
    }
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
    requireFeature(character.player, 'TRIAL')
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
    markDaily(character, 'battle', now)
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
    requireFeature(character.player, 'TRIAL')
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
    const rewardSilver = firstClear ? trialFirstClearSilver(stage.boss.hp, player) : 0
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
      learnedSkill(character, skillDrop.id)
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
      gainedItem(character, drop.id)
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
    requireFeature(character.player, 'TRIAL')
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
    requireFeature(character.player, 'TRIAL')
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
