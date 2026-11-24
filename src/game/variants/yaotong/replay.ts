import type { GamePlayer, TableActionType, TileType } from '../../core/contracts/types'
import type { RoundResult } from '../../core/contracts/gamePort'
import { MATCH_FORMATS } from '../../core/rules/matchFormats'
import { defaultAvatarForSeat } from '../../core/presentation/avatar'
import type { ReplayFrameSource, ReplayRecorderHooks, ReplayStep } from '../../replay/types'
import { observeGameEvents } from './engine'
import { chickenMarks } from './chickenPresentation'
import { giftAwards, reportKillTotals, sidewaysDiscard, winningPattern, yaotongRoundLabel } from './presentation'
import type { GameEvent, GameState } from './types'

const sharedTile = (tile: number) => `${['m', 'p', 's'][Math.floor(tile / 9)]}${tile % 9 + 1}` as TileType

/** Read engine values directly, before animation hides/slices hands or delays score display. */
export function yaotongReplayFrame(state: GameState, characterId?: string, tailCount?: number): ReplayFrameSource {
  const players: GamePlayer[] = state.players.map((p, seat) => ({
    seat, name: p.name, avatar: p.avatar || defaultAvatarForSeat(seat), score: p.score, redCount: 0,
    characterId: p.characterId ?? (seat === 0 ? characterId : undefined), playerKind: p.playerKind ?? (seat === 0 ? 'human' : 'bot'),
    concealedTileCount: p.concealedTileCount ?? p.hand.length,
    hand: p.hand.map(sharedTile), drawnTileIndex: p.drawn !== null && p.hand.at(-1) === p.drawn ? p.hand.length - 1 : -1,
    discards: p.river.map((discard) => sharedTile(discard.tile)),
    melds: p.melds.map((meld) => ({ tile: sharedTile(meld.tile), from: meld.from,
      type: meld.kind === 'peng' ? 'peng' : meld.kind === 'stored' || meld.kind === 'turn' ? 'angang' : 'gang',
      tiles: Array(meld.kind === 'peng' ? 3 : 4).fill(sharedTile(meld.tile)), added: meld.kind === 'added' })),
  }))
  const tailDraws = tailCount ?? state.players.reduce((sum, player) => sum + player.melds.filter((meld) => meld.kind !== 'peng').length, 0)
  const gifts = giftAwards(state.result?.transfers ?? [])
  const kills = reportKillTotals(state.result?.transfers ?? [])
  return {
    players, wallLeft: state.wall.length, headDrawn: 108 - state.wall.length - tailDraws,
    currentPlayer: state.current, round: state.dealerRound, dealer: state.dealer, honba: state.repeats,
    matchType: state.matchLength === 4 ? 'east' : 'hanchan',
    matchName: MATCH_FORMATS[state.matchLength].name,
    roundLabel: yaotongRoundLabel(state.dealerRound), wallTotal: 108, diceValues: [...state.dice],
    diceThrowerIndex: state.dealer, jokerTiles: ['p1'], wildcardTiles: [],
    wallBreakIndex: ([0, 82, 54, 28][state.wallSide] + state.reservedStacks * 2) % 108,
    yaotongSeats: state.players.map((p, seat) => ({ ...chickenMarks(state, seat), declaration: p.declaration,
      burned: Boolean(state.result && p.burned), winner: state.result?.winners.includes(seat) ?? false,
      winPattern: winningPattern(state.result?.values[seat]), gift: gifts.some((gift) => gift.seat === seat),
      giftAmount: gifts.find((gift) => gift.seat === seat)?.amount,
      killed: kills.some((kill) => kill.seat === seat && kill.paid > 0),
      killedAmount: kills.find((kill) => kill.seat === seat)?.paid })),
    yaotongSidewaysDiscards: state.players.map(p => p.river.flatMap((d, index) => sidewaysDiscard(d) ? [index] : [])),
    ...(state.result ? { yaotongState: state } : {}),
  }
}

export function yaotongReplayResult(state: GameState): RoundResult {
  const result = state.result!
  const winner = result.winners[0] ?? -1
  return {
    draw: result.kind !== 'win', winnerIndex: winner, winner: state.players[winner]?.name,
    winType: result.winKind === 'self' ? 'self-draw' : result.winKind === 'rob' ? 'robbed-kong' : 'discard',
    winTile: result.tile == null ? undefined : sharedTile(result.tile),
    points: result.values[winner]?.h ?? 0, totalWon: result.deltas[winner] ?? 0,
    multiplier: state.dice[0] === state.dice[1] ? 2 : 1,
    details: result.values[winner]?.patterns.map((pattern) => ({ label: pattern.name, points: pattern.points })),
  }
}

export function recordYaotongRound(state: GameState, recorder: ReplayRecorderHooks, characterId?: string) {
  let active = true
  let tailDraws = 0
  function safe(work: () => void) {
    if (!active) return
    try { work() } catch { active = false }
  }
  safe(() => recorder.roundStart(yaotongReplayFrame(state, characterId)))
  return observeGameEvents(state, (current, event: GameEvent) => safe(() => {
    if (event.kind === 'draw' && current.players[event.seat].afterKong) tailDraws++
    const frame = yaotongReplayFrame(current, characterId, tailDraws)
    recorder.step?.(yaotongReplayStep(current, event), frame)
    if (current.result) recorder.roundEnd(yaotongReplayResult(current), frame)
  }))
}

export function yaotongReplayStep(current: GameState, event: GameEvent): Parameters<NonNullable<ReplayRecorderHooks['step']>>[0] {
  const meldIndex = event.tile == null ? -1 : current.players[event.seat].melds.findIndex((meld) => meld.tile === event.tile)
  const meld = current.players[event.seat].melds[meldIndex]
  const actionType: TableActionType | undefined = event.kind === 'peng' ? 'peng' : event.kind === 'kong'
    ? meld?.kind === 'open' ? 'discard-gang' : meld?.kind === 'added' ? 'added-gang' : 'concealed-gang'
    : event.kind === 'hu' ? current.result?.winKind === 'self' ? 'self-draw'
      : current.result?.winKind === 'rob' ? 'robbed-kong-win' : 'discard-win' : undefined
  const kind: ReplayStep['kind'] = event.kind === 'peng' ? 'peng' : event.kind === 'kong'
    ? meld?.kind === 'open' ? 'gang-discard' : meld?.kind === 'added' ? 'gang-added' : 'gang-concealed' : undefined
  const tile = event.tile ?? (event.kind === 'draw' ? current.players[event.seat].drawn : null)
  return {
    t: event.kind === 'draw' || event.kind === 'discard' ? event.kind : event.kind === 'hu' ? 'win'
      : event.kind === 'ready' ? 'ready' : kind ? 'meld' : 'notice',
    seat: event.seat, tile: tile == null ? undefined : sharedTile(tile), actionType, kind, meldIndex,
    from: event.kind === 'hu' ? current.result?.source : event.kind === 'peng' || event.kind === 'kong' ? meld?.from : undefined,
    fromTail: event.kind === 'draw' && current.players[event.seat].afterKong,
    lastDiscardId: event.kind === 'discard' ? event.id : undefined,
    text: event.kind === 'draw' ? undefined : event.text,
  }
}
