<script setup lang="ts">
import { computed } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { SECTS } from '@/config/gameData'
import { ALIGNMENT_META } from '@/config/uiMeta'

const store = useGameStore()

const GLYPH: Record<string, string> = { gaibang: '丐', quanzhen: '全', taohua: '桃', baituo: '驼', jiangnan_wuguan: '武', tiezhang: '铁', yideng: '灯' }
const glyphOf = (s: { id: string; name: string }) => GLYPH[s.id] ?? s.name.slice(0, 1)

const eligibility = (sectId: string) => {
  const s = SECTS.find((x) => x.id === sectId)!
  return s.checkReq(store.player.stats, { hasBagua: store.ownedItemIds.includes('iron_bagua'), flags: store.storyFlags })
}

const rank = computed(() => store.player.sectRank)
const canGraduate = computed(() => rank.value >= 4)

function confirmBetray() {
  const sect = store.currentSect
  if (!sect) return
  store.askConfirm({
    title: '携技强行叛师？',
    body: `叛出【${sect.name}】后：侠义 −120，全服发布甲字号追杀令（持续 48 小时），任何地图都可能遭同道截杀；该门派将永不再收你。此举不可撤销。`,
    confirmText: '叛出师门',
    tone: 'danger',
    onConfirm: () => store.leaveSect('BETRAY'),
  })
}
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-4">
      <!-- ==================== 已拜入师门 ==================== -->
      <div v-if="store.currentSect" class="view-scroll -mr-1 flex flex-col gap-4 pr-1">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3.5">
            <span class="seal h-14 w-14 text-4xl">{{ glyphOf(store.currentSect) }}</span>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-brush text-[1.9rem] leading-none">{{ store.currentSect.name }}</h3>
                <span class="chip" :class="ALIGNMENT_META[store.currentSect.alignment].cls">{{ ALIGNMENT_META[store.currentSect.alignment].label }}</span>
              </div>
              <div class="mt-1.5 text-sm text-ink2">
                第 {{ rank }} 阶「<b class="text-gold">{{ store.currentSect.ranks[rank - 1] }}</b>」 · 师门功绩 <b class="tabular-nums">{{ store.player.sectContribution }}</b>
              </div>
            </div>
          </div>
          <button class="flex items-center gap-2 text-sm text-ink2" role="switch" :aria-checked="store.player.isGuardingLibrary" @click="store.player.isGuardingLibrary = !store.player.isGuardingLibrary">
            <span class="switch" :aria-checked="store.player.isGuardingLibrary" />
            藏经阁值守<span class="text-xs text-ink3">（拦截偷师）</span>
          </button>
        </header>

        <!-- 五阶晋升阶梯 -->
        <div>
          <div class="sec-title mb-3">师门五阶 <span class="text-xs font-sans tracking-normal text-ink3">升至第 4 阶可无损「圆满出师」，兼修百家</span></div>
          <ol class="grid grid-cols-5 gap-1">
            <li v-for="(rk, i) in store.currentSect.ranks" :key="rk" class="relative flex flex-col items-center text-center">
              <span v-if="i > 0" class="absolute right-1/2 top-[1.15rem] -z-0 h-px w-full" :class="i + 1 <= rank ? 'bg-jade' : 'bg-line'" />
              <span
                class="relative z-10 flex h-[2.3rem] w-[2.3rem] items-center justify-center rounded-full border text-sm font-bold"
                :class="{
                  'border-jade bg-[color-mix(in_srgb,var(--jade)_16%,var(--bg-1))] text-jade': i + 1 < rank,
                  'anim-pulse-glow border-gold bg-[var(--gold-soft)] text-gold': i + 1 === rank,
                  'border-linestrong bg-raised text-ink3': i + 1 > rank,
                }"
              >
                <Check v-if="i + 1 < rank" :size="16" /><template v-else>{{ i + 1 }}</template>
              </span>
              <span class="mt-1.5 text-xs leading-tight" :class="i + 1 === rank ? 'font-bold text-gold' : i + 1 < rank ? 'text-jade' : 'text-ink3'">{{ rk }}</span>
            </li>
          </ol>
        </div>

        <!-- 首席大弟子 -->
        <div class="well relative flex flex-wrap items-center justify-between gap-3 overflow-hidden p-3.5">
          <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-goldfill" />
          <div class="space-y-0.5 pl-2">
            <div class="text-xs text-gold">本服当届玩家首席大弟子 · 每周六同门演武决出</div>
            <div class="text-base font-bold">「{{ store.currentSect.chiefPlayerName }}」<span class="ml-2 text-sm font-normal tabular-nums text-ink2">战力 {{ store.currentSect.chiefPower.toLocaleString() }}</span></div>
            <div class="hint">向首席大师兄抱拳请安，同门共享真气与贡献犒赏。</div>
          </div>
          <button class="btn btn-gold" @click="store.saluteChiefPlayer()">抱拳请安 · +1800 真气</button>
        </div>

        <div class="well p-3 text-sm leading-relaxed text-ink2"><b class="text-ink">宗门传承：</b>{{ store.currentSect.perkDesc }}</div>

        <!-- 操作 -->
        <div class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <button class="btn btn-seal !min-h-[2.6rem] px-5" @click="store.challengeSectPromotion()">申请门派升阶大考</button>
          <div class="flex flex-wrap items-center gap-2">
            <span v-if="!canGraduate" class="text-xs text-ink3">还差 {{ 4 - rank }} 阶可出师</span>
            <button class="btn" :disabled="!canGraduate" @click="store.leaveSect('GRADUATE')">圆满出师</button>
            <button class="btn btn-danger" @click="confirmBetray">携技强行叛师</button>
          </div>
        </div>
      </div>

      <!-- ==================== 无门派·逍遥散人 ==================== -->
      <template v-else>
        <div class="well relative shrink-0 overflow-hidden p-4">
          <div class="pointer-events-none absolute inset-0" style="background: radial-gradient(ellipse at 100% 0, var(--gold-soft), transparent 60%)" />
          <div class="relative flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-3">
              <span class="seal h-11 w-11 text-2xl">散</span>
              <div>
                <h3 class="font-brush text-2xl leading-none">无门无派 · 逍遥散人</h3>
                <div class="mt-1 text-xs text-jade">四大散人特权生效中</div>
              </div>
            </div>
          </div>
          <ul class="relative mt-3 grid gap-x-6 gap-y-1 text-sm text-ink2 sm:grid-cols-2">
            <li>① 混搭百家武学，无真气排斥</li>
            <li>② 周伯通、风清扬等隐士倾囊相授，无门户偏见</li>
            <li>③ 进出子时鬼市免蒙面，享九折</li>
            <li>④ 随时可择师拜入下方宗门</li>
          </ul>
        </div>

        <div class="view-scroll -mr-1 grid content-start gap-3 pr-1 sm:grid-cols-2">
          <article v-for="sect in SECTS" :key="sect.id" class="well well-hover flex flex-col gap-2.5 p-3.5">
            <div class="flex items-center gap-3">
              <span class="seal h-11 w-11 text-2xl" :class="sect.alignment === 'HERETIC' ? '!bg-[#3a2a44] !shadow-[0_0_0_0.12rem_#3a2a44]' : sect.alignment === 'RIGHTEOUS' ? '!bg-[#2f5b4e] !shadow-[0_0_0_0.12rem_#2f5b4e]' : ''">{{ glyphOf(sect) }}</span>
              <div class="min-w-0 flex-1">
                <h4 class="font-brush truncate text-xl leading-none">{{ sect.name }}</h4>
                <div class="mt-1 flex items-center gap-2 text-xs">
                  <span :class="ALIGNMENT_META[sect.alignment].cls">{{ ALIGNMENT_META[sect.alignment].label }}</span>
                  <span class="truncate text-ink3">首席 · {{ sect.chiefPlayerName }}</span>
                </div>
              </div>
            </div>
            <p class="hint flex-1">{{ sect.perkDesc }}</p>
            <div class="flex items-start gap-1.5 text-xs leading-snug" :class="eligibility(sect.id).ok ? 'text-jade' : 'text-cinnabar'">
              <Check v-if="eligibility(sect.id).ok" :size="14" class="mt-0.5 shrink-0" /><X v-else :size="14" class="mt-0.5 shrink-0" />
              <span>{{ sect.reqDesc }}<template v-if="!eligibility(sect.id).ok && eligibility(sect.id).reason">（{{ eligibility(sect.id).reason }}）</template></span>
            </div>
            <button class="btn btn-block" :class="eligibility(sect.id).ok ? 'btn-gold' : ''" :disabled="!eligibility(sect.id).ok" @click="store.joinSect(sect.id)">
              奉茶拜入{{ sect.name }}
            </button>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
