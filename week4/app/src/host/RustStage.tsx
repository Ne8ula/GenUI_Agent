import { useEffect, useRef, useState } from 'react';
import { loadRust } from '../render/rustLoader.ts';
import type { RustInstance } from '../render/rustLoader.ts';
import { createRingBuffer, summarize } from './frameStats.ts';
import type { StageProps } from './Stage.tsx';

type Props = Omit<StageProps, 'scene'>;
interface RustStats { sceneId: string; vertices: number; triangles: number; segments: number; objects: number; tiles: number; draws: number; cpuBufferBytes: number; uploadedBytes: number; gpuAllocatedBytes: number; renderTargetBytes: number }
interface CaptureHook { step(ms: number): Promise<void>; loseContext(): void; restoreContext(): void; inventory(): unknown[] }
const reason = (error: unknown) => error instanceof Error ? error.message : String(error);

export function RustStage(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const clock = useRef({ key: '', time: 0 });
  const [initializing, setInitializing] = useState(true);
  useEffect(() => { live.current = props; });
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let stopped = false;
    let lost = false;
    let renderer: RustInstance | null = null;
    let module: Awaited<ReturnType<typeof loadRust>> | null = null;
    let raf = 0;
    let lastNow: number | null = null;
    let lastPublish = -Infinity;
    let steps = 0;
    let count = 0;
    let waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    const session = clock.current;
    if (session.key !== props.sceneKey) { session.key = props.sceneKey; session.time = props.startMs; }
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Seed-33 Paris café constructed from procedural Rust geometry; fixed camera; rear-facing walker moves left and away');
    container.appendChild(canvas);
    const intervals = createRingBuffer(120);
    const flush = (error?: Error) => {
      const pending = waiters; waiters = [];
      for (const waiter of pending) { if (error) waiter.reject(error); else waiter.resolve(); }
    };
    const fail = (error: unknown) => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      delete canvas.dataset.ready;
      canvas.remove();
      renderer?.dispose();
      renderer?.lose_context();
      renderer?.free();
      renderer = null;
      setInitializing(false);
      live.current.onUnavailable(reason(error));
      live.current.onSnapshot({ stats: null, frame: null, frameCount: 0, timeMs: session.time, buildMs: props.info.buildMs, tiles: { shown: 0, authored: 22 } });
      flush(new Error(reason(error)));
    };
    const tick = (now: number) => {
      if (stopped || !renderer || !module) return;
      raf = requestAnimationFrame(tick);
      if (document.hidden || lost) { lastNow = null; return; }
      const settings = live.current;
      const interval = lastNow === null ? 0 : now - lastNow;
      lastNow = now;
      if (interval > 0) intervals.push(interval);
      const manual = settings.fixture && settings.manualClock;
      const dt = manual ? steps : settings.paused ? 0 : Math.min(interval, 250);
      if (manual) steps = 0;
      const previousTime = session.time;
      session.time = Math.min(3_600_000, session.time + dt);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      let width = Math.max(1, Math.round(container.clientWidth * dpr));
      let height = Math.max(1, Math.round(container.clientHeight * dpr));
      const scale = Math.min(1, 4096 / width, 4096 / height, Math.sqrt(8_388_608 / (width * height)));
      width = Math.max(1, Math.floor(width * scale)); height = Math.max(1, Math.floor(height * scale));
      const began = performance.now();
      try {
        if (!renderer.render(session.time, settings.info.buildMs, settings.reducedMotion, settings.showTiles, width, height)) {
          session.time = previousTime; delete canvas.dataset.ready; lastNow = null;
          flush(new Error('Frame was not drawn because the Rust context is unavailable')); return;
        }
        const stats = JSON.parse(renderer.stats()) as RustStats;
        const elapsed = performance.now() - began;
        count += 1;
        if (count === 1) { setInitializing(false); settings.onUnavailable(null); }
        Object.assign(canvas.dataset, {
          ready: '1', assetsReady: '1', backend: 'webgl2', renderer: 'rust-wasm', sceneId: stats.sceneId,
          widthPx: String(width), heightPx: String(height), effectiveDpr: String(dpr * scale),
          look: 'seed33', seed: String(settings.info.seed), density: String(settings.info.density), facing: 'away',
          buildMs: String(settings.info.buildMs), timeMs: session.time.toFixed(2), lifeMs: session.time.toFixed(2),
          paused: settings.paused ? '1' : '0', reduced: settings.reducedMotion ? '1' : '0',
          manualClock: manual ? '1' : '0', tiles: String(stats.tiles), tilesAuthored: '22',
          triangles: String(stats.triangles), segments: String(stats.segments), objects: String(stats.objects),
          vertices: String(stats.vertices), gpuFrames: String(stats.draws), particles: '0', frameCount: String(count), frameMs: interval.toFixed(3),
          drawMs: elapsed.toFixed(3), cpuBufferBytes: String(stats.cpuBufferBytes), uploadedBytes: String(stats.uploadedBytes),
          gpuAllocatedBytes: String(stats.gpuAllocatedBytes), renderTargetBytes: String(stats.renderTargetBytes), wasmBytes: String(module.memory.buffer.byteLength),
          degraded: '0', detail: canvas.dataset.detail || renderer.device(),
        });
        if (settings.publish && now - lastPublish > 250) {
          lastPublish = now;
          settings.onSnapshot({
            stats: { backend: 'webgl2', lastDrawMs: elapsed, particlesDrawn: 0, degraded: false, detail: canvas.dataset.detail ?? null, assetsReady: true },
            frame: summarize(intervals.values()), frameCount: count, timeMs: session.time, buildMs: settings.info.buildMs,
            tiles: { shown: stats.tiles, authored: 22 },
          });
        }
        flush();
      } catch (error) { session.time = previousTime; fail(error); }
    };
    const onLost = (event: Event) => {
      event.preventDefault(); lost = true; lastNow = null; delete canvas.dataset.ready; canvas.dataset.degraded = '1';
      // Invalidate lost GL handles before restoration, while deletion is a safe no-op.
      renderer?.dispose();
      steps = 0;
      flush(new Error('Rust WebGL2 context lost'));
      live.current.onUnavailable('Rust WebGL2 context lost; awaiting restoration (no fallback)');
    };
    const onRestored = () => {
      if (stopped || !module) return;
      try {
        const previous = renderer;
        renderer = null;
        previous?.dispose(); previous?.free();
        renderer = new module.Renderer(canvas, live.current.info.seed, live.current.info.density);
        lost = false; count = 0; lastNow = null;
      } catch (error) { fail(error); }
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    const hook: CaptureHook = {
      step: (ms) => new Promise((resolve, reject) => {
        if (stopped || lost) { reject(new Error('Rust renderer is unavailable')); return; }
        if (waiters.length > 0) { reject(new Error('Await the pending manual step before requesting another')); return; }
        steps = Math.min(1000, steps + Math.min(1000, Math.max(0, Number.isFinite(ms) ? ms : 0)));
        waiters.push({ resolve, reject });
      }),
      loseContext: () => renderer?.lose_context(),
      restoreContext: () => renderer?.restore_context(),
      inventory: () => renderer ? JSON.parse(renderer.inventory()) as unknown[] : [],
    };
    const fixtureWindow = window as unknown as { __evaFixture?: CaptureHook };
    setInitializing(true);
    if (props.preference === 'canvas2d') {
      fail('Canvas2D is not implemented for this Rust reconstruction. Select Auto or WebGL2; no raster fallback.');
    } else {
      void loadRust().then((loaded) => {
        if (stopped) return;
        module = loaded;
        renderer = new loaded.Renderer(canvas, props.info.seed, props.info.density);
        if (props.fixture && props.manualClock) fixtureWindow.__evaFixture = hook;
        raf = requestAnimationFrame(tick);
      }).catch(fail);
    }
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (fixtureWindow.__evaFixture === hook) delete fixtureWindow.__evaFixture;
      renderer?.dispose(); renderer?.lose_context(); renderer?.free(); renderer = null;
      canvas.remove();
      flush(new Error('Rust renderer was unmounted'));
    };
  }, [props.preference, props.sceneKey]);
  return <div className="stage" style={{ backgroundColor: '#0e0603' }}>
    <div className="canvas-host" ref={host} />
    {props.unavailable ? <p className="stage-message" role="alert">Rendering unavailable: {props.unavailable}</p>
      : initializing ? <p className="stage-message" role="status">Initializing Rust/WASM renderer…</p> : null}
  </div>;
}
