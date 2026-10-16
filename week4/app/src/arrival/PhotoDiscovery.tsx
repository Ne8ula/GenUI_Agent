import { useEffect, useState } from 'react'
import { ARCHIVE_PHOTOS, PHOTO_FRAGMENTS, discoveryPose, discoveryWindows, type DiscoveryState } from './discovery'

export function PhotoDiscovery({ state, onAssets, onInspect }: {
  state: DiscoveryState
  onAssets: (loaded: number, failed: number) => void
  onInspect: () => void
}) {
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set())
  useEffect(() => {
    let dead = false
    const images: HTMLImageElement[] = []
    const good = new Set<number>(), done = new Set<number>()
    const finish = (index: number, success: boolean) => {
      if (dead || done.has(index)) return
      done.add(index)
      if (success) good.add(index)
      setLoaded(new Set(good))
      if (done.size === ARCHIVE_PHOTOS.length) onAssets(good.size, done.size - good.size)
    }
    ARCHIVE_PHOTOS.forEach((source, index) => {
      const image = new Image(); images.push(image)
      image.onload = () => finish(index, image.naturalWidth > 0)
      image.onerror = () => finish(index, false)
      image.src = source.src
    })
    const timeout = window.setTimeout(() => ARCHIVE_PHOTOS.forEach((_, index) => finish(index, false)), 10000)
    return () => {
      dead = true; clearTimeout(timeout)
      images.forEach(image => { image.onload = null; image.onerror = null; image.removeAttribute('src') })
    }
  }, [onAssets])
  if (!state.active) return null
  const pose = discoveryPose(state.seconds, 0)
  const windows = discoveryWindows(state.seconds, [...loaded])
  return <section className="discovery-stage" aria-label="Curated archival photographs of Paris; open a photograph for its source and licence" data-seconds={state.seconds.toFixed(3)}>
    <div className="discovery-scale"><div className="discovery-cluster" style={{ transform: `rotateY(${pose.turn}deg) rotateX(-4deg)` }}>
      <svg className="discovery-links" viewBox="-450 -340 900 680" aria-hidden="true" style={{ opacity: pose.opacity * .4 }}>
        {windows.map(({ slot }, index) => {
          const item = PHOTO_FRAGMENTS[slot]!
          const nextWindow = windows[(index + 2) % windows.length]
          if (!nextWindow || windows.length < 3) return null
          const next = PHOTO_FRAGMENTS[nextWindow.slot]!
          const fromPose = discoveryPose(state.seconds, slot), toPose = discoveryPose(state.seconds, nextWindow.slot)
          return <line key={item.id} x1={item.x * fromPose.spread} y1={item.y * fromPose.spread} x2={next.x * toPose.spread} y2={next.y * toPose.spread} />
        })}
      </svg>
      {windows.map(({ slot, photo, focused, focus }) => {
        const item = PHOTO_FRAGMENTS[slot]!, source = ARCHIVE_PHOTOS[photo]!
        const p = discoveryPose(state.seconds, slot)
        const depth = item.z + (240 - item.z) * focus
        return <a key={item.id} className="discovery-photo" href={source.creditHref} target="_blank" rel="noopener noreferrer"
          data-window={item.id} data-source-id={source.id} data-focused={focused}
          aria-label={`${source.title}, ${source.creator}. Display crop; open source and licence in a new tab.`}
          tabIndex={p.opacity > .1 ? 0 : -1} aria-hidden={p.opacity <= .1} onFocus={onInspect} onClick={onInspect}
          style={{ width: item.w, height: item.h, opacity: p.opacity, pointerEvents: p.opacity > .1 ? 'auto' : 'none',
            outlineColor: `rgba(160, 185, 235, ${.17 + .58 * focus})`,
            transform: `translate3d(${item.x * p.spread - item.w / 2}px, ${item.y * p.spread - item.h / 2 + p.lift}px, ${depth}px) rotateX(${item.rx * (1 - focus * .7)}deg) rotateY(${item.ry * (1 - focus * .7)}deg)` }}>
          <img src={source.src} alt="" draggable={false} />
        </a>
      })}
    </div></div>
  </section>
}
