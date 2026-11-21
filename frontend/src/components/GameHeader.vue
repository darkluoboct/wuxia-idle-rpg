<script setup lang="ts">
import type { Component } from 'vue'
import { BookOpenText, House, IdCard, LogOut, Mail, MessageCircle, ScrollText, Settings, UsersRound } from 'lucide-vue-next'
import type { MainTab } from '@/stores/gameUiStore'
import { useGameUiStore } from '@/stores/gameUiStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useOnlineStore } from '@/stores/onlineStore'
import { IS_MOCK_MODE } from '@/network/apiClient'

defineProps<{
  tabs: { key: MainTab; label: string; icon: Component; hotkey: string }[]
  badges: Partial<Record<MainTab, string>>
  inBattle: boolean
  wideWorkspace: boolean
  arsenalWorkspace: boolean
  journalReturn: boolean
  unreadMail: number
  chatPrivateUnread: number
  chatPublicUnread: number | boolean
}>()
const emit = defineEmits<{ select: [tab: MainTab]; home: []; choose: []; logout: []; mail: []; tasks: []; settings: [] }>()
const ui = useGameUiStore()
const player = usePlayerStore()
const online = useOnlineStore()

const compact = (amount: number) => amount >= 10_000 ? `${(amount / 10_000).toFixed(1)}万` : String(amount)
const toggleDrawer = (drawer: 'CHAR' | 'WORLD' | 'CHAT') => {
  ui.mobileDrawer = ui.mobileDrawer === drawer ? 'NONE' : drawer
}
</script>

<template>
  <header class="wuxia-header">
    <div class="wuxia-wordmark" :title="IS_MOCK_MODE ? '问道武林 · 试玩模式' : '问道武林 · 江湖在线'">
      <h1 class="font-brush">金庸群侠</h1>
      <span class="seal vertical-rl">问道</span>
    </div>

    <div class="wuxia-navigation">
      <nav class="wuxia-nav" role="tablist" aria-label="主导航">
        <button
          v-for="t in tabs" :key="t.key" role="tab" :aria-selected="!inBattle && ui.activeTab === t.key"
          :aria-description="badges[t.key]" :class="{ 'nav-attention': badges[t.key] }"
          :title="`${t.label}（${t.hotkey}）`" :aria-keyshortcuts="t.hotkey" @click="emit('select', t.key)"
        >
          <component :is="t.icon" aria-hidden="true" />
          <span>{{ t.label }}</span>
        </button>
      </nav>
      <button
        class="wuxia-appearance" aria-label="界面设置" aria-haspopup="dialog" title="界面设置" @click="emit('settings')"
      ><Settings aria-hidden="true" /><span>设置</span></button>
    </div>

    <div class="wuxia-assets tabular-nums">
      <div class="wuxia-currency" aria-label="资产">
        <span :title="`纹银 ${player.player.silver.toLocaleString()}`">
          <i class="art art-coin" aria-hidden="true" />
          <b class="sm:hidden">{{ compact(player.player.silver) }}</b><b class="hidden sm:inline">{{ player.player.silver.toLocaleString() }}</b>
        </span>
        <span :title="`元宝 ${player.player.goldIngot.toLocaleString()}`">
          <i class="art art-ingot" aria-hidden="true" />
          <b class="sm:hidden">{{ compact(player.player.goldIngot) }}</b><b class="hidden sm:inline">{{ player.player.goldIngot.toLocaleString() }}</b>
        </span>
      </div>
      <div class="wuxia-tools">
      <button v-if="IS_MOCK_MODE" class="wuxia-icon" aria-label="存档并返回开局" aria-haspopup="dialog" title="存档并返回开局" @click="emit('home')"><House /></button>
      <button
        class="wuxia-icon relative" :aria-label="unreadMail ? `江湖来信，${unreadMail} 封未读` : '江湖来信'" title="江湖来信"
        aria-haspopup="dialog" :disabled="inBattle" @click="emit('mail')"
      >
        <Mail />
        <b v-if="unreadMail" class="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--cinnabar)] px-1 text-xs leading-4 text-white tabular-nums">{{ unreadMail }}</b>
      </button>
      <button class="wuxia-icon" :aria-label="journalReturn ? '返回任务与玩法' : '任务与玩法'" :title="journalReturn ? '返回任务与玩法' : '任务与玩法'"
        aria-haspopup="dialog" :disabled="inBattle" @click="emit('tasks')"><ScrollText /></button>
      <button
        class="wuxia-icon relative md:hidden" :aria-label="chatPrivateUnread ? `江湖传音，${chatPrivateUnread} 条私聊未读` : '江湖传音'" title="江湖传音"
        aria-controls="chat-sheet" :aria-expanded="ui.mobileDrawer === 'CHAT'" @click="toggleDrawer('CHAT')"
      >
        <MessageCircle />
        <b v-if="chatPrivateUnread" class="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--cinnabar)] px-1 text-xs leading-4 text-white tabular-nums">{{ chatPrivateUnread }}</b>
        <i v-else-if="chatPublicUnread" class="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--cinnabar)]" aria-hidden="true" />
      </button>
      <button class="wuxia-icon" aria-label="选择角色" aria-haspopup="dialog" title="选择角色" @click="emit('choose')"><UsersRound /></button>
      <button v-if="!IS_MOCK_MODE" class="wuxia-icon" aria-label="退出登录" aria-haspopup="dialog" title="退出登录" :disabled="online.authBusy" @click="emit('logout')"><LogOut /></button>
      <button v-if="!arsenalWorkspace" class="wuxia-icon" :class="{ 'md:hidden': !wideWorkspace }" aria-label="查看角色" title="人物卷" aria-controls="character-rail" :aria-expanded="ui.mobileDrawer === 'CHAR'" @click="toggleDrawer('CHAR')"><IdCard /></button>
      <button v-if="!arsenalWorkspace" class="wuxia-icon" :class="{ 'xl:hidden': !wideWorkspace }" aria-label="江湖卷" title="江湖卷" aria-controls="world-rail" :aria-expanded="ui.mobileDrawer === 'WORLD'" @click="toggleDrawer('WORLD')"><BookOpenText /></button>
      <button
        class="wuxia-icon md:hidden" aria-label="界面设置" aria-haspopup="dialog" title="界面设置" @click="emit('settings')"
      ><Settings /></button>
      </div>
    </div>
  </header>

  <nav class="wuxia-mobile-nav" role="tablist" aria-label="主导航">
    <button
      v-for="t in tabs" :key="t.key"
      role="tab" :aria-selected="!inBattle && ui.activeTab === t.key"
      :aria-description="badges[t.key]" :class="{ 'nav-attention': badges[t.key] }"
      @click="emit('select', t.key)"
    >
      <component :is="t.icon" aria-hidden="true" />
      {{ t.label }}
    </button>
  </nav>
</template>
