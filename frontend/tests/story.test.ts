/**
 * 演武模式下的射雕篇全流程：主线、支线、门派、地图、羁绊。
 * 本文件内的用例按顺序共用同一个 store（后一步依赖前一步的进度）。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ADVENTURES, COMPANIONS, SECTS, STORY_CHAPTERS } from '@/config/gameData'
import { FEAST_TARGET_FLAG, GAIBANG_FINAL_DISHES } from '@/config/questData'
import { computeDerivedStats, simulateServerBattle } from '@/network/mockEngine'
import { GAIBANG_FINAL_EXAM } from '../../shared/gaibang.ts'
import { QUANZHEN_GUARD_EXAM, QUANZHEN_SEVEN_IDS } from '../../shared/quanzhen.ts'
import { TAOHUA_FINAL_EXAM } from '../../shared/taohua.ts'
import { createStarterCharacter } from '../../shared/player.ts'
import { sectExamBlockReason, sectPromotion, simulateSectTrial } from '../../shared/sectProgress.ts'
import { TRIAL_PATROL_HOURS } from '../../shared/trialStages.ts'
import { boost, newStore, playNode, resolvePending, type Store } from './helpers'

describe('丐帮污净抉择与君山大会', () => {
  function threeBags() {
    const hero = newStore('DEMO')
    hero.joinSect('gaibang')
    hero.challengeSectPromotion()
    hero.skipBattleToEnd()
    hero.closeBattleStage()
    expect(hero.player.sectRank).toBe(2)
    expect(hero.gaibangChoicePending).toBe(true)
    return hero
  }

  it('轩辕台污衣考核结算后三阶生效，取消回放仍可重试或另选净衣', () => {
    const hero = threeBags()
    try {
      const panel = { ...hero.derivedStats }
      const baseline = { ...hero.player.stats }
      const contribution = hero.player.sectContribution
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toBeNull()
      hero.challengeSectPromotion('WUYI')
      expect(hero.activeBattle).toMatchObject({ sceneTitle: '丐帮 · 轩辕台立威', winner: 'ALLY' })
      expect(hero.player.gaibangBranch).toBeUndefined()
      expect(hero.player.sectRank).toBe(2)
      hero.answerGaibangDebate(0)
      expect(hero.player.gaibangBranch).toBeUndefined()
      hero.closeBattleStage()
      expect(hero.gaibangChoicePending).toBe(true)
      expect(hero.player.sectContribution).toBe(contribution)

      hero.challengeSectPromotion('WUYI')
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.player).toMatchObject({ sectRank: 3, gaibangBranch: 'WUYI', sectContribution: contribution + 200 })
      expect(hero.learnedSkills.xiaoyao_you).toBe(1)
      expect(hero.derivedStats.def).toBeGreaterThan(panel.def)
      expect(hero.derivedStats.maxMp).toBeGreaterThan(panel.maxMp)
      expect(hero.player.stats).toEqual(baseline)
      hero.answerGaibangDebate(0)
      expect(hero.player.gaibangBranch).toBe('WUYI')
    } finally {
      hero.closeBattleStage()
    }
  })

  it('净衣论辩答对才晋升，身法和纹银收益实装，君山连胜后一次发放四阶奖励', () => {
    const hero = threeBags()
    const rolls = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const now = Date.now()
    const time = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      hero.player.lastSettleAt = now - 3_600_000
      const speed = hero.derivedStats.speed
      const idle = hero.getIdleRewards(now)
      const contribution = hero.player.sectContribution
      hero.answerGaibangDebate(1)
      expect(hero.player).toMatchObject({ sectRank: 2, sectContribution: contribution })
      expect(hero.gaibangChoicePending).toBe(true)
      hero.answerGaibangDebate(0)
      expect(hero.activeBattle).toBeNull()
      expect(hero.player).toMatchObject({ sectRank: 3, gaibangBranch: 'JINGYI', sectContribution: contribution + 200 })
      expect(hero.derivedStats.speed).toBeGreaterThan(speed)
      const preview = hero.getIdleRewards(now)
      expect(preview).toEqual({ gainedQi: idle.gainedQi, gainedSilver: Math.round(idle.gainedSilver * 1.2) })
      const beforeIdle = hero.player.silver
      hero.settleOfflineQi()
      expect(hero.player.silver - beforeIdle).toBe(preview.gainedSilver)
      const beforeStory = hero.player.silver
      hero.resolveAdventure('B')
      expect(hero.player.silver - beforeStory).toBe(3000)

      const before = hero.player.silver
      hero.challengeSectPromotion()
      const report = hero.activeBattle
      expect(report).toMatchObject({ sceneTitle: '丐帮 · 君山大会', winner: 'ALLY', rewards: { silver: 1800 } })
      expect(report?.units.find((unit) => unit.slot === 'ENEMY_MAIN')?.name).toBe('简长老')
      expect(hero.battleOpponentEntry).toBeUndefined()
      expect(hero.player.sectRank).toBe(3)
      expect(hero.ownedItemIds).not.toContain('jiudai_baina')
      expect(hero.learnedSkills.dagou_bangfa).toBeUndefined()
      expect(hero.learnedSkills.xianglong_sanshi).toBeUndefined()
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.battleOpponentEntry?.unit.name).toBe('梁长老')
      expect(hero.liveUnitStates.ENEMY_MAIN.hp).toBe(0)
      expect(hero.player).toMatchObject({ sectRank: 4, silver: before + 1800, sectContribution: contribution + 400 })
      expect(hero.learnedSkills.dagou_bangfa).toBe(1)
      expect(hero.learnedSkills.xianglong_sanshi).toBe(1)
      expect(hero.ownedItemIds.filter((id) => id === 'jiudai_baina')).toHaveLength(1)
      hero.saveNow()
      const resumed = newStore()
      resumed.continueGame()
      expect(resumed.player).toMatchObject({ gaibangBranch: 'JINGYI', sectRank: 4 })
      expect(resumed.gaibangChoicePending).toBe(false)
      resumed.leaveSect('GRADUATE')
      expect(resumed.player.currentSectId).toBeNull()
      expect(resumed.player.gaibangBranch).toBeUndefined()
      expect(resumed.derivedStats.speed).toBe(speed)
      expect(resumed.learnedSkills.dagou_bangfa).toBe(1)
    } finally {
      time.mockRestore()
      rolls.mockRestore()
      hero.closeBattleStage()
    }
  })

  it('旧档已升四阶时可补选分支，既有阶位和资源保持原数', () => {
    const old = newStore('DEMO')
    old.joinSect('gaibang')
    old.player.sectRank = 4
    const { qiExp, silver, sectContribution } = old.player
    old.saveNow()
    const hero = newStore()
    hero.continueGame()
    expect(hero.gaibangChoicePending).toBe(true)
    expect(hero.learnedSkills.xianglong_sanshi).toBe(1)
    hero.answerGaibangDebate(0)
    expect(hero.player).toMatchObject({ sectRank: 4, gaibangBranch: 'JINGYI', qiExp, silver, sectContribution })
  })

  it('百味终考认可旧菜品并在实地备办余项，洪七公协战后一次发放五阶传承', () => {
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const hero = threeBags()
    try {
      hero.answerGaibangDebate(0)
      hero.challengeSectPromotion()
      hero.skipBattleToEnd()
      hero.closeBattleStage()
      expect(hero.player.sectRank).toBe(4)
      expect(hero.gaibangFinalPending).toBe(true)
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toBeNull()

      hero.feast.cooked.push('jiaohuaji')
      const silver = hero.player.silver
      hero.prepareGaibangDish('jiaohuaji')
      hero.prepareGaibangDish('haoqiu_tang')
      hero.prepareGaibangDish('ershisi_qiao')
      expect(hero.player.silver).toBe(silver)
      hero.prepareGaibangDish('yudi_luomei')
      hero.prepareGaibangDish('yudi_luomei')
      expect(hero.player.silver).toBe(silver - 600)
      expect(hero.gaibangFinalReady).toBe(false)
      hero.moveMap('guiyun_lake')
      expect(hero.player.currentMapId).toBe('jiaxing_suburb')
      hero.player.maxChapterId = 8
      hero.moveMap('guiyun_lake')
      expect(hero.player.currentMapId).toBe('guiyun_lake')
      const beforeTofu = hero.player.silver
      hero.prepareGaibangDish('ershisi_qiao')
      expect(hero.player.silver).toBe(beforeTofu - 500)
      expect(hero.gaibangFinalReady).toBe(true)
      expect(hero.feast.cooked).toEqual(['jiaohuaji'])
      expect(hero.storyFlags).not.toContain(FEAST_TARGET_FLAG)
      hero.saveNow()
      const resumed = newStore()
      resumed.continueGame()
      expect(resumed.gaibangDishes.map((dish) => dish.prepared)).toEqual([true, true, true])

      hero.updateLoadout({ stance: 'TAICHI', rightCompanionId: null })
      const preset = { ...hero.currentLoadout }
      const { qiExp, silver: beforeFight, sectContribution } = hero.player
      hero.challengeSectPromotion()
      const report = hero.activeBattle
      expect(report).toMatchObject({ mode: 'SECT_TRIAL', sceneTitle: '丐帮 · 百味戏老毒物', winner: 'ALLY' })
      expect(report?.units.filter((unit) => unit.id === 'hongqigong')).toMatchObject([{ slot: 'ALLY_LEFT' }])
      expect(report?.units.find((unit) => unit.slot === 'ENEMY_MAIN')).toMatchObject({ name: '西毒·欧阳锋', title: '压鬼岛 · 白驼山主' })
      expect(report?.events.some((event) => event.actorSlot === 'ALLY_LEFT' && event.skillId === 'xianglong_18' && (event.hpDelta ?? 0) < 0)).toBe(true)
      expect(report?.events).toContainEqual(expect.objectContaining({ actorSlot: 'ENEMY_MAIN', round: 3, statusApplied: '蓄力' }))
      expect(report?.events).toContainEqual(expect.objectContaining({ round: 4, effectSourceId: 'taichi_deflect' }))
      expect(hero.player.sectRank).toBe(4)
      expect(hero.ownedItemIds).not.toContain('dagou_stick_true')
      expect(hero.learnedSkills.tianxia_wugou).toBeUndefined()
      hero.closeBattleStage()
      expect(hero.gaibangFinalReady).toBe(true)
      expect(hero.player).toMatchObject({ sectRank: 4, qiExp, silver: beforeFight, sectContribution })
      hero.challengeSectPromotion()
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.player).toMatchObject({ sectRank: 5, qiExp: qiExp + 18000, silver: beforeFight + 1800, sectContribution: sectContribution + 200 })
      expect(hero.learnedSkills).toMatchObject({ xianglong_18: 1, tianxia_wugou: 1 })
      expect(hero.ownedItemIds.filter((id) => id === 'dagou_stick_true')).toHaveLength(1)
      expect(hero.uniqueArtifacts.find((artifact) => artifact.itemId === 'dagou_stick_true')).toMatchObject({ holderNickname: hero.player.nickname, holderSect: '丐帮' })
      expect(hero.marqueeBulletin).toContain(`【真·绿玉打狗棒】现由【${hero.player.nickname}】执掌`)
      expect(hero.storyFlags.filter((flag) => flag === GAIBANG_FINAL_EXAM.completionFlag)).toHaveLength(1)
      expect(hero.currentLoadout).toEqual(preset)
      hero.closeBattleStage()
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toBeNull()
      hero.moveMap('damo_caravan')
      expect(hero.nearbyPlayers.find((nearby) => nearby.id === 'rp_8')).toMatchObject({ holdingUniqueArtifact: undefined })
      hero.saveNow()
      resumed.continueGame()
      expect(resumed.uniqueArtifacts.find((artifact) => artifact.itemId === 'dagou_stick_true')?.holderNickname).toBe(resumed.player.nickname)
    } finally {
      hero.closeBattleStage()
      rng.mockRestore()
    }
  })

  it('旧五阶可补考，失败保留菜品，临时协战与成功补领沿用原阶位和资源', () => {
    const old = newStore('NEW')
    old.joinSect('gaibang')
    Object.assign(old.player, { sectRank: 5, gaibangBranch: 'WUYI' })
    old.learnedSkills.xianglong_18 = 3
    old.feast.cooked.push(...GAIBANG_FINAL_DISHES.map((dish) => dish.id))
    old.saveNow()
    const hero = newStore()
    hero.continueGame()
    const { qiExp, silver, sectContribution } = hero.player
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      expect(hero.gaibangFinalPending).toBe(true)
      expect(hero.gaibangFinalReady).toBe(true)
      hero.challengeSectPromotion()
      expect(hero.activeBattle?.units.filter((unit) => unit.id === 'hongqigong')).toMatchObject([{ slot: 'ALLY_LEFT' }])
      expect(hero.activeBattle?.winner).toBe('ENEMY')
      hero.skipBattleToEnd()
      expect(hero.learnedSkills.tianxia_wugou).toBeUndefined()
      expect(hero.storyFlags).not.toContain(GAIBANG_FINAL_EXAM.completionFlag)
      expect(hero.gaibangFinalReady).toBe(true)
      hero.closeBattleStage()

      boost(hero)
      hero.challengeSectPromotion()
      expect(hero.activeBattle?.winner).toBe('ALLY')
      hero.skipBattleToEnd()
      expect(hero.player).toMatchObject({ sectRank: 5, qiExp, silver, sectContribution })
      expect(hero.learnedSkills).toMatchObject({ xianglong_sanshi: 1, xianglong_18: 3, tianxia_wugou: 1 })
      expect(hero.ownedItemIds).toContain('dagou_stick_true')
      expect(hero.companionAffinity.hongqigong.recruited).toBe(false)
      expect(hero.currentLoadout.leftCompanionId).toBeNull()
      expect(hero.gaibangFinalPending).toBe(false)
    } finally {
      hero.closeBattleStage()
      rng.mockRestore()
    }
  })
})

describe('门派晋升专属考核', () => {
  it('缺少已招募伙伴的联机阵容仍可获得考核指定的临时阵位，并按实际佩饰发贡献', () => {
    const starter = createStarterCharacter({ id: 'sect-trial', nickname: '考核侠客', avatarId: 'hero_sword' }, Date.now())
    const sect = SECTS.find(({ id }) => id === 'quanzhen')!
    const player = { ...starter.player, currentSectId: sect.id, sectRank: 4, stats: { ...starter.player.stats, str: 3000, con: 1500 } }
    const loadout = { ...starter.presets[1], accId: 'taihu_shuizhai_acc', leftCompanionId: null, rightCompanionId: null }
    const promotion = sectPromotion(sect, player, [])
    const report = simulateSectTrial(sect, promotion, { player, loadout, companionOf: () => undefined, rng: () => 0.99 }, Date.now())
    expect(report.winner).toBe('ALLY')
    expect(report.units.filter(({ slot }) => slot.startsWith('ALLY')).map(({ id }) => id).sort())
      .toEqual(['sect-trial', 'qiuchuji', 'mayu', ...QUANZHEN_GUARD_EXAM.formation.reserves.map(({ id }) => id)].sort())
    expect(report.units.find(({ slot }) => slot === 'ALLY_ESCORT_LEFT')?.id).toBe('wangchuyi')
    expect(report.rewards).toMatchObject({ qiExp: 18000, sectContrib: 240 })
    const old = { ...player, sectRank: 5 }
    expect(sectPromotion(sect, old, []).available).toBe(true)
    expect(sectPromotion(sect, old, [promotion.exam!.completionFlag!]).available).toBe(false)
    expect(sectExamBlockReason(TAOHUA_FINAL_EXAM, 1500, { ...loadout, leftCompanionId: 'qiuchuji', rightCompanionId: 'mayu' },
      () => false, true)).toContain('已入队伙伴')
  })

  it('丐帮胜利回放结算后升阶授武，重试和重复结算只发一次', () => {
    const hero = newStore('DEMO')
    hero.joinSect('gaibang')
    expect(hero.player.currentSectId).toBe('gaibang')
    const { qiExp, silver, sectContribution } = hero.player
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toMatchObject({ mode: 'SECT_TRIAL', sceneTitle: '丐帮 · 捉拿采花贼', winner: 'ALLY' })
      expect(hero.player.sectRank).toBe(1)
      expect(hero.learnedSkills.fengmo_zhang).toBeUndefined()
      const report = hero.activeBattle
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toBe(report)
      hero.closeBattleStage()
      expect(hero.player).toMatchObject({ sectRank: 1, qiExp, silver, sectContribution })

      hero.challengeSectPromotion()
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.player).toMatchObject({ sectRank: 2, qiExp: qiExp + 4500, silver: silver + 1500, sectContribution: sectContribution + 200 })
      expect(hero.learnedSkills.fengmo_zhang).toBe(1)
      hero.saveNow()
      const resumed = newStore()
      resumed.continueGame()
      expect(resumed.player).toMatchObject({ sectRank: 2, currentSectId: 'gaibang', sectContribution: sectContribution + 200 })
      expect(resumed.learnedSkills.fengmo_zhang).toBe(1)
    } finally {
      rng.mockRestore()
      hero.closeBattleStage()
    }
  })

  it('丐帮弱配超时即使主角存活也没有升阶奖励', () => {
    const hero = newStore('NEW')
    hero.joinSect('gaibang')
    const { qiExp, silver, sectContribution } = hero.player
    try {
      hero.challengeSectPromotion()
      expect(hero.activeBattle?.winner).toBe('ENEMY')
      expect(hero.activeBattle?.events.at(-1)).toMatchObject({ round: 3, segments: [{ text: '3 回合内未击倒采花贼' }] })
      hero.skipBattleToEnd()
      expect(hero.liveUnitStates.ALLY_MAIN.hp).toBeGreaterThan(0)
      expect(hero.player).toMatchObject({ sectRank: 1, qiExp, silver, sectContribution })
      expect(hero.learnedSkills.fengmo_zhang).toBeUndefined()
    } finally {
      hero.closeBattleStage()
    }
  })

  it('桃花岛卸械、归云庄奇门困阵与冯氏墓前守八回合依次晋升', () => {
    const hero = newStore('DEMO')
    hero.joinSect('taohua')
    expect(hero.player.currentSectId).toBe('taohua')
    hero.updateLoadout({ stance: 'AGILE', outerSkillId: 'luoying_zhang', ultSkillId: null })
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toMatchObject({ sceneTitle: '东海桃花岛 · 哑仆试剑', winner: 'ALLY' })
      expect(hero.activeBattle?.events.find((event) => event.statusApplied === '缴械')).toMatchObject({ targetSlot: 'ENEMY_MAIN', round: 1 })
      expect(hero.learnedSkills.lanhua_fuxue).toBeUndefined()
      hero.skipBattleToEnd()
      expect(hero.liveUnitStates.ENEMY_MAIN.hp).toBeGreaterThan(0)
      expect(hero.player.sectRank).toBe(2)
      expect(hero.learnedSkills.lanhua_fuxue).toBe(1)
      hero.closeBattleStage()

      hero.updateLoadout({ stance: 'FIERCE' })
      expect(hero.sectPromotionBlockReason).toContain('奇门')
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toBeNull()
      hero.updateLoadout({ stance: 'AGILE' })
      const preset = { ...hero.currentLoadout }
      hero.challengeSectPromotion()
      const rescue = hero.activeBattle
      expect(rescue).toMatchObject({ sceneTitle: '东海桃花岛 · 归云庄救师兄', winner: 'ALLY' })
      expect(rescue?.units).toContainEqual(expect.objectContaining({ slot: 'ALLY_LEFT', id: 'luchengfeng' }))
      expect(rescue?.events.filter((event) => event.effectSourceId === 'taohua_wuxing' && event.statusApplied)).toMatchObject([
        { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_LEFT', round: 1, statusApplied: '心神混乱', statusRounds: 2 },
        { actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_RIGHT', round: 1, statusApplied: '心神混乱', statusRounds: 2 },
      ])
      expect(rescue?.events.some((event) => event.actorSlot === 'ALLY_LEFT' && event.skillId === 'luoying_zhang' && (event.hpDelta ?? 0) < 0)).toBe(true)
      expect(hero.learnedSkills.yuxiao_jianfa).toBeUndefined()
      hero.skipBattleToEnd()
      expect(hero.player.sectRank).toBe(3)
      expect(hero.learnedSkills).toMatchObject({ yuxiao_jianfa: 1, qimen_wuzhuan: 1 })
      expect(hero.companionAffinity.luchengfeng.recruited).toBe(false)
      expect(hero.currentLoadout).toEqual(preset)
      hero.closeBattleStage()
      hero.player.stats.con = 40
      hero.updateLoadout({ stance: 'TAICHI', outerSkillId: 'yuenv_jian', leftCompanionId: null })
      rng.mockReturnValue(0)
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toMatchObject({ sceneTitle: '东海桃花岛 · 冯氏墓前', winner: 'ENEMY' })
      expect(hero.activeBattle?.events.at(-1)).toMatchObject({ round: 3, segments: [{ text: '第 3 回合心神混乱，考核失败' }] })
      hero.skipBattleToEnd()
      expect(hero.player.sectRank).toBe(3)
      expect(hero.learnedSkills.tanzhi_shentong).toBeUndefined()
      hero.closeBattleStage()

      hero.updateLoadout({ leftCompanionId: 'zhoubotong' })
      hero.challengeSectPromotion()
      expect(hero.activeBattle?.winner).toBe('ALLY')
      expect(hero.activeBattle?.events.filter((event) => event.effectSourceId === 'zhoubotong' &&
        event.segments.some((segment) => segment.type === 'tag' && segment.text.includes('化解碧海潮生曲'))).map(({ round }) => round)).toEqual([3, 6])
      expect(hero.activeBattle?.events.at(-1)).toMatchObject({ round: 8, segments: [{ text: '撑过 8 回合，心神不乱' }] })
      hero.skipBattleToEnd()
      expect(hero.player.sectRank).toBe(4)
      expect(hero.learnedSkills.tanzhi_shentong).toBe(1)
      expect(hero.learnedSkills.xuanfeng_saoye_tui).toBe(1)
    } finally {
      rng.mockRestore()
      hero.closeBattleStage()
    }
  })

  it('烟雨楼需两位已入队伙伴，七人两阵延续气血且连胜才授武赠箫', () => {
    const old = newStore('DEMO')
    old.joinSect('taohua')
    old.player.sectRank = 4
    old.saveNow()
    const hero = newStore()
    hero.continueGame()
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      expect(hero.learnedSkills).toMatchObject({ yuxiao_jianfa: 1, qimen_wuzhuan: 1, xuanfeng_saoye_tui: 1 })
      hero.updateLoadout({ stance: 'AGILE', outerSkillId: 'yuxiao_jianfa', lightSkillId: 'qimen_wuzhuan', rightCompanionId: null })
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toBeNull()
      expect(hero.sectPromotionBlockReason).toContain('已入队伙伴')
      hero.updateLoadout({ rightCompanionId: 'luchengfeng' })
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toBeNull()
      hero.updateLoadout({ rightCompanionId: 'huangrong' })

      const { qiExp, silver, sectContribution } = hero.player
      hero.challengeSectPromotion()
      const report = hero.activeBattle!
      expect(report).toMatchObject({ sceneTitle: '东海桃花岛 · 烟雨楼独抗群雄', winner: 'ALLY' })
      const firstWave = report.units.filter((unit) => unit.slot.startsWith('ENEMY'))
      expect(firstWave.map((unit) => unit.name)).toEqual(['丹阳子·马钰', '长春子·丘处机', '长真子·谭处端', '长生子·刘处玄'])
      const secondIndex = report.events.findIndex((event) => event.opponentEntry)
      expect(secondIndex).toBeGreaterThan(0)
      const secondWave = report.events[secondIndex].opponentEntry!
      expect(secondWave.unit.name).toBe('玉阳子·王处一')
      expect(secondWave.guards?.map((unit) => unit.name)).toEqual(['广宁子·郝大通', '清静散人·孙不二'])
      const firstEvents = report.events.slice(0, secondIndex)
      for (const unit of firstWave) {
        expect(firstEvents.some((event) => event.actorSlot === unit.slot && event.type === 'SKILL_CAST')).toBe(true)
        const lost = firstEvents.filter((event) => event.targetSlot === unit.slot).reduce((sum, event) => sum - (event.hpDelta ?? 0), 0)
        expect(lost).toBe(unit.hp)
      }
      const lead = report.units.find((unit) => unit.slot === 'ALLY_MAIN')!
      const carriedHp = firstEvents.reduce((hp, event) => event.targetSlot === lead.slot
        ? Math.max(0, Math.min(lead.maxHp, hp + (event.hpDelta ?? 0))) : hp, lead.hp)
      expect(carriedHp).toBeLessThan(lead.hp)
      expect(report.events[secondIndex].segments[1]).toMatchObject({ text: expect.stringContaining(`延续气血 ${carriedHp.toLocaleString()}`) })
      expect(report.events.filter((event) => event.statusRemoved === '天罡北斗阵')).toHaveLength(2)
      expect(report.events.slice(secondIndex).some((event) => event.actorSlot === 'ENEMY_REAR' || event.targetSlot === 'ENEMY_REAR')).toBe(false)
      expect(hero.player.sectRank).toBe(4)
      expect(hero.ownedItemIds).not.toContain('biyu_xiao')
      expect(hero.learnedSkills.jiuyin_taohua).toBeUndefined()
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.battleUnits.filter((unit) => unit.slot.startsWith('ENEMY')).map((unit) => unit.name))
        .toEqual(['玉阳子·王处一', '广宁子·郝大通', '清静散人·孙不二'])
      expect(hero.liveUnitStates.ENEMY_REAR).toBeUndefined()
      expect(['ENEMY_LEFT', 'ENEMY_MAIN', 'ENEMY_RIGHT'].map((slot) => hero.liveUnitStates[slot].hp)).toEqual([0, 0, 0])
      expect(hero.player).toMatchObject({ sectRank: 5, qiExp: qiExp + 18000, silver: silver + 1500, sectContribution: sectContribution + 200 })
      expect(hero.learnedSkills).toMatchObject({ bihai_chaosheng: 1, jiuyin_taohua: 1 })
      expect(hero.ownedItemIds.filter((id) => id === 'biyu_xiao')).toHaveLength(1)
      expect(hero.storyFlags).toContain(TAOHUA_FINAL_EXAM.completionFlag)
    } finally {
      hero.closeBattleStage()
      rng.mockRestore()
    }
  })

  it('桃花岛旧五阶通过烟雨楼补领传承，读档后已完成的考核关闭', () => {
    const old = newStore('DEMO')
    old.joinSect('taohua')
    old.player.sectRank = 5
    old.learnedSkills.bihai_chaosheng = 3
    old.saveNow()
    const hero = newStore()
    hero.continueGame()
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const { qiExp, silver, sectContribution } = hero.player
    try {
      hero.updateLoadout({ stance: 'AGILE' })
      expect(hero.sectPromotionExam?.title).toBe('烟雨楼独抗群雄')
      hero.challengeSectPromotion()
      expect(hero.activeBattle?.winner).toBe('ALLY')
      hero.skipBattleToEnd()
      expect(hero.player).toMatchObject({ sectRank: 5, qiExp, silver, sectContribution })
      expect(hero.learnedSkills).toMatchObject({ bihai_chaosheng: 3, jiuyin_taohua: 1 })
      expect(hero.ownedItemIds).toContain('biyu_xiao')
      hero.saveNow()
      const resumed = newStore()
      resumed.continueGame()
      expect(resumed.sectPromotionExam).toBeUndefined()
      expect(resumed.ownedItemIds).toContain('biyu_xiao')
    } finally {
      hero.closeBattleStage()
      rng.mockRestore()
    }
  })
})

describe('试玩少室山三人副本', () => {
  it('从结义入口读取实际三人阵容，通关后逐胜发放秘宝与货币', () => {
    const hero = newStore('DEMO')
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const { qiExp, silver } = hero.player
    try {
      for (const [index, relic] of ['wumu_yishu', 'xiaoao_qupu'].entries()) {
        hero.startThreePlayerCoopRaid()
        const report = hero.activeBattle!
        expect(report).toMatchObject({ mode: 'COOP_3P', sceneTitle: '少室山 · 金刚伏魔圈', winner: 'ALLY' })
        expect(report.units.filter((unit) => unit.isPlayer).map((unit) => unit.name)).toEqual([hero.player.nickname, '乔北冥', '清风道长'])
        expect(report.events.some((event) => event.actorSlot === 'ALLY_LEFT' && event.skillId === 'dagou_bangfa')).toBe(true)
        expect(report.events.some((event) => event.actorSlot === 'ALLY_RIGHT' && event.skillId === 'quanzhen_jianfa')).toBe(true)
        for (const unit of report.units.filter((unit) => unit.slot.startsWith('ENEMY'))) {
          expect(unit.hp + report.events.reduce((total, event) => total + (event.targetSlot === unit.slot ? event.hpDelta ?? 0 : 0), 0)).toBe(0)
        }
        expect(hero.ownedItemIds).not.toContain(relic)
        hero.skipBattleToEnd()
        hero.skipBattleToEnd()
        expect(hero.ownedItemIds.filter((id) => id === relic)).toHaveLength(1)
        expect(hero.player).toMatchObject({ qiExp: qiExp + 18500 * (index + 1), silver: silver + 5200 * (index + 1) })
        hero.closeBattleStage()
      }
    } finally {
      hero.closeBattleStage()
      rng.mockRestore()
    }
  })
})

describe('白驼五阶逆转经脉', () => {
  it('基础根骨达标才可开考，独自撑过五轮并完成回放才晋升授武', () => {
    const hero = newStore('DEMO')
    hero.player.stats.karma = 0
    hero.player.stats.con = 64
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      hero.joinSect('baituo')
      for (const rank of [2, 3, 4]) {
        hero.challengeSectPromotion()
        hero.skipBattleToEnd()
        hero.closeBattleStage()
        expect(hero.player.sectRank).toBe(rank)
      }
      expect(hero.sectPromotionBlockReason).toContain('65')
      hero.challengeSectPromotion()
      expect(hero.activeBattle).toBeNull()

      hero.player.stats.con = 65
      const preset = { ...hero.currentLoadout }
      const { qiExp, silver, sectContribution } = hero.player
      hero.challengeSectPromotion()
      const report = hero.activeBattle!
      expect(report).toMatchObject({ sceneTitle: '西域白驼山庄 · 逆转经脉', winner: 'ALLY' })
      expect(report.units.filter((unit) => unit.slot.startsWith('ALLY')).map((unit) => unit.slot)).toEqual(['ALLY_MAIN'])
      expect(report.events.filter((event) => event.effectSourceId === 'baituo_meridian_trial').map((event) => event.hpDelta))
        .toEqual([-900, -1100, -1300, -1500, -1700])
      hero.closeBattleStage()
      expect(hero.learnedSkills.nijiuyin_hama_gong).toBeUndefined()
      expect(hero.player).toMatchObject({ sectRank: 4, qiExp, silver, sectContribution })

      hero.challengeSectPromotion()
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.player).toMatchObject({ sectRank: 5, qiExp: qiExp + 18000, silver: silver + 1500, sectContribution: sectContribution + 200 })
      expect(hero.learnedSkills).toMatchObject({ nijiuyin_hama_gong: 1, nizhuan_jiuyin: 1 })
      expect(hero.sectPromotionExam).toBeUndefined()
      expect(hero.currentLoadout).toEqual(preset)
    } finally {
      hero.closeBattleStage()
      rng.mockRestore()
    }
  })

  it('旧五阶读档后可补考领取蛤蟆功，保留逆转九阴重数', () => {
    const old = newStore('DEMO')
    old.player.stats.karma = 0
    old.player.stats.con = 65
    old.joinSect('baituo')
    old.player.sectRank = 5
    old.learnedSkills.nizhuan_jiuyin = 3
    old.saveNow()
    const hero = newStore()
    hero.continueGame()
    const { qiExp, silver, sectContribution } = hero.player
    try {
      expect(hero.sectPromotionExam?.title).toBe('逆转经脉')
      hero.challengeSectPromotion()
      expect(hero.activeBattle?.winner).toBe('ALLY')
      hero.skipBattleToEnd()
      expect(hero.player).toMatchObject({ sectRank: 5, qiExp, silver, sectContribution })
      expect(hero.learnedSkills).toMatchObject({ nijiuyin_hama_gong: 1, nizhuan_jiuyin: 3 })
      hero.saveNow()
      const resumed = newStore()
      resumed.continueGame()
      expect(resumed.sectPromotionExam).toBeUndefined()
      expect(resumed.learnedSkills.nijiuyin_hama_gong).toBe(1)
    } finally {
      hero.closeBattleStage()
    }
  })
})

describe('全真终考与七子入队', () => {
  it('全真四阶从门派页守阵，六位全真子临时列阵，胜利结算一次先天功', () => {
    const hero = newStore('DEMO')
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      hero.joinSect('quanzhen')
      for (const rank of [2, 3, 4]) {
        hero.challengeSectPromotion()
        hero.skipBattleToEnd()
        hero.closeBattleStage()
        expect(hero.player.sectRank).toBe(rank)
      }
      hero.updateLoadout({ stance: 'TAICHI' })
      const preset = { ...hero.currentLoadout }
      const { qiExp, silver, sectContribution } = hero.player
      hero.challengeSectPromotion()
      const report = hero.activeBattle!
      expect(report).toMatchObject({ sceneTitle: '终南全真教 · 天罡北斗大阵', winner: 'ALLY' })
      expect(report.units.filter((unit) => unit.slot.startsWith('ALLY') && !unit.isPlayer).map((unit) => unit.id).sort())
        .toEqual(QUANZHEN_SEVEN_IDS.filter((id) => id !== 'sunbuer').sort())
      expect(hero.learnedSkills.xiantian_gong).toBeUndefined()
      hero.closeBattleStage()
      expect(hero.player).toMatchObject({ sectRank: 4, qiExp, silver, sectContribution })
      hero.challengeSectPromotion()
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.player).toMatchObject({ sectRank: 5, qiExp: qiExp + 18000, silver: silver + 1500, sectContribution: sectContribution + 200 })
      expect(hero.learnedSkills.xiantian_gong).toBe(1)
      expect(hero.storyFlags).toContain(QUANZHEN_GUARD_EXAM.completionFlag)
      expect(hero.currentLoadout).toEqual(preset)
      expect(hero.companionAffinity.qiuchuji.recruited).toBe(false)
      expect(hero.companionAffinity.liuchuxuan.recruited).toBe(false)
    } finally {
      hero.closeBattleStage()
      rng.mockRestore()
    }
  })

  it('历练 28 告捷后才补齐未入队成员，七人档作用于实际面板和修行', () => {
    const hero = newStore('DEMO')
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      boost(hero)
      hero.updateLoadout({ stance: 'AGILE' })
      Object.assign(hero.trial, { selectedStageId: 28, maxStageId: 28, lastPatrolAt: Date.now() })
      hero.trial.stageHours['28'] = TRIAL_PATROL_HOURS[28]
      Object.assign(hero.companionAffinity.qiuchuji, { recruited: true, affinity: 670, met: true, tokens: 11, taught: true })
      Object.assign(hero.companionAffinity.liuchuxuan, { affinity: 137, met: true })
      const stats = { ...hero.derivedStats }
      const idle = hero.effectiveQiPerHour
      hero.challengeTrialStage(28)
      expect(hero.activeBattle?.winner).toBe('ALLY')
      expect(hero.activeBattle?.rewards?.companions).toEqual(QUANZHEN_SEVEN_IDS.filter((id) => id !== 'qiuchuji'))
      expect(hero.companionAffinity.liuchuxuan.recruited).toBe(false)
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.companionAffinity.liuchuxuan).toMatchObject({ recruited: true, met: true, affinity: 137 })
      expect(hero.companionAffinity.haodatong).toMatchObject({ recruited: true, met: true, affinity: 100 })
      expect(hero.companionAffinity.qiuchuji).toMatchObject({ affinity: 670, tokens: 11, taught: true })
      expect(hero.setBonusStates.find(({ set }) => set.id === 'quanzhen_qizi')).toMatchObject({
        owned: 7, tier: { count: 7, hpPct: 10, atkPct: 8, idleQiPct: 30 },
      })
      expect(hero.derivedStats.maxHp).toBeGreaterThan(stats.maxHp)
      expect(hero.derivedStats.atk).toBeGreaterThan(stats.atk)
      expect(hero.effectiveQiPerHour).toBeGreaterThan(idle)
      hero.closeBattleStage()
      hero.trial.stageHours['28'] = TRIAL_PATROL_HOURS[28]
      hero.challengeTrialStage(28)
      expect(hero.activeBattle?.rewards).toBeUndefined()
    } finally {
      hero.closeBattleStage()
      rng.mockRestore()
    }
  })

  it('旧历练通关档读档补齐七子，沿用已领资源和原有好感', () => {
    const old = newStore('DEMO')
    old.trial.rewardedStageIds.push(28)
    old.companionAffinity.mayu.affinity = 254
    const { qiExp, silver } = old.player
    old.saveNow()
    const hero = newStore()
    hero.continueGame()
    expect(hero.player).toMatchObject({ qiExp, silver })
    expect(hero.trial.rewardedStageIds).toEqual([28])
    expect(hero.companionAffinity.mayu).toMatchObject({ affinity: 254, met: true, recruited: true })
    expect(QUANZHEN_SEVEN_IDS.every((id) => hero.companionAffinity[id].recruited)).toBe(true)
  })
})

describe('铁枪庙旧事护送', () => {
  function approachTemple() {
    const hero = newStore('DEMO')
    hero.resolveAdventure('B')
    expect(playNode(hero, 5)).toBe('ALLY')
    expect(hero.pendingAdventure?.templateId).toBe('tieqiangmiao')
    return hero
  }

  it('保留原阵容，护送完成结算后才发枪谱与好感，读档后保留结果', () => {
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const hero = approachTemple()
    try {
      const karma = hero.player.stats.karma
      const affinity = hero.companionAffinity.munianci.affinity
      const loadout = { ...hero.currentLoadout }
      hero.resolveAdventure('A')
      expect(hero.activeBattle).toMatchObject({ sceneTitle: '铁枪庙旧事', winner: 'ALLY' })
      expect(hero.activeBattle?.units).toEqual(expect.arrayContaining([
        expect.objectContaining({ slot: 'ALLY_LEFT', id: loadout.leftCompanionId }),
        expect.objectContaining({ slot: 'ALLY_RIGHT', id: loadout.rightCompanionId }),
        expect.objectContaining({ slot: 'ALLY_ESCORT_LEFT', name: '杨铁心', hp: 950, maxHp: 1800 }),
        expect.objectContaining({ slot: 'ALLY_ESCORT_RIGHT', name: '包惜弱', hp: 850, maxHp: 1550 }),
      ]))
      expect(hero.activeBattle?.events.at(-1)?.segments[0]).toMatchObject({ text: expect.stringContaining('杨铁心、包惜弱脱险') })
      expect(hero.ownedItemIds).not.toContain('yangjia_spear')
      expect(hero.learnedSkills.yangjia_qiang).toBeUndefined()
      expect(hero.player.stats.karma).toBe(karma)
      expect(hero.companionAffinity.yangtiexin.recruited).toBe(false)

      hero.closeBattleStage()
      expect(hero.pendingAdventure?.templateId).toBe('tieqiangmiao')
      expect(hero.resolvedAdventureIds).not.toContain('tieqiangmiao')
      hero.resolveAdventure('A')
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.currentLoadout).toEqual(loadout)
      expect(hero.player.maxChapterId).toBe(6)
      expect(hero.player.stats.karma).toBe(karma + 40)
      expect(hero.companionAffinity.munianci.affinity).toBe(affinity + 200)
      expect(hero.companionAffinity.yangtiexin.recruited).toBe(true)
      expect(hero.ownedItemIds.filter((id) => id === 'yangjia_spear')).toHaveLength(1)
      expect(hero.learnedSkills.yangjia_qiang).toBe(1)
      expect(hero.liveUnitStates.ALLY_ESCORT_LEFT.hp).toBeGreaterThan(0)
      expect(hero.liveUnitStates.ALLY_ESCORT_RIGHT.hp).toBeGreaterThan(0)
      expect(hero.resolvedAdventureIds.filter((id) => id === 'tieqiangmiao')).toHaveLength(1)
      hero.saveNow()
      const resumed = newStore()
      resumed.continueGame()
      expect(resumed.resolvedAdventureIds).toContain('tieqiangmiao')
      expect(resumed.pendingAdventure?.templateId).not.toBe('tieqiangmiao')
      expect(resumed.ownedItemIds.filter((id) => id === 'yangjia_spear')).toHaveLength(1)
    } finally {
      rng.mockRestore()
      hero.closeBattleStage()
    }
  })

  it('两名追兵分别实扣两人气血，护送目标倒下时主角存活仍判负', () => {
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const hero = approachTemple()
    try {
      hero.player.level = 12
      hero.player.realmTier = 1
      Object.assign(hero.player.stats, { str: 10, con: 24, agi: 0, intStat: 10, karma: 0 })
      hero.updateLoadout({
        stance: 'FIERCE', innerSkillId: null, outerSkillId: null, lightSkillId: null, ultSkillId: null,
        leftCompanionId: null, rightCompanionId: null, weaponId: null, armorId: null, headId: null,
        wristId: null, beltId: null, bootsId: null, accId: null, relicBookId: null,
      })
      expect(hero.pendingAdventure?.options[0].canSelect).toBe(false)
      hero.resolveAdventure('A')
      expect(hero.activeBattle).toBeNull()
      hero.player.stats.con = 25
      hero.resolveAdventure('A')
      expect(hero.activeBattle?.winner).toBe('ENEMY')
      expect(hero.activeBattle?.events.find((event) => event.actorSlot === 'ENEMY_LEFT' && event.hpDelta)).toMatchObject({
        round: 1, targetSlot: 'ALLY_ESCORT_LEFT', hpDelta: -227,
      })
      expect(hero.activeBattle?.events.filter((event) => event.actorSlot === 'ENEMY_RIGHT' && event.hpDelta)).toMatchObject([
        { round: 1, targetSlot: 'ALLY_ESCORT_RIGHT', hpDelta: -225 },
        { round: 2, targetSlot: 'ALLY_ESCORT_RIGHT', hpDelta: -225 },
        { round: 3, targetSlot: 'ALLY_ESCORT_RIGHT', hpDelta: -225 },
        { round: 4, targetSlot: 'ALLY_ESCORT_RIGHT', hpDelta: -175 },
      ])
      expect(hero.activeBattle?.events.at(-1)).toMatchObject({
        round: 4, targetSlot: 'ALLY_ESCORT_RIGHT', segments: [{ type: 'tag', text: '包惜弱气血耗尽，护送失败' }],
      })
      hero.resolveAdventure('B')
      expect(hero.player.stats.karma).toBe(0)
      hero.skipBattleToEnd()
      expect(hero.liveUnitStates.ALLY_MAIN.hp).toBeGreaterThan(0)
      expect(hero.liveUnitStates.ALLY_ESCORT_LEFT.hp).toBe(42)
      expect(hero.liveUnitStates.ALLY_ESCORT_RIGHT.hp).toBe(0)
      expect(hero.pendingAdventure?.templateId).toBe('tieqiangmiao')
      expect(hero.ownedItemIds).not.toContain('yangjia_spear')
      expect(hero.learnedSkills.yangjia_qiang).toBeUndefined()
      expect(hero.companionAffinity.yangtiexin.recruited).toBe(false)
      hero.closeBattleStage()
      hero.resolveAdventure('B')
      expect(hero.resolvedAdventureIds).toContain('tieqiangmiao')
      expect(hero.player.stats.karma).toBe(20)
    } finally {
      rng.mockRestore()
      hero.closeBattleStage()
    }
  })
})

describe('黄河四鬼与金刀驸马的奇遇出战', () => {
  it('从比武招亲解锁悬赏，四鬼各自出手，全部击退后才领丐帮引荐信', () => {
    const hero = newStore('DEMO')
    hero.resolveAdventure('B')
    expect(playNode(hero, 4)).toBe('ALLY')
    expect(hero.pendingAdventure?.templateId).toBe('huanghe_sigui')
    hero.player.level = 16
    hero.player.realmTier = 2
    Object.assign(hero.player.stats, { str: 29, con: 29, agi: 25, intStat: 20, karma: 0 })
    hero.updateLoadout({ weaponId: null, outerSkillId: null, ultSkillId: null, leftCompanionId: null })
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const silver = hero.player.silver
      const qiExp = hero.player.qiExp
      hero.resolveAdventure('A')
      expect(hero.activeBattle).toMatchObject({ sceneTitle: '黄河四鬼的悬赏', winner: 'ALLY' })
      const ghosts = hero.activeBattle?.units.filter((unit) => unit.slot.startsWith('ENEMY')) ?? []
      expect(ghosts.map(({ name }) => name)).toEqual(['追命枪·吴青烈', '断魂刀·沈青刚', '夺魄鞭·马青雄', '丧门斧·钱青健'])
      const casts = hero.activeBattle?.events.filter((event) => event.type === 'SKILL_CAST').map(({ actorSlot }) => actorSlot)
      expect(casts).toEqual(expect.arrayContaining(ghosts.map(({ slot }) => slot)))
      expect(hero.activeBattle?.events.find((event) => event.statusApplied === '枪法大乱')).toMatchObject({ targetSlot: 'ENEMY_LEFT' })
      expect(hero.storyFlags).not.toContain('gaibang_letter')
      expect(hero.player.silver).toBe(silver)
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      for (const { slot } of ghosts) expect(hero.liveUnitStates[slot].hp).toBe(0)
      expect(hero.storyFlags).toContain('gaibang_letter')
      expect(hero.player).toMatchObject({ silver: silver + 3200, qiExp: qiExp + 1800, stats: { karma: 15 } })
      expect(hero.resolvedAdventureIds.filter((id) => id === 'huanghe_sigui')).toHaveLength(1)
    } finally {
      rng.mockRestore()
      hero.closeBattleStage()
    }
  })

  function approachCamp() {
    const hero = newStore('DEMO')
    hero.resolveAdventure('B')
    hero.player.maxChapterId = 14
    boost(hero)
    expect(playNode(hero, 14)).toBe('ALLY')
    expect(hero.pendingAdventure?.templateId).toBe('jindao_fuma')
    return hero
  }

  it('金帐出战沿用蓄力和太极化解，战胜骑兵后发金刀', () => {
    const hero = approachCamp()
    hero.player.level = 62
    Object.assign(hero.player.stats, { str: 90, con: 95, agi: 70, intStat: 53, karma: 0 })
    hero.updateLoadout({ stance: 'TAICHI', outerSkillId: 'yuenv_jian', ultSkillId: null })
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const silver = hero.player.silver
      hero.resolveAdventure('A')
      expect(hero.activeBattle).toMatchObject({ sceneTitle: '金刀驸马', winner: 'ALLY' })
      expect(hero.activeBattle?.units.filter((unit) => unit.slot.startsWith('ENEMY')).map(({ name }) => name))
        .toEqual(['克烈长枪骑兵', '桑昆', '克烈弓骑兵'])
      expect(hero.activeBattle?.events.find((event) => event.effectSourceId === 'taichi_deflect')).toMatchObject({
        round: 3, actorSlot: 'ALLY_MAIN', targetSlot: 'ENEMY_MAIN', segments: [{ text: '太极借力 · 化解骑阵合围' }],
      })
      expect(hero.ownedItemIds).not.toContain('dadiao_jindao')
      hero.skipBattleToEnd()
      hero.skipBattleToEnd()
      expect(hero.ownedItemIds.filter((id) => id === 'dadiao_jindao')).toHaveLength(1)
      expect(hero.player).toMatchObject({ silver: silver + 6000, stats: { karma: 40 } })
      expect(hero.resolvedAdventureIds.filter((id) => id === 'jindao_fuma')).toHaveLength(1)
    } finally {
      rng.mockRestore()
      hero.closeBattleStage()
    }
  })

  it('未击退桑昆时保留奇遇，仍可选回中原', () => {
    const hero = approachCamp()
    hero.player.level = 1
    hero.player.realmTier = 1
    Object.assign(hero.player.stats, { str: 10, con: 10, agi: 0, intStat: 10, karma: 0 })
    hero.updateLoadout({ leftCompanionId: null, rightCompanionId: null })
    try {
      const silver = hero.player.silver
      const qiExp = hero.player.qiExp
      hero.resolveAdventure('A')
      expect(hero.activeBattle?.winner).toBe('ENEMY')
      hero.skipBattleToEnd()
      expect(hero.player.silver).toBe(silver)
      expect(hero.ownedItemIds).not.toContain('dadiao_jindao')
      expect(hero.pendingAdventure?.templateId).toBe('jindao_fuma')
      hero.closeBattleStage()
      hero.resolveAdventure('B')
      expect(hero.resolvedAdventureIds).toContain('jindao_fuma')
      expect(hero.player.qiExp).toBe(qiExp + 8000)
      expect(hero.player.stats.karma).toBe(0)
    } finally {
      hero.closeBattleStage()
    }
  })
})

describe('一灯大师的慈悲守战', () => {
  function approachHut() {
    const hero = newStore('DEMO')
    hero.resolveAdventure('B')
    hero.player.maxChapterId = 13
    boost(hero)
    expect(playNode(hero, 13)).toBe('ALLY')
    expect(hero.pendingAdventure?.templateId).toBe('yideng_cibei')
    hero.updateLoadout({
      stance: 'TAICHI', innerSkillId: null, outerSkillId: null, lightSkillId: null, ultSkillId: null,
      leftCompanionId: null, rightCompanionId: null, weaponId: null, armorId: null, headId: null,
      wristId: null, beltId: null, bootsId: null, accId: null, relicBookId: null,
    })
    return hero
  }

  it('撑过第五回合后才发放乾阳篇、枯荣禅功和侠义', () => {
    const hero = approachHut()
    hero.player.level = 48
    hero.player.realmTier = 3
    Object.assign(hero.player.stats, { str: 18, con: 120, agi: 0, intStat: 16, karma: 0 })
    const mastery = hero.learnedSkills.yiyang_zhi
    hero.resolveAdventure('A')
    expect(hero.resolvedAdventureIds).not.toContain('yideng_cibei')
    expect(hero.learnedSkills.yiyang_zhi).toBe(mastery)
    expect(hero.player.stats.karma).toBe(0)
    expect(hero.activeBattle).toMatchObject({ winner: 'ALLY', sceneTitle: '一灯大师的慈悲' })
    expect(hero.activeBattle?.events.at(-1)).toMatchObject({
      round: 5, effectSourceId: 'yideng_cibei', segments: [{ type: 'tag', text: '一灯大师的慈悲 · 已撑过 5 回合' }],
    })
    hero.skipBattleToEnd()
    hero.skipBattleToEnd()
    expect(hero.storyFlags).toContain('yideng_mercy')
    expect(hero.learnedSkills.kurong_chan).toBeGreaterThan(0)
    expect(hero.learnedSkills.yiyang_zhi).toBe(mastery + 3)
    expect(hero.player.stats.karma).toBe(60)
    expect(hero.resolvedAdventureIds.filter((id) => id === 'yideng_cibei')).toHaveLength(1)
    hero.closeBattleStage()
  })

  it('未守住时保留奇遇和原奖励，仍可选后山撤离', () => {
    const hero = approachHut()
    hero.player.level = 1
    hero.player.realmTier = 1
    Object.assign(hero.player.stats, { str: 10, con: 29, agi: 0, intStat: 10, karma: 0 })
    hero.updateLoadout({ stance: 'FIERCE' })
    const mastery = hero.learnedSkills.yiyang_zhi
    expect(hero.pendingAdventure?.options[0].canSelect).toBe(false)
    hero.resolveAdventure('A')
    expect(hero.activeBattle).toBeNull()
    hero.player.stats.con = 30
    hero.resolveAdventure('A')
    expect(hero.activeBattle?.winner).toBe('ENEMY')
    hero.resolveAdventure('B')
    expect(hero.player.stats.karma).toBe(0)
    hero.skipBattleToEnd()
    expect(hero.learnedSkills.yiyang_zhi).toBe(mastery)
    expect(hero.storyFlags).not.toContain('yideng_mercy')
    expect(hero.pendingAdventure?.templateId).toBe('yideng_cibei')
    hero.closeBattleStage()
    hero.resolveAdventure('B')
    expect(hero.resolvedAdventureIds).toContain('yideng_cibei')
    expect(hero.player.stats.karma).toBe(40)
  })
})

describe('主线 2-2 药蛇选择', () => {
  it('分饮按身法门槛一次发放，梁子翁开场惊怒，读档和复战沿用结果', () => {
    const hero = newStore('DEMO')
    hero.player.stats.agi = 19
    const conBefore = hero.player.stats.con
    const qiBefore = hero.player.qiExp
    hero.chooseStorySnake(5, 'A')
    expect(hero.player.storySnakeChoice).toBeUndefined()
    expect(hero.player.qiExp).toBe(qiBefore)
    expect(hero.pendingAdventure?.options[0].canSelect).toBe(false)

    hero.player.stats.agi = 20
    hero.chooseStorySnake(5, 'A')
    expect(hero.player).toMatchObject({ storySnakeChoice: 'A', bonusHpPct: 15, qiExp: qiBefore + 3500, stats: { con: conBefore + 2 } })
    expect(hero.pendingAdventure).toBeNull()
    hero.chooseStorySnake(5, 'A')
    hero.chooseStorySnake(5, 'B')
    expect(hero.player).toMatchObject({ storySnakeChoice: 'A', bonusHpPct: 15, qiExp: qiBefore + 3500, stats: { con: conBefore + 2 } })
    hero.saveNow()

    const resumed = newStore()
    resumed.continueGame()
    expect(resumed.player.storySnakeChoice).toBe('A')
    for (const replay of [false, true]) {
      resumed.challengeChapter(5)
      const report = resumed.activeBattle!
      expect(report.units.map((unit) => unit.name)).not.toContain('赤腹药蛇')
      expect(report.units.find((unit) => unit.slot === 'ALLY_MAIN')?.maxHp).toBe(resumed.derivedStats.maxHp)
      const enraged = report.events.filter((event) => event.statusApplied === '药蛇惊怒')
      expect(enraged).toMatchObject([{ round: 1, actorSlot: 'ENEMY_MAIN', targetSlot: 'ENEMY_MAIN' }])
      expect(enraged[0].segments).toContainEqual({
        type: 'tag', text: '参仙老怪·梁子翁 · 药蛇惊怒 · 攻击 400 → 600 · 防御归零', tone: 'red',
      })
      expect(report.events.indexOf(enraged[0])).toBeLessThan(report.events.findIndex((event) => event.type === 'SKILL_CAST'))
      resumed.skipBattleToEnd()
      expect(resumed.player.bonusHpPct).toBe(15)
      if (!replay) expect(resumed.player.maxChapterId).toBe(6)
      resumed.closeBattleStage()
    }
  })

  it('身法不足时仍可放生，奇遇奖励与实际守军都跟随选择', () => {
    const hero = newStore('DEMO')
    hero.player.stats.agi = 19
    const { silver, bonusHpPct } = hero.player
    const karma = hero.player.stats.karma
    hero.resolveAdventure('B')
    expect(hero.player).toMatchObject({ storySnakeChoice: 'B', silver: silver + 2500, stats: { karma: karma + 30 } })
    expect(hero.player.bonusHpPct).toBe(bonusHpPct)
    expect(hero.resolvedAdventureIds).toContain('shedu_baoxue')
    hero.challengeChapter(5)
    expect(hero.activeBattle?.units.filter((unit) => unit.slot.startsWith('ENEMY')).map((unit) => unit.name))
      .toEqual(['灵智上人', '参仙老怪·梁子翁'])
    expect(hero.activeBattle?.events.some((event) => event.statusApplied === '药蛇惊怒' || event.effectSourceId === 'shedu_baoxue')).toBe(false)
    hero.closeBattleStage()
  })

  it.each(['A', 'B'] as const)('旧试玩存档保留已领取的 %s 结果', (choice) => {
    const hero = newStore('DEMO')
    hero.chooseStorySnake(5, choice)
    hero.saveNow()
    const saveKey = 'wuxia_idle_save'
    const legacy = JSON.parse(localStorage.getItem(saveKey)!)
    delete legacy.data.player.storySnakeChoice
    localStorage.setItem(saveKey, JSON.stringify(legacy))

    const resumed = newStore()
    resumed.continueGame()
    expect(resumed.player.storySnakeChoice).toBe(choice)
    const resources = { con: resumed.player.stats.con, hp: resumed.player.bonusHpPct, silver: resumed.player.silver, qi: resumed.player.qiExp }
    resumed.chooseStorySnake(5, choice)
    expect({ con: resumed.player.stats.con, hp: resumed.player.bonusHpPct, silver: resumed.player.silver, qi: resumed.player.qiExp }).toEqual(resources)
    resumed.challengeChapter(5)
    expect(resumed.activeBattle?.events.some((event) => event.statusApplied === '药蛇惊怒')).toBe(choice === 'A')
    resumed.closeBattleStage()
  })
})

let store: Store
beforeAll(() => {
  store = newStore('DEMO')
})

describe('演武模式：射雕篇全流程', () => {
  it('初始状态：停在 2-2，药蛇宝血待决，新伙伴未结识', () => {
    expect(store.player.maxChapterId).toBe(5)
    expect(store.pendingAdventure?.templateId).toBe('shedu_baoxue')
    expect(store.pendingAdventure?.options.every((o) => typeof o.canSelect === 'boolean')).toBe(true)
    expect(store.companionAffinity.munianci.met).toBe(false)
    expect(store.companionAffinity.ouyangfeng.met).toBe(false)
  })

  it('未解锁的地图被拦截', () => {
    store.moveMap('huashan_peak')
    expect(store.player.currentMapId).toBe('jiaxing_suburb')
  })

  it('药蛇宝血（甲）：永久气血上限 +15%', () => {
    const hpBefore = store.derivedStats.maxHp
    store.resolveAdventure('A')
    expect(store.player.bonusHpPct).toBe(15)
    expect(store.derivedStats.maxHp).toBeGreaterThan(hpBefore * 1.1)
    expect(store.resolvedAdventureIds).toContain('shedu_baoxue')
    expect(store.pendingAdventure).toBeNull()
  })

  it('已了结的奇遇不会再被游历抽到', () => {
    store.triggerRandomAdventure()
    expect(store.pendingAdventure?.templateId).not.toBe('shedu_baoxue')
    resolvePending(store)
  })

  it('回放已通关的 2-1 也会结算首通：穆念慈入队，进度不变', () => {
    boost(store)
    expect(playNode(store, 4)).toBe('ALLY')
    expect(store.claimedNodeIds).toContain(4)
    expect(store.companionAffinity.munianci.met && store.companionAffinity.munianci.recruited).toBe(true)
    expect(store.storyFlags).toContain('met_munianci')
    expect(store.player.maxChapterId).toBe(5)
  })

  it('从 2-2 一路通关到 5-3，逐节点推进并结算首通', () => {
    const stance = store.currentLoadout.stance
    for (let id = 5; id <= 16; id++) {
      if (STORY_CHAPTERS[id - 1].code === '5-3') store.updateLoadout({ stance: 'TAICHI' })
      expect(playNode(store, id), STORY_CHAPTERS[id - 1].code).toBe('ALLY')
      expect(store.player.maxChapterId).toBe(id + 1)
      expect(store.claimedNodeIds).toContain(id)
      resolvePending(store)
    }
    store.updateLoadout({ stance })
    expect(store.player.maxChapterId).toBe(17)
  })

  it('剧情标记、节点掉落与结识', () => {
    expect(store.storyFlags).toEqual(expect.arrayContaining(['yuqiao_gengdu', 'guiyun_ship']))
    expect(store.ownedItemIds).toEqual(expect.arrayContaining(['tiancan_glove', 'wumu_yishu', 'lingshe_zhang']))
    expect(store.learnedSkills.shuishang_piao ?? 0).toBeGreaterThan(0)
    expect(store.learnedSkills.jiuyin_zonggang ?? 0).toBeGreaterThan(0)
    expect(store.companionAffinity.ouyangfeng.met).toBe(true)
  })

  it('剩余奇遇都能经游历抽到并了结，耗尽后不再凭空出现', () => {
    for (let i = 0; i < 20; i++) {
      store.triggerRandomAdventure()
      if (!store.pendingAdventure) break
      resolvePending(store)
    }
    expect(ADVENTURES.filter((a) => !store.resolvedAdventureIds.includes(a.id)).map((a) => a.id)).toEqual([])
    store.triggerRandomAdventure()
    expect(store.pendingAdventure).toBeNull()
  })

  it('奇遇奖励全部落地', () => {
    expect(store.ownedItemIds).toEqual(
      expect.arrayContaining(['yangjia_spear', 'jiuwei_fox', 'dadiao_jindao', 'tiebai_bow', 'shuangdiao_arrow', 'ruanwei_shard'])
    )
    for (const sk of ['yangjia_qiang', 'niqiu_gong', 'kurong_chan', 'xiaoyao_you']) expect(store.learnedSkills[sk] ?? 0, sk).toBeGreaterThan(0)
    expect(store.learnedSkills.yiyang_zhi).toBeGreaterThanOrEqual(4)
    expect(store.storyFlags).toContain('gaibang_letter')
  })

  it('散人与周伯通结拜：双手互搏、空明拳同时习得', () => {
    expect(store.player.currentSectId).toBeNull()
    expect(store.learnedSkills.shuangshou_hubo ?? 0).toBeGreaterThan(0)
    expect(store.learnedSkills.kongming_quan ?? 0).toBeGreaterThan(0)
  })

  it('通关后三张新地图可前往', () => {
    for (const id of ['guiyun_lake', 'taohua_isle', 'huashan_peak']) {
      store.moveMap(id)
      expect(store.player.currentMapId).toBe(id)
    }
  })

  it('门派：门槛、入门授武、引荐信、阶位授武与赠装备', () => {
    const join = (id: string) => {
      store.player.currentSectId = null
      store.joinSect(id)
      return store.player.currentSectId === id
    }
    store.player.stats.karma = -50
    expect(join('yideng'), '侠义不足时一灯居拒收').toBe(false)
    store.player.stats.karma = 100
    expect(join('yideng')).toBe(true)
    expect(join('tiezhang')).toBe(true)
    expect(store.learnedSkills.tiezhang_gong ?? 0).toBeGreaterThan(0)
    expect(join('jiangnan_wuguan')).toBe(true)
    expect(store.learnedSkills.kaishan_zhang ?? 0).toBeGreaterThan(0)

    store.player.stats.karma = 50
    expect(join('gaibang')).toBe(true)
    expect(store.player.sectContribution, '凭引荐信入丐帮起始贡献 +150').toBe(250)
    for (let r = 2; r <= 5; r++) {
      if (r === 3) store.answerGaibangDebate(0)
      else {
        if (r === 5) for (const dish of GAIBANG_FINAL_DISHES) {
          store.moveMap(dish.mapId)
          store.prepareGaibangDish(dish.id)
        }
        store.challengeSectPromotion()
        store.skipBattleToEnd()
        store.closeBattleStage()
      }
      expect(store.player.sectRank).toBe(r)
    }
    expect(store.ownedItemIds).toContain('jiudai_baina')
    expect(store.ownedItemIds).toContain('dagou_stick_true')
    expect(store.learnedSkills.dagou_bangfa ?? 0).toBeGreaterThan(0)
    expect(store.learnedSkills.xianglong_18 ?? 0).toBeGreaterThan(0)
    expect(store.learnedSkills.tianxia_wugou ?? 0).toBeGreaterThan(0)

    store.player.currentSectId = null
    store.storyFlags.splice(store.storyFlags.indexOf('yuqiao_gengdu'), 1)
    store.joinSect('yideng')
    expect(store.player.currentSectId, '缺少渔樵耕读标记时一灯居拒收').toBeNull()
  })

  it('羁绊：射雕三绝左右互换生效；东邪西毒三层引爆造成真伤', () => {
    const L = store.currentLoadout
    L.leftCompanionId = 'hongqigong'
    L.rightCompanionId = 'zhoubotong'
    expect(store.activeTrioSynergy?.id).toBe('she_diao_san_jue')
    L.leftCompanionId = 'zhoubotong'
    L.rightCompanionId = 'hongqigong'
    expect(store.activeTrioSynergy?.id).toBe('she_diao_san_jue')
    L.leftCompanionId = 'ouyangfeng'
    L.rightCompanionId = 'huangyaoshi'
    expect(store.activeTrioSynergy?.id).toBe('dong_xi')
    const rep = simulateServerBattle({
      sceneTitle: '羁绊战', mode: 'SOLO_STORY', player: store.player, loadout: L,
      enemyMain: { name: '木桩', title: '', portrait: 'bandit', hp: 99999, atk: 100, mp: 100, stance: 'FIERCE' },
    })
    const synergy = rep.events.filter((event) => event.effectSourceId === 'dong_xi' && event.round === 3)
    expect(synergy.filter((event) => event.statusApplied).map((event) => event.statusStacks)).toEqual([3, 3])
    const burst = synergy.find((event) => event.segments.some((segment) => segment.type === 'damage' && segment.category === 'true'))!
    const remainingHp = rep.events.slice(0, rep.events.indexOf(burst)).reduce((hp, event) => {
      if (event.targetSlot === 'ENEMY_MAIN') hp += event.hpDelta ?? 0
      if (event.actorSlot === 'ENEMY_MAIN') hp += event.reflectDelta ?? 0
      return hp
    }, 99_999)
    expect(remainingHp).toBeGreaterThan(0)
    expect(burst).toMatchObject({ hpDelta: -Math.min(25_000, remainingHp), targetSlot: 'ENEMY_MAIN' })
  })

  it('客栈：未结识的伙伴不能送礼', () => {
    store.companionAffinity.munianci.met = false
    const af = store.companionAffinity.munianci.affinity
    store.player.silver = 99999
    store.giftCompanionInInn('munianci', true)
    expect(store.companionAffinity.munianci.affinity).toBe(af)
    store.companionAffinity.munianci.met = true
  })

  it('永久气血加成计入派生面板', () => {
    const withBonus = computeDerivedStats(store.player, store.currentLoadout)
    const saved = store.player.bonusHpPct
    store.player.bonusHpPct = 0
    const without = computeDerivedStats(store.player, store.currentLoadout)
    store.player.bonusHpPct = saved
    expect(withBonus.maxHp).toBeGreaterThan(without.maxHp)
  })
})

describe('第一批 16 位伙伴与羁绊（承接上面的通关进度）', () => {
  const NEW16 = ['yideng', 'wangchongyang', 'qiuchuji', 'qiuqianren', 'yangkang', 'zhebie', 'lingzhi', 'yinggu',
    'mayu', 'tanchuduan', 'wangchuyi', 'sunbuer', 'ouyangke', 'yangtiexin', 'luchengfeng', 'zhuziliu']
  const byRoute = (r: string) => NEW16.filter((id) => COMPANIONS[id].route === r)

  it('路线分布 5 / 6 / 5，剧情送不超过紫品，好感线橙品为「橙·下」', () => {
    expect(NEW16.every((id) => COMPANIONS[id] && store.companionAffinity[id])).toBe(true)
    expect([byRoute('STORY').length, byRoute('AFFINITY').length, byRoute('GACHA').length]).toEqual([5, 6, 5])
    expect(byRoute('STORY').every((id) => ['blue', 'purple'].includes(COMPANIONS[id].tier))).toBe(true)
    expect(['qiuchuji', 'qiuqianren', 'yangkang', 'yinggu'].every((id) => COMPANIONS[id].tier === 'orange' && COMPANIONS[id].grade === '下')).toBe(true)
  })

  it('通关后：剧情送已入队，好感线只结识，抽卡线未结识', () => {
    const CA = store.companionAffinity
    for (const id of ['mayu', 'tanchuduan', 'luchengfeng', 'zhuziliu', 'yangtiexin']) expect(CA[id].recruited, id).toBe(true)
    for (const id of ['qiuchuji', 'wangchuyi', 'qiuqianren', 'yangkang', 'yinggu', 'ouyangke']) {
      expect(CA[id].met && !CA[id].recruited, `${id} 好感 ${CA[id].affinity}`).toBe(true)
    }
    for (const id of byRoute('GACHA')) expect(CA[id].met, id).toBe(false)
  })

  it('好感线伙伴可由客栈养成入队', () => {
    store.player.silver = 999999
    store.companionAffinity.qiuchuji.affinity = 0
    for (let i = 0; i < 10 && !store.companionAffinity.qiuchuji.recruited; i++) store.giftCompanionInInn('qiuchuji', true)
    expect(store.companionAffinity.qiuchuji.recruited).toBe(true)
  })

  it.each([
    ['wangchongyang', 'mayu', 'chong_yang_yi_ze'],
    ['munianci', 'yangtiexin', 'fu_nv_tong_xin'],
    ['hongqigong', 'yideng', 'nan_bei'],
    ['zhoubotong', 'yinggu', 'yi_sheng_chi_chan'],
    ['guojing', 'zhebie', 'she_diao_shuang_xiong'],
    ['yangkang', 'ouyangke', 'wang_fu_shuang_bi'],
  ])('双人羁绊：%s + %s → %s', (l, r, id) => {
    store.currentLoadout.leftCompanionId = l
    store.currentLoadout.rightCompanionId = r
    expect(store.activeTrioSynergy?.id).toBe(id)
  })

  it('收集羁绊：按入队人数分档，并真实作用于打坐、气血与战斗输出', () => {
    const CA = store.companionAffinity
    const setOf = (id: string) => store.setBonusStates.find((b) => b.set.id === id)!
    // 全真七子：马钰、谭处端、丘处机已入队
    expect(setOf('quanzhen_qizi').owned).toBe(3)
    expect(setOf('quanzhen_qizi').tier?.count).toBe(3)
    const idle3 = store.effectiveQiPerHour
    const hp3 = store.derivedStats.maxHp
    CA.wangchuyi.recruited = true
    CA.sunbuer.recruited = true
    expect(setOf('quanzhen_qizi').tier?.count).toBe(5)
    expect(store.effectiveQiPerHour).toBeGreaterThan(idle3)
    expect(store.derivedStats.maxHp).toBeGreaterThan(hp3)

    CA.yangkang.recruited = false
    expect(setOf('yang_jia').tier?.count).toBe(2)
    CA.yangkang.recruited = true
    expect(setOf('yang_jia').tier?.count).toBe(3)

    const firstHit = (withBonus: boolean) => {
      const r = simulateServerBattle({
        sceneTitle: 'bonus', mode: 'SOLO_STORY', player: store.player, loadout: store.currentLoadout,
        enemyMain: { name: '木桩', title: '', portrait: 'bandit', hp: 50000, atk: 100, mp: 100, stance: 'FIERCE' },
        bonus: withBonus ? store.collectionBonus : undefined,
      })
      // 比较首回合主角出手：总伤害会因敌人更早倒下而变少，不能直接比较
      return -(r.events.find((e) => e.actorSlot === 'ALLY_MAIN' && e.type === 'SKILL_CAST' && e.hpDelta)?.hpDelta ?? 0)
    }
    expect(firstHit(true)).toBeGreaterThan(firstHit(false))
  })
})
