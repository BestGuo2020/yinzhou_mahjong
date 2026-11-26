import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createTileInstanceRenderer } from './tileInstanceRenderer'

describe('tileInstanceRenderer', () => {
  it.each([260, 512])('updates tile matrices through capacity %i without silently truncating a tower', (capacity) => {
    const scene = new THREE.Scene()
    const dynamicGroups: THREE.Object3D[] = []
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const atlasGeometry = geometry.clone()
    const material = new THREE.MeshBasicMaterial()
    scene.userData.tileBaseGeometry = geometry
    scene.userData.tileCapGeometry = geometry
    scene.userData.faceSide = material
    scene.userData.backMaterial = material
    scene.userData.tileSide = material
    scene.userData.tileBottom = material

    const renderer = createTileInstanceRenderer({
      capacity,
      scene,
      dynamicGroups,
      ownDynamic: (resource) => resource,
      getAtlasMaterial: () => material,
      getMarkedDiscardSideMaterial: () => material,
      getAtlasCapGeometry: () => atlasGeometry,
      atlasCellUvFor: () => ({ u: 0, v: 0 }),
    })

    renderer.begin()
    const tile = renderer.add(
      new THREE.Vector3(),
      new THREE.Quaternion(),
      null,
    )
    renderer.finish()

    const baseMesh = dynamicGroups[0] as THREE.InstancedMesh
    const baseVersion = baseMesh.instanceMatrix.version
    const capVersion = tile.capMesh.instanceMatrix.version

    renderer.set(
      tile.baseIndex,
      tile.capMesh,
      tile.capIndex,
      new THREE.Vector3(2, 3, 4),
      new THREE.Quaternion(),
      0.8,
    )

    expect(baseMesh.instanceMatrix.version).toBeGreaterThan(baseVersion)
    expect(tile.capMesh.instanceMatrix.version).toBeGreaterThan(capVersion)
    for (let i = 1; i < capacity; i++) renderer.add(new THREE.Vector3(i, 0, 0), new THREE.Quaternion(), null)
    renderer.finish()
    expect(baseMesh.count).toBe(capacity)
    const last = new THREE.Matrix4()
    baseMesh.getMatrixAt(capacity - 1, last)
    expect(new THREE.Vector3().setFromMatrixPosition(last).x).toBe(capacity - 1)
    expect(() => renderer.add(new THREE.Vector3(), new THREE.Quaternion(), null)).toThrow('capacity exceeded')

    geometry.dispose()
    atlasGeometry.dispose()
    material.dispose()
  })

  it('reuses meshes between batches and keeps marked discard faces identical to ordinary tiles', () => {
    const scene = new THREE.Scene()
    const dynamicGroups: THREE.Object3D[] = []
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const atlasGeometry = geometry.clone()
    const material = new THREE.MeshBasicMaterial()
    const markedSide = new THREE.MeshBasicMaterial()
    scene.userData.tileBaseGeometry = geometry
    scene.userData.tileCapGeometry = geometry
    scene.userData.faceSide = material
    scene.userData.backMaterial = material
    scene.userData.tileSide = material
    scene.userData.tileBottom = material

    const renderer = createTileInstanceRenderer({
      scene,
      dynamicGroups,
      ownDynamic: (resource) => resource,
      getAtlasMaterial: () => material,
      getMarkedDiscardSideMaterial: () => markedSide,
      getAtlasCapGeometry: () => atlasGeometry,
      atlasCellUvFor: face => ({ u: face === 'm3' ? .25 : .5, v: .75 }),
    })

    renderer.begin()
    renderer.add(new THREE.Vector3(), new THREE.Quaternion(), null)
    renderer.finish()
    const firstMeshes = [...dynamicGroups]
    const firstAtlasUv = atlasGeometry.getAttribute('aUvOffset')

    expect(renderer.canReuse()).toBe(true)
    renderer.begin(true)
    renderer.add(new THREE.Vector3(1, 0, 0), new THREE.Quaternion(), null)
    renderer.finish()

    expect(dynamicGroups).toEqual(firstMeshes)
    expect(scene.children).toEqual(firstMeshes)
    expect(atlasGeometry.getAttribute('aUvOffset')).toBe(firstAtlasUv)

    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const ordinary = renderer.add(position, rotation, 'm3')
    const marked = renderer.add(position, rotation, 'm3', 1, position, 1, true)
    const nextMarked = renderer.add(position, rotation, 'p9', 1, position, 1, true)
    renderer.finish()
    expect(marked.capMesh).not.toBe(ordinary.capMesh)
    expect(nextMarked.capMesh).toBe(marked.capMesh)
    expect(marked.capMesh.count).toBe(2)
    const ordinaryMaterials = ordinary.capMesh.material as THREE.Material[]
    const markedMaterials = marked.capMesh.material as THREE.Material[]
    expect(markedMaterials[2]).toBe(ordinaryMaterials[2])
    for (const side of [0, 1, 4, 5]) expect(markedMaterials[side]).toBe(markedSide)
    const uv = (mesh: THREE.InstancedMesh, index: number) =>
      new THREE.Vector2().fromBufferAttribute(mesh.geometry.getAttribute('aUvOffset') as THREE.BufferAttribute, index)
    expect(uv(marked.capMesh, marked.capIndex)).toEqual(uv(ordinary.capMesh, ordinary.capIndex))
    expect(uv(nextMarked.capMesh, nextMarked.capIndex)).toEqual(new THREE.Vector2(.5, .75))
    expect(marked.capMesh.geometry.getAttribute('position').array).toEqual(ordinary.capMesh.geometry.getAttribute('position').array)
    expect(marked.capMesh.geometry.getAttribute('uv').array).toEqual(ordinary.capMesh.geometry.getAttribute('uv').array)
    const matrix = new THREE.Matrix4()
    marked.capMesh.getMatrixAt(marked.capIndex, matrix)
    const ordinaryMatrix = new THREE.Matrix4()
    ordinary.capMesh.getMatrixAt(ordinary.capIndex, ordinaryMatrix)
    expect(matrix).toEqual(ordinaryMatrix)
    renderer.begin(true)
    renderer.add(position, rotation, 'p9')
    renderer.finish()
    expect(marked.capMesh.count).toBe(0)

    markedSide.dispose()
    geometry.dispose()
    atlasGeometry.dispose()
    material.dispose()
  })
})
