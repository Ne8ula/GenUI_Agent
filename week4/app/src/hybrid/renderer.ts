import * as THREE from 'three';
import { parseHybridScene } from './manifest.ts';
import type { HybridScene } from './manifest.ts';

export interface HybridStage {
  manifest: HybridScene;
  referenceUrl: string;
  showLayer(id: string | null): void;
  dispose(): void;
}

// Fixed application-owned asset pack. The manifest cannot select a network origin or executable code.
const PACK = '/assets/paris-hybrid-r11/';
export async function loadHybridStage(host: HTMLElement, signal: AbortSignal, onError: (reason: string) => void): Promise<HybridStage> {
  const response = await fetch(`${PACK}scene.json`, { signal });
  if (!response.ok) throw new Error(`Scene manifest unavailable (${response.status})`);
  const manifest = parseHybridScene(await response.json());
  if (signal.aborted) throw new DOMException('Scene cancelled', 'AbortError');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!context) throw new Error('WebGL2 is unavailable. No image fallback was substituted.');
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: false, antialias: false });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  canvas.className = 'hybrid-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Paris artwork assembled from ten source-derived GPU layers; static fidelity checkpoint');
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-manifest.width / 2, manifest.width / 2, manifest.height / 2, -manifest.height / 2, 1, 2000);
  camera.position.z = 900;
  const geometry = new THREE.PlaneGeometry(manifest.width, manifest.height);
  const textures = new Set<THREE.Texture>();
  const meshes = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  let disposed = false;
  let loaded = false;
  let observer: ResizeObserver | null = null;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    delete canvas.dataset.ready;
    observer?.disconnect();
    signal.removeEventListener('abort', dispose);
    canvas.removeEventListener('webglcontextlost', contextLost);
    for (const mesh of meshes.values()) mesh.material.dispose();
    for (const texture of textures) texture.dispose();
    meshes.clear(); textures.clear(); scene.clear(); geometry.dispose();
    renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    dispose();
    onError('WebGL2 context lost. Retry the GPU view; no image fallback was substituted.');
  };
  canvas.addEventListener('webglcontextlost', contextLost);
  signal.addEventListener('abort', dispose, { once: true });
  const draw = () => {
    if (disposed || !loaded) return;
    renderer.render(scene, camera);
    Object.assign(canvas.dataset, {
      ready: '1', renderer: 'three-webgl2', sceneId: manifest.id, effects: 'none',
      layerCount: String(meshes.size), visibleLayers: String([...meshes.values()].filter(m => m.visible).length),
      drawCalls: String(renderer.info.render.calls), triangles: String(renderer.info.render.triangles),
      textures: String(renderer.info.memory.textures), widthPx: String(canvas.width), heightPx: String(canvas.height),
    });
  };
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    const dpr = Math.min(devicePixelRatio || 1, 2, 4096 / width, 4096 / height, Math.sqrt(8_388_608 / (width * height)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const visibleW = Math.max(manifest.width, manifest.height * aspect);
    const visibleH = Math.max(manifest.height, manifest.width / aspect);
    camera.left = -visibleW / 2; camera.right = visibleW / 2;
    camera.top = visibleH / 2; camera.bottom = -visibleH / 2;
    camera.updateProjectionMatrix();
    draw();
  };
  try {
    const loader = new THREE.TextureLoader();
    await Promise.all(manifest.layers.map(async (layer, index) => {
      const texture = await loader.loadAsync(`${PACK}${layer.image}`);
      if (disposed || signal.aborted) { texture.dispose(); throw new DOMException('Scene cancelled', 'AbortError'); }
      textures.add(texture);
      const image = texture.image as HTMLImageElement;
      if (image.naturalWidth !== manifest.width || image.naturalHeight !== manifest.height) throw new Error(`Misaligned layer dimensions: ${layer.id}`);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = layer.relativeDepth;
      mesh.renderOrder = index + 1;
      mesh.name = layer.id;
      scene.add(mesh); meshes.set(layer.id, mesh);
    }));
    if (disposed || signal.aborted) throw new DOMException('Scene cancelled', 'AbortError');
    loaded = true;
    observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return {
      manifest, referenceUrl: `${PACK}${manifest.reference}`,
      showLayer(id) {
        if (id !== null && !meshes.has(id)) throw new Error('Unknown scene layer');
        for (const [key, mesh] of meshes) mesh.visible = id === null || key === id;
        draw();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
