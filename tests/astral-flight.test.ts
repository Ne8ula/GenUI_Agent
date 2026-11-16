import assert from 'node:assert/strict';
import test from 'node:test';
import { ROOM_CENTRE, TETHER_RADIUS, arrivalPath, holdingGlide, lookAngles, sideView, stepFlight, tetherPull, type FlightState } from '../src/astral/flight.ts';
import { sideTeaseDue } from '../src/astral/tease.ts';

test('side to side is a window in the middle and keeps turning only near the edges', () => {
  assert.deepEqual(sideView(0), { shift: 0, yaw: 0, turn: 0 });
  const right = sideView(0.5), left = sideView(-0.5);
  assert.ok(right.shift > 0 && right.yaw > 0, 'stepping right slides right and looks left');
  assert.equal(right.turn, 0, 'no turning in the middle');
  assert.deepEqual([left.shift, left.yaw, left.turn], [-right.shift, -right.yaw, -0]);
  const edge = sideView(1), near = sideView(0.85);
  assert.ok(near.turn > 0 && near.turn < edge.turn, 'turning grows toward the edge, the same way the window looks');
  assert.equal(sideView(-1).turn, -edge.turn);
  assert.deepEqual(sideView(7), edge, 'clamped');
  assert.deepEqual(sideView(Number.NaN), sideView(0));
});

test('EVA teases only a visitor who is there, has had time, and has not moved side to side', () => {
  const visit = { since: 100, lastInput: 118, lastTease: -Infinity, travelled: 0.1 };
  assert.equal(sideTeaseDue(119, visit), false, 'too soon');
  assert.equal(sideTeaseDue(121, visit), true);
  assert.equal(sideTeaseDue(121, { ...visit, travelled: 0.6 }), false, 'they worked it out');
  assert.equal(sideTeaseDue(121, { ...visit, lastInput: 100 }), false, 'nobody there');
  assert.equal(sideTeaseDue(121, { ...visit, lastTease: 110 }), false, 'just teased');
  assert.equal(sideTeaseDue(141, { ...visit, lastInput: 140, lastTease: 110 }), true, 'again later');
});

const fly = (state: FlightState, thrust: [number, number, number], seconds: number, fps: number) => {
  for (let frame = 0; frame < seconds * fps; frame++) stepFlight(state, thrust, 1 / fps);
};
const speed = (state: FlightState) => Math.hypot(...state.velocity);
const fromCentre = (state: FlightState) => Math.hypot(...state.position.map((value, axis) => value - ROOM_CENTRE[axis]!));

test('flight glides to rest, is frame-rate independent, and is eased back from the void', () => {
  const fast: FlightState = { position: [0, 1, 0], velocity: [0, 0, 0] };
  const slow: FlightState = { position: [0, 1, 0], velocity: [0, 0, 0] };
  fly(fast, [0, 0, -1], 3, 120);
  fly(slow, [0, 0, -1], 3, 20);
  assert.ok(Math.abs(speed(fast) - speed(slow)) < 1e-9, 'same speed at 120 and 20 fps');
  assert.ok(Math.abs(fast.position[2] - slow.position[2]) < 0.1, 'nearly the same distance travelled');

  const cruising = speed(fast);
  fly(fast, [0, 0, 0], 0.5, 60);
  assert.ok(speed(fast) > cruising * 0.6, 'keys released: still coasting half a second later');
  fly(fast, [0, 0, 0], 8, 60);
  assert.ok(speed(fast) < 0.01, 'at rest after a long glide');

  assert.deepEqual(tetherPull([0, 2, 5]), [0, 0, 0], 'no force inside the room');
  const lost: FlightState = { position: [ROOM_CENTRE[0] + 22, ROOM_CENTRE[1], ROOM_CENTRE[2]], velocity: [0, 0, 0] };
  fly(lost, [1, 0, 0], 20, 60);
  assert.ok(fromCentre(lost) < 17, 'flying outward still loses to the pull');
  fly(lost, [0, 0, 0], 30, 60);
  assert.ok(fromCentre(lost) < TETHER_RADIUS + 1, 'drifts back to the edge of the void');
});

test('the tunnel glide never stops or arrives, and the arrival path joins it smoothly and comes to rest', () => {
  let previous = 0;
  for (const seconds of [0.5, 2, 4, 10, 30, 60, 120, 300]) {
    const travelled = holdingGlide(46, seconds);
    assert.ok(travelled > previous && travelled < 46, `still gliding, short of the hold, at ${seconds}s`);
    previous = travelled;
  }
  const speedAt = (t: number) => (holdingGlide(46, t + 0.01) - holdingGlide(46, t)) / 0.01;
  assert.ok(speedAt(0) < 0.01 && speedAt(3.99) > 0.9 * speedAt(4.01), 'eases in from rest without a jolt');

  const p0 = [0, 1.2, 30] as [number, number, number], v0 = [0, 0, -0.8] as [number, number, number], p1 = [0.1, 1.1, 0.7] as [number, number, number];
  assert.deepEqual(arrivalPath(p0, v0, p1, 9, 0), p0);
  assert.deepEqual(arrivalPath(p0, v0, p1, 9, 9).map(v => +v.toFixed(9)), p1);
  const leaving = (arrivalPath(p0, v0, p1, 9, 0.001)[2] - p0[2]) / 0.001;
  assert.ok(Math.abs(leaving - v0[2]) < 0.05, 'leaves with the tunnel glide velocity');
  const settling = (p1[2] - arrivalPath(p0, v0, p1, 9, 8.999)[2]) / 0.001;
  assert.ok(Math.abs(settling) < 0.05, 'arrives at rest');

  assert.deepEqual(lookAngles([0, 1, 0], [0, 1, -5]).map(angle => angle + 0), [0, 0]);
  assert.ok(Math.abs(lookAngles([0, 1, 0], [-5, 1, 0])[0] - Math.PI / 2) < 1e-9, 'looking toward −x is yaw +π/2');
});
