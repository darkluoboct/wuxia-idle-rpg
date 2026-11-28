import { expect, test, type Locator, type Page } from '@playwright/test'

const onlineBuild = process.env.WUXIA_E2E_ONLINE_BUILD === '1'
const guestUrl = (mode: string) => `${onlineBuild ? '/guest/' : '/'}?mode=${mode}`
const tab = (game: Page, name: string) =>
  game.getByRole('tablist', { name: '主导航', exact: true }).getByRole('tab', { name, exact: true })

async function seedAndContinueDemo(
  page: Page,
  learnedSkills: Record<string, number>,
  preset1: {
    innerSkillId: string | null
    outerSkillId: string | null
    lightSkillId: string | null
    ultSkillId: string | null
  },
) {
  await page.goto(guestUrl('demo'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '领取修行收益' })).toBeVisible()
  await page.getByRole('button', { name: '存档并返回开局' }).click()
  const leave = page.getByRole('alertdialog', { name: '存档并返回开局' })
  await leave.getByRole('button', { name: '存档并返回' }).click()
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible()

  await page.evaluate(
    ({ skills, loadout }) => {
      const raw = localStorage.getItem('wuxia_idle_save')
      if (!raw) throw new Error('missing wuxia_idle_save')
      const env = JSON.parse(raw)
      env.data.player.level = 32
      env.data.player.realmTier = 3
      env.data.player.qiExp = 300_000
      env.data.learnedSkills = { ...env.data.learnedSkills, ...skills }
      env.data.presets[1] = {
        ...env.data.presets[1],
        ...loadout,
      }
      env.data.player.activePresetIdx = 1
      localStorage.setItem('wuxia_idle_save', JSON.stringify(env))
    },
    { skills: learnedSkills, loadout: preset1 },
  )

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '游客进入' }).click()
  await page.getByRole('button', { name: '进入江湖', exact: true }).click()
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await expect(page.getByRole('button', { name: '领取修行收益' })).toBeVisible()
}

async function expectContainedNoOverflow(container: Locator) {
  const metrics = await container.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const clippedChips: string[] = []
    for (const chip of el.querySelectorAll<HTMLElement>('.chip, .trait-pill, .trait-badge')) {
      const r = chip.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.left < rect.left - 2 || r.right > rect.right + 2) {
        clippedChips.push(`${chip.innerText} (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(rect.left)}..${Math.round(rect.right)})`)
      }
    }
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      clippedChips,
    }
  })
  expect(metrics.scrollWidth, 'element should not scroll horizontally').toBeLessThanOrEqual(metrics.clientWidth + 1)
  expect(metrics.clippedChips, 'chips should stay inside container width').toEqual([])
}

test('桌面端完整核查双轨成长、消耗倍率、阶段质变、战局节奏与边界情况', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seedAndContinueDemo(
    page,
    {
      xiantian_gong: 2,
      kurong_chunyang: 3,
      quanzhen_tuna: 3,
      kuangfeng_daofa: 1,
      dugu_jiujian: 2,
      xianglong_18: 3,
      luoying_zhang: 2,
      yuenv_jian: 4,
      shunxi_qianli: 1,
      jinyan_gong: 3,
      dingyang_zhen: 1,
      yiyang_zhi: 1,
    },
    {
      innerSkillId: 'xiantian_gong',
      outerSkillId: 'kuangfeng_daofa',
      lightSkillId: 'shunxi_qianli',
      ultSkillId: 'dingyang_zhen',
    },
  )

  // 1. CultivateConsole：热键角标 + 运功特质 + 点击唤出 InspectModal
  const hotbarSkills = page.locator('.hotbar-skills')
  await expect(hotbarSkills.locator('.hotbar-skill-tag')).toHaveCount(4)
  const traits = page.getByLabel('运功特质')
  await expect(traits).toBeVisible()
  await expect(traits).toContainText('全真·先天功')
  await expect(traits).toContainText('晚成 1.15x')
  await expect(traits).toContainText('第 2 重 · 蓄势')
  await expect(traits).toContainText('越战越勇')
  await expect(traits).toContainText('狂风快刀')
  await expect(traits).toContainText('速成 0.85x')
  await expect(traits).toContainText('前段抢攻')

  await traits.getByRole('button', { name: /全真·先天功/ }).click()
  const modal = page.getByRole('dialog', { name: '《全真·先天功》' })
  await expect(modal).toBeVisible()
  await expect(modal).toContainText('内功 · 第 2 重')
  await expect(modal.getByLabel('武学特质标签')).toContainText('晚成 · 厚积薄发')
  await expect(modal.getByLabel('武学特质标签')).toContainText('参悟消耗 1.15x（多 15%）')
  await expect(modal.getByLabel('武学特质标签')).toContainText('越战越勇 · 先天聚气')
  const modalStages = modal.getByLabel('阶段质变')
  await expect(modalStages.locator('li', { hasText: '第 2 重 · 蓄势' })).toContainText('当前阶段')
  await expect(modalStages.locator('li', { hasText: '第 3 重 · 小成破境' })).toContainText('待破境')
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)

  // 2. ArsenalSkills：列表徽记、精确 aria-label="查看{技能名}详情"、详情、升重阶段跃迁与空态对照
  await tab(page, '武库').click()
  const stage = page.getByRole('region', { name: '江湖舞台' })
  await stage.getByRole('tab', { name: '武学', exact: true }).click()

  const outerRow = stage.getByRole('button', { name: '查看狂风快刀详情', exact: true })
  await expect(outerRow).toContainText('速成')
  await expect(outerRow).toContainText('消耗 0.85x')
  await expect(outerRow).toContainText('前段抢攻')
  await expect(stage.getByRole('button', { name: '查看独孤九剑详情', exact: true })).toContainText('晚成')
  await expect(stage.getByRole('button', { name: '查看独孤九剑详情', exact: true })).toContainText('消耗 1.15x')
  await expect(stage.getByRole('button', { name: '查看独孤九剑详情', exact: true })).toContainText('越战越勇')

  // 2a. 速成 + 前段抢攻（狂风快刀）
  await outerRow.click()
  const growthCard = stage.getByRole('region', { name: '双轨成长与战局节奏' })
  await expect(growthCard).toContainText('速成 · 初猛后乏')
  await expect(growthCard).toContainText('参悟消耗 0.85x（省 15%）')
  await expect(growthCard).toContainText('前段抢攻 · 狂风抢攻')
  await expect(growthCard).toContainText('初成固定属性')
  await expect(growthCard).toContainText('第 1~2 回合「狂风抢攻」出手速度 +20%、伤害 +14%')
  await expect(stage.locator('.cost-readout')).toContainText('速成 0.85x')
  await stage.getByRole('button', { name: '返回武学', exact: true }).click()

  // 2b. 速成无节奏标签（落英神剑掌，沿用既有用例精确选择器）
  await stage.getByRole('button', { name: '查看落英神剑掌详情', exact: true }).click()
  await expect(growthCard).toContainText('速成 · 初猛后乏')
  await expect(growthCard).toContainText('参悟消耗 0.85x（省 15%）')
  await expect(growthCard).not.toContainText('战局节奏：')
  await stage.getByRole('button', { name: '返回武学', exact: true }).click()

  // 2c. 晚成 + 越战越勇 + 跨重质变（独孤九剑第 2 重 -> 第 3 重）
  await stage.getByRole('button', { name: '查看独孤九剑详情', exact: true }).click()
  await expect(growthCard).toContainText('晚成 · 厚积薄发')
  await expect(growthCard).toContainText('参悟消耗 1.15x（多 15%）')
  await expect(growthCard).toContainText('越战越勇 · 料敌先机')
  await expect(stage.getByRole('region', { name: '下一重效果' })).toContainText('破境质变 · 小成破境：九剑归宗：解锁完整 40% 穿透')
  const roadmap = stage.getByRole('region', { name: '阶段质变' })
  await expect(roadmap.locator('li', { hasText: '第 1 重 · 初窥' })).toContainText('已破境')
  await expect(roadmap.locator('li', { hasText: '第 2 重 · 蓄势' })).toContainText('当前阶段')
  await expect(roadmap.locator('li', { hasText: '第 3 重 · 小成破境' })).toContainText('下重破境')
  await expect(stage.locator('.cost-readout')).toContainText('晚成 1.15x')

  await stage.getByRole('button', { name: '升级独孤九剑', exact: true }).click()
  await expect(stage.getByRole('region', { name: '当前效果' })).toContainText('第 3 重')
  await expect(roadmap.locator('li', { hasText: '第 2 重 · 蓄势' })).toContainText('已破境')
  await expect(roadmap.locator('li', { hasText: '第 3 重 · 小成破境' })).toContainText('当前阶段')
  await expect(roadmap.locator('li', { hasText: '第 6 重 · 大成破境' })).toContainText('下重破境')
  await stage.getByRole('button', { name: '返回武学', exact: true }).click()

  // 2d. 5 阶段质变含「大圆满」（降龙十八掌）与中正无标签对照（越女剑法）
  await stage.getByRole('button', { name: '查看降龙十八掌详情', exact: true }).click()
  await expect(roadmap.locator('li', { hasText: '第 6 重 · 大成破境' })).toContainText('下重破境')
  await expect(roadmap.locator('li', { hasText: '第 10 重 · 大圆满' })).toContainText('待破境')
  await expect(roadmap.locator('li', { hasText: '第 10 重 · 大圆满' })).toContainText('亢龙绝境')
  await stage.getByRole('button', { name: '返回武学', exact: true }).click()

  await stage.getByRole('button', { name: '查看越女剑法详情', exact: true }).click()
  await expect(growthCard).toHaveCount(0)
  await expect(roadmap).toHaveCount(0)
  await expect(stage.locator('.cost-readout')).not.toContainText('0.85x')
  await expect(stage.locator('.cost-readout')).not.toContainText('1.15x')
  await stage.getByRole('button', { name: '返回武学', exact: true }).click()

  // 2e. 固定回合激活型渐强（南帝·纯阳枯荣禅）与仅强化外功前段抢攻（白驼·瞬息千里）
  await stage.getByRole('group', { name: '武学槽位' }).getByRole('button', { name: /内功/ }).click()
  await stage.getByRole('button', { name: '查看南帝·纯阳枯荣禅详情', exact: true }).click()
  await expect(growthCard).toContainText('第 4 回合起激活「禅定圆满」：物理减伤 +8%、回血效果 +20%')
  await stage.getByRole('button', { name: '返回武学', exact: true }).click()

  await stage.getByRole('group', { name: '武学槽位' }).getByRole('button', { name: /轻功/ }).click()
  await stage.getByRole('button', { name: '查看白驼·瞬息千里详情', exact: true }).click()
  await expect(growthCard).toContainText('第 1~2 回合「疾驰先攻」外功伤害 +12%；第 4 回合起「步法滞重」闪避 −6%')
  await stage.getByRole('button', { name: '返回武学', exact: true }).click()

  // 2f. 切换为纯中正平衡预设，核查 CultivateConsole 无空条冗余显示
  await stage.getByLabel('出战方案').selectOption('2')
  await tab(page, '修行').click()
  await expect(page.locator('.hotbar-skills .hotbar-skill-tag')).toHaveCount(0)
  await expect(page.getByLabel('运功特质')).toHaveCount(0)

  // 3. SectView 门派传承预览与未习得武学 InspectModal
  await tab(page, '门派').click()
  await stage.getByRole('button', { name: /铁掌帮/ }).click()
  await stage.getByRole('button', { name: '5 阶', exact: false }).first().click()
  const inheritance = stage.getByLabel('门派传承')
  const unlearnedBtn = inheritance.getByRole('button', { name: /铁掌十三式·摧碑/ })
  await expect(unlearnedBtn).toContainText('晚成')
  await unlearnedBtn.click()
  const unlearnedModal = page.getByRole('dialog', { name: '《铁掌十三式·摧碑》' })
  await expect(unlearnedModal).toContainText('未习得')
  await expect(unlearnedModal.getByLabel('武学特质标签')).toContainText('参悟消耗 1.15x（多 15%）')
  const previewStages = unlearnedModal.getByLabel('阶段质变')
  await expect(previewStages).toContainText('第 1 重 · 初窥')
  await expect(previewStages).toContainText('第 6 重 · 大成破境')
  await expect(previewStages).not.toContainText(/当前阶段|已破境|待破境/)
  await page.keyboard.press('Escape')
})

test('窄屏（390x844 与 844x390）下双轨标签、运功特质与阶段路线无横向溢出或裁切', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedAndContinueDemo(
    page,
    {
      xiantian_gong: 2,
      kuangfeng_daofa: 1,
      dugu_jiujian: 2,
      shunxi_qianli: 1,
      dingyang_zhen: 1,
    },
    {
      innerSkillId: 'xiantian_gong',
      outerSkillId: 'dugu_jiujian',
      lightSkillId: 'shunxi_qianli',
      ultSkillId: 'dingyang_zhen',
    },
  )

  // CultivateConsole 390x844
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true)
  await expectContainedNoOverflow(page.locator('.cultivate-hud'))
  await expectContainedNoOverflow(page.locator('.wuxia-hotbar'))
  const traits = page.getByLabel('运功特质')
  await expectContainedNoOverflow(traits)
  await traits.getByRole('button', { name: /全真·先天功/ }).click()
  const modal = page.getByRole('dialog', { name: '《全真·先天功》' })
  await expect(modal).toBeVisible()
  await expectContainedNoOverflow(modal)
  await page.keyboard.press('Escape')

  // ArsenalSkills 390x844 列表 + 详情
  await tab(page, '武库').click()
  const stage = page.getByRole('region', { name: '江湖舞台' })
  await stage.getByRole('tab', { name: '武学', exact: true }).click()
  const workspace = stage.locator('.martial-workspace')
  await expectContainedNoOverflow(workspace)
  await stage.getByRole('button', { name: '查看独孤九剑详情', exact: true }).click()
  await expectContainedNoOverflow(workspace)
  await expectContainedNoOverflow(stage.getByRole('region', { name: '双轨成长与战局节奏' }))
  await expectContainedNoOverflow(stage.getByRole('region', { name: '阶段质变' }))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true)

  // SectView 390x844
  await tab(page, '门派').click()
  await stage.getByRole('button', { name: /全真教/ }).click()
  await stage.getByRole('button', { name: '5 阶', exact: false }).first().click()
  await expectContainedNoOverflow(stage.getByLabel('门派传承'))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true)

  // 横版 844x390
  await page.setViewportSize({ width: 844, height: 390 })
  await tab(page, '修行').click()
  await expectContainedNoOverflow(page.locator('.cultivate-hud'))
  await tab(page, '武库').click()
  await stage.getByRole('tab', { name: '武学', exact: true }).click()
  await stage.getByRole('button', { name: '查看狂风快刀详情', exact: true }).click()
  await expectContainedNoOverflow(workspace)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 844)).toBe(true)
})
