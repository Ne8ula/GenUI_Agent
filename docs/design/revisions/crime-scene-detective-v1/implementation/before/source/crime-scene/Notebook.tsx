import { useEffect, useRef, useState } from 'react';
import { sceneRequest } from './api.ts';
import { editNotes, undoNotes } from './state.ts';
import type { Evidence, Note, NotesState } from './state.ts';
type Saved = { notes: Note[]; revision: string };
type ReplyStatus = { available: boolean; remaining: number };
export function Notebook({ csrf, evidence, open, close }: { csrf: string; evidence: Evidence[]; open: boolean; close: () => void }) {
  const [state, setState] = useState<NotesState>({ current: [], history: [] });
  const [saved, setSaved] = useState<Saved | null>(null), [status, setStatus] = useState<ReplyStatus | null>(null);
  const [message, setMessage] = useState('Opening your private notebook…'), [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; notes_revision: string } | null>(null), [asking, setAsking] = useState(false);
  const [consent, setConsent] = useState(false), [replaceDraft, setReplaceDraft] = useState(false);
  const request = useRef<AbortController | null>(null), generation = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  const dirty = saved !== null && JSON.stringify(saved.notes) !== JSON.stringify(state.current);
  const chars = state.current.reduce((sum, note) => sum + note.text.length, 0);
  useEffect(() => {
    if (!csrf) return;
    const abort = new AbortController();
    void sceneRequest<Saved>('crime-scene/notes', csrf, abort.signal).then(value => {
      setSaved(value); setState({ current: value.notes, history: [] }); setMessage('Saved notes reopened.');
    }).catch(error => { if (!abort.signal.aborted) setMessage(error.message); });
    void sceneRequest<ReplyStatus>('crime-scene/status', csrf, abort.signal).then(setStatus).catch(() => {});
    return () => { abort.abort(); request.current?.abort(); generation.current++; };
  }, [csrf]);
  useEffect(() => {
    if (open) heading.current?.focus();
    else {
      if (request.current && !request.current.signal.aborted) {
        request.current.abort(); setMessage('Reply cancelled locally. No retry; remote processing or cost may have occurred.');
      }
      generation.current++; setAsking(false); setConsent(false);
    }
  }, [open]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function edit(notes: Note[]) { setState(current => editNotes(current, notes)); setConsent(false); }
  function change(index: number, note: Note) { edit(state.current.map((n, i) => i === index ? note : n)); }
  async function save() {
    if (!saved) return; setBusy(true); setMessage('Saving notes…');
    try {
      const result = await sceneRequest<Saved>('crime-scene/notes', csrf, new AbortController().signal, { revision: saved.revision, notes: state.current });
      setSaved(result); setMessage('Saved as private Markdown.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function reopen() {
    setBusy(true); setReplaceDraft(false);
    try {
      const result = await sceneRequest<Saved>('crime-scene/notes', csrf, new AbortController().signal);
      setSaved(result); setState(current => editNotes(current, result.notes)); setReply(null); setConsent(false); setMessage('Saved notes reopened. Undo can restore your previous draft.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function ask() {
    if (!saved || dirty || !consent || asking) return;
    const abort = new AbortController(); request.current = abort; const id = ++generation.current;
    setAsking(true); setReply(null); setMessage('EVA is reading the saved notes.'); setConsent(false);
    try {
      const value = await sceneRequest<{ text: string; notes_revision: string; remaining: number }>('crime-scene/reply', csrf, abort.signal, { revision: saved.revision, consent: true });
      if (generation.current === id && !abort.signal.aborted) { setReply(value); setMessage('EVA replied. This is an interpretation, not evidence.'); }
    } catch (error) { if (!abort.signal.aborted) setMessage((error as Error).message); }
    finally {
      if (generation.current === id) setAsking(false);
      if (request.current === abort) request.current = null;
      void sceneRequest<ReplyStatus>('crime-scene/status', csrf, new AbortController().signal).then(setStatus).catch(() => setStatus(null));
    }
  }
  return <aside className="scene-notebook" id="scene-notebook" hidden={!open} aria-label="Notes" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  }}>
    <div className="scene-panel-title"><h2 tabIndex={-1} ref={heading}>Notes</h2><button onClick={close} aria-label="Close notes">Close</button></div>
    <section className="scene-eva" aria-label="EVA's reply">
      <h3>EVA</h3>
      {reply ? <><span className="scene-chip">from your notes</span><p className="scene-reply">{reply.text}</p><small>Untrusted interpretation, not evidence.{(dirty || reply.notes_revision !== saved?.revision) && ' Your notes have changed since this reply.'}</small></> : <p>Write what you notice. EVA can comment on saved notes, not on the photos.</p>}
      {status?.available === false ? <p>EVA's replies need an API key</p> : <>
        <p className="scene-small">Send saved notes, documented item names and detected marker positions to Anthropic. No photos. Opus 5.5; at most 2,048 output tokens and five requests per private session. Failed or cancelled submissions may count and incur cost.</p>
        <label className="scene-consent"><input type="checkbox" checked={consent} disabled={asking || !status?.available || dirty} onChange={event => setConsent(event.target.checked)} /> I agree to send this saved notebook for one reply.</label>
        <button disabled={!consent || dirty || busy || asking || !status?.remaining || !saved || !state.current.some(n => n.text.trim())} onClick={() => void ask()}>Ask EVA{status ? ` (${status.remaining} left)` : ''}</button>
      </>}
      {asking && <p className="scene-small">Closing Notes cancels this reply locally; remote processing or cost may already have occurred.</p>}
      {asking && <button onClick={() => { request.current?.abort(); generation.current++; setAsking(false); setMessage('Reply cancelled locally. No retry; remote processing or cost may have occurred.'); }}>Cancel reply</button>}
    </section>
    <p className="scene-small">Private Markdown on this computer, tied to this browser's 30-day private session. Keep this session to reopen it. Examined statuses are not saved.</p>
    <fieldset disabled={busy || asking || !saved} className="scene-note-fields">
      <legend className="scene-sr">Your notes</legend>
      {state.current.map((note, i) => <article className="scene-note" key={i}>
        <label htmlFor={`scene-note-${i}`}>Note {i + 1}</label>
        <textarea id={`scene-note-${i}`} value={note.text} maxLength={2000} rows={3} onChange={event => change(i, { ...note, text: event.target.value })} />
        <div className="scene-chips">{note.tags.map(tag => <span className="scene-chip" key={tag}>Tag {tag}</span>)}</div>
        <details><summary>Link tags</summary><div className="scene-tag-picker">{evidence.map(item => <label key={item.tag}><input type="checkbox" checked={note.tags.includes(item.tag)} onChange={event => change(i, { ...note, tags: event.target.checked ? [...note.tags, item.tag] : note.tags.filter(t => t !== item.tag) })} />{item.tag} {item.item}</label>)}</div></details>
        <button onClick={() => edit(state.current.filter((_, index) => index !== i))}>Remove note {i + 1}</button>
      </article>)}
      <div className="scene-actions"><button disabled={state.current.length >= 40} onClick={() => edit([...state.current, { text: '', tags: [] }])}>Add note</button><button disabled={!state.history.length} onClick={() => { setState(undoNotes); setConsent(false); }}>Undo</button></div>
    </fieldset>
    <p className="scene-small">{chars.toLocaleString()} / 12,000 characters. Undo keeps up to 32 edits in this page session.</p>
    <div className="scene-actions"><button disabled={!dirty || busy || asking || chars > 12000} onClick={() => void save()}>Save notes</button><button disabled={busy || asking || !csrf} onClick={() => dirty ? setReplaceDraft(true) : void reopen()}>Reopen saved</button></div>
    {replaceDraft && <div><p>Replace your unsaved draft with saved notes? Undo will keep this draft.</p><button onClick={() => void reopen()}>Replace draft</button><button onClick={() => setReplaceDraft(false)}>Keep draft</button></div>}
    <p role="status">{dirty ? 'Unsaved changes. ' : ''}{message}</p>
  </aside>;
}
