<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { PlayerStats } from '../../game/online/api/accountApi'

interface Props {
  open: boolean
  authenticated?: boolean
  accountId?: string
  accountName?: string
  loadLocalStats?: () => Promise<PlayerStats>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  login: []
}>()

const stats = ref<PlayerStats | null>(null)
const loading = ref(false)
const error = ref('')
const loginRequired = ref(false)
let requestSerial = 0

async function loadStats() {
  const serial = ++requestSerial
  stats.value = null
  error.value = ''
  loading.value = false
  loginRequired.value = !props.loadLocalStats && !props.authenticated
  if (!props.open || loginRequired.value) return
  loading.value = true
  try {
    const next = props.loadLocalStats ? await props.loadLocalStats()
      : await (await import('../../game/online/api/accountApi')).getMyStats('yaotong')
    if (serial === requestSerial) stats.value = next
  } catch (cause) {
    if (serial === requestSerial) {
      loginRequired.value = !props.loadLocalStats && cause instanceof Error && 'status' in cause && cause.status === 401
      error.value = loginRequired.value
        ? '登录已过期，请重新登录 WakuDemo 账号'
        : '战绩加载失败，请稍后重试'
    }
  } finally {
    if (serial === requestSerial) loading.value = false
  }
}

watch(() => [props.open, props.authenticated, props.accountId], loadStats, { immediate: true })
onBeforeUnmount(() => { requestSerial++ })
</script>

<template>
  <Transition name="modal">
    <div v-if="open" class="result-backdrop round-settlement" @click.self="emit('update:open', false)">
      <section class="result-card settlement-card stats-card" role="dialog" aria-modal="true" aria-label="个人战绩">
        <h2>个人战绩</h2>
        <p v-if="loadLocalStats" class="stats-nickname">颍州扎杠 · 按本机保存的单人牌谱统计</p>
        <p v-else class="stats-nickname">{{ authenticated ? (accountName || 'WakuDemo 玩家') : 'WakuDemo 账号' }} · 幺筒联机</p>
        <div v-if="loading" class="stats-loading" role="status">加载中…</div>
        <p v-else-if="loginRequired" class="stats-empty" role="status">{{ error || '登录 WakuDemo 账号后，可查看你的幺筒联机战绩。' }}</p>
        <p v-else-if="error" class="stats-empty" role="alert">{{ error }}</p>
        <template v-else-if="stats">
          <div class="stats-grid">
            <article><b>{{ stats.matches }}</b><span>场次</span></article>
            <article><b>{{ stats.hands }}</b><span>{{ loadLocalStats ? '有效局数' : '参与局数' }}</span></article>
            <article><b>{{ stats.wins }}</b><span>胡牌局数</span></article>
            <article><b :class="{ positive: stats.totalDelta > 0, negative: stats.totalDelta < 0 }">{{ stats.totalDelta > 0 ? '+' : '' }}{{ stats.totalDelta }}</b><span>净胜分</span></article>
          </div>
          <p v-if="stats.hands === 0" class="stats-empty">{{ loadLocalStats ? '尚无有效局，胡牌结算后可在这里查看。' : '暂无幺筒联机战绩，完成一局后再来看看。' }}</p>
        </template>
        <div class="result-actions">
          <button v-if="loginRequired" @click="emit('login')">{{ authenticated ? '重新登录' : '登录' }}</button>
          <button v-else-if="error" @click="loadStats">重试</button>
          <button @click="emit('update:open', false)">关闭</button>
        </div>
      </section>
    </div>
  </Transition>
</template>
