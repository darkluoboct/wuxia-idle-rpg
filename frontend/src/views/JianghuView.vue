<script setup lang="ts">
import { computed, ref } from 'vue'
import { Lock } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { ADVENTURES, EXPANSION_VOLUMES_PREVIEW, isMapUnlocked, ITEMS, MAPS, SKILLS, STORY_ARCS, STORY_CHAPTERS, type AdventureConfig } from '@/config/gameData'
import { STANCE_META, TIER_META, stanceRelation } from '@/config/uiMeta'
import PortraitCard from '@/components/PortraitCard.vue'
import SceneBackdrop from '@/components/SceneBackdrop.vue'

const store = useGameStore()
const sub = ref<'STORY' | 'MAPS' | 'RAID'>('STORY')
const tabs = [
  { k: 'STORY', l: '射雕主线' },
  { k: 'MAPS', l: '九州舆图' },
  { k: 'RAID', l: '结义 · 后续长卷' },
] as const

const cleared = computed(() => Math.max(0, store.player.maxChapterId - 1))
type State = 'CLEARED' | 'CURRENT' | 'LOCKED'
const stateOf = (id: number): State => (id < store.player.maxChapterId ? 'CLEARED' : id === store.player.maxChapterId ? 'CURRENT' : 'LOCKED')

function drops(ch: (typeof STORY_CHAPTERS)[number]) {
  const out: { id: string; name: string; tier: keyof typeof TIER_META; kind: 'skill' | 'item' }[] = []
  for (const id of ch.dropItemIds ?? []) if (ITEMS[id]) out.push({ id, name: ITEMS[id].name, tier: ITEMS[id].tier, kind: 'item' })
  for (const id of ch.dropSkillIds ?? []) if (SKILLS[id]) out.push({ id, name: SKILLS[id].name, tier: SKILLS[id].tier, kind: 'skill' })
  return out
}

const CN_NUM = ['一', '二', '三', '四', '五']
const nodesOf = (chapter: number) => STORY_CHAPTERS.filter((n) => n.chapter === chapter)
const arcCleared = (chapter: number) => nodesOf(chapter).filter((n) => stateOf(n.id) === 'CLEARED').length
const sideQuests = (nodeId: number) => ADVENTURES.filter((a) => a.afterNodeId === nodeId)
function advState(a: AdventureConfig): 'DONE' | 'PENDING' | 'OPEN' | 'LOCKED' {
  if (store.resolvedAdventureIds.includes(a.id)) return 'DONE'
  if (store.pendingAdventure?.templateId === a.id || store.adventureQueue.includes(a.id)) return 'PENDING'
  return a.afterNodeId < store.player.maxChapterId ? 'OPEN' : 'LOCKED'
}
const mapLocked = (m: (typeof MAPS)[number]) => !isMapUnlocked(m, store.player.maxChapterId)
</script>

<template>
  <div class="view">
    <section class="panel flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div class="tabs flex-1" role="tablist">
          <button v-for="t in tabs" :key="t.k" class="tab" role="tab" :aria-selected="sub === t.k" @click="sub = t.k">{{ t.l }}</button>
        </div>
        <div class="flex items-center gap-2 text-xs text-ink3">
          通关
          <div class="bar bar-thin bar-gold w-20"><i :style="{ width: `${(cleared / STORY_CHAPTERS.length) * 100}%` }" /></div>
          <b class="tabular-nums text-gold">{{ cleared }} / {{ STORY_CHAPTERS.length }}</b>
        </div>
      </div>

      <!-- ============ 主线：五章回目时间轴 ============ -->
      <ol v-if="sub === 'STORY'" class="view-scroll -mr-1 pr-1">
        <template v-for="arc in STORY_ARCS" :key="arc.chapter">
          <li class="flex flex-wrap items-center gap-x-3 gap-y-1 pb-3 pt-1" :class="arc.chapter > 1 ? 'mt-1 border-t border-line pt-4' : ''">
            <span class="seal h-9 w-9 text-lg">{{ CN_NUM[arc.chapter - 1] }}</span>
            <div class="min-w-0 flex-1">
              <h3 class="font-brush text-2xl leading-none">第{{ CN_NUM[arc.chapter - 1] }}章 · {{ arc.title }}</h3>
              <p class="hint mt-1">{{ arc.tagline }} · {{ arc.summary }}</p>
            </div>
            <span class="chip tabular-nums" :class="arcCleared(arc.chapter) === nodesOf(arc.chapter).length ? 'chip-jade' : ''">
              {{ arcCleared(arc.chapter) }} / {{ nodesOf(arc.chapter).length }}
            </span>
          </li>

          <li
            v-for="ch in nodesOf(arc.chapter)" :key="ch.id"
            class="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]"
            :class="stateOf(ch.id) === 'LOCKED' ? 'opacity-60' : ''"
          >
            <!-- 节点 + 竖线 -->
            <div class="relative flex flex-col items-center">
              <span
                class="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold tabular-nums"
                :class="{
                  'border-jade bg-[color-mix(in_srgb,var(--jade)_14%,var(--bg-1))] text-jade': stateOf(ch.id) === 'CLEARED',
                  'anim-pulse-glow border-gold bg-[var(--gold-soft)] text-gold': stateOf(ch.id) === 'CURRENT',
                  'border-linestrong bg-raised text-ink3': stateOf(ch.id) === 'LOCKED',
                }"
              >
                <Lock v-if="stateOf(ch.id) === 'LOCKED'" :size="15" />
                <template v-else>{{ ch.code }}</template>
              </span>
              <span v-if="ch.id !== STORY_CHAPTERS.length" class="absolute bottom-[-1rem] top-11 w-px" :class="stateOf(ch.id) === 'CLEARED' ? 'bg-jade opacity-60' : 'bg-linestrong opacity-70'" />
            </div>

            <div class="well min-w-0 space-y-2 p-3" :class="stateOf(ch.id) === 'CURRENT' ? '!border-gold' : ''">
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h4 class="font-brush text-xl leading-none">{{ ch.title }}</h4>
                <span v-if="ch.isBoss" class="chip chip-red">章节 Boss</span>
                <span v-if="stateOf(ch.id) === 'CLEARED'" class="chip chip-jade">已通关</span>
                <span v-else-if="stateOf(ch.id) === 'CURRENT'" class="chip chip-gold">当前关卡</span>
              </div>

              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="chip" :class="store.player.level >= ch.recLevel ? 'chip-jade' : 'chip-red'">
                  荐 Lv.{{ ch.recLevel }}{{ store.player.level >= ch.recLevel ? ' · 已达' : ` · 差 ${ch.recLevel - store.player.level} 级` }}
                </span>
                <span
                  class="chip"
                  :class="{
                    'chip-jade': stanceRelation(store.currentLoadout.stance, ch.bossStance) === 'WIN',
                    'chip-red': stanceRelation(store.currentLoadout.stance, ch.bossStance) === 'LOSE',
                  }"
                >
                  敌摆「{{ STANCE_META[ch.bossStance].short }}」·
                  {{ { WIN: '我方克制', LOSE: '被克制', EVEN: '同势' }[stanceRelation(store.currentLoadout.stance, ch.bossStance)] }}
                </span>
                <span class="chip">敌首 {{ ch.bossName }}</span>
                <span v-if="ch.guards?.length" class="chip">随从 {{ ch.guards.map((g) => g.name).join('、') }}</span>
              </div>

              <p class="hint">{{ ch.mechanicTip }}</p>

              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="text-ink3">犒赏</span>
                <span class="chip chip-jade tabular-nums">真气 +{{ ch.rewardQi.toLocaleString() }}</span>
                <span class="chip chip-gold tabular-nums">纹银 +{{ ch.rewardSilver.toLocaleString() }}</span>
                <button
                  v-for="d in drops(ch)" :key="d.id" class="chip tier-chip" :class="TIER_META[d.tier].cls"
                  :title="`可能掉落 · ${TIER_META[d.tier].label}`" @click="store.inspectById(d.kind, d.id)"
                >
                  {{ TIER_META[d.tier].label }} · {{ d.name }}
                </button>
              </div>

              <!-- 该节点首通后解锁的支线 -->
              <div v-if="sideQuests(ch.id).length" class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="text-ink3">支线</span>
                <span
                  v-for="a in sideQuests(ch.id)" :key="a.id" class="chip"
                  :class="{ 'chip-jade': advState(a) === 'DONE', 'chip-gold': advState(a) === 'PENDING' || advState(a) === 'OPEN' }"
                  :title="{ DONE: '已了结', PENDING: '正等你在纪事卷轴中抉择', OPEN: '已开启，可在修行页「游历寻访机缘」触发', LOCKED: '通关本节点后开启' }[advState(a)]"
                >
                  {{ a.title }} · {{ { DONE: '已了结', PENDING: '待抉择', OPEN: '可触发', LOCKED: '未开启' }[advState(a)] }}
                </span>
              </div>
            </div>

            <div class="col-span-2 col-start-1 mt-2 flex items-center sm:col-span-1 sm:col-start-3 sm:mt-0">
              <button
                class="btn w-full sm:w-auto sm:min-w-[6.5rem]"
                :class="stateOf(ch.id) === 'CURRENT' ? 'btn-seal !min-h-[2.6rem]' : ''"
                :disabled="stateOf(ch.id) === 'LOCKED'"
                @click="store.challengeChapter(ch.id)"
              >
                {{ { CLEARED: '再次历练', CURRENT: '拔剑闯关', LOCKED: '未解锁' }[stateOf(ch.id)] }}
              </button>
            </div>
          </li>
        </template>
      </ol>

      <!-- ============ 舆图 ============ -->
      <div v-else-if="sub === 'MAPS'" class="view-scroll -mr-1 grid content-start gap-3 pr-1 sm:grid-cols-2">
        <article
          v-for="m in MAPS" :key="m.id" class="well well-hover group overflow-hidden"
          :class="[store.player.currentMapId === m.id ? '!border-gold' : '', mapLocked(m) ? 'opacity-60' : '']"
        >
          <div class="relative h-28 overflow-hidden">
            <SceneBackdrop :map-id="m.id" :shichen-idx="store.shichenIdx" :dark="store.isMidnightTheme" :animated="false" />
            <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
              <h4 class="font-brush text-xl leading-none text-[#f0e9dc]">{{ m.name.replace(/（.*?）/, '') }}</h4>
              <span v-if="mapLocked(m)" class="chip bg-black/40 backdrop-blur-[2px]"><Lock :size="12" /> 未开放</span>
              <span v-else class="chip bg-black/40 backdrop-blur-[2px]" :class="m.safety === 'PEACE' ? 'chip-jade' : 'chip-red'">
                {{ m.safety === 'PEACE' ? '和平共修' : '限定纷争' }}
              </span>
            </div>
          </div>
          <div class="space-y-2.5 p-3">
            <p class="hint min-h-[3.3rem]">{{ m.ambientDesc }}</p>
            <div class="flex items-center justify-between border-t border-line pt-2.5 text-xs tabular-nums">
              <span class="text-ink3">灵脉 <b class="text-ink">{{ m.baseQiPerHour.toLocaleString() }}</b>/时 · {{ m.onlineCount }} 人在线</span>
              <button v-if="mapLocked(m)" class="btn btn-sm" disabled>{{ m.unlockHint ?? '尚未开放' }}</button>
              <button v-else-if="store.player.currentMapId !== m.id" class="btn btn-sm btn-gold" @click="store.moveMap(m.id)">动身前往</button>
              <span v-else class="chip chip-gold">当前驻留</span>
            </div>
          </div>
        </article>
      </div>

      <!-- ============ 结义 + 后续长卷 ============ -->
      <div v-else class="view-scroll -mr-1 space-y-4 pr-1">
        <article class="well relative overflow-hidden p-4">
          <div class="pointer-events-none absolute inset-0 opacity-70" style="background: radial-gradient(ellipse at 85% 50%, var(--gold-soft), transparent 60%)" />
          <div class="relative grid items-center gap-4 md:grid-cols-[1fr_auto]">
            <div class="space-y-2">
              <span class="chip chip-gold">三人实时组队</span>
              <h4 class="font-brush text-2xl leading-tight">松鹤楼义结金兰 · 少室山三渡金刚伏魔圈</h4>
              <p class="hint">进入秘境后由“1 主 + 2 伙伴”切换为「3 名真实玩家主角同场出战」。当前结义队友：乔北冥（丐帮）、清风道长（全真）。</p>
              <button class="btn btn-seal mt-1" @click="store.startThreePlayerCoopRaid()">结义发兵</button>
            </div>
            <div class="mx-auto flex w-[min(100%,20rem)] items-end justify-center gap-2">
              <PortraitCard bare size="sm" name="乔北冥" subtitle="丐帮" style-type="hongqigong" class="flex-1" />
              <PortraitCard bare size="sm" is-main :name="store.player.nickname" subtitle="你" style-type="hero_sword" class="flex-1" />
              <PortraitCard bare size="sm" name="清风道长" subtitle="全真" style-type="huangyaoshi" class="flex-1" />
            </div>
          </div>
        </article>

        <div>
          <div class="sec-title mb-2.5">岁时武库 · 后续资料片</div>
          <div class="grid gap-2.5 sm:grid-cols-2">
            <article v-for="v in EXPANSION_VOLUMES_PREVIEW" :key="v.vol" class="well relative space-y-1.5 p-3.5 opacity-85">
              <Lock :size="14" class="absolute right-3 top-3 text-ink3" />
              <div class="font-brush text-lg leading-none text-gold">{{ v.vol }}</div>
              <div class="text-xs text-ink3">{{ v.range }}</div>
              <p class="text-sm">{{ v.chapters }}</p>
              <p class="hint">核心机制：{{ v.core }}</p>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
