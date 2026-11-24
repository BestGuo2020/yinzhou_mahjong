<script setup lang="ts">
import { computed } from 'vue'
import { TILE_META } from '../game/core/rules/tiles'
import { displayImageSrc } from '../game/core/presentation/imagePreload'
import { tileBackUrl, tileFaceUrl, type TileAssetTheme } from '../game/core/presentation/tileAssets'
import type { TileType } from '../game/core/contracts/types'

const props = withDefaults(defineProps<{
  tile?: TileType | 'back'
  hidden?: boolean
  selected?: boolean
  drawn?: boolean
  disabled?: boolean
  small?: boolean
  themeName?: TileAssetTheme
  /** 本局癞子集合；未传时按现行玩法「白板」高亮 */
  jokerTiles?: TileType[]
  /** 可替代精牌的实体牌；不参与精牌排序。 */
  wildcardTiles?: TileType[]
  laiziOnly?: boolean
  kongMarked?: boolean
}>(), { tile: 'back', hidden: false, selected: false, drawn: false, disabled: false, small: false })

const emit = defineEmits(['choose'])
const choose = (event?: Event) => {
  if (!props.disabled) emit('choose', event)
}
const shownTile = computed(() => (props.hidden ? 'back' : props.tile))
const meta = computed(() => TILE_META[shownTile.value] || TILE_META.back)
const isPrecision = computed(() => (
  !props.laiziOnly
  && props.tile !== 'back'
  && props.tile !== 'white'
  && Boolean(props.jokerTiles?.includes(props.tile))
))
// 白板翻精：白板本身是精（jokerTiles 与 wildcardTiles 都含白板，可替代任意牌）→ 标「精」，
// 优先于替身判定（此前落入 isWildcard，白板翻精被误标为「替」）。
const isWhiteJoker = computed(() => (
  props.tile === 'white'
  && Boolean(props.jokerTiles?.includes(props.tile))
  && Boolean(props.wildcardTiles?.includes(props.tile))
))
// 替牌 = 莲花麻将中可替代精牌的实体牌（白板出现在 wildcardTiles 且非精）；
// 莲花广麻无 wildcardTiles，白板癞子走 isLaizi，不在此列。
const isWildcard = computed(() => {
  if (props.tile === 'back' || isPrecision.value || isWhiteJoker.value) return false
  return Boolean(props.wildcardTiles?.includes(props.tile))
})
const isLaizi = computed(() => (
  !isPrecision.value
  && !isWhiteJoker.value
  && !isWildcard.value
  && (props.tile === 'white' || props.laiziOnly)
  && props.tile !== 'back'
  && Boolean(props.jokerTiles?.includes(props.tile))
))
const isJoker = computed(() => isPrecision.value || isWhiteJoker.value || isWildcard.value || isLaizi.value)
// 标记按身份区分：真精牌/白板翻精标「精」，替身（可代本局精牌）标「替」，广麻白板癞子标「癞」。
const tileMarker = computed(() => (
  isPrecision.value || isWhiteJoker.value ? '精' : isWildcard.value ? '替' : isLaizi.value ? '癞' : ''
))
const tileLabel = computed(() => {
  if (props.kongMarked && !props.hidden) return meta.value.name + '，杠后标记牌'
  if (!isJoker.value || shownTile.value === 'back') return meta.value.name
  const role = isPrecision.value || isWhiteJoker.value ? '精牌' : isLaizi.value ? '癞子' : '万能牌'
  return `${meta.value.name}，${role}${isWildcard.value ? '，可代本局精牌' : ''}`
})
const tileStyle = computed(() => {
  if (shownTile.value === 'back') {
    return { '--tile-back-image': `url("${displayImageSrc(tileBackUrl(props.themeName))}")` }
  }
  // 优先用预加载的内存 blob URL；预加载未完成时回退网络地址（浏览器缓存兜底）
  return { backgroundImage: `url("${tileFaceUrl(shownTile.value as TileType, props.themeName)}")` }
})
</script>

<template>
  <div
    class="mahjong-tile"
    :class="{ selected, drawn, disabled, small, 'tile-back': shownTile === 'back', joker: (isPrecision || isWhiteJoker) && !hidden, wildcard: isWildcard && !hidden, laizi: isLaizi && !hidden, red: tile === 'red' && !hidden }"
    :style="tileStyle"
    role="button"
    :aria-label="tileLabel"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @click="choose"
    @keydown.enter="choose"
    @keydown.space.prevent="choose"
  >
    <span v-if="isJoker && !hidden" class="joker-mark">{{ tileMarker }}</span>
    <span v-if="kongMarked && !hidden" class="kong-mark">杠后</span>
  </div>
</template>

<style scoped>
.kong-mark { position: absolute; bottom: 0; right: 0; padding: 1px 3px; border-radius: 3px; background: #73321c; color: #fff5cd; font: 700 clamp(9px, 1vw, 13px)/1.3 sans-serif; pointer-events: none; }
</style>
