<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'

const store = useGameStore()
const chatInput = ref('')
const chatFilter = ref<'ALL' | 'RUMOR' | 'WORLD'>('ALL')

const compassNodes = [
  { id: 'damo_caravan', dir: '西', shortName: '大漠商道', safety: 'CONTESTED' as const, rate: 4200 },
  { id: 'zhongnan_forest', dir: '北', shortName: '终南后山', safety: 'PEACE' as const, rate: 2900 },
  { id: 'heizhao_swamp', dir: '南', shortName: '湘西黑沼', safety: 'CONTESTED' as const, rate: 5100 },
  { id: 'jiaxing_suburb', dir: '东', shortName: '嘉兴烟雨', safety: 'PEACE' as const, rate: 1800 },
]

const chatChannels = [
  { k: 'ALL', l: '综合' },
  { k: 'RUMOR', l: '百晓' },
  { k: 'WORLD', l: '群侠' },
] as const

const filteredMessages = computed(() => {
  if (chatFilter.value === 'ALL') return store.worldMessages
  return store.worldMessages.filter((m) => m.channel === chatFilter.value)
})

function handleSend() {
  if (!chatInput.value.trim()) return
  store.sendChatMessage(chatInput.value, 'WORLD')
  chatInput.value = ''
}
</script>

<template>
  <div class="h-full min-h-0 flex flex-col gap-2.5">
    <!-- 上半区 (56%高度锁定)：九州驿站方位与同图侠客 -->
    <div class="wuxia-card p-3 flex-[56] min-h-0 flex flex-col gap-2">
      <div class="border-b border-[var(--border-ink)] pb-2 space-y-2 shrink-0">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold">九州驿路 · 同图 ({{ store.nearbyPlayers.length }})</span>
          <span :class="store.currentMap.safety === 'PEACE' ? 'ink-jade' : 'ink-cinnabar'">
            {{ store.currentMap.safety === 'PEACE' ? '和平禁武' : '纷争可劫' }}
          </span>
        </div>

        <!-- 干净利落的四方驿路格（无花哨中心图标与红底） -->
        <div class="grid grid-cols-2 gap-1 text-[11px]">
          <button
            v-for="node in compassNodes"
            :key="node.id"
            @click="store.moveMap(node.id)"
            class="px-2 py-1 text-left cursor-pointer flex items-center justify-between gap-1 transition"
            :class="store.player.currentMapId === node.id ? 'tab-gold font-bold' : 'token-btn ink-muted'"
            :title="`前往「${node.shortName}」(${node.rate}真气/时)`"
          >
            <span class="truncate">{{ node.dir }} · {{ node.shortName }}</span>
            <span
              class="text-[10px] shrink-0"
              :class="node.safety === 'CONTESTED' ? 'ink-cinnabar' : 'opacity-65'"
            >
              {{ node.safety === 'PEACE' ? '平' : '争' }}
            </span>
          </button>
        </div>
      </div>

      <!-- 去套娃方框：改用干净暗线分割的玩家列表 -->
      <div class="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--border-subtle)] pr-0.5">
        <div
          v-for="p in store.nearbyPlayers"
          :key="p.id"
          class="py-2 first:pt-0.5 text-xs space-y-1"
        >
          <div class="flex items-center justify-between gap-1">
            <div class="font-bold truncate flex items-center gap-1.5">
              <span :class="p.isBetrayerBounty ? 'ink-cinnabar' : ''">{{ p.nickname }}</span>
              <span v-if="p.isBetrayerBounty" class="text-[10px] ink-cinnabar border border-[var(--accent-cinnabar)]/50 px-1 leading-tight">
                逆徒
              </span>
              <span v-if="p.isEscortingDart" class="text-[10px] ink-gold border border-[var(--border-gold-subtle)] px-1 leading-tight">
                押镖
              </span>
            </div>
            <span class="text-[11px] ink-muted tabular-nums shrink-0">Lv.{{ p.level }}</span>
          </div>

          <div class="flex items-center justify-between text-[11px] ink-muted">
            <span class="truncate">{{ p.sectName }} · {{ p.realmName }}</span>
            <span class="tabular-nums shrink-0">战 {{ p.combatPower.toLocaleString() }}</span>
          </div>

          <div v-if="p.holdingUniqueArtifact" class="text-[11px] ink-gold truncate">
            执孤品「{{ p.holdingUniqueArtifact }}」
          </div>

          <div class="flex items-center gap-1.5 pt-0.5 text-[11px]">
            <button
              @click="store.interactNearbyPlayer(p, 'CO_CULT')"
              class="token-btn flex-1 py-0.5 cursor-pointer"
            >
              共修
            </button>
            <button
              @click="store.interactNearbyPlayer(p, 'SPAR')"
              class="token-btn flex-1 py-0.5 cursor-pointer"
            >
              切磋
            </button>
            <button
              v-if="store.currentMap.safety === 'CONTESTED' || p.isBetrayerBounty"
              @click="store.interactNearbyPlayer(p, 'AMBUSH')"
              class="seal-stamp flex-1 py-0.5 font-bold cursor-pointer"
            >
              {{ p.isBetrayerBounty ? '缉逆' : '劫镖' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 下半区 (44%高度锁定)：飞鸽传书实时频道 -->
    <div class="wuxia-card p-3 flex-[44] min-h-0 flex flex-col gap-2">
      <div class="flex items-center justify-between border-b border-[var(--border-ink)] pb-1.5 shrink-0">
        <span class="text-xs font-bold">飞鸽传书</span>
        <div class="flex items-center gap-1 text-[11px]">
          <button
            v-for="ch in chatChannels"
            :key="ch.k"
            @click="chatFilter = ch.k"
            class="px-2 py-0.2 cursor-pointer transition"
            :class="chatFilter === ch.k ? 'tab-gold font-bold' : 'ink-muted hover:text-[var(--text-ink)]'"
          >
            {{ ch.l }}
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5 text-xs">
        <div
          v-for="msg in filteredMessages"
          :key="msg.id"
          class="leading-relaxed border-b border-[var(--border-subtle)] pb-1"
        >
          <span
            class="text-[11px] mr-1"
            :class="msg.channel === 'RUMOR' ? 'ink-gold' : 'ink-muted'"
          >
            [{{ msg.channel === 'RUMOR' ? '天机' : msg.sect }}]
          </span>
          <b class="mr-0.5">{{ msg.sender }}：</b>
          <span class="ink-muted text-[var(--text-ink)]/90">{{ msg.content }}</span>
        </div>
      </div>

      <form @submit.prevent="handleSend" class="flex gap-1.5 shrink-0 pt-0.5">
        <input
          v-model="chatInput"
          type="text"
          placeholder="千里传音（回车发送）..."
          class="flex-1 min-w-0 bg-transparent border border-[var(--border-ink)] px-2 py-1 text-xs focus:outline-none focus:border-[var(--border-gold)]"
        />
        <button type="submit" class="tab-gold px-3 py-1 text-xs font-bold cursor-pointer shrink-0">
          传音
        </button>
      </form>
    </div>
  </div>
</template>
