// The pool: one simulation (water-sim.ts) drawn twice, as ordered point grains (the points layer) and as Gaussian splats (the paint).
// Both renderings share one shading model, written once in GLSL below: a Fresnel mirror of the room's ceiling panels and the eye on
// the moving surface, and a deep tiled basin seen through it, shifted by refraction and brightened where the surface focuses light.
import {
  AddEquation, BufferAttribute, BufferGeometry, ClampToEdgeWrapping, CustomBlending, DataTexture, FloatType, GLSL3, Group,
  LinearFilter, NearestFilter, NormalBlending, OneFactor, OneMinusSrcColorFactor, Points, RGBAFormat, ShaderMaterial, Vector2, Vector3,
  type IUniform, type Object3D,
} from 'three';
import { ORDERED_ALONG_ROW_SPACING, ORDERED_ROW_SPACING } from './surface-sampler.ts';
import { createWaterSim, type WaterSim } from './water-sim.ts';
import type { RoomLights, RoomWater } from './types.ts';

export type WaterMood = 'liminal' | 'afternoon' | 'night' | 'dark';
type V3 = { x: number; y: number; z: number };

const GRAIN_METRES = 0.006;      // the field's own grain for an ordered room: 0.6 of the lattice's mean spacing
const MAX_PANELS = 32, MAX_DROPS = 96;
const SPLAT_SURFACE = 0.02, SPLAT_WALL = 0.025, SPLAT_FLOOR = 0.03;   // splat spacing, metres
const MOOD_EASE = 0.6;
// The water stands this far below the room's floor level (RoomWater.center's y), so the carpet's cut edge shows a thin lip of wall.
const WATER_LEVEL_METRES = -0.03;
// The coping: a dark stone ring this wide round the hole, this far above the carpet, covering the reconstruction's ragged cut.
const COPING_METRES = 0.14, COPING_RISE = 0.006;
// per mood: panels' reflection, the room's reflected glow, light reaching into the basin; the reflected room low and high; the light's tint
const MOODS: Record<WaterMood, { light: number[]; envLo: number[]; envHi: number[]; tint: number[] }> = {
  liminal: { light: [1, 1, 1, 0], envLo: [0.16, 0.05, 0.03], envHi: [0.38, 0.29, 0.15], tint: [1, 0.9, 0.66] },
  afternoon: { light: [0, 1, 0.75, 0], envLo: [0.12, 0.05, 0.02], envHi: [0.2, 0.12, 0.05], tint: [1, 0.72, 0.42] },
  night: { light: [0.05, 0.25, 0.12, 0], envLo: [0.02, 0.025, 0.04], envHi: [0.03, 0.04, 0.07], tint: [0.55, 0.68, 1] },
  dark: { light: [0, 0, 0, 0], envLo: [0, 0, 0], envHi: [0, 0, 0], tint: [0, 0, 0] },
};

// The point water's two ways of drawing (setPointDepth): the field's additive blend (light on light, never past white, nothing hides
// anything), or opaque grains in the depth buffer (the front surface wins).
const ADDITIVE_DRAW = { transparent: true, depthTest: false, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcColorFactor } as const;
const DEPTH_DRAW = { transparent: false, depthTest: true, depthWrite: true, blending: NormalBlending } as const;

/** Shared by both renderings. Everything is linear light until the caller converts it for display. */
const WATER_GLSL = /* glsl */ `
struct WP { vec4 map; vec3 cam; float surf; float depth; vec2 centre; vec2 rad; vec4 light; vec3 envLo; vec3 envHi; vec3 tint; vec4 eye; int panels; float time; };
const vec3 W_PANEL = vec3(1.0, 0.8, 0.5) * 5.0;     // a warm ceiling panel, bright: its reflection should clip small and white
const vec3 W_BODY = vec3(0.0003, 0.0009, 0.0008);   // the water itself where nothing is reflected: near black
const float W_TILE = 0.25;                          // basin tiles, metres: large, so their lines read as perspective going down
const vec3 W_EYE = vec3(1.0, 0.03, 0.012);
const float W_CHOP = 0.08;                          // how far a grain slides toward a crest, per unit slope: rows bunch and bend

vec4 wField(sampler2D F, vec4 map, vec2 xz) { return texture(F, (xz - map.xy) * map.zw); }
vec3 wNormal(vec4 f) { return normalize(vec3(-f.y, 1.0, -f.z)); }
bool wInside(vec2 xz, WP w) { vec2 q = (xz - w.centre) / w.rad; return dot(q, q) < 1.0; }

// the ceiling panels seen along r from p: rectangles about 1.2 x 0.6 m round each fitting's centre
vec3 wPanels(sampler2D P, vec3 p, vec3 r, WP w) {
  if (r.y <= 0.02 || w.light.x <= 0.0) return vec3(0.0);
  float sum = 0.0;
  for (int k = 0; k < ${MAX_PANELS}; k++) {
    if (k >= w.panels) break;
    vec4 c = texelFetch(P, ivec2(k, 0), 0);
    float t = (c.y - p.y) / r.y;
    vec2 q = abs(p.xz + r.xz * t - c.xz), soft = vec2(0.01 + 0.004 * t);
    vec2 e = 1.0 - smoothstep(vec2(0.6, 0.3) - soft, vec2(0.6, 0.3) + soft, q);
    sum += e.x * e.y;
  }
  return W_PANEL * sum * w.light.x;
}

// the eye: a hard glint where its reflection lands, and a little sheen round it
vec3 wGlint(vec3 p, vec3 r, WP w) {
  vec3 e = w.eye.xyz - p; float d = length(e), s = max(dot(r, e / max(d, 1e-3)), 0.0);
  return W_EYE * w.eye.w * (pow(s, 900.0) * 40.0 + pow(s, 60.0) * 0.8) / (1.0 + d * d * 0.3);
}

// the surface at rest position p0: where it is now (risen, and slid toward the crests)
vec3 wSurfacePos(vec3 p0, vec4 f, WP w) { return vec3(p0.x - f.y * W_CHOP, w.surf + f.x, p0.z - f.z * W_CHOP); }

// what the surface sends to the eye: reflected light (rgb) and the share reflected (a); the rest comes through from below
vec4 wSurface(sampler2D P, vec3 p, vec4 f, WP w) {
  vec3 n = wNormal(f), v = normalize(p - w.cam);
  float ci = max(dot(-v, n), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - ci, 5.0);
  if (w.cam.y < w.surf) {
    // from below: inside Snell's window the room shows through, bent toward the zenith; outside it the surface mirrors the dark basin
    vec3 t = refract(v, -n, 1.33);
    if (dot(t, t) < 1e-4) return vec4(w.tint * w.light.z * 0.015, 1.0);
    vec3 R = wPanels(P, p, t, w) + mix(w.envLo, w.envHi, smoothstep(-0.1, 0.6, t.y)) * w.light.y * 1.5;
    return vec4(R + wGlint(p, t, w), 1.0);
  }
  vec3 r = reflect(v, n);
  vec3 R = wPanels(P, p, r, w) + mix(w.envLo, w.envHi, smoothstep(-0.1, 0.6, r.y)) * w.light.y;
  return vec4(R + wGlint(p, r, w), F);
}

// where a point under the water appears from above: shallower, and slid by the slope where the line of sight comes through
vec3 wApparent(sampler2D F, vec3 p, WP w) {
  float below = w.surf - p.y;
  if (w.cam.y <= w.surf || below <= 0.0) return p;
  vec3 v = normalize(p - w.cam);
  float k = (1.0 / 1.33) * mix(1.0, 0.55, 1.0 - abs(v.y));
  vec3 q = w.cam + v * ((w.surf - w.cam.y) / v.y);
  vec4 f = wField(F, w.map, q.xz);
  return vec3(p.x + f.y * below * 0.7, w.surf - below * k, p.z + f.z * below * 0.7);
}

// the basin is only seen through the opening (or from inside it)
bool wSeen(vec3 p, WP w) {
  if (p.y >= w.surf) return true;   // the lip of wall above the water: seen directly
  if (w.cam.y <= w.surf) return wInside(w.cam.xz, w);
  vec3 q = w.cam + (p - w.cam) * ((w.surf - w.cam.y) / (p.y - w.cam.y));
  return wInside(q.xz, w);
}

// the coping: a narrow ring of dark stone round the hole and the short lip down to the water, lit by the room
vec3 wCoping(WP w) { return vec3(0.022, 0.02, 0.019) * (0.35 + 0.65 * max(w.light.y, w.light.z)); }

// a tile of the basin, lit from the ceiling through the surface: clear just under the rim, falling off into black further down
// (that gradient is the depth cue), and brightened where the moving surface above focuses the light (caustics)
vec3 wBasin(sampler2D F, vec3 p, float kind, WP w) {
  if (p.y > w.surf + 0.002) return wCoping(w);
  vec2 d = (p.xz - w.centre) / w.rad;
  vec2 uv = kind < 1.5 ? vec2(atan(d.y, d.x) * 0.5 * (w.rad.x + w.rad.y), p.y) : p.xz;
  vec2 g = abs(fract(uv / W_TILE) - 0.5);
  float grout = smoothstep(0.455, 0.47, max(g.x, g.y));
  vec3 alb = mix(vec3(0.035, 0.06, 0.058), vec3(0.3, 0.3, 0.27), grout);   // dark slate-green tiles, pale grout
  float below = max(0.0, w.surf - p.y);
  vec4 f = wField(F, w.map, p.xz);
  // the surface's own curvature focuses light; a slow crawl stands for the swell too small to see at this grid
  float crawl = sin(p.x * 9.0 + w.time * 0.7 + sin(p.z * 7.0 - w.time * 0.5)) * sin(p.z * 8.0 - w.time * 0.6 + sin(p.x * 6.0 + w.time * 0.4));
  float caustic = 1.0 + (clamp(-f.w * 0.15, -0.6, 3.0) + 0.45 * crawl * crawl) * smoothstep(0.05, 0.5, below);
  vec3 reach = exp(-below * vec3(3.0, 1.9, 2.0));        // the water eats red first; the floor is far down and dim
  vec3 L = w.tint * w.light.z * 1.1 * caustic;
  vec3 e = w.eye.xyz - p; float ed = dot(e, e);
  L += W_EYE * w.eye.w * 4.0 / (1.0 + ed * 3.0);
  return alb * L * reach;
}
`;

const POINTS_VS = /* glsl */ `
precision highp float;
${WATER_GLSL}
in float aKind;
uniform sampler2D uField, uPanels, uDrops;
uniform int uPanelN;
uniform vec4 uMap, uLight, uEye;
uniform vec3 uEnvLo, uEnvHi, uTint;
uniform vec2 uCentre, uRad;
uniform float uSurf, uDepth, uFocal, uMaxPx, uTime, uDepthMode;
out vec3 vCol;
void main() {
  WP w = WP(uMap, cameraPosition, uSurf, uDepth, uCentre, uRad, uLight, uEnvLo, uEnvHi, uTint, uEye, uPanelN, uTime);
  vec3 p = position, col;
  float alive = 1.0;
  if (aKind < 0.5) {
    vec4 f = wField(uField, uMap, p.xz);
    vec3 p0 = p;
    p = wSurfacePos(p, f, w);
    vec4 s = wSurface(uPanels, p, f, w);
    col = s.rgb * s.a + W_BODY * max(w.light.y, w.light.z) * (1.0 - s.a);
    // looking down where nothing is reflected, the surface thins to every third dot of each row, so one sees down between them
    float steep = abs(normalize(p - cameraPosition).y), weak = 1.0 - smoothstep(0.004, 0.03, dot(col, vec3(0.2126, 0.7152, 0.0722)));
    int dotIdx = int(floor(p0.z / ${ORDERED_ALONG_ROW_SPACING.toFixed(4)} + 0.5));
    if (cameraPosition.y > uSurf && steep * weak > 0.45 && (dotIdx % 3 + 3) % 3 != 0) alive = 0.0;
  } else if (aKind < 2.5) {
    vec2 d = (p.xz - uCentre) / (uRad * uRad);
    vec3 n = aKind < 1.5 ? normalize(vec3(-d.x, 0.0, -d.y)) : vec3(0.0, 1.0, 0.0);
    col = wBasin(uField, p, aKind, w);
    if (dot(n, cameraPosition - p) < 0.0) alive = 0.0;
    p = wApparent(uField, p, w);
    if (!wSeen(p, w)) alive = 0.0;
  } else if (aKind < 3.5) {
    vec4 drop = texelFetch(uDrops, ivec2(int(position.x), 0), 0);
    if (drop.w <= 0.0) alive = 0.0;
    p = drop.xyz;
    vec3 v = normalize(p - cameraPosition);
    col = vec3(0.35, 0.33, 0.3) * max(uLight.x, uLight.y) + W_PANEL * 0.1 * uLight.x + wGlint(p, -v, w) * 0.4;
  } else {
    col = wCoping(w);   // the coping ring round the hole
  }
  // as the field does for ordered rows drawn additively: seen at a slant a surface's rows crowd together on screen, so each grain is
  // dimmed by that share. Opaque grains in the depth buffer do not pile up, so in depth mode they keep their colour.
  if (uDepthMode < 0.5 && aKind < 2.5) {
    vec3 sn = aKind < 0.5 || aKind > 1.5 ? vec3(0.0, 1.0, 0.0) : normalize(vec3(uCentre - p.xz, 0.0).xzy);
    col *= clamp(abs(dot(sn, normalize(cameraPosition - p))) * 1.6, 0.08, 1.0);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float z = max(-mv.z, 0.05);
  float sz = (aKind > 2.5 && aKind < 3.5 ? 0.012 : ${GRAIN_METRES.toFixed(4)}) * uFocal / z;
  vec3 c = min(pow(col, vec3(1.0 / 2.2)), vec3(1.0)) * min(1.0, sz);  // whole pixels, as the field's grains: a square of whole size covers the same pixels wherever it falls
  float px = clamp(sz, 1.0, uMaxPx), N = floor(px + 0.5);
  c *= px * px / (N * N);
  if (alive < 0.5 || dot(c, c) < 1e-7) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
  gl_Position = projectionMatrix * mv;
  gl_PointSize = N;
  vCol = c;
}`;
const POINTS_FS = /* glsl */ `precision highp float; in vec3 vCol; out vec4 o; void main() { o = vec4(vCol, 1.0); }`;

export interface AstralWater {
  readonly sim: WaterSim;
  /** The points rendering: add it where the point field is drawn. */
  readonly points: Object3D;
  /** The paint rendering: Spark splats (filled in once Spark has loaded); add it to splatView.paint. Its `opacity` (0..1) fades it. */
  readonly splats: Object3D & { opacity: number };
  update(time: number, dt: number, viewer: V3, eye: V3, eyeGlow: number, mood: WaterMood): void;
  /**
   * How the point water is drawn: false (default) as the field draws today, additive with no depth; true as opaque grains, depth-tested
   * and depth-written (normal blending), for a field that draws its settled grains that way. Either way the basin shows through the
   * black gaps between the surface's grains; nothing of the surface is semi-transparent.
   */
  setPointDepth(depth: boolean): void;
  dispose(): void;
}

/** The rows of grains of the surface (kind 0), basin wall (1) and floor (2), on the field's own lattice, the drops (3) and the coping (4). */
function lattice(water: RoomWater): { position: Float32Array; kind: Float32Array } {
  const [cx, cy, cz] = water.center, [rx, rz] = water.radius, row = ORDERED_ROW_SPACING, dot = ORDERED_ALONG_ROW_SPACING;
  const pos: number[] = [], kind: number[] = [];
  // horizontal faces as the sampler lays them: rows of constant x, dots along z, on the room's global lattice
  for (const [y, k] of [[cy, 0], [cy - water.depth, 2]] as const) {
    for (let r = Math.ceil((cx - rx) / row); r * row < cx + rx; r++) {
      const x = r * row, half = rz * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
      for (let s = Math.ceil((cz - half) / dot); s * dot < cz + half; s++) { pos.push(x, y, s * dot); kind.push(k); }
    }
  }
  // the coping: a ring of the same lattice just above the carpet, from the hole's edge out COPING_METRES
  const yc = cy - WATER_LEVEL_METRES + COPING_RISE, ox = rx + COPING_METRES, oz = rz + COPING_METRES;
  for (let r = Math.ceil((cx - ox) / row); r * row < cx + ox; r++) {
    const x = r * row, half = oz * Math.sqrt(Math.max(0, 1 - ((x - cx) / ox) ** 2));
    for (let s = Math.ceil((cz - half) / dot); s * dot < cz + half; s++) {
      if (((x - cx) / rx) ** 2 + ((s * dot - cz) / rz) ** 2 < 1) continue;
      pos.push(x, yc, s * dot); kind.push(4);
    }
  }
  // the wall: rows of constant height, dots evenly along the ellipse
  const steps = 4096, arc: number[] = [0];
  for (let s = 1; s <= steps; s++) {
    const a0 = (2 * Math.PI * (s - 1)) / steps, a1 = (2 * Math.PI * s) / steps;
    arc.push(arc[s - 1]! + Math.hypot(rx * (Math.cos(a1) - Math.cos(a0)), rz * (Math.sin(a1) - Math.sin(a0))));
  }
  const perimeter = arc[steps]!, around = Math.round(perimeter / dot);
  const angles: number[] = [];
  for (let d = 0, s = 0; d < around; d++) {
    const want = (d * perimeter) / around;
    while (arc[s + 1]! < want) s++;
    angles.push(((s + (want - arc[s]!) / (arc[s + 1]! - arc[s]!)) * 2 * Math.PI) / steps);
  }
  // from the carpet's cut edge (the lip above the water) down to the floor
  for (let r = Math.ceil(WATER_LEVEL_METRES / row); r * row < water.depth; r++) for (const a of angles) { pos.push(cx + rx * Math.cos(a), cy - r * row, cz + rz * Math.sin(a)); kind.push(1); }
  for (let d = 0; d < MAX_DROPS; d++) { pos.push(d, 0, 0); kind.push(3); }
  return { position: new Float32Array(pos), kind: new Float32Array(kind) };
}

export function createWater(pool: RoomWater, lights: RoomLights | undefined): AstralWater {
  // the basin's floor stays where the room put it: the water is lowered, the depth below it shortened to match
  const water: RoomWater = { center: [pool.center[0], pool.center[1] + WATER_LEVEL_METRES, pool.center[2]], radius: pool.radius, depth: pool.depth + WATER_LEVEL_METRES };
  const sim = createWaterSim(water);
  const [cx, cy, cz] = water.center, [rx, rz] = water.radius;

  const fieldData = new Float32Array(sim.nx * sim.nz * 4);
  const field = new DataTexture(fieldData, sim.nx, sim.nz, RGBAFormat, FloatType);
  field.magFilter = field.minFilter = LinearFilter;
  field.wrapS = field.wrapT = ClampToEdgeWrapping;
  field.needsUpdate = true;
  const panelData = new Float32Array(MAX_PANELS * 4), panelList = (lights?.ceiling ?? []).slice(0, MAX_PANELS);
  panelList.forEach((c, k) => panelData.set([c[0], c[1], c[2], 1], k * 4));
  const panels = new DataTexture(panelData, MAX_PANELS, 1, RGBAFormat, FloatType);
  panels.magFilter = panels.minFilter = NearestFilter;
  panels.needsUpdate = true;
  const dropData = new Float32Array(MAX_DROPS * 4);
  const drops = new DataTexture(dropData, MAX_DROPS, 1, RGBAFormat, FloatType);
  drops.magFilter = drops.minFilter = NearestFilter;
  drops.needsUpdate = true;
  // the field texture's mapping from x, z: texel centres sit on the simulation's cell centres
  const map = [sim.x0, sim.z0, 1 / (sim.nx * sim.cell), 1 / (sim.nz * sim.cell)];
  const mood = { light: [...MOODS.liminal.light], envLo: [...MOODS.liminal.envLo], envHi: [...MOODS.liminal.envHi], tint: [...MOODS.liminal.tint] };
  const eyeL = [0, -100, 0, 0];

  // --- points
  const u: Record<string, IUniform> = {
    uField: { value: field }, uPanels: { value: panels }, uDrops: { value: drops }, uPanelN: { value: panelList.length },
    uMap: { value: map }, uLight: { value: mood.light }, uEye: { value: eyeL }, uEnvLo: { value: mood.envLo }, uEnvHi: { value: mood.envHi },
    uTint: { value: mood.tint }, uCentre: { value: new Vector2(cx, cz) }, uRad: { value: new Vector2(rx, rz) }, uSurf: { value: cy },
    uDepth: { value: water.depth }, uFocal: { value: 1000 }, uMaxPx: { value: 6 }, uTime: { value: 0 }, uDepthMode: { value: 0 },
  };
  const { position, kind } = lattice(water);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aKind', new BufferAttribute(kind, 1));
  const material = new ShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader: POINTS_VS, fragmentShader: POINTS_FS, ...ADDITIVE_DRAW });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  const buffer = new Vector2();
  points.onBeforeRender = (r, _s, camera) => {
    r.getDrawingBufferSize(buffer);
    u.uFocal!.value = camera.projectionMatrix.elements[5]! * buffer.y / 2;
    u.uMaxPx!.value = 6 * buffer.y / 1440;
  };

  // --- splats: generated on the GPU from the same field every frame; nothing is rebuilt on the CPU
  // drawn by the paint's own SparkRenderer, which keeps display-ready colour: the colours below are already what the screen shows.
  // splat-view sets `opacity` on what is in its paint group as the paint comes and goes.
  let opacity = 1;
  const splats = Object.defineProperty(new Group(), 'opacity', { get: () => opacity, set: (o: number) => { opacity = Math.min(1, Math.max(0, o)); } }) as Group & { opacity: number };
  splats.name = 'astral-water-splats';
  let disposed = false, release = () => {}, regenerate = () => {}, setCam = (_c: V3) => {};
  void (async () => {
    const spark = await import('@sparkjsdev/spark');
    if (disposed) return;
    const { dyno } = spark;

    const snx = Math.ceil((2 * rx) / SPLAT_SURFACE), snz = Math.ceil((2 * rz) / SPLAT_SURFACE);
    const perimeter = Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz)));
    const wp = Math.ceil(perimeter / SPLAT_WALL), wr = Math.ceil((water.depth - WATER_LEVEL_METRES) / SPLAT_WALL);
    const fnx = Math.ceil((2 * rx) / SPLAT_FLOOR), fnz = Math.ceil((2 * rz) / SPLAT_FLOOR);
    const outer = Math.PI * (3 * (rx + rz + 2 * COPING_METRES) - Math.sqrt((3 * rx + rz + 4 * COPING_METRES) * (rx + 3 * rz + 4 * COPING_METRES)));
    const ca = Math.ceil(outer / SPLAT_WALL), cr = Math.ceil(COPING_METRES / SPLAT_WALL);
    const nS = snx * snz, nW = wp * wr, nF = fnx * fnz, nC = ca * cr, total = nS + nW + nF + nC + MAX_DROPS;
    const dField = dyno.dynoSampler2D(field), dPanels = dyno.dynoSampler2D(panels), dDrops = dyno.dynoSampler2D(drops);
    const dMap = dyno.dynoVec4(new Float32Array(map)), dCam = dyno.dynoVec3(new Vector3()), dLight = dyno.dynoVec4(new Float32Array(4));
    const dEye = dyno.dynoVec4(new Float32Array(4)), dEnvLo = dyno.dynoVec3(new Float32Array(3)), dEnvHi = dyno.dynoVec3(new Float32Array(3)), dTint = dyno.dynoVec3(new Float32Array(3));
    const dPanelN = dyno.dynoInt(panelList.length), dTime = dyno.dynoFloat(0);
    const generator = dyno.dynoBlock({ index: 'int' }, { gsplat: dyno.Gsplat }, ({ index }) => {
      const water3 = new dyno.Dyno({
        inTypes: { index: 'int', field: 'sampler2D', panels: 'sampler2D', drops: 'sampler2D', map: 'vec4', cam: 'vec3', light: 'vec4', eye: 'vec4', envLo: 'vec3', envHi: 'vec3', tint: 'vec3', panelN: 'int', time: 'float' },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [WATER_GLSL, /* glsl */ `
          vec4 wQuat(vec3 n) {   // turns a splat's thin local z axis onto n
            float d = n.z;
            if (d < -0.9999) return vec4(1.0, 0.0, 0.0, 0.0);
            return normalize(vec4(-n.y, n.x, 0.0, 1.0 + d));
          }
          float wHash(int i) { return fract(sin(float(i) * 12.9898) * 43758.5453); }`],
        statements: ({ inputs: x, outputs }) => dyno.unindentLines(`
          int i = ${x.index};
          WP w = WP(${x.map}, ${x.cam}, ${cy.toFixed(5)}, ${water.depth.toFixed(5)}, vec2(${cx.toFixed(5)}, ${cz.toFixed(5)}), vec2(${rx.toFixed(5)}, ${rz.toFixed(5)}),
                    ${x.light}, ${x.envLo}, ${x.envHi}, ${x.tint}, ${x.eye}, ${x.panelN}, ${x.time});
          ${outputs.gsplat}.flags = 0u;
          ${outputs.gsplat}.index = i;
          ${outputs.gsplat}.center = vec3(0.0);
          ${outputs.gsplat}.scales = vec3(0.0);
          ${outputs.gsplat}.quaternion = vec4(0.0, 0.0, 0.0, 1.0);
          ${outputs.gsplat}.rgba = vec4(0.0);
          vec3 p, n, col; vec3 sc; float a = 0.0; bool on = false;
          float j1 = wHash(i) - 0.5, j2 = wHash(i + 7919) - 0.5;
          if (i < ${nS}) {
            vec2 xz = vec2(${(cx - rx).toFixed(5)}, ${(cz - rz).toFixed(5)}) + (vec2(float(i % ${snx}), float(i / ${snx})) + 0.5 + vec2(j1, j2) * 0.6) * ${SPLAT_SURFACE.toFixed(4)};
            if (wInside(xz, w)) {
              vec4 f = wField(${x.field}, w.map, xz);
              p = wSurfacePos(vec3(xz.x, 0.0, xz.y), f, w);
              n = wNormal(f);
              vec4 s = wSurface(${x.panels}, p, f, w);
              // The surface covers the basin in the share F (Fresnel): steep views see down into the water, grazing views see a mirror.
              // Splats blend display-ready colour, so the reflection's display value E must come out as E after the blend: the cover
              // is F, raised only where E is brighter than F can carry. About six splats overlap a pixel (measured), so each splat
              // takes alpha 1 - (1 - cover)^(1/6).
              vec3 E = pow(s.rgb * s.a + W_BODY * max(w.light.y, w.light.z) * (1.0 - s.a), vec3(1.0 / 2.2));
              float cover = clamp(max(s.a, max(E.r, max(E.g, E.b))), 0.03, 0.97);
              a = 1.0 - pow(1.0 - cover, 1.0 / 6.0);
              col = pow(min(E / cover, vec3(1.0)), vec3(2.2));   // back to linear: the common exit below encodes it again
              sc = vec3(vec2(${(SPLAT_SURFACE * 0.75).toFixed(4)}), 0.0008);
              on = true;
            }
          } else if (i < ${nS + nW}) {
            int k = i - ${nS};
            float ang = (float(k % ${wp}) + 0.5 + j1 * 0.5) * ${((2 * Math.PI) / wp).toFixed(6)};
            p = vec3(${cx.toFixed(5)} + ${rx.toFixed(5)} * cos(ang), ${(cy - WATER_LEVEL_METRES).toFixed(5)} - (float(k / ${wp}) + 0.5 + j2 * 0.5) * ${SPLAT_WALL.toFixed(4)}, ${cz.toFixed(5)} + ${rz.toFixed(5)} * sin(ang));
            vec2 d = (p.xz - w.centre) / (w.rad * w.rad);
            n = normalize(vec3(-d.x, 0.0, -d.y));
            col = wBasin(${x.field}, p, 1.0, w);
            sc = vec3(vec2(${(SPLAT_WALL * 0.7).toFixed(4)}), 0.002);
            a = 0.95;
            on = dot(n, w.cam - p) > 0.0;
          } else if (i < ${nS + nW + nF}) {
            int k = i - ${nS + nW};
            vec2 xz = vec2(${(cx - rx).toFixed(5)}, ${(cz - rz).toFixed(5)}) + (vec2(float(k % ${fnx}), float(k / ${fnx})) + 0.5 + vec2(j1, j2) * 0.6) * ${SPLAT_FLOOR.toFixed(4)};
            p = vec3(xz.x, ${(cy - water.depth).toFixed(5)}, xz.y);
            n = vec3(0.0, 1.0, 0.0);
            col = wBasin(${x.field}, p, 2.0, w);
            sc = vec3(vec2(${(SPLAT_FLOOR * 0.7).toFixed(4)}), 0.002);
            a = 0.95;
            on = wInside(xz, w);
          } else if (i < ${nS + nW + nF + nC}) {
            // the coping: rings of flat stone just above the carpet, from the hole's edge outward
            int k = i - ${nS + nW + nF};
            float ang = (float(k % ${ca}) + 0.5) * ${((2 * Math.PI) / ca).toFixed(6)}, outw = (float(k / ${ca}) + 0.5) * ${(COPING_METRES / cr).toFixed(5)};
            p = vec3(${cx.toFixed(5)} + (${rx.toFixed(5)} + outw) * cos(ang), ${(cy - WATER_LEVEL_METRES + COPING_RISE).toFixed(5)}, ${cz.toFixed(5)} + (${rz.toFixed(5)} + outw) * sin(ang));
            n = vec3(0.0, 1.0, 0.0);
            col = wCoping(w);
            sc = vec3(vec2(${(SPLAT_WALL * 0.8).toFixed(4)}), 0.002);
            a = 1.0;
            on = true;
          } else {
            vec4 drop = texelFetch(${x.drops}, ivec2(i - ${nS + nW + nF + nC}, 0), 0);
            p = drop.xyz; n = normalize(w.cam - p);
            col = vec3(0.35, 0.33, 0.3) * max(w.light.x, w.light.y) + W_PANEL * 0.1 * w.light.x + wGlint(p, -n, w) * 0.4;
            sc = vec3(0.006);
            a = 0.95;
            on = drop.w > 0.0;
          }
          if (on && i >= ${nS} && i < ${nS + nW + nF}) {
            p = wApparent(${x.field}, p, w);
            on = wSeen(p, w);
            // seen at a shallow angle the water is a mirror: the basin below gives almost nothing; looking down it keeps its depth
            col *= smoothstep(0.2, 0.55, abs(normalize(p - w.cam).y));
          }
          if (on) {
            ${outputs.gsplat}.flags = GSPLAT_FLAG_ACTIVE;
            ${outputs.gsplat}.center = p;
            ${outputs.gsplat}.scales = sc;
            ${outputs.gsplat}.quaternion = wQuat(n);
            ${outputs.gsplat}.rgba = vec4(min(pow(max(col, vec3(0.0)), vec3(1.0 / 2.2)), vec3(1.0)), a * w.light.w);   // w: the paint's presence
          }
        `),
      });
      return { gsplat: water3.apply({ index, field: dField, panels: dPanels, drops: dDrops, map: dMap, cam: dCam, light: dLight, eye: dEye, envLo: dEnvLo, envHi: dEnvHi, tint: dTint, panelN: dPanelN, time: dTime }).gsplat };
    });
    const mesh = new spark.SplatGenerator({ numSplats: total, generator });
    mesh.frustumCulled = false;
    splats.add(mesh);
    setCam = c => { dCam.value.set(c.x, c.y, c.z); };
    regenerate = () => {
      (dLight.value as Float32Array).set([mood.light[0]!, mood.light[1]!, mood.light[2]!, opacity]); (dEye.value as Float32Array).set(eyeL);
      dTime.value = u.uTime!.value as number;
      (dEnvLo.value as Float32Array).set(mood.envLo); (dEnvHi.value as Float32Array).set(mood.envHi); (dTint.value as Float32Array).set(mood.tint);
      mesh.updateVersion();
    };
    release = () => { splats.remove(mesh); };
    console.info(`[astral] water splats ready: ${total} (surface ${nS}, wall ${nW}, floor ${nF}, coping ${nC}, drops ${MAX_DROPS})`);
  })().catch(error => console.error('[astral] the water splats could not be made', error));

  const toward = (x: number[], target: number[], k: number) => { for (let i = 0; i < x.length; i++) x[i] = x[i]! + (target[i]! - x[i]!) * k; };

  return {
    sim, points, splats,
    update(time, dt, viewer, eye, eyeGlow, next) {
      u.uTime!.value = Number.isFinite(time) ? time % 3600 : 0;
      const glow = Number.isFinite(eyeGlow) ? Math.min(1, Math.max(0, eyeGlow)) : 0;
      sim.step(dt, { viewer: [viewer.x, viewer.y, viewer.z], eye: [eye.x, eye.y, eye.z], eyeGlow: glow });
      sim.fill(fieldData);
      field.needsUpdate = true;
      dropData.fill(0);
      sim.droplets.slice(0, MAX_DROPS).forEach((d, k) => dropData.set([d.x, d.y, d.z, d.size], k * 4));
      drops.needsUpdate = true;
      const target = MOODS[next] ?? MOODS.liminal, k = 1 - Math.exp(-Math.max(0, dt) / MOOD_EASE);
      toward(mood.light, target.light, k); toward(mood.envLo, target.envLo, k); toward(mood.envHi, target.envHi, k); toward(mood.tint, target.tint, k);
      eyeL[0] = eye.x; eyeL[1] = eye.y; eyeL[2] = eye.z; eyeL[3] = glow;
      setCam(viewer);
      if (splats.visible) regenerate();
    },
    setPointDepth(depth) {
      if (material.depthTest === depth) return;
      Object.assign(material, depth ? DEPTH_DRAW : ADDITIVE_DRAW);
      u.uDepthMode!.value = depth ? 1 : 0;
      material.needsUpdate = true;
    },
    dispose() {
      disposed = true;
      release();
      geometry.dispose(); material.dispose(); field.dispose(); panels.dispose(); drops.dispose();
    },
  };
}
