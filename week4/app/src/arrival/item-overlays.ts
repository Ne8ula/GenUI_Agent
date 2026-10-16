// R18 object-bound overlays. Pure layout from viewport, supplied photos and explicit
// user selection: no clock, rotation, randomness or detector output. Authored source
// UV bounds stay pinned while hover/focus reveals one object's information.

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
  { id: 'stop-sign', title: 'Street sign', description: 'A round street sign stands above the curb. Its small markings are unresolved.' },
  { id: 'upper-window', title: 'Upper window', description: 'An upper window and planted façade break the dark right-hand building.' },
  { id: 'right-doorway', title: 'Recessed doorway', description: 'A dark-painted doorway anchors the street-level façade.' },
  { id: 'shopfront-board', title: 'Shopfront board', description: 'A narrow framed board sits beside the doorway. Its lettering is not readable.' },
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
  { id: 'stop-sign', rect: [.5542, .3663, .6162, .4884], defaultTone: 'mutedred', insetSide: 'right', preferredPhotoId: 'clichy' },
  { id: 'upper-window', rect: [.6368, .1279, .7208, .3488], defaultTone: 'white', insetSide: 'right', preferredPhotoId: 'montmartre' },
  { id: 'right-doorway', rect: [.6544, .3953, .7252, .8081], defaultTone: 'white', insetSide: 'right', preferredPhotoId: 'rue-christine' },
  { id: 'shopfront-board', rect: [.7341, .4767, .7842, .7035], defaultTone: 'mutedred', insetSide: 'right', preferredPhotoId: 'montparnasse' },
]

export const MOBILE_BREAKPOINT_PX = 650

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

/** All bounds remain visible; only the explicitly inspected object gains information.
 * Selection never depends on the animation clock or on photo availability. */
export function itemOverlayLayout(
  viewport: ViewportSize,
  photos: readonly OverlayPhoto[],
  inspectedId: string | null = null,
): ItemOverlayLayout {
  if (!validViewport(viewport)) return EMPTY_LAYOUT
  const mobile = isMobileViewport(viewport)
  // Lower boundary every overlay (box or inset) must stay above, so nothing covers
  // the host's reserved bottom prompt zone.
  const floorY = Math.max(MARGIN_PX, viewport.height - BOTTOM_RESERVED_PX)

  const resolved = OBJECT_BOUNDS.map(bound => ({ bound, photo: resolvePhotoForObject(bound.id, photos) }))
  const activeIds = inspectedId === null ? [] : [inspectedId]

  const byId = new Map(ITEM_OVERLAY_CONTENT.map(item => [item.id, item]))
  const boxesById = new Map<string, PixelBox>()
  const boxes: ItemOverlayBoxPose[] = []
  for (const { bound } of resolved) {
    const content = byId.get(bound.id)
    if (!content) continue
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
  const stackTop = mobile ? 108 : clamp((firstBox?.top ?? MARGIN_PX) + (firstBox?.height ?? 0) / 2 - insetHeight / 2, MARGIN_PX, floorY - stackHeight)
  let stackIndex = 0
  for (const id of orderedIds) {
    const entry = resolved.find(candidate => candidate.bound.id === id)
    const box = boxesById.get(id)
    if (!entry?.photo || !box) continue
    const side = entry.bound.insetSide
    const rawLeft = mobile
      ? (side === 'right' ? viewport.width - insetWidth - MARGIN_PX : MARGIN_PX)
      : side === 'right' ? box.left + box.width + MARGIN_PX : box.left - insetWidth - MARGIN_PX
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
