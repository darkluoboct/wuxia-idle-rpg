import { EQUIP_SLOT_META, PERSONAL_EQUIP_SLOTS } from './combatMeta.ts'
import { equipmentItem, ITEMS, SECTS, SKILLS, type SkillConfig } from './gameData.ts'
import type { LoadoutPresetDTO, PlayerDTO, SixStats } from './protocol.ts'
import { NILUAN_MARTIAL_FREEDOM } from './trialStages.ts'
import { activeSectEquipmentSets } from './sectEquipment.ts'

export type MartialSchoolMember = Pick<PlayerDTO, 'currentSectId' | 'graduatedSectIds'>

const schools = new Map(SECTS.map((sect) => [sect.id, sect]))
const origins = new Map<string, string>()
for (const { id, signatureSkills } of SECTS) {
  for (const skillId of signatureSkills.flat()) {
    if (!origins.has(skillId)) origins.set(skillId, id)
  }
}

const otherOrigins = [
  ['gaibang', '丐帮', 'gaibang_lianhua_jue xiaoyaoyou_quan gaibang_tongchui jiaohua_bang lianhua_luo_bu kanglong_youhui feilong_zaitian'],
  ['quanzhen', '全真教', 'chongyang_ziqi lvshuang_pobing chongyang_jianfa quanzhen_jianfa qixing_bu tonggui_jianfa dingyang_zhen'],
  ['baituo', '白驼山庄', 'nizhuan_jingmai baituo_daoyin'],
  ['tiezhang', '湘西铁掌帮', 'tiezhang_pikan'],
  ['yideng', '大理一灯居', 'kurong_changong dali_chanshi_jue wuluo_qingyan duanjia_jianfa'],
  ['jiuyin', '九阴真经', 'jiuyin_zonggang yijin_duangu feixu_jin da_fumo_quan baimang_bian luoxuan_jiuying shexing_lifan yihun_dafa'],
  ['heifeng', '黑风双煞', 'jiuyin_baiguzhua jiuyin_cuixin_jue cuixin_zhang'],
  ['qiguai', '江南七怪', 'yuenv_jian nanshan_zhang kaishan_fu tuniu_daofa jinlong_bian yanqing_quan miaoshou_kongkong fumo_zhang zheshan_dianxue huyan_qiang dagan_dianxue tingfeng_bianwei feitian_shending luanpi_chai shisheng_chuang'],
  ['yangjia', '杨家', 'yangjia_qiang huima_qiang'],
  ['wandong', '老顽童一脉', 'kongming_quan shuangshou_hubo'],
  ['yinggu', '黑沼瑛姑', 'niqiu_gong hanyin_shenjian'],
  ['shaolin', '少林', 'shaolin_luohan_neigong luohan_quan'],
  ['mizong', '西域密宗', 'mizong_da_shou dashouyin'],
  ['xiaoyao', '逍遥派', 'lingbo_weibu'],
  ['dugu', '独孤剑脉', 'dugu_jiujian'],
  ['jiuyang', '九阳神功', 'jiuyang_shengong'],
  ['mongol', '蒙古弓术', 'lianzhu_shenjian'],
  ['huanghe', '黄河帮', 'duanhun_qiang'],
  ['duanmen', '五虎断门', 'wuhu_duanmen_dao duanmen_pikan'],
] as const

const originNames = new Map<string, string>(otherOrigins.map(([id, name]) => [id, name]))
for (const [id, , skillIds] of otherOrigins) {
  for (const skillId of skillIds.split(' ')) origins.set(skillId, id)
}

export function martialOrigin(skill: SkillConfig) {
  const id = skill.sectId ?? origins.get(skill.id) ?? 'jianghu'
  return { id, name: schools.get(id)?.name ?? originNames.get(id) ?? '江湖通传' }
}

export function hasMartialFreedom(loadout: LoadoutPresetDTO) {
  return PERSONAL_EQUIP_SLOTS.filter((slot) => {
    const id = loadout[EQUIP_SLOT_META[slot].field]
    const item = typeof id === 'string' ? ITEMS[id] : undefined
    return item?.slot === slot && item.setId === NILUAN_MARTIAL_FREEDOM.setId
  }).length >= NILUAN_MARTIAL_FREEDOM.pieces
}

export function martialEffectiveness(skill: SkillConfig, player?: MartialSchoolMember, freedom = false) {
  if (freedom) return 100
  const school = schools.get(player?.currentSectId ?? '')
  if (!school || school.signatureSkills.some((rank) => rank.includes(skill.id))) return 100
  const origin = martialOrigin(skill).id
  if (origin === school.id) return 100
  if (skill.slot === 'INNER' && (skill.tier === 'red' || skill.id === 'xiantian_gong') && player?.graduatedSectIds?.includes(origin)) return 80
  const alignment = origin === 'heifeng' ? 'HERETIC' : schools.get(origin)?.alignment
  return (school.alignment === 'RIGHTEOUS' && alignment === 'HERETIC') ||
    (school.alignment === 'HERETIC' && alignment === 'RIGHTEOUS') ? 70 : 100
}

export function equippedMartialSkills(loadout: LoadoutPresetDTO) {
  return [
    [loadout.innerSkillId, 'INNER'], [loadout.outerSkillId, 'OUTER'],
    [loadout.lightSkillId, 'LIGHT'], [loadout.ultSkillId, 'ULT'],
  ].flatMap(([id, slot]) => {
    const skill = id ? SKILLS[id] : undefined
    return skill?.slot === slot ? [skill] : []
  })
}

export const WANDERER_MASTERY = { id: 'wanderer_mastery', name: '兼收并蓄', statPercent: 20, comboPoints: 15 } as const

export function hasWandererMastery(player: Pick<PlayerDTO, 'currentSectId'>, skills: readonly SkillConfig[]) {
  return !player.currentSectId && new Set(skills.map((skill) => martialOrigin(skill).id)).size === 4
}

export function wandererStatBonuses(stats: SixStats): SixStats {
  const bonus = (value: number) => Math.round(value * WANDERER_MASTERY.statPercent / 100)
  return {
    str: bonus(stats.str), con: bonus(stats.con), agi: bonus(stats.agi), intStat: bonus(stats.intStat), luck: bonus(stats.luck),
    karma: clampKarma(stats.karma + bonus(stats.karma)) - stats.karma,
  }
}

export const clampKarma = (karma: number) => Math.max(-1000, Math.min(1000, karma))

export function effectiveMartialStats(player: Pick<PlayerDTO, 'currentSectId' | 'stats' | 'equipmentForge' | 'equipmentAffixes'>, loadout: LoadoutPresetDTO): SixStats {
  const stats = { ...player.stats }
  if (hasWandererMastery(player, equippedMartialSkills(loadout))) {
    const bonus = wandererStatBonuses(stats)
    for (const key of Object.keys(bonus) as (keyof SixStats)[]) stats[key] += bonus[key]
  }
  for (const slot of PERSONAL_EQUIP_SLOTS) {
    const id = loadout[EQUIP_SLOT_META[slot].field]
    const item = typeof id === 'string' ? equipmentItem(id, player) : undefined
    if (item?.slot !== slot || !item.attributeBonus) continue
    for (const key of Object.keys(item.attributeBonus) as (keyof SixStats)[]) stats[key] += item.attributeBonus[key] ?? 0
  }
  for (const set of activeSectEquipmentSets(loadout)) {
    const bonus = set.attributeBonus ?? {}
    for (const key of Object.keys(bonus) as (keyof SixStats)[]) stats[key] += bonus[key] ?? 0
  }
  stats.karma = clampKarma(stats.karma)
  return stats
}
