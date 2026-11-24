import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TileType } from '../../core/contracts/types'
import type { ReplayRecording } from '../../replay/useReplayRecorder'
import { OPENING_PACE_MS } from '../../shared/runtime/localOpening'
import { dealRound } from './engine'
import { ordinary } from './rules'
import { useYingzhouGame } from './useYingzhouGame'
import { handWaits } from './waits'

const held = (...faces: TileType[]) => faces.map(ordinary)
function fixture() {
  const round = dealRound({ mode: 'fixed', smallBan: false }, { dealer: 0 })
  round.players.forEach(p => { p.hand = held('m1','m4','m7','p1','p4','p7','s1','s4','s7','red','green','west','north'); p.drawnIndex = -1 })
  round.window = { kind: 'turn' }
  round.indicator = 'p6'
  round.wall = ['m9','m3','p6']
  return round
}
const stops: (() => void)[] = []
const openTime = OPENING_PACE_MS.start + OPENING_PACE_MS.dice + 13 * OPENING_PACE_MS.batch + 3 * OPENING_PACE_MS.single + OPENING_PACE_MS.firstTurn
function setup(round = fixture(), voice = async (_name: string) => {}) {
  const scope = effectScope()
  stops.push(() => scope.stop())
  const paused = ref(false)
  const play = vi.fn()
  const replay = { hooks: { roundStart: vi.fn(), step: vi.fn(), roundEnd: vi.fn() }, active: () => false } as unknown as ReplayRecording
  const game = scope.run(() => useYingzhouGame(replay, paused, { play, playAndWait: voice }))!
  game.start()
  game.round.value = round
  game.ready.value = true
  return { game, state: game.round.value!, play, paused }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('颍州实桌沿用幺筒节奏', () => {
  it('只在开始一场时读取大厅的玩法、禁胡开关和场次', () => {
    const { game } = setup()
    game.leave()
    game.settings.value = { mode: 'nine', smallBan: true }
    game.length.value = 8
    game.start()
    game.settings.value.mode = 'fixed'
    game.settings.value.smallBan = false
    game.length.value = 4
    expect(game.round.value!.settings).toEqual({ mode: 'nine', smallBan: true })
    expect(game.matchLength.value).toBe(8)
    game.leave()
    game.start()
    expect(game.round.value!.settings).toEqual({ mode: 'fixed', smallBan: false })
    expect(game.matchLength.value).toBe(4)
  })

  it('开场等语音与最短时长，随后掷骰、按原间隔顺时针发牌、跳牌', async () => {
    let ended!: () => void
    const voice = vi.fn((name: string) => name === 'game_start.mp3' ? new Promise<void>(r => { ended = r }) : Promise.resolve())
    const { game, play } = setup(fixture(), voice)
    await vi.advanceTimersByTimeAsync(1800)
    expect(game.openingStage.value).toBe('start')
    ended()
    await vi.advanceTimersByTimeAsync(0)
    expect(game.openingStage.value).toBe('dice')
    await vi.advanceTimersByTimeAsync(1150)
    expect(game.players.value.map(p => p.hand.length)).toEqual([4,0,0,0])
    await vi.advanceTimersByTimeAsync(259)
    expect(game.players.value[3].hand).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(game.players.value[3].hand).toHaveLength(4)
    await vi.advanceTimersByTimeAsync(12 * 260 + 450 + 650)
    expect(play.mock.calls.filter(([file]) => file === 'deal.mp3')).toHaveLength(12)
    expect(game.mayDiscard.value).toBe(true)
    expect(voice.mock.calls.map(([file]) => file)).toEqual(['game_start.mp3','dice.mp3'])
  })
  it('河牌留桌一秒，AI 摸进后独立思考一秒；暂停和离桌取消旧动作', async () => {
    const { game, state, paused } = setup()
    await vi.advanceTimersByTimeAsync(openTime)
    game.play({ kind: 'discard', index: 0 })
    await vi.advanceTimersByTimeAsync(999)
    expect(state.players[1].hand).toHaveLength(13)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].hand).toHaveLength(14)
    await vi.advanceTimersByTimeAsync(999)
    expect(state.players[1].discards).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].discards).toHaveLength(1)
    const serial = state.serial
    paused.value = true
    await vi.advanceTimersByTimeAsync(3100)
    expect(state.serial).toBe(serial)
    paused.value = false
    await nextTick()
    game.leave()
    await vi.advanceTimersByTimeAsync(3100)
    expect(state.serial).toBe(serial)
  })
  it('本家提前点碰也先留牌，碰后 350ms 开放出牌', async () => {
    const f = fixture()
    f.turn = 1
    f.players[1].hand = held('p5')
    f.players[0].hand = [...f.players[0].hand.slice(0, 11), ...held('p5','p5')]
    const { game, state } = setup(f)
    await vi.advanceTimersByTimeAsync(openTime + 1000)
    game.play({ kind: 'peng' })
    await vi.advanceTimersByTimeAsync(999)
    expect(state.players[0].melds).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[0].melds[0].type).toBe('peng')
    await vi.advanceTimersByTimeAsync(349)
    expect(game.mayDiscard.value).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(game.mayDiscard.value).toBe(true)
  })
  it('明杠后550ms才杠补，AI再等两秒出牌，杠后首弃也留足两秒', async () => {
    const f = fixture()
    f.players[0].hand.push(ordinary('east'))
    f.players[1].hand = [...f.players[1].hand.slice(0, 10), ...held('east','east','east')]
    const { game, state } = setup(f)
    await vi.advanceTimersByTimeAsync(openTime)
    game.play({ kind: 'discard', index: 13 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(state.window.kind).toBe('supplement')
    await vi.advanceTimersByTimeAsync(549)
    expect(state.players[1].hand.some(t => t.marked)).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].hand.at(-1)).toEqual({ face:'p6', marked:true })
    await vi.advanceTimersByTimeAsync(1999)
    expect(state.players[1].discards).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[1].discards).toHaveLength(1)
    const wall = state.wall.length
    await vi.advanceTimersByTimeAsync(1999)
    expect(state.wall).toHaveLength(wall)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.wall).toHaveLength(wall - 1)
  })
  it('补杠先宣告两秒，再等600ms补牌；补杠声只播一次', async () => {
    const f = fixture()
    f.players[0].melds = [{ type:'peng', tile:'s8', tiles:['s8','s8','s8'] }]
    f.players[0].hand = [...f.players[0].hand.slice(0, 10), ordinary('s8')]
    const { game, state, play } = setup(f)
    await vi.advanceTimersByTimeAsync(openTime)
    game.play({ kind:'kong', kong:'added', tile:'s8' })
    expect(game.players.value[0].melds[0].pending).toBe(true)
    await vi.advanceTimersByTimeAsync(1999)
    expect(state.players[0].melds[0].type).toBe('peng')
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[0].melds[0].type).toBe('gang')
    await vi.advanceTimersByTimeAsync(599)
    expect(state.players[0].hand.some(t => t.marked)).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.players[0].hand.at(-1)?.marked).toBe(true)
    expect(play.mock.calls.filter(([file]) => file === 'bugang.ogg')).toHaveLength(1)
  })
  it('听牌箭头区分同面普通牌和标记牌，且遵守小牌禁胡', () => {
    const r = fixture()
    r.players[0].hand = [...held('m2','m3','m4','m5','m6','m7','s3','s4','s5','p6','p6','p6','s2'),{ face:'p6', marked:true }]
    expect(handWaits(r, 0, true).options.map(o => o.discardIndex)).toEqual([13])
    r.settings.smallBan = true
    expect(handWaits(r, 0, true).options[0].tiles.map(t => t.tile)).toEqual(['s5'])
  })
})
