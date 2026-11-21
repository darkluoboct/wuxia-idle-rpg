// @vitest-environment happy-dom
import { createPinia, disposePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { useGameClock } from '@/composables/useGameClock'

it('时钟后台休眠，返回前台立即用当前时刻刷新', () => {
  vi.useFakeTimers()
  const pinia = createPinia()
  let hidden = false
  const original = Object.getOwnPropertyDescriptor(document, 'hidden')
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  const setHidden = (value: boolean) => {
    hidden = value
    document.dispatchEvent(new Event('visibilitychange'))
  }
  try {
    vi.setSystemTime(new Date('2026-11-21T01:00:00Z'))
    const clock = useGameClock(pinia)
    const start = clock.now
    vi.advanceTimersByTime(4_999)
    expect(clock.now).toBe(start)
    vi.advanceTimersByTime(1)
    expect(clock.now).toBe(start + 5_000)
    setHidden(true)
    expect(clock.isPageVisible).toBe(false)
    expect(document.documentElement.classList.contains('page-hidden')).toBe(true)
    vi.advanceTimersByTime(120_000)
    expect(clock.now).toBe(start + 5_000)
    setHidden(false)
    expect(clock.isPageVisible).toBe(true)
    expect(clock.now).toBe(start + 125_000)
    expect(clock.minuteTick).toBe(Math.floor(start / 60_000) + 2)
    expect(document.documentElement.classList.contains('page-hidden')).toBe(false)
  } finally {
    disposePinia(pinia)
    if (original) Object.defineProperty(document, 'hidden', original)
    else Reflect.deleteProperty(document, 'hidden')
    vi.useRealTimers()
  }
})
