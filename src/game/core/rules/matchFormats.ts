export const MATCH_LENGTHS = [4, 8, 16] as const
export type MatchLength = typeof MATCH_LENGTHS[number]

export const MATCH_FORMATS = {
  4: { name: '东风场', winds: '东风一圈' },
  8: { name: '半庄场', winds: '东、南两圈' },
  16: { name: '全庄场', winds: '东、南、西、北四圈' },
} as const satisfies Record<MatchLength, { name: string; winds: string }>

/** 每四个庄次换一圈风，连庄沿用同一局号。 */
export function windRoundLabel(dealerRound: number): string {
  const index = dealerRound - 1
  return `${['东', '南', '西', '北'][Math.floor(index / 4)]}${index % 4 + 1}局`
}
