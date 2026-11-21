<script setup lang="ts">
defineProps<{ variant: 'login' | 'selection' }>()
</script>

<template>
  <div class="scene-petals" :data-variant="variant" aria-hidden="true">
    <i v-for="petal in (variant === 'selection' ? 9 : 7)" :key="petal" :style="{ '--petal': petal }" />
  </div>
</template>

<style scoped>
.scene-petals { position: absolute; inset: 0; z-index: 3; overflow: hidden; pointer-events: none; }
.scene-petals i {
  position: absolute;
  top: -3%;
  left: calc(var(--petal) * 13%);
  width: calc(6px + var(--petal) * .6px);
  height: 6px;
  border-radius: 90% 10% 80% 20%;
  background: #f4b8cb;
  opacity: 0;
  --petal-drift: calc(120px + var(--petal) * 18px);
  animation: petal-fall calc(13s + var(--petal) * 1.2s) calc(var(--petal) * -3s) linear infinite;
}
.scene-petals[data-variant="selection"] i {
  left: calc(var(--petal) * 11%);
  width: calc(5px + var(--petal) * .7px);
  background: #f6c6dc;
  box-shadow: 0 0 5px #ffe3f244;
  --petal-drift: calc(80px + var(--petal) * 17px);
  animation-duration: calc(11s + var(--petal) * 1.3s);
  animation-delay: calc(var(--petal) * -2.7s);
}
@keyframes petal-fall {
  0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(0); }
  10% { opacity: .8; }
  90% { opacity: .6; }
  100% { opacity: 0; transform: translate3d(var(--petal-drift), 105dvh, 0) rotate(400deg); }
}
@media (prefers-reduced-motion: reduce) { .scene-petals { display: none; } }
:global(.page-hidden) .scene-petals i { animation-play-state: paused; }
</style>
