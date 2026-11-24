<script setup lang="ts">
import { ref } from 'vue'
const props = defineProps<{ modelValue: 4 | 8 | 16; countWins?: boolean }>()
const emit = defineEmits<{ close: []; confirm: [value: 4 | 8 | 16] }>()
const pending = ref(props.modelValue)
</script>
<template>
  <div class="picker-options">
    <button
      v-for="count in [4, 8, 16] as const"
      :key="count"
      type="button"
      data-action-role="secondary"
      :class="{ active: pending === count }"
      :aria-pressed="pending === count"
      @click="pending = count"
    >
      <i aria-hidden="true"></i
      ><span
        ><b>{{ countWins ? count + ' 局' : { 4: '东风场', 8: '半庄场', 16: '全庄场' }[count] }}</b
        ><small>{{ countWins ? '胡牌计一局，流局留庄重打' : count + ' 庄次 · 连庄不增加庄次' }}</small></span
      >
    </button>
  </div>
  <div class="dialog-actions">
    <button class="secondary" data-action-role="light" @click="emit('close')">取消</button
    ><button class="primary" data-action-role="primary" @click="emit('confirm', pending)">确定</button>
  </div>
</template>
