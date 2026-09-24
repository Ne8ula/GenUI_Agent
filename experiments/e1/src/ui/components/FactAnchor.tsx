import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRef } from "react";
import type { AnchorState, WeatherRecord, WeatherTimeId } from "../../core";
import { formatCloud, formatMeasurement, TIME_LABELS } from "../format";
import { HIT_REGION_ATTR } from "../regions";
import { anchorPixels, reachableAnchor } from "../anchorGeometry";
import { useViewportSize } from "../hooks/useViewportSize";

interface FactAnchorProps {
  time: WeatherTimeId;
  anchor: AnchorState;
  record: WeatherRecord;
  emphasis: "primary" | "secondary" | "muted";
  isSelected: boolean;
  isComparedOther: boolean;
  disabled: boolean;
  onSelect: (time: WeatherTimeId) => void;
  onMove: (time: WeatherTimeId, point: { x: number; y: number }) => void;
  onPinToggle: (time: WeatherTimeId, pinned: boolean) => void;
}

const ARROW_STEP = 0.015;
const ARROW_STEP_LARGE = 0.05;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Viewport-relative normalized coordinates. There is no bounded "stage" box
 * to measure any more (DESIGN.md's transparent-overlay refinement): the
 * field and the anchors both resolve position from the same two numbers,
 * `window.innerWidth`/`window.innerHeight`, which stay correct whether this
 * layer shares one document with the field or (per the native two-window
 * contract) renders in its own identically-sized window.
 */
function toNormalized(clientX: number, clientY: number): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0.5, y: 0.5 };
  return reachableAnchor({
    x: clamp01(clientX / Math.max(1, window.innerWidth)),
    y: clamp01(clientY / Math.max(1, window.innerHeight)),
  }, window.innerWidth, window.innerHeight);
}

export function FactAnchor({
  time,
  anchor,
  record,
  emphasis,
  isSelected,
  isComparedOther,
  disabled,
  onSelect,
  onMove,
  onPinToggle,
}: FactAnchorProps) {
  const draggingRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const viewport = useViewportSize();
  const position = anchorPixels(anchor, viewport.width, viewport.height);
  const reachable = reachableAnchor(anchor, viewport.width, viewport.height);
  const moveWithinBounds = (point: { x: number; y: number }) =>
    onMove(time, reachableAnchor(point, viewport.width, viewport.height));

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (disabled || event.button !== 0) return;
    dragOffset.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    onSelect(time);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!draggingRef.current || disabled) return;
    onMove(time, toNormalized(event.clientX - dragOffset.current.x, event.clientY - dragOffset.current.y));
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (disabled) return;
    const step = event.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
    switch (event.key) {
      case "ArrowLeft":
        moveWithinBounds({ x: reachable.x - step, y: reachable.y });
        event.preventDefault();
        break;
      case "ArrowRight":
        moveWithinBounds({ x: reachable.x + step, y: reachable.y });
        event.preventDefault();
        break;
      case "ArrowUp":
        moveWithinBounds({ x: reachable.x, y: reachable.y - step });
        event.preventDefault();
        break;
      case "ArrowDown":
        moveWithinBounds({ x: reachable.x, y: reachable.y + step });
        event.preventDefault();
        break;
      case "Enter":
      case " ":
        onSelect(time);
        event.preventDefault();
        break;
      default:
        break;
    }
  }

  // Selection/comparison read as geometry (border weight/color, the marker
  // dot) rather than an "SELECTED"/"COMPARED" word sitting in the compact
  // foreground text — the owner's correction against a text-dominant
  // composition. The same state is still exposed to assistive tech via the
  // handle's accessible name and a visually-hidden status line, and via
  // `aria-pressed` on the pin toggle, so nothing here is a sighted-only cue.
  const stateWords: string[] = [];
  if (isSelected) stateWords.push("selected");
  if (isComparedOther) stateWords.push("compared");
  if (anchor.pinned) stateWords.push("pinned");
  if (anchor.userMoved) stateWords.push("moved");

  return (
    <div
      className={`e1-anchor e1-anchor--${emphasis}`}
      style={{ left: position.x, top: position.y }}
      data-time={time}
      data-detail-side={reachable.y > 0.65 ? "above" : "below"}
      {...{ [HIT_REGION_ATTR]: `fact-anchor:${time}` }}
    >
      <button
        type="button"
        className="e1-anchor__handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        onClick={() => onSelect(time)}
        aria-pressed={isSelected}
        disabled={disabled}
        aria-label={`${TIME_LABELS[time]}, ${time}. ${formatMeasurement(record.temperature)}.${
          stateWords.length > 0 ? ` Currently ${stateWords.join(", ")}.` : ""
        } Press Enter to select this time, arrow keys to move it, or drag with a pointer.`}
      >
        <span className="e1-anchor__time e1-mono">{time}</span>
        <span className="e1-anchor__temp e1-display">{formatMeasurement(record.temperature)}</span>
      </button>
      <button
        type="button"
        className="e1-anchor__pin"
        aria-pressed={anchor.pinned}
        disabled={disabled}
        aria-label={`${anchor.pinned ? "Unpin" : "Pin"} ${TIME_LABELS[time]}, ${time}`}
        title={anchor.pinned ? "Unpin" : "Pin"}
        onClick={() => onPinToggle(time, !anchor.pinned)}
      >
        <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">
          <path d="M8 1.2 L9.6 6 L14 7.4 L9.8 9.6 L9 14.8 L8 11.6 L7 14.8 L6.2 9.6 L2 7.4 L6.4 6 Z" />
        </svg>
      </button>
      <details className="e1-anchor__more">
        <summary aria-label={`More detail for ${TIME_LABELS[time]}, ${time}`}>···</summary>
        {/* Absolutely positioned outside the anchor root's own layout box
            (so it can pop out without enlarging the compact pill's own flow
            size) — meaning the anchor root's rect alone would NOT cover this
            popout once opened. Marked with its own hit-region ID so a future
            native hit-region publish (triggered after this <details>
            toggles, a normal "layout changed" event) includes both rects
            while it is open, and neither while it is closed (a `hidden`/
            zero-size element is dropped by listHitRegionElements' callers,
            same as elsewhere in this file). */}
        <dl className="e1-anchor__details e1-mono" {...{ [HIT_REGION_ATTR]: `fact-anchor-detail:${time}` }}>
          <div>
            <dt>Cloud</dt>
            <dd>{formatCloud(record.cloudCover)}</dd>
          </div>
          <div>
            <dt>Rain prob.</dt>
            <dd>{formatMeasurement(record.precipitationProbability)}</dd>
          </div>
          <div>
            <dt>Wind</dt>
            <dd>{formatMeasurement(record.wind)}</dd>
          </div>
        </dl>
      </details>
      {stateWords.length > 0 ? <span className="e1-visually-hidden">{stateWords.join(", ")}</span> : null}
    </div>
  );
}
