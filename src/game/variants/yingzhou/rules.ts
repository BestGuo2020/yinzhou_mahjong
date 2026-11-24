import type { Meld, SuitedTile, TileType } from '../../core/contracts/types'
import { tileOrder } from '../../core/rules/tiles'
import { standardShanten } from '../../shared/ai/handProgress'

export const BASE_POINTS = 10
export const MODES = {
  live: { name: '活杠', description: '开杠拿走墙尾亮牌，随后翻亮新牌。' },
  fixed: { name: '死杠', description: '亮牌固定，开杠补一张同牌面的标记牌。' },
  nine: { name: '死九', description: '开杠补同花色的标记九，也可以用三张普通九报扎。' },
} as const
export type Mode = keyof typeof MODES
export interface Settings { mode: Mode; smallBan: boolean }
export interface HeldTile { face: TileType; marked: boolean }
export interface Seat {
  hand: HeldTile[]
  melds: Meld[]
  discards: TileType[]
  drawnIndex: number
  score: number
}
export const KONG_NAMES = { exposed: '明杠', concealed: '暗杠', added: '补杠' } as const
export type Kong = keyof typeof KONG_NAMES
export type WinKind = 'self' | 'bloom' | 'rob' | 'indicator' | 'nine'
export interface Win {
  kind: WinKind
  tile: TileType
  label: string
  parts: { label: string; multiplier: number }[]
  multiplier: number
}

export const ordinary = (face: TileType): HeldTile => ({ face, marked: false })
export const isSuited = (face: TileType): face is SuitedTile => face.length === 2
export const nineOf = (face: SuitedTile): SuitedTile => (face[0] + '9') as SuitedTile
export const sortHeld = (hand: HeldTile[]) =>
  hand.sort((a, b) => tileOrder(a.face) - tileOrder(b.face) || Number(a.marked) - Number(b.marked))
export const ordinaryCount = (hand: HeldTile[], face: TileType) =>
  hand.filter(tile => !tile.marked && tile.face === face).length

export function standardWin(hand: HeldTile[], meldCount: number) {
  return hand.length === (4 - meldCount) * 3 + 2
    && standardShanten(hand.map(tile => tile.face), meldCount) === -1
}

function baseWin(kind: WinKind, tile: TileType, label: string, multiplier: number): Win {
  return { kind, tile, label, parts: [{ label, multiplier }], multiplier }
}

export function zhaWin(hand: HeldTile[], indicator: TileType, mode: Mode): Win | null {
  if (ordinaryCount(hand, indicator) >= 3) return baseWin('indicator', indicator, '扎亮牌', 3)
  if (mode === 'nine' && isSuited(indicator) && ordinaryCount(hand, nineOf(indicator)) >= 3) {
    return baseWin('nine', nineOf(indicator), '扎九', 2)
  }
  return null
}

export function drawWin(seat: Seat, settings: Settings, indicator: TileType,
  kong?: { kind: Kong; oldMarks: number; last: boolean }): Win | null {
  const drawn = seat.hand[seat.drawnIndex]
  if (!drawn || !standardWin(seat.hand, seat.melds.length)) return null
  if (!kong && !ordinaryWinAllowed(seat, drawn.face, settings)) return null
  const label = kong?.last ? '海底捞月' : kong ? '杠上开花' : '自摸'
  const win = baseWin(kong ? 'bloom' : 'self', drawn.face, label, kong ? (kong.kind === 'concealed' ? 3 : 2) : 1)
  if (kong) {
    win.parts[0].label = KONG_NAMES[kong.kind] + '开花'
    if (kong.oldMarks) win.parts.push({ label: `旧标记 ${kong.oldMarks} 张`, multiplier: 2 * kong.oldMarks })
  }
  // 留扎加分看胡张进手前仍然保留的普通牌，不能用本次补牌凑足第三张。
  const retained = zhaWin(seat.hand.filter((_, index) => index !== seat.drawnIndex), indicator, settings.mode)
  if (retained) win.parts.push({ label: '留' + retained.label, multiplier: retained.multiplier })
  win.multiplier = win.parts.reduce((total, part) => total + part.multiplier, 0)
  return win
}

function ordinaryWinAllowed(seat: Seat, face: TileType, settings: Settings) {
  return !seat.hand.some(tile => tile.marked)
    && (!settings.smallBan || (isSuited(face) && Number(face[1]) >= 4))
}

export function robWin(seat: Seat, face: TileType, settings: Settings): Win | null {
  return ordinaryWinAllowed(seat, face, settings) && standardWin([...seat.hand, ordinary(face)], seat.melds.length)
    ? baseWin('rob', face, '抢补杠胡', 2) : null
}

export function payments(winner: number, win: Win, payer: number | null): number[] {
  const share = BASE_POINTS * win.multiplier
  return [0, 1, 2, 3].map(seat => {
    if (seat === winner) return 3 * share
    if (payer === null) return -share
    return seat === payer ? -3 * share : 0
  })
}
