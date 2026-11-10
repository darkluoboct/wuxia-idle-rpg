<script setup lang="ts">
import { ChevronDown, ChevronLeft, ChevronRight, MapPin } from 'lucide-vue-next'
import { MAPS } from '@/config/gameData'
import { MAP_MOOD_LABEL } from '@/config/uiMeta'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import SceneBackdrop from '@/components/SceneBackdrop.vue'
import StageHeaderArena from '@/components/StageHeaderArena.vue'
import CultivateConsole from '@/components/CultivateConsole.vue'

const store = useGameStore()

const signs: Record<string, string> = {
  jiaxing_suburb: '嘉兴南湖', zhongnan_forest: '终南后山', damo_caravan: '大漠商道', heizhao_swamp: '湘西黑沼',
}

function stepMap(direction: number) {
  const current = MAPS.findIndex((map) => map.id === store.currentMap.id)
  store.moveMap(MAPS[(current + direction + MAPS.length) % MAPS.length].id)
}
</script>

<template>
  <StageHeaderArena v-if="store.activeBattle" />

  <div v-else class="scenic-stage">
    <SceneBackdrop :map-id="store.currentMap.id" :shichen-idx="store.shichenIdx" priority />
    <div class="scenic-shade" aria-hidden="true" />

    <div class="map-heading">
      <div class="map-picker">
        <button aria-label="上一张地图" :disabled="store.onlineActionBusy" @click="stepMap(-1)"><ChevronLeft /></button>
        <div class="map-plaque" :title="store.currentMap.ambientDesc">
          <select
            class="font-brush" aria-label="选择地图" :value="store.currentMap.id" :disabled="store.onlineActionBusy"
            @change="store.moveMap(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="map in MAPS" :key="map.id" :value="map.id">{{ map.name.replace(/（.*?）/, '') }}</option>
          </select>
          <ChevronDown aria-hidden="true" />
        </div>
        <button aria-label="下一张地图" :disabled="store.onlineActionBusy" @click="stepMap(1)"><ChevronRight /></button>
      </div>
      <div class="map-weather" :title="MAP_MOOD_LABEL[store.currentMap.id]">
        <MapPin :size="13" aria-hidden="true" />
        <span>{{ store.currentMap.volumeLabel }}</span>
        <span>· {{ store.shichenLabel.split('·')[0] }}</span>
        <span :class="store.currentMap.safety === 'PEACE' ? 'is-peace' : 'is-contested'">
          {{ store.currentMap.safety === 'PEACE' ? '和平区' : IS_MOCK_MODE ? '可劫镖' : '纷争区' }}
        </span>
      </div>
    </div>

    <div class="scenic-banner font-brush" aria-hidden="true">{{ signs[store.currentMap.id] }}<i>江湖</i></div>

    <CultivateConsole />
  </div>
</template>
