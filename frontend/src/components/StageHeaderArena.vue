<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS, COOP_RAIDS, SKILLS } from '@/config/gameData'
import { TIER_META } from '@/config/uiMeta'
import PortraitCard from './PortraitCard.vue'
import SceneBackdrop from './SceneBackdrop.vue'

const store = useGameStore()

const SLOT_ORDER = ['LEFT', 'MAIN', 'RIGHT', 'REAR']
const bySide = (side: 'ALLY' | 'ENEMY') =>
  store.battleUnits.filter((unit) => unit.slot.startsWith(side)).sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot.split('_')[1]) - SLOT_ORDER.indexOf(b.slot.split('_')[1])
  )
const allyUnits = computed(() => bySide('ALLY').filter((u) => !u.slot.startsWith('ALLY_ESCORT_')))
const escortUnits = computed(() => store.activeBattle?.units.filter((u) => u.slot.startsWith('ALLY_ESCORT_')) ?? [])
const enemyUnits = computed(() => bySide('ENEMY'))
const stanceBanner = computed(() => store.battleOpponentEntry?.stanceBanner ?? store.activeBattle?.stanceBanner)

const rewards = computed(() => store.activeBattle?.rewards ?? null)
const won = computed(() => store.activeBattle?.winner === (store.activeBattle?.perspective ?? 'ALLY'))
const retreated = computed(() => !!store.activeBattle?.retreated)
const enemyPerspective = computed(() => store.activeBattle?.perspective === 'ENEMY')
const raidLog = computed(() => {
  const report = store.activeBattle
  if (report?.raidId !== 'chongyang' && report?.raidId !== 'juxian') return []
  const sources = report.raidId === 'juxian' ? ['raid_wave', 'raid_survival'] : ['enemy_formation']
  return report.events.slice(0, store.battleEventCursor)
    .filter((event) => event.effectSourceId && sources.includes(event.effectSourceId))
    .map(({ round, segments }) => ({
      round, title: segments.find((segment) => segment.type === 'tag')?.text,
      details: segments.flatMap((segment) => segment.type === 'text' ? [segment.text] : []),
    }))
})

function inspectReward(id: string) {
  store.inspectById(SKILLS[id] ? 'skill' : 'item', id)
}

</script>

<template>
  <section class="panel battle-arena overflow-hidden">
    <div v-if="store.activeBattle" class="relative flex min-h-full flex-col justify-between">
      <SceneBackdrop :map-id="store.activeBattle.raidId === 'chongyang' ? COOP_RAIDS.chongyang.mapId : store.player.currentMapId"
        :shichen-idx="store.shichenIdx" battle />
      <div v-if="store.isBattlePlaying && store.slashBanner?.sanskrit" :key="store.slashBanner.key"
        class="sanskrit-flow pointer-events-none absolute inset-x-0 top-1/4 z-30 text-center text-3xl text-gold"
        aria-hidden="true">ॐ　अ　इ　उ　ऋ　ऐ　औ　ॐ</div>

      <!-- 破屏书法招式横幅 -->
      <div
        v-if="store.slashBanner && store.isBattlePlaying"
        :key="store.slashBanner.key"
        class="pointer-events-none absolute left-1/2 top-[3.4rem] z-40 [animation:brushBanner_1s_cubic-bezier(0.16,1,0.3,1)_forwards] md:top-[3.8rem]"
      >
        <div
          class="min-w-[12rem] px-10 py-2 text-center shadow-2xl [clip-path:polygon(0_14%,2%_0,98%_10%,100%_46%,99%_100%,3%_90%)]"
          :class="store.slashBanner.isUlt ? 'bg-black/90' : 'bg-black/80'"
          :style="{ borderBlock: `1px solid ${store.slashBanner.isAlly ? 'var(--gold)' : 'var(--cinnabar)'}` }"
        >
          <div
            class="font-brush whitespace-nowrap leading-none"
            :class="[store.slashBanner.isAlly || store.slashBanner.sanskrit ? 'text-gold' : 'text-cinnabar', store.slashBanner.isUlt ? 'text-4xl' : 'text-3xl']"
          >
            「{{ store.slashBanner.text }}」
          </div>
          <div class="mt-1.5 whitespace-nowrap text-xs tracking-widest text-[#b9b2a4]">{{ store.slashBanner.sub }}</div>
        </div>
      </div>

      <!-- 战斗标题与控制 -->
      <div class="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-black/30 px-3 py-2 backdrop-blur-[2px]">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="chip chip-gold shrink-0">{{ store.activeBattle.mode === 'COOP_3P' ? '三人合战' : '战斗' }}</span>
          <h3 class="font-brush truncate text-xl leading-none text-[#e8e2d6]">{{ store.activeBattle.sceneTitle }}</h3>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <button class="btn btn-sm !text-[#e8e2d6] xl:hidden" @click="store.mobileDrawer = 'WORLD'">战报</button>
          <button class="btn btn-sm !text-[#e8e2d6]" @click="store.battleSpeed = store.battleSpeed === 1 ? 2 : 1">
            {{ store.battleSpeed }}x 倍速
          </button>
          <button v-if="store.isBattlePlaying" class="btn btn-sm btn-gold" @click="store.skipBattleToEnd()">跳过回放</button>
          <button v-else class="btn btn-sm btn-seal" @click="store.closeBattleStage()">
            返回 <kbd class="hidden font-sans text-[0.7rem] opacity-70 md:inline">Space</kbd>
          </button>
        </div>
      </div>

      <!-- 对峙 -->
      <div class="relative z-10 grid items-end gap-2 px-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-3">
        <!-- 敌（手机端在上） -->
        <div class="order-1 md:order-3">
          <div class="mx-auto grid gap-1.5" :class="{
            'max-w-[18rem] grid-cols-2': enemyUnits.length === 4,
            'grid-cols-[1fr_1.2fr_1fr]': enemyUnits.length === 2 || enemyUnits.length === 3,
            'w-1/2 max-w-[11rem] grid-cols-1': enemyUnits.length === 1,
          }">
            <PortraitCard
              v-for="u in enemyUnits" :key="u.slot"
              :name="u.name" :subtitle="enemyPerspective && u.id === store.player.id ? `你 · ${u.title}` : u.title" :style-type="u.portraitStyle" :avatar-id="u.avatarId"
              :hp="store.liveUnitStates[u.slot]?.hp ?? u.hp" :max-hp="u.maxHp"
              :rage="store.liveUnitStates[u.slot]?.rage ?? u.rage"
              :anim="store.liveUnitStates[u.slot]?.anim ?? 'NONE'"
              :popup="store.floatingPopups[u.slot] ?? null"
              :is-main="u.slot === 'ENEMY_MAIN'" size="md" :is-enemy="!enemyPerspective"
              :class="u.slot === 'ENEMY_MAIN' ? '' : 'scale-[0.92] origin-bottom'"
            />
          </div>
        </div>

        <!-- 中：对决印 -->
        <div class="order-2 flex items-center justify-center gap-2 md:flex-col">
          <span class="h-px w-10 bg-line md:hidden" />
          <div class="seal-gold seal flex h-11 w-11 items-center justify-center rounded-full text-lg md:h-12 md:w-12">斗</div>
          <span class="h-px w-10 bg-line md:hidden" />
        </div>

        <!-- 我 -->
        <div class="order-3 md:order-1">
          <div class="mx-auto grid grid-cols-[1fr_1.2fr_1fr] gap-1.5">
            <PortraitCard
              v-for="u in allyUnits" :key="u.slot"
              :name="u.name" :subtitle="store.activeBattle.mode === 'COOP_3P' && u.id === store.player.id ? `你 · ${u.title}` : u.title" :style-type="u.portraitStyle" :avatar-id="u.avatarId"
              :hp="store.liveUnitStates[u.slot]?.hp ?? u.hp" :max-hp="u.maxHp"
              :rage="store.liveUnitStates[u.slot]?.rage ?? u.rage"
              :anim="store.liveUnitStates[u.slot]?.anim ?? 'NONE'"
              :popup="store.floatingPopups[u.slot] ?? null"
              :is-main="u.slot === 'ALLY_MAIN'" size="md" :is-enemy="enemyPerspective"
              :class="u.slot === 'ALLY_MAIN' ? '' : 'scale-[0.92] origin-bottom'"
            />
          </div>
          <div v-if="escortUnits.length" class="mx-auto mt-2 grid max-w-[17rem] grid-cols-2 gap-1.5">
            <PortraitCard
              v-for="u in escortUnits" :key="u.slot"
              :name="u.name" :subtitle="u.title" :style-type="u.portraitStyle"
              :hp="store.liveUnitStates[u.slot]?.hp ?? u.hp" :max-hp="u.maxHp"
              :anim="store.liveUnitStates[u.slot]?.anim ?? 'NONE'" :popup="store.floatingPopups[u.slot] ?? null"
              size="sm"
            />
          </div>
        </div>
      </div>

      <!-- 架势态势 / 战果 -->
      <div class="relative z-10 border-t border-line bg-black/35 px-3 py-2 backdrop-blur-[2px]">
        <p
          class="text-center text-sm leading-relaxed"
          :class="
            stanceBanner?.advantage === 'ALLY'
              ? 'text-gold'
              : stanceBanner?.advantage === 'ENEMY'
                ? 'text-cinnabar'
                : 'text-[#b9b2a4]'
          "
        >
          {{ stanceBanner?.description }}
        </p>

        <details v-if="raidLog.length" class="mt-2 text-sm text-jade">
          <summary class="cursor-pointer text-center">{{ raidLog.at(-1)?.title }}</summary>
          <ol class="mx-auto mt-1 max-h-32 w-fit space-y-1 overflow-y-auto px-2">
            <li v-for="(entry, index) in raidLog" :key="index">
              第 {{ entry.round }} 回合 · {{ entry.title }}
              <p v-for="(detail, detailIndex) in entry.details" :key="detailIndex" class="pl-2 text-ink2">{{ detail }}</p>
            </li>
          </ol>
        </details>

        <div v-if="!store.isBattlePlaying" class="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-2">
          <span
            class="anim-stamp seal h-11 w-14 text-2xl"
            :class="won ? '' : '!bg-transparent !text-ink3 !shadow-none !outline-ink3'"
          >{{ won ? '告捷' : retreated ? '脱身' : '惜败' }}</span>
          <template v-if="won && rewards">
            <span class="chip chip-jade tabular-nums">真气 +{{ rewards.qiExp.toLocaleString() }}</span>
            <span class="chip chip-gold tabular-nums">纹银 +{{ rewards.silver.toLocaleString() }}</span>
            <span v-if="rewards.sectContrib" class="chip tabular-nums">门派贡献 +{{ rewards.sectContrib }}</span>
            <span v-if="rewards.karma" class="chip tabular-nums">侠义 +{{ rewards.karma }}</span>
            <button
              v-for="it in rewards.items ?? []" :key="it.id"
              class="chip tier-chip" :class="TIER_META[it.tier].cls" @click="inspectReward(it.id)"
            >
              {{ TIER_META[it.tier].label }} · {{ it.name }}
            </button>
            <span v-for="id in rewards.companions ?? []" :key="id" class="chip chip-jade">{{ COMPANIONS[id]?.name }}入队</span>
          </template>
          <span v-else-if="retreated" class="text-sm text-ink3">已退出本场战斗。可重新挑战。</span>
          <span v-else-if="!won" class="text-sm text-ink3">可以先去武库换打法、挑件装备，再来一战。</span>
        </div>
      </div>
    </div>

  </section>
</template>

<style scoped>
.sanskrit-flow {
  animation: sanskrit-flow 700ms ease-out forwards;
  text-shadow: 0 0 12px currentColor;
}

.battle-arena:has(.sanskrit-flow) {
  animation: sanskrit-impact 200ms ease-out;
}

@keyframes sanskrit-flow {
  from { opacity: 0.9; transform: translateY(0.6rem); }
  to { opacity: 0; transform: translateY(-0.9rem); }
}

@keyframes sanskrit-impact {
  25% { transform: translateX(-3px); }
  50% { transform: translateX(3px); }
  75% { transform: translateX(-1px); }
}

@media (prefers-reduced-motion: reduce) {
  .sanskrit-flow, .battle-arena:has(.sanskrit-flow) { animation: none; }
}
</style>
