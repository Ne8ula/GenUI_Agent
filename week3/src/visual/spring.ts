/**
 * Pure damped-spring ("SmoothDamp"-style) helpers.
 *
 * These are the only motion primitives the renderer uses: every animated
 * quantity (fold amplitude, gathering, box position, fragmentation...) is a
 * `Kinematic` stepped toward a target each frame. Retargeting is just
 * calling `stepKinematic` with a new `target` — the current value and
 * velocity are always carried forward, so switching stance or turn state
 * mid-motion continues smoothly instead of resetting
 * (week3/DESIGN.md#6: "Retarget midway without resetting the object or its
 * animation clock").
 */

export interface Kinematic {
  readonly value: number;
  readonly velocity: number;
}

export function createKinematic(value = 0, velocity = 0): Kinematic {
  return { value, velocity };
}

/**
 * Critically-damped smoothing (Game Programming Gems 4 formula, the same
 * one behind Unity's Mathf.SmoothDamp). Stable for variable frame delta and
 * never overshoots the target when maxSpeed is left unbounded.
 */
export function smoothDamp(
  current: number,
  velocity: number,
  target: number,
  smoothTime: number,
  dt: number,
  maxSpeed: number = Infinity
): Kinematic {
  const st = Math.max(0.0001, smoothTime);
  const safeDt = Math.max(0, dt);
  if (safeDt === 0) {
    return { value: current, velocity };
  }
  const omega = 2 / st;
  const x = omega * safeDt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const originalTo = target;
  const maxChange = maxSpeed * st;
  let change = clampMagnitude(current - target, maxChange);
  const clampedTarget = current - change;
  const temp = (velocity + omega * change) * safeDt;
  let newVelocity = (velocity - omega * temp) * exp;
  let newValue = clampedTarget + (change + temp) * exp;
  // Prevent tiny overshoot past the (possibly clamped) target on the final approach.
  if (originalTo - current > 0 === newValue > originalTo) {
    newValue = originalTo;
    newVelocity = (newValue - originalTo) / safeDt;
  }
  return { value: newValue, velocity: newVelocity };
}

function clampMagnitude(value: number, max: number): number {
  if (!Number.isFinite(max)) return value;
  return Math.min(max, Math.max(-max, value));
}

/** Step a single Kinematic toward `target`. Pure: returns a new object. */
export function stepKinematic(
  k: Kinematic,
  target: number,
  smoothTime: number,
  dt: number,
  maxSpeed?: number
): Kinematic {
  return smoothDamp(k.value, k.velocity, target, smoothTime, dt, maxSpeed);
}

/** Instantly snap a Kinematic to `target` with zero velocity (reduced motion). */
export function snapKinematic(target: number): Kinematic {
  return { value: target, velocity: 0 };
}

/**
 * Remap `target` to the closest angular equivalent of `current` (shortest
 * path around the circle) before spring-stepping an angle, so a fold or box
 * anchor never spins the long way around when retargeted.
 */
export function nearestEquivalentAngle(current: number, target: number): number {
  const twoPi = Math.PI * 2;
  let diff = (target - current) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  return current + diff;
}

/** Step an angular Kinematic, taking the shortest path to `target`. */
export function stepAngleKinematic(
  k: Kinematic,
  target: number,
  smoothTime: number,
  dt: number
): Kinematic {
  const wrapped = nearestEquivalentAngle(k.value, target);
  return stepKinematic(k, wrapped, smoothTime, dt);
}
