<script setup lang="ts">
/** 全局底景：极淡的远山 + 一轮淡月，铺在整个应用之后，让面板之间的“留白”不是死黑 */
</script>

<template>
  <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
    <div
      class="absolute inset-0"
      style="background:
        radial-gradient(ellipse 70% 50% at 82% 8%, color-mix(in srgb, var(--gold) 9%, transparent), transparent 70%),
        radial-gradient(ellipse 90% 60% at 10% 100%, color-mix(in srgb, var(--jade) 6%, transparent), transparent 70%)"
    />
    <svg viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice" class="absolute inset-x-0 bottom-0 h-[45%] w-full text-ink opacity-[0.045]">
      <path d="M0,260 Q120,170 240,240 T480,200 T720,250 T960,190 T1200,240 L1200,400 L0,400 Z" fill="currentColor" />
      <path d="M0,330 Q200,270 400,320 T800,300 T1200,326 L1200,400 L0,400 Z" fill="currentColor" />
    </svg>
    <div class="absolute right-[9%] top-[7%] h-[min(16vw,9rem)] w-[min(16vw,9rem)] rounded-full border border-gold opacity-[0.12]" />
  </div>
</template>
