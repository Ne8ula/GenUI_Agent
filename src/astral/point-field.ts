// Point-field look adapted from Gather 聚 and Wake 森 by DAO (be-of-dao.com), used under the Patreon Source licence.
import {
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, GLSL3, Group, LineSegments, NoBlending, OneFactor,
  OneMinusSrcColorFactor, Points, ShaderMaterial, Vector2, Vector3,
  type IUniform,
} from 'three';
import { hasLook } from './looks.ts';
import {
  dealOrigins, dealSteps, finish, groupPoints, orderByKeySteps, slabKeySteps, tunnelOrder, tunnelOriginKeys, type Groups, type Steps, type TunnelOrder,
} from './ribbons.ts';
import { ASTRAL_EFFECTS, TUNNEL, type AstralEffect, type AstralLight, type PointCloud, type PointField } from './types.ts';

const POINT_METRES = 0.003;       // a tunnel grain's size; on screen it shrinks with distance and, below a pixel, dims instead
const GRAIN_OF_SPACING = 0.6; // a room grain's side as a share of the sampling spacing: about a third of a surface is lit, from any distance, black between
const ROOM_GAIN = 1.0;          // a lit room's grains carry their own lit colour (ROOM_EXPOSURE sets how bright); black shows between them
const ROOM_EXPOSURE = 2.4;
const FLIGHT_SECONDS = 3.2;       // one kick: thrown, hangs, gathers into the next cloud
const ARRIVAL_SECONDS = 12;       // tunnel -> room, at the latest; the spiral lets go where the viewer passes it
const SPLASH_SECONDS = 0.03;      // Gather's SPLASH at 0.7: the throw is a snap
const TAIL_SECONDS = 0.26;        // how far back in time a streak's tail reaches (Gather's uTail)
const STREAK_STRIDE = 397;        // one grain in this many leaves a streak
const SLABS = 64;                 // the deal's slabs along a cloud: each slab of the tunnel lays itself down as one slab of the room
const JOB_MS = 6;                 // the share of a frame that preparing a new cloud may take
// shortcut: heroes past this count are never highlighted; raise it if a room ever lists more
const MAX_HEROES = 8;
const SOLID_EASE = 0.35;          // seconds per e-fold: a settled lit room dissolves into, or out of, the solid pass in about a second
const INSPECT_EASE = 0.18;       // seconds per e-fold: an inspection is in, or gone, in about half a second
// The 'ribbons' look (?look=ribbons): the arrival and the kick fly along a few shared curves, drawn as strands of 1 px lines.
const RIBBONS = hasLook('ribbons');
const RIB_K = 12;                 // bundles: one per group of the room
const RIB_PER_BAND = 3;           // arriving, the tunnel is cut into bands along its length, this many bundles to a band
const RIB_STRIDE = 811;           // one grain in this many is drawn as a strand: about 380 strands to a bundle in the recorded room
const RIB_VERTS = 24;             // vertices per strand
const RIB_LEN = 0.4;              // a strand's length, as a share of its path
const RIB_KICK_SECONDS = 6;       // a kick on ribbons is a slower gesture than the throw
const FX = ASTRAL_EFFECTS.filter((e): e is Exclude<AstralEffect, 'calm'> => e !== 'calm');

// Lighting. Colours are linear; strengths ease toward each mood's targets.
// shortcut: lights past these counts are ignored; raise them if a room ever has more fittings.
const MAX_CEILING = 32, MAX_LAMPS = 4;
const CEILING_COLOR = [0.84, 0.95, 0.66];   // fluorescent, a little green-yellow
const LAMP_COLOR = [1.0, 0.62, 0.30];       // a warm incandescent bulb
const LIGHT_EASE = 0.6;                     // seconds per e-fold: a change is in within about two seconds
const CEILING_R = 1.2, CEILING_DROP = 0.15; // fittings light like soft downlights, from just below the ceiling
const CEILING_AT_FLOOR = 0.5;             // the fittings' share of the light in the middle of the floor; the rest is the even ambient
type Mood = 'liminal' | 'afternoon' | 'night' | 'dark';
const MOODS: Record<Mood, { amb: number[]; ceiling: number; sun: number[]; sunDir: number[] }> = {
  // mostly flat, shadowless light, tinted like the tubes; the fittings add soft pools
  liminal: { amb: [0.56, 0.61, 0.50], ceiling: 1, sun: [0, 0, 0], sunDir: [-0.85, 0.38, 0.36] },
  // low and warm from the -x side, washing across; no window, so the light simply comes from that side
  afternoon: { amb: [0.10, 0.075, 0.055], ceiling: 0, sun: [2.1, 1.25, 0.6], sunDir: [-0.85, 0.38, 0.36] },
  night: { amb: [0.022, 0.028, 0.05], ceiling: 0, sun: [0.05, 0.075, 0.15], sunDir: [0.5, 0.7, -0.5] },
  dark: { amb: [0, 0, 0], ceiling: 0, sun: [0, 0, 0], sunDir: [0.5, 0.7, -0.5] },
};

// A room whose colours already hold its own light (PointCloud.lit): each mood as a multiplier on those colours, liminal leaving them as
// they are. The sun (MOODS) adds afternoon's side wash on top, scaled by BAKED_SUN; lamps and the eye add their own light as usual.
const BAKED_GAIN: Record<Mood, number[]> = {
  liminal: [1, 1, 1],
  afternoon: [0.5, 0.4, 0.3],     // the ceiling's light gone, warmer, the side light carries it
  night: [0.13, 0.15, 0.24],      // dim and cool
  dark: [0, 0, 0],                // only the eye's red shows the room
};

/** The lighting as EVA has left it. */
export interface LightingState { readonly mood: Mood; readonly lamp: boolean }
export const LIGHTING_START: LightingState = Object.freeze({ mood: 'liminal', lamp: true });
/** One lighting change. Moods leave the lamps as they are, except dark, which turns everything off. */
export function nextLighting(state: LightingState, light: AstralLight): LightingState {
  switch (light) {
    case 'liminal': case 'afternoon': case 'night': return { mood: light, lamp: state.lamp };
    case 'dark': return { mood: 'dark', lamp: false };
    case 'lamp_on': return { mood: state.mood, lamp: true };
    case 'lamp_off': return { mood: state.mood, lamp: false };
    default: return state;
  }
}

// the arrival tunnel: a floor that rolls up into a log-spiral sheet, twisting along the axis
const TUNNEL_RADIUS = 5.5;       // outer turn; the sheets wind in to about 0.37 of this (2 m), leaving the dark opening
const TUNNEL_END = 5;             // where the spiral stops, just in front of the room
const TUNNEL_TWIST = Math.PI * 2 / 16;   // radians per metre along the axis
const TUNNEL_POINTS = 2_000_000;
const tunnels = new WeakSet<PointCloud>();

const COMMON = /* glsl */ `
precision highp float; precision highp int;
#define PI 3.14159265
uniform float uTime, uTail, uFlight, uFlightTail, uForm, uFormTail, uTunnelTo, uTunnelFrom;
uniform vec4 uMo;                       // seed, how long the gathering waits, how fast the splash opens (0: no splash)
uniform vec3 uCenter, uHalf; uniform float uScale, uFloor;
uniform vec4 uDust;                     // the void's centre and reach
uniform float uSize, uFocal, uMaxPx, uPx, uFog, uStreak;
uniform vec2 uGain, uWsz;               // the last cloud's and this cloud's; each grain takes its own share as it flies
uniform float uViewZ;                   // the viewer's z, for the tunnel's release
uniform vec2 uZr;                       // arriving: the room's far and near z, for the order it is laid down in
uniform vec3 uHeroMin[MAX_HERO], uHeroMax[MAX_HERO];   // the room's heroes as boxes; a grain whose home is inside one is that hero
uniform float uHeroW[MAX_HERO]; uniform int uHeroN;    // how far each is being inspected (eased 0..1)
uniform float uHeroD;                                  // the strongest of them: how far the rest of the room steps back
uniform float uBreath, uDeep, uVoice;
uniform vec4 uFxA;                      // breathe, melt, scatter, weightless (eased 0..1)
uniform vec2 uFxB;                      // smear, vortex
uniform vec3 uTrail, uEye, uLook;   // uEye/uLook: the viewer, smoothed, for the vortex's axis
// lighting: 1 when this cloud is a room with normals. Ambient, the ceiling fittings, the lamps, one directional light, the eye.
uniform float uLit, uCeilNorm;
uniform vec3 uAmb, uCeilCol, uLampCol, uSunCol, uSunDir;
uniform vec4 uCeil[MAX_CEIL]; uniform int uCeilN;     // xyz centre, w strength 0..1
uniform vec4 uLampL[MAX_LAMP]; uniform int uLampN;
uniform vec4 uEyeL;                                  // xyz, glow
uniform float uSolid;                   // how far a settled lit room has handed over to the solid (depth-tested) pass, 0..1
uniform float uBaked, uCeilOn; uniform vec3 uBakeGain;  // a room whose colours hold its own light: the mood as a multiplier on them
in vec3 aFrom; in vec3 aCol; in vec3 aFromCol; in float aId; in vec3 aNorm;
#if defined(STREAK) || defined(RLINE)
in float aTail;
#endif
uniform float uOrdered;                 // 1: the room's grains sit in ordered rows; slanted surfaces dim instead of thinning
out vec3 vCol;

uint hashu(uint x) { x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16; return x; }
float h01(uint x) { return float(hashu(x) >> 8) * 5.9604645e-8; }
float ease(float s) { return s * s * s * (s * (s * 6.0 - 15.0) + 10.0); }
vec3 flow(vec3 q, float t) {
  return 0.5 * vec3(sin(q.y * 2.3 + t) + sin(q.z * 3.1 - t * 0.7 + q.x), sin(q.x * 2.7 - t * 0.8) + sin(q.z * 2.9 + t * 0.6 + q.y), sin(q.x * 3.3 + t * 0.5) + sin(q.y * 3.7 - t));
}
vec2 rot(vec2 d, float a) { float c = cos(a), s = sin(a); return vec2(c * d.x - s * d.y, s * d.x + c * d.y); }
vec3 rotY(vec3 d, float a) { vec2 r = rot(d.xz, -a); return vec3(r.x, d.y, r.y); }

#ifdef RIBBONS
// The 'ribbons' look: each group of the room is one bundle. Its grains were dealt origins that keep their order (ribbons.ts), so they
// leave together from one patch, gather onto the bundle's shared curve into a tight bundle, and open onto their own homes.
uniform float uRibOn, uRibLine;                                // 1 while this flight runs on ribbons; the strands' brightness
uniform vec3 uRibD[RK], uRibO[RK], uRibP[RK], uRibQ[RK], uRibW[RK];   // group centre; the curve: origin patch, two controls, the gathering point
uniform float uRibT[RK];                                       // in a kick, when each bundle leaves (share of the flight)
in vec3 aFromNorm;                                             // in a kick, the old room's normal where the grain starts
float ribLag = 0.0, ribS = 0.0, ribG = 0.0, ribA = 0.0;        // a strand vertex's lag along the path; where it is on it; how gathered; in the air
vec3 bez(vec3 a, vec3 p, vec3 q, vec3 b, float s) { float t = 1.0 - s; return t * t * t * a + 3.0 * t * s * (t * p + s * q) + s * s * s * b; }
vec3 ribbon(vec3 a, vec3 b, float m, float rd, out float e) {
  int k = 0; float bd = 1e30;
  for (int j = 0; j < RK; j++) { vec3 d = b - uRibD[j]; float dd = dot(d, d); if (dd < bd) { bd = dd; k = j; } }
  float tun = uTunnelFrom;
  float prog = clamp((m - uRibT[k]) / 0.62, 0.0, 1.0);             // in a kick, bundles leave one after another
  if (tun > 0.5) {                                                  // arriving, each leaves as the viewer comes up to its patch
    prog = clamp((uRibO[k].z + 6.0 - uViewZ) / 18.0, 0.0, 1.0);
    prog = max(min(prog, m * ARRIVAL_S / 5.0), smoothstep(0.7, 1.0, m));
  }
  prog = clamp(prog * 1.07 - rd * 0.07, 0.0, 1.0);                // strands of one bundle a little apart, so its front is ragged
  float s = ease(prog) * (1.0 + RIB_LEN) - ribLag;                 // the head runs on past home by a strand's length, so the tail lands too
  ribS = s; s = clamp(s, 0.0, 1.0);
  vec3 o = uRibO[k], w = uRibW[k], da = a - o, db = b - w, c;
  float g = smoothstep(0.0, 0.35, s), h = smoothstep(0.6, 1.0, s);
  if (tun > 0.5) {
    // arriving: wound on round the tunnel's axis the way the spiral turns, so seen down the tunnel each bundle is a sweeping arc
    vec2 ro = o.xy - vec2(0.0, TY), rw = w.xy - vec2(0.0, TY);
    float ao = atan(ro.y, ro.x), dA = atan(rw.y, rw.x) - ao;
    dA -= 2.0 * PI * floor((dA + PI) / (2.0 * PI));
    float an = (dA + RIB_TURN) * s, r = mix(length(ro), length(rw), s) * (1.0 + 0.3 * sin(PI * s));
    c = vec3(cos(ao + an) * r, TY + sin(ao + an) * r, mix(o.z, w.z, s));
    da.z *= 1.0 - 0.96 * smoothstep(0.0, 0.2, s);                  // the patch flattens first into a sheet across the spiral
    da.xy = rot(da.xy, an);                                         // and turns with its bundle
  } else c = bez(o, uRibP[k], uRibQ[k], w, s);
  ribG = g * (1.0 - 0.6 * h);
  ribA = smoothstep(0.0, 0.05, s) * (1.0 - h * h);   // faint until it has nearly settled, so the opening is lines, not a spray
  e = h;   // a grain stays a small tunnel grain until it opens onto its surface; only then does it take the room's size, colour and light
  return c + da * mix(1.0, 0.05, g) * (1.0 - h) + db * h;
}
#endif

// The tunnel is never still: where it has rolled up, every grain slides a little way down its own turn of the screw and fades out before it
// starts the same stretch again, and three bright arms of light wind round the turns toward the far end. A slow ripple runs down the turns.
vec3 tunnelFlow(vec3 h, float T, float r, inout float alive, inout float glow) {
  float c = 1.0 - smoothstep(TL - 20.0, TL - 3.0, h.z);
  float s = fract(r + T / 9.0), dz = -s * 4.0 * c;
  vec2 d = rot(h.xy - vec2(0.0, TY), TWIST * dz) * (1.0 + 0.035 * c * sin(T * 0.45 + h.z * 0.35));
  h = vec3(d.x, d.y + TY, h.z + dz);
  alive *= mix(1.0, smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.85, 1.0, s)), c) * smoothstep(TZ0 - 2.0, TZ0 + 3.0, h.z);
  float arm = 0.5 + 0.5 * cos(3.0 * (atan(d.y, d.x) - TWIST * h.z + T * 0.25));
  glow *= mix(1.0, 0.3 + 2.4 * pow(arm, 4.0), c);   // only the light moves round, so nothing winds up however long the wait
  return h;
}

// The arrival: the spiral lays itself down as the room. Each slab of it was dealt the slab of the room at the same share of its length, each
// grain on the same side of the axis it came from (ribbons.ts, slab keys), so it unwinds onto floor, walls and ceiling. The far end of the room
// forms first, from the far end of the tunnel; the last grains, from round the viewer, settle into the near end as the viewer comes to rest.
// Nothing of the room is there before its grains: when this grain leaves (a share of the flight), from where it will land.
float layStart(uint i, vec3 b) {
  float q = clamp((b.z - uZr.x) / max(uZr.y - uZr.x, 1e-3), 0.0, 1.0);
  return LAY_FROM + LAY_SPREAD * q + LAY_JITTER * h01(i * 2654435761u + uint(uMo.x));
}

// Gather's kick: thrown outward, losing speed, never still in the moving air, then drawn in to the new home.
float flight(float m, float T, uint i, vec3 a, vec3 b, out vec3 arc) {
  uint sd = uint(uMo.x);
  float rd = h01(i * 2654435761u + sd);
  vec3 rv = vec3(h01(i ^ (sd * 3u + 11u)), h01(i * 7u + sd + 5u), h01(i * 13u + sd * 5u + 3u)) * 2.0 - 1.0;
#ifdef RIBBONS
  if (uRibOn > 0.5) { float e; arc = ribbon(a, b, m, rd, e) - mix(a, b, e); return e; }
#endif
  if (uTunnelFrom > 0.5) {
    float e = ease(clamp((m - layStart(i, b)) / LAY_SECONDS, 0.0, 1.0)), hump = sin(PI * e);
    // round the axis from its place on the spiral to its place in the room, turning on a little as it goes
    vec2 ra = a.xy - vec2(0.0, TY), rb = b.xy - vec2(0.0, TY);
    float aa = atan(ra.y, ra.x), dA = atan(rb.y, rb.x) - aa;
    dA -= 2.0 * PI * floor((dA + PI) / (2.0 * PI));
    float an = aa + dA * e - 0.5 * hump, r = mix(length(ra), length(rb), e);
    vec3 p = vec3(cos(an) * r, TY + sin(an) * r, mix(a.z, b.z, e));
    arc = p - mix(a, b, e) + flow(a * 0.3 + rv, T * 0.3) * 0.15 * hump;   // a slow drift: grains, not rails
    return e;
  }
  float g = max(0.0, (m - uMo.y) / (1.0 - uMo.y)), sg = 0.6;
  float e = ease(clamp(g * (1.0 + sg) - rd * sg, 0.0, 1.0)), hump = sin(PI * e);
  vec3 qa = (a - uCenter) / uScale, qb = (b - uCenter) / uScale;
  arc = rv * hump * 0.2 * (0.3 + length(qb - qa) * 0.5);
  float far = h01(i * 29u + sd * 7u + 1u); far = 0.1 + 0.9 * far * far;      // most grains go a little way, a few go far
  float thrown = (1.0 - exp(-m * uMo.z)) * (1.0 - e) * (0.72 + 0.5 * m * (2.0 - m)) * step(0.5, uMo.z);
  vec3 dir = normalize(qa * 0.9 + rv * 0.85 + vec3(0.0, 0.0, 1e-3));
  arc += dir * thrown * 0.6 * far + flow(qa * 1.7 + rv * 0.25, T * 1.3) * thrown * 0.1;
  arc *= uScale;
  return e;
}

// Where grain i is at time T, with the field formed to F and the kick at M. Everything is worked out fresh from its homes.
vec3 place(uint i, float T, float F, float M, out vec3 col, out float alive, out float air, out float bright, out bool tracker, out float wsz, out float eTo, out float lw, out float nk) {
  float r1 = h01(i * 3u + 17u), r2 = h01(i * 5u + 29u), r3 = h01(i * 11u + 71u), r4 = h01(i * 17u + 113u);
  float r5 = h01(i * 23u + 191u), r6 = h01(i * 31u + 7u), r7 = h01(i * 37u + 59u);
  vec3 rv = vec3(h01(i * 7u + 5u), h01(i * 13u + 3u), h01(i * 19u + 11u)) * 2.0 - 1.0;
  alive = 1.0; bright = 1.0; air = 0.0;

  float aliveTo = 1.0, aliveFrom = 1.0, glowTo = 1.0, glowFrom = 1.0;
  vec3 to = uTunnelTo > 0.5 ? tunnelFlow(position, T, r2, aliveTo, glowTo) : position;
  vec3 h = to; col = aCol; alive = aliveTo; bright = glowTo; eTo = 1.0;
  if (M < 1.0) {
    float Tf = T;   // arriving, a grain stops sliding down its turn of the spiral once it has left it, so it never jumps back mid-air
    if (uTunnelFrom > 0.5) Tf -= max(0.0, M - layStart(i, to)) * ARRIVAL_S;
#ifdef RIBBONS
    if (uRibOn > 0.5) Tf = T;
#endif
    vec3 from = uTunnelFrom > 0.5 ? tunnelFlow(aFrom, Tf, r2, aliveFrom, glowFrom) : aFrom, arc;
    float e = flight(M, T, i, from, to, arc); eTo = e;
    h = mix(from, to, e) + arc; col = mix(aFromCol, aCol, e); air = sin(PI * e); alive = mix(aliveFrom, aliveTo, e); bright = mix(glowFrom, glowTo, e);
#ifdef RIBBONS
    bright *= 1.0 - mix(0.95, 0.85, uTunnelFrom) * ribA;   // in a kick the bundles pass close by the viewer   // on ribbons the strands carry the flight; the grains in it stay faint
#endif
  }

  // Tone first: lift the mid-tones the tunnel is made of, then thin only what is nearly black.
  // A lit room keeps its own colours: the lighting decides how bright they are. lw: how far this grain is part of a lit room.
  lw = uLit * (uTunnelFrom > 0.5 ? eTo : 1.0);
  vec3 raw = col;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722)), mx = max(max(col.r, col.g), max(col.b, 1.0 / 255.0));
  col *= min(pow(max(l, 1e-3), -0.3), 1.0 / mx);
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 0.55);   // DAO's muted, near-monochrome colour
  col = mix(col, raw, lw);
  float keep = mix(0.12, 1.0, smoothstep(0.015, 0.09, l));
  // Grain size: a room's from its sampling spacing, so a surface reads the same from anywhere; up close the grains open up.
  wsz = mix(uWsz.x, uWsz.y, eTo);
  bool star = r5 < 0.002;                                     // a few grains belong to the void and never leave it
  float kept = step(r5, keep);
  tracker = star ? r7 < 0.1 : r7 < 0.0001;

  vec3 q = (h - uCenter) / uScale;
  float hN = clamp((h.y - uFloor) / (2.0 * uHalf.y), 0.0, 1.0);

  // breathe: the room breathes at the viewer. Walls swell toward them and sink away, in slow uneven lobes
  if (uFxA.x > 0.001) {
    float k = uFxA.x;
    vec3 d = h - uEye;
    float lobe = 0.65 + 0.35 * flow(h * 0.35, T * 0.3).x;
    d *= 1.0 - 0.28 * k * uDeep * lobe;
    h = uEye + d;
    bright *= 1.0 + 0.3 * k * uDeep;
  }
  // melt: everything hangs from the top and runs down in strings, pooling on the floor; grains drip off the ends and form again
  if (uFxA.y > 0.001) {
    float k = clamp(uFxA.y * 1.3 - r6 * 0.3, 0.0, 1.0);
    float drip = 0.5 + 0.5 * sin(h.x * 5.3 + sin(h.z * 2.1) * 2.0) * sin(h.z * 4.7 + h.x * 0.9);   // narrow runs
    float below = uFloor + 2.0 * uHalf.y - h.y;                                          // how far it hangs from the top
    h.y -= k * (0.15 + 0.85 * drip * drip) * below * 0.55 * (0.35 + 0.65 * r1);   // strings: each grain slides its own way down
    float pool = max(0.0, uFloor - h.y);                                                // and what reaches the floor spreads out over it
    h.y = max(h.y, uFloor + 0.03 * r4); h.xz += normalize(h.xz - uCenter.xz + 1e-4) * pool * 0.6;
    h.xz = mix(h.xz, uCenter.xz, 0.05 * k * hN);
    float per = 2.8 + 3.5 * r1, ph = fract(T / per + r2), hold = mix(0.97, 0.5, k * drip);
    float gone = max(0.0, (ph - hold) / (1.0 - hold));
    h.y -= gone * gone * max(0.0, h.y - uFloor) * k;
    h.xz += rv.xz * smoothstep(0.75, 1.0, gone) * 0.6 * k;
    alive *= mix(1.0, smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.8, 1.0, gone)), k);
  }
  // weightless: up is lost; whole regions lift together, drift, and the room rolls a little
  if (uFxA.w > 0.001) {
    float k = clamp(uFxA.w * 1.3 - r6 * 0.3, 0.0, 1.0);
    vec3 n = flow(h * 0.45, 1.7);
    float lift = (0.15 + 0.5 * (n.x + 1.0) + 0.25 * r1) * (0.8 + 0.2 * sin(T * (0.17 + 0.2 * r2) + r3 * 6.28));
    h.y += k * lift;
    h += flow(q * 0.7 + n * 0.5, T * 0.11) * k * 0.5;
    h.xy = uCenter.xy + rot(h.xy - uCenter.xy, k * 0.14 * sin(T * 0.13));
  }
  // vortex: the room wraps onto a tunnel around the viewer's line of sight and streams down it, turning
  if (uFxB.y > 0.001) {
    float k = clamp(uFxB.y * 1.3 - r6 * 0.3, 0.0, 1.0);
    vec3 d = h - uEye; float al = dot(d, uLook);
    vec3 perp = d - uLook * al; vec3 u1 = normalize(cross(uLook, vec3(0.0, 1.0, 0.0)) + vec3(1e-5, 0.0, 0.0)), u2 = cross(u1, uLook);
    float rho = length(perp), th = atan(dot(perp, u2), dot(perp, u1) + 1e-5);
    float dn = clamp(al / (2.0 * max(uHalf.x, uHalf.z)), 0.0, 1.0);
    float s = fract(r2 + T * 0.07);
    float R = mix(0.9, 0.25, dn) * uHalf.y * 1.6 * (0.82 + 0.36 * r3);
    float rho2 = mix(rho, R * (1.0 - 0.5 * s), k);
    float th2 = th + k * (3.4 * dn + 2.6 * s + 1.1 * log(rho2 / R + 0.15));
    h = uEye + uLook * (al + k * (0.6 * s + 0.1) * uHalf.z * 0.9) + rho2 * (cos(th2) * u1 + sin(th2) * u2);
    alive *= mix(1.0, smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.85, 1.0, s)), k);
  }
  // smear: grains drag out along the depth toward the viewer, streaming along their own trails
  if (uFxB.x > 0.001) {
    float k = clamp(uFxB.x * 1.3 - r6 * 0.3, 0.0, 1.0) * step(r3, 0.88);
    float s = fract(r2 + T * (0.1 + 0.12 * r1));
    vec3 dir = normalize(vec3(1.0, -0.12 + 0.1 * sin(h.z * 0.9 + T * 0.2), 0.3));   // across the view, so the trails read as trails
    h += dir * k * (0.6 + 5.0 * r4 * r4) * s;
    alive *= mix(1.0, (1.0 - 0.6 * s) * smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.9, 1.0, s)), k);
  }
  // scatter: the kick's splash with nothing to gather into. Surfaces come away as shells, each patch thrown its own distance, and hang turning
  if (uFxA.z > 0.001) {
    float k = clamp(uFxA.z * 1.15 - r6 * 0.15, 0.0, 1.0), thrown = 1.0 - pow(1.0 - k, 3.0);
    vec3 shell = flow(h * 0.55, 2.3), dir = normalize(q * 1.2 + shell * 0.6 + 1e-4);
    float far = 0.25 + 0.75 * smoothstep(-0.6, 0.9, shell.y);
    h += dir * thrown * far * 0.45 * uScale + flow(h * 0.3 + shell, T * 0.25) * k * 0.25 + rv * k * 0.03;
  }
  // Gather's breath, shallow and slow, deepest in the depth; and the held grains barely stir
  h.z = uCenter.z + (h.z - uCenter.z) * (1.0 + 0.006 * uBreath);
  h += flow(h * 2.0 + r2 * 3.0, T * 0.12) * mix(0.008, 0.0015, uLit);   // in a room, less than a grain: surfaces stay crisp

  // the void: before the field forms every grain is dust
  float delay = 0.7 * r6 + 0.3 * clamp(length(q) / 1.3, 0.0, 1.0);
  float ef = star ? 0.0 : ease(clamp(F * 3.0 - delay * 2.0, 0.0, 1.0));   // each grain flies a third of the way; the room crystallises piece by piece
  alive *= mix(1.0, kept, ef);
  if (ef < 1.0) {
    alive *= mix(star || r1 < 0.25 ? 1.0 : 0.0, 1.0, smoothstep(0.0, 0.1, ef));   // the void stays sparse: most grains appear only as they arrive
    wsz = mix(POINT_M * 1.5, wsz, ef);
    bright *= mix(4.0, 1.0, ef);                       // the void's grains are few; let them be seen
    vec3 dir = normalize(rv + 1e-4);
    float rad = 0.2 + 1.5 * pow(r4, 0.3333);
    vec3 dq = dir * rad * vec3(1.0, 0.55, 1.0);
    dq += flow(dq * 0.9 + r2 * 3.0, T * 0.07) * 0.1 * rad;   // the void drifts
    vec3 dust = uDust.xyz + dq * uDust.w;
    float hump = sin(PI * ef);
    vec3 m = mix(dust, h, ef);
    m = uDust.xyz + rotY(m - uDust.xyz, hump * (0.3 + 0.5 * r3)) + rv * hump * 0.2 * (0.3 * uDust.w + 0.5 * length(h - dust));
    float g = 0.27 + 0.43 * r1;
    col = mix(vec3(g, g, g * 1.04) * (star ? 0.6 : 0.7), col, ef);
    air = max(air, hump);
    h = m;
  }
  nk = eTo * ef;   // how far its surface normal means anything: not in flight, not as dust
#ifdef RIBBONS
  if (uRibOn > 0.5 && uTunnelFrom < 0.5) nk = (1.0 - ribA) * ef;   // a kick on ribbons: a grain waiting on the old room is on a surface too
#endif
  return h;
}

// Wrapped diffuse: with no shadows to explain black, a surface turned away is dim, never black.
float wrapD(float ndl) { float w = 0.5 + 0.5 * ndl; return 0.2 + 0.8 * w * w; }
float facing(vec3 n, vec3 d, float dd, float nk) { return mix(0.5, wrapD(dot(n, d) * inversesqrt(dd + 1e-6)), nk); }

// The light falling on p (linear). fit and lampG: how much p is itself part of a lit fitting or lamp.
vec3 lightAt(vec3 p, vec3 n, float nk, out float fit, out float lampG) {
  float ce = 0.0; fit = 0.0; lampG = 0.0;
  for (int k = 0; k < MAX_CEIL; k++) {
    if (k >= uCeilN) break;
    vec4 f = uCeil[k];
    vec3 d = f.xyz - vec3(0.0, CEIL_DROP, 0.0) - p; float dd = dot(d, d);
    float down = clamp(d.y * inversesqrt(dd + 1e-6), 0.0, 1.0);    // a downlight: strongest straight below
    ce += f.w * facing(n, d, dd, nk) * (0.45 + 0.55 * down) / (1.0 + dd / (CEIL_R * CEIL_R));
    fit += f.w * (1.0 - smoothstep(0.62, 0.78, distance(f.xyz, p)));
  }
  float la = 0.0;
  for (int k = 0; k < MAX_LAMP; k++) {
    if (k >= uLampN) break;
    vec4 b = uLampL[k];
    vec3 d = b.xyz - p; float dd = dot(d, d);
    la += b.w * 1.4 * facing(n, d, dd, nk) / (1.0 + dd / 0.5);
    lampG += b.w * (1.0 - smoothstep(0.14, 0.3, sqrt(dd)));
  }
  // the sun washes across from its side: strongest where it comes in, weaker across the room
  float wash = clamp(0.8 + 0.5 * dot(p - uCenter, normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5)) / uScale, 0.3, 1.3);
  float sd = dot(n, normalize(uSunDir));
  vec3 sun = uSunCol * mix(0.5, 0.12 + 0.88 * max(sd, 0.0) + 0.1 * wrapD(sd), nk) * wash;   // harder than the others: it comes from one side
  // the eye: a small red light, gone within a few metres (a long faint tail would tint the whole room)
  vec3 de = uEyeL.xyz - p; float ed = dot(de, de), ef = 1.0 / (1.0 + ed / (EYE_R * EYE_R));
  vec3 eye = EYE_COL * uEyeL.w * facing(n, de, ed, nk) * ef * ef * (1.0 - smoothstep(1.0, EYE_REACH, sqrt(ed)));
  return uAmb + uCeilCol * ce * uCeilNorm + uLampCol * la + sun + eye;
}

// A room whose colours already hold its own light (PointCloud.lit, rebuilt from pictures): the light is a multiplier on those colours,
// 1 in the default mood. Moods scale and tint it (uBakeGain), afternoon adds its side wash, lamps and the eye add their own light, and
// near each fitting its slow drift and rare stutter show. Nothing is lit again from scratch.
vec3 bakedLight(vec3 p, vec3 n, float nk) {
  float flick = 1.0;
  for (int k = 0; k < MAX_CEIL; k++) {
    if (k >= uCeilN) break;
    vec4 f = uCeil[k];
    float near = (1.0 - smoothstep(0.8, 2.5, distance(f.xyz, p))) * clamp(uCeilOn, 0.0, 1.0);
    flick *= mix(1.0, f.w / max(uCeilOn, 0.05), near);   // f.w is the mood's ceiling x drift x stutter
  }
  float la = 0.0;
  for (int k = 0; k < MAX_LAMP; k++) {
    if (k >= uLampN) break;
    vec4 b = uLampL[k];
    vec3 d = b.xyz - p; float dd = dot(d, d);
    la += b.w * 0.6 * facing(n, d, dd, nk) / (1.0 + dd / 0.5);
  }
  float wash = clamp(0.8 + 0.5 * dot(p - uCenter, normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5)) / uScale, 0.3, 1.3);
  float sd = dot(n, normalize(uSunDir));
  vec3 sun = uSunCol * BAKED_SUN * mix(0.5, 0.12 + 0.88 * max(sd, 0.0), nk) * wash;
  return uBakeGain * flick + uLampCol * la + sun;
}
// The eye's red light on p, as lightAt has it; a baked room adds it on top through the same soft shoulder, so it reads as it does elsewhere.
vec3 eyeLight(vec3 p, vec3 n, float nk) {
  vec3 de = uEyeL.xyz - p; float ed = dot(de, de), ef = 1.0 / (1.0 + ed / (EYE_R * EYE_R));
  return EYE_COL * uEyeL.w * facing(n, de, ed, nk) * ef * ef * (1.0 - smoothstep(1.0, EYE_REACH, sqrt(ed)));
}

void main() {
#if defined(STREAK) || defined(RLINE)
  uint i = uint(aId);
#else
  uint i = uint(gl_VertexID);   // the full cloud is drawn in order, so a grain's index is its vertex: no id buffer to build or upload
#endif
  float tail = 0.0;
#ifdef STREAK
  tail = aTail;
#endif
#ifdef RLINE
  ribLag = aTail * RIB_LEN;   // a strand: the same grain further back along its own path, not back in time
#endif
  vec3 col; float alive, air, bright, wsz, eTo, lw, nk; bool tracker;
  vec3 p = place(i, uTime - tail * uTail, mix(uForm, uFormTail, tail), mix(uFlight, uFlightTail, tail), col, alive, air, bright, tracker, wsz, eTo, lw, nk);
  float r3 = h01(i * 11u + 71u), r8 = h01(i * 41u + 3u);
#ifdef STREAK
  p += uTrail * (0.2 + 1.8 * r8 * r8) * tail;   // where it was a moment ago, as the eye flew
  // a trail wrapping round to its start would draw one long false line
  float sr = h01(i * 5u + 29u), sv = 0.1 + 0.12 * h01(i * 3u + 17u);
  if (uFxB.x > 0.001 && fract(sr + (uTime - uTail) * sv) > fract(sr + uTime * sv)) alive = 0.0;
  if (uTunnelTo > 0.5 && fract(sr + (uTime - uTail) / 9.0) > fract(sr + uTime / 9.0)) alive = 0.0;
#endif
#if !defined(STREAK) && !defined(RLINE)
  // A settled grain of a room whose colours are final belongs to the solid pass: depth-tested, opaque, the front surface wins.
  // Each grain changes over at its own moment (its share of uSolid), so the hand-over dissolves instead of popping; grains in flight,
  // in an effect (uSolid eases to 0), the void's stars and the trackers stay in the additive pass.
  bool solid = uSolid > 0.001 && uBaked > 0.5 && nk > 0.999 && !tracker && h01(i * 53u + 7u) < uSolid;
#ifdef SOLID
  if (!solid) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
#else
  if (solid) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
#endif
#endif
  // Lighting, faded in as the grain arrives on its surface. Linear light on linear albedo; the fittings and lamp shades glow themselves.
  float lum = 1.0;
#ifndef RLINE
  if (lw > 0.001) {
    float fit, lampG;
    vec3 nrm = aNorm;
#ifdef RIBBONS
    // the old room's normal until the grain opens onto its new surface (absent outside a kick: then zero)
    if (uRibOn > 0.5 && uTunnelFrom < 0.5 && dot(aFromNorm, aFromNorm) > 0.5) nrm = normalize(mix(aFromNorm, aNorm, eTo) + 1e-5);
#endif
    vec3 lin = pow(col, vec3(2.2));
    if (uBaked > 0.5) {
      // its own colours, as they are, times the change the mood makes; never past white
      vec3 B = bakedLight(p, nrm, nk), E = eyeLight(p, nrm, nk);
      vec3 red = 1.0 - exp(-ROOM_EXPOSURE * pow(lin * E, vec3(1.0 / 2.2)));
      col = mix(col, min(pow(lin * B, vec3(1.0 / 2.2)) + red, vec3(1.0)), lw);
      lum = mix(1.0, min(1.0, dot(B + E, vec3(0.2126, 0.7152, 0.0722))), lw);
    } else {
      vec3 L = lightAt(p, nrm, nk, fit, lampG);
      float pale = smoothstep(0.55, 0.78, dot(lin, vec3(0.2126, 0.7152, 0.0722)));   // only the pale fitting, not the ceiling round it
      vec3 em = uCeilCol * fit * pale * 3.0 + uLampCol * lampG * 2.5;
      vec3 lc = pow(lin * (L + em), vec3(1.0 / 2.2));
      lc = 1.0 - exp(-ROOM_EXPOSURE * lc);   // a soft shoulder, not a clip: pale prints keep their picture, true black stays black
      lc = mix(vec3(dot(lc, vec3(0.2126, 0.7152, 0.0722))), lc, 0.95);
      col = mix(col, lc, lw);
      lum = mix(1.0, min(1.0, dot(L + em, vec3(0.2126, 0.7152, 0.0722))), lw);
    }
    // back faces: a surface turned away from the viewer is not drawn, so an object's far side does not show through it.
    // Seen at a slant a surface's grains crowd together on screen; thin them there, so a floor seen edge-on stays as open as a wall
    // seen face-on (each grain keeps its brightness) instead of piling up into white and swallowing what stands on it.
#ifndef SOLID   // solid grains are hidden by what is in front of them: no culling or thinning, which would leave holes
    vec3 v = normalize(cameraPosition - p); float ndv = dot(nrm, v);
    if (ndv < 0.0) alive *= 1.0 - nk * uLit;
    float graze = clamp(abs(ndv) * GRAZE_KEEP, 0.08, 1.0);
    // ordered rows would break into noise if thinned at random: dim them by the same share instead
    if (uOrdered > 0.5) alive *= mix(1.0, graze, nk * uLit);
    else if (h01(i * 47u + 13u) > graze) alive *= 1.0 - nk * uLit;
#endif
  }
#endif

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float z = max(-mv.z, 0.05);
  vec4 cp = projectionMatrix * mv;
  float sz = wsz * uFocal * mix(0.6 + 0.9 * r3, 0.85 + 0.3 * r3, uLit) / z * (1.0 + 0.25 * uVoice);   // a room's grains nearly one size: an even grain, not blotches
  // under a pixel a grain dims instead of shrinking (by size, not Gather's area: the tunnel is far sparser than a pixel)
  float fade = min(1.0, sz), base = mix(uGain.x, uGain.y, eTo) * fade * alive * bright;
  float fog = exp(-z * uFog) * (1.0 + 0.25 * exp(-z / 2.5));                  // Wake: distance swallows, the near is lifted
  vec3 c = col * base * fog * (1.0 - 0.3 * air);
#ifdef SOLID
  // its own colour, one size from the sampling spacing: no fog, no size jitter, no dimming under a pixel
  sz = wsz * uFocal / z;
  c = col * bright;
  // the glow blooms where an 8x8 neighbourhood passes 0.68 and solid grains fill their pixels, so pale surfaces (the cube, the statue,
  // spines, shelf edges) stop just under it; only the ceiling panels themselves may glow
  float panel = 0.0;
  for (int k = 0; k < MAX_CEIL; k++) { if (k >= uCeilN) break; panel = max(panel, 1.0 - smoothstep(0.55, 0.8, distance(uCeil[k].xyz, p))); }
  float mxc = max(max(c.r, c.g), max(c.b, 1e-4));
  c *= mix(min(1.0, SOLID_CAP / mxc), 1.0, panel);
#endif
#if defined(STREAK)
  // a sparse accent: strongest on the ground, only while the eye moves, never on grains in flight
  float ground = mix(0.25, 1.0, 1.0 - smoothstep(0.3, 0.9, p.y - uFloor));
  c = col * alive * bright * fog * uStreak * (1.0 - tail) * (1.0 - air) * ground * min(1.0, length(uTrail) * 1.5);
#elif defined(RLINE)
  // 1 px light, faint where the strands fan out, brightest at the head where they gather; nothing before it leaves or once it is home
  float win = smoothstep(0.0, 0.03, ribS) * (1.0 - smoothstep(0.97, 1.0, ribS));
  c = RIB_TINT * uRibLine * win * pow(1.0 - aTail, 1.3) * (0.1 + 0.9 * ribG) * fog * uRibOn;
#else
  if (tracker) {                     // the bright square grains a tracker would lock onto; they go out with the lights
    float blink = 0.55 + 0.45 * smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(uTime * (0.6 + r8 * 1.4) + r3 * 60.0));
    sz = (2.0 + 2.4 * r3) * uPx;
    c = mix(col, vec3(1.0), 0.75) * alive * mix(fog, 1.0, 0.6) * blink * lum;
  }
  // Inspection: the hero being looked at answers, a little brighter and a step larger, with a slow swell rising through it; the rest
  // of the room steps back by about an eighth. Its lift stops short of white (HERO_CAP), so a pale hero gains presence, not a bloom.
  if (uHeroD > 0.001) {
    float w = 0.0;
    for (int k = 0; k < MAX_HERO; k++) {
      if (k >= uHeroN) break;
      if (all(greaterThanEqual(position, uHeroMin[k])) && all(lessThanEqual(position, uHeroMax[k]))) w = max(w, uHeroW[k]);
    }
    float swell = 0.5 + 0.5 * sin(6.2832 * (position.y * 1.4 - uTime * 0.25));
    vec3 lifted = min(c * (1.0 + 0.45 + 0.3 * swell), max(c, vec3(HERO_CAP)));
    c = mix(c * (1.0 - 0.12 * uHeroD), lifted, w);
    sz *= 1.0 + 0.2 * w;
  }
#endif
#if !defined(STREAK) && !defined(RLINE)
  if (alive < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }   // cheaper than rasterising nothing
#endif
#ifdef SOLID
  float px = clamp(sz, 1.0, 3.0 * uPx);   // up close the rows open with black between them, as in the raw points, never mosaic tiles
#else
  float px = clamp(sz, 1.0, tracker ? 8.0 * uPx : uMaxPx);
#endif
  // whole pixels: a square of whole size covers the same pixels wherever it falls, so a room does not shimmer as the view drifts
  if (uTunnelTo < 0.5 && !tracker) {
    float N = floor(px + 0.5);
#ifndef SOLID
    c *= px * px / (N * N);   // light on light: the same light whatever the size; an opaque grain keeps its own colour
#endif
    px = N;
  }
  gl_PointSize = px;
  gl_Position = cp;
  vCol = c;
}`;

const SQUARE_FS = /* glsl */ `precision highp float; in vec3 vCol; out vec4 o; void main() { o = vec4(vCol, 1.0); }`;

// Gather's blend: light on light, never past white, nothing hides anything
const BLEND = {
  transparent: true, depthTest: false, depthWrite: false, blending: CustomBlending,
  blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcColorFactor,
} as const;
const TUNNEL_DEFINES = {
  POINT_M: POINT_METRES.toFixed(4), ARRIVAL_S: ARRIVAL_SECONDS.toFixed(1), TL: TUNNEL.length.toFixed(3), TY: TUNNEL.axisY.toFixed(3), TZ0: TUNNEL_END.toFixed(3), TWIST: TUNNEL_TWIST.toFixed(6),
  MAX_CEIL: String(MAX_CEILING), MAX_LAMP: String(MAX_LAMPS), CEIL_R: CEILING_R.toFixed(3), CEIL_DROP: CEILING_DROP.toFixed(3),
  GRAZE_KEEP: '1.6', ROOM_EXPOSURE: ROOM_EXPOSURE.toFixed(3),
  // the arrival as shares of it: nothing leaves for the first tenth (the room is still being dealt), the far end of the room starts first and
  // the near end last, each grain taking a little over a third of the arrival to land; all are home at the end
  LAY_FROM: '0.10', LAY_SPREAD: '0.45', LAY_JITTER: '0.07', LAY_SECONDS: '0.38',
  // an inspected hero's grains lift no further than this; the glow blooms where an 8x8 neighbourhood's mean passes 0.68
  MAX_HERO: String(MAX_HEROES), HERO_CAP: '0.78',
  BAKED_SUN: '0.45', SOLID_CAP: '0.64',   // afternoon's side light, as a wash over a room that already holds its own light
  EYE_R: '0.9', EYE_REACH: '2.8', EYE_COL: 'vec3(5.0, 0.04, 0.015)',   // the eye's light: deep red, its strength in the colour
  ...(RIBBONS ? { RIBBONS: '', RK: String(RIB_K), RIB_LEN: RIB_LEN.toFixed(3), RIB_TURN: '-2.6', RIB_TINT: 'vec3(0.86, 0.9, 0.95)' } : {}),
};

/** The ceiling's light at p facing up, as the shader works it out for unit fittings (its normaliser). */
function ceilingAt(p: number[], fittings: number[][]): number {
  let sum = 0;
  for (const f of fittings) {
    const d = [f[0]! - p[0]!, f[1]! - CEILING_DROP - p[1]!, f[2]! - p[2]!], dd = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2, inv = 1 / Math.sqrt(dd + 1e-6);
    const w = 0.5 + 0.5 * d[1]! * inv, down = Math.min(1, Math.max(0, d[1]! * inv));
    sum += (0.2 + 0.8 * w * w) * (0.45 + 0.55 * down) / (1 + dd / CEILING_R ** 2);
  }
  return sum;
}

// Gather's breath: in a little quicker than out
function breathCurve(t: number, period: number): number {
  const bp = (t / period) % 1;
  return bp < 0.42 ? -Math.cos(Math.PI * bp / 0.42) : Math.cos(Math.PI * (bp - 0.42) / 0.58);
}
const ease = (s: number) => s * s * s * (s * (s * 6 - 15) + 10);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The arrival tunnel, after DAO's point-cloud walk: a wide floor of fibres near the mouth that rolls up to the right into a log-spiral sheet,
 * winding in toward a dark opening and twisting along the axis down to the room. Faint mossy clouds hang outside the turns.
 * It is the same every time (a fixed seed), so it is made once, ahead, while the void is showing (createPointField starts it), and shared.
 */
export function createTunnelCloud(): PointCloud {
  tunnelMade ??= finish(tunnelMaking ?? tunnelSteps());
  return tunnelMade;
}
let tunnelMade: PointCloud | null = null, tunnelMaking: Steps<PointCloud> | null = null;
function* tunnelAhead(): Steps<void> {
  if (tunnelMade || tunnelMaking) return;
  tunnelMaking = tunnelSteps();
  for (;;) { const r = tunnelMaking.next(); if (r.done) { tunnelMade ??= r.value; break; } yield; }
  tunnelMaking = null;
}
function* tunnelSteps(): Steps<PointCloud> {
  const n = TUNNEL_POINTS, positions = new Float32Array(n * 3), colors = new Float32Array(n * 3), rnd = mulberry32(7);
  const L = TUNNEL.length, Y = TUNNEL.axisY, R = TUNNEL_RADIUS, W = 12, FIBRES = 240, TURNS = 1.08, WIND = 0.3;
  const fibreB = Array.from({ length: FIBRES }, () => 0.3 + 0.7 * rnd() ** 2), fibreG = Array.from({ length: FIBRES }, () => rnd() < 0.25);
  for (let i = 0; i < n; i++) {
    const z = TUNNEL_END + (L - TUNNEL_END) * Math.pow(rnd(), 1.1);
    const curl = ease(1 - smooth(L - 20, L - 3, z)), funnel = 0.5 + 0.5 * smooth(TUNNEL_END, L - 20, z);   // narrowing toward the far opening
    let x: number, y: number, b: number, green: number;
    if (rnd() < 0.9) {
      const f = Math.floor(rnd() * FIBRES), onFibre = rnd() < 0.82;
      const a = onFibre ? (f + 0.5 + (rnd() - 0.5) * 0.06) / FIBRES : rnd();
      // flat: the floor below the eye. rolled: a sheet a little over one turn, its angle and radius blended so it rolls rather than folds.
      // A thin wall, not a thick spiral: seen down the axis, every depth of a thick one would overlap into haze.
      const fx = (a * 2 - 1) * W, rf = Math.hypot(fx, Y), tf = Math.atan2(-Y, fx);
      const tc = -Math.PI + a * TURNS * 2 * Math.PI + TUNNEL_TWIST * (z - (L - 20)), rc = R * funnel * Math.exp(-WIND * a);
      const r = (rf + (rc - rf) * curl) * (1 + (rnd() - 0.5) * 0.02), t = tf + (tc - tf) * curl + (rnd() - 0.5) * 0.002;
      x = Math.cos(t) * r; y = Y + Math.sin(t) * r;
      b = (onFibre ? fibreB[f]! : 0.1 + 0.2 * rnd()) * (0.45 + 0.55 * curl) * (1 + curl * (1.5 * a * a * a - 0.2));   // the inner rim catches the light
      green = onFibre && fibreG[f] ? 0.6 : 0;
    } else {
      // moss: clumps of dark green-grey outside the turns
      let t = 0, zz = z, tries = 0;
      do { t = rnd() * Math.PI * 2; zz = TUNNEL_END + (L - 12 - TUNNEL_END) * rnd(); }
      while (Math.sin(t * 3 + zz * 0.37) * Math.sin(zz * 0.21 + t * 1.7) + 0.5 * Math.sin(t * 7 - zz * 0.9) < 0.25 && ++tries < 12);
      const r = R * (1.05 + 0.9 * Math.pow(rnd(), 0.7)), tt = t + TUNNEL_TWIST * zz;
      x = Math.cos(tt) * r; y = Y + Math.sin(tt) * r;
      b = (0.1 + 0.28 * rnd()) * (1 - smooth(L - 30, L - 12, zz) * 0.6);
      green = 1;
      positions[i * 3 + 2] = zz;
    }
    positions[i * 3] = x; positions[i * 3 + 1] = y;
    if (green < 1) positions[i * 3 + 2] = z;
    const g = green * 0.8;
    colors[i * 3] = Math.min(1, b * (1 - 0.25 * g)); colors[i * 3 + 1] = Math.min(1, b * (1 - 0.05 * g)); colors[i * 3 + 2] = Math.min(1, b * (0.96 - 0.3 * g));
    if (i % 32768 === 32767) yield;
  }
  const cloud: PointCloud = { count: n, positions, colors };
  tunnels.add(cloud);
  return cloud;
}

/** Robust box: percentiles of a sample, so a few stray grains do not stretch it. */
function roomBox(pos: Float32Array, n: number): { lo: number[]; hi: number[] } {
  const m = Math.min(n, 20000), axes: number[][] = [[], [], []];
  for (let s = 0; s < m; s++) { const j = Math.floor(s * n / m) * 3; for (let a = 0; a < 3; a++) axes[a]!.push(pos[j + a]!); }
  const lo: number[] = [], hi: number[] = [];
  for (const v of axes) { v.sort((x, y) => x - y); lo.push(v[Math.floor(m * 0.01)]!); hi.push(v[Math.min(m - 1, Math.floor(m * 0.99))]!); }
  return { lo, hi };
}

// aNorm is absent for the tunnel, which is never lit
type Arrays = { position: Float32Array; aFrom: Float32Array; aCol: Float32Array; aFromCol: Float32Array; aId?: Float32Array; aNorm?: Float32Array; aFromNorm?: Float32Array };

function geometryOf(a: Arrays): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, arr] of Object.entries(a)) if (arr) g.setAttribute(name, new BufferAttribute(arr, name === 'aId' ? 1 : 3));
  return g;
}

/** Every stride-th grain, each written `copies` times (a streak is one grain drawn twice: now, and a moment ago). */
function subsetGeometry(a: Arrays, n: number, stride: number, copies: number): BufferGeometry {
  const m = Math.ceil(n / stride), v = m * copies;
  const out = { position: new Float32Array(v * 3), aFrom: new Float32Array(v * 3), aCol: new Float32Array(v * 3), aFromCol: new Float32Array(v * 3), aId: new Float32Array(v) } as Arrays & { aId: Float32Array };
  if (a.aNorm) out.aNorm = new Float32Array(v * 3);
  const tail = new Float32Array(v);
  for (let s = 0, o = 0; s < m; s++) {
    const j = s * stride;
    for (let c = 0; c < copies; c++, o++) {
      for (let k = 0; k < 3; k++) {
        out.position[o * 3 + k] = a.position[j * 3 + k]!; out.aFrom[o * 3 + k] = a.aFrom[j * 3 + k]!;
        out.aCol[o * 3 + k] = a.aCol[j * 3 + k]!; out.aFromCol[o * 3 + k] = a.aFromCol[j * 3 + k]!;
        if (out.aNorm) out.aNorm[o * 3 + k] = a.aNorm![j * 3 + k]!;
      }
      out.aId[o] = j; tail[o] = copies > 1 ? c / (copies - 1) : c;
    }
  }
  const g = geometryOf(out);
  if (copies > 1) g.setAttribute('aTail', new BufferAttribute(tail, 1));
  if (copies > 2) {   // a polyline per grain, drawn as segments between its consecutive copies
    const index = new Uint32Array(m * (copies - 1) * 2);
    for (let s = 0, w = 0; s < m; s++) for (let c = 0; c < copies - 1; c++) { index[w++] = s * copies + c; index[w++] = s * copies + c + 1; }
    g.setIndex(new BufferAttribute(index, 1));
  }
  return g;
}

// axis: the line its slabs run round (the tunnel's axis, or a room's centre); order: its grains in slab order, once worked out
type Prev = { pos: Float32Array; col: Float32Array; n: number; tunnel: boolean; axis: [number, number]; order?: Uint32Array; nrm?: Float32Array; groups?: Groups; angleRank?: Uint8Array; tunnelOrder?: TunnelOrder };
type Bundles = { D: number[]; O: number[]; P: number[]; Q: number[]; W: number[]; T: number[] };

/** Each group's rank going round the room's vertical axis: the order a kick deals bundles in. */
function ranksRound(g: Groups, center: number[]): Uint8Array {
  const at = (c: number) => Math.atan2(g.centres[c * 3 + 2]! - center[2]!, g.centres[c * 3]! - center[0]!);
  const rank = new Uint8Array(g.k);
  [...Array(g.k).keys()].sort((x, y) => at(x) - at(y)).forEach((c, r) => { rank[c] = r; });
  return rank;
}

/**
 * The ribbons' deal: which grain of the last cloud each grain of this room flies from, and each bundle's curve.
 * Arriving, the front of the room comes from the near end of the tunnel and the back from the far end, so the room fills from the back
 * as the viewer comes down; each bundle from one sector of one band of the spiral. In a kick, each group of the old room goes a third
 * of the way round to its new place, all the same way round.
 */
function dealRibbons(g: Groups, angleRank: Uint8Array, prev: Prev, center: number[], arrival: number[]): { from: Uint32Array; b: Bundles } {
  const K = g.k, cz = (c: number) => g.centres[c * 3 + 2]!;
  const rank = prev.tunnel ? (() => { const r = new Uint8Array(K); [...Array(K).keys()].sort((x, y) => cz(y) - cz(x)).forEach((c, i) => { r[c] = i; }); return r; })() : angleRank;
  const destKey = new Float32Array(g.group.length);
  for (let i = 0; i < destKey.length; i++) destKey[i] = (rank[g.group[i]!]! + g.u[i]!) / K;
  let originKey: Float32Array;
  if (prev.tunnel) {
    const shares = new Array<number>(K);
    for (let c = 0; c < K; c++) shares[rank[c]!] = g.sizes[c]!;
    originKey = tunnelOriginKeys(prev.tunnelOrder ?? tunnelOrder(prev.pos, prev.n, TUNNEL.axisY, TUNNEL_TWIST), shares, RIB_PER_BAND);
  } else {
    const pg = prev.groups!, pr = prev.angleRank!, shift = Math.round(pg.k / 3);
    originKey = new Float32Array(prev.n);
    for (let j = 0; j < prev.n; j++) originKey[j] = (((pr[pg.group[j]!]! + shift) % pg.k) + pg.u[j]!) / pg.k;
  }
  const from = dealOrigins(destKey, originKey);
  const O = new Array<number>(K * 3).fill(0);
  for (let i = 0; i < from.length; i++) { const c = g.group[i]!, j = from[i]! * 3; O[c * 3] += prev.pos[j]!; O[c * 3 + 1] += prev.pos[j + 1]!; O[c * 3 + 2] += prev.pos[j + 2]!; }
  const b: Bundles = { D: [...g.centres], O, P: [], Q: [], W: [], T: [] };
  for (let c = 0; c < K; c++) {
    const o = [0, 1, 2].map(a => O[c * 3 + a]! / Math.max(1, g.sizes[c]!)), d = [0, 1, 2].map(a => g.centres[c * 3 + a]!);
    O.splice(c * 3, 3, ...o);
    // the bundle gathers a third of the way from its surfaces toward where the viewer will stand, then opens onto them
    const w = d.map((v, a) => v + (arrival[a]! - v) * 0.3);
    let p: number[] = [0, 0, 0], q: number[] = [0, 0, 0];   // arriving, the shader winds the curve round the tunnel's axis instead
    if (!prev.tunnel) {
      // up and over, all the same way round the room
      const round = (v: number[]) => { const x = v[2]! - center[2]!, z = -(v[0]! - center[0]!), l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; };
      const to = round(o), tw = round(w);
      p = o.map((v, a) => v + (w[a]! - v) * 0.25 + to[a]! * 2.0 + (a === 1 ? 1.5 : 0));
      q = w.map((v, a) => v + (o[a]! - v) * 0.25 - tw[a]! * 1.4 + (a === 1 ? 1.2 : 0));
    }
    // in a kick, bundles leave in turn round the room (arriving, the shader releases each as the viewer passes its patch)
    b.P.push(...p); b.Q.push(...q); b.W.push(...w); b.T.push((angleRank[c]! / K) * 0.38);
  }
  return { from, b };
}

export function createPointField(): PointField {
  const u: Record<string, IUniform> = {
    uTime: { value: 0 }, uTail: { value: TAIL_SECONDS }, uFlight: { value: 1 }, uFlightTail: { value: 1 },
    uForm: { value: 0 }, uFormTail: { value: 0 }, uTunnelTo: { value: 0 }, uTunnelFrom: { value: 0 }, uMo: { value: [1, 0, 0, 0] },
    uCenter: { value: new Vector3() }, uHalf: { value: new Vector3(1, 1, 1) }, uScale: { value: 1 }, uFloor: { value: 0 },
    uDust: { value: [0, 0, 0, 5] },
    uSize: { value: 4 }, uFocal: { value: 1000 }, uMaxPx: { value: 6 }, uPx: { value: 1 }, uGain: { value: new Vector2(0.3, 0.3) },
    uFog: { value: 0.045 }, uStreak: { value: 0.35 },
    uWsz: { value: new Vector2(POINT_METRES, POINT_METRES) }, uViewZ: { value: TUNNEL.length }, uZr: { value: new Vector2(-1, 1) },
    uBreath: { value: 0 }, uDeep: { value: 0 }, uVoice: { value: 0 },
    uFxA: { value: [0, 0, 0, 0] }, uFxB: { value: [0, 0] },
    uTrail: { value: new Vector3() }, uEye: { value: new Vector3() }, uLook: { value: new Vector3(0, 0, -1) },
    uLit: { value: 0 }, uCeilNorm: { value: 0 }, uAmb: { value: [...MOODS.liminal.amb] }, uCeilCol: { value: CEILING_COLOR },
    uLampCol: { value: LAMP_COLOR }, uSunCol: { value: [...MOODS.liminal.sun] }, uSunDir: { value: [...MOODS.liminal.sunDir] },
    uCeil: { value: new Array(MAX_CEILING * 4).fill(0) }, uCeilN: { value: 0 }, uLampL: { value: new Array(MAX_LAMPS * 4).fill(0) }, uLampN: { value: 0 },
    uEyeL: { value: [0, -100, 0, 0] }, uOrdered: { value: 0 },
    uBaked: { value: 0 }, uCeilOn: { value: 1 }, uSolid: { value: 0 }, uBakeGain: { value: [...BAKED_GAIN.liminal] },
    uHeroMin: { value: new Array(MAX_HEROES * 3).fill(0) }, uHeroMax: { value: new Array(MAX_HEROES * 3).fill(0) },
    uHeroW: { value: new Array(MAX_HEROES).fill(0) }, uHeroN: { value: 0 }, uHeroD: { value: 0 },
    uRibOn: { value: 0 }, uRibLine: { value: 0.5 }, uRibT: { value: new Array(RIB_K).fill(0) },
    ...Object.fromEntries(['uRibD', 'uRibO', 'uRibP', 'uRibQ', 'uRibW'].map(name => [name, { value: new Array(RIB_K * 3).fill(0) }])),
  };
  const material = (fs: string, defines: Record<string, string>) =>
    new ShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader: COMMON, fragmentShader: fs, defines: { ...TUNNEL_DEFINES, ...defines }, ...BLEND });
  const pointsMat = material(SQUARE_FS, {}), streakMat = material(SQUARE_FS, { STREAK: '' });
  // The additive pass is hidden behind a solid room's surfaces (it never writes depth itself, so where nothing is solid nothing changes)
  pointsMat.depthTest = true;
  // A settled lit room: opaque grains, depth-tested and depth-written, each pixel one grain's own colour
  const solidMat = new ShaderMaterial({
    glslVersion: GLSL3, uniforms: u, vertexShader: COMMON, fragmentShader: SQUARE_FS, defines: { ...TUNNEL_DEFINES, SOLID: '' },
    transparent: false, depthTest: true, depthWrite: true, blending: NoBlending,
  });
  let solid: Points | null = null;
  const ribbonMat = RIBBONS ? material(SQUARE_FS, { RLINE: '' }) : null;

  const object = new Group();
  // one grain each, drawing nothing: the void compiles the field's shaders, so the first tunnel does not wait on them
  const one = new Float32Array(3), oneArrays: Arrays = { position: one, aFrom: one, aCol: one, aFromCol: one };
  const warm = [new Points(geometryOf(oneArrays), pointsMat), new Points(geometryOf(oneArrays), solidMat),new LineSegments(subsetGeometry(oneArrays, 1, 1, 2), streakMat),
    ...(ribbonMat ? [new LineSegments(subsetGeometry(oneArrays, 1, 1, RIB_VERTS), ribbonMat)] : [])];
  for (const o of warm) { o.geometry.setDrawRange(0, 0); o.frustumCulled = false; object.add(o); }
  let points: Points | null = null, streaks: LineSegments | null = null, strands: LineSegments | null = null;
  let prev: Prev | null = null;

  const buffer = new Vector2(), camPos = new Vector3(), lastCam = new Vector3(), vel = new Vector3(), fwd = new Vector3(), tmp = new Vector3();
  let clock = 0, strandsAt = -1e9, flightT0 = -1e9, flightDur = FLIGHT_SECONDS, haveCam = false, form = 0, formSeen = 0, formVel = 0;
  let dustFrom = [0, 0, 0, 5, 0.045], dustTo = [0, 0, 0, 5, 0.045];   // the void's centre and reach, and the fog, eased across a kick
  const fxX = new Array<number>(FX.length).fill(0), fxV = new Array<number>(FX.length).fill(0), fxTarget = new Array<number>(FX.length).fill(0);
  let voiceIn = 0, voice = 0;
  let inspectTarget = -1;   // the hero the viewer is inspecting, or -1

  // lighting: the state EVA left, and the eased values the shader sees
  let lighting = LIGHTING_START, ceiling = 1, lampOn = 1, ceilingN = 0, flickerK = -1, flickerEnd = 0, nextFlicker = 20;
  const amb = u.uAmb!.value as number[], sun = u.uSunCol!.value as number[], sunDir = u.uSunDir!.value as number[], bake = u.uBakeGain!.value as number[];

  // the size uniforms follow the drawing buffer and the lens, which only the renderer knows
  const sizeFromRenderer: Points['onBeforeRender'] = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(buffer);
    u.uFocal!.value = camera.projectionMatrix.elements[5]! * buffer.y / 2;
    u.uSize!.value = POINT_METRES * (u.uFocal!.value as number);
    u.uPx!.value = buffer.y / 1440;
    u.uMaxPx!.value = 6 * buffer.y / 1440;   // up close the grains open into squares, never blobs
  };

  function dropGeometry(): void {
    for (const o of [points, streaks, strands]) if (o) { object.remove(o); o.geometry.dispose(); }
    points = streaks = strands = null;
  }

  // Work on millions of grains runs a few milliseconds a frame (ribbons.ts Steps), so a new cloud never holds a frame up: building the next
  // cloud, and the deal's half that can be worked out ahead (the last cloud's order, while the viewer is still in the tunnel).
  // A step that sets frameDone ends this frame's share, so each big buffer goes up to the GPU in a frame of its own.
  const jobs: { steps: Steps<unknown>; build: boolean }[] = [{ steps: tunnelAhead(), build: false }];
  let frameDone = false, staged: Points | null = null;
  function runJobs(): void {
    const until = performance.now() + JOB_MS;
    frameDone = false;
    while (jobs.length && !frameDone && performance.now() < until) if (jobs[0]!.steps.next().done) jobs.shift();
  }
  function cancelBuild(): void {
    for (let k = jobs.length - 1; k >= 0; k--) if (jobs[k]!.build) jobs.splice(k, 1);
    if (staged) { object.remove(staged); staged.geometry.dispose(); staged = null; }
  }
  /** The order of the cloud's grains as origins of the next deal: slabs along it, round its axis. */
  function* orderAhead(p: Prev): Steps<void> { p.order = yield* orderByKeySteps(yield* slabKeySteps(p.pos, p.n, SLABS, p.axis[0], p.axis[1])); }

  /** Everything setCloud does, in steps. The last cloud is drawn unchanged until the end; the flight is timed from the call. */
  function* build(cloud: PointCloud, calledAt: number): Steps<void> {
    const n = cloud.count, p0 = prev;
    const pos = cloud.positions.subarray(0, n * 3), col = cloud.colors.subarray(0, n * 3), tunnel = tunnels.has(cloud);
    const lit = !tunnel && !!cloud.normals;
    const a: Arrays = { position: pos, aCol: col, aFrom: pos, aFromCol: col };
    if (lit) a.aNorm = cloud.normals!.subarray(0, n * 3);

    const { lo, hi } = roomBox(pos, n);
    const center = [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
    const scale = Math.max(1, (hi[0]! - lo[0]!) / 2, (hi[2]! - lo[2]!) / 2);
    // a lit room's grains carry their lit colour; the sparse tunnel is lit by its count, and brighter
    const gain = lit ? ROOM_GAIN : Math.min(1, Math.max(0.08, 1.6e6 / n)) * (tunnel ? 2.2 : 1);
    const wsz = lit && cloud.spacing && cloud.spacing > 0 ? cloud.spacing * GRAIN_OF_SPACING : POINT_METRES;
    const axis: [number, number] = tunnel ? [0, TUNNEL.axisY] : [center[0]!, center[1]!];
    const groups = RIBBONS && lit ? groupPoints(pos, n, RIB_K) : undefined, angleRank = groups && ranksRound(groups, center);
    const onRibbons = !!groups && !!p0 && (p0.tunnel || !!p0.groups);
    let bundles: Bundles | undefined;
    if (p0) {
      // every grain is dealt a place in the last cloud to come from.
      // shortcut: a kick during a kick starts from the last cloud's homes, not mid-air; fine at one cloud per scene.
      let dealt: Uint32Array | undefined;
      if (onRibbons) { const r = dealRibbons(groups!, angleRank!, p0, center, cloud.arrival?.position ?? center); dealt = r.from; bundles = r.b; }
      else if (!tunnel) {
        // coherent: slab by slab, each grain from the same side of the axis. Arriving, the tunnel's axis on both sides; in a kick, each room's own
        const order = p0.order ?? (yield* orderByKeySteps(yield* slabKeySteps(p0.pos, p0.n, SLABS, p0.axis[0], p0.axis[1])));
        const to = p0.tunnel ? p0.axis : axis;
        dealt = yield* dealSteps(yield* slabKeySteps(pos, n, SLABS, to[0], to[1]), order);
      }
      // a tunnel after a tunnel is dealt at random, as before
      const pn = p0.n, from = new Float32Array(n * 3), fromCol = new Float32Array(n * 3);
      const pnrm = onRibbons && !p0.tunnel ? p0.nrm : undefined, fromNorm = pnrm && new Float32Array(n * 3);
      let step = (Math.floor(Math.random() * pn) | 1) + pn;
      while (gcd(step, pn) !== 1) step++;
      const off = Math.floor(Math.random() * pn);
      for (let i = 0; i < n; i++) {
        const j = (dealt ? dealt[i]! : (i * step + off) % pn) * 3;
        for (let k = 0; k < 3; k++) { from[i * 3 + k] = p0.pos[j + k]!; fromCol[i * 3 + k] = p0.col[j + k]!; }
        if (fromNorm) for (let k = 0; k < 3; k++) fromNorm[i * 3 + k] = pnrm![j + k]!;
        if (i % 65536 === 65535) yield;
      }
      a.aFrom = from; a.aFromCol = fromCol;
      if (fromNorm) a.aFromNorm = fromNorm;
    }

    // up to the GPU a buffer a frame, on an object that draws one grain (drivers may hold a buffer back until it is drawn from)
    const g = new BufferGeometry();
    g.setDrawRange(0, 1);
    staged = new Points(g, pointsMat);
    staged.frustumCulled = false; staged.renderOrder = 1;
    object.add(staged);
    for (const [name, arr] of Object.entries(a)) if (arr) { g.setAttribute(name, new BufferAttribute(arr, 3)); frameDone = true; yield; }
    const streakGeometry = subsetGeometry(a, n, STREAK_STRIDE, 2);
    const strandGeometry = ribbonMat ? subsetGeometry(a, n, RIB_STRIDE, RIB_VERTS) : null;
    frameDone = true; yield;

    // the swap: from here on, as setCloud always did at once
    const m = Math.min(1, Math.max(0, (clock - flightT0) / flightDur));
    dustFrom = dustFrom.map((v, k) => v + (dustTo[k]! - v) * ease(m));
    // the long tunnel needs to be seen to its end; a lit room is evenly lit, so its far end only dims a little
    dustTo = [center[0]!, center[1]!, center[2]!, scale, tunnel ? 0.022 : lit ? 0.015 : 0.07];
    u.uRibOn!.value = onRibbons ? 1 : 0;
    if (bundles) { u.uRibD!.value = bundles.D; u.uRibO!.value = bundles.O; u.uRibP!.value = bundles.P; u.uRibQ!.value = bundles.Q; u.uRibW!.value = bundles.W; u.uRibT!.value = bundles.T; }
    if (p0) {
      flightT0 = calledAt; flightDur = p0.tunnel ? ARRIVAL_SECONDS : onRibbons ? RIB_KICK_SECONDS : FLIGHT_SECONDS;
      u.uMo!.value = [1 + Math.floor(Math.random() * 60000), p0.tunnel ? 0 : 0.075, p0.tunnel ? 0 : FLIGHT_SECONDS / SPLASH_SECONDS, 0];
      u.uTunnelFrom!.value = p0.tunnel ? 1 : 0;
    } else dustFrom = dustTo;
    const gains = u.uGain!.value as Vector2;
    gains.set(p0 ? gains.y : gain, gain);
    const wszs = u.uWsz!.value as Vector2;
    wszs.set(p0 ? wszs.y : wsz, wsz);
    // the tunnel's half of the ribbons' deal is worked out now, so the room's arrival has less to do in one frame
    prev = { pos, col, n, tunnel, axis, nrm: groups && a.aNorm, groups, angleRank, tunnelOrder: RIBBONS && tunnel ? tunnelOrder(pos, n, TUNNEL.axisY, TUNNEL_TWIST) : undefined };
    jobs.push({ steps: orderAhead(prev), build: false });
    u.uTunnelTo!.value = tunnel ? 1 : 0;
    u.uOrdered!.value = cloud.ordered === true ? 1 : 0;
    (u.uZr!.value as Vector2).set(lo[2]!, hi[2]!);
    // the room's heroes; a new room starts with none inspected
    const heroes = (tunnel ? [] : cloud.heroes ?? []).slice(0, MAX_HEROES), hMin = u.uHeroMin!.value as number[], hMax = u.uHeroMax!.value as number[];
    heroes.forEach((h, k) => { for (let a = 0; a < 3; a++) { hMin[k * 3 + a] = h.min[a]!; hMax[k * 3 + a] = h.max[a]!; } });
    u.uHeroN!.value = heroes.length;
    (u.uHeroW!.value as number[]).fill(0); u.uHeroD!.value = 0; inspectTarget = -1;

    (u.uCenter!.value as Vector3).fromArray(center);
    (u.uHalf!.value as Vector3).set(Math.max(0.5, (hi[0]! - lo[0]!) / 2), Math.max(0.5, (hi[1]! - lo[1]!) / 2), Math.max(0.5, (hi[2]! - lo[2]!) / 2));
    u.uScale!.value = scale;
    u.uFloor!.value = lo[1]!;

    // the room's own lights; a new room starts in the liminal ceiling light with its lamps on
    u.uLit!.value = lit ? 1 : 0;
    u.uBaked!.value = lit && cloud.lit === true ? 1 : 0;
    const fittings = lit ? (cloud.lights?.ceiling ?? []).slice(0, MAX_CEILING) : [], bulbs = lit ? (cloud.lights?.lamps ?? []).slice(0, MAX_LAMPS) : [];
    const cw = u.uCeil!.value as number[], lwv = u.uLampL!.value as number[];
    fittings.forEach((f, k) => { cw[k * 4] = f[0]; cw[k * 4 + 1] = f[1]; cw[k * 4 + 2] = f[2]; });
    bulbs.forEach((b, k) => { lwv[k * 4] = b[0]; lwv[k * 4 + 1] = b[1]; lwv[k * 4 + 2] = b[2]; });
    ceilingN = fittings.length; u.uCeilN!.value = ceilingN; u.uLampN!.value = bulbs.length;
    const atFloor = ceilingAt([center[0]!, lo[1]!, center[2]!], fittings);
    u.uCeilNorm!.value = atFloor > 0 ? CEILING_AT_FLOOR / atFloor : 0;   // the same pools whatever the room's fittings
    lighting = LIGHTING_START;

    // the last cloud's buffers are freed a few frames on, not in the frame that first draws the new one
    const old = [points, streaks, strands].filter((o): o is Points | LineSegments => !!o);
    old.forEach(o => object.remove(o));
    points = streaks = strands = null;
    jobs.push({ steps: (function* () { for (let k = 0; k < 3; k++) { frameDone = true; yield; } old.forEach(o => o.geometry.dispose()); })(), build: false });
    points = staged; staged = null;
    g.setDrawRange(0, Infinity);
    streaks = new LineSegments(streakGeometry, streakMat);
    points.onBeforeRender = sizeFromRenderer;
    // the solid pass shares the grains; it is drawn first (opaque), as a child so it leaves with them
    solid = new Points(g, solidMat);
    solid.frustumCulled = false; solid.onBeforeRender = sizeFromRenderer; solid.visible = false;
    points.add(solid);
    // built for every cloud (dark unless on ribbons) and drawn for a moment, so its shader is compiled before the arrival needs it
    if (strandGeometry) { strands = new LineSegments(strandGeometry, ribbonMat!); strandsAt = clock; }
    [streaks, strands].forEach((o, k) => { if (o) { o.frustumCulled = false; o.renderOrder = k + 2; object.add(o); } });
  }

  return {
    object,

    setCloud(cloud) {
      const n = cloud.count;
      if (!Number.isInteger(n) || n < 1 || cloud.positions.length < n * 3 || cloud.colors.length < n * 3) throw new RangeError('point cloud arrays are shorter than its count');
      if (cloud.normals && cloud.normals.length < n * 3) throw new RangeError('point cloud normals are shorter than its count');
      cancelBuild();
      // the last cloud (or the void) stays as it is until this one is ready, a few frames from now. Work queued in advance runs first:
      // it is the last cloud's half of the deal, which this build needs anyway
      jobs.push({ steps: build(cloud, clock), build: true });
    },

    setFormation(progress) { form = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)); },

    setEffect(effect, intensity) {
      const k = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
      fxTarget.fill(0);
      const i = FX.indexOf(effect as typeof FX[number]);
      if (i >= 0) fxTarget[i] = k;
    },

    setVoice(level) { voiceIn = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0; },

    update(time, dt, camera) {
      runJobs();
      dt = Math.min(0.1, Math.max(0, dt));
      clock = time;
      u.uTime!.value = time;
      const m = Math.min(1, Math.max(0, (time - flightT0) / flightDur));
      u.uFlight!.value = m; u.uFlightTail!.value = Math.max(0, m - TAIL_SECONDS / flightDur);
      if (strands) strands.visible = m < 1 || time - strandsAt < 0.5;   // every strand is home by the end of its flight
      const em = ease(m);
      const dust = dustFrom.map((v, k) => v + (dustTo[k]! - v) * em);
      u.uDust!.value = dust.slice(0, 4);
      // leaving the tunnel, its long sight-line fog holds until the viewer is nearly in the room
      const fe = (u.uTunnelFrom!.value as number) > 0.5 ? smooth(0.6, 1, m) : em;
      u.uFog!.value = dustFrom[4]! + (dustTo[4]! - dustFrom[4]!) * fe;
      if (dt > 0) formVel += ((form - formSeen) / dt - formVel) * Math.min(1, dt * 8);
      formSeen = form;
      u.uForm!.value = form; u.uFormTail!.value = Math.min(1, Math.max(0, form - formVel * TAIL_SECONDS));

      // each effect eases on a critically damped spring: in and out over about a second and a half, never a pop
      const sdt = Math.min(dt, 0.05), w = 3.2;
      for (let i = 0; i < FX.length; i++) {
        fxV[i] = fxV[i]! + (w * w * (fxTarget[i]! - fxX[i]!) - 2 * w * fxV[i]!) * sdt;
        fxX[i] = Math.max(0, fxX[i]! + fxV[i]! * sdt);
      }
      u.uFxA!.value = fxX.slice(0, 4);
      u.uFxB!.value = fxX.slice(4, 6);
      u.uBreath!.value = breathCurve(time, 5.6);
      u.uDeep!.value = breathCurve(time, 4.4);

      voice += (voiceIn - voice) * Math.min(1, dt * 12);
      u.uVoice!.value = voice;

      // inspection eases hero by hero, so moving from one to another fades the first out as the next comes in
      const heroW = u.uHeroW!.value as number[], ki = 1 - Math.exp(-dt / INSPECT_EASE);
      let deepest = 0;
      for (let k = 0; k < MAX_HEROES; k++) {
        const t = k === inspectTarget ? 1 : 0, w = heroW[k]! + (t - heroW[k]!) * ki;
        heroW[k] = Math.abs(t - w) < 1e-3 ? t : w;
        deepest = Math.max(deepest, heroW[k]!);
      }
      u.uHeroD!.value = deepest;

      // a lit room settles into the solid pass; any effect hands it back to the additive one first
      const still = (u.uBaked!.value as number) > 0.5 && fxTarget.every(t => t === 0) && fxX.every(x => x < 0.01);
      const sv = u.uSolid!.value as number, st = still ? 1 : 0, sk = 1 - Math.exp(-dt / SOLID_EASE);
      u.uSolid!.value = Math.abs(st - sv) < 1e-3 ? st : sv + (st - sv) * sk;
      if (solid) solid.visible = (u.uSolid!.value as number) > 0.001;

      // lighting eases toward the mood; the ceiling drifts slowly, fitting by fitting, and now and then one tube stutters
      const mood = MOODS[lighting.mood], k = 1 - Math.exp(-dt / LIGHT_EASE);
      // exponential, plus a little linear so it truly arrives: off is black, not a faint residue lifted by the tone curve
      const toward = (x: number, t: number) => { const y = x + (t - x) * k, s = 0.03 * dt; return Math.abs(t - y) <= s ? t : y + Math.sign(t - y) * s; };
      for (let i = 0; i < 3; i++) { amb[i] = toward(amb[i]!, mood.amb[i]!); sun[i] = toward(sun[i]!, mood.sun[i]!); sunDir[i] = toward(sunDir[i]!, mood.sunDir[i]!); }
      ceiling = toward(ceiling, mood.ceiling);
      for (let i = 0; i < 3; i++) bake[i] = toward(bake[i]!, BAKED_GAIN[lighting.mood][i]!);
      u.uCeilOn!.value = ceiling;
      lampOn = toward(lampOn, lighting.lamp ? 1 : 0);
      if (time > nextFlicker && ceilingN > 0) {
        flickerK = Math.floor(Math.random() * ceilingN); flickerEnd = time + 0.4 + Math.random() * 0.9; nextFlicker = time + 15 + Math.random() * 35;
      }
      const cw = u.uCeil!.value as number[], lwv = u.uLampL!.value as number[];
      for (let i = 0; i < ceilingN; i++) {
        const drift = 1 + 0.045 * Math.sin(time * 0.19 + i * 1.9) + 0.03 * Math.sin(time * 0.061 + i * 0.7);
        const stutter = i === flickerK && time < flickerEnd && Math.sin(time * 53) * Math.sin(time * 17.3 + i) > 0.12 ? 0.2 : 1;
        cw[i * 4 + 3] = ceiling * drift * stutter;
      }
      for (let i = 0; i < MAX_LAMPS; i++) lwv[i * 4 + 3] = lampOn;

      // streaks trail where each grain was relative to the eye as it flew; at rest there are none
      camera.getWorldPosition(camPos);
      camera.getWorldDirection(fwd);
      const eye = u.uEye!.value as Vector3, look = u.uLook!.value as Vector3, jumped = !haveCam || camPos.distanceTo(lastCam) > 2;
      if (haveCam && dt > 0 && !jumped) vel.lerp(tmp.subVectors(camPos, lastCam).divideScalar(dt), 1 - Math.exp(-dt * 6));
      if (jumped) { vel.set(0, 0, 0); eye.copy(camPos); look.copy(fwd); }
      eye.lerp(camPos, 1 - Math.exp(-dt * 1.5)); look.lerp(fwd, 1 - Math.exp(-dt * 1.5)).normalize();
      lastCam.copy(camPos); haveCam = true;
      u.uViewZ!.value = camPos.z;
      (u.uTrail!.value as Vector3).copy(vel).multiplyScalar(1.2);
    },

    setLighting(light) { lighting = nextLighting(lighting, light); },

    setInspect(hero) { inspectTarget = Number.isInteger(hero) && hero >= 0 && hero < (u.uHeroN!.value as number) ? hero : -1; },

    setEyeLight(position, glow) {
      const e = u.uEyeL!.value as number[], g = Number.isFinite(glow) ? Math.min(1, Math.max(0, glow)) : 0;
      if (![position.x, position.y, position.z].every(Number.isFinite)) { e[3] = 0; return; }
      e[0] = position.x; e[1] = position.y; e[2] = position.z; e[3] = g;
    },

    dispose() {
      cancelBuild();
      jobs.length = 0;
      dropGeometry();
      for (const o of warm) { object.remove(o); o.geometry.dispose(); }
      for (const mat of [pointsMat, streakMat, ribbonMat, solidMat]) mat?.dispose();
      prev = null;
    },
  };
}
