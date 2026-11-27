import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'

const root = fileURLToPath(new URL('../', import.meta.url))
const snapshot = join(root, 'mobile-release')
const output = join(root, 'edgeone-dist')
const partSize = 12 * 1024 * 1024
const fileLimit = 25 * 1024 * 1024
const apkName = 'yinzhou-mahjong.apk'
const releaseManifest = join(snapshot, 'release.json')
const finalUpdate = join(snapshot, 'final-web-update.zip')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

function gameFiles(apk) {
  const entries = unzipSync(apk, { filter: ({ name }) => name.startsWith('assets/') && !name.endsWith('/') })
  const files = Object.create(null)
  for (const entry of Object.keys(entries).sort()) {
    const name = entry.slice('assets/'.length)
    if (name.includes('\\') || name.includes(':') || name.split('/').some(part => !part || part === '..' || part === '.')) {
      throw new Error('Invalid APK asset path: ' + name)
    }
    files[name] = entries[entry]
  }
  if (!files['index.html']) throw new Error('APK has no embedded game')
  return files
}

function writeParts(data, hash) {
  const parts = []
  for (let start = 0; start < data.length; start += partSize) {
    const name = hash + '-' + parts.length + '.bin'
    write(join(output, 'release-files', name), data.subarray(start, start + partSize))
    parts.push(name)
  }
  return parts
}

function makeZip(files) {
  return zipSync(files, { level: 6, mtime: new Date(2020, 0, 1, 0, 0, 0) })
}

const [command] = process.argv.slice(2)
if (command === 'record') {
  const source = join(root, 'dist/downloads', apkName)
  const apk = readFileSync(source)
  let update = existsSync(releaseManifest) ? readJson(releaseManifest).update : undefined
  if (!existsSync(finalUpdate)) {
    const { versionCode, versionName } = readJson(join(root, 'dist/downloads/android-version.json'))
    if (!Number.isInteger(versionCode) || versionCode <= (update?.versionCode ?? 0) || typeof versionName !== 'string') {
      throw new Error('The final web update needs a newer APK version')
    }
    const files = gameFiles(apk)
    const html = Buffer.from(files['index.html']).toString('utf8')
    const tagged = html.replace(/<html(?=[\s>])/i, '<html data-legacy-android-update')
    if (tagged === html) throw new Error('Could not add the legacy Android marker to index.html')
    files['index.html'] = Buffer.from(tagged)
    const entries = Object.values(files)
    if (entries.length > 10000 || entries.reduce((total, file) => total + file.length, 0) > (256 << 20)) {
      throw new Error('The final web update exceeds the old APK asset limit')
    }
    const zip = makeZip(files)
    if (zip.length > (128 << 20)) throw new Error('The final web update exceeds the old APK download limit')
    update = { format: 1, versionCode, versionName, bytes: zip.length, sha256: digest(zip) }
    write(finalUpdate, zip)
  }
  if (!update) throw new Error('Missing final web update metadata')
  mkdirSync(snapshot, { recursive: true })
  copyFileSync(source, join(snapshot, apkName))
  write(releaseManifest, JSON.stringify({ apkSha256: digest(apk), update }, null, 2) + '\n')
} else if (command === 'build') {
  const { apkSha256, update } = readJson(releaseManifest)
  const apk = readFileSync(join(snapshot, apkName))
  if (digest(apk) !== apkSha256) throw new Error('Release APK checksum mismatch')
  const files = gameFiles(apk)
  // Keep serving the previous release until CI publishes the frozen migration ZIP.
  const zip = existsSync(finalUpdate) ? readFileSync(finalUpdate) : makeZip(files)
  if (!update || zip.length !== update.bytes || digest(zip) !== update.sha256) {
    throw new Error('Release update checksum mismatch')
  }
  for (const [path, bytes] of Object.entries(files)) {
    if (bytes.length > fileLimit) throw new Error('Static file exceeds the EdgeOne limit: ' + path)
    write(join(output, path), bytes)
  }
  const downloads = {
    apk: { bytes: apk.length, parts: writeParts(apk, apkSha256) },
    zip: { bytes: zip.length, parts: writeParts(zip, update.sha256) },
    update,
  }
  write(join(output, 'updates/latest.json'), JSON.stringify(update))
  write(join(output, 'release-files/current.json'), JSON.stringify(downloads))
  console.log('EdgeOne APK verified;', Object.keys(files).length, 'web files')
} else {
  throw new Error('Expected build or record')
}
