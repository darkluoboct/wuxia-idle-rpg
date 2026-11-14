// @vitest-environment happy-dom
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
