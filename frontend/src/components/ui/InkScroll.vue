<script setup lang="ts">
import dusk from '@/assets/_optimized/scenes/jiaxing-dusk.webp'

/** 整屏水墨卷轴的外壳：场景底图、遮罩与左上角的印章。序章与关卡剧情共用，页面内容放在默认插槽里 */
defineProps<{ seal: string; label: string; labelledby: string; scene?: string }>()
</script>

<template>
  <section class="ink-scroll" role="dialog" aria-modal="true" :aria-labelledby="labelledby">
    <img class="ink-scroll-scene" :src="scene ?? dusk" alt="" aria-hidden="true" />
    <div class="ink-scroll-shade" aria-hidden="true" />
    <header class="ink-scroll-head">
      <span class="ink-scroll-seal">{{ seal }}</span>
      <span>{{ label }}</span>
    </header>
    <slot />
  </section>
</template>

<!-- 不加 scoped：插槽里的卷面（.ink-page 及其按钮）也用这里的样式 -->
<style>
.ink-scroll {
  position: fixed; inset: 0; z-index: 75; isolation: isolate; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem;
  color: #eee6d8; background: #12171c; font-family: var(--font-body);
}
.ink-scroll-scene { position: absolute; z-index: -2; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(.55) brightness(.62); animation: ink-scroll-drift 30s ease-out both; }
.ink-scroll-shade { position: absolute; z-index: -1; inset: 0; background: radial-gradient(ellipse 60% 70% at 50% 55%, #0c1014a0, #0a0d10ee 85%); }
.ink-scroll-head { position: absolute; top: 1.4rem; left: 2rem; display: flex; align-items: center; gap: .7rem; font-size: .85rem; letter-spacing: .3em; color: #cdb88f; }
.ink-scroll-seal { writing-mode: vertical-rl; padding: .3rem .15rem; border-radius: 45%; background: #9a2c2d; font-size: .8rem; letter-spacing: .1em; color: #f6e6c8; box-shadow: inset 0 0 0 1px #d57e6850; }

.ink-page {
  width: min(44rem, 100%); max-height: calc(100dvh - 6rem); overflow-y: auto; padding: 2.2rem 2.6rem 1.6rem;
  border-block: 1px solid #c6a66a70; background: linear-gradient(180deg, #161b20e6, #12161bf2);
  box-shadow: 0 1.5rem 3rem -1rem #000c; animation: ink-page-in .5s ease-out both;
}
.ink-page h2 { margin: 0 0 1rem; font-size: 2.4rem; line-height: 1.1; color: #f4dfb1; letter-spacing: .06em; }
.ink-page > p { margin: 0; font-size: 1.12rem; line-height: 2; color: #e4dccd; text-wrap: pretty; }
.ink-page > p + p { margin-top: .7rem; }
.ink-page footer { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin-top: 1.6rem; }

.ink-dots { display: flex; gap: .45rem; margin: 0 auto 0 0; padding: 0; list-style: none; }
.ink-dots li { width: .45rem; height: .45rem; border-radius: 50%; background: #c6a66a55; }
.ink-dots li[aria-current] { background: #e6c88a; }
.ink-skip { font-size: .9rem; color: #b9ab90; text-decoration: underline; text-underline-offset: .25rem; }
.ink-skip:hover { color: #f4dfb1; }
.ink-next {
  min-width: 9rem; min-height: 2.8rem; padding: 0 1.4rem; border: 1px solid #e0b46a; border-radius: 2px;
  background: linear-gradient(180deg, #a8332c, #7e2420); color: #fbefd6; font: 1.35rem/1 var(--font-brush); letter-spacing: .08em;
  box-shadow: inset 0 0 0 1px #f0c08a40, 0 .5rem 1rem -.5rem #000;
}
.ink-next:hover:not(:disabled) { filter: brightness(1.12); }
.ink-next:disabled { opacity: .55; cursor: wait; }
.ink-next:focus-visible, .ink-skip:focus-visible { outline: 2px solid #f4dfb1; outline-offset: 3px; }

@keyframes ink-page-in { from { opacity: 0; transform: translateY(.6rem); } to { opacity: 1; transform: none; } }
@keyframes ink-scroll-drift { from { transform: scale(1.08); } to { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .ink-scroll-scene, .ink-page { animation: none; } }
@media (max-width: 640px) {
  /* 靠上排，免得按钮落在底部的提示条下面 */
  .ink-scroll { justify-content: flex-start; padding: 4.2rem 1rem 1rem; }
  .ink-scroll-head { left: 1rem; }
  .ink-page { padding: 1.6rem 1.2rem 1.2rem; }
  .ink-page h2 { font-size: 2rem; }
  .ink-page > p { font-size: 1rem; }
}
</style>
