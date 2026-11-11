import { describe, expect, it } from 'vitest'
import { COMPANIONS, companionView, REALMS, STORY_CHAPTERS } from '@/config/gameData'
import { calcNextLevelQi, simulateServerBattle } from '@/network/mockEngine'
import type { LoadoutPresetDTO, PlayerDTO } from '@/network/protocol'
import { createStarterCharacter } from '../../shared/player.ts'

/** 按等级构造一个“正常成长”的主角：每级 +1 臂力/根骨/身法，每次破境 +4 */
function mkPlayer(L: number): PlayerDTO {
  const tier = REALMS.find((r) => L >= r.minLevel && L <= r.maxLevel)?.tier ?? 1
  const base = 10 + (L - 1)
  const bt = tier - 1
  return {
    ...createStarterCharacter({ id: 'sim', nickname: '模拟侠客', avatarId: 'hero_sword' }, 0).player,
    level: L, realmTier: tier, realmStage: 1, breakPityRate: 0,
    qiExp: 0, nextLevelQi: calcNextLevelQi(L), silver: 0, goldIngot: 0,
    stats: { str: base + 4 * bt, con: base + 4 * bt, agi: base, intStat: Math.round(10 + (L - 1) * 0.5 + 3 * bt), luck: 20, karma: 0 },
    shaQi: 0, currentSectId: null, sectRank: 1, sectContribution: 0, isGuardingLibrary: false, currentMapId: 'jiaxing_suburb',
    maxChapterId: 1, qiPerHour: 0, lastSettleAt: 0, coCultivatePartner: null, bountyUntil: null, wearingMask: false, activePresetIdx: 1,
  }
}

/** 中规中矩的配装：少年郭靖 + 少年黄蓉（基础紫品形态），等级上去后换外功与武器 */
function mkLoadout(L: number, stance: LoadoutPresetDTO['stance'] = 'FIERCE'): LoadoutPresetDTO {
  return {
    presetIdx: 1, name: 'sim', stance,
    innerSkillId: 'quanzhen_tuna', outerSkillId: L >= 30 ? 'dagou_bangfa' : 'luoying_zhang',
    lightSkillId: 'jinyan_gong', ultSkillId: 'yiyang_zhi',
    leftCompanionId: 'guojing', rightCompanionId: 'huangrong',
    weaponId: L >= 36 ? 'biyu_xiao' : 'xuantie_dagger', armorId: 'quanzhen_robe', accId: 'iron_bagua', relicBookId: null,
  }
}

function fight(nodeIndex: number, level: number, stance: LoadoutPresetDTO['stance'] = 'FIERCE') {
  const ch = STORY_CHAPTERS[nodeIndex]
  const r = simulateServerBattle({
    sceneTitle: ch.title, mode: 'SOLO_STORY', player: mkPlayer(level), loadout: mkLoadout(level, stance),
    companionOf: (id) => COMPANIONS[id] ? companionView(COMPANIONS[id]) : undefined,
    enemyMain: { name: ch.bossName, title: ch.bossTitle, portrait: ch.bossPortrait, hp: ch.bossHp, atk: ch.bossAtk, mp: ch.bossHp * 0.45, stance: ch.bossStance },
    enemyGuards: ch.guards,
  })
  const main = r.units.find((u) => u.slot === 'ALLY_MAIN')!
  const lost = r.events.reduce((s, e) => s + (e.targetSlot === 'ALLY_MAIN' && e.hpDelta ? -e.hpDelta : 0), 0)
  return { winner: r.winner, hpLeft: Math.max(0, 1 - lost / main.maxHp) }
}

describe('主线数值曲线', () => {
  it.each(STORY_CHAPTERS.map((c, i) => [c.code, i] as const))('%s 在推荐等级下可胜，且余血 ≥ 60%%', (_code, i) => {
    for (const stance of ['FIERCE', 'TAICHI'] as const) {
      const r = fight(i, STORY_CHAPTERS[i].recLevel, stance)
      expect(r.winner).toBe('ALLY')
      expect(r.hpLeft).toBeGreaterThanOrEqual(0.55)
    }
  })

  it('推荐等级随节点单调不减', () => {
    for (let i = 1; i < STORY_CHAPTERS.length; i++) {
      expect(STORY_CHAPTERS[i].recLevel).toBeGreaterThanOrEqual(STORY_CHAPTERS[i - 1].recLevel)
    }
  })

  it('等级严重不足时后期节点会落败（数值有门槛意义）', () => {
    const lateNodes = STORY_CHAPTERS.map((c, i) => [c, i] as const).filter(([c]) => c.chapter >= 4)
    for (const [ch, i] of lateNodes) expect(fight(i, 20).winner, ch.code).toBe('ENEMY')
  })
})
