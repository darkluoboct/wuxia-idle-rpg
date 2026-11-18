<script setup lang="ts">
import { computed } from 'vue'
import { Lock, X } from 'lucide-vue-next'
import { MAPS, ONLINE_MAPS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { useGameStore } from '@/stores/gameStore'
import type { MapZoneConfig } from '../../../shared/gameData.ts'

/** 江湖地图（弹出）：九州方位的罗盘与城镇要地，点哪里就动身去哪里 */
const store = useGameStore()

type Dir = '北' | '西' | '东' | '南' | '西北' | '东北' | '东南'
const COMPASS: { id: string; dir: Dir; cls: string }[] = [
  { id: 'huashan_peak', dir: '西北', cls: 'col-start-1 row-start-1' },
  { id: 'zhongnan_forest', dir: '北', cls: 'col-start-2 row-start-1' },
  { id: 'guiyun_lake', dir: '东北', cls: 'col-start-3 row-start-1' },
  { id: 'damo_caravan', dir: '西', cls: 'col-start-1 row-start-2' },
  { id: 'jiaxing_suburb', dir: '东', cls: 'col-start-3 row-start-2' },
  { id: 'heizhao_swamp', dir: '南', cls: 'col-start-2 row-start-3' },
  { id: 'taohua_isle', dir: '东南', cls: 'col-start-3 row-start-3' },
]
const all = computed(() => IS_MOCK_MODE ? MAPS : ONLINE_MAPS)
const view = (map: MapZoneConfig) => {
  const locked = !store.canTravelTo(map)
  const here = store.player.currentMapId === map.id
  return {
    map, locked, here,
    name: map.name.replace(/（.*?）/, ''),
    hint: locked ? (IS_MOCK_MODE ? map.unlockHint : map.onlineUnlockHint) ?? '尚未开放' : '',
    seconds: locked || here ? 0 : Math.max(0, Math.ceil(store.mapTravelTime(map.id))),
  }
}
const compass = computed(() => COMPASS.flatMap((spot) => {
  const map = all.value.find(({ id }) => id === spot.id)
  return map ? [{ ...spot, ...view(map) }] : []
}))
const towns = computed(() => all.value.filter(({ id }) => !COMPASS.some((spot) => spot.id === id)).map(view))
const busy = computed(() => store.onlineActionBusy || !!store.journeyMap)

function go(entry: ReturnType<typeof view>) {
  if (entry.locked || entry.here || busy.value) return
  store.mapPickerOpen = false
  void store.travelTo(entry.map.id)
}
const close = () => { store.mapPickerOpen = false }
const vFocus = { mounted: (el: HTMLElement) => el.focus() }
</script>

<template>
  <div class="fixed inset-0 z-[65] flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px]" @click.self="close">
    <article class="panel anim-modal map-dialog" role="dialog" aria-modal="true" aria-labelledby="map-dialog-title" @keydown.esc="close">
      <header class="flex items-center gap-2">
        <span class="seal h-7 w-7 shrink-0 text-base">图</span>
        <h4 id="map-dialog-title" class="font-brush text-2xl leading-tight text-gold">江湖地图</h4>
        <span class="truncate text-sm text-ink3">现在在「{{ store.currentMap.name }}」</span>
        <button v-focus class="wuxia-icon ml-auto" aria-label="关上地图" @click="close"><X /></button>
      </header>
      <p v-if="store.journeyMap" class="text-sm text-gold">正在前往「{{ store.journeyMap.name }}」，抵达后才能再动身。</p>

      <section aria-label="九州方位">
        <h5 class="map-dialog-heading">九州方位</h5>
        <div class="relative grid grid-cols-3 grid-rows-3 gap-2">
          <svg viewBox="0 0 3 3" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <path d="M1.5,0.45 V2.55 M0.45,1.5 H2.55" stroke="var(--gold)" stroke-opacity="0.45" stroke-width="0.012" stroke-dasharray="0.04 0.05" fill="none" />
          </svg>
          <button
            v-for="spot in compass" :key="spot.map.id" class="map-spot" :class="[spot.cls, { 'is-here': spot.here, 'is-locked': spot.locked }]"
            :disabled="spot.locked || spot.here || busy" :title="spot.hint || spot.map.ambientDesc"
            :aria-label="`${spot.dir}·${spot.name}${spot.here ? '（所在）' : spot.locked ? `（未开放：${spot.hint}）` : `，路程约 ${spot.seconds} 秒`}`"
            @click="go(spot)"
          >
            <span class="map-spot-dir">{{ spot.dir }}</span>
            <span v-if="spot.map.safety === 'CONTESTED'" class="map-spot-war">争</span>
            <b>{{ spot.name }}</b>
            <small>{{ spot.map.baseQiPerHour.toLocaleString() }} 真气/时</small>
            <small v-if="spot.here" class="text-gold">所在</small>
            <small v-else-if="spot.locked" class="flex items-center gap-0.5"><Lock :size="11" aria-hidden="true" />未开放</small>
            <small v-else>路程约 {{ spot.seconds }} 秒</small>
          </button>
          <div class="relative z-10 col-start-2 row-start-2 flex items-center justify-center" aria-hidden="true">
            <div class="relative flex h-16 w-16 items-center justify-center rounded-full border border-gold bg-raised">
              <svg viewBox="0 0 60 60" class="absolute inset-0 h-full w-full">
                <circle cx="30" cy="30" r="26" fill="none" stroke="var(--gold)" stroke-width="0.8" stroke-dasharray="1 3" opacity="0.7" />
                <path d="M30,5 L33,13 L27,13 Z" fill="var(--cinnabar)" />
              </svg>
              <span class="font-brush relative text-sm text-gold">九州</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="towns.length" aria-label="城镇要地">
        <h5 class="map-dialog-heading">城镇要地</h5>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="town in towns" :key="town.map.id" class="map-spot map-town" :class="{ 'is-here': town.here, 'is-locked': town.locked }"
            :disabled="town.locked || town.here || busy" :title="town.hint || town.map.ambientDesc"
            :aria-label="`${town.name}${town.here ? '（所在）' : town.locked ? `（未开放：${town.hint}）` : `，路程约 ${town.seconds} 秒`}`"
            @click="go(town)"
          >
            <span v-if="town.map.safety === 'CONTESTED'" class="map-spot-war">争</span>
            <b>{{ town.name }}</b>
            <small>{{ town.map.volumeLabel }} · {{ town.map.baseQiPerHour.toLocaleString() }} 真气/时</small>
            <small v-if="town.here" class="text-gold">所在</small>
            <small v-else-if="town.locked" class="flex items-center gap-0.5"><Lock :size="11" aria-hidden="true" />{{ town.hint }}</small>
            <small v-else>路程约 {{ town.seconds }} 秒</small>
          </button>
        </div>
      </section>

      <p class="text-xs text-ink3">「争」为纷争区：可劫镖、追捕通缉；其余为和平区，可共修。没开放的地方，悬停看开放条件。</p>
    </article>
  </div>
</template>
