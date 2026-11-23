// @vitest-environment happy-dom
import { effectScope } from 'vue'
import { apiClient } from '@/network/apiClient'
import type { PlayerSnapshot } from '@/network/protocol'
import { useOnlineGame } from '@/stores/onlineGame'
import { createPinia, disposePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import OnlineEntry from '@/components/OnlineEntry.vue'
import { useOnlineStore } from '@/stores/onlineStore'

it('注册时密码须一致，游客入口可直接进入角色选择', async () => {
  const pinia = createPinia()
  const signIn = vi.spyOn(useOnlineStore(pinia), 'signIn')
  const entry = mount(OnlineEntry, { global: { plugins: [pinia] } })
  try {
    await entry.findAll('.login-secondary button')[0].trigger('click')
    await entry.get('input[name=username]').setValue('visitor')
    await entry.get('#login-password').setValue('password1')
    await entry.get('[aria-label="确认密码"]').setValue('password2')
    await entry.get('form').trigger('submit')
    await flushPromises()
    expect(entry.get('[role=alert]').text()).toBe('两次输入的密码不一致')
    expect(signIn).not.toHaveBeenCalled()
    await entry.findAll('.login-secondary button')[1].trigger('click')
    expect(entry.emitted('guest')).toEqual([[]])
  } finally {
    entry.unmount()
    disposePinia(pinia)
  }
})

it('读档期间的多次版本推送共用请求，返回旧版本时只补读一次', async () => {
  const snapshot = (revision: number) => ({ revision, serverTime: 100 } as PlayerSnapshot)
  let finish!: (value: PlayerSnapshot) => void
  const pending = new Promise<PlayerSnapshot>((resolve) => { finish = resolve })
  const request = vi.spyOn(apiClient, 'request').mockResolvedValueOnce(snapshot(1))
    .mockReturnValueOnce(pending).mockResolvedValueOnce(snapshot(4))
  const ws = vi.spyOn(apiClient, 'connectWs').mockImplementation(() => {})
  const scope = effectScope()
  const game = scope.run(() => useOnlineGame({
    snapshot: vi.fn(), event: vi.fn(), error: vi.fn(), reset: vi.fn(), disconnected: vi.fn(),
  }, async () => {}))!
  try {
    await game.create('江湖客', 'hero_sword', 'jiangmen')
    const [receive] = ws.mock.calls[0]
    for (const revision of [2, 3, 4]) receive({ event: 'PLAYER_CHANGED', data: { revision } })
    expect(request.mock.calls.filter(([, path]) => path === '/player/me')).toHaveLength(1)
    finish(snapshot(2))
    await flushPromises()
    expect(request.mock.calls.filter(([, path]) => path === '/player/me')).toHaveLength(2)
    expect(game.revision.value).toBe(4)
  } finally {
    scope.stop()
  }
})
