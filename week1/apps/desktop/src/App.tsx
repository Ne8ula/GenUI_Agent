import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { createWorkspace, readWeather, windPatch, revise, temperature, type Units } from "@eva/protocol";
import { Action, IndexLabel, WeatherGlyph } from "@eva/ui-system/components";
import { weatherIntent, windIntent } from "@eva/protocol/voice";
import { usePanelResize } from "./usePanelResize";
import { type EyeState } from "./SignalEye";
import { MovingEye } from "./MovingEye";
import { WeatherAssembly } from "./WeatherAssembly";
import { SomaticFrame } from "./SomaticFrame";
import { DitherLink } from "./DitherLink";
import { useVoice } from "./useVoice";
import { useNarration } from "./useNarration";
import "@eva/ui-system/tokens.css";
import weatherData from "../../../fixtures/connectors/weather-ithaca-week.json";
import { getDemoMemory, type MemoryLookup } from "./memory";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./App.css";
import "./Command.css";
import "./Crt.css";
import "./Biomech.css";
import "./Overlay.css";

const forecast = (() => { try { return readWeather(weatherData); } catch { return null; } })();
const names: Record<string, string> = { clear: "Clear skies", "partly-cloudy": "Partly cloudy", cloudy: "Cloudy", rain: "Rain" };
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));

export default function App() {
  const [active, setActive] = useState(false);
  const [awake, setAwake] = useState(true);
  const [closing, setClosing] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [windLoading, setWindLoading] = useState(false);
  const [windPrinting, setWindPrinting] = useState(false);
  const windTimer = useRef<number | undefined>(undefined);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [assemblyId, setAssemblyId] = useState(0);
  const [requestText, setRequestText] = useState("");
  const [intentError, setIntentError] = useState("");
  const assemblyTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const voice = useVoice(text => requestWeather(text, "Whisper"));
  const [state, setState] = useState(createWorkspace);
  const [selected, setSelected] = useState(0);
  const [memory, setMemory] = useState<MemoryLookup | null>(null);
  const [memoryState, setMemoryState] = useState<"loading" | "ready" | "error">("loading");
  const quiet = false;
  const narration = useNarration(quiet);
  const [notice, setNotice] = useState("");
  const [moving, setMoving] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const dismissButton = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const wind = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const panelResize = usePanelResize(card, stage);
  const eyeAnchor = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; origin: { x: number; y: number } } | null>(null);
  const units: Units = memory?.record.value ?? "Celsius";
  const symbol = units === "Celsius" ? "°C" : "°F";
  const reduced = quiet || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const eyeState: EyeState = closing ? "closing" : voice.phase === "listening" ? "listening" : voice.phase === "transcribing" ? "transcribing" : voice.phase === "requesting" ? "opening" : voice.phase === "error" ? "error" : assembling || windLoading ? "assembling" : "ready";
  const voiceBusy = ["requesting", "listening", "transcribing"].includes(voice.phase);
  const eyeLabel = closing ? "Closing" : voice.phase === "requesting" ? "Microphone access" : voice.phase === "listening" ? "Listening" : voice.phase === "transcribing" ? "Transcribing" : assembling ? "Assembling" : voice.phase === "error" ? "Voice unavailable" : "Ready";
  function requestWeather(text: string, source: string) {
    setRequestText(text.slice(0, 240)); setIntentError("");
    if (windIntent(text)) {
      if (source !== "Whisper") { setIntentError("Ask for wind speed using the microphone."); return; }
      voice.cancel();
      if (!active || !dashboardReady || assembling) { setIntentError("Open the weather dashboard first."); return; }
      addWind(); return;
    }
    if (!weatherIntent(text)) { setIntentError("Only Ithaca weather is available."); return; }
    voice.cancel();
    if (active && dashboardReady) { setNotice("Weather is open."); return; }
    if (!active && state.document.card.showWind) setState(value => revise(value,windPatch(value.document,false)));
    narration.begin();
    setAwake(true); setActive(true); setClosing(false); setAssembling(true); setAssemblyId(value => value + 1);
    if (!active) setDashboardReady(false);
    setMinimumElapsed(false);
    clearTimeout(assemblyTimer.current);
    // Deliberate local assembly choreography, not a fabricated provider progress value.
    assemblyTimer.current = window.setTimeout(() => setMinimumElapsed(true), reduced ? 0 : 12000);
    setNotice("Weather request recognized. Assembling the synthetic Ithaca forecast.");
  }
  function dismissSession() {
    cancelWind();
    narration.cancel();
    voice.cancel(); clearTimeout(assemblyTimer.current); setAssembling(false); setMinimumElapsed(false); setDashboardReady(false); setActive(false); setClosing(true);
    setRequestText(""); setIntentError("");
    clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => { setClosing(false); setAwake(false); }, reduced ? 0 : 200);
  }
  useEffect(() => () => { clearTimeout(assemblyTimer.current); clearTimeout(closeTimer.current); clearTimeout(windTimer.current); }, []);
  useEffect(() => {
    const hide = () => { if (document.hidden) cancelWind(); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    if (active && dashboardReady && !assembling && forecast) narration.present();
  }, [active, dashboardReady, assembling]);
  useEffect(() => {
    if (active && reduced) { clearTimeout(assemblyTimer.current); setMinimumElapsed(true); }
  }, [active, reduced]);

  useEffect(() => {
    if (!active || !minimumElapsed || memoryState === "loading") return;
    setDashboardReady(true);
    const timer = window.setTimeout(() => setAssembling(false), reduced ? 0 : 3000);
    return () => window.clearTimeout(timer);
  }, [active, minimumElapsed, memoryState, reduced]);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setMemoryState("loading"); setMemory(null);
    const timeout = window.setTimeout(() => {
      if (current) { current = false; setMemoryState("error"); }
    }, 6000);
    getDemoMemory().then(value => {
      if (current) { setMemory(value); setMemoryState("ready"); }
    }).catch(() => { if (current) setMemoryState("error"); })
      .finally(() => window.clearTimeout(timeout));
    return () => { current = false; window.clearTimeout(timeout); };
  }, [active]);

  useEffect(() => {
    if (active) dismissButton.current?.focus();
    else openButton.current?.focus();
  }, [active, awake]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (voiceBusy) { event.preventDefault(); voice.cancel(); }
      else if (active || awake) { event.preventDefault(); dismissSession(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, awake, voice.phase, quiet]);

  function clampPosition(position: { x: number; y: number }) {
    if (!card.current || !stage.current) return position;
    const rect = card.current.getBoundingClientRect();
    const area = stage.current.getBoundingClientRect();
    const baseLeft = rect.left - state.position.x;
    const baseRight = rect.right - state.position.x;
    const inset = Math.min(12, Math.max(0, (area.width - rect.width) / 2));
    return { x: Math.max(area.left + inset - baseLeft, Math.min(area.right - inset - baseRight, position.x)),
      y: Math.max(0, Math.min(80, position.y)) };
  }
  useEffect(() => {
    const resize = () => setState(value => ({ ...value, position: clampPosition(value.position) }));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  });
  function moveStart(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, origin: state.position };
    event.currentTarget.setPointerCapture(event.pointerId); setMoving(true);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const position = clampPosition({ x: drag.current.origin.x + event.clientX - drag.current.x, y: drag.current.origin.y + event.clientY - drag.current.y });
    setState(value => ({ ...value, position }));
  }
  function endMove() { drag.current = null; setMoving(false); }
  function keyboardMove(event: KeyboardEvent<HTMLButtonElement>) {
    const delta: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
    if (!delta[event.key]) return;
    event.preventDefault();
    const [x, y] = delta[event.key];
    setState(value => ({ ...value, position: clampPosition({ x: value.position.x + x, y: value.position.y + y }) }));
  }
  function addWind() {
    if (state.document.card.showWind) { revealWind(); return; }
    if (windLoading) return;
    panelResize.freeze(); setWindLoading(true); setWindPrinting(false);
    narration.beginWind(() => {
      setWindPrinting(true);
      windTimer.current = window.setTimeout(() => {
        setState(value => revise(value, windPatch(value.document)));
        setWindLoading(false); setWindPrinting(false);
        setNotice("Wind added to this forecast. Card position preserved.");
      }, 5000);
    });
  }
  function cancelWind() {
    clearTimeout(windTimer.current); setWindLoading(false); setWindPrinting(false);
  }
  function revealWind() {
    if (content.current && wind.current) content.current.scrollTop = Math.max(0,wind.current.offsetTop-content.current.offsetTop-12);
  }
  useEffect(() => {
    if (state.document.card.showWind || windLoading) revealWind();
    if (state.document.card.showWind && !windLoading) narration.presentWind();
  }, [state.document.card.showWind, windLoading]);
  const day = forecast?.days[selected];
  const voiceControls = <div className="voice-console">
    <div className="voice-actions">
      <button ref={!active ? openButton : undefined} title="Voice · OpenAI Whisper" className={"action primary voice-trigger " + (voice.phase === "listening" ? "recording" : "")} aria-disabled={voice.phase === "requesting" || voice.phase === "transcribing" || closing}
        onClick={() => { if (closing) return; setIntentError(""); if (voice.phase === "listening") void voice.submit(); else if (!voiceBusy) { cancelWind(); narration.cancel(); narration.unlock(); void voice.start(); } }}>
        <span className="mic-symbol" aria-hidden="true">◉</span>{voice.phase === "listening" ? "Send recording" : voice.phase === "requesting" ? "Allow microphone…" : voice.phase === "transcribing" ? "Transcribing…" : "Speak request"}
      </button>
      {voiceBusy && <Action onClick={() => voice.cancel()}>Cancel</Action>}
    </div>
    {voice.phase === "listening" && <div className="input-meter"><span className="meter-track"><span style={{ transform: `scaleX(${voice.level})` }} /></span><span>{voice.seconds.toFixed(1)} / 15 s</span></div>}
    {voice.message && <p className="voice-error" role="alert">{voice.message}</p>}
    {narration.message && <p className="voice-error" role="status">{narration.message}</p>}
    {intentError && <p className="voice-error" role="status">{intentError}</p>}
    {requestText && <div className="request-receipt"><p>“{requestText}”</p></div>}
  </div>;
  return <main data-assembly={active ? dashboardReady ? assembling ? "revealing" : "ready" : "loading" : "idle"} className={["eva-shell", quiet ? "quiet-mode" : "", active ? "is-open" : "", assembling ? "is-assembling" : "", closing ? "is-closing" : ""].join(" ")}>
    <span className="sr-only" role="status">{awake || active ? eyeLabel : "Standby"}</span>
    {awake && <MovingEye anchor={eyeAnchor} docked={active} state={eyeState} quiet={quiet} energy={voice.energy} />}

    {!active ? <div className={"welcome command-welcome " + (!awake ? "dormant" : "")}>
      {awake ? <>
        <div className="hero-eye"><div ref={eyeAnchor} className="eye-anchor" /></div>
        <div className="welcome-command">
          {voiceControls}
        </div>
      </> : <div className="dormant-content"><button ref={openButton} className="action primary open-action" onClick={() => setAwake(true)}>Open EVA <span aria-hidden="true">↗</span></button></div>}
    </div> : <>
      <div className="command-workspace">
        <aside className="eye-station" aria-label="Voice interface"><div ref={eyeAnchor} className="eye-anchor" />{voiceControls}</aside>
      <div ref={stage} className="stage">
        {!dashboardReady ? <WeatherAssembly key={assemblyId} memoryState={memoryState} quiet={reduced} units={symbol} /> : forecast && day ? <section ref={card} data-testid="weather-card" data-card-id={state.document.card.id} data-revision={state.document.revision} inert={assembling} aria-busy={assembling}
          className={["instrument", moving ? "moving" : ""].join(" ")} aria-labelledby="forecast-title"
          style={{ transform: `translate(${state.position.x}px, ${state.position.y}px)`, width: panelResize.size?.width, height: panelResize.size?.height }}>
          <SomaticFrame />
          {assembling && <div key={assemblyId} className="assembly-sweep" aria-hidden="true" />}
          <div className="instrument-top">
            <IndexLabel index="W / 01">FORECAST <span className="sample-label" title="Synthetic forecast, not live weather">Sample</span></IndexLabel>
            <div className="panel-tools"><button className="move-handle" aria-label="Move weather card" title="Drag to move. Use arrow keys when focused." onPointerDown={moveStart} onPointerMove={move} onPointerUp={endMove} onPointerCancel={endMove} onLostPointerCapture={endMove} onKeyDown={keyboardMove}><span aria-hidden="true">⠿</span></button><button ref={dismissButton} className="panel-close" aria-label="Dismiss" title="Dismiss dashboard" onClick={dismissSession}>×</button></div>
          </div>
          <div ref={content} className="weather-content">
          <div className="forecast-heading"><div><h1 id="forecast-title">{forecast.location}</h1><p className="period">17–23 September 2026</p></div></div>
          <div className="forecast-overview">
            <div className="primary-reading"><WeatherGlyph condition={day.condition} large /><div><span className="reading-label">{dateLabel(day.date, { weekday: "long", month: "short", day: "numeric" })} · High</span><div className="temperature">{temperature(day.highC, units)}<span>{symbol}</span></div></div></div>
            <div className="conditions"><h2>{names[day.condition]}</h2><div className="condition-facts"><span>Low <strong>{temperature(day.lowC, units)}{day.lowC === null ? "" : symbol}</strong></span><span>Rain chance <strong>{day.precipitationPct === null ? "Unavailable" : day.precipitationPct + "%"}</strong></span></div></div>
          </div>
          <div className="strip-heading"><IndexLabel index="02">The week ahead</IndexLabel><span>High / Low · {symbol}</span></div>
          <div className="forecast-strip" aria-label="Seven-day forecast">
            {forecast.days.map((item, index) => <button className={"day-cell " + (index === selected ? "selected" : "")} key={item.date} aria-pressed={selected === index} onClick={() => setSelected(index)}
              aria-label={`${dateLabel(item.date, { weekday: "long", month: "short", day: "numeric" })}, ${names[item.condition]}, high ${temperature(item.highC, units)} ${units}, low ${temperature(item.lowC, units)} ${units}`}>
              <span className="day-name">{dateLabel(item.date, { weekday: "short" })}</span><span className="day-date">{dateLabel(item.date, { day: "2-digit", month: "short" })}</span><WeatherGlyph condition={item.condition} /><span className="day-values"><span className="day-high">{item.highC === null ? "—" : temperature(item.highC, units) + "°"}</span><span className="day-low">{item.lowC === null ? "—" : temperature(item.lowC, units) + "°"}</span></span><span className="day-condition">{names[item.condition]}</span>
            </button>)}
          </div>
          {windLoading && <div ref={wind} className="wind-panel wind-loading" data-testid="wind-loading" data-printing={windPrinting} role="status" aria-label="Preparing wind" aria-busy="true">
            <div className="strip-heading"><IndexLabel index="03">Wind</IndexLabel><span>CONSTRUCT / WIND</span></div>
            <div className="wind-raster" aria-hidden="true">{Array.from({length:7},(_,i)=><div key={i}><span>{String(i+1).padStart(2,"0")}</span><i/><i/><i/></div>)}</div>
            <div className="wind-scan" aria-hidden="true" />
          </div>}
          {state.document.card.showWind && <div ref={wind} className="wind-panel" data-testid="wind-panel">
            <div className="strip-heading"><IndexLabel index="03">Wind</IndexLabel><span>Speed · km/h</span></div>
            <div className="wind-strip">{forecast.days.map(item => <div key={item.date} className="wind-cell"><span className="wind-day">{dateLabel(item.date, { weekday: "short" })}</span><span className="wind-value">{item.windKph ?? "—"}</span><span>{item.windDirection === null ? "Unavailable" : item.windDirection + " · km/h"}</span></div>)}</div>
          </div>}
          </div>
          <button className="resize-grip" aria-label="Resize weather panel" title="Drag to resize; arrow keys adjust size" onPointerDown={panelResize.start} onPointerMove={panelResize.move} onPointerUp={panelResize.end} onPointerCancel={panelResize.end} onLostPointerCapture={panelResize.end} onKeyDown={panelResize.keyboard}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20L20 4M10 20L20 10M16 20L20 16" fill="none" stroke="currentColor" strokeWidth="2" /></svg></button>
        </section> : <section className="instrument error-state"><h1>Weather fixture unavailable</h1><p>The last valid weather fixture is required to open this instrument.</p></section>}
      </div>
        <DitherLink anchor={eyeAnchor} stage={stage} revision={`${dashboardReady}-${state.position.x}-${state.position.y}-${panelResize.size?.width}-${panelResize.size?.height}`} />
      </div>
      <div className="sr-only" role="status" aria-live="polite">{notice}</div>

    </>}
  </main>;
}
