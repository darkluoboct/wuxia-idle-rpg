<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS, SKILLS } from '@/config/gameData'
import type { StanceType } from '@/network/protocol'
import { getStanceLabel } from '@/network/mockEngine'

const store = useGameStore()
const subTab = ref<'INN' | 'GHOST' | 'HUASHAN' | 'ARTIFACTS'>('INN')

function enterGhostMarket() {
  subTab.value = 'GHOST'
  store.toggleTheme(true)
}

const fiveGreatsPlayers: { title: string; nickname: string; sect: string; power: number; stance: StanceType; poem: string }[] = [
  { title: '东邪', nickname: '陆乘云', sect: '东海桃花岛', power: 71000, stance: 'AGILE', poem: '一箫一剑平生意，负尽狂名十五年。' },
  { title: '西毒', nickname: '西域毒皇·欧阳烈', sect: '西域白驼山庄', power: 64200, stance: 'FIERCE', poem: '灵蛇出洞风云变，顺逆九阴我独尊。' },
  { title: '北丐', nickname: '萧峰传人·乔北冥', sect: '丐帮', power: 78500, stance: 'FIERCE', poem: '醉饮松鹤三十碗，亢龙有悔震关山。' },
  { title: '中神通', nickname: '重阳首座·清风道长', sect: '终南全真教', power: 61800, stance: 'TAICHI', poem: '终南云起先天炁，太极圆转万法空。' },
]

function challengeFiveGreats(p: (typeof fiveGreatsPlayers)[0]) {
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
  <div class="wuxia-card p-3.5 h-full min-h-0 flex flex-col gap-3 overflow-hidden">
    <div class="flex items-center gap-1.5 border-b border-[var(--border-ink)] pb-2 shrink-0 text-xs">
      <button
        @click="subTab = 'INN'"
        class="px-3 py-1 cursor-pointer transition"
        :class="subTab === 'INN' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
      >
        醉仙客栈
      </button>
      <button
        @click="enterGhostMarket()"
        class="px-3 py-1 cursor-pointer transition"
        :class="subTab === 'GHOST' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
      >
        子时鬼市
      </button>
      <button
        @click="subTab = 'HUASHAN'"
        class="px-3 py-1 cursor-pointer transition"
        :class="subTab === 'HUASHAN' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
      >
        华山论剑
      </button>
      <button
        @click="subTab = 'ARTIFACTS'"
        class="px-3 py-1 cursor-pointer transition"
        :class="subTab === 'ARTIFACTS' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
      >
        全服唯一兵器谱
      </button>
    </div>

    <!-- 1. 醉仙客栈 -->
    <div v-if="subTab === 'INN'" class="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      <div class="text-xs ink-muted shrink-0">
        好感满 100 可编入左右翼；满 <b class="text-[var(--text-ink)]">600（生死之交）</b> 无论门派皆触发「倾囊传功」亲授看家绝学。（洪七公当前 540，奉上叫花鸡即刻传授《亢龙有悔》）
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-2.5 content-start pr-1 text-xs">
        <div
          v-for="c in Object.values(COMPANIONS)"
          :key="c.id"
          class="wuxia-elevated p-3 flex flex-col justify-between gap-2"
        >
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-brush text-lg leading-none">{{ c.name }} · <span class="text-xs font-sans ink-muted">{{ c.title }}</span></span>
              <span class="text-[11px] font-bold ink-gold tabular-nums">
                {{ store.companionAffinity[c.id]?.affinity ?? 0 }} / 1000
              </span>
            </div>
            <p class="italic text-[11px] ink-muted">“{{ c.poem }}”</p>
            <div class="text-[11px] ink-jade">
              钟爱「{{ c.favGift }}」 · 满600传《{{ SKILLS[c.teachSkillId]?.name }}》
              <span v-if="store.companionAffinity[c.id]?.taught" class="ml-1 ink-gold">(已传功)</span>
            </div>
          </div>

          <div class="flex gap-1.5 pt-1">
            <button
              @click="store.giftCompanionInInn(c.id, false)"
              class="token-btn flex-1 py-1 cursor-pointer"
            >
              清茶 (300两/+20)
            </button>
            <button
              @click="store.giftCompanionInInn(c.id, true)"
              class="tab-gold flex-1 py-1 font-bold cursor-pointer truncate px-1"
            >
              {{ c.favGift }} (1200两/+80)
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 子时鬼市 -->
    <div v-else-if="subTab === 'GHOST'" class="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      <div class="wuxia-elevated p-2.5 flex items-center justify-between gap-3 border-l-2 border-l-[var(--border-gold)] shrink-0 text-xs">
        <div class="space-y-0.5">
          <div class="font-bold">泥污旧物摊 · 奇门慧眼鉴宝（正派弟子入市请先勾选蒙面巾）</div>
          <div class="text-[11px] ink-muted">主角悟性 ≥ 28 或福缘 ≥ 28 可识破泥垢中的剑冢重剑捡漏。</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <label class="token-btn flex items-center gap-1.5 px-2.5 py-1 cursor-pointer">
            <input type="checkbox" v-model="store.player.wearingMask" class="accent-[#c8a66b]" />
            <span>蒙面</span>
          </label>
          <button
            @click="store.appraiseGhostCurio()"
            class="tab-gold px-3 py-1 font-bold cursor-pointer"
          >
            鉴宝淘货 (600两)
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-2.5 content-start pr-1 text-xs">
        <div
          v-for="item in store.ghostListings"
          :key="item.id"
          class="wuxia-elevated p-3 flex flex-col justify-between gap-2"
        >
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-bold text-sm">{{ item.itemName }}</span>
              <span
                class="text-[10px] px-1.5 py-0.2 border"
                :class="item.listingType === 'AUCTION' ? 'ink-gold border-[var(--border-gold-subtle)]' : 'ink-muted border-[var(--border-ink)]'"
              >
                {{ item.listingType === 'AUCTION' ? '子时竞拍' : '匿名一口价' }}
              </span>
            </div>
            <p class="text-[11px] ink-muted">{{ item.desc }}</p>
            <div class="text-[11px] ink-muted">
              摊主：{{ item.maskedSeller }}
              <span v-if="item.highestBidderMasked"> · 领先：{{ item.highestBidderMasked }}</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)]">
            <span class="font-bold ink-gold tabular-nums">
              {{ item.price.toLocaleString() }} {{ item.currency === 'GOLD' ? '元宝' : '两纹银' }}
            </span>
            <button
              @click="store.buyOrBidMarketListing(item)"
              class="token-btn px-3 py-0.5 font-semibold cursor-pointer"
            >
              {{ item.listingType === 'AUCTION' ? '加价 +50元宝' : '匿名买下' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 华山论剑 -->
    <div v-else-if="subTab === 'HUASHAN'" class="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      <div class="text-xs ink-muted shrink-0">
        观察五绝对手常用三才架势，前往「随身武库」切换克制架势即可越级夺取五绝石碑尊位。
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-3 content-start pr-1 text-xs">
        <div
          v-for="fg in fiveGreatsPlayers"
          :key="fg.title"
          class="wuxia-elevated p-3.5 flex flex-col justify-between gap-2.5"
        >
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="tab-gold px-1.5 py-0.2 font-bold">{{ fg.title }}</span>
                <span class="font-brush text-lg leading-none">{{ fg.nickname }}</span>
              </div>
              <span class="tabular-nums ink-muted">战 {{ fg.power.toLocaleString() }}</span>
            </div>
            <p class="italic text-[11px] ink-muted">“{{ fg.poem }}”</p>
            <div class="text-[11px] ink-gold">
              常摆「{{ getStanceLabel(fg.stance) }}」 · {{ fg.sect }}
            </div>
          </div>

          <button
            @click="challengeFiveGreats(fg)"
            class="w-full py-1.5 seal-stamp font-bold cursor-pointer"
          >
            登顶递帖 · 夺「{{ fg.title }}」尊位
          </button>
        </div>
      </div>
    </div>

    <!-- 4. 全服唯一兵器谱 -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5">
      <div class="text-xs ink-muted shrink-0">
        每件传世真品全服仅存一件（1/1）。持有者连续离线满 72 小时自动收回奖池，或于周日守擂战败当场易主。
      </div>
      <div class="grid grid-cols-2 gap-3 content-start pr-1 text-xs">
        <div
          v-for="art in store.uniqueArtifacts"
          :key="art.artifactCode"
          class="wuxia-elevated p-3.5 border-l-2 border-l-[var(--accent-cinnabar)] space-y-1.5"
        >
          <div class="flex items-center justify-between">
            <span class="font-brush text-xl leading-none ink-gold">「{{ art.name }}」</span>
            <span class="text-[11px] ink-muted">孤品 1/1 · 连守 {{ art.defendStreak }} 届</span>
          </div>
          <div>
            执掌者：
            <span class="font-bold">{{ art.holderNickname ?? '无主（秘境待出世）' }}</span>
            <span class="ink-muted ml-1">({{ art.holderSect }})</span>
          </div>
          <div class="text-[11px] ink-muted">流转节点：{{ art.nextContestLabel }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
