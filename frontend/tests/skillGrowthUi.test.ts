// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import ArsenalSkills from '@/components/ArsenalSkills.vue'
import CultivateConsole from '@/components/CultivateConsole.vue'
import InspectModal from '@/components/InspectModal.vue'
import SectView from '@/views/SectView.vue'
import { useGameStore } from '@/stores/gameStore'

if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function close() {
    this.removeAttribute('open')
  }
}

function setupStore() {
  const pinia = createPinia()
  const store = useGameStore(pinia)
  store.startGame('NEW')
  store.player.level = 30
  store.player.realmTier = 3
  return { pinia, store }
}

describe('武学详情与修炼界面双轨成长展示', () => {
  it('ArsenalSkills 清晰展示速成/晚成、修炼倍率、阶段质变与战局节奏', async () => {
    const { pinia, store } = setupStore()
    store.learnedSkills.kuangfeng_daofa = 1
    store.learnedSkills.dugu_jiujian = 2
    store.learnedSkills.quanzhen_jianfa = 1
    store.updateLoadout({ outerSkillId: 'kuangfeng_daofa' })
    const view = mount(ArsenalSkills, { global: { plugins: [pinia] } })
    try {
      // 上阵槽位卡显示速成 0.85x 与前段抢攻
      const slotGridText = view.get('[aria-label="武学槽位"]').text()
      expect(slotGridText).toContain('狂风快刀')
      expect(slotGridText).toContain('速成 0.85x')
      expect(slotGridText).toContain('前段抢攻')

      // 已习得列表显示三枚徽记，并保留精确详情按钮无障碍名
      const list = view.get('.skill-list')
      expect(list.text()).toContain('速成')
      expect(list.text()).toContain('消耗 0.85x')
      expect(list.text()).toContain('前段抢攻')
      expect(list.text()).toContain('晚成')
      expect(list.text()).toContain('消耗 1.15x')
      expect(list.text()).toContain('越战越勇')

      // 打开速成+抢攻武学详情（狂风快刀）
      await view.get('button[aria-label="查看狂风快刀详情"]').trigger('click')
      const earlyCard = view.get('[aria-label="双轨成长与战局节奏"]').text()
      expect(earlyCard).toContain('速成 · 初猛后乏')
      expect(earlyCard).toContain('参悟消耗 0.85x（省 15%）')
      expect(earlyCard).toContain('前段抢攻 · 狂风抢攻')
      expect(earlyCard).toContain('初成固定属性')
      expect(earlyCard).toContain('第 1~2 回合「狂风抢攻」出手速度 +20%、伤害 +14%')
      expect(view.get('.cost-readout').text()).toContain('速成 0.85x')

      // 返回列表并切换为晚成+渐强+阶段质变武学（独孤九剑第 2 重 -> 第 3 重小成破境）
      await view.get('button').trigger('click')
      await view.get('button[aria-label="查看独孤九剑详情"]').trigger('click')
      const lateCard = view.get('[aria-label="双轨成长与战局节奏"]').text()
      expect(lateCard).toContain('晚成 · 厚积薄发')
      expect(lateCard).toContain('参悟消耗 1.15x（多 15%）')
      expect(lateCard).toContain('越战越勇 · 料敌先机')
      expect(lateCard).toContain('首回合伤害 -8%；第 2 回合起每回合叠加「料敌先机」：伤害 +5%、暴击率 +3%（最多 5 层）')

      const nextColText = view.get('[aria-label="下一重效果"]').text()
      expect(nextColText).toContain('破境质变 · 小成破境：九剑归宗：解锁完整 40% 穿透')

      const roadmapText = view.get('[aria-label="阶段质变"]').text()
      expect(roadmapText).toContain('第 1 重 · 初窥')
      expect(roadmapText).toContain('已破境')
      expect(roadmapText).toContain('第 2 重 · 蓄势')
      expect(roadmapText).toContain('当前阶段')
      expect(roadmapText).toContain('第 3 重 · 小成破境')
      expect(roadmapText).toContain('下重破境')
      expect(roadmapText).toContain('第 6 重 · 大成破境')
      expect(roadmapText).toContain('待破境')

      const costText = view.get('.cost-readout').text()
      expect(costText).toContain('晚成 1.15x')
      expect(costText).toContain(store.getSkillUpgradeCost('dugu_jiujian').toLocaleString())

      // 返回列表检查中正平衡武学（全真剑法）不误显示特殊卡片
      await view.get('button').trigger('click')
      await view.get('button[aria-label="查看全真剑法详情"]').trigger('click')
      expect(view.find('[aria-label="双轨成长与战局节奏"]').exists()).toBe(false)
      expect(view.find('[aria-label="阶段质变"]').exists()).toBe(false)
    } finally {
      view.unmount()
      disposePinia(pinia)
    }
  })

  it('InspectModal 展示未习得与已习得武学的成长路线、消耗倍率、节奏与阶段质变', () => {
    const { pinia, store } = setupStore()
    store.learnedSkills.xiantian_gong = 3
    const view = mount(InspectModal, { global: { plugins: [pinia] } })
    try {
      // 未习得神品晚成武学：降龙十八掌
      store.inspectById('skill', 'xianglong_18')
      expect(store.inspectModal?.subtitle).toContain('未习得')
      expect(store.inspectModal?.tags?.map((tag) => tag.text)).toEqual([
        '晚成 · 厚积薄发',
        '参悟消耗 1.15x（多 15%）',
      ])
      expect(store.inspectModal?.masteryStages?.map((stage) => stage.label)).toEqual([
        '初窥', '蓄势', '小成破境', '大成破境', '大圆满',
      ])

      // 已习得第 3 重先天功（晚成 + 越战越勇 + 阶段质变）
      store.inspectById('skill', 'xiantian_gong')
      expect(store.inspectModal?.subtitle).toContain('第 3 重')
      expect(store.inspectModal?.tags?.map((tag) => tag.text)).toEqual([
        '晚成 · 厚积薄发',
        '参悟消耗 1.15x（多 15%）',
        '越战越勇 · 先天聚气',
      ])
      expect(store.inspectModal?.notes?.some((line) => line.includes('先天聚气'))).toBe(true)
      expect(store.inspectModal?.masteryStages?.find((stage) => stage.minMastery === 3)?.state).toBe('current')
    } finally {
      view.unmount()
      disposePinia(pinia)
    }
  })

  it('CultivateConsole 与 SectView 直观展示运功特质、角标及点击浮窗校验', async () => {
    const { pinia, store } = setupStore()
    store.learnedSkills.xiantian_gong = 3
    store.learnedSkills.kuangfeng_daofa = 1
    store.learnedSkills.shunxi_qianli = 1
    store.updateLoadout({
      innerSkillId: 'xiantian_gong',
      outerSkillId: 'kuangfeng_daofa',
      lightSkillId: 'shunxi_qianli',
    })
    const consoleView = mount(CultivateConsole, { global: { plugins: [pinia] } })
    const sectView = mount(SectView, { global: { plugins: [pinia] } })
    try {
      const hotbar = consoleView.get('.hotbar-skills')
      expect(hotbar.text()).toContain('晚成')
      expect(hotbar.text()).toContain('速成')

      const traits = consoleView.get('[aria-label="运功特质"]')
      expect(traits.text()).toContain('先天功')
      expect(traits.text()).toContain('晚成 1.15x')
      expect(traits.text()).toContain('第 3 重 · 小成破境')
      expect(traits.text()).toContain('越战越勇')
      expect(traits.text()).toContain('狂风快刀')
      expect(traits.text()).toContain('速成 0.85x')
      expect(traits.text()).toContain('前段抢攻')

      await traits.findAll('button')[0].trigger('click')
      expect(store.inspectModal?.title).toBe('《全真·先天功》')
      expect(store.inspectModal?.tags?.some((tag) => tag.text === '参悟消耗 1.15x（多 15%）')).toBe(true)

      // 门派传承预览展示全真五阶先天功（晚成 + 越战越勇）与丐帮二阶狂风/四阶降龙残篇等标签
      await sectView.findAll('button').find((button) => button.text().includes('全真教'))!.trigger('click')
      await sectView.findAll('button').find((button) => button.text().includes('5 阶'))!.trigger('click')
      const sectSkills = sectView.get('[aria-label="门派传承"]').text()
      expect(sectSkills).toContain('先天功')
      expect(sectSkills).toContain('晚成')
      expect(sectSkills).toContain('越战越勇')
    } finally {
      consoleView.unmount()
      sectView.unmount()
      disposePinia(pinia)
    }
  })
})
