import { describe, expect, it } from 'vitest'
import { COMPANIONS, PILL_RECIPES } from '@/config/gameData'
import type { OriginId } from '@/network/protocol'
import { gatherHerbs, pillSuccessRate } from '../../shared/alchemy.ts'
import { AWAKENABLE_IDS } from '../../shared/gacha.ts'
import { companionOpenTo, ORIGIN_IDS, ORIGINS, originPerk } from '../../shared/origins.ts'
import { createNewGameCharacter, cultivationRate, enemySilverReward, trialFirstClearSilver } from '../../shared/player.ts'
import { TRIAL_STAGES } from '../../shared/trialStages.ts'
import { newStore, playNode } from './helpers'

const start = (origin?: OriginId) => createNewGameCharacter({ id: 'o', nickname: '新人', avatarId: 'hero_sword' }, 0, origin)

describe('开局家世 · 建角', () => {
  it('四家各配一位流派不同的家人，蓝品、只在本家出现、不进结缘信物', () => {
    const kin = ORIGIN_IDS.map((id) => COMPANIONS[ORIGINS[id].companionId])
    expect(kin.map(({ origin }) => origin)).toEqual(ORIGIN_IDS)
    expect(kin.every(({ tier, route }) => tier === 'blue' && route === 'FAMILY')).toBe(true)
    expect(new Set(kin.map(({ battleAttack, battleSupport }) => `${battleAttack?.stance}${battleAttack?.target}${battleSupport?.[0]?.kind}`)).size).toBe(4)
    expect(AWAKENABLE_IDS.some((id) => COMPANIONS[id].route === 'FAMILY')).toBe(false)
    expect(companionOpenTo(COMPANIONS.leizheng, { origin: 'jiangmen' })).toBe(true)
    expect(companionOpenTo(COMPANIONS.leizheng, { origin: 'yujia' })).toBe(false)
    expect(companionOpenTo(COMPANIONS.leizheng, {})).toBe(false)
    expect(companionOpenTo(COMPANIONS.guojing, {})).toBe(true)
  })

  it('选了家世：六维按家世微调，家人已入队并站在所有出战方案里', () => {
    for (const id of ORIGIN_IDS) {
      const origin = ORIGINS[id]
      const { player, companionAffinity, presets } = start(id)
      expect(player.origin).toBe(id)
      const raised = Object.entries(player.stats).filter(([, value]) => value > 10)
      expect(Object.fromEntries(raised)).toEqual(Object.fromEntries(Object.entries(origin.stats).map(([key, value]) => [key, 10 + value])))
      expect(companionAffinity[origin.companionId]).toMatchObject({ affinity: 100, recruited: true, met: true })
      expect(Object.values(companionAffinity).filter(({ recruited }) => recruited)).toHaveLength(1)
      const side = COMPANIONS[origin.companionId].role === 'LEFT' ? 'leftCompanionId' : 'rightCompanionId'
      expect(Object.values(presets).every((preset) => preset[side] === origin.companionId)).toBe(true)
    }
    const plain = start()
    expect(plain.player.origin).toBeUndefined()
    expect(Object.values(plain.companionAffinity).some(({ recruited }) => recruited)).toBe(false)
  })
})

describe('开局家世 · 家学', () => {
  it('各家只加自己那一项', () => {
    for (const id of ORIGIN_IDS) {
      const kinds = (['TRIAL_SILVER', 'HERB_ROLL', 'PILL_RATE', 'IDLE_QI'] as const).filter((kind) => originPerk({ origin: id }, kind))
      expect(kinds).toEqual([ORIGINS[id].perk.kind])
    }
    expect(originPerk({}, 'IDLE_QI')).toBe(0)
  })

  it('将门历练首胜纹银 +10%，渔家采药多一份，杏林成丹 +5，玄门打坐真气 +5%', () => {
    const hp = TRIAL_STAGES[0].boss.hp
    expect(trialFirstClearSilver(hp, {})).toBe(enemySilverReward(hp))
    expect(trialFirstClearSilver(hp, { origin: 'jiangmen' })).toBe(Math.round(enemySilverReward(hp) * 1.1))

    const count = (extra: number) => gatherHerbs('jiaxing_suburb', 0, 0, () => 0.9, extra).reduce((sum, herb) => sum + herb.count, 0)
    expect(count(0)).toBe(2)
    expect(count(originPerk({ origin: 'yujia' }, 'HERB_ROLL'))).toBe(3)

    const stats = { str: 10, con: 10, agi: 10, intStat: 10, luck: 10, karma: 0 }
    const recipe = Object.values(PILL_RECIPES).find((entry) => pillSuccessRate(entry, stats) < 90)!
    expect(pillSuccessRate(recipe, stats, 0, originPerk({ origin: 'xinglin' }, 'PILL_RATE'))).toBe(pillSuccessRate(recipe, stats) + 5)

    const taoist = start('xuanmen')
    const plain = start()
    plain.player.stats = { ...taoist.player.stats }
    const rate = (c: typeof plain) => cultivationRate(c.player, c.presets[1])
    expect(rate(taoist)).toBe(Math.round(rate(plain) * 1.05))
  })
})

describe('开局家世 · 本地试玩', () => {
  it('序章那一战家人并肩，三种架势都打得赢；忘机客说完家人补一句', () => {
    for (const id of ORIGIN_IDS) {
      for (const idx of [1, 2, 3] as const) {
        for (let round = 0; round < 6; round++) {
          const s = newStore('NEW', { gated: true, origin: id })
          s.switchLoadout(idx)
          s.challengeChapter(1)
          expect(s.activeBattle?.units.some((unit) => unit.id === ORIGINS[id].companionId), id).toBe(true)
          s.skipBattleToEnd()
          expect(s.activeBattle?.winner, `${id} 预设${idx}`).toBe('ALLY')
          s.closeBattleStage()
        }
      }
    }
    const s = newStore('NEW', { gated: true, origin: 'xinglin' })
    playNode(s, 1)
    expect(s.featureCard?.id).toBe('TRIAL')
    expect(s.featureCard?.coda).toMatchObject({ speaker: '沈青黛', portrait: 'shenqingdai', text: ORIGINS.xinglin.prologue.trialLine })
    expect(s.arsenalTabOpen('SQUAD')).toBe(true)
  })

  it('家人能请酒送礼，别家的家人结识不到', () => {
    const s = newStore('NEW', { origin: 'yujia' })
    expect(s.companionAffinity.ruanqinggao).toMatchObject({ recruited: true, met: true })
    expect(s.companionAffinity.leizheng).toMatchObject({ recruited: false, met: false })
    expect(s.currentLoadout.leftCompanionId).toBe('ruanqinggao')
  })
})
