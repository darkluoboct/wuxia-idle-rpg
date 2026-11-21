import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

export const useGameClock = defineStore('wuxiaClock', () => {
  const page = typeof document === 'undefined' ? undefined : document
  const now = ref(Date.now())
  const minuteTick = computed(() => Math.floor(now.value / 60_000))
  const isPageVisible = ref(!page?.hidden)
  let timer: ReturnType<typeof setInterval> | undefined

  function sync() {
    const visible = !page?.hidden
    page?.documentElement.classList.toggle('page-hidden', !visible)
    if (visible) {
      now.value = Date.now()
      timer ??= setInterval(() => { now.value = Date.now() }, 5_000)
    } else {
      clearInterval(timer)
      timer = undefined
    }
    isPageVisible.value = visible
  }

  page?.addEventListener('visibilitychange', sync)
  sync()
  onScopeDispose(() => {
    clearInterval(timer)
    page?.removeEventListener('visibilitychange', sync)
    page?.documentElement.classList.remove('page-hidden')
  })

  return { now, minuteTick, isPageVisible }
})
