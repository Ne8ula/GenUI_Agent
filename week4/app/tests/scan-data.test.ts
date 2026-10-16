import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodeScanPoints, scanViewport, validateScanManifest, MAX_SCAN_POINTS } from '../src/scan/data.ts'

const manifest = JSON.parse(readFileSync(new URL('../public/assets/paris-scan-r12/scene.json', import.meta.url), 'utf8'))
const bytes = readFileSync(new URL('../public/assets/paris-scan-r12/points.bin', import.meta.url))
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

test('scan assets have bounded samples, exact hash and valid attributes', () => {
  const valid = validateScanManifest(manifest)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), valid.sha256)
  const points = decodeScanPoints(buffer, valid)
  assert.equal(points.length, valid.count * 10)
  assert.equal(valid.count, 109593)
  assert.equal(Object.values(manifest.counts).reduce((a: number, b) => a + Number(b), 0), valid.count)
})

test('scan rejects foreign paths, wrong versions, dimensions and oversized budgets', () => {
  for (const patch of [{ data: 'https://example.org/a.bin' }, { data: '/assets/../private' }, { version: 2 },
    { width: 848 }, { height: 430 }, { count: MAX_SCAN_POINTS + 1 }, { count: 1.5 }, { count: -1 }, { stride: 11 }, { sha256: '' }]) {
    assert.throws(() => validateScanManifest({ ...manifest, ...patch }))
  }
  for (const value of [null, undefined, [], 'text']) assert.throws(() => validateScanManifest(value))
})

test('scan rejects malformed, truncated and nonfinite GPU data', () => {
  assert.throws(() => decodeScanPoints(buffer.slice(4), manifest), /size/)
  for (const [index, value] of [[0, NaN], [0, 1.1], [1, .8], [3, -1], [4, 2], [6, .5], [6, 4], [7, 0], [7, 100], [8, 1.1], [9, 20]]) {
    const copy = buffer.slice(0)
    new Float32Array(copy)[index!] = value!
    assert.throws(() => decodeScanPoints(copy, manifest))
  }
})

test('QHD is native at DPR1 and large or invalid framebuffers remain bounded', () => {
  assert.deepEqual(scanViewport(2560, 1440, 1), { width: 2560, height: 1440 })
  for (const args of [[2560, 1440, 2], [8000, 8000, 3], [NaN, 0, Infinity], [390, 844, 3]]) {
    const { width, height } = scanViewport(args[0]!, args[1]!, args[2]!)
    assert.ok(width >= 1 && width <= 3840 && height >= 1 && height <= 2160)
    assert.ok(width * height <= 3840 * 2160)
  }
})
