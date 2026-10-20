import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import sceneData from '../../public/assets/hypersim-r03/scene.json';
import completionData from '../../public/assets/hypersim-full-room-v5/scene.json';
import { spacedPointIndices } from './point-sampling.ts';

export const isCompletion = new URLSearchParams(window.location.search).get('room') !== 'r03';
export const room = isCompletion ? completionData : sceneData;
export const assetBase = isCompletion ? '/assets/hypersim-full-room-v5/' : '/assets/hypersim-r03/';
export type RoomView = typeof room.views[number];
export type Movement = 'forward' | 'back' | 'left' | 'right' | 'up' | 'down';
export type RoomRenderer = ReturnType<typeof createRoomRenderer>;
const base = assetBase;

async function verifiedMesh(signal: AbortSignal, progress: (value: number) => void) {
  const record = room.files['room.ply'];
  if (record.bytes > (isCompletion ? 64 : 32) * 1024 * 1024) throw new Error('Room exceeds the download limit.');
  const response = await fetch(`${base}room.ply`, { signal });
  if (!response.ok || !response.body) throw new Error('The room file could not be loaded.');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(record.bytes);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > bytes.length) throw new Error('Room file exceeded its expected size.');
      bytes.set(value, length); length += value.length;
      progress(length / bytes.length);
    }
  } finally { await reader.cancel(); }
  if (length !== bytes.length) throw new Error('The room download was incomplete.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== record.sha256) throw new Error('The room file failed its integrity check.');
  signal.throwIfAborted();
  return bytes.buffer;
}

export function createRoomRenderer(canvas: HTMLCanvasElement, onExplore: () => void, onError: (message: string) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(isCompletion ? '#e7e7e7' : '#171918');
  const camera = new THREE.PerspectiveCamera(room.vertical_fov_degrees, 4 / 3, 0.025, 30);
  camera.up.set(0, 0, 1);
  const abort = new AbortController();
  let disposed = false;
  let geometry: THREE.BufferGeometry | undefined;
  let pointGeometry: THREE.BufferGeometry | undefined;
  let mesh: THREE.Mesh | undefined;
  let points: THREE.Points | undefined;
  let sourceColors: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  let evidenceColors: THREE.BufferAttribute | undefined;
  let currentMode: 'surface' | 'points' | 'provenance' = 'surface';
  let assumedSpace = true;
  let sourcePointCount = 0;
  let totalPointCount = 0;
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const pointMaskCanvas = document.createElement('canvas');
  pointMaskCanvas.width = pointMaskCanvas.height = 32;
  const pointContext = pointMaskCanvas.getContext('2d')!;
  pointContext.fillStyle = '#fff'; pointContext.beginPath(); pointContext.arc(16, 16, 15, 0, Math.PI * 2); pointContext.fill();
  const pointMask = new THREE.CanvasTexture(pointMaskCanvas);
  const pointMaterial = new THREE.PointsMaterial(isCompletion
    ? { vertexColors: true, size: 2.2, sizeAttenuation: false, map: pointMask, alphaTest: .5 }
    : { vertexColors: true, size: .014, sizeAttenuation: true });
  const pointDepthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const bounds = new THREE.Box3(new THREE.Vector3(...room.bounds_m[0] as [number, number, number]), new THREE.Vector3(...room.bounds_m[1] as [number, number, number]));
  const navigationRegions = isCompletion ? completionData.navigation_regions_m.map(region => new THREE.Box3(
    new THREE.Vector3(...region[0] as [number, number, number]), new THREE.Vector3(...region[1] as [number, number, number]))) : [bounds];
  const draw = () => { if (!disposed) renderer.render(scene, camera); };
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
    const viewWidth = Math.min(width, height * room.source_aspect);
    const viewHeight = viewWidth / room.source_aspect;
    renderer.setViewport((width - viewWidth) / 2, (height - viewHeight) / 2, viewWidth, viewHeight);
    camera.aspect = room.source_aspect; camera.updateProjectionMatrix(); draw();
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  function setView(view: RoomView) {
    // Stored CV camera: right/down/forward. Three camera: right/up/backward.
    const matrix = new THREE.Matrix4().set(...view.world_from_cv_m.flat() as Parameters<THREE.Matrix4['set']>);
    matrix.multiply(new THREE.Matrix4().makeScale(1, -1, -1));
    matrix.decompose(camera.position, camera.quaternion, new THREE.Vector3());
    draw();
  }
  setView(room.views[0]!);
  function look(x: number, y: number) {
    camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -x));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const next = camera.quaternion.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(right, -y));
    if (Math.abs(new THREE.Vector3(0, 0, -1).applyQuaternion(next).z) < 0.985) camera.quaternion.copy(next);
    onExplore(); draw();
  }
  function move(direction: Movement, distance = 0.16) {
    const vectors = { forward: [0, 0, -1], back: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0], up: [0, 0, 1], down: [0, 0, -1] } as const;
    const vector = new THREE.Vector3(...vectors[direction]);
    if (direction !== 'up' && direction !== 'down') vector.applyQuaternion(camera.quaternion);
    const desired = camera.position.clone().addScaledVector(vector, distance);
    let nearest = desired.clone().clamp(navigationRegions[0]!.min, navigationRegions[0]!.max);
    for (const region of navigationRegions) {
      const candidate = desired.clone().clamp(region.min, region.max);
      if (candidate.distanceToSquared(desired) < nearest.distanceToSquared(desired)) nearest = candidate;
    }
    camera.position.copy(nearest);
    onExplore(); draw();
  }
  const pointers = new Map<number, { x: number; y: number }>();
  const down = (event: PointerEvent) => {
    canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const drag = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
      const newDistance = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      move(newDistance > oldDistance ? 'forward' : 'back', Math.min(Math.abs(newDistance - oldDistance) * 0.006, 0.3));
    } else look((event.clientX - previous.x) * 0.003, (event.clientY - previous.y) * 0.003);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const up = (event: PointerEvent) => { pointers.delete(event.pointerId); };
  const clear = () => pointers.clear();
  // Keep canvas gestures out of the browser's synthetic click/scroll recognizer.
  // Otherwise the first control tap after a drag can be consumed on touch devices.
  const touch = (event: TouchEvent) => event.preventDefault();
  const wheel = (event: WheelEvent) => { event.preventDefault(); move(event.deltaY < 0 ? 'forward' : 'back', Math.min(Math.abs(event.deltaY) * 0.002, 0.35)); };
  const key = (event: KeyboardEvent) => {
    const movement: Record<string, Movement> = { w: 'forward', s: 'back', a: 'left', d: 'right', q: 'down', e: 'up' };
    if (movement[event.key.toLowerCase()]) { event.preventDefault(); move(movement[event.key.toLowerCase()]!); }
    const turns: Record<string, [number, number]> = { ArrowLeft: [-0.08, 0], ArrowRight: [0.08, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] };
    if (turns[event.key]) { event.preventDefault(); look(...turns[event.key]!); }
    if (event.key === 'Escape') clear();
  };
  const lost = (event: Event) => { event.preventDefault(); onError('The graphics connection was interrupted. Reload the room to continue.'); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', drag);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', key);
  canvas.addEventListener('blur', clear); window.addEventListener('blur', clear);
  canvas.addEventListener('touchstart', touch, { passive: false });
  canvas.addEventListener('webglcontextlost', lost);
  return {
    async load(progress: (value: number) => void) {
      const buffer = await verifiedMesh(abort.signal, progress);
      if (disposed) return;
      geometry = new PLYLoader().parse(buffer); // PLYLoader converts byte sRGB colors to linear.
      if (geometry.getAttribute('position').count !== room.vertices || geometry.index?.count !== room.triangles * 3) throw new Error('Unexpected room geometry.');
      sourceColors = geometry.getAttribute('color');
      if (isCompletion) {
        const colors = new Float32Array(room.vertices * 3);
        const ranges = completionData.provenance_vertex_ranges;
        const fused = new THREE.Color('#9ba99f');
        const inferred = new THREE.Color('#ff922e');
        const recovered = new THREE.Color('#4cc8db');
        const assumed = new THREE.Color('#b9a2ed');
        for (let index = 0; index < room.vertices; index++) {
          const color = index >= ranges.assumed_space[0]! ? assumed : index >= ranges.source_recovered[0]! ? recovered : index >= ranges.inferred[0]! ? inferred : fused;
          colors.set([color.r, color.g, color.b], index * 3);
        }
        evidenceColors = new THREE.BufferAttribute(colors, 3);
      }
      mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
      pointGeometry = new THREE.BufferGeometry();
      pointGeometry.setAttribute('position', geometry.getAttribute('position'));
      pointGeometry.setAttribute('color', geometry.getAttribute('color'));
      if (isCompletion) {
        const positions = geometry.getAttribute('position').array;
        const split = completionData.provenance_vertex_ranges.assumed_space[0]!;
        const sourceIndices = spacedPointIndices(positions.slice(0, split * 3));
        const assumedIndices = spacedPointIndices(positions.slice(split * 3));
        const indices = new Uint32Array(sourceIndices.length + assumedIndices.length);
        indices.set(sourceIndices);
        indices.set(assumedIndices.map(index => index + split), sourceIndices.length);
        sourcePointCount = sourceIndices.length; totalPointCount = indices.length;
        pointGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
      }
      points = new THREE.Points(pointGeometry, pointMaterial); points.visible = false; scene.add(points);
      mesh.renderOrder = 0; points.renderOrder = 1;
      resize();
    },
    setView, move, look,
    setAssumedSpace(enabled: boolean) {
      assumedSpace = enabled;
      if (isCompletion) {
        geometry?.setDrawRange(0, (enabled ? room.triangles : completionData.base_candidate_triangles) * 3);
        pointGeometry?.setDrawRange(0, enabled ? totalPointCount : sourcePointCount);
      }
      draw();
    },
    setMode(mode: 'surface' | 'points' | 'provenance') {
      currentMode = mode;
      if (geometry && sourceColors) geometry.setAttribute('color', mode === 'provenance' && evidenceColors ? evidenceColors : sourceColors);
      if (mesh) {
        mesh.visible = isCompletion || mode !== 'points';
        mesh.material = mode === 'points' && isCompletion ? pointDepthMaterial : material;
      }
      if (points) points.visible = mode === 'points';
      scene.background = new THREE.Color(isCompletion && mode === 'surface' ? '#e7e7e7' : '#171918');
      draw();
    },
    snapshot: () => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, mode: currentMode, revision: room.revision, assumedSpace, sourcePointCount, totalPointCount }),
    dispose() {
      if (disposed) return;
      disposed = true; abort.abort(); observer.disconnect(); pointers.clear();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', drag);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', key); canvas.removeEventListener('blur', clear);
      window.removeEventListener('blur', clear); canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('touchstart', touch);
      geometry?.dispose(); pointGeometry?.dispose(); material.dispose(); pointMaterial.dispose(); pointDepthMaterial.dispose(); pointMask.dispose(); renderer.dispose();
    },
  };
}
