import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { WinEffect } from '../../../game/core/contracts/gamePort'
import { YINGZHOU_WIN_MOTION, type YingzhouWinDisplay } from '../../../game/variants/yingzhou/winMotion'
import { createYingzhouWinEffect } from './yingzhouWinEffect'
import type { ResolvedTableProps } from './tableRenderTypes'

const anchor = { x: 6, y: .31, z: 5, rotation: Math.PI / 2 }
const source = { x: -4, y: .28, z: -5, rotation: 0 }

function create(kind: YingzhouWinDisplay['kind'], reducedMotion = false) {
  const canvas = { getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}, beginPath() {}, arc() {}, stroke() {} }) }
  vi.stubGlobal('document', { createElement: () => canvas })
  const winEffect: WinEffect = { id: 0, winnerIndex: 1, tile: 'p5', robbedKong: kind === 'rob',
    robbedKongPlayerIndex: 2, robbedKongMeldIndex: 0, duration: YINGZHOU_WIN_MOTION[kind].duration, reducedMotion }
  // The renderer reads just the theme and the active win from the table snapshot.
  const props = { winEffect, themeName: 'rosewood' } as ResolvedTableProps
  const group = new THREE.Group()
  const sample = createYingzhouWinEffect({ props, makeFaceTile: () => new THREE.Group(), ownDynamic: x => x },
    group, { kind, zhaIndices: kind === 'nine' ? [0, 1, 2] : [], revealAt: null }, anchor,
    [source, { ...source, x: -3 }, { ...source, x: -2 }], 1000)
  return { group, sample }
}

afterEach(() => vi.unstubAllGlobals())

describe('颍州胡牌的桌面动画', () => {
  it('抢杠飞牌从被抢座位出发，落到赢家位置，结束后停止请求帧', () => {
    const { group, sample } = create('rob')
    const tile = group.children[0]
    sample(1000)
    expect(tile.position.toArray()).toEqual([source.x, source.y, source.z])
    sample(1280)
    const held = tile.position.clone()
    expect([held.x, held.z]).toEqual([source.x, source.z])
    expect(held.y).toBeGreaterThan(source.y + 1)
    expect(tile.scale.x).toBeGreaterThan(1.6)
    sample(1640)
    expect(tile.position.equals(held)).toBe(true)
    sample(1980)
    expect(tile.position.x).toBeGreaterThan(source.x)
    expect(tile.position.x).toBeLessThan(anchor.x)
    expect(tile.position.y).toBeGreaterThan(held.y)
    expect(group.children.filter(n => n instanceof THREE.Sprite).every(s => s.material.opacity === 0)).toBe(true)
    sample(2460)
    expect(tile.position.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z))).toBeLessThan(1e-10)
    expect(tile.scale.x).toBeCloseTo(1)
    expect(sample(3480)).toBeNull()
  })

  it('扎九的三张牌顺着座位方向排列，依次抬起并回到同一桌面高度', () => {
    const { group, sample } = create('nine')
    const [first, second, third] = group.children
    sample(1000)
    expect([first, second, third].map(tile => tile.position.x)).toEqual([-4,-3,-2])
    sample(1125)
    expect(first.position.y).toBeGreaterThan(second.position.y)
    sample(1900)
    expect(third.position.y).toBeGreaterThan(first.position.y)
    sample(2170)
    for (const tile of [first, second, third]) expect(tile.position.y).toBeCloseTo(anchor.y, 10)
    expect(first.position.z).toBeGreaterThan(second.position.z)
    expect(second.position.z).toBeGreaterThan(third.position.z)
  })

  it.each(['self', 'bloom'] as const)('%s 从实际摸牌位升起，翻面落位后才出字', kind => {
    const { group, sample } = create(kind)
    const tile = group.children[0]
    const timing = YINGZHOU_WIN_MOTION[kind]
    sample(1000)
    expect(tile.position.toArray()).toEqual([source.x, source.y, source.z])
    sample(1000 + (timing.takeoff + timing.land - 150) / 2)
    expect(tile.scale.x).toBeGreaterThan(2)
    if (kind === 'bloom') expect(tile.rotation.x).toBeGreaterThan(.4)
    else expect(tile.rotation.x).toBeLessThan(-.25)
    sample(1000 + timing.land)
    expect(tile.position.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z))).toBeLessThan(1e-10)
  })

  it.each(['self', 'rob', 'bloom', 'nine'] as const)('减少动态效果时 %s 只保留静止的实际牌', kind => {
    const { group, sample } = create(kind, true)
    const positions = group.children.map(tile => tile.position.toArray())
    expect(group.children).toHaveLength(kind === 'nine' ? 3 : 1)
    sample(1350)
    expect(group.children.map(tile => tile.position.toArray())).toEqual(positions)
  })
})
