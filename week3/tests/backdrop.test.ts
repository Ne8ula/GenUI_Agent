import { describe, expect, it } from "vitest";
import { compositePixel, INK_TINTS, inkTint, inkWeight, lumaAt, smoothLuma, type LumaGrid } from "../src/visual/backdrop";
import { advanceRuntime, buildFrame, createAnimationRuntime, type EyeStageProps } from "../src/visual/runtime";
import { drawEye } from "../src/visual/render";

const px = () => new Uint8ClampedArray(4);
const scratch = (): [number, number, number] => [0, 0, 0];

describe("floating-agent compositing (batch w3-cloud-20260929-b p1)", () => {
  it("leaves empty space fully transparent over any backdrop: no plate, no rectangle", () => {
    for (const ink of [0, 0.5, 1]) {
      const out = px();
      compositePixel(0, 0, 0, ink, INK_TINTS.rest, out, 0, scratch());
      expect(out[3]).toBe(0);
    }
  });

  it("over dark it is pure light: full-strength hue with alpha = brightness, never a dark or muddy pixel", () => {
    const out = px();
    compositePixel(0.3, 0.05, 0.04, 0, INK_TINTS.rest, out, 0, scratch());
    expect(Math.max(out[0], out[1], out[2])).toBe(255);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[3]).toBeLessThan(255);
  });

  it("over white the same particle becomes darker pigment with at least the light's coverage", () => {
    const light = px();
    const ink = px();
    compositePixel(0.3, 0.05, 0.04, 0, INK_TINTS.rest, light, 0, scratch());
    compositePixel(0.3, 0.05, 0.04, 1, INK_TINTS.rest, ink, 0, scratch());
    expect(ink[0] + ink[1] + ink[2]).toBeLessThan((light[0] + light[1] + light[2]) * 0.6);
    expect(ink[3]).toBeGreaterThanOrEqual(light[3]);
    // Still red, not grey.
    expect(ink[0]).toBeGreaterThan(ink[1] * 3);
  });

  it("pale (pearl/white) particles take their family's pigment instead of turning grey", () => {
    const out = px();
    compositePixel(0.4, 0.4, 0.38, 1, INK_TINTS.supportive, out, 0, scratch());
    expect(out[2]).toBeGreaterThan(out[0] * 1.6); // indigo, not grey
  });

  it("blends continuously between light and ink rather than switching", () => {
    const alphas = [0, 0.25, 0.5, 0.75, 1].map((ink) => { const o = px(); compositePixel(0.2, 0.18, 0.3, ink, INK_TINTS.supportive, o, 0, scratch()); return o[0] + o[1] + o[2]; });
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeLessThanOrEqual(alphas[i - 1] + 1);
  });

  it("maps backdrop luminance to ink weight: dark stays light, bright becomes ink, mid-grey is partial", () => {
    expect(inkWeight(0.05)).toBe(0);
    expect(inkWeight(0.95)).toBe(1);
    expect(inkWeight(0.52)).toBeGreaterThan(0.2);
    expect(inkWeight(0.52)).toBeLessThan(0.8);
  });

  it("reads the luminance grid bilinearly and treats an unknown backdrop as dark", () => {
    const grid: LumaGrid = { cols: 2, rows: 1, data: Float32Array.of(1, 0) };
    expect(lumaAt(grid, 0, 0.5)).toBeCloseTo(1, 5);
    expect(lumaAt(grid, 1, 0.5)).toBeCloseTo(0, 5);
    expect(lumaAt(grid, 0.5, 0.5)).toBeCloseTo(0.5, 5);
    expect(lumaAt(null, 0.3, 0.3)).toBe(0);
  });

  it("follows a backdrop change over ~0.6 s instead of flickering, and adopts it at once for static draws", () => {
    const dark: LumaGrid = { cols: 1, rows: 1, data: Float32Array.of(0) };
    const white: LumaGrid = { cols: 1, rows: 1, data: Float32Array.of(1) };
    let current = smoothLuma(null, dark, 1 / 45);
    current = smoothLuma(current, white, 1 / 45);
    expect(current!.data[0]).toBeGreaterThan(0);
    expect(current!.data[0]).toBeLessThan(0.2);
    for (let i = 0; i < 27; i++) current = smoothLuma(current, white, 1 / 45);
    expect(current!.data[0]).toBeGreaterThan(0.9);
    expect(smoothLuma(smoothLuma(null, dark, 0), white, 0)!.data[0]).toBe(1);
  });

  it("gives each family its own pigment tint", () => {
    const zero = { comfort: 0, joy: 0, congratulation: 0, supportive: 0 };
    expect(inkTint(zero, 0)).toEqual([...INK_TINTS.rest]);
    expect(inkTint({ ...zero, supportive: 1 }, 1)).toEqual([...INK_TINTS.supportive]);
  });
});

function recordingContext() {
  const fills: Array<{ style: string; w: number; h: number }> = [];
  let fillStyle = "";
  const ctx = {
    save() {}, restore() {}, clearRect() {},
    fillRect(_x: number, _y: number, w: number, h: number) { fills.push({ style: fillStyle, w, h }); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, fill() {}, stroke() {}, strokeRect() {}, drawImage() {},
    createRadialGradient() { return { addColorStop() {} }; },
    set fillStyle(v: string) { fillStyle = String(v); }, get fillStyle() { return fillStyle; },
    set strokeStyle(_v: unknown) {}, set lineWidth(_v: unknown) {}, set globalCompositeOperation(_v: unknown) {}, set globalAlpha(_v: unknown) {}, set imageSmoothingEnabled(_v: unknown) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fills };
}

describe("no stage and no dark glitch backing", () => {
  it("never paints the charcoal stage or a charcoal box, through a state transition with glitches", () => {
    const { ctx, fills } = recordingContext();
    const runtime = createAnimationRuntime();
    const base: EyeStageProps = { state: "listening", stance: "comforting", intensity: 0.65, seed: 42, reducedMotion: false, active: true };
    const white: LumaGrid = { cols: 1, rows: 1, data: Float32Array.of(1) };
    for (let i = 0; i < 180; i++) {
      const props = i < 30 ? base : { ...base, state: "speaking" as const };
      advanceRuntime(runtime, props, 1 / 45);
      drawEye(ctx, 1400, 700, buildFrame(runtime, props), { quiet: false, gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0 }, i % 2 ? white : null);
    }
    // The transition did draw glitch stripes/trails (so the checks below are not vacuous).
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.some((f) => f.w >= 1400 && f.h >= 700)).toBe(false);
    expect(fills.some((f) => /17,\s*19,\s*22/.test(f.style))).toBe(false);
  });
});
