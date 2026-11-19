<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { usePlayerStore } from '@/stores/playerStore'
import { BATTLE_STEP_MS } from '@/stores/battlePlayback'
import type { BattleEventDTO, CombatUnitDTO, RateBoostKind } from '@/network/protocol'
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

/** 打完留给战果与赶路的时间；战斗太长时直接跳到结果 */
const RESULT_MS = 6_000
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
// 只在下一步出招、倒计时跳秒或换下一场时刷新；收起时只等下一场
const now = ref(Date.now())
let timer: ReturnType<typeof setTimeout> | undefined
function tick() {
  clearTimeout(timer)
  now.value = Date.now()
  const { intoBattleMs, battleMs } = clock.value
  const left = battleMs - intoBattleMs
  const wait = full.value ? 10_000 : !shown.value || !fight.value ? left
    : done.value ? left % 1000 || 1000 : BATTLE_STEP_MS - intoBattleMs % BATTLE_STEP_MS
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
const maxSteps = computed(() => Math.max(1, Math.floor((clock.value.battleMs - RESULT_MS) / BATTLE_STEP_MS)))
/** 已演到第几招；超出可演的招数就一次演完 */
const step = computed(() => {
  const at = Math.floor(clock.value.intoBattleMs / BATTLE_STEP_MS)
  return at >= maxSteps.value ? steps.value.length : Math.min(at, steps.value.length)
})
const done = computed(() => !!fight.value && step.value >= steps.value.length)

const units = computed(() => {
  const report = fight.value?.report
  if (!report) return []
  const hp: Record<string, number> = Object.fromEntries(report.units.map((unit) => [unit.slot, unit.hp]))
  for (const event of steps.value.slice(0, step.value)) {
    if (event.targetSlot && event.hpDelta) hp[event.targetSlot] = Math.max(0, hp[event.targetSlot] + event.hpDelta)
    if (event.reflectDelta) hp[event.actorSlot] = Math.max(0, hp[event.actorSlot] + event.reflectDelta)
  }
  const latest = done.value ? undefined : steps.value[step.value - 1]
  return report.units.map((unit) => ({
    unit, hp: Math.min(unit.maxHp, hp[unit.slot]),
    anim: animOf(unit, latest), popup: popupOf(unit, latest, step.value),
  }))
})
const allies = computed(() => units.value.filter(({ unit }) => unit.slot.startsWith('ALLY')).sort((a, b) => order(a.unit) - order(b.unit)))
const enemies = computed(() => units.value.filter(({ unit }) => unit.slot.startsWith('ENEMY')))
const order = (unit: CombatUnitDTO) => ['ALLY_LEFT', 'ALLY_MAIN', 'ALLY_RIGHT'].indexOf(unit.slot)

function animOf(unit: CombatUnitDTO, event: BattleEventDTO | undefined) {
  if (!event) return 'NONE' as const
  if (event.targetSlot === unit.slot && (event.hpDelta ?? 0) < 0) return 'HIT' as const
  if (event.actorSlot === unit.slot && event.type !== 'EFFECT' && event.type !== 'DOT_TICK' && event.type !== 'STANCE_CLASH') {
    return unit.slot.startsWith('ALLY') ? 'LUNGE_ALLY' as const : 'LUNGE_ENEMY' as const
  }
  return 'NONE' as const
}

function popupOf(unit: CombatUnitDTO, event: BattleEventDTO | undefined, key: number) {
  if (!event || event.targetSlot !== unit.slot) return null
  if (event.hitResult === 'DODGE') return { text: '闪避', isCrit: false, category: 'dodge', key }
  if (!event.hpDelta) return null
  const crit = event.hitResult === 'CRIT'
  return { text: `${event.hpDelta > 0 ? '+' : crit ? '暴击 ' : ''}${event.hpDelta.toLocaleString()}`, isCrit: crit, category: event.hpDelta > 0 ? 'heal' : 'outer', key }
}

/** 每场的固定所得：时薪按运营倍率活动折算后摊到这一场 */
function perBattle(hourly: number, kind: RateBoostKind) {
  const boosts = store.rateBoosts.filter((boost) => boost.kind === kind)
  return Math.round(hourly * (100 + boostPctOver(boosts, serverNow.value, serverNow.value)) / 100 * clock.value.battleMs / 3_600_000)
}
const spoils = computed(() => {
  const foe = fight.value?.foe
  return [
    `纹银 +${perBattle(store.effectiveSilverPerHour, 'SILVER').toLocaleString()}`,
    `真气 +${perBattle(store.effectiveQiPerHour, 'QI').toLocaleString()}`,
    ...(foe?.elite ? [forgeMaterialLabel(1, 1)] : []),
  ].join(' · ')
})
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
        <div class="patrol-field">
          <div class="patrol-side">
            <PortraitCard
              v-for="entry in allies" :key="entry.unit.slot" bare :size="entry.unit.slot === 'ALLY_MAIN' ? 'md' : 'sm'"
              :name="entry.unit.name" :style-type="entry.unit.portraitStyle" :avatar-id="entry.unit.avatarId"
              :hp="entry.hp" :max-hp="entry.unit.maxHp" :anim="entry.anim" :popup="entry.popup"
              :is-main="entry.unit.slot === 'ALLY_MAIN'" :class="entry.unit.slot === 'ALLY_MAIN' ? '' : 'patrol-companion'"
            />
          </div>
          <span class="patrol-seal seal" aria-hidden="true">{{ done ? '胜' : '斗' }}</span>
          <div class="patrol-side">
            <PortraitCard
              v-for="entry in enemies" :key="entry.unit.slot" bare size="md" is-enemy
              :name="entry.unit.name" :style-type="entry.unit.portraitStyle"
              :hp="entry.hp" :max-hp="entry.unit.maxHp" :anim="entry.anim" :popup="entry.popup"
            />
          </div>
        </div>
        <p class="patrol-note" :class="{ 'is-won': done }">
          <template v-if="done">击退{{ fight.foe.name }} · {{ spoils }}<small>赶路中，{{ nextIn }} 秒后下一场</small></template>
          <template v-else>{{ fight.foe.elite ? '精英拦路' : '遭遇' }}：{{ fight.foe.name }}</template>
        </p>
      </template>
    </template>
  </section>
</template>
