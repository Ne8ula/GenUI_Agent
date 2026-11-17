// The menu as it is drawn: each choice is the object itself as a small point cloud, turning slowly, laid out round the eye's place
// on screen (menu.ts has the arrangements). No words: the selected choice is the large bright one, in brackets; a refused one turns
// the eye's red. The choices come out of the eye when the menu opens and go back into it when it closes.
import {
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, GLSL3, Group, LineBasicMaterial, LineSegments, Matrix4, OneFactor,
  OneMinusSrcColorFactor, Points, ShaderMaterial, Vector2, Vector3, type PerspectiveCamera,
} from 'three';
import { menuLayout, menuTurn, type MenuArrangement, type MenuPoints } from './menu.ts';

const DEPTH = 2;             // metres in front of the viewer: near enough to turn in perspective, far enough to stay small
const THUMB_POINTS = 6000;   // a choice is drawn with at most this many of its points
const EASE = 0.12;           // seconds per e-fold: the selection, and the menu opening and closing
const FOLLOW = 0.35;         // the menu follows the eye this softly, so the eye's wander does not shake it
const MARGIN = 0.06;         // kept clear of the frame's edge, in halves of its height

export interface MenuView {
  /** Add to the scene. */
  readonly object: Group;
  /** The choices, in the menu's order. */
  setChoices(choices: readonly MenuPoints[]): void;
  /** Once per frame, after the camera and the eye have moved. `open`: the selected choice and the refused ones, or null when closed. */
  update(open: { index: number; refused: ReadonlySet<number> } | null, time: number, dt: number, camera: PerspectiveCamera, eye: Vector3): void;
  dispose(): void;
}

const THUMB_VS = /* glsl */ `
uniform float uPx, uLight, uRefused; in vec3 aCol; out vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // the far side of an object is dimmer, so it reads as a solid thing while it turns
  float facing = dot(normal, normal) < 0.5 ? 1.0 : smoothstep(-0.2, 0.3, dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  vec3 c = pow(aCol, vec3(0.7));                                  // lifted: a small dark object must still read against the room
  c = mix(c, vec3(0.95, 0.06, 0.03) * (0.45 + dot(c, vec3(0.2126, 0.7152, 0.0722))), uRefused);   // refused: the eye's red
  vCol = min(c, vec3(0.8)) * uLight * mix(0.25, 1.0, facing);     // short of the glow's threshold
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, floor(uPx + 0.5));                      // whole pixels: crisp square grains
}`;
const THUMB_FS = /* glsl */ `precision highp float; in vec3 vCol; out vec4 o; void main() { o = vec4(vCol, 1.0); }`;

/** A choice's points, at most `most` of them, centred, its longest side 1. */
function thumbGeometry(points: MenuPoints, most: number): BufferGeometry {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.count * 3; i++) { lo[i % 3] = Math.min(lo[i % 3]!, points.positions[i]!); hi[i % 3] = Math.max(hi[i % 3]!, points.positions[i]!); }
  const side = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) || 1;
  const stride = Math.max(1, Math.ceil(points.count / most)), n = Math.ceil(points.count / stride);
  const position = new Float32Array(n * 3), colour = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  for (let o = 0; o < n; o++) for (let a = 0; a < 3; a++) {
    const j = o * stride * 3 + a;
    position[o * 3 + a] = (points.positions[j]! - (lo[a]! + hi[a]!) / 2) / side;
    colour[o * 3 + a] = points.colors[j]!;
    if (points.normals) normal[o * 3 + a] = points.normals[j]!;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aCol', new BufferAttribute(colour, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));   // zero where the points have none: then nothing is dimmed
  return geometry;
}

/** `scale`: the whole arrangement this many times its size, and `most` points to a choice: the void's three rooms are larger and finer than a menu's objects. */
export function createMenuView(arrangement: MenuArrangement, scale = 1, most = THUMB_POINTS): MenuView {
  // the group carries the camera's own frame, so its children are placed in view space: x right, y up, the viewer looking down -z
  const object = new Group();
  object.matrixAutoUpdate = false; object.visible = false;
  // light on light, over whatever is behind, like the field's grains
  const blend = { transparent: true, depthTest: false, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcColorFactor } as const;
  let thumbs: Points<BufferGeometry, ShaderMaterial>[] = [];
  // corner brackets round the selected choice
  const corner: number[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) corner.push(sx * 0.5, sy * 0.5, 0, sx * 0.3, sy * 0.5, 0, sx * 0.5, sy * 0.5, 0, sx * 0.5, sy * 0.3, 0);
  const brackets = new LineSegments(new BufferGeometry().setAttribute('position', new BufferAttribute(Float32Array.from(corner), 3)),
    new LineBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false }));
  brackets.renderOrder = 8; brackets.frustumCulled = false;
  object.add(brackets);

  const buffer = new Vector2(1, 1440), inverse = new Matrix4(), local = new Vector3();
  let presence = 0, shown = 0, anchorX = 0, anchorY = 0;

  const drop = () => { for (const thumb of thumbs) { object.remove(thumb); thumb.geometry.dispose(); thumb.material.dispose(); } thumbs = []; };

  return {
    object,
    setChoices(choices) {
      drop();
      thumbs = choices.map(points => {
        const material = new ShaderMaterial({ glslVersion: GLSL3, vertexShader: THUMB_VS, fragmentShader: THUMB_FS, uniforms: { uPx: { value: 2 }, uLight: { value: 0 }, uRefused: { value: 0 } }, ...blend });
        const thumb = new Points(thumbGeometry(points, most), material);
        thumb.frustumCulled = false; thumb.renderOrder = 8;
        thumb.onBeforeRender = renderer => { renderer.getDrawingBufferSize(buffer); };
        object.add(thumb);
        return thumb;
      });
    },
    update(open, time, dt, camera, eye) {
      const count = thumbs.length, k = 1 - Math.exp(-Math.max(0, dt) / EASE);
      const opening = !!open && count > 0 && presence < 0.01;
      presence += ((open && count ? 1 : 0) - presence) * k;
      object.visible = presence > 0.01;
      if (!object.visible) { presence = open ? presence : 0; return; }
      if (open) shown = opening ? open.index : (((shown + menuTurn(open.index, shown, count) * k) % count) + count) % count;
      object.matrix.copy(camera.matrixWorld); object.matrixWorldNeedsUpdate = true;

      // the frame at the menu's depth: half its height in metres, and its width in halves of its height
      const half = DEPTH * Math.tan(camera.fov * Math.PI / 360), aspect = camera.aspect;
      const slots = menuLayout(arrangement, count, shown, aspect / scale).map(slot => ({ x: slot.x * scale, y: slot.y * scale, size: slot.size * scale, light: slot.light }));
      // the eye's place on screen, moved in from the edge until every choice fits; an eye behind the viewer counts as far to its side
      local.copy(eye).applyMatrix4(inverse.copy(camera.matrixWorld).invert());
      const ahead = Math.max(0.3, -local.z), fit = (value: number, low: number, high: number) => (low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value)));
      const left = Math.min(...slots.map(s => s.x - s.size / 2)), right = Math.max(...slots.map(s => s.x + s.size / 2));
      const bottom = Math.min(...slots.map(s => s.y - s.size / 2)), top = Math.max(...slots.map(s => s.y + s.size / 2));
      const margin = Math.max(MARGIN, 0.14 * Math.max(...slots.map(s => s.size)));   // the brackets stand an eighth of its size out from the selected choice
      const targetX = fit(local.x / ahead * DEPTH / half, -aspect + margin - left, aspect - margin - right);
      const targetY = fit(local.y / ahead * DEPTH / half, -1 + margin - bottom, 1 - margin - top);
      const follow = opening ? 1 : 1 - Math.exp(-Math.max(0, dt) / FOLLOW);
      anchorX += (targetX - anchorX) * follow; anchorY += (targetY - anchorY) * follow;

      const px = buffer.y / 1440;
      thumbs.forEach((thumb, i) => {
        const slot = slots[i]!, size = slot.size * presence * half;
        thumb.visible = size > 1e-4;
        thumb.position.set((anchorX + slot.x * presence) * half, (anchorY + slot.y * presence) * half, -DEPTH);
        thumb.scale.setScalar(size);
        thumb.rotation.set(0.25, time * 0.5 + i * 1.7, 0);
        const u = thumb.material.uniforms;
        u.uLight!.value = slot.light * presence;
        u.uPx!.value = (1.2 + 5 * slot.size / scale) * px;   // the selected choice's grains a little larger
        u.uRefused!.value = open?.refused.has(i) ? 1 : 0;
      });
      const selected = open ? slots[open.index] : undefined;
      brackets.visible = !!selected;
      if (selected) {
        brackets.position.set((anchorX + selected.x * presence) * half, (anchorY + selected.y * presence) * half, -DEPTH);
        brackets.scale.setScalar(selected.size * 1.25 * presence * half);
        brackets.material.opacity = presence;
      }
    },
    dispose() { drop(); brackets.geometry.dispose(); brackets.material.dispose(); },
  };
}
