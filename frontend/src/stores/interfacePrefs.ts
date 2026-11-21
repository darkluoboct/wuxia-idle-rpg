import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export function readPreference(key: string) {
  try { return localStorage.getItem(`wuxia.${key}`) } catch { return null }
}

export const useInterfacePrefs = defineStore('wuxiaInterface', () => {
  const isMidnightTheme = ref(readPreference('theme') !== 'paper')
  const sceneMotion = ref(readPreference('sceneMotion') !== 'off')

  function write(key: string, value: string) {
    try { localStorage.setItem(`wuxia.${key}`, value) } catch { /* 仍可在当前页面使用设置。 */ }
  }
  watch(isMidnightTheme, (dark) => {
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('theme-midnight', dark)
    write('theme', dark ? 'midnight' : 'paper')
  }, { flush: 'sync' })
  watch(sceneMotion, (moving) => write('sceneMotion', moving ? 'on' : 'off'), { flush: 'sync' })

  return { isMidnightTheme, sceneMotion }
})
