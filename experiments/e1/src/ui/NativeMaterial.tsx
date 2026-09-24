import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { E1Controller } from "../core";
import { e1NativeBridge, type MaterialDiagnostic, type MaterialScene, type MaterialStatus } from "../native";
import { Stage } from "./components/Stage";
import type { FieldCanvasHandle } from "./components/FieldCanvas";
import { snapshotFromScene } from "./nativeScene";

const EMPTY = new E1Controller().getSnapshot();

export function NativeMaterial() {
  const [scene, setScene] = useState<MaterialScene | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const field = useRef<FieldCanvasHandle | null>(null);
  const lastSent = useRef(0);
  const lastReportClock = useRef(0);
  const lastBenchmark = useRef<string | null>(null);
  const lastFailure = useRef<string | null>(null);
  const previousRunning = useRef(false);

  const report = useCallback((kind: MaterialStatus["kind"], diagnostic?: MaterialDiagnostic) => {
    const current = sceneRef.current;
    const handle = field.current;
    if (!current || !handle) return;
    const stats = handle.getStats();
    const running = handle.benchmarkIsRunning();
    // Strict ordering even when stats and completion share a coarse clock tick.
    // Frame measurements come from rAF samples, not this diagnostic ordering clock.
    lastReportClock.current = Math.max(performance.timeOrigin + performance.now(), lastReportClock.current + 0.01);
    const base = {
      schemaVersion: "e1.material-status/1" as const,
      controllerSessionId: current.controllerSessionId, sceneSequence: current.sceneSequence,
      responseId: current.responseId, revision: current.revision, transitionId: current.transition.id,
      // Keep ordering across material-WebView reloads, not just one page's clock.
      monotonicMs: lastReportClock.current,
      stats: {
        renderer: stats.renderer, drawCount: stats.drawCount, pointCount: stats.pointCount,
        requestedPointCount: stats.requestedCount, lastFrameMs: stats.lastFrameMs,
        framesRendered: stats.framesRendered, settled: stats.settled,
        contextLost: stats.contextLost, forcedContinuous: stats.forcedContinuous,
        benchmark: {
          runId: current.renderer.benchmark.runId, running,
          // Full samples travel only when a bounded run ends, never every frame.
          samplesMs: running ? [] : handle.benchmarkGetSamples().slice(0, 18000),
        },
      },
    };
    const status: MaterialStatus = kind === "renderer-failure"
      ? { ...base, kind, diagnostic: diagnostic ?? { code: "render-error", message: "Material rendering failed." } }
      : { ...base, kind };
    return e1NativeBridge.reportMaterialStatus(status).catch(() => {
      // Main can supersede an in-flight status; the host rejects its identity.
    });
  }, []);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    void e1NativeBridge.onMaterialScene((next) => { if (alive) setScene(next); })
      .then((stop) => { if (alive) unlisten = stop; else stop(); })
      .catch((error: unknown) => console.error("[E1] Material scene subscription failed", error));
    return () => { alive = false; unlisten?.(); };
  }, []);

  const visualKey = scene ? JSON.stringify({ ...scene, renderer: undefined, sceneSequence: undefined, controllerSessionId: undefined }) : "empty";
  // Renderer controls and telemetry cannot restart an unchanged authored transition.
  const snapshot = useMemo(() => scene ? snapshotFromScene(scene) : EMPTY, [visualKey]);
  const completion = useMemo(() => ({
    completeTransition: () => {
      const current = sceneRef.current;
      if (!current || current.revision !== snapshot.revision || current.transition.id !== snapshot.transition.id ||
          current.transition.status !== "active" || !field.current?.getStats().settled) return false;
      report("transition-complete");
      return true;
    },
  }), [snapshot.revision, snapshot.transition.id, report]);

  useEffect(() => {
    if (!scene || !field.current) return;
    const handle = field.current;
    handle.setRenderer(scene.renderer.kind);
    handle.setCount(scene.renderer.requestedPointCount);
    const failure = scene.renderer.simulatedFailure;
    if (failure !== lastFailure.current) {
      if (failure) handle.simulateFailure(failure); else handle.clearSimulatedFailure();
      lastFailure.current = failure;
    }
    const request = scene.renderer.benchmark;
    const allowed = scene.status === "ready" && !scene.plain && !scene.reducedMotion && scene.transition.status !== "interrupted";
    let cancelled = false;
    // Native hides stale material on a controller reload. A hidden WebView
    // may suspend rAF, so readiness must not wait for a frame before showing it.
    const timer = window.setTimeout(() => {
      void (async () => {
        await report("scene-applied");
        if (cancelled) return;
        const live = field.current;
        if (!live) return;
        if (!request.active || !allowed) live.benchmarkStop();
        else if (request.runId !== lastBenchmark.current) {
          lastBenchmark.current = request.runId;
          live.benchmarkStart(request.durationMs ?? 30000);
        }
        previousRunning.current = live.benchmarkIsRunning();
        await report("stats");
      })();
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [scene, report]);

  const onStats = useCallback(() => {
    const now = performance.now();
    const running = field.current?.benchmarkIsRunning() ?? false;
    const justFinished = previousRunning.current && !running;
    previousRunning.current = running;
    if (justFinished || now - lastSent.current >= 160) {
      lastSent.current = now;
      report("stats");
    }
  }, [report]);

  const onFailure = useCallback((notice: string | null) => {
    if (!notice) return;
    const code = notice.startsWith("Canvas") ? "canvas-unavailable" : "webgl-unavailable";
    report("renderer-failure", { code, message: notice.slice(0, 240) });
  }, [report]);

  return <Stage controller={completion} snapshot={snapshot} fieldCanvasRef={field} onStatsChange={onStats} onFallbackNotice={onFailure} />;
}
