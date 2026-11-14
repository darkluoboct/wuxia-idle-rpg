import type { BattleEventDTO, BattleReportDTO, EquipSlotType, LoadoutPresetDTO } from '@/network/protocol'
import { simulateServerBattle } from '../../shared/battle.ts'
import { EQUIP_SLOT_META } from '../../shared/combatMeta.ts'
import { COMPANIONS, companionView } from '../../shared/gameData.ts'
import { createStarterCharacter } from '../../shared/player.ts'
import { trialPartId } from '../../shared/trialStages.ts'

const starter = createStarterCharacter({ id: 'fighter', nickname: '试招侠客', avatarId: 'hero_sword' }, 0)

export const player = {
  ...starter.player,
  level: 1,
  realmTier: 1,
  stats: { str: 10, con: 10, agi: 0, intStat: 10, luck: 10, karma: 0 },
}

export const loadout: LoadoutPresetDTO = {
  presetIdx: 1, name: '试招', stance: 'FIERCE',
  innerSkillId: null, outerSkillId: null, lightSkillId: null, ultSkillId: null,
  leftCompanionId: null, rightCompanionId: null,
  weaponId: null, armorId: null, accId: null, relicBookId: null,
}

export const pomiaoSet = 'pomiao_caomang'

export const pomiaoPieces = { armorId: trialPartId(pomiaoSet, 'ARMOR'), weaponId: trialPartId(pomiaoSet, 'WEAPON') }

export const flaskId = trialPartId('zuixian_xingshang', 'ACC')

export const nanBei = { leftCompanionId: 'hongqigong', rightCompanionId: 'yideng' }

export const enemy = {
  name: '试招木桩', title: '', portrait: 'bandit', hp: 20_000, atk: 250, mp: 500, stance: 'FIERCE',
} as const

export const agileEnemy = { ...enemy, stance: 'AGILE' as const }

export const baseCompanion = (id: string) => COMPANIONS[id] && companionView(COMPANIONS[id], { form: 'base' })

export function fight(patch: Partial<LoadoutPresetDTO> = {}, options: Partial<Parameters<typeof simulateServerBattle>[0]> = {}) {
  return simulateServerBattle({
    sceneTitle: '词条试招', mode: 'SOLO_STORY', player, enemyMain: enemy, surviveRounds: 2,
    ...options,
    loadout: { ...loadout, ...patch },
  })
}

export const effectEvents = (report: BattleReportDTO, sourceId: string) => report.events.filter((event) => event.effectSourceId === sourceId)

export const mainUnit = (report: BattleReportDTO) => report.units.find((unit) => unit.slot === 'ALLY_MAIN')!

export const mainCast = (report: BattleReportDTO) => report.events.find((event) => event.actorSlot === 'ALLY_MAIN' && event.type === 'SKILL_CAST')!

export const equipped = (set: string, slots: readonly EquipSlotType[]) =>
  Object.fromEntries(slots.map((slot) => [EQUIP_SLOT_META[slot].field, trialPartId(set, slot)])) as Partial<LoadoutPresetDTO>

export const flatTag = (name: string, points: number, extra: number) => ({
  type: 'tag', text: `${name} · 固定破甲 ${points.toLocaleString()} 点防御 · 增伤 +${extra.toLocaleString()}`, tone: 'gold',
})

export const fierceTag = (name: string, extra: number) => ({
  type: 'tag', text: `${name} · 刚猛外功增伤 +${extra.toLocaleString()}`, tone: 'purple',
})

export const fierceTags = (event: BattleEventDTO) =>
  event.segments.filter((segment) => segment.type === 'tag' && segment.text.includes(' · 刚猛外功增伤 +'))
