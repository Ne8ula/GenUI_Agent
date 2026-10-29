import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPanoramaRenderer, PANORAMA } from './panorama.ts';
import type { PanoramaRenderer, PanoramaView } from './panorama.ts';
import { CrimeSceneApp } from './CrimeSceneApp.tsx';
import { sceneRequest } from './api.ts';
import { FFS } from './state.ts';
import { INSPECTION_CLUES, interruptInspection, resetInspection, startInspection, tickInspection } from './inspection.ts';
import './crime-scene.css';
import './panorama.css';

export function CrimeSceneEntry() {
  const [original, setOriginal] = useState(() => new URLSearchParams(window.location.search).get('view') === 'scan');
  const saved = useRef<PanoramaView | undefined>(undefined);
  return original ? <><div className="panorama-return"><button onClick={() => setOriginal(false)}>Return to panorama room</button><span>Separate measured scan — not aligned to the panorama model</span></div><CrimeSceneApp /></>
    : <PanoramaApp saved={saved} onEvidence={() => setOriginal(true)} />;
}

export function PanoramaApp({ saved, onEvidence }: { saved: RefObject<PanoramaView | undefined>; onEvidence: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<PanoramaRenderer | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'cancelled' | 'error'>('loading');
  const [error, setError] = useState(''), [progress, setProgress] = useState(0), [attempt, setAttempt] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [inspection, setInspection] = useState(resetInspection);
  const [reduced, setReduced] = useState(false);
  const [photoError, setPhotoError] = useState(false), [photoReady, setPhotoReady] = useState(false), [photoAttempt, setPhotoAttempt] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null), modeButton = useRef<HTMLButtonElement>(null);
  const evidenceButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!canvas.current || !enabled) return;
    let active = true, view: PanoramaRenderer | undefined;
    const abort = new AbortController();
    setPhase('loading'); setError(''); setProgress(0); setInspection(resetInspection());
    void (async () => {
      try {
        await sceneRequest('session', '', abort.signal);
        if (!active) return;
        view = createPanoramaRenderer(canvas.current!, message => { if (active) { setError(message); setPhase('error'); setInspection(state => ({ ...state, paused: true })); } }, saved.current);
        renderer.current = view;
        await view.load(value => { if (active) setProgress(value); });
        if (active) setPhase('ready');
      } catch (e) { if (active) { setError((e as Error).message); setPhase('error'); } }
    })();
    return () => { active = false; abort.abort(); if (view) { saved.current = view.snapshot(); view.dispose(); } renderer.current = null; };
  }, [enabled, attempt, saved]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const ready = phase === 'ready';
  useEffect(() => {
    renderer.current?.pause(inspection.paused || !ready);
    renderer.current?.investigate(inspection.mode, inspection.sweep, inspection.selection);
  }, [inspection, ready]);
  useEffect(() => {
    if (!ready || inspection.paused || (!inspection.running && inspection.mode !== 'scan')) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => { const delta = (now - last) / 1000; last = now; setInspection(state => tickInspection(state, delta, reduced)); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, inspection.running, inspection.paused, inspection.mode, reduced]);
  useEffect(() => {
    const pauseHidden = () => { if (document.hidden) { renderer.current?.pause(true); setInspection(state => ({ ...state, paused: true })); } };
    document.addEventListener('visibilitychange', pauseHidden);
    return () => document.removeEventListener('visibilitychange', pauseHidden);
  }, []);
  useEffect(() => {
    setPhotoError(false); setPhotoReady(false);
    if (inspection.open && !inspection.running) closeButton.current?.focus({ preventScroll: true });
  }, [inspection.open, inspection.selection]);
  function manual() { renderer.current?.pause(false); setInspection(interruptInspection); }
  function reset(play = false) { renderer.current?.pause(false); if (!play) renderer.current?.reset(); setInspection(play ? startInspection() : resetInspection()); }
  function pause() { renderer.current?.pause(!inspection.paused); setInspection(state => ({ ...state, paused: !state.paused })); }
  function dismiss() {
    setInspection(state => ({ ...interruptInspection(state), open: false }));
    evidenceButton.current?.focus({ preventScroll: true });
  }
  function toggleMode() {
    renderer.current?.pause(false);
    setInspection(state => ({ ...interruptInspection(state), mode: state.mode === 'normal' ? (reduced ? 'detective' : 'scan') : 'normal', sweep: reduced ? 1 : 0, open: false }));
  }
  const clue = INSPECTION_CLUES.find(item => item.tag === inspection.selection);
  const status = inspection.paused ? 'Paused. Your place is held.' : inspection.mode === 'scan' ? 'Scanning presentation — no analysis is running.' : inspection.open ? 'Compare the original source photograph.' : inspection.mode === 'detective' ? 'Detective Mode. Same room, dithered Matrix treatment.' : inspection.started && inspection.seconds === 28 ? 'Walkthrough complete. Explore or replay.' : 'Look around the room. Activate Detective Mode to inspect.';
  return <main className="crime-scene-app panorama-app" data-phase={phase} data-mode={inspection.mode} data-playing={inspection.running && !inspection.paused} data-seconds={inspection.seconds.toFixed(2)} data-selection={inspection.selection ?? ''} onKeyDown={event => {
    if (event.key === 'Escape' && ready) {
      event.preventDefault();
      if (inspection.open) dismiss(); else { renderer.current?.pause(true); setInspection(state => ({ ...state, paused: true })); }
    } else if (event.key === 'Tab' && inspection.running) setInspection(interruptInspection);
  }}>
    <section className="panorama-stage" aria-label="Crime-scene interior">
      <canvas key={attempt} ref={canvas} tabIndex={0} aria-busy={!ready} aria-label="Supplied room interior. Drag to look; arrows turn and move. Home resets. Escape pauses."
        onPointerDownCapture={() => { if (ready) manual(); }} onWheelCapture={() => { if (ready) manual(); }}
        onKeyDownCapture={event => { if (ready && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 's', 'Home'].includes(event.key) && !inspection.paused) { manual(); if (event.key === 'Home') reset(); } }} />
      <header className="inspection-header"><div className="inspection-identity"><span className="scene-brand">EVA</span><span className="inspection-divider" /><div><h1>Room inspection</h1><p>Fictional Forensic Scenes / th_0028</p></div></div><span className="inspection-scripted">Scripted demo <span aria-hidden="true">·</span> No AI analysis</span></header>
      {ready && <div className="inspection-mode" aria-live="polite"><span className="inspection-mode-light" />{inspection.mode === 'normal' ? 'Original appearance' : inspection.mode === 'scan' ? 'Scanning presentation' : 'Detective Mode'}<small>Same inferred room · authored highlights</small></div>}
      {inspection.open && clue && ready && <aside className="inspection-evidence" aria-labelledby="inspection-title" onPointerDownCapture={manual} onWheelCapture={manual}>
        <div className="inspection-evidence-heading"><div><span className="inspection-source-id">Source tag {clue.tag}</span><h2 id="inspection-title">{clue.title}</h2></div><button ref={closeButton} aria-label="Close inspection" onClick={dismiss}>Close</button></div>
        <figure><img key={`${clue.tag}-${photoAttempt}`} src={FFS + 'photos/' + clue.photo} alt={`Unaltered source photograph for tag ${clue.tag}: ${clue.title}`} onLoad={() => setPhotoReady(true)} onError={() => setPhotoError(true)} />
          <figcaption>{photoError ? 'Source photograph unavailable.' : photoReady ? 'Original source photograph · unaltered' : 'Opening source photograph…'}</figcaption></figure>
        {photoError && <button onClick={() => { setPhotoError(false); setPhotoReady(false); setPhotoAttempt(value => value + 1); }}>Retry photograph</button>}
        <dl><dt>Observed</dt><dd>{clue.observed}</dd><dt>Interpretation</dt><dd>{clue.interpretation}</dd><dt>Unknown</dt><dd>{clue.unknown}</dd></dl>
        <p className="inspection-placement">Source evidence shown separately. Its position is not registered to this panorama model.</p>
      </aside>}
      {phase !== 'ready' && <div className="scene-loading" data-phase={phase} role="status"><h2>{phase === 'loading' ? 'Opening the room' : phase === 'cancelled' ? 'Loading cancelled' : 'Room unavailable'}</h2><p>{error || (phase === 'loading' ? 'Loading the supplied room. No model is running.' : 'The candidate and original evidence are unchanged.')}</p>{phase === 'loading' ? <><progress value={progress} max={1} aria-label="Room download" /><button onClick={() => { setEnabled(false); setPhase('cancelled'); }}>Cancel loading</button></> : <button onClick={() => { setEnabled(true); setAttempt(value => value + 1); }}>Reopen room</button>}</div>}
      <div className="inspection-bottom">
        <p className="inspection-status" role="status">{ready ? status : 'Source geometry and photographs are preserved.'}</p>
        <div className="panorama-toolbar" role="group" aria-label="Inspection controls">
          <button ref={modeButton} className="inspection-primary" disabled={!ready} aria-pressed={inspection.mode !== 'normal'} onClick={toggleMode}>{inspection.mode === 'normal' ? 'Detective Mode' : 'Exit Detective Mode'}</button>
          <button ref={evidenceButton} disabled={!ready} aria-expanded={inspection.open} onClick={() => { manual(); setInspection(state => ({ ...state, selection: 18, open: !state.open })); }}>Source photograph</button>
          <button disabled={!ready} onClick={() => reset(true)}>{inspection.started ? 'Replay demo' : 'Play demo'}<span className="inspection-duration">28 sec</span></button>
          <button disabled={!ready} aria-pressed={inspection.paused} onClick={pause}>{inspection.paused ? 'Resume' : 'Pause'}</button>
          <button disabled={!ready} onClick={() => reset()}>Reset</button>
          <details className="inspection-options" onToggle={event => { if (event.currentTarget.open) manual(); }}><summary>View &amp; sources</summary><div className="inspection-options-content">
            <p>Drag to look. Arrows turn and move. Escape closes inspection or pauses. Free camera; no collision-aware walking.</p>
            <div className="inspection-navigation"><button disabled={!ready} onClick={() => { manual(); renderer.current?.turn(-1); }}>Turn left</button><button disabled={!ready} onClick={() => { manual(); renderer.current?.turn(1); }}>Turn right</button><button disabled={!ready} onClick={() => { manual(); renderer.current?.move(1); }}>Move forward</button><button disabled={!ready} onClick={() => { manual(); renderer.current?.move(-1); }}>Move back</button></div>
            <label><input type="checkbox" checked={reduced} onChange={event => { manual(); setReduced(event.target.checked); }} /> Reduced motion</label>
            <p>Photo-textured Realsee export: inferred, unaligned, incomplete. Units and camera origin are unverified. No hidden surfaces were repaired. Hollow Matrix marks identify inferred surfaces, not scan coordinates.</p>
            <button onClick={onEvidence}>Original evidence</button><a href={FFS + 'realsee/report.json'} target="_blank" rel="noreferrer">Import provenance</a>
            <p>Daudigny &amp; Grussenmeyer (2026), University of Lausanne. CC BY-NC-SA 4.0. Staged teaching scene; no forensic conclusion.</p>
            <p className="scene-coordinates">Candidate SHA-256: {PANORAMA.sha256}</p>
          </div></details>
        </div>
        <p className="inspection-footnote">Inferred room · missing surfaces unknown{reduced ? ' · reduced motion' : ''}</p>
      </div>
    </section>
  </main>;
}
