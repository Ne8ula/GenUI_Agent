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
  const cluesButton = useRef<HTMLButtonElement>(null), cluesHeading = useRef<HTMLHeadingElement>(null), viewControls = useRef<HTMLDetailsElement>(null);
  const notesButton = useRef<HTMLButtonElement>(null), photoDialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<SceneData | null>(null), [csrf, setCsrf] = useState('');
  const [attempt, setAttempt] = useState(0), [loadAttempt, setLoadAttempt] = useState(0), [enabled, setEnabled] = useState(true);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'cancelled' | 'error'>('loading'), [error, setError] = useState('');
  const [progress, setProgress] = useState(0), [selected, setSelected] = useState<number | null>(null), [unknown, setUnknown] = useState(false);
  const [panel, setPanel] = useState<'clues' | 'notes' | null>(null), [examined, setExamined] = useState<Set<number>>(new Set());
  const [cutaway, setCutaway] = useState(true), [original, setOriginal] = useState(false);
  const [dwell, setDwell] = useState<number | null>(null), [photo, setPhoto] = useState<number | null>(null), [photoFailed, setPhotoFailed] = useState(false);
  const marker = data?.markers.find(value => value.tag === selected && selected !== null);
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
      view.setCutaway(cutaway); view.setPresentation(original, marker ?? null);
      void view.load(setProgress).then(() => { if (active) setPhase('ready'); }).catch(e => fail((e as Error).message));
    } catch (e) { fail((e as Error).message); }
    return () => { active = false; if (view) { camera.current = view.snapshot(); view.dispose(); } renderer.current = null; };
  }, [data, attempt, enabled]);
  useEffect(() => { renderer.current?.setCutaway(cutaway); }, [cutaway, phase]);
  useEffect(() => { renderer.current?.setPresentation(original, marker ?? null); }, [original, marker, phase]);
  useEffect(() => { if (panel === 'clues') cluesHeading.current?.focus(); }, [panel]);
  useEffect(() => {
    if (dwell === null || !original || phase !== 'ready' || document.hidden) return;
    let timer = window.setTimeout(() => mark(dwell), 2000);
    const hidden = () => { clearTimeout(timer); timer = 0; setDwell(null); };
    document.addEventListener('visibilitychange', hidden);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [dwell, original, phase]);
  const item = data?.evidence.find(value => value.tag === selected);
  const photoItem = data?.evidence.find(value => value.tag === photo);
  const photoURL = (filename: string) => /^IMG_20240306_\d{6}\.jpg$/.test(filename) ? FFS + 'photos/' + filename : '';
  function inspect(tag: number, trigger: HTMLElement) {
    focusReturn.current = trigger.closest('.scene-clues') ? cluesButton.current : trigger;
    setSelected(tag); setUnknown(false); setDwell(null); setPanel(null);
    const found = data?.markers.find(value => value.tag === tag);
    if (found && phase === 'ready') { renderer.current?.inspect(found); if (original) setDwell(tag); }
  }
  function closeSelection() {
    setSelected(null); setUnknown(false); setDwell(null); renderer.current?.returnToRoom(); focusReturn.current?.focus({ preventScroll: true });
  }
  function togglePanel(next: 'clues' | 'notes') {
    setDwell(null); setPanel(current => current === next ? null : next);
    if (viewControls.current) viewControls.current.open = false;
  }
  function stop() { setEnabled(false); setPhase('cancelled'); setDwell(null); }
  function reopen() { setEnabled(true); setAttempt(value => value + 1); if (!data) setLoadAttempt(value => value + 1); }
  return <main className="crime-scene-app" onKeyDown={event => {
    if (event.key === 'Escape' && !photoDialog.current?.open) {
      if (panel) { setPanel(null); (panel === 'notes' ? notesButton : cluesButton).current?.focus(); }
      else if (viewControls.current?.open) { viewControls.current.open = false; viewControls.current.querySelector('summary')?.focus(); }
      else if (selected !== null || unknown) closeSelection();
    }
  }}>
    <header className="scene-header"><a href="?scene=teal-bedroom" className="scene-brand" aria-label="EVA, return to bedroom">EVA</a><div><h1>Scene investigation</h1><p>FFS th_0028 · staged teaching scene</p></div><nav aria-label="Investigation"><button ref={cluesButton} aria-expanded={panel === 'clues'} aria-controls="scene-clues" onClick={() => togglePanel('clues')}>Clues</button><button ref={notesButton} aria-expanded={panel === 'notes'} aria-controls="scene-notebook" onClick={() => togglePanel('notes')}>Notes</button></nav></header>
    <div className="scene-workspace">
      <section className="scene-stage" aria-label="Scene view">
        <canvas ref={canvas} tabIndex={0} aria-busy={phase === 'loading'} aria-label="Scene view. Drag to orbit, arrows to pan, W and S to zoom, Home to reset." />
        <p className="scene-caption">{phase === 'loading' ? 'Analysing source photos · estimated depth' : `Measured laser scan · ${original ? 'source colours' : 'detective view'}`}<span>{phase === 'loading' ? 'Photo depth is a model estimate, not measurement' : original ? 'Scan points, not a reconstructed event' : 'Grid, glow and outlines are display effects'}</span></p>
        <div ref={labels} className="scene-markers" hidden={phase !== 'ready'}>{data?.markers.map(value => <button key={value.id} data-marker={value.id} className="scene-marker" aria-label={value.tag ? `Inspect tag ${value.tag}` : 'Unidentified detected marker'} aria-pressed={value.tag ? selected === value.tag : unknown} onClick={event => {
          if (value.tag) inspect(value.tag, event.currentTarget);
          else { focusReturn.current = event.currentTarget; renderer.current?.inspect(value); setPanel(null); setUnknown(true); setSelected(null); setDwell(null); }
        }}><span>{value.tag ?? '?'}</span></button>)}</div>
        {phase !== 'ready' && <div className="scene-loading" data-phase={phase} role="status"><h2>{phase === 'loading' ? 'Opening the scan' : phase === 'cancelled' ? 'Scan paused' : 'Scan unavailable'}</h2><p>{error || (phase === 'loading' ? 'Checking the retained scan. Depth maps were estimated in advance; no model is running.' : 'Notes and examined statuses stay in this page session.')}</p>{phase === 'loading' ? <><progress value={progress} max={1} aria-label="Scan download" /><div className="scene-actions"><button onClick={() => renderer.current?.skipIntro()}>Skip intro</button><button onClick={stop}>Cancel loading</button></div></> : <button onClick={reopen}>Reopen scan</button>}</div>}
        <div className="scene-view-controls"><button disabled={phase !== 'ready'} onClick={() => { closeSelection(); renderer.current?.reset(); }}>Reset view</button><details ref={viewControls} onToggle={event => { if (event.currentTarget.open) { setPanel(null); setDwell(null); } }}><summary>View controls</summary><div className="scene-view-menu">
          <label><input type="checkbox" checked={original} onChange={event => { setOriginal(event.target.checked); setDwell(null); }} /> Source colours</label>
          <label><input type="checkbox" checked={!cutaway} onChange={event => { setCutaway(!event.target.checked); setDwell(null); }} /> Full scan</label>
          <p className="scene-small">Cutaway hides upper and near-edge scan points. Full scan restores all points within the unchanged crop. Use Source colours or a source photo to examine evidence.</p>
          <div className="scene-actions"><button disabled={phase !== 'ready'} aria-label="Turn left" onClick={() => { setDwell(null); renderer.current?.turn(-1); }}>↶</button><button disabled={phase !== 'ready'} aria-label="Turn right" onClick={() => { setDwell(null); renderer.current?.turn(1); }}>↷</button><button disabled={phase !== 'ready'} aria-label="Zoom in" onClick={() => { setDwell(null); renderer.current?.zoom(true); }}>+</button><button disabled={phase !== 'ready'} aria-label="Zoom out" onClick={() => { setDwell(null); renderer.current?.zoom(false); }}>−</button>{phase === 'ready' && <button onClick={stop}>Pause scan</button>}</div>
          <p className="scene-small">Drag to orbit · arrows to pan · W/S to zoom.<br />Tab to a marker, Enter to inspect, Escape to return.</p>
          <details className="scene-source"><summary>Sources &amp; details</summary><p>The room is the measured laser scan. Detective grid, glow, scan lines and outlines are display effects, not analysis. The opening sequence shows relative depth estimated from each photo by Depth Anything V2 Small; it is not measured and does not place the photos in the room.</p><p>Single-position laser scan reduced to 712,312 points. Its crop is unchanged; missing and occluded areas remain empty in Original scan.</p><p>Eight provisional marker numbers, one unidentified cluster. Tags 1, 11 and 20 are unlocated. Numbering is not validated.</p><p>Reddish traces were applied by instructors, not evidence of blood. No spatter analysis or validated forensic analysis.</p><p>{data?.attribution ?? 'Fictional Forensic Scenes — University of Lausanne. CC BY-NC-SA 4.0.'}</p></details>
        </div></details></div>
      </section>
      <aside id="scene-clues" className="scene-details scene-panel" hidden={panel !== 'clues'} aria-label="Clues"><div className="scene-panel-title"><h2 ref={cluesHeading} tabIndex={-1}>Clues</h2><button aria-label="Close clues" onClick={() => { setPanel(null); cluesButton.current?.focus(); }}>Close</button></div><p className="scene-small">11 documented items. Select one to inspect.</p>
        <ol className="scene-clues">{data?.evidence.map(value => <li key={value.tag}><button className="scene-clue" aria-label={`Inspect tag ${value.tag}: ${value.item}`} aria-pressed={selected === value.tag} onClick={event => inspect(value.tag, event.currentTarget)}><span className="scene-tag-number">{value.tag}</span><span><strong>{value.item}</strong><small>{examined.has(value.tag) ? 'Examined' : 'Not yet examined'}</small></span><img loading="lazy" src={photoURL(value.photos[0]!)} alt="" /></button></li>)}</ol>
        <p className="scene-small">Examined means a source photo was opened or a Source colours close-up held still for 2 seconds. Detective view does not count. Status lasts only in this page session.</p>
      </aside>
      {!panel && (item || unknown) && <aside className="scene-selected scene-panel" aria-label="Selected clue">
        {item ? <><span className="scene-eyebrow">Tag {item.tag}</span><h2>{item.item}</h2><p>{marker ? 'Provisional marker identity' : 'Position unavailable. No scan marker has been assigned.'}</p><p className="scene-examined">{examined.has(item.tag) ? 'Examined' : 'Not yet examined'}</p><img className="scene-selected-photo" src={photoURL(item.photos[0]!)} alt="Source documentation preview" /><div className="scene-actions"><button onClick={() => { setPhoto(item.tag); setPhotoFailed(false); photoDialog.current?.showModal(); }}>Open photo</button><button onClick={closeSelection}>Return to room</button></div><details><summary>Details</summary>{marker && <p className="scene-coordinates">Scanner xyz: {marker.centroid.map(n => n.toFixed(3)).join(', ')} m</p>}<p>Marker numbering is manual and provisional. Reddish traces were applied by instructors, not evidence of blood.</p><p>{data?.attribution}</p></details></> : <><h2>Unidentified marker</h2><p>Detected by colour; no number assigned.</p><button onClick={closeSelection}>Return to room</button></>}
      </aside>}
      <Notebook csrf={csrf} evidence={data?.evidence ?? []} open={panel === 'notes'} close={() => { setPanel(null); notesButton.current?.focus(); }} />
    </div>
    <dialog ref={photoDialog} className="scene-photo" onClose={() => { setPhoto(null); }}><header><h2>Tag {photo}: {photoItem?.item}</h2><button onClick={() => photoDialog.current?.close()}>Close photo</button></header>{photoItem && <img key={photo} src={photoURL(photoItem.photos[0]!)} alt={`Source documentation of ${photoItem.item}, tag ${photo}`} onLoad={() => { if (photo !== null && photoDialog.current?.open) mark(photo); }} onError={() => setPhotoFailed(true)} />}{photoFailed && <p role="alert">Photo unavailable. Examined status has not changed.</p>}<p>Source photograph, not generated completion. Daudigny &amp; Grussenmeyer (2026), University of Lausanne. CC BY-NC-SA 4.0.</p></dialog>
  </main>;
}
