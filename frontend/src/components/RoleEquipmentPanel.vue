<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref } from 'vue'
import { ArrowLeft, ChevronRight, Swords } from 'lucide-vue-next'
import { HIDDEN_WEAPONS, hiddenWeaponCapacity, JIANGHU_TITLES, MEDICINES, SKILLS, titleEligible, unlockedHiddenWeapons } from '@/config/gameData'
import { BASE_STAT_LABELS, EQUIP_SLOT_META, PLAYER_AVATARS, TIER_META } from '@/config/uiMeta'
import type { EquipSlotType } from '@/network/protocol'
import { useGameStore } from '@/stores/gameStore'
import type { EquipmentPane, EquipmentWearer } from '@/composables/useEquipmentWearer'
import { equippedGearSkill } from '../../../shared/trialStages.ts'
import CharacterCombatStats from './CharacterCombatStats.vue'
import InkFigure from './InkFigure.vue'
import ItemIcon from './ItemIcon.vue'
import ItemDetailCard from './ItemDetailCard.vue'

const EquipmentForge = defineAsyncComponent(() => import('./EquipmentForge.vue'))
const props = defineProps<{ context: EquipmentWearer }>()
const rolePane = defineModel<EquipmentPane | null>('pane', { required: true })
const emit = defineEmits<{ changeEquipment: [slot: EquipSlotType]; selectWearer: [id: string | null] }>()
const store = useGameStore()
const root = ref<HTMLElement>()
const roleHeading = ref<HTMLElement>()
const detailHeading = ref<HTMLElement>()
const { companions, wearer, wearerName, worn, stars } = props.context
const emptyHints: Partial<Record<EquipSlotType, string>> = { BELT: '主线掉落', RELIC: '副本掉落' }
const companionStats = computed(() => wearer.value && store.companionCombatStats(wearer.value.id))
const shownStats = computed(() => companionStats.value?.attributes ?? wearer.value?.stats ?? store.martialStats)
const qiProgress = computed(() => Math.min(100, Math.round(100 * store.player.qiExp / Math.max(1, store.player.nextLevelQi))))

const slotColumns = computed(() => [
  worn.value.filter((_, index) => index % 2 === 0),
  worn.value.filter((_, index) => index % 2 === 1),
])
const openSlot = computed(() => worn.value.find(({ type }) => type === rolePane.value))
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

const paneTitle = computed(() => {
  if (openSlot.value) return `${openSlot.value.label}详情`
  if (rolePane.value === 'ATTRIBUTES') return '属性详情'
  if (rolePane.value === 'PREPARE') return '战备'
  if (rolePane.value === 'FORGE') return '装备淬炼'
  return '角色属性'
})

function openRolePane(pane: EquipmentPane) {
  rolePane.value = pane
  void nextTick(focusDetail)
}

function closeRolePane() {
  const previous = rolePane.value
  rolePane.value = null
  void nextTick(() => {
    const trigger = root.value?.querySelector<HTMLElement>(`[data-role-pane="${previous}"]`) ?? roleHeading.value
    trigger?.focus()
  })
}

function unequip(type: EquipSlotType) {
  if (!wearer.value) return store.updateLoadout({ [EQUIP_SLOT_META[type].field]: null }, '已卸下装备')
  if (type !== 'RELIC') return store.equipCompanionItem(wearer.value.id, type, null)
}


function onEscape(event: KeyboardEvent) {
  if (store.confirmDialog || store.inspectModal || !rolePane.value) return
  closeRolePane()
  event.stopPropagation()
  event.preventDefault()
}

function focusDetail() {
  detailHeading.value?.focus({ preventScroll: true })
  if (window.matchMedia('(max-width: 639px)').matches) detailHeading.value?.scrollIntoView({ block: 'nearest' })
}
defineExpose({ focusDetail })
</script>

<template>
  <div ref="root" class="equipment-panel" @keydown.esc="onEscape">
    <section class="equip-pane character-pane" aria-label="人物装备">
      <header class="equip-heading">
        <h2 ref="roleHeading" class="sec-title" tabindex="-1">人物装备</h2>
        <span>{{ worn.filter(({ item: gear }) => gear).length }} / {{ worn.length }} 已穿戴</span>
      </header>
      <div v-if="companions.length" class="equip-options" role="group" aria-label="选择穿戴者">
        <button type="button" class="btn btn-sm" :aria-pressed="!wearer" @click="emit('selectWearer', null)">主角</button>
        <button v-for="companion in companions" :key="companion.id" type="button" class="btn btn-sm"
          :aria-pressed="wearer?.id === companion.id" @click="emit('selectWearer', companion.id)">{{ companion.name }}</button>
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

    <aside class="equip-pane detail-pane" :aria-label="paneTitle">
      <header class="equip-heading">
        <h2 ref="detailHeading" class="sec-title" tabindex="-1">{{ paneTitle }}</h2>
        <button v-if="rolePane" type="button" class="btn btn-sm" @click="closeRolePane"><ArrowLeft aria-hidden="true" />返回概览</button>
      </header>
      <div :key="rolePane ?? 'role'" class="equip-scroll detail-body">
        <ItemDetailCard v-if="openSlot?.item" :item="openSlot.item" :context="context" show-heading />
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

      <footer v-if="openSlot" class="equip-footer">
        <button v-if="openSlot.item" type="button" class="btn btn-sm" :aria-label="`卸下${openSlot.item.name}`" :disabled="store.onlineActionBusy" @click="unequip(openSlot.type)">卸下</button>
        <button type="button" class="btn btn-gold action-main" @click="emit('changeEquipment', openSlot.type)">{{ openSlot.item ? '更换装备' : '选择装备' }}</button>
      </footer>
    </aside>
  </div>
</template>
