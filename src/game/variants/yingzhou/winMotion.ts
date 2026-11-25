import type { HeldTile, Win } from './rules'

export const WIN_PLAYBACK_RATE = 0.8

// Keyframes use animation time. The tile has settled at 'land'. Only then may the cinematic start;
// 'impact' is the later beat when the lettering and its sound land.
export const YINGZHOU_WIN_MOTION = {
  self: { takeoff: 170, land: 840, impact: 1030, duration: 1780 },
  rob: { takeoff: 660, land: 1460, impact: 1660, duration: 2480 },
  indicator: { takeoff: 160, land: 1170, impact: 1370, duration: 2240 },
  nine: { takeoff: 160, land: 1170, impact: 1370, duration: 2240 },
  bloom: { takeoff: 240, land: 1020, impact: 1220, duration: 2070 },
} as const

// The settlement scheduler and audio player take wall-clock milliseconds.
export function winPlaybackTiming(kind: Win['kind']) {
  const { impact, duration } = YINGZHOU_WIN_MOTION[kind]
  return { cue: 0, impact: Math.round(impact / WIN_PLAYBACK_RATE), duration: Math.round(duration / WIN_PLAYBACK_RATE) }
}
export const HAND_REVEAL_MS = Math.round(240 / WIN_PLAYBACK_RATE)

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
