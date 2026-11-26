// 牌谱导出：把一场回放（场次 + 各局事件流）打包成 JSON，供玩家自行留存/分享。
import { inAndroidApp, saveAndroidJson, type AndroidSaveResult } from './androidExport'
import { REPLAY_SCHEMA_VERSION, type ReplayMatch, type ReplayRound } from './types'
import { replayMatchWithCurrentSummary } from './format'

export interface ReplayExportPayload {
  /** 导出格式版本，供将来迁移。 */
  schemaVersion: number
  kind: 'lianhua-replay'
  exportedAt: number
  match: ReplayMatch
  rounds: ReplayRound[]
}

/** 打包导出内容（局按 roundIndex 升序，保证文件内容稳定可比对）。 */
export function buildReplayExport(
  match: ReplayMatch,
  rounds: readonly ReplayRound[],
  exportedAt = Date.now(),
): ReplayExportPayload {
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    kind: 'lianhua-replay',
    exportedAt,
    match: replayMatchWithCurrentSummary(match, rounds),
    rounds: [...rounds].sort((a, b) => a.roundIndex - b.roundIndex),
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** 文件名：玩法 + 本地时间 + 场次 id 前缀（ASCII，跨平台安全）。 */
export function replayExportFilename(match: ReplayMatch, exportedAt = Date.now()): string {
  const date = new Date(exportedAt)
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
  const shortId = match.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'match'
  return `replay-${match.rulesetId}-${stamp}-${shortId}.json`
}

export type ExportResult = AndroidSaveResult | 'download' | 'unsupported'

export async function downloadJsonFile(payload: unknown, filename: string): Promise<ExportResult> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return 'unsupported'
  const json = JSON.stringify(payload, null, 2)
  if (inAndroidApp()) return saveAndroidJson(filename, json)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 交给下一轮事件循环再回收，避免部分浏览器下载未开始就失效。
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0)
  return 'download'
}

/** 触发展示回放（牌谱）下载；分析包导出复用同一实现（`downloadJsonFile`）。 */
export function downloadReplayExport(payload: ReplayExportPayload, filename: string): Promise<ExportResult> {
  return downloadJsonFile(payload, filename)
}
