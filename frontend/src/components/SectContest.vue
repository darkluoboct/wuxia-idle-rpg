<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { apiClient, ApiError } from '@/network/apiClient'
import type { SectContestAction, SectContestBoardDTO } from '@/network/protocol'
import { SECT_CHIEF_SALUTE_QI, SECT_CONTEST_MIN_RANK, SECT_SALUTE_QI, sectContestWeek } from '../../../shared/sectProgress.ts'
import { STANCE_META } from '@/config/uiMeta'
import PortraitCard from './PortraitCard.vue'

const props = defineProps<{ sectId: string }>()
const store = useGameStore()
const board = shallowRef<SectContestBoardDTO>()
const loading = ref(false)
const error = ref('')
const knownWeek = computed(() => sectContestWeek(store.onlineTime))
const currentBoard = computed(() => board.value?.weekId === knownWeek.value ? board.value : undefined)
const busy = computed(() => loading.value || store.onlineActionBusy || store.isBattlePlaying)
const eligible = computed(() => store.player.sectRank >= SECT_CONTEST_MIN_RANK)
const chief = computed(() => currentBoard.value?.chief)
const isChief = computed(() => chief.value?.id === store.player.id)
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
let requestId = 0

async function refresh() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await apiClient.request<SectContestBoardDTO>('GET', '/sect/contest')
    if (id === requestId && result.sectId === props.sectId) board.value = result
  } catch (cause) {
    if (id === requestId) error.value = cause instanceof ApiError ? cause.message : '门派周榜暂时无法读取'
  } finally {
    if (id === requestId) loading.value = false
  }
}

function act(action: SectContestAction) {
  return store.onlineSectContest(action, refresh)
}

watch(knownWeek, refresh, { immediate: true })
</script>

<template>
  <section class="well space-y-3 p-3.5" aria-label="门派演武">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 class="font-brush text-xl">门派演武</h4>
        <p v-if="currentBoard" class="hint">{{ time.format(currentBoard.endsAt) }} 结榜 · 北京时间</p>
      </div>
      <button class="btn btn-sm" :disabled="loading" @click="refresh">刷新周榜</button>
    </div>
    <p v-if="error" class="text-sm text-cinnabar" role="alert">{{ error }}</p>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <div v-if="chief" class="flex items-center gap-3">
        <div class="w-20"><PortraitCard bare :name="chief.nickname" style-type="hero_sword" :avatar-id="chief.avatarId" size="sm" /></div>
        <div>
          <p class="text-sm font-semibold text-gold">本门首席大弟子<template v-if="isChief"> · 你</template></p>
          <p class="hint">{{ isChief ? '同门请安时，你会收到真气。你可向传功长老请安。' : `向首席请安时，首席也会收到 ${SECT_CHIEF_SALUTE_QI} 真气。` }}</p>
        </div>
      </div>
      <div v-else-if="currentBoard">
        <p class="text-sm font-semibold text-gold">师门请安</p>
        <p class="hint">每日可向传功长老请安，领取真气与门派贡献。</p>
      </div>
      <p v-else class="hint" role="status">{{ loading ? '正在读取本门首席' : '本门首席待刷新' }}</p>
      <button class="btn btn-sm btn-gold" :disabled="busy || !store.canSaluteSect" @click="store.saluteChiefPlayer(refresh)">
        {{ store.canSaluteSect ? `抱拳问好 · +${SECT_SALUTE_QI.toLocaleString()} 真气` : '今日已请安' }}
      </button>
    </div>

    <details v-if="currentBoard" class="border-t border-line pt-2">
      <summary class="cursor-pointer text-sm font-semibold">本门周榜<template v-if="currentBoard.self"> · 第 {{ currentBoard.self.rank }} 名 · {{ currentBoard.self.rating }} 分</template></summary>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p class="hint">{{ eligible ? '登记当前配装后可挑战同门，离线时由镜像应战。' : '本门三阶及以上弟子可参赛。' }}</p>
        <button v-if="eligible" class="btn btn-sm btn-gold" :disabled="busy"
          @click="act({ action: 'mirror', sectId, weekId: currentBoard.weekId })">
          {{ currentBoard.self ? '更新防守镜像' : '登记防守镜像' }}
        </button>
      </div>
      <p v-if="!currentBoard.leaderboard.length" class="hint mt-2">本届还没有弟子登记。</p>
      <ol v-else class="mt-2 divide-y divide-line">
        <li v-for="entry in currentBoard.leaderboard" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div>
            <b>{{ entry.rank }}. {{ entry.nickname }}</b>
            <p class="hint">{{ STANCE_META[entry.stance].name }} · {{ entry.rating }} 分 · {{ entry.wins }}/{{ entry.matches }} 胜</p>
          </div>
          <button v-if="eligible && entry.id !== store.player.id" class="btn btn-sm"
            :disabled="busy || !currentBoard.self"
            @click="act({ action: 'challenge', sectId, weekId: currentBoard.weekId, targetPlayerId: entry.id })">挑战{{ entry.nickname }}</button>
        </li>
      </ol>
    </details>
  </section>
</template>
