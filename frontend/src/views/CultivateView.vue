<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { ChevronDown, ChevronLeft, ChevronRight, MapPin } from 'lucide-vue-next'
import { MAPS, ONLINE_MAPS } from '@/config/gameData'
import { MAP_MOOD_LABEL } from '@/config/uiMeta'
import { useGameStore } from '@/stores/gameStore'
import { apiClient, IS_MOCK_MODE } from '@/network/apiClient'
import type { ChapterOneStatueDTO } from '@/network/protocol'
import { CHAPTER_ONE_STATUE_MAP, CHAPTER_ONE_TITLE } from '../../../shared/trialStages.ts'
import SceneBackdrop from '@/components/SceneBackdrop.vue'
import StageHeaderArena from '@/components/StageHeaderArena.vue'
import CultivateConsole from '@/components/CultivateConsole.vue'
import PortraitCard from '@/components/PortraitCard.vue'

const store = useGameStore()
const maps = computed(() => (IS_MOCK_MODE ? MAPS : ONLINE_MAPS).filter(store.canTravelTo))
const atStatue = computed(() => store.currentMap.id === CHAPTER_ONE_STATUE_MAP && !store.activeBattle)
const statue = shallowRef<Pick<ChapterOneStatueDTO, 'nickname' | 'avatarId'> | null>()
const statueError = shallowRef(false)
watch([atStatue, () => store.player.chapterOneChampion], async ([visible], _old, onCleanup) => {
  if (!visible) return
  statueError.value = false
  if (IS_MOCK_MODE) {
    statue.value = store.player.chapterOneChampion ? store.player : null
    return
  }
  statue.value = undefined
  let current = true
  onCleanup(() => { current = false })
  try {
    const result = await apiClient.request<{ statue: ChapterOneStatueDTO | null }>('GET', '/trial/champion')
    if (current) statue.value = result.statue
  } catch {
    if (current) statueError.value = true
  }
}, { immediate: true })

const signs: Record<string, string> = {
  jiaxing_suburb: '嘉兴南湖', zhongnan_forest: '终南后山', damo_caravan: '大漠商道', heizhao_swamp: '湘西黑沼',
}

function stepMap(direction: number) {
  const current = maps.value.findIndex((map) => map.id === store.currentMap.id)
  store.travelTo(maps.value[(current + direction + maps.value.length) % maps.value.length].id)
}

function selectMap(event: Event) {
  const select = event.target as HTMLSelectElement
  const mapId = select.value
  select.value = store.currentMap.id
  store.travelTo(mapId)
}
</script>

<template>
  <StageHeaderArena v-if="store.activeBattle" />

  <div v-else class="scenic-stage">
    <SceneBackdrop :map-id="store.currentMap.id" :shichen-idx="store.shichenIdx" priority />
    <div class="scenic-shade" aria-hidden="true" />

    <div class="map-heading">
      <div class="map-picker">
        <button aria-label="上一张地图" :disabled="store.onlineActionBusy || !!store.journeyMap" @click="stepMap(-1)"><ChevronLeft /></button>
        <div class="map-plaque" :title="store.currentMap.ambientDesc">
          <select
            class="font-brush" aria-label="选择地图" :value="store.currentMap.id" :disabled="store.onlineActionBusy || !!store.journeyMap"
            @change="selectMap"
          >
            <option v-for="map in maps" :key="map.id" :value="map.id">{{ map.name.replace(/（.*?）/, '') }}</option>
          </select>
          <ChevronDown aria-hidden="true" />
        </div>
        <button aria-label="下一张地图" :disabled="store.onlineActionBusy || !!store.journeyMap" @click="stepMap(1)"><ChevronRight /></button>
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

    <div class="scenic-banner font-brush" aria-hidden="true">{{ signs[store.currentMap.id] ?? store.currentMap.name }}<i>江湖</i></div>

    <section v-if="atStatue" class="well relative mx-auto max-w-sm p-3" aria-label="襄阳天下第一雕像">
      <PortraitCard v-if="statue" bare :name="statue.nickname" :subtitle="CHAPTER_ONE_TITLE" style-type="hero_sword" :avatar-id="statue.avatarId" />
      <p v-else class="hint">{{ statueError ? '暂时无法读取立像记录。' : statue === null ? '石台空着，等待首位战胜华山之巅的侠客。' : '正在查看立像记录。' }}</p>
    </section>
    <CultivateConsole />
  </div>
</template>
