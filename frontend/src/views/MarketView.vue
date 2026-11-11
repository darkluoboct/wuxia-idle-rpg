<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS, GHOST_APPRAISE_COST, INN_GIFT_COST, INN_TEA_COST, SKILLS } from '@/config/gameData'
import { STANCE_META, TIER_META } from '@/config/uiMeta'
import type { StanceType } from '@/network/protocol'
import InkFigure from '@/components/InkFigure.vue'

const store = useGameStore()
const sub = ref<'INN' | 'GHOST' | 'HUASHAN' | 'ARTIFACTS'>('INN')

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
          <template v-if="sub === 'GHOST'"> · 元宝 <b class="text-sm tabular-nums text-gold">{{ store.player.goldIngot }}</b></template>
        </span>
      </div>

      <!-- ============ 醉仙客栈 ============ -->
      <div v-if="sub === 'INN'" class="view-scroll -mr-1 space-y-3 pr-1">
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
            :class="[TIER_META[c.tier].cls]"
          >
            <div class="relative h-[6.2rem] w-[4.6rem] shrink-0 self-start overflow-hidden bg-[var(--bg-1)] tier-edge">
              <InkFigure :style-type="c.portraitStyle" />
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <div class="flex items-baseline justify-between gap-2">
                <h4 class="font-brush truncate text-xl leading-none">{{ c.name }}<span class="ml-1.5 font-sans text-xs tracking-normal text-ink3">{{ c.title }}</span></h4>
                <span v-if="store.companionAffinity[c.id]?.taught" class="chip chip-gold shrink-0">已传功</span>
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
                  <span>编入 100 · 传功 600</span>
                </div>
              </div>

              <div class="text-xs leading-snug text-jade">
                钟爱「{{ c.favGift }}」· 满 600 传《{{ SKILLS[c.teachSkillId]?.name }}》
                <span class="tier-chip chip ml-1 !py-0 !text-[0.68rem]" :class="TIER_META[SKILLS[c.teachSkillId].tier].cls">{{ TIER_META[SKILLS[c.teachSkillId].tier].label }}</span>
              </div>
              <p v-if="willTrigger(c.id, 80)" class="text-xs font-bold text-gold">再奉一杯爱物，即可触发「倾囊传功」！</p>

              <div class="mt-auto grid grid-cols-2 gap-1.5">
                <button class="btn btn-sm !min-h-[2.4rem] flex-col !gap-0" :disabled="!canAfford(INN_TEA_COST)" @click="store.giftCompanionInInn(c.id, false)">
                  <span>清茶</span><span class="text-[0.7rem] text-ink3">{{ INN_TEA_COST }} 两 · +20</span>
                </button>
                <button
                  class="btn btn-sm btn-gold !min-h-[2.4rem] flex-col !gap-0" :class="willTrigger(c.id, 80) ? 'anim-pulse-glow' : ''"
                  :disabled="!canAfford(INN_GIFT_COST)" @click="store.giftCompanionInInn(c.id, true)"
                >
                  <span class="max-w-full truncate">{{ c.favGift }}</span><span class="text-[0.7rem] opacity-80">{{ INN_GIFT_COST }} 两 · +80</span>
                </button>
              </div>
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
  </div>
</template>
