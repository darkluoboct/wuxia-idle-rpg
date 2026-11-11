/**
 * 演武模式下的射雕篇全流程：主线、支线、门派、地图、羁绊。
 * 本文件内的用例按顺序共用同一个 store（后一步依赖前一步的进度）。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { ADVENTURES, COMPANIONS, STORY_CHAPTERS } from '@/config/gameData'
import { computeDerivedStats, simulateServerBattle } from '@/network/mockEngine'
import { boost, newStore, playNode, resolvePending, type Store } from './helpers'

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
    for (let id = 5; id <= 16; id++) {
      expect(playNode(store, id), STORY_CHAPTERS[id - 1].code).toBe('ALLY')
      expect(store.player.maxChapterId).toBe(id + 1)
      expect(store.claimedNodeIds).toContain(id)
      resolvePending(store)
    }
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
      store.challengeSectPromotion()
      store.skipBattleToEnd()
      store.closeBattleStage()
      expect(store.player.sectRank).toBe(r)
    }
    expect(store.ownedItemIds).toContain('jiudai_baina')
    expect(store.learnedSkills.dagou_bangfa ?? 0).toBeGreaterThan(0)
    expect(store.learnedSkills.xianglong_18 ?? 0).toBeGreaterThan(0)

    store.player.currentSectId = null
    store.storyFlags.splice(store.storyFlags.indexOf('yuqiao_gengdu'), 1)
    store.joinSect('yideng')
    expect(store.player.currentSectId, '缺少渔樵耕读标记时一灯居拒收').toBeNull()
  })

  it('羁绊：射雕三绝左右互换生效；东邪西毒出现在战报', () => {
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
    expect(rep.events.some((e) => e.segments.some((s) => s.type === 'tag' && s.text.includes('东邪西毒')))).toBe(true)
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
