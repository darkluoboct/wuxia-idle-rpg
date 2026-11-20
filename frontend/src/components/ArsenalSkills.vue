<script setup lang="ts">
import { computed, nextTick, onActivated, ref } from 'vue'
import { ArrowLeft, ChevronRight } from 'lucide-vue-next'
import { SKILLS, type SkillConfig } from '@/config/gameData'
import { formatSkillPower, SKILL_SLOT_META, STANCE_META, TIER_META } from '@/config/uiMeta'
import type { LoadoutPresetDTO, SkillSlotType, StanceType } from '@/network/protocol'
import { useGameStore } from '@/stores/gameStore'
import { getSkillMasteryCap, MAX_SKILL_MASTERY, skillFragmentDiscount, skillPowerAtMastery } from '../../../shared/skillMastery.ts'
import { hasMartialFreedom, martialEffectiveness, martialOrigin } from '../../../shared/martialSchools.ts'

const props = defineProps<{ fromBag?: string }>()
const emit = defineEmits<{ backToBag: [] }>()
const store = useGameStore()
const root = ref<HTMLElement>()
const detailHeading = ref<HTMLElement>()
const skillSlots = [
  { type: 'INNER', field: 'innerSkillId', art: 'art-inner' },
  { type: 'OUTER', field: 'outerSkillId', art: 'art-outer' },
  { type: 'LIGHT', field: 'lightSkillId', art: 'art-light' },
  { type: 'ULT', field: 'ultSkillId', art: 'art-ult' },
] as const
const stances = Object.keys(STANCE_META) as StanceType[]
const activeSlot = ref<SkillSlotType>('OUTER')
const selectedId = ref<string>()

const slots = computed(() => skillSlots.map((slot) => {
  const id = store.currentLoadout[slot.field]
  return { ...slot, ...SKILL_SLOT_META[slot.type], equipped: id ? SKILLS[id] : undefined }
}))
const selectedSlot = computed(() => slots.value.find(({ type }) => type === activeSlot.value)!)
const candidates = computed(() => Object.entries(store.learnedSkills).flatMap(([id, level]) => {
  const skill = SKILLS[id]
  return skill && skill.slot === activeSlot.value && level > 0 ? [{ skill, level }] : []
}).sort((a, b) => Number(b.skill.id === selectedSlot.value.equipped?.id) - Number(a.skill.id === selectedSlot.value.equipped?.id)))

function effectsAt(skill: SkillConfig, level: number, freedom: boolean, efficiency: number) {
  const effects: string[] = []
  const effective = (amount: number) => formatSkillPower(amount * efficiency / 100)
  if (skill.slot === 'OUTER' || skill.slot === 'ULT') {
    effects.push(`招式威力 ×${formatSkillPower(skillPowerAtMastery(skill, level, store.player, freedom))}`)
  }
  if (skill.speedBonus) effects.push(`出手速度 +${effective(skill.speedBonus)}`)
  if (skill.dodgeBonus) effects.push(`闪避率 +${effective(skill.dodgeBonus)}%`)
  if (skill.critBonus) effects.push(`暴击率 +${effective(skill.critBonus)}%`)
  if (skill.idleQiBonus) effects.push(`修行真气 +${effective(skill.idleQiBonus)}%`)
  const penetration = skill.battleEffects?.find((effect) => effect.kind === 'ARMOR_PENETRATION')
  if (penetration) effects.push(`无视防御 ${penetration.percent}%`)
  return effects
}

const detail = computed(() => {
  const id = props.fromBag ?? selectedId.value
  const skill = id && SKILLS[id]
  const level = id ? store.learnedSkills[id] ?? 0 : 0
  if (!skill || !level) return
  const slot = slots.value.find(({ type }) => type === skill.slot)!
  const cap = getSkillMasteryCap(skill.tier, store.player.level)
  const next = level < cap ? level + 1 : undefined
  const cost = next ? store.getSkillUpgradeCost(skill.id) : 0
  const fragments = store.player.skillFragments?.[skill.id] ?? 0
  const discount = skillFragmentDiscount(skill, cost, fragments)
  const freedom = hasMartialFreedom(store.currentLoadout)
  const efficiency = martialEffectiveness(skill, store.player, freedom)
  const currentEffects = effectsAt(skill, level, freedom, efficiency)
  const nextEffects = next ? [...effectsAt(skill, next, freedom, efficiency), '臂力 +1'] : []
  const qi = store.player.qiExp
  return {
    skill, slot, level, cap, next, cost, fragments, discount, efficiency, currentEffects, nextEffects,
    origin: martialOrigin(skill),
    missingQi: Math.max(0, (discount.count ? discount.spentQi : cost) - qi),
  }
})

async function choosePreset(event: Event) {
  const field = event.target as HTMLSelectElement
  const index = Number(field.value) as LoadoutPresetDTO['presetIdx']
  await store.switchLoadout(index)
  field.value = String(store.player.activePresetIdx)
}

function equip(skill: SkillConfig) {
  const slot = skillSlots.find(({ type }) => type === skill.slot)
  if (slot) return store.updateLoadout({ [slot.field]: skill.id }, `已装配《${skill.name}》`)
}

function openDetail(id: string) {
  selectedId.value = id
  void nextTick(() => detailHeading.value?.focus({ preventScroll: true }))
}

function leaveDetail() {
  if (props.fromBag) {
    emit('backToBag')
    return
  }
  const id = selectedId.value
  selectedId.value = undefined
  void nextTick(() => root.value?.querySelector<HTMLElement>(`[data-skill-id="${id}"]`)?.focus({ preventScroll: true }))
}

onActivated(() => {
  if (props.fromBag) void nextTick(() => detailHeading.value?.focus({ preventScroll: true }))
})

function onEscape(event: KeyboardEvent) {
  if (!detail.value || store.inspectModal || store.confirmDialog) return
  event.stopPropagation()
  leaveDetail()
}
</script>

<template>
  <div ref="root" class="martial-workspace" @keydown.esc="onEscape">
    <section v-show="!detail" class="martial-layout" aria-label="武学配置">
      <div class="martial-pane">
        <div class="martial-bar">
          <h2 class="sec-title">上阵武功</h2>
          <label class="preset-field">
            <span>出战方案</span>
            <select class="field" :value="store.player.activePresetIdx" :disabled="store.onlineActionBusy" @change="choosePreset">
              <option v-for="preset in Object.values(store.presets)" :key="preset.presetIdx" :value="preset.presetIdx">{{ preset.name }}</option>
            </select>
          </label>
        </div>
        <div class="martial-scroll">
          <h3 class="sec-title section-label">战斗打法</h3>
          <div class="stance-grid" role="radiogroup" aria-label="战斗打法">
            <button v-for="stance in stances" :key="stance" type="button" class="martial-choice" role="radio"
              :aria-checked="store.currentLoadout.stance === stance" :disabled="store.onlineActionBusy"
              @click="store.updateLoadout({ stance })">
              <b>{{ STANCE_META[stance].name }}</b>
              <small>克制 {{ STANCE_META[STANCE_META[stance].beats].name }}</small>
              <small class="text-ink3">{{ STANCE_META[stance].style }}</small>
            </button>
          </div>
          <div class="slot-grid" role="group" aria-label="武学槽位">
            <button v-for="slot in slots" :key="slot.type" type="button" class="martial-choice slot-choice"
              :aria-pressed="activeSlot === slot.type" @click="activeSlot = slot.type">
              <span class="skill-icon" aria-hidden="true"><i class="art" :class="slot.art" /></span>
              <span class="min-w-0"><small>{{ slot.label }}</small>
                <b :class="slot.equipped && TIER_META[slot.equipped.tier].cls">{{ slot.equipped?.name ?? '未装配' }}</b>
                <small v-if="slot.equipped && store.learnedSkills[slot.equipped.id]" class="text-ink3">第 {{ store.learnedSkills[slot.equipped.id] }} 重</small>
              </span>
            </button>
          </div>
        </div>
      </div>
      <div class="martial-pane">
        <div class="martial-bar">
          <h2 class="sec-title">已习得 · {{ selectedSlot.label }}</h2>
          <span class="text-ink3 text-xs">{{ candidates.length }} 门</span>
        </div>
        <div class="martial-scroll">
          <ul v-if="candidates.length" class="skill-list">
            <li v-for="{ skill, level } in candidates" :key="skill.id" class="skill-row">
              <button type="button" class="skill-link" :data-skill-id="skill.id" :aria-label="`查看${skill.name}详情`" @click="openDetail(skill.id)">
                <span class="skill-icon" :class="TIER_META[skill.tier].cls" aria-hidden="true"><i class="art" :class="selectedSlot.art" /></span>
                <span class="min-w-0"><b class="tier-text" :class="TIER_META[skill.tier].cls">{{ skill.name }}</b>
                  <small>第 {{ level }} 重 · {{ TIER_META[skill.tier].label }} · {{ martialOrigin(skill).name }}</small>
                </span>
                <ChevronRight class="skill-chevron" aria-hidden="true" />
              </button>
              <span v-if="selectedSlot.equipped?.id === skill.id" class="chip chip-jade">已上阵</span>
              <button v-else type="button" class="btn btn-sm" :disabled="store.onlineActionBusy" :aria-label="`装配${skill.name}`" @click="equip(skill)">装配</button>
            </li>
          </ul>
          <p v-else class="hint mt-3">还没习得{{ selectedSlot.label }}。闯关或结交侠客，有机会学到新招。</p>
        </div>
      </div>
    </section>

    <section v-if="detail" class="martial-layout martial-detail" aria-label="武学详情">
      <div class="martial-pane">
        <div class="martial-bar">
          <button type="button" class="btn btn-sm" @click="leaveDetail"><ArrowLeft aria-hidden="true" />{{ fromBag ? '返回背包' : '返回武学' }}</button>
          <span class="text-xs text-ink3">武学详情 · {{ detail.slot.label }}</span>
        </div>
        <div class="martial-scroll skill-profile">
          <div class="skill-cover" :class="TIER_META[detail.skill.tier].cls">
            <div class="skill-icon" aria-hidden="true"><i class="art" :class="detail.slot.art" /></div>
            <div>
              <h2 ref="detailHeading" tabindex="-1" class="font-brush tier-text">{{ detail.skill.name }}</h2>
              <p class="text-ink2">{{ detail.origin.name }} · {{ TIER_META[detail.skill.tier].label }}</p>
            </div>
          </div>
          <p>{{ detail.skill.desc }}</p>
          <p class="hint">来源 · {{ detail.skill.source }}</p>
          <p v-if="detail.efficiency < 100" class="text-cinnabar">
            {{ detail.efficiency === 80 ? '出师辅修' : '真气冲突' }} · 效力 {{ detail.efficiency }}%
          </p>
        </div>
        <footer class="martial-footer">
          <span v-if="detail.slot.equipped?.id === detail.skill.id" class="chip chip-jade">已上阵</span>
          <button v-else type="button" class="btn btn-sm" :disabled="store.onlineActionBusy"
            :aria-label="`装配${detail.skill.name}`" @click="equip(detail.skill)">装配到{{ detail.slot.label }}</button>
        </footer>
      </div>
      <div class="martial-pane">
        <div class="martial-bar"><h2 class="sec-title">参悟效果</h2><span class="text-xs text-ink3">本卷上限第 {{ detail.cap }} 重</span></div>
        <div class="martial-scroll" aria-live="polite">
          <div class="rank-grid">
            <section class="rank-column" aria-label="当前效果">
              <span>当前效果</span>
              <h3>第 {{ detail.level }} 重</h3>
              <ul v-if="detail.currentEffects.length"><li v-for="effect in detail.currentEffects" :key="effect">{{ effect }}</li></ul>
              <p v-else class="hint">已习得本招效果。</p>
            </section>
            <section class="rank-column" :aria-label="detail.next ? '下一重效果' : '重数上限'">
              <template v-if="detail.next">
                <span>下一重效果</span>
                <h3 class="text-jade">第 {{ detail.next }} 重</h3>
                <ul class="text-jade"><li v-for="effect in detail.nextEffects" :key="effect">{{ effect }}</li></ul>
              </template>
              <template v-else>
                <span>参悟进度</span>
                <h3>{{ detail.level >= MAX_SKILL_MASTERY ? '已大圆满' : '已达本卷极境' }}</h3>
                <p v-if="detail.level < MAX_SKILL_MASTERY" class="hint">突破大境界后可继续参悟。</p>
              </template>
            </section>
          </div>
          <p v-if="detail.fragments" class="text-sm text-ink2 mt-3">持有同名残页 {{ detail.fragments.toLocaleString() }} 张</p>
        </div>
        <footer v-if="detail.next" class="martial-footer">
          <div class="cost-readout">
            <span>需要真气 <b class="text-gold">{{ detail.cost.toLocaleString() }}</b></span>
            <span v-if="detail.missingQi" class="text-cinnabar">还差 {{ detail.missingQi.toLocaleString() }} 真气</span>
          </div>
          <div class="martial-actions">
            <button v-if="detail.discount.count" type="button" class="btn btn-sm"
              :disabled="store.player.qiExp < detail.discount.spentQi || store.onlineActionBusy"
              @click="store.upgradeSkillMastery(detail.skill.id, true)">
              用 {{ detail.discount.count }} 张残页参悟 · {{ detail.discount.spentQi.toLocaleString() }} 真气
            </button>
            <button type="button" class="btn btn-gold"
              :disabled="store.player.qiExp < detail.cost || store.onlineActionBusy"
              :aria-label="`升级${detail.skill.name}`" @click="store.upgradeSkillMastery(detail.skill.id)">升级武功</button>
          </div>
        </footer>
      </div>
    </section>
  </div>
</template>

<style scoped>
.martial-workspace { display: flex; flex: 1; min-height: 0; min-width: 0; }
.martial-layout {
  display: grid; flex: 1; min-height: 0; min-width: 0; gap: .8rem;
  grid-template-columns: minmax(0, .76fr) minmax(0, 1fr);
}
.martial-detail { grid-template-columns: minmax(0, .6fr) minmax(0, 1fr); }
.martial-pane {
  display: flex; flex-direction: column; gap: .7rem; min-height: 0; min-width: 0;
  padding: clamp(.55rem, 1.15vw, 1rem); border: 1px solid var(--line); background: var(--bg-1);
}
.martial-bar, .martial-footer, .preset-field, .martial-actions {
  display: flex; align-items: center; flex-wrap: wrap; gap: .4rem .55rem;
}
.martial-bar, .martial-footer { justify-content: space-between; flex: none; }
.martial-bar { min-height: 1.85rem; padding-bottom: .45rem; border-bottom: 1px solid var(--line); }
.martial-footer { padding-top: .6rem; border-top: 1px solid var(--line); }
.martial-actions { margin-inline-start: auto; }
.martial-bar .sec-title { flex: 1; margin: 0; font-size: 1.12rem; }
.preset-field, .cost-readout { color: var(--ink-2); font-size: .79rem; }
.preset-field select { min-width: 0; max-width: 100%; padding-block: .22rem; }
.martial-scroll { flex: 1; min-height: 0; overflow: auto; padding: .14rem; }
.section-label { margin: .25rem 0 .55rem; }
.slot-grid, .stance-grid, .rank-grid { display: grid; gap: .55rem; }
.slot-grid, .rank-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.stance-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.slot-grid { margin-top: 1rem; }
.martial-choice, .skill-row, .rank-column { min-width: 0; border: 1px solid var(--line-strong); background: var(--bg-0); }
.martial-choice { display: grid; gap: .26rem; padding: .58rem; text-align: start; }
.martial-choice small, .skill-link small { display: block; color: var(--ink-3); font-size: .76rem; }
.martial-choice:hover:not(:disabled), .martial-choice[aria-checked="true"], .martial-choice[aria-pressed="true"] { border-color: var(--gold); }
.martial-choice[aria-checked="true"], .martial-choice[aria-pressed="true"] { background: var(--gold-soft); }
.martial-choice b { color: var(--tc, var(--ink)); }
.slot-choice { grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: .5rem; }
.skill-icon { position: relative; width: clamp(1.6rem, 3.5vw, 2.7rem); aspect-ratio: 1; flex: none; border: 1px solid var(--tc, var(--line-strong)); }
.skill-icon .art { position: absolute; inset: 2px; }
.skill-list { display: grid; gap: .48rem; }
.skill-row { display: flex; align-items: center; gap: .45rem; padding-inline-end: .56rem; }
.skill-row:hover, .skill-row:focus-within { border-color: var(--gold); }
.skill-row > .btn, .skill-row > .chip { flex: none; }
.skill-link { display: flex; flex: 1; align-items: center; gap: .6rem; min-width: 0; padding: .6rem; text-align: start; }
.skill-link b { overflow-wrap: anywhere; }
.skill-chevron { flex: none; width: 1rem; margin-inline-start: auto; color: var(--ink-3); }
.skill-profile { display: flex; flex-direction: column; gap: .7rem; color: var(--ink-2); font-size: .88rem; }
.skill-profile > * { flex-shrink: 0; }
.skill-cover {
  display: flex; align-items: center; gap: .72rem; min-height: 5rem; padding: .65rem;
  border-block: 1px solid var(--line);
  background: radial-gradient(ellipse at 33% 50%, color-mix(in srgb, var(--tc) 12%, transparent), transparent 70%);
}
.skill-cover .skill-icon { width: clamp(2.4rem, 5.8vw, 4.4rem); }
.skill-cover h2 { font-size: clamp(1.15rem, 2vw, 1.72rem); line-height: 1.2; overflow-wrap: anywhere; }
.rank-column { display: grid; align-content: start; gap: .4rem; padding: .8rem; }
.rank-column > span { color: var(--ink-3); font-size: .8rem; }
.rank-column h3 { font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.rank-column ul { display: grid; gap: .24rem; font-size: .86rem; }
.cost-readout { display: grid; gap: .1rem; font-variant-numeric: tabular-nums; }
@media (max-width: 767px) {
  .martial-layout { gap: .35rem; }
  .slot-grid, .stance-grid, .rank-grid { gap: .24rem; }
  .martial-choice, .rank-column { padding: .35rem; }
  .slot-choice { grid-template-columns: minmax(0, 1fr); }
}
</style>
