<script setup lang="ts">
import { ref } from 'vue'
import { MATCH_FORMATS, MATCH_LENGTHS, type MatchLength } from '../../game/core/rules/matchFormats'

const props = defineProps<{ modelValue: MatchLength; countWins?: boolean }>()
const emit = defineEmits<{ close: []; confirm: [value: MatchLength] }>()
const pending = ref(props.modelValue)
</script>
<template>
  <div class="picker-options" :class="{ 'match-options': countWins }">
    <button
      v-for="count in MATCH_LENGTHS"
      :key="count"
      type="button"
      data-action-role="secondary"
      :class="{ active: pending === count }"
      :aria-pressed="pending === count"
      @click="pending = count"
    >
      <i aria-hidden="true"></i>
      <span>
        <b>{{ MATCH_FORMATS[count].name }}</b>
        <small v-if="countWins">{{ MATCH_FORMATS[count].winds }}，打满 {{ count }} 个有效局结束。</small>
        <small v-else>{{ count }} 庄次 · 连庄不增加庄次</small>
      </span>
    </button>
  </div>
  <p v-if="countWins" class="dialog-hint">有人胡牌才计一局，庄家连庄也算。流局由原庄重打。</p>
  <div class="dialog-actions">
    <button class="secondary" data-action-role="light" @click="emit('close')">取消</button
    ><button class="primary" data-action-role="primary" @click="emit('confirm', pending)">确定</button>
  </div>
</template>

<style scoped>
.match-options small { white-space: normal; }
@media (orientation: landscape) and (max-height: 520px) {
  .match-options { gap: 6px; }
  .match-options > button { min-height: 44px; padding: 6px 10px; }
  .match-options > button > span { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
  .match-options small { margin: 0; }
  .dialog-hint + .dialog-actions { margin-top: 8px; }
}
</style>
