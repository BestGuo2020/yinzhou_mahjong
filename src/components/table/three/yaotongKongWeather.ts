import * as THREE from 'three'
import { pointFromSeat } from '../../../game/core/presentation/tableLayout'
import type { KongWeatherCue } from '../../../game/variants/yaotong/kongPresentation'
import { setWeatherFrame, type WeatherAssets } from './yaotongWeatherAssets'

/** Actor-relative right-to-left sweep; the local player's screen X decreases throughout. */
export function kongWindPosition(seat: number, localSeat = 0, progress = .5) {
  const t = THREE.MathUtils.clamp(progress, 0, 1)
  const eased = t * t * (3 - 2 * t)
  const point = pointFromSeat((seat - localSeat + 4) % 4, 2.8 - 6 * eased, 4.35)
  return { x: point.x, y: .09, z: point.z - 1.65 }
}

interface WeatherEffect {
  cue: KongWeatherCue
  root: THREE.Group
  begin(cue: KongWeatherCue, localSeat: number): void
  elapsed: number
  lastFrame: number | null
  frame(elapsed: number, progress: number): void
  dispose(): void
}

function buildWeather(cue: KongWeatherCue, localSeat: number, assets: WeatherAssets, viewAspect: () => number, mobile: boolean): WeatherEffect {
  const root = new THREE.Group()
  root.name = `yaotong-kong-${cue.kind}`
  root.userData.seat = cue.seat
  root.userData.layer = cue.kind === 'rain' ? 'screen' : 'table'
  const resources = new Set<{ dispose(): void }>()
  const fades: Array<{ material: THREE.Material; opacity: number }> = []
  const updates: Array<(seconds: number) => void> = []
  const own = <T extends { dispose(): void }>(value: T) => { resources.add(value); return value }
  const material = <T extends THREE.Material>(value: T) => {
    own(value)
    value.transparent = true
    value.depthWrite = false
    if (cue.kind === 'rain') value.depthTest = false
    value.toneMapped = false
    value.userData.outlineParameters = { visible: false }
    fades.push({ material: value, opacity: value.opacity })
    return value
  }
  const texture = (name: keyof WeatherAssets['textures']) => {
    const value = own(assets.textures[name].clone())
    value.needsUpdate = true
    return value
  }
  const sprite = (map: THREE.Texture, color: number, opacity: number, additive = false) => {
    const item = new THREE.Sprite(material(new THREE.SpriteMaterial({ map, color, opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })))
    root.add(item)
    return item
  }
  const plane = (map: THREE.Texture, color: number, opacity: number, size: number, y: number) => {
    const item = new THREE.Mesh(own(new THREE.PlaneGeometry(size, size)), material(new THREE.MeshBasicMaterial({
      map, color, opacity, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })))
    item.rotation.x = -Math.PI / 2
    item.position.y = y
    root.add(item)
    return item
  }
  const dummy = new THREE.Object3D()

  if (cue.kind === 'tornado') {
    // Original exported storm and wind-ring UV meshes replace the procedural wire coils.
    const stormGeometry = own(assets.meshes.storm.clone())
    stormGeometry.rotateX(-Math.PI / 2)
    const veil = texture('wind')
    veil.wrapS = THREE.RepeatWrapping
    const storm = new THREE.Mesh(stormGeometry, material(new THREE.MeshBasicMaterial({
      map: veil, color: 0xffe8c2, opacity: .48, side: THREE.DoubleSide,
    })))
    storm.scale.setScalar(7.4)
    root.add(storm)
    const pattern = texture('pattern'), mask = texture('mask')
    pattern.wrapS = pattern.wrapT = THREE.RepeatWrapping
    const undercurrent = new THREE.Mesh(own(assets.meshes.ground.clone()), material(new THREE.MeshBasicMaterial({
      map: pattern, alphaMap: mask, color: 0xf5c46f, opacity: .26, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    })))
    undercurrent.rotation.x = -Math.PI / 2
    undercurrent.scale.setScalar(1.65)
    undercurrent.position.y = .025
    root.add(undercurrent)
    const moon = plane(texture('crescent'), 0xffb35b, .85, 3.5, .045)
    const glow = plane(texture('glow'), 0xffb451, .48, 2.6, .035)
    const ringGeometry = own(assets.meshes.ring.clone())
    for (let i = 0; i < 3; i++) {
      const map = texture('ribbon')
      map.wrapS = THREE.RepeatWrapping
      const ring = new THREE.Mesh(ringGeometry, material(new THREE.MeshBasicMaterial({
        map, color: i === 1 ? 0xffd490 : 0xfff3df, opacity: .52 - i * .08, side: THREE.DoubleSide,
      })))
      ring.scale.set(2.3 + i * .85, 3.4, 2.3 + i * .85)
      ring.position.y = .25 + i * .82
      root.add(ring)
      updates.push(seconds => {
        ring.rotation.y = seconds * (i % 2 ? 5 : -6) + i * 2
        ring.rotation.z = Math.sin(seconds * 2 + i) * .09
        map.offset.x = -seconds * .65 + i * .3
      })
    }
    for (let i = 0; i < 2; i++) {
      const mist = sprite(texture('wind'), 0xffecc9, .13)
      mist.scale.set(3.4, 2.3, 1)
      mist.position.y = 1.35 + i * .45
      updates.push(seconds => { mist.material.rotation = Math.sin(seconds * 1.7 + i) * .3 })
    }
    const starMap = texture('star')
    for (let i = 0; i < (mobile ? 6 : 12); i++) {
      const star = sprite(starMap, 0xffdf9b, .8, true)
      updates.push(seconds => {
        const phase = (seconds * .7 + i * .137) % 1, angle = i * 2.4 - seconds * 3.8
        star.position.set(Math.cos(angle) * (1.1 + phase * .65), .2 + phase * 2.6, Math.sin(angle) * (1.1 + phase * .65))
        star.scale.setScalar(.11 + Math.sin(phase * Math.PI) * .08)
        star.material.opacity *= Math.sin(phase * Math.PI)
      })
    }
    updates.push(seconds => {
      storm.rotation.y = -seconds * 4.2
      veil.offset.x = seconds * .3
      pattern.offset.set(seconds * .12, -seconds * .2)
      moon.rotation.z = seconds * 2.1
      glow.material.opacity *= .8 + .2 * Math.sin(seconds * 5)
    })
  } else {
    // Camera-facing foreground rain: no perspective ground planes or local puddle patch.
    for (let i = 0; i < (mobile ? 3 : 5); i++) {
      const map = texture('smoke')
      setWeatherFrame(map, i % 4, 2, 2)
      const cloud = sprite(map, 0x4d95b5, .23)
      cloud.renderOrder = 1
      updates.push(seconds => {
        cloud.position.set(((i % 3) - 1) * viewAspect() * .52, .25 - Math.floor(i / 3) * .6, 0)
        cloud.scale.set(viewAspect() * 1.5, 1.25, 1)
        cloud.material.rotation = Math.sin(seconds * .5 + i) * .08
      })
    }
    const drops = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1)),
      material(new THREE.MeshBasicMaterial({ map: texture('rain'), color: 0xb6dcf4, opacity: .5 })), mobile ? 80 : 160)
    own(drops)
    drops.frustumCulled = false
    drops.renderOrder = 2
    root.add(drops)
    updates.push(seconds => {
      for (let i = 0; i < drops.count; i++) {
        const phase = (i * .173) % 1
        const fall = cue.reducedMotion ? (phase + seconds / .65) % 1 : Math.max(0, seconds / .65 - phase) % 1
        const across = (i * .61803398875) % 1
        dummy.position.set((across * 2 - 1) * (viewAspect() + .13) - fall * .12, 1.15 - fall * 2.3, 0)
        dummy.rotation.set(0, 0, Math.PI / 2 - .06)
        dummy.scale.set(.13 + (i % 5) * .025, .0035 + (i % 3) * .001, 1)
        dummy.updateMatrix()
        drops.setMatrixAt(i, dummy.matrix)
      }
      drops.instanceMatrix.needsUpdate = true
    })
    for (let i = 0; i < (mobile ? 6 : 12); i++) {
      const map = texture('splash')
      const splash = sprite(map, 0xb3d9ed, .36)
      splash.renderOrder = 3
      splash.center.set(.5, .12)
      updates.push(seconds => {
        const time = cue.reducedMotion ? seconds + i * .137 : seconds - .5 - (i * .137) % .75
        const cycle = time % .75, age = cycle / .32
        splash.visible = time >= 0 && age < 1
        splash.position.set(((i * .61803) % 1 * 2 - 1) * viewAspect() * .85, -.66 + (i % 3) * .18 - cycle * .06, 0)
        splash.scale.setScalar(.1 + (i % 3) * .025)
        setWeatherFrame(map, Math.min(15, age * 16), 4, 4)
      })
    }
  }
  // Both supplied 2×1 atlases are decorative tokens; they never generate score transfers.
  const wind = cue.kind === 'tornado'
  const tokenCount = cue.reducedMotion ? 4 : mobile ? 8 : 16
  for (let i = 0; i < tokenCount; i++) {
    const coin = wind ? i % 3 === 0 : i % 3 !== 0
    const map = texture(coin ? 'coin' : 'goldenTile')
    setWeatherFrame(map, i % 2, 2, 1)
    const token = sprite(map, 0xffd18a, .9, true)
    token.name = 'kong-gold-particle'
    token.renderOrder = 4
    const burstSize = cue.reducedMotion ? 8 : tokenCount / 2
    const delay = .16 + (i >= burstSize ? .32 : 0) + (i % burstSize) * .018
    const lifetime = 1.05 + (i % 4) * .12
    const angle = i * 2.39996
    updates.push(seconds => {
      const age = seconds - delay
      token.visible = age >= 0 && age < lifetime
      if (!token.visible) return
      const progress = age / lifetime
      const spread = 1 - Math.exp(-age * 2.2)
      if (wind) {
        // Released pieces trail the moving wind instead of remaining glued to its core.
        const origin = kongWindPosition(cue.seat, localSeat, cue.reducedMotion ? .5 : delay * 1000 / cue.duration)
        token.position.set(origin.x - root.position.x + Math.cos(angle) * spread * 2,
          .4 + (2.1 + i % 3 * .3) * age - 1.6 * age * age,
          origin.z - root.position.z + Math.sin(angle) * spread * 1.2)
      } else {
        token.position.set(Math.cos(angle) * spread * viewAspect() * .7,
          -.25 + Math.sin(angle) * spread * .4 + 1.15 * age - .65 * age * age, 0)
      }
      // The source frames have wide transparent margins; size for the visible glyph, not the atlas cell.
      const size = wind ? .72 + i % 3 * .14 : .12 + i % 3 * .02
      const turn = .45 + .55 * Math.abs(Math.cos(age * (7 + i % 3) + i))
      token.scale.set(size * turn, size, 1)
      token.material.rotation = angle + age * (i % 2 ? 2.8 : -2.8)
      token.material.opacity *= Math.min(1, progress / .12, (1 - progress) / .3)
    })
  }
  return {
    get cue() { return cue }, root, elapsed: 0, lastFrame: null,
    begin(next, seat) {
      cue = next
      localSeat = seat
      root.userData.seat = next.seat
      this.elapsed = 0
      this.lastFrame = null
    },
    frame(elapsed, progress) {
      const fade = Math.min(1, progress / .12, (1 - progress) / .24)
      if (cue.kind === 'tornado') {
        const position = kongWindPosition(cue.seat, localSeat, cue.reducedMotion ? .5 : progress)
        root.position.set(position.x, position.y, position.z)
        root.scale.setScalar(cue.reducedMotion ? .8 : .8 + .2 * Math.min(1, progress / .16))
      }
      fades.forEach(({ material, opacity }) => { material.opacity = opacity * Math.max(0, fade) })
      updates.forEach(update => update(cue.reducedMotion ? .45 : elapsed / 1000))
    },
    dispose() { root.removeFromParent(); resources.forEach(resource => resource.dispose()); resources.clear() },
  }
}

export function createYaotongKongWeather(options: {
  scene: THREE.Scene
  cues(): readonly KongWeatherCue[]
  localSeat(): number
  assets: WeatherAssets | null
  mobile?: boolean
}) {
  const active = new Map<number, WeatherEffect>()
  const idle = new Map<KongWeatherCue['kind'], WeatherEffect>()
  const screenScene = new THREE.Scene()
  const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10)
  screenCamera.position.z = 5
  let aspect = 1
  let localSeat = options.localSeat()
  function release(effect: WeatherEffect) {
    active.delete(effect.cue.id)
    if (options.mobile && !idle.has(effect.cue.kind)) {
      effect.root.removeFromParent()
      idle.set(effect.cue.kind, effect)
    } else effect.dispose()
  }
  function dispose() {
    for (const effect of active.values()) {
      effect.dispose()
      effect.cue.onPlaybackEnd?.()
    }
    active.clear()
    idle.forEach(effect => effect.dispose())
    idle.clear()
  }
  async function prewarm(renderer: THREE.WebGLRenderer, camera: THREE.Camera, reducedMotion: boolean) {
    if (!options.mobile || !options.assets) return
    for (const kind of ['tornado', 'rain'] as const) {
      const effect = buildWeather({ kind, id: -1, seat: 0, startedAt: 0, duration: 1, reducedMotion },
        localSeat, options.assets, () => aspect, true)
      idle.set(kind, effect)
      effect.root.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return
        const mat = object.material as THREE.MeshBasicMaterial
        if (mat.map) renderer.initTexture(mat.map)
        if (mat.alphaMap) renderer.initTexture(mat.alphaMap)
      })
      await renderer.compileAsync(effect.root, kind === 'rain' ? screenCamera : camera, kind === 'rain' ? screenScene : options.scene)
    }
  }
  function animate(now: number) {
    const cues = options.cues()
    if (!options.assets) {
      cues.forEach(cue => cue.onPlaybackEnd?.())
      return false
    }
    if (options.localSeat() !== localSeat) { dispose(); localSeat = options.localSeat() }
    const live = cues.filter(cue => cue.onPlaybackEnd || (now >= cue.startedAt && now < cue.startedAt + cue.duration)).slice(-4)
    // Consecutive concealed kongs refresh one rain curtain instead of darkening the screen repeatedly.
    const latestRain = live.filter(cue => cue.kind === 'rain').at(-1)
    const current = live.filter(cue => cue.kind !== 'rain' || cue === latestRain)
    for (const [id, effect] of active) {
      if (!current.some(cue => cue.id === id && cue.kind === effect.cue.kind && cue.onPlaybackEnd === effect.cue.onPlaybackEnd)) release(effect)
    }
    for (const cue of current) {
      let effect = active.get(cue.id)
      if (!effect) {
        effect = idle.get(cue.kind)
        idle.delete(cue.kind)
        if (effect && effect.cue.reducedMotion !== cue.reducedMotion) { effect.dispose(); effect = undefined }
        effect ??= buildWeather(cue, localSeat, options.assets, () => aspect, !!options.mobile)
        effect.begin(cue, localSeat)
        const layer = cue.kind === 'rain' ? screenScene : options.scene
        layer.add(effect.root)
        active.set(cue.id, effect)
      }
      if (cue.onPlaybackEnd) {
        // 跳过加载或单次长帧消耗的墙钟时间，避免风跨过半张桌子、雨幕突然铺满。
        const delta = effect.lastFrame === null ? 0 : Math.max(0, now - effect.lastFrame)
        effect.elapsed += cue.reducedMotion ? delta : Math.min(delta, 80)
        effect.lastFrame = now
        if (effect.elapsed >= cue.duration) { release(effect); cue.onPlaybackEnd(); continue }
      } else effect.elapsed = now - cue.startedAt
      effect.frame(effect.elapsed, effect.elapsed / cue.duration)
    }
    return active.size > 0
  }
  function setAspect(value: number) {
    if (!Number.isFinite(value) || value <= 0 || value === aspect) return
    aspect = value
    screenCamera.left = -aspect
    screenCamera.right = aspect
    screenCamera.updateProjectionMatrix()
  }
  function renderOverlay(renderer: Pick<THREE.WebGLRenderer, 'autoClear' | 'clearDepth' | 'render'> & { info?: { autoReset: boolean } }) {
    if (!screenScene.children.length) return
    const autoClear = renderer.autoClear
    const autoReset = renderer.info?.autoReset
    try {
      renderer.autoClear = false
      if (renderer.info) renderer.info.autoReset = false
      renderer.clearDepth()
      renderer.render(screenScene, screenCamera)
    } finally {
      renderer.autoClear = autoClear
      if (renderer.info && autoReset !== undefined) renderer.info.autoReset = autoReset
    }
  }
  return { animate, dispose, prewarm, setAspect, renderOverlay, screenScene,
    get visibleCues() { return [...active.values()].map(effect => ({ seat: effect.cue.seat, kind: effect.cue.kind })) },
    get visibleLayouts() { return [...active.values()].map(effect => ({ seat: effect.cue.seat, kind: effect.cue.kind, layer: effect.root.userData.layer,
      elapsed: effect.elapsed, x: effect.root.position.x, z: effect.root.position.z })) },
  }
}
