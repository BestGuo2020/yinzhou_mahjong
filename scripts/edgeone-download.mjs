// Shared EdgeOne function. The Android client and browser see one ordinary download.
export async function serveRelease(context, kind) {
  const { request } = context
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const url = new URL(request.url)
  const metadata = await fetch(new URL('/release-files/current.json', url).href)
  if (!metadata.ok) return new Response(null, { status: 503 })
  const { apk, zip, update } = await metadata.json()
  const head = request.method === 'HEAD'
  if (kind === 'zip' && url.pathname === '/updates/latest.json') {
    return new Response(head ? null : JSON.stringify(update), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
  const isApk = kind === 'apk'
  const path = isApk ? '/downloads/yinzhou-mahjong.apk' : '/updates/web-' + update.versionCode + '.zip'
  if (url.pathname !== path) return new Response(null, { status: 404 })
  const file = isApk ? apk : zip
  const headers = {
    'Content-Type': isApk ? 'application/vnd.android.package-archive' : 'application/zip',
    'Content-Length': String(file.bytes),
    'Content-Disposition': 'attachment; filename="' + path.split('/').pop() + '"',
    'Cache-Control': isApk ? 'no-store' : 'public, max-age=31536000, immutable',
  }
  if (head) return new Response(null, { headers })
  const parts = await Promise.all(file.parts.map(name => fetch(new URL('/release-files/' + name, url).href)))
  if (parts.some(part => part.status !== 200 || !part.body || part.headers.get('Content-Type')?.includes('text/html'))) {
    for (const part of parts) part.body?.cancel().catch(() => {})
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const { readable, writable } = new TransformStream()
  const transfer = async () => {
    for (let i = 0; i < parts.length; i++) {
      await parts[i].body.pipeTo(writable, { preventClose: i + 1 < parts.length })
    }
  }
  const completed = transfer().catch(async error => {
    for (const part of parts) if (!part.body.locked) part.body.cancel().catch(() => {})
    await writable.abort(error).catch(() => {})
  })
  context.waitUntil?.(completed)
  return new Response(readable, { headers })
}
