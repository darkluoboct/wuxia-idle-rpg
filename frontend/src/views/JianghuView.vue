<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Lock } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { ADVENTURES, EXPANSION_VOLUMES_PREVIEW, getChapterDrops, getMapHerbs, HIDDEN_WEAPONS, MAPS, ONLINE_MAPS, ONLINE_STORY_CHAPTERS, STORY_ARCS, STORY_CHAPTERS, type AdventureConfig } from '@/config/gameData'
import { hasTrialPart, patrolEncounterRate, TRIAL_PATROL_HOURS, TRIAL_REPLAY_HOURS, TRIAL_STAGES, TRIAL_VARIANTS, trialFirstClearKarma, trialItemOf, trialPartId, trialSetOf } from '../../../shared/trialStages.ts'
import { QUSAN_CACHE_KEY, QUSAN_CACHE_STAGE, qusanCacheBlockReason } from '../../../shared/skillMastery.ts'
import { karmaAfterEvent } from '../../../shared/player.ts'
import { canChooseStorySnake, STORY_SNAKE_ADVENTURE, storyEncounter } from '../../../shared/storySnake.ts'
import { storyFirstClearReward } from '../../../shared/storyData.ts'
import { STANCE_META, TIER_META, stanceRelation, trialDropLabel } from '@/config/uiMeta'
import PortraitCard from '@/components/PortraitCard.vue'
import RaidLobbyPanel from '@/components/RaidLobbyPanel.vue'
import BountyBoard from '@/components/BountyBoard.vue'
import SceneBackdrop from '@/components/SceneBackdrop.vue'

const store = useGameStore()
const { jianghuTab: sub } = storeToRefs(store)
const tabs = [
  { k: 'TRIAL', l: '三十关历练' },
  { k: 'STORY', l: '射雕主线' },
  { k: 'MAPS', l: '江湖地图' },
  { k: 'RAID', l: '结义副本' },
  { k: 'BOUNTY', l: '江湖悬赏榜' },
] as const
const visibleTabs = IS_MOCK_MODE ? tabs.filter((tab) => tab.k !== 'BOUNTY') : tabs

const chapters = IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS
const storyGroups = STORY_ARCS.map((arc) => ({ ...arc, nodes: chapters.filter((node) => node.chapter === arc.chapter) }))
const storyGuards = computed(() => Object.fromEntries(chapters.map((chapter) => [
  chapter.id, storyEncounter(chapter, store.player.storySnakeChoice).enemyGuards?.map((guard) => guard.name).join('、'),
])))
type State = 'CLEARED' | 'CURRENT' | 'LOCKED'
function stateOf(id: number): State | 'OPEN' {
  const max = store.player.maxChapterId
  if (id > max) return 'LOCKED'
  if (IS_MOCK_MODE ? id < max : store.claimedNodeIds.includes(id)) return 'CLEARED'
  return id === max ? 'CURRENT' : 'OPEN'
}
const cleared = computed(() => chapters.filter((chapter) => stateOf(chapter.id) === 'CLEARED').length)

const trial = computed(() => store.trial)
const trialStateOf = (id: number): State => (id < trial.value.maxStageId ? 'CLEARED' : id === trial.value.maxStageId ? 'CURRENT' : 'LOCKED')
const firstClearKarma = (delta: number) => karmaAfterEvent(store.player.stats.karma, delta, store.currentLoadout.headId) - store.player.stats.karma
const trialRows = TRIAL_STAGES.map((stage) => ({
  stage, set: trialSetOf(stage.setId)!, hiddenWeapon: Object.values(HIDDEN_WEAPONS).find((weapon) => weapon.unlockStageId === stage.id),
  replayItems: stage.replayPartIds?.map((id) => trialItemOf(id)?.name).join('、'),
  variants: TRIAL_VARIANTS.filter((item) => item.setId === stage.setId).map((item) =>
    `${item.name}（巡历${stage.replayPartIds?.includes(item.baseItemId!) ? '、首领复战' : ''}）`),
}))
const trialAnswers = ref<Record<number, string | null>>({})
const currentStage = computed(() => TRIAL_STAGES.find((stage) => stage.id === trial.value.selectedStageId) ?? TRIAL_STAGES[0])
const currentPatrol = computed(() => store.trialPatrolStatus())
const encounterBonus = computed(() => patrolEncounterRate(store.currentLoadout.accId) - 100)
const wearsRetreatBoots = computed(() => store.currentLoadout.bootsId === trialPartId('qianying_mixing', 'BOOTS'))
const ownsCacheKey = computed(() => store.ownedItemIds.includes(QUSAN_CACHE_KEY))
const cacheBlock = computed(() => qusanCacheBlockReason(store.player, store.currentLoadout, store.worldTime))
store.mockSettlePatrol()
const patrolTimer = setInterval(() => store.mockSettlePatrol(), 30_000)
onScopeDispose(() => clearInterval(patrolTimer))

function fmtHours(hours: number) {
  if (hours <= 0) return '0 分钟'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`
  return `${hours.toFixed(1)} 小时`
}

const trialProgress = (stageId: number) => {
  const required = TRIAL_PATROL_HOURS[stageId] ?? 0
  if (required <= 0) return 100
  return Math.min(100, Math.round(((trial.value.stageHours[String(stageId)] ?? 0) / required) * 100))
}

const trialCleared = computed(() => Math.max(0, trial.value.maxStageId - 1))
const progressPct = computed(() => sub.value === 'TRIAL'
  ? (trialCleared.value / TRIAL_STAGES.length) * 100
  : (cleared.value / chapters.length) * 100)
const progressLabel = computed(() => sub.value === 'TRIAL'
  ? `${trialCleared.value} / ${TRIAL_STAGES.length}`
  : `${cleared.value} / ${chapters.length}`)

const CN_NUM = ['一', '二', '三', '四', '五']
const arcCleared = (nodes: typeof chapters) => nodes.filter((n) => stateOf(n.id) === 'CLEARED').length
const sideQuests = (nodeId: number) => ADVENTURES.filter((a) => a.afterNodeId === nodeId)
const onlineSideQuests = (nodeId: number) => sideQuests(nodeId).filter((a) => a.id !== STORY_SNAKE_ADVENTURE.id)
const firstClearRewards = Object.fromEntries(chapters.map((ch) => {
  const reward = storyFirstClearReward(ch)
  return [ch.id, { ...reward, drops: getChapterDrops({ dropItemIds: reward.items, dropSkillIds: reward.skills }) }]
}))
function advState(a: AdventureConfig): 'DONE' | 'PENDING' | 'OPEN' | 'LOCKED' {
  if (store.resolvedAdventureIds.includes(a.id)) return 'DONE'
  if (!IS_MOCK_MODE) return !a.afterNodeId || store.claimedNodeIds.includes(a.afterNodeId) ? 'OPEN' : 'LOCKED'
  if (store.pendingAdventure?.templateId === a.id || store.adventureQueue.includes(a.id)) return 'PENDING'
  return a.afterNodeId < store.player.maxChapterId ? 'OPEN' : 'LOCKED'
}
const mapLocked = (m: (typeof MAPS)[number]) => !store.canTravelTo(m)
const maps = IS_MOCK_MODE ? MAPS : ONLINE_MAPS
const mapWeather = (mapId: string) => {
  const { storm, rain, night, water } = store.mapEnvironment(mapId)
  return [storm ? '风暴' : rain ? '有雨' : '晴', night && '黑夜', water && '水战'].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist">
          <button v-for="t in visibleTabs" :key="t.k" class="tab" role="tab" :aria-selected="sub === t.k" @click="sub = t.k">{{ t.l }}</button>
        </div>
        <div v-if="sub !== 'BOUNTY'" class="flex items-center gap-2 text-xs text-ink3">
          {{ sub === 'TRIAL' ? '历练' : '通关' }}
          <div class="bar bar-thin bar-gold w-20"><i :style="{ width: `${progressPct}%` }" /></div>
          <b class="tabular-nums text-gold">{{ progressLabel }}</b>
        </div>
      </div>

      <!-- ============ 三十关历练 ============ -->
      <div v-if="sub === 'TRIAL'" class="view-scroll -mr-1 space-y-3 pr-1">
        <article class="well flex flex-wrap items-center justify-between gap-3 p-3">
          <div class="min-w-0">
            <div class="text-xs text-ink3">当前巡历</div>
            <div class="font-brush text-xl leading-tight">
              <span class="text-gold">{{ currentStage.code }}</span> {{ currentStage.title }}
            </div>
            <div class="mt-1 flex flex-wrap gap-1.5 text-xs">
              <span class="chip chip-gold tabular-nums">{{ fmtHours(currentPatrol.hours) }} / {{ fmtHours(currentPatrol.requiredHours) }}</span>
              <span class="chip">遭遇 {{ currentPatrol.encounters }} 次</span>
              <span class="chip">印记 {{ trial.marks[String(currentStage.id)] ?? 0 }} 枚</span>
            </div>
          </div>
          <div class="text-right text-xs text-ink3">
            <div>{{ encounterBonus ? `路引令 · 遭遇频率 +${encounterBonus}%` : '挂机每 30 分钟一次遭遇' }}</div>
            <div>首胜得普通套装件，未集齐时重复掉落可得印记</div>
            <div v-if="trial.recentCache">最近秘境宝箱 {{ trial.recentCache.count }} 个 · 纹银 +{{ trial.recentCache.silver }}</div>
          </div>
        </article>

        <details v-if="trial.recentDrops.length" class="well space-y-2 p-3">
          <summary class="cursor-pointer text-sm text-gold">最近掉落</summary>
          <ul class="space-y-1 text-xs">
            <li v-for="(drop, index) in trial.recentDrops" :key="index">{{ trialDropLabel(drop) }}</li>
          </ul>
        </details>

        <article
          v-for="row in trialRows" :key="row.stage.id"
          class="well p-3"
          :class="trialStateOf(row.stage.id) === 'LOCKED' ? 'opacity-60' : trialStateOf(row.stage.id) === 'CURRENT' ? '!border-gold' : ''"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="chip tabular-nums">{{ row.stage.code }}</span>
                <h4 class="font-brush text-lg leading-none">{{ row.stage.title }}</h4>
                <span v-if="trialStateOf(row.stage.id) === 'CLEARED'" class="chip chip-jade">已通关</span>
                <span v-else-if="trialStateOf(row.stage.id) === 'CURRENT'" class="chip chip-gold">当前关卡</span>
                <span v-else class="chip"><Lock :size="11" class="inline" /> 未开放</span>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="chip">推荐 Lv.{{ row.stage.recLevel }}</span>
                <span class="chip">对手 {{ row.stage.boss.name }}</span>
                <span class="chip">{{ STANCE_META[row.stage.boss.stance].name }}</span>
                <span class="chip tier-chip" :class="TIER_META[row.set.tier].cls">{{ row.set.name }}</span>
              </div>
              <p class="hint">{{ row.stage.mechanicTip }}</p>
              <p v-if="row.replayItems" class="hint">首领复战掉落 {{ row.replayItems }}</p>
              <p v-if="row.variants.length" class="hint">{{ row.variants.join('、') }}</p>
              <details v-if="trialStateOf(row.stage.id) !== 'LOCKED'" class="text-xs">
                <summary class="cursor-pointer text-ink2">套装部件 · {{ trial.marks[String(row.stage.id)] ?? 0 }} 枚印记</summary>
                <ul class="mt-1 space-y-1">
                  <li v-for="part in row.set.parts" :key="part.slot" class="flex flex-wrap items-center gap-2">
                    <span>{{ part.name }}</span>
                    <span v-if="hasTrialPart(store.ownedItemIds, trialPartId(row.set.id, part.slot))" class="text-jade">已收集</span>
                    <button v-else type="button" class="btn btn-sm" :disabled="(trial.marks[String(row.stage.id)] ?? 0) < 4 || store.onlineActionBusy"
                      @click="store.redeemTrialPart(row.stage.id, part.slot)">兑换 · 4 印记</button>
                  </li>
                </ul>
              </details>
              <p v-if="row.hiddenWeapon" class="hint">首胜解锁{{ row.hiddenWeapon.name }}</p>
              <p v-if="trialFirstClearKarma(row.stage) && !trial.rewardedStageIds.includes(row.stage.id)" class="hint">
                首胜侠义 +{{ firstClearKarma(trialFirstClearKarma(row.stage)) }}
              </p>
              <fieldset v-if="row.stage.puzzle && trialStateOf(row.stage.id) !== 'LOCKED'" class="space-y-1 rounded border border-ink3/20 p-2">
                <legend class="px-1 text-sm text-gold">{{ row.stage.puzzle.name }}</legend>
                <p class="text-sm">{{ row.stage.puzzle.prompt }}</p>
                <div class="flex flex-wrap gap-3 text-sm">
                  <label v-for="answer in row.stage.puzzle.options" :key="answer" class="flex cursor-pointer items-center gap-1.5">
                    <input v-model="trialAnswers[row.stage.id]" type="radio" :name="`trial-answer-${row.stage.id}`" :value="answer" />
                    {{ answer }}
                  </label>
                  <label class="flex cursor-pointer items-center gap-1.5">
                    <input v-model="trialAnswers[row.stage.id]" type="radio" :name="`trial-answer-${row.stage.id}`" :value="null" />
                    直接迎战
                  </label>
                </div>
              </fieldset>
              <div class="flex items-center gap-2">
                <div class="bar bar-thin flex-1"><i :style="{ width: `${trialProgress(row.stage.id)}%` }" /></div>
                <span class="w-24 text-right text-[0.7rem] tabular-nums text-ink3">{{ trialProgress(row.stage.id) }}%</span>
              </div>
            </div>
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex-col sm:items-stretch">
              <button
                class="btn btn-sm"
                :class="trialStateOf(row.stage.id) === 'CURRENT' && trialProgress(row.stage.id) >= 100 ? 'btn-seal' : ''"
                :disabled="trialStateOf(row.stage.id) === 'LOCKED' || (trialStateOf(row.stage.id) === 'CURRENT' && trialProgress(row.stage.id) < 100) || store.onlineActionBusy"
                @click="store.challengeTrialStage(row.stage.id, trialAnswers[row.stage.id] ?? undefined)"
              >
                {{ trialStateOf(row.stage.id) === 'CLEARED' ? '再战一次' : trialStateOf(row.stage.id) === 'CURRENT' ? (trialProgress(row.stage.id) >= 100 ? '拔剑试炼' : '巡历中') : '未开放' }}
              </button>
              <button v-if="wearsRetreatBoots && trialStateOf(row.stage.id) !== 'LOCKED'" class="btn btn-sm"
                :disabled="store.onlineActionBusy || store.isBattlePlaying || (trialStateOf(row.stage.id) === 'CURRENT' && trialProgress(row.stage.id) < 100)"
                @click="store.challengeTrialStage(row.stage.id, trialAnswers[row.stage.id] ?? undefined, true)"
              >入场即撤退</button>
              <button
                class="btn btn-sm"
                :disabled="trialStateOf(row.stage.id) === 'LOCKED' || trial.selectedStageId === row.stage.id"
                @click="store.setPatrolStage(row.stage.id)"
              >
                {{ trial.selectedStageId === row.stage.id ? '正在巡历' : '巡历到此' }}
              </button>
              <button
                v-if="row.stage.replayPartIds"
                class="btn btn-sm btn-gold"
                :disabled="(trial.replayHours[String(row.stage.id)] ?? 0) < TRIAL_REPLAY_HOURS || store.onlineActionBusy || store.isBattlePlaying"
                @click="store.replayTrialBoss(row.stage.id, trialAnswers[row.stage.id] ?? undefined)"
              >
                首领复战 {{ fmtHours(trial.replayHours[String(row.stage.id)] ?? 0) }}/{{ TRIAL_REPLAY_HOURS }}h
              </button>
              <button v-if="row.stage.replayPartIds && wearsRetreatBoots && (trial.replayHours[String(row.stage.id)] ?? 0) >= TRIAL_REPLAY_HOURS"
                class="btn btn-sm" :disabled="store.onlineActionBusy || store.isBattlePlaying"
                @click="store.replayTrialBoss(row.stage.id, trialAnswers[row.stage.id] ?? undefined, true)"
              >复战入场即撤退</button>
              <template v-if="row.stage.id === QUSAN_CACHE_STAGE && ownsCacheKey">
                <button class="btn btn-sm" :disabled="!!cacheBlock || store.onlineActionBusy" @click="store.openQusanCache()">搜寻曲三酒馆暗格</button>
                <p v-if="cacheBlock" class="hint">{{ cacheBlock }}</p>
              </template>
            </div>
          </div>
        </article>
      </div>

      <!-- ============ 主线：五章回目时间轴 ============ -->
      <ol v-else-if="sub === 'STORY'" class="view-scroll -mr-1 pr-1">
        <template v-for="arc in storyGroups" :key="arc.chapter">
          <li class="flex flex-wrap items-center gap-x-3 gap-y-1 pb-3 pt-1" :class="arc.chapter > 1 ? 'mt-1 border-t border-line pt-4' : ''">
            <span class="seal h-9 w-9 text-lg">{{ CN_NUM[arc.chapter - 1] }}</span>
            <div class="min-w-0 flex-1">
              <h3 class="font-brush text-2xl leading-none">第{{ CN_NUM[arc.chapter - 1] }}章 · {{ arc.title }}</h3>
              <p class="hint mt-1">{{ arc.tagline }} · {{ arc.summary }}</p>
            </div>
            <span class="chip tabular-nums" :class="arcCleared(arc.nodes) === arc.nodes.length ? 'chip-jade' : ''">
              {{ arcCleared(arc.nodes) }} / {{ arc.nodes.length }}
            </span>
          </li>

          <li
            v-for="ch in arc.nodes" :key="ch.id"
            class="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]"
            :class="stateOf(ch.id) === 'LOCKED' ? 'opacity-60' : ''"
          >
            <!-- 节点 + 竖线 -->
            <div class="relative flex flex-col items-center">
              <span
                class="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold tabular-nums"
                :class="{
                  'border-jade bg-[color-mix(in_srgb,var(--jade)_14%,var(--bg-1))] text-jade': stateOf(ch.id) === 'CLEARED',
                  'anim-pulse-glow border-gold bg-[var(--gold-soft)] text-gold': stateOf(ch.id) === 'CURRENT',
                  'border-linestrong bg-raised text-ink3': stateOf(ch.id) === 'LOCKED' || stateOf(ch.id) === 'OPEN',
                }"
              >
                <Lock v-if="stateOf(ch.id) === 'LOCKED'" :size="15" />
                <template v-else>{{ ch.code }}</template>
              </span>
              <span v-if="ch.id !== chapters.length" class="absolute bottom-[-1rem] top-11 w-px" :class="stateOf(ch.id) === 'CLEARED' ? 'bg-jade opacity-60' : 'bg-linestrong opacity-70'" />
            </div>

            <div class="well min-w-0 space-y-2 p-3" :class="stateOf(ch.id) === 'CURRENT' ? '!border-gold' : ''">
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h4 class="font-brush text-xl leading-none">{{ ch.title }}</h4>
                <span v-if="ch.isBoss" class="chip chip-red">章节 Boss</span>
                <span v-if="stateOf(ch.id) === 'CLEARED'" class="chip chip-jade">已通关</span>
                <span v-else-if="stateOf(ch.id) === 'CURRENT'" class="chip chip-gold">当前关卡</span>
                <span v-else-if="stateOf(ch.id) === 'OPEN'" class="chip chip-gold">可补打</span>
              </div>

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
              <div v-if="IS_MOCK_MODE && sideQuests(ch.id).length" class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="text-ink3">支线</span>
                <span
                  v-for="a in sideQuests(ch.id)" :key="a.id" class="chip"
                  :class="{ 'chip-jade': advState(a) === 'DONE', 'chip-gold': advState(a) === 'PENDING' || advState(a) === 'OPEN' }"
                  :title="{ DONE: '已了结', PENDING: '正等你在纪事卷轴中抉择', OPEN: '已开启，可在修行页「游历寻访机缘」触发', LOCKED: '通关本节点后开启' }[advState(a)]"
                >
                  {{ a.title }} · {{ { DONE: '已了结', PENDING: '待抉择', OPEN: '可触发', LOCKED: '未开启' }[advState(a)] }}
                </span>
              </div>

              <details v-for="a in !IS_MOCK_MODE ? onlineSideQuests(ch.id) : []" :key="a.id" class="rounded border border-line p-2.5">
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
            </div>

            <div class="col-span-2 col-start-1 mt-2 flex items-center sm:col-span-1 sm:col-start-3 sm:mt-0">
              <button
                class="btn w-full sm:w-auto sm:min-w-[6.5rem]"
                :class="stateOf(ch.id) === 'CURRENT' ? 'btn-seal !min-h-[2.6rem]' : ''"
                :disabled="stateOf(ch.id) === 'LOCKED' || store.onlineActionBusy || store.isBattlePlaying"
                @click="store.challengeChapter(ch.id)"
              >
                {{ { CLEARED: '再次历练', CURRENT: '拔剑闯关', OPEN: '补打首通', LOCKED: '未解锁' }[stateOf(ch.id)] }}
              </button>
              <button v-if="wearsRetreatBoots && stateOf(ch.id) !== 'LOCKED'" class="btn btn-sm"
                :disabled="store.onlineActionBusy || store.isBattlePlaying" @click="store.challengeChapter(ch.id, true)"
              >入场即撤退</button>
            </div>
          </li>
        </template>
      </ol>

      <div v-else-if="sub === 'MAPS'" class="view-scroll -mr-1 grid content-start gap-3 pr-1 sm:grid-cols-2">
        <article
          v-for="m in maps" :key="m.id" class="well well-hover group overflow-hidden"
          :class="store.player.currentMapId === m.id ? '!border-gold' : ''"
        >
          <div class="relative h-28 overflow-hidden">
            <SceneBackdrop :map-id="m.id" :shichen-idx="store.shichenIdx" />
            <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
              <h4 class="font-brush text-xl leading-none text-[#f0e9dc]">{{ m.name.replace(/（.*?）/, '') }}</h4>
              <span v-if="mapLocked(m)" class="chip bg-black/40"><Lock :size="12" /> 未开放</span>
              <span v-else class="chip bg-black/40 backdrop-blur-[2px]" :class="m.safety === 'PEACE' ? 'chip-jade' : 'chip-red'">
                {{ m.safety === 'PEACE' ? '和平区' : IS_MOCK_MODE ? '可劫镖' : '纷争区' }}
              </span>
            </div>
          </div>
          <div class="space-y-2.5 p-3">
            <p class="hint min-h-[3.3rem]">{{ m.ambientDesc }}</p>
            <div class="text-xs text-ink3">{{ mapWeather(m.id) }}</div>
            <div v-if="getMapHerbs(m.id).length" class="flex flex-wrap items-center gap-1 border-t border-line/50 pt-2 text-[0.72rem]">
              <span class="text-ink3">本地产药：</span>
              <span
                v-for="h in getMapHerbs(m.id)"
                :key="h.id"
                class="chip !py-0 !text-[0.65rem]"
                :class="[TIER_META[h.tier].cls, (store.herbInventory[h.id] ?? 0) > 0 ? '' : 'opacity-60']"
              >
                {{ h.name }} ({{ store.herbInventory[h.id] ?? 0 }})
              </span>
            </div>
            <div class="flex items-center justify-between border-t border-line pt-2 text-xs tabular-nums">
              <div class="text-ink3">
                <div>基础收益 <b class="text-ink">{{ m.baseQiPerHour.toLocaleString() }}</b> 真气/小时</div>
                <div v-if="IS_MOCK_MODE">{{ m.onlineCount }} 人在线</div>
                <div v-else-if="store.roomConnected && store.roomMapId === m.id">{{ store.roomCount }} 人在线</div>
              </div>
              <button v-if="mapLocked(m)" class="btn btn-sm" disabled>{{ IS_MOCK_MODE ? m.unlockHint : m.onlineUnlockHint }}</button>
              <div v-else-if="store.player.currentMapId !== m.id" class="flex items-center gap-1.5">
                <template v-if="!store.player.mapJourney">
                  <span class="hint">{{ store.mapTravelTime(m.id).toFixed(1) }} 秒</span>
                  <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy" @click="store.travelTo(m.id)">出发</button>
                </template>
                <span v-else-if="store.journeyMap?.id === m.id" class="chip chip-gold">{{ store.journeySeconds ? '赶路中' : '可抵达' }}</span>
              </div>
              <div v-else class="flex items-center gap-1.5">
                <span class="chip chip-gold">你在这里</span>
                <button v-if="getMapHerbs(m.id).length" class="btn btn-sm btn-gold" @click="store.forageHerbs(m.id)">采药</button>
              </div>
            </div>
            <div v-if="!IS_MOCK_MODE && m.id === store.player.currentMapId && m.safety === 'CONTESTED'" class="flex items-center justify-between gap-2 text-xs">
              <template v-if="store.player.escortDart?.mapId === m.id">
                <span>{{ store.player.escortDart.robbed ? '镖银已遭劫掠' : store.onlineTime >= store.player.escortDart.endsAt ? '镖车已抵达' : '押镖中' }} · {{ store.player.escortDart.silver.toLocaleString() }} 两</span>
                <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy || store.onlineTime < store.player.escortDart.endsAt" @click="store.escortAction('claim')">交镖</button>
              </template>
              <template v-else-if="!store.player.escortDart">
                <span>接镖后 15 分钟可交镖，镖银 4,800 两</span>
                <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy || !!store.player.mapJourney" @click="store.escortAction('start')">接镖</button>
              </template>
              <span v-else>请回接镖地点结算当前镖车。</span>
            </div>
          </div>
        </article>
      </div>

      <BountyBoard v-else-if="sub === 'BOUNTY'" />

      <!-- ============ 结义 + 后续长卷 ============ -->
      <div v-else class="view-scroll -mr-1 space-y-4 pr-1">
        <article v-if="IS_MOCK_MODE" class="well relative overflow-hidden p-4">
          <div class="pointer-events-none absolute inset-0 opacity-70" style="background: radial-gradient(ellipse at 85% 50%, var(--gold-soft), transparent 60%)" />
          <div class="relative grid items-center gap-4 md:grid-cols-[1fr_auto]">
            <div class="space-y-2">
              <span class="chip chip-gold">三人合战</span>
              <h4 class="font-brush text-2xl leading-tight">少室山 · 金刚伏魔圈</h4>
              <p class="hint">这场由乔北冥和清风道长与你并肩出战，两人会替换你平时带的伙伴。</p>
              <p v-if="store.nextRaidRelic" class="text-sm text-gold">打赢可得《{{ store.nextRaidRelic.name }}》</p>
              <p v-else class="hint">副本秘宝已集齐，再战仍可获得真气和纹银。</p>
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
