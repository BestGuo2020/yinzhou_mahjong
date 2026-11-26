import * as THREE from 'three'
import type { TileType } from '../../../game/core/contracts/types'
import type { TileMarker } from './tileMarker'

interface TileInstanceRendererOptions {
  capacity?: number
  deferMarkerAtlases?: boolean
  scene: THREE.Scene
  /** 实例和缓冲区随整张牌桌释放，跨回合复用。 */
  own<T>(resource: T): T
  getAtlasMaterial(): THREE.Material
  getMarkedDiscardStickerMaterial(): THREE.Material
  getJokerAtlasMaterial?: () => THREE.Material
  getWildcardAtlasMaterial?: () => THREE.Material
  getLaiziAtlasMaterial?: () => THREE.Material
  getAtlasCapGeometry(): THREE.BufferGeometry
  atlasCellUvFor(tile: TileType): { u: number; v: number }
  markerFor?(tile: TileType): TileMarker
  /** 二次元接触阴影：传入牌下阴影所在的桌面 Y（如 0.075），为每张牌铺一块柔和贴片阴影。 */
  contactShadowY?: number
}

const TILE_BASE_OFFSET = new THREE.Matrix4().makeTranslation(0, -.06, 0)
const TILE_CAP_OFFSET = new THREE.Matrix4().makeTranslation(0, .13, 0)
const STICKER_WIDTH = .43
const STICKER_DEPTH = .24
export const CONTACT_SHADOW_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
// 主光在左上（[-4,22,6]），接触阴影应偏向右后（+x、-z），而不是正中心对称的一圈。
export const CONTACT_SHADOW_OFFSET_X = 0.18
export const CONTACT_SHADOW_OFFSET_Z = -0.18

// 牌下柔和贴片阴影：中央平铺暗色矩形、四周模糊渐隐（贴片，不是径向圆圈）。
export function makeContactShadowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(0,0,0,.10)'
  ctx.filter = 'blur(14px)'
  const inset = size * .12
  ctx.fillRect(inset, inset, size - inset * 2, size - inset * 2)
  ctx.filter = 'none'
  return new THREE.CanvasTexture(canvas)
}

export function createTileInstanceRenderer(options: TileInstanceRendererOptions) {
  const INSTANCE_CAPACITY = options.capacity ?? 260
  let baseMesh: THREE.InstancedMesh | null = null
  let backCapMesh: THREE.InstancedMesh | null = null
  let atlasCapMesh: THREE.InstancedMesh | null = null
  type Marker = Exclude<TileMarker, false>
  const markerCaps = new Map<Marker, THREE.InstancedMesh>()
  const markerMaterials = { joker: options.getJokerAtlasMaterial, wildcard: options.getWildcardAtlasMaterial, laizi: options.getLaiziAtlasMaterial }
  let shadowMesh: THREE.InstancedMesh | null = null
  let backCapCount = 0
  let atlasCapCount = 0
  let instanceCount = 0
  let building = false
  let markedDiscardCap: THREE.InstancedMesh | null = null
  let markedStickers: THREE.InstancedMesh | null = null
  const capHalfSize = new THREE.Vector3()
  const stickerPosition = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  const scaleVector = new THREE.Vector3()
  const shadowMatrix = new THREE.Matrix4()
  const shadowPosition = new THREE.Vector3()
  const shadowScale = new THREE.Vector3()

  function createCap(topMaterial: THREE.Material, geometry: THREE.BufferGeometry) {
    const side = options.scene.userData.tileSide
    const cap = options.own(new THREE.InstancedMesh(
      geometry,
      [side, side, topMaterial, options.scene.userData.tileBottom, side, side],
      INSTANCE_CAPACITY,
    ))
    cap.castShadow = true
    cap.receiveShadow = true
    cap.frustumCulled = false
    options.scene.add(cap)
    return cap
  }

  function canReuse() {
    return Boolean(
      baseMesh?.parent === options.scene
      && backCapMesh?.parent === options.scene
      && atlasCapMesh?.parent === options.scene
      && [...markerCaps.values()].every(mesh => mesh.parent === options.scene)
      && (options.contactShadowY == null || shadowMesh?.parent === options.scene),
    )
  }

  function markerCap(marker: Marker) {
    let cap = markerCaps.get(marker)
    if (!cap) {
      const geometry = options.own(options.getAtlasCapGeometry().clone())
      geometry.setAttribute('aUvOffset', new THREE.InstancedBufferAttribute(new Float32Array(INSTANCE_CAPACITY * 2), 2))
      cap = createCap(markerMaterials[marker]?.() ?? options.getAtlasMaterial(), geometry)
      cap.count = 0
      markerCaps.set(marker, cap)
    }
    return cap
  }

  function begin() {
    building = true
    if (!canReuse()) {
      markedDiscardCap = null
      markedStickers = null
      baseMesh = options.own(new THREE.InstancedMesh(
        options.scene.userData.tileBaseGeometry,
        [options.scene.userData.faceSide, options.scene.userData.faceSide, options.scene.userData.faceSide,
          options.scene.userData.backMaterial, options.scene.userData.faceSide, options.scene.userData.faceSide],
        INSTANCE_CAPACITY,
      ))
      baseMesh.castShadow = true
      baseMesh.receiveShadow = true
      baseMesh.frustumCulled = false
      options.scene.add(baseMesh)
      backCapMesh = createCap(options.scene.userData.tileBottom, options.scene.userData.tileCapGeometry)
      atlasCapMesh = createCap(options.getAtlasMaterial(), options.getAtlasCapGeometry())
      markerCaps.clear()
      if (!options.deferMarkerAtlases) {
        for (const marker of ['joker', 'wildcard', 'laizi'] as const) markerCap(marker)
      }
      if (options.contactShadowY != null) {
        const shadowTexture = options.own(makeContactShadowTexture())
        const shadowMaterial = options.own(new THREE.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          depthWrite: false,
        }))
        shadowMesh = options.own(new THREE.InstancedMesh(
          options.own(new THREE.PlaneGeometry(1.15, 1.45)),
          shadowMaterial,
          INSTANCE_CAPACITY,
        ))
        shadowMesh.frustumCulled = false
        shadowMesh.renderOrder = 1
        options.scene.add(shadowMesh)
      }
      atlasCapMesh.geometry.setAttribute('aUvOffset', new THREE.InstancedBufferAttribute(new Float32Array(INSTANCE_CAPACITY * 2), 2))
    }
    backCapCount = 0
    atlasCapCount = 0
    for (const cap of markerCaps.values()) cap.count = 0
    instanceCount = 0
    if (markedDiscardCap) markedDiscardCap.count = 0
  }

  function updateMatrix(mesh: THREE.InstancedMesh, index: number, value: THREE.Matrix4) {
    mesh.setMatrixAt(index, value)
    if (!building) {
      mesh.instanceMatrix.addUpdateRange(index * 16, 16)
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  function set(baseIndex: number, capMesh: THREE.InstancedMesh, capIndex: number, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: number) {
    scaleVector.setScalar(scale)
    matrix.compose(position, quaternion, scaleVector)
    updateMatrix(baseMesh!, baseIndex, matrix.multiply(TILE_BASE_OFFSET))
    matrix.compose(position, quaternion, scaleVector)
    updateMatrix(capMesh, capIndex, matrix.multiply(TILE_CAP_OFFSET))
    if (markedStickers && capMesh === markedDiscardCap) {
      // 牌河的牌只绕 Y 轴转。贴纸一律正对本家，位于牌面可见的右下角。
      const sideways = Math.abs(matrix.elements[2]) > Math.abs(matrix.elements[0])
      const halfWidth = sideways ? capHalfSize.z : capHalfSize.x
      const halfDepth = sideways ? capHalfSize.x : capHalfSize.z
      stickerPosition.setFromMatrixPosition(matrix)
      stickerPosition.x += (halfWidth - STICKER_WIDTH / 2 - .075) * scale
      stickerPosition.z += (halfDepth - STICKER_DEPTH / 2 - .075) * scale
      stickerPosition.y += (capHalfSize.y + .001) * scale
      updateMatrix(markedStickers, capIndex, matrix.makeScale(scale, scale, scale).setPosition(stickerPosition))
    }
    if (shadowMesh && options.contactShadowY != null) {
      shadowPosition.set(position.x + CONTACT_SHADOW_OFFSET_X, options.contactShadowY, position.z + CONTACT_SHADOW_OFFSET_Z)
      shadowScale.setScalar(scale)
      shadowMatrix.compose(shadowPosition, CONTACT_SHADOW_QUAT, shadowScale)
      updateMatrix(shadowMesh, baseIndex, shadowMatrix)
    }
  }

  function add(position: THREE.Vector3, quaternion: THREE.Quaternion, face: TileType | null, scale = 1, initialPosition: THREE.Vector3 | null = null, initialScale: number | null = null, markedDiscard = false) {
    if (instanceCount >= INSTANCE_CAPACITY) throw new Error('Tile instance capacity exceeded')
    const baseIndex = instanceCount++
    if (markedDiscard && face) {
      if (!markedDiscardCap) {
        const geometry = options.own(options.scene.userData.tileCapGeometry.clone())
        geometry.computeBoundingBox()
        geometry.boundingBox.getSize(capHalfSize).multiplyScalar(.5)
        geometry.setAttribute('aUvOffset', new THREE.InstancedBufferAttribute(new Float32Array(INSTANCE_CAPACITY * 2), 2))
        // 牌面仍与普通弃牌共用同一格图集，贴纸作为独立的一层。
        markedDiscardCap = createCap(options.getAtlasMaterial(), geometry)
        markedDiscardCap.name = 'marked-discards'
        markedDiscardCap.count = 0
        markedStickers = options.own(new THREE.InstancedMesh(
          options.own(new THREE.PlaneGeometry(STICKER_WIDTH, STICKER_DEPTH).rotateX(-Math.PI / 2)),
          options.getMarkedDiscardStickerMaterial(), INSTANCE_CAPACITY,
        ))
        markedStickers.name = 'marked-discard-stickers'
        markedStickers.count = 0
        markedStickers.frustumCulled = false
        options.scene.add(markedStickers)
      }
      const capMesh = markedDiscardCap
      const capIndex = capMesh.count++
      const uv = options.atlasCellUvFor(face)
      capMesh.geometry.getAttribute('aUvOffset').setXY(capIndex, uv.u, uv.v)
      set(baseIndex, capMesh, capIndex, initialPosition ?? position, quaternion, initialScale ?? scale)
      return { baseIndex, capMesh, capIndex }
    }
    const marker = face && options.markerFor?.(face)
    const capMesh = marker ? markerCap(marker) : face ? atlasCapMesh! : backCapMesh!
    const capIndex = marker ? capMesh.count++ : face ? atlasCapCount++ : backCapCount++
    if (face) {
      const uv = options.atlasCellUvFor(face)
      capMesh.geometry.getAttribute('aUvOffset').setXY(capIndex, uv.u, uv.v)
    }
    set(baseIndex, capMesh, capIndex, initialPosition ?? position, quaternion, initialScale ?? scale)
    return { baseIndex, capMesh, capIndex }
  }

  function finish() {
    building = false
    baseMesh!.count = instanceCount
    backCapMesh!.count = backCapCount
    atlasCapMesh!.count = atlasCapCount
    if (shadowMesh) shadowMesh.count = instanceCount
    if (markedStickers) markedStickers.count = markedDiscardCap!.count
    for (const mesh of [baseMesh, backCapMesh, atlasCapMesh, ...markerCaps.values(), markedDiscardCap, markedStickers, shadowMesh]) {
      if (!mesh?.count) continue
      for (const attr of [mesh.instanceMatrix, mesh.geometry.getAttribute('aUvOffset') as THREE.BufferAttribute | undefined]) {
        if (!attr) continue
        attr.clearUpdateRanges()
        attr.addUpdateRange(0, mesh.count * attr.itemSize)
        attr.needsUpdate = true
      }
    }
  }

  return { begin, canReuse, add, set, finish }
}

export type TileInstanceRenderer = ReturnType<typeof createTileInstanceRenderer>
