import { computed, ref, watch } from 'vue'
import { canEquipCompanionItem, ITEMS, meetsItemStatRequirement, type ItemConfig } from '@/config/gameData'
import { EQUIP_SLOT_META } from '@/config/uiMeta'
import type { EquipSlotType } from '@/network/protocol'
import { usePlayerStore } from '@/stores/playerStore'
import { companionItemId, PERSONAL_EQUIP_SLOTS } from '../../../shared/combatMeta.ts'

export const EQUIPMENT_SLOTS = ['HEAD', 'WEAPON', 'ARMOR', 'ACC', 'WRIST', 'BELT', 'BOOTS', 'RELIC'] as const satisfies readonly EquipSlotType[]
export type EquipmentPane = EquipSlotType | 'ATTRIBUTES' | 'PREPARE' | 'FORGE'
export type EquipmentWearer = ReturnType<typeof useEquipmentWearer>

export function useEquipmentWearer() {
  const player = usePlayerStore()
  const companionId = ref<string | null>(null)
  const companions = computed(() => [...new Set([player.currentLoadout.leftCompanionId, player.currentLoadout.rightCompanionId])]
    .flatMap((id) => {
      const companion = id && player.companionOf(id)
      return companion ? [companion] : []
    }))
  const wearer = computed(() => companions.value.find((member) => member.id === companionId.value))
  watch(wearer, (member) => { if (!member) companionId.value = null })
  const wearerName = computed(() => wearer.value?.name ?? player.player.nickname)
  const wearerStats = computed(() => wearer.value?.stats ?? player.player.stats)
  const worn = computed(() => EQUIPMENT_SLOTS.flatMap((type) => {
    if (type === 'RELIC' && wearer.value) return []
    const slot = EQUIP_SLOT_META[type]
    const id = wearer.value && type !== 'RELIC' ? companionItemId(player.currentLoadout, wearer.value.id, type) : player.currentLoadout[slot.field]
    return [{ ...slot, type, item: typeof id === 'string' ? ITEMS[id] : undefined }]
  }))
  const wornBy = computed(() => {
    const owners = new Map<string, string>()
    for (const type of EQUIPMENT_SLOTS) {
      const id = player.currentLoadout[EQUIP_SLOT_META[type].field]
      if (id) owners.set(id, player.player.nickname)
    }
    for (const member of companions.value) {
      for (const slot of PERSONAL_EQUIP_SLOTS) {
        const id = companionItemId(player.currentLoadout, member.id, slot)
        if (id) owners.set(id, member.name)
      }
    }
    return owners
  })
  const stars = (id: string) => player.player.equipmentForge?.items[id]?.stars ?? 0
  function canWear(gear: ItemConfig) {
    return wearer.value ? gear.slot !== 'RELIC' && canEquipCompanionItem(wearer.value, gear)
      : meetsItemStatRequirement(gear, wearerStats.value)
  }
  return { companionId, companions, wearer, wearerName, wearerStats, worn, wornBy, stars, canWear }
}
