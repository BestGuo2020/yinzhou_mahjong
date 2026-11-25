<script setup lang="ts">
// 中央信息盘（四家分数与名次）。**默认收起**：展开时面板会压住对家的牌面，
// 而局数/巡目/牌山余张在底部控制条上已经有了，折叠态只留一枚小药丸（含本场数）。
import { computed, useId } from 'vue'
import { formatTurn, rankTone } from '../../game/replay/format'
import type { ReplayFrame } from '../../game/replay/projection'
import type { ReplayMatch, ReplayRound } from '../../game/replay/types'
import YaotongSeatMarker from '../yaotong/YaotongSeatMarker.vue'
import { displayPoints } from '../../game/variants/yingzhou/coins'

const props = defineProps<{
  match: ReplayMatch
  round: ReplayRound | null
  frame: ReplayFrame | null
  resultLabel?: string
}>()
const expanded = defineModel<boolean>('expanded', { default: false })
const panelId = useId()

/** 分数排名（不依赖引擎，纯按当前帧分数排）。 */
const standings = computed(() => {
  const scores = props.frame?.scores ?? props.round?.anchor.scores ?? []
  return scores
    .map((score, seat) => ({ seat, score, name: props.match.players[seat]?.name ?? `座位${seat + 1}` }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
})
</script>

<template>
  <section class="replay-info" :class="{ expanded }" aria-label="对局信息">
    <button
      type="button" class="replay-info-toggle" data-testid="replay-info-toggle"
      :aria-expanded="expanded" :aria-controls="panelId" :title="expanded ? '收起分数' : '展开四家分数'"
      @click="expanded = !expanded"
    >
      {{ match.coinMultiplier ? '金币' : '分数' }}
      <span aria-hidden="true">{{ expanded ? '▴' : '▾' }}</span>
    </button>

    <div v-show="expanded" :id="panelId" class="replay-info-body" data-testid="replay-info-body">
      <button class="replay-info-close" aria-label="关闭分数" @click="expanded = false">×</button>
      <div class="replay-info-head">
        <strong>{{ round?.roundLabel ?? '—' }}</strong>
        <span>本场 {{ round?.honba ?? 0 }}</span>
        <span>余 {{ frame?.wallLeft ?? 0 }}</span>
        <span>{{ formatTurn(frame?.turn ?? 1) }}</span>
      </div>
      <ul class="replay-info-scores">
        <li
          v-for="entry in standings"
          :key="entry.seat"
          :class="[`rank-${rankTone(entry.rank)}`, { active: frame?.currentPlayer === entry.seat, self: entry.seat === match.humanSeat }]"
        >
          <b>{{ entry.rank }}</b>
          <span class="name">{{ entry.name }}</span>
          <em>{{ displayPoints(entry.score, match.coinMultiplier) }}</em>
          <YaotongSeatMarker v-if="frame?.yaotongSeats?.[entry.seat]" :name="entry.name" :status="frame.yaotongSeats[entry.seat]!" />
        </li>
      </ul>
      <p v-if="expanded && resultLabel" class="replay-info-result" data-testid="replay-result">{{ resultLabel }}</p>
    </div>
  </section>
</template>

<style scoped>
.replay-info-result { margin: 7px 0 0; text-align: center; color: var(--theme-accent-text); font-size: 12px; }
.replay-info {
  position: relative;
  flex: none;
}
.replay-info-toggle {
  min-height: 40px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--theme-border) 48%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-panel) 76%, transparent);
  color: var(--theme-accent-text);
  font-size: 12px;
  letter-spacing: .06em;
  backdrop-filter: blur(3px);
}
.replay-info-toggle span { margin-left: 4px; }
.replay-info-body {
  position: fixed;
  top: calc(var(--replay-header-height, 60px) + 8px);
  right: calc(12px + var(--safe-right, 0px));
  width: min(420px, calc(100vw - 24px));
  max-height: calc(100dvh - var(--replay-header-height, 60px) - var(--replay-controls-height, 64px) - 24px);
  overflow: auto;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--theme-border) 55%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-panel) 97%, transparent);
  box-shadow: 0 8px 26px rgba(0, 0, 0, .45);
  backdrop-filter: blur(3px);
}
.replay-info-close { float: right; width: 32px; height: 32px; padding: 0; border: 0; background: transparent; color: var(--theme-text-muted); font-size: 23px; }
.replay-info-head {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  margin-bottom: 6px;
  color: var(--theme-text-muted);
  font-size: 12px;
  letter-spacing: .06em;
}
.replay-info-head strong { color: var(--theme-accent-text); font-size: 15px; letter-spacing: .12em; }
.replay-info-scores { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; margin: 0; padding: 0; list-style: none; }
.replay-info-scores li {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 0 4px;
  padding: 3px 5px;
  border: 1px solid color-mix(in srgb, var(--theme-border) 26%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-panel-elevated) 62%, transparent);
  font-size: 12px;
}
.replay-info-scores li.active { border-color: var(--theme-accent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-accent) 45%, transparent) inset; }
.replay-info-scores li.self .name { color: var(--theme-accent-text); }
.replay-info-scores b { grid-row: span 2; align-self: center; color: var(--theme-text-muted); font-size: 13px; }
.replay-info-scores li.rank-first b { color: var(--theme-accent-text); }
.replay-info-scores .name { overflow: hidden; color: var(--theme-text); text-overflow: ellipsis; white-space: nowrap; }
.replay-info-scores em { color: var(--theme-text); font-size: 12px; font-style: normal; }
@media (max-width: 600px) { .replay-info-scores { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .replay-info-scores li { padding: 8px; } .replay-info-toggle { padding-inline: 8px; } .replay-info-toggle span { display: none; } }
</style>
