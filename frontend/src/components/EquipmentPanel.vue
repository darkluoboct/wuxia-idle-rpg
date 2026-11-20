<script setup lang="ts">
import { computed, nextTick, onActivated, ref, watch } from 'vue'
import { ArrowLeft, ChevronRight, Swords } from 'lucide-vue-next'
import {
  backpackCapacity, canEquipCompanionItem, HERBS, HIDDEN_WEAPONS, hiddenWeaponCapacity,
  ITEMS, JIANGHU_TITLES, MEDICINES, meetsItemStatRequirement, SKILLS, titleEligible,
  unlockedHiddenWeapons, type ItemConfig,
} from '@/config/gameData'
import { BASE_STAT_LABELS, EQUIP_SLOT_META, itemBonusLabels, PLAYER_AVATARS, TIER_META } from '@/config/uiMeta'
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
const wornIds = computed(() => new Set([
  ...slotOrder.map((slot) => store.currentLoadout[EQUIP_SLOT_META[slot].field]),
  ...companions.value.flatMap(({ id }) => PERSONAL_EQUIP_SLOTS.map((slot) => companionItemId(store.currentLoadout, id, slot))),
]))
const backpack = computed(() => store.ownedItemIds
  .map((id) => ITEMS[id])
  .filter((item) => item && !wornIds.value.has(item.id))
  .sort((a, b) => TIER_META[b.tier].rank - TIER_META[a.tier].rank))

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
  { id: 'GEAR', label: '装备' }, { id: 'MEDICINE', label: '丹药' },
  { id: 'HERB', label: '药材' }, { id: 'FRAGMENT', label: '残页' },
] as const
type Category = typeof categories[number]['id']
type Supply = { id: string; name: string; tier: TierColor; count: number; desc: string; source?: string; iconId?: string; glyph: string }
const category = ref<Category>('GEAR')
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
const visibleGear = computed(() => showStorage.value ? matchingStorage.value : carried.value.filter(matchesSlot))
const emptySlots = computed(() => !showStorage.value && slotFilter.value === 'ALL' ? bagCapacity.value - carriedCount.value : 0)
const supplies = computed<Supply[]>(() => {
  if (category.value === 'MEDICINE') return Object.values(MEDICINES).flatMap((medicine) => {
    const stock = medicine.category === 'BATTLE_PILL' || medicine.category === 'WEAPON_VENOM'
      ? medicineStock.value : store.pillInventory
    const count = stock[medicine.id] ?? 0
    return count > 0 ? [{ ...medicine, count, desc: medicine.effectDesc, glyph: '丹' }] : []
  })
  if (category.value === 'HERB') return Object.entries(store.herbInventory).flatMap(([id, count]) => {
    const herb = HERBS[id]
    return herb && count > 0 ? [{ ...herb, count, source: herb.mapName, glyph: '药' }] : []
  })
  if (category.value === 'FRAGMENT') return Object.entries(store.player.skillFragments ?? {}).flatMap(([id, count]) => {
    const skill = SKILLS[id]
    if (!skill || count <= 0) return []
    const desc = store.learnedSkills[id] ? '参悟同名武学时可用残页抵扣真气。' : '习得同名武学后，可在参悟时用残页抵扣真气。'
    return [{ id, name: `《${skill.name}》残页`, tier: skill.tier, count, desc, iconId: 'skill-fragment', glyph: '卷' }]
  })
  return []
})

const selectedGear = computed(() => category.value === 'GEAR' ? visibleGear.value.find((item) => item.id === selectedId.value) : undefined)
const selectedSupply = computed(() => supplies.value.find(({ id }) => id === selectedId.value))
const item = computed(() => inBag.value ? selectedGear.value : openSlot.value?.item)
const comparedItem = computed(() => selectedGear.value && worn.value.find(({ type }) => type === selectedGear.value?.slot)?.item)
const canCompare = computed(() => !!comparedItem.value || !!returnSlot.value)
const comparing = computed(() => inBag.value && showComparison.value && canCompare.value)
const requirement = computed(() => item.value?.reqStat)
const meetsRequirement = computed(() => {
  const gear = item.value
  if (!gear) return false
  return wearer.value ? canEquipCompanionItem(wearer.value, gear) : meetsItemStatRequirement(gear, wearerStats.value)
})
const forgeState = (id: string) => store.player.equipmentForge?.items[id]
const stars = (id: string) => forgeState(id)?.stars ?? 0

function itemEffects(gear: ItemConfig) {
  const effects = itemBonusLabels(temperedItem(gear, stars(gear.id)))
  const roll = store.player.equipmentAffixes?.[gear.id]
  if (roll) effects.push(`${trialAffixQuality(gear, roll)} · ${trialAffixLabel(gear, roll)}`)
  const secondary = forgeState(gear.id)?.secondary
  if (secondary) effects.push(`副词条 · ${formatBattleStatBonuses({ [secondary.stat]: secondary.value })}`)
  return effects
}

const comparisons = computed(() => [
  { label: '当前穿戴', gear: comparedItem.value },
  { label: '选中装备', gear: selectedGear.value },
])
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
  if (category.value === 'HERB' && store.featureOpen('MAPS')) return { label: '去百草丹房', run: openAlchemy }
  if (category.value === 'FRAGMENT' && store.learnedSkills[supply.id]) {
    return { label: '查看武学', run: () => emit('skill', supply.id) }
  }
  const medicine = category.value === 'MEDICINE' ? MEDICINES[supply.id] : undefined
  if (medicine?.category === 'BATTLE_PILL' || medicine?.category === 'WEAPON_VENOM') {
    return { label: '去战备', run: () => { pickWearer(null); store.arsenalTab = 'EQUIP'; openRolePane('PREPARE') } }
  }
  const effect = medicine?.acupointEffect?.type
  if (effect === 'BREAKTHROUGH_RATE' || effect === 'PREVENT_DEVIATION') {
    return { label: '去修行', run: () => store.selectTab('CULTIVATE') }
  }
  if (effect) return { label: '去经脉冲穴', run: () => { store.arsenalTab = 'MERIDIAN' } }
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

function selectItem(id?: string) {
  selectedId.value = id
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

function focusBagItem(id: string) {
  void nextTick(() => root.value?.querySelector<HTMLElement>(`[data-bag-item="${id}"]`)?.focus({ preventScroll: true }))
}

function closeItem() {
  const id = selectedId.value
  selectItem()
  if (id) focusBagItem(id)
}

onActivated(() => {
  if (inBag.value && selectedId.value) focusBagItem(selectedId.value)
})

async function equipSelected() {
  const candidate = selectedGear.value
  if (!candidate || !meetsRequirement.value || store.onlineActionBusy) return
  if (!wearer.value) await store.equipItem(candidate.id)
  else if (candidate.slot !== 'RELIC') await store.equipCompanionItem(wearer.value.id, candidate.slot, candidate.id)
  if (selectedId.value === candidate.id && worn.value.some(({ item: gear }) => gear?.id === candidate.id)) {
    selectItem()
    equipMessage.value = `已为${wearerName.value}穿戴「${candidate.name}」。`
    if (inBag.value) void nextTick(() => detailHeading.value?.focus({ preventScroll: true }))
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
        <h2 ref="bagHeading" class="sec-title" tabindex="-1">背包</h2>
        <span v-if="category === 'GEAR'" title="穿戴的装备不计入随身容量，破障丹占一格">{{ carriedCount }} / {{ bagCapacity }} 格</span>
      </header>
      <div class="equip-options" role="group" aria-label="物品分类">
        <button v-for="entry in categories" :key="entry.id" type="button" class="btn btn-sm"
          :aria-pressed="category === entry.id" @click="filterCategory(entry.id)">{{ entry.label }}</button>
      </div>
      <div v-if="category === 'GEAR'" class="bag-filter">
        <label class="flex items-center gap-2"><span>部位</span>
          <select v-model="slotFilter" class="field" aria-label="装备部位" @change="selectItem()">
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
        <p v-if="category === 'GEAR' && !visibleGear.length" class="equip-empty">
          {{ showStorage ? '行囊里没有符合条件的装备。' : '随身没有符合条件的装备。' }}
        </p>
        <p v-else-if="category !== 'GEAR' && !supplies.length" class="equip-empty">暂无{{ categories.find(({ id }) => id === category)?.label }}。</p>
        <div class="bag-grid">
          <template v-if="category === 'GEAR'">
            <button v-for="gear in visibleGear" :key="gear.id" type="button" class="bag-tile" :class="TIER_META[gear.tier].cls"
              :data-bag-item="gear.id" :aria-pressed="selectedId === gear.id" :aria-label="gear.name" :title="gear.name" @click="selectItem(gear.id)">
              <ItemIcon :item-id="gear.id" :glyph="EQUIP_SLOT_META[gear.slot].glyph" class="gear-icon" />
              <b class="tier-text">{{ gear.name }}</b>
              <small>{{ TIER_META[gear.tier].label }}<template v-if="stars(gear.id)"> · +{{ stars(gear.id) }} 星</template></small>
            </button>
            <span v-for="n in emptySlots" :key="`empty-${n}`" class="bag-empty-cell" aria-hidden="true" />
          </template>
          <button v-for="entry in supplies" :key="entry.id" type="button" class="bag-tile" :class="TIER_META[entry.tier].cls"
            :data-bag-item="entry.id" :aria-pressed="selectedId === entry.id" :title="entry.name" @click="selectItem(entry.id)">
            <ItemIcon :item-id="entry.iconId ?? entry.id" :glyph="entry.glyph" class="gear-icon" />
            <b class="tier-text">{{ entry.name }}</b>
            <small>×{{ entry.count.toLocaleString() }}</small>
          </button>
        </div>
      </div>
    </section>

    <aside class="equip-pane detail-pane" :aria-label="paneTitle">
      <header class="equip-heading">
        <h2 ref="detailHeading" class="sec-title" tabindex="-1">{{ paneTitle }}</h2>
        <button v-if="inBag && (selectedGear || selectedSupply)" type="button" class="btn btn-sm" @click="closeItem">关闭详情</button>
        <button v-else-if="!inBag && rolePane" type="button" class="btn btn-sm" @click="closeRolePane"><ArrowLeft aria-hidden="true" />返回概览</button>
      </header>
      <div :key="inBag ? (selectedId ?? 'bag') : (rolePane ?? 'role')" class="equip-scroll detail-body">
        <template v-if="item">
          <div class="item-heading" :class="TIER_META[item.tier].cls">
            <ItemIcon :item-id="item.id" :glyph="EQUIP_SLOT_META[item.slot].glyph" class="gear-icon" />
            <div>
              <h3 class="font-brush tier-text">{{ item.name }}<small v-if="stars(item.id)"> +{{ stars(item.id) }} 星</small></h3>
              <p class="text-ink3">{{ EQUIP_SLOT_META[item.slot].label }} · {{ TIER_META[item.tier].label }}<template v-if="item.isTrueUnique"> · 全服唯一</template></p>
            </div>
          </div>
          <div v-if="comparing" class="gear-comparison" role="group" aria-label="同部位装备对比">
            <section v-for="{ label, gear } in comparisons" :key="label" class="compare-column">
              <h4>{{ label }}</h4>
              <template v-if="gear">
                <div class="flex min-w-0 items-center gap-1.5" :class="TIER_META[gear.tier].cls">
                  <ItemIcon :item-id="gear.id" :glyph="EQUIP_SLOT_META[gear.slot].glyph" class="[--item-icon-size:1.6rem]" />
                  <b class="tier-text">{{ gear.name }}<small v-if="stars(gear.id)"> +{{ stars(gear.id) }} 星</small></b>
                </div>
                <ul><li v-for="effect in itemEffects(gear)" :key="effect">{{ effect }}</li></ul>
                <p v-if="gear.signatureEffect" class="hint">{{ gear.signatureEffect }}</p>
              </template>
              <p v-else class="text-ink3">未装备</p>
            </section>
          </div>
          <ul v-else class="item-effects text-jade"><li v-for="effect in itemEffects(item)" :key="effect">{{ effect }}</li></ul>
          <p v-if="item.signatureEffect && !comparing" class="text-gold">{{ item.signatureEffect }}</p>
          <div v-if="setDetail" class="set-effects">
            <b>{{ setDetail.name }} · {{ setDetail.count }}/{{ setDetail.total }} 件已穿戴</b>
            <p v-for="effect in setDetail.effects" :key="effect" class="hint">{{ effect }}</p>
          </div>
          <p class="text-ink2">{{ item.desc }}</p>
          <p v-if="inBag && wearer && item.slot === 'RELIC'" class="text-cinnabar">全队秘宝在主角栏装配。</p>
          <p v-else-if="requirement" :class="meetsRequirement ? 'text-ink2' : 'text-cinnabar'">
            需要{{ requirement.label }}<template v-if="'key' in requirement">（当前 {{ wearerStats[requirement.key] }}）</template>
            <template v-if="inBag && !meetsRequirement">，暂不可穿戴。</template>
          </p>
        </template>
        <template v-else-if="inBag && selectedSupply">
          <div class="item-heading" :class="TIER_META[selectedSupply.tier].cls">
            <ItemIcon :item-id="selectedSupply.iconId ?? selectedSupply.id" :glyph="selectedSupply.glyph" class="gear-icon" />
            <h3 class="font-brush tier-text">{{ selectedSupply.name }}</h3>
          </div>
          <p class="text-gold">持有 ×{{ selectedSupply.count.toLocaleString() }}</p>
          <p class="text-ink2">{{ selectedSupply.desc }}</p>
          <p v-if="selectedSupply.source" class="hint">来源 · {{ selectedSupply.source }}</p>
        </template>
        <p v-else-if="inBag" class="equip-empty" aria-live="polite">{{ equipMessage || '选一个物品查看详细信息。' }}</p>
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
        <button v-if="canCompare" type="button" class="btn btn-sm" :aria-pressed="showComparison" @click="showComparison = !showComparison">同部位对比</button>
        <button type="button" class="btn btn-gold action-main" :disabled="!meetsRequirement || store.onlineActionBusy"
          :aria-label="`装备${selectedGear.name}`" @click="equipSelected">{{ comparedItem ? '更换装备' : '装备' }}</button>
      </footer>
      <footer v-else-if="inBag && supplyAction" class="equip-footer">
        <button type="button" class="btn btn-gold action-main" @click="supplyAction.run">{{ supplyAction.label }}</button>
      </footer>
      <footer v-else-if="!inBag && openSlot" class="equip-footer">
        <button v-if="openSlot.item" type="button" class="btn btn-sm" :aria-label="`卸下${openSlot.item.name}`" :disabled="store.onlineActionBusy" @click="unequip(openSlot.type)">卸下</button>
        <button type="button" class="btn btn-gold action-main" @click="changeEquipment(openSlot.type)">{{ openSlot.item ? '更换装备' : '选择装备' }}</button>
      </footer>
    </aside>
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
.bag-layout { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
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
.equip-portrait small, .worn-copy small { display: block; color: var(--ink-3); font-size: .74rem; }
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
.bag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(4.75rem, 100%), 1fr)); gap: .45rem; padding: .15rem; }
.bag-tile { display: grid; justify-items: center; align-content: center; gap: .24rem; padding: .4rem; text-align: center; }
.bag-tile b { width: 100%; }
.bag-tile small { color: var(--ink-3); font-size: .71rem; }
.bag-empty-cell { min-height: 5rem; border: 1px dashed var(--line); background: var(--gold-faint); }
.equip-empty { margin: .35rem 0 .65rem; color: var(--ink-3); font-size: .86rem; }
.detail-pane .equip-heading { flex: none; min-height: 1.85rem; padding-bottom: .45rem; border-bottom: 1px solid var(--line); }
.detail-body { display: flex; flex-direction: column; gap: .65rem; padding: .25rem .18rem .35rem; font-size: .88rem; overflow-wrap: anywhere; }
.detail-body > * { flex-shrink: 0; }
.item-heading { display: flex; align-items: center; gap: .55rem; }
.item-heading h3 { font-size: 1.32rem; line-height: 1.19; }
.item-heading .gear-icon { --item-icon-size: clamp(2rem, 4.3vw, 3.5rem); }
.item-heading .item-icon-standalone { --item-illustration-size: clamp(5rem, 18vh, 8rem); }
.item-effects, .compare-column ul { display: grid; gap: .2rem; }
.gear-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
.compare-column { display: grid; align-content: start; gap: .35rem; min-width: 0; padding: .58rem; border: 1px solid var(--line); background: var(--bg-0); }
.compare-column h4 { color: var(--ink-3); font-size: .78rem; }
.compare-column ul { color: var(--ink-2); }
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
