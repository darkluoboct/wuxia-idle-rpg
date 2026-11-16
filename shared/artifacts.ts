import type { LoadoutPresetDTO, PlayerDTO } from './protocol.ts'
import { simulateServerBattle } from './battle.ts'
import { battleEnvironmentAt, type BattleOpponent } from './combatMeta.ts'
import { forgeMaterials } from './equipmentForge.ts'
import { huashanDay } from './huashan.ts'

/**
 * 兵器谱 · 全服唯一真品（09 册 §四）：真·绿玉打狗棒同一时间只在一人手里。
 * 通过丐帮终考的第一人自得衣钵；此后每周日君山开擂，胜者即刻执棒接着守擂，周日结束时在手的人算守住一届。
 * 执棒者连续 72 小时没有任何操作，或叛出丐帮，打狗棒收回，由传功长老代守，任何一天都可上擂。
 */
const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const UTC8 = 8 * HOUR

export const DAGOU_STAFF = {
  code: 'TRUE_DAGOU',
  itemId: 'dagou_stick_true',
  /** 丐帮终考所传的绝学，学会即有上擂资格 */
  proofSkillId: 'tianxia_wugou',
  sectId: 'gaibang',
  dailyAttempts: 3,
  idleRecallMs: 72 * HOUR,
  /** 失棒补偿：每守住一届 15 块百炼玄铁，封顶 60 */
  ironPerDefense: 15,
  ironCap: 60,
} as const

/** 打狗棒无主时代守的传功长老：与终考的欧阳锋相当，只是这一回没有洪七公助拳 */
export const DAGOU_ELDER: BattleOpponent = {
  name: '传功长老', title: '代守打狗棒', portrait: 'hongqigong', hp: 40000, atk: 1250, mp: 6000, stance: 'TAICHI',
  combat: { alignment: 'NEUTRAL', def: 175, speed: 104, weapon: { form: 'STAFF', tier: 'purple' }, rageSkillId: 'dagou_bangfa' },
}

/** 擂台日以北京时间零点为界 */
export const arenaDay = huashanDay

/** 周日开擂 */
export function isArenaDay(day: number) {
  return ((day % 7) + 7) % 7 === 3
}

/** 当天若是周日就是当天，否则是下一个周日 */
export function nextArenaDay(day: number) {
  return day + ((3 - (day % 7)) % 7 + 7) % 7
}

export function arenaWindow(day: number) {
  const opensAt = day * DAY - UTC8
  return { opensAt, closesAt: opensAt + DAY }
}

/** 守住的届数：得棒之后完整经历过的周日擂台数；得棒当天的那一场不算 */
export function defendedArenas(heldSince: number, now: number) {
  const first = arenaWindow(nextArenaDay(arenaDay(heldSince - 1) + 1))
  return now < first.closesAt ? 0 : Math.floor((now - first.closesAt) / WEEK) + 1
}

export type ArtifactState = 'UNCLAIMED' | 'HELD' | 'VACANT'

/** 从未有人得棒为 UNCLAIMED；执棒者久未露面视同无主 */
export function artifactState(record: { holderId: string | null; seenAt: number } | undefined, now: number): ArtifactState {
  if (!record) return 'UNCLAIMED'
  return record.holderId && now - record.seenAt < DAGOU_STAFF.idleRecallMs ? 'HELD' : 'VACANT'
}

type Challenger = Pick<PlayerDTO, 'artifactDuel' | 'betrayedSectIds'>

export function artifactAttemptsLeft(player: Pick<PlayerDTO, 'artifactDuel'>, now: number) {
  return DAGOU_STAFF.dailyAttempts - (player.artifactDuel?.day === arenaDay(now) ? player.artifactDuel.used : 0)
}

/** 不能上擂的原因；能上擂时返回 undefined */
export function artifactChallengeBlock({ player, learnedSkills, state, isHolder, now }: {
  player: Challenger
  learnedSkills: Readonly<Record<string, number>>
  state: ArtifactState
  isHolder: boolean
  now: number
}) {
  if (state === 'UNCLAIMED') return '打狗棒还在洪七公手里：通过丐帮终考的第一人自得衣钵'
  if (isHolder && state === 'HELD') return '打狗棒就在你手里，周日等人来攻擂'
  if (!learnedSkills[DAGOU_STAFF.proofSkillId]) return '通过丐帮终考、学会《天下无狗》才能上君山擂台'
  if (player.betrayedSectIds?.includes(DAGOU_STAFF.sectId)) return '叛出丐帮的人不得再碰打狗棒'
  if (state === 'HELD' && !isArenaDay(arenaDay(now))) return '君山擂台每周日开擂'
  if (artifactAttemptsLeft(player, now) <= 0) return `今日 ${DAGOU_STAFF.dailyAttempts} 次上擂已用尽`
}

export function spendArtifactAttempt(player: Pick<PlayerDTO, 'artifactDuel'>, now: number) {
  const day = arenaDay(now)
  player.artifactDuel = { day, used: (player.artifactDuel?.day === day ? player.artifactDuel.used : 0) + 1 }
  return artifactAttemptsLeft(player, now)
}

/** 得棒：记一枚「曾执绿玉杖」印记 */
export function honorArtifactHolder(player: Pick<PlayerDTO, 'artifactHonors'>) {
  if (!player.artifactHonors?.includes(DAGOU_STAFF.itemId)) player.artifactHonors = [...(player.artifactHonors ?? []), DAGOU_STAFF.itemId]
}

/** 失棒：从所有配装里摘下；守过擂的按届数补偿百炼玄铁。叛出丐帮被收回的不补偿。返回补偿的玄铁数 */
export function surrenderArtifact(player: PlayerDTO, presets: Iterable<LoadoutPresetDTO>, heldSince: number, now: number, compensate = true) {
  for (const preset of presets) if (preset.weaponId === DAGOU_STAFF.itemId) preset.weaponId = null
  const iron = compensate ? Math.min(DAGOU_STAFF.ironCap, DAGOU_STAFF.ironPerDefense * defendedArenas(heldSince, now)) : 0
  if (iron) forgeMaterials(player, iron, 0)
  return iron
}

type ElderDuelInputs = Pick<Parameters<typeof simulateServerBattle>[0], 'player' | 'loadout' | 'learnedSkills' | 'bonus' | 'ownedItemIds' | 'companionOf' | 'rng'>

export const ARENA_SCENE = '君山擂台 · 打狗棒之争'

/** 无主时上擂：与代守的传功长老过招。擂台上不许服药，与侠客之间的擂台战一致 */
export function simulateElderDuel(inputs: ElderDuelInputs, now: number) {
  return simulateServerBattle({
    ...inputs, player: { ...inputs.player, battleMedicines: undefined }, sceneTitle: ARENA_SCENE, mode: 'SECT_TRIAL', enemyMain: DAGOU_ELDER,
    environment: battleEnvironmentAt('sect_contest', new Date(now)),
  })
}
