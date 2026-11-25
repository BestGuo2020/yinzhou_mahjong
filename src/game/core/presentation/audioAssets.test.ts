// @ts-expect-error Node APIs exist in Vitest; the app tsconfig intentionally excludes Node globals.
import { readFileSync, readdirSync } from 'node:fs'
// @ts-expect-error Node APIs exist in Vitest; the app tsconfig intentionally excludes Node globals.
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIO_ASSETS, resolveAudioAsset, resolveBgmAsset } from './audioAssets'
import { TILE_TYPES, tileAudioFile } from '../rules/tiles'

const root = resolve('public/audio')
const supplied = ['sounds', 'bgm'].flatMap((dir) =>
  readdirSync(resolve(root, dir))
    .filter((name) => name.endsWith('.ogg'))
    .map((name) => `${dir}/${name}`),
)

describe('Ogg Vorbis sound library', () => {
  it('every registered asset exists and is a real Ogg file; no supplied Ogg is omitted', () => {
    expect([...AUDIO_ASSETS].sort()).toEqual(supplied.sort())
    for (const file of AUDIO_ASSETS) {
      const bytes = readFileSync(resolve(root, file))
      expect(bytes.subarray(0, 4).toString(), file).toBe('OggS')
      expect(bytes.length, file).toBeGreaterThan(100)
    }
  })
  it('ships no unconverted WAV/MP3 masters', () => {
    const leftovers = ['sounds', 'bgm'].flatMap((dir) =>
      readdirSync(resolve(root, dir)).filter((name) => /\.(wav|mp3)$/i.test(name)),
    )
    expect(leftovers).toEqual([])
  })
  it.each([
    ['game_start.mp3', 'sounds/game_start.ogg'],
    ['game_start.wav', 'sounds/game_start.ogg'],
    ['1p.mp3', 'sounds/1p.ogg'],
    ['peng.wav', 'sounds/peng.ogg'],
    ['angang.mp3', 'sounds/angang.ogg'],
    ['dice.mp3', 'sounds/touzi.ogg'],
    ['deal.mp3', 'sounds/fapai.ogg'],
    ['hu.mp3', 'sounds/chihu.ogg'],
    ['hu_effect_sound.mp3', 'sounds/hu_effecct_sound.ogg'],
    ['hufangmj.ogg', 'sounds/tuidao.ogg'],
    ['HuMusic.ogg', 'bgm/ting_bgm.ogg'],
  ])('legacy %s resolves to actual %s', (logical, file) => expect(resolveAudioAsset(logical)).toBe(file))
  it('all 34 faces have a discard announcement', () => {
    for (const face of TILE_TYPES) expect(resolveAudioAsset(tileAudioFile(face))).toMatch(/^sounds\/[1-9][mpsz]\.ogg$/)
  })
  it('missing old sounds do not produce broken URLs or masquerade as a BGM track', () => {
    for (const file of ['click.mp3', '8z.mp3', '../secret.wav', 'unknown.wav'])
      expect(resolveAudioAsset(file)).toBeNull()
    expect(resolveBgmAsset('peng.wav')).toBeNull()
    expect(resolveBgmAsset('bg.ogg')).toBe('bgm/bgm.ogg')
  })
})
