import * as THREE from 'three';

export function captureCamera(camera: THREE.PerspectiveCamera, size: number) {
  if (size !== 512 || camera.aspect !== 1) throw new Error('Repair capture requires a 512px square camera.');
  camera.updateMatrixWorld();
  const cv = camera.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(1, -1, -1)).elements;
  const f = size / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  return { K: [[f, 0, size / 2], [0, f, size / 2], [0, 0, 1]] as const, world_from_cv: Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => cv[c * 4 + r]!)) };
}

// Development-only render export, not a reconstruction or runtime model tool.
export function captureSource(renderer: THREE.WebGLRenderer, mesh: THREE.Mesh, camera: THREE.PerspectiveCamera) {
  const size = 512;
  const calibration = captureCamera(camera, size);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#111615');
  const sourceMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const source = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(mesh.geometry, sourceMaterial); source.matrixAutoUpdate = false; source.matrix.copy(mesh.matrixWorld); scene.add(source);
  const colorTarget = new THREE.WebGLRenderTarget(size, size); colorTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const depthTarget = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType, format: THREE.RGBAFormat });
  const depthMaterial = new THREE.ShaderMaterial({ side: THREE.DoubleSide,
    vertexShader: 'varying float cameraZ; void main(){ vec4 p = modelViewMatrix * vec4(position,1.0); cameraZ = -p.z; gl_Position = projectionMatrix * p; }',
    fragmentShader: 'varying float cameraZ; void main(){ gl_FragColor = vec4(cameraZ,0.0,0.0,1.0); }',
  });
  const oldTarget = renderer.getRenderTarget();
  const png = (pixels: Uint8ClampedArray<ArrayBuffer>) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    canvas.getContext('2d')!.putImageData(new ImageData(pixels, size, size), 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  };
  try {
    renderer.setRenderTarget(colorTarget); renderer.render(scene, camera);
    const color = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(colorTarget, 0, 0, size, size, color);
    scene.background = new THREE.Color(0); source.material = depthMaterial;
    renderer.setRenderTarget(depthTarget); renderer.render(scene, camera);
    const depthRGBA = new Float32Array(size * size * 4); renderer.readRenderTargetPixels(depthTarget, 0, 0, size, size, depthRGBA);
    const rgb = new Uint8ClampedArray(color.length), mask = new Uint8ClampedArray(color.length), depth = new Float32Array(size * size);
    let supported = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, from = ((size - y - 1) * size + x) * 4;
      rgb.set(color.subarray(from, from + 4), i * 4); rgb[i * 4 + 3] = 255;
      const z = depthRGBA[from]!;
      if (!Number.isFinite(z) || z < 0 || z > camera.far) throw new Error('Invalid rendered depth.');
      depth[i] = z;
      const hole = z === 0; if (!hole) supported++;
      mask.set([hole ? 255 : 0, hole ? 255 : 0, hole ? 255 : 0, 255], i * 4);
    }
    if (supported < 4096) throw new Error('Insufficient source depth or unavailable float render target.');
    const bytes = new Uint8Array(depth.buffer);
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { ...calibration, width: size, height: size, near: camera.near, far: camera.far, rgb: png(rgb), mask: png(mask), depth: btoa(binary), supported };
  } finally {
    renderer.setRenderTarget(oldTarget); colorTarget.dispose(); depthTarget.dispose(); sourceMaterial.dispose(); depthMaterial.dispose();
  }
}
