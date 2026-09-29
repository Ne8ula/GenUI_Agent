/**
 * Particle field for revision w3-cloud-20260928-a-p1 (Weave packet:
 * week3/docs/design/revisions/w3-cloud-20260928-a-p1/REVIEW.md).
 *
 * Every raster cell of the Week 1 source eye (./week1-eye) is one particle
 * with depth. At rest the particles sit on their cells, so the actual eye --
 * square pupil, ordered-dither density, gaze, blink -- is what you see, just
 * lit as points of light instead of flat pixels. While speaking, `energy`
 * releases the particles in a staggered order taken from the packet's motion
 * reference (upper lid first, lower tissue next, iris and pupil last) and
 * they flow into an abstract formation for the current stance. As energy
 * falls the order reverses, so the eye re-forms from the pupil outward.
 *
 * Pure math only: no DOM. render.ts owns the canvas splatting.
 */

import { clamp01 } from "./constants";
import type { WarpChannels } from "./grammar";

/** Normalized eye space: x in about [-1, 1], y in about [-0.5, 0.5] (down positive), z toward the viewer. */
export interface ParticlePoint {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  /** 0..1 brightness before depth attenuation. */
  a: number;
}

export interface FormationWeights {
  comfort: number;
  joy: number;
  congratulation: number;
  supportive: number;
}

const TAU = Math.PI * 2;

/** Stable per-cell hashes in [0, 1). */
export function cellHash(index: number, salt: number): number {
  let h = (index * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Warp values below this are treated as noise: attentive's channels never reach it. */
const WARP_NOISE_FLOOR = 0.06;

/**
 * Formation blend weights from the runtime's energy-blended warp channels
 * (fold = comfort, lift = joy, bloom = congratulation, fan = supportive).
 * Normalized so a mid-transition retarget between stances morphs between
 * formations instead of popping. All zero for the attentive/neutral eye,
 * whose small warp values sit below the noise floor.
 */
export function formationWeights(warp: WarpChannels): FormationWeights {
  const raw = {
    comfort: Math.max(0, warp.fold - WARP_NOISE_FLOOR),
    joy: Math.max(0, warp.lift - WARP_NOISE_FLOOR),
    congratulation: Math.max(0, warp.bloom - WARP_NOISE_FLOOR),
    supportive: Math.max(0, warp.fan - WARP_NOISE_FLOOR),
  };
  const total = raw.comfort + raw.joy + raw.congratulation + raw.supportive;
  if (total < 1e-4) return { comfort: 0, joy: 0, congratulation: 0, supportive: 0 };
  return {
    comfort: raw.comfort / total,
    joy: raw.joy / total,
    congratulation: raw.congratulation / total,
    supportive: raw.supportive / total,
  };
}

/**
 * 0..1: how strongly any formation is expressed. Attentive (and every stance
 * once energy has released) stays 0, so the eye itself remains; an
 * expressive stance at full energy reaches 1.
 */
export function formationStrength(warp: WarpChannels): number {
  const dominant = Math.max(warp.fold, warp.lift, warp.bloom, warp.fan);
  return clamp01((dominant - WARP_NOISE_FLOOR) / 0.3);
}

/** How far toward its formation a particle is, given energy and its release delay (0 = home, 1 = formed). */
export function releaseProgress(energy: number, delay: number): number {
  const t = clamp01((energy - delay) / 0.42);
  return t * t * (3 - 2 * t);
}

/**
 * Release delay from the packet video: the upper lid moves first, lower tissue
 * next, the iris and square pupil last. `pupilDistance` is the cell's distance
 * from the pupil centre in normalized eye space.
 */
export function releaseDelay(homeY: number, pupilDistance: number, jitter: number): number {
  const vertical = clamp01((homeY + 0.5) / 1.0) * 0.28;
  const iris = pupilDistance < 0.3 ? 0.5 * (1 - pupilDistance / 0.3) : 0;
  return Math.min(0.58, 0.02 + vertical + iris + jitter * 0.06);
}

// Abstract formations. Each maps stable per-cell hashes (a, b, c), the
// animation clock and one composition's seeded variation to a point, colour
// and brightness. None depicts an object.

/**
 * Seeded per-composition variation (pass 2, packet w3-cloud-20260928-a-p2):
 * every occurrence of a family is composed differently -- which archetype,
 * which side, how many strands/currents, where the light sits, which way the
 * burst travels -- while staying recognisably the same family.
 */
export interface FormationVariation {
  /** Comfort: 0 hanging corner, 1 low double wave, 2 inward curl. */
  comfortVariant: number;
  comfortSide: number;
  comfortWidth: number;
  /** Congratulation helix: 0 slim leaning two-strand, 1 thick many-ribbon wide crest, 2 tall S-curve. */
  helixVariant: number;
  helixHeight: number;
  helixStrands: number;
  helixTurn: number;
  helixLean: number;
  helixS: number;
  helixRadius: number;
  helixCrest: number;
  /** Supportive: 0 low light to one side with a trailing current, 1 high centred wings, 2 converging from all around. */
  supportVariant: number;
  supportLanes: number;
  lightX: number;
  lightY: number;
  supportWings: number;
  supportSurround: number;
  /** How strongly the currents curve and cross on their way to the light. */
  supportBend: number;
  /** Whole-form rotation (radians) and scale for comfort, congratulation and supportive. */
  formRotate: number;
  formScale: number;
  /** Joy burst: 0 upward, 1 all around, 2 sideways stream. */
  joyVariant: number;
  joySide: number;
  joySpiral: number;
  /** Continuous per-seed rotation and stretch so two bursts of the same archetype still differ. */
  joyRotate: number;
  joyStretch: number;
}

const pick = (seed: number, salt: number, min: number, max: number) => min + (max - min) * cellHash(seed, salt);

/** Archetype picks for the three families that have discrete variants. */
export interface VariationArchetypes {
  comfortVariant: number;
  helixVariant: number;
  supportVariant: number;
  joyVariant: number;
}

/**
 * Seeded variation for one composition. Pass the previous composition's
 * variation as `previous` to reject an immediate repeat of any family's
 * archetype (bounded, session-local memory of composition parameters only).
 */
export function formationVariation(seed: number, previous?: VariationArchetypes, beforePrevious?: VariationArchetypes): FormationVariation {
  const s = Math.abs(Math.floor(seed)) % 2147483647;
  // Avoid the previous two archetypes, so any three consecutive occurrences of a family differ.
  const archetype = (salt: number, last: number | undefined, beforeLast: number | undefined) => {
    const order = [0, 1, 2];
    const start = Math.floor(cellHash(s, salt) * 3);
    for (let step = 0; step < 3; step++) {
      const choice = order[(start + step) % 3];
      if (choice !== last && choice !== beforeLast) return choice;
    }
    return start === last ? (start + 1) % 3 : start;
  };
  const side = cellHash(s, 102) < 0.5 ? -1 : 1;
  const helixVariant = archetype(111, previous?.helixVariant, beforePrevious?.helixVariant);
  const supportVariant = archetype(120, previous?.supportVariant, beforePrevious?.supportVariant);
  const helix = [
    { strands: 2, radius: pick(s, 115, 0.08, 0.11), lean: side * pick(s, 113, 0.22, 0.34), sCurve: pick(s, 114, 0, 0.05), crest: pick(s, 116, 0.2, 0.35), height: pick(s, 117, 0.9, 1.0) },
    { strands: 4 + Math.floor(cellHash(s, 118) * 3), radius: pick(s, 115, 0.19, 0.24), lean: pick(s, 113, -0.06, 0.06), sCurve: 0, crest: pick(s, 116, 0.7, 0.9), height: pick(s, 117, 0.85, 0.95) },
    { strands: 2 + Math.floor(cellHash(s, 118) * 2), radius: pick(s, 115, 0.09, 0.13), lean: side * pick(s, 113, 0, 0.1), sCurve: side * pick(s, 114, 0.2, 0.3), crest: pick(s, 116, 0.45, 0.65), height: pick(s, 117, 1.1, 1.2) },
  ][helixVariant];
  const support = [
    { lanes: 6 + Math.floor(cellHash(s, 121) * 3), lightX: side * pick(s, 122, 0.22, 0.34), lightY: pick(s, 123, -0.3, -0.22), wings: pick(s, 124, 0, 0.3), surround: 0, bend: pick(s, 126, 0.7, 1) },
    { lanes: 9 + Math.floor(cellHash(s, 121) * 3), lightX: pick(s, 122, -0.06, 0.06), lightY: pick(s, 123, -0.48, -0.4), wings: pick(s, 124, 0.8, 1), surround: 0, bend: pick(s, 126, 0.2, 0.45) },
    { lanes: 10 + Math.floor(cellHash(s, 121) * 3), lightX: side * pick(s, 122, 0.08, 0.18), lightY: pick(s, 123, -0.38, -0.3), wings: pick(s, 124, 0.3, 0.6), surround: 1, bend: pick(s, 126, 0.5, 0.8) },
  ][supportVariant];
  return {
    comfortVariant: archetype(101, previous?.comfortVariant, beforePrevious?.comfortVariant),
    comfortSide: side,
    comfortWidth: pick(s, 103, 0.9, 1.2),
    helixVariant,
    helixHeight: helix.height,
    helixStrands: helix.strands,
    helixTurn: cellHash(s, 112) < 0.5 ? -1 : 1,
    helixLean: helix.lean,
    helixS: helix.sCurve,
    helixRadius: helix.radius,
    helixCrest: helix.crest,
    supportVariant,
    supportLanes: support.lanes,
    lightX: support.lightX,
    lightY: support.lightY,
    supportWings: support.wings,
    supportSurround: support.surround,
    joyVariant: archetype(131, previous?.joyVariant, beforePrevious?.joyVariant),
    joySide: cellHash(s, 132) < 0.5 ? -1 : 1,
    joySpiral: cellHash(s, 133) < 0.5 ? 0 : pick(s, 134, 1.2, 2.6),
    joyRotate: pick(s, 135, -0.7, 0.7),
    joyStretch: pick(s, 136, 0.75, 1.3),
    supportBend: support.bend,
    formRotate: pick(s, 141, -0.32, 0.32),
    formScale: pick(s, 142, 0.82, 1.12),
  };
}

function comfortPoint(a: number, b: number, c: number, t: number, v: FormationVariation, out: ParticlePoint): void {
  // One broad sheet draping down and folding back over itself, settling low.
  const u = (a * 2 - 1) * v.comfortSide;
  const w = b;
  let x = u * 1.1 * v.comfortWidth * (1 - 0.1 * w);
  const ripple = 0.05 * Math.sin(u * 4.2 + w * 5 + t * 0.35) + 0.025 * Math.sin(u * 9 - t * 0.5 + w * 3);
  let y: number;
  let z: number;
  let ridge: number;
  if (v.comfortVariant === 0) {
    // Hanging corner: the sheet arches, one corner falls in a long soft tail.
    const tail = Math.max(0, u - 0.35) / 0.65;
    y = -0.3 + 0.55 * w - 0.22 * Math.cos(u * 1.4) * (1 - w) + tail * tail * (0.55 + 0.3 * w);
    x += tail * 0.12 * w;
    z = 0.28 * Math.sin(w * Math.PI * 1.2) - 0.05;
    ridge = Math.exp(-Math.pow((u - 0.35) / 0.12, 2)) * (1 - w * 0.5);
  } else if (v.comfortVariant === 1) {
    // Low double wave: wide, nearly lying flat, two gentle folds side by side.
    y = 0.12 + 0.28 * w - 0.12 * Math.abs(Math.sin(u * Math.PI * 1.1)) * (1 - w);
    z = 0.2 * Math.sin(w * Math.PI) - 0.05 + 0.08 * Math.sin(u * Math.PI * 2);
    ridge = Math.exp(-Math.pow((Math.abs(u) - 0.45) / 0.1, 2)) * Math.exp(-Math.pow((w - 0.2) / 0.2, 2));
    x *= 1.12;
  } else {
    // Inward curl: a wide sheet runs flat, then rolls over at one end into a soft
    // rounded fold (seeded side, width and openness).
    const along = (u + 1) * 0.5;
    const roll = Math.max(0, along - 0.45) / 0.55;
    const angle = roll * Math.PI * (0.9 + 0.5 * v.comfortWidth);
    const radius = 0.26 * v.comfortWidth;
    const flatX = (along - 0.45) * 1.9 * v.comfortWidth;
    x = v.comfortSide * (roll > 0 ? Math.sin(angle) * radius : flatX);
    y = 0.22 - (roll > 0 ? (1 - Math.cos(angle)) * radius : 0) + 0.18 * w - 0.08 * Math.cos(along * 3);
    z = (w - 0.5) * 0.55 + (roll > 0 ? 0.1 * Math.sin(angle) : 0);
    ridge = roll > 0 ? Math.exp(-Math.pow((angle - Math.PI * 0.5) / 0.35, 2)) : 0;
  }
  out.x = x;
  out.y = y + ripple + 0.06;
  out.z = z + (c - 0.5) * 0.04;
  const crest = 0.5 + 0.5 * Math.sin(u * 4.2 + w * 5 + t * 0.35);
  out.r = 0.95;
  out.g = 0.5 + 0.22 * crest;
  out.b = 0.56 + 0.2 * crest;
  out.a = 0.16 + 0.24 * crest * (1 - 0.3 * w) + 0.38 * ridge;
}

function joyPoint(a: number, b: number, c: number, t: number, v: FormationVariation, out: ParticlePoint): void {
  // The eye bursts into a scattered shimmer spreading toward and around the viewer.
  const travel = (b * 0.8 + c * 0.5 + t * 0.06) % 1;
  let theta: number;
  let sx = 1.2;
  let sy = 0.6;
  let rise = 0.45;
  if (v.joyVariant === 0) {
    // Mostly upward, like a slow updraft above the eye.
    theta = -Math.PI / 2 + (a - 0.5) * 2.2;
    sy = 0.9; rise = 0.6;
  } else if (v.joyVariant === 1) {
    theta = a * TAU;
  } else {
    // A sideways stream.
    theta = (v.joySide > 0 ? 0 : Math.PI) + (a - 0.5) * 1.1;
    sx = 1.5; sy = 0.35; rise = 0.15;
  }
  theta += v.joySpiral * travel + v.joyRotate;
  const r = (0.42 + travel * travel * 2.2 + travel * 0.4) * v.joyStretch;
  out.x = Math.cos(theta) * r * sx;
  out.y = Math.sin(theta) * r * sy / v.joyStretch - travel * rise * (0.6 + c);
  out.z = (c * 1.8 - 0.35) * travel;
  const tone = cellHash(Math.floor(a * 9973), 7);
  if (tone < 0.55) { out.r = 1; out.g = 0.66; out.b = 0.38; }
  else if (tone < 0.85) { out.r = 1; out.g = 0.84; out.b = 0.45; }
  else { out.r = 0.6; out.g = 1; out.b = 0.8; }
  const twinkle = 0.5 + 0.5 * Math.sin(t * 5.5 + a * 61 + c * 17);
  // Fade in as particles leave the centre, so no bright ring forms where the eye was.
  const emerge = Math.min(1, travel / 0.25);
  out.a = (0.3 + 0.7 * twinkle) * (1 - 0.3 * travel) * emerge * emerge;
}

function congratulationPoint(a: number, b: number, c: number, t: number, v: FormationVariation, out: ParticlePoint): void {
  // A particle helix climbing, slowly rotating, opening into sparks at its crest.
  const strand = Math.floor(a * v.helixStrands);
  const s = b;
  const crest = Math.max(0, s - 0.78) / 0.22;
  const angle = v.helixTurn * (s * TAU * 2.2 + t * 1.1) + strand * (TAU / v.helixStrands) + (c - 0.5) * 0.25;
  const radius = v.helixRadius + 0.06 * s + crest * crest * v.helixCrest * (0.4 + c);
  const spine = v.helixLean * (s - 0.3) + v.helixS * Math.sin(s * Math.PI * 2);
  out.x = spine + Math.cos(angle) * radius + (c - 0.5) * 0.03;
  // The crest sprays upward and outward into drifting sparks rather than a flat cap.
  out.y = 0.62 * v.helixHeight - s * 1.35 * v.helixHeight - crest * (0.2 + 0.4 * c) - crest * crest * 0.15 * Math.sin(t * 0.8 + a * 40);
  out.z = Math.sin(angle) * radius;
  out.r = 1;
  out.g = 0.74 - 0.42 * s;
  out.b = 0.3 + 0.42 * s;
  out.a = (0.32 + 0.3 * (1 - crest) * (0.6 + 0.4 * Math.sin(angle * 3))) * (1 - 0.55 * crest * c);
}

function supportivePoint(a: number, b: number, c: number, t: number, v: FormationVariation, out: ParticlePoint): void {
  // Curving currents converging on one small steady warm light; they sway like
  // a travelling wave, still near the light and freer toward their tails.
  const lanes = v.supportLanes;
  const laneIndex = Math.floor(a * lanes);
  const lane = ((laneIndex + 0.5) / lanes) * 2 - 1 + (c - 0.5) * 0.035;
  const s = (b + t * 0.06) % 1;
  const one = 1 - s;
  const peakX = v.lightX;
  const peakY = v.lightY;
  // Start points: a wide base, lifted into sideways wings, or (surround) all around the light.
  let baseX = lane * 1.15;
  let baseY = 0.48 + 0.08 * Math.cos(lane * 3) - v.supportWings * 0.55 * Math.pow(Math.abs(lane), 1.5);
  if (v.supportSurround && laneIndex % 3 === 1) {
    baseX = peakX + lane * 1.05;
    baseY = peakY - 0.35 - 0.1 * Math.cos(lane * 2);
  }
  const bend = v.supportBend * Math.sin(laneIndex * 2.3 + v.lightX * 5);
  const ctrlX = baseX * 0.55 + peakX * 0.45 + bend * 0.55;
  const ctrlY = (baseY + peakY) * 0.5 + 0.1 - 0.1 * Math.abs(lane) - v.supportWings * 0.25 * Math.abs(lane);
  let x = one * one * baseX + 2 * one * s * ctrlX + s * s * peakX;
  let y = one * one * baseY + 2 * one * s * ctrlY + s * s * peakY;
  const sway = Math.sin(t * 1.6 - s * 4 + laneIndex * 0.9) * 0.06 * one;
  x += sway;
  y += sway * 0.4;
  // Wispy, irregular outer edge instead of a hard boundary.
  const edge = Math.max(0, Math.abs(lane) - 0.55) / 0.45;
  const wisp = edge * one * (0.06 + 0.34 * c) * (0.6 + 0.4 * Math.sin(t * 0.7 + laneIndex));
  x += Math.sign(lane) * wisp;
  y += (c - 0.5) * 0.1 * edge * one;
  out.x = x;
  out.y = y;
  out.z = 0.28 * one * Math.sin(lane * 4 + c * 0.5);
  const warm = s * s * s;
  const violet = laneIndex / Math.max(1, lanes - 1);
  out.r = 0.2 + 0.45 * violet + 0.75 * warm;
  out.g = 0.72 - 0.35 * violet - 0.05 * warm;
  out.b = 0.78 + 0.15 * violet - 0.4 * warm;
  out.a = (0.2 + 0.35 * s) * (1 - 0.6 * edge * c);
}

const scratch: ParticlePoint = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0 };

function accumulate(out: ParticlePoint, point: ParticlePoint, weight: number): void {
  out.x += point.x * weight;
  out.y += point.y * weight;
  out.z += point.z * weight;
  out.r += point.r * weight;
  out.g += point.g * weight;
  out.b += point.b * weight;
  out.a += point.a * weight;
}

const DEFAULT_VARIATION = formationVariation(0);

/**
 * Weighted formation target for one cell. Writes into `out`; returns false
 * when no formation carries weight (the neutral eye).
 */
export function formationTarget(index: number, weights: FormationWeights, timeSec: number, out: ParticlePoint, variation: FormationVariation = DEFAULT_VARIATION): boolean {
  const total = weights.comfort + weights.joy + weights.congratulation + weights.supportive;
  if (total < 1e-4) return false;
  const a = cellHash(index, 1);
  const b = cellHash(index, 2);
  const c = cellHash(index, 3);
  out.x = out.y = out.z = out.r = out.g = out.b = out.a = 0;
  if (weights.comfort > 1e-3) { comfortPoint(a, b, c, timeSec, variation, scratch); accumulate(out, scratch, weights.comfort); }
  if (weights.joy > 1e-3) { joyPoint(a, b, c, timeSec, variation, scratch); accumulate(out, scratch, weights.joy); }
  if (weights.congratulation > 1e-3) { congratulationPoint(a, b, c, timeSec, variation, scratch); accumulate(out, scratch, weights.congratulation); }
  if (weights.supportive > 1e-3) { supportivePoint(a, b, c, timeSec, variation, scratch); accumulate(out, scratch, weights.supportive); }
  // Seeded whole-form rotation and scale; joy has its own seeded direction.
  const shaped = 1 - weights.joy;
  if (shaped > 1e-3) {
    const angle = variation.formRotate * shaped;
    const scale = 1 + (variation.formScale - 1) * shaped;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = out.x;
    const y = out.y;
    out.x = (x * cos - y * sin) * scale;
    out.y = (x * sin + y * cos) * scale;
    out.z *= scale;
  }
  return true;
}

/** Gentle three-quarter tilt so formations recede in depth (rotation about the horizontal axis). */
export function tilt(point: ParticlePoint, radians: number): void {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const y = point.y * cos - point.z * sin;
  const z = point.y * sin + point.z * cos;
  point.y = y;
  point.z = z;
}

/** Perspective factor for a point at depth z (camera at distance 3). */
export function perspective(z: number): number {
  return 3 / Math.max(1.2, 3 - z);
}
