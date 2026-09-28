/**
 * The Week 3 pivot palette (week3/DESIGN.md#4). Small, quiet, and secondary
 * to geometry: every stance also differs in silhouette, timing and box
 * grouping, so palette weighting is never the only signal (per the owner's
 * "not hue swaps" instruction).
 */
export const PALETTE = {
  charcoal: "#111316",
  pearl: "#e4ded2",
  lavender: "#a8a4cb",
  ice: "#93c8d4",
  coral: "#da9c85",
} as const;

export interface PaletteWeights {
  pearl: number;
  lavender: number;
  ice: number;
  coral: number;
}

export function normalizeWeights(w: PaletteWeights): PaletteWeights {
  const total = w.pearl + w.lavender + w.ice + w.coral;
  if (!(total > 0)) return { pearl: 1, lavender: 0, ice: 0, coral: 0 };
  return {
    pearl: w.pearl / total,
    lavender: w.lavender / total,
    ice: w.ice / total,
    coral: w.coral / total,
  };
}

function colorToRgb(color: string): [number, number, number] {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const match = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
  throw new Error('Unsupported authored color');
}

export function mixHex(a: string, b: string, t: number): string {
  const clampedT = Math.min(1, Math.max(0, t));
  const [ar, ag, ab] = colorToRgb(a);
  const [br, bg, bb] = colorToRgb(b);
  const r = Math.round(ar + (br - ar) * clampedT);
  const g = Math.round(ag + (bg - ag) * clampedT);
  const b2 = Math.round(ab + (bb - ab) * clampedT);
  return `rgb(${r}, ${g}, ${b2})`;
}

/** Blend the four accent colors by weight into a single CSS color string. */
export function blendWeightedColor(w: PaletteWeights): string {
  const n = normalizeWeights(w);
  const entries: Array<[keyof PaletteWeights, string]> = [
    ["pearl", PALETTE.pearl],
    ["lavender", PALETTE.lavender],
    ["ice", PALETTE.ice],
    ["coral", PALETTE.coral],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [key, hex] of entries) {
    const [hr, hg, hb] = colorToRgb(hex);
    const weight = n[key];
    r += hr * weight;
    g += hg * weight;
    b += hb * weight;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = colorToRgb(color);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
