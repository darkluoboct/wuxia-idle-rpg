import { COMPANIONS, COMPANION_SETS, ITEMS, MAPS, SECTS, SKILLS, TRIO_SYNERGIES } from '../../../shared/gameData.ts'
import type { TierColor } from '../../../shared/protocol.ts'
import { ADVENTURES, STORY_CHAPTERS } from './storyData'
import type { AdventureCtx, Reward } from './storyData'

export * from '../../../shared/gameData.ts'

// 第一卷主线 / 支线数据见 storyData.ts，这里统一再导出，保持对外 import 路径稳定
export { STORY_ARCS, STORY_CHAPTERS, ADVENTURES, adventureById, STAT_LABEL } from './storyData'
export type { StoryNodeConfig as StoryChapterConfig, Reward, AdventureBattle, AdventureConfig, AdventureChoice, AdventureCtx, StatKey } from './storyData'

/**
 * 数据引用自检：任何 skill / item / companion / map / 节点 id 写错，都会在这里报出来。
 * 开发期由 gameStore 初始化时调用并 console.warn；冒烟测试里断言为空。
 */
const TIER_RANK: Record<TierColor, number> = { green: 1, blue: 2, purple: 3, orange: 4, red: 5 }

export function validateGameData(): string[] {
  const errs: string[] = []
  const chk = (ok: boolean, msg: string) => {
    if (!ok) errs.push(msg)
  }
  const nodeIds = STORY_CHAPTERS.map((c) => c.id)
  chk(nodeIds.every((id, i) => id === i + 1), '主线节点 id 必须从 1 起连续递增')

  const checkReward = (r: Reward, where: string) => {
    r.skills?.forEach((id) => chk(!!SKILLS[id], `${where}: 未知武学 ${id}`))
    Object.keys(r.skillBoost ?? {}).forEach((id) => chk(!!SKILLS[id], `${where}: 未知武学(skillBoost) ${id}`))
    r.items?.forEach((id) => chk(!!ITEMS[id], `${where}: 未知装备 ${id}`))
    Object.keys(r.affinity ?? {}).forEach((id) => chk(!!COMPANIONS[id], `${where}: 未知伙伴 ${id}`))
  }

  for (const n of STORY_CHAPTERS) {
    const w = `主线 ${n.code}`
    n.dropItemIds?.forEach((id) => chk(!!ITEMS[id], `${w}: 未知掉落装备 ${id}`))
    n.dropSkillIds?.forEach((id) => chk(!!SKILLS[id], `${w}: 未知掉落武学 ${id}`))
    const inner = n.bossCombat?.innerEndurance
    if (inner) chk(SKILLS[inner.skillId]?.slot === 'INNER', `${w}: 未知首领心法 ${inner.skillId}`)
    checkReward(n.firstClear, `${w} 首通`)
  }

  const ctxs: AdventureCtx[] = [
    { stats: { str: 10, con: 10, agi: 10, intStat: 10, luck: 10, karma: 0 }, isWanderer: false, flags: [], items: [], silver: 0 },
    { stats: { str: 99, con: 99, agi: 99, intStat: 99, luck: 99, karma: 0 }, isWanderer: true, flags: [], items: ['iron_bagua'], silver: 99999 },
    { stats: { str: 30, con: 30, agi: 30, intStat: 30, luck: 30, karma: 0 }, isWanderer: false, flags: [], items: [], silver: 99999 },
  ]
  for (const a of ADVENTURES) {
    const w = `奇遇「${a.title}」`
    chk(a.afterNodeId === 0 || nodeIds.includes(a.afterNodeId), `${w}: afterNodeId=${a.afterNodeId} 不存在`)
    chk(a.choices.some((c) => !c.require && !c.costSilver), `${w}: 至少要有一个无门槛选项，否则可能卡死`)
    for (const c of a.choices) {
      const battle = c.battle
      if (battle) {
        if ('nodeId' in battle) {
          chk(nodeIds.includes(battle.nodeId), `${w}: 战斗引用的主线节点 ${battle.nodeId} 不存在`)
        } else {
          chk((battle.enemyGuards?.length ?? 0) <= 3, `${w}: 最多配置三名敌方随从`)
          for (const ally of battle.escortAllies ?? []) {
            chk(ally.hp > 0 && ally.hp <= ally.maxHp, `${w}: ${ally.name}的开场气血超出范围`)
          }
        }
        const rounds = battle.surviveRounds
        if (rounds !== undefined) chk(Number.isInteger(rounds) && rounds > 0, `${w}: 守战回合数须为正整数`)
      }
      for (const ctx of ctxs) checkReward(typeof c.reward === 'function' ? c.reward(ctx) : c.reward, `${w} 选项${c.key}`)
    }
  }

  for (const c of Object.values(COMPANIONS)) chk(!!SKILLS[c.teachSkillId], `伙伴 ${c.name}: 未知传功武学 ${c.teachSkillId}`)
  for (const s of SECTS) {
    chk(s.ranks.length === 5, `门派 ${s.name}: 必须五阶`)
    chk(s.signatureSkills.length === 5, `门派 ${s.name}: signatureSkills 必须与五阶等长`)
    s.signatureSkills.flat().forEach((id) => chk(!!SKILLS[id], `门派 ${s.name}: 未知武学 ${id}`))
    Object.values(s.signatureItems ?? {}).forEach((id) => chk(!!ITEMS[id], `门派 ${s.name}: 未知装备 ${id}`))
    for (const [rank, exam] of Object.entries(s.promotionExams ?? {})) {
      if (!exam) continue
      const next = Number(rank)
      const where = `门派 ${s.name}·${exam.title}`
      chk(Number.isInteger(next) && next >= 2 && next <= s.ranks.length, `${where}: 晋升阶位超出范围`)
      if (exam.guestCompanionId) chk(!!COMPANIONS[exam.guestCompanionId], `${where}: 未知协战伙伴 ${exam.guestCompanionId}`)
      if (exam.objective) {
        chk(Number.isInteger(exam.objective.rounds) && exam.objective.rounds > 0, `${where}: 考核回合数须为正整数`)
        if (exam.objective.kind === 'DISARM') chk(!!exam.opponent.combat?.weapon, `${where}: 卸械对手须携带兵刃`)
        if (exam.objective.kind === 'HOLD_FORMATION') {
          const formation = exam.formation
          const ids = formation && [formation.leftCompanionId, formation.rightCompanionId, ...formation.reserves.map(({ id }) => id)]
          chk(!!ids && ids.length === 6 && new Set(ids).size === 6 && ids.every((id) => !!COMPANIONS[id]), `${where}: 须配置六位不同的阵员`)
        }
      }
      for (const opponent of [exam.opponent, ...(exam.nextOpponents ?? [])]) {
        const guards = opponent.guards ?? []
        chk(guards.length <= 3, `${where}: 每阵最多三名随从`)
        for (const enemy of [opponent, ...guards]) {
          const rageSkillId = enemy.combat?.rageSkillId
          if (rageSkillId) chk(!!SKILLS[rageSkillId], `${where}: 未知对手武学 ${rageSkillId}`)
        }
      }
    }
  }
  for (const m of MAPS) chk(m.reqCleared === undefined || nodeIds.includes(m.reqCleared), `地图 ${m.name}: reqCleared 不存在`)
  // 剧情送的伙伴基础形态最多紫品（第12册 §一）；觉醒形态不受此限
  for (const c of Object.values(COMPANIONS)) {
    if (c.route === 'STORY' || c.route === 'TRIAL') chk(['green', 'blue', 'purple'].includes(c.tier), `伙伴 ${c.name}: 直接入队伙伴基础形态不得高于紫品`)
    if (c.route === 'GACHA') chk(!!c.meetHint, `伙伴 ${c.name}: 抽卡伙伴需要 meetHint`)
    if (c.grade) chk(c.tier === 'orange', `伙伴 ${c.name}: 资质仅用于橙品`)
    if (c.route === 'AFFINITY' && c.tier === 'orange') chk(c.grade === '下', `伙伴 ${c.name}: 好感线橙品应为「橙·下」`)
    if (c.awakened) {
      chk(!!c.awakenTokens && c.awakenTokens > 0, `伙伴 ${c.name}: 觉醒需要 awakenTokens`)
      chk(TIER_RANK[c.awakened.tier] > TIER_RANK[c.tier], `伙伴 ${c.name}: 觉醒形态品质应高于基础形态`)
    }
  }
  for (const set of COMPANION_SETS) {
    set.memberIds.forEach((id) => chk(!!COMPANIONS[id], `套装 ${set.name}: 未知伙伴 ${id}`))
    chk(set.tiers.every((t, i) => i === 0 || t.count > set.tiers[i - 1].count), `套装 ${set.name}: 档位必须递增`)
  }
  for (const t of TRIO_SYNERGIES) {
    chk(!!COMPANIONS[t.leftId] && !!COMPANIONS[t.rightId], `羁绊 ${t.name}: 伙伴不存在`)
    const l = COMPANIONS[t.leftId]
    const r = COMPANIONS[t.rightId]
    if (l && r) chk(l.role !== 'RIGHT' && r.role !== 'LEFT', `羁绊 ${t.name}: 伙伴站位与左右翼冲突`)
  }
  return errs
}

/** 好感上限随主线推进抬高：通关第 3 章 → 600，通关第 5 章 → 1000，此前 300（第12册 §六） */
export function affinityCapFor(maxChapterId: number): number {
  const lastNodeOf = (chapter: number) => Math.max(...STORY_CHAPTERS.filter((n) => n.chapter === chapter).map((n) => n.id))
  if (maxChapterId > lastNodeOf(5)) return 1000
  if (maxChapterId > lastNodeOf(3)) return 600
  return 300
}
