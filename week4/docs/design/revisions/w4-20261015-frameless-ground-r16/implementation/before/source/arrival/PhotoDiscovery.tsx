import { useEffect, useState } from 'react'
import { ARCHIVE_PHOTOS, PHOTO_FRAGMENTS, discoveryPose, type DiscoveryState } from './discovery'

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
  return <section className="discovery-stage" aria-label="Curated archival photographs of Paris; open a photograph for its source and licence" data-seconds={state.seconds.toFixed(3)}>
    <div className="discovery-scale"><div className="discovery-cluster" style={{ transform: `rotateY(${pose.turn}deg) rotateX(-4deg)` }}>
      <svg className="discovery-links" viewBox="-450 -340 900 680" aria-hidden="true" style={{ opacity: pose.opacity * .4 }}>
        {PHOTO_FRAGMENTS.map((item, index) => {
          const next = PHOTO_FRAGMENTS[(index + 2) % PHOTO_FRAGMENTS.length]
          if (!next || !loaded.has(item.photo) || !loaded.has(next.photo)) return null
          const fromPose = discoveryPose(state.seconds, index)
          const toPose = discoveryPose(state.seconds, (index + 2) % PHOTO_FRAGMENTS.length)
          return <line key={item.id} x1={item.x * fromPose.spread} y1={item.y * fromPose.spread} x2={next.x * toPose.spread} y2={next.y * toPose.spread} />
        })}
      </svg>
      {PHOTO_FRAGMENTS.map((item, index) => {
        if (!loaded.has(item.photo)) return null
        const source = ARCHIVE_PHOTOS[item.photo]
        const p = discoveryPose(state.seconds, index)
        return <a key={item.id} className="discovery-photo" href={`/sources/paris-r15/credits.html#${source.id}`} target="_blank" rel="noopener noreferrer"
          aria-label={`${source.title}. ${index > 3 ? 'Detail crop. ' : ''}Open source and licence in a new tab.`}
          tabIndex={p.opacity > .1 ? 0 : -1} aria-hidden={p.opacity <= .1} onFocus={onInspect} onClick={onInspect}
          style={{ width: item.w, height: item.h, opacity: p.opacity, pointerEvents: p.opacity > .1 ? 'auto' : 'none',
            transform: `translate3d(${item.x * p.spread - item.w / 2}px, ${item.y * p.spread - item.h / 2 + p.lift}px, ${item.z}px) rotateX(${item.rx}deg) rotateY(${item.ry}deg)` }}>
          <img src={source.src} alt="" draggable={false} style={{ objectPosition: item.crop }} />
        </a>
      })}
    </div></div>
  </section>
}
