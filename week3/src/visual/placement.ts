/**
 * Where EVA sits on the screen (batch w3-cloud-20260929-b, pass p2).
 *
 * The canvas covers the whole overlay (the primary monitor natively, the
 * viewport in a browser). EVA rests at a remembered anchor, lower right by
 * default, and can be dragged. While responding, the form grows around that
 * spot; its drawing centre is pulled inward just enough to keep the form on
 * the monitor (vid-01: the response extends toward the screen centre).
 * Joy is the owner's one allowed exception and is not clamped.
 */

/** Anchor as a fraction of the overlay (0..1). */
export interface Anchor { x: number; y: number }

export const DEFAULT_ANCHOR: Anchor = { x: 0.86, y: 0.78 };
const STORAGE_KEY = "eva.w3.anchor";

/** Approximate half-extent of the drawn form, in units of the eye's display scale. */
export function formHalfExtent(energy: number): { x: number; y: number } {
  const e = energy < 0 ? 0 : energy > 1 ? 1 : energy;
  return { x: 0.8 + 0.55 * e, y: 0.45 + 0.75 * e };
}

/**
 * Drawing centre (px) for an anchor (px): the anchor itself, moved inward only
 * as far as needed for the form to stay inside `width` x `height`.
 */
export function formCenter(anchorX: number, anchorY: number, scale: number, energy: number, width: number, height: number, unclamped = false): { x: number; y: number } {
  if (unclamped) return { x: anchorX, y: anchorY };
  const half = formHalfExtent(energy);
  const clampAxis = (v: number, extent: number, size: number) => (extent * 2 >= size ? size / 2 : Math.min(size - extent, Math.max(extent, v)));
  return { x: clampAxis(anchorX, half.x * scale, width), y: clampAxis(anchorY, half.y * scale, height) };
}

/** Keep the resting eye fully on screen when placed or dragged. */
export function clampAnchor(anchor: Anchor, width: number, height: number, restScale: number): Anchor {
  const half = formHalfExtent(0);
  const mx = width > 0 ? Math.min(0.5, (half.x * restScale) / width) : 0;
  const my = height > 0 ? Math.min(0.5, (half.y * restScale) / height) : 0;
  return { x: Math.min(1 - mx, Math.max(mx, anchor.x)), y: Math.min(1 - my, Math.max(my, anchor.y)) };
}

/** Is a point (px) on the resting eye (an ellipse around its centre)? */
export function onEye(px: number, py: number, cx: number, cy: number, restScale: number): boolean {
  const half = formHalfExtent(0);
  const dx = (px - cx) / (half.x * restScale);
  const dy = (py - cy) / (half.y * restScale * 1.15);
  return dx * dx + dy * dy <= 1;
}

export function loadAnchor(): Anchor {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ANCHOR;
    const value = JSON.parse(raw) as Partial<Anchor>;
    if (typeof value.x === "number" && typeof value.y === "number" && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1) return { x: value.x, y: value.y };
  } catch { /* storage unavailable: use the default */ }
  return DEFAULT_ANCHOR;
}

export function saveAnchor(anchor: Anchor): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(anchor)); } catch { /* not persisted */ }
}
