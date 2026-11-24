<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import GameShellHeader from './components/shell/GameShellHeader.vue'
import OrientationGate from './components/shell/OrientationGate.vue'
import LobbyView from './components/lobby/LobbyView.vue'
import YingzhouRulePicker from './components/lobby/YingzhouRulePicker.vue'
import GameTableHud from './components/table/GameTableHud.vue'
import TableGuidance from './components/table/TableGuidance.vue'
import RulesPanel from './components/RulesPanel.vue'
import SettlementOverlay from './components/settlement/SettlementOverlay.vue'
import YingzhouSettlement from './components/settlement/YingzhouSettlement.vue'
import ReplayListView from './components/replay/ReplayListView.vue'
import StatsOverlay from './components/account/StatsOverlay.vue'
import { resolveInitialTableTheme } from './components/table/three/tableThemePreference'
import { playableTheme, type TableThemeName } from './theme/themeIdentity'
import { themePresentationByName, themePresentationCssVariables } from './theme/themePresentation'
import { useAudio } from './game/core/presentation/useAudio'
import { tileName } from './game/core/rules/tiles'
import { useReplayRecorder } from './game/replay/useReplayRecorder'
import type { ReplayMatch, ReplayRound } from './game/replay/types'
import { BASE_POINTS, MODES } from './game/variants/yingzhou/rules'
import { actionKey } from './game/variants/yingzhou/engine'
import { actionLabel, NAMES, roundLabel, tailFaceUp } from './game/variants/yingzhou/presentation'
import type { YaotongHint } from './game/variants/yaotong/guidance'
import type { TileType } from './game/core/contracts/types'
import { useYingzhouGame } from './game/variants/yingzhou/useYingzhouGame'
import { gameStartupTasks, StartupModuleError } from './startup/gameStartupAssets'
import { createStartupLoader } from './startup/startupLoader'
import type { createStartupScreen } from './startup/startupScreen'
import './style.css'

const { startupScreen } = defineProps<{ startupScreen: ReturnType<typeof createStartupScreen> }>()
const startupReady = ref(false)
const url = new URL(window.location.href)
const requestedTheme = url.searchParams.get('theme')
const theme = ref(resolveInitialTableTheme(requestedTheme).theme)
function changeTheme(value: TableThemeName) {
  theme.value = playableTheme(value)
  const location = new URL(window.location.href)
  location.searchParams.set('theme', theme.value)
  window.history.replaceState(window.history.state, '', location)
}
if (requestedTheme !== null && requestedTheme !== theme.value) changeTheme(theme.value)
const presentation = computed(() => themePresentationByName(theme.value))
const { playEffect, playEffectAndWait, startBgm, preloadAudioAsset } = useAudio({ preloadEffects: false })
const load = createStartupLoader(gameStartupTasks(theme.value, preloadAudioAsset), startupScreen.update)
async function prepare() {
  try {
    await load()
    startupReady.value = true
    await nextTick()
    startupScreen.remove()
  } catch (error) {
    const reload = error instanceof AggregateError && error.errors.some(cause => cause instanceof StartupModuleError)
    startupScreen.fail('游戏资源加载失败，请重试。', reload ? () => window.location.reload() : prepare)
  }
}
onMounted(prepare)

const replay = useReplayRecorder({ meta: () => ({
  rulesetId: 'yingzhou', rulesetName: '颍州扎杠麻将', themeName: theme.value, humanSeat: 0,
}) })
const replayOpen = ref(false)
const statsOpen = ref(false)
async function loadLocalStats() {
  await replay.flush()
  const matches = (await replay.storage.list()).filter(m => m.rulesetId === 'yingzhou' && m.gameMode === 'local')
  const totals = { matches: matches.length, hands: 0, wins: 0, totalDelta: 0 }
  for (const match of matches) {
    for (const hand of await replay.storage.loadRounds(match.id)) {
      if (!hand.final || hand.final.draw) continue
      totals.hands++
      totals.wins += Number(hand.final.winSeat === match.humanSeat)
      totals.totalDelta += hand.final.scores[match.humanSeat] - hand.scoresBefore[match.humanSeat]
    }
  }
  if (!replay.storage.available) throw new Error('无法读取本机牌谱')
  return totals
}
const replayNotice = ref('')
const ReplayViewer = defineAsyncComponent(() => import('./components/replay/ReplayViewer.vue'))
const replayView = shallowRef<{ match: ReplayMatch; rounds: ReplayRound[] } | null>(null)
async function openReplay(id: string) {
  const [match, rounds] = await Promise.all([replay.storage.loadMatch(id), replay.storage.loadRounds(id)])
  if (!match || !rounds.length) { replayNotice.value = '这场回放没有可读取的牌局。'; return }
  replayView.value = { match: { ...match, themeName: playableTheme(match.themeName) }, rounds }
  replayOpen.value = false
}
const rulesOpen = ref(false)
const nextSettings = ref(false)
const resultVisible = ref(true)
const {
  round, ready, settings, length, players, phase, result, finished, actor, selectedIndex, opening, openingStage,
  dealAnimation, headDrawn, wall, autoplay, controls, mayDiscard, actionCue, prompt, waits, selectedWaits,
  winEffect, winPresentation, revealHands, winningPlayerIndex, weather, play, start, next, leave,
} = useYingzhouGame(replay, rulesOpen, { play: playEffect, playAndWait: playEffectAndWait })
const tableActive = computed(() => !!round.value && ready.value && !opening.value && !round.value.result)
const ownKongs = computed(() => controls.value.filter(option => option.kind === 'kong' && option.kong !== 'exposed'))
const kongTiles = computed(() => ownKongs.value.flatMap(option => option.kind === 'kong' ? [option.tile] : []))
function chooseKong(tile?: TileType) {
  const action = ownKongs.value.find(option => option.kind === 'kong' && option.tile === tile)
  if (action) play(action)
}
const claimPrompt = computed(() => {
  const state = round.value
  if (state?.window.kind !== 'claim' || !controls.value.length) return null
  return { type: 'claim', from: state.turn, tile: state.window.tile,
    canPeng: controls.value.some(a => a.kind === 'peng'), canGang: controls.value.some(a => a.kind === 'kong') }
})
function claim(kind: 'pass' | 'peng' | 'kong') {
  const action = controls.value.find(option => option.kind === kind)
  if (action) play(action)
}
const winButtons = computed(() => controls.value.filter(option => option.kind === 'win'))
const mayPass = computed(() => !claimPrompt.value && controls.value.some(option => option.kind === 'pass'))
const hints = computed<YaotongHint[]>(() => {
  if (!tableActive.value || autoplay.value) return []
  if (round.value!.players[0].hand.some(tile => tile.marked)) return [{
    id: 'marked', protection: true, summary: '手中留有杠后标记牌',
    reason: '标记牌可以参与杠开。普通自摸和抢补杠要先打清标记牌。', action: '可打出带“杠后”的牌，或保留它继续做杠开。三张普通牌仍可报扎。',
  }]
  if (winButtons.value.some(a => a.win.kind === 'indicator' || a.win.kind === 'nine')) return [{
    id: 'zha', protection: false, summary: '手中的三张普通牌可以报扎',
    reason: '直接报扎可以立即结算，也可以留着三张继续摸打。', action: '选择胡法即可结算。想留扎时可以过，或打出其他牌。',
  }]
  return []
})
const shownMarks = computed(() => {
  const state = round.value
  if (!state || opening.value) return []
  let hand = state.players[0].hand
  const w = state.window
  if (state.turn === 0 && (w.kind === 'check-rob' || w.kind === 'rob')) {
    const taken = hand.findIndex(t => !t.marked && t.face === w.tile)
    hand = hand.filter((_, i) => i !== taken)
  }
  const win = winPresentation.value
  if (win?.winnerIndex === 0 && !win.robbedKong) hand = hand.filter((_, i) => i !== win.sourceIndex)
  return hand.flatMap((tile, i) => tile.marked ? [i] : [])
})
const matchName = computed(() => `${length.value} 局场`)
const label = computed(() => round.value ? roundLabel(round.value) : '')
const standings = computed(() => [...players.value].sort((a, b) => b.score - a.score || a.seat - b.seat)
  .map((p, i) => ({ ...p, playerIndex: p.seat, rank: i + 1 })))
watch(result, () => { resultVisible.value = true })
watch(theme, () => { ready.value = false }, { flush: 'sync' })
function quit() {
  if (round.value?.result || window.confirm('退出将结束当前本地对局，确定返回大厅？')) leave()
}
</script>

<template>
  <OrientationGate v-if="startupReady && !replayOpen && !replayView" :theme-name="theme" />
  <main v-if="startupReady" class="game-app" :class="[{ 'is-lobby': !round }, presentation.typography.headingClass]"
    :data-table-theme="theme" :data-theme-player-frame="presentation.hud.playerFrame"
    :data-theme-particle="presentation.shell.particle" :data-theme-loading="presentation.presentation.loading"
    :style="themePresentationCssVariables(presentation)">
    <div v-if="!replayView" :class="{ 'has-three-scene': round }">
      <GameShellHeader game-mode="local" :phase="phase" :has-players="!!round" :match-name="matchName"
        :round-label="label" :honba="0" :base-score="BASE_POINTS" room-id="" :signal-quality="3" :theme-name="theme"
        @quit="quit" @open-rules="rulesOpen = true" @change-theme="changeTheme" />
      <LobbyView v-if="!round" v-model:settings="settings" v-model:length="length" :theme-name="theme"
        @start="startBgm(); start()" @open-rules="rulesOpen = true" @open-stats="statsOpen = true" @open-replay="replayNotice = ''; replayOpen = true" />
      <GameTableHud v-else :key="round.handNumber" ruleset-id="yingzhou" :theme-name="theme"
        :players="players" :user="players[0]" :phase="phase" :wall="wall" :wall-total="136" :wall-count="wall.length"
        :wall-head-drawn="headDrawn" :wall-break-index="round.breakIndex" :current-player="round.result ? -1 : actor"
        :dealer="round.dealer" :dice-thrower-index="round.dealer" :dice-values="round.dice"
        :deal-animation="dealAnimation" :opening-stage="openingStage" :last-discard="round.lastDiscard"
        :flip-tile="opening ? null : round.indicator" :tail-indicator="!opening && tailFaceUp(round) ? round.indicator : null"
        :joker-tiles="[]" :marked-indices="shownMarks" :is-user-turn="mayDiscard" :selected-index="selectedIndex"
        :table-action-event="actionCue" :action-prompt="claimPrompt" :announcement="null" :score-flow-event="null"
        :result="result" :win-effect="winEffect" :win-presentation="winPresentation" :reveal-hands="revealHands" :winning-player-index="winningPlayerIndex"
        :match-name="matchName" :round-label="label" :match-finished="finished" :turn-seconds="0"
        :user-current-waits="waits.current" :user-ting-options="waits.options" :user-discard-waits="selectedWaits"
        :user-kongs="kongTiles" :kong-action-label="ownKongs.length === 1 ? actionLabel(ownKongs[0]) : '选择杠牌'" :user-has-wind-kong="false"
        :user-can-hu="false" :extra-actions="controls.length > 0 || hints.length > 0" :kong-weather="weather"
        @gang="chooseKong" @gang-from-discard="claim('kong')" @peng="claim('peng')" @pass="claim('pass')"
        @select-tile="selectedIndex = $event" @clear-selection="selectedIndex = -1" @discard="play({ kind: 'discard', index: $event })"
        @ready="ready = true">
        <template #indicator-details>
          <span>牌墙 {{ wall.length }} 张 · 已完成 {{ round.validBefore + Number(!!result && !result.draw) }}/{{ length }} 局</span>
          <span>骰子 {{ round.dice.join(' + ') }} · {{ round.wallSide === 0 ? '本家' : NAMES[round.wallSide] }}牌墙第 {{ Math.min(...round.dice) }} 墩</span>
          <span v-if="round.settings.smallBan">小牌禁胡</span>
          <span v-if="round.openingDiscards.length">翻出的字牌入池 · {{ round.openingDiscards.map(tileName).join('、') }}</span>
          <strong role="status">{{ prompt }}</strong>
        </template>
        <template #actions>
          <button v-for="option in winButtons" :key="actionKey(option)" class="action hu hu-plan" type="button" data-action-role="major"
            :aria-label="actionLabel(option)" :title="actionLabel(option)" @click="play(option)">
            <b :class="option.win.label.length > 2 ? 'hu-plan-label' : 'action-label'">{{ option.win.label }}</b>
            <span class="action-detail">×{{ option.win.multiplier }}</span>
          </button>
          <button v-if="mayPass" class="action pass" type="button" data-action-role="danger" @click="claim('pass')"><b>过</b></button>
          <TableGuidance :hints="hints" />
        </template>
      </GameTableHud>
      <SettlementOverlay v-if="round && result" v-model:result-visible="resultVisible" :result="result"
        :result-title="result.draw ? '流局 · 庄家留庄' : NAMES[result.winnerIndex!] + ' · ' + result.winLabel"
        :match-finished="finished" :dealer="round.dealer" :waiting-next-round="false" game-mode="local" :continue-countdown="0"
        :match-name="matchName" :standings="standings" player-id="" :human-seats="[0]" :joker-tiles="[]" :theme-name="theme"
        @next-round="next" @return-to-lobby="leave">
        <template #overview>
          <YingzhouSettlement section="overview" :result="result" :players="players" :theme-name="theme"
            :indicator="round.indicator" :hand-number="round.handNumber" />
        </template>
        <template #summary>
          <YingzhouSettlement section="details" :result="result" :players="players" :theme-name="theme" :hand-number="round.handNumber" />
        </template>
        <template #next-settings><button type="button" class="secondary" @click="nextSettings = true">下局玩法 · {{ MODES[settings.mode].name }}</button></template>
      </SettlementOverlay>
      <YingzhouRulePicker v-if="nextSettings" :settings="settings" :theme-name="theme" next-hand
        @confirm="settings = $event; nextSettings = false" @close="nextSettings = false" />
    </div>
    <RulesPanel :open="rulesOpen" @close="rulesOpen = false" />
    <StatsOverlay v-model:open="statsOpen" :load-local-stats="loadLocalStats" />
    <ReplayListView v-model:open="replayOpen" :storage="replay.storage" :available="replay.available.value"
      :before-load="replay.flush" :notice="replayNotice" @view="openReplay" />
    <ReplayViewer v-if="replayView" :match="replayView.match" :rounds="replayView.rounds"
      back-label="← 返回回放列表" @close="replayView = null; replayOpen = true" />
  </main>
</template>
