import { useState } from "react";
import type { DelayedScorePatch, E1Controller, E1Snapshot, ScoreDecision } from "../../core";
import type { RendererKind, RendererStats, SimulatedFailure } from "../render";
import { DEFAULT_POINT_COUNT, STRESS_POINT_COUNT } from "./FieldCanvas";

interface InspectorProps {
  controller: E1Controller;
  snapshot: Readonly<E1Snapshot>;
  rendererStats: RendererStats | null;
  onSetRenderer: (kind: RendererKind) => void;
  onSetCount: (count: number) => void;
  onSimulateFailure: (kind: SimulatedFailure) => void;
}

function describeDecision(decision: ScoreDecision): string {
  if (decision.accepted) return `Accepted at revision ${decision.revision}.`;
  const issues = decision.issues.map((issue) => issue.code).join(", ") || "none";
  return `Rejected (fallback: ${decision.fallback}). Issues: ${issues}.`;
}

/**
 * Hidden-by-default, keyboard-usable via native <details>/<summary>. Holds
 * the source/seed/score/event inspector and the E1 test controls (variant,
 * renderer failure simulation, delayed-patch late-delivery test). This is
 * the "clearly test mode" surface the UI task's harness rules call for.
 */
export function Inspector({
  controller,
  snapshot,
  rendererStats,
  onSetRenderer,
  onSetCount,
  onSimulateFailure,
}: InspectorProps) {
  const [pendingPatch, setPendingPatch] = useState<DelayedScorePatch | null>(null);
  const [lastDecision, setLastDecision] = useState<ScoreDecision | null>(null);
  const renderer = rendererStats?.renderer ?? "canvas2d";
  const pointCount = rendererStats?.requestedCount ?? DEFAULT_POINT_COUNT;

  return (
    <details className="e1-inspector">
      <summary>Inspector (source, score, events, tests)</summary>

      <section aria-label="Fixture and score">
        <h3>Fixture</h3>
        {snapshot.fixture ? (
          <dl className="e1-mono e1-inspector__dl">
            <div>
              <dt>Fixture</dt>
              <dd>
                {snapshot.fixture.fixtureId} r{snapshot.fixture.revision}
              </dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd>{snapshot.fixture.seed}</dd>
            </div>
            <div>
              <dt>Schema</dt>
              <dd>{snapshot.fixture.schemaVersion}</dd>
            </div>
          </dl>
        ) : (
          <p className="e1-muted">No fixture bound yet.</p>
        )}

        <h3>Score status</h3>
        <p className="e1-mono">
          {snapshot.scoreStatus.state}
          {snapshot.scoreStatus.state === "rejected" ? ` (${snapshot.scoreStatus.issueCodes.join(", ")})` : null}
        </p>
        <pre className="e1-inspector__pre">{JSON.stringify(snapshot.activeScore, null, 2)}</pre>

        <h3>Host envelope</h3>
        <pre className="e1-inspector__pre">{JSON.stringify(snapshot.host, null, 2)}</pre>
      </section>

      <section aria-label="Event trace">
        <h3>
          Event trace ({snapshot.events.length}
          {snapshot.traceDropped > 0 ? `, ${snapshot.traceDropped} dropped` : ""})
        </h3>
        <ol className="e1-inspector__events e1-mono">
          {snapshot.events
            .slice(-30)
            .reverse()
            .map((event) => (
              <li key={event.sequence}>
                #{event.sequence} {event.type} rev={event.revision} gen={event.generation}
                {event.entityId ? ` entity=${event.entityId}` : ""}
                {event.reason ? ` reason=${event.reason}` : ""}
              </li>
            ))}
        </ol>
      </section>

      <section aria-label="Renderer diagnostics">
        <h3>Renderer diagnostics</h3>
        {rendererStats ? (
          <dl className="e1-mono e1-inspector__dl">
            <div>
              <dt>Renderer</dt>
              <dd>{rendererStats.renderer}</dd>
            </div>
            <div>
              <dt>Points drawn</dt>
              <dd>{rendererStats.pointCount}</dd>
            </div>
            <div>
              <dt>Draw calls</dt>
              <dd>{rendererStats.drawCount}</dd>
            </div>
            <div>
              <dt>Last frame</dt>
              <dd>{rendererStats.lastFrameMs.toFixed(2)} ms</dd>
            </div>
            <div>
              <dt>Settled</dt>
              <dd>{String(rendererStats.settled)}</dd>
            </div>
            <div>
              <dt>Context lost</dt>
              <dd>{String(rendererStats.contextLost)}</dd>
            </div>
          </dl>
        ) : (
          <p className="e1-muted">No renderer stats yet.</p>
        )}
      </section>

      <section aria-label="Test controls">
        <h3>Test controls</h3>
        <div className="e1-inspector__row" role="group" aria-label="Renderer selection">
          <button type="button" className="e1-btn" aria-pressed={renderer === "canvas2d"} onClick={() => onSetRenderer("canvas2d")}>
            Canvas2D
          </button>
          <button type="button" className="e1-btn" aria-pressed={renderer === "webgl"} onClick={() => onSetRenderer("webgl")}>
            WebGL
          </button>
        </div>
        <div className="e1-inspector__row" role="group" aria-label="Point count">
          <button
            type="button"
            className="e1-btn"
            aria-pressed={pointCount === DEFAULT_POINT_COUNT}
            onClick={() => onSetCount(DEFAULT_POINT_COUNT)}
          >
            2,000 points
          </button>
          <button
            type="button"
            className="e1-btn"
            aria-pressed={pointCount === STRESS_POINT_COUNT}
            onClick={() => onSetCount(STRESS_POINT_COUNT)}
          >
            8,000 points (stress)
          </button>
        </div>
        <div className="e1-inspector__row" role="group" aria-label="Simulate renderer failure">
          <button type="button" className="e1-btn" onClick={() => onSimulateFailure("webgl-context-lost")}>
            Simulate WebGL context loss
          </button>
          <button type="button" className="e1-btn" onClick={() => onSimulateFailure("webgl-unavailable")}>
            Simulate WebGL unavailable
          </button>
          <button type="button" className="e1-btn" onClick={() => onSimulateFailure("canvas-error")}>
            Simulate Canvas failure
          </button>
          <button type="button" className="e1-btn" onClick={() => onSimulateFailure(null)}>
            Clear simulated failure
          </button>
        </div>
        <div className="e1-inspector__row" role="group" aria-label="Delayed patch (late-delivery) test">
          <button
            type="button"
            className="e1-btn"
            disabled={snapshot.status !== "ready"}
            onClick={() => {
              const patch = controller.createDelayedPatch();
              setPendingPatch(patch);
              setLastDecision(null);
            }}
          >
            Create delayed patch
          </button>
          <button
            type="button"
            className="e1-btn"
            disabled={!pendingPatch}
            onClick={() => {
              if (!pendingPatch) return;
              setLastDecision(controller.deliverDelayedPatch(pendingPatch));
              setPendingPatch(null);
            }}
          >
            Deliver patch now
          </button>
        </div>
        {pendingPatch ? <p className="e1-mono">Patch queued: {pendingPatch.id}</p> : null}
        {lastDecision ? <p className="e1-mono">{describeDecision(lastDecision)}</p> : null}
      </section>
    </details>
  );
}
