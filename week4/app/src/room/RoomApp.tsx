import { useEffect, useRef, useState } from 'react';
import { createRoomRenderer, room, isCompletion, assetBase } from './renderer.ts';
import type { Movement, RoomRenderer } from './renderer.ts';
import './room.css';

export function RoomApp() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<RoomRenderer | null>(null);
  const sourceButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'cancelled'>('loading');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [viewIndex, setViewIndex] = useState(0);
  const [exploring, setExploring] = useState(false);
  const [mode, setMode] = useState<'surface' | 'points' | 'provenance'>('surface');
  const [sources, setSources] = useState(false);
  const [assumedSpace, setAssumedSpace] = useState(true);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  const view = room.views[viewIndex]!;
  const ready = status === 'ready';

  useEffect(() => {
    let active = true;
    let failed = false;
    let instance: RoomRenderer | undefined;
    setStatus('loading'); setProgress(0); setViewIndex(0); setMode('surface'); setExploring(false);
    setAssumedSpace(true);
    const fail = (message: string) => {
      if (active) {
        failed = true; instance?.dispose();
        if (viewer.current === instance) viewer.current = null;
        setError(message); setStatus('error');
      }
    };
    try {
      instance = createRoomRenderer(canvas.current!, () => { if (active) setExploring(true); }, fail);
      viewer.current = instance;
      void instance.load(value => { if (active) setProgress(value); }).then(() => {
        if (active && !failed && viewer.current === instance) setStatus('ready');
      }).catch(cause => { if (active && viewer.current === instance) fail(cause instanceof Error ? cause.message : 'The room could not be opened.'); });
      if (import.meta.env.DEV) Object.assign(window, { __evaRoom: { snapshot: instance.snapshot } });
    } catch (cause) { fail(cause instanceof Error ? cause.message : 'Graphics are unavailable.'); }
    return () => {
      active = false; instance?.dispose(); if (viewer.current === instance) viewer.current = null;
      if (import.meta.env.DEV) Reflect.deleteProperty(window, '__evaRoom');
    };
  }, [attempt]);

  useEffect(() => { if (sources) closeButton.current?.focus(); }, [sources, narrow]);
  useEffect(() => {
    const previous = document.title; document.title = 'EVA — A room, reconstructed';
    return () => { document.title = previous; };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  function closeSources() { setSources(false); sourceButton.current?.focus(); }
  function reset(index = viewIndex) {
    setViewIndex(index); viewer.current?.setView(room.views[index]!); setExploring(false);
  }
  function changeMode(next: 'surface' | 'points' | 'provenance') { setMode(next); viewer.current?.setMode(next); }
  function move(direction: Movement) { viewer.current?.move(direction); }
  return <main className="room-app" onKeyDown={event => {
    if (event.key === 'Escape' && sources) { event.preventDefault(); closeSources(); }
    if (event.key === 'Home' && event.target === canvas.current) { event.preventDefault(); reset(); }
  }}>
    <header className="room-header">
      <div className="room-brand"><span className="room-eye" aria-hidden="true"><i /></span><span>EVA<span className="room-divider">/</span><span className="room-brand-sub">Places</span></span></div>
      <div className="room-identity"><strong>A room, reconstructed</strong><span>Hypersim · ai_001_004</span></div>
      <button ref={sourceButton} className="room-source-toggle" aria-expanded={sources} aria-controls="room-sources" onClick={() => sources ? closeSources() : setSources(true)}>Sources & details <span aria-hidden="true">↗</span></button>
    </header>
    <div className={`room-workspace${sources ? ' has-sources' : ''}`}>
      <section className="room-stage" aria-label="Interactive reconstructed room" inert={sources && narrow}>
        <canvas key={attempt} ref={canvas} tabIndex={ready ? 0 : -1} aria-label="3D room. Drag to look. W A S D move, arrow keys turn, Q and E move vertically, Home resets the selected view." aria-describedby="room-controls-help" />
        <div className="room-stage-label"><span className="room-kicker">{mode === 'provenance' ? 'Surface provenance' : mode === 'surface' ? (isCompletion ? 'Reconstructed + completed surfaces' : 'Reconstructed surfaces') : (isCompletion ? 'Simplified room points' : 'Reconstructed vertices')}</span><span>{exploring ? 'Exploring freely' : view.label}</span></div>
        {ready && mode === 'provenance' && <p className="room-gap-note">Grey: fused · Cyan: recovered detail · Orange: inferred structure · Lavender: assumed space</p>}
        {ready && <div className="room-stage-actions">
          <button onClick={() => reset()} aria-label="Reset selected view">↺ <span>Reset view</span></button>
          <details className="room-help"><summary>Controls</summary><div id="room-controls-help"><strong>Take a look around</strong><p>Drag to look. Scroll or pinch to move. Use the buttons below on touch screens.</p><p>Focus the room: arrows turn, W A S D move, Q / E move down / up. Home resets the view.</p><p>Movement stays within scene bounds. Walls do not stop you; reset if you enter a surface.</p></div></details>
        </div>}
        {!ready && <div className="room-state" role={status === 'error' ? 'alert' : 'status'}>
          <span className="room-kicker">EVA / ai_001_004</span>
          <h1>{status === 'loading' ? 'Opening the room' : status === 'cancelled' ? 'Loading paused' : 'The room needs another try'}</h1>
          <p>{status === 'loading' ? 'Loading and verifying the reconstructed geometry.' : status === 'cancelled' ? 'Resume when you are ready to explore.' : error}</p>
          {status === 'loading' ? <><progress max={1} value={progress} aria-label="Room download" /><span>{Math.round(progress * 100)}% downloaded</span><button onClick={() => { viewer.current?.dispose(); viewer.current = null; setStatus('cancelled'); }}>Cancel loading</button></> : <button onClick={() => setAttempt(value => value + 1)}>Reload room</button>}
        </div>}
        {ready && <div className="room-movement" aria-label="Move through the room">
          <button aria-label="Move left" onClick={() => move('left')}>←</button>
          <button aria-label="Move forward" onClick={() => move('forward')}>↑</button>
          <button aria-label="Move backward" onClick={() => move('back')}>↓</button>
          <button aria-label="Move right" onClick={() => move('right')}>→</button>
        </div>}
        {ready && !isCompletion && view.frame === 37 && !exploring && <p className="room-gap-note">Incomplete doorway · 56% of this view has mesh coverage</p>}
      </section>
      {sources && <aside id="room-sources" className="room-sources" aria-label="Sources and reconstruction details" role={narrow ? 'dialog' : undefined} aria-modal={narrow ? true : undefined} onKeyDown={event => {
        if (!narrow || event.key !== 'Tab') return;
        const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')];
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <div className="room-panel-heading"><span className="room-kicker">Behind this room</span><button ref={closeButton} onClick={closeSources} aria-label="Close sources">×</button></div>
        <h2>{view.label}</h2>
        <figure><img src={`${assetBase}${view.source}`} alt={`Supplied Hypersim render, frame ${String(view.frame).padStart(4, '0')}: ${view.label.toLowerCase()}`} width="1024" height="768" /><figcaption>Source render · frame {String(view.frame).padStart(4, '0')} · cam_00</figcaption></figure>
        <button disabled={!ready} className="room-match" onClick={() => reset()}>Return to this source camera</button>
        <p>{exploring ? 'You have moved away from this source camera. Returning restores the matching 4:3 framing.' : 'The room uses this camera and 4:3 framing. Surfaces are reconstructed; the image above is the supplied source.'}</p>
        <dl className="room-facts"><div><dt>Mesh coverage in this view</dt><dd>{(view.evaluation.hit_coverage * 100).toFixed(2)}%</dd></div><div><dt>Within 5 cm, including gaps</dt><dd>{(view.evaluation.within_5cm_fraction_of_all_valid * 100).toFixed(2)}%</dd></div></dl>
        <h3>What you are exploring</h3>
        {isCompletion ? <>
          <p>A synthetic room rebuilt from all 100 supplied color/depth images and camera poses, with recovered source detail and inferred walls, floor and ceiling for unseen gaps. The measurements above count pixels with valid source depth, excluding background openings. They compare against those same inputs; they are not held-out accuracy.</p>
          <p>Provenance shows fused sources in grey, recovered detail in cyan, inferred structure in orange and assumed adjoining spaces in lavender. Their layout and materials are guesses beyond the captured room. The mesh is not a watertight solid.</p>
          <label className="room-assumption-toggle"><input type="checkbox" checked={assumedSpace} disabled={!ready} onChange={event => {
            setAssumedSpace(event.target.checked); viewer.current?.setAssumedSpace(event.target.checked);
          }} />Show assumed adjoining spaces</label>
          <p>Turn this off to compare the original empty openings. Points uses a simplified, evenly spaced selection; surfaces retain the full mesh.</p>
          <a className="room-manifest-link" href="/?scene=hypersim-room&room=r03">Open original 96-view reconstruction</a>
        </> : <>
          <p>A synthetic room reconstructed from 96 supplied color/depth images and camera poses. Four views were withheld from fusion. This is a development-tuned reconstruction, not reconstruction from photographs alone.</p>
          <p>Dark gaps are missing geometry. The doorway remains incomplete. No missing structure has been generated.</p>
          <a className="room-manifest-link" href="/?scene=hypersim-room">Open all-view room completion</a>
        </>}
        <h3>Source & credit</h3><p>Apple Hypersim · scene assets by Evermotion. Dataset and derived room assets: <a href={room.credits.license_url} target="_blank" rel="noreferrer">CC BY-SA 3.0</a>. Source renders are tone mapped from HDR and encoded as JPEG.</p>
        <a href={room.credits.source_url} target="_blank" rel="noreferrer">Official dataset ↗</a><a className="room-manifest-link" href={`${assetBase}scene.json`} target="_blank" rel="noreferrer">Asset provenance ↗</a>
      </aside>}
    </div>
    <footer className="room-footer" inert={sources && narrow}>
      <div className="room-footer-heading"><div><span className="room-kicker">Saved perspectives</span><span className="room-footer-note">Choose a view, then explore.</span></div><div className="room-modes" aria-label="Representation"><button disabled={!ready} aria-pressed={mode === 'surface'} onClick={() => changeMode('surface')}>Surfaces</button><button disabled={!ready} aria-pressed={mode === 'points'} onClick={() => changeMode('points')}>Points</button>{isCompletion && <button disabled={!ready} aria-pressed={mode === 'provenance'} onClick={() => changeMode('provenance')}>Provenance</button>}</div></div>
      <div className="room-views" aria-label="Saved camera views">{room.views.map((item, index) => <button key={item.frame} disabled={!ready} aria-pressed={viewIndex === index} onClick={() => reset(index)}><img src={`${assetBase}${item.source}`} alt="" width="80" height="60" /><span><strong>{item.label}</strong><small>{!isCompletion && item.frame === 37 ? 'Incomplete coverage' : `View ${String(item.frame).padStart(4, '0')}`}</small></span><span className="room-view-arrow" aria-hidden="true">↗</span></button>)}</div>
      <p className="room-attribution">Apple Hypersim / Evermotion · CC BY-SA 3.0 <span>Supplied depth + camera poses · {room.revision}</span></p>
    </footer>
  </main>;
}
