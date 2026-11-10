<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import {
  COMPANIONS,
  GHOST_APPRAISE_COST,
  HERBS,
  type HerbConfig,
  INN_GIFT_COST,
  INN_TEA_COST,
  MAPS,
  MEDICINES,
  PILL_RECIPES,
  type PillRecipeConfig,
  SKILLS,
  getMapHerbs,
} from '@/config/gameData'
import { STANCE_META, TIER_META } from '@/config/uiMeta'
import type { StanceType } from '@/network/protocol'
import InkFigure from '@/components/InkFigure.vue'

const store = useGameStore()
const sub = ref<'INN' | 'GHOST' | 'ALCHEMY' | 'HUASHAN' | 'ARTIFACTS'>('INN')

function enterGhostMarket() {
  sub.value = 'GHOST'
  store.toggleTheme(true) // 子时鬼市：自动切入玄墨夜色
}

const canAfford = (cost: number) => store.player.silver >= cost
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

// =========================================================================
// 百草丹房与神农炼制系统
// =========================================================================
const selectedRecipeId = ref<string>('recipe_tongmai_dan')
const selectedRecipe = computed<PillRecipeConfig>(() => PILL_RECIPES[selectedRecipeId.value] ?? Object.values(PILL_RECIPES)[0])
const recipeFilter = ref<'ALL' | 'ACUPOINT' | 'BATTLE'>('ALL')
const showHerbAtlas = ref(false)

const filteredRecipes = computed(() => {
  const all = Object.values(PILL_RECIPES)
  if (recipeFilter.value === 'ALL') return all
  return all.filter((r) => r.category === recipeFilter.value)
})

function canCraftRecipe(recipe: PillRecipeConfig) {
  if (store.player.stats.intStat < recipe.minInsight) return false
  if (store.player.qiExp < recipe.costQi) return false
  if (store.player.silver < recipe.costSilver) return false
  return recipe.requiredHerbs.every((req) => (store.herbInventory[req.herbId] ?? 0) >= req.count)
}

function calcCraftRate(recipe: PillRecipeConfig) {
  const pity = store.alchemyPity[recipe.id] ?? 0
  const insightBonus = Math.max(0, (store.player.stats.intStat - recipe.minInsight) * 1.5)
  const luckBonus = store.player.stats.luck * 0.4
  return Math.min(98, Math.max(15, Math.round(recipe.baseRate + insightBonus + luckBonus + pity)))
}

function calcDoubleRate() {
  return Math.min(40, Math.round(store.player.stats.luck * 0.8 + store.player.stats.intStat * 0.3))
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
          <template v-if="sub === 'GHOST'"> · 元宝 <b class="text-sm tabular-nums text-gold">{{ store.player.goldIngot }}</b></template>
          <template v-if="sub === 'ALCHEMY'"> · 药渣 <b class="text-sm tabular-nums text-gold">{{ store.furnaceResidue }}</b> 团</template>
        </span>
      </div>

      <!-- ============ 醉仙客栈 ============ -->
      <div v-if="sub === 'INN'" class="view-scroll -mr-1 space-y-3 pr-1">
        <p class="hint">
          请客送礼能增加好感。好感到 <b class="text-ink">100</b> 就能在武库邀请对方上阵，到 <b class="text-gold">600</b> 会收到对方传授的武功。
        </p>
        <div class="grid gap-3 lg:grid-cols-2">
          <article
            v-for="c in Object.values(COMPANIONS)" :key="c.id" class="well flex gap-3 p-3"
            :class="[TIER_META[c.tier].cls]"
          >
            <div class="relative h-[6.2rem] w-[4.6rem] shrink-0 self-start overflow-hidden bg-[var(--bg-1)] tier-edge">
              <InkFigure :style-type="c.portraitStyle" />
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="flex items-baseline justify-between gap-2">
                <h4 class="font-brush truncate text-xl leading-none">{{ c.name }}<span class="ml-1.5 font-sans text-xs tracking-normal text-ink3">{{ c.title }}</span></h4>
                <span v-if="store.companionAffinity[c.id]?.taught" class="chip chip-gold shrink-0">已教武功</span>
              </div>
              <p class="text-xs italic leading-snug text-ink3">“{{ c.poem }}”</p>

              <!-- 好感度：刻度 100 编入 / 600 传功 -->
              <div>
                <div class="relative">
                  <div class="bar bar-gold"><i :style="{ width: `${((store.companionAffinity[c.id]?.affinity ?? 0) / 1000) * 100}%` }" /></div>
                  <i class="absolute -top-0.5 left-[10%] h-2.5 w-px bg-ink3" /><i class="absolute -top-0.5 left-[60%] h-2.5 w-px bg-gold" />
                </div>
                <div class="relative mt-0.5 flex justify-between text-[0.7rem] tabular-nums leading-none text-ink3">
                  <b class="text-gold">{{ store.companionAffinity[c.id]?.affinity ?? 0 }} / 1000</b>
                  <span>100 上阵 · 600 教武功</span>
                </div>
              </div>

              <div class="text-xs leading-snug text-jade">
                喜欢「{{ c.favGift }}」· 好感到 600 教《{{ SKILLS[c.teachSkillId]?.name }}》
                <span class="tier-chip chip ml-1 !py-0 !text-[0.68rem]" :class="TIER_META[SKILLS[c.teachSkillId].tier].cls">{{ TIER_META[SKILLS[c.teachSkillId].tier].label }}</span>
              </div>
              <p v-if="willTrigger(c.id, 80)" class="text-xs font-bold text-gold">再送一次喜欢的礼物，就能学到这门武功。</p>

              <div class="mt-auto grid grid-cols-2 gap-1.5">
                <button class="btn btn-sm !min-h-[2.4rem] flex-col !gap-0" :disabled="!canAfford(INN_TEA_COST)" @click="store.giftCompanionInInn(c.id, false)">
                  <span>请喝茶</span><span class="text-[0.7rem] text-ink3">{{ INN_TEA_COST }} 两 · 好感 +20</span>
                </button>
                <button
                  class="btn btn-sm btn-gold !min-h-[2.4rem] flex-col !gap-0" :class="willTrigger(c.id, 80) ? 'anim-pulse-glow' : ''"
                  :disabled="!canAfford(INN_GIFT_COST)" @click="store.giftCompanionInInn(c.id, true)"
                >
                  <span>送礼</span><span class="text-[0.7rem] opacity-80">{{ INN_GIFT_COST }} 两 · 好感 +80</span>
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <!-- ============ 子时鬼市 ============ -->
      <div v-else-if="sub === 'GHOST'" class="view-scroll -mr-1 space-y-3 pr-1">
        <div class="well relative overflow-hidden p-4" style="background-image: radial-gradient(ellipse at 92% 0, color-mix(in srgb, var(--tier-purple) 18%, transparent), transparent 55%)">
          <div class="pointer-events-none absolute right-5 top-3 h-10 w-10 rounded-full bg-[#e9eeff] opacity-70 shadow-[0_0_2rem_0.4rem_rgba(180,200,255,0.35)]" />
          <div class="relative space-y-3">
            <div>
              <h4 class="font-brush text-xl leading-none">鬼市旧物摊</h4>
              <p class="hint mt-1.5">全真或丐帮弟子来鉴宝时记得蒙面，否则会掉 25 点侠义。悟性或福缘达到 28，就能认出摊上的玄铁重剑。</p>
            </div>
            <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
              <button class="flex items-center gap-2 text-sm" role="switch" :aria-checked="store.player.wearingMask" @click="store.player.wearingMask = !store.player.wearingMask">
                <span class="switch" :aria-checked="store.player.wearingMask" /> 戴上蒙面巾
              </button>
              <button class="btn btn-gold" :disabled="!canAfford(GHOST_APPRAISE_COST)" @click="store.appraiseGhostCurio()">
                鉴宝 · {{ GHOST_APPRAISE_COST }} 两
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
              <span class="text-base font-bold tabular-nums text-gold">{{ item.price.toLocaleString() }}<span class="ml-1 text-xs font-normal">{{ item.currency === 'GOLD' ? '元宝' : '两纹银' }}</span></span>
              <button class="btn btn-sm" @click="store.buyOrBidMarketListing(item)">{{ item.listingType === 'AUCTION' ? '加价 50 元宝' : '买下' }}</button>
            </div>
          </article>
          <p v-if="!store.ghostListings.length" class="col-span-full py-10 text-center text-sm text-ink3">鬼市的货已经卖完了。</p>
        </div>
      </div>

      <!-- ============ 百草丹房：神农炼制与采药寻草 ============ -->
      <div v-else-if="sub === 'ALCHEMY'" class="view-scroll -mr-1 space-y-3 pr-1">
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
                <b class="text-jade">+{{ Math.max(0, (store.player.stats.intStat - 20) * 1.5).toFixed(0) }}%</b>
              </div>
              <div class="rounded border border-line bg-[var(--bg-2)] px-2.5 py-1 text-xs">
                <span class="text-ink3">双丹暴率 </span>
                <b class="text-gold">{{ calcDoubleRate() }}%</b>
              </div>
              <button
                class="btn btn-sm"
                :class="store.furnaceResidue >= 5 ? 'btn-gold anim-pulse-glow' : ''"
                :disabled="store.furnaceResidue < 5"
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
              <span class="text-ink3">可采：</span>
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
              <button class="btn btn-sm btn-gold" @click="store.forageHerbs()">
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
                  <span class="text-ink2 font-sans font-bold">成药：{{ MEDICINES[r.targetMedicineId]?.name }}</span>
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
                <div class="mt-0.5 font-bold tabular-nums" :class="store.player.stats.intStat >= selectedRecipe.minInsight ? 'text-gold' : 'text-crimson'">
                  {{ store.player.stats.intStat }} / {{ selectedRecipe.minInsight }}
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
                <span>基础 {{ selectedRecipe.baseRate }}% · 悟性加成 +{{ Math.max(0, (store.player.stats.intStat - selectedRecipe.minInsight) * 1.5).toFixed(0) }}% · 福缘 +{{ (store.player.stats.luck * 0.4).toFixed(0) }}%<template v-if="(store.alchemyPity[selectedRecipe.id] ?? 0) > 0"> · 保底 +{{ store.alchemyPity[selectedRecipe.id] }}%</template></span>
                <span class="text-gold font-bold">双丹暴击率：{{ calcDoubleRate() }}%</span>
              </div>
            </div>

            <!-- 起炉炼丹按钮 -->
            <div class="pt-1">
              <button
                class="btn btn-gold btn-block !py-2.5 text-base font-bold shadow-lg"
                :disabled="!canCraftRecipe(selectedRecipe)"
                @click="store.refinePill(selectedRecipe.id)"
              >
                起炉炼丹 · 耗 {{ selectedRecipe.costQi.toLocaleString() }} 真气
              </button>
              <p v-if="!canCraftRecipe(selectedRecipe)" class="mt-1 text-center text-xs text-crimson">
                {{ store.player.stats.intStat < selectedRecipe.minInsight ? `悟性需达 ${selectedRecipe.minInsight} 点方可控炉` : '药材、真气或纹银不足，无法起炉' }}
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
              <div class="flex items-baseline justify-between text-xs"><span class="text-ink3">战力</span><b class="text-sm tabular-nums text-gold">{{ fg.power.toLocaleString() }}</b></div>
              <button class="btn btn-block btn-danger" @click="challengeFiveGreats(fg)">挑战{{ fg.title }}</button>
            </div>
          </article>
        </div>
      </div>

      <!-- ============ 兵器谱 ============ -->
      <div v-else class="view-scroll -mr-1 space-y-3 pr-1">
        <p class="hint">兵器谱记着每件真品的主人和下次争夺时间。每件真品只有一件。</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <article v-for="art in store.uniqueArtifacts" :key="art.artifactCode" class="well t-red glow-border space-y-2 p-3.5">
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
              <span>已守住 <b class="text-ink2">{{ art.defendStreak }}</b> 届</span>
              <span class="text-right">{{ art.nextContestLabel }}</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
