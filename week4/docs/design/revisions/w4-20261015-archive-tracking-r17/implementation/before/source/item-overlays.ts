// Pure, deterministic pose/content helpers for the R16 item overlay rectangles.
// No clock, no rAF, no randomness: callers (ItemOverlays.tsx / ArrivalApp) supply
// idleSeconds from the existing host clock so Escape/pause/reduced-motion freeze
// this module exactly like the rest of the arrival timeline.

export interface ItemOverlayContent {
  readonly id: string
  readonly title: string
  readonly description: string
}

// Illustrative labels only (see R16 IMPLEMENTATION.md "Object descriptions").
// Order is the stable accessible-list order; do not reorder without updating tests.
export const ITEM_OVERLAY_CONTENT: readonly ItemOverlayContent[] = [
  { id: 'cafe-terrace', title: 'Café terrace', description: 'An awning and small tables open the café onto the street.' },
  { id: 'street-lantern', title: 'Street lantern', description: 'A wall lantern marks the café frontage.' },
  { id: 'bistro-chairs', title: 'Woven bistro chairs', description: 'Light woven seats gather around a small round table.' },
  { id: 'stone-paving', title: 'Stone paving', description: 'Broken paving fragments carry the street into open space.' },
]

export type ItemOverlayStripe = 'cyan' | 'magenta' | 'lime' | 'white'
export type ItemOverlaySide = 'left' | 'right'

interface ItemOverlayAnchor {
  readonly id: string
  /** Fraction (0..1) of viewport width/height; see current-scene anchors (facade left,
   * lantern upper-left, table/chairs lower-left, pavement low-middle, offset right of
   * the walking figures and the prompt). Not detected geometry. */
  readonly xFraction: number
  readonly yFraction: number
  /** Which edge of the card sits at the anchor point; the card grows away from it. */
  readonly origin: ItemOverlaySide
  readonly stripe: ItemOverlayStripe
  readonly trail: ItemOverlaySide
  /** Deterministic float-phase seed, distinct per item so motion is desynchronised. */
  readonly seed: number
}

const ANCHORS: readonly ItemOverlayAnchor[] = [
  { id: 'cafe-terrace', xFraction: 0.51, yFraction: 0.27, origin: 'left', stripe: 'cyan', trail: 'left', seed: 0.3 },
  { id: 'street-lantern', xFraction: 0.025, yFraction: 0.30, origin: 'left', stripe: 'magenta', trail: 'right', seed: 1.1 },
  { id: 'bistro-chairs', xFraction: 0.018, yFraction: 0.79, origin: 'left', stripe: 'lime', trail: 'right', seed: 2.4 },
  { id: 'stone-paving', xFraction: 0.96, yFraction: 0.78, origin: 'right', stripe: 'white', trail: 'left', seed: 3.6 },
]

// Deterministic desktop/mobile subset order. Mobile rotates pairs so every label
// remains reachable without shrinking type or crowding the open-face/prompt zones.
const MOBILE_ORDER: readonly string[] = ['street-lantern', 'stone-paving', 'cafe-terrace', 'bistro-chairs']

export const MOBILE_BREAKPOINT_PX = 650
export const MOBILE_VISIBLE_COUNT = 2
const MOBILE_HOLD_SECONDS = 7

export const FLOAT_AMPLITUDE_PX = 5
const FLOAT_PERIOD_SECONDS = 10
const ENTRANCE_SECONDS = 1.2
const ENTRANCE_MIN = 0.35

const MARGIN_PX = 16
const BOTTOM_RESERVED_PX = 100
const DESKTOP_CARD_WIDTH_PX = 240
const MOBILE_CARD_WIDTH_PX = 190
const CARD_HEIGHT_PX = 96

export interface ViewportSize {
  readonly width: number
  readonly height: number
}

export interface ItemOverlayPose extends ItemOverlayContent {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly origin: ItemOverlaySide
  readonly stripe: ItemOverlayStripe
  readonly trail: ItemOverlaySide
  readonly floatX: number
  readonly floatY: number
  readonly entrance: number
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function floatOffset(idleSeconds: number, seed: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0
  const t = Math.max(0, finiteOrZero(idleSeconds))
  const angle = ((t + seed) / FLOAT_PERIOD_SECONDS) * Math.PI * 2
  return Math.sin(angle) * FLOAT_AMPLITUDE_PX
}

function entranceProgress(idleSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1
  const t = Math.max(0, finiteOrZero(idleSeconds))
  return clamp(ENTRANCE_MIN + (t / ENTRANCE_SECONDS) * (1 - ENTRANCE_MIN), ENTRANCE_MIN, 1)
}

export function isMobileViewport(viewport: ViewportSize): boolean {
  return finiteOrZero(viewport.width) > 0 && viewport.width <= MOBILE_BREAKPOINT_PX
}

/** Deterministic rotating subset of ids shown at once on narrow viewports. */
export function mobileActiveIds(idleSeconds: number): readonly string[] {
  const t = Math.max(0, finiteOrZero(idleSeconds))
  const cycle = Math.floor(t / MOBILE_HOLD_SECONDS)
  const start = (cycle * MOBILE_VISIBLE_COUNT) % MOBILE_ORDER.length
  const ids: string[] = []
  for (let i = 0; i < MOBILE_VISIBLE_COUNT; i += 1) {
    ids.push(MOBILE_ORDER[(start + i) % MOBILE_ORDER.length]!)
  }
  return ids
}

/**
 * Deterministic bounded poses for the currently active overlays. Pure function of
 * viewport size, idleSeconds and reducedMotion: no randomness, no wall clock.
 */
export function itemOverlayPoses(viewport: ViewportSize, idleSeconds: number, reducedMotion: boolean): readonly ItemOverlayPose[] {
  const width = Math.max(0, finiteOrZero(viewport.width))
  const height = Math.max(0, finiteOrZero(viewport.height))
  if (width === 0 || height === 0) return []
  const mobile = isMobileViewport(viewport)
  const activeIds = mobile ? mobileActiveIds(reducedMotion ? 0 : idleSeconds) : ANCHORS.map(anchor => anchor.id)
  const cardWidth = Math.min(mobile ? MOBILE_CARD_WIDTH_PX : DESKTOP_CARD_WIDTH_PX, Math.max(0, width - MARGIN_PX * 2))
  const maxLeft = Math.max(MARGIN_PX, width - cardWidth - MARGIN_PX)
  const maxTop = Math.max(MARGIN_PX, height - CARD_HEIGHT_PX - MARGIN_PX - BOTTOM_RESERVED_PX)
  const byId = new Map(ITEM_OVERLAY_CONTENT.map(item => [item.id, item]))
  const poses: ItemOverlayPose[] = []
  for (const anchor of ANCHORS) {
    if (!activeIds.includes(anchor.id)) continue
    const content = byId.get(anchor.id)
    if (!content) continue
    const floatX = floatOffset(idleSeconds, anchor.seed, reducedMotion)
    const floatY = floatOffset(idleSeconds, anchor.seed + 2.5, reducedMotion) * 0.6
    const anchorX = anchor.xFraction * width
    const anchorY = anchor.yFraction * height
    const rawLeft = anchor.origin === 'left' ? anchorX + floatX : anchorX - cardWidth + floatX
    const left = clamp(rawLeft, MARGIN_PX, maxLeft)
    const top = clamp(anchorY + floatY, MARGIN_PX, maxTop)
    poses.push({
      ...content,
      left, top, width: cardWidth,
      origin: anchor.origin, stripe: anchor.stripe, trail: anchor.trail,
      floatX, floatY,
      entrance: entranceProgress(idleSeconds, reducedMotion),
    })
  }
  return poses
}
