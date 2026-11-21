import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useInterfacePrefs } from '@/stores/interfacePrefs'

describe('界面偏好', () => {
  it('主题、场景动态与回放倍速跨会话记忆', () => {
    const prefs = useInterfacePrefs(createPinia())
    expect(prefs.isMidnightTheme).toBe(true)
    expect(prefs.battleSpeed).toBe(1)
    prefs.isMidnightTheme = false
    prefs.sceneMotion = false
    prefs.battleSpeed = 2

    expect(localStorage.getItem('wuxia.theme')).toBe('paper')
    const restored = useInterfacePrefs(createPinia())
    expect(restored.isMidnightTheme).toBe(false)
    expect(restored.sceneMotion).toBe(false)
    expect(restored.battleSpeed).toBe(2)
  })
})
