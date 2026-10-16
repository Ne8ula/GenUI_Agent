import { MAX_SCAN_POINTS, SCAN_STRIDE } from '../scan/data.ts'

export const MAX_GROUND_POINTS = 8000
const ASPECT = 1720 / 3392
// Authored source-floor windows, safely outside the people/chair/facade silhouettes.
export const FLOOR_SOURCES = [
  { u0: .32, u1: .367, v0: .91, v1: .985 },
  { u0: .65, u1: .73, v0: .925, v1: .985 },
] as const
export const GROUND_ISLANDS = [
  { source: 0, u0: .265, u1: .335, v0: .949, v1: 1.047, shear: -.014 },
  { source: 0, u0: .347, u1: .412, v0: .968, v1: 1.069, shear: -.008 },
  { source: 1, u0: .644, u1: .704, v0: .966, v1: 1.057, shear: .008 },
  { source: 1, u0: .718, u1: .789, v0: .944, v1: 1.035, shear: .016 },
  { source: 1, u0: .803, u1: .859, v0: .926, v1: 1.022, shear: .021 },
] as const
const noise = (value: number) => { const n = Math.sin(value * 12.9898 + 78.233) * 43758.5453; return n - Math.floor(n) }

export function groundExtensions(source: Float32Array): Float32Array {
  if (source.length % SCAN_STRIDE || source.length / SCAN_STRIDE > MAX_SCAN_POINTS) throw new Error('Invalid ground source budget')
  const remaining = Math.min(MAX_GROUND_POINTS, MAX_SCAN_POINTS - source.length / SCAN_STRIDE)
  const out: number[] = []
  for (let islandIndex = 0; islandIndex < GROUND_ISLANDS.length; islandIndex++) {
    const island = GROUND_ISLANDS[islandIndex]!
    const region = FLOOR_SOURCES[island.source]!
    for (let i = 0; i < source.length && out.length / SCAN_STRIDE < remaining; i += SCAN_STRIDE) {
      const u = source[i]! * .5 + .5, v = .5 - source[i + 1]! / (2 * ASPECT)
      if (u < region.u0 || u > region.u1 || v < region.v0 || v > region.v1) continue
      const x = (u - region.u0) / (region.u1 - region.u0)
      const y = (v - region.v0) / (region.v1 - region.v0)
      // Unequal tile ends and narrow joints prevent another common horizontal edge.
      const column = Math.min(2, Math.floor(x * 3))
      const joint = (x * 3) % 1
      const end = [1, .71, .88][(column + islandIndex) % 3]!
      if (joint < .035 || joint > .965 || y > end) continue
      const coverage = .83 * Math.min(1, (end - y) * 8) * Math.min(1, x * 15, (1 - x) * 15)
      if (noise(i / SCAN_STRIDE + islandIndex * 937) > coverage) continue
      const row = Array.from(source.subarray(i, i + SCAN_STRIDE))
      if (!row.every(Number.isFinite)) throw new Error('Nonfinite ground source')
      row[0] = (island.u0 + x * (island.u1 - island.u0) + y * island.shear - .5) * 2
      row[1] = (.5 - (island.v0 + y * (island.v1 - island.v0))) * 2 * ASPECT
      // Reuse source linear RGB, primitive family and width; no new image sampling.
      out.push(...row)
    }
  }
  return new Float32Array(out)
}

export function groundAssembly(data: Float32Array) {
  const phases = new Float32Array(data.length / SCAN_STRIDE * 2)
  for (let i = 0; i < phases.length / 2; i++) {
    phases[i * 2] = 21 + data[i * SCAN_STRIDE + 8]! * 7
    phases[i * 2 + 1] = 3
  }
  return phases
}
