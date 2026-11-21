<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { getMapHerbs, MAPS, ONLINE_MAPS } from '@/config/gameData'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { FORAGE_QI_COST } from '../../../shared/alchemy.ts'
import ItemIcon from './ItemIcon.vue'
import SceneBackdrop from './SceneBackdrop.vue'

const store = useGameStore()
const regions = (IS_MOCK_MODE ? MAPS : ONLINE_MAPS).map((map) => ({ map, herbs: getMapHerbs(map.id) }))
const selection = ref<string>()
const selected = computed(() => regions.find(({ map }) => map.id === (selection.value ?? store.player.currentMapId)) ?? regions[0])
const here = computed(() => selected.value.map.id === store.player.currentMapId)
const busy = computed(() => store.onlineActionBusy || !!store.player.mapJourney)
const escort = computed(() => store.player.escortDart)
const canEscort = computed(() => !IS_MOCK_MODE && here.value && selected.value.map.safety === 'CONTESTED' && store.featureOpen('HUASHAN'))
const weather = computed(() => {
  const { storm, rain, night, water } = store.mapEnvironment(selected.value.map.id)
  return [storm ? '风暴' : rain ? '有雨' : '晴', night && '黑夜', water && '水战'].filter(Boolean).join(' · ')
})
</script>

<template>
  <section class="workbench-detail min-h-0 flex-1" aria-label="区域情报">
    <div class="workbench-scroll">
      <header class="relative isolate mb-4 min-h-29 overflow-hidden rounded border border-line p-3 text-[#f0e9dc] sm:px-5">
        <SceneBackdrop :map-id="selected.map.id" :shichen-idx="store.shichenIdx" class="-z-10" />
        <div class="absolute inset-0 -z-10 bg-gradient-to-r from-neutral-950/90 via-neutral-950/65 to-neutral-950/25" />
        <p class="text-xs text-[#e4c995]">{{ selected.map.volumeLabel }} · {{ weather }}</p>
        <h3 class="my-1 font-brush text-2xl">{{ selected.map.name }}</h3>
        <p class="max-w-[60ch] text-sm">{{ selected.map.ambientDesc }}</p>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead class="border-b border-linestrong text-xs text-ink2">
            <tr>
              <th scope="col" class="p-2">区域</th>
              <th scope="col" class="p-2">安危</th>
              <th scope="col" class="p-2">基础真气 / 时</th>
              <th scope="col" class="p-2">本地产药 · 药篓存量</th>
              <th scope="col" class="p-2">赶路</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="{ map, herbs } in regions" :key="map.id" :class="selected.map.id === map.id ? 'bg-[var(--gold-soft)]' : 'hover:bg-[var(--gold-faint)]'">
              <th scope="row" class="p-2">
                <button class="text-left font-bold hover:text-gold" :aria-pressed="selected.map.id === map.id" @click="selection = map.id">
                  {{ map.name }}
                </button>
              </th>
              <td class="whitespace-nowrap p-2"><span class="chip" :class="map.safety === 'PEACE' ? 'chip-jade' : 'chip-red'">
                {{ map.safety === 'PEACE' ? '和平' : '纷争' }}
              </span></td>
              <td class="p-2 tabular-nums">{{ map.baseQiPerHour.toLocaleString() }}</td>
              <td class="p-2">
                <ul v-if="herbs.length" class="flex flex-wrap gap-x-3 gap-y-1">
                  <li v-for="herb in herbs" :key="herb.id" class="flex items-center gap-1 text-xs">
                    <ItemIcon :item-id="herb.id" class="[--item-icon-size:1.25rem]" />
                    {{ herb.name }} <b class="tabular-nums">{{ store.herbInventory[herb.id] ?? 0 }}</b>
                  </li>
                </ul>
                <span v-else class="text-xs text-ink3">无产药记录</span>
              </td>
              <td class="p-2 text-xs">
                <span v-if="map.id === store.player.currentMapId" class="text-jade">你在这里</span>
                <span v-else-if="!store.canTravelTo(map)" class="text-ink3" :title="IS_MOCK_MODE ? map.unlockHint : map.onlineUnlockHint">未开放</span>
                <span v-else class="tabular-nums">{{ store.mapTravelTime(map.id).toFixed(1) }} 秒</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <footer class="workbench-actions">
      <span class="mr-auto text-sm font-bold">{{ selected.map.name }}
        <small v-if="here" class="ml-1 font-normal text-jade">当前驻地</small>
      </span>
      <template v-if="here">
        <span v-if="IS_MOCK_MODE" class="text-xs text-ink2">{{ selected.map.onlineCount }} 人在线</span>
        <span v-else-if="store.roomConnected && store.roomMapId === selected.map.id" class="text-xs text-ink2">{{ store.roomCount }} 人在线</span>
        <template v-if="canEscort">
          <template v-if="escort?.mapId === selected.map.id">
            <span class="text-xs text-ink2">{{ escort.robbed ? '镖银已遭劫' : store.onlineTime >= escort.endsAt ? '镖车已抵达' : '押镖中' }} · {{ escort.silver.toLocaleString() }} 两</span>
            <button class="btn btn-sm btn-gold" :disabled="busy || store.onlineTime < escort.endsAt" @click="store.escortAction('claim')">交镖</button>
          </template>
          <button v-else-if="!escort" class="btn btn-sm btn-gold" title="接镖后 15 分钟可交镖，镖银 4,800 两" :disabled="busy" @click="store.escortAction('start')">接镖</button>
          <span v-else class="text-xs text-ink3">请回接镖地点结算。</span>
        </template>
        <button v-if="selected.herbs.length" class="btn btn-sm btn-gold" :disabled="busy || store.player.qiExp < FORAGE_QI_COST" @click="store.forageHerbs(selected.map.id)">
          采药 · {{ FORAGE_QI_COST }} 真气
        </button>
      </template>
      <span v-else-if="!store.canTravelTo(selected.map)" class="text-xs text-ink3">{{ (IS_MOCK_MODE ? selected.map.unlockHint : selected.map.onlineUnlockHint) ?? '请先推进主线' }}</span>
      <button v-else class="btn btn-sm btn-seal" :disabled="busy" @click="store.travelTo(selected.map.id)">出发 · {{ store.mapTravelTime(selected.map.id).toFixed(1) }} 秒</button>
    </footer>
  </section>
</template>
