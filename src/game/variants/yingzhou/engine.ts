import type { TileType } from '../../core/contracts/types'
import type { LastDiscard } from '../../core/contracts/gamePort'
import { createWall, shuffle, tileName } from '../../core/rules/tiles'
import { WALL_TOTAL, wallBreakIndexForDealer } from '../../core/rules/wallLayout'
import type { ReplayStep } from '../../replay/types'
import {
  drawWin, isSuited, KONG_NAMES, nineOf, ordinary, ordinaryCount, payments, robWin, sortHeld, zhaWin,
  type Kong, type Seat, type Settings, type Win,
} from './rules'

type Window =
  | { kind: 'turn' | 'draw' | 'settled' }
  | { kind: 'claim' | 'rob' | 'reveal'; tile: TileType; seats: number[] }
  | { kind: 'bloom'; win: Win }

export type Action =
  | { kind: 'discard'; index: number }
  | { kind: 'kong'; kong: Kong; tile: TileType }
  | { kind: 'win'; win: Win }
  | { kind: 'draw' | 'pass' | 'peng' }

export interface Outcome {
  winner: number | null
  win: Win | null
  payer: number | null
  deltas: number[]
}

export type RoundEvent = Pick<ReplayStep, 't' | 'seat' | 'text' | 'tile' | 'from' | 'actionType' | 'kind' | 'meldIndex' | 'lastDiscardId'>
export interface Round {
  settings: Settings
  dealer: number
  dice: [number, number]
  breakIndex: number
  wallSide: number
  wall: TileType[]
  headDrawn: number
  indicator: TileType
  openingDiscards: TileType[]
  openingHands: TileType[][]
  players: Seat[]
  turn: number
  origin: 'draw' | 'peng' | 'supplement'
  window: Window
  lastDiscard: LastDiscard | null
  result: Outcome | null
  serial: number
  event: RoundEvent | null
  handNumber: number
  validBefore: number
}

interface Opening {
  dealer?: number
  dice?: [number, number]
  wall?: TileType[]
  random?: () => number
  scores?: number[]
  handNumber?: number
  validBefore?: number
}

const clockwise = (dealer: number, offset: number) => (dealer - offset + 4) % 4
const following = (seat: number) => [1, 2, 3].map(offset => (seat + offset) % 4)
const kongEvents = {
  exposed: { kind: 'gang-discard', actionType: 'discard-gang' },
  concealed: { kind: 'gang-concealed', actionType: 'concealed-gang' },
  added: { kind: 'gang-added', actionType: 'added-gang' },
} as const
export const decisionSeat = (round: Round) => 'seats' in round.window ? round.window.seats[0] : round.turn

export function dealRound(settings: Settings, opening: Opening = {}): Round {
  const random = opening.random ?? Math.random
  const dealer = opening.dealer ?? Math.floor(random() * 4)
  const die = () => 1 + Math.floor(random() * 6)
  const dice: [number, number] = opening.dice ?? [die(), die()]
  const ordered = opening.wall ?? shuffle(createWall(), random)
  // 通用桌从小点之后起牌，颍州从小点所在的墩起牌（第一墩记作 1）。
  const breakIndex = (wallBreakIndexForDealer(dice, dealer) + WALL_TOTAL - 2) % WALL_TOTAL
  const wall = [...ordered.slice(breakIndex), ...ordered.slice(0, breakIndex)]
  const players: Seat[] = [0, 1, 2, 3].map(seat => ({
    hand: [], melds: [], discards: [], drawnIndex: -1, score: opening.scores?.[seat] ?? 0,
  }))
  let head = 0
  for (let batch = 0; batch < 3; batch++) {
    for (let offset = 0; offset < 4; offset++) {
      players[clockwise(dealer, offset)].hand.push(...wall.slice(head, head + 4).map(ordinary))
      head += 4
    }
  }
  // 庄家拿第 1、3 墩的上张，三位闲家依次拿中间三张。
  for (let offset = 0; offset < 4; offset++) players[clockwise(dealer, offset)].hand.push(ordinary(wall[head++]))
  players[dealer].drawnIndex = players[dealer].hand.push(ordinary(wall[head++])) - 1
  const openingHands = players.map(seat => seat.hand.map(tile => tile.face))
  for (const [index, seat] of players.entries()) {
    if (index !== dealer) sortHeld(seat.hand)
    else {
      const last = seat.hand.pop()!
      sortHeld(seat.hand).push(last)
    }
  }
  const remaining = wall.slice(head)
  const openingDiscards: TileType[] = []
  while (settings.mode === 'nine' && !isSuited(remaining[remaining.length - 1])) {
    openingDiscards.push(remaining.pop()!)
  }
  const round: Round = {
    settings: { ...settings }, dealer, dice, breakIndex, wallSide: (dealer + dice[0] + dice[1] - 1) % 4,
    wall: remaining, headDrawn: head, indicator: remaining[remaining.length - 1], openingDiscards, openingHands, players,
    turn: dealer, origin: 'draw', window: { kind: 'turn' }, lastDiscard: null, result: null, serial: 0, event: null,
    handNumber: opening.handNumber ?? 1, validBefore: opening.validBefore ?? 0,
  }
  offerReveal(round, [dealer, ...following(dealer)])
  return round
}

export function followingRound(previous: Round, settings: Settings, opening: Opening = {}) {
  if (!previous.result) throw new Error('本局尚未结束')
  return dealRound(settings, {
    ...opening, dealer: previous.result.winner ?? previous.dealer, scores: previous.players.map(seat => seat.score),
    handNumber: previous.handNumber + 1, validBefore: previous.validBefore + Number(previous.result.winner !== null),
  })
}

function offerReveal(round: Round, order: number[]) {
  const seats = order.filter(index => zhaWin(round.players[index].hand, round.indicator, round.settings.mode))
  round.window = seats.length ? { kind: 'reveal', tile: round.indicator, seats } : { kind: 'turn' }
}

function drawnGame(round: Round) {
  round.result = { winner: null, win: null, payer: null, deltas: [0, 0, 0, 0] }
  round.window = { kind: 'settled' }
}

function nextDraw(round: Round) {
  if (!round.wall.length) return drawnGame(round)
  round.turn = (round.turn + 1) % 4
  round.window = { kind: 'draw' }
}

function addDraw(seat: Seat, face: TileType, marked: boolean) {
  sortHeld(seat.hand)
  seat.drawnIndex = seat.hand.push({ face, marked }) - 1
}

function takeOrdinary(seat: Seat, tile: TileType, count: number) {
  for (let n = 0; n < count; n++) {
    seat.hand.splice(seat.hand.findIndex(item => !item.marked && item.face === tile), 1)
  }
  sortHeld(seat.hand)
  seat.drawnIndex = -1
}

/** 已完成杠补。活杠须等开杠者胡或过以后才能翻下一张。 */
function afterBloomWindow(round: Round) {
  if (round.settings.mode !== 'live') {
    round.window = { kind: 'turn' }
    return
  }
  if (!round.wall.length) return drawnGame(round)
  round.indicator = round.wall[round.wall.length - 1]
  offerReveal(round, following(round.turn))
}

function completeKong(round: Round, seatIndex: number, kind: Kong, tile: TileType) {
  const seat = round.players[seatIndex]
  const oldMarks = seat.hand.filter(item => item.marked).length
  const from = kind === 'exposed' ? round.turn : null
  let meldIndex = seat.melds.length
  if (kind === 'added') {
    takeOrdinary(seat, tile, 1)
    meldIndex = seat.melds.findIndex(meld => meld.type === 'peng' && meld.tile === tile)
    const meld = seat.melds[meldIndex]
    meld.type = 'gang'
    meld.added = true
    meld.tiles.push(tile)
  } else {
    takeOrdinary(seat, tile, kind === 'concealed' ? 4 : 3)
    if (from !== null) round.players[from].discards.pop()
    seat.melds.push({ type: kind === 'concealed' ? 'angang' : 'gang', tile, tiles: [tile, tile, tile, tile], from: from ?? undefined })
  }
  round.turn = seatIndex
  round.origin = 'supplement'
  round.lastDiscard = null
  const marked = round.settings.mode !== 'live'
  const supplement = marked
    ? round.settings.mode === 'nine' && isSuited(round.indicator) ? nineOf(round.indicator) : round.indicator
    : round.wall.pop()!
  addDraw(seat, supplement, marked)
  round.event = {
    t: 'meld', seat: seatIndex, tile, from, meldIndex, ...kongEvents[kind],
    text: `${KONG_NAMES[kind]}${tileName(tile)}，补${marked ? '标记' : ''}${tileName(supplement)}`,
  }
  const win = drawWin(seat, round.settings, round.indicator, { kind, oldMarks, last: !marked && !round.wall.length })
  if (win) round.window = { kind: 'bloom', win }
  else afterBloomWindow(round)
}

export function legalActions(round: Round): Action[] {
  const window = round.window
  if (window.kind === 'settled') return []
  if (window.kind === 'draw') return [{ kind: 'draw' }]
  const seat = round.players[decisionSeat(round)]
  if (window.kind === 'bloom') return [{ kind: 'win', win: window.win }, { kind: 'pass' }]
  if (window.kind === 'claim') {
    const actions: Action[] = [{ kind: 'peng' }]
    if (ordinaryCount(seat.hand, window.tile) >= 3) actions.push({ kind: 'kong', kong: 'exposed', tile: window.tile })
    return [...actions, { kind: 'pass' }]
  }
  const zha = zhaWin(seat.hand, round.indicator, round.settings.mode)
  if (window.kind === 'reveal' || window.kind === 'rob') {
    const win = window.kind === 'rob' ? robWin(seat, window.tile, round.settings) : zha
    return win ? [{ kind: 'win', win }, { kind: 'pass' }] : [{ kind: 'pass' }]
  }
  const actions: Action[] = []
  if (zha) actions.push({ kind: 'win', win: zha })
  const self = round.origin === 'draw' && drawWin(seat, round.settings, round.indicator)
  if (self) actions.push({ kind: 'win', win: self })
  if (round.origin !== 'peng' && round.wall.length) {
    for (const tile of new Set(seat.hand.filter(item => !item.marked).map(item => item.face))) {
      if (ordinaryCount(seat.hand, tile) === 4) actions.push({ kind: 'kong', kong: 'concealed', tile })
      if (seat.melds.some(meld => meld.type === 'peng' && meld.tile === tile)) actions.push({ kind: 'kong', kong: 'added', tile })
    }
  }
  seat.hand.forEach((_, index) => actions.push({ kind: 'discard', index }))
  return actions
}

function pass(round: Round) {
  const window = round.window
  if (window.kind === 'bloom') return afterBloomWindow(round)
  if (!('seats' in window)) return
  window.seats.shift()
  if (window.seats.length) return
  if (window.kind === 'rob') return completeKong(round, round.turn, 'added', window.tile)
  if (window.kind === 'claim') return nextDraw(round)
  round.window = { kind: 'turn' }
}

function discard(round: Round, index: number) {
  const seat = round.players[round.turn]
  const [tile] = seat.hand.splice(index, 1)
  sortHeld(seat.hand)
  seat.drawnIndex = -1
  seat.discards.push(tile.face)
  round.lastDiscard = { from: round.turn, tile: tile.face, id: round.serial }
  round.event = { t: 'discard', seat: round.turn, tile: tile.face, lastDiscardId: round.serial,
    text: '打出' + (tile.marked ? '标记' : '') + tileName(tile.face) }
  if (!round.wall.length || tile.marked) return nextDraw(round)
  const seats = following(round.turn).filter(index => ordinaryCount(round.players[index].hand, tile.face) >= 2)
  if (seats.length) round.window = { kind: 'claim', tile: tile.face, seats }
  else nextDraw(round)
}

function winRound(round: Round, winner: number, win: Win) {
  const payer = win.kind === 'rob' ? round.turn : null
  if (payer !== null) {
    takeOrdinary(round.players[payer], win.tile, 1)
    addDraw(round.players[winner], win.tile, false)
  }
  const deltas = payments(winner, win, payer)
  round.players.forEach((seat, i) => { seat.score += deltas[i] })
  round.result = { winner, win, payer, deltas }
  round.event = { t: 'win', seat: winner, from: payer, tile: win.tile,
    actionType: payer !== null ? 'robbed-kong-win' : 'self-draw', text: win.label + ' ×' + win.multiplier }
  round.window = { kind: 'settled' }
}

export function actionKey(action: Action): string {
  if (action.kind === 'win') return action.win.kind
  if (action.kind === 'discard') return 'discard-' + action.index
  if (action.kind === 'kong') return action.kong + '-' + action.tile
  return action.kind
}

/** 人与 AI 共用同一个入口。重取合法动作，让过期按钮或重复点击无法自行指定胡分。 */
export function act(round: Round, actor: number, requested: Action): boolean {
  if (actor !== decisionSeat(round)) return false
  const action = legalActions(round).find(option => actionKey(option) === actionKey(requested))
  if (!action) return false
  round.serial++
  const seat = round.players[actor]
  round.event = { t: 'notice', seat: actor, text: '过' }
  switch (action.kind) {
    case 'win': winRound(round, actor, action.win); break
    case 'pass': pass(round); break
    case 'discard': discard(round, action.index); break
    case 'draw': {
      const tile = round.wall.shift()!
      round.headDrawn++
      addDraw(seat, tile, false)
      round.origin = 'draw'
      round.window = { kind: 'turn' }
      round.event = { t: 'draw', seat: actor, tile }
      if (!round.wall.length && !legalActions(round).some(option => option.kind === 'win')) drawnGame(round)
      break
    }
    case 'peng': {
      if (round.window.kind !== 'claim') return false
      const { tile } = round.window
      takeOrdinary(seat, tile, 2)
      round.players[round.turn].discards.pop()
      seat.melds.push({ type: 'peng', tile, tiles: [tile, tile, tile], from: round.turn })
      round.event = { t: 'meld', seat: actor, from: round.turn, kind: 'peng', actionType: 'peng', tile, meldIndex: seat.melds.length - 1 }
      round.turn = actor
      round.lastDiscard = null
      round.origin = 'peng'
      round.window = { kind: 'turn' }
      break
    }
    case 'kong': {
      if (action.kong === 'added') {
        const seats = following(actor).filter(index => robWin(round.players[index], action.tile, round.settings))
        if (seats.length) {
          round.window = { kind: 'rob', tile: action.tile, seats }
          round.event = { t: 'notice', seat: actor, tile: action.tile, text: '申请补杠' + tileName(action.tile) }
          break
        }
      }
      completeKong(round, actor, action.kong, action.tile)
      break
    }
  }
  return true
}
