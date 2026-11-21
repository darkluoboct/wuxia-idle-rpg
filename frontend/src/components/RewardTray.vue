<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import type { MailAttachments, TierColor } from '@/network/protocol'
import { ITEMS, MEDICINES, SKILLS } from '@/config/gameData'
import { equipmentType, itemBonusRows, medicineType, TIER_META } from '@/config/uiMeta'
import { trialSetOf } from '../../../shared/trialStages.ts'
import { sectEquipmentSetOf } from '../../../shared/sectEquipment.ts'
import ItemPopover from './ItemPopover.vue'
import ItemIcon from './ItemIcon.vue'
import ItemCardHeading from './ItemCardHeading.vue'
import EquipmentValue from './EquipmentValue.vue'

const props = defineProps<{ label: string; source: string; rewards: MailAttachments; skills?: string[] }>()
type Reward = { id: string; name: string; icon: string; type: string; count: number; desc: string; tier?: TierColor; gear?: boolean }
const resources = {
  silver: ['纹银', '货币', '可在市井购买货品，或支付炼丹、淬炼等工本。'],
  ingot: ['元宝', '货币', '可在客栈结缘或购买以元宝标价的货品。'],
  qiExp: ['真气', '修为资源', '可用于参悟武学、经脉冲穴与修行突破。'],
}
const entries = computed(() => {
  const list: Reward[] = []
  for (const id of props.rewards.items ?? []) {
    const gear = ITEMS[id]
    if (gear) list.push({ ...gear, icon: id, type: equipmentType(gear), count: 1, gear: true })
  }
  for (const [id, count] of Object.entries(props.rewards.pills ?? {})) {
    const pill = MEDICINES[id]
    if (pill) list.push({ ...pill, icon: id, type: medicineType(pill), count, desc: pill.effectDesc })
  }
  for (const [id, count] of Object.entries(props.rewards.fragments ?? {})) {
    const skill = SKILLS[id]
    if (skill) list.push({ id: 'fragment-'+id, name: `《${skill.name}》残页`, icon: 'skill-fragment', tier: skill.tier, type: '武学材料 · 残页', count, desc: '参悟同名武学时可抵扣真气。' })
  }
  for (const id of props.skills ?? []) {
    const skill = SKILLS[id]
    if (skill) list.push({ ...skill, icon: 'skill-fragment', type: '武学秘籍', count: 1 })
  }
  for (const id of ['qiExp', 'silver', 'ingot'] as const) {
    const count = props.rewards[id]
    const [name, type, desc] = resources[id]
    if (count) list.push({ id, count, name, icon: id, type, desc })
  }
  return list
})
const selected = ref('')
const anchor = shallowRef<HTMLElement>()
const entry = computed(() => entries.value.find((item) => item.id === selected.value))
const gear = computed(() => entry.value?.gear ? ITEMS[entry.value.id] : undefined)
const stats = computed(() => gear.value ? itemBonusRows(gear.value) : [])
const set = computed(() => {
  const id = gear.value?.setId
  if (!id) return undefined
  const sect = sectEquipmentSetOf(id)
  if (sect) return { name: sect.name, effects: [sect.bonus] }
  const trial = trialSetOf(id)
  if (trial) return { name: trial.name, effects: [trial.bonuses.two, trial.bonuses.four, trial.bonuses.six].flatMap((text, i) => text ? [`${(i + 1) * 2} 件 · ${text}`] : []) }
  return undefined
})
function open(id: string, event: MouseEvent) {
  anchor.value = event.currentTarget as HTMLElement
  selected.value = id
}
function close(restoreFocus = false) {
  if (restoreFocus) anchor.value?.focus({ preventScroll: true })
  selected.value = ''
}
</script>

<template>
  <section v-if="entries.length" class="reward-tray" :aria-label="label">
    <h4 class="sec-title">{{ label }}</h4>
    <div class="reward-slots">
      <button v-for="reward in entries" :key="reward.id" type="button" class="reward-slot"
        :class="reward.tier && TIER_META[reward.tier].cls" :aria-label="reward.name" :title="reward.name"
        :aria-description="`数量 ${reward.count}`" aria-haspopup="dialog" @click="open(reward.id, $event)">
        <ItemIcon :item-id="reward.icon" /><b>×{{ reward.count.toLocaleString() }}</b>
      </button>
    </div>
    <ItemPopover v-if="entry && anchor" :key="entry.id" :anchor="anchor" :aria-label="entry.name"
      :class="entry.tier && TIER_META[entry.tier].cls" @dismiss="close()" @keydown.esc.stop.prevent="close(true)">
      <ItemCardHeading :name="entry.name" :icon="entry.icon" :type="entry.type" :count="entry.count" :tier="entry.tier" @close="close(true)" />
      <div class="reward-body">
        <section v-if="stats.length"><h4>基础属性</h4>
          <dl><div v-for="row in stats" :key="row.key"><dt>{{ row.label }}</dt><dd><EquipmentValue :text="row.value" /></dd></div></dl>
        </section>
        <section v-if="gear?.signatureEffect || gear?.extra"><h4>装备效果</h4>
          <p v-if="gear.signatureEffect"><EquipmentValue :text="gear.signatureEffect" /></p><p v-if="gear.extra"><EquipmentValue :text="gear.extra" /></p>
        </section>
        <section v-if="set"><h4>{{ set.name }}</h4><p v-for="effect in set.effects" :key="effect"><EquipmentValue :text="effect" /></p></section>
        <section><h4>{{ gear ? '说明' : '用途' }}</h4><EquipmentValue v-if="gear" :text="entry.desc" /><p v-else>{{ entry.desc }}</p></section>
      </div>
      <footer class="reward-origin">本次来源 · {{ source }}</footer>
    </ItemPopover>
  </section>
</template>

<style scoped>
.reward-tray { padding-block: .55rem; border-top: 1px solid var(--line); }
.reward-slots { display: flex; align-items: center; flex-wrap: wrap; gap: .45rem; margin-top: .4rem; }
.reward-slot { --item-icon-size: 3.5rem; position: relative; display: grid; }
.reward-slot:hover, .reward-slot:focus-visible { outline: 1px solid var(--gold); }
.reward-slot b { position: absolute; right: 2px; bottom: 2px; background: #171819e8; color: #f9ebd3; padding: 0 .18rem; font-size: .78rem; }
.reward-body { min-height: 0; overflow: auto; padding: .65rem .85rem; color: var(--ink-2); font-size: .9rem; }
.reward-body section + section { margin-top: .55rem; }.reward-body h4 { color: var(--gold); }
.reward-body dl div { display: flex; gap: 1rem; }
.reward-origin { flex: none; padding: .65rem .85rem; background: var(--bg-2); color: var(--ink-3); font-size: .8rem; border-top: 1px solid var(--line); }
</style>
