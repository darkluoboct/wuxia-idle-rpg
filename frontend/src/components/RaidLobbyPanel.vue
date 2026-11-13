<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COOP_RAIDS } from '@/config/gameData'

const store = useGameStore()
const team = computed(() => store.raidLobby.team)
const isLeader = computed(() => team.value?.leaderId === store.player.id)
const mySeat = computed(() => team.value?.members.find((member) => member.id === store.player.id))
const readyCount = computed(() => team.value?.members.filter((member) => member.online && member.ready).length ?? 0)
const busy = computed(() => !store.roomConnected || store.raidLobbyBusy || store.onlineActionBusy || !!team.value?.starting)
const raid = computed(() => COOP_RAIDS[store.selectedRaidId])
const nextRelic = computed(() => raid.value.relics[store.selectedRaidClears])
</script>

<template>
  <article class="well space-y-3 p-4" aria-label="三人副本组队">
    <div class="space-y-1.5">
      <div class="flex flex-wrap gap-2" role="group" aria-label="选择三人副本">
        <button v-for="(entry, id) in COOP_RAIDS" :key="id" class="btn btn-sm"
          :class="{ 'btn-gold': store.selectedRaidId === id }" :aria-pressed="store.selectedRaidId === id"
          :disabled="!!team && (!isLeader || busy)" @click="store.selectRaid(id)"
        >{{ entry.title }}</button>
      </div>
      <p class="hint">{{ raid.description }}</p>
      <p class="text-sm text-gold">个人通关 {{ store.selectedRaidClears }} 次</p>
      <p v-if="nextRelic && !store.ownedItemIds.includes(nextRelic.id)" class="text-sm text-jade">下次通关可得《{{ nextRelic.name }}》</p>
      <p v-else-if="nextRelic" class="hint">已持有《{{ nextRelic.name }}》，下次通关发放真气和纹银。</p>
      <p v-else-if="raid.firstClearBonus && store.selectedRaidClears === 0" class="text-sm text-jade">
        首胜额外奖励 {{ raid.firstClearBonus.qiExp.toLocaleString() }} 真气、{{ raid.firstClearBonus.silver.toLocaleString() }} 纹银。
      </p>
      <p v-else-if="raid.firstClearBonus" class="hint">首胜奖励已结算，再胜可获得真气和纹银。</p>
      <p v-else class="hint">秘宝奖励已结算，再胜可获得真气和纹银。</p>
    </div>

    <template v-if="team">
      <div class="flex items-center justify-between border-t border-line pt-2 text-sm">
        <b>队伍 {{ team.members.length }} / 3</b>
        <span class="text-jade">已准备 {{ readyCount }} / 3</span>
      </div>
      <ul class="grid gap-2 sm:grid-cols-3" aria-label="队伍成员">
        <li v-for="member in team.members" :key="member.id" class="well flex min-w-0 flex-col gap-1 p-2.5">
          <b class="truncate text-sm" :title="member.nickname">{{ member.nickname }}</b>
          <span class="text-xs text-ink2">{{ member.id === team.leaderId ? '队长' : '队员' }}<template v-if="member.id === store.player.id"> · 你</template></span>
          <span class="text-xs" :class="member.ready ? 'text-jade' : 'text-ink3'">{{ !member.online ? '已离线' : member.ready ? '已准备' : '未准备' }}</span>
        </li>
        <li v-for="seat in 3 - team.members.length" :key="`empty-${seat}`" class="flex min-h-19 items-center justify-center border border-dashed border-line p-2 text-sm text-ink3">等待侠客</li>
      </ul>
      <p v-if="team.invited.length" class="hint">已邀请 {{ team.invited.map((entry) => entry.nickname).join('、') }}，等对方答复。</p>
      <div class="flex flex-wrap gap-2">
        <button
          class="btn btn-gold" :disabled="busy || team.members.length !== 3"
          @click="store.raidTeamAction({ action: 'ready', teamId: team.id, raidId: team.raidId, ready: !mySeat?.ready })"
        >{{ mySeat?.ready ? '取消准备' : '准备' }}</button>
        <button v-if="isLeader" class="btn btn-seal" :disabled="busy || readyCount !== 3" @click="store.startThreePlayerCoopRaid()">
          {{ team.starting ? '正在破阵…' : '挑战副本' }}
        </button>
        <button class="btn" :disabled="busy" @click="store.raidTeamAction({ action: 'leave', teamId: team.id })">{{ isLeader ? '解散队伍' : '离开队伍' }}</button>
      </div>
    </template>

    <div v-else class="space-y-2 border-t border-line pt-3">
      <p class="hint">在右侧「附近」邀请两位同图侠客，或回应收到的组队邀请。</p>
      <button class="btn btn-sm xl:hidden" @click="store.mobileDrawer = 'WORLD'">查看附近侠客</button>
    </div>
  </article>
</template>
