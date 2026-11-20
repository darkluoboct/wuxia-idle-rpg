<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '@/stores/gameStore'
import EquipmentPanel from '@/components/EquipmentPanel.vue'
import ArsenalSkills from '@/components/ArsenalSkills.vue'
import ArsenalCompanions from '@/components/ArsenalCompanions.vue'
import ArsenalMeridians from '@/components/ArsenalMeridians.vue'

const store = useGameStore()
const { arsenalTab: sub } = storeToRefs(store)

const skillFromBag = ref<string>()

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
        <span v-if="sub === 'SKILLS' || sub === 'MERIDIAN'" class="text-xs tabular-nums text-jade font-brush">现有真气 {{ store.player.qiExp.toLocaleString() }}</span>
      </div>

      <KeepAlive>
        <ArsenalSkills v-if="sub === 'SKILLS'" :from-bag="skillFromBag" @back-to-bag="selectSub('BAG')" />
        <EquipmentPanel v-else-if="sub === 'EQUIP' || sub === 'BAG'" @skill="openBagSkill" />
        <ArsenalCompanions v-else-if="sub === 'SQUAD'" />
        <ArsenalMeridians v-else-if="sub === 'MERIDIAN'" />
      </KeepAlive>
    </section>
  </div>
</template>
