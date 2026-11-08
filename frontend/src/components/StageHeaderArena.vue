<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS } from '@/config/gameData'
import PortraitCard from './PortraitCard.vue'

const store = useGameStore()

const leftComp = computed(() =>
  store.currentLoadout.leftCompanionId ? COMPANIONS[store.currentLoadout.leftCompanionId] : null
)
const rightComp = computed(() =>
  store.currentLoadout.rightCompanionId ? COMPANIONS[store.currentLoadout.rightCompanionId] : null
)

const enemyUnits = computed(() =>
  store.activeBattle?.units.filter((u) => u.slot.startsWith('ENEMY')) ?? []
)
const allyUnits = computed(() =>
  store.activeBattle?.units.filter((u) => u.slot.startsWith('ALLY')) ?? []
)

const weatherMoodLabel = computed(() => {
  switch (store.player.currentMapId) {
    case 'jiaxing_suburb':
      return '江南烟雨'
    case 'zhongnan_forest':
      return '终南松云'
    case 'damo_caravan':
      return '塞外风沙'
    case 'heizhao_swamp':
      return '瘴林夜雾'
    default:
      return '山河清旷'
  }
})
</script>

<template>
  <div class="wuxia-card p-3 relative overflow-hidden shrink-0">
    <!-- 极淡远山水墨留白底衬（静态克制，绝不晃眼抢戏） -->
    <svg
      viewBox="0 0 800 220"
      class="pointer-events-none absolute inset-0 w-full h-full opacity-[0.04] select-none"
      preserveAspectRatio="none"
    >
      <path d="M0,220 L0,148 Q120,82 240,142 T490,116 T720,144 L800,112 L800,220 Z" fill="currentColor" />
    </svg>

    <!-- ==================== 状态 A：3v3 对峙演武台 ==================== -->
    <div v-if="store.activeBattle" class="relative z-10 space-y-2">
      <!-- 破屏水墨书法出招横幅 -->
      <div
        v-if="store.slashBanner && store.isBattlePlaying"
        :key="store.slashBanner.key"
        class="pointer-events-none absolute left-1/2 top-[52%] z-40 animate-brush-banner select-none"
      >
        <div class="px-9 py-1.5 bg-[#0d0f13]/95 border-y border-[var(--border-gold)] text-center shadow-2xl">
          <div
            class="font-brush whitespace-nowrap leading-none"
            :class="store.slashBanner.isAlly ? 'text-2xl ink-gold' : 'text-2xl ink-cinnabar'"
          >
            「 {{ store.slashBanner.text }} 」
          </div>
          <div class="text-[10px] ink-muted tracking-widest mt-1 whitespace-nowrap">
            {{ store.slashBanner.sub }}
          </div>
        </div>
      </div>

      <!-- 顶部战斗标题与倍速控制 -->
      <div class="flex items-center justify-between gap-2 border-b border-[var(--border-ink)] pb-1.5">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[11px] tab-gold px-2 py-0.5 font-bold shrink-0">
            {{ store.activeBattle.mode === 'COOP_3P' ? '三人结义合战' : '演武交锋' }}
          </span>
          <h3 class="font-brush text-lg leading-none truncate">{{ store.activeBattle.sceneTitle }}</h3>
        </div>

        <div class="flex items-center gap-1.5 text-xs shrink-0">
          <button
            @click="store.battleSpeed = store.battleSpeed === 1 ? 2 : 1"
            class="token-btn px-2.5 py-0.5 cursor-pointer"
          >
            {{ store.battleSpeed }}x 倍速
          </button>
          <button
            v-if="store.isBattlePlaying"
            @click="store.skipBattleToEnd()"
            class="tab-gold px-2.5 py-0.5 font-bold cursor-pointer"
          >
            速决战果
          </button>
          <button
            v-else
            @click="store.closeBattleStage()"
            class="seal-stamp px-3 py-0.5 font-bold cursor-pointer"
          >
            收剑归鞘 (Space)
          </button>
        </div>
      </div>

      <!-- 横向左右对峙主舞台 -->
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 py-0.5">
        <div class="grid grid-cols-3 gap-1.5 items-end">
          <PortraitCard
            v-for="u in allyUnits"
            :key="u.slot"
            :name="u.name"
            :subtitle="u.title"
            :style-type="u.portraitStyle"
            :hp="store.liveUnitStates[u.slot]?.hp ?? u.hp"
            :max-hp="u.maxHp"
            :rage="store.liveUnitStates[u.slot]?.rage ?? u.rage"
            :anim="store.liveUnitStates[u.slot]?.anim ?? 'NONE'"
            :popup="store.floatingPopups[u.slot] ?? null"
            :is-main="u.slot === 'ALLY_MAIN'"
            size="sm"
          />
        </div>

        <div class="flex flex-col items-center justify-center px-1.5 select-none">
          <div class="w-8 h-8 rounded-full border border-[var(--border-gold)] flex items-center justify-center font-brush text-sm ink-gold">
            对决
          </div>
          <span
            v-if="!store.isBattlePlaying"
            class="mt-1 text-[11px] font-bold"
            :class="store.activeBattle.winner === 'ALLY' ? 'ink-gold' : 'ink-cinnabar'"
          >
            {{ store.activeBattle.winner === 'ALLY' ? '告捷' : '惜败' }}
          </span>
        </div>

        <div class="flex justify-center gap-1.5 items-end">
          <div
            v-for="u in enemyUnits"
            :key="u.slot"
            :class="enemyUnits.length === 1 ? 'w-40' : 'flex-1 min-w-0'"
          >
            <PortraitCard
              :name="u.name"
              :subtitle="u.title"
              :style-type="u.portraitStyle"
              :hp="store.liveUnitStates[u.slot]?.hp ?? u.hp"
              :max-hp="u.maxHp"
              :rage="store.liveUnitStates[u.slot]?.rage ?? u.rage"
              :anim="store.liveUnitStates[u.slot]?.anim ?? 'NONE'"
              :popup="store.floatingPopups[u.slot] ?? null"
              :is-main="u.slot === 'ENEMY_MAIN'"
              size="sm"
              is-enemy
            />
          </div>
        </div>
      </div>

      <!-- 底部三才架势态势（克制单行文字，不铺艳丽底色） -->
      <div class="text-center pt-1 border-t border-[var(--border-subtle)] text-xs ink-muted truncate">
        <span :class="store.activeBattle.stanceBanner.advantage === 'ALLY' ? 'ink-gold' : store.activeBattle.stanceBanner.advantage === 'ENEMY' ? 'ink-cinnabar' : ''">
          {{ store.activeBattle.stanceBanner.description }}
        </span>
      </div>
    </div>

    <!-- ==================== 状态 B：日常山河打坐舞台 ==================== -->
    <div v-else class="relative z-10 space-y-2.5">
      <div class="flex items-center justify-between gap-2 border-b border-[var(--border-ink)] pb-1.5">
        <div class="flex items-center gap-2 min-w-0 text-xs">
          <span class="font-brush text-lg leading-none">{{ store.currentMap.name }}</span>
          <span class="ink-muted">· {{ weatherMoodLabel }}</span>
          <span
            class="text-[11px] px-1.5 py-0.2 border"
            :class="
              store.currentMap.safety === 'PEACE'
                ? 'ink-jade border-[var(--border-ink)]'
                : 'ink-cinnabar border-[var(--accent-cinnabar)]/40'
            "
          >
            {{ store.currentMap.safety === 'PEACE' ? '和平共修' : '纷争险境' }}
          </span>
          <span v-if="store.player.coCultivatePartner" class="ink-jade truncate">
            · 与「{{ store.player.coCultivatePartner }}」共修 (+15%)
          </span>
        </div>

        <div class="flex items-center gap-2.5 text-xs shrink-0">
          <span v-if="store.player.bountyUntil" class="ink-cinnabar font-bold">
            [海捕悬赏中]
          </span>
          <span v-if="store.activeTrioSynergy" class="ink-gold">
            羁绊 · {{ store.activeTrioSynergy.name }}
          </span>
          <span v-else-if="store.isWandererMasteryActive" class="ink-muted">
            散人 · 百家里手
          </span>
        </div>
      </div>

      <!-- 中央三人吐纳席 -->
      <div class="relative flex items-end justify-center gap-5 py-0.5">
        <div class="w-32">
          <PortraitCard
            v-if="leftComp"
            :name="leftComp.name"
            :subtitle="`左翼 · ${leftComp.assistSkillName}`"
            :style-type="leftComp.portraitStyle"
            size="md"
          />
          <div v-else class="wuxia-elevated h-26 flex items-center justify-center text-xs ink-muted">
            左翼虚位
          </div>
        </div>

        <div class="w-38 z-10">
          <PortraitCard
            :name="store.player.nickname"
            :subtitle="`${store.currentSect?.name ?? '逍遥散人'} · ${store.currentRealm.name}`"
            style-type="hero_sword"
            is-main
            size="md"
          />
        </div>

        <div class="w-32">
          <PortraitCard
            v-if="rightComp"
            :name="rightComp.name"
            :subtitle="`右翼 · ${rightComp.assistSkillName}`"
            :style-type="rightComp.portraitStyle"
            size="md"
          />
          <div v-else class="wuxia-elevated h-26 flex items-center justify-center text-xs ink-muted">
            右翼虚位
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
