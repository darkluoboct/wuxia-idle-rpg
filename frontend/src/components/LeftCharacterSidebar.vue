<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { ITEMS, REALMS, SKILLS } from '@/config/gameData'
import { getStanceLabel } from '@/network/mockEngine'

const store = useGameStore()
const usePill = ref(false)

const nextRealm = computed(() => REALMS.find((r) => r.tier === store.player.realmTier + 1) ?? null)
const breakSuccessRate = computed(() => {
  if (!nextRealm.value) return 100
  const bonus = usePill.value && store.pillCount > 0 ? 25 : 0
  return Math.min(
    100,
    Math.round(nextRealm.value.baseBreakRate + store.player.stats.con * 0.3 + store.player.breakPityRate + bonus)
  )
})

const expPercent = computed(() =>
  Math.min(100, Math.round((store.player.qiExp / Math.max(1, store.player.nextLevelQi)) * 100))
)

const equippedSummary = computed(() => {
  const l = store.currentLoadout
  return [
    { label: '内', name: l.innerSkillId ? SKILLS[l.innerSkillId]?.name : '未习', id: l.innerSkillId, kind: 'skill' as const },
    { label: '外', name: l.outerSkillId ? SKILLS[l.outerSkillId]?.name : '未习', id: l.outerSkillId, kind: 'skill' as const },
    { label: '轻', name: l.lightSkillId ? SKILLS[l.lightSkillId]?.name : '未习', id: l.lightSkillId, kind: 'skill' as const },
    { label: '绝', name: l.ultSkillId ? SKILLS[l.ultSkillId]?.name : '未习', id: l.ultSkillId, kind: 'skill' as const },
    { label: '兵', name: l.weaponId ? ITEMS[l.weaponId]?.name : '空手', id: l.weaponId, kind: 'item' as const },
    { label: '甲', name: l.armorId ? ITEMS[l.armorId]?.name : '布衣', id: l.armorId, kind: 'item' as const },
  ]
})
</script>

<template>
  <div class="wuxia-card p-3 h-full min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
    <!-- 顶部：侠客名帖与素雅丹田气海环 -->
    <div class="space-y-2.5 border-b border-[var(--border-ink)] pb-2.5 shrink-0">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-brush text-xl leading-none truncate">{{ store.player.nickname }}</span>
            <span class="text-[10px] px-1.5 py-0.5 tab-gold leading-none shrink-0">
              {{ store.currentSect ? store.currentSect.name : '逍遥散人' }}
            </span>
          </div>
          <div class="text-[11px] ink-muted mt-1.5">
            第{{ store.player.realmTier }}重 · <span class="text-[var(--text-ink)] font-semibold">{{ store.currentRealm.name }}</span> · Lv.{{ store.player.level }}
          </div>
        </div>

        <div class="text-right shrink-0">
          <div class="text-[10px] ink-muted leading-none">江湖战力</div>
          <div class="text-sm font-bold ink-gold tabular-nums mt-1">
            {{ store.derivedStats.combatPower.toLocaleString() }}
          </div>
        </div>
      </div>

      <!-- 极简暗金丹田气海环 + 收功/周天按钮 -->
      <div class="flex items-center gap-3">
        <button
          @click="store.settleOfflineQi()"
          class="relative w-[50px] h-[50px] rounded-full border border-[var(--border-gold)] overflow-hidden shrink-0 flex items-center justify-center cursor-pointer bg-[var(--bg-elevated)] hover:opacity-90 transition"
          title="点击丹田气海立即收功聚气"
        >
          <div
            class="absolute bottom-0 left-0 right-0 bg-[var(--gold-soft)] border-t border-[var(--border-gold)] transition-all duration-500"
            :style="{ height: `${expPercent}%` }"
          />
          <div class="relative z-10 text-center leading-none">
            <div class="text-[11px] font-bold ink-gold tabular-nums">{{ expPercent }}%</div>
            <div class="text-[9px] ink-muted mt-0.5">丹田</div>
          </div>
        </button>

        <div class="flex-1 min-w-0 space-y-1.5">
          <div class="text-[11px] tabular-nums leading-tight space-y-0.5">
            <div class="flex items-center justify-between">
              <span class="ink-muted">吐纳效率</span>
              <span class="ink-jade font-semibold">+{{ store.effectiveQiPerHour.toLocaleString() }}/时</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="ink-muted">储气进度</span>
              <span class="truncate">{{ store.player.qiExp.toLocaleString() }} / {{ store.player.nextLevelQi.toLocaleString() }}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-1.5 text-[11px]">
            <button
              @click="store.settleOfflineQi()"
              class="token-btn py-1 cursor-pointer"
            >
              凝神收功
            </button>
            <button
              @click="store.upgradeLevel()"
              class="tab-gold py-1 font-bold cursor-pointer hover:opacity-90 transition"
            >
              运转周天
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 中部：去方框化的经脉冲穴与属性账册 -->
    <div class="space-y-3 flex-1 min-h-0 overflow-y-auto pr-0.5">
      <!-- 破境冲穴（去外框，仅用左侧暗金竖线归组） -->
      <div v-if="nextRealm" class="border-l-2 border-[var(--border-gold)] pl-2.5 py-0.5 space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-bold">冲穴 · {{ nextRealm.name }}</span>
          <span class="ink-gold font-semibold tabular-nums text-[11px]">成率 {{ breakSuccessRate }}%</span>
        </div>
        <div class="text-[11px] ink-muted leading-snug">
          {{ nextRealm.meridian }} · {{ nextRealm.unlockDesc }}
        </div>
        <label class="flex items-center gap-1.5 cursor-pointer select-none text-[11px] ink-muted hover:text-[var(--text-ink)]">
          <input type="checkbox" v-model="usePill" class="accent-[#c8a66b]" />
          <span>佐服九花玉露丸 (+25%，余 {{ store.pillCount }})</span>
        </label>
        <button
          @click="store.attemptBreakthrough(usePill)"
          class="token-btn w-full py-1 text-[11px] font-semibold cursor-pointer"
        >
          冲击生死玄关 (保底 +{{ store.player.breakPityRate }}%)
        </button>
      </div>

      <!-- 经脉攻防与先天六维（彻底去套娃方框，改用清爽细横线对齐） -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-[11px] border-b border-[var(--border-ink)] pb-1">
          <span class="ink-muted">经脉根基</span>
          <span class="ink-gold">{{ getStanceLabel(store.currentLoadout.stance) }}</span>
        </div>

        <div class="grid grid-cols-2 gap-x-4 text-[11px] tabular-nums">
          <div class="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span class="ink-muted">气血</span><b>{{ store.derivedStats.maxHp.toLocaleString() }}</b>
          </div>
          <div class="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span class="ink-muted">内力</span><b>{{ store.derivedStats.maxMp.toLocaleString() }}</b>
          </div>
          <div class="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span class="ink-muted">外攻</span><b>{{ store.derivedStats.atk }}</b>
          </div>
          <div class="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span class="ink-muted">护体</span><b>{{ store.derivedStats.def }}</b>
          </div>
          <div class="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span class="ink-muted">闪避</span><b>{{ store.derivedStats.dodge }}%</b>
          </div>
          <div class="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span class="ink-muted">暴击</span><b>{{ store.derivedStats.crit }}%</b>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-x-2 gap-y-1 text-[11px] tabular-nums pt-1">
          <div class="flex justify-between px-1"><span class="ink-muted">臂力</span><b>{{ store.player.stats.str }}</b></div>
          <div class="flex justify-between px-1"><span class="ink-muted">根骨</span><b>{{ store.player.stats.con }}</b></div>
          <div class="flex justify-between px-1"><span class="ink-muted">身法</span><b>{{ store.player.stats.agi }}</b></div>
          <div class="flex justify-between px-1"><span class="ink-muted">悟性</span><b>{{ store.player.stats.intStat }}</b></div>
          <div class="flex justify-between px-1"><span class="ink-muted">福缘</span><b>{{ store.player.stats.luck }}</b></div>
          <div class="flex justify-between px-1">
            <span class="ink-muted">侠义</span>
            <b :class="store.player.stats.karma < 0 ? 'ink-cinnabar' : ''">{{ store.player.stats.karma }}</b>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部：去框化的披挂名录 + 三套预设 -->
    <div class="border-t border-[var(--border-ink)] pt-2 space-y-2 shrink-0">
      <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <button
          v-for="eq in equippedSummary"
          :key="eq.label"
          @click="eq.id ? store.inspectById(eq.kind, eq.id) : (store.activeTab = 'ARSENAL')"
          class="py-0.5 flex items-center gap-1.5 truncate hover:text-[var(--accent-gold)] cursor-pointer text-left transition"
          title="点击查看详情"
        >
          <span class="ink-muted shrink-0">{{ eq.label }} ·</span>
          <span class="truncate">{{ eq.name }}</span>
        </button>
      </div>

      <div class="grid grid-cols-3 gap-1 text-[11px]">
        <button
          v-for="idx in ([1, 2, 3] as const)"
          :key="idx"
          @click="store.player.activePresetIdx = idx"
          class="py-1 px-1 text-center truncate cursor-pointer transition"
          :class="store.player.activePresetIdx === idx ? 'tab-gold font-bold' : 'token-btn ink-muted'"
        >
          {{ store.presets[idx].name.split('·')[1] || `预设${idx}` }}
        </button>
      </div>
    </div>
  </div>
</template>
