import type { GameEvent, KongKind } from './types'

export const KONG_WEATHER_DURATION = 2200
export const REDUCED_KONG_WEATHER_DURATION = 600
export const DEFAULT_KONG_SOUND = 'gang.ogg'
export const CONCEALED_KONG_SOUND = 'angang.ogg'
export const ADDED_KONG_SOUND = 'bugang.ogg'
export interface KongWeatherCue {
  id: number
  seat: number
  kind: 'tornado' | 'rain'
  startedAt: number
  duration: number
  reducedMotion: boolean
  /** 实桌从首个绘制帧起播，播完归还提示；回放和预览可按 startedAt 定位。 */
  onPlaybackEnd?: () => void
}

export function eventKongKind(event: Pick<GameEvent, 'kind' | 'text' | 'kongKind'>): KongKind | null {
  if (event.kind !== 'kong' && event.kind !== 'kong-intent') return null
  if (event.kongKind) return event.kongKind
  // 兼容尚未携带杠型的旧事件及联机快照。
  if (event.kind === 'kong-intent' || event.text === '补杠') return 'added'
  if (event.text === '明杠') return 'open'
  if (event.text === '暗杠') return 'turn'
  // 早期事件曾将当次暗杠误写为“转弯杠”，仅在此兼容旧数据。
  if (event.text === '转弯杠') return 'turn'
  if (event.text === '存杠') return 'stored'
  return null
}

/** Only completed kongs celebrate: an added-kong declaration can still be robbed. */
export function kongWeatherKind(event: GameEvent): KongWeatherCue['kind'] | null {
  if (event.kind !== 'kong') return null
  const kind = eventKongKind(event)
  if (kind === 'open' || kind === 'added') return 'tornado'
  if (kind === 'turn' || kind === 'stored') return 'rain'
  return null
}

/**
 * 明杠播“杠”，暗杠（含存杠）播“暗杠”，碰后加第四张播“补杠”。
 * 碰后加第四张在宣告（kong-intent）时播报，成功事件不再重复播放。
 */
export function kongSoundFile(event: GameEvent): string {
  const kind = eventKongKind(event)
  if (kind === 'added') return ADDED_KONG_SOUND
  if (kind === 'turn' || kind === 'stored') return CONCEALED_KONG_SOUND
  return DEFAULT_KONG_SOUND
}
