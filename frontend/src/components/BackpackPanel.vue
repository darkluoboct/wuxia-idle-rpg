<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { backpackCapacity, HERBS, ITEMS, MEDICINES, SKILLS, type ItemConfig } from '@/config/gameData'
import { equipmentType, EQUIP_SLOT_META, medicineType, TIER_META } from '@/config/uiMeta'
import { EQUIPMENT_SLOTS as slotOrder, type EquipmentWearer } from '@/composables/useEquipmentWearer'
import type { EquipSlotType, TierColor } from '@/network/protocol'
import { useGameStore } from '@/stores/gameStore'
import { usePlayerStore } from '@/stores/playerStore'
import ItemIcon from './ItemIcon.vue'
import ItemPopover from './ItemPopover.vue'
import ItemCardHeading from './ItemCardHeading.vue'
import ItemDetailCard from './ItemDetailCard.vue'

const props = defineProps<{ context: EquipmentWearer; initialItem?: string; slotRequest: { slot: EquipSlotType } | null }>()
const emit = defineEmits<{ skill: [id: string]; backToRole: []; prepare: []; selectWearer: [id: string | null] }>()
const store = useGameStore()
const player = usePlayerStore()
const { wearer, wearerName, worn, wornBy, stars, canWear } = props.context
const root = ref<HTMLElement>()
const bagHeading = ref<HTMLElement>()
const medicineStock = computed(() => player.player.battleMedicines ?? {})
const owned = computed(() => player.ownedItemIds
  .map((id) => ITEMS[id])
  .filter(Boolean)
  .sort((a, b) => TIER_META[b.tier].rank - TIER_META[a.tier].rank))
const backpack = computed(() => owned.value.filter((gear) => !wornBy.value.has(gear.id)))
const wearerGear = computed(() => new Set(worn.value.map((slot) => slot.item?.id)))

function openAlchemy() {
  store.marketTab = 'ALCHEMY'
  store.selectTab('MARKET')
}

const categories = [
  { id: 'ALL', label: '全部' },
  { id: 'GEAR', label: '装备' }, { id: 'MEDICINE', label: '丹药' },
  { id: 'HERB', label: '药材' }, { id: 'FRAGMENT', label: '残页' },
] as const
type Category = typeof categories[number]['id']
type Supply = { id: string; name: string; tier: TierColor; count: number; desc: string; source?: string; iconId?: string; glyph: string; kind: Category; type: string }
const category = ref<Category>('ALL')
const includesGear = computed(() => category.value === 'ALL' || category.value === 'GEAR')
const anchor = shallowRef<HTMLElement>()
const skillTrigger = ref('')
const slotFilter = ref<EquipSlotType | 'ALL'>('ALL')
const showStorage = ref(false)
const selectedId = ref<string>()
const returnSlot = computed(() => props.slotRequest?.slot)
const showComparison = ref(false)
const equipMessage = ref('')

const bagCapacity = computed(() => backpackCapacity(player.currentLoadout))
const pillSlot = computed(() => Number(player.pillCount > 0))
const carriedSlots = computed(() => bagCapacity.value - pillSlot.value)
const carriedCount = computed(() => Math.min(backpack.value.length, carriedSlots.value) + pillSlot.value)
const carried = computed(() => backpack.value.slice(0, carriedSlots.value))
const storage = computed(() => backpack.value.slice(carriedSlots.value))
const matchesSlot = (item: ItemConfig) => slotFilter.value === 'ALL' || item.slot === slotFilter.value
const matchingStorage = computed(() => storage.value.filter(matchesSlot))
const visibleGear = computed(() => {
  if (!includesGear.value) return []
  if (showStorage.value) return matchingStorage.value
  const carriedIds = new Set(carried.value.map((gear) => gear.id))
  return owned.value.filter((gear) => matchesSlot(gear) && (carriedIds.has(gear.id) || (returnSlot.value ? wearerGear.value : wornBy.value).has(gear.id)))
})
const supplies = computed<Supply[]>(() => {
  const result: Supply[] = []
  for (const medicine of Object.values(MEDICINES)) {
    const stock = medicine.category === 'BATTLE_PILL' || medicine.category === 'WEAPON_VENOM'
      ? medicineStock.value : player.pillInventory
    const count = stock[medicine.id] ?? 0
    if (count > 0) result.push({ ...medicine, count, desc: medicine.effectDesc, glyph: '丹', kind: 'MEDICINE', type: medicineType(medicine) })
  }
  for (const [id, count] of Object.entries(player.herbInventory)) {
    const herb = HERBS[id]
    if (herb && count > 0) result.push({ ...herb, count, source: herb.mapName, glyph: '药', kind: 'HERB', type: '材料 · 药材' })
  }
  for (const [id, count] of Object.entries(player.player.skillFragments ?? {})) {
    const skill = SKILLS[id]
    if (!skill || count <= 0) continue
    const desc = player.learnedSkills[id] ? '参悟同名武学时可用残页抵扣真气。' : '习得同名武学后，可在参悟时用残页抵扣真气。'
    result.push({ id, name: `《${skill.name}》残页`, tier: skill.tier, count, desc, iconId: 'skill-fragment', glyph: '卷', kind: 'FRAGMENT', type: '武学材料 · 残页' })
  }
  return result
})
const visibleSupplies = computed(() => showStorage.value ? [] : supplies.value.filter((entry) => category.value === 'ALL' || category.value === entry.kind))
const selectedGear = computed(() => owned.value.find((item) => item.id === selectedId.value))
const selectedSupply = computed(() => supplies.value.find(({ id }) => id === selectedId.value))
const selectedEntry = computed(() => selectedGear.value ?? selectedSupply.value)
const comparedItem = computed(() => selectedGear.value && worn.value.find(({ type }) => type === selectedGear.value?.slot)?.item)
const equippedBy = computed(() => selectedGear.value && wornBy.value.get(selectedGear.value.id))
const alreadyWorn = computed(() => !!equippedBy.value)
const canCompare = computed(() => !alreadyWorn.value && (!!comparedItem.value || !!returnSlot.value))
const comparing = computed(() => showComparison.value && canCompare.value)
const meetsRequirement = computed(() => !!selectedGear.value && canWear(selectedGear.value))

const supplyAction = computed(() => {
  const supply = selectedSupply.value
  if (!supply) return undefined
  if (supply.kind === 'HERB' && store.featureOpen('MAPS')) return { label: '去百草丹房', run: openAlchemy }
  if (supply.kind === 'FRAGMENT' && store.learnedSkills[supply.id]) {
    return { label: '查看武学', run: () => { skillTrigger.value = supply.id; emit('skill', supply.id) } }
  }
  const medicine = supply.kind === 'MEDICINE' ? MEDICINES[supply.id] : undefined
  if (medicine?.category === 'BATTLE_PILL' || medicine?.category === 'WEAPON_VENOM') {
    return { label: '去战备', run: () => emit('prepare') }
  }
  const effect = medicine?.acupointEffect?.type
  if (effect === 'BREAKTHROUGH_RATE' || effect === 'PREVENT_DEVIATION') {
    return { label: '去修行', run: () => store.selectTab('CULTIVATE') }
  }
  if (effect) return { label: '去经脉冲穴', run: () => { store.selectTab('ARSENAL'); store.arsenalTab = 'MERIDIAN' } }
  return undefined
})
function selectItem(id?: string, trigger?: EventTarget | null) {
  selectedId.value = id
  anchor.value = trigger instanceof HTMLElement ? trigger : undefined
  showComparison.value = !!returnSlot.value
  equipMessage.value = ''
}

function filterCategory(next: Category) {
  if (category.value === next) return
  category.value = next
  slotFilter.value = 'ALL'
  showStorage.value = false
  selectItem()
}


watch(() => props.slotRequest, async (request) => {
  if (!request || props.initialItem) return
  category.value = 'GEAR'
  slotFilter.value = request.slot
  showStorage.value = !carried.value.some(matchesSlot) && matchingStorage.value.length > 0
  selectItem()
  await nextTick()
  bagHeading.value?.focus({ preventScroll: true })
}, { immediate: true, flush: 'post' })

function closeItem(restoreFocus = true) {
  const id = selectedId.value
  selectItem()
  if (id && restoreFocus) void nextTick(() => {
    const trigger = root.value?.querySelector<HTMLElement>(`[data-bag-item="${CSS.escape(id)}"]`)
    const target = trigger ?? bagHeading.value
    target?.focus({ preventScroll: true })
  })
}
onDeactivated(() => closeItem(false))
onActivated(() => {
  if (!skillTrigger.value) return
  root.value?.querySelector<HTMLElement>(`[data-bag-item="${CSS.escape(skillTrigger.value)}"]`)?.focus({ preventScroll: true })
  skillTrigger.value = ''
})
watch(() => props.initialItem, async (id) => {
  if (!id) return
  emit('selectWearer', null)
  category.value = 'ALL'
  slotFilter.value = 'ALL'
  showStorage.value = storage.value.some((gear) => gear.id === id)
  await nextTick()
  const tile = root.value?.querySelector<HTMLElement>(`[data-bag-item="${CSS.escape(id)}"]`)
  if (tile) { tile.focus(); selectItem(id, tile) }
}, { immediate: true, flush: 'post' })
function useSupply() {
  const action = supplyAction.value
  if (!action) return
  action.run()
  closeItem(false)
}

async function equipSelected() {
  const candidate = selectedGear.value
  if (!candidate || alreadyWorn.value || !meetsRequirement.value || store.onlineActionBusy) return
  if (!wearer.value) await store.equipItem(candidate.id)
  else if (candidate.slot !== 'RELIC') await store.equipCompanionItem(wearer.value.id, candidate.slot, candidate.id)
  if (selectedId.value === candidate.id && worn.value.some(({ item: gear }) => gear?.id === candidate.id)) {
    closeItem()
    equipMessage.value = `已为${wearerName.value}穿戴「${candidate.name}」。`
  }
}


function onEscape(event: KeyboardEvent) {
  if (store.confirmDialog || store.inspectModal) return
  if (selectedEntry.value) closeItem()
  else if (returnSlot.value) emit('backToRole')
  else return
  event.stopPropagation()
  event.preventDefault()
}
</script>

<template>
  <div ref="root" class="equipment-panel bag-layout" @keydown.esc="onEscape">
    <section class="equip-pane" aria-label="背包">
      <header class="equip-heading">
        <button v-if="returnSlot" type="button" class="btn btn-sm" @click="emit('backToRole')"><ArrowLeft aria-hidden="true" />返回角色</button>
        <h2 ref="bagHeading" class="sec-title" tabindex="-1">随身物品</h2>
        <span role="status">{{ equipMessage }}</span>
        <span title="穿戴的装备不计入随身容量，破障丹占一格">随身 {{ carriedCount }} / {{ bagCapacity }} 格</span>
      </header>
      <div class="equip-options" role="group" aria-label="物品分类">
        <button v-for="entry in categories" :key="entry.id" type="button" class="btn btn-sm"
          :aria-pressed="category === entry.id" @click="filterCategory(entry.id)">{{ entry.label }}</button>
      </div>
      <div v-if="includesGear" class="bag-filter">
        <label class="flex items-center gap-2"><span>部位</span>
          <select v-model="slotFilter" class="field" aria-label="装备部位" @change="category = 'GEAR'; selectItem()">
            <option value="ALL">全部</option>
            <option v-for="slot in slotOrder" :key="slot" :value="slot">{{ EQUIP_SLOT_META[slot].label }}</option>
          </select>
        </label>
        <span class="text-ink3">穿戴者 · {{ wearerName }}</span>
        <div class="equip-buttons" role="group" aria-label="物品位置">
          <button type="button" class="btn btn-sm" :aria-pressed="!showStorage" @click="showStorage = false; selectItem()">随身</button>
          <button type="button" class="btn btn-sm" :aria-pressed="showStorage" @click="showStorage = true; selectItem()">行囊 · {{ matchingStorage.length }}</button>
        </div>
      </div>
      <div class="equip-scroll">
        <p v-if="!visibleGear.length && !visibleSupplies.length" class="equip-empty">{{ showStorage ? '行囊里没有符合条件的装备。' : '此分类暂无物品。' }}</p>
        <div class="bag-grid">
            <button v-for="gear in visibleGear" :key="gear.id" type="button" class="bag-tile" :class="TIER_META[gear.tier].cls"
              :data-bag-item="gear.id" aria-haspopup="dialog" :aria-description="wornBy.has(gear.id) ? wornBy.get(gear.id) + '已穿戴，数量 1' : '数量 1'" :aria-label="gear.name" :title="gear.name" @click="selectItem(gear.id, $event.currentTarget)">
              <ItemIcon :item-id="gear.id" :glyph="EQUIP_SLOT_META[gear.slot].glyph" class="gear-icon" />
              <span v-if="wornBy.has(gear.id)" class="worn-tag">已穿戴</span><small class="tile-count">×1</small>
              <b class="tier-text">{{ gear.name }}</b>
            </button>
          <button v-for="entry in visibleSupplies" :key="entry.id" type="button" class="bag-tile" :class="TIER_META[entry.tier].cls"
            :data-bag-item="entry.id" aria-haspopup="dialog" :aria-label="entry.name" :aria-description="`数量 ${entry.count}`" :title="entry.name" @click="selectItem(entry.id, $event.currentTarget)">
            <ItemIcon :item-id="entry.iconId ?? entry.id" :glyph="entry.glyph" class="gear-icon" />
            <b class="tier-text">{{ entry.name }}</b>
            <small class="tile-count">×{{ entry.count.toLocaleString() }}</small>
          </button>
        </div>
      </div>
    </section>


    <ItemPopover v-if="anchor && selectedEntry" :key="selectedId" :anchor="anchor" :wide="comparing"
      class="equip-pane detail-pane" :class="TIER_META[selectedEntry.tier].cls" :aria-label="selectedEntry.name" @dismiss="closeItem(false)">
      <ItemCardHeading v-if="selectedGear" :name="selectedGear.name" :icon="selectedGear.id" :count="1" :stars="stars(selectedGear.id)"
        :tier="selectedGear.tier" :type="equipmentType(selectedGear) + (selectedGear.isTrueUnique ? ' · 全服唯一' : '')" @close="closeItem()" />
      <ItemCardHeading v-else-if="selectedSupply" :name="selectedSupply.name" :icon="selectedSupply.iconId ?? selectedSupply.id" :count="selectedSupply.count"
        :tier="selectedSupply.tier" :type="selectedSupply.type" @close="closeItem()" />

      <div :key="selectedId" class="equip-scroll detail-body">
        <ItemDetailCard v-if="selectedGear" :item="selectedGear" :context="context" :comparing="comparing" :compared-item="comparedItem" />
        <template v-else-if="selectedSupply">
          <h4 class="text-gold">用途</h4>
          <p class="text-ink2">{{ selectedSupply.desc }}</p>
          <p v-if="selectedSupply.source" class="hint">来源 · {{ selectedSupply.source }}</p>
        </template>
      </div>
      <footer v-if="selectedGear" class="equip-footer">
        <small>{{ showStorage ? '行囊' : '随身物品' }}<template v-if="alreadyWorn"> · {{ equippedBy }}已穿戴</template></small>
        <button v-if="canCompare" type="button" class="btn btn-sm" :aria-pressed="showComparison" @click="showComparison = !showComparison">{{ comparing ? '查看详情' : '同部位对比' }}</button>
        <button v-if="!alreadyWorn" type="button" class="btn btn-gold action-main" :disabled="!meetsRequirement || store.onlineActionBusy"
          :aria-label="`装备${selectedGear.name}`" @click="equipSelected">{{ comparedItem ? '更换装备' : '装备' }}</button>
      </footer>
      <footer v-else class="equip-footer">
        <small>随身物品</small><button v-if="supplyAction" type="button" class="btn btn-gold action-main" @click="useSupply">{{ supplyAction.label }}</button>
      </footer>
    </ItemPopover>
  </div>
</template>
