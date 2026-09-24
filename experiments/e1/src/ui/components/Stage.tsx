import { useEffect, useState, type Ref } from "react";
import type { E1Controller, E1Snapshot, WeatherTimeId } from "../../core";
import { FieldCanvas, type FieldCanvasHandle } from "./FieldCanvas";
import type { RendererStats } from "../render";
import { anchorPixels } from "../anchorGeometry";
import { E1SignalEye } from "../eye/E1SignalEye";

interface StageProps {
  controller: Pick<E1Controller, "completeTransition">;
  snapshot: Readonly<E1Snapshot>;
  fieldCanvasRef: Ref<FieldCanvasHandle>;
  onStatsChange: (stats: RendererStats) => void;
  onFallbackNotice: (message: string | null) => void;
}

function otherComparedTime(snapshot: Readonly<E1Snapshot>): WeatherTimeId | null {
  const comparison = snapshot.comparison;
  if (!comparison) return null;
  return snapshot.selected === comparison.first ? comparison.second : comparison.first;
}

function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(() =>
    typeof window === "undefined" ? { width: 1, height: 1 } : { width: window.innerWidth, height: window.innerHeight },
  );
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return size;
}

/**
 * The non-interactive "material" layer (owner refinement, 2026-09-23): the
 * illustrative dither field and the comparison connector, full-window,
 * `pointer-events: none` throughout, no bordered/backgrounded "stage" box.
 * In the native two-window contract this is the window that never receives
 * input; in a composed browser preview it renders directly beneath the
 * InteractiveLayer in one document. It carries no click-through logic of its
 * own — it simply never listens for pointer events.
 *
 * Wholly `aria-hidden`: it is illustration only. Any user-facing text (a
 * renderer-failure notice, for instance) belongs in the interactive layer,
 * not here, or assistive tech would never see it.
 */
export function Stage({ controller, snapshot, fieldCanvasRef, onStatsChange, onFallbackNotice }: StageProps) {
  const size = useViewportSize();
  const fixture = snapshot.fixture;
  const otherTime = otherComparedTime(snapshot);
  const primary = anchorPixels(snapshot.anchors[snapshot.selected], size.width, size.height);
  const secondary = otherTime ? anchorPixels(snapshot.anchors[otherTime], size.width, size.height) : null;
  const eyeWidth = size.width < 600 ? 168 : 224;
  const eyeHeight = size.width < 600 ? 96 : 128;
  const eyeMargin = size.width < 600 ? 16 : 24;
  const eyeTarget = snapshot.status === "ready" ? {
    x: (primary.x - eyeMargin - eyeWidth / 2) / Math.max(1, size.width),
    y: (primary.y - (size.height - eyeMargin - eyeHeight / 2)) / Math.max(1, size.height),
  } : null;
  const eyeVisible = !snapshot.plain && snapshot.status !== "dismissed";
  // The eye self-settles after one bounded cue. Natural field settlement must
  // not freeze it mid-blink; an explicit interruption does cancel immediately.
  const eyeAllowed = snapshot.status === "ready" && snapshot.transition.status !== "interrupted" &&
    !snapshot.reducedMotion && !snapshot.plain;

  return (
    <div className="e1-material" aria-hidden="true">
      <FieldCanvas
        ref={fieldCanvasRef}
        controller={controller}
        snapshot={snapshot}
        onStatsChange={onStatsChange}
        onFallbackNotice={onFallbackNotice}
      />
      {fixture && secondary && snapshot.status === "ready" && !snapshot.plain ? (
        <svg
          className="e1-link"
          viewBox={`0 0 ${Math.max(1, size.width)} ${Math.max(1, size.height)}`}
          preserveAspectRatio="none"
        >
          <line
            x1={primary.x}
            y1={primary.y}
            x2={secondary.x}
            y2={secondary.y}
          />
        </svg>
      ) : null}
      {eyeVisible ? <div className="e1-eye-presence" style={{
        position: "absolute", left: eyeMargin, bottom: eyeMargin, width: eyeWidth, height: eyeHeight, pointerEvents: "none",
      }}>
        <E1SignalEye target={eyeTarget} active={eyeAllowed} reducedMotion={snapshot.reducedMotion} />
      </div> : null}
    </div>
  );
}
