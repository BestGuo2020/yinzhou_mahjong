<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { androidReleaseFilename as filename, androidReleaseUrl as url } from './androidRelease'
const props = defineProps<{ copyOnly?: boolean }>()
const state = ref<'idle' | 'downloading' | 'ready' | 'failed'>('idle')
const received = ref(0)
const total = ref(0)
const saveUrl = ref('')
const showCopy = ref(false)
const linkField = ref<HTMLInputElement | null>(null)
const copyMessage = ref('')
const percent = computed(() => total.value ? Math.min(100, Math.floor(100 * received.value / total.value)) : undefined)
const size = computed(() => `${(received.value / 1048576).toFixed(1)}${total.value ? ` / ${(total.value / 1048576).toFixed(1)}` : ''} MiB`)
let request: XMLHttpRequest | undefined

function start(event: MouseEvent) {
  if (props.copyOnly) {
    event.preventDefault()
    showCopy.value = true
    return
  }
  // Modified clicks and browsers without XHR retain the direct APK link.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof XMLHttpRequest === 'undefined') return
  event.preventDefault()
  if (request) return

  const download = new XMLHttpRequest()
  request = download
  received.value = 0
  total.value = 0
  state.value = 'downloading'

  function finish() {
    if (request !== download) return
    request = undefined
    const apk = download.response
    const expected = Number(download.getResponseHeader('X-Apk-Bytes')) || total.value
    if (download.status !== 200 || !(apk instanceof Blob) || !apk.size ||
        apk.type !== 'application/vnd.android.package-archive' || (expected && apk.size !== expected)) {
      state.value = 'failed'
      return
    }
    if (saveUrl.value) URL.revokeObjectURL(saveUrl.value)
    saveUrl.value = URL.createObjectURL(apk)
    received.value = total.value = apk.size
    state.value = 'ready'
  }

  download.open('GET', url)
  download.responseType = 'blob'
  download.timeout = 10 * 60 * 1000
  download.onprogress = (progress) => {
    if (request !== download) return
    received.value = progress.loaded
    total.value = Number(download.getResponseHeader('X-Apk-Bytes')) || progress.total || 0
  }
  download.onload = finish
  download.onerror = finish
  download.ontimeout = finish
  download.send()
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(url)
    copyMessage.value = '链接已复制，请粘贴到系统浏览器下载。'
  } catch {
    linkField.value?.focus()
    linkField.value?.select()
    copyMessage.value = '链接已选中，长按复制后在系统浏览器打开。'
  }
}

onBeforeUnmount(() => {
  request?.abort()
  request = undefined
  if (saveUrl.value) URL.revokeObjectURL(saveUrl.value)
})
</script>

<template>
  <a class="text-button apk-update" :href="url" @click="start">App 更新</a>
  <div v-if="showCopy" class="apk-transfer">
    <span>在系统浏览器下载新版 APK，打开后覆盖安装。</span>
    <input ref="linkField" class="apk-link-field" type="url" aria-label="新版 APK 下载链接" readonly :value="url" />
    <button type="button" class="text-button apk-update" @click="copyLink">复制下载链接</button>
    <span v-if="copyMessage" role="status">{{ copyMessage }}</span>
  </div>
  <div v-else-if="state !== 'idle'" class="apk-transfer">
    <template v-if="state === 'downloading'">
      <div class="apk-transfer-line" aria-hidden="true">
        <span>正在下载 APK</span><span>{{ size }}<template v-if="percent !== undefined"> · {{ percent }}%</template></span>
      </div>
      <progress aria-label="APK 下载进度" :value="percent" max="100" />
    </template>
    <template v-else-if="state === 'ready'">
      <span role="status">下载完成。保存 APK 后，打开它覆盖安装。</span>
      <a class="text-button apk-update" :href="saveUrl" :download="filename">保存 APK</a>
    </template>
    <template v-else>
      <span role="status">下载失败，点击 App 更新重试。</span>
      <a class="text-button apk-update" :href="url">直接下载</a>
    </template>
  </div>
</template>

<style scoped>
.apk-update { text-decoration: none; }
.apk-transfer { display: grid; flex: 0 0 100%; gap: 4px; color: var(--theme-text-muted); font-size: 13px; text-wrap: pretty; }
.apk-transfer-line { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2px 8px; font-variant-numeric: tabular-nums; }
.apk-transfer progress { display: block; width: 100%; height: 8px; accent-color: var(--theme-accent); }
.apk-transfer .apk-update { justify-self: start; }
.apk-link-field { width: 100%; min-width: 0; box-sizing: border-box; padding: 6px; border: 1px solid var(--theme-border); border-radius: 4px; color: var(--theme-text); background: transparent; font: inherit; }
</style>
