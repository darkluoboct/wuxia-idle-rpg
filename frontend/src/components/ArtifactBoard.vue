<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COOP_RAIDS, ITEMS, PILL_RECIPES } from '@/config/gameData'
import { EQUIP_SLOT_META, TIER_META } from '@/config/uiMeta'
import { arenaDay, arenaWindow, DAGOU_STAFF, isArenaDay, nextArenaDay } from '../../../shared/artifacts.ts'
import { TRIAL_STAGES } from '../../../shared/trialStages.ts'
import { GACHA_POOL } from '../../../shared/gacha.ts'
import ItemIcon from './ItemIcon.vue'

const store = useGameStore()
const item = ITEMS[DAGOU_STAFF.itemId]
const art = computed(() => store.artifactBoard?.artifacts[0])
const mine = computed(() => art.value?.state === 'HELD' && art.value.holderId === store.player.id)
const date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' })
const moment = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const arena = computed(() => {
  const today = arenaDay(store.worldTime)
  if (isArenaDay(today)) return '君山擂台今日开擂，午夜收擂'
  const next = nextArenaDay(today)
  return `君山擂台每周日开擂，下一场在 ${date.format(arenaWindow(next).opensAt)}（${next - today} 天后）`
})
const status = computed(() => {
  if (art.value?.state === 'UNCLAIMED') return '还在洪七公手里。通过丐帮终考的第一人自得衣钵。'
  if (art.value?.state === 'VACANT') return '眼下无主，由丐帮传功长老代守。够资格的侠客任何一天都可上擂，胜过长老即可执棒。'
  return arena.value
})
/** 执棒者不上自己的擂；尚未出世时也无擂可上 */
const canFight = computed(() => !!art.value && art.value.state !== 'UNCLAIMED' && !mine.value)
const filter = ref<'全部' | '未拥有' | '已拥有'>('全部')
function source(id: string) {
  const stage = TRIAL_STAGES.find((entry) => entry.clearItemId === id || entry.setId === ITEMS[id]?.setId)
  if (stage) return '历练 · 第 ' + stage.code + ' 关'
  const raid = Object.values(COOP_RAIDS).find((entry) => entry.relics.some((item) => item.id === id))
  if (raid) return '结义副本 · ' + raid.title
  if (id === 'jiuyin_sanskrit') return '招募黄蓉 · 历练 24、30 关'
  if (id === 'xuantie_heavysword') return '鬼市旧物摊 · 鉴宝'
  if (Object.values(GACHA_POOL).some((pool) => pool.some((entry) => entry.kind === 'ITEM' && entry.id === id))) return '醉仙楼 · 结缘'
  if (Object.values(PILL_RECIPES).some((recipe) => recipe.targetMedicineId === id)) return '百草丹房 · 炼制'
  return '出处待考'
}
const registry = computed(() => (store.artifactBoard?.registry ?? []).map(({ itemId, holders }) => ({
  item: ITEMS[itemId], holders, owned: store.ownedItemIds.includes(itemId),
})))

const visible = computed(() => registry.value.filter((entry) => filter.value === '全部' || entry.owned === (filter.value === '已拥有')))

// 进兵器谱先取一次，停留期间每半分钟刷新，看得到擂台易主
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void store.refreshArtifacts()
  timer = setInterval(() => void store.refreshArtifacts(), 30_000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="view-scroll -mr-1 space-y-3 pr-1">
    <p class="hint">兵器谱记着全服唯一的真品眼下在谁手里。真品只有一件，守不住就要易主。</p>
    <p v-if="!art" class="hint">正在读取兵器谱。</p>

    <article v-else class="well t-red tier-edge glow-border space-y-3 p-4" :aria-label="`真品 ${art.name}`">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <button class="font-brush tier-text flex items-center gap-2 text-left text-2xl leading-tight underline-offset-4 hover:underline" @click="store.inspectById('item', art.itemId)">
          <ItemIcon :item-id="art.itemId" class="[--item-icon-size:2.6rem]" />「{{ art.name }}」
        </button>
        <span class="flex shrink-0 items-center gap-1.5">
          <span v-if="!mine && store.player.artifactHonors?.includes(art.itemId)" class="chip chip-gold">曾执绿玉杖</span>
          <span class="chip tier-chip">全服唯一</span>
        </span>
      </div>
      <p class="hint">{{ item.signatureEffect }}</p>

      <div class="flex items-center gap-2.5 text-sm">
        <span class="seal h-8 w-8 text-lg" :class="art.state === 'HELD' ? '' : 'bg-transparent text-ink3 shadow-none outline-ink3'">{{ art.state === 'HELD' ? '执' : art.state === 'VACANT' ? '守' : '空' }}</span>
        <div class="min-w-0">
          <div class="truncate font-bold" :class="art.state === 'HELD' ? (mine ? 'text-gold' : '') : 'text-ink3'">
            {{ art.state === 'HELD' ? (mine ? `${art.holderNickname}（你）` : art.holderNickname) : art.state === 'VACANT' ? '传功长老代守' : '尚未出世' }}
          </div>
          <div v-if="art.state === 'HELD'" class="truncate text-xs text-ink3">
            {{ art.holderSect }} · {{ date.format(art.heldSince ?? 0) }} 起执掌 · 已守住 <b class="text-ink2">{{ art.defendStreak }}</b> 届
          </div>
        </div>
      </div>

      <p class="text-xs text-ink2">{{ status }}</p>
      <p v-if="art.state === 'HELD' && art.recallAt" class="text-xs" :class="mine ? 'text-gold' : 'text-ink3'">
        {{ mine ? `你若连续 ${DAGOU_STAFF.idleRecallMs / 3_600_000} 小时没有任何操作，打狗棒会被长老收回。` : `执棒者须在 ${moment.format(art.recallAt)} 前露面，否则由长老收回代守。` }}
      </p>

      <div v-if="canFight" class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
        <span class="min-w-0 text-xs" :class="store.artifactBlock ? 'text-ink3' : 'text-ink2'">
          {{ store.artifactBlock || `今日还可上擂 ${store.artifactAttempts} 次，对手是${art.state === 'HELD' ? `执棒的${art.holderNickname}` : '代守的传功长老'}` }}
        </span>
        <button class="btn btn-seal shrink-0" :disabled="store.onlineActionBusy || store.isBattlePlaying || !!store.artifactBlock" @click="store.challengeArtifact()">上擂</button>
      </div>

      <ol v-if="art.duels.length" class="space-y-0.5 border-t border-line pt-2 text-xs" aria-label="擂台记录">
        <li v-for="duel in art.duels" :key="duel.at + duel.challenger" class="flex justify-between gap-2" :class="duel.self ? 'text-gold' : 'text-ink3'">
          <span class="min-w-0 truncate">{{ duel.self ? '你' : duel.challenger }} 攻擂 {{ duel.defender ?? '传功长老' }} · {{ duel.won ? '胜，夺棒' : '负' }}</span>
          <span class="shrink-0 tabular-nums">{{ moment.format(duel.at) }}</span>
        </li>
      </ol>

      <details class="text-xs text-ink3">
        <summary class="cursor-pointer select-none">擂台规矩</summary>
        <ul class="mt-1.5 list-disc space-y-1 pl-4">
          <li>资格：通过丐帮终考、学会《天下无狗》，且没有叛出丐帮。</li>
          <li>每周日全天开擂，每人每天可上擂 {{ DAGOU_STAFF.dailyAttempts }} 次。胜者当场执棒，接着守擂；擂台上不许服药。</li>
          <li>执棒者以当时的出战配装守擂。周日收擂时棒还在手里，算守住一届。</li>
          <li>执棒者连续 {{ DAGOU_STAFF.idleRecallMs / 3_600_000 }} 小时没有任何操作，或叛出丐帮，打狗棒由传功长老收回代守。</li>
          <li>失棒时学过的武功都还在；每守住一届补偿百炼玄铁 {{ DAGOU_STAFF.ironPerDefense }} 块，至多 {{ DAGOU_STAFF.ironCap }} 块，叛帮不补。</li>
        </ul>
      </details>
    </article>

    <section v-if="registry.length" class="space-y-2" aria-label="神兵名录">
      <div class="flex items-baseline justify-between gap-2">
        <h4 class="font-brush text-xl leading-none">神兵名录</h4>
        <span class="text-xs text-ink3">第一卷神品装备 · 全服持有人数</span>
      </div>
      <div class="workbench-toolbar" aria-label="筛选神兵">
        <button v-for="f in (['全部','未拥有','已拥有'] as const)" :key="f" class="btn btn-sm" :aria-pressed="filter === f" :class="{ 'btn-gold': filter === f }" @click="filter = f">{{ f }}</button>
      </div>
      <p v-if="!visible.length" class="hint">该分类暂无神兵。</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="entry in visible" :key="entry.item.id" class="well well-hover tier-edge flex items-center justify-between gap-2 p-2.5 text-left"
          :class="TIER_META[entry.item.tier].cls" @click="store.inspectById('item', entry.item.id)"
        >
          <ItemIcon :item-id="entry.item.id" />
          <span class="min-w-0 flex-1">
            <span class="tier-text block truncate text-sm font-bold">{{ entry.item.name }}</span>
            <span class="block text-xs text-ink3">{{ EQUIP_SLOT_META[entry.item.slot].label }}{{ entry.owned ? ' · 你已拥有' : '' }} · {{ source(entry.item.id) }}</span>
          </span>
          <span class="shrink-0 text-xs tabular-nums" :class="entry.holders ? 'text-ink2' : 'text-ink3'">{{ entry.holders ? `${entry.holders} 人持有` : '尚无人得' }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
