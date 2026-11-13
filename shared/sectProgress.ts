import { simulateServerBattle } from './battle.ts'
import { battleEnvironmentAt, STANCE_META } from './combatMeta.ts'
import { companionView, COMPANIONS, ITEMS, type SectConfig, type SectPromotionExam } from './gameData.ts'
import type { LoadoutPresetDTO, PlayerDTO } from './protocol.ts'

export const SECT_SALUTE_QI = 1800
export const BETRAYAL_BOUNTY = { silver: 100_000, sectContrib: 2000, karma: 60, hours: 48 } as const

export const SECT_CHIEF_SALUTE_QI = 300
export const SECT_CONTEST_MIN_RANK = 3
const SECT_CONTEST_WEEK_MS = 7 * 86_400_000
const FIRST_SECT_CONTEST = Date.UTC(2024, 0, 6, 12) // 北京时间周六 20:00

export function sectContestWeek(now: number) {
  return Math.floor((now - FIRST_SECT_CONTEST) / SECT_CONTEST_WEEK_MS)
}

export function sectContestEndsAt(weekId: number) {
  return FIRST_SECT_CONTEST + (weekId + 1) * SECT_CONTEST_WEEK_MS
}
export function sectPromotion(sect: SectConfig, player: Pick<PlayerDTO, 'sectRank' | 'gaibangBranch'>, flags: readonly string[]) {
  const rank = player.sectRank
  const maxRank = sect.ranks.length
  const choosing = sect.id === 'gaibang' && rank >= 2 && !player.gaibangBranch
  const completionFlag = sect.promotionExams?.[maxRank]?.completionFlag
  const finale = !choosing && !!completionFlag && rank >= maxRank - 1 && (rank < maxRank || !flags.includes(completionFlag))
  const available = choosing || finale || rank < maxRank
  const newRank = choosing ? Math.max(rank, 3) : Math.min(rank + 1, maxRank)
  const exam = available ? sect.promotionExams?.[choosing ? 3 : newRank] : undefined
  return { choosing, finale, available, newRank, exam }
}

export function sectExamBlockReason(exam: SectPromotionExam | undefined, con: number, loadout: LoadoutPresetDTO,
  recruited: (id: string) => boolean, dishesReady: boolean) {
  if (!dishesReady) return '备齐三道佳肴，再随洪七公赴压鬼岛。'
  if (exam?.objective?.kind === 'ENDURE_MERIDIANS' && con < exam.objective.minCon) {
    return `基础根骨达到 ${exam.objective.minCon} 点后可挑战逆转经脉。`
  }
  const { stance, leftCompanionId, rightCompanionId } = loadout
  if (exam?.requiredStance && stance !== exam.requiredStance) return `请在武库切换为${STANCE_META[exam.requiredStance].name}架势。`
  if (exam?.requiresTwoCompanions && (!leftCompanionId || !rightCompanionId || leftCompanionId === rightCompanionId ||
    !recruited(leftCompanionId) || !recruited(rightCompanionId))) return '请在武库为左右翼各编入一位已入队伙伴。'
  return ''
}

export function sectContributionGain(amount: number, loadout: LoadoutPresetDTO) {
  const accessory = ITEMS[loadout.accId ?? '']
  const bonus = accessory?.slot === 'ACC' ? accessory.sectContributionBonus ?? 0 : 0
  return Math.round(amount * (100 + bonus) / 100)
}

export function sectPromotionRewards(rank: number, loadout: LoadoutPresetDTO) {
  return { qiExp: 4500 * rank, silver: 1500, sectContrib: sectContributionGain(200, loadout) }
}

type SectBattleInputs = Pick<Parameters<typeof simulateServerBattle>[0],
  'player' | 'loadout' | 'learnedSkills' | 'bonus' | 'ownedItemIds' | 'companionOf' | 'rng'>

export function simulateSectTrial(sect: SectConfig, { newRank, exam }: ReturnType<typeof sectPromotion>, inputs: SectBattleInputs, now: number) {
  const rank = inputs.player.sectRank
  let loadout = inputs.loadout
  const guest = exam?.guestCompanionId
  const formation = exam?.formation
  if (formation) {
    loadout = { ...loadout, leftCompanionId: formation.leftCompanionId, rightCompanionId: formation.rightCompanionId }
  } else if (guest && loadout.leftCompanionId !== guest && loadout.rightCompanionId !== guest) {
    loadout = { ...loadout, leftCompanionId: guest }
  }
  const report = simulateServerBattle({
    ...inputs,
    loadout,
    sceneTitle: `${sect.name} · ${exam?.title ?? '晋升考核'}`,
    mode: 'SECT_TRIAL',
    objective: exam?.objective,
    escortAllies: formation?.reserves,
    nextOpponents: exam?.nextOpponents,
    environment: exam?.mapId ? battleEnvironmentAt(exam.mapId, new Date(now)) : undefined,
    companionOf: (id) => {
      const view = inputs.companionOf?.(id)
      if (view) return view
      const isGuest = id === guest || id === formation?.leftCompanionId || id === formation?.rightCompanionId
      return isGuest && COMPANIONS[id] ? companionView(COMPANIONS[id]) : undefined
    },
    enemyMain: exam?.opponent ?? {
      name: `${sect.name}传功长老`, title: `第 ${newRank} 阶考核`, portrait: 'huangyaoshi',
      hp: 5500 * rank, atk: 420 * rank, mp: 3000 * rank, stance: 'TAICHI', combat: { alignment: sect.alignment },
    },
    rewards: newRank > rank ? sectPromotionRewards(rank, loadout) : undefined,
  })
  if (exam?.intro) report.events.unshift({ round: 1, type: 'EFFECT', actorSlot: 'ALLY_MAIN', segments: [{ type: 'text', text: exam.intro }] })
  return report
}
