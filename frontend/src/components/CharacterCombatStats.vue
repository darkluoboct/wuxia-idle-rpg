<script setup lang="ts">
import { computed } from 'vue'
import { Droplet, Flame, Footprints, Heart, Shield, Sparkles, Swords, Wind } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import type { DerivedStatsDTO } from '@/network/protocol'

const store = useGameStore()
const props = defineProps<{ stats?: DerivedStatsDTO }>()
const combatStats = computed(() => {
  const d = props.stats ?? store.derivedStats
  return [
    { label: '气血', value: d.maxHp, icon: Heart },
    { label: '内力', value: d.maxMp, icon: Droplet },
    { label: '攻击', value: d.atk, icon: Swords },
    { label: '防御', value: d.def, icon: Shield },
    { label: '暴击率', value: `${d.crit}%`, icon: Sparkles },
    { label: '闪避率', value: `${d.dodge}%`, icon: Footprints },
    { label: '速度', value: d.speed, icon: Wind },
    ...(!props.stats ? [{ label: '煞气', value: store.player.shaQi, icon: Flame }] : []),
  ]
})
</script>

<template>
  <dl class="combat-stats">
    <div v-for="stat in combatStats" :key="stat.label">
      <dt><component :is="stat.icon" aria-hidden="true" />{{ stat.label }}</dt>
      <dd>{{ stat.value.toLocaleString() }}</dd>
    </div>
  </dl>
</template>
