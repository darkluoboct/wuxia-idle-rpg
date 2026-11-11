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
    title: `要叛出${sect.name}吗？`,
    body: '叛出师门后，侠义减少 120，追杀令持续 48 小时。你在任何地图都可能被追捕，以后也不能再拜入这个门派。',
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
                第 {{ rank }} 阶「<b class="text-gold">{{ store.currentSect.ranks[rank - 1] }}</b>」 · 门派贡献 <b class="tabular-nums">{{ store.player.sectContribution }}</b>
              </div>
            </div>
          </div>
          <button class="flex items-center gap-2 text-sm text-ink2" role="switch" :aria-checked="store.player.isGuardingLibrary" @click="store.player.isGuardingLibrary = !store.player.isGuardingLibrary">
            <span class="switch" :aria-checked="store.player.isGuardingLibrary" />
            看守藏经阁
          </button>
        </header>

        <!-- 五阶晋升阶梯 -->
        <div>
          <div class="sec-title mb-1">门派晋升</div>
          <p class="hint mb-3">升到第 4 阶就能出师。出师后可以保留学过的武功，再拜别的门派。</p>
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
            <div class="text-xs text-gold">本门首席弟子</div>
            <div class="text-base font-bold">「{{ store.currentSect.chiefPlayerName }}」<span class="ml-2 text-sm font-normal tabular-nums text-ink2">战力 {{ store.currentSect.chiefPower.toLocaleString() }}</span></div>
            <div class="hint">向首席弟子问好，可领真气和门派贡献。</div>
          </div>
          <button class="btn btn-gold" @click="store.saluteChiefPlayer()">抱拳问好 · +1,800 真气</button>
        </div>

        <div class="well p-3 text-sm leading-relaxed text-ink2">{{ store.currentSect.perkDesc }}</div>

        <!-- 操作 -->
        <div class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <button class="btn btn-seal !min-h-[2.6rem] px-5" @click="store.challengeSectPromotion()">参加晋升考核</button>
          <div class="flex flex-wrap items-center gap-2">
            <span v-if="!canGraduate" class="text-xs text-ink3">还差 {{ 4 - rank }} 阶可出师</span>
            <button class="btn" :disabled="!canGraduate" @click="store.leaveSect('GRADUATE')">出师</button>
            <button class="btn btn-danger" @click="confirmBetray">叛出师门</button>
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
                <div class="mt-1 text-xs text-jade">你还没有拜师</div>
              </div>
            </div>
          </div>
          <p class="relative mt-3 text-sm text-ink2">散人可以自由练武、结交伙伴。想拜师时，看看下面各门派的入门条件。</p>
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
              <span>{{ sect.reqDesc }}</span>
            </div>
            <button class="btn btn-block" :class="eligibility(sect.id).ok ? 'btn-gold' : ''" :disabled="!eligibility(sect.id).ok" @click="store.joinSect(sect.id)">
              {{ eligibility(sect.id).ok ? `拜入${sect.name}` : '还不符合条件' }}
            </button>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
