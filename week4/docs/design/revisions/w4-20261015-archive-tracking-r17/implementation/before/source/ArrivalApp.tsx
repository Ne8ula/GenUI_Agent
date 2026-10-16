import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { routeTranscript, MAX_TRANSCRIPT_CHARS } from '../../../core/intents'
import { createScanRenderer, type ScanRenderer } from '../scan/renderer'
import { advanceArrival, CONSTRUCTION_SECONDS, initialArrival, phaseAt, resumeArrival, seekArrival, startArrival, type ArrivalState } from './timeline'
import { advanceDiscovery, initialDiscovery, seekDiscovery, startDiscovery, type DiscoveryState } from './discovery'
import { PhotoDiscovery } from './PhotoDiscovery'
import { ItemOverlays } from './ItemOverlays'
import './arrival.css'

declare global {
  interface Window {
    __evaArrival?: {
      seek: (seconds: number, idleSeconds?: number) => void
      seekDiscovery: (seconds: number) => void
      reset: () => void
      stats: () => ReturnType<ScanRenderer['stats']> & ArrivalState & { discovery: DiscoveryState }
    }
  }
}

const running = (state: ArrivalState) => state.playback === 'playing' || state.playback === 'settled'

export function ArrivalApp() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ScanRenderer | null>(null)
  const failRenderer = useRef<((reason: unknown) => void) | null>(null)
  const current = useRef(initialArrival())
  const discoveryRef = useRef(initialDiscovery())
  const [discovery, setDiscovery] = useState(discoveryRef.current)
  const [assets, setAssets] = useState({ ready: false, loaded: 0, failed: 0 })
  const [view, setView] = useState(current.current)
  const [draft, setDraft] = useState("What's it like in 1980s Paris?")
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const reducedRef = useRef(reduced)
  const clean = new URLSearchParams(location.search).get('capture') === '1'
  const apply = useCallback((next: ArrivalState, publish = true) => {
    current.current = next
    if (publish) setView(next)
    try { renderer.current?.render(0, 'Composite', 1, 0, next.seconds, next.idleSeconds) } catch (reason) { failRenderer.current?.(reason) }
  }, [])
  const applyDiscovery = useCallback((next: DiscoveryState) => {
    discoveryRef.current = next; setDiscovery(next)
  }, [])
  const onAssets = useCallback((loaded: number, failed: number) => setAssets({ ready: true, loaded, failed }), [])
  const reset = useCallback(() => { applyDiscovery(initialDiscovery()); apply(initialArrival()); setMessage('') }, [apply, applyDiscovery])
  const stop = useCallback(() => {
    if (discoveryRef.current.playing) applyDiscovery({ ...discoveryRef.current, playing: false })
    if (running(current.current)) apply({ ...current.current, playback: 'paused' })
  }, [apply, applyDiscovery])
  const lessMotion = useCallback((value: boolean) => {
    reducedRef.current = value; setReduced(value)
    if (value && discoveryRef.current.active) applyDiscovery(seekDiscovery(5, true))
    else if (value && current.current.submitted) apply(seekArrival(CONSTRUCTION_SECONDS, true))
  }, [apply, applyDiscovery])

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
      stop()
    }
    const lost = (event: Event) => { event.preventDefault(); fail(new Error('GPU context lost. Type retry to recover; no image or video fallback is used.')) }
    failRenderer.current = fail
    element.addEventListener('webglcontextlost', lost)
    createScanRenderer(element, abort.signal, true).then(value => {
      if (dead) { value.dispose(); return }
      active = value; renderer.current = value
      value.render(0, 'Composite', 1, 0, current.current.seconds, current.current.idleSeconds)
      element.dataset.ready = 'true'; setReady(true)
      observer = new ResizeObserver(() => {
        if (dead || failed) return
        try { value.resize(); value.render(0, 'Composite', 1, 0, current.current.seconds, current.current.idleSeconds) } catch (reason) { fail(reason) }
      })
      observer.observe(element)
      window.__evaArrival = {
        seek: (seconds, idleSeconds = 0) => { applyDiscovery(initialDiscovery()); apply(seekArrival(seconds, reducedRef.current, idleSeconds)) },
        seekDiscovery: seconds => { apply(initialArrival()); applyDiscovery(seekDiscovery(seconds, reducedRef.current)) },
        reset, stats: () => ({ ...value.stats(), ...current.current, discovery: { ...discoveryRef.current } }),
      }
    }).catch(fail)
    return () => {
      dead = true; abort.abort(); observer?.disconnect()
      element.removeEventListener('webglcontextlost', lost)
      delete window.__evaArrival; renderer.current = null; failRenderer.current = null; active?.dispose()
    }
  }, [retry, apply, applyDiscovery, reset, stop])

  useEffect(() => {
    if (!ready || reduced || !assets.ready || assets.loaded === 0 || !discovery.active || !discovery.playing) return
    let frame = 0, previous = performance.now(), cancelled = false
    const tick = (now: number) => {
      if (cancelled || reducedRef.current || !discoveryRef.current.playing) return
      const next = advanceDiscovery(discoveryRef.current, document.hidden ? 0 : (now - previous) / 1000)
      previous = now; applyDiscovery(next)
      if (next.active) frame = requestAnimationFrame(tick)
      else apply(startArrival(reducedRef.current))
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [ready, reduced, assets.ready, assets.loaded, discovery.active, discovery.playing, apply, applyDiscovery])

  useEffect(() => {
    if (!ready || reduced || discovery.active || (view.playback !== 'playing' && view.playback !== 'settled')) return
    let frame = 0, previous = performance.now(), publishedAt = 0, cancelled = false
    const tick = (now: number) => {
      if (cancelled || reducedRef.current || discoveryRef.current.active) return
      const delta = document.hidden ? 0 : (now - previous) / 1000
      previous = now
      const before = current.current
      const next = advanceArrival(before, delta)
      if (next !== before) {
        const publish = now - publishedAt >= (next.seconds < CONSTRUCTION_SECONDS ? 100 : 33) || next.playback !== before.playback || phaseAt(next.seconds) !== phaseAt(before.seconds)
        apply(next, publish)
        if (publish) publishedAt = now
      }
      if (running(current.current)) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [ready, reduced, discovery.active, view.playback, apply])

  function submit(event: FormEvent) {
    event.preventDefault()
    const command = draft.trim().toLowerCase().replace(/[.!?]+$/, '')
    const intent = routeTranscript(draft).intent
    setMessage('')
    if (command === 'retry' && error) { setRetry(value => value + 1); return }
    if (['return', 'reset', 'back'].includes(command) || intent === 'return_home') { reset(); return }
    if (['pause', 'stop'].includes(command) || intent === 'cancel_experience') { stop(); return }
    if (!ready) { setMessage('The scene is not ready yet.'); return }
    if (['skip', 'skip to paris'].includes(command) || intent === 'skip') {
      applyDiscovery(initialDiscovery()); apply(reduced ? seekArrival(30, true) : resumeArrival(seekArrival(30))); return
    }
    if (['resume', 'continue'].includes(command)) {
      if (discoveryRef.current.active) {
        if (reduced) { applyDiscovery(initialDiscovery()); apply(startArrival(true)) }
        else applyDiscovery({ ...discoveryRef.current, playing: true })
      } else if (!reduced) apply(resumeArrival(current.current))
      return
    }
    if (intent !== 'arrive_paris_cafe' && command !== 'photos') {
      setMessage('This local demo supports 1980s Paris, photos, pause, resume, skip and return.'); return
    }
    apply(initialArrival()); applyDiscovery(startDiscovery(reducedRef.current))
  }

  const status = discovery.active
    ? reduced ? 'Static archival photographs. Type continue for Paris.' : discovery.playing ? 'Curated local archival photographs, not a live search.' : 'Photographs paused. Type resume to continue.'
    : view.submitted ? `${phaseAt(view.seconds)}. ${view.playback === 'paused' ? 'Paused.' : ''}` : 'Enter a Paris request. Escape pauses. Type resume, skip or return to control the scene.'
  return <main className={`arrival-app${clean ? ' arrival-capture' : ''}`} data-discovery={discovery.active && assets.ready && assets.loaded > 0}>
    <canvas key={retry} ref={canvas} className="arrival-canvas" aria-label="EVA eye constructing an illustrative Paris scene from particles" />
    <PhotoDiscovery state={discovery} onAssets={onAssets} onInspect={stop} />
    <ItemOverlays visible={ready && view.submitted && view.seconds === CONSTRUCTION_SECONDS && !discovery.active} idleSeconds={reduced ? 0 : view.idleSeconds} reducedMotion={reduced} />
    <form className={`arrival-request${view.submitted || discovery.active ? ' arrival-request--active' : ''}`} onSubmit={submit}>
      <input id="paris-request" aria-label="Request or scene command" aria-describedby="arrival-help" maxLength={MAX_TRANSCRIPT_CHARS} value={draft} onChange={event => setDraft(event.target.value)} autoComplete="off" spellCheck={false} />
      <p id="arrival-help" className="arrival-sr-only">Local curated demo, not live search or historical reconstruction. Enter submits. Escape pauses. Commands: photos, pause, resume, skip, return, retry. Photographs open source and licence details in a new tab.</p>
      <p className="arrival-sr-only" role="status">{status}</p>
    </form>
    {(error || message || (discovery.active && assets.ready && assets.failed > 0)) && <section className="arrival-error" role="alert">
      {error || message || (assets.loaded ? 'Some archival photographs could not load. Available sources remain visible.' : 'Archival photographs could not load. Type skip for the illustrative scene or return to the eye.')}
    </section>}
  </main>
}
