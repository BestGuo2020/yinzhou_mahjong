import * as THREE from 'three'
import type { TileType } from '../../../game/core/contracts/types'
import type { YingzhouWinDisplay } from '../../../game/variants/yingzhou/winMotion'
import { YINGZHOU_WIN_MOTION } from '../../../game/variants/yingzhou/winMotion'
import { TABLE_LAYOUT } from '../../../game/core/presentation/tableLayout'
import { themePresentationByName } from '../../../theme/themePresentation'
import type { WinEffectPresenterOptions } from './winEffectPresenter'
import { sampleWinningTileFlight, type FlightPose } from './winningTileFlight'
import { DEFAULT_TABLE_SCENE_PROFILE } from './sceneRenderProfile'

type Resources = Pick<WinEffectPresenterOptions, 'ownDynamic' | 'makeFaceTile' | 'props'>

export function addYingzhouTiles(group: THREE.Group, makeTile: Resources['makeFaceTile'], tile: TileType,
  anchor: FlightPose, display: YingzhouWinDisplay) {
  const count = display.zhaIndices.length || 1
  return Array.from({ length: count }, (_, index) => {
    const mesh = makeTile(tile)
    const offset = (index - (count - 1) / 2) * TABLE_LAYOUT.tilePitch
    mesh.position.set(anchor.x + Math.cos(anchor.rotation) * offset, anchor.y,
      anchor.z - Math.sin(anchor.rotation) * offset)
    mesh.rotation.y = anchor.rotation
    group.add(mesh)
    return mesh
  })
}

// White ink is tinted at draw time so fine strokes and soft light follow the active table.
function lightTexture(ring: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  const stops = ring ? [[0, 0], [.69, 0], [.81, .20], [.84, .9], [.86, .2], [1, 0]]
    : [[0, 1], [.12, .9], [.38, .34], [1, 0]]
  for (const [offset, alpha] of stops) glow.addColorStop(offset, `rgba(255,255,255,${alpha})`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 128, 128)
  if (ring) {
    ctx.strokeStyle = 'rgba(255,255,255,.7)'
    ctx.lineWidth = 1.1
    for (let index = 0; index < 4; index++) {
      const angle = index * Math.PI / 2
      ctx.beginPath()
      ctx.arc(64, 64, 48, angle + .09, angle + .92)
      ctx.stroke()
    }
  }
  return new THREE.CanvasTexture(canvas)
}

export function createYingzhouWinEffect(options: Resources, group: THREE.Group, display: YingzhouWinDisplay,
  anchor: FlightPose, source: FlightPose | null, startedAt: number) {
  const { props, ownDynamic } = options
  const effect = props.winEffect!
  const tiles = addYingzhouTiles(group, options.makeFaceTile, effect.tile, anchor, display)
  const palette = themePresentationByName(props.themeName).palette
  const kind = display.kind
  const isZha = display.zhaIndices.length === 3
  const impact = YINGZHOU_WIN_MOTION[kind].impact ?? 0
  const stage = THREE.MathUtils.smoothstep
  const still = effect.reducedMotion
  const motion = !still && kind !== 'self'
  const makeMaterial = (ring: boolean) => ({
    color: palette.accent, map: ownDynamic(lightTexture(ring)), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  let ring: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined
  if (motion && (isZha || kind === 'bloom')) {
    ring = new THREE.Mesh(ownDynamic(new THREE.PlaneGeometry(1, 1)),
      ownDynamic(new THREE.MeshBasicMaterial(makeMaterial(true))))
    ring.position.set(anchor.x, .115, anchor.z)
    ring.rotation.x = -Math.PI / 2
    group.add(ring)
  }
  const flecks: THREE.Sprite[] = []
  if (motion) {
    const material = makeMaterial(false)
    const count = isZha ? 3 : kind === 'rob' ? 7 : 10
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(ownDynamic(new THREE.SpriteMaterial(material)))
      sprite.material.opacity = 0
      sprite.material.color.set(i % 3 ? palette.accent : palette.accentSecondary)
      group.add(sprite)
      flecks.push(sprite)
    }
  }
  const timing = { takeoffAt: startedAt, impactAt: startedAt + impact, landedAt: startedAt + impact + 100 }
  function sample(time: number) {
    const ms = Math.max(0, time - startedAt)
    if (motion && kind === 'rob' && source) {
      const pose = sampleWinningTileFlight(source, anchor, timing, time)
      const tile = tiles[0]
      tile.position.set(pose.x, pose.y, pose.z)
      tile.rotation.y = pose.rotation
      tile.scale.setScalar(pose.scale)
      flecks.forEach((sprite, index) => {
        const lag = (index + 1) * 15
        const trace = sampleWinningTileFlight(source, anchor, timing, time - lag)
        sprite.position.set(trace.x, trace.y + .18, trace.z)
        sprite.scale.setScalar(.37 - index * .035)
        sprite.material.opacity = time - lag <= startedAt ? 0 : .72 * (1 - index / 8) * (1 - stage(ms, impact, impact + 110))
      })
    } else if (motion && isZha) {
      tiles.forEach((tile, index) => {
        const t = stage(ms, index * 130, index * 130 + 250)
        tile.position.y = anchor.y + Math.sin(t * Math.PI) * .6
        const spark = flecks[index]
        spark.position.copy(tile.position)
        spark.position.y += .32
        spark.scale.setScalar(1.3)
        spark.material.opacity = Math.sin(t * Math.PI) * .82
      })
      if (ring) {
        ring.scale.setScalar(3.6 - 1.25 * stage(ms, 0, impact))
        ring.material.opacity = stage(ms, 0, 150) * (1 - stage(ms, impact, impact + 300))
      }
    } else if (motion && kind === 'bloom') {
      const t = stage(ms, impact, impact + 480)
      tiles[0].position.y = anchor.y + .55 * Math.sin(stage(ms, 0, impact) * Math.PI)
      if (ring) {
        ring.scale.setScalar(.85 + 2.8 * t)
        ring.material.opacity = stage(ms, impact - 50, impact) * (1 - t)
      }
      flecks.forEach((sprite, index) => {
        const angle = index * 2.39996
        const radius = (.4 + t * (1 + (index % 3) * .3))
        sprite.position.set(anchor.x + Math.cos(angle) * radius, anchor.y + .24 + Math.sin(t * Math.PI) * .48,
          anchor.z + Math.sin(angle) * radius)
        sprite.scale.setScalar(.15 + (index % 3) * .08)
        sprite.material.opacity = Math.sin(t * Math.PI)
      })
    }
    return time < startedAt + effect.duration ? { exposure: DEFAULT_TABLE_SCENE_PROFILE.exposure, shakeX: 0, shakeZ: 0 } : null
  }
  sample(performance.now())
  return sample
}
