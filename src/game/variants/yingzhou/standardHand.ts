import type { HeldTile } from './rules'
import { tileOrder } from '../../core/rules/tiles'

export function handCounts(hand: readonly HeldTile[]) {
  const counts = new Uint8Array(34)
  for (const tile of hand) counts[tileOrder(tile.face)]++
  return counts
}

// 从小到大拆一门数牌。扣除前两档起的顺子后，余数必须向后成顺。
// 三组相同顺子等价于三个刻子，因此只需传递除以三的余数。
function suitComplete(counts: Uint8Array, start: number, pair = -1) {
  let older = 0, previous = 0
  for (let i = start; i < start + 9; i++) {
    const available = counts[i] - (i === pair ? 2 : 0) - older - previous
    if (available < 0) return false
    older = previous
    previous = available % 3
  }
  return older === 0 && previous === 0
}

/** 调用方已核对总张数；字牌和杠后标记牌均按实际牌面判断。 */
export function completeStandardCounts(counts: Uint8Array) {
  let hasPair = false
  for (let i = 27; i < 34; i++) {
    const left = counts[i] % 3
    if (left === 1 || (left === 2 && hasPair)) return false
    if (left === 2) hasPair = true
  }
  for (let start = 0; start < 27; start += 9) {
    let total = 0
    for (let i = start; i < start + 9; i++) total += counts[i]
    if (!total) continue
    if (total % 3 === 0) {
      if (!suitComplete(counts, start)) return false
    } else {
      if (total % 3 !== 2 || hasPair) return false
      let pair = start
      while (pair < start + 9 && (counts[pair] < 2 || !suitComplete(counts, start, pair))) pair++
      if (pair === start + 9) return false
      hasPair = true
    }
  }
  return hasPair
}
