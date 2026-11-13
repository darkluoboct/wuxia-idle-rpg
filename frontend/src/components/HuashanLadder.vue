<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { apiClient, ApiError } from '@/network/apiClient'
import type { HuashanAction, HuashanBoardDTO } from '@/network/protocol'
import { huashanDivision, huashanRankReward, HUASHAN_RESPECT_QI } from '../../../shared/huashan.ts'
import { SECTS } from '@/config/gameData'
import { STANCE_META } from '@/config/uiMeta'
import PortraitCard from './PortraitCard.vue'

const store = useGameStore()
const board = shallowRef<HuashanBoardDTO>()
const busy = ref(false)
const error = ref('')
const honor = ref<Record<number, string>>({})
const suffix = ref('')
const inscription = ref('')
const ownGreat = computed(() => board.value?.fiveGreats.find((entry) => entry.id === store.player.id && entry.honor))
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

async function refresh() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    board.value = await apiClient.request<HuashanBoardDTO>('GET', '/huashan')
    suffix.value = ownGreat.value?.suffix ?? ''
    inscription.value = ownGreat.value?.inscription ?? ''
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '群豪榜暂时无法读取'
  } finally {
    busy.value = false
  }
}

function act(action: HuashanAction) {
  return store.onlineHuashan(action, () => { void refresh() })
}

function claim(award: HuashanBoardDTO['awards'][number]) {
  return act({ action: 'claim', seasonId: award.seasonId, honor: honor.value[award.seasonId] || undefined })
}

onMounted(refresh)
</script>

<template>
  <div class="view-scroll -mr-1 space-y-3 pr-1">
    <p v-if="error" class="hint text-cinnabar" role="alert">{{ error }}</p>
    <section v-if="board" class="well space-y-2 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="font-brush text-lg">第 {{ board.seasonId + 1 }} 届华山论剑</h3>
          <p class="hint">于 {{ time.format(board.endsAt) }} 结算 · 北京时间</p>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm" :disabled="busy" @click="refresh">刷新</button>
          <button class="btn btn-sm btn-gold" :disabled="busy || store.onlineActionBusy" @click="act({ action: 'mirror', seasonId: board.seasonId })">
            {{ board.self ? '更新防守镜像' : '登记防守镜像' }}
          </button>
        </div>
      </div>
      <p v-if="board.self" class="text-sm">
        {{ huashanDivision(board.self.rating) }} · 第 {{ board.self.rank }} 名 · {{ board.self.rating }} 分 · {{ board.self.wins }}/{{ board.self.matches }} 胜
      </p>
      <p v-else class="hint">登记当前配装后可挑战其他侠客。离线时由登记的镜像应战。</p>
    </section>

    <button v-else-if="!busy" class="btn btn-sm" @click="refresh">重试</button>
    <p v-else class="hint" role="status">正在读取群豪榜</p>

    <section v-if="board?.awards.length" class="well space-y-2 p-3">
      <h3 class="font-brush text-lg">赛季奖励</h3>
      <div v-for="award in board.awards" :key="award.seasonId" class="flex flex-wrap items-center gap-2 text-sm">
        <span>第 {{ award.seasonId + 1 }} 届第 {{ award.rank }} 名 · {{ huashanRankReward(award.rank).qiExp.toLocaleString() }} 真气 · {{ huashanRankReward(award.rank).silver.toLocaleString() }} 两</span>
        <label v-if="award.availableHonors.length">
          <span class="sr-only">五绝封号</span>
          <select v-model="honor[award.seasonId]" class="field">
            <option value="">自动分配封号</option>
            <option v-for="choice in award.availableHonors" :key="choice">{{ choice }}</option>
          </select>
        </label>
        <button class="btn btn-sm btn-gold" :disabled="busy || store.onlineActionBusy" @click="claim(award)">领取</button>
      </div>
    </section>

    <section v-if="board && board.lastSeason !== null" class="space-y-2" aria-label="天下五绝">
      <h3 class="font-brush text-lg">第 {{ board.lastSeason + 1 }} 届天下五绝</h3>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <article v-for="entry in board.fiveGreats" :key="entry.id" class="well space-y-1 p-2 text-center">
          <PortraitCard :name="entry.nickname" :subtitle="[entry.honor, entry.suffix].filter(Boolean).join(' · ')"
            style-type="hero_sword" :avatar-id="entry.avatarId" size="sm" />
          <p v-if="entry.weaponName" class="hint">{{ entry.weaponName }}</p>
          <p v-if="entry.inscription" class="break-words text-xs">{{ entry.inscription }}</p>
          <button v-if="entry.id !== store.player.id" class="btn btn-sm"
            :disabled="!board.canRespect || busy || store.onlineActionBusy"
            @click="act({ action: 'respect', seasonId: board.lastSeason!, targetPlayerId: entry.id })">
            {{ board.canRespect ? `抱拳论道 · ${HUASHAN_RESPECT_QI} 真气` : '今日已论道' }}
          </button>
        </article>
      </div>
      <form v-if="ownGreat && !board.awards.some((award) => award.seasonId === board?.lastSeason)"
        class="well flex flex-wrap items-end gap-2 p-3"
        @submit.prevent="act({ action: 'inscription', seasonId: board.lastSeason!, suffix, inscription })">
        <label class="text-sm">封号后缀<input v-model="suffix" class="field block" maxlength="12" /></label>
        <label class="text-sm">立绘判词<input v-model="inscription" class="field block" maxlength="60" /></label>
        <button class="btn btn-sm" :disabled="busy || store.onlineActionBusy">保存判词</button>
      </form>
    </section>

    <section v-if="board" class="well space-y-2 p-3">
      <h3 class="font-brush text-lg">镜像挑战</h3>
      <p v-if="!board.opponents.length" class="hint">本届还没有其他已登记的镜像。</p>
      <ul v-else class="divide-y divide-ink3/20">
        <li v-for="entry in board.opponents" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 py-2">
          <div class="space-y-1">
            <div class="text-sm">第 {{ entry.rank }} 名 · {{ entry.nickname }} · {{ entry.rating }} 分</div>
            <p class="hint">{{ SECTS.find((sect) => sect.id === entry.sectId)?.name ?? '逍遥散人' }} · {{ STANCE_META[entry.stance].name }}
              <span v-if="entry.companions.length"> · {{ entry.companions.join('、') }}</span>
            </p>
          </div>
          <button class="btn btn-sm btn-danger" :disabled="!board.self || busy || store.onlineActionBusy || store.isBattlePlaying"
            @click="act({ action: 'challenge', seasonId: board.seasonId, targetPlayerId: entry.id })">挑战{{ entry.nickname }}</button>
        </li>
      </ul>
    </section>

    <details v-if="board?.leaderboard.length" class="well space-y-2 p-3">
      <summary class="cursor-pointer font-brush text-lg">华山绝巅 · 群豪榜</summary>
      <ol class="space-y-1 text-sm">
        <li v-for="entry in board.leaderboard" :key="entry.id" class="flex justify-between gap-2">
          <span>{{ entry.rank }}. {{ entry.nickname }}</span><span class="tabular-nums">{{ entry.rating }} 分 · {{ entry.wins }} 胜</span>
        </li>
      </ol>
    </details>
  </div>
</template>
