import { ARCHIVE_PHOTOS } from './archive.ts'
export { ARCHIVE_PHOTOS } from './archive.ts'

export const DISCOVERY_SECONDS = 12
export const WINDOW_FOCUS_SECONDS = .65
export const PHOTO_SWAP_SECONDS = 1.3
export interface DiscoveryState { active: boolean; seconds: number; playing: boolean }
export const initialDiscovery = (): DiscoveryState => ({ active: false, seconds: 0, playing: false })
export function seekDiscovery(seconds: number, reduced = false): DiscoveryState {
  return { active: true, seconds: reduced ? 5 : Number.isFinite(seconds) ? Math.max(0, Math.min(DISCOVERY_SECONDS, seconds)) : 0, playing: false }
}
export function startDiscovery(reduced = false): DiscoveryState {
  return { ...seekDiscovery(0, reduced), playing: !reduced }
}
export function advanceDiscovery(state: DiscoveryState, delta: number): DiscoveryState {
  if (!state.active || !state.playing) return state
  const step = Number.isFinite(delta) ? Math.max(0, Math.min(.1, delta)) : 0
  if (!step) return state
  const seconds = Math.min(DISCOVERY_SECONDS, state.seconds + step)
  return { active: seconds < DISCOVERY_SECONDS, seconds, playing: seconds < DISCOVERY_SECONDS }
}

// Authored window positions, not reconstructed cameras or measured correspondences.
export const PHOTO_FRAGMENTS = [
  { id: 'window-1', x: -235, y: -100, z: -70, w: 270, h: 190, rx: -5, ry: 16 },
  { id: 'window-2', x: 55, y: -145, z: -130, w: 200, h: 245, rx: 6, ry: -12 },
  { id: 'window-3', x: 260, y: -65, z: 15, w: 235, h: 165, rx: -7, ry: -17 },
  { id: 'window-4', x: -25, y: 25, z: 100, w: 340, h: 226, rx: 2, ry: -5 },
  { id: 'window-5', x: -255, y: 165, z: 35, w: 185, h: 230, rx: 5, ry: 18 },
  { id: 'window-6', x: 215, y: 190, z: -15, w: 230, h: 175, rx: -3, ry: -14 },
  { id: 'window-7', x: -30, y: 225, z: -110, w: 155, h: 115, rx: 8, ry: 4 },
] as const
const smooth = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x) }
const boundedTime = (seconds: number) => Number.isFinite(seconds) ? Math.max(0, Math.min(DISCOVERY_SECONDS, seconds)) : 0

export function discoveryWindows(seconds: number, available: readonly number[]) {
  const order = [...new Set(available)].filter(i => Number.isInteger(i) && i >= 0 && i < ARCHIVE_PHOTOS.length).sort((a, b) => a - b).slice(0, PHOTO_FRAGMENTS.length)
  if (!order.length) return []
  const t = boundedTime(seconds)
  // Swap only two assignments per beat. Every rendered frame stays a permutation,
  // including missing-photo cases: no duplicate photographs or mass-flash replacement.
  const swaps = Math.floor(Math.max(0, t - 1.8) / PHOTO_SWAP_SECONDS)
  for (let step = 0; step < swaps; step++) {
    const a = (step * 2) % order.length, b = (a + 1) % order.length
    ;[order[a], order[b]] = [order[b]!, order[a]!]
  }
  const beat = Math.max(0, t - 1.8) / WINDOW_FOCUS_SECONDS
  const current = Math.floor(beat) % order.length
  const previous = (current + order.length - 1) % order.length
  const handoff = beat < 1 ? 1 : smooth((beat % 1) / .22)
  return order.map((photo, slot) => ({
    photo, slot, focused: slot === current,
    focus: order.length === 1 ? 1 : slot === current ? handoff : slot === previous ? 1 - handoff : 0,
  }))
}

export function discoveryPose(seconds: number, index: number) {
  const t = boundedTime(seconds)
  const enter = smooth((t - .2 - index * .16) / 1.1)
  const exit = smooth((t - 10.5) / 1.5)
  return { opacity: enter * (1 - exit), spread: .65 + .35 * enter - .25 * exit, turn: Math.sin(t * .23 - .6) * 11, lift: (1 - enter) * 34 - exit * 12 }
}
