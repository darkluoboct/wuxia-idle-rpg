<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { TIER_META } from '@/config/uiMeta'
import { sectChoreLine, sectChoreWait } from '../../../shared/sectDaily.ts'
import { sectGoodBlockReason, sectGoodBought, type SectGood } from '../../../shared/sectExchange.ts'
import ItemIcon from './ItemIcon.vue'

/** 师门宝库（docs/29）：左边是挂机替师门办的差事，右边拿门派贡献换东西 */
const store = useGameStore()
const busy = computed(() => store.isBattlePlaying || store.onlineActionBusy)
const now = computed(() => store.worldTime)

const journal = computed(() => [...store.player.sectChores?.recent ?? []].reverse().flatMap((entry) => {
  const line = sectChoreLine(entry)
  return line ? [{ ...line, contrib: entry.contrib, key: `${entry.id}@${entry.at}` }] : []
}))
const wait = computed(() => sectChoreWait(store.player, now.value))
const waitText = computed(() => {
  const state = wait.value
  if (!state) return '开始挂机后，每满一个时辰（两小时）替师门办一件差事。'
  if (state.ready) return `已攒下 ${state.ready} 件差事，收功时记功。`
  const minutes = Math.ceil(state.waitMs / 60_000)
  return `再挂 ${minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ` : ''}${minutes % 60 ? `${minutes % 60} 分` : ''}，办下一件差事。`
})

const rows = computed(() => store.sectGoodsList.map((good) => {
  const left = good.weeklyLimit - sectGoodBought(store.player, good.id, now.value)
  return {
    good, left,
    blocked: sectGoodBlockReason(store.player, good, 1, now.value),
    bulk: good.grant.kind === 'FRAGMENT' && left >= 5 && !sectGoodBlockReason(store.player, good, 5, now.value),
  }
}))
const supplies = computed(() => rows.value.filter(({ good }) => good.grant.kind !== 'FRAGMENT'))
const fragments = computed(() => rows.value.filter(({ good }) => good.grant.kind === 'FRAGMENT'))

const glyphs: Record<SectGood['grant']['kind'], string> = { PILL: '丹', MEDICINE: '丹', HERB: '药', FORGE: '铁', FRAGMENT: '卷' }
const iconOf = ({ grant }: SectGood) => grant.kind === 'FORGE' ? 'forge-iron' : grant.kind === 'FRAGMENT' ? 'skill-fragment' : grant.id
</script>

<template>
  <div class="workbench">
    <aside class="workbench-index" aria-label="师门日常">
      <h3 class="sec-title shrink-0">师门日常</h3>
      <p class="hint shrink-0">{{ waitText }}</p>
      <div class="workbench-scroll">
        <ol v-if="journal.length" class="divide-y divide-line">
          <li v-for="entry in journal" :key="entry.key" class="space-y-0.5 py-2 text-sm leading-relaxed">
            <p class="flex items-baseline justify-between gap-2 text-xs">
              <b class="text-gold">{{ entry.heading }}</b>
              <span class="shrink-0 tabular-nums text-jade">贡献 +{{ entry.contrib }}</span>
            </p>
            <p class="text-ink2">{{ entry.text }}</p>
          </li>
        </ol>
        <p v-else class="hint py-2">还没办过差事。挂机攒满一个时辰，收功时这里会记下你替师门做了什么。</p>
      </div>
    </aside>

    <article v-if="store.sectTreasury" class="workbench-detail" :aria-label="store.sectTreasury.name">
      <div class="workbench-scroll space-y-4">
        <header class="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
          <div class="min-w-0 space-y-1">
            <h3 class="font-brush text-2xl leading-tight text-gold">{{ store.sectTreasury.name }}</h3>
            <p class="text-sm text-ink2">{{ store.sectTreasury.note }}</p>
          </div>
          <p class="text-right text-xs text-ink2">
            门派贡献 <b class="text-base tabular-nums text-gold">{{ store.player.sectContribution.toLocaleString() }}</b><br>
            每周六 20:00 补货
          </p>
        </header>

        <section v-for="group in [{ title: '丹药与材料', list: supplies }, { title: '本门武学残页', list: fragments }]" :key="group.title"
          class="space-y-1" :aria-label="group.title">
          <h4 class="sec-title">{{ group.title }}</h4>
          <ul v-if="group.list.length" class="divide-y divide-line">
            <li v-for="{ good, left, blocked, bulk } in group.list" :key="good.id" class="treasury-row py-2">
              <ItemIcon :item-id="iconOf(good)" :glyph="glyphs[good.grant.kind]" class="[--item-icon-size:2.25rem]" />
              <div class="min-w-0 space-y-0.5">
                <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <b class="tier-text" :class="TIER_META[good.tier].cls">{{ good.name }}</b>
                  <span class="text-xs text-ink3">本周余 {{ Math.max(0, left) }}/{{ good.weeklyLimit }}</span>
                  <span v-if="store.player.sectRank < good.minRank" class="text-xs text-cinnabar">第 {{ good.minRank }} 阶可兑</span>
                </p>
                <p class="hint">{{ good.desc }}</p>
              </div>
              <div class="flex flex-wrap justify-end gap-1.5">
                <button class="btn btn-sm btn-gold tabular-nums" :disabled="busy || !!blocked" :title="blocked"
                  @click="store.exchangeSectGood(good.id)">{{ good.price }} 贡献</button>
                <button v-if="bulk" class="btn btn-sm tabular-nums" :disabled="busy" @click="store.exchangeSectGood(good.id, 5)">×5</button>
              </div>
            </li>
          </ul>
          <p v-else class="hint">学会本门传承的武学后，可在这里兑换它的残页。</p>
        </section>
        <p class="hint">门派贡献只在本门用得上：出师或叛出师门时清零。</p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.treasury-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .65rem; }
@media (max-width: 767px) {
  .treasury-row { grid-template-columns: auto minmax(0, 1fr); }
  .treasury-row > :last-child { grid-column: 2; justify-content: flex-start; }
}
</style>
