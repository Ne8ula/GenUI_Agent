// Renderer factory: WebGL2 first, Canvas2D when WebGL2 context creation fails or when asked for explicitly.
//
// A canvas is bound to the first context type it hands out: once getContext('webgl2') has succeeded,
// getContext('2d') returns null on that element (and vice versa). The host must therefore mount a
// fresh <canvas> to change backend; calling createRenderer with a different preference on the same
// canvas is not supported and throws from the backend that cannot obtain its context.
import type { BackendPreference, Renderer } from '../scene/types.ts';
import { createCanvas2DRenderer } from './canvas2d.ts';
import { createWebGL2Renderer } from './webgl2.ts';

export { WEBGL2_CONTEXT_ATTRIBUTES } from './webgl2.ts';

/**
 * - 'canvas2d': Canvas2D.
 * - 'webgl2' | 'auto': WebGL2 with the required context attributes; if context creation returns null,
 *   Canvas2D on the same (still unbound) canvas with stats.detail 'Canvas2D · WebGL2 unavailable'.
 *   If WebGL2 setup fails after the context exists (shader compile/link, GL object allocation), this
 *   throws an Error naming the reason: the canvas is already bound to WebGL2, so no 2D fallback is
 *   attempted and no half-initialised renderer is returned. The host shows the reason in words.
 *   A WebGL2 context that is created but later lost is handled inside the WebGL2 renderer:
 *   drawing stops and stats.degraded is true until 'webglcontextrestored' rebuilds its resources.
 *
 * Clocks: `view.timeMs` is the host clock (starts at 0, stops while paused). Both backends derive
 * every time-driven effect (birth ramps of particles and tiles, bead shimmer) from `view.timeMs` only,
 * never from performance.now(), so Pause freezes the picture and equal clocks give equal frames.
 * `stats().lastDrawMs` is CPU time of draw(); for WebGL2 that is submit time, not GPU execution.
 */
export function createRenderer(canvas: HTMLCanvasElement, preference: BackendPreference): Renderer {
  if (preference === 'canvas2d') return createCanvas2DRenderer(canvas);
  const webgl2 = createWebGL2Renderer(canvas);
  if (webgl2) return webgl2;
  return createCanvas2DRenderer(canvas, { reason: 'WebGL2 unavailable' });
}
