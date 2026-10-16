import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalEyeSamples, formlessEyeSamples } from '../src/arrival/samples.ts'
import { advanceArrival, idlePhase, initialArrival, resumeArrival, seekArrival, startArrival } from '../src/arrival/timeline.ts'

test('formless eye removes surrounding tissue while retaining a red square-pupil anatomy', () => {
  const original = canonicalEyeSamples(), loose = formlessEyeSamples()
  assert.ok(loose.length > 1000 && loose.length < original.length * .65)
  assert.deepEqual(loose, formlessEyeSamples())
  const oldOuter = original.filter(p => Math.abs(p.y) > .11).length
  const newOuter = loose.filter(p => Math.abs(p.y) > .11).length
  assert.ok(newOuter < oldOuter * .2)
  assert.ok(loose.every(p => p.r > p.g && p.r > p.b && Object.values(p).every(Number.isFinite)))
  const pupil = loose.filter(p => {
    const x = p.x / .27 + .003125
    const y = p.y / .27 - .003125 + x * .075
    return Math.abs(x + .055) < .08 && Math.abs(y - .125) < .08
  })
  assert.equal(pupil.length, 0)
})

test('completed construction keeps an independent idle clock beyond sixty seconds', () => {
  let state = advanceArrival({ ...startArrival(false), seconds: 29.99 }, .1)
  assert.equal(state.playback, 'settled'); assert.equal(state.idleSeconds, 0)
  for (let i = 0; i < 1300; i++) state = advanceArrival(state, .1)
  assert.equal(state.seconds, 30); assert.ok(state.idleSeconds > 129)
  assert.equal(state.playback, 'settled')
  assert.equal(advanceArrival(state, 0), state)
  assert.equal(advanceArrival(state, NaN), state)
})

test('pause, resume, deterministic seek and reset preserve independent clocks', () => {
  const paused = seekArrival(30, false, 72.5)
  assert.equal(advanceArrival(paused, .1), paused)
  const resumed = resumeArrival(paused)
  assert.equal(resumed.playback, 'settled'); assert.equal(resumed.idleSeconds, 72.5)
  assert.equal(advanceArrival(resumed, .1).idleSeconds, 72.6)
  assert.equal(seekArrival(14, false, 72.5).idleSeconds, 0)
  assert.equal(initialArrival().idleSeconds, 0)
  assert.equal(resumeArrival(initialArrival()).playback, 'idle')
})

test('reduced motion is static and harmonic phase wraps without restarting construction', () => {
  const reduced = startArrival(true)
  assert.equal(reduced.seconds, 30); assert.equal(reduced.playback, 'paused')
  assert.equal(advanceArrival(reduced, .1), reduced)
  assert.equal(seekArrival(30, true, 50).idleSeconds, 0)
  assert.equal(idlePhase(120), 0); assert.equal(idlePhase(121), 1)
  assert.equal(idlePhase(360001), 1); assert.equal(idlePhase(Infinity), 0)
})
