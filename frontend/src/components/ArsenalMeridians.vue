<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { ACUPOINTS, ACUPOINT_PILLS, REALMS, type AcupointConfig } from '@/config/gameData'
import { TIER_META } from '@/config/uiMeta'
import { useGameStore } from '@/stores/gameStore'
import { acupointCost, canOpenAcupoint } from '../../../shared/player.ts'
import ItemIcon from './ItemIcon.vue'

type Placement = { anchor: [number, number]; label: [number, number]; region: string }
const chartWidth = 600
const chartHeight = 390
const placements: Partial<Record<string, Placement>> = {
  shangyang:   { anchor: [192, 241], label: [98, 257], region: '食指末端' },
  hegu:        { anchor: [207, 223], label: [98, 216], region: '手背虎口' },
  quchi:       { anchor: [226, 171], label: [98, 169], region: '肘弯外侧' },
  jianyu:      { anchor: [250, 113], label: [98, 113], region: '肩部' },
  yingxiang:   { anchor: [294, 58],  label: [502, 57], region: '鼻翼旁' },
  yinbai:      { anchor: [269, 368], label: [98, 364], region: '足大趾内侧' },
  yongquan:    { anchor: [353, 367], label: [502, 364], region: '足心' },
  sanyinjiao:  { anchor: [272, 326], label: [98, 304], region: '小腿内侧近踝' },
  taichong:    { anchor: [332, 352], label: [502, 317], region: '足背' },
  qimen:       { anchor: [321, 146], label: [502, 146], region: '胸胁' },
  jinmen:      { anchor: [345, 351], label: [502, 353], region: '足外侧近踝' },
  yangjiao:    { anchor: [345, 288], label: [502, 284], region: '小腿外侧' },
  zhubin:      { anchor: [270, 305], label: [98, 306], region: '小腿内侧' },
  fushe:       { anchor: [318, 187], label: [502, 189], region: '下腹' },
  tiantu:      { anchor: [300, 104], label: [502, 111], region: '颈前下方' },
  lianquan:    { anchor: [300, 80],  label: [98, 75], region: '下颌下方' },
}

const statusLabels = { open: '已贯通', ready: '待冲穴', locked: '待解锁' } as const
const store = useGameStore()
const selectedId = ref<string>()
const realm = computed(() => REALMS.find(({ tier }) => tier === store.player.realmTier) ?? REALMS[0])
const points = computed(() => ACUPOINTS
  .filter(({ realmTier }) => realmTier === store.player.realmTier)
  .sort((a, b) => a.order - b.order))
const openedIds = computed(() => new Set(store.openedAcupointIds))
const openedCount = computed(() => points.value.filter(({ id }) => openedIds.value.has(id)).length)
const nextPoint = computed(() => points.value.find(({ id }) => !openedIds.value.has(id)))
const completed = computed(() => points.value.length > 0 && !nextPoint.value)
const selection = computed(() => points.value.find(({ id }) => id === selectedId.value) ?? nextPoint.value ?? points.value[0])
const plotted = computed(() => points.value.flatMap((point) => {
  const placement = placements[point.id]
  return placement ? [{ point, placement }] : []
}))
const unplotted = computed(() => points.value.filter(({ id }) => !placements[id]))
const tongmaiCount = computed(() => store.pillInventory.tongmai_dan ?? 0)
const pills = computed(() => Object.values(ACUPOINT_PILLS).map((pill) => {
  const breakthrough = pill.id === 'pozhang_dan' || pill.id === 'bingpo_huxin_dan'
  return {
    ...pill, breakthrough, count: store.pillInventory[pill.id] ?? 0,
    action: breakthrough ? '前往突破' : pill.id === 'tongmai_dan' ? '冲通下一穴'
      : pill.id === 'shaolin_xiaohuan_dan' ? '服用贯通三穴' : '服下贯通整脉',
  }
}))

function getState(point: AcupointConfig): keyof typeof statusLabels {
  if (openedIds.value.has(point.id)) return 'open'
  return canOpenAcupoint(point, store.openedAcupointIds) ? 'ready' : 'locked'
}

const selectedState = computed(() => selection.value ? getState(selection.value) : 'locked')
const cost = computed(() => selection.value ? acupointCost(selection.value.costQi, store.martialStats.intStat) : 0)
const shortage = computed(() => Math.max(0, cost.value - store.player.qiExp))

function bonusText({ label, value }: AcupointConfig['statBonus']) {
  return label.endsWith('(%)') ? `${label.slice(0, -3)} +${value.toLocaleString()}%` : `${label} +${value.toLocaleString()}`
}

function knotStyle({ anchor: [x, y], label: [lx, ly] }: Placement) {
  return {
    left: `${x / chartWidth * 100}%`, top: `${y / chartHeight * 100}%`,
    '--label-x': `${(lx - x) / chartWidth * 100}cqw`, '--label-y': `${(ly - y) / chartHeight * 100}cqh`,
  }
}

function leader({ anchor: [x, y], label: [lx, ly] }: Placement) {
  const bend = lx < x ? lx + 64 : lx - 64
  return `${x},${y} ${bend},${ly} ${lx},${ly}`
}
</script>

<template>
  <section class="meridian-layout" aria-label="经脉冲穴">
    <header class="meridian-overview">
      <div>
        <p class="text-xs text-ink3">{{ realm.name }} · 第 {{ realm.tier }} 重</p>
        <h2 class="font-brush text-xl text-gold">{{ realm.meridian }}</h2>
      </div>
      <div v-if="points.length" class="meridian-progress">
        <span class="text-xs text-ink3">贯通进度</span>
        <b class="tabular-nums" :class="completed ? 'text-jade' : 'text-gold'">{{ openedCount }} / {{ points.length }} 穴</b>
        <div class="wuxia-meter" role="progressbar" aria-label="经脉贯通进度" :aria-valuemax="points.length" :aria-valuenow="openedCount">
          <i :style="{ width: `${openedCount / points.length * 100}%` }" />
        </div>
      </div>
    </header>

    <div class="meridian-workspace">
      <div class="meridian-panel map-panel">
        <div class="meridian-heading">
          <h3 class="sec-title">人体穴位图</h3>
          <div v-if="points.length" class="point-legend">
            <span v-for="(label, state) in statusLabels" :key="state" :data-state="state"><i aria-hidden="true" />{{ label }}</span>
          </div>
        </div>
        <div class="meridian-plot" role="group" aria-label="人体穴位图">
          <svg :viewBox="`0 0 ${chartWidth} ${chartHeight}`" class="body-map" aria-hidden="true">
            <g class="body-guides">
              <circle cx="300" cy="183" r="155" /><circle cx="300" cy="183" r="126" />
              <path d="M300 8v374 M150 105h300 M150 191h300 M170 279h260 M206 349h188" />
            </g>
            <path class="body-outline" d="M300 16 C285 16 276 29 276 46 C276 61 282 74 290 80 L288 94
              C280 101 263 101 251 108 C241 113 238 126 234 139 L225 169 L212 197 L202 218
              C199 220 194 225 192 231 L188 242 Q187 247 191 246 L196 240 L201 229
              L198 241 Q199 246 202 243 L208 231 L215 221 L230 196 L242 177 L253 146
              C254 167 257 179 253 197 C249 214 253 235 254 253 L255 270
              C253 291 252 315 255 346 L251 357 C244 361 240 369 246 372 L268 372
              C272 371 273 367 273 362 L273 349 L277 315 C280 296 284 281 282 266
              L286 240 L300 221 L314 240 L318 266 C316 281 320 296 323 315 L327 349
              L327 362 C327 367 328 371 332 372 L354 372 C360 369 356 361 349 357
              L345 346 C348 315 347 291 345 270 L346 253 C347 235 351 214 347 197
              C343 179 346 167 347 146 L358 177 L370 196 L385 221 L392 231 L398 243
              Q401 246 402 241 L399 229 L404 240 L409 246 Q413 247 412 242 L408 231
              C406 225 401 220 398 218 L388 197 L375 169 L366 139
              C362 126 359 113 349 108 C337 101 320 101 312 94 L310 80
              C318 74 324 61 324 46 C324 29 315 16 300 16Z" />
            <g class="body-lines">
              <path d="M282 43 Q291 40 295 44 M305 44 Q310 40 318 43 M300 46 L297 56 Q300 59 303 56 M295 65 Q300 67 305 65" />
              <path d="M257 114 Q280 112 300 121 Q320 112 343 114 M289 96 Q300 108 311 96 M300 122v78 M270 139 Q287 150 300 145 Q313 150 330 139 M270 164 Q285 172 300 169 Q315 172 330 164 M268 192 Q277 214 300 221 Q323 214 332 192" />
              <path d="M250 127 Q244 145 233 172 T207 220 M350 127 Q356 145 367 172 T393 220 M272 216 Q271 244 268 271 Q264 303 264 353 M328 216 Q329 244 332 271 Q336 303 336 353 M258 273 Q267 267 277 273 M323 273 Q333 267 342 273" />
            </g>
            <polyline
              v-for="{ point, placement } in plotted" :key="point.id" class="point-leader"
              :points="leader(placement)" :data-state="getState(point)" :class="{ 'is-selected': selection?.id === point.id }"
            />
          </svg>
          <button
            v-for="{ point, placement } in plotted" :key="point.id" type="button" class="point-control"
            :style="knotStyle(placement)" :data-state="getState(point)" :aria-pressed="selection?.id === point.id"
            :aria-label="point.name" :title="`${point.name} · ${statusLabels[getState(point)]}`" @click="selectedId = point.id"
          >
            <span class="point-dot" aria-hidden="true"><Check v-if="getState(point) === 'open'" :size="12" /><template v-else>{{ point.order }}</template></span>
            <span class="point-caption">{{ point.name }}</span>
          </button>
        </div>
        <div v-if="unplotted.length" class="flex flex-wrap gap-2" role="group" aria-label="其他穴位">
          <button v-for="point in unplotted" :key="point.id" type="button" class="btn btn-sm"
            :aria-pressed="selection?.id === point.id" @click="selectedId = point.id">{{ point.name }}</button>
        </div>
      </div>

      <aside class="meridian-panel point-detail" aria-label="穴位说明">
        <div class="meridian-heading"><h3 class="sec-title">穴位说明</h3></div>
        <div v-if="selection" class="point-content" aria-live="polite">
          <div class="point-title">
            <h4 class="font-brush text-2xl text-gold">{{ selection.name }}</h4>
            <span class="point-state" :data-state="selectedState">{{ statusLabels[selectedState] }}</span>
          </div>
          <p class="text-xs text-ink3">
            <template v-if="placements[selection.id]">{{ placements[selection.id]?.region }} · </template>经脉第 {{ selection.order }} 穴
          </p>
          <p class="text-sm text-ink2">{{ selection.narrative }}</p>
          <dl class="point-facts">
            <div><dt>贯通收益</dt><dd class="text-jade">{{ bonusText(selection.statBonus) }}</dd></div>
            <div v-if="selectedState !== 'open'"><dt>真气消耗</dt><dd>{{ cost.toLocaleString() }}</dd></div>
            <div v-if="selectedState === 'locked' && nextPoint"><dt>需先贯通</dt><dd>{{ nextPoint.name }}</dd></div>
          </dl>
        </div>
        <p v-else class="text-sm text-ink2">本阶核心穴位随下一卷开放。</p>

        <div v-if="completed" class="point-actions">
          <p class="text-xs text-jade">本阶经脉已全部贯通。</p>
          <button type="button" class="btn btn-gold" @click="store.selectTab('CULTIVATE')">去突破</button>
        </div>
        <div v-else-if="selection && selectedState === 'ready'" class="point-actions">
          <p v-if="shortage" class="text-xs text-cinnabar">真气不足，还差 {{ shortage.toLocaleString() }}。</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-gold" :disabled="shortage > 0 || store.onlineActionBusy"
              @click="store.pierceAcupoint(selection.id)">运功冲穴</button>
            <button v-if="tongmaiCount" type="button" class="btn btn-jade" :disabled="store.onlineActionBusy"
              @click="store.pierceAcupoint(selection.id, 'tongmai_dan')">用通脉丹 <small>余 {{ tongmaiCount }}</small></button>
          </div>
        </div>
        <p v-else-if="selection && selectedState === 'locked'" class="point-actions text-xs text-ink3">按经脉顺序逐穴贯通。</p>
      </aside>
    </div>

    <details class="meridian-pills">
      <summary>
        <span class="font-brush text-gold">冲穴专属灵丹</span>
        <span class="text-xs text-ink3">通脉丹 {{ tongmaiCount }} 枚</span>
        <ChevronDown :size="16" aria-hidden="true" />
      </summary>
      <div class="pill-list">
        <section v-for="pill in pills" :key="pill.id" class="pill-entry" :class="TIER_META[pill.tier].cls">
          <div class="flex flex-wrap items-center justify-between gap-1">
            <h4 class="font-brush tier-text flex items-center gap-2"><ItemIcon :item-id="pill.id" />{{ pill.name }}</h4>
            <span class="text-xs text-ink3">持有 {{ pill.count }}</span>
          </div>
          <p class="text-xs text-ink2">{{ pill.effectDesc }}</p>
          <p class="hint">来源 · {{ pill.source }}</p>
          <button type="button" class="btn btn-sm" :disabled="!pill.count || store.onlineActionBusy || (!pill.breakthrough && !nextPoint)"
            @click="store.useAcupointPill(pill.id)">{{ pill.action }}</button>
        </section>
      </div>
    </details>
  </section>
</template>

<style scoped>
.meridian-layout {
  display: flex; flex: 1; flex-direction: column; gap: .65rem;
  min-width: 0; min-height: 0; overflow-y: auto; padding: .08rem;
}
.meridian-overview, .meridian-heading {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem .8rem;
}
.meridian-overview { padding: .55rem .85rem; border: 1px solid var(--line); background: var(--bg-1); }
.meridian-progress {
  display: grid; grid-template-columns: auto auto; align-items: center; gap: .25rem .8rem; min-width: 8.5rem;
}
.meridian-progress b { font-size: .85rem; text-align: end; }
.meridian-progress .wuxia-meter { grid-column: 1 / -1; }
.meridian-progress .wuxia-meter i { background: var(--jade); }
.meridian-workspace {
  display: grid; flex: 1 0 auto; gap: .75rem; grid-template-columns: minmax(0, 1.42fr) minmax(0, 1fr);
}
.meridian-panel { min-width: 0; min-height: 0; border: 1px solid var(--line); background: var(--bg-1); padding: .75rem .9rem; }
.map-panel { display: flex; flex-direction: column; align-items: center; }
.meridian-heading { width: 100%; padding-bottom: .45rem; border-bottom: 1px solid var(--line); }
.meridian-heading .sec-title { flex: 1 1 auto; margin: 0; font-size: 1.08rem; }
.point-legend { display: flex; flex-wrap: wrap; gap: .25rem .7rem; color: var(--ink-3); font-size: .73rem; }
.point-legend span { display: inline-flex; align-items: center; gap: .3rem; white-space: nowrap; }
.point-legend i { width: .48rem; aspect-ratio: 1; border: 1px solid var(--point-ink); border-radius: 50%; }
.point-legend [data-state="open"] i { background: var(--jade); }
.point-legend [data-state="ready"] i { background: var(--gold); }
[data-state="open"] { --point-ink: var(--jade); }
[data-state="ready"] { --point-ink: var(--gold); }
[data-state="locked"] { --point-ink: var(--ink-3); }
.meridian-plot {
  position: relative; container-type: size; width: min(100%, 37.5rem); aspect-ratio: 600 / 390;
  margin-block: auto; background: radial-gradient(ellipse at center, var(--gold-faint), transparent 72%);
}
.body-map { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.body-guides { fill: none; stroke: var(--line); stroke-dasharray: 2 5; }
.body-outline {
  fill: color-mix(in srgb, var(--gold) 9%, var(--bg-1));
  stroke: color-mix(in srgb, var(--gold) 64%, var(--line)); stroke-width: 1.2; stroke-linejoin: round;
}
.body-lines { fill: none; stroke: var(--gold); stroke-width: .8; opacity: .32; stroke-linecap: round; }
.point-leader { fill: none; stroke: var(--point-ink); opacity: .38; stroke-width: 1; }
.point-leader.is-selected { opacity: 1; stroke: var(--gold); stroke-width: 1.4; }
.point-control {
  position: absolute; display: grid; place-items: center; width: 1.65rem; height: 1.65rem;
  transform: translate(-50%, -50%); color: var(--point-ink); overflow: visible;
}
.point-dot {
  display: grid; place-items: center; width: 1.14rem; aspect-ratio: 1; border-radius: 50%;
  border: 1px solid currentColor; background: var(--bg-0); font-size: .68rem; font-variant-numeric: tabular-nums;
}
.point-caption {
  position: absolute; left: calc(50% + var(--label-x)); top: calc(50% + var(--label-y));
  transform: translate(-50%, -50%); padding: .25rem .55rem; border: 1px solid var(--line);
  background: var(--bg-0); font-size: .8rem; white-space: nowrap;
}
.point-control[data-state="locked"] .point-dot { border-style: dashed; }
.point-control[aria-pressed="true"], .point-control:focus-visible { z-index: 1; }
.point-control:hover .point-caption, .point-control:focus-visible .point-caption,
.point-control[aria-pressed="true"] .point-caption { border-color: var(--gold); color: var(--gold); background: var(--section-fill); }
.point-control[aria-pressed="true"] .point-dot { box-shadow: 0 0 0 3px var(--gold-soft); }
.point-detail { display: flex; flex-direction: column; gap: .65rem; }
.point-content { display: grid; gap: .6rem; }
.point-title { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .38rem; }
.point-state { color: var(--point-ink); border: 1px solid var(--line); padding: .16rem .5rem; font-size: .75rem; white-space: nowrap; }
.point-facts { margin-top: .15rem; font-size: .88rem; }
.point-facts > div { display: flex; justify-content: space-between; gap: .45rem; padding-block: .53rem; border-bottom: 1px solid var(--line); }
.point-facts dt { color: var(--ink-3); }
.point-facts dd { text-align: end; font-variant-numeric: tabular-nums; }
.point-actions { display: grid; justify-items: start; gap: .45rem; margin-top: auto; padding-top: .65rem; border-top: 1px solid var(--line); }
.meridian-pills { border: 1px solid var(--line); background: var(--bg-1); }
.meridian-pills summary { display: flex; gap: .6rem; align-items: center; padding: .48rem .8rem; cursor: pointer; list-style: none; }
.meridian-pills summary::-webkit-details-marker { display: none; }
.meridian-pills summary svg { margin-inline-start: auto; flex: none; color: var(--ink-3); }
.meridian-pills[open] summary svg { transform: rotate(180deg); }
.pill-list {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr)); gap: .65rem;
  padding: .2rem .8rem .8rem;
}
.pill-entry { display: flex; flex-direction: column; gap: .38rem; padding: .6rem 0; border-top: 1px solid var(--line); }
.pill-entry .btn { align-self: flex-start; margin-top: auto; }
@media (max-width: 767px) {
  .meridian-panel { padding: .45rem; }
  .meridian-workspace { gap: .4rem; }
  .point-caption { font-size: .65rem; padding-inline: .28rem; }
  .point-legend { font-size: .64rem; }
}
</style>
