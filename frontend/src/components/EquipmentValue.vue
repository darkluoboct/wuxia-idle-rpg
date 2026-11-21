<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()
const number = /([+＋−－-]?\d+(?:[,，]\d{3})*(?:\.\d+)?(?:[%％]|\s*(?:个百分点|回合|点|层|秒|次|倍|击|件|星|格))?|[零〇一二两三四五六七八九十百千万]+(?:个百分点|回合|点|层|秒|次|倍|击|件|星|格))/g
const parts = computed(() => props.text.split(number))
</script>

<template>
  <template v-for="(part, index) in parts" :key="index"><strong v-if="index % 2" class="equipment-number">{{ part }}</strong><template v-else>{{ part }}</template></template>
</template>

<style scoped>
.equipment-number { color: #08677b; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
:global(.theme-midnight) .equipment-number { color: #83ddeb; }
</style>
