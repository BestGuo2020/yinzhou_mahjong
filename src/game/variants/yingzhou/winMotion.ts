import type { HeldTile, Win } from './rules'

// Times are relative to the start of the winning-tile animation.
export const YINGZHOU_WIN_MOTION = {
  self: { cue: 520, duration: 260, impact: null },
  rob: { cue: 0, duration: 860, impact: 340 },
  indicator: { cue: 0, duration: 1200, impact: 510 },
  nine: { cue: 0, duration: 1200, impact: 510 },
  bloom: { cue: 0, duration: 1000, impact: 280 },
} as const
export const HAND_REVEAL_MS = 240

export interface YingzhouWinDisplay {
  kind: Win['kind']
  zhaIndices: number[]
  revealAt: number | null
}

export function zhaTileIndices(win: Win, hand: readonly HeldTile[]) {
  if (win.kind !== 'indicator' && win.kind !== 'nine') return []
  return hand.flatMap((tile, index) => tile.face === win.tile && !tile.marked ? [index] : []).slice(-3)
}
