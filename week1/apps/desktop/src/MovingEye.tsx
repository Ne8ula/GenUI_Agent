import { useLayoutEffect, useRef, type RefObject } from "react";
import { SignalEye, type EyeState } from "./SignalEye";
import { SomaticFrame } from "./SomaticFrame";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { nativeRuntime } from "./runtime";

/** One live canvas follows a layout anchor; docking never replaces the eye. */
export function MovingEye({ anchor, docked, state, quiet, energy }: {
  anchor: RefObject<HTMLDivElement | null>; docked: boolean;
  state: EyeState; quiet: boolean; energy: RefObject<number>;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const motion = useRef<Animation | null>(null);
  const last = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const enabled = useRef(!quiet); enabled.current = !quiet;
  const relocate = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const element = surface.current!;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const measure = () => {
      if (!anchor.current || !element.offsetParent) return;
      const rect = anchor.current.getBoundingClientRect();
      const parent = element.offsetParent.getBoundingClientRect();
      const next = { left: rect.left-parent.left, top: rect.top-parent.top, width: rect.width, height: rect.height };
      const still = media.matches || !enabled.current;
      if (Object.keys(next).every(key => Math.abs(next[key as keyof typeof next]-last.current[key as keyof typeof next]) < .5)) {
        if (still) { motion.current?.cancel(); motion.current = null; }
        return;
      }
      const previous = element.getBoundingClientRect();
      const existed = last.current.width > 0;
      motion.current?.cancel(); motion.current = null;
      Object.assign(element.style, { left: `${next.left}px`, top: `${next.top}px`, width: `${next.width}px`, height: `${next.height}px`, visibility: "visible" });
      last.current = next;
      if (existed && !still) motion.current = element.animate([
        { transform: `translate(${previous.left-rect.left}px, ${previous.top-rect.top}px) scale(${previous.width/rect.width}, ${previous.height/rect.height})` },
        { transform: "translate(0,0) scale(1,1)" },
      ], { duration: 1000, easing: "cubic-bezier(.22,1,.36,1)" });
    };
    relocate.current = measure;
    const observer = new ResizeObserver(measure);
    if (anchor.current) { observer.observe(anchor.current); if (anchor.current.parentElement) observer.observe(anchor.current.parentElement); }
    window.addEventListener("resize", measure); media.addEventListener("change", measure); measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); media.removeEventListener("change", measure); motion.current?.cancel(); };
  }, [anchor, docked]);
  useLayoutEffect(() => relocate.current());
  return <div ref={surface} className="moving-eye" data-docked={docked}>
    <SignalEye state={state} quiet={quiet} energy={energy} />
    <SomaticFrame />
    {nativeRuntime && <div className="native-eye-tools">
      <button className="window-grip" aria-label="Move EVA window" title="Drag EVA" onPointerDown={event => { if (event.button === 0) void getCurrentWindow().startDragging().catch(() => {}); }}>⠿</button>
      <button aria-label="Close EVA" title="Close EVA" onClick={() => { void getCurrentWindow().close().catch(() => {}); }}>×</button>
    </div>}
  </div>;
}
