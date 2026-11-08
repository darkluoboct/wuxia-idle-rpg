<script setup lang="ts">
import { useGameStore } from '@/stores/gameStore'
import { SECTS } from '@/config/gameData'

const store = useGameStore()

function checkEligible(sectId: string) {
  const s = SECTS.find((x) => x.id === sectId)!
  return s.checkReq(store.player.stats, store.ownedItemIds.includes('iron_bagua'))
}
</script>

<template>
  <div class="wuxia-card p-3.5 h-full min-h-0 flex flex-col gap-3 overflow-y-auto">
    <!-- ==================== 状态 A：已拜入师门 ==================== -->
    <template v-if="store.currentSect">
      <div class="flex items-center justify-between gap-2 border-b border-[var(--border-ink)] pb-2.5 shrink-0">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] tab-gold px-1.5 py-0.2 font-bold">当前师门</span>
            <h3 class="font-brush text-2xl leading-none">{{ store.currentSect.name }}</h3>
          </div>
          <div class="text-xs ink-muted mt-1">
            辈分：第 {{ store.player.sectRank }} 阶「{{ store.currentSect.ranks[store.player.sectRank - 1] }}」 · 师门功绩：{{ store.player.sectContribution }}
          </div>
        </div>

        <label class="token-btn flex items-center gap-1.5 text-xs px-3 py-1.5 cursor-pointer">
          <input type="checkbox" v-model="store.player.isGuardingLibrary" class="accent-[#c8a66b]" />
          <span>藏经阁值守（拦截偷师）</span>
        </label>
      </div>

      <div class="wuxia-elevated p-3.5 flex items-center justify-between gap-3 border-l-2 border-l-[var(--border-gold)] shrink-0">
        <div class="space-y-0.5">
          <div class="text-xs ink-gold font-bold">
            本服当届玩家首席大弟子（每周六同门演武决出）
          </div>
          <div class="text-sm font-bold">
            「{{ store.currentSect.chiefPlayerName }}」 · 战力 {{ store.currentSect.chiefPower.toLocaleString() }}
          </div>
          <div class="text-[11px] ink-muted">向首席大师兄抱拳请安，同门共享真气与贡献犒赏</div>
        </div>
        <button
          @click="store.saluteChiefPlayer()"
          class="tab-gold px-3.5 py-1.5 text-xs font-bold cursor-pointer shrink-0"
        >
          抱拳请安 (+1800真气)
        </button>
      </div>

      <div class="space-y-2 shrink-0">
        <div class="text-xs font-bold ink-muted">师门五阶晋升阶梯（升至第 4 阶解锁无损「圆满出师」兼修百家）</div>
        <div class="grid grid-cols-5 gap-2 text-center text-xs">
          <div
            v-for="(rk, i) in store.currentSect.ranks"
            :key="rk"
            class="p-2.5 border"
            :class="
              i + 1 === store.player.sectRank
                ? 'tab-gold font-bold'
                : i + 1 < store.player.sectRank
                  ? 'ink-jade border-[var(--border-ink)]'
                  : 'wuxia-elevated ink-muted'
            "
          >
            <div class="text-[11px] opacity-75">第{{ i + 1 }}阶</div>
            <div class="font-bold truncate mt-0.5">{{ rk }}</div>
          </div>
        </div>
      </div>

      <div class="wuxia-elevated p-3 text-xs leading-relaxed ink-muted">
        <b class="text-[var(--text-ink)]">宗门传承：</b>{{ store.currentSect.perkDesc }}
      </div>

      <div class="mt-auto flex items-center justify-between gap-2 pt-2.5 border-t border-[var(--border-ink)] text-xs shrink-0">
        <button
          @click="store.challengeSectPromotion()"
          class="seal-stamp px-4 py-1.5 font-bold cursor-pointer"
        >
          申请门派升阶大考
        </button>

        <div class="flex items-center gap-2">
          <button
            @click="store.leaveSect('GRADUATE')"
            class="token-btn px-3.5 py-1.5 font-semibold cursor-pointer"
          >
            圆满出师 (需4阶)
          </button>
          <button
            @click="store.leaveSect('BETRAY')"
            class="token-btn px-3.5 py-1.5 ink-cinnabar font-semibold cursor-pointer"
          >
            携技强行叛师
          </button>
        </div>
      </div>
    </template>

    <!-- ==================== 状态 B：无门派·逍遥散人 ==================== -->
    <template v-else>
      <div class="wuxia-elevated p-3 border-l-2 border-l-[var(--border-gold)] space-y-1 shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[11px] tab-gold px-1.5 py-0.2 font-bold">当前身份</span>
            <h3 class="font-brush text-xl leading-none">无门无派 · 逍遥散人</h3>
          </div>
          <span class="text-xs ink-jade">散人四大特权生效中</span>
        </div>
        <p class="text-xs leading-relaxed ink-muted">
          一、混搭百家武学无真气排斥；二、周伯通、风清扬等隐士倾囊相授无门户偏见；三、进出子时鬼市免蒙面享九折；四、随时可择师拜入下方宗门。
        </p>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-3 content-start pr-1 text-xs">
        <div
          v-for="sect in SECTS"
          :key="sect.id"
          class="wuxia-elevated p-3 flex flex-col justify-between gap-2.5"
        >
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-brush text-lg leading-none">{{ sect.name }}</span>
              <span class="text-[11px] ink-muted">首席：{{ sect.chiefPlayerName }}</span>
            </div>
            <p class="text-[11px] ink-muted leading-relaxed">{{ sect.perkDesc }}</p>
            <div
              class="text-[11px] pt-1"
              :class="checkEligible(sect.id).ok ? 'ink-jade' : 'ink-gold'"
            >
              {{ checkEligible(sect.id).ok ? '已达标：' : '门槛：' }}{{ sect.reqDesc }}
            </div>
          </div>

          <button
            @click="store.joinSect(sect.id)"
            class="w-full py-1.5 cursor-pointer transition"
            :class="checkEligible(sect.id).ok ? 'tab-gold font-bold' : 'token-btn ink-muted'"
          >
            奉茶拜入{{ sect.name }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
