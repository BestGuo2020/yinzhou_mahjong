export type CoinMultiplier = 1 | 3
export const coinsForPoints = (points: number, multiplier: CoinMultiplier) => points * 100_000 * multiplier

export function formatCoins(coins: number, signed = false) {
  const value = Math.abs(coins)
  const sign = coins < 0 ? '−' : signed && coins > 0 ? '+' : ''
  if (value >= 100_000_000 && value % 1_000_000 === 0) return sign + value / 100_000_000 + '亿'
  if (value >= 10_000 && value % 10_000 === 0) return sign + value / 10_000 + '万'
  return sign + value.toLocaleString('zh-CN')
}

/** 旧牌谱和共用牌桌仍可按原积分显示。 */
export function displayPoints(points: number, rate?: CoinMultiplier, signed = false) {
  return rate ? formatCoins(coinsForPoints(points, rate), signed) : (signed && points > 0 ? '+' : '') + points
}
