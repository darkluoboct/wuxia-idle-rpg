<script setup lang="ts">
/**
 * 中央上半屏“舞台”：
 *   - 日常：水墨山水中三人打坐（随时辰 / 地图变换天色与气候）
 *   - 战斗：3v3 对峙演武台 + 破屏书法招式横幅 + 战果结算
 */
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { SKILLS } from '@/config/gameData'
import { MAP_MOOD_LABEL, TIER_META } from '@/config/uiMeta'
import PortraitCard from './PortraitCard.vue'
import SceneBackdrop from './SceneBackdrop.vue'

const store = useGameStore()

const leftComp = computed(() =>
  store.currentLoadout.leftCompanionId ? (store.companionOf(store.currentLoadout.leftCompanionId) ?? null) : null
)
const rightComp = computed(() =>
  store.currentLoadout.rightCompanionId ? (store.companionOf(store.currentLoadout.rightCompanionId) ?? null) : null
)

const SLOT_ORDER = ['LEFT', 'MAIN', 'RIGHT']
const bySide = (side: 'ALLY' | 'ENEMY') =>
  (store.activeBattle?.units.filter((u) => u.slot.startsWith(side)) ?? []).sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot.split('_')[1]) - SLOT_ORDER.indexOf(b.slot.split('_')[1])
  )
const allyUnits = computed(() => bySide('ALLY'))
const enemyUnits = computed(() => bySide('ENEMY'))

const rewards = computed(() => store.activeBattle?.rewards ?? null)
const won = computed(() => store.activeBattle?.winner === 'ALLY')

function inspectReward(id: string) {
  store.inspectById(SKILLS[id] ? 'skill' : 'item', id)
}

/** 真气上涌的光点（固定随机种子，避免每次渲染抖动） */
const MOTES = Array.from({ length: 9 }, (_, i) => ({
  left: `${44 + ((i * 37) % 13)}%`,
  delay: `${(i * 0.9) % 6}s`,
  dur: `${5 + (i % 4)}s`,
  size: i % 3 === 0 ? '0.32rem' : '0.2rem',
}))
</script>

<template>
  <section class="panel relative shrink-0 overflow-hidden">
    <!-- ==================== 状态 A：演武对峙 ==================== -->
    <div v-if="store.activeBattle" class="relative">
      <SceneBackdrop :map-id="store.player.currentMapId" :shichen-idx="store.shichenIdx" :dark="store.isMidnightTheme" battle />

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
            :class="[store.slashBanner.isAlly ? 'text-gold' : 'text-cinnabar', store.slashBanner.isUlt ? 'text-4xl' : 'text-3xl']"
          >
            「{{ store.slashBanner.text }}」
          </div>
          <div class="mt-1.5 whitespace-nowrap text-xs tracking-widest text-[#b9b2a4]">{{ store.slashBanner.sub }}</div>
        </div>
      </div>

      <!-- 战斗标题与控制 -->
      <div class="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-black/30 px-3 py-2 backdrop-blur-[2px]">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="chip chip-gold shrink-0">{{ store.activeBattle.mode === 'COOP_3P' ? '三人结义合战' : '演武交锋' }}</span>
          <h3 class="font-brush truncate text-xl leading-none text-[#e8e2d6]">{{ store.activeBattle.sceneTitle }}</h3>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <button class="btn btn-sm !text-[#e8e2d6]" @click="store.battleSpeed = store.battleSpeed === 1 ? 2 : 1">
            {{ store.battleSpeed }}x 倍速
          </button>
          <button v-if="store.isBattlePlaying" class="btn btn-sm btn-gold" @click="store.skipBattleToEnd()">速决战果</button>
          <button v-else class="btn btn-sm btn-seal" @click="store.closeBattleStage()">
            收剑归鞘 <kbd class="hidden font-sans text-[0.7rem] opacity-70 md:inline">Space</kbd>
          </button>
        </div>
      </div>

      <!-- 对峙 -->
      <div class="relative z-10 grid items-end gap-2 px-3 pb-2 pt-3 md:grid-cols-[1fr_auto_1fr] md:gap-3">
        <!-- 敌（手机端在上） -->
        <div class="order-1 md:order-3">
          <div class="mx-auto grid gap-1.5" :class="enemyUnits.length > 1 ? 'grid-cols-[1fr_1.2fr_1fr]' : 'w-1/2 max-w-[11rem] grid-cols-1'">
            <PortraitCard
              v-for="u in enemyUnits" :key="u.slot"
              :name="u.name" :subtitle="u.title" :style-type="u.portraitStyle"
              :hp="store.liveUnitStates[u.slot]?.hp ?? u.hp" :max-hp="u.maxHp"
              :rage="store.liveUnitStates[u.slot]?.rage ?? u.rage"
              :anim="store.liveUnitStates[u.slot]?.anim ?? 'NONE'"
              :popup="store.floatingPopups[u.slot] ?? null"
              :is-main="u.slot === 'ENEMY_MAIN'" size="md" is-enemy
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
              :name="u.name" :subtitle="u.title" :style-type="u.portraitStyle"
              :hp="store.liveUnitStates[u.slot]?.hp ?? u.hp" :max-hp="u.maxHp"
              :rage="store.liveUnitStates[u.slot]?.rage ?? u.rage"
              :anim="store.liveUnitStates[u.slot]?.anim ?? 'NONE'"
              :popup="store.floatingPopups[u.slot] ?? null"
              :is-main="u.slot === 'ALLY_MAIN'" size="md"
              :class="u.slot === 'ALLY_MAIN' ? '' : 'scale-[0.92] origin-bottom'"
            />
          </div>
        </div>
      </div>

      <!-- 架势态势 / 战果 -->
      <div class="relative z-10 border-t border-line bg-black/35 px-3 py-2 backdrop-blur-[2px]">
        <p
          class="text-center text-sm leading-relaxed"
          :class="
            store.activeBattle.stanceBanner.advantage === 'ALLY'
              ? 'text-gold'
              : store.activeBattle.stanceBanner.advantage === 'ENEMY'
                ? 'text-cinnabar'
                : 'text-[#b9b2a4]'
          "
        >
          {{ store.activeBattle.stanceBanner.description }}
        </p>

        <div v-if="!store.isBattlePlaying" class="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-2">
          <span
            class="anim-stamp seal h-11 w-14 text-2xl"
            :class="won ? '' : '!bg-transparent !text-ink3 !shadow-none !outline-ink3'"
          >{{ won ? '告捷' : '惜败' }}</span>
          <template v-if="won && rewards">
            <span class="chip chip-jade tabular-nums">真气 +{{ rewards.qiExp.toLocaleString() }}</span>
            <span class="chip chip-gold tabular-nums">纹银 +{{ rewards.silver.toLocaleString() }}</span>
            <span v-if="rewards.sectContrib" class="chip tabular-nums">功绩 +{{ rewards.sectContrib }}</span>
            <button
              v-for="it in rewards.items ?? []" :key="it.id"
              class="chip tier-chip" :class="TIER_META[it.tier].cls" @click="inspectReward(it.id)"
            >
              {{ TIER_META[it.tier].label }} · {{ it.name }}
            </button>
          </template>
          <span v-else-if="!won" class="text-sm text-ink3">胜败乃兵家常事，可调整架势克制敌方再战</span>
        </div>
      </div>
    </div>

    <!-- ==================== 状态 B：山河打坐 ==================== -->
    <div v-else class="relative h-[15.5rem] md:h-[clamp(13.5rem,34vh,24rem)]">
      <SceneBackdrop :map-id="store.player.currentMapId" :shichen-idx="store.shichenIdx" :dark="store.isMidnightTheme" />

      <!-- 左上：地名（竖排毛笔）+ 气候 -->
      <div class="absolute left-3 top-3 z-20 flex items-start gap-2.5">
        <div
          class="hud vertical-rl font-brush !px-1.5 !py-2 !text-xl leading-tight tracking-[0.18em] !text-[#f4ecda] shadow-lg"
        >
          {{ store.currentMap.name.replace(/（.*?）/, '').slice(0, 8) }}
        </div>
        <div class="space-y-1 pt-0.5">
          <div class="hud">{{ MAP_MOOD_LABEL[store.player.currentMapId] ?? '山河清旷' }} · {{ store.shichenLabel }}</div>
          <div>
            <span class="hud" :class="store.currentMap.safety === 'PEACE' ? 'hud-jade' : 'hud-red'">
              {{ store.currentMap.safety === 'PEACE' ? '和平共修' : '纷争险境' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 右上：状态 -->
      <div class="absolute right-3 top-3 z-20 flex flex-col items-end gap-1">
        <span v-if="store.player.bountyUntil" class="hud hud-red font-bold">海捕悬赏中</span>
        <span v-if="store.activeTrioSynergy" class="hud hud-gold">羁绊 · {{ store.activeTrioSynergy.name }}</span>
        <span v-else-if="store.isWandererMasteryActive" class="hud">散人 · 百家里手</span>
        <span v-if="store.player.coCultivatePartner" class="hud hud-jade">与「{{ store.player.coCultivatePartner }}」共修 +15%</span>
      </div>

      <!-- 蒲团：山石平台 + 真气涟漪 -->
      <div class="absolute bottom-[1.6rem] left-1/2 z-10 h-[4.5rem] w-[min(82%,30rem)] -translate-x-1/2">
        <div
          class="absolute inset-x-[6%] bottom-0 h-8 rounded-[50%] shadow-[0_0.6rem_1.4rem_rgba(0,0,0,0.55)]"
          style="background: radial-gradient(ellipse at 50% 30%, var(--stone-a), var(--stone-b) 75%)"
        />
        <template v-for="n in 3" :key="n">
          <i
            class="absolute bottom-3 left-1/2 h-[3.2rem] w-[16rem] -translate-x-1/2 rounded-[50%] border border-gold"
            :style="{ animation: `ripple 4.8s ease-out ${(n - 1) * 1.6}s infinite` }"
          />
        </template>
      </div>

      <!-- 真气光点 -->
      <i
        v-for="(m, i) in MOTES" :key="i"
        class="pointer-events-none absolute bottom-[4rem] z-10 rounded-full bg-gold shadow-[0_0_8px_1px_var(--gold)]"
        :style="{ left: m.left, width: m.size, height: m.size, animation: `rise ${m.dur} ease-out ${m.delay} infinite` }"
      />

      <!-- 三人行 -->
      <div class="absolute inset-x-0 bottom-0 z-10 flex items-end justify-center gap-[clamp(0.5rem,5vw,3.5rem)] px-3 pb-1.5">
        <div class="w-[clamp(4.8rem,17%,8rem)] shrink-0">
          <PortraitCard
            v-if="leftComp" bare size="md" :name="leftComp.name"
            :subtitle="`左翼 · ${leftComp.assistSkillName}`" :style-type="leftComp.portraitStyle"
          />
          <button
            v-else class="flex h-[7rem] w-full items-center justify-center border border-dashed border-linestrong bg-black/25 text-xs text-ink2 backdrop-blur-[2px] hover:border-gold hover:text-gold"
            @click="store.activeTab = 'ARSENAL'"
          >
            左翼虚位<br />前往武库编队
          </button>
        </div>

        <div class="w-[clamp(6rem,24%,11rem)] shrink-0">
          <PortraitCard
            bare is-main size="lg" pose="sit" :name="store.player.nickname"
            :subtitle="`${store.currentSect?.name ?? '逍遥散人'} · ${store.currentRealm.name}`" style-type="hero_sword"
          />
        </div>

        <div class="w-[clamp(4.8rem,17%,8rem)] shrink-0">
          <PortraitCard
            v-if="rightComp" bare size="md" :name="rightComp.name"
            :subtitle="`右翼 · ${rightComp.assistSkillName}`" :style-type="rightComp.portraitStyle"
          />
          <button
            v-else class="flex h-[7rem] w-full items-center justify-center border border-dashed border-linestrong bg-black/25 text-xs text-ink2 backdrop-blur-[2px] hover:border-gold hover:text-gold"
            @click="store.activeTab = 'ARSENAL'"
          >
            右翼虚位<br />前往武库编队
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
