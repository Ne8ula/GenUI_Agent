// Shared draw plan for the Seed-33 component-construction pass.
// Geometry is authored data; both backends consume the same ordered commands.
import type { PhotoManifestData, Rgb } from './types.ts';

export type ConstructionPoint = readonly [number, number];
export type ConstructionTexture = 'background' | 'foreground' | 'figure' | 'tiles';
export type FigureConstructionStage = 'absent' | 'scaffold' | 'volume' | 'garment' | 'complete';

interface ConstructionCommandBase {
  /** Stable authored identity, with a semantic component prefix. */
  id: string;
  component: string;
  alpha: number;
}

export interface ConstructionStroke extends ConstructionCommandBase {
  kind: 'stroke';
  /** Already-grown part of the path, in normalised frame coordinates. */
  points: readonly ConstructionPoint[];
  widthPx: number;
  colour: Rgb;
}

export interface ConstructionDisc extends ConstructionCommandBase {
  kind: 'disc';
  center: ConstructionPoint;
  /** Radius in CSS px at a 1080-px-high frame. */
  radiusPx: number;
  colour: Rgb;
}

export interface ConstructionSolid extends ConstructionCommandBase {
  kind: 'solid';
  points: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint];
  colour: Rgb;
}

export interface ConstructionTextureVertex {
  /** Destination in normalised frame coordinates. */
  x: number;
  y: number;
  /** Source texture coordinates, 0..1, top-left origin. */
  u: number;
  v: number;
}

/** Single/dual-channel RGB isolation of the SAME real sampled pixels (alpha untouched): a true channel
 * split, not a flat tint. Omitted (the default) draws the texture's full colour, unchanged from before
 * this field existed. */
export type ConstructionChannel = 'r' | 'g' | 'b' | 'cyan' | 'magenta' | 'yellow';

export interface ConstructionPatch extends ConstructionCommandBase {
  kind: 'texture';
  texture: ConstructionTexture;
  vertices: readonly [ConstructionTextureVertex, ConstructionTextureVertex, ConstructionTextureVertex];
  channel?: ConstructionChannel;
}

export type ConstructionCommand = ConstructionStroke | ConstructionDisc | ConstructionSolid | ConstructionPatch;

export interface ConstructionInput {
  timeMs: number;
  buildMs: number;
  seed: number;
  reducedMotion: boolean;
  showTiles: boolean;
  manifest: PhotoManifestData;
}

export interface ConstructionPlan {
  /** False for zero-length/completed builds and reduced motion: use the existing complete photo path. */
  active: boolean;
  progress: number;
  figureStage: FigureConstructionStage;
  /** Painter order, including component-local surfaces. No global image alpha/wipe. */
  commands: readonly ConstructionCommand[];
  stats: {
    growingStrands: number;
    completedStrands: number;
    movingTiles: number;
  };
}

/** Limits apply to the pure planner before either renderer uploads/draws its output. */
export const CONSTRUCTION_COMMAND_LIMIT = 12000;
