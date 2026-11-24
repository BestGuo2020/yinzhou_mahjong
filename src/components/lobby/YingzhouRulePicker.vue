<script setup lang="ts">
import { ref } from 'vue'
import LobbyDialog from './LobbyDialog.vue'
import { MODES, type Settings } from '../../game/variants/yingzhou/rules'
import type { TableThemeName } from '../../theme/themeIdentity'

const props = defineProps<{ settings: Settings; themeName: TableThemeName }>()
const emit = defineEmits<{ close: []; confirm: [settings: Settings] }>()
const draft = ref({ ...props.settings })
</script>

<template>
  <LobbyDialog title="选择玩法" variant="mode" :theme-name="themeName" @close="emit('close')">
    <div class="picker-options rule-options" role="group" aria-label="杠补方式">
      <button v-for="(option, mode) in MODES" :key="mode" type="button" data-action-role="secondary"
        :class="{ active: draft.mode === mode }" :aria-pressed="draft.mode === mode" @click="draft.mode = mode">
        <i aria-hidden="true"></i><span><b>{{ option.name }}</b><small>{{ option.description }}</small></span>
      </button>
    </div>
    <label class="remote-llm-create-option small-ban">
      <input v-model="draft.smallBan" type="checkbox" />
      <span><b>小牌禁胡</b><small>自摸和抢补杠的胡张须为四至九的数牌。</small></span>
    </label>
    <div class="dialog-actions">
      <button class="secondary" type="button" data-action-role="light" @click="emit('close')">取消</button>
      <button class="primary" type="button" data-action-role="primary" @click="emit('confirm', draft)">确定</button>
    </div>
  </LobbyDialog>
</template>

<style scoped>
.rule-options small { white-space: normal; }
@media (orientation: landscape) and (max-height: 520px) {
  .rule-options { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .rule-options > button { gap: 8px; padding: 10px; }
}
</style>
