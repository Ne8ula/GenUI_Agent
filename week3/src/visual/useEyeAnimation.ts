/**
 * React glue between the pure runtime (runtime.ts) and a <canvas>. Owns the
 * only DOM-facing concerns: context acquisition, ResizeObserver-driven
 * backing-store sizing capped at DPR_CAP, the requestAnimationFrame loop,
 * and cleanup of all three on unmount/mode change.
 *
 * Prop changes (state/stance/intensity/seed) are deliberately *not* in the
 * rAF-loop effect's dependency array: they are read from a ref inside the
 * running loop so the loop itself, and therefore `runtime.timeSec` and every
 * spring's velocity, is never restarted by a retarget
 * (week3/DESIGN.md#6: "don't reset animation clock").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DPR_CAP } from "./constants";
import { advanceRuntime, buildFrame, createAnimationRuntime, type EyeStageProps } from "./runtime";
import { drawEye } from "./render";
import { BACKDROP_SAMPLE_INTERVAL_MS, smoothLuma, type LumaGrid } from "./backdrop";
import { createEyeMotion, pointEye, restEye, stepEyeMotion } from './eye-interaction';

export type { EyeStageProps };

export function useEyeAnimation(props: EyeStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [failed, setFailed] = useState(false);
  const runtimeRef = useRef<ReturnType<typeof createAnimationRuntime> | null>(null);
  runtimeRef.current ??= createAnimationRuntime();
  const motionRef = useRef(createEyeMotion());
  const frameCount = useRef(0);
  const propsRef = useRef(props);
  propsRef.current = props;
  // Luminance behind the canvas: sampled at a low rate, smoothed every frame.
  // Last drawn eye centre (CSS px, viewport space); gaze is measured from here.
  const eyeCentreRef = useRef<{ x: number; y: number } | null>(null);
  const reportedRef = useRef({ x: NaN, y: NaN, scale: NaN });
  const backdropRef = useRef<{ target: LumaGrid | null; current: LumaGrid | null; sampledAt: number }>({ target: null, current: null, sampledAt: -Infinity });

  const renderOnce = useCallback((dt: number) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const currentProps = propsRef.current;
    const drawStart = performance.now();
    try {
      advanceRuntime(runtimeRef.current!, currentProps, dt);
      const frame = buildFrame(runtimeRef.current!, currentProps);
      const interaction = stepEyeMotion(motionRef.current, currentProps.active ? dt : 0, frame.timeSec, currentProps.reducedMotion);
      const backdrop = backdropRef.current;
      if (currentProps.backdrop && (dt === 0 || drawStart - backdrop.sampledAt >= BACKDROP_SAMPLE_INTERVAL_MS)) {
        const rect = canvas.getBoundingClientRect();
        backdrop.target = currentProps.backdrop.sample({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }) ?? backdrop.target;
        backdrop.sampledAt = drawStart;
      }
      backdrop.current = currentProps.backdrop ? smoothLuma(backdrop.current, backdrop.target, dt) : null;
      if (import.meta.env.DEV && location.search.includes('fixture')) canvas.dataset.eyePose = JSON.stringify(interaction);
      const rect = canvas.getBoundingClientRect();
      const ratio = rect.width > 0 ? canvas.width / rect.width : 1;
      // Same on-screen size as the approved p1 presence area: min(45vh, 600px).
      const placement = currentProps.anchor
        ? { anchorX: currentProps.anchor.x * canvas.width, anchorY: currentProps.anchor.y * canvas.height, sizeBasis: Math.max(220, Math.min(innerHeight * 0.45, 600)) * ratio }
        : null;
      const layout = drawEye(ctx, canvas.width, canvas.height, frame, interaction, backdrop.current, placement);
      const centre = { x: rect.left + layout.cx / ratio, y: rect.top + layout.cy / ratio };
      eyeCentreRef.current = centre;
      const reported = reportedRef.current;
      const scale = layout.scale / ratio;
      if (currentProps.onLayout && (Math.abs(centre.x - reported.x) > 0.5 || Math.abs(centre.y - reported.y) > 0.5 || Math.abs(scale - reported.scale) > 0.5 || Number.isNaN(reported.x))) {
        reportedRef.current = { x: centre.x, y: centre.y, scale };
        currentProps.onLayout({ x: centre.x, y: centre.y, scale, restScale: layout.restScale / ratio });
      }
      if (import.meta.env.DEV && location.search.includes('fixture')) {
        canvas.dataset.frameCount = String(++frameCount.current);
        canvas.dataset.drawMs = String(performance.now() - drawStart);
      }
    } catch {
      setFailed(true);
    }
  }, []);

  // Canvas context + resize handling. Runs once per mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    ctxRef.current = canvas.getContext("2d");
    if (!ctxRef.current) { setFailed(true); return; }

    function resize() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, DPR_CAP, 1600 / Math.max(1, rect.width), 1000 / Math.max(1, rect.height));
      const nextWidth = Math.max(1, Math.round(rect.width * ratio));
      const nextHeight = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      renderOnce(0);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("orientationchange", resize);

    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", resize);
      ctxRef.current = null;
    };
  }, [renderOnce]);

  useEffect(() => {
    const look = (clientX: number, clientY: number) => {
      if (!propsRef.current.active || propsRef.current.reducedMotion) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centre = eyeCentreRef.current ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      pointEye(motionRef.current,
        (clientX - centre.x) / (innerWidth * .32) * .145,
        -(clientY - centre.y) / (innerHeight * .28) * .075);
    };
    const track = (event: PointerEvent) => look(event.clientX, event.clientY);
    // A click-through native overlay receives no pointer events; the native poll dispatches these instead.
    const nativeCursor = (event: Event) => { const d = (event as CustomEvent<{ x: number; y: number }>).detail; if (d) look(d.x, d.y); };
    const rest = () => restEye(motionRef.current);
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) rest(); };
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('eva:cursor', nativeCursor);
    window.addEventListener('pointerout', leave);
    window.addEventListener('blur', rest);
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('eva:cursor', nativeCursor);
      window.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', rest);
    };
  }, []);

  // Continuous animation loop, only while active and not reduced-motion.
  useEffect(() => {
    if (!props.active || props.reducedMotion) return undefined;
    let frameHandle = 0;
    let disposed = false;
    let last = performance.now();
    let lastRendered = last;
    let accumulated = 0;

    function tick(now: number) {
      if (disposed) return;
      accumulated += Math.max(0, (now - last) / 1000);
      last = now;
      // Match the accepted Week 1 draw cap; avoid unbounded CPU work on 144Hz displays.
      if (!document.hidden && accumulated >= 1 / 45) {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastRendered) / 1000));
        accumulated %= 1 / 45;
        lastRendered = now;
        renderOnce(dt);
      }
      frameHandle = requestAnimationFrame(tick);
    }

    frameHandle = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameHandle);
    };
    // Intentionally excludes state/stance/intensity/seed: those retarget the
    // running loop via propsRef rather than restarting it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.active, props.reducedMotion, renderOnce]);

  // Static/frozen redraw path: fires once whenever a relevant prop changes
  // while the continuous loop above is not running (reducedMotion, or
  // active === false). This keeps the reduced-motion composition legible
  // and up to date without ever animating it.
  useEffect(() => {
    if (props.active && !props.reducedMotion) return;
    renderOnce(0);
    // The material still follows what is behind a static eye (a window moved under it).
    if (!props.backdrop) return undefined;
    const follow = window.setInterval(() => renderOnce(0), BACKDROP_SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(follow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.state, props.stance, props.intensity, props.seed, props.reducedMotion, props.active, props.backdrop, props.anchor, renderOnce]);

  if (failed) throw new Error('Eye rendering unavailable');
  return { canvasRef, containerRef };
}
