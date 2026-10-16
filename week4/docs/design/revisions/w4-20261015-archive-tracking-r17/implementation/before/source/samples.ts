import { rasterizeWeek1Eye } from './eye-source.ts'

export interface EyeSample { x: number; y: number; r: number; g: number; b: number; alpha: number }
const linear = (byte: number) => { const c = byte / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 }

export function canonicalEyeSamples(): EyeSample[] {
  // Canonical Week3 CPU transfer of the authored Week1 eye, sampled once.
  // No screenshot, image texture, archived conversation host or microphone.
  const width = 320, height = 160
  const { data } = rasterizeWeek1Eye(width, height, {
    time: 0, energy: 0, gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0, quiet: true,
  })
  const points: EyeSample[] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    if (data[i]! < 60 || data[i + 3]! < 64) continue
    points.push({ x: (x / width - .5) * .54, y: (.5 - y / height) * .27,
      r: linear(data[i]!), g: linear(data[i + 1]!), b: linear(data[i + 2]!), alpha: data[i + 3]! / 255 })
  }
  return points
}

export function formlessEyeSamples(): EyeSample[] {
  const random = (index: number, salt: number) => {
    const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453
    return value - Math.floor(value)
  }
  const points: EyeSample[] = []
  canonicalEyeSamples().forEach((point, index) => {
    const x = point.x / .27 + .003125
    const y = point.y / .27 - .003125 + x * .075
    if (Math.abs(x + .055) < .095 && Math.abs(y - .125) < .095) return
    const t = Math.max(0, Math.min(1, (x + .77) / 1.5))
    const arch = Math.max(0, Math.sin(t * Math.PI))
    const top = .32 * arch ** .88 * (1.19 - .42 * t) + .007 * Math.sin(t * 17) * arch
    const bottom = -.22 * arch ** 1.15 * (.72 + .38 * t)
    const lidDistance = Math.min(Math.abs(y - top), Math.abs(y - bottom))
    const iris = Math.exp(-Math.pow((Math.hypot(x + .055, y - .125) - .215) / .12, 2))
    const lid = Math.exp(-Math.pow(lidDistance / .055, 2))
    const halo = Math.exp(-Math.pow(lidDistance / .14, 2))
    const horizontal = Math.exp(-Math.pow(Math.max(0, Math.abs(x + .02) - .68) / .14, 2))
    const inside = x > -.77 && x < .73 && y < top && y > bottom ? 1 : 0
    const weight = Math.min(.98, Math.max(.88 * iris * inside, .82 * lid, .13 * inside) + .12 * halo) * horizontal
    if (random(index, 1) > weight) return
    const looseness = (1 - Math.min(1, lid + iris * inside)) * .0016
    points.push({ ...point,
      x: point.x + (random(index, 2) - .5) * looseness,
      y: point.y + (random(index, 3) - .5) * looseness,
      alpha: point.alpha * (.65 + .35 * weight),
    })
  })
  return points
}

export function constructionSchedule(data: Float32Array, eyeCount: number) {
  const count = data.length / 10
  if (!Number.isInteger(count) || count < eyeCount || eyeCount < 1) throw new Error('Invalid construction sample budget')
  const phases = new Float32Array(count * 2)
  const targets = new Uint32Array(eyeCount)
  for (let i = 0; i < count; i++) {
    const kind = data[i * 10 + 6]!, seed = data[i * 10 + 8]!
    const x = Math.floor((data[i * 10]! + 1) * 24), y = Math.floor((data[i * 10 + 1]! + 1) * 24)
    const island = (((x * 73856093) ^ (y * 19349663)) >>> 0) / 4294967295
    const group = kind < 3 ? 1 : seed < .68 ? 2 : 3
    phases[i * 2] = (group === 1 ? 7 + island * 5.4 : group === 2 ? 14 + island * 5.4 : 21 + island * 6) + seed * .7
    phases[i * 2 + 1] = group
  }
  // Multiplication modulo this fixed pack's count is a one-to-one permutation.
  const used = new Set<number>()
  for (let i = 0; i < eyeCount; i++) {
    const target = (i * 7919) % count
    if (used.has(target)) throw new Error('Eye target permutation repeated')
    used.add(target); targets[i] = target
    phases[target * 2] = 2 + data[target * 10 + 8]! * 3.6 + 1.35
    phases[target * 2 + 1] = 0
  }
  return { phases, targets }
}
