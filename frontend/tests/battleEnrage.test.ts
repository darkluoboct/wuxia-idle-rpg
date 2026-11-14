import { expect, it } from 'vitest'
import { calcBattleEnrageRound, simulateServerBattle } from '../../shared/battle.ts'
import { createStarterCharacter } from '../../shared/player.ts'

it.each([8_000, 30_000, 100_000])('首领气血 %i 时，狂暴锁定闪避并结束拖局', (hp) => {
  const { player } = createStarterCharacter(
    { id: 'test', nickname: '试招', avatarId: 'hero_sword' },
    0,
  )
  Object.assign(player, { level: 1, realmTier: 1, currentSectId: null })
  Object.assign(player.stats, { str: 0, con: 30, agi: 250 })
  const report = simulateServerBattle({
    sceneTitle: '首领狂暴',
    mode: 'SOLO_STORY',
    player,
    loadout: {
      presetIdx: 1,
      name: '空配装',
      stance: 'FIERCE',
      leftCompanionId: null,
      rightCompanionId: null,
      weaponId: null,
      armorId: null,
      accId: null,
      relicBookId: null,
      outerSkillId: null,
      innerSkillId: null,
      lightSkillId: null,
      ultSkillId: null,
    },
    enemyMain: {
      name: '试招首领',
      title: '',
      portrait: 'bandit',
      hp,
      atk: 1,
      mp: 1000,
      stance: 'FIERCE',
      isBoss: true,
      combat: { def: 2_000 },
    },
    rng: () => 0,
  })
  const enrage = calcBattleEnrageRound(hp)
  expect(report.events.filter((event) => event.type === 'BOSS_ENRAGE')).toMatchObject([
    { round: enrage, actorSlot: 'ENEMY_MAIN' },
  ])
  const dodges = report.events.filter(
    (event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'DODGE',
  )
  expect(dodges.some((event) => event.round < enrage)).toBe(true)
  expect(dodges.every((event) => event.round < enrage)).toBe(true)
  expect(report.events.at(-1)?.round).toBe(enrage + 4)
  expect(report.winner).toBe('ENEMY')
})
