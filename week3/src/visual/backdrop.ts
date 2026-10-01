/**
 * Floating-agent compositing (batch w3-cloud-20260929-b, pass p1).
 *
 * EVA has no stage: the canvas is transparent and the desktop shows through.
 * Each particle's material follows what is directly behind it (owner, p1
 * round 2): over dark areas it is emitted light, over bright areas it is
 * deep pigment ("ink") that darkens what is behind it. One form, one motion;
 * only the material changes, per pixel.
 *
 * The renderer only ever receives a coarse luminance grid of the area behind
 * its canvas. In the browser fixture that grid comes from a synthetic test
 * backdrop; natively (pass p2) it will come from a local, low-rate Rust
 * sample that never stores or sends pixels.
 */

/** Coarse 0..1 luminance (0 = black, 1 = white) covering the canvas, row-major. */
export interface LumaGrid {
  cols: number;
  rows: number;
  data: Float32Array;
}

/** Supplies the luminance behind a viewport-space rectangle, or null when unknown. */
export interface BackdropSampler {
  sample(rect: { left: number; top: number; width: number; height: number }): LumaGrid | null;
}

export type Rgb = readonly [number, number, number];

/** Seconds for a particle's material to follow a change behind it (no flicker when windows move). */
export const BACKDROP_BLEND_SECONDS = 0.6;
/** Native/fixture sampling cadence; the grid is smoothed every frame in between. */
export const BACKDROP_SAMPLE_INTERVAL_MS = 500;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Bilinear luminance at normalized canvas coordinates (u, v in 0..1). Unknown backdrop reads as dark. */
export function lumaAt(grid: LumaGrid | null | undefined, u: number, v: number): number {
  if (!grid || grid.cols < 1 || grid.rows < 1) return 0;
  const fx = clamp01(u) * grid.cols - 0.5;
  const fy = clamp01(v) * grid.rows - 0.5;
  const x0 = Math.max(0, Math.min(grid.cols - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(grid.rows - 1, Math.floor(fy)));
  const x1 = Math.min(grid.cols - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const tx = clamp01(fx - x0);
  const ty = clamp01(fy - y0);
  const d = grid.data;
  const top = d[y0 * grid.cols + x0] * (1 - tx) + d[y0 * grid.cols + x1] * tx;
  const bottom = d[y1 * grid.cols + x0] * (1 - tx) + d[y1 * grid.cols + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Move `current` toward `target` over BACKDROP_BLEND_SECONDS. Returns the
 * grid to draw with; a shape change or a static draw (dt = 0) adopts the
 * target directly.
 */
export function smoothLuma(current: LumaGrid | null, target: LumaGrid | null, dt: number): LumaGrid | null {
  if (!target) return current;
  if (!current || current.cols !== target.cols || current.rows !== target.rows || !(dt > 0)) {
    return { cols: target.cols, rows: target.rows, data: Float32Array.from(target.data) };
  }
  const k = 1 - Math.exp(-dt / (BACKDROP_BLEND_SECONDS / 3));
  for (let i = 0; i < current.data.length; i++) current.data[i] += (target.data[i] - current.data[i]) * k;
  return current;
}

/**
 * Perceived-lightness weight of the backdrop at which a particle turns to ink.
 * Mid-grey backdrops get a partial blend rather than a hard switch.
 */
export function inkWeight(luma: number): number {
  const t = clamp01((luma - 0.32) / 0.4);
  return t * t * (3 - 2 * t);
}

/** Deep pigment tints for low-saturation (pearl/white) particles, per expressive family (img-05/06/07). */
export const INK_TINTS = {
  rest: [0.5, 0.05, 0.09],
  comfort: [0.4, 0.1, 0.25],
  joy: [0.62, 0.36, 0.06],
  congratulation: [0.55, 0.1, 0.34],
  supportive: [0.2, 0.15, 0.48],
} as const satisfies Record<string, Rgb>;

export function inkTint(weights: { comfort: number; joy: number; congratulation: number; supportive: number }, strength: number): [number, number, number] {
  const formed = clamp01(strength);
  const rest = 1 - formed;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] = INK_TINTS.rest[c] * rest + formed * (
      INK_TINTS.comfort[c] * weights.comfort +
      INK_TINTS.joy[c] * weights.joy +
      INK_TINTS.congratulation[c] * weights.congratulation +
      INK_TINTS.supportive[c] * weights.supportive);
  }
  const sum = weights.comfort + weights.joy + weights.congratulation + weights.supportive;
  if (formed > 0 && sum < 1e-4) for (let c = 0; c < 3; c++) out[c] += INK_TINTS.rest[c] * formed;
  return out;
}

/** Deepen a light hue (max channel 1) into its pigment: strong channels stay, weak ones sink; pale hues take the family tint. */
export function inkColor(hr: number, hg: number, hb: number, tint: Rgb, out: [number, number, number]): void {
  const max = Math.max(hr, hg, hb, 1e-6);
  const min = Math.min(hr, hg, hb);
  const sat = clamp01(((max - min) / max) * 2.5);
  const dr = Math.pow(hr / max, 2.4) * 0.62;
  const dg = Math.pow(hg / max, 2.4) * 0.62;
  const db = Math.pow(hb / max, 2.4) * 0.62;
  out[0] = tint[0] + (dr - tint[0]) * sat;
  out[1] = tint[1] + (dg - tint[1]) * sat;
  out[2] = tint[2] + (db - tint[2]) * sat;
}

/**
 * One composited pixel from accumulated additive light (ar, ag, ab) and the
 * ink weight behind it. Writes straight (unpremultiplied) RGBA 0..255.
 * Black accumulation is fully transparent, so there is never a plate or
 * rectangle; over dark the result equals the approved additive light.
 */
export function compositePixel(ar: number, ag: number, ab: number, ink: number, tint: Rgb, out: Uint8ClampedArray, j: number, scratch: [number, number, number]): number {
  // Same soft clip as the approved p3-a2 renderer, now normalized to 0..1.
  const cr = Math.min(1, (ar / (0.55 + ar)) * 1.5686);
  const cg = Math.min(1, (ag / (0.55 + ag)) * 1.5686);
  const cb = Math.min(1, (ab / (0.55 + ab)) * 1.5686);
  const light = cr > cg ? (cr > cb ? cr : cb) : (cg > cb ? cg : cb);
  if (light < 1 / 255) { out[j] = 0; out[j + 1] = 0; out[j + 2] = 0; out[j + 3] = 0; return 0; }
  const hr = cr / light, hg = cg / light, hb = cb / light;
  if (ink <= 0.001) {
    out[j] = hr * 255; out[j + 1] = hg * 255; out[j + 2] = hb * 255; out[j + 3] = light * 255;
    return light;
  }
  inkColor(hr, hg, hb, tint, scratch);
  // Pigment needs more coverage than light to read on white (owner: "veil too weak").
  const inkAlpha = Math.min(1, Math.pow(light, 0.8) * 1.15);
  const la = light * (1 - ink);
  const ia = inkAlpha * ink;
  const alpha = la + ia;
  out[j] = ((hr * la + scratch[0] * ia) / alpha) * 255;
  out[j + 1] = ((hg * la + scratch[1] * ia) / alpha) * 255;
  out[j + 2] = ((hb * la + scratch[2] * ia) / alpha) * 255;
  out[j + 3] = alpha * 255;
  return light * (1 - ink);
}

/** Mix an authored light colour toward its ink for strokes/fills drawn over a known backdrop. */
export function materialColor(light: Rgb, ink: number, tint: Rgb): [number, number, number] {
  const deep: [number, number, number] = [0, 0, 0];
  inkColor(light[0], light[1], light[2], tint, deep);
  const w = clamp01(ink);
  return [light[0] + (deep[0] - light[0]) * w, light[1] + (deep[1] - light[1]) * w, light[2] + (deep[2] - light[2]) * w];
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgba(rgb: Rgb, alpha: number): string {
  return `rgba(${Math.round(clamp01(rgb[0]) * 255)},${Math.round(clamp01(rgb[1]) * 255)},${Math.round(clamp01(rgb[2]) * 255)},${clamp01(alpha).toFixed(3)})`;
}

/** Uniform backdrop (fixture `?luma=`). */
export function uniformSampler(luma: number): BackdropSampler {
  const value = clamp01(luma);
  return { sample: () => ({ cols: 1, rows: 1, data: Float32Array.of(value) }) };
}

/**
 * Browser fixture only: luminance of a CSS `background-size: cover;
 * background-position: center` test image behind the page. Stands in for the
 * native sample; it is not evidence of native behaviour.
 */
export function imageSampler(src: string, cols = 64, rows = 40): BackdropSampler {
  let pixels: { width: number; height: number; data: Uint8ClampedArray } | null = null;
  if (typeof Image !== "undefined" && typeof document !== "undefined") {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 800 / img.naturalWidth);
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      pixels = { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    img.src = src;
  }
  return {
    sample(rect) {
      if (!pixels || typeof innerWidth === "undefined") return null;
      const vw = innerWidth, vh = innerHeight;
      const cover = Math.max(vw / pixels.width, vh / pixels.height);
      const offX = (vw - pixels.width * cover) / 2;
      const offY = (vh - pixels.height * cover) / 2;
      const data = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const vx = rect.left + ((c + 0.5) / cols) * rect.width;
          const vy = rect.top + ((r + 0.5) / rows) * rect.height;
          const px = Math.max(0, Math.min(pixels.width - 1, Math.floor((vx - offX) / cover)));
          const py = Math.max(0, Math.min(pixels.height - 1, Math.floor((vy - offY) / cover)));
          const i = (py * pixels.width + px) * 4;
          data[r * cols + c] = (0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] + 0.0722 * pixels.data[i + 2]) / 255;
        }
      }
      return { cols, rows, data };
    },
  };
}

/** Fixture: left half white, right half dark, in viewport space. */
export function splitSampler(cols = 64, rows = 4): BackdropSampler {
  return {
    sample(rect) {
      if (typeof innerWidth === "undefined") return null;
      const data = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        data[r * cols + c] = rect.left + ((c + 0.5) / cols) * rect.width < innerWidth / 2 ? 1 : 0.05;
      }
      return { cols, rows, data };
    },
  };
}

/**
 * Resample a grid that covers the whole viewport down to the part behind
 * `rect` (viewport px). A rect equal to the viewport returns the grid itself.
 */
export function cropGrid(grid: LumaGrid, rect: { left: number; top: number; width: number; height: number }, viewportWidth: number, viewportHeight: number): LumaGrid {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return grid;
  if (Math.abs(rect.left) < 0.5 && Math.abs(rect.top) < 0.5 && Math.abs(rect.width - viewportWidth) < 0.5 && Math.abs(rect.height - viewportHeight) < 0.5) return grid;
  const data = new Float32Array(grid.cols * grid.rows);
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const u = (rect.left + ((c + 0.5) / grid.cols) * rect.width) / viewportWidth;
      const v = (rect.top + ((r + 0.5) / grid.rows) * rect.height) / viewportHeight;
      data[r * grid.cols + c] = lumaAt(grid, u, v);
    }
  }
  return { cols: grid.cols, rows: grid.rows, data };
}
