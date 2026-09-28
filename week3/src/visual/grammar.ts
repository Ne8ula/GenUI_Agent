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

import { HARMONIC_INDICES, MAX_BOXES, MAX_LAYERS, COMPOSITION_MEMORY_SIZE } from "./constants";
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
  paletteWeights: PaletteWeights;
}

const TAU = Math.PI * 2;

export const STANCE_ENVELOPES: Record<Stance, StanceEnvelope> = {
  attentive: {
    coreRadius: [0.34, 0.38],
    layerCount: [2, 3],
    gathering: [0.75, 0.9],
    focus: [0.6, 0.75],
    verticalBias: [-0.02, 0.02],
    asymmetryMag: [0.01, 0.05],
    asymmetryAngleCenter: null,
    asymmetryAngleSpread: TAU,
    harmonicWeights: {
      1: [0, 0.02],
      2: [0.02, 0.06],
      3: [0, 0.03],
      4: [0, 0.02],
    },
    boxAnchorCount: [2, 3],
    attackSmoothTime: 0.5,
    releaseSmoothTime: 0.5,
    paletteWeights: { pearl: 0.55, lavender: 0.15, ice: 0.25, coral: 0.05 },
  },
  comforting: {
    coreRadius: [0.3, 0.34],
    layerCount: [3, 4],
    gathering: [0.55, 0.7],
    focus: [0.7, 0.85],
    verticalBias: [-0.08, -0.03],
    asymmetryMag: [0.06, 0.12],
    // Gently orient toward the user: bias the fold toward the lower half.
    asymmetryAngleCenter: Math.PI / 2,
    asymmetryAngleSpread: 0.7,
    harmonicWeights: {
      1: [0.03, 0.07],
      2: [0.05, 0.09],
      3: [0.01, 0.03],
    },
    boxAnchorCount: [1, 3],
    attackSmoothTime: 0.9,
    releaseSmoothTime: 1.3,
    paletteWeights: { pearl: 0.35, lavender: 0.45, ice: 0.15, coral: 0.05 },
  },
  shared_joy: {
    coreRadius: [0.36, 0.42],
    layerCount: [3, 5],
    gathering: [0.5, 0.65],
    focus: [0.5, 0.65],
    verticalBias: [0.05, 0.12],
    asymmetryMag: [0.03, 0.08],
    // Light lift/broaden upward.
    asymmetryAngleCenter: -Math.PI / 2,
    asymmetryAngleSpread: 0.9,
    harmonicWeights: {
      1: [0, 0.02],
      2: [0.06, 0.1],
      3: [0.05, 0.09],
      4: [0.03, 0.06],
    },
    boxAnchorCount: [3, 5],
    attackSmoothTime: 0.35,
    releaseSmoothTime: 0.6,
    paletteWeights: { pearl: 0.4, lavender: 0.1, ice: 0.2, coral: 0.3 },
  },
  congratulatory: {
    coreRadius: [0.4, 0.48],
    layerCount: [4, 5],
    gathering: [0.3, 0.45],
    focus: [0.55, 0.7],
    verticalBias: [0.06, 0.14],
    asymmetryMag: [0.02, 0.06],
    // Radial burst: no single directional lean.
    asymmetryAngleCenter: null,
    asymmetryAngleSpread: TAU,
    harmonicWeights: {
      1: [0, 0.02],
      3: [0.08, 0.14],
      5: [0.06, 0.1],
      6: [0.04, 0.08],
    },
    boxAnchorCount: [4, 6],
    // Fast bloom, slow easy settle -- an asymmetric attack/release pair
    // is what produces the "fuller outward bloom, then an easy settling"
    // sequence from DESIGN.md#5 without a scripted keyframe clip.
    attackSmoothTime: 0.25,
    releaseSmoothTime: 1.6,
    paletteWeights: { pearl: 0.3, lavender: 0.05, ice: 0.2, coral: 0.45 },
  },
  supportive: {
    coreRadius: [0.28, 0.32],
    layerCount: [2, 3],
    gathering: [0.7, 0.85],
    focus: [0.8, 0.95],
    verticalBias: [-0.03, 0.02],
    // Settle and focus, with a directional "opening" toward one side,
    // standing in for an offered next step (never a literal UI affordance).
    asymmetryMag: [0.1, 0.18],
    asymmetryAngleCenter: null,
    asymmetryAngleSpread: TAU,
    harmonicWeights: {
      1: [0.05, 0.1],
      2: [0.02, 0.05],
      4: [0.02, 0.05],
    },
    boxAnchorCount: [2, 3],
    attackSmoothTime: 0.5,
    releaseSmoothTime: 0.9,
    paletteWeights: { pearl: 0.3, lavender: 0.25, ice: 0.4, coral: 0.05 },
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
  paletteWeights: PaletteWeights;
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

  const boxAnchorCount = Math.min(MAX_BOXES, pickInt(rng, envelope.boxAnchorCount));
  const boxAnchors: number[] = [];
  for (let i = 0; i < boxAnchorCount; i++) {
    const evenAngle = (i / boxAnchorCount) * TAU;
    const jitter = (rng() - 0.5) * (TAU / boxAnchorCount) * 0.6;
    boxAnchors.push(evenAngle + jitter);
  }

  const base: Omit<Composition, "signature"> = {
    stance,
    seed,
    coreRadius,
    layerCount,
    layerPhases,
    gathering,
    focus,
    verticalBias,
    asymmetryAngle,
    asymmetryMag,
    harmonics,
    boxAnchors,
    attackSmoothTime: envelope.attackSmoothTime,
    releaseSmoothTime: envelope.releaseSmoothTime,
    paletteWeights: envelope.paletteWeights,
  };

  return { ...base, signature: buildSignature(base) };
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
