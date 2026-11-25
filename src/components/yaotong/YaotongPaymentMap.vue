<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GamePlayer } from '../../game/core/contracts/types'
import type { TableThemeName } from '../table/three/tableTheme'
import { animeAvatarForPlayer } from '../../game/core/presentation/animeAvatarPresentation'
import { displayImageSrc } from '../../game/core/presentation/imagePreload'
import {
  giftAwards,
  giftPayments,
  killPayments,
  responsibilityPayments,
  killFocusSeat,
  reportKillTotals,
  paymentEdges,
} from '../../game/variants/yaotong/presentation'
import type { Account, Transfer } from '../../game/variants/yaotong/types'

const props = defineProps<{
  transfers: Transfer[]
  players: GamePlayer[]
  themeName?: TableThemeName
  handNumber: number
  formatAmount?: (points: number) => string
  amountUnit?: string
  burnedSeats?: number[]
}>()
const emit = defineEmits<{
  inspect: [pair: { from: number; to: number; account?: Account }]
  select: [seat: number]
}>()
const seatOrder = ref([1, 2, 3, 0])
const selected = computed(() => seatOrder.value[3])
function selectPlayer(seat: number) {
  const index = seatOrder.value.indexOf(seat)
  if (index < 0 || index === 3) return
  seatOrder.value[index] = selected.value
  seatOrder.value[3] = seat
  emit('select', seat)
}
const mode = ref<'net' | 'gift' | 'kill' | 'responsibility'>('net')
const responsibilities = computed(() => responsibilityPayments(props.transfers))
const gifts = computed(() => giftAwards(props.transfers))
const kills = computed(() => killPayments(props.transfers))
const killTotals = computed(() => reportKillTotals(props.transfers))
const killPaid = (seat: number) => killTotals.value.find((total) => total.seat === seat)?.paid ?? 0
const killEarned = (seat: number) => killTotals.value.find((total) => total.seat === seat)?.received ?? 0
const edges = computed(() =>
  (mode.value === 'responsibility'
    ? responsibilities.value
    : mode.value === 'kill'
      ? kills.value
      : mode.value === 'gift'
        ? giftPayments(props.transfers)
        : paymentEdges(props.transfers)
  ).filter((edge) => edge.from === selected.value || edge.to === selected.value),
)
function showGift() {
  mode.value = 'gift'
  selectPlayer(gifts.value[0]?.seat ?? selected.value)
}
function showKill() {
  mode.value = 'kill'
  selectPlayer(killFocusSeat(props.transfers))
}
function showResponsibility() {
  mode.value = 'responsibility'
  selectPlayer(responsibilities.value[0]?.from ?? selected.value)
}
function inspect(from: number, to: number) {
  emit('inspect', {
    from,
    to,
    account:
      mode.value === 'responsibility'
        ? '幺筒责任分'
        : mode.value === 'kill'
          ? '杀报加分'
          : mode.value === 'gift'
            ? '见面礼'
            : undefined,
  })
}
const position = (seat: number) =>
  seat === selected.value ? { x: 300, y: 139 } : { x: [85, 300, 515][seatOrder.value.indexOf(seat)], y: 30 }
function path(from: number, to: number) {
  const a = position(from),
    b = position(to),
    down = a.y < b.y
  return `M ${a.x} ${a.y + (down ? 23 : -23)} Q ${(a.x + b.x) / 2} 85 ${b.x} ${b.y + (down ? -23 : 23)}`
}
const avatar = (player: GamePlayer) =>
  displayImageSrc(props.themeName === 'llmAnime' ? animeAvatarForPlayer(player) : player.avatar)
const label = (from: number, to: number, amount: number) =>
  `${props.players[from].name}向${props.players[to].name}${mode.value === 'responsibility' ? '支付幺筒责任款' : mode.value === 'kill' ? '额外支付杀报款' : mode.value === 'gift' ? '支付见面礼' : '净付'}${props.formatAmount?.(amount) ?? amount}${props.amountUnit ?? '分'}`
</script>
<template>
  <section
    class="yaotong-payment-map"
    :class="{ 'gift-mode': mode === 'gift', 'kill-mode': mode === 'kill' }"
    :style="{
      '--kill-ink': themeName === 'rosewood' ? '#226e74' : '#a0e9e4',
      '--kill-loss-ink': themeName === 'rosewood' ? '#9b3652' : '#f0a5b6',
    }"
    aria-label="本局分数流向"
  >
    <header>
      <span
        v-if="gifts.length || kills.length || responsibilities.length"
        class="payment-modes"
        role="group"
        aria-label="收付分项"
      >
        <button :aria-pressed="mode === 'net'" :class="{ selected: mode === 'net' }" @click="mode = 'net'">
          净收付
        </button>
        <button
          v-if="gifts.length"
          :aria-pressed="mode === 'gift'"
          :class="{ selected: mode === 'gift' }"
          @click="showGift"
        >
          见面礼
        </button>
        <button
          v-if="kills.length"
          :aria-pressed="mode === 'kill'"
          :class="{ selected: mode === 'kill' }"
          @click="showKill"
        >
          杀报
        </button>
        <button
          v-if="responsibilities.length"
          :aria-pressed="mode === 'responsibility'"
          :class="{ selected: mode === 'responsibility' }"
          @click="showResponsibility"
        >
          责任款
        </button>
      </span>
      <span v-else>本局净收付</span>
    </header>
    <svg viewBox="0 0 600 180" role="group" :aria-label="`${players[selected]?.name}的本局收付`">
      <defs>
        <marker
          id="yaotong-pay-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L8 4 L0 8 Z" fill="context-stroke" />
        </marker>
        <clipPath id="yaotong-pay-avatar"><circle r="20" /></clipPath>
      </defs>
      <g
        v-for="edge in edges"
        :key="`${handNumber}/${mode}/${selected}/${edge.from}/${edge.to}`"
        class="payment-edge"
        :class="{ incoming: edge.to === selected }"
        role="button"
        tabindex="0"
        :aria-label="label(edge.from, edge.to, edge.amount)"
        @click="inspect(edge.from, edge.to)"
        @keydown.enter="inspect(edge.from, edge.to)"
        @keydown.space.prevent="inspect(edge.from, edge.to)"
      >
        <title>
          {{ label(edge.from, edge.to, edge.amount) }}；{{
            edge.parts.map((p) => `${p.account}${p.amount > 0 ? '+' : ''}${formatAmount?.(p.amount) ?? p.amount}`).join('，')
          }}
        </title>
        <path class="payment-hit" :d="path(edge.from, edge.to)" />
        <path class="payment-line" :d="path(edge.from, edge.to)" marker-end="url(#yaotong-pay-arrow)" />
        <circle class="payment-particle" r="4">
          <animateMotion :path="path(edge.from, edge.to)" dur=".9s" repeatCount="1" fill="freeze" />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;.1;.8;1"
            dur=".9s"
            repeatCount="1"
            fill="freeze"
          />
        </circle>
        <g :transform="`translate(${(position(edge.from).x + position(edge.to).x) / 2},86)`">
          <rect x="-34" y="-12" width="68" height="24" rx="12" />
          <text text-anchor="middle" y="5">{{ edge.to === selected ? '+' : '−' }}{{ formatAmount?.(edge.amount) ?? edge.amount }}</text>
        </g>
      </g>
      <g
        v-for="(p, seat) in players"
        :key="seat"
        :transform="`translate(${position(seat).x},${position(seat).y})`"
        class="payment-player"
        role="button"
        tabindex="0"
        :aria-label="`查看${p.name}的分数流向`"
        :aria-pressed="seat === selected"
        @click="selectPlayer(seat)"
        @keydown.enter="selectPlayer(seat)"
        @keydown.space.prevent="selectPlayer(seat)"
        :class="{
          selected: seat === selected,
          burned: burnedSeats?.includes(seat),
          gifted: gifts.some((gift) => gift.seat === seat),
          'killed-report': killPaid(seat) > 0,
          'kill-winner': killEarned(seat) > 0,
        }"
      >
        <circle r="22" />
        <image
          :href="avatar(p)"
          x="-20"
          y="-20"
          width="40"
          height="40"
          clip-path="url(#yaotong-pay-avatar)"
        />
        <path
          v-if="killPaid(seat)"
          class="map-report-break"
          d="M-17 -16 L0 -1 L-4 3 L17 16 M0 -1 L9 -14"
          aria-hidden="true"
        />
        <text y="37" text-anchor="middle">{{ p.name }}</text>
        <g v-if="burnedSeats?.includes(seat)" class="map-burn-mark" :aria-label="`${p.name}烧鸡`">
          <title>烧鸡</title>
          <path d="M-27 -3 C-37 -14 -25 -14 -29 -23 C-12 -12 -15 -2 -23 -2 C-29 -1 -34 -6 -29 -11Z" />
          <text x="-22" y="-24" text-anchor="end">烧鸡</text>
        </g>
        <g
          v-if="gifts.some((gift) => gift.seat === seat)"
          class="map-gift-mark"
          :aria-label="`${p.name}见面礼${gifts.find((gift) => gift.seat === seat)!.amount}分`"
        >
          <title>见面礼</title>
          <text x="30" :y="killPaid(seat) || killEarned(seat) ? -3 : 5">
            礼 +{{ gifts.find((gift) => gift.seat === seat)!.amount }}
          </text>
        </g>
        <g
          v-if="killPaid(seat) || killEarned(seat)"
          class="map-kill-mark"
          :class="{ debit: killPaid(seat) > 0 }"
          :aria-label="
            killPaid(seat)
              ? `${p.name}被杀报，额外支付${killPaid(seat)}分`
              : `${p.name}杀报额外收取${killEarned(seat)}分`
          "
        >
          <text x="30" :y="gifts.some((gift) => gift.seat === seat) ? 13 : 5">
            {{ killPaid(seat) ? `被杀报 −${killPaid(seat)}` : `杀报 +${killEarned(seat)}` }}
          </text>
        </g>
      </g>
      <text v-if="!edges.length" class="no-payments" x="300" y="92" text-anchor="middle">无收付</text>
    </svg>
  </section>
</template>
<style scoped>
.yaotong-payment-map {
  margin: 12px 0;
  color: var(--theme-text);
  border-top: 1px solid var(--theme-border);
  padding-top: 10px;
}
.yaotong-payment-map header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}
.payment-modes {
  display: flex;
  gap: 5px;
}
.payment-modes button {
  border: 1px solid transparent;
  border-radius: 20px;
  background: transparent;
  color: var(--theme-text-muted);
  font-size: 11px;
  padding: 4px 8px;
}
.payment-modes button.selected {
  border-color: var(--theme-border);
  color: var(--theme-accent-text);
  background: var(--theme-surface);
}
.gift-mode .payment-edge {
  color: #e6bf6f;
}
.kill-mode .payment-edge {
  color: var(--kill-ink);
}
.payment-player.killed-report > circle {
  stroke: var(--kill-loss-ink);
  stroke-width: 3;
}
.payment-player.kill-winner > circle {
  stroke: var(--kill-ink);
  stroke-width: 3;
}
.map-report-break {
  fill: none;
  stroke: #f6a1b4;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.payment-player .map-kill-mark text {
  fill: var(--kill-ink);
  font-size: 11px;
  font-weight: 800;
}
.payment-player .map-kill-mark.debit text {
  fill: var(--kill-loss-ink);
}
.payment-player.gifted > circle {
  stroke: #e6bf6f;
  stroke-width: 3;
  animation: map-gift-glow 1.1s ease-out both;
}
.payment-player.burned > circle {
  stroke: #ed8969;
  stroke-width: 3;
}
.map-burn-mark path {
  fill: #ed8969;
}
.payment-player .map-burn-mark text {
  fill: #ed8969;
  font-size: 10px;
  font-weight: 800;
}
.payment-player .map-gift-mark text {
  fill: #e6bf6f;
  font-size: 11px;
  font-weight: 800;
}
@keyframes map-gift-glow {
  0% {
    stroke-width: 6;
    filter: drop-shadow(0 0 9px #e6bf6f);
  }
  100% {
    stroke-width: 3;
    filter: none;
  }
}
svg {
  display: block;
  width: 100%;
  height: 175px;
  overflow: visible;
}
.payment-edge {
  color: #e1a078;
  cursor: pointer;
}
.payment-edge.incoming {
  color: #8bceac;
}
.payment-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  opacity: 0.85;
}
.payment-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 20;
}
.payment-particle {
  fill: currentColor;
  filter: drop-shadow(0 0 4px currentColor);
}
.payment-edge rect {
  fill: var(--theme-panel);
  stroke: currentColor;
  stroke-width: 1;
}
.payment-edge text {
  fill: currentColor;
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.payment-player {
  cursor: pointer;
}
.payment-player:focus-visible {
  outline: none;
}
.payment-player:focus-visible > circle {
  stroke: var(--theme-accent);
  stroke-width: 4;
}
.payment-player circle {
  fill: var(--theme-surface);
  stroke: var(--theme-border);
  stroke-width: 1.5;
}
.payment-player.selected circle {
  stroke: var(--theme-accent);
  stroke-width: 2.5;
}
.payment-player text {
  fill: var(--theme-text);
  font-size: 11px;
}
.no-payments {
  fill: var(--theme-text-muted);
  font-size: 12px;
}
.payment-edge:focus-visible {
  outline: none;
}
.payment-edge:focus-visible .payment-line {
  stroke-width: 4;
}
@container game (max-height: 600px) {
  svg {
    height: 110px;
  }
  .yaotong-payment-map {
    margin: 7px 0;
    padding-top: 6px;
  }
  .yaotong-payment-map header {
    font-size: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .payment-player.gifted > circle {
    animation: none;
  }
  .payment-particle {
    display: none;
  }
}
</style>
