import { useEffect, useMemo, useRef, useState } from "react";
import type { E1Controller, E1Snapshot } from "../../core";
import { collectElementHitRegions, createHitRegionUpdate, e1NativeBridge, type MaterialSceneInput, type MaterialStatus } from "../../native";
import type { FieldCanvasHandle } from "../components/FieldCanvas";
import { listHitRegionElements } from "../regions";
import { EMPTY_RENDERER_STATS, INITIAL_RENDERER, isCurrentMaterialStatus, rendererStatsFromStatus, sceneFromSnapshot, type NativeRendererSettings } from "../nativeScene";

export function useNativeInteraction(controller: E1Controller, snapshot: Readonly<E1Snapshot>, enabled: boolean) {
  const [settings, setSettings] = useState<NativeRendererSettings>(INITIAL_RENDERER);
  const [status, setStatus] = useState<MaterialStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const statusRef = useRef(status);
  statusRef.current = status;
  const sessionId = useRef<string | null>(null);
  const sceneSequence = useRef(0);
  const regionSequence = useRef(0);
  const lastScene = useRef<MaterialSceneInput | null>(null);
  const acceptedScene = useRef<MaterialSceneInput | null>(null);
  const sceneFailure = useRef({ key: "", count: 0 });
  const [sceneRetry, setSceneRetry] = useState(0);
  const lastSceneKey = useRef("");
  const benchmarkNumber = useRef(0);
  const observedBenchmarkRun = useRef<string | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void e1NativeBridge.getWorkArea().then(async (metadata) => {
      sessionId.current = metadata?.controllerSessionId ?? null;
      const stop = await e1NativeBridge.onMaterialStatus((next) => {
        if (!alive || !isCurrentMaterialStatus(next, lastScene.current, sessionId.current)) return;
        setStatus(next);
        if (next.kind === "renderer-failure") {
          setNotice(next.diagnostic.message);
          if (next.diagnostic.code === "canvas-unavailable" || next.diagnostic.code === "render-error") controller.stop();
          else if (next.diagnostic.code === "webgl-unavailable" || next.diagnostic.code === "context-lost") {
            setSettings((current) => ({ ...current, kind: "canvas2d" }));
          }
        }
        const current = controller.getSnapshot();
        if (next.kind === "transition-complete" && next.stats.settled && current.revision === next.revision &&
            current.transition.id === next.transitionId && current.transition.status === "active") controller.completeTransition();
        if (next.stats.benchmark.running) observedBenchmarkRun.current = next.stats.benchmark.runId;
        if (next.stats.benchmark.runId && !next.stats.benchmark.running &&
            observedBenchmarkRun.current === next.stats.benchmark.runId) {
          setSettings((currentSettings) => currentSettings.benchmark.active &&
            currentSettings.benchmark.runId === next.stats.benchmark.runId
            ? { ...currentSettings, benchmark: { ...currentSettings.benchmark, active: false } }
            : currentSettings);
        }
      });
      if (!alive) stop();
      else { unlisten = stop; setReady(true); }
    }).catch((error: unknown) => {
      console.error("[E1] Native initialization failed", error);
      if (alive) setNotice("Native overlay could not initialize. Desktop input remains open; close this test process and relaunch.");
    });
    return () => { alive = false; unlisten?.(); };
  }, [controller, enabled]);

  useEffect(() => {
    if (snapshot.status !== "ready" || snapshot.plain || snapshot.reducedMotion || snapshot.transition.status === "interrupted") {
      setSettings((current) => current.benchmark.active
        ? { ...current, benchmark: { ...current.benchmark, active: false } } : current);
    }
  }, [snapshot.status, snapshot.plain, snapshot.reducedMotion, snapshot.transition.status]);

  useEffect(() => {
    if (!enabled || !ready) return;
    if (snapshot.status === "dismissed") {
      if (!dismissed.current) {
        dismissed.current = true;
        void e1NativeBridge.dismiss().catch((error: unknown) => console.error("[E1] Native dismissal failed", error));
      }
      return;
    }
    const projected = sceneFromSnapshot(snapshot, settings, 0);
    const key = JSON.stringify(projected);
    if (key === lastSceneKey.current) return;
    lastSceneKey.current = key;
    const scene = { ...projected, sceneSequence: ++sceneSequence.current };
    lastScene.current = scene;
    void e1NativeBridge.syncMaterialScene(scene).then((ack) => {
      if (!ack?.delivered || ack.sceneSequence !== scene.sceneSequence || ack.controllerSessionId !== sessionId.current) {
        throw new Error("Material acknowledgement does not match this publication");
      }
      if (!acceptedScene.current || scene.sceneSequence > acceptedScene.current.sceneSequence) acceptedScene.current = scene;
      if (sceneFailure.current.key === key) sceneFailure.current.count = 0;
    }).catch((error: unknown) => {
      console.error("[E1] Native scene rejected", error);
      if (lastScene.current?.sceneSequence === scene.sceneSequence && !dismissed.current) {
        // Keep accepting statuses for the last host-accepted scene. Retry the
        // latest projection once, never a stale captured user revision.
        lastScene.current = acceptedScene.current;
        lastSceneKey.current = "";
        const failures = sceneFailure.current.key === key ? sceneFailure.current.count + 1 : 1;
        sceneFailure.current = { key, count: failures };
        if (failures === 1) setSceneRetry((value) => value + 1);
      }
      setNotice("The material layer could not accept this revision. Facts and local controls remain available.");
    });
  }, [enabled, ready, settings, snapshot, sceneRetry]);

  useEffect(() => {
    if (!enabled || !ready) return;
    let frame = 0;
    let previous = "";
    let alive = true;
    let inFlight = false;
    let dirty = false;
    let failedSignature = "";
    let failures = 0;
    const publish = async () => {
      frame = 0;
      if (!alive || dismissed.current) return;
      if (inFlight) { dirty = true; return; }
      const regions = collectElementHitRegions(listHitRegionElements());
      const update = createHitRegionUpdate(0, regions);
      const signature = JSON.stringify(update);
      if (signature === previous) return;
      const sequence = ++regionSequence.current;
      inFlight = true;
      try {
        const ack = await e1NativeBridge.publishHitRegions({ ...update, sequence });
        if (!ack || ack.sequence !== sequence) throw new Error("Hit-region acknowledgement does not match this publication");
        previous = signature;
        failures = 0;
      } catch (error) {
        previous = "";
        failures = failedSignature === signature ? failures + 1 : 1;
        failedSignature = signature;
        dirty ||= failures === 1;
        console.error("[E1] Hit regions rejected", error);
        if (alive) setNotice("Native input regions could not update. Desktop input remains open.");
      } finally {
        inFlight = false;
        if (alive && dirty) { dirty = false; schedule(); }
      }
    };
    const schedule = () => { if (!frame) frame = window.setTimeout(() => { void publish(); }, 0); };
    const resize = new ResizeObserver(schedule);
    const observeRegions = () => {
      resize.disconnect();
      for (const { element } of listHitRegionElements()) resize.observe(element);
      schedule();
    };
    const mutations = new MutationObserver(observeRegions);
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "open", "hidden"] });
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    document.addEventListener("toggle", schedule, true);
    observeRegions();
    // An empty native HRGN may suspend rAF. Bootstrap input from committed DOM
    // geometry without waiting for a frame that requires that region to exist.
    clearTimeout(frame);
    frame = 0;
    void publish();
    return () => {
      alive = false; clearTimeout(frame); resize.disconnect(); mutations.disconnect();
      window.removeEventListener("resize", schedule); document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("toggle", schedule, true);
    };
  }, [enabled, ready]);

  const handle = useMemo<FieldCanvasHandle>(() => ({
    setRenderer: (kind) => setSettings((current) => ({ ...current, kind })),
    getRenderer: () => settingsRef.current.kind,
    setCount: (count) => {
      if (Number.isFinite(count) && count >= 1 && count <= 8000) {
        setSettings((current) => ({ ...current, requestedPointCount: Math.floor(count) }));
      }
    },
    getCount: () => settingsRef.current.requestedPointCount,
    getStats: () => statusRef.current ? rendererStatsFromStatus(statusRef.current) : EMPTY_RENDERER_STATS,
    simulateFailure: (simulatedFailure) => setSettings((current) => ({ ...current, simulatedFailure,
      kind: simulatedFailure === "canvas-error" ? "canvas2d" : simulatedFailure ? "webgl" : current.kind })),
    clearSimulatedFailure: () => { setSettings((current) => ({ ...current, simulatedFailure: null })); setNotice(null); },
    benchmarkStart: (durationMs = 30000) => {
      const current = controller.getSnapshot();
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 60000 || current.status !== "ready" ||
          current.plain || current.reducedMotion || current.transition.status === "interrupted") return;
      setSettings((previous) => ({ ...previous, benchmark: { runId: `benchmark-${++benchmarkNumber.current}`, active: true, durationMs } }));
    },
    benchmarkStop: () => setSettings((current) => ({ ...current, benchmark: { ...current.benchmark, active: false } })),
    benchmarkIsRunning: () => statusRef.current?.stats.benchmark.running ?? false,
    benchmarkGetSamples: () => [...(statusRef.current?.stats.benchmark.samplesMs ?? [])],
  }), [controller]);

  return { handle, stats: status ? rendererStatsFromStatus(status) : null, notice };
}
