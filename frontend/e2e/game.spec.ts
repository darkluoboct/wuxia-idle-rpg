import { randomUUID } from 'node:crypto'
import { expect, test, type FrameLocator } from '@playwright/test'

const enter = (game: FrameLocator) =>
  game.getByRole('button', { name: '进入江湖', exact: true }).click()
const tab = (game: FrameLocator, name: string) =>
  game.locator('.wuxia-header').getByRole('tab', { name, exact: true })

test('游客进入演武，切换五个页签并从浏览器读档', async ({ page }) => {
  const scripts = new Set<string>()
  const illustrations = new Set<string>()
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (request.resourceType() === 'script') scripts.add(path)
    if (path.endsWith('.webp')) illustrations.add(path)
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const game = page.frameLocator('#game-frame')
  await expect(game.getByRole('heading', { name: '账号登录' })).toBeVisible()
  expect([...scripts].some((path) => /gameStore-|GameShell-|View-/.test(path))).toBe(false)
  await expect
    .poll(() => [...illustrations].some((path) => path.includes('login-jiaxing-')))
    .toBe(true)
  expect([...illustrations].every((path) => path.includes('login-jiaxing-'))).toBe(true)

  await game.getByRole('button', { name: '游客进入' }).click()
  await enter(game)
  await game.getByRole('button', { name: /演武模式/ }).click()
  await expect(game.getByRole('button', { name: '领取修行收益' })).toBeVisible()
  expect([...scripts].some((path) => /MarketView-/.test(path))).toBe(false)

  const tabs = [
    ['江湖', 'JianghuView'],
    ['武库', 'ArsenalView'],
    ['门派', 'SectView'],
    ['市井', 'MarketView'],
    ['修行', 'CultivateView'],
  ] as const
  for (const [name, chunk] of tabs) {
    await tab(game, name).click()
    await expect(tab(game, name)).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => [...scripts].some((path) => path.includes(`/${chunk}-`))).toBe(true)
    await expect(
      game.getByRole('region', { name: '江湖舞台' }).locator(':scope > *').first(),
    ).toBeVisible()
  }

  await game.getByRole('button', { name: '存档并返回开局' }).click()
  await expect(game.getByRole('button', { name: '继续', exact: true })).toBeVisible()
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await game.getByRole('button', { name: '游客进入' }).click()
  await enter(game)
  await game.getByRole('button', { name: '继续', exact: true }).click()
  await expect(game.getByRole('button', { name: '领取修行收益' })).toBeVisible()
})

test('联机注册、创角、同图聊天、领取收益和换装读档', async ({ browser }) => {
  test.skip(!process.env.WUXIA_E2E_DATABASE_URL, '需要专用 PostgreSQL 测试库')

  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  try {
    const [alice, bob] = await Promise.all(
      contexts.map(async (context, index) => {
        const page = await context.newPage()
        await page.goto(index ? '/' : '/?mode=online', { waitUntil: 'domcontentloaded' })
        const game = page.frameLocator('#game-frame')
        await game.getByRole('button', { name: '注册账号', exact: true }).click()
        const id = randomUUID().split('-')[0]
        const login = `e2e_${id}`
        const password = randomUUID()
        const nickname = `${index ? '南湖访客' : '烟雨侠客'}${id}`
        await game.locator('input[name=username]').fill(login)
        await game.locator('input[name=password]').fill(password)
        await game.getByLabel('确认密码').fill(password)
        await game.getByRole('button', { name: '注册并启程' }).click()
        await game.getByRole('button', { name: '创建角色', exact: true }).click()
        await game.locator('#character-name').fill(nickname)
        await game.getByRole('button', { name: '创建侠客' }).click()
        await expect(game.getByRole('region', { name: '当前侠客' })).toContainText(nickname)
        await enter(game)
        await game.getByRole('tab', { name: '同图聊天' }).click()
        return { game, page, nickname }
      }),
    )
    const message = '烟雨楼前见'
    await alice.game.getByRole('textbox', { name: '聊天内容' }).fill(message)
    await alice.game.getByRole('button', { name: '发送', exact: true }).click()
    await expect(bob.game.getByText(message, { exact: true })).toBeVisible()
    const settlement = alice.page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/cultivate/settle') &&
        response.request().method() === 'POST',
    )
    await alice.game.getByRole('button', { name: '领取修行收益' }).click()
    expect((await settlement).ok()).toBe(true)
    const stage = alice.game.getByRole('region', { name: '江湖舞台' })
    await tab(alice.game, '武库').click()
    await stage.getByRole('tab', { name: '装备', exact: true }).click()
    await stage.getByRole('button', { name: '青钢长剑', exact: true }).click()
    await stage.getByRole('button', { name: '装备青钢长剑', exact: true }).click()
    await expect(stage.getByRole('button', { name: '查看已穿戴的青钢长剑' })).toBeVisible()
    await alice.page.reload({ waitUntil: 'domcontentloaded' })
    await expect(alice.game.getByRole('region', { name: '当前侠客' })).toContainText(alice.nickname)
    await enter(alice.game)
    await expect(tab(alice.game, '修行')).toHaveAttribute('aria-selected', 'true')
    await tab(alice.game, '武库').click()
    await stage.getByRole('tab', { name: '装备', exact: true }).click()
    await expect(stage.getByRole('button', { name: '查看已穿戴的青钢长剑' })).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
