// Paris palette only (owner decision 2026-10-05): tokens extracted from the selected P1 reference
// (w4-20261005-paris-p1-converge/img-01, median samples at inspected points) reconciled with
// DESIGN_PROMPT.md §5. No Week 3 emotion palette (teal, coral, apricot, plum) anywhere.
import { hexToRgb } from './store.ts';
import type { Rgb } from './types.ts';

const hex = (h: string): Rgb => hexToRgb(h);

export const PALETTE = {
  paper: hex('#f6f0e6'),
  // Stone
  limestoneLit: hex('#f6e2c8'),
  limestoneShade: hex('#e8dacb'),
  limestoneCool: hex('#d8cbc2'),
  plinth: hex('#e3d5c4'),
  // Line
  sepiaInk: hex('#3a2f2a'),
  inkSoft: hex('#6e625a'),
  graphite: hex('#8e847c'),
  pencilFaint: hex('#b9b0a6'),
  // Shutters and windows
  shutterGreen: hex('#b8c1a4'),
  shutterShade: hex('#8e9a80'),
  shutterLouvre: hex('#5f6b57'),
  windowPane: hex('#8b8c7b'),
  paneLight: hex('#c0bba7'),
  mullion: hex('#f4efe6'),
  balconyIron: hex('#5a5c58'),
  // Awning
  awningRed: hex('#c78b79'),
  awningShade: hex('#8b5449'),
  // Roof and lamp
  zinc: hex('#77777f'),
  zincLight: hex('#9a9aa2'),
  lampIron: hex('#3a3338'),
  lampStipple: hex('#7b6274'),
  lampGlass: hex('#e2dcd9'),
  // People
  camelLit: hex('#d6a97e'),
  camelShade: hex('#976d54'),
  hair: hex('#694437'),
  boots: hex('#4a3328'),
  stocking: hex('#5a4a44'),
  skin: hex('#d9b29a'),
  walkerTan: hex('#826871'),
  walkerTanLit: hex('#a48c90'),
  trousers: hex('#4d4650'),
  folderWhite: hex('#f2eee8'),
  walkerFar: hex('#977e7b'),
  walkerFarShade: hex('#6f5b5e'),
  // Table and objects
  marble: hex('#f3efeb'),
  marbleShade: hex('#e4dfdb'),
  marbleVein: hex('#c6c1bd'),
  tableRim: hex('#7a7470'),
  cupWhite: hex('#f6f1ec'),
  cupShade: hex('#c7bcb6'),
  cupDeepShade: hex('#afa49e'),
  coffee: hex('#8b5a3a'),
  coffeeDark: hex('#6a4430'),
  coffeeLit: hex('#d69f69'),
  saucer: hex('#f6ece4'),
  saucerShade: hex('#d9d0c8'),
  glass: hex('#c2c3c8'),
  glassLight: hex('#edeef0'),
  glassShade: hex('#a1a4ac'),
  ash: hex('#b8b2ac'),
  cigPaper: hex('#fbfaf8'),
  cigFilter: hex('#d9a46a'),
  ember: hex('#c8512f'),
  rattan: hex('#daa671'),
  rattanLit: hex('#f0d2a6'),
  rattanShade: hex('#b07a3e'),
  // Shadows, steam, smoke
  shadowMauve: hex('#a89aa0'),
  steam: hex('#b9b2ae'),
  smoke: hex('#9d968f'),
} as const satisfies Record<string, Rgb>;

export type PaletteKey = keyof typeof PALETTE;

/** The Week 3 emotion accents that must not reappear (week3/src/visual/palette.ts). */
const WEEK3_ACCENTS: readonly Rgb[] = [hex('#93c8d4'), hex('#a8a4cb'), hex('#da9c85')];

/**
 * Hue rule for every particle: nothing in the cyan→blue→purple band with real saturation
 * (teal, ice, lavender, plum), and nothing saturated in the magenta band (Week 3's plum/magenta
 * ink tints); P1's muted mauves (lamp stipple, far walkers, saturation ≈ 0.2) stay allowed.
 * Warm reds and oranges (terracotta awning, ember, camel) are legitimate.
 */
export function isParisHue([r, g, b]: Rgb): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat <= 0.18) return true;
  const d = max - min;
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = ((hue * 60) % 360 + 360) % 360;
  if (hue >= 150 && hue <= 290) return false;
  if (hue > 290 && hue <= 345 && sat > 0.35) return false;
  return true;
}

/** Token rule: no palette entry may sit within a short RGB distance of a Week 3 accent. */
export function isWeek3Accent([r, g, b]: Rgb): boolean {
  return WEEK3_ACCENTS.some((acc) => Math.hypot(r - acc[0], g - acc[1], b - acc[2]) < 0.05);
}

export function isParisTone(rgb: Rgb): boolean {
  return isParisHue(rgb) && !isWeek3Accent(rgb);
}
