// EVA's fits: when the eye convulses, how hard, and which pieces of it tear away. Pure, so it can be tested; eye.ts draws it.
// Nothing here repeats: lulls and fits are drawn at random lengths, every torn piece keeps its own timing, and the whole judders
// on a clock of its own.

/** How a torn piece behaves. 0 shear: a full-width band slides sideways. 1 fling: a fragment is flung off in any direction,
 * turning as it goes, and trails a tapering wisp back to where it came from. 2 ghost: an after-image of a region hangs displaced.
 * 3 drag: a thin column is dragged a long way down or up from the lids. */
export type TearMode = 0 | 1 | 2 | 3;

/** How many torn pieces the shader takes at once. */
export const TEAR_SLOTS = 8;

export interface Tear {
  readonly id: number;
  readonly mode: TearMode;
  /** Its home in the eye's frame (one unit wide, y -0.25..0.25): x0, y0, x1, y1. */
  readonly rect: readonly [number, number, number, number];
  /** Where it is now, relative to home, in eye widths. */
  dx: number;
  dy: number;
  /** How far it has turned, radians. */
  angle: number;
  vx: number;
  vy: number;
  va: number;
  tx: number;
  ty: number;
  ta: number;
  k: number;
  born: number;
  next: number;
  end: number;
}

export interface Mood {
  /** Mean seconds of lull between fits; Infinity for none. */
  gap: number;
  /** Mean length of a fit, seconds. */
  length: number;
  /** How violent a fit is, 0..1. */
  power: number;
  /** Restlessness between fits, 0..1. */
  rest: number;
  /** Whether pieces may tear away at all. */
  tears: boolean;
}

export interface Fits {
  /** Excitement right now, 0..1: jagged, high in a fit. */
  readonly level: number;
  /** Re-rolled at each fit and now and then within one: the shader's band layout. */
  readonly seed: number;
  /** The whole eye's judder: offset x, y (eye widths) and stretch x, y. */
  readonly jolt: readonly [number, number, number, number];
  readonly tears: readonly Tear[];
  setMood(mood: Mood, time: number): void;
  /** A fit now (a sudden peak in EVA's voice). */
  kick(power: number, time: number): void;
  update(time: number, dt: number): void;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const X_EXTENT = 1.3;
/** The furthest a piece is thrown, in eye widths (it may overshoot a little past this on its spring). */
export const THROW = { x: 1.4, y: 0.65, angle: 0.6 } as const;

export function createFits(rng: () => number = Math.random): Fits {
  const random = (low: number, high: number) => low + rng() * (high - low);
  const sign = () => (rng() < 0.5 ? -1 : 1);
  let mood: Mood = { gap: Infinity, length: 0, power: 0, rest: 0, tears: false };
  let level = 0, seed = rng(), nextFit = Infinity, fitEnd = -Infinity, fitPower = 0;
  let flutter = 1, nextFlutter = 0, nextSpawn = 0, nextJolt = 0, nextId = 1;
  const jolt: [number, number, number, number] = [0, 0, 1, 1];
  const target: [number, number, number, number] = [0, 0, 1, 1];
  const tears: Tear[] = [];

  // Exponential lulls (a fit can come at any moment), clipped so one is never instant nor endless.
  const lull = () => (Number.isFinite(mood.gap) ? mood.gap * clamp(-Math.log(1 - rng()), 0.08, 4) : Infinity);

  const startFit = (power: number, time: number) => {
    fitPower = clamp(power, 0, 1);
    fitEnd = time + mood.length * random(0.3, 1.7);
    seed = rng();
    nextSpawn = time;
    nextFit = fitEnd + lull();
  };

  const spawn = (time: number) => {
    const roll = rng(), a = level;
    let mode: TearMode, rect: [number, number, number, number], tx: number, ty = 0, ta = 0;
    const y = random(-0.18, 0.18);
    if (roll < 0.2) {
      mode = 0;
      const h = random(0.006, 0.12);
      rect = [-X_EXTENT, y - h / 2, X_EXTENT, y + h / 2];
      tx = sign() * random(0.1, 1) * a;
    } else if (roll < 0.68) {
      // a lit piece of the eye flung along any line, more often sideways than up or down, and turning as it goes
      mode = 1;
      const w = random(0.08, 0.45), h = random(0.02, 0.15), x = random(-0.38, 0.38 - w), yc = random(-0.08, 0.14);
      rect = [x, yc - h / 2, x + w, yc + h / 2];
      tx = sign() * random(0.25, THROW.x) * a;
      ty = random(-THROW.y, THROW.y) * 0.7 * a;
      ta = random(-THROW.angle, THROW.angle) * a;
    } else if (roll < 0.88) {
      // dragged from the lids, mostly down, sometimes up
      mode = 3;
      const w = random(0.005, 0.05), x = random(-0.4, 0.4);
      const down = rng() < 0.7;
      rect = down ? [x, -0.27, x + w, random(-0.05, 0.2)] : [x, random(-0.2, 0.05), x + w, 0.27];
      tx = random(-0.02, 0.02) * a;
      ty = (down ? -1 : 1) * random(0.15, THROW.y + 0.1) * a;
    } else {
      mode = 2;
      const w = random(0.2, 0.6), h = random(0.05, 0.22), x = random(-0.45, 0.45 - w);
      rect = [x, y - h / 2, x + w, y + h / 2];
      tx = sign() * random(0.05, 0.4) * a;
      ty = random(-0.15, 0.15) * a;
      ta = random(-0.3, 0.3) * a;
    }
    tears.push({ id: nextId++, mode, rect, dx: 0, dy: 0, angle: 0, vx: 0, vy: 0, va: 0, tx, ty, ta, k: random(500, 2200), born: time,
      next: time + random(0.03, 0.25), end: time + random(0.1, 0.9) * (0.5 + a) });
  };

  return {
    get level() { return level; },
    get seed() { return seed; },
    get jolt() { return jolt; },
    get tears() { return tears; },
    setMood(next, time) {
      const changed = next.gap !== mood.gap || next.tears !== mood.tears;
      mood = next;
      if (!mood.tears) {
        // let go of everything at once
        fitEnd = Math.min(fitEnd, time);
        for (const tear of tears) tear.end = Math.min(tear.end, time);
      }
      if (changed) nextFit = time + lull();
    },
    kick(power, time) {
      if (mood.tears && (power > fitPower * 0.6 || time >= fitEnd)) startFit(power, time);
    },
    update(time, dt) {
      if (time >= nextFit) startFit(mood.power * random(0.5, 1), time);
      if (time >= nextFlutter) {
        flutter = random(0.3, 1);
        nextFlutter = time + random(0.025, 0.13);
        if (time < fitEnd && rng() < 0.08) seed = rng();
      }
      const fit = time < fitEnd ? fitPower * flutter : fitPower * Math.exp(-(time - fitEnd) / 0.2);
      level = clamp(Math.max(mood.rest * (0.7 + 0.3 * flutter), fit), 0, 1);

      if (mood.tears && level > 0.18 && time >= nextSpawn) {
        if (tears.length < TEAR_SLOTS) spawn(time);
        nextSpawn = time + random(0.02, 0.24) / (0.3 + level);
      }

      // The whole eye judders on its own clock and keeps re-forming.
      if (time >= nextJolt) {
        nextJolt = time + random(0.025, 0.16);
        const a = level * level;
        const r = rng();
        if (r < 0.3) target.splice(0, 4, 0, 0, 1, 1);
        // now and then it stretches tall for a moment, not only wide
        else if (r < 0.55) target.splice(0, 4, random(-0.04, 0.04) * a, random(-0.06, 0.06) * a, 1 - random(0, 0.2) * a, 1 + random(0.25, 0.9) * a);
        else target.splice(0, 4, random(-0.1, 0.1) * a, random(-0.03, 0.03) * a, 1 + random(-0.15, 0.4) * a, 1 + random(-0.25, 0.15) * a);
      }
      // a jolt snaps, a re-forming settles
      const snap = 1 - Math.exp(-dt / 0.012);
      for (let i = 0; i < 4; i++) jolt[i] = jolt[i]! + (target[i]! - jolt[i]!) * snap;

      // Each piece: a stiff, under-damped spring toward where it is thrown, re-thrown at its own random moments, then let go.
      const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
      for (let i = tears.length - 1; i >= 0; i--) {
        const tear = tears[i]!;
        if (time >= tear.end) {
          tear.tx = tear.ty = tear.ta = 0;
          if (time > tear.end + 0.6 || (Math.abs(tear.dx) + Math.abs(tear.dy) + Math.abs(tear.angle) < 0.002 && Math.abs(tear.vx) + Math.abs(tear.vy) < 0.05)) {
            tears.splice(i, 1);
            continue;
          }
        } else if (time >= tear.next) {
          tear.next = time + random(0.03, 0.3);
          // thrown further, whipped back across home, let half-way back, or flung somewhere new
          const r = rng();
          if (r < 0.8) {
            const s = r < 0.4 ? random(1.2, 1.9) : r < 0.62 ? random(-0.9, -0.3) : random(0.1, 0.5);
            tear.tx *= s;
            tear.ty *= s;
            tear.ta *= s;
          } else if (tear.mode === 1 || tear.mode === 2) {
            tear.tx = sign() * random(0.2, THROW.x) * level;
            tear.ty = random(-THROW.y, THROW.y) * 0.7 * level;
            tear.ta = random(-THROW.angle, THROW.angle) * level;
          }
          tear.tx = clamp(tear.tx, -THROW.x, THROW.x);
          tear.ty = clamp(tear.ty, -THROW.y - 0.1, THROW.y + 0.1);
          tear.ta = clamp(tear.ta, -THROW.angle, THROW.angle);
        }
        const c = 2 * 0.35 * Math.sqrt(tear.k);
        for (let s = 0; s < steps; s++) {
          tear.vx += (tear.k * (tear.tx - tear.dx) - c * tear.vx) * h;
          tear.vy += (tear.k * (tear.ty - tear.dy) - c * tear.vy) * h;
          tear.va += (tear.k * (tear.ta - tear.angle) - c * tear.va) * h;
          tear.dx += tear.vx * h;
          tear.dy += tear.vy * h;
          tear.angle += tear.va * h;
        }
      }
    },
  };
}
