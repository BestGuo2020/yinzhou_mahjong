<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue'
import GameTableHud from '../components/table/GameTableHud.vue'
import type { TableThemeName } from '../theme/themeIdentity'
import { tailFaceUp } from '../game/variants/yingzhou/presentation'
import { useTablePresentation, type TableAudio } from '../game/variants/yingzhou/useTablePresentation'
import { exampleRound, examples, winExample, type Example } from './winEffectsRound'

const props = defineProps<{ themeName: TableThemeName; audio: TableAudio }>()
const selected = ref<Example>('indicator')
const round = ref(exampleRound(selected.value))
const ready = ref(false)
const effects = useTablePresentation(props.audio, () => round.value)
const { winPresentation, winPatterns } = effects
const { winEffect, revealHands, winningPlayerIndex, tableActionEvent, phase } = effects.view
const players = computed(() => effects.visiblePlayers(round.value))
const deal = { playerIndex: -1, count: 0, serial: 0 }

function play(kind: Example) {
  effects.reset()
  selected.value = kind
  round.value = exampleRound(kind)
  const state = round.value
  phase.value = 'checking'
  effects.scheduler.later(() => {
    if (round.value !== state || state.result) return
    winExample(state, kind)
    effects.present(state)
  }, 350)
}
function tableReady() {
  if (ready.value) return
  ready.value = true
  play(selected.value)
}
onScopeDispose(effects.reset)
</script>

<template>
  <div class="has-three-scene">
    <GameTableHud ruleset-id="yingzhou" :theme-name="themeName" :players="players" :user="players[0]"
      :phase="phase" :wall="round.wall" :wall-head-drawn="round.headDrawn" :wall-count="round.wall.length"
      :wall-break-index="round.breakIndex" :flip-tile="round.indicator" :tail-indicator="tailFaceUp(round) ? round.indicator : null"
      :current-player="round.result ? -1 : round.turn" :selected-index="-1" :turn-seconds="0" :last-discard="null"
      :action-prompt="null" :announcement="null" :table-action-event="tableActionEvent" :score-flow-event="null"
      :result="null" :win-effect="winEffect" :win-patterns="winPatterns" :win-presentation="winPresentation"
      :reveal-hands="revealHands" :winning-player-index="winningPlayerIndex" :match-finished="false" :dealer="0"
      :is-user-turn="false" :user-can-hu="false" match-name="特效预览" round-label="东1局" :deal-animation="deal"
      :opening-stage="null" :dice-values="round.dice" :dice-thrower-index="0" :user-current-waits="null"
      :user-ting-options="[]" :user-discard-waits="null" :user-kongs="[]" :user-has-wind-kong="false" @ready="tableReady" />
    <nav class="preview-controls" aria-label="特效预览">
      <a :href="'?theme=' + themeName">‹ 大厅</a>
      <button v-for="(label, kind) in examples" :key="kind" type="button" :disabled="!ready"
        :aria-pressed="selected === kind" @click="play(kind)">{{ label }}</button>
    </nav>
  </div>
</template>

<style scoped>
.preview-controls {
  position: absolute; z-index: 65; top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 3px; padding: 4px; white-space: nowrap;
  color: var(--theme-text); background: var(--theme-panel, #191e1d); border: 1px solid var(--theme-border); border-radius: 8px;
}
.preview-controls a, .preview-controls button {
  font: inherit; font-size: clamp(13px, 1.3vw, 17px); color: inherit; background: transparent;
  border: 0; border-radius: 4px; padding: 6px 12px; cursor: pointer; text-decoration: none;
}
.preview-controls button[aria-pressed="true"] { background: var(--theme-accent); color: #161b19; font-weight: 700; }
.preview-controls button:disabled { opacity: .5; }
</style>
