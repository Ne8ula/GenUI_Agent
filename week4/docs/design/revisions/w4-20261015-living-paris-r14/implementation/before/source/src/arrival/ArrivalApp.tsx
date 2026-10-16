import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { routeTranscript, MAX_TRANSCRIPT_CHARS } from '../../../core/intents'
import { createScanRenderer, type ScanRenderer } from '../scan/renderer'
import { advanceArrival, CHECKPOINTS, CONSTRUCTION_SECONDS, initialArrival, phaseAt, seekArrival, startArrival, type ArrivalState } from './timeline'
import './arrival.css'

declare global {
  interface Window {
    __evaArrival?: { seek: (seconds: number) => void; reset: () => void; stats: () => ReturnType<ScanRenderer['stats']> & ArrivalState }
  }
}

export function ArrivalApp() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ScanRenderer | null>(null)
  const failRenderer = useRef<((reason: unknown) => void) | null>(null)
  const current = useRef(initialArrival())
  const [view, setView] = useState(current.current)
  const [draft, setDraft] = useState("What's it like in 1980s Paris?")
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const reducedRef = useRef(reduced)
  const clean = new URLSearchParams(location.search).get('capture') === '1'
  const fixture = new URLSearchParams(location.search).get('fixture') === '1'
  const apply = useCallback((next: ArrivalState) => {
    current.current = next; setView(next)
    try { renderer.current?.render(0, 'Composite', 1, 0, next.seconds) } catch (reason) { failRenderer.current?.(reason) }
  }, [])
  const reset = useCallback(() => { apply(initialArrival()); setMessage('') }, [apply])
  const stop = useCallback(() => {
    if (current.current.playback === 'playing') apply({ ...current.current, playback: 'paused' })
  }, [apply])
  const lessMotion = useCallback((value: boolean) => {
    reducedRef.current = value; setReduced(value)
    if (value && current.current.submitted) apply(seekArrival(CONSTRUCTION_SECONDS, true))
  }, [apply])

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => lessMotion(media.matches)
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') stop() }
    media.addEventListener('change', changed); window.addEventListener('keydown', key)
    return () => { media.removeEventListener('change', changed); window.removeEventListener('keydown', key) }
  }, [lessMotion, stop])

  useEffect(() => {
    const element = canvas.current!
    const abort = new AbortController()
    let active: ScanRenderer | null = null
    let observer: ResizeObserver | null = null
    let dead = false, failed = false
    setReady(false); setError('')
    const fail = (reason: unknown) => {
      if (dead || failed) return
      failed = true; setReady(false)
      setError(reason instanceof Error ? reason.message : 'Scene rendering stopped')
      element.dataset.ready = 'false'
      element.removeEventListener('webglcontextlost', lost)
      observer?.disconnect(); delete window.__evaArrival
      renderer.current = null; active?.dispose(); active = null
      if (current.current.playback === 'playing') apply({ ...current.current, playback: 'paused' })
    }
    const lost = (event: Event) => { event.preventDefault(); fail(new Error('GPU context lost. Retry to recover; no image or video fallback is used.')) }
    failRenderer.current = fail
    element.addEventListener('webglcontextlost', lost)
    createScanRenderer(element, abort.signal, true).then(value => {
      if (dead) { value.dispose(); return }
      active = value; renderer.current = value
      value.render(0, 'Composite', 1, 0, current.current.seconds)
      element.dataset.ready = 'true'; setReady(true)
      observer = new ResizeObserver(() => {
        if (dead || failed) return
        try { value.resize(); value.render(0, 'Composite', 1, 0, current.current.seconds) } catch (reason) { fail(reason) }
      })
      observer.observe(element)
      window.__evaArrival = {
        seek: seconds => apply(seekArrival(seconds, reducedRef.current)), reset,
        stats: () => ({ ...value.stats(), ...current.current }),
      }
    }).catch(fail)
    return () => {
      dead = true; abort.abort(); observer?.disconnect()
      element.removeEventListener('webglcontextlost', lost)
      delete window.__evaArrival; renderer.current = null; failRenderer.current = null; active?.dispose()
    }
  }, [retry, apply, reset])

  useEffect(() => {
    if (!ready || view.playback !== 'playing') return
    let frame = 0, previous = performance.now(), cancelled = false
    const tick = (now: number) => {
      if (cancelled) return
      const delta = document.hidden ? 0 : (now - previous) / 1000
      previous = now
      try { apply(advanceArrival(current.current, delta)) } catch (reason) {
        stop(); setError(reason instanceof Error ? reason.message : 'Scene rendering stopped'); return
      }
      if (current.current.playback === 'playing') frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [ready, view.playback, apply, stop])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    if (routeTranscript(draft).intent !== 'arrive_paris_cafe') {
      setMessage('This local demo supports Paris in the 1980s. No scene was changed.')
      return
    }
    setMessage(''); apply(startArrival(reducedRef.current))
  }

  return <main className={`arrival-app${clean ? ' arrival-capture' : ''}`}>
    <canvas key={retry} ref={canvas} className="arrival-canvas" aria-label="EVA eye constructing an illustrative Paris scene from particles" />
    <header className="arrival-heading"><h1>EVA</h1><p>Paris, imagined</p></header>
    {!view.submitted ? <form className="arrival-request" onSubmit={submit}>
      <label htmlFor="paris-request">Where would you like to go?</label>
      <div className="arrival-input-row"><input id="paris-request" maxLength={MAX_TRANSCRIPT_CHARS} value={draft} onChange={event => setDraft(event.target.value)} autoComplete="off" />
        <button disabled={!ready} type="submit">Imagine Paris</button></div>
      <p className="arrival-note">Local typed-request demo. No microphone or live AI generation.</p>
      <p role="status">{message || (!ready && !error ? 'Preparing the scene…' : '')}</p>
    </form> : <section className="arrival-controls" aria-label="Construction controls">
      <div className="arrival-phase" role="status">{phaseAt(view.seconds)}{view.playback === 'paused' ? ' — paused' : ''}</div>
      <button disabled={!ready || reduced || view.playback === 'settled'} onClick={() => view.playback === 'playing' ? stop() : apply({ ...current.current, playback: 'playing' })}>{view.playback === 'playing' ? 'Pause' : 'Resume'}</button>
      <button disabled={!ready || view.playback === 'settled'} onClick={() => apply(seekArrival(CONSTRUCTION_SECONDS))}>Skip to Paris</button>
      <button onClick={reset}>Return to eye</button>
      <a href="?scene=paris-scan">Settled study</a>
      {fixture && <div className="arrival-fixture">
        <label>Construction time<input type="range" min="0" max={CONSTRUCTION_SECONDS} step="0.1" value={view.seconds} onChange={event => apply(seekArrival(Number(event.target.value), reducedRef.current))} /></label>
        <output>{view.seconds.toFixed(1)} s</output>
        {CHECKPOINTS.map(time => <button key={time} onClick={() => apply(seekArrival(time, reducedRef.current))}>{time}s</button>)}
      </div>}
    </section>}
    <footer className="arrival-footer">
      <label><input type="checkbox" checked={reduced} onChange={event => lessMotion(event.target.checked)} />Less motion</label>
      <span>Illustrative reconstruction, not a historical recording</span>
    </footer>
    {error && <section className="arrival-error" role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry</button></section>}
  </main>
}
