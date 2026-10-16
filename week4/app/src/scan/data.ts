export const SCAN_ASSET_ROOT = '/assets/paris-scan-r12/'
export const MAX_SCAN_POINTS = 240_000
export const SCAN_STRIDE = 10
export const SCAN_MODES = ['Composite', 'Point cloud', 'Gaussian splats', 'Ordered dither', 'Edges'] as const
export type ScanMode = typeof SCAN_MODES[number]
export interface ScanManifest {
  version: 1
  id: 'paris-scan-r12'
  width: number
  height: number
  stride: number
  count: number
  data: string
  sha256: string
}

export function validateScanManifest(value: unknown): ScanManifest {
  const m = value as Partial<ScanManifest> | null
  if (!m || m.version !== 1 || m.id !== 'paris-scan-r12' || m.width !== 3392 || m.height !== 1720 ||
    m.stride !== SCAN_STRIDE || !Number.isInteger(m.count) || !m.count || m.count < 1 || m.count > MAX_SCAN_POINTS ||
    m.data !== `${SCAN_ASSET_ROOT}points.bin` || !/^[a-f0-9]{64}$/.test(m.sha256 ?? '')) {
    throw new Error('Invalid or oversized scan asset manifest')
  }
  return m as ScanManifest
}

export function decodeScanPoints(buffer: ArrayBuffer, manifest: ScanManifest): Float32Array {
  if (buffer.byteLength !== manifest.count * SCAN_STRIDE * 4) throw new Error('Scan sample size mismatch')
  const data = new Float32Array(buffer)
  for (let i = 0; i < data.length; i += SCAN_STRIDE) {
    for (let j = 0; j < SCAN_STRIDE; j++) {
      if (!Number.isFinite(data[i + j])) throw new Error('Nonfinite scan sample')
    }
    if (Math.abs(data[i]!) > 1 || Math.abs(data[i + 1]!) > manifest.height / manifest.width || Math.abs(data[i + 2]!) > 1 ||
      data[i + 3]! < 0 || data[i + 3]! > 1 || data[i + 4]! < 0 || data[i + 4]! > 1 || data[i + 5]! < 0 || data[i + 5]! > 1 ||
      !Number.isInteger(data[i + 6]) || data[i + 6]! < 0 || data[i + 6]! > 3 ||
      data[i + 7]! <= 0 || data[i + 7]! > 16 || data[i + 8]! < 0 || data[i + 8]! > 1 || Math.abs(data[i + 9]!) > Math.PI * 2) {
      throw new Error('Out-of-bounds scan sample')
    }
  }
  return data
}

export function scanViewport(width: number, height: number, dpr: number) {
  const w = Number.isFinite(width) ? Math.max(1, width) : 1
  const h = Number.isFinite(height) ? Math.max(1, height) : 1
  const ratio = Number.isFinite(dpr) ? Math.max(1, Math.min(2, dpr)) : 1
  const scale = Math.min(ratio, 3840 / w, 2160 / h)
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) }
}
