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
import { useCallback, useEffect, useRef } from "react";
import { DPR_CAP } from "./constants";
import { advanceRuntime, buildFrame, createAnimationRuntime, type EyeStageProps } from "./runtime";
import { drawEye } from "./render";

export type { EyeStageProps };

export function useEyeAnimation(props: EyeStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const runtimeRef = useRef(createAnimationRuntime());
  const propsRef = useRef(props);
  propsRef.current = props;

  const renderOnce = useCallback((dt: number) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const currentProps = propsRef.current;
    advanceRuntime(runtimeRef.current, currentProps, dt);
    const frame = buildFrame(runtimeRef.current, currentProps);
    drawEye(ctx, canvas.width, canvas.height, frame);
  }, []);

  // Canvas context + resize handling. Runs once per mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;
    ctxRef.current = canvas.getContext("2d");

    function resize() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, DPR_CAP);
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

  // Continuous animation loop, only while active and not reduced-motion.
  useEffect(() => {
    if (!props.active || props.reducedMotion) return undefined;
    let frameHandle = 0;
    let disposed = false;
    let last = performance.now();

    function tick(now: number) {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      renderOnce(dt);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.state, props.stance, props.intensity, props.seed, props.reducedMotion, props.active, renderOnce]);

  return { canvasRef, containerRef };
}
