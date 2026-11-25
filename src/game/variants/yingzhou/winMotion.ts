import type { HeldTile, Win } from './rules'

export const WIN_PLAYBACK_RATE = .8
// Keyframes are in animation time. Only a zha declaration opens with a separate hand-to-table flight.
export const YINGZHOU_WIN_MOTION = {
  self: { cinematicStart: 0, beamStart: 0, impact: 430, duration: 1500 },
  rob: { cinematicStart: 0, beamStart: 640, impact: 540, duration: 1660 },
  indicator: { cinematicStart: 1170, beamStart: 1170, impact: 1370, duration: 2240 },
  nine: { cinematicStart: 1170, beamStart: 1170, impact: 1370, duration: 2240 },
  bloom: { cinematicStart: 0, beamStart: 560, impact: 560, duration: 1850 },
} as const

// The settlement scheduler and audio player take wall-clock milliseconds.
export function winPlaybackTiming(kind: Win['kind']) {
  const { impact, duration } = YINGZHOU_WIN_MOTION[kind]
  return { cue: 0, impact: Math.round(impact / WIN_PLAYBACK_RATE), duration: Math.round(duration / WIN_PLAYBACK_RATE) }
}
export const HAND_REVEAL_MS = Math.round(240 / WIN_PLAYBACK_RATE)

export interface YingzhouWinDisplay {
  kind: Win['kind']
  zhaIndices: number[]
  revealAt: number | null
}

export function zhaTileIndices(win: Win, hand: readonly HeldTile[]) {
  if (win.kind !== 'indicator' && win.kind !== 'nine') return []
  return hand.flatMap((tile, index) => tile.face === win.tile && !tile.marked ? [index] : []).slice(-3)
}
