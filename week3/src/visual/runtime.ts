/**
 * Pure (DOM-free) animation runtime: turns a stream of (state, stance,
 * intensity, seed, reducedMotion, active) props plus a frame delta into a
 * concrete drawable `EyeFrame`. Kept separate from React/canvas so the
 * retargeting and bounding behavior can be unit tested directly.
 *
 * The runtime object is created once per mounted <EyeStage> and mutated in
 * place by `advanceRuntime` every tick; every animated quantity lives in a
 * fixed-size slot (HARMONIC_INDICES / MAX_LAYERS / MAX_BOXES) so switching
 * stance never changes the *dimensionality* of the spring state -- only the
 * targets change, which is what lets retargeting carry over current
 * position and velocity instead of popping (week3/DESIGN.md#6).
 */

import {
  HARMONIC_INDICES,
  MAX_BOXES,
  MAX_LAYERS,
} from "./constants";
import {
  boxCountForState,
  composeFreshGrammar,
  createCompositionMemory,
  fragmentationTargetForState,
  silhouetteRadius,
  type Composition,
  type CompositionMemory,
  type HarmonicTarget,
  type Stance,
  type TurnState,
} from "./grammar";
import {
  createKinematic,
  nearestEquivalentAngle,
  snapKinematic,
  stepAngleKinematic,
  stepKinematic,
  type Kinematic,
} from "./spring";
import type { PaletteWeights } from "./palette";

export interface EyeStageProps {
  state: TurnState;
  stance: Stance;
  intensity: number;
  seed: number;
  reducedMotion: boolean;
  active: boolean;
}

interface BoxSlot {
  angle: Kinematic;
  opacity: Kinematic;
  /** Stable per-slot size variety, assigned once from the composition, not re-rolled every tick. */
  sizeJitter: number;
}

export interface AnimationRuntime {
  memory: CompositionMemory;
  composition: Composition;
  lastSeed: number | null;
  lastStance: Stance | null;
  timeSec: number;
  core: Kinematic;
  gathering: Kinematic;
  focus: Kinematic;
  verticalBias: Kinematic;
  asymmetryAngle: Kinematic;
  asymmetryMag: Kinematic;
  harmonics: Array<{ amp: Kinematic; phase: Kinematic }>;
  layerOpacity: Kinematic[];
  layerRotation: Kinematic[];
  boxes: BoxSlot[];
  fragmentation: Kinematic;
}

const INTERRUPT_SMOOTH_TIME = 0.16;

export function createAnimationRuntime(): AnimationRuntime {
  return {
    memory: createCompositionMemory(),
    // Placeholder composition; the first advanceRuntime call always detects
    // lastSeed/lastStance as unset and composes a real one before it is drawn.
    composition: composeFreshGrammar("attentive", 1, 0.5, createCompositionMemory(1)),
    lastSeed: null,
    lastStance: null,
    timeSec: 0,
    core: createKinematic(0.3),
    gathering: createKinematic(0.7),
    focus: createKinematic(0.6),
    verticalBias: createKinematic(0),
    asymmetryAngle: createKinematic(0),
    asymmetryMag: createKinematic(0),
    harmonics: HARMONIC_INDICES.map(() => ({ amp: createKinematic(0), phase: createKinematic(0) })),
    layerOpacity: Array.from({ length: MAX_LAYERS }, (_, i) => createKinematic(i === 0 ? 1 : 0)),
    layerRotation: Array.from({ length: MAX_LAYERS }, () => createKinematic(0)),
    boxes: Array.from({ length: MAX_BOXES }, (_, i) => ({
      angle: createKinematic((i / MAX_BOXES) * Math.PI * 2),
      opacity: createKinematic(0),
      sizeJitter: 0.5,
    })),
    fragmentation: createKinematic(0),
  };
}

function harmonicTarget(composition: Composition, k: number): HarmonicTarget {
  return composition.harmonics.find((h) => h.k === k) ?? { k, amp: 0, phase: 0 };
}

/**
 * Advance one tick. When `props.reducedMotion` is true every quantity snaps
 * directly to its target (no springs at all), producing a static but
 * meaningfully varied composition with no breathing/drift/deformation, per
 * week3/DESIGN.md#6. When `props.state === 'interrupted'` a short, still-
 * eased (not instant) time constant is used so the pose yields immediately
 * without a jarring pop.
 */
export function advanceRuntime(runtime: AnimationRuntime, props: EyeStageProps, dt: number): void {
  const stanceChanged = props.stance !== runtime.lastStance;
  const seedChanged = props.seed !== runtime.lastSeed;
  if (stanceChanged || seedChanged) {
    runtime.composition = composeFreshGrammar(props.stance, props.seed, props.intensity, runtime.memory);
    runtime.lastStance = props.stance;
    runtime.lastSeed = props.seed;
  }
  const comp = runtime.composition;
  const interrupted = props.state === "interrupted";
  const reduced = props.reducedMotion;

  if (!reduced && props.active) {
    runtime.timeSec += dt;
  }

  const attack = interrupted ? INTERRUPT_SMOOTH_TIME : comp.attackSmoothTime;
  const release = interrupted ? INTERRUPT_SMOOTH_TIME : comp.releaseSmoothTime;
  // Angles (fold phase, layer rotation, box position, asymmetry direction)
  // have no meaningful "growing vs shrinking" direction, so they use a
  // single blended time constant rather than the attack/release split.
  const angleSmoothTime = interrupted ? INTERRUPT_SMOOTH_TIME : (comp.attackSmoothTime + comp.releaseSmoothTime) / 2;

  const smoothTimeFor = (current: number, target: number) => (target > current ? attack : release);

  const step = (k: Kinematic, target: number): Kinematic =>
    reduced ? snapKinematic(target) : stepKinematic(k, target, smoothTimeFor(k.value, target), dt);

  const stepAngle = (k: Kinematic, target: number): Kinematic =>
    reduced
      ? snapKinematic(nearestEquivalentAngle(k.value, target))
      : stepAngleKinematic(k, target, angleSmoothTime, dt);

  runtime.core = step(runtime.core, comp.coreRadius);
  runtime.gathering = step(runtime.gathering, comp.gathering);
  runtime.focus = step(runtime.focus, comp.focus);
  runtime.verticalBias = step(runtime.verticalBias, comp.verticalBias);
  runtime.asymmetryAngle = stepAngle(runtime.asymmetryAngle, comp.asymmetryAngle);
  runtime.asymmetryMag = step(runtime.asymmetryMag, comp.asymmetryMag);

  runtime.harmonics = HARMONIC_INDICES.map((k, i) => {
    const target = harmonicTarget(comp, k);
    const slot = runtime.harmonics[i];
    return {
      amp: step(slot.amp, target.amp),
      phase: stepAngle(slot.phase, target.phase),
    };
  });

  runtime.layerOpacity = runtime.layerOpacity.map((k, i) => step(k, i < comp.layerCount ? 1 : 0));
  runtime.layerRotation = runtime.layerRotation.map((k, i) => stepAngle(k, comp.layerPhases[i] ?? 0));

  const activeBoxCount = props.active ? boxCountForState(props.state, comp.boxAnchors.length) : 0;
  runtime.boxes = runtime.boxes.map((box, i) => {
    const anchor = comp.boxAnchors.length > 0 ? comp.boxAnchors[i % comp.boxAnchors.length] : box.angle.value;
    const wantsVisible = i < activeBoxCount;
    return {
      angle: stepAngle(box.angle, anchor),
      opacity: step(box.opacity, wantsVisible ? 1 : 0),
      sizeJitter: box.sizeJitter,
    };
  });

  // Reduced motion removes traveling particles entirely (DESIGN.md#6): the
  // GIF-inspired fragmentation trails only ever appear in full-motion mode.
  const fragTarget = props.active && !reduced ? fragmentationTargetForState(props.state, props.intensity) : 0;
  runtime.fragmentation = step(runtime.fragmentation, fragTarget);
}

export interface EyeFrameLayer {
  radiusScale: number;
  opacity: number;
  rotation: number;
}

export interface EyeFrameBox {
  angle: number;
  opacity: number;
  sizeJitter: number;
}

export interface EyeFrame {
  timeSec: number;
  coreRadius: number;
  focus: number;
  verticalBias: number;
  asymmetryAngle: number;
  asymmetryMag: number;
  harmonics: HarmonicTarget[];
  layers: EyeFrameLayer[];
  boxes: EyeFrameBox[];
  fragmentation: number;
  paletteWeights: PaletteWeights;
}

const BOX_OPACITY_EPSILON = 0.01;
const LAYER_OPACITY_EPSILON = 0.01;

/**
 * Build the immutable per-frame description consumed by render.ts. `!active`
 * forces boxes and fragmentation to nothing regardless of where their
 * springs currently sit, without mutating the runtime -- so if `active`
 * becomes true again motion resumes from the preserved spring state instead
 * of popping back in (week3/DESIGN.md: "End active=false stops every
 * animation and boxes").
 */
export function buildFrame(runtime: AnimationRuntime, props: EyeStageProps): EyeFrame {
  const gathering = runtime.gathering.value;
  const layers: EyeFrameLayer[] = runtime.layerOpacity
    .map((opacityK, i) => ({
      radiusScale: 1 + (1 - gathering) * i * 0.22,
      opacity: opacityK.value,
      rotation: runtime.layerRotation[i]?.value ?? 0,
    }))
    .filter((layer) => layer.opacity > LAYER_OPACITY_EPSILON);

  const boxes: EyeFrameBox[] = props.active
    ? runtime.boxes
        .map((box) => ({ angle: box.angle.value, opacity: box.opacity.value, sizeJitter: box.sizeJitter }))
        .filter((box) => box.opacity > BOX_OPACITY_EPSILON)
    : [];

  return {
    timeSec: runtime.timeSec,
    coreRadius: runtime.core.value,
    focus: runtime.focus.value,
    verticalBias: runtime.verticalBias.value,
    asymmetryAngle: runtime.asymmetryAngle.value,
    asymmetryMag: runtime.asymmetryMag.value,
    harmonics: runtime.harmonics.map((h, i) => ({ k: HARMONIC_INDICES[i], amp: h.amp.value, phase: h.phase.value })),
    layers,
    boxes,
    fragmentation: props.active ? runtime.fragmentation.value : 0,
    paletteWeights: runtime.composition.paletteWeights,
  };
}

/** Re-exported for callers/tests that want the live silhouette sample from a frame. */
export function frameSilhouetteRadius(frame: EyeFrame, theta: number): number {
  return silhouetteRadius(
    { coreRadius: frame.coreRadius, harmonics: frame.harmonics, asymmetryAngle: frame.asymmetryAngle, asymmetryMag: frame.asymmetryMag },
    theta
  );
}
