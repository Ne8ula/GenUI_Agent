import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ITEM_OVERLAY_CONTENT, itemOverlayPoses } from './item-overlays'
import './item-overlays.css'

/**
 * R16 floating item-description overlays. Bounded, isolated module: owns only its own
 * DOM subtree, no pointer interception, no independent clock/rAF/CSS animation. The host
 * (ArrivalApp) passes `idleSeconds` from the existing settled/idle clock so Escape, pause
 * and reduced motion freeze this exactly like the rest of the scene; `visible` is false
 * during the eye, photo discovery and incomplete construction.
 */
export function ItemOverlays({ visible, idleSeconds, reducedMotion }: {
  visible: boolean
  idleSeconds: number
  reducedMotion: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }))

  useEffect(() => {
    const element = root.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      const box = entry.contentRect
      setViewport(previous => (previous.width === box.width && previous.height === box.height) ? previous : { width: box.width, height: box.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const poses = visible ? itemOverlayPoses(viewport, idleSeconds, reducedMotion) : []

  return <div ref={root} className="item-overlays-root" aria-hidden={!visible}>
    {visible && <ul className="item-overlays-sr-list" aria-label="Illustrative Paris scene items">
      {ITEM_OVERLAY_CONTENT.map(item => <li key={item.id}>
        <span className="item-overlays-sr-title">{item.title}</span>: <span className="item-overlays-sr-desc">{item.description}</span>
      </li>)}
    </ul>}
    {poses.map(pose => {
      const style: CSSProperties & Record<'--item-overlay-entrance', number> = {
        left: pose.left,
        top: pose.top,
        width: pose.width,
        '--item-overlay-entrance': pose.entrance,
      }
      return <figure
        key={pose.id}
        aria-hidden="true"
        className={`item-overlay item-overlay--${pose.stripe} item-overlay--trail-${pose.trail} item-overlay--origin-${pose.origin}`}
        style={style}
      >
        <span className="item-overlay-accent item-overlay-accent--corner" />
        <span className="item-overlay-accent item-overlay-accent--x" />
        <span className="item-overlay-stripe" />
        <span className="item-overlay-trail" />
        <figcaption>
          <p className="item-overlay-title">{pose.title}</p>
          <p className="item-overlay-desc">{pose.description}</p>
        </figcaption>
      </figure>
    })}
  </div>
}
