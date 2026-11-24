import type { GamePlayer } from '../../core/contracts/types'
import type { RoundResult } from '../../core/contracts/gamePort'
import { defaultAvatarForSeat } from '../../core/presentation/avatar'
import { tileName } from '../../core/rules/tiles'
import type { ReplayFrameSource } from '../../replay/types'
import { decisionSeat, type Action, type Round } from './engine'
import { BASE_POINTS, KONG_NAMES, MODES } from './rules'

export const NAMES = ['你', '下家', '对家', '上家']
export const roundLabel = (round: Round) => `第 ${round.handNumber} 局 · ${MODES[round.settings.mode].name}`
export const markedIndices = (round: Round) =>
  round.players.map(seat => seat.hand.flatMap((tile, index) => tile.marked ? [index] : []))

export function tailFaceUp(round: Round) {
  return round.wall.length > 0 && !(round.settings.mode === 'live'
    && (round.window.kind === 'bloom' || round.result?.win?.kind === 'bloom'))
}

export function tablePlayers(round: Round): GamePlayer[] {
  return round.players.map((seat, i) => ({
    seat: i, name: NAMES[i], avatar: defaultAvatarForSeat(i), playerKind: i === 0 ? 'human' : 'bot',
    hand: seat.hand.map(tile => tile.face), drawnTileIndex: seat.drawnIndex, discards: seat.discards,
    melds: seat.melds, score: seat.score, redCount: 0,
  }))
}

export function tableResult(round: Round): RoundResult | null {
  const outcome = round.result
  if (!outcome) return null
  const { winner, win, deltas, payer } = outcome
  const seats = tablePlayers(round)
  const ranked = [...seats].sort((a, b) => b.score - a.score || a.seat - b.seat)
  return {
    draw: !win, winnerIndex: winner ?? undefined, winner: winner === null ? undefined : NAMES[winner],
    roundLabel: roundLabel(round), winTile: win?.tile, winType: win ? (payer === null ? 'self-draw' : 'robbed-kong') : undefined,
    winLabel: win?.label, kongBloom: win?.kind === 'bloom', robbedKong: payer !== null,
    robbedKongPlayerIndex: payer ?? undefined, details: win?.parts, totalMultiplier: win?.multiplier,
    points: win ? win.multiplier * BASE_POINTS : 0, totalWon: winner === null ? 0 : deltas[winner],
    scoreChanges: seats.map(seat => ({ playerIndex: seat.seat, name: seat.name, avatar: seat.avatar,
      score: seat.score, delta: deltas[seat.seat], rank: ranked.findIndex(p => p.seat === seat.seat) + 1 })),
  }
}

export function replayFrame(round: Round, length: number): ReplayFrameSource {
  return {
    players: tablePlayers(round), wallTotal: 136, wallLeft: round.wall.length, headDrawn: round.headDrawn,
    currentPlayer: decisionSeat(round), round: round.handNumber,
    roundLabel: roundLabel(round) + (round.settings.smallBan ? ' · 小牌禁胡' : ''), dealer: round.dealer,
    honba: 0, matchType: length === 4 ? 'east' : 'hanchan', matchName: `${length} 局场`,
    diceValues: round.dice, diceThrowerIndex: round.dealer, wallBreakIndex: round.breakIndex, jokerTiles: [],
    yingzhou: { indicator: round.indicator, tailFaceUp: tailFaceUp(round), markedIndices: markedIndices(round) },
  }
}

export function actionLabel(action: Action) {
  if (action.kind === 'win') return action.win.label + ' ×' + action.win.multiplier
  if (action.kind === 'kong') return KONG_NAMES[action.kong] + ' ' + tileName(action.tile)
  return action.kind === 'peng' ? '碰' : '过'
}
