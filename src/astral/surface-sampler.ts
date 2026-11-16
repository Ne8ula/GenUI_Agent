import {
  Box3, BufferGeometry, Color, Float32BufferAttribute, Matrix3, Mesh, SRGBColorSpace,
  Triangle, Vector2, Vector3, type Material, type Object3D, type Texture,
} from 'three';
import type { PointCloud } from './types.ts';

type SurfaceMaterial = Material & { color?: Color; map?: Texture | null; emissive?: Color };
type Pixels = { width: number; height: number; data: Uint8ClampedArray };
type Vertex = { p: Vector3; n: Vector3; uv: Vector2 };
const EPSILON = 1e-5;
export const ORDERED_ROW_SPACING = 0.014;
export const ORDERED_ALONG_ROW_SPACING = 0.007;

// Half-open intervals give a shared triangle edge to just one side of the lattice.
const latticeCeil = (coordinate: number, spacing: number) => Math.ceil(coordinate / spacing - 1e-7);

function* contourRows(geometry: BufferGeometry, rowSpacing: number, alongSpacing: number) {
  const positions = geometry.getAttribute('position');
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3();
  const triangle = new Triangle(a, b, c), vertices = [a, b, c];
  const row = { a, b, c, triangle: 0, first: 0, end: 0, weightA: 0, weightB: 0, stepA: 0, stepB: 0 };
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
    triangle.getNormal(normal);
    // Horizontal faces: constant-x rows. Everything else: constant-y contours.
    const slice = Math.abs(normal.y) >= Math.SQRT1_2 ? 0 : 1;
    const along = slice === 0 ? 2 : Math.abs(normal.x) > Math.abs(normal.z) ? 2 : 0;
    const ax = a.getComponent(along), ay = a.getComponent(slice);
    const bx = b.getComponent(along), by = b.getComponent(slice);
    const cx = c.getComponent(along), cy = c.getComponent(slice);
    const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(determinant) < 1e-15) continue;
    row.triangle = i;
    row.stepA = (by - cy) * alongSpacing / determinant;
    row.stepB = (cy - ay) * alongSpacing / determinant;
    const endRow = latticeCeil(Math.max(ay, by, cy), rowSpacing);
    for (let r = latticeCeil(Math.min(ay, by, cy), rowSpacing); r < endRow; r++) {
      const y = r * rowSpacing;
      let low = Infinity, high = -Infinity;
      for (let edge = 0; edge < 3; edge++) {
        const from = vertices[edge], to = vertices[(edge + 1) % 3];
        const fy = from.getComponent(slice), ty = to.getComponent(slice);
        if (fy === ty || y < Math.min(fy, ty) - 1e-9 || y >= Math.max(fy, ty) - 1e-9) continue;
        const x = from.getComponent(along) + (to.getComponent(along) - from.getComponent(along)) * (y - fy) / (ty - fy);
        low = Math.min(low, x); high = Math.max(high, x);
      }
      row.first = latticeCeil(low, alongSpacing); row.end = latticeCeil(high, alongSpacing);
      if (row.first >= row.end) continue;
      const x = row.first * alongSpacing;
      row.weightA = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / determinant;
      row.weightB = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / determinant;
      yield row;
    }
  }
}

function* orderedSamples(geometry: BufferGeometry, rowSpacing: number, alongSpacing: number, p: Vector3, n: Vector3, uv: Vector2) {
  const normals = geometry.getAttribute('normal'), uvs = geometry.getAttribute('uv');
  const na = new Vector3(), nb = new Vector3(), nc = new Vector3();
  const ua = new Vector2(), ub = new Vector2(), uc = new Vector2();
  let previous = -1;
  for (const row of contourRows(geometry, rowSpacing, alongSpacing)) {
    if (previous !== row.triangle) {
      previous = row.triangle;
      na.fromBufferAttribute(normals, previous); nb.fromBufferAttribute(normals, previous + 1); nc.fromBufferAttribute(normals, previous + 2);
      ua.set(uvs.getX(previous), uvs.getY(previous)); ub.set(uvs.getX(previous + 1), uvs.getY(previous + 1)); uc.set(uvs.getX(previous + 2), uvs.getY(previous + 2));
    }
    for (let k = 0; k < row.end - row.first; k++) {
      const a = row.weightA + k * row.stepA, b = row.weightB + k * row.stepB, c = 1 - a - b;
      p.copy(row.a).multiplyScalar(a).addScaledVector(row.b, b).addScaledVector(row.c, c);
      n.copy(na).multiplyScalar(a).addScaledVector(nb, b).addScaledVector(nc, c).normalize();
      uv.copy(ua).multiplyScalar(a).addScaledVector(ub, b).addScaledVector(uc, c);
      yield;
    }
  }
}

function texturePixels(texture: Texture): Pixels {
  const image = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) throw new Error('Cannot read surface texture.');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

// Clip before allocating points, so exterior box faces consume neither area nor budget.
function clip(vertices: Vertex[], bounds: Box3): Vertex[] {
  for (let axis = 0; axis < 3; axis++) for (const side of [-1, 1]) {
    const edge = (side < 0 ? bounds.min : bounds.max).getComponent(axis);
    const distance = (v: Vertex) => side * (v.p.getComponent(axis) - edge);
    if (vertices.every(v => distance(v) <= 0)) continue;
    const result: Vertex[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      const da = distance(a), db = distance(b);
      if (da <= 0) result.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const t = da / (da - db);
        const p = a.p.clone().lerp(b.p, t);
        p.setComponent(axis, edge);
        result.push({ p, n: a.n.clone().lerp(b.n, t), uv: a.uv.clone().lerp(b.uv, t) });
      }
    }
    vertices = result;
  }
  return vertices;
}

function surfaces(mesh: Mesh, bounds: Box3) {
  const geometry = mesh.geometry, position = geometry.getAttribute('position');
  if (!position) return [];
  const normal = geometry.getAttribute('normal'), index = geometry.index;
  const matrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  const materials: SurfaceMaterial[] = [mesh.material].flat();
  const groups = Array.isArray(mesh.material) ? geometry.groups : [{ start: 0, count: index?.count ?? position.count, materialIndex: 0 }];
  const result: { geometry: BufferGeometry; material: SurfaceMaterial; area: number; emitter: boolean }[] = [];
  const triangle = new Triangle(), faceNormal = new Vector3();
  for (const group of groups) {
    const material = materials[group.materialIndex ?? 0];
    if (!material?.visible) continue;
    const channel = material.map?.channel ?? 0;
    const uv = geometry.getAttribute(channel ? `uv${channel}` : 'uv');
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
    let area = 0;
    const start = Math.max(group.start, geometry.drawRange.start);
    const end = Math.min(group.start + group.count, geometry.drawRange.start + geometry.drawRange.count, index?.count ?? position.count);
    for (let i = start; i + 2 < end; i += 3) {
      const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
      triangle.set(...ids.map(id => new Vector3().fromBufferAttribute(position, id)) as [Vector3, Vector3, Vector3]);
      triangle.getNormal(faceNormal).applyMatrix3(matrix).normalize();
      const vertices = ids.map(id => {
        const p = new Vector3().fromBufferAttribute(position, id).applyMatrix4(mesh.matrixWorld);
        // Float32 box faces can lie a few nanometres outside their nominal interior plane.
        for (let axis = 0; axis < 3; axis++) for (const edge of [bounds.min.getComponent(axis), bounds.max.getComponent(axis)]) {
          if (Math.abs(p.getComponent(axis) - edge) < EPSILON) p.setComponent(axis, edge);
        }
        const n = normal ? new Vector3().fromBufferAttribute(normal, id).applyMatrix3(matrix) : faceNormal.clone();
        if (n.lengthSq() < EPSILON) n.copy(faceNormal);
        return { p, n, uv: uv ? new Vector2(uv.getX(id), uv.getY(id)) : new Vector2() };
      });
      const polygon = clip(vertices, bounds);
      if (polygon.length < 3) continue;
      // Discard faces resting against the boundary but pointing away from the room.
      if ([0, 1, 2].some(axis =>
        polygon.every(v => v.p.getComponent(axis) === bounds.min.getComponent(axis)) && faceNormal.getComponent(axis) < -0.5
        || polygon.every(v => v.p.getComponent(axis) === bounds.max.getComponent(axis)) && faceNormal.getComponent(axis) > 0.5)) continue;
      for (let j = 1; j + 1 < polygon.length; j++) {
        const corners = [polygon[0], polygon[j], polygon[j + 1]];
        const size = triangle.set(corners[0].p, corners[1].p, corners[2].p).getArea();
        if (size <= 1e-12) continue;
        area += size;
        for (const v of corners) { positions.push(v.p.x, v.p.y, v.p.z); normals.push(v.n.x, v.n.y, v.n.z); uvs.push(v.uv.x, v.uv.y); }
      }
    }
    if (!area) continue;
    const sampled = new BufferGeometry();
    sampled.setAttribute('position', new Float32BufferAttribute(positions, 3));
    sampled.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    sampled.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    result.push({ geometry: sampled, material, area, emitter: mesh.userData.astralEmitter === true });
  }
  return result;
}

/** Unlit base colour only; no scene lights, AO, metalness, tone mapping or projected paint.
 * Spacing is the geometric mean of row/dot pitch.
 * The caller owns the scene. readTexture keeps CPU texture decoding testable without a DOM. */
export async function sampleSurfacePointCloud(root: Object3D, bounds: Box3, signal: AbortSignal, options: {
  maxPoints?: number; readTexture?: (texture: Texture) => Pixels;
} = {}): Promise<PointCloud> {
  signal.throwIfAborted();
  const maxPoints = options.maxPoints ?? 4_000_000;
  if (!Number.isSafeInteger(maxPoints) || maxPoints <= 0 || maxPoints > 4_000_000
    || bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) throw new Error('Invalid surface sampling bounds or density.');
  root.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  root.traverseVisible(object => { if (object instanceof Mesh) meshes.push(object); });
  const parts: ReturnType<typeof surfaces> = [];
  const pause = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); signal.throwIfAborted(); };
  try {
    for (const mesh of meshes) { await pause(); parts.push(...surfaces(mesh, bounds)); }
    const area = parts.reduce((sum, part) => sum + part.area, 0);
    if (!area) throw new Error('No interior mesh surfaces to sample.');
    let count = 0;
    let rowSpacing = ORDERED_ROW_SPACING, alongSpacing = ORDERED_ALONG_ROW_SPACING;
    // Coarsen the entire lattice, never truncate the last meshes or punch holes in rows.
    let scale = Math.max(1, Math.sqrt(area / (rowSpacing * alongSpacing * maxPoints)));
    for (let attempt = 0; attempt < 8; attempt++) {
      rowSpacing = ORDERED_ROW_SPACING * scale; alongSpacing = ORDERED_ALONG_ROW_SPACING * scale;
      count = 0;
      let rows = 0;
      for (const part of parts) {
        await pause();
        for (const row of contourRows(part.geometry, rowSpacing, alongSpacing)) {
          count += row.end - row.first;
          if (++rows % 32768 === 0) await pause();
        }
      }
      if (count <= maxPoints) break;
      scale *= Math.max(1.01, Math.sqrt(count / maxPoints) * 1.001);
    }
    if (!count || count > maxPoints) throw new Error('Point budget cannot fit the ordered surface lattice.');
    const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    const pixels = new Map<Texture, Pixels>();
    const p = new Vector3(), n = new Vector3(), uv = new Vector2(), color = new Color(), texel = new Color();
    let written = 0;
    for (const part of parts) {
      const samples = orderedSamples(part.geometry, rowSpacing, alongSpacing, p, n, uv);
      const emission = part.emitter && part.material.emissive && part.material.emissive.getHex() !== 0;
      const base = emission ? part.material.emissive! : part.material.color ?? new Color(1, 1, 1);
      const map = emission ? null : part.material.map;
      let image: Pixels | undefined;
      if (map) {
        if (map.matrixAutoUpdate) map.updateMatrix();
        image = pixels.get(map);
        if (!image) { image = (options.readTexture ?? texturePixels)(map); pixels.set(map, image); }
      }
      while (!samples.next().done) {
        if (written % 32768 === 0) await pause();
        p.clamp(bounds.min, bounds.max);
        color.copy(base);
        if (map && image) {
          map.transformUv(uv);
          const x = Math.min(image.width - 1, Math.max(0, Math.floor(uv.x * image.width)));
          const y = Math.min(image.height - 1, Math.max(0, Math.floor(uv.y * image.height)));
          const i = (y * image.width + x) * 4;
          texel.setRGB(image.data[i] / 255, image.data[i + 1] / 255, image.data[i + 2] / 255);
          if (map.colorSpace === SRGBColorSpace) texel.convertSRGBToLinear();
          color.multiply(texel);
        }
        color.convertLinearToSRGB();
        const i = written++ * 3;
        p.toArray(positions, i); n.toArray(normals, i);
        colors[i] = Math.min(1, Math.max(0, color.r)); colors[i + 1] = Math.min(1, Math.max(0, color.g)); colors[i + 2] = Math.min(1, Math.max(0, color.b));
      }
    }
    signal.throwIfAborted();
    return { count, positions, normals, colors, spacing: Math.sqrt(rowSpacing * alongSpacing), ordered: true };
  } finally {
    for (const part of parts) part.geometry.dispose();
  }
}
