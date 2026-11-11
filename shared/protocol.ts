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
  sectContribution: number
  isGuardingLibrary: boolean // 是否在藏经阁值守
  currentMapId: string
  maxChapterId: number
  qiPerHour: number
  lastSettleAt: number      // 毫秒时间戳
  coCultivatePartner: string | null // 双人抱拳共修伙伴名
  bountyUntil: number | null        // 叛师追杀令截止时间戳
  wearingMask: boolean              // 是否佩戴夜行蒙面巾(正派入鬼市用)
  activePresetIdx: 1 | 2 | 3
  trial: TrialStateDTO
}

/** 第一卷 30 关历练与巡历状态 */
export interface TrialStateDTO {
  selectedStageId: number          // 当前巡历关卡
  maxStageId: number               // 已开放的最高关卡
  rewardedStageIds: number[]       // 已领首胜
  stageHours: Record<string, number>   // 各关累计有效巡历小时
  replayHours: Record<string, number>  // 章末关复战进度
  lastPatrolAt: number             // 巡历结算锚点(毫秒)
  marks: Record<string, number>    // 巡历印记，4 枚换普通缺件
  recentDrops: { id: string; name: string; tier: TierColor; at: number }[] // 最近巡历掉落
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
  weaponId: string | null
  armorId: string | null
  headId?: string | null
  wristId?: string | null
  beltId?: string | null
  bootsId?: string | null
  accId: string | null
  relicBookId: string | null       // 全队共享秘宝槽
}

export interface CompanionState {
  affinity: number
  recruited: boolean
  taught: boolean
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
  loadouts: LoadoutPresetDTO[]
  ownedItemIds: string[]
  pillCount: number
  openedAcupointIds?: string[]
  pillInventory?: Record<string, number>
  learnedSkills: Record<string, number>
  companionAffinity: Record<string, CompanionState>
  derivedStats: DerivedStatsDTO
  soloQiPerHour: number
  coCultivation: CoCultivationDTO | null
  coCultivationInvite: CoCultivationInviteDTO | null
  shaoshiClears: number
  idlePreview: { pendingQi: number; pendingSilver: number }
}

export interface IdleGain {
  gainedQi: number
  gainedSilver: number
}

export interface GameAction<T> {
  snapshot: PlayerSnapshot
  result: T
}

export interface StoryChallengeResult {
  report: BattleReportDTO
  firstClear: boolean
}

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

export interface TrialReplayResult {
  report: BattleReportDTO
  drop: { id: string; name: string; tier: TierColor } | null
  replayHours: number
}

export interface SkillUpgradeResult {
  skillId: string
  mastery: number
  spentQi: number
  power: { before: number; after: number } | null
}

/** 结构化富文本片段（避免拼死HTML，支持点击词条查看详情） */
export type RichSegment =
  | { type: 'text'; text: string }
  | { type: 'actor'; name: string; isAlly?: boolean; isPlayer?: boolean }
  | { type: 'skill'; id: string; name: string; tier: TierColor }
  | { type: 'item'; id: string; name: string; tier: TierColor; isTrueUnique?: boolean }
  | { type: 'damage'; value: number; isCrit?: boolean; category: 'phys' | 'qi' | 'poison' | 'reflect' | 'heal' }
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
}

/** 战斗参战单位快照 (适配 1主+2副 或 3真实玩家结义组队) */
export interface CombatUnitDTO {
  slot: 'ALLY_LEFT' | 'ALLY_MAIN' | 'ALLY_RIGHT' | 'ENEMY_LEFT' | 'ENEMY_MAIN' | 'ENEMY_RIGHT'
  id: string
  name: string
  title: string
  portraitStyle: 'hero_sword' | 'guojing' | 'huangrong' | 'hongqigong' | 'huangyaoshi' | 'ouyangfeng' | 'meichaofeng' | 'zhoubotong' | 'monk' | 'assassin'
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
  type: 'STANCE_CLASH' | 'SKILL_CAST' | 'ASSIST_ATTACK' | 'GUARD_BLOCK' | 'DODGE' | 'DOT_TICK' | 'BOSS_ENRAGE'
  actorSlot: CombatUnitDTO['slot']
  targetSlot?: CombatUnitDTO['slot']
  skillId?: string
  skillName?: string
  skillTier?: TierColor
  isUlt?: boolean
  hitResult?: 'HIT' | 'CRIT' | 'PARRY' | 'DODGE'
  hpDelta?: number
  reflectDelta?: number
  rageDelta?: number
  statusApplied?: string
  segments: RichSegment[]
}

/** 完整战报响应 DTO */
export interface BattleReportDTO {
  battleId: string
  sceneTitle: string
  mode: 'SOLO_STORY' | 'PVP_HUASHAN' | 'PVP_AMBUSH' | 'COOP_3P' | 'SECT_TRIAL'
  stanceBanner: {
    allyStance: StanceType
    enemyStance: StanceType
    advantage: 'ALLY' | 'ENEMY' | 'NONE'
    description: string
  }
  units: CombatUnitDTO[]
  winner: 'ALLY' | 'ENEMY'
  events: BattleEventDTO[]
  rewards?: {
    qiExp: number
    silver: number
    sectContrib?: number
    items?: { id: string; name: string; tier: TierColor }[]
  }
}

export interface RaidTeamDTO {
  id: string
  leaderId: string
  revision: number
  starting: boolean
  members: { id: string; nickname: string; ready: boolean; online: boolean }[]
  invited: { id: string; nickname: string }[]
}

export interface RaidLobbyDTO {
  team: RaidTeamDTO | null
  invitation: { id: string; leaderNickname: string; expiresAt: number } | null
}

/** 全服唯一真品神兵状态 DTO */
export interface UniqueArtifactStatusDTO {
  artifactCode: string
  itemId: string
  name: string
  holderNickname: string | null // null 表示在王盘山/剑冢待争夺
  holderSect: string
  defendStreak: number
  nextContestLabel: string
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

/** WebSocket 实时推送消息联合类型 */
export type WsServerEvent =
  | { event: 'ROOM_SYNC'; data: { mapId: string; onlineCount: number; players: RoomPlayerDTO[] } }
  | { event: 'ROOM_CHAT'; data: { id: string; mapId: string; sender: { id: string; nickname: string }; content: string; sentAt: number } }
  | { event: 'PLAYER_CHANGED'; data: { revision: number } }
  | { event: 'TEAM_ROOM_SYNC'; data: RaidLobbyDTO }
  | { event: 'RAID_REPORT'; data: BattleReportDTO }
  | { event: 'CHAT_REJECTED'; data: { code: string; message: string } }
  | { event: 'WORLD_CHAT'; data: { id: string; channel: 'WORLD' | 'SECT' | 'RUMOR'; sender: string; sect: string; content: string; time: string } }
  | { event: 'SECT_BOUNTY_ISSUED'; data: { traitorName: string; sectName: string; stolenSkill: string; rewardSilver: number } }
  | { event: 'UNIQUE_ARTIFACT_CHANGED'; data: { artifactName: string; newOwner: string } }
