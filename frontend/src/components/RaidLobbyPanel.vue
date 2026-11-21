<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COOP_RAIDS } from '@/config/gameData'
import PortraitCard from './PortraitCard.vue'
import WorkbenchDialog from './WorkbenchDialog.vue'
import RaidRewardTray from './RaidRewardTray.vue'

const store = useGameStore()
const team = computed(() => store.raidLobby.team)
const isLeader = computed(() => team.value?.leaderId === store.player.id)
const mySeat = computed(() => team.value?.members.find((member) => member.id === store.player.id))
const readyCount = computed(() => team.value?.members.filter((member) => member.online && member.ready).length ?? 0)
const busy = computed(() => !store.roomConnected || store.raidLobbyBusy || store.onlineActionBusy || !!team.value?.starting)
const raid = computed(() => COOP_RAIDS[store.selectedRaidId])

// 结义镜像：同伴不在线时，挑两位侠客的镜像同闯（docs/21）
const picked = ref<string[]>([])
const sameSect = ref(false)
const mirrors = computed(() => (store.raidMirrors?.candidates ?? []).filter((entry) => !sameSect.value || entry.sameSect))
const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
function togglePick(id: string) {
  picked.value = picked.value.includes(id) ? picked.value.filter((entry) => entry !== id) : [...picked.value, id].slice(-2)
}
watch(() => store.raidMirrors?.candidates, (candidates) => {
  picked.value = picked.value.filter((id) => candidates?.some((entry) => entry.id === id))
})
void store.refreshRaidMirrors()
function showNearby() {
  store.worldPane = 'SOCIAL'
  store.mobileDrawer = 'WORLD'
}
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
      <RaidRewardTray />
    </div>

    <template v-if="team">
      <div class="flex items-center justify-between border-t border-line pt-2 text-sm">
        <b>队伍 {{ team.members.length }} / 3</b>
        <span class="text-jade">已准备 {{ readyCount }} / 3</span>
      </div>
      <ul class="grid gap-2 sm:grid-cols-3" aria-label="队伍成员">
        <li v-for="member in team.members" :key="member.id" class="well flex min-w-0 flex-col gap-1 p-2.5">
          <PortraitCard bare size="sm" :name="member.nickname" :avatar-id="member.avatarId" style-type="hero_sword" :subtitle="member.weaponName ?? '徒手'" />
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

    <template v-else>
      <div class="space-y-2 border-t border-line pt-3">
        <p class="hint">在江湖卷「附近」邀请两位同图侠客，或回应收到的组队邀请。</p>
        <button class="btn btn-sm" @click="showNearby">查看附近侠客</button>
      </div>

      <section class="space-y-2 border-t border-line pt-3" aria-label="借镜像结义">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h5 class="font-brush text-lg">借镜像结义</h5>
          <button class="btn btn-sm" :disabled="busy" @click="store.registerRaidMirror()">
            {{ store.raidMirrors?.mine ? '按当前配装更新我的镜像' : '登记我的结义镜像' }}
          </button>
        </div>
        <WorkbenchDialog title="结义镜像规则"><p>
          同伴不在线也能闯：挑两位侠客的结义镜像与你同行，奖励只发给你。镜像冻结登记时的境界与配装，不带丹药；打过副本会自动登记。
          <template v-if="store.raidMirrors?.mine">你的镜像按 {{ date.format(store.raidMirrors.mine.mirrorAt) }} 的配装，别人也能借。</template>
        </p></WorkbenchDialog>
        <label class="ml-2 text-sm"><input v-model="sameSect" type="checkbox" /> 只看同门</label>
        <p v-if="store.raidMirrors && !mirrors.length" class="text-sm text-ink3">暂无符合条件的镜像。</p>
        <ul v-else class="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2" aria-label="可借的结义镜像">
          <li v-for="mirror in mirrors" :key="mirror.id">
            <button
              class="well flex w-full min-w-0 flex-col items-start gap-0.5 p-2.5 text-left" :class="picked.includes(mirror.id) ? 'border-gold' : ''"
              :aria-pressed="picked.includes(mirror.id)" @click="togglePick(mirror.id)"
            >
              <span class="flex w-full items-center justify-between gap-2">
                <b class="truncate text-sm">{{ mirror.nickname }}</b>
                <span class="shrink-0 text-xs tabular-nums text-ink3">Lv.{{ mirror.level }}</span>
              </span>
              <span class="truncate text-xs text-ink2">{{ mirror.sectName }} · {{ mirror.realmName }}<template v-if="mirror.sameSect"> · 同门</template></span>
              <span v-if="mirror.weaponName || mirror.companions.length" class="truncate text-xs text-ink3">
                {{ [mirror.weaponName, ...mirror.companions].filter(Boolean).join('、') }}
              </span>
            </button>
          </li>
        </ul>
        <button class="btn btn-seal" :disabled="busy || store.isBattlePlaying || picked.length !== 2" @click="store.startMirrorRaid(picked)">
          与镜像同闯（已挑 {{ picked.length }} / 2）
        </button>
      </section>
    </template>
  </article>
</template>
