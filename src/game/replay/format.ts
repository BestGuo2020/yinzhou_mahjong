// 回放列表与牌谱的纯文案工具（全部无副作用，便于单测）。
import type { MatchType, TileType } from '../core/contracts/types'
import { tileName } from '../core/rules/tiles'
import { MATCH_FORMATS, MATCH_LENGTHS } from '../core/rules/matchFormats'
import type { ReplayMatch, ReplayMeldKind, ReplayPlayer, ReplayRound, ReplayRoundFinal, ReplayStep } from './types'
import { settlementTitle } from '../variants/yaotong/presentation'
import { YAOTONG_MODES } from '../variants/yaotong/mode'
import { MODES } from '../variants/yingzhou/rules'
import { REPLAY_SCHEMA_VERSION } from './types'
import { displayPoints } from '../variants/yingzhou/coins'

const pad = (value: number) => String(value).padStart(2, '0')

/** 「东风场」/「半庄场」。 */
export const MATCH_NAME_LABELS: Record<MatchType, string> = { east: '东风场', hanchan: '半庄场' }

export function replayModeLabel(match: Pick<ReplayMatch, 'rulesetId' | 'yingzhouMode' | 'yaotongMode' | 'summary'>): string {
  if (match.rulesetId === 'yingzhou') {
    // 旧牌谱的摘要以末局局名开头，玩法后面可能还有“小牌禁胡”。
    const name = match.yingzhouMode ? MODES[match.yingzhouMode]?.name
      : /·\s*(活杠|死杠|死九|死9)(?=[\s·]|$)/.exec(match.summary)?.[1]
    return name === '死九' ? '死9' : name ?? ''
  }
  return match.yaotongMode ? YAOTONG_MODES[match.yaotongMode]?.name ?? '' : ''
}

/** 旧颍州牌谱保存的是“4 局场”等数字名称，仅在展示时换成对应的场次名。 */
export function replayMatchName({ rulesetId, matchName }: Pick<ReplayMatch, 'rulesetId' | 'matchName'>): string {
  if (rulesetId !== 'yingzhou') return matchName
  const length = MATCH_LENGTHS.find(count => matchName === `${count} 局场`)
  return length === undefined ? matchName : MATCH_FORMATS[length].name
}

/**
 * 对局日期：今天 → 「21:03」；本年内 → 「9月14日 21:03」；跨年 → 「2025年9月14日」。
 * 用本地时间手工拼装，避免 toLocaleString 在不同环境下的格式差异。
 */
export function formatMatchDate(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—'
  const date = new Date(timestamp)
  const today = new Date(now)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
  if (sameDay) return time
  const day = `${date.getMonth() + 1}月${date.getDate()}日`
  return date.getFullYear() === today.getFullYear() ? `${day} ${time}` : `${date.getFullYear()}年${day}`
}

/** 位次：1~4 位；未打完显示「—」。 */
export function formatRank(rank?: number): string {
  return typeof rank === 'number' && rank > 0 ? `${rank}位` : '—'
}

export type RankTone = 'first' | 'second' | 'third' | 'fourth' | 'none'

export function rankTone(rank?: number): RankTone {
  if (rank === 1) return 'first'
  if (rank === 2) return 'second'
  if (rank === 3) return 'third'
  if (rank === 4) return 'fourth'
  return 'none'
}

/** 净胜分：带符号，0 显示「±0」。 */
export function formatDelta(delta?: number): string {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return '±0'
  if (delta === 0) return '±0'
  return `${delta > 0 ? '+' : ''}${delta}`
}

/** 局数文案：与 gameSelectors 同一套规则（东风场 1-4 东，半庄场 5-8 南）。 */
export function roundLabelFor(round: number, _matchType: MatchType): string {
  const wind = round > 4 ? '南' : '东'
  return `${wind}${((round - 1) % 4) + 1}局`
}

/** 巡目：每 4 次出牌为一巡。 */
export function formatTurn(turn: number): string {
  return `${Math.max(1, turn)}巡`
}

export function formatPosition(index: number, total: number): string {
  return `${index}/${total}`
}

const MELD_LABELS: Record<ReplayMeldKind, string> = {
  peng: '碰',
  chi: '吃',
  'gang-discard': '杠',
  'gang-concealed': '暗杠',
  'gang-added': '加杠',
  'gang-flower': '花杠',
  'gang-wind': '风杠',
}

export function meldLabel(kind?: ReplayMeldKind): string {
  return kind ? MELD_LABELS[kind] : '鸣牌'
}

/** 旧牌谱把自摸保存为“普通自摸”，胡牌事件还可能带有倍率。 */
export function replayWinText(text: string): string {
  return text.replace(/^普通自摸(?=$| ×\d+$)/, '自摸')
}

/** 牌谱事件一句话文案（不含玩家名，玩家名由组件按座位拼）。 */
export function stepSummary(step: ReplayStep): string {
  if (step.text) return step.t === 'win' ? replayWinText(step.text) : step.text
  const tile = step.tile ? tileName(step.tile) : ''
  switch (step.t) {
    case 'draw':
      return step.fromTail ? `补牌 ${tile}` : `摸 ${tile}`
    case 'discard':
      return `打 ${tile}`
    case 'meld':
      return `${meldLabel(step.kind)} ${tile}`
    case 'win':
      if (step.actionType === 'robbed-kong-win') return `抢杠胡 ${tile}`
      if (step.actionType === 'discard-win') return `胡 ${tile}`
      return `自摸 ${tile}`
    default:
      return tile
  }
}

/** 摘要的主语是赢家；点炮是出牌者的动作，不能接在赢家姓名后。 */
export function replayWinLabel(winType: ReplayRoundFinal['winType'], recordedLabel?: string): string {
  if (recordedLabel) return replayWinText(recordedLabel)
  if (winType === 'discard') return '胡牌'
  if (winType === 'robbed-kong') return '抢杠'
  if (winType === 'tianhu') return '天胡'
  if (winType === 'dihu') return '地胡'
  return '自摸'
}

export function replayMatchSummary(
  rounds: readonly ReplayRound[],
  players: readonly ReplayPlayer[],
  humanSeat: number,
): string {
  const last = rounds.reduce<ReplayRound | undefined>(
    (latest, round) => !latest || round.roundIndex > latest.roundIndex ? round : latest,
    undefined,
  )
  if (!last?.final) return ''
  if (last.final.yaotongState?.result) {
    const result = last.final.yaotongState.result
    const names = result.winners.map((seat) => players[seat]?.name ?? '').join('、')
    return `${last.roundLabel} ${names ? `${names} · ` : ''}${settlementTitle(result)}`
  }
  if (last.final.draw) return last.roundLabel + (last.anchor?.yingzhou ? ' 流局' : ' 荒庄')
  const winner = last.final.winSeat
  if (winner == null) return `${last.roundLabel} 本局结束`
  const name = players[winner]?.name ?? ''
  const method = replayWinLabel(last.final.winType, last.final.result?.winLabel)
  return `${last.roundLabel} ${name}${method}${winner === humanSeat ? '（本家）' : ''}`
}

/** 旧录制仍可观看；再次导出时只用末局的权威结果修正错误摘要。 */
export function replayMatchWithCurrentSummary(match: ReplayMatch, rounds: readonly ReplayRound[]): ReplayMatch {
  const summary = replayMatchSummary(rounds, match.players, match.humanSeat)
  return summary && summary !== match.summary ? { ...match, summary } : match
}

/** 列表副标题：局数 · 位次 · 净胜分。 */
export function matchSubtitle(match: Pick<ReplayMatch, 'roundCount' | 'myRank' | 'myScore' | 'status' | 'coinMultiplier'>): string {
  const rounds = `${match.roundCount}局`
  if (match.status === 'aborted') return `${rounds} · 未完成`
  if (match.coinMultiplier) return `${rounds} · ${formatRank(match.myRank)} · ${displayPoints(match.myScore ?? 0, match.coinMultiplier, true)}金币`
  return `${rounds} · ${formatRank(match.myRank)} · ${formatDelta(match.myScore)}分`
}

/** 对局来源：单机 / 联机（联机牌谱由房主生成后下发，四家均为明牌）。 */
export function gameModeLabel(match: Pick<ReplayMatch, 'gameMode'>): string {
  return match.gameMode === 'remote' ? '联机' : '单机'
}

/**
 * 牌谱格式版本提示（§9.5）：本地库里的记录不因为版本被清空（旧记录照常观看），
 * 但"由更新版本写下、本程序不认识"的记录要**说出来** —— 静默按旧规则渲染才是真正的坑
 * （字段可能整体缺失，看起来像"这场没打完"）。
 * 返回 null 表示版本与当前一致或更旧（旧格式本来就兼容可读）。
 */
export function replayVersionNotice(
  match: Pick<ReplayMatch, 'schemaVersion'>,
  current = REPLAY_SCHEMA_VERSION,
): string | null {
  const version = match.schemaVersion
  if (typeof version !== 'number' || !Number.isFinite(version) || version <= current) return null
  return `牌谱版本 v${version} 高于本程序（v${current}），可能显示不完整`
}
