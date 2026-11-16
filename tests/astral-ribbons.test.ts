import assert from 'node:assert/strict';
import test from 'node:test';
import { dealOrigins, finish, groupPoints, slabKeySteps, tunnelOrder, tunnelOriginKeys } from '../src/astral/ribbons.ts';

test('groups follow position: two far-apart blobs never share a group', () => {
  const n = 2000, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (i % 2 ? 10 : 0) + (i % 7) * 0.01; pos[i * 3 + 1] = (i % 5) * 0.01; pos[i * 3 + 2] = (i % 11) * 0.01; }
  const g = groupPoints(pos, n, 2);
  assert.notEqual(g.group[0], g.group[1]);
  for (let i = 2; i < n; i++) assert.equal(g.group[i], g.group[i % 2]);
  assert.equal(g.sizes[0]! + g.sizes[1]!, n);
  for (const u of g.u) assert.ok(u >= 0 && u < 1);
});

test('origins are dealt in key order and every origin is used when destinations outnumber them', () => {
  const dest = Float32Array.from({ length: 100 }, (_, i) => ((i * 37) % 100) / 100);
  const origin = Float32Array.from({ length: 40 }, (_, j) => ((j * 13) % 40) / 40);
  const from = dealOrigins(dest, origin);
  const byDest = [...dest.keys()].sort((x, y) => dest[x]! - dest[y]!);
  for (let r = 1; r < byDest.length; r++) assert.ok(origin[from[byDest[r]!]!]! >= origin[from[byDest[r - 1]!]!]!);
  assert.equal(new Set(from).size, 40);
});

test('slab keys lay a long ring down as a short box: same share along it, same side of the axis', () => {
  // origins: a ring 50 m long round the z axis; destinations: floor (y = -1) and ceiling (y = +1) of a box 5 m long
  const no = 6000, n = 9000, ring = new Float32Array(no * 3), box = new Float32Array(n * 3);
  for (let j = 0; j < no; j++) { const t = (j * 0.618034 % 1) * 2 * Math.PI; ring[j * 3] = 3 * Math.cos(t); ring[j * 3 + 1] = 3 * Math.sin(t); ring[j * 3 + 2] = 50 * ((j * 0.414214) % 1); }
  for (let i = 0; i < n; i++) { box[i * 3] = ((i * 0.7548777) % 1) * 4 - 2; box[i * 3 + 1] = i % 2 ? 1 : -1; box[i * 3 + 2] = 5 * ((i * 0.5698403) % 1); }
  const from = dealOrigins(finish(slabKeySteps(box, n, 16, 0, 0)), finish(slabKeySteps(ring, no, 16, 0, 0)));
  let sameSide = 0, alongErr = 0;
  for (let i = 0; i < n; i++) {
    const j = from[i]!;
    if (Math.sign(ring[j * 3 + 1]!) === Math.sign(box[i * 3 + 1]!)) sameSide++;
    alongErr = Math.max(alongErr, Math.abs(ring[j * 3 + 2]! / 50 - box[i * 3 + 2]! / 5));
  }
  assert.ok(sameSide / n > 0.97, `same side ${sameSide / n}`);
  assert.ok(alongErr < 2 / 16, `share along ${alongErr}`);   // within about one slab
  assert.equal(new Set(from).size, no);
});

test('tunnel bands hold their groups\' shares, nearest band first, ordered round the spiral within', () => {
  const n = 4000, pos = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) { const t = (j % 97) / 97 * 2 * Math.PI - Math.PI + 0.001; pos[j * 3] = Math.cos(t); pos[j * 3 + 1] = Math.sin(t); pos[j * 3 + 2] = j / n * 10; }
  const key = tunnelOriginKeys(tunnelOrder(pos, n, 0, 0), [1, 1, 2], 2);   // two bands: the first half and the second half of the tunnel
  for (let j = 0; j < n; j++) assert.equal(key[j]! < 0.5, pos[j * 3 + 2]! < 5, `grain ${j}`);
  for (const k of key) assert.ok(k >= 0 && k < 1);
});
