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
  | { kind: 'turn'; declined?: 'zha' | 'all' }
  | { kind: 'draw' }
  | { kind: 'settled' }
  | { kind: 'claim'; tile: TileType; seats: number[] }
  | { kind: 'rob'; tile: TileType; seats: number[] }
  | { kind: 'reveal'; tile: TileType; seats: number[]; turnSeatPassed?: true }
  | { kind: 'check-rob'; tile: TileType }
  | { kind: 'supplement'; kong: Kong }
  | { kind: 'bloom'; win: Win }

export type Action =
  | { kind: 'discard'; index: number }
  | { kind: 'kong'; kong: Kong; tile: TileType }
  | { kind: 'win'; win: Win }
  | { kind: 'draw' | 'pass' | 'peng' | 'advance' }

export interface Outcome {
  winner: number | null
  win: Win | null
  payer: number | null
  deltas: number[]
}

export type RoundEvent = Pick<ReplayStep, 't' | 'seat' | 'text' | 'tile' | 'from' | 'actionType' | 'kind' | 'meldIndex' | 'lastDiscardId' | 'fromTail'>
interface OpeningBatch {
  seat: number
  /** 每张牌相对于开墙点的张位，庄家跳牌的两个张位不相邻。 */
  offsets: number[]
  tiles: TileType[]
}
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
  openingBatches: OpeningBatch[]
  players: Seat[]
  turn: number
  origin: 'draw' | 'peng' | 'supplement'
  window: Window
  lastDiscard: LastDiscard | null
  result: Outcome | null
  serial: number
  event: RoundEvent | null
  handNumber: number
  dealerRound: number
  honba: number
}

interface Opening {
  dealer?: number
  dice?: [number, number]
  wall?: TileType[]
  random?: () => number
  scores?: number[]
  handNumber?: number
  dealerRound?: number
  honba?: number
}

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
    hand: [], melds: [], discards: [], markedDiscardIndices: [], drawnIndex: -1, score: opening.scores?.[seat] ?? 0,
  }))
  let head = 0
  const openingBatches: OpeningBatch[] = []
  function dealBatch(offsets: number[]) {
    const seat = (dealer + openingBatches.length) % 4
    const tiles = offsets.map(index => wall[index])
    players[seat].hand.push(...tiles.map(ordinary))
    openingBatches.push({ seat, offsets, tiles })
    head += tiles.length
  }
  // 从庄家开始，逆时针依次给下家、对家和上家，每家四张，发三轮。
  for (let batch = 0; batch < 12; batch++) dealBatch([head, head + 1, head + 2, head + 3])
  const jump = head
  dealBatch([jump, jump + 4])
  for (let offset = 1; offset <= 3; offset++) dealBatch([jump + offset])
  players[dealer].drawnIndex = players[dealer].hand.length - 1
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
    wall: remaining, headDrawn: head, indicator: remaining[remaining.length - 1], openingDiscards, openingBatches, players,
    turn: dealer, origin: 'draw', window: { kind: 'turn' }, lastDiscard: null, result: null, serial: 0, event: null,
    handNumber: opening.handNumber ?? 1,
    dealerRound: opening.dealerRound ?? 1, honba: opening.honba ?? 0,
  }
  offerReveal(round, [dealer, ...following(dealer)])
  return round
}

export function nextDealer(round: Round) {
  return round.result?.winner ?? round.dealer
}

export function followingRound(previous: Round, opening: Opening = {}) {
  if (!previous.result) throw new Error('本局尚未结束')
  const dealer = nextDealer(previous)
  const sameDealer = dealer === previous.dealer
  return dealRound(previous.settings, {
    ...opening, dealer, scores: previous.players.map(seat => seat.score),
    handNumber: previous.handNumber + 1,
    dealerRound: sameDealer ? previous.dealerRound : previous.dealerRound + 1,
    honba: sameDealer ? previous.honba + 1 : 0,
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

// 牌墙数组包含亮牌。只剩亮牌时，本巡可以胡或出牌，不能再摸、碰、杠。
const hasPlayableTile = (round: Round) => round.wall.length > 1

function nextDraw(round: Round) {
  if (!hasPlayableTile(round)) return drawnGame(round)
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
  round.indicator = round.wall[round.wall.length - 1]
  offerReveal(round, following(round.turn))
}

function completeKong(round: Round, seatIndex: number, kind: Kong, tile: TileType) {
  const seat = round.players[seatIndex]
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
  round.lastDiscard = null
  round.window = { kind: 'supplement', kong: kind }
  round.event = {
    t: 'meld', seat: seatIndex, tile, from, meldIndex, ...kongEvents[kind],
    text: KONG_NAMES[kind] + tileName(tile),
  }
}

function takeSupplement(round: Round, kind: Kong) {
  const seat = round.players[round.turn]
  const oldMarks = seat.hand.filter(item => item.marked).length
  round.origin = 'supplement'
  const marked = round.settings.mode !== 'live'
  const supplement = marked
    ? round.settings.mode === 'nine' && isSuited(round.indicator) ? nineOf(round.indicator) : round.indicator
    : round.wall.pop()!
  addDraw(seat, supplement, marked)
  round.event = { t: 'draw', seat: round.turn, tile: supplement, fromTail: true,
    text: '杠补' + (marked ? '标记' : '') + tileName(supplement) }
  const win = drawWin(seat, round.settings, round.indicator, { kind, oldMarks })
  if (win) round.window = { kind: 'bloom', win }
  else afterBloomWindow(round)
}

export function legalActions(round: Round): Action[] {
  const window = round.window
  if (window.kind === 'settled') return []
  if (window.kind === 'draw') return hasPlayableTile(round) ? [{ kind: 'draw' }] : []
  if (window.kind === 'check-rob' || window.kind === 'supplement') return [{ kind: 'advance' }]
  const seat = round.players[decisionSeat(round)]
  if (window.kind === 'bloom') return [{ kind: 'win', win: window.win }, { kind: 'pass' }]
  if (window.kind === 'claim') {
    if (!hasPlayableTile(round)) return [{ kind: 'pass' }]
    const actions: Action[] = [{ kind: 'peng' }]
    if (ordinaryCount(seat.hand, window.tile) >= 3) actions.push({ kind: 'kong', kong: 'exposed', tile: window.tile })
    return [...actions, { kind: 'pass' }]
  }
  if (window.kind === 'reveal' || window.kind === 'rob') {
    const win = window.kind === 'rob' ? robWin(seat, window.tile, round.settings) : zhaWin(seat.hand, round.indicator, round.settings.mode)
    return win ? [{ kind: 'win', win }, { kind: 'pass' }] : [{ kind: 'pass' }]
  }
  const discards: Action[] = seat.hand.map((_, index) => ({ kind: 'discard', index }))
  if (window.declined === 'all') return discards
  const actions: Action[] = []
  const zha = window.declined === 'zha' ? null : zhaWin(seat.hand, round.indicator, round.settings.mode)
  if (zha) actions.push({ kind: 'win', win: zha })
  const self = round.origin === 'draw' && drawWin(seat, round.settings, round.indicator)
  if (self) actions.push({ kind: 'win', win: self })
  if (hasPlayableTile(round)) {
    for (const tile of new Set(seat.hand.filter(item => !item.marked).map(item => item.face))) {
      if (round.origin !== 'peng' && ordinaryCount(seat.hand, tile) === 4) actions.push({ kind: 'kong', kong: 'concealed', tile })
      if (seat.melds.some(meld => meld.type === 'peng' && meld.tile === tile)) actions.push({ kind: 'kong', kong: 'added', tile })
    }
  }
  if (actions.length) actions.push({ kind: 'pass' })
  return [...actions, ...discards]
}

function pass(round: Round) {
  const window = round.window
  if (window.kind === 'turn') {
    round.window = { kind: 'turn', declined: 'all' }
    return
  }
  if (window.kind === 'bloom') return afterBloomWindow(round)
  if (!('seats' in window)) return
  const responder = window.seats.shift()
  if (window.kind === 'reveal' && responder === round.turn) window.turnSeatPassed = true
  if (window.seats.length) return
  if (window.kind === 'rob') return completeKong(round, round.turn, 'added', window.tile)
  if (window.kind === 'claim') return nextDraw(round)
  // 庄家过了起手报扎，在同一手牌上只保留尚未询问的自摸和杠。
  round.window = window.kind === 'reveal' && window.turnSeatPassed
    ? { kind: 'turn', declined: 'zha' } : { kind: 'turn' }
}

function discard(round: Round, index: number) {
  const seat = round.players[round.turn]
  const [tile] = seat.hand.splice(index, 1)
  sortHeld(seat.hand)
  seat.drawnIndex = -1
  if (tile.marked) seat.markedDiscardIndices.push(seat.discards.length)
  seat.discards.push(tile.face)
  round.lastDiscard = { from: round.turn, tile: tile.face, id: round.serial }
  round.event = { t: 'discard', seat: round.turn, tile: tile.face, lastDiscardId: round.serial,
    text: '打出' + (tile.marked ? '标记' : '') + tileName(tile.face) }
  if (!hasPlayableTile(round) || tile.marked) return nextDraw(round)
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
export function stepRound(round: Round, actor: number, requested: Action): boolean {
  if (actor !== decisionSeat(round)) return false
  const action = legalActions(round).find(option => actionKey(option) === actionKey(requested))
  if (!action) return false
  round.serial++
  const seat = round.players[actor]
  round.event = { t: 'notice', seat: actor, text: '过' }
  switch (action.kind) {
    case 'advance': {
      const window = round.window
      if (window.kind === 'supplement') takeSupplement(round, window.kong)
      if (window.kind === 'check-rob') {
        const seats = following(actor).filter(index => robWin(round.players[index], window.tile, round.settings))
        if (seats.length) {
          round.window = { kind: 'rob', tile: window.tile, seats }
          round.event = null
        } else completeKong(round, actor, 'added', window.tile)
      }
      break
    }
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
        round.window = { kind: 'check-rob', tile: action.tile }
        round.event = { t: 'notice', seat: actor, tile: action.tile, text: '申请补杠' + tileName(action.tile) }
        break
      }
      completeKong(round, actor, action.kong, action.tile)
      break
    }
  }
  return true
}

/** 无头对局即时走完同一批强制步骤；牌桌在相邻步骤之间播放动作。 */
export function act(round: Round, actor: number, requested: Action): boolean {
  if (!stepRound(round, actor, requested)) return false
  while (round.window.kind === 'check-rob' || round.window.kind === 'supplement') {
    stepRound(round, round.turn, { kind: 'advance' })
  }
  return true
}
