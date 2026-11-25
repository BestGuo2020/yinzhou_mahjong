import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { WinEffect } from '../../../game/core/contracts/gamePort'
import type { YingzhouWinDisplay } from '../../../game/variants/yingzhou/winMotion'
import { createYingzhouWinEffect } from './yingzhouWinEffect'
import type { ResolvedTableProps } from './tableRenderTypes'

const anchor = { x: 6, y: .31, z: 5, rotation: Math.PI / 2 }
const source = { x: -4, y: .28, z: -5, rotation: 0 }

function create(kind: YingzhouWinDisplay['kind'], reducedMotion = false) {
  const canvas = { getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}, beginPath() {}, arc() {}, stroke() {} }) }
  vi.stubGlobal('document', { createElement: () => canvas })
  const winEffect: WinEffect = { id: 0, winnerIndex: 1, tile: 'p5', robbedKong: kind === 'rob',
    robbedKongPlayerIndex: 2, robbedKongMeldIndex: 0, duration: 1200, reducedMotion }
  // The renderer reads just the theme and the active win from the table snapshot.
  const props = { winEffect, themeName: 'rosewood' } as ResolvedTableProps
  const group = new THREE.Group()
  const sample = createYingzhouWinEffect({ props, makeFaceTile: () => new THREE.Group(), ownDynamic: x => x },
    group, { kind, zhaIndices: kind === 'nine' ? [0, 1, 2] : [], revealAt: null }, anchor, source, 1000)
  return { group, sample }
}

afterEach(() => vi.unstubAllGlobals())

describe('颍州胡牌的桌面动画', () => {
  it('抢杠飞牌从被抢座位出发，落到赢家位置，结束后停止请求帧', () => {
    const { group, sample } = create('rob')
    const tile = group.children[0]
    sample(1000)
    expect(tile.position.toArray()).toEqual([source.x, source.y, source.z])
    sample(1170)
    expect(tile.position.y).toBeGreaterThan(anchor.y)
    sample(1640)
    expect(tile.position.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z))).toBeLessThan(1e-10)
    expect(sample(2200)).toBeNull()
  })

  it('扎九的三张牌顺着座位方向排列，依次抬起并回到同一桌面高度', () => {
    const { group, sample } = create('nine')
    const [first, second, third] = group.children
    expect(first.position.z).toBeGreaterThan(second.position.z)
    expect(second.position.z).toBeGreaterThan(third.position.z)
    sample(1125)
    expect(first.position.y).toBeGreaterThan(second.position.y)
    sample(1385)
    expect(third.position.y).toBeGreaterThan(first.position.y)
    sample(1660)
    for (const tile of [first, second, third]) expect(tile.position.y).toBeCloseTo(anchor.y, 10)
  })

  it.each(['self', 'rob', 'bloom', 'nine'] as const)('减少动态效果时 %s 只保留静止的实际牌', kind => {
    const { group, sample } = create(kind, true)
    const positions = group.children.map(tile => tile.position.toArray())
    expect(group.children).toHaveLength(kind === 'nine' ? 3 : 1)
    sample(1350)
    expect(group.children.map(tile => tile.position.toArray())).toEqual(positions)
  })
})
