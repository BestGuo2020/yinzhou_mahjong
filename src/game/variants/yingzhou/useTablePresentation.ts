import { ref, watch } from 'vue'
import { createLocalGameState } from '../../core/local/localGameState'
import { createLocalTransientEventPresenter } from '../../core/local/localTransientEventPresenter'
import { LOCAL_TABLE_PACE } from '../../core/local/localGameConfig'
import { windRoundLabel } from '../../core/rules/matchFormats'
import { prefersReducedMotion } from '../../core/presentation/winEffect'
import { createPresentationScheduler } from '../../shared/runtime/presentationScheduler'
import { playDiscardName } from '../../shared/runtime/discardAudio'
import { createSettlementTimeline } from '../../shared/settlement/settlementTimeline'
import {
  ADDED_KONG_SOUND, CONCEALED_KONG_SOUND, DEFAULT_KONG_SOUND,
  KONG_WEATHER_DURATION, REDUCED_KONG_WEATHER_DURATION, type KongWeatherCue,
} from '../yaotong/kongPresentation'
import type { Round } from './engine'
import { tablePlayers, tableResult } from './presentation'

export interface TableAudio {
  play(name: string, volume?: number): unknown
  playAndWait(name: string, volume?: number): Promise<void>
}

export function useTablePresentation(audio: TableAudio, current: () => Round | null) {
  const view = createLocalGameState()
  const scheduler = createPresentationScheduler({ controllers: [], stopCountdown() {}, cancelOpening() {} })
  const transient = createLocalTransientEventPresenter({ state: view, later: scheduler.later })
  const weather = ref<KongWeatherCue[]>([])
  const scoresReleased = ref(false)

  function reset() {
    scheduler.clear()
    weather.value = []
    scoresReleased.value = false
    view.result.value = null
    view.phase.value = 'lobby'
    view.tableActionEvent.value = null
    view.announcement.value = null
    view.winEffect.value = null
    view.winPresentation.value = null
    view.revealHands.value = false
    view.winningPlayerIndex.value = -1
  }

  function visiblePlayers(round: Round) {
    const players = tablePlayers(round)
    const window = round.window
    if (window.kind === 'check-rob' || window.kind === 'rob') {
      const seat = players[round.turn]
      const index = round.players[round.turn].hand.findIndex(t => !t.marked && t.face === window.tile)
      if (index >= 0) seat.hand.splice(index, 1)
      seat.drawnTileIndex = -1
      seat.melds = seat.melds.map(m => m.type === 'peng' && m.tile === window.tile
        ? { ...m, type: 'gang', tiles: [...m.tiles, m.tile], added: true, pending: true } : m)
    }
    if (round.result) {
      for (const p of players) {
        if (!scoresReleased.value) p.score -= round.result.deltas[p.seat]
        // 抢到的第四张由 3D 胡牌位单独绘制，引擎和牌谱保留完整手牌。
        if (round.result.win?.kind === 'rob' && round.result.winner === p.seat) {
          p.hand.splice(p.drawnTileIndex, 1)
          p.drawnTileIndex = -1
        }
      }
    }
    return players
  }

  function settle(round: Round) {
    const { winner, win, payer } = round.result!
    view.honba.value = round.honba
    const finalize = () => {
      scoresReleased.value = true
      return tableResult(round)!
    }
    const timeline = createSettlementTimeline({
      state: { ...view, get players() { return visiblePlayers(round) } },
      clearTimers: scheduler.clear, later: scheduler.later, playSound: audio.play,
      getRoundLabel: () => windRoundLabel(round.dealerRound), finalizeWin: finalize, endDraw: finalize,
      showTableAction: (...args) => transient.showTableAction(...args, win?.label),
      getSourceIndex: ({ winnerIndex, winTile }) => {
        const seat = round.players[winnerIndex]
        if (win?.kind === 'indicator' || win?.kind === 'nine') {
          return seat.hand.map(t => t.marked ? null : t.face).lastIndexOf(winTile)
        }
        return seat.drawnIndex
      },
      takeRobbedKongTile: (seat, tile) => round.players[seat!].melds.findIndex(m => m.tile === tile),
    })
    if (win && winner !== null) {
      timeline.endGame(winner, { winTile: win.tile, selfDraw: payer === null, robbedKong: payer !== null, robbedKongPlayerIndex: payer ?? undefined })
    } else timeline.endDraw()
  }

  function present(round: Round) {
    const event = round.event
    if (!event) return
    let discardName: Promise<void> | undefined
    if (event.t === 'discard' && event.tile) {
      audio.play('dapai.mp3', .8)
      discardName = playDiscardName(event.tile, { playSound: audio.play, playSoundAndWait: audio.playAndWait, current: () => current() === round })
    } else if (event.t === 'draw') audio.play('give.mp3', .7)
    else if (round.window.kind === 'check-rob') {
      const { tile } = round.window
      const index = round.players[event.seat].melds.findIndex(m => m.type === 'peng' && m.tile === tile)
      transient.showTableAction('added-gang', event.seat, null, tile, index, '补杠')
      audio.play(ADDED_KONG_SOUND)
    } else if (event.t === 'meld' && event.actionType && event.tile) {
      const concealed = event.kind === 'gang-concealed'
      if (event.kind !== 'gang-added') {
        transient.showTableAction(event.actionType, event.seat, event.from ?? null, event.tile, event.meldIndex ?? -1, concealed ? '暗杠' : undefined)
        audio.play(event.kind === 'peng' ? 'peng.mp3' : concealed ? CONCEALED_KONG_SOUND : DEFAULT_KONG_SOUND)
      }
      if (event.kind !== 'peng') {
        const reducedMotion = prefersReducedMotion()
        const cue: KongWeatherCue = { id: round.serial, seat: event.seat, kind: concealed ? 'rain' : 'tornado',
          startedAt: performance.now(), duration: reducedMotion ? REDUCED_KONG_WEATHER_DURATION : KONG_WEATHER_DURATION, reducedMotion }
        weather.value = [...weather.value.filter(c => c.seat !== cue.seat), cue]
        audio.play(concealed ? 'angang_rainy.wav' : 'mingang_windy.wav', .28)
        scheduler.later(() => { weather.value = weather.value.filter(c => c.id !== cue.id) }, cue.duration)
      }
    }
    if (round.result) {
      weather.value = []
      if (discardName) {
        // 最后一张弃牌要完整落入牌河并报完牌名，再亮手牌、弹结算。
        view.phase.value = 'checking'
        void Promise.all([discardName, scheduler.wait(LOCAL_TABLE_PACE.discardReaction)]).then(() => {
          if (current() === round) settle(round)
        })
      } else settle(round)
    }
  }
  watch(view.revealHands, value => { if (value) audio.play('tuidao.wav', .55) }, { flush: 'sync' })
  watch(view.winEffect, value => { if (value) view.tableActionEvent.value = null }, { flush: 'sync' })
  return { view, scheduler, transient, weather, reset, visiblePlayers, present }
}
