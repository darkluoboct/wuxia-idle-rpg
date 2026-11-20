<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, ChevronRight, Swords } from 'lucide-vue-next'
import {
  backpackCapacity, canEquipCompanionItem, HERBS, HIDDEN_WEAPONS, hiddenWeaponCapacity,
  ITEMS, JIANGHU_TITLES, MEDICINES, meetsItemStatRequirement, SKILLS, titleEligible,
  unlockedHiddenWeapons, type ItemConfig,
} from '@/config/gameData'
import { BASE_STAT_LABELS, equipmentType, EQUIP_SLOT_META, itemBonusRows, medicineType, PLAYER_AVATARS, TIER_META } from '@/config/uiMeta'
import type { EquipSlotType, TierColor } from '@/network/protocol'
import { useGameStore } from '@/stores/gameStore'
import { companionItemId, formatBattleStatBonuses, PERSONAL_EQUIP_SLOTS } from '../../../shared/combatMeta.ts'
import { temperedItem } from '../../../shared/equipmentForge.ts'
import { sectEquipmentSetOf } from '../../../shared/sectEquipment.ts'
import { equippedGearSkill, trialAffixLabel, trialAffixQuality, trialSetOf } from '../../../shared/trialStages.ts'
import CharacterCombatStats from './CharacterCombatStats.vue'
import EquipmentForge from './EquipmentForge.vue'
import InkFigure from './InkFigure.vue'
import ItemIcon from './ItemIcon.vue'
import ItemPopover from './ItemPopover.vue'
import ItemCardHeading from './ItemCardHeading.vue'
import EquipmentValue from './EquipmentValue.vue'

const props = defineProps<{ initialItem?: string }>()
const emit = defineEmits<{ skill: [id: string] }>()
const store = useGameStore()
const root = ref<HTMLElement>()
const roleHeading = ref<HTMLElement>()
const bagHeading = ref<HTMLElement>()
const detailHeading = ref<HTMLElement>()
const inBag = computed(() => store.arsenalTab === 'BAG')

const slotOrder = ['HEAD', 'WEAPON', 'ARMOR', 'ACC', 'WRIST', 'BELT', 'BOOTS', 'RELIC'] as const satisfies readonly EquipSlotType[]
const emptyHints: Partial<Record<EquipSlotType, string>> = { BELT: '主线掉落', RELIC: '副本掉落' }
type RolePane = EquipSlotType | 'ATTRIBUTES' | 'PREPARE' | 'FORGE'
const rolePane = ref<RolePane | null>(null)
const companionId = ref<string | null>(null)
const companions = computed(() => [...new Set([store.currentLoadout.leftCompanionId, store.currentLoadout.rightCompanionId])]
  .flatMap((id) => {
    const companion = id && store.companionOf(id)
    return companion ? [companion] : []
  }))
const wearer = computed(() => companions.value.find((member) => member.id === companionId.value))
const wearerName = computed(() => wearer.value?.name ?? store.player.nickname)
const wearerStats = computed(() => wearer.value?.stats ?? store.player.stats)
const companionStats = computed(() => wearer.value && store.companionCombatStats(wearer.value.id))
const shownStats = computed(() => companionStats.value?.attributes ?? wearer.value?.stats ?? store.martialStats)
const qiProgress = computed(() => Math.min(100, Math.round(100 * store.player.qiExp / Math.max(1, store.player.nextLevelQi))))

const worn = computed(() => slotOrder.flatMap((type) => {
  if (type === 'RELIC' && wearer.value) return []
  const slot = EQUIP_SLOT_META[type]
  const id = wearer.value && type !== 'RELIC' ? companionItemId(store.currentLoadout, wearer.value.id, type) : store.currentLoadout[slot.field]
  return [{ ...slot, type, item: typeof id === 'string' ? ITEMS[id] : undefined }]
}))
const slotColumns = computed(() => [
  worn.value.filter((_, index) => index % 2 === 0),
  worn.value.filter((_, index) => index % 2 === 1),
])
const openSlot = computed(() => worn.value.find(({ type }) => type === rolePane.value))
const wornBy = computed(() => {
  const owners = new Map<string, string>()
  for (const type of slotOrder) {
    const id = store.currentLoadout[EQUIP_SLOT_META[type].field]
    if (id) owners.set(id, store.player.nickname)
  }
  for (const member of companions.value) {
    for (const slot of PERSONAL_EQUIP_SLOTS) {
      const id = companionItemId(store.currentLoadout, member.id, slot)
      if (id) owners.set(id, member.name)
    }
  }
  return owners
})
const owned = computed(() => store.ownedItemIds
  .map((id) => ITEMS[id])
  .filter(Boolean)
  .sort((a, b) => TIER_META[b.tier].rank - TIER_META[a.tier].rank))
const backpack = computed(() => owned.value.filter((gear) => !wornBy.value.has(gear.id)))
const wearerGear = computed(() => new Set(worn.value.map((slot) => slot.item?.id)))

const hiddenSlots = computed(() => hiddenWeaponCapacity(store.currentLoadout))
const availableWeapons = computed(() => unlockedHiddenWeapons(store.player))
const equippedWeapons = computed(() => (store.currentLoadout.hiddenWeaponIds ?? []).slice(0, hiddenSlots.value))
const gearSkill = computed(() => equippedGearSkill({ ...store.currentLoadout, gearSkillId: store.currentLoadout.weaponId }))
const equippedTitle = computed(() => JIANGHU_TITLES.find((title) => title.id === store.currentLoadout.titleId))
const medicineSlots = [
  { field: 'battlePillId', category: 'BATTLE_PILL', name: '战斗丹药' },
  { field: 'weaponVenomId', category: 'WEAPON_VENOM', name: '兵刃毒膏' },
] as const
const medicineStock = computed(() => store.player.battleMedicines ?? {})
const battleMedicines = Object.values(MEDICINES).filter((medicine) => medicine.category === 'BATTLE_PILL' || medicine.category === 'WEAPON_VENOM')

function equipHiddenWeapon(index: number, event: Event) {
  const selected = [...equippedWeapons.value]
  selected[index] = (event.target as HTMLSelectElement).value
  return store.updateLoadout({ hiddenWeaponIds: selected.filter(Boolean) })
}

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
const returnSlot = ref<EquipSlotType | null>(null)
const showComparison = ref(false)
const equipMessage = ref('')

const bagCapacity = computed(() => backpackCapacity(store.currentLoadout))
const pillSlot = computed(() => Number(store.pillCount > 0))
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
      ? medicineStock.value : store.pillInventory
    const count = stock[medicine.id] ?? 0
    if (count > 0) result.push({ ...medicine, count, desc: medicine.effectDesc, glyph: '丹', kind: 'MEDICINE', type: medicineType(medicine) })
  }
  for (const [id, count] of Object.entries(store.herbInventory)) {
    const herb = HERBS[id]
    if (herb && count > 0) result.push({ ...herb, count, source: herb.mapName, glyph: '药', kind: 'HERB', type: '材料 · 药材' })
  }
  for (const [id, count] of Object.entries(store.player.skillFragments ?? {})) {
    const skill = SKILLS[id]
    if (!skill || count <= 0) continue
    const desc = store.learnedSkills[id] ? '参悟同名武学时可用残页抵扣真气。' : '习得同名武学后，可在参悟时用残页抵扣真气。'
    result.push({ id, name: `《${skill.name}》残页`, tier: skill.tier, count, desc, iconId: 'skill-fragment', glyph: '卷', kind: 'FRAGMENT', type: '武学材料 · 残页' })
  }
  return result
})
const visibleSupplies = computed(() => showStorage.value ? [] : supplies.value.filter((entry) => category.value === 'ALL' || category.value === entry.kind))
const selectedGear = computed(() => owned.value.find((item) => item.id === selectedId.value))
const selectedSupply = computed(() => supplies.value.find(({ id }) => id === selectedId.value))
const selectedEntry = computed(() => selectedGear.value ?? selectedSupply.value)
const item = computed(() => inBag.value ? selectedGear.value : openSlot.value?.item)
const comparedItem = computed(() => selectedGear.value && worn.value.find(({ type }) => type === selectedGear.value?.slot)?.item)
const equippedBy = computed(() => selectedGear.value && wornBy.value.get(selectedGear.value.id))
const alreadyWorn = computed(() => !!equippedBy.value)
const canCompare = computed(() => !alreadyWorn.value && (!!comparedItem.value || !!returnSlot.value))
const comparing = computed(() => inBag.value && showComparison.value && canCompare.value)
const requirement = computed(() => item.value?.reqStat)
const meetsRequirement = computed(() => {
  const gear = item.value
  if (!gear) return false
  return wearer.value ? canEquipCompanionItem(wearer.value, gear) : meetsItemStatRequirement(gear, wearerStats.value)
})
const forgeState = (id: string) => store.player.equipmentForge?.items[id]
const stars = (id: string) => forgeState(id)?.stars ?? 0

function effectRows(gear: ItemConfig) {
  const effects: { key: string; label: string; value: string }[] = []
  const roll = store.player.equipmentAffixes?.[gear.id]
  if (roll) {
    const affix = trialAffixLabel(gear, roll)
    const stat = affix.split(' ')[0]
    effects.push({ key: 'affix-' + stat, label: '掉落词条 · ' + stat, value: `${trialAffixQuality(gear, roll)} · ${affix.slice(stat.length).trim()}` })
  }
  const secondary = forgeState(gear.id)?.secondary
  if (secondary) {
    const text = formatBattleStatBonuses({ [secondary.stat]: secondary.value })
    const separator = text.indexOf(' ')
    effects.push({ key: 'secondary-' + secondary.stat, label: '副词条 · ' + text.slice(0, separator), value: text.slice(separator + 1) })
  }
  if (gear.signatureEffect) effects.push({ key: 'signature', label: '特效', value: gear.signatureEffect })
  if (gear.extra) effects.push({ key: 'extra', label: '附加说明', value: gear.extra })
  return effects
}
const baseRows = (gear: ItemConfig) => itemBonusRows(temperedItem(gear, stars(gear.id)))
const stats = computed(() => item.value ? baseRows(item.value) : [])
const effects = computed(() => item.value ? effectRows(item.value) : [])
const comparisonRows = computed(() => {
  const current = comparedItem.value
  const before = current ? [...baseRows(current), ...effectRows(current)] : []
  const after = [...stats.value, ...effects.value]
  return [...new Map([...before, ...after].map((row) => [row.key, row.label]))].map(([key, label]) => ({
    key, label, before: before.find((row) => row.key === key)?.value ?? '—',
    after: after.find((row) => row.key === key)?.value ?? '—',
  }))
})
const setDetail = computed(() => {
  const id = item.value?.setId
  if (!id) return undefined
  const sect = sectEquipmentSetOf(id)
  const trial = trialSetOf(id)
  const count = worn.value.filter(({ item: wornItem }) => wornItem?.setId === id).length
  if (sect) return { name: sect.name, count, total: sect.parts.length, effects: [sect.bonus] }
  if (trial) {
    const thresholds = [[2, 'two'], [4, 'four'], [6, 'six']] as const
    return { name: trial.name, count, total: trial.parts.length, effects: thresholds
      .flatMap(([pieces, key]) => trial.bonuses[key] ? [`${pieces} 件 · ${trial.bonuses[key]}`] : []) }
  }
  return undefined
})

const supplyAction = computed(() => {
  const supply = selectedSupply.value
  if (!supply) return undefined
  if (supply.kind === 'HERB' && store.featureOpen('MAPS')) return { label: '去百草丹房', run: openAlchemy }
  if (supply.kind === 'FRAGMENT' && store.learnedSkills[supply.id]) {
    return { label: '查看武学', run: () => { skillTrigger.value = supply.id; emit('skill', supply.id) } }
  }
  const medicine = supply.kind === 'MEDICINE' ? MEDICINES[supply.id] : undefined
  if (medicine?.category === 'BATTLE_PILL' || medicine?.category === 'WEAPON_VENOM') {
    return { label: '去战备', run: () => {
      pickWearer(null)
      store.arsenalTab = 'EQUIP'
      openRolePane('PREPARE')
    } }
  }
  const effect = medicine?.acupointEffect?.type
  if (effect === 'BREAKTHROUGH_RATE' || effect === 'PREVENT_DEVIATION') {
    return { label: '去修行', run: () => store.selectTab('CULTIVATE') }
  }
  if (effect) return { label: '去经脉冲穴', run: () => { store.selectTab('ARSENAL'); store.arsenalTab = 'MERIDIAN' } }
  return undefined
})
const paneTitle = computed(() => {
  if (inBag.value) return '物品详情'
  if (openSlot.value) return `${openSlot.value.label}详情`
  if (rolePane.value === 'ATTRIBUTES') return '属性详情'
  if (rolePane.value === 'PREPARE') return '战备'
  if (rolePane.value === 'FORGE') return '装备淬炼'
  return '角色属性'
})

function pickWearer(id: string | null) {
  companionId.value = id
  rolePane.value = null
  returnSlot.value = null
}
watch(wearer, (member) => {
  if (companionId.value && !member) pickWearer(null)
})

function openRolePane(pane: RolePane) {
  rolePane.value = pane
  void nextTick(() => detailHeading.value?.focus({ preventScroll: true }))
}

function closeRolePane() {
  const previous = rolePane.value
  rolePane.value = null
  void nextTick(() => {
    const trigger = root.value?.querySelector<HTMLElement>(`[data-role-pane="${previous}"]`) ?? roleHeading.value
    trigger?.focus({ preventScroll: true })
  })
}

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

function changeEquipment(type: EquipSlotType) {
  category.value = 'GEAR'
  slotFilter.value = type
  showStorage.value = !carried.value.some(matchesSlot) && matchingStorage.value.length > 0
  returnSlot.value = type
  selectItem()
  store.arsenalTab = 'BAG'
  void nextTick(() => bagHeading.value?.focus({ preventScroll: true }))
}

function returnToRole() {
  const type = returnSlot.value
  returnSlot.value = null
  if (type) rolePane.value = type
  store.arsenalTab = 'EQUIP'
  void nextTick(() => detailHeading.value?.focus({ preventScroll: true }))
}

function closeItem(restoreFocus = true) {
  const id = selectedId.value
  selectItem()
  if (id && restoreFocus) void nextTick(() => {
    const trigger = root.value?.querySelector<HTMLElement>(`[data-bag-item="${CSS.escape(id)}"]`)
    const target = trigger ?? bagHeading.value
    target?.focus({ preventScroll: true })
  })
}
watch(inBag, (active) => { if (!active) closeItem(false) })
onDeactivated(() => closeItem(false))
onActivated(() => {
  if (!skillTrigger.value) return
  root.value?.querySelector<HTMLElement>(`[data-bag-item="${CSS.escape(skillTrigger.value)}"]`)?.focus({ preventScroll: true })
  skillTrigger.value = ''
})
watch(() => props.initialItem, async (id) => {
  if (!id) return
  pickWearer(null)
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

function unequip(type: EquipSlotType) {
  if (!wearer.value) return store.updateLoadout({ [EQUIP_SLOT_META[type].field]: null }, '已卸下装备')
  if (type !== 'RELIC') return store.equipCompanionItem(wearer.value.id, type, null)
}

function onEscape(event: KeyboardEvent) {
  if (store.confirmDialog || store.inspectModal) return
  if (inBag.value && (selectedGear.value || selectedSupply.value)) closeItem()
  else if (inBag.value && returnSlot.value) returnToRole()
  else if (!inBag.value && rolePane.value) closeRolePane()
  else return
  event.stopPropagation()
  event.preventDefault()
}
</script>

<template>
  <div ref="root" class="equipment-panel" :class="{ 'bag-layout': inBag }" @keydown.esc="onEscape">
    <section v-show="!inBag" class="equip-pane character-pane" aria-label="人物装备">
      <header class="equip-heading">
        <h2 ref="roleHeading" class="sec-title" tabindex="-1">人物装备</h2>
        <span>{{ worn.filter(({ item: gear }) => gear).length }} / {{ worn.length }} 已穿戴</span>
      </header>
      <div v-if="companions.length" class="equip-options" role="group" aria-label="选择穿戴者">
        <button type="button" class="btn btn-sm" :aria-pressed="!wearer" @click="pickWearer(null)">主角</button>
        <button v-for="companion in companions" :key="companion.id" type="button" class="btn btn-sm"
          :aria-pressed="wearer?.id === companion.id" @click="pickWearer(companion.id)">{{ companion.name }}</button>
      </div>
      <div class="equip-doll">
        <div v-for="(column, index) in slotColumns" :key="index" class="slot-column" :class="{ 'second-column': index === 1 }">
          <button v-for="slot in column" :key="slot.type" type="button" class="worn-slot"
            :data-role-pane="slot.type" :aria-pressed="rolePane === slot.type" :title="slot.item?.name ?? slot.label"
            :aria-label="slot.item ? `查看已穿戴的${slot.item.name}` : `查看${slot.label}装备位`"
            @click="openRolePane(slot.type)">
            <ItemIcon :item-id="slot.item?.id" :glyph="slot.glyph" class="gear-icon" :class="slot.item && TIER_META[slot.item.tier].cls" />
            <span class="worn-copy">
              <small>{{ slot.label }}</small>
              <b :class="slot.item && TIER_META[slot.item.tier].cls">{{ slot.item?.name ?? '未装备' }}</b>
              <small v-if="slot.item && stars(slot.item.id)">+{{ stars(slot.item.id) }} 星</small>
            </span>
          </button>
        </div>
        <figure class="equip-portrait">
          <span v-if="wearer" class="partner-portrait"><InkFigure :style-type="wearer.portraitStyle" :portrait-id="wearer.id" /></span>
          <img v-else :src="PLAYER_AVATARS[store.player.avatarId].image" alt="" />
          <figcaption><strong class="font-brush">{{ wearerName }}</strong><small>{{ wearer?.title ?? `${store.player.level} 级 · ${store.currentRealm.name}` }}</small></figcaption>
        </figure>
      </div>
      <footer class="equip-footer">
        <span v-if="!wearer" class="text-ink2">修为进度 <b class="text-gold tabular-nums">{{ qiProgress }}%</b></span>
        <div class="equip-buttons">
          <button v-if="!wearer" type="button" class="btn btn-sm" data-role-pane="PREPARE" :aria-pressed="rolePane === 'PREPARE'" @click="openRolePane('PREPARE')">战备</button>
          <button type="button" class="btn btn-sm" data-role-pane="FORGE" :aria-pressed="rolePane === 'FORGE'" @click="openRolePane('FORGE')">装备淬炼</button>
        </div>
      </footer>
    </section>

    <section v-show="inBag" class="equip-pane" aria-label="背包">
      <header class="equip-heading">
        <button v-if="returnSlot" type="button" class="btn btn-sm" @click="returnToRole"><ArrowLeft aria-hidden="true" />返回角色</button>
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

    <component :is="inBag ? ItemPopover : 'aside'" v-if="!inBag || (anchor && selectedEntry)"
      :key="inBag ? selectedId : 'role'" v-bind="inBag ? { anchor, wide: comparing } : {}"
      class="equip-pane detail-pane" :class="inBag && selectedEntry ? TIER_META[selectedEntry.tier].cls : ''"
      :aria-label="inBag ? selectedEntry?.name : paneTitle" @dismiss="closeItem(false)">
      <ItemCardHeading v-if="inBag && selectedGear" :name="selectedGear.name" :icon="selectedGear.id" :count="1" :stars="stars(selectedGear.id)"
        :tier="selectedGear.tier" :type="equipmentType(selectedGear) + (selectedGear.isTrueUnique ? ' · 全服唯一' : '')" @close="closeItem()" />
      <ItemCardHeading v-else-if="inBag && selectedSupply" :name="selectedSupply.name" :icon="selectedSupply.iconId ?? selectedSupply.id" :count="selectedSupply.count"
        :tier="selectedSupply.tier" :type="selectedSupply.type" @close="closeItem()" />
      <header v-else class="equip-heading">
        <h2 ref="detailHeading" class="sec-title" tabindex="-1">{{ paneTitle }}</h2>
        <button v-if="rolePane" type="button" class="btn btn-sm" @click="closeRolePane"><ArrowLeft aria-hidden="true" />返回概览</button>
      </header>
      <div :key="inBag ? (selectedId ?? 'bag') : (rolePane ?? 'role')" class="equip-scroll detail-body">
        <template v-if="item">
          <div v-if="!inBag" class="item-heading" :class="TIER_META[item.tier].cls">
            <ItemIcon :item-id="item.id" :glyph="EQUIP_SLOT_META[item.slot].glyph" class="gear-icon" />
            <div>
              <h3 class="font-brush tier-text">{{ item.name }}<small v-if="stars(item.id)"> +{{ stars(item.id) }} 星</small></h3>
              <p class="text-ink3">{{ EQUIP_SLOT_META[item.slot].label }} · {{ TIER_META[item.tier].label }}<template v-if="item.isTrueUnique"> · 全服唯一</template><template v-if="inBag"> · ×1</template></p>
            </div>
          </div>
          <div v-if="comparing" role="group" aria-label="同部位装备对比">
            <table class="gear-comparison" aria-label="同部位对比">
              <thead><tr><th scope="col">词条</th><th scope="col">当前 · {{ comparedItem?.name ?? '未装备' }}</th><th scope="col">选中 · {{ item.name }}</th></tr></thead>
              <tbody><tr v-for="row in comparisonRows" :key="row.key"><th scope="row">{{ row.label }}</th>
                <td><EquipmentValue :text="row.before" /></td><td><EquipmentValue :text="row.after" /></td></tr></tbody>
            </table>
          </div>
          <template v-else>
            <section v-if="stats.length"><h4 class="text-gold">基础属性</h4><dl class="gear-stats">
              <template v-for="row in stats" :key="row.key"><dt>{{ row.label }}</dt><dd><EquipmentValue :text="row.value" /></dd></template>
            </dl></section>
            <section v-if="effects.length"><h4 class="text-gold">装备效果</h4>
              <p v-for="row in effects" :key="row.key"><span v-if="row.key !== 'signature'" class="text-ink3">{{ row.label }} · </span><EquipmentValue :text="row.value" /></p>
            </section>
          </template>
          <div v-if="setDetail" class="set-effects">
            <b>{{ setDetail.name }} · {{ setDetail.count }}/{{ setDetail.total }} 件已穿戴</b>
            <p v-for="effect in setDetail.effects" :key="effect" class="hint"><EquipmentValue :text="effect" /></p>
          </div>
          <p class="text-ink2"><EquipmentValue :text="item.desc" /></p>
          <p v-if="inBag && wearer && item.slot === 'RELIC'" class="text-cinnabar">全队秘宝在主角栏装配。</p>
          <p v-else-if="requirement" :class="meetsRequirement ? 'text-ink2' : 'text-cinnabar'">
            需要{{ requirement.label }}<template v-if="'key' in requirement">（当前 {{ wearerStats[requirement.key] }}）</template>
            <template v-if="inBag && !meetsRequirement">，暂不可穿戴。</template>
          </p>
        </template>
        <template v-else-if="inBag && selectedSupply">
          <h4 class="text-gold">用途</h4>
          <p class="text-ink2">{{ selectedSupply.desc }}</p>
          <p v-if="selectedSupply.source" class="hint">来源 · {{ selectedSupply.source }}</p>
        </template>
        <template v-else-if="openSlot">
          <p class="text-ink2">当前{{ openSlot.label }}位未装备。</p>
          <p v-if="emptyHints[openSlot.type]" class="hint">{{ emptyHints[openSlot.type] }}</p>
        </template>
        <template v-else-if="rolePane === 'PREPARE'">
          <section v-if="gearSkill" class="prep-group" aria-label="装备特技配装">
            <label class="block space-y-1"><span>装备特技</span>
              <select class="field w-full" :value="store.currentLoadout.gearSkillId ?? ''" :disabled="store.onlineActionBusy"
                @change="store.updateLoadout({ gearSkillId: ($event.target as HTMLSelectElement).value || null })">
                <option value="">不使用</option>
                <option :value="gearSkill.weapon.id">{{ gearSkill.name }} · {{ gearSkill.rageCost }} 怒气</option>
              </select>
            </label>
            <p class="hint">试炼与复战每场可施展一次。对同一目标连击，每击按外功威力的 {{ gearSkill.damagePercent }}% 结算。</p>
          </section>
          <section class="prep-group" aria-label="暗器配装">
            <h3 class="sec-title">暗器</h3>
            <p v-if="!availableWeapons.length" class="hint">首胜历练第 04 关解锁飞天淬毒黑菱。</p>
            <label v-for="index in hiddenSlots" :key="index" class="block space-y-1">
              <span>暗器 {{ index }}</span>
              <select class="field w-full" :value="equippedWeapons[index - 1] ?? ''"
                :disabled="store.onlineActionBusy || !availableWeapons.length" @change="equipHiddenWeapon(index - 1, $event)">
                <option value="">未装备</option>
                <option v-for="weapon in availableWeapons" :key="weapon.id" :value="weapon.id"
                  :disabled="equippedWeapons.includes(weapon.id) && equippedWeapons[index - 1] !== weapon.id">{{ weapon.name }}</option>
              </select>
              <span v-if="HIDDEN_WEAPONS[equippedWeapons[index - 1]]" class="hint flex items-center gap-2">
                <ItemIcon :item-id="equippedWeapons[index - 1]" class="[--item-icon-size:1.6rem]" />{{ HIDDEN_WEAPONS[equippedWeapons[index - 1]].effectDesc }}
              </span>
            </label>
          </section>
          <section class="prep-group" aria-label="称号配装">
            <h3 class="sec-title">江湖称号</h3>
            <label class="block space-y-1"><span>出战称号</span>
              <select class="field w-full" :value="equippedTitle?.id ?? ''" :disabled="store.onlineActionBusy"
                @change="store.updateLoadout({ titleId: ($event.target as HTMLSelectElement).value || null })">
                <option value="">不佩戴称号</option>
                <option v-for="title in JIANGHU_TITLES" :key="title.id" :value="title.id">
                  {{ title.titleName }}{{ titleEligible(title, { ...store.player, stats: store.martialStats }, store.currentLoadout) ? '' : '（未达条件）' }}
                </option>
              </select>
            </label>
            <template v-if="equippedTitle">
              <p class="hint">{{ equippedTitle.statBuffDesc }}</p>
              <p v-if="!store.jianghuTitle" class="hint">
                {{ equippedTitle.reqAlignment === 'HERMIT' ? '侠义 −199 至 199' : `侠义 ${equippedTitle.reqAlignment === 'EVIL' ? '≤' : '≥'} ${equippedTitle.minReputation}` }}，
                装配{{ equippedTitle.skills.map((id) => SKILLS[id]?.name).join('、') }}中的一门{{ equippedTitle.outerForm === 'PALM' ? '或其他掌法外功' : '' }}后生效。
              </p>
            </template>
          </section>
          <section class="prep-group" aria-label="百草药囊">
            <div class="equip-heading">
              <h3 class="sec-title">百草药囊</h3>
              <button v-if="store.featureOpen('MAPS')" type="button" class="btn btn-sm" @click="openAlchemy">去百草丹房</button>
            </div>
            <label v-for="slot in medicineSlots" :key="slot.field" class="block space-y-1">
              <span>{{ slot.name }}</span>
              <select class="field w-full" :value="store.currentLoadout[slot.field] ?? ''" :disabled="store.onlineActionBusy"
                @change="store.updateLoadout({ [slot.field]: ($event.target as HTMLSelectElement).value || null })">
                <option value="">未装配</option>
                <option v-for="medicine in battleMedicines.filter((entry) => entry.category === slot.category)" :key="medicine.id" :value="medicine.id"
                  :disabled="!(medicineStock[medicine.id] > 0)">{{ medicine.name }} · {{ medicineStock[medicine.id] ?? 0 }} 份</option>
              </select>
              <span v-if="store.currentLoadout[slot.field]" class="hint flex items-center gap-2">
                <ItemIcon :item-id="store.currentLoadout[slot.field]" class="[--item-icon-size:1.6rem]" />{{ MEDICINES[store.currentLoadout[slot.field] ?? '']?.effectDesc }}
              </span>
            </label>
            <p class="hint">实战触发后扣除库存。切磋和华山挑战期间药囊停用。</p>
          </section>
        </template>
        <EquipmentForge v-else-if="rolePane === 'FORGE'" />
        <template v-else>
          <div class="equip-power"><Swords aria-hidden="true" /><span>战力</span><b>{{ (companionStats ?? store.derivedStats).combatPower.toLocaleString() }}</b></div>
          <template v-if="rolePane === 'ATTRIBUTES'">
            <section class="stat-section">
              <h3 class="sec-title">{{ !wearer && store.isWandererMasteryActive ? '六维属性 · 兼收并蓄' : '六维属性' }}</h3>
              <dl class="base-stats"><div v-for="(label, key) in BASE_STAT_LABELS" :key="key"><dt>{{ label }}</dt><dd>{{ shownStats[key] }}</dd></div></dl>
            </section>
            <section class="stat-section"><h3 class="sec-title">战斗属性</h3><CharacterCombatStats :stats="companionStats" /></section>
          </template>
          <CharacterCombatStats v-else :stats="companionStats" summary />
          <button v-if="!rolePane" type="button" class="btn btn-sm mt-3" data-role-pane="ATTRIBUTES" @click="openRolePane('ATTRIBUTES')">属性详情 <ChevronRight aria-hidden="true" /></button>
        </template>
      </div>

      <footer v-if="inBag && selectedGear" class="equip-footer">
        <small>{{ showStorage ? '行囊' : '随身物品' }}<template v-if="alreadyWorn"> · {{ equippedBy }}已穿戴</template></small>
        <button v-if="canCompare" type="button" class="btn btn-sm" :aria-pressed="showComparison" @click="showComparison = !showComparison">{{ comparing ? '查看详情' : '同部位对比' }}</button>
        <button v-if="!alreadyWorn" type="button" class="btn btn-gold action-main" :disabled="!meetsRequirement || store.onlineActionBusy"
          :aria-label="`装备${selectedGear.name}`" @click="equipSelected">{{ comparedItem ? '更换装备' : '装备' }}</button>
      </footer>
      <footer v-else-if="inBag" class="equip-footer">
        <small>随身物品</small><button v-if="supplyAction" type="button" class="btn btn-gold action-main" @click="useSupply">{{ supplyAction.label }}</button>
      </footer>
      <footer v-else-if="!inBag && openSlot" class="equip-footer">
        <button v-if="openSlot.item" type="button" class="btn btn-sm" :aria-label="`卸下${openSlot.item.name}`" :disabled="store.onlineActionBusy" @click="unequip(openSlot.type)">卸下</button>
        <button type="button" class="btn btn-gold action-main" @click="changeEquipment(openSlot.type)">{{ openSlot.item ? '更换装备' : '选择装备' }}</button>
      </footer>
    </component>
  </div>
</template>

<style scoped>
.equipment-panel {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1.38fr) minmax(0, 1fr);
  gap: .8rem;
  min-height: 0;
  min-width: 0;
}
.bag-layout { grid-template-columns: minmax(0, 1fr); }
.equip-pane {
  display: flex;
  flex-direction: column;
  gap: .55rem;
  min-width: 0;
  min-height: 0;
  padding: clamp(.55rem, 1.15vw, 1rem);
  border: 1px solid var(--line);
  background: var(--bg-1);
}
.equip-heading, .equip-footer, .equip-options, .equip-buttons, .bag-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: .4rem .55rem;
}
.equip-heading .sec-title { flex: 1; margin: 0; font-size: 1.12rem; }
.equip-heading > span, .bag-filter { color: var(--ink-3); font-size: .78rem; }
.equip-options .btn[aria-pressed="true"], .equip-buttons .btn[aria-pressed="true"], .equip-footer .btn[aria-pressed="true"] {
  color: var(--gold);
  border-color: var(--gold);
  background: var(--gold-soft);
}
.equip-scroll { flex: 1; min-height: 0; overflow: auto; }
.equip-footer { flex: none; justify-content: space-between; padding-top: .6rem; border-top: 1px solid var(--line); }
.equip-footer .action-main, .character-pane .equip-buttons, .bag-filter .equip-buttons { margin-inline-start: auto; }
.equip-doll {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.55fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  align-items: center;
  gap: .55rem;
  overflow-y: auto;
}
.slot-column { display: grid; grid-column: 1; grid-row: 1; gap: .45rem; }
.second-column { grid-column: 3; }
.equip-portrait {
  grid-area: 1 / 2;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  place-items: center;
  align-self: stretch;
  min-height: 0;
  text-align: center;
  background: radial-gradient(ellipse at 50% 45%, var(--gold-soft), transparent 68%);
}
.equip-portrait img {
  width: 100%; height: 100%; min-height: 0; object-fit: contain;
  mask-image: linear-gradient(90deg, transparent, var(--bg-0) 13% 87%, transparent);
}
.partner-portrait { position: relative; align-self: center; width: min(100%, 12rem); aspect-ratio: 1; overflow: hidden; }
.equip-portrait strong { display: block; color: var(--gold); font-size: 1.35rem; }
.equip-portrait small, .worn-copy small { display: block; color: var(--ink-3); font-size: .75rem; }
.worn-slot, .bag-tile {
  min-width: 0;
  border: 1px solid var(--line-strong);
  background: var(--bg-0);
}
.worn-slot { display: flex; align-items: center; gap: .45rem; padding: .4rem; text-align: start; }
.worn-slot:hover, .worn-slot[aria-pressed="true"], .bag-tile:hover, .bag-tile[aria-pressed="true"] { border-color: var(--gold); }
.worn-slot[aria-pressed="true"], .bag-tile[aria-pressed="true"] { background: var(--gold-soft); }
.worn-copy { flex: 1; min-width: 0; }
.worn-copy b, .bag-tile b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .84rem; }
.worn-copy b { color: var(--tc, var(--ink)); }
.gear-icon { --item-icon-size: clamp(1.45rem, 3.25vw, 2.6rem); }
.bag-filter { padding-block: .2rem; }
.bag-filter select { padding-block: .24rem; }
.bag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(9rem, 100%), 1fr)); gap: .55rem; padding: .15rem; }
.bag-tile { position: relative; display: grid; justify-items: center; gap: .3rem; padding-top: .35rem; text-align: center; background: radial-gradient(ellipse, var(--bg-2), var(--bg-0) 85%); }
.bag-tile .gear-icon { --item-icon-size: clamp(3.5rem, 10vh, 5.5rem); border: 0; background: transparent; }
.bag-tile b { width: 100%; padding: .3rem; border-top: 1px solid var(--line); background: var(--bg-2); }
.tile-count, .worn-tag { position: absolute; padding-inline: .25rem; background: var(--bg-0); font-size: .75rem; }
.tile-count { bottom: 2rem; right: .2rem; }.worn-tag { top: .2rem; left: .2rem; color: var(--jade); }
.equip-empty { margin: .35rem 0 .65rem; color: var(--ink-3); font-size: .86rem; }
.detail-pane .equip-heading { flex: none; min-height: 1.85rem; padding-bottom: .45rem; border-bottom: 1px solid var(--line); }
.detail-body { display: flex; flex-direction: column; gap: .65rem; padding: .25rem .18rem .35rem; font-size: .88rem; overflow-wrap: anywhere; }
.detail-body > * { flex-shrink: 0; }
.item-heading { display: flex; align-items: center; gap: .55rem; }
.item-heading h3 { font-size: 1.32rem; line-height: 1.19; }
.item-heading .gear-icon { --item-icon-size: clamp(2rem, 4.3vw, 3.5rem); }
.item-heading .item-icon-standalone { --item-illustration-size: clamp(5rem, 18vh, 8rem); }
.gear-stats { display: grid; grid-template-columns: max-content 1fr; gap: .15rem 1rem; }
.gear-comparison { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: .85rem; }
.gear-comparison :is(th, td) { padding: .35rem .5rem; border: 1px solid var(--line); text-align: left; vertical-align: top; }
.gear-comparison thead { color: var(--gold); background: var(--bg-2); }
.gear-comparison th:first-child { width: 20%; }
.item-popover.detail-pane { padding: 0; gap: 0; }
.item-popover .detail-body, .item-popover .equip-footer { padding: .65rem .85rem; }
.item-popover .equip-footer small { margin-inline-end: auto; color: var(--ink-3); }
.item-popover .action-main { margin: 0; }
.set-effects, .stat-section, .prep-group { border-top: 1px solid var(--line); padding-top: .48rem; }
.prep-group { display: grid; gap: .45rem; }
.equip-power { display: flex; align-items: center; gap: .5rem; color: var(--gold); }
.equip-power svg { width: 1.12rem; height: 1.12rem; }
.equip-power b { font-size: 1.52rem; font-variant-numeric: tabular-nums; }
.detail-body :deep(.combat-stats), .stat-section .base-stats { padding-block: .55rem; font-size: .87rem; }
.detail-body > .btn { align-self: flex-start; }
@media (max-width: 767px) {
  .equipment-panel { gap: .35rem; }
  .equip-doll { gap: .2rem; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1fr); }
  .worn-slot { flex-direction: column; padding: .18rem; text-align: center; }
  .worn-copy { width: 100%; }
  .worn-copy b { font-size: .69rem; }
}
</style>
