/**
 * 师门差事与师门宝库（docs/29）：挂机替师门办差事记贡献，贡献到宝库换东西。
 */
import { describe, expect, it, vi } from 'vitest'
import { HERBS, MEDICINES, SECTS, SKILLS } from '../../shared/gameData.ts'
import { createNewGameCharacter } from '../../shared/player.ts'
import type { PlayerDTO } from '../../shared/protocol.ts'
import {
  accrueSectChores, drawSectChores, eligibleSectChores, SECT_CHORE_MAX, SECT_CHORE_MS, SECT_CHORE_RECENT, SECT_CHORES,
  sectChoreLine, sectChoreOf, sectChoreWait, SHICHEN, shichenAt,
} from '../../shared/sectDaily.ts'
import { buySectGood, fragmentGoodId, SECT_TREASURIES, sectGoodBought, sectGoods, type SectStock } from '../../shared/sectExchange.ts'
import { sectContestEndsAt, sectContestWeek } from '../../shared/sectProgress.ts'
import { trialPartId } from '../../shared/trialStages.ts'
import { newStore } from './helpers'

const HOUR = 3_600_000
/** 北京时间 2026-11-13 08:00，辰时 */
const NOW = Date.parse('2026-11-13T08:00:00+08:00')

function member(sectId: string, rank = 1): PlayerDTO {
  const { player } = createNewGameCharacter({ id: 'p1', nickname: '测试侠客', avatarId: 'hero_sword' }, NOW)
  delete player.idleOff
  return { ...player, currentSectId: sectId, sectRank: rank, sectContribution: 0 }
}
const emptyStock = (): SectStock => ({ pills: {}, medicines: {}, herbs: {}, fragments: {} })
const loadout = { presetIdx: 1 } as Parameters<typeof drawSectChores>[1]

describe('师门差事文案', () => {
  it('七个门派都有差事和宝库；每一阶、每个时辰至少有两件差事可挑', () => {
    for (const sect of SECTS) {
      expect(SECT_CHORES[sect.id]?.length, sect.id).toBeGreaterThanOrEqual(10)
      expect(SECT_TREASURIES[sect.id], sect.id).toBeDefined()
      for (let rank = 1; rank <= sect.ranks.length; rank++) {
        for (const shichen of SHICHEN) expect(eligibleSectChores(sect.id, rank, shichen).length, `${sect.id} ${rank} 阶 ${shichen}时`).toBeGreaterThanOrEqual(2)
      }
      // 高阶才轮到的差事
      expect(SECT_CHORES[sect.id].some(({ minRank }) => (minRank ?? 1) >= 3), sect.id).toBe(true)
    }
  })

  it('每条差事编号不重、篇幅适合一行日志、贡献在 30～50 之间', () => {
    for (const [sectId, chores] of Object.entries(SECT_CHORES)) {
      expect(new Set(chores.map(({ id }) => id)).size, sectId).toBe(chores.length)
      for (const chore of chores) {
        expect(sectChoreOf(`${sectId}.${chore.id}`)).toBe(chore)
        expect(chore.text.length, chore.text).toBeLessThanOrEqual(60)
        expect(chore.place.length).toBeLessThanOrEqual(5)
        expect(chore.contrib).toBeGreaterThanOrEqual(30)
        expect(chore.contrib).toBeLessThanOrEqual(50)
      }
    }
  })

  it('时辰按北京时间算，子时从 23 点开始', () => {
    expect(shichenAt(NOW)).toBe('辰')
    expect(shichenAt(Date.parse('2026-11-13T23:00:00+08:00'))).toBe('子')
    expect(shichenAt(Date.parse('2026-11-13T22:59:00+08:00'))).toBe('亥')
    expect(shichenAt(Date.parse('2026-11-14T00:30:00+08:00'))).toBe('子')
  })
})

describe('攒时长与记功', () => {
  it('挂机五小时记两件差事，余下一小时留到下次；差事每两小时一件，挑的都是当时轮得到的', () => {
    const player = member('taohua')
    accrueSectChores(player, 5 * HOUR)
    const gain = drawSectChores(player, loadout, NOW, () => 0.4)!
    expect(gain.count).toBe(2)
    expect(player.sectChores?.ms).toBe(HOUR)
    expect(gain.entries.map(({ at }) => at)).toEqual([NOW - SECT_CHORE_MS, NOW])
    expect(player.sectContribution).toBe(gain.contrib)
    expect(gain.contrib).toBe(gain.entries.reduce((sum, { id }) => sum + sectChoreOf(id)!.contrib, 0))
    for (const entry of gain.entries) {
      const chore = sectChoreOf(entry.id)!
      expect(eligibleSectChores('taohua', 1, shichenAt(entry.at))).toContain(chore)
      expect(sectChoreLine(entry)?.heading).toBe(`${shichenAt(entry.at)}时·${chore.place}`)
    }
    expect(player.sectChores?.recent).toEqual(gain.entries)
  })

  it('最多攒一天：离线三十小时也只记十二件，日常只留最近六件', () => {
    const player = member('gaibang', 5)
    accrueSectChores(player, 30 * HOUR)
    const gain = drawSectChores(player, loadout, NOW)!
    expect(gain.count).toBe(SECT_CHORE_MAX)
    expect(SECT_CHORE_MAX).toBe(12)
    expect(player.sectChores?.ms).toBe(0)
    expect(player.sectChores?.recent).toEqual(gain.entries.slice(-SECT_CHORE_RECENT))
    // 相邻两件不会是同一件事
    for (let i = 1; i < gain.entries.length; i++) expect(gain.entries[i].id).not.toBe(gain.entries[i - 1].id)
  })

  it('不在师门、没在挂机都不攒；不满一个时辰不记', () => {
    const wanderer = member('gaibang')
    wanderer.currentSectId = null
    accrueSectChores(wanderer, 5 * HOUR)
    expect(wanderer.sectChores).toBeUndefined()
    const resting = member('gaibang')
    resting.idleOff = true
    accrueSectChores(resting, 5 * HOUR)
    expect(resting.sectChores).toBeUndefined()
    const short = member('gaibang')
    accrueSectChores(short, HOUR)
    expect(drawSectChores(short, loadout, NOW)).toBeUndefined()
    expect(short.sectChores?.ms).toBe(HOUR)
  })

  it('佩戴太湖水令，差事记的贡献也多两成', () => {
    const player = member('quanzhen')
    accrueSectChores(player, SECT_CHORE_MS)
    const gain = drawSectChores(player, { ...loadout, accId: trialPartId('taihu_shuizhai', 'ACC') }, NOW)!
    expect(gain.contrib).toBe(Math.round(sectChoreOf(gain.entries[0].id)!.contrib * 1.2))
  })

  it('页面上的进度：还差多久办下一件、攒了几件', () => {
    const player = member('yideng')
    player.lastSettleAt = NOW - 30 * 60_000
    expect(sectChoreWait(player, NOW)).toEqual({ ready: 0, waitMs: 90 * 60_000 })
    player.sectChores = { ms: 3 * HOUR, recent: [] }
    expect(sectChoreWait(player, NOW)).toEqual({ ready: 1, waitMs: 30 * 60_000 })
    player.idleOff = true
    expect(sectChoreWait(player, NOW)).toBeUndefined()
  })
})

describe('师门宝库', () => {
  it('货单里的丹药、药材都对得上，残页只列已学会的本门武学', () => {
    for (const sect of SECTS) {
      for (const good of SECT_TREASURIES[sect.id].goods) {
        const { grant } = good
        if (grant.kind === 'PILL') expect(MEDICINES[grant.id].category).toBe('ACUPOINT_PILL')
        if (grant.kind === 'MEDICINE') expect(MEDICINES[grant.id].category).not.toBe('ACUPOINT_PILL')
        if (grant.kind === 'HERB') expect(HERBS[grant.id]).toBeDefined()
        expect(good.weeklyLimit).toBeGreaterThan(0)
        expect(good.minRank).toBeLessThanOrEqual(sect.ranks.length)
      }
    }
    const gaibang = SECTS.find(({ id }) => id === 'gaibang')!
    const fragments = sectGoods(gaibang, { huntian_qigong: 1, kongming_quan: 1 }).filter(({ grant }) => grant.kind === 'FRAGMENT')
    expect(fragments.map(({ id }) => id)).toEqual([fragmentGoodId('huntian_qigong')])
    expect(fragments[0].name).toBe(`《${SKILLS.huntian_qigong.name}》残页`)
  })

  it('兑换扣贡献、进背包、记本周份数；兑完要等周六 20:00 补货', () => {
    const player = member('quanzhen')
    player.sectContribution = 1000
    const stock = emptyStock()
    for (let i = 0; i < 3; i++) expect(buySectGood(player, stock, {}, 'tongmai_dan', 1, NOW)).toMatchObject({ count: 1, price: 180 })
    expect(stock.pills.tongmai_dan).toBe(3)
    expect(player.sectContribution).toBe(1000 - 540)
    expect(sectGoodBought(player, 'tongmai_dan', NOW)).toBe(3)
    expect(buySectGood(player, stock, {}, 'tongmai_dan', 1, NOW)).toEqual({ error: '玄门·聚气通脉丹本周已兑完，周六 20:00 补货' })
    const restock = sectContestEndsAt(sectContestWeek(NOW))
    expect(new Date(restock).getUTCDay()).toBe(6)
    expect(sectGoodBought(player, 'tongmai_dan', restock)).toBe(0)
    expect(buySectGood(player, stock, {}, 'tongmai_dan', 1, restock)).toMatchObject({ price: 180 })
    expect(stock.pills.tongmai_dan).toBe(4)
  })

  it('阶位不够、贡献不够、份数超出都换不成，什么也不扣', () => {
    const player = member('quanzhen')
    player.sectContribution = 300
    const stock = emptyStock()
    expect(buySectGood(player, stock, {}, 'chunyang_jindan', 1, NOW)).toEqual({ error: '升到第 3 阶才能兑换全真教·纯阳金丹' })
    player.sectRank = 3
    expect(buySectGood(player, stock, {}, 'pozhang_dan', 1, NOW)).toEqual({ error: '门派贡献不够：需要 800，现有 300' })
    expect(buySectGood(player, stock, {}, 'fuling', 6, NOW)).toEqual({ error: '请选择要兑换的份数' })
    expect(buySectGood(player, stock, {}, 'fuling', 1.5, NOW)).toEqual({ error: '请选择要兑换的份数' })
    expect(buySectGood(player, stock, {}, 'jiuhua_yulu_wan', 1, NOW)).toEqual({ error: '宝库里没有这样东西' })
    expect(player.sectContribution).toBe(300)
    expect(player.sectExchange).toBeUndefined()
    player.currentSectId = null
    expect(buySectGood(player, stock, {}, 'fuling', 1, NOW)).toEqual({ error: '拜入师门后才能用师门宝库' })
  })

  it('铁掌帮兵器房换锻材，本门武学残页按品阶定价', () => {
    const player = member('tiezhang')
    player.sectContribution = 2000
    const stock = emptyStock()
    expect(buySectGood(player, stock, {}, 'forge', 2, NOW)).toMatchObject({ count: 2, price: 240 })
    expect(player.equipmentForge).toMatchObject({ iron: 2, stones: 2 })
    expect(buySectGood(player, stock, {}, fragmentGoodId('tiezhang_gong'), 5, NOW)).toEqual({ error: '宝库里没有这样东西' })
    const bought = buySectGood(player, stock, { tiezhang_gong: 1 }, fragmentGoodId('tiezhang_gong'), 5, NOW)
    expect(bought).toMatchObject({ count: 5 })
    expect(stock.fragments.tiezhang_gong).toBe(5)
  })
})

describe('试玩：挂机记功，再到宝库兑换', () => {
  it('拜入丐帮后挂机四个时辰，收功时记两件差事、写日志；拿贡献换通脉丹', () => {
    const store = newStore('DEMO')
    store.joinSect('gaibang')
    const joined = store.player.sectContribution
    expect(store.player.sectChores).toBeUndefined()
    const now = Date.now()
    store.player.lastSettleAt = now - 4 * HOUR - 10 * 60_000
    vi.spyOn(Math, 'random').mockReturnValue(0.3)
    store.settleOfflineQi()
    const recent = store.player.sectChores!.recent
    expect(recent).toHaveLength(2)
    const gained = recent.reduce((sum, { contrib }) => sum + contrib, 0)
    expect(store.player.sectContribution).toBe(joined + gained)
    expect(store.player.sectChores!.ms).toBe(10 * 60_000)
    const texts = store.logs.map((log) => log.segments.map((seg) => 'text' in seg ? seg.text : '').join(''))
    expect(texts.some((text) => text.includes(`替师门办了 2 件差事，门派贡献 +${gained}`))).toBe(true)
    expect(texts.some((text) => text.includes(sectChoreOf(recent[1].id)!.text))).toBe(true)
    expect(store.awayReport?.gain.sectChores?.count).toBe(2)

    // 入门 100 加两件差事还不够一枚通脉丹：贡献不够时提示，什么也不扣
    const pills = store.pillInventory.tongmai_dan ?? 0
    store.exchangeSectGood('tongmai_dan')
    expect(store.pillInventory.tongmai_dan ?? 0).toBe(pills)
    expect(store.player.sectContribution).toBe(joined + gained)
    store.player.sectContribution = 500
    store.exchangeSectGood('tongmai_dan')
    expect(store.pillInventory.tongmai_dan).toBe(pills + 1)
    expect(store.player.sectContribution).toBe(320)

    store.player.sectRank = 4
    store.leaveSect('GRADUATE')
    expect(store.player.sectContribution).toBe(0)
    expect(store.player.sectChores).toBeUndefined()
  })
})
