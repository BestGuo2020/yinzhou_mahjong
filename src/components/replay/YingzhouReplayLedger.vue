<script setup lang="ts">
import { computed, ref } from 'vue'
import YaotongPaymentMap from '../yaotong/YaotongPaymentMap.vue'
import type { RoundResult } from '../../game/core/contracts/gamePort'
import type { GamePlayer } from '../../game/core/contracts/types'
import type { Transfer } from '../../game/variants/yaotong/types'
import { BASE_POINTS } from '../../game/variants/yingzhou/rules'
import type { TableThemeName } from '../../theme/themeIdentity'
import { formatDelta } from '../../game/replay/format'

const props = defineProps<{
  result: RoundResult; players: GamePlayer[]
  themeName: TableThemeName; handNumber: number
}>()
const formula = computed(() => {
  const r = props.result
  if (r.draw) return '流局留庄，本局不计入有效局数。'
  const factors = r.details?.map(p => p.label + ' ' + p.multiplier + ' 倍').join(' ＋ ')
  const paid = r.robbedKong ? '被抢者独付 ' + r.totalWon : '每家付 ' + r.points
  return `${factors || r.winLabel} · 底分 ${BASE_POINTS} · ${paid} 分`
})
const transfers = computed<Transfer[]>(() => (props.result.scoreChanges ?? []).flatMap(entry =>
  entry.delta < 0 && props.result.winnerIndex != null ? [{
    from: entry.playerIndex, to: props.result.winnerIndex, account: '胡牌分',
    base: BASE_POINTS, multiplier: props.result.totalMultiplier ?? 1, amount: -entry.delta, reason: props.result.winLabel ?? '胡牌',
  }] : []))
const selected = ref(0)
const detailsOpen = ref(false)
const pair = ref<{ from: number; to: number } | null>(null)
const entries = computed(() => transfers.value.filter(t =>
  (t.from === selected.value || t.to === selected.value) && (!pair.value || t.from === pair.value.from && t.to === pair.value.to)))
function selectSeat(seat: number) { selected.value = seat; pair.value = null }
function inspect(edge: { from: number; to: number }) { pair.value = edge; detailsOpen.value = true }
</script>

<template>
  <section class="yaotong-ledger" aria-label="颍州分数明细">
    <p class="yaotong-hand-score"><b>{{ result.winner ?? '流局' }}</b> · {{ formula }}</p>
    <YaotongPaymentMap :players="players" :transfers="transfers" :theme-name="themeName" :hand-number="handNumber"
      @select="selectSeat" @inspect="inspect" />
    <details :open="detailsOpen" @toggle="detailsOpen = ($event.target as HTMLDetailsElement).open">
      <summary>分项账单 · {{ entries.length }} 笔</summary>
      <button v-if="pair" type="button" class="secondary" @click="pair = null">查看该玩家全部收付</button>
      <div class="yaotong-ledger-scroll">
        <table v-if="entries.length"><thead><tr><th>付款 → 收款</th><th>胡法</th><th>分数</th></tr></thead>
          <tbody><tr v-for="entry in entries" :key="entry.from"><td>{{ players[entry.from].name }} → {{ players[entry.to].name }}</td>
            <td>{{ entry.reason }}</td><td class="ledger-amount" :class="entry.to === selected ? 'income' : 'expense'">
              {{ formatDelta(entry.to === selected ? entry.amount : -entry.amount) }}分</td></tr></tbody>
        </table><p v-else>本局无分数收付</p>
      </div>
    </details>
  </section>
</template>

<style scoped src="../settlement/roundLedger.css"></style>
