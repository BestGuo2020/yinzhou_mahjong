import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { GamePhase, OpeningStage } from '../../core/contracts/gamePort'
import type { TileType } from '../../core/contracts/types'
import { tileName } from '../../core/rules/tiles'
import { AI_DELAYS } from '../../core/controllers/playerController'
import { LOCAL_TABLE_PACE, PACE_MS } from '../../core/local/localGameConfig'
import { OPENING_PACE_MS, playOpeningCue } from '../../shared/runtime/localOpening'
import type { ReplayRecording } from '../../replay/useReplayRecorder'
import { chooseAction } from './ai'
import { stepRound, dealRound, decisionSeat, followingRound, legalActions, type Action, type Round } from './engine'
import { NAMES, replayFrame, tableResult } from './presentation'
import { type Settings } from './rules'
import { useTablePresentation, type TableAudio } from './useTablePresentation'
import { handWaits } from './waits'

export function useYingzhouGame(replay: ReplayRecording, paused: Ref<boolean>, audio: TableAudio) {
  const settings = ref<Settings>({ mode: 'live', smallBan: false })
  const length = ref<4 | 8 | 16>(4)
  const round = ref<Round | null>(null)
  const ready = ref(false)
  const autoplay = ref(false)
  const selectedIndex = ref(-1)
  const dealStep = ref(-1) // -1 开场，0 双骰，1..16 各家拿牌
  const effects = useTablePresentation(audio, () => round.value)
  const { view } = effects
  const pending = shallowRef<{ at: number; run: () => void } | null>(null)
  let reactionUntil = 0
  let stepStarted = 0
  let openingCue: { step: number; done: Promise<void> } | null = null
  const opening = computed(() => !!round.value && dealStep.value <= 16)
  const openingStage = computed<OpeningStage | null>(() => opening.value
    ? dealStep.value < 0 ? 'start' : dealStep.value === 0 ? 'dice' : 'deal' : null)
  const finished = computed(() => !!round.value?.result && round.value.validBefore + Number(round.value.result.winner !== null) >= length.value)
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
    seats.forEach((seat, i) => {
      const order = (state.dealer - i + 4) % 4
      const batches = Math.floor((Math.min(12, Math.max(0, dealStep.value)) + 3 - order) / 4)
      const last = dealStep.value >= 13 + order ? (i === state.dealer ? 2 : 1) : 0
      seat.hand = state.openingHands[i].slice(0, batches * 4 + last)
      seat.drawnTileIndex = -1
    })
    return seats
  })
  const headDrawn = computed(() => opening.value ? players.value.reduce((n, p) => n + p.hand.length, 0) : round.value?.headDrawn ?? 0)
  const wall = computed(() => opening.value ? Array<TileType>(136 - headDrawn.value).fill('east') : round.value?.wall ?? [])
  const dealAnimation = computed(() => ({
    playerIndex: (round.value!.dealer - (dealStep.value - 1) % 4 + 4) % 4,
    count: !opening.value || dealStep.value < 1 ? 0 : dealStep.value <= 12 ? 4 : dealStep.value === 13 ? 2 : 1,
    serial: Math.max(0, dealStep.value),
  }))
  const phase = computed<GamePhase>(() => {
    if (!round.value) return 'lobby'
    if (opening.value) return dealStep.value <= 0 ? 'opening' : 'dealing'
    if (round.value.result) return view.phase.value
    if (round.value.window.kind === 'check-rob' || round.value.window.kind === 'supplement') return 'kong'
    return round.value.window.kind === 'turn' ? 'discard' : round.value.window.kind === 'draw' ? 'drawing' : 'prompt'
  })
  const prompt = computed(() => {
    const state = round.value
    if (!state || opening.value || state.result) return ''
    const name = NAMES[actor.value]
    switch (state.window.kind) {
      case 'check-rob': return NAMES[state.turn] + '申请补杠' + tileName(state.window.tile)
      case 'supplement': return NAMES[state.turn] + '杠后补牌'
      case 'rob': return `${NAMES[state.turn]}补杠${tileName(state.window.tile)} · 等待${name}决定是否抢胡`
      case 'reveal': return `翻亮${tileName(state.indicator)} · ${name}可以报扎`
      case 'bloom': return `${name}可以${state.window.win.label}`
      case 'claim': return `${NAMES[state.turn]}打出${tileName(state.window.tile)} · 等待${name}应牌`
      case 'draw': return name + '摸牌'
      default: return name === '你' ? '轮到你出牌' : name + '出牌'
    }
  })
  function open(state: Round) {
    effects.reset()
    pending.value = null
    reactionUntil = 0
    stepStarted = Date.now()
    openingCue = null
    ready.value = false
    selectedIndex.value = -1
    dealStep.value = -1
    round.value = state
    replay.hooks.roundStart(replayFrame(state, length.value))
  }
  function start() {
    if (!round.value) {
      autoplay.value = false
      open(dealRound(settings.value))
    }
  }
  function next() {
    if (view.result.value && round.value?.result && !finished.value) open(followingRound(round.value, settings.value))
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
    if (state.event) replay.hooks.step?.(state.event, replayFrame(state, length.value))
    effects.present(state)
    if (state.result) {
      replay.hooks.roundEnd(tableResult(state)!, replayFrame(state, length.value))
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
        if (dealStep.value >= 1 && dealStep.value <= 12) audio.play('deal.mp3', .72)
        if (!opening.value) defer(OPENING_PACE_MS.firstTurn, () => {})
      }
      if (step <= 0) {
        if (openingCue?.step !== step) openingCue = { step, done: playOpeningCue(step < 0 ? 'start' : 'dice',
          { wait: effects.scheduler.wait, playSoundAndWait: audio.playAndWait }) }
        void openingCue.done.then(() => { if (active && round.value === state) nextBatch() })
      } else later(step <= 13 ? OPENING_PACE_MS.batch : OPENING_PACE_MS.single, nextBatch)
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
    later(delay, () => execute(chooseAction(state)))
  })
  onScopeDispose(leave)
  return { settings, length, round, ready, autoplay, selectedIndex, opening, openingStage, dealAnimation, phase,
    result: view.result, finished, actor, players, headDrawn, wall, controls, mayDiscard, prompt, waits, selectedWaits,
    actionCue: view.tableActionEvent, winEffect: view.winEffect, winPresentation: view.winPresentation, revealHands: view.revealHands,
    winningPlayerIndex: view.winningPlayerIndex, weather: effects.weather, start, next, leave, play }
}
