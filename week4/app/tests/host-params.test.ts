import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChoices,
  clampSeed,
  DEFAULT_BUILD_MS,
  DEFAULT_SEEDS,
  defaultSeedFor,
  DENSITIES,
  parseBuildMs,
  parseParams,
  parseSeed,
  parseStartMs,
  reseed,
  scrubMaxMs,
  SEED_MAX,
  seedAfterLookChange,
  snapDensity,
} from '../src/host/params.ts';
import { DEFAULT_SEED33 } from '../src/scene/seed33.ts';

test('defaults apply when the URL is empty', () => {
  assert.deepEqual(parseParams(''), {
    backend: 'auto',
    seed: 33,
    density: 1,
    facing: 'away',
    look: 'seed33',
    buildMs: 12_000,
    startMs: 0,
    showTiles: true,
    reduced: false,
    paused: false,
    capture: false,
    fixture: false,
    manualClock: false,
  });
});

test('backend and facing are whitelisted, case-insensitively', () => {
  assert.equal(parseParams('?backend=webgl2').backend, 'webgl2');
  assert.equal(parseParams('?backend=Canvas2D').backend, 'canvas2d');
  assert.equal(parseParams('?backend=auto').backend, 'auto');
  assert.equal(parseParams('?backend=webgpu').backend, 'auto');
  assert.equal(parseParams('?backend=').backend, 'auto');
  assert.equal(parseParams('?facing=toward').facing, 'toward');
  assert.equal(parseParams('?facing=TOWARD').facing, 'toward');
  assert.equal(parseParams('?facing=sideways').facing, 'away');
});

test('look defaults to seed33 and accepts only the two known looks', () => {
  assert.equal(parseParams('').look, 'seed33');
  assert.equal(parseParams('?look=seed33').look, 'seed33');
  assert.equal(parseParams('?look=arrival').look, 'arrival');
  assert.equal(parseParams('?look=ARRIVAL').look, 'arrival');
  assert.equal(parseParams('?look=bwa2').look, 'seed33');
  assert.equal(parseParams('?look=').look, 'seed33');
  assert.equal(parseParams('?look=%3Cscript%3E').look, 'seed33');
});

test('the default seed follows the look: 33 for seed33, 7 for arrival', () => {
  assert.equal(DEFAULT_SEEDS.seed33, 33);
  assert.equal(DEFAULT_SEEDS.arrival, 7);
  assert.equal(DEFAULT_SEEDS.seed33, DEFAULT_SEED33.seed, 'the host default is the scene module default');
  assert.equal(defaultSeedFor('seed33'), 33);
  assert.equal(defaultSeedFor('arrival'), 7);
  assert.equal(parseParams('').seed, 33, 'the default look is seed33');
  assert.equal(parseParams('?look=seed33').seed, 33);
  assert.equal(parseParams('?look=arrival').seed, 7);
  assert.equal(parseParams('?look=bwa2').seed, 33, 'an unknown look is the default look, so its default seed');
});

test('an explicit seed wins over the look default, and junk falls back to the look default', () => {
  assert.equal(parseParams('?look=seed33&seed=7').seed, 7);
  assert.equal(parseParams('?look=arrival&seed=33').seed, 33);
  assert.equal(parseParams('?seed=5').seed, 5);
  assert.equal(parseParams('?look=seed33&seed=abc').seed, 33);
  assert.equal(parseParams('?look=arrival&seed=abc').seed, 7);
  assert.equal(parseParams('?look=arrival&seed=12.5').seed, 7);
  assert.equal(parseParams('?seed=').seed, 33);
  assert.equal(parseSeed('abc', 33), 33);
  assert.equal(parseSeed(null, 33), 33);
  assert.equal(parseSeed('4', 33), 4);
  assert.equal(clampSeed(Number.NaN, 33), 33);
});

test('switching look moves a default seed with it and keeps a seed the user chose', () => {
  assert.equal(seedAfterLookChange(33, 'seed33', 'arrival'), 7);
  assert.equal(seedAfterLookChange(7, 'arrival', 'seed33'), 33);
  assert.equal(seedAfterLookChange(5, 'seed33', 'arrival'), 5);
  assert.equal(seedAfterLookChange(5, 'arrival', 'seed33'), 5);
  assert.equal(seedAfterLookChange(7, 'seed33', 'arrival'), 7, 'a deliberate 7 in the seed33 look stays 7');
  assert.equal(seedAfterLookChange(33, 'seed33', 'seed33'), 33);
});

test('build is whole milliseconds, 0 means complete, clamped to a minute, junk is the 12 s default', () => {
  assert.equal(DEFAULT_BUILD_MS, 12_000);
  assert.equal(parseParams('').buildMs, 12_000);
  assert.equal(parseParams('?build=0').buildMs, 0);
  assert.equal(parseParams('?build=3000').buildMs, 3000);
  assert.equal(parseParams('?build=24000').buildMs, 24_000);
  assert.equal(parseParams('?build=999999').buildMs, 60_000);
  assert.equal(parseBuildMs(' 5000 '), 5000);
  assert.equal(parseBuildMs(null), 12_000);
  assert.equal(parseBuildMs(''), 12_000);
  assert.equal(parseBuildMs('-5'), 12_000);
  assert.equal(parseBuildMs('1.5'), 12_000);
  assert.equal(parseBuildMs('12s'), 12_000);
  assert.equal(parseBuildMs('abc'), 12_000);
});

test('t starts both clocks: non-negative whole milliseconds, clamped to a minute, junk is 0', () => {
  assert.equal(parseParams('').startMs, 0);
  assert.equal(parseParams('?t=3000').startMs, 3000);
  assert.equal(parseParams('?t=0').startMs, 0);
  assert.equal(parseParams('?t=17000').startMs, 17_000);
  assert.equal(parseParams('?t=999999').startMs, 60_000);
  assert.equal(parseStartMs(null), 0);
  assert.equal(parseStartMs('-5'), 0);
  assert.equal(parseStartMs('2.5'), 0);
  assert.equal(parseStartMs('abc'), 0);
  assert.equal(parseStartMs(' 2500 '), 2500);
});

test('the old life parameter no longer does anything', () => {
  const params = parseParams('?life=2500');
  assert.equal(params.startMs, 0);
  assert.equal('lifeMs' in params, false);
  assert.equal(parseParams('?life=2500&t=800').startMs, 800);
});

test('tiles are on unless tiles=0', () => {
  assert.equal(parseParams('').showTiles, true);
  assert.equal(parseParams('?tiles=1').showTiles, true);
  assert.equal(parseParams('?tiles=0').showTiles, false);
  assert.equal(parseParams('?tiles=off').showTiles, true);
  assert.equal(parseParams('?tiles=').showTiles, true);
});

test('the manual capture clock needs fixture as well as clock=manual', () => {
  assert.equal(parseParams('?fixture&clock=manual').manualClock, true);
  assert.equal(parseParams('?fixture=1&clock=manual').manualClock, true);
  assert.equal(parseParams('?clock=manual').manualClock, false, 'a plain page cannot be put on a manual clock');
  assert.equal(parseParams('?fixture=0&clock=manual').manualClock, false);
  assert.equal(parseParams('?fixture&clock=auto').manualClock, false);
  assert.equal(parseParams('?fixture').manualClock, false);
});

test('seed accepts integers, clamps to 0..9999 and rejects everything else', () => {
  assert.equal(parseSeed('0'), 0);
  assert.equal(parseSeed('9999'), 9999);
  assert.equal(parseSeed('10000'), 9999);
  assert.equal(parseSeed('99999999999999999999'), 9999);
  assert.equal(parseSeed('-5'), 0);
  assert.equal(parseSeed('+12'), 12);
  assert.equal(parseSeed(' 42 '), 42);
  assert.equal(parseSeed('12.5'), 7);
  assert.equal(parseSeed('1e3'), 7);
  assert.equal(parseSeed('abc'), 7);
  assert.equal(parseSeed(''), 7);
  assert.equal(parseSeed(null), 7);
  assert.equal(clampSeed(Number.NaN), 7);
  assert.equal(clampSeed(12.9), 12);
  assert.equal(parseParams('?seed=123').seed, 123);
  assert.equal(parseParams('?seed=-1').seed, 0);
});

test('density snaps to the nearest allowed value and defaults on garbage', () => {
  for (const value of DENSITIES) assert.equal(parseParams(`?density=${value}`).density, value);
  assert.equal(parseParams('?density=0.6').density, 0.5);
  assert.equal(parseParams('?density=0.7').density, 0.75);
  assert.equal(parseParams('?density=2').density, 1.25);
  assert.equal(parseParams('?density=0').density, 0.5);
  assert.equal(parseParams('?density=-3').density, 0.5);
  assert.equal(parseParams('?density=lots').density, 1);
  assert.equal(parseParams('?density=').density, 1);
  assert.equal(parseParams('?density=Infinity').density, 1);
  assert.equal(snapDensity(0.625), 0.5, 'a tie resolves to the lower value');
});

test('reduced, paused and capture only switch on with 1; fixture is presence', () => {
  assert.equal(parseParams('?reduced=1').reduced, true);
  assert.equal(parseParams('?reduced=true').reduced, false);
  assert.equal(parseParams('?paused=1').paused, true);
  assert.equal(parseParams('?paused=yes').paused, false);
  assert.equal(parseParams('?capture=1').capture, true);
  assert.equal(parseParams('?capture=0').capture, false);
  assert.equal(parseParams('?fixture').fixture, true);
  assert.equal(parseParams('?fixture=1').fixture, true);
  assert.equal(parseParams('?fixture=0').fixture, false);
  assert.equal(parseParams('?capture=1').fixture, false);
});

test('reduced defers to the OS preference only when the URL is silent', () => {
  assert.equal(parseParams('', { prefersReducedMotion: true }).reduced, true);
  assert.equal(parseParams('?reduced=0', { prefersReducedMotion: true }).reduced, false);
  assert.equal(parseParams('?reduced=1', { prefersReducedMotion: false }).reduced, true);
  assert.equal(parseParams('?reduced=maybe', { prefersReducedMotion: true }).reduced, true);
});

test('the first occurrence of a repeated parameter wins and unknown parameters are ignored', () => {
  const params = parseParams('?seed=5&seed=6&unknown=1&evil=%3Cscript%3E');
  assert.equal(params.seed, 5);
  assert.deepEqual(Object.keys(params).sort(), [
    'backend',
    'buildMs',
    'capture',
    'density',
    'facing',
    'fixture',
    'look',
    'manualClock',
    'paused',
    'reduced',
    'seed',
    'showTiles',
    'startMs',
  ]);
});

test('a full capture URL round-trips', () => {
  assert.deepEqual(
    parseParams('?fixture&capture=1&backend=webgl2&seed=7&look=seed33&build=12000&t=3000&tiles=0&facing=toward&density=1.25&reduced=1&paused=1&clock=manual'),
    {
      backend: 'webgl2',
      seed: 7,
      density: 1.25,
      facing: 'toward',
      look: 'seed33',
      buildMs: 12_000,
      startMs: 3000,
      showTiles: false,
      reduced: true,
      paused: true,
      capture: true,
      fixture: true,
      manualClock: true,
    },
  );
});

test('reseed stays in range and never repeats the current seed', () => {
  assert.equal(reseed(7, () => 0), 8);
  assert.notEqual(reseed(7, () => 0.999999), 7);
  assert.equal(reseed(SEED_MAX, () => 0), 0);
  for (const current of [0, 1, 7, 5000, SEED_MAX]) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const next = reseed(current, () => r);
      assert.ok(Number.isInteger(next) && next >= 0 && next <= SEED_MAX, `in range for ${current}/${r}`);
      assert.notEqual(next, current);
    }
  }
});

test('build choices keep the presets, add an unusual effective value once, and stay sorted', () => {
  assert.deepEqual(buildChoices(12_000), [0, 3000, 6000, 12_000, 24_000]);
  assert.deepEqual(buildChoices(5000), [0, 3000, 5000, 6000, 12_000, 24_000]);
  assert.deepEqual(buildChoices(0), [0, 3000, 6000, 12_000, 24_000]);
});

test('the scrub reaches ten seconds past the build and never sits below the current start time', () => {
  assert.equal(scrubMaxMs(12_000, 0), 22_000);
  assert.equal(scrubMaxMs(0, 0), 10_000);
  assert.equal(scrubMaxMs(12_000, 40_000), 40_000);
  assert.equal(scrubMaxMs(60_000, 0), 60_000);
});
