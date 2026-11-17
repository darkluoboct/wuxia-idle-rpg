<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import InkFigure from './InkFigure.vue'

/** 玩法开放时的剧情卡：人物说几句话，末页列出新开放的内容，可顺路前往（shared/features.ts） */
const store = useGameStore()
const card = computed(() => store.featureCard!)
const page = ref(0)
watch(() => card.value.id, () => { page.value = 0 })
const last = computed(() => page.value >= card.value.pages.length - 1)

const vFocus = { mounted: (el: HTMLElement) => el.focus() }
</script>

<template>
  <div class="fixed inset-0 z-[72] flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px]">
    <article
      :key="card.id" class="panel anim-modal flex w-full max-w-xl gap-4 overflow-hidden p-5" role="dialog" aria-modal="true"
      aria-labelledby="feature-card-title" @keydown.esc="store.closeFeatureCard(false)"
    >
      <div class="hidden w-28 shrink-0 flex-col items-center gap-1.5 sm:flex">
        <div class="h-36 w-28 overflow-hidden border border-line bg-[var(--bg-1)]"><InkFigure :style-type="card.portrait" /></div>
        <b class="font-brush text-lg leading-none">{{ card.speaker }}</b>
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div class="flex items-center gap-2">
          <span class="seal h-7 w-7 shrink-0 text-base">{{ card.id === 'TRIAL' ? '序' : '启' }}</span>
          <h4 id="feature-card-title" class="font-brush text-2xl leading-tight text-gold">{{ card.title ?? `新机缘 · ${card.name}` }}</h4>
        </div>
        <p :key="page" class="anim-modal min-h-[6.5rem] text-[0.98rem] leading-loose text-ink">
          <b class="font-brush mr-1 text-ink2 sm:hidden">{{ card.speaker }}：</b>{{ card.pages[page] }}
        </p>
        <ul v-if="last" class="space-y-1 border-t border-line pt-2.5 text-sm" aria-label="新开放">
          <li v-for="line in card.opens" :key="line" class="flex gap-2"><span class="text-gold" aria-hidden="true">◆</span><span>{{ line }}</span></li>
        </ul>
        <div class="mt-auto flex items-center justify-between gap-2 pt-1">
          <span class="text-xs tabular-nums text-ink3">{{ page + 1 }} / {{ card.pages.length }}</span>
          <div class="flex gap-2">
            <template v-if="last && card.goto">
              <button class="btn" @click="store.closeFeatureCard(false)">知道了</button>
              <button v-focus class="btn btn-seal" @click="store.closeFeatureCard(true)">{{ card.goto.label }}</button>
            </template>
            <button v-else-if="last" v-focus class="btn btn-gold" @click="store.closeFeatureCard(false)">知道了</button>
            <button v-else v-focus class="btn btn-gold" @click="page++">继续</button>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>
