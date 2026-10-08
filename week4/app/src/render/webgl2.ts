// WebGL2 backend. Layers per frame: ground clear (frame.paper) → sky gradient drawn as a triangle list of the sky's
// clip polygon (Sky.polygon, the wedge between the rooflines; a full-width rectangle down to the horizon band when
// absent; the hashed-grain paper pass when frame.sky is null) → gl.POINTS soft discs from one
// interleaved dynamic VBO, with the birth ramp and shimmer applied in the vertex shader from u_time →
// instanced tile quads whose fragment shader generates flat/dither/dotgrid/scanline patterns in device pixels,
// followed in the same instanced draw by their 1-px hairlines, scissored to the frame rect so a hairline dropping
// past the frame bottom never paints the margin. Blending is premultiplied "over": fragments output
// premultiplied colour and we use gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA). Time comes only from view.timeMs.
// Per frame the CPU path allocates nothing: the sky triangle list is re-packed and re-uploaded only when the
// polygon identity or the frame rect changes (patterns.ts caches the triangulation per polygon array).
// Context loss stops drawing (stats.degraded); restore rebuilds every resource.
import { BIRTH_RAMP_MS, type FrameView, type Renderer, type RendererStats, type SceneFrame, type Sky } from '../scene/types.ts';
import {
  BYTES_PER_PARTICLE,
  FLOATS_PER_PARTICLE,
  OFFSET_BIRTH,
  OFFSET_COLOR,
  OFFSET_MOTION,
  OFFSET_PHASE,
  OFFSET_POS,
  OFFSET_SEED,
  OFFSET_SIZE,
  packParticles,
} from './pack.ts';
import {
  BYTES_PER_TILE_INSTANCE,
  FLOATS_PER_TILE_INSTANCE,
  SKY_FLOATS_PER_VERTEX,
  TILE_OFFSET_BIRTH,
  TILE_OFFSET_CELL,
  TILE_OFFSET_COLOR,
  TILE_OFFSET_PATTERN,
  TILE_OFFSET_RECT,
  packSkyTriangles,
  packTiles,
  skyClipVertexCount,
  skyTriangleFloats,
} from './patterns.ts';
import {
  DITHER_HI,
  DITHER_LO,
  DOT_RADIUS,
  GRAIN_AMPLITUDE,
  GRAIN_SALT,
  GRAIN_TILE,
  GRAIN_WARMTH,
  MAX_SQUASH,
  MIN_DEVICE_DIAMETER,
  SCANLINE_PX,
  SHAPE_ANGLE_SALT,
  SHAPE_SQUASH_SALT,
  SHIMMER_BASE,
  SHIMMER_DEPTH,
  SKY_BAND,
  SOFT_EDGE,
} from './paper.ts';

/** Required context attributes. A canvas that handed out a WebGL2 context cannot later hand out a 2D one. */
export const WEBGL2_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
};

const glFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// gl_VertexID / a_seed hash mirrors scene/rng.ts hash01 so both backends draw the same ellipse per slot.
// Birth ramp and shimmer mirror pack.ts birthRamp/shimmerFactor; u_time is the host clock in seconds.
const PARTICLE_VERT = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_size;
layout(location = 2) in float a_seed;
layout(location = 3) in vec4 a_color;
layout(location = 4) in float a_phase;
layout(location = 5) in float a_motion;
layout(location = 6) in float a_birth;
uniform vec4 u_frame;      // left, top, width, height in device px
uniform vec2 u_canvas;     // drawing-buffer size in device px
uniform float u_sizeScale; // frame.height / 1080
uniform vec2 u_pointRange; // ALIASED_POINT_SIZE_RANGE
uniform float u_time;      // host clock, seconds
out vec4 v_color;
out vec3 v_shape;
out float v_radius;
float hash01(uint i, uint salt) {
  uint h = i * 374761393u + salt * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) / 4294967296.0;
}
void main() {
  float birth = a_birth * 0.001;
  float ramp = smoothstep(birth, birth + ${glFloat(BIRTH_RAMP_MS / 1000)}, u_time);
  float shimmer = a_motion > 0.0
    ? ${glFloat(SHIMMER_BASE)} + ${glFloat(SHIMMER_DEPTH)} * (0.5 + 0.5 * sin(6.28318530718 * (a_motion * u_time + a_phase)))
    : 1.0;
  float alpha = clamp(a_color.a, 0.0, 1.0) * ramp * shimmer;
  if (alpha <= 0.0005) {
    // Not yet born or fully transparent: park the point outside the clip volume so it is culled before rasterisation.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    v_color = vec4(0.0);
    v_shape = vec3(1.0, 0.0, 1.0);
    v_radius = 0.0;
    return;
  }
  vec2 dev = u_frame.xy + a_pos * u_frame.zw;
  gl_Position = vec4(dev.x / u_canvas.x * 2.0 - 1.0, 1.0 - dev.y / u_canvas.y * 2.0, 0.0, 1.0);
  float d = clamp(max(${glFloat(MIN_DEVICE_DIAMETER)}, a_size * u_sizeScale), u_pointRange.x, u_pointRange.y);
  gl_PointSize = d;
  v_radius = 0.5 * d;
  v_color = vec4(a_color.rgb, alpha);
  uint i = uint(a_seed + 0.5);
  float ang = 6.28318530718 * hash01(i, ${SHAPE_ANGLE_SALT}u);
  float sq = 1.0 - ${glFloat(MAX_SQUASH)} * hash01(i, ${SHAPE_SQUASH_SALT}u);
  v_shape = vec3(cos(ang), sin(ang), sq);
}
`;

// Soft disc in device px: a smoothstep band centred on the equal-area hard radius r·(1 − SOFT_EDGE/2)
// (the radius Canvas2D fills), SOFT_EDGE·r wide but never under one px. For r ≥ 4 px this is exactly the
// 0.75r → r falloff; for tiny sprites (whose few fragments sit near 0.7r) it keeps the disc's area instead
// of fading it out, so both backends carry the same weight.
const PARTICLE_FRAG = `#version 300 es
precision mediump float;
in vec4 v_color;
in vec3 v_shape;
in float v_radius;
out vec4 o_color;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  vec2 q = vec2(dot(p, v_shape.xy), dot(p, vec2(-v_shape.y, v_shape.x)) / v_shape.z);
  float distPx = length(q) * v_radius;
  float hardR = v_radius * ${glFloat(1 - SOFT_EDGE / 2)};
  float band = max(${glFloat(SOFT_EDGE)} * v_radius, 1.0);
  float cov = 1.0 - smoothstep(hardR - 0.5 * band, hardR + 0.5 * band, distPx);
  float a = v_color.a * cov;
  if (a <= 0.0005) discard;
  o_color = vec4(clamp(v_color.rgb, 0.0, 1.0) * a, a);
}
`;

const FULLSCREEN_VERT = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// Same integer hash and octave mix as pack.ts grainNoise/grainRgb, on top-left device-pixel coordinates.
const PAPER_FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform vec3 u_paper;
uniform float u_height;
uniform uint u_salt;
out vec4 o_color;
float grainHash(uvec2 p, uint salt) {
  uint h = p.x * 374761393u ^ p.y * 668265263u ^ salt * 2246822519u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) / 4294967296.0;
}
void main() {
  uvec2 p = uvec2(uint(gl_FragCoord.x), uint(max(u_height - gl_FragCoord.y, 0.0))) & uvec2(${GRAIN_TILE - 1}u);
  float n = 0.6 * grainHash(p, u_salt) + 0.4 * grainHash(p >> 1u, u_salt + 1u);
  float lum = 1.0 + ${glFloat(GRAIN_AMPLITUDE)} * (2.0 * n - 1.0);
  float warm = (0.5 - n) * ${glFloat(2 * GRAIN_WARMTH)};
  vec3 c = u_paper * lum * vec3(1.0 + warm, 1.0, 1.0 - warm);
  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

// Sky vertices: the clip polygon's triangle list in device px (top-left origin), packed by patterns.ts packSkyTriangles.
const SKY_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos; // device px
uniform vec2 u_canvas;              // drawing-buffer size in device px
void main() {
  gl_Position = vec4(a_pos.x / u_canvas.x * 2.0 - 1.0, 1.0 - a_pos.y / u_canvas.y * 2.0, 0.0, 1.0);
}
`;

// Sky: mirrors patterns.ts skyRgb in frame coordinates, so the gradient and the soft band at horizonY follow the
// frame's y wherever the polygon reaches (below the band it paints the ground colour over the ground). Drawn under a
// scissor covering the frame rect, so a polygon reaching past the frame edges never paints the margins.
const SKY_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_frame;   // left, top, width, height in device px
uniform float u_height; // drawing-buffer height
uniform vec3 u_top;
uniform vec3 u_horizon;
uniform vec3 u_ground;
uniform float u_horizonY;
out vec4 o_color;
void main() {
  float py = u_height - gl_FragCoord.y;
  float fy = (py - u_frame.y) / u_frame.w;
  vec3 g = mix(u_top, u_horizon, clamp(fy / u_horizonY, 0.0, 1.0));
  float m = smoothstep(u_horizonY - ${glFloat(SKY_BAND / 2)}, u_horizonY + ${glFloat(SKY_BAND / 2)}, fy);
  o_color = vec4(clamp(mix(g, u_ground, m), 0.0, 1.0), 1.0);
}
`;

// Tiles: one instance per tile (then per hairline); the quad corners come from gl_VertexID (triangle strip).
// v_local is the device-pixel offset from the tile's top-left, so the fragment pattern is in device pixels.
const TILE_VERT = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec4 a_rect;    // left, top, width, height in device px (whole pixels)
layout(location = 1) in vec4 a_color;   // r, g, b, alpha
layout(location = 2) in float a_pattern;
layout(location = 3) in float a_cell;   // device px
layout(location = 4) in float a_birth;  // ms
uniform vec2 u_canvas;
uniform float u_time; // seconds
out vec2 v_local;
flat out vec4 v_color;
flat out vec2 v_size;
flat out float v_cell;
flat out int v_pattern;
void main() {
  float birth = a_birth * 0.001;
  float ramp = smoothstep(birth, birth + ${glFloat(BIRTH_RAMP_MS / 1000)}, u_time);
  float alpha = clamp(a_color.a, 0.0, 1.0) * ramp;
  v_color = vec4(a_color.rgb, alpha);
  v_size = a_rect.zw;
  v_cell = max(a_cell, 1.0);
  v_pattern = int(a_pattern + 0.5);
  if (alpha <= 0.0005) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // degenerate, culled
    v_local = vec2(0.0);
    return;
  }
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 dev = a_rect.xy + corner * a_rect.zw;
  gl_Position = vec4(dev.x / u_canvas.x * 2.0 - 1.0, 1.0 - dev.y / u_canvas.y * 2.0, 0.0, 1.0);
  v_local = corner * a_rect.zw;
}
`;

// Mirrors patterns.ts patternCoverage / bayer4Index exactly (arithmetic Bayer, no array indexing).
const TILE_FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_local;
flat in vec4 v_color;
flat in vec2 v_size;
flat in float v_cell;
flat in int v_pattern;
out vec4 o_color;
int bayer4(int x, int y) {
  int xi = x & 3;
  int yi = y & 3;
  int xy = xi ^ yi;
  return ((xy & 1) << 3) | ((yi & 1) << 2) | (((xy >> 1) & 1) << 1) | ((yi >> 1) & 1);
}
float coverage(float px, float py) {
  if (v_pattern == 1) return 1.0;
  if (v_pattern == 2) {
    float cx = floor(px / v_cell);
    float cy = floor(py / v_cell);
    float u = clamp((cx + 0.5) * v_cell / v_size.x, 0.0, 1.0);
    float v = clamp((cy + 0.5) * v_cell / v_size.y, 0.0, 1.0);
    float g = ${glFloat(DITHER_HI)} - ${glFloat(DITHER_HI - DITHER_LO)} * 0.5 * (u + v);
    float th = (float(bayer4(int(cx), int(cy))) + 0.5) / 16.0;
    return g > th ? 1.0 : 0.0;
  }
  if (v_pattern == 3) {
    vec2 c = (floor(vec2(px, py) / v_cell) + 0.5) * v_cell;
    float d = length(vec2(px + 0.5, py + 0.5) - c);
    float r = ${glFloat(DOT_RADIUS)} * v_cell;
    return 1.0 - smoothstep(r - 0.5, r + 0.5, d);
  }
  if (v_pattern == 4) {
    return (py - floor(py / v_cell) * v_cell) < ${glFloat(SCANLINE_PX)} ? 1.0 : 0.0;
  }
  return 0.0;
}
void main() {
  float a = v_color.a * coverage(floor(v_local.x), floor(v_local.y));
  if (a <= 0.0005) discard;
  o_color = vec4(clamp(v_color.rgb, 0.0, 1.0) * a, a);
}
`;

interface GlResources {
  particleProgram: WebGLProgram;
  paperProgram: WebGLProgram;
  skyProgram: WebGLProgram;
  tileProgram: WebGLProgram;
  vao: WebGLVertexArrayObject;
  fullscreenVao: WebGLVertexArrayObject;
  skyVao: WebGLVertexArrayObject;
  tileVao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  skyVbo: WebGLBuffer;
  tileVbo: WebGLBuffer;
  /** Particles / sky floats / tile instances the VBOs currently hold; grown on demand with bufferData. */
  vboCapacity: number;
  skyCapacity: number;
  tileCapacity: number;
  pointRange: [number, number];
  u: {
    frame: WebGLUniformLocation | null;
    canvas: WebGLUniformLocation | null;
    sizeScale: WebGLUniformLocation | null;
    pointRange: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    paper: WebGLUniformLocation | null;
    height: WebGLUniformLocation | null;
    salt: WebGLUniformLocation | null;
    skyCanvas: WebGLUniformLocation | null;
    skyFrame: WebGLUniformLocation | null;
    skyHeight: WebGLUniformLocation | null;
    skyTop: WebGLUniformLocation | null;
    skyHorizon: WebGLUniformLocation | null;
    skyGround: WebGLUniformLocation | null;
    skyHorizonY: WebGLUniformLocation | null;
    tileCanvas: WebGLUniformLocation | null;
    tileTime: WebGLUniformLocation | null;
  };
}

/** Returns null when WebGL2 context creation fails so the caller can fall back to Canvas2D on the same canvas. */
export function createWebGL2Renderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl2', WEBGL2_CONTEXT_ATTRIBUTES);
  if (!gl) return null;

  let res: GlResources | null = null;
  let scratch = new Float32Array(0);
  let skyScratch = new Float32Array(0);
  let tileScratch = new Float32Array(0);
  let lost = gl.isContextLost();
  let disposed = false;
  let rendererName = describeRenderer(gl);
  let stats: RendererStats = { backend: 'webgl2', lastDrawMs: 0, particlesDrawn: 0, degraded: lost, detail: lost ? 'WebGL2 context lost' : rendererName };
  /**
   * What the sky VBO holds: the clip polygon (by identity), the horizon (the no-polygon rectangle depends on it) and
   * the frame rect it was packed through. The triangle list is re-packed and re-uploaded only when one of these
   * changes or the buffer is (re)allocated; `valid` is cleared whenever ensureSkyCapacity calls bufferData.
   */
  const skyUpload = { polygon: undefined as Sky['polygon'], horizonY: Number.NaN, left: Number.NaN, top: Number.NaN, width: Number.NaN, height: Number.NaN, vertices: 0, valid: false };

  const onLost = (event: Event) => {
    event.preventDefault(); // opt in to the restored event
    lost = true;
    res = null; // every GL object is invalid now
    stats = { backend: 'webgl2', lastDrawMs: 0, particlesDrawn: 0, degraded: true, detail: 'WebGL2 context lost' };
  };
  const onRestored = () => {
    if (disposed) return;
    try {
      res = initResources(gl);
      lost = false;
      rendererName = describeRenderer(gl);
      stats = { backend: 'webgl2', lastDrawMs: 0, particlesDrawn: 0, degraded: false, detail: `${rendererName} · restored after context loss` };
    } catch (err) {
      stats = { backend: 'webgl2', lastDrawMs: 0, particlesDrawn: 0, degraded: true, detail: `WebGL2 restore failed: ${message(err)}` };
    }
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  if (!lost) {
    try {
      res = initResources(gl);
    } catch (err) {
      if (gl.isContextLost()) {
        // Lost between creation and init: a complete renderer in its lost state; the restored event rebuilds resources.
        lost = true;
        res = null;
        stats = { backend: 'webgl2', lastDrawMs: 0, particlesDrawn: 0, degraded: true, detail: 'WebGL2 context lost' };
      } else {
        // Never hand back a half-initialised renderer: the canvas is bound to WebGL2 now, so no 2D fallback here.
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
        throw new Error(
          `WebGL2 initialisation failed (${message(err)}). The canvas is now bound to WebGL2; mount a fresh canvas with preference 'canvas2d' to fall back.`,
        );
      }
    }
  }

  function ensureCapacity(capacity: number) {
    if (!res) return;
    if (scratch.length < capacity * FLOATS_PER_PARTICLE) scratch = new Float32Array(capacity * FLOATS_PER_PARTICLE);
    if (res.vboCapacity < capacity) {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, res.vbo);
      gl!.bufferData(gl!.ARRAY_BUFFER, capacity * BYTES_PER_PARTICLE, gl!.DYNAMIC_DRAW);
      res.vboCapacity = capacity;
    }
  }

  function ensureSkyCapacity(floats: number) {
    if (!res) return;
    const want = Math.max(floats, 6 * SKY_FLOATS_PER_VERTEX);
    if (skyScratch.length < want) skyScratch = new Float32Array(want);
    if (res.skyCapacity < want) {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, res.skyVbo);
      gl!.bufferData(gl!.ARRAY_BUFFER, want * 4, gl!.DYNAMIC_DRAW);
      res.skyCapacity = want;
      skyUpload.valid = false; // bufferData discarded the previous contents
    }
  }

  function ensureTileCapacity(instances: number) {
    if (!res) return;
    const want = Math.max(instances, 64);
    if (tileScratch.length < want * FLOATS_PER_TILE_INSTANCE) tileScratch = new Float32Array(want * FLOATS_PER_TILE_INSTANCE);
    if (res.tileCapacity < want) {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, res.tileVbo);
      gl!.bufferData(gl!.ARRAY_BUFFER, want * BYTES_PER_TILE_INSTANCE, gl!.DYNAMIC_DRAW);
      res.tileCapacity = want;
    }
  }

  return {
    backend: 'webgl2',
    draw(frame: SceneFrame, view: FrameView) {
      if (disposed || lost || !res) return;
      const t0 = performance.now();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      if (!(w > 0 && h > 0 && view.widthPx > 0 && view.heightPx > 0)) return;
      const { store, tiles, sky, paper } = frame;
      const timeS = view.timeMs / 1000;
      ensureCapacity(store.capacity);
      const n = packParticles(store, scratch);
      ensureTileCapacity(tiles.length * 2);
      const m = packTiles(tiles, view.frame, tileScratch);

      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.CULL_FACE);

      // The frame rect in drawing-buffer px, for the scissor around the sky and tile passes (the margins stay ground).
      const f = view.frame;
      const x0 = Math.max(0, Math.round(f.left));
      const x1 = Math.min(w, Math.round(f.left + f.width));
      const y0 = Math.max(0, Math.round(f.top));
      const y1 = Math.min(h, Math.round(f.top + f.height));
      const frameVisible = x1 > x0 && y1 > y0;

      // Ground: clear the whole drawing buffer (margins included) to the ground colour.
      gl.clearColor(paper[0], paper[1], paper[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);
      if (sky) {
        // Sky: the clip polygon (the wedge, or the full-width band down to skyBottomY) as a triangle list in device px,
        // scissored to the frame rect so the margins stay ground; the gradient and band come from frame y in the shader.
        // The list is re-packed and re-uploaded only when the polygon identity, the horizon or the frame rect changes.
        ensureSkyCapacity(skyTriangleFloats(skyClipVertexCount(sky)));
        const polygon = sky.polygon && sky.polygon.length >= 3 ? sky.polygon : undefined;
        const held =
          skyUpload.valid &&
          skyUpload.polygon === polygon &&
          (polygon !== undefined || skyUpload.horizonY === sky.horizonY) &&
          skyUpload.left === f.left &&
          skyUpload.top === f.top &&
          skyUpload.width === f.width &&
          skyUpload.height === f.height;
        let nv = skyUpload.vertices;
        if (!held) {
          nv = packSkyTriangles(sky, f, skyScratch);
          gl.bindBuffer(gl.ARRAY_BUFFER, res.skyVbo);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, skyScratch, 0, nv * SKY_FLOATS_PER_VERTEX);
          skyUpload.polygon = polygon;
          skyUpload.horizonY = sky.horizonY;
          skyUpload.left = f.left;
          skyUpload.top = f.top;
          skyUpload.width = f.width;
          skyUpload.height = f.height;
          skyUpload.vertices = nv;
          skyUpload.valid = true;
        }
        if (frameVisible && nv > 0) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(x0, h - y1, x1 - x0, y1 - y0);
          gl.useProgram(res.skyProgram);
          gl.bindVertexArray(res.skyVao);
          gl.uniform2f(res.u.skyCanvas, w, h);
          gl.uniform4f(res.u.skyFrame, view.frame.left, view.frame.top, view.frame.width, view.frame.height);
          gl.uniform1f(res.u.skyHeight, h);
          gl.uniform3f(res.u.skyTop, sky.top[0], sky.top[1], sky.top[2]);
          gl.uniform3f(res.u.skyHorizon, sky.horizon[0], sky.horizon[1], sky.horizon[2]);
          gl.uniform3f(res.u.skyGround, paper[0], paper[1], paper[2]);
          gl.uniform1f(res.u.skyHorizonY, sky.horizonY > 1e-4 ? sky.horizonY : 1e-4);
          gl.drawArrays(gl.TRIANGLES, 0, nv);
          gl.disable(gl.SCISSOR_TEST);
        }
      } else {
        // No sky: the paper grain pass over the whole drawing buffer, as before.
        gl.useProgram(res.paperProgram);
        gl.bindVertexArray(res.fullscreenVao);
        gl.uniform3f(res.u.paper, paper[0], paper[1], paper[2]);
        gl.uniform1f(res.u.height, h);
        gl.uniform1ui(res.u.salt, GRAIN_SALT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // Particles: premultiplied "over" blending, slot order preserved by the packer; birth ramp + shimmer in the shader.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (n > 0) {
        gl.useProgram(res.particleProgram);
        gl.bindVertexArray(res.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, scratch, 0, n * FLOATS_PER_PARTICLE);
        gl.uniform4f(res.u.frame, view.frame.left, view.frame.top, view.frame.width, view.frame.height);
        gl.uniform2f(res.u.canvas, w, h);
        gl.uniform1f(res.u.sizeScale, view.frame.height / 1080);
        gl.uniform2f(res.u.pointRange, res.pointRange[0], res.pointRange[1]);
        gl.uniform1f(res.u.time, timeS);
        gl.drawArrays(gl.POINTS, 0, n);
      }

      // Tiles then hairlines: one instanced draw in array order (tiles first, hairlines after, as packed), scissored
      // to the frame rect so a hairline dropping past the frame bottom (or a tile nudged over an edge) stops there.
      if (m > 0 && frameVisible) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x0, h - y1, x1 - x0, y1 - y0);
        gl.useProgram(res.tileProgram);
        gl.bindVertexArray(res.tileVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, res.tileVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, tileScratch, 0, m * FLOATS_PER_TILE_INSTANCE);
        gl.uniform2f(res.u.tileCanvas, w, h);
        gl.uniform1f(res.u.tileTime, timeS);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
        gl.disable(gl.SCISSOR_TEST);
      }
      gl.bindVertexArray(null);

      // lastDrawMs is CPU submit time (pack + upload + command issue); GPU execution is asynchronous and not measured here.
      // performance.now() is used only for this measurement: every time-driven effect reads view.timeMs (the host clock).
      stats = { backend: 'webgl2', lastDrawMs: performance.now() - t0, particlesDrawn: n, degraded: false, detail: stats.detail === 'WebGL2 context lost' ? rendererName : stats.detail };
    },
    stats: () => stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (res && !gl.isContextLost()) {
        gl.deleteBuffer(res.vbo);
        gl.deleteBuffer(res.skyVbo);
        gl.deleteBuffer(res.tileVbo);
        gl.deleteVertexArray(res.vao);
        gl.deleteVertexArray(res.fullscreenVao);
        gl.deleteVertexArray(res.skyVao);
        gl.deleteVertexArray(res.tileVao);
        gl.deleteProgram(res.particleProgram);
        gl.deleteProgram(res.paperProgram);
        gl.deleteProgram(res.skyProgram);
        gl.deleteProgram(res.tileProgram);
      }
      res = null;
      scratch = new Float32Array(0);
      skyScratch = new Float32Array(0);
      tileScratch = new Float32Array(0);
      // Release the context itself so repeated backend switches do not pile up live contexts.
      if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

function initResources(gl: WebGL2RenderingContext): GlResources {
  const particleProgram = linkProgram(gl, PARTICLE_VERT, PARTICLE_FRAG, 'particles');
  const paperProgram = linkProgram(gl, FULLSCREEN_VERT, PAPER_FRAG, 'paper');
  const skyProgram = linkProgram(gl, SKY_VERT, SKY_FRAG, 'sky');
  const tileProgram = linkProgram(gl, TILE_VERT, TILE_FRAG, 'tiles');
  const vbo = gl.createBuffer();
  const skyVbo = gl.createBuffer();
  const tileVbo = gl.createBuffer();
  const vao = gl.createVertexArray();
  const fullscreenVao = gl.createVertexArray();
  const skyVao = gl.createVertexArray();
  const tileVao = gl.createVertexArray();
  if (!vbo || !skyVbo || !tileVbo || !vao || !fullscreenVao || !skyVao || !tileVao) throw new Error('could not allocate GL objects');

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const particleLayout: Array<[number, number, number]> = [
    [0, 2, OFFSET_POS],
    [1, 1, OFFSET_SIZE],
    [2, 1, OFFSET_SEED],
    [3, 4, OFFSET_COLOR],
    [4, 1, OFFSET_PHASE],
    [5, 1, OFFSET_MOTION],
    [6, 1, OFFSET_BIRTH],
  ];
  for (const [loc, size, offset] of particleLayout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, BYTES_PER_PARTICLE, offset);
  }

  gl.bindVertexArray(skyVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, SKY_FLOATS_PER_VERTEX, gl.FLOAT, false, SKY_FLOATS_PER_VERTEX * 4, 0);

  gl.bindVertexArray(tileVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, tileVbo);
  const tileLayout: Array<[number, number, number]> = [
    [0, 4, TILE_OFFSET_RECT],
    [1, 4, TILE_OFFSET_COLOR],
    [2, 1, TILE_OFFSET_PATTERN],
    [3, 1, TILE_OFFSET_CELL],
    [4, 1, TILE_OFFSET_BIRTH],
  ];
  for (const [loc, size, offset] of tileLayout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, BYTES_PER_TILE_INSTANCE, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  const rangeParam = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
  const pointRange: [number, number] = [rangeParam?.[0] ?? 1, rangeParam?.[1] ?? 64];

  return {
    particleProgram,
    paperProgram,
    skyProgram,
    tileProgram,
    vao,
    fullscreenVao,
    skyVao,
    tileVao,
    vbo,
    skyVbo,
    tileVbo,
    vboCapacity: 0,
    skyCapacity: 0,
    tileCapacity: 0,
    pointRange,
    u: {
      frame: gl.getUniformLocation(particleProgram, 'u_frame'),
      canvas: gl.getUniformLocation(particleProgram, 'u_canvas'),
      sizeScale: gl.getUniformLocation(particleProgram, 'u_sizeScale'),
      pointRange: gl.getUniformLocation(particleProgram, 'u_pointRange'),
      time: gl.getUniformLocation(particleProgram, 'u_time'),
      paper: gl.getUniformLocation(paperProgram, 'u_paper'),
      height: gl.getUniformLocation(paperProgram, 'u_height'),
      salt: gl.getUniformLocation(paperProgram, 'u_salt'),
      skyCanvas: gl.getUniformLocation(skyProgram, 'u_canvas'),
      skyFrame: gl.getUniformLocation(skyProgram, 'u_frame'),
      skyHeight: gl.getUniformLocation(skyProgram, 'u_height'),
      skyTop: gl.getUniformLocation(skyProgram, 'u_top'),
      skyHorizon: gl.getUniformLocation(skyProgram, 'u_horizon'),
      skyGround: gl.getUniformLocation(skyProgram, 'u_ground'),
      skyHorizonY: gl.getUniformLocation(skyProgram, 'u_horizonY'),
      tileCanvas: gl.getUniformLocation(tileProgram, 'u_canvas'),
      tileTime: gl.getUniformLocation(tileProgram, 'u_time'),
    },
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`could not create ${label} shader`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`${label} shader failed to compile: ${log.trim()}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string, label: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert, `${label} vertex`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag, `${label} fragment`);
  const program = gl.createProgram();
  if (!program) throw new Error(`could not create ${label} program`);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`${label} program failed to link: ${log.trim()}`);
  }
  return program;
}

/** Unmasked renderer string when WEBGL_debug_renderer_info exists, else gl.RENDERER. */
function describeRenderer(gl: WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  let name: unknown = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  if (typeof name !== 'string' || name.length === 0) name = gl.getParameter(gl.RENDERER);
  return typeof name === 'string' && name.length > 0 ? name : 'WebGL2';
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
