import type { E1Controller, E1Snapshot } from "../core";
import type { FieldCanvasHandle } from "./components/FieldCanvas";
import type { RendererKind, RendererStats, SimulatedFailure } from "./render";

export interface E1TestHarness {
  controller: E1Controller;
  getSnapshot: () => Readonly<E1Snapshot>;
  setRenderer: (kind: RendererKind) => void;
  getRenderer: () => RendererKind;
  setCount: (count: number) => void;
  getCount: () => number;
  getStats: () => RendererStats;
  simulateRendererFailure: (kind: SimulatedFailure) => void;
  clearSimulatedFailure: () => void;
  benchmark: {
    /** Forces continuous bounded rAF frames for measurement; normal on-demand
     * rendering (which stops once settled) resumes automatically after
     * `durationMs`, or immediately on `stop()`. */
    start: (durationMs?: number) => void;
    stop: () => void;
    isRunning: () => boolean;
    getSamples: () => number[];
  };
}

declare global {
  interface Window {
    __E1_TEST__?: E1TestHarness;
  }
}

/**
 * Dev/test-mode-only global surface for the native benchmark runner and any
 * automated exercise of the renderer comparison. Never installed in a
 * production build (`import.meta.env.DEV` gate lives in App.tsx, not here).
 */
export function installE1TestHarness(controller: E1Controller, handle: FieldCanvasHandle): () => void {
  const harness: E1TestHarness = {
    controller,
    getSnapshot: () => controller.getSnapshot(),
    setRenderer: (kind) => handle.setRenderer(kind),
    getRenderer: () => handle.getRenderer(),
    setCount: (count) => handle.setCount(count),
    getCount: () => handle.getCount(),
    getStats: () => handle.getStats(),
    simulateRendererFailure: (kind) => handle.simulateFailure(kind),
    clearSimulatedFailure: () => handle.clearSimulatedFailure(),
    benchmark: {
      start: (durationMs) => handle.benchmarkStart(durationMs),
      stop: () => handle.benchmarkStop(),
      isRunning: () => handle.benchmarkIsRunning(),
      getSamples: () => handle.benchmarkGetSamples(),
    },
  };
  window.__E1_TEST__ = harness;
  return () => {
    if (window.__E1_TEST__ === harness) delete window.__E1_TEST__;
  };
}
