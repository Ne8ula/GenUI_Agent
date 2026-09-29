import { describe, expect, it } from "vitest";
import { advanceRuntime, buildFrame, createAnimationRuntime, type EyeStageProps } from "../src/visual/runtime";
import { createGlitchState, glitchEnvelope, MAX_GLITCH_BOXES, stepGlitches, transitionActivity } from "../src/visual/glitch";

function run(energyAt: (t: number) => number, handoverAt: (t: number) => number, seconds: number, enabled = true) {
  const state = createGlitchState();
  let maxActive = 0;
  const ids = new Set<number>();
  for (let i = 0; i <= seconds * 45; i++) {
    const t = 10 + i / 45;
    const events = stepGlitches(state, t, energyAt(t), handoverAt(t), 1234, enabled);
    maxActive = Math.max(maxActive, events.length);
    for (const event of events) ids.add(event.id);
  }
  return { maxActive, total: ids.size };
}

describe("transition glitches (pass p3)", () => {
  it("never appear while settled", () => {
    expect(transitionActivity(0, 1)).toBe(0);
    expect(run(() => 0, () => 1, 6).total).toBe(0);
    expect(run(() => 0.9, () => 1, 6).total).toBe(0);
  });

  it("appear only a few at a time during an energy transition", () => {
    const rising = (t: number) => Math.min(1, Math.max(0, (t - 10) / 1.5));
    const result = run(rising, () => 1, 4);
    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeLessThanOrEqual(8);
    expect(result.maxActive).toBeLessThanOrEqual(MAX_GLITCH_BOXES);
  });

  it("appear during a composition handover", () => {
    const handover = (t: number) => Math.min(1, (t - 10) / 1.2);
    expect(run(() => 0.9, handover, 3).total).toBeGreaterThan(0);
  });

  it("are suppressed when disabled (reduced motion) or when the clock does not advance (End)", () => {
    const rising = (t: number) => Math.min(1, Math.max(0, (t - 10) / 1.5));
    expect(run(rising, () => 1, 4, false).total).toBe(0);
    const state = createGlitchState();
    for (let i = 0; i < 30; i++) stepGlitches(state, 10 + i / 45, i / 30, 1, 5, true);
    expect(stepGlitches(state, 10 + 29 / 45, 0.95, 1, 5, true)).toHaveLength(0);
  });

  it("each event is brief and follows line -> box -> fade", () => {
    const state = createGlitchState();
    let event;
    for (let i = 0; !event && i < 200; i++) event = stepGlitches(state, 10 + i / 45, i / 60, 1, 9, true)[0];
    expect(event).toBeDefined();
    expect(event!.duration).toBeGreaterThanOrEqual(0.2);
    expect(event!.duration).toBeLessThanOrEqual(0.5);
    const at = (f: number) => glitchEnvelope(event!, event!.start + event!.duration * f);
    expect(at(0.05).grow).toBeLessThan(0.4);
    expect(at(0.5).grow).toBe(1);
    expect(at(0.5).alpha).toBe(1);
    expect(at(1).alpha).toBeCloseTo(0, 6);
  });

  it("with the real runtime: none while settled, a few across a listening -> speaking -> listening turn", () => {
    const runtime = createAnimationRuntime();
    const state = createGlitchState();
    const base: EyeStageProps = { state: "listening", stance: "comforting", intensity: 0.8, seed: 7, reducedMotion: false, active: true };
    const counts: Record<string, Set<number>> = {};
    const phases: Array<[string, EyeStageProps["state"], number]> = [["settle", "listening", 4], ["idle", "listening", 4], ["speak", "speaking", 4], ["back", "listening", 4]];
    for (const [name, turn, seconds] of phases) {
      counts[name] = new Set();
      for (let i = 0; i < seconds * 45; i++) {
        advanceRuntime(runtime, { ...base, state: turn }, 1 / 45);
        const frame = buildFrame(runtime, { ...base, state: turn });
        for (const event of stepGlitches(state, frame.timeSec, frame.energy, 1, frame.fragmentSeed, true)) counts[name].add(event.id);
      }
    }
    expect(counts.idle.size).toBe(0);
    expect(counts.speak.size).toBeGreaterThan(0);
    expect(counts.speak.size).toBeLessThanOrEqual(8);
    expect(counts.back.size).toBeGreaterThan(0);
    expect(counts.back.size).toBeLessThanOrEqual(8);
  });
});
