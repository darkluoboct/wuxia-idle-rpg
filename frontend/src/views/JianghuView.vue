<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useGameClock } from '@/composables/useGameClock'
import { storeToRefs } from 'pinia'
import { Lock } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { ADVENTURES, EXPANSION_VOLUMES_PREVIEW, getChapterDrops, STORY_ARCS, type AdventureConfig } from '@/config/gameData'
import { openToOrigin } from '../../../shared/origins.ts'
import { canChooseStorySnake, STORY_SNAKE_ADVENTURE, storyEncounter } from '../../../shared/storySnake.ts'
import { storyFirstClearReward } from '../../../shared/storyData.ts'
import { STANCE_META, TIER_META, stanceRelation } from '@/config/uiMeta'
import PortraitCard from '@/components/PortraitCard.vue'
import RaidLobbyPanel from '@/components/RaidLobbyPanel.vue'
import RaidRewardTray from '@/components/RaidRewardTray.vue'
import TrialWorkbench from '@/components/TrialWorkbench.vue'
import { trialPartId, TRIAL_STAGES } from '../../../shared/trialStages.ts'
import { storyGateBlock, storyKey, trialKey } from '../../../shared/stageScripts.ts'

const XiangyangDefense = defineAsyncComponent(() => import('@/components/XiangyangDefense.vue'))
const BountyBoard = defineAsyncComponent(() => import('@/components/BountyBoard.vue'))
const MapIntel = defineAsyncComponent(() => import('@/components/MapIntel.vue'))

const store = useGameStore()
const mode = store.modeCapabilities
const { jianghuTab: sub } = storeToRefs(store)
const tabs = [
  { k: 'TRIAL', l: '三十关历练' },
  { k: 'STORY', l: '射雕主线' },
  { k: 'MAPS', l: '江湖地图' },
  { k: 'RAID', l: '结义副本' },
  { k: 'XIANGYANG', l: '襄阳守城' },
  { k: 'BOUNTY', l: '江湖悬赏榜' },
] as const
// 悬赏榜只在联机；历练、地图、副本、悬赏随剧情开放
const visibleTabs = computed(() => tabs.filter((tab) => (mode.hasBounty || tab.k !== 'BOUNTY') && store.jianghuTabOpen(tab.k)))

const chapters = mode.storyChapters
const storyGroups = STORY_ARCS.map((arc) => ({ ...arc, nodes: chapters.filter((node) => node.chapter === arc.chapter) }))
const storyGuards = computed(() => Object.fromEntries(chapters.map((chapter) => [
  chapter.id, storyEncounter(chapter, store.player.storySnakeChoice).enemyGuards?.map((guard) => guard.name).join('、'),
])))
type State = 'CLEARED' | 'CURRENT' | 'LOCKED'
function stateOf(id: number): State | 'OPEN' {
  const max = store.player.maxChapterId
  if (id > max) return 'LOCKED'
  if (mode.isLocal ? id < max : store.claimedNodeIds.includes(id)) return 'CLEARED'
  return id === max ? 'CURRENT' : 'OPEN'
}
const cleared = computed(() => chapters.filter((chapter) => stateOf(chapter.id) === 'CLEARED').length)
/** 卡片上的一句剧情：通关前是前情，通关后是小结 */
const blurbs = computed(() => Object.fromEntries(chapters.map((ch) => [ch.id, store.stageBlurb(storyKey(ch.code))])))
/** 新角色的主线要先过时间线上紧挨着的历练（docs/27 §四） */
const gates = computed(() => Object.fromEntries(chapters.map((ch) => [ch.id, storyGateBlock(ch, store.player)])))
function gotoGate(stage: NonNullable<ReturnType<typeof storyGateBlock>>) {
  sub.value = 'TRIAL'
  store.stageFocus = trialKey(stage.code)
}

const trialCleared = computed(() => TRIAL_STAGES.filter(({ id }) =>
  id < store.trial.maxStageId || store.trial.rewardedStageIds.includes(id)).length)
const progressPct = computed(() => sub.value === 'TRIAL'
  ? (trialCleared.value / TRIAL_STAGES.length) * 100
  : (cleared.value / chapters.length) * 100)
const progressLabel = computed(() => sub.value === 'TRIAL'
  ? `${trialCleared.value} / ${TRIAL_STAGES.length}`
  : `${cleared.value} / ${chapters.length}`)
const wearsRetreatBoots = computed(() => store.currentLoadout.bootsId === trialPartId('qianying_mixing', 'BOOTS'))
const clock = useGameClock()
watch([() => clock.minuteTick, () => clock.isPageVisible], ([, visible]) => {
  if (visible) store.mockSettlePatrol(clock.now)
}, { immediate: true })

const currentArc = computed(() => chapters.find(({ id }) => id === store.player.maxChapterId)?.chapter
  ?? chapters[chapters.length - 1].chapter)
const pickedArc = ref<number>()
const focusedArc = computed(() => storyGroups.find(({ chapter }) => chapter === (pickedArc.value ?? currentArc.value))!)
const expandedStory = ref<number>()
const storyScroll = ref<HTMLElement>()
watch(() => focusedArc.value.chapter, () => {
  expandedStory.value = undefined
  if (storyScroll.value) storyScroll.value.scrollTop = 0
})
// 剧情结语点「前往下一回」：翻到那一章，展开那一回
watch(() => store.stageFocus, (key) => {
  const node = key?.startsWith('N') && chapters.find((n) => storyKey(n.code) === key)
  if (!node) return
  store.stageFocus = undefined
  pickedArc.value = node.chapter
  void Promise.resolve().then(() => {
    expandedStory.value = node.id
    storyScroll.value?.querySelector(`[data-node="${node.id}"]`)?.scrollIntoView({ block: 'nearest' })
  })
}, { immediate: true })

const CN_NUM = ['一', '二', '三', '四', '五']
const arcCleared = (nodes: typeof chapters) => nodes.filter((n) => stateOf(n.id) === 'CLEARED').length
/** 别家的家事不列出来 */
const sideQuests = (nodeId: number) => ADVENTURES.filter((a) => a.afterNodeId === nodeId && openToOrigin(a, store.player))
const visibleSideQuests = (nodeId: number) => sideQuests(nodeId).filter((a) => !mode.inlineAdventures || a.id !== STORY_SNAKE_ADVENTURE.id)
const firstClearRewards = Object.fromEntries(chapters.map((ch) => {
  const reward = storyFirstClearReward(ch)
  return [ch.id, { ...reward, drops: getChapterDrops({ dropItemIds: reward.items, dropSkillIds: reward.skills }) }]
}))
function advState(a: AdventureConfig): 'DONE' | 'PENDING' | 'OPEN' | 'LOCKED' {
  if (store.resolvedAdventureIds.includes(a.id)) return 'DONE'
  if (!mode.isLocal) return !a.afterNodeId || store.claimedNodeIds.includes(a.afterNodeId) ? 'OPEN' : 'LOCKED'
  if (store.pendingAdventure?.templateId === a.id || store.adventureQueue.includes(a.id)) return 'PENDING'
  return a.afterNodeId < store.player.maxChapterId ? 'OPEN' : 'LOCKED'
}
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist" aria-label="江湖栏目">
          <button v-for="t in visibleTabs" :key="t.k" class="tab" role="tab" :aria-selected="sub === t.k" @click="sub = t.k">{{ t.l }}</button>
        </div>
        <div v-if="sub === 'TRIAL' || sub === 'STORY'" class="flex items-center gap-2 text-xs text-ink3">
          {{ sub === 'TRIAL' ? '历练' : '通关' }}
          <div class="bar bar-thin bar-gold w-20"><i :style="{ width: `${progressPct}%` }" /></div>
          <b class="tabular-nums text-gold">{{ progressLabel }}</b>
        </div>
      </div>

      <TrialWorkbench v-if="sub === 'TRIAL'" />

      <template v-else-if="sub === 'STORY'">
        <nav class="grid shrink-0 grid-cols-5 gap-1.5" aria-label="射雕章回">
          <button v-for="arc in storyGroups" :key="arc.chapter" class="workbench-entry justify-center"
            :aria-pressed="focusedArc.chapter === arc.chapter" @click="pickedArc = arc.chapter">
            <span class="font-brush text-xl text-gold sm:text-2xl">{{ CN_NUM[arc.chapter - 1] }}</span>
            <span class="min-w-0 text-xs">
              <b class="hidden truncate sm:block">{{ arc.title }}</b>
              <span class="tabular-nums text-ink2">{{ arcCleared(arc.nodes) }}/{{ arc.nodes.length }}</span>
            </span>
          </button>
        </nav>
        <div ref="storyScroll" class="view-scroll space-y-2">
          <header class="border-b border-line pb-2">
            <h3 class="font-brush text-2xl text-gold">第{{ CN_NUM[focusedArc.chapter - 1] }}章 · {{ focusedArc.title }}</h3>
            <p class="hint">{{ focusedArc.tagline }} · {{ focusedArc.summary }}</p>
          </header>
          <article v-for="ch in focusedArc.nodes" :key="ch.id" :data-node="ch.id" class="border border-line"
            :class="stateOf(ch.id) === 'CURRENT' ? 'border-gold/70' : ''">
            <button class="workbench-entry" :aria-expanded="stateOf(ch.id) === 'CURRENT' || stateOf(ch.id) === 'OPEN' || expandedStory === ch.id"
              :disabled="stateOf(ch.id) === 'CURRENT' || stateOf(ch.id) === 'OPEN'"
              @click="expandedStory = expandedStory === ch.id ? undefined : ch.id">
              <span class="shrink-0 font-bold tabular-nums text-gold">{{ ch.code }}</span>
              <b class="min-w-0 flex-1 truncate text-sm" :title="ch.title">{{ ch.title }}</b>
              <span v-if="sideQuests(ch.id).some((a) => advState(a) === 'OPEN' || advState(a) === 'PENDING')" class="chip chip-gold">支线待办</span>
              <span v-if="stateOf(ch.id) === 'CLEARED'" class="chip chip-jade">已通关</span>
              <span v-else-if="stateOf(ch.id) === 'CURRENT'" class="chip chip-gold">当前关卡</span>
              <span v-else-if="stateOf(ch.id) === 'OPEN'" class="chip chip-gold">可补打</span>
              <Lock v-else :size="15" class="shrink-0 text-ink3" aria-label="未解锁" />
            </button>
            <div v-if="stateOf(ch.id) === 'CURRENT' || stateOf(ch.id) === 'OPEN' || expandedStory === ch.id" class="space-y-2.5 p-3">
              <PortraitCard v-if="ch.isBoss" bare size="sm" class="workbench-portrait float-right mb-2 ml-3 w-24 sm:w-32"
                :name="ch.bossName" :subtitle="ch.bossTitle" :style-type="ch.bossPortrait" />
              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="chip" :class="store.player.level >= ch.recLevel ? 'chip-jade' : 'chip-red'">
                  荐 Lv.{{ ch.recLevel }}{{ store.player.level >= ch.recLevel ? ' · 已达' : ` · 差 ${ch.recLevel - store.player.level} 级` }}
                </span>
                <span
                  class="chip"
                  :class="{
                    'chip-jade': stanceRelation(store.currentLoadout.stance, ch.bossStance) === 'WIN',
                    'chip-red': stanceRelation(store.currentLoadout.stance, ch.bossStance) === 'LOSE',
                  }"
                >
                  敌摆「{{ STANCE_META[ch.bossStance].name }}」·
                  {{ { WIN: '我方克制', LOSE: '被克制', EVEN: '同势' }[stanceRelation(store.currentLoadout.stance, ch.bossStance)] }}
                </span>
                <span class="chip">敌首 {{ ch.bossName }}</span>
                <span v-if="storyGuards[ch.id]" class="chip">随从 {{ storyGuards[ch.id] }}</span>
              </div>

              <p v-if="blurbs[ch.id]" class="stage-blurb">
                <span>{{ blurbs[ch.id]!.text }}</span>
                <button v-if="blurbs[ch.id]!.reviewable" class="btn btn-sm" @click="store.reviewStage(storyKey(ch.code))">重温</button>
              </p>
              <p class="hint">{{ ch.mechanicTip }}</p>

              <fieldset
                v-if="ch.code === STORY_SNAKE_ADVENTURE.chapterCode && stateOf(ch.id) !== 'LOCKED'"
                class="space-y-2 rounded border border-line p-2.5"
              >
                <legend class="px-1 text-sm font-semibold text-gold">{{ STORY_SNAKE_ADVENTURE.title }}</legend>
                <p v-if="store.player.storySnakeChoice === 'A'" class="hint">已分饮宝血。梁子翁开场惊怒，攻击 +50%，护体防御归零。</p>
                <p v-else-if="store.player.storySnakeChoice === 'B'" class="hint">已放生药蛇。梁子翁与灵智上人留守药房。</p>
                <template v-else>
                  <p class="hint">直接闯关时，药蛇会协战。梁子翁在药蛇阵亡后惊怒。</p>
                  <div v-for="option in STORY_SNAKE_ADVENTURE.choices" :key="option.key" class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button
                      class="btn btn-sm"
                      :disabled="store.onlineActionBusy || store.isBattlePlaying || !canChooseStorySnake(option.key, store.martialStats.agi)"
                      @click="store.chooseStorySnake(ch.id, option.key)"
                    >{{ option.label }}</button>
                    <span class="text-xs text-ink3">{{ option.requirementText }}</span>
                  </div>
                </template>
              </fieldset>

              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="text-ink3">首胜犒赏</span>
                <span class="chip chip-jade tabular-nums">真气 +{{ firstClearRewards[ch.id].qiExp.toLocaleString() }}</span>
                <span class="chip chip-gold tabular-nums">纹银 +{{ firstClearRewards[ch.id].silver.toLocaleString() }}</span>
                <button
                  v-for="d in firstClearRewards[ch.id].drops" :key="d.id" class="chip tier-chip" :class="TIER_META[d.tier].cls"
                  :title="`首胜奖励 · ${TIER_META[d.tier].label}`" @click="store.inspectById(d.kind, d.id)"
                >
                  {{ TIER_META[d.tier].label }} · {{ d.name }}
                </button>
              </div>

              <!-- 该节点首通后解锁的支线 -->
              <div v-if="visibleSideQuests(ch.id).length" :class="mode.inlineAdventures ? 'space-y-2' : 'flex flex-wrap items-center gap-1.5 text-xs'">
                <span v-if="!mode.inlineAdventures" class="text-ink3">支线</span>
                <template v-for="a in visibleSideQuests(ch.id)" :key="a.id">
                  <details v-if="mode.inlineAdventures" class="clear-both rounded border border-line p-2.5" :open="advState(a) === 'OPEN'">
                    <summary class="cursor-pointer text-sm font-semibold text-gold">
                      {{ a.title }} · {{ { DONE: '已了结', PENDING: '待抉择', OPEN: '可触发', LOCKED: '首通后开启' }[advState(a)] }}
                    </summary>
                    <p class="hint mt-2">{{ a.location }} · {{ a.description }}</p>
                    <template v-if="advState(a) === 'OPEN'">
                      <div v-for="option in a.choices" :key="option.key" class="mt-2 flex flex-wrap items-center gap-2">
                        <button class="btn btn-sm" :disabled="store.onlineActionBusy || store.isBattlePlaying || !store.canChooseAdventure(option)"
                          @click="store.resolveAdventureChoice(option.key, a.id)">{{ option.label }}</button>
                        <span class="hint">{{ option.requirementText }}</span>
                      </div>
                    </template>
                    <p v-else-if="advState(a) === 'DONE'" class="hint mt-2">{{ a.choices.find((option) => option.key === store.player.storyAdventureChoices?.[a.id])?.label }}</p>
                  </details>
                  <span
                    v-else class="chip"
                    :class="{ 'chip-jade': advState(a) === 'DONE', 'chip-gold': advState(a) === 'PENDING' || advState(a) === 'OPEN' }"
                    :title="{ DONE: '已了结', PENDING: '正等你在纪事卷轴中抉择', OPEN: '已开启，可在修行页「游历寻访机缘」触发', LOCKED: '通关本节点后开启' }[advState(a)]"
                  >
                    {{ a.title }} · {{ { DONE: '已了结', PENDING: '待抉择', OPEN: '可触发', LOCKED: '未开启' }[advState(a)] }}
                  </span>
                </template>
              </div>

              <div class="clear-both flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
              <template v-if="gates[ch.id]">
                <span class="hint">这一回接在历练第 {{ gates[ch.id]!.code }} 关「{{ gates[ch.id]!.title }}」之后。</span>
                <button class="btn btn-seal w-full sm:w-auto" @click="gotoGate(gates[ch.id]!)">先去历练 {{ gates[ch.id]!.code }}</button>
              </template>
              <template v-else>
              <button
                class="btn w-full sm:w-auto sm:min-w-[6.5rem]"
                :class="stateOf(ch.id) === 'CURRENT' ? 'btn-seal min-h-[2.6rem]' : ''"
                :disabled="stateOf(ch.id) === 'LOCKED' || store.onlineActionBusy || store.isBattlePlaying"
                @click="store.enterStoryNode(ch.id)"
              >
                {{ { CLEARED: '再次历练', CURRENT: '拔剑闯关', OPEN: '补打首通', LOCKED: '未解锁' }[stateOf(ch.id)] }}
              </button>
              <button v-if="wearsRetreatBoots && stateOf(ch.id) !== 'LOCKED'" class="btn btn-sm"
                :disabled="store.onlineActionBusy || store.isBattlePlaying" @click="store.enterStoryNode(ch.id, true)"
              >入场即撤退</button>
              </template>
              </div>
            </div>
          </article>
        </div>
      </template>

      <MapIntel v-else-if="sub === 'MAPS'" />

      <BountyBoard v-else-if="sub === 'BOUNTY'" />
      <XiangyangDefense v-else-if="sub === 'XIANGYANG'" />

      <!-- ============ 结义 + 后续长卷 ============ -->
      <div v-else class="view-scroll -mr-1 space-y-4 pr-1">
        <article v-if="mode.isLocal" class="well relative overflow-hidden p-4">
          <div class="pointer-events-none absolute inset-0 opacity-70" style="background: radial-gradient(ellipse at 85% 50%, var(--gold-soft), transparent 60%)" />
          <div class="relative grid items-center gap-4 md:grid-cols-[1fr_auto]">
            <div class="space-y-2">
              <span class="chip chip-gold">三人合战</span>
              <h4 class="font-brush text-2xl leading-tight">少室山 · 金刚伏魔圈</h4>
              <p class="hint">本地试玩没有别的侠客：由乔北冥、清风道长两份结义镜像与你同闯，替换你平时带的伙伴。</p>
              <RaidRewardTray />
              <button class="btn btn-seal mt-1" @click="store.startThreePlayerCoopRaid()">挑战副本</button>
            </div>
            <div class="mx-auto flex w-[min(100%,20rem)] items-end justify-center gap-2">
              <PortraitCard bare size="sm" name="乔北冥" subtitle="丐帮" style-type="hongqigong" class="flex-1" />
              <PortraitCard bare size="sm" is-main :name="store.player.nickname" subtitle="你" style-type="hero_sword" :avatar-id="store.player.avatarId" class="flex-1" />
              <PortraitCard bare size="sm" name="清风道长" subtitle="全真" style-type="huangyaoshi" class="flex-1" />
            </div>
          </div>
        </article>
        <RaidLobbyPanel v-else />

        <div>
          <div class="sec-title mb-2.5">后续篇章</div>
          <div class="grid gap-2.5 sm:grid-cols-2">
            <article v-for="v in EXPANSION_VOLUMES_PREVIEW" :key="v.vol" class="well relative space-y-1.5 p-3.5 opacity-85">
              <Lock :size="14" class="absolute right-3 top-3 text-ink3" />
              <div class="font-brush text-lg leading-none text-gold">{{ v.vol }}</div>
              <div class="text-xs text-ink3">{{ v.range }}</div>
              <p class="text-sm">{{ v.chapters }}</p>
              <p class="hint">玩法 · {{ v.core }}</p>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
