// The `showTiles` fixture flag. DOM-free so `node --test` can run it.
// When tiles are off the renderer is handed a copy of the frame whose `tiles` is an empty array. The scene's own
// tiles are never touched, so life keeps stepping them and switching tiles back on shows their current state.
import type { SceneFrame } from '../scene/types.ts';

const HIDDEN = new WeakMap<SceneFrame, SceneFrame>();

/**
 * The frame to draw. With tiles on (or no tiles authored) it is the scene's own frame; with tiles off it is a
 * shallow copy sharing the particle store, regions and sky, cached per frame so its identity is stable between
 * frames (a renderer that keys caches on the frame object never re-uploads every frame).
 */
export function frameForDraw(frame: SceneFrame, showTiles: boolean): SceneFrame {
  if (showTiles || frame.tiles.length === 0) return frame;
  let copy = HIDDEN.get(frame);
  if (!copy) {
    copy = { ...frame, tiles: [] };
    HIDDEN.set(frame, copy);
  }
  return copy;
}
