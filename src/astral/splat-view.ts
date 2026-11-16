// The room's Gaussian-splat paint (World Labs' Marble reconstruction of the same frames), and the gesture that swaps it with the points.
// Spark is loaded only when a room has a splat file, so rooms without one never touch it.
//
// The gesture: from the point the viewer is looking at, a ragged front spreads through the room as lines of code. The room is cut
// into thin vertical columns; down each one a line of short marks falls from the ceiling, in the room's own colours, some lines
// long and some short. Above a line's tail its marks open into the painted surface, which covers the point grains behind it; they
// stay whole until it does. The way back is the same lines drawing back up, toward where the viewer is looking.
//
// Layers, for other modules (water.ts): objects that belong with the points go in the main scene as usual; they are drawn in the points
// layer and fade with it. Splat objects that belong with the paint (a SplatMesh) go in splatView.paint; they are sorted together
// with the room's splats and their opacity follows the paint's presence. Only the eye is drawn on top of both.
import {
  Color, FloatType, Group, LinearSRGBColorSpace, Quaternion, RedFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, Vector3, WebGLRenderTarget,
  type Camera, type Object3D, type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { PointCloud, RoomWater } from './types.ts';

const GESTURE_SECONDS = 11;
const GAZE_METRES = 2.5;          // the front starts this far along the line of sight
const BAND_METRES = 0.45;         // the front's unit depth, metres
const STAGES_END = 5;             // the longest line, in bands; the shortest is 0.8
const FRONT_END = 0.88;           // share of the gesture by which the front has passed everything; the points then fade
const GRAIN_METRES = 0.0004;      // a line's thickness (standard deviation) per metre from the viewer: under a pixel at any distance
const COLUMN_METRES = 0.1;        // one line per column of this width
const MARK_METRES = 0.06;         // the height of one mark in a line
const FALL = 1;                   // metres the front spreads while a line falls one metre
// Splats larger than this (largest standard deviation, metres) fade out: the reconstruction's guesses. ?splatmax= overrides in dev.
const devMax = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('splatmax')) : 0;
const maxSplatMetres = devMax > 0 ? devMax : 0.25;
// Splats nearer the viewer than this (metres) fade out. ?splatnear= overrides in dev.
const devNear = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('splatnear')) : 0;
const nearMetres = devNear > 0 ? devNear : 0.9;
const STAND_IN_SPLATS = 250_000;
const SAMPLES = 4096;             // splat centres kept to pace the front
const QUANTILES = 64;

export interface SplatSource {
  /** The SPZ file's URL, in the room's world frame. */
  url?: string;
  /** Development stand-in: splats made from the room's own points, so the gesture can be judged before the real file exists. */
  standIn?: PointCloud;
}

export interface SplatView {
  /** Add splat objects that belong with the paint (see the comment at the top). */
  readonly paint: Group;
  /** True once the splats are loaded and can be shown. */
  readonly ready: boolean;
  /** Where the gesture is: 0 = the points, 1 = the paint. */
  readonly presence: number;
  /** Which way the gesture is going. */
  readonly painted: boolean;
  /** True while anything of the paint is on screen: draw through drawLayers instead of the plain scene. */
  readonly active: boolean;
  /** Start the gesture toward the paint (true) or back to the points (false), from where the viewer is looking. False if not ready. */
  show(painted: boolean): boolean;
  update(dt: number): void;
  /** The frame in layers: points (covered where the paint has arrived), paint, then the overlay (the eye) on top. */
  drawLayers(target: WebGLRenderTarget): void;
  dispose(): void;
}

// Splats are drawn into their own target cleared to transparent; the points are kept only where the paint does not yet cover.
const COMPOSITE = new ShaderMaterial({
  uniforms: { tSplats: { value: null }, tPoints: { value: null }, uPoints: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tSplats, tPoints; uniform float uPoints; varying vec2 vUv;
void main() {
  vec4 s = texture2D(tSplats, vUv);
  vec3 p = uPoints > 0.0 ? texture2D(tPoints, vUv).rgb * uPoints * (1.0 - s.a) : vec3(0.0);
  gl_FragColor = vec4(s.rgb + p, 1.0);
}`,
  depthTest: false, depthWrite: false,
});

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createSplatView(options: {
  renderer: WebGLRenderer; camera: Camera; scene: Scene; overlay: Object3D; source: SplatSource;
  /** The room's pool: the paint leaves its volume empty for water.ts. */
  water?: RoomWater;
}): SplatView {
  const { renderer, camera, scene, overlay, source, water } = options;
  const splatScene = new Scene(), paint = new Group();
  splatScene.add(paint);
  const target = () => new WebGLRenderTarget(1, 1, { type: UnsignedByteType, colorSpace: LinearSRGBColorSpace });
  const rtPoints = target(), rtSplats = target();
  const quad = new FullScreenQuad(COMPOSITE.clone());
  const origin = new Vector3(), forward = new Vector3();
  let ready = false, disposed = false, painted = false, t = 0, top = 0;
  // The front's radius at each share of the splats it has passed, from the current origin: the paint arrives at an even pace
  // however the room is spread out (a near wall and a long far hall alike).
  const reach = new Float32Array(QUANTILES + 1);
  let samples: Float32Array = new Float32Array(0);
  // filled in once Spark has loaded
  let frame: ((radius: number) => void) | null = null;
  let lastRadius = -1;
  const seenFrom = new Vector3();
  let release = () => {};

  const started = performance.now();
  void (async () => {
    const spark = await import('@sparkjsdev/spark');
    if (disposed) return;
    const { dyno } = spark;
    const sparkRenderer = new spark.SparkRenderer({ renderer });
    // Our frame keeps display-ready colour throughout (see glow.ts). Spark would decode the splats' sRGB colours for a linear
    // target and they would come out dark; they are already what the screen should show.
    const before = sparkRenderer.onBeforeRender.bind(sparkRenderer);
    sparkRenderer.onBeforeRender = (...args) => { before(...args); sparkRenderer.uniforms.encodeLinear.value = false; };

    const mesh = source.url
      ? new spark.SplatMesh({ url: source.url })
      : new spark.SplatMesh({ constructSplats: splats => standIn(splats, source.standIn!) });

    const uOrigin = dyno.dynoVec3(new Vector3()), uRadius = dyno.dynoFloat(1e6), uBand = dyno.dynoFloat(BAND_METRES), uGrain = dyno.dynoFloat(GRAIN_METRES);
    // the pool: centre at the water's surface, radii; zero radii = no pool
    const uPool = dyno.dynoVec3(new Vector3(...(water?.center ?? [0, 0, 0]))), uPoolR = dyno.dynoVec2(new Vector2(...(water?.radius ?? [0, 0])));
    const uTop = dyno.dynoFloat(0);   // the ceiling: the highest sampled splat, where the lines start
    const uMax = dyno.dynoFloat(maxSplatMetres), uView = dyno.dynoVec3(new Vector3(0, 0, 1e6)), uNear = dyno.dynoFloat(nearMetres);
    mesh.worldModifier = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
      const front = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, origin: 'vec3', radius: 'float', band: 'float', grain: 'float', top: 'float', maxSize: 'float', view: 'vec3', near: 'float', pool: 'vec3', poolR: 'vec2' },
        outTypes: { gsplat: dyno.Gsplat },
        statements: ({ inputs, outputs }) => dyno.unindentLines(`
          ${outputs.gsplat} = ${inputs.gsplat};
          vec3 c = ${inputs.gsplat}.center;
          // Oversized splats are where the reconstruction guessed (what no view saw up close): they fade out by their size, so a
          // near guess is not a blurred wall across the view. Real surfaces are made of many small splats and are kept.
          vec3 sc = ${inputs.gsplat}.scales;
          float big = max(sc.x, max(sc.y, sc.z));
          // finished: blurry splats (well above the room's typical size) fade, so the points underneath show through where the paint is weak
          float keep = 1.0 - smoothstep(${inputs.maxSize}, 3.0 * ${inputs.maxSize}, big);
          // and so does whatever is right up against the viewer: no view saw it that close, so it is a guess, and a blur across the frame
          keep *= smoothstep(0.55 * ${inputs.near}, ${inputs.near}, length(c - ${inputs.view}));
          vec4 col = ${inputs.gsplat}.rgba;
          col.a *= keep;
          ${outputs.gsplat}.rgba = col;
          // the pool is empty: nothing of the room from 20 cm above its surface down (the painted disc sits up to ~10 cm high), inside its rim (a little wider, for a clean edge)
          vec2 pr = ${inputs.poolR};
          if (pr.x > 0.0) {
            float e = length((c.xz - ${inputs.pool}.xz) / pr), h = c.y - ${inputs.pool}.y;
            if (e < 1.0 && h < 0.2) keep = 0.0;
            // the ragged ring standing on the coping fades out over a band just outside the rim
            else keep *= mix(1.0, smoothstep(1.0, 1.0 + 0.15 / min(pr.x, pr.y), e), 1.0 - smoothstep(0.25, 0.35, h));
          }
          // lines of code: one per thin column, falling from the ceiling mark by mark, in turn by the column's distance from the gaze, with jitter
          vec2 column = floor(c.xz / ${COLUMN_METRES});
          float mark = floor(c.y / ${MARK_METRES});
          vec3 at = vec3((column.x + 0.5) * ${COLUMN_METRES}, (mark + 0.5) * ${MARK_METRES}, (column.y + 0.5) * ${COLUMN_METRES});
          float ph = fract(sin(dot(column, vec2(12.9898, 78.233))) * 43758.5453), ph2 = fract(ph * 61.7);
          float d = length(at.xz - ${inputs.origin}.xz) + (ph - 0.5) * 4.0 * ${inputs.band} + (${inputs.top} - at.y) * ${FALL.toFixed(2)};
          float s = (${inputs.radius} - d) / ${inputs.band};
          float len = mix(0.8, ${STAGES_END.toFixed(2)}, ph2 * ph2);   // most lines short, a few long
          if (s <= 0.0 || keep <= 0.0) {
            ${outputs.gsplat}.flags = 0u;
          } else if (s < len) {
            // a mark: its splats drawn as one thin upright dash on the column's axis; over the line's last third they open into the paint
            float w = smoothstep(0.7, 1.0, s / len), head = 1.0 - smoothstep(0.0, 0.15, s);
            // each mark is rolled again as the line passes: bright, dim, or missing
            float roll = fract(sin(dot(vec3(column, mark) + floor(s * 4.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            if (roll < 0.2 && w < 0.5 && head < 0.5) ${outputs.gsplat}.flags = 0u;
            ${outputs.gsplat}.center = mix(vec3(at.x, at.y + (c.y - at.y) * 0.7, at.z), c, w);
            float thin = ${inputs.grain} * max(1.0, length(c - ${inputs.view}));
            ${outputs.gsplat}.scales = mix(vec3(thin, ${(MARK_METRES * 0.15).toFixed(4)}, thin), sc, w);
            vec4 q = ${inputs.gsplat}.quaternion;
            ${outputs.gsplat}.quaternion = normalize(mix(vec4(0.0, 0.0, 0.0, q.w < 0.0 ? -1.0 : 1.0), q, w));
            // the room's own colour, lifted so a line stands out from the grains around it, and white at the falling head
            vec3 lit = mix(min(col.rgb * 1.5 + 0.08, vec3(1.0)), vec3(1.0), 0.8 * head);
            ${outputs.gsplat}.rgba = vec4(mix(lit, col.rgb, w), mix(keep * max(head, 0.25 + 0.75 * roll), col.a, w));
          }
        `),
      });
      return { gsplat: front.apply({ gsplat, origin: uOrigin, radius: uRadius, band: uBand, grain: uGrain, top: uTop, maxSize: uMax, view: uView, near: uNear, pool: uPool, poolR: uPoolR }).gsplat };
    });
    mesh.updateGenerator();
    splatScene.add(sparkRenderer, mesh);

    frame = radius => { uOrigin.value.copy(origin); uRadius.value = radius; uView.value.copy(camera.position); mesh.updateVersion(); };
    release = () => { splatScene.remove(sparkRenderer, mesh); mesh.dispose(); sparkRenderer.dispose(); };
    await mesh.initialized;
    if (disposed) { release(); return; }
    const packed = mesh.packedSplats;
    const carved = packed && source.url ? await carveFreeSpace(packed, source.url, () => disposed).catch(error => { console.warn('[astral] could not check the paint against the picture', error); return 0; }) : 0;
    if (disposed) { release(); return; }
    if (carved) { packed!.needsUpdate = true; mesh.updateVersion(); }
    samples = sampleCentres(mesh);
    top = -Infinity;
    for (let i = 1; i < samples.length; i += 3) top = Math.max(top, samples[i]!);
    uTop.value = top;
    if (packed) { const sizes: number[] = []; for (let k = 0; k < packed.numSplats; k += Math.max(1, Math.floor(packed.numSplats / SAMPLES))) { const s = packed.getSplat(k).scales; sizes.push(Math.max(s.x, s.y, s.z)); } sizes.sort((a, b) => a - b); uMax.value = Math.min(3 * sizes[sizes.length >> 1]!, 0.6 * maxSplatMetres); }
    frame(-1);
    let over = 0, n = 0;
    if (packed) for (let k = 0; k < packed.numSplats; k += Math.max(1, Math.floor(packed.numSplats / SAMPLES)), n++) { const s = packed.getSplat(k).scales; if (Math.max(s.x, s.y, s.z) > 0.6 * maxSplatMetres) over++; }
    console.info(`[astral] painted room ready: ${packed?.numSplats ?? '?'} splats, ${((performance.now() - started) / 1000).toFixed(2)} s; `
      + `${n ? ((100 * over) / n).toFixed(2) : '?'}% of a sample larger than ${(0.6 * maxSplatMetres).toFixed(2)} m begin to fade; ${carved} hidden in front of the picture`);
    ready = true;
  })().catch(error => console.error('[astral] the painted room could not load', error));

  const view: SplatView = {
    paint,
    get ready() { return ready; },
    get presence() { return ease(t); },
    get painted() { return painted; },
    get active() { return ready && t > 0; },
    show(next) {
      if (!ready) return false;
      if (next === painted) return true;
      // a gesture from rest starts where the viewer is looking now; one reversed mid-way keeps its centre
      if (t === 0 || t === 1) {
        camera.getWorldDirection(forward);
        origin.copy(camera.position).addScaledVector(forward, GAZE_METRES);
        // paced by what the viewer can see (about the middle of the view), so the change on screen is even in both directions
        const all: number[] = [], seen: number[] = [], p = new Vector3();
        for (let i = 0; i < samples.length; i += 3) {
          p.fromArray(samples, i);
          // the same measure the lines use: across the floor from the gaze, plus the fall from the ceiling
          const d = Math.hypot(p.x - origin.x, p.z - origin.z) + (top - p.y) * FALL;
          all.push(d);
          if (p.sub(camera.position).normalize().dot(forward) > 0.6) seen.push(d);
        }
        const d = Float32Array.from(seen.length >= 256 ? seen : all).sort();
        for (let q = 0; q <= QUANTILES; q++) reach[q] = d.length ? d[Math.min(d.length - 1, Math.floor((q / QUANTILES) * d.length))]! : 0;
      }
      painted = next;
      return true;
    },
    update(dt) {
      if (!ready || !frame) return;
      const goal = painted ? 1 : 0;
      if (t === goal) {
        // at rest the splats are worked out again only when the viewer has moved (the near fade depends on where they are)
        if (t === 1 && camera.position.distanceToSquared(seenFrom) > 1e-4) { seenFrom.copy(camera.position); frame(lastRadius); }
        return;
      }
      t = painted ? Math.min(1, t + dt / GESTURE_SECONDS) : Math.max(0, t - dt / GESTURE_SECONDS);
      paint.traverse(o => { if (o !== paint && 'opacity' in o) (o as { opacity: number }).opacity = ease(t); });
      // f: the share of the paint the front has passed. Before it starts, nothing is near; at its end, the last splat is whole.
      // The columns' jitter spans ±2 bands, so it starts 2 bands short of the nearest splat and ends with the longest line fully open.
      const f = smooth(0, FRONT_END, t), q = f * QUANTILES, i = Math.min(QUANTILES - 1, Math.floor(q));
      const radius = reach[i]! + (reach[i + 1]! - reach[i]!) * (q - i);
      lastRadius = t === 0 ? -1 : radius + BAND_METRES * ((STAGES_END + 4.0) * f - 2.0);
      seenFrom.copy(camera.position);
      frame(lastRadius);
    },
    drawLayers(out) {
      const w = out.width, h = out.height;
      if (rtPoints.width !== w || rtPoints.height !== h) { rtPoints.setSize(w, h); rtSplats.setSize(w, h); }
      // the points stay whole until the front has passed everything: only the paint covering them hides them before that
      // the points stay underneath while the paint is shown: wherever the paint is weak, the point room shows through
      const pointsGain = 1;
      const material = quad.material as ShaderMaterial;
      if (pointsGain > 0.001) {
        overlay.visible = false;
        renderer.setRenderTarget(rtPoints);
        renderer.clear();
        renderer.render(scene, camera);
        overlay.visible = true;
      }
      const clear = new Color(), alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(rtSplats);
      renderer.clear();
      renderer.render(splatScene, camera);
      renderer.setClearColor(clear, alpha);

      material.uniforms.tSplats!.value = rtSplats.texture;
      material.uniforms.tPoints!.value = rtPoints.texture;
      material.uniforms.uPoints!.value = pointsGain > 0.001 ? pointsGain : 0;
      renderer.setRenderTarget(out);
      quad.render(renderer);
      // the eye last, over everything, with its own blend
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      // the eye's blocks write depth: start from none, so last frame's never hides this frame's eye
      renderer.clearDepth();
      renderer.render(overlay, camera);
      renderer.autoClear = autoClear;
    },
    dispose() {
      disposed = true;
      release();
      rtPoints.dispose();
      rtSplats.dispose();
      quad.material.dispose();
      quad.dispose();
    },
  };
  return view;
}

/**
 * The picture is the truth about what is empty: from where it was taken it saw straight through to its surfaces. Splats well in front
 * of the nearest surface the picture saw along that line of sight are the reconstruction's guesses in space the picture shows empty
 * (beside its camera, where no view saw up close); they are hidden. Outside the picture's frame nothing is known, so nothing is
 * removed. Uses the picture's own depth (the fixture manifest's frame with source 'picture'), in slices between frames.
 */
async function carveFreeSpace(packed: { numSplats: number; getSplat(i: number): { center: Vector3; scales: Vector3; quaternion: Quaternion; color: Color }; setSplat(i: number, c: Vector3, s: Vector3, q: Quaternion, o: number, col: Color): void },
  splatUrl: string, cancelled: () => boolean): Promise<number> {
  const base = splatUrl.slice(0, splatUrl.lastIndexOf('/') + 1);
  const manifest = await (await fetch(base + 'manifest.json')).json() as { frames?: { image: string; depth: string; source: string; camera: {
    extrinsics: { position: [number, number, number]; quaternion: [number, number, number, number] };
    intrinsics: { fx: number; fy: number; cx: number; cy: number; width: number; height: number } } }[] };
  const picture = manifest.frames?.find(frame => frame.source === 'picture');
  if (!picture) return 0;
  const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
  const decoded = new EXRLoader().setDataType(FloatType).setOutputFormat(RedFormat).parse(await (await fetch(base + picture.depth)).arrayBuffer());
  const { fx, fy, cx, cy, width: W, height: H } = picture.camera.intrinsics;
  const raw = decoded.data as Float32Array;
  if (decoded.width !== W || decoded.height !== H) return 0;
  // the nearest surface seen within 2 pixels (EXR rows run bottom-up): only what is clearly in front of everything nearby is removed
  const near = new Float32Array(W * H).fill(Infinity);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || xx < 0 || yy >= H || xx >= W) continue;
      const d = raw[(H - 1 - yy) * W + xx]!;
      if (d > 0 && d < m) m = d;
    }
    near[y * W + x] = m;
  }
  const at = new Vector3(...picture.camera.extrinsics.position), inverse = new Quaternion(...picture.camera.extrinsics.quaternion).invert();
  const local = new Vector3(), yieldEvery = 200_000;
  let carved = 0;
  for (let i = 0; i < packed.numSplats; i++) {
    const s = packed.getSplat(i);
    local.copy(s.center).sub(at).applyQuaternion(inverse);
    const d = -local.z;
    if (d > 0.05) {
      const x = Math.round(local.x / d * fx + cx), y = Math.round(-local.y / d * fy + cy);
      const seen = x >= 0 && y >= 0 && x < W && y < H ? near[y * W + x]! : Infinity;
      const margin = Math.max(0.3, 0.15 * seen), fade = seen < Infinity ? Math.min(1, Math.max(0, (seen - margin - d) / margin + 0.5)) : 0;
      if (fade > 0) { packed.setSplat(i, s.center, s.scales, s.quaternion, (s as unknown as { opacity: number }).opacity * (1 - fade), s.color); carved++; }
    }
    if (i % yieldEvery === 0) { await new Promise(r => setTimeout(r, 0)); if (cancelled()) return 0; }
  }
  return carved;
}
/** A spread of splat centres: evenly by index, read one by one where Spark allows it rather than walking millions of splats. */
function sampleCentres(mesh: { packedSplats?: { numSplats: number; getSplat(i: number): { center: Vector3 } }; forEachSplat(cb: (i: number, c: Vector3) => void): void }): Float32Array {
  const packed = mesh.packedSplats;
  if (packed && packed.numSplats > 0) {
    const n = Math.min(SAMPLES, packed.numSplats), out = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) packed.getSplat(Math.floor((k + 0.5) * packed.numSplats / n)).center.toArray(out, k * 3);
    return out;
  }
  const all: number[] = [];
  mesh.forEachSplat((_, c) => { all.push(c.x, c.y, c.z); });
  const n = Math.min(SAMPLES, all.length / 3), out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { const j = Math.floor((k + 0.5) * (all.length / 3) / n) * 3; out.set(all.slice(j, j + 3), k * 3); }
  return out;
}

/** Splats from the room's own points: small flat discs on the surfaces, a fraction of the points, each standing for its neighbours. */
function standIn(splats: { pushSplat(c: Vector3, s: Vector3, q: Quaternion, o: number, col: Color): void }, cloud: PointCloud): void {
  const stride = Math.max(1, Math.floor(cloud.count / STAND_IN_SPLATS));
  const sigma = (cloud.spacing ?? 0.01) * Math.sqrt(stride) * 0.45;
  const c = new Vector3(), s = new Vector3(sigma, sigma, sigma * 0.15), q = new Quaternion(), n = new Vector3(), z = new Vector3(0, 0, 1), col = new Color();
  for (let i = 0; i < cloud.count; i += stride) {
    c.fromArray(cloud.positions, i * 3);
    if (cloud.normals) q.setFromUnitVectors(z, n.fromArray(cloud.normals, i * 3).normalize());
    // raw sRGB values, as a splat file stores them
    col.r = cloud.colors[i * 3]!; col.g = cloud.colors[i * 3 + 1]!; col.b = cloud.colors[i * 3 + 2]!;
    splats.pushSplat(c, s, q, 0.9, col);
  }
}
