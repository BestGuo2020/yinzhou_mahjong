<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import EffectNumber from '../commons/EffectNumber.vue'
import type { RoundResult } from '../../game/core/contracts/gamePort'
import { prefersReducedMotion } from '../../game/core/presentation/winEffect'
import { coinsForPoints } from '../../game/variants/yingzhou/coins'
import { artwork } from './yingzhouCinematic'

const props = defineProps<{ result: RoundResult }>()
const emit = defineEmits<{ finished: []; sound: [file: 'coin_flight.ogg' | 'coin_collect.ogg'] }>()
const layer = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const reduced = prefersReducedMotion()
const duration = reduced ? 900 : 1920
const width = ref(0), height = ref(0)
type Point = { x: number; y: number }
const seats = ref<Point[]>([])
const transfers = computed(() => (props.result.scoreChanges ?? [])
  .filter(entry => entry.delta !== 0)
  .map(entry => ({ seat: entry.playerIndex, name: entry.name, coins: coinsForPoints(entry.delta, 3) })))
const fontHeight = computed(() => Math.min(78, Math.max(34, height.value * .102)))
const numberWidth = computed(() => width.value * .29)

function numberPosition(seat: number) {
  return {
    left: ['50%', '84%', '50%', '16%'][seat],
    top: ['69%', '42%', '16%', '42%'][seat],
    width: numberWidth.value + 'px',
  }
}

let observer: ResizeObserver | undefined
let frame = 0
let finishTimer = 0
let soundTimer = 0
onMounted(() => {
  const root = layer.value!
  const table = root.parentElement!
  const ctx = reduced ? null : canvas.value?.getContext('2d')
  function measure() {
    const rect = root.getBoundingClientRect()
    width.value = rect.width
    height.value = rect.height
    seats.value = ['.user-identity', '.seat-right', '.seat-top', '.seat-left'].map(selector => {
      const avatar = table.querySelector(selector + ' .avatar')!.getBoundingClientRect()
      return { x: avatar.x + avatar.width / 2 - rect.x, y: avatar.y + avatar.height / 2 - rect.y }
    })
    if (ctx && canvas.value) {
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.value.width = Math.round(rect.width * scale)
      canvas.value.height = Math.round(rect.height * scale)
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
    }
  }
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(root)
  finishTimer = window.setTimeout(() => emit('finished'), duration)
  if (reduced) soundTimer = window.setTimeout(() => emit('sound', 'coin_collect.ogg'), 150)
  if (!ctx) return
  const sprite = artwork('gold-coin-turn')
  const start = performance.now()
  let flightSoundPlayed = false
  const winner = props.result.winnerIndex!
  const particles = transfers.value.filter(item => item.coins < 0).flatMap(({ seat }) =>
    Array.from({ length: 19 }, (_, i) => ({
      seat, delay: 625 + i * 20 + Math.random() * 75, travel: 555 + Math.random() * 245,
      bend: (Math.random() - .5) * .24, lift: .04 + Math.random() * .10,
      spin: 1.25 + Math.random() * 2, angle: Math.random() * Math.PI,
      size: .83 + Math.random() * .46,
    })))
  function paint(now: number) {
    const elapsed = now - start
    const w = width.value, h = height.value
    ctx!.clearRect(0, 0, w, h)
    const end = seats.value[winner]
    if (sprite.naturalWidth && end) for (const coin of particles) {
      const progress = (elapsed - coin.delay) / coin.travel
      if (progress <= 0 || progress >= 1) continue
      const origin = seats.value[coin.seat]
      const t = progress * progress * (3 - 2 * progress)
      const arch = Math.sin(Math.PI * progress)
      const dx = end.x - origin.x, dy = end.y - origin.y
      const x = origin.x + dx * t - dy * coin.bend * arch
      const y = origin.y + dy * t + dx * coin.bend * arch - h * coin.lift * arch
      const size = Math.min(29, Math.max(15, h * .037)) * coin.size * (.75 + .38 * arch)
      const phase = Math.floor((coin.angle + progress * coin.spin) * 48) % 48
      ctx!.save()
      ctx!.translate(x, y)
      ctx!.rotate(coin.angle + t * .95)
      ctx!.globalAlpha = Math.min(1, progress * 12, (1 - progress) * 16)
      ctx!.drawImage(sprite, phase % 8 * 72, Math.floor(phase / 8) * 72, 72, 72, -size/2, -size/2, size, size)
      ctx!.restore()
      if (!flightSoundPlayed) {
        flightSoundPlayed = true
        emit('sound', 'coin_flight.ogg')
      }
    }
    if (elapsed < duration) frame = requestAnimationFrame(paint)
  }
  frame = requestAnimationFrame(paint)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
  clearTimeout(finishTimer)
  clearTimeout(soundTimer)
})
</script>

<template>
  <div ref="layer" class="coin-payout" role="status" aria-label="三倍场金币收付">
    <canvas v-if="!reduced" ref="canvas" aria-hidden="true" />
    <template v-if="seats.length">
      <div v-for="item in transfers" :key="item.seat" class="coin-amount" :style="numberPosition(item.seat)"
        :data-seat="item.seat" :aria-label="item.name + ' ' + item.coins + ' 金币'">
        <div class="coin-slide"><EffectNumber :value="item.coins" :height="fontHeight" font-family="Archivo, Arial, sans-serif" /></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
@font-face {
  font-family: Archivo;
  src: url('/fonts/archivo-900-italic-digits.woff2') format('woff2');
  font-weight: 900;
  font-style: italic;
  font-display: swap;
}
.coin-payout, canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.coin-payout { z-index: 43; overflow: hidden; }
.coin-amount { position: absolute; transform: translate(-50%, -50%); text-align: center; }
.coin-slide { display: flex; justify-content: center; animation: coin-slide 1.24s both; }
@keyframes coin-slide {
  0% { opacity: 0; transform: translateX(-28%); }
  14% { opacity: 1; transform: translateX(0); animation-timing-function: ease-out; }
  83% { opacity: 1; transform: translateX(0); }
  100% { opacity: 0; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) { .coin-slide { animation: none; } }
</style>
