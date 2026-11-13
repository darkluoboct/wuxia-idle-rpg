<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { ITEMS, SECTS } from '@/config/gameData'
import { ALIGNMENT_META } from '@/config/uiMeta'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { battleObjectiveText } from '../../../shared/combatMeta.ts'
import { GAIBANG_BRANCHES, GAIBANG_DEBATE, GAIBANG_DIVISION, gaibangPerks } from '../../../shared/gaibang.ts'
import { equippedMartialSkills, martialOrigin, WANDERER_MASTERY } from '../../../shared/martialSchools.ts'
import { karmaAfterEvent } from '../../../shared/player.ts'
import { WANDERER_EQUIPMENT } from '../../../shared/sectEquipment.ts'
import QuanzhenLibrary from '@/components/QuanzhenLibrary.vue'
import SectContest from '@/components/SectContest.vue'

const store = useGameStore()

const GLYPH: Record<string, string> = { gaibang: '丐', quanzhen: '全', taohua: '桃', baituo: '驼', jiangnan_wuguan: '武', tiezhang: '铁', yideng: '灯' }
const glyphOf = (s: { id: string; name: string }) => GLYPH[s.id] ?? s.name.slice(0, 1)

const rank = computed(() => store.player.sectRank)
const canGraduate = computed(() => rank.value >= 4 || store.currentSect?.id === 'jiangnan_wuguan')
const promotionExam = computed(() => store.sectPromotionExam)
const gaibang = computed(() => gaibangPerks(store.player))
const debating = ref(false)
const busy = computed(() => store.isBattlePlaying || store.onlineActionBusy)
const origins = computed(() => new Set(equippedMartialSkills(store.currentLoadout).map((skill) => martialOrigin(skill).id)).size)

function confirmBetray() {
  const sect = store.currentSect
  if (!sect) return
  const karma = store.player.stats.karma
  const lost = karma - karmaAfterEvent(karma, -120, store.currentLoadout.headId)
  store.askConfirm({
    title: `要叛出${sect.name}吗？`,
    body: `叛出师门后，侠义减少 ${lost} 点，追杀令持续 48 小时。你在任何地图都可能被追捕，以后也不能再拜入这个门派。`,
    confirmText: '叛出师门',
    tone: 'danger',
    onConfirm: () => store.leaveSect('BETRAY'),
  })
}
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-4">
      <QuanzhenLibrary v-if="!IS_MOCK_MODE" />
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
          <button v-if="IS_MOCK_MODE" class="flex items-center gap-2 text-sm text-ink2" role="switch" :aria-checked="store.player.isGuardingLibrary" @click="store.player.isGuardingLibrary = !store.player.isGuardingLibrary">
            <span class="switch" :aria-checked="store.player.isGuardingLibrary" />
            看守藏经阁
          </button>
        </header>

        <div v-if="store.mayReceiveSnakeRecipe" class="well flex flex-wrap items-center justify-between gap-2 p-3">
          <p class="hint">副总管为噬魂蛇君备下蛇药饲喂方，炼制蝮蛇见血膏可少用 1 株蛇涎草。</p>
          <button class="btn btn-sm btn-gold" :disabled="busy" @click="store.claimSnakeRecipe()">领取蛇药饲喂方</button>
        </div>

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

        <SectContest v-if="!IS_MOCK_MODE" :key="store.currentSect.id" :sect-id="store.currentSect.id" />
        <div v-else class="well relative flex flex-wrap items-center justify-between gap-3 overflow-hidden p-3.5">
          <div class="pointer-events-none absolute inset-y-0 left-0 w-1 bg-goldfill" />
          <div class="space-y-0.5 pl-2">
            <div class="text-xs text-gold">本门首席弟子</div>
            <div class="text-base font-bold">「{{ store.currentSect.chiefPlayerName }}」<span class="ml-2 text-sm font-normal tabular-nums text-ink2">战力 {{ store.currentSect.chiefPower.toLocaleString() }}</span></div>
            <div class="hint">向首席弟子问好，可领真气和门派贡献。</div>
          </div>
          <button class="btn btn-gold" :disabled="busy || !store.canSaluteSect" @click="store.saluteChiefPlayer()">
            {{ store.canSaluteSect ? '抱拳问好 · +1,800 真气' : '今日已请安' }}
          </button>
        </div>

        <div class="well p-3 text-sm leading-relaxed text-ink2">{{ store.currentSect.perkDesc }}</div>

        <div v-if="store.unclaimedSectEquipment.length" class="well flex flex-wrap items-center justify-between gap-2 p-3">
          <p class="hint">{{ store.unclaimedSectEquipment.map((id) => ITEMS[id].name).join('、') }}</p>
          <button class="btn btn-gold" :disabled="busy" @click="store.claimSectEquipment()">领取宗门装</button>
        </div>
        <div v-if="store.currentSect.id === 'gaibang'" class="well flex flex-wrap items-center justify-between gap-2 p-3">
          <p class="hint">每日可在嘉兴南湖化缘一次。</p>
          <button v-if="store.player.currentMapId !== 'jiaxing_suburb'" class="btn" :disabled="busy || !!store.journeyMap || !store.canBegToday" @click="store.travelTo('jiaxing_suburb')">前往嘉兴南湖</button>
          <button v-else class="btn btn-gold" :disabled="busy || !store.canBegToday" @click="store.begForAlms()">
            {{ store.canBegToday ? '讨饭化缘' : '今日已化缘' }}
          </button>
        </div>

        <p v-if="gaibang" class="well p-3 text-sm text-ink2">
          <b class="text-gold">{{ gaibang.name }}</b>
          <span v-if="gaibang.conPercent"> · 根骨 +{{ gaibang.conPercent }}% · 护体防御 +{{ gaibang.defensePercent }}%</span>
          <span v-else> · 身法 +{{ gaibang.agiPercent }}% · 纹银收益 +{{ gaibang.silverPercent }}%</span>
        </p>
        <div v-if="store.gaibangChoicePending" class="well space-y-2 p-3 text-sm leading-relaxed text-ink2">
          <p class="font-bold text-gold">{{ GAIBANG_DIVISION.title }}</p>
          <p>{{ GAIBANG_DIVISION.intro }}</p>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-seal" :disabled="busy" @click="store.challengeSectPromotion('WUYI')">硬接三掌 · 入污衣派</button>
            <button class="btn" :disabled="busy" @click="debating = !debating">以巧辩服众 · 入净衣派</button>
          </div>
          <p class="hint">污衣根骨 +{{ GAIBANG_BRANCHES.WUYI.conPercent }}%，护体防御 +{{ GAIBANG_BRANCHES.WUYI.defensePercent }}%。净衣身法 +{{ GAIBANG_BRANCHES.JINGYI.agiPercent }}%，纹银收益 +{{ GAIBANG_BRANCHES.JINGYI.silverPercent }}%。</p>
          <div v-if="debating" class="space-y-2 border-t border-line pt-2">
            <p>{{ GAIBANG_DEBATE.question }}</p>
            <div class="flex flex-wrap gap-2">
              <button v-for="(answer, i) in GAIBANG_DEBATE.answers" :key="answer.text" class="btn text-left" :disabled="busy" @click="store.answerGaibangDebate(i)">
                {{ answer.text }}
              </button>
            </div>
          </div>
        </div>
        <div v-else-if="promotionExam" class="well space-y-1 p-3 text-sm leading-relaxed text-ink2">
          <p class="font-bold text-gold">{{ promotionExam.title }}</p>
          <p v-if="promotionExam.objective">{{ battleObjectiveText(promotionExam.objective, promotionExam.opponent.name) }}</p>
          <p v-if="promotionExam.hint">{{ promotionExam.hint }}</p>
          <p v-if="!store.gaibangFinalPending && store.sectPromotionBlockReason" class="text-cinnabar">{{ store.sectPromotionBlockReason }}</p>
          <ul v-if="store.gaibangFinalPending" class="divide-y divide-line" aria-label="三道考核佳肴">
            <li v-for="dish in store.gaibangDishes" :key="dish.id" class="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b class="text-ink">{{ dish.name }}</b><span class="text-xs"> · {{ dish.mapName }}</span></span>
              <span v-if="dish.prepared" class="chip chip-jade">已备好</span>
              <button v-else-if="store.player.currentMapId !== dish.mapId" class="btn btn-sm" :disabled="busy || !!store.journeyMap" @click="store.travelTo(dish.mapId)">前往{{ dish.mapName }}</button>
              <button v-else class="btn btn-sm btn-gold" :disabled="busy || store.player.silver < dish.silver" @click="store.prepareGaibangDish(dish.id)">
                备办{{ dish.name }} · {{ dish.silver.toLocaleString() }} 两
              </button>
            </li>
          </ul>
        </div>

        <!-- 操作 -->
        <div class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <button v-if="store.canPromoteSect && !store.gaibangChoicePending" class="btn btn-seal !min-h-[2.6rem] px-5" :disabled="busy || !!store.sectPromotionBlockReason" @click="store.challengeSectPromotion()">
            {{ store.gaibangFinalPending ? '赴压鬼岛迎战' : '参加晋升考核' }}
          </button>
          <div class="flex flex-wrap items-center gap-2">
            <span v-if="!canGraduate" class="text-xs text-ink3">还差 {{ 4 - rank }} 阶可出师</span>
            <button class="btn" :disabled="!canGraduate || busy" @click="store.leaveSect('GRADUATE')">出师</button>
            <button class="btn btn-danger" :disabled="busy" @click="confirmBetray">叛出师门</button>
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
          <p class="relative mt-3 text-sm text-ink2">
            <b :class="store.isWandererMasteryActive ? 'text-jade' : 'text-ink'">{{ WANDERER_MASTERY.name }} · {{ origins }}/4 种武学来源</b>
            <span class="ml-2">四个槽位各配一门不同来源的武学，六维 +{{ WANDERER_MASTERY.statPercent }}%，连击率 +{{ WANDERER_MASTERY.comboPoints }} 个百分点。</span>
          </p>
          <div class="relative mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p class="hint">
              <b :class="store.wandererTeamDamage ? 'text-jade' : 'text-ink'">{{ WANDERER_EQUIPMENT.sourceName }}</b>
              <span v-if="store.wandererTeamDamage"> · 全队伤害 +{{ store.wandererTeamDamage }}%</span>
              <span v-else> · 穿戴千机任侠装备，每个不同门派的装备出处提供 5% 全队伤害。</span>
            </p>
            <template v-if="store.unclaimedWandererEquipment">
              <button v-if="store.currentMap.id === WANDERER_EQUIPMENT.mapId" class="btn btn-gold" :disabled="busy" @click="store.claimWandererEquipment()">在烟雨楼领取千机任侠套装</button>
              <button v-else class="btn" :disabled="busy || !!store.journeyMap" @click="store.travelTo(WANDERER_EQUIPMENT.mapId)">前往嘉兴烟雨楼</button>
            </template>
            <span v-else-if="!store.player.trial.rewardedStageIds.includes(WANDERER_EQUIPMENT.stage)" class="hint">战胜历练第 {{ WANDERER_EQUIPMENT.stage }} 关后可到嘉兴领取。</span>
          </div>
        </div>

        <div class="view-scroll -mr-1 grid content-start gap-3 pr-1 sm:grid-cols-2">
          <article v-for="sect in SECTS" :key="sect.id" class="well well-hover flex flex-col gap-2.5 p-3.5">
            <div class="flex items-center gap-3">
              <span class="seal h-11 w-11 text-2xl" :class="sect.alignment === 'HERETIC' ? '!bg-[#3a2a44] !shadow-[0_0_0_0.12rem_#3a2a44]' : sect.alignment === 'RIGHTEOUS' ? '!bg-[#2f5b4e] !shadow-[0_0_0_0.12rem_#2f5b4e]' : ''">{{ glyphOf(sect) }}</span>
              <div class="min-w-0 flex-1">
                <h4 class="font-brush truncate text-xl leading-none">{{ sect.name }}</h4>
                <div class="mt-1 flex items-center gap-2 text-xs">
                  <span :class="ALIGNMENT_META[sect.alignment].cls">{{ ALIGNMENT_META[sect.alignment].label }}</span>
                  <span v-if="IS_MOCK_MODE" class="truncate text-ink3">首席 · {{ sect.chiefPlayerName }}</span>
                </div>
              </div>
            </div>
            <p class="hint flex-1">{{ sect.perkDesc }}</p>
            <div class="flex items-start gap-1.5 text-xs leading-snug" :class="store.sectEligibility(sect).ok ? 'text-jade' : 'text-cinnabar'">
              <Check v-if="store.sectEligibility(sect).ok" :size="14" class="mt-0.5 shrink-0" /><X v-else :size="14" class="mt-0.5 shrink-0" />
              <span>{{ store.sectEligibility(sect).reason || sect.reqDesc }}</span>
            </div>
            <button class="btn btn-block" :class="store.sectEligibility(sect).ok ? 'btn-gold' : ''" :disabled="!store.sectEligibility(sect).ok || store.onlineActionBusy" @click="store.joinSect(sect.id)">
              {{ store.sectEligibility(sect).ok ? `拜入${sect.name}` : '还不符合条件' }}
            </button>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
