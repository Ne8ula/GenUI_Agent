/**
 * Seeded procedural grammar for the five expressive families
 * (week3/DESIGN.md#6, week3/PLANNING.md#2). Pure and DOM-free: everything
 * here is plain math so it can be unit tested and reused by both the live
 * renderer and vitest fixtures.
 *
 * A `Composition` is a bounded *target* description: which folds (harmonics)
 * are emphasized, how tightly layers gather, how strong the directional
 * asymmetry is, where the silhouette lifts or settles, and how many
 * tracking-box anchors exist. It is never itself an animation frame — the
 * runtime (see runtime.ts) springs the live geometry toward these targets.
 */

import {
  EYE_ASPECT_X,
  HARMONIC_INDICES,
  LAYER_SPREAD_FACTOR,
  MAX_BOXES,
  MAX_LAYERS,
  SAFE_RADIUS_FRACTION,
  COMPOSITION_MEMORY_SIZE,
} from "./constants";
import { hashSeed, mulberry32, pickInt, pickRange, type Rng } from "./rng";
import type { PaletteWeights } from "./palette";

export type TurnState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "interrupted"
  | "unavailable";

export type Stance =
  | "attentive"
  | "comforting"
  | "shared_joy"
  | "congratulatory"
  | "supportive";

export interface HarmonicTarget {
  k: number;
  amp: number;
  phase: number;
}

/**
 * Owner clarification (2026-09-27, post-w3-20260927-02): the actual Week 1
 * eye (silhouette, square pupil, ordered dithering, cursor responsiveness)
 * must be retained and *transformed*, not replaced by an invented shape.
 * `WarpChannels` are the five families' distinct authored transformations of
 * that one source eye -- comfort folds/closes like a shell, joy lifts and
 * twists open, congratulatory unfolds outward like a bloom, supportive fans
 * open into gathered ribbons, and attentive stays the stable, unwarped
 * source eye. Each stance keeps exactly one dominant channel near its
 * envelope's upper range and the rest near 0, so forms read as distinct
 * silhouettes/motion rather than the same eye with a different hue. See
 * render.ts's `warpPoint` for the actual coordinate transform these drive.
 */
export interface WarpChannels {
  /** Comfort: folded/closing lid-shell amount, 0..1. */
  fold: number;
  /** Joy: lifted/open twisting-body amount, 0..1. */
  lift: number;
  /** Congratulatory: petal/bloom unfold amount, 0..1. */
  bloom: number;
  /** Supportive: gathered/fanned ribbon-opening amount, 0..1. */
  fan: number;
  /** Radians; a shared directional twist, currently meaningful mainly for joy. */
  twist: number;
}

export interface StanceEnvelope {
  coreRadius: readonly [number, number];
  layerCount: readonly [number, number];
  gathering: readonly [number, number];
  focus: readonly [number, number];
  verticalBias: readonly [number, number];
  asymmetryMag: readonly [number, number];
  /** Radians; center of the directional bias, or null for a fully free angle. */
  asymmetryAngleCenter: number | null;
  asymmetryAngleSpread: number;
  /** Amplitude range (as a fraction of min viewport dimension) per harmonic index. */
  harmonicWeights: Partial<Record<number, readonly [number, number]>>;
  boxAnchorCount: readonly [number, number];
  /** Spring time constant used while a target is growing (a "bloom"/attack). */
  attackSmoothTime: number;
  /** Spring time constant used while a target is easing back down (a "settle"/release). */
  releaseSmoothTime: number;
  /**
   * Fraction the silhouette transiently overshoots by right after a fresh
   * turn begins (a real "bloom"), before easing back down to its steady
   * composition size over releaseSmoothTime. 0 = no bloom.
   */
  bloomOvershoot: number;
  /** Amplitude (fraction of coreRadius) of the continuous idle breathing/buoyancy motion. */
  breatheAmplitude: number;
  /** Angular speed (rad/s) of the continuous idle breathing/buoyancy motion. */
  breatheSpeed: number;
  paletteWeights: PaletteWeights;
  /** Sampled ranges for this stance's dominant/secondary warp channels. */
  warp: {
    fold: readonly [number, number];
    lift: readonly [number, number];
    bloom: readonly [number, number];
    fan: readonly [number, number];
    twist: readonly [number, number];
  };
  /**
   * Fixed (not sampled) RGB target, 0..1 per channel, the source eye's red
   * phosphor broadens toward as `energy` rises during actual speaking.
   * Owner clarification: "original red at rest" -- `energy` low always
   * pulls this back toward SOURCE_RED regardless of stance.
   */
  broadenedPhosphor: readonly [number, number, number];
}

/** The Week 1 source eye's own phosphor color (`vec3 phosphor=vec3(1.,.23,.20)` in SignalEye.tsx). */
export const SOURCE_RED: readonly [number, number, number] = [1, 0.23, 0.2];

const TAU = Math.PI * 2;

// Revision w3-20260927-01 follow-up: the first ranges here were tuned only
// against an isotropic disc with no viewport budget, and the captured
// build clipped the stage. Ranges below are sized so a *typical* draw
// (not every range maxed at once) already sits comfortably inside
// SAFE_RADIUS_FRACTION without needing composeGrammar's safety scale to
// fire; that scale-down step remains only as a guard for rare, near-worst
// combinations, so the five families keep visibly different resting sizes
// instead of all being compressed to the same ceiling.
export const STANCE_ENVELOPES: Record<Stance, StanceEnvelope> = {
  attentive: {
    coreRadius: [0.15, 0.17],
    layerCount: [2, 3],
    gathering: [0.75, 0.9],
    focus: [0.6, 0.75],
    verticalBias: [-0.02, 0.02],
    asymmetryMag: [0.004, 0.02],
    asymmetryAngleCenter: null,
    asymmetryAngleSpread: TAU,
    harmonicWeights: {
      1: [0, 0.008],
      2: [0.008, 0.022],
      3: [0, 0.012],
      4: [0, 0.008],
    },
    boxAnchorCount: [2, 3],
    attackSmoothTime: 0.5,
    releaseSmoothTime: 0.5,
    bloomOvershoot: 0.03,
    breatheAmplitude: 0.02,
    breatheSpeed: 0.5,
    paletteWeights: { pearl: 0.55, lavender: 0.15, ice: 0.25, coral: 0.05 },
    // Attentive: the stable, unwarped source eye -- every channel stays near 0.
    warp: { fold: [0, 0.03], lift: [0, 0.03], bloom: [0, 0.03], fan: [0, 0.03], twist: [-0.03, 0.03] },
    broadenedPhosphor: SOURCE_RED,
  },
  comforting: {
    coreRadius: [0.12, 0.135],
    layerCount: [3, 4],
    gathering: [0.55, 0.7],
    focus: [0.7, 0.85],
    verticalBias: [-0.06, -0.025],
    asymmetryMag: [0.02, 0.036],
    // Gently orient toward the user: bias the fold toward the lower half.
    asymmetryAngleCenter: Math.PI / 2,
    asymmetryAngleSpread: 0.7,
    harmonicWeights: {
      1: [0.012, 0.026],
      2: [0.02, 0.034],
      3: [0.004, 0.012],
    },
    boxAnchorCount: [1, 3],
    attackSmoothTime: 0.9,
    releaseSmoothTime: 1.3,
    bloomOvershoot: 0.05,
    breatheAmplitude: 0.018,
    breatheSpeed: 0.35,
    paletteWeights: { pearl: 0.35, lavender: 0.45, ice: 0.15, coral: 0.05 },
    // Comfort: softened, folded lid/shell -- fold dominant, everything else quiet.
    warp: { fold: [0.55, 0.75], lift: [0, 0.06], bloom: [0, 0.05], fan: [0, 0.05], twist: [-0.04, 0.04] },
    broadenedPhosphor: [0.85, 0.35, 0.55],
  },
  shared_joy: {
    coreRadius: [0.14, 0.16],
    layerCount: [3, 5],
    gathering: [0.5, 0.65],
    focus: [0.5, 0.65],
    verticalBias: [0.03, 0.075],
    asymmetryMag: [0.01, 0.024],
    // Light lift/broaden upward.
    asymmetryAngleCenter: -Math.PI / 2,
    asymmetryAngleSpread: 0.9,
    harmonicWeights: {
      1: [0, 0.007],
      2: [0.016, 0.028],
      3: [0.013, 0.023],
      4: [0.007, 0.016],
    },
    boxAnchorCount: [3, 5],
    attackSmoothTime: 0.35,
    releaseSmoothTime: 0.6,
    bloomOvershoot: 0.12,
    breatheAmplitude: 0.03,
    breatheSpeed: 0.9,
    paletteWeights: { pearl: 0.4, lavender: 0.1, ice: 0.2, coral: 0.3 },
    // Joy: lifted/open, twisting body -- lift dominant, with a real twist.
    warp: { fold: [0, 0.05], lift: [0.55, 0.8], bloom: [0, 0.06], fan: [0, 0.05], twist: [0.15, 0.35] },
    broadenedPhosphor: [1, 0.55, 0.25],
  },
  congratulatory: {
    coreRadius: [0.13, 0.15],
    layerCount: [4, 5],
    gathering: [0.3, 0.45],
    focus: [0.55, 0.7],
    verticalBias: [0.035, 0.08],
    asymmetryMag: [0.006, 0.018],
    // Radial burst: no single directional lean.
    asymmetryAngleCenter: null,
    asymmetryAngleSpread: TAU,
    harmonicWeights: {
      1: [0, 0.007],
      3: [0.02, 0.034],
      5: [0.014, 0.024],
      6: [0.01, 0.02],
    },
    boxAnchorCount: [4, 6],
    // Fast bloom, slow easy settle -- an asymmetric attack/release pair
    // is what produces the "fuller outward bloom, then an easy settling"
    // sequence from DESIGN.md#5 without a scripted keyframe clip. The
    // resting radius is modest (comparable to the other families); it is
    // the largest bloomOvershoot plus the spiky k3/k5/k6 burst harmonics
    // and the loosest gathering that make this family read as "more" --
    // most visibly during the transient bloom right after a turn begins.
    attackSmoothTime: 0.25,
    releaseSmoothTime: 1.6,
    bloomOvershoot: 0.28,
    breatheAmplitude: 0.02,
    breatheSpeed: 0.4,
    paletteWeights: { pearl: 0.3, lavender: 0.05, ice: 0.2, coral: 0.45 },
    // Congratulatory: petal/bloom unfold -- bloom dominant, echoing bloomOvershoot's timing.
    warp: { fold: [0, 0.05], lift: [0, 0.08], bloom: [0.6, 0.85], fan: [0, 0.06], twist: [-0.05, 0.05] },
    broadenedPhosphor: [1, 0.45, 0.35],
  },
  supportive: {
    coreRadius: [0.12, 0.14],
    layerCount: [2, 3],
    gathering: [0.7, 0.85],
    focus: [0.8, 0.95],
    verticalBias: [-0.02, 0.015],
    // Settle and focus, with a directional "opening" toward one side,
    // standing in for an offered next step (never a literal UI affordance).
    asymmetryMag: [0.032, 0.06],
    asymmetryAngleCenter: null,
    asymmetryAngleSpread: TAU,
    harmonicWeights: {
      1: [0.018, 0.036],
      2: [0.008, 0.02],
      4: [0.008, 0.02],
    },
    boxAnchorCount: [2, 3],
    attackSmoothTime: 0.5,
    releaseSmoothTime: 0.9,
    bloomOvershoot: 0.04,
    breatheAmplitude: 0.018,
    breatheSpeed: 0.45,
    paletteWeights: { pearl: 0.3, lavender: 0.25, ice: 0.4, coral: 0.05 },
    // Supportive: gathered/fanned ribbons opening -- fan dominant.
    warp: { fold: [0, 0.06], lift: [0, 0.05], bloom: [0, 0.05], fan: [0.5, 0.75], twist: [-0.06, 0.06] },
    broadenedPhosphor: [0.75, 0.45, 0.55],
  },
};

export interface Composition {
  stance: Stance;
  seed: number;
  coreRadius: number;
  layerCount: number;
  /** Per fixed layer slot (length MAX_LAYERS): a small phase offset for fold variety. */
  layerPhases: number[];
  gathering: number;
  focus: number;
  verticalBias: number;
  asymmetryAngle: number;
  asymmetryMag: number;
  harmonics: HarmonicTarget[];
  boxAnchors: number[];
  attackSmoothTime: number;
  releaseSmoothTime: number;
  bloomOvershoot: number;
  breatheAmplitude: number;
  breatheSpeed: number;
  paletteWeights: PaletteWeights;
  warp: WarpChannels;
  broadenedPhosphor: readonly [number, number, number];
  signature: string;
}

/** Minimal shape needed to sample a silhouette radius; Composition satisfies it. */
export interface SilhouetteParams {
  coreRadius: number;
  harmonics: readonly HarmonicTarget[];
  asymmetryAngle: number;
  asymmetryMag: number;
}

function round(n: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function buildSignature(c: Omit<Composition, "signature">): string {
  const harmonicPart = c.harmonics
    .map((h) => `${h.k}:${round(h.amp)}:${round(h.phase)}`)
    .join(",");
  const boxPart = c.boxAnchors.map((a) => round(a)).join(",");
  const layerPart = c.layerPhases.map((p) => round(p)).join(",");
  const warpPart = [c.warp.fold, c.warp.lift, c.warp.bloom, c.warp.fan, c.warp.twist].map((v) => round(v)).join(",");
  return [
    c.stance,
    round(c.coreRadius),
    c.layerCount,
    round(c.gathering),
    round(c.focus),
    round(c.verticalBias),
    round(c.asymmetryAngle),
    round(c.asymmetryMag),
    harmonicPart,
    boxPart,
    layerPart,
    warpPart,
  ].join("|");
}

/**
 * Compose a bounded, seeded target set for one stance. Deterministic:
 * identical (stance, seed, intensity) always yields an identical
 * Composition (week3/PLANNING.md#6 "deterministic reproduction of
 * synthetic seeds").
 */
export function composeGrammar(stance: Stance, seed: number, intensity: number): Composition {
  const envelope = STANCE_ENVELOPES[stance];
  const clampedIntensity = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.5;
  const rng: Rng = mulberry32(hashSeed(seed, stance));
  // Never fully flatten geometry at low intensity: keep a visible floor.
  const intensityFactor = 0.35 + 0.65 * clampedIntensity;

  const coreRadius = pickRange(rng, envelope.coreRadius);
  const layerCount = Math.min(MAX_LAYERS, pickInt(rng, envelope.layerCount));
  const gathering = pickRange(rng, envelope.gathering);
  const focus = pickRange(rng, envelope.focus);
  const verticalBias = pickRange(rng, envelope.verticalBias) * intensityFactor;
  const asymmetryMag = pickRange(rng, envelope.asymmetryMag) * intensityFactor;
  const asymmetryAngle =
    envelope.asymmetryAngleCenter === null
      ? rng() * TAU
      : envelope.asymmetryAngleCenter + (rng() - 0.5) * envelope.asymmetryAngleSpread;

  const harmonics: HarmonicTarget[] = [];
  for (const k of HARMONIC_INDICES) {
    const range = envelope.harmonicWeights[k];
    const amp = range ? pickRange(rng, range) * intensityFactor : 0;
    const phase = rng() * TAU;
    harmonics.push({ k, amp, phase });
  }

  const layerPhases: number[] = [];
  for (let i = 0; i < MAX_LAYERS; i++) {
    layerPhases.push(i < layerCount ? (rng() - 0.5) * 0.6 : 0);
  }

  const warp: WarpChannels = {
    fold: pickRange(rng, envelope.warp.fold) * intensityFactor,
    lift: pickRange(rng, envelope.warp.lift) * intensityFactor,
    bloom: pickRange(rng, envelope.warp.bloom) * intensityFactor,
    fan: pickRange(rng, envelope.warp.fan) * intensityFactor,
    twist: pickRange(rng, envelope.warp.twist) * intensityFactor,
  };

  const boxAnchorCount = Math.min(MAX_BOXES, pickInt(rng, envelope.boxAnchorCount));
  const boxAnchors: number[] = [];
  for (let i = 0; i < boxAnchorCount; i++) {
    const evenAngle = (i / boxAnchorCount) * TAU;
    const jitter = (rng() - 0.5) * (TAU / boxAnchorCount) * 0.6;
    boxAnchors.push(evenAngle + jitter);
  }

  // Viewport-fit safety pass: scale coreRadius/harmonics/asymmetry down
  // uniformly (preserving their relative proportions, so the family's
  // character is unchanged) so that even the transient bloom overshoot on
  // the outermost layer stays within SAFE_RADIUS_FRACTION of the min
  // viewport dimension (revision w3-20260927-01 follow-up: silhouette was
  // clipping top/bottom because the composed radius exceeded the viewport).
  const maxLayerScale = 1 + (1 - gathering) * Math.max(0, layerCount - 1) * LAYER_SPREAD_FACTOR;
  const peakBase =
    coreRadius * (1 + envelope.bloomOvershoot) +
    harmonics.reduce((sum, h) => sum + h.amp, 0) * (1 + envelope.bloomOvershoot) +
    asymmetryMag;
  const worstExtent = peakBase * maxLayerScale * EYE_ASPECT_X;
  const safetyScale = worstExtent > SAFE_RADIUS_FRACTION ? SAFE_RADIUS_FRACTION / worstExtent : 1;

  const scaledCoreRadius = coreRadius * safetyScale;
  const scaledHarmonics = harmonics.map((h) => ({ ...h, amp: h.amp * safetyScale }));
  const scaledAsymmetryMag = asymmetryMag * safetyScale;

  const base: Omit<Composition, "signature"> = {
    stance,
    seed,
    coreRadius: scaledCoreRadius,
    layerCount,
    layerPhases,
    gathering,
    focus,
    verticalBias,
    asymmetryAngle,
    asymmetryMag: scaledAsymmetryMag,
    harmonics: scaledHarmonics,
    boxAnchors,
    attackSmoothTime: envelope.attackSmoothTime,
    releaseSmoothTime: envelope.releaseSmoothTime,
    bloomOvershoot: envelope.bloomOvershoot,
    breatheAmplitude: envelope.breatheAmplitude,
    breatheSpeed: envelope.breatheSpeed,
    paletteWeights: envelope.paletteWeights,
    warp,
    broadenedPhosphor: envelope.broadenedPhosphor,
  };

  return { ...base, signature: buildSignature(base) };
}

/**
 * The worst-case scalar radius (before the render-time eye-aspect stretch)
 * this composition's outermost layer can reach, including its transient
 * bloom overshoot. Used both by composeGrammar's own safety pass and by
 * tests asserting the viewport-fit bound holds.
 */
export function maxCompositionExtent(composition: Composition): number {
  const maxLayerScale =
    1 + (1 - composition.gathering) * Math.max(0, composition.layerCount - 1) * LAYER_SPREAD_FACTOR;
  const peakBase =
    composition.coreRadius * (1 + composition.bloomOvershoot) +
    composition.harmonics.reduce((sum, h) => sum + h.amp, 0) * (1 + composition.bloomOvershoot) +
    composition.asymmetryMag;
  return peakBase * maxLayerScale;
}

/**
 * Smoothstep-eased "bloom then settle" envelope: rises from 1 to
 * `1 + overshoot` over `attack` seconds, then eases back down to 1 over the
 * following `release` seconds. `turnAge` is seconds since the current
 * composition began (see runtime.ts); this is a pure function of it, never
 * itself a spring, so it always resolves to exactly 1 well after a turn
 * begins regardless of frame timing.
 */
export function bloomMultiplier(turnAge: number, attack: number, release: number, overshoot: number): number {
  if (overshoot <= 0 || !Number.isFinite(turnAge) || turnAge < 0) return 1;
  const smoothstep = (t: number) => {
    const clamped = Math.min(1, Math.max(0, t));
    return clamped * clamped * (3 - 2 * clamped);
  };
  if (turnAge < attack) {
    return 1 + overshoot * smoothstep(turnAge / Math.max(0.0001, attack));
  }
  const releaseT = (turnAge - attack) / Math.max(0.0001, release);
  if (releaseT >= 1) return 1;
  return 1 + overshoot * (1 - smoothstep(releaseT));
}

/** Sample the silhouette radius (normalized, as a fraction of min viewport dimension) at angle theta. */
export function silhouetteRadius(params: SilhouetteParams, theta: number): number {
  let r = params.coreRadius;
  for (const h of params.harmonics) {
    r += h.amp * Math.sin(h.k * theta + h.phase);
  }
  r += params.asymmetryMag * Math.cos(theta - params.asymmetryAngle);
  return Math.max(0.12, r);
}

/**
 * Bounded, content-free memory of recent composition signatures. Used to
 * reject an accidental immediate repeat (week3/PLANNING.md#2, #6) without
 * ever storing conversation text -- only rounded numeric signatures.
 */
export interface CompositionMemory {
  has(signature: string): boolean;
  remember(signature: string): void;
}

export function createCompositionMemory(size: number = COMPOSITION_MEMORY_SIZE): CompositionMemory {
  const recent: string[] = [];
  return {
    has(signature: string): boolean {
      return recent.includes(signature);
    },
    remember(signature: string): void {
      recent.push(signature);
      while (recent.length > size) recent.shift();
    },
  };
}

/**
 * Compose a fresh grammar, nudging the seed deterministically if the exact
 * signature was recently used, then recording it. Bounded retry count.
 */
export function composeFreshGrammar(
  stance: Stance,
  seed: number,
  intensity: number,
  memory: CompositionMemory
): Composition {
  let effectiveSeed = seed;
  let composition = composeGrammar(stance, effectiveSeed, intensity);
  let guard = 0;
  const maxRetries = 5;
  while (memory.has(composition.signature) && guard < maxRetries) {
    effectiveSeed = hashSeed(effectiveSeed, guard, "retry");
    composition = composeGrammar(stance, effectiveSeed, intensity);
    guard += 1;
  }
  memory.remember(composition.signature);
  return composition;
}

/**
 * How many of a composition's box anchors should be active (visible) for a
 * given turn state. Tracking boxes recur across idle/listening/processing/
 * speaking; they yield immediately on interrupted and stay absent when
 * unavailable (week3/DESIGN.md#6).
 */
export function boxCountForState(state: TurnState, anchorCount: number): number {
  const cap = Math.min(MAX_BOXES, anchorCount);
  switch (state) {
    case "idle":
      return Math.min(cap, 2);
    case "listening":
      return Math.min(cap, Math.max(1, Math.round(cap * 0.6)));
    case "processing":
      return cap;
    case "speaking":
      return Math.min(cap, Math.max(1, Math.round(cap * 0.75)));
    case "interrupted":
    case "unavailable":
    default:
      return 0;
  }
}

/** Whether GIF-inspired fragmentation trails should be present for a turn state. */
export function fragmentationTargetForState(state: TurnState, intensity: number): number {
  if (state !== "processing") return 0;
  const clamped = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.5;
  return 0.4 + 0.6 * clamped;
}

/**
 * Owner steering (2026-09-27, W3 brain-seam interjection): the backend
 * leaves `stance` set to the last confirmed reply's stance until the next
 * one is validated; playback of that reply is the only moment its full
 * expression should be visible. Without this, an old stance like
 * `congratulatory` would keep showing a full bloom indefinitely while the
 * renderer sits in `listening`/`processing` waiting for the next turn.
 *
 * `energyTargetForState` is a purely turn-state-driven (never stance- or
 * amplitude-driven) 0..1 target: 1 only while actually `speaking`, 0
 * otherwise. This does not create a new semantic stance and does not read
 * or infer emotion -- it only decides how much of the *already validated*
 * stance's expression is currently showing. See runtime.ts's `energy`
 * kinematic, which springs toward this target and is what actually blends
 * geometry between the current stance and a fixed neutral/attentive
 * baseline.
 */
export function energyTargetForState(state: TurnState): number {
  return state === "speaking" ? 1 : 0;
}

/**
 * A single fixed, seed-independent "neutral attentive" composition that
 * expressive energy releases toward between turns. Deterministic and
 * computed once at module load: every session relaxes to the exact same
 * calm identity, rather than a fresh random variation, so "resting" reads
 * as one stable presence.
 */
const NEUTRAL_RELEASE_SEED = 0x4e455554; // "NEUT", arbitrary fixed constant
export const NEUTRAL_COMPOSITION: Composition = composeGrammar("attentive", NEUTRAL_RELEASE_SEED, 0.3);
