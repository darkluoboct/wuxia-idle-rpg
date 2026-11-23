import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export function readPreference(key: string) {
  try { return localStorage.getItem(`wuxia.${key}`) } catch { return null }
}

/** 关卡剧情演出：完整 / 只看关后结语 / 关闭（docs/27） */
export type StageScriptMode = 'FULL' | 'AFTER' | 'OFF'
const STAGE_SCRIPT_MODES: readonly StageScriptMode[] = ['FULL', 'AFTER', 'OFF']

export const useInterfacePrefs = defineStore('wuxiaInterface', () => {
  const isMidnightTheme = ref(readPreference('theme') !== 'paper')
  const sceneMotion = ref(readPreference('sceneMotion') !== 'off')
  const savedStageScripts = readPreference('stageScripts') as StageScriptMode | null
  const stageScripts = ref<StageScriptMode>(savedStageScripts && STAGE_SCRIPT_MODES.includes(savedStageScripts) ? savedStageScripts : 'FULL')

  function write(key: string, value: string) {
    try { localStorage.setItem(`wuxia.${key}`, value) } catch { /* 仍可在当前页面使用设置。 */ }
  }
  watch(isMidnightTheme, (dark) => {
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('theme-midnight', dark)
    write('theme', dark ? 'midnight' : 'paper')
  }, { flush: 'sync' })
  watch(sceneMotion, (moving) => write('sceneMotion', moving ? 'on' : 'off'), { flush: 'sync' })
  watch(stageScripts, (mode) => write('stageScripts', mode), { flush: 'sync' })

  return { isMidnightTheme, sceneMotion, stageScripts }
})
