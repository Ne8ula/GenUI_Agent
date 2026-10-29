import { useEffect, useRef, useState } from 'react';
import { sceneRequest } from './api.ts';
import { EVA_LIMIT, askBody, investigationCopy, investigationSections } from './investigation.ts';
import type { Investigation, Source } from './investigation.ts';
import type { Scenario } from './playback.ts';
type Status = { demo?: boolean; available: boolean; remaining: number; max_tokens: number; history_revision: string; research: Source[]; turns: unknown[] };
type Reply = { investigation: Investigation; transcript_revision: string; remaining: number };
export function AskEva({ csrf, scanned, open, close, onScenario }: { csrf: string; scanned: number[]; open: boolean; close: () => void; onScenario: (s: Scenario | null) => void }) {
  const [status, setStatus] = useState<Status | null>(null), [question, setQuestion] = useState(''), [consent, setConsent] = useState(false);
  const [asking, setAsking] = useState(false), [message, setMessage] = useState('Opening the EVA conversation…'), [result, setResult] = useState<Investigation | null>(null);
  const request = useRef<AbortController | null>(null), generation = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  const copy = investigationCopy(status?.demo);
  const refresh = (signal: AbortSignal) => sceneRequest<Status>('crime-scene/investigation', csrf, signal).then(setStatus);
  useEffect(() => {
    if (!csrf) return;
    const abort = new AbortController();
    void refresh(abort.signal).then(() => setMessage('')).catch(error => { if (!abort.signal.aborted) setMessage(error.message); });
    return () => { abort.abort(); request.current?.abort(); generation.current++; };
  }, [csrf]);
  useEffect(() => {
    // Hiding the panel leaves a running question alone; only Cancel question cancels it.
    if (!open || !csrf) return;
    heading.current?.focus();
    const abort = new AbortController();
    void refresh(abort.signal).catch(() => {});
    return () => abort.abort();
  }, [open, csrf]);
  async function ask() {
    if (!status || !consent || asking || !question.trim() || !scanned.length) return;
    const abort = new AbortController(); request.current = abort; const id = ++generation.current;
    setAsking(true); setResult(null); setMessage(copy.working); setConsent(false);
    try {
      const value = await sceneRequest<Reply>('crime-scene/ask', csrf, abort.signal, askBody(question, scanned, status.history_revision));
      if (generation.current === id && !abort.signal.aborted) {
        setResult(value.investigation); setStatus({ ...status, remaining: value.remaining, history_revision: value.transcript_revision });
        setMessage(copy.answered);
      }
    } catch (error) { if (!abort.signal.aborted) setMessage((error as Error).message); }
    finally {
      if (generation.current === id) setAsking(false);
      if (request.current === abort) request.current = null;
      // Failed or rejected questions may still count; the saved transcript may also have moved.
      void refresh(new AbortController().signal).catch(() => {});
    }
  }
  return <aside className="scene-panel scene-ask-eva" id="scene-ask-eva" hidden={!open} aria-label="Ask EVA">
    <div className="scene-panel-title"><h2 tabIndex={-1} ref={heading}>Ask EVA</h2><button onClick={close} aria-label="Close Ask EVA">Close</button></div>
    <p className="scene-small">{copy.intro}</p>
    {status?.available === false ? <p>EVA's replies need an API key</p> : <>
      <label htmlFor="scene-eva-question">Question</label>
      <textarea id="scene-eva-question" value={question} maxLength={500} rows={3} disabled={asking} placeholder="How could the chair have been knocked over?" onChange={event => { setQuestion(event.target.value); setConsent(false); }} />
      <p className="scene-small">{question.length} / 500 characters · scanned tags {scanned.join(', ')}. {status?.demo === true ? 'Canned examples; no live model. At most ' : `Opus 5.5; at most ${status?.max_tokens.toLocaleString() ?? '8,192'} output tokens and `}{EVA_LIMIT} questions per private session. Failed or cancelled questions may count.{status && status.turns.length > 0 ? ` ${status.turns.length} earlier turn${status.turns.length === 1 ? '' : 's'} in context.` : ''}</p>
      <label className="scene-consent"><input type="checkbox" checked={consent} disabled={asking || !status?.available || !question.trim()} onChange={event => setConsent(event.target.checked)} /> {copy.consent}</label>
      <div className="scene-actions"><button disabled={!consent || asking || !status?.remaining || !question.trim()} onClick={() => void ask()}>Ask EVA</button>{status && <span className="scene-small">{status.remaining} of {EVA_LIMIT} left</span>}</div>
      {asking && <p className="scene-small">You can close this panel; the question keeps running until it answers or you cancel it.</p>}
      {asking && <button onClick={() => { request.current?.abort(); generation.current++; setAsking(false); setMessage(copy.cancelled); }}>Cancel question</button>}
    </>}
    <p role="status">{message}</p>
    {result && <div className="scene-investigation">
      {investigationSections(result, status?.research ?? []).map(section => <section key={section.title}><h3>{section.title}</h3>{section.items.length ? section.items.map((item, i) => <p className="scene-reply" key={i}>{item}</p>) : <p className="scene-small">None reported.</p>}</section>)}
      <section><h3>Reconstruction</h3><p className="scene-reply">{result.reconstruction.title}</p><p className="scene-small">Hypothetical; actors are generic figures{result.reconstruction.actors.length ? ': ' + result.reconstruction.actors.map(actor => `${actor.id} ${actor.label}`).join(', ') : ''}.</p>
        <div className="scene-actions"><button onClick={() => onScenario(result.reconstruction)}>Play reconstruction</button></div></section>
    </div>}
  </aside>;
}
