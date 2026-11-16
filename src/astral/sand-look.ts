// The 'sand' look (?look=sand) and the object change. Grain, tone pass, AWAY styles and travels adapted from Gather 聚 v17 by DAO
// (be-of-dao.com), used under the owner's Patreon Source licence.
//
// Sand: a settled room's grains are drawn as Gather draws them instead of as our opaque squares: a fine stipple of small soft round
// grains of varied size, scattered off the room's rows, each adding how much it covers to a float buffer (counted), which a tone pass
// turns into the picture. How many grains there are carries the brightness; each grain carries the hue.
// A room is seen from inside, with surfaces behind one another and near walls filling the screen, where Gather's picture is one
// surface seen from in front. So only the front surface along each ray is drawn (a depth pass of the same grains first), and where
// the room's grains are further apart on screen than the stipple, they are drawn again, scattered (Gather's DETAIL passes).
// The tunnel, the arrival and any other flight stay in the field's own additive pass.
//
// The object change (both looks, so captures compare the grain alone): what stands in a hero's box leaves by one of Gather's AWAY
// styles, and the object that replaces it arrives by one of its travels. point-field.ts calls the pieces here; nothing else knows about them.
import {
  AddEquation, AlwaysDepth, BufferAttribute, BufferGeometry, CustomBlending, DepthTexture, GLSL3, HalfFloatType, Mesh, NearestFilter, NoBlending,
  OneFactor, OneMinusSrcColorFactor, ShaderMaterial, Vector2, WebGLRenderTarget, type Points,
} from 'three';
import { boxDistance, type Box, type Vec3 } from './inspect.ts';
import type { PointCloud } from './types.ts';

// Sand. Pixel figures are at 1080 lines and scale with the render height. Tune exposure first (the whole picture), then SAND_FULL
// (how much black there is between grains), then the pitch and copies (how fine the stipple is, against the frame time).
const SAND_EXPOSURE = 0.8;      // the tone pass scales the counted sum by it (Gather's EXPOSURE; 1 is its middle)
const SAND_HIGHLIGHTS = 0.75;   // Gather's HIGHLIGHTS default: how gently crowded parts reach white; 1 is plain 1 - exp(-x)
const SAND_PITCH_PX = 1;        // the stipple: where the room's grains are further apart on screen than this, DETAIL copies fill in
// At most this many DETAIL passes; each is every grain of the room through the vertex shader. In headless Chrome at 1920x1080 on an
// RTX 5080, 10 held 60 frames a second, 12 dropped an occasional frame and 15 about half of them.
const SAND_COPIES = 10;
const SAND_NEAR_PX = [6, 12];   // where the room's grains are this far apart on screen a surface starts to open up, and is fully open
const SAND_SPACINGS = 1.3;      // a grain's diameter in pitches of the stipple, held within Gather's 1.3 to 3.6 pixels
const SAND_FLIGHT = 0.6;        // a grain's light while a change has it in flight, as a share of its light at rest
// Density carries the brightness: of a surface this bright every grain would be drawn; of a darker one only its share, each lifted
// to this, so there is black between them. Above 1 no surface is that bright: even the palest keeps two grains in three.
const SAND_FULL = 1.5;
const SAND_KEEP_MIN = 0.06;     // the darkest surfaces still keep this share, so a single grain is never lifted without limit
const SAND_JITTER = 1;          // how far off its place a grain is scattered, in cells of the room's rows: 1 fills the cell and leaves no rows
const SAND_DEPTH_DISC = 2;      // the depth pass closes each surface with discs this many spacings across (the rows are 1.41 apart)
// A grain may lie this many metres behind the front surface and still count as part of it. The recorded room's surfaces are shells of
// overlapping patches a few centimetres thick; shelves and their books are further apart than this.
const SAND_BIAS = 0.05;
const SAND_BIAS_SLOPE = 1.5;    // and the slant's rise across the two discs, with room for the normals being rough
const SAND_MAX_PX = 8;          // a grain's largest diameter, whatever enlarges it (a change, an inspection)

// The object change.
export const SWAP_SECONDS = 5;
const SWAP_SPREAD = 0.30;       // shares of the change: between the first grain letting go and the last,
const SWAP_LEAVE = 0.35;        // one grain leaving,
const SWAP_BACK = 0.35;         // and one grain of the new object arriving. They add up to 1
const SWAP_REACH = 1.0;         // how far the leaving grains go, in halves of the hero's longest side
const SWAP_CHUNKS = 2.5;        // SHATTER: chunks per half of the hero's longest side
/** Gather v17's own codes: `away` is its uDStyle (how the sand leaves), `back` its travel (the flight's mode). G steps through in order. */
export const SWAP_PAIRINGS = [
  { name: 'burn, fall', away: 2, back: 5 },
  { name: 'shatter, spiral', away: 1, back: 4 },
  { name: 'glitch, morph', away: 5, back: 2 },
] as const;

/** One object change: which hero, which pairing, and either running since `at` (progress null) or held at `progress`. */
export interface Swap { readonly hero: number; readonly pairing: number; readonly progress: number | null; readonly at: number }
export const SWAP_NONE: Swap = Object.freeze({ hero: -1, pairing: 0, progress: null, at: 0 });

/** What createPointField adds to PointField for the change. */
export interface SwapControl {
  /**
   * Hero `hero` is replaced. `room` is the room after the change (object-points.ts's replaceHero): the grains it has in that hero's
   * box are the new object. What stands in the box now leaves by SWAP_PAIRINGS[pairing] and they arrive, from now over SWAP_SECONDS
   * (progress null) or held at `progress` 0..1. Every other grain is left exactly as it is. False, and nothing changes, when any of
   * it is invalid or a new room is on its way.
   */
  replaceHero(hero: number, room: PointCloud, pairing: number, progress: number | null): boolean;
  /** How far the room steps back behind what is shown in front of it (the menu), 0..1. It eases, and only shows while a hero is inspected. */
  setStepBack(amount: number): void;
}

/** The grains `room` has in hero `hero`'s box, edges included, as the room's loaders count them. After a replacement they are the new object. Null without that hero or without normals. */
export function heroGrains(room: PointCloud, hero: number): { count: number; positions: Float32Array; colors: Float32Array; normals: Float32Array } | null {
  const box = room.heroes?.[hero], P = room.positions, at: number[] = [];
  if (!box || !room.normals) return null;
  for (let i = 0, j = 0; i < room.count; i++, j += 3) {
    if (P[j]! >= box.min[0] && P[j]! <= box.max[0] && P[j + 1]! >= box.min[1] && P[j + 1]! <= box.max[1] && P[j + 2]! >= box.min[2] && P[j + 2]! <= box.max[2]) at.push(j);
  }
  const positions = new Float32Array(at.length * 3), colors = new Float32Array(at.length * 3), normals = new Float32Array(at.length * 3);
  at.forEach((j, o) => {
    for (let k = 0; k < 3; k++) { positions[o * 3 + k] = P[j + k]!; colors[o * 3 + k] = room.colors[j + k]!; normals[o * 3 + k] = room.normals![j + k]!; }
  });
  return { count: at.length, positions, colors, normals };
}

/** ?swap=<hero index>,<pairing index>,<progress 0..1>: a change held still, for matching captures. Null unless all three are valid. */
export function parseSwap(search: string): { hero: number; pairing: number; progress: number } | null {
  const parts = new URLSearchParams(search).get('swap')?.split(',') ?? [];
  if (parts.length !== 3 || parts.some(part => part.trim() === '')) return null;
  const [hero, pairing, progress] = parts.map(Number) as [number, number, number];
  if (!Number.isInteger(hero) || hero < 0 || !Number.isInteger(pairing) || pairing < 0 || pairing >= SWAP_PAIRINGS.length) return null;
  return progress >= 0 && progress <= 1 ? { hero, pairing, progress } : null;
}

/** The hero a change acts on: the one being inspected, else the nearest to the viewer; -1 in a room without heroes. */
export function swapHero(inspected: number, heroes: readonly Box[], position: Vec3): number {
  if (Number.isInteger(inspected) && inspected >= 0 && inspected < heroes.length) return inspected;
  let nearest = -1, least = Infinity;
  heroes.forEach((box, i) => { const d = boxDistance(position, box); if (d < least) { least = d; nearest = i; } });
  return nearest;
}

/** The shader's uSwap.xyz at `time`: hero (-1 when nothing is changing), progress 0..1, seconds into the change. A running change ends by itself; a held one stays. */
export function swapNow(swap: Swap, time: number): [number, number, number] {
  if (swap.hero < 0) return [-1, 0, 0];
  const s = swap.progress ?? (time - swap.at) / SWAP_SECONDS;
  if (!(s >= 0) || (swap.progress === null && s >= 1)) return [-1, 0, 0];
  const held = Math.min(1, s);
  return [swap.hero, held, held * SWAP_SECONDS];   // a held change's clock is its progress, so two captures of it match
}

const f = (x: number) => x.toFixed(4);

/**
 * Vertex shader, before main(): swapGrain, called for every grain. Needs the field's uHeroMin/uHeroMax/uHeroN, h01, ease, flow, rot
 * and PI. The styles work in Gather's picture space: here the hero's box, its longest side from -1 to 1.
 * shortcut: Gather's picture axes are taken as the room's (x across, y up, z depth), which is how the arrival view sees it; turn the
 * frame to the viewer if a change seen from the side reads wrong (GLITCH's rows jump along x).
 */
export const SWAP_VS = /* glsl */ `
uniform vec4 uSwap;        // which hero (-1: none), how far through the change 0..1, seconds into it, 1 when its grains stay in the settled pass (sand)
uniform vec3 uSwapStyle;   // Gather's codes: how they leave (1 SHATTER, 2 BURN, 5 GLITCH), how the new ones arrive (2 MORPH, 4 SPIRAL, 5 FALL); 1 when it is the room's own grains that leave
uniform float uHeroOut[MAX_HERO];   // 1 once the room's own grains in that hero's box have been replaced
uniform float uStepBack;   // how far the room steps back behind the menu, 0..1
in float aObj;             // 0, or absent: one of the room's own grains. k+1: a grain of the object that replaced hero k. -(k+1): of that object as it leaves
const vec2 SWAP_WIND = vec2(0.45, 0.2);   // Gather's drift direction, fixed
float hf(vec3 v) { return fract(sin(dot(v, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void swapGrain(uint i, inout vec3 p, inout vec3 col, inout float alive, inout float nk, inout float wsz, out float hot) {
  hot = 0.0;
  // Whose grain this is. One of an object that replaced a hero leaves or arrives while that hero changes. One of the room's own, in
  // a hero's box that has been replaced, leaves in that hero's first change and is gone ever after.
  int k = int(uSwap.x), ok = int(abs(aObj) + 0.5) - 1;
  float role = 0.0;          // 1: it leaves. 2: it arrives
  if (ok >= 0) role = ok != k ? 0.0 : aObj < 0.0 ? 1.0 : 2.0;
  else for (int h = 0; h < MAX_HERO; h++) {
    if (h >= uHeroN) break;
    if (uHeroOut[h] > 0.5 && all(greaterThanEqual(position, uHeroMin[h])) && all(lessThanEqual(position, uHeroMax[h]))) {
      if (h == k && uSwapStyle.z > 0.5) role = 1.0; else alive = 0.0;
    }
  }
  if (role < 0.5 || k < 0 || k >= uHeroN) return;
  vec3 lo = uHeroMin[k], hi = uHeroMax[k];
  vec3 mid = 0.5 * (lo + hi); float S = 0.5 * max(hi.x - lo.x, max(hi.y - lo.y, hi.z - lo.z));
  vec3 a = (position - mid) / S, q = a, own = col;
  int away = int(uSwapStyle.x + 0.5), back = int(uSwapStyle.y + 0.5);
  float T = uSwap.z, rd = h01(i * 2654435761u + 977u), r1 = h01(i * 3u + 17u), r3 = h01(i * 11u + 71u), r4 = h01(i * 17u + 113u);
  // SHATTER's chunks: the object cracks along a warped grid
  vec3 cell = floor(a * ${f(SWAP_CHUNKS)} + 0.45 * sin(a.yzx * 9.0)), cen = (cell + 0.5) / ${f(SWAP_CHUNKS)};
  float c1 = hf(cell), c2 = hf(cell + 17.3), c3 = hf(cell + 41.9), c4 = hf(cell + 73.1);
  // Each grain runs the change on its own clock, so some of the old object are still leaving while some of the new have arrived:
  // softly staggered, top first for FALL (Gather's delay), a chunk at a time for SHATTER.
  float key = rd;
  if (back == 5) key = clamp((1.0 - a.y) * 0.5, 0.0, 1.0) * 0.625 + rd * 0.375;
  if (away == 1) key = c2;
  float t = (uSwap.y - ${f(SWAP_SPREAD)} * key) / ${f(SWAP_LEAVE)};   // 0: an old grain lets go. 1: it is gone, and a new one sets out
  float gone = clamp(t, 0.0, 1.0), m = clamp((t - 1.0) * ${f(SWAP_LEAVE / SWAP_BACK)}, 0.0, 1.0);

  // Leaving: Gather's AWAY styles, one life instead of its repeating ones
  float tr = gone * sqrt(gone), reach = ${f(SWAP_REACH)} * (0.55 + 0.9 * r3), ash = 0.0, flick = 1.0, szK = 1.0 - 0.45 * gone;
  if (away == 2) {          // BURN: a grain heats up, lets go as an ember, cools to grey ash and floats up and out
    hot = t < 0.0 ? smoothstep(-0.3, 0.0, t) * smoothstep(0.0, 0.04, uSwap.y) : 1.0 - smoothstep(0.14, 0.5, gone);
    ash = smoothstep(0.22, 0.6, gone);
    vec3 tb = flow(a * 1.7 + vec3(r4 * 7.0, r1 * 5.0, r3 * 3.0), T * 0.3 + gone * 2.5);
    q.y += reach * tr * (0.55 + 0.6 * r3) * (0.4 + ash);
    q.x += sin(gone * 5.0 + r1 * 6.28 + T * 0.5) * 0.08 * reach * ash;
    q += tb * tr * reach * 0.3 + vec3(SWAP_WIND, 0.0) * reach * tr * 0.25;
    szK *= (1.0 + 0.7 * hot) * (1.0 - 0.55 * ash);
  } else if (away == 1) {   // SHATTER: each chunk leaves whole, tumbling slowly as it goes, and falls
    float rc = ${f(SWAP_REACH)} * (0.6 + 0.8 * c3), an = tr * (1.5 + 3.0 * c4), cA = cos(an), sA = sin(an);
    vec3 ax = normalize(vec3(c1, c4, c2) - 0.5 + 0.001), l = a - cen;
    l = l * cA + cross(ax, l) * sA + ax * dot(ax, l) * (1.0 - cA);
    vec3 dir = normalize(vec3(SWAP_WIND, 0.0) * 1.2 + (vec3(c2, c4, c1) - 0.5) * vec3(1.0, 1.0, 1.4));
    q = cen + l + dir * rc * tr; q.y -= tr * tr * rc * 0.5;
  } else {                  // GLITCH: it tears into scan lines, blocks of each line jump sideways in steps, and blink out
    float on = step(0.03, gone), tq = floor(tr * 4.0 + 1.0) / 4.0 * on, rw = 0.045;
    float row = floor(a.y / rw), seg = floor(a.x * 3.5 + hf(vec3(row, 1.0, 2.0)) * 3.0), tick = floor(T * 6.0 + hf(vec3(row, seg, 7.0)) * 2.0);
    q.y = mix(a.y, (row + 0.5) * rw, 0.8 * on) + SWAP_WIND.y * reach * tq * 0.5;
    q.x += ((hf(vec3(row, seg, tick)) - 0.5) * 1.8 + SWAP_WIND.x * 0.5) * reach * tq;
    q.z += (hf(vec3(row, seg, tick + 5.0)) - 0.5) * 0.5 * reach * tq;
    flick = mix(1.0, step(0.3, hf(vec3(row, seg, floor(T * 11.0)))), smoothstep(0.2, 0.5, gone));
  }
  col = mix(col, vec3(0.22 + 0.2 * dot(col, vec3(0.3, 0.59, 0.11))), ash);
  float there = (1.0 - smoothstep(0.3, 1.0, gone)) * flick;

  // Arriving: Gather's calm travels. A grain of the new object comes from where a grain leaving its own place would have gone, and
  // appears as it comes; until it sets out it is not there. A grain that left never comes back.
  if (role > 1.5) {
    there = 0.0;
    if (m > 0.0) {
      float e = ease(m), hump = sin(PI * e);
      vec3 at = mix(q, a, e), arc = vec3(0.0);   // MORPH (2): straight to its place
      if (back == 4) {        // SPIRAL: they wheel round the middle on the way
        vec2 w = rot(at.xz, hump * (1.6 + 1.2 * rd) * (rd > 0.5 ? 1.0 : 0.85));
        arc = vec3(w.x, at.y, w.y) - at + vec3(0.0, 0.0, hump * 0.15);
      } else if (back == 5)   // FALL: they drop and settle
        arc = vec3((rd - 0.5) * 0.12 * hump, -hump * (0.45 + 0.7 * rd), hump * 0.1 * (h01(i * 7u + 3u) - 0.5));
      q = at + arc; col = mix(col, own, e); szK = mix(szK, 1.0, e); there = smoothstep(0.0, 0.35, e);
    }
  }
  p += (q - a) * S; alive *= there; wsz *= szK;
  // in flight our look draws it with every other flight, in the additive pass; sand keeps it sand
  if (uSwap.w < 0.5 && t > 0.0 && m < 1.0) nk = 0.0;
}
`;

/** Vertex shader, global scope. */
export const SAND_UNIFORMS_VS = /* glsl */ `
#ifdef SAND
uniform float uSandJit;   // which drawing of the grains this is: 0 the grains themselves, 1 and up Gather's DETAIL copies
#endif`;

/**
 * Vertex shader, first thing in main() once the grain's index i is known. Works out what the later pieces share, and leaves at once
 * when this DETAIL copy of the grain is not needed, before any of the field's work is spent on it.
 * Inside a hero's box the recorded room is sampled at half the pitch (splat-points.ts).
 * shortcut: assumes every room refines its hero boxes that way; carry the spacing per grain if one does not.
 */
export const SAND_EARLY_VS = /* glsl */ `
#ifdef SAND
  float sFine = 1.0;
  for (int k = 0; k < MAX_HERO; k++) {
    if (k >= uHeroN) break;
    if (all(greaterThanEqual(position, uHeroMin[k])) && all(lessThanEqual(position, uHeroMax[k]))) sFine = 0.5;
  }
  float sU = uPx * 1.3333;                                   // one pixel at 1080 lines (uPx is one at 1440)
  float sPitch = uWsz.y * SAND_WSZ_TO_SPACING * sFine;       // metres between the room's grains here
  float sPx = sPitch * uFocal / max(-(modelViewMatrix * vec4(position, 1.0)).z, 0.05);   // and pixels between them, seen face on
  // Up close a surface opens up, as it does in our look: its grains are not filled in and it hides nothing. The recorded room has
  // shells of grains within a metre or two of where the viewer arrives, which only that keeps from standing as curtains across the view.
  float sOpen = smoothstep(SAND_NEAR_PX.x, SAND_NEAR_PX.y, sPx / sU);
  // how many grains of the stipple this one stands for; the DETAIL copies supply the rest, the last of them only some of the time
  float sN = mix(clamp(sPx * sPx / (SAND_PITCH_PX * SAND_PITCH_PX * sU * sU), 1.0, SAND_COPIES + 1.0), 1.0, sOpen);
  uint sId = i * 747796405u + uint(uSandJit) * 2891336453u;   // Gather's uJit: a new grain near this one, with its own life
  if (uSandJit > 0.5 && uSandJit + h01(sId * 3u + 1u) > sN) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
#endif`;

/**
 * Vertex shader, once the grain's place p is final and before it is projected: off the room's rows, anywhere within its own cell of
 * them, along its surface. The rows run level on walls and along z on floors and ceilings, their grains 0.71 of a spacing apart and
 * the rows 1.41. A grain standing in one of the room's lines of code (pHome: where it sat before that) is not on a surface: it stays
 * in its line, one grain, no copies.
 */
export const SAND_JITTER_VS = /* glsl */ `
#ifdef SAND
  bool sLine = distance(swAt, pHome) > 1e-5;
#ifndef SAND_DEPTH
  if (sLine && uSandJit > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
  if (!sLine) {
    vec3 sT = normalize(cross(aNorm, abs(aNorm.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    p += (sT * (h01(sId * 7u + 11u) - 0.5) * 0.71 + cross(aNorm, sT) * (h01(sId * 13u + 5u) - 0.5) * 1.41) * SAND_JITTER * sPitch;
  }
#endif
#endif`;

/**
 * Vertex shader, after the solid pass has set its size and colour c (the grain's own lit colour, held under the glow's threshold
 * except on the ceiling panels). Sand: the grain's size, light and whether it is drawn at all, instead. Our look: a grain of a
 * changing object.
 */
export const SAND_GRAIN_VS = /* glsl */ `
#ifdef SAND
  float sPe = sPx / sqrt(sN);                                 // pixels between the stipple's grains here, DETAIL copies counted
  float sBase = clamp(SAND_SPACINGS * sPe, 1.3 * sU, 3.6 * sU);   // Gather's size: by the distance between grains, within 1.3 to 3.6 pixels
  float sCos = abs(dot(aNorm, normalize(cameraPosition - p)));
  // Gather's gain: a grain gives less light the more layers of grains lie over a pixel. Seen at a slant a surface's grains crowd
  // together, so the slant is counted here. Which way a normal points is not used anywhere in sand: the recorded room's point
  // toward whichever camera recorded them, so no grain is left out as a back face; the depth pass hides an object's far side.
  float sGain = min(1.0, 0.62 / (0.35 * sBase * sBase / (sPe * sPe * max(sCos, 0.05)) + 0.12));
#ifdef SAND_DEPTH
  sz = SAND_DEPTH_DISC * sPx;                                 // the surface itself, closed: discs wide enough to meet across the rows
#else
  // density carries the brightness, each grain carries the hue: of a dark surface only some grains are drawn, each as bright as a
  // grain of a bright one, so there is black between them
  float sKeep = clamp(max(max(c.r, c.g), c.b) / SAND_FULL, SAND_KEEP_MIN, 1.0);
  if (h01(sId * 5u + 7u) > sKeep) alive = 0.0;
  sz = sBase * (0.6 + 0.9 * h01(sId * 11u + 71u)) * wsz / uWsz.y;   // sizes from 0.6 to 1.5; a change may shrink or swell it
  fade = min(1.0, sz);
  c = c / sKeep * sGain * fade * fade * alive * fog;          // under a pixel a grain dims by its area
  // In flight nothing hides anything, so both sides of an object show at once: each grain gives less.
  if (swFly) c *= SAND_FLIGHT;
#endif
#elif defined(SOLID)
  // Our look, a grain of a changing object: it stays one of the room's opaque grains in its own colour, and as it fades it is there
  // or not (Gather's SOLID), never faint. BURN's glow is not held under the glow's threshold.
  if (swFly && h01(i * 61u + 19u) > alive) alive = 0.0;
  c = mix(c, min(col * bright, vec3(1.0)), swHot);
#endif`;

/** Vertex shader, after the size in pixels is settled and before the grain's place on screen cp is used. */
export const SAND_PX_VS = /* glsl */ `
#ifdef SAND
#ifdef SAND_DEPTH
  px = clamp(sz, 1.0, 96.0 * uPx);
  // a grain in flight, in a line of code, or of a surface that has opened up, hides nothing
  if (swFly || sLine || sOpen > 0.15 + 0.2 * h01(i * 71u + 29u)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
#else
  px = clamp(sz, 1.0, SAND_MAX_PX * sU);   // its own size, not whole pixels
  {
    // Only the front surface: the grain is tested against the closed surface drawn before, and passes if it lies within the
    // slant's rise across the two discs, plus the surface's own thickness. A grain in flight is never cut off.
    float sTan = sqrt(max(1.0 - sCos * sCos, 0.0)) / max(sCos, 0.08);
    float sBias = (0.5 * SAND_DEPTH_DISC * sPitch + 0.5 * px * z / uFocal) * sTan * SAND_BIAS_SLOPE + SAND_BIAS;
    vec4 sB = projectionMatrix * vec4(mv.xy, min(mv.z + sBias, -0.04), 1.0);
    cp.z = swFly || sLine ? -0.999 * cp.w : sB.z / sB.w * cp.w;
  }
#endif
#endif`;

// Gather's FS: a soft round grain. Counted: each grain adds how much it covers, as a density, and the tone pass turns the sum into light.
const SAND_FS = /* glsl */ `precision highp float; in vec3 vCol; out vec4 o;
void main() {
  float a = 1.0 - smoothstep(0.3, 1.0, length(gl_PointCoord * 2.0 - 1.0));   // Gather's smoothstep(1.0, 0.3, r), with its edges in order
  o = vec4(-log(1.0 - clamp(vCol * a, 0.0, 0.999)), 0.0);
}`;

// The depth pass: the same grains as hard round discs, writing depth only.
const DEPTH_FS = /* glsl */ `precision highp float; in vec3 vCol; out vec4 o;
void main() { vec2 d = gl_PointCoord * 2.0 - 1.0; if (dot(d, d) > 1.0) discard; o = vec4(0.0); }`;

// Gather's tone pass without its grade, mirror and paper: exposure scales the count, highlights sets how gently crowded parts reach white.
// It also hands the room's depth on to the frame, so the eye, the pool and grains in flight are hidden by sand as they are by the solid room.
const TONE_FS = /* glsl */ `precision highp float; uniform sampler2D uAcc; uniform highp sampler2D uDepth; uniform float uExp, uP; out vec4 o;
void main() {
  vec3 x = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0).rgb * uExp;
  vec3 F = uP > 999.0 ? 1.0 - exp(-x) : 1.0 - pow(1.0 + x / uP, vec3(-uP));
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;   // a grain of noise where there is something to smooth
  o = vec4(clamp(F + n / 255.0 * smoothstep(0.0, 0.012, length(F)), 0.0, 1.0), 1.0);
  gl_FragDepth = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;
}`;

/** Turn the field's solid-pass material into the sand grain: same grains, drawn small, soft and counted, behind nothing nearer. `grainOfSpacing`: the field's grain as a share of the sampling spacing. */
export function sandMaterial(material: ShaderMaterial, grainOfSpacing: number): void {
  material.fragmentShader = SAND_FS;
  material.defines = {
    ...material.defines, SAND: '', SAND_WSZ_TO_SPACING: f(1 / grainOfSpacing), SAND_PITCH_PX: f(SAND_PITCH_PX), SAND_COPIES: f(SAND_COPIES), SAND_NEAR_PX: `vec2(${f(SAND_NEAR_PX[0]!)}, ${f(SAND_NEAR_PX[1]!)})`,
    SAND_SPACINGS: f(SAND_SPACINGS), SAND_FULL: f(SAND_FULL), SAND_FLIGHT: f(SAND_FLIGHT), SAND_KEEP_MIN: f(SAND_KEEP_MIN), SAND_JITTER: f(SAND_JITTER),
    SAND_DEPTH_DISC: f(SAND_DEPTH_DISC), SAND_BIAS: f(SAND_BIAS), SAND_BIAS_SLOPE: f(SAND_BIAS_SLOPE), SAND_MAX_PX: f(SAND_MAX_PX),
  };
  material.uniforms.uSandJit = { value: 0 };   // on the field's shared uniforms
  Object.assign(material, { transparent: true, depthTest: true, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor });
  material.needsUpdate = true;
}

export interface SandPass {
  /** Add to the scene: a full-screen triangle, drawn before everything else in it. */
  readonly quad: Mesh;
  /** The sand grains to count (their material made by sandMaterial): an object kept out of the scene, drawn only into the float buffer. */
  grains: Points | null;
  dispose(): void;
}

/**
 * The counted buffer and the tone pass, as one object in the scene. Just before it is drawn it draws the sand grains into its own float
 * buffer (renders inside the render, as three's Reflector does): first their depth, as closed surfaces; then the grains and their
 * DETAIL copies, counted, each tested against that depth. Then it lays the toned picture, and the depth, into the frame. So it works
 * wherever the scene is drawn: the composer, the splat layers.
 */
export function createSandPass(): SandPass {
  const acc = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true, depthTexture: new DepthTexture(1, 1), minFilter: NearestFilter, magFilter: NearestFilter });
  const h = SAND_HIGHLIGHTS;
  const tone = new ShaderMaterial({
    glslVersion: GLSL3, vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`, fragmentShader: TONE_FS,
    uniforms: { uAcc: { value: acc.texture }, uDepth: { value: acc.depthTexture }, uExp: { value: SAND_EXPOSURE }, uP: { value: h >= 0.995 ? 1e4 : 0.35 / ((1 - h) * (1 - h)) } },
    // not 'transparent', so it is drawn with the opaque things and, by its order, first of them: the eye's blocks and the pool's grains
    // are then drawn over the sand and tested against its depth, as they are against the solid room's.
    transparent: false, depthTest: true, depthFunc: AlwaysDepth, depthWrite: true, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcColorFactor,
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new Mesh(geometry, tone);
  quad.frustumCulled = false; quad.renderOrder = -1;
  const size = new Vector2();
  let depth: ShaderMaterial | null = null;
  const pass: SandPass = { quad, grains: null, dispose() { acc.depthTexture?.dispose(); acc.dispose(); tone.dispose(); depth?.dispose(); geometry.dispose(); } };
  quad.onBeforeRender = (renderer, _scene, camera) => {
    const target = renderer.getRenderTarget(), autoClear = renderer.autoClear, grains = pass.grains;
    renderer.getDrawingBufferSize(size);
    const width = target ? target.width : size.x, height = target ? target.height : size.y;
    if (acc.width !== width || acc.height !== height) acc.setSize(width, height);
    renderer.setRenderTarget(acc);
    // whatever was drawn last may have left colour or depth unwritable; a clear obeys that
    renderer.state.buffers.color.setMask(true); renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    if (grains?.visible) {
      const sand = grains.material as ShaderMaterial, jit = sand.uniforms.uSandJit!;
      if (!depth) {
        // the same shader and the same (shared) uniforms, writing depth alone
        depth = sand.clone();
        depth.uniforms = sand.uniforms;
        depth.fragmentShader = DEPTH_FS; depth.defines = { ...sand.defines, SAND_DEPTH: '' };
        Object.assign(depth, { transparent: false, depthTest: true, depthWrite: true, colorWrite: false, blending: NoBlending });
      }
      renderer.autoClear = false;   // the passes add up in one buffer
      jit.value = 0;
      // the grains and, as their children, the objects that replaced heroes (point-field.ts): all drawn with the one material
      const all = (material: ShaderMaterial) => grains.traverse(o => { (o as Points).material = material; });
      all(depth); renderer.render(grains, camera);
      all(sand);
      for (let copy = 0; copy <= SAND_COPIES; copy++) { jit.value = copy; renderer.render(grains, camera); }
      jit.value = 0;
      renderer.autoClear = autoClear;
    }
    renderer.setRenderTarget(target);
  };
  return pass;
}
