<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS, GHOST_APPRAISE_COST, GRADE_MULT, INN_GIFT_COST, INN_TEA_COST, MAPS, SKILLS, STORY_CHAPTERS } from '@/config/gameData'
import { STANCE_META, TIER_META } from '@/config/uiMeta'
import {
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
import type { StanceType } from '@/network/protocol'
import InkFigure from '@/components/InkFigure.vue'

const store = useGameStore()
const sub = ref<'INN' | 'GHOST' | 'HUASHAN' | 'ARTIFACTS'>('INN')

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
    !canAfford(favorite ? INN_GIFT_COST : INN_TEA_COST) ||
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
function willTrigger(id: string, gain: number) {
  const st = store.companionAffinity[id]
  return !!st && !st.taught && st.affinity < 600 && st.affinity + gain >= 600
}

/* 五绝（东邪 / 西毒 / 南帝 / 北丐 / 中神通），数据与策划案 01、08 册一致 */
const fiveGreats: { title: string; nickname: string; sect: string; power: number; stance: StanceType; poem: string }[] = [
  { title: '东邪', nickname: '陆乘云', sect: '东海桃花岛', power: 71000, stance: 'AGILE', poem: '一箫一剑平生意，负尽狂名十五年。' },
  { title: '西毒', nickname: '西域毒皇·欧阳烈', sect: '西域白驼山庄', power: 64200, stance: 'FIERCE', poem: '灵蛇出洞风云变，顺逆九阴我独尊。' },
  { title: '南帝', nickname: '渡厄居士·段无涯', sect: '大理天龙寺', power: 66800, stance: 'AGILE', poem: '一指洞明千重甲，枯荣禅里见真空。' },
  { title: '北丐', nickname: '萧峰传人·乔北冥', sect: '丐帮', power: 78500, stance: 'FIERCE', poem: '醉饮松鹤三十碗，亢龙有悔震关山。' },
  { title: '中神通', nickname: '重阳首座·清风道长', sect: '终南全真教', power: 61800, stance: 'TAICHI', poem: '终南云起先天炁，太极圆转万法空。' },
]

function challengeFiveGreats(p: (typeof fiveGreats)[0]) {
  store.interactNearbyPlayer(
    {
      id: `fg_${p.title}`,
      nickname: `【${p.title}】${p.nickname}`,
      sectName: p.sect,
      realmName: '一代宗师',
      level: 65,
      combatPower: p.power,
      stance: p.stance,
      isBetrayerBounty: false,
      isEscortingDart: false,
    },
    'SPAR'
  )
}
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist">
          <button class="tab" role="tab" :aria-selected="sub === 'INN'" @click="sub = 'INN'">醉仙客栈</button>
          <button class="tab" role="tab" :aria-selected="sub === 'GHOST'" @click="enterGhostMarket()">子时鬼市</button>
          <button class="tab" role="tab" :aria-selected="sub === 'HUASHAN'" @click="sub = 'HUASHAN'">华山论剑</button>
          <button class="tab" role="tab" :aria-selected="sub === 'ARTIFACTS'" @click="sub = 'ARTIFACTS'">兵器谱</button>
        </div>
        <span class="flex items-center gap-1.5 text-xs text-ink3">
          纹银 <b class="text-sm tabular-nums text-ink">{{ store.player.silver.toLocaleString() }}</b>
          <template v-if="sub === 'GHOST' || sub === 'INN'"> · 元宝 <b class="text-sm tabular-nums text-gold">{{ store.player.goldIngot }}</b></template>
        </span>
      </div>

      <!-- ============ 醉仙客栈 ============ -->
      <div v-if="sub === 'INN'" class="view-scroll -mr-1 space-y-3 pr-1">
        <!-- 醉仙楼·结缘（抽卡入口） -->
        <article class="well relative overflow-hidden p-4" style="background-image: radial-gradient(ellipse at 100% 0, color-mix(in srgb, var(--tier-red) 14%, transparent), transparent 60%)">
          <div class="relative grid items-center gap-3 md:grid-cols-[1fr_auto]">
            <div class="min-w-0">
              <div class="flex items-center gap-2.5">
                <span class="seal h-9 w-9 text-xl">缘</span>
                <h4 class="font-brush text-2xl leading-none">醉仙楼 · 结缘</h4>
              </div>
              <p class="hint mt-1.5">雅间焚香求签，结识江湖名宿、偶得神兵秘籍。神品 1.5% · 绝品 8% · 上品 30%；第 {{ GACHA_HARD_PITY }} 抽必出神品，十连必出上品及以上。</p>
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
          <p class="hint">这些故人曾与你擦肩而过。日积月累打听线索（每日有数），集齐后赴故地相候、以礼相邀、了却前尘，便可重续前缘；也可直接以「故人重逢令」相邀。</p>
          <div v-for="id in store.reunionCandidates" :key="id" class="space-y-2 border-t border-line pt-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <b class="font-brush text-lg">{{ COMPANIONS[id].name }}</b>
              <button class="btn btn-sm btn-gold" :disabled="store.player.goldIngot < REUNION_TICKET_COST" @click="store.redeemReunionTicket(id)">
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
                class="btn btn-sm w-full" :disabled="store.reunionView(id).got.inn >= REUNION_CLUE_SOURCES.inn.dailyCap || store.player.silver < REUNION_INQUIRE_COST"
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
                  <button v-if="store.player.currentMapId !== REUNION_QUESTS[id].mapId" class="btn btn-sm" @click="store.moveMap(REUNION_QUESTS[id].mapId)">前往故地</button>
                  <button class="btn btn-sm btn-gold" :disabled="store.reunionView(id).waitRatio < 1" @click="store.completeReunionWait(id)">赴约</button>
                </span>
              </div>
            </template>
            <!-- 3 以礼相邀 -->
            <div v-else-if="store.reunionView(id).step === 'GIFT'" class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="text-ink2">备一份「{{ COMPANIONS[id].favGift }}」相邀</span>
              <button class="btn btn-sm btn-gold" :disabled="store.player.silver < INN_GIFT_COST" @click="store.reunionGift(id)">备礼 · {{ INN_GIFT_COST }} 两</button>
            </div>
            <!-- 4 了却前尘 -->
            <div v-else-if="store.reunionView(id).step === 'BATTLE'" class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="text-ink2">强敌拦路：{{ REUNION_QUESTS[id].enemy.name }}（强度随你的等级）</span>
              <button class="btn btn-sm btn-seal" @click="store.reunionBattle(id)">拔剑相护</button>
            </div>
          </div>
        </article>

        <!-- 北丐·十道绝味：每日一道，食材需在各地挂机采办 -->
        <article v-if="store.feastActive" class="well space-y-2.5 p-3.5">
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
          好感满 <b class="text-ink">100</b> 可编入左右翼；满 <b class="text-gold">600（生死之交）</b>无论门派皆触发「倾囊传功」，亲授看家绝学。
        </p>
        <div class="grid gap-3 lg:grid-cols-2">
          <template v-for="c in Object.values(COMPANIONS)" :key="c.id">
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
                钟爱「{{ c.favGift }}」· 满 600 传《{{ SKILLS[c.teachSkillId]?.name }}》
                <span class="tier-chip chip ml-1 !py-0 !text-[0.68rem]" :class="TIER_META[SKILLS[c.teachSkillId].tier].cls">{{ TIER_META[SKILLS[c.teachSkillId].tier].label }}</span>
              </div>
              <p v-if="willTrigger(c.id, 80)" class="text-xs font-bold text-gold">再奉一杯爱物，即可触发「倾囊传功」！</p>
              <p v-if="c.recruitFlag && !store.companionAffinity[c.id]?.recruited && !store.storyFlags.includes(c.recruitFlag)" class="text-xs text-cinnabar">
                好感再高也请不动他：需先呈齐「十道绝味」，方肯同行。
              </p>

              <div class="mt-auto grid grid-cols-2 gap-1.5">
                <button class="btn btn-sm !min-h-[2.4rem] flex-col !gap-0" :disabled="giftDisabled(c.id, false)" @click="store.giftCompanionInInn(c.id, false)">
                  <span>清茶</span><span class="text-[0.7rem] text-ink3">{{ INN_TEA_COST }} 两 · +20 {{ leftLabel(store.giftsLeft(c.id).tea) }}</span>
                </button>
                <button
                  class="btn btn-sm btn-gold !min-h-[2.4rem] flex-col !gap-0" :class="willTrigger(c.id, 80) ? 'anim-pulse-glow' : ''"
                  :disabled="giftDisabled(c.id, true)" @click="store.giftCompanionInInn(c.id, true)"
                >
                  <span class="max-w-full truncate">{{ c.favGift }}</span><span class="text-[0.7rem] opacity-80">{{ INN_GIFT_COST }} 两 · +80 {{ leftLabel(store.giftsLeft(c.id).gift) }}</span>
                </button>
              </div>

              <!-- 觉醒进阶：好感 600 + 伙伴信物 -->
              <button
                v-if="c.awakened && store.companionAffinity[c.id]?.form === 'base'"
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
        <div class="well relative overflow-hidden p-4" style="background-image: radial-gradient(ellipse at 92% 0, color-mix(in srgb, var(--tier-purple) 18%, transparent), transparent 55%)">
          <div class="pointer-events-none absolute right-5 top-3 h-10 w-10 rounded-full bg-[#e9eeff] opacity-70 shadow-[0_0_2rem_0.4rem_rgba(180,200,255,0.35)]" />
          <div class="relative space-y-3">
            <div>
              <h4 class="font-brush text-xl leading-none">泥污旧物摊 · 奇门慧眼鉴宝</h4>
              <p class="hint mt-1.5">正派弟子入市请先戴上蒙面巾，否则会被巡夜同门撞破（侠义 −25）。悟性或福缘 ≥ 28 可识破泥垢里的剑冢重剑捡漏。</p>
            </div>
            <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
              <button class="flex items-center gap-2 text-sm" role="switch" :aria-checked="store.player.wearingMask" @click="store.player.wearingMask = !store.player.wearingMask">
                <span class="switch" :aria-checked="store.player.wearingMask" /> 戴夜行蒙面巾
              </button>
              <button class="btn btn-gold" :disabled="!canAfford(GHOST_APPRAISE_COST)" @click="store.appraiseGhostCurio()">
                鉴宝淘货 · {{ GHOST_APPRAISE_COST }} 两
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
              <span class="chip shrink-0" :class="item.listingType === 'AUCTION' ? 'chip-gold' : ''">{{ item.listingType === 'AUCTION' ? '子时竞拍' : '匿名一口价' }}</span>
            </div>
            <div class="flex flex-wrap gap-1"><span class="chip tier-chip">{{ TIER_META[item.tier].label }}</span></div>
            <p class="hint">{{ item.desc }}</p>
            <div class="text-xs text-ink3">摊主 {{ item.maskedSeller }}<template v-if="item.highestBidderMasked"> · 领先 <b class="text-ink2">{{ item.highestBidderMasked }}</b></template></div>
            <div class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
              <span class="text-base font-bold tabular-nums text-gold">{{ item.price.toLocaleString() }}<span class="ml-1 text-xs font-normal">{{ item.currency === 'GOLD' ? '元宝' : '两纹银' }}</span></span>
              <button class="btn btn-sm" @click="store.buyOrBidMarketListing(item)">{{ item.listingType === 'AUCTION' ? '加价 +50 元宝' : '匿名买下' }}</button>
            </div>
          </article>
          <p v-if="!store.ghostListings.length" class="col-span-full py-10 text-center text-sm text-ink3">今夜摊位已被抢购一空，明夜子时再来。</p>
        </div>
      </div>

      <!-- ============ 华山论剑：五绝石碑 ============ -->
      <div v-else-if="sub === 'HUASHAN'" class="view-scroll -mr-1 space-y-3 pr-1">
        <p class="hint">观察五绝常摆的三才架势，到「武库」切换克制架势，即可越级夺取石碑尊位。</p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1900px]:grid-cols-5">
          <article v-for="fg in fiveGreats" :key="fg.title" class="well relative flex flex-col gap-2.5 overflow-hidden p-3">
            <div class="pointer-events-none absolute inset-0" style="background: linear-gradient(180deg, var(--gold-soft), transparent 55%)" />
            <div class="relative flex gap-3">
              <div class="vertical-rl font-brush shrink-0 border-x border-gold px-1.5 py-2 text-[2.1rem] leading-none tracking-[0.2em] text-gold">{{ fg.title }}</div>
              <div class="min-w-0 space-y-1.5">
                <div class="text-sm font-bold leading-snug">{{ fg.nickname }}</div>
                <div class="text-xs text-ink3">{{ fg.sect }}</div>
                <span class="chip">常摆「{{ STANCE_META[fg.stance].short }}」</span>
              </div>
            </div>
            <p class="relative text-xs italic leading-snug text-ink3">“{{ fg.poem }}”</p>
            <div class="relative mt-auto space-y-2">
              <div class="flex items-baseline justify-between text-xs"><span class="text-ink3">战力</span><b class="text-sm tabular-nums text-gold">{{ fg.power.toLocaleString() }}</b></div>
              <button class="btn btn-block btn-danger" @click="challengeFiveGreats(fg)">递帖 · 夺「{{ fg.title }}」</button>
            </div>
          </article>
        </div>
      </div>

      <!-- ============ 兵器谱 ============ -->
      <div v-else class="view-scroll -mr-1 space-y-3 pr-1">
        <p class="hint">每件传世真品全服仅存一件（1/1）。持有者连续离线满 72 小时自动收回奖池，或于周日守擂战败当场易主。</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <article v-for="art in store.uniqueArtifacts" :key="art.artifactCode" class="well t-red glow-border space-y-2 p-3.5">
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-brush tier-text text-2xl leading-tight">「{{ art.name }}」</h4>
              <span class="chip tier-chip shrink-0">孤品 1/1</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <span class="seal h-7 w-7 text-base" :class="art.holderNickname ? '' : '!bg-transparent !text-ink3 !shadow-none !outline-ink3'">{{ art.holderNickname ? '执' : '空' }}</span>
              <div class="min-w-0">
                <div class="truncate font-bold" :class="art.holderNickname ? '' : 'text-ink3'">{{ art.holderNickname ?? '无主 · 秘境待出世' }}</div>
                <div class="truncate text-xs text-ink3">{{ art.holderSect }}</div>
              </div>
            </div>
            <div class="flex items-center justify-between border-t border-line pt-2 text-xs text-ink3">
              <span>连守 <b class="text-ink2">{{ art.defendStreak }}</b> 届</span>
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
