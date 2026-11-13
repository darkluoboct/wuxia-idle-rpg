<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { apiClient, IS_MOCK_MODE } from '@/network/apiClient'
import { pillDoubleRate, pillSuccessRate } from '../../../shared/alchemy.ts'
import { recipeForPlayer, SNAKE_FEEDING_RECIPE } from '../../../shared/player.ts'
import { computeDerivedStats, mockDuelOpponent } from '@/network/mockEngine'
import {
  COMPANIONS,
  GRADE_MULT,
  HERBS,
  type HerbConfig,
  INN_GIFT_COST,
  INN_TEA_COST,
  MAPS,
  MEDICINES,
  PILL_RECIPES,
  type PillRecipeConfig,
  SKILLS,
  STORY_CHAPTERS,
  getMapHerbs,
} from '@/config/gameData'
import { STANCE_META, TIER_META } from '@/config/uiMeta'
import {
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
import type { StanceType, UniqueArtifactStatusDTO } from '@/network/protocol'
import InkFigure from '@/components/InkFigure.vue'
import HuashanLadder from '@/components/HuashanLadder.vue'
import EquipmentForge from '@/components/EquipmentForge.vue'

const store = useGameStore()
const sub = computed({
  get: () => store.marketTab,
  set: (value) => { store.marketTab = value },
})
const ghostMasked = ref(store.player.wearingMask)
watch(() => store.player.wearingMask, (masked) => { ghostMasked.value = masked })
const staff = ref<UniqueArtifactStatusDTO>()
const staffError = ref(false)
const artifacts = computed(() => IS_MOCK_MODE ? store.uniqueArtifacts : staff.value ? [staff.value] : [])
watch(sub, async (tab, _old, onCleanup) => {
  if (IS_MOCK_MODE || tab !== 'ARTIFACTS') return
  staff.value = undefined
  staffError.value = false
  let current = true
  onCleanup(() => { current = false })
  try {
    const result = await apiClient.request<{ staff: UniqueArtifactStatusDTO }>('GET', '/sect/dagou-staff')
    if (current) staff.value = result.staff
  } catch {
    if (current) staffError.value = true
  }
}, { immediate: true })

function enterGhostMarket() {
  sub.value = 'GHOST'
  store.toggleTheme(true) // 子时鬼市：自动切入玄墨夜色
}

const canAfford = (cost: number) => store.player.silver >= cost

/* ---------- 醉仙楼·结缘 ---------- */
const showRates = ref(false)
const showHistory = ref(false)
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
const todayKey = () => {
  const d = new Date(Date.now() + 3600_000)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
const cookedToday = computed(() => store.feast.lastCookDay === todayKey())

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
  return !!st && st.form === 'base' && st.recruited && st.affinity >= 600 && st.tokens >= need
}
/** 这一杯酒喝完好感是否会跨过 600（生死之交）门槛 */
function willTrigger(id: string) {
  const st = store.companionAffinity[id]
  return !!st && !st.taught && st.affinity < 600 && st.affinity + store.innGiftGain(id, true) >= 600
}
const innCompanions = computed(() => Object.values(COMPANIONS).filter((companion) => IS_MOCK_MODE || store.companionAffinity[companion.id]?.met))

/* 五绝（东邪 / 西毒 / 南帝 / 北丐 / 中神通），数据与策划案 01、08 册一致 */
const fiveGreats: { title: string; nickname: string; sect: string; stance: StanceType; poem: string }[] = [
  { title: '东邪', nickname: '陆乘云', sect: '东海桃花岛', stance: 'AGILE', poem: '一箫一剑平生意，负尽狂名十五年。' },
  { title: '西毒', nickname: '西域毒皇·欧阳烈', sect: '西域白驼山庄', stance: 'FIERCE', poem: '灵蛇出洞风云变，顺逆九阴我独尊。' },
  { title: '南帝', nickname: '渡厄居士·段无涯', sect: '大理天龙寺', stance: 'AGILE', poem: '一指洞明千重甲，枯荣禅里见真空。' },
  { title: '北丐', nickname: '萧峰传人·乔北冥', sect: '丐帮', stance: 'FIERCE', poem: '醉饮松鹤三十碗，亢龙有悔震关山。' },
  { title: '中神通', nickname: '重阳首座·清风道长', sect: '终南全真教', stance: 'TAICHI', poem: '终南云起先天炁，太极圆转万法空。' },
]

function fiveGreatsOpponent(p: (typeof fiveGreats)[0]) {
  const entry = {
    id: `fg_${p.title}`,
    nickname: p.nickname,
    sectName: p.sect,
    realmName: '一代宗师',
    level: 65,
    stance: p.stance,
    isBetrayerBounty: false,
    isEscortingDart: false,
  }
  const { player, loadout } = mockDuelOpponent(entry, store.player.currentMapId)
  return { ...entry, combatPower: computeDerivedStats(player, loadout).combatPower }
}

// =========================================================================
// 百草丹房与神农炼制系统
// =========================================================================
const selectedRecipeId = ref<string>(IS_MOCK_MODE ? 'recipe_tongmai_dan' : 'recipe_chunyang_jindan')
const selectedRecipe = computed(() => recipeForPlayer(PILL_RECIPES[selectedRecipeId.value] ?? Object.values(PILL_RECIPES)[0], store.player))
const recipeFilter = ref<'ALL' | 'ACUPOINT' | 'BATTLE'>('ALL')
const showHerbAtlas = ref(false)

const filteredRecipes = computed(() => {
  const all = Object.values(PILL_RECIPES).filter((recipe) => IS_MOCK_MODE || recipe.category !== 'BODY')
  if (recipeFilter.value === 'ALL') return all
  return all.filter((r) => r.category === recipeFilter.value)
})

function canCraftRecipe(recipe: PillRecipeConfig) {
  if (store.martialStats.intStat < recipe.minInsight) return false
  if (store.player.qiExp < recipe.costQi) return false
  if (store.player.silver < recipe.costSilver) return false
  return recipe.requiredHerbs.every((req) => (store.herbInventory[req.herbId] ?? 0) >= req.count)
}

function calcCraftRate(recipe: PillRecipeConfig) {
  return pillSuccessRate(recipe, store.martialStats, store.alchemyPity[recipe.id])
}

function calcDoubleRate() {
  return pillDoubleRate(store.martialStats)
}

const currentMapHerbs = computed(() => getMapHerbs(store.player.currentMapId))
const currentMapConfig = computed(() => MAPS.find((m) => m.id === store.player.currentMapId) ?? MAPS[0])

const FLAME_META = {
  WEN: { name: '文火温养', cls: 'text-jade', desc: '文火细熬，药力清润平缓，最宜冲穴通络' },
  WU: { name: '武火猛炼', cls: 'text-gold', desc: '武火烈焰，真火逼退阴杂，药劲纯阳猛烈' },
  SAMADHI: { name: '三昧真火', cls: 'text-crimson', desc: '玄门三昧，紫焰滔天九蒸九晒，丹成异象' },
} as const
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist">
          <button class="tab" role="tab" :aria-selected="sub === 'INN'" @click="sub = 'INN'">醉仙客栈</button>
          <button class="tab" role="tab" :aria-selected="sub === 'GHOST'" @click="enterGhostMarket()">子时鬼市</button>
          <button class="tab" role="tab" :aria-selected="sub === 'ALCHEMY'" @click="sub = 'ALCHEMY'">百草丹房</button>
          <button class="tab" role="tab" :aria-selected="sub === 'HUASHAN'" @click="sub = 'HUASHAN'">华山论剑</button>
          <button class="tab" role="tab" :aria-selected="sub === 'ARTIFACTS'" @click="sub = 'ARTIFACTS'">兵器谱</button>
        </div>
        <span class="flex items-center gap-1.5 text-xs text-ink3">
          真气 <b class="text-sm tabular-nums text-jade">{{ store.player.qiExp.toLocaleString() }}</b> ·
          纹银 <b class="text-sm tabular-nums text-ink">{{ store.player.silver.toLocaleString() }}</b>
          <template v-if="sub === 'GHOST' || sub === 'INN'"> · 元宝 <b class="text-sm tabular-nums text-gold">{{ store.player.goldIngot }}</b></template>
          <template v-if="sub === 'ALCHEMY'"> · 药渣 <b class="text-sm tabular-nums text-gold">{{ store.furnaceResidue }}</b> 团</template>
        </span>
      </div>

      <!-- ============ 醉仙客栈 ============ -->
      <div v-if="sub === 'INN'" class="view-scroll -mr-1 space-y-3 pr-1">
        <p v-if="store.jianghuTitle && !store.jianghuTitle.marketDiscount" class="well p-3 text-sm text-ink2">{{ store.jianghuTitle.greetingText }}</p>
        <!-- 醉仙楼·结缘（抽卡入口） -->
        <article v-if="IS_MOCK_MODE" class="well relative overflow-hidden p-4" style="background-image: radial-gradient(ellipse at 100% 0, color-mix(in srgb, var(--tier-red) 14%, transparent), transparent 60%)">
          <div class="relative grid items-center gap-3 md:grid-cols-[1fr_auto]">
            <div class="min-w-0">
              <div class="flex items-center gap-2.5">
                <span class="seal h-9 w-9 text-xl">缘</span>
                <h4 class="font-brush text-2xl leading-none">醉仙楼 · 结缘</h4>
              </div>
              <p class="hint mt-1.5">雅间焚香求签，结识江湖名宿、偶得神兵秘籍。神品 {{ GACHA_BASE_RATES.red }}% · 绝品 {{ GACHA_BASE_RATES.orange }}% · 上品 {{ GACHA_BASE_RATES.purple }}%；第 {{ GACHA_HARD_PITY }} 抽必出神品，十连必出上品及以上。</p>
              <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span class="chip tabular-nums">已结缘 {{ store.gacha.pulls }} 次</span>
                <span class="chip chip-gold tabular-nums">距神品保底 {{ GACHA_HARD_PITY - store.gacha.pity }} 抽</span>
                <button class="chip underline-offset-2 hover:underline" @click="showRates = true">概率公示</button>
                <button class="chip underline-offset-2 hover:underline" :aria-expanded="showHistory" @click="showHistory = !showHistory">结缘记录</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 md:flex">
              <button class="btn !min-h-[2.8rem] flex-col !gap-0 md:min-w-[7rem]" :disabled="store.player.goldIngot < GACHA_SINGLE_COST" @click="store.pullGacha(1)">
                <span>结缘 ×1</span><span class="text-[0.7rem] text-ink3">{{ GACHA_SINGLE_COST }} 元宝</span>
              </button>
              <button class="btn btn-seal !min-h-[2.8rem] flex-col !gap-0 md:min-w-[7rem]" :disabled="store.player.goldIngot < GACHA_TEN_COST" @click="store.pullGacha(10)">
                <span>结缘 ×10</span><span class="text-[0.7rem] opacity-80">{{ GACHA_TEN_COST }} 元宝</span>
              </button>
            </div>
          </div>
          <ol v-if="showHistory" class="relative mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-line pt-2 text-xs">
            <li v-if="!store.gacha.history.length" class="py-2 text-center text-ink3">尚未结缘。</li>
            <li v-for="h in store.gacha.history" :key="h.draw.pullNo" class="flex items-center gap-2" :class="TIER_META[h.draw.tier].cls">
              <span class="w-12 shrink-0 tabular-nums text-ink3">第{{ h.draw.pullNo }}抽</span>
              <span class="chip tier-chip !py-0 !text-[0.62rem]">{{ TIER_META[h.draw.tier].label }}</span>
              <b class="truncate">{{ h.name }}</b>
              <span class="truncate text-ink3">{{ h.detail }}</span>
            </li>
          </ol>
        </article>

        <!-- 故人寻访：错过的剧情伙伴。免费线约 30 天；重逢令可随时跳过 -->
        <article v-if="store.reunionCandidates.length" class="well space-y-3 p-3.5">
          <div class="flex items-center gap-2"><span class="seal h-7 w-7 text-base">逢</span><b class="font-brush text-xl">故人寻访</b></div>
          <p class="hint">这些故人曾与你擦肩而过。日积月累打听线索（每日有数），集齐后赴故地相候、以礼相邀、了却前尘，便可重续前缘。<template v-if="IS_MOCK_MODE">也可直接以「故人重逢令」相邀。</template></p>
          <div v-for="id in store.reunionCandidates" :key="id" class="space-y-2 border-t border-line pt-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <b class="font-brush text-lg">{{ COMPANIONS[id].name }}</b>
              <button v-if="IS_MOCK_MODE" class="btn btn-sm btn-gold" :disabled="store.player.goldIngot < REUNION_TICKET_COST" @click="store.redeemReunionTicket(id)">
                重逢令 · {{ REUNION_TICKET_COST }} 元宝
              </button>
            </div>
            <!-- 四步进度 -->
            <ol class="grid grid-cols-4 gap-1 text-center text-[0.7rem]">
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
                    v-for="(src, k) in REUNION_CLUE_SOURCES" :key="k" class="chip !py-0 !text-[0.65rem] tabular-nums"
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
              <p class="text-[0.7rem] text-ink3">其余线索：离线 ≥1 小时后收功（闭关打听）；再次历练 {{ REUNION_QUESTS[id].replayNodeIds.map((n) => STORY_CHAPTERS[n - 1].code).join('、') }} 并获胜（旧地重游）。</p>
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
        <article v-if="IS_MOCK_MODE && store.feastActive" class="well space-y-2.5 p-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2"><span class="seal h-7 w-7 text-base">味</span><b class="font-brush text-xl">北丐 · 十道绝味</b></div>
            <span class="chip chip-gold tabular-nums">{{ store.feast.cooked.length }} / {{ DISHES.length }}</span>
          </div>
          <p class="hint">洪七公嘴刁，只认真心实意的好菜。在各地挂机 ≥{{ FEAST_GATHER_MINUTES }} 分钟后收功即可采得当地食材，每日可为他掌勺一道；十道呈齐，他便与你同行。</p>
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

        <p class="hint">
          请客送礼能增加好感。好感到 <b class="text-ink">100</b> 可邀请符合条件的伙伴上阵，到 <b class="text-gold">600</b> 可获传功。
        </p>
        <div class="grid gap-3 lg:grid-cols-2">
          <template v-for="c in innCompanions" :key="c.id">
          <!-- 尚未结识：只露剪影与线索 -->
          <article v-if="!store.companionAffinity[c.id]?.met" class="well flex gap-3 p-3 opacity-75">
            <div class="relative h-[6.2rem] w-[4.6rem] shrink-0 self-start overflow-hidden bg-[var(--bg-1)]">
              <div class="h-full w-full opacity-40 grayscale"><InkFigure :style-type="c.portraitStyle" /></div>
            </div>
            <div class="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              <h4 class="font-brush text-xl leading-none">？？？<span class="ml-1.5 font-sans text-xs tracking-normal text-ink3">{{ TIER_META[c.tier].label }} · 尚未结识</span></h4>
              <p class="text-xs leading-snug text-ink3">{{ c.meetHint ?? '推进主线与支线可结识' }}</p>
            </div>
          </article>
          <article
            v-else class="well flex gap-3 p-3"
            :class="[TIER_META[view(c.id).tier].cls]"
          >
            <div class="relative h-[6.2rem] w-[4.6rem] shrink-0 self-start overflow-hidden bg-[var(--bg-1)] tier-edge">
              <InkFigure :style-type="c.portraitStyle" />
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="flex items-baseline justify-between gap-2">
                <h4 class="font-brush truncate text-xl leading-none">{{ c.name }}<span class="ml-1.5 font-sans text-xs tracking-normal text-ink3">{{ view(c.id).title }}</span></h4>
                <span class="flex shrink-0 items-center gap-1">
                  <span v-if="view(c.id).grade" class="chip !py-0 !text-[0.68rem]" :title="`橙品资质：属性系数 ×${GRADE_MULT[view(c.id).grade!]}`">橙·{{ view(c.id).grade }}</span>
                  <span v-if="view(c.id).form === 'awakened'" class="chip chip-red !py-0 !text-[0.68rem]">觉醒</span>
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
                <div class="relative mt-0.5 flex justify-between text-[0.7rem] tabular-nums leading-none text-ink3">
                  <b class="text-gold">{{ store.companionAffinity[c.id]?.affinity ?? 0 }} / 1000</b>
                  <span>编入 100 · 传功 600<template v-if="store.limitsEnabled && store.affinityCap < 1000"> · <b class="text-cinnabar">上限 {{ store.affinityCap }}</b></template></span>
                </div>
              </div>

              <div class="text-xs leading-snug text-jade">
                喜欢「{{ c.favGift }}」· 好感到 600 教《{{ SKILLS[c.teachSkillId]?.name }}》
                <span class="tier-chip chip ml-1 !py-0 !text-[0.68rem]" :class="TIER_META[SKILLS[c.teachSkillId].tier].cls">{{ TIER_META[SKILLS[c.teachSkillId].tier].label }}</span>
              </div>
              <p v-if="willTrigger(c.id)" class="text-xs font-bold text-gold">再奉一杯爱物，即可触发「倾囊传功」！</p>
              <p v-if="c.recruitFlag && !store.companionAffinity[c.id]?.recruited && !store.storyFlags.includes(c.recruitFlag)" class="text-xs text-cinnabar">
                好感再高也请不动他：需先呈齐「十道绝味」，方肯同行。
              </p>

              <div class="mt-auto grid grid-cols-2 gap-1.5">
                <button class="btn btn-sm !min-h-[2.4rem] flex-col !gap-0" :disabled="giftDisabled(c.id, false)" @click="store.giftCompanionInInn(c.id, false)">
                  <span>清茶</span><span class="text-[0.7rem] text-ink3">{{ INN_TEA_COST }} 两 · +{{ store.innGiftGain(c.id, false) }} {{ leftLabel(store.giftsLeft(c.id).tea) }}</span>
                </button>
                <button
                  class="btn btn-sm btn-gold !min-h-[2.4rem] flex-col !gap-0" :class="willTrigger(c.id) ? 'anim-pulse-glow' : ''"
                  :disabled="giftDisabled(c.id, true)" @click="store.giftCompanionInInn(c.id, true)"
                >
                  <span class="max-w-full truncate">{{ c.favGift }}</span><span class="text-[0.7rem] opacity-80">{{ INN_GIFT_COST }} 两 · +{{ store.innGiftGain(c.id, true) }} {{ leftLabel(store.giftsLeft(c.id).gift) }}</span>
                </button>
              </div>

              <!-- 觉醒进阶：好感 600 + 伙伴信物 -->
              <button
                v-if="IS_MOCK_MODE && c.awakened && store.companionAffinity[c.id]?.form === 'base'"
                class="btn btn-sm w-full flex-col !gap-0" :class="canAwaken(c.id) ? 'btn-seal anim-pulse-glow' : ''"
                :disabled="!canAwaken(c.id)" :title="`觉醒为「${c.awakened.title}」：好感 ≥600，消耗信物 ${c.awakenTokens ?? 30}`" @click="store.awakenCompanion(c.id)"
              >
                <span>觉醒 · {{ c.awakened.title }}</span>
                <span class="text-[0.7rem] opacity-80">信物 {{ store.companionAffinity[c.id]?.tokens ?? 0 }} / {{ c.awakenTokens ?? 30 }} · 需好感 600</span>
              </button>
            </div>
          </article>
          </template>
        </div>
      </div>

      <!-- ============ 子时鬼市 ============ -->
      <div v-else-if="sub === 'GHOST'" class="view-scroll -mr-1 space-y-3 pr-1">
        <p v-if="store.jianghuTitle?.marketDiscount" class="well p-3 text-sm text-ink2">{{ store.jianghuTitle.greetingText }}</p>
        <EquipmentForge reforge />
        <div class="well relative overflow-hidden p-4" style="background-image: radial-gradient(ellipse at 92% 0, color-mix(in srgb, var(--tier-purple) 18%, transparent), transparent 55%)">
          <div class="pointer-events-none absolute right-5 top-3 h-10 w-10 rounded-full bg-[#e9eeff] opacity-70 shadow-[0_0_2rem_0.4rem_rgba(180,200,255,0.35)]" />
          <div class="relative space-y-3">
            <div>
              <h4 class="font-brush text-xl leading-none">鬼市旧物摊</h4>
              <p class="hint mt-1.5">正派门人未蒙面时可能被盘查，基础扣 25 点侠义。假面飘萍四件套鉴宝半价，子时可避开盘查。悟性或福缘达到 28，就能认出摊上的玄铁重剑。</p>
            </div>
            <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
              <button class="flex items-center gap-2 text-sm" role="switch" :aria-checked="ghostMasked" :disabled="store.onlineActionBusy" @click="ghostMasked = !ghostMasked">
                <span class="switch" :aria-checked="ghostMasked" /> 戴上蒙面巾
              </button>
              <button class="btn btn-gold" :disabled="store.onlineActionBusy || !canAfford(store.ghostAppraiseCost)" @click="store.appraiseGhostCurio(ghostMasked)">
                鉴宝 · {{ store.ghostAppraiseCost }} 两
              </button>
            </div>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <article
            v-for="item in store.ghostListings" :key="item.id" class="well flex flex-col gap-2 p-3"
            :class="[TIER_META[item.tier].cls, 'tier-edge', item.tier === 'red' ? 'glow-border' : '']"
          >
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-brush tier-text text-xl leading-tight">{{ item.itemName }}</h4>
              <span class="chip shrink-0" :class="item.listingType === 'AUCTION' ? 'chip-gold' : ''">{{ item.listingType === 'AUCTION' ? '竞拍' : '一口价' }}</span>
            </div>
            <div class="flex flex-wrap gap-1"><span class="chip tier-chip">{{ TIER_META[item.tier].label }}</span></div>
            <p class="hint">{{ item.desc }}</p>
            <div class="text-xs text-ink3">摊主 {{ item.maskedSeller }}<template v-if="item.highestBidderMasked"> · 领先 <b class="text-ink2">{{ item.highestBidderMasked }}</b></template></div>
            <div class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
              <span class="text-base font-bold tabular-nums text-gold">
                <s v-if="store.ghostListingPrice(item) < item.price" class="mr-1 text-xs font-normal text-ink3">{{ item.price.toLocaleString() }}</s>
                {{ store.ghostListingPrice(item).toLocaleString() }}<span class="ml-1 text-xs font-normal">{{ item.currency === 'GOLD' ? '元宝' : '两纹银' }}</span>
              </span>
              <button class="btn btn-sm" :disabled="store.onlineActionBusy || (item.currency === 'SILVER' && !canAfford(store.ghostListingPrice(item)))"
                @click="store.buyOrBidMarketListing(item.id)">{{ item.listingType === 'AUCTION' ? '加价 50 元宝' : '买下' }}</button>
            </div>
          </article>
          <p v-if="!store.ghostListings.length" class="col-span-full py-10 text-center text-sm text-ink3">鬼市的货已经卖完了。</p>
        </div>
      </div>

      <HuashanLadder v-else-if="sub === 'HUASHAN' && !IS_MOCK_MODE" />

      <!-- ============ 百草丹房：神农炼制与采药寻草 ============ -->
      <div v-else-if="sub === 'ALCHEMY'" class="view-scroll -mr-1 space-y-3 pr-1">
        <p v-if="store.player.snakeFeedingRecipe && selectedRecipe.id === SNAKE_FEEDING_RECIPE" class="hint">白驼蛇药饲喂方已生效，炼制蝮蛇见血膏少用 1 株蛇涎草。</p>
        <!-- 顶栏：百草鼎炉概况与药渣回炉 -->
        <div class="well relative overflow-hidden p-3.5" style="background-image: radial-gradient(ellipse at 88% 10%, color-mix(in srgb, var(--gold-soft) 30%, transparent), transparent 60%)">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <h4 class="font-brush text-2xl text-gold">神农八卦鼎 · 丹房炼制</h4>
                <span class="chip chip-gold">百草炼真</span>
              </div>
              <p class="hint text-xs">
                文火温养，武火透骨，三昧化形。悟性察秋毫火候（悟性越高成功率与双丹暴率越高），福缘契天地机锋。丹药可免真气冲穴破关，亦可临阵锁血逆转死局！
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <div class="rounded border border-line bg-[var(--bg-2)] px-2.5 py-1 text-xs">
                <span class="text-ink3">悟性加成 </span>
                <b class="text-jade">+{{ Math.max(0, (store.martialStats.intStat - 20) * 1.5).toFixed(0) }}%</b>
              </div>
              <div class="rounded border border-line bg-[var(--bg-2)] px-2.5 py-1 text-xs">
                <span class="text-ink3">双丹暴率 </span>
                <b class="text-gold">{{ calcDoubleRate() }}%</b>
              </div>
              <button
                class="btn btn-sm"
                :class="store.furnaceResidue >= 5 ? 'btn-gold anim-pulse-glow' : ''"
                :disabled="store.onlineActionBusy || store.furnaceResidue < 5"
                @click="store.exchangeFurnaceResidue()"
              >
                药渣萃精 ({{ store.furnaceResidue }}/5)
              </button>
            </div>
          </div>

          <!-- 当前地图采集快捷条 -->
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5 text-xs">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-ink3">当前驻留：</span>
              <span class="font-bold text-ink">【{{ currentMapConfig.name }}】</span>
              <span v-if="currentMapHerbs.length" class="text-ink3">可采：</span>
              <span
                v-for="h in currentMapHerbs"
                :key="h.id"
                class="chip !py-0 !text-[0.68rem]"
                :class="[TIER_META[h.tier].cls, (store.herbInventory[h.id] ?? 0) > 0 ? 'border-line' : 'opacity-60']"
              >
                {{ h.name }} ({{ store.herbInventory[h.id] ?? 0 }})
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button v-if="currentMapHerbs.length" class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy" @click="store.forageHerbs()">
                采药寻草 · 200真气
              </button>
              <button class="btn btn-sm" @click="showHerbAtlas = !showHerbAtlas">
                {{ showHerbAtlas ? '收起药材总览' : '百草药篓全览' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 可折叠：全图十六味药材百草图谱与背包储量 -->
        <div v-if="showHerbAtlas" class="well space-y-3 p-3 tier-edge">
          <div class="flex items-center justify-between border-b border-line pb-1.5">
            <h5 class="font-brush text-lg text-ink">神州百草名录与药篓储量（共十六味名草）</h5>
            <span class="text-xs text-ink3">巡历挂机与地图采药均可获取</span>
          </div>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div
              v-for="herb in Object.values(HERBS)"
              :key="herb.id"
              class="rounded border border-line bg-[var(--bg-1)] p-2.5 transition-colors"
              :class="TIER_META[herb.tier].cls"
            >
              <div class="flex items-center justify-between gap-1">
                <span class="font-bold tier-text text-sm">{{ herb.name }}</span>
                <span class="chip tier-chip !py-0 !text-[0.65rem]">{{ TIER_META[herb.tier].label }}</span>
              </div>
              <div class="mt-1 flex items-baseline justify-between text-xs">
                <span class="text-ink3">储量</span>
                <b class="text-sm tabular-nums" :class="(store.herbInventory[herb.id] ?? 0) > 0 ? 'text-gold' : 'text-ink3'">
                  {{ store.herbInventory[herb.id] ?? 0 }}
                </b>
              </div>
              <div class="mt-1 text-[0.7rem] text-ink3 truncate">
                产地：{{ herb.mapName }}
              </div>
              <p class="mt-1 text-[0.68rem] leading-tight text-ink3/80 line-clamp-2">
                {{ herb.desc }}
              </p>
            </div>
          </div>
        </div>

        <!-- 丹房主工作台：左侧丹方名录，右侧炼丹神鼎 -->
        <div class="grid gap-3 lg:grid-cols-12">
          <!-- 左侧：丹方名录 -->
          <div class="space-y-2 lg:col-span-5">
            <div class="flex items-center justify-between">
              <div class="tabs !gap-1" role="tablist">
                <button class="tab !px-2.5 !py-1 !text-xs" :aria-selected="recipeFilter === 'ALL'" @click="recipeFilter = 'ALL'">全部丹方</button>
                <button class="tab !px-2.5 !py-1 !text-xs" :aria-selected="recipeFilter === 'ACUPOINT'" @click="recipeFilter = 'ACUPOINT'">冲穴圣药</button>
                <button class="tab !px-2.5 !py-1 !text-xs" :aria-selected="recipeFilter === 'BATTLE'" @click="recipeFilter = 'BATTLE'">对决灵丹</button>
              </div>
              <span class="text-[0.72rem] text-ink3">共 {{ filteredRecipes.length }} 卷</span>
            </div>

            <div class="space-y-2">
              <article
                v-for="r in filteredRecipes"
                :key="r.id"
                class="well flex cursor-pointer flex-col gap-1.5 p-3 transition-all"
                :class="[
                  TIER_META[r.tier].cls,
                  selectedRecipeId === r.id ? 'border-gold !bg-[var(--bg-1)] shadow-[0_0_12px_rgba(212,175,55,0.25)]' : 'hover:border-line',
                ]"
                @click="selectedRecipeId = r.id"
              >
                <div class="flex items-center justify-between gap-2">
                  <h5 class="font-brush tier-text text-base leading-tight">{{ r.name }}</h5>
                  <span class="chip tier-chip shrink-0 !py-0 !text-[0.68rem]">{{ TIER_META[r.tier].label }}</span>
                </div>

                <div class="flex items-center justify-between text-xs">
                  <span class="text-ink2 font-sans font-bold">
                    {{ MEDICINES[r.targetMedicineId]?.name }}
                    <small class="text-ink3">库存 {{ (r.category === 'BATTLE' ? store.player.battleMedicines?.[r.targetMedicineId] : store.pillInventory[r.targetMedicineId]) ?? 0 }}</small>
                  </span>
                  <span class="chip !py-0 !text-[0.65rem]" :class="FLAME_META[r.furnaceFlame].cls">
                    {{ FLAME_META[r.furnaceFlame].name }}
                  </span>
                </div>

                <!-- 药材满足度预览 -->
                <div class="flex items-center justify-between border-t border-line/40 pt-1.5 text-[0.72rem]">
                  <span :class="canCraftRecipe(r) ? 'text-jade font-bold' : 'text-crimson'">
                    {{ canCraftRecipe(r) ? '材料齐备 · 随时可炼' : '药材尚缺' }}
                  </span>
                  <span class="tabular-nums text-gold">成率 ~{{ calcCraftRate(r) }}%</span>
                </div>
              </article>
            </div>
          </div>

          <!-- 右侧：神农炼药神鼎面板 -->
          <div class="well space-y-3 p-4 tier-edge lg:col-span-7">
            <!-- 鼎炉头部 -->
            <div class="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-brush tier-text text-2xl leading-none">{{ selectedRecipe.name }}</h4>
                  <span class="chip tier-chip">{{ TIER_META[selectedRecipe.tier].label }}</span>
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span class="chip chip-gold">产出丹药：{{ MEDICINES[selectedRecipe.targetMedicineId]?.name }}</span>
                  <span class="chip" :class="FLAME_META[selectedRecipe.furnaceFlame].cls">
                    {{ FLAME_META[selectedRecipe.furnaceFlame].name }}
                  </span>
                  <span class="text-ink3">背包已有：<b class="text-gold tabular-nums">{{ store.pillInventory[selectedRecipe.targetMedicineId] ?? 0 }}</b> 丸</span>
                </div>
              </div>
            </div>

            <!-- 丹药实效与火候古训 -->
            <div class="rounded border border-line bg-[var(--bg-2)] p-2.5 text-xs space-y-1">
              <div class="text-jade font-bold">
                【灵丹效用】{{ MEDICINES[selectedRecipe.targetMedicineId]?.effectDesc }}
              </div>
              <div class="text-ink3 italic">
                “{{ selectedRecipe.desc }}”
              </div>
              <div class="text-gold text-[0.72rem]">
                火候提点：{{ selectedRecipe.flameHint }}
              </div>
            </div>

            <!-- 所需配方药材矩阵 -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-ink">配方药材需求</span>
                <span class="text-ink3">需从各名川大泽寻采</span>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <div
                  v-for="req in selectedRecipe.requiredHerbs"
                  :key="req.herbId"
                  class="flex items-center justify-between rounded border border-line p-2 text-xs"
                  :class="(store.herbInventory[req.herbId] ?? 0) >= req.count ? 'bg-jade/5 border-jade/30' : 'bg-crimson/5 border-crimson/30'"
                >
                  <div class="min-w-0">
                    <div class="font-bold truncate" :class="TIER_META[HERBS[req.herbId]?.tier ?? 'green'].cls">
                      {{ HERBS[req.herbId]?.name }}
                    </div>
                    <div class="text-[0.68rem] text-ink3 truncate">
                      产地：{{ HERBS[req.herbId]?.mapName }}
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <span
                      class="text-sm font-bold tabular-nums"
                      :class="(store.herbInventory[req.herbId] ?? 0) >= req.count ? 'text-jade' : 'text-crimson'"
                    >
                      {{ store.herbInventory[req.herbId] ?? 0 }}
                    </span>
                    <span class="text-ink3 text-xs"> / {{ req.count }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 炼制工本与悟性门槛 -->
            <div class="grid grid-cols-3 gap-2 border-t border-line pt-2 text-center text-xs">
              <div class="rounded border border-line bg-[var(--bg-1)] p-2">
                <div class="text-ink3">消耗真气</div>
                <div class="mt-0.5 font-bold tabular-nums" :class="store.player.qiExp >= selectedRecipe.costQi ? 'text-jade' : 'text-crimson'">
                  {{ selectedRecipe.costQi.toLocaleString() }}
                </div>
              </div>
              <div class="rounded border border-line bg-[var(--bg-1)] p-2">
                <div class="text-ink3">工本纹银</div>
                <div class="mt-0.5 font-bold tabular-nums" :class="store.player.silver >= selectedRecipe.costSilver ? 'text-ink' : 'text-crimson'">
                  {{ selectedRecipe.costSilver }} 两
                </div>
              </div>
              <div class="rounded border border-line bg-[var(--bg-1)] p-2">
                <div class="text-ink3">门槛悟性</div>
                <div class="mt-0.5 font-bold tabular-nums" :class="store.martialStats.intStat >= selectedRecipe.minInsight ? 'text-gold' : 'text-crimson'">
                  {{ store.martialStats.intStat }} / {{ selectedRecipe.minInsight }}
                </div>
              </div>
            </div>

            <!-- 炼制成率仪表盘 -->
            <div class="space-y-1 rounded border border-gold/30 bg-gold/5 p-2.5 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-bold text-gold">预计炼丹成率</span>
                <span class="font-bold tabular-nums text-sm text-gold">{{ calcCraftRate(selectedRecipe) }}%</span>
              </div>
              <div class="bar bar-gold">
                <i :style="{ width: `${calcCraftRate(selectedRecipe)}%` }" />
              </div>
              <div class="flex flex-wrap items-center justify-between text-[0.7rem] text-ink3">
                <span>基础 {{ selectedRecipe.baseRate }}% · 悟性加成 +{{ Math.max(0, (store.martialStats.intStat - selectedRecipe.minInsight) * 1.5).toFixed(0) }}% · 福缘 +{{ (store.martialStats.luck * 0.4).toFixed(0) }}%<template v-if="(store.alchemyPity[selectedRecipe.id] ?? 0) > 0"> · 保底 +{{ store.alchemyPity[selectedRecipe.id] }}%</template></span>
                <span class="text-gold font-bold">双丹暴击率：{{ calcDoubleRate() }}%</span>
              </div>
            </div>

            <!-- 起炉炼丹按钮 -->
            <div class="pt-1">
              <button
                class="btn btn-gold btn-block !py-2.5 text-base font-bold shadow-lg"
                :disabled="store.onlineActionBusy || !canCraftRecipe(selectedRecipe)"
                @click="store.refinePill(selectedRecipe.id)"
              >
                起炉炼丹 · 耗 {{ selectedRecipe.costQi.toLocaleString() }} 真气
              </button>
              <p v-if="!canCraftRecipe(selectedRecipe)" class="mt-1 text-center text-xs text-crimson">
                {{ store.martialStats.intStat < selectedRecipe.minInsight ? `悟性需达 ${selectedRecipe.minInsight} 点方可控炉` : '药材、真气或纹银不足，无法起炉' }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ 华山论剑：五绝石碑 ============ -->
      <div v-else-if="sub === 'HUASHAN'" class="view-scroll -mr-1 space-y-3 pr-1">
        <p class="hint">先看看对手用什么打法。去武库选能克制他的打法，再来华山切磋。</p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1900px]:grid-cols-5">
          <article v-for="fg in fiveGreats" :key="fg.title" class="well relative flex flex-col gap-2.5 overflow-hidden p-3">
            <div class="pointer-events-none absolute inset-0" style="background: linear-gradient(180deg, var(--gold-soft), transparent 55%)" />
            <div class="relative flex gap-3">
              <div class="vertical-rl font-brush shrink-0 border-x border-gold px-1.5 py-2 text-[2.1rem] leading-none tracking-[0.2em] text-gold">{{ fg.title }}</div>
              <div class="min-w-0 space-y-1.5">
                <div class="text-sm font-bold leading-snug">{{ fg.nickname }}</div>
                <div class="text-xs text-ink3">{{ fg.sect }}</div>
                <span class="chip">打法 · {{ STANCE_META[fg.stance].name }}</span>
              </div>
            </div>
            <p class="relative text-xs italic leading-snug text-ink3">“{{ fg.poem }}”</p>
            <div class="relative mt-auto space-y-2">
              <div class="flex items-baseline justify-between text-xs"><span class="text-ink3">战力</span><b class="text-sm tabular-nums text-gold">{{ fiveGreatsOpponent(fg).combatPower.toLocaleString() }}</b></div>
              <button class="btn btn-block btn-danger" @click="store.interactNearbyPlayer(fiveGreatsOpponent(fg), 'SPAR')">挑战{{ fg.title }}</button>
            </div>
          </article>
        </div>
      </div>

      <!-- ============ 兵器谱 ============ -->
      <div v-else class="view-scroll -mr-1 space-y-3 pr-1">
        <p v-if="IS_MOCK_MODE" class="hint">兵器谱记着每件真品的主人和下次争夺时间。每件真品只有一件。</p>
        <p v-else-if="!staff" class="hint">{{ staffError ? '暂时无法读取兵器谱。' : '正在读取兵器谱。' }}</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <article v-for="art in artifacts" :key="art.artifactCode" class="well t-red glow-border space-y-2 p-3.5">
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-brush tier-text text-2xl leading-tight">「{{ art.name }}」</h4>
              <span class="chip tier-chip shrink-0">全服唯一</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <span class="seal h-7 w-7 text-base" :class="art.holderNickname ? '' : '!bg-transparent !text-ink3 !shadow-none !outline-ink3'">{{ art.holderNickname ? '执' : '空' }}</span>
              <div class="min-w-0">
                <div class="truncate font-bold" :class="art.holderNickname ? '' : 'text-ink3'">{{ art.holderNickname ?? '还没有主人' }}</div>
                <div class="truncate text-xs text-ink3">{{ art.holderSect }}</div>
              </div>
            </div>
            <div class="flex items-center justify-between border-t border-line pt-2 text-xs text-ink3">
              <span v-if="IS_MOCK_MODE">已守住 <b class="text-ink2">{{ art.defendStreak }}</b> 届</span>
              <span class="text-right">{{ art.nextContestLabel }}</span>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 概率公示 -->
    <div
      v-if="showRates" class="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px]"
      role="dialog" aria-modal="true" aria-label="醉仙楼结缘概率公示" @click.self="showRates = false"
    >
      <div class="panel anim-modal flex max-h-[85vh] w-full max-w-lg flex-col gap-3 p-5">
        <div class="flex items-center justify-between">
          <h4 class="font-brush text-2xl text-gold">结缘概率公示</h4>
          <button class="btn btn-sm" @click="showRates = false">关闭</button>
        </div>
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
        <p class="text-[0.7rem] text-ink3">以上为单抽基础概率；演示版由本地模拟，正式版以服务端结果为准。</p>
      </div>
    </div>
  </div>
</template>
