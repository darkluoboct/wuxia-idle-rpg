<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { mockDuelOpponent } from '@/network/mockEngine'
import { computeDerivedStats } from '../../../shared/battle.ts'
import { STANCE_META, TIER_META } from '@/config/uiMeta'
import { hasGhostCostume } from '../../../shared/player.ts'
import { jianghuHour } from '../../../shared/combatMeta.ts'
import type { StanceType } from '@/network/protocol'
import WorkbenchDialog from '@/components/WorkbenchDialog.vue'
import InkFigure from '@/components/InkFigure.vue'
import GhostAuction from '@/components/GhostAuction.vue'
import GhostStalls from '@/components/GhostStalls.vue'
import ItemIcon from '@/components/ItemIcon.vue'

const InnWorkbench = defineAsyncComponent(() => import('@/components/InnWorkbench.vue'))
const AlchemyWorkbench = defineAsyncComponent(() => import('@/components/AlchemyWorkbench.vue'))
const HuashanLadder = defineAsyncComponent(() => import('@/components/HuashanLadder.vue'))
const EquipmentForge = defineAsyncComponent(() => import('@/components/EquipmentForge.vue'))
const ArtifactBoard = defineAsyncComponent(() => import('@/components/ArtifactBoard.vue'))
const ShopPanel = defineAsyncComponent(() => import('@/components/ShopPanel.vue'))

const store = useGameStore()
const sub = computed({
  get: () => store.marketTab,
  set: (value) => { store.marketTab = value },
})
const ghostMasked = ref(store.player.wearingMask)
watch(() => store.player.wearingMask, (masked) => { ghostMasked.value = masked })

const canAfford = (cost: number) => store.player.silver >= cost
const ghostArea = ref<'暗拍与旧物' | '蒙面摊市' | '鬼市铁匠炉'>('暗拍与旧物')
const isMidnight = computed(() => [23, 0].includes(jianghuHour(new Date(store.worldTime))))
const avoidsInspection = computed(() => isMidnight.value && hasGhostCostume(store.currentLoadout))
const inspectionRisk = computed(() => store.currentSect?.alignment === 'RIGHTEOUS' && !ghostMasked.value && !avoidsInspection.value)
const masters = ['huangyaoshi','ouyangfeng','yideng','hongqigong','wangchongyang'] as const
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
</script>
<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4" :class="{ 'theme-midnight ghost-night-scope': sub === 'GHOST' }">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist">
          <button v-if="store.marketTabOpen('INN')" class="tab" role="tab" :aria-selected="sub === 'INN'" @click="sub = 'INN'">醉仙客栈</button>
          <button v-if="store.modeCapabilities.hasShop && store.marketTabOpen('SHOP')" class="tab" role="tab" :aria-selected="sub === 'SHOP'" @click="sub = 'SHOP'">江湖商行</button>
          <button v-if="store.marketTabOpen('GHOST')" class="tab" role="tab" :aria-selected="sub === 'GHOST'" @click="sub = 'GHOST'">子时鬼市</button>
          <button v-if="store.marketTabOpen('ALCHEMY')" class="tab" role="tab" :aria-selected="sub === 'ALCHEMY'" @click="sub = 'ALCHEMY'">百草丹房</button>
          <button v-if="store.marketTabOpen('HUASHAN')" class="tab" role="tab" :aria-selected="sub === 'HUASHAN'" @click="sub = 'HUASHAN'">华山论剑</button>
          <button v-if="store.marketTabOpen('ARTIFACTS')" class="tab" role="tab" :aria-selected="sub === 'ARTIFACTS'" @click="sub = 'ARTIFACTS'">兵器谱</button>
        </div>
        <span class="flex items-center gap-1.5 text-xs text-ink3">
          真气 <b class="text-sm tabular-nums text-jade">{{ store.player.qiExp.toLocaleString() }}</b> ·
          纹银 <b class="text-sm tabular-nums text-ink">{{ store.player.silver.toLocaleString() }}</b>
          <template v-if="sub === 'GHOST' || sub === 'INN' || sub === 'SHOP'"> · 元宝 <b class="text-sm tabular-nums text-gold">{{ store.player.goldIngot }}</b></template>
          <template v-if="sub === 'ALCHEMY'"> · 药渣 <b class="text-sm tabular-nums text-gold">{{ store.furnaceResidue }}</b> 团</template>
        </span>
      </div>

      <InnWorkbench v-if="sub === 'INN'" />
      <ShopPanel v-else-if="sub === 'SHOP'" />
      <template v-else-if="sub === 'GHOST'">
        <header class="workbench-toolbar border-b border-line pb-2" aria-label="鬼市夜行状态">
          <h3 class="font-brush text-xl text-gold">鬼市夜行</h3>
          <span class="chip">{{ isMidnight ? '子时' : '非子时' }}</span>
          <span v-if="inspectionRisk" class="chip chip-red">未蒙面 · 鉴宝有盘查风险</span>
          <span v-else-if="avoidsInspection" class="chip chip-jade">假面四件 · 子时免查</span>
              <button class="flex items-center gap-2 text-sm" role="switch" :aria-checked="ghostMasked" :disabled="store.onlineActionBusy" @click="ghostMasked = !ghostMasked">
                <span class="switch" :aria-checked="ghostMasked" /> 戴上蒙面巾
              </button>
          <WorkbenchDialog title="鬼市鉴宝规则">              <p class="hint mt-1.5">正派门人未蒙面时可能被盘查，基础扣 25 点侠义。假面飘萍四件套鉴宝半价，子时可避开盘查。悟性或福缘达到 28，就能认出摊上的玄铁重剑。</p></WorkbenchDialog>
        </header>
        <nav class="tabs shrink-0" role="tablist" aria-label="鬼市分区">
          <button v-for="part in (['暗拍与旧物','蒙面摊市','鬼市铁匠炉'] as const)" :key="part" class="tab" role="tab" :aria-selected="part === ghostArea" @click="ghostArea = part">{{ part }}</button>
        </nav>
        <div :key="ghostArea" class="view-scroll space-y-3">
          <EquipmentForge v-if="ghostArea === '鬼市铁匠炉'" reforge />
          <GhostStalls v-else-if="ghostArea === '蒙面摊市'" />
          <template v-else>
        <p v-if="store.jianghuTitle?.marketDiscount" class="well p-3 text-sm text-ink2">{{ store.jianghuTitle.greetingText }}</p>
            <div class="workbench-toolbar justify-between">
              <h4 class="font-brush text-xl">鬼市旧物摊</h4>
              <button class="btn btn-gold" :disabled="store.onlineActionBusy || !canAfford(store.ghostAppraiseCost)" @click="store.appraiseGhostCurio(ghostMasked)">
                鉴宝 · {{ store.ghostAppraiseCost }} 两
              </button>
            </div>
        <GhostAuction />

        <div class="grid gap-3 sm:grid-cols-2">
          <article
            v-for="item in store.ghostListings" :key="item.id" class="well flex flex-col gap-2 p-3"
            :class="[TIER_META[item.tier].cls, 'tier-edge', item.tier === 'red' ? 'glow-border' : '']"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2">
                <ItemIcon :item-id="item.itemId" />
                <h4 class="font-brush tier-text text-xl leading-tight">{{ item.itemName }}</h4>
              </div>
              <span class="chip shrink-0">一口价</span>
            </div>
            <div class="flex flex-wrap gap-1"><span class="chip tier-chip">{{ TIER_META[item.tier].label }}</span></div>
            <p class="hint">{{ item.desc }}</p>
            <div class="text-xs text-ink3">摊主 {{ item.maskedSeller }}</div>
            <div class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
              <span class="text-base font-bold tabular-nums text-gold">
                <s v-if="store.ghostListingPrice(item) < item.price" class="mr-1 text-xs font-normal text-ink3">{{ item.price.toLocaleString() }}</s>
                {{ store.ghostListingPrice(item).toLocaleString() }}<span class="ml-1 text-xs font-normal">{{ item.currency === 'GOLD' ? '元宝' : '两纹银' }}</span>
              </span>
              <button class="btn btn-sm" :disabled="store.onlineActionBusy || (item.currency === 'GOLD' ? store.player.goldIngot : store.player.silver) < store.ghostListingPrice(item)"
                @click="store.buyMarketListing(item.id)">买下</button>
            </div>
          </article>
          <p v-if="!store.ghostListings.length" class="col-span-full py-4 text-center text-sm text-ink3">鬼市旧物摊的货已经卖完了。</p>
        </div>
          </template>
        </div>
      </template>
      <HuashanLadder v-else-if="sub === 'HUASHAN' && !IS_MOCK_MODE" />
      <AlchemyWorkbench v-else-if="sub === 'ALCHEMY'" />
      <!-- ============ 华山论剑：五绝石碑 ============ -->
      <div v-else-if="sub === 'HUASHAN'" class="view-scroll -mr-1 space-y-3 pr-1">
        <p class="hint">先看看对手用什么打法。去武库选能克制他的打法，再来华山切磋。</p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <article v-for="(fg, index) in fiveGreats" :key="fg.title" class="well relative flex flex-col gap-2.5 overflow-hidden p-3">
            <div class="pointer-events-none absolute inset-0" style="background: linear-gradient(180deg, var(--gold-soft), transparent 55%)" />
            <div class="relative flex gap-3">
              <div class="vertical-rl font-brush shrink-0 border-x border-gold px-1.5 py-2 text-[2.1rem] leading-none tracking-[0.2em] text-gold">{{ fg.title }}</div>
              <div class="min-w-0 space-y-1.5">
                <div class="text-sm font-bold leading-snug">{{ fg.nickname }}</div>
                <div class="text-xs text-ink3">{{ fg.sect }}</div>
                <span class="chip">打法 · {{ STANCE_META[fg.stance].name }}</span>
              </div>
            </div>
            <div class="workbench-portrait h-32"><InkFigure :style-type="masters[index]" :portrait-id="masters[index]" /></div>
            <p class="relative text-xs italic leading-snug text-ink3">“{{ fg.poem }}”</p>
            <div class="relative mt-auto space-y-2">
              <div class="flex items-baseline justify-between text-xs"><span class="text-ink3">战力</span><b class="text-sm tabular-nums text-gold">{{ fiveGreatsOpponent(fg).combatPower.toLocaleString() }}</b></div>
              <button class="btn btn-block btn-danger" @click="store.interactNearbyPlayer(fiveGreatsOpponent(fg), 'SPAR')">挑战{{ fg.title }}</button>
            </div>
          </article>
        </div>
      </div>

      <!-- ============ 兵器谱 ============ -->
      <ArtifactBoard v-else />
    </section>

  </div>
</template>
