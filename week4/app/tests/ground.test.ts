import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { groundExtensions, groundAssembly, MAX_GROUND_POINTS, FLOOR_SOURCES } from '../src/arrival/ground.ts'
import { MAX_SCAN_POINTS } from '../src/scan/data.ts'
const raw = readFileSync(new URL('../public/assets/paris-scan-r12/points.bin', import.meta.url))
const source = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
const aspect = 1720 / 3392

test('ground continuation is deterministic, bounded and leaves every original record intact', () => {
  const before = source.slice()
  const extra = groundExtensions(source)
  assert.deepEqual(source, before)
  assert.deepEqual(extra, groundExtensions(source))
  assert.ok(extra.length / 10 > 100 && extra.length / 10 <= MAX_GROUND_POINTS)
  assert.ok(source.length / 10 + extra.length / 10 <= MAX_SCAN_POINTS)
  assert.ok(extra.every(Number.isFinite))
})
test('extensions preserve primitive and RGB attributes from reviewed floor-only windows', () => {
  const safe = new Set<string>()
  for (let i = 0; i < source.length; i += 10) {
    const u = source[i]! * .5 + .5, v = .5 - source[i + 1]! / (2 * aspect)
    if (FLOOR_SOURCES.some(r => u >= r.u0 && u <= r.u1 && v >= r.v0 && v <= r.v1)) safe.add(Array.from(source.subarray(i + 2, i + 10)).join(','))
  }
  const extra = groundExtensions(source)
  let beyondSource = 0
  for (let i = 0; i < extra.length; i += 10) {
    const u = extra[i]! * .5 + .5, v = .5 - extra[i + 1]! / (2 * aspect)
    assert.ok(u > .24 && u < .90 && v > .92 && v < 1.08)
    assert.ok(u < .42 || u > .64, 'Never duplicate or extend the foreground figures')
    assert.ok(safe.has(Array.from(extra.subarray(i + 2, i + 10)).join(',')))
    if (v > 1) beyondSource++
  }
  assert.ok(beyondSource > 100, 'Must actually extend past the old source boundary')
})
test('new ground settles in material phase without changing original eye target scheduling', () => {
  const extra = groundExtensions(source), phases = groundAssembly(extra)
  assert.equal(phases.length, extra.length / 5)
  for (let i = 0; i < phases.length; i += 2) {
    assert.ok(phases[i]! >= 21 && phases[i]! <= 28)
    assert.equal(phases[i + 1], 3)
  }
})
test('empty input and exhausted resource budget cannot allocate extra points', () => {
  assert.equal(groundExtensions(new Float32Array()).length, 0)
  assert.equal(groundExtensions(new Float32Array(MAX_SCAN_POINTS * 10)).length, 0)
  assert.throws(() => groundExtensions(new Float32Array(11)), /budget/)
})
