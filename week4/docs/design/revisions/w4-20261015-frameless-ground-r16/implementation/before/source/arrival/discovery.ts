export const DISCOVERY_SECONDS = 12
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

export const ARCHIVE_PHOTOS = [
  { id: 'montparnasse', src: '/sources/paris-r15/montparnasse-1980.jpg', title: 'Montparnasse, Paris 1980 — Pascal Dolémieux, photographic postcard' },
  { id: 'montmartre', src: '/sources/paris-r15/montmartre-1980.jpg', title: 'Les escaliers de Montmartre, 1980 — bigup21' },
  { id: 'conciergerie', src: '/sources/paris-r15/conciergerie-1980.jpg', title: 'Conciergerie, Paris, 1980 — Johnckarnes' },
] as const

// These are authored presentation positions, not reconstructed cameras or measured correspondences.
export const PHOTO_FRAGMENTS = [
  { id: 'street', photo: 0, x: -235, y: -100, z: -70, w: 270, h: 190, rx: -5, ry: 16, crop: '50% 45%' },
  { id: 'facade', photo: 1, x: 55, y: -145, z: -130, w: 200, h: 245, rx: 6, ry: -12, crop: '80% 40%' },
  { id: 'city', photo: 2, x: 260, y: -65, z: 15, w: 235, h: 165, rx: -7, ry: -17, crop: '70% 50%' },
  { id: 'montparnasse', photo: 0, x: -25, y: 25, z: 100, w: 340, h: 226, rx: 2, ry: -5, crop: '50% 50%' },
  { id: 'street-detail', photo: 1, x: -255, y: 165, z: 35, w: 185, h: 230, rx: 5, ry: 18, crop: '18% 50%' },
  { id: 'city-detail', photo: 2, x: 215, y: 190, z: -15, w: 230, h: 175, rx: -3, ry: -14, crop: '88% 70%' },
  { id: 'postcard-detail', photo: 0, x: -30, y: 225, z: -110, w: 155, h: 115, rx: 8, ry: 4, crop: '65% 90%' },
] as const
const smooth = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x) }
export function discoveryPose(seconds: number, index: number) {
  const t = Number.isFinite(seconds) ? Math.max(0, Math.min(DISCOVERY_SECONDS, seconds)) : 0
  const enter = smooth((t - .2 - index * .23) / 1.3)
  const exit = smooth((t - 10) / 2)
  return { opacity: enter * (1 - exit), spread: .65 + .35 * enter - .25 * exit, turn: Math.sin(t * .23 - .6) * 11, lift: (1 - enter) * 34 - exit * 12 }
}
