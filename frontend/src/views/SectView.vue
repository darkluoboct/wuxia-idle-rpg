<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { ITEMS, SECTS, SKILLS, type SectConfig } from '@/config/gameData'
import { ALIGNMENT_META, BASE_STAT_LABELS, STANCE_META, TIER_META } from '@/config/uiMeta'
import type { PortraitStyle } from '@/config/typesHelper'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { battleObjectiveText } from '../../../shared/combatMeta.ts'
import { GAIBANG_BRANCHES, GAIBANG_DEBATE, GAIBANG_DIVISION, gaibangPerks } from '../../../shared/gaibang.ts'
import { meetsSectRequirement } from '../../../shared/gameData.ts'
import { equippedMartialSkills, martialOrigin, WANDERER_MASTERY } from '../../../shared/martialSchools.ts'
import { karmaAfterEvent } from '../../../shared/player.ts'
import { SECT_EQUIPMENT_SETS, sectEquipmentPartId, WANDERER_EQUIPMENT } from '../../../shared/sectEquipment.ts'
import { sectPromotion } from '../../../shared/sectProgress.ts'
import ItemIcon from '@/components/ItemIcon.vue'
import PortraitCard from '@/components/PortraitCard.vue'
import QuanzhenLibrary from '@/components/QuanzhenLibrary.vue'
import SectContest from '@/components/SectContest.vue'
import WorkbenchDialog from '@/components/WorkbenchDialog.vue'

const store = useGameStore()
const chapterTab = ref<'HALL' | 'CONTEST' | 'LIBRARY'>('HALL')
const selectedSect = ref<string>()
const selectedRank = ref<number>()
const sheet = ref<HTMLElement>()
const examSection = ref<HTMLElement>()
const debating = ref(false)
const busy = computed(() => store.isBattlePlaying || store.onlineActionBusy)
const rank = computed(() => store.player.sectRank)
const canGraduate = computed(() => rank.value >= 4 || store.currentSect?.id === 'jiangnan_wuguan')
const focusedSect = computed(() => store.currentSect ?? SECTS.find(({ id }) => id === selectedSect.value))
const promotionRank = computed(() => store.currentSect ? sectPromotion(store.currentSect, store.player, store.storyFlags).newRank : 1)
const previewRank = computed(() => selectedRank.value ?? promotionRank.value)
const atNextExam = computed(() => !!store.currentSect && store.canPromoteSect && previewRank.value === promotionRank.value)
const exam = computed(() => atNextExam.value ? store.sectPromotionExam : focusedSect.value?.promotionExams?.[previewRank.value])
const gaibang = computed(() => gaibangPerks(store.player))
const origins = computed(() => [...new Map(equippedMartialSkills(store.currentLoadout).map((skill) => {
  const source = martialOrigin(skill)
  return [source.id, source.name]
})).values()])
const eligibility = computed(() => Object.fromEntries(SECTS.map((sect) => [sect.id, store.sectEligibility(sect)])))
const requirementContext = computed(() => ({ hasBagua: store.ownedItemIds.includes('iron_bagua'), flags: store.storyFlags }))
const rankSkills = computed(() => (focusedSect.value?.signatureSkills[previewRank.value - 1] ?? []).map((id) => SKILLS[id]))
const rankItems = computed(() => {
  const sect = focusedSect.value
  if (!sect) return []
  const signature = sect.signatureItems?.[previewRank.value]
  const sets = SECT_EQUIPMENT_SETS.filter((set) => set.sectId === sect.id && set.rank === previewRank.value)
  return [
    ...(signature ? [{ id: signature, name: ITEMS[signature].name }] : []),
    ...sets.map((set) => ({ id: sectEquipmentPartId(set.id, set.parts[0].slot), name: set.name })),
  ]
})
const representatives: Record<string, { name: string; style: PortraitStyle; id?: string }> = {
  gaibang: { name: '北丐·洪七公', style: 'hongqigong', id: 'hongqigong' },
  quanzhen: { name: '中神通·王重阳', style: 'wangchongyang', id: 'wangchongyang' },
  taohua: { name: '东邪·黄药师', style: 'huangyaoshi', id: 'huangyaoshi' },
  baituo: { name: '西毒·欧阳锋', style: 'ouyangfeng', id: 'ouyangfeng' },
  jiangnan_wuguan: { name: '总教头·铁拳张', style: 'hero_sword' },
  tiezhang: { name: '铁掌水上漂·裘千仞', style: 'qiuqianren', id: 'qiuqianren' },
  yideng: { name: '南帝·一灯大师', style: 'yideng', id: 'yideng' },
}
const representative = computed(() => focusedSect.value && representatives[focusedSect.value.id])
const glyphs: Record<string, string> = { gaibang: '丐', quanzhen: '全', taohua: '桃', baituo: '驼', jiangnan_wuguan: '武', tiezhang: '铁', yideng: '灯' }
const glyphOf = (sect: SectConfig) => glyphs[sect.id] ?? sect.name.slice(0, 1)

watch([() => store.currentSect?.id, rank], () => {
  chapterTab.value = 'HALL'
  selectedRank.value = undefined
  debating.value = false
})
function selectSect(id?: string) {
  selectedSect.value = id
  selectedRank.value = undefined
  if (sheet.value) sheet.value.scrollTop = 0
}
function selectRank(next: number) {
  selectedRank.value = next
  debating.value = false
  if (sheet.value) sheet.value.scrollTop = 0
}
async function showNextExam() {
  selectRank(promotionRank.value)
  await nextTick()
  examSection.value?.scrollIntoView({ block: 'nearest' })
}
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
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <nav class="tabs shrink-0" role="tablist" aria-label="门派栏目">
        <button class="tab" role="tab" :aria-selected="chapterTab === 'HALL'" @click="chapterTab = 'HALL'">
          {{ store.currentSect ? '师门大殿' : '拜师选派' }}
        </button>
        <button v-if="store.currentSect" class="tab" role="tab" :aria-selected="chapterTab === 'CONTEST'" @click="chapterTab = 'CONTEST'">门派演武</button>
        <button v-if="!IS_MOCK_MODE" class="tab" role="tab" :aria-selected="chapterTab === 'LIBRARY'" @click="chapterTab = 'LIBRARY'">藏经阁</button>
      </nav>

      <QuanzhenLibrary v-if="chapterTab === 'LIBRARY'" />
      <template v-else-if="store.currentSect && chapterTab === 'CONTEST'">
        <SectContest v-if="!IS_MOCK_MODE" :key="store.currentSect.id" :sect-id="store.currentSect.id" />
        <article v-else class="workbench-detail flex-1">
          <div class="workbench-scroll flex flex-wrap items-center gap-4">
            <PortraitCard bare :name="store.currentSect.chiefPlayerName" :style-type="representative?.style ?? 'hero_sword'" class="workbench-portrait w-36" />
            <div>
              <h3 class="font-brush text-2xl text-gold">本门首席大弟子</h3>
              <p class="hint">战力 {{ store.currentSect.chiefPower.toLocaleString() }} · 向首席请安可得真气与门派贡献。</p>
            </div>
          </div>
          <footer class="workbench-actions">
            <button class="btn btn-gold" :disabled="busy || !store.canSaluteSect" @click="store.saluteChiefPlayer()">
              {{ store.canSaluteSect ? '抱拳问好 · +1,800 真气' : '今日已请安' }}
            </button>
          </footer>
        </article>
      </template>

      <template v-else>
        <header v-if="store.currentSect" class="workbench-toolbar justify-between border-b border-line pb-2">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="seal h-9 w-9 text-xl" aria-hidden="true">{{ glyphOf(store.currentSect) }}</span>
            <span class="font-brush text-2xl text-gold">{{ store.currentSect.name }}</span>
            <span class="text-xs text-ink2">第 {{ rank }} 阶 · {{ store.currentSect.ranks[rank - 1] }}</span>
            <span class="text-xs text-ink2">贡献 <b class="tabular-nums">{{ store.player.sectContribution }}</b></span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button v-if="store.currentSect.id === 'gaibang' && store.player.currentMapId !== 'jiaxing_suburb'" class="btn btn-sm"
              :disabled="busy || !!store.journeyMap || !store.canBegToday" @click="store.travelTo('jiaxing_suburb')">前往嘉兴南湖化缘</button>
            <button v-else-if="store.currentSect.id === 'gaibang'" class="btn btn-sm btn-gold" :disabled="busy || !store.canBegToday" @click="store.begForAlms()">
              {{ store.canBegToday ? '讨饭化缘' : '今日已化缘' }}
            </button>
            <button v-if="store.mayReceiveSnakeRecipe" class="btn btn-sm btn-gold" :disabled="busy"
              title="炼制蝮蛇见血膏少用 1 株蛇涎草" @click="store.claimSnakeRecipe()">领取蛇药饲喂方</button>
            <button v-if="store.unclaimedSectEquipment.length" class="btn btn-sm btn-gold" :disabled="busy"
              :title="store.unclaimedSectEquipment.map((id) => ITEMS[id].name).join('、')" @click="store.claimSectEquipment()">领取宗门装</button>
            <button v-if="IS_MOCK_MODE" class="btn btn-sm" role="switch" :aria-checked="store.player.isGuardingLibrary"
              @click="store.player.isGuardingLibrary = !store.player.isGuardingLibrary">
              <span class="switch" :aria-checked="store.player.isGuardingLibrary" /> 看守藏经阁
            </button>
            <WorkbenchDialog title="师门规矩">
              <p>第四阶可出师，江南武馆可以随时出师。出师后保留已习武学，可再拜别派。</p>
              <p>叛出师门会损失侠义，触发 48 小时追杀令，此后不能再拜入原师门。</p>
            </WorkbenchDialog>
          </div>
        </header>

        <div class="workbench">
          <aside v-if="!store.currentSect" class="workbench-index" aria-label="门派名帖">
            <div class="workbench-scroll">
              <button class="workbench-entry" :aria-pressed="!focusedSect" @click="selectSect()">
                <span class="seal h-7 w-7 shrink-0" aria-hidden="true">散</span>
                <span class="flex-1 text-sm font-bold">逍遥散人</span>
                <small class="text-jade">当前</small>
              </button>
              <button v-for="sect in SECTS" :key="sect.id" class="workbench-entry" :aria-pressed="focusedSect?.id === sect.id" @click="selectSect(sect.id)">
                <span class="seal h-7 w-7 shrink-0 text-sm" aria-hidden="true">{{ glyphOf(sect) }}</span>
                <span class="min-w-0 flex-1 truncate text-sm font-bold" :title="sect.name">{{ sect.name }}</span>
                <small class="shrink-0" :class="eligibility[sect.id].ok ? 'text-jade' : 'text-ink3'">{{ eligibility[sect.id].ok ? '可拜入' : '差条件' }}</small>
              </button>
            </div>
          </aside>

          <aside v-else class="workbench-index" aria-label="五阶晋升阶梯">
            <h3 class="sec-title shrink-0">门派晋升</h3>
            <div class="workbench-scroll">
              <button v-for="(title, index) in store.currentSect.ranks" :key="title" class="workbench-entry"
                :aria-pressed="previewRank === index + 1" @click="selectRank(index + 1)">
                <span class="shrink-0 font-bold tabular-nums text-gold">{{ index + 1 }} 阶</span>
                <b class="min-w-0 flex-1 text-sm">{{ title }}</b>
                <small v-if="index + 1 === rank" class="shrink-0 text-jade">当前</small>
                <Check v-else-if="index + 1 < rank" :size="14" class="shrink-0 text-jade" aria-label="已晋升" />
              </button>
            </div>
          </aside>

          <article v-if="focusedSect" class="workbench-detail" :aria-label="focusedSect.name">
            <div ref="sheet" class="workbench-scroll space-y-4">
              <header class="grid grid-cols-[minmax(0,1fr)_minmax(6rem,24%)] items-center gap-3 border-b border-line pb-3">
                <div class="min-w-0 space-y-2">
                  <span class="chip" :class="ALIGNMENT_META[focusedSect.alignment].cls">{{ ALIGNMENT_META[focusedSect.alignment].label }}</span>
                  <h3 class="font-brush text-2xl leading-tight md:text-3xl">{{ store.currentSect ? focusedSect.ranks[previewRank - 1] : focusedSect.name }}</h3>
                  <p class="text-sm text-ink2">{{ focusedSect.perkDesc }}</p>
                  <p v-if="gaibang" class="hint">
                    <b class="text-gold">{{ gaibang.name }}</b>
                    <span v-if="gaibang.conPercent"> · 根骨 +{{ gaibang.conPercent }}% · 护体防御 +{{ gaibang.defensePercent }}%</span>
                    <span v-else> · 身法 +{{ gaibang.agiPercent }}% · 纹银收益 +{{ gaibang.silverPercent }}%</span>
                  </p>
                </div>
                <PortraitCard v-if="representative" bare class="workbench-portrait min-w-0" :name="representative.name" :style-type="representative.style" :portrait-id="representative.id" />
              </header>

              <section v-if="!store.currentSect" aria-label="入门门槛">
                <h4 class="sec-title">入门门槛</h4>
                <ul v-if="focusedSect.requirements.length" class="flex flex-wrap gap-2">
                  <li v-for="(requirement, index) in focusedSect.requirements" :key="index"
                    class="flex items-center gap-1.5 border border-line px-2 py-1.5 text-sm"
                    :class="meetsSectRequirement(requirement, store.player.stats, requirementContext) ? 'text-jade' : 'text-cinnabar'">
                    <Check v-if="meetsSectRequirement(requirement, store.player.stats, requirementContext)" :size="14" role="img" aria-label="达标" />
                    <X v-else :size="14" role="img" aria-label="未达标" />
                    <span v-if="'stat' in requirement">
                      {{ BASE_STAT_LABELS[requirement.stat] }} {{ store.player.stats[requirement.stat] }}
                      <template v-if="requirement.atMost"> / 至多 {{ requirement.value }}</template>
                      <template v-else> / {{ requirement.value }}</template>
                    </span>
                    <span v-else>{{ requirement.label }}</span>
                  </li>
                </ul>
                <p v-else class="hint">{{ focusedSect.reqDesc }}</p>
                <p v-if="focusedSect.introBonus" class="hint mt-1">持引荐信入门可多得 {{ focusedSect.introBonus }} 点贡献。</p>
              </section>

              <section class="space-y-2" aria-label="门派传承">
                <h4 class="sec-title">第 {{ previewRank }} 阶传承</h4>
                <div v-if="!store.currentSect" class="workbench-toolbar" role="group" aria-label="选择传承阶位">
                  <button v-for="(title, index) in focusedSect.ranks" :key="title" class="btn btn-sm" :class="{ 'btn-gold': previewRank === index + 1 }"
                    :aria-pressed="previewRank === index + 1" @click="selectedRank = index + 1">{{ index + 1 }} 阶 · {{ title }}</button>
                </div>
                <div v-if="rankSkills.length || rankItems.length" class="flex flex-wrap gap-2">
                  <button v-for="skill in rankSkills" :key="skill.id" class="btn btn-sm tier-text" :class="TIER_META[skill.tier].cls"
                    @click="store.inspectById('skill', skill.id)">
                    <i class="art h-6 w-6" :class="'art-' + skill.slot.toLowerCase()" aria-hidden="true" />{{ skill.name }}
                  </button>
                  <button v-for="item in rankItems" :key="item.id" class="btn btn-sm tier-text" :class="TIER_META[ITEMS[item.id].tier].cls"
                    @click="store.inspectById('item', item.id)">
                    <ItemIcon :item-id="item.id" class="[--item-icon-size:1.5rem]" />{{ item.name }}
                  </button>
                </div>
                <p v-else class="hint">本阶暂无新授武学或宗门装。</p>
              </section>

              <div v-if="atNextExam && store.gaibangChoicePending" ref="examSection" class="well space-y-2 p-3 text-sm leading-relaxed text-ink2">
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
              <div v-else-if="exam || previewRank > 1" ref="examSection" class="space-y-2 border-t border-line pt-3 text-sm text-ink2">
                <div class="grid grid-cols-[minmax(0,1fr)_minmax(5.25rem,24%)] items-center gap-2">
                  <div class="space-y-1">
                    <h4 class="sec-title">{{ exam?.title ?? '晋升考核' }}</h4>
                    <p v-if="exam?.objective">{{ battleObjectiveText(exam.objective, exam.opponent.name) }}</p>
                    <p v-else>与{{ exam?.opponent.name ?? '本门传功长老' }}切磋。</p>
                    <p v-if="exam?.hint" class="hint">{{ exam.hint }}</p>
                    <p v-if="exam?.requiredStance" class="hint">指定打法 · {{ STANCE_META[exam.requiredStance].name }}</p>
                    <p v-if="exam?.requiresTwoCompanions" class="hint">左右翼各需一名已入队伙伴。</p>
                    <p v-if="atNextExam && store.sectPromotionBlockReason" class="text-cinnabar">{{ store.sectPromotionBlockReason }}</p>
                  </div>
                  <PortraitCard bare size="sm" class="workbench-portrait min-w-0"
                    :name="exam?.opponent.name ?? '传功长老'" :style-type="exam?.opponent.portrait ?? 'huangyaoshi'" />
                </div>
                <ul v-if="atNextExam && store.gaibangFinalPending" class="divide-y divide-line" aria-label="三道考核佳肴">
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
            </div>
            <footer class="workbench-actions">
              <template v-if="store.currentSect">
                <span v-if="!canGraduate" class="mr-auto text-xs text-ink3">还差 {{ 4 - rank }} 阶可出师</span>
                <button class="btn btn-sm" :disabled="!canGraduate || busy" @click="store.leaveSect('GRADUATE')">出师</button>
                <button class="btn btn-sm btn-danger" :disabled="busy" @click="confirmBetray">叛出师门</button>
                <button v-if="store.canPromoteSect && (!atNextExam || store.gaibangChoicePending)" class="btn btn-sm btn-gold" :disabled="busy" @click="showNextExam">
                  {{ store.gaibangChoicePending ? '查看分宗考核' : '查看下一阶考核' }}
                </button>
                <button v-else-if="store.canPromoteSect" class="btn btn-sm btn-seal" :disabled="busy || !!store.sectPromotionBlockReason" @click="store.challengeSectPromotion()">
                  {{ store.gaibangFinalPending ? '赴压鬼岛迎战' : '参加晋升考核' }}
                </button>
              </template>
              <template v-else>
                <span v-if="!eligibility[focusedSect.id].ok" class="mr-auto text-xs text-cinnabar">{{ eligibility[focusedSect.id].reason }}</span>
                <button class="btn btn-seal" :disabled="!eligibility[focusedSect.id].ok || busy" @click="store.joinSect(focusedSect.id)">拜入{{ focusedSect.name }}</button>
              </template>
            </footer>
          </article>

          <article v-else class="workbench-detail" aria-label="逍遥散人">
            <div ref="sheet" class="workbench-scroll space-y-4">
              <header class="flex flex-wrap items-center gap-4 border-b border-line pb-3">
                <PortraitCard bare is-main :name="store.player.nickname" :avatar-id="store.player.avatarId" style-type="hero_sword" class="workbench-portrait w-28" />
                <div>
                  <h3 class="font-brush text-3xl text-gold">逍遥散人</h3>
                  <p class="mt-1 text-sm text-ink2">尚未拜师，可从名帖查阅各派传承。</p>
                </div>
              </header>
              <section class="space-y-2" aria-label="兼收并蓄">
                <h4 class="sec-title">{{ WANDERER_MASTERY.name }} · {{ origins.length }}/4 种武学来源</h4>
                <div class="flex flex-wrap gap-2">
                  <span v-for="origin in origins" :key="origin" class="chip chip-jade">{{ origin }}</span>
                </div>
                <p class="hint">四个槽位各配一门不同来源的武学，六维 +{{ WANDERER_MASTERY.statPercent }}%，连击率 +{{ WANDERER_MASTERY.comboPoints }} 个百分点。</p>
              </section>
              <section class="space-y-2" aria-label="千机任侠套装">
                <h4 class="sec-title">{{ WANDERER_EQUIPMENT.sourceName }}</h4>
                <div class="flex flex-wrap gap-2">
                  <button v-for="item in WANDERER_EQUIPMENT.items" :key="item.id" class="btn btn-sm" @click="store.inspectById('item', item.id)">
                    <ItemIcon :item-id="item.id" class="[--item-icon-size:1.5rem]" />{{ item.name }}
                  </button>
                </div>
                <p class="hint">{{ store.wandererTeamDamage ? `全队伤害 +${store.wandererTeamDamage}%` : '穿戴千机任侠装备时，每个不同门派的装备出处提供 5% 全队伤害。' }}</p>
                <p v-if="!store.player.trial.rewardedStageIds.includes(WANDERER_EQUIPMENT.stage)" class="hint">
                  战胜历练第 {{ WANDERER_EQUIPMENT.stage }} 关后可到嘉兴领取。
                </p>
              </section>
            </div>
            <footer v-if="store.unclaimedWandererEquipment" class="workbench-actions">
              <button v-if="store.currentMap.id === WANDERER_EQUIPMENT.mapId" class="btn btn-gold" :disabled="busy"
                @click="store.claimWandererEquipment()">在烟雨楼领取千机任侠套装</button>
              <button v-else class="btn" :disabled="busy || !!store.journeyMap" @click="store.travelTo(WANDERER_EQUIPMENT.mapId)">前往嘉兴烟雨楼</button>
            </footer>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
