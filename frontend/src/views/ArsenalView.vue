<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS, ITEMS, SKILLS } from '@/config/gameData'
import type { SkillSlotType, StanceType } from '@/network/protocol'

const store = useGameStore()
const subView = ref<'SKILLS' | 'SQUAD' | 'EQUIP'>('SKILLS')

const stanceOptions: { k: StanceType; t: string; d: string }[] = [
  { k: 'FIERCE', t: '刚猛强攻势', d: '克「奇门极速」，一力降十会爆发 +25%' },
  { k: 'AGILE', t: '奇门极速势', d: '克「太极柔化」，唯快不破暴击 +25%' },
  { k: 'TAICHI', t: '太极柔化势', d: '克「刚猛强攻」，借力卸劲反震 +25%' },
]

const intDiscountPct = computed(() =>
  Math.round((store.player.stats.intStat / (store.player.stats.intStat + 180)) * 100)
)

const skillSlots: { slot: SkillSlotType; key: 'innerSkillId' | 'outerSkillId' | 'lightSkillId' | 'ultSkillId'; label: string }[] = [
  { slot: 'INNER', key: 'innerSkillId', label: '内功心法' },
  { slot: 'OUTER', key: 'outerSkillId', label: '外功招式' },
  { slot: 'LIGHT', key: 'lightSkillId', label: '轻功身法' },
  { slot: 'ULT', key: 'ultSkillId', label: '绝技奥义' },
]

function availableSkillsBySlot(slot: SkillSlotType) {
  return Object.values(SKILLS).filter((s) => s.slot === slot && (store.learnedSkills[s.id] ?? 0) > 0)
}

const leftCompanions = computed(() =>
  Object.values(COMPANIONS).filter((c) => c.role === 'LEFT' && store.companionAffinity[c.id]?.recruited)
)
const rightCompanions = computed(() =>
  Object.values(COMPANIONS).filter((c) => c.role === 'RIGHT' && store.companionAffinity[c.id]?.recruited)
)

const ownedItemsDetail = computed(() => store.ownedItemIds.map((id) => ITEMS[id]).filter(Boolean))

function isEquipped(itemId: string) {
  const l = store.currentLoadout
  return l.weaponId === itemId || l.armorId === itemId || l.accId === itemId || l.relicBookId === itemId
}
</script>

<template>
  <div class="wuxia-card p-3.5 h-full min-h-0 flex flex-col gap-3 overflow-hidden">
    <div class="flex items-center justify-between border-b border-[var(--border-ink)] pb-2 shrink-0">
      <div class="flex items-center gap-1.5 text-xs">
        <button
          @click="subView = 'SKILLS'"
          class="px-3 py-1 cursor-pointer transition"
          :class="subView === 'SKILLS' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
        >
          四维武学与三才架势
        </button>
        <button
          @click="subView = 'SQUAD'"
          class="px-3 py-1 cursor-pointer transition"
          :class="subView === 'SQUAD' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
        >
          三人行左右翼编队
        </button>
        <button
          @click="subView = 'EQUIP'"
          class="px-3 py-1 cursor-pointer transition"
          :class="subView === 'EQUIP' ? 'tab-gold font-bold' : 'token-btn ink-muted'"
        >
          神兵宝甲行囊 ({{ ownedItemsDetail.length }})
        </button>
      </div>
      <span class="text-xs ink-jade">悟性减免参悟消耗 -{{ intDiscountPct }}%</span>
    </div>

    <!-- 1. 四维武学与三才架势 -->
    <div v-if="subView === 'SKILLS'" class="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
      <div class="grid grid-cols-3 gap-2 text-xs">
        <button
          v-for="st in stanceOptions"
          :key="st.k"
          @click="store.currentLoadout.stance = st.k"
          class="p-2.5 text-left cursor-pointer transition"
          :class="store.currentLoadout.stance === st.k ? 'tab-gold' : 'wuxia-elevated hover:border-[var(--border-gold)]'"
        >
          <div class="font-bold">{{ st.t }}</div>
          <div class="text-[11px] ink-muted mt-0.5">{{ st.d }}</div>
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2.5 text-xs">
        <div
          v-for="sl in skillSlots"
          :key="sl.slot"
          class="wuxia-elevated p-3 space-y-2 flex flex-col justify-between"
        >
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-bold ink-gold">{{ sl.label }}</span>
              <span class="text-[11px] ink-muted">已习 {{ availableSkillsBySlot(sl.slot).length }} 门</span>
            </div>

            <select
              v-model="store.currentLoadout[sl.key]"
              class="w-full border border-[var(--border-ink)] bg-transparent px-2 py-1.5 font-bold focus:outline-none focus:border-[var(--border-gold)] cursor-pointer"
            >
              <option
                v-for="sk in availableSkillsBySlot(sl.slot)"
                :key="sk.id"
                :value="sk.id"
                class="bg-stone-900 text-stone-200"
              >
                《{{ sk.name }}》(第 {{ store.learnedSkills[sk.id] }} 重)
              </option>
            </select>

            <p v-if="store.currentLoadout[sl.key] && SKILLS[store.currentLoadout[sl.key]!]" class="text-[11px] ink-muted leading-relaxed">
              {{ SKILLS[store.currentLoadout[sl.key]!].desc }}
            </p>
          </div>

          <div
            v-if="store.currentLoadout[sl.key] && SKILLS[store.currentLoadout[sl.key]!]"
            class="flex items-center justify-between pt-1.5 border-t border-[var(--border-subtle)]"
          >
            <span class="text-[11px] ink-muted">
              火候：第 {{ store.learnedSkills[store.currentLoadout[sl.key]!] }} / 10 重
            </span>
            <button
              @click="store.upgradeSkillMastery(store.currentLoadout[sl.key]!)"
              class="token-btn px-2.5 py-0.5 font-semibold cursor-pointer"
            >
              参悟升重
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 左右翼伙伴与羁绊共鸣 -->
    <div v-else-if="subView === 'SQUAD'" class="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1 text-xs">
      <div
        v-if="store.activeTrioSynergy"
        class="wuxia-elevated p-2.5 border-l-2 border-l-[var(--border-gold)] ink-gold"
      >
        已激活三人行共鸣「{{ store.activeTrioSynergy.name }}」：{{ store.activeTrioSynergy.bonusText }}
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="wuxia-elevated p-3 space-y-2">
          <div class="font-bold ink-gold">左翼 · 破阵护卫位（挡刀/合击）</div>
          <div class="space-y-1.5">
            <label
              v-for="c in leftCompanions"
              :key="c.id"
              class="flex items-start gap-2 p-2 border cursor-pointer transition"
              :class="store.currentLoadout.leftCompanionId === c.id ? 'tab-gold' : 'border-[var(--border-subtle)] hover:border-[var(--border-ink)]'"
            >
              <input
                type="radio"
                :value="c.id"
                v-model="store.currentLoadout.leftCompanionId"
                class="mt-0.5 accent-[#c8a66b]"
              />
              <div>
                <div class="font-bold">{{ c.name }} · <span class="ink-muted font-normal">{{ c.assistSkillName }}</span></div>
                <div class="text-[11px] ink-muted">{{ c.assistDesc }}</div>
              </div>
            </label>
          </div>
        </div>

        <div class="wuxia-elevated p-3 space-y-2">
          <div class="font-bold ink-jade">右翼 · 奇策辅助位（控场/卸劲）</div>
          <div class="space-y-1.5">
            <label
              v-for="c in rightCompanions"
              :key="c.id"
              class="flex items-start gap-2 p-2 border cursor-pointer transition"
              :class="store.currentLoadout.rightCompanionId === c.id ? 'tab-gold' : 'border-[var(--border-subtle)] hover:border-[var(--border-ink)]'"
            >
              <input
                type="radio"
                :value="c.id"
                v-model="store.currentLoadout.rightCompanionId"
                class="mt-0.5 accent-[#c8a66b]"
              />
              <div>
                <div class="font-bold">{{ c.name }} · <span class="ink-muted font-normal">{{ c.assistSkillName }}</span></div>
                <div class="text-[11px] ink-muted">{{ c.assistDesc }}</div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 神兵宝甲行囊 -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 gap-2.5 content-start pr-1 text-xs">
      <div
        v-for="it in ownedItemsDetail"
        :key="it.id"
        class="wuxia-elevated p-3 flex flex-col justify-between gap-2"
        :class="isEquipped(it.id) ? 'border-[var(--border-gold)]' : ''"
      >
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-bold text-sm">「{{ it.name }}」</span>
            <span class="text-[10px] ink-muted border border-[var(--border-ink)] px-1.5 py-0.2">{{ it.slot }}</span>
          </div>
          <p class="text-[11px] ink-muted">{{ it.desc }}</p>
          <div v-if="it.reqStat" class="text-[11px] ink-gold">
            门槛：{{ it.reqStat.label }}
          </div>
          <div v-if="it.signatureEffect" class="text-[11px] ink-cinnabar">
            {{ it.signatureEffect }}
          </div>
        </div>

        <div class="flex justify-end pt-1.5 border-t border-[var(--border-subtle)]">
          <span v-if="isEquipped(it.id)" class="text-[11px] font-bold ink-gold">
            当前已披挂
          </span>
          <button
            v-else
            @click="store.equipItem(it.id)"
            class="token-btn px-3 py-1 font-semibold cursor-pointer"
          >
            佩带装备
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
