import type { WaitInfo } from '../../core/contracts/gamePort'
import type { TileType } from '../../core/contracts/types'
import { TILE_TYPES, tileOrder } from '../../core/rules/tiles'
import { completeStandardCounts, handCounts } from './standardHand'
import type { Round } from './engine'
import { isSuited } from './rules'

/** 只计算自摸的听口；报扎和杠开由各自的实时按钮提示。 */
export function handWaits(round: Round, seatIndex: number, canDiscard: boolean) {
  const seat = round.players[seatIndex]
  const exposed = seat.melds.length
  const counts = new Map<TileType, number>()
  const seen = (face: TileType) => counts.set(face, (counts.get(face) ?? 0) + 1)
  seat.hand.forEach(tile => { if (!tile.marked) seen(tile.face) })
  round.openingDiscards.forEach(seen)
  for (const player of round.players) {
    player.discards.forEach((face, index) => { if (!player.markedDiscardIndices.includes(index)) seen(face) })
    player.melds.forEach(meld => meld.tiles.forEach(seen))
  }
  const held = handCounts(seat.hand)
  const marks = seat.hand.filter(tile => tile.marked).length
  const smallBan = round.settings.smallBan
  function waits(length: number, marked: number): WaitInfo | null {
    if (length !== 13 - 3 * exposed || marked > 0) return null
    const tiles: WaitInfo['tiles'] = []
    for (let index = 0; index < TILE_TYPES.length; index++) {
      const face = TILE_TYPES[index]
      if (held[index] >= 4 || (smallBan && (!isSuited(face) || Number(face[1]) < 4))) continue
      held[index]++
      const win = completeStandardCounts(held)
      held[index]--
      if (win) tiles.push({ tile: face, remaining: Math.max(0, 4 - (counts.get(face) ?? 0)) })
    }
    return tiles.length ? { discard: null, tiles, any: false, remaining: tiles.reduce((n, t) => n + t.remaining, 0) } : null
  }
  const options: WaitInfo[] = []
  if (canDiscard) {
    const byDiscard = new Map<string, WaitInfo | null>()
    seat.hand.forEach((tile, index) => {
      const key = tile.face + (tile.marked ? '*' : '')
      if (!byDiscard.has(key)) {
        const face = tileOrder(tile.face)
        held[face]--
        byDiscard.set(key, waits(seat.hand.length - 1, marks - Number(tile.marked)))
        held[face]++
      }
      const info = byDiscard.get(key)
      if (info) options.push({ ...info, discard: tile.face, discardIndex: index })
    })
  }
  return { current: waits(seat.hand.length, marks), options }
}
