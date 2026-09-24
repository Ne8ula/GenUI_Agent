import { TIME_IDS, recordAt } from "../../core";
import type { E1Controller, E1Snapshot } from "../../core";
import { FactAnchor } from "./FactAnchor";

interface InteractiveLayerProps {
  controller: E1Controller;
  snapshot: Readonly<E1Snapshot>;
}

/**
 * Independently positioned, always-present compact time/temperature anchors
 * (owner refinement, 2026-09-23): all three fixture times render at their
 * own viewport-relative position, not just the currently selected/compared
 * pair inside a bounded stage box. Selecting one is a direct click/keyboard
 * act on the anchor itself; "Compare with noon" (in the shell) links two of
 * these existing positions without recentering the composition. The wrapper
 * itself has no background and does not intercept pointer events — see
 * `.e1-interactive` in layout.css — only the anchors (and their own pin/
 * detail controls) opt back into `pointer-events: auto`.
 */
export function InteractiveLayer({ controller, snapshot }: InteractiveLayerProps) {
  const fixture = snapshot.fixture;
  if (!fixture) return null;
  const disabled = snapshot.status !== "ready";

  return (
    <div className="e1-interactive">
      {TIME_IDS.map((time) => {
        const isSelected = snapshot.selected === time;
        const isComparedOther =
          !!snapshot.comparison && (snapshot.comparison.first === time || snapshot.comparison.second === time) && !isSelected;
        const emphasis: "primary" | "secondary" | "muted" = isSelected ? "primary" : isComparedOther ? "secondary" : "muted";
        return (
          <FactAnchor
            key={time}
            time={time}
            anchor={snapshot.anchors[time]}
            record={recordAt(fixture, time)}
            emphasis={emphasis}
            isSelected={isSelected}
            isComparedOther={isComparedOther}
            disabled={disabled}
            onSelect={(t) => controller.select(t)}
            onMove={(t, point) => controller.move(t, point)}
            onPinToggle={(t, pinned) => controller.pin(t, pinned)}
          />
        );
      })}
    </div>
  );
}
