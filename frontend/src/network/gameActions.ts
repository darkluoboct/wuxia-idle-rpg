import type {
  BattleReportDTO,
  BountyEntryDTO,
  CultivationResult,
  EquipSlotType,
  ForgeInput,
  ForgeResult,
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
  SectContestResult,
  SectResult,
  SkillUpgradeResult,
  StoryAdventureResult,
  StoryChallengeResult,
  StorySnakeChoice,
  StorySnakeChoiceResult,
  TrialChallengeResult,
  TrialPatrolStatusDTO,
  TrialReplayResult,
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
  | { action: 'accept' | 'decline'; invitationId: string }
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
  appraise: [{ masked: boolean }, GhostAppraisalResult]
  buy: [{ listingId: string }, { spentSilver: number }]
  sect: [SectAction, SectResult]
  move: [{ mapId: string; action?: 'depart' | 'arrive' }, MapMoveResult]
  huashan: [HuashanAction, HuashanResult]
  sectContest: [SectContestAction, SectContestResult]
  raid: [{ teamId: string; revision: number } | undefined, BattleReportDTO]
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
  appraise: (body) => ['POST', '/market/ghost/appraise', body],
  buy: (body) => ['POST', '/market/ghost/buy', body],
  sect: (body) => ['POST', '/sect', body],
  move: (body) => ['POST', '/map/move', body],
  huashan: (body) => ['POST', '/huashan', body],
  sectContest: (body) => ['POST', '/sect/contest', body],
  raid: (body) => body && ['POST', '/raid/start', body],
  coCultivate: (body) => ['POST', '/map/co-cultivate', body],
  duel: (body) => body && ['POST', '/duel', body],
  escort: (body) => ['POST', '/escort', body],
  acceptBounty: (body) => ['POST', '/bounties/accept', body],
  library: (body) => ['POST', '/sect/library', body],
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
