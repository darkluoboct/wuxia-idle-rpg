<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Lock } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { HIDDEN_WEAPONS } from '@/config/gameData'
import { STANCE_META, TIER_META, stanceRelation, trialDropLabel } from '@/config/uiMeta'
import { hasTrialPart, patrolEncounterRate, TRIAL_PATROL_HOURS, TRIAL_REPLAY_HOURS, TRIAL_STAGES, TRIAL_VARIANTS, trialFirstClearKarma, trialItemOf, trialPartId, trialSetOf } from '../../../shared/trialStages.ts'
import { QUSAN_CACHE_KEY, QUSAN_CACHE_STAGE, qusanCacheBlockReason } from '../../../shared/skillMastery.ts'
import { karmaAfterEvent } from '../../../shared/player.ts'
import ItemIcon from './ItemIcon.vue'
import PortraitCard from './PortraitCard.vue'
import TrialRewardTray from './TrialRewardTray.vue'
import WorkbenchDialog from './WorkbenchDialog.vue'

const store = useGameStore()
const trial = computed(() => store.trial)
const stages = TRIAL_STAGES.map((stage) => {
  const set = trialSetOf(stage.setId)!
  return { stage, set, parts: set.parts.map((part) => ({ ...part, id: trialPartId(set.id, part.slot) })) }
})
const progressStage = computed(() => Math.min(trial.value.maxStageId, TRIAL_STAGES.length))
const patrol = computed(() => TRIAL_STAGES.find(({ id }) => id === trial.value.selectedStageId) ?? TRIAL_STAGES[0])
const patrolStatus = computed(() => store.trialPatrolStatus())
const encounterBonus = computed(() => patrolEncounterRate(store.currentLoadout.accId) - 100)
const wearsRetreatBoots = computed(() => store.currentLoadout.bootsId === trialPartId('qianying_mixing', 'BOOTS'))
const busy = computed(() => store.onlineActionBusy || store.isBattlePlaying)
const cacheBlock = computed(() => qusanCacheBlockReason(store.player, store.currentLoadout, store.worldTime))
const selected = ref(progressStage.value)
const answers = ref<Record<number, string | null>>({})
const filters = ['全部', '待破关', '未集齐套装', '可复战'] as const
const filter = ref<typeof filters[number]>('全部')
const list = ref<HTMLElement>()
const detail = ref<HTMLElement>()

const ownsPart = (id: string) => hasTrialPart(store.ownedItemIds, id)
const replayHours = (id: number) => trial.value.replayHours[String(id)] ?? 0
const state = (id: number) => id > trial.value.maxStageId ? '未开放'
  : trial.value.rewardedStageIds.includes(id) || id < trial.value.maxStageId ? '已通关' : '当前关卡'
const rows = computed(() => stages.filter(({ stage, parts }) => {
  if (filter.value === '待破关') return state(stage.id) === '当前关卡'
  if (filter.value === '未集齐套装') return parts.some(({ id }) => !ownsPart(id))
  if (filter.value === '可复战') return !!stage.replayPartIds && replayHours(stage.id) >= TRIAL_REPLAY_HOURS
  return true
}))
const row = computed(() => rows.value.find(({ stage }) => stage.id === selected.value) ?? rows.value[0])
const stage = computed(() => row.value?.stage)
const marks = computed(() => trial.value.marks[String(stage.value?.id)] ?? 0)
const replay = computed(() => replayHours(stage.value?.id ?? 0))
const hiddenWeapon = computed(() => Object.values(HIDDEN_WEAPONS).find((weapon) => weapon.unlockStageId === stage.value?.id))
const variants = computed(() => TRIAL_VARIANTS.filter((item) => stage.value && item.setId === stage.value.setId).map((item) =>
  `${item.name}（巡历${stage.value?.replayPartIds?.includes(item.baseItemId!) ? '、首领复战' : ''}）`))
const firstKarma = computed(() => {
  if (!stage.value || trial.value.rewardedStageIds.includes(stage.value.id)) return 0
  const karma = store.player.stats.karma
  return karmaAfterEvent(karma, trialFirstClearKarma(stage.value), store.currentLoadout.headId) - karma
})
const relation = computed(() => stage.value && stanceRelation(store.currentLoadout.stance, stage.value.boss.stance))
const canChallenge = computed(() => !!stage.value && !busy.value && state(stage.value.id) !== '未开放' && progress(stage.value.id) === 100)

function progress(id: number) {
  const required = TRIAL_PATROL_HOURS[id] ?? 0
  return required ? Math.min(100, Math.floor((trial.value.stageHours[String(id)] ?? 0) / required * 100)) : 100
}
function fmtHours(hours: number) {
  if (hours <= 0) return '0 分钟'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} 分钟`
  return `${hours.toFixed(1)} 小时`
}
function locate(id: number) {
  filter.value = '全部'
  selected.value = id
  list.value?.querySelector(`[data-stage="${id}"]`)?.scrollIntoView({ block: 'nearest' })
}
watch([list, () => stage.value?.id], ([el, id], [, previous]) => {
  if (id !== previous && detail.value) detail.value.scrollTop = 0
  el?.querySelector(`[data-stage="${id}"]`)?.scrollIntoView({ block: 'nearest' })
}, { flush: 'post' })
</script>

<template>
  <header class="workbench-toolbar border-b border-line pb-2" aria-label="当前巡历">
    <button class="btn btn-sm btn-gold" @click="locate(patrol.id)">当前巡历 · {{ patrol.code }} {{ patrol.title }}</button>
    <span class="text-xs tabular-nums text-ink2">已巡历 {{ fmtHours(patrolStatus.hours) }}<template v-if="patrolStatus.requiredHours > 0"> / {{ fmtHours(patrolStatus.requiredHours) }}</template> · {{ patrolStatus.battles.toLocaleString() }} 场 · 精英 {{ patrolStatus.encounters }}</span>
    <button v-if="progressStage !== patrol.id" class="btn btn-sm" @click="locate(progressStage)">定位当前关卡</button>
    <div class="ml-auto flex items-center gap-2">
      <WorkbenchDialog v-if="trial.recentDrops.length || trial.recentCache" title="最近掉落" label="最近掉落">
        <p v-if="trial.recentCache">秘境宝箱 {{ trial.recentCache.count }} 个 · 纹银 +{{ trial.recentCache.silver }}</p>
        <ul class="space-y-1"><li v-for="(drop, index) in trial.recentDrops" :key="index">{{ trialDropLabel(drop) }}</li></ul>
      </WorkbenchDialog>
      <WorkbenchDialog title="历练与巡历规则">
        <p>{{ encounterBonus ? `路引令 · 巡历快 ${encounterBonus}%` : '巡历每分钟一场，每 30 场遇到一名精英。' }}</p>
        <p>首胜得普通套装部件。套装未齐时，巡历重复掉落会转为印记，每 4 枚可换一件本关未集齐的部件。</p>
        <p>有复战奖励的关卡，巡历满 {{ TRIAL_REPLAY_HOURS }} 小时可再战首领。</p>
      </WorkbenchDialog>
    </div>
  </header>

  <div class="workbench">
    <aside class="workbench-index" aria-label="历练关卡索引">
      <div class="workbench-toolbar" role="group" aria-label="筛选关卡">
        <button v-for="option in filters" :key="option" class="btn btn-sm" :class="{ 'btn-gold': option === filter }"
          :aria-pressed="option === filter" @click="filter = option">{{ option }}</button>
      </div>
      <div ref="list" class="workbench-scroll">
        <p v-if="!rows.length" class="hint p-2">这个筛选下暂无关卡。</p>
        <button v-for="entry in rows" :key="entry.stage.id" :data-stage="entry.stage.id" class="workbench-entry"
          :aria-pressed="stage?.id === entry.stage.id" @click="selected = entry.stage.id">
          <span class="shrink-0 font-bold tabular-nums text-gold">{{ entry.stage.code }}</span>
          <span class="min-w-0 flex-1">
            <b class="block truncate text-sm" :title="entry.stage.title">{{ entry.stage.title }}</b>
            <small :class="state(entry.stage.id) === '当前关卡' ? 'text-gold' : 'text-ink3'">
              {{ state(entry.stage.id) }}<template v-if="entry.stage.id === patrol.id"> · 巡历中</template>
            </small>
          </span>
          <Lock v-if="state(entry.stage.id) === '未开放'" :size="13" class="shrink-0 text-ink3" aria-hidden="true" />
        </button>
      </div>
    </aside>

    <article v-if="row && stage" class="workbench-detail" :aria-label="stage.title">
      <div ref="detail" class="workbench-scroll space-y-4">
        <header class="grid grid-cols-[minmax(0,1fr)_minmax(6rem,26%)] items-center gap-3 border-b border-line pb-3">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="chip chip-gold">第 {{ stage.code }} 关</span>
              <span class="chip" :class="state(stage.id) === '已通关' ? 'chip-jade' : ''">{{ state(stage.id) }}</span>
              <span class="text-xs text-ink2">推荐 Lv.{{ stage.recLevel }}</span>
            </div>
            <h3 class="font-brush text-2xl leading-tight md:text-3xl">{{ stage.title }}</h3>
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="chip" :class="{ 'chip-jade': relation === 'WIN', 'chip-red': relation === 'LOSE' }">
                {{ STANCE_META[stage.boss.stance].name }} · {{ relation === 'WIN' ? '我方克制' : relation === 'LOSE' ? '被克制' : '同势' }}
              </span>
              <span v-if="stage.id <= trial.maxStageId" class="tabular-nums text-ink2">巡历 {{ progress(stage.id) }}%</span>
            </div>
            <p class="hint max-w-[65ch]">{{ stage.mechanicTip }}</p>
          </div>
          <PortraitCard bare class="workbench-portrait min-w-0" :name="stage.boss.name" :subtitle="stage.boss.title" :style-type="stage.boss.portrait" />
        </header>

        <fieldset v-if="stage.puzzle && state(stage.id) !== '未开放'" class="space-y-2 border border-line p-2">
          <legend class="px-1 text-sm font-bold text-gold">{{ stage.puzzle.name }}</legend>
          <p class="text-sm">{{ stage.puzzle.prompt }}</p>
          <div class="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label v-for="answer in stage.puzzle.options" :key="answer" class="flex cursor-pointer items-center gap-1.5">
              <input v-model="answers[stage.id]" type="radio" :name="`trial-answer-${stage.id}`" :value="answer" />{{ answer }}
            </label>
            <label class="flex cursor-pointer items-center gap-1.5">
              <input v-model="answers[stage.id]" type="radio" :name="`trial-answer-${stage.id}`" :value="null" />直接迎战
            </label>
          </div>
        </fieldset>

        <section class="space-y-2" aria-label="套装收集">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="sec-title mb-0" :class="TIER_META[row.set.tier].cls">{{ row.set.name }} · {{ row.parts.filter(({ id }) => ownsPart(id)).length }}/{{ row.parts.length }}</h4>
            <span class="text-xs text-gold">本关印记 {{ marks }} 枚</span>
          </div>
          <ul class="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 xl:grid-cols-7">
            <li v-for="part in row.parts" :key="part.id" class="flex min-w-0 flex-col justify-between gap-1.5 border border-line p-2"
              :class="ownsPart(part.id) ? 'border-jade/40 bg-jade/5' : ''">
              <button class="flex flex-col items-start gap-2 text-left text-sm hover:text-gold" @click="store.inspectById('item', part.id)">
                <ItemIcon :item-id="part.id" :class="TIER_META[row.set.tier].cls" />
                <span class="min-w-0">{{ part.name }}</span>
              </button>
              <span v-if="ownsPart(part.id)" class="text-xs text-jade">已集齐此部位</span>
              <button v-else-if="state(stage.id) !== '未开放' && marks >= 4" class="btn btn-sm btn-gold self-start" :disabled="busy"
                @click="store.redeemTrialPart(stage.id, part.slot)">兑换 · 4 印记</button>
              <span v-else class="text-xs text-ink3">未得<template v-if="state(stage.id) !== '未开放'"> · 4 印记可换</template></span>
            </li>
          </ul>
        </section>
        <TrialRewardTray :stage="stage" :answer="answers[stage.id]" />
        <div v-if="stage.replayPartIds || hiddenWeapon || firstKarma || variants.length" class="space-y-0.5">
          <p v-if="stage.replayPartIds" class="hint">首领复战掉落 {{ stage.replayPartIds.map((id) => trialItemOf(id)?.name).join('、') }}</p>
          <p v-if="variants.length" class="hint">{{ variants.join('、') }}</p>
          <p v-if="hiddenWeapon || firstKarma" class="hint">
            首胜<template v-if="hiddenWeapon">解锁{{ hiddenWeapon.name }}</template><template v-if="hiddenWeapon && firstKarma"> · </template><template v-if="firstKarma">侠义 +{{ firstKarma }}</template>
          </p>
        </div>
      </div>
      <footer class="workbench-actions">
        <template v-if="stage.id === QUSAN_CACHE_STAGE && store.ownedItemIds.includes(QUSAN_CACHE_KEY)">
          <span v-if="cacheBlock" class="hint mr-auto">{{ cacheBlock }}</span>
          <button class="btn btn-sm" :disabled="!!cacheBlock || busy" @click="store.openQusanCache()">搜寻曲三酒馆暗格</button>
        </template>
        <button class="btn btn-sm" :disabled="busy || state(stage.id) === '未开放' || stage.id === patrol.id" @click="store.setPatrolStage(stage.id)">
          {{ stage.id === patrol.id ? '正在巡历' : '巡历到此' }}
        </button>
        <button v-if="stage.replayPartIds && wearsRetreatBoots && replay >= TRIAL_REPLAY_HOURS" class="btn btn-sm" :disabled="busy"
          @click="store.replayTrialBoss(stage.id, answers[stage.id] ?? undefined, true)">复战入场即撤退</button>
        <button v-if="stage.replayPartIds" class="btn btn-sm btn-gold" :disabled="busy || replay < TRIAL_REPLAY_HOURS"
          @click="store.replayTrialBoss(stage.id, answers[stage.id] ?? undefined)">首领复战 {{ replay.toFixed(1) }}/{{ TRIAL_REPLAY_HOURS }}h</button>
        <button v-if="wearsRetreatBoots && state(stage.id) !== '未开放'" class="btn btn-sm" :disabled="!canChallenge"
          @click="store.challengeTrialStage(stage.id, answers[stage.id] ?? undefined, true)">入场即撤退</button>
        <button class="btn btn-sm btn-seal" :disabled="!canChallenge" @click="store.challengeTrialStage(stage.id, answers[stage.id] ?? undefined)">
          {{ state(stage.id) === '已通关' ? '再战一次' : state(stage.id) === '未开放' ? '未开放' : progress(stage.id) === 100 ? '拔剑试炼' : '巡历中' }}
        </button>
      </footer>
    </article>
    <p v-else class="workbench-detail hint p-4">切换筛选可查看其他关卡。</p>
  </div>
</template>
