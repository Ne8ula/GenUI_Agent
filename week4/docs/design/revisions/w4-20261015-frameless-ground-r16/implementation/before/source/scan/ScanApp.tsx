import { useEffect, useRef, useState } from 'react'
import { SCAN_MODES, type ScanMode } from './data'
import { createScanRenderer, type ScanRenderer } from './renderer'
import './scan.css'

interface ScanFixture {
  seek: (seconds: number) => void
  stats: () => ReturnType<ScanRenderer['stats']> & { time: number; reduced: boolean }
}
declare global { interface Window { __evaScan?: ScanFixture } }

export function ScanApp() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ScanRenderer | null>(null)
  const clock = useRef(0)
  const [mode, setMode] = useState<ScanMode>('Composite')
  const [density, setDensity] = useState(1)
  const [scatter, setScatter] = useState(.35)
  const [playing, setPlaying] = useState(false)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [status, setStatus] = useState('Preparing scan samples…')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const clean = new URLSearchParams(location.search).get('capture') === '1'
  const current = useRef({ mode, density, scatter, playing, reduced })

  useEffect(() => {
    current.current = { mode, density, scatter, playing, reduced }
    renderer.current?.render(reduced ? 0 : clock.current, mode, density, reduced ? 0 : scatter)
  }, [mode, density, scatter, playing, reduced])

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => { setReduced(query.matches); if (query.matches) setPlaying(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setPlaying(false) }
    query.addEventListener('change', changed)
    window.addEventListener('keydown', key)
    return () => { query.removeEventListener('change', changed); window.removeEventListener('keydown', key) }
  }, [])

  useEffect(() => {
    const element = canvas.current!
    const abort = new AbortController()
    let active: ScanRenderer | null = null
    let dead = false
    let failed = false
    let frame = 0
    let previous = 0
    let observer: ResizeObserver | null = null
    setError(''); setStatus('Preparing scan samples…')
    const draw = () => {
      const state = current.current
      active?.render(state.reduced ? 0 : clock.current, state.mode, state.density, state.reduced ? 0 : state.scatter)
    }
    const fail = (message: string) => {
      if (dead || failed) return
      failed = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
      element.removeEventListener('webglcontextlost', lost)
      delete window.__evaScan
      renderer.current = null
      active?.dispose(); active = null
      setPlaying(false); setError(message); setStatus('Stopped')
      element.dataset.ready = 'false'
    }
    const lost = (event: Event) => { event.preventDefault(); fail('GPU context lost. Retry to reload the scan; no image fallback is used.') }
    element.addEventListener('webglcontextlost', lost)
    createScanRenderer(element, abort.signal).then(value => {
      if (dead) { value.dispose(); return }
      active = value; renderer.current = value
      draw(); element.dataset.ready = 'true'; setStatus('Ready')
      observer = new ResizeObserver(() => { if (!dead) { value.resize(); draw() } })
      observer.observe(element)
      window.__evaScan = {
        seek(seconds) {
          clock.current = Number.isFinite(seconds) ? Math.max(0, Math.min(60, seconds)) : 0
          draw()
        },
        stats: () => ({ ...value.stats(), time: current.current.reduced ? 0 : clock.current, reduced: current.current.reduced }),
      }
      const tick = (now: number) => {
        if (dead) return
        if (current.current.playing && !current.current.reduced && !document.hidden) {
          clock.current = Math.min(60, clock.current + Math.min((now - previous) / 1000, .05))
          try { draw() } catch (reason) { fail(reason instanceof Error ? reason.message : 'GPU render failed'); return }
          if (clock.current === 60) setPlaying(false)
        }
        previous = now
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }).catch(reason => { if (!dead) fail(reason instanceof Error ? reason.message : 'Scan unavailable') })
    return () => {
      dead = true; abort.abort(); cancelAnimationFrame(frame); observer?.disconnect()
      element.removeEventListener('webglcontextlost', lost)
      delete window.__evaScan
      renderer.current = null; active?.dispose()
    }
  }, [retry])

  return <main className={`scan-app${clean ? ' scan-capture' : ''}`}>
    <canvas key={retry} ref={canvas} className="scan-canvas" aria-label="Paris scan-inspired study, image-derived GPU points and edge fragments" />
    <header className="scan-caption">
      <h1>Paris / scan study</h1>
      <p>Single-image approximation · not measured LiDAR / SLAM</p>
    </header>
    <section className="scan-controls" aria-label="Scan study controls">
      <label>Representation<select value={mode} onChange={event => setMode(event.target.value as ScanMode)}>
        {SCAN_MODES.map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>Density<input type="range" min="0.15" max="1" step="0.05" value={density} onChange={event => setDensity(Number(event.target.value))} /></label>
      <label>Local scatter<input type="range" min="0" max="1" step="0.05" value={scatter} onChange={event => setScatter(Number(event.target.value))} /></label>
      <button disabled={reduced || status !== 'Ready'} onClick={() => {
        if (clock.current >= 60) clock.current = 0
        setPlaying(value => !value)
      }}>{playing ? 'Pause' : 'Animate samples'}</button>
      <button onClick={() => { clock.current = 0; setPlaying(false); window.__evaScan?.seek(0) }}>Reset</button>
      <label className="scan-check"><input type="checkbox" checked={reduced} onChange={event => { setReduced(event.target.checked); setPlaying(false) }} />Less motion</label>
      {import.meta.env.DEV && <a href="?scene=paris-hybrid">Original hybrid</a>}
      <span role="status">{status}</span>
    </section>
    {error && <section className="scan-error" role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry</button></section>}
  </main>
}
