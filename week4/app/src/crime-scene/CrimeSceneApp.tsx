import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createSceneRenderer } from './renderer.ts';
import type { SceneRenderer, CameraView } from './renderer.ts';
import { createCard } from './card.ts';
import { captureTimeline } from './firstperson.ts';
import { sceneRequest } from './api.ts';
import { FFS } from './state.ts';
import type { Marker, SceneData } from './state.ts';
import { NO_REVIEW, generatorLabel, hologramLabel, loadReview, modelLabel } from './models.ts';
import type { Review } from './models.ts';
import { Notebook } from './Notebook.tsx';
import { AskEva } from './AskEva.tsx';
import { duration } from './playback.ts';
import type { Scenario } from './playback.ts';
import { IDLE, advance, escape, load, step as stepPlayback, stepCaption, toggle } from './investigation.ts';
import type { Playback } from './investigation.ts';
import './crime-scene.css';
const SCAN_MS = 1200, NARROW = '(max-width: 650px)';

function EvidenceCard({ name }: { name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); return canvas.current ? createCard(canvas.current, FFS, name, () => setFailed(true)) : undefined; }, [name]);
  return <figure className="scene-card"><canvas ref={canvas} aria-label="Source photo lifted by estimated relative depth" />
    <figcaption>{failed ? 'Depth card unavailable.' : 'Relief from estimated relative depth, not measurement.'}</figcaption></figure>;
}

export function CrimeSceneApp() {
  const canvas = useRef<HTMLCanvasElement>(null), labels = useRef<HTMLDivElement>(null), renderer = useRef<SceneRenderer | null>(null);
  const camera = useRef<CameraView | undefined>(undefined), focusReturn = useRef<HTMLElement | null>(null);
  const cluesButton = useRef<HTMLButtonElement>(null), cluesHeading = useRef<HTMLHeadingElement>(null), viewControls = useRef<HTMLDetailsElement>(null);
  const notesButton = useRef<HTMLButtonElement>(null), photoDialog = useRef<HTMLDialogElement>(null), scanTimer = useRef(0), evaButton = useRef<HTMLButtonElement>(null);
  // Precise playback clock for the renderer; React samples it at ≤10 Hz for the bar.
  const time = useRef(0), bar = useRef<HTMLDivElement>(null), focusBar = useRef(false);
  const [data, setData] = useState<SceneData | null>(null), [csrf, setCsrf] = useState('');
  const [attempt, setAttempt] = useState(0), [loadAttempt, setLoadAttempt] = useState(0), [enabled, setEnabled] = useState(true);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'cancelled' | 'error'>('loading'), [error, setError] = useState('');
  const [progress, setProgress] = useState(0), [selected, setSelected] = useState<number | null>(null), [unknown, setUnknown] = useState(false);
  const [panel, setPanel] = useState<'clues' | 'notes' | 'eva' | null>(null), [examined, setExamined] = useState<Set<number>>(new Set());
  const [original, setOriginal] = useState(false), [scanned, setScanned] = useState<number[]>([]), [moment, setMoment] = useState(0);
  const [aimed, setAimed] = useState<Marker | null>(null), [scan, setScan] = useState<number | null>(null), [status, setStatus] = useState('');
  const [dwell, setDwell] = useState<number | null>(null), [photo, setPhoto] = useState<number | null>(null), [photoFailed, setPhotoFailed] = useState(false);
  const [review, setReview] = useState<Review>(NO_REVIEW);
  // EVA's hypothetical reconstruction: its own clock, never reset by walking or scanning.
  const [play, setPlay] = useState<Playback>(IDLE), [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const scenario = play.scenario;
  // The renderer commits review assets after 'ready'; this re-renders so the hologram note re-reads the committed state.
  const [, reviewed] = useReducer((n: number) => n + 1, 0);
  const marker = data?.markers.find(value => value.tag === selected && selected !== null);
  const timeline = data ? captureTimeline(data) : [], now = timeline[moment];
  const beacon = now && !scanned.includes(now.tag) ? now.tag : null;
  function mark(tag: number) { setExamined(current => current.has(tag) ? current : new Set([...current, tag])); }
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const session = await sceneRequest<{ csrf: string }>('session', '', abort.signal); setCsrf(session.csrf);
        const [value, decisions] = await Promise.all([sceneRequest<SceneData>('benchmark/ffs/tags.json', session.csrf, abort.signal), loadReview(abort.signal)]);
        if (!abort.signal.aborted) { setReview(decisions); setData(value); }
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
      view = createSceneRenderer(canvas.current, data, labels.current, fail, () => setDwell(null), camera.current, setAimed, () => { if (active) reviewed(); });
      renderer.current = view;
      view.setPresentation(original); view.setScanned(scanned); view.setBeacon(beacon); view.setReview(review); view.setScenario(scenario);
      void view.load(setProgress).then(() => { if (active) setPhase('ready'); }).catch(e => fail((e as Error).message));
    } catch (e) { fail((e as Error).message); }
    return () => { active = false; if (view) { camera.current = view.snapshot(); view.dispose(); } renderer.current = null; };
  }, [data, attempt, enabled]);
  useEffect(() => { renderer.current?.setPresentation(original); }, [original, phase]);
  useEffect(() => { renderer.current?.setScanned(scanned); }, [scanned, phase]);
  useEffect(() => { renderer.current?.setBeacon(beacon); }, [beacon, phase]);
  useEffect(() => {
    const view = renderer.current; if (!view) return;
    if (scenario) { view.setScenario(scenario); view.setPlayback(time.current); } else { view.stopPlayback(); view.setScenario(null); }
  }, [scenario, phase]);
  useEffect(() => {
    if (!play.playing || !scenario) return;
    let last = performance.now(), sampled = last, frame = 0;
    const loop = (now: number) => {
      // Clamp dt so a hidden tab resumes where it paused instead of jumping to the end.
      const next = advance({ scenario, t: time.current, playing: true }, Math.min(0.1, (now - last) / 1000)); last = now;
      time.current = next.t; renderer.current?.setPlayback(next.t);
      if (!next.playing || now - sampled >= 100) { sampled = now; setPlay(next); }
      if (next.playing) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [play.playing, scenario]);
  useEffect(() => { if (phase !== 'ready') setPlay(current => current.playing ? { ...current, playing: false } : current); }, [phase]);
  useEffect(() => { if (focusBar.current && scenario) { focusBar.current = false; bar.current?.focus(); } }, [scenario]);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(query.matches); if (query.matches) setPlay(current => ({ ...current, playing: false })); };
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => { if (panel === 'clues') cluesHeading.current?.focus(); }, [panel]);
  useEffect(() => {
    if (dwell === null || !original || phase !== 'ready' || document.hidden) return;
    let timer = window.setTimeout(() => mark(dwell), 2000);
    const hidden = () => { clearTimeout(timer); timer = 0; setDwell(null); };
    document.addEventListener('visibilitychange', hidden);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', hidden); };
  }, [dwell, original, phase]);
  useEffect(() => {
    if (!status || status === 'Scanning') return;
    const timer = window.setTimeout(() => setStatus(''), 2500); return () => clearTimeout(timer);
  }, [status]);
  useEffect(() => () => clearInterval(scanTimer.current), []);
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
  function stopScan() { clearInterval(scanTimer.current); scanTimer.current = 0; setScan(null); }
  // Hold to scan: whatever is under the reticle when the ring completes is reconstructed.
  function startScan() {
    if (phase !== 'ready' || scanTimer.current) return;
    const begun = performance.now(); setStatus('Scanning'); setScan(0); setDwell(null);
    scanTimer.current = window.setInterval(() => {
      const value = Math.min(1, (performance.now() - begun) / SCAN_MS); setScan(value);
      if (value < 1) return;
      stopScan();
      const target = renderer.current?.aimed() ?? null, tag = target?.tag ?? null;
      if (tag !== null) {
        setScanned(list => list.includes(tag) ? list : [...list, tag]); setStatus(`Detected · tag ${tag}`);
        setSelected(tag); setUnknown(false); setPanel(null); focusReturn.current = canvas.current;
      } else setStatus(target ? 'Unidentified marker · no number assigned' : 'No evidence');
    }, 40);
  }
  function releaseScan() { if (scanTimer.current) { stopScan(); setStatus('Scan cancelled'); } }
  function travel(next: number) { if (timeline.length) setMoment(Math.min(timeline.length - 1, Math.max(0, next))); }
  function togglePanel(next: 'clues' | 'notes' | 'eva') {
    setDwell(null); setPanel(current => current === next ? null : next);
    if (viewControls.current) viewControls.current.open = false;
  }
  // Every discrete playback change starts from the precise clock, then syncs renderer and bar.
  // Only the loaded scenario gets the clock: a clear or a new scenario reaches the renderer through the scenario effect, never as a frame of the old one.
  function commit(next: Playback) { time.current = next.t; if (next.scenario && next.scenario === scenario) renderer.current?.setPlayback(next.t); setPlay(next); }
  const current = () => ({ ...play, t: time.current });
  function loadScenario(next: Scenario | null) {
    commit(load(next, reduced));
    if (next && matchMedia(NARROW).matches) { setPanel(null); focusBar.current = true; }
  }
  function clearScenario() { commit(IDLE); evaButton.current?.focus(); }
  function stop() { setEnabled(false); setPhase('cancelled'); setDwell(null); stopScan(); }
  function reopen() { setEnabled(true); setAttempt(value => value + 1); if (!data) setLoadAttempt(value => value + 1); }
  const holdKeys = (event: KeyboardEvent) => event.key === ' ' || event.key === 'Enter';
  const nowItem = data?.evidence.find(value => value.tag === now?.tag);
  const hologramNote = item && phase === 'ready' && scanned.includes(item.tag) ? hologramLabel(renderer.current?.hologram(item.tag) ?? { kind: 'sphere' }) : null;
  return <main className={'crime-scene-app' + (panel === 'eva' ? ' scene-eva-open' : '')} onKeyDown={event => {
    if (event.key === 'Escape' && !photoDialog.current?.open) {
      const next = escape(current());
      if (next) { if (next.scenario) commit(next); else clearScenario(); }
      else if (panel) { setPanel(null); (panel === 'notes' ? notesButton : panel === 'eva' ? evaButton : cluesButton).current?.focus(); }
      else if (viewControls.current?.open) { viewControls.current.open = false; viewControls.current.querySelector('summary')?.focus(); }
      else if (selected !== null || unknown) closeSelection();
    }
  }}>
    <header className="scene-header"><a href="?scene=teal-bedroom" className="scene-brand" aria-label="EVA, return to bedroom">EVA</a><div><h1>Scene investigation</h1><p>FFS th_0028 · staged teaching scene</p></div><nav aria-label="Investigation"><button ref={cluesButton} aria-expanded={panel === 'clues'} aria-controls="scene-clues" onClick={() => togglePanel('clues')}>Clues</button><button ref={notesButton} aria-expanded={panel === 'notes'} aria-controls="scene-notebook" onClick={() => togglePanel('notes')}>Notes</button><button ref={evaButton} disabled={!scanned.length} aria-expanded={panel === 'eva'} aria-controls="scene-ask-eva" onClick={() => togglePanel('eva')}>{scanned.length ? 'Ask EVA' : 'Ask EVA (scan a clue first)'}</button></nav></header>
    <div className="scene-workspace">
      <section className="scene-stage" aria-label="Scene view">
        <canvas ref={canvas} tabIndex={0} aria-busy={phase === 'loading'} aria-label="First-person scene view. Drag or arrow keys to look, W A S D to walk, hold Space to scan, Q and E to step the photo timeline, Home to return to the scanner position."
          onKeyDown={event => {
            if (event.key === ' ') { event.preventDefault(); if (!event.repeat) startScan(); }
            if (event.key.toLowerCase() === 'q') travel(moment - 1);
            if (event.key.toLowerCase() === 'e') travel(moment + 1);
          }} onKeyUp={event => { if (event.key === ' ') releaseScan(); }} />
        <div className="scene-vignette" hidden={original} />
        <p className="scene-caption">{phase === 'loading' ? 'Opening measured scan' : `Measured laser scan · ${original ? 'source colours' : 'detective view'}`}<span>{phase === 'loading' ? 'Single scanner position, eye height' : original ? 'Scan points, not a reconstructed event' : 'Tint, holograms and beacon are display effects'}</span></p>
        <div ref={labels} className="scene-markers" hidden={phase !== 'ready'}>{data?.markers.map(value => <button key={value.id} data-marker={value.id} className="scene-marker" aria-label={value.tag ? `Inspect tag ${value.tag}` : 'Unidentified detected marker'} aria-pressed={value.tag ? selected === value.tag : unknown} onClick={event => {
          if (value.tag) inspect(value.tag, event.currentTarget);
          else { focusReturn.current = event.currentTarget; renderer.current?.inspect(value); setPanel(null); setUnknown(true); setSelected(null); setDwell(null); }
        }}><span>{value.tag ?? '?'}</span></button>)}<span className="scene-beacon-arrow" hidden aria-hidden="true">›</span></div>
        {phase === 'ready' && <div className="scene-reticle" data-aimed={aimed ? 'true' : 'false'} data-scanning={scan !== null} style={{ '--scan': scan ?? 0 } as CSSProperties} aria-hidden="true" />}
        <p className="scene-scan-status" role="status">{phase !== 'ready' ? '' : status || (aimed ? (aimed.tag ? `Tag ${aimed.tag} in view · hold Space to scan` : 'Unidentified marker in view') : '')}</p>
        {phase === 'ready' && now && <div className="scene-timeline">
          <span>{timeline[0]!.time}</span>
          <input type="range" min={0} max={timeline.length - 1} step={1} value={moment} aria-label="Photo capture timeline"
            aria-valuetext={`${now.time}, tag ${now.tag}: ${nowItem?.item ?? ''}`} onChange={event => travel(Number(event.target.value))} />
          <span>{timeline.at(-1)!.time}</span>
          <p>Photographed {now.time} · tag {now.tag} {nowItem?.item}{data?.markers.some(value => value.tag === now.tag) ? scanned.includes(now.tag) ? ' · reconstructed' : ' · beacon shown' : ' · position unavailable'}</p>
        </div>}
        {phase === 'ready' && scenario && <div ref={bar} tabIndex={-1} className="scene-playback" role="group" aria-labelledby="scene-playback-title">
          <p className="scene-hypothesis">EVA's hypothesis — not evidence</p>
          <p id="scene-playback-title" className="scene-playback-title">Hypothetical reconstruction</p>
          <div className="scene-playback-controls">
            {reduced ? <><button aria-label="Previous step" onClick={() => commit(stepPlayback(current(), -1))}>‹</button><button aria-label="Next step" onClick={() => commit(stepPlayback(current(), 1))}>›</button></>
              : <button aria-label={play.playing ? 'Pause reconstruction' : 'Play reconstruction'} onClick={() => commit(toggle(current()))}>{play.playing ? '❚❚' : '▶'}</button>}
            <input type="range" min={0} max={duration(scenario)} step={0.1} value={play.t} disabled={duration(scenario) === 0} aria-label="Reconstruction time" aria-valuetext={stepCaption(scenario, play.t)} onChange={event => commit({ scenario, t: Number(event.target.value), playing: false })} />
            <button onClick={clearScenario}>Remove</button>
          </div>
          <p>{scenario.title} · {stepCaption(scenario, play.t)}</p>
        </div>}
        {phase !== 'ready' && <div className="scene-loading" data-phase={phase} role="status"><h2>{phase === 'loading' ? 'Opening the scan' : phase === 'cancelled' ? 'Scan paused' : 'Scan unavailable'}</h2><p>{error || (phase === 'loading' ? 'Checking the retained measured scan. Depth maps were estimated in advance; no model is running.' : 'Notes and examined statuses stay in this page session.')}</p>{phase === 'loading' ? <><progress value={progress} max={1} aria-label="Scan download" /><div className="scene-actions"><button onClick={stop}>Cancel loading</button></div></> : <button onClick={reopen}>Reopen scan</button>}</div>}
        <div className="scene-view-controls"><button disabled={phase !== 'ready'} onClick={() => { closeSelection(); renderer.current?.reset(); }}>Reset view</button>
          <button className="scene-scan-button" disabled={phase !== 'ready'} onPointerDown={startScan} onPointerUp={releaseScan} onPointerLeave={releaseScan} onPointerCancel={releaseScan}
            onKeyDown={event => { if (holdKeys(event)) { event.preventDefault(); if (!event.repeat) startScan(); } }} onKeyUp={event => { if (holdKeys(event)) releaseScan(); }}>Hold to scan</button>
          <details ref={viewControls} onToggle={event => { if (event.currentTarget.open) { setPanel(null); setDwell(null); } }}><summary>View controls</summary><div className="scene-view-menu">
          <label><input type="checkbox" checked={original} onChange={event => { setOriginal(event.target.checked); setDwell(null); }} /> Source colours</label>
          <p className="scene-small">Use Source colours or a source photo to examine evidence. Scanning reconstructs a clue but does not count as examination.</p>
          <div className="scene-actions"><button disabled={phase !== 'ready'} aria-label="Turn left" onClick={() => { setDwell(null); renderer.current?.turn(-1); }}>↶</button><button disabled={phase !== 'ready'} aria-label="Turn right" onClick={() => { setDwell(null); renderer.current?.turn(1); }}>↷</button><button disabled={phase !== 'ready'} aria-label="Step forward" onClick={() => { setDwell(null); renderer.current?.step(1); }}>↑</button><button disabled={phase !== 'ready'} aria-label="Step back" onClick={() => { setDwell(null); renderer.current?.step(-1); }}>↓</button>{phase === 'ready' && <button onClick={stop}>Pause scan</button>}</div>
          <p className="scene-small">Drag or arrows to look · W A S D to walk · hold Space to scan · Q/E timeline.<br />Tab to a marker, Enter to inspect, Escape to return.</p>
          <details className="scene-source"><summary>Sources &amp; details</summary><p>The room is the measured laser scan, seen from the scanner's own position at eye height; walking is limited to the display crop, not detected walls, and scan holes grow with distance from the scanner. The cool grade, holograms, particles and beacon are display effects, not analysis. A hologram highlights an owner-approved scan segment, or otherwise the scan points within 34 cm of a marker (an approximate region). A fitted model is generated from the source photo and fitted to the scan; its hidden sides are completion, not measurement.</p>{data?.markers.flatMap(value => { const hologram = value.tag !== null && phase === 'ready' ? renderer.current?.hologram(value.tag) : undefined; return hologram?.kind === 'model' ? [<p key={value.tag}>Tag {value.tag}: {modelLabel(hologram.fit)}; {generatorLabel(hologram.fit)}.</p>] : []; })}<p>EVA's answers are hypotheses from the scanned clues, their photos and a curated research digest; each cited source shows the level at which it was verified. Figures are generic mannequins; a played reconstruction moves ghost copies only, never the measured scan.</p><p>The timeline is the photographer's capture order read from the photo files, not a reconstruction of events. Each evidence card lifts the source photo by relative depth estimated by Depth Anything V2 Small; it is not measured and does not place the photo in the room.</p><p>Single-position laser scan reduced to 712,312 points. Eight provisional marker numbers, one unidentified cluster. Tags 1, 11 and 20 are unlocated. Numbering is not validated.</p><p>Reddish traces were applied by instructors, not evidence of blood. No spatter analysis or validated forensic analysis.</p><p>{data?.attribution ?? 'Fictional Forensic Scenes — University of Lausanne. CC BY-NC-SA 4.0.'}</p></details>
        </div></details></div>
      </section>
      <aside id="scene-clues" className="scene-details scene-panel" hidden={panel !== 'clues'} aria-label="Clues"><div className="scene-panel-title"><h2 ref={cluesHeading} tabIndex={-1}>Clues</h2><button aria-label="Close clues" onClick={() => { setPanel(null); cluesButton.current?.focus(); }}>Close</button></div><p className="scene-small">11 documented items. Select one to inspect.</p>
        <ol className="scene-clues">{data?.evidence.map(value => <li key={value.tag}><button className="scene-clue" aria-label={`Inspect tag ${value.tag}: ${value.item}`} aria-pressed={selected === value.tag} onClick={event => inspect(value.tag, event.currentTarget)}><span className="scene-tag-number">{value.tag}</span><span><strong>{value.item}</strong><small>{examined.has(value.tag) ? 'Examined' : 'Not yet examined'}</small>{scanned.includes(value.tag) && <small>Reconstructed</small>}</span><img loading="lazy" src={photoURL(value.photos[0]!)} alt="" /></button></li>)}</ol>
        <p className="scene-small">Examined means a source photo was opened or a Source colours close-up held still for 2 seconds. Detective view and scanning do not count. Status lasts only in this page session.</p>
      </aside>
      {!panel && (item || unknown) && <aside className="scene-selected scene-panel" aria-label="Selected clue">
        {item ? <><span className="scene-eyebrow">Tag {item.tag}</span><h2>{item.item}</h2><p>{marker ? 'Provisional marker identity' : 'Position unavailable. No scan marker has been assigned.'}</p><p className="scene-examined">{examined.has(item.tag) ? 'Examined' : 'Not yet examined'}</p>{hologramNote && <p className="scene-hologram-note">Hologram: {hologramNote}</p>}{scanned.includes(item.tag) ? <EvidenceCard name={item.photos[0]!} /> : <img className="scene-selected-photo" src={photoURL(item.photos[0]!)} alt="Source documentation preview" />}<div className="scene-actions"><button onClick={() => { setPhoto(item.tag); setPhotoFailed(false); photoDialog.current?.showModal(); }}>Open photo</button><button onClick={closeSelection}>Return to room</button></div><details><summary>Details</summary>{marker && <p className="scene-coordinates">Scanner xyz: {marker.centroid.map(n => n.toFixed(3)).join(', ')} m</p>}<p>Marker numbering is manual and provisional. Reddish traces were applied by instructors, not evidence of blood.</p><p>{data?.attribution}</p></details></> : <><h2>Unidentified marker</h2><p>Detected by colour; no number assigned.</p><button onClick={closeSelection}>Return to room</button></>}
      </aside>}
      <Notebook csrf={csrf} evidence={data?.evidence ?? []} open={panel === 'notes'} close={() => { setPanel(null); notesButton.current?.focus(); }} />
      <AskEva csrf={csrf} scanned={scanned} open={panel === 'eva'} close={() => { setPanel(null); evaButton.current?.focus(); }} onScenario={loadScenario} />
    </div>
    <dialog ref={photoDialog} className="scene-photo" onClose={() => { setPhoto(null); }}><header><h2>Tag {photo}: {photoItem?.item}</h2><button onClick={() => photoDialog.current?.close()}>Close photo</button></header>{photoItem && <img key={photo} src={photoURL(photoItem.photos[0]!)} alt={`Source documentation of ${photoItem.item}, tag ${photo}`} onLoad={() => { if (photo !== null && photoDialog.current?.open) mark(photo); }} onError={() => setPhotoFailed(true)} />}{photoFailed && <p role="alert">Photo unavailable. Examined status has not changed.</p>}<p>Source photograph, not generated completion. Daudigny &amp; Grussenmeyer (2026), University of Lausanne. CC BY-NC-SA 4.0.</p></dialog>
  </main>;
}
