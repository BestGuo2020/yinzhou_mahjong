import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TileType } from '../../core/contracts/types'
import type { ReplayRecording } from '../../replay/useReplayRecorder'
import { LOCAL_TABLE_PACE, PACE_MS } from '../../core/local/localGameConfig'
import { OPENING_PACE_MS } from '../../shared/runtime/localOpening'
import { dealRound } from './engine'
import { ordinary } from './rules'
import { useYingzhouGame } from './useYingzhouGame'
import { tileAudioFile } from '../../core/rules/tiles'
import { splitWinningTile } from '../../core/presentation/winEffect'
import { chooseAction } from './ai'
import { handWaits } from './waits'
import { HAND_REVEAL_MS } from './winMotion'

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
  const replay = { hooks: { roundStart: vi.fn(), step: vi.fn(), roundEnd: vi.fn() }, finish: vi.fn(), active: () => false } as unknown as ReplayRecording
  const game = scope.run(() => useYingzhouGame(replay, paused, { play, playAndWait: voice }))!
  game.start()
  game.round.value = round
  game.ready.value = true
  return { game, state: game.round.value!, play, paused, replay }
}

async function takeLiveKongSupplement(wall: TileType[]) {
  const round = fixture()
  round.settings.mode = 'live'
  round.wall = wall
  round.players[0].hand = held('m2','m3','m4','s3','s4','s5','p4','p5','p6','p6','east','east','east','east')
  const { game } = setup(round)
  await vi.advanceTimersByTimeAsync(openTime)
  game.play({ kind: 'kong', kong: 'concealed', tile: 'east' })
  await vi.advanceTimersByTimeAsync(1)
  return game
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis) })
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('颍州实桌沿用幺筒节奏', () => {
  it('只剩一张亮牌时，牌桌不提供能用亮牌杠开的暗杠', async () => {
    const game = await takeLiveKongSupplement(['p6'])
    expect(game.controls.value.some(a => a.kind === 'kong')).toBe(false)
    expect(game.round.value!.players[0].melds).toHaveLength(0)
    expect(game.wall.value).toEqual(['p6'])
    expect(game.mayDiscard.value).toBe(true)
  })

  it.each(['p6', 'p9'] as const)('直接报扎只展示三张普通 %s，同面标记牌留在手中', async face => {
    const round = fixture()
    round.settings.mode = 'nine'
    round.players[0].hand = [ordinary(face), { face, marked: true }, ordinary('m1'), ordinary(face), ordinary(face)]
    const { game, play } = setup(round)
    await vi.advanceTimersByTimeAsync(openTime)
    expect(game.winPatterns.value).toBeNull()
    expect(play).not.toHaveBeenCalledWith('zhagang.ogg')
    game.play(game.controls.value.find(action => action.kind === 'win')!)
    expect(play).toHaveBeenCalledWith('zhagang.ogg')
    const presentation = game.winPresentation.value!
    expect(presentation.yingzhou?.zhaIndices).toEqual([0, 3, 4])
    expect(splitWinningTile(game.players.value[0].hand, presentation).hand).toEqual([face, 'm1'])
    expect(game.actionCue.value).toBeNull()
    expect(game.winPatterns.value).toMatchObject({ impactMs: 1713, duration: 2800,
      winners: [{ seat: 0, label: face === 'p6' ? '扎亮牌' : '扎九' }] })
    expect(play).not.toHaveBeenCalledWith('zimo.mp3')
    await vi.advanceTimersByTimeAsync(1712)
    expect(play).not.toHaveBeenCalledWith('hu_effect_sound.mp3', .72)
    await vi.advanceTimersByTimeAsync(1)
    expect(play).toHaveBeenCalledWith('hu_effect_sound.mp3', .72)
    await vi.advanceTimersByTimeAsync(1087)
    expect(game.revealHands.value).toBe(true)
    expect(game.players.value[0].hand).toHaveLength(5)
    expect(play.mock.calls.filter(([name]) => name === 'zhagang.ogg')).toHaveLength(1)
  })

  it('抢补杠胡只展示被抢的第四张，离桌取消尚未到点的落牌声', async () => {
    const round = fixture()
    round.turn = 1
    round.window = { kind: 'rob', seats: [0], tile: 'p5' }
    round.players[1].melds = [{ type: 'peng', tile: 'p5', tiles: ['p5','p5','p5'] }]
    round.players[1].hand = held('p5')
    round.players[0].hand = held('p3','p4','m4','m5','m6','s2','s3','s4','green','green','green','south','south')
    const { game, play } = setup(round)
    await vi.advanceTimersByTimeAsync(openTime)
    game.play(game.controls.value.find(action => action.kind === 'win')!)
    await vi.advanceTimersByTimeAsync(PACE_MS.betweenRobKongs)
    expect(game.winPresentation.value).toMatchObject({ robbedKongPlayerIndex: 1, robbedKongMeldIndex: 0, yingzhou: { kind: 'rob' } })
    expect(game.players.value[0].hand).toHaveLength(13)
    expect(game.players.value[1].melds[0].tiles).toHaveLength(3)
    expect(game.winPatterns.value?.winners[0].label).toBe('抢补杠胡')
    expect(play).toHaveBeenCalledWith('hu.mp3')
    expect(play).not.toHaveBeenCalledWith('zhagang.ogg')
    game.leave()
    await vi.advanceTimersByTimeAsync(3100)
    expect(play).not.toHaveBeenCalledWith('hu_effect_sound.mp3', .72)
  })

  it('留扎自摸报自摸，推牌落定才响倒牌声', async () => {
    const round = fixture()
    round.origin = 'draw'
    round.players[0].hand = held('p3','p4','m4','m5','m6','s2','s3','s4','p6','p6','p6','south','south','p5')
    round.players[0].drawnIndex = 13
    const { game, play } = setup(round)
    await vi.advanceTimersByTimeAsync(openTime)
    expect(game.controls.value.some(action => action.kind === 'win' && action.win.kind === 'indicator')).toBe(true)
    game.play(game.controls.value.find(action => action.kind === 'win' && action.win.kind === 'self')!)
    expect(game.winPatterns.value?.winners[0].label).toBe('自摸')
    expect(play).toHaveBeenCalledWith('zimo.mp3')
    expect(play).not.toHaveBeenCalledWith('zhagang.ogg')
    await vi.advanceTimersByTimeAsync(1875)
    expect(game.revealHands.value).toBe(true)
    expect(game.winPresentation.value?.yingzhou?.revealAt).toEqual(expect.any(Number))
    expect(play).not.toHaveBeenCalledWith('tuidao.wav', .55)
    await vi.advanceTimersByTimeAsync(299)
    expect(play).not.toHaveBeenCalledWith('tuidao.wav', .55)
    await vi.advanceTimersByTimeAsync(1)
    expect(play).toHaveBeenCalledWith('tuidao.wav', .55)
    expect(play).toHaveBeenCalledWith('hu_effect_sound.mp3', .72)
  })

  it.each([false, true])('AI 报扎的摊牌声只响一次，减少动态效果=%s', async reduced => {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
    const round = fixture()
    round.turn = 2
    round.players[2].hand = held('m1','m2','m3','m4','m5','m6','s1','s2','s3','east','east','p6','p6','p6')
    const { game, play } = setup(round)
    await vi.advanceTimersByTimeAsync(openTime + LOCAL_TABLE_PACE.aiDiscard)
    expect(game.winPresentation.value).toMatchObject({ winnerIndex: 2, yingzhou: { kind: 'indicator' } })
    expect(play.mock.calls.filter(([name]) => name === 'zhagang.ogg')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(game.winEffect.value!.duration)
    expect(game.revealHands.value).toBe(true)
    if (reduced) {
      expect(game.winPresentation.value?.yingzhou?.revealAt).toBeNull()
    } else {
      expect(game.winPresentation.value?.yingzhou?.revealAt).toEqual(expect.any(Number))
      await vi.advanceTimersByTimeAsync(HAND_REVEAL_MS - 1)
      expect(play).not.toHaveBeenCalledWith('tuidao.wav', .55)
      await vi.advanceTimersByTimeAsync(1)
    }
    expect(play.mock.calls.filter(([name]) => name === 'tuidao.wav')).toHaveLength(1)
  })

  it('墙尾还有牌时只报杠上开花', async () => {
    const game = await takeLiveKongSupplement(['m2','p6'])
    game.play(game.controls.value.find(action => action.kind === 'win')!)
    expect(game.actionCue.value).toBeNull()
    expect(game.winPatterns.value?.winners[0].label).toBe('杠上开花')
    expect(game.winPresentation.value?.yingzhou?.kind).toBe('bloom')
    await vi.advanceTimersByTimeAsync(2312)
    expect(game.winEffect.value).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(game.winPatterns.value).toBeNull()
    expect(game.revealHands.value).toBe(true)
  })

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

  it('东风场中途有连庄时，最终结算和末局牌谱都落在东四局', async () => {
    const { game, replay } = setup()
    game.autoplay.value = true
    for (const [index, winner] of [0, 1, 2, 3, 0].entries()) {
      const round = game.round.value!
      round.players[winner].hand = held(round.indicator, round.indicator, round.indicator)
      round.window = { kind: 'reveal', tile: round.indicator, seats: [winner] }
      await nextTick()
      await vi.runAllTimersAsync()
      expect(game.result.value?.winnerIndex).toBe(winner)
      if (index < 4) {
        expect(game.finished.value).toBe(false)
        expect(replay.finish).not.toHaveBeenCalled()
        game.next()
      }
    }
    expect(game.finished.value).toBe(true)
    expect(game.result.value?.roundLabel).toBe('东4局')
    expect(replay.hooks.roundEnd).toHaveBeenLastCalledWith(
      expect.objectContaining({ roundLabel: '东4局' }), expect.objectContaining({ round: 4 }),
    )
    expect(replay.finish).toHaveBeenCalledExactlyOnceWith('finished')
    const last = game.round.value
    game.next()
    expect(game.round.value).toBe(last)
  })

  it.each([[4, '东4局'], [8, '南4局'], [16, '北4局']] as const)('%i 庄次的末局流局、庄家胡牌都留庄，闲家胡牌才结束', async (length, label) => {
    const last = fixture()
    last.dealerRound = length
    last.wall = [last.indicator]
    const { game, replay } = setup(last)
    game.matchLength.value = length
    await vi.advanceTimersByTimeAsync(openTime)
    game.play({ kind: 'discard', index: 0 })
    await vi.runAllTimersAsync()
    expect(game.result.value).toMatchObject({ roundLabel: label, draw: true })
    expect(game.finished.value).toBe(false)
    for (const [honba, winner] of [[1, 0], [2, 1]]) {
      game.next()
      const round = game.round.value!
      expect(round).toMatchObject({ dealerRound: length, dealer: 0, honba })
      round.players[winner].hand = held(round.indicator, round.indicator, round.indicator)
      round.window = { kind: 'reveal', tile: round.indicator, seats: [winner] }
      game.autoplay.value = true
      await nextTick()
      await vi.runAllTimersAsync()
      expect(game.result.value).toMatchObject({ roundLabel: label, winnerIndex: winner })
      expect(game.finished.value).toBe(winner !== 0)
    }
    expect(replay.finish).toHaveBeenCalledExactlyOnceWith('finished')
  })

  it('开场等语音与最短时长，随后掷骰、按原间隔逆时针发牌、跳牌', async () => {
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
    expect(game.players.value[1].hand).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(game.players.value.map(p => p.hand.length)).toEqual([4,4,0,0])
    for (let batch = 2; batch < 13; batch++) {
      await vi.advanceTimersByTimeAsync(260)
      expect(game.dealAnimation.value.playerIndex).toBe(batch % 4)
    }
    expect(game.players.value.map(p => p.hand.length)).toEqual([14,12,12,12])
    expect(game.dealAnimation.value.sourceOffsets).toEqual([48,52])
    expect(game.dealAnimation.value.remainingWallOffsets?.slice(0, 5)).toEqual([49,50,51,53,54])
    await vi.advanceTimersByTimeAsync(260 + 450 + 650)
    expect(play.mock.calls.filter(([file]) => file === 'deal.mp3')).toHaveLength(12)
    expect(game.mayDiscard.value).toBe(true)
    expect(voice.mock.calls.map(([file]) => file)).toEqual(['game_start.mp3','dice.mp3'])
  })
  it('本家正常摸末张后选牌打出，最后一张进河并报完实际打出的字牌才结算', async () => {
    let finishVoice!: () => void
    const voice = vi.fn((name: string) => name === '5z.mp3' ? new Promise<void>(r => { finishVoice = r }) : Promise.resolve())
    const f = fixture()
    f.wall = ['s8', f.indicator]; f.window = { kind: 'draw' }
    const { game, state, replay, play } = setup(f, voice)
    await vi.advanceTimersByTimeAsync(openTime + 2000)
    expect(state.wall).toEqual([f.indicator])
    expect(state.players[0].hand.at(-1)?.face).toBe('s8')
    expect(game.mayDiscard.value).toBe(true)
    expect(game.result.value).toBeNull()
    game.play({ kind: 'discard', index: state.players[0].hand.findIndex(t => t.face === 'red') })
    expect(game.players.value[0].discards.at(-1)).toBe('red')
    expect(state.lastDiscard).toMatchObject({ from: 0, tile: 'red' })
    expect(replay.hooks.step).toHaveBeenLastCalledWith(expect.objectContaining({ t: 'discard', seat: 0, tile: 'red' }), expect.anything())
    await vi.advanceTimersByTimeAsync(PACE_MS.discardFlight - 1)
    expect(play).not.toHaveBeenCalledWith('dapai.ogg', .8)
    await vi.advanceTimersByTimeAsync(1)
    expect(play).toHaveBeenCalledWith('dapai.ogg', .8)
    await vi.advanceTimersByTimeAsync(1100 - PACE_MS.discardFlight)
    expect(voice.mock.calls.filter(([file]) => file === '5z.mp3')).toHaveLength(1)
    expect(game.revealHands.value).toBe(false)
    expect(game.result.value).toBeNull()
    finishVoice()
    await vi.advanceTimersByTimeAsync(0)
    expect(game.result.value?.draw).toBe(true)
    expect(replay.hooks.roundEnd).toHaveBeenCalledTimes(1)
  })

  it('AI 摸末张照常思考、出牌，短音或静音时也留足一秒看弃牌', async () => {
    const f = fixture()
    f.turn = 1; f.wall = ['s8', f.indicator]; f.window = { kind: 'draw' }
    const voice = vi.fn(async (_name: string) => {})
    const { game, state } = setup(f, voice)
    await vi.advanceTimersByTimeAsync(openTime + 1)
    expect(state.players[1].hand).toHaveLength(14)
    const choice = chooseAction(state)
    if (choice.kind !== 'discard') throw new Error('本牌例应由 AI 出牌')
    const face = state.players[1].hand[choice.index].face
    await vi.advanceTimersByTimeAsync(1000)
    expect(state.lastDiscard).toMatchObject({ from: 1, tile: face })
    expect(game.players.value[1].discards).toEqual([face])
    await vi.advanceTimersByTimeAsync(998)
    expect(voice).toHaveBeenCalledWith(tileAudioFile(face))
    expect(game.result.value).toBeNull()
    await vi.advanceTimersByTimeAsync(2)
    expect(game.result.value?.draw).toBe(true)
  })
  it('末张报牌期间离桌，旧语音结束也不会弹出上一局结算', async () => {
    let ended!: () => void
    const f = fixture()
    f.wall = ['s8', f.indicator]; f.window = { kind: 'draw' }
    const { game, state } = setup(f, name => name === '8s.mp3' ? new Promise<void>(r => { ended = r }) : Promise.resolve())
    await vi.advanceTimersByTimeAsync(openTime + 1)
    game.play({ kind: 'discard', index: state.players[0].drawnIndex })
    await vi.advanceTimersByTimeAsync(100)
    game.leave()
    game.start()
    ended()
    await vi.advanceTimersByTimeAsync(1500)
    expect(game.round.value?.result).toBeNull()
    expect(game.result.value).toBeNull()
    expect(game.revealHands.value).toBe(false)
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
