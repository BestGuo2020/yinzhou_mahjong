import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { GamePhase, OpeningStage } from '../../core/contracts/gamePort'
import type { TableActionEvent, TileType } from '../../core/contracts/types'
import { tileAudioFile, tileName } from '../../core/rules/tiles'
import type { ReplayRecording } from '../../replay/useReplayRecorder'
import { chooseAction } from './ai'
import { act, dealRound, decisionSeat, followingRound, legalActions, type Action, type Round } from './engine'
import { NAMES, replayFrame, tablePlayers, tableResult } from './presentation'
import { type Settings } from './rules'

export function useYingzhouGame(replay: ReplayRecording, paused: Ref<boolean>, sound: (file: string) => unknown) {
  const settings = ref<Settings>({ mode: 'live', smallBan: false })
  const length = ref<4 | 8 | 16>(4)
  const round = ref<Round | null>(null)
  const ready = ref(false)
  const autoplay = ref(false)
  const selectedIndex = ref(-1)
  const dealStep = ref(0)
  const opening = computed(() => !!round.value && dealStep.value <= 16)
  const openingStage = computed<OpeningStage | null>(() => opening.value ? (dealStep.value === 0 ? 'dice' : 'deal') : null)
  const result = computed(() => round.value ? tableResult(round.value) : null)
  const finished = computed(() => !!round.value?.result && round.value.validBefore + Number(round.value.result.winner !== null) >= length.value)
  const actor = computed(() => round.value ? decisionSeat(round.value) : -1)
  const playable = computed(() => ready.value && !opening.value && !paused.value && !autoplay.value && actor.value === 0)
  const options = computed(() => round.value && playable.value ? legalActions(round.value) : [])
  const controls = computed(() => options.value.filter(option => option.kind !== 'discard' && option.kind !== 'draw'))
  const mayDiscard = computed(() => playable.value && round.value?.window.kind === 'turn')
  const players = computed(() => {
    const state = round.value
    if (!state) return []
    const seats = tablePlayers(state)
    if (!opening.value) return seats
    seats.forEach((seat, i) => {
      const order = (state.dealer - i + 4) % 4
      const batches = Math.floor((Math.min(12, dealStep.value) + 3 - order) / 4)
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
    count: !opening.value || !dealStep.value ? 0 : dealStep.value <= 12 ? 4 : dealStep.value === 13 ? 2 : 1,
    serial: dealStep.value,
  }))
  const phase = computed<GamePhase>(() => {
    if (!round.value) return 'lobby'
    if (opening.value) return dealStep.value === 0 ? 'opening' : 'dealing'
    if (round.value.result) return 'settled'
    return round.value.window.kind === 'turn' ? 'discard' : round.value.window.kind === 'draw' ? 'drawing' : 'prompt'
  })
  const actionCue = ref<TableActionEvent | null>(null)
  let cueTimer: ReturnType<typeof setTimeout>
  const prompt = computed(() => {
    const state = round.value
    if (!state || opening.value || state.result) return ''
    const name = NAMES[actor.value]
    switch (state.window.kind) {
      case 'rob': return `${NAMES[state.turn]}补杠${tileName(state.window.tile)} · 等待${name}决定是否抢胡`
      case 'reveal': return `翻亮${tileName(state.indicator)} · ${name}可以报扎`
      case 'bloom': return `${name}可以${state.window.win.label}`
      case 'claim': return `${NAMES[state.turn]}打出${tileName(state.window.tile)} · 等待${name}应牌`
      case 'draw': return name + '摸牌'
      default: return name === '你' ? '轮到你出牌' : name + '出牌'
    }
  })
  function open(state: Round) {
    clearTimeout(cueTimer)
    actionCue.value = null
    ready.value = false
    selectedIndex.value = -1
    dealStep.value = 0
    round.value = state
    replay.hooks.roundStart(replayFrame(state, length.value))
    sound('dice.mp3')
  }
  function start() {
    if (!round.value) {
      autoplay.value = false
      open(dealRound(settings.value))
    }
  }
  function next() {
    if (round.value?.result && !finished.value) open(followingRound(round.value, settings.value))
  }
  function leave() {
    if (replay.active()) replay.finish(finished.value ? 'finished' : 'aborted')
    clearTimeout(cueTimer)
    round.value = null
    ready.value = false
    autoplay.value = false
  }
  function execute(action: Action) {
    const state = round.value
    if (!state || !act(state, actor.value, action)) return
    selectedIndex.value = -1
    const event = state.event!
    const frame = replayFrame(state, length.value)
    replay.hooks.step?.(event, frame)
    if (event.actionType) {
      clearTimeout(cueTimer)
      actionCue.value = { id: state.serial, type: event.actionType, label: state.result?.win?.label,
        actorIndex: event.seat, tile: event.tile!, sourceIndex: event.from ?? null, meldIndex: event.meldIndex ?? -1 }
      cueTimer = setTimeout(() => { actionCue.value = null }, 750)
      sound(event.t === 'win' ? 'zimo.mp3' : event.kind === 'peng' ? 'peng.mp3' : 'gang.mp3')
    } else if (event.t === 'discard') {
      const audio = tileAudioFile(event.tile!)
      if (audio) sound(audio)
    }
    if (state.result) {
      replay.hooks.roundEnd(tableResult(state)!, frame)
      if (finished.value) replay.finish('finished')
    }
  }
  function play(action: Action) {
    if (playable.value) execute(action)
  }
  // 换主题、离桌或切托管时取消旧定时器，避免上回合的动作落到新的牌局上。
  watch([round, () => round.value?.serial, dealStep, ready, paused, autoplay], (_value, _old, cleanup) => {
    const state = round.value
    if (!state || !ready.value || paused.value || state.result) return
    if (opening.value) {
      const timer = setTimeout(() => {
        if (dealStep.value === 0) sound('deal.mp3')
        dealStep.value++
      }, dealStep.value === 0 ? 1050 : 90)
      cleanup(() => clearTimeout(timer))
    } else if (actor.value !== 0 || autoplay.value || state.window.kind === 'draw') {
      const timer = setTimeout(() => execute(chooseAction(state)), state.window.kind === 'draw' ? 260 : 560)
      cleanup(() => clearTimeout(timer))
    }
  })
  onScopeDispose(leave)
  return { settings, length, round, ready, autoplay, selectedIndex, opening, openingStage, dealAnimation, phase,
    result, finished, actor, players, headDrawn, wall, controls, mayDiscard, prompt, actionCue, start, next, leave, play }
}
