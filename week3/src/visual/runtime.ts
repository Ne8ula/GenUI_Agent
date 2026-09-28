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

import { ENERGY_RELEASE_SMOOTH_TIME, HARMONIC_INDICES, LAYER_SPREAD_FACTOR, MAX_BOXES, MAX_LAYERS } from "./constants";
import {
  bloomMultiplier,
  boxCountForState,
  composeFreshGrammar,
  createCompositionMemory,
  energyTargetForState,
  fragmentationTargetForState,
  silhouetteRadius,
  NEUTRAL_COMPOSITION,
  SOURCE_RED,
  type Composition,
  type CompositionMemory,
  type HarmonicTarget,
  type Stance,
  type TurnState,
  type WarpChannels,
} from "./grammar";
import {
  createKinematic,
  nearestEquivalentAngle,
  snapKinematic,
  stepAngleKinematic,
  stepKinematic,
  type Kinematic,
} from "./spring";
import { hashSeed } from "./rng";
import { normalizeWeights, type PaletteWeights } from "./palette";

export type { WarpChannels } from "./grammar";

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

interface PaletteKinematics {
  pearl: Kinematic;
  lavender: Kinematic;
  ice: Kinematic;
  coral: Kinematic;
}

interface WarpKinematics {
  fold: Kinematic;
  lift: Kinematic;
  bloom: Kinematic;
  fan: Kinematic;
  twist: Kinematic;
}

interface PhosphorKinematics {
  r: Kinematic;
  g: Kinematic;
  b: Kinematic;
}

export interface AnimationRuntime {
  memory: CompositionMemory;
  composition: Composition;
  lastSeed: number | null;
  lastStance: Stance | null;
  /** Global clock: only ever advances, never reset by a retarget (week3/DESIGN.md#6). */
  timeSec: number;
  /** Seconds since the current composition began; drives the bloom-then-settle envelope only. */
  turnAge: number;
  /**
   * 0..1, driven purely by turn state (energyTargetForState): how much of
   * the current stance's expression is showing right now, versus the fixed
   * neutral/attentive baseline (NEUTRAL_COMPOSITION). 1 only while actually
   * speaking; releases toward 0 the rest of the time so an old stance never
   * "endlessly celebrates" between turns (owner steering, 2026-09-27).
   */
  energy: Kinematic;
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
  paletteWeights: PaletteKinematics;
  /**
   * The five stances' distinct authored transformations of the one source
   * eye (owner clarification, 2026-09-27), blended toward the neutral
   * (near-zero, "stable original eye") baseline by the same `energy`
   * spring as everything else. See grammar.ts's `WarpChannels` doc.
   */
  warp: WarpKinematics;
  /** RGB 0..1; the source eye's red phosphor, broadening toward the stance's color only as `energy` rises. */
  phosphor: PhosphorKinematics;
}

const INTERRUPT_SMOOTH_TIME = 0.16;

export function createAnimationRuntime(): AnimationRuntime {
  const placeholder = composeFreshGrammar("attentive", 1, 0.5, createCompositionMemory(1));
  return {
    memory: createCompositionMemory(),
    // Placeholder composition; the first advanceRuntime call always detects
    // lastSeed/lastStance as unset and composes a real one before it is drawn.
    composition: placeholder,
    lastSeed: null,
    lastStance: null,
    timeSec: 0,
    turnAge: 0,
    energy: createKinematic(0),
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
    paletteWeights: {
      pearl: createKinematic(placeholder.paletteWeights.pearl),
      lavender: createKinematic(placeholder.paletteWeights.lavender),
      ice: createKinematic(placeholder.paletteWeights.ice),
      coral: createKinematic(placeholder.paletteWeights.coral),
    },
    warp: {
      fold: createKinematic(0),
      lift: createKinematic(0),
      bloom: createKinematic(0),
      fan: createKinematic(0),
      twist: createKinematic(0),
    },
    phosphor: {
      r: createKinematic(SOURCE_RED[0]),
      g: createKinematic(SOURCE_RED[1]),
      b: createKinematic(SOURCE_RED[2]),
    },
  };
}

function harmonicTarget(composition: Composition, k: number): HarmonicTarget {
  return composition.harmonics.find((h) => h.k === k) ?? { k, amp: 0, phase: 0 };
}

/**
 * Advance one tick.
 *
 * - `props.reducedMotion` snaps every quantity directly to its target (no
 *   springs at all): a static but meaningfully varied composition with no
 *   breathing/drift/deformation, per week3/DESIGN.md#6.
 * - `!props.active` with a *freshly recomposed* target (stance/seed just
 *   changed, e.g. the pre-activation idle pose, or a stance switch while
 *   inactive) also snaps directly: there is no running animation loop to
 *   ease it in, so it must read as a finished, recognizable pose rather
 *   than the runtime's raw initial spring values. `!props.active` with an
 *   *unchanged* composition (e.g. End mid-transition) does not snap: it
 *   simply stops advancing (dt from the caller is 0), freezing exactly
 *   where the shape already was -- "freeze existing shape ... don't reset."
 * - `props.state === 'interrupted'` uses a short, still-eased (not
 *   instant) time constant for the eye's own geometry so the pose yields
 *   immediately without a jarring pop, but fragmentation trails are cut
 *   immediately (see below): only processing ever produces them.
 * - Expressive geometry is blended between the current stance's composition
 *   and a fixed neutral/attentive baseline by `energy` (0..1, driven only by
 *   `props.state`, never `props.stance`): full expression only while
 *   `speaking`, releasing back to neutral the rest of the time so a stale
 *   stance (the backend leaves `stance` set until the next reply) never
 *   keeps "celebrating" through `listening`/`processing`.
 */
export function advanceRuntime(runtime: AnimationRuntime, props: EyeStageProps, dt: number): void {
  const stanceChanged = props.stance !== runtime.lastStance;
  const seedChanged = props.seed !== runtime.lastSeed;
  const justRecomposed = stanceChanged || seedChanged;
  if (!props.active && !justRecomposed) dt = 0;
  if (justRecomposed) {
    runtime.composition = composeFreshGrammar(props.stance, props.seed, props.intensity, runtime.memory);
    runtime.lastStance = props.stance;
    runtime.lastSeed = props.seed;
    runtime.turnAge = 0;
  }
  const comp = runtime.composition;
  const interrupted = props.state === "interrupted";
  const reduced = props.reducedMotion;
  const staticSnap = reduced || (!props.active && justRecomposed);

  if (!reduced && props.active) {
    runtime.timeSec += dt;
    runtime.turnAge += dt;
  }

  const attack = interrupted ? INTERRUPT_SMOOTH_TIME : comp.attackSmoothTime;
  const release = interrupted ? INTERRUPT_SMOOTH_TIME : comp.releaseSmoothTime;
  // Angles (fold phase, layer rotation, box position, asymmetry direction)
  // and palette weight blending have no meaningful "growing vs shrinking"
  // direction, so they use a single blended time constant rather than the
  // attack/release split.
  const blendSmoothTime = interrupted ? INTERRUPT_SMOOTH_TIME : (comp.attackSmoothTime + comp.releaseSmoothTime) / 2;

  const smoothTimeFor = (current: number, target: number) => (target > current ? attack : release);

  const step = (k: Kinematic, target: number): Kinematic =>
    staticSnap ? snapKinematic(target) : stepKinematic(k, target, smoothTimeFor(k.value, target), dt);

  const blend = (k: Kinematic, target: number): Kinematic =>
    staticSnap ? snapKinematic(target) : stepKinematic(k, target, blendSmoothTime, dt);

  const stepAngle = (k: Kinematic, target: number): Kinematic =>
    staticSnap
      ? snapKinematic(nearestEquivalentAngle(k.value, target))
      : stepAngleKinematic(k, target, blendSmoothTime, dt);

  // Real "bloom then settle" (DESIGN.md#5): a transient outward overshoot
  // driven purely by elapsed turnAge, not spring overshoot (the spring
  // itself is critically damped and never overshoots its own target).
  const bloom = reduced ? 1 : bloomMultiplier(runtime.turnAge, comp.attackSmoothTime, comp.releaseSmoothTime, comp.bloomOvershoot);

  // Expressive energy: 1 only while actually speaking, released toward 0
  // the rest of the time. Rising uses the stance's own attack character;
  // releasing always uses the fixed ENERGY_RELEASE_SMOOTH_TIME (~1-2s to
  // fully settle) regardless of stance, per owner steering 2026-09-27 --
  // this is what stops an old stance from "endlessly celebrating" once its
  // turn is over. `stance` itself is never touched; only how much of its
  // expression currently shows.
  const energyTarget = energyTargetForState(props.state);
  const energySmoothTime = interrupted
    ? INTERRUPT_SMOOTH_TIME
    : energyTarget > runtime.energy.value
      ? comp.attackSmoothTime
      : ENERGY_RELEASE_SMOOTH_TIME;
  runtime.energy = staticSnap ? snapKinematic(energyTarget) : stepKinematic(runtime.energy, energyTarget, energySmoothTime, dt);
  const energy = runtime.energy.value;
  const neutral = NEUTRAL_COMPOSITION;
  const mix = (neutralValue: number, expressedValue: number) => neutralValue + (expressedValue - neutralValue) * energy;

  runtime.core = step(runtime.core, mix(neutral.coreRadius, comp.coreRadius * bloom));
  runtime.gathering = step(runtime.gathering, mix(neutral.gathering, comp.gathering));
  runtime.focus = step(runtime.focus, mix(neutral.focus, comp.focus));
  runtime.verticalBias = step(runtime.verticalBias, mix(neutral.verticalBias, comp.verticalBias));
  // Direction has no meaningful "neutral" value to blend toward, only
  // magnitude does -- so asymmetry angle always targets the current
  // stance's own angle, while its magnitude releases toward neutral's.
  runtime.asymmetryAngle = stepAngle(runtime.asymmetryAngle, comp.asymmetryAngle);
  runtime.asymmetryMag = step(runtime.asymmetryMag, mix(neutral.asymmetryMag, comp.asymmetryMag));

  runtime.harmonics = HARMONIC_INDICES.map((k, i) => {
    const target = harmonicTarget(comp, k);
    const neutralTarget = harmonicTarget(neutral, k);
    const slot = runtime.harmonics[i];
    return {
      amp: step(slot.amp, mix(neutralTarget.amp, target.amp * bloom)),
      // Same reasoning as asymmetry angle: phase is only meaningful once
      // amplitude is non-negligible, so it always targets the current
      // stance's own phase.
      phase: stepAngle(slot.phase, target.phase),
    };
  });

  runtime.layerOpacity = runtime.layerOpacity.map((k, i) =>
    step(k, mix(i < neutral.layerCount ? 1 : 0, i < comp.layerCount ? 1 : 0))
  );
  runtime.layerRotation = runtime.layerRotation.map((k, i) => stepAngle(k, comp.layerPhases[i] ?? 0));

  // The five distinct transformations of the one source eye: each channel
  // blends between neutral's near-0 (stable, unwarped source eye) and the
  // current stance's own value, by the same energy-driven `mix` as every
  // other expressive quantity -- so a stale stance's fold/lift/bloom/fan
  // relaxes away exactly like everything else once a turn stops speaking.
  runtime.warp = {
    fold: step(runtime.warp.fold, comp.warp.fold * energy),
    lift: step(runtime.warp.lift, comp.warp.lift * energy),
    bloom: step(runtime.warp.bloom, comp.warp.bloom * bloom * energy),
    fan: step(runtime.warp.fan, comp.warp.fan * energy),
    twist: stepAngle(runtime.warp.twist, comp.warp.twist * energy),
  };

  // Source color returns to red at rest; broadens toward the stance's
  // target only as `energy` (actual speaking) rises (owner clarification:
  // "broader colors during replies, original red at rest").
  runtime.phosphor = {
    r: blend(runtime.phosphor.r, mix(SOURCE_RED[0], comp.broadenedPhosphor[0])),
    g: blend(runtime.phosphor.g, mix(SOURCE_RED[1], comp.broadenedPhosphor[1])),
    b: blend(runtime.phosphor.b, mix(SOURCE_RED[2], comp.broadenedPhosphor[2])),
  };

  runtime.paletteWeights = {
    pearl: blend(runtime.paletteWeights.pearl, mix(neutral.paletteWeights.pearl, comp.paletteWeights.pearl)),
    lavender: blend(runtime.paletteWeights.lavender, mix(neutral.paletteWeights.lavender, comp.paletteWeights.lavender)),
    ice: blend(runtime.paletteWeights.ice, mix(neutral.paletteWeights.ice, comp.paletteWeights.ice)),
    coral: blend(runtime.paletteWeights.coral, mix(neutral.paletteWeights.coral, comp.paletteWeights.coral)),
  };

  const activeBoxCount = props.active ? boxCountForState(props.state, comp.boxAnchors.length) : 0;
  runtime.boxes = runtime.boxes.map((box, i) => {
    const anchor = comp.boxAnchors.length > 0 ? comp.boxAnchors[i % comp.boxAnchors.length] : box.angle.value;
    const wantsVisible = i < activeBoxCount;
    return {
      angle: stepAngle(box.angle, anchor),
      opacity: interrupted && !staticSnap ? stepKinematic(box.opacity, 0, 0.12, dt) : step(box.opacity, wantsVisible ? 1 : 0),
      sizeJitter: box.sizeJitter,
    };
  });

  // Only processing ever produces the GIF-inspired fragmentation trails,
  // and they are cut immediately (not eased) the instant a turn is
  // interrupted or the session goes inactive -- a normal processing ->
  // speaking handoff still blends away smoothly (release smoothTime).
  if (!props.active || interrupted) {
    runtime.fragmentation = snapKinematic(0);
  } else if (reduced) {
    // Reduced motion removes traveling particles entirely (DESIGN.md#6).
    runtime.fragmentation = snapKinematic(0);
  } else {
    const fragTarget = fragmentationTargetForState(props.state, props.intensity);
    runtime.fragmentation = stepKinematic(
      runtime.fragmentation,
      fragTarget,
      smoothTimeFor(runtime.fragmentation.value, fragTarget),
      dt
    );
  }
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
  /** Stable per-composition seed for fragment/streak placement (never derived from a live-changing value). */
  fragmentSeed: number;
  /** 0..1, live expressive energy (see grammar.ts's energyTargetForState/runtime.ts's `energy` kinematic). */
  energy: number;
  /** The current stance's distinct, energy-blended transformation of the one source eye. */
  warp: WarpChannels;
  /** RGB 0..1, the source eye's phosphor color: red at rest, broadening with `energy`. */
  phosphor: readonly [number, number, number];
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
 *
 * A small continuous "breathing"/buoyancy offset is added on top of the
 * spring-settled values here (not as part of the spring targets), so the
 * sculpture stays subtly alive even once every spring has converged. It is
 * a pure function of `runtime.timeSec` (which itself only advances while
 * `active && !reducedMotion`), so it automatically freezes when inactive
 * and never appears at all under reduced motion.
 */
export function buildFrame(runtime: AnimationRuntime, props: EyeStageProps): EyeFrame {
  const comp = runtime.composition;
  // Inactive sessions retain their last clock value, including its motion offset.
  const liveMotion = !props.reducedMotion;
  const breathePhase = (hashSeed(comp.signature, "breathe") % 1000) / 1000 * Math.PI * 2;
  const breatheWave = liveMotion ? Math.sin(runtime.timeSec * comp.breatheSpeed + breathePhase) : 0;
  const buoyancyWave = liveMotion
    ? Math.sin(runtime.timeSec * comp.breatheSpeed * 0.7 + breathePhase + 1.7)
    : 0;

  const coreRadius = Math.max(0.08, runtime.core.value * (1 + comp.breatheAmplitude * breatheWave));
  const verticalBias = runtime.verticalBias.value + comp.breatheAmplitude * 0.6 * buoyancyWave;

  const gathering = runtime.gathering.value;
  const layers: EyeFrameLayer[] = runtime.layerOpacity
    .map((opacityK, i) => ({
      radiusScale: 1 + (1 - gathering) * i * LAYER_SPREAD_FACTOR,
      opacity: opacityK.value,
      rotation:
        (runtime.layerRotation[i]?.value ?? 0) +
        (liveMotion ? comp.breatheAmplitude * 0.4 * Math.sin(runtime.timeSec * comp.breatheSpeed * 0.6 + breathePhase + i) : 0),
    }))
    .filter((layer) => layer.opacity > LAYER_OPACITY_EPSILON);

  const boxes: EyeFrameBox[] = props.active
    ? runtime.boxes
        .map((box) => ({ angle: box.angle.value, opacity: box.opacity.value, sizeJitter: box.sizeJitter }))
        .filter((box) => box.opacity > BOX_OPACITY_EPSILON)
    : [];

  return {
    timeSec: runtime.timeSec,
    coreRadius,
    focus: runtime.focus.value,
    verticalBias,
    asymmetryAngle: runtime.asymmetryAngle.value,
    asymmetryMag: runtime.asymmetryMag.value,
    harmonics: runtime.harmonics.map((h, i) => ({ k: HARMONIC_INDICES[i], amp: h.amp.value, phase: h.phase.value })),
    layers,
    boxes,
    fragmentation: props.active && props.state === 'processing' && !props.reducedMotion ? runtime.fragmentation.value : 0,
    paletteWeights: normalizeWeights({
      pearl: runtime.paletteWeights.pearl.value,
      lavender: runtime.paletteWeights.lavender.value,
      ice: runtime.paletteWeights.ice.value,
      coral: runtime.paletteWeights.coral.value,
    }),
    fragmentSeed: hashSeed(comp.signature, "frag"),
    energy: runtime.energy.value,
    warp: {
      fold: runtime.warp.fold.value,
      lift: runtime.warp.lift.value,
      bloom: runtime.warp.bloom.value,
      fan: runtime.warp.fan.value,
      twist: runtime.warp.twist.value,
    },
    phosphor: [runtime.phosphor.r.value, runtime.phosphor.g.value, runtime.phosphor.b.value],
  };
}

/** Re-exported for callers/tests that want the live silhouette sample from a frame. */
export function frameSilhouetteRadius(frame: EyeFrame, theta: number): number {
  return silhouetteRadius(
    { coreRadius: frame.coreRadius, harmonics: frame.harmonics, asymmetryAngle: frame.asymmetryAngle, asymmetryMag: frame.asymmetryMag },
    theta
  );
}
