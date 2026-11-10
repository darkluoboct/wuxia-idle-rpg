import type { EquipSlotType, LoadoutPresetDTO, StanceType } from './protocol.ts'

export const EQUIP_SLOT_META = {
  WEAPON: { label: '武器', glyph: '兵', field: 'weaponId' },
  ARMOR: { label: '衣甲', glyph: '甲', field: 'armorId' },
  ACC: { label: '佩饰', glyph: '佩', field: 'accId' },
  RELIC: { label: '秘宝', glyph: '秘', field: 'relicBookId' },
  HEAD: { label: '头饰', glyph: '冠', field: 'headId' },
  WRIST: { label: '护腕', glyph: '腕', field: 'wristId' },
  BELT: { label: '腰带', glyph: '带', field: 'beltId' },
  BOOTS: { label: '靴子', glyph: '靴', field: 'bootsId' },
} as const satisfies Record<EquipSlotType, { label: string; glyph: string; field: keyof LoadoutPresetDTO }>

/** 三才架势：刚猛 克 奇门，奇门 克 太极，太极 克 刚猛 */
export const STANCE_META: Record<StanceType, { name: string; beats: StanceType; style: string }> = {
  FIERCE: { name: '刚猛', beats: 'AGILE', style: '正面强攻' },
  AGILE: { name: '奇门', beats: 'TAICHI', style: '灵活变招' },
  TAICHI: { name: '太极', beats: 'FIERCE', style: '挨打可反伤' },
}

export function stanceRelation(mine: StanceType, foe: StanceType): 'WIN' | 'LOSE' | 'EVEN' {
  if (mine === foe) return 'EVEN'
  return STANCE_META[mine].beats === foe ? 'WIN' : 'LOSE'
}
