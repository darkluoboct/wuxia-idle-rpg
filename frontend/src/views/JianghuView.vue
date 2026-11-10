<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Lock } from 'lucide-vue-next'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { EXPANSION_VOLUMES_PREVIEW, getChapterDrops, getMapHerbs, MAPS, STORY_CHAPTERS } from '@/config/gameData'
import { STANCE_META, TIER_META, stanceRelation } from '@/config/uiMeta'
import PortraitCard from '@/components/PortraitCard.vue'
import RaidLobbyPanel from '@/components/RaidLobbyPanel.vue'
import SceneBackdrop from '@/components/SceneBackdrop.vue'

const store = useGameStore()
const { jianghuTab: sub } = storeToRefs(store)
const tabs = [
  { k: 'STORY', l: '射雕主线' },
  { k: 'MAPS', l: '江湖地图' },
  { k: 'RAID', l: '结义副本' },
] as const

const cleared = computed(() => Math.max(0, store.player.maxChapterId - 1))
type State = 'CLEARED' | 'CURRENT' | 'LOCKED'
const stateOf = (id: number): State => (id < store.player.maxChapterId ? 'CLEARED' : id === store.player.maxChapterId ? 'CURRENT' : 'LOCKED')

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

      <!-- ============ 主线：回目时间轴 ============ -->
      <ol v-if="sub === 'STORY'" class="view-scroll -mr-1 pr-1">
        <li
          v-for="ch in STORY_CHAPTERS" :key="ch.id"
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
              <span v-if="stateOf(ch.id) === 'CLEARED'" class="chip chip-jade">已通关</span>
              <span v-else-if="stateOf(ch.id) === 'CURRENT'" class="chip chip-gold">当前关卡</span>
            </div>

            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <span class="chip" :class="store.player.level >= ch.recLevel ? 'chip-jade' : 'chip-red'">
                推荐 {{ ch.recLevel }} 级{{ store.player.level >= ch.recLevel ? '' : ` · 还差 ${ch.recLevel - store.player.level} 级` }}
              </span>
              <span
                class="chip"
                :class="{
                  'chip-jade': stanceRelation(store.currentLoadout.stance, ch.bossStance) === 'WIN',
                  'chip-red': stanceRelation(store.currentLoadout.stance, ch.bossStance) === 'LOSE',
                }"
              >
                对手用{{ STANCE_META[ch.bossStance].name }} ·
                {{ { WIN: '你占上风', LOSE: '对手占上风', EVEN: '打法相同' }[stanceRelation(store.currentLoadout.stance, ch.bossStance)] }}
              </span>
              <span class="chip">对手 {{ ch.bossName }}</span>
            </div>

            <p class="hint">{{ ch.mechanicTip }}</p>

            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <span class="text-ink3">通关奖励</span>
              <span class="chip chip-jade tabular-nums">真气 +{{ ch.rewardQi.toLocaleString() }}</span>
              <span class="chip chip-gold tabular-nums">纹银 +{{ ch.rewardSilver.toLocaleString() }}</span>
              <button
                v-for="d in getChapterDrops(ch)" :key="d.id" class="chip tier-chip" :class="TIER_META[d.tier].cls"
                :title="`通关可得 · ${TIER_META[d.tier].label}`" @click="store.inspectById(d.kind, d.id)"
              >
                {{ TIER_META[d.tier].label }} · {{ d.name }}
              </button>
            </div>
          </div>

          <div class="col-span-2 col-start-1 mt-2 flex items-center sm:col-span-1 sm:col-start-3 sm:mt-0">
            <button
              class="btn w-full sm:w-auto sm:min-w-[6.5rem]"
              :class="stateOf(ch.id) === 'CURRENT' ? 'btn-seal !min-h-[2.6rem]' : ''"
              :disabled="stateOf(ch.id) === 'LOCKED' || store.onlineActionBusy"
              @click="store.challengeChapter(ch.id)"
            >
              {{ { CLEARED: '再战一次', CURRENT: '开始闯关', LOCKED: '先打上一关' }[stateOf(ch.id)] }}
            </button>
          </div>
        </li>
      </ol>

      <!-- ============ 舆图 ============ -->
      <div v-else-if="sub === 'MAPS'" class="view-scroll -mr-1 grid content-start gap-3 pr-1 sm:grid-cols-2">
        <article
          v-for="m in MAPS" :key="m.id" class="well well-hover group overflow-hidden"
          :class="store.player.currentMapId === m.id ? '!border-gold' : ''"
        >
          <div class="relative h-28 overflow-hidden">
            <SceneBackdrop :map-id="m.id" :shichen-idx="store.shichenIdx" />
            <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
              <h4 class="font-brush text-xl leading-none text-[#f0e9dc]">{{ m.name.replace(/（.*?）/, '') }}</h4>
              <span class="chip bg-black/40 backdrop-blur-[2px]" :class="m.safety === 'PEACE' ? 'chip-jade' : 'chip-red'">
                {{ m.safety === 'PEACE' ? '和平区' : IS_MOCK_MODE ? '可劫镖' : '纷争区' }}
              </span>
            </div>
          </div>
          <div class="space-y-2.5 p-3">
            <p class="hint min-h-[3.3rem]">{{ m.ambientDesc }}</p>
            <div class="flex flex-wrap items-center gap-1 border-t border-line/50 pt-2 text-[0.72rem]">
              <span class="text-ink3">本地产药：</span>
              <span
                v-for="h in getMapHerbs(m.id)"
                :key="h.id"
                class="chip !py-0 !text-[0.65rem]"
                :class="[TIER_META[h.tier].cls, (store.herbInventory[h.id] ?? 0) > 0 ? '' : 'opacity-60']"
              >
                {{ h.name }} ({{ store.herbInventory[h.id] ?? 0 }})
              </span>
            </div>
            <div class="flex items-center justify-between border-t border-line pt-2 text-xs tabular-nums">
              <div class="text-ink3">
                <div>基础收益 <b class="text-ink">{{ m.baseQiPerHour.toLocaleString() }}</b> 真气/小时</div>
                <div v-if="IS_MOCK_MODE">{{ m.onlineCount }} 人在线</div>
                <div v-else-if="store.roomConnected && store.roomMapId === m.id">{{ store.roomCount }} 人在线</div>
              </div>
              <button v-if="store.player.currentMapId !== m.id" class="btn btn-sm btn-gold" :disabled="store.onlineActionBusy" @click="store.moveMap(m.id)">前往</button>
              <div v-else class="flex items-center gap-1.5">
                <span class="chip chip-gold">你在这里</span>
                <button class="btn btn-sm btn-gold" @click="store.forageHerbs(m.id)">采药</button>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- ============ 结义 + 后续长卷 ============ -->
      <div v-else class="view-scroll -mr-1 space-y-4 pr-1">
        <article v-if="IS_MOCK_MODE" class="well relative overflow-hidden p-4">
          <div class="pointer-events-none absolute inset-0 opacity-70" style="background: radial-gradient(ellipse at 85% 50%, var(--gold-soft), transparent 60%)" />
          <div class="relative grid items-center gap-4 md:grid-cols-[1fr_auto]">
            <div class="space-y-2">
              <span class="chip chip-gold">三人合战</span>
              <h4 class="font-brush text-2xl leading-tight">少室山 · 金刚伏魔圈</h4>
              <p class="hint">这场由乔北冥和清风道长与你并肩出战，两人会替换你平时带的伙伴。</p>
              <p v-if="store.nextRaidRelic" class="text-sm text-gold">打赢可得《{{ store.nextRaidRelic.name }}》</p>
              <p v-else class="hint">副本秘宝已集齐，再战仍可获得真气和纹银。</p>
              <button class="btn btn-seal mt-1" @click="store.startThreePlayerCoopRaid()">挑战副本</button>
            </div>
            <div class="mx-auto flex w-[min(100%,20rem)] items-end justify-center gap-2">
              <PortraitCard bare size="sm" name="乔北冥" subtitle="丐帮" style-type="hongqigong" class="flex-1" />
              <PortraitCard bare size="sm" is-main :name="store.player.nickname" subtitle="你" style-type="hero_sword" :avatar-id="store.player.avatarId" class="flex-1" />
              <PortraitCard bare size="sm" name="清风道长" subtitle="全真" style-type="huangyaoshi" class="flex-1" />
            </div>
          </div>
        </article>
        <RaidLobbyPanel v-else />

        <div>
          <div class="sec-title mb-2.5">后续篇章</div>
          <div class="grid gap-2.5 sm:grid-cols-2">
            <article v-for="v in EXPANSION_VOLUMES_PREVIEW" :key="v.vol" class="well relative space-y-1.5 p-3.5 opacity-85">
              <Lock :size="14" class="absolute right-3 top-3 text-ink3" />
              <div class="font-brush text-lg leading-none text-gold">{{ v.vol }}</div>
              <div class="text-xs text-ink3">{{ v.range }}</div>
              <p class="text-sm">{{ v.chapters }}</p>
              <p class="hint">玩法 · {{ v.core }}</p>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
