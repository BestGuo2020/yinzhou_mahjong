import type { WaitInfo } from '../../core/contracts/gamePort'
import type { TileType } from '../../core/contracts/types'
import { TILE_TYPES } from '../../core/rules/tiles'
import { standardShanten } from '../../shared/ai/handProgress'
import type { Round } from './engine'
import { isSuited, ordinary, standardWin, type HeldTile } from './rules'

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
  function waits(hand: HeldTile[]): WaitInfo | null {
    if (hand.length !== 13 - 3 * exposed || hand.some(tile => tile.marked)) return null
    const faces = hand.map(tile => tile.face)
    if (standardShanten(faces, exposed) !== 0) return null
    const tiles = TILE_TYPES.filter(face =>
      (!round.settings.smallBan || (isSuited(face) && Number(face[1]) >= 4))
      && faces.filter(tile => tile === face).length < 4 && standardWin([...hand, ordinary(face)], exposed),
    ).map(tile => ({ tile, remaining: Math.max(0, 4 - (counts.get(tile) ?? 0)) }))
    return tiles.length ? { discard: null, tiles, any: false, remaining: tiles.reduce((n, t) => n + t.remaining, 0) } : null
  }
  const options: WaitInfo[] = []
  if (canDiscard) {
    const byDiscard = new Map<string, WaitInfo | null>()
    seat.hand.forEach((tile, index) => {
      const key = tile.face + (tile.marked ? '*' : '')
      if (!byDiscard.has(key)) byDiscard.set(key, waits(seat.hand.filter((_, i) => i !== index)))
      const info = byDiscard.get(key)
      if (info) options.push({ ...info, discard: tile.face, discardIndex: index })
    })
  }
  return { current: waits(seat.hand), options }
}
