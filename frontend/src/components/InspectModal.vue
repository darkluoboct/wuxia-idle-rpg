<script setup lang="ts">
import { useGameUiStore } from '@/stores/gameUiStore'
import { TIER_META } from '@/config/uiMeta'
import ItemIcon from './ItemIcon.vue'
import BaseModal from './ui/BaseModal.vue'

const store = useGameUiStore()
</script>

<template>
  <BaseModal v-if="store.inspectModal" open :title="store.inspectModal.title" size="md" @close="store.inspectModal = null">
    <div class="select-text" :class="TIER_META[store.inspectModal.tier].cls">
      <div class="h-1.5" style="background: linear-gradient(90deg, transparent, var(--tc), transparent)" />
      <div class="space-y-3 p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
          <ItemIcon v-if="store.inspectModal.itemId" :item-id="store.inspectModal.itemId" size="full"
              class="[--item-icon-size:3.25rem] [--item-illustration-size:clamp(4.5rem,16vh,7rem)]" />
            <div class="min-w-0">
              <span class="chip tier-chip">{{ TIER_META[store.inspectModal.tier].label }}</span>
              <h4 class="font-brush tier-text mt-2 text-[1.9rem] leading-tight">{{ store.inspectModal.title }}</h4>
              <div class="mt-1 text-xs text-ink3">{{ store.inspectModal.subtitle }}</div>
            </div>
          </div>
          <button autofocus class="btn btn-sm shrink-0" @click="store.inspectModal = null">关闭</button>
        </div>
        <p class="border-t border-line pt-3 text-[0.9375rem] leading-relaxed">{{ store.inspectModal.desc }}</p>
        <div v-if="store.inspectModal.tags?.length" class="flex flex-wrap gap-1.5" aria-label="武学特质标签">
          <span v-for="tag in store.inspectModal.tags" :key="tag.text" class="chip max-w-full whitespace-normal" :class="tag.chipClass">{{ tag.text }}</span>
        </div>
        <div v-if="store.inspectModal.notes?.length" class="space-y-1 border border-line bg-bg0/60 p-2.5 text-xs leading-relaxed text-ink2">
          <p v-for="note in store.inspectModal.notes" :key="note">{{ note }}</p>
        </div>
        <section v-if="store.inspectModal.masteryStages?.length" class="space-y-1.5 border border-line bg-bg0/60 p-2.5" aria-label="阶段质变">
          <div class="text-xs font-bold text-ink2">破境质变阶段</div>
          <ul class="space-y-1 text-xs leading-relaxed">
            <li v-for="stage in store.inspectModal.masteryStages" :key="stage.minMastery" class="flex flex-wrap items-baseline justify-between gap-x-2">
              <span :class="stage.state === 'current' ? 'font-bold text-gold' : stage.state === 'reached' ? 'text-jade' : 'text-ink2'">
                第 {{ stage.minMastery }} 重 · {{ stage.label }}：{{ stage.summary }}
              </span>
              <span v-if="stage.state !== 'preview'" class="chip"
                :class="stage.state === 'current' ? 'chip-gold' : stage.state === 'reached' ? 'chip-jade' : ''">
                {{ stage.state === 'current' ? '当前阶段' : stage.state === 'reached' ? '已破境' : '待破境' }}
              </span>
            </li>
          </ul>
        </section>
        <p v-if="store.inspectModal.extra" class="border-l-2 border-[var(--tc)] pl-3 text-sm italic leading-relaxed text-ink2">
          {{ store.inspectModal.extra }}
        </p>
      </div>
    </div>
  </BaseModal>
</template>
