import { useEffect, useMemo, useRef, useState } from "react";
import { E1Controller } from "../core";
import { getE1RuntimeInfo } from "../native";
import "./tokens.css";
import "./layout.css";
import { Stage } from "./components/Stage";
import { InteractiveLayer } from "./components/InteractiveLayer";
import { Shell } from "./components/Shell";
import type { FieldCanvasHandle } from "./components/FieldCanvas";
import type { RendererStats } from "./render";
import { useE1Snapshot } from "./hooks/useE1Snapshot";
import { useReducedMotionPreference } from "./hooks/useReducedMotionPreference";
import { useNativeInteraction } from "./hooks/useNativeInteraction";
import { installE1TestHarness } from "./testHarness";
import { NativeMaterial } from "./NativeMaterial";
import { EMPTY_RENDERER_STATS } from "./nativeScene";

const runtime = getE1RuntimeInfo();

function InteractionApp() {
  const controllerRef = useRef<E1Controller | null>(null);
  if (!controllerRef.current) controllerRef.current = new E1Controller();
  const controller = controllerRef.current;
  const snapshot = useE1Snapshot(controller);
  const osReducedMotion = useReducedMotionPreference();
  const field = useRef<FieldCanvasHandle | null>(null);
  const [rendererStats, setRendererStats] = useState<RendererStats | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const native = useNativeInteraction(controller, snapshot, runtime.native);

  useEffect(() => {
    // OS changes can quiet this response, never silently re-enable its motion.
    if (osReducedMotion) controller.setReducedMotion(true);
  }, [controller, osReducedMotion]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === "Escape") {
        event.preventDefault();
        const disclosure = target?.closest<HTMLDetailsElement>("details[open]");
        if (disclosure) { disclosure.open = false; disclosure.querySelector("summary")?.focus(); }
        else controller.dismiss();
        return;
      }
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); controller.stop(); }
      if (event.key.toLowerCase() === "l") { event.preventDefault(); controller.setReducedMotion(true); }
      if (event.key.toLowerCase() === "p") { event.preventDefault(); controller.setPlain(!controller.getSnapshot().plain); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [controller]);

  const browserHandle = useMemo<FieldCanvasHandle>(() => ({
    setRenderer: (kind) => field.current?.setRenderer(kind),
    getRenderer: () => field.current?.getRenderer() ?? "canvas2d",
    setCount: (count) => field.current?.setCount(count),
    getCount: () => field.current?.getCount() ?? 2000,
    getStats: () => field.current?.getStats() ?? EMPTY_RENDERER_STATS,
    simulateFailure: (kind) => field.current?.simulateFailure(kind),
    clearSimulatedFailure: () => { field.current?.clearSimulatedFailure(); setFallbackNotice(null); },
    benchmarkStart: (duration) => field.current?.benchmarkStart(duration),
    benchmarkStop: () => field.current?.benchmarkStop(),
    benchmarkIsRunning: () => field.current?.benchmarkIsRunning() ?? false,
    benchmarkGetSamples: () => field.current?.benchmarkGetSamples() ?? [],
  }), []);
  const handle = runtime.native ? native.handle : browserHandle;

  useEffect(() => {
    if (import.meta.env.DEV) return installE1TestHarness(controller, handle);
    return undefined;
  }, [controller, handle]);

  if (snapshot.status === "dismissed") return null;
  return <>
    {!runtime.native ? <Stage controller={controller} snapshot={snapshot} fieldCanvasRef={field}
      onStatsChange={setRendererStats} onFallbackNotice={setFallbackNotice} /> : null}
    <InteractiveLayer controller={controller} snapshot={snapshot} />
    <Shell controller={controller} snapshot={snapshot}
      fallbackNotice={runtime.native ? native.notice : fallbackNotice}
      rendererStats={runtime.native ? native.stats : rendererStats}
      onRequest={(location, variant) => controller.request(location, variant)}
      onSetRenderer={(kind) => handle.setRenderer(kind)} onSetCount={(count) => handle.setCount(count)}
      onSimulateFailure={(kind) => kind ? handle.simulateFailure(kind) : handle.clearSimulatedFailure()} />
  </>;
}

export default function App() {
  return <div className="e1-root">
    {runtime.layer === "material" ? <NativeMaterial /> : <InteractionApp />}
  </div>;
}
