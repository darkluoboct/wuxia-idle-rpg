<script setup lang="ts">
/** 江湖卷：九州驿路罗盘（四方换图） + 同图侠客 / 飞鸽传书 两个页签 */
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { MAPS } from '@/config/gameData'

const store = useGameStore()
const tab = ref<'NEARBY' | 'CHAT'>('NEARBY')
const chatInput = ref('')
const chatFilter = ref<'ALL' | 'RUMOR' | 'WORLD'>('ALL')
const unread = ref(false)

type Dir = '北' | '西' | '东' | '南'
const COMPASS: { id: string; dir: Dir; cls: string }[] = [
  { id: 'zhongnan_forest', dir: '北', cls: 'col-start-2 row-start-1' },
  { id: 'damo_caravan', dir: '西', cls: 'col-start-1 row-start-2' },
  { id: 'jiaxing_suburb', dir: '东', cls: 'col-start-3 row-start-2' },
  { id: 'heizhao_swamp', dir: '南', cls: 'col-start-2 row-start-3' },
]
const nodes = computed(() => COMPASS.map((c) => ({ ...c, map: MAPS.find((m) => m.id === c.id)! })))
const SHORT: Record<string, string> = { zhongnan_forest: '终南后山', damo_caravan: '大漠商道', jiaxing_suburb: '嘉兴烟雨', heizhao_swamp: '湘西黑沼' }

const channels = [
  { k: 'ALL', l: '综合' },
  { k: 'RUMOR', l: '百晓' },
  { k: 'WORLD', l: '群侠' },
] as const

const messages = computed(() =>
  chatFilter.value === 'ALL' ? store.worldMessages : store.worldMessages.filter((m) => m.channel === chatFilter.value)
)

watch(
  () => store.worldMessages.length,
  () => {
    if (tab.value !== 'CHAT') unread.value = true
  }
)
watch(tab, (t) => {
  if (t === 'CHAT') unread.value = false
})

function send() {
  if (!chatInput.value.trim()) return
  store.sendChatMessage(chatInput.value, 'WORLD')
  chatInput.value = ''
}

/** 对方战力 / 我方战力，用于判断切磋、劫掠是否划算 */
const myPower = computed(() => Math.max(1, store.derivedStats.combatPower))
const ratio = (power: number) => power / myPower.value
</script>

<template>
  <div class="panel flex h-full min-h-0 flex-col gap-3 p-3.5">
    <!-- 九州驿路 -->
    <div class="shrink-0">
      <div class="sec-title mb-2 text-base">
        九州驿路
        <span class="chip" :class="store.currentMap.safety === 'PEACE' ? 'chip-jade' : 'chip-red'">
          {{ store.currentMap.safety === 'PEACE' ? '和平禁武' : '纷争可劫' }}
        </span>
      </div>

      <div class="relative grid grid-cols-3 grid-rows-3 gap-1.5">
        <!-- 十字连线 + 罗盘环 -->
        <svg viewBox="0 0 3 3" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
          <path d="M1.5,0.45 V2.55 M0.45,1.5 H2.55" stroke="var(--gold)" stroke-opacity="0.45" stroke-width="0.014" stroke-dasharray="0.04 0.05" fill="none" />
        </svg>

        <button
          v-for="n in nodes" :key="n.id"
          class="well well-hover relative z-10 flex min-w-0 flex-col items-center justify-center px-1 py-1.5 text-center"
          :class="[n.cls, store.player.currentMapId === n.id ? '!border-gold bg-[var(--gold-soft)]' : '']"
          :title="`前往「${n.map.name}」· 灵脉 ${n.map.baseQiPerHour.toLocaleString()}/时 · ${n.map.onlineCount} 人在线`"
          @click="store.moveMap(n.id)"
        >
          <span class="absolute left-1 top-0.5 text-[0.68rem] leading-none text-ink3">{{ n.dir }}</span>
          <span v-if="n.map.safety === 'CONTESTED'" class="absolute right-1 top-0.5 text-[0.68rem] leading-none text-cinnabar">争</span>
          <span class="mt-1 truncate text-sm font-semibold leading-tight" :class="store.player.currentMapId === n.id ? 'text-gold' : ''">{{ SHORT[n.id] }}</span>
          <span class="text-[0.7rem] tabular-nums leading-tight text-ink3">{{ (n.map.baseQiPerHour / 1000).toFixed(1) }}k/时</span>
        </button>

        <!-- 中心：当前 -->
        <div class="relative z-10 col-start-2 row-start-2 flex items-center justify-center">
          <div class="relative flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-full border border-gold bg-raised">
            <svg viewBox="0 0 60 60" class="absolute inset-0 h-full w-full">
              <circle cx="30" cy="30" r="26" fill="none" stroke="var(--gold)" stroke-width="0.8" stroke-dasharray="1 3" opacity="0.7" />
              <path d="M30,5 L33,13 L27,13 Z" fill="var(--cinnabar)" />
            </svg>
            <span class="font-brush relative text-xs leading-tight text-gold">当前</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 页签 -->
    <div class="tabs shrink-0" role="tablist">
      <button class="tab" role="tab" :aria-selected="tab === 'NEARBY'" @click="tab = 'NEARBY'">
        同图侠客 <span class="text-xs opacity-60 tabular-nums">{{ store.nearbyPlayers.length }}</span>
      </button>
      <button class="tab" role="tab" :aria-selected="tab === 'CHAT'" @click="tab = 'CHAT'">
        飞鸽传书<i v-if="unread" class="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-seal align-middle" />
      </button>
    </div>

    <!-- 同图侠客 -->
    <ul v-if="tab === 'NEARBY'" class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
      <li v-if="!store.nearbyPlayers.length" class="py-8 text-center text-sm text-ink3">此地暂无旁人，清净修行。</li>
      <li v-for="pl in store.nearbyPlayers" :key="pl.id" class="well space-y-2 p-2.5">
        <div class="flex items-start gap-2.5">
          <span class="seal h-9 w-9 text-xl" :class="pl.isBetrayerBounty ? '' : 'seal-gold'">{{ pl.nickname.replace(/^[^一-龥]*·?/, '').slice(0, 1) || pl.nickname.slice(0, 1) }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <b class="truncate text-sm" :class="pl.isBetrayerBounty ? 'text-cinnabar' : ''">{{ pl.nickname }}</b>
              <span v-if="pl.isBetrayerBounty" class="chip chip-red !py-0 !text-[0.68rem]">逆徒</span>
              <span v-if="pl.isEscortingDart" class="chip chip-gold !py-0 !text-[0.68rem]">押镖</span>
            </div>
            <div class="truncate text-xs text-ink3">{{ pl.sectName }} · {{ pl.realmName }}</div>
          </div>
          <div class="shrink-0 text-right text-xs tabular-nums">
            <div class="text-ink3">Lv.{{ pl.level }}</div>
            <div class="font-bold text-gold">{{ pl.combatPower.toLocaleString() }}</div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 text-xs">
          <span class="tabular-nums" :class="ratio(pl.combatPower) > 1.2 ? 'text-cinnabar' : ratio(pl.combatPower) < 0.85 ? 'text-jade' : 'text-ink3'">
            战力约你的 {{ ratio(pl.combatPower).toFixed(1) }}×{{ ratio(pl.combatPower) > 1.2 ? ' · 强敌' : ratio(pl.combatPower) < 0.85 ? ' · 可胜' : '' }}
          </span>
        </div>
        <div v-if="pl.holdingUniqueArtifact" class="chip tier-chip t-red glow-border w-full !justify-start truncate">执孤品「{{ pl.holdingUniqueArtifact }}」</div>

        <div class="flex gap-1.5">
          <button class="btn btn-sm flex-1" @click="store.interactNearbyPlayer(pl, 'CO_CULT')">共修</button>
          <button class="btn btn-sm flex-1" @click="store.interactNearbyPlayer(pl, 'SPAR')">切磋</button>
          <button
            v-if="store.currentMap.safety === 'CONTESTED' || pl.isBetrayerBounty"
            class="btn btn-sm btn-danger flex-1" @click="store.interactNearbyPlayer(pl, 'AMBUSH')"
          >
            {{ pl.isBetrayerBounty ? '缉逆' : '劫镖' }}
          </button>
        </div>
      </li>
    </ul>

    <!-- 飞鸽传书 -->
    <template v-else>
      <div class="flex shrink-0 items-center gap-1.5 text-xs">
        <button
          v-for="c in channels" :key="c.k" class="chip" :class="chatFilter === c.k ? 'chip-gold' : 'opacity-75 hover:opacity-100'"
          @click="chatFilter = c.k"
        >
          {{ c.l }}
        </button>
      </div>
      <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        <li v-for="m in messages" :key="m.id" class="border-b border-line pb-2 text-sm leading-relaxed last:border-b-0">
          <div class="mb-0.5 flex items-center gap-1.5 text-xs">
            <span class="chip !py-0" :class="m.channel === 'RUMOR' ? 'chip-gold' : ''">{{ m.channel === 'RUMOR' ? '天机' : m.sect }}</span>
            <b class="truncate text-ink">{{ m.sender }}</b>
            <span class="ml-auto shrink-0 text-ink3">{{ m.time }}</span>
          </div>
          <p class="text-ink2">{{ m.content }}</p>
        </li>
      </ul>
      <form class="flex shrink-0 gap-1.5" @submit.prevent="send">
        <input
          v-model="chatInput" type="text" maxlength="80" placeholder="千里传音（回车发送）…" aria-label="传音内容"
          class="min-w-0 flex-1 rounded-sm border border-linestrong bg-transparent px-2.5 py-1.5 text-sm placeholder:text-ink3 focus:border-gold focus:outline-none"
        />
        <button type="submit" class="btn btn-gold shrink-0">传音</button>
      </form>
    </template>
  </div>
</template>
