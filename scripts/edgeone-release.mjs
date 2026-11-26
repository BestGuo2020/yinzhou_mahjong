import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'

const root = fileURLToPath(new URL('../', import.meta.url))
const snapshot = join(root, 'mobile-release')
const output = join(root, 'edgeone-dist')
const partSize = 12 * 1024 * 1024
const fileLimit = 25 * 1024 * 1024
const apkName = 'yinzhou-mahjong.apk'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

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

// The Android release builder and EdgeOne must produce byte-identical update archives.
function updateZip(files) {
  return zipSync(files, { level: 6, mtime: new Date(2020, 0, 1, 0, 0, 0) })
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

const [command, apkPath, zipPath] = process.argv.slice(2)
if (command === 'zip') {
  write(zipPath, updateZip(gameFiles(readFileSync(apkPath))))
} else if (command === 'record') {
  const source = join(root, 'dist/downloads', apkName)
  const update = JSON.parse(readFileSync(join(root, 'dist/updates/latest.json'), 'utf8'))
  const apk = readFileSync(source)
  mkdirSync(snapshot, { recursive: true })
  copyFileSync(source, join(snapshot, apkName))
  write(join(snapshot, 'release.json'), JSON.stringify({ apkSha256: digest(apk), update }, null, 2) + '\n')
} else if (command === 'build') {
  const { apkSha256, update } = JSON.parse(readFileSync(join(snapshot, 'release.json'), 'utf8'))
  const apk = readFileSync(join(snapshot, apkName))
  if (digest(apk) !== apkSha256) throw new Error('Release APK checksum mismatch')
  const files = gameFiles(apk)
  const zip = updateZip(files)
  if (zip.length !== update.bytes || digest(zip) !== update.sha256) throw new Error('Release update checksum mismatch')
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
  console.log('EdgeOne release', update.versionCode, 'verified;', Object.keys(files).length, 'web files')
} else {
  throw new Error('Expected build, record or zip <APK> <output ZIP>')
}
