<script setup lang="ts">
/** 人物卷：名帖 · 境界 · 六维雷达 · 战斗面板 · 披挂 · 配装预设 */
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { ITEMS, REALMS, SKILLS } from '@/config/gameData'
import { STANCE_META, TIER_META } from '@/config/uiMeta'
import RadarChart from './RadarChart.vue'

const store = useGameStore()
const p = computed(() => store.player)

const radarItems = computed(() => [
  { label: '臂力', value: p.value.stats.str },
  { label: '根骨', value: p.value.stats.con },
  { label: '身法', value: p.value.stats.agi },
  { label: '悟性', value: p.value.stats.intStat },
  { label: '福缘', value: p.value.stats.luck },
  { label: '侠义', value: p.value.stats.karma },
])

const combatRows = computed(() => {
  const d = store.derivedStats
  return [
    { k: '气血', v: d.maxHp.toLocaleString() },
    { k: '内力', v: d.maxMp.toLocaleString() },
    { k: '外攻', v: d.atk },
    { k: '护体', v: d.def },
    { k: '闪避', v: `${d.dodge}%` },
    { k: '暴击', v: `${d.crit}%` },
  ]
})

const expPct = computed(() => Math.min(100, Math.round((p.value.qiExp / Math.max(1, p.value.nextLevelQi)) * 100)))

type Slot = { glyph: string; label: string; name: string; id: string | null; kind: 'skill' | 'item'; tier?: keyof typeof TIER_META }
const slots = computed<Slot[]>(() => {
  const l = store.currentLoadout
  const sk = (id: string | null, glyph: string, label: string, empty: string): Slot => ({
    glyph, label, id, kind: 'skill', name: id ? SKILLS[id]?.name ?? empty : empty, tier: id ? SKILLS[id]?.tier : undefined,
  })
  const it = (id: string | null, glyph: string, label: string, empty: string): Slot => ({
    glyph, label, id, kind: 'item', name: id ? ITEMS[id]?.name ?? empty : empty, tier: id ? ITEMS[id]?.tier : undefined,
  })
  return [
    sk(l.innerSkillId, '内', '内功', '未习'),
    sk(l.outerSkillId, '外', '外功', '未习'),
    sk(l.lightSkillId, '轻', '轻功', '未习'),
    sk(l.ultSkillId, '绝', '绝技', '未习'),
    it(l.weaponId, '兵', '兵刃', '空手'),
    it(l.armorId, '甲', '衣甲', '布衣'),
  ]
})

const NUMERALS = ['', '壹', '贰', '叁']
const presetLabel = (idx: 1 | 2 | 3) => store.presets[idx].name.split('·')[1] || `预设${idx}`
const stance = computed(() => STANCE_META[store.currentLoadout.stance])
</script>

<template>
  <div class="panel flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3.5">
    <!-- 名帖 -->
    <header class="flex items-start gap-3">
      <span class="seal h-11 w-11 text-2xl">{{ p.nickname.slice(0, 1) }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="font-brush truncate text-2xl leading-none">{{ p.nickname }}</span>
          <span class="chip chip-gold">{{ store.currentSect ? store.currentSect.name : '逍遥散人' }}</span>
        </div>
        <div class="mt-1.5 text-sm text-ink2">
          <b class="font-semibold text-ink">{{ store.currentRealm.name }}</b>
          <span class="text-ink3"> · 第{{ p.realmTier }}重 · Lv.{{ p.level }}</span>
        </div>
      </div>
    </header>

    <!-- 战力 + 境界进度 -->
    <div class="well px-3 py-2.5">
      <div class="flex items-end justify-between">
        <div>
          <div class="text-xs text-ink3">江湖战力</div>
          <div class="font-brush text-[1.75rem] leading-none tabular-nums text-gold">{{ store.derivedStats.combatPower.toLocaleString() }}</div>
        </div>
        <div class="text-right text-xs text-ink3">
          <div>境界</div>
          <div class="mt-1 flex items-center gap-1" :title="`第${p.realmTier} / ${REALMS.length} 重`">
            <i
              v-for="r in REALMS" :key="r.tier" class="block h-1.5 w-1.5 rotate-45"
              :class="r.tier <= p.realmTier ? 'bg-goldfill' : 'border border-linestrong'"
            />
          </div>
        </div>
      </div>
      <div class="bar bar-thin bar-gold mt-2.5"><i :style="{ width: `${expPct}%` }" /></div>
      <div class="mt-1 flex justify-between text-xs tabular-nums text-ink3">
        <span>真气 {{ p.qiExp.toLocaleString() }}</span><span>{{ expPct }}%</span>
      </div>
    </div>

    <!-- 六维雷达 -->
    <div>
      <div class="sec-title mb-1 text-base">先天六维</div>
      <RadarChart :items="radarItems" class="!max-w-[14rem]" />
    </div>

    <!-- 战斗面板 -->
    <div>
      <div class="sec-title mb-1.5 text-base">
        战斗面板
        <span class="chip chip-gold ml-auto !text-[0.7rem]" :title="stance.hint">{{ stance.short }}势 · 克{{ STANCE_META[stance.beats].short }}</span>
      </div>
      <dl class="grid grid-cols-2 gap-x-4 text-sm tabular-nums">
        <div v-for="r in combatRows" :key="r.k" class="flex items-baseline justify-between border-b border-line py-0.5">
          <dt class="text-ink3">{{ r.k }}</dt>
          <dd class="font-bold">{{ r.v }}</dd>
        </div>
      </dl>
    </div>

    <!-- 披挂 -->
    <div>
      <div class="sec-title mb-1.5 text-base">披挂</div>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="s in slots" :key="s.label"
          class="well well-hover flex min-w-0 items-center gap-2 px-2 py-1.5 text-left"
          :class="s.tier ? [TIER_META[s.tier].cls, 'tier-edge'] : 'border-dashed'"
          :title="s.id ? `${TIER_META[s.tier!].label} · 点击查看` : '点击前往武库配置'"
          @click="s.id ? store.inspectById(s.kind, s.id) : (store.activeTab = 'ARSENAL')"
        >
          <span class="seal-gold seal h-5 w-5 shrink-0 text-xs">{{ s.glyph }}</span>
          <span class="truncate text-sm" :class="s.id ? 'tier-text font-semibold' : 'text-ink3'">{{ s.name }}</span>
        </button>
      </div>
    </div>

    <!-- 配装预设 -->
    <div class="mt-auto" role="radiogroup" aria-label="配装预设">
      <div class="grid grid-cols-3 gap-1">
        <button
          v-for="idx in ([1, 2, 3] as const)" :key="idx"
          class="btn btn-sm !min-h-[2.1rem] flex-col !gap-0 !px-1 leading-tight" :class="p.activePresetIdx === idx ? 'btn-gold' : '!text-ink2'"
          role="radio" :aria-checked="p.activePresetIdx === idx" @click="p.activePresetIdx = idx"
        >
          <span class="font-brush text-[0.7rem] opacity-70">{{ NUMERALS[idx] }}</span>
          <span class="max-w-full truncate">{{ presetLabel(idx) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
