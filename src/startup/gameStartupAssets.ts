import { DEFAULT_BGM_ASSET, EFFECT_AUDIO_ASSETS } from '../game/core/presentation/audioAssets'
import { TABLE_THEMES } from '../components/table/three/tableTheme'
import { DEFAULT_AVATARS } from '../game/core/presentation/avatar'
import { materializeImage } from '../game/core/presentation/imagePreload'
import { preloadTileImages } from '../game/core/presentation/tileAssets'
import { SELECTABLE_TABLE_THEMES, type TableThemeName } from '../theme/themeIdentity'
import { lobbyThemeImageUrl, THEME_PRESENTATIONS } from '../theme/themePresentation'

export class StartupModuleError extends Error {}

async function loadModule<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    throw new StartupModuleError('游戏模块加载失败', { cause: error })
  }
}

export function gameStartupTasks(theme: TableThemeName, preloadAudio: (file: string) => Promise<void>) {
  const imageUrls = new Set([
    ...DEFAULT_AVATARS,
    ...SELECTABLE_TABLE_THEMES.map(({ value }) => THEME_PRESENTATIONS[value].identity.previewUrl),
    ...SELECTABLE_TABLE_THEMES.map(({ value }) => lobbyThemeImageUrl(value)),
    ...SELECTABLE_TABLE_THEMES.flatMap(({ value }) => {
      const surface = TABLE_THEMES[value].tableSurfaceTexture
      return surface ? [surface.url] : []
    }),
  ])

  return [
    () => loadModule(() => import('../components/MahjongTable3D.vue')),
    async () => (await loadModule(() => import('../components/table/three/yaotongWeatherAssets'))).preloadWeatherAssets(),
    () => loadModule(() => import('../components/replay/ReplayViewer.vue')),
    () => loadModule(() => import('../content/yingzhouRulesHtml')),
    () => preloadTileImages(theme),
    ...[DEFAULT_BGM_ASSET, ...EFFECT_AUDIO_ASSETS].map(file => () => preloadAudio(file)),
    ...[...imageUrls].map(url => () => materializeImage(url)),
  ]
}
