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
    ['扎杠', '扎亮牌', 790], ['抢杠', '抢补杠胡', 680], ['杠开', '杠上开花', 700], ['自摸', '自摸', 570],
  ] as const) {
    await controls.getByRole('button', { name: action }).click({ force: true })
    await page.clock.fastForward(350)
    await expect(hud.locator('.win-cinematic')).toBeAttached()
    await page.clock.fastForward(frame - 32)
    await page.clock.runFor(32)
    const label = hud.getByRole('img', { name: title, exact: true })
    await expect(label).toBeInViewport()
    expect(await label.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(100)
    expect(await hud.locator('.win-lettering').evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.5)
    await expect(hud.locator('canvas[data-win-effect-seats]')).toHaveAttribute('data-win-effect-seats', '[0]')
    await test.info().attach(title, { body: await page.screenshot(), contentType: 'image/png' })
    if (action === '自摸') {
      await page.clock.fastForward(950)
      await expect(hud.locator('.hand-rack')).toHaveClass(/yingzhou-tip/)
    }
  }
  expect(errors).toEqual([])
})
