import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  defineGamePort,
  type Announcement,
  type DealAnimation,
  type GamePhase,
  type GameStartOptions,
  type LastDiscard,
  type OpeningStage,
  type RoundResult,
  type WaitInfo,
  type WinEffect,
} from '../../core/contracts/gamePort'
import type {
  GamePlayer,
  MatchType,
  ScoreFlowEvent,
  TableActionEvent,
  TileType,
  WinPresentation,
} from '../../core/contracts/types'
import { defaultAvatarForSeat } from '../../core/presentation/avatar'
import { activeBgmTrackPort, DEFAULT_BGM_FILE } from '../../core/presentation/useAudio'
import { MATCH_FORMATS } from '../../core/rules/matchFormats'
import { READY_BGM_ASSET } from '../../core/presentation/audioAssets'
import {
  TABLE_ACTION_CUE_DURATION_MS,
  type TableDeclarationEvent,
} from '../../core/presentation/tableActionCue'
import {
  prefersReducedMotion,
  WIN_REVEAL_DURATION,
  REDUCED_WIN_REVEAL_DURATION,
  MULTI_WIN_INTRO_DURATION,
} from '../../core/presentation/winEffect'
import { tileName as sharedTileName } from '../../core/rules/tiles'
import { createLocalTransientEventPresenter } from '../../core/local/localTransientEventPresenter'
import { createPresentationScheduler } from '../../shared/runtime/presentationScheduler'
import { dealInitialHands, playOpeningCue } from '../../shared/runtime/localOpening'
import { playDiscardName } from '../../shared/runtime/discardAudio'
import {
  createSettlementTimeline,
  type SettlementEndOptions,
} from '../../shared/settlement/settlementTimeline'
import { useYaotongGame } from './useYaotongGame'
import { yaotongGuidance } from './guidance'
import { isUntouchedFirstDraw } from './hands'
import { offeredHuPlans } from './settlement'
import { recordYaotongRound } from './replay'
import { createYaotongRemoteRecorder } from './remote/replayRecorder'
import type { ReplayRecorderHooks } from '../../replay/types'
import { countsOf } from './tiles'
import { eventKongKind, kongSoundFile, kongWeatherKind, KONG_WEATHER_DURATION, REDUCED_KONG_WEATHER_DURATION, type KongWeatherCue } from './kongPresentation'
import {
  chickenMarks,
  chickenPerformance,
  CHICKEN_PERFORMANCE_MS,
  type ChickenPerformance,
} from './chickenPresentation'
import type { GameEvent, GameState, Wait } from './types'
import {
  chickenCue as makeChickenCue,
  settlementTitle,
  winningPattern,
  winPatternCue,
  settlementCue as makeSettlementCue,
  giftAwards,
  reportKillTotals,
  sidewaysDiscard,
  yaotongRoundLabel,
  type SettlementCue,
  type ChickenCue,
  type YaotongTableView,
} from './presentation'

import { fromSharedTile, toSharedTile } from './sharedTile'

export { fromSharedTile, toSharedTile }

export type YaotongGameSource = ReturnType<typeof useYaotongGame>

const READY_BGM_FADE_SECONDS = 0.35

/** Rules stay deterministic; the original opening, audio, cue and settlement timelines own presentation. */
export function useYaotongPort(
  options: {
    playSound?: (file: string, volume?: number) => unknown
    playSoundAndWait?: (file: string, volume?: number) => Promise<void>
    waitForTableReady?: () => Promise<void>
    canShowSettlement?: () => boolean
    getCharacterId?: () => string
    recorder?: ReplayRecorderHooks
  } = {},
  local: YaotongGameSource = useYaotongGame(),
) {
  const activeState = computed(() => local.state.value)
  let recordedState = activeState.value
  let stopRecording: (() => void) | undefined
  const recordRemote = options.recorder ? createYaotongRemoteRecorder(options.recorder, options.getCharacterId) : undefined
  watch(activeState, (state) => {
    if (state === recordedState) return
    stopRecording?.()
    recordedState = state
    if (local.remote) {
      recordRemote?.(state)
      stopRecording = undefined
      return
    }
    stopRecording = state && options.recorder
      ? recordYaotongRound(state, options.recorder, options.getCharacterId?.()) : undefined
  }, { flush: 'sync' })
  onScopeDispose(() => stopRecording?.())
  const length = ref<4 | 8 | 16>(4)
  const openingStage = ref<OpeningStage | null>(null)
  const openingActive = ref(false)
  const dealCounts = ref([0, 0, 0, 0])
  const dealAnimation = ref<DealAnimation>({ playerIndex: -1, count: 0, serial: 0 })
  const declarationArmed = ref(false)
  const winPlans = computed(() => local.state.value && !local.paused.value && !local.autoplay.value && !local.protection.value.hu
    ? offeredHuPlans(local.state.value, 0) : [])
  function confirmHuPlan(plan: string) {
    if (!winPlans.value.some(option => option.key === plan)) return
    if (local.mode.value === 'hard') local.declareHu(plan)
    else local.dispatch(local.response.value ? { type: 'respond', action: 'hu', plan } : { type: 'hu', plan })
  }
  const announcement = shallowRef<Announcement | null>(null)
  const tableActionEvent = shallowRef<TableActionEvent | null>(null)
  const lastDiscard = shallowRef<LastDiscard | null>(null)
  const lastDiscardSound = shallowRef<Promise<void> | null>(null)
  const scoreFlowEvent = shallowRef<ScoreFlowEvent | null>(null)
  const winEffect = shallowRef<WinEffect | null>(null)
  const winPresentation = shallowRef<WinPresentation | null>(null)
  const result = shallowRef<RoundResult | null>(null)
  const revealHands = ref(false)
  const scoresReleased = ref(false)
  const winningDiscardMoved = ref(false)
  const presentationPhase = ref<GamePhase | null>(null)
  const tailDrawn = ref(0)
  const seatCue = shallowRef<ChickenCue | null>(null)
  const chickenPerformances = shallowRef<ChickenPerformance[]>([])
  const kongWeather = shallowRef<KongWeatherCue[]>([])
  const pendingChickens = shallowRef<ChickenPerformance[]>([])
  const declarationCues = shallowRef<TableDeclarationEvent[]>([])
  const settlementCue = shallowRef<SettlementCue | null>(null)
  const multiWinIntro = shallowRef<YaotongTableView['multiWinIntro']>(null)
  const gifts = computed(() => giftAwards(local.state.value?.result?.transfers ?? []))
  const reportKills = computed(() => reportKillTotals(local.state.value?.result?.transfers ?? []))
  const winDeclared = ref(false)
  let lastDeclarationSound = -Infinity
  function visibleChickenMarks(seat: number) {
    const state = local.state.value!,
      marks = chickenMarks(state, seat)
    const landing = [...pendingChickens.value, ...chickenPerformances.value].filter(
      (c) => c.markSeat === seat,
    )
    return {
      rushCount: Math.max(
        0,
        marks.rushCount -
          landing.filter((c) => c.kind === 'rush' && state.players[seat].river.some((d) => d.id === c.id))
            .length,
      ),
      responsibilityCount: Math.max(
        0,
        marks.responsibilityCount - landing.filter((c) => c.kind === 'responsibility').length,
      ),
    }
  }
  const tableView = computed<YaotongTableView>(() => ({
    manualHuControls: local.hardControls.value,
    holding: local.holding.value,
    confirmHuPlan: winPlans.value.length > 1,
    sidewaysDiscards: local.state.value?.players.map(p => p.river.flatMap((d, index) => sidewaysDiscard(d) ? [index] : [])),
    kongWeather: kongWeather.value,
    multiWinIntro: multiWinIntro.value,
    winPatterns: winPatternCue(local.state.value?.result, winEffect.value),
    settlementIndicator:
      revealHands.value && local.state.value?.result?.indicator != null
        ? {
            id: local.state.value.handNumber,
            seat: local.state.value.result.winners[0],
            tile: toSharedTile(local.state.value.result.indicator),
          }
        : null,
    seats:
      local.state.value?.players.map((player, seat) => ({
        ...visibleChickenMarks(seat),
        declaration: player.declaration,
        burned: player.burned && revealHands.value,
        winner: winDeclared.value && Boolean(local.state.value?.result?.winners.includes(seat)),
        winPattern: winDeclared.value ? winningPattern(local.state.value?.result?.values[seat]) : undefined,
        killed: revealHands.value && reportKills.value.some((kill) => kill.seat === seat && kill.paid > 0),
        killedAmount: revealHands.value
          ? reportKills.value.find((kill) => kill.seat === seat)?.paid
          : undefined,
        gift: revealHands.value && gifts.value.some((gift) => gift.seat === seat),
        giftAmount: revealHands.value ? gifts.value.find((gift) => gift.seat === seat)?.amount : undefined,
      })) ?? [],
    chickenCue: seatCue.value,
    chickenPerformances: chickenPerformances.value,
    declarationCues: declarationCues.value,
    settlementCue: settlementCue.value,
  }))
  let generation = 0,
    settlementGeneration = 0,
    seenSerial = 0,
    seenHand = 0,
    eventSequence = 0
  const declaredKongs = new Set<string>()
  let remoteHandKey = ''
  const playSound = (name: string, volume?: number) => options.playSound?.(name, volume)
  const playSoundAndWait =
    options.playSoundAndWait ??
    (async (name: string, volume?: number) => {
      playSound(name, volume)
    })
  const scheduler = createPresentationScheduler({
    controllers: [],
    stopCountdown() {},
    cancelOpening() {
      generation++
    },
  })
  const transient = createLocalTransientEventPresenter({
    state: { announcement, tableActionEvent, scoreFlowEvent },
    later: scheduler.later,
  })
  const phase = computed<GamePhase>({
    get() {
      if (!local.state.value) return 'lobby'
      if (presentationPhase.value) return presentationPhase.value
      if (openingActive.value) return 'dealing'
      if (local.state.value.phase === 'transition') {
        return local.flowStep.value === 'next-draw'
          ? 'checking'
          : local.flowStep.value === 'after-peng'
            ? 'thinking'
            : local.flowStep.value === 'first-draw'
              ? 'opening'
              : 'kong'
      }
      return local.state.value.phase === 'response'
        ? 'prompt'
        : local.state.value.phase === 'original'
          ? 'checking'
          : local.state.value.phase === 'settled'
            ? 'settled'
            : 'discard'
    },
    set(value) {
      presentationPhase.value = value
    },
  })
  const players = computed<GamePlayer[]>(
    () =>
      local.state.value?.players.map((p, seat) => {
        const state = local.state.value!,
          outcome = state.result
        const claimWin = outcome?.kind === 'win' && outcome.winKind !== 'self'
        let hand = openingActive.value ? p.hand.slice(0, dealCounts.value[seat]) : p.hand
        if (claimWin && outcome.winners[0] === seat) hand = hand.slice(0, -1)
        const pendingKong =
          state.pending?.kind === 'rob' &&
          state.pending.from === seat &&
          (p.hand.includes(state.pending.tile) || (local.remote && p.concealedTileCount != null)) &&
          !outcome
        if (pendingKong) {
          hand = [...hand]
          hand.splice(hand.indexOf(state.pending!.tile), 1)
        }
        return {
          name: p.name,
          avatar: p.avatar || defaultAvatarForSeat(seat),
          seat,
          concealedTileCount: openingActive.value ? dealCounts.value[seat]
            : p.concealedTileCount == null ? hand.length : p.concealedTileCount - (pendingKong ? 1 : 0),
          // Engine settlement is atomic. Display transfers only when the shared reveal stage finishes.
          score: p.score - (outcome && !scoresReleased.value ? outcome.deltas[seat] : 0),
          redCount: 0,
          playerKind: p.playerKind ?? (seat === 0 ? 'human' : 'bot'),
          characterId: p.characterId ?? (seat === 0 ? options.getCharacterId?.() : undefined),
          hand: hand.map(toSharedTile),
          drawnTileIndex: openingActive.value || pendingKong ? -1 : p.drawn !== null ? hand.length - 1
            : local.remote && (p.concealedTileCount ?? 0) > 13 - p.melds.length * 3 ? p.concealedTileCount! - 1 : -1,
          discards: [
            ...p.river.map((d) => toSharedTile(d.tile)),
            ...(claimWin && outcome.source === seat && outcome.winKind !== 'rob' && !winningDiscardMoved.value
              ? [toSharedTile(outcome.tile!)]
              : []),
          ],
          melds: p.melds.map((m) => {
            const pending = pendingKong && m.kind === 'peng' && m.tile === state.pending!.tile
            return {
              tile: toSharedTile(m.tile),
              type: pending
                ? 'gang'
                : m.kind === 'peng'
                  ? 'peng'
                  : m.kind === 'stored' || m.kind === 'turn'
                    ? 'angang'
                    : 'gang',
              tiles: Array(pending || m.kind !== 'peng' ? 4 : 3).fill(toSharedTile(m.tile)),
              from: m.from,
              added: m.kind === 'added' || pending,
              pending: Boolean(pending),
            }
          }),
        }
      }) ?? [],
  )
  const visibleCount = computed(() => dealCounts.value.reduce((sum, n) => sum + n, 0))
  const wall = computed(() => {
    const state = local.state.value
    if (!state) return []
    if (openingActive.value)
      return [...state.players.flatMap((p) => Array.from(
        { length: p.concealedTileCount ?? p.hand.length }, (_, index) => p.hand[index] ?? 0,
      )), ...state.wall]
        .slice(visibleCount.value)
        .map(toSharedTile)
    const indicator = state.result?.indicator
    return [...(!revealHands.value && indicator != null ? [indicator] : []), ...state.wall].map(
      toSharedTile,
    )
  })
  const wallHeadDrawn = computed(() =>
    openingActive.value
      ? visibleCount.value
      : local.state.value
        ? 108 - wall.value.length - tailDrawn.value
        : 0,
  )
  const publicCounts = computed(() =>
    countsOf(
      local.state.value
        ? [
            ...local.state.value.players[0].hand,
            ...local.state.value.players.flatMap((p) => [
              ...p.river.map((d) => d.tile),
              ...p.melds.flatMap((m) => Array(m.kind === 'peng' ? 3 : 4).fill(m.tile)),
            ]),
          ]
        : [],
    ),
  )
  function waitInfo(waits: Wait[], discard: TileType | null = null): WaitInfo | null {
    if (!waits.length) return null
    const tiles = waits.map((w) => ({
      tile: toSharedTile(w.tile),
      remaining: Math.max(0, 4 - publicCounts.value[w.tile]),
    }))
    return { discard, tiles, any: tiles.length === 27, remaining: tiles.reduce((n, t) => n + t.remaining, 0) }
  }
  const original = computed(
    () =>
      !openingActive.value &&
      local.state.value?.phase === 'original' &&
      !local.state.value.originalDecisions[0],
  )
  const standings = computed(() =>
    players.value
      .map((p, playerIndex) => ({ ...p, playerIndex, rank: 0 }))
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...p, rank: i + 1 })),
  )
  const matchName = computed(
    () => MATCH_FORMATS[local.state.value?.matchLength ?? length.value].name,
  )
  const roundLabel = computed(() =>
    local.state.value ? yaotongRoundLabel(local.state.value.dealerRound) : '',
  )
  const currentPlayer = computed({
    get: () => (presentationPhase.value ? -1 : (local.state.value?.current ?? 0)),
    set(_value: number) {},
  })
  const winningPlayerIndex = ref(-1)
  const honba = computed(() => local.state.value?.repeats ?? 0)
  watch(
    () => local.state.value?.players.some((player) => player.declaration !== 'none') ?? false,
    (hasDeclaration) => {
      const bgm = activeBgmTrackPort()
      if (hasDeclaration) bgm?.fadeTo(READY_BGM_ASSET, READY_BGM_FADE_SECONDS)
      else bgm?.fadeTo(DEFAULT_BGM_FILE)
    },
  )
  watch(
    revealHands,
    (revealed) => {
      if (!revealed) return
      playSound('tuidao.wav', 0.55)
      const cue = makeSettlementCue(local.state.value, ++eventSequence)
      settlementCue.value = cue
      if (cue)
        scheduler.later(
          () => {
            if (settlementCue.value?.id === cue.id) settlementCue.value = null
          },
          prefersReducedMotion() ? REDUCED_WIN_REVEAL_DURATION : WIN_REVEAL_DURATION,
        )
    },
    { flush: 'sync' },
  )
  // Reduced motion shortens the action lead-in; retire it before the pattern lettering appears.
  watch(winEffect, (effect) => { if (effect) tableActionEvent.value = null }, { flush: 'sync' })

  function finalizeResult(): RoundResult {
    const state = local.state.value!,
      r = state.result!,
      winner = r.winners[0] ?? -1
    scoresReleased.value = true
    return {
      draw: r.kind !== 'win',
      winnerIndex: winner,
      winner: state.players[winner]?.name,
      winType: r.winKind === 'self' ? 'self-draw' : r.winKind === 'rob' ? 'robbed-kong' : 'discard',
      robbedKong: r.winKind === 'rob',
      winTile: r.tile === undefined ? undefined : toSharedTile(r.tile),
      points: r.values[winner]?.h ?? 0,
      totalWon: r.deltas[winner] ?? 0,
      multiplier: state.dice[0] === state.dice[1] ? 2 : 1,
      tenpai: r.ready.flatMap((ready, i) => (ready ? [i] : [])),
      details: r.values[winner]?.patterns.map((p) => ({ label: p.name, points: p.points })),
    }
  }
  function createTimeline() {
    const token = settlementGeneration
    return createSettlementTimeline<SettlementEndOptions>({
      state: {
        phase,
        get players() {
          return players.value
        },
        wall,
        wallHeadDrawn,
        currentPlayer,
        userDrewThisTurn: ref(false),
        actionPrompt: ref(null),
        pendingKong: ref(null),
        announcement,
        openingStage,
        scoreFlowEvent,
        tableActionEvent,
        lastDiscardSound,
        result,
        winEffect,
        winPresentation,
        revealHands,
        winningPlayerIndex,
        honba,
      },
      clearTimers: scheduler.clear,
      later(callback, delay) {
        if (token !== settlementGeneration) return 0
        return scheduler.later(() => {
          if (token === settlementGeneration) callback()
        }, delay)
      },
      playSound,
      playSoundAndWait,
      shouldPlayWinVoice: ({ winner }) => winner.playerKind !== 'llm',
      showWinIntro() {
        const outcome = local.state.value?.result
        if (!outcome || outcome.winners.length < 2 || outcome.source === null) return 0
        multiWinIntro.value = { id: ++eventSequence, sourceIndex: outcome.source }
        return MULTI_WIN_INTRO_DURATION
      },
      showTableAction(...args) {
        multiWinIntro.value = null
        winDeclared.value = true
        transient.showTableAction(...args)
      },
      getRoundLabel: () => roundLabel.value,
      getSourceIndex: ({ winnerIndex, endOptions }) =>
        endOptions.selfDraw ? local.state.value!.players[winnerIndex].hand.length - 1 : -1,
      getTableAction: ({ endOptions }) => ({
        type: endOptions.robbedKong ? 'robbed-kong-win' : endOptions.selfDraw ? 'self-draw' : 'discard-win',
        sourceIndex: endOptions.sourceFrom ?? endOptions.robbedKongPlayerIndex ?? null,
      }),
      settleWinningDiscard() {
        winningDiscardMoved.value = true
        lastDiscard.value = null
      },
      takeRobbedKongTile(seat, tile) {
        return local.state.value!.players[seat!].melds.findIndex((m) => toSharedTile(m.tile) === tile)
      },
      finalizeWin: finalizeResult,
      endDraw: finalizeResult,
    })
  }
  function isCurrentHand(game: GameState | null) {
    const current = local.state.value
    return current === game || Boolean(local.remote && game && current
      && current.remoteMatchId === game.remoteMatchId && current.handNumber === game.handNumber)
  }
  function present(event: GameEvent) {
    const game = local.state.value!
    const llmSeat = game.players[event.seat]?.playerKind === 'llm'
    if (event.kind === 'draw') {
      if (event.text === '杠后补摸') tailDrawn.value++
      playSound('give.mp3', 0.7)
      return
    }
    if (event.kind === 'hu') return // Shared settlement timeline owns the voice, cue, effect and reveal sequence.
    if (event.kind === 'discard') {
      lastDiscard.value = { tile: toSharedTile(event.tile!), from: event.seat, id: ++eventSequence }
      playSound('dapai.mp3', 0.8)
      lastDiscardSound.value = llmSeat ? null : playDiscardName(toSharedTile(event.tile!), {
        playSound,
        playSoundAndWait,
        current: () => isCurrentHand(game),
      })
    }
    if (event.kind === 'peng' || (event.kind === 'kong' && eventKongKind(event) === 'open')) {
      lastDiscard.value = null
      seatCue.value = null
      chickenPerformances.value = chickenPerformances.value.filter(
        (c) => c.kind !== 'rush' || local.state.value!.players[c.actorSeat].river.some((d) => d.id === c.id),
      )
    }
    if (event.kind === 'ready') {
      const cue: TableDeclarationEvent = {
        id: ++eventSequence,
        actorIndex: event.seat,
        type: local.state.value!.players[event.seat].declaration === 'original' ? 'original-ready' : 'ready',
      }
      declarationCues.value = [...declarationCues.value.filter((item) => item.actorIndex !== event.seat), cue]
      scheduler.later(() => {
        declarationCues.value = declarationCues.value.filter((item) => item.id !== cue.id)
      }, TABLE_ACTION_CUE_DURATION_MS)
      if (!llmSeat && Date.now() - lastDeclarationSound > 100) {
        lastDeclarationSound = Date.now()
        playSound('ting.wav', 0.7)
      }
    }
    if (event.kind === 'penalty') playSound('didu.ogg')
    const cue = makeChickenCue(event, game)
    if (cue) {
      seatCue.value = cue
      scheduler.later(() => {
        if (seatCue.value === cue) seatCue.value = null
      }, 1050)
    }
    const performance = chickenPerformance(event, game)
    const token = generation
    if (performance) pendingChickens.value = [...pendingChickens.value, performance]
    const showChicken = () => {
      if (!performance || generation !== token || !isCurrentHand(game)) return
      pendingChickens.value = pendingChickens.value.filter((c) => c.id !== performance.id)
      const current = local.state.value
      if (current?.result) return
      if (performance.kind === 'rush' && !current?.players[event.seat].river.some((d) => d.id === event.id))
        return
      chickenPerformances.value = [
        ...chickenPerformances.value.filter((c) => c.actorSeat !== performance.actorSeat),
        performance,
      ].slice(-4)
      // 冲鸡音效随牌桌事件播放，独立于座位报牌语音。
      if (performance.kind === 'rush') playSound('chongfengji.wav', 0.3)
      else if (performance.kind === 'responsibility' && !llmSeat) playSound('zerenji.wav', 0.3)
      scheduler.later(
        () => {
          chickenPerformances.value = chickenPerformances.value.filter((c) => c.id !== performance.id)
        },
        prefersReducedMotion() ? 500 : CHICKEN_PERFORMANCE_MS,
      )
    }
    if (performance?.kind === 'rush') void (lastDiscardSound.value ?? Promise.resolve()).then(showChicken, showChicken)
    const weatherKind = kongWeatherKind(event)
    if (weatherKind && !game?.result) {
      const reducedMotion = prefersReducedMotion()
      const weather: KongWeatherCue = {
        id: ++eventSequence, seat: event.seat, kind: weatherKind, startedAt: globalThis.performance.now(),
        duration: reducedMotion ? REDUCED_KONG_WEATHER_DURATION : KONG_WEATHER_DURATION, reducedMotion,
      }
      kongWeather.value = [...kongWeather.value.filter(c => c.seat !== event.seat), weather]
      playSound(weatherKind === 'rain' ? 'angang_rainy.wav' : 'mingang_windy.wav', 0.28)
      scheduler.later(() => {
        kongWeather.value = kongWeather.value.filter(c => c.id !== weather.id)
      }, weather.duration)
    }
    const kongKey = `${event.seat}/${event.tile}`
    const kongKind = eventKongKind(event)
    if (event.kind === 'kong-intent') declaredKongs.add(kongKey)
    if (event.kind === 'kong' && kongKind === 'added' && declaredKongs.delete(kongKey)) return
    const type: TableActionEvent['type'] | null =
      event.kind === 'peng'
        ? 'peng'
        : event.kind === 'kong-intent'
          ? 'added-gang'
          : event.kind === 'kong'
            ? kongKind === 'added'
              ? 'added-gang'
              : kongKind === 'open'
                ? 'discard-gang'
                : 'concealed-gang'
            : null
    if (type) {
      transient.showTableAction(
        type,
        event.seat,
        local.state.value!.players[event.seat].melds.at(-1)?.from ?? null,
        toSharedTile(event.tile!),
        Math.max(0, local.state.value!.players[event.seat].melds.length - 1),
        kongKind === 'added' ? '补杠'
          : kongKind === 'turn' || kongKind === 'stored' ? '暗杠' : undefined,
      )
      if (llmSeat) {
        showChicken()
        return
      }
      // 动作字与报牌区分杠、暗杠、补杠，动画仍按原杠型区分。
      const actionSound = event.kind === 'peng' ? 'peng.mp3' : kongSoundFile(event)
      if (performance?.kind === 'responsibility' || performance?.kind === 'peng') {
        // Keep the original action voice first; the short chicken cue follows its actual completion.
        void playSoundAndWait(actionSound).then(showChicken, showChicken)
      } else playSound(actionSound)
    }
  }
  function handleState(state: GameState) {
    if (!state) return
    if (local.remote) {
      const key = `${state.remoteMatchId ?? ''}:${state.handNumber}`
      if (remoteHandKey !== key) {
        remoteHandKey = key
        resetPresentation()
        openingActive.value = false
        seenHand = 0
        seenSerial = 0
      }
    }
    if (seenHand !== state.handNumber) {
        seenHand = state.handNumber
        seenSerial = 0
        tailDrawn.value = 0
      }
      for (const event of state.events.filter((e) => e.id > seenSerial)) present(event)
      seenSerial = state.serial
      if (!state.result || result.value || presentationPhase.value) return
      local.showingSettlement.value = true
      kongWeather.value = []
      announcement.value = null
      seatCue.value = null
      chickenPerformances.value = []
      pendingChickens.value = []
      declarationCues.value = []
      const r = state.result
      // The headless rules have finished; the display has not. Enter the shared timeline from a live phase.
      presentationPhase.value = 'checking'
      const timeline = createTimeline()
      if (r.kind === 'win')
        timeline.endGame(r.winners[0], {
          winTile: toSharedTile(r.tile!),
          selfDraw: r.winKind === 'self',
          robbedKong: r.winKind === 'rob',
          robbedKongPlayerIndex: r.winKind === 'rob' ? r.source! : undefined,
          sourceFrom: r.winKind === 'discard' || r.winKind === 'hot' ? r.source! : undefined,
        })
      else timeline.endDraw()
  }
  let stopStateWatch: (() => void) | undefined
  watch(
    () => local.state,
    (stateRef) => {
      stopStateWatch?.()
      stopStateWatch = watch(
        stateRef,
        (state) => { if (state) handleState(state) },
        { flush: 'sync', immediate: true },
      )
    },
    { flush: 'sync', immediate: true },
  )
  onScopeDispose(() => stopStateWatch?.())

  function resetPresentation() {
    local.showingSettlement.value = false
    kongWeather.value = []
    settlementGeneration++
    scheduler.clear()
    openingStage.value = null
    presentationPhase.value = null
    openingActive.value = true
    result.value = null
    winEffect.value = null
    winPresentation.value = null
    revealHands.value = false
    scoresReleased.value = false
    winningDiscardMoved.value = false
    winningPlayerIndex.value = -1
    winDeclared.value = false
    tableActionEvent.value = null
    scoreFlowEvent.value = null
    lastDiscard.value = null
    lastDiscardSound.value = null
    announcement.value = null
    declarationArmed.value = false
    dealCounts.value = [0, 0, 0, 0]
    declaredKongs.clear()
    seatCue.value = null
    chickenPerformances.value = []
    pendingChickens.value = []
    declarationCues.value = []
    lastDeclarationSound = -Infinity
    settlementCue.value = null
    multiWinIntro.value = null
  }
  async function opening(startOptions?: GameStartOptions) {
    local.paused.value = true
    const token = generation
    await (startOptions?.waitForTableReady ?? options.waitForTableReady)?.()
    if (token !== generation) return
    openingStage.value = 'start'
    await playOpeningCue('start', { wait: scheduler.wait, playSoundAndWait })
    if (token !== generation) return
    openingStage.value = 'dice'
    await playOpeningCue('dice', { wait: scheduler.wait, playSoundAndWait })
    if (token !== generation) return
    const state = local.state.value!
    const dealQueue: TileType[] = []
    for (let batch = 0; batch < 4; batch++)
      for (let offset = 0; offset < 4; offset++) {
        const player = state.players[(state.dealer + offset) % 4]
        const hand = Array.from({ length: player.concealedTileCount ?? player.hand.length }, (_, index) => player.hand[index] ?? 0)
        dealQueue.push(
          ...(batch === 3 ? hand.slice(12) : hand.slice(batch * 4, batch * 4 + 4)).map(toSharedTile),
        )
      }
    const dealtPlayers = players.value.map((p) => ({ ...p, hand: [] as TileType[] }))
    const dealt = await dealInitialHands({
      state: {
        players: dealtPlayers,
        dealer: ref(state.dealer),
        openingStage,
        dealAnimation: {
          get value() {
            return dealAnimation.value
          },
          set value(value) {
            dealAnimation.value = { ...value, serial: ++eventSequence }
            dealCounts.value = dealtPlayers.map((p) => p.hand.length)
          },
        },
      },
      takeTile: () => dealQueue.shift() ?? null,
      wait: scheduler.wait,
      playSound,
      isCancelled: () => token !== generation,
      sortHand: (hand) => hand,
      dealerJump: false,
    })
    if (!dealt || token !== generation) return
    openingStage.value = null
    dealAnimation.value = { playerIndex: -1, count: 0, serial: ++eventSequence }
    await (startOptions?.waitForOpeningReady ?? options.waitForTableReady)?.()
    if (token !== generation) return
    openingActive.value = false
    transient.announce(`${roundLabel.value} · 开牌`)
    local.paused.value = false
  }
  const risk = computed(() =>
    local.mode.value === 'easy'
      ? local.protection.value.pass || local.protection.value.hu || local.protection.value.peng ||
        (local.protection.value.discards.length ? '本巡已碰鸡，系统已禁用同种鸡牌出牌' : '')
      : local.response.value?.mandatory || local.self.value?.mandatory
      ? '本次必须胡牌，选择其他操作将包牌'
      : local.response.value?.restrictedHu || local.self.value?.restrictedHu
        ? '过手胡尚未解除，选择胡将包牌'
        : local.response.value?.restrictedPeng
          ? '本巡已打同种鸡，再碰将包牌'
          : local.ownTurn.value && local.user.value?.chickenPeng.length
            ? '本巡已碰鸡，不可再打同种鸡'
            : '',
  )
  const port = defineGamePort({
    phase,
    get players() {
      return players.value
    },
    wall,
    wallHeadDrawn,
    wallCount: computed(() => wall.value.length),
    currentPlayer,
    selectedIndex: computed({ get: () => local.selected.value, set: value => { local.selected.value = value } }),
    turnSeconds: computed(() => local.decisionSeconds.value),
    lastDiscard,
    actionPrompt: computed(() =>
      local.response.value && !local.autoplay.value
        ? {
            type: 'claim',
            tile: toSharedTile(local.state.value!.pending!.tile),
            from: local.state.value!.pending!.from,
            canHu: local.response.value.hu && !local.protection.value.hu,
            canPeng: local.response.value.peng && !local.protection.value.peng && !local.holding.value,
            canGang: local.response.value.kong && !local.protection.value.kong && !local.holding.value,
          }
        : null,
    ),
    announcement,
    tableActionEvent,
    scoreFlowEvent,
    result: computed(() => options.canShowSettlement?.() === false ? null : result.value),
    winEffect,
    winPresentation,
    revealHands,
    winningPlayerIndex,
    round: computed(() => local.state.value?.dealerRound ?? 1),
    dealer: computed(() => local.state.value?.dealer ?? 0),
    user: computed(() => players.value[0]),
    isUserTurn: computed(() => local.ownTurn.value && !local.autoDiscard.value && !local.paused.value && !local.autoplay.value && !local.holding.value),
    userCanHu: computed(() => Boolean(local.self.value?.hu && !local.protection.value.hu && !local.paused.value && !local.autoplay.value)),
    matchType: computed<MatchType>(() => (length.value === 4 ? 'east' : 'hanchan')),
    matchName,
    matchFinished: computed(() => Boolean(result.value && local.state.value?.result?.finished)),
    honba,
    roundLabel,
    standings,
    dealAnimation,
    openingStage,
    diceValues: computed(() => local.state.value?.dice ?? [1, 1]),
    diceThrowerIndex: computed(() => local.state.value?.dealer ?? 0),
    userCurrentWaits: computed(() => waitInfo(local.waiting.value)),
    userTingOptions: computed(() =>
      local.discardOptions.value.map(
        (w) => waitInfo(w.waits, toSharedTile(local.user.value!.hand[w.index]))!,
      ),
    ),
    userDiscardWaits: computed(() =>
      waitInfo(
        local.selectedWaits.value,
        local.selected.value < 0 ? null : toSharedTile(local.user.value!.hand[local.selected.value]),
      ),
    ),
    userKongs: computed(() => local.protection.value.kong || local.holding.value ? [] : local.kongs.value.map(toSharedTile)),
    capabilities: computed(() => ({})),
    startGame(_mode?: MatchType, startOptions?: GameStartOptions) {
      // 联机对局由房间快照驱动；开局演出复用同一套 opening 时间线。
      if (local.remote) {
        if (startOptions?.skipOpening || local.state.value?.result) {
          // 状态 watcher 已按场次/小局初始化。重连不得取消正在播放的结算。
          return Promise.resolve()
        }
        resetPresentation()
        return opening(startOptions)
      }
      resetPresentation()
      seenHand = 0
      seenSerial = 0
      local.begin(length.value, {
        wall: startOptions?.initialWall?.map(fromSharedTile),
        dice: startOptions?.openingDice,
        dealer: startOptions?.dealer,
      })
      return opening(startOptions)
    },
    selectTile(index: number) {
      local.selected.value = index
    },
    clearUserSelection() {
      local.selected.value = -1
    },
    userDiscard(index = local.selected.value) {
      if (declarationArmed.value && !local.discardOptions.value.some((o) => o.index === index)) {
        transient.announce('请打出带听牌提示的牌，再声明报听')
        return
      }
      local.dispatch({ type: 'discard', index, declare: declarationArmed.value })
      declarationArmed.value = false
    },
    userPass() {
      local.dispatch({ type: 'respond', action: 'pass' })
    },
    userPeng() {
      local.dispatch({ type: 'respond', action: 'peng' })
    },
    userGangFromDiscard() {
      local.dispatch({ type: 'respond', action: 'kong' })
    },
    userGang(tile?: TileType) {
      const target = tile ? fromSharedTile(tile) : local.kongs.value[0]
      if (target !== undefined) local.dispatch({ type: 'kong', tile: target })
    },
    userHu() {
      if (local.mode.value === 'hard') local.declareHu()
      else local.dispatch(local.response.value ? { type: 'respond', action: 'hu' } : { type: 'hu' })
    },
    nextRound() {
      if (!result.value || local.state.value?.result?.finished) return
      if (local.remote) {
        // 确认不代表所有人都已确认；保持本局展示，等新小局快照再清理。
        local.next()
        return
      }
      resetPresentation()
      local.next()
      return opening()
    },
    returnToLobby() {
      remoteHandKey = ''
      kongWeather.value = []
      settlementGeneration++
      scheduler.clear()
      announcement.value = null
      declarationCues.value = []
      seatCue.value = null
      chickenPerformances.value = []
      pendingChickens.value = []
      settlementCue.value = null
      multiWinIntro.value = null
      openingActive.value = false
      openingStage.value = null
      result.value = null
      local.leave()
      winEffect.value = null
      winPresentation.value = null
      presentationPhase.value = null
    },
    tileName: sharedTileName,
  })
  onScopeDispose(() => {
    kongWeather.value = []
    settlementGeneration++
    scheduler.clear()
  })
  const canArmDeclaration = computed(() =>
    local.ownTurn.value && !local.protection.value.pass &&
    Boolean(local.user.value && isUntouchedFirstDraw(local.user.value)) &&
    local.user.value.declaration === 'none' && local.discardOptions.value.length > 0,
  )
  const guidance = computed(() => {
    const state = local.state.value
    if (local.mode.value !== 'easy' || local.autoplay.value || openingActive.value ||
      !state || state.phase === 'settled' || state.phase === 'transition') return []
    return yaotongGuidance(state, local.protection.value, {
      original: original.value && local.waiting.value.length > 0,
      canDeclare: canArmDeclaration.value,
      declarationArmed: declarationArmed.value,
    })
  })
  return Object.assign(port, {
    local,
    length,
    original,
    risk,
    guidance,
    tableView,
    resultTitle: computed(() => settlementTitle(local.state.value?.result ?? null)),
    declarationArmed,
    openingActive,
    canArmDeclaration,
    winPlans, confirmHuPlan,
  })
}
