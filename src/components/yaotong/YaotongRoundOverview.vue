<script setup lang="ts">
import { computed } from 'vue'
import MahjongTile from '../MahjongTile.vue'
import type { TableThemeName } from '../table/three/tableTheme'
import type { Account, GameState } from '../../game/variants/yaotong/types'
import { toSharedTile } from '../../game/variants/yaotong/useYaotongPort'
import { huScoreBreakdown, yaoUsageText } from './huScoreBreakdown'
import { YAO } from '../../game/variants/yaotong/tiles'

const props = defineProps<{ state: GameState; themeName?: TableThemeName }>()
const result = computed(() => props.state.result!)
// The local human is seat 0. Every amount is their net income, including dice doubling.
const delta = computed(() => result.value.deltas[0])
const huParts = computed(() => huScoreBreakdown(result.value))
const accounts: Account[] = ['胡牌分', '鸡分', '杠分', '幺筒责任分', '杀报加分', '见面礼', '流局赔听款', '一般包牌赔付']
const breakdown = computed(() => accounts.flatMap(account => {
  const entries = result.value.transfers.filter(entry => entry.account === account && (entry.from === 0 || entry.to === 0))
  return entries.length ? [{ account, amount: entries.reduce((sum, entry) => sum + (entry.to === 0 ? entry.amount : -entry.amount), 0) }] : []
}))
const outcome = computed(() => {
  const settlement = result.value
  if (settlement.kind === 'penalty') return settlement.offender === 0 ? '包牌赔付' : '获赔'
  if (settlement.winners.includes(0)) return settlement.winKind === 'self' ? '自摸' : '胡牌'
  if (settlement.source === 0) return '放炮'
  return settlement.ready[0] ? '已听牌' : '未听牌'
})
const signed = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${Math.abs(amount)}`
</script>

<template>
  <section class="yaotong-round-overview" aria-label="本家分数概览">
    <div class="self-score-summary">
      <p class="self-result-label">本家 · {{ outcome }}</p>
      <div class="self-round-score" :class="{ positive: delta > 0, negative: delta < 0 }" :aria-label="`本局净得分${signed(delta)}分`">
        <span>本局净得分</span><strong>{{ signed(delta) }}</strong><span>分</span>
      </div>
    </div>
    <div class="self-score-breakdown" aria-label="本家分项净得分">
      <span v-for="item in breakdown" :key="item.account">
        {{ item.account }}
        <b :class="{ positive: item.amount > 0, negative: item.amount < 0 }">{{ signed(item.amount) }}</b>
        <template v-if="item.account === '胡牌分'">
          <small v-for="part in huParts" :key="part.winner" class="hu-score-parts">
            <template v-if="huParts.length > 1">{{ state.players[part.winner].name }}：</template>{{ part.formula }}<template v-if="huParts.length > 1"> = {{ signed(part.amount) }}分</template>
          </small>
        </template>
      </span>
      <span v-if="!breakdown.length">本局无分数收付</span>
    </div>
    <div v-if="result.indicator !== null || state.dice[0] === state.dice[1]" class="overview-chicken">
      <template v-if="result.indicator !== null && result.chicken !== null">
        <span>指示牌</span>
        <MahjongTile :tile="toSharedTile(result.indicator)" :theme-name="themeName" small disabled />
        <span class="chicken-arrow" aria-hidden="true">→</span>
        <MahjongTile class="flipped-chicken" :tile="toSharedTile(result.chicken)" :theme-name="themeName" small disabled />
        <span>翻鸡</span>
      </template>
      <b v-if="state.dice[0] === state.dice[1]" class="overview-double" title="展示的分数已包含同点翻倍">同点 ×2</b>
    </div>
    <ul v-if="result.winners.length" class="winning-hand-uses" aria-label="最终采用的胡牌方案">
      <li v-for="winner in result.winners" :key="winner">
        <b>{{ state.players[winner].name }}：{{ result.values[winner].patterns.map(p => p.name).join('＋') || '鸡胡' }}</b>
        <span>{{ yaoUsageText(result.values[winner], state.players[winner].hand, result.tile === YAO) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped src="../settlement/roundOverview.css"></style>
