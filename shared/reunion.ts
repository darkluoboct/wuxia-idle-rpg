import { TANCHUDUAN_COMBAT, type BattleEnemyGuard, type BattleOpponent } from './combatMeta.ts'
import type { ReunionClueSource, ReunionStateDTO } from './protocol.ts'
import { STORY_CHAPTERS } from './storyData.ts'

export const REUNION_CLUE_TARGET = 300
/** 线索来源：每次所得 / 每日上限（三项合计每日 10 点 → 约 30 天） */
export const REUNION_CLUE_SOURCES = {
  closed: { label: '闭关打听', gain: 5, dailyCap: 5, hint: '收取离线收益时离线 ≥ 1 小时' },
  replay: { label: '旧地重游', gain: 3, dailyCap: 3, hint: '再次历练与其相关的主线节点并获胜' },
  inn: { label: '客栈打听', gain: 2, dailyCap: 2, hint: '花 300 纹银向掌柜打听' },
} as const
export type ClueSource = ReunionClueSource
export const REUNION_INQUIRE_COST = 300
/** 故地相候：线索集齐后，须在指定地图累计停留的时长（可离线） */
export const REUNION_WAIT_HOURS = 2

export interface ReunionQuestConfig {
  companionId: string
  /** 错过的判定：该支线已了结、伙伴却未入队 */
  afterAdventure: string
  replayNodeIds: number[]
  mapId: string
  waitText: string
  giftText: string
  enemy: Omit<BattleOpponent, 'hp' | 'atk' | 'mp'>
  guard: Omit<BattleEnemyGuard, 'hp' | 'atk'>
  battleHint: string
  battleIntro: string
  outro: string
}

export const REUNION_QUESTS: Record<string, ReunionQuestConfig> = {
  meichaofeng: {
    companionId: 'meichaofeng',
    afterAdventure: 'huangshan_bishou',
    replayNodeIds: [3],
    mapId: 'jiaxing_suburb',
    waitText: '传闻那位盲眼的黑衣女子每逢月圆便回荒山崖下。你在嘉兴城外守候，等她现身。',
    giftText: '你托人将一壶桃花岛的旧酒放在崖下石上——那是她当年在师门喝惯的味道。',
    enemy: {
      name: '全真弟子·尹志平', title: '奉命追剿铁尸', portrait: 'daoist', stance: 'TAICHI',
      combat: { ...TANCHUDUAN_COMBAT, karma: 30, speed: 108, weapon: { form: 'BLADE', tier: 'blue' }, rageSkillId: 'quanzhen_jianfa' },
    },
    guard: {
      name: '全真执剑弟子', title: '随行追兵', portrait: 'daoist', stance: 'TAICHI',
      combat: { alignment: 'RIGHTEOUS', karma: 20, joinsRound: true, speed: 96, weapon: { form: 'BLADE', tier: 'green' } },
    },
    battleHint: '尹志平攒怒后耗费内力施展全真剑法，回合末以全真吐纳功回内。两名全真弟子各自出手。',
    battleIntro: '酒壶刚放下，林中闪出一队全真弟子：“铁尸梅超风作恶多端，今日不留活口！”',
    outro: '你挡在崖前击退追兵。梅超风沉默良久，终于开口：“你当年夺了我的经，如今又救我一命……罢了，这条命，跟你走一程。”',
  },
  yangtiexin: {
    companionId: 'yangtiexin',
    afterAdventure: 'tieqiangmiao',
    replayNodeIds: [4, 5],
    mapId: 'zhongnan_forest',
    waitText: '有樵夫说，终南山深处住着一对从中都逃来的夫妇。你在后山密林里静候消息。',
    giftText: '你备下一壶临安桂花酿，托樵夫送进山中——那是杨铁心故乡的酒。',
    enemy: {
      name: '金兵统领·段天德', title: '追捕杨家余孽', portrait: 'bandit', stance: 'FIERCE',
      combat: {
        faction: 'JIN', alignment: 'HERETIC', karma: -50, mounted: true, def: 140, weapon: { form: 'BLADE', tier: 'blue' },
        charge: { round: 2, name: '金兵合围', damageMultiplier: 1.5, taichiGuard: true },
      },
    },
    guard: {
      name: '金兵搜山斥候', title: '段天德部下', portrait: 'zhebie', stance: 'AGILE',
      combat: { faction: 'JIN', alignment: 'HERETIC', joinsRound: true, staysBehindLeader: true, speed: 95, weapon: { form: 'BOW', tier: 'green' } },
    },
    battleHint: '段天德第 2 回合蓄力，太极可化解金兵合围。搜山斥候会从后方独立射击。',
    battleIntro: '山道上马蹄声急，段天德领着金兵搜山而来：“杨铁心！看你还往哪里逃！”',
    outro: '金兵溃散。杨铁心拄枪而立，向你深深一揖：“当日铁枪庙一别，杨某没齿难忘。从今往后，杨家枪随你差遣。”',
  },
}

export const newReunion = (): ReunionStateDTO => ({
  clues: 0, day: -1, got: { closed: 0, replay: 0, inn: 0 }, step: 'CLUES', waitSince: null, waitMs: 0,
})

export function reunionCluesToday(state: Pick<ReunionStateDTO, 'got'> & { day: string | number }, day: string | number) {
  return state.day === day ? state.got : { closed: 0, replay: 0, inn: 0 }
}

export function gainReunionClues(state: Pick<ReunionStateDTO, 'clues' | 'got' | 'step' | 'waitSince'>, source: ClueSource, now: number) {
  if (state.step !== 'CLUES') return 0
  const { gain, dailyCap } = REUNION_CLUE_SOURCES[source]
  const added = Math.min(gain, dailyCap - state.got[source], REUNION_CLUE_TARGET - state.clues)
  if (added <= 0) return 0
  state.got[source] += added
  state.clues += added
  if (state.clues === REUNION_CLUE_TARGET) {
    state.step = 'WAIT'
    state.waitSince = now
  }
  return added
}

export function reunionWaitTime(state: Pick<ReunionStateDTO, 'waitMs' | 'waitSince' | 'step'>, quest: ReunionQuestConfig, mapId: string, now: number, arrivedAt?: number) {
  const here = state.step === 'WAIT' && mapId === quest.mapId ? Math.max(0, now - Math.max(arrivedAt ?? 0, state.waitSince ?? now)) : 0
  return state.waitMs + here
}

export function reunionEncounter(quest: ReunionQuestConfig, level: number) {
  const ref = [...STORY_CHAPTERS].reverse().find((node) => node.recLevel <= level) ?? STORY_CHAPTERS[0]
  const hp = Math.round(ref.bossHp * 0.9)
  const atk = Math.round(ref.bossAtk * 0.9)
  return {
    enemyMain: { ...quest.enemy, hp, atk, mp: Math.round(ref.bossHp * 0.4) },
    enemyGuards: [{ ...quest.guard, hp: Math.round(hp * 0.3), atk: Math.round(atk * 0.35) }],
    rewards: { qiExp: Math.round(ref.rewardQi * 0.5), silver: 0 },
  }
}
