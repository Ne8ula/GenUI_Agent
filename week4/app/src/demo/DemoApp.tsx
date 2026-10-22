import { useEffect, useRef, useState } from 'react';
import { createDemoRenderer } from './renderer.ts';
import type { DemoRenderer } from './renderer.ts';
import { rasterizeWeek1Eye } from '../arrival/eye-source.ts';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import './demo.css';

type Stage = 'intro' | 'upload' | 'processing' | 'building' | 'room';
const NOTE = 'My parents bought me this teddy bear when we were travelling in NYC in 2014';
const BUILD_STEPS = ['Estimating depth from 6 views', 'Registering camera poses', 'Fusing points into the room', 'Completing unseen surfaces', 'Settling the room'];
const BUILD_SECONDS = 16;

// The Week 1-4 SignalEye, rasterised live with its ordered dither.
function DitherEye({ thinking }: { thinking: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const energy = useRef(0); energy.current = thinking ? 1 : 0;
  useEffect(() => {
    const context = ref.current!.getContext('2d')!, image = context.createImageData(320, 160);
    let id = 0;
    const draw = (now: number) => {
      const t = now / 1000;
      rasterizeWeek1Eye(320, 160, { time: t, energy: energy.current, gazeX: Math.sin(t * .4) * .3, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0, quiet: !energy.current }, image.data);
      context.putImageData(image, 0, 0); id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, []);
  return <canvas ref={ref} className="demo-dither-eye" width={320} height={160} aria-hidden="true" />;
}

// Ordered (Bayer 4x4) dither sweeps down each photo, matching the eye's pixel language.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function DitherPhoto({ src, delay }: { src: string; delay: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!, context = canvas.getContext('2d', { willReadFrequently: true })!;
    const w = canvas.width, h = canvas.height, image = new Image();
    let id = 0, start = 0, source: ImageData | undefined;
    const draw = (now: number) => {
      start ||= now + delay;
      const front = Math.max(0, Math.min(h + 8, (now - start) / 3000 * (h + 8)));
      const out = context.createImageData(w, h);
      for (let y = 0; y < Math.min(h, front); y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, d = source!.data;
        const lum = (.3 * d[i]! + .59 * d[i + 1]! + .11 * d[i + 2]!) / 255;
        const on = lum * 1.15 > (BAYER[(y & 3) * 4 + (x & 3)]! + .5) / 16, edge = front - y < 3;
        out.data[i] = on || edge ? 255 : 8; out.data[i + 1] = on || edge ? (edge ? 190 : 59) : 6; out.data[i + 2] = on || edge ? (edge ? 170 : 48) : 6; out.data[i + 3] = 255;
      }
      context.putImageData(out, 0, 0);
      if (front < h + 8) id = requestAnimationFrame(draw);
    };
    image.onload = () => { context.drawImage(image, 0, 0, w, h); source = context.getImageData(0, 0, w, h); context.clearRect(0, 0, w, h); id = requestAnimationFrame(draw); };
    image.src = src;
    return () => cancelAnimationFrame(id);
  }, [src, delay]);
  return <canvas ref={ref} className="demo-dither-photo" width={128} height={96} aria-hidden="true" />;
}

function Eye({ className = '' }: { className?: string }) {
  return <span className={`demo-eye ${className}`} aria-hidden="true"><i /></span>;
}

export function DemoApp() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<DemoRenderer | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('intro');
  const [photos, setPhotos] = useState<string[]>([]);
  const [shown, setShown] = useState(0);
  const [buildStep, setBuildStep] = useState(0);
  const [memory, setMemory] = useState(0); // 1 teddy, 2 blue, 3 annotated
  const [chatOpen, setChatOpen] = useState(true);
  const [sent, setSent] = useState<{ id: number; text: string } | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const title = document.title; document.title = 'EVA';
    const instance = createDemoRenderer(canvas.current!); viewer.current = instance;
    void instance.load();
    return () => { document.title = title; instance.dispose(); viewer.current = null; };
  }, []);

  useEffect(() => {
    if (stage !== 'building') return;
    const timer = setInterval(() => setBuildStep(s => Math.min(BUILD_STEPS.length - 1, s + 1)), BUILD_SECONDS * 1000 / BUILD_STEPS.length);
    return () => clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    if (memory < 3) return;
    let id = 0;
    const follow = () => {
      const rect = viewer.current?.teddyRect(), el = overlay.current;
      if (el) {
        el.style.display = rect ? '' : 'none';
        if (rect) { const pad = 14; Object.assign(el.style, { left: `${rect.x - pad}px`, top: `${rect.y - pad}px`, width: `${rect.w + pad * 2}px`, height: `${rect.h + pad * 2}px` }); }
      }
      id = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(id);
  }, [memory]);

  function upload() {
    if (stage !== 'upload' || photos.length) return;
    setPhotos(Array.from({ length: 6 }, (_, i) => `/assets/teal-bedroom-photos/${i + 1}.png`));
    for (let i = 1; i <= 6; i++) setTimeout(() => setShown(i), i * 260);
    setTimeout(() => setStage('processing'), 6 * 260 + 700);
    setTimeout(() => {
      setStage('building'); setChatOpen(false);
      viewer.current?.build(BUILD_SECONDS, () => { setStage('room'); setHint(true); setTimeout(() => setHint(false), 5000); });
    }, 6 * 260 + 700 + 5200);
  }

  function send(text: string) {
    if (!text.trim()) return;
    setSent({ id: Date.now(), text });
    if (stage === 'intro') { setStage('upload'); return; }
    if (stage !== 'room' || memory >= 3) return;
    const next = memory + 1;
    if (next === 1) viewer.current?.materialize(7);
    if (next === 2) viewer.current?.recolor(5);
    setMemory(next); setChatOpen(false); input.current?.blur();
  }

  const chatVisible = stage === 'intro' || stage === 'upload' || stage === 'room';
  return <main className={`demo demo--${stage}`}>
    <canvas ref={canvas} className="demo-canvas" aria-label="The teal bedroom. W and S walk, A and D turn." />

    {stage !== 'room' && <div className="demo-presence"><DitherEye thinking={stage === 'processing'} /></div>}

    {(stage === 'upload' || stage === 'processing' || stage === 'building') && <div className="demo-upload" onClick={upload}>
      {!photos.length && <p className="demo-upload-empty">Drop photos of the room</p>}
      <div className="demo-photos">
        {Array.from({ length: 6 }, (_, i) => <figure key={i} className={i < shown ? 'is-in' : ''} style={{ '--i': i } as React.CSSProperties}>
          {photos[i] ? <img src={photos[i]} alt="" /> : <span />}
          {stage === 'processing' && photos[i] && <DitherPhoto src={photos[i]!} delay={i * 450} />}
        </figure>)}
      </div>
      {stage === 'processing' && <p className="demo-caption">Reading 6 photographs<span className="demo-bar" /></p>}
    </div>}

    {stage === 'building' && <p className="demo-caption demo-caption--build" key={buildStep}>{BUILD_STEPS[buildStep]}</p>}
    {hint && <p className="demo-hint">W A S D</p>}

    {memory >= 3 && <div ref={overlay} className="demo-overlay" tabIndex={0} aria-label={NOTE}>
      <svg preserveAspectRatio="none" viewBox="0 0 100 100"><rect x="0.5" y="0.5" width="99" height="99" pathLength="1" vectorEffect="non-scaling-stroke" /></svg>
      <p className="demo-note">{NOTE}</p>
    </div>}

    {sent && <p key={sent.id} className="demo-sent">{sent.text}</p>}

    {chatVisible && <form className={`demo-chat ${chatOpen ? 'is-open' : ''}`} onSubmit={event => {
      event.preventDefault(); const value = input.current!.value; input.current!.value = ''; send(value);
    }} onClick={() => { if (!chatOpen) { setChatOpen(true); setTimeout(() => input.current?.focus()); } }}>
      <Eye />
      <input ref={input} aria-label="Message EVA" placeholder="Ask EVA" autoComplete="off" tabIndex={chatOpen ? 0 : -1}
        onKeyDown={event => { if (event.key === 'Escape' && stage === 'room') { setChatOpen(false); event.currentTarget.blur(); } }} />
    </form>}
  </main>;
}
