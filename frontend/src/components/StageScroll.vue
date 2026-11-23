<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { COMPANIONS, SKILLS } from '@/config/gameData'
import { TIER_META } from '@/config/uiMeta'
import type { SceneId } from '../../../shared/stageScripts.ts'
import InkFigure from './InkFigure.vue'
import InkScroll from './ui/InkScroll.vue'

/**
 * 关卡剧情卷轴（docs/27）：入关（末页「拔剑」开战）、首通结语（所得与下一回，章末再加一页本章回目）、重温，
 * 以及拜师这类不属于哪一回的剧情。外观与序章同一套水墨卷轴。
 */
const CN = ['一', '二', '三', '四', '五']
const store = useGameStore()
const scroll = computed(() => store.stageScroll!)
const page = ref(0)
watch(scroll, () => { page.value = 0 })
const pages = computed(() => scroll.value.pages)
const chapterEnd = computed(() => scroll.value.phase === 'AFTER' ? scroll.value.chapterEnd : undefined)
/** 章末多一页本章回目 */
const total = computed(() => pages.value.length + (chapterEnd.value ? 1 : 0))
const last = computed(() => page.value >= total.value - 1)
const onChapterPage = computed(() => !!chapterEnd.value && page.value >= pages.value.length)
const lastText = computed(() => page.value === pages.value.length - 1)
const current = computed(() => pages.value[Math.min(page.value, pages.value.length - 1)])
const head = computed(() => scroll.value.phase === 'TALE'
  ? { seal: scroll.value.seal, label: scroll.value.label, title: scroll.value.title, key: `tale-${scroll.value.title}` }
  : { ...scroll.value.stage, key: scroll.value.stage.key })

const SCENES: Record<SceneId, () => Promise<{ default: string }>> = {
  'jiaxing-dusk': () => import('@/assets/_optimized/scenes/jiaxing-dusk.webp'),
  'jiaxing-spring': () => import('@/assets/_optimized/scenes/jiaxing-spring.webp'),
  zhongnan: () => import('@/assets/_optimized/scenes/zhongnan.webp'),
  damo: () => import('@/assets/_optimized/scenes/damo.webp'),
  heizhao: () => import('@/assets/_optimized/scenes/heizhao.webp'),
}
const scene = ref<string>()
const sceneOf = (state: typeof store.stageScroll) => state?.phase === 'TALE' ? state.scene : state?.script.scene
watchEffect(() => {
  const id = sceneOf(scroll.value)
  scene.value = undefined
  if (id) void SCENES[id]().then((image) => { if (sceneOf(store.stageScroll) === id) scene.value = image.default })
})

const heading = computed(() => onChapterPage.value ? `第${CN[chapterEnd.value!.chapter - 1]}章 · ${chapterEnd.value!.title} · 完`
  : scroll.value.phase === 'AFTER' ? `${head.value.title} · 告捷` : head.value.title)
const rewards = computed(() => scroll.value.phase === 'AFTER' ? scroll.value.rewards : undefined)
const next = computed(() => scroll.value.phase === 'AFTER' ? scroll.value.next : undefined)

function advance() {
  if (!last.value) page.value++
  else if (scroll.value.phase === 'BEFORE') scroll.value.start()
  else store.closeStageScroll(false)
}
function skip() {
  if (scroll.value.phase === 'BEFORE') scroll.value.start()
  else page.value = total.value - 1
}
const primaryLabel = computed(() => !last.value ? '继续' : scroll.value.phase === 'BEFORE' ? '拔剑' : '收卷')
const busy = computed(() => scroll.value.phase === 'BEFORE' && (store.onlineActionBusy || store.isBattlePlaying))

const vFocus = { mounted: (el: HTMLElement) => el.focus() }
</script>

<template>
  <InkScroll :seal="head.seal" :label="head.label" labelledby="stage-scroll-title" :scene="scene"
    @keydown.esc="store.closeStageScroll(false)">
    <article :key="`${head.key}-${scroll.phase}-${page}`" class="ink-page stage-scroll">
      <h2 id="stage-scroll-title" class="font-brush">{{ heading }}</h2>

      <ol v-if="onChapterPage" class="stage-chapter" aria-label="本章回目">
        <li v-for="entry in chapterEnd!.entries" :key="entry.key">
          <b>{{ entry.title }}</b><span v-if="entry.recap">{{ entry.recap }}</span>
        </li>
      </ol>
      <div v-else-if="current.speaker" class="stage-voice">
        <div class="stage-figure"><InkFigure :style-type="current.portrait ?? 'hero_sword'" :name="current.speaker" /></div>
        <p><b>{{ current.speaker }}</b>「{{ current.text.replaceAll('\n', '') }}」</p>
      </div>
      <template v-else>
        <p v-for="(paragraph, i) in current.text.split('\n')" :key="i">{{ paragraph }}</p>
      </template>

      <div v-if="last && scroll.phase === 'BEFORE'" class="stage-foe">
        <div class="stage-figure"><InkFigure :style-type="scroll.stage.foe.portrait" :name="scroll.stage.foe.name" /></div>
        <div><small>对手</small><b>{{ scroll.stage.foe.name }}</b><span>{{ scroll.stage.foe.title }}</span></div>
      </div>

      <template v-if="scroll.phase === 'AFTER'">
        <section v-if="rewards && lastText" class="stage-gains" aria-label="所得">
          <h3>所得</h3>
          <ul>
            <li v-if="rewards.qiExp">真气 +{{ rewards.qiExp.toLocaleString() }}</li>
            <li v-if="rewards.silver">纹银 +{{ rewards.silver.toLocaleString() }}</li>
            <li v-if="rewards.karma">侠义 +{{ rewards.karma }}</li>
            <li v-for="it in rewards.items ?? []" :key="it.id" :class="TIER_META[it.tier].cls">
              <button type="button" @click="store.inspectById(SKILLS[it.id] ? 'skill' : 'item', it.id)">{{ it.name }}</button>
            </li>
            <li v-for="id in rewards.companions ?? []" :key="id">{{ COMPANIONS[id]?.name }}入队</li>
            <li v-if="rewards.title" class="stage-title-award">{{ rewards.title }}</li>
          </ul>
        </section>
        <section v-if="next && last" class="stage-next" :aria-label="next.newChapter ? '下一章' : '下一回'">
          <h3>{{ next.newChapter ? '下一章' : '下一回' }}</h3>
          <p v-if="next.hook">{{ next.hook }}</p>
          <p class="stage-next-name">{{ next.label }} · {{ next.title }}</p>
        </section>
      </template>

      <footer>
        <ol v-if="total > 1" class="ink-dots" aria-label="剧情进度">
          <li v-for="i in total" :key="i" :aria-current="i - 1 === page ? 'step' : undefined" />
        </ol>
        <span v-else class="mr-auto" />
        <button v-if="!last || scroll.phase === 'BEFORE'" class="ink-skip" :disabled="busy" @click="skip">跳过剧情</button>
        <button v-if="last && next" class="ink-skip" @click="store.closeStageScroll(true)">{{ next.newChapter ? '开启下一章' : '前往下一回' }}</button>
        <button v-focus class="ink-next" :disabled="busy" @click="advance">{{ primaryLabel }}</button>
      </footer>
    </article>
  </InkScroll>
</template>

<style scoped>
.stage-voice, .stage-foe { display: flex; align-items: center; gap: 1rem; }
.stage-voice p { margin: 0; font-size: 1.08rem; line-height: 1.9; color: #e4dccd; }
.stage-voice b { display: block; font-size: .95rem; color: #f0c2a8; }
.stage-figure { width: 4.4rem; height: 5.8rem; flex: none; overflow: hidden; border: 1px solid #c6a66a50; background: #0d1013; }
.stage-foe { margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid #c6a66a30; }
.stage-foe div:last-child { display: flex; flex-direction: column; gap: .2rem; }
.stage-foe small { font-size: .8rem; letter-spacing: .2em; color: #9e927c; }
.stage-foe b { font-size: 1.15rem; color: #f0c2a8; }
.stage-foe span { font-size: .9rem; color: #cfc5b2; }

.stage-gains, .stage-next { margin-top: 1.2rem; padding-top: .9rem; border-top: 1px solid #c6a66a30; }
.stage-gains h3, .stage-next h3 { margin: 0 0 .5rem; font-size: .8rem; font-weight: normal; letter-spacing: .3em; color: #9e927c; }
.stage-gains ul { display: flex; flex-wrap: wrap; gap: .4rem .9rem; margin: 0; padding: 0; list-style: none; font-size: .98rem; color: #e4dccd; }
.stage-gains button { text-decoration: underline; text-underline-offset: .2rem; }
.stage-title-award { color: #f4dfb1; }
.stage-next p { margin: 0; line-height: 1.8; color: #e4dccd; }
.stage-next-name { color: #f4dfb1 !important; }
.stage-chapter { display: grid; gap: .35rem; margin: 0; padding: 0; list-style: none; counter-reset: hui; }
.stage-chapter li { display: grid; grid-template-columns: 3.2rem minmax(0, 1fr); column-gap: .6rem; font-size: .92rem; line-height: 1.6; color: #cfc5b2; counter-increment: hui; }
.stage-chapter li::before { content: "第" counter(hui) "回"; grid-row: span 2; color: #9e927c; font-size: .82rem; padding-top: .1rem; }
.stage-chapter b { font-weight: normal; color: #f4dfb1; }
.stage-chapter span { font-size: .85rem; color: #b9ab90; }
</style>
