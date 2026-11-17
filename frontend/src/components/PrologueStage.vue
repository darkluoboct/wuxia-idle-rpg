<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { IS_MOCK_MODE } from '@/network/apiClient'
import { COMPANIONS, ONLINE_STORY_CHAPTERS, STORY_CHAPTERS } from '@/config/gameData'
import { STANCE_META, stanceRelation } from '@/config/uiMeta'
import type { LoadoutPresetDTO } from '@/network/protocol'
import dusk from '@/assets/jiaxing-dusk.webp'
import InkFigure from './InkFigure.vue'
import { ORIGINS } from '../../../shared/origins.ts'

/**
 * 新手序章：新角色第一次进江湖时播放（docs/17 §六）。
 * 几页文字交代身世与破庙，最后一页教打法克制，随后打主线 1-1；打赢后由忘机客的剧情卡接上。
 * 选了家世的，楔子按家世讲，家人陪你进破庙、一起打这一战（docs/17 §七）。
 * 文字可以跳过，这一战不能跳过。
 */
const store = useGameStore()
const node = (IS_MOCK_MODE ? STORY_CHAPTERS : ONLINE_STORY_CHAPTERS)[0]
const foe = node.bossStance
const origin = computed(() => store.player.origin && ORIGINS[store.player.origin])
const ally = computed(() => origin.value && COMPANIONS[origin.value.companionId])

const pages = computed(() => {
  const story = origin.value?.prologue
  return [
    story ? { title: story.title, text: story.home.replace('{name}', store.player.nickname) } : {
      title: '楔子 · 寒门',
      text: `南宋嘉定年间，金兵压境，朝廷偏安临安。嘉兴城外有个少年人，名叫${store.player.nickname}，生来奇经郁结、六脉微弱。城里三家武馆都把你拒之门外：「这副身子骨，学不得武。」`,
    },
    {
      title: '风雨破庙',
      text: story?.temple ?? '这一夜风雨大作，你躲进城外一座破庙。神龛后头蜷着一位白发老者，浑身是血，怀里死死护着一只布包。他睁眼看了看你，嘴唇动了动，没说出话来。',
    },
    {
      title: '追兵',
      text: `庙门「砰」地被踹开，几个黑衣人提刀闯进来，火把把墙上的影子拉得老长。为首的冷笑：「老东西，东西交出来，给你留个全尸。」老者撑了两撑，又跌坐回去。${story?.stand ?? ''}你攥紧了手里的青钢剑。`,
    },
  ]
})
const page = ref(0)
const atStance = computed(() => page.value >= pages.value.length)
const current = computed(() => pages.value[Math.min(page.value, pages.value.length - 1)])

/** 出手的架势：三套预设各一种打法 */
const stances = computed(() => ([1, 2, 3] as const).map((idx) => {
  const preset: LoadoutPresetDTO = store.presets[idx]
  return { idx, stance: preset.stance, meta: STANCE_META[preset.stance], relation: stanceRelation(preset.stance, foe) }
}))
const chosen = ref<1 | 2 | 3>(stances.value.find(({ relation }) => relation === 'WIN')?.idx ?? 1)
const RELATION_TEXT = { WIN: '克制对手', LOSE: '被对手克制', EVEN: '旗鼓相当' } as const
const attempted = ref(false)
const busy = computed(() => store.onlineActionBusy || store.isBattlePlaying)

async function fight() {
  if (busy.value) return
  attempted.value = true
  if (store.player.activePresetIdx !== chosen.value) await store.switchLoadout(chosen.value)
  await store.challengeChapter(node.id)
}
</script>

<template>
  <section class="prologue" role="dialog" aria-modal="true" aria-labelledby="prologue-title">
    <img class="prologue-scene" :src="dusk" alt="" aria-hidden="true" />
    <div class="prologue-shade" aria-hidden="true" />

    <header class="prologue-head">
      <span class="prologue-seal">序章</span>
      <span>第一卷 · 射雕篇</span>
    </header>

    <article v-if="!atStance" :key="page" class="prologue-scroll">
      <h2 id="prologue-title" class="font-brush">{{ current.title }}</h2>
      <p>{{ current.text }}</p>
      <footer>
        <ol class="prologue-dots" aria-label="序章进度">
          <li v-for="(_, i) in pages" :key="i" :aria-current="i === page ? 'step' : undefined" />
        </ol>
        <button class="prologue-skip" @click="page = pages.length">跳过剧情</button>
        <button class="prologue-next" @click="page++">{{ page === pages.length - 1 ? '挺身而出' : '继续' }}</button>
      </footer>
    </article>

    <article v-else class="prologue-scroll prologue-duel">
      <h2 id="prologue-title" class="font-brush">{{ attempted ? '再来一次' : '拔剑' }}</h2>
      <div class="prologue-foe">
        <div class="prologue-figure"><InkFigure :style-type="node.bossPortrait" /></div>
        <div>
          <b>{{ node.bossName }}</b>
          <p>{{ attempted ? '刺客的刀光逼得你连连后退。老者在神龛后喘息：「别硬拼……看准他的身法。」' : `为首的刺客身法诡谲，出手全走${STANCE_META[foe].name}路数。` }}</p>
        </div>
      </div>
      <div v-if="origin && ally" class="prologue-foe prologue-ally">
        <div class="prologue-figure"><InkFigure :style-type="ally.portraitStyle" /></div>
        <div>
          <b>{{ origin.kin }} {{ ally.name }}</b>
          <p>与你并肩。「{{ ally.assistSkillName }}」{{ ally.assistDesc }}</p>
        </div>
      </div>
      <p class="prologue-rule">
        刚猛克奇门，奇门克太极，太极克刚猛。克制对手时，你出招伤害 +25%、受到的伤害 −18%；被克制时反过来吃亏。武库里的三套出战方案各用一种架势，选一套出手。
      </p>
      <div class="prologue-stances" role="radiogroup" aria-label="出手的架势">
        <button
          v-for="s in stances" :key="s.idx" role="radio" :aria-checked="chosen === s.idx" :data-relation="s.relation"
          @click="chosen = s.idx"
        >
          <b class="font-brush">{{ s.meta.name }}</b>
          <span>{{ s.meta.style }}</span>
          <em>{{ RELATION_TEXT[s.relation] }}</em>
        </button>
      </div>
      <footer>
        <span class="prologue-hint">这一战不能跳过</span>
        <button class="prologue-next" :disabled="busy" @click="fight">以{{ STANCE_META[store.presets[chosen].stance].name }}出手</button>
      </footer>
    </article>
  </section>
</template>

<style scoped>
.prologue {
  position: fixed; inset: 0; z-index: 75; isolation: isolate; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem;
  color: #eee6d8; background: #12171c; font-family: var(--font-body);
}
.prologue-scene { position: absolute; z-index: -2; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(.55) brightness(.62); animation: prologue-drift 30s ease-out both; }
.prologue-shade { position: absolute; z-index: -1; inset: 0; background: radial-gradient(ellipse 60% 70% at 50% 55%, #0c1014a0, #0a0d10ee 85%); }
.prologue-head { position: absolute; top: 1.4rem; left: 2rem; display: flex; align-items: center; gap: .7rem; font-size: .85rem; letter-spacing: .3em; color: #cdb88f; }
.prologue-seal { writing-mode: vertical-rl; padding: .3rem .15rem; border-radius: 45%; background: #9a2c2d; font-size: .8rem; letter-spacing: .1em; color: #f6e6c8; box-shadow: inset 0 0 0 1px #d57e6850; }

.prologue-scroll {
  width: min(44rem, 100%); padding: 2.2rem 2.6rem 1.6rem;
  border-block: 1px solid #c6a66a70; background: linear-gradient(180deg, #161b20e6, #12161bf2);
  box-shadow: 0 1.5rem 3rem -1rem #000c; animation: prologue-in .5s ease-out both;
}
.prologue-scroll h2 { margin: 0 0 1rem; font-size: 2.4rem; line-height: 1.1; color: #f4dfb1; letter-spacing: .06em; }
.prologue-scroll > p { margin: 0; font-size: 1.12rem; line-height: 2; color: #e4dccd; text-wrap: pretty; }
.prologue-scroll footer { display: flex; align-items: center; gap: 1rem; margin-top: 1.6rem; }

.prologue-dots { display: flex; gap: .45rem; margin: 0 auto 0 0; padding: 0; list-style: none; }
.prologue-dots li { width: .45rem; height: .45rem; border-radius: 50%; background: #c6a66a55; }
.prologue-dots li[aria-current] { background: #e6c88a; }
.prologue-skip { font-size: .9rem; color: #b9ab90; text-decoration: underline; text-underline-offset: .25rem; }
.prologue-skip:hover { color: #f4dfb1; }
.prologue-next {
  min-width: 9rem; min-height: 2.8rem; padding: 0 1.4rem; border: 1px solid #e0b46a; border-radius: 2px;
  background: linear-gradient(180deg, #a8332c, #7e2420); color: #fbefd6; font: 1.35rem/1 var(--font-brush); letter-spacing: .08em;
  box-shadow: inset 0 0 0 1px #f0c08a40, 0 .5rem 1rem -.5rem #000;
}
.prologue-next:hover:not(:disabled) { filter: brightness(1.12); }
.prologue-next:disabled { opacity: .55; cursor: wait; }
.prologue-next:focus-visible, .prologue-skip:focus-visible, .prologue-stances button:focus-visible { outline: 2px solid #f4dfb1; outline-offset: 3px; }

.prologue-duel { padding-top: 1.8rem; }
.prologue-foe { display: flex; align-items: center; gap: 1rem; margin-bottom: .9rem; }
.prologue-figure { width: 4.4rem; height: 5.8rem; flex: none; overflow: hidden; border: 1px solid #c6a66a50; background: #0d1013; }
.prologue-foe b { font-size: 1.15rem; color: #f0c2a8; }
.prologue-foe p { margin: .35rem 0 0; line-height: 1.7; color: #e4dccd; }
.prologue-ally b { color: #8fd1b8; }
.prologue-ally p { font-size: .95rem; color: #cfc5b2; }
.prologue-rule { margin: 0 0 1rem; padding: .7rem .9rem; border-left: 2px solid #c6a66a; background: #0e1216a8; font-size: .95rem; line-height: 1.75; color: #cfc5b2; }
.prologue-stances { display: grid; grid-template-columns: repeat(3, 1fr); gap: .7rem; }
.prologue-stances button {
  display: flex; flex-direction: column; align-items: flex-start; gap: .25rem; padding: .75rem .9rem;
  border: 1px solid #c6a66a40; background: #0e1216c0; text-align: left; color: #d8cfbf;
}
.prologue-stances button:hover { border-color: #c6a66a90; }
.prologue-stances button[aria-checked="true"] { border-color: #e6c88a; background: #2a2418d0; box-shadow: inset 0 0 0 1px #e6c88a60; }
.prologue-stances b { font-size: 1.6rem; line-height: 1; color: #f4dfb1; }
.prologue-stances span { font-size: .85rem; color: #b9ab90; }
.prologue-stances em { font-style: normal; font-size: .85rem; }
.prologue-stances [data-relation="WIN"] em { color: #8fd1b8; }
.prologue-stances [data-relation="LOSE"] em { color: #ec8a7c; }
.prologue-stances [data-relation="EVEN"] em { color: #b9ab90; }
.prologue-hint { margin-right: auto; font-size: .85rem; color: #9e927c; }

@keyframes prologue-in { from { opacity: 0; transform: translateY(.6rem); } to { opacity: 1; transform: none; } }
@keyframes prologue-drift { from { transform: scale(1.08); } to { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .prologue-scene, .prologue-scroll { animation: none; } }
@media (max-width: 640px) {
  .prologue { padding: 1rem; }
  .prologue-head { left: 1rem; }
  .prologue-scroll { padding: 1.6rem 1.2rem 1.2rem; }
  .prologue-scroll h2 { font-size: 2rem; }
  .prologue-scroll > p { font-size: 1rem; }
  .prologue-stances { grid-template-columns: 1fr; }
}
</style>
