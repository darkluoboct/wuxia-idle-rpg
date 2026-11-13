<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Swords } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { backpackCapacity, canEquipCompanionItem, HIDDEN_WEAPONS, hiddenWeaponCapacity, ITEMS, JIANGHU_TITLES, MEDICINES, meetsItemStatRequirement, SKILLS, titleEligible, unlockedHiddenWeapons, type ItemConfig } from '@/config/gameData'
import { BASE_STAT_LABELS, EQUIP_SLOT_META, itemBonusLabels, TIER_META } from '@/config/uiMeta'
import type { EquipSlotType } from '@/network/protocol'
import { companionItemId, formatBattleStatBonuses, PERSONAL_EQUIP_SLOTS } from '../../../shared/combatMeta.ts'
import { temperedItem } from '../../../shared/equipmentForge.ts'
import { equippedGearSkill, trialAffixLabel, trialAffixQuality } from '../../../shared/trialStages.ts'
import { sectEquipmentSetOf, WANDERER_EQUIPMENT } from '../../../shared/sectEquipment.ts'
import CharacterCombatStats from './CharacterCombatStats.vue'
import EquipmentForge from './EquipmentForge.vue'
import InkFigure from './InkFigure.vue'

const store = useGameStore()
const slotOrder = ['HEAD', 'WEAPON', 'ARMOR', 'ACC', 'WRIST', 'BELT', 'BOOTS', 'RELIC'] as const satisfies readonly EquipSlotType[]
const emptyHints: Partial<Record<EquipSlotType, string>> = { BELT: '主线掉落', RELIC: '副本掉落' }
const fallbackArt: Partial<Record<EquipSlotType, string>> = { WEAPON: 'art-sword', ARMOR: 'art-armor', ACC: 'art-charm', RELIC: 'art-scroll' }
const atlasRows = [
  ['bamboo_hat', 'pine_crown', 'snow_hood', 'xuantie_dagger'],
  ['cloth_bracers', 'swallow_bracers', 'iron_bracers', 'qinggang_sword'],
  ['cloth_belt', 'oxhide_belt', 'jade_belt', 'iron_bagua'],
  ['cloth_boots', 'deerskin_boots', 'cloud_boots', 'xiaoao_qupu'],
]
const atlasCells = Object.fromEntries(atlasRows.flatMap((row, y) => row.map((id, x) => [
  id, { '--art-x': `${x * 100 / 3}%`, '--art-y': `${y * 100 / 3}%` },
])))
function itemArt(item: ItemConfig) {
  return atlasCells[item.id] ? 'art-gear' : fallbackArt[item.slot]
}

const companionId = ref<string | null>(null)
const companions = computed(() => [...new Set([store.currentLoadout.leftCompanionId, store.currentLoadout.rightCompanionId])]
  .flatMap((id) => {
    const companion = id && store.companionOf(id)
    return companion ? [companion] : []
  }))
const wearer = computed(() => companions.value.find((member) => member.id === companionId.value))
const wearerStats = computed(() => wearer.value?.stats ?? store.player.stats)
const companionStats = computed(() => wearer.value && store.companionCombatStats(wearer.value.id))
const shownStats = computed(() => companionStats.value?.attributes ?? wearer.value?.stats ?? store.martialStats)
const hiddenSlots = computed(() => hiddenWeaponCapacity(store.currentLoadout))
const availableWeapons = computed(() => unlockedHiddenWeapons(store.player))
const equippedWeapons = computed(() => (store.currentLoadout.hiddenWeaponIds ?? []).slice(0, hiddenSlots.value))
const gearSkillWeapon = computed(() => ITEMS[store.currentLoadout.weaponId ?? ''])
const gearSkill = computed(() => equippedGearSkill({ ...store.currentLoadout, gearSkillId: gearSkillWeapon.value?.id }))
const equippedTitle = computed(() => JIANGHU_TITLES.find((title) => title.id === store.currentLoadout.titleId))
const titleActive = computed(() => !!store.jianghuTitle)
const medicineSlots = [
  { field: 'battlePillId', category: 'BATTLE_PILL', name: '战斗丹药' },
  { field: 'weaponVenomId', category: 'WEAPON_VENOM', name: '兵刃毒膏' },
] as const
const medicineStock = computed(() => store.player.battleMedicines ?? {})
const battleMedicines = Object.values(MEDICINES).filter((medicine) => medicine.category === 'BATTLE_PILL' || medicine.category === 'WEAPON_VENOM')

function equipHiddenWeapon(index: number, event: Event) {
  const id = (event.target as HTMLSelectElement).value
  const selected = [...equippedWeapons.value]
  selected[index] = id
  return store.updateLoadout({ hiddenWeaponIds: selected.filter(Boolean) })
}

function equipTitle(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  return store.updateLoadout({ titleId: id || null })
}

function selectGearSkill(event: Event) {
  return store.updateLoadout({ gearSkillId: (event.target as HTMLSelectElement).value || null })
}

function equipMedicine(field: typeof medicineSlots[number]['field'], event: Event) {
  const id = (event.target as HTMLSelectElement).value
  return store.updateLoadout({ [field]: id || null })
}

function openAlchemy() {
  store.marketTab = 'ALCHEMY'
  store.selectTab('MARKET')
}

const worn = computed(() => slotOrder.flatMap((type) => {
  const slot = EQUIP_SLOT_META[type]
  if (type === 'RELIC' && wearer.value) return []
  const id = wearer.value && type !== 'RELIC' ? companionItemId(store.currentLoadout, wearer.value.id, type) : store.currentLoadout[slot.field]
  return [{ ...slot, type, item: typeof id === 'string' ? ITEMS[id] : undefined }]
}))
const wornIds = computed(() => new Set([
  ...slotOrder.map((slot) => store.currentLoadout[EQUIP_SLOT_META[slot].field]),
  ...companions.value.flatMap(({ id }) => PERSONAL_EQUIP_SLOTS.map((slot) => companionItemId(store.currentLoadout, id, slot))),
]))
const backpack = computed(() => store.ownedItemIds
  .map((id) => ITEMS[id])
  .filter((item) => item && !wornIds.value.has(item.id))
  .sort((a, b) => TIER_META[b.tier].rank - TIER_META[a.tier].rank))

const PILL_ID = 'pozhang_dan'
const hasPill = computed(() => store.pillCount > 0)
const bagCapacity = computed(() => backpackCapacity(store.currentLoadout))
const carriedSlots = computed(() => bagCapacity.value - Number(hasPill.value))
const bagSections = computed(() => [
  { name: '背包', items: backpack.value.slice(0, carriedSlots.value) },
  { name: '行囊', items: backpack.value.slice(carriedSlots.value) },
])
const emptySlots = computed(() => Math.max(0, carriedSlots.value - backpack.value.length))
const showStorage = ref(false)

const selectedId = ref<string | null>(null)
const selected = computed(() => backpack.value.find((item) => item.id === selectedId.value))
const pillSelected = computed(() => hasPill.value && selectedId.value === PILL_ID)
const requirement = computed(() => selected.value?.reqStat)
const meetsRequirement = computed(() => wearer.value
  ? canEquipCompanionItem(wearer.value, selected.value)
  : !selected.value || meetsItemStatRequirement(selected.value, wearerStats.value))

const forgeState = (id: string) => store.player.equipmentForge?.items[id]
const stars = (id: string) => forgeState(id)?.stars ?? 0
const bonuses = computed(() => selected.value ? itemBonusLabels(temperedItem(selected.value, stars(selected.value.id))) : [])
const secondaryLabel = computed(() => {
  const affix = selected.value && forgeState(selected.value.id)?.secondary
  return affix ? formatBattleStatBonuses({ [affix.stat]: affix.value }) : ''
})
const sectSet = computed(() => selected.value?.setId ? sectEquipmentSetOf(selected.value.setId) : undefined)
const wornSetPieces = computed(() => worn.value.filter(({ item }) => sectSet.value && item?.setId === sectSet.value.id).length)
const affixRoll = (id: string) => store.player.equipmentAffixes?.[id] ?? 0

function equipSelected() {
  if (!selected.value || !meetsRequirement.value) return
  const { id, slot } = selected.value
  if (!wearer.value) store.equipItem(id)
  else if (slot !== 'RELIC') store.equipCompanionItem(wearer.value.id, slot, id)
  selectedId.value = null
}

function unequip(type: EquipSlotType) {
  if (!wearer.value) store.updateLoadout({ [EQUIP_SLOT_META[type].field]: null }, '已卸下装备')
  else if (type !== 'RELIC') store.equipCompanionItem(wearer.value.id, type, null)
}
</script>

<template>
  <div class="equipment-panel">
    <div v-if="companions.length" class="flex flex-wrap gap-2" role="group" aria-label="选择穿戴者">
      <button class="btn btn-sm" :class="{ 'btn-gold': !wearer }" :aria-pressed="!wearer" @click="companionId = null">主角</button>
      <button v-for="companion in companions" :key="companion.id" class="btn btn-sm" :class="{ 'btn-gold': wearer?.id === companion.id }"
        :aria-pressed="wearer?.id === companion.id" @click="companionId = companion.id">{{ companion.name }}</button>
    </div>
    <div class="equipment-overview">
      <section class="well equip-pane" aria-label="已穿戴">
        <header class="equip-heading">
          <h3 class="sec-title">已穿戴</h3>
          <span>{{ worn.filter(({ item }) => item).length }} / {{ worn.length }}</span>
        </header>

        <div class="equip-doll">
          <div class="equip-portrait">
            <span v-if="wearer" class="equip-partner-portrait relative overflow-hidden"><InkFigure :style-type="wearer.portraitStyle" /></span>
            <i v-else class="art art-hero" aria-hidden="true" />
            <strong class="font-brush">{{ wearer?.name ?? store.player.nickname }}</strong>
            <small>{{ wearer?.title ?? `${store.player.level} 级 · ${store.currentRealm.name}` }}</small>
          </div>

          <div v-for="slot in worn" :key="slot.type" class="worn-slot" :data-slot="slot.type">
            <span class="worn-label">{{ slot.label }}</span>
            <button
              v-if="slot.item"
              class="gear-cell worn-cell" :class="TIER_META[slot.item.tier].cls"
              :aria-label="`查看已穿戴的${slot.item.name}`" :title="slot.item.name"
              @click="store.inspectById('item', slot.item.id)"
            ><i class="art" :class="itemArt(slot.item)" :style="atlasCells[slot.item.id]" aria-hidden="true" /></button>
            <span v-else class="gear-cell worn-cell is-empty font-brush" aria-hidden="true">{{ slot.glyph }}</span>
            <span class="worn-name" :class="slot.item ? TIER_META[slot.item.tier].cls : ''">
              {{ slot.item?.name ?? emptyHints[slot.type] ?? '未装备' }}
              <small v-if="slot.item && stars(slot.item.id)" class="text-gold">+{{ stars(slot.item.id) }} 星</small>
              <small v-if="slot.item && affixRoll(slot.item.id)" class="text-gold">{{ trialAffixQuality(slot.item, affixRoll(slot.item.id)) }}</small>
            </span>
            <button v-if="slot.item" type="button" class="text-xs text-ink3 underline" :aria-label="`卸下${slot.item.name}`"
              :disabled="store.onlineActionBusy" @click="unequip(slot.type)">卸下</button>
          </div>
        </div>
      </section>

      <section class="well equip-pane equip-attributes" aria-label="角色属性">
        <h3 class="sec-title">角色属性</h3>
        <div class="equip-power"><Swords aria-hidden="true" /><span>战力</span><b>{{ (companionStats ?? store.derivedStats).combatPower.toLocaleString() }}</b></div>
        <CharacterCombatStats :stats="companionStats" />

        <details class="equip-base">
          <summary><span>{{ !wearer && store.isWandererMasteryActive ? '六维属性 · 兼收并蓄' : '六维属性' }}</span><ChevronDown :size="14" aria-hidden="true" /></summary>
          <dl class="base-stats">
            <div v-for="(label, key) in BASE_STAT_LABELS" :key="key"><dt>{{ label }}</dt><dd>{{ shownStats[key] }}</dd></div>
          </dl>
        </details>
      </section>
    </div>

    <div v-if="!wearer" class="grid gap-2 md:grid-cols-2">
      <section v-if="gearSkill" class="well equip-pane space-y-2" aria-label="装备特技配装">
        <label class="block space-y-1 text-sm">
          <span>装备特技</span>
          <select class="field w-full" :value="store.currentLoadout.gearSkillId ?? ''"
            :disabled="store.onlineActionBusy" @change="selectGearSkill">
            <option value="">不使用</option>
            <option :value="gearSkill.weapon.id">{{ gearSkill.name }} · {{ gearSkill.rageCost }} 怒气</option>
          </select>
        </label>
        <p class="hint">试炼与复战每场可施展一次。对同一目标连击，每击按外功威力的 {{ gearSkill.damagePercent }}% 结算。</p>
      </section>
      <section class="well equip-pane space-y-2" aria-label="暗器配装">
        <h3 class="sec-title">暗器</h3>
        <p v-if="!availableWeapons.length" class="hint">首胜历练第 04 关解锁飞天淬毒黑菱。</p>
        <label v-for="index in hiddenSlots" :key="index" class="block space-y-1 text-sm">
          <span>暗器 {{ index }}</span>
          <select class="field w-full" :value="equippedWeapons[index - 1] ?? ''"
            :disabled="store.onlineActionBusy || !availableWeapons.length" @change="equipHiddenWeapon(index - 1, $event)">
            <option value="">未装备</option>
            <option v-for="weapon in availableWeapons" :key="weapon.id" :value="weapon.id"
              :disabled="equippedWeapons.includes(weapon.id) && equippedWeapons[index - 1] !== weapon.id">{{ weapon.name }}</option>
          </select>
          <span v-if="HIDDEN_WEAPONS[equippedWeapons[index - 1]]" class="hint block">{{ HIDDEN_WEAPONS[equippedWeapons[index - 1]].effectDesc }}</span>
        </label>
      </section>
      <section class="well equip-pane space-y-2" aria-label="称号配装">
        <h3 class="sec-title">江湖称号</h3>
        <label class="block space-y-1 text-sm">
          <span>出战称号</span>
          <select class="field w-full" :value="equippedTitle?.id ?? ''" :disabled="store.onlineActionBusy" @change="equipTitle">
            <option value="">不佩戴称号</option>
            <option v-for="title in JIANGHU_TITLES" :key="title.id" :value="title.id">
              {{ title.titleName }}{{ titleEligible(title, { ...store.player, stats: store.martialStats }, store.currentLoadout) ? '' : '（未达条件）' }}
            </option>
          </select>
        </label>
        <template v-if="equippedTitle">
          <p class="hint">{{ equippedTitle.statBuffDesc }}</p>
          <p v-if="!titleActive" class="hint">
            {{ equippedTitle.reqAlignment === 'HERMIT' ? '侠义 −199 至 199' : `侠义 ${equippedTitle.reqAlignment === 'EVIL' ? '≤' : '≥'} ${equippedTitle.minReputation}` }}，
            装配{{ equippedTitle.skills.map((id) => SKILLS[id]?.name).join('、') }}中的一门{{ equippedTitle.outerForm === 'PALM' ? '或其他掌法外功' : '' }}后生效。
          </p>
        </template>
      </section>
    </div>

    <section v-if="!wearer" class="well equip-pane space-y-2" aria-label="百草药囊">
      <header class="equip-heading">
        <h3 class="sec-title">百草药囊</h3>
        <button class="btn btn-sm" type="button" @click="openAlchemy">去百草丹房</button>
      </header>
      <div class="grid gap-2 md:grid-cols-2">
        <label v-for="slot in medicineSlots" :key="slot.field" class="block space-y-1 text-sm">
          <span>{{ slot.name }}</span>
          <select class="field w-full" :value="store.currentLoadout[slot.field] ?? ''" :disabled="store.onlineActionBusy"
            @change="equipMedicine(slot.field, $event)">
            <option value="">未装配</option>
            <option v-for="medicine in battleMedicines.filter((entry) => entry.category === slot.category)" :key="medicine.id" :value="medicine.id"
              :disabled="!(medicineStock[medicine.id] > 0)">{{ medicine.name }} · {{ medicineStock[medicine.id] ?? 0 }} 份</option>
          </select>
          <span v-if="store.currentLoadout[slot.field]" class="hint block">{{ MEDICINES[store.currentLoadout[slot.field] ?? '']?.effectDesc }}</span>
        </label>
      </div>
      <p class="hint">实战触发后扣除库存。切磋和华山挑战期间药囊停用。</p>
    </section>

    <div class="equipment-storage">
      <section class="well equip-pane" aria-label="背包">
        <header class="equip-heading">
          <h3 class="sec-title">背包</h3>
          <span>{{ Math.min(backpack.length, carriedSlots) + Number(hasPill) }} / {{ bagCapacity }} 格</span>
        </header>
        <template v-for="(section, index) in bagSections" :key="section.name">
          <button v-if="index && section.items.length" class="btn btn-sm mt-2" :aria-expanded="showStorage"
            aria-controls="equipment-storage" @click="showStorage = !showStorage">{{ showStorage ? '收起' : '展开' }}行囊 · {{ section.items.length }} 件</button>
          <div v-if="!index || (section.items.length && showStorage)" :id="index ? 'equipment-storage' : undefined" class="bag-grid" :aria-label="section.name">
            <button
              v-for="item in section.items" :key="item.id"
              class="gear-cell" :class="TIER_META[item.tier].cls"
              :aria-pressed="selectedId === item.id" :aria-label="affixRoll(item.id) ? `${item.name} · ${trialAffixQuality(item, affixRoll(item.id))}` : item.name"
              :title="`${item.name} · ${TIER_META[item.tier].label}`"
              @click="selectedId = item.id"
            >
              <i class="art" :class="itemArt(item)" :style="atlasCells[item.id]" aria-hidden="true" />
              <span v-if="stars(item.id) || affixRoll(item.id)" class="affix-star text-gold" aria-hidden="true">{{ stars(item.id) || '' }}★</span>
            </button>

            <template v-if="!index">
              <button
                v-if="hasPill" class="gear-cell bag-potion"
                :aria-pressed="pillSelected" :aria-label="`${MEDICINES[PILL_ID].name}，${store.pillCount} 枚`" :title="MEDICINES[PILL_ID].name"
                @click="selectedId = PILL_ID"
              >
                <i class="art art-potion" aria-hidden="true" /><b>{{ store.pillCount }}</b>
              </button>
              <span v-for="n in emptySlots" :key="`empty-${n}`" class="gear-cell is-empty" aria-hidden="true" />
            </template>
          </div>
        </template>
      </section>

      <aside class="well equip-pane bag-actions" aria-label="物品操作">
        <h3 class="sec-title">物品操作</h3>

        <div class="bag-selection" aria-live="polite">
          <template v-if="selected">
            <h4 class="tier-text" :class="TIER_META[selected.tier].cls">{{ selected.name }}<template v-if="stars(selected.id)"> +{{ stars(selected.id) }} 星</template></h4>
            <p class="text-ink2">{{ TIER_META[selected.tier].label }} · {{ EQUIP_SLOT_META[selected.slot].label }}</p>
            <p v-if="selected.isTrueUnique" class="text-cinnabar">全服唯一</p>
            <ul v-if="bonuses.length" class="bag-bonuses text-jade">
              <li v-for="bonus in bonuses" :key="bonus">{{ bonus }}</li>
            </ul>
            <p v-if="affixRoll(selected.id)" class="text-gold">
              {{ trialAffixQuality(selected, affixRoll(selected.id)) }} · {{ trialAffixLabel(selected, affixRoll(selected.id)) }}
            </p>
            <p v-if="secondaryLabel" class="text-gold">副词条 · {{ secondaryLabel }}</p>
            <p v-if="selected.signatureEffect" class="hint">{{ selected.signatureEffect }}</p>
            <p v-if="sectSet" class="hint">{{ sectSet.name }} · 已穿戴 {{ wornSetPieces }}/{{ sectSet.parts.length }}</p>
            <p v-if="sectSet" class="hint">{{ sectSet.bonus }}</p>
            <p v-if="WANDERER_EQUIPMENT.items.some(({ id }) => id === selected?.id)" class="hint">{{ selected.desc }}</p>
            <p v-if="requirement" :class="meetsRequirement ? 'text-ink2' : 'text-cinnabar'">
              需要{{ requirement.label }}<template v-if="'key' in requirement">（当前 {{ wearerStats[requirement.key] }}）</template>
            </p>
            <p v-if="wearer && selected.slot === 'RELIC'" class="text-ink2">全队秘宝在主角栏装配。</p>
          </template>
          <template v-else-if="pillSelected">
            <h4>{{ MEDICINES[PILL_ID].name }}</h4>
            <p class="text-ink2">{{ MEDICINES[PILL_ID].effectDesc }}</p>
          </template>
          <p v-else class="text-ink2">{{ backpack.length || hasPill ? '选一个背包格子。' : '背包里还没有物品。' }}</p>
        </div>

        <div class="bag-controls">
          <button v-if="pillSelected" class="btn btn-gold btn-block" @click="store.selectTab('CULTIVATE')">去修行</button>
          <template v-else>
            <button
              class="btn btn-gold btn-block" :disabled="!selected || !meetsRequirement || store.onlineActionBusy"
              :aria-label="selected ? `装备${selected.name}` : '装备物品'"
              @click="equipSelected"
            >装备</button>
            <button class="btn btn-block" :disabled="!selected" @click="selected && store.inspectById('item', selected.id)">查看详情</button>
          </template>
        </div>
      </aside>
    </div>
    <EquipmentForge />
  </div>
</template>

<style scoped>
.equipment-panel {
  container-type: inline-size;
  display: grid;
  align-content: start;
  gap: .72rem;
}
.equipment-overview, .equipment-storage {
  display: grid;
  gap: .66rem;
}
.equipment-overview { grid-template-columns: minmax(0, 1.13fr) minmax(0, 1fr); }
.equipment-storage { grid-template-columns: minmax(0, 1fr) clamp(8.5rem, 26%, 12rem); }
.equip-pane {
  min-width: 0;
  padding: clamp(.57rem, 1.1vw, .86rem);
  background: linear-gradient(155deg, var(--gold-faint), transparent 58%), var(--bg-2);
}
.equip-heading {
  display: flex;
  align-items: baseline;
  gap: .4rem;
}
.equip-heading .sec-title { flex: 1; white-space: nowrap; }
.equip-heading > span { font-size: .73rem; color: var(--ink-3); text-align: right; }

.equip-doll {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1fr);
  align-items: center;
  gap: .28rem .3rem;
  margin-top: .7rem;
}
.equip-portrait {
  grid-column: 2;
  grid-row: 1 / span 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .17rem;
  min-width: 0;
  text-align: center;
}
.equip-portrait .art,
.equip-partner-portrait {
  width: min(100%, 7rem);
  aspect-ratio: 1;
  border: 2px solid var(--frame-edge);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--gold-soft), 0 .34rem .8rem #17110e55;
}
.equip-portrait strong { margin-top: .27rem; color: var(--gold); font-size: 1.1rem; line-height: 1.2; }
.equip-portrait small { color: var(--ink-2); font-size: .71rem; }
.worn-slot {
  display: grid;
  justify-items: center;
  gap: .14rem;
  min-width: 0;
  text-align: center;
  line-height: 1.14;
}
.worn-label { color: var(--ink-2); font-size: .78rem; }
.worn-name {
  max-width: 100%;
  overflow: hidden;
  color: var(--tc, var(--ink-3));
  font-size: .73rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gear-cell {
  position: relative;
  display: grid;
  min-width: 0;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tc, var(--gold)) 58%, var(--line-strong));
  border-radius: .25rem;
  background: linear-gradient(145deg, var(--bg-1), var(--bg-0));
}
.gear-cell.is-empty {
  border-color: var(--line-strong);
  box-shadow: inset 0 0 0 2px var(--gold-faint);
}
.gear-cell .art { position: absolute; inset: 2px; border-radius: .16rem; }
.art.art-gear { background-image: url('@/assets/gear-atlas.webp'); }
.affix-star { position: absolute; top: .1rem; right: .25rem; font-size: .8rem; }
button.gear-cell:hover { border-color: var(--gold); }
button.gear-cell[aria-pressed="true"] { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold), 0 0 .65rem var(--gold-soft); }
.worn-cell { width: min(100%, 2.65rem); }
.worn-cell.is-empty { color: var(--ink-3); opacity: .75; }

.equip-power {
  display: flex;
  align-items: center;
  gap: .35rem;
  margin-top: .56rem;
  color: var(--gold);
  font-size: .88rem;
}
.equip-power svg { width: 1.05rem; height: 1.05rem; flex: none; }
.equip-power b { margin-left: .16rem; font-size: 1.18rem; font-variant-numeric: tabular-nums; }
.equip-attributes :deep(.combat-stats), .equip-base .base-stats { padding: .45rem 0 .52rem; column-gap: .75rem; font-size: .84rem; }
.equip-base { border-top: 1px solid var(--line); }
.equip-base summary { display: flex; align-items: center; gap: .3rem; padding-block: .36rem; color: var(--ink-2); font-size: .77rem; }
.equip-base summary:hover { color: var(--gold); }
.equip-base[open] svg { transform: rotate(180deg); }
.equip-base .base-stats { border-bottom: 0; padding-top: 0; }

.bag-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: .38rem;
  margin-top: .61rem;
}
.bag-potion b { position: absolute; right: .25rem; bottom: .1rem; color: var(--scene-ink); font-size: .77rem; text-shadow: 0 1px 3px #211609; }
.bag-actions { display: flex; flex-direction: column; gap: .59rem; }
.bag-selection { min-height: 2.5rem; font-size: .79rem; line-height: 1.46; overflow-wrap: anywhere; }
.bag-selection h4 { font-size: .95rem; font-weight: 700; line-height: 1.26; }
.bag-selection p + p, .bag-bonuses { margin-top: .25rem; }
.bag-controls { display: grid; gap: .32rem; }
.bag-controls .btn { padding-inline: .3rem; font-size: .8rem; white-space: nowrap; }

@container (max-width: 32rem) {
  .equipment-storage { grid-template-columns: minmax(0, 1fr) max(5.8rem, 28%); }
  .bag-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@container (max-width: 26rem) {
  .equip-doll { gap: .28rem .14rem; }
  .worn-cell { width: min(100%, 2.3rem); }
  .worn-label, .worn-name { font-size: .65rem; }
  .equip-portrait strong { font-size: .87rem; }
  .equip-portrait small { font-size: .63rem; }
  .equip-attributes :deep(.combat-stats) { grid-template-columns: minmax(0, 1fr); row-gap: .08rem; }
  .equip-attributes :deep(.combat-stats dt svg) { width: .76rem; height: .76rem; }
  .equipment-overview, .equipment-storage { gap: .42rem; }
  .bag-grid { gap: .26rem; }
}
</style>
