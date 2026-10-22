import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// shortcut: an authored fixture at this room's reviewed anchor, not recovered geometry.
export function createCeilingLight() {
  const parts: THREE.BufferGeometry[] = [];
  const names: string[] = [];
  function part(name: string, geometry: THREE.BufferGeometry, color: string, z: number) {
    const normals = geometry.getAttribute('normal');
    const base = new THREE.Color(color), colors = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      const shade = .78 + .22 * Math.max(0, normals.getX(i) * -.4 + normals.getY(i) * -.3 + normals.getZ(i) * -.85);
      base.clone().multiplyScalar(shade).toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.translate(-.34, 3.36, z); parts.push(geometry); names.push(name);
  }
  part('canopy', new THREE.CylinderGeometry(.075, .075, .025, 48).rotateX(Math.PI / 2), '#9e8359', 1.002);
  part('stem', new THREE.CylinderGeometry(.018, .018, .065, 24).rotateX(Math.PI / 2), '#a88c61', .963);
  part('shade', new THREE.SphereGeometry(.235, 80, 32, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .72, 1).rotateX(Math.PI / 2), '#e6dfc9', .79);
  part('rim', new THREE.TorusGeometry(.235, .009, 12, 96), '#b49a70', .79);
  part('diffuser', new THREE.SphereGeometry(1, 64, 24).scale(.226, .226, .026), '#fff0cc', .783);
  const geometry = mergeGeometries(parts)!;
  parts.forEach(value => value.dispose());
  geometry.userData = { provenance: 'authored', parts: names };
  return geometry;
}
