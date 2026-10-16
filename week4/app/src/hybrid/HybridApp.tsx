import { useEffect, useRef, useState } from 'react';
import { loadHybridStage } from './renderer.ts';
import type { HybridStage } from './renderer.ts';
import type { HybridScene } from './manifest.ts';
import './hybrid.css';

export function HybridApp() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HybridStage | null>(null);
  const [manifest, setManifest] = useState<HybridScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'gpu' | 'source'>('gpu');
  const [layer, setLayer] = useState('all');
  const [attempt, setAttempt] = useState(0);
  const [capture] = useState(() => new URLSearchParams(location.search).get('capture') === '1');
  useEffect(() => {
    if (!host.current) return;
    const controller = new AbortController();
    setManifest(null); setError(null);
    void loadHybridStage(host.current, controller.signal, setError).then(result => {
      if (controller.signal.aborted) { result.dispose(); return; }
      stage.current = result;
      setManifest(result.manifest);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { controller.abort(); stage.current?.dispose(); stage.current = null; };
  }, [attempt]);
  useEffect(() => { stage.current?.showLayer(layer === 'all' ? null : layer); }, [layer, manifest]);
  useEffect(() => {
    const stop = (event: KeyboardEvent) => { if (event.key === 'Escape') { setView('gpu'); setLayer('all'); } };
    window.addEventListener('keydown', stop);
    return () => window.removeEventListener('keydown', stop);
  }, []);
  return <main className="hybrid-app" data-capture={capture ? '1' : undefined}>
    <h1 className="visually-hidden">Paris / Fragment — source-derived GPU baseline</h1>
    <section className="hybrid-stage" aria-label="Paris visual comparison">
      <div ref={host} className="hybrid-host" style={{ visibility: view === 'gpu' ? 'visible' : 'hidden' }} />
      {view === 'source' && stage.current && !error
        ? <img className="hybrid-reference" src={stage.current.referenceUrl} alt="Original supplied Paris artwork, shown for comparison — not the GPU output" /> : null}
      {error ? <div className="hybrid-message" role="alert"><p>{error}</p><button onClick={() => { setLayer('all'); setView('gpu'); setAttempt(n => n + 1); }}>Retry GPU</button></div>
        : !manifest ? <p className="hybrid-message" role="status">Loading source-derived GPU layers…</p> : null}
    </section>
    {!capture ? <footer className="hybrid-controls">
      <div className="hybrid-caption"><strong>Paris / Fragment</strong><span>Static fidelity checkpoint · supplied artwork, not a 3D scan</span></div>
      <div className="hybrid-actions">
        <button aria-pressed={view === 'gpu'} onClick={() => setView('gpu')}>GPU layers</button>
        <button aria-pressed={view === 'source'} disabled={!manifest || !!error} onClick={() => setView('source')}>Original source</button>
        <label>Cutout <select aria-label="Cutout" value={layer} disabled={!manifest || !!error || view !== 'gpu'} onChange={event => setLayer(event.currentTarget.value)}>
          <option value="all">All layers</option>
          {manifest?.layers.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
        </select></label>
      </div>
      <p className="hybrid-note" role="status">{error ? 'GPU unavailable — no automatic fallback' : manifest
        ? `${view === 'source' ? 'Original image comparison' : `${manifest.layers.length} GPU texture layers`} · ${manifest.width} × ${manifest.height} source · no added effects or motion`
        : 'Loading…'}</p>
    </footer> : null}
  </main>;
}
