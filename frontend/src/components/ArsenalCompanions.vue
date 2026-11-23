<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { canEquipCompanionItem, COMPANIONS, ITEMS, SKILLS, TRIO_SYNERGIES } from '@/config/gameData'
import { BASE_STAT_LABELS, TIER_META } from '@/config/uiMeta'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { useGameStore } from '@/stores/gameStore'
import CharacterCombatStats from '@/components/CharacterCombatStats.vue'
import InkFigure from '@/components/InkFigure.vue'

const store = useGameStore()
const positions = [
  { key: 'leftCompanionId', role: 'LEFT', label: '左翼' },
  { key: 'rightCompanionId', role: 'RIGHT', label: '右翼' },
] as const
type Position = (typeof positions)[number]

const selectedId = ref<string>()
const isRecruited = (id: string) => !!store.companionAffinity[id]?.recruited
const roster = computed(() => Object.values(COMPANIONS).flatMap((config) => {
  const view = isRecruited(config.id) ? store.companionOf(config.id) : undefined
  if (!view) return []
  return [{
    ...view,
    role: config.role,
    poem: config.poem,
    teaching: SKILLS[config.teachSkillId],
    position: positions.find(({ key }) => store.currentLoadout[key] === view.id),
  }]
}))
const selected = computed(() => roster.value.find(({ id }) => id === selectedId.value)
  ?? roster.value.find(({ id }) => id === store.currentLoadout.leftCompanionId)
  ?? roster.value.find(({ position }) => position)
  ?? roster.value[0])
const availablePositions = computed(() => positions.filter(({ role }) => selected.value?.role === 'EITHER' || selected.value?.role === role))
const combatStats = computed(() => selected.value?.position ? store.companionCombatStats(selected.value.id) : undefined)
const attributes = computed(() => combatStats.value?.attributes ?? selected.value?.stats)
const weapons = computed(() => {
  const owner = selected.value
  return owner?.position ? store.ownedItemIds.map((id) => ITEMS[id])
    .filter((item) => item?.slot === 'WEAPON' && canEquipCompanionItem(owner, item)) : []
})
const synergies = computed(() => TRIO_SYNERGIES.map((synergy) => ({
  ...synergy,
  active: store.activeTrioSynergy?.id === synergy.id,
  missing: [synergy.leftId, synergy.rightId].filter((id) => !isRecruited(id)).map((id) => COMPANIONS[id].name),
})))

function deploy(position: Position) {
  const companion = selected.value
  if (!companion || companion.position?.key === position.key) return
  // 左右皆可的伙伴换翼时，腾出原阵位。
  store.updateLoadout({ ...(companion.position && { [companion.position.key]: null }), [position.key]: companion.id })
}

function changeWeapon(id: string, event: Event) {
  store.equipCompanionWeapon(id, (event.target as HTMLSelectElement).value || null)
}
</script>

<template>
  <section class="squad-layout" aria-label="伙伴">
    <aside class="squad-roster" aria-label="已入队伙伴">
      <header class="squad-roster-heading">
        <h2 class="sec-title flex-1">伙伴列表</h2>
        <span class="text-xs tabular-nums text-ink3">{{ roster.length }} 位</span>
      </header>
      <ul class="squad-list" aria-label="伙伴列表">
        <li v-for="companion in roster" :key="companion.id">
          <button
            type="button" class="squad-member" :aria-label="companion.name"
            :aria-pressed="selected?.id === companion.id" aria-controls="arsenal-companion-detail"
            @click="selectedId = companion.id"
          >
            <span class="squad-thumbnail"><InkFigure :style-type="companion.portraitStyle" :portrait-id="companion.id" image-size="thumb" /></span>
            <span class="min-w-0">
              <b class="block truncate">{{ companion.name }}</b>
              <span class="block truncate text-xs text-ink3">{{ companion.title }}</span>
            </span>
            <span v-if="companion.position" class="squad-wing">{{ companion.position.label }}</span>
          </button>
        </li>
      </ul>
    </aside>

    <article v-if="selected" id="arsenal-companion-detail" class="squad-profile" aria-label="伙伴详情">
      <figure class="squad-portrait">
        <div class="squad-portrait-art" role="img" :aria-label="`${selected.name}立绘`">
          <InkFigure :style-type="selected.portraitStyle" :portrait-id="selected.id" image-size="full" />
        </div>
        <figcaption>{{ selected.poem }}</figcaption>
      </figure>

      <div class="squad-dossier">
        <header class="squad-identity" :class="TIER_META[selected.tier].cls">
          <div>
            <p class="text-sm text-gold">{{ selected.title }}</p>
            <h2 class="squad-name font-brush" aria-live="polite">{{ selected.name }}</h2>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-1.5">
            <span class="chip tier-chip">{{ TIER_META[selected.tier].label }}</span>
            <span v-if="selected.grade" class="chip">{{ selected.grade }}等资质</span>
            <span v-if="selected.form === 'awakened'" class="chip chip-red">已觉醒</span>
          </div>
        </header>

        <div :key="selected.id" class="squad-readout">
          <section aria-label="伙伴属性">
            <div class="flex items-center gap-3">
              <h3 class="sec-title flex-1">{{ combatStats ? '上阵属性' : '基础属性' }}</h3>
              <span v-if="combatStats" class="text-sm text-gold tabular-nums">战力 {{ combatStats.combatPower.toLocaleString() }}</span>
            </div>
            <CharacterCombatStats v-if="combatStats" :stats="combatStats" />
            <dl v-else class="combat-stats">
              <div><dt>气血</dt><dd>{{ selected.baseHp.toLocaleString() }}</dd></div>
              <div><dt>攻击</dt><dd>{{ selected.baseAtk.toLocaleString() }}</dd></div>
            </dl>
            <dl v-if="attributes" class="squad-attributes">
              <div v-for="(label, stat) in BASE_STAT_LABELS" :key="stat">
                <dt>{{ label }}</dt><dd>{{ attributes[stat] }}</dd>
              </div>
            </dl>
          </section>

          <section aria-label="伙伴技能">
            <h3 class="sec-title">技能</h3>
            <div class="squad-assist">
              <div class="flex items-baseline gap-2">
                <span class="text-xs text-gold">协战</span>
                <h4 class="text-base font-bold">{{ selected.assistSkillName }}</h4>
              </div>
              <p class="text-sm leading-relaxed text-ink2">{{ selected.assistDesc }}</p>
            </div>
            <div v-if="selected.teaching" class="squad-teaching">
              <span class="text-ink3">传授武学</span>
              <b>{{ selected.teaching.name }}</b>
              <span class="ml-auto text-ink3">{{ store.companionAffinity[selected.id]?.taught ? '已传授' : '好感 600 可传授' }}</span>
            </div>
          </section>
        </div>

        <section class="squad-orders" aria-label="上阵与兵刃">
          <div class="flex items-center gap-2">
            <span class="text-sm text-ink3">阵位</span>
            <template v-for="position in availablePositions" :key="position.key">
              <span v-if="selected.position?.key === position.key" class="chip chip-jade">{{ position.label }}已上阵</span>
              <button v-else type="button" class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy" @click="deploy(position)">
                上阵{{ position.label }}
              </button>
            </template>
          </div>
          <label v-if="selected.position" class="squad-weapon">
            <span class="shrink-0 text-sm text-ink3">兵刃</span>
            <select
              class="min-h-8 min-w-0 flex-1 border border-line bg-raised px-2 text-sm text-ink" aria-label="伙伴兵刃"
              :value="store.currentLoadout.companionWeapons?.[selected.id] ?? ''"
              :disabled="store.onlineActionBusy" @change="changeWeapon(selected.id, $event)"
            >
              <option value="">未装备</option>
              <option v-for="item in weapons" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </label>
        </section>
      </div>
    </article>
    <div v-else class="squad-empty">
      <h2 class="font-brush text-2xl">暂无入队伙伴</h2>
      <p class="hint">推进剧情，或在市井的醉仙客栈结交伙伴。</p>
    </div>

    <details class="squad-bonds">
      <summary>
        <span class="font-brush text-lg">搭档与羁绊</span>
        <span v-if="store.activeTrioSynergy" class="text-xs text-jade">{{ store.activeTrioSynergy.name }}已生效</span>
        <ChevronDown :size="16" class="ml-auto shrink-0" aria-hidden="true" />
      </summary>
      <div class="squad-bonds-body">
        <section>
          <h3 class="sec-title mb-2">伙伴搭档</h3>
          <div class="grid grid-cols-3 gap-2">
            <article v-for="synergy in synergies" :key="synergy.id" class="well flex flex-col gap-1.5 p-3" :class="{ 'border-gold': synergy.active }">
              <div class="flex items-center justify-between gap-2">
                <b class="font-brush text-lg" :class="{ 'text-gold': synergy.active }">{{ synergy.name }}</b>
                <span v-if="synergy.active" class="chip chip-gold">已上阵</span>
              </div>
              <p class="hint flex-1">{{ synergy.bonusText }}</p>
              <button
                v-if="!synergy.active" type="button" class="btn btn-sm"
                :disabled="store.onlineActionBusy || synergy.missing.length > 0"
                @click="store.updateLoadout({ leftCompanionId: synergy.leftId, rightCompanionId: synergy.rightId })"
              >
                {{ synergy.missing.length ? `先结交 ${synergy.missing.join('、')}` : '一起上阵' }}
              </button>
            </article>
          </div>
        </section>

        <section v-if="IS_MOCK_MODE" class="mt-3">
          <h3 class="sec-title mb-2">收集羁绊 <span class="text-xs font-sans tracking-normal text-ink3">伙伴入队即计入人数，无需同队</span></h3>
          <div class="grid grid-cols-3 gap-2">
            <article v-for="bond in store.setBonusStates" :key="bond.set.id" class="well flex flex-col gap-2 p-3" :class="{ 'border-gold': bond.tier }">
              <div class="flex items-center justify-between gap-2">
                <b class="font-brush text-lg" :class="{ 'text-gold': bond.tier }">{{ bond.set.name }}</b>
                <span class="chip tabular-nums" :class="{ 'chip-gold': bond.tier }">{{ bond.owned }} / {{ bond.set.memberIds.length }}</span>
              </div>
              <p class="hint">{{ bond.set.desc }}</p>
              <div class="flex flex-wrap gap-1">
                <span v-for="id in bond.set.memberIds" :key="id" class="chip" :class="isRecruited(id) ? 'chip-jade' : 'opacity-60'">{{ COMPANIONS[id].name }}</span>
              </div>
              <ul class="space-y-0.5 text-xs">
                <li v-for="tier in bond.set.tiers" :key="tier.count" :class="bond.owned >= tier.count ? 'text-jade' : 'text-ink3'">
                  {{ bond.owned >= tier.count ? '✓' : '·' }} {{ tier.count }} 位「{{ tier.label }}」
                  {{ [tier.hpPct && `气血 +${tier.hpPct}%`, tier.atkPct && `攻击 +${tier.atkPct}%`, tier.idleQiPct && `打坐 +${tier.idleQiPct}%`].filter(Boolean).join('，') }}
                </li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </details>
  </section>
</template>

<style scoped>
.squad-layout {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: 15rem minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  gap: .75rem;
}
.squad-roster, .squad-profile, .squad-empty, .squad-bonds {
  min-height: 0;
  border: 1px solid var(--line);
}
.squad-roster {
  display: flex;
  flex-direction: column;
  background: var(--bg-2);
}
.squad-roster-heading {
  display: flex;
  align-items: baseline;
  gap: .75rem;
  padding: .75rem;
  border-bottom: 1px solid var(--line);
}
.squad-list {
  display: grid;
  align-content: start;
  gap: .28rem;
  min-height: 0;
  padding: .45rem;
  overflow-y: auto;
}
.squad-member {
  display: grid;
  grid-template-columns: 2.4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: .55rem;
  width: 100%;
  padding: .25rem .5rem .25rem .3rem;
  border: 1px solid transparent;
  text-align: start;
}
.squad-member:hover, .squad-member[aria-pressed="true"] { background: var(--gold-faint); }
.squad-member[aria-pressed="true"] { border-color: var(--line-strong); color: var(--gold); background: var(--gold-soft); }
.squad-member:focus-visible, .squad-bonds summary:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }
.squad-thumbnail {
  display: grid;
  place-items: end center;
  height: 2.65rem;
  overflow: hidden;
  background: var(--bg-3);
}
.squad-thumbnail :deep(img) { object-fit: cover; object-position: center 5%; }
.squad-wing { color: var(--jade); font-size: .75rem; }
.squad-profile {
  display: grid;
  grid-template-columns: minmax(0, .59fr) minmax(0, 1fr);
}
.squad-portrait {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--line);
  background: radial-gradient(ellipse at 50% 45%, color-mix(in oklch, var(--gold) 14%, var(--bg-2)), var(--bg-2) 80%);
}
.squad-portrait::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  content: "";
  background: linear-gradient(0deg, var(--bg-2), transparent 56%), url('../assets/_optimized/scenes/zhongnan.webp') center / cover;
  opacity: .22;
}
.squad-portrait-art {
  display: grid;
  place-items: end center;
  min-height: 0;
  padding: .85rem .6rem .65rem;
}
.squad-portrait-art :deep(img), .squad-portrait-art :deep(svg) {
  width: 100%;
  height: 100%;
  max-height: 25rem;
  filter: drop-shadow(0 .35rem .45rem var(--scrim));
}
.squad-portrait figcaption {
  padding: .85rem .6rem 1rem;
  border-top: 1px solid var(--line);
  background: var(--bg-2);
  color: var(--ink-2);
  text-align: center;
  font-size: .87rem;
}
.squad-dossier {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  padding-inline: 1.1rem;
}
.squad-identity, .squad-orders {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.squad-identity { padding-block: .85rem .65rem; border-bottom: 1px solid var(--line); }
.squad-name { font-size: 2.35rem; line-height: 1.15; }
.squad-readout {
  display: grid;
  align-content: start;
  gap: 1.1rem;
  overflow-y: auto;
  padding-block: .85rem;
  padding-inline-end: .2rem;
}
.squad-readout :deep(.combat-stats) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .25rem .85rem;
  padding: .42rem 0 .45rem;
}
.squad-readout :deep(.combat-stats > div) {
  padding-block: .28rem;
  border-bottom: 1px solid var(--line);
}
.squad-attributes {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: .15rem;
  padding: .42rem .55rem;
  background: var(--bg-2);
}
.squad-attributes > div { display: flex; flex-wrap: wrap; justify-content: center; gap: .28rem; font-size: .82rem; }
.squad-attributes dt { color: var(--ink-3); }
.squad-attributes dd { font-variant-numeric: tabular-nums; }
.squad-assist {
  display: grid;
  gap: .25rem;
  margin-top: .52rem;
  padding: .62rem .72rem;
  background: var(--gold-faint);
}
.squad-teaching { display: flex; align-items: baseline; gap: .55rem; padding: .55rem .2rem .15rem; font-size: .82rem; }
.squad-orders { padding-block: .65rem; border-top: 1px solid var(--line); }
.squad-weapon { display: flex; align-items: center; gap: .5rem; width: min(45%, 15rem); }
.squad-empty { display: grid; place-content: center; gap: .45rem; text-align: center; }
.squad-bonds { grid-column: 1 / -1; background: var(--bg-2); }
.squad-bonds summary { display: flex; align-items: center; gap: .75rem; padding: .46rem .8rem; cursor: pointer; }
.squad-bonds summary::-webkit-details-marker { display: none; }
.squad-bonds summary:hover { background: var(--gold-faint); color: var(--gold); }
.squad-bonds[open] summary > svg { transform: rotate(180deg); }
.squad-bonds-body { max-height: 13rem; overflow-y: auto; border-top: 1px solid var(--line); padding: .75rem; }
</style>
