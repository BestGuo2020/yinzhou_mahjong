import { expect, test } from '@playwright/test'

test('从大厅逐一重播四种胡法，实桌动作字和胡牌位都可见', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?theme=jade')
  await page.getByRole('link', { name: '特效预览 →' }).click({ timeout: 35_000 })
  const controls = page.getByRole('navigation', { name: '特效预览' })
  const hud = page.locator('.game-table-hud')
  await expect(controls.getByRole('button', { name: '扎杠' })).toBeEnabled({ timeout: 30_000 })
  // Install the clock once the initial automatic example has finished.
  await expect(hud).toHaveAttribute('data-phase', 'settled', { timeout: 15_000 })
  const now = Date.now()
  await page.clock.install({ time: new Date(now) })
  await page.clock.pauseAt(new Date(now + 500))
  for (const [action, title, frame] of [
    ['扎杠', '扎亮牌', 1510], ['抢杠', '抢补杠胡', 1800], ['杠开', '杠上开花', 1360], ['自摸', '自摸', 1170],
  ] as const) {
    await controls.getByRole('button', { name: action }).click({ force: true })
    await page.clock.fastForward(350)
    await expect(hud.locator('.win-cinematic')).toBeAttached()
    let elapsed = 0
    if (action === '抢杠') {
      await page.clock.fastForward(400)
      await page.clock.runFor(32)
      const source = hud.locator('.rob-source-tag')
      await expect(source).toContainText('上家补杠')
      await expect(source).toContainText('五筒')
      await expect(source).toBeInViewport()
      await expect(hud.locator('.win-cinematic')).toHaveCSS('opacity', '0')
      await test.info().attach('第四张停在上家', { body: await page.screenshot(), contentType: 'image/png' })
      await page.clock.fastForward(580)
      await page.clock.runFor(32)
      await expect(source).toHaveCSS('opacity', '0')
      await expect(hud.locator('.win-cinematic')).toHaveCSS('opacity', '0')
      await test.info().attach('五筒飞向本家', { body: await page.screenshot(), contentType: 'image/png' })
      elapsed = 1044
    } else {
      await expect(hud.locator('.hand-tile-slot.in-flight')).toHaveCount(action === '扎杠' ? 3 : 1)
    }
    await page.clock.fastForward(frame - elapsed - 32)
    await page.clock.runFor(32)
    const label = hud.getByRole('img', { name: title, exact: true })
    await expect(label).toBeInViewport()
    const stage = (await hud.locator('.win-stage').boundingBox())!
    const table = (await hud.locator('.mahjong-scene').boundingBox())!
    expect(Math.abs(stage.x + stage.width / 2 - table.x - table.width / 2)).toBeLessThan(1)
    expect(Math.abs(stage.y + stage.height / 2 - table.y - table.height / 2)).toBeLessThan(1)
    expect(await label.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(100)
    expect(await hud.locator('.win-lettering').evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.5)
    await expect(hud.locator('canvas[data-win-effect-seats]')).toHaveAttribute('data-win-effect-seats', '[0]')
    if (action === '抢杠') await expect(hud.locator('.win-byline')).toHaveText('你抢上家的五筒')
    await test.info().attach(title, { body: await page.screenshot(), contentType: 'image/png' })
    if (action === '自摸') {
      await page.clock.fastForward(950)
      await expect(hud.locator('.hand-rack')).toHaveClass(/yingzhou-tip/)
    }
  }
  expect(errors).toEqual([])
})

test('减少动态效果时仍能看清抢杠双方和牌面', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?preview=win-effects&effect=rob')
  const hud = page.locator('.game-table-hud')
  await expect(hud).toHaveAttribute('data-phase', 'settled', { timeout: 30_000 })
  const now = Date.now()
  await page.clock.install({ time: new Date(now) })
  await page.clock.pauseAt(new Date(now + 300))
  await page.getByRole('button', { name: '抢杠', exact: true }).click({ force: true })
  await page.clock.fastForward(350)
  await expect(hud.locator('.win-detail')).toHaveText('你抢上家的五筒')
  await expect(hud.locator('.win-cinematic')).toHaveCount(0)
})
