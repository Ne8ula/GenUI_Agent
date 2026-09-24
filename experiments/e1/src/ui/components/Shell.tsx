import { useEffect, useRef, useState } from "react";
import type { E1Controller, E1Snapshot, FixtureVariant } from "../../core";
import { Header } from "./Header";
import { LocationRequest } from "./LocationRequest";
import { UnavailableNotice } from "./UnavailableNotice";
import { ControlBar } from "./ControlBar";
import { ReadingLayer } from "./ReadingLayer";
import { Inspector } from "./Inspector";
import type { RendererKind, RendererStats, SimulatedFailure } from "../render";
import { HIT_REGION_ATTR } from "../regions";

interface ShellProps {
  controller: E1Controller;
  snapshot: Readonly<E1Snapshot>;
  fallbackNotice: string | null;
  rendererStats: RendererStats | null;
  onRequest: (location: string, variant: FixtureVariant) => void;
  onSetRenderer: (kind: RendererKind) => void;
  onSetCount: (count: number) => void;
  onSimulateFailure: (kind: SimulatedFailure) => void;
}

export function Shell({ controller, snapshot, fallbackNotice, rendererStats, onRequest,
  onSetRenderer, onSetCount, onSimulateFailure }: ShellProps) {
  const [open, setOpen] = useState(snapshot.status === "idle");
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (snapshot.plain) setOpen(true); }, [snapshot.plain]);
  const close = () => {
    setOpen(false);
    menu.current?.querySelector("summary")?.focus();
  };

  return <div className="e1-shell">
    <details ref={menu} className="e1-menu" open={open}
      onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); }
      }}>
      <summary aria-label="EVA response controls" title="Response controls: Stop, Less motion, Plain answer, Dismiss"
        {...{ [HIT_REGION_ATTR]: "controls-affordance" }}>
        <span className="e1-menu__eye" aria-hidden="true" />
        <span className="e1-display">EVA</span>
        <span className="e1-menu__source">Synthetic · NYC</span>
      </summary>
      <div className="e1-menu__body" {...{ [HIT_REGION_ATTR]: "controls-panel" }}>
        <ControlBar snapshot={snapshot} onCompare={() => { controller.compare(); close(); }}
          onStop={() => controller.stop()} onToggleReducedMotion={() => controller.setReducedMotion(!snapshot.reducedMotion)}
          onTogglePlain={() => controller.setPlain(!snapshot.plain)}
          onSetRecipe={(recipe) => { controller.setRecipe(recipe); close(); }} onDismiss={() => controller.dismiss()} />
        <p className="e1-menu__keys">While focused: S stop · L less motion · P plain · Esc close/dismiss</p>
        <details open={snapshot.status === "idle"}>
          <summary>Location and fixture</summary>
          <LocationRequest status={snapshot.status} requestedLocation={snapshot.requestedLocation}
            fixtureVariant={snapshot.fixtureVariant} error={snapshot.error}
            onRequest={(location, variant) => {
              onRequest(location, variant);
              if (controller.getSnapshot().status === "ready") close();
            }} />
        </details>
        <ReadingLayer fixture={snapshot.fixture} selected={snapshot.status === "ready" ? snapshot.selected : null}
          comparison={snapshot.comparison} anchors={snapshot.anchors} forceOpen={snapshot.plain} />
        <details><summary>Source and context</summary><Header fixture={snapshot.fixture} /></details>
        {import.meta.env.DEV ? <Inspector controller={controller} snapshot={snapshot} rendererStats={rendererStats}
          onSetRenderer={onSetRenderer} onSetCount={onSetCount} onSimulateFailure={onSimulateFailure} /> : null}
      </div>
    </details>
    {fallbackNotice && snapshot.status !== "unavailable" ? <p className="e1-shell__notice" role="status" {...{ [HIT_REGION_ATTR]: "fallback-notice" }}>{fallbackNotice}</p> : null}
    {snapshot.status === "unavailable" && snapshot.error ? <div className="e1-shell__error" {...{ [HIT_REGION_ATTR]: "unavailable-notice" }}>
      <UnavailableNotice error={snapshot.error} />
    </div> : null}
  </div>;
}
