import type { BattleEffect } from './battleEffects.ts'
import { EQUIP_SLOT_META, PERSONAL_EQUIP_SLOTS, type AttackForm } from './combatMeta.ts'
import type { ItemConfig } from './gameData.ts'
import type { LoadoutPresetDTO, PersonalEquipSlot, PlayerDTO, TierColor } from './protocol.ts'

interface SectEquipmentSet {
  id: string
  name: string
  sectId: string
  rank: number
  tier: Extract<TierColor, 'blue' | 'purple' | 'orange'>
  parts: readonly { slot: PersonalEquipSlot; name: string; combatForm?: AttackForm }[]
  bonus: string
  idleQiBonus?: number
  attributeBonus?: ItemConfig['attributeBonus']
  battleEffects?: readonly BattleEffect[]
}

export const SECT_EQUIPMENT_SETS: readonly SectEquipmentSet[] = [
  { id: 'sect_quanzhen_zhike', name: '全真知客道巾套', sectId: 'quanzhen', rank: 1, tier: 'blue',
    parts: [{ slot: 'ARMOR', name: '全真青袍' }, { slot: 'HEAD', name: '木簪' }, { slot: 'BOOTS', name: '麻布履' }],
    bonus: '打坐真气 +15%。', idleQiBonus: 15 },
  { id: 'sect_quanzhen_chongyang', name: '三代重阳剑修套', sectId: 'quanzhen', rank: 3, tier: 'purple',
    parts: [{ slot: 'ARMOR', name: '紫霞道袍' }, { slot: 'WEAPON', name: '七星拂尘', combatForm: 'ODD' }, { slot: 'BELT', name: '乾坤带' }],
    bonus: '内力压制增伤降低 25%。', battleEffects: [{ kind: 'INNER_PRESSURE_REDUCTION', percent: 25 }] },
  { id: 'sect_gaibang_xingqi', name: '一袋行乞麻布套', sectId: 'gaibang', rank: 1, tier: 'blue',
    parts: [{ slot: 'ARMOR', name: '粗麻短打' }, { slot: 'WEAPON', name: '枣木竹棍', combatForm: 'STAFF' }],
    bonus: '丐帮弟子的化缘差事纹银 +20%。' },
  { id: 'sect_gaibang_pozhen', name: '六袋破阵精锐套', sectId: 'gaibang', rank: 3, tier: 'purple',
    parts: [{ slot: 'WRIST', name: '熟皮铁护腕' }, { slot: 'ARMOR', name: '粗皮护心甲' }, { slot: 'WEAPON', name: '分水钢杖', combatForm: 'STAFF' }],
    bonus: '刚猛架势暴击率 +12 个百分点。', battleEffects: [{ kind: 'STAT_BONUS', stance: 'FIERCE', stats: { crit: 12 } }] },
  { id: 'sect_taohua_saohua', name: '扫花童子青布套', sectId: 'taohua', rank: 1, tier: 'blue',
    parts: [{ slot: 'ARMOR', name: '青布长衫' }, { slot: 'HEAD', name: '竹发簪' }],
    bonus: '奇门架势闪避率 +8 个百分点。', battleEffects: [{ kind: 'STAT_BONUS', stance: 'AGILE', stats: { dodge: 8 } }] },
  { id: 'sect_taohua_rushi', name: '入室真传雅客套', sectId: 'taohua', rank: 3, tier: 'purple',
    parts: [{ slot: 'ARMOR', name: '落英丝绸衫' }, { slot: 'HEAD', name: '碧玉簪' }, { slot: 'ACC', name: '奇门算盘' }],
    bonus: '悟性 +20，参悟按提升后的实际悟性计算。', attributeBonus: { intStat: 20 } },
  { id: 'sect_baituo_bushe', name: '捕蛇杂役皮甲套', sectId: 'baituo', rank: 1, tier: 'blue',
    parts: [{ slot: 'ARMOR', name: '熟皮软甲' }, { slot: 'WRIST', name: '蛇皮缠手' }],
    bonus: '毒伤减免 20%。', battleEffects: [{ kind: 'PERIODIC_REDUCTION', category: 'poison', percent: 20 }] },
  { id: 'sect_baituo_sidu', name: '饲毒使者锦缎套', sectId: 'baituo', rank: 2, tier: 'purple',
    parts: [{ slot: 'ARMOR', name: '金丝白袍' }, { slot: 'WEAPON', name: '蛇骨软鞭', combatForm: 'WHIP' }, { slot: 'ACC', name: '雄黄囊' }],
    bonus: '外功命中施加 2 回合流血与朱砂血毒，二者每回合各扣攻击力的 8%。',
    battleEffects: [
      { kind: 'PERIODIC_ON_HIT', attack: 'OUTER', rule: { status: 'bleed', attackPercent: 8, rounds: 2 } },
      { kind: 'PERIODIC_ON_HIT', attack: 'OUTER', rule: { status: 'cinnabar', attackPercent: 8, rounds: 2 } },
    ] },
  { id: 'sect_quanzhen_hufa', name: '北斗护法真人套', sectId: 'quanzhen', rank: 4, tier: 'orange',
    parts: [{ slot: 'ARMOR', name: '纯阳九曜法服' }, { slot: 'WEAPON', name: '龙渊重剑', combatForm: 'BLADE' },
      { slot: 'ACC', name: '纯阳玉佩' }, { slot: 'HEAD', name: '北斗星冠' }],
    bonus: '纯阳罡气：开战时为穿戴者施加其内力上限 30% 的护盾。',
    battleEffects: [{ kind: 'ROUND_START_SHIELD', maxMpPercent: 30, openingSelfOnly: true }] },
  { id: 'sect_gaibang_zhanglao', name: '九袋降龙长老套', sectId: 'gaibang', rank: 4, tier: 'orange',
    parts: [{ slot: 'ARMOR', name: '金丝百衲衣' }, { slot: 'BELT', name: '降魔伏虎带' }, { slot: 'ACC', name: '叫花醉葫芦' },
      { slot: 'WRIST', name: '九袋伏虎护腕' }],
    bonus: '降龙之怒：每损失 10% 最大气血，攻击 +10%。低于 10% 气血时，本次招式伤害翻倍。',
    battleEffects: [{ kind: 'WOUNDED_DAMAGE', hpStepPercent: 10, attackPercent: 10, critDamagePercent: 0 },
      { kind: 'WOUNDED_DAMAGE', belowHpPercent: 10, attackPercent: 0, critDamagePercent: 0, damageMultiplier: 2 }] },
  { id: 'sect_taohua_yibo', name: '东邪衣钵圣客套', sectId: 'taohua', rank: 5, tier: 'orange',
    parts: [{ slot: 'ARMOR', name: '青玉海潮法袍' }, { slot: 'ACC', name: '碧玉箫佩件' }, { slot: 'BOOTS', name: '踏云飞履' },
      { slot: 'WRIST', name: '碧海玉丝护腕' }],
    bonus: '碧海迷踪：闪避后点住本次来袭者，下回合出手速度降低 20%。',
    battleEffects: [{ kind: 'DODGE_STATUS', rule: { status: 'SLOW', rounds: 1, percent: 20, nextRound: true } }] },
  { id: 'sect_baituo_shaozhuang', name: '西毒少庄主尊崇套', sectId: 'baituo', rank: 5, tier: 'orange',
    parts: [{ slot: 'ARMOR', name: '狂蟾逆鳞裘' }, { slot: 'WRIST', name: '灵蛇护腕' }, { slot: 'ACC', name: '碧落玉佩' },
      { slot: 'HEAD', name: '白驼蛇纹冠' }],
    bonus: '万毒噬体：暴击消耗命中目标的全部毒素，按剩余基础跳伤总额造成真伤。',
    battleEffects: [{ kind: 'CRIT_POISON_BURST' }] },
]

export function sectEquipmentPartId(setId: string, slot: PersonalEquipSlot) {
  return `${setId}_${slot.toLowerCase()}`
}

const partStats = {
  blue: { weaponAttack: 45, wristAttack: 12, armorDefense: 45, armorHp: 400, accessoryHp: 120, dodge: 2 },
  purple: { weaponAttack: 85, wristAttack: 28, armorDefense: 85, armorHp: 800, accessoryHp: 260, dodge: 4 },
  orange: { weaponAttack: 160, wristAttack: 55, armorDefense: 170, armorHp: 1500, accessoryHp: 520, dodge: 6 },
} as const

export const SECT_EQUIPMENT_ITEMS: ItemConfig[] = SECT_EQUIPMENT_SETS.flatMap((set) => set.parts.map((part) => ({
  ...part,
  id: sectEquipmentPartId(set.id, part.slot),
  tier: set.tier,
  setId: set.id,
  sectId: set.sectId,
  ...(part.slot === 'WEAPON' ? { atkBonus: partStats[set.tier].weaponAttack } : {}),
  ...(part.slot === 'WRIST' ? { atkBonus: partStats[set.tier].wristAttack } : {}),
  ...(part.slot === 'ARMOR' ? { defBonus: partStats[set.tier].armorDefense, hpBonus: partStats[set.tier].armorHp } : {}),
  ...(part.slot === 'HEAD' || part.slot === 'BELT' || part.slot === 'ACC' ? { hpBonus: partStats[set.tier].accessoryHp } : {}),
  ...(part.slot === 'BOOTS' ? { dodgeBonus: partStats[set.tier].dodge } : {}),
  desc: `${set.name}部件。${set.parts.length} 件齐穿时${set.bonus}`,
})))

export const sectEquipmentSetOf = (id: string) => SECT_EQUIPMENT_SETS.find((set) => set.id === id)

export function activeSectEquipmentSets(loadout: LoadoutPresetDTO) {
  return SECT_EQUIPMENT_SETS.filter((set) => set.parts.every(({ slot }) => loadout[EQUIP_SLOT_META[slot].field] === sectEquipmentPartId(set.id, slot)))
}

export function sectEquipmentRewardIds(sectId: string, rank: number) {
  const ids = SECT_EQUIPMENT_SETS.filter((set) => set.sectId === sectId && set.rank <= rank)
    .flatMap((set) => set.parts.map(({ slot }) => sectEquipmentPartId(set.id, slot)))
  if (sectId === 'quanzhen' && rank >= 3) ids.push('beidou_formation_book')
  return ids
}

export function gaibangBeggingSilver(loadout: LoadoutPresetDTO) {
  return activeSectEquipmentSets(loadout).some(({ id }) => id === 'sect_gaibang_xingqi') ? 120 : 100
}

export const WANDERER_EQUIPMENT = {
  id: 'wanderer_qianji', name: '千机任侠套装', sourceName: '百家无拘', stage: 13,
  pointsPerSchool: 5, maxPercent: 30, mapId: 'jiaxing_suburb',
  items: [
    { id: 'wanderer_qianji_armor', name: '千机任侠长衫', slot: 'ARMOR', tier: 'purple', defBonus: 85, hpBonus: 800,
      desc: '散人穿戴时，其他装备每有一个不同的门派出处，全队伤害 +5%，最高 +30%。同队取最高。' },
    { id: 'wanderer_qianji_belt', name: '千机任侠腰带', slot: 'BELT', tier: 'purple', hpBonus: 260,
      desc: '散人穿戴时，其他装备每有一个不同的门派出处，全队伤害 +5%，最高 +30%。同队取最高。' },
  ] as const satisfies readonly ItemConfig[],
}

export function eligibleWandererEquipment(player: Pick<PlayerDTO, 'currentSectId' | 'trial'>) {
  return !player.currentSectId && player.trial.rewardedStageIds.includes(WANDERER_EQUIPMENT.stage)
}

export function equippedSchoolOrigins(loadout: LoadoutPresetDTO, itemOf: (id: string) => ItemConfig | undefined) {
  const origins = new Set<string>()
  for (const slot of PERSONAL_EQUIP_SLOTS) {
    const id = loadout[EQUIP_SLOT_META[slot].field]
    const item = typeof id === 'string' ? itemOf(id) : undefined
    if (item?.slot === slot && item.sectId) origins.add(item.sectId)
  }
  return origins
}

export function wandererEquipmentBonus(sectId: string | null, loadout: LoadoutPresetDTO, itemOf: (id: string) => ItemConfig | undefined) {
  if (sectId || !WANDERER_EQUIPMENT.items.some(({ id, slot }) => loadout[EQUIP_SLOT_META[slot].field] === id)) return 0
  return Math.min(WANDERER_EQUIPMENT.maxPercent, equippedSchoolOrigins(loadout, itemOf).size * WANDERER_EQUIPMENT.pointsPerSchool)
}
