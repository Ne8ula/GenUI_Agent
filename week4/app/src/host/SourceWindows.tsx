// R10 corrective pass: (1) a temporal cascade of small, authentic archival photo windows shown only during the
// Paris R8 scene's 0–14 s construction, and (2) a tiny settled-state title/footer/inset-label treatment shown
// from t=21 s on. Photos appear ONLY inside the <img> cascade windows — never as scene background/texture
// (that stays Rust-owned procedural geometry). All three images are the real, retained, licensed originals in
// docs/design/revisions/.../w4-20261014-paris-source-particles-r1/ARCHIVE.md; none is a generated reference.
// Everything here follows the actual Rust scene clock (the renderer's own `canvas.dataset.timeMs`, the same
// value capture tooling reads), never an independent wall clock, so it naturally tracks pause/seek/replay.
import { useEffect, useRef, useState } from 'react';
import './SourceWindows.css';

export interface SourceWindowsProps {
  /** Only the R8 scene gets this overlay; the legacy seed-33 look is unaffected. */
  active: boolean;
  /** Hides only the photo cascade (brief: "reduced motion hides sequence"); the static settled labels stay. */
  reducedMotion: boolean;
}

interface SourceAsset {
  src: string;
  label: string;
  credit: string;
}

/** Exactly the three retained, license-cleared originals from ARCHIVE.md; see credits.json alongside the bundle. */
const ASSETS = {
  tgv53: {
    src: '/sources/paris-r10/tgv53-1985.jpg',
    label: 'TGV 53, Gare de Lyon — 2 Aug 1985',
    credit: 'Phil Richards · Wikimedia Commons · CC BY-SA 2.0',
  },
  plaque: {
    src: '/sources/paris-r10/rue-christine-1988.jpg',
    label: 'Rue Christine plaque, 6e — Nov 1988',
    credit: 'Esther Westerveld · Wikimedia Commons · CC BY 2.0',
  },
  poster: {
    src: '/sources/paris-r10/petit-palais-rembrandt-1986.jpg',
    label: 'Petit Palais, “Rembrandt. Eaux-fortes” — 1986',
    credit: 'Gilles Huot · Petit Palais / Paris Musées · CC0',
  },
} satisfies Record<string, SourceAsset>;

interface Cue {
  key: string;
  asset: SourceAsset;
  startMs: number;
  endMs: number;
  position: 'tl' | 'tr' | 'bl' | 'br' | 'lm' | 'rm';
  /** A detail crop of the SAME retained photo (coordinator: reuse crops, never invent distinct archival images). */
  objectPosition?: string;
}

/**
 * Distributed-edge cascade across the actual 0–14 s construction window, at most two windows visible at once
 * with brief (≤800 ms) crossfade overlaps, never covering the centre where construction reads. Ends clean.
 */
const CASCADE: Cue[] = [
  { key: 'tgv53-a', asset: ASSETS.tgv53, startMs: 800, endMs: 3400, position: 'tl' },
  { key: 'plaque-a', asset: ASSETS.plaque, startMs: 2600, endMs: 5200, position: 'br' },
  { key: 'tgv53-b', asset: ASSETS.tgv53, startMs: 5000, endMs: 7400, position: 'rm', objectPosition: '82% 35%' },
  { key: 'poster-a', asset: ASSETS.poster, startMs: 6600, endMs: 9400, position: 'tr' },
  { key: 'plaque-b', asset: ASSETS.plaque, startMs: 9000, endMs: 11400, position: 'bl', objectPosition: '50% 18%' },
  { key: 'poster-b', asset: ASSETS.poster, startMs: 11000, endMs: 13600, position: 'lm', objectPosition: '50% 10%' },
];

const FADE_MS = 350;
const CASCADE_END_MS = 14_000;
/** "Displayed with settled scene"; the owner brief uses t=21 s. No upper bound — stays through idle. */
const SETTLED_MS = 21_000;
const FRAME_ASPECT = 2752 / 1536;

function opacityFor(t: number, cue: Cue): number {
  if (t < cue.startMs || t > cue.endMs) return 0;
  const fadeIn = Math.min(1, (t - cue.startMs) / FADE_MS);
  const fadeOut = Math.min(1, (cue.endMs - t) / FADE_MS);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

interface ContainRect { x: number; y: number; w: number; h: number }
const EMPTY_RECT: ContainRect = { x: 0, y: 0, w: 0, h: 0 };

export function SourceWindows({ active, reducedMotion }: SourceWindowsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [frame, setFrame] = useState<ContainRect>(EMPTY_RECT);

  // Reads the renderer's own published clock each frame; not a setInterval/Date.now() wall clock, so pause,
  // scrub, replay and the manual capture clock are all reflected for free, including in capture mode (the
  // dataset is written every frame regardless of the status bar's throttled `publish`). Always tracked while
  // active (not gated by reducedMotion): the settled title/footer still needs the real t>=21s boundary.
  useEffect(() => {
    if (!active) { setT(0); return; }
    let raf = 0;
    const read = () => {
      const canvas = rootRef.current?.parentElement?.querySelector<HTMLCanvasElement>('.stage-canvas');
      const value = canvas?.dataset.timeMs;
      if (value !== undefined) setT(Number(value));
      raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // The Rust scene itself letterboxes a 16:9 picture inside whatever box the canvas fills (`fitFrame`); mirror
  // that here so the title/footer/inset labels sit on the actual contained picture, not the raw stage edges.
  useEffect(() => {
    const container = rootRef.current?.parentElement;
    if (!active || !container) { setFrame(EMPTY_RECT); return; }
    const compute = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      let cw = w, ch = h, x = 0, y = 0;
      if (w / h > FRAME_ASPECT) { cw = h * FRAME_ASPECT; x = (w - cw) / 2; } else { ch = w / FRAME_ASPECT; y = (h - ch) / 2; }
      setFrame({ x, y, w: cw, h: ch });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [active]);

  if (!active) return null;
  const showCascade = !reducedMotion && t <= CASCADE_END_MS;
  const showSettled = (reducedMotion || t >= SETTLED_MS) && frame.w > 0;

  return (
    <div className="source-windows" ref={rootRef} aria-hidden="true">
      {showCascade && CASCADE.map((cue) => {
        const opacity = opacityFor(t, cue);
        if (opacity <= 0) return null;
        return (
          <figure key={cue.key} className={`source-window source-window--${cue.position}`} style={{ opacity }}>
            <img src={cue.asset.src} alt="" style={cue.objectPosition ? { objectPosition: cue.objectPosition } : undefined} />
            <figcaption>
              <span className="source-window-label">{cue.asset.label}</span>
              <span className="source-window-credit">{cue.asset.credit}</span>
            </figcaption>
          </figure>
        );
      })}
      {showSettled && (
        <div className="source-frame" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
          <div className="source-frame-title">Paris / Fragment</div>
          <div className="source-frame-footer">
            <span>Procedural interpretation</span>
            <span>Not an archival reconstruction</span>
          </div>
          {/* Crisp labels for main's two procedural material-study insets (design coords x1278..1630, y35..227
              in the 1672×941 reference frame); drop if main renders its own native lettering instead. */}
          <div className="source-frame-inset-label source-frame-inset-label--pavement">Pavement study</div>
          <div className="source-frame-inset-label source-frame-inset-label--facade">Facade study</div>
        </div>
      )}
    </div>
  );
}
