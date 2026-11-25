import type { WinKind } from '../../game/variants/yingzhou/rules'

export const winArtwork = {
  indicator: { texture: 'ring', label: '扎亮牌' }, nine: { texture: 'ring', label: '扎九' },
  rob: { texture: 'slash', label: '抢补杠胡' }, bloom: { texture: 'shock', label: '杠上开花' },
  self: { texture: 'silk', label: '自摸' },
} as const
export const assetUrl = (name: string) => `${import.meta.env.BASE_URL}effects/yingzhou/${name}.webp`
export const clamp = (n: number) => Math.min(1, Math.max(0, n))
export function ramp(t: number, from: number, to: number) {
  const k = clamp((t - from) / (to - from))
  return k * k * (3 - 2 * k)
}

const images = new Map<string, HTMLImageElement>()
export function artwork(name: string) {
  let image = images.get(name)
  if (!image) {
    image = new Image()
    image.src = assetUrl(name)
    images.set(name, image)
  }
  return image
}
export function warmWinArtwork() {
  for (const [kind, art] of Object.entries(winArtwork)) {
    artwork(art.texture)
    artwork('title-' + kind)
  }
}

// Each fragment has a stable path and a rotating bright/dark face. Sampling by
// time keeps the launch and impact together even when a mobile frame is dropped.
const fragments = Array.from({ length: 68 }, (_, i) => ({
  angle: i * 2.399963, depth: ((i * 37 + 19) % 89) / 89, twist: (i % 9 - 4) * 1.35,
  delay: (i * 17 % 96), extent: 140 + i * 47 % 310, size: 1.5 + (i * 23 % 29) / 5,
}))

export function paintWinFrame(ctx: CanvasRenderingContext2D, kind: WinKind, ms: number, impact: number) {
  const image = artwork(winArtwork[kind].texture)
  const charge = ramp(ms, 0, impact)
  const hit = Math.max(0, ms - impact)
  const release = ramp(ms, impact, impact + 820)
  const flash = ms >= impact ? Math.exp(-hit / 115) : 0
  const isRing = kind === 'indicator' || kind === 'nine'
  ctx.save()
  ctx.translate(500, 278)
  ctx.globalCompositeOperation = 'lighter'

  function plate(x: number, y: number, w: number, h: number, spin: number, opacity: number) {
    if (!image.complete || !image.naturalWidth || opacity <= 0) return
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(spin)
    ctx.globalAlpha = clamp(opacity)
    ctx.drawImage(image, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
  if (isRing) {
    const growth = .46 + charge * .56 + flash * .10
    // The corona writes itself around the three tiles, then counter-rotates a second rim.
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, 650, -2.3, -2.3 + Math.PI * 2 * Math.min(1, charge * 1.6 + .035))
    ctx.closePath()
    ctx.clip()
    plate(0, 0, 730 * growth, 478 * growth, -.46 + charge * .39 + release * .14, .9)
    ctx.restore()
    plate(0, 4, 875 + release * 53, 505 + release * 25, .26 - charge * .43, .27 * charge)
    ctx.save()
    ctx.scale(1, .66)
    for (let n = 0; n < 3; n++) {
      const a = n * Math.PI * 2 / 3 + charge * 2.2 + ms * .00018
      const radius = 250 + n * 9 + 49 * (1 - charge)
      ctx.beginPath()
      ctx.arc(0, 0, radius, a, a + .69 + charge * .3)
      ctx.strokeStyle = 'rgba(255,224,148,.82)'
      ctx.lineWidth = 1.4 + flash * 2
      ctx.stroke()
      ctx.fillStyle = '#fff4c5'
      ctx.beginPath()
      ctx.arc(Math.cos(a) * radius, Math.sin(a) * radius, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  } else if (kind === 'rob') {
    const cut = ramp(ms, 45, impact)
    ctx.save()
    ctx.beginPath()
    const x = -650 + cut * 1450
    ctx.moveTo(-650, -330); ctx.lineTo(x + 150, -330)
    ctx.lineTo(x - 160, 330); ctx.lineTo(-650, 330); ctx.closePath(); ctx.clip()
    plate((1 - cut) * -85, 5 - (1 - cut) * 95, 890 + flash * 70, 455, .065 - cut * .08, 1)
    ctx.restore()
    plate(50 + release * 65, -15 - release * 18, 840, 365, -.06, flash * .75)
  } else if (kind === 'bloom') {
    plate(0, 2, 280 + charge * 465 + release * 125, 170 + charge * 290 + release * 55, -.1 + charge * .1, charge)
    plate(0, 2, 760 + release * 350, 465 + release * 190, .12 + release * .16, flash * .8)
  } else {
    // Two separately moving sweeps meet beneath the lettering.
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(side < 0 ? -550 : 0, -325, 550, 650)
      ctx.clip()
      plate(side * (1 - charge) * 160, 46 - charge * 44, 788 + release * 56, 440,
        side * (1 - charge) * .17, .2 + charge * .75)
      ctx.restore()
    }
  }
  // A horizontal lens glint at the strike, kept local to the title.
  if (flash > .02) {
    ctx.save()
    ctx.scale(kind === 'rob' ? 7 : 4.8, .34)
    const light = ctx.createRadialGradient(0, 0, 0, 0, 0, 92)
    light.addColorStop(0, `rgba(255,251,211,${.92 * flash})`)
    light.addColorStop(.22, `rgba(255,192,91,${.68 * flash})`)
    light.addColorStop(1, 'rgba(250,131,31,0)')
    ctx.fillStyle = light; ctx.fillRect(-92, -92, 184, 184)
    ctx.restore()
  }
  for (const f of fragments) {
    const emitted = ms - impact - f.delay
    const t = clamp(emitted / (720 + f.depth * 610))
    const path = 1 - (1 - t) ** 2
    const ca = Math.cos(f.angle), sa = Math.sin(f.angle)
    const strength = kind === 'self' ? .64 : 1
    let x = ca * (82 + path * f.extent) * strength
    let y = sa * (42 + path * f.extent * .56) + t * t * 45
    if (kind === 'rob') y = y * .5 - x * .35
    if (isRing && emitted < 0) {
      const a = f.angle + charge * 1.5
      x = Math.cos(a) * (363 - charge * 85); y = Math.sin(a) * (185 - charge * 32)
    }
    const opacity = emitted < 0 ? (isRing ? charge * .5 : 0) : (1 - ramp(t, .35, 1)) * strength
    if (opacity < .02) continue
    ctx.save()
    ctx.translate(x, y); ctx.rotate(f.angle + t * f.twist)
    const size = f.size * (emitted < 0 ? .38 : 1)
    const fold = Math.cos(t * 9 + f.angle)
    ctx.globalAlpha = opacity * (.36 + .64 * Math.abs(fold))
    ctx.fillStyle = fold > 0 ? '#fff0b7' : '#c28b45'
    ctx.beginPath()
    ctx.moveTo(-size, 0); ctx.lineTo(size * .3, -size * (.18 + .5 * Math.abs(fold)))
    ctx.lineTo(size, size * .13); ctx.lineTo(0, size * .42); ctx.closePath(); ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}
