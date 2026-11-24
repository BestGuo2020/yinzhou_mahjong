import { DEFAULT_BGM_ASSET } from '../game/core/presentation/audioAssets'
import { DEFAULT_AVATARS } from '../game/core/presentation/avatar'
import { materializeImage } from '../game/core/presentation/imagePreload'
import { preloadTileImages } from '../game/core/presentation/tileAssets'
import { playableTheme, SELECTABLE_TABLE_THEMES, type TableThemeName } from '../theme/themeIdentity'
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
    lobbyThemeImageUrl(playableTheme(theme)),
  ])

  return [
    () => loadModule(() => import('../components/MahjongTable3D.vue')),
    () => preloadTileImages(theme),
    () => preloadAudio(DEFAULT_BGM_ASSET),
    ...[...imageUrls].map(url => () => materializeImage(url)),
  ]
}
