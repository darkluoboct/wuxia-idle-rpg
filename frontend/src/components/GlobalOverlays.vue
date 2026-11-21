<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import ToastStack from '@/components/ui/ToastStack.vue'
import InspectModal from '@/components/InspectModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import SceneSettingsDialog from '@/components/SceneSettingsDialog.vue'

const LocalStartModal = defineAsyncComponent(() => import('@/components/LocalStartModal.vue'))
const GachaOverlay = defineAsyncComponent(() => import('@/components/GachaOverlay.vue'))
const PrologueStage = defineAsyncComponent(() => import('@/components/PrologueStage.vue'))
const FeatureStoryCard = defineAsyncComponent(() => import('@/components/FeatureStoryCard.vue'))
const AwayReport = defineAsyncComponent(() => import('@/components/AwayReport.vue'))
const Mailbox = defineAsyncComponent(() => import('@/components/Mailbox.vue'))
const TaskJournal = defineAsyncComponent(() => import('@/components/TaskJournal.vue'))
const MapPicker = defineAsyncComponent(() => import('@/components/MapPicker.vue'))

const store = useGameStore()
const inBattle = computed(() => !!store.activeBattle)
const settingsOpen = ref(false)
const mailId = ref('')
const mailBagItem = defineModel<string>('mailBagItem')
const tasksOpen = ref(false)
const journalPage = ref<'quest' | 'play'>('quest')
const journalChoice = ref('guide')
const journalReturn = defineModel<boolean>('journalReturn', { required: true })
function openMail(returnToLetter = false) {
  if (store.activeBattle) return
  if (!returnToLetter) mailId.value = ''
  mailBagItem.value = undefined
  store.mailboxOpen = true
}
function viewAttachment(id: string) {
  store.mailboxOpen = false
  store.selectTab('ARSENAL')
  store.arsenalTab = 'BAG'
  mailBagItem.value = id
}
watch([() => store.activeTab, () => store.arsenalTab], ([main, sub]) => {
  if (main !== 'ARSENAL' || sub !== 'BAG') mailBagItem.value = undefined
})
function openTasks() {
  if (store.activeBattle) return
  if (!journalReturn.value) {
    journalPage.value = 'quest'
    journalChoice.value = 'guide'
  }
  journalReturn.value = false
  tasksOpen.value = true
}
function leaveForActivity() {
  tasksOpen.value = false
  journalReturn.value = true
}
watch(() => store.activeBattle, (battle) => { if (battle && tasksOpen.value) leaveForActivity() })
watch([() => store.player.id, () => store.gameMode, () => store.onlinePhase], () => {
  tasksOpen.value = false
  journalReturn.value = false
  store.mailboxOpen = false
  mailBagItem.value = undefined
})

/* ---------- 新手序章与玩法开放剧情 ---------- */
// 序章演到主线 1-1 开打为止；战斗播放时让出舞台，打赢后由忘机客的剧情卡接上
const inJianghu = computed(() => !IS_MOCK_MODE || !!store.gameMode)
const prologueOpen = computed(() => inJianghu.value && !!store.player.featureGate && !store.featureOpen('TRIAL') && !store.activeBattle)
const featureCardOpen = computed(() => inJianghu.value && !!store.featureCard && !store.activeBattle && !store.gachaReveal)
/** 江湖邸报：剧情卡之后再弹 */
const awayReportOpen = computed(() => inJianghu.value && !!store.awayReport && !store.activeBattle && !store.gachaReveal && !prologueOpen.value && !featureCardOpen.value)

defineExpose({ openMail, openTasks, openSettings: () => { settingsOpen.value = true } })
</script>

<template>
  <ToastStack />

  <InspectModal />

  <!-- ==================== 客栈结缘揭晓动画 ==================== -->
  <GachaOverlay v-if="store.gachaReveal" />

  <!-- ==================== 新手序章 / 玩法开放剧情 ==================== -->
  <PrologueStage v-if="prologueOpen" />
  <FeatureStoryCard v-else-if="featureCardOpen" />
  <AwayReport v-else-if="awayReportOpen" />
  <Mailbox v-else-if="store.mailboxOpen && inJianghu && !inBattle" v-model:selected="mailId"
    @close="store.mailboxOpen = false" @bag="viewAttachment" />
  <TaskJournal v-else-if="tasksOpen && inJianghu && !inBattle" v-model:page="journalPage" v-model:choice="journalChoice"
    @close="tasksOpen = false" @navigate="leaveForActivity" />
  <MapPicker v-else-if="store.mapPickerOpen && inJianghu && !store.activeBattle" />

  <LocalStartModal v-if="IS_MOCK_MODE && !store.gameMode" />

  <ConfirmModal />
  <SceneSettingsDialog v-if="settingsOpen" open @close="settingsOpen = false" />
</template>
