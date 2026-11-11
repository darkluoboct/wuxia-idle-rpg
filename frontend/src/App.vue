<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { Compass, Moon, Sun, UserRound } from 'lucide-vue-next'
import { useGameStore, type MainTab } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { TIER_META } from '@/config/uiMeta'
import InkBackdrop from '@/components/InkBackdrop.vue'
import LeftCharacterSidebar from '@/components/LeftCharacterSidebar.vue'
import RightJianghuSidebar from '@/components/RightJianghuSidebar.vue'
import CultivateView from '@/views/CultivateView.vue'
import JianghuView from '@/views/JianghuView.vue'
import ArsenalView from '@/views/ArsenalView.vue'
import SectView from '@/views/SectView.vue'
import MarketView from '@/views/MarketView.vue'

const store = useGameStore()

const navTabs: { key: MainTab; label: string; full: string; glyph: string; hotkey: string; view: Component }[] = [
  { key: 'CULTIVATE', label: '修行', full: '修行吐纳', glyph: '修', hotkey: '1', view: CultivateView },
  { key: 'JIANGHU', label: '江湖', full: '闯荡江湖', glyph: '江', hotkey: '2', view: JianghuView },
  { key: 'ARSENAL', label: '武库', full: '随身武库', glyph: '武', hotkey: '3', view: ArsenalView },
  { key: 'SECT', label: '门派', full: '宗门百派', glyph: '门', hotkey: '4', view: SectView },
  { key: 'MARKET', label: '市井', full: '市井风云', glyph: '市', hotkey: '5', view: MarketView },
]

/** 战斗播放时中央始终显示演武台，此时不高亮任何页签 */
const inBattle = computed(() => !!store.activeBattle)
const currentTab = computed(() => (inBattle.value ? 'CULTIVATE' : store.activeTab))
const currentView = computed(() => navTabs.find((t) => t.key === currentTab.value)!.view)

function goTab(key: MainTab) {
  store.activeTab = key
  store.mobileDrawer = 'NONE'
  if (store.activeBattle && !store.isBattlePlaying) store.closeBattleStage()
}
const toggleDrawer = (d: 'CHAR' | 'WORLD') => (store.mobileDrawer = store.mobileDrawer === d ? 'NONE' : d)

/* ---------- 江湖邸报：单条轮播（替代 2900px 长文横滚，可读、可暂停） ---------- */
const bulletins = computed(() => store.marqueeBulletin.split('　　·　　').filter(Boolean))
const bulletinIdx = ref(0)
const bulletinPaused = ref(false)
const bulletin = computed(() => bulletins.value[bulletinIdx.value % Math.max(1, bulletins.value.length)] ?? '')
let bulletinTimer: ReturnType<typeof setInterval> | undefined

/* ---------- 键盘 ---------- */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (store.confirmDialog) store.resolveConfirm(false)
    else if (store.inspectModal) store.inspectModal = null
    else store.mobileDrawer = 'NONE'
    return
  }
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return
  if (store.confirmDialog || store.inspectModal) return

  const hit = navTabs.find((t) => t.hotkey === e.key)
  if (hit) goTab(hit.key)
  else if (e.code === 'Space' && store.activeBattle) {
    e.preventDefault()
    if (store.isBattlePlaying) store.skipBattleToEnd()
    else store.closeBattleStage()
  }
}

onMounted(() => {
  // 开发便利：?mode=new / ?mode=demo 跳过开局选择
  const qm = new URLSearchParams(window.location.search).get('mode')
  if (qm === 'new') store.startGame('NEW')
  else if (qm === 'demo') store.startGame('DEMO')
  document.documentElement.classList.toggle('theme-midnight', store.isMidnightTheme)
  window.addEventListener('keydown', handleKeydown)
  bulletinTimer = setInterval(() => {
    if (!bulletinPaused.value) bulletinIdx.value++
  }, 7000)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  clearInterval(bulletinTimer)
})

/** 窄屏资产读数：18600 → 1.9万 */
const compact = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n))

const vFocus = { mounted: (el: HTMLElement) => el.focus() }
const TOAST_GLYPH = { gold: '喜', danger: '警', info: '讯' } as const
</script>

<template>
  <div class="relative flex h-dvh flex-col overflow-hidden">
    <InkBackdrop />

    <!-- ==================== 顶栏 ==================== -->
    <header class="relative z-30 shrink-0 border-b border-line bg-[color-mix(in_srgb,var(--bg-1)_90%,transparent)] backdrop-blur-md">
      <div class="mx-auto flex h-[3.4rem] w-full max-w-[112rem] items-center justify-between gap-3 px-3 md:px-4">
        <!-- 题名 -->
        <div class="flex min-w-0 shrink-0 items-center gap-2.5">
          <span class="seal vertical-rl h-8 w-6 text-xs tracking-[0.2em] sm:h-9 sm:w-7 sm:text-sm">问道</span>
          <div class="leading-none">
            <div class="font-brush text-xl leading-none tracking-[0.1em] text-gold sm:text-[1.65rem] sm:tracking-[0.12em]">金庸群侠</div>
            <div class="mt-1 hidden items-center gap-1.5 text-xs text-ink3 lg:flex">
              <i class="inline-block h-1.5 w-1.5 rounded-full bg-jade" />
              {{ store.shichenLabel }} · {{ IS_MOCK_MODE ? '演武模式' : '江湖在线' }}
            </div>
          </div>
        </div>

        <!-- 主导航（≥ 768px） -->
        <nav class="tabs hidden border-b-0 md:flex" role="tablist" aria-label="主导航">
          <button
            v-for="t in navTabs" :key="t.key" class="tab flex items-center gap-1.5 !px-2.5 lg:!px-3.5"
            role="tab" :aria-selected="!inBattle && store.activeTab === t.key" :title="`${t.full}（${t.hotkey}）`"
            @click="goTab(t.key)"
          >
            <span class="seal-gold seal hidden h-[1.15rem] w-[1.15rem] text-[0.7rem] lg:inline-flex">{{ t.glyph }}</span>
            <span class="lg:hidden">{{ t.label }}</span>
            <span class="hidden lg:inline">{{ t.full }}</span>
            <kbd class="hidden font-sans text-[0.65rem] opacity-50 xl:inline">{{ t.hotkey }}</kbd>
          </button>
        </nav>

        <!-- 资产 / 主题 / 抽屉 -->
        <div class="flex shrink-0 items-center gap-1.5 text-sm tabular-nums sm:gap-2">
          <div class="flex items-center gap-2 rounded-sm border border-line px-2 py-1 text-xs sm:gap-3 sm:px-2.5 sm:text-sm">
            <span class="flex items-center gap-1.5" title="纹银">
              <i class="inline-block h-3 w-3 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f4f1ea,#9a9fa6)] shadow-[0_0_0_1px_rgba(0,0,0,.3)]" />
              <b class="sm:hidden">{{ compact(store.player.silver) }}</b><b class="hidden sm:inline">{{ store.player.silver.toLocaleString() }}</b>
            </span>
            <span class="flex items-center gap-1.5" title="元宝">
              <i class="inline-block h-3 w-3 rotate-45 rounded-[2px] bg-[linear-gradient(135deg,#f3d68b,#b88a32)] shadow-[0_0_0_1px_rgba(0,0,0,.3)]" />
              <b class="text-gold sm:hidden">{{ compact(store.player.goldIngot) }}</b><b class="hidden text-gold sm:inline">{{ store.player.goldIngot.toLocaleString() }}</b>
            </span>
          </div>

          <button class="btn btn-sm !px-2 md:hidden" aria-label="人物卷" @click="toggleDrawer('CHAR')"><UserRound :size="16" /></button>
          <button class="btn btn-sm !px-2 xl:hidden" aria-label="江湖卷" @click="toggleDrawer('WORLD')"><Compass :size="16" /></button>
          <button
            class="btn btn-sm !px-2" :aria-label="store.isMidnightTheme ? '切换为宋宣（浅色）' : '切换为玄墨（深色）'"
            :title="store.isMidnightTheme ? '切换为宋宣' : '切换为玄墨'" @click="store.toggleTheme()"
          >
            <Sun v-if="store.isMidnightTheme" :size="16" />
            <Moon v-else :size="16" />
          </button>
        </div>
      </div>

      <!-- 江湖邸报 -->
      <div
        class="border-t border-line text-xs"
        @mouseenter="bulletinPaused = true" @mouseleave="bulletinPaused = false"
      >
        <div class="mx-auto flex h-[1.85rem] w-full max-w-[112rem] items-center gap-2.5 px-3 md:px-4">
          <span class="font-brush shrink-0 text-sm tracking-widest text-gold">邸报</span>
          <span class="h-3 w-px shrink-0 bg-line" />
          <Transition mode="out-in" enter-active-class="transition duration-300" enter-from-class="opacity-0 translate-y-1" leave-active-class="transition duration-200" leave-to-class="opacity-0 -translate-y-1">
            <p :key="bulletinIdx" class="min-w-0 flex-1 truncate text-ink2" :title="bulletin">{{ bulletin }}</p>
          </Transition>
          <span class="shrink-0 tabular-nums text-ink3">{{ (bulletinIdx % Math.max(1, bulletins.length)) + 1 }}/{{ bulletins.length }}</span>
        </div>
      </div>
    </header>

    <!-- ==================== 主体 ==================== -->
    <main
      class="mx-auto grid min-h-0 w-full max-w-[112rem] flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-[17.5rem_minmax(0,1fr)] md:p-4 xl:grid-cols-[18.5rem_minmax(0,1fr)_20rem]"
    >
      <!-- 左：人物卷（< 768px 为左抽屉） -->
      <aside
        class="fixed inset-y-0 left-0 z-40 w-[min(88vw,22rem)] -translate-x-full p-2 transition-transform duration-300 data-[open=true]:translate-x-0 md:static md:z-auto md:w-auto md:min-h-0 md:translate-x-0 md:p-0"
        :data-open="store.mobileDrawer === 'CHAR'"
      >
        <LeftCharacterSidebar />
      </aside>

      <!-- 中：当前页签 -->
      <section class="h-full min-h-0 overflow-y-auto">
        <Transition mode="out-in" enter-active-class="anim-modal">
          <component :is="currentView" :key="currentTab" />
        </Transition>
      </section>

      <!-- 右：江湖卷（< 1280px 为右抽屉） -->
      <aside
        class="fixed inset-y-0 right-0 z-40 w-[min(88vw,22rem)] translate-x-full p-2 transition-transform duration-300 data-[open=true]:translate-x-0 xl:static xl:z-auto xl:w-auto xl:min-h-0 xl:translate-x-0 xl:p-0"
        :data-open="store.mobileDrawer === 'WORLD'"
      >
        <RightJianghuSidebar />
      </aside>
    </main>

    <!-- 抽屉遮罩 -->
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
      <div v-if="store.mobileDrawer !== 'NONE'" class="fixed inset-0 z-30 bg-[var(--scrim)]" @click="store.mobileDrawer = 'NONE'" />
    </Transition>

    <!-- ==================== 底部导航（< 768px） ==================== -->
    <nav
      class="relative z-30 grid shrink-0 grid-cols-5 border-t border-line bg-[color-mix(in_srgb,var(--bg-1)_94%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      role="tablist" aria-label="主导航"
    >
      <button
        v-for="t in navTabs" :key="t.key" class="flex flex-col items-center gap-1 py-2 text-xs"
        role="tab" :aria-selected="!inBattle && store.activeTab === t.key"
        :class="!inBattle && store.activeTab === t.key ? 'font-bold text-gold' : 'text-ink3'" @click="goTab(t.key)"
      >
        <span class="seal h-7 w-7 text-base" :class="!inBattle && store.activeTab === t.key ? '' : 'seal-gold !text-ink3'">{{ t.glyph }}</span>
        {{ t.label }}
      </button>
    </nav>

    <!-- ==================== 轻提示（可堆叠） ==================== -->
    <div class="pointer-events-none fixed bottom-[5.2rem] left-1/2 z-[70] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col-reverse gap-2 md:bottom-6" role="status" aria-live="polite">
      <div
        v-for="t in store.toasts" :key="t.id"
        class="anim-toast panel-flat flex items-center gap-2.5 bg-[color-mix(in_srgb,var(--bg-1)_96%,transparent)] px-3 py-2 text-sm shadow-xl backdrop-blur-md"
        :class="t.tone === 'danger' ? '!border-[var(--cinnabar-text)]' : t.tone === 'gold' ? '!border-gold' : ''"
      >
        <span class="seal h-6 w-6 text-sm" :class="t.tone === 'danger' ? '' : '!bg-transparent !shadow-none !outline-[var(--gold)] !text-gold'">{{ TOAST_GLYPH[t.tone] }}</span>
        <span :class="t.tone === 'danger' ? 'text-cinnabar' : t.tone === 'gold' ? 'text-gold' : ''">{{ t.text }}</span>
      </div>
    </div>

    <!-- ==================== 词条鉴赏：展开的卷轴 ==================== -->
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-150" leave-to-class="opacity-0">
      <div
        v-if="store.inspectModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px]"
        role="dialog" aria-modal="true" :aria-label="store.inspectModal.title" @click.self="store.inspectModal = null"
      >
        <div class="panel anim-modal w-full max-w-md select-text overflow-hidden" :class="TIER_META[store.inspectModal.tier].cls">
          <div class="h-1.5" style="background: linear-gradient(90deg, transparent, var(--tc), transparent)" />
          <div class="space-y-3 p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <span class="chip tier-chip">{{ TIER_META[store.inspectModal.tier].label }}</span>
                <h4 class="font-brush tier-text mt-2 text-[1.9rem] leading-tight">{{ store.inspectModal.title }}</h4>
                <div class="mt-1 text-xs text-ink3">{{ store.inspectModal.subtitle }}</div>
              </div>
              <button v-focus class="btn btn-sm shrink-0" @click="store.inspectModal = null">合卷</button>
            </div>
            <p class="border-t border-line pt-3 text-[0.9375rem] leading-relaxed">{{ store.inspectModal.desc }}</p>
            <p v-if="store.inspectModal.extra" class="border-l-2 border-[var(--tc)] pl-3 text-sm italic leading-relaxed text-ink2">
              {{ store.inspectModal.extra }}
            </p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ==================== 开局选择 ==================== -->
    <div
      v-if="!store.gameMode" class="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[var(--scrim)] p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label="选择开局"
    >
      <div class="panel anim-modal w-full max-w-2xl space-y-4 p-5 md:p-6">
        <div class="text-center">
          <h2 class="font-brush text-4xl leading-tight text-gold">金庸群侠 · 问道武林</h2>
          <p class="hint mt-1">请选择你的江湖开局</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <button class="well well-hover flex flex-col gap-2 p-4 text-left" @click="store.startGame('NEW')">
            <span class="flex items-center gap-2"><span class="seal h-8 w-8 text-lg">新</span><b class="font-brush text-2xl leading-none">新游戏</b></span>
            <span class="text-sm leading-relaxed text-ink2">
              Lv.1 白衣散人，孤身入世。伙伴靠剧情结识、在客栈以诚相交，好感随章节推进抬高上限，送礼每日有数。
            </span>
            <span class="chip chip-gold self-start">正式规则</span>
          </button>
          <button class="well well-hover flex flex-col gap-2 p-4 text-left" @click="store.startGame('DEMO')">
            <span class="flex items-center gap-2"><span class="seal h-8 w-8 text-lg">演</span><b class="font-brush text-2xl leading-none">演武模式</b></span>
            <span class="text-sm leading-relaxed text-ink2">
              Lv.32，七位伙伴已就位，无送礼与好感限制，可直接体验武库、门派、市井全部玩法。
            </span>
            <span class="chip self-start">体验用 · 后续版本移除</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== 二次确认 ==================== -->
    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-150" leave-to-class="opacity-0">
      <div
        v-if="store.confirmDialog" class="fixed inset-0 z-[65] flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px]"
        role="alertdialog" aria-modal="true" :aria-label="store.confirmDialog.title" @click.self="store.resolveConfirm(false)"
      >
        <div class="panel anim-modal w-full max-w-sm space-y-3 p-5">
          <h4 class="font-brush text-2xl leading-tight" :class="store.confirmDialog.tone === 'danger' ? 'text-cinnabar' : 'text-gold'">
            {{ store.confirmDialog.title }}
          </h4>
          <p class="text-sm leading-relaxed text-ink2">{{ store.confirmDialog.body }}</p>
          <div class="flex justify-end gap-2 pt-1">
            <button v-focus class="btn" @click="store.resolveConfirm(false)">再想想</button>
            <button class="btn" :class="store.confirmDialog.tone === 'danger' ? 'btn-seal' : 'btn-gold'" @click="store.resolveConfirm(true)">
              {{ store.confirmDialog.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
