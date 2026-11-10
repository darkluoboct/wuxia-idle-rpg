<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Check } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { ACUPOINTS, ACUPOINT_PILLS, COMPANIONS, REALMS, SKILLS, TRIO_SYNERGIES, type SkillConfig } from '@/config/gameData'
import { formatSkillPower, SKILL_SLOT_META, STANCE_META, TIER_META } from '@/config/uiMeta'
import type { StanceType } from '@/network/protocol'
import InkFigure from '@/components/InkFigure.vue'
import EquipmentPanel from '@/components/EquipmentPanel.vue'
import { MAX_SKILL_MASTERY, getSkillMasteryCap, skillPowerAtMastery } from '../../../shared/skillMastery.ts'

const store = useGameStore()
const { arsenalTab: sub } = storeToRefs(store)

const intDiscountPct = computed(() => Math.round((store.player.stats.intStat / (store.player.stats.intStat + 180)) * 100))

/* ---------- 武学 ---------- */
const stances = Object.keys(STANCE_META) as StanceType[]
const slots = [
  { slot: 'INNER', key: 'innerSkillId', help: '提高修行收益' },
  { slot: 'OUTER', key: 'outerSkillId', help: '战斗时常用的招式' },
  { slot: 'LIGHT', key: 'lightSkillId', help: '更容易躲开攻击' },
  { slot: 'ULT', key: 'ultSkillId', help: '怒气攒满时自动出招' },
] as const

const skillSlots = computed(() => slots.map((slot) => {
  const equippedId = store.currentLoadout[slot.key]
  const equipped = equippedId ? SKILLS[equippedId] : undefined
  const level = equipped ? (store.learnedSkills[equipped.id] ?? 0) : 0
  const cap = equipped ? getSkillMasteryCap(equipped.tier, store.player.level) : MAX_SKILL_MASTERY
  const learned = Object.values(SKILLS).filter((skill) => skill.slot === slot.slot && store.learnedSkills[skill.id] > 0)
  const cost = equipped && level < cap ? store.getSkillUpgradeCost(equipped.id) : 0
  const power = equipped && (equipped.slot === 'OUTER' || equipped.slot === 'ULT')
    ? skillPowerAtMastery(equipped, IS_MOCK_MODE ? 1 : level)
    : null
  const nextPower = equipped && power !== null && !IS_MOCK_MODE && level > 0 && level < cap
    ? skillPowerAtMastery(equipped, level + 1)
    : null
  return { ...slot, equipped, level, cap, learned, cost, power, nextPower, stats: equipped ? skillStats(equipped, power) : [] }
}))

function skillStats(s: SkillConfig, power: number | null) {
  const out: string[] = []
  if (power !== null) out.push(`招式威力 ×${IS_MOCK_MODE ? power.toFixed(2) : formatSkillPower(power)}`)
  if (s.speedBonus) out.push(`出手速度 +${s.speedBonus}`)
  if (s.dodgeBonus) out.push(`闪避率 +${s.dodgeBonus}%`)
  if (s.critBonus) out.push(`暴击率 +${s.critBonus}%`)
  if (s.idleQiBonus) out.push(`修行真气 +${s.idleQiBonus}%`)
  return out
}

/* ---------- 编队 ---------- */
const recruited = (role: 'LEFT' | 'RIGHT') =>
  Object.values(COMPANIONS).filter((c) => c.role === role && store.companionAffinity[c.id]?.recruited)
const isRecruited = (id: string) => !!store.companionAffinity[id]?.recruited
const isActive = (s: (typeof TRIO_SYNERGIES)[number]) => store.activeTrioSynergy?.id === s.id
function applySynergy(s: (typeof TRIO_SYNERGIES)[number]) {
  store.updateLoadout({ leftCompanionId: s.leftId, rightCompanionId: s.rightId })
}

/* ---------- 经脉冲穴与冲穴灵丹 ---------- */
const currentMeridianRealm = computed(() => {
  return REALMS.find((r) => r.tier === store.player.realmTier) ?? REALMS[0]
})

const realmAcupoints = computed(() => {
  return ACUPOINTS.filter((ap) => ap.realmTier === store.player.realmTier).sort((a, b) => a.order - b.order)
})

const piercedCount = computed(() => {
  return realmAcupoints.value.filter((ap) => store.openedAcupointIds.includes(ap.id)).length
})

const isMeridianCompleted = computed(() => {
  return piercedCount.value >= realmAcupoints.value.length
})

const acupointPillsList = computed(() => {
  return Object.values(ACUPOINT_PILLS).map((pill) => ({
    ...pill,
    count: store.pillInventory[pill.id] ?? 0,
  }))
})

function getAcupointCost(cost: number) {
  const intDiscount = store.player.stats.intStat / (store.player.stats.intStat + 250)
  return Math.max(100, Math.round(cost * (1 - intDiscount * 0.28)))
}

function canPierce(apId: string, order: number) {
  if (store.openedAcupointIds.includes(apId)) return false
  const prev = realmAcupoints.value.filter((a) => a.order < order)
  return prev.every((a) => store.openedAcupointIds.includes(a.id))
}

</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist">
          <button class="tab" role="tab" :aria-selected="sub === 'SKILLS'" @click="sub = 'SKILLS'">武学</button>
          <button class="tab" role="tab" :aria-selected="sub === 'SQUAD'" @click="sub = 'SQUAD'">伙伴</button>
          <button class="tab" role="tab" :aria-selected="sub === 'EQUIP'" @click="sub = 'EQUIP'">装备</button>
          <button class="tab" role="tab" :aria-selected="sub === 'MERIDIAN'" @click="sub = 'MERIDIAN'">经脉冲穴</button>
        </div>
        <span v-if="sub === 'SKILLS' || sub === 'MERIDIAN'" class="text-xs tabular-nums text-jade font-brush">现有真气 {{ store.player.qiExp.toLocaleString() }}</span>
      </div>

      <!-- 武学与战斗打法 -->
      <div v-if="sub === 'SKILLS'" class="view-scroll -mr-1 space-y-4 pr-1">
        <div>
          <h3 class="sec-title mb-1">战斗打法</h3>
          <p class="hint mb-2">出战前选一种打法。对手用奇门，你就用刚猛。选对了，打得更重，挨打也更轻。</p>
          <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="战斗打法">
            <button
              v-for="st in stances" :key="st" role="radio" :aria-checked="store.currentLoadout.stance === st"
              class="well well-hover relative p-2.5 text-left"
              :class="store.currentLoadout.stance === st ? '!border-gold bg-[var(--gold-soft)]' : ''"
              :disabled="store.onlineActionBusy" @click="store.updateLoadout({ stance: st })"
            >
              <div class="flex items-center justify-between gap-1">
                <b class="text-sm" :class="store.currentLoadout.stance === st ? 'text-gold' : ''">{{ STANCE_META[st].name }}</b>
                <Check v-if="store.currentLoadout.stance === st" :size="14" class="text-gold" aria-hidden="true" />
              </div>
              <div class="mt-0.5 text-xs text-jade">克制 {{ STANCE_META[STANCE_META[st].beats].name }}</div>
              <div class="mt-1 text-xs leading-snug text-ink2">{{ STANCE_META[st].style }}</div>
            </button>
          </div>
        </div>

        <div>
          <h3 class="sec-title mb-1">上阵武功</h3>
          <p class="hint mb-2">每类选一门，点武功名字就能换上。升级会花真气，你的悟性能省下 {{ intDiscountPct }}%。</p>
          <div class="grid gap-3 lg:grid-cols-2">
            <article v-for="sl in skillSlots" :key="sl.slot" class="well flex min-w-0 flex-col gap-2.5 p-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="seal-gold seal h-6 w-6 text-sm">{{ SKILL_SLOT_META[sl.slot].glyph }}</span>
                  <b class="text-sm">{{ SKILL_SLOT_META[sl.slot].label }}</b>
                </div>
                <span class="text-xs text-ink3">已学 {{ sl.learned.length }} 门</span>
              </div>
              <p class="text-xs text-ink2">{{ sl.help }}</p>

              <!-- 当前装配 -->
              <div
                v-if="sl.equipped"
                class="space-y-2 bg-[var(--bg-1)] p-2.5"
                :class="[TIER_META[sl.equipped.tier].cls, 'tier-edge', sl.equipped.tier === 'red' ? 'glow-border' : '']"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-brush tier-text text-xl leading-tight">{{ sl.equipped.name }}</h4>
                  <span class="chip tier-chip">{{ TIER_META[sl.equipped.tier].label }}</span>
                </div>
                <p class="hint">{{ sl.equipped.desc }}</p>
                <div v-if="sl.stats.length" class="flex flex-wrap gap-1">
                  <span v-for="stat in sl.stats" :key="stat" class="chip">{{ stat }}</span>
                </div>
                <div v-if="sl.level" class="flex flex-wrap items-center gap-2 text-xs text-ink2">
                  <span class="tabular-nums">第 {{ sl.level }} 重 / 本卷限第 {{ sl.cap }} 重 (大圆满 {{ MAX_SKILL_MASTERY }} 重)</span>
                  <div class="flex gap-[0.2rem]" aria-hidden="true">
                    <i
                      v-for="n in MAX_SKILL_MASTERY" :key="n" class="block h-2 w-2 rotate-45 border"
                      :class="n <= sl.level ? 'border-[var(--tc)] bg-[var(--tc)]' : 'border-linestrong'"
                    />
                  </div>
                </div>
              </div>
              <p v-else class="border border-dashed border-linestrong p-3 text-sm text-ink2">
                {{ sl.learned.length ? '还没选，点下方武功换上。' : '还没学会这类武功。闯关或结交侠客，有机会学到新招。' }}
              </p>

              <div v-if="sl.learned.length" class="mt-auto flex flex-wrap items-center gap-1.5">
                <button
                  v-for="sk in sl.learned" :key="sk.id" class="chip transition-colors"
                  :class="[TIER_META[sk.tier].cls, store.currentLoadout[sl.key] === sk.id ? 'tier-chip font-bold' : 'opacity-75 hover:opacity-100']"
                  :title="store.currentLoadout[sl.key] === sk.id ? '正在使用' : `换上${sk.name}`"
                  :aria-pressed="store.currentLoadout[sl.key] === sk.id" :disabled="store.onlineActionBusy" @click="store.updateLoadout({ [sl.key]: sk.id })"
                >
                  {{ sk.name }}
                </button>
              </div>
              <div v-if="sl.equipped && sl.level" class="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2">
                <p v-if="sl.nextPower !== null && sl.power !== null" class="w-full text-xs tabular-nums text-jade">
                  下一重威力 ×{{ formatSkillPower(sl.power) }} → ×{{ formatSkillPower(sl.nextPower) }}（+{{ formatSkillPower(sl.nextPower - sl.power) }}）
                </p>
                <p v-else-if="!IS_MOCK_MODE && sl.level < MAX_SKILL_MASTERY" class="w-full text-xs text-jade">升一重，臂力 +1。</p>
                <span v-if="sl.level >= MAX_SKILL_MASTERY" class="chip chip-jade">已大圆满</span>
                <span v-else-if="sl.level >= sl.cap" class="chip chip-gold" title="受当前境界经脉所限，突破大境界方可领悟后几重">已达本卷极境(第{{ sl.cap }}重)</span>
                <button
                  v-else class="btn btn-sm btn-gold" :disabled="store.player.qiExp < sl.cost || store.onlineActionBusy"
                  :aria-label="`升级${sl.equipped.name}`" @click="store.upgradeSkillMastery(sl.equipped.id)"
                >升级武功</button>
                <span v-if="sl.level < sl.cap" class="text-xs tabular-nums text-ink2">花费 {{ sl.cost.toLocaleString() }} 真气</span>
                <span v-if="sl.level < sl.cap && store.player.qiExp < sl.cost" class="text-xs text-cinnabar">
                  还差 {{ (sl.cost - store.player.qiExp).toLocaleString() }} 真气
                </span>
              </div>
            </article>
          </div>
        </div>
      </div>

      <!-- ============ 编队 ============ -->
      <div v-else-if="sub === 'SQUAD'" class="view-scroll -mr-1 space-y-4 pr-1">
        <div>
          <h3 class="sec-title mb-1">伙伴搭档</h3>
          <p class="hint mb-2">特定伙伴一起上阵，左边的伙伴会更常出手。</p>
          <div class="grid gap-2 md:grid-cols-3">
            <article
              v-for="s in TRIO_SYNERGIES" :key="s.id" class="well flex flex-col gap-1.5 p-3"
              :class="isActive(s) ? '!border-gold bg-[var(--gold-soft)]' : ''"
            >
              <div class="flex items-center justify-between gap-2">
                <b class="font-brush text-lg" :class="isActive(s) ? 'text-gold' : ''">{{ s.name }}</b>
                <span v-if="isActive(s)" class="chip chip-gold">已上阵</span>
              </div>
              <p class="hint flex-1">{{ s.bonusText }}</p>
              <button
                v-if="!isActive(s)" class="btn btn-sm" :disabled="store.onlineActionBusy || !isRecruited(s.leftId) || !isRecruited(s.rightId)"
                @click="applySynergy(s)"
              >
                {{ isRecruited(s.leftId) && isRecruited(s.rightId) ? '一起上阵' : `先结交 ${[s.leftId, s.rightId].filter((i) => !isRecruited(i)).map((i) => COMPANIONS[i].name).join('、')}` }}
              </button>
            </article>
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
          <div v-for="side in ([{ role: 'LEFT', title: '左侧伙伴', sub: '跟着你一起打', key: 'leftCompanionId' }, { role: 'RIGHT', title: '右侧伙伴', sub: '帮你挡招', key: 'rightCompanionId' }] as const)" :key="side.role" class="well space-y-2 p-3">
            <div class="flex items-baseline justify-between">
              <b :class="side.role === 'LEFT' ? 'text-gold' : 'text-jade'">{{ side.title }}</b>
              <span class="text-xs text-ink3">{{ side.sub }}</span>
            </div>
            <div class="space-y-1.5" role="radiogroup" :aria-label="side.title">
              <button
                v-for="c in recruited(side.role)" :key="c.id" role="radio" :aria-checked="store.currentLoadout[side.key] === c.id"
                class="well-hover flex w-full items-center gap-3 border p-2 text-left"
                :class="[TIER_META[c.tier].cls, store.currentLoadout[side.key] === c.id ? 'border-gold bg-[var(--gold-soft)]' : 'border-line bg-[var(--bg-1)]']"
                :disabled="store.onlineActionBusy" @click="store.updateLoadout({ [side.key]: c.id })"
              >
                <span class="relative h-[3.6rem] w-[3rem] shrink-0 overflow-hidden bg-raised"><InkFigure :style-type="c.portraitStyle" /></span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5"><b class="text-sm">{{ c.name }}</b><span class="chip tier-chip !py-0 !text-[0.68rem]">{{ c.title }}</span></span>
                  <span class="block text-xs text-gold">{{ c.assistSkillName }}</span>
                  <span class="block text-xs leading-snug text-ink3">{{ c.assistDesc }}</span>
                </span>
                <Check v-if="store.currentLoadout[side.key] === c.id" :size="16" class="shrink-0 text-gold" />
              </button>
              <p v-if="!recruited(side.role).length" class="py-4 text-center text-sm text-ink3">还没有能上阵的伙伴。去市井的醉仙客栈结交侠客吧。</p>
            </div>
          </div>
        </div>
      </div>

      <EquipmentPanel v-else-if="sub === 'EQUIP'" class="view-scroll -mr-1 pr-1" />

      <!-- 经脉冲穴与冲穴灵丹 -->
      <div v-else-if="sub === 'MERIDIAN'" class="view-scroll -mr-1 space-y-4 pr-1">
        <!-- 经脉总览卡片 -->
        <div class="well space-y-2 p-3">
          <div class="flex items-center justify-between">
            <div>
              <span class="chip tier-chip !text-xs font-brush">{{ currentMeridianRealm.name }} · 第 {{ currentMeridianRealm.tier }} 重</span>
              <h3 class="text-base font-brush text-gold mt-1">贯通经脉：{{ currentMeridianRealm.meridian }}</h3>
            </div>
            <div class="text-right">
              <span class="text-xs text-ink3">冲穴进度</span>
              <div class="text-sm font-brush" :class="isMeridianCompleted ? 'text-jade' : 'text-gold'">
                {{ piercedCount }} / {{ realmAcupoints.length }} 穴
              </div>
            </div>
          </div>
          <p class="text-xs text-ink2 leading-relaxed">
            每 10 级大境界须打通当前经脉全部核心穴道，方可凝聚纯阳真气破关晋阶。冲穴可永久提升主角基础属性。
          </p>
          <div v-if="isMeridianCompleted" class="rounded border border-jade/30 bg-jade/10 p-2 text-xs text-jade flex items-center justify-between">
            <span>✨ 本阶经脉已全线贯通！可前往「修行」使用【纯阳·通脉破障丹】冲击大境界玄关！</span>
            <button class="btn btn-sm btn-gold font-brush text-xs" @click="store.selectTab('CULTIVATE')">去突破</button>
          </div>
        </div>

        <!-- 冲穴专属灵丹展示区 -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h3 class="sec-title flex items-center gap-1.5">
              <span>冲穴专属灵丹</span>
              <span class="text-xs font-normal text-ink3">(用于减免真气消耗、大幅提升突破率或免除走火入魔)</span>
            </h3>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <div
              v-for="pill in acupointPillsList" :key="pill.id"
              class="well p-2.5 space-y-1.5 flex flex-col justify-between border"
              :class="TIER_META[pill.tier].cls"
            >
              <div>
                <div class="flex items-center justify-between">
                  <b class="text-sm font-brush">{{ pill.name }}</b>
                  <span class="chip !text-[0.68rem]" :class="pill.count > 0 ? 'bg-gold/20 text-gold font-bold' : 'text-ink3'">
                    存量: {{ pill.count }}
                  </span>
                </div>
                <p class="text-xs text-ink2 mt-1 leading-snug">{{ pill.effectDesc }}</p>
                <span class="block text-[0.68rem] text-ink3 mt-0.5">来源: {{ pill.source }}</span>
              </div>
              <button
                class="btn btn-xs w-full font-brush mt-1"
                :class="pill.count > 0 ? 'btn-gold' : 'opacity-40 cursor-not-allowed'"
                :disabled="pill.count <= 0 || store.onlineActionBusy"
                @click="store.useAcupointPill(pill.id)"
              >
                {{ pill.count > 0 ? (pill.id === 'tongmai_dan' ? '使用通脉丹冲穴' : pill.id === 'shaolin_xiaohuan_dan' ? '服用贯通三穴' : pill.id === 'jiuzhuan_tongqiao_dan' ? '服下瞬通整脉' : '备入突破心脉') : '尚未获得' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 核心穴位循行图谱 -->
        <div>
          <h3 class="sec-title mb-2">核心穴位循行流注</h3>
          <div class="space-y-2">
            <div
              v-for="ap in realmAcupoints" :key="ap.id"
              class="well p-3 flex flex-wrap items-center justify-between gap-3 border"
              :class="store.openedAcupointIds.includes(ap.id) ? 'border-jade/40 bg-jade/5' : canPierce(ap.id, ap.order) ? 'border-gold/50 bg-[var(--gold-soft)]' : 'border-line opacity-65'"
            >
              <div class="flex items-center gap-3 min-w-[12rem]">
                <div
                  class="h-9 w-9 rounded-full flex items-center justify-center font-brush text-sm border"
                  :class="store.openedAcupointIds.includes(ap.id) ? 'border-jade bg-jade text-raised' : canPierce(ap.id, ap.order) ? 'border-gold bg-gold/20 text-gold animate-pulse' : 'border-line text-ink3'"
                >
                  {{ ap.order }}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <b class="text-sm font-brush" :class="store.openedAcupointIds.includes(ap.id) ? 'text-jade' : 'text-ink1'">{{ ap.name }}</b>
                    <span class="chip !text-[0.65rem] !py-0" :class="store.openedAcupointIds.includes(ap.id) ? 'text-jade bg-jade/10' : 'text-gold bg-gold/10'">
                      {{ ap.statBonus.label }} +{{ ap.statBonus.value }}
                    </span>
                  </div>
                  <p class="text-xs text-ink3 mt-0.5 leading-snug">{{ ap.narrative }}</p>
                </div>
              </div>

              <div class="flex items-center gap-2 ml-auto">
                <span v-if="store.openedAcupointIds.includes(ap.id)" class="text-xs text-jade font-brush flex items-center gap-1">
                  <Check :size="14" /> 已贯通
                </span>
                <template v-else-if="canPierce(ap.id, ap.order)">
                  <button
                    class="btn btn-sm btn-gold font-brush text-xs"
                    :disabled="store.player.qiExp < getAcupointCost(ap.costQi) || store.onlineActionBusy"
                    :title="`消耗 ${getAcupointCost(ap.costQi).toLocaleString()} 真气（悟性已减免）`"
                    @click="store.pierceAcupoint(ap.id)"
                  >
                    运功冲穴 <small class="opacity-80">({{ getAcupointCost(ap.costQi).toLocaleString() }}气)</small>
                  </button>
                  <button
                    v-if="(store.pillInventory.tongmai_dan ?? 0) > 0"
                    class="btn btn-sm btn-jade font-brush text-xs"
                    :disabled="store.onlineActionBusy"
                    title="使用【玄门·聚气通脉丹】免真气直接冲通"
                    @click="store.pierceAcupoint(ap.id, 'tongmai_dan')"
                  >
                    用通脉丹 <small class="opacity-80">(余{{ store.pillInventory.tongmai_dan }})</small>
                  </button>
                </template>
                <span v-else class="text-xs text-ink3">
                  须先通前置穴位
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
