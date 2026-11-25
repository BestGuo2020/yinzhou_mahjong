import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoundResult } from '../../game/core/contracts/gamePort'
import SettlementOverlay from './SettlementOverlay.vue'

async function roundText(result: RoundResult) {
  const app = createSSRApp(SettlementOverlay, {
    result, roundLabel: '第 2 局', resultTitle: result.winLabel ?? '流局留庄', rulesetId: 'yingzhou',
    resultVisible: true, matchFinished: false, dealer: 0, waitingNextRound: false,
    gameMode: 'local', continueCountdown: 0, matchName: '4 局场', standings: [], playerId: '', themeName: 'jade',
  })
  return (await renderToString(app)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('颍州单屏结算', () => {
  beforeEach(() => vi.stubGlobal('window', { location: { search: '' } }))
  afterEach(() => vi.unstubAllGlobals())

  it('杠开区分基础倍率和两项加成', async () => {
    const text = await roundText({ winLabel: '杠上开花', totalMultiplier: 7, totalWon: 210, details: [
      { label: '明杠开花', multiplier: 2 }, { label: '旧标记 1 张', multiplier: 2 }, { label: '留扎亮牌', multiplier: 3 },
    ] })
    expect(text).toContain('总倍数 ×7 +210 分')
    expect(text).toContain('明杠开花 ×2 旧标记 1 张 +2 倍 留扎亮牌 +3 倍')
  })

  it('抢补杠显示胡法倍率和包付明细，并按累计名次排列四家', async () => {
    const text = await roundText({ winType: 'robbed-kong', winLabel: '抢补杠胡', totalMultiplier: 2, totalWon: 60,
      winnerIndex: 1, details: [{ label: '抢补杠胡', multiplier: 2 }], scoreChanges: [
        { playerIndex: 0, name: '你', avatar: '', rank: 4, delta: -60, score: -70 },
        { playerIndex: 1, name: '下家', avatar: '', rank: 1, delta: 60, score: 50 },
        { playerIndex: 2, name: '对家', avatar: '', rank: 2, delta: 0, score: 30 },
        { playerIndex: 3, name: '上家', avatar: '', rank: 3, delta: 0, score: -10 },
      ] })
    expect(text).toContain('第 2 局 · 抢补杠胡 总倍数 ×2 +60 分')
    expect(text).toContain('抢补杠胡 ×2 你包付 60 分')
    expect(text).toContain('1 位 下家 +60 50 2 位 对家 0 30 3 位 上家 0 -10 4 位 你 庄 -60 -70')
  })

  it('流局直接显示留庄结果', async () => {
    const text = await roundText({ draw: true, totalWon: 0 })
    expect(text).toContain('第 2 局 · 流局留庄')
    expect(text).not.toContain('总倍数')
    expect(text).not.toContain('+0 分')
  })
})
