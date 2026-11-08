<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useGameStore, type MainTab } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import LeftCharacterSidebar from '@/components/LeftCharacterSidebar.vue'
import RightJianghuSidebar from '@/components/RightJianghuSidebar.vue'
import StageHeaderArena from '@/components/StageHeaderArena.vue'
import RichLogStream from '@/components/RichLogStream.vue'
import JianghuView from '@/views/JianghuView.vue'
import ArsenalView from '@/views/ArsenalView.vue'
import SectView from '@/views/SectView.vue'
import MarketView from '@/views/MarketView.vue'

const store = useGameStore()

/** 严格锁定的客户端逻辑分辨率档位 (16:9 标准桌面端比例) */
const RESOLUTIONS = [
  { key: '720p', label: '1280×720', width: 1280, height: 720 },
  { key: '810p', label: '1440×810', width: 1440, height: 810 },
  { key: '900p', label: '1600×900', width: 1600, height: 900 },
] as const

const selectedResKey = ref<'720p' | '810p' | '900p'>('720p')
const autoFitScale = ref(true)
const viewportW = ref(window.innerWidth)
const viewportH = ref(window.innerHeight)

const currentRes = computed(() => RESOLUTIONS.find((r) => r.key === selectedResKey.value) ?? RESOLUTIONS[0])

const canvasScale = computed(() => {
  if (!autoFitScale.value) return 1
  const pad = 16
  const sx = (viewportW.value - pad) / currentRes.value.width
  const sy = (viewportH.value - pad) / currentRes.value.height
  return Math.min(1, sx, sy)
})

const navTabs: { key: MainTab; label: string; hotkey: string }[] = [
  { key: 'CULTIVATE', label: '修行吐纳', hotkey: '1' },
  { key: 'JIANGHU', label: '闯荡江湖', hotkey: '2' },
  { key: 'ARSENAL', label: '随身武库', hotkey: '3' },
  { key: 'SECT', label: '宗门百派', hotkey: '4' },
  { key: 'MARKET', label: '市井风云', hotkey: '5' },
]

function updateViewport() {
  viewportW.value = window.innerWidth
  viewportH.value = window.innerHeight
}

function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  if (e.key === '1') store.activeTab = 'CULTIVATE'
  else if (e.key === '2') store.activeTab = 'JIANGHU'
  else if (e.key === '3') store.activeTab = 'ARSENAL'
  else if (e.key === '4') store.activeTab = 'SECT'
  else if (e.key === '5') store.activeTab = 'MARKET'
  else if (e.code === 'Space' && store.activeBattle) {
    e.preventDefault()
    if (store.isBattlePlaying) store.skipBattleToEnd()
    else store.closeBattleStage()
  }
}

onMounted(() => {
  document.documentElement.classList.toggle('theme-midnight', store.isMidnightTheme)
  window.addEventListener('resize', updateViewport)
  window.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="w-screen h-screen overflow-hidden flex items-center justify-center select-none relative">
    <!-- 固定像素分辨率主画框 -->
    <div
      class="game-window-frame flex flex-col overflow-hidden relative shrink-0 origin-center transition-transform duration-150"
      :style="{
        width: `${currentRes.width}px`,
        height: `${currentRes.height}px`,
        minWidth: `${currentRes.width}px`,
        minHeight: `${currentRes.height}px`,
        maxWidth: `${currentRes.width}px`,
        maxHeight: `${currentRes.height}px`,
        transform: `scale(${canvasScale})`,
      }"
    >
      <!-- 全局轻提示 -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="store.toastMessage"
          class="absolute top-[74px] left-1/2 -translate-x-1/2 z-50 px-5 py-1.5 shadow-xl text-xs font-bold pointer-events-none wuxia-card"
          :class="store.toastMessage.tone === 'danger' ? 'ink-cinnabar border-[var(--accent-cinnabar)]' : 'ink-gold border-[var(--border-gold)]'"
        >
          「 {{ store.toastMessage.text }} 」
        </div>
      </Transition>

      <!-- 顶部极简天枢横梁 (44px) -->
      <header class="sandalwood-beam h-[44px] shrink-0 px-3.5 flex items-center justify-between gap-3">
        <!-- 左：全屏唯一常驻一点朱砂印 + 题名 -->
        <div class="flex items-center gap-2.5 shrink-0">
          <span class="seal-stamp text-[11px] font-bold px-1.5 py-0.5 leading-none">问道</span>
          <span class="font-brush text-xl ink-gold leading-none tracking-wider">金庸群侠</span>
          <span class="text-[11px] ink-muted pl-2 border-l border-[var(--border-ink)]">
            {{ store.shichenLabel }} · {{ IS_MOCK_MODE ? '演武模式' : '江湖在线' }}
          </span>
        </div>

        <!-- 中：克制素雅的暗金线框导航（不再使用刺眼红块） -->
        <nav class="flex items-center gap-1">
          <button
            v-for="t in navTabs"
            :key="t.key"
            @click="store.activeTab = t.key; if (store.activeBattle && !store.isBattlePlaying) store.closeBattleStage()"
            class="px-3 py-1 text-xs cursor-pointer transition flex items-center gap-1.5"
            :class="
              store.activeTab === t.key && !store.activeBattle
                ? 'tab-gold font-bold'
                : 'ink-muted hover:text-[var(--text-ink)] border border-transparent'
            "
          >
            <span>{{ t.label }}</span>
            <span class="text-[10px] opacity-55 font-sans">{{ t.hotkey }}</span>
          </button>
        </nav>

        <!-- 右：去框化的资产读数 + 分辨率 + 玄墨/宋宣切换 -->
        <div class="flex items-center gap-3 text-xs shrink-0 tabular-nums">
          <div class="flex items-center gap-3 pr-2 border-r border-[var(--border-ink)]">
            <span><span class="ink-muted mr-1">纹银</span><b>{{ store.player.silver.toLocaleString() }}</b></span>
            <span><span class="ink-muted mr-1">元宝</span><b class="ink-gold">{{ store.player.goldIngot }}</b></span>
          </div>

          <select
            v-model="selectedResKey"
            class="bg-transparent border border-[var(--border-ink)] px-1.5 py-0.5 text-[11px] ink-muted hover:text-[var(--text-ink)] cursor-pointer focus:outline-none"
            title="切换固定窗口分辨率"
          >
            <option v-for="r in RESOLUTIONS" :key="r.key" :value="r.key" class="bg-stone-900 text-stone-200">
              {{ r.label }}
            </option>
          </select>

          <button
            @click="store.toggleTheme()"
            class="token-btn px-2 py-0.5 text-[11px] cursor-pointer"
            title="切换燕云玄墨 / 宋韵冷宣主题"
          >
            {{ store.isMidnightTheme ? '宋宣' : '玄墨' }}
          </button>
        </div>
      </header>

      <!-- 江湖飞鸽邸报走马灯 (保留横滚，去除花哨颜色与Emoji，悬停可暂停细读) -->
      <div class="h-[24px] shrink-0 bg-[var(--bg-paper)] border-b border-[var(--border-ink)] px-3.5 flex items-center gap-2.5 overflow-hidden text-[11px]">
        <span class="ink-gold font-bold shrink-0 tracking-wider">江湖邸报</span>
        <span class="ink-muted opacity-40">|</span>
        <div class="flex-1 min-w-0 overflow-hidden relative">
          <div class="animate-marquee ink-muted">
            {{ store.marqueeBulletin }}
          </div>
        </div>
      </div>

      <!-- 主体严格左 · 中 · 右三栏硬锁定容器 -->
      <main class="flex-1 min-h-0 grid grid-cols-[284px_1fr_302px] gap-2.5 p-2.5 overflow-hidden">
        <aside class="h-full min-h-0 overflow-hidden">
          <LeftCharacterSidebar />
        </aside>

        <section class="h-full min-h-0 flex flex-col gap-2.5 overflow-hidden">
          <template v-if="store.activeBattle || store.activeTab === 'CULTIVATE'">
            <StageHeaderArena />
            <RichLogStream />
          </template>

          <JianghuView v-else-if="store.activeTab === 'JIANGHU'" />
          <ArsenalView v-else-if="store.activeTab === 'ARSENAL'" />
          <SectView v-else-if="store.activeTab === 'SECT'" />
          <MarketView v-else-if="store.activeTab === 'MARKET'" />
        </section>

        <aside class="h-full min-h-0 overflow-hidden">
          <RightJianghuSidebar />
        </aside>
      </main>

      <!-- 词条详情鉴赏古卷弹窗 -->
      <div
        v-if="store.inspectModal"
        class="absolute inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
        @click.self="store.inspectModal = null"
      >
        <div class="wuxia-card max-w-md w-full p-4 space-y-2.5 shadow-2xl select-text border-[var(--border-gold)]">
          <div class="flex items-start justify-between gap-2 border-b border-[var(--border-ink)] pb-2">
            <div>
              <h4 class="font-brush text-2xl ink-gold leading-tight">{{ store.inspectModal.title }}</h4>
              <div class="text-xs ink-muted mt-0.5">{{ store.inspectModal.subtitle }}</div>
            </div>
            <button
              @click="store.inspectModal = null"
              class="token-btn text-xs px-2 py-0.5 cursor-pointer"
            >
              合卷
            </button>
          </div>
          <p class="text-sm leading-relaxed">{{ store.inspectModal.desc }}</p>
          <p v-if="store.inspectModal.extra" class="text-xs ink-gold pt-1.5 border-t border-[var(--border-subtle)]">
            {{ store.inspectModal.extra }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
