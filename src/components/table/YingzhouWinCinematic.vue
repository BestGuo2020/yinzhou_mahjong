<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { WinEffect } from '../../game/core/contracts/gamePort'
import { tileName } from '../../game/core/rules/tiles'
import type { WinKind } from '../../game/variants/yingzhou/rules'
import { WIN_PLAYBACK_RATE, YINGZHOU_WIN_MOTION } from '../../game/variants/yingzhou/winMotion'
import { assetUrl, clamp, paintWinFrame, ramp, winArtwork } from './yingzhouCinematic'

const props = defineProps<{ effect: WinEffect; kind: WinKind; label: string; winner: string;
  sourceName?: string }>()
const layer = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const failed = ref(false)
const titleSrc = computed(() => winArtwork[props.kind].label === props.label && !failed.value
  ? assetUrl('title-' + props.kind) : '')
let raf = 0
let observer: ResizeObserver | undefined
onMounted(() => {
  const root = layer.value!, surface = canvas.value!
  const ctx = surface.getContext('2d')
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.4)
    surface.width = Math.max(1, Math.min(1440, Math.round(surface.clientWidth * dpr)))
    surface.height = Math.round(surface.width * .56)
  }
  resize()
  observer = new ResizeObserver(resize)
  observer.observe(surface)
  const started = performance.now() - Math.max(0, Date.now() - props.effect.id)
  const { cinematicStart, impact } = YINGZHOU_WIN_MOTION[props.kind]
  const end = props.effect.duration * WIN_PLAYBACK_RATE
  function frame(time: number) {
    const ms = Math.max(0, time - started) * WIN_PLAYBACK_RATE
    const alpha = ramp(ms, cinematicStart, cinematicStart + (cinematicStart ? 115 : 95)) * (1 - ramp(ms, end - 230, end))
    const land = ramp(ms, impact - 110, impact + 55)
    const after = clamp((ms - impact) / 300)
    const recoil = Math.sin(after * Math.PI * 2) * (1 - after) * .064
    const tilt = props.kind === 'rob' ? -11 : props.kind === 'self' ? 2 : -4
    root.style.opacity = String(alpha)
    root.style.setProperty('--title-alpha', String(ramp(ms, impact - 135, impact - 15)))
    root.style.setProperty('--title-scale', String(1 + (1 - land) * .67 + recoil))
    root.style.setProperty('--title-tilt', tilt * (1 - land) + 'deg')
    root.style.setProperty('--title-y', (1 - land) * (cinematicStart ? -36 : -22) + 'px')
    root.style.setProperty('--glint-x', (ramp(ms, impact + 40, impact + 650) * 190 - 45) + '%')
    root.style.setProperty('--meta-alpha', String(ramp(ms, impact + 40, impact + 260)))
    if (ctx && ms >= cinematicStart) {
      ctx.setTransform(surface.width / 1000, 0, 0, surface.height / 560, 0, 0)
      ctx.clearRect(0, 0, 1000, 560)
      paintWinFrame(ctx, props.kind, ms - cinematicStart, impact - cinematicStart)
    }
    if (ms < end) raf = requestAnimationFrame(frame)
  }
  frame(performance.now())
})
onBeforeUnmount(() => { cancelAnimationFrame(raf); observer?.disconnect() })
</script>

<template>
  <div ref="layer" class="win-cinematic" :data-win-kind="kind" :style="{ '--word-width': (label.length * 10 + 4) + '%' }" role="status"
    :aria-label="[winner, label, sourceName, tileName(effect.tile)].filter(Boolean).join('，')">
    <div class="win-stage">
      <canvas ref="canvas" aria-hidden="true"></canvas>
      <div class="win-lettering">
        <template v-if="titleSrc">
          <img :src="titleSrc" :alt="label" @error="failed = true" />
          <i aria-hidden="true" :style="{ maskImage: 'url(' + titleSrc + ')' }"></i>
        </template>
        <b v-else>{{ label }}</b>
      </div>
      <div class="win-byline">{{ winner }}<template v-if="kind === 'rob' && sourceName">抢{{ sourceName }}的{{ tileName(effect.tile) }}</template><template v-else><span>·</span>{{ tileName(effect.tile) }}</template></div>
    </div>
  </div>
</template>

<style scoped>
.win-cinematic {
  position: absolute; inset: 0; z-index: 42; pointer-events: none; overflow: hidden; opacity: 0;
  background: radial-gradient(ellipse 56% 48% at center, #100b08ed 0%, #130d0bd6 27%, #11100cb3 50%, #15100955 73%, transparent 100%);
}
.win-stage {
  width: min(89%, 146vh, 1150px); aspect-ratio: 1000 / 560;
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
}
.win-cinematic[data-win-kind="rob"] .win-stage { width: min(70%, 116vh, 920px); }
.win-stage canvas {
  width: 100%; height: 100%; display: block; mix-blend-mode: screen;
  mask-image: radial-gradient(ellipse 64% 70% at 50% 50%, black 63%, transparent 100%);
}
.win-lettering {
  position: absolute; top: 50%; left: 50%; width: var(--word-width); opacity: var(--title-alpha, 0);
  transform: translate(-50%, -50%) translateY(var(--title-y)) rotate(var(--title-tilt)) scale(var(--title-scale));
  filter: drop-shadow(0 .3em .24em #180b06cb);
}
.win-lettering img { display: block; width: 100%; height: auto; }
.win-lettering i {
  position: absolute; inset: 0; mask-size: 100% 100%; mix-blend-mode: screen;
  background: linear-gradient(112deg, transparent calc(var(--glint-x) - 9%), #fff4c9ad var(--glint-x), transparent calc(var(--glint-x) + 9%));
}
.win-lettering b { display: block; color: #ffe6a4; text-align: center; white-space: nowrap; font: 900 clamp(26px, 6vw, 88px) KaiTi, serif; }
.win-byline {
  position: absolute; left: 50%; top: 64%; transform: translateX(-50%); opacity: var(--meta-alpha, 0);
  display: flex; align-items: center; gap: .55em; white-space: nowrap; color: #ffe8b9;
  text-shadow: 0 2px 4px #150a00; font: 600 clamp(12px, 1.55vw, 20px) KaiTi, serif; letter-spacing: .12em;
}
.win-byline::before, .win-byline::after { content: ''; width: 2em; height: 1px; background: linear-gradient(90deg, transparent, #f5cf8e); }
.win-byline::after { transform: rotate(180deg); }
[data-table-theme="llm"] .win-stage canvas { filter: hue-rotate(150deg) saturate(.86); }
[data-table-theme="rosewood"] .win-stage canvas { filter: hue-rotate(-10deg); }
</style>
