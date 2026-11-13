<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { apiClient, ApiError } from '@/network/apiClient'
import { MAPS, SECTS } from '@/config/gameData'
import { useGameStore } from '@/stores/gameStore'
import type { BountyBoardDTO } from '@/network/protocol'

const store = useGameStore()
const board = ref<BountyBoardDTO>()
const loading = ref(false)
const error = ref('')
const entries = computed(() => [...(board.value?.entries ?? [])].sort((a, b) =>
  Number(b.accepted) - Number(a.accepted) || Number(b.targetId === store.bountyTargetId) - Number(a.targetId === store.bountyTargetId)))
const nearbyTargetWanted = computed(() => store.nearbyPlayers.some((player) =>
  player.id === store.player.bountyAccepted?.targetId && player.isBetrayerBounty) && store.roomMapId === store.player.currentMapId)
const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
let request = 0

async function reload() {
  const id = ++request
  loading.value = true
  error.value = ''
  try {
    const result = await apiClient.request<BountyBoardDTO>('GET', '/bounties')
    if (request === id) board.value = result
  } catch (e) {
    if (request === id) error.value = e instanceof ApiError ? e.message : '悬赏榜暂时读不到'
  } finally {
    if (request === id) loading.value = false
  }
}

watch(() => [store.onlineRevision, store.roomConnected, store.bountyTargetId, nearbyTargetWanted.value], reload, { immediate: true })
onScopeDispose(() => { request++ })
</script>

<template>
  <section class="view-scroll -mr-1 space-y-3 pr-1" aria-label="江湖悬赏榜">
    <header class="well flex flex-wrap items-center justify-between gap-2 p-3">
      <p v-if="store.player.bountyUntil && store.player.bountyUntil > store.worldTime" class="text-sm text-cinnabar">
        你正被通缉，至 {{ date.format(store.player.bountyUntil) }}（北京时间）
      </p>
      <p v-else class="hint">接令后可查到目标所在地图。双方同图在线时可追捕。</p>
      <button class="btn btn-sm" :disabled="loading" @click="reload">刷新悬赏</button>
    </header>
    <p v-if="error" class="well p-3 text-sm text-cinnabar" role="status">{{ error }}</p>
    <p v-else-if="!entries.length" class="well p-3 text-sm text-ink3" role="status">{{ loading ? '正在查看悬赏' : '暂无有效通缉令。' }}</p>

    <article v-for="entry in entries" :key="`${entry.targetId}-${entry.expiresAt}`" class="well space-y-2 p-3"
      :class="entry.targetId === store.bountyTargetId ? '!border-gold' : ''">
      <div class="flex flex-wrap items-center gap-2">
        <h4 class="font-brush text-xl">{{ entry.nickname }}</h4>
        <span class="chip chip-red">{{ SECTS.find((sect) => sect.id === entry.sectId)?.name ?? '师门' }}通缉</span>
        <span v-if="entry.accepted" class="chip chip-jade">已接令</span>
      </div>
      <p class="hint">至 {{ date.format(entry.expiresAt) }}（北京时间）</p>
      <p class="text-sm text-gold">赏金 {{ entry.silver.toLocaleString() }} 两<span v-if="entry.sectContrib"> · 门派贡献 +{{ entry.sectContrib.toLocaleString() }}</span></p>
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="entry.accepted" class="hint">
          {{ entry.mapId ? MAPS.find((map) => map.id === entry.mapId)?.name ?? entry.mapId : '目标暂未在线' }}
        </span>
        <span v-if="entry.expiresAt <= store.worldTime" class="hint">通缉令已过期</span>
        <button v-else-if="!entry.accepted" class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy"
          @click="store.acceptBounty(entry)">接令</button>
        <button v-else class="btn btn-sm btn-danger" :disabled="store.onlineActionBusy || store.isBattlePlaying || !store.roomConnected || !nearbyTargetWanted ||
          !!store.player.mapJourney || entry.mapId !== store.player.currentMapId" @click="store.pursueBounty(entry)">追捕</button>
      </div>
    </article>
  </section>
</template>
