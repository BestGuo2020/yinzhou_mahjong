import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { WinEffect } from '../../../game/core/contracts/gamePort'
import { WIN_PLAYBACK_RATE, winPlaybackTiming, YINGZHOU_WIN_MOTION, type YingzhouWinDisplay } from '../../../game/variants/yingzhou/winMotion'
import { createYingzhouWinEffect } from './yingzhouWinEffect'
import type { ResolvedTableProps } from './tableRenderTypes'

const anchor = { x: 6, y: .31, z: 5, rotation: Math.PI / 2 }
const source = { x: -4, y: .28, z: -5, rotation: 0 }

function create(kind: YingzhouWinDisplay['kind'], reducedMotion = false) {
  const canvas = { getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}, beginPath() {}, arc() {}, stroke() {} }) }
  vi.stubGlobal('document', { createElement: () => canvas })
  const winEffect: WinEffect = { id: 0, winnerIndex: 1, tile: 'p5', robbedKong: kind === 'rob',
    robbedKongPlayerIndex: 2, robbedKongMeldIndex: 0, duration: winPlaybackTiming(kind).duration, reducedMotion }
  // The renderer reads just the theme and the active win from the table snapshot.
  const props = { winEffect, themeName: 'rosewood' } as ResolvedTableProps
  const group = new THREE.Group()
  const beamStrength = vi.fn()
  const sample = createYingzhouWinEffect({ props, makeFaceTile: () => new THREE.Group(), ownDynamic: x => x },
    group, { kind, zhaIndices: kind === 'nine' || kind === 'indicator' ? [0, 1, 2] : [], revealAt: null }, anchor,
    [source, { ...source, x: -3 }, { ...source, x: -2 }], 1000, reducedMotion ? undefined : beamStrength)
  return { group, sample, beamStrength }
}

afterEach(() => vi.unstubAllGlobals())

describe('颍州胡牌的桌面动画', () => {
  it.each(['self', 'rob', 'bloom', 'indicator', 'nine'] as const)('%s 的光束在落牌后亮起并在亮牌前收束', kind => {
    const { sample, beamStrength } = create(kind)
    const { duration } = winPlaybackTiming(kind)
    sample(1000 + YINGZHOU_WIN_MOTION[kind].beamStart / WIN_PLAYBACK_RATE)
    expect(beamStrength).toHaveBeenLastCalledWith(0)
    sample(1000 + duration - 500)
    expect(beamStrength).toHaveBeenLastCalledWith(1)
    sample(1000 + duration)
    expect(beamStrength).toHaveBeenLastCalledWith(0)
  })
  it('抢杠从第四张的原位直接飞向赢家，短拖尾沿同一条轨迹跟随', () => {
    const { group, sample } = create('rob')
    const tile = group.children[0]
    sample(1000)
    expect(tile.position.toArray()).toEqual([source.x, source.y, source.z])
    sample(1100)
    expect(tile.position.x).toBeGreaterThan(source.x)
    expect(tile.position.x).toBeLessThan(anchor.x)
    const trail = group.children.find(n => n instanceof THREE.Sprite) as THREE.Sprite
    expect(trail.material.opacity).toBeGreaterThan(0)
    expect(trail.position.x).toBeLessThan(tile.position.x)
    sample(1800)
    expect(tile.position.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z))).toBeLessThan(1e-10)
    expect(tile.scale.x).toBeCloseTo(1)
    expect(sample(3075)).toBeNull()
  })

  it.each(['indicator', 'nine'] as const)('%s 三张牌分别从手牌出发并在赢家牌位并拢', kind => {
    const { group, sample } = create(kind)
    const [first, second, third] = group.children
    sample(1000)
    expect([first, second, third].map(tile => tile.position.x)).toEqual([-4,-3,-2])
    sample(1125)
    expect(first.position.y).toBeGreaterThan(second.position.y)
    sample(2125)
    expect(third.position.y).toBeGreaterThan(first.position.y)
    sample(2463)
    for (const tile of [first, second, third]) expect(tile.position.y).toBeCloseTo(anchor.y, 10)
    expect(first.position.z).toBeGreaterThan(second.position.z)
    expect(second.position.z).toBeGreaterThan(third.position.z)
  })

  it('自摸的胡张直接展示在赢家牌位，等待整手推牌', () => {
    const { group, sample } = create('self')
    const tile = group.children[0]
    for (const time of [1000, 1250, 1700]) {
      sample(time)
      expect(tile.position.toArray()).toEqual([anchor.x, anchor.y, anchor.z])
      expect(tile.scale.x).toBe(1)
    }
  })

  it('杠开补牌在展示位短抬，随后原位落下', () => {
    const { group, sample } = create('bloom')
    const tile = group.children[0]
    sample(1000)
    expect(tile.position.toArray()).toEqual([anchor.x, anchor.y, anchor.z])
    sample(1350)
    expect(tile.position.y).toBeCloseTo(anchor.y + .55)
    expect([tile.position.x, tile.position.z, tile.rotation.x]).toEqual([anchor.x, anchor.z, 0])
    sample(1700)
    expect(tile.position.y).toBeCloseTo(anchor.y)
  })

  it.each(['self', 'rob', 'bloom', 'nine'] as const)('减少动态效果时 %s 只保留静止的实际牌', kind => {
    const { group, sample } = create(kind, true)
    const positions = group.children.map(tile => tile.position.toArray())
    expect(group.children).toHaveLength(kind === 'nine' ? 3 : 1)
    sample(1350)
    expect(group.children.map(tile => tile.position.toArray())).toEqual(positions)
  })
})
