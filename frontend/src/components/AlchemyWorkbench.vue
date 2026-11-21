<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { HERBS, MAPS, MEDICINES, PILL_RECIPES, getMapHerbs, type HerbConfig, type PillRecipeConfig } from '@/config/gameData'
import { TIER_META } from '@/config/uiMeta'
import { FORAGE_QI_COST, pillDoubleRate, pillSuccessRate } from '../../../shared/alchemy.ts'
import { originPerk } from '../../../shared/origins.ts'
import { recipeForPlayer, SNAKE_FEEDING_RECIPE } from '../../../shared/player.ts'
import ItemIcon from './ItemIcon.vue'
import WorkbenchDialog from './WorkbenchDialog.vue'

const store = useGameStore()
const selectedRecipeId = ref<string>(IS_MOCK_MODE ? 'recipe_tongmai_dan' : 'recipe_chunyang_jindan')
const selectedRecipe = computed(() => recipeForPlayer(PILL_RECIPES[selectedRecipeId.value] ?? Object.values(PILL_RECIPES)[0], store.player))
const recipeFilter = ref<'ALL' | 'ACUPOINT' | 'BATTLE'>('ALL')

const filteredRecipes = computed(() => {
  const all = Object.values(PILL_RECIPES).filter((recipe) => IS_MOCK_MODE || recipe.category !== 'BODY')
  return all.filter((r) => recipeFilter.value === 'ALL' || r.category === recipeFilter.value).map((r) => recipeForPlayer(r, store.player))
})

function canCraftRecipe(recipe: PillRecipeConfig) {
  if (store.martialStats.intStat < recipe.minInsight) return false
  if (store.player.qiExp < recipe.costQi) return false
  if (store.player.silver < recipe.costSilver) return false
  return recipe.requiredHerbs.every((req) => (store.herbInventory[req.herbId] ?? 0) >= req.count)
}

function calcCraftRate(recipe: PillRecipeConfig) {
  return pillSuccessRate(recipe, store.martialStats, store.alchemyPity[recipe.id], originPerk(store.player, 'PILL_RATE'))
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
watch(filteredRecipes, (recipes) => {
  if (recipes.length && !recipes.some(({ id }) => id === selectedRecipeId.value)) selectedRecipeId.value = recipes[0].id
}, { immediate: true })
function inventory(recipe: PillRecipeConfig) {
  return (recipe.category === 'BATTLE' ? store.player.battleMedicines?.[recipe.targetMedicineId] : store.pillInventory[recipe.targetMedicineId]) ?? 0
}
function herbAction(herb: HerbConfig) {
  if (herb.mapId === store.player.currentMapId) return store.forageHerbs(herb.mapId)
  return store.travelTo(herb.mapId)
}
function herbBlocked(herb: HerbConfig) {
  const map = MAPS.find(({ id }) => id === herb.mapId)
  return store.onlineActionBusy || !!store.journeyMap || !map || !store.canTravelTo(map)
    || (herb.mapId === store.player.currentMapId && store.player.qiExp < FORAGE_QI_COST)
}
</script>

<template>
  <header class="workbench-toolbar justify-between border-b border-line pb-2">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="font-brush text-xl text-gold">神农八卦鼎</h3>
      <span class="text-xs text-ink2">{{ currentMapConfig.name }} · 双丹率 {{ calcDoubleRate() }}%</span>
      <WorkbenchDialog title="丹房炼制规则">
        <p>悟性与福缘影响成丹机会，双丹率随悟性提升。药材可在产地采集，药渣攒够 5 团可萃精。</p>
      </WorkbenchDialog>
    </div>
    <div class="workbench-toolbar">
      <button v-if="currentMapHerbs.length" class="btn btn-sm" :disabled="herbBlocked(currentMapHerbs[0])" @click="store.forageHerbs()">采药 · {{ FORAGE_QI_COST }} 真气</button>
      <button class="btn btn-sm" :disabled="store.onlineActionBusy || store.furnaceResidue < 5" @click="store.exchangeFurnaceResidue()">药渣萃精 ({{ store.furnaceResidue }}/5)</button>
      <WorkbenchDialog title="百草药篓全览" label="百草药篓全览" wide>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="herb in Object.values(HERBS)"
            :key="herb.id"
            class="rounded border border-line bg-[var(--bg-1)] p-2.5 transition-colors"
            :class="TIER_META[herb.tier].cls"
          >
            <div class="flex items-center gap-2">
              <ItemIcon :item-id="herb.id" class="[--item-icon-size:2.4rem]" />
              <div class="min-w-0">
                <span class="block font-bold tier-text text-sm">{{ herb.name }}</span>
                <span class="chip tier-chip py-0 text-[0.75rem]">{{ TIER_META[herb.tier].label }}</span>
              </div>
            </div>
            <div class="mt-1 flex items-baseline justify-between text-xs">
              <span class="text-ink3">储量</span>
              <b class="text-sm tabular-nums" :class="(store.herbInventory[herb.id] ?? 0) > 0 ? 'text-gold' : 'text-ink3'">
                {{ store.herbInventory[herb.id] ?? 0 }}
              </b>
            </div>
            <div class="mt-1 text-[0.75rem] text-ink3 truncate">
              产地：{{ herb.mapName }}
            </div>
            <p class="mt-1 text-[0.75rem] leading-tight text-ink3/80 line-clamp-2">
              {{ herb.desc }}
            </p>
          </div>
        </div>
      </WorkbenchDialog>
    </div>
  </header>
  <div class="workbench">
    <aside class="workbench-index" aria-label="丹方名录">
      <div class="workbench-toolbar">
        <button v-for="option in (['ALL','ACUPOINT','BATTLE'] as const)" :key="option" class="btn btn-sm"
          :aria-pressed="recipeFilter === option" :class="{ 'btn-gold': recipeFilter === option }" @click="recipeFilter = option">
          {{ { ALL: '全部丹方', ACUPOINT: '冲穴圣药', BATTLE: '对决灵丹' }[option] }}
        </button>
      </div>
      <div class="workbench-scroll">
        <button v-for="r in filteredRecipes" :key="r.id" class="workbench-entry" :aria-pressed="selectedRecipeId === r.id" @click="selectedRecipeId = r.id">
          <ItemIcon :item-id="r.targetMedicineId" :class="TIER_META[r.tier].cls" />
          <span class="min-w-0 flex-1"><b class="block text-sm">{{ r.name }}</b>
            <small class="text-ink3">{{ FLAME_META[r.furnaceFlame].name }} · 库存 {{ inventory(r) }} · {{ calcCraftRate(r) }}%</small>
          </span>
        </button>
      </div>
    </aside>
    <section class="workbench-detail" aria-label="丹炉">
      <div :key="selectedRecipeId" class="workbench-scroll space-y-3" :class="TIER_META[selectedRecipe.tier].cls">
        <p v-if="store.player.snakeFeedingRecipe && selectedRecipe.id === SNAKE_FEEDING_RECIPE" class="hint">白驼蛇药饲喂方已生效，炼制蝮蛇见血膏少用 1 株蛇涎草。</p>
        <!-- 鼎炉头部 -->
        <div class="flex items-start justify-between gap-3 border-b border-line pb-3">
          <div>
            <div class="flex items-center gap-2">
              <ItemIcon :item-id="selectedRecipe.targetMedicineId" class="[--item-icon-size:2.75rem]" />
              <h4 class="font-brush tier-text text-2xl leading-none">{{ selectedRecipe.name }}</h4>
              <span class="chip tier-chip">{{ TIER_META[selectedRecipe.tier].label }}</span>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span class="chip chip-gold">产出丹药：{{ MEDICINES[selectedRecipe.targetMedicineId]?.name }}</span>
              <span class="chip" :class="FLAME_META[selectedRecipe.furnaceFlame].cls">
                {{ FLAME_META[selectedRecipe.furnaceFlame].name }}
              </span>
              <span class="text-ink3">背包已有：<b class="text-gold tabular-nums">{{ inventory(selectedRecipe) }}</b> 丸</span>
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
          <div class="text-gold text-[0.75rem]">
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
              class="flex items-center gap-2 rounded border border-line p-2 text-xs"
              :class="(store.herbInventory[req.herbId] ?? 0) >= req.count ? 'bg-jade/5 border-jade/30' : 'bg-crimson/5 border-crimson/30'"
            >
              <ItemIcon :item-id="req.herbId" />
              <div class="min-w-0 flex-1">
                <div class="font-bold truncate" :class="TIER_META[HERBS[req.herbId]?.tier ?? 'green'].cls">
                  {{ HERBS[req.herbId]?.name }}
                </div>
                <div class="text-[0.75rem] text-ink3 truncate">
                  产地：{{ HERBS[req.herbId]?.mapName }}
                </div>
              </div>
              <button v-if="(store.herbInventory[req.herbId] ?? 0) < req.count" class="btn btn-sm"
                :disabled="herbBlocked(HERBS[req.herbId])" @click="herbAction(HERBS[req.herbId])">
                {{ HERBS[req.herbId].mapId === store.player.currentMapId ? '采药' : '前往产地' }}
              </button>
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
          <div class="flex flex-wrap items-center justify-between text-[0.75rem] text-ink3">
            <span>基础 {{ selectedRecipe.baseRate }}% · 悟性加成 +{{ Math.max(0, (store.martialStats.intStat - selectedRecipe.minInsight) * 1.5).toFixed(0) }}% · 福缘 +{{ (store.martialStats.luck * 0.4).toFixed(0) }}%<template v-if="(store.alchemyPity[selectedRecipe.id] ?? 0) > 0"> · 保底 +{{ store.alchemyPity[selectedRecipe.id] }}%</template></span>
            <span class="text-gold font-bold">双丹暴击率：{{ calcDoubleRate() }}%</span>
          </div>
        </div>
      </div>
      <footer class="workbench-actions">
        <button
          class="btn btn-gold btn-block py-2.5 text-base font-bold shadow-lg"
          :disabled="store.onlineActionBusy || !canCraftRecipe(selectedRecipe)"
          @click="store.refinePill(selectedRecipe.id)"
        >
          起炉炼丹 · 耗 {{ selectedRecipe.costQi.toLocaleString() }} 真气
        </button>
        <p v-if="!canCraftRecipe(selectedRecipe)" class="mt-1 text-center text-xs text-crimson">
          {{ store.martialStats.intStat < selectedRecipe.minInsight ? `悟性需达 ${selectedRecipe.minInsight} 点方可控炉` : '药材、真气或纹银不足，无法起炉' }}
        </p>
      </footer>
    </section>
  </div>
</template>
