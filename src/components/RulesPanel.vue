<script setup lang="ts">
import { ref, useId } from 'vue'
import { DISCLAIMER_SECTIONS, DISCLAIMER_TITLE } from '../content/disclaimer'
import TableControlIcon from './table/TableControlIcon.vue'
defineProps<{ open: boolean }>()
defineEmits(['close'])

const sourceDialog = ref<HTMLDialogElement | null>(null)
const sourceId = useId()
const sourceHtml = ref<string | null>(null)
const sourceLoadFailed = ref(false)

const sourceTitle = ref('')
async function openRulesSource(kind: 'complete' | 'beginner') {
  if (!sourceDialog.value || sourceDialog.value.open) return
  sourceTitle.value = kind === 'complete' ? '完整规则原文' : '新手规则与牌例'
  sourceHtml.value = null
  sourceLoadFailed.value = false
  sourceDialog.value.showModal()
  try {
    sourceHtml.value = (await import('../content/yingzhouRulesHtml')).rulesHtml[kind]
  } catch {
    sourceLoadFailed.value = true
  }
}

const rules = [
  ['起牌与亮牌', '136 张牌，首局随机定庄。双骰之和选墙，小点选起拿的墩。庄家拿 14 张，闲家各拿 13 张，然后翻亮墙尾。'],
  ['摸、碰、杠', '普通弃牌可碰或明杠。手中四张普通牌可暗杠，已有碰牌再摸到第四张可补杠。顺子靠自摸凑齐。'],
  ['三种杠补', '活杠拿走亮牌，先判杠开，再翻新亮牌。死杠生成同牌面的标记牌。死九把墙尾字牌依次放入牌池，开杠时补亮牌花色的标记九。'],
  ['扎亮牌与扎九', '手里三张普通亮牌可直接报扎，算 3 倍。死九另可用三张同花色普通九报扎，算 2 倍。重合取高。可以留扎，在自己回合再报；活杠翻新亮牌时可当场报扎。'],
  ['自摸和抢补杠', '普通胡须四面子一对将。只抢补杠，从补杠者下家起依次询问。小牌禁胡开启时，自摸与抢胡的胡张须为四至九的数牌。'],
  ['杠后标记', '标记可以参与杠开。留有标记时仍可报扎，但自摸和抢杠须先打清标记。打出的标记牌直接入池。'],
  ['计分与轮庄', '底分 10。自摸 1 倍，明杠或补杠开花 2 倍，暗杠开花 3 倍。留扎和旧标记按规则加倍。抢补杠由被抢者独付 60 分。赢家坐庄，流局留庄且不计有效局数。'],
]
</script>

<template>
  <Transition name="panel">
    <aside v-if="open" class="rules-panel">
      <header>
        <div>
          <h2>规则速览</h2>
        </div>
        <button aria-label="关闭规则" @click="$emit('close')">×</button>
      </header>
      <button type="button" class="rules-source-trigger" aria-haspopup="dialog" :aria-controls="sourceId" @click="openRulesSource('complete')">
        查看完整规则原文
      </button>
      <button type="button" class="rules-source-trigger" aria-haspopup="dialog" :aria-controls="sourceId" @click="openRulesSource('beginner')">查看新手规则与牌例</button>
      <div class="rule-list">
        <article v-for="(rule, index) in rules" :key="rule[0]">
          <b>{{ String(index + 1).padStart(2, '0') }}</b>
          <div>
            <h3>{{ rule[0] }}</h3><p>{{ rule[1] }}</p>
          </div>
        </article>
      </div>
      <div class="rule-note">底分 10 分 · 庄闲同倍率 · 四家净分之和为 0</div>
      <section class="disclaimer-block" aria-label="用户声明">
        <h3>{{ DISCLAIMER_TITLE }}</h3>
        <template v-for="(section, index) in DISCLAIMER_SECTIONS" :key="index">
          <h4 v-if="section.title">{{ section.title }}</h4>
          <p v-if="section.body">{{ section.body }}</p>
          <ol v-if="section.list?.length">
            <li v-for="(item, itemIndex) in section.list" :key="itemIndex">{{ item }}</li>
          </ol>
        </template>
      </section>
    </aside>
  </Transition>

  <dialog v-if="open" :id="sourceId" ref="sourceDialog" class="rules-source-dialog"
    :aria-labelledby="`${sourceId}-title`" @click.self="sourceDialog?.close()">
    <header class="rules-source-header">
      <h2 :id="`${sourceId}-title`">{{ sourceTitle }}</h2>
      <button type="button" aria-label="关闭完整规则" autofocus @click="sourceDialog?.close()">
        <TableControlIcon name="close" />
      </button>
    </header>
    <div class="rules-source-scroll" role="region" aria-label="规则正文" tabindex="0">
      <article v-if="sourceHtml !== null" class="rules-source-document" v-html="sourceHtml"></article>
      <p v-else-if="sourceLoadFailed" role="alert">完整规则加载失败。</p>
      <p v-else role="status">正在加载完整规则…</p>
    </div>
  </dialog>
</template>

<style scoped>
.rules-source-trigger {
  width: 100%;
  min-height: var(--control-hit-target);
  margin: 0 0 12px;
  padding: 7px 12px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-panel);
  color: var(--theme-accent-text);
  text-align: left;
  font-weight: 700;
  cursor: pointer;
}
.rules-source-trigger:hover { background: var(--theme-panel-elevated); }
.rules-source-dialog {
  position: fixed;
  inset: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
  width: min(880px, calc(100vw - var(--safe-left) - var(--safe-right) - 24px));
  height: min(760px, calc(100dvh - var(--safe-top) - var(--safe-bottom) - 24px));
  max-width: none;
  max-height: none;
  margin: auto;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--theme-border);
  border-radius: 14px;
  background: var(--theme-panel);
  color: var(--theme-text);
  box-shadow: 0 18px 60px #0009;
}
.rules-source-dialog[open] { display: flex; flex-direction: column; }
.rules-source-dialog::backdrop { background: #000a; }
.rules-source-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 12px 5px 18px;
  border-bottom: 1px solid var(--theme-border);
  background: var(--theme-panel-elevated);
}
.rules-source-header h2 { margin: 0; font-size: 17px; }
.rules-source-header button {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--control-hit-target);
  height: var(--control-hit-target);
  padding: 0;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-panel);
  color: var(--theme-text);
  cursor: pointer;
}
.rules-source-trigger:focus-visible,
.rules-source-dialog :focus-visible { outline: 2px solid var(--theme-accent-text); outline-offset: -2px; }
.rules-source-scroll {
  flex: 1;
  min-height: 0;
  padding: clamp(14px, 3vw, 28px);
  overflow: auto;
  overscroll-behavior: contain;
  font-size: 15px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.rules-source-document :deep(h1) { margin: 0 0 .65em; font-size: 1.65em; line-height: 1.3; }
.rules-source-document :deep(h2) {
  margin: 1.7em 0 .6em;
  padding-bottom: .25em;
  border-bottom: 1px solid var(--theme-border);
  color: var(--theme-accent-text);
  font-size: 1.25em;
}
.rules-source-document :deep(h3) { margin: 1.4em 0 .4em; font-size: 1.08em; }
.rules-source-document :deep(p) { margin: .65em 0; }
.rules-source-document :deep(:is(ol, ul)) { padding-inline-start: 1.65em; }
.rules-source-document :deep(blockquote) {
  margin: .85em 0;
  padding: .2em .85em;
  border-inline-start: 3px solid var(--theme-accent);
  background: var(--theme-panel-elevated);
}
.rules-source-document :deep(hr) { border: 0; border-top: 1px solid var(--theme-border); }
.rules-source-document :deep(.rules-source-table) { margin: 1em 0; overflow-x: auto; }
.rules-source-document :deep(table) { width: 100%; border-collapse: collapse; font-size: .93em; }
.rules-source-document :deep(:is(th, td)) {
  min-width: 4em;
  padding: .45em .6em;
  border: 1px solid color-mix(in srgb, var(--theme-border) 55%, transparent);
  text-align: left;
  vertical-align: top;
}
.rules-source-document :deep(th) { background: var(--theme-panel-elevated); }
</style>
