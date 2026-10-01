/**
 * Native floating-overlay glue (Windows desktop app only; batch
 * w3-cloud-20260929-b p2). Untested in Cloud: transparency, click-through,
 * always-on-top and screen sampling need the owner's Windows machine.
 *
 * - Click-through: the overlay ignores the mouse everywhere except EVA's eye
 *   and its controls. A click-through window receives no pointer events, so a
 *   ~30 Hz cursor poll decides when to accept the mouse and also feeds gaze.
 * - Backdrop: a local 64x36 luminance grid of the primary monitor (Rust),
 *   at most ~2 Hz, paused while "Visible to recordings" is on.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import { cropGrid, type BackdropSampler, type LumaGrid } from '../visual/backdrop';

export function isNativeOverlay(): boolean {
  try { return isTauri(); } catch { return false; }
}

/** Live luminance behind the overlay; returns the last grid while paused or refreshing. */
export function nativeBackdropSampler(paused: () => boolean): BackdropSampler {
  let grid: LumaGrid | null = null;
  let pending = false;
  let last = -Infinity;
  return {
    sample(rect) {
      const now = performance.now();
      if (!pending && !paused() && now - last >= 450) {
        pending = true;
        last = now;
        invoke<{ cols: number; rows: number; data: number[] }>('w3_overlay_luma')
          .then(g => { if (g.cols > 0 && g.rows > 0 && g.data.length === g.cols * g.rows) grid = { cols: g.cols, rows: g.rows, data: Float32Array.from(g.data) }; })
          .catch(() => { /* unsupported or failed: stay with the last grid (or pure light) */ })
          .finally(() => { pending = false; });
      }
      return grid ? cropGrid(grid, rect, innerWidth, innerHeight) : null;
    },
  };
}

/** "Visible to recordings": lift (true) or restore (false) EVA's capture exclusion. */
export function setRecordable(visible: boolean): Promise<void> {
  return invoke('w3_overlay_recordable', { visible });
}

export function quitOverlay(): Promise<void> {
  try { return getCurrentWindow().close(); } catch (error) { return Promise.reject(error); }
}

/**
 * Poll the global cursor; dispatch `eva:cursor` (viewport CSS px) for gaze and
 * toggle click-through from `isHit`. Returns a stop function that restores a
 * normal (mouse-accepting) window. If the native window API is unavailable it
 * does nothing, so a native failure can never take the controls down with it.
 */
export function startPointerPolicy(isHit: (x: number, y: number) => boolean): () => void {
  let win: ReturnType<typeof getCurrentWindow>;
  try { win = getCurrentWindow(); } catch { return () => {}; }
  let origin = { x: 0, y: 0 };
  let scale = devicePixelRatio || 1;
  let ignoring: boolean | null = null;
  let busy = false;
  let stopped = false;
  const refreshFrame = () => {
    void win.outerPosition().then(p => { origin = { x: p.x, y: p.y }; }).catch(() => {});
    void win.scaleFactor().then(s => { scale = s; }).catch(() => {});
  };
  refreshFrame();
  const frameTimer = window.setInterval(refreshFrame, 2000);
  const timer = window.setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    cursorPosition()
      .then(async p => {
        const x = (p.x - origin.x) / scale;
        const y = (p.y - origin.y) / scale;
        window.dispatchEvent(new CustomEvent('eva:cursor', { detail: { x, y } }));
        const ignore = !isHit(x, y);
        if (ignore !== ignoring && !stopped) {
          ignoring = ignore;
          await win.setIgnoreCursorEvents(ignore);
        }
      })
      .catch(() => {})
      .finally(() => { busy = false; });
  }, 33);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.clearInterval(frameTimer);
    void win.setIgnoreCursorEvents(false).catch(() => {});
  };
}
