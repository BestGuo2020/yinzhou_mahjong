<script setup lang="ts">
import { ref } from 'vue'
import LobbyDialog from './LobbyDialog.vue'
import { MODES, type Settings } from '../../game/variants/yingzhou/rules'
import type { TableThemeName } from '../../theme/themeIdentity'

const props = defineProps<{ settings: Settings; themeName: TableThemeName; nextHand?: boolean }>()
const emit = defineEmits<{ close: []; confirm: [settings: Settings] }>()
const draft = ref({ ...props.settings })
</script>

<template>
  <LobbyDialog :title="nextHand ? '下一局玩法' : '选择玩法'" :theme-name="themeName" @close="emit('close')">
    <fieldset class="rule-options">
      <legend>杠补方式</legend>
      <label v-for="(option, mode) in MODES" :key="mode">
        <input v-model="draft.mode" type="radio" name="kong-rule" :value="mode" />
        <span><strong>{{ option.name }}</strong><small>{{ option.description }}</small></span>
      </label>
    </fieldset>
    <label class="small-ban">
      <input v-model="draft.smallBan" type="checkbox" />
      <span><strong>小牌禁胡</strong><small>普通自摸和抢补杠的胡张须为四至九的数牌。</small></span>
    </label>
    <div class="dialog-actions">
      <button class="secondary" type="button" @click="emit('close')">取消</button>
      <button class="primary" type="button" data-action-role="primary" @click="emit('confirm', draft)">确定</button>
    </div>
  </LobbyDialog>
</template>

<style scoped>
.rule-options { display: grid; gap: 6px; padding: 0; margin: 0; border: none; }
legend { margin-bottom: 6px; color: var(--theme-text-muted); font-size: 12px; }
.rule-options label, .small-ban { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--theme-border); border-radius: 7px; cursor: pointer; }
.rule-options label:has(:checked) { border-color: var(--theme-accent); background: var(--theme-panel-elevated); }
input { accent-color: var(--theme-accent); flex: none; }
strong, small { display: block; }
small { margin-top: 2px; color: var(--theme-text-muted); font-size: 12px; }
.small-ban { margin: 10px 0; }
</style>
