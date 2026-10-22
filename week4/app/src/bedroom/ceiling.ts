import * as THREE from 'three';

// Presentation-only replacement: the admitted source attributes and index stay immutable.
export function ceilingDisplay(source: THREE.BufferGeometry, patch: THREE.BufferGeometry, camera: THREE.PerspectiveCamera, plane: THREE.Vector3, clearance?: THREE.Box3) {
  const patchPositions = patch.getAttribute('position');
  if (!patchPositions?.count || patchPositions.count > 100000 || !Array.from(patchPositions.array).every(Number.isFinite)) throw new Error('Invalid ceiling patch positions.');
  patch.computeBoundingBox();
  const bounds = patch.boundingBox!;
  if (bounds.isEmpty() || bounds.getSize(new THREE.Vector3()).length() > 2) throw new Error('Invalid ceiling patch bounds.');
  const positions = source.getAttribute('position'), index = source.index;
  if (!positions || !index) throw new Error('Indexed source scan required.');
  const hidden = new Uint8Array(positions.count), point = new THREE.Vector3();
  const focal = 512 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  // Modal report's exact ROI and foreground interval; retain ceiling support and all crossing faces.
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    if (clearance?.containsPoint(point)) { hidden[i] = 1; continue; }
    point.applyMatrix4(camera.matrixWorldInverse);
    point.y *= -1; point.z *= -1;
    if (point.z < camera.near || point.z > camera.far) continue;
    const u = focal * point.x / point.z + 256, v = focal * point.y / point.z + 256;
    if (u < 165 || u >= 280 || v < 175 || v >= 305) continue;
    const planeZ = point.z / plane.dot(point), deviation = planeZ - point.z;
    hidden[i] = Number(deviation > .03211897366527843 && deviation <= planeZ * .4);
  }
  const faces = new Uint32Array(index.count), samples = new Uint32Array(Math.ceil(positions.count / 4));
  let faceCount = 0, sampleCount = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (!(hidden[a] && hidden[b] && hidden[c])) {
      faces[faceCount++] = a; faces[faceCount++] = b; faces[faceCount++] = c;
    }
  }
  for (let i = 0; i < positions.count; i += 4) if (!hidden[i]) samples[sampleCount++] = i;
  const mesh = new THREE.BufferGeometry(), points = new THREE.BufferGeometry();
  for (const geometry of [mesh, points]) {
    geometry.setAttribute('position', positions);
    geometry.setAttribute('color', source.getAttribute('color'));
  }
  mesh.setIndex(new THREE.BufferAttribute(faces.subarray(0, faceCount), 1));
  points.setIndex(new THREE.BufferAttribute(samples.subarray(0, sampleCount), 1));
  return { mesh, points };
}
