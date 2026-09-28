import { describe, expect, it } from "vitest";
import {
  STANCE_ENVELOPES,
  composeFreshGrammar,
  composeGrammar,
  createCompositionMemory,
  silhouetteRadius,
  boxCountForState,
  fragmentationTargetForState,
  maxCompositionExtent,
  bloomMultiplier,
  energyTargetForState,
  NEUTRAL_COMPOSITION,
  SOURCE_RED,
  type Composition,
  type Stance,
} from "../src/visual/grammar";
import {
  EYE_ASPECT_X,
  HARMONIC_INDICES,
  MAX_BOXES,
  MAX_LAYERS,
  SAFE_RADIUS_FRACTION,
} from "../src/visual/constants";
import {
  createKinematic,
  nearestEquivalentAngle,
  smoothDamp,
  snapKinematic,
  stepKinematic,
} from "../src/visual/spring";
import {
  advanceRuntime,
  buildFrame,
  createAnimationRuntime,
  frameSilhouetteRadius,
  type EyeStageProps,
} from "../src/visual/runtime";
import { drawEye } from "../src/visual/render";

// render.ts uses Path2D purely as an opaque path handle passed straight
// back into ctx.fill/clip/stroke; the Node test environment has no Path2D, so a no-op
// stub is enough for the end-to-end viewport-fit check below. Guarded so a
// real Path2D (a different test environment, or a future jsdom release) is
// never overridden.
if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
  (globalThis as { Path2D?: unknown }).Path2D = class {
    moveTo() {}
    lineTo() {}
    quadraticCurveTo() {}
    closePath() {}
  };
}

const STANCES: Stance[] = ["attentive", "comforting", "shared_joy", "congratulatory", "supportive"];

function baseProps(overrides: Partial<EyeStageProps> = {}): EyeStageProps {
  return {
    state: "idle",
    stance: "attentive",
    intensity: 0.6,
    seed: 42,
    reducedMotion: false,
    active: true,
    ...overrides,
  };
}

function sampleProfile(composition: Composition, samples = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    out.push(silhouetteRadius(composition, theta));
  }
  return out;
}

function profileDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

function tickN(runtime: ReturnType<typeof createAnimationRuntime>, props: EyeStageProps, n: number, dt = 1 / 60) {
  for (let i = 0; i < n; i++) advanceRuntime(runtime, props, dt);
}

describe("grammar: determinism", () => {
  it("produces an identical composition for the same seed/stance/intensity", () => {
    const a = composeGrammar("comforting", 1234, 0.7);
    const b = composeGrammar("comforting", 1234, 0.7);
    expect(a.signature).toBe(b.signature);
    expect(a.coreRadius).toBe(b.coreRadius);
    expect(a.harmonics).toEqual(b.harmonics);
    expect(a.boxAnchors).toEqual(b.boxAnchors);
  });

  it("produces a different composition for a different seed", () => {
    const a = composeGrammar("comforting", 1, 0.7);
    const b = composeGrammar("comforting", 2, 0.7);
    expect(a.signature).not.toBe(b.signature);
  });
});

describe("grammar: bounded resources", () => {
  it.each(STANCES)("keeps %s within documented resource caps and finite ranges", (stance) => {
    const comp = composeGrammar(stance, 99, 0.8);
    expect(comp.harmonics.length).toBeLessThanOrEqual(HARMONIC_INDICES.length);
    expect(comp.layerCount).toBeLessThanOrEqual(MAX_LAYERS);
    expect(comp.boxAnchors.length).toBeLessThanOrEqual(MAX_BOXES);
    for (const h of comp.harmonics) {
      expect(Number.isFinite(h.amp)).toBe(true);
      expect(Number.isFinite(h.phase)).toBe(true);
      expect(h.amp).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isFinite(comp.coreRadius)).toBe(true);
    expect(Number.isFinite(comp.asymmetryMag)).toBe(true);
    expect(Number.isFinite(comp.verticalBias)).toBe(true);
    for (let i = 0; i < 32; i++) {
      const r = silhouetteRadius(comp, (i / 32) * Math.PI * 2);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });

  it("never produces zero visible amplitude even at intensity 0", () => {
    const comp = composeGrammar("shared_joy", 7, 0);
    const totalAmp = comp.harmonics.reduce((sum, h) => sum + h.amp, 0);
    expect(totalAmp).toBeGreaterThan(0);
  });
});

describe("grammar: distinct structural families", () => {
  it("gives each of the five stances a distinct silhouette profile from the same seed", () => {
    const compositions = STANCES.map((stance) => composeGrammar(stance, 555, 0.75));
    const profiles = compositions.map((c) => sampleProfile(c));
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        const distance = profileDistance(profiles[i], profiles[j]);
        expect(distance).toBeGreaterThan(0.01);
      }
    }
  });

  it("gives congratulatory a looser, fuller bloom than supportive (by extent, not just resting radius)", () => {
    const congrats = composeGrammar("congratulatory", 8, 0.9);
    const supportive = composeGrammar("supportive", 8, 0.9);
    // Resting coreRadius is deliberately modest for congratulatory --
    // viewport-fit budget is spent on the transient bloom overshoot, not a
    // permanently bigger disc (revision w3-20260927-01 follow-up). The
    // family still reads as "more" via overall extent (which folds in
    // bloomOvershoot), looser gathering and lower focus.
    expect(maxCompositionExtent(congrats)).toBeGreaterThan(maxCompositionExtent(supportive));
    expect(congrats.gathering).toBeLessThan(supportive.gathering);
    expect(congrats.focus).toBeLessThan(supportive.focus);
    expect(congrats.bloomOvershoot).toBeGreaterThan(supportive.bloomOvershoot);
  });

  it("uses an asymmetric bloom-then-settle timing only for congratulatory", () => {
    const envelope = STANCE_ENVELOPES.congratulatory;
    expect(envelope.attackSmoothTime).toBeLessThan(envelope.releaseSmoothTime);
    const attentive = STANCE_ENVELOPES.attentive;
    expect(attentive.attackSmoothTime).toBe(attentive.releaseSmoothTime);
  });
});

describe("grammar: fresh variation and bounded memory", () => {
  it("gives two consecutive compositions for the same stance+seed a different fresh signature when routed through memory", () => {
    const memory = createCompositionMemory(4);
    const first = composeFreshGrammar("congratulatory", 42, 0.8, memory);
    const second = composeFreshGrammar("congratulatory", 42, 0.8, memory);
    expect(second.signature).not.toBe(first.signature);
    // still recognizably the same family: same envelope-driven ordering property holds
    expect(second.stance).toBe("congratulatory");
  });

  it("does not reject a fresh seed that happens to differ from recent memory", () => {
    const memory = createCompositionMemory(2);
    const a = composeFreshGrammar("attentive", 1, 0.5, memory);
    const b = composeFreshGrammar("attentive", 2, 0.5, memory);
    expect(a.signature).not.toBe(b.signature);
  });

  it("keeps composition memory bounded to its configured size", () => {
    const memory = createCompositionMemory(2);
    memory.remember("a");
    memory.remember("b");
    memory.remember("c");
    expect(memory.has("a")).toBe(false);
    expect(memory.has("b")).toBe(true);
    expect(memory.has("c")).toBe(true);
  });
});

describe("turn-state helpers", () => {
  it("recurs boxes across idle/listening/processing/speaking, bounded by anchor count", () => {
    for (const state of ["idle", "listening", "processing", "speaking"] as const) {
      const count = boxCountForState(state, MAX_BOXES);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(MAX_BOXES);
    }
  });

  it("yields zero boxes immediately on interrupted and for unavailable", () => {
    expect(boxCountForState("interrupted", MAX_BOXES)).toBe(0);
    expect(boxCountForState("unavailable", MAX_BOXES)).toBe(0);
  });

  it("only produces fragmentation while processing", () => {
    expect(fragmentationTargetForState("processing", 0.8)).toBeGreaterThan(0);
    for (const state of ["idle", "listening", "speaking", "interrupted", "unavailable"] as const) {
      expect(fragmentationTargetForState(state, 0.8)).toBe(0);
    }
  });
});

describe("spring: retargeting without reset", () => {
  it("moves a kinematic toward its target over time", () => {
    let k = createKinematic(0, 0);
    for (let i = 0; i < 60; i++) {
      k = stepKinematic(k, 1, 0.3, 1 / 60);
    }
    expect(k.value).toBeGreaterThan(0.8);
  });

  it("carries velocity across a retarget instead of resetting it", () => {
    let k = createKinematic(0, 0);
    for (let i = 0; i < 20; i++) {
      k = stepKinematic(k, 1, 0.3, 1 / 60);
    }
    const velocityBeforeRetarget = k.velocity;
    expect(velocityBeforeRetarget).toBeGreaterThan(0);
    // Retarget mid-flight to a lower value; velocity should still reflect
    // the previous upward motion on the very next step rather than jumping
    // straight to zero, i.e. no clock/state reset happened.
    const next = stepKinematic(k, 0.2, 0.3, 1 / 60);
    expect(next.value).toBeGreaterThan(k.value - 0.05);
  });

  it("does not move when dt is 0 (a frozen frame stays frozen)", () => {
    const k = createKinematic(0.3, 0.5);
    const result = stepKinematic(k, 1, 0.3, 0);
    expect(result.value).toBe(0.3);
    expect(result.velocity).toBe(0.5);
  });

  it("snapKinematic jumps instantly with zero velocity (reduced motion)", () => {
    const snapped = snapKinematic(0.75);
    expect(snapped.value).toBe(0.75);
    expect(snapped.velocity).toBe(0);
  });

  it("smoothDamp never overshoots a simple monotonic approach", () => {
    let value = 0;
    let velocity = 0;
    let maxSeen = 0;
    for (let i = 0; i < 240; i++) {
      const result = smoothDamp(value, velocity, 1, 0.25, 1 / 60);
      value = result.value;
      velocity = result.velocity;
      maxSeen = Math.max(maxSeen, value);
    }
    expect(maxSeen).toBeLessThanOrEqual(1.001);
  });
});

describe("spring: angle wrap", () => {
  it("takes the shortest path across the wrap boundary", () => {
    const current = Math.PI - 0.05; // just under +180deg
    const target = -Math.PI + 0.05; // just over -180deg (nearly the same angle)
    const remapped = nearestEquivalentAngle(current, target);
    expect(Math.abs(remapped - current)).toBeLessThan(0.2);
  });
});

describe("runtime: bounded, retargeting animation state", () => {
  it("produces a finite, bounded frame after settling", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "listening" });
    tickN(runtime, props, 120);
    const frame = buildFrame(runtime, props);
    expect(frame.layers.length).toBeLessThanOrEqual(MAX_LAYERS);
    expect(frame.boxes.length).toBeLessThanOrEqual(MAX_BOXES);
    expect(Number.isFinite(frame.coreRadius)).toBe(true);
    for (let i = 0; i < 16; i++) {
      expect(Number.isFinite(frameSilhouetteRadius(frame, (i / 16) * Math.PI * 2))).toBe(true);
    }
  });

  it("hides processing trails immediately when playback or replacement listening begins", () => {
    const runtime = createAnimationRuntime();
    const processingProps = baseProps({ state: "processing", stance: "supportive" });
    tickN(runtime, processingProps, 90);
    expect(buildFrame(runtime, processingProps).fragmentation).toBeGreaterThan(0.1);
    for (const state of ['speaking', 'listening', 'interrupted', 'unavailable'] as const) {
      expect(buildFrame(runtime, { ...processingProps, state }).fragmentation).toBe(0);
    }
    // Geometry retains its own continuous spring state; only the processing overlay is suppressed.
    expect(runtime.fragmentation.value).toBeGreaterThan(0.1);
  });

  it("active=false stops boxes and fragmentation without discarding spring state", () => {
    const runtime = createAnimationRuntime();
    const processingProps = baseProps({ state: "processing" });
    tickN(runtime, processingProps, 90);
    expect(buildFrame(runtime, processingProps).boxes.length).toBeGreaterThan(0);

    const inactiveProps = baseProps({ state: "processing", active: false });
    advanceRuntime(runtime, inactiveProps, 1 / 60);
    const inactiveFrame = buildFrame(runtime, inactiveProps);
    expect(inactiveFrame.boxes.length).toBe(0);
    expect(inactiveFrame.fragmentation).toBe(0);

    // Underlying box opacity springs are still present (not reset) so
    // reactivating resumes rather than pops back in from nothing.
    expect(runtime.boxes.some((b) => b.opacity.value > 0.1)).toBe(true);
  });

  it("reducedMotion snaps to a static composition with no drift across ticks", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "speaking", stance: "shared_joy", reducedMotion: true });
    advanceRuntime(runtime, props, 1 / 60);
    const first = buildFrame(runtime, props);
    advanceRuntime(runtime, props, 1 / 60);
    const second = buildFrame(runtime, props);
    expect(second.coreRadius).toBe(first.coreRadius);
    expect(second.asymmetryAngle).toBe(first.asymmetryAngle);
    expect(second.timeSec).toBe(first.timeSec);
    expect(second.fragmentation).toBe(0);
  });

  it("retargets a running (non-reduced) animation on stance change without resetting the clock", () => {
    const runtime = createAnimationRuntime();
    const comfortingProps = baseProps({ state: "speaking", stance: "comforting" });
    tickN(runtime, comfortingProps, 30);
    const timeBeforeRetarget = runtime.timeSec;
    const coreBeforeRetarget = runtime.core.value;

    const joyProps = baseProps({ state: "speaking", stance: "shared_joy", seed: baseProps().seed + 1 });
    advanceRuntime(runtime, joyProps, 1 / 60);

    // The clock kept running (not reset to 0) ...
    expect(runtime.timeSec).toBeGreaterThan(timeBeforeRetarget);
    // ... and the very next frame's core radius starts from where it was,
    // not snapped straight to the new stance's target.
    const frameAfterOneTick = buildFrame(runtime, joyProps);
    expect(Math.abs(frameAfterOneTick.coreRadius - coreBeforeRetarget)).toBeLessThan(0.05);
  });

  it("interrupted state cuts fragmentation trails instantly (only processing ever produces them), but yields boxes with a short ease, not a pop", () => {
    const runtime = createAnimationRuntime();
    const processingProps = baseProps({ state: "processing", stance: "congratulatory" });
    tickN(runtime, processingProps, 90);
    const beforeFrame = buildFrame(runtime, processingProps);
    expect(beforeFrame.fragmentation).toBeGreaterThan(0.1);
    const boxOpacityBefore = runtime.boxes[0].opacity.value;
    expect(boxOpacityBefore).toBeGreaterThan(0.5);

    const interruptedProps = baseProps({ state: "interrupted", stance: "congratulatory" });
    advanceRuntime(runtime, interruptedProps, 1 / 60);
    const oneTickLater = buildFrame(runtime, interruptedProps);
    // Revision w3-20260927-01 follow-up: "Only processing generates trails;
    // suppress immediately interruption/end" -- fragmentation is a hard cut
    // to exactly 0 on the very first interrupted tick, not an ease-out.
    expect(oneTickLater.fragmentation).toBe(0);
    // Boxes still yield "with the eye" on a short ease rather than an
    // instant pop: still present right after interruption starts...
    expect(runtime.boxes[0].opacity.value).toBeGreaterThan(0.05);
    expect(runtime.boxes[0].opacity.value).toBeLessThan(boxOpacityBefore);

    tickN(runtime, interruptedProps, 30);
    const settled = buildFrame(runtime, interruptedProps);
    expect(settled.fragmentation).toBe(0);
    expect(settled.boxes.length).toBe(0);
  });

  it("End (active=false) cuts fragmentation instantly too", () => {
    const runtime = createAnimationRuntime();
    const processingProps = baseProps({ state: "processing", stance: "congratulatory" });
    tickN(runtime, processingProps, 90);
    expect(buildFrame(runtime, processingProps).fragmentation).toBeGreaterThan(0.1);

    const endedProps = baseProps({ state: "processing", stance: "congratulatory", active: false });
    advanceRuntime(runtime, endedProps, 1 / 60);
    expect(buildFrame(runtime, endedProps).fragmentation).toBe(0);
    expect(runtime.fragmentation.value).toBe(0);
  });
});

describe("viewport fit (revision w3-20260927-01 follow-up: silhouette clipping the stage)", () => {
  it("keeps every composition's aspect-adjusted worst-case extent within SAFE_RADIUS_FRACTION", () => {
    for (const stance of STANCES) {
      for (const seed of [1, 2, 3, 97, 12345]) {
        for (const intensity of [0, 0.5, 1]) {
          const comp = composeGrammar(stance, seed, intensity);
          const aspectExtent = maxCompositionExtent(comp) * EYE_ASPECT_X;
          expect(aspectExtent).toBeLessThanOrEqual(SAFE_RADIUS_FRACTION + 1e-6);
        }
      }
    }
  });

  it("keeps the four non-congratulatory families' typical draws unscaled (distinct sizes preserved)", () => {
    // Regression guard for the earlier bug where the safety clamp fired for
    // almost every draw, collapsing all five families to one identical
    // ceiling extent (revision w3-20260927-01 follow-up).
    const attentive = composeGrammar("attentive", 5, 0.6);
    const supportive = composeGrammar("supportive", 5, 0.6);
    expect(maxCompositionExtent(attentive)).not.toBeCloseTo(maxCompositionExtent(supportive), 4);
  });

  it("render.ts no longer draws its own invented silhouette; drawEye runs without throwing across all five stances", () => {
    // Historical note: this described block used to assert render.ts's own
    // (now removed) abstract silhouette stayed within a render-time pixel
    // cap. render.ts now composes the actual Week 1 source eye
    // (./week1-eye's rasterizeWeek1Eye) with a bounded coordinate warp
    // instead -- see digital-material.test.ts's warpPoint/drawEye describes
    // for that coverage. This is kept as a light smoke check that drawEye
    // still runs end to end for every stance without throwing.
    const WIDTH = 1400;
    const HEIGHT = 700;
    for (const stance of STANCES) {
      const runtime = createAnimationRuntime();
      const props = baseProps({ state: "speaking", stance, intensity: 1 });
      for (let i = 0; i < 30; i++) advanceRuntime(runtime, props, 1 / 60);
      const frame = buildFrame(runtime, props);
      const ctx = {
        save() {},
        restore() {},
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        clip() {},
        fill() {},
        stroke() {},
        strokeRect() {},
        drawImage() {},
        createRadialGradient() {
          return { addColorStop() {} };
        },
        set fillStyle(_v: unknown) {},
        set strokeStyle(_v: unknown) {},
        set lineWidth(_v: unknown) {},
        set globalCompositeOperation(_v: unknown) {},
      } as unknown as CanvasRenderingContext2D;
      expect(() => drawEye(ctx, WIDTH, HEIGHT, frame, { quiet: true, gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0 })).not.toThrow();
    }
  });
});

describe("bloom-then-settle envelope", () => {
  it("stays at 1 at turnAge=0, peaks exactly at overshoot at turnAge=attack, returns to 1 after attack+release", () => {
    const attack = 0.25;
    const release = 1.6;
    const overshoot = 0.28;
    expect(bloomMultiplier(0, attack, release, overshoot)).toBe(1);
    expect(bloomMultiplier(attack, attack, release, overshoot)).toBeCloseTo(1 + overshoot, 9);
    expect(bloomMultiplier(attack + release, attack, release, overshoot)).toBeCloseTo(1, 9);
    expect(bloomMultiplier(attack + release + 5, attack, release, overshoot)).toBe(1);
  });

  it("rises monotonically then falls monotonically (a real bloom, not a step)", () => {
    const attack = 0.25;
    const release = 1.6;
    const overshoot = 0.28;
    const early = bloomMultiplier(attack * 0.5, attack, release, overshoot);
    const peak = bloomMultiplier(attack, attack, release, overshoot);
    const late = bloomMultiplier(attack + release * 0.5, attack, release, overshoot);
    expect(early).toBeGreaterThan(1);
    expect(early).toBeLessThan(peak);
    expect(late).toBeLessThan(peak);
    expect(late).toBeGreaterThan(1);
  });

  it("is always exactly 1 when overshoot is 0", () => {
    for (const t of [0, 0.1, 0.5, 2, 10]) {
      expect(bloomMultiplier(t, 0.3, 1, 0)).toBe(1);
    }
  });
});

describe("palette blends rather than hard-cutting on a stance change", () => {
  it("moves palette weights gradually across a retarget", () => {
    const runtime = createAnimationRuntime();
    const attentiveProps = baseProps({ state: "speaking", stance: "attentive" });
    for (let i = 0; i < 120; i++) advanceRuntime(runtime, attentiveProps, 1 / 60);
    const before = buildFrame(runtime, attentiveProps).paletteWeights;

    const comfortingProps = baseProps({ state: "speaking", stance: "comforting" });
    advanceRuntime(runtime, comfortingProps, 1 / 60);
    const justAfter = buildFrame(runtime, comfortingProps).paletteWeights;
    const targetLavender = STANCE_ENVELOPES.comforting.paletteWeights.lavender;
    // One tick later it should have moved only slightly toward the target,
    // never jumped straight to it.
    expect(Math.abs(justAfter.lavender - before.lavender)).toBeLessThan(
      Math.abs(targetLavender - before.lavender) * 0.5
    );

    for (let i = 0; i < 300; i++) advanceRuntime(runtime, comfortingProps, 1 / 60);
    const settled = buildFrame(runtime, comfortingProps).paletteWeights;
    expect(settled.lavender).toBeCloseTo(targetLavender, 1);
  });
});

describe("fragmentation seed stability (no reseed flicker)", () => {
  it("keeps a stable fragmentSeed across ticks for an unchanged composition", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "processing", stance: "shared_joy" });
    const seeds = new Set<number>();
    for (let i = 0; i < 60; i++) {
      advanceRuntime(runtime, props, 1 / 60);
      seeds.add(buildFrame(runtime, props).fragmentSeed);
    }
    expect(seeds.size).toBe(1);
  });

  it("changes fragmentSeed when the composition genuinely changes", () => {
    const runtime = createAnimationRuntime();
    const propsA = baseProps({ state: "processing", stance: "shared_joy", seed: 1 });
    advanceRuntime(runtime, propsA, 1 / 60);
    const seedA = buildFrame(runtime, propsA).fragmentSeed;

    const propsB = baseProps({ state: "processing", stance: "shared_joy", seed: 2 });
    advanceRuntime(runtime, propsB, 1 / 60);
    const seedB = buildFrame(runtime, propsB).fragmentSeed;
    expect(seedA).not.toBe(seedB);
  });
});

describe("pre-activation and End freeze behavior", () => {
  it("renders the fixed neutral baseline immediately when active=false from the start (idle), not placeholder spring defaults", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "idle", stance: "attentive", intensity: 0.5, seed: 123, active: false });
    // Exactly what the static/frozen redraw effect does on mount: one call with dt=0.
    advanceRuntime(runtime, props, 0);
    // state='idle' -> energyTargetForState=0 -> snaps to NEUTRAL_COMPOSITION
    // (a fixed, always-the-same calm identity), not this particular random
    // 'attentive' composition's own coreRadius.
    expect(runtime.energy.value).toBe(0);
    expect(runtime.core.value).toBe(NEUTRAL_COMPOSITION.coreRadius);
    expect(runtime.gathering.value).toBe(NEUTRAL_COMPOSITION.gathering);
    const frame = buildFrame(runtime, props);
    expect(Number.isFinite(frame.coreRadius)).toBe(true);
    expect(frame.coreRadius).toBeGreaterThan(0.05);
  });

  it("End (active=false) with an unchanged composition freezes the exact current shape rather than snapping to target", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "speaking", stance: "comforting", active: true });
    for (let i = 0; i < 8; i++) advanceRuntime(runtime, props, 1 / 60); // deliberately not converged
    const midFlightCore = runtime.core.value;
    expect(midFlightCore).not.toBe(runtime.composition.coreRadius);

    const endedProps = baseProps({ state: "speaking", stance: "comforting", active: false });
    advanceRuntime(runtime, endedProps, 0); // static redraw path, composition unchanged
    expect(runtime.core.value).toBe(midFlightCore);
  });
});

describe("expressive energy releases toward neutral between turns (owner steering, 2026-09-27)", () => {
  it("is 1 only while speaking, 0 for every other turn state, and never depends on stance", () => {
    expect(energyTargetForState("speaking")).toBe(1);
    for (const state of ["idle", "listening", "processing", "interrupted", "unavailable"] as const) {
      expect(energyTargetForState(state)).toBe(0);
    }
  });

  it("releases a stale stance toward the neutral baseline during listening after a turn ends, instead of endlessly celebrating", () => {
    const runtime = createAnimationRuntime();
    const speakingProps = baseProps({ state: "speaking", stance: "congratulatory", intensity: 1, seed: 77 });
    tickN(runtime, speakingProps, 200); // full bloom settles in
    const excitedFrame = buildFrame(runtime, speakingProps);
    expect(Math.abs(excitedFrame.coreRadius - NEUTRAL_COMPOSITION.coreRadius)).toBeGreaterThan(0.02);

    // Backend leaves `stance` set to the last confirmed reply; only `state`
    // moves back to listening for the next turn -- the property contract
    // (EyeStageProps/Stance) is unchanged, this is purely a local release.
    const listeningProps = baseProps({ state: "listening", stance: "congratulatory", intensity: 1, seed: 77 });
    tickN(runtime, listeningProps, 150); // ~2.5s, comfortably past the release window
    const releasedFrame = buildFrame(runtime, listeningProps);
    expect(releasedFrame.coreRadius).toBeCloseTo(NEUTRAL_COMPOSITION.coreRadius, 1);
  });

  it("releases most of the way within about 1-2 seconds of returning to listening", () => {
    const runtime = createAnimationRuntime();
    const speakingProps = baseProps({ state: "speaking", stance: "congratulatory", intensity: 1 });
    tickN(runtime, speakingProps, 200);
    expect(runtime.energy.value).toBeGreaterThan(0.9);

    const listeningProps = baseProps({ state: "listening", stance: "congratulatory", intensity: 1 });
    tickN(runtime, listeningProps, 120); // 2s
    expect(runtime.energy.value).toBeLessThan(0.15);
  });

  it("releases energy faster on interruption than on a normal return to listening", () => {
    const runtimeA = createAnimationRuntime();
    const speakingA = baseProps({ state: "speaking", stance: "congratulatory", intensity: 1 });
    tickN(runtimeA, speakingA, 200);
    const interruptedProps = baseProps({ state: "interrupted", stance: "congratulatory", intensity: 1 });
    tickN(runtimeA, interruptedProps, 12); // 0.2s

    const runtimeB = createAnimationRuntime();
    const speakingB = baseProps({ state: "speaking", stance: "congratulatory", intensity: 1 });
    tickN(runtimeB, speakingB, 200);
    const listeningProps = baseProps({ state: "listening", stance: "congratulatory", intensity: 1 });
    tickN(runtimeB, listeningProps, 12); // 0.2s

    expect(runtimeA.energy.value).toBeLessThan(runtimeB.energy.value);
  });
});

describe("continuous idle motion (breathing/buoyancy)", () => {
  it("keeps full-motion frames subtly alive after springs settle; reducedMotion stays exactly static", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "idle", stance: "shared_joy" });
    for (let i = 0; i < 400; i++) advanceRuntime(runtime, props, 1 / 60); // let springs fully settle
    const frameA = buildFrame(runtime, props);
    advanceRuntime(runtime, props, 1 / 60);
    const frameB = buildFrame(runtime, props);
    expect(frameA.coreRadius).not.toBe(frameB.coreRadius);

    const reducedRuntime = createAnimationRuntime();
    const reducedProps = baseProps({ state: "idle", stance: "shared_joy", reducedMotion: true });
    advanceRuntime(reducedRuntime, reducedProps, 1 / 60);
    const r1 = buildFrame(reducedRuntime, reducedProps);
    advanceRuntime(reducedRuntime, reducedProps, 1 / 60);
    const r2 = buildFrame(reducedRuntime, reducedProps);
    expect(r1.coreRadius).toBe(r2.coreRadius);
  });

  it("freezes breathing when active=false (timeSec stops advancing)", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "idle", stance: "shared_joy", active: false });
    advanceRuntime(runtime, props, 1 / 60);
    const frameA = buildFrame(runtime, props);
    advanceRuntime(runtime, props, 1 / 60);
    const frameB = buildFrame(runtime, props);
    expect(frameA.coreRadius).toBe(frameB.coreRadius);
  });
});

describe("grammar: warp channels give each stance a distinct form (owner clarification, 2026-09-27)", () => {
  it("keeps attentive's channels all near 0 -- the stable, unwarped source eye", () => {
    const comp = composeGrammar("attentive", 5, 0.8);
    expect(Math.abs(comp.warp.fold)).toBeLessThan(0.05);
    expect(Math.abs(comp.warp.lift)).toBeLessThan(0.05);
    expect(Math.abs(comp.warp.bloom)).toBeLessThan(0.05);
    expect(Math.abs(comp.warp.fan)).toBeLessThan(0.05);
  });

  it("gives each of the other four stances exactly one dominant channel", () => {
    const dominantChannel: Record<string, keyof typeof comfortComp.warp> = {
      comforting: "fold",
      shared_joy: "lift",
      congratulatory: "bloom",
      supportive: "fan",
    };
    var comfortComp = composeGrammar("comforting", 9, 0.8); // hoisted for the type reference above
    for (const stance of ["comforting", "shared_joy", "congratulatory", "supportive"] as const) {
      const comp = composeGrammar(stance, 9, 0.8);
      const dominant = dominantChannel[stance];
      expect(comp.warp[dominant]).toBeGreaterThan(0.25);
      for (const key of ["fold", "lift", "bloom", "fan"] as const) {
        if (key === dominant) continue;
        expect(comp.warp[key]).toBeLessThan(comp.warp[dominant]);
      }
    }
  });

  it("keeps NEUTRAL_COMPOSITION's channels near 0, matching attentive's resting form", () => {
    expect(Math.abs(NEUTRAL_COMPOSITION.warp.fold)).toBeLessThan(0.05);
    expect(Math.abs(NEUTRAL_COMPOSITION.warp.lift)).toBeLessThan(0.05);
    expect(Math.abs(NEUTRAL_COMPOSITION.warp.bloom)).toBeLessThan(0.05);
    expect(Math.abs(NEUTRAL_COMPOSITION.warp.fan)).toBeLessThan(0.05);
  });

  it("gives attentive the same broadened-phosphor target as the source red (no broadening needed at rest)", () => {
    expect(STANCE_ENVELOPES.attentive.broadenedPhosphor).toEqual(SOURCE_RED);
  });
});

describe("runtime: warp channels and phosphor color follow the same energy-driven release as everything else", () => {
  it("relaxes a stale stance's dominant warp channel back toward neutral during listening, instead of staying folded/lifted/bloomed/fanned forever", () => {
    const runtime = createAnimationRuntime();
    const speakingProps = baseProps({ state: "speaking", stance: "comforting", intensity: 1 });
    for (let i = 0; i < 200; i++) advanceRuntime(runtime, speakingProps, 1 / 60);
    const speakingFrame = buildFrame(runtime, speakingProps);
    expect(speakingFrame.warp.fold).toBeGreaterThan(0.3);

    // warp.fold has its own spring lag (comforting's releaseSmoothTime,
    // 1.3s) *on top of* energy's own release, since its target is itself a
    // function of the decaying energy -- so it settles slower than energy
    // alone; give it comfortably more time than the energy-only release
    // window before asserting it has relaxed.
    const listeningProps = baseProps({ state: "listening", stance: "comforting", intensity: 1 });
    for (let i = 0; i < 500; i++) advanceRuntime(runtime, listeningProps, 1 / 60);
    const listeningFrame = buildFrame(runtime, listeningProps);
    expect(listeningFrame.warp.fold).toBeLessThan(0.05);
  });

  it("keeps phosphor at the source red while idle/listening, and broadens it only as energy rises during speaking", () => {
    const runtime = createAnimationRuntime();
    const idleProps = baseProps({ state: "idle", stance: "congratulatory", intensity: 1 });
    advanceRuntime(runtime, idleProps, 0); // pre-activation-style snap
    const idleFrame = buildFrame(runtime, idleProps);
    expect(idleFrame.phosphor[0]).toBeCloseTo(SOURCE_RED[0], 5);
    expect(idleFrame.phosphor[1]).toBeCloseTo(SOURCE_RED[1], 5);
    expect(idleFrame.phosphor[2]).toBeCloseTo(SOURCE_RED[2], 5);

    const speakingProps = baseProps({ state: "speaking", stance: "congratulatory", intensity: 1 });
    for (let i = 0; i < 200; i++) advanceRuntime(runtime, speakingProps, 1 / 60);
    const speakingFrame = buildFrame(runtime, speakingProps);
    const distanceFromRed = Math.hypot(
      speakingFrame.phosphor[0] - SOURCE_RED[0],
      speakingFrame.phosphor[1] - SOURCE_RED[1],
      speakingFrame.phosphor[2] - SOURCE_RED[2]
    );
    expect(distanceFromRed).toBeGreaterThan(0.05);
  });
});
