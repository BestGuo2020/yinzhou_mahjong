import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createTableTilePresenter } from './tableTilePresenter'
import type { TileInstanceRenderer } from './tileInstanceRenderer'
import type { ResolvedTableProps } from './tableRenderTypes'
import type { GamePlayer, Meld, TableActionType, TileType } from '../../../game/core/contracts/types'
import * as winEffect from '../../../game/core/presentation/winEffect'
import { discardTileLayout } from '../../../game/core/presentation/tableLayout'
import { wallStackSlot, WALL_TOTAL } from '../../../game/core/rules/wallLayout'

function setup(meld?: Meld, action?: TableActionType) {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const scene = new THREE.Scene()
  scene.userData.tileImages = {}
  scene.userData.highlightMaterial = new THREE.MeshBasicMaterial()
  const rendered: { face: TileType | null; position: THREE.Vector3; rotation: THREE.Quaternion; scale: number }[] = []
  const instances = {
    begin: () => { rendered.length = 0 }, finish: () => {}, canReuse: () => false,
    add: (position: THREE.Vector3, _q: THREE.Quaternion, face: TileType | null, _opacity = 1, origin = position, scale = 1) => {
      const index = rendered.length
      rendered.push({ face, position: origin.clone(), rotation: _q.clone(), scale })
      return { baseIndex: index, capIndex: index, capMesh: {} }
    },
    set: (index: number, _mesh: unknown, _cap: number, position: THREE.Vector3, _q: THREE.Quaternion, scale: number) => {
      rendered[index].position.copy(position); rendered[index].rotation.copy(_q); rendered[index].scale = scale
    },
  } as unknown as TileInstanceRenderer
  const players: GamePlayer[] = [0, 1, 2, 3].map(seat => ({ seat, name: `${seat}`, avatar: '', score: 2000,
    hand: [], discards: [], melds: seat === 0 && meld ? [meld] : [], redCount: 0, drawnTileIndex: -1 }))
  const props = { players, localSeat: 0, currentPlayer: 0, wall: [], wallHeadDrawn: 0, wallCount: 0,
    horses: [], jokerTiles: [], wildcardTiles: [], revealHands: false, winnerIndex: -1,
    winEffect: null, winPresentation: null, dealAnimation: { playerIndex: -1, count: 0, serial: 0 },
    openingStage: null, diceValues: [1, 2], dealerIndex: 0, diceThrowerIndex: 0, flipStack: null,
    flipTile: null, wallBreakIndex: 0, lastDiscard: null,
    tableActionEvent: action ? { id: 1, type: action, actorIndex: 0, sourceIndex: 1, tile: 'm5', meldIndex: 0 } : null,
  } as unknown as ResolvedTableProps
  const dynamicGroups: THREE.Object3D[] = []
  const presenter = createTableTilePresenter({ props, scene, dynamicGroups, ownDynamic: value => value,
    clearDynamicScene: () => { dynamicGroups.splice(0).forEach(g => g.removeFromParent()) },
    makeFaceTile: () => new THREE.Group(), tableScene: { makeDimmedHorseTile: () => new THREE.Group(),
      makeGoldGlow: () => new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()), makeGoldVerticalGlow: () => new THREE.Sprite() },
    tileInstances: instances, tileLayerZ: -1, playAreaOffsetZ: -1.65, tileGapOffset: .685,
    pointGapOffset: .965, wallDealOriginY: 1,
    addWinEffect: () => {}, addWinningDisplayTile: () => {},
  })
  return { props, rendered, presenter, dynamicGroups, setNow: (t: number) => { now = t } }
}

afterEach(() => vi.restoreAllMocks())

describe('shared normal tile animations survive state refreshes', () => {
  it.each([0, 1, 2, 3])('座位%s的首鸡横放且预留宽度；被取走后不把标记自动转给下一张', seat => {
    const s = setup()
    s.props.players[seat].discards = ['s2', 's1', 's1']
    s.props.sidewaysDiscards = [0, 1, 2, 3].map(i => i === seat ? [1] : [])
    s.presenter.rebuild()
    const chicken = s.rendered.filter(t => t.face === 's1')
    const base = discardTileLayout(seat, 1)
    const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, base.rotation, 0))
    const sideways = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, base.rotation + Math.PI / 2, 0))
    expect(chicken[0].rotation.angleTo(sideways)).toBeLessThan(.00001)
    expect(chicken[1].rotation.angleTo(upright)).toBeLessThan(.00001)
    const ordinary = discardTileLayout(seat, 2)
    expect(chicken[1].position.distanceTo(new THREE.Vector3(ordinary.x, .28, ordinary.z - 1.65))).toBeGreaterThan(.2)
    s.props.players[seat].discards.splice(1, 1); s.props.sidewaysDiscards = [[], [], [], []]
    s.presenter.rebuild()
    expect(s.rendered.find(t => t.face === 's1')!.rotation.angleTo(upright)).toBeLessThan(.00001)
  })

  it.each([0, 1, 2, 3].flatMap(seat => [1, 2, 3].map(relative => ({ seat, relative }))))(
    '幺筒碰牌座位$seat来源$relative三张同向，其他玩法保留原指向', ({ seat, relative }) => {
      const s = setup()
      s.props.players[seat].melds = [{ type: 'peng', tile: 'p5', tiles: ['p5', 'p5', 'p5'], from: (seat + relative) % 4 }]
      const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, [0, Math.PI / 2, Math.PI, -Math.PI / 2][seat], 0))
      s.props.neutralPengOrientation = true
      s.presenter.rebuild()
      expect(s.rendered.filter(t => t.face === 'p5' && t.rotation.angleTo(base) < .00001)).toHaveLength(3)
      s.props.neutralPengOrientation = false
      s.presenter.rebuild()
      expect(s.rendered.filter(t => t.face === 'p5' && t.rotation.angleTo(base) < .00001)).toHaveLength(2)
    },
  )
  it.each([0, 1, 2, 3])('幺筒补杠四张同向排成一行：座位$seat', seat => {
    const s = setup()
    s.props.neutralPengOrientation = true
    s.props.players[seat].melds = [{ type: 'peng', tile: 'p5', tiles: ['p5', 'p5', 'p5'], from: (seat + 1) % 4 }]
    const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, [0, Math.PI / 2, Math.PI, -Math.PI / 2][seat], 0))
    s.presenter.rebuild()
    const pengPositions = s.rendered.filter(tile => tile.face === 'p5').map(tile => tile.position.clone())
    s.props.players[seat].melds = [{ type: 'gang', added: true, tile: 'p5', tiles: ['p5', 'p5', 'p5', 'p5'], from: (seat + 1) % 4 }]
    s.presenter.rebuild()
    const tiles = s.rendered.filter(tile => tile.face === 'p5')
    expect(tiles).toHaveLength(4)
    for (const tile of tiles) expect(tile.rotation.angleTo(base)).toBeLessThan(.00001)
    // 升级补杠不挪动原碰的三张牌；第四张接在同一行，四张等距。
    tiles.slice(0, 3).forEach((tile, index) => {
      expect(tile.position.distanceTo(pengPositions[index]), '原碰牌位置不变').toBeLessThan(.00001)
    })
    for (let index = 1; index < tiles.length; index += 1) {
      expect(tiles[index].position.distanceTo(tiles[index - 1].position), '四张排成一行且等距').toBeCloseTo(.685, 5)
    }
    // 非幺筒玩法保留来源牌与补杠牌横摆的旧版式。
    s.props.neutralPengOrientation = false
    s.presenter.rebuild()
    expect(s.rendered.filter(tile => tile.face === 'p5' && tile.rotation.angleTo(base) < .00001)).toHaveLength(2)
  })
  it.each([1, 2, 3, 4])('对家亮牌与%d组副露在画面中保持水平，且横向不重叠', count => {
    const s = setup()
    s.props.revealHands = true
    const hand: TileType[] = ['m1', 'm2', 'm3', 'm4', 'm6', 'm8', 'm9', 'p1', 'p2', 'p3']
    const meldFaces: TileType[] = ['m5', 'p5', 's5', 's7']
    s.props.players[2].hand = hand.slice(0, 13 - count * 3)
    s.props.players[2].melds = meldFaces.slice(0, count).map(tile => ({ type: 'peng', tile, tiles: [tile, tile, tile], from: 1 }))
    s.presenter.rebuild()
    const concealed = s.rendered.filter(tile => tile.face && hand.includes(tile.face))
    const exposed = s.rendered.filter(tile => tile.face && meldFaces.includes(tile.face))
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0))
    const upright = exposed.filter(tile => tile.rotation.angleTo(rotation) < .00001)
    expect(concealed).toHaveLength(13 - count * 3)
    expect(upright).toHaveLength(count * 2)
    expect(Math.max(...exposed.map(tile => tile.position.x)) + .51)
      .toBeLessThan(Math.min(...concealed.map(tile => tile.position.x)) - .34)
    for (const aspect of [1280 / 720, 844 / 390]) {
      const camera = new THREE.PerspectiveCamera(45, aspect, .1, 100)
      camera.position.set(0, 16, 19)
      camera.lookAt(0, 0, -1)
      camera.updateMatrixWorld()
      const baseline = concealed[0].position.clone().project(camera).y
      for (const tile of [...concealed, ...upright])
        expect(tile.position.clone().project(camera).y).toBeCloseTo(baseline, 6)
    }
  })
  it.each([0, 1, 2, 3].flatMap(seat => [0, 2].map(remaining => ({ seat, remaining }))))('retains the indicator in winner $seat river with $remaining wall tiles left, without replay on refresh', ({ seat, remaining }) => {
    const s = setup()
    s.props.wallTotal = 108
    s.props.wallHeadDrawn = 108 - remaining
    s.props.wall = Array(remaining).fill('m1')
    s.props.revealHands = true
    s.props.players[seat].discards = Array(8).fill('m3')
    s.props.settlementIndicator = { id: 1, seat, tile: 'p9' }
    const river = discardTileLayout(seat, 8)
    const target = new THREE.Vector3(river.x, .38, river.z - 1.65)
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, river.rotation, 0))
    s.presenter.rebuild()
    expect(s.rendered.filter(tile => tile.face === 'p9')).toHaveLength(1)
    expect(s.rendered.filter(tile => tile.face === null)).toHaveLength(remaining)
    s.setNow(300)
    expect(s.presenter.animate(300, new THREE.Vector3())).toBe(true)
    const before = s.rendered.find(tile => tile.face === 'p9')!.position.clone()
    s.presenter.rebuild()
    expect(s.rendered.find(tile => tile.face === 'p9')!.position.distanceTo(before)).toBeLessThan(.00001)
    s.setNow(900)
    expect(s.presenter.animate(900, new THREE.Vector3())).toBe(false)
    const tile = s.rendered.find(tile => tile.face === 'p9')!
    expect(tile.position.distanceTo(target)).toBeLessThan(.00001)
    expect(tile.rotation.angleTo(rotation)).toBeCloseTo(0)
    expect(tile.scale).toBe(1)
    s.presenter.rebuild()
    expect(s.rendered.find(tile => tile.face === 'p9')!.position.distanceTo(target)).toBeLessThan(.00001)
    expect(s.dynamicGroups.filter(group => group.name === 'settlement-indicator-glow')).toHaveLength(1)
    s.props.settlementIndicator = null
    s.presenter.rebuild()
    expect(s.rendered.some(tile => tile.face === 'p9')).toBe(false)
    expect(s.dynamicGroups.some(group => group.name.startsWith('settlement-indicator'))).toBe(false)
  })

  it('places the indicator face-up immediately with reduced motion and keeps the highlight', () => {
    vi.spyOn(winEffect, 'prefersReducedMotion').mockReturnValue(true)
    const s = setup()
    s.props.settlementIndicator = { id: 1, seat: 0, tile: 'm1' }
    s.presenter.rebuild()
    expect(s.presenter.animate(0, new THREE.Vector3())).toBe(false)
    const river = discardTileLayout(0, 0)
    expect(s.rendered[0].position.distanceTo(new THREE.Vector3(river.x, .38, river.z - 1.65))).toBeLessThan(.00001)
    expect(s.rendered[0].rotation.angleTo(new THREE.Quaternion())).toBeCloseTo(0)
    expect(s.dynamicGroups.some(group => group.name === 'settlement-indicator-glow')).toBe(true)
  })

  it('does not carry an unfinished discard into a restored blood-flow view', () => {
    const s = setup()
    s.props.bloodFlowPresentationKey = 'live'
    s.props.players[0].discards = ['m5']
    s.props.lastDiscard = { id: 7, from: 0, tile: 'm5' }
    s.presenter.rebuild()
    s.setNow(100); s.presenter.animate(100, new THREE.Vector3())
    s.props.bloodFlowPresentationKey = 'restored'
    s.presenter.rebuild()
    expect(s.presenter.animate(100, new THREE.Vector3())).toBe(false)
  })

  it('continues a deal tween without restarting it on every refresh', () => {
    const s = setup()
    s.props.players[1].hand = ['m3']
    s.props.players[1].concealedTileCount = 1
    s.props.dealAnimation = { playerIndex: 1, count: 1, serial: 1 }
    s.presenter.rebuild()
    s.setNow(50); s.presenter.animate(50, new THREE.Vector3())
    const before = s.rendered[0].position.clone()
    s.presenter.rebuild()
    expect(s.rendered[0].position.distanceTo(before)).toBeLessThan(.00001)
    expect(s.presenter.animate(100, new THREE.Vector3())).toBe(true)
    expect(s.presenter.animate(150, new THREE.Vector3())).toBe(false)
    s.setNow(200); s.presenter.rebuild()
    expect(s.presenter.animate(200, new THREE.Vector3())).toBe(false)
  })

  it.each([
    { taken: [0,1,2,3], remaining: Array.from({ length: 132 }, (_, i) => i + 4) },
    { taken: [48,52], remaining: [49,50,51, ...Array.from({ length: 83 }, (_, i) => 53 + i)] },
  ])('颍州从本批实际拿走的墩和层飞牌，跳牌留下的三张在原位', ({ taken, remaining }) => {
    const s = setup()
    const cut = 102
    const position = (offset: number) => {
      const physical = (cut + offset) % WALL_TOTAL
      const slot = wallStackSlot(Math.floor(physical / 2))
      return new THREE.Vector3(slot.x, physical % 2 ? .41 : .88, slot.z)
    }
    s.props.wallBreakIndex = cut
    s.props.wallTotal = WALL_TOTAL
    s.props.wallHeadDrawn = WALL_TOTAL - remaining.length
    s.props.wall = Array(remaining.length).fill('east')
    s.props.openingStage = 'deal'
    s.props.revealHands = true
    s.props.players[3].hand = (['m1','m2','m3','m4'] as TileType[]).slice(0, taken.length)
    s.props.dealAnimation = { playerIndex: 3, count: taken.length, serial: 1, sourceOffsets: taken, remainingWallOffsets: remaining }
    s.presenter.rebuild()
    const flying = s.rendered.filter(t => t.face)
    const wall = s.rendered.filter(t => !t.face)
    expect(flying).toHaveLength(taken.length)
    expect(wall).toHaveLength(remaining.length)
    flying.forEach((t, i) => expect(t.position.distanceTo(position(taken[i]))).toBeLessThan(.00001))
    wall.forEach((t, i) => expect(t.position.distanceTo(position(remaining[i]))).toBeLessThan(.00001))
  })

  it('continues the existing flip motion without replaying a finished flip', () => {
    const s = setup()
    s.props.flipStack = 0; s.props.flipTile = 'p9'; s.props.openingStage = 'flip'
    s.props.wall = ['east']; s.props.wallCount = 1
    s.presenter.rebuild()
    s.setNow(100); s.presenter.animate(100, new THREE.Vector3())
    const before = s.rendered.find(r => r.face === 'p9')!.position.y
    s.presenter.rebuild()
    expect(s.rendered.find(r => r.face === 'p9')!.position.y).toBe(before)
    expect(s.presenter.animate(300, new THREE.Vector3())).toBe(true)
    expect(s.presenter.animate(600, new THREE.Vector3())).toBe(false)
    s.setNow(700); s.presenter.rebuild()
    expect(s.presenter.animate(700, new THREE.Vector3())).toBe(false)
  })

  it('continues the original discard arc after an identical snapshot rebuild', () => {
    const s = setup()
    s.props.players[0].discards = ['m5']
    s.props.lastDiscard = { id: 7, from: 0, tile: 'm5' }
    s.presenter.rebuild()
    s.setNow(100); expect(s.presenter.animate(100, new THREE.Vector3())).toBe(true)
    const before = s.rendered[0].position.clone()
    s.props.players = structuredClone(s.props.players)
    s.presenter.rebuild()
    expect(s.rendered[0].position.distanceTo(before)).toBeLessThan(.00001)
    expect(s.presenter.animate(200, new THREE.Vector3())).toBe(true)
    expect(s.presenter.animate(400, new THREE.Vector3())).toBe(false)
    s.setNow(500); s.presenter.rebuild()
    expect(s.presenter.animate(500, new THREE.Vector3())).toBe(false)
  })

  it.each([
    ['chi', { type: 'chi', tile: 'm5', from: 1, tiles: ['m4', 'm5', 'm6'] }],
    ['peng', { type: 'peng', tile: 'm5', from: 1, tiles: ['m5', 'm5', 'm5'] }],
    ['discard-gang', { type: 'gang', tile: 'm5', from: 1, tiles: ['m5', 'm5', 'm5', 'm5'] }],
    ['concealed-gang', { type: 'angang', tile: 'm5', tiles: ['m5', 'm5', 'm5', 'm5'] }],
    ['added-gang', { type: 'gang', tile: 'm5', from: 1, added: true, tiles: ['m5', 'm5', 'm5', 'm5'] }],
  ] as [TableActionType, Meld][])('keeps %s landing in progress when unrelated props rebuild the table', (action, meld) => {
    const s = setup(meld, action)
    s.presenter.rebuild()
    s.setNow(100); expect(s.presenter.animate(100, new THREE.Vector3())).toBe(true)
    const before = s.rendered.map(r => ({ y: r.position.y, scale: r.scale }))
    s.props.players = structuredClone(s.props.players)
    s.presenter.rebuild()
    expect(s.rendered.map(r => ({ y: r.position.y, scale: r.scale }))).toEqual(before)
    expect(s.presenter.animate(200, new THREE.Vector3())).toBe(true)
    expect(s.presenter.animate(500, new THREE.Vector3())).toBe(false)
    s.setNow(600); s.presenter.rebuild()
    expect(s.presenter.animate(600, new THREE.Vector3())).toBe(false)
  })
})
