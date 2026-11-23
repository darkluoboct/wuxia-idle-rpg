/**
 * 第一章通关模拟（docs/27）：新角色按《江湖行历》与剧情时间线一路打到第一章结尾，
 * 每 5 分钟收一次功，能升级就升级、能冲穴就冲穴，巡历够了就挑战。
 * 用来核第一章的数值与战斗节奏：每场首战打几回合、剩多少血、什么时候打到。
 */
import { vi } from 'vitest'
import { ACUPOINTS, ITEMS, REALMS, SECTS, SKILLS } from '@/config/gameData'
import type { BattleReportDTO, LoadoutPresetDTO, OriginId } from '@/network/protocol'
import { calcNextLevelQi } from '@/network/mockEngine'
import { computeCompanionDerivedStats, computeDerivedStats } from '../../shared/battle.ts'
import { EQUIP_SLOT_META, PERSONAL_EQUIP_SLOTS } from '../../shared/combatMeta.ts'
import { meetsItemStatRequirement } from '../../shared/gameData.ts'
import { getSkillMasteryCap, skillPowerAtMastery } from '../../shared/skillMastery.ts'
import { HAND_THREE_YANG } from '../../shared/ftueQuests.ts'
import { STORY_TIMELINE, storyGateBlock, type StageKey } from '../../shared/stageScripts.ts'
import { TRIAL_PATROL_HOURS, TRIAL_STAGES } from '../../shared/trialStages.ts'
import { STORY_CHAPTERS } from '@/config/gameData'
import { newStore, type Store } from './helpers'

export interface FightRecord {
  key: StageKey
  minute: number
  level: number
  attempt: number
  won: boolean
  rounds: number
  /** 主角余血比例 */
  hpLeft: number
  /** 我方全队余血比例 */
  teamLeft: number
  /** 首领余血比例（输了时看差多少） */
  bossLeft: number
  lines: number
  /** 战报条数，乘以 920ms 就是回放时长 */
  steps: number
  /** 兵刃与两位伙伴 */
  team: string
  /** 开打时全队战力 */
  power: number
  /** 战报里出现过的机制提示（EFFECT 事件的标签） */
  marks: string[]
  /** 完整战报；全卷模拟为省内存不留 */
  report?: BattleReportDTO
}

export interface Playthrough {
  store: Store
  fights: FightRecord[]
  /** 各回首胜时的游戏分钟 */
  cleared: Partial<Record<StageKey, number>>
  minutes: number
  events: string[]
}

const STEP_MIN = 5

function hpLeft(report: BattleReportDTO, slot: string) {
  const unit = report.units.find((u) => u.slot === slot)
  if (!unit) return 0
  const lost = report.events.reduce((sum, e) => sum + (e.targetSlot === slot && e.hpDelta ? -e.hpDelta : 0), 0)
  return Math.max(0, Math.min(1, (unit.hp - lost) / unit.maxHp))
}

function teamLeft(report: BattleReportDTO) {
  const allies = report.units.filter((u) => u.slot.startsWith('ALLY'))
  const max = allies.reduce((sum, u) => sum + u.maxHp, 0)
  return allies.reduce((sum, u) => sum + hpLeft(report, u.slot) * u.maxHp, 0) / max
}

/** 打到 until 这一回首胜为止，或超过 maxMinutes */
export function playChapterOne({ origin = 'yujia', until = 'T07', maxMinutes = 24 * 60, weapon, levelCap, toSect, kit = 'lazy', keepReports = true }: {
  origin?: OriginId
  until?: StageKey
  maxMinutes?: number
  /** 1-3 之后改用这件兵刃（不按剧情用匕首的玩家） */
  weapon?: string
  /** 等级不超过下一关历练的推荐等级（不爱练级的玩家） */
  levelCap?: boolean
  /** 一直打到拜入师门（《江湖行历》卷一圆满） */
  toSect?: boolean
  /**
   * 玩家怎么打理行头（全卷模拟用）：
   *   · lazy     只穿自动装上的东西，伙伴靠入队时自动编进空位
   *   · typical  新掉的装备按战力换上（一般玩家，全卷数值按这一档定）
   *   · diligent 另外挑最强的两位伙伴、换威力最高的外功与绝技，等级卡在境界上限时拿多余真气参悟
   */
  kit?: 'lazy' | 'typical' | 'diligent'
  /** 是否留下每一战的完整战报（全卷模拟要跑几百战，不留） */
  keepReports?: boolean
} = {}): Playthrough {
  let clock = Date.parse('2026-11-13T08:00:00+08:00')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  // 固定随机种子，战斗与掉落可复现
  let seed = 20261122
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  })
  const s = newStore('NEW', { gated: true, origin })
  const fights: FightRecord[] = []
  const cleared: Playthrough['cleared'] = {}
  const events: string[] = []
  const attempts: Partial<Record<StageKey, number>> = {}
  let minute = 0

  const isCleared = (key: StageKey) => {
    const code = key.slice(1)
    if (key.startsWith('N')) return s.claimedNodeIds.includes(STORY_CHAPTERS.find((n) => n.code === code)!.id)
    return s.trial.rewardedStageIds.includes(TRIAL_STAGES.find((t) => t.code === code)!.id)
  }

  /** 关卡提示要求的打法：欧阳锋每三回合的九阴逆行要摆太极势才挡得住（5-3、历练 30） */
  function stanceFor(key: StageKey) {
    const code = key.slice(1)
    const combat = key.startsWith('N') ? STORY_CHAPTERS.find((n) => n.code === code)?.bossCombat : TRIAL_STAGES.find((t) => t.code === code)?.boss.combat
    return combat?.reverseMeridians ? 'TAICHI' as const : undefined
  }

  function fight(key: StageKey, start: () => void) {
    const stance = stanceFor(key)
    const usual = s.currentLoadout.stance
    if (stance && stance !== usual) s.currentLoadout.stance = stance
    start()
    const scroll = s.stageScroll
    if (scroll?.phase === 'BEFORE') scroll.start()
    if (stance) s.currentLoadout.stance = usual
    const report = s.activeBattle
    if (!report) return
    s.skipBattleToEnd()
    s.skipBattleToEnd()
    attempts[key] = (attempts[key] ?? 0) + 1
    const won = report.winner === 'ALLY'
    fights.push({
      key, minute, level: s.player.level, attempt: attempts[key]!, won,
      rounds: report.events.reduce((max, e) => Math.max(max, e.round), 1),
      hpLeft: hpLeft(report, 'ALLY_MAIN'), bossLeft: hpLeft(report, 'ENEMY_MAIN'),
      teamLeft: teamLeft(report),
      lines: report.events.filter((e) => e.effectSourceId === 'stage_script').length,
      steps: report.events.length,
      team: [s.currentLoadout.weaponId, s.currentLoadout.leftCompanionId, s.currentLoadout.rightCompanionId].join('/'),
      power: powerOf({}),
      ...(keepReports ? { report } : {}),
      marks: [...new Set(report.events.flatMap((e) => e.effectSourceId === 'stage_script' ? [] : e.segments.flatMap((seg) => seg.type === 'tag' ? [seg.text.slice(0, 14)] : [])))],
    })
    if (won && cleared[key] === undefined) cleared[key] = minute
    s.closeStageScroll()
    s.closeBattleStage()
  }

  function tidy() {
    for (let guard = 0; s.featureCard && guard < 10; guard++) s.closeFeatureCard(false)
    for (let guard = 0; s.pendingAdventure && guard < 10; guard++) {
      const option = s.pendingAdventure.options.find((o) => o.canSelect)
      if (!option) break
      s.resolveAdventure(option.key)
      if (s.isBattlePlaying) {
        s.skipBattleToEnd()
        s.closeBattleStage()
      }
    }
  }

  function grow() {
    const cap = levelCap ? Math.max(1, s.trial.maxStageId) : Infinity
    for (let guard = 0; guard < 50; guard++) {
      const realm = REALMS.find(({ tier }) => tier === s.player.realmTier)!
      if (s.player.level < Math.min(realm.maxLevel, cap) && s.player.qiExp >= calcNextLevelQi(s.player.level)) {
        s.upgradeLevel()
        continue
      }
      // 等级到顶再冲穴，冲完突破
      const point = ACUPOINTS.find((p) => p.realmTier === s.player.realmTier && !s.openedAcupointIds.includes(p.id))
      if (s.player.level >= realm.maxLevel && point && s.player.qiExp >= point.costQi * 2) {
        s.pierceAcupoint(point.id)
        if (s.openedAcupointIds.includes(point.id)) continue
      }
      if (s.player.level >= realm.maxLevel && !point) {
        const before = s.player.realmTier
        s.attemptBreakthrough(false)
        if (s.player.realmTier > before) {
          events.push(`${minute}分 突破到${REALMS.find(({ tier }) => tier === s.player.realmTier)!.name}`)
          continue
        }
      }
      break
    }
  }

  function questWork() {
    for (let guard = 0; s.ftueReady && guard < 5; guard++) {
      events.push(`${minute}分 行历：${s.ftueQuest!.title}（Lv.${s.player.level}）`)
      s.claimFtueReward()
    }
    const quest = s.ftueQuest
    if (!quest) return
    if (quest.targetType === 'PIERCE' && !s.openedAcupointIds.includes(String(quest.targetValue))) {
      const point = ACUPOINTS.find((p) => p.id === quest.targetValue)!
      if (s.player.qiExp >= point.costQi * 2) s.pierceAcupoint(point.id)
    }
    if (quest.targetType === 'PIERCE_ALL') {
      for (const id of HAND_THREE_YANG) if (!s.openedAcupointIds.includes(id)) s.pierceAcupoint(id)
    }
    if (quest.targetType === 'COMPANION') s.giftCompanionInInn(String(quest.targetValue), false)
    if (quest.targetType === 'FORAGE') s.forageHerbs()
    if (quest.targetType === 'REFINE') {
      s.refinePill(String(quest.targetValue))
      const toast = s.toasts.at(-1)?.text
      if (toast && !events.includes(`refine:${toast}`)) events.push(`refine:${toast}`)
      if (!s.ftueReady) s.forageHerbs()
    }
    if (quest.targetType === 'SECT' && !s.player.currentSectId) {
      const open = SECTS.filter((sect) => s.sectEligibility(sect).ok)
      events.push(`${minute}分 可拜：${open.map((sect) => sect.name).join('、')}`)
      const pick = open.find((sect) => sect.id === 'quanzhen') ?? open[0]
      if (pick) {
        s.joinSect(pick.id)
        events.push(`${minute}分 拜入${pick.name}（Lv.${s.player.level}）`)
      }
    }
  }

  function storyWork() {
    // 时间线上下一回：主线没被挡就打；历练就去巡历，巡够了打
    const next = STORY_TIMELINE.find((key) => !isCleared(key))
    if (!next) return
    // 输了等等级涨一级再来
    const lost = fights.filter((f) => f.key === next && !f.won).at(-1)
    if (lost && lost.level === s.player.level && minute - lost.minute < 60) return
    if (next.startsWith('N')) {
      const node = STORY_CHAPTERS.find((n) => `N${n.code}` === next)!
      if (node.id <= s.player.maxChapterId && !storyGateBlock(node, s.player)) fight(next, () => s.enterStoryNode(node.id))
      return
    }
    const stage = TRIAL_STAGES.find((t) => `T${t.code}` === next)!
    if (stage.id > s.trial.maxStageId) return
    if (s.trial.selectedStageId !== stage.id) s.setPatrolStage(stage.id)
    const hours = s.trial.stageHours[String(stage.id)] ?? 0
    if (hours >= (TRIAL_PATROL_HOURS[stage.id] ?? 0)) fight(next, () => s.enterTrialStage(stage.id))
  }

  /** 全队战力：主角加两位伙伴 */
  const powerOf = (patch: Partial<LoadoutPresetDTO>) => {
    const loadout = { ...s.currentLoadout, ...patch }
    const wing = [loadout.leftCompanionId, loadout.rightCompanionId].filter((id, i, all): id is string => !!id && all.indexOf(id) === i)
    return computeDerivedStats(s.player, loadout, s.collectionBonus, s.companionOf).combatPower +
      wing.reduce((sum, id) => sum + (computeCompanionDerivedStats(s.player, loadout, id, s.companionOf)?.combatPower ?? 0), 0)
  }
  let kitSeen = ''
  function outfit() {
    const recruited = Object.entries(s.companionAffinity).filter(([, c]) => c.recruited).map(([id]) => id).sort()
    const seen = [s.ownedItemIds.length, recruited.join(), Object.keys(s.learnedSkills).length, s.player.level].join('|')
    if (seen === kitSeen) return
    kitSeen = seen
    const patch: Partial<LoadoutPresetDTO> = {}
    let best = powerOf(patch)
    const consider = (trial: Partial<LoadoutPresetDTO>) => {
      const power = powerOf({ ...patch, ...trial })
      if (power > best) {
        best = power
        Object.assign(patch, trial)
      }
    }
    if (kit === 'diligent') for (const left of recruited) for (const right of recruited) if (left < right) consider({ leftCompanionId: left, rightCompanionId: right })
    for (let pass = 0; pass < 2; pass++) {
      for (const slot of PERSONAL_EQUIP_SLOTS) {
        const field = EQUIP_SLOT_META[slot].field
        for (const id of s.ownedItemIds) {
          const item = ITEMS[id]
          if (item?.slot === slot && meetsItemStatRequirement(item, s.player.stats)) consider({ [field]: id })
        }
      }
    }
    if (kit === 'diligent') for (const [slot, field] of [['OUTER', 'outerSkillId'], ['ULT', 'ultSkillId']] as const) {
      const learned = Object.keys(s.learnedSkills).filter((id) => SKILLS[id]?.slot === slot)
      const strongest = learned.sort((a, b) => skillPowerAtMastery(SKILLS[b], s.learnedSkills[b], s.player) - skillPowerAtMastery(SKILLS[a], s.learnedSkills[a], s.player))[0]
      if (strongest && strongest !== s.currentLoadout[field]) patch[field] = strongest
    }
    if (kit === 'diligent') for (const [slot, field] of [['INNER', 'innerSkillId'], ['LIGHT', 'lightSkillId']] as const) {
      for (const id of Object.keys(s.learnedSkills)) if (SKILLS[id]?.slot === slot) consider({ [field]: id })
    }
    if (Object.keys(patch).length) s.updateLoadout(patch)
  }

  /** 等级卡在境界上限时，把冲穴要留的真气之外的部分拿去参悟已装备的武功 */
  function study() {
    const realm = REALMS.find(({ tier }) => tier === s.player.realmTier)!
    if (s.player.level < realm.maxLevel) return
    const point = ACUPOINTS.find((p) => p.realmTier === s.player.realmTier && !s.openedAcupointIds.includes(p.id))
    const reserve = point ? point.costQi * 2 : 0
    const { innerSkillId, outerSkillId, lightSkillId, ultSkillId } = s.currentLoadout
    for (let guard = 0; guard < 40; guard++) {
      const options = [outerSkillId, ultSkillId, innerSkillId, lightSkillId].flatMap((id) => {
        const skill = id ? SKILLS[id] : undefined
        const mastery = id ? s.learnedSkills[id] ?? 0 : 0
        return skill && mastery > 0 && mastery < getSkillMasteryCap(skill.tier, s.player.level) ? [{ id: id!, cost: s.getSkillUpgradeCost(id!) }] : []
      }).sort((a, b) => a.cost - b.cost)
      const next = options[0]
      if (!next || s.player.qiExp - next.cost < reserve) return
      s.upgradeSkillMastery(next.id, true)
    }
  }

  // 序章：主线 1-1
  fight('N1-1', () => s.enterStoryNode(1))
  tidy()
  s.setIdle(true)
  while (minute < maxMinutes && (toSect ? !s.player.currentSectId : cleared[until] === undefined)) {
    // 巡历一关要几十个时辰以后，改成每小时上线一次
    const step = (TRIAL_PATROL_HOURS[s.trial.maxStageId] ?? 0) >= 1 ? 60 : STEP_MIN
    minute += step
    clock += step * 60_000
    s.settleOfflineQi()
    s.mockSettlePatrol(clock)
    tidy()
    grow()
    if (kit === 'diligent') study()
    if (kit !== 'lazy') outfit()
    questWork()
    storyWork()
    tidy()
    if (weapon && cleared['N1-3'] !== undefined && s.ownedItemIds.includes(weapon)) {
      for (const preset of Object.values(s.presets)) preset.weaponId = weapon
    }
  }
  return { store: s, fights, cleared, minutes: minute, events }
}
