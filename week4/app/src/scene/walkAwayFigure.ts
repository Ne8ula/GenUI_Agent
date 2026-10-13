// Live articulated rear-view figure for walk-away-r3. The inspected Weave still supplies material,
// not animation frames. Joints, foot contacts, limb meshes and the receding path are authored here.
import type { ConstructionCommand, ConstructionTextureVertex } from './constructionTypes.ts';
import type { PhotoHome, PhotoPose } from './seed33Photo.ts';
import type { Rgb } from './types.ts';

type Point = readonly [number, number];
const ASPECT = 16 / 9;
const SOURCE_ASPECT = 270 / 670;
export const WALK_STRIDE_MS = 1600;
export const WALK_STANCE_FRACTION = 0.62;
export const WALK_HOME: PhotoHome = { centerX: 995 / 2752, topY: 520 / 1536, heightFrac: 670 / 1536 };
const finiteTime = (ms: number) => Number.isFinite(ms) ? Math.max(0, Math.min(ms, 30_000)) : 0;
const uv = (x: number, y: number): Point => [x / 540, y / 1340];
const mix = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function groundAt(ms: number, home: PhotoHome): { point: Point; scale: number } {
  const t = finiteTime(ms) / 1000;
  const scale = 1 / (1 + 0.05 * t);
  const travel = t - 0.35 * (1 - Math.exp(-t / 0.35));
  return { point: [home.centerX - 0.017 * travel, 0.49 + (home.topY + home.heightFrac * 0.965 - 0.49) * scale], scale };
}

export function walkAwayPose(msAfterBuild: number, reduced: boolean, home: PhotoHome = WALK_HOME): PhotoPose {
  const ms = reduced ? 0 : finiteTime(msAfterBuild);
  const ground = groundAt(ms, home);
  const heightFrac = home.heightFrac * ground.scale;
  const phase = 2 * Math.PI * ms / WALK_STRIDE_MS;
  const bob = reduced ? 0 : 0.006 * heightFrac * (1 - Math.cos(2 * phase));
  const centerX = ground.point[0];
  return { centerX, headTopY: ground.point[1] - 0.965 * heightFrac + bob, heightFrac,
    legPhase: phase, offFrame: centerX + heightFrac * SOURCE_ASPECT / ASPECT / 2 < 0 };
}

export interface WalkFoot {
  contact: Point;
  ankle: Point;
  stance: boolean;
  phase: number;
}
export interface WalkJoints {
  pose: PhotoPose;
  leftFoot: WalkFoot;
  rightFoot: WalkFoot;
  leftHip: Point;
  rightHip: Point;
  leftKnee: Point;
  rightKnee: Point;
}

function footAt(ms: number, side: -1 | 1, home: PhotoHome, height: number): WalkFoot {
  const offset = (side === -1 ? 0.70 : 0.20) * WALK_STRIDE_MS;
  const cycle = Math.floor((ms + offset) / WALK_STRIDE_MS);
  const start = cycle * WALK_STRIDE_MS - offset;
  const phase = (ms + offset) / WALK_STRIDE_MS - cycle;
  const contactAt = (time: number): Point => {
    const g = groundAt(time + WALK_STRIDE_MS * 0.28, home);
    return [g.point[0] + side * 0.009 * g.scale, g.point[1] + side * 0.003 * g.scale];
  };
  const stance = phase < WALK_STANCE_FRACTION;
  const swing = stance ? 0 : (phase - WALK_STANCE_FRACTION) / (1 - WALK_STANCE_FRACTION);
  const eased = swing * swing * (3 - 2 * swing);
  const contact = mix(contactAt(start), contactAt(start + WALK_STRIDE_MS), eased);
  const lift = Math.sin(Math.PI * swing) * height * 0.075;
  return { contact, ankle: [contact[0] + height * 0.025 / ASPECT, contact[1] - height * 0.025 - lift], stance, phase };
}

/** Two-bone leg solve in frame-height units, so x/y have equal physical scale. */
function kneeAt(hip: Point, ankle: Point, height: number): Point {
  const dx = (ankle[0] - hip[0]) * ASPECT, dy = ankle[1] - hip[1];
  const distance = Math.max(1e-8, Math.hypot(dx, dy));
  const a = height * 0.25, b = height * 0.24;
  const d = Math.min(distance, a + b - 1e-7);
  const along = (a * a - b * b + d * d) / (2 * d);
  const bend = Math.sqrt(Math.max(0, a * a - along * along));
  return [hip[0] + (dx / distance * along - dy / distance * bend) / ASPECT,
    hip[1] + dy / distance * along + dx / distance * bend];
}

function sourcePoint(pose: PhotoPose, p: Point): Point {
  return [pose.centerX + (p[0] - 0.5) * pose.heightFrac * SOURCE_ASPECT / ASPECT, pose.headTopY + p[1] * pose.heightFrac];
}

export function walkJoints(msAfterBuild: number, reduced: boolean, home: PhotoHome = WALK_HOME): WalkJoints {
  const ms = reduced ? 0 : finiteTime(msAfterBuild);
  const pose = walkAwayPose(ms, reduced, home), h = pose.heightFrac;
  const leftHip = sourcePoint(pose, uv(232, 625)), rightHip = sourcePoint(pose, uv(324, 625));
  const leftFoot = footAt(ms, -1, home, h), rightFoot = footAt(ms, 1, home, h);
  return { pose, leftHip, rightHip, leftFoot, rightFoot,
    leftKnee: kneeAt(leftHip, leftFoot.ankle, h), rightKnee: kneeAt(rightHip, rightFoot.ankle, h) };
}

const polygon = (...coords: readonly Point[]): readonly Point[] => coords.map(([x, y]) => uv(x, y));

/** Texture polygons are separate body panels: moving an arm does not leave a second arm in a whole-sprite backing. */
export function buildWalkAwayFigure(msAfterBuild: number, reduced: boolean, home: PhotoHome = WALK_HOME): readonly ConstructionCommand[] {
  const joints = walkJoints(msAfterBuild, reduced, home), { pose } = joints;
  if (pose.offFrame) return [];
  const h = pose.heightFrac, phase = pose.legPhase;
  const out: ConstructionCommand[] = [];
  const emit = (id: string, points: readonly Point[], map: (p: Point) => Point) => {
    const vertices = points.map((p): ConstructionTextureVertex => { const q = map(p); return { x: q[0], y: q[1], u: p[0], v: p[1] }; });
    for (let i = 1; i < vertices.length - 1; i++) out.push({ kind: 'texture', id: `walker:${id}:${i}`, component: 'figure-walk', alpha: 1, texture: 'figure', vertices: [vertices[0]!, vertices[i]!, vertices[i + 1]!] });
  };
  const body = (p: Point): Point => {
    const q = sourcePoint(pose, p);
    const lean = reduced ? 0 : Math.sin(phase) * 0.008 * h * (0.48 - p[1]);
    return [q[0] + lean / ASPECT, q[1]];
  };
  const limb = (id: string, points: readonly Point[], from: Point, to: Point, start: Point, end: Point) => {
    const sx = (to[0] - from[0]) * SOURCE_ASPECT, sy = to[1] - from[1];
    const sl = Math.hypot(sx, sy);
    const dx = (end[0] - start[0]) * ASPECT, dy = end[1] - start[1];
    const dl = Math.max(1e-8, Math.hypot(dx, dy));
    emit(id, points, p => {
      const px = (p[0] - from[0]) * SOURCE_ASPECT, py = p[1] - from[1];
      const along = (px * sx + py * sy) / (sl * sl);
      const across = (sx * py - sy * px) / sl * h;
      return [start[0] + (dx * along - dy / dl * across) / ASPECT, start[1] + dy * along + dx / dl * across];
    });
  };
  const light: Rgb = [0.97, 0.84, 0.69], dark: Rgb = [0.12, 0.075, 0.05];
  const filled = (id: string, points: readonly Point[]) => {
    for (let i = 1; i < points.length - 1; i++) out.push({ kind: 'solid', id: `walker:${id}:${i}`, component: 'figure-walk', alpha: 1, colour: dark, points: [points[0]!, points[i]!, points[i + 1]!] });
    out.push({ kind: 'stroke', id: `walker:${id}:edge`, component: 'figure-walk', alpha: 0.72, widthPx: Math.max(0.7, h * 3), colour: light, points: [...points, points[0]!] });
  };
  const beadedBone = (id: string, start: Point, end: Point, radiusA: number, radiusB: number) => {
    const dx = (end[0] - start[0]) * ASPECT, dy = end[1] - start[1], length = Math.max(1e-8, Math.hypot(dx, dy));
    const normal: Point = [-dy / length / ASPECT, dx / length];
    const edge = (p: Point, r: number, sign: number): Point => [p[0] + normal[0] * r * sign, p[1] + normal[1] * r * sign];
    filled(id, [edge(start,radiusA,1),edge(end,radiusB,1),edge(end,radiusB,-1),edge(start,radiusA,-1)]);
    const rows = Math.max(5, Math.min(22, Math.ceil(length / (h * 0.015))));
    for (let row = 0; row <= rows; row++) {
      const t = row / rows, p = mix(start, end, t), radius = radiusA + (radiusB - radiusA) * t;
      for (let col = -2; col <= 2; col++) {
        const f = (col + (row % 2 ? 0.25 : -0.25)) / 2.8;
        out.push({ kind: 'disc', id: `walker:${id}:bead:${row}:${col}`, component: 'figure-walk', alpha: 0.72 + 0.25 * (1 - Math.abs(f)), colour: light,
          radiusPx: Math.max(0.5, h * 1080 * 0.0038), center: edge(p, radius, f) });
      }
    }
  };
  // Native beaded limb volumes avoid stretching a short calf crop into a rubbery full leg.
  // Both feet have an explicit flat sole; stance soles stay on the same scene-space contact.
  for (const side of [-1, 1] as const) {
    const left = side === -1, foot = left ? joints.leftFoot : joints.rightFoot;
    const hip = left ? joints.leftHip : joints.rightHip, knee = left ? joints.leftKnee : joints.rightKnee;
    const tag = left ? 'left' : 'right';
    beadedBone(`${tag}-thigh`, hip, knee, h * 0.025, h * 0.022);
    beadedBone(`${tag}-calf`, knee, foot.ankle, h * 0.022, h * 0.014);
    const floorY = foot.ankle[1] + h * 0.025, cx = foot.contact[0];
    const shoe = [[cx+h*0.039/ASPECT,floorY],[cx-h*0.044/ASPECT,floorY],
      [cx-h*0.045/ASPECT,floorY-h*0.010],[cx-h*0.025/ASPECT,floorY-h*0.019],
      [cx+h*0.026/ASPECT,floorY-h*0.033],[cx+h*0.04/ASPECT,floorY-h*0.020]] as const;
    filled(`${tag}-shoe`, shoe);
    for (let row=0;row<3;row++) for(let col=0;col<7;col++) out.push({kind:'disc',id:`walker:${tag}-shoe:bead:${row}:${col}`,component:'figure-walk',alpha:0.72,colour:light,radiusPx:Math.max(0.45,h*2.8),center:[cx+(-0.032+col*0.01)*h/ASPECT,floorY-(0.005+row*0.006)*h]});
  }
  const arm = (side: -1 | 1) => {
    const left = side === -1, swing = reduced ? 0 : Math.sin(phase + (left ? Math.PI : 0));
    const shoulderUV = left ? uv(171,290) : uv(375,294), elbowUV = left ? uv(110,477) : uv(387,500), wristUV = left ? uv(160,578) : uv(423,630);
    const shoulder = body(shoulderUV);
    const elbow: Point = [shoulder[0] + (side * 0.023 + swing * 0.034) * h / ASPECT, shoulder[1] + h * 0.145];
    const wrist: Point = [elbow[0] + (side * 0.009 + swing * 0.043) * h / ASPECT, elbow[1] + h * (0.11 - 0.018 * Math.max(0, swing))];
    limb(`${left ? 'left' : 'right'}-upper-arm`, left ? polygon([141,258],[194,282],[156,476],[69,487]) : polygon([338,260],[410,282],[423,514],[343,513]), shoulderUV, elbowUV, shoulder, elbow);
    limb(`${left ? 'left' : 'right'}-forearm`, left ? polygon([69,478],[153,458],[183,566],[147,608]) : polygon([342,490],[425,480],[450,619],[398,674]), elbowUV, wristUV, elbow, wrist);
  };
  arm(-1);
  emit('head', polygon([189,66],[397,66],[397,251],[189,251]), body);
  emit('torso', polygon([193,243],[343,241],[384,348],[340,476],[347,570],[143,570],[148,475],[135,342]), body);
  const coat = (p: Point): Point => {
    const q = body(p), weight = Math.max(0, (p[1] - 0.43) / 0.30);
    const lag = reduced ? 0 : Math.sin(phase - 0.45 + (p[0] < 0.5 ? 0 : Math.PI)) * 0.018 * h * weight;
    return [q[0] + lag / ASPECT, q[1] + Math.abs(lag) * 0.18];
  };
  emit('coat-left', polygon([146,477],[272,477],[277,771],[195,957],[90,947],[137,638]), coat);
  emit('coat-right', polygon([270,477],[340,477],[397,642],[445,957],[321,963],[274,771]), coat);
  arm(1);
  return out;
}
