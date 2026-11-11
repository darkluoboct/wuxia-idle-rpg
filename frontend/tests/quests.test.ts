import { describe, expect, it, vi } from 'vitest'
import { DISHES } from '@/config/questData'
import { boost, newStore, playNode } from './helpers'

const DAY = 86400_000
const SAVE_KEY = 'wuxia_idle_save'

/** 接管 Date.now，返回一个可随时改时间的设置器（afterEach 自动还原） */
function clock(start = Date.now()) {
  let t = start
  vi.spyOn(Date, 'now').mockImplementation(() => t)
  return {
    set: (v: number) => (t = v),
    add: (ms: number) => (t += ms),
    get now() {
      return t
    },
  }
}

describe('本地存档', () => {
  it('保存后重启可继续，主线进度与配装都恢复', () => {
    const s1 = newStore()
    expect(s1.savedGame).toBeNull()
    s1.startGame('NEW')
    playNode(s1, 1)
    s1.saveNow()
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()

    const s2 = newStore()
    expect(s2.gameMode).toBeNull()
    expect(s2.savedGame).toMatchObject({ mode: 'NEW', node: '1-2' })
    s2.continueGame()
    expect(s2.gameMode).toBe('NEW')
    expect(s2.player.maxChapterId).toBe(2)
    expect(s2.currentLoadout.outerSkillId).toBe('kaishan_zhang')
  })

  it('旧档缺字段时补默认值，已删除的伙伴被丢弃', () => {
    const s1 = newStore('NEW')
    s1.saveNow()
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!)
    delete raw.data.reunion
    delete raw.data.feast
    raw.data.companionAffinity = { guojing: { affinity: 150, recruited: true, taught: false, met: true }, ghost_companion: { affinity: 1 } }
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw))

    const s = newStore()
    s.continueGame()
    expect(s.companionAffinity.guojing).toMatchObject({ affinity: 150, tokens: 0, form: 'base' })
    expect('ghost_companion' in s.companionAffinity).toBe(false)
    expect(s.companionAffinity.zhebie).toBeDefined()
    expect(s.feast.cooked).toEqual([])
    expect(s.reunionView('meichaofeng').clues).toBe(0)
  })

  it('版本不符的存档被忽略；可删除存档', () => {
    const s1 = newStore('NEW')
    s1.saveNow()
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!)
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...raw, version: 999 }))
    expect(newStore().savedGame).toBeNull()

    s1.saveNow()
    s1.deleteSave()
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
    expect(s1.savedGame).toBeNull()
  })

  it('VITE_LOCAL_SAVE=false 时不读不写', async () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 1, data: { gameMode: 'NEW' } }))
    vi.stubEnv('VITE_LOCAL_SAVE', 'false')
    vi.resetModules()
    const p = await import('@/stores/persistence')
    expect(p.LOCAL_SAVE_ENABLED).toBe(false)
    expect(p.readSave()).toBeNull()
    expect(p.writeSave({ x: 1 })).toBe(false)
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).savedAt).toBe(1)
  })

  it('同一会话里玩过新游戏，再选演武模式会完整还原', () => {
    const s = newStore('NEW')
    playNode(s, 1)
    s.backToTitle()
    expect(s.gameMode).toBeNull()
    s.startGame('DEMO')
    expect(s.player.level).toBe(32)
    expect(s.player.maxChapterId).toBe(5)
    expect(s.companionAffinity.huangyaoshi.recruited).toBe(true)
  })
})

describe('故人寻访（错过的梅超风）', () => {
  function setup() {
    const s = newStore('NEW')
    boost(s)
    s.player.maxChapterId = 6
    s.player.silver = 9_999_999
    s.resolvedAdventureIds.push('huangshan_bishou')
    const c = clock(Date.now() + 3 * 3600_000)
    const settleAfter = (mins: number) => {
      s.player.lastSettleAt = c.now - mins * 60_000
      s.settleOfflineQi()
    }
    return { s, c, settleAfter }
  }

  it('三种线索来源各有每日上限，被拒时不扣银', () => {
    const { s, settleAfter } = setup()
    expect(s.reunionCandidates).toContain('meichaofeng')
    settleAfter(120)
    settleAfter(120)
    expect(s.reunionView('meichaofeng').clues, '闭关打听每日上限 5').toBe(5)
    playNode(s, 3)
    playNode(s, 3)
    expect(s.reunionView('meichaofeng').clues, '旧地重游每日上限 3').toBe(8)
    const silver = s.player.silver
    s.inquireReunion('meichaofeng')
    s.inquireReunion('meichaofeng')
    expect(s.reunionView('meichaofeng').clues).toBe(10)
    expect(s.player.silver).toBe(silver - 300)
  })

  it('每日满额恰好 30 天集齐；故地累计相候 2 小时（离开不计时）→ 备礼 → 重逢战 → 入队', () => {
    const { s, c, settleAfter } = setup()
    let days = 0
    while (s.reunionView('meichaofeng').step === 'CLUES' && days < 60) {
      if (days > 0) c.add(DAY)
      days++
      settleAfter(120)
      playNode(s, 3)
      s.inquireReunion('meichaofeng')
    }
    expect(days).toBe(30)
    expect(s.reunionView('meichaofeng').step).toBe('WAIT')

    s.completeReunionWait('meichaofeng')
    expect(s.reunionView('meichaofeng').step, '未候满不能赴约').toBe('WAIT')
    const t0 = c.now
    c.set(t0 + 3600_000)
    s.moveMap('zhongnan_forest') // 已候 1 小时，离开
    c.set(t0 + 5 * 3600_000)
    s.moveMap('jiaxing_suburb') // 离开期间不计时
    c.set(t0 + 6 * 3600_000 + 60_000)
    s.completeReunionWait('meichaofeng')
    expect(s.reunionView('meichaofeng').step).toBe('GIFT')

    s.reunionGift('meichaofeng')
    expect(s.reunionView('meichaofeng').step).toBe('BATTLE')
    s.reunionBattle('meichaofeng')
    expect(s.activeBattle?.sceneTitle).toContain('梅超风')
    s.skipBattleToEnd()
    expect(s.companionAffinity.meichaofeng.recruited).toBe(true)
    expect(s.reunionView('meichaofeng').step).toBe('DONE')
    expect(s.reunionCandidates).not.toContain('meichaofeng')
  })
})

describe('北丐·十道绝味', () => {
  it('结识洪七公后开启；未呈齐时好感再高也不入队', () => {
    const s = newStore('NEW')
    s.player.maxChapterId = 17
    s.player.silver = 9_999_999
    expect(s.feastActive).toBe(false)
    s.companionAffinity.hongqigong.met = true
    expect(s.feastActive).toBe(true)
    s.companionAffinity.hongqigong.affinity = 300
    s.giftCompanionInInn('hongqigong', false)
    expect(s.companionAffinity.hongqigong.recruited).toBe(false)
  })

  it('食材在对应地图挂机采办，每日只能掌勺一道，十天呈齐后入队', () => {
    const s = newStore('NEW')
    s.player.maxChapterId = 17
    s.player.silver = 9_999_999
    s.companionAffinity.hongqigong.met = true
    const c = clock(Date.now() + 10 * DAY)
    for (const d of DISHES) {
      c.add(DAY)
      if (s.player.currentMapId !== d.mapId) s.moveMap(d.mapId)
      s.player.lastSettleAt = c.now - 40 * 60_000
      s.settleOfflineQi()
      expect(s.feast.ingredients.includes(d.id) || s.feast.cooked.includes(d.id), d.ingredient).toBe(true)
      s.cookDish(d.id)
      const another = DISHES.find((x) => x.id !== d.id && s.feast.ingredients.includes(x.id))
      if (another) {
        const n = s.feast.cooked.length
        s.cookDish(another.id)
        expect(s.feast.cooked.length, '每日只能掌勺一道').toBe(n)
      }
    }
    expect(s.feast.cooked).toHaveLength(10)
    expect(s.companionAffinity.hongqigong.recruited).toBe(true)
    expect(s.storyFlags).toContain('hong_feast_done')
    expect(s.feastActive).toBe(false)
  })

  it('离线不足 30 分钟采不到食材；已入队（抽卡 / 演武）则不开启', () => {
    const s = newStore('NEW')
    s.companionAffinity.hongqigong.met = true
    s.player.lastSettleAt = Date.now() - 10 * 60_000
    s.settleOfflineQi()
    expect(s.feast.ingredients).toEqual([])
    expect(newStore('DEMO').feastActive).toBe(false)
  })
})
