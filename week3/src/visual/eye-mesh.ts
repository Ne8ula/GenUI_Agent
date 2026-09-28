export interface Point { x: number; y: number }
export interface EyeMesh { width: number; height: number; columns: number; rows: number; points: Point[] }

/** Shared piecewise-affine mapping for the eye pixels and their feature boxes. */
export function createEyeMesh(width: number, height: number, project: (x: number, y: number) => Point, columns = 24, rows = 12): EyeMesh {
  if (!(width > 0 && height > 0) || !Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns > 32 || rows > 16) throw new Error('Invalid eye mesh bounds');
  const points: Point[] = [];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const point = project(col / columns * width, row / rows * height);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Invalid eye projection');
    points.push(point);
  }
  return { width, height, columns, rows, points };
}
export function projectEyePoint(mesh: EyeMesh, x: number, y: number): Point {
  const u = Math.max(0, Math.min(mesh.columns, x / mesh.width * mesh.columns));
  const v = Math.max(0, Math.min(mesh.rows, y / mesh.height * mesh.rows));
  const col = Math.min(mesh.columns - 1, Math.floor(u));
  const row = Math.min(mesh.rows - 1, Math.floor(v));
  const fx = u - col, fy = v - row;
  const stride = mesh.columns + 1;
  const tl = mesh.points[row * stride + col], tr = mesh.points[row * stride + col + 1];
  const bl = mesh.points[(row + 1) * stride + col], br = mesh.points[(row + 1) * stride + col + 1];
  return fx + fy <= 1
    ? { x: tl.x + fx * (tr.x - tl.x) + fy * (bl.x - tl.x), y: tl.y + fx * (tr.y - tl.y) + fy * (bl.y - tl.y) }
    : { x: br.x + (1 - fx) * (bl.x - br.x) + (1 - fy) * (tr.x - br.x), y: br.y + (1 - fx) * (bl.y - br.y) + (1 - fy) * (tr.y - br.y) };
}

export function drawEyeMesh(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, mesh: EyeMesh) {
  const { columns, rows, width, height, points } = mesh;
  const stride = columns + 1, dx = width / columns, dy = height / rows;
  const triangle = (a: Point, b: Point, c: Point, sx: number, sy: number, stepX: number, stepY: number) => {
    const aa = (b.x - a.x) / stepX, bb = (b.y - a.y) / stepX;
    const cc = (c.x - a.x) / stepY, dd = (c.y - a.y) / stepY;
    ctx.save();
    // Slight clip overlap prevents antialiased triangle edges becoming a dark grid.
    const centerX = (a.x + b.x + c.x) / 3, centerY = (a.y + b.y + c.y) / 3;
    const padded = (p: Point) => {
      const length = Math.hypot(p.x - centerX, p.y - centerY) || 1;
      return { x: p.x + (p.x - centerX) / length * .8, y: p.y + (p.y - centerY) / length * .8 };
    };
    const pa = padded(a), pb = padded(b), pc = padded(c);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y); ctx.closePath(); ctx.clip();
    ctx.transform(aa, bb, cc, dd, a.x - aa * sx - cc * sy, a.y - bb * sx - dd * sy);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  };
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const tl = points[row * stride + col], tr = points[row * stride + col + 1];
    const bl = points[(row + 1) * stride + col], br = points[(row + 1) * stride + col + 1];
    triangle(tl, tr, bl, col * dx, row * dy, dx, dy);
    triangle(br, bl, tr, (col + 1) * dx, (row + 1) * dy, -dx, -dy);
  }
}
