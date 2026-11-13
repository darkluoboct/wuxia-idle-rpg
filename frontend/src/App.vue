<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { Compass, House, Landmark, LogOut, Mountain, Settings, Store, Swords, UserRound } from 'lucide-vue-next'
import { useGameStore, type MainTab } from '@/stores/gameStore'
import { IS_GUEST_ENTRY, IS_MOCK_MODE } from '@/network/apiClient'
import { TIER_META } from '@/config/uiMeta'
import LeftCharacterSidebar from '@/components/LeftCharacterSidebar.vue'
import JianghuQuestScroll from '@/components/JianghuQuestScroll.vue'
import RightJianghuSidebar from '@/components/RightJianghuSidebar.vue'
import OnlineEntry from '@/components/OnlineEntry.vue'
import CharacterSelect from '@/components/CharacterSelect.vue'
import GachaOverlay from '@/components/GachaOverlay.vue'
import CultivateView from '@/views/CultivateView.vue'
import JianghuView from '@/views/JianghuView.vue'
import ArsenalView from '@/views/ArsenalView.vue'
import SectView from '@/views/SectView.vue'
import MarketView from '@/views/MarketView.vue'

const store = useGameStore()
const showingLocalEntry = ref(IS_MOCK_MODE && !IS_GUEST_ENTRY)
const choosingCharacter = ref(true)
const hasEnteredJianghu = ref(false)
const currentSave = computed(() => store.savedGame?.playerId === store.player.id ? store.savedGame : null)

function enterJianghu() {
  choosingCharacter.value = false
  hasEnteredJianghu.value = true
}

function chooseCharacter() {
  store.closeBattleStage()
  store.mobileDrawer = 'NONE'
  choosingCharacter.value = true
}

function returnFromSelection() {
  if (hasEnteredJianghu.value && store.characterList.some((role) => role.id === store.player.id)) enterJianghu()
  else showingLocalEntry.value = true
}

watch(() => store.onlinePhase, (phase) => {
  if (phase !== 'ready') choosingCharacter.value = true
  if (phase === 'login') hasEnteredJianghu.value = false
})

const navTabs: { key: MainTab; label: string; icon: Component; hotkey: string; view: Component }[] = [
  { key: 'CULTIVATE', label: '修行', icon: Landmark, hotkey: '1', view: CultivateView },
  { key: 'JIANGHU', label: '江湖', icon: Compass, hotkey: '2', view: JianghuView },
  { key: 'ARSENAL', label: '武库', icon: Swords, hotkey: '3', view: ArsenalView },
  { key: 'SECT', label: '门派', icon: Mountain, hotkey: '4', view: SectView },
  { key: 'MARKET', label: '市井', icon: Store, hotkey: '5', view: MarketView },
]

/** 战斗播放时中央始终显示演武台，此时不高亮任何页签 */
const inBattle = computed(() => !!store.activeBattle)
const currentTab = computed(() => (inBattle.value ? 'CULTIVATE' : store.activeTab))
const currentView = computed(() => navTabs.find((t) => t.key === currentTab.value)!.view)
const stage = ref<HTMLElement>()
watch([currentTab, inBattle], () => { if (stage.value) stage.value.scrollTop = 0 })
const toggleDrawer = (d: 'CHAR' | 'WORLD') => (store.mobileDrawer = store.mobileDrawer === d ? 'NONE' : d)

/* ---------- 键盘 ---------- */
function handleKeydown(e: KeyboardEvent) {
  if (store.onlinePhase !== 'ready' || choosingCharacter.value) return
  if (IS_MOCK_MODE && (!store.gameMode || store.gachaReveal)) return
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
  if (hit) store.selectTab(hit.key)
  else if (e.code === 'Space' && store.activeBattle && tag !== 'BUTTON' && tag !== 'SUMMARY') {
    e.preventDefault()
    if (store.isBattlePlaying) store.skipBattleToEnd()
    else store.closeBattleStage()
  }
}

onMounted(() => {
  const mode = new URLSearchParams(window.location.search).get('mode')
  if (IS_MOCK_MODE && (mode === 'new' || mode === 'demo')) {
    store.startGame(mode === 'new' ? 'NEW' : 'DEMO')
    showingLocalEntry.value = false
    enterJianghu()
  }
  document.documentElement.classList.toggle('theme-midnight', store.isMidnightTheme)
  window.addEventListener('keydown', handleKeydown)
  void store.resumeOnline()
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

/** 窄屏资产读数：18600 → 1.9万 */
const compact = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n))

const vFocus = { mounted: (el: HTMLElement) => el.focus() }
const TOAST_GLYPH = { gold: '喜', danger: '警', info: '讯' } as const
</script>

<template>
  <OnlineEntry v-if="showingLocalEntry || (store.onlinePhase !== 'ready' && store.onlinePhase !== 'create')" @guest="showingLocalEntry = false" />
  <CharacterSelect v-else-if="choosingCharacter || store.onlinePhase === 'create'" :can-return="hasEnteredJianghu" @enter="enterJianghu" @back="returnFromSelection" />
  <div v-else class="wuxia-shell">
    <header class="wuxia-header">
      <div class="wuxia-wordmark" :title="IS_MOCK_MODE ? '问道武林 · 试玩模式' : '问道武林 · 江湖在线'">
        <h1 class="font-brush">金庸群侠</h1>
        <span class="seal vertical-rl">问道</span>
      </div>

      <div class="wuxia-navigation">
        <nav class="wuxia-nav" role="tablist" aria-label="主导航">
          <button
            v-for="t in navTabs" :key="t.key" role="tab" :aria-selected="!inBattle && store.activeTab === t.key"
            :title="`${t.label}（${t.hotkey}）`" :aria-keyshortcuts="t.hotkey" @click="store.selectTab(t.key)"
          >
            <component :is="t.icon" aria-hidden="true" />
            <span>{{ t.label }}</span>
          </button>
        </nav>
        <button
          class="wuxia-appearance" :aria-label="store.isMidnightTheme ? '切换为宋宣（浅色）' : '切换为玄墨（深色）'"
          :title="store.isMidnightTheme ? '切换为宋宣' : '切换为玄墨'" @click="store.toggleTheme()"
        ><Settings aria-hidden="true" /><span>外观</span></button>
      </div>

      <div class="wuxia-assets tabular-nums">
        <div class="wuxia-currency" aria-label="资产">
          <span :title="`纹银 ${store.player.silver.toLocaleString()}`">
            <i class="art art-coin" aria-hidden="true" />
            <b class="sm:hidden">{{ compact(store.player.silver) }}</b><b class="hidden sm:inline">{{ store.player.silver.toLocaleString() }}</b>
          </span>
          <span :title="`元宝 ${store.player.goldIngot.toLocaleString()}`">
            <i class="art art-ingot" aria-hidden="true" />
            <b class="sm:hidden">{{ compact(store.player.goldIngot) }}</b><b class="hidden sm:inline">{{ store.player.goldIngot.toLocaleString() }}</b>
          </span>
        </div>
        <button v-if="IS_MOCK_MODE" class="wuxia-icon" aria-label="存档并返回开局" title="存档并返回开局" @click="store.backToTitle()"><House /></button>
        <button class="wuxia-icon" aria-label="选择角色" title="选择角色" @click="chooseCharacter"><UserRound /></button>
        <button v-if="!IS_MOCK_MODE" class="wuxia-icon" aria-label="退出登录" title="退出登录" :disabled="store.authBusy" @click="store.logout()"><LogOut /></button>
        <button class="wuxia-icon md:hidden" aria-label="查看角色" title="查看角色" aria-controls="character-rail" :aria-expanded="store.mobileDrawer === 'CHAR'" @click="toggleDrawer('CHAR')"><UserRound /></button>
        <button class="wuxia-icon xl:hidden" aria-label="任务与战报" title="任务与战报" aria-controls="world-rail" :aria-expanded="store.mobileDrawer === 'WORLD'" @click="toggleDrawer('WORLD')"><Compass /></button>
        <button
          class="wuxia-icon md:hidden" :aria-label="store.isMidnightTheme ? '切换为宋宣（浅色）' : '切换为玄墨（深色）'"
          :title="store.isMidnightTheme ? '切换为宋宣' : '切换为玄墨'" @click="store.toggleTheme()"
        ><Settings /></button>
      </div>
    </header>

    <main class="wuxia-layout">
      <aside id="character-rail" class="wuxia-rail character-rail" aria-label="人物卷" :data-open="store.mobileDrawer === 'CHAR'">
        <div class="rail-frame"><LeftCharacterSidebar /></div>
      </aside>

      <section ref="stage" class="wuxia-stage" :class="{ 'wuxia-interior': currentTab !== 'CULTIVATE' || inBattle }" aria-label="江湖舞台">
        <component :is="currentView" :key="currentTab" />
      </section>

      <aside id="world-rail" class="wuxia-rail world-rail" aria-label="江湖卷" :data-open="store.mobileDrawer === 'WORLD'">
        <div class="rail-frame">
          <JianghuQuestScroll />
          <RightJianghuSidebar />
        </div>
      </aside>
    </main>

    <div v-if="store.journeyMap" class="panel fixed bottom-4 right-3 z-20 flex items-center gap-2 p-2 text-sm">
      <span>{{ store.journeySeconds ? `前往${store.journeyMap.name} · ${store.journeySeconds} 秒` : `可抵达${store.journeyMap.name}` }}</span>
      <button class="btn btn-sm btn-gold" :disabled="store.journeySeconds > 0 || store.onlineActionBusy" @click="store.moveMap(store.journeyMap.id, 'arrive')">抵达</button>
    </div>

    <div v-if="store.canRetryOnline" class="panel fixed right-3 top-16 z-40 flex items-center gap-2 p-2 text-sm">
      <span>连接中断</span>
      <button class="btn btn-sm btn-gold" :disabled="store.onlineRetryBusy" @click="store.retryOnlineAction()">重试这次操作</button>
    </div>

    <!-- 抽屉遮罩 -->
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
      <div
        v-if="store.mobileDrawer !== 'NONE'" class="fixed inset-0 z-30 bg-[var(--scrim)]"
        :class="store.mobileDrawer === 'CHAR' ? 'md:hidden' : 'xl:hidden'" @click="store.mobileDrawer = 'NONE'"
      />
    </Transition>

    <!-- ==================== 底部导航（< 768px） ==================== -->
    <nav class="wuxia-mobile-nav" role="tablist" aria-label="主导航">
      <button
        v-for="t in navTabs" :key="t.key"
        role="tab" :aria-selected="!inBattle && store.activeTab === t.key"
        @click="store.selectTab(t.key)"
      >
        <component :is="t.icon" aria-hidden="true" />
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
              <button v-focus class="btn btn-sm shrink-0" @click="store.inspectModal = null">关闭</button>
            </div>
            <p class="border-t border-line pt-3 text-[0.9375rem] leading-relaxed">{{ store.inspectModal.desc }}</p>
            <p v-if="store.inspectModal.extra" class="border-l-2 border-[var(--tc)] pl-3 text-sm italic leading-relaxed text-ink2">
              {{ store.inspectModal.extra }}
            </p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ==================== 客栈结缘揭晓动画 ==================== -->
    <GachaOverlay v-if="IS_MOCK_MODE" />

    <!-- ==================== 开局选择 ==================== -->
    <div
      v-if="IS_MOCK_MODE && !store.gameMode" class="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[var(--scrim)] p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label="选择开局"
    >
      <div class="panel anim-modal w-full max-w-2xl space-y-4 p-5 md:p-6">
        <div class="text-center">
          <h2 class="font-brush text-4xl leading-tight text-gold">金庸群侠 · 问道武林</h2>
          <p class="hint mt-1">请选择你的江湖开局</p>
        </div>
        <!-- 继续上次的存档 -->
        <div v-if="currentSave" class="well flex flex-wrap items-center justify-between gap-3 p-4 !border-gold">
          <div>
            <b class="font-brush text-2xl leading-none text-gold">继续江湖</b>
            <p class="mt-1 text-sm text-ink2">
              {{ currentSave.mode === 'NEW' ? '新游戏' : '演武模式' }} · Lv.{{ currentSave.level }} · 主线 {{ currentSave.node }} ·
              {{ new Date(currentSave.savedAt).toLocaleString() }}
            </p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm" title="删除本地存档" @click="store.deleteSave()">删除存档</button>
            <button class="btn btn-seal" @click="store.continueGame()">继续</button>
          </div>
        </div>
        <p v-if="store.savedGame" class="text-center text-xs text-cinnabar">开始新的游戏或演武模式，将覆盖浏览器中的试玩存档。</p>
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
            <button v-focus class="btn" @click="store.resolveConfirm(false)">取消</button>
            <button class="btn" :class="store.confirmDialog.tone === 'danger' ? 'btn-seal' : 'btn-gold'" @click="store.resolveConfirm(true)">
              {{ store.confirmDialog.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
