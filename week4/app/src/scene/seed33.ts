// Seed-33 look: stable import path. w4-20261008-seed33-fidelity-r1 (2026-10-08) replaced the earlier
// procedural bead facade/object/figure construction this file used to author directly with the
// reference-derived photo-layer rebuild in seed33Photo.ts, after the owner rejected run 4's bead
// approximation as "visibly nothing like" the approved seed-33 still (see that revision's REVIEW.md).
// This file now only re-exports seed33Photo.ts under the names host/scenes.ts and the existing tests
// already use, plus the sky-wedge constants kept as pure geometry for render-tiles.test.ts (the photo
// scene's own frame.sky is null: the photo already contains that sky's pixels).
import type { Pt } from './author.ts';
import { hexToRgb } from './store.ts';
import type { WalkerRig } from './arrival.ts';
import type { Rgb, SceneFrame, Sky } from './types.ts';

export {
  ASPECT,
  DEFAULT_SEED33_PHOTO as DEFAULT_SEED33,
  DEFAULT_HOME,
  DEFAULT_NATIVE_ASPECT,
  GROUND,
  PHOTO_LAYER,
  REGION_ORDER,
  buildSeed33PhotoScene as buildSeed33Scene,
  setSeed33PhotoReducedMotion as setReducedMotion,
  photoApproachPose,
  figureBoundsNorm,
  isFullyOffFrame,
  walkSwayOffsets,
  tileDriftOffset,
  APPROACH_GUIDE_SAMPLES,
  buildRevealY,
  figureBuildAlpha,
} from './seed33Photo.ts';
export type { Seed33PhotoOptions as Seed33Options, PhotoPose, PhotoHome, FigureBounds, ApproachGuideSample, TileOffset } from './seed33Photo.ts';

/** No bead rigs exist in the photo rebuild; kept (frame param included) so life.ts's rigsOfFrame still typechecks. */
export function seed33RigsOf(_frame: SceneFrame): undefined {
  return undefined;
}

// life.ts (shared with arrival.ts's own walkers, unchanged) imports these for the bead-walker "intro"
// system the old seed-33 woman alone used. No rig from the photo rebuild below is ever registered
// against INTROS, so walkerIntroOf always returns undefined here, exactly like an arrival walker; kept
// only so life.ts's existing, unmodified import list still resolves.
export const WALKER_FADE_IN_S = 1.4;
export const WALKER_FADE_OUT_S = 1.8;
export const WALKER_GAP_S = 2.5;
export interface WalkerIntro {
  startS: number;
  travelS: number;
  holdS: number;
}
const INTROS = new WeakMap<WalkerRig, WalkerIntro>();
export const walkerIntroOf = (rig: WalkerRig): WalkerIntro | undefined => INTROS.get(rig);

// Sky-wedge geometry, kept as a pure constant (render-tiles.test.ts exercises the renderer's generic
// polygon-clip math against this specific non-trivial wedge shape; it does not require a scene to use it).
export const SKY_TOP: Rgb = hexToRgb('#f2d9cb');
export const SKY_HORIZON: Rgb = hexToRgb('#f7e8d8');
export const SKY_HORIZON_Y = 0.23;
export const SEED33_SKY_POLYGON: readonly Pt[] = [[0.395, -0.02], [0.675, -0.02], [0.665, 0.1], [0.64, 0.17], [0.585, 0.2], [0.6, 0.225], [0.47, 0.225], [0.46, 0.33]];
export const SEED33_SKY: Sky = { top: SKY_TOP, horizon: SKY_HORIZON, horizonY: SKY_HORIZON_Y, polygon: SEED33_SKY_POLYGON };
