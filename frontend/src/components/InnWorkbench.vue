<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { openToOrigin } from '../../../shared/origins.ts'
import { innVisitDay } from '../../../shared/player.ts'
import { COMPANIONS, GRADE_MULT, INN_GIFT_COST, INN_TEA_COST, MAPS, SKILLS, STORY_CHAPTERS } from '@/config/gameData'
import { TIER_META } from '@/config/uiMeta'
import {
  awakenAffinityOf,
  GACHA_BASE_RATES,
  GACHA_DUP_TOKENS,
  GACHA_HARD_PITY,
  GACHA_ORANGE_TOP_GRADE_RATE,
  GACHA_SINGLE_COST,
  GACHA_SOFT_PITY_START,
  GACHA_SOFT_PITY_STEP,
  GACHA_TEN_COST,
  gachaEffectiveRedRate,
  gachaRateTable,
  REUNION_TICKET_COST,
} from '@/config/gachaData'
import {
  DISHES,
  FEAST_GATHER_MINUTES,
  REUNION_CLUE_SOURCES,
  REUNION_CLUE_TARGET,
  REUNION_INQUIRE_COST,
  REUNION_QUESTS,
  REUNION_WAIT_HOURS,
} from '@/config/questData'
import InkFigure from './InkFigure.vue'
import ItemIcon from './ItemIcon.vue'
import WorkbenchDialog from './WorkbenchDialog.vue'

const store = useGameStore()
const area = ref<'guests' | 'draw' | 'quests'>('guests')
const canAfford = (cost: number) => store.player.silver >= cost

/* ---------- 醉仙楼·结缘 ---------- */
const RATE_TABLE = gachaRateTable()
/* ---------- 故人寻访 / 十道绝味 ---------- */
const REUNION_STEPS = [
  { k: 'CLUES', l: '打听线索' },
  { k: 'WAIT', l: '故地相候' },
  { k: 'GIFT', l: '以礼相邀' },
  { k: 'BATTLE', l: '了却前尘' },
] as const
const stepIdx = (id: string) => REUNION_STEPS.findIndex((s) => s.k === store.reunionView(id).step)
const daysLeft = (id: string) => {
  const perDay = Object.values(REUNION_CLUE_SOURCES).reduce((s, x) => s + x.dailyCap, 0)
  return Math.ceil((REUNION_CLUE_TARGET - store.reunionView(id).clues) / perDay)
}
const mapName = (id: string) => MAPS.find((x) => x.id === id)?.name.replace(/（.*?）/, '') ?? id
const cookedToday = computed(() => store.feast.lastCookDay === innVisitDay(store.worldTime))

const fmtRate = (r: number) => (r >= 1 ? r.toFixed(2) : r.toFixed(3)) + '%'
/** 伙伴当前形态视图（形态 / 资质已套用） */
const view = (id: string) => store.companionOf(id)!
/** 送礼按钮是否可点：银两、今日次数、好感封顶三者都要满足 */
function giftDisabled(id: string, favorite: boolean) {
  const left = store.giftsLeft(id)
  return (
    store.onlineActionBusy || !canAfford(favorite ? INN_GIFT_COST : INN_TEA_COST) ||
    (favorite ? left.gift : left.tea) <= 0 ||
    (store.companionAffinity[id]?.affinity ?? 0) >= store.affinityCap
  )
}
const leftLabel = (n: number) => (Number.isFinite(n) ? `今日余 ${n}` : '')
function canAwaken(id: string) {
  const st = store.companionAffinity[id]
  const need = COMPANIONS[id].awakenTokens ?? 30
  return !!COMPANIONS[id].awakened && !!st && st.form === 'base' && st.recruited && st.affinity >= awakenAffinityOf(COMPANIONS[id]) && st.tokens >= need
}
/** 这一杯酒喝完好感是否会跨过 600（生死之交）门槛 */
function willTrigger(id: string) {
  const st = store.companionAffinity[id]
  return !!st?.met && !st.taught && store.affinityCap >= 600 && [true, false].some((favorite) =>
    !giftDisabled(id, favorite) && st.affinity + store.innGiftGain(id, favorite) >= 600)
}
const tokenName = (c: { route: string }) => c.route === 'FAMILY' ? '家传信物' : '信物'
/** 别家的家人伙伴不在客栈里出现 */
const innCompanions = computed(() => Object.values(COMPANIONS).filter((c) => openToOrigin(c, store.player)))
const filters = ['全部', '可传功或觉醒', '已结识', '未结识'] as const
const filter = ref<typeof filters[number]>('全部')
const selectedId = ref<string>()
const ready = (id: string) => willTrigger(id) || canAwaken(id)
const readyCount = computed(() => innCompanions.value.filter(({ id }) => ready(id)).length)
const roster = computed(() => innCompanions.value.filter(({ id }) => {
  if (filter.value === '全部') return true
  if (filter.value === '可传功或觉醒') return ready(id)
  return !!store.companionAffinity[id]?.met === (filter.value === '已结识')
}))
const c = computed(() => roster.value.find(({ id }) => id === selectedId.value)
  ?? roster.value.find(({ id }) => store.companionAffinity[id]?.met) ?? roster.value[0])
const hasReunion = computed(() => store.reunionCandidates.length > 0 && store.featureOpen('GACHA'))
const hasFeast = computed(() => store.feastActive && store.featureOpen('FEAST'))
const questReady = computed(() => (hasFeast.value && !cookedToday.value && DISHES.some((dish) =>
  !store.feast.cooked.includes(dish.id) && store.feast.ingredients.includes(dish.id) && canAfford(dish.silver))) ||
  (hasReunion.value && store.reunionCandidates.some((id) => {
    const quest = store.reunionView(id)
    if (quest.step === 'CLUES') return quest.got.inn < REUNION_CLUE_SOURCES.inn.dailyCap && canAfford(REUNION_INQUIRE_COST)
    if (quest.step === 'WAIT') return quest.waitRatio >= 1
    return quest.step === 'BATTLE' || (quest.step === 'GIFT' && canAfford(INN_GIFT_COST))
  })))
</script>

<template>
  <nav class="tabs shrink-0" role="tablist" aria-label="客栈分区">
    <button class="tab" role="tab" :aria-selected="area === 'guests'" @click="area = 'guests'">宾客雅间 <small v-if="readyCount" class="chip chip-gold">{{ readyCount }}</small></button>
    <button v-if="store.featureOpen('GACHA')" class="tab" role="tab" :aria-selected="area === 'draw'" @click="area = 'draw'">醉仙结缘</button>
    <button v-if="hasReunion || hasFeast" class="tab" role="tab" :aria-selected="area === 'quests'" @click="area = 'quests'">故人寻访 / 十道绝味 <span v-if="questReady" class="text-cinnabar" aria-label="今日可办理">●</span></button>
  </nav>
  <article v-if="area === 'draw' && store.featureOpen('GACHA')" class="workbench-detail flex-1" aria-label="醉仙结缘">
    <div class="workbench-scroll grid items-center gap-4 md:grid-cols-[minmax(12rem,32%)_1fr]">
      <div class="workbench-portrait h-36 md:h-64">
        <InkFigure style-type="hero_sword" portrait-id="zuixian_innkeeper" />
      </div>
      <div class="max-w-2xl space-y-4">
        <div class="flex items-center gap-3"><span class="seal h-10 w-10 text-2xl">缘</span><h4 class="font-brush text-3xl">醉仙楼 · 结缘</h4></div>
        <p class="text-sm text-ink2">雅间焚香求签，结识江湖名宿、偶得神兵秘籍。</p>
        <div class="space-y-2 border-y border-line py-3">
          <div class="flex flex-wrap justify-between gap-2 text-sm tabular-nums">
            <span>已结缘 {{ store.gacha.pulls }} 次</span><b class="text-gold">距神品保底 {{ GACHA_HARD_PITY - store.gacha.pity }} 抽</b>
          </div>
          <div class="bar bar-gold"><i :style="{ width: (100 * store.gacha.pity / GACHA_HARD_PITY) + '%' }" /></div>
          <p class="hint">神品 {{ GACHA_BASE_RATES.red }}% · 绝品 {{ GACHA_BASE_RATES.orange }}% · 上品 {{ GACHA_BASE_RATES.purple }}% · 十连必出上品及以上</p>
        </div>
        <div class="workbench-toolbar">
          <WorkbenchDialog title="醉仙楼结缘概率公示" label="概率公示" wide>
            <ul class="space-y-1 text-xs leading-relaxed text-ink2">
              <li>· 单抽 {{ GACHA_SINGLE_COST }} 元宝，十连 {{ GACHA_TEN_COST }} 元宝。</li>
              <li>· 软保底：距上次神品第 {{ GACHA_SOFT_PITY_START }} 抽起，神品概率每抽 +{{ GACHA_SOFT_PITY_STEP }}%（提升部分从良品档扣除）。</li>
              <li>· 硬保底：第 {{ GACHA_HARD_PITY }} 抽必出神品，出神品后计数清零；保底为随机，不定向。</li>
              <li>· 含保底的神品<b class="text-ink">综合出率约 {{ gachaEffectiveRedRate().toFixed(2) }}%</b>（平均约 {{ Math.round(100 / gachaEffectiveRedRate()) }} 抽一次）。</li>
              <li>· 十连保底：十连至少一个上品及以上。</li>
              <li>· 绝品伙伴资质：上 {{ GACHA_ORANGE_TOP_GRADE_RATE }}% / 中 {{ 100 - GACHA_ORANGE_TOP_GRADE_RATE }}%。</li>
              <li>· 已拥有的伙伴转为其信物（神品 ×{{ GACHA_DUP_TOKENS.red }}、绝品 ×{{ GACHA_DUP_TOKENS.orange }}、上品 ×{{ GACHA_DUP_TOKENS.purple }}）；已有装备折算纹银，已会武学参悟 +1 重。</li>
              <li>· 剧情送的伙伴不进入卡池。</li>
            </ul>
            <div class="min-h-0 space-y-3 overflow-y-auto pr-1">
              <section v-for="t in RATE_TABLE" :key="t.tier" :class="TIER_META[t.tier].cls">
                <div class="mb-1 flex items-center justify-between border-b border-line pb-1">
                  <b class="font-brush text-lg" style="color: var(--tc)">{{ t.label }}</b>
                  <span class="tabular-nums text-sm">{{ fmtRate(t.rate) }}</span>
                </div>
                <ul class="grid grid-cols-2 gap-x-3 text-xs">
                  <li v-for="e in t.entries" :key="e.name" class="flex justify-between gap-2 py-0.5">
                    <span class="truncate">{{ e.name }}</span><span class="tabular-nums text-ink3">{{ fmtRate(e.rate) }}</span>
                  </li>
                </ul>
              </section>
            </div>
            <p class="text-[0.75rem] text-ink3">以上为单抽基础概率；演示版由本地模拟，正式版以服务端结果为准。</p>
          </WorkbenchDialog>
          <WorkbenchDialog title="结缘记录" label="结缘记录">
            <ol class="space-y-1 text-sm">
              <li v-if="!store.gacha.history.length" class="py-2 text-center text-ink3">尚未结缘。</li>
              <li v-for="h in store.gacha.history" :key="h.draw.pullNo" class="flex items-center gap-2" :class="TIER_META[h.draw.tier].cls">
                <span class="w-12 shrink-0 tabular-nums text-ink3">第{{ h.draw.pullNo }}抽</span>
                <span class="chip tier-chip py-0 text-[0.75rem]">{{ TIER_META[h.draw.tier].label }}</span>
                <b class="truncate">{{ h.name }}</b>
                <span class="truncate text-ink3">{{ h.detail }}</span>
              </li>
            </ol>
          </WorkbenchDialog>
        </div>
      </div>
    </div>
    <footer class="workbench-actions">
      <span class="mr-auto text-sm text-ink2">持有元宝 <b class="text-gold tabular-nums">{{ store.player.goldIngot.toLocaleString() }}</b></span>
      <button class="btn" :disabled="store.onlineActionBusy || store.player.goldIngot < GACHA_SINGLE_COST" @click="store.pullGacha(1)">结缘 ×1 · {{ GACHA_SINGLE_COST }} 元宝</button>
      <button class="btn btn-seal" :disabled="store.onlineActionBusy || store.player.goldIngot < GACHA_TEN_COST" @click="store.pullGacha(10)">结缘 ×10 · {{ GACHA_TEN_COST }} 元宝</button>
    </footer>
  </article>
  <div v-else-if="area === 'quests' && (hasReunion || hasFeast)" class="view-scroll grid content-start items-start gap-3 lg:grid-cols-2">
        <article v-if="store.reunionCandidates.length && store.featureOpen('GACHA')" class="well space-y-3 p-3.5">
          <div class="flex items-center gap-2"><span class="seal h-7 w-7 text-base">逢</span><b class="font-brush text-xl">故人寻访</b></div>
          <WorkbenchDialog title="故人寻访规则"><p class="hint">这些故人曾与你擦肩而过。日积月累打听线索（每日有数），集齐后赴故地相候、以礼相邀、了却前尘，便可重续前缘。也可直接以「故人重逢令」相邀。</p></WorkbenchDialog>
          <div v-for="id in store.reunionCandidates" :key="id" class="space-y-2 border-t border-line pt-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <b class="font-brush text-lg">{{ COMPANIONS[id].name }}</b>
              <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy || store.player.goldIngot < REUNION_TICKET_COST" @click="store.redeemReunionTicket(id)">
                <ItemIcon item-id="recruit-token" class="[--item-icon-size:1.4rem]" />
                重逢令 · {{ REUNION_TICKET_COST }} 元宝
              </button>
            </div>
            <!-- 四步进度 -->
            <ol class="grid grid-cols-4 gap-1 text-center text-[0.75rem]">
              <li
                v-for="(s, i) in REUNION_STEPS" :key="s.k" class="rounded-sm border px-1 py-1"
                :class="stepIdx(id) > i ? 'border-jade text-jade' : stepIdx(id) === i ? 'border-gold text-gold' : 'border-line text-ink3'"
              >{{ s.l }}</li>
            </ol>
            <!-- 1 打听线索 -->
            <template v-if="store.reunionView(id).step === 'CLUES'">
              <div class="bar bar-gold"><i :style="{ width: `${(store.reunionView(id).clues / REUNION_CLUE_TARGET) * 100}%` }" /></div>
              <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span class="tabular-nums text-ink2">线索 <b class="text-gold">{{ store.reunionView(id).clues }}</b> / {{ REUNION_CLUE_TARGET }} · 约还需 {{ daysLeft(id) }} 天</span>
                <span class="flex flex-wrap gap-1">
                  <span
                    v-for="(src, k) in REUNION_CLUE_SOURCES" :key="k" class="chip py-0 text-[0.75rem] tabular-nums"
                    :class="store.reunionView(id).got[k] >= src.dailyCap ? 'chip-jade' : ''" :title="src.hint"
                  >{{ src.label }} {{ store.reunionView(id).got[k] }}/{{ src.dailyCap }}</span>
                </span>
              </div>
              <button
                class="btn btn-sm w-full" :disabled="store.onlineActionBusy || store.reunionView(id).got.inn >= REUNION_CLUE_SOURCES.inn.dailyCap || store.player.silver < REUNION_INQUIRE_COST"
                @click="store.inquireReunion(id)"
              >
                向掌柜打听 · {{ REUNION_INQUIRE_COST }} 两（今日 {{ store.reunionView(id).got.inn }}/{{ REUNION_CLUE_SOURCES.inn.dailyCap }}）
              </button>
              <p class="text-[0.75rem] text-ink3">其余线索：离线 ≥1 小时后收功（闭关打听）；再次历练 {{ REUNION_QUESTS[id].replayNodeIds.map((n) => STORY_CHAPTERS[n - 1].code).join('、') }} 并获胜（旧地重游）。</p>
            </template>
            <!-- 2 故地相候 -->
            <template v-else-if="store.reunionView(id).step === 'WAIT'">
              <p class="text-xs text-ink2">{{ REUNION_QUESTS[id].waitText }}</p>
              <div class="bar bar-gold"><i :style="{ width: `${store.reunionView(id).waitRatio * 100}%` }" /></div>
              <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span class="tabular-nums text-ink2">
                  在【{{ mapName(REUNION_QUESTS[id].mapId) }}】累计相候 {{ Math.floor(store.reunionView(id).waitRatio * 100) }}%（共 {{ REUNION_WAIT_HOURS }} 小时，离线亦算）
                </span>
                <span class="flex gap-1.5">
                  <button v-if="store.player.currentMapId !== REUNION_QUESTS[id].mapId" class="btn btn-sm" :disabled="!!store.journeyMap" @click="store.travelTo(REUNION_QUESTS[id].mapId)">前往故地</button>
                  <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy || store.reunionView(id).waitRatio < 1" @click="store.completeReunionWait(id)">赴约</button>
                </span>
              </div>
            </template>
            <!-- 3 以礼相邀 -->
            <div v-else-if="store.reunionView(id).step === 'GIFT'" class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="text-ink2">备一份「{{ COMPANIONS[id].favGift }}」相邀</span>
              <button class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy || store.player.silver < INN_GIFT_COST" @click="store.reunionGift(id)">备礼 · {{ INN_GIFT_COST }} 两</button>
            </div>
            <!-- 4 了却前尘 -->
            <div v-else-if="store.reunionView(id).step === 'BATTLE'" class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div class="space-y-1 text-ink2">
                <p>强敌拦路：{{ REUNION_QUESTS[id].enemy.name }}（强度随你的等级）</p>
                <p>{{ REUNION_QUESTS[id].battleHint }}</p>
              </div>
              <button class="btn btn-sm btn-seal" :disabled="store.onlineActionBusy || store.isBattlePlaying" @click="store.reunionBattle(id)">拔剑相护</button>
            </div>
          </div>
        </article>

        <!-- 北丐·十道绝味：每日一道，食材需在各地挂机采办 -->
        <article v-if="store.feastActive && store.featureOpen('FEAST')" class="well space-y-2.5 p-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2"><span class="seal h-7 w-7 text-base">味</span><b class="font-brush text-xl">北丐 · 十道绝味</b></div>
            <span class="chip chip-gold tabular-nums">{{ store.feast.cooked.length }} / {{ DISHES.length }}</span>
          </div>
          <WorkbenchDialog title="十道绝味规则"><p class="hint">洪七公嘴刁，只认真心实意的好菜。在各地挂机 ≥{{ FEAST_GATHER_MINUTES }} 分钟后收功即可采得当地食材，每日可为他掌勺一道；十道呈齐，他便与你同行。</p></WorkbenchDialog>
          <p v-if="cookedToday" class="text-xs text-jade">今日已掌勺，明日子时再来。</p>
          <ul class="grid gap-1.5 sm:grid-cols-2">
            <li v-for="d in DISHES" :key="d.id" class="flex items-center gap-2 border border-line px-2 py-1.5 text-xs" :class="store.feast.cooked.includes(d.id) ? 'opacity-60' : ''">
              <span class="min-w-0 flex-1">
                <b class="block truncate text-sm" :class="store.feast.cooked.includes(d.id) ? 'text-jade' : ''">{{ d.name }}</b>
                <span class="block truncate text-ink3">{{ d.ingredient }} · {{ mapName(d.mapId) }}</span>
              </span>
              <span v-if="store.feast.cooked.includes(d.id)" class="chip chip-jade shrink-0">已呈上</span>
              <button
                v-else-if="store.feast.ingredients.includes(d.id)" class="btn btn-sm btn-gold shrink-0"
                :disabled="cookedToday || store.player.silver < d.silver" @click="store.cookDish(d.id)"
              >掌勺 · {{ d.silver }} 两</button>
              <span v-else class="chip shrink-0" :title="`在【${mapName(d.mapId)}】挂机 ≥${FEAST_GATHER_MINUTES} 分钟后收功`">待采办</span>
            </li>
          </ul>
        </article>
  </div>
  <div v-else class="workbench">
    <aside class="workbench-index" aria-label="伙伴花名册">
      <div class="workbench-toolbar" role="group" aria-label="筛选伙伴">
        <button v-for="option in filters" :key="option" class="btn btn-sm" :aria-pressed="filter === option" :class="{ 'btn-gold': filter === option }" @click="filter = option">{{ option }}</button>
      </div>
      <div class="workbench-scroll">
        <button v-for="guest in roster" :key="guest.id" class="workbench-entry" :aria-pressed="c?.id === guest.id" @click="selectedId = guest.id">
          <b class="min-w-0 flex-1 text-sm">{{ store.companionAffinity[guest.id]?.met ? guest.name : '未识侠客' }}</b>
          <small :class="ready(guest.id) ? 'text-gold' : 'text-ink3'">{{ canAwaken(guest.id) ? '可觉醒' : willTrigger(guest.id) ? '可传功' : store.companionAffinity[guest.id]?.met ? '好感 ' + store.companionAffinity[guest.id].affinity : TIER_META[guest.tier].label }}</small>
        </button>
        <p v-if="!roster.length" class="hint p-2">暂无符合条件的伙伴。</p>
      </div>
    </aside>
    <article v-if="c" class="workbench-detail" aria-label="宾客详情">
      <div :key="c.id" class="workbench-scroll space-y-3">
        <p v-if="store.jianghuTitle && !store.jianghuTitle.marketDiscount" class="well p-3 text-sm text-ink2">{{ store.jianghuTitle.greetingText }}</p>
          <article v-if="!store.companionAffinity[c.id]?.met" class="well flex gap-3 p-3 opacity-75">
            <div class="relative h-[6.2rem] w-[4.6rem] shrink-0 self-start overflow-hidden bg-[var(--bg-1)]">
              <div class="h-full w-full opacity-40 grayscale"><InkFigure :style-type="c.portraitStyle" /></div>
            </div>
            <div class="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              <h4 class="font-brush text-xl leading-none">？？？<span class="ml-1.5 font-sans text-xs tracking-normal text-ink3">{{ TIER_META[c.tier].label }} · 尚未结识</span></h4>
              <p class="text-xs leading-snug text-ink3">{{ c.meetHint ?? '推进主线与支线可结识' }}</p>
            </div>
          </article>
        <div v-else class="grid items-center gap-4 md:grid-cols-[minmax(9rem,25%)_minmax(0,1fr)]" :class="TIER_META[view(c.id).tier].cls">
          <div class="workbench-portrait h-32 md:h-64"><InkFigure :style-type="c.portraitStyle" :portrait-id="c.id" /></div>
          <div class="min-w-0 space-y-4">
              <div class="flex items-baseline justify-between gap-2">
                <h4 class="font-brush truncate text-xl leading-none">{{ c.name }}<span class="ml-1.5 font-sans text-xs tracking-normal text-ink3">{{ view(c.id).title }}</span></h4>
                <span class="flex shrink-0 items-center gap-1">
                  <span v-if="view(c.id).grade" class="chip py-0 text-[0.75rem]" :title="`橙品资质：属性系数 ×${GRADE_MULT[view(c.id).grade!]}`">橙·{{ view(c.id).grade }}</span>
                  <span v-if="view(c.id).form === 'awakened'" class="chip chip-red py-0 text-[0.75rem]">觉醒</span>
                  <span v-if="store.companionAffinity[c.id]?.taught" class="chip chip-gold">已传功</span>
                </span>
              </div>
              <p class="text-xs italic leading-snug text-ink3">“{{ c.poem }}”</p>

              <!-- 好感度：刻度 100 编入 / 600 传功 -->
              <div>
                <div class="relative">
                  <div class="bar bar-gold"><i :style="{ width: `${((store.companionAffinity[c.id]?.affinity ?? 0) / 1000) * 100}%` }" /></div>
                  <i class="absolute -top-0.5 left-[10%] h-2.5 w-px bg-ink3" /><i class="absolute -top-0.5 left-[60%] h-2.5 w-px bg-gold" />
                  <i v-if="store.limitsEnabled && store.affinityCap < 1000" class="absolute -top-1 h-3.5 w-0.5 bg-cinnabar" :style="{ left: `${store.affinityCap / 10}%` }" :title="`当前章节好感上限 ${store.affinityCap}`" />
                </div>
                <div class="relative mt-0.5 flex justify-between text-[0.75rem] tabular-nums leading-none text-ink3">
                  <b class="text-gold">{{ store.companionAffinity[c.id]?.affinity ?? 0 }} / 1000</b>
                  <span>编入 100 · 传功 600<template v-if="store.limitsEnabled && store.affinityCap < 1000"> · <b class="text-cinnabar">上限 {{ store.affinityCap }}</b></template></span>
                </div>
              </div>

              <div class="text-xs leading-snug text-jade">
                喜欢「{{ c.favGift }}」· 好感到 600 教<button class="underline" @click="store.inspectById('skill', c.teachSkillId)">《{{ SKILLS[c.teachSkillId]?.name }}》</button>
                <span class="tier-chip chip ml-1 py-0 text-[0.75rem]" :class="TIER_META[SKILLS[c.teachSkillId].tier].cls">{{ TIER_META[SKILLS[c.teachSkillId].tier].label }}</span>
              </div>
              <p v-if="willTrigger(c.id)" class="text-xs font-bold text-gold">本次送礼可获传武学。</p>
              <p v-if="c.recruitFlag && !store.companionAffinity[c.id]?.recruited && !store.storyFlags.includes(c.recruitFlag)" class="text-xs text-cinnabar">
                好感再高也请不动他：需先呈齐「十道绝味」，方肯同行。
              </p>
          </div>
        </div>
      </div>
      <footer v-if="store.companionAffinity[c.id]?.met" class="workbench-actions">
                <button class="btn btn-sm min-h-[2.4rem] flex-col gap-0" :disabled="giftDisabled(c.id, false)" @click="store.giftCompanionInInn(c.id, false)">
                  <span>清茶</span><span class="whitespace-nowrap text-[0.75rem] text-ink3">{{ INN_TEA_COST }}两 · +{{ store.innGiftGain(c.id, false) }}</span>
                  <span v-if="leftLabel(store.giftsLeft(c.id).tea)" class="text-[0.75rem] text-ink3">{{ leftLabel(store.giftsLeft(c.id).tea) }}</span>
                </button>
                <button
                  class="btn btn-sm btn-gold min-h-[2.4rem] flex-col gap-0" :class="willTrigger(c.id) ? 'anim-pulse-glow' : ''"
                  :disabled="giftDisabled(c.id, true)" @click="store.giftCompanionInInn(c.id, true)"
                >
                  <span class="flex max-w-full items-center gap-1.5"><ItemIcon item-id="world-gift" class="[--item-icon-size:1.4rem]" /><span class="truncate">{{ c.favGift }}</span></span>
                  <span class="whitespace-nowrap text-[0.75rem] opacity-80">{{ INN_GIFT_COST }}两 · +{{ store.innGiftGain(c.id, true) }}</span>
                  <span v-if="leftLabel(store.giftsLeft(c.id).gift)" class="text-[0.75rem] opacity-80">{{ leftLabel(store.giftsLeft(c.id).gift) }}</span>
                </button>
              <button
                v-if="c.awakened && store.companionAffinity[c.id]?.form === 'base'"
                class="btn btn-sm flex-col gap-0" :class="canAwaken(c.id) ? 'btn-seal anim-pulse-glow' : ''"
                :disabled="store.onlineActionBusy || !canAwaken(c.id)" :title="`觉醒为「${c.awakened.title}」：好感 ≥${awakenAffinityOf(c)}，消耗${tokenName(c)} ${c.awakenTokens ?? 30}${c.route === 'FAMILY' ? '（家事所得）' : ''}`" @click="store.awakenCompanion(c.id)"
              >
                <span>觉醒 · {{ c.awakened.title }}</span>
                <span class="text-[0.75rem] opacity-80">{{ tokenName(c) }} {{ store.companionAffinity[c.id]?.tokens ?? 0 }} / {{ c.awakenTokens ?? 30 }} · 需好感 {{ awakenAffinityOf(c) }}</span>
              </button>
      </footer>
    </article>
    <p v-else class="workbench-detail hint p-4">切换筛选可查看其他伙伴。</p>
  </div>
</template>
