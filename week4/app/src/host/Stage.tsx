// The stage: a region that fills the space above the fixture bar. The renderer owns the canvas,
// which the render loop mounts imperatively, so this component only supplies the sized host element.
import { useRef } from 'react';
import type { BackendPreference } from '../scene/types.ts';
import { useRenderLoop } from './useRenderLoop.ts';
import type { FixtureInfo, LoopCallbacks, Scene } from './useRenderLoop.ts';

export interface StageProps extends LoopCallbacks {
  scene: Scene | null;
  /** Identifies the clip; a change restarts the clocks at `startMs` (see LiveSettings). */
  sceneKey: string;
  startMs: number;
  preference: BackendPreference;
  paused: boolean;
  reducedMotion: boolean;
  showTiles: boolean;
  fixture: boolean;
  manualClock: boolean;
  info: FixtureInfo;
  /** False in capture mode, where no status line exists to feed. */
  publish: boolean;
  /** Plain-language reason when nothing can be drawn; shown in place of the picture. */
  unavailable: string | null;
}

const toCss = (rgb: readonly [number, number, number]): string =>
  `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;

export function Stage(props: StageProps) {
  const { scene, sceneKey, startMs, preference, paused, reducedMotion, showTiles, fixture, manualClock, info, publish, unavailable, onSnapshot, onUnavailable } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  useRenderLoop(
    hostRef,
    preference,
    { scene, sceneKey, startMs, paused, reducedMotion, showTiles, fixture, manualClock, info, publish },
    { onSnapshot, onUnavailable },
  );
  // The margins match the scene's own ground colour, so the contain-fit letterbox reads as part of the picture.
  const background = scene ? toCss(scene.frame.paper) : undefined;
  return (
    <div className="stage" style={background ? { backgroundColor: background } : undefined}>
      <div className="canvas-host" ref={hostRef} />
      {unavailable !== null ? (
        <p className="stage-message" role="alert">
          Rendering unavailable: {unavailable}
        </p>
      ) : null}
    </div>
  );
}
