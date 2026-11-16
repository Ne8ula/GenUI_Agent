/// <reference types="vite/client" />
// The inspected hero's marks: corner brackets on its box as projected, and beside them a short column of its real values. No words,
// no labels, no units: the same face, digits and 1 px rules as the 'data' look (data-layer.ts), drawn with or without it.
// Needs only the hero's box and the camera, so it works over the points and over the painted (splat) room alike.
import '@fontsource/ibm-plex-mono/500.css';
import { Vector3, type Camera } from 'three';
import { fixed } from './data-marks.ts';
import { INSPECT } from './inspect.ts';
import type { RoomHero } from './types.ts';

export interface InspectMarks {
  /** Once per frame, after the camera has moved. hero: the one inspected, or null; its marks fade out on their own. */
  update(hero: RoomHero | null, camera: Camera, dt: number): void;
  resize(): void;
  dispose(): void;
}

const FADE = 0.15;    // seconds per e-fold
const GLIDE = 0.06;   // the brackets follow the box this softly: smooth, never late enough to read as lag

export function createInspectMarks(host: HTMLElement): InspectMarks {
  const canvas = document.createElement('canvas');
  canvas.className = 'astral-data';
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let s = 1, alpha = 0, shown: RoomHero | null = null, box: number[] | null = null;
  const v = new Vector3(), eye = new Vector3();

  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(host.clientWidth * ratio);
    canvas.height = Math.round(host.clientHeight * ratio);
    s = canvas.height / 1440;
    box = null;
  };
  resize();
  void document.fonts?.load('500 12px "IBM Plex Mono"');
  const px = (n: number) => Math.max(1, Math.round(n * s));

  /**
   * The box's extent on screen, canvas pixels: [x0, y0, x1, y1]. Edges that pass behind the viewer are cut where they cross a plane just
   * in front, so a box the viewer stands over or beside still gets its true visible extent. Null if it is wholly behind.
   */
  const corners = Array.from({ length: 8 }, () => new Vector3()), cut = new Vector3();
  function onScreen(h: RoomHero, camera: Camera): number[] | null {
    const W = canvas.width, H = canvas.height, NEAR = -0.05;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (p: Vector3) => {
      v.copy(p).applyMatrix4(camera.projectionMatrix);
      const x = (v.x * 0.5 + 0.5) * W, y = (0.5 - v.y * 0.5) * H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    };
    corners.forEach((p, c) => p.set(c & 1 ? h.max[0] : h.min[0], c & 2 ? h.max[1] : h.min[1], c & 4 ? h.max[2] : h.min[2]).applyMatrix4(camera.matrixWorldInverse));
    for (const p of corners) if (p.z <= NEAR) add(p);
    for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) {
      if (a & bit) continue;
      const p = corners[a]!, q = corners[a | bit]!;
      if ((p.z <= NEAR) === (q.z <= NEAR)) continue;
      add(cut.lerpVectors(p, q, (NEAR - p.z) / (q.z - p.z)));
    }
    return x0 === Infinity ? null : [x0, y0, x1, y1];
  }

  // a 1 px white stroke with a 1 px dark edge, so it reads over a lit room without a plate
  const rule = (x: number, y: number, w: number, h: number) => {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
  };
  const text = (value: string, x: number, y: number, align: CanvasTextAlign) => {
    ctx.textAlign = align;
    ctx.strokeText(value, Math.round(x), Math.round(y));
    ctx.fillText(value, Math.round(x), Math.round(y));
  };

  return {
    resize,
    update(hero, camera, dt) {
      // development only: capture scripts read the real view to aim at a hero; absent from a production build
      if (import.meta.env.DEV) (window as unknown as { __astralCamera?: Camera }).__astralCamera = camera;
      if (hero && hero !== shown) { shown = hero; box = null; }
      alpha += ((hero ? 1 : 0) - alpha) * (1 - Math.exp(-Math.max(0, dt) / FADE));
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      if (!shown || alpha < 0.01) { if (!hero) { shown = null; alpha = 0; } return; }
      const target = onScreen(shown, camera);
      if (!target) return;
      // clamp to the frame, then glide
      const M = px(24);
      const t = [Math.max(M, target[0]!), Math.max(M, target[1]!), Math.min(W - M, target[2]!), Math.min(H - M, target[3]!)];
      if (t[2]! - t[0]! < px(8) || t[3]! - t[1]! < px(8)) return;   // off the frame's edge
      const g = 1 - Math.exp(-Math.max(0, dt) / GLIDE);
      box = box ? box.map((b, k) => b + (t[k]! - b) * g) : t;
      const [x0, y0, x1, y1] = box.map(Math.round) as [number, number, number, number];

      ctx.globalAlpha = alpha;
      // corner brackets
      const L = Math.max(px(10), Math.min(px(28), Math.round(Math.min(x1 - x0, y1 - y0) * 0.2)));
      rule(x0, y0, L, 1); rule(x0, y0, 1, L);
      rule(x1 - L, y0, L, 1); rule(x1 - 1, y0, 1, L);
      rule(x0, y1 - 1, L, 1); rule(x0, y1 - L, 1, L);
      rule(x1 - L, y1 - 1, L, 1); rule(x1 - 1, y1 - L, 1, L);

      // the column: size (width, height, depth), centre (x, y, z), its point count when the room gives one, and the live distance
      const size = [0, 1, 2].map(a => shown!.max[a] - shown!.min[a]), centre = [0, 1, 2].map(a => (shown!.max[a] + shown!.min[a]) / 2);
      camera.getWorldPosition(eye);
      const distance = Math.hypot(eye.x - centre[0]!, eye.y - centre[1]!, eye.z - centre[2]!);
      const rows = [size.map(n => fixed(n, 2, 2)).join(' '), centre.map(n => fixed(n, 3, 2, true)).join(' ')];
      if (shown.count !== undefined && Number.isSafeInteger(shown.count) && shown.count >= 0) rows.push(fixed(shown.count, 8, 0)!);
      const lastRow = fixed(distance, 3, 2)!;
      ctx.font = `500 ${px(12)}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = 'top';
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#fff';
      const lh = px(17), gap = px(14), span = px(120);
      const colW = Math.max(...rows.map(r => ctx.measureText(r).width), ctx.measureText(lastRow).width + px(12) + span);
      const colH = (rows.length + 1) * lh + px(6);
      const right = x1 + gap + colW <= W - M;   // beside the box, on whichever side has room
      const cx = right ? x1 + gap : Math.max(M, x0 - gap - colW);
      const cy = Math.min(Math.max(M, y0), H - M - colH);
      rows.forEach((r, i) => { ctx.fillStyle = '#fff'; text(r, cx, cy + i * lh, 'left'); });
      const dy = cy + rows.length * lh + px(6);
      ctx.fillStyle = '#fff';
      text(lastRow, cx, dy, 'left');
      // the distance on a rule from 0 to the reach at which looking counts, a tick a metre
      const rx = cx + Math.ceil(ctx.measureText(lastRow).width) + px(12), ry = dy + Math.round(lh / 2) - 1;
      rule(rx, ry, span + 1, 1);
      for (let m = 0; m <= INSPECT.reach; m++) rule(rx + Math.round((m / INSPECT.reach) * span), ry - px(m % 6 === 0 ? 5 : 2), 1, px(m % 6 === 0 ? 5 : 2));
      if (distance <= INSPECT.reach) rule(rx + Math.round((distance / INSPECT.reach) * span), ry - px(6), 1, px(13));
      ctx.globalAlpha = 1;
    },
    dispose() { canvas.remove(); },
  };
}
