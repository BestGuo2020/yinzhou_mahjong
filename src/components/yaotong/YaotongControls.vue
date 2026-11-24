<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { YAOTONG_EMOTES, type YaotongEmoteId } from '../../game/variants/yaotong/emotes'
import type { YaotongEmotes } from './useYaotongEmotes'
import type { useYaotongPort } from '../../game/variants/yaotong/useYaotongPort'
import TableGuidance from '../table/TableGuidance.vue'
import YaotongEmoteArt from './YaotongEmoteArt.vue'
const props = defineProps<{
  game: ReturnType<typeof useYaotongPort>
  emotes?: YaotongEmotes
  sendEmote: (emote: YaotongEmoteId) => void
}>()
const declarationLabel = computed(() => props.game.declarationArmed.value ? '取消报听' : '报听')
const emoteDialog = ref<HTMLDialogElement | null>(null)
const emoteTitleId = useId()
const emoteTargetSeat = computed(() => props.emotes?.targetSeat.value ?? null)
const emoteTargetPlayer = computed(() => emoteTargetSeat.value === null
  ? null
  : props.game.players?.[emoteTargetSeat.value] ?? null)
const emoteTitle = computed(() => emoteTargetPlayer.value
  ? `对 ${emoteTargetPlayer.value.name} 使用互动道具`
  : '互动道具')
function closeEmotePanel() {
  props.emotes?.cancel()
}
function closeEmoteFromBackdrop(event: MouseEvent) {
  if (event.target !== emoteDialog.value) return
  const rect = emoteDialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    closeEmotePanel()
}
function onEmoteDialogClose() {
  if (!emoteDialog.value?.open) props.emotes?.cancel()
}
watch([emoteDialog, emoteTargetSeat], ([modal, seat]) => {
  if (!modal) return
  if (seat === null && modal.open) modal.close()
  if (seat !== null && !modal.open) modal.showModal()
}, { flush: 'post' })
onBeforeUnmount(() => props.emotes?.cancel())
</script>
<template>
  <template v-if="!game.local.autoplay.value">
    <button v-if="game.local.hardControls.value && (game.local.holding.value || game.local.waitRemainingMs.value <= 0) && !game.winPlans.value.length"
      class="action hu" data-action-role="major" @click="game.userHu()"><b>胡</b></button>
    <button v-for="plan in (game.local.hardControls.value && !game.local.holding.value && game.local.waitRemainingMs.value > 0 ? [] : game.winPlans.value)" :key="plan.key" class="action hu hu-plan" data-action-role="major"
      :aria-label="`胡${plan.label}`" :title="`本牌 ${plan.value.naturalYaos} 张 · 赖子 ${plan.value.wildcards} 张`"
      @click="game.confirmHuPlan(plan.key)">
      <b class="hu-plan-label"><span v-for="pattern in plan.label.split('＋')" :key="pattern">{{ pattern }}</span></b>
      <span class="action-detail">本{{ plan.value.naturalYaos }}·赖{{ plan.value.wildcards }}</span>
    </button>
    <button v-if="game.local.holding.value" class="action pass" data-action-role="secondary" @click="game.local.passHold()"><b>过</b></button>
    <span v-if="game.local.holding.value" class="wait-budget" role="timer" aria-label="本小局剩余等待时间">{{ Math.ceil(game.local.waitRemainingMs.value / 1000) }}秒</span>
    <template v-if="!game.local.holding.value && game.original.value && game.local.waiting.value.length">
      <span v-if="game.local.decisionSeconds.value > 0" class="wait-budget" role="timer" aria-label="原报操作剩余时间"
        title="操作超时后由 AI 代操作一次">操作 {{ game.local.decisionSeconds.value }}秒</span>
      <button
        class="action hu"
        data-action-role="major"
        @click="game.local.dispatch({ type: 'original', declare: true })"
      >
        <b class="action-label">原报</b>
      </button>
      <button
        class="action primary"
        data-action-role="primary"
        @click="game.local.dispatch({ type: 'original', declare: false })"
      >
        <b class="action-label action-label-small">不原报</b>
      </button>
    </template>
    <button
      v-if="!game.local.holding.value && game.canArmDeclaration.value"
      class="action primary action-declare"
      data-action-role="primary"
      :aria-label="declarationLabel"
      :title="declarationLabel"
      :aria-pressed="game.declarationArmed.value"
      @click="game.declarationArmed.value = !game.declarationArmed.value"
    >
      <b>{{ declarationLabel }}</b>
    </button>
  </template>
  <template v-if="emotes">
    <dialog ref="emoteDialog" class="yaotong-control-dialog emote-dialog" :aria-labelledby="emoteTitleId"
      @close="onEmoteDialogClose" @click="closeEmoteFromBackdrop">
      <header>
        <h2 :id="emoteTitleId">{{ emoteTitle }}</h2>
        <button type="button" class="yaotong-control-dialog-close" aria-label="关闭互动道具" @click="closeEmotePanel">×</button>
      </header>
      <div class="emote-grid">
        <button v-for="emote in YAOTONG_EMOTES" :key="emote.id" type="button" :data-emote-choice="emote.id"
          @click="sendEmote(emote.id)">
          <YaotongEmoteArt :kind="emote.id" :size="46" />
          <span>{{ emote.label }}</span>
        </button>
      </div>
    </dialog>
  </template>
  <TableGuidance :hints="game.guidance.value" />
  <span v-if="!game.guidance.value.length && game.local.mode.value === 'hard' && game.risk.value" class="yaotong-action-note danger" role="status"
    :title="game.risk.value" :aria-label="game.risk.value">{{ game.local.response.value?.mandatory || game.local.self.value?.mandatory ? '必胡' : '过手' }}</span>
  <span v-if="game.local.state.value?.dice[0] === game.local.state.value?.dice[1]" class="yaotong-double"
    title="骰子同点，本局双倍">×2</span
  >
</template>
<style scoped>
.wait-budget { color: var(--theme-accent-text); font-size: 13px; font-variant-numeric: tabular-nums; }
.emote-dialog { --dialog-width: 390px; }
.emote-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--theme-border); }
.emote-dialog h2 { margin: 0; font-size: 18px; color: var(--theme-accent-text); }
.emote-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 14px; }
.emote-grid button { display: grid; justify-items: center; align-content: center; gap: 4px; min-height: 86px; padding: 8px 4px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-button); color: var(--theme-button-text); font: inherit; font-size: 12px; cursor: pointer; }
.emote-grid button:hover, .emote-grid button:focus-visible { border-color: var(--theme-accent); background: color-mix(in srgb, var(--theme-accent) 16%, var(--theme-button)); }
.emote-grid button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
@media (max-width: 430px) {
  .emote-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 10px; }
  .emote-grid button { min-height: 72px; padding: 5px 2px; font-size: 11px; }
}
@media (max-height: 520px) {
  .emote-dialog header { padding: 6px 14px; }
  .emote-grid { padding: 8px 10px; }
  .emote-grid button { min-height: 68px; }
}
.yaotong-action-note {
  max-width: 220px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--theme-accent-text);
  padding: 5px 9px;
  background: var(--theme-panel);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
}
.yaotong-action-note.danger {
  color: var(--theme-danger, #ffbd9a);
}
.yaotong-double {
  font-size: 12px;
  font-weight: 700;
  color: var(--theme-accent-text);
}
@media (hover: hover) and (pointer: fine) {
  @container game (min-width: 1000px) and (min-height: 560px) {
    .yaotong-double { font-size: clamp(12px, .88cqw, 18px); }
  }
}
@container (max-width:700px) {
  .yaotong-action-note {
    font-size: 10px;
    max-width: 130px;
  }
  .yaotong-double {
    font-size: 10px;
  }
}
</style>
