// Renderer-only development page (render-dev.html): mounts the placeholder scene on a full-viewport canvas, with a
// dev sky and a row of test tiles so the ground + sky, particle, tile and hairline passes of both backends can be
// smoke-tested. Query parameters: ?backend=webgl2|canvas2d|auto (default auto), ?stress=N (synthetic N-particle
// scene for the Canvas2D budget path), ?hud=1 (visible stats), ?sky=0 (no sky: the paper-grain path), ?skywedge=1
// (the dev sky clipped to a sample roofline wedge through Sky.polygon; the ground shows outside it), ?tiles=0
// (tiles off), ?look=dark (umber-black ground like the seed-33 scene), ?build=<ms> (staggers the test tiles' births
// over this time; default 0 = all born at 0). The canvas carries data attributes for the smoke script.
import { buildPlaceholderScene } from '../scene/placeholder.ts';
import { createStore, fitFrame, MAX_PARTICLES } from '../scene/store.ts';
import { hash01 } from '../scene/rng.ts';
import type { BackendPreference, FrameView, Renderer, RendererStats, SceneFrame, Sky, Tile } from '../scene/types.ts';
import { createRenderer } from './create.ts';

export interface RenderDevHandle {
  renderer: Renderer;
  /** The authored scene (its tiles are never mutated by the toggle). */
  scene: SceneFrame;
  preference: BackendPreference;
  stats(): RendererStats;
  frames(): number;
  /** The frame handed to the renderer last (tiles empty while the toggle is off) and the view it was drawn with. */
  frame(): SceneFrame;
  view(): FrameView | null;
  tilesOn(): boolean;
  setTiles(on: boolean): void;
  /** WebGL2 only: simulates a context loss through WEBGL_lose_context. Returns false when unavailable. */
  loseContext(): boolean;
  restoreContext(): boolean;
}

declare global {
  interface Window {
    __evaRenderDev?: RenderDevHandle;
  }
}

/** Dev sky: pale pink-cream above the roofline, like the seed-33 reference; visible on cream and dark grounds alike. */
const DEV_SKY: Sky = { top: [0.98, 0.92, 0.88], horizon: [0.95, 0.85, 0.8], horizonY: 0.42 };
/**
 * Sample sky wedge for ?skywedge=1 (frame coordinates): a street-canyon opening between two rooflines, starting above
 * the frame top (margin clipping), with one concave cornice notch on the right so the ear-clipping path is exercised,
 * narrowing to a point just below the horizon band. Frame columns 0.1/0.3/0.7/0.9 at y 0.02 are outside it, 0.5 inside.
 */
export const DEV_SKY_WEDGE: readonly (readonly [number, number])[] = [
  [0.36, -0.02],
  [0.68, -0.02],
  [0.66, 0.12],
  [0.6, 0.16],
  [0.62, 0.24],
  [0.55, 0.44],
  [0.5, 0.34],
  [0.44, 0.2],
  [0.38, 0.1],
];
/** Umber-black ground for ?look=dark. */
const DEV_DARK_GROUND = [0.1, 0.07, 0.06] as const;

/** Test tiles: one per pattern (plus a transparent one that only drops a hairline), in a row over the top-right of the frame. */
const DEV_TILE_SPECS: ReadonlyArray<Pick<Tile, 'pattern' | 'colour' | 'hairline'>> = [
  { pattern: 'flat', colour: [0.78, 0.47, 0.38], hairline: 0.14 },
  { pattern: 'dither', colour: [0.45, 0.48, 0.5], hairline: 0.1 },
  { pattern: 'dotgrid', colour: [0.55, 0.6, 0.5], hairline: 0 },
  { pattern: 'scanline', colour: [0.8, 0.62, 0.35], hairline: 0 },
  { pattern: 'transparent', colour: [0.78, 0.47, 0.38], hairline: 0.06 },
];

export function buildDevTiles(buildMs: number): Tile[] {
  const n = DEV_TILE_SPECS.length;
  return DEV_TILE_SPECS.map((spec, i) => ({
    id: `dev:tile/${i}`,
    region: 0,
    x: 0.56 + i * 0.08,
    y: 0.08,
    w: 0.06,
    h: 0.1,
    pattern: spec.pattern,
    colour: spec.colour,
    alpha: 0.9,
    cellPx: 6,
    hairline: spec.hairline,
    birthMs: n > 1 ? (buildMs * i) / (n - 1) : 0,
  }));
}

function parsePreference(value: string | null): BackendPreference {
  return value === 'webgl2' || value === 'canvas2d' ? value : 'auto';
}

/** Dev-only stress scene: the placeholder's particles repeated with deterministic jitter up to `n` slots. */
function buildStressScene(n: number): SceneFrame {
  const base = buildPlaceholderScene();
  const count = Math.min(Math.max(1, Math.floor(n)), MAX_PARTICLES);
  const store = createStore(count);
  const m = base.store.count;
  for (let k = 0; k < count; k++) {
    const i = k % m;
    const jx = (hash01(k, 101) - 0.5) * 0.02;
    const jy = (hash01(k, 102) - 0.5) * 0.02;
    store.x[k] = Math.min(1, Math.max(0, base.store.x[i]! + jx));
    store.y[k] = Math.min(1, Math.max(0, base.store.y[i]! + jy));
    store.z[k] = base.store.z[i]!;
    store.r[k] = base.store.r[i]!;
    store.g[k] = base.store.g[i]!;
    store.b[k] = base.store.b[i]!;
    store.a[k] = base.store.a[i]!;
    store.size[k] = base.store.size[i]!;
    store.region[k] = 0;
    store.phase[k] = base.store.phase[i]!;
    store.motion[k] = base.store.motion[i]!;
    store.birthMs[k] = base.store.birthMs[i]!;
  }
  store.count = count;
  return {
    store,
    regions: [{ id: 'dev:stress', band: 'facade', depth: -9, start: 0, end: count, dynamic: false }],
    aspect: base.aspect,
    paper: base.paper,
    seed: base.seed,
    sky: null,
    tiles: [],
    build: { durationMs: 0 },
  };
}

function mount() {
  const params = new URLSearchParams(location.search);
  const preference = parsePreference(params.get('backend'));
  const stress = Number(params.get('stress'));
  const build = Number(params.get('build'));
  const canvas = document.getElementById('scene');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('render-dev.html needs <canvas id="scene">');
  const hud = document.getElementById('hud');
  if (hud && params.get('hud') === '1') hud.hidden = false;

  const base = Number.isFinite(stress) && stress > 0 ? buildStressScene(stress) : buildPlaceholderScene();
  const wedge = params.get('skywedge') === '1';
  const scene: SceneFrame = {
    ...base,
    paper: params.get('look') === 'dark' ? DEV_DARK_GROUND : base.paper,
    sky: params.get('sky') === '0' ? null : wedge ? { ...DEV_SKY, polygon: DEV_SKY_WEDGE } : DEV_SKY,
    tiles: buildDevTiles(Number.isFinite(build) && build > 0 ? build : 0),
  };
  let tilesOn = params.get('tiles') !== '0';
  // Never mutate the scene's tiles: the toggle hands the renderer a frame whose tiles array is empty.
  let active: SceneFrame = tilesOn ? scene : { ...scene, tiles: [] };
  let lastView: FrameView | null = null;

  const renderer = createRenderer(canvas, preference);
  canvas.dataset.requested = preference;
  canvas.dataset.backend = renderer.backend;
  canvas.dataset.ready = '0';
  canvas.dataset.sky = scene.sky ? '1' : '0';
  canvas.dataset.skyWedge = scene.sky?.polygon ? '1' : '0';

  let frames = 0;
  let handle = 0;
  const tick = (t: number) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    // The rAF timestamp is this page's host clock (ms since navigation); the real host uses its own pausable clock.
    const view: FrameView = { widthPx: w, heightPx: h, dpr, frame: fitFrame(w, h, scene.aspect), timeMs: t };
    renderer.draw(active, view);
    lastView = view;
    frames++;
    const s = renderer.stats();
    canvas.dataset.backend = s.backend;
    canvas.dataset.detail = s.detail ?? '';
    canvas.dataset.drawMs = s.lastDrawMs.toFixed(3);
    canvas.dataset.particles = String(s.particlesDrawn);
    canvas.dataset.tiles = String(active.tiles.length);
    canvas.dataset.degraded = s.degraded ? '1' : '0';
    canvas.dataset.frames = String(frames);
    if (frames === 1) canvas.dataset.ready = '1';
    if (hud && !hud.hidden) {
      const skyWord = scene.sky ? (scene.sky.polygon ? `wedge (${scene.sky.polygon.length} pts)` : 'on') : 'off';
      hud.textContent = `${s.backend}  ${s.detail ?? ''}\nparticles ${s.particlesDrawn}  tiles ${active.tiles.length}  sky ${skyWord}  draw ${s.lastDrawMs.toFixed(2)} ms  t ${(t / 1000).toFixed(1)} s  frame ${frames}${s.degraded ? '  DEGRADED' : ''}`;
    }
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);

  // Cache the extension while the context is live: getExtension() returns null once the context is lost,
  // so restoreContext() must use the object obtained beforehand.
  const loseExt: WEBGL_lose_context | null =
    renderer.backend === 'webgl2' ? (canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context') ?? null) : null;

  window.__evaRenderDev = {
    renderer,
    scene,
    preference,
    stats: () => renderer.stats(),
    frames: () => frames,
    frame: () => active,
    view: () => lastView,
    tilesOn: () => tilesOn,
    setTiles(on: boolean) {
      tilesOn = on;
      active = on ? scene : { ...scene, tiles: [] };
    },
    loseContext() {
      if (!loseExt) return false;
      loseExt.loseContext();
      return true;
    },
    restoreContext() {
      if (!loseExt) return false;
      loseExt.restoreContext();
      return true;
    },
  };

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(handle);
    renderer.dispose();
  });
}

mount();
