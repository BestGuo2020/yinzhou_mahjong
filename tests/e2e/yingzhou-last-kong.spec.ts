import { expect, test, type Locator } from '@playwright/test'
import { createWall } from '../../src/game/core/rules/tiles'
import type { TileType } from '../../src/game/core/contracts/types'

// 对家坐庄，骰子 1+1。本家留三张东风，倒数第二张摸进第四张东风，墙尾亮六筒。
const wall = `
m2 m2 p7 p8 s8 south white s9 p8 p1 p7 s8 s6 m6 s7 m3 p9
s2 west p1 p2 p4 m5 s6 s5 s8 m1 p9 s7 m6 s9 p7 east p6
p2 m8 p9 s3 s5 s1 s4 white east east east m2 s2 p7 s1 p5 m1
m7 m8 m9 s5 west red m8 m3 m4 s3 s4 s4 s3 p8 p8 p2 m6
north m7 s9 p5 p5 red s5 p4 p5 p6 p3 m4 m5 west s4 m3 p6
p1 s9 green m9 s6 s7 m6 s3 m4 green white m5 s8 m5 m3 p3 south
s2 s1 m2 white p2 p3 m1 m1 south green m9 green red m7 north west m8
north s2 m9 p3 p6 m4 p1 south s1 p9 s6 m7 s7 p4 red p4 north
`.trim().split(/\s+/) as TileType[]

async function startWithWall(start: Locator) {
  const tiles = createWall()
  const rolls = [0.625, 0, 0]
  // 给实际洗牌提供能还原这副牌墙的 Fisher–Yates 交换位置。
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = tiles.lastIndexOf(wall[i], i)
    if (j < 0) throw new Error(`牌墙中多出 ${wall[i]}`)
    rolls.push((j + 0.5) / (i + 1))
    ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
  }
  await start.evaluate((button, values) => button.addEventListener('click', () => {
    const original = Math.random
    let i = 0
    Math.random = () => values[i++] ?? original()
    setTimeout(() => { Math.random = original }, 0)
  }, { capture: true, once: true }), rolls)
  await start.click()
}

test.use({ isMobile: true, hasTouch: true, reducedMotion: 'reduce', viewport: { width: 844, height: 390 } })

test('摸进第四张东风时只剩亮六筒，不能开杠，末张弃牌后流局', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?theme=rosewood&quality=low')
  const start = page.getByRole('button', { name: /开始对局/ })
  await expect(start).toBeVisible({ timeout: 35_000 })
  await startWithWall(start)
  const hud = page.locator('.game-table-hud')
  const discard = hud.locator('.hand-rack.playable .mahjong-tile').last()
  const pass = hud.getByRole('button', { name: '过', exact: true })
  // 用真实帧完成开局；轮到本家后才加速中盘的 AI 等待。
  await discard.or(pass).first().waitFor({ timeout: 60_000 })
  await page.clock.install()
  for (;;) {
    const remaining = Number(await hud.getAttribute('data-wall-count'))
    if (remaining === 1 && await discard.isVisible()) break
    if (await discard.isVisible()) await discard.click()
    else if (await pass.isVisible()) await pass.click()
    else if (remaining > 3) await page.clock.fastForward(3000)
    else await discard.or(pass).first().waitFor()
  }
  await expect(hud.getByRole('status', { name: '本局亮牌' })).toContainText('六筒')
  await expect(discard).toHaveAttribute('aria-label', '东风')
  await expect(hud.getByRole('button', { name: '暗杠 东风' })).toHaveCount(0)
  await discard.tap()
  if (await discard.isVisible()) await discard.tap()
  await expect(page.getByRole('dialog', { name: '东1局 · 流局留庄' })).toBeVisible({ timeout: 10_000 })
  await expect(hud).toHaveAttribute('data-wall-count', '1')
})
