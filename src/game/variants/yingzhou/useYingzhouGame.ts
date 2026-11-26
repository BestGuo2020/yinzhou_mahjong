import { computed, onScopeDispose, ref, shallowRef, toRaw, watch, type Ref } from 'vue'
import type { DealAnimation, GamePhase, OpeningStage } from '../../core/contracts/gamePort'
import type { TileType } from '../../core/contracts/types'
import { WALL_TOTAL } from '../../core/rules/wallLayout'
import { AI_DELAYS } from '../../core/controllers/playerController'
import { LOCAL_TABLE_PACE, PACE_MS } from '../../core/local/localGameConfig'
import type { MatchLength } from '../../core/rules/matchFormats'
import { OPENING_PACE_MS, playOpeningCue } from '../../shared/runtime/localOpening'
import type { ReplayRecording } from '../../replay/useReplayRecorder'
import { chooseAction } from './ai'
import { stepRound, dealRound, decisionSeat, followingRound, legalActions, nextDealer, type Action, type Round } from './engine'
import { replayFrame, tableResult } from './presentation'
import { type Settings } from './rules'
import { useTablePresentation, type TableAudio } from './useTablePresentation'
import { handWaits } from './waits'

export function useYingzhouGame(replay: ReplayRecording, paused: Ref<boolean>, audio: TableAudio) {
  const settings = ref<Settings>({ mode: 'live', smallBan: false, coinMultiplier: 1 })
  const length = ref<MatchLength>(4)
  const matchLength = ref(length.value)
  const round = ref<Round | null>(null)
  const ready = ref(false) // 同一张 3D 牌桌只在首次加载或换主题后等待 ready。
  const autoplay = ref(false)
  const selectedIndex = ref(-1)
  const dealStep = ref(-1) // -1 开场，0 双骰，1..16 各家拿牌
  const effects = useTablePresentation(audio, () => round.value)
  const { view } = effects
  const pending = shallowRef<{ at: number; run: () => void } | null>(null)
  let reactionUntil = 0
  let stepStarted = 0
  let openingCue: { step: number; done: Promise<void> } | null = null
  const opening = computed(() => !!round.value && dealStep.value <= round.value.openingBatches.length)
  const dealCount = computed(() => Math.max(0, dealStep.value))
  const dealtBatches = computed(() => opening.value ? round.value!.openingBatches.slice(0, dealCount.value) : [])
  const openingStage = computed<OpeningStage | null>(() => opening.value
    ? dealStep.value < 0 ? 'start' : dealStep.value === 0 ? 'dice' : 'deal' : null)
  const finished = computed(() => {
    const state = round.value
    return !!state && state.dealerRound === matchLength.value && nextDealer(state) !== state.dealer
  })
  const actor = computed(() => round.value ? decisionSeat(round.value) : -1)
  const playable = computed(() => ready.value && !opening.value && !paused.value && !autoplay.value
    && !pending.value && !round.value?.result && actor.value === 0)
  const options = computed(() => round.value && playable.value ? legalActions(round.value) : [])
  const controls = computed(() => options.value.filter(option => option.kind !== 'discard' && option.kind !== 'draw' && option.kind !== 'advance'))
  const mayDiscard = computed(() => playable.value && round.value?.window.kind === 'turn')
  const waits = computed(() => round.value && !opening.value && !round.value.result
    ? handWaits(round.value, 0, mayDiscard.value) : { current: null, options: [] })
  const selectedWaits = computed(() => waits.value.options.find(option => option.discardIndex === selectedIndex.value) ?? null)
  const players = computed(() => {
    const state = round.value
    if (!state) return []
    const seats = effects.visiblePlayers(state)
    if (!opening.value) return seats
    seats.forEach(seat => {
      seat.hand = []
      seat.drawnTileIndex = -1
    })
    for (const batch of dealtBatches.value) seats[batch.seat].hand.push(...batch.tiles)
    return seats
  })
  const headDrawn = computed(() => opening.value ? players.value.reduce((n, p) => n + p.hand.length, 0) : round.value?.headDrawn ?? 0)
  const wall = computed(() => opening.value ? Array<TileType>(WALL_TOTAL - headDrawn.value).fill('east') : round.value?.wall ?? [])
  const dealAnimation = computed<DealAnimation>(() => {
    const batch = dealtBatches.value.at(-1)
    const serial = dealCount.value
    if (!batch) return { playerIndex: -1, count: 0, serial }
    const taken = new Set(dealtBatches.value.flatMap(b => b.offsets))
    return {
      playerIndex: batch.seat, count: batch.tiles.length, serial, sourceOffsets: batch.offsets,
      remainingWallOffsets: Array.from({ length: WALL_TOTAL }, (_, i) => i).filter(i => !taken.has(i)),
    }
  })
  const phase = computed<GamePhase>(() => {
    if (!round.value) return 'lobby'
    if (opening.value) return dealStep.value <= 0 ? 'opening' : 'dealing'
    if (round.value.result) return view.phase.value
    if (round.value.window.kind === 'check-rob' || round.value.window.kind === 'supplement') return 'kong'
    return round.value.window.kind === 'turn' ? 'discard' : round.value.window.kind === 'draw' ? 'drawing' : 'prompt'
  })
  function open(state: Round) {
    effects.reset()
    pending.value = null
    reactionUntil = 0
    stepStarted = Date.now()
    openingCue = null
    selectedIndex.value = -1
    dealStep.value = -1
    round.value = state
    replay.hooks.roundStart(replayFrame(state, matchLength.value))
  }
  function start() {
    if (!round.value) {
      autoplay.value = false
      matchLength.value = length.value
      open(dealRound(settings.value))
    }
  }
  function next() {
    if (view.result.value && round.value?.result && !finished.value) open(followingRound(round.value))
  }
  function leave() {
    if (replay.active()) replay.finish(finished.value ? 'finished' : 'aborted')
    effects.reset()
    pending.value = null
    openingCue = null
    round.value = null
    ready.value = false
    autoplay.value = false
  }
  function defer(delay: number, run: () => void) {
    if (delay > 0) pending.value = { at: Date.now() + delay, run }
    else run()
  }
  function commit(action: Action) {
    const state = round.value
    if (!state) return
    const previousWindow = state.window.kind
    const afterKong = state.origin === 'supplement'
    if (!stepRound(state, actor.value, action)) return
    stepStarted = Date.now()
    selectedIndex.value = -1
    if (action.kind === 'discard') reactionUntil = Date.now() + (afterKong ? LOCAL_TABLE_PACE.extendedReaction : LOCAL_TABLE_PACE.discardReaction)
    if (action.kind === 'peng' && actor.value === 0 && !autoplay.value) defer(PACE_MS.skipDrawPengDelay, () => {})
    if (action.kind === 'pass' && previousWindow === 'rob' && state.window.kind === 'rob') defer(PACE_MS.betweenRobKongs, () => {})
    if (state.event) replay.hooks.step?.(state.event, replayFrame(state, matchLength.value))
    effects.present(state)
    if (state.result) {
      replay.hooks.roundEnd(tableResult(state)!, replayFrame(state, matchLength.value))
      if (finished.value) replay.finish('finished')
    }
  }
  function execute(action: Action) {
    const state = round.value
    if (!state) return
    const claimsDiscard = state.window.kind === 'claim' && (action.kind === 'peng' || action.kind === 'kong')
    const robWin = state.window.kind === 'rob' && action.kind === 'win'
    defer(claimsDiscard ? reactionUntil - Date.now() : robWin ? PACE_MS.betweenRobKongs : 0, () => commit(action))
  }
  function play(action: Action) {
    if (playable.value && action.kind !== 'draw' && action.kind !== 'advance') execute(action)
  }
  // 换主题、离桌或切托管时取消旧定时器，避免上回合的动作落到新的牌局上。
  watch([round, () => round.value?.serial, dealStep, ready, paused, autoplay, pending], (_value, _old, cleanup) => {
    const state = round.value
    if (!state || !ready.value || paused.value || state.result) return
    let active = true
    cleanup(() => { active = false })
    const later = (delay: number, run: () => void) => {
      const timer = setTimeout(() => { if (active) run() }, Math.max(0, delay))
      cleanup(() => clearTimeout(timer))
    }
    const task = pending.value
    if (task) {
      later(task.at - Date.now(), () => { pending.value = null; task.run() })
      return
    }
    if (opening.value) {
      const step = dealStep.value
      const nextBatch = () => {
        dealStep.value++
        if (state.openingBatches[dealStep.value - 1]?.tiles.length === 4) audio.play('deal.mp3', .72)
        if (!opening.value) defer(OPENING_PACE_MS.firstTurn, () => {})
      }
      if (step <= 0) {
        if (openingCue?.step !== step) openingCue = { step, done: playOpeningCue(step < 0 ? 'start' : 'dice',
          { wait: effects.scheduler.wait, playSoundAndWait: audio.playAndWait }) }
        void openingCue.done.then(() => { if (active && round.value === state) nextBatch() })
      } else later(state.openingBatches[step - 1].tiles.length > 1 ? OPENING_PACE_MS.batch : OPENING_PACE_MS.single, nextBatch)
      return
    }
    const window = state.window
    const elapsed = Date.now() - stepStarted
    if (window.kind === 'draw') return later(Math.max(PACE_MS.afterDiscardToNextTurn - elapsed, reactionUntil - Date.now()), () => commit({ kind: 'draw' }))
    if (window.kind === 'check-rob') return later(LOCAL_TABLE_PACE.extendedReaction - elapsed, () => commit({ kind: 'advance' }))
    if (window.kind === 'supplement') {
      const delay = window.kong === 'exposed' ? PACE_MS.afterClaimGang : window.kong === 'added' ? PACE_MS.afterKongSettle : 0
      return later(delay - elapsed, () => commit({ kind: 'advance' }))
    }
    if (actor.value === 0 && !autoplay.value) return
    const delay = window.kind === 'rob' ? 0 : window.kind === 'claim' || window.kind === 'reveal' ? AI_DELAYS.claim
      : state.origin === 'supplement' ? LOCAL_TABLE_PACE.aiDiscardAfterKong : LOCAL_TABLE_PACE.aiDiscard
    let planned: Action | undefined
    const decide = () => planned ??= chooseAction(toRaw(state))
    // 摸到牌后本来就有一段展示时间。提前在空闲时算好弃牌，让飞牌起步时只提交动作。
    // 暂停、切托管、离桌或状态推进时，当前 watcher 的清理逻辑会取消旧计划。
    if (window.kind === 'turn' && delay > 0 && typeof globalThis.requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => { if (active) decide() }, { timeout: Math.floor(delay / 2) })
      cleanup(() => cancelIdleCallback(id))
    }
    later(delay, () => execute(decide()))
  })
  onScopeDispose(leave)
  return { settings, length, matchLength, round, ready, autoplay, selectedIndex, opening, openingStage, dealAnimation, phase,
    result: view.result, finished, actor, players, headDrawn, wall, controls, mayDiscard, waits, selectedWaits,
    actionCue: view.tableActionEvent, winEffect: view.winEffect, winPatterns: effects.winPatterns, winPresentation: effects.winPresentation, revealHands: view.revealHands,
    winningPlayerIndex: view.winningPlayerIndex, weather: effects.weather, start, next, leave, play }
}
