import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
type Point = { x: number; y: number };
/** A dark-backed braided conduit stays legible against an arbitrary desktop. */
function matrix(a: Point, b: Point, stacked: boolean) {
  const cells = new Map<string, { x: number; y: number; density: number }>();
  const c = stacked ? { x: a.x, y: a.y+(b.y-a.y)*.45 } : { x: a.x+(b.x-a.x)*.45, y: a.y };
  const d = stacked ? { x: b.x, y: b.y-(b.y-a.y)*.45 } : { x: b.x-(b.x-a.x)*.45, y: b.y };
  const spine = `M${a.x} ${a.y}C${c.x} ${c.y} ${d.x} ${d.y} ${b.x} ${b.y}`;
  for (let strand = 0; strand < 2; strand++) {
    for (let i = 0; i <= 160; i++) {
      const t = i / 160, u = 1 - t;
      const braid = Math.sin(t*Math.PI*4+strand*Math.PI)*4*Math.sin(t*Math.PI);
      const x = u*u*u*a.x + 3*u*u*t*c.x + 3*u*t*t*d.x + t*t*t*b.x + (stacked ? braid : 0);
      const y = u*u*u*a.y + 3*u*u*t*c.y + 3*u*t*t*d.y + t*t*t*b.y + (stacked ? 0 : braid);
      const radius = 3.5 + 2.5*Math.pow(Math.abs(t*2-1),5);
      for (let px = Math.floor((x-radius)/2)*2; px <= x+radius; px += 2) {
        for (let py = Math.floor((y-radius)/2)*2; py <= y+radius; py += 2) {
          const distance = Math.hypot(px+1-x, py+1-y) / radius;
          if (distance > 1) continue;
          const density = Math.pow(1-distance, .45) * .82;
          const key = `${px},${py}`, previous = cells.get(key);
          if (!previous || previous.density < density) cells.set(key, { x: px, y: py, density });
        }
      }
    }
  }
  let ink = "", shadow = "";
  for (const { x, y, density } of cells.values()) {
    const index = ((Math.round(y/2)%4+4)%4)*4 + ((Math.round(x/2)%4+4)%4);
    const square = `M${x} ${y}h2v2h-2z`;
    if (density > (bayer[index]+.5)/16) ink += square;
    else if (density > .22) shadow += square;
  }
  return { ink, shadow, spine, a, b, stacked };
}

export function DitherLink({ anchor, stage, revision }: {
  anchor: RefObject<HTMLDivElement | null>; stage: RefObject<HTMLDivElement | null>; revision: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const update = useRef(() => {});
  const [shape, setShape] = useState<ReturnType<typeof matrix> | null>(null);
  useLayoutEffect(() => {
    const parent = svg.current?.parentElement;
    if (!parent || !anchor.current || !stage.current) return;
    const measure = () => {
      const target = stage.current?.querySelector('.instrument,.crt-assembly');
      if (!target || !anchor.current) return;
      const origin = parent.getBoundingClientRect(), eye = anchor.current.getBoundingClientRect(), card = target.getBoundingClientRect();
      const stacked = card.top >= eye.bottom;
      const a = stacked ? { x: eye.left+eye.width*.5-origin.left, y: eye.bottom-origin.top-2 } : { x: eye.right-origin.left-3, y: eye.top+eye.height*.58-origin.top };
      const b = stacked ? { x: card.left+Math.min(90,card.width*.2)-origin.left, y: card.top-origin.top+3 } : { x: card.left-origin.left+3, y: card.top+Math.min(100,card.height*.25)-origin.top };
      setShape(matrix(a,b,stacked));
    };
    update.current = measure;
    const observer = new ResizeObserver(measure); observer.observe(parent); observer.observe(anchor.current); observer.observe(stage.current);
    measure(); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [anchor, stage]);
  useLayoutEffect(() => update.current(), [revision]);
  return <svg ref={svg} className="dither-link" aria-hidden="true">
    {shape && <><path className="conduit-backing" d={shape.spine} fill="none" stroke="#080909" strokeWidth="15" />
    <g shapeRendering="crispEdges"><path d={shape.shadow} fill="#782321" /><path className="conduit-ink" d={shape.ink} fill="#ff3b35" /></g>
    {[shape.a,shape.b].map((point,index)=><g key={index} transform={`translate(${point.x},${point.y}) rotate(${shape.stacked ? 90 : 0})`}><path d="M-3-8H3V8H-3Z" fill="#080909" stroke="#ff3b35" strokeWidth="2" /><path d="M-1-5H1M-1 0H1M-1 5H1" stroke="#ff3b35" strokeWidth="2" /></g>)}</>}
  </svg>;
}
