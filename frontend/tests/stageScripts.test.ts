import { describe, expect, it } from 'vitest'
import { ONLINE_STORY_CHAPTERS, STORY_CHAPTERS } from '@/config/gameData'
import type { BattleEventDTO, BattleReportDTO } from '@/network/protocol'
import { useInterfacePrefs } from '@/stores/interfacePrefs'
import {
  addStageLines, KIN_NAMES, nextStage, SCRIPT_MAX_PAGES, SCRIPT_PAGE_MAX_CHARS, STAGE_LINE_SOURCE, stageScript, storyGateBlock, storyGateStage,
  trialGateBlock, trialGateNode, STORY_TIMELINE,
  storyKey, trialKey, type ScriptLine, type StageKey,
} from '../../shared/stageScripts.ts'
import { ORIGINS } from '../../shared/origins.ts'
import { SECT_LORE } from '../../shared/sectLore.ts'
import { COMPANIONS, SECTS } from '@/config/gameData'
import { TRIAL_STAGES, trialFirstClearQi } from '../../shared/trialStages.ts'
import { boost, newStore } from './helpers'

/** 不在战场上、只在对白里出场的人，以及四种家世的家人伙伴 */
const CAST = ['郭靖', '柯镇恶', '黄蓉', '洪七公', ...Object.values(KIN_NAMES)]

describe('关卡剧情 · 数据', () => {
  it('时间线恰好排进 16 个主线节点和 30 关历练，各自的先后不变', () => {
    expect(STORY_TIMELINE).toHaveLength(46)
    expect(new Set(STORY_TIMELINE).size).toBe(46)
    expect(STORY_TIMELINE.filter((key) => key.startsWith('N'))).toEqual(STORY_CHAPTERS.map(({ code }) => storyKey(code)))
    expect(STORY_TIMELINE.filter((key) => key.startsWith('T'))).toEqual(TRIAL_STAGES.map(({ code }) => trialKey(code)))
    // 重复首领按上下幕排：1-3 在历练 07 之前，历练 30 是终章
    expect(STORY_TIMELINE.indexOf('N1-3')).toBeLessThan(STORY_TIMELINE.indexOf('T07'))
    expect(STORY_TIMELINE.indexOf('T23')).toBeLessThan(STORY_TIMELINE.indexOf('N4-1'))
    expect(STORY_TIMELINE.at(-1)).toBe('T30')
  })

  it.each([['试玩', STORY_CHAPTERS], ['联机', ONLINE_STORY_CHAPTERS]] as const)('%s：每一回都有剧情，篇幅不超上限', (_, nodes) => {
    for (const key of STORY_TIMELINE) {
      const script = stageScript(key, nodes)!
      expect(script, key).toBeDefined()
      const kind = key[0] as 'N' | 'T'
      // 1-1 的入关由序章演
      if (key !== 'N1-1') expect(script.before.length, key).toBeGreaterThan(0)
      expect(script.before.length, key).toBeLessThanOrEqual(SCRIPT_MAX_PAGES[kind])
      expect(script.after.length, key).toBeLessThanOrEqual(SCRIPT_MAX_PAGES[kind])
      for (const page of [...script.before, ...script.after]) {
        expect(page.text.length, `${key}：${page.text}`).toBeLessThanOrEqual(SCRIPT_PAGE_MAX_CHARS)
      }
      expect(script.lines.find(({ at }) => at === 'OPEN'), key).toBeDefined()
      if (kind === 'T') {
        expect(script.after.length, key).toBeGreaterThan(0)
      } else {
        const node = nodes.find(({ code }) => storyKey(code) === key)!
        // 1-1 的开场是序章、结语是忘机客的剧情卡，卡片上只留小结
        if (key === 'N1-1') {
          expect(script).toMatchObject({ before: [], after: [] })
          continue
        }
        // 入关是一页前情加节点的开场（日志里记的也是它）
        expect(script.before.map(({ text }) => text), key).toEqual([expect.any(String), node.intro])
        expect(script.after.length, key).toBeGreaterThan(0)
      }
      expect(script.recap, key).toBeTruthy()
      // 终章没有下一回
      if (key !== 'N1-1' && key !== 'T30') expect(script.hook, key).toBeTruthy()
    }
  })

  it('对白的说话人要么与战场上的敌人同名（才按敌方着色），要么是只在对白里出场的人', () => {
    const foes = (key: StageKey) => {
      const stage = TRIAL_STAGES.find(({ code }) => trialKey(code) === key)
      if (stage) return [stage.boss.name, ...stage.guards?.map(({ name }) => name) ?? []]
      const node = STORY_CHAPTERS.find(({ code }) => storyKey(code) === key)!
      return [node.bossName, ...node.guards?.map(({ name }) => name) ?? []]
    }
    for (const key of STORY_TIMELINE) {
      for (const { speaker } of stageScript(key, STORY_CHAPTERS)!.lines) {
        if (speaker) expect([...foes(key), ...CAST], `${key}：${speaker}`).toContain(speaker)
      }
    }
  })

  it('家人伙伴的名字与家世设定一致；第一章每回首胜都有一条江湖传闻', () => {
    for (const origin of Object.values(ORIGINS)) expect(KIN_NAMES[origin.id]).toBe(COMPANIONS[origin.companionId].name)
    for (const key of STORY_TIMELINE.slice(0, 10)) expect(stageScript(key, STORY_CHAPTERS)!.rumor, key).toBeTruthy()
  })

  it('七个门派都有山门、门规和拜师那一段，每页不超上限', () => {
    for (const sect of SECTS) {
      const lore = SECT_LORE[sect.id]
      expect(lore, sect.id).toBeDefined()
      expect(lore.rules).toHaveLength(3)
      expect(lore.initiation.length).toBeGreaterThanOrEqual(2)
      for (const page of lore.initiation) expect(page.text.length, `${sect.id}：${page.text}`).toBeLessThanOrEqual(SCRIPT_PAGE_MAX_CHARS)
    }
  })

  it('重复首领分上下两幕：上幕只败走，下幕才了结；「天下第一」在历练 30', () => {
    const node = (code: string) => STORY_CHAPTERS.find((n) => n.code === code)!
    const after = (key: StageKey) => stageScript(key, STORY_CHAPTERS)!.after.map(({ text }) => text).join('')
    expect(node('2-1').title).toBe('客店夜围 · 小王爷完颜康')
    expect(node('2-2').firstClear.text).not.toContain('高墙')
    expect(after('T13')).toContain('翻出了高墙')
    expect(node('5-3').firstClear.text).not.toMatch(/天下第一|圆满/)
    expect(after('T30')).toMatch(/射雕·天下第一.*圆满/s)
    expect(TRIAL_STAGES.find(({ code }) => code === '26')!.title).toBe('铁掌山门 · 水上漂裘千仞')
  })

  it('第一章写完：各回的入关接住上一回的下回预告，1-3 的陈玄风只败走不死', () => {
    const script = (key: StageKey) => stageScript(key, STORY_CHAPTERS)!
    expect(script('N1-2').before[0].text).toContain('醉仙楼')
    expect(script('T03').before[0].text).toContain('信')
    expect(script('N1-3').before[0].text).toContain('荒山')
    expect(script('T07').before[0].text).toContain('骷髅')
    const n13 = STORY_CHAPTERS.find(({ code }) => code === '1-3')!
    expect(n13.firstClear.text).not.toContain('毙命')
    expect(script('N1-3').after.map(({ text }) => text).join('')).toContain('往北')
    expect(script('T07').after[0].text).toContain('「靖」字匕首')
  })

  it('主线等历练：13 个节点要先过时间线上紧挨着的那关；只拦新角色还没打的最前一个节点', () => {
    const gated = STORY_CHAPTERS.flatMap(({ code }) => storyGateStage(code) ? [`${code}←${storyGateStage(code)!.code}`] : [])
    expect(gated).toEqual(['1-2←01', '1-3←04', '2-1←09', '2-2←12', '2-3←13', '3-2←15', '3-3←19', '4-1←23', '4-2←24', '4-3←26', '5-1←27', '5-2←28', '5-3←29'])
    const n13 = STORY_CHAPTERS[2]
    const trial = (rewardedStageIds: number[], maxStageId = 1) => ({ rewardedStageIds, maxStageId }) as never
    const newcomer = { featureGate: true as const, maxChapterId: 3, trial: trial([1, 2, 3]) }
    expect(storyGateBlock(n13, newcomer)?.code).toBe('04')
    expect(storyGateBlock(n13, { ...newcomer, trial: trial([1, 2, 3, 4]) })).toBeUndefined()
    expect(storyGateBlock(n13, { ...newcomer, trial: trial([], 6) })).toBeUndefined()
    // 老角色、已经打过或要补打的节点不拦
    expect(storyGateBlock(n13, { ...newcomer, featureGate: undefined })).toBeUndefined()
    expect(storyGateBlock(n13, { ...newcomer, maxChapterId: 4 })).toBeUndefined()
  })

  it('历练等主线：14 关首战要先打完时间线上紧挨着的主线节点；只拦新角色还没首胜的关', () => {
    const gated = TRIAL_STAGES.flatMap(({ code }) => trialGateNode(code) ? [`${code}←${trialGateNode(code)!.code}`] : [])
    expect(gated).toEqual(['01←1-1', '02←1-2', '05←1-3', '10←2-1', '13←2-2', '14←3-1', '16←3-2', '20←3-4', '24←4-1', '25←4-2', '27←4-3', '28←5-1', '29←5-2', '30←5-3'])
    const t05 = TRIAL_STAGES[4]
    const trial = (rewardedStageIds: number[], maxStageId = 5) => ({ rewardedStageIds, maxStageId }) as never
    const newcomer = { featureGate: true as const, maxChapterId: 3, trial: trial([1, 2, 3, 4]) }
    expect(trialGateBlock(t05, newcomer)?.code).toBe('1-3')
    expect(trialGateBlock(t05, { ...newcomer, maxChapterId: 4 })).toBeUndefined()
    // 老角色、已首胜的关不拦
    expect(trialGateBlock(t05, { ...newcomer, featureGate: undefined })).toBeUndefined()
    expect(trialGateBlock(t05, { ...newcomer, trial: trial([1, 2, 3, 4, 5], 6) })).toBeUndefined()
  })

  it('「下一回」取时间线上后面第一个没通关的', () => {
    const cleared = new Set<StageKey>(['N1-1', 'T01', 'T02'])
    expect(nextStage('N1-1', (key) => cleared.has(key))).toBe('N1-2')
    expect(nextStage('N1-2', (key) => cleared.has(key))).toBe('T03')
    expect(nextStage('T30', () => false)).toBeUndefined()
  })
})

describe('关卡剧情 · 阵中对白', () => {
  const ev = (round: number, type: BattleEventDTO['type'], extra: Partial<BattleEventDTO> = {}): BattleEventDTO =>
    ({ round, type, actorSlot: 'ALLY_MAIN', segments: [{ type: 'text', text: `${type}@${round}` }], ...extra })
  const report = (winner: 'ALLY' | 'ENEMY', events: BattleEventDTO[], retreated?: true) => ({
    winner, retreated, events,
    units: [{ slot: 'ALLY_MAIN', id: 'hero', name: '你' }, { slot: 'ENEMY_MAIN', id: 'boss', name: '铜尸·陈玄风' }],
  }) as unknown as BattleReportDTO
  const ctx = { flags: [] as string[] }
  const battle = () => [
    ev(1, 'STANCE_CLASH'), ev(1, 'SKILL_CAST', { hpDelta: -10 }),
    ev(5, 'EFFECT', { statusApplied: '肚脐罩门' }), ev(5, 'SKILL_CAST', { hpDelta: -30 }), ev(5, 'EFFECT'),
  ]
  const lines: ScriptLine[] = [
    { at: 'OPEN', speaker: '铜尸·陈玄风', text: '纳命来！' },
    { at: 'ROUND', round: 5, speaker: '柯镇恶', text: '罩门露了！' },
    { at: 'WIN', text: '铜尸轰然倒地。' },
    { at: 'LOSE', text: '你被逼退下山。' },
  ]
  const texts = (r: BattleReportDTO) => r.events.map(({ segments }) => segments.map((seg) => 'text' in seg ? seg.text : `[${seg.type === 'actor' ? seg.name : ''}]`).join(''))

  it('开场接在打法对照后面，回合句接在本回合的机制提示后面，胜句落在最后一击之后', () => {
    const won = report('ALLY', battle())
    addStageLines(won, lines, ctx)
    expect(texts(won)).toEqual([
      'STANCE_CLASH@1', '[铜尸·陈玄风]：「纳命来！」', 'SKILL_CAST@1',
      'EFFECT@5', '[柯镇恶]：「罩门露了！」', 'SKILL_CAST@5', '铜尸轰然倒地。', 'EFFECT@5',
    ])
    const lineEvents = won.events.filter((event) => event.effectSourceId === STAGE_LINE_SOURCE)
    expect(lineEvents.map(({ round, actorSlot, type }) => ({ round, actorSlot, type }))).toEqual([
      { round: 1, actorSlot: 'ENEMY_MAIN', type: 'EFFECT' },
      { round: 5, actorSlot: 'ALLY_MAIN', type: 'EFFECT' },
      { round: 5, actorSlot: 'ALLY_MAIN', type: 'EFFECT' },
    ])
    expect(lineEvents[0].segments[0]).toMatchObject({ type: 'actor', isAlly: false })
  })

  it('打不到的回合不插；败句只在真输时插，撤退不插', () => {
    const lost = report('ENEMY', battle().slice(0, 2))
    addStageLines(lost, lines, ctx)
    expect(texts(lost)).toEqual(['STANCE_CLASH@1', '[铜尸·陈玄风]：「纳命来！」', 'SKILL_CAST@1', '你被逼退下山。'])
    const fled = report('ENEMY', battle().slice(0, 2), true)
    addStageLines(fled, lines, ctx)
    expect(texts(fled)).not.toContain('你被逼退下山。')
  })

  it('梁子翁按药蛇宝血的抉择换开场', () => {
    const open = (storySnakeChoice?: 'A' | 'B') => {
      const r = report('ALLY', battle())
      addStageLines(r, stageScript('T13', STORY_CHAPTERS)!.lines, { ...ctx, storySnakeChoice })
      return texts(r)[1]
    }
    expect(open('A')).toContain('竟让你们喝了')
    expect(open('B')).toContain('说放就放了')
    expect(open()).toContain('还我二十年宝蛇心血')
  })

  it('家人只在自己的家世里插话，按我方着色', () => {
    const withKin = (origin?: 'yujia' | 'xinglin') => {
      const r = report('ALLY', [ev(1, 'STANCE_CLASH'), ev(1, 'SKILL_CAST', { hpDelta: -10 }), ev(2, 'SKILL_CAST', { hpDelta: -10 }), ev(3, 'SKILL_CAST', { hpDelta: -10 })])
      r.units.push({ slot: 'ALLY_LEFT', id: 'ruanqinggao', name: '阮青篙' } as never)
      addStageLines(r, stageScript('T01', STORY_CHAPTERS)!.lines, { ...ctx, origin })
      return r.events.filter((e) => e.effectSourceId === STAGE_LINE_SOURCE && e.round === 2)
    }
    expect(withKin('yujia')).toMatchObject([{ actorSlot: 'ALLY_LEFT', segments: [{ type: 'actor', name: '阮青篙', isAlly: true }, expect.anything()] }])
    expect(withKin()).toEqual([])
  })

  it('同一时点按顺序取第一句条件满足的', () => {
    const variants: ScriptLine[] = [
      { at: 'OPEN', text: '救过梅超风', when: { choice: ['huangshan_dagger', 'B'] } },
      { at: 'OPEN', text: '有家世', when: { origin: 'xinglin' } },
      { at: 'OPEN', text: '缺省' },
    ]
    const open = (c: Parameters<typeof addStageLines>[2]) => {
      const r = report('ALLY', battle())
      addStageLines(r, variants, c)
      return texts(r)[1]
    }
    expect(open(ctx)).toBe('缺省')
    expect(open({ ...ctx, origin: 'xinglin' })).toBe('有家世')
    expect(open({ ...ctx, origin: 'xinglin', storyAdventureChoices: { huangshan_dagger: 'B' } })).toBe('救过梅超风')
  })
})

describe('关卡剧情 · 演出流程', () => {
  const linesIn = (report: BattleReportDTO | null) => report?.events.filter((event) => event.effectSourceId === STAGE_LINE_SOURCE) ?? []

  it('历练首通：先放入关卷轴，拔剑后开打并插对白，打赢放结语，收卷收起战场', () => {
    const store = newStore('NEW')
    store.enterTrialStage(1)
    expect(store.activeBattle).toBeNull()
    const before = store.stageScroll!
    expect(before).toMatchObject({ phase: 'BEFORE', stage: { key: 'T01', title: TRIAL_STAGES[0].title, foe: { name: TRIAL_STAGES[0].boss.name } } })
    if (before.phase !== 'BEFORE') throw new Error('应先放入关卷轴')
    before.start()
    expect(store.stageScroll).toBeNull()
    // 开场与胜句
    expect(linesIn(store.activeBattle).map(({ segments }) => segments[0])).toEqual([
      { type: 'actor', name: '黑风寨逃寇·赖三', isAlly: false }, { type: 'actor', name: '黑风寨逃寇·赖三', isAlly: false },
    ])
    store.skipBattleToEnd()
    store.skipBattleToEnd()
    expect(store.activeBattle?.winner).toBe('ALLY')
    expect(store.stageScroll).toMatchObject({
      phase: 'AFTER', pages: [{ text: expect.stringContaining('赖三') }],
      rewards: { qiExp: trialFirstClearQi(TRIAL_STAGES[0]) },
      next: { key: 'N1-2', hook: '醉仙楼上斗酒的，是什么人？', newChapter: false },
    })
    store.closeStageScroll()
    expect(store.stageScroll).toBeNull()
    expect(store.activeBattle).toBeNull()

    // 通关后再战不放剧情、不插对白
    store.enterTrialStage(1)
    expect(store.stageScroll).toBeNull()
    expect(linesIn(store.activeBattle)).toHaveLength(0)
    store.closeBattleStage()
  })

  it('打输了重来不再放入关；结语「前往下一回」翻到那一回', () => {
    const store = newStore('NEW')
    boost(store)
    store.player.maxChapterId = 3
    store.claimedNodeIds.push(1, 2)
    store.player.trial.rewardedStageIds = [1, 2, 3]
    store.player.trial.maxStageId = 5
    store.enterStoryNode(3)
    const before = store.stageScroll!
    expect(before.pages).toHaveLength(2)
    expect(before.pages[1]).toEqual({ text: STORY_CHAPTERS[2].intro })
    if (before.phase !== 'BEFORE') throw new Error('应先放入关卷轴')
    before.start()
    store.skipBattleToEnd()
    store.skipBattleToEnd()
    expect(store.activeBattle?.winner).toBe('ALLY')
    // 时间线上 1-3 后面是历练 05
    expect(store.stageScroll).toMatchObject({ phase: 'AFTER', next: { key: 'T05', hook: '铜尸负伤北逃。追！' } })
    expect(store.stageScroll?.pages).toHaveLength(2)
    store.closeStageScroll(true)
    expect(store.activeBattle).toBeNull()
    expect(store.activeTab).toBe('JIANGHU')
    expect(store.jianghuTab).toBe('TRIAL')
    expect(store.stageFocus).toBe('T05')

    // 入关看过就记下：撤退、打输后再来直接开打，对白照插
    const fresh = newStore('NEW')
    fresh.player.maxChapterId = 2
    fresh.claimedNodeIds.push(1)
    fresh.enterStoryNode(2)
    const scroll = fresh.stageScroll!
    if (scroll.phase !== 'BEFORE') throw new Error('应先放入关卷轴')
    scroll.start()
    fresh.closeBattleStage()
    fresh.enterStoryNode(2)
    expect(fresh.stageScroll).toBeNull()
    expect(linesIn(fresh.activeBattle).length).toBeGreaterThan(0)
    fresh.closeBattleStage()
    const lead = stageScript('N1-2', STORY_CHAPTERS)!.before[0].text
    expect(fresh.stageBlurb('N1-2')).toEqual({ text: lead.replaceAll('\n', ''), reviewable: true })
    fresh.reviewStage('N1-2')
    expect(fresh.stageScroll).toMatchObject({ phase: 'REVIEW', pages: [{ text: lead }, { text: STORY_CHAPTERS[1].intro }] })
  })

  it('新角色的主线节点被历练挡着时不放入关卷轴，过了那关才放', () => {
    const store = newStore('NEW', { gated: true })
    store.player.maxChapterId = 2
    store.claimedNodeIds.push(1)
    store.enterStoryNode(2)
    expect(store.stageScroll).toBeNull()
    expect(store.activeBattle).toBeNull()
    expect(store.toasts.at(-1)?.text).toContain('历练第 01 关')
    store.player.trial.rewardedStageIds.push(1)
    store.enterStoryNode(2)
    expect(store.stageScroll?.phase).toBe('BEFORE')
  })

  it('1-1 只插对白不弹结语，由忘机客的剧情卡收尾', () => {
    const store = newStore('NEW', { gated: true })
    store.enterStoryNode(1)
    expect(store.stageScroll).toBeNull()
    expect(linesIn(store.activeBattle)[0].segments[0]).toMatchObject({ type: 'actor', name: '金国密探·黑衣刺客' })
    store.skipBattleToEnd()
    expect(store.activeBattle?.winner).toBe('ALLY')
    expect(store.stageScroll).toBeNull()
    store.closeBattleStage()
    expect(store.featureCard?.id).toBe('TRIAL')
  })

  it('历练 07 的开场按「荒山遗落的匕首」的选择换；打完预告下一章', () => {
    const store = newStore('NEW')
    boost(store)
    store.resolveAdventureChoice('B', 'huangshan_bishou')
    expect(store.player.storyAdventureChoices).toEqual({ huangshan_bishou: 'B' })
    store.player.trial.maxStageId = 7
    store.player.trial.stageHours['7'] = 1
    store.enterTrialStage(7)
    const before = store.stageScroll!
    expect(before.pages).toHaveLength(2)
    if (before.phase !== 'BEFORE') throw new Error('应先放入关卷轴')
    before.start()
    expect(linesIn(store.activeBattle).map(({ segments }) => segments.at(-1))).toContainEqual({ type: 'text', text: '：「你救了她？……那也得死！」' })
    store.skipBattleToEnd()
    store.skipBattleToEnd()
    expect(store.activeBattle?.winner).toBe('ALLY')
    expect(store.stageScroll).toMatchObject({ phase: 'AFTER', next: { key: 'T08', newChapter: true, hook: expect.stringContaining('牛家村') } })
    // 第一章完：结语多一页本章回目；江湖百晓生把事传开
    const after = store.stageScroll
    if (after?.phase !== 'AFTER') throw new Error('应放首通结语')
    expect(after.chapterEnd).toMatchObject({ chapter: 1, title: '嘉兴烟雨，大漠荒山' })
    expect(after.chapterEnd?.entries.map(({ key }) => key)).toEqual(STORY_TIMELINE.slice(0, 10))
    expect(after.chapterEnd?.entries.every(({ recap }) => recap)).toBe(true)
    expect(store.latestRumor).toMatchObject({ sender: { nickname: '江湖百晓生' }, content: expect.stringContaining(store.player.nickname) })
    store.closeStageScroll()
  })

  it('拜入门派时放拜师那一段，门派页上能重温', () => {
    const store = newStore('NEW')
    store.joinSect('jiangnan_wuguan')
    expect(store.player.currentSectId).toBe('jiangnan_wuguan')
    expect(store.stageScroll).toMatchObject({ phase: 'TALE', title: '奉茶拜师 · 江南武馆', pages: SECT_LORE.jiangnan_wuguan.initiation })
    store.closeStageScroll()
    expect(store.stageScroll).toBeNull()
    store.showSectTale('jiangnan_wuguan')
    expect(store.stageScroll?.phase).toBe('TALE')
  })

  it('设置为「只看关后」时不放入关，「关闭」时三段都不放', () => {
    const after = newStore('NEW')
    useInterfacePrefs().stageScripts = 'AFTER'
    after.enterTrialStage(1)
    expect(after.stageScroll).toBeNull()
    expect(linesIn(after.activeBattle).length).toBeGreaterThan(0)
    after.skipBattleToEnd()
    after.skipBattleToEnd()
    expect(after.stageScroll?.phase).toBe('AFTER')
    after.closeStageScroll()

    const off = newStore('NEW')
    useInterfacePrefs().stageScripts = 'OFF'
    off.enterTrialStage(1)
    expect(linesIn(off.activeBattle)).toHaveLength(0)
    off.skipBattleToEnd()
    off.skipBattleToEnd()
    expect(off.stageScroll).toBeNull()
    off.closeBattleStage()
  })
})
