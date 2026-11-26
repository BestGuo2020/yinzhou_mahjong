import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createDiscardRedraw } from './discardRedraw'

describe('飞牌局部重绘', () => {
  it('沿用整帧分辨率，重画前后位置，恢复相机、阴影和桌面物件的状态', () => {
    const camera = new THREE.PerspectiveCamera(40, 2, .1, 100)
    camera.position.set(0, 12, 14)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const scene = new THREE.Scene()
    const far = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .2))
    far.position.x = 10
    far.castShadow = true
    scene.add(far)
    const light = new THREE.DirectionalLight()
    light.position.set(-4, 22, 6)
    light.updateMatrixWorld()
    light.shadow.updateMatrices(light)
    const map = light.shadow.map = new THREE.WebGLRenderTarget(512, 512)
    const saved = map.scissor.clone(), projection = camera.projectionMatrix.clone()
    let scissor = new THREE.Vector4(0, 0, 800, 400), clipped = false
    const snapshots: { clipped: boolean; shadow: boolean; visible: boolean; size: THREE.Vector4 }[] = []
    const renderer = {
      shadowMap: { enabled: true, type: THREE.PCFShadowMap },
      getSize: (out: THREE.Vector2) => out.set(800, 400),
      getScissorTest: () => clipped,
      setScissorTest: (value: boolean) => { clipped = value },
      getScissor: (out: THREE.Vector4) => out.copy(scissor),
      setScissor: (rect: THREE.Vector4) => { scissor = rect.clone() },
      render: vi.fn(() => { snapshots.push({ clipped, shadow: map.scissorTest, visible: far.visible, size: scissor.clone() }) }),
    }
    const redraw = createDiscardRedraw([far])
    const draw = (id: number, x: number, dirty = false) =>
      redraw.render(renderer as unknown as THREE.WebGLRenderer, scene, camera, light, { id, position: new THREE.Vector3(x, .6, 0) }, dirty)
    draw(1, 0)
    draw(1, .1)
    draw(1, .2)
    expect(snapshots.slice(0, 2).every(s => !s.clipped)).toBe(true)
    expect(snapshots[2]).toMatchObject({ clipped: true, shadow: true, visible: false })
    expect(snapshots[2].size.z).toBeLessThan(250)
    expect(camera.projectionMatrix).toEqual(projection)
    expect(map.scissor).toEqual(saved)
    expect(map.scissorTest).toBe(false)
    expect(clipped).toBe(false)
    expect(far.visible).toBe(true)
    expect(far.castShadow).toBe(true)
    draw(1, .3, true)
    draw(1, .35)
    draw(2, .4)
    redraw.reset()
    draw(2, .5)
    expect(snapshots.slice(3).every(s => !s.clipped)).toBe(true)
    map.dispose()
    far.geometry.dispose()
  })
})
