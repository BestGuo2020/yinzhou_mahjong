<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import MahjongTile from '../MahjongTile.vue'
import { isHorseForSeat } from '../../game/core/rules/tiles'
import { defaultAvatarForSeat } from '../../game/core/presentation/avatar'
import type { RoundResult } from '../../game/core/contracts/gamePort'
import { displayPoints } from '../../game/variants/yingzhou/coins'
import type { GamePlayer, TileType } from '../../game/core/contracts/types'
import type { RuleVariant } from '../../game/core/rules/ruleVariants'
import type { GameMode } from '../../game/core/contracts/activeGamePort'
import type { TableThemeName } from '../table/three/tableTheme'
import { animeAvatarForPlayer } from '../../game/core/presentation/animeAvatarPresentation'
import { displayImageSrc } from '../../game/core/presentation/imagePreload'
import { animeCharacterAccent } from '../../game/core/presentation/animeCharacterPalette'
import {
  resolveRoundResultPresentation,
  type RoundResultPresentationKind,
} from '../../theme/themeEventPresentation'

type Standing = GamePlayer & { playerIndex: number; rank: number }

interface Props {
  result: RoundResult | null
  resultTitle?: string
  roundLabel?: string
  rulesetId?: RuleVariant
  resultVisible: boolean
  matchFinished: boolean
  dealer: number
  waitingNextRound: boolean
  gameMode: GameMode
  continueCountdown: number
  matchName: string
  standings: Standing[]
  playerId: string
  /** 真人座位集合：仅这些座位在多人结算页显示举报按钮（AI 补位不显示）。 */
  humanSeats?: number[]
  jokerTiles?: TileType[]
  wildcardTiles?: TileType[]
  themeName?: TableThemeName
}

const props = defineProps<Props>()
function amount(points: number, signed = false) {
  return displayPoints(points, props.result?.coinMultiplier, signed)
}
const unit = computed(() => props.result?.coinMultiplier ? '金币' : '分')
defineEmits<{
  'update:resultVisible': [value: boolean]
  nextRound: []
  returnToLobby: []
  report: [name: string]
}>()

function onAvatarError(entry?: { avatar?: string; seat?: number; fallbackAvatar?: string }) {
  if (!entry) return
  const target = entry.fallbackAvatar ?? (entry.seat != null ? defaultAvatarForSeat(entry.seat) : '')
  if (target && entry.avatar !== target) entry.avatar = target
}

function displayedAvatar(entry?: {
  avatar?: string
  characterId?: string
  playerKind?: 'human' | 'llm' | 'bot'
  isLlm?: boolean
}) {
  if (!entry?.avatar) return ''
  // 结算名单每局重建：已物化的头像用本地 blob，避免每次重建都做一次协商校验（实测 0.5~1.9s）。
  return displayImageSrc(props.themeName === 'llmAnime'
    ? animeAvatarForPlayer({
      avatar: entry.avatar,
      characterId: entry.characterId,
      playerKind: entry.playerKind,
      isLlm: entry.isLlm,
    })
    : entry.avatar)
}

function animeEntryStyle(entry?: { characterId?: string }) {
  return props.themeName === 'llmAnime'
    ? { '--anime-accent': animeCharacterAccent(entry?.characterId) }
    : undefined
}

const resultKindLabCandidate = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('resultKindLab') as RoundResultPresentationKind | null
  : null
const resultKindLabValues = new Set<RoundResultPresentationKind>([
  'draw', 'self-draw', 'discard', 'robbed-kong', 'tianhu', 'dihu',
])
const resultKindLab = ref(resultKindLabCandidate && resultKindLabValues.has(resultKindLabCandidate)
  ? resultKindLabCandidate
  : null)
const finalRankingLab = ref(import.meta.env.DEV && new URLSearchParams(window.location.search).has('finalRankLab'))
const rankingResult = shallowRef<RoundResult | null>(null)
const showRanking = computed(() => finalRankingLab.value
  || Boolean(props.result && props.matchFinished && rankingResult.value === props.result))
const restoredSettlement = ref(false)
const activeTab = ref<'overview' | 'details'>('overview')
const rankedScoreChanges = computed(() => [...(props.result?.scoreChanges ?? [])].sort((a, b) => a.rank - b.rank))
const tabId = useId()
function onTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  activeTab.value = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'details'
    : activeTab.value === 'overview' ? 'details' : 'overview'
  const tabs = (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')
  tabs[activeTab.value === 'overview' ? 0 : 1]?.focus()
}
let trackedResult: RoundResult | null = null
let trackedResultWasOpened = false

watch([() => props.result, () => props.resultVisible, showRanking], ([result, visible, ranking]) => {
  if (result !== trackedResult) {
    trackedResult = result
    trackedResultWasOpened = false
    restoredSettlement.value = false
    activeTab.value = 'overview'
    rankingResult.value = null
  }
  if (!result || !visible || ranking) return
  restoredSettlement.value = trackedResultWasOpened
  trackedResultWasOpened = true
}, { immediate: true })
type ResultKindLabWindow = Window & {
  __setRoundResultKindLab?: (kind: RoundResultPresentationKind | null) => void
  __setFinalRankingLab?: (active: boolean) => void
}
const resultKindLabWindow = window as ResultKindLabWindow
const setRoundResultKindLab = (kind: RoundResultPresentationKind | null) => {
  resultKindLab.value = kind && resultKindLabValues.has(kind) ? kind : null
}
if (import.meta.env.DEV) resultKindLabWindow.__setRoundResultKindLab = setRoundResultKindLab
const setFinalRankingLab = (active: boolean) => { finalRankingLab.value = Boolean(active) }
if (import.meta.env.DEV) resultKindLabWindow.__setFinalRankingLab = setFinalRankingLab
onBeforeUnmount(() => {
  if (resultKindLabWindow.__setRoundResultKindLab === setRoundResultKindLab) {
    delete resultKindLabWindow.__setRoundResultKindLab
  }
  if (resultKindLabWindow.__setFinalRankingLab === setFinalRankingLab) {
    delete resultKindLabWindow.__setFinalRankingLab
  }
})
const resultPresentation = computed(() => {
  if (!resultKindLab.value) return resolveRoundResultPresentation(props.result)
  return resultKindLab.value === 'draw'
    ? resolveRoundResultPresentation({ draw: true })
    : resolveRoundResultPresentation({ winType: resultKindLab.value })
})
const heading = computed(() => [
  props.roundLabel ?? props.result?.roundLabel,
  props.resultTitle ?? resultPresentation.value.label,
].filter(Boolean).join(' · '))
const paymentDetail = computed(() => {
  if (props.rulesetId !== 'yingzhou') return null
  const payers = props.result?.scoreChanges?.filter(entry => entry.delta < 0) ?? []
  const [first] = payers
  if (payers.length === 1) return { label: first.name + '包付', points: -first.delta }
  if (payers.length === 3 && payers.every(entry => entry.delta === first.delta)) {
    return { label: '三家各付', points: -first.delta }
  }
  return null
})

/** 胡牌者相对庄家的座位：0=庄家(A) / 1=下家(B) / 2=对家(C) / 3=上家(D)。 */
const relativeSeat = computed<0 | 1 | 2 | 3>(() => {
  const winner = props.result?.winnerIndex
  if (winner == null) return 0
  return ((winner - props.dealer + 4) % 4) as 0 | 1 | 2 | 3
})
</script>

<template>
  <Transition :name="showRanking ? 'final-board' : 'modal'" mode="out-in">
    <div
      v-if="result && resultVisible && !showRanking"
      key="round"
      class="result-backdrop round-settlement"
      :class="[`result-${resultPresentation.kind}`, { 'is-restored': restoredSettlement }]"
      :data-result-kind="resultPresentation.kind"
      :data-result-strength="resultPresentation.strength"
      :data-result-source="resultKindLab ? 'lab' : 'game'"
      :data-settlement-state="restoredSettlement ? 'restored' : 'entering'"
    >
      <section
        class="result-card settlement-card"
        :data-ruleset="rulesetId"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${tabId}-round-title`"
        :class="[`result-${resultPresentation.kind}`, { 'has-round-overview': Boolean($slots.overview) }]"
        :data-result-kind="resultPresentation.kind"
        :data-result-strength="resultPresentation.strength"
        :data-result-source="resultKindLab ? 'lab' : 'game'"
      >
        <header v-if="$slots.overview" class="settlement-header">
          <h2 :id="`${tabId}-round-title`">{{ heading }}</h2>
          <div class="settlement-tabs" role="tablist" aria-label="结算内容" @keydown="onTabKeydown">
            <button :id="`${tabId}-overview-tab`" type="button" role="tab" :aria-selected="activeTab === 'overview'" :aria-controls="`${tabId}-overview`" :tabindex="activeTab === 'overview' ? 0 : -1" @click="activeTab = 'overview'">概览</button>
            <button :id="`${tabId}-details-tab`" type="button" role="tab" :aria-selected="activeTab === 'details'" :aria-controls="`${tabId}-details`" :tabindex="activeTab === 'details' ? 0 : -1" @click="activeTab = 'details'">分数明细</button>
          </div>
        </header>
        <h2 v-else :id="`${tabId}-round-title`">{{ heading }}</h2>
        <div
          v-show="!$slots.overview || activeTab === 'overview'"
          :id="`${tabId}-overview`"
          :role="$slots.overview ? 'tabpanel' : undefined"
          :aria-labelledby="$slots.overview ? `${tabId}-overview-tab` : undefined"
          :tabindex="$slots.overview ? 0 : undefined"
          class="settlement-overview-panel"
        >
          <slot name="overview"><slot name="summary" /></slot>
          <div v-if="!$slots.summary && resultPresentation.kind !== 'draw'" class="score-total">
            <span>总倍数</span><strong>×{{ result.totalMultiplier ?? result.multiplier }}</strong>
            <em :title="result.winner ? result.winner + '本局共得' : undefined">{{ amount(result.totalWon ?? result.points * 3, true) }} {{ unit }}</em>
          </div>
          <div v-if="!$slots.summary && resultPresentation.kind !== 'draw' && (result.details?.length || paymentDetail)"
            class="score-details" role="group" aria-label="计分明细">
            <span v-for="(detail, index) in result.details" :key="detail.label">
              {{ detail.label }} <b v-if="detail.points != null">+{{ detail.points }} 分</b>
              <b v-else-if="rulesetId === 'yingzhou' && index > 0">+{{ detail.multiplier }} 倍</b>
              <b v-else>×{{ detail.multiplier }}</b>
            </span>
            <span v-if="paymentDetail">{{ paymentDetail.label }} <b>{{ amount(paymentDetail.points) }} {{ unit }}</b></span>
          </div>
          <div v-if="resultPresentation.kind !== 'draw' && result.horses?.length" class="horse-area">
            <div>
              <MahjongTile v-for="(tile, index) in result.horses" :key="index" :tile="tile" :joker-tiles="jokerTiles" :wildcard-tiles="wildcardTiles" :theme-name="themeName" :class="{ 'horse-hit': isHorseForSeat(tile, relativeSeat) }" small disabled />
            </div>
          </div>
          <div class="round-rankings">
            <article v-for="entry in rankedScoreChanges" :key="entry.playerIndex" :class="{ winner: entry.playerIndex === result.winnerIndex, self: Boolean($slots.overview) && entry.playerIndex === 0 }" :style="animeEntryStyle(entry)">
              <strong class="rank-number">{{ entry.rank }}<small>位</small></strong>
              <img :src="displayedAvatar(entry)" :alt="`${entry.name}头像`" @error="onAvatarError(entry)" />
              <span class="player-line">
                {{ entry.name }}
                <i v-if="$slots.overview && entry.playerIndex === 0" class="mark self-mark">本家</i>
                <i v-if="entry.playerIndex === dealer" class="mark dealer">庄</i>
                <i v-if="result.draw && result.tenpai?.includes(entry.playerIndex)" class="mark tenpai">听</i>
              </span>
              <em :title="result.coinMultiplier ? '本局金币' : '本局得分'" :class="{ positive: entry.delta > 0, negative: entry.delta < 0 }"><small v-if="$slots.overview" class="rank-score-label">本局</small>{{ amount(entry.delta, true) }}</em>
              <b :title="result.coinMultiplier ? '本场净金币' : '累计得分'"><small v-if="$slots.overview" class="rank-score-label">累计</small>{{ amount(entry.score) }}</b>
            </article>
          </div>
        </div>
        <div v-if="$slots.overview" v-show="activeTab === 'details'" :id="`${tabId}-details`" role="tabpanel" :aria-labelledby="`${tabId}-details-tab`" tabindex="0" class="settlement-details-panel">
          <slot name="summary" />
        </div>
        <div class="settlement-footer">
          <div class="result-actions">
            <button class="secondary" @click="$emit('update:resultVisible', false)">查看牌桌</button>
            <button v-if="matchFinished" @click="rankingResult = result">查看最终排名</button>
            <button v-else :disabled="waitingNextRound" @click="$emit('nextRound')">
              <template v-if="waitingNextRound">等待其他玩家确定...</template>
              <template v-else>继续<template v-if="gameMode === 'remote' && continueCountdown > 0"> ({{ continueCountdown }})</template></template>
            </button>
          </div>
          <p class="result-disclaimer-note">游戏结果禁止用于赌博行为</p>
        </div>
      </section>
    </div>
    <div v-else-if="showRanking && (resultVisible || finalRankingLab)" key="ranking" class="result-backdrop final-backdrop" data-result-kind="final" data-result-strength="climax">
      <section class="final-board" role="dialog" aria-modal="true" :aria-labelledby="`${tabId}-ranking-title`"
        data-result-kind="final" data-result-strength="climax" :data-result-source="finalRankingLab ? 'lab' : 'game'">
        <p>{{ matchName }} · 对局结束</p>
        <h2 :id="`${tabId}-ranking-title`">最终排名</h2>
        <div class="final-ranking-panel">
          <div class="final-rankings">
            <article v-for="entry in standings" :key="entry.playerIndex" :class="[`rank-${entry.rank}`, { self: entry.playerIndex === 0 }]" :style="animeEntryStyle(entry)">
              <div class="final-rank"><b>{{ entry.rank }}</b><span>位</span></div>
              <img :src="displayedAvatar(entry)" :alt="`${entry.name}头像`" @error="onAvatarError(entry)" />
              <div class="final-name">
                <strong>{{ entry.name }}</strong>
                <small v-if="entry.playerIndex === 0 && entry.name !== '你'">你</small>
                <button
                  v-if="gameMode === 'remote' && entry.playerIndex !== 0 && playerId && humanSeats?.includes(entry.playerIndex)"
                  class="report-link" @click="$emit('report', entry.name)"
                >举报</button>
              </div>
              <em :title="result?.coinMultiplier ? '本场净金币' : '本场累计积分'" :aria-label="`累计${amount(entry.score)}${unit}`">{{ amount(entry.score) }}</em>
            </article>
          </div>
        </div>
        <div class="settlement-footer final-footer">
          <button v-if="result && !finalRankingLab" type="button" @click="rankingResult = null">查看本局结算</button>
          <button type="button" @click="$emit('returnToLobby')">返回大厅</button>
          <p class="result-disclaimer-note">游戏结果禁止用于赌博行为</p>
        </div>
      </section>
    </div>
  </Transition>

  <button v-if="result && !resultVisible && !finalRankingLab" type="button" class="result-reopen" @click="$emit('update:resultVisible', true)">
    {{ showRanking ? '查看最终排名' : '查看结算' }}
  </button>
  <button
    v-if="gameMode === 'remote' && result && !resultVisible && !matchFinished"
    class="result-reopen continue"
    :disabled="waitingNextRound"
    @click="$emit('nextRound')"
  ><template v-if="waitingNextRound">等待其他玩家确定...</template><template v-else>继续<template v-if="continueCountdown > 0"> ({{ continueCountdown }})</template></template></button>
</template>

<style scoped>
.settlement-card[data-ruleset="yingzhou"] {
  padding: clamp(22px, 4.5cqh, 34px) 0 0;
  scrollbar-gutter: auto;
}
.settlement-card[data-ruleset="yingzhou"] > h2 { margin-inline: 16px; line-height: 1.2; }
.settlement-card[data-ruleset="yingzhou"] .score-details { padding-inline: 15px; }
.settlement-card[data-ruleset="yingzhou"] .score-total + .round-rankings { margin-top: clamp(12px, 2.5cqh, 20px); }
.settlement-card[data-ruleset="yingzhou"] .settlement-footer {
  margin: clamp(12px, 2.5cqh, 20px) 0 0;
  padding: 10px 15px max(10px, var(--safe-bottom));
}
.settlement-card[data-ruleset="yingzhou"] .result-actions { margin: 0; }
.settlement-card[data-ruleset="yingzhou"] .result-actions button { flex: 0 1 170px; min-width: 0; }
.settlement-card[data-ruleset="yingzhou"] .result-disclaimer-note { margin: 10px 0 0; }
@container game (max-height: 460px) {
  .settlement-card[data-ruleset="yingzhou"] { padding-top: 10px; }
  .settlement-card[data-ruleset="yingzhou"] > h2 { margin-bottom: 5px; font-size: clamp(20px, 6cqh, 26px); }
  .settlement-card[data-ruleset="yingzhou"] .score-total strong { font-size: clamp(28px, 8.5cqh, 38px); }
  .settlement-card[data-ruleset="yingzhou"] .score-total + .round-rankings { margin-top: 8px; }
  .settlement-card[data-ruleset="yingzhou"] .settlement-footer { margin-top: 8px; padding-block: 6px max(6px, var(--safe-bottom)); }
  .settlement-card[data-ruleset="yingzhou"] .result-actions button { flex-basis: 132px; }
  .settlement-card[data-ruleset="yingzhou"] .result-disclaimer-note { margin-top: 5px; }
}
</style>
