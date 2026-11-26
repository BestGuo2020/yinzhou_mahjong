import * as THREE from 'three'

// 飞牌平放，包围盒涵盖任意座位的旋转、牌底、牌面和“杠后”贴纸。
const tileExtent = new THREE.Vector3(.67, .34, .67)
const feltFloor = -.65

export function createDiscardRedraw(meshes: readonly THREE.Mesh[]) {
  const last = new THREE.Vector3()
  const min = new THREE.Vector3(), max = new THREE.Vector3()
  const point = new THREE.Vector3(), direction = new THREE.Vector3()
  const size = new THREE.Vector2(), screen = new THREE.Vector4(), shadow = new THREE.Vector4()
  const savedShadow = new THREE.Vector4(), savedScreen = new THREE.Vector4()
  const parts = meshes.map(mesh => ({ mesh, bounds: new THREE.Box3().setFromObject(mesh) }))
  const view = new THREE.Frustum(), lightView = new THREE.Frustum(), crop = new THREE.Matrix4()
  const hidden: THREE.Mesh[] = [], shadowSkipped: THREE.Mesh[] = []
  let previousId: number | null = null
  let needsCleanFrame = true

  function projectBox(camera: THREE.Camera, width: number, height: number, pad: number, rect: THREE.Vector4) {
    let x0 = width, x1 = 0, y0 = height, y1 = 0
    for (let i = 0; i < 8; i++) {
      point.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).project(camera)
      const x = (.5 + point.x * .5) * width, y = (.5 + point.y * .5) * height
      x0 = Math.min(x0, x); x1 = Math.max(x1, x)
      y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad))
    x1 = Math.min(width, Math.ceil(x1 + pad)); y1 = Math.min(height, Math.ceil(y1 + pad))
    rect.set(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0))
  }

  // 只用窄视锥剔除桌框、饰件和台芯。真正绘制仍用原相机，边缘像素与完整帧对齐。
  function regionFrustum(camera: THREE.Camera, rect: THREE.Vector4, w: number, h: number, frustum: THREE.Frustum) {
    const sx = w / rect.z, sy = h / rect.w
    crop.set(sx, 0, 0, (w - 2 * rect.x - rect.z) / rect.z,
      0, sy, 0, (h - 2 * rect.y - rect.w) / rect.w, 0, 0, 1, 0, 0, 0, 0, 1)
    frustum.setFromProjectionMatrix(crop.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse))
  }

  function render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera,
    light: THREE.DirectionalLight, discard: { id: number; position: THREE.Vector3 }, dirty: boolean) {
    const previous = previousId
    previousId = discard.id
    min.copy(last).min(discard.position).sub(tileExtent)
    max.copy(last).max(discard.position).add(tileExtent)
    last.copy(discard.position)
    const map = renderer.shadowMap.enabled ? light.shadow.map : null
    const changed = dirty || previous !== discard.id
    // 真机上换牌后的第一张完整帧仍有抗锯齿边缘差异，下一帧完整绘制后再局部复用。
    if (changed || needsCleanFrame || (renderer.shadowMap.enabled && (!map || renderer.shadowMap.type === THREE.VSMShadowMap))) {
      needsCleanFrame = changed
      renderer.render(scene, camera)
      return
    }

    // 阴影贴图在灯光空间保留上帧的深度，仅重新清除和绘制飞牌扫过的区域。
    if (map) projectBox(light.shadow.camera, map.width, map.height, 4, shadow)
    // 桌面仍需重画旧阴影、新阴影和二者之间的遮挡物。
    direction.subVectors(light.target.position, light.position)
    const drop = Math.max(0, max.y - feltFloor)
    const dx = direction.x * drop / -direction.y, dz = direction.z * drop / -direction.y
    min.x += Math.min(0, dx); max.x += Math.max(0, dx)
    min.z += Math.min(0, dz); max.z += Math.max(0, dz)
    min.y = Math.min(min.y, feltFloor)
    if (map) {
      const c = light.shadow.camera
      const texel = Math.max((c.right - c.left) / map.width, (c.top - c.bottom) / map.height)
      const penumbra = texel * (light.shadow.radius + 2) * (1 + Math.hypot(direction.x, direction.z) / -direction.y)
      min.addScalar(-penumbra); max.addScalar(penumbra)
    }
    renderer.getSize(size)
    // 额外一圈桌面像素涵盖 PCF 阴影过滤和抗锯齿的边缘。
    projectBox(camera, size.x, size.y, 8, screen)
    if (!screen.z || !screen.w || (map && (!shadow.z || !shadow.w))) {
      renderer.render(scene, camera)
      return
    }
    regionFrustum(camera, screen, size.x, size.y, view)
    if (map) regionFrustum(light.shadow.camera, shadow, map.width, map.height, lightView)
    const savedTest = renderer.getScissorTest(), savedShadowTest = map?.scissorTest
    renderer.getScissor(savedScreen)
    try {
      for (const { mesh, bounds } of parts) {
        if (!mesh.visible) continue
        const castsHere = map && mesh.castShadow && lightView.intersectsBox(bounds)
        if (!castsHere && !view.intersectsBox(bounds)) { mesh.visible = false; hidden.push(mesh) }
        else if (map && mesh.castShadow && !castsHere) { mesh.castShadow = false; shadowSkipped.push(mesh) }
      }
      if (map) {
        savedShadow.copy(map.scissor)
        map.scissor.copy(shadow)
        map.scissorTest = true
      }
      renderer.setScissor(screen)
      renderer.setScissorTest(true)
      renderer.render(scene, camera)
    } finally {
      for (const mesh of hidden) mesh.visible = true
      for (const mesh of shadowSkipped) mesh.castShadow = true
      hidden.length = shadowSkipped.length = 0
      if (map) { map.scissor.copy(savedShadow); map.scissorTest = savedShadowTest! }
      renderer.setScissor(savedScreen)
      renderer.setScissorTest(savedTest)
    }
  }

  return { render, reset() { previousId = null; needsCleanFrame = true } }
}
