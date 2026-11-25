import type { HeldTile, Win } from './rules'

// Keyframes use animation time. The tile has settled at 'land'. Only then may the cinematic start;
// 'impact' is the later beat when the lettering and its sound land.
export const YINGZHOU_WIN_MOTION = {
  self: { rate: 1, takeoff: 170, land: 840, impact: 1030, duration: 1780 },
  rob: { rate: 1, takeoff: 660, land: 1460, impact: 1660, duration: 2480 },
  indicator: { rate: .8, takeoff: 160, land: 1170, impact: 1370, duration: 2240 },
  nine: { rate: .8, takeoff: 160, land: 1170, impact: 1370, duration: 2240 },
  bloom: { rate: .8, takeoff: 240, land: 1020, impact: 1220, duration: 2070 },
} as const

// The settlement scheduler and audio player take wall-clock milliseconds.
export function winPlaybackTiming(kind: Win['kind']) {
  const { rate, impact, duration } = YINGZHOU_WIN_MOTION[kind]
  return { cue: 0, impact: Math.round(impact / rate), duration: Math.round(duration / rate) }
}
export const HAND_REVEAL_MS = 240

export interface RobSourceAnchor { id: number; left: number; top: number }

export interface YingzhouWinDisplay {
  kind: Win['kind']
  zhaIndices: number[]
  revealAt: number | null
}

export function zhaTileIndices(win: Win, hand: readonly HeldTile[]) {
  if (win.kind !== 'indicator' && win.kind !== 'nine') return []
  return hand.flatMap((tile, index) => tile.face === win.tile && !tile.marked ? [index] : []).slice(-3)
}
