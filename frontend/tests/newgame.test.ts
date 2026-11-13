import { describe, expect, it, vi } from 'vitest'
import { affinityCapFor, COMPANIONS, STORY_CHAPTERS } from '@/config/gameData'
import { simulateServerBattle } from '@/network/mockEngine'
import { ACUPOINTS, MAPS, REALMS } from '../../shared/gameData.ts'
import { effectiveMartialStats } from '../../shared/martialSchools.ts'
import { acupointCost, createStarterCharacter, cultivatePlayer, cultivationRates, legacyAcupoints, realmBreakChance } from '../../shared/player.ts'
import { trialPartId } from '../../shared/trialStages.ts'
import { boost, newStore, playNode, resolvePending } from './helpers'

describe('冲穴药的永久属性', () => {
  it('小还丹永久内力加 300，九转仙丹增加六项基础属性，读档后继续生效', () => {
    const store = newStore('NEW')
    const before = { ...store.player.stats }
    store.pillInventory.shaolin_xiaohuan_dan = 1
    store.pillInventory.jiuzhuan_tongqiao_dan = 1
    store.useAcupointPill('shaolin_xiaohuan_dan')
    expect(store.player.bonusMp).toBe(300)
    expect(store.player.stats.con).toBe(before.con + 6)
    expect(store.openedAcupointIds).toHaveLength(3)
    const afterXiaohuan = { ...store.player.stats }
    store.useAcupointPill('jiuzhuan_tongqiao_dan')
    expect(store.player.stats).toEqual(Object.fromEntries(Object.entries(afterXiaohuan).map(([key, value]) => [key, value + 12])))
    const maxMp = store.derivedStats.maxMp
    store.saveNow()
    store.player.bonusMp = 0
    store.continueGame()
    expect(store.player.bonusMp).toBe(300)
    expect(store.derivedStats.maxMp).toBe(maxMp)
    expect(store.pillInventory).toMatchObject({ shaolin_xiaohuan_dan: 0, jiuzhuan_tongqiao_dan: 0 })
    store.deleteSave()
  })
})

describe('试玩与联机共享冲穴和突破', () => {
  const { player: template, presets } = createStarterCharacter({ id: 'meridian', nickname: '试脉', avatarId: 'hero_sword' }, 0)
  const build = { ...presets[1], innerSkillId: null, outerSkillId: null, ultSkillId: null, leftCompanionId: null, rightCompanionId: null }
  const time = 1_000_000
  const character = (tier: number, level: number, opened = legacyAcupoints(tier)) =>
    ({ ...template, realmTier: tier, level, qiExp: 200_000, openedAcupointIds: opened, stats: { ...template.stats, con: 10 } })

  it('按经脉顺序冲穴，非法请求不扣真气与丹药，通脉丹只扣一枚', () => {
    const player = character(3, 30)
    const stock = { tongmai_dan: 1 }
    const pierce = (pointId: string, usePill = false) => cultivatePlayer(player, build, stock, { action: 'pierce', pointId, usePill }, time)
    expect(pierce('zhubin', true)).toMatchObject({ error: expect.stringContaining('金门穴') })
    expect(player.qiExp).toBe(200_000)
    expect(stock.tongmai_dan).toBe(1)
    const cost = acupointCost(11_000, effectiveMartialStats(player, build).intStat)
    expect(pierce('jinmen')).toMatchObject({ opened: ['jinmen'], spentQi: cost })
    expect(pierce('jinmen', true)).toHaveProperty('error')
    expect(pierce('yangjiao', true)).toMatchObject({ opened: ['yangjiao'], spentQi: 0, pillId: 'tongmai_dan' })
    expect(player.qiExp).toBe(200_000 - cost)
    expect(stock.tongmai_dan).toBe(0)
    expect(player.openedAcupointIds.slice(-2)).toEqual(['jinmen', 'yangjiao'])
  })

  it('小还丹贯通三穴，九转仙丹贯通本阶余穴，消费与永久属性只按一次调用结算', () => {
    const player = character(3, 30)
    const stock = { shaolin_xiaohuan_dan: 1, jiuzhuan_tongqiao_dan: 1 }
    const before = player.stats.con
    const take = (pillId: string) => cultivatePlayer(player, build, stock, { action: 'pill', pillId }, time)
    expect(take('shaolin_xiaohuan_dan')).toMatchObject({ opened: ['jinmen', 'yangjiao', 'zhubin'], spentQi: 0 })
    expect(player.bonusMp).toBe(300)
    expect(player.stats.con).toBe(before + 6)
    expect(take('jiuzhuan_tongqiao_dan')).toMatchObject({ opened: ['fushe', 'tiantu', 'lianquan'] })
    expect(take('jiuzhuan_tongqiao_dan')).toHaveProperty('error')
    expect(player.stats.con).toBe(before + 18)
    expect(stock).toEqual({ shaolin_xiaohuan_dan: 0, jiuzhuan_tongqiao_dan: 0 })
    expect(player.qiExp).toBe(200_000)
  })

  it('未达等级或穴位未通不能冲关，护心丹和失败状态按实际结果结算', () => {
    const player = character(3, 29)
    const stock = { bingpo_huxin_dan: 1, pozhang_dan: 1 }
    const attempt = (roll: number, usePill = false) => cultivatePlayer(player, build, stock, { action: 'break', usePill }, time, () => roll)
    expect(attempt(0, true)).toHaveProperty('error')
    expect(cultivatePlayer(player, build, stock, { action: 'level' }, time)).toMatchObject({ level: 30 })
    expect(attempt(0, true)).toHaveProperty('error')
    expect(stock.pozhang_dan).toBe(1)
    player.openedAcupointIds = ACUPOINTS.map(({ id }) => id)
    const qi = player.qiExp
    expect(attempt(0.99)).toMatchObject({ success: false, protectedByPill: true, pityAdded: 25 })
    expect(player.qiDeviationUntil).toBeUndefined()
    expect(stock.bingpo_huxin_dan).toBe(0)
    expect(attempt(0.99)).toMatchObject({ success: false, protectedByPill: false, pityAdded: 20 })
    expect(player.qiDeviationUntil).toBe(time + 900_000)
    const foe = { name: '试招', title: '', portrait: 'bandit', hp: 10_000, atk: 1, mp: 500, stance: 'FIERCE' } as const
    const at = (at: number) => simulateServerBattle({
      sceneTitle: '试脉', player, loadout: build, mode: 'SOLO_STORY', enemyMain: foe, surviveRounds: 1,
      environment: { at, rain: false, night: false }, rng: () => 0.99,
    })
    const recovering = at(time)
    const after = at(time + 900_000)
    expect(recovering.units.find((unit) => unit.slot === 'ALLY_MAIN')!.maxHp)
      .toBe(Math.round(after.units.find((unit) => unit.slot === 'ALLY_MAIN')!.maxHp * 0.9))
    expect(recovering.events.some((event) => event.effectSourceId === 'qi_deviation')).toBe(true)
    expect(attempt(0.99, true)).toMatchObject({ success: true, rate: 100 })
    expect(player.realmTier).toBe(4)
    expect(player.breakPityRate).toBe(0)
    expect(player.qiExp).toBe(qi)
    expect(stock.pozhang_dan).toBe(0)
    expect(player.qiDeviationUntil).toBeUndefined()
    expect(attempt(0)).toHaveProperty('error')
  })

  it('穴位词条进入真伤、护体防御和打坐真气结算', () => {
    const player = character(3, 30, ['hegu', 'quchi', 'jinmen', 'zhubin', 'lianquan'])
    const base = { ...player, openedAcupointIds: [] }
    const foe = { name: '试盾', title: '', portrait: 'bandit', hp: 10_000, atk: 1, mp: 1000, stance: 'FIERCE',
      combat: { def: 180, openingShield: 10_000 } } as const
    const report = simulateServerBattle({ sceneTitle: '试脉', player, loadout: { ...build, weaponId: null }, mode: 'SOLO_STORY',
      enemyMain: foe, surviveRounds: 1, environment: { rain: false, night: false }, rng: () => 0.99 })
    expect(report.events).toContainEqual(expect.objectContaining({ effectSourceId: 'zhubin', targetSlot: 'ENEMY_MAIN', hpDelta: expect.any(Number),
      segments: expect.arrayContaining([expect.objectContaining({ type: 'damage', category: 'true' })]) }))
    expect(report.events.some((event) => event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('固定破甲 10 点防御')))).toBe(true)
    expect(report.events.some((event) => event.effectSourceId === 'jinmen')).toBe(true)
    const rate = cultivationRates(player, build)
    const normal = cultivationRates(base, build)
    expect(rate.qi).toBeGreaterThan(normal.qi)
    expect(rate.silverBasis).toBe(normal.silverBasis)
  })
})

describe('佩饰参悟和修行词条', () => {
  it('太湖水令提升请安和晋升的实际门派贡献', () => {
    const store = newStore('DEMO')
    store.joinSect('gaibang')
    const waterSeal = trialPartId('taihu_shuizhai', 'ACC')
    store.ownedItemIds.push(waterSeal)
    store.equipItem(waterSeal)
    const previous = store.player.sectContribution
    store.saluteChiefPlayer()
    expect(store.player.sectContribution).toBe(previous + 72)
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      store.challengeSectPromotion()
      expect(store.activeBattle?.rewards?.sectContrib).toBe(240)
      store.skipBattleToEnd()
      expect(store.player.sectContribution).toBe(previous + 312)
    } finally {
      store.closeBattleStage()
      rng.mockRestore()
    }
  })

  it('参悟按实际佩饰和武学传承显示并扣除真气', () => {
    const store = newStore('NEW')
    const general = trialPartId('henglian_tongjia', 'ACC')
    const taohua = trialPartId('qimen_dunjia', 'ACC')
    const ownSkill = 'luoying_zhang'
    const otherSkill = 'quanzhen_jianfa'
    store.player.stats.intStat = 20
    store.learnedSkills[ownSkill] = 1
    store.learnedSkills[otherSkill] = 1
    const ownBase = store.getSkillUpgradeCost(ownSkill)
    const otherBase = store.getSkillUpgradeCost(otherSkill)
    const mp = store.derivedStats.maxMp
    store.ownedItemIds.push(general, taohua)
    store.equipItem(general)
    expect(store.derivedStats.maxMp).toBe(mp + 180)
    expect(store.getSkillUpgradeCost(ownSkill)).toBe(Math.round(ownBase * 0.9))
    expect(store.getSkillUpgradeCost(otherSkill)).toBe(Math.round(otherBase * 0.9))

    store.equipItem(taohua)
    expect(store.derivedStats.maxMp).toBe(mp + 240)
    expect(store.getSkillUpgradeCost(otherSkill)).toBe(otherBase)
    const cost = Math.round(ownBase * 0.7)
    expect(store.getSkillUpgradeCost(ownSkill)).toBe(cost)
    store.player.qiExp = cost
    store.upgradeSkillMastery(ownSkill)
    expect(store.learnedSkills[ownSkill]).toBe(2)
    expect(store.player.qiExp).toBe(0)
    expect(store.player.stats.intStat).toBe(20)
  })

  it('两件修行佩饰在真实配装中影响每小时预览和实际领取', () => {
    const store = newStore('NEW')
    const chest = trialPartId('bihai_chaosheng', 'ACC')
    store.ownedItemIds.push('iron_bagua', chest)
    const map = MAPS.find((zone) => zone.id === store.player.currentMapId)!
    const base = map.baseQiPerHour * (1 + store.player.stats.con / 100)
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      for (const [id, scale] of [['iron_bagua', 1.1], [chest, 1.1]] as const) {
        store.equipItem(id)
        store.player.lastSettleAt = now - 3_600_000
        const previous = store.player.qiExp
        const expected = Math.round(base * scale)
        expect(store.effectiveQiPerHour).toBe(expected)
        expect(store.getIdleRewards(now).gainedQi).toBe(expected)
        store.settleOfflineQi()
        expect(store.player.qiExp - previous).toBe(expected)
      }
    } finally {
      clock.mockRestore()
    }
  })

  it('巡历装备的打坐真气合计封顶 20%，换装结清旧时段，古铜钱单独增加纹银', () => {
    const store = newStore('NEW')
    const redCrown = trialPartId('niluan_jiuyin', 'HEAD')
    const daoCrown = trialPartId('quanzhen_beidou', 'HEAD')
    const ginseng = trialPartId('changbai_canxian', 'HEAD')
    const chest = trialPartId('bihai_chaosheng', 'ACC')
    const coin = trialPartId('pomiao_caomang', 'ACC')
    store.ownedItemIds.push(redCrown, daoCrown, ginseng, chest, coin)
    const now = Date.now()
    const base = store.effectiveQiPerHour
    const silver = store.effectiveSilverPerHour
    store.player.lastSettleAt = now - 3_600_000
    const initialQi = store.player.qiExp
    store.equipItem(ginseng)
    expect(store.player.qiExp - initialQi).toBe(base)
    expect(store.player.lastSettleAt).toBe(now)
    expect(store.effectiveQiPerHour).toBe(Math.round(base * 1.08))
    store.equipItem(daoCrown)
    expect(store.effectiveQiPerHour).toBe(Math.round(base * 1.12))
    store.equipItem(redCrown)
    expect(store.effectiveQiPerHour).toBe(Math.round(base * 1.15))
    store.equipItem(chest)
    expect(store.effectiveQiPerHour).toBe(Math.round(base * 1.2))
    expect(store.effectiveSilverPerHour).toBe(silver)
    expect(store.getIdleRewards(now + 3_600_000)).toEqual({ gainedQi: store.effectiveQiPerHour, gainedSilver: silver })
    store.equipItem(coin)
    expect(store.effectiveQiPerHour).toBe(Math.round(base * 1.15))
    expect(store.effectiveSilverPerHour).toBe(Math.round(Math.round(base * 1.05) * 0.28))
    expect(store.getIdleRewards(now + 3_600_000).gainedSilver).toBe(store.effectiveSilverPerHour)
    const qi = store.player.qiExp
    const cash = store.player.silver
    vi.spyOn(Date, 'now').mockReturnValue(now + 1000)
    store.equipItem(chest)
    expect(store.player.qiExp - qi).toBe(Math.round(base * 1.15 / 3600))
    expect(store.player.silver - cash).toBe(0)
  })

  it('玉露丸宝匣使突破预览和实际成功率同增 20 个百分点并封顶', () => {
    const chest = trialPartId('bihai_chaosheng', 'ACC')
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.8)
    try {
      for (const equip of [false, true]) {
        const store = newStore('DEMO')
        store.player.realmTier = 3
        store.player.stats.con = 10
        store.player.breakPityRate = 0
        store.openedAcupointIds.push(...ACUPOINTS.filter((point) => point.realmTier === 3).map((point) => point.id))
        if (equip) {
          store.ownedItemIds.push(chest)
          store.equipItem(chest)
        }
        const nextRate = REALMS.find(({ tier }) => tier === 4)!.baseBreakRate
        expect(realmBreakChance(store.player, store.currentLoadout, nextRate, false)).toBe(equip ? 88 : 68)
        expect(realmBreakChance(store.player, store.currentLoadout, nextRate, true)).toBe(100)
        store.attemptBreakthrough(false)
        expect(store.player.realmTier).toBe(equip ? 4 : 3)
      }
    } finally {
      rng.mockRestore()
    }
  })
})

describe('新游戏：开局与新手引导', () => {
  it('Lv.1、0 伙伴、无武学，只有青钢剑', () => {
    const s = newStore('NEW')
    expect(s.gameMode).toBe('NEW')
    expect(s.limitsEnabled).toBe(true)
    expect(s.player.level).toBe(1)
    expect(s.player.maxChapterId).toBe(1)
    expect(s.pendingAdventure).toBeNull()
    expect(Object.values(s.companionAffinity).every((c) => !c.recruited && !c.met)).toBe(true)
    expect(s.currentLoadout.outerSkillId).toBeNull()
    expect(s.currentLoadout.ultSkillId).toBeNull()
    expect(s.currentLoadout.leftCompanionId).toBeNull()
    expect(s.currentLoadout.weaponId).toBe('qinggang_sword')
  })

  it('空武学槽不会白送《亢龙有悔》；空手能赢 1-1，奖励自动装配到三套预设', () => {
    const s = newStore('NEW')
    s.challengeChapter(1)
    expect(s.activeBattle!.events.every((e) => e.skillId !== 'kanglong_youhui')).toBe(true)
    s.skipBattleToEnd()
    expect(s.activeBattle?.winner).toBe('ALLY')
    s.closeBattleStage()
    expect(s.player.maxChapterId).toBe(2)
    expect(s.currentLoadout.outerSkillId).toBe('kaishan_zhang')
    expect(s.currentLoadout.accId).toBe('iron_bagua')
    expect(Object.values(s.presets).every((p) => p.outerSkillId === 'kaishan_zhang')).toBe(true)
  })

  it('剧情送：1-2 通关后郭靖、柯镇恶直接入队，郭靖为少年紫品形态', () => {
    const s = newStore('NEW')
    playNode(s, 1)
    s.player.level = 3
    expect(playNode(s, 2)).toBe('ALLY')
    expect(s.companionAffinity.guojing.recruited).toBe(true)
    expect(s.companionAffinity.kezhene.recruited).toBe(true)
    expect(s.companionOf('guojing')).toMatchObject({ tier: 'purple', form: 'base' })
  })
})

describe('新游戏：客栈送礼限制', () => {
  function withGuojing() {
    const s = newStore('NEW')
    playNode(s, 1)
    s.player.level = 3
    playNode(s, 2)
    s.player.silver = 999999
    return s
  }

  it('每日清茶 3 次、爱物 1 次，被拒时不扣银', () => {
    const s = withGuojing()
    const g = s.companionAffinity.guojing
    const before = g.affinity
    for (let i = 0; i < 5; i++) s.giftCompanionInInn('guojing', false)
    expect(g.affinity - before).toBe(60)
    expect(s.giftsLeft('guojing')).toEqual({ tea: 0, gift: 1 })
    const silver = s.player.silver
    s.giftCompanionInInn('guojing', false)
    expect(s.player.silver).toBe(silver)
    s.giftCompanionInInn('guojing', true)
    s.giftCompanionInInn('guojing', true)
    expect(g.affinity - before).toBe(140)
  })

  it('子时之后次数刷新', () => {
    const s = withGuojing()
    for (let i = 0; i < 3; i++) s.giftCompanionInInn('guojing', false)
    expect(s.giftsLeft('guojing').tea).toBe(0)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 86400_000)
    expect(s.giftsLeft('guojing')).toEqual({ tea: 3, gift: 1 })
  })

  it('好感随章节封顶（300 / 600 / 1000），触顶不涨好感、不扣银', () => {
    const s = withGuojing()
    expect(s.affinityCap).toBe(300)
    s.companionAffinity.kezhene.affinity = 299
    s.giftCompanionInInn('kezhene', false)
    expect(s.companionAffinity.kezhene.affinity).toBe(300)
    const silver = s.player.silver
    s.giftCompanionInInn('kezhene', true)
    expect(s.companionAffinity.kezhene.affinity).toBe(300)
    expect(s.player.silver).toBe(silver)
    expect([1, 10, 11, 16, 17].map(affinityCapFor)).toEqual([300, 300, 600, 600, 1000])
  })

  it('演武模式不设限', () => {
    const s = newStore('DEMO')
    expect(s.affinityCap).toBe(1000)
    expect(s.giftsLeft('guojing').tea).toBe(Infinity)
  })
})

describe('新游戏：形态与觉醒', () => {
  it('郭靖：信物不足不能觉醒；觉醒后为橙品成熟形态，战斗中血量随之提升', () => {
    const s = newStore('NEW')
    const gj = s.companionAffinity.guojing
    Object.assign(gj, { met: true, recruited: true, affinity: 700, tokens: 10 })
    s.awakenCompanion('guojing')
    expect(gj.form).toBe('base')

    s.currentLoadout.leftCompanionId = 'guojing'
    const leftHp = () =>
      simulateServerBattle({
        sceneTitle: 'x', mode: 'SOLO_STORY', player: s.player, loadout: s.currentLoadout,
        enemyMain: { name: '木桩', title: '', portrait: 'bandit', hp: 9999, atk: 10, mp: 10, stance: 'FIERCE' },
        companionOf: s.companionOf,
      }).units.find((u) => u.slot === 'ALLY_LEFT')!.maxHp
    const baseHp = leftHp()
    gj.tokens = 30
    s.awakenCompanion('guojing')
    expect(gj.form).toBe('awakened')
    expect(gj.tokens).toBe(0)
    expect(s.companionOf('guojing')).toMatchObject({ tier: 'orange', baseHp: 7500 })
    expect(leftHp()).toBeGreaterThan(baseHp)
  })

  it('洪七公：基础为橙·下（×0.88），觉醒为红品', () => {
    const s = newStore('NEW')
    const hq = s.companionAffinity.hongqigong
    hq.met = true
    expect(s.companionOf('hongqigong')).toMatchObject({ tier: 'orange', grade: '下', baseHp: Math.round(7600 * 0.88) })
    Object.assign(hq, { recruited: true, affinity: 650, tokens: 60 })
    s.awakenCompanion('hongqigong')
    expect(s.companionOf('hongqigong')).toMatchObject({ tier: 'red', grade: null, baseHp: 9600 })
  })
})

describe('新游戏：通关射雕后伙伴路线一致', () => {
  it('剧情送全部入队，好感线只结识，抽卡和历练伙伴尚未入队', () => {
    const s = newStore('NEW')
    s.player.silver = 9_999_999
    boost(s)
    s.player.stats.karma = 100
    for (let id = 1; id <= 16; id++) {
      if (STORY_CHAPTERS[id - 1].code === '5-3') s.updateLoadout({ stance: 'TAICHI' })
      expect(playNode(s, id), STORY_CHAPTERS[id - 1].code).toBe('ALLY')
      // 荒山抉择选「放下屠刀」让梅超风入队，其余优先选可选的甲
      resolvePending(s, (tid) => (tid === 'huangshan_bishou' ? 'B' : undefined))
    }
    const CA = s.companionAffinity
    const of = (r: string) => Object.values(COMPANIONS).filter((c) => c.route === r)
    for (const c of of('STORY')) expect(CA[c.id].recruited, `${c.name} 好感 ${CA[c.id].affinity}`).toBe(true)
    for (const c of of('AFFINITY')) expect(CA[c.id].met && !CA[c.id].recruited, `${c.name} 好感 ${CA[c.id].affinity}`).toBe(true)
    for (const c of of('GACHA')) expect(CA[c.id].met, c.name).toBe(false)
    for (const c of of('TRIAL')) expect(CA[c.id].recruited, c.name).toBe(false)
  })
})
