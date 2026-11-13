<script setup lang="ts">
import { computed, ref } from 'vue'
import { ITEMS } from '@/config/gameData'
import { EQUIP_SLOT_META, itemBonusLabels, TIER_META } from '@/config/uiMeta'
import { useGameStore } from '@/stores/gameStore'
import { formatBattleStatBonuses } from '../../../shared/combatMeta.ts'
import { forgeBlockReason, forgeMaterialLabel, isForgeable, reforgeCost, salvageYield, temperCost, temperedItem } from '../../../shared/equipmentForge.ts'
import type { ForgeInput } from '../../../shared/protocol.ts'
import { trialAffixLabel } from '../../../shared/trialStages.ts'

const props = defineProps<{ reforge?: boolean }>()
const store = useGameStore()
const selectedId = ref('')
const lock = ref<Extract<ForgeInput, { action: 'reforge' }>['lock'] | ''>('')
const available = computed(() => store.ownedItemIds.map((id) => ITEMS[id]).filter((item) => item && isForgeable(item)))
const selected = computed(() => available.value.find(({ id }) => id === selectedId.value))
const forge = computed(() => store.player.equipmentForge)
const state = computed(() => selected.value && forge.value?.items[selected.value.id])
const cost = computed(() => temperCost(state.value?.stars ?? 0, state.value?.pity ?? 0))
const dismantled = computed(() => selected.value && salvageYield(selected.value))
const primary = computed(() => selected.value && trialAffixLabel(selected.value, store.player.equipmentAffixes?.[selected.value.id]))
const secondary = computed(() => {
  const affix = state.value?.secondary
  return affix ? formatBattleStatBonuses({ [affix.stat]: affix.value }) : ''
})
const baseStats = computed(() => selected.value ? itemBonusLabels(temperedItem(selected.value, state.value?.stars ?? 0)).join(' · ') : '')
const input = computed<ForgeInput>(() => props.reforge
  ? { action: 'reforge', itemId: selectedId.value, lock: lock.value || undefined }
  : { action: 'temper', itemId: selectedId.value })
const block = computed(() => selected.value && forgeBlockReason(store.player, selected.value, input.value, store.worldTime))
const salvageBlock = computed(() => selected.value && forgeBlockReason(store.player, selected.value,
  { action: 'salvage', itemId: selected.value.id }, store.worldTime, Object.values(store.presets)))

function salvage() {
  const item = selected.value
  const materials = dismantled.value
  if (!item || !materials || salvageBlock.value) return
  store.askConfirm({
    title: `分解${item.name}`,
    body: `分解后将失去这件装备并获得${forgeMaterialLabel(materials.iron, materials.stones)}。`,
    confirmText: '确认分解', tone: 'danger',
    onConfirm: () => store.changeEquipmentForge({ action: 'salvage', itemId: item.id }),
  })
}
</script>

<template>
  <section class="well space-y-2 p-3" :aria-label="reforge ? '鬼市铁匠炉' : '装备淬炼'">
    <h3 class="sec-title">{{ reforge ? '鬼市铁匠炉' : '装备淬炼' }}</h3>
    <p v-if="reforge" class="hint">嘉兴南湖 · 北京时间 23:00–00:59。重铸会随机替换未锁定的词条。</p>
    <template v-else>
      <p class="text-sm text-gold">{{ forgeMaterialLabel(forge?.iron ?? 0, forge?.stones ?? 0) }}</p>
      <p class="hint">每次巡历遭遇各得 1 份材料，分解闲置的凡品、良品装备也可获得。每星提升 10% 基础属性。</p>
    </template>
    <label class="block space-y-1 text-sm">
      <span>选择装备</span>
      <select v-model="selectedId" class="field w-full" @change="lock = ''">
        <option value="" disabled>选择一件已持有的装备</option>
        <option v-for="item in available" :key="item.id" :value="item.id">
          {{ item.name }} · {{ EQUIP_SLOT_META[item.slot].label }} · {{ TIER_META[item.tier].label }}{{ forge?.items[item.id]?.stars ? ` +${forge.items[item.id].stars} 星` : '' }}
        </option>
      </select>
    </label>
    <template v-if="selected">
      <p class="hint">{{ baseStats }}</p>
      <p v-if="primary" class="hint">主词条 · {{ primary }}</p>
      <p v-if="secondary" class="hint">副词条 · {{ secondary }}</p>
      <label v-if="reforge" class="block space-y-1 text-sm">
        <span>锁定词条</span>
        <select v-model="lock" class="field w-full">
          <option value="">不锁定</option>
          <option value="primary" :disabled="!primary">保留主词条</option>
          <option value="secondary" :disabled="!secondary">保留副词条</option>
        </select>
      </label>
      <p v-else-if="cost" class="hint">升至 {{ (state?.stars ?? 0) + 1 }} 星 · 成功率 {{ cost.rate }}% · {{ forgeMaterialLabel(cost.iron, cost.stones) }}</p>
      <p v-if="block" class="hint text-cinnabar">{{ block }}</p>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm btn-gold" :disabled="!!block || store.onlineActionBusy" @click="store.changeEquipmentForge(input)">
          {{ reforge ? `重铸 · ${reforgeCost(!!lock)} 两纹银` : '淬炼升星' }}
        </button>
        <button v-if="!reforge && dismantled" class="btn btn-sm" :disabled="!!salvageBlock || store.onlineActionBusy" @click="salvage">
          分解 · {{ forgeMaterialLabel(dismantled.iron, dismantled.stones) }}
        </button>
      </div>
      <p v-if="!reforge && dismantled" class="hint">{{ salvageBlock || '分解前需从所有配装中卸下。' }}</p>
    </template>
  </section>
</template>
