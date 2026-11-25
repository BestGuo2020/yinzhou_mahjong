<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { WinEffect } from '../../game/core/contracts/gamePort'
import { tileName } from '../../game/core/rules/tiles'
import type { WinKind } from '../../game/variants/yingzhou/rules'
import { YINGZHOU_WIN_MOTION, type WinTileAnchors } from '../../game/variants/yingzhou/winMotion'
import { assetUrl, clamp, paintWinFrame, ramp, winArtwork } from './yingzhouCinematic'

const props = defineProps<{ effect: WinEffect; kind: WinKind; label: string; winner: string;
  sourceName?: string; anchors?: WinTileAnchors | null }>()
const layer = ref<HTMLElement | null>(null)
const sourceTag = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const failed = ref(false)
const titleSrc = computed(() => winArtwork[props.kind].label === props.label && !failed.value
  ? assetUrl('title-' + props.kind) : '')
const currentAnchors = computed(() => props.anchors?.id === props.effect.id ? props.anchors : null)
const sourceAnchor = computed(() => currentAnchors.value?.source)
const position = computed(() => {
  const target = currentAnchors.value?.target
  return {
    // Land over the winner's side of the felt, leaving the tile itself exposed.
    '--cx': (target ? Math.min(68, Math.max(32, 50 + (target.left - 50) * .68)) : 50) + '%',
    '--cy': (target ? Math.min(59, Math.max(34, target.top - 16)) : 48) + '%',
    '--word-width': (props.label.length * 10 + 4) + '%',
  }
})
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
  const { land: landedAt, takeoff, impact } = YINGZHOU_WIN_MOTION[props.kind]
  function frame(time: number) {
    const ms = Math.max(0, time - started)
    if (sourceTag.value) sourceTag.value.style.opacity = String(1 - ramp(ms, takeoff, takeoff + 160))
    const alpha = ramp(ms, landedAt, landedAt + 115) * (1 - ramp(ms, props.effect.duration - 230, props.effect.duration))
    const land = ramp(ms, impact - 110, impact + 55)
    const after = clamp((ms - impact) / 300)
    const recoil = Math.sin(after * Math.PI * 2) * (1 - after) * .064
    const tilt = props.kind === 'rob' ? -11 : props.kind === 'self' ? 2 : -4
    root.style.opacity = String(alpha)
    root.style.setProperty('--title-alpha', String(ramp(ms, impact - 135, impact - 15)))
    root.style.setProperty('--title-scale', String(1 + (1 - land) * .67 + recoil))
    root.style.setProperty('--title-tilt', tilt * (1 - land) + 'deg')
    root.style.setProperty('--title-y', (1 - land) * (props.kind === 'rob' ? -72 : -36) + 'px')
    root.style.setProperty('--glint-x', (ramp(ms, impact + 40, impact + 650) * 190 - 45) + '%')
    root.style.setProperty('--meta-alpha', String(ramp(ms, impact + 40, impact + 260)))
    if (ctx && ms >= landedAt) {
      ctx.setTransform(surface.width / 1000, 0, 0, surface.height / 560, 0, 0)
      ctx.clearRect(0, 0, 1000, 560)
      paintWinFrame(ctx, props.kind, ms - landedAt, impact - landedAt)
    }
    if (ms < props.effect.duration) raf = requestAnimationFrame(frame)
  }
  frame(performance.now())
})
onBeforeUnmount(() => { cancelAnimationFrame(raf); observer?.disconnect() })
</script>

<template>
  <div v-if="kind === 'rob' && sourceName && sourceAnchor" ref="sourceTag"
    class="rob-source-tag" :class="{ below: sourceAnchor.top < 23 }"
    :style="{ left: 'clamp(4.7em,' + sourceAnchor.left + '%,calc(100% - 4.7em))', top: sourceAnchor.top + '%' }">
    {{ sourceName }}补杠<span>·</span>{{ tileName(effect.tile) }}
  </div>
  <div ref="layer" class="win-cinematic" :data-win-kind="kind" :style="position" role="status"
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
.rob-source-tag {
  position: absolute; z-index: 43; transform: translate(-50%, -100%) translateY(clamp(-74px, -8vh, -35px));
  padding: .32em .65em; border: 1px solid #f7ede199; border-radius: 5px; pointer-events: none;
  background: #18231ff0; color: #fff8e9; font: 600 clamp(13px, 2.2vh, 19px)/1.25 sans-serif; white-space: nowrap;
}
.rob-source-tag::after {
  content: ''; position: absolute; left: 50%; top: 100%; width: 1px; height: .6em; background: #f7ede1ce;
}
.rob-source-tag span { margin: 0 .35em; opacity: .7; }
.rob-source-tag.below { transform: translate(-50%, 0) translateY(.95em); }
.rob-source-tag.below::after { top: auto; bottom: 100%; }
.win-cinematic {
  position: absolute; inset: 0; z-index: 42; pointer-events: none; overflow: hidden; opacity: 0;
  background: radial-gradient(ellipse 56% 48% at var(--cx) var(--cy), #100b08ed 0%, #130d0bd6 27%, #11100cb3 50%, #15100955 73%, transparent 100%);
}
.win-stage {
  width: min(89%, 146vh, 1150px); aspect-ratio: 1000 / 560;
  position: absolute; top: var(--cy); left: var(--cx); transform: translate(-50%, -50%);
}
.win-cinematic[data-win-kind="rob"] .win-stage { width: min(70%, 116vh, 920px); }
.win-stage canvas {
  width: 100%; height: 100%; display: block; mix-blend-mode: screen;
  mask-image: radial-gradient(ellipse 64% 70% at 50% 50%, black 63%, transparent 100%);
}
.win-lettering {
  position: absolute; top: 49.5%; left: 50%; width: var(--word-width); opacity: var(--title-alpha, 0);
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
