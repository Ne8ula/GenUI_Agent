// EVA's eye as a picture coming apart, not a colony of grains. The Week 1 raster is drawn whole onto one quad facing the viewer, in
// fine rows of its own light (scan-lines, sized to the screen so they never become blocks), and then it is taken apart: every row is
// cut into brush strokes that crawl along it; where a slow wave of dispersal passes (most at the rim and the iris ring, least at the
// pupil) strokes thin to points, drop out so black shows through, and are carried outward along curling paths; bands slide on clocks
// of their own; rows run out of the rim as hairs; and the pieces eye-fits.ts tears away (sheared bands, fragments flung in any
// direction trailing tapering wisps, hanging after-images, columns dragged a long way from the lids) are drawn where they now are.
// The square pupil is drawn exactly at home, where the whole judder does not move it, so everything else can go further.

import { TEAR_SLOTS } from './eye-fits.ts';

// The eye's relief, in eye widths toward whatever it looks at: the eyeball swelling in the opening, the iris a bowl sunk into it,
// the lids standing proud round the rim (and closing over it in a blink). Lit by one key light fixed in the eye's own frame,
// from its upper left, so the form shows even seen straight on. Shared with the blocks (eye-volume.ts).
export const EYE_RELIEF = /* glsl */ `
uniform vec3 uIris;                     // iris centre xy and radius z
uniform float uLid;                     // how shut the lids are, 0..1
float relief(vec2 p) {
  float e = length((p - vec2(-0.02, 0.03)) / vec2(0.42, 0.17)), r = length(p - uIris.xy) / uIris.z;
  float bowl = max(0.0, 1.0 - r * r);
  float open = 0.26 * max(0.0, 1.0 - e * e) - 0.13 * bowl * bowl;
  return mix(open, 0.2 * exp(-e * e), uLid) + 0.28 * exp(-pow((e - 1.25) / 0.3, 2.0));
}
vec3 reliefNormal(vec2 p) {
  const vec2 d = vec2(0.006, 0.0);
  return normalize(vec3(relief(p - d.xy) - relief(p + d.xy), relief(p - d.yx) - relief(p + d.yx), 2.0 * d.x));
}
const vec3 KEY = vec3(-0.42, 0.56, 0.71);
float lit(vec3 n) { return clamp(dot(n, KEY) / KEY.z, 0.18, 1.5); }`;

// The quad is a stack of layers along the eye's axis (position.z, in eye widths), scaled by uDepth: 0 folds them into one surface.
// Every layer follows the relief; the image keeps its flat coordinates, projected onto it.
export const EYE_VS = /* glsl */ `
uniform float uDepth;
out vec2 vP; out float vLayer;
${EYE_RELIEF}
void main() {
  vP = position.xy;
  vLayer = position.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, relief(position.xy) + position.z * uDepth, 1.0);
}`;

export const EYE_FS = /* glsl */ `
precision highp float; precision highp int;
uniform sampler2D uA, uB;               // the raster, the previous and the latest
uniform float uMix;                     // how far from the previous to the latest
uniform float uTime, uOpacity, uGain, uOcclude;
uniform float uAgit;                    // restlessness 0..1: the fits
uniform float uSeethe;                  // dispersal 0..1: the constant seethe, raised by the fits
uniform float uSeed;                    // the band layout, re-rolled with each fit
uniform float uLines;                   // scan-lines per half eye width (the eye's height)
uniform float uKeep;                    // how strongly the pupil holds at home
uniform float uDrop;                    // faltering: the share of bands that drop out
uniform float uGuard;                   // how firmly the iris and pupil hold their place, 0..1
uniform vec4 uJolt;                     // the whole eye's judder: offset xy, stretch zw
uniform vec4 uPupil;                    // square pupil: centre xy, half sizes zw, in the eye's frame
uniform float uPupilAngle;
uniform vec4 uTearR[${TEAR_SLOTS}];                 // torn pieces: home rectangle x0 y0 x1 y1
uniform vec4 uTearM[${TEAR_SLOTS}];                 // and displacement xy, mode z, live w
uniform vec4 uTearA[${TEAR_SLOTS}];                 // and how far it has turned (x), radians
uniform float uLayerStep;              // the layers' spacing in position.z
in vec2 vP; in float vLayer; out vec4 o;
${EYE_RELIEF}

uint hashu(uint x) { x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16; return x; }
float hh(int a, int b) { return float(hashu(uint(a) * 0x9e3779b9U + hashu(uint(b) + 0x632be5abU)) >> 8) * 5.9604645e-8; }
float hh(int a, int b, int c) { return hh(a, int(hashu(uint(b) * 0x85ebca6bU + uint(c)))); }
float vnoise(vec2 x) {
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  int a = int(i.x), b = int(i.y);
  return mix(mix(hh(a, b), hh(a + 1, b), f.x), mix(hh(a, b + 1), hh(a + 1, b + 1), f.x), f.y);
}
vec2 rot(vec2 d, float a) { float c = cos(a), s = sin(a); return vec2(c * d.x - s * d.y, s * d.x + c * d.y); }

vec4 eyeAt(vec2 q) {
  vec2 uv = vec2(q.x + 0.5, 0.5 - q.y * 2.0);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return mix(texture(uA, uv), texture(uB, uv), uMix);
}

// brightness and coverage of the eye at q; the rim frays row by row (rag)
vec2 tone(vec2 q, float rag) {
  vec4 tex = eyeAt(q);
  float lum = tex.r, open = tex.g, iris = tex.b;
  float v = mix(lum * lum * 0.45, lum, open);
  float limbus = length(q - uIris.xy) / uIris.z;
  v = mix(v, max(v, 0.45 + 0.5 * v), iris) * (1.0 - 0.85 * open * exp(-pow((limbus - 0.97) / 0.08, 2.0)));
  float a = mix(0.5, 1.0, open);
  // shut lids keep a line of light along their seam (Week 1's closed lid, in the eye's frame), so a blink never makes the eye vanish
  float t = clamp((2.0 * q.x + 0.77) / 1.5, 0.0, 1.0);
  float seamY = 0.5 * (0.55 * -0.22 * pow(max(sin(3.14159 * t), 0.0), 1.15) * (0.72 + 0.38 * t) - 0.15 * q.x);
  float seam = uLid * exp(-pow((q.y - seamY) / 0.014, 2.0)) * smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.92, t);
  v = max(v, 0.7 * seam);
  a = max(a, seam);
  float edge = clamp((1.0 - length(q / vec2(0.5, 0.25)) + rag) / 0.3, 0.0, 1.0);
  return vec2(v, a) * tex.a * edge;
}

float pupilAt(vec2 q, float aa) {
  vec2 d = q - uPupil.xy; float c = cos(uPupilAngle), s = sin(uPupilAngle);
  d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  return 1.0 - smoothstep(-aa, aa, max(abs(d.x) - uPupil.z, abs(d.y) - uPupil.w));
}

void main() {
  vec2 p = (vP - uJolt.xy) / uJolt.zw;
  float aa = max(fwidth(vP.x), 1e-5) * 0.7;
  int line = int(floor((p.y + 1.2) * uLines * 2.0));
  int fl = line / 2;
  int seed = int(uSeed * 65521.0);
  vec2 q = p;                       // where this pixel's light comes from
  vec2 sq = p; float sf = 0.0;      // a streak over it: its source and strength
  vec2 gq = p; float ghost = 0.0;   // an after-image
  float hole = 1.0;                 // what is left where a piece tore from
  bool carried = false;             // inside a torn piece, which carries its own part of the pupil
  int piece = -1;

  // Restless bands of uneven height, each on its own clock: some slide and hold, some slide and snap back, some stretch.
  float n = mix(9.0, 40.0, hh(seed, 1));
  float yw = p.y * n + 1.6 * sin(p.y * n * 0.37 + uSeed * 31.0);
  int band = int(floor(yw));
  float clock = uTime * (3.0 + 24.0 * hh(band, seed, 2)) + 9.0 * hh(band, 3);
  int tick = int(floor(clock));
  vec4 r = vec4(hh(band, tick, 4), hh(band, tick, 5), hh(band, tick, 6), hh(band, tick, 7));
  // every scan-line trembles sideways on its own clock
  int ltick = int(floor(uTime * (4.0 + 16.0 * hh(line, 20)) + 5.0 * hh(line, 21)));
  q.x += (hh(line, ltick, 22) - 0.5) * 0.014 * (0.25 + 2.5 * uAgit);
  if (r.x < uAgit * 0.6) {
    float amp = uAgit * (0.02 + 0.42 * r.z * r.z);
    if (r.w < 0.62) {
      q.x -= (r.y - 0.5) * 2.0 * amp * (r.z > 0.4 ? 1.0 : exp(-fract(clock) * 5.0));
    } else {
      // pixel stretch: past a tear point the band drags one column of itself out into a streak
      float xs = (r.y - 0.5) * 0.8, past = (p.x - xs) * (r.z < 0.5 ? -1.0 : 1.0);
      float len = 0.04 + 0.7 * hh(line, tick, 8) * uAgit;
      if (past > 0.0) { sq = vec2(xs, p.y); sf = exp(-past / len); hole = 1.0 - 0.6 * sf; }
    }
  }

  // Dispersal: a slow wave across the eye, strongest at the rim and the iris ring, weakest at the pupil.
  float limbus = length(p - uIris.xy) / uIris.z;
  // the rim of the open almond and the skin round it, not the lit white inside it
  float rimW = smoothstep(0.6, 1.2, length((p - vec2(-0.02, 0.03)) / vec2(0.42, 0.17)));
  float ringW = exp(-pow((limbus - 0.95) / 0.25, 2.0));
  float nearPupil = 1.0 - smoothstep(1.3, 2.6, length(p - uPupil.xy) / max(uPupil.z, 1e-3));
  // the inside of the iris holds together round the pupil; its ring comes apart
  float weight = (0.06 + rimW + 0.3 * ringW) * (1.0 - 0.92 * max(nearPupil, 1.0 - smoothstep(0.6, 0.95, limbus)));
  float wave = 0.6 * vnoise(p * vec2(4.0, 9.0) + vec2(uTime * 0.9, -uTime * 0.55) + uSeed * 17.0)
             + 0.4 * vnoise(p * vec2(11.0, 23.0) + vec2(-uTime * 1.7, uTime * 1.1));
  float D = clamp(uSeethe * weight * (2.4 * wave - 0.4), 0.0, 1.0);
  // every row is cut into strokes that crawl along it, each at its own pace
  float u = p.x * mix(18.0, 70.0, hh(line, 40)) + 9.0 * hh(line, 41) + uTime * (hh(line, 42) - 0.5) * 6.0 * (0.3 + uSeethe);
  float hs = hh(line, int(floor(u)), 43), fu = fract(u);
  // dispersed strokes are carried outward along curling paths, each its own distance
  vec2 curl = vec2(sin(p.y * 9.0 + uTime * 1.7 + wave * 6.0), cos(p.x * 6.0 - uTime * 1.3 + wave * 5.0));
  q -= (normalize(p * vec2(1.0, 2.0) + 1e-4) * 0.7 + curl * 0.5) * D * (0.02 + 0.2 * hs * hs) * (0.5 + uSeethe);

  // The rim frays: rows run out sideways as hairs of their own colour, each row on its own clock.
  int ftick = int(floor(uTime * (1.5 + 9.0 * hh(fl, 9)) + 7.0 * hh(fl, 10)));
  if (hh(fl, ftick, 11) < 0.14 + 0.6 * uAgit) {
    float ey = clamp(p.y / 0.25, -1.0, 1.0);
    float xe = 0.47 * sqrt(1.0 - ey * ey) * (0.5 + 0.45 * hh(fl, ftick, 12));
    float past = abs(p.x) - xe;
    float len = (0.03 + 0.55 * hh(line, ftick, 13)) * (0.2 + uAgit);
    float f = past > 0.0 ? exp(-past / len) : 0.0;
    if (f > sf) { sq = vec2(sign(p.x) * xe, p.y); sf = f; }
  }

  // The torn pieces, where they are now: later pieces lie over earlier ones.
  for (int i = 0; i < ${TEAR_SLOTS}; i++) {
    vec4 R = uTearR[i], M = uTearM[i];
    if (M.w <= 0.0) continue;
    int mode = int(M.z + 0.5);
    vec2 c0 = 0.5 * (R.xy + R.zw);
    vec2 h = rot(p - c0 - M.xy, -uTearA[i].x) + c0;
    bool inside = h.x >= R.x && h.x <= R.z && h.y >= R.y && h.y <= R.w;
    if (mode == 2) { if (inside) { gq = h; ghost = 0.75; } continue; }
    if (inside) { q = h; hole = 1.0; carried = true; piece = i; continue; }
    // where it tore from is left mostly empty
    if (mode != 0 && p.x >= R.x && p.x <= R.z && p.y >= R.y && p.y <= R.w) hole = min(hole, 0.15);
    float L = length(M.xy);
    if (mode == 1 && L > 0.02) {
      // a wisp from home to where it is now, tapering to a point at home and broken into strands
      vec2 dir = M.xy / L, nrm = vec2(-dir.y, dir.x), e = p - c0;
      float t = dot(e, dir) / L, s = dot(e, nrm);
      float halfW = 0.5 * (abs(nrm.x) * (R.z - R.x) + abs(nrm.y) * (R.w - R.y));
      float width = halfW * pow(clamp(t, 0.0, 1.0), 0.6);
      if (t > 0.0 && t < 1.0 && abs(s) < width) {
        float f = (0.15 + 0.85 * t * t) * step(0.3, hh(line, i, 14));
        if (f > sf) { sq = c0 + nrm * (s / max(width, 1e-4)) * halfW; sf = f; }
      }
    }
    if (mode == 3 && abs(M.y) > 1e-3 && p.x >= R.x + M.x && p.x <= R.z + M.x) {
      // a dragged column stretches its edge all the way along where it went
      float edgeY = M.y < 0.0 ? R.w : R.y, along = (p.y - edgeY) / M.y;
      if (along > 0.0 && along < 1.0) { float f = 0.3 + 0.7 * along; if (f > sf) { sq = vec2(p.x - M.x, edgeY); sf = f; } }
    }
  }

  // the iris is the anchor, with the pupil: it stays whole and at home, outside the judder, and everything tears around it
  float core = (1.0 - smoothstep(1.0, 1.4, length(vP - uIris.xy) / uIris.z)) * uGuard;
  q = mix(q, vP, core); sf *= 1.0 - core; hole = mix(hole, 1.0, core); ghost *= 1.0 - core;
  if (core > 0.5) carried = false;
  // depth: every stroke and every torn piece lives on one layer of the stack, so they slide against each other as anything moves;
  // the iris and pupil stay on the middle one
  int owner = core > 0.5 ? 2 : carried ? (piece * 3 + 1) % 5 : int(hh(line, int(floor(u)), 44) * 5.0);
  if (owner != int(floor(vLayer / uLayerStep + 2.5))) discard;

  // the rim boils: its fraying changes row by row many times a second
  float rag = (hh(fl, int(floor(uTime * (6.0 + 10.0 * hh(fl, 31)))), 18) - 0.5) * 0.2 * (0.3 + uSeethe + uAgit);
  vec2 b = tone(q, rag) * hole;
  // hairs: each row smears its light along itself, one way or the other, broken into strands; longer the wilder it is
  {
    int htick = int(floor(uTime * (2.0 + 10.0 * hh(fl, 23)) + 3.0 * hh(fl, 24)));
    float dir = hh(fl, htick, 25) < 0.5 ? -1.0 : 1.0;
    float len = (0.015 + 0.12 * hh(line, htick, 26)) * (0.3 + 2.2 * uAgit) * (1.0 - core);
    float strand = step(0.35 - 0.2 * uAgit, hh(line, int(floor(p.x * 55.0 + 17.0 * hh(line, 27))), 28));
    for (int i = 1; i <= 4; i++) {
      float s = float(i) / 4.0;
      b = max(b, tone(q - vec2(dir * len * s, 0.0), rag) * (1.0 - 0.8 * s) * strand * hole);
    }
  }
  // a streak shades the room behind it only as much as it is bright, so it never reads as a grey scratch across the room
  if (sf > 0.004) { vec2 s = tone(sq, 0.3) * sf * (0.35 + 0.65 * hh(line, 15)); b = max(b, vec2(s.x, s.y * min(1.0, 2.0 * s.x))); }
  // an after-image carries only the eye's bright parts, so it has no hard rectangle round it
  if (ghost > 0.0) { vec2 g = tone(gq, rag); g *= g.x * ghost; b = vec2(b.x + g.x * (1.0 - 0.5 * b.x), max(b.y, g.y)); }
  // porous: where the wave has passed, strokes thin to points and drop out, and the background shows through
  // (a torn piece holds together as it flies, so it reads as a piece)
  if (carried) D *= 0.3;
  b *= step(D * 0.9, hs) * mix(1.0, smoothstep(0.0, 0.25, fu) * smoothstep(1.0, 0.45, fu), min(1.0, D * 2.5));
  // scattered strands shade the room behind them only as much as they are bright, so they are not ash on a lit wall
  b.y *= mix(1.0, min(1.0, 2.0 * b.x), min(1.0, D * 2.0));
  // and even whole, the strokes seethe: each its own brightness, crawling along its row
  b.x *= mix(1.0, 0.5 + 0.5 * hs, min(0.55, uSeethe * 1.2) * (1.0 - core));
  if (hh(line, int(floor(p.x * 24.0 + 9.0 * hh(line, 29))), int(floor(uTime * 7.0 + 3.0 * hh(fl, 30)))) < 0.03 + 0.3 * uAgit * uAgit) b.x *= 0.15;

  // the square pupil, exact and at home, outside the judder; a torn piece carries its own part of it as well; only where the lids are open
  float pupil = pupilAt(vP, aa) * uKeep * eyeAt(vP).g;
  if (carried) pupil = max(pupil, 0.6 * pupilAt(q, aa) * eyeAt(q).g);
  b.x *= 1.0 - pupil;
  b.y = max(b.y, pupil);

  // scan-lines: the eye is drawn in fine rows, each its own brightness, every third one dim
  b.x *= (0.8 + 0.2 * hh(line, 16)) * (line % 3 == 2 ? 0.5 : 1.0);
  // faltering: whole bands drop out for a moment
  if (uDrop > 0.0 && hh(band, int(floor(uTime * 4.0 + 5.0 * hh(band, 17))), 19) < uDrop) b *= 0.1;

  // the key light models the relief: the lids' upper slopes and the far wall of the iris bowl catch it, what turns away falls dark
  float c = min(1.0, b.x * uGain * uOpacity * lit(reliefNormal(vP)));
  float a = uOcclude * uOpacity * b.y;
  if (c < 0.002 && a < 0.002) discard;
  o = vec4(vec3(1.0, 0.23, 0.2) * c, a);
}`;
