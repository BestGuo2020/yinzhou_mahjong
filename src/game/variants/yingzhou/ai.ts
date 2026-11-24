import { standardShanten } from '../../shared/ai/handProgress'
import { decisionSeat, legalActions, type Action, type Round } from './engine'
import { isSuited, nineOf } from './rules'

/** 只读取自己的牌和公开亮牌，四个座位（含托管）使用同一套合法动作。 */
export function chooseAction(round: Round): Action {
  const actions = legalActions(round)
  const wins = actions.filter(action => action.kind === 'win')
  if (wins.length) return wins.reduce((best, next) => next.win.multiplier > best.win.multiplier ? next : best)
  const kong = actions.find(action => action.kind === 'kong')
  if (kong) return kong
  const seat = round.players[decisionSeat(round)]
  const faces = seat.hand.map(tile => tile.face)
  if (round.window.kind === 'claim') {
    const tile = round.window.tile
    const remaining = [...faces]
    remaining.splice(remaining.indexOf(tile), 1)
    remaining.splice(remaining.indexOf(tile), 1)
    const improves = standardShanten(remaining, seat.melds.length + 1) <= standardShanten(faces, seat.melds.length)
    return { kind: improves ? 'peng' : 'pass' }
  }
  if (round.window.kind !== 'turn') return actions[0]
  let bestIndex = 0
  let bestScore = -Infinity
  for (let index = 0; index < faces.length; index++) {
    const kept = faces.filter((_, i) => i !== index)
    const { face, marked } = seat.hand[index]
    // 向听优先。同向听时优先解开标记限制，保留能报扎的对子和相连的数牌。
    const zhaTarget = face === round.indicator
      || (round.settings.mode === 'nine' && isSuited(round.indicator) && face === nineOf(round.indicator))
    const neighbors = isSuited(face) ? kept.filter(t => t[0] === face[0] && Math.abs(Number(t[1]) - Number(face[1])) <= 2).length : 0
    const score = -100 * standardShanten(kept, seat.melds.length) + (marked ? 25 : 0)
      - (zhaTarget && !marked ? 4 * (1 + kept.filter(t => t === face).length) : 0) - neighbors
    if (score > bestScore) { bestScore = score; bestIndex = index }
  }
  return { kind: 'discard', index: bestIndex }
}
