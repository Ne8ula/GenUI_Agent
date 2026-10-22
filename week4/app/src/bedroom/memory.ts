import * as THREE from 'three';
import { sampleSurfacePoints } from '../room/surface-points.ts';

export type MemoryValue = { present: boolean; color: 'cream' | 'blue' };
export type Memory = { current: MemoryValue; history: MemoryValue[] };
export type MemoryCommand = 'add' | 'blue' | 'remove' | 'undo';
export const createMemory = (): Memory => ({ current: { present: false, color: 'cream' }, history: [] });

export function applyMemory(memory: Memory, command: MemoryCommand): Memory {
  const { current, history } = memory;
  if (command === 'undo') return history.length ? { current: history[history.length - 1]!, history: history.slice(0, -1) } : memory;
  let next: MemoryValue;
  switch (command) {
    case 'add': next = current.present ? current : { present: true, color: 'cream' }; break;
    case 'blue': next = current.present ? { ...current, color: 'blue' } : current; break;
    case 'remove': next = { ...current, present: false }; break;
    default: throw new Error('Unknown memory command.');
  }
  if (next.present === current.present && next.color === current.color) return memory;
  return { current: next, history: [...history.slice(-31), current] };
}

export function createTeddy() {
  const group = new THREE.Group();
  group.name = 'remembered-teddy';
  group.userData.provenance = 'user-authored';
  // shortcut: one visually reviewed bed anchor, not automatic placement for other rooms.
  group.position.set(.2, 3.4, -.82);
  group.rotation.z = -.874;
  const grain = new Uint8Array(128 * 128 * 4);
  let seed = 712;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < grain.length; i += 4) {
    const value = Math.floor(70 + random() * 150);
    grain[i] = grain[i + 1] = grain[i + 2] = value; grain[i + 3] = 255;
  }
  const fabric = new THREE.DataTexture(grain, 128, 128);
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  fabric.repeat.set(8, 6); fabric.magFilter = fabric.minFilter = THREE.LinearFilter; fabric.needsUpdate = true;
  const fur = new THREE.MeshStandardMaterial({ color: '#dcbf92', roughness: 1, bumpMap: fabric, bumpScale: .0018 });
  const cream = new THREE.MeshStandardMaterial({ color: '#f4e6cc', roughness: 1, bumpMap: fabric, bumpScale: .0007 });
  const dark = new THREE.MeshStandardMaterial({ color: '#352922', roughness: .85 });
  const eyes = new THREE.MeshStandardMaterial({ color: '#211b17', roughness: .18 });
  const stitching = new THREE.MeshStandardMaterial({ color: '#a58b65', roughness: 1 });
  const pile = new THREE.LineBasicMaterial({ color: fur.color, vertexColors: true, transparent: true, opacity: .4, depthWrite: false });
  const pointMaterials = new Map<THREE.Material, THREE.PointsMaterial>();
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, fluffy = false) {
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const shade = .78 + .16 * random() + .06 * Math.max(0, normals.getZ(i));
      colors.fill(shade, i * 3, i * 3 + 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    material.vertexColors = true; material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; group.add(mesh);
    const indices = geometry.index!.array;
    const sampled = sampleSurfacePoints({ positions: positions.array, colors, indices }, .009);
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute('position', new THREE.BufferAttribute(sampled.positions, 3));
    pointGeometry.setAttribute('color', new THREE.BufferAttribute(sampled.colors, 3));
    if (!pointMaterials.has(material)) {
      const value = new THREE.PointsMaterial({ color: material.color, vertexColors: true, size: 2, sizeAttenuation: false });
      // Authored square marks, consistent with the room's completion cue.
      value.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (max(abs(gl_PointCoord.x - 0.5), abs(gl_PointCoord.y - 0.5)) < 0.16) discard;');
      };
      pointMaterials.set(material, value);
    }
    const points = new THREE.Points(pointGeometry, pointMaterials.get(material)!);
    points.name = `${name}-matrix`; points.visible = false; points.renderOrder = 1; group.add(points);
    if (fluffy) {
      // shortcut: short static fibre strokes, not groomed/simulated fur; replace for close-up production assets.
      const strands: number[] = [], shades: number[] = [];
      const normal = new THREE.Vector3();
      for (let i = 0; i < sampled.faces.length; i += 2) {
        normal.set(0, 0, 0);
        for (let k = 0; k < 3; k++) normal.add(new THREE.Vector3().fromBufferAttribute(normals, indices[sampled.faces[i]! * 3 + k]!));
        normal.normalize();
        const start = new THREE.Vector3().fromArray(sampled.positions, i * 3);
        const mid = start.clone().addScaledVector(normal, .0015 + random() * .0025);
        const tip = mid.clone().add(new THREE.Vector3((random() - .5) * .003, (random() - .5) * .003, -.001));
        strands.push(...start.toArray(), ...mid.toArray(), ...mid.toArray(), ...tip.toArray());
        const shade = .65 + random() * .35;
        for (let k = 0; k < 12; k++) shades.push(shade);
      }
      const strokes = new THREE.BufferGeometry();
      strokes.setAttribute('position', new THREE.Float32BufferAttribute(strands, 3));
      strokes.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
      const fibres = new THREE.LineSegments(strokes, pile); fibres.name = `${name}-pile`; group.add(fibres);
    }
  }
  function part(name: string, position: [number, number, number], scale: [number, number, number], material = fur, tilt = 0) {
    const geometry = new THREE.SphereGeometry(1, 40, 28), vertices = geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      const stuffed = 1 + .018 * Math.sin(x * 8 + z * 6) * Math.sin(y * 9 - z * 4);
      const taper = name === 'body' ? 1 - z * .19 : name === 'nose' ? .7 + z * .3 : 1;
      vertices.setXYZ(i, x * stuffed * taper, y * stuffed, z * stuffed);
    }
    geometry.scale(...scale).rotateY(tilt).translate(...position); geometry.computeVertexNormals();
    add(name, geometry, material, material === fur);
  }
  part('body', [0, .008, .19], [.143, .12, .178]);
  part('head', [0, -.017, .39], [.139, .115, .123]);
  part('muzzle', [0, -.121, .36], [.074, .042, .054], cream);
  part('nose', [0, -.162, .382], [.021, .013, .017], dark);
  function seam(name: string, points: [number, number, number][]) {
    add(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 18, .0016, 5, false), dark);
  }
  seam('mouth', [[0, -.165, .37], [0, -.167, .354], [-.012, -.164, .346], [-.025, -.158, .35]]);
  seam('mouth-right', [[0, -.167, .354], [.012, -.164, .346], [.025, -.158, .35]]);
  for (const side of [-1, 1]) {
    part(`ear-${side}`, [side * .112, -.005, .48], [.055, .034, .054]);
    part(`inner-ear-${side}`, [side * .112, -.032, .481], [.034, .009, .034], cream);
    part(`eye-${side}`, [side * .052, -.12, .412], [.011, .009, .012], eyes);
    part(`arm-${side}`, [side * .133, -.025, .23], [.06, .065, .125], fur, -side * .3);
    part(`foot-${side}`, [side * .09, -.092, .075], [.084, .114, .074]);
    part(`paw-${side}`, [side * .09, -.19, .078], [.058, .02, .051], cream);
    const ring = new THREE.TorusGeometry(1, .018, 5, 40).rotateX(Math.PI / 2).scale(.057, .012, .049).translate(side * .09, -.202, .078);
    add(`paw-seam-${side}`, ring, stitching);
  }
  group.visible = false;
  return group;
}

export function setTeddyMode(teddy: THREE.Group, mode: 'surface' | 'matrix') {
  for (const child of teddy.children) {
    if (child instanceof THREE.Mesh) child.material.colorWrite = mode === 'surface';
    else if (child instanceof THREE.Points) child.visible = mode === 'matrix';
    else if (child instanceof THREE.LineSegments) child.visible = mode === 'surface';
  }
}

export function placeTeddy(teddy: THREE.Group, scan: THREE.Mesh) {
  const ray = new THREE.Raycaster(new THREE.Vector3(teddy.position.x, teddy.position.y, .8), new THREE.Vector3(0, 0, -1), 0, 2);
  const hit = ray.intersectObject(scan, false)[0];
  if (!hit || hit.point.z > 0 || hit.point.z < -1.2) throw new Error('The selected bed anchor has no usable scan surface.');
  teddy.position.z = hit.point.z;
}

export function updateTeddy(teddy: THREE.Group, value: MemoryValue) {
  teddy.visible = value.present;
  const body = teddy.getObjectByName('body') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  body.material.color.set(value.color === 'blue' ? '#7caec8' : '#dcbf92');
  (teddy.getObjectByName('body-matrix') as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>).material.color.copy(body.material.color);
  (teddy.getObjectByName('body-pile') as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>).material.color.copy(body.material.color);
}
