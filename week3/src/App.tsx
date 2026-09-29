import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { EyeStage } from './visual/EyeStage';
import { imageSampler, splitSampler, uniformSampler, type BackdropSampler } from './visual/backdrop';
import { Conversation } from './voice/conversation';
import { Microphone } from './voice/microphone';
import { LocalPlayback } from './voice/playback';
import { nativeTransport } from './voice/transport';
import type { Readiness, Stance, TurnState } from './voice/contracts';

const stances: Stance[] = ['attentive', 'comforting', 'shared_joy', 'congratulatory', 'supportive'];
const states: TurnState[] = ['idle', 'listening', 'processing', 'speaking', 'interrupted', 'unavailable'];
const query = new URLSearchParams(location.search);
const fixture = import.meta.env.DEV && query.has('fixture');
// Review-only test backdrops behind the transparent page (dev fixture only). They simulate the
// luminance a native sample would report; they are not native transparency evidence.
const TEST_BACKDROPS: Record<string, { css: string; sampler: () => BackdropSampler; label: string }> = {
  desktop: { css: 'center / cover no-repeat url("/docs/design/revisions/w3-cloud-20260928-a-p1/references/images/img-20-synthetic-desktop.png") #0b1633', sampler: () => imageSampler('/docs/design/revisions/w3-cloud-20260928-a-p1/references/images/img-20-synthetic-desktop.png'), label: 'synthetic desktop image' },
  white: { css: '#ffffff', sampler: () => uniformSampler(1), label: 'white' },
  dark: { css: '#0b1633', sampler: () => uniformSampler(0.06), label: 'dark' },
  split: { css: 'linear-gradient(to right, #ffffff 50%, #0b1633 50%)', sampler: () => splitSampler(), label: 'white left / dark right' },
};
// A transparent page in a plain browser sits on white, so the fixture defaults to the dark test backdrop; `backdrop=none` shows raw transparency.
const testBackdrop = fixture ? TEST_BACKDROPS[query.get('backdrop') ?? 'dark'] : undefined;

export function App() {
  const conversation = useMemo(() => new Conversation(nativeTransport, new Microphone(), new LocalPlayback()), []);
  const view = useSyncExternalStore(conversation.subscribe, conversation.snapshot);
  const [status, setStatus] = useState<Readiness | null>(null);
  const [consent, setConsent] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches || query.has('reduced'));
  const [fixtureStance, setFixtureStance] = useState<Stance>(stances.find(s => s === query.get('stance')) ?? 'attentive');
  const [fixtureState, setFixtureState] = useState<TurnState>(states.find(s => s === query.get('state')) ?? 'speaking');
  const [seed, setSeed] = useState(Number(query.get('seed')) || 42);
  const [fixtureActive, setFixtureActive] = useState(true);
  const [visualFailed, setVisualFailed] = useState(false);
  const backdrop = useMemo(() => testBackdrop?.sampler(), []);
  useEffect(() => {
    if (!testBackdrop) return;
    document.body.style.background = testBackdrop.css;
    return () => { document.body.style.background = ''; };
  }, []);
  const refresh = () => { void nativeTransport.status().then(setStatus).catch(() => setStatus({ ready: false, missing: ['Backend unavailable. Relaunch the native app.'], providers: { stt: '', reply: '', tts: '' }, remainingTurns: 0 })); };
  useEffect(() => {
    refresh();
    const end = () => conversation.end();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); conversation.stop(); }
    };
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(motion.matches);
    window.addEventListener('pagehide', end);
    window.addEventListener('keydown', key);
    motion.addEventListener('change', change);
    return () => {
      conversation.end();
      window.removeEventListener('pagehide', end);
      window.removeEventListener('keydown', key);
      motion.removeEventListener('change', change);
    };
  }, [conversation]);
  const active = fixture ? fixtureActive : view.active || (!view.ended && view.state === 'idle');
  const state = fixture ? fixtureState : view.muted && view.state === 'listening' ? 'idle' : view.state;
  return <main className="experience">
    <header className="masthead">
      <span className="wordmark">eva<span className="wordmark-dot">.</span></span>
      <div className="mic-status"><span className={`status-dot ${view.active && !view.muted ? 'is-live' : ''}`} />{view.starting ? 'Microphone permission pending' : view.active ? view.muted ? 'Microphone muted' : 'Microphone on' : 'Microphone off'}</div>
    </header>
    {fixture && <aside className="fixture-banner">Synthetic visual fixture · no microphone, inference or speech playback{testBackdrop && ` · test backdrop: ${testBackdrop.label} (browser, not native)`} <a href="/">Conversation setup</a></aside>}
    <section className="presence" data-seed={fixture ? seed : undefined} aria-label="Expressive eye; decorative interpretation, not emotion detection">
      {!visualFailed && <VisualBoundary onError={() => setVisualFailed(true)}>
        <EyeStage state={state} stance={fixture ? fixtureStance : view.stance} intensity={fixture ? .65 : view.intensity} seed={fixture ? seed : view.seed} reducedMotion={reduced} active={active} backdrop={backdrop} />
      </VisualBoundary>}
      {visualFailed && <p className="visual-fallback">Visuals unavailable. Voice controls remain active.</p>}
    </section>
    <section className="conversation-space" aria-label="Conversation">
      {!view.active && !view.starting && !fixture && <h1>A little room to talk.</h1>}
      {captions && view.active && <div className="captions" aria-live="polite" aria-atomic="true">
        {view.transcript && <p className="heard"><span>You said</span> {view.transcript}</p>}
        {view.reply && <p className="answer">{view.reply}</p>}
      </div>}
      <p className="turn-status" role="status">{fixture ? `Visual fixture: ${fixtureState.replaceAll('_', ' ')} / ${fixtureStance.replaceAll('_', ' ')}` : view.message}</p>
      {!view.active && !fixture && <details className="privacy" open={!consent}>
        <summary>Before we talk</summary>
        <p>Your microphone audio and recent conversation text go to OpenAI; reply text goes to ElevenLabs. This app keeps conversation only in memory and clears it on End. Providers may retain data; zero-retention settings have not been verified. No camera or screen is captured.</p>
        <p>For this demo, use invented, non-sensitive conversation. EVA can acknowledge and offer low-stakes ideas, but cannot verify external facts or perform tasks. Speaker echo handling still needs your device test.</p>
        <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I understand and want to enable the microphone.</label>
      </details>}
      {!fixture && <div className="primary-controls">
        {!view.active && !view.starting && <button className="primary" disabled={!status?.ready || !consent} onClick={() => void conversation.start()}>Start conversation</button>}
        {view.active && <>
          <button onClick={() => conversation.mute()} aria-pressed={view.muted}>{view.muted ? 'Unmute microphone' : 'Mute microphone'}</button>
          <button onClick={() => conversation.stop()}>Stop response <kbd>Esc</kbd></button>
        </>}
        {(view.active || view.starting) && <button className="end" onClick={() => { conversation.end(); refresh(); }}>End session</button>}
      </div>}
      {!fixture && status && !status.ready && !view.active && <p className="setup-note">{status.missing.join(' · ')} <button className="text-button" onClick={refresh}>Check again</button></p>}
      {fixture && <div className="fixture-controls">
        <label>Stance <select aria-label="Fixture stance" value={fixtureStance} onChange={e => { setFixtureStance(e.target.value as Stance); setSeed(s => s + 137); }}>{stances.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>State <select aria-label="Fixture state" value={fixtureState} onChange={e => setFixtureState(e.target.value as TurnState)}>{states.map(s => <option key={s}>{s}</option>)}</select></label>
        <button onClick={() => setSeed(s => s + 137)}>New variation</button>
        <button onClick={() => { setFixtureState('interrupted'); setFixtureStance('attentive'); }}>Interrupt fixture</button>
        <button onClick={() => setFixtureActive(a => !a)}>{fixtureActive ? 'End fixture' : 'Start fixture'}</button>
      </div>}
    </section>
    <footer className="preferences">
      <button aria-pressed={captions} onClick={() => setCaptions(c => !c)}>Captions {captions ? 'on' : 'off'}</button>
      <button aria-pressed={reduced} onClick={() => setReduced(r => !r)}>Reduced motion {reduced ? 'on' : 'off'}</button>
      {import.meta.env.DEV && !fixture && <a href="?fixture&state=processing">Visual rehearsal · no microphone</a>}
      <span>Week 3 · experimental conversation</span>
    </footer>
  </main>;
}

import { Component, type ReactNode } from 'react';
class VisualBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
