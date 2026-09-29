/**
 * EyeStage: the hero sculptural eye, and nothing else. No dashboard, no
 * chrome, no controls -- those stay owned by the main app/controller
 * (week3/DESIGN.md#4). This component renders one full-bleed transparent
 * canvas -- no stage: EVA floats over the user's desktop as light (batch
 * w3-cloud-20260929-b) -- and wires it to the pure animation runtime via
 * useEyeAnimation.
 *
 * Dependencies: React only. The canvas drawing path is Canvas2D, bounded
 * CPU work (no WebGL/wgpu), per the project's GPU quarantine.
 */
import type { CSSProperties } from "react";
import { useEyeAnimation, type EyeStageProps } from "./useEyeAnimation";

export type { EyeStageProps } from "./useEyeAnimation";
export type { TurnState, Stance } from "./grammar";

const stageStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: "100%",
  background: "transparent",
  display: "block",
  overflow: "hidden",
};

const canvasStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "block",
  width: "100%",
  height: "100%",
};

export function EyeStage(props: EyeStageProps) {
  const { canvasRef, containerRef } = useEyeAnimation(props);

  return (
    <div
      ref={containerRef}
      className="eva-eye-stage"
      style={stageStyle}
      role="img"
      aria-label={describeState(props)}
    >
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
}

function describeState(props: EyeStageProps): string {
  if (!props.active) return "EVA's eye, session inactive";
  if (props.state === "unavailable") return "EVA's eye, currently unavailable";
  const stanceLabel = props.stance.replace(/_/g, " ");
  return `EVA's eye, ${props.state}, ${stanceLabel} expression`;
}

export default EyeStage;
