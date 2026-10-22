import { useEffect, useRef, useState } from 'react';
import { createBedroomRenderer } from './renderer.ts';
import type { BedroomRenderer } from './renderer.ts';
import { applyMemory, createMemory } from './memory.ts';
import type { MemoryCommand } from './memory.ts';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/ibm-plex-sans/400.css';
import './bedroom.css';

export function BedroomApp() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<BedroomRenderer | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const [memory, setMemory] = useState(createMemory);
  const memoryRef = useRef(memory); memoryRef.current = memory;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'cancelled'>('loading');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'surface' | 'matrix'>('matrix');
  const [ceilingEnabled, setCeilingEnabled] = useState(true);
  const ceilingRef = useRef(ceilingEnabled); ceilingRef.current = ceilingEnabled;
  const [message, setMessage] = useState('A room made whole through imagination. Add a memory when you are ready.');
  const ready = status === 'ready';
  useEffect(() => {
    const title = document.title; document.title = 'EVA — The teal bedroom';
    return () => { document.title = title; };
  }, []);
  useEffect(() => {
    let active = true;
    let instance: BedroomRenderer | undefined;
    setStatus('loading'); setProgress(0); setMode('matrix');
    const fail = (text: string) => {
      if (!active) return;
      instance?.dispose(); if (viewer.current === instance) viewer.current = null;
      setError(text); setStatus('error');
    };
    try {
      instance = createBedroomRenderer(canvas.current!, fail); viewer.current = instance;
      void instance.load('/assets/teal-bedroom/room.ply', value => { if (active) setProgress(value); }).then(() => {
        if (active && viewer.current === instance) {
          instance!.setMemory(memoryRef.current.current);
          instance!.setCeiling(ceilingRef.current); setStatus('ready');
        }
      }).catch(cause => { if (active && viewer.current === instance) fail(cause instanceof Error ? cause.message : 'The scan could not be opened.'); });
      if (import.meta.env.DEV) Object.assign(window, { __evaBedroom: { snapshot: instance.snapshot, capture: instance.capture } });
    } catch (cause) { fail(cause instanceof Error ? cause.message : 'WebGL graphics are unavailable.'); }
    return () => {
      active = false; instance?.dispose(); if (viewer.current === instance) viewer.current = null;
      if (import.meta.env.DEV) Reflect.deleteProperty(window, '__evaBedroom');
    };
  }, [attempt]);
  useEffect(() => { viewer.current?.setMemory(memory.current); }, [memory]);
  function command(value: MemoryCommand) {
    const next = applyMemory(memory, value); setMemory(next);
    if (next === memory) return;
    setMessage(value === 'add' ? 'A cream teddy is on the bed. A memory you added, not something found in the scan.'
      : value === 'blue' ? 'The teddy is blue. The room stays exactly as it was.'
      : value === 'remove' ? 'The teddy is removed. Your last change can be undone.'
      : next.current.present ? `The ${next.current.color} teddy is back. Last change undone.` : 'Back to the room, without the teddy. Last change undone.');
  }
  function toggleCeiling() {
    const enabled = !ceilingEnabled; viewer.current?.setCeiling(enabled); setCeilingEnabled(enabled);
    setMessage(enabled ? 'Authored room completion shown. Original scan is preserved.' : 'Original scan shown. All authored room completion is hidden.');
  }
  function representation(value: 'surface' | 'matrix') { setMode(value); viewer.current?.setMode(value); }
  return <main className="bedroom-app" onKeyDown={event => {
    if (event.key === 'Escape' && details.current?.open) { details.current.open = false; details.current.querySelector('summary')?.focus(); }
  }}>
    <header className="bedroom-header">
      <a className="bedroom-brand" href="?scene=teal-bedroom" aria-label="EVA bedroom home"><span className="bedroom-eye" aria-hidden="true"><i /></span>EVA</a>
      <div className="bedroom-title"><h1>The teal bedroom</h1><p>A remembered room <span aria-hidden="true">/</span> an artistic study</p></div>
      <details ref={details} className="bedroom-details"><summary>Sources &amp; details</summary><div>
        <h2>A scan, and imagined objects</h2>
        <p>The room starts from the supplied ARKitScenes 45261631 scan. The ceiling light, continuous walls, floor, opening panels and furniture backing are authored artistic geometry, not recovered surfaces. Shapes and materials take creative liberty; the window and door remain distinct. Switch off Authored room to see the original scan.</p>
        <p>Matrix changes only the display. Camera and teddy stay in place. Completion is specific to this room, not automatic reconstruction; seams and small scan fragments may remain.</p>
        <p>The teddy is authored geometry at a manually chosen bed anchor. These four requests are scripted; no live model is called. Placement is visual, not calibrated physical accuracy.</p>
        <p>Changes last for this open page only. Undo retains the last 32 edits. Reopening graphics keeps the memory and completion choice but resets the view. Reloading the page clears edits.</p>
        <p>Drag to orbit, pinch or scroll to zoom. Focus the scene: arrows pan, W / S zoom, Home resets. Controls do not detect wall collisions.</p>
        <p>Source: Apple ARKitScenes. Copyright © 2021 Apple Inc. No endorsement implied. <a href="https://github.com/apple/ARKitScenes" target="_blank" rel="noreferrer">Official dataset</a> · <a href="https://github.com/apple/ARKitScenes/blob/main/LICENSE" target="_blank" rel="noreferrer">Source license</a></p>
      </div></details>
    </header>
    <section className="bedroom-stage" aria-label="Bedroom scene">
      <canvas key={attempt} ref={canvas} role="application" tabIndex={ready ? 0 : -1} aria-label="Interactive bedroom. Drag to orbit, scroll to zoom. Arrow keys pan, W and S zoom, Home resets." />
      <div className="bedroom-scene-caption"><span>45261631</span><span>{mode === 'matrix' ? 'Matrix' : 'Surfaces'} · {ceilingEnabled ? 'Scan + authored completion' : 'Original scan'}</span></div>
      {ready && <div className="bedroom-view-controls" aria-label="Scene navigation">
        <button aria-label="Turn left" onClick={() => viewer.current?.turn(-1)}>←</button>
        <button aria-label="Turn right" onClick={() => viewer.current?.turn(1)}>→</button>
        <button aria-label="Zoom in" onClick={() => viewer.current?.zoom(true)}>+</button>
        <button aria-label="Zoom out" onClick={() => viewer.current?.zoom(false)}>−</button>
        <button onClick={() => viewer.current?.reset()}>Reset view</button>
        <button onClick={() => viewer.current?.ceilingView()}>Ceiling light</button>
      </div>}
      {!ready && <div className="bedroom-loading" role={status === 'error' ? 'alert' : 'status'}>
        <h2>{status === 'loading' ? 'Opening the bedroom' : status === 'cancelled' ? 'Opening paused' : 'The room needs another try'}</h2>
        <p>{status === 'loading' ? 'Preparing the scan and its imagined room completion.' : status === 'cancelled' ? 'Your memory edits stay here while the room is paused.' : error}</p>
        {status === 'loading' ? <><progress max={1} value={progress} aria-label="Scan download" /><button onClick={() => { viewer.current?.dispose(); viewer.current = null; setStatus('cancelled'); }}>Cancel loading</button></>
          : <button onClick={() => setAttempt(value => value + 1)}>Reopen room</button>}
      </div>}
    </section>
    <footer className="bedroom-footer">
      <div className="bedroom-memory-copy"><span className="bedroom-memory-dot" aria-hidden="true" /><p role="status" aria-live="polite">{message}</p></div>
      <div className="bedroom-toolbar"><div className="bedroom-presets" aria-label="Scripted memory requests">
        <button className="bedroom-add" disabled={!ready || memory.current.present} onClick={() => command('add')}>Add teddy</button>
        <button disabled={!ready || !memory.current.present || memory.current.color === 'blue'} onClick={() => command('blue')}>Make it blue</button>
        <button disabled={!ready || !memory.current.present} onClick={() => command('remove')}>Remove teddy</button>
        <button disabled={!ready || !memory.history.length} onClick={() => command('undo')}>Undo</button>
      </div><div className="bedroom-modes" aria-label="Scene representation">
        <button disabled={!ready} aria-pressed={mode === 'surface'} onClick={() => representation('surface')}>Surfaces</button>
        <button disabled={!ready} aria-pressed={mode === 'matrix'} onClick={() => representation('matrix')}>Matrix</button>
        <button disabled={!ready} aria-pressed={ceilingEnabled} onClick={toggleCeiling}>Authored room</button>
      </div></div>
      <div className="bedroom-footnote"><span>Completion &amp; teddy: authored, not source evidence</span><span>Session only · no live AI</span></div>
    </footer>
  </main>;
}
