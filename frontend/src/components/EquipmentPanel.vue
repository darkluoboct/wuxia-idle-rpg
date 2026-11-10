<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Swords } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { ITEMS, type ItemConfig } from '@/config/gameData'
import { BASE_STAT_LABELS, EQUIP_SLOT_META, itemBonusLabels, TIER_META } from '@/config/uiMeta'
import type { EquipSlotType } from '@/network/protocol'
import CharacterCombatStats from './CharacterCombatStats.vue'

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

const worn = computed(() => slotOrder.map((type) => {
  const slot = EQUIP_SLOT_META[type]
  const id = store.currentLoadout[slot.field]
  return { ...slot, type, item: id ? ITEMS[id] : undefined }
}))
const wornIds = computed(() => new Set(worn.value.flatMap(({ item }) => item ? [item.id] : [])))
const backpack = computed(() => store.ownedItemIds
  .map((id) => ITEMS[id])
  .filter((item) => item && !wornIds.value.has(item.id))
  .sort((a, b) => TIER_META[b.tier].rank - TIER_META[a.tier].rank))

const PILL_ID = 'jiuhua_yulu_pill'
const hasPill = computed(() => store.pillCount > 0)
const emptySlots = computed(() => Math.max(0, 24 - backpack.value.length - Number(hasPill.value)))

const selectedId = ref<string | null>(null)
const selected = computed(() => backpack.value.find((item) => item.id === selectedId.value))
const pillSelected = computed(() => hasPill.value && selectedId.value === PILL_ID)
const requirement = computed(() => selected.value?.reqStat)
const meetsRequirement = computed(() => !requirement.value || store.player.stats[requirement.value.key] >= requirement.value.val)

const bonuses = computed(() => selected.value ? itemBonusLabels(selected.value) : [])

function equipSelected() {
  if (!selected.value || !meetsRequirement.value) return
  store.equipItem(selected.value.id)
  selectedId.value = null
}
</script>

<template>
  <div class="equipment-panel">
    <div class="equipment-overview">
      <section class="well equip-pane" aria-label="已穿戴">
        <header class="equip-heading">
          <h3 class="sec-title">已穿戴</h3>
          <span>{{ wornIds.size }} / {{ worn.length }}</span>
        </header>

        <div class="equip-doll">
          <div class="equip-portrait">
            <i class="art art-hero" aria-hidden="true" />
            <strong class="font-brush">{{ store.player.nickname }}</strong>
            <small>{{ store.player.level }} 级 · {{ store.currentRealm.name }}</small>
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
            <span class="worn-name" :class="slot.item ? TIER_META[slot.item.tier].cls : ''">{{ slot.item?.name ?? emptyHints[slot.type] ?? '未装备' }}</span>
          </div>
        </div>
      </section>

      <section class="well equip-pane equip-attributes" aria-label="角色属性">
        <h3 class="sec-title">角色属性</h3>
        <div class="equip-power"><Swords aria-hidden="true" /><span>战力</span><b>{{ store.derivedStats.combatPower.toLocaleString() }}</b></div>
        <CharacterCombatStats />

        <details class="equip-base">
          <summary><span>基础属性</span><ChevronDown :size="14" aria-hidden="true" /></summary>
          <dl class="base-stats">
            <div v-for="(label, key) in BASE_STAT_LABELS" :key="key"><dt>{{ label }}</dt><dd>{{ store.player.stats[key] }}</dd></div>
          </dl>
        </details>
      </section>
    </div>

    <div class="equipment-storage">
      <section class="well equip-pane" aria-label="背包">
        <header class="equip-heading">
          <h3 class="sec-title">背包</h3>
          <span>{{ backpack.length }} 件装备<span v-if="hasPill"> · {{ store.pillCount }} 枚丹药</span></span>
        </header>
        <div class="bag-grid">
          <button
            v-for="item in backpack" :key="item.id"
            class="gear-cell" :class="TIER_META[item.tier].cls"
            :aria-pressed="selectedId === item.id" :aria-label="item.name" :title="`${item.name} · ${TIER_META[item.tier].label}`"
            @click="selectedId = item.id"
          ><i class="art" :class="itemArt(item)" :style="atlasCells[item.id]" aria-hidden="true" /></button>

          <button
            v-if="hasPill" class="gear-cell bag-potion"
            :aria-pressed="pillSelected" :aria-label="`九花玉露丸，${store.pillCount} 枚`" title="九花玉露丸"
            @click="selectedId = PILL_ID"
          >
            <i class="art art-potion" aria-hidden="true" /><b>{{ store.pillCount }}</b>
          </button>

          <span v-for="n in emptySlots" :key="`empty-${n}`" class="gear-cell is-empty" aria-hidden="true" />
        </div>
      </section>

      <aside class="well equip-pane bag-actions" aria-label="物品操作">
        <h3 class="sec-title">物品操作</h3>

        <div class="bag-selection" aria-live="polite">
          <template v-if="selected">
            <h4 class="tier-text" :class="TIER_META[selected.tier].cls">{{ selected.name }}</h4>
            <p class="text-ink2">{{ TIER_META[selected.tier].label }} · {{ EQUIP_SLOT_META[selected.slot].label }}</p>
            <p v-if="selected.isTrueUnique" class="text-cinnabar">全服唯一</p>
            <ul v-if="bonuses.length" class="bag-bonuses text-jade">
              <li v-for="bonus in bonuses" :key="bonus">{{ bonus }}</li>
            </ul>
            <p v-if="requirement" :class="meetsRequirement ? 'text-ink2' : 'text-cinnabar'">
              需要{{ requirement.label }}（当前 {{ store.player.stats[requirement.key] }}）
            </p>
          </template>
          <template v-else-if="pillSelected">
            <h4>九花玉露丸</h4>
            <p class="text-ink2">在修行页勾选服用。每次突破消耗 1 枚，成功率 +25%。</p>
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
.equip-portrait .art {
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
