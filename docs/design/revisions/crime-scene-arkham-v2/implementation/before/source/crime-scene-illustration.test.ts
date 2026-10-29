import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import * as THREE from 'three';

async function load() {
  assert.ok(existsSync(new URL('../src/crime-scene/illustration.ts', import.meta.url)), 'Source-guided illustration is not implemented');
  return import('../src/crime-scene/illustration.ts');
}

test('illustration retains source provenance and never invents unlocated clue positions', async () => {
  const {createSceneIllustration} = await load();
  const view = createSceneIllustration();
  try {
    const meshes: THREE.Mesh[] = [];
    view.group.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
    assert.ok(meshes.length > 0);
    for (const mesh of meshes) {
      assert.equal(mesh.userData.provenance, 'photo-guided-approximation');
      assert.ok(mesh.userData.sources.length > 0);
      assert.ok(!mesh.userData.tags.some((tag: number) => [1, 11, 20].includes(tag)), 'Unlocated tags must not gain illustrative positions');
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) assert.ok([positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite));
    }
    for (const name of ['floor', 'rug', 'sofa', 'cushion', 'overturned-chair', 'upright-chair', 'cabinet']) {
      const part = view.group.getObjectByName(name);
      assert.ok(part, `Missing recognizable part ${name}`);
      const box = new THREE.Box3().setFromObject(part);
      assert.ok(!box.isEmpty());
      assert.ok(box.min.x >= -1.6 && box.max.x <= 1.95 && box.min.y >= -2.95 && box.max.y <= .68, 'Illustration stays within the retained room footprint');
    }
  } finally { view.dispose(); }
});

test('detective selection and cutaway change display only, with repeat-safe cleanup', async () => {
  const {createSceneIllustration} = await load();
  const view = createSceneIllustration();
  const meshes: THREE.Mesh[] = [], geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  view.group.updateMatrixWorld(true);
  view.group.traverse(node => {
    if (node instanceof THREE.Mesh) meshes.push(node);
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
      geometries.add(node.geometry);
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) materials.add(mat);
    }
  });
  const transforms = meshes.map(mesh => mesh.matrixWorld.toArray());
  view.setStyle(true, 18);
  const highlighted = meshes.filter(mesh => (mesh.material as THREE.ShaderMaterial).uniforms.selected!.value);
  assert.ok(highlighted.length > 0);
  assert.ok(highlighted.every(mesh => mesh.userData.tags.includes(18)), 'Selection must not light unrelated evidence');
  view.setStyle(true, 20);
  assert.ok(meshes.every(mesh => !(mesh.material as THREE.ShaderMaterial).uniforms.selected!.value), 'Unlocated selection has no fabricated highlight');
  view.setStyle(false, null);
  view.group.updateMatrixWorld(true);
  assert.deepEqual(meshes.map(mesh => mesh.matrixWorld.toArray()), transforms);
  view.setCutaway(true);
  const hidden = view.group.children.filter(node => !node.visible);
  assert.ok(hidden.length > 0);
  assert.ok(hidden.every(node => node.userData.enclosure), 'Cutaway must not remove furniture');
  view.setCutaway(false);
  assert.ok(view.group.children.every(node => node.visible));
  let freedGeometry = 0, freedMaterial = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => freedGeometry++);
  for (const material of materials) material.addEventListener('dispose', () => freedMaterial++);
  view.dispose(); view.dispose();
  assert.equal(freedGeometry, geometries.size);
  assert.equal(freedMaterial, materials.size);
});
