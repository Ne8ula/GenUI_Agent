// Head-coupled asymmetric-frustum projection (planning.md §6.2), implemented independently.
// Frame: screen-centred metres, x right, y up, z toward the viewer; the physical screen
// lies in z = 0, so z = 0 is the zero-parallax plane (the cup sits there).

export type Vec3 = readonly [number, number, number];

export interface Screen {
  widthM: number;
  heightM: number;
}

export interface Frustum {
  left: number;
  right: number;
  bottom: number;
  top: number;
  near: number;
  far: number;
}

export const MIN_EYE_DISTANCE_M = 0.05;

function finite(...xs: number[]): boolean {
  return xs.every((x) => Number.isFinite(x));
}

export function checkScreen(screen: Screen): void {
  if (!finite(screen.widthM, screen.heightM) || screen.widthM <= 0 || screen.heightM <= 0) {
    throw new RangeError('screen dimensions must be finite and positive');
  }
}

// Screen size from a physically entered width and the display's pixel aspect ratio.
export function screenFromWidth(widthM: number, pixelsWide: number, pixelsHigh: number): Screen {
  if (!finite(widthM, pixelsWide, pixelsHigh) || pixelsWide <= 0 || pixelsHigh <= 0) {
    throw new RangeError('invalid screen calibration input');
  }
  if (widthM < 0.2 || widthM > 1.5) throw new RangeError('screen width outside the plausible 0.2–1.5 m range');
  return { widthM, heightM: (widthM * pixelsHigh) / pixelsWide };
}

export function offAxisFrustum(eye: Vec3, screen: Screen, near: number, far: number): Frustum {
  checkScreen(screen);
  const [ex, ey, ez] = eye;
  if (!finite(ex, ey, ez, near, far)) throw new RangeError('eye and clip planes must be finite');
  if (ez < MIN_EYE_DISTANCE_M) throw new RangeError('eye must be in front of the screen');
  if (!(near > 0 && far > near)) throw new RangeError('require 0 < near < far');
  const k = near / ez;
  return {
    left: (-screen.widthM / 2 - ex) * k,
    right: (screen.widthM / 2 - ex) * k,
    bottom: (-screen.heightM / 2 - ey) * k,
    top: (screen.heightM / 2 - ey) * k,
    near,
    far,
  };
}

// Column-major 4x4, matching the glFrustum / three.js makePerspective convention.
export function frustumMatrix(f: Frustum): Float64Array {
  const { left: l, right: r, bottom: b, top: t, near: n, far: fa } = f;
  const m = new Float64Array(16);
  m[0] = (2 * n) / (r - l);
  m[5] = (2 * n) / (t - b);
  m[8] = (r + l) / (r - l);
  m[9] = (t + b) / (t - b);
  m[10] = -(fa + n) / (fa - n);
  m[11] = -1;
  m[14] = (-2 * fa * n) / (fa - n);
  return m;
}

// The view transform is a pure translation because the screen is axis-aligned in this frame.
export function viewMatrix(eye: Vec3): Float64Array {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  m[12] = -eye[0];
  m[13] = -eye[1];
  m[14] = -eye[2];
  return m;
}

function mul(m: Float64Array, v: readonly [number, number, number, number]): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) {
    out[row] = (m[row] ?? 0) * v[0] + (m[4 + row] ?? 0) * v[1] + (m[8 + row] ?? 0) * v[2] + (m[12 + row] ?? 0) * v[3];
  }
  return out;
}

export interface Projected {
  ndc: [number, number, number];
  // Where the point lands on the physical screen, in metres.
  screen: [number, number];
  visible: boolean;
}

export function projectPoint(eye: Vec3, screen: Screen, p: Vec3, near = 0.01, far = 200): Projected {
  const f = offAxisFrustum(eye, screen, near, far);
  const view = mul(viewMatrix(eye), [p[0], p[1], p[2], 1]);
  const clip = mul(frustumMatrix(f), view);
  const w = clip[3];
  if (!(w > 0)) return { ndc: [Number.NaN, Number.NaN, Number.NaN], screen: [Number.NaN, Number.NaN], visible: false };
  const ndc: [number, number, number] = [clip[0] / w, clip[1] / w, clip[2] / w];
  const visible = ndc.every((c) => c >= -1 && c <= 1);
  return { ndc, screen: [(ndc[0] * screen.widthM) / 2, (ndc[1] * screen.heightM) / 2], visible };
}

// Head-coupling gain: 0 holds the neutral viewpoint, 1 follows the head fully.
export function coupledEye(neutral: Vec3, tracked: Vec3, gain: number): Vec3 {
  const g = Math.min(Math.max(Number.isFinite(gain) ? gain : 0, 0), 1);
  return [
    neutral[0] + (tracked[0] - neutral[0]) * g,
    neutral[1] + (tracked[1] - neutral[1]) * g,
    neutral[2] + (tracked[2] - neutral[2]) * g,
  ];
}
