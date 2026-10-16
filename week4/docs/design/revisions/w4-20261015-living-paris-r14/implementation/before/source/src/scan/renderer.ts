import * as THREE from 'three'
import { decodeScanPoints, SCAN_ASSET_ROOT, SCAN_MODES, scanViewport, validateScanManifest, type ScanMode } from './data'

const vertexShader = `
attribute float kind;
attribute float size;
attribute float seed;
attribute float angle;
uniform float clock;
uniform float scatter;
uniform float pixelScale;
varying vec3 ink;
varying float family;
varying float entropy;
varying float direction;
void main() {
  vec3 p = position;
  // Local excursions are anchored and reversible, not a scene-wide translation.
  float moving = step(.86, seed) * (1.0 - step(2.5, kind));
  float wave = sin(clock * .8 + seed * 60.0) * sin(clock * .31);
  p.xy += vec2(cos(seed * 121.0), sin(seed * 87.0)) * wave * scatter * .008 * moving;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(1.0, size * pixelScale * 1.35);
  ink = color;
  family = kind;
  entropy = seed;
  direction = angle;
}`
const fragmentShader = `
uniform float mode;
uniform float density;
varying vec3 ink;
varying float family;
varying float entropy;
varying float direction;
void main() {
  if (mode >= 0.0 && abs(family - mode) > .1) discard;
  if (entropy > density) discard;
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = 1.0;
  if (family < .5) {
    a = 1.0 - smoothstep(.45, 1.0, dot(p,p));
  } else if (family < 1.5) {
    a = exp(-dot(p,p) * 3.5) * .38;
  } else if (family < 2.5) {
    if (max(abs(p.x),abs(p.y)) > .78) discard;
    a = .50;
  } else {
    vec2 q = mat2(cos(direction), -sin(direction), sin(direction), cos(direction)) * p;
    a = (1.0 - smoothstep(.25,.72,abs(q.y))) * (1.0 - smoothstep(.65,1.0,abs(q.x)));
  }
  if (a < .025) discard;
  gl_FragColor = vec4(ink, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

async function boundedBuffer(response: Response, bytes: number) {
  if (!response.ok || !response.body) throw new Error('Scan sample download failed')
  const reader = response.body.getReader()
  const out = new Uint8Array(bytes)
  let offset = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.length > bytes) throw new Error('Oversized scan sample download')
      out.set(value, offset)
      offset += value.length
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  if (offset !== bytes) throw new Error('Incomplete scan samples')
  return out.buffer
}

export interface ScanRenderer {
  render: (time: number, mode: ScanMode, density: number, scatter: number, buildTime?: number) => void
  resize: () => void
  dispose: () => void
  stats: () => { points: number; bytes: number; width: number; height: number; calls: number; textures: number; geometries: number; eyePoints?: number; bornSamples?: number; constructionTime?: number }
}

export async function createScanRenderer(canvas: HTMLCanvasElement, signal: AbortSignal, arrival = false): Promise<ScanRenderer> {
  const response = await fetch(`${SCAN_ASSET_ROOT}scene.json`, { signal })
  if (!response.ok) throw new Error('Scan manifest unavailable')
  const manifest = validateScanManifest(await response.json())
  const buffer = await boundedBuffer(await fetch(manifest.data, { signal }), manifest.count * 40)
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(v => v.toString(16).padStart(2, '0')).join('')
  if (digest !== manifest.sha256) throw new Error('Scan asset checksum mismatch')
  const data = decodeScanPoints(buffer, manifest)
  const arrivalModule = arrival ? await import('../arrival/construction') : null
  signal.throwIfAborted()
  const context = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true })
  if (!context) throw new Error('WebGL2 unavailable. No image fallback is used.')
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false })
  renderer.setClearColor(0x02060c, 1)
  renderer.setPixelRatio(1)
  renderer.debug.onShaderError = () => { throw new Error('Scan GPU shader compilation failed') }
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 10)
  camera.position.z = 2
  const geometry = new THREE.BufferGeometry()
  const interleaved = new THREE.InterleavedBuffer(data, 10)
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0))
  geometry.setAttribute('color', new THREE.InterleavedBufferAttribute(interleaved, 3, 3))
  for (const [name, offset] of [['kind', 6], ['size', 7], ['seed', 8], ['angle', 9]] as const) {
    geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(interleaved, 1, offset))
  }
  const construction = arrivalModule?.createConstruction(data)
  construction?.attach(geometry)
  const uniforms = { clock: { value: 0 }, scatter: { value: 0 }, pixelScale: { value: 1 }, mode: { value: -1 }, density: { value: 1 } }
  const material = new THREE.ShaderMaterial({
    vertexShader: construction?.vertex(vertexShader) ?? vertexShader,
    fragmentShader: construction?.fragment(fragmentShader) ?? fragmentShader,
    vertexColors: true, transparent: true,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { ...uniforms, ...(construction ? { build: construction.build } : {}) },
  })
  const cloud = new THREE.Points(geometry, material)
  cloud.frustumCulled = false
  scene.add(cloud)
  if (construction) scene.add(construction.eye, construction.brackets)
  let disposed = false
  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const { width, height } = scanViewport(rect.width, rect.height, window.devicePixelRatio)
    if (canvas.width !== width || canvas.height !== height) renderer.setSize(width, height, false)
    const aspect = width / height
    const sourceAspect = manifest.width / manifest.height
    const halfW = Math.max(1, aspect / sourceAspect) / .96
    const halfH = halfW / aspect
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH
    camera.updateProjectionMatrix()
    uniforms.pixelScale.value = width / halfW / 2560
    construction?.resize(uniforms.pixelScale.value)
  }
  try { resize() } catch (error) {
    construction?.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss()
    throw error
  }
  return {
    resize,
    render(time, mode, density, scatter, buildTime = 30) {
      if (disposed) return
      uniforms.clock.value = Number.isFinite(time) ? Math.max(0, Math.min(60, time)) : 0
      uniforms.mode.value = SCAN_MODES.indexOf(mode) - 1
      uniforms.density.value = Number.isFinite(density) ? Math.max(.05, Math.min(1, density)) : 1
      uniforms.scatter.value = Number.isFinite(scatter) ? Math.max(0, Math.min(1, scatter)) : 0
      construction?.set(buildTime)
      renderer.render(scene, camera)
    },
    stats: () => ({ points: manifest.count, bytes: buffer.byteLength + (construction?.bytes ?? 0), width: canvas.width, height: canvas.height,
      calls: renderer.info.render.calls, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, ...construction?.stats() }),
    dispose() {
      if (disposed) return
      disposed = true
      construction?.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss()
    },
  }
}
