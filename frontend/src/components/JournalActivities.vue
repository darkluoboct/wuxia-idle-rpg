<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COOP_RAIDS, ONLINE_STORY_CHAPTERS, STORY_CHAPTERS } from '@/config/gameData'
import { CHARACTER_THUMBNAILS, portraitByName } from '@/config/characterPortraits'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { FTUE_VOLUMES } from '../../../shared/ftueQuests.ts'
import { gaibangSilverGain } from '../../../shared/gaibang.ts'
import { TRIAL_STAGES } from '../../../shared/trialStages.ts'
import RewardTray from './RewardTray.vue'
import TrialRewardTray from './TrialRewardTray.vue'
import RaidRewardTray from './RaidRewardTray.vue'
import { featureRequirementText } from '../../../shared/features.ts'

const props = defineProps<{ page: 'quest' | 'play'; targetStage?: number }>()
const emit = defineEmits<{ navigate: []; trial: [stage: number]; back: [] }>()
const choice = defineModel<string>({ required: true })
const store = useGameStore()
const quest = computed(() => store.ftueQuest)
const chapters = IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS
const cleared = computed(() => chapters.filter((ch) => IS_MOCK_MODE
  ? ch.id < store.player.maxChapterId : store.claimedNodeIds.includes(ch.id)))
const chapter = computed(() => chapters.find((ch) => ch.id === store.player.maxChapterId && !cleared.value.includes(ch))
  ?? chapters.find((ch) => !cleared.value.includes(ch)))
const done = computed(() => store.daily.tasks.filter((t) => t.done).length)
const raid = computed(() => COOP_RAIDS[IS_MOCK_MODE ? 'shaoshi' : store.selectedRaidId])
const stage = computed(() => TRIAL_STAGES.find((s) => s.id === (props.targetStage ?? store.trial.maxStageId)) ?? TRIAL_STAGES[TRIAL_STAGES.length - 1])
const menu = computed(() => props.page === 'quest' ? [
  { id: 'guide', name: quest.value?.title ?? '江湖行历', sub: quest.value ? (store.ftueReady ? '可领赏' : '进行中') : '已圆满' },
  { id: 'story', name: '射雕主线', sub: chapter.value?.title ?? '已通关' },
  ...(store.featureOpen('DAILY') ? [{ id: 'daily', name: '每日江湖事', sub: store.daily.claimed ? '已领赏' : `今日已办 ${done.value} / ${store.daily.tasks.length}` }] : []),
  ...(IS_MOCK_MODE ? [{ id: 'adventure', name: '江湖奇遇', sub: store.pendingAdventure?.title ?? '寻访奇遇' }] : []),
] : [
  ...(store.jianghuTabOpen('TRIAL') ? [{ id: 'trial', name: '三十关历练', sub: stage.value.title }] : []),
  ...(store.jianghuTabOpen('RAID') ? [{ id: 'raid', name: '结义副本', sub: raid.value.title }] : []),
])
const entry = computed(() => menu.value.find((e) => e.id === choice.value) ?? menu.value[0])
const speaker = computed(() => entry.value?.id === 'guide' ? quest.value?.speaker : entry.value?.id === 'trial' ? stage.value.boss.name : entry.value?.id === 'raid' ? raid.value.boss.name : '')
const portrait = computed(() => speaker.value && (portraitByName(speaker.value, 'thumb')
  ?? (entry.value?.id === 'raid' && raid.value.boss.portrait === 'monk' ? CHARACTER_THUMBNAILS.npc_monk : undefined)))
function enter() {
  if (entry.value?.id === 'guide' && quest.value?.jumpSub === 'TRIAL' && typeof quest.value.targetValue === 'number' && store.jianghuTabOpen('TRIAL')) {
    emit('trial', quest.value.targetValue)
    return
  }
  if (entry.value?.id === 'guide') store.gotoFtueTarget()
  else if (entry.value?.id === 'story') { store.selectTab('JIANGHU'); store.jianghuTab = 'STORY' }
  else if (entry.value?.id === 'raid') store.openRaidLobby()
  else { store.selectTab('JIANGHU'); store.jianghuTab = 'TRIAL' }
  emit('navigate')
}
</script>

<template>
  <div class="journal-columns">
    <aside class="journal-list" :aria-label="page === 'quest' ? '任务目录' : '玩法目录'">
      <h3 class="sec-title">{{ page === 'quest' ? '任务目录' : '玩法目录' }}</h3>
      <button v-for="row in menu" :key="row.id" class="journal-row" :aria-pressed="row.id === entry?.id" @click="choice = row.id">
        <b>{{ row.name }}</b><small>{{ row.sub }}</small>
      </button>
    </aside>
    <article v-if="entry" :key="entry.id" class="journal-sheet">
      <div class="journal-scroll">
        <p class="journal-kicker">{{ entry.id === 'guide' && quest ? FTUE_VOLUMES[quest.volume] : entry.name }}</p>
        <h2>{{ entry.id === 'trial' ? stage.title : entry.id === 'raid' ? raid.title : entry.name }}</h2>
        <figure v-if="portrait" class="journal-figure"><img :src="portrait" :alt="speaker + '立绘'"><figcaption>{{ speaker }}</figcaption></figure>
        <template v-if="entry.id === 'guide'">
          <template v-if="quest"><blockquote>{{ quest.speaker }}「{{ quest.line }}」</blockquote><h3 class="sec-title">当前目标</h3><p>{{ quest.subtitle }}</p></template>
          <p v-else>两卷行历都已走完。</p>
          <p v-if="store.upcomingFeature" class="hint">下一个机缘 · {{ store.upcomingFeature.name }} · {{ featureRequirementText(store.upcomingFeature.id) }}后开放</p>
        </template>
        <template v-else-if="entry.id === 'story'">
          <p v-if="chapter">第 {{ chapter.code }} 关 · {{ chapter.title }} · 推荐 {{ chapter.recLevel }} 级</p>
          <p class="hint">已通关 {{ cleared.length }} / {{ chapters.length }} 关<template v-if="cleared.length"> · 上一关 {{ cleared.at(-1)?.title }}</template></p>
        </template>
        <template v-else-if="entry.id === 'adventure'">
          <template v-if="store.pendingAdventure">
            <h3 class="sec-title">{{ store.pendingAdventure.title }}</h3>
            <p class="hint">{{ store.pendingAdventure.location }}</p><p>{{ store.pendingAdventure.description }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button v-for="option in store.pendingAdventure.options" :key="option.key" class="btn"
                :disabled="!option.canSelect || store.isBattlePlaying" @click="store.resolveAdventure(option.key)">
                {{ option.label }}<small v-if="option.requirementText">{{ option.requirementText }}</small>
              </button>
            </div>
          </template>
          <p v-else>游历江湖，寻访当前主线已开放的奇遇。</p>
        </template>
        <template v-else-if="entry.id === 'daily'"><p class="hint">子时刷新 · 今日已办 {{ done }} / {{ store.daily.tasks.length }}</p>
          <ul class="space-y-2 py-3"><li v-for="task in store.daily.tasks" :key="task.id" :class="task.done ? 'text-jade' : 'text-ink2'">{{ task.done ? '✓' : '○' }} {{ task.label }}</li></ul>
          <p v-if="store.daily.ticket === 'OPEN'" class="hint">领赏另得今日鬼市红封签。</p><p v-else-if="store.daily.ticket === 'HELD'" class="hint">已持今日红封签。</p>
        </template>
        <template v-else-if="entry.id === 'trial'"><p class="hint">{{ stage.code }} · 对手 {{ stage.boss.name }}</p><h3 class="sec-title">破敌要诀</h3><p>{{ stage.mechanicTip }}</p></template>
        <template v-else><p class="hint">{{ IS_MOCK_MODE ? '结义镜像同行' : '三人同行' }}</p><h3 class="sec-title">阵中对手</h3><p>{{ [raid.boss, ...raid.guards].map((enemy) => enemy.name).join('、') }}</p><p>{{ raid.description }}</p></template>
      </div>
      <RewardTray v-if="entry.id === 'guide' && quest" :key="quest.id" label="行历赏赐" :source="quest.title" :rewards="{ qiExp: quest.rewardQi, silver: gaibangSilverGain(store.player, quest.rewardSilver), pills: quest.rewardPillId ? { [quest.rewardPillId]: 1 } : {} }" />
      <RewardTray v-else-if="entry.id === 'daily'" label="今日赏赐" source="每日江湖事" :rewards="{ ingot: store.daily.reward }" />
      <TrialRewardTray v-else-if="entry.id === 'trial'" :stage="stage" />
      <RaidRewardTray v-else-if="entry.id === 'raid'" />
      <footer class="journal-actions">
        <template v-if="entry.id === 'guide' && quest"><small>{{ store.ftueReady ? '目标已完成' : '进行中' }}</small>
          <button v-if="store.ftueReady" class="btn btn-seal" :aria-busy="store.isSubmitting('/ftue/claim')" :disabled="store.onlineActionBusy" @click="store.claimFtueReward()">领赏</button>
          <button v-else class="btn btn-gold" @click="enter">前往{{ quest.jumpSub === 'TRIAL' ? '历练' : '目标' }}</button>
        </template>
        <button v-else-if="entry.id === 'story'" class="btn btn-gold" @click="enter">前往主线</button>
        <button v-else-if="entry.id === 'adventure' && !store.pendingAdventure" class="btn btn-gold" @click="store.triggerRandomAdventure()">寻访奇遇</button>
        <template v-else-if="entry.id === 'daily'"><small>{{ store.daily.claimed ? '今日赏赐已领取' : `已办 ${done} / ${store.daily.tasks.length}` }}</small>
          <button v-if="!store.daily.claimed" class="btn btn-seal" :aria-busy="store.isSubmitting('/daily/claim')" :disabled="done !== store.daily.tasks.length || store.onlineActionBusy" @click="store.claimDailyIngot()">领赏</button>
        </template>
        <template v-else-if="page === 'play'">
          <button v-if="targetStage" class="btn btn-sm mr-auto" @click="emit('back')">返回任务</button>
          <button class="btn btn-gold" @click="enter">{{ entry.id === 'raid' ? '查看组队准备' : '进入历练' }}</button>
        </template>
      </footer>
    </article>
    <div v-else class="journal-sheet justify-center text-center text-ink3">玩法随主线剧情开放。</div>
  </div>
</template>
