const appOrigin = 'https://appassets.androidplatform.net'
let nextRequest = 0

export function inAndroidApp(): boolean {
  return typeof window !== 'undefined' && window.location.origin === appOrigin
}

export type AndroidSaveResult = 'saved' | 'cancelled' | 'failed' | 'upgrade'

export async function saveAndroidJson(filename: string, json: string): Promise<AndroidSaveResult> {
  const request = 'replay-export-' + ++nextRequest
  let handlePort: (event: MessageEvent) => void
  const saved = new Promise<AndroidSaveResult>((resolve) => {
    handlePort = (event) => {
      const port = event.ports[0]
      if (event.source !== null || event.data !== request || !port) return
      port.onmessage = ({ data }) => {
        port.close()
        resolve(data === 'saved' || data === 'cancelled' ? data : 'failed')
      }
      port.postMessage(filename + '\n' + json)
    }
    window.addEventListener('message', handlePort)
  })
  try {
    // A new APK returns a port to the local main frame. Older APKs return their asset 404.
    const response = await fetch('/android/replay-export?id=' + request, { cache: 'no-store' })
    if (response.status === 404) return 'upgrade'
    if (response.status !== 204) return 'failed'
    return await saved
  } finally {
    window.removeEventListener('message', handlePort)
  }
}
