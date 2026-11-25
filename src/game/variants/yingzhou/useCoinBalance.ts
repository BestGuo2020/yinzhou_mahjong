import { computed, onScopeDispose, reactive, ref } from 'vue'

// 每场独立存本家已结算的净金币。重复保存同一局或两张标签页同时游戏都不会重复加款、覆盖别场。
const prefix = 'yingzhou:match-coins:v1:'
export function useCoinBalance() {
  const matches = reactive(new Map<string, number>())
  const saveFailed = ref(false)
  function load() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(prefix)) continue
        const amount = Number(localStorage.getItem(key))
        if (Number.isSafeInteger(amount)) matches.set(key, amount)
      }
    } catch { saveFailed.value = true }
  }
  function sync(event: StorageEvent) {
    if (event.storageArea !== localStorage) return
    if (event.key === null) { matches.clear(); load(); return }
    if (!event.key.startsWith(prefix)) return
    if (event.newValue === null) matches.delete(event.key)
    else if (Number.isSafeInteger(Number(event.newValue))) matches.set(event.key, Number(event.newValue))
  }
  function record(matchId: string, netCoins: number) {
    const key = prefix + matchId
    matches.set(key, netCoins)
    try { localStorage.setItem(key, String(netCoins)); saveFailed.value = false }
    catch { saveFailed.value = true }
  }
  load()
  window.addEventListener('storage', sync)
  onScopeDispose(() => window.removeEventListener('storage', sync))
  return { balance: computed(() => [...matches.values()].reduce((a, b) => a + b, 0)), saveFailed, record }
}
