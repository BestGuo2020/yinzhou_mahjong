import { describe, expect, it } from 'vitest'
import type { TileType } from '../../core/contracts/types'
import { createWall, TILE_TYPES } from '../../core/rules/tiles'
import { chooseAction } from './ai'
import { act, dealRound, decisionSeat, followingRound, legalActions, type Action, type Round } from './engine'
import { drawWin, ordinary, standardWin, zhaWin, type HeldTile, type Mode } from './rules'

const held = (...faces: TileType[]) => faces.map(ordinary)
const mark = (face: TileType): HeldTile => ({ face, marked: true })
const run = (round: Round, action: Action) => expect(act(round, decisionSeat(round), action)).toBe(true)
function fixture(mode: Mode = 'live', indicator: TileType = 'p6') {
  const round = dealRound({ mode, smallBan: false }, { dealer: 0, dice: [2, 3], wall: createWall() })
  round.players.forEach(seat => { seat.hand = []; seat.melds = []; seat.drawnIndex = -1 })
  round.window = { kind: 'turn' }
  round.wall = ['m1', 's7', indicator]
  round.indicator = indicator
  return round
}
function win(round: Round, kind: string) {
  const action = legalActions(round).find(a => a.kind === 'win' && a.win.kind === kind)
  expect(action).toBeDefined()
  run(round, action!)
}
function waitFor(face: TileType) {
  return held('m2', 'm3', 'm4', 's3', 's4', 's5', 'p4', 'p5', 'p6', 'east', 'east', 'east', face)
}
function kongHand(face: TileType) {
  return [...waitFor(face), ordinary('east')]
}

describe('起牌和胡型', () => {
  it('按双骰从第 n 墩而非下一墩开抓；顺时针每次四张，庄家跳牌', () => {
    const physical = [...TILE_TYPES, ...TILE_TYPES, ...TILE_TYPES, ...TILE_TYPES]
    const r = dealRound({ mode: 'live', smallBan: false }, { dealer: 0, dice: [2, 3], wall: physical })
    const rotated = [...physical.slice(2), ...physical.slice(0, 2)]
    expect(r.breakIndex).toBe(2)
    expect(r.wallSide).toBe(0)
    expect(r.openingHands[3].slice(0, 4)).toEqual(rotated.slice(4, 8))
    expect(r.openingHands[0].slice(-2)).toEqual([rotated[48], rotated[52]])
    expect(r.players.map(p => p.hand.length)).toEqual([14, 13, 13, 13])
    expect(r.wall).toEqual(rotated.slice(53))
    expect(r.indicator).toBe(rotated.at(-1))
    // 从 2 号庄家起，和为 6 数到 3 号玩家的墙；双三从第三墩起。
    expect(dealRound(r.settings, { dealer: 2, dice: [3, 3], wall: physical }).breakIndex).toBe(38)
  })
  it('死九从尾端依次剔除字牌，允许一筒为固定亮牌', () => {
    const faces = createWall()
    // 2+3 从原墙下标 2 抓，物理牌 1、0、135 依次成为墙尾。
    for (const [i, face] of [[1, 'red'], [0, 'west'], [135, 'p1']] as const) {
      const j = faces.indexOf(face, 2)
      ;[faces[i], faces[j]] = [faces[j], faces[i]]
    }
    const r = dealRound({ mode: 'nine', smallBan: false }, { dealer: 0, dice: [2, 3], wall: faces })
    expect(r.openingDiscards).toEqual(['red', 'west'])
    expect(r.indicator).toBe('p1')
    expect(r.wall).toHaveLength(81)
    expect(r.lastDiscard).toBeNull()
  })
  it('只认四面子一对将；部分七对可重组，字牌不能排顺子', () => {
    expect(standardWin(held('east','east','south','south','west','west','north','north','red','red','green','green','white','white'), 0)).toBe(false)
    expect(standardWin(held('m1','m9','p1','p9','s1','s9','east','south','west','north','red','green','white','white'), 0)).toBe(false)
    expect(standardWin(held('m2','m2','m3','m3','m4','m4','p5','p5','p6','p6','p7','p7','s8','s8'), 0)).toBe(true)
    expect(standardWin(held('red','green','white','s8','s8'), 3)).toBe(false)
    expect(standardWin(held('red','red','red','red','red'), 3)).toBe(true)
  })
})

describe('扎与标记', () => {
  it('三张普通牌可直接扎；标记与碰牌不计，亮九重合只取 3 倍', () => {
    expect(zhaWin(held('red','red','red'), 'red', 'fixed')?.multiplier).toBe(3)
    expect(zhaWin([...held('p9','p9'), mark('p9')], 'p1', 'nine')).toBeNull()
    expect(zhaWin([...held('p9','p9','p9'), mark('p9')], 'p1', 'nine')?.multiplier).toBe(2)
    expect(zhaWin(held('p9','p9','p9'), 'p9', 'nine')?.multiplier).toBe(3)
    const r = fixture('fixed')
    r.players[0].hand = held('p6')
    r.players[1].hand = held('p6','p6','red')
    run(r, { kind: 'discard', index: 0 })
    expect(legalActions(r).map(a => a.kind)).toEqual(['peng','pass'])
    run(r, { kind: 'peng' })
    expect(r.players[0].discards).toEqual([])
    expect(legalActions(r).map(a => a.kind)).toEqual(['discard'])
  })
  it('留扎自摸为 4 倍，持标记仍可扎；打出最后的标记不能被碰杠并恢复资格', () => {
    const r = fixture('nine')
    const seat = r.players[0]
    seat.hand = held('m2','m3','m4','m5','m6','m7','s3','s4','s5','p6','p6','p6','s8','s8')
    seat.drawnIndex = 13
    expect(drawWin(seat, r.settings, r.indicator)?.multiplier).toBe(4)
    const direct = legalActions(r).find(a => a.kind === 'win' && a.win.kind === 'indicator')
    expect(direct).toBeDefined()
    const copy = structuredClone(r)
    win(copy, 'self')
    expect(copy.result?.deltas).toEqual([120,-40,-40,-40])
    seat.hand[13] = mark('s8')
    expect(drawWin(seat, r.settings, r.indicator)).toBeNull()
    expect(legalActions(r).filter(a => a.kind === 'win')).toHaveLength(1)
    r.players[1].hand = held('s8','s8','s8')
    run(r, { kind: 'discard', index: 13 })
    expect(r.window.kind).toBe('draw')
    expect(seat.hand.filter(t => t.marked)).toHaveLength(0)
    expect(seat.discards).toEqual(['s8'])
  })
  it('标记不能凑暗杠、明杠或补杠，并可选择打出同面的普通牌', () => {
    const r = fixture('fixed')
    r.players[0].hand = [...held('p6','p6','p6'), mark('p6')]
    expect(legalActions(r).some(a => a.kind === 'kong')).toBe(false)
    r.players[1].hand = held('p6','p6')
    run(r, { kind: 'discard', index: 0 })
    expect(r.window.kind).toBe('claim')
    expect(r.players[0].hand.filter(t => t.marked)).toHaveLength(1)
    const s = fixture('fixed')
    s.players[0].melds = [{ type: 'peng', tile:'p6', tiles:['p6','p6','p6'] }]
    s.players[0].hand = [mark('p6')]
    expect(legalActions(s).some(a => a.kind === 'kong')).toBe(false)
  })
})

describe('杠补顺序与结算', () => {
  it.each([['fixed','p6','p6'], ['nine','p6','p9']] as const)('%s 每杠只补一张标记，不消耗墙尾', (mode, indicator, target) => {
    const r = fixture(mode, indicator)
    r.players[0].hand = held('east','east','east','east','s1','s4','s7','red','red','green','green','white','west','south')
    const before = [...r.wall]
    run(r, { kind: 'kong', kong: 'concealed', tile: 'east' })
    expect(r.wall).toEqual(before)
    expect(r.players[0].hand.at(-1)).toEqual(mark(target))
    expect(r.players[0].hand).toHaveLength(11)
    expect(r.players.map(p => p.score)).toEqual([0,0,0,0])
  })
  it.each([0, 1, 2])('死杠暗杠开花，%i 张旧标记按每张加二', oldMarks => {
    const r = fixture('fixed','p7')
    const seat = r.players[0]
    seat.hand = held('east','east','east','east','m2','m3','m4','s3','s4','s5','p6','p7','p8','p7')
    for (const index of [11,13].slice(0, oldMarks)) seat.hand[index] = mark('p7')
    run(r, { kind: 'kong', kong: 'concealed', tile: 'east' })
    win(r, 'bloom')
    const expected = 3 + 2 * oldMarks
    expect(r.result?.win?.multiplier).toBe(expected)
    expect(r.result?.deltas).toEqual([30 * expected, -10 * expected, -10 * expected, -10 * expected])
  })
  it('留扎后明杠开花为五倍，给出明杠牌的一家也只付一份', () => {
    const r = fixture('nine')
    r.players[0].hand = held('east')
    r.players[1].hand = held('east','east','east','m2','m3','m4','s3','s4','s5','p6','p6','p6','p9')
    run(r, { kind: 'discard', index: 0 })
    run(r, { kind: 'kong', kong: 'exposed', tile: 'east' })
    win(r, 'bloom')
    expect(r.result?.deltas).toEqual([-50,150,-50,-50])
  })
  it.each([0, 1, 2])('补杠无人抢，%i 张旧标记从两倍起加', oldMarks => {
    const r = fixture('fixed','p7')
    const seat = r.players[0]
    seat.melds = [{ type: 'peng', tile: 'm5', tiles: ['m5','m5','m5'] }]
    seat.hand = held('m2','m3','m4','s3','s4','s5','p6','p7','p8','p7','m5')
    for (const index of [7,9].slice(0, oldMarks)) seat.hand[index] = mark('p7')
    r.players[1].hand = held('m6','m7','s6','s7','s8','p1','p2','p3','red','red','red','green','green')
    run(r, { kind: 'kong', kong: 'added', tile: 'm5' })
    expect(r.window.kind).toBe('rob')
    run(r, { kind: 'pass' })
    expect(seat.melds[0]).toMatchObject({ type: 'gang', added: true })
    win(r, 'bloom')
    expect(r.result?.deltas[0]).toBe((2 + 2 * oldMarks) * 30)
  })
  it('活杠优先判杠开，过后新牌立即询扎，旧亮牌资格随之失效', () => {
    const r = fixture('live','p7')
    r.wall = ['m9','s7','p7']
    r.players[0].hand = kongHand('p7')
    r.players[1].hand = held('s7','s7','s7')
    r.players[2].hand = held('p7','p7','p7')
    run(r, { kind: 'kong', kong: 'concealed', tile: 'east' })
    expect(r.window.kind).toBe('bloom')
    expect(r.indicator).toBe('p7')
    const copy = structuredClone(r)
    win(copy, 'bloom')
    expect(copy.result?.winner).toBe(0)
    run(r, { kind: 'pass' })
    expect(r.indicator).toBe('s7')
    expect(r.window).toEqual({ kind: 'reveal', tile: 's7', seats: [1] })
    win(r, 'indicator')
    expect(r.result?.deltas).toEqual([-30,90,-30,-30])
  })
  it('海底捞月按本次暗杠计分，未胡或过胡流局，留庄不计有效局', () => {
    const r = fixture('live','p7')
    r.wall = ['p7']
    r.players[0].hand = kongHand('p7')
    run(r, { kind: 'kong', kong: 'concealed', tile: 'east' })
    const copy = structuredClone(r)
    win(copy, 'bloom')
    expect(copy.result?.win?.label).toBe('海底捞月')
    expect(copy.result?.deltas).toEqual([90,-30,-30,-30])
    run(r, { kind: 'pass' })
    expect(r.result?.winner).toBeNull()
    const next = followingRound(r)
    expect(next.settings).toEqual(r.settings)
    expect([next.dealer, next.handNumber, next.validBefore]).toEqual([0,2,0])
    expect(next.players.every(s => !s.discards.length && s.hand.every(t => !t.marked))).toBe(true)
  })
})

describe('抢杠和小牌限制', () => {
  function added(face: TileType = 'p5') {
    const r = fixture('fixed')
    r.players[0].melds = [{ type: 'peng', tile: face, tiles: [face,face,face] }]
    r.players[0].hand = held(face)
    for (const i of [1, 2, 3]) r.players[i].hand = waitFor(face)
    r.players[1].hand[1].marked = true
    return r
  }
  it('顺序询问且只认首个接受者，补杠中止，独付六十，不叠扎', () => {
    const r = added()
    r.players[1].hand = [mark('p6'), ...held('p7','m1','m2','m3','s1','s2','s3','red','red','red','white','white')]
    r.players[2].hand = held('p3','p4','m4','m5','m6','s2','s3','s4','green','green','green','south','south')
    r.players[3].hand = held('p6','p6','p6','p3','p4','m7','m8','m9','s7','s8','s9','west','west')
    run(r, { kind: 'kong', kong: 'added', tile: 'p5' })
    expect(r.window).toEqual({ kind: 'rob', seats: [2,3], tile: 'p5' })
    expect(act(r, 3, { kind: 'pass' })).toBe(false)
    run(r, { kind: 'pass' })
    win(r, 'rob')
    expect(r.players[0].melds[0].type).toBe('peng')
    expect(r.wall).toEqual(['m1','s7','p6'])
    expect(r.players[0].hand).toEqual([])
    expect(r.result?.deltas).toEqual([-60,0,0,60])
    const next = followingRound(r)
    expect(next.settings).toEqual(r.settings)
    expect([next.dealer,next.validBefore]).toEqual([3,1])
    expect(next.players.map(p => p.score)).toEqual([-60,0,0,60])
  })
  it.each(['p1','s2','m3','red'] as const)('小牌禁胡限制 %s 的自摸和抢杠，杠开可胡', face => {
    const r = added(face)
    r.settings.smallBan = true
    const seat = r.players[1]
    seat.hand = [...waitFor(face), ordinary(face)]
    seat.drawnIndex = 13
    expect(drawWin(seat, r.settings, r.indicator)).toBeNull()
    expect(drawWin(seat, r.settings, r.indicator, { kind: 'added', oldMarks: 0, last: false })?.multiplier).toBe(2)
    run(r, { kind: 'kong', kong: 'added', tile: face })
    expect(r.players[0].melds[0]).toMatchObject({ type: 'gang', added: true })
    expect(r.players[0].hand.at(-1)).toEqual(mark('p6'))
  })
  it('普通弃牌即使能成胡也只能碰杠或过', () => {
    const r = fixture()
    r.players[0].hand = held('s8')
    r.players[1].hand = waitFor('s8')
    run(r, { kind: 'discard', index: 0 })
    expect(r.window.kind).toBe('draw')
  })
  it('最后一次普通摸牌仍可胡；小牌禁胡只看胡张', () => {
    const r = fixture()
    r.settings.smallBan = true
    r.wall = ['s8']
    r.indicator = 's8'
    r.players[0].hand = waitFor('s8')
    r.window = { kind: 'draw' }
    run(r, { kind: 'draw' })
    win(r, 'self')
    expect(r.result?.deltas).toEqual([30,-10,-10,-10])
  })
})

describe('完整对局', () => {
  it.each(['live','fixed','nine'] as const)('%s 四个座位连续合法决策直至结束', mode => {
    let seed = 264
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
    const r = dealRound({ mode, smallBan: true }, { random })
    for (let step = 0; step < 640 && !r.result; step++) {
      run(r, chooseAction(r))
      const tiles = [...r.wall, ...r.openingDiscards,
        ...r.players.flatMap(p => [...p.hand.map(t => t.face), ...p.discards, ...p.melds.flatMap(m => m.tiles)])]
      const kongs = r.players.flatMap(p => p.melds).filter(m => m.type !== 'peng').length
      expect(tiles.length).toBe(136 + (mode === 'live' ? 0 : kongs))
    }
    expect(r.result).toBeTruthy()
    expect(r.players.reduce((a,p) => a + p.score, 0)).toBe(0)
  })
})
