<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import { Compass, Landmark, Mountain, Store, Swords } from 'lucide-vue-next'
import { useGameStore, type MainTab } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import LeftCharacterSidebar from '@/components/LeftCharacterSidebar.vue'
import RightJianghuSidebar from '@/components/RightJianghuSidebar.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import GameHeader from '@/components/GameHeader.vue'
import GlobalOverlays from '@/components/GlobalOverlays.vue'
import { useGameHotkeys } from '@/composables/useGameHotkeys'
import { useInterfacePrefs } from '@/stores/interfacePrefs'
import { useNavBadges } from '@/composables/useNavBadges'
import { isOriginId, ORIGIN_IDS } from '../../shared/origins.ts'
import './styles/shell.css'
import './styles/rails.css'
import './styles/stage.css'
import './styles/patrol.css'
const CharacterSelect = defineAsyncComponent(() => import('@/components/CharacterSelect.vue'))
const CultivateView = defineAsyncComponent(() => import('@/views/CultivateView.vue'))
const JianghuView = defineAsyncComponent(() => import('@/views/JianghuView.vue'))
const ArsenalView = defineAsyncComponent(() => import('@/views/ArsenalView.vue'))
const SectView = defineAsyncComponent(() => import('@/views/SectView.vue'))
const MarketView = defineAsyncComponent(() => import('@/views/MarketView.vue'))

const store = useGameStore()
const prefs = useInterfacePrefs()
const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ back: [] }>()
const choosingCharacter = ref(true)
const mailBagItem = ref<string>()
const journalReturn = ref(false)
const overlays = ref<InstanceType<typeof GlobalOverlays>>()

/** 江湖传音：768px 起常驻左栏人物卷下，手机从顶栏打开 */
const desktopQuery = window.matchMedia('(min-width: 768px)')
const isDesktop = ref(desktopQuery.matches)
const syncDesktop = () => {
  isDesktop.value = desktopQuery.matches
  if (isDesktop.value && store.mobileDrawer === 'CHAT') store.mobileDrawer = 'NONE'
}
desktopQuery.addEventListener('change', syncDesktop)
onUnmounted(() => desktopQuery.removeEventListener('change', syncDesktop))
const hasEnteredJianghu = ref(false)

function enterJianghu() {
  choosingCharacter.value = false
  hasEnteredJianghu.value = true
}

function chooseCharacter() {
  store.closeBattleStage()
  store.mobileDrawer = 'NONE'
  choosingCharacter.value = true
}

/** 退出、换角色、回开局都先确认一次，免得误点；默认焦点在「取消」 */
function confirmChooseCharacter() {
  store.askConfirm({
    title: '返回选择角色', body: '离开江湖，回到选择角色界面。已开始的挂机不会中断。',
    confirmText: '返回选择角色', tone: 'gold', onConfirm: chooseCharacter,
  })
}
function confirmLogout() {
  store.askConfirm({
    title: '退出登录', body: '退出当前账号，回到登录界面。已开始的挂机照常累计，最多攒 24 小时，下次登录再领取。',
    confirmText: '退出登录', tone: 'gold', onConfirm: () => store.logout(),
  })
}
function confirmBackToTitle() {
  store.askConfirm({
    title: '存档并返回开局', body: '保存当前进度，回到开局界面，之后点「继续」接着玩。',
    confirmText: '存档并返回', tone: 'gold', onConfirm: () => store.backToTitle(),
  })
}

function returnFromSelection() {
  if (hasEnteredJianghu.value && store.characterList.some((role) => role.id === store.player.id)) enterJianghu()
  else emit('back')
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
const arsenalWorkspace = computed(() => currentTab.value === 'ARSENAL')
const wideWorkspace = computed(() => currentTab.value !== 'CULTIVATE' && !arsenalWorkspace.value)
watch(currentTab, () => {
  if (store.mobileDrawer === 'CHAR' || store.mobileDrawer === 'WORLD') store.mobileDrawer = 'NONE'
})
/** 门派、市井随剧情开放，未开放时不显示 */
const openTabs = computed(() => navTabs.filter((t) => store.mainTabOpen(t.key)))
const badges = useNavBadges(store)
const stage = ref<HTMLElement>()
watch([currentTab, inBattle], () => { if (stage.value) stage.value.scrollTop = 0 })
useGameHotkeys(store,
  () => props.visible && store.onlinePhase === 'ready' && !choosingCharacter.value && (!IS_MOCK_MODE || !!store.gameMode),
  () => openTabs.value)

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  if (IS_MOCK_MODE && (mode === 'new' || mode === 'demo')) {
    // ?mode=new&origin=yujia 直接以某个家世开局，不给就用第一个
    const origin = params.get('origin')
    store.startGame(mode === 'new' ? 'NEW' : 'DEMO', isOriginId(origin) ? origin : ORIGIN_IDS[0])

    enterJianghu()
  }
})
</script>

<template>
  <CharacterSelect v-if="visible && (choosingCharacter || store.onlinePhase === 'create')" :can-return="hasEnteredJianghu" @enter="enterJianghu" @back="returnFromSelection" />
  <div v-else-if="visible && store.onlinePhase === 'ready'" class="wuxia-shell" :class="{ 'scene-motion-off': !prefs.sceneMotion }">
    <GameHeader :tabs="openTabs" :badges="badges" :in-battle="inBattle" :wide-workspace="wideWorkspace"
      :arsenal-workspace="arsenalWorkspace" :journal-return="journalReturn" :unread-mail="store.unreadMail"
      :chat-private-unread="store.chatPrivateUnread" :chat-public-unread="store.chatPublicUnread"
      @select="store.selectTab" @home="confirmBackToTitle" @choose="confirmChooseCharacter" @logout="confirmLogout"
      @mail="overlays?.openMail()" @tasks="overlays?.openTasks()" @settings="overlays?.openSettings()" />

    <div v-if="store.journeyMap" class="panel z-20 flex items-center gap-2 p-2 text-sm" :class="wideWorkspace ? 'shrink-0 justify-end' : 'wuxia-journey'">
      <span>{{ store.journeySeconds ? `前往${store.journeyMap.name} · ${store.journeySeconds} 秒` : `可抵达${store.journeyMap.name}` }}</span>
      <button class="btn btn-sm btn-gold" :disabled="store.journeySeconds > 0 || store.onlineActionBusy" @click="store.moveMap(store.journeyMap.id, 'arrive')">抵达</button>
    </div>

    <main class="wuxia-layout" :class="{ 'wuxia-arsenal-workspace': arsenalWorkspace, 'wuxia-wide-workspace': wideWorkspace }">
      <aside id="character-rail" class="wuxia-rail character-rail" aria-label="人物卷" :data-open="store.mobileDrawer === 'CHAR'">
        <div class="rail-frame character-frame">
          <LeftCharacterSidebar />
          <ChatPanel v-if="isDesktop" class="rail-chat" />
        </div>
      </aside>

      <section ref="stage" class="wuxia-stage" :class="{ 'wuxia-interior': currentTab !== 'CULTIVATE' || inBattle }" aria-label="江湖舞台">
        <ArsenalView v-if="arsenalWorkspace" :mail-item="mailBagItem" @back-to-mail="overlays?.openMail(true)" />
        <component :is="currentView" v-else :key="currentTab" />
      </section>

      <aside id="world-rail" class="wuxia-rail world-rail" aria-label="江湖卷" :data-open="store.mobileDrawer === 'WORLD'">
        <div class="rail-frame">
          <RightJianghuSidebar />
        </div>
      </aside>
    </main>



    <div v-if="store.canRetryOnline" class="panel fixed right-3 top-16 z-40 flex items-center gap-2 p-2 text-sm">
      <span>连接中断</span>
      <button class="btn btn-sm btn-gold" :disabled="store.onlineRetryBusy" @click="store.retryOnlineAction()">重试这次操作</button>
    </div>

    <!-- 抽屉遮罩 -->
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-200" leave-to-class="opacity-0">
      <div
        v-if="store.mobileDrawer !== 'NONE'" class="fixed inset-0 z-[var(--z-scrim)] bg-[var(--scrim)]"
        :class="wideWorkspace && store.mobileDrawer !== 'CHAT' ? '' : store.mobileDrawer === 'WORLD' ? 'xl:hidden' : 'md:hidden'" @click="store.mobileDrawer = 'NONE'"
      />
    </Transition>

    <!-- ==================== 江湖传音（< 768px，从顶栏打开） ==================== -->
    <div v-if="!isDesktop && store.mobileDrawer === 'CHAT'" id="chat-sheet" class="chat-sheet rail-frame" role="dialog" aria-label="江湖传音">
      <ChatPanel closable @close="store.mobileDrawer = 'NONE'" />
    </div>

    <GlobalOverlays ref="overlays" v-model:mail-bag-item="mailBagItem" v-model:journal-return="journalReturn" />
  </div>
</template>
