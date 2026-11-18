import { randomUUID } from 'node:crypto'
import { expect, test, type FrameLocator } from '@playwright/test'

const enter = (game: FrameLocator) =>
  game.getByRole('button', { name: '进入江湖', exact: true }).click()
const tab = (game: FrameLocator, name: string) =>
  game.locator('.wuxia-header').getByRole('tab', { name, exact: true })

/** 联机新角色先过序章：跳过文字，打主线 1-1，再看完忘机客的剧情卡 */
/** 打完序章：楔子按家世讲，家人并肩出战，忘机客说完由家人补一句 */
async function playPrologue(game: FrameLocator, family: { title: string; kin: string }) {
  await expect(game.getByRole('heading', { name: family.title })).toBeVisible()
  await game.getByRole('button', { name: '跳过剧情' }).click()
  await expect(game.locator('.prologue-ally')).toContainText(family.kin)
  await game.getByRole('button', { name: /^以.+出手$/ }).click()
  await game.getByRole('button', { name: '跳过回放' }).click()
  await game.getByRole('button', { name: /^返回/ }).click()
  const card = game.getByRole('dialog', { name: '序章 · 忘机遗言' })
  for (let page = 0; page < 3; page++) await card.getByRole('button', { name: '继续' }).click()
  await expect(card).toContainText(family.kin)
  await card.getByRole('button', { name: '知道了' }).click()
  await expect(card).toHaveCount(0)
}

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
  // 两位侠客各自注册、走完序章，慢机器上光这些就近 30 秒
  test.setTimeout(90_000)

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
        // 不选家世建不了角
        await game.getByRole('button', { name: '创建侠客' }).click()
        await expect(game.getByRole('alert')).toHaveText('请选择家世')
        const family = index ? { name: '杏林', title: '楔子 · 杏林', kin: '沈青黛' } : { name: '渔家', title: '楔子 · 渔家', kin: '阮青篙' }
        await game.locator('label.origin-option', { hasText: family.name }).click()
        await expect(game.locator('.origin-detail')).toContainText(family.kin)
        await game.getByRole('button', { name: '创建侠客' }).click()
        await expect(game.getByRole('region', { name: '当前侠客' })).toContainText(nickname)
        await enter(game)
        await playPrologue(game, family)
        // 序章之后只开修行、江湖、武库
        await expect(game.locator('.wuxia-header').getByRole('tab')).toHaveText(['修行', '江湖', '武库'])
        await game.getByRole('tablist', { name: '江湖卷栏目' }).getByRole('tab', { name: '附近' }).click()
        // 江湖传音在左栏人物卷下：切到附近（同图）频道
        await game.getByRole('tablist', { name: '频道' }).getByRole('tab', { name: /^附近/ }).click()
        return { game, page, nickname }
      }),
    )
    // 聊天会留档，测试库反复跑时每次换一句
    const message = `烟雨楼前见 ${randomUUID().slice(0, 4)}`
    await alice.game.getByRole('textbox', { name: '聊天内容' }).fill(message)
    await alice.game.getByRole('button', { name: '发送', exact: true }).click()
    await expect(bob.game.getByText(message, { exact: true })).toBeVisible()
    // 同图名单：连上时拿一份，之后的进出只推变动，两边都要看到对方
    const nearby = (game: FrameLocator) => game.getByRole('list', { name: '附近侠客' })
    for (const [viewer, other] of [[alice, bob], [bob, alice]]) {
      await expect(nearby(viewer.game).getByText(other.nickname, { exact: true })).toBeVisible()
    }
    // 私聊：从附近侠客点「私聊」，对方的私聊页签记未读，点开会话读到
    await alice.game.getByRole('button', { name: `私聊${bob.nickname}` }).click()
    await alice.game.getByRole('textbox', { name: '聊天内容' }).fill('借一步说话')
    await alice.game.getByRole('button', { name: '发送', exact: true }).click()
    await bob.game.getByRole('tablist', { name: '频道' }).getByRole('tab', { name: '私聊，1 条未读' }).click()
    await bob.game.getByRole('list', { name: '私聊会话' }).getByRole('button', { name: new RegExp(alice.nickname) }).click()
    await expect(bob.game.getByText('借一步说话', { exact: true })).toBeVisible()
    await contexts[1].close()
    await expect(nearby(alice.game).getByText(bob.nickname, { exact: true })).toHaveCount(0)
    const settlement = alice.page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/cultivate/settle') &&
        response.request().method() === 'POST',
    )
    await alice.game.getByRole('button', { name: '领取修行收益' }).click()
    expect((await settlement).ok()).toBe(true)
    const stage = alice.game.getByRole('region', { name: '江湖舞台' })
    const worn = stage.getByRole('button', { name: '查看已穿戴的青钢长剑' })
    await tab(alice.game, '武库').click()
    await stage.getByRole('tab', { name: '装备', exact: true }).click()
    // 新角色开局佩着青钢长剑：卸下后读档仍是空手，再从背包换上
    await expect(worn).toBeVisible()
    const saved = alice.page.waitForResponse(
      (response) => response.url().includes('/api/v1/loadout/') && response.request().method() === 'PUT',
    )
    await stage.getByRole('button', { name: '卸下青钢长剑', exact: true }).click()
    expect((await saved).ok()).toBe(true)
    await expect(worn).toHaveCount(0)
    await alice.page.reload({ waitUntil: 'domcontentloaded' })
    await expect(alice.game.getByRole('region', { name: '当前侠客' })).toContainText(alice.nickname)
    await enter(alice.game)
    await expect(tab(alice.game, '修行')).toHaveAttribute('aria-selected', 'true')
    await tab(alice.game, '武库').click()
    await stage.getByRole('tab', { name: '装备', exact: true }).click()
    await expect(stage.getByRole('button', { name: '卸下青钢长剑', exact: true })).toHaveCount(0)
    await stage.getByRole('button', { name: '青钢长剑', exact: true }).click()
    await stage.getByRole('button', { name: '装备青钢长剑', exact: true }).click()
    await expect(worn).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
