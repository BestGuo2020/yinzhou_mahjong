import { serveRelease } from '../../scripts/edgeone-download.mjs'

export function onRequest(context) {
  return serveRelease(context, 'apk')
}
