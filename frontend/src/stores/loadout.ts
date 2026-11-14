import type { CompanionWear, ForgeInput, ForgeResult, LoadoutPresetDTO, PersonalEquipSlot } from '@/network/protocol'
import {
  hiddenWeaponCapacity,
  unlockedHiddenWeapons,
  canEquipCompanionItem,
  meetsItemStatRequirement,
  ITEMS,
  SKILLS,
} from '@/config/gameData'
import { EQUIP_SLOT_META, formatSkillPower } from '@/config/uiMeta'
import { formatBattleStatBonuses } from '../../../shared/combatMeta.ts'
import { forgeEquipment, forgeMaterialLabel } from '../../../shared/equipmentForge.ts'
import { equippedGearSkill, patrolEncounterRate, trialAffixLabel } from '../../../shared/trialStages.ts'
import { MAX_SKILL_MASTERY, getSkillMasteryCap, skillFragmentDiscount, skillUpgradeCost } from '../../../shared/skillMastery.ts'
import { usePlayerStore } from './playerStore'
import { storeToRefs } from 'pinia'
import { useGameUiStore } from './gameUiStore'
import type { Ref } from 'vue'
import type { GameActions } from '@/network/gameActions'
import type { useTrial } from './trial'
import type { useCultivation } from './cultivation'

export function useLoadout({ actions, revision, trial, cultivation }: {
  actions: GameActions
  revision: Ref<number>
  trial: Pick<ReturnType<typeof useTrial>, 'mockSettlePatrol'>
  cultivation: Pick<ReturnType<typeof useCultivation>, 'settleMockIdle' | 'showIdleGain' | 'settleMockBeforeLoadoutChange'>
}) {
  const playerStore = usePlayerStore()
  const { ownedItemIds, player, presets, learnedSkills, martialStats, currentLoadout, companionAffinity } = storeToRefs(playerStore)
  const { companionOf } = playerStore
  const uiStore = useGameUiStore()
  const { appendLog, showToast } = uiStore
  const { mockSettlePatrol } = trial
  const { settleMockIdle, showIdleGain, settleMockBeforeLoadoutChange } = cultivation

  function changeEquipmentForge(input: ForgeInput) {
    const item = ITEMS[input.itemId]
    const index = ownedItemIds.value.indexOf(input.itemId)
    if (!item || index < 0) return
    function announce(result: ForgeResult) {
      const name = `【${item.name}】`
      const message = result.action === 'temper'
        ? result.success ? `${name}淬炼至 +${result.stars} 星，消耗${forgeMaterialLabel(result.iron, result.stones)}。`
          : `${name}淬炼失败，消耗 ${result.stones} 枚淬火石，累计保底 +${result.pity} 个百分点。`
        : result.action === 'salvage' ? `分解${name}，获得${forgeMaterialLabel(result.iron, result.stones)}。`
        : `${name}重铸完成，${trialAffixLabel(item, result.affixRoll)}，${formatBattleStatBonuses({ [result.secondary.stat]: result.secondary.value })}。`
      appendLog('CULTIVATE', [{ type: 'text', text: message }])
      showToast(message, 'gold')
    }
    return actions.run('forge', input, announce, () => {
      const now = Date.now()
      mockSettlePatrol(now)
      const result = forgeEquipment(player.value, item, input, {
        presets: Object.values(presets.value), now,
        settle: () => { if (now > player.value.lastSettleAt) settleMockIdle(now) },
      })
      if ('error' in result) return showToast(result.error)
      if (result.action === 'salvage') ownedItemIds.value.splice(index, 1)
      return result
    })
  }

  // ==================== 武库装配与秘籍参悟 ====================
  /** 参悟升重所需真气（代入第06册悟性减免公式）；UI 用它显示价格并判断是否买得起 */
  function getSkillUpgradeCost(skillId: string): number {
    const lv = learnedSkills.value[skillId] ?? 0
    const sk = SKILLS[skillId]
    if (!sk || lv <= 0) return 0
    return skillUpgradeCost(sk, lv, martialStats.value.intStat, currentLoadout.value.accId)
  }

  function upgradeSkillMastery(skillId: string, useFragments = false) {
    const lv = learnedSkills.value[skillId] ?? 0
    const sk = SKILLS[skillId]
    if (!sk || lv <= 0) return
    const cap = getSkillMasteryCap(sk.tier, player.value.level)
    if (lv >= cap) {
      showToast(`【经脉关隘】《${sk.name}》已达当前境界极境（第 ${cap} 重），需突破大境界方可参悟后几重！`, 'danger')
      return
    }
    if (lv >= MAX_SKILL_MASTERY) return
    return actions.run('upgradeSkill', { skillId, expectedMastery: lv, useFragments }, (result) => {
      const power = result.power
      const change = power ? `，招式威力 ×${formatSkillPower(power.before)} → ×${formatSkillPower(power.after)}` : ''
      const fragments = result.spentFragments ? `，用去 ${result.spentFragments} 张残页` : ''
      showToast(`《${sk.name}》升到第 ${result.mastery} 重${change}${fragments}，臂力 +1。`, 'gold')
    }, () => {
      const { count, spentQi: cost } = skillFragmentDiscount(sk, getSkillUpgradeCost(skillId),
        useFragments ? player.value.skillFragments?.[skillId] ?? 0 : 0)
      if (player.value.qiExp < cost) {
        showToast(`还差 ${(cost - player.value.qiExp).toLocaleString()} 真气才能升级这门武功。`, 'danger')
        return
      }
      player.value.qiExp -= cost
      if (count) player.value.skillFragments![skillId] -= count
      learnedSkills.value[skillId] = lv + 1
      player.value.stats.str += 1
      showToast(`《${sk.name}》升到第 ${lv + 1} 重${count ? `，用去 ${count} 张残页` : ''}，臂力 +1。`, 'gold')
    })
  }

  function equipItem(itemId: string) {
    const it = ITEMS[itemId]
    if (!it || !ownedItemIds.value.includes(itemId)) return
    if (!meetsItemStatRequirement(it, player.value.stats)) {
      showToast(`装备「${it.name}」需要${it.reqStat?.label}。`, 'danger')
      return
    }
    return updateLoadout({ [EQUIP_SLOT_META[it.slot].field]: itemId }, `已装备【${it.name}】`)
  }

  function equipCompanionItem(companionId: string, slot: PersonalEquipSlot, itemId: string | null) {
    const preset = currentLoadout.value
    if (companionId !== preset.leftCompanionId && companionId !== preset.rightCompanionId) return
    if (!companionAffinity.value[companionId]?.recruited) return
    const owner = companionOf(companionId)
    const item = itemId ? ITEMS[itemId] : undefined
    if (!owner || (itemId && (item?.slot !== slot || !ownedItemIds.value.includes(itemId) || !canEquipCompanionItem(owner, item)))) return
    const field = EQUIP_SLOT_META[slot].field
    const patch: Partial<LoadoutPresetDTO> = itemId && preset[field] === itemId ? { [field]: null } : {}
    if (slot === 'WEAPON') {
      const weapons = Object.fromEntries(Object.entries(preset.companionWeapons ?? {})
        .filter(([id, weapon]) => id !== companionId && weapon !== itemId))
      if (itemId) weapons[companionId] = itemId
      patch.companionWeapons = weapons
    } else {
      const equipment = Object.fromEntries(Object.entries(preset.companionEquipment ?? {}).map(([id, wear]) => [id, { ...wear }]))
      for (const [id, wear] of Object.entries(equipment)) {
        if (id === companionId || wear[slot] === itemId) delete wear[slot]
      }
      if (itemId) (equipment[companionId] ??= {})[slot] = itemId
      patch.companionEquipment = equipment
    }
    return updateLoadout(patch, item ? `${owner.name}装备了【${item.name}】` : '已卸下伙伴装备')
  }

  function equipCompanionWeapon(companionId: string, itemId: string | null) {
    return equipCompanionItem(companionId, 'WEAPON', itemId)
  }

  function saveLoadout(preset: LoadoutPresetDTO, activate: boolean, message: string) {
    return actions.run('saveLoadout', { preset, activate, expectedRevision: revision.value }, (result) => {
      if (result.gainedQi || result.gainedSilver) showIdleGain(result)
      showToast(message, 'gold')
    }, () => {
      if (patrolEncounterRate(preset.accId) !== patrolEncounterRate(currentLoadout.value.accId)) mockSettlePatrol()
      settleMockBeforeLoadoutChange(preset)
      if (activate) player.value.activePresetIdx = preset.presetIdx
      else {
        Object.assign(currentLoadout.value, preset)
        if (message !== '配装已保存') showToast(message, 'gold')
      }
    })
  }

  function updateLoadout(patch: Partial<LoadoutPresetDTO>, message = '配装已保存') {
    const next = { ...currentLoadout.value, ...patch }
    if (next.gearSkillId && !equippedGearSkill(next)) next.gearSkillId = null
    if (next.hiddenWeaponIds) {
      const available = unlockedHiddenWeapons(player.value)
      next.hiddenWeaponIds = [...new Set(next.hiddenWeaponIds)]
        .filter((id) => available.some((weapon) => weapon.id === id)).slice(0, hiddenWeaponCapacity(next))
    }
    if (next.companionWeapons) {
      next.companionWeapons = Object.fromEntries(Object.entries(next.companionWeapons).filter(([id, weapon]) =>
        (id === next.leftCompanionId || id === next.rightCompanionId) && weapon !== next.weaponId,
      ))
    }
    if (next.companionEquipment) {
      const allocated = new Set(Object.values(EQUIP_SLOT_META).map(({ field }) => next[field]))
      const entries: [string, CompanionWear][] = []
      for (const [id, wear] of Object.entries(next.companionEquipment)) {
        if (id !== next.leftCompanionId && id !== next.rightCompanionId) continue
        const equipped = Object.entries(wear).filter(([, item]) => !allocated.has(item))
        for (const [, item] of equipped) allocated.add(item)
        if (equipped.length) entries.push([id, Object.fromEntries(equipped)])
      }
      next.companionEquipment = Object.fromEntries(entries)
    }
    return saveLoadout(next, false, message)
  }

  function switchLoadout(idx: LoadoutPresetDTO['presetIdx']) {
    if (idx === player.value.activePresetIdx) return
    return saveLoadout(presets.value[idx], true, '已切换配装')
  }

  return {
    getSkillUpgradeCost,
    upgradeSkillMastery,
    equipItem,
    equipCompanionItem,
    equipCompanionWeapon,
    changeEquipmentForge,
    updateLoadout,
    switchLoadout,
  }
}
