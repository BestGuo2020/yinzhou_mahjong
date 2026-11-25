<script setup lang="ts">
import { ref } from 'vue'
import LobbyThemeVisual from './LobbyThemeVisual.vue'
import GameSettingsSummary from './GameSettingsSummary.vue'
import LobbyDialog from './LobbyDialog.vue'
import YingzhouRulePicker from './YingzhouRulePicker.vue'
import YaotongMatchPicker from '../yaotong/YaotongMatchPicker.vue'
import { MATCH_FORMATS, type MatchLength } from '../../game/core/rules/matchFormats'
import { MODES, type Settings } from '../../game/variants/yingzhou/rules'
import { formatCoins } from '../../game/variants/yingzhou/coins'
import type { TableThemeName } from '../../theme/themeIdentity'

defineProps<{ themeName: TableThemeName; balance: number; saveFailed: boolean }>()
const settings = defineModel<Settings>('settings', { required: true })
const length = defineModel<MatchLength>('length', { required: true })
const emit = defineEmits<{ start: []; openReplay: []; openRules: []; openStats: [] }>()
const picker = ref<'length' | 'rules' | null>(null)
const showEffectsPreview = import.meta.env.DEV
</script>

<template>
  <section class="lobby">
    <div class="lobby-layout">
      <LobbyThemeVisual :theme-name="themeName" />
      <section class="lobby-actions" aria-label="对局操作">
        <div class="coin-room">
          <span class="coin-balance" :title="balance.toLocaleString('zh-CN') + ' 金币'">累计金币 <strong>{{ formatCoins(balance) }}</strong></span>
          <div role="group" aria-label="金币场">
            <button v-for="rate in ([1, 3] as const)" :key="rate" type="button"
              :aria-pressed="(settings.coinMultiplier ?? 1) === rate" @click="settings = { ...settings, coinMultiplier: rate }">{{ rate === 3 ? '三倍场' : '普通场' }}</button>
          </div>
        </div>
        <small v-if="saveFailed" role="status">当前浏览器无法保存金币余额</small>
        <GameSettingsSummary :match-name="MATCH_FORMATS[length].name" :match-description="`${MATCH_FORMATS[length].winds} · ${length} 个庄次`"
          :rule-name="MODES[settings.mode].name" :rule-description="settings.smallBan ? '小牌禁胡已开启' : MODES[settings.mode].description"
          @select-match="picker = 'length'" @select-rule="picker = 'rules'" />
        <button type="button" class="start-button" data-action-role="primary" @click="emit('start')">
          <b>开始对局</b><span>{{ MODES[settings.mode].name }} · 底金 {{ settings.coinMultiplier === 3 ? '300万' : '100万' }}</span>
        </button>
        <div class="lobby-links">
          <a v-if="showEffectsPreview" class="text-button effects-link" :href="'?preview=win-effects&theme=' + themeName">特效预览 →</a>
          <button type="button" class="text-button" data-action-role="light" @click="emit('openStats')">我的战绩 →</button>
          <button type="button" class="text-button" data-action-role="light" data-testid="open-replay" @click="emit('openReplay')">对局回放 →</button>
          <button type="button" class="text-button" data-action-role="light" @click="emit('openRules')">游戏规则 →</button>
        </div>
      </section>
    </div>
    <YingzhouRulePicker v-if="picker === 'rules'" :settings="settings" :theme-name="themeName"
      @confirm="settings = $event; picker = null" @close="picker = null" />
    <LobbyDialog v-if="picker === 'length'" title="选择场次" variant="match" :theme-name="themeName" @close="picker = null">
      <YaotongMatchPicker :model-value="length" yingzhou @close="picker = null" @confirm="length = $event; picker = null" />
    </LobbyDialog>
  </section>
</template>

<style scoped>
.lobby-actions { min-width: 0; }
.coin-room { display: flex; width: 100%; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.coin-balance { color: var(--theme-text-muted); font-size: 13px; }
.coin-balance strong { color: var(--theme-accent-text); font-variant-numeric: tabular-nums; }
.coin-room [role="group"] { display: flex; padding: 2px; border: 1px solid var(--theme-border); border-radius: 7px; }
.coin-room button { border: 0; background: transparent; color: var(--theme-text); border-radius: 4px; padding: 5px 9px; font: inherit; font-size: 13px; cursor: pointer; }
.coin-room button[aria-pressed="true"] { background: var(--theme-button); color: var(--theme-button-text); font-weight: 700; }
.lobby-links { flex-wrap: wrap; }
.effects-link { color: var(--theme-accent); text-decoration: none; }
</style>
