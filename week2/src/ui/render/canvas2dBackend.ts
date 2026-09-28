import type { DrawOptions, FieldBackend } from "./types";
import { cellGeometry, cellStart } from "./cellGeometry";

export class Canvas2DBackend implements FieldBackend {
  readonly kind = "canvas2d" as const;
  failed = false;

  private ctx: CanvasRenderingContext2D | null;

  constructor(private readonly canvas: HTMLCanvasElement, simulateFailure: boolean) {
    if (simulateFailure) {
      this.ctx = null;
      this.failed = true;
      return;
    }
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) this.failed = true;
  }

  resize(widthPx: number, heightPx: number, dpr: number): void {
    const backingWidth = Math.max(1, Math.round(widthPx * dpr));
    const backingHeight = Math.max(1, Math.round(heightPx * dpr));
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
  }

  draw(positions: Float32Array, tones: Uint8Array, count: number, options: DrawOptions): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { cellSizePx, colors, dpr } = options;
    const { pitch: cellPx, fill: fillPx, inset } = cellGeometry(cellSizePx, dpr);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Batch by tone: one fillStyle + one Path2D + one fill() per tone group,
    // rather than per-point state changes, which matters at the 8,000-point
    // stress load.
    const fieldPath = new Path2D();
    const occlusionPath = new Path2D();
    const unknownPath = new Path2D();
    for (let i = 0; i < count; i += 1) {
      const qx = cellStart(positions[i * 2], dpr, cellPx, inset);
      const qy = cellStart(positions[i * 2 + 1], dpr, cellPx, inset);
      const path = tones[i] === 1 ? occlusionPath : tones[i] === 2 ? unknownPath : fieldPath;
      path.rect(qx, qy, fillPx, fillPx);
    }
    ctx.fillStyle = colors.field;
    ctx.fill(fieldPath);
    ctx.fillStyle = colors.occlusion;
    ctx.fill(occlusionPath);
    ctx.fillStyle = colors.unknown;
    ctx.fill(unknownPath);
  }

  destroy(): void {
    this.ctx = null;
  }
}
