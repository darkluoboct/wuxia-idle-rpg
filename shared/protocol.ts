/**
 * ============================================================================
 * 《金庸群侠：问道武林》前后端统一通信协议契约 (Protocol & DTO Definitions)
 * 对应文档：《12_联网后端实施设计.md》
 * 若您的后端使用 Rust，可直接在结构体上使用 `#[derive(Serialize, Deserialize, TS)]` 对齐本文件
 * ============================================================================
 */

export type TierColor = 'green' | 'blue' | 'purple' | 'orange' | 'red'
export type StanceType = 'FIERCE' | 'AGILE' | 'TAICHI' // 刚猛强攻 | 奇门极速 | 太极柔化
export type ZoneSafety = 'PEACE' | 'CONTESTED'         // 和平共修区 | 限定纷争PK区
export type SkillSlotType = 'INNER' | 'OUTER' | 'LIGHT' | 'ULT'
export type EquipSlotType = 'WEAPON' | 'ARMOR' | 'ACC' | 'RELIC' | 'HEAD' | 'WRIST' | 'BELT' | 'BOOTS'
export type PersonalEquipSlot = Exclude<EquipSlotType, 'RELIC'>
export type CompanionWear = Partial<Record<Exclude<PersonalEquipSlot, 'WEAPON'>, string>>
export type PlayerAvatarId = 'hero_sword' | 'hero_sword_male'

/** 六维基础属性 */
export interface SixStats {
  str: number      // 臂力：外功攻击、重剑穿戴门槛、破甲
  con: number      // 根骨：气血内力上限、离线打坐倍率、冲穴率
  agi: number      // 身法：出手速度、闪避率、连击率
  intStat: number  // 悟性：参悟减免、拆招率、奇门鉴宝
  luck: number     // 福缘：奇遇触发率、残页掉率
  karma: number    // 侠义值 (-1000 ~ +1000，决定正邪门派接纳度)
}

export type StorySnakeChoice = 'A' | 'B'
export type GaibangBranch = 'WUYI' | 'JINGYI'

export type ForgeAffix = { stat: 'atk' | 'def' | 'hp' | 'speed' | 'crit'; value: number }

export interface EquipmentForge {
  iron: number
  stones: number
  items: Record<string, { stars: number; pity: number; secondary?: ForgeAffix }>
}

export type ForgeInput =
  | { action: 'temper'; itemId: string }
  | { action: 'salvage'; itemId: string }
  | { action: 'reforge'; itemId: string; lock?: 'primary' | 'secondary' }

export type ForgeResult =
  | { action: 'temper'; success: boolean; stars: number; pity: number; iron: number; stones: number }
  | { action: 'salvage'; iron: number; stones: number }
  | { action: 'reforge'; silver: number; affixRoll: number; secondary: ForgeAffix }

/** 角色完整面板 DTO */
export interface PlayerDTO {
  id: string
  nickname: string
  avatarId: PlayerAvatarId
  level: number
  realmTier: number         // 1~10 (初窥门径 -> 天人合一)
  realmStage: number        // 1~3 (初境/中境/极境)
  breakPityRate: number     // 冲穴失败累积保底加成(%)
  qiExp: number             // 当前储存的修为真气
  nextLevelQi: number       // 下一级所需真气
  silver: number            // 纹银(铜钱)
  goldIngot: number         // 元宝
  stats: SixStats
  shaQi: number             // 煞气值 (纷争区主动PK累积)
  currentSectId: string | null // null 表示【无门派·逍遥散人】
  sectRank: number          // 门派辈分阶位 1~5
  gaibangBranch?: GaibangBranch
  graduatedSectIds?: string[]
  betrayedSectIds?: string[]
  sectContribution: number
  sectProgressFlags?: string[]
  sectSaluteDay?: number
  gaibangBeggingDay?: number
  isGuardingLibrary: boolean // 是否在藏经阁值守
  currentMapId: string
  mapJourney?: { mapId: string; arrivesAt: number; inspected?: true }
  maxChapterId: number
  qiPerHour: number
  lastSettleAt: number      // 毫秒时间戳
  coCultivatePartner: string | null // 双人抱拳共修伙伴名
  bountyUntil: number | null        // 叛师追杀令截止时间戳
  bountyAccepted?: { targetId: string; expiresAt: number }
  wearingMask: boolean              // 是否佩戴夜行蒙面巾(正派入鬼市用)
  activePresetIdx: 1 | 2 | 3
  trial: TrialStateDTO
  bonusHpPct?: number               // 奇遇获得的永久气血上限加成(%)，如《药蛇宝血》+15
  bonusMp?: number
  openedAcupointIds?: string[]
  acupointPills?: Record<string, number>
  qiDeviationUntil?: number
  battleMedicines?: Record<string, number>
  alchemy?: { herbs: Record<string, number>; pity: Record<string, number>; residue: number }
  storySnakeChoice?: StorySnakeChoice
  storyAdventureChoices?: Record<string, StorySnakeChoice>
  storyFlags?: string[]
  reunions?: Record<string, ReunionStateDTO>
  mapArrivedAt?: number
  escortDart?: { mapId: string; silver: number; endsAt: number; robbed?: true }
  ghostMarketPurchases?: string[]
  innVisits?: { day: number; gifts: Record<string, { tea: number; gift: number }> }
  snakeFeedingRecipe?: true
  lastCityInspectionAt?: number
  equipmentAffixes?: Record<string, number>
  equipmentForge?: EquipmentForge
  skillFragments?: Record<string, number>
  qusanCacheDay?: number
  huashanRespectDay?: number
  chapterOneChampion?: true
  ftue?: FtueStateDTO
  ingotClaims?: string[]            // 已领的一次性元宝里程碑
  daily?: { day: number; done: string[]; claimed: boolean }
  patrolIngot?: { week: number; got: number } // 巡历宝箱本周已得的元宝（按周封顶）
  artifactDuel?: { day: number; used: number } // 君山擂台当日已上擂次数
  artifactHonors?: string[]         // 曾执掌过的全服唯一真品
  artifactLoss?: { itemId: string; at: number; cause: 'SEIZE' | 'RECALL' | 'BETRAY'; iron: number; by: string | null } // 最近一次失去真品
  stallOpen?: number                // 自己在鬼市还没收摊的摊位数
  stallSystem?: { day: number; bought: string[] } // 当日已买过的鬼市散客摊
  stallIncome?: { at: number; silver: number; returned: number } // 最近一次收摊结算：入账纹银、退回的货物份数
  defenseNotices?: DefenseNoticeDTO[] // 下线期间被劫镖、被追捕的战果，收功时告知后清空
  lastReportAt?: number             // 上次收功出江湖邸报的时刻
  auctionTickets?: number[]         // 鬼市红封签：领过每日江湖事的鬼市日，当日子时开签兑付
  auctionDividend?: { day: number; ingot: number } // 最近一次兑付的红封（未中签为 0）
  gacha?: { pulls: number; pity: number }
  feast?: { ingredients: string[]; cooked: string[]; lastCookDay: number }
  featureGate?: true                // 新手序章之后建的角色：玩法随剧情开放（老角色没有，全部开放）
  featuresSeen?: FeatureId[]        // 已看过开放剧情的玩法
  origin?: OriginId                 // 创角时选的家世（shared/origins.ts），老角色没有
}

/** 开局家世：将门、渔家、杏林、玄门 */
export type OriginId = 'jiangmen' | 'yujia' | 'xinglin' | 'xuanmen'

/** 随剧情开放的玩法（shared/features.ts） */
export type FeatureId = 'TRIAL' | 'INN' | 'MAPS' | 'DAILY' | 'GACHA' | 'GHOST' | 'SECT' | 'HUASHAN' | 'RAID' | 'XIANGYANG' | 'FEAST'

/** 首日《江湖行历》进度 */
export interface FtueStateDTO {
  index: number
  claimed: number[]
  forageCount: number
  refinedRecipeIds: string[]
}

export interface TrialDropDTO {
  id: string
  name: string
  tier: TierColor
  affixRoll?: number
  outcome?: 'NEW' | 'UPGRADED' | 'DUPLICATE'
  marksEarned?: 1
}

export type SectResult =
  | { action: 'join'; name: string; items?: string[] }
  | { action: 'graduate'; name: string }
  | { action: 'betray'; name: string; karmaDelta: number }
  | { action: 'salute'; qiExp: number; sectContrib: number; chief?: SectChiefDTO & { qiExp: number } }
  | { action: 'beg'; silver: number }
  | { action: 'claim-gear'; items: string[] }
  | { action: 'wanderer-gear'; items: string[] }
  | { action: 'snake-recipe' }
  | { action: 'prepare'; name: string; silver: number }
  | { action: 'debate'; correct: boolean; rewards?: BattleReportDTO['rewards'] }
  | { action: 'trial'; report: BattleReportDTO }

/** 第一卷 30 关历练与巡历状态 */
export interface TrialStateDTO {
  selectedStageId: number          // 当前巡历关卡
  maxStageId: number               // 已开放的最高关卡
  rewardedStageIds: number[]       // 已领首胜
  stageHours: Record<string, number>   // 各关累计有效巡历小时
  replayHours: Record<string, number>  // 章末关复战进度
  lastPatrolAt: number             // 巡历结算锚点(毫秒)
  encounterProgress?: number       // 下一次遭遇累积量，按毫秒乘频率百分数
  stageEncounters?: Record<string, number>
  marks: Record<string, number>    // 巡历印记，4 枚换普通缺件
  recentDrops: (TrialDropDTO & { at: number })[]
  recentCache?: PatrolCacheReward & { at: number }
}

export interface PatrolCacheReward {
  count: number
  silver: number
  ingot?: number
}

/** 装备/秘宝装配与阵容预设 */
export interface LoadoutPresetDTO {
  presetIdx: 1 | 2 | 3
  name: string
  stance: StanceType
  innerSkillId: string | null
  outerSkillId: string | null
  lightSkillId: string | null
  ultSkillId: string | null
  leftCompanionId: string | null   // 左翼·破阵卫
  rightCompanionId: string | null  // 右翼·奇策士
  companionWeapons?: Record<string, string>
  companionEquipment?: Record<string, CompanionWear>
  weaponId: string | null
  gearSkillId?: string | null
  armorId: string | null
  headId?: string | null
  wristId?: string | null
  beltId?: string | null
  bootsId?: string | null
  accId: string | null
  relicBookId: string | null       // 全队共享秘宝槽
  hiddenWeaponIds?: string[]
  titleId?: string | null
  battlePillId?: string | null
  weaponVenomId?: string | null
}

export interface CompanionState {
  affinity: number
  recruited: boolean
  taught: boolean
  met?: boolean
  form?: 'base' | 'awakened'
  grade?: '下' | '中' | '上' | null
  tokens?: number
}

export interface DerivedStatsDTO {
  maxHp: number
  maxMp: number
  atk: number
  def: number
  speed: number
  dodge: number
  crit: number
  combatPower: number
}

export interface CoCultivationDTO {
  id: string
  partner: { id: string; nickname: string }
  startsAt: number
  endsAt: number
}

export interface CoCultivationInviteDTO {
  id: string
  inviter: { id: string; nickname: string }
  invitee: { id: string; nickname: string }
  mapId: string
  expiresAt: number
}

export interface PlayerSnapshot {
  revision: number
  serverTime: number
  player: PlayerDTO
  rewardedChapters?: number[]
  loadouts: LoadoutPresetDTO[]
  ownedItemIds: string[]
  pillCount: number
  openedAcupointIds?: string[]
  pillInventory?: Record<string, number>
  learnedSkills: Record<string, number>
  companionAffinity: Record<string, CompanionState>
  derivedStats: DerivedStatsDTO
  soloQiPerHour: number
  soloSilverBasis?: number
  coCultivation: CoCultivationDTO | null
  coCultivationInvite: CoCultivationInviteDTO | null
  shaoshiClears: number
  chongyangClears: number
  juxianClears: number
  idlePreview: { pendingQi: number; pendingSilver: number }
}

export interface IdleGain {
  gainedQi: number
  gainedSilver: number
  drops?: TrialDropDTO[]
  forgeMaterials?: number
  patrolCache?: PatrolCacheReward
  reunionClues?: Record<string, number>
  feastIngredient?: string
  contestIngot?: number
  /** 下线期间镜像替你应战的劫镖与追捕，告知后清空 */
  defenseNotices?: DefenseNoticeDTO[]
  /** 江湖邸报：上次收功以来、你不在场时发生的事 */
  away?: AwayReportDTO
  /** 收功时顺带领到的襄阳封赏 */
  xiangyang?: { warId: number; skillId: string | null; reward: XiangyangRewardDTO }[]
}

export type CultivationResult =
  | { action: 'level'; level: number }
  | { action: 'pierce' | 'pill'; opened: string[]; spentQi: number; pillId?: string }
  | { action: 'break'; success: boolean; rate: number; protectedByPill: boolean; pityAdded: number }

export type VoyageResult = { status: 'WRECK'; silverLost: number } | { status: 'PROTECTED' }

export interface MapMoveResult extends IdleGain {
  voyage?: VoyageResult
  journey?: NonNullable<PlayerDTO['mapJourney']>
}

export interface GameAction<T> {
  snapshot: PlayerSnapshot
  result: T
}

export interface StoryChallengeResult {
  report: BattleReportDTO
  firstClear: boolean
}

export interface StorySnakeChoiceResult {
  choice: StorySnakeChoice
  firstPick: boolean
}

export interface StoryAdventureResult extends StorySnakeChoiceResult {
  report?: BattleReportDTO
  narration?: RichSegment[]
}

export type ReunionClueSource = 'closed' | 'replay' | 'inn'
export interface ReunionStateDTO {
  clues: number
  day: number
  got: Record<ReunionClueSource, number>
  step: 'CLUES' | 'WAIT' | 'GIFT' | 'BATTLE' | 'DONE'
  waitSince: number | null
  waitMs: number
}

export type ReunionResult =
  | { action: 'inquire'; clues: number }
  | { action: 'wait' | 'gift' | 'ticket' }
  | { action: 'battle'; report: BattleReportDTO }

export interface TrialPatrolStatusDTO {
  stageId: number
  hours: number
  requiredHours: number
  encounters: number
}

export interface TrialChallengeResult {
  report: BattleReportDTO
  firstClear: boolean
  unlockedStageId: number | null
  drops: { id: string; name: string; tier: TierColor }[]
  patrol: TrialPatrolStatusDTO
}

export interface ChapterOneStatueDTO {
  playerId: string
  nickname: string
  avatarId: PlayerAvatarId
  wonAt: number
}

export interface TrialReplayResult {
  report: BattleReportDTO
  drop: TrialDropDTO | null
  replayHours: number
}

export interface MirrorRankEntryDTO {
  id: string
  nickname: string
  avatarId: PlayerAvatarId
  sectId: string | null
  stance: StanceType
  weaponName?: string
  companions: string[]
  rating: number
  wins: number
  matches: number
  rank: number
}

export interface HuashanEntryDTO extends MirrorRankEntryDTO {
  honor?: string
  suffix?: string
  inscription?: string
}

export interface HuashanBoardDTO {
  seasonId: number
  endsAt: number
  self: HuashanEntryDTO | null
  leaderboard: HuashanEntryDTO[]
  opponents: HuashanEntryDTO[]
  lastSeason: number | null
  fiveGreats: HuashanEntryDTO[]
  awards: { seasonId: number; rank: number; availableHonors: readonly string[] }[]
  canRespect: boolean
}

export type HuashanAction =
  | { action: 'mirror'; seasonId: number }
  | { action: 'challenge'; seasonId: number; targetPlayerId: string }
  | { action: 'claim'; seasonId: number; honor?: string; suffix?: string; inscription?: string }
  | { action: 'inscription'; seasonId: number; suffix?: string; inscription?: string }
  | { action: 'respect'; seasonId: number; targetPlayerId: string }

export type HuashanResult =
  | { action: 'mirror' | 'inscription' }
  | { action: 'challenge'; report: BattleReportDTO; rating: number; ratingDelta: number }
  | { action: 'claim' | 'respect'; qiExp: number; silver: number; ingot?: number }

export type SectChiefDTO = Pick<PlayerDTO, 'id' | 'nickname' | 'avatarId'>

export interface SectContestBoardDTO {
  sectId: string
  weekId: number
  endsAt: number
  chief: SectChiefDTO | null
  self: MirrorRankEntryDTO | null
  leaderboard: MirrorRankEntryDTO[]
}

export type SectContestAction = { sectId: string; weekId: number } & (
  { action: 'mirror' } | { action: 'challenge'; targetPlayerId: string }
)

export type SectContestResult = { action: 'mirror' } | Extract<HuashanResult, { action: 'challenge' }>

export interface SkillUpgradeResult {
  skillId: string
  mastery: number
  spentQi: number
  spentFragments?: number
  power: { before: number; after: number } | null
}

/** 结构化富文本片段（避免拼死HTML，支持点击词条查看详情） */
export type RichSegment =
  | { type: 'text'; text: string }
  | { type: 'actor'; name: string; isAlly?: boolean; isPlayer?: boolean }
  | { type: 'skill'; id: string; name: string; tier: TierColor }
  | { type: 'item'; id: string; name: string; tier: TierColor; isTrueUnique?: boolean }
  | { type: 'damage'; value: number; isCrit?: boolean; category: 'phys' | 'qi' | 'true' | 'poison' | 'bleed' | 'reflect' | 'heal' }
  | { type: 'tag'; text: string; tone: 'gold' | 'red' | 'jade' | 'purple' }

/** 滚动日志条目 */
export interface GameLogEntry {
  id: string
  timeLabel: string // 如 "辰时·08:12"
  channel: 'CULTIVATE' | 'ADVENTURE' | 'BATTLE' | 'JIANGHU'
  segments: RichSegment[]
}

/** 待抉择江湖奇遇 DTO */
export interface PendingAdventureDTO {
  id: string
  templateId?: string       // 奇遇模板ID（服务端据此结算选项效果）
  title: string
  location: string
  description: string
  options: {
    key: 'A' | 'B'
    label: string
    requirementText?: string
    canSelect: boolean
  }[]
}

/** 同地图附近真实玩家 DTO */
export interface RoomPlayerDTO {
  id: string
  nickname: string
  sectName: string
  realmName: string
  level: number
  combatPower: number
  stance: StanceType
  isBetrayerBounty: boolean // 是否背负全服叛师追杀令
  isEscortingDart: boolean  // 是否正在押镖(限定纷争区可劫掠)
  holdingUniqueArtifact?: string // 若持有全服唯一真品神兵则高亮公示
  offline?: true            // 不在线、停在本图：可留帖共修；劫镖或追捕由他的镜像应战
}

/** 江湖邸报（docs/21）：收功时汇总上次收功以来、你不在场时发生的事；修行、巡历、封赏等仍在 IdleGain 的其他字段 */
export interface AwayReportDTO {
  /** 上次收功的时刻 */
  since: number
  /** 襄阳值守镜像代打 */
  xiangyang?: { sorties: number; merit: number }
  /** 鬼市摊位卖出（纹银为扣税后） */
  stallSales?: { count: number; silver: number }
  /** 暗拍红封（未中签为 0） */
  dividends?: { day: number; ingot: number }[]
  /** 结义镜像被借去同闯打赢，记下的助战真气（本次收功到账） */
  raidLends?: { count: number; qiExp: number }
}

/** 下线时被劫镖或被追捕：镜像替你应战，收功时一并告知（docs/21） */
export interface DefenseNoticeDTO {
  at: number
  kind: 'ESCORT' | 'BOUNTY'
  attacker: string
  /** 镜像守住了 */
  held: boolean
  /** 镖车被劫走的纹银 */
  silver?: number
}

export interface BountyEntryDTO {
  targetId: string
  nickname: string
  sectId: string
  expiresAt: number
  mapId?: string            // 接令后可见：目标停留的地图（不在线也查得到）
  online?: boolean          // 接令后可见：目标是否在线；不在线时追捕由他的镜像应战
  silver: number
  sectContrib: number
  accepted: boolean
}

export interface BountyBoardDTO {
  entries: BountyEntryDTO[]
}

export interface LibraryStatusDTO {
  guardAvailable: boolean
  reports: { battleId: string; occurredAt: number; intruder: string; won: boolean; silver: number; sectContrib: number }[]
}

export type LibraryResult = { action: 'guard'; enabled: boolean } | { action: 'steal'; report: BattleReportDTO }

export type EscortSlot = 'ALLY_ESCORT_LEFT' | 'ALLY_ESCORT_RIGHT' | 'ALLY_ESCORT_REAR_LEFT' | 'ALLY_ESCORT_REAR_RIGHT'

/** 战斗参战单位快照 */
export interface CombatUnitDTO {
  slot: 'ALLY_LEFT' | 'ALLY_MAIN' | 'ALLY_RIGHT' | 'ENEMY_LEFT' | 'ENEMY_MAIN' | 'ENEMY_RIGHT' | 'ENEMY_REAR' | EscortSlot
  id: string
  name: string
  title: string
  portraitStyle:
    | 'hero_sword' | 'guojing' | 'huangrong' | 'hongqigong' | 'huangyaoshi' | 'ouyangfeng' | 'meichaofeng' | 'zhoubotong' | 'monk' | 'assassin'
    | 'munianci' | 'ouyangke' | 'wanyankang' | 'qiuqianren' | 'daoist' | 'chenxuanfeng' | 'bandit'
    | 'wangchongyang' | 'yideng' | 'zhebie' | 'yinggu' | 'yangtiexin' | 'sunbuer' | 'luchengfeng' | 'zhuziliu' | 'baoxiruo'
    | 'leizheng' | 'ruanqinggao' | 'shenqingdai' | 'songyanzi'
  avatarId?: PlayerAvatarId
  isPlayer: boolean
  maxHp: number
  hp: number
  maxMp: number
  rage: number
  weaponName?: string
}

/** 单步战斗事件（服务端一次算完下发，前端按 1x/2x 节奏逐帧演绎） */
export interface BattleEventDTO {
  round: number
  type: 'STANCE_CLASH' | 'SKILL_CAST' | 'ASSIST_ATTACK' | 'GUARD_BLOCK' | 'DODGE' | 'DOT_TICK' | 'BOSS_ENRAGE' | 'EFFECT'
  actorSlot: CombatUnitDTO['slot']
  targetSlot?: CombatUnitDTO['slot']
  skillId?: string
  skillName?: string
  skillTier?: TierColor
  isUlt?: boolean
  hitResult?: 'HIT' | 'CRIT' | 'PARRY' | 'DODGE' | 'MISS'
  hpDelta?: number
  silverDrop?: number
  qiDrop?: number
  shieldDelta?: number
  shieldAbsorbed?: number
  reflectDelta?: number
  rageDelta?: number
  rageTargetSlot?: CombatUnitDTO['slot']
  mpDelta?: number
  medicineUsed?: string
  effectSourceId?: string
  trueStrikeSourceId?: string
  statusApplied?: string
  statusRemoved?: string
  statusRounds?: number
  statusStacks?: number
  opponentEntry?: { unit: CombatUnitDTO; guards?: CombatUnitDTO[]; stanceBanner: BattleReportDTO['stanceBanner'] }
  segments: RichSegment[]
}

/** 完整战报响应 DTO */
export type RaidId = 'shaoshi' | 'chongyang' | 'juxian'

export interface BattleReportDTO {
  battleId: string
  sceneTitle: string
  mode: 'SOLO_STORY' | 'PVP_HUASHAN' | 'PVP_AMBUSH' | 'COOP_3P' | 'SECT_TRIAL'
  raidId?: RaidId
  stanceBanner: {
    allyStance: StanceType
    enemyStance: StanceType
    advantage: 'ALLY' | 'ENEMY' | 'NONE'
    description: string
  }
  units: CombatUnitDTO[]
  winner: 'ALLY' | 'ENEMY'
  retreated?: true
  survivedRounds?: number
  perspective?: 'ENEMY'
  events: BattleEventDTO[]
  rewards?: {
    qiExp: number
    silver: number
    sectContrib?: number
    karma?: number
    items?: { id: string; name: string; tier: TierColor }[]
    companions?: string[]
    title?: string
    ingot?: number
  }
}

export interface RaidTeamDTO {
  id: string
  raidId: RaidId
  leaderId: string
  revision: number
  starting: boolean
  members: { id: string; nickname: string; ready: boolean; online: boolean }[]
  invited: { id: string; nickname: string }[]
}

export interface DuelInviteDTO {
  id: string
  inviter: { id: string; nickname: string }
  invitee: { id: string; nickname: string }
  expiresAt: number
  mapId: string
}

export interface RaidLobbyDTO {
  team: RaidTeamDTO | null
  invitation: { id: string; raidId: RaidId; leaderNickname: string; expiresAt: number } | null
}

/** 结义镜像：打过副本或主动登记的侠客按当时配装冻结，同伴不在线时可借来同闯（docs/21） */
export interface RaidMirrorDTO {
  id: string
  nickname: string
  level: number
  realmName: string
  sectName: string
  stance: StanceType
  weaponName?: string
  companions: string[]
  /** 与你同门，排在前面 */
  sameSect: boolean
}

export interface RaidMirrorBoardDTO {
  /** 自己登记的结义镜像 */
  mine: { mirrorAt: number } | null
  candidates: RaidMirrorDTO[]
}

/** 开打三人副本：三人队伍由队长开打；或独自带两位侠客的结义镜像 */
export type RaidStartInput = { teamId: string; revision: number } | { raidId: RaidId; mirrorIds: string[] }

/** 全服唯一真品神兵状态 DTO */
export interface UniqueArtifactStatusDTO {
  artifactCode: string
  itemId: string
  name: string
  /** UNCLAIMED 从未有人得到；VACANT 无主或执棒者久未露面，由传功长老代守 */
  state: 'UNCLAIMED' | 'HELD' | 'VACANT'
  holderId: string | null
  holderNickname: string | null
  holderSect: string | null
  heldSince: number | null
  defendStreak: number
  /** 执棒者再不露面就收回的时刻 */
  recallAt: number | null
  duels: { at: number; challenger: string; defender: string | null; won: boolean; self: boolean }[]
}

export interface ArtifactBoardDTO {
  serverTime: number
  artifacts: UniqueArtifactStatusDTO[]
  /** 神兵名录：第一卷神品装备的全服持有人数 */
  registry: { itemId: string; holders: number }[]
}

export type ArtifactAction = { action: 'challenge'; itemId: string; holderId: string | null }

export type ArtifactResult = { action: 'challenge'; report: BattleReportDTO; won: boolean; attemptsLeft: number }

export interface GhostAppraisalResult {
  spentSilver: number
  swordFound: boolean
  inspection: 'NONE' | 'EVADED' | 'CAUGHT'
  evasionPercent: number
  karmaDelta: number
}

export interface InnGiftResult {
  affinityGained: number
  taughtSkillId?: string
}

/** 子时鬼市寄售/竞拍条目 DTO */
export interface GhostMarketListingDTO {
  id: string
  maskedSeller: string // 服务端 HMAC 脱敏代号，如 "蒙面客·戌七"
  itemId: string
  itemName: string
  tier: TierColor
  listingType: 'FIXED' | 'AUCTION'
  currency: 'SILVER' | 'GOLD'
  price: number
  highestBidderMasked?: string
  desc: string
}

/** 子时鬼市压轴暗拍 */
export interface AuctionLotDTO {
  day: number
  itemId: string
  seller: string
  startPrice: number
  price: number            // 当前最高出价；无人出价时为起拍价
  nextBid: number
  bids: number
  opensAt: number
  closesAt: number
  leaderMasked: string | null
  leading: boolean         // 当前领先的是不是自己
  myMax?: number           // 自己领先时的心理价（已冻结）
  /**
   * 落槌且有人出价后公示红封：持签人数、中签人数、每份元宝，以及自己的情况。
   * 子时（paysAt）开签前人数还会增加，自己持签记为 HELD。
   */
  dividend?: { eligible: number; winners: number; share: number; paysAt: number; mine: 'PAID' | 'PENDING' | 'MISSED' | 'HELD' | 'NONE' }
}

export interface AuctionBoardDTO {
  serverTime: number
  lot: AuctionLotDTO
  history: { masked: string; amount: number; at: number; self: boolean; proxy?: true }[]
  previous: AuctionLotDTO | null   // 上一场成交公示
  wins: { day: number; itemId: string; price: number }[] // 已落槌、待领取的拍品
}

export type AuctionAction =
  | { action: 'bid'; day: number; maxPrice: number } // 心理价；领先时再出价即加码
  | { action: 'claim'; day: number }
  | { action: 'dividend'; day: number } // 只为触发红封兑付，本身不改动任何东西

export type AuctionResult =
  | { action: 'bid'; day: number; price: number; closesAt: number; leading: boolean; maxPrice: number }
  /** owned：落槌后已从别处得到同一件，只退元宝；refunded 是这回退还的元宝（心理价多冻的，或已有时全数） */
  | { action: 'claim'; day: number; itemId: string; owned: boolean; refunded: number }
  | { action: 'dividend'; day: number }

/** 子时鬼市蒙面摊位 */
export interface StallListingDTO {
  id: string
  kind: 'HERB' | 'FRAGMENT'
  goodsId: string
  qty: number                // 还剩多少份
  unitPrice: number
  seller: string             // 摊主代号；散客摊为「鬼市散客」
  system: boolean            // 鬼市散客摊：整摊买走，每人每天一次
  expiresAt: number
  /** 只在自己的摊位上有：已卖出的份数、还没入账的纹银 */
  sold?: number
  proceeds?: number
}

export interface StallBoardDTO {
  serverTime: number
  listings: StallListingDTO[]   // 别人的摊位与散客摊
  mine: StallListingDTO[]
  recent: { kind: 'HERB' | 'FRAGMENT'; goodsId: string; qty: number; unitPrice: number; at: number }[]
}

export type StallAction =
  | { action: 'list'; kind: 'HERB' | 'FRAGMENT'; goodsId: string; qty: number; unitPrice: number }
  | { action: 'buy'; listingId: string; qty: number; unitPrice: number }
  | { action: 'cancel'; listingId: string }
  | { action: 'collect' } // 只为触发收摊结算，本身不改动任何东西

export type StallResult =
  | { action: 'list'; listingId: string; kind: 'HERB' | 'FRAGMENT'; goodsId: string; qty: number; unitPrice: number; fee: number }
  | { action: 'buy'; kind: 'HERB' | 'FRAGMENT'; goodsId: string; qty: number; spent: number }
  | { action: 'cancel'; kind: 'HERB' | 'FRAGMENT'; goodsId: string; returned: number; silver: number }
  | { action: 'collect' }

/** WebSocket 实时推送消息联合类型 */
export type WsServerEvent =
  | { event: 'ROOM_SYNC'; data: { mapId: string; onlineCount: number; players: RoomPlayerDTO[] } }
  | { event: 'ROOM_CHAT'; data: { id: string; mapId: string; sender: { id: string; nickname: string }; content: string; sentAt: number } }
  | { event: 'PLAYER_CHANGED'; data: { revision: number } }
  | { event: 'TEAM_ROOM_SYNC'; data: RaidLobbyDTO }
  | { event: 'RAID_REPORT'; data: BattleReportDTO }
  | { event: 'DUEL_INVITE'; data: DuelInviteDTO | null }
  | { event: 'DUEL_REPORT'; data: BattleReportDTO }
  | { event: 'CHAT_REJECTED'; data: { code: string; message: string } }
  | { event: 'WORLD_CHAT'; data: { id: string; channel: 'WORLD' | 'SECT' | 'RUMOR'; sender: string; sect: string; content: string; time: string } }
  | { event: 'SECT_BOUNTY_ISSUED'; data: { traitorName: string; sectName: string; stolenSkill: string; rewardSilver: number } }
  | { event: 'UNIQUE_ARTIFACT_CHANGED'; data: { itemId: string; cause: 'GRANT' | 'SEIZE' | 'RECALL' | 'BETRAY'; newOwner: string | null; previousOwner: string | null } }
  | { event: 'AUCTION_OUTBID'; data: { day: number; itemId: string; refund: number; price: number } }
  | { event: 'STALL_SOLD'; data: { kind: 'HERB' | 'FRAGMENT'; goodsId: string; qty: number; silver: number } }

/** 襄阳守卫战（shared/xiangyang.ts） */
export type XiangyangGateId = 'EAST' | 'NORTH' | 'WATER'

export interface XiangyangGateDTO {
  id: XiangyangGateId
  /** 正在打的一波；八波都击退后为 9 */
  wave: number
  progress: number
  need: number
  defenders: number
}

export interface XiangyangFeedDTO {
  at: number
  nickname: string
  gate: XiangyangGateId
  wave: number
  merit: number
  won: boolean
  repelled?: number
  /** 值守镜像代打 */
  auto?: true
  /** 擂鼓时亲自出战，战功已加五成 */
  drum?: true
}

export interface XiangyangRewardDTO {
  ingot: number
  iron: number
  stones: number
  fragments: number
  qiExp: number
  silver: number
}

export interface XiangyangAwardDTO {
  warId: number
  gate: XiangyangGateId
  wavesCleared: number
  merit: number
  sorties: number
  topThree: boolean
  /** 残页落在哪门武学（出战时装着的外功）；没装外功则不发残页 */
  skillId: string | null
  reward: XiangyangRewardDTO
}

export interface XiangyangBoardDTO {
  /** 本周这一场，周一 00:00 至下周一 00:00 */
  war: { id: number; opensAt: number; closesAt: number }
  /** 正在擂鼓的一个时辰，或下一次 */
  drum: { opensAt: number; closesAt: number; active: boolean }
  gates: XiangyangGateDTO[]
  /** 本场的城门、出战次数（含值守代打）与战功；还没出过战为 null */
  self: { gate: XiangyangGateId; sorties: number; autoSorties: number; merit: number } | null
  /** 手上的军令与下一道送到的时刻（攒满时为 null） */
  orders: { count: number; nextAt: number | null }
  /** 值守：跨场保留的城门、镜像配装的时刻、镜像下一次替你出战的时刻 */
  post: { gate: XiangyangGateId; mirrorAt: number; nextAutoAt: number } | null
  feed: XiangyangFeedDTO[]
  /** 已收兵、还没领的封赏 */
  awards: XiangyangAwardDTO[]
  /** 上一场各门战果 */
  last: { warId: number; gates: { id: XiangyangGateId; wavesCleared: number }[] } | null
}

export type XiangyangAction =
  | { action: 'sortie'; warId: number; gate: XiangyangGateId }
  | { action: 'post'; gate: XiangyangGateId }
  | { action: 'drill'; gate: XiangyangGateId; wave: number }
  | { action: 'claim'; warId: number }

export type XiangyangResult =
  | { action: 'sortie'; report: BattleReportDTO; merit: number; drum: boolean; gate: XiangyangGateDTO; repelled: number[] }
  /** current：本场就守这一门；否则本场已在别门出过战，下一场起改守 */
  | { action: 'post'; gate: XiangyangGateId; current: boolean }
  | { action: 'drill'; report: BattleReportDTO; merit: number }
  | { action: 'claim'; warId: number; skillId: string | null; reward: XiangyangRewardDTO }

/** 客栈结缘：单抽结果（真实环境由服务端产出并记审计日志，客户端只负责展示） */
export interface GachaDrawDTO {
  pullNo: number // 账号累计第几抽
  tier: 'red' | 'orange' | 'purple' | 'blue'
  kind: 'COMPANION' | 'SKILL' | 'ITEM' | 'TOKEN' | 'PILL' | 'SILVER' | 'QI'
  refId?: string
  qty?: number
  grade?: '下' | '中' | '上' // 橙品伙伴资质
  pityTriggered?: boolean // 本抽由保底（软/硬/十连）带出
  detail?: string // 结算文案：新得入手 / 重复转化
  isNew?: boolean
}

export interface GachaResult {
  cost: number
  draws: GachaDrawDTO[]
}

export interface AwakenResult {
  title: string
  spent: number
}

export interface FeastResult {
  dishId: string
  cooked: number
  affinity: number
  done: boolean
}

export interface FtueClaimResult {
  questId: number
  qiExp: number
  silver: number
  pillId?: string
}
