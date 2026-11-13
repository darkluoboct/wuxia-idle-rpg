<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { SKILLS } from '@/config/gameData'
import { apiClient, ApiError } from '@/network/apiClient'
import type { LibraryStatusDTO } from '@/network/protocol'
import { useGameStore } from '@/stores/gameStore'
import { QUANZHEN_LIBRARY } from '../../../shared/quanzhen.ts'

const store = useGameStore()
const status = ref<LibraryStatusDTO>()
const error = ref('')
const loading = ref(false)
const opened = ref(false)
const isQuanzhen = computed(() => store.player.currentSectId === 'quanzhen')
const maySteal = computed(() => !store.player.currentSectId || store.player.currentSectId === 'baituo')
const here = computed(() => store.player.currentMapId === QUANZHEN_LIBRARY.mapId && !store.player.mapJourney)
const missingSkills = computed(() => QUANZHEN_LIBRARY.skills.filter((id) => !store.learnedSkills[id]))
const busy = computed(() => store.onlineActionBusy || store.isBattlePlaying)
const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
let request = 0

async function reload() {
  const id = ++request
  loading.value = true
  error.value = ''
  try {
    const result = await apiClient.request<LibraryStatusDTO>('GET', '/sect/library')
    if (id === request) status.value = result
  } catch (e) {
    if (id === request) error.value = e instanceof ApiError ? e.message : '藏经阁暂时连不上'
  } finally {
    if (id === request) loading.value = false
  }
}

watch(() => [opened.value, store.onlineRevision], () => { if (opened.value) void reload() })
onScopeDispose(() => { request++ })

function steal(skillId: string) {
  store.askConfirm({
    title: `潜入藏经阁偷学《${SKILLS[skillId].name}》`,
    body: `胜出可习得该武功。败给值守者时，你将失去 ${QUANZHEN_LIBRARY.guardSilver.toLocaleString()} 两纹银。`,
    confirmText: '潜入藏经阁', tone: 'danger',
    onConfirm: () => store.libraryAction({ action: 'steal', skillId }),
  })
}
</script>

<template>
  <details class="well shrink-0 p-3" :open="opened" @toggle="opened = ($event.currentTarget as HTMLDetailsElement).open">
    <summary class="cursor-pointer font-brush text-xl">全真藏经阁</summary>
    <div class="mt-2 max-h-[32vh] space-y-2 overflow-y-auto">
      <div v-if="isQuanzhen || maySteal" class="flex flex-wrap items-center gap-2">
        <button v-if="!here && store.player.currentMapId !== QUANZHEN_LIBRARY.mapId" class="btn btn-sm" :disabled="busy || !!store.player.mapJourney"
          @click="store.travelTo(QUANZHEN_LIBRARY.mapId)">前往终南后山</button>
        <template v-if="isQuanzhen">
          <span class="hint">{{ store.player.isGuardingLibrary ? '值守中，离线后仍可迎战。' : '登记当前配装，离线时也会拦截潜入者。' }}</span>
          <button v-if="here" class="btn btn-sm btn-gold" :disabled="busy"
            @click="store.libraryAction({ action: 'guard', enabled: true })">{{ store.player.isGuardingLibrary ? '更新防守阵容' : '登记值守' }}</button>
          <button v-if="store.player.isGuardingLibrary" class="btn btn-sm" :disabled="busy"
            @click="store.libraryAction({ action: 'guard', enabled: false })">结束值守</button>
        </template>
        <template v-else>
          <span v-if="!missingSkills.length" class="hint">已习得阁中两门武学。</span>
          <template v-else>
            <span v-if="status && !status.guardAvailable" class="hint">目前无人值守。</span>
            <button v-for="id in missingSkills" :key="id" class="btn btn-sm btn-gold" :disabled="busy || !here || !status?.guardAvailable || store.player.silver < QUANZHEN_LIBRARY.guardSilver"
              @click="steal(id)">偷学《{{ SKILLS[id].name }}》</button>
            <span class="hint">潜入需备 {{ QUANZHEN_LIBRARY.guardSilver.toLocaleString() }} 两，败后由值守者缴获。</span>
          </template>
        </template>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <h4 class="text-sm font-semibold">护山战报</h4>
        <button class="btn btn-sm" :disabled="loading" @click="reload">刷新战报</button>
      </div>
      <p v-if="error" class="text-sm text-cinnabar" role="status">{{ error }}</p>
      <p v-else-if="!status?.reports.length" class="hint" role="status">{{ loading ? '正在读取战报' : '暂无护山战报。' }}</p>
      <ul v-else class="space-y-1.5">
        <li v-for="report in status.reports" :key="report.battleId" class="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-1.5 text-xs">
          <span class="chip" :class="report.won ? 'chip-jade' : 'chip-red'">{{ report.won ? '击退' : '失守' }}</span>
          <b>{{ report.intruder }}</b>
          <span class="hint">{{ date.format(report.occurredAt) }}</span>
          <span v-if="report.won" class="text-gold">纹银 +{{ report.silver.toLocaleString() }} · 贡献 +{{ report.sectContrib }}</span>
          <button class="btn btn-sm" :disabled="busy" @click="store.readLibraryReport(report.battleId)">查看战报</button>
        </li>
      </ul>
    </div>
  </details>
</template>
