// Prototype look 'data' (?look=data): live values as abstract marks at the frame's edges, after Ryoji Ikeda's data-verse / test pattern.
// No words. Every mark is a real value at this moment; a value that is unknown or absent has no mark.
import '@fontsource/ibm-plex-mono/500.css';
import { bitsOf, fixed, headingDegrees } from './data-marks.ts';
import type { LightingState } from './point-field.ts';
import { TUNNEL, type AstralPhase } from './types.ts';

export type DataStage = 'void' | 'tunnel' | 'arriving' | 'room' | 'dissolving';

export interface DataFrame {
  /** Time since the previous frame, ms. */
  frameMs: number;
  stage: DataStage;
  /** Camera position and view direction, world frame. */
  viewer: { x: number; y: number; z: number; dirX: number; dirZ: number };
  /** The eye's position, its glow (0..1) and the phase it is showing. */
  eye: { x: number; y: number; z: number; glow: number; phase: AstralPhase };
  /** The viewer's z along the tunnel's axis (the room is at 0, the mouth at TUNNEL.length), while in the tunnel or arriving. */
  axisZ: number | null;
  /** The room's lighting, while a room is shown; lamp is null when the room has no lamp. */
  lighting: { mood: LightingState['mood']; lamp: boolean | null } | null;
  /** cloud.count of the cloud the field is showing; null before any. */
  points: number | null;
}

export interface DataLayer {
  update(frame: DataFrame): void;
  resize(): void;
  dispose(): void;
}

const STAGES: readonly DataStage[] = ['void', 'tunnel', 'arriving', 'room', 'dissolving'];
const PHASES: readonly AstralPhase[] = ['idle', 'listening', 'thinking', 'speaking', 'unavailable'];
const MOODS: readonly LightingState['mood'][] = ['liminal', 'afternoon', 'night', 'dark'];
const RED = '#ff3b33';     // the eye's phosphor
const WHITE = '#ffffff';
const HISTORY = 120;       // frame times kept, one bar each
const FRAME_SCALE_MS = 50; // a bar's full height; longer frames reach the top
const COUNT_BITS = 24;

export function createDataLayer(host: HTMLElement): DataLayer {
  const canvas = document.createElement('canvas');
  canvas.className = 'astral-data';
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const history = new Float32Array(HISTORY);
  let written = 0, alpha = 1, s = 1;

  const resize = () => {
    // native resolution, uncapped: the marks are 1 px rules and must stay razor sharp
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(host.clientWidth * ratio);
    canvas.height = Math.round(host.clientHeight * ratio);
    s = canvas.height / 1440;
  };
  resize();
  void document.fonts?.load('500 12px "IBM Plex Mono"');

  const px = (v: number) => Math.max(1, Math.round(v * s));
  const rect = (x: number, y: number, w: number, h: number) => ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  const square = (x: number, y: number, size: number, solid: boolean) => {
    if (solid) { rect(x, y, size, size); return; }
    rect(x, y, size, 1); rect(x, y + size - 1, size, 1); rect(x, y, 1, size); rect(x + size - 1, y, 1, size);
  };
  const text = (value: string | null, x: number, y: number, align: CanvasTextAlign) => {
    if (value === null) return;
    ctx.textAlign = align;
    ctx.fillText(value, Math.round(x), Math.round(y));
  };

  return {
    resize,
    update(f) {
      history[written % HISTORY] = f.frameMs;
      written++;
      // strongest in the void and the tunnel; in the room it recedes
      alpha += ((f.stage === 'room' ? 0.7 : 1) - alpha) * (1 - Math.exp(-f.frameMs / 1500));

      const W = canvas.width, H = canvas.height, M = px(56), lh = px(17), q = px(7), gap = px(6);
      ctx.clearRect(0, 0, W, H);
      ctx.font = `500 ${px(12)}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = 'top';
      const cw = ctx.measureText('0').width;
      // each corner group sits on its own black plate: invisible on the void, and in a lit room the marks still read
      const pad = px(14), ch = (n: number) => Math.ceil(cw * n);
      ctx.fillStyle = '#000';
      const tlRight = f.axisZ !== null ? M + STAGES.length * (q + gap) + px(28) + px(480) + px(16) + ch(6) : M + Math.max(STAGES.length * (q + gap), f.lighting ? MOODS.length * (q + gap) + px(18) + q : 0);
      rect(M - pad, M - pad - px(6), tlRight - M + 2 * pad, (f.lighting ? q + px(14) + q : q) + 2 * pad + px(6));
      rect(W - M - HISTORY * px(2) - pad, M - pad, HISTORY * px(2) + 2 * pad, lh + px(8) + px(26) + (f.points === null ? 0 : px(20) + px(18) + px(8) + lh) + 2 * pad);
      rect(M - pad, H - M - 3 * lh - pad, ch(7) + px(28) + px(360) + px(16) + ch(5) + 2 * pad, 3 * lh + 2 * pad);
      const brLeft = W - M - ch(7) - px(28) - px(200) - px(16) - ch(4);
      rect(brLeft - pad, H - M - 3 * lh - px(22) - pad, W - M - brLeft + 2 * pad, 3 * lh + px(22) + 2 * pad);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = WHITE;

      // top left: where in the arrival the viewer is; then how far down the tunnel's axis; below, the room's lighting
      STAGES.forEach((stage, i) => square(M + i * (q + gap), M, q, stage === f.stage));
      if (f.axisZ !== null) {
        const x0 = M + STAGES.length * (q + gap) + px(28), span = px(480), y = M + Math.floor(q / 2);
        const at = (z: number) => x0 + Math.round(((TUNNEL.length - z) / TUNNEL.length) * span);
        rect(x0, y, span + 1, 1);
        for (let m = 0; m <= TUNNEL.length; m += 5) { const t = px(m % 10 === 0 ? 5 : 2); rect(at(m), y - t, 1, t); }
        if (f.axisZ >= 0 && f.axisZ <= TUNNEL.length) rect(at(f.axisZ), y - px(6), 1, px(13));
        ctx.textBaseline = 'middle';
        text(fixed(f.axisZ, 2, 2, true), x0 + span + px(16), y, 'left');
        ctx.textBaseline = 'top';
      }
      if (f.lighting) {
        const y = M + q + px(14);
        MOODS.forEach((mood, i) => square(M + i * (q + gap), y, q, mood === f.lighting!.mood));
        if (f.lighting.lamp !== null) square(M + MOODS.length * (q + gap) + px(18), y, q, f.lighting.lamp);
      }

      // top right: frame time, the last HISTORY frames as bars; under it the cloud's point count, its bits and its digits
      const R = W - M;
      text(fixed(f.frameMs, 3, 1), R, M, 'right');
      const stripTop = M + lh + px(8), stripH = px(26), pitch = px(2), shown = Math.min(written, HISTORY);
      ctx.globalAlpha = alpha * 0.35;
      rect(R - HISTORY * pitch, stripTop + stripH - Math.round((1000 / 60 / FRAME_SCALE_MS) * stripH), HISTORY * pitch, 1);   // the 60 Hz budget
      ctx.globalAlpha = alpha * 0.8;
      for (let i = 0; i < shown; i++) {
        const ms = history[(written - shown + i) % HISTORY]!, h = Math.max(1, Math.round((Math.min(ms, FRAME_SCALE_MS) / FRAME_SCALE_MS) * stripH));
        rect(R - (shown - i) * pitch, stripTop + stripH - h, 1, h);
      }
      ctx.globalAlpha = alpha;
      const bits = f.points === null ? null : bitsOf(f.points, COUNT_BITS);
      if (bits) {
        const top = stripTop + stripH + px(20), barH = px(18), bp = px(4);
        bits.forEach((bit, i) => { const h = bit ? barH : px(3); rect(R - (COUNT_BITS - i) * bp, top + barH - h, px(2), h); });
        text(fixed(f.points!, 8, 0), R, top + barH + px(8), 'right');
      }

      // bottom left: the viewer, its position and its heading on a 360-degree rule
      const v = f.viewer, rows = [v.x, v.y, v.z], baseY = H - M - rows.length * lh;
      rows.forEach((value, i) => text(fixed(value, 3, 2, true), M, baseY + i * lh, 'left'));
      const heading = headingDegrees(v.dirX, v.dirZ);
      if (heading !== null) {
        const x0 = M + Math.ceil(cw * 7) + px(28), span = px(360), y = baseY + Math.round(1.5 * lh);
        rect(x0, y, span + 1, 1);
        for (let d = 0; d <= 360; d += 10) { const t = px(d % 90 === 0 ? 6 : 2); rect(x0 + Math.round((d / 360) * span), y - t, 1, t); }
        rect(x0 + Math.round((heading / 360) * span), y - px(6), 1, px(13));
        ctx.textBaseline = 'middle';
        text(fixed(heading, 3, 1), x0 + span + px(16), y, 'left');
        ctx.textBaseline = 'top';
      }

      // bottom right, in the eye's red: the eye, its position, how strongly it lights the room, and its phase
      ctx.fillStyle = RED;
      const e = f.eye, eyeRows = [e.x, e.y, e.z], eyeY = H - M - eyeRows.length * lh;
      eyeRows.forEach((value, i) => text(fixed(value, 3, 2, true), R, eyeY + i * lh, 'right'));
      PHASES.forEach((phase, i) => square(R - (PHASES.length - i) * (q + gap) + gap, eyeY - px(22), q, phase === e.phase));
      const x1 = R - Math.ceil(cw * 7) - px(28), span = px(200), x0 = x1 - span, y = eyeY + Math.round(1.5 * lh);
      rect(x0, y, span + 1, 1);
      for (let t = 0; t <= 10; t++) { const tk = px(t % 5 === 0 ? 6 : 2); rect(x0 + Math.round((t / 10) * span), y - tk, 1, tk); }
      if (Number.isFinite(e.glow)) {
        rect(x0, y + px(3), Math.round(Math.min(1, Math.max(0, e.glow)) * span), px(3));
        ctx.textBaseline = 'middle';
        text(fixed(e.glow, 1, 2), x0 - px(16), y, 'right');
      }
      ctx.globalAlpha = 1;
    },
    dispose() { canvas.remove(); },
  };
}
