<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { usePlayerStore } from '@/stores/playerStore'
import { BATTLE_STEP_MS } from '@/stores/battlePlayback'
import type { CombatUnitDTO, RateBoostKind } from '@/network/protocol'
import { TIER_META } from '@/config/uiMeta'
import { patrolBeat, type PatrolBeat } from '@/config/patrolBeat'
import { boostPctOver } from '../../../shared/player.ts'
import { featureUnlocked } from '../../../shared/features.ts'
import { forgeMaterialLabel } from '../../../shared/equipmentForge.ts'
import { IDLE_CAP_MS, patrolClock, patrolEncounterRate, patrolFightSteps, trialStageOf, tunePatrolFight } from '../../../shared/trialStages.ts'
import PortraitCard from './PortraitCard.vue'

/**
 * 修行页的巡历战斗（docs/25）：每分钟一场，按巡历时钟在本地演，不问服务器。
 * 胜负只是画面；每场的纹银、真气是时薪摊到这一场，装备与宝箱在收功时清点。
 */
const store = useGameStore()
const playerStore = usePlayerStore()

/** 打完至少留给战果的时间；战斗太长时直接跳到结果 */
const RESULT_MS = 6_000
/** 打完留给清点与赶路的时间；一招的拍子在 0.92~1.5 秒之间放宽，让交手占满一分钟的其余时间 */
const TAIL_MS = 8_000
const BEAT_MAX_MS = 1_500
/** 打完多久收起战果、上路赶往下一场 */
const LOOT_MS = 2_600
/** 冲到跟前、招式落下的时刻；绝技先蓄一口气 */
const IMPACT_MS = 170
const ULT_IMPACT_MS = 380
const STORAGE_KEY = 'wuxia.patrolScene'

const shown = ref(readShown())
function readShown() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off' } catch { return true }
}
function toggle() {
  shown.value = !shown.value
  try { localStorage.setItem(STORAGE_KEY, shown.value ? 'on' : 'off') } catch { /* 存不了就只管这一次 */ }
  tick()
}

// 世界时钟 30 秒才走一格，这里按本机时间走，再加上与服务器的时差。
// 只在下一招、倒计时跳秒或换下一场时刷新；收起时只等下一场。招式动画由浏览器自己播
const now = ref(Date.now())
let timer: ReturnType<typeof setTimeout> | undefined
function tick() {
  clearTimeout(timer)
  now.value = Date.now()
  const { intoBattleMs, battleMs } = clock.value
  const left = battleMs - intoBattleMs
  const wait = full.value ? 10_000 : !shown.value || !fight.value ? left
    : done.value ? left % 1000 || 1000 : beatMs.value - intoBattleMs % beatMs.value
  timer = setTimeout(tick, Math.min(wait, left) + 5)
}
onMounted(tick)
onUnmounted(() => clearTimeout(timer))
const serverNow = computed(() => now.value + store.worldTime - playerStore.nowTick)

const stage = computed(() => featureUnlocked(store.player, 'TRIAL') ? trialStageOf(store.player.trial.selectedStageId) : undefined)
const rate = computed(() => patrolEncounterRate(store.currentLoadout.accId))
const clock = computed(() => patrolClock(store.player.trial, serverNow.value, rate.value))
const full = computed(() => serverNow.value - store.player.trial.lastPatrolAt >= IDLE_CAP_MS)
const battleNo = computed(() => clock.value.battle)

/** 同一场每次算出来一样：种子取角色、关卡与场次 */
function seeded(...parts: (string | number)[]) {
  let seed = 2166136261
  for (const char of parts.join(':')) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fight = computed(() => {
  const current = stage.value
  if (!current || !shown.value) return undefined
  const player = { ...store.player, battleMedicines: undefined }
  const environment = { ...store.mapEnvironment(store.player.currentMapId), ...current.environment }
  try {
    return tunePatrolFight(current, battleNo.value, (foe) => playerStore.simulateServerBattle({
      sceneTitle: `${current.code} ${current.title} · 巡历`, mode: 'SOLO_STORY', player, loadout: store.currentLoadout,
      learnedSkills: store.learnedSkills, environment, enemyMain: foe, rng: seeded(store.player.id, current.id, battleNo.value),
    }))
  } catch {
    return undefined
  }
})

const steps = computed(() => fight.value ? patrolFightSteps(fight.value.report) : [])
/** 开场留一拍给对手登场，精英两拍 */
const intro = computed(() => fight.value?.foe.elite ? 2 : 1)
const beatMs = computed(() => Math.min(BEAT_MAX_MS, Math.max(BATTLE_STEP_MS, (clock.value.battleMs - TAIL_MS) / (steps.value.length + intro.value))))
const maxSteps = computed(() => Math.max(1, Math.floor((clock.value.battleMs - RESULT_MS) / beatMs.value)))
/** 0 为登场，1~N 为第几招，再往后是打完 */
const beatNo = computed(() => Math.max(0, Math.floor(clock.value.intoBattleMs / beatMs.value) - intro.value + 1))
/** 已演到第几招；超出可演的招数就一次演完 */
const step = computed(() => beatNo.value >= maxSteps.value ? steps.value.length : Math.min(beatNo.value, steps.value.length))
const done = computed(() => !!fight.value && (beatNo.value > steps.value.length || beatNo.value >= maxSteps.value))
const doneAtMs = computed(() => (Math.min(steps.value.length + 1, maxSteps.value) + intro.value - 1) * beatMs.value)
const traveling = computed(() => done.value && clock.value.intoBattleMs - doneAtMs.value >= LOOT_MS)

const hpNow = computed(() => {
  const report = fight.value?.report
  const hp: Record<string, number> = Object.fromEntries(report?.units.map((unit) => [unit.slot, unit.hp]) ?? [])
  for (const event of steps.value.slice(0, step.value)) {
    if (event.targetSlot && event.hpDelta) hp[event.targetSlot] = Math.max(0, hp[event.targetSlot] + event.hpDelta)
    if (event.reflectDelta) hp[event.actorSlot] = Math.max(0, hp[event.actorSlot] + event.reflectDelta)
  }
  return hp
})
const order = (unit: CombatUnitDTO) => ['ALLY_LEFT', 'ALLY_MAIN', 'ALLY_RIGHT'].indexOf(unit.slot)
const units = computed(() => (fight.value?.report.units ?? []).map((unit) => ({ unit, hp: Math.min(unit.maxHp, hpNow.value[unit.slot]) })))
const allies = computed(() => units.value.filter(({ unit }) => unit.slot.startsWith('ALLY')).sort((a, b) => order(a.unit) - order(b.unit)))
const enemies = computed(() => units.value.filter(({ unit }) => unit.slot.startsWith('ENEMY')))

const beat = computed<(PatrolBeat & { key: string; impact: number; ko: boolean }) | undefined>(() => {
  const event = !done.value && step.value > 0 ? steps.value[step.value - 1] : undefined
  if (!event || !fight.value) return undefined
  const current = patrolBeat(event, fight.value.report.units)
  const ko = !!current.target?.startsWith('ENEMY') && current.hit && hpNow.value[current.target] <= 0
  return { ...current, key: `${battleNo.value}:${step.value}`, impact: current.ult ? ULT_IMPACT_MS : IMPACT_MS, ko }
})

// 冲刺、击退、震屏与击飞用 Web Animations 播：位移量要量出来，播完不留痕迹；对手登场是 CSS 动画
const fieldEl = ref<HTMLElement>()
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
watch(() => beat.value?.key, () => { if (beat.value && !reduceMotion) play(beat.value) }, { flush: 'post' })

function unitEl(slot: string | undefined) {
  return slot ? fieldEl.value?.querySelector<HTMLElement>(`[data-slot="${slot}"]`) ?? undefined : undefined
}
/** 冲刺、击退只动人像，名牌与气血条留在原地 */
function figureEl(slot: string | undefined) {
  const unit = unitEl(slot)
  return unit?.querySelector<HTMLElement>('[data-figure]') ?? unit
}
function play(current: NonNullable<typeof beat.value>) {
  const field = fieldEl.value
  if (!field?.animate) return
  const scale = field.getBoundingClientRect().width / field.offsetWidth || 1
  const box = (el: HTMLElement) => el.getBoundingClientRect()
  const centre = (el: HTMLElement) => (box(el).left + box(el).width / 2) / scale
  const actor = figureEl(current.attacker)
  const target = figureEl(current.target)
  const away = target && actor ? Math.sign(centre(target) - centre(actor)) || 1 : current.target?.startsWith('ENEMY') ? 1 : -1
  const timing = { easing: 'cubic-bezier(.3,.7,.2,1)' }

  if (actor && target && actor !== target) {
    const gap = centre(target) - centre(actor)
    const sameSide = current.attacker?.slice(0, 4) === current.target?.slice(0, 4)
    const reach = sameSide ? gap * .6 : gap - Math.sign(gap) * (box(target).width / scale) * .62
    const at = `translateX(${reach}px)`
    actor.animate(current.ult
      ? [{ transform: 'none', zIndex: 3 }, { transform: `translateX(${-Math.sign(gap) * 8}px) scale(1.06)`, filter: 'drop-shadow(0 0 10px #ffd27a)', offset: .32, zIndex: 3 },
          { transform: at, offset: .44, zIndex: 3 }, { transform: at, offset: .62, zIndex: 3 }, { transform: 'none', zIndex: 3 }]
      : [{ transform: 'none', zIndex: 3 }, { transform: at, offset: .3, zIndex: 3 }, { transform: at, offset: .46, zIndex: 3 }, { transform: 'none', zIndex: 3 }],
    { ...timing, duration: current.ult ? 900 : 600 })
  }
  if (target && current.fx === 'dodge') {
    target.animate([{ transform: 'none' }, { transform: `translate(${away * 20}px, -8px)`, opacity: .4, filter: 'blur(1px)', offset: .35 }, { transform: 'none' }],
      { ...timing, duration: 460, delay: current.impact - 60 })
  } else if (target && current.hit) {
    target.animate([{ transform: 'none' }, { transform: `translateX(${away * (current.crit ? 18 : 10)}px)`, offset: .22 }, { transform: 'none' }],
      { duration: 380, delay: current.impact, easing: 'ease-out' })
  }
  if (current.crit || current.ult) {
    field.animate([{ transform: 'none' }, { transform: 'translate(-4px, 2px)' }, { transform: 'translate(4px, -2px)' }, { transform: 'translate(-2px, 1px)' }, { transform: 'none' }],
      { duration: 280, delay: current.impact })
  }
  if (target && current.ko) {
    target.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${away * 34}px, -16px) rotate(${away * 14}deg)`, opacity: .9, offset: .35 },
      { transform: `translate(${away * 52}px, 8px) rotate(${away * 24}deg)`, opacity: 0, filter: 'blur(4px) grayscale(1)' }],
    { duration: 820, delay: current.impact + 120, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' })
  }
}

/** 每场的固定所得：时薪按运营倍率活动折算后摊到这一场 */
function perBattle(hourly: number, kind: RateBoostKind) {
  const boosts = store.rateBoosts.filter((boost) => boost.kind === kind)
  return Math.round(hourly * (100 + boostPctOver(boosts, serverNow.value, serverNow.value)) / 100 * clock.value.battleMs / 3_600_000)
}
const spoils = computed(() => [
  `纹银 +${perBattle(store.effectiveSilverPerHour, 'SILVER').toLocaleString()}`,
  `真气 +${perBattle(store.effectiveQiPerHour, 'QI').toLocaleString()}`,
  ...(fight.value?.foe.elite ? [forgeMaterialLabel(1, 1)] : []),
])
const nextIn = computed(() => Math.max(1, Math.ceil((clock.value.battleMs - clock.value.intoBattleMs) / 1000)))
</script>

<template>
  <section v-if="stage" class="patrol-skirmish" :class="{ 'is-folded': !shown }" aria-label="巡历战斗">
    <header class="patrol-bar">
      <span class="patrol-place font-brush"><b>{{ stage.code }}</b> {{ stage.title.split(' · ')[0] }}</span>
      <span class="tabular-nums">第 {{ battleNo.toLocaleString() }} 场</span>
      <span v-if="fight?.foe.elite" class="patrol-elite">精英</span>
      <span class="patrol-pending tabular-nums" title="上次结算后打完的场次，装备与宝箱在领取收益时清点">待清点 {{ clock.pending.toLocaleString() }} 场</span>
      <button class="patrol-toggle" :aria-expanded="shown" @click="toggle">{{ shown ? '收起画面' : '展开画面' }}</button>
    </header>

    <template v-if="shown">
      <p v-if="full" class="patrol-note">巡历已攒满 24 小时，领取收益后接着打。</p>
      <template v-else-if="fight">
        <div ref="fieldEl" class="patrol-field" :class="{ 'is-travel': traveling }" :style="{ '--impact': `${beat?.impact ?? 0}ms` }">
          <div class="patrol-road" aria-hidden="true"><i /></div>
          <span v-if="beat?.ult" :key="`dim${beat.key}`" class="patrol-dim" aria-hidden="true" />
          <span v-if="beat?.crit" :key="`flare${beat.key}`" class="patrol-flare" aria-hidden="true" />

          <div v-for="side in [{ key: 'ally', units: allies }, { key: 'foe', units: enemies }]" :key="side.key" class="patrol-side" :class="`is-${side.key}`">
            <div
              v-for="entry in side.units" :key="side.key === 'foe' ? `${battleNo}:${entry.unit.slot}` : entry.unit.slot"
              class="patrol-unit" :class="{ 'is-companion': side.key === 'ally' && entry.unit.slot !== 'ALLY_MAIN', 'is-gone': side.key === 'foe' && done }"
              :data-slot="entry.unit.slot"
            >
              <PortraitCard
                bare :size="entry.unit.slot === 'ALLY_MAIN' || side.key === 'foe' ? 'md' : 'sm'" :is-enemy="side.key === 'foe'" :hide-down="side.key === 'foe'"
                :name="entry.unit.name" :style-type="entry.unit.portraitStyle" :avatar-id="entry.unit.avatarId"
                :hp="entry.hp" :max-hp="entry.unit.maxHp" :is-main="entry.unit.slot === 'ALLY_MAIN'"
              />
              <template v-if="beat">
                <span v-if="beat.callout && beat.attacker === entry.unit.slot" :key="`call${beat.key}`" class="patrol-callout font-brush"
                  :class="beat.callout.tier ? TIER_META[beat.callout.tier].cls : ''">「{{ beat.callout.text }}」<small v-if="beat.callout.sub">{{ beat.callout.sub }}</small></span>
                <span v-if="beat.hit && beat.target === entry.unit.slot" :key="`hit${beat.key}`" class="patrol-flash" :class="{ 'is-crit': beat.crit }" aria-hidden="true" />
                <span v-if="beat.fx && beat.target === entry.unit.slot" :key="`fx${beat.key}`" class="patrol-fx" aria-hidden="true"
                  :class="[`is-${beat.fx}`, `tone-${beat.tone}`, { 'is-mirror': beat.attacker?.startsWith('ENEMY') }]">
                  <svg viewBox="0 0 100 100">
                    <template v-if="beat.fx === 'slash'"><path d="M16 84 Q38 30 88 14" pathLength="1" /><path class="is-late" d="M10 56 Q50 50 92 36" pathLength="1" /></template>
                    <template v-else-if="beat.fx === 'palm'"><circle cx="50" cy="50" r="30" /><path class="is-ray" d="M50 22 V6 M50 78 V94 M22 50 H6 M78 50 H94 M30 30 L19 19 M70 70 L81 81 M70 30 L81 19 M30 70 L19 81" pathLength="1" /></template>
                    <template v-else-if="beat.fx === 'thrust'"><path d="M-40 50 H90" pathLength="1" /><circle class="is-spark" cx="84" cy="50" r="10" /></template>
                    <template v-else-if="beat.fx === 'claw'"><path d="M26 16 L58 86" pathLength="1" /><path class="is-late" d="M42 12 L74 82" pathLength="1" /><path class="is-later" d="M58 8 L90 78" pathLength="1" /></template>
                    <template v-else-if="beat.fx === 'ripple'"><circle cx="50" cy="50" r="18" /><circle class="is-late" cx="50" cy="50" r="18" /><circle class="is-later" cx="50" cy="50" r="18" /></template>
                    <template v-else-if="beat.fx === 'lash'"><path d="M4 74 C30 6, 62 104, 96 26" pathLength="1" /></template>
                    <template v-else-if="beat.fx === 'guard'"><path d="M50 10 L84 30 L84 70 L50 90 L16 70 L16 30 Z" pathLength="1" /></template>
                    <template v-else-if="beat.fx === 'dodge'"><path d="M14 74 Q48 18 90 52" pathLength="1" /></template>
                    <template v-else-if="beat.fx === 'heal'"><circle v-for="n in 5" :key="n" class="is-mote" :cx="18 + n * 11" :cy="74 - (n % 2) * 12" r="3.4" :style="{ '--n': n }" /></template>
                    <template v-else><circle cx="50" cy="50" r="14" /><path class="is-ray" d="M50 30 V14 M50 70 V86 M30 50 H14 M70 50 H86" pathLength="1" /></template>
                  </svg>
                </span>
                <span v-if="beat.popups[entry.unit.slot]" :key="`pop${beat.key}`" class="patrol-pop font-brush" :class="`is-${beat.popups[entry.unit.slot]!.tone}`">
                  {{ beat.popups[entry.unit.slot]!.text }}
                </span>
              </template>
            </div>
            <div v-if="side.key === 'foe' && done" :key="`loot${battleNo}`" class="patrol-loot" aria-hidden="true">
              <span v-for="(item, index) in spoils" :key="item" :style="{ '--i': index }">{{ item }}</span>
            </div>
          </div>

          <span :key="done ? 'won' : 'fight'" class="patrol-seal seal" :class="{ 'anim-stamp': done }" aria-hidden="true">{{ done ? '胜' : '斗' }}</span>

          <div v-if="beat?.ult" :key="`ult${beat.key}`" class="patrol-banner is-ult">
            <b class="font-brush">「{{ beat.ult.text }}」</b><small>{{ beat.ult.sub }}</small>
          </div>
          <div v-else-if="beatNo === 0 && fight.foe.elite" :key="`elite${battleNo}`" class="patrol-banner is-elite">
            <b class="font-brush">精英拦路</b><small>{{ fight.foe.name }}</small>
          </div>
        </div>
        <p class="patrol-note" :class="{ 'is-won': done }">
          <template v-if="done">击退{{ fight.foe.name }} · {{ spoils.join(' · ') }}<small>{{ traveling ? '赶路中' : '清点战利品' }}，{{ nextIn }} 秒后下一场</small></template>
          <template v-else>{{ fight.foe.elite ? '精英拦路' : '遭遇' }}：{{ fight.foe.name }}</template>
        </p>
      </template>
    </template>
  </section>
</template>
