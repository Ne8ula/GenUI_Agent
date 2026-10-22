type SurfaceGeometry = {
  positions: ArrayLike<number>;
  colors: ArrayLike<number>;
  indices: ArrayLike<number>;
  /** Authored solid ownership. Nearby separate solids must not erase each
   * other's samples before depth testing (e.g. a cabinet body and its doors). */
  samplingGroups?: ArrayLike<number>;
};

const MAX_VERTICES = 200_000;
const MAX_TRIANGLES = 400_000;
const MAX_POINTS = 120_000;
const MAX_ATTEMPTS = 600_000;

/** Deterministic surface samples, not raw mesh vertices or voxel-centre geometry.
 * Spacing uses the input coordinate units; it does not establish metric scale.
 * A shared explicit spacing is preferable for comparing reconstructed candidates.
 * Resource caps can leave areas undersampled, especially at very small spacing.
 */
export function sampleSurfacePoints(
  { positions, colors, indices, samplingGroups }: SurfaceGeometry,
  spacing?: number,
): { positions: Float32Array; colors: Float32Array; faces: Uint32Array; spacing: number } {
  if (positions.length % 3 || positions.length / 3 > MAX_VERTICES ||
      colors.length !== positions.length || indices.length % 3 ||
      indices.length / 3 > MAX_TRIANGLES ||
      (spacing !== undefined && (!Number.isFinite(spacing) || spacing <= 0))) {
    throw new Error('Invalid or oversized surface sampling input.');
  }
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i]) || !Number.isFinite(Math.fround(positions[i]!)) ||
        !Number.isFinite(colors[i]) || colors[i]! < 0 || colors[i]! > 1) {
      throw new Error('Surface positions must be finite and colors must be normalized.');
    }
  }
  for (let i = 0; i < indices.length; i++) {
    if (!Number.isInteger(indices[i]) || indices[i]! < 0 || indices[i]! >= positions.length / 3) {
      throw new Error('Invalid surface triangle index.');
    }
  }
  if(samplingGroups&&(samplingGroups.length!==indices.length/3||
    Array.from(samplingGroups).some(group=>!Number.isInteger(group)||group<0||group>MAX_TRIANGLES))){
    throw new Error('Invalid surface sampling groups.');
  }

  const areas = new Float64Array(indices.length / 3);
  let area = 0, triangleCount = 0;
  for (let face = 0; face < areas.length; face++) {
    const a = indices[face * 3]! * 3, b = indices[face * 3 + 1]! * 3, c = indices[face * 3 + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const faceArea = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    areas[face] = faceArea;
    area += faceArea;
    if (faceArea > 0) triangleCount++;
  }
  const actualSpacing = spacing ?? (area > 0 ? Math.sqrt(area / 60_000) : 0.01);
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isSafeInteger(Math.floor(positions[i]! / actualSpacing))) {
      throw new Error('Surface coordinates exceed sampling grid precision.');
    }
  }
  const outputPositions: number[] = [], outputColors: number[] = [], outputFaces: number[] = [];
  const cells = new Map<string, number[]>();
  const distanceSquared = actualSpacing * actualSpacing;
  let attempts = 0;

  const add = (face: number, wa: number, wb: number, wc: number) => {
    if (attempts++ >= MAX_ATTEMPTS || outputPositions.length / 3 >= MAX_POINTS) return;
    const a = indices[face * 3]! * 3, b = indices[face * 3 + 1]! * 3, c = indices[face * 3 + 2]! * 3;
    const x = Math.fround(positions[a]! * wa + positions[b]! * wb + positions[c]! * wc);
    const y = Math.fround(positions[a + 1]! * wa + positions[b + 1]! * wb + positions[c + 1]! * wc);
    const z = Math.fround(positions[a + 2]! * wa + positions[b + 2]! * wb + positions[c + 2]! * wc);
    const gx = Math.floor(x / actualSpacing), gy = Math.floor(y / actualSpacing), gz = Math.floor(z / actualSpacing);
    const group=samplingGroups?.[face]??0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const neighbors = cells.get(`${group}:${gx + dx},${gy + dy},${gz + dz}`);
      if (!neighbors) continue;
      for (const index of neighbors) {
        if ((x - outputPositions[index]!) ** 2 + (y - outputPositions[index + 1]!) ** 2 +
            (z - outputPositions[index + 2]!) ** 2 < distanceSquared) return;
      }
    }
    const key = `${group}:${gx},${gy},${gz}`;
    const index = outputPositions.length;
    const bucket = cells.get(key);
    if (bucket) bucket.push(index);
    else cells.set(key, [index]);
    outputPositions.push(x, y, z);
    outputFaces.push(face);
    for (let channel = 0; channel < 3; channel++) {
      outputColors.push(colors[a + channel]! * wa + colors[b + channel]! * wb + colors[c + channel]! * wc);
    }
  };

  // Visit every nondegenerate face before filling large faces. This retains small
  // disconnected furniture features instead of allocating every sample to walls.
  for (let face = 0; face < areas.length && outputPositions.length / 3 < MAX_POINTS; face++) {
    if (areas[face]! > 0) add(face, 1 / 3, 1 / 3, 1 / 3);
  }
  const extraBudget = Math.min(MAX_ATTEMPTS - triangleCount, Math.ceil(area / distanceSquared * 6));
  for (let face = 0; face < areas.length && outputPositions.length / 3 < MAX_POINTS; face++) {
    const count = area > 0 ? Math.floor(extraBudget * (areas[face]! / area)) : 0;
    for (let sample = 0; sample < count && outputPositions.length / 3 < MAX_POINTS; sample++) {
      // Equal-area barycentric mapping with a base-two low-discrepancy sequence.
      let bits = sample + 1, fraction = 0, weight = 0.5;
      while (bits > 0) {
        fraction += (bits % 2) * weight;
        bits = Math.floor(bits / 2);
        weight *= 0.5;
      }
      const radius = Math.sqrt((sample + 0.5) / count);
      add(face, 1 - radius, radius * (1 - fraction), radius * fraction);
    }
  }
  return { positions: Float32Array.from(outputPositions), colors: Float32Array.from(outputColors), faces: Uint32Array.from(outputFaces), spacing: actualSpacing };
}
