<script setup lang="ts">
import { defineAsyncComponent, nextTick, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '@/stores/gameStore'
import RoleEquipmentPanel from '@/components/RoleEquipmentPanel.vue'
import BackpackPanel from '@/components/BackpackPanel.vue'
import { useEquipmentWearer, type EquipmentPane } from '@/composables/useEquipmentWearer'
import type { EquipSlotType } from '@/network/protocol'
import '@/styles/equipment.css'

const ArsenalSkills = defineAsyncComponent(() => import('@/components/ArsenalSkills.vue'))
const ArsenalCompanions = defineAsyncComponent(() => import('@/components/ArsenalCompanions.vue'))
const ArsenalMeridians = defineAsyncComponent(() => import('@/components/ArsenalMeridians.vue'))

defineProps<{ mailItem?: string }>()
const emit = defineEmits<{ backToMail: [] }>()
const store = useGameStore()
const { arsenalTab: sub } = storeToRefs(store)

const skillFromBag = ref<string>()
const wearer = useEquipmentWearer()
const rolePanel = ref<InstanceType<typeof RoleEquipmentPanel>>()
const pane = ref<EquipmentPane | null>(null)
const slotRequest = shallowRef<{ slot: EquipSlotType } | null>(null)

function selectWearer(id: string | null) {
  wearer.companionId.value = id
  pane.value = null
  slotRequest.value = null
}
watch(wearer.companionId, (id) => { if (id === null) { pane.value = null; slotRequest.value = null } }, { flush: 'sync' })

function changeEquipment(slot: EquipSlotType) {
  slotRequest.value = { slot }
  sub.value = 'BAG'
}

async function returnToRole(next: EquipmentPane | null = slotRequest.value?.slot ?? null) {
  slotRequest.value = null
  pane.value = next
  sub.value = 'EQUIP'
  await nextTick()
  rolePanel.value?.focusDetail()
}

function openPreparation() {
  selectWearer(null)
  void returnToRole('PREPARE')
}

function selectSub(tab: typeof sub.value) {
  skillFromBag.value = undefined
  sub.value = tab
}

function openBagSkill(id: string) {
  skillFromBag.value = id
  sub.value = 'SKILLS'
}
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist" aria-label="武库栏目">
          <button class="tab" role="tab" :aria-selected="sub === 'EQUIP'" @click="selectSub('EQUIP')">角色</button>
          <button class="tab" role="tab" :aria-selected="sub === 'SKILLS'" @click="selectSub('SKILLS')">武学</button>
          <button class="tab" role="tab" :aria-selected="sub === 'BAG'" @click="selectSub('BAG')">背包</button>
          <button v-if="store.arsenalTabOpen('SQUAD')" class="tab" role="tab" :aria-selected="sub === 'SQUAD'" @click="selectSub('SQUAD')">伙伴</button>
          <button class="tab" role="tab" :aria-selected="sub === 'MERIDIAN'" @click="selectSub('MERIDIAN')">经脉冲穴</button>
        </div>
        <button v-if="sub === 'BAG' && mailItem" class="btn btn-sm" @click="emit('backToMail')">返回来信</button>
        <span v-if="sub === 'SKILLS' || sub === 'MERIDIAN'" class="text-xs tabular-nums text-jade font-brush">现有真气 {{ store.player.qiExp.toLocaleString() }}</span>
      </div>

      <KeepAlive>
        <ArsenalSkills v-if="sub === 'SKILLS'" :from-bag="skillFromBag" @back-to-bag="selectSub('BAG')" />
        <RoleEquipmentPanel v-else-if="sub === 'EQUIP'" ref="rolePanel" v-model:pane="pane" :context="wearer"
          @change-equipment="changeEquipment" @select-wearer="selectWearer" />
        <BackpackPanel v-else-if="sub === 'BAG'" :context="wearer" :slot-request="slotRequest" :initial-item="mailItem"
          @skill="openBagSkill" @back-to-role="returnToRole()" @prepare="openPreparation" @select-wearer="selectWearer" />
        <ArsenalCompanions v-else-if="sub === 'SQUAD'" />
        <ArsenalMeridians v-else-if="sub === 'MERIDIAN'" />
      </KeepAlive>
    </section>
  </div>
</template>
