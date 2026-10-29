import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { verifiedMesh } from '../room/verified-mesh.ts';
import { MATRIX_BAYER_GLSL } from '../room/matrix-style.ts';
import { FFS } from './state.ts';

export const PANORAMA = { bytes: 1222872, sha256: '138e407bcff0ca2c241860b80f48486bcafeb36038123099c0ca73a116fe5815' };
export type PanoramaView = { position: number[]; target: number[] };
export type ClueProjection = { tag: number; x: number; y: number; visible: boolean };

export function surfaceAnchor(object: THREE.Object3D, direction: THREE.Vector3) {
  object.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(new THREE.Vector3(), direction.clone().normalize()).intersectObject(object, true)[0];
  if (!hit?.face) return undefined;
  return { point: hit.point, normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld) };
}


export function framePanorama(object: THREE.Object3D, aspect: number) {
  const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3());
  const radius = size.length() / 2;
  if (box.isEmpty() || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(aspect) || aspect <= 0) throw new Error('Invalid room bounds.');
  // shortcut: inspection origin for the pinned Realsee candidate, not calibrated eye height; review anew if its identity changes.
  return { size, target: new THREE.Vector3(Math.cos(5.64), -.5, Math.sin(5.64)), position: new THREE.Vector3(), near: radius / 1000, far: radius * 10 };
}

export function createPanoramaControls(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, draw: () => void, reset: () => void) {
  let drag: { id: number; x: number; y: number } | undefined;
  function stop() {
    const id = drag?.id; drag = undefined;
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function look(horizontal: number, vertical: number) {
    if (!controls.enabled) return;
    const direction = new THREE.Spherical().setFromVector3(controls.target.clone().sub(camera.position));
    direction.radius = 1; direction.theta -= horizontal;
    direction.phi = THREE.MathUtils.clamp(direction.phi + vertical, .1, Math.PI - .1);
    controls.target.copy(camera.position).add(new THREE.Vector3().setFromSpherical(direction)); controls.update();
  }
  const controls = {
    target: new THREE.Vector3(1, 0, 0), step: .1, enabled: false,
    update() { camera.lookAt(controls.target); draw(); },
    turn(direction: number) { look(direction * .12, 0); },
    move(direction: number) {
      if (!controls.enabled) return;
      const offset = controls.target.clone().sub(camera.position); offset.y = 0;
      offset.normalize().multiplyScalar(direction * controls.step);
      camera.position.add(offset); controls.target.add(offset); controls.update();
    },
    pause(paused: boolean) { controls.enabled = !paused; stop(); },
    dispose() {
      controls.pause(true);
      canvas.removeEventListener('keydown', key); canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('blur', stop);
    },
  };
  function key(event: KeyboardEvent) {
    if (!controls.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    const name = event.key.toLowerCase();
    if (!['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 's', 'home'].includes(name)) return;
    event.preventDefault();
    if (name === 'arrowleft' || name === 'arrowright') controls.turn(name === 'arrowleft' ? -1 : 1);
    else if (name === 'home') { stop(); reset(); }
    else controls.move(['w', 'arrowup'].includes(name) ? 1 : -1);
  }
  function down(event: PointerEvent) {
    if (!controls.enabled || event.button !== 0 || drag) return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    look((event.clientX - drag.x) * .004, (event.clientY - drag.y) * .004);
    drag.x = event.clientX; drag.y = event.clientY;
  }
  function up(event: PointerEvent) { if (drag?.id === event.pointerId) stop(); }
  function wheel(event: WheelEvent) {
    if (!controls.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault(); if (event.deltaY) controls.move(-Math.sign(event.deltaY));
  }
  canvas.addEventListener('keydown', key); canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('blur', stop);
  return controls;
}

export function disposePanorama(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) { texture.dispose(); texture.image?.close?.(); }
}

export async function loadPanorama(signal: AbortSignal, progress: (value: number) => void) {
  const bytes = await verifiedMesh(FFS + 'realsee/scene.glb', PANORAMA, signal, progress);
  // Exact approved bytes contain embedded textures only; never resolve a remote glTF dependency.
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw new Error('External scene resource rejected.'); return url; });
  const { scene } = await new GLTFLoader(manager).parseAsync(bytes, '');
  try {
    signal.throwIfAborted();
    const textures = new Set<THREE.Texture>();
    scene.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial) || !material.map?.image?.width || !material.map.image.height) throw new Error('Room texture decoding failed.');
        textures.add(material.map);
        // Two-sided inspection exposes existing surfaces, never fills holes or adds geometry.
        material.side = THREE.DoubleSide;
      }
    });
    if (textures.size !== 2) throw new Error('Expected both embedded room textures.');
    return scene;
  } catch (error) { disposePanorama(scene); throw error; }
}

export function applyPanoramaInspection(material: THREE.Material, uniforms: Record<string, THREE.IUniform>) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 inspectionWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ninspectionWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 inspectionWorld;
      uniform float inspectionMode, inspectionSweep, inspectionRange, inspectionPixelRatio;
      uniform vec3 inspectionOrigin;
      ${MATRIX_BAYER_GLSL}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float radius = distance(inspectionWorld, inspectionOrigin);
        float front = inspectionSweep * inspectionRange;
        float feather = max(inspectionRange * 0.012, 0.001);
        float scanned = inspectionMode * (1.0 - smoothstep(front - feather, front, radius));
        vec3 base = gl_FragColor.rgb;
        float lightness = dot(base, vec3(0.2126, 0.7152, 0.0722));
        float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
        // Retained room Matrix sampling, adapted to textures; all candidate surfaces are inferred.
        vec2 pixel = gl_FragCoord.xy / inspectionPixelRatio;
        vec2 cell = floor(pixel / 3.0);
        vec2 mark = fract(pixel / 3.0) - 0.5;
        float square = max(abs(mark.x), abs(mark.y));
        float grain = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        // Luminance treatment only, not furniture/wall segmentation.
        float bright = smoothstep(0.12, 0.65, lightness);
        float coverage = mix(0.18, 0.055, bright) + rim * 0.12;
        float ink = (square > 0.46 || square < 0.13 || bayer4(cell) * 0.8 + grain * 0.2 > coverage) ? 0.0 : 1.0;
        vec3 tint = base + vec3(max(0.0, 0.32 - lightness));
        tint = mix(tint, vec3(0.74, 0.78, 0.76), rim * 0.48);
        tint *= mix(0.48, 1.0, grain);
        // Black gaps retain depth: discarding fragments would reveal walls behind the visible surface.
        vec3 backing = vec3(0.006, 0.012, 0.017) + sqrt(max(base, vec3(0.0))) * mix(0.32, 0.06, bright);
        vec3 investigative = mix(backing, tint, ink);
        gl_FragColor.rgb = mix(base, investigative, scanned);
        float pulse = (1.0 - smoothstep(0.0, feather, abs(radius - front))) * (1.0 - step(1.0, inspectionSweep));
        gl_FragColor.rgb += vec3(0.23, 0.85, 0.76) * pulse * inspectionMode * (0.15 + ink * 0.55);`);
  };
  material.customProgramCacheKey = () => 'eva-inspection-matrix-v3'; material.needsUpdate = true;
}

export function createPanoramaRenderer(canvas: HTMLCanvasElement, failed: (message: string) => void, saved?: PanoramaView, project: (points: ClueProjection[]) => void = () => {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#03070c');
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa4b0c2, 2.4));
  const camera = new THREE.PerspectiveCamera(70, 1, .001, 100);
  const controls = createPanoramaControls(camera, canvas, draw, reset);
  let object: THREE.Group | undefined, home: ReturnType<typeof framePanorama> | undefined, disposed = false;
  const abort = new AbortController();
  const uniforms = { inspectionPixelRatio: { value: renderer.getPixelRatio() }, inspectionMode: { value: 0 }, inspectionSweep: { value: 0 }, inspectionRange: { value: 1 }, inspectionOrigin: { value: new THREE.Vector3() }, inspectionSelected: { value: new THREE.Vector3(1e5, 1e5, 1e5) } };
  const roomBounds = new THREE.Sphere();
  const clues: { tag: number; point: THREE.Vector3; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> }[] = [];
  const ray = new THREE.Raycaster();
  function draw() {
    if (disposed || !object) return;
    renderer.render(scene, camera);
    const points = clues.map(clue => {
      const direction = clue.point.clone().sub(camera.position), distance = direction.length();
      ray.set(camera.position, direction.normalize());
      const obstruction = ray.intersectObject(object!, true)[0];
      const p = clue.point.clone().project(camera);
      return { tag: clue.tag, x: Math.round((p.x + 1) * 5000) / 100, y: Math.round((1 - p.y) * 5000) / 100,
        visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < .92 && Math.abs(p.y) < .78 && (!obstruction || obstruction.distance >= distance - .05) };
    });
    project(points);
  }
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = Math.max(1, width) / Math.max(1, height); camera.updateProjectionMatrix();
    draw();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function reset() {
    if (!object) return;
    home = framePanorama(object, camera.aspect);
    camera.near = home.near; camera.far = home.far; camera.updateProjectionMatrix();
    controls.step = home.size.length() * .025;
    camera.position.copy(home.position); controls.target.copy(home.target); controls.update();
  }
  function prepareInvestigation(room: THREE.Group) {
    const box = new THREE.Box3().setFromObject(room);
    box.getBoundingSphere(roomBounds);
    uniforms.inspectionRange.value = roomBounds.center.length() + roomBounds.radius;
    room.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        applyPanoramaInspection(material, uniforms);
      }
    });
    // Authored look rays are specific to this pinned candidate; never derived from measured scan coordinates.
    const placements: { tag: number; direction: [number, number, number] }[] = [];
    for (const placement of placements) {
      const anchor = surfaceAnchor(room, new THREE.Vector3(...placement.direction));
      if (!anchor) continue;
      if (anchor.normal.dot(anchor.point) > 0) anchor.normal.negate();
      const ring = new THREE.Mesh(new THREE.RingGeometry(.045, .055, 48), new THREE.MeshBasicMaterial({ color: '#79e0d4', side: THREE.DoubleSide, transparent: true, opacity: .85, depthWrite: false }));
      ring.position.copy(anchor.point).addScaledVector(anchor.normal, .008);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), anchor.normal); ring.visible = false; scene.add(ring);
      clues.push({ tag: placement.tag, point: ring.position.clone(), ring });
    }
  }
  function lost(event: Event) { event.preventDefault(); controls.pause(true); failed('Graphics context lost. Reopen the room to retry.'); }
  canvas.addEventListener('webglcontextlost', lost);
  return {
    async load(progress: (value: number) => void) {
      const loaded = await loadPanorama(abort.signal, progress);
      if (disposed) { disposePanorama(loaded); return; }
      object = loaded; scene.add(object); prepareInvestigation(object); reset();
      if (saved) { camera.position.fromArray(saved.position); controls.target.fromArray(saved.target); controls.update(); }
      controls.pause(false); draw();
    },
    investigate(mode: 'normal' | 'scan' | 'detective', sweep: number, selection: number | null) {
      if (mode !== 'normal' && uniforms.inspectionMode.value === 0) {
        uniforms.inspectionOrigin.value.copy(camera.position);
        uniforms.inspectionRange.value = camera.position.distanceTo(roomBounds.center) + roomBounds.radius;
      }
      uniforms.inspectionMode.value = mode === 'normal' ? 0 : 1;
      uniforms.inspectionSweep.value = mode === 'detective' ? 1.02 : sweep;
      const selected = clues.find(clue => clue.tag === selection);
      uniforms.inspectionSelected.value.copy(selected?.point ?? new THREE.Vector3(1e5, 1e5, 1e5));
      for (const clue of clues) {
        clue.ring.visible = mode === 'detective';
        clue.ring.material.color.set(clue.tag === selection ? '#dfc58e' : '#79e0d4');
        clue.ring.scale.setScalar(clue.tag === selection ? 1.5 : 1);
      }
      draw();
    },
    reset() { if (controls.enabled) reset(); }, turn: controls.turn, move: controls.move,
    pause(paused: boolean) { controls.pause(paused || !object); },
    snapshot(): PanoramaView | undefined { return object ? { position: camera.position.toArray(), target: controls.target.toArray() } : saved; },
    dispose() {
      disposed = true; abort.abort(); observer.disconnect(); controls.dispose();
      canvas.removeEventListener('webglcontextlost', lost);
      for (const clue of clues) { clue.ring.geometry.dispose(); clue.ring.material.dispose(); }
      if (object) disposePanorama(object);
      renderer.dispose();
    },
  };
}
export type PanoramaRenderer = ReturnType<typeof createPanoramaRenderer>;
