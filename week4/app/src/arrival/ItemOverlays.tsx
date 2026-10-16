import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ITEM_OVERLAY_CONTENT, isMobileViewport, itemOverlayLayout, type OverlayPhoto } from './item-overlays'
import './item-overlays.css'

// Only explicit inspection reveals information. The host unmounts this subtree
// during discovery, return and errors, so no stale selection survives a new scene.
export function ItemOverlays({ photos = [], onInspect }: {
  photos?: readonly OverlayPhoto[]
  onInspect?: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [failedPhotoIds, setFailedPhotoIds] = useState<ReadonlySet<string>>(() => new Set())
  const cancelClose = () => { clearTimeout(closeTimer.current); closeTimer.current = undefined }
  const inspect = (id: string) => { cancelClose(); setActiveId(id) }

  useEffect(() => {
    const element = root.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect
      if (box) setViewport(previous => previous.width === box.width && previous.height === box.height ? previous : { width: box.width, height: box.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const dismiss = () => { cancelClose(); setActiveId(null) }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Keep keyboard position when dismissing a photo link that will unmount.
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused.matches('.archive-inset')) {
        focused.closest('.item-overlay-group')?.querySelector<HTMLButtonElement>('.item-overlay-box')?.focus()
      }
      dismiss()
    }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.item-overlay-group')) dismiss()
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', outside)
    return () => {
      cancelClose()
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', outside)
    }
  }, [])

  const usablePhotos = useMemo(
    () => failedPhotoIds.size === 0 ? photos : photos.filter(photo => !failedPhotoIds.has(photo.id)),
    [photos, failedPhotoIds],
  )
  const layout = itemOverlayLayout(viewport, usablePhotos, activeId)
  const mobile = isMobileViewport(viewport)
  const textLeft = (left: number) => Math.max(16, Math.min(left, viewport.width - 256))
  const handleImageError = (id: string) => setFailedPhotoIds(previous => previous.has(id) ? previous : new Set(previous).add(id))

  return <div ref={root} className="item-overlays-root">
    <ul className="item-overlays-sr-list" aria-label="Illustrative Paris scene items">
      {ITEM_OVERLAY_CONTENT.map(item => <li key={item.id} id={`item-summary-${item.id}`}>
        {item.title}: {item.description}
      </li>)}
    </ul>
    {layout.boxes.map(box => {
      const inset = layout.insets.find(item => item.objectId === box.id)
      const line = layout.connectors.find(item => item.objectId === box.id)
      const style: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height }
      const descriptionLeft = mobile ? 16 : textLeft(box.left)
      let descriptionTop = mobile ? 44 : Math.min(box.top + box.height + 6, viewport.height - 164)
      if (!mobile && inset && descriptionLeft < inset.left + inset.width && descriptionLeft + 240 > inset.left && descriptionTop < inset.top + inset.height && descriptionTop + 52 > inset.top) {
        descriptionTop = Math.min(inset.top + inset.height + 6, viewport.height - 164)
        if (descriptionTop < inset.top + inset.height) descriptionTop = Math.max(16, inset.top - 58)
      }
      return <div key={box.id} className={`item-overlay-group item-overlay-box--${box.tone}`} data-active={box.active}
        onPointerEnter={event => { if (event.pointerType !== 'touch') inspect(box.id) }}
        onPointerLeave={event => {
          if (event.pointerType === 'touch' || event.currentTarget.contains(document.activeElement)) return
          cancelClose()
          // A small grace period allows travel across the gap to the photo or text.
          closeTimer.current = setTimeout(() => setActiveId(current => current === box.id ? null : current), 300)
        }}
        onFocusCapture={() => inspect(box.id)}
        onBlurCapture={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            cancelClose(); setActiveId(current => current === box.id ? null : current)
          }
        }}
      >
        <button type="button" data-item-id={box.id} className="item-overlay-box" style={style}
          aria-label={box.title} aria-describedby={`item-summary-${box.id}`} aria-expanded={box.active}
          onClick={() => inspect(box.id)} />
        {box.active && <>
          <span className="item-overlay-tab" style={{ left: mobile ? 16 : textLeft(box.left), top: mobile ? 16 : Math.max(16, box.top - 27) }}>{box.title}</span>
          <p className="item-overlay-desc" style={{ left: descriptionLeft, top: descriptionTop }}>{box.description}</p>
        </>}
        {line && <span aria-hidden="true" className={`item-overlay-connector item-overlay-connector--${line.style}`}
          style={{ left: line.left, top: line.top, width: line.length, transform: `rotate(${line.angleDeg}deg)` }} />}
        {inset && <figure className="item-overlay-inset" data-item-id={box.id}
          style={{ left: inset.left, top: inset.top, width: inset.width, height: inset.height }}>
          <a className="item-overlay-inset-link archive-inset" data-photo-id={inset.photo.id}
            href={inset.photo.creditHref} target="_blank" rel="noopener noreferrer"
            aria-label={`${inset.photo.title}. Archive reference, context, not an exact match. Open source and licence.`}
            onFocus={() => onInspect?.()} onClick={() => onInspect?.()}>
            <img className="item-overlay-inset-image" src={inset.photo.src} alt={inset.photo.title}
              draggable={false} onError={() => handleImageError(inset.photo.id)} />
          </a>
          <figcaption className="item-overlay-inset-caption">
            <span className="item-overlay-inset-title">{inset.photo.title}</span>
            <span className="item-overlay-inset-note">Archive reference — context, not an exact match.</span>
          </figcaption>
        </figure>}
      </div>
    })}
  </div>
}
