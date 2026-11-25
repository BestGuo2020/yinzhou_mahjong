<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import WinPatternTitle from '../table/WinPatternTitle.vue'
import type { TableThemeName } from '../table/three/tableTheme'
import type { YaotongWinPatternCue } from '../../game/variants/yaotong/presentation'
import { bloodFlowTitleMotion } from '../../theme/bloodFlowPresentation'

const props = defineProps<{ cue: YaotongWinPatternCue; themeName: TableThemeName; compact?: boolean }>()
const now = ref(Date.now())
let frame = 0
function tick() {
  now.value = Date.now()
  if (!props.cue.reducedMotion && now.value < props.cue.startedAt + props.cue.duration) frame = requestAnimationFrame(tick)
}
onMounted(tick)
onBeforeUnmount(() => cancelAnimationFrame(frame))
const titles = computed(() => props.cue.winners.map(winner => ({ ...winner,
  motion: bloodFlowTitleMotion({
    startedAt: props.cue.startedAt, duration: props.cue.duration, tier: winner.tier, compact: Boolean(props.compact),
    phaseMarks: { impact: props.cue.reducedMotion ? 130 : props.cue.impactMs ?? 130,
      readable: Math.min(props.cue.duration, (props.cue.impactMs ?? 130) + 290), score: props.cue.duration },
  }, now.value, props.themeName, props.cue.reducedMotion),
})))
</script>

<template>
  <div class="yaotong-win-patterns" aria-live="polite">
    <WinPatternTitle v-for="winner in titles" :key="winner.seat" :text="winner.label" :theme-name="themeName"
      :seat-index="winner.seat" :tier="winner.tier" :motion="winner.motion" :compact="compact"
      :main="titles.length === 1 && winner.seat === 0 && winner.tier >= 2"
      :data-title-seat="winner.seat" />
  </div>
</template>

<style scoped>
.yaotong-win-patterns { position: absolute; inset: 0; z-index: 42; pointer-events: none; }
</style>
