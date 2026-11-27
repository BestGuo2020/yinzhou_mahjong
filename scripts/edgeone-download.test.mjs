import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { unzipSync } from 'fflate'
import { onRequest as download } from '../edge-functions/downloads/[filename].js'
import { onRequest as update } from '../edge-functions/updates/[filename].js'

test('EdgeOne serves the matching signed APK and update with unmodified public URLs', async t => {
  const { apkSha256, update: expected } = JSON.parse(readFileSync('mobile-release/release.json', 'utf8'))
  const dir = 'edgeone-dist/release-files'
  let missingPart = false
  const server = createServer((req, res) => {
    const name = basename(req.url)
    if (missingPart && name.endsWith('-1.bin')) { res.writeHead(404).end(); return }
    const file = join(dir, name)
    const size = statSync(file).size
    assert.ok(size <= 25 * 1024 * 1024)
    res.writeHead(200, { 'Content-Length': size })
    createReadStream(file).pipe(res)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const url = 'http://127.0.0.1:' + server.address().port
  const call = (handler, path, method = 'GET', headers) => handler({ request: new Request(url + path, { method, headers }) })
  assert.deepEqual(await (await call(update, '/updates/latest.json')).json(), expected)
  const apkPath = '/downloads/yinzhou-mahjong.apk'
  const zipPath = '/updates/web-' + expected.versionCode + '.zip'
  for (const [handler, path, hash] of [[download, apkPath, apkSha256], [update, zipPath, expected.sha256]]) {
    const result = await call(handler, path)
    assert.equal(result.status, 200)
    const bytes = Buffer.from(await result.arrayBuffer())
    assert.equal(bytes.length, Number(result.headers.get('Content-Length')))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash)
    if (existsSync('mobile-release/final-web-update.zip')) {
      const entry = path === zipPath ? 'index.html' : 'assets/index.html'
      const files = unzipSync(bytes, { filter: ({ name }) => name === entry })
      assert.equal(Buffer.from(files[entry]).includes('data-legacy-android-update'), path === zipPath)
    }
    assert.equal((await call(handler, path, 'HEAD')).body, null)
  }
  const oldSite = 'https://yinzhoumahjong.guoguo-labs.online'
  const migration = await call(download, apkPath, 'HEAD', { Origin: oldSite })
  assert.equal(migration.headers.get('Access-Control-Allow-Origin'), oldSite)
  assert.equal(migration.headers.get('Access-Control-Expose-Headers'), 'X-Apk-Bytes')
  assert.equal(migration.headers.get('X-Apk-Bytes'), migration.headers.get('Content-Length'))
  assert.equal((await call(download, apkPath, 'HEAD', { Origin: 'https://example.com' })).headers.get('Access-Control-Allow-Origin'), null)
  assert.equal((await call(update, zipPath, 'HEAD', { Origin: oldSite })).headers.get('Access-Control-Allow-Origin'), null)
  assert.equal((await call(update, '/updates/web-0.zip')).status, 404)
  missingPart = true
  assert.equal((await call(download, apkPath)).status, 503)
})
