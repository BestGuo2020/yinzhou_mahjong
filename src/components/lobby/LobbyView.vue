<script setup lang="ts">
import { ref } from 'vue'
import LobbyThemeVisual from './LobbyThemeVisual.vue'
import GameSettingsSummary from './GameSettingsSummary.vue'
import LobbyDialog from './LobbyDialog.vue'
import YingzhouRulePicker from './YingzhouRulePicker.vue'
import { MODES, type Settings } from '../../game/variants/yingzhou/rules'
import type { TableThemeName } from '../../theme/themeIdentity'

defineProps<{ themeName: TableThemeName }>()
const settings = defineModel<Settings>('settings', { required: true })
const length = defineModel<4 | 8 | 16>('length', { required: true })
const emit = defineEmits<{ start: []; openReplay: []; openRules: [] }>()
const picker = ref<'length' | 'rules' | null>(null)
const lengths = [4, 8, 16] as const
</script>

<template>
  <section class="lobby">
    <div class="lobby-layout">
      <LobbyThemeVisual :theme-name="themeName" />
      <section class="lobby-actions" aria-label="对局操作">
        <GameSettingsSummary :match-name="length + ' 局'" match-description="胡牌计一局，流局留庄重打"
          :rule-name="MODES[settings.mode].name" :rule-description="settings.smallBan ? '小牌禁胡已开启' : MODES[settings.mode].description"
          @select-match="picker = 'length'" @select-rule="picker = 'rules'" />
        <button type="button" class="start-button" data-action-role="primary" @click="emit('start')">
          <b>开始对局</b><span>{{ MODES[settings.mode].name }} · 底分 10 分</span>
        </button>
        <div class="lobby-links">
          <button type="button" class="text-button" data-action-role="light" data-testid="open-replay" @click="emit('openReplay')">对局回放 →</button>
          <button type="button" class="text-button" data-action-role="light" @click="emit('openRules')">游戏规则 →</button>
        </div>
      </section>
    </div>
    <YingzhouRulePicker v-if="picker === 'rules'" :settings="settings" :theme-name="themeName"
      @confirm="settings = $event; picker = null" @close="picker = null" />
    <LobbyDialog v-if="picker === 'length'" title="选择场次" :theme-name="themeName" @close="picker = null">
      <div class="length-options">
        <button v-for="count in lengths" :key="count" type="button" :aria-pressed="count === length"
          @click="length = count; picker = null">{{ count }} 局</button>
      </div>
    </LobbyDialog>
  </section>
</template>

<style scoped>
.lobby-actions { min-width: 0; }
.length-options { display: flex; gap: 8px; }
.length-options button { flex: 1; padding: 12px 6px; border: 1px solid var(--theme-border); border-radius: 6px; background: var(--theme-panel); color: var(--theme-text); font: inherit; cursor: pointer; }
.length-options button[aria-pressed="true"] { color: var(--theme-accent-text); border-color: var(--theme-accent); }
</style>
