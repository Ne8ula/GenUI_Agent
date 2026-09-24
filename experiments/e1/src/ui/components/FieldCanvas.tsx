import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { E1Controller, E1Snapshot } from "../../core";
import {
  Canvas2DBackend,
  WebGLBackend,
  PointCloudState,
  deriveLobes,
  generateFieldTargets,
  isAcceptableBenchmarkDuration,
  BENCHMARK_MAX_SAMPLES,
  type FieldBackend,
  type FieldColors,
  type RendererKind,
  type RendererStats,
  type SimulatedFailure,
} from "../render";

const FIELD_COLORS: FieldColors = { field: "#ff3b35", occlusion: "#545c60", unknown: "#a8ada9" };
const CELL_SIZE_PX = 4;
export const DEFAULT_POINT_COUNT = 2000;
export const STRESS_POINT_COUNT = 8000;
// Headroom over the authored transition.durationMs before the renderer
// forces a snap-to-target rather than waiting indefinitely for a tight
// sub-pixel convergence (DESIGN.md's "bounded 1200-2400ms" expressive
// movement — this keeps rendering close to the score's own declared time).
const SETTLE_SAFETY_MULTIPLIER = 1.4;
// Human-perceptible live-diagnostics refresh rate for the dev Inspector
// panel; unrelated to the actual (un-throttled) render loop or to
// `getStats()`, which is always current. See redrawNow()'s onStatsChange
// throttle.
const STATS_EMIT_INTERVAL_MS = 80;

export interface FieldCanvasHandle {
  setRenderer(kind: RendererKind): void;
  getRenderer(): RendererKind;
  setCount(count: number): void;
  getCount(): number;
  getStats(): RendererStats;
  simulateFailure(kind: SimulatedFailure): void;
  clearSimulatedFailure(): void;
  benchmarkStart(durationMs?: number): void;
  benchmarkStop(): void;
  benchmarkIsRunning(): boolean;
  benchmarkGetSamples(): number[];
}

interface FieldCanvasProps {
  controller: Pick<E1Controller, "completeTransition">;
  snapshot: Readonly<E1Snapshot>;
  onStatsChange?: (stats: RendererStats) => void;
  onFallbackNotice?: (message: string | null) => void;
}

function readDpr(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

/**
 * The transparent overlay has no bounded "stage" box: the field is a
 * full-window layer, and (per the native two-window contract) may even
 * render in a separate OS window from the interactive fact anchors. Both
 * this module and FactAnchor resolve geometry from `window.innerWidth`/
 * `window.innerHeight` directly rather than a shared DOM element's
 * `getBoundingClientRect()` — the same two numbers in both places, with no
 * intermediate container whose border/padding could offset one consumer
 * relative to the other, and a measurement that stays correct whether both
 * layers share one document or are split into two identically-sized native
 * windows.
 */
function readViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1, height: 1 };
  return { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) };
}

export const FieldCanvas = forwardRef<FieldCanvasHandle, FieldCanvasProps>(function FieldCanvas(
  { controller, snapshot, onStatsChange, onFallbackNotice },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const backendRef = useRef<FieldBackend | null>(null);
  const pointCloudRef = useRef(new PointCloudState());
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const transitionStartedAtRef = useRef<number>(0);
  const sizeRef = useRef({ width: 1, height: 1, dpr: readDpr() });
  const simulatedFailureRef = useRef<SimulatedFailure>(null);
  // Kept current every render (no effect needed) so the resize/DPR handler
  // below — which intentionally mounts once — can still recompute lobes from
  // the latest snapshot/pointCount instead of a stale mount-time closure.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const lastStatsEmitRef = useRef(0);
  const benchmarkRef = useRef<{ running: boolean; until: number | null; samples: number[]; warmed: boolean }>({
    running: false,
    until: null,
    samples: [],
    warmed: false,
  });
  const statsRef = useRef<RendererStats>({
    renderer: "canvas2d",
    drawCount: 0,
    pointCount: 0,
    requestedCount: DEFAULT_POINT_COUNT,
    lastFrameMs: 0,
    framesRendered: 0,
    settled: true,
    contextLost: false,
    forcedContinuous: false,
  });

  const [rendererKind, setRendererKindState] = useState<RendererKind>("canvas2d");
  const [pointCount, setPointCountState] = useState<number>(DEFAULT_POINT_COUNT);
  const pointCountRef = useRef(pointCount);
  pointCountRef.current = pointCount;
  const [failureNonce, setFailureNonce] = useState(0);

  // --- Backend lifecycle -------------------------------------------------
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const failure = simulatedFailureRef.current;
    let backend: FieldBackend;
    if (rendererKind === "webgl") {
      backend = new WebGLBackend(
        canvas,
        failure === "webgl-unavailable" ? "unavailable" : failure === "webgl-context-lost" ? "context-lost" : null,
        {
          onLost: () => {
            onFallbackNotice?.(
              "3D rendering was lost — showing the Canvas 2D field instead. Facts are unaffected.",
            );
            setRendererKindState("canvas2d");
          },
          onRestored: () => onFallbackNotice?.(null),
        },
      );
      if (backend.failed) {
        onFallbackNotice?.(
          "WebGL is unavailable in this window — showing the Canvas 2D field instead. Facts are unaffected.",
        );
        // A real (non-simulated-context-loss) construction failure never
        // gets an async webglcontextlost/onLost callback to trigger the
        // fallback — so without this, `rendererKind` would silently stay
        // "webgl" forever while nothing ever actually draws. Switch for
        // real, the same way a later context loss already does, so the
        // renderer diagnostics reflect what is actually rendering rather
        // than a kind that never produces pixels.
        setRendererKindState("canvas2d");
      }
    } else {
      backend = new Canvas2DBackend(canvas, failure === "canvas-error");
      if (backend.failed) {
        onFallbackNotice?.("Canvas rendering failed — the field is hidden. Facts remain readable below.");
      }
    }
    backendRef.current = backend;
    sizeRef.current = { ...readViewportSize(), dpr: readDpr() };
    backend.resize(sizeRef.current.width, sizeRef.current.height, sizeRef.current.dpr);
    statsRef.current = {
      ...statsRef.current,
      renderer: backend.kind,
      contextLost: backend.kind === "webgl" && backend.failed,
    };
    onStatsChange?.(statsRef.current);
    redrawNow();

    return () => {
      backend.destroy();
      backendRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererKind, failureNonce]);

  // --- Resize + DPR tracking ----------------------------------------------
  // Tracks the window's own size (see readViewportSize) rather than a nested
  // container element, and — critically — recomputes lobes/targets from the
  // new size rather than only re-running `backend.resize()` + a stale
  // redraw. Without the recompute, a resize/DPR change left the field's
  // target buffer pinned to the old pixel geometry: the anchors (positioned
  // by normalized coordinates against the live window size) would move, but
  // the field would not, visibly detaching from the relocated fact anchors
  // until an unrelated snapshot change happened to retrigger the other
  // effect.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const applySize = () => {
      sizeRef.current = { ...readViewportSize(), dpr: readDpr() };
      backendRef.current?.resize(sizeRef.current.width, sizeRef.current.height, sizeRef.current.dpr);
      // A resize/DPR change is not an authored transition — reposition
      // instantly rather than animating over the (unrelated) last
      // transition's duration.
      applyTargetsForCurrentSize(true);
    };

    window.addEventListener("resize", applySize);
    applySize();

    let dprQuery: MediaQueryList | null = null;
    const watchDpr = () => {
      dprQuery?.removeEventListener?.("change", handleDprChange);
      dprQuery = window.matchMedia(`(resolution: ${readDpr()}dppx)`);
      dprQuery.addEventListener("change", handleDprChange);
    };
    function handleDprChange() {
      applySize();
      watchDpr();
    }
    watchDpr();

    return () => {
      window.removeEventListener("resize", applySize);
      dprQuery?.removeEventListener?.("change", handleDprChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redrawNow(): void {
    const backend = backendRef.current;
    if (!backend) return;
    const { width, height, dpr } = sizeRef.current;
    backend.draw(pointCloudRef.current.getCurrent(), pointCloudRef.current.getTones(), pointCloudRef.current.count, {
      cellSizePx: CELL_SIZE_PX,
      colors: FIELD_COLORS,
      widthPx: width,
      heightPx: height,
      dpr,
    });
    // No false stats: a failed backend's draw() is a guaranteed no-op (see
    // Canvas2DBackend/WebGLBackend), so report that nothing was actually
    // rendered rather than the point cloud's nominal count/frame tally.
    const rendered = !backend.failed;
    const previous = statsRef.current;
    const settled = pointCloudRef.current.isSettled();
    statsRef.current = {
      ...previous,
      renderer: backend.kind,
      drawCount: previous.drawCount + 1,
      framesRendered: previous.framesRendered + (rendered ? 1 : 0),
      pointCount: rendered ? pointCloudRef.current.count : 0,
      requestedCount: pointCountRef.current,
      settled,
      contextLost: backend.kind === "webgl" && backend.failed,
    };
    // `getStats()` (the contracted test-harness/native-CDP surface) always
    // reads the just-updated `statsRef.current` synchronously, so it is never
    // stale. The `onStatsChange` React callback only exists to drive the
    // dev Inspector panel's live display; broadcasting it on every one of up
    // to ~360 frames/sec forces an App-level re-render at the same rate for
    // no benefit a human can perceive, and the native benchmark runner can
    // read authoritative stats directly via CDP instead. Throttle the
    // callback to a human-perceptible rate, but never suppress an actual
    // state transition (settle, renderer switch, context loss) a diagnostics
    // viewer would want to see immediately.
    const now = performance.now();
    const meaningfulChange =
      previous.renderer !== statsRef.current.renderer ||
      previous.settled !== statsRef.current.settled ||
      previous.contextLost !== statsRef.current.contextLost ||
      previous.forcedContinuous !== statsRef.current.forcedContinuous;
    if (meaningfulChange || now - lastStatsEmitRef.current >= STATS_EMIT_INTERVAL_MS) {
      lastStatsEmitRef.current = now;
      onStatsChange?.(statsRef.current);
    }
  }

  function stopLoop(): void {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameTimeRef.current = null;
  }

  function runLoop(tauMs: number, capMs: number, transitionId: string, allowComplete: boolean): void {
    stopLoop();
    transitionStartedAtRef.current = performance.now();
    const step = (now: number) => {
      const last = lastFrameTimeRef.current ?? now;
      const dt = now - last;
      lastFrameTimeRef.current = now;

      pointCloudRef.current.tick(dt, tauMs);
      redrawNow();

      const bench = benchmarkRef.current;
      if (bench.running) {
        if (!bench.warmed) {
          // Drop exactly one leading sample per run: `lastFrameTimeRef` was
          // just reset (by benchmarkStart/runLoop's own stopLoop()), so this
          // frame's `dt` is `now - now` (or a stale gap from whatever ran
          // before) — not a real steady-state frame interval — and must not
          // pollute the recorded distribution with a leading dt≈0.
          bench.warmed = true;
        } else if (bench.samples.length < BENCHMARK_MAX_SAMPLES) {
          // Resource-bounded, not the previous fixed 900-sample ring buffer
          // that silently discarded most of any run longer than a few
          // seconds at high refresh rates. A required >=30s x3-repeat
          // capture is now fully retained (see render/benchmark.ts).
          bench.samples.push(dt);
        }
        if ((bench.until !== null && now >= bench.until) || bench.samples.length >= BENCHMARK_MAX_SAMPLES) {
          bench.running = false;
          bench.until = null;
        }
      }

      const elapsed = now - transitionStartedAtRef.current;
      const settled = pointCloudRef.current.isSettled();
      const forced = benchmarkRef.current.running;
      statsRef.current = { ...statsRef.current, forcedContinuous: forced, lastFrameMs: dt };

      if (forced || (!settled && elapsed < capMs)) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      // Reaching the cap without full sub-pixel convergence still snaps to
      // the exact target so the composition never freezes mid-transition.
      if (!settled) pointCloudRef.current.snapToTarget();
      redrawNow();

      rafRef.current = null;
      onStatsChange?.(statsRef.current);
      // A native completion attempt can be superseded by renderer settings
      // before it is acknowledged. A later settle must be allowed to report it.
      const current = snapshotRef.current;
      if (allowComplete && current.transition.id === transitionId && current.transition.status === "active") {
        controller.completeTransition();
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }

  // Derives lobes/targets for the CURRENT window size (sizeRef) and either
  // snaps instantly or starts the animated settle loop. Shared by the
  // snapshot-driven effect below and the resize/DPR handler above, so both
  // paths keep the field attached to the exact same resolved geometry as
  // FactAnchor's own clamp math (both read window.innerWidth/innerHeight).
  function applyTargetsForCurrentSize(forceInstant: boolean): void {
    const current = snapshotRef.current;
    const { width, height } = sizeRef.current;
    const lobes = deriveLobes({ snapshot: current, widthPx: width, heightPx: height, totalCount: pointCountRef.current });
    const targets = generateFieldTargets(lobes);
    const suppressMotion = current.reducedMotion || current.plain || current.status !== "ready" ||
      current.transition.status === "interrupted" || forceInstant || backendRef.current?.failed;
    if (suppressMotion) {
      benchmarkRef.current.running = false;
      benchmarkRef.current.until = null;
      statsRef.current.forcedContinuous = false;
    }
    pointCloudRef.current.setTargets(targets, current.transition.status === "active" && !suppressMotion);

    if (current.transition.status === "interrupted") {
      if (forceInstant) pointCloudRef.current.snapToTarget();
      pointCloudRef.current.freeze();
      stopLoop();
      redrawNow();
      onStatsChange?.(statsRef.current);
      return;
    }

    const instant =
      forceInstant ||
      current.reducedMotion ||
      current.plain ||
      current.transition.durationMs === 0 ||
      current.transition.status !== "active" ||
      backendRef.current?.failed;

    if (instant) {
      pointCloudRef.current.snapToTarget();
      stopLoop();
      redrawNow();
      onStatsChange?.(statsRef.current);
      return;
    }

    const durationMs = current.transition.durationMs;
    const tau = Math.max(60, durationMs / 4);
    const cap = Math.max(200, durationMs * SETTLE_SAFETY_MULTIPLIER);
    runLoop(tau, cap, current.transition.id, true);
  }

  // --- Recompute lobes/targets whenever relevant snapshot fields change --
  useEffect(() => {
    applyTargetsForCurrentSize(false);
    return () => stopLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snapshot.status,
    snapshot.fixture,
    snapshot.selected,
    snapshot.comparison,
    snapshot.anchors,
    snapshot.recipe,
    snapshot.reducedMotion,
    snapshot.plain,
    snapshot.transition,
    pointCount,
  ]);

  useEffect(() => () => stopLoop(), []);

  // --- Imperative test/dev handle -----------------------------------------
  useImperativeHandle(
    ref,
    (): FieldCanvasHandle => ({
      setRenderer: (kind) => setRendererKindState(kind),
      getRenderer: () => rendererKind,
      setCount: (count) => {
        if (Number.isFinite(count) && count >= 1 && count <= STRESS_POINT_COUNT) setPointCountState(Math.floor(count));
      },
      getCount: () => pointCount,
      getStats: () => ({ ...statsRef.current }),
      simulateFailure: (kind) => {
        simulatedFailureRef.current = kind;
        if (kind === "canvas-error") setRendererKindState("canvas2d");
        else if (kind === "webgl-context-lost" || kind === "webgl-unavailable") setRendererKindState("webgl");
        setFailureNonce((n) => n + 1);
      },
      clearSimulatedFailure: () => {
        simulatedFailureRef.current = null;
        setFailureNonce((n) => n + 1);
      },
      benchmarkStart: (durationMs = 30000) => {
        const current = snapshotRef.current;
        if (!isAcceptableBenchmarkDuration(durationMs) || current.status !== "ready" || current.plain ||
            current.reducedMotion || current.transition.status === "interrupted" || backendRef.current?.failed) return;
        benchmarkRef.current = {
          running: true,
          until: performance.now() + durationMs,
          samples: [],
          warmed: false,
        };
        // Force a clean first tick (see the leading-dt0 warmup skip in
        // runLoop's step()) even if a settle loop happened to already be
        // running from an unrelated in-flight transition.
        lastFrameTimeRef.current = null;
        if (rafRef.current === null) {
          const tau = Math.max(60, current.transition.durationMs / 4 || 200);
          // Benchmark mode ignores the settle cap (forced continuous frames);
          // the cap value here only matters if forcing stops mid-run.
          runLoop(tau, tau * SETTLE_SAFETY_MULTIPLIER * 4, current.transition.id, false);
        }
      },
      benchmarkStop: () => {
        benchmarkRef.current.running = false;
        benchmarkRef.current.until = null;
        statsRef.current.forcedContinuous = false;
        if (snapshotRef.current.transition.status !== "active") stopLoop();
        onStatsChange?.(statsRef.current);
      },
      benchmarkIsRunning: () => benchmarkRef.current.running,
      benchmarkGetSamples: () => [...benchmarkRef.current.samples],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rendererKind, pointCount],
  );

  // Plain answer and dismissal are genuinely effect-free (no lobes are even
  // derived — see deriveLobes' early `snapshot.plain` return — and dismissal
  // has no fixture to draw). Expose that as a normal DOM `hidden` attribute
  // (not merely "drew zero points to an otherwise-visible canvas") so it is
  // assertable the same way as any other hidden content, independent of
  // reading back canvas pixels.
  const effectSuppressed = snapshot.plain || snapshot.status === "dismissed";

  return (
    <div ref={containerRef} className="e1-field-canvas" aria-hidden="true" hidden={effectSuppressed}>
      {/* A <canvas> element's context type is fixed on first use, so the
          renderer swap (or a simulated-failure re-creation) must mount a
          fresh DOM node rather than reuse one that already has a 2D/WebGL
          context. */}
      <canvas key={`${rendererKind}-${failureNonce}`} ref={canvasRef} />
    </div>
  );
});
