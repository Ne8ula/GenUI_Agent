import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { routeTranscript } from '../../core/intents.ts'
import { advanceArrival, initialArrival, phaseAt, seekArrival, startArrival } from '../src/arrival/timeline.ts'
import { canonicalEyeSamples, constructionSchedule } from '../src/arrival/samples.ts'
import { rasterizeWeek1Eye as copiedEye } from '../src/arrival/eye-source.ts'

const blob = readFileSync(new URL('../public/assets/paris-scan-r12/points.bin', import.meta.url))
const data = new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))

test('owner Paris question uses the closed local router; unsupported or negated queries do not start', () => {
  for (const text of ['whats it like in 1980s Paris', "What's it like in 1980s Paris?"]) assert.equal(routeTranscript(text).intent, 'arrive_paris_cafe')
  for (const text of ['Take me to London', 'Show me modern Paris', 'Do not take me to Paris', 'x'.repeat(401)]) assert.equal(routeTranscript(text).intent, 'unknown')
})

test('construction boundaries and endpoint are explicit and bounded', () => {
  assert.deepEqual([0,2,7,14,21,30].map(phaseAt), ['EVA eye','Detection anchors','Surface islands','Local flow','Material reconstruction','Paris'])
  assert.equal(phaseAt(Infinity), 'EVA eye')
  assert.equal(seekArrival(-5).seconds, 0); assert.equal(seekArrival(800).seconds, 30)
})

test('pause, reduced motion, reset and long-frame clamps do not restart a construction', () => {
  const initial = initialArrival(); assert.equal(advanceArrival(initial, 1), initial)
  const playing = startArrival(false); assert.equal(advanceArrival(playing, 100).seconds, .1)
  assert.equal(advanceArrival(playing, NaN).seconds, 0)
  const paused = seekArrival(15); assert.equal(advanceArrival(paused, .1), paused)
  const reduced = startArrival(true); assert.equal(reduced.seconds, 30); assert.equal(advanceArrival(reduced, .1), reduced)
  assert.equal(seekArrival(4, true).seconds, 30)
  assert.equal(advanceArrival({ ...playing, seconds: 29.99 }, .1).playback, 'settled')
  assert.deepEqual(initialArrival(), initial)
})

test('Week4 eye equations produce exactly the archived canonical raster', async () => {
  const { rasterizeWeek1Eye: originalEye } = await import(new URL('../../../week3/src/visual/week1-eye.ts', import.meta.url).href)
  const pose = { time: 0, energy: 0, gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0, quiet: true }
  assert.deepEqual(copiedEye(320,160,pose), originalEye(320,160,pose))
})

test('canonical eye samples are deterministic, finite and bounded', () => {
  const eye = canonicalEyeSamples()
  assert.ok(eye.length > 1000 && eye.length < 30000)
  assert.deepEqual(eye, canonicalEyeSamples())
  assert.ok(eye.every(p => Object.values(p).every(Number.isFinite) && Math.abs(p.x) <= .27 && Math.abs(p.y) <= .135))
})

test('every eye particle gets a unique stable Paris anchor and all source samples survive', () => {
  const before = new Float32Array(data)
  const eye = canonicalEyeSamples()
  const a = constructionSchedule(data, eye.length), b = constructionSchedule(data, eye.length)
  assert.deepEqual(a, b); assert.deepEqual(data, before)
  assert.equal(new Set(a.targets).size, eye.length)
  const groups = [0,0,0,0]; const births: number[] = []
  for (let i = 0; i < a.phases.length; i += 2) { groups[a.phases[i+1]!]!++; births.push(a.phases[i]!) }
  assert.ok(groups.every(v => v > 0)); assert.equal(groups[0], eye.length)
  assert.ok(births.every(v => v >= 2 && v < 28))
  assert.equal(births.filter(v => v <= 0).length, 0)
  assert.equal(births.filter(v => v <= 30).length, data.length / 10)
  assert.throws(() => constructionSchedule(new Float32Array(10), eye.length))
})
