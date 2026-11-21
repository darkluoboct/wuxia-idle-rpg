<script setup lang="ts">
import { computed } from 'vue'
import type { ItemConfig } from '@/config/gameData'
import { EQUIP_SLOT_META, itemBonusRows, TIER_META } from '@/config/uiMeta'
import type { EquipmentWearer } from '@/composables/useEquipmentWearer'
import { usePlayerStore } from '@/stores/playerStore'
import { formatBattleStatBonuses } from '../../../shared/combatMeta.ts'
import { temperedItem } from '../../../shared/equipmentForge.ts'
import { sectEquipmentSetOf } from '../../../shared/sectEquipment.ts'
import { trialAffixLabel, trialAffixQuality, trialSetOf } from '../../../shared/trialStages.ts'
import ItemIcon from './ItemIcon.vue'
import EquipmentValue from './EquipmentValue.vue'

const props = defineProps<{ item: ItemConfig; context: EquipmentWearer; showHeading?: boolean; comparing?: boolean; comparedItem?: ItemConfig }>()
const { worn, wearer, wearerStats, stars, canWear } = props.context
const player = usePlayerStore()
const requirement = computed(() => props.item.reqStat)
const meetsRequirement = computed(() => canWear(props.item))
const forgeState = (id: string) => player.player.equipmentForge?.items[id]
function effectRows(gear: ItemConfig) {
  const effects: { key: string; label: string; value: string }[] = []
  const roll = player.player.equipmentAffixes?.[gear.id]
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
const stats = computed(() => baseRows(props.item))
const effects = computed(() => effectRows(props.item))
const comparisonRows = computed(() => {
  const current = props.comparedItem
  const before = current ? [...baseRows(current), ...effectRows(current)] : []
  const after = [...stats.value, ...effects.value]
  return [...new Map([...before, ...after].map((row) => [row.key, row.label]))].map(([key, label]) => ({
    key, label, before: before.find((row) => row.key === key)?.value ?? '—',
    after: after.find((row) => row.key === key)?.value ?? '—',
  }))
})
const setDetail = computed(() => {
  const id = props.item.setId
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
</script>

<template>
  <div v-if="showHeading" class="item-heading" :class="TIER_META[item.tier].cls">
    <ItemIcon size="full" :item-id="item.id" :glyph="EQUIP_SLOT_META[item.slot].glyph" class="gear-icon" />
    <div>
      <h3 class="font-brush tier-text">{{ item.name }}<small v-if="stars(item.id)"> +{{ stars(item.id) }} 星</small></h3>
      <p class="text-ink3">{{ EQUIP_SLOT_META[item.slot].label }} · {{ TIER_META[item.tier].label }}<template v-if="item.isTrueUnique"> · 全服唯一</template></p>
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
  <p v-if="!showHeading && wearer && item.slot === 'RELIC'" class="text-cinnabar">全队秘宝在主角栏装配。</p>
  <p v-else-if="requirement" :class="meetsRequirement ? 'text-ink2' : 'text-cinnabar'">
    需要{{ requirement.label }}<template v-if="'key' in requirement">（当前 {{ wearerStats[requirement.key] }}）</template>
    <template v-if="!showHeading && !meetsRequirement">，暂不可穿戴。</template>
  </p>
</template>
