import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ITEM_OVERLAY_CONTENT, itemOverlayLayout, type OverlayPhoto } from './item-overlays'
import './item-overlays.css'

/**
 * R17 object-bound item overlays. Bounded, isolated module: owns only its own DOM
 * subtree, no pointer interception outside the actual photo-inset links, no
 * independent clock/rAF/CSS animation. The host (ArrivalApp) passes `idleSeconds`
 * from the existing settled/idle clock so Escape, pause and reduced motion freeze
 * this exactly like the rest of the scene; `visible` is false during the eye, photo
 * discovery and incomplete construction.
 *
 * Replaces the R16 floating description cards with hairline rectangles bound to
 * authored source-image regions, compact monospace title tabs and sparse leader
 * lines to occasional linked archival-photo insets, per the owner's three supplied
 * references (red object-bound labels; white title tabs + dashed connectors; blue
 * object box linked to photographic insets). `photos` is the host's verified local
 * catalogue subset (this module never imports a catalogue or invents an id);
 * `onInspect` lets the host pause its clock while a reference inset holds focus.
 */
export function ItemOverlays({ visible, idleSeconds, reducedMotion, photos = [], onInspect }: {
  visible: boolean
  idleSeconds: number
  reducedMotion: boolean
  photos?: readonly OverlayPhoto[]
  onInspect?: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }))
  const [failedPhotoIds, setFailedPhotoIds] = useState<ReadonlySet<string>>(() => new Set())

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

  // Drop any photo whose <img> failed to load so a stale/broken reference never
  // lingers in the rotation; the object simply loses its linked inset.
  const usablePhotos = useMemo(
    () => failedPhotoIds.size === 0 ? photos : photos.filter(photo => !failedPhotoIds.has(photo.id)),
    [photos, failedPhotoIds],
  )

  const layout = visible ? itemOverlayLayout(viewport, idleSeconds, reducedMotion, usablePhotos) : { boxes: [], insets: [], connectors: [] }

  const handleImageError = (id: string) => {
    setFailedPhotoIds(previous => previous.has(id) ? previous : new Set(previous).add(id))
  }

  return <div ref={root} className="item-overlays-root" aria-hidden={!visible}>
    {visible && <ul className="item-overlays-sr-list" aria-label="Illustrative Paris scene items">
      {ITEM_OVERLAY_CONTENT.map(item => <li key={item.id}>
        <span className="item-overlays-sr-title">{item.title}</span>: <span className="item-overlays-sr-desc">{item.description}</span>
      </li>)}
    </ul>}

    {layout.boxes.map(box => {
      const style: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height }
      return <div key={box.id} aria-hidden="true" data-item-id={box.id} className={`item-overlay-box item-overlay-box--${box.tone}`} style={style}>
        <span className="item-overlay-tab">{box.title}</span>
        <p className="item-overlay-desc">{box.description}</p>
      </div>
    })}

    {layout.connectors.map(line => {
      const style: CSSProperties = { left: line.left, top: line.top, width: line.length, transform: `rotate(${line.angleDeg}deg)` }
      return <span key={line.objectId} aria-hidden="true" className={`item-overlay-connector item-overlay-connector--${line.style}`} style={style} />
    })}

    {layout.insets.map(inset => {
      const style: CSSProperties = { left: inset.left, top: inset.top, width: inset.width, height: inset.height }
      return <figure key={inset.objectId} className="item-overlay-inset" data-item-id={inset.objectId} style={style}>
        <a
          className="item-overlay-inset-link archive-inset"
          data-photo-id={inset.photo.id}
          href={inset.photo.creditHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${inset.photo.title}. Archive reference, context, not an exact match. Open source and licence.`}
          onFocus={() => onInspect?.()}
          onClick={() => onInspect?.()}
        >
          <img
            className="item-overlay-inset-image"
            src={inset.photo.src}
            alt={inset.photo.title}
            draggable={false}
            onError={() => handleImageError(inset.photo.id)}
          />
        </a>
        <figcaption className="item-overlay-inset-caption">
          <span className="item-overlay-inset-title">{inset.photo.title}</span>
          <span className="item-overlay-inset-note">Archive reference — context, not an exact match.</span>
        </figcaption>
      </figure>
    })}
  </div>
}
