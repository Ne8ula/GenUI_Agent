import {
  BufferAttribute, BufferGeometry, CustomBlending, AddEquation, DataTexture, DynamicDrawUsage, GLSL3, Group, LineSegments,
  NearestFilter, OneFactor, OneMinusSrcAlphaFactor, Points, RedFormat, ShaderMaterial, Vector2, Vector4, type IUniform,
} from 'three';

// The eye's tracking marks, after blob-tracking read-outs: thin 1 px boxes locked to pieces of the eye, each with a small block of
// numerals beside it. Drawn by the GPU in screen pixels from boxes given in the eye's own frame, so they stay crisp and pixel-snapped
// at any distance, and they live under the eye's object (on top of the room in every layered draw). The numerals come from the
// caller; this file only draws digits, signs, points, spaces and the phase squares ('#' filled, 'o' hollow).

export const BOX_SLOTS = 5;
const MAX_GLYPHS = 320;

// 5 x 7 pixel figures, one string of rows each.
const FONT: Record<string, string> = {
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110',
  '2': '01110100010000100010001000100011111', '3': '11110000010000101110000010000111110',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000',
  '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100',
  '+': '00000001000010011111001000010000000', '-': '00000000000000011111000000000000000',
  '.': '00000000000000000000000000110001100', ' ': '00000000000000000000000000000000000',
  '#': '00000111111111111111111111111100000', 'o': '00000111111000110001100011111100000',
};
const GLYPHS = Object.keys(FONT);

function fontTexture(): DataTexture {
  const data = new Uint8Array(GLYPHS.length * 8 * 8);
  GLYPHS.forEach((glyph, g) => {
    const rows = FONT[glyph]!;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) data[y * GLYPHS.length * 8 + g * 8 + x] = rows[y * 5 + x] === '1' ? 255 : 0;
  });
  const texture = new DataTexture(data, GLYPHS.length * 8, 8, RedFormat);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

// The box of slot b in window pixels, from its corners in the eye's frame; integer edges. False if it is behind the viewer.
const BOX_GLSL = /* glsl */ `
uniform vec4 uBox[${BOX_SLOTS}];
uniform vec4 uHome[${BOX_SLOTS}];     // xy: where the piece came from; z: draw the line to it; w: the box's opacity
uniform vec2 uRes;
vec2 px(vec2 local, inout bool ok) {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(local, 0.0, 1.0);
  ok = ok && c.w > 0.02;
  return (c.xy / max(c.w, 1e-4) * 0.5 + 0.5) * uRes;
}
bool screenBox(int b, out vec2 lo, out vec2 hi) {
  vec4 r = uBox[b]; bool ok = uHome[b].w > 0.0;
  vec2 a = px(r.xy, ok), c = px(r.zw, ok), d = px(r.xw, ok), e = px(r.zy, ok);
  lo = floor(min(min(a, c), min(d, e))) - 2.0;
  hi = floor(max(max(a, c), max(d, e))) + 2.0;
  hi = max(hi, lo + 5.0);
  return ok;
}
vec4 offscreen() { return vec4(2.0, 2.0, 2.0, 1.0); }
vec4 at(vec2 p) { return vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0); }
`;

const LINES_VS = /* glsl */ `
${BOX_GLSL}
uniform float uShadow;
out float vA;
void main() {
  int b = int(position.x), k = int(position.y);
  vec2 lo, hi;
  vA = uHome[b].w;
  if (!screenBox(b, lo, hi) || (k >= 8 && uHome[b].z <= 0.0)) { gl_Position = offscreen(); return; }
  // pixel centres, so every edge is exactly one pixel wide
  lo += 0.5; hi += 0.5;
  vec2 p = k == 0 || k == 7 ? lo : k == 1 || k == 2 ? vec2(hi.x, lo.y) : k == 3 || k == 4 ? hi : k == 5 || k == 6 ? vec2(lo.x, hi.y)
    : k == 8 ? floor((lo + hi) * 0.5) + 0.5 : vec2(0.0);
  if (k == 9) { bool ok = true; p = floor(px(uHome[b].xy, ok)) + 0.5; if (!ok) { gl_Position = offscreen(); return; } }
  // the shadow copy sits one pixel down and right, so a mark still reads in front of a bright room
  gl_Position = at(p + uShadow * vec2(1.0, -1.0));
}`;

const MARK_FS = /* glsl */ `
precision highp float;
uniform vec3 uColor; uniform float uShadow;
in float vA; out vec4 o;
void main() { o = vec4(uColor * (1.0 - uShadow) * vA, vA * (1.0 - 0.3 * uShadow)); }`;

const GLYPHS_VS = /* glsl */ `
${BOX_GLSL}
uniform float uScale;
in float aGlyph;    // glyph + 64 * the line's length
out float vA; flat out int vGlyph;
void main() {
  int b = int(position.x);
  vec2 lo, hi;
  vA = uHome[b].w;
  if (!screenBox(b, lo, hi)) { gl_Position = offscreen(); return; }
  float s = uScale, adv = 6.0 * s, len = floor(aGlyph / 64.0);
  vGlyph = int(mod(aGlyph, 64.0));
  // a right-aligned block to the left of the box, from its top; to its right if there is no room on the left
  float right = lo.x - 3.0 * s;
  float left = right - (position.z + 1.0) * adv;
  if (right - 9.0 * adv < 0.0) left = hi.x + 4.0 * s + (len - 1.0 - position.z) * adv;
  vec2 corner = vec2(left, hi.y - position.y * 9.0 * s);
  gl_PointSize = 8.0 * s;
  gl_Position = at(floor(corner) + vec2(4.0 * s, -4.0 * s));
}`;

const GLYPHS_FS = /* glsl */ `
precision highp float; precision highp int;
uniform vec3 uColor; uniform sampler2D uFont;
in float vA; flat in int vGlyph; out vec4 o;
void main() {
  ivec2 t = ivec2(min(gl_PointCoord * 8.0, vec2(7.0)));
  if (texelFetch(uFont, ivec2(vGlyph * 8 + t.x, t.y), 0).r > 0.5) { o = vec4(uColor * vA, vA); return; }
  // each figure casts a one-dot shadow down and right, so it still reads in front of a bright room
  if (t.x > 0 && t.y > 0 && texelFetch(uFont, ivec2(vGlyph * 8 + t.x - 1, t.y - 1), 0).r > 0.5) { o = vec4(0.0, 0.0, 0.0, 0.7 * vA); return; }
  discard;
}`;

export interface EyeMarks {
  readonly object: Group;
  /** A box in the eye's frame (x0, y0, x1, y1), the home its piece came from (or null for no line to it), and its opacity; null hides it. */
  setBox(slot: number, rect: readonly [number, number, number, number] | null, home?: readonly [number, number] | null, alpha?: number): void;
  /** The numerals beside a box, one string per row. */
  setText(slot: number, lines: readonly string[]): void;
  dispose(): void;
}

export function createEyeMarks(): EyeMarks {
  const font = fontTexture();
  const u: Record<string, IUniform> = {
    uBox: { value: Array.from({ length: BOX_SLOTS }, () => new Vector4()) },
    uHome: { value: Array.from({ length: BOX_SLOTS }, () => new Vector4()) },
    uRes: { value: new Vector2(1, 1) }, uScale: { value: 2 }, uColor: { value: [0.92, 0.92, 0.92] }, uFont: { value: font },
  };
  const blend = {
    glslVersion: GLSL3, uniforms: u, transparent: true, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
  } as const;

  // Ten vertices a box: four edges, and a line from its centre back to where the piece came from.
  const lineIds = new Float32Array(BOX_SLOTS * 10 * 3);
  for (let b = 0; b < BOX_SLOTS; b++) for (let k = 0; k < 10; k++) lineIds.set([b, k, 0], (b * 10 + k) * 3);
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new BufferAttribute(lineIds, 3));
  const lineMaterial = new ShaderMaterial({ ...blend, uniforms: { ...u, uShadow: { value: 0 } }, vertexShader: LINES_VS, fragmentShader: MARK_FS });
  const shadowMaterial = new ShaderMaterial({ ...blend, uniforms: { ...u, uShadow: { value: 1 } }, vertexShader: LINES_VS, fragmentShader: MARK_FS });
  const shadows = new LineSegments(lineGeometry, shadowMaterial);
  const lines = new LineSegments(lineGeometry, lineMaterial);

  const glyphIds = new Float32Array(MAX_GLYPHS * 3), glyphCodes = new Float32Array(MAX_GLYPHS);
  const glyphGeometry = new BufferGeometry();
  glyphGeometry.setAttribute('position', new BufferAttribute(glyphIds, 3).setUsage(DynamicDrawUsage));
  glyphGeometry.setAttribute('aGlyph', new BufferAttribute(glyphCodes, 1).setUsage(DynamicDrawUsage));
  glyphGeometry.setDrawRange(0, 0);
  const glyphMaterial = new ShaderMaterial({ ...blend, vertexShader: GLYPHS_VS, fragmentShader: GLYPHS_FS });
  const glyphs = new Points(glyphGeometry, glyphMaterial);

  const object = new Group();
  for (const [i, part] of [shadows, lines, glyphs].entries()) {
    part.frustumCulled = false;
    part.renderOrder = 11 + i;
    object.add(part);
  }
  const buffer = new Vector2();
  shadows.onBeforeRender = renderer => {
    renderer.getDrawingBufferSize(buffer);
    (u.uRes!.value as Vector2).copy(buffer);
    // 5 x 7 figures two pixels to a dot at 1440 lines: small, like a read-out, but legible on the wall
    u.uScale!.value = Math.max(1, Math.round(buffer.y / 720));
  };

  const texts: (readonly string[])[] = Array.from({ length: BOX_SLOTS }, () => []);
  const rebuild = () => {
    let n = 0;
    texts.forEach((rows, b) => rows.forEach((row, line) => {
      for (let i = 0; i < row.length && n < MAX_GLYPHS; i++) {
        const g = GLYPHS.indexOf(row[row.length - 1 - i]!);
        if (g < 0) continue;
        glyphIds.set([b, line, i], n * 3);
        glyphCodes[n++] = g + 64 * row.length;
      }
    }));
    glyphGeometry.attributes.position!.needsUpdate = true;
    glyphGeometry.attributes.aGlyph!.needsUpdate = true;
    glyphGeometry.setDrawRange(0, n);
  };

  return {
    object,
    setBox(slot, rect, home = null, alpha = 1) {
      const box = (u.uBox!.value as Vector4[])[slot]!, h = (u.uHome!.value as Vector4[])[slot]!;
      if (!rect) { h.w = 0; return; }
      box.set(rect[0], rect[1], rect[2], rect[3]);
      h.set(home?.[0] ?? 0, home?.[1] ?? 0, home ? 1 : 0, alpha);
    },
    setText(slot, rows) {
      const old = texts[slot]!;
      if (old.length === rows.length && old.every((row, i) => row === rows[i])) return;
      texts[slot] = rows;
      rebuild();
    },
    dispose() {
      lineGeometry.dispose();
      lineMaterial.dispose();
      shadowMaterial.dispose();
      glyphGeometry.dispose();
      glyphMaterial.dispose();
      font.dispose();
    },
  };
}
