import { useEffect, useRef, useState, type RefObject, type PointerEvent, type KeyboardEvent } from "react";
type Size = { width: number; height: number };
export function usePanelResize(card: RefObject<HTMLElement | null>, stage: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<Size | null>(null);
  const drag = useRef<{ x: number; y: number; size: Size } | null>(null);
  function clamp(next: Size): Size {
    const rect = card.current?.getBoundingClientRect(), area = stage.current?.getBoundingClientRect();
    const maxWidth = Math.max(280, (area?.right ?? innerWidth) - (rect?.left ?? 0));
    const maxHeight = Math.max(300, innerHeight - (rect?.top ?? 0) - 20);
    return { width: Math.round(Math.min(maxWidth, Math.max(Math.min(360,maxWidth),next.width))), height: Math.round(Math.min(maxHeight,Math.max(300,next.height))) };
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !card.current) return;
    event.preventDefault(); const rect = card.current.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, size: { width: rect.width, height: rect.height } };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const from = drag.current; if (!from) return;
    setSize(clamp({ width: from.size.width+event.clientX-from.x, height: from.size.height+event.clientY-from.y }));
  }
  function end() { drag.current = null; }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const delta: Record<string,[number,number]> = { ArrowLeft: [-24,0], ArrowRight: [24,0], ArrowUp: [0,-24], ArrowDown: [0,24] };
    if (!delta[event.key] || !card.current) return;
    event.preventDefault(); const rect = card.current.getBoundingClientRect(), [x,y] = delta[event.key];
    setSize(clamp({ width: rect.width+x, height: rect.height+y }));
  }
  useEffect(() => {
    const observer = new ResizeObserver(() => { setSize(current => {
      if (!current) return current; const next = clamp(current);
      return next.width===current.width && next.height===current.height ? current : next;
    }); });
    if (stage.current) observer.observe(stage.current);
    const resized = () => setSize(current => current ? clamp(current) : null);
    window.addEventListener('resize',resized);
    return () => { observer.disconnect(); window.removeEventListener('resize',resized); };
  });
  function freeze() {
    const rect = card.current?.getBoundingClientRect();
    if (rect) setSize(current => current ?? { width: rect.width, height: rect.height });
  }
  return { size, start, move, end, keyboard, freeze };
}
