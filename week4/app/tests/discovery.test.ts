import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { advanceDiscovery, ARCHIVE_PHOTOS, DISCOVERY_SECONDS, discoveryPose, discoveryWindows, PHOTO_SWAP_SECONDS, WINDOW_FOCUS_SECONDS, initialDiscovery, PHOTO_FRAGMENTS, seekDiscovery, startDiscovery } from '../src/arrival/discovery.ts'

test('discovery has a separate bounded deterministic clock', () => {
  let state = startDiscovery()
  for (let index = 0; index < 121; index++) state = advanceDiscovery(state, .1)
  assert.deepEqual(state, { active: false, seconds: DISCOVERY_SECONDS, playing: false })
  assert.equal(advanceDiscovery(state, 1), state)
  assert.deepEqual(startDiscovery(), startDiscovery())
  assert.deepEqual(initialDiscovery(), { active: false, seconds: 0, playing: false })
})
test('pause and invalid deltas cannot advance discovery', () => {
  const paused = seekDiscovery(4)
  assert.equal(advanceDiscovery(paused, .1), paused)
  const playing = startDiscovery()
  for (const delta of [NaN, Infinity, -2, 0]) assert.equal(advanceDiscovery(playing, delta), playing)
  assert.equal(advanceDiscovery(playing, 40).seconds, .1)
})
test('seeking clamps and reduced motion uses a static inspectable cluster', () => {
  assert.equal(seekDiscovery(-5).seconds, 0)
  assert.equal(seekDiscovery(100).seconds, 12)
  assert.equal(seekDiscovery(NaN).seconds, 0)
  assert.deepEqual(startDiscovery(true), { active: true, seconds: 5, playing: false })
  assert.deepEqual(seekDiscovery(200, true), startDiscovery(true))
})
test('fragment poses are deterministic, finite and bounded at all checkpoints', () => {
  for (const t of [NaN, Infinity, -1, 0, .5, 2, 5, 10, 12, 100]) {
    PHOTO_FRAGMENTS.forEach((_, i) => {
      const pose = discoveryPose(t, i)
      assert.deepEqual(pose, discoveryPose(t, i))
      assert.ok(Object.values(pose).every(Number.isFinite))
      assert.ok(pose.opacity >= 0 && pose.opacity <= 1)
      assert.ok(Math.abs(pose.turn) <= 11)
    })
  }
  assert.ok(PHOTO_FRAGMENTS.every((_, i) => discoveryPose(12, i).opacity === 0))
})
test('seven stable windows use seven distinct whitelisted archival sources', () => {
  assert.equal(ARCHIVE_PHOTOS.length, 7)
  assert.equal(PHOTO_FRAGMENTS.length, 7)
  assert.equal(new Set(PHOTO_FRAGMENTS.map(p => p.id)).size, 7)
  assert.equal(new Set(ARCHIVE_PHOTOS.map(p => p.src)).size, 7)
  for (const source of ARCHIVE_PHOTOS) assert.match(source.src, /^\/sources\/paris-r(10|15|17)\/[a-z0-9-]+\.jpg$/)
})
test('rapid source switching is a deterministic permutation, never simultaneous duplicates', () => {
  const available = ARCHIVE_PHOTOS.map((_, index) => index)
  for (let tick = 0; tick <= 1200; tick++) {
    const t = tick / 100, windows = discoveryWindows(t, available)
    assert.deepEqual(windows, discoveryWindows(t, available))
    assert.equal(windows.length, 7)
    assert.equal(new Set(windows.map(w => w.photo)).size, 7)
    assert.equal(windows.filter(w => w.focused).length, 1)
    assert.ok(windows.every(w => w.focus >= 0 && w.focus <= 1))
  }
  const before = discoveryWindows(3, available), after = discoveryWindows(3.2, available)
  assert.notDeepEqual(before.map(w => w.photo), after.map(w => w.photo))
  assert.equal(before.filter((w, i) => w.photo !== after[i]!.photo).length, 2)
  assert.ok(WINDOW_FOCUS_SECONDS >= .5 && WINDOW_FOCUS_SECONDS < 1)
  assert.ok(PHOTO_SWAP_SECONDS >= 1)
})
test('failed or invalid sources reduce the window count rather than creating copies', () => {
  assert.deepEqual(discoveryWindows(5, []), [])
  const windows = discoveryWindows(5, [0, 0, 2, 6, -1, 99, NaN, 1.5])
  assert.equal(windows.length, 3)
  assert.deepEqual(windows.map(w => w.photo).sort(), [0, 2, 6])
})
test('every runtime photo has retained rights, hashes and a source-credit anchor', () => {
  const root = new URL('../public/sources/paris-r17/', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('credits.json', root), 'utf8'))
  assert.equal(manifest.sources.length, ARCHIVE_PHOTOS.length)
  for (const photo of ARCHIVE_PHOTOS) {
    const record = manifest.sources.find((entry: { id: string }) => entry.id === photo.id)
    assert.ok(record?.creator && record?.license && record?.changes && record?.dateBasis)
    assert.equal(createHash('sha256').update(readFileSync(new URL(record.file, root))).digest('hex'), record.sha256)
    assert.equal(record.src, photo.src)
    assert.equal(record.creator, photo.creator)
    assert.equal(photo.creditHref, `/sources/paris-r17/credits.html#${photo.id}`)
  }
  assert.equal(manifest.sources.find((entry: { id: string }) => entry.id === 'beaubourg').date, '1980s')
})
