import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
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

test('游客进入演武，切换五个页签，完成横版武库换装和升重后读档', async ({ page }) => {
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
  const rightRail = game.locator('#world-rail')
  await expect(rightRail.getByRole('tab', { name: '附近' })).toBeVisible()
  await expect(rightRail.getByRole('tab', { name: '任务' })).toHaveCount(0)
  await expect(rightRail.getByText(/每日江湖事|江湖行历/)).toHaveCount(0)
  expect([...scripts].some((path) => /MarketView-/.test(path))).toBe(false)

  const tabs = [
    ['江湖', 'JianghuView'],
    ['武库', 'ArsenalView'],
    ['门派', 'SectView'],
    ['市井', 'MarketView'],
    ['修行', 'CultivateView'],
  ] as const
  const stage = game.getByRole('region', { name: '江湖舞台' })
  for (const [name, chunk] of tabs) {
    await tab(game, name).click()
    await expect(tab(game, name)).toHaveAttribute('aria-selected', 'true')
    await expect.poll(() => [...scripts].some((path) => path.includes(`/${chunk}-`))).toBe(true)
    await expect(stage.locator(':scope > *').first()).toBeVisible()
  }

  await tab(game, '武库').click()
  const characterRail = game.getByRole('complementary', { name: '人物卷', exact: true })
  const worldRail = game.getByRole('complementary', { name: '江湖卷', exact: true })
  const companionTab = stage.getByRole('tab', { name: '伙伴', exact: true })
  await companionTab.click()
  await expect(companionTab).toHaveAttribute('aria-selected', 'true')
  await expect(characterRail).toBeHidden()
  await expect(worldRail).toBeHidden()
  const roster = stage.getByRole('list', { name: '伙伴列表' })
  const companion = stage.getByRole('article', { name: '伙伴详情' })
  await expect(companion.getByRole('heading', { name: '郭靖', exact: true })).toBeVisible()
  await roster.getByRole('button', { name: '黄药师', exact: true }).click()
  const portrait = companion.getByRole('img', { name: '黄药师立绘' }).locator('img')
  await expect(portrait).toHaveAttribute('src', /huangyaoshi-.*\.webp$/)
  await expect.poll(() => portrait.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800)
  await expect(companion.getByRole('region', { name: '伙伴属性' })).toContainText('7,800')
  await expect(companion.getByRole('heading', { name: '弹指神通', exact: true })).toBeVisible()
  await expect(companion.getByRole('button', { name: '上阵右翼' })).toBeEnabled()
  await expect(roster.getByRole('button', { name: '黄蓉', exact: true })).toContainText('右翼')

  const meridianTab = stage.getByRole('tab', { name: '经脉冲穴', exact: true })
  await meridianTab.click()
  await expect(meridianTab).toHaveAttribute('aria-selected', 'true')
  await expect(characterRail).toBeHidden()
  await expect(worldRail).toBeHidden()
  const meridianMap = stage.getByRole('group', { name: '人体穴位图', exact: true })
  const pointDetail = stage.getByRole('complementary', { name: '穴位说明', exact: true })
  await meridianMap.getByRole('button', { name: '阳交穴', exact: true }).click()
  await expect(pointDetail.getByRole('heading', { name: '阳交穴', exact: true })).toBeVisible()
  await expect(pointDetail).toContainText('需先贯通')
  await expect(pointDetail).toContainText('金门穴')
  await meridianMap.getByRole('button', { name: '金门穴', exact: true }).click()
  await expect(pointDetail.getByRole('button', { name: '运功冲穴', exact: true })).toBeEnabled()

  await stage.getByRole('tab', { name: '角色', exact: true }).click()
  await stage.getByRole('button', { name: '查看已穿戴的牛家村玄铁匕首', exact: true }).click()
  const weapon = stage.getByRole('complementary', { name: '武器详情', exact: true })
  await expect(weapon.getByRole('heading', { name: '牛家村玄铁匕首' })).toBeVisible()
  await weapon.getByRole('button', { name: '更换装备', exact: true }).click()
  await expect(stage.getByRole('combobox', { name: '装备部位' })).toHaveValue('WEAPON')
  await stage.getByRole('button', { name: '青钢长剑', exact: true }).click()
  const comparison = stage.getByRole('group', { name: '同部位装备对比' })
  await expect(comparison).toContainText('牛家村玄铁匕首')
  await expect(comparison).toContainText('青钢长剑')
  const weaponCard = stage.getByRole('dialog', { name: '青钢长剑', exact: true })
  await expect(weaponCard.getByRole('row', { name: /暴击率/ }).locator('.equipment-number')).toHaveText(['+15%', '+3%'])
  await stage.getByRole('button', { name: '装备青钢长剑', exact: true }).click()
  await expect(stage.getByText(/穿戴「青钢长剑」/)).toBeVisible()
  await expect(weaponCard).toHaveCount(0)
  await expect(stage.getByRole('button', { name: '青钢长剑', exact: true })).toBeFocused()
  await stage.getByRole('button', { name: '返回角色', exact: true }).click()
  await expect(weapon.getByRole('heading', { name: '青钢长剑' })).toBeVisible()

  await stage.getByRole('tab', { name: '武学', exact: true }).click()
  await stage.getByRole('button', { name: '查看落英神剑掌详情', exact: true }).click()
  const effects = stage.getByRole('region', { name: '当前效果' })
  await expect(effects).toContainText('第 2 重')
  await expect(stage.getByRole('region', { name: '下一重效果' })).toContainText('第 3 重')
  await stage.getByRole('button', { name: '升级落英神剑掌', exact: true }).click()
  await expect(effects).toContainText('第 3 重')
  await stage.getByRole('button', { name: '返回武学', exact: true }).click()
  await expect(stage.getByRole('heading', { name: '已习得 · 外功', exact: true })).toBeVisible()
  await tab(game, '修行').click()
  await expect(characterRail).toBeVisible()
  await expect(worldRail).toBeVisible()

  await game.getByRole('button', { name: '存档并返回开局' }).click()
  // 先弹确认，默认焦点在「取消」，免得误点
  const leave = game.getByRole('alertdialog', { name: '存档并返回开局' })
  await expect(leave.getByRole('button', { name: '取消' })).toBeFocused()
  await leave.getByRole('button', { name: '存档并返回' }).click()
  await expect(game.getByRole('button', { name: '继续', exact: true })).toBeVisible()
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await game.getByRole('button', { name: '游客进入' }).click()
  await enter(game)
  await game.getByRole('button', { name: '继续', exact: true }).click()
  await expect(game.getByRole('button', { name: '领取修行收益' })).toBeVisible()
  await tab(game, '武库').click()
  await stage.getByRole('tab', { name: '角色', exact: true }).click()
  await expect(stage.getByRole('button', { name: '查看已穿戴的青钢长剑', exact: true })).toBeVisible()
})

test('横版来信与任务各自独立，武库查看物品，任务框查看赏赐和副本掉落', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/?mode=guest')
  const game = page.frameLocator('#game-frame')
  await enter(game)
  await game.getByRole('button', { name: /演武模式/ }).click()
  await game.getByRole('button', { name: '江湖来信', exact: true }).click()
  const letter = game.getByRole('dialog', { name: '江湖来信', exact: true })
  const journal = game.getByRole('dialog', { name: '任务与玩法', exact: true })
  await expect(letter.getByText('还没有来信。')).toBeVisible()
  await expect(letter.getByRole('tab')).toHaveCount(0)
  await expect(journal).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(letter).toHaveCount(0)
  await tab(game, '武库').click()
  const stage = game.getByRole('region', { name: '江湖舞台' })
  await stage.getByRole('tab', { name: '背包', exact: true }).click()
  await stage.getByRole('button', { name: '丹药', exact: true }).click()
  const pill = stage.locator('.bag-tile').first()
  await pill.click()
  await expect(stage.getByRole('dialog').getByRole('heading', { name: '用途' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(stage.getByRole('dialog')).toHaveCount(0)
  await expect(pill).toBeFocused()
  await game.getByRole('button', { name: '任务与玩法', exact: true }).click()
  await expect(journal.getByRole('tab')).toHaveCount(2)
  await expect(letter).toHaveCount(0)
  await expect(journal.getByRole('button', { name: /射雕主线/ })).toBeVisible()
  await expect(journal.getByRole('button', { name: /江湖奇遇/ })).toBeVisible()
  await journal.getByRole('button', { name: '纹银', exact: true }).click()
  const silver = journal.getByRole('dialog', { name: '纹银' })
  await expect(silver.locator('.art-coin')).toBeVisible()
  await expect(silver).toContainText('货币')
  await silver.getByRole('button', { name: '关闭道具浮窗' }).click()
  await journal.getByRole('button', { name: '前往历练' }).click()
  await expect(journal.getByRole('heading', { name: /破庙夜雨/ })).toBeVisible()
  await journal.getByRole('button', { name: '返回任务' }).click()
  await expect(journal.getByRole('heading', { name: '荒山练手' })).toBeVisible()
  await journal.getByRole('button', { name: /每日江湖事/ }).click()
  await journal.getByRole('button', { name: '元宝', exact: true }).click()
  await expect(journal.getByRole('dialog', { name: '元宝' })).toContainText('本次来源 · 每日江湖事')
  await page.keyboard.press('Escape')
  await journal.getByRole('tab', { name: '玩法', exact: true }).click()
  await journal.getByRole('region', { name: '首胜掉落' }).getByRole('button').first().click()
  await expect(journal.getByRole('dialog').locator('.equipment-number').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await journal.getByRole('button', { name: /结义副本/ }).click()
  await journal.getByRole('button', { name: '查看组队准备' }).click()
  await expect(journal).toHaveCount(0)
  await expect(game.getByRole('button', { name: '挑战副本', exact: true })).toBeVisible()
  await game.getByRole('button', { name: '返回任务与玩法' }).click()
  await expect(journal.getByRole('heading', { name: /金刚伏魔圈/ })).toBeVisible()
})

test('联机注册、创角、同图聊天、私聊、领取收益、换装读档与删除角色', async ({ browser }) => {
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
        return { game, page, nickname, password }
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
    // 新角色先点「开始挂机」才累计打坐与巡历，之后才有收益可领
    await expect(alice.game.getByRole('button', { name: '领取修行收益' })).toHaveCount(0)
    const started = alice.page.waitForResponse(
      (response) => response.url().endsWith('/api/v1/cultivate/idle') && response.request().method() === 'POST',
    )
    await alice.game.locator('.income-tray').getByRole('button', { name: '开始挂机' }).click()
    expect((await started).ok()).toBe(true)
    await expect(alice.game.getByRole('button', { name: '停止挂机' })).toBeVisible()
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
    await stage.getByRole('tab', { name: '角色', exact: true }).click()
    // 新角色开局佩着青钢长剑：卸下后读档仍是空手，再从背包换上
    await expect(worn).toBeVisible()
    const saved = alice.page.waitForResponse(
      (response) => response.url().includes('/api/v1/loadout/') && response.request().method() === 'PUT',
    )
    await worn.click()
    await stage.getByRole('button', { name: '卸下青钢长剑', exact: true }).click()
    expect((await saved).ok()).toBe(true)
    await expect(worn).toHaveCount(0)
    await alice.page.reload({ waitUntil: 'domcontentloaded' })
    await expect(alice.game.getByRole('region', { name: '当前侠客' })).toContainText(alice.nickname)
    await enter(alice.game)
    await expect(tab(alice.game, '修行')).toHaveAttribute('aria-selected', 'true')
    await tab(alice.game, '武库').click()
    await stage.getByRole('tab', { name: '角色', exact: true }).click()
    await expect(stage.getByRole('button', { name: '卸下青钢长剑', exact: true })).toHaveCount(0)
    await stage.getByRole('button', { name: '查看武器装备位', exact: true }).click()
    await stage.getByRole('button', { name: '选择装备', exact: true }).click()
    await stage.getByRole('button', { name: '青钢长剑', exact: true }).click()
    await stage.getByRole('button', { name: '装备青钢长剑', exact: true }).click()
    await expect(stage.getByText(/穿戴「青钢长剑」/)).toBeVisible()
    await stage.getByRole('button', { name: '返回角色', exact: true }).click()
    await expect(worn).toBeVisible()

    // 两封定向来信，验证逐封翻阅、领取以及从武库返回指定信件。
    const { Client } = createRequire(new URL('../../server/package.json', import.meta.url))('pg')
    const db = new Client({ connectionString: process.env.WUXIA_E2E_DATABASE_URL })
    await db.connect()
    try {
      const now = Date.now()
      await db.query(`INSERT INTO mails (id, title, body, attachments, player_id, created_at, expires_at)
        SELECT $1, '临安回音', '盼早日相见。', '{}', id, $2, $3 FROM players WHERE nickname=$4`,
        [randomUUID(), now, now + 3_600_000, alice.nickname])
      await db.query(`INSERT INTO mails (id, title, body, attachments, player_id, created_at, expires_at)
        SELECT $1, '嘉兴来信', '随信附上一柄匕首与盘缠。', $2, id, $3, $4 FROM players WHERE nickname=$5`,
        [randomUUID(), JSON.stringify({ silver: 200, items: ['xuantie_dagger'] }), now - 1, now + 3_600_000, alice.nickname])
    } finally { await db.end() }
    await alice.game.getByRole('button', { name: /^江湖来信/ }).click()
    const letter = alice.game.getByRole('dialog', { name: '江湖来信', exact: true })
    await expect(letter.getByRole('heading', { name: '临安回音' })).toBeVisible()
    await expect(letter.getByRole('tab')).toHaveCount(0)
    await letter.getByRole('button', { name: '下一封' }).click()
    await expect(letter.getByRole('heading', { name: '嘉兴来信' })).toBeVisible()
    await expect(letter.getByRole('heading', { name: '临安回音' })).toHaveCount(0)
    await letter.getByRole('button', { name: '纹银', exact: true }).click()
    await expect(letter.getByRole('dialog', { name: '纹银' })).toContainText('×200')
    await letter.getByRole('button', { name: '关闭道具浮窗' }).click()
    await letter.getByRole('button', { name: '领取附件' }).click()
    await letter.getByRole('button', { name: '在背包中查看' }).click()
    await expect(letter).toHaveCount(0)
    await expect(stage.getByRole('tab', { name: '背包' })).toHaveAttribute('aria-selected', 'true')
    const dagger = stage.getByRole('dialog', { name: '牛家村玄铁匕首' })
    await dagger.getByRole('button', { name: '同部位对比' }).click()
    await expect(dagger.getByRole('row', { name: /暴击率/ })).toContainText('+15%')
    await dagger.getByRole('button', { name: '装备牛家村玄铁匕首' }).click()
    await expect(stage.getByRole('button', { name: '牛家村玄铁匕首', exact: true })).toContainText('已穿戴')
    await stage.getByRole('button', { name: '返回来信' }).click()
    await expect(letter.getByRole('heading', { name: '嘉兴来信' })).toBeVisible()
    await expect(letter.getByText('附件已领取')).toBeVisible()
    await expect(letter.getByRole('button', { name: '领取附件' })).toHaveCount(0)
    await letter.getByRole('button', { name: '上一封' }).click()
    await expect(letter.getByRole('heading', { name: '临安回音' })).toBeVisible()
    await letter.getByRole('button', { name: '关上' }).click()

    // 删除角色：输入角色名与账号密码，删后回到建角
    await alice.game.getByRole('button', { name: '选择角色' }).click()
    await alice.game.getByRole('alertdialog', { name: '返回选择角色' }).getByRole('button', { name: '返回选择角色' }).click()
    await alice.game.getByRole('button', { name: '删除角色' }).click()
    const confirm = alice.game.getByRole('button', { name: '确认删除' })
    await alice.game.getByLabel(/^输入角色名/).fill(alice.nickname)
    await expect(confirm).toBeDisabled()
    await alice.game.getByLabel('账号密码').fill(alice.password)
    await confirm.click()
    await expect(alice.game.getByRole('button', { name: '创建角色', exact: true })).toBeVisible()
    await expect(alice.game.getByText(alice.nickname)).toHaveCount(0)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
