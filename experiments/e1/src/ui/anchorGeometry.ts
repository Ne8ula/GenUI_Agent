import type { NormalizedPoint } from "../core";

// Keep the whole compact anchor and its focus ring inside the work area.
export function reachableAnchor(point: NormalizedPoint, width: number, height: number): NormalizedPoint {
  const insetX = Math.min(128 / Math.max(1, width), 0.5);
  const insetY = Math.min(40 / Math.max(1, height), 0.5);
  const x = Math.max(insetX, Math.min(1 - insetX, point.x));
  let y = Math.max(insetY, Math.min(1 - insetY, point.y));
  // Reserve only the small local controls affordance, not a content column.
  if (x * width < 360 && y * height < 96) y = Math.min(120 / Math.max(1, height), 1 - insetY);
  return { x, y };
}

export function anchorPixels(point: NormalizedPoint, width: number, height: number) {
  const bounded = reachableAnchor(point, width, height);
  return { x: bounded.x * width, y: bounded.y * height };
}
