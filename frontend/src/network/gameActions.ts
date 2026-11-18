import type {
  ArtifactAction,
  ArtifactResult,
  AuctionAction,
  AuctionResult,
  AwakenResult,
  BattleReportDTO,
  BountyEntryDTO,
  CultivationResult,
  EquipSlotType,
  FeastResult,
  FeatureId,
  ForgeInput,
  ForgeResult,
  FtueClaimResult,
  GachaResult,
  GhostAppraisalResult,
  HuashanAction,
  HuashanResult,
  IdleGain,
  InnGiftResult,
  LibraryResult,
  LoadoutPresetDTO,
  MapMoveResult,
  ReunionResult,
  SectContestAction,
  MailAttachments,
  RaidStartInput,
  SectContestResult,
  SectResult,
  SkillUpgradeResult,
  StallAction,
  StallResult,
  StoryAdventureResult,
  StoryChallengeResult,
  StorySnakeChoice,
  StorySnakeChoiceResult,
  TrialChallengeResult,
  TrialPatrolStatusDTO,
  TrialReplayResult,
  XiangyangAction,
  XiangyangResult,
} from './protocol'
import type { cultivatePlayer } from '../../../shared/player.ts'
import type { extractFurnaceResidue, gatherHerbs } from '../../../shared/alchemy.ts'

type SectAction =
  | {
      action: 'join' | 'salute' | 'claim-gear' | 'snake-recipe' | 'beg' | 'graduate' | 'betray'
      sectId: string
    }
  | { action: 'wanderer-gear' }
  | { action: 'debate'; sectId: string; expectedRank: number; answer: number }
  | { action: 'prepare'; sectId: string; expectedRank: number; dishId: string }
  | { action: 'trial'; sectId: string; expectedRank: number; branch?: 'WUYI' }

type CoCultivationAction =
  | { action: 'invite'; targetPlayerId: string }
  | { action: 'accept' | 'decline' | 'cancel'; invitationId: string }
  | { action: 'end'; coCultivationId: string }

type DuelAction =
  | { action: 'invite' | 'ambush'; targetPlayerId: string }
  | { action: 'accept' | 'decline'; inviteId: string }
  | { action: 'pursue'; targetPlayerId: string; expiresAt: number }

type TrialBattle = { stageId: number; answer?: string; retreat?: boolean }

interface Actions {
  settle: [undefined, IdleGain]
  cultivate: [Parameters<typeof cultivatePlayer>[3] & { expectedTier: number }, CultivationResult]
  forage: [undefined, { herbs: ReturnType<typeof gatherHerbs> }]
  refine: [{ recipeId: string }, { medicineId: string; count: number }]
  extract: [undefined, ReturnType<typeof extractFurnaceResidue>]
  forge: [ForgeInput, ForgeResult]
  upgradeSkill: [
    { skillId: string; expectedMastery: number; useFragments: boolean },
    SkillUpgradeResult,
  ]
  saveLoadout: [{ preset: LoadoutPresetDTO; activate: boolean; expectedRevision: number }, IdleGain]
  openCache: [undefined, { skillId: string; count: number }]
  patrol: [{ stageId: number }, TrialPatrolStatusDTO]
  trial: [TrialBattle, TrialChallengeResult]
  replay: [TrialBattle, TrialReplayResult]
  redeem: [{ stageId: number; slot: EquipSlotType }, { itemId: string; name: string }]
  adventure: [{ id: string; choice: 'A' | 'B' } | undefined, StoryAdventureResult]
  storySnake: [{ code: string; choice: StorySnakeChoice }, StorySnakeChoiceResult]
  story: [{ code: string; retreat: boolean }, StoryChallengeResult]
  reunion: [{ id: string; action: ReunionResult['action'] }, ReunionResult]
  innGift: [{ companionId: string; favorite: boolean }, InnGiftResult]
  gacha: [{ count: 1 | 10 }, GachaResult]
  awaken: [{ companionId: string }, AwakenResult]
  feast: [{ dishId: string }, FeastResult]
  ftueClaim: [undefined, FtueClaimResult]
  featureSeen: [{ featureId: FeatureId }, { featureId: FeatureId }]
  dailyClaim: [undefined, { ingot: number; ticket: boolean }]
  appraise: [{ masked: boolean }, GhostAppraisalResult]
  buy: [{ listingId: string }, { spentSilver: number }]
  auction: [AuctionAction, AuctionResult]
  artifact: [ArtifactAction, ArtifactResult]
  stall: [StallAction, StallResult]
  sect: [SectAction, SectResult]
  move: [{ mapId: string; action?: 'depart' | 'arrive' }, MapMoveResult]
  huashan: [HuashanAction, HuashanResult]
  xiangyang: [XiangyangAction, XiangyangResult]
  sectContest: [SectContestAction, SectContestResult]
  raid: [RaidStartInput | undefined, BattleReportDTO]
  raidMirror: [undefined, { mirrorAt: number }]
  mail: [{ action: 'claim'; mailId: string }, { mailId: string; attachments: MailAttachments }]
  coCultivate: [CoCultivationAction, IdleGain]
  duel: [DuelAction | undefined, BattleReportDTO | null]
  escort: [{ action: 'start' | 'claim' }, { silver: number }]
  acceptBounty: [{ targetPlayerId: string; expiresAt: number }, BountyEntryDTO]
  library: [
    { action: 'guard'; enabled: boolean } | { action: 'steal'; skillId: string },
    LibraryResult,
  ]
}

type Request = [method: 'POST' | 'PUT', path: string, body?: unknown]
const trialBody = ({ answer, retreat }: TrialBattle) =>
  retreat ? { answer, retreat } : answer === undefined ? undefined : { answer }

const requests: { [K in keyof Actions]: (input: Actions[K][0]) => Request | undefined } = {
  settle: () => ['POST', '/cultivate/settle'],
  cultivate: (body) => ['POST', '/cultivate/progress', body],
  forage: () => ['POST', '/alchemy/forage'],
  refine: (body) => ['POST', '/alchemy/refine', body],
  extract: () => ['POST', '/alchemy/extract'],
  forge: (body) => ['POST', '/equipment/forge', body],
  upgradeSkill: (body) => ['POST', '/skill/upgrade', body],
  saveLoadout: ({ preset, activate, expectedRevision }) => [
    'PUT',
    `/loadout/${preset.presetIdx}`,
    { preset: { ...preset }, activate, expectedRevision },
  ],
  openCache: () => ['POST', '/trial/qusan-cache'],
  patrol: (body) => ['POST', '/trial/patrol', body],
  trial: (input) => ['POST', `/trial/${input.stageId}/challenge`, trialBody(input)],
  replay: (input) => ['POST', `/trial/${input.stageId}/replay`, trialBody(input)],
  redeem: ({ stageId, slot }) => ['POST', `/trial/${stageId}/redeem`, { slot }],
  adventure: (input) =>
    input && ['POST', `/story/adventures/${input.id}`, { choice: input.choice }],
  storySnake: ({ code, choice }) => ['POST', `/story/${code}/adventure`, { choice }],
  story: ({ code, retreat }) => [
    'POST',
    `/story/${code}/challenge`,
    retreat ? { retreat } : undefined,
  ],
  reunion: ({ id, action }) => ['POST', `/story/reunion/${id}`, { action }],
  innGift: (body) => ['POST', '/market/inn/gift', body],
  gacha: (body) => ['POST', '/market/gacha', body],
  awaken: (body) => ['POST', '/companions/awaken', body],
  feast: (body) => ['POST', '/market/feast', body],
  ftueClaim: () => ['POST', '/ftue/claim'],
  featureSeen: (body) => ['POST', '/features/seen', body],
  dailyClaim: () => ['POST', '/daily/claim'],
  appraise: (body) => ['POST', '/market/ghost/appraise', body],
  buy: (body) => ['POST', '/market/ghost/buy', body],
  auction: (body) => ['POST', '/market/auction', body],
  artifact: (body) => ['POST', '/market/artifacts', body],
  stall: (body) => ['POST', '/market/stalls', body],
  sect: (body) => ['POST', '/sect', body],
  move: (body) => ['POST', '/map/move', body],
  huashan: (body) => ['POST', '/huashan', body],
  xiangyang: (body) => ['POST', '/xiangyang', body],
  sectContest: (body) => ['POST', '/sect/contest', body],
  raid: (body) => body && ['POST', '/raid/start', body],
  raidMirror: () => ['POST', '/raid/mirror'],
  mail: (body) => ['POST', '/mail', body],
  coCultivate: (body) => ['POST', '/map/co-cultivate', body],
  duel: (body) => body && ['POST', '/duel', body],
  escort: (body) => ['POST', '/escort', body],
  acceptBounty: (body) => ['POST', '/bounties/accept', body],
  library: (body) => ['POST', '/sect/library', body],
}

/** 随剧情开放的玩法：未开放时不发请求（服务端同样拦截，见 shared/features.ts） */
const ACTION_FEATURES: Partial<Record<keyof Actions, FeatureId>> = {
  patrol: 'TRIAL', trial: 'TRIAL', replay: 'TRIAL', redeem: 'TRIAL', openCache: 'TRIAL',
  innGift: 'INN', awaken: 'INN',
  forage: 'MAPS', refine: 'MAPS', extract: 'MAPS', move: 'MAPS', coCultivate: 'MAPS',
  dailyClaim: 'DAILY',
  gacha: 'GACHA', reunion: 'GACHA',
  appraise: 'GHOST', buy: 'GHOST', auction: 'GHOST', stall: 'GHOST',
  sect: 'SECT', sectContest: 'SECT', library: 'SECT',
  huashan: 'HUASHAN', artifact: 'HUASHAN', duel: 'HUASHAN', escort: 'HUASHAN', acceptBounty: 'HUASHAN',
  raid: 'RAID', raidMirror: 'RAID',
  xiangyang: 'XIANGYANG',
  feast: 'FEAST',
}

export function actionFeature<K extends keyof Actions>(action: K, input: Actions[K][0]): FeatureId | undefined {
  // 鬼市洗炼走锻造接口；温养、拆解在武库里随时可用
  if (action === 'forge') return (input as ForgeInput).action === 'reforge' ? 'GHOST' : undefined
  // 回应邀请不拦：邀请时已经查过双方
  if ((action === 'coCultivate' || action === 'duel') && input && typeof input === 'object' && 'action' in input &&
    (input.action === 'accept' || input.action === 'decline' || input.action === 'end')) return undefined
  return ACTION_FEATURES[action]
}

export interface GameActions {
  run<K extends keyof Actions>(
    action: K,
    input: Actions[K][0],
    onResult: (result: Actions[K][1]) => void,
    playLocally?: () => Actions[K][1] | void,
  ): void | Promise<void>
}

type Submit = <T>(
  method: Request[0],
  path: string,
  body: unknown,
  onResult: (result: T) => void,
) => void | Promise<void>

export function onlineGameActions(submit: Submit): GameActions {
  return {
    run(action, input, onResult) {
      const request = requests[action](input)
      if (request) return submit(request[0], request[1], request[2], onResult)
    },
  }
}
