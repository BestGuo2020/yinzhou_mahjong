<script setup lang="ts">
import { computed } from 'vue'
import BloodFlowImpactTitle from './BloodFlowImpactTitle.vue'
import type { TableThemeName } from './three/tableTheme'
import { bloodFlowImpactProfile, type bloodFlowTitleMotion } from '../../theme/bloodFlowPresentation'

const props = defineProps<{
  text: string
  themeName: TableThemeName
  seatIndex: number
  tier: 0 | 1 | 2 | 3
  motion: ReturnType<typeof bloodFlowTitleMotion>
  compact?: boolean
  main?: boolean
  tableFocus?: boolean
}>()
const titleStyle = computed(() => {
  const m = props.motion, seat = props.seatIndex
  const left = (props.compact ? [50, 74, 50, 26] : [50, 78, 50, 22])[seat]
  const anchor = seat === 0 ? { bottom: props.compact ? '22%' : '19%' }
    : { top: `${(props.compact ? [0, 42, 8, 42] : [0, 38, 12, 38])[seat]}%` }
  const unit = props.main ? (props.compact ? 52 : 110) : props.tier >= 2 ? (props.compact ? 36 : 66) : (props.compact ? 30 : 54)
  const position = props.tableFocus
    ? { left: `${[54, 67, 47, 33][seat]}%`, top: `${[54, 39, 27, 39][seat]}%` }
    : { left: `${left}%`, ...anchor }
  return { ...position,
    width: props.tableFocus ? `min(${props.text.length * 64}px, 36vw, ${props.text.length * 9}vh)`
      : `min(${(props.text.length * .92 + .4) * unit}px,${props.main ? 65 : 34}vw)`,
    fontFamily: bloodFlowImpactProfile(props.themeName, props.tier).font,
    opacity: m.opacity,
    transform: `translate(-50%,${m.y}px) perspective(650px) rotateY(${m.tilt}deg) rotateX(${m.tilt * .3}deg) scale(${1 + (m.scale - 1) * .55}) rotate(${m.rotation}deg)`,
  }
})
</script>

<template>
  <div class="blood-flow-central" :data-theme="themeName" :style="titleStyle">
    <BloodFlowImpactTitle :text="text" :theme="themeName" />
  </div>
</template>

<style scoped>
.blood-flow-central { position: absolute; isolation: isolate; transform-origin: 50% 65%; --win-color: var(--theme-accent,#e4c17a); }
.blood-flow-central::before { content: ''; position: absolute; inset: -12% -25%; z-index: -1; background: radial-gradient(ellipse,color-mix(in srgb,var(--win-color) 22%,transparent),transparent 70%); }
[data-theme="rosewood"]::before { inset: 18% -10%; border-block: 1px solid #d3976599; background: linear-gradient(90deg,transparent,#452016b8 25%,#452016b8 75%,transparent); transform: skewX(-8deg); }
[data-theme="happyMahjong"]::before { background: conic-gradient(from 15deg,transparent 0 10%,#fbd34477 12% 15%,transparent 17% 30%,#78ceff66 32% 35%,transparent 37% 55%,#ff859677 57% 60%,transparent 62%); clip-path: polygon(8% 12%,80% 0,100% 65%,80% 95%,0 80%); }
[data-theme="llm"]::before { inset: 20% -8%; border-block: 1px solid #6eeaff99; background: repeating-linear-gradient(0deg,#67dce814 0 1px,transparent 1px 5px),linear-gradient(90deg,transparent,#123241cc,transparent); }
[data-theme="llmAnime"]::before { background: linear-gradient(135deg,transparent 12%,#fd8db344 15% 17%,transparent 20% 60%,#dab5ef66 63% 66%,transparent 70%); transform: skewX(-15deg); }
</style>
