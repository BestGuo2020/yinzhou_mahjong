<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import TableControlIcon from './TableControlIcon.vue'
import type { YaotongHint } from '../../game/variants/yaotong/guidance'

const props = defineProps<{ hints: YaotongHint[] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const helpOpen = ref(false)
const helpId = useId()
const hasProtectionHint = computed(() => props.hints.some((hint) => hint.protection))
const helpTitle = computed(() => hasProtectionHint.value ? '系统防护' : '操作提示')
function openHelp() {
  dialog.value?.showModal()
  helpOpen.value = Boolean(dialog.value?.open)
}
function closeHelp() { dialog.value?.close(); helpOpen.value = false }
function closeFromBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const rect = dialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    closeHelp()
}
watch(() => props.hints.map((hint) => hint.id).join(','), closeHelp)
</script>

<template>
  <template v-if="hints.length">
    <button type="button" class="action yaotong-help-trigger" data-action-role="secondary"
      :title="helpTitle" :aria-label="helpTitle" :aria-describedby="`${helpId}-summary`"
      :aria-expanded="helpOpen" :aria-controls="helpId" aria-haspopup="dialog" @click="openHelp">
      <TableControlIcon :name="hasProtectionHint ? 'protection' : 'hint'" />
    </button>
    <span :id="`${helpId}-summary`" class="help-summary" role="status">{{ hints[0]?.summary }}</span>
    <dialog ref="dialog" :id="helpId" class="yaotong-control-dialog yaotong-help-dialog" :aria-labelledby="`${helpId}-title`"
      @close="helpOpen = false" @click="closeFromBackdrop">
      <header><h2 :id="`${helpId}-title`">{{ helpTitle }}</h2>
        <button type="button" class="yaotong-control-dialog-close" aria-label="关闭提示" @click="closeHelp">×</button>
      </header>
      <div class="yaotong-help-content">
        <article v-for="hint in hints" :key="hint.id">
          <h3>{{ hint.summary }}</h3>
          <p>{{ hint.reason }}</p>
          <p class="help-action"><b>现在怎么做</b>{{ hint.action }}</p>
          <p v-if="hint.release"><b>何时解除</b>{{ hint.release }}</p>
        </article>
      </div>
      <footer><button type="button" class="help-confirm" autofocus @click="closeHelp">知道了</button></footer>
    </dialog>
  </template>
</template>
<style scoped>
.help-summary { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.yaotong-help-dialog { --dialog-width: 480px; --dialog-radius: 12px; }
.yaotong-help-dialog button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 3px; }
.yaotong-help-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--theme-border); }
.yaotong-help-dialog h2 { margin: 0; font-size: 19px; color: var(--theme-accent-text); }
.yaotong-help-content { padding: 0 18px; }
.yaotong-help-content article { padding: 14px 0; }
.yaotong-help-content article + article { border-top: 1px solid var(--theme-border); }
.yaotong-help-content h3 { margin: 0 0 8px; font-size: 15px; color: var(--theme-accent-text); }
.yaotong-help-content p { margin: 7px 0 0; font-size: 13px; line-height: 1.7; }
.yaotong-help-content p b { display: block; margin-bottom: 2px; }
.yaotong-help-dialog footer { display: flex; justify-content: flex-end; padding: 0 18px 14px; }
.help-confirm { min-width: 90px; min-height: 40px; padding: 8px 18px; border: 1px solid var(--theme-border); border-radius: 6px; background: var(--theme-button); color: var(--theme-button-text); font-weight: 700; cursor: pointer; }
@media (max-height: 520px) {
  .yaotong-help-dialog header { padding: 6px 14px; }
  .yaotong-help-content { padding: 0 14px; }
  .yaotong-help-content article { padding: 10px 0; }
  .yaotong-help-content p { font-size: 12px; line-height: 1.5; }
}
</style>
