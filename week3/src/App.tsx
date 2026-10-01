import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { EyeStage } from './visual/EyeStage';
import { imageSampler, inkWeight, lumaAt, splitSampler, uniformSampler, type BackdropSampler } from './visual/backdrop';
import { clampAnchor, loadAnchor, onEye, saveAnchor, type Anchor } from './visual/placement';
import { isNativeOverlay, nativeBackdropSampler, quitOverlay, setRecordable, startPointerPolicy } from './overlay/native';
import { Conversation } from './voice/conversation';
import { Microphone } from './voice/microphone';
import { LocalPlayback } from './voice/playback';
import { nativeTransport } from './voice/transport';
import type { Readiness, Stance, TurnState } from './voice/contracts';

const stances: Stance[] = ['attentive', 'comforting', 'shared_joy', 'congratulatory', 'supportive'];
const states: TurnState[] = ['idle', 'listening', 'processing', 'speaking', 'interrupted', 'unavailable'];
const query = new URLSearchParams(location.search);
const fixture = import.meta.env.DEV && query.has('fixture');
const native = isNativeOverlay();
// Review-only test backdrops behind the transparent page (dev fixture only). They simulate the
// luminance a native sample would report; they are not native transparency evidence.
const TEST_BACKDROPS: Record<string, { css: string; sampler: () => BackdropSampler; label: string }> = {
  desktop: { css: 'center / cover no-repeat url("/docs/design/revisions/w3-cloud-20260928-a-p1/references/images/img-20-synthetic-desktop.png") #0b1633', sampler: () => imageSampler('/docs/design/revisions/w3-cloud-20260928-a-p1/references/images/img-20-synthetic-desktop.png'), label: 'synthetic desktop image' },
  white: { css: '#ffffff', sampler: () => uniformSampler(1), label: 'white' },
  dark: { css: '#0b1633', sampler: () => uniformSampler(0.06), label: 'dark' },
  split: { css: 'linear-gradient(to right, #ffffff 50%, #0b1633 50%)', sampler: () => splitSampler(), label: 'white left / dark right' },
};
// A transparent page in a plain browser sits on white, so browser previews default to the dark test
// backdrop (`backdrop=none` shows raw transparency). The native overlay has no backdrop of its own.
const testBackdrop = native ? undefined : TEST_BACKDROPS[(fixture && query.get('backdrop')) || 'dark'];
const PILL_HIDE_MS = 1200;

interface EyeLayoutCss { x: number; y: number; scale: number; restScale: number }

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
  const [anchor, setAnchor] = useState<Anchor>(() => (fixture ? { x: 0.86, y: 0.78 } : loadAnchor()));
  const [dismissed, setDismissed] = useState(false);
  const [pillShown, setPillShown] = useState(false);
  const [recordable, setRecordableState] = useState(false);
  const recordableRef = useRef(false);
  const backdrop = useMemo<BackdropSampler | undefined>(() => (native ? nativeBackdropSampler(() => recordableRef.current) : testBackdrop?.sampler()), []);

  const layoutRef = useRef<EyeLayoutCss | null>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const speechRef = useRef<HTMLDivElement>(null);
  const micRef = useRef<HTMLSpanElement>(null);
  const fixtureRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const positionQueued = useRef(false);
  const lumaCheckedAt = useRef(-Infinity);

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

  const showPill = useCallback(() => { window.clearTimeout(hideTimer.current); setPillShown(true); }, []);
  const hidePillSoon = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { if (!pillRef.current?.matches(':focus-within')) setPillShown(false); }, PILL_HIDE_MS);
  }, []);
  // Surface the controls when a session starts or ends so they are discoverable, then let them recede.
  useEffect(() => { if (view.active || view.starting) { showPill(); hidePillSoon(); } }, [view.active, view.starting, showPill, hidePillSoon]);

  // Place the chrome around the eye (img-01 pill above-left, img-02 card beside, img-03 captions below).
  const position = useCallback(() => {
    positionQueued.current = false;
    const l = layoutRef.current;
    if (!l) return;
    const vw = innerWidth, vh = innerHeight, m = 8;
    const ax = anchor.x * vw, ay = anchor.y * vh, rs = l.restScale;
    const place = (el: HTMLElement | null, left: number, top: number) => {
      if (!el) return;
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = `${Math.round(Math.min(vw - w - m, Math.max(m, left)))}px`;
      el.style.top = `${Math.round(Math.min(vh - h - m, Math.max(m, top)))}px`;
    };
    const handle = handleRef.current;
    if (handle) {
      handle.style.width = `${Math.round(1.6 * rs)}px`;
      handle.style.height = `${Math.round(1.05 * rs)}px`;
      handle.style.left = `${Math.round(ax - 0.8 * rs)}px`;
      handle.style.top = `${Math.round(ay - 0.525 * rs)}px`;
    }
    place(micRef.current, ax + 0.75 * rs, ay + 0.4 * rs);
    const card = cardRef.current;
    if (card) {
      const leftSide = ax - 0.9 * rs - 16 - card.offsetWidth;
      place(card, leftSide >= m ? leftSide : ax + 0.9 * rs + 16, ay + 0.55 * rs - card.offsetHeight);
    }
    const pill = pillRef.current;
    if (pill) {
      if (card) {
        // Never overlap the setup card: sit just above it (or below if there is no room).
        const top = card.offsetTop - pill.offsetHeight - 8;
        place(pill, card.offsetLeft, top >= m ? top : card.offsetTop + card.offsetHeight + 8);
      } else {
        const above = ay - 0.6 * rs - pill.offsetHeight - 6;
        place(pill, ax + 0.35 * rs - pill.offsetWidth, above >= m ? above : ay + 0.6 * rs + 6);
      }
    }
    const speech = speechRef.current;
    if (speech) {
      const below = l.y + 0.95 * l.scale + 10;
      const top = below + speech.offsetHeight <= vh - m ? below : l.y - 0.95 * l.scale - speech.offsetHeight - 10;
      place(speech, l.x - speech.offsetWidth / 2, top);
      // Caption ink follows the backdrop like the particles: bone over dark, charcoal over bright.
      const now = performance.now();
      if (backdrop && now - lumaCheckedAt.current > 400) {
        lumaCheckedAt.current = now;
        const grid = backdrop.sample({ left: 0, top: 0, width: vw, height: vh });
        const r = speech.getBoundingClientRect();
        const bright = inkWeight(lumaAt(grid, (r.left + r.width / 2) / vw, (r.top + r.height / 2) / vh)) > 0.5;
        speech.classList.toggle('on-bright', bright);
      }
    }
  }, [anchor, backdrop]);
  const onLayout = useCallback((layout: EyeLayoutCss) => {
    layoutRef.current = layout;
    if (!positionQueued.current) { positionQueued.current = true; requestAnimationFrame(position); }
  }, [position]);
  useEffect(() => { requestAnimationFrame(position); });
  useEffect(() => {
    const resize = () => requestAnimationFrame(position);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [position]);

  // Native: click-through everywhere except the eye and visible controls; cursor drives gaze.
  const hitTest = useCallback((x: number, y: number) => {
    if (dragRef.current) return true;
    const l = layoutRef.current;
    if (l && onEye(x, y, anchor.x * innerWidth, anchor.y * innerHeight, l.restScale)) return true;
    const inside = (el: HTMLElement | null) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    return inside(cardRef.current) || inside(fixtureRef.current) || (pillRef.current?.classList.contains('is-shown') === true && inside(pillRef.current));
  }, [anchor]);
  const hitRef = useRef(hitTest);
  hitRef.current = hitTest;
  useEffect(() => (native ? startPointerPolicy((x, y) => hitRef.current(x, y)) : undefined), []);

  const toggleRecordable = () => {
    const next = !recordable;
    recordableRef.current = next;
    setRecordableState(next);
    if (native) void setRecordable(next).catch(() => { recordableRef.current = !next; setRecordableState(!next); });
  };

  const moveAnchor = (next: Anchor) => setAnchor(clampAnchor(next, innerWidth, innerHeight, layoutRef.current?.restScale ?? 90));
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { dx: event.clientX - anchor.x * innerWidth, dy: event.clientY - anchor.y * innerHeight, moved: false };
    showPill();
  };
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const x = event.clientX - drag.dx, y = event.clientY - drag.dy;
    if (!drag.moved && Math.hypot(x - anchor.x * innerWidth, y - anchor.y * innerHeight) < 4) return;
    drag.moved = true;
    moveAnchor({ x: x / innerWidth, y: y / innerHeight });
  };
  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    // The release after a drag also fires a click; it must not open and focus the controls.
    justDragged.current = drag?.moved === true;
    if (drag?.moved && !fixture) saveAnchor(anchor);
    hidePillSoon();
  };
  const onHandleKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 0.08 : 0.02;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = clampAnchor({ x: anchor.x + delta[0], y: anchor.y + delta[1] }, innerWidth, innerHeight, layoutRef.current?.restScale ?? 90);
    setAnchor(next);
    if (!fixture) saveAnchor(next);
  };

  const active = fixture ? fixtureActive : view.active || (!view.ended && view.state === 'idle');
  const state = fixture ? fixtureState : view.muted && view.state === 'listening' ? 'idle' : view.state;
  const session = view.active || view.starting;
  const showCard = !fixture && !session && !dismissed;
  const micLabel = view.starting ? 'Microphone permission pending' : view.active ? view.muted ? 'Microphone muted' : 'Microphone on' : 'Microphone off';
  const statusText = fixture ? `Visual fixture: ${fixtureState.replaceAll('_', ' ')} / ${fixtureStance.replaceAll('_', ' ')}` : view.message;

  return <main className="overlay">
    <section className="presence" data-seed={fixture ? seed : undefined} aria-label="Expressive eye; decorative interpretation, not emotion detection">
      {!visualFailed && <VisualBoundary onError={() => setVisualFailed(true)}>
        <EyeStage state={state} stance={fixture ? fixtureStance : view.stance} intensity={fixture ? .65 : view.intensity} seed={fixture ? seed : view.seed} reducedMotion={reduced} active={active} backdrop={backdrop} anchor={anchor} onLayout={onLayout} />
      </VisualBoundary>}
    </section>

    <button ref={handleRef} className="eye-handle" aria-label="EVA. Drag, or use the arrow keys, to move. Press Enter for controls."
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onPointerEnter={showPill} onPointerLeave={hidePillSoon} onKeyDown={onHandleKey}
      onClick={() => { if (justDragged.current) { justDragged.current = false; return; } showPill(); pillRef.current?.querySelector('button')?.focus(); }} />
    {session && <span ref={micRef} className={`mic-dot ${view.active && !view.muted ? 'is-live' : ''}`} title={micLabel} aria-hidden="true" />}

    {fixture && <aside ref={fixtureRef} className="fixture-panel">
      <p className="fixture-banner">Synthetic visual fixture · no microphone, inference or speech playback{testBackdrop && ` · test backdrop: ${testBackdrop.label} (browser, not native)`} <a href="/">Conversation setup</a></p>
      <div className="fixture-controls">
        <label>Stance <select aria-label="Fixture stance" value={fixtureStance} onChange={e => { setFixtureStance(e.target.value as Stance); setSeed(s => s + 137); }}>{stances.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>State <select aria-label="Fixture state" value={fixtureState} onChange={e => setFixtureState(e.target.value as TurnState)}>{states.map(s => <option key={s}>{s}</option>)}</select></label>
        <button onClick={() => setSeed(s => s + 137)}>New variation</button>
        <button onClick={() => { setFixtureState('interrupted'); setFixtureStance('attentive'); }}>Interrupt fixture</button>
        <button onClick={() => setFixtureActive(a => !a)}>{fixtureActive ? 'End fixture' : 'Start fixture'}</button>
      </div>
    </aside>}

    {showCard && <div ref={cardRef} className="setup-card glass" role="dialog" aria-label="Start a conversation with EVA">
      <span className="wordmark">eva<span className="wordmark-dot">.</span></span>
      <h1>A little room to talk.</h1>
      <details className="privacy" open={!consent}>
        <summary>Before we talk</summary>
        <p>Your microphone audio and recent conversation text go to OpenAI; reply text goes to ElevenLabs. This app keeps conversation only in memory and clears it on End. Providers may retain data; zero-retention settings have not been verified. No camera is used.</p>
        <p>To stay visible over your windows, EVA reads the brightness of the screen behind itself on this computer, as a coarse grid of numbers. It is never stored or sent anywhere. Use invented, non-sensitive conversation for this demo; EVA cannot verify external facts or perform tasks.</p>
        <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I understand and want to enable the microphone.</label>
      </details>
      <div className="card-actions">
        <button className="primary" disabled={!status?.ready || !consent} onClick={() => void conversation.start()}>Start conversation</button>
        <button className="text-button" onClick={() => setDismissed(true)}>Not now</button>
      </div>
      {status && !status.ready && <p className="setup-note">{status.missing.join(' · ')} <button className="text-button" onClick={refresh}>Check again</button></p>}
      {import.meta.env.DEV && <a className="rehearsal-link" href="?fixture&state=processing">Visual rehearsal · no microphone</a>}
    </div>}

    <div ref={pillRef} className={`pill glass ${pillShown ? 'is-shown' : ''}`} role="toolbar" aria-label="EVA controls"
      onPointerEnter={showPill} onPointerLeave={hidePillSoon} onFocus={showPill} onBlur={hidePillSoon}>
      {session && <span className="pill-status"><span className={`status-dot ${view.active && !view.muted ? 'is-live' : ''}`} />{micLabel}</span>}
      {view.active && <>
        <button onClick={() => conversation.mute()} aria-pressed={view.muted}>{view.muted ? 'Unmute microphone' : 'Mute microphone'}</button>
        <button onClick={() => conversation.stop()}>Stop response <kbd>Esc</kbd></button>
      </>}
      {session && <button className="end" onClick={() => { conversation.end(); refresh(); setDismissed(false); }}>End session</button>}
      {!fixture && !session && dismissed && <button onClick={() => setDismissed(false)}>Open conversation setup</button>}
      <span className="pill-divider" aria-hidden="true" />
      <button aria-pressed={captions} onClick={() => setCaptions(c => !c)}>Captions {captions ? 'on' : 'off'}</button>
      <button aria-pressed={reduced} onClick={() => setReduced(r => !r)}>Reduced motion {reduced ? 'on' : 'off'}</button>
      <button aria-pressed={recordable} disabled={!native} title={native ? 'Lets screen recorders and screen sharing see EVA. Brightness sampling pauses while on.' : 'Desktop app only'} onClick={toggleRecordable}>Visible to recordings {recordable ? 'on' : 'off'}</button>
      {native && !session && <button onClick={() => void quitOverlay()}>Quit EVA</button>}
    </div>

    <div ref={speechRef} className="speech">
      {captions && view.active && <div className="captions" aria-live="polite" aria-atomic="true">
        {view.transcript && <p className="heard"><span>You said</span> {view.transcript}</p>}
        {view.reply && <p className="answer">{view.reply}</p>}
      </div>}
      {/* Dev fixture only: synthetic caption text so caption placement can be reviewed without a live session. */}
      {captions && fixture && fixtureActive && fixtureState === 'speaking' && <div className="captions">
        <p className="heard"><span>You said</span> I'm stuck on how to open my presentation.</p>
        <p className="answer">Start with the moment you realised it mattered.</p>
      </div>}
      <p className="turn-status" role="status">{statusText}</p>
      {visualFailed && <p className="visual-fallback">Visuals unavailable. Voice controls remain active.</p>}
    </div>
  </main>;
}

import { Component, type ReactNode } from 'react';
class VisualBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
