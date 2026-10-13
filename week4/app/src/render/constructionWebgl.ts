// WebGL2 backend for the Seed-33 construction overlay (w4-20261008-seed33-construction-r1).
// Draws the shared, data-only ConstructionPlan (scene/constructionTypes.ts) as native GPU geometry:
//   - strokes: a thick polyline (two triangles per segment) PLUS a small round fan at every authored
//     point (segment joints and both ends), so curved furniture/architecture contours and bead-like
//     strand tips stay gap-free without any CPU rasterisation — this mirrors the "blackwall" beaded-
//     strand look inspected in the fresh references (img-01/img-02, vid-02 sheets), not a shader trick.
//   - discs: a round fan, same geometry path as a stroke's own joint caps.
//   - solids: the authored triangle as-is.
//   - texture patches: the authored triangle's three (dest, uv) pairs, sampled from whichever of the
//     four already-loaded photo-layer bitmaps (background/figure/foreground/tiles) the command names.
// Strokes/discs/solids share one flat-coloured program and vertex layout, so they batch into a single
// draw call whenever they are adjacent in the plan; texture patches batch per adjacent run of the SAME
// texture (one GL_TEXTURE_2D bound per draw call). A batch flushes exactly when the next command is not
// of the same draw kind (or, for textures, not the same texture), so draw calls execute in exactly the
// order the plan authored them — painter order is never reordered, only adjacent-and-compatible commands
// are combined into fewer GPU submissions.
//
// Blending: both programs output straight-alpha-sampled-then-premultiplied colour (same contract as the
// existing particle/tile/photo passes in webgl2.ts), so the caller's existing
// gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) "premultiplied over" state applies unchanged; this module
// never touches blend state itself. Alpha here is always the authored command's own local alpha — there
// is no global scene-opacity uniform anywhere in this file.
import type { ConstructionChannel, ConstructionCommand, ConstructionDisc, ConstructionPlan, ConstructionSolid, ConstructionStroke, ConstructionTexture } from '../scene/constructionTypes.ts';
import type { FrameRect, Rgb } from '../scene/types.ts';

/** u_tint per channel: single/dual-channel masks of the REAL sampled rgb; (1,1,1) (full colour) when unset. */
function channelTint(channel: ConstructionChannel | undefined): Rgb {
  switch (channel) {
    case 'r': return [1, 0, 0];
    case 'g': return [0, 1, 0];
    case 'b': return [0, 0, 1];
    case 'cyan': return [0, 1, 1];
    case 'magenta': return [1, 0, 1];
    case 'yellow': return [1, 1, 0];
    default: return [1, 1, 1];
  }
}

const FLAT_FLOATS_PER_VERTEX = 6; // x, y (device px), r, g, b, a (straight alpha)
const TEX_FLOATS_PER_VERTEX = 5; // x, y (device px), u, v (0..1), alpha (straight)
const DISC_SEGMENTS = 20;
const STROKE_CAP_SEGMENTS = 8;

const FLAT_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;   // device px
layout(location = 1) in vec4 a_color; // rgb + alpha, straight
uniform vec2 u_canvas;
out vec4 v_color;
void main() {
  gl_Position = vec4(a_pos.x / u_canvas.x * 2.0 - 1.0, 1.0 - a_pos.y / u_canvas.y * 2.0, 0.0, 1.0);
  v_color = a_color;
}
`;

const FLAT_FRAG = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 o_color;
void main() {
  float a = clamp(v_color.a, 0.0, 1.0);
  if (a <= 0.0005) discard;
  o_color = vec4(clamp(v_color.rgb, 0.0, 1.0) * a, a);
}
`;

const TEX_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos; // device px
layout(location = 1) in vec2 a_uv;  // 0..1, top-left origin, matches the existing photo/tile contract
layout(location = 2) in float a_alpha;
uniform vec2 u_canvas;
out vec2 v_uv;
out float v_alpha;
void main() {
  gl_Position = vec4(a_pos.x / u_canvas.x * 2.0 - 1.0, 1.0 - a_pos.y / u_canvas.y * 2.0, 0.0, 1.0);
  v_uv = a_uv;
  v_alpha = a_alpha;
}
`;

// Straight-alpha source, premultiplied output: identical contract to webgl2.ts's PHOTO_FRAG. A fully
// transparent source texel (e.g. outside the figure's tight matte) never paints as if it were opaque.
// u_tint (default 1,1,1, set per batch) multiplies the REAL sampled rgb per channel -- a true channel
// split of the actual pixels (postFormationOverlay.ts's ConstructionPatch.channel), not a flat colour;
// alpha is untouched by it.
const TEX_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
in float v_alpha;
uniform sampler2D u_tex;
uniform vec3 u_tint;
out vec4 o_color;
void main() {
  vec4 c = texture(u_tex, v_uv);
  float a = c.a * clamp(v_alpha, 0.0, 1.0);
  if (a <= 0.0005) discard;
  o_color = vec4(c.rgb * u_tint * a, a);
}
`;

export interface ConstructionTextures {
  background: WebGLTexture | null;
  foreground: WebGLTexture | null;
  figure: WebGLTexture | null;
  tiles: WebGLTexture | null;
}

export interface ConstructionGLResources {
  flatProgram: WebGLProgram;
  flatVao: WebGLVertexArrayObject;
  flatVbo: WebGLBuffer;
  flatCapacity: number; // floats currently backing the GPU buffer
  texProgram: WebGLProgram;
  texVao: WebGLVertexArrayObject;
  texVbo: WebGLBuffer;
  texCapacity: number;
  u: {
    flatCanvas: WebGLUniformLocation | null;
    texCanvas: WebGLUniformLocation | null;
    texTex: WebGLUniformLocation | null;
    texTint: WebGLUniformLocation | null;
  };
}

/** CPU-side scratch the caller owns and reuses across frames (grown here on demand, never per steady-state frame once large enough). */
export interface ConstructionScratch {
  flat: Float32Array;
  tex: Float32Array;
}

export function createConstructionScratch(): ConstructionScratch {
  return { flat: new Float32Array(0), tex: new Float32Array(0) };
}

export function createConstructionResources(gl: WebGL2RenderingContext): ConstructionGLResources {
  const flatProgram = linkProgram(gl, FLAT_VERT, FLAT_FRAG, 'construction-flat');
  const texProgram = linkProgram(gl, TEX_VERT, TEX_FRAG, 'construction-texture');
  const flatVbo = gl.createBuffer();
  const texVbo = gl.createBuffer();
  const flatVao = gl.createVertexArray();
  const texVao = gl.createVertexArray();
  if (!flatVbo || !texVbo || !flatVao || !texVao) throw new Error('could not allocate construction GL objects');

  gl.bindVertexArray(flatVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, flatVbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, FLAT_FLOATS_PER_VERTEX * 4, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FLAT_FLOATS_PER_VERTEX * 4, 8);

  gl.bindVertexArray(texVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, texVbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, TEX_FLOATS_PER_VERTEX * 4, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, TEX_FLOATS_PER_VERTEX * 4, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, TEX_FLOATS_PER_VERTEX * 4, 16);
  gl.bindVertexArray(null);

  return {
    flatProgram,
    flatVao,
    flatVbo,
    flatCapacity: 0,
    texProgram,
    texVao,
    texVbo,
    texCapacity: 0,
    u: {
      flatCanvas: gl.getUniformLocation(flatProgram, 'u_canvas'),
      texCanvas: gl.getUniformLocation(texProgram, 'u_canvas'),
      texTex: gl.getUniformLocation(texProgram, 'u_tex'),
      texTint: gl.getUniformLocation(texProgram, 'u_tint'),
    },
  };
}

export function disposeConstructionResources(gl: WebGL2RenderingContext, res: ConstructionGLResources): void {
  gl.deleteBuffer(res.flatVbo);
  gl.deleteBuffer(res.texVbo);
  gl.deleteVertexArray(res.flatVao);
  gl.deleteVertexArray(res.texVao);
  gl.deleteProgram(res.flatProgram);
  gl.deleteProgram(res.texProgram);
}

function ensureFlatBuffer(gl: WebGL2RenderingContext, res: ConstructionGLResources, floats: number) {
  if (res.flatCapacity < floats) {
    gl.bindBuffer(gl.ARRAY_BUFFER, res.flatVbo);
    gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
    res.flatCapacity = floats;
  }
}

function ensureTexBuffer(gl: WebGL2RenderingContext, res: ConstructionGLResources, floats: number) {
  if (res.texCapacity < floats) {
    gl.bindBuffer(gl.ARRAY_BUFFER, res.texVbo);
    gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
    res.texCapacity = floats;
  }
}

/** Vertices appendStroke will actually emit for `cmd` (used to pre-size the CPU/GPU buffers once, before any writes). */
function strokeVertexCount(cmd: ConstructionStroke): number {
  const pts = cmd.points.length;
  if (pts === 0) return 0;
  const segments = Math.max(0, pts - 1);
  return segments * 6 + pts * STROKE_CAP_SEGMENTS * 3;
}

/**
 * Draws one construction plan's commands in painter order. `textures` must already hold the four
 * photo-layer bitmaps the caller uploads for its own (non-construction) photo pass — construction patches
 * reference the SAME already-loaded textures, never a new fetch. Safe to call with an empty plan (no-op).
 */
export function drawConstructionPlan(
  gl: WebGL2RenderingContext,
  res: ConstructionGLResources,
  scratch: ConstructionScratch,
  plan: ConstructionPlan,
  frame: FrameRect,
  canvasW: number,
  canvasH: number,
  textures: ConstructionTextures,
): void {
  const commands = plan.commands;
  if (commands.length === 0) return;
  const sizeScale = frame.height / 1080;

  let flatFloatsTotal = 0;
  let texFloatsTotal = 0;
  for (const cmd of commands) {
    if (cmd.kind === 'texture') texFloatsTotal += 3 * TEX_FLOATS_PER_VERTEX;
    else if (cmd.kind === 'stroke') flatFloatsTotal += strokeVertexCount(cmd) * FLAT_FLOATS_PER_VERTEX;
    else if (cmd.kind === 'disc') flatFloatsTotal += DISC_SEGMENTS * 3 * FLAT_FLOATS_PER_VERTEX;
    else flatFloatsTotal += 3 * FLAT_FLOATS_PER_VERTEX; // solid
  }
  if (flatFloatsTotal === 0 && texFloatsTotal === 0) return;
  if (scratch.flat.length < flatFloatsTotal) scratch.flat = new Float32Array(flatFloatsTotal);
  if (scratch.tex.length < texFloatsTotal) scratch.tex = new Float32Array(texFloatsTotal);
  if (flatFloatsTotal > 0) ensureFlatBuffer(gl, res, flatFloatsTotal);
  if (texFloatsTotal > 0) ensureTexBuffer(gl, res, texFloatsTotal);

  let flatLen = 0;
  let texLen = 0;
  let texKey: ConstructionTexture | null = null;
  let texChannel: ConstructionChannel | undefined;

  const pushFlat = (x: number, y: number, c: Rgb, a: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const f = scratch.flat;
    f[flatLen] = x;
    f[flatLen + 1] = y;
    f[flatLen + 2] = c[0];
    f[flatLen + 3] = c[1];
    f[flatLen + 4] = c[2];
    f[flatLen + 5] = a;
    flatLen += FLAT_FLOATS_PER_VERTEX;
  };
  const pushTex = (x: number, y: number, u: number, v: number, a: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const t = scratch.tex;
    t[texLen] = x;
    t[texLen + 1] = y;
    t[texLen + 2] = u;
    t[texLen + 3] = v;
    t[texLen + 4] = a;
    texLen += TEX_FLOATS_PER_VERTEX;
  };

  const flushFlat = () => {
    if (flatLen === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, res.flatVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, scratch.flat, 0, flatLen);
    gl.useProgram(res.flatProgram);
    gl.bindVertexArray(res.flatVao);
    gl.uniform2f(res.u.flatCanvas, canvasW, canvasH);
    gl.drawArrays(gl.TRIANGLES, 0, flatLen / FLAT_FLOATS_PER_VERTEX);
    flatLen = 0;
  };
  const flushTex = () => {
    if (texLen === 0) return;
    const tex = texKey ? textures[texKey] : null;
    if (tex) {
      gl.bindBuffer(gl.ARRAY_BUFFER, res.texVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, scratch.tex, 0, texLen);
      gl.useProgram(res.texProgram);
      gl.bindVertexArray(res.texVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(res.u.texTex, 0);
      gl.uniform2f(res.u.texCanvas, canvasW, canvasH);
      const [tr, tg, tb] = channelTint(texChannel);
      gl.uniform3f(res.u.texTint, tr, tg, tb);
      gl.drawArrays(gl.TRIANGLES, 0, texLen / TEX_FLOATS_PER_VERTEX);
    }
    // If the texture is not yet bound (should not happen: construction only runs once the caller's
    // assets.ready gate is true), the run is silently dropped rather than drawn as a wrong/garbage bind.
    texLen = 0;
  };

  const appendFan = (cx: number, cy: number, r: number, segments: number, colour: Rgb, alpha: number) => {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      pushFlat(cx, cy, colour, alpha);
      pushFlat(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, colour, alpha);
      pushFlat(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, colour, alpha);
    }
  };

  const appendStroke = (cmd: ConstructionStroke) => {
    const pts = cmd.points;
    if (pts.length === 0) return;
    const halfW = (cmd.widthPx * sizeScale) / 2;
    if (!(halfW > 0)) return;
    const dev: Array<[number, number]> = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      dev[i] = [frame.left + p[0] * frame.width, frame.top + p[1] * frame.height];
    }
    for (let i = 0; i < dev.length - 1; i++) {
      const [x0, y0] = dev[i]!;
      const [x1, y1] = dev[i + 1]!;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = (-dy / len) * halfW;
      const ny = (dx / len) * halfW;
      // Two triangles forming the segment quad (x0+n, x0-n, x1+n) and (x0-n, x1-n, x1+n).
      pushFlat(x0 + nx, y0 + ny, cmd.colour, cmd.alpha);
      pushFlat(x0 - nx, y0 - ny, cmd.colour, cmd.alpha);
      pushFlat(x1 + nx, y1 + ny, cmd.colour, cmd.alpha);
      pushFlat(x0 - nx, y0 - ny, cmd.colour, cmd.alpha);
      pushFlat(x1 - nx, y1 - ny, cmd.colour, cmd.alpha);
      pushFlat(x1 + nx, y1 + ny, cmd.colour, cmd.alpha);
    }
    // Round caps at every authored point (not just the ends): closes segment-join gaps on curved paths
    // and reads as the inspected references' bead/joint-node tips, including the growing tip itself
    // (the path's own last point), without any extra "tip" draw call.
    for (let i = 0; i < dev.length; i++) {
      appendFan(dev[i]![0], dev[i]![1], halfW, STROKE_CAP_SEGMENTS, cmd.colour, cmd.alpha);
    }
  };

  const appendDisc = (cmd: ConstructionDisc) => {
    const r = cmd.radiusPx * sizeScale;
    if (!(r > 0)) return;
    const cx = frame.left + cmd.center[0] * frame.width;
    const cy = frame.top + cmd.center[1] * frame.height;
    appendFan(cx, cy, r, DISC_SEGMENTS, cmd.colour, cmd.alpha);
  };

  const appendSolid = (cmd: ConstructionSolid) => {
    for (const p of cmd.points) {
      pushFlat(frame.left + p[0] * frame.width, frame.top + p[1] * frame.height, cmd.colour, cmd.alpha);
    }
  };

  const appendPatch = (cmd: Extract<ConstructionCommand, { kind: 'texture' }>) => {
    for (const v of cmd.vertices) {
      pushTex(frame.left + v.x * frame.width, frame.top + v.y * frame.height, v.u, v.v, cmd.alpha);
    }
  };

  let mode: 'flat' | 'tex' | null = null;
  for (const cmd of commands) {
    if (cmd.kind === 'texture') {
      if (mode !== 'tex' || texKey !== cmd.texture || texChannel !== cmd.channel) {
        flushFlat();
        flushTex();
        mode = 'tex';
        texKey = cmd.texture;
        texChannel = cmd.channel;
      }
      appendPatch(cmd);
    } else {
      if (mode !== 'flat') {
        flushTex();
        mode = 'flat';
        texKey = null;
        texChannel = undefined;
      }
      if (cmd.kind === 'stroke') appendStroke(cmd);
      else if (cmd.kind === 'disc') appendDisc(cmd);
      else appendSolid(cmd);
    }
  }
  flushFlat();
  flushTex();
}

/**
 * Truthful "tiles actually drawn this frame" count for RendererStats.photoTiles while construction is
 * active: distinct tile identities among the plan's own `texture:'tiles'` commands (an authored tile may
 * be covered by several commands — strand/solid scaffolding plus its own texture patch — so this counts
 * unique `tile:<manifest-id>` prefixes, not raw command counts). Matches the `tile:<manifest-id>:...` id
 * convention documented in IMPLEMENTATION_CONTRACT.md; a planner using a different scheme would simply
 * undercount here rather than throw, which is disclosed in the implementing pass's report.
 */
export function constructionTileShownCount(plan: ConstructionPlan): number {
  const seen = new Set<string>();
  for (const cmd of plan.commands) {
    if (cmd.kind === 'texture' && cmd.texture === 'tiles' && cmd.id.startsWith('tile:')) {
      const parts = cmd.id.split(':');
      seen.add(parts.length >= 2 ? `${parts[0]}:${parts[1]}` : cmd.id);
    }
  }
  return seen.size;
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
