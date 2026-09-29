import { describe, expect, it } from "vitest";
import { advanceRuntime, buildFrame, createAnimationRuntime, type EyeStageProps } from "../src/visual/runtime";
import { formationStrength, formationTarget, formationVariation, formationWeights, releaseDelay, releaseProgress, type ParticlePoint } from "../src/visual/particles";
import type { Stance } from "../src/visual/grammar";

const settle = (stance: Stance, state: EyeStageProps["state"] = "speaking") => {
  const runtime = createAnimationRuntime();
  const props: EyeStageProps = { state, stance, intensity: 0.65, seed: 42, reducedMotion: false, active: true };
  for (let i = 0; i < 400; i++) advanceRuntime(runtime, props, 1 / 45);
  return buildFrame(runtime, props);
};

describe("particle formations (w3-cloud-20260928-a-p1)", () => {
  it("keeps the attentive eye as the eye: no formation even while speaking", () => {
    for (const seed of [1, 42, 99]) {
      const runtime = createAnimationRuntime();
      const props: EyeStageProps = { state: "speaking", stance: "attentive", intensity: 1, seed, reducedMotion: false, active: true };
      for (let i = 0; i < 400; i++) advanceRuntime(runtime, props, 1 / 45);
      expect(formationStrength(buildFrame(runtime, props).warp)).toBe(0);
    }
  });

  it("fully expresses each expressive stance while speaking and releases it while listening", () => {
    const expected: Record<Exclude<Stance, "attentive">, keyof ReturnType<typeof formationWeights>> = {
      comforting: "comfort",
      shared_joy: "joy",
      congratulatory: "congratulation",
      supportive: "supportive",
    };
    for (const [stance, key] of Object.entries(expected) as Array<[Exclude<Stance, "attentive">, keyof ReturnType<typeof formationWeights>]>) {
      const speaking = settle(stance);
      expect(formationStrength(speaking.warp)).toBeGreaterThan(0.9);
      expect(formationWeights(speaking.warp)[key]).toBeGreaterThan(0.9);
      expect(formationStrength(settle(stance, "listening").warp)).toBe(0);
    }
  });

  it("releases the upper lid before the pupil, so the eye re-forms from the pupil outward", () => {
    const upperLid = releaseDelay(-0.3, 0.5, 0.5);
    const pupil = releaseDelay(0.05, 0.02, 0.5);
    expect(upperLid).toBeLessThan(pupil);
    const midEnergy = 0.5;
    expect(releaseProgress(midEnergy, upperLid)).toBeGreaterThan(releaseProgress(midEnergy, pupil));
    expect(releaseProgress(1, pupil)).toBe(1);
    expect(releaseProgress(0, upperLid)).toBe(0);
  });

  it("produces finite, bounded, structurally different targets for the four formations", () => {
    const point: ParticlePoint = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0 };
    const spreads: number[] = [];
    // Pin the wide "low double wave" comfort archetype and the slim helix archetype;
    // pass 2 also adds a compact inward curl and a thick, wide-crested helix.
    let slim = formationVariation(1);
    for (let seed = 1; slim.helixVariant !== 0; seed++) slim = formationVariation(seed);
    const variation = { ...slim, comfortVariant: 1 };
    for (const key of ["comfort", "joy", "congratulation", "supportive"] as const) {
      const weights = { comfort: 0, joy: 0, congratulation: 0, supportive: 0, [key]: 1 };
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < 2000; i++) {
        expect(formationTarget(i, weights, 3.2, point, variation)).toBe(true);
        for (const v of Object.values(point)) expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(point.x)).toBeLessThan(4);
        expect(Math.abs(point.y)).toBeLessThan(4);
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      }
      spreads.push((maxX - minX) / (maxY - minY));
    }
    // Aspect ratios differ: a wide drape, a wide burst, a tall helix, a fan.
    const helix = spreads[2];
    expect(helix).toBeLessThan(0.8);
    expect(spreads[0]).toBeGreaterThan(1.5);
    expect(formationTarget(0, { comfort: 0, joy: 0, congratulation: 0, supportive: 0 }, 0, point)).toBe(false);
  });
});

describe("seeded formation variation (w3-cloud-20260928-a-p2)", () => {
  const spread = (seed: number, key: "comfort" | "joy" | "congratulation" | "supportive") => spreadWith(formationVariation(seed), key);
  const spreadWith = (variation: ReturnType<typeof formationVariation>, key: "comfort" | "joy" | "congratulation" | "supportive") => {
    const weights = { comfort: 0, joy: 0, congratulation: 0, supportive: 0, [key]: 1 };
    const point: ParticlePoint = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0 };
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      formationTarget(i, weights, 2, point, variation);
      sx += point.x; sy += point.y; sxx += point.x * point.x; syy += point.y * point.y; sxy += point.x * point.y;
    }
    const mx = sx / n, my = sy / n;
    // Centre, extent and x/y covariance (orientation/lean).
    return [mx, my, Math.sqrt(sxx / n - mx * mx), Math.sqrt(syy / n - my * my), sxy / n - mx * my];
  };

  it("is deterministic per seed", () => {
    expect(formationVariation(1234)).toEqual(formationVariation(1234));
    expect(spread(77, "supportive")).toEqual(spread(77, "supportive"));
  });

  it("gives the three archetypes of every family measurably different shapes", () => {
    const base = formationVariation(4242);
    const archetypes = {
      comfort: [0, 1, 2].map(k => ({ ...base, comfortVariant: k })),
      joy: [0, 1, 2].map(k => ({ ...base, joyVariant: k })),
      congratulation: [0, 1, 2].map(k => ({ ...formationVariation(4242 + k), helixVariant: k })).map((_, k) => {
        // Rebuild through the seeded constructor so each archetype carries its own parameters.
        for (let seed = 1; seed < 500; seed++) { const v = formationVariation(seed); if (v.helixVariant === k) return v; }
        throw new Error("archetype not reachable");
      }),
      supportive: [0, 1, 2].map(k => {
        for (let seed = 1; seed < 500; seed++) { const v = formationVariation(seed); if (v.supportVariant === k) return v; }
        throw new Error("archetype not reachable");
      }),
    };
    for (const key of ["comfort", "joy", "congratulation", "supportive"] as const) {
      const shapes = archetypes[key].map(variation => spreadWith(variation, key));
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const difference = Math.max(...shapes[i].map((v, k) => Math.abs(v - shapes[j][k])));
          expect(difference, `${key} archetypes ${i}/${j}`).toBeGreaterThan(0.03);
        }
      }
    }
  });

  it("never repeats either of the previous two compositions' archetypes for any family", () => {
    let beforePrevious = formationVariation(1);
    let previous = formationVariation(2, beforePrevious);
    for (let seed = 3; seed < 300; seed++) {
      const next = formationVariation(seed * 104729, previous, beforePrevious);
      for (const key of ["comfortVariant", "helixVariant", "supportVariant", "joyVariant"] as const) {
        expect(next[key]).not.toBe(previous[key]);
        expect(next[key]).not.toBe(beforePrevious[key]);
      }
      beforePrevious = previous;
      previous = next;
    }
  });

  it("covers every archetype across seeds", () => {
    const comfort = new Set<number>(), joy = new Set<number>(), strands = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const v = formationVariation(seed * 7919);
      comfort.add(v.comfortVariant); joy.add(v.joyVariant); strands.add(v.helixVariant);
      expect(v.supportLanes).toBeGreaterThanOrEqual(6);
      expect(v.supportLanes).toBeLessThanOrEqual(12);
    }
    expect(comfort.size).toBe(3);
    expect(joy.size).toBe(3);
    expect(strands.size).toBe(3);
  });
});
