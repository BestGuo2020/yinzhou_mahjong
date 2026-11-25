import { expect, test } from '@playwright/test'

test('三倍场抢补杠由被抢者独付，输赢数字从左滑入后金币飞向本家', async ({ page }, info) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      if (this.dataset.effectName?.startsWith('coin_')) performance.mark(this.dataset.effectName)
      return play.call(this)
    }
  })
  await page.goto('/?preview=win-effects&effect=rob&coins=3&quality=low&theme=jade')
  const layer = page.getByRole('status', { name: '三倍场金币收付' })
  await expect(layer).toBeVisible({ timeout: 35_000 })
  await expect(layer.locator('.effect-number')).toHaveCount(2)
  await expect(layer.getByRole('img', { name: '+18000000' })).toBeVisible()
  await expect(layer.getByRole('img', { name: '−18000000' })).toBeVisible()
  expect(await layer.locator('text').first().evaluate(el => ({
    family: getComputedStyle(el).fontFamily.split(',')[0],
    loaded: [...document.fonts].some(face => face.family === 'Archivo' && face.status === 'loaded'),
  }))).toEqual({ family: 'Archivo', loaded: true })
  const frames = await layer.locator('.coin-slide').first().evaluate(el =>
    (el.getAnimations()[0].effect as KeyframeEffect).getKeyframes())
  expect(frames[0]).toMatchObject({ opacity: '0', transform: 'translateX(-28%)' })
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.coin-payout canvas')
    const ctx = canvas?.getContext('2d')
    return !!canvas && !!ctx && ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 128)
  })
  await page.screenshot({ path: info.outputPath('coin-flight.png') })
  await expect(layer).toHaveCount(0)
  expect(await page.evaluate(() => performance.getEntriesByType('mark')
    .map(entry => entry.name).filter(name => name.startsWith('coin_')))).toEqual(['coin_flight.ogg'])
})

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
    ['扎杠', '扎亮牌', 1890], ['抢杠', '抢补杠胡', 850], ['杠开', '杠上开花', 875], ['自摸', '自摸', 715],
  ] as const) {
    await controls.getByRole('button', { name: action }).click({ force: true })
    await page.clock.fastForward(350)
    await expect(hud.locator('.win-cinematic')).toBeAttached()
    await expect(hud.locator('.hand-tile-slot.in-flight')).toHaveCount(action === '扎杠' ? 3 : 0)
    await page.clock.fastForward(180)
    await page.clock.runFor(32)
    const opacity = await hud.locator('.win-cinematic').evaluate(el => Number(getComputedStyle(el).opacity))
    if (action === '扎杠') expect(opacity).toBe(0)
    else expect(opacity).toBeGreaterThan(.9)
    if (action === '抢杠') await expect(hud.locator('.rob-source-tag')).toHaveCount(0)
    await page.clock.fastForward(frame - 212 - 32)
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
      await page.clock.fastForward(1200)
      await expect(hud.locator('.hand-rack')).toHaveClass(/yingzhou-tip/)
      await expect(hud.locator('.hand-rack .hand-tile-slot').first()).toHaveCSS('animation-duration', '0.3s')
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
