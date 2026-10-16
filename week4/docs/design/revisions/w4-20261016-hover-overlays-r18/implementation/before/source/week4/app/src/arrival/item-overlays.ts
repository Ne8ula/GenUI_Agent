// R17 object-bound overlay helpers. Pure, deterministic functions of viewport size,
// idleSeconds, reducedMotion and the externally supplied photo catalogue subset: no
// clock, no rAF, no randomness. Callers (ItemOverlays.tsx / ArrivalApp) supply
// idleSeconds from the existing host clock so Escape/pause/reduced-motion freeze this
// module exactly like the rest of the arrival timeline.
//
// R17 replaces the R16 floating description-card vocabulary (ITEM_OVERLAY_CONTENT /
// itemOverlayPoses with float/entrance animation) with hairline rectangles bound
// directly to authored source-image regions, compact monospace title tabs, sparse
// leader lines and occasional linked archival-photo insets, per the owner's three
// supplied references (red object-bound labels, white title tabs + dashed
// connectors, blue object box linked to photographic insets). Object positions are
// authored UV fractions of the source image, not detector output, and do not float:
// a bound rectangle that jittered would falsely resemble measured detection.

export interface ItemOverlayContent {
  readonly id: string
  readonly title: string
  readonly description: string
}

// Illustrative labels only (unchanged text from R16; see IMPLEMENTATION notes under
// week4/docs/design/revisions/w4-20261015-archive-tracking-r17/). Order is the stable
// accessible-list order; do not reorder without updating tests.
export const ITEM_OVERLAY_CONTENT: readonly ItemOverlayContent[] = [
  { id: 'cafe-terrace', title: 'Café terrace', description: 'An awning and small tables open the café onto the street.' },
  { id: 'street-lantern', title: 'Street lantern', description: 'A wall lantern marks the café frontage.' },
  { id: 'bistro-chairs', title: 'Woven bistro chairs', description: 'Light woven seats gather around a small round table.' },
  { id: 'stone-paving', title: 'Stone paving', description: 'Broken paving fragments carry the street into open space.' },
]

export type ItemOverlayTone = 'blue' | 'white' | 'mutedred'

/** A photograph the host may link as a reference inset. Field shape is the explicit
 * bounded contract with the host (main owns the real 7-photo catalogue); this module
 * never imports a catalogue module and never invents a photo id. */
export interface OverlayPhoto {
  readonly id: string
  readonly src: string
  readonly title: string
  readonly creditHref: string
}

interface ItemOverlayBound {
  readonly id: string
  /** Authored source-image UV rectangle [u0, v0, u1, v1], 0..1, origin top-left,
   * matching the suggested bounds against the actual settled screenshot. Not detector
   * output; adjusted to avoid the walking figures. */
  readonly rect: readonly [number, number, number, number]
  readonly defaultTone: ItemOverlayTone
  /** Open-space side the linked reference inset is offered on. */
  readonly insetSide: 'left' | 'right'
  /** Preferred photo id from the host's supplied catalogue; only used if actually
   * present in the `photos` prop. No fuzzy fallback: an unmatched object simply shows
   * its bound rectangle without a linked inset rather than a wrong/duplicate photo. */
  readonly preferredPhotoId: string
}

const OBJECT_BOUNDS: readonly ItemOverlayBound[] = [
  { id: 'cafe-terrace', rect: [.17, .36, .465, .61], defaultTone: 'white', insetSide: 'left', preferredPhotoId: 'rue-christine' },
  { id: 'street-lantern', rect: [.145, .28, .195, .40], defaultTone: 'mutedred', insetSide: 'left', preferredPhotoId: 'montmartre' },
  { id: 'bistro-chairs', rect: [.12, .70, .27, .96], defaultTone: 'white', insetSide: 'left', preferredPhotoId: 'montparnasse' },
  { id: 'stone-paving', rect: [.30, .84, .415, .95], defaultTone: 'mutedred', insetSide: 'left', preferredPhotoId: 'beaubourg' },
]

export const MOBILE_BREAKPOINT_PX = 650
export const MAX_INSETS_DESKTOP = 2
export const MAX_INSETS_MOBILE = 1
/** Readable hold per the owner's requested 3-6s inset window. */
export const INSET_HOLD_SECONDS = 4.5

const MARGIN_PX = 16
const BOTTOM_RESERVED_PX = 100
const INSET_WIDTH_PX = 220
const INSET_HEIGHT_PX = 180
const MOBILE_INSET_WIDTH_PX = 180
const MOBILE_INSET_HEIGHT_PX = 164

// Fixed projection constants matching week4/app/src/scan/renderer.ts's orthographic
// camera (source aspect 3392/1720, halfW=max(1,viewportAspect/sourceAspect)/.96,
// halfH=halfW/viewportAspect). Reproduced here as a pure 2D mapping (no Three.js
// dependency) so authored source-UV object bounds land on the actual rendered scene
// regardless of viewport aspect/letterboxing.
export const SOURCE_WIDTH = 3392
export const SOURCE_HEIGHT = 1720
export const SOURCE_ASPECT = SOURCE_WIDTH / SOURCE_HEIGHT
const FRUSTUM_MARGIN = .96

export interface ViewportSize {
  readonly width: number
  readonly height: number
}

export interface PixelPoint {
  readonly x: number
  readonly y: number
}

export interface PixelBox {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function validViewport(viewport: ViewportSize): boolean {
  return finiteOrZero(viewport.width) > 0 && finiteOrZero(viewport.height) > 0
}

function frustumHalfExtents(viewport: ViewportSize): { halfW: number; halfH: number } {
  const aspect = viewport.width / viewport.height
  const halfW = Math.max(1, aspect / SOURCE_ASPECT) / FRUSTUM_MARGIN
  const halfH = halfW / aspect
  return { halfW, halfH }
}

/** Maps a source-image UV coordinate (0..1, origin top-left) to a CSS pixel point in
 * the current viewport, using the same contain-fit orthographic projection as the
 * point-cloud renderer. Pure function of (u, v, viewport). */
export function projectSourcePoint(u: number, v: number, viewport: ViewportSize): PixelPoint {
  if (!validViewport(viewport)) return { x: 0, y: 0 }
  const { halfW, halfH } = frustumHalfExtents(viewport)
  const worldX = (u - .5) * 2
  const worldY = (.5 - v) * 2 / SOURCE_ASPECT
  const x = ((worldX + halfW) / (2 * halfW)) * viewport.width
  const y = ((halfH - worldY) / (2 * halfH)) * viewport.height
  return { x, y }
}

/** Maps an authored source-UV rectangle to a CSS pixel box. Pure, deterministic. */
export function projectSourceRect(rect: readonly [number, number, number, number], viewport: ViewportSize): PixelBox {
  const [u0, v0, u1, v1] = rect
  const a = projectSourcePoint(u0, v0, viewport)
  const b = projectSourcePoint(u1, v1, viewport)
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

export function isMobileViewport(viewport: ViewportSize): boolean {
  return finiteOrZero(viewport.width) > 0 && viewport.width <= MOBILE_BREAKPOINT_PX
}

/** Resolves the preferred photo for an authored object id from the host-supplied
 * catalogue subset. Returns undefined (no inset, not a substitute photo) if the
 * preferred id is absent. */
export function resolvePhotoForObject(objectId: string, photos: readonly OverlayPhoto[]): OverlayPhoto | undefined {
  const bound = OBJECT_BOUNDS.find(candidate => candidate.id === objectId)
  if (!bound) return undefined
  return photos.find(photo => photo.id === bound.preferredPhotoId)
}

/** Deterministic rotating subset of object ids eligible for a linked inset right now.
 * Pure function of idleSeconds; holds each selection for INSET_HOLD_SECONDS. */
export function activeInsetIds(idleSeconds: number, viewport: ViewportSize, availableIds: readonly string[]): readonly string[] {
  if (availableIds.length === 0) return []
  const count = Math.min(isMobileViewport(viewport) ? MAX_INSETS_MOBILE : MAX_INSETS_DESKTOP, availableIds.length)
  const t = Math.max(0, finiteOrZero(idleSeconds))
  const cycle = Math.floor(t / INSET_HOLD_SECONDS)
  const start = (cycle * count) % availableIds.length
  const ids: string[] = []
  for (let i = 0; i < count; i += 1) {
    const index = (start + i) % availableIds.length
    const id = availableIds[index]
    if (id !== undefined && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** Deterministic single rotating focus id over every authored object, independent of
 * photo availability, so a narrow viewport still shows one labelled box even when no
 * matching archival photo is currently supplied. */
function rotatingFocusId(idleSeconds: number, reducedMotion: boolean, order: readonly string[]): string | undefined {
  if (order.length === 0) return undefined
  if (reducedMotion) return order[0]
  const t = Math.max(0, finiteOrZero(idleSeconds))
  const cycle = Math.floor(t / INSET_HOLD_SECONDS)
  return order[cycle % order.length]
}

export interface ItemOverlayBoxPose extends ItemOverlayContent {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly tone: ItemOverlayTone
  readonly active: boolean
}

export interface ItemOverlayInsetPose {
  readonly objectId: string
  readonly photo: OverlayPhoto
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export type ItemOverlayConnectorStyle = 'solid' | 'dashed'

export interface ItemOverlayConnectorPose {
  readonly objectId: string
  readonly left: number
  readonly top: number
  readonly length: number
  readonly angleDeg: number
  readonly style: ItemOverlayConnectorStyle
}

export interface ItemOverlayLayout {
  readonly boxes: readonly ItemOverlayBoxPose[]
  readonly insets: readonly ItemOverlayInsetPose[]
  readonly connectors: readonly ItemOverlayConnectorPose[]
}

const EMPTY_LAYOUT: ItemOverlayLayout = { boxes: [], insets: [], connectors: [] }

function edgePoint(box: PixelBox, side: 'left' | 'right'): PixelPoint {
  return { x: side === 'right' ? box.left + box.width : box.left, y: box.top + box.height / 2 }
}

function connector(objectId: string, from: PixelPoint, to: PixelPoint): ItemOverlayConnectorPose {
  const dx = to.x - from.x, dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  return { objectId, left: from.x, top: from.y, length, angleDeg, style: 'dashed' }
}

/**
 * Deterministic bounded layout for the currently active object-bound overlays, their
 * sparse leader lines and up to MAX_INSETS_DESKTOP/MOBILE linked archival-photo
 * insets. Pure function of viewport size, idleSeconds, reducedMotion and the
 * host-supplied photo catalogue subset: no randomness, no wall clock, no floating
 * motion (a bound rectangle must stay pinned to its authored region).
 */
export function itemOverlayLayout(
  viewport: ViewportSize,
  idleSeconds: number,
  reducedMotion: boolean,
  photos: readonly OverlayPhoto[],
): ItemOverlayLayout {
  if (!validViewport(viewport)) return EMPTY_LAYOUT
  const mobile = isMobileViewport(viewport)
  // Lower boundary every overlay (box or inset) must stay above, so nothing covers
  // the host's reserved bottom prompt zone.
  const floorY = Math.max(MARGIN_PX, viewport.height - BOTTOM_RESERVED_PX)

  const resolved = OBJECT_BOUNDS.map(bound => ({ bound, photo: resolvePhotoForObject(bound.id, photos) }))
  const availableIds = resolved.filter(entry => entry.photo !== undefined).map(entry => entry.bound.id)
  const allIds = OBJECT_BOUNDS.map(bound => bound.id)

  // On narrow viewports, which single object keeps a visible box/label is decided
  // independently of photo availability (fewer visual labels, but still legible
  // object context even when no matching archival photo is currently supplied).
  const mobileFocusId = mobile ? rotatingFocusId(idleSeconds, reducedMotion, allIds) : undefined
  const visibleIds = mobile ? (mobileFocusId !== undefined ? [mobileFocusId] : []) : allIds

  // Reduced motion: a single static inspectable reference, not a rotation.
  const activeIds = mobile
    ? (mobileFocusId !== undefined && availableIds.includes(mobileFocusId) ? [mobileFocusId] : [])
    : reducedMotion
      ? availableIds.slice(0, Math.min(MAX_INSETS_MOBILE, availableIds.length))
      : activeInsetIds(idleSeconds, viewport, availableIds)

  const byId = new Map(ITEM_OVERLAY_CONTENT.map(item => [item.id, item]))
  const boxesById = new Map<string, PixelBox>()
  const boxes: ItemOverlayBoxPose[] = []
  for (const { bound } of resolved) {
    const content = byId.get(bound.id)
    if (!content) continue
    // On narrow viewports only the currently focused object keeps a visible label;
    // the rest stay in the accessible list only (never shrink type below 12px).
    if (mobile && !visibleIds.includes(bound.id)) continue
    const rawBox = projectSourceRect(bound.rect, viewport)
    const boxHeight = Math.max(0, Math.min(rawBox.height, floorY))
    const box: PixelBox = {
      left: clamp(rawBox.left, 0, Math.max(0, viewport.width - rawBox.width)),
      top: clamp(rawBox.top, 0, Math.max(0, floorY - boxHeight)),
      width: Math.min(rawBox.width, viewport.width),
      height: boxHeight,
    }
    boxesById.set(bound.id, box)
    const active = activeIds.includes(bound.id)
    boxes.push({ ...content, left: box.left, top: box.top, width: box.width, height: box.height, tone: active ? 'blue' : bound.defaultTone, active })
  }

  const insets: ItemOverlayInsetPose[] = []
  const connectors: ItemOverlayConnectorPose[] = []
  const insetWidth = mobile ? MOBILE_INSET_WIDTH_PX : INSET_WIDTH_PX
  const insetHeight = mobile ? MOBILE_INSET_HEIGHT_PX : INSET_HEIGHT_PX
  const orderedIds = [...activeIds].sort((a, b) => (boxesById.get(a)?.top ?? 0) - (boxesById.get(b)?.top ?? 0))
  const stackHeight = orderedIds.length * (insetHeight + MARGIN_PX) - MARGIN_PX
  const firstBox = boxesById.get(orderedIds[0] ?? '')
  const stackTop = mobile ? MARGIN_PX : clamp((firstBox?.top ?? MARGIN_PX) + (firstBox?.height ?? 0) / 2 - insetHeight / 2, MARGIN_PX, floorY - stackHeight)
  let stackIndex = 0
  for (const id of orderedIds) {
    const entry = resolved.find(candidate => candidate.bound.id === id)
    const box = boxesById.get(id)
    if (!entry?.photo || !box) continue
    const side = entry.bound.insetSide
    const rawLeft = side === 'right' ? viewport.width - insetWidth - MARGIN_PX : MARGIN_PX
    const rawTop = stackTop + stackIndex * (insetHeight + MARGIN_PX)
    const insetBox: PixelBox = {
      left: clamp(rawLeft, 0, Math.max(0, viewport.width - insetWidth)),
      top: clamp(rawTop, 0, Math.max(0, floorY - insetHeight)),
      width: insetWidth,
      height: insetHeight,
    }
    stackIndex += 1
    insets.push({ objectId: id, photo: entry.photo, left: insetBox.left, top: insetBox.top, width: insetBox.width, height: insetBox.height })
    const from = edgePoint(box, side)
    const to = edgePoint(insetBox, side === 'right' ? 'left' : 'right')
    connectors.push(connector(id, from, to))
  }

  return { boxes, insets, connectors }
}
