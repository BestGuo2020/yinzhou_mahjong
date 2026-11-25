import type { HeldTile, Win } from './rules'

// The tile has settled at 'land'. Only then may the cinematic start;
// 'impact' is the later beat when the lettering and its sound land.
export const YINGZHOU_WIN_MOTION = {
  self: { cue: 0, takeoff: 170, land: 840, impact: 1030, duration: 1780 },
  rob: { cue: 0, takeoff: 660, land: 1460, impact: 1660, duration: 2480 },
  indicator: { cue: 0, takeoff: 160, land: 1170, impact: 1370, duration: 2240 },
  nine: { cue: 0, takeoff: 160, land: 1170, impact: 1370, duration: 2240 },
  bloom: { cue: 0, takeoff: 240, land: 1020, impact: 1220, duration: 2070 },
} as const
export const HAND_REVEAL_MS = 240

export interface TablePoint { left: number; top: number }
export interface WinTileAnchors { id: number; source?: TablePoint; target: TablePoint }

export interface YingzhouWinDisplay {
  kind: Win['kind']
  zhaIndices: number[]
  revealAt: number | null
}

export function zhaTileIndices(win: Win, hand: readonly HeldTile[]) {
  if (win.kind !== 'indicator' && win.kind !== 'nine') return []
  return hand.flatMap((tile, index) => tile.face === win.tile && !tile.marked ? [index] : []).slice(-3)
}
