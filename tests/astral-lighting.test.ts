import assert from 'node:assert/strict';
import test from 'node:test';
import { LIGHTING_START, nextLighting, type LightingState } from '../src/astral/point-field.ts';
import { ASTRAL_LIGHTS, type AstralLight } from '../src/astral/types.ts';

const run = (...lights: AstralLight[]) => lights.reduce<LightingState>(nextLighting, LIGHTING_START);

test('a room starts liminal with its lamps on, and unchanged changes nothing', () => {
  assert.deepEqual(LIGHTING_START, { mood: 'liminal', lamp: true });
  assert.equal(nextLighting(LIGHTING_START, 'unchanged'), LIGHTING_START);
});

test('moods leave the lamp as it is; dark turns it off too', () => {
  assert.deepEqual(run('afternoon'), { mood: 'afternoon', lamp: true });
  assert.deepEqual(run('lamp_off', 'night'), { mood: 'night', lamp: false });
  assert.deepEqual(run('night', 'lamp_on'), { mood: 'night', lamp: true });
  assert.deepEqual(run('dark'), { mood: 'dark', lamp: false });
  assert.deepEqual(run('dark', 'liminal'), { mood: 'liminal', lamp: false });
  assert.deepEqual(run('dark', 'lamp_on'), { mood: 'dark', lamp: true });
});

test('every change is idempotent, so a decision and its reply may both apply it', () => {
  for (const light of ASTRAL_LIGHTS) for (const from of [LIGHTING_START, run('dark'), run('night', 'lamp_off')]) {
    const once = nextLighting(from, light);
    assert.deepEqual(nextLighting(once, light), once, light);
  }
});

test('an unknown value leaves the lighting alone', () => {
  assert.equal(nextLighting(LIGHTING_START, 'disco' as AstralLight), LIGHTING_START);
});
