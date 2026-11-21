import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useInterfacePrefs } from '@/stores/interfacePrefs'

describe('界面偏好', () => {
  it('跨会话记忆主题和场景动态', () => {
    const prefs = useInterfacePrefs(createPinia())
    expect(prefs.isMidnightTheme).toBe(true)
    prefs.isMidnightTheme = false
    prefs.sceneMotion = false

    expect(localStorage.getItem('wuxia.theme')).toBe('paper')
    const restored = useInterfacePrefs(createPinia())
    expect(restored.isMidnightTheme).toBe(false)
    expect(restored.sceneMotion).toBe(false)
  })
})
