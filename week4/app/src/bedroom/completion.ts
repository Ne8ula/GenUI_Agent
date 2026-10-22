import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const COMPLETION_POINT_SPACING = .024;

// shortcut: hand-placed backing for scan 45261631; replace with calibrated geometry for other rooms.
export function createRoomCompletion() {
  const geometries: THREE.BufferGeometry[] = [];
  const parts: { name: string; start: number; count: number }[] = [];
  const angle = Math.atan2(.6417793929, .7668893081);
  let start = 0;
  function part(name: string, input: THREE.BufferGeometry, color: string) {
    const geometry = input.index ? input.toNonIndexed() : input;
    if (geometry !== input) input.dispose();
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors = new Float32Array(positions.count * 3), base = new THREE.Color(color);
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getZ(i);
      const shade = (.85 + .1 * (z + 1.4) / 2.5) * (.94 + .06 * Math.max(0, normals.getZ(i)));
      base.clone().multiplyScalar(shade).toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.rotateZ(angle);
    parts.push({ name, start, count: positions.count }); start += positions.count;
    geometries.push(geometry);
  }
  function box(name: string, size: [number, number, number], at: [number, number, number], color: string, radius = 0) {
    const geometry = radius ? new RoundedBoxGeometry(...size, 3, radius) : new THREE.BoxGeometry(...size);
    geometry.translate(...at); part(name, geometry, color);
  }
  const floor = -1.4, top = 1.025;
  const outline: [number, number][] = [[.25, .65], [1.15, .65], [1.85, 1.32], [3.8, 1.32], [3.8, 4.58], [.25, 4.58]];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const [name, z, color] of [['floor', floor - .05, '#ac9c84'], ['ceiling', top, '#c9c6b4']] as const) {
    part(name, new THREE.ExtrudeGeometry(shape, { depth: .05, bevelEnabled: false }).translate(0, 0, z), color);
  }
  function wall(name: string, a: [number, number], b: [number, number], bottom: number, ceiling: number, color = '#afc1b9') {
    const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const geometry = new THREE.BoxGeometry(width, .06, ceiling - bottom);
    geometry.rotateZ(Math.atan2(b[1] - a[1], b[0] - a[0]));
    geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (bottom + ceiling) / 2);
    part(name, geometry, color);
  }
  wall('head-wall', [3.8, 1.32], [3.8, 4.58], floor, top, '#b5c0b8');
  wall('side-wall', [1.85, 1.32], [3.8, 1.32], floor, top);
  wall('entry-return', [1.15, .65], [1.85, 1.32], floor, top);
  wall('wardrobe-wall', [.25, .65], [.25, 4.58], floor, top, '#c6c4b5');
  // Separate opening panels, never a plaster face underneath the window or doorway.
  wall('window-wall', [.25, 4.58], [1.5, 4.58], floor, top);
  wall('window-wall', [3.12, 4.58], [3.8, 4.58], floor, top);
  wall('window-sill-wall', [1.5, 4.58], [3.12, 4.58], floor, -.62);
  wall('window-lintel', [1.5, 4.58], [3.12, 4.58], .72, top);
  box('window', [1.62, .025, 1.34], [2.31, 4.6, .05], '#eef3e6');
  box('window-frame', [1.72, .12, .055], [2.31, 4.54, -.62], '#dddcc9');
  box('window-frame', [1.72, .08, .055], [2.31, 4.54, .72], '#dddcc9');
  for (const u of [1.5, 3.12]) box('window-frame', [.05, .08, 1.34], [u, 4.54, .05], '#dddcc9');
  wall('door-lintel', [.25, .65], [1.15, .65], .72, top, '#c6c4b5');
  box('door', [.9, .045, 2.12], [.7, .63, -.34], '#7b796d');
  for (const u of [.27, 1.13]) box('door-frame', [.055, .09, 2.16], [u, .68, -.34], '#ddd8c3');
  box('door-frame', [.92, .09, .06], [.7, .68, .74], '#ddd8c3');
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
    wall('skirting', a, b, floor, floor + .105, '#d4d2bd');
    wall('cornice', a, b, .95, top, '#d2ceba');
  }
  box('wardrobe', [.61, 1.97, 1.95], [.64, 3.29, -.32], '#c5bda6', .025);
  for (let i = 0; i < 4; i++) {
    box('wardrobe-panel', [.035, .475, 1.78], [.96, 2.55 + i * .49, -.3], i % 2 ? '#c8c1ad' : '#ccc4af', .01);
    box('wardrobe-handle', [.035, .018, .15], [.99, 2.74 + i * .49, -.34], '#96836a', .006);
  }
  box('bed', [2.02, 1.58, .51], [2.66, 2.79, -1.09], '#c7c7b6', .09);
  box('duvet', [1.98, 1.59, .25], [2.64, 2.79, -.79], '#d4dacf', .12);
  box('headboard', [.09, 1.8, 1.21], [3.64, 2.79, -.49], '#c4b59d', .04);
  box('teal-throw', [.61, 1.6, .065], [1.97, 2.79, -.665], '#839f99', .025);
  for (const v of [2.35, 3.22]) {
    box('back-pillow', [.25, .61, .48], [3.35, v, -.35], '#66877e', .12);
    box('dark-pillow', [.32, .63, .29], [3.12, v, -.56], '#394e4d', .1);
  }
  for (const [name, v] of [['left-cabinet', 3.93], ['right-cabinet', 1.69]] as const) {
    box(name, [.46, .5, .58], [3.46, v, -1.03], '#c9c9b4', .025);
    box(`${name}-top`, [.5, .54, .055], [3.46, v, -.71], '#d0d2c0', .02);
    for (const z of [-.88, -1.12]) box('drawer', [.025, .44, .21], [3.22, v, z], '#c3c4af', .01);
    part('lamp-base', new THREE.SphereGeometry(1, 20, 14).scale(.105, .105, .145).translate(3.48, v, -.54), '#8bafa4');
    part('lamp-shade', new THREE.CylinderGeometry(.105, .155, .22, 32).rotateX(Math.PI / 2).translate(3.48, v, -.29), '#dad8bd');
  }
  for (const u of [1.4, 3.22]) box('curtain-backing', [.33, .045, 1.99], [u, 4.42, -.35], '#59847a', .015);
  const geometry = mergeGeometries(geometries)!;
  geometries.forEach(value => value.dispose());
  geometry.userData = { provenance: 'authored', parts };
  return geometry;
}
