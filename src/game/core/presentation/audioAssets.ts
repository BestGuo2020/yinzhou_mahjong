/**
 * User-supplied sound library, encoded as Ogg Vorbis.
 * The WAV/MP3 masters are converted by `scripts/convert-audio-to-ogg.mjs`;
 * logical legacy names (`.mp3`/`.wav`) remain valid for the original rulesets.
 */
export const DEFAULT_BGM_ASSET = 'bgm/bgm.ogg'
export const READY_BGM_ASSET = 'bgm/ting_bgm.ogg'
export const EFFECT_AUDIO_ASSETS = [
  ...['m', 'p', 's'].flatMap((suit) => Array.from({ length: 9 }, (_, i) => `sounds/${i + 1}${suit}.ogg`)),
  ...Array.from({ length: 7 }, (_, i) => `sounds/${i + 1}z.ogg`),
  ...[
    'game_start',
    'peng',
    'gang',
    'angang',
    'zimo',
    'chihu',
    'ting',
    'fapai',
    'touzi',
    'tuidao',
    'hu_effecct_sound',
    'chihushandian',
    'chongfengji',
    'zerenji',
    'angang_rainy',
    'mingang_windy',
    'bugang',
    'zhuanwangang',
  ].map((name) => `sounds/${name}.ogg`),
] as const
/** 幺筒快捷语男声（豆包 TTS 2.0 预生成）。 */
export const QUICK_CHAT_AUDIO_ASSETS = [
  'sounds/chat-follow.ogg',
  'sounds/chat-listen.ogg',
  'sounds/chat-draw.ogg',
  'sounds/chat-hurry.ogg',
  'sounds/chat-praise.ogg',
  'sounds/chat-think.ogg',
  'sounds/chat-hello.ogg',
  'sounds/chat-stay.ogg',
  'sounds/chat-let-draw.ogg',
  'sounds/chat-feed-peng.ogg',
  'sounds/chat-hurt.ogg',
  'sounds/chat-oops-hu.ogg',
] as const
/** 互动道具音效：飞掷与番茄/鸡蛋/平底锅取自欢乐麻将；香蕉皮为拟音。 */
export const EMOTE_AUDIO_ASSETS = [
  'sounds/emote-throw.ogg',
  'sounds/emote-tomato.ogg',
  'sounds/emote-egg.ogg',
  'sounds/emote-pan.ogg',
  'sounds/emote-banana.ogg',
  'sounds/emote-kiss.ogg',
  'sounds/emote-like.ogg',
] as const
export const AUDIO_ASSETS = [
  ...EFFECT_AUDIO_ASSETS,
  ...QUICK_CHAT_AUDIO_ASSETS,
  ...EMOTE_AUDIO_ASSETS,
  DEFAULT_BGM_ASSET,
  READY_BGM_ASSET,
] as const
const available = new Set<string>(AUDIO_ASSETS)
const aliases: Readonly<Record<string, string>> = {
  'bg.ogg': DEFAULT_BGM_ASSET,
  'HuMusic.ogg': READY_BGM_ASSET,
  'bgm.wav': DEFAULT_BGM_ASSET,
  'ting_bgm.wav': READY_BGM_ASSET,
  'dice.mp3': 'sounds/touzi.ogg',
  'deal.mp3': 'sounds/fapai.ogg',
  'hu.mp3': 'sounds/chihu.ogg',
  'hu_effect_sound.mp3': 'sounds/hu_effecct_sound.ogg',
  'hu_effect_sound.wav': 'sounds/hu_effecct_sound.ogg',
  'hufangmj.ogg': 'sounds/tuidao.ogg',
  'chihushandian.ogg': 'sounds/chihushandian.ogg',
}

/** Only registered files get URLs; missing sounds never hold a game timer. */
export function resolveAudioAsset(name: string): string | null {
  if (available.has(name)) return name
  if (aliases[name]) return aliases[name]
  // Legacy logical names (e.g. `peng.wav`, `5m.mp3`) resolve to the Ogg Vorbis asset.
  const candidate = `sounds/${name.replace(/\.(mp3|ogg|wav)$/i, '')}.ogg`
  return available.has(candidate) ? candidate : null
}

export function resolveBgmAsset(name: string): string | null {
  const path = resolveAudioAsset(name)
  return path?.startsWith('bgm/') ? path : null
}
