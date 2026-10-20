/** One existing vertex nearest each occupied voxel centre. Never invents positions. */
export function spacedPointIndices(positions: ArrayLike<number>, spacing = 0.06): Uint32Array {
  if (!Number.isFinite(spacing) || spacing <= 0 || positions.length % 3 !== 0) throw new Error('Invalid point sampling input.');
  const cells = new Map<string, { index: number; distance: number }>();
  for (let index = 0; index < positions.length / 3; index++) {
    const x = positions[index * 3]!, y = positions[index * 3 + 1]!, z = positions[index * 3 + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new Error('Nonfinite room point.');
    const a = Math.floor(x / spacing), b = Math.floor(y / spacing), c = Math.floor(z / spacing);
    const distance = (x / spacing - a - 0.5) ** 2 + (y / spacing - b - 0.5) ** 2 + (z / spacing - c - 0.5) ** 2;
    const key = `${a},${b},${c}`;
    const previous = cells.get(key);
    if (!previous || distance < previous.distance) cells.set(key, { index, distance });
  }
  return Uint32Array.from(cells.values(), cell => cell.index);
}
