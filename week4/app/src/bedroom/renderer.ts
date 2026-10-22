import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { verifiedMesh } from '../room/verified-mesh.ts';
import { createTeddy, updateTeddy, placeTeddy, setTeddyMode } from './memory.ts';
import type { MemoryValue } from './memory.ts';
import { ceilingDisplay } from './ceiling.ts';
import { createCeilingLight } from './light.ts';
import { createRoomCompletion } from './completion.ts';
import { sampleSurfacePoints } from '../room/surface-points.ts';

const source = { bytes: 24837257, sha256: 'd3296808e9cb9deec138fa1fce02495d5f84a0e894f56008d7013aedc7721bdc' };
export type BedroomRenderer = ReturnType<typeof createBedroomRenderer>;

export function createBedroomRenderer(canvas: HTMLCanvasElement, onError: (message: string) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#111615');
  const camera = new THREE.PerspectiveCamera(58, 1, .025, 40);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.minDistance = .35; controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * .93;
  controls.listenToKeyEvents(canvas);
  const abort = new AbortController();
  let disposed = false;
  let geometry: THREE.BufferGeometry | undefined;
  let pointGeometry: THREE.BufferGeometry | undefined;
  let mesh: THREE.Mesh | undefined;
  let points: THREE.Points | undefined;
  let mode: 'surface' | 'matrix' = 'surface';
  let ceilingEnabled = false;
  let ceiling: { mesh: THREE.Mesh; points: THREE.Points; display: ReturnType<typeof ceilingDisplay> } | undefined;
  let completion: { mesh: THREE.Mesh; points: THREE.Points } | undefined;
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const pointMaterial = new THREE.PointsMaterial({ vertexColors: true, size: 2, sizeAttenuation: false });
  const scanMaterial = material.clone(), scanDepth = depth.clone();
  const completionMaterial = material.clone(), completionDepth = depth.clone(), completionPoints = pointMaterial.clone();
  // Authored approximations fill absent scan pixels, never paint over source-supported detail.
  for (const value of [scanMaterial, scanDepth]) {
    value.stencilWrite = true; value.stencilRef = 1; value.stencilZPass = THREE.ReplaceStencilOp;
  }
  for (const value of [completionMaterial, completionDepth, completionPoints]) {
    value.stencilWrite = true; value.stencilRef = 1; value.stencilFunc = THREE.NotEqualStencilFunc;
    value.stencilWriteMask = 0;
  }
  completionPoints.size = 2.5;
  completionPoints.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (max(abs(gl_PointCoord.x - 0.5), abs(gl_PointCoord.y - 0.5)) < 0.2) discard;');
  };
  const teddy = createTeddy(); scene.add(teddy);
  scene.add(new THREE.HemisphereLight('#fff5df', '#546d68', 2.2));
  const light = new THREE.DirectionalLight('#fff1d5', 2.2); light.position.set(-2, 1, 4); scene.add(light);
  const draw = () => { if (!disposed) renderer.render(scene, camera); };
  controls.addEventListener('change', draw);
  function reset() {
    camera.position.set(-.25, 2.35, .25);
    controls.target.set(.42, 3.98, -.55);
    controls.update(); draw();
  }
  function ceilingView() {
    camera.position.set(-.15, 2.7, .15);
    controls.target.set(-.34, 3.36, .8);
    controls.update(); draw();
  }
  function zoom(closer: boolean) {
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * (closer ? .85 : 1.18), controls.minDistance, controls.maxDistance));
    camera.position.copy(controls.target).add(offset); controls.update(); draw();
  }
  function turn(direction: number) {
    const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 0, 1), direction * .15);
    camera.position.copy(controls.target).add(offset); controls.update(); draw();
  }
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Home') { event.preventDefault(); reset(); }
    if (['w', 's', '+', '-'].includes(event.key.toLowerCase())) { event.preventDefault(); zoom(['w', '+'].includes(event.key.toLowerCase())); }
  };
  const focus = () => canvas.focus({ preventScroll: true });
  const lost = (event: Event) => { event.preventDefault(); onError('Graphics were interrupted. Reopen the room to restore your session.'); };
  canvas.addEventListener('keydown', key); canvas.addEventListener('pointerdown', focus); canvas.addEventListener('webglcontextlost', lost);
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix(); draw();
  };
  function clearCeiling() {
    if (!ceiling) return;
    scene.remove(ceiling.mesh, ceiling.points);
    ceiling.mesh.geometry.dispose(); ceiling.points.geometry.dispose();
    ceiling.display.mesh.dispose(); ceiling.display.points.dispose();
    ceiling = undefined;
  }
  function setCeiling(value: boolean) {
    ceilingEnabled = Boolean(value && ceiling);
    if (mesh && geometry) mesh.geometry = ceilingEnabled ? ceiling!.display.mesh : geometry;
    if (points && pointGeometry) points.geometry = ceilingEnabled ? ceiling!.display.points : pointGeometry;
    for (const layer of [ceiling, completion]) if (layer) {
      layer.mesh.visible = ceilingEnabled;
      layer.mesh.material = layer === completion ? (mode === 'matrix' ? completionDepth : completionMaterial) : (mode === 'matrix' ? depth : material);
      layer.points.visible = ceilingEnabled && mode === 'matrix';
    }
    draw();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas); reset();
  return {
    async load(url: string, progress: (value: number) => void) {
      const buffer = await verifiedMesh(url, source, abort.signal, progress);
      if (disposed) return;
      geometry = new PLYLoader().parse(buffer);
      if (geometry.getAttribute('position')?.count !== 622077 || geometry.getAttribute('color')?.count !== 622077 || geometry.index?.count !== 3434709) throw new Error('Unexpected supplied scan geometry.');
      mesh = new THREE.Mesh(geometry, scanMaterial); mesh.renderOrder = -1; scene.add(mesh); placeTeddy(teddy, mesh);
      // Share immutable scan attributes; never expand the million-face mesh into per-face copies.
      pointGeometry = new THREE.BufferGeometry();
      pointGeometry.setAttribute('position', geometry.getAttribute('position'));
      pointGeometry.setAttribute('color', geometry.getAttribute('color'));
      const indices = Uint32Array.from({ length: Math.ceil(622077 / 4) }, (_, i) => i * 4);
      pointGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
      points = new THREE.Points(pointGeometry, pointMaterial); points.visible = false; points.renderOrder = 1; scene.add(points);
      const patch = createCeilingLight();
      const view = new THREE.PerspectiveCamera(70, 1, .025, 40);
      view.up.set(0, 0, 1); view.position.set(0, 3, -.3); view.lookAt(-.2, 3.6, 1.05); view.updateMatrixWorld();
      const clearance = new THREE.Box3(new THREE.Vector3(-.61, 3.09, .3), new THREE.Vector3(-.07, 3.63, .98));
      const display = ceilingDisplay(geometry, patch, view, new THREE.Vector3(.0012865324554443864, -.32603676033765205, .697622744907254), clearance);
      const samples = new THREE.BufferGeometry();
      samples.setAttribute('position', patch.getAttribute('position')); samples.setAttribute('color', patch.getAttribute('color'));
      ceiling = { mesh: new THREE.Mesh(patch, material), points: new THREE.Points(samples, pointMaterial), display };
      ceiling.points.renderOrder = 1;
      scene.add(ceiling.mesh, ceiling.points);
      const room = createRoomCompletion();
      const vertices = room.getAttribute('position').count;
      const sampled = sampleSurfacePoints({ positions: room.getAttribute('position').array, colors: room.getAttribute('color').array, indices: Uint32Array.from({ length: vertices }, (_, i) => i) }, .024);
      const roomPoints = new THREE.BufferGeometry();
      roomPoints.setAttribute('position', new THREE.BufferAttribute(sampled.positions, 3));
      roomPoints.setAttribute('color', new THREE.BufferAttribute(sampled.colors, 3));
      completion = { mesh: new THREE.Mesh(room, completionMaterial), points: new THREE.Points(roomPoints, completionPoints) };
      completion.points.renderOrder = 1; scene.add(completion.mesh, completion.points);
      mode = 'matrix'; mesh.material = scanDepth; points.visible = true; setTeddyMode(teddy, mode);
      setCeiling(true); ceilingView(); resize();
    },
    setCeiling,
    setMemory(value: MemoryValue) { updateTeddy(teddy, value); draw(); },
    setMode(value: 'surface' | 'matrix') {
      mode = value; setTeddyMode(teddy, value);
      if (mesh) mesh.material = value === 'matrix' ? scanDepth : scanMaterial;
      if (points) points.visible = value === 'matrix';
      setCeiling(ceilingEnabled);
    },
    capture: import.meta.env.DEV ? async (position: [number, number, number], target: [number, number, number]) => {
      if (!mesh || disposed) throw new Error('Open the source scan before capturing.');
      if (![...position, ...target].every(Number.isFinite)) throw new Error('Invalid capture view.');
      const { captureSource } = await import('./capture.ts');
      const view = new THREE.PerspectiveCamera(70, 1, .025, 40);
      view.up.set(0, 0, 1); view.position.fromArray(position); view.lookAt(new THREE.Vector3(...target)); view.updateMatrixWorld();
      return captureSource(renderer, new THREE.Mesh(geometry!, material), view);
    } : undefined,
    reset, zoom, turn, ceilingView,
    snapshot: () => ({ camera: { position: camera.position.toArray(), target: controls.target.toArray() }, mode, ceilingEnabled, ceilingVertices: ceiling?.mesh.geometry.getAttribute('position').count ?? 0, completionVertices: completion?.mesh.geometry.getAttribute('position').count ?? 0, completionVisible: completion?.mesh.visible ?? false, sourceVertices: geometry?.getAttribute('position').count, sourceTriangles: (geometry?.index?.count ?? 0) / 3, teddyVisible: teddy.visible, teddySurfaceWrites: teddy.children.filter(child => child instanceof THREE.Mesh && child.material.colorWrite).length, teddyPoints: teddy.children.reduce((sum, child) => sum + (child instanceof THREE.Points && child.visible ? child.geometry.getAttribute('position').count : 0), 0), teddyColor: (teddy.getObjectByName('body') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>).material.color.getHexString(), teddyAnchor: teddy.position.toArray(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, geometries: renderer.info.memory.geometries }),
    dispose() {
      if (disposed) return;
      disposed = true; abort.abort(); observer.disconnect(); controls.dispose();
      canvas.removeEventListener('keydown', key); canvas.removeEventListener('pointerdown', focus); canvas.removeEventListener('webglcontextlost', lost);
      clearCeiling(); completion?.mesh.geometry.dispose(); completion?.points.geometry.dispose();
      geometry?.dispose(); pointGeometry?.dispose();
      for (const value of [material, depth, pointMaterial, scanMaterial, scanDepth, completionMaterial, completionDepth, completionPoints]) value.dispose();
      const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      teddy.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          for (const value of Array.isArray(obj.material) ? obj.material : [obj.material]) {
            materials.add(value);
            if (value instanceof THREE.MeshStandardMaterial && value.bumpMap) textures.add(value.bumpMap);
          }
        }
      });
      textures.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); renderer.dispose();
    },
  };
}
