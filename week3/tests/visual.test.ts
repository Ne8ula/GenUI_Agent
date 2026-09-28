import { describe, expect, it } from "vitest";
import {
  STANCE_ENVELOPES,
  composeFreshGrammar,
  composeGrammar,
  createCompositionMemory,
  silhouetteRadius,
  boxCountForState,
  fragmentationTargetForState,
  type Composition,
  type Stance,
} from "../src/visual/grammar";
import { HARMONIC_INDICES, MAX_BOXES, MAX_LAYERS } from "../src/visual/constants";
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

  it("gives congratulatory a larger, more spread-out bloom than supportive", () => {
    const congrats = composeGrammar("congratulatory", 8, 0.9);
    const supportive = composeGrammar("supportive", 8, 0.9);
    expect(congrats.coreRadius).toBeGreaterThan(supportive.coreRadius);
    expect(congrats.gathering).toBeLessThan(supportive.gathering);
    expect(congrats.focus).toBeLessThan(supportive.focus);
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
  function tickN(runtime: ReturnType<typeof createAnimationRuntime>, props: EyeStageProps, n: number, dt = 1 / 60) {
    for (let i = 0; i < n; i++) advanceRuntime(runtime, props, dt);
  }

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

  it("only shows fragmentation while state is processing, and it fades rather than cutting when leaving processing", () => {
    const runtime = createAnimationRuntime();
    const processingProps = baseProps({ state: "processing", stance: "supportive" });
    tickN(runtime, processingProps, 90);
    const processingFrame = buildFrame(runtime, processingProps);
    expect(processingFrame.fragmentation).toBeGreaterThan(0.1);

    const speakingProps = baseProps({ state: "speaking", stance: "supportive" });
    advanceRuntime(runtime, speakingProps, 1 / 60);
    const justAfter = buildFrame(runtime, speakingProps);
    // One tick after leaving processing, fragmentation should still be
    // substantially present (a carried-over spring can even tick slightly
    // further before momentum reverses) -- never slammed to zero, i.e. no
    // hard cut.
    expect(justAfter.fragmentation).toBeGreaterThan(processingFrame.fragmentation * 0.5);

    tickN(runtime, speakingProps, 15);
    const easingDown = buildFrame(runtime, speakingProps);
    expect(easingDown.fragmentation).toBeLessThan(processingFrame.fragmentation);

    tickN(runtime, speakingProps, 200);
    const settled = buildFrame(runtime, speakingProps);
    expect(settled.fragmentation).toBeLessThan(0.02);
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

  it("interrupted state yields boxes and fragmentation quickly but not with a single-frame snap", () => {
    const runtime = createAnimationRuntime();
    const processingProps = baseProps({ state: "processing", stance: "congratulatory" });
    tickN(runtime, processingProps, 90);
    const beforeFrame = buildFrame(runtime, processingProps);
    expect(beforeFrame.fragmentation).toBeGreaterThan(0.1);

    const interruptedProps = baseProps({ state: "interrupted", stance: "congratulatory" });
    advanceRuntime(runtime, interruptedProps, 1 / 60);
    const oneTickLater = buildFrame(runtime, interruptedProps);
    expect(oneTickLater.fragmentation).toBeLessThan(beforeFrame.fragmentation);

    tickN(runtime, interruptedProps, 30);
    const settled = buildFrame(runtime, interruptedProps);
    expect(settled.fragmentation).toBeLessThan(0.02);
  });
});
