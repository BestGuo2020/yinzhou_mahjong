import { expect, it } from 'vitest'
import { TILE_TYPES } from '../../core/rules/tiles'
import { standardShanten } from '../../shared/ai/handProgress'
import { completeStandardCounts } from './standardHand'

it('无精标准胡与向听枚举一致，覆盖 0～4 副露、字牌、同面标记和相互重叠的顺子', () => {
  let seed = 312
  const random = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return Math.floor(seed / 2 ** 32 * n)
  }
  for (let exposed = 0; exposed <= 4; exposed++) {
    for (let sample = 0; sample < 100; sample++) {
      const pair = random(34), indexes = [pair, pair]
      for (let meld = exposed; meld < 4; meld++) {
        if (random(2)) {
          const start = random(3) * 9 + random(7)
          indexes.push(start, start + 1, start + 2)
        } else {
          const face = random(34)
          indexes.push(face, face, face)
        }
      }
      if (sample % 2) indexes[random(indexes.length)] = random(34)
      const counts = new Uint8Array(34)
      indexes.forEach(index => counts[index]++)
      const hand = indexes.map(index => TILE_TYPES[index])
      expect(completeStandardCounts(counts), hand.join(',')).toBe(standardShanten(hand, exposed) === -1)
    }
  }
})
