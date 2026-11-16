import assert from 'node:assert/strict';
import test from 'node:test';
import { SUBSTEP, createWaterSim } from '../src/astral/water-sim.ts';
import type { RoomWater } from '../src/astral/types.ts';

const POOL: RoomWater = { center: [1.2, 0, -5.5], radius: [1.34, 1.25], depth: 1.4 };   // the library's pool
const calm = () => createWaterSim(POOL, { ambient: false });
const run = (sim: ReturnType<typeof calm>, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60); };
const energy = (sim: ReturnType<typeof calm>) => sim.h.reduce((s, h, j) => s + (sim.mask[j] ? h * h + sim.v[j]! * sim.v[j]! : 0), 0);
const mean = (sim: ReturnType<typeof calm>) => {
  let s = 0, n = 0;
  sim.h.forEach((h, j) => { if (sim.mask[j]) { s += h; n++; } });
  return s / n;
};

test('a disturbance spreads as a ring at the wave speed', () => {
  const sim = calm(), [cx, , cz] = POOL.center;
  sim.disturb(cx, cz, 0.02, -1);
  run(sim, 1);
  // along +x from the centre, the strongest crest after one second is about 0.32 m out
  const k = Math.floor((cz - sim.z0) / sim.cell);
  let best = 0, at = 0;
  for (let i = 0; i < sim.nx; i++) {
    const x = sim.x0 + (i + 0.5) * sim.cell - cx;
    if (x < 0.05 || !sim.mask[k * sim.nx + i]) continue;
    const a = Math.abs(sim.h[k * sim.nx + i]!);
    if (a > best) { best = a; at = x; }
  }
  assert.ok(Math.abs(at - 0.32) < 0.08, `crest at ${at.toFixed(3)} m`);
});

test('it dies away, and the mean level stays put', () => {
  const sim = calm(), [cx, , cz] = POOL.center;
  sim.disturb(cx + 0.3, cz - 0.2, 0.05, -1.5);
  sim.disturb(cx - 0.6, cz + 0.3, 0.03, 2);
  run(sim, 1);
  const early = energy(sim);
  run(sim, 12);
  assert.ok(energy(sim) < early * 0.1, 'most of the energy is gone after twelve seconds');
  assert.ok(Math.abs(mean(sim)) < 1e-6, `mean level ${mean(sim)}`);
});

test('nothing moves outside the ellipse, and drops thrown out come down', () => {
  const sim = calm(), [cx, cy, cz] = POOL.center;
  // the viewer dives through the surface
  sim.step(1 / 60, { viewer: [cx, cy + 0.3, cz] });
  for (let y = 0.3; y > -0.5; y -= 0.05) sim.step(1 / 60, { viewer: [cx + 0.2, cy + y, cz] });
  assert.ok(sim.droplets.length > 0, 'breaking the surface throws drops');
  run(sim, 3);
  assert.equal(sim.droplets.length, 0, 'every drop has landed');
  sim.h.forEach((h, j) => { if (!sim.mask[j]) assert.equal(h, 0); });
  assert.equal(sim.disturb(cx + POOL.radius[0] + 0.1, cz, 0.05, -1), false, 'a kick outside the pool does nothing');
  assert.equal(sim.heightAt(cx + POOL.radius[0] + 0.5, cz), 0);
});

test('stable whatever the frame time, and the room is never quite dead', () => {
  const sim = calm(), [cx, , cz] = POOL.center;
  sim.disturb(cx, cz, 0.03, -1);
  run(sim, 0.2);
  const before = Math.max(...sim.h.map(Math.abs)), started = sim.time;
  for (const dt of [5, 1e9, Infinity, NaN, -1, 0.5]) sim.step(dt, { viewer: [NaN, 0, 0], eye: [cx, 0.2, cz], eyeGlow: NaN });
  assert.ok(sim.h.every(Number.isFinite) && sim.v.every(Number.isFinite));
  assert.ok(Math.max(...sim.h.map(Math.abs)) <= before * 1.5, 'no blow-up');
  assert.ok(sim.time - started < 3 * 12 * SUBSTEP + 1e-9, 'a long frame is time lost, not a huge step');

  const alive = createWaterSim(POOL);
  for (let t = 0; t < 30; t += 1 / 60) alive.step(1 / 60);
  const peak = Math.max(...alive.h.map(Math.abs));
  assert.ok(peak > 1e-5 && peak < 0.01, `the ambient pool moves a little (${peak})`);
});
