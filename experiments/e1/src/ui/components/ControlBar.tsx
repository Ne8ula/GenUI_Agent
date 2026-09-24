import { useEffect, useRef } from "react";
import type { E1Snapshot, RecipeId } from "../../core";
import { HIT_REGION_ATTR } from "../regions";

interface ControlBarProps {
  snapshot: Readonly<E1Snapshot>;
  onCompare: () => void;
  onStop: () => void;
  onToggleReducedMotion: () => void;
  onTogglePlain: () => void;
  onSetRecipe: (recipe: RecipeId) => void;
  onDismiss: () => void;
}

/**
 * Small, discoverable control affordance (owner refinement, 2026-09-23) —
 * not a full-width button wall. Time selection is a direct act on the
 * fact anchors themselves (see InteractiveLayer/FactAnchor); this bar keeps
 * only the essential, always-reachable Stop/Less motion/Plain answer/Dismiss
 * controls, with Compare and the comparison recipe tucked behind progressive
 * disclosure since they are a secondary, less frequent intervention.
 */
export function ControlBar({
  snapshot,
  onCompare,
  onStop,
  onToggleReducedMotion,
  onTogglePlain,
  onSetRecipe,
  onDismiss,
}: ControlBarProps) {
  const disabled = snapshot.status !== "ready";
  const more = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (snapshot.plain && more.current && !more.current.contains(document.activeElement)) more.current.open = false;
  }, [snapshot.plain]);

  return (
    <div className="e1-controls" {...{ [HIT_REGION_ATTR]: "control-bar" }}>
      <div className="e1-controls__essential" role="group" aria-label="Response controls">
        <button type="button" className="e1-btn e1-btn--protected" disabled={disabled} onClick={onStop}>
          Stop
        </button>
        <button type="button" className="e1-btn" aria-pressed={snapshot.reducedMotion} onClick={onToggleReducedMotion}>
          Less motion
        </button>
        <button type="button" className="e1-btn" aria-pressed={snapshot.plain} onClick={onTogglePlain}>
          Plain answer
        </button>
        <button
          type="button"
          className="e1-btn e1-btn--protected"
          disabled={snapshot.status === "dismissed" || snapshot.status === "idle"}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>

      <details ref={more} className="e1-controls__more">
        <summary>Compare &amp; recipe</summary>
        <div className="e1-controls__group" role="group" aria-label="Comparison">
          <button
            type="button"
            className="e1-btn"
            disabled={disabled}
            aria-pressed={Boolean(snapshot.comparison)}
            onClick={onCompare}
          >
            Compare with noon
          </button>
        </div>
        <div className="e1-controls__group" role="group" aria-label="Comparison recipe">
          <button
            type="button"
            className="e1-btn"
            disabled={disabled}
            aria-pressed={snapshot.recipe === "part-and-relate"}
            onClick={() => onSetRecipe("part-and-relate")}
          >
            Part &amp; relate
          </button>
          <button
            type="button"
            className="e1-btn"
            disabled={disabled}
            aria-pressed={snapshot.recipe === "withdraw-and-reanchor"}
            onClick={() => onSetRecipe("withdraw-and-reanchor")}
          >
            Withdraw &amp; reanchor
          </button>
        </div>
      </details>
    </div>
  );
}
