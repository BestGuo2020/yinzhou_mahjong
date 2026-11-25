import type { TileType } from '../game/core/contracts/types'
import { decisionSeat, dealRound, legalActions, stepRound, type Round } from '../game/variants/yingzhou/engine'
import { ordinary, sortHeld } from '../game/variants/yingzhou/rules'

export type Example = 'indicator' | 'rob' | 'bloom' | 'self'
export const examples: Record<Example, string> = { indicator: '扎杠', rob: '抢杠', bloom: '杠开', self: '自摸' }

// Reserve the tiles needed for each example from a single physical deck.
export function exampleRound(kind: Example): Round {
  const r = dealRound({ mode: 'live', smallBan: false }, { dealer: 0, dice: [2, 3] })
  const pool = [...r.wall, ...r.players.flatMap(seat => seat.hand.map(tile => tile.face))]
  function reserve(face: TileType) {
    const i = pool.indexOf(face)
    if (i < 0) throw new Error('特效牌例缺少 ' + face)
    return pool.splice(i, 1)[0]
  }
  const indicator = reserve('p6')
  const waiting: TileType[] = ['m1','m2','m3','m4','m5','m6','s4','s5','s6','east','east','p3','p4']
  const human: TileType[] = kind === 'indicator' ? [...waiting.slice(0, 11), 'p6', 'p6', 'p6']
    : kind === 'bloom' ? ['m1','m2','m3','s4','s5','s6','p4','p5','red','red','east','east','east','east']
    : kind === 'rob' ? waiting : [...waiting, 'p5']
  r.players[0].hand = human.map(face => ordinary(reserve(face)))
  r.turn = kind === 'rob' ? 3 : 0
  r.players[0].drawnIndex = kind === 'rob' ? -1 : human.length - 1
  if (kind === 'rob') {
    r.players[3].melds = [{ type: 'peng', tile: 'p5', tiles: [reserve('p5'), reserve('p5'), reserve('p5')], from: 2 }]
    reserve('p5')
  }
  for (const [index, seat] of r.players.entries()) {
    if (!index) continue
    const adding = index === 3 && kind === 'rob'
    seat.hand = sortHeld(pool.splice(0, adding ? 10 : 13).map(ordinary))
    if (adding) seat.hand.push(ordinary('p5'))
    seat.drawnIndex = adding ? 10 : -1
  }
  r.indicator = indicator
  r.wall = [...pool, indicator]
  r.headDrawn = 136 - r.wall.length
  r.window = { kind: 'turn' }
  if (kind === 'rob') stepRound(r, 3, { kind: 'kong', kong: 'added', tile: 'p5' })
  if (kind === 'bloom') {
    stepRound(r, 0, { kind: 'kong', kong: 'concealed', tile: 'east' })
    stepRound(r, 0, { kind: 'advance' })
  }
  return r
}

export function winExample(round: Round, kind: Example) {
  if (kind === 'rob') stepRound(round, decisionSeat(round), { kind: 'advance' })
  const action = legalActions(round).find(a => a.kind === 'win' && a.win.kind === kind)
  if (!action || !stepRound(round, decisionSeat(round), action)) throw new Error('无法播放' + examples[kind])
}
