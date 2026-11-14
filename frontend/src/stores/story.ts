import { computed } from 'vue'
import type { GameLogEntry, PendingAdventureDTO, RichSegment, StorySnakeChoice } from '@/network/protocol'
import {
  MEDICINES,
  ADVENTURES,
  adventureById,
  COMPANIONS,
  getChapterDrops,
  ITEMS,
  ONLINE_STORY_CHAPTERS,
  SKILLS,
  STAT_LABEL,
  STORY_CHAPTERS,
  type AdventureChoice,
  type AdventureCtx,
  type Reward,
} from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { gaibangSilverGain } from '../../../shared/gaibang.ts'
import { addAdventureObjective, adventureEncounter } from '../../../shared/storyData.ts'
import { STORY_SNAKE_ADVENTURE, storyEncounter } from '../../../shared/storySnake.ts'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import type { useCultivation } from './cultivation'
import { useGameUiStore } from './gameUiStore'
import type { useBattlePlayback } from './battlePlayback'
import type { GameActions } from '@/network/gameActions'

export function useStory({ cultivation, battle, actions }: {
  cultivation: Pick<ReturnType<typeof useCultivation>, 'changeMockKarma'>
  battle: Pick<ReturnType<typeof useBattlePlayback>, 'isBattlePlaying' | 'startBattlePlayback' | 'startLocalBattle'>
  actions: GameActions
}) {
  const playerStore = usePlayerStore()
  const {
    martialStats,
    player,
    storyFlags,
    ownedItemIds,
    pendingAdventureId,
    pillCount,
    learnedSkills,
    companionAffinity,
    claimedNodeIds,
    resolvedAdventureIds,
    adventureQueue,
    currentLoadout,
  } = storeToRefs(playerStore)
  const { learnSkill, gainItem, recruitable, simulateServerBattle } = playerStore
  const { changeMockKarma } = cultivation
  const uiStore = useGameUiStore()
  const { activeTab } = storeToRefs(uiStore)
  const { appendLog, showToast } = uiStore
  const { isBattlePlaying, startBattlePlayback, startLocalBattle } = battle

  // 待抉择奇遇：由模板 + 当前角色状态实时推导，选项可选性随属性 / 银两变化
  function adventureCtx(): AdventureCtx {
    return {
      stats: { ...martialStats.value },
      isWanderer: !player.value.currentSectId,
      flags: storyFlags.value,
      items: ownedItemIds.value,
      silver: player.value.silver,
    }
  }
  const choiceAvailable = (c: AdventureChoice, ctx: AdventureCtx) =>
    (!c.require || c.require(ctx)) && (c.costSilver ?? 0) <= ctx.silver
  const canChooseAdventure = (choice: AdventureChoice) => choiceAvailable(choice, adventureCtx())

  const pendingAdventure = computed<PendingAdventureDTO | null>(() => {
    const tpl = pendingAdventureId.value ? adventureById(pendingAdventureId.value) : undefined
    if (!tpl) return null
    const ctx = adventureCtx()
    return {
      id: `adv_${tpl.id}`,
      templateId: tpl.id,
      title: tpl.title,
      location: tpl.location,
      description: tpl.description,
      options: tpl.choices.map((c) => ({
        key: c.key,
        label: c.label,
        requirementText: c.requirementText,
        canSelect: choiceAvailable(c, ctx),
      })),
    }
  })

  // ==================== 剧情奖励 / 支线奇遇 ====================
  /** 统一结算一个 Reward（首通剧情与奇遇选项共用）：属性 / 资源 / 武学 / 装备 / 好感 / 标记，并写一条富文本日志 */
  function applyReward(r: Reward, channel: GameLogEntry['channel'] = 'ADVENTURE') {
    const p = player.value
    const delta: string[] = []
    const links: RichSegment[] = []
    const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`

    for (const [k, v] of Object.entries(r.stats ?? {}) as [keyof typeof STAT_LABEL, number][]) {
      if (k === 'karma') {
        const gained = changeMockKarma(v)
        if (gained) delta.push(`${STAT_LABEL[k]} ${signed(gained)}`)
      } else {
        p.stats[k] += v
        delta.push(`${STAT_LABEL[k]} ${signed(v)}`)
      }
    }
    if (r.bonusHpPct) {
      p.bonusHpPct = (p.bonusHpPct ?? 0) + r.bonusHpPct
      delta.push(`气血上限 +${r.bonusHpPct}%`)
    }
    if (r.qiExp) {
      p.qiExp += r.qiExp
      delta.push(`真气 ${signed(r.qiExp)}`)
    }
    if (r.silver) {
      const silver = gaibangSilverGain(p, r.silver)
      p.silver += silver
      delta.push(`纹银 ${signed(silver)}`)
    }
    if (r.pills) {
      pillCount.value += r.pills
      delta.push(`${MEDICINES.pozhang_dan.name} +${r.pills}`)
    }

    for (const id of r.skills ?? []) {
      const sk = SKILLS[id]
      if (!sk) continue
      const had = (learnedSkills.value[id] ?? 0) > 0
      learnSkill(id)
      if (!had) links.push({ type: 'text', text: ' 习得' }, { type: 'skill', id, name: `《${sk.name}》`, tier: sk.tier })
    }
    for (const [id, n] of Object.entries(r.skillBoost ?? {})) {
      const sk = SKILLS[id]
      if (!sk) continue
      const next = Math.min(10, (learnedSkills.value[id] ?? 0) + n)
      learnedSkills.value[id] = next
      links.push({ type: 'text', text: ' ' }, { type: 'skill', id, name: `《${sk.name}》`, tier: sk.tier }, { type: 'text', text: `参悟至第 ${next} 重` })
    }
    for (const id of r.items ?? []) {
      const it = ITEMS[id]
      if (!it) continue
      if (!ownedItemIds.value.includes(id)) {
        gainItem(id)
        links.push({ type: 'text', text: ' 获得' }, { type: 'item', id, name: `【${it.name}】`, tier: it.tier, isTrueUnique: it.isTrueUnique })
      }
    }
    for (const [id, n] of Object.entries(r.affinity ?? {})) {
      const c = COMPANIONS[id]
      const st = companionAffinity.value[id]
      if (!c || !st) continue
      const wasRecruited = st.recruited
      st.met = true
      st.affinity = Math.min(1000, st.affinity + n)
      st.recruited = st.recruited || recruitable(id, st.affinity)
      delta.push(`${c.name}好感 ${signed(n)}`)
      if (st.recruited && !wasRecruited) links.push({ type: 'text', text: ' ' }, { type: 'actor', name: c.name, isAlly: true }, { type: 'text', text: '已加入你的江湖行列' })
    }
    for (const f of r.flags ?? []) {
      if (!storyFlags.value.includes(f)) storyFlags.value.push(f)
    }

    appendLog(channel, [
      { type: 'tag', text: r.tag, tone: r.tone },
      { type: 'text', text: ` ${r.text}` },
      ...(delta.length ? [{ type: 'text' as const, text: `（${delta.join('，')}）` }] : []),
      ...links,
    ])
    showToast(r.tag, r.tone === 'red' ? 'danger' : r.tone === 'gold' ? 'gold' : 'info')
  }

  /** 主线节点首通：写叙事、发奖励，并把该节点解锁的支线排进奇遇队列 */
  function claimNodeFirstClear(nodeId: number) {
    if (claimedNodeIds.value.includes(nodeId)) return
    const node = STORY_CHAPTERS.find((n) => n.id === nodeId)
    if (!node) return
    claimedNodeIds.value.push(nodeId)
    applyReward(node.firstClear, 'JIANGHU')
    queueAdventuresAfter(nodeId)
  }

  function queueAdventuresAfter(nodeId: number) {
    for (const a of ADVENTURES) {
      if (a.afterNodeId !== nodeId) continue
      if (resolvedAdventureIds.value.includes(a.id) || adventureQueue.value.includes(a.id) || pendingAdventureId.value === a.id) continue
      adventureQueue.value.push(a.id)
    }
    pumpAdventureQueue()
  }

  function pumpAdventureQueue() {
    if (pendingAdventureId.value || !adventureQueue.value.length) return
    pendingAdventureId.value = adventureQueue.value.shift()!
    const tpl = adventureById(pendingAdventureId.value)
    if (tpl) showToast(`触发江湖奇遇：【${tpl.title}】`, 'gold')
  }

  // 游历寻访：从“主线已推进到、且尚未了结”的支线中随机抽取
  function triggerRandomAdventure() {
    activeTab.value = 'CULTIVATE'
    if (pendingAdventureId.value) {
      showToast('尚有奇遇等你抉择，请先在纪事卷轴中做出选择', 'info')
      return
    }
    const pool = ADVENTURES.filter(
      (a) =>
        a.afterNodeId < player.value.maxChapterId &&
        !resolvedAdventureIds.value.includes(a.id) &&
        !adventureQueue.value.includes(a.id)
    )
    if (!pool.length) {
      showToast('江湖近日风平浪静，暂无新的奇遇——推进主线可解锁更多支线', 'info')
      return
    }
    const tpl = pool[Math.floor(Math.random() * pool.length)]
    pendingAdventureId.value = tpl.id
    showToast(`触发江湖奇遇：【${tpl.title}】`, 'gold')
  }

  function resolveAdventureChoice(choice: 'A' | 'B', adventureId: string | null) {
    const tpl = adventureId ? adventureById(adventureId) : undefined
    const c = tpl?.choices.find((x) => x.key === choice)
    if (!tpl || !c || isBattlePlaying.value || resolvedAdventureIds.value.includes(tpl.id)) return
    const snake = tpl.id === STORY_SNAKE_ADVENTURE.id
    if (snake && (player.value.storySnakeChoice || player.value.maxChapterId <= tpl.afterNodeId)) return
    const request = !snake && claimedNodeIds.value.includes(tpl.afterNodeId) ? { id: tpl.id, choice } : undefined
    return actions.run('adventure', request, ({ report, narration }) => {
      if (report) startBattlePlayback(report)
      else if (narration) appendLog('ADVENTURE', narration)
    }, () => resolveLocalAdventure(tpl, c, choice, snake))
  }

  function resolveLocalAdventure(tpl: NonNullable<ReturnType<typeof adventureById>>, c: AdventureChoice, choice: 'A' | 'B', snake: boolean) {
    const ctx = adventureCtx()
    if (!choiceAvailable(c, ctx)) {
      showToast(c.costSilver && ctx.silver < c.costSilver ? '纹银不足！' : (c.requirementText ?? '条件未满足'), 'danger')
      return
    }
    const reward = typeof c.reward === 'function' ? c.reward(ctx) : c.reward
    const complete = () => {
      if (resolvedAdventureIds.value.includes(tpl.id)) return
      if (c.costSilver) player.value.silver -= c.costSilver
      resolvedAdventureIds.value.push(tpl.id)
      if (snake) player.value.storySnakeChoice = choice
      if (pendingAdventureId.value === tpl.id) pendingAdventureId.value = null
      const queued = adventureQueue.value.indexOf(tpl.id)
      if (queued >= 0) adventureQueue.value.splice(queued, 1)
      applyReward(reward)
      pumpAdventureQueue()
    }
    const battle = c.battle
    if (!battle) return complete()

    const encounter = adventureEncounter(battle)
    if (!encounter) return
    const report = simulateServerBattle({
      sceneTitle: tpl.title, mode: 'SOLO_STORY', player: player.value, loadout: currentLoadout.value,
      learnedSkills: learnedSkills.value, ...encounter,
    })
    addAdventureObjective(report, tpl, encounter)
    startLocalBattle(report, null, complete)
  }

  function resolveAdventure(choice: 'A' | 'B') {
    resolveAdventureChoice(choice, pendingAdventureId.value)
  }

  function chooseStorySnake(chapterId: number, choice: StorySnakeChoice) {
    if (isBattlePlaying.value || player.value.storySnakeChoice || chapterId > player.value.maxChapterId) return
    const chapters = IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS
    if (chapters.find((chapter) => chapter.id === chapterId)?.code !== STORY_SNAKE_ADVENTURE.chapterCode) return
    return actions.run('storySnake', { code: STORY_SNAKE_ADVENTURE.chapterCode, choice }, (result) => {
      if (!result.firstPick) return
      const { tag, tone, text } = STORY_SNAKE_ADVENTURE.choices[result.choice].reward
      appendLog('ADVENTURE', [{ type: 'tag', text: tag, tone }, { type: 'text', text: ` ${text}` }])
      showToast(tag, tone === 'gold' ? 'gold' : 'info')
    }, () => { resolveAdventureChoice(choice, STORY_SNAKE_ADVENTURE.id) })
  }

  function challengeChapter(chapterId: number, retreat = false) {
    if (isBattlePlaying.value) return
    const ch = (IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS).find((c) => c.id === chapterId)
    if (!ch) return
    if (chapterId > player.value.maxChapterId) {
      showToast('先打过上一关，就能挑战这里。', 'danger')
      return
    }
    const intro: RichSegment[] = [
      { type: 'tag', text: ch.code, tone: ch.isBoss ? 'red' : 'gold' },
      { type: 'text', text: ` ${ch.intro}` },
    ]
    return actions.run('story', { code: ch.code, retreat }, ({ report }) => {
      appendLog('JIANGHU', intro)
      startBattlePlayback(report)
    }, () => {
      const drops = getChapterDrops(ch)
        .filter((drop) => drop.kind === 'item' ? !ownedItemIds.value.includes(drop.id) : !learnedSkills.value[drop.id])
        .map(({ id, name, tier }) => ({ id, name, tier }))
      if ((chapterId === 12 || chapterId === 16) && (chapterId === 12 ? claimedNodeIds.value.includes(16) : claimedNodeIds.value.includes(12))
        && companionAffinity.value.huangrong?.recruited && !ownedItemIds.value.includes('jiuyin_sanskrit')) {
        const { id, name, tier } = ITEMS.jiuyin_sanskrit
        drops.push({ id, name, tier })
      }

      appendLog('JIANGHU', intro)

      const report = simulateServerBattle({
        sceneTitle: `${ch.code} ${ch.title}`,
        mode: 'SOLO_STORY',
        tryRetreat: retreat,
        player: player.value,
        loadout: currentLoadout.value,
        ...storyEncounter(ch, player.value.storySnakeChoice, ch.isBoss),
        rewards: {
          qiExp: ch.rewardQi,
          silver: ch.rewardSilver,
          items: drops,
        },
      })
      // 主线进度与首通剧情在战斗演绎结束后统一结算（见 finishBattleSettlement）
      startLocalBattle(report, chapterId)
    })
  }

  return {
    claimNodeFirstClear,
    applyReward,
    pendingAdventure,
    chooseStorySnake,
    triggerRandomAdventure,
    resolveAdventure,
    resolveAdventureChoice,
    canChooseAdventure,
    challengeChapter,
  }
}
