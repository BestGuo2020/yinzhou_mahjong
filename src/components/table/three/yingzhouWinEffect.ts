import * as THREE from 'three'
import type { TileType } from '../../../game/core/contracts/types'
import type { YingzhouWinDisplay } from '../../../game/variants/yingzhou/winMotion'
import { WIN_PLAYBACK_RATE, YINGZHOU_WIN_MOTION } from '../../../game/variants/yingzhou/winMotion'
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

function angleBetween(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t
}

// Each of the three declared tiles leaves its actual hand slot in turn.
function moveZhaTile(mesh: THREE.Group, source: FlightPose, target: FlightPose, index: number, ms: number, land: number) {
  const stagger = index * 140
  const leave = 160 + stagger
  const lift = THREE.MathUtils.smoothstep(ms, stagger, leave)
  const touch = land - 150 - (2 - index) * 95
  const travel = THREE.MathUtils.smoothstep(ms, leave, touch)
  const settle = THREE.MathUtils.smoothstep(ms, touch, touch + 150)
  const arc = Math.sin(travel * Math.PI)
  const bounce = Math.sin(settle * Math.PI) * (1 - settle)
  // Bow across the open felt, including between two adjacent seats.
  const midX = (source.x + target.x) / 2, midZ = (source.z + target.z) / 2
  const middle = Math.hypot(midX, midZ) || 1
  const bend = Math.min(2.4, Math.hypot(target.x - source.x, target.z - source.z) * .22) * arc
  const fan = (index - 1) * arc * .62
  const raised = lift * (1 - travel)
  mesh.position.set(
    THREE.MathUtils.lerp(source.x, target.x, travel) - bend * midX / middle + Math.cos(target.rotation) * fan,
    THREE.MathUtils.lerp(source.y, target.y, travel) + raised * .85 + arc * 1.8 + bounce * .28,
    THREE.MathUtils.lerp(source.z, target.z, travel) - bend * midZ / middle - Math.sin(target.rotation) * fan,
  )
  const readable = angleBetween(source.rotation, 0, lift * .85)
  const tilt = THREE.MathUtils.lerp(source.tilt ?? 0, -.32, lift) * (1 - travel) - arc * .32
  const roll = arc * (index - 1) * .34
  mesh.rotation.set(tilt, angleBetween(readable, target.rotation, travel), roll, 'YXZ')
  mesh.scale.setScalar(1 + raised * .29 + arc * .55 + bounce * .08)
}

export function createYingzhouWinEffect(options: Resources, group: THREE.Group, display: YingzhouWinDisplay,
  anchor: FlightPose, sources: readonly (FlightPose | null)[], startedAt: number, setBeamStrength?: (strength: number) => void) {
  const { props, ownDynamic } = options
  const effect = props.winEffect!
  const tiles = addYingzhouTiles(group, options.makeFaceTile, effect.tile, anchor, display)
  const palette = themePresentationByName(props.themeName).palette
  const kind = display.kind
  const isZha = display.zhaIndices.length === 3
  const { cinematicStart, beamStart, impact } = YINGZHOU_WIN_MOTION[kind]
  const end = effect.duration * WIN_PLAYBACK_RATE
  const beamPeak = Math.max(impact, beamStart + 160)
  const flight = { takeoffAt: 0, impactAt: impact, landedAt: impact + 100 }
  const targets = tiles.map(tile => ({ x: tile.position.x, y: tile.position.y, z: tile.position.z, rotation: anchor.rotation }))
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
  function sample(time: number) {
    const ms = Math.max(0, time - startedAt) * WIN_PLAYBACK_RATE
    setBeamStrength?.(stage(ms, beamStart, beamPeak) * (1 - stage(ms, end - 350, end)))
    const source = sources[0]
    if (motion && kind === 'rob' && source) {
      const pose = sampleWinningTileFlight(source, anchor, flight, ms)
      tiles[0].position.set(pose.x, pose.y, pose.z)
      tiles[0].rotation.y = pose.rotation
      tiles[0].scale.setScalar(pose.scale)
      flecks.forEach((sprite, index) => {
        const lag = (index + 1) * 15
        const trace = sampleWinningTileFlight(source, anchor, flight, ms - lag)
        sprite.position.set(trace.x, trace.y + .18, trace.z)
        sprite.scale.setScalar(.37 - index * .035)
        sprite.material.opacity = ms <= lag ? 0 : .72 * (1 - index / 8) * (1 - stage(ms, impact, impact + 110))
      })
    } else if (motion && isZha) {
      tiles.forEach((tile, index) => {
        moveZhaTile(tile, sources[index] ?? targets[index], targets[index], index, ms, cinematicStart)
        const spark = flecks[index]
        spark.position.copy(tile.position)
        spark.position.y += .32
        const impactGlow = stage(ms, impact - 60, impact) * (1 - stage(ms, impact, impact + 380))
        spark.scale.setScalar(1.4 + .4 * impactGlow)
        spark.material.opacity = impactGlow * .48
      })
      if (ring) {
        ring.scale.setScalar(4.35 - 1.3 * stage(ms, cinematicStart, impact))
        ring.material.opacity = stage(ms, cinematicStart, impact) * (1 - stage(ms, impact + 160, impact + 520))
      }
    } else if (motion && kind === 'bloom') {
      const t = stage(ms, impact, impact + 480)
      tiles[0].position.y = anchor.y + .55 * Math.sin(stage(ms, 0, impact) * Math.PI)
      if (ring) {
        ring.scale.setScalar(.85 + 3.7 * t)
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
