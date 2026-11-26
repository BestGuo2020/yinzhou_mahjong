#!/usr/bin/env node
// Regenerate the legacy Yaotong share cover from game tile assets.
// Requires the project's Playwright Chromium and a Chinese system font.
// Run: node scripts/generate-seo-assets.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')
const tileImages = Object.fromEntries(await Promise.all(
  ['1p', '1s', '8p', '1m'].map(async (tile) => [
    tile, `data:image/png;base64,${(await readFile(join(publicDir, 'tiles', `${tile}.png`))).toString('base64')}`,
  ]),
))

function tileCard(tile, x, y, width, height) {
  return `<g filter="url(#tile-shadow)">
    <rect x="${x}" y="${y + 7}" width="${width}" height="${height}" rx="13" fill="#809579"/>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="13" fill="#fff" stroke="#cad3bb" stroke-width="2"/>
    <image x="${x + 8}" y="${y + 8}" width="${width - 16}" height="${height - 16}" href="${tileImages[tile]}" preserveAspectRatio="xMidYMid meet"/>
  </g>`
}

const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="幺筒麻将分享封面">
  <title>幺筒麻将 · 一筒入局，好戏开场</title>
  <desc>幺筒麻将分享封面，展示一筒与三种固定鸡：幺鸡（一条）、八筒、一万。</desc>
  <defs>
    <linearGradient id="table" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#102e24"/><stop offset="1" stop-color="#1c4937"/>
    </linearGradient>
    <filter id="tile-shadow" x="-40%" y="-30%" width="180%" height="180%">
      <feDropShadow dx="0" dy="18" stdDeviation="12" flood-color="#061b13" flood-opacity="0.4"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#table)"/>
  <rect x="28" y="28" width="1144" height="574" rx="24" fill="none" stroke="#c7b47b" stroke-opacity="0.38"/>
  <g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif">
    <text x="80" y="139" font-size="22" letter-spacing="3" fill="#c7b47b">108 张牌 · 四人本地对局</text>
    <text x="75" y="254" font-size="88" font-weight="700" letter-spacing="4" fill="#f1f0df">幺筒麻将</text>
    <text x="80" y="316" font-size="34" fill="#e3e8d4">一筒入局，好戏开场</text>
    <text x="80" y="367" font-size="23" fill="#a9c3b1">碰杠有章法，每一笔结算都清楚。</text>
    <g fill="#244f3d" stroke="#739480" stroke-opacity="0.6">
      <rect x="80" y="409" width="146" height="48" rx="24"/>
      <rect x="244" y="409" width="146" height="48" rx="24"/>
      <rect x="408" y="409" width="146" height="48" rx="24"/>
    </g>
    <g font-size="21" text-anchor="middle" fill="#e3e8d4">
      <text x="153" y="440">一筒癞子</text>
      <text x="317" y="440">报听翻鸡</text>
      <text x="481" y="440">逐笔结算</text>
    </g>
    <path d="M80 517H1120" stroke="#c7b47b" stroke-opacity="0.3"/>
    <text x="80" y="562" font-size="20" fill="#a9c3b1">yaotongmahjong.guoguo-labs.online</text>
  </g>
  <g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" text-anchor="middle">
    <text x="692" y="183" font-size="23" fill="#c7b47b">幺筒</text>
    <text x="960" y="221" font-size="21" fill="#c7b47b">三种固定鸡</text>
    <path d="M800 235H1120" stroke="#c7b47b" stroke-opacity="0.3"/>
    ${tileCard('1p', 620, 210, 144, 192)}
    ${tileCard('1s', 800, 258, 96, 128)}
    ${tileCard('8p', 912, 258, 96, 128)}
    ${tileCard('1m', 1024, 258, 96, 128)}
    <g fill="#e3e8d4">
      <text x="692" y="438" font-size="24">一筒</text>
      <text x="848" y="422" font-size="21">幺鸡</text>
      <text x="960" y="422" font-size="21">八筒</text>
      <text x="1072" y="422" font-size="21">一万</text>
    </g>
    <g font-size="16" fill="#a9c3b1">
      <text x="692" y="467">本牌 / 癞子</text>
      <text x="848" y="448">一条</text>
    </g>
  </g>
</svg>`

await writeFile(join(publicDir, 'social-preview.svg'), `${cover}\n`)

const browser = await chromium.launch({ channel: 'chromium', headless: true })
try {
  async function render(svg, name, width, height = width) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    try {
      await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
        <style>html,body{margin:0;width:100%;height:100%}body>svg{display:block;width:100%;height:100%}</style>
        </head><body>${svg}</body></html>`)
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: join(publicDir, name), type: 'png', scale: 'css' })
      process.stdout.write(`${name}: ${width}x${height}\n`)
    } finally {
      await page.close()
    }
  }
  await render(cover, 'social-preview.png', 1200, 630)
} finally {
  await browser.close()
}
