import type { HeldTile, Win } from './rules'

// Times are relative to the start of the winning-tile animation.
export const YINGZHOU_WIN_MOTION = {
  self: { cue: 0, duration: 1500, impact: 430 },
  rob: { cue: 0, duration: 1660, impact: 540 },
  indicator: { cue: 0, duration: 2050, impact: 650 },
  nine: { cue: 0, duration: 2050, impact: 650 },
  bloom: { cue: 0, duration: 1850, impact: 560 },
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
