import { useEffect, useRef, useState } from 'react';
import { createSceneRenderer } from './renderer.ts';
import type { SceneRenderer, CameraView } from './renderer.ts';
import { sceneRequest } from './api.ts';
import { FFS } from './state.ts';
import type { SceneData } from './state.ts';
import { Notebook } from './Notebook.tsx';
import './crime-scene.css';

export function CrimeSceneApp() {
  const canvas = useRef<HTMLCanvasElement>(null), labels = useRef<HTMLDivElement>(null), renderer = useRef<SceneRenderer | null>(null);
  const camera = useRef<CameraView | undefined>(undefined), focusReturn = useRef<HTMLElement | null>(null);
  const details = useRef<HTMLDetailsElement>(null), notesButton = useRef<HTMLButtonElement>(null), photoDialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<SceneData | null>(null), [csrf, setCsrf] = useState('');
  const [attempt, setAttempt] = useState(0), [loadAttempt, setLoadAttempt] = useState(0), [enabled, setEnabled] = useState(true);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'cancelled' | 'error'>('loading'), [error, setError] = useState('');
  const [progress, setProgress] = useState(0), [selected, setSelected] = useState<number | null>(null), [unknown, setUnknown] = useState(false);
  const [notes, setNotes] = useState(false), [examined, setExamined] = useState<Set<number>>(new Set());
  const [dwell, setDwell] = useState<number | null>(null), [photo, setPhoto] = useState<number | null>(null), [photoFailed, setPhotoFailed] = useState(false);
  function mark(tag: number) { setExamined(current => current.has(tag) ? current : new Set([...current, tag])); }
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const session = await sceneRequest<{ csrf: string }>('session', '', abort.signal); setCsrf(session.csrf);
        const value = await sceneRequest<SceneData>('benchmark/ffs/tags.json', session.csrf, abort.signal);
        if (!abort.signal.aborted) setData(value);
      } catch (e) { if (!abort.signal.aborted) { setError('Private scene unavailable. Start the local room broker, then retry. ' + (e as Error).message); setPhase('error'); } }
    })();
    return () => abort.abort();
  }, [loadAttempt]);
  useEffect(() => {
    if (!data || !canvas.current || !labels.current || !enabled) return;
    let active = true, view: SceneRenderer | undefined;
    setPhase('loading'); setError(''); setProgress(0);
    const fail = (text: string) => { if (active) { setError(text); setPhase('error'); setDwell(null); } };
    try {
      view = createSceneRenderer(canvas.current, data, labels.current, fail, () => setDwell(null), camera.current);
      renderer.current = view;
      void view.load(setProgress).then(() => { if (active) setPhase('ready'); }).catch(e => fail((e as Error).message));
    } catch (e) { fail((e as Error).message); }
    return () => { active = false; if (view) { camera.current = view.snapshot(); view.dispose(); } renderer.current = null; };
  }, [data, attempt, enabled]);
  useEffect(() => {
    if (dwell === null || phase !== 'ready' || document.hidden) return;
    let timer = window.setTimeout(() => mark(dwell), 2000);
    const hidden = () => { clearTimeout(timer); timer = 0; setDwell(null); };
    document.addEventListener('visibilitychange', hidden);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [dwell, phase]);
  const item = data?.evidence.find(value => value.tag === selected);
  const marker = data?.markers.find(value => value.tag === selected && selected !== null);
  const photoItem = data?.evidence.find(value => value.tag === photo);
  const photoURL = (filename: string) => /^IMG_20240306_\d{6}\.jpg$/.test(filename) ? FFS + 'photos/' + filename : '';
  function inspect(tag: number, trigger: HTMLElement) {
    focusReturn.current = trigger; setSelected(tag); setUnknown(false); setDwell(null);
    const found = data?.markers.find(value => value.tag === tag);
    if (found && phase === 'ready') { renderer.current?.inspect(found); setDwell(tag); }
    if (details.current) details.current.open = true;
  }
  function closeSelection() {
    setSelected(null); setUnknown(false); setDwell(null); renderer.current?.returnToRoom(); focusReturn.current?.focus({ preventScroll: true });
  }
  function stop() { setEnabled(false); setPhase('cancelled'); setDwell(null); }
  function reopen() { setEnabled(true); setAttempt(value => value + 1); if (!data) setLoadAttempt(value => value + 1); }
  return <main className="crime-scene-app" onKeyDown={event => {
    if (event.key === 'Escape' && !photoDialog.current?.open) {
      if (notes) { setNotes(false); notesButton.current?.focus(); }
      else if (selected !== null || unknown) closeSelection();
      else if (details.current?.open) { details.current.open = false; details.current.querySelector('summary')?.focus(); }
    }
  }}>
    <header className="scene-header"><a href="?scene=teal-bedroom" className="scene-brand" aria-label="EVA, return to bedroom">EVA</a><div><h1>Scene investigation</h1><p>FFS th_0028 · staged teaching scene</p></div><button ref={notesButton} aria-expanded={notes} aria-controls="scene-notebook" onClick={() => setNotes(value => !value)}>Notes</button></header>
    <div className="scene-workspace">
      <section className="scene-stage" aria-label="Laser scan">
        <canvas ref={canvas} tabIndex={0} aria-label="Laser scan. Drag to orbit, arrows to pan, W and S to zoom, Home to reset." />
        <div className="scene-caption"><span>Filled marks = scan</span><span>Colour treatment only; no filled gaps</span></div>
        <div ref={labels} className="scene-markers" hidden={phase !== 'ready'}>{data?.markers.map(value => <button key={value.id} data-marker={value.id} className="scene-marker" aria-label={value.tag ? `Inspect tag ${value.tag}` : 'Unidentified detected marker'} aria-pressed={value.tag ? selected === value.tag : unknown} onClick={event => {
          if (value.tag) inspect(value.tag, event.currentTarget);
          else { focusReturn.current = event.currentTarget; renderer.current?.inspect(value); setUnknown(true); setSelected(null); setDwell(null); }
        }}><span>{value.tag ?? '?'}</span></button>)}</div>
        {unknown && <div className="scene-unknown"><p>Unidentified marker. Detected by colour; no number assigned.</p><button onClick={closeSelection}>Return to room</button></div>}
        {phase !== 'ready' && <div className="scene-loading" role="status"><h2>{phase === 'loading' ? 'Opening the scan' : phase === 'cancelled' ? 'Scan paused' : 'Scan unavailable'}</h2><p>{error || (phase === 'loading' ? 'Checking the retained scan. No model is running.' : 'Notes and examined statuses stay in this page session.')}</p>{phase === 'loading' ? <><progress value={progress} max={1} aria-label="Scan download" /><button onClick={stop}>Cancel loading</button></> : <button onClick={reopen}>Reopen scan</button>}</div>}
        <div className="scene-view-controls"><button disabled={phase !== 'ready'} aria-label="Turn left" onClick={() => { setDwell(null); renderer.current?.turn(-1); }}>↶</button><button disabled={phase !== 'ready'} aria-label="Turn right" onClick={() => { setDwell(null); renderer.current?.turn(1); }}>↷</button><button disabled={phase !== 'ready'} aria-label="Zoom in" onClick={() => { setDwell(null); renderer.current?.zoom(true); }}>+</button><button disabled={phase !== 'ready'} aria-label="Zoom out" onClick={() => { setDwell(null); renderer.current?.zoom(false); }}>−</button><button disabled={phase !== 'ready'} onClick={() => { closeSelection(); renderer.current?.reset(); }}>Reset view</button>{phase === 'ready' && <button onClick={stop}>Pause scan</button>}</div>
        <p className="scene-navigation">Drag to orbit · arrows to pan · W/S to zoom<br />Tab to a tag, Enter to inspect, Escape to return</p>
      </section>
      <details className="scene-details" ref={details} open><summary>Sources &amp; details</summary><div>
        <h2>Clue list</h2><p className="scene-small">11 documented items. Examined status lasts only in this page session: open a photo or hold an unmoving tag close-up for 2 seconds.</p>
        {item && <section className="scene-selected" aria-label={`Selected tag ${item.tag}`}><h3>Tag {item.tag}: {item.item}</h3><p>{marker ? 'Detected marker; numbering is manual and provisional.' : 'Position unavailable. No scan marker has been assigned.'}</p>{marker && <p className="scene-coordinates">Scanner xyz: {marker.centroid.map(n => n.toFixed(3)).join(', ')} m</p>}
          <div className="scene-actions"><button onClick={() => { setPhoto(item.tag); setPhotoFailed(false); photoDialog.current?.showModal(); }}>Open photo</button><button onClick={closeSelection}>Return to room</button></div></section>}
        <ol className="scene-clues">{data?.evidence.map(value => <li key={value.tag}><button className="scene-clue" aria-label={`Inspect tag ${value.tag}: ${value.item}`} aria-pressed={selected === value.tag} onClick={event => inspect(value.tag, event.currentTarget)}><span className="scene-tag-number">{value.tag}</span><span><strong>{value.item}</strong><small>{examined.has(value.tag) ? 'Examined' : 'Not yet examined'}</small></span><img loading="lazy" src={photoURL(value.photos[0]!)} alt="" /></button></li>)}</ol>
        <section className="scene-source"><h3>What this view contains</h3><p>Single-position laser scan, reduced to 712,312 points. The display is cropped; the source is unchanged. Missing and occluded areas remain empty.</p><p>Yellow clusters are detected markers, not confirmed identities. Eight provisional manual numbers; one unidentified cluster. Tags 1, 11 and 20 are unlocated.</p><p>Reddish traces were applied by instructors. They are not evidence of blood; no spatter analysis is performed.</p><p>{data?.attribution ?? 'Fictional Forensic Scenes — University of Lausanne.'}</p><p>Informational teaching tool, not validated forensic analysis.</p></section>
      </div></details>
      <Notebook csrf={csrf} evidence={data?.evidence ?? []} open={notes} close={() => { setNotes(false); notesButton.current?.focus(); }} />
    </div>
    <dialog ref={photoDialog} className="scene-photo" onClose={() => { setPhoto(null); }}><header><h2>Tag {photo}: {photoItem?.item}</h2><button onClick={() => photoDialog.current?.close()}>Close photo</button></header>{photoItem && <img key={photo} src={photoURL(photoItem.photos[0]!)} alt={`Source documentation of ${photoItem.item}, tag ${photo}`} onLoad={() => { if (photo !== null && photoDialog.current?.open) mark(photo); }} onError={() => setPhotoFailed(true)} />}{photoFailed && <p role="alert">Photo unavailable. Examined status has not changed.</p>}<p>Source photograph, not generated completion. Daudigny &amp; Grussenmeyer (2026), University of Lausanne. CC BY-NC-SA 4.0.</p></dialog>
  </main>;
}
