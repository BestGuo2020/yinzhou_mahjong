<script setup lang="ts">
import { computed, ref } from 'vue'
import MahjongTile from '../MahjongTile.vue'
import YaotongPaymentMap from './YaotongPaymentMap.vue'
import type { GamePlayer } from '../../game/core/contracts/types'
import { useEffectPlayer } from '../../game/core/presentation/useAudio'
import type { Account, GameState, Transfer } from '../../game/variants/yaotong/types'
import { toSharedTile } from '../../game/variants/yaotong/useYaotongPort'
import { formatYaotongPatternLabel } from '../../game/variants/yaotong/presentation'
import type { TableThemeName } from '../table/three/tableTheme'
import { handScoreFormula, yaoUsageText } from './huScoreBreakdown'
import { YAO } from '../../game/variants/yaotong/tiles'
const props = defineProps<{ state: GameState; players: GamePlayer[]; themeName?: TableThemeName }>()
const result = computed(() => props.state.result!)
const detailOpen = ref(false)
const selectedSeat = ref(0)
const selectedValue = computed(() => result.value.values[selectedSeat.value])
const pair = ref<{ from: number; to: number; account?: Account } | null>(null)
const entries = computed(() =>
  result.value.transfers.filter(
    (entry) =>
      (entry.from === selectedSeat.value || entry.to === selectedSeat.value) &&
      (!pair.value ||
        ((!pair.value.account || entry.account === pair.value.account) &&
          ((entry.from === pair.value.from && entry.to === pair.value.to) ||
            (entry.from === pair.value.to && entry.to === pair.value.from)))),
  ),
)
const playEffect = useEffectPlayer()
const transferSign = (entry: Transfer) => (entry.to === selectedSeat.value ? '+' : '−')
function selectPlayer(seat: number) {
  selectedSeat.value = seat
  pair.value = null
}
function inspect(value: { from: number; to: number; account?: Account }) {
  pair.value = value
  detailOpen.value = true
  if (entries.value.some((entry) => entry.account === '幺筒责任分')) playEffect?.('zerenji.wav', 0.35)
}
</script>
<template>
  <section class="yaotong-ledger">
    <p v-if="result.kind === 'penalty'">{{ state.players[result.offender!].name }} · {{ result.reason }}</p>
    <b v-if="state.dice[0] === state.dice[1]" class="settlement-double" title="全部适用分数已乘2">同点 ×2</b>
    <div v-if="result.indicator !== null" class="yaotong-flip">
      <span>指示牌</span
      ><MahjongTile :theme-name="themeName" :tile="toSharedTile(result.indicator)" small disabled /><span
        >→ 翻鸡</span
      ><MahjongTile :theme-name="themeName" :tile="toSharedTile(result.chicken!)" small disabled />
    </div>
    <p class="yaotong-hand-score">
      <b>{{ players[selectedSeat].name }}</b> ·
      <template v-if="selectedValue">
        单份胡分：<template v-if="selectedValue.patterns.length">{{ handScoreFormula(selectedValue) }} = {{ selectedValue.h }}分</template>
        <template v-else>{{ selectedValue.h }}分（仅基础分）</template>
        <span class="yaotong-yao-use">{{ yaoUsageText(selectedValue, state.players[selectedSeat].hand, result.tile === YAO) }}</span>
      </template>
      <template v-else>本局未胡牌</template>
    </p>
    <YaotongPaymentMap
      :transfers="result.transfers"
      :players="players"
      :theme-name="themeName"
      :hand-number="state.handNumber"
      :burned-seats="
        result.kind === 'win' ? state.players.flatMap((player, seat) => (player.burned ? [seat] : [])) : []
      "
      @inspect="inspect"
      @select="selectPlayer"
    />
    <details :open="detailOpen" @toggle="detailOpen = ($event.target as HTMLDetailsElement).open">
      <summary>分项账单 · {{ entries.length }} 笔</summary>
      <button v-if="pair" class="secondary" @click="pair = null">查看该玩家全部收付</button>
      <div class="yaotong-ledger-scroll">
        <table>
          <thead>
            <tr>
              <th>付款 → 收款</th>
              <th>分项 / 依据</th>
              <th :title="`正负号以${players[selectedSeat].name}的收付为准`">分数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in entries" :key="i">
              <td>{{ state.players[entry.from].name }} → {{ state.players[entry.to].name }}</td>
              <td>
                {{ entry.account }}<small>{{ entry.account === '胡牌分' && result.values[entry.to] ? handScoreFormula(result.values[entry.to]!) : formatYaotongPatternLabel(entry.reason) }}</small>
                <small v-if="entry.account === '胡牌分' && result.values[entry.to]" class="yaotong-yao-use">{{ yaoUsageText(result.values[entry.to], state.players[entry.to].hand, result.tile === YAO) }}</small>
              </td>
              <td
                class="ledger-amount"
                :class="{ income: entry.to === selectedSeat, expense: entry.from === selectedSeat }"
                :title="`${players[selectedSeat].name}的${entry.to === selectedSeat ? '收入' : '支出'}`"
              >
                <template v-if="entry.multiplier === 2">{{ transferSign(entry) }}{{ entry.base }} × 2 = </template>{{ transferSign(entry) }}{{ entry.amount }}分
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
<style scoped src="../settlement/roundLedger.css"></style>
