// 手机上将短音效预解码，每次播放用独立的音源节点，几种声音可以同时自然结束。
export function createBufferedEffects(context: AudioContext) {
  const clips = new Map<string, { buffer: AudioBuffer; offset: number }>()
  const playing = new Map<AudioBufferSourceNode, { file: string; finish: () => void }>()
  let closed = false

  async function preload(file: string, blob: Blob) {
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer())
      if (!closed) clips.set(file, { buffer, offset: voiceOffset(file, buffer) })
    } catch {
      // 该 WebView 解不开的文件仍可用原始 Ogg 走媒体元素播放。
    }
  }

  function resume() {
    if (!closed && context.state !== 'running') void context.resume().catch(() => {})
  }

  function play(file: string, volume: number, onFinish?: () => void, delayMs = 0) {
    const clip = clips.get(file)
    if (!clip || closed) return null
    if (context.state !== 'running') {
      resume()
      return null
    }
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = clip.buffer
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(context.destination)
    function disconnect() {
      source.onended = null
      source.disconnect()
      gain.disconnect()
    }
    const finish = () => {
      if (!playing.delete(source)) return
      disconnect()
      onFinish?.()
    }
    source.onended = finish
    try {
      source.start(delayMs ? context.currentTime + delayMs / 1000 : 0, clip.offset)
    } catch {
      disconnect()
      return null
    }
    playing.set(source, { file, finish })
    return source
  }

  function stop(source: AudioBufferSourceNode) {
    const item = playing.get(source)
    if (!item) return
    source.stop()
    item.finish()
  }

  function stopAll() {
    for (const source of playing.keys()) stop(source)
  }

  function close() {
    closed = true
    stopAll()
    clips.clear()
    void context.close().catch(() => {})
  }

  function isPlaying(file: string) {
    return [...playing.values()].some(item => item.file === file)
  }

  return { preload, play, resume, stop, stopAll, close, isPlaying }
}

function voiceOffset(file: string, buffer: AudioBuffer) {
  if (!/^sounds\/(?:[1-9][mps]|[1-7]z|peng|gang|angang|bugang|chihu|zimo|zhagang|zhuanwangang)\.ogg$/.test(file)) return 0
  // 只跳过人声前低于 -80 dB 的底噪；保留 20ms 起音余量，尾音原样播放。
  let first = Math.min(buffer.length, Math.floor(buffer.sampleRate * .18))
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < first; i++) {
      if (Math.abs(samples[i]) > .0001) { first = i; break }
    }
  }
  return Math.max(0, first / buffer.sampleRate - .02)
}
