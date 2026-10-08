// The render loop. One effect owns the whole lifetime of a renderer:
// fresh canvas element -> renderer -> ResizeObserver -> requestAnimationFrame loop.
// A canvas bound to one context type cannot switch, so a backend change (or a StrictMode
// effect re-run) disposes the renderer, removes the canvas and mounts a new one.
//
// Clocks: `clockMs` is the host clock the renderers read (`view.timeMs`: birth ramps, shimmer) and
// `scene.life.clockMs` is the life clock. They start together at `startMs` (the `t` parameter), advance
// together and stop together while paused, so a still at t=3000 shows the build at 3 s.
//
// BACKEND-SWITCH RULE: the clocks are not this effect's variables. They live in a ClockSession kept in a ref, so the
// effect re-run caused by a backend switch finds its own scene again and keeps the host clock where it was; it does
// not restart at `startMs` and does not advance life a second time, so the two clocks never split. Reduced motion is
// applied to the scene in place (no rebuild, no replay, no clock change). The rules and their tests are in clock.ts
// and host-clock.test.ts.
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { createRenderer } from '../render/create.ts';
import type { LifeState } from '../scene/life.ts';
import { fitFrame } from '../scene/store.ts';
import type { BackendPreference, FrameView, Renderer, RendererStats, SceneFrame } from '../scene/types.ts';
import { adoptScene, createClockSession, stepClocks, syncReducedMotion } from './clock.ts';
import { createRingBuffer, summarize } from './frameStats.ts';
import type { Summary, TileCounts } from './frameStats.ts';
import { canvasLabel } from './label.ts';
import { frameForDraw } from './tilesFlag.ts';

/** Intervals and draw times kept for the median / p95 in the status line. */
export const STATS_WINDOW = 120;
/** The status line is published at most this often. */
export const PUBLISH_INTERVAL_MS = 250;
/**
 * One long frame must not teleport the idle life, but slow software frames (100–250 ms here)
 * must not slow life down either, or the pacing of a capture would be wrong. Only stalls
 * longer than this are clamped.
 */
export const MAX_DT_MS = 250;
/** A single manual step (capture clock) is clamped to this, so a typo cannot skip the whole build. */
export const MAX_MANUAL_STEP_MS = 1000;
/** The capture script finds the manual-clock hook under this name on `window`. */
export const FIXTURE_HOOK = '__evaFixture';

export interface FixtureHook {
  /** Advances both clocks by `ms`; resolves after the frame that shows the new state has been drawn. */
  step(ms: number): Promise<void>;
}

export interface Scene {
  frame: SceneFrame;
  life: LifeState;
}

export interface FixtureInfo {
  look: string;
  facing: string;
  seed: number;
  density: number;
  /** The scene's own construction length (ms). */
  buildMs: number;
}

/** Values the loop reads every frame without restarting the renderer. */
export interface LiveSettings {
  scene: Scene | null;
  /**
   * Identifies the clip (look, seed, density, facing, build length, start time). A different key restarts both
   * clocks at `startMs`. Neither reduced motion (applied in place) nor a backend switch (a new renderer on the same
   * scene) makes a new clip, so neither touches a clock.
   */
  sceneKey: string;
  /** Both clocks start here (ms). */
  startMs: number;
  paused: boolean;
  reducedMotion: boolean;
  /** False hands the renderer a frame without tiles; the scene's tiles are neither removed nor frozen. */
  showTiles: boolean;
  /** `?fixture`: write the dataset the capture script reads. */
  fixture: boolean;
  /** `clock=manual` with `fixture`: time advances only through `window.__evaFixture.step`. */
  manualClock: boolean;
  info: FixtureInfo;
  /** False in capture mode, where there is no status line to feed. */
  publish: boolean;
}

export interface LoopSnapshot {
  stats: RendererStats | null;
  frame: Summary | null;
  frameCount: number;
  /** Host clock (ms) when the snapshot was taken. */
  timeMs: number;
  /** The drawn scene's construction length (ms); 0 when it has no build. */
  buildMs: number;
  tiles: TileCounts;
}

export const EMPTY_SNAPSHOT: LoopSnapshot = { stats: null, frame: null, frameCount: 0, timeMs: 0, buildMs: 0, tiles: { shown: 0, authored: 0 } };

export interface LoopCallbacks {
  onSnapshot: (snapshot: LoopSnapshot) => void;
  /** A reason string when no renderer can run, null once one does. */
  onUnavailable: (reason: string | null) => void;
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function writeStaticDataset(canvas: HTMLCanvasElement, live: LiveSettings, authoredTiles: number, shownTiles: number): void {
  const d = canvas.dataset;
  d.look = live.info.look;
  d.facing = live.info.facing;
  d.seed = String(live.info.seed);
  d.density = String(live.info.density);
  d.buildMs = String(live.info.buildMs);
  d.startMs = String(live.startMs);
  d.reduced = live.reducedMotion ? '1' : '0';
  d.paused = live.paused ? '1' : '0';
  d.tiles = String(shownTiles);
  d.tilesAuthored = String(authoredTiles);
  d.manualClock = live.manualClock ? '1' : '0';
}

export function useRenderLoop(
  host: RefObject<HTMLElement | null>,
  preference: BackendPreference,
  live: LiveSettings,
  callbacks: LoopCallbacks,
): void {
  const liveRef = useRef(live);
  const callbacksRef = useRef(callbacks);
  // The host clock and the scene it belongs to outlive any one renderer (see the backend-switch rule above).
  const sessionRef = useRef(createClockSession());
  useEffect(() => {
    liveRef.current = live;
    callbacksRef.current = callbacks;
  });

  useEffect(() => {
    const container = host.current;
    if (!container) return undefined;
    const session = sessionRef.current;
    // The picture's accessible name describes the look actually shown; the tick refreshes it when the look, the
    // near walker's facing or the tiles flag changes.
    const labelNow = (): string => {
      const { info, showTiles } = liveRef.current;
      return canvasLabel({ look: info.look, facing: info.facing, showTiles });
    };

    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', labelNow());
    container.appendChild(canvas);

    let renderer: Renderer | null = null;
    let raf = 0;
    let observer: ResizeObserver | null = null;
    let stopped = false;

    // Manual clock (capture only): steps requested through the hook are consumed by the next tick.
    let pendingStepMs = 0;
    let waiters: Array<() => void> = [];
    const flushWaiters = (): void => {
      const ready = waiters;
      waiters = [];
      for (const resolve of ready) resolve();
    };
    const hookHost = window as unknown as Record<string, unknown>;
    let installedHook: FixtureHook | null = null;
    if (liveRef.current.fixture && liveRef.current.manualClock) {
      installedHook = {
        step: (ms: number) =>
          new Promise<void>((resolve) => {
            pendingStepMs += Math.min(Math.max(Number.isFinite(ms) ? ms : 0, 0), MAX_MANUAL_STEP_MS);
            waiters.push(resolve);
          }),
      };
      hookHost[FIXTURE_HOOK] = installedHook;
    }

    const teardown = (): void => {
      stopped = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      try {
        renderer?.dispose();
      } catch {
        // A failing dispose must not stop the next canvas from mounting.
      }
      renderer = null;
      activeCanvas.remove();
      if (installedHook && hookHost[FIXTURE_HOOK] === installedHook) delete hookHost[FIXTURE_HOOK];
      flushWaiters();
    };

    // When WebGL2 initialisation fails after the context exists, 'auto' tries once more on a
    // fresh canvas with Canvas2D and says so in words; an explicit 'webgl2' request does not.
    let fallbackNote: string | null = null;
    let activeCanvas = canvas;
    try {
      renderer = createRenderer(canvas, preference);
    } catch (error) {
      canvas.remove();
      if (preference === 'auto') {
        const retry = document.createElement('canvas');
        retry.className = 'stage-canvas';
        retry.setAttribute('role', 'img');
        retry.setAttribute('aria-label', labelNow());
        container.appendChild(retry);
        try {
          renderer = createRenderer(retry, 'canvas2d');
          activeCanvas = retry;
          fallbackNote = `WebGL2 failed (${reasonOf(error)}); using Canvas2D`;
        } catch (second) {
          retry.remove();
          callbacksRef.current.onUnavailable(`${reasonOf(error)}; Canvas2D also failed: ${reasonOf(second)}`);
          callbacksRef.current.onSnapshot(EMPTY_SNAPSHOT);
          return teardown;
        }
      } else {
        // No dead canvas is left behind; the stage shows the reason in words instead.
        callbacksRef.current.onUnavailable(reasonOf(error));
        callbacksRef.current.onSnapshot(EMPTY_SNAPSHOT);
        return teardown;
      }
    }
    callbacksRef.current.onUnavailable(null);

    let cssWidth = container.clientWidth;
    let cssHeight = container.clientHeight;
    observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (box) {
        cssWidth = box.width;
        cssHeight = box.height;
      }
    });
    observer.observe(container);

    const intervals = createRingBuffer(STATS_WINDOW);
    let lastNow: number | null = null;
    // The host clock is `session.clockMs`: it advances only while not paused, so Pause freezes the picture, and it
    // starts at `startMs` once per clip, not once per renderer (see the backend-switch rule at the top).
    let wallStart: number | null = null; // first ready frame, for the life-vs-wall record (per renderer)
    let lastLabel = labelNow();
    let frameCount = 0;
    let lastPublish = Number.NEGATIVE_INFINITY;
    let lastBackend: string | null = null;
    let lastDetail: string | null = null;
    let lastDegraded: boolean | null = null;
    let lastStaticKey = '';

    const tick = (now: number): void => {
      if (stopped || !renderer) return;
      raf = requestAnimationFrame(tick);
      if (document.hidden) {
        lastNow = null; // do not record the hidden gap as a frame interval
        return;
      }
      const interval = lastNow === null ? null : now - lastNow;
      lastNow = now;
      if (interval !== null) intervals.push(interval);
      const dt = Math.min(interval ?? 1000 / 60, MAX_DT_MS);

      const current = liveRef.current;
      const scene = current.scene;
      const canvas = activeCanvas;
      canvas.hidden = !scene; // an undrawn canvas would composite black under the message
      const label = labelNow();
      if (label !== lastLabel) {
        lastLabel = label;
        canvas.setAttribute('aria-label', label);
      }
      if (scene) {
        // A new clip starts both clocks at `t` and advances its new idle life to that time before its first draw, so a
        // still is reproducible. This renderer finding the scene it was already showing (a backend switch) is
        // 'same': the host clock stays where it was and life is not advanced again. Reduced motion is applied in place.
        adoptScene(session, scene, current.sceneKey, current.startMs, current.reducedMotion);
        syncReducedMotion(session, scene, current.reducedMotion);
      }
      // Time moves by the frame interval (sub-stepped inside advanceLife, so a 100–250 ms software frame still
      // advances life by the full frame time), or only by capture steps with the manual clock.
      const manual = current.fixture && current.manualClock;
      const stepMs = manual ? pendingStepMs : current.paused ? 0 : dt;
      if (manual) pendingStepMs = 0;
      stepClocks(session, scene, stepMs, current.reducedMotion);
      const clockMs = session.clockMs;
      if (!scene) {
        flushWaiters();
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const widthPx = Math.max(1, Math.round(cssWidth * dpr));
      const heightPx = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== widthPx) canvas.width = widthPx;
      if (canvas.height !== heightPx) canvas.height = heightPx;
      const view: FrameView = { widthPx, heightPx, dpr, frame: fitFrame(widthPx, heightPx, scene.frame.aspect), timeMs: clockMs };
      // Tiles off: the renderer gets a tile-less copy; `scene.frame.tiles` stays as life left it.
      const drawFrame = frameForDraw(scene.frame, current.showTiles);

      let stats: RendererStats;
      try {
        renderer.draw(drawFrame, view);
        stats = renderer.stats();
        if (fallbackNote) stats = { ...stats, degraded: true, detail: `${fallbackNote}${stats.detail ? ` (${stats.detail})` : ''}` };
      } catch (error) {
        const reason = `draw failed: ${reasonOf(error)}`;
        console.error(`EVA host: ${reason}`);
        cancelAnimationFrame(raf);
        stopped = true;
        canvas.remove(); // keep the message legible; the renderer is disposed on cleanup
        callbacksRef.current.onUnavailable(reason);
        flushWaiters();
        return;
      }
      frameCount += 1;
      if (wallStart === null) wallStart = now;
      const tiles: TileCounts = { shown: drawFrame.tiles.length, authored: scene.frame.tiles.length };

      if (current.fixture) {
        const d = canvas.dataset;
        const staticKey = [
          current.info.look,
          current.info.facing,
          current.info.seed,
          current.info.density,
          current.info.buildMs,
          current.startMs,
          current.reducedMotion,
          current.paused,
          current.manualClock,
          tiles.shown,
          tiles.authored,
        ].join('|');
        if (staticKey !== lastStaticKey) {
          lastStaticKey = staticKey;
          writeStaticDataset(canvas, current, tiles.authored, tiles.shown);
        }
        if (stats.backend !== lastBackend) d.backend = lastBackend = stats.backend;
        if (stats.detail !== lastDetail) {
          lastDetail = stats.detail;
          d.detail = stats.detail ?? '';
        }
        if (stats.degraded !== lastDegraded) {
          lastDegraded = stats.degraded;
          d.degraded = stats.degraded ? '1' : '0';
        }
        d.frameCount = String(frameCount);
        d.drawMs = stats.lastDrawMs.toFixed(2);
        d.frameMs = (interval ?? 0).toFixed(2);
        d.particles = String(stats.particlesDrawn);
        d.timeMs = clockMs.toFixed(1);
        d.lifeMs = scene.life.clockMs.toFixed(1);
        d.wallMs = (now - wallStart).toFixed(0);
        if (frameCount === 1) d.ready = '1'; // after the first successful draw
      }

      if (current.publish && now - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        callbacksRef.current.onSnapshot({
          stats,
          frame: summarize(intervals.values()),
          frameCount,
          timeMs: clockMs,
          buildMs: scene.frame.build.durationMs,
          tiles,
        });
      }
      flushWaiters();
    };
    raf = requestAnimationFrame(tick);

    return teardown;
  }, [host, preference]);
}
