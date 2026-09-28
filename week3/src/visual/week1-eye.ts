// CPU transfer of Week 1's authored SignalEye fragment shader. The geometry,
// luminance, iris, square-pupil, lash, reflection, and ordered-dither equations
// intentionally retain the shader's proportions. JavaScript number/noise behavior
// is deterministic, but is not promised to be pixel-identical to GLSL float output.

export interface EyeInteraction {
  gazeX: number;
  gazeY: number;
  tissueX: number;
  tissueY: number;
  closure: number;
  quiet: boolean;
}

export interface Week1Pose extends EyeInteraction {
  time: number;
  energy: number;
  phosphor?: readonly [number, number, number];
}

const MAX_WIDTH = 360;
const MAX_HEIGHT = 180;
const MAX_PIXELS = 64_800;
const DEFAULT_PHOSPHOR = [1, 0.23, 0.2] as const;
const BACKGROUND = [0.012, 0.014, 0.013] as const;
const PI = Math.PI;

interface RasterGrid {
  width: number;
  height: number;
  x: Float64Array;
  y: Float64Array;
  grain: Float64Array;
  threshold: Float64Array;
}

interface Shape {
  gazeX: number;
  gazeY: number;
  tissueX: number;
  tissueY: number;
  energy: number;
  aperture: number;
  breath: number;
  roll: number;
  stretchX: number;
  stretchY: number;
}

interface Lash {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
}

let cachedGrid: RasterGrid | undefined;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const fract = (value: number) => value - Math.floor(value);

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function noise(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43_758.5453);
}

function field(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = fract(x);
  let fy = fract(y);
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const low = mix(noise(ix, iy), noise(ix + 1, iy), fx);
  const high = mix(noise(ix, iy + 1), noise(ix + 1, iy + 1), fx);
  return mix(low, high, fy);
}

function band(distance: number, width: number): number {
  return Math.exp((-distance * distance) / (width * width));
}

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const denominator = vx * vx + vy * vy;
  const projection = denominator === 0 ? 0 : clamp(((px - ax) * vx + (py - ay) * vy) / denominator, 0, 1);
  return Math.hypot(px - ax - vx * projection, py - ay - vy * projection);
}

function bayer2(x: number, y: number): number {
  return ((2 * x + 3 * y) % 4 + 4) % 4;
}

/** Stationary 4x4 threshold used by the original Week 1 shader. */
export function week1BayerThreshold(x: number, canvasY: number, height: number): number {
  const glY = height - 1 - canvasY;
  const x2 = ((x % 2) + 2) % 2;
  const y2 = ((glY % 2) + 2) % 2;
  const x4 = ((x % 4) + 4) % 4;
  const y4 = ((glY % 4) + 4) % 4;
  return (4 * bayer2(x2, y2) + bayer2(Math.floor(x4 / 2), Math.floor(y4 / 2)) + 0.5) / 16;
}

function getGrid(width: number, height: number): RasterGrid {
  if (cachedGrid?.width === width && cachedGrid.height === height) return cachedGrid;

  const pixelCount = width * height;
  const x = new Float64Array(width);
  const y = new Float64Array(height);
  const grain = new Float64Array(pixelCount);
  const threshold = new Float64Array(pixelCount);

  for (let column = 0; column < width; column++) x[column] = (column + 0.5 - width / 2) / height;
  for (let row = 0; row < height; row++) y[row] = (height / 2 - (row + 0.5)) / height;

  let index = 0;
  for (let row = 0; row < height; row++) {
    const glY = height - 1 - row;
    for (let column = 0; column < width; column++, index++) {
      grain[index] = noise(column, glY) - 0.5;
      threshold[index] = week1BayerThreshold(column, row, height);
    }
  }

  cachedGrid = { width, height, x, y, grain, threshold };
  return cachedGrid;
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || width < 1 || width > MAX_WIDTH) {
    throw new RangeError(`width must be an integer from 1 through ${MAX_WIDTH}`);
  }
  if (!Number.isInteger(height) || height < 1 || height > MAX_HEIGHT) {
    throw new RangeError(`height must be an integer from 1 through ${MAX_HEIGHT}`);
  }
  if (width * height > MAX_PIXELS) throw new RangeError(`raster cannot exceed ${MAX_PIXELS} pixels`);
}

function normalizePose(pose: Week1Pose): { shape: Shape; phosphor: readonly [number, number, number] } {
  const gazeX = clamp(finite("pose.gazeX", pose.gazeX), -1, 1);
  const gazeY = clamp(finite("pose.gazeY", pose.gazeY), -1, 1);
  const tissueX = clamp(finite("pose.tissueX", pose.tissueX), -1, 1);
  const tissueY = clamp(finite("pose.tissueY", pose.tissueY), -1, 1);
  const closure = clamp(finite("pose.closure", pose.closure), 0, 1);
  const energy = clamp(finite("pose.energy", pose.energy), 0, 1);
  const time = finite("pose.time", pose.time);
  const quiet = pose.quiet === true;
  const breath = quiet ? 0 : Math.sin(time * 1.13) * 0.65 + Math.sin(time * 0.47) * 0.35;
  const roll = tissueX * 0.32 + (quiet ? 0 : Math.sin(time * 0.43) * 0.008);

  const supplied = pose.phosphor ?? DEFAULT_PHOSPHOR;
  if (supplied.length !== 3) throw new RangeError("pose.phosphor must contain exactly three channels");
  const phosphor = supplied.map((channel, index) => {
    const value = finite(`pose.phosphor[${index}]`, channel);
    if (value < 0 || value > 1) throw new RangeError("pose.phosphor channels must be between 0 and 1");
    return value;
  }) as unknown as readonly [number, number, number];

  return {
    shape: {
      gazeX,
      gazeY,
      tissueX,
      tissueY,
      energy,
      aperture: 1 - closure,
      breath,
      roll,
      stretchX: 1 + Math.abs(tissueX) * 0.24,
      stretchY: 1 + breath * 0.028,
    },
    phosphor,
  };
}

function lidAt(t: number, shape: Shape): { arch: number; upper: number; lower: number; top: number; bottom: number } {
  const arch = Math.max(0, Math.sin(t * PI));
  const lidLift = shape.tissueY * 0.8 + shape.breath * 0.014 + shape.energy * 0.012;
  const lowerLift = shape.tissueY * 0.38 + shape.breath * 0.007;
  const upper = 0.32 * Math.pow(arch, 0.88) * (1.19 - 0.42 * t) + (0.007 * Math.sin(t * 17) + lidLift) * arch;
  const lower = -0.22 * Math.pow(arch, 1.15) * (0.72 + 0.38 * t) + lowerLift * arch;
  return {
    arch,
    upper,
    lower,
    top: mix(lower * 0.55, upper, shape.aperture),
    bottom: lower * (0.55 + 0.45 * shape.aperture),
  };
}

function buildLashes(shape: Shape): Lash[] {
  const lashes: Lash[] = [];
  for (let index = 0; index < 34; index++) {
    const jitter = noise(index, 7);
    const u = (index + 1 + jitter * 0.5) / 36;
    const rootX = -0.77 + u * 1.5;
    const lid = lidAt(u, shape);
    const rootY = lid.top;
    const midX = rootX + (u - 0.45) * 0.055;
    const midY = rootY + 0.018 + jitter * 0.012;
    const tipX = rootX + (u - 0.45) * (0.07 + jitter * 0.08);
    const tipY = rootY + 0.032 + jitter * 0.039;
    lashes.push({
      ax: rootX,
      ay: rootY,
      bx: midX,
      by: midY,
      cx: tipX,
      cy: tipY,
      minX: Math.min(rootX, midX, tipX) - 0.004,
      maxX: Math.max(rootX, midX, tipX) + 0.004,
    });
  }
  return lashes;
}

function sourceToRaster(
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
  shape: Shape,
): { x: number; y: number } {
  // Invert the shader's tissue translation, rotation, stretch, cheek pull, and tilt.
  const rotatedX = sourceX * shape.stretchX;
  const rotatedY = (sourceY + shape.tissueY * 0.3 * Math.exp(-sourceX * sourceX * 2.8) - sourceX * 0.075) * shape.stretchY;
  const cosine = Math.cos(shape.roll);
  const sine = Math.sin(shape.roll);
  const translatedX = cosine * rotatedX - sine * rotatedY;
  const translatedY = sine * rotatedX + cosine * rotatedY;
  const baseX = translatedX + shape.tissueX * 0.52;
  const baseY = translatedY + shape.tissueY * 0.58 + shape.breath * 0.009;
  return {
    x: baseX * height + width / 2 - 0.5,
    y: height / 2 - 0.5 - baseY * height,
  };
}

function buildLandmarks(width: number, height: number, shape: Shape): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const lidSamples = [0.08, 0.27, 0.5, 0.73, 0.92] as const;
  for (const t of lidSamples) {
    const lid = lidAt(t, shape);
    points.push(sourceToRaster(-0.77 + t * 1.5, lid.top, width, height, shape));
  }
  for (const t of lidSamples) {
    const lid = lidAt(t, shape);
    points.push(sourceToRaster(-0.77 + t * 1.5, lid.bottom, width, height, shape));
  }

  const irisCenterX = shape.gazeX * 0.78 - 0.055;
  const irisCenterY = shape.gazeY * 0.78 + 0.125;
  const gazeScaleX = 1 + Math.abs(shape.gazeX) * 0.4;
  points.push(sourceToRaster(irisCenterX, irisCenterY, width, height, shape));
  for (const angle of [0, PI / 2, PI, (PI * 3) / 2]) {
    const radius = 0.278 + 0.002 * Math.sin(angle * 37) + 0.002 * Math.sin(angle * 59);
    points.push(
      sourceToRaster(
        irisCenterX + (Math.cos(angle) * radius) / gazeScaleX,
        irisCenterY + Math.sin(angle) * radius,
        width,
        height,
        shape,
      ),
    );
  }

  const pupilHalfSize = 0.105 + shape.energy * 0.016;
  for (const [xSign, ySign] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    points.push(
      sourceToRaster(
        irisCenterX + (xSign * pupilHalfSize) / gazeScaleX,
        irisCenterY + ySign * pupilHalfSize,
        width,
        height,
        shape,
      ),
    );
  }
  return points;
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

export function rasterizeWeek1Eye(
  width: number,
  height: number,
  pose: Week1Pose,
  target?: Uint8ClampedArray,
): { data: Uint8ClampedArray; landmarks: Array<{ x: number; y: number }> } {
  validateDimensions(width, height);
  const expectedBytes = width * height * 4;
  if (target !== undefined && target.length !== expectedBytes) {
    throw new RangeError(`target length must be exactly ${expectedBytes} bytes`);
  }

  const data = target ?? new Uint8ClampedArray(expectedBytes);
  const { shape, phosphor } = normalizePose(pose);
  const grid = getGrid(width, height);
  const lashes = buildLashes(shape);
  const cosine = Math.cos(shape.roll);
  const sine = Math.sin(shape.roll);

  let pixelIndex = 0;
  let byteIndex = 0;
  for (let row = 0; row < height; row++) {
    const baseY = grid.y[row];
    for (let column = 0; column < width; column++, pixelIndex++, byteIndex += 4) {
      let px = grid.x[column] - shape.tissueX * 0.52;
      let py = baseY - shape.tissueY * 0.58 - shape.breath * 0.009;
      const rotatedX = cosine * px + sine * py;
      const rotatedY = -sine * px + cosine * py;
      px = rotatedX / shape.stretchX;
      py = rotatedY / shape.stretchY;
      py -= shape.tissueY * 0.3 * Math.exp(-px * px * 2.8);
      py += px * 0.075;

      const t = clamp((px + 0.77) / 1.5, 0, 1);
      const lid = lidAt(t, shape);
      const edge = Math.min(lid.top - py, py - lid.bottom);
      const span = smoothstep(-0.78, -0.745, px) * (1 - smoothstep(0.71, 0.745, px));
      const inside = smoothstep(-0.002, 0.007, edge) * span;
      const pores = field(px * 135, py * 135) * 0.55 + field(px * 310, py * 310) * 0.45;
      let skin = 0.34 + 0.14 * field(px * 5, py * 5) + 0.035 * (pores - 0.5);
      skin += 0.23 * band(py - lid.bottom + 0.11, 0.15) * lid.arch;
      skin -= 0.35 * band(py - lid.top - 0.055, 0.09) * lid.arch;
      skin -= 0.19 * band(py - lid.upper - 0.1 - 0.035 * Math.sin(t * 3), 0.014 + 0.006 * field(px * 30, py * 30)) * lid.arch;
      skin += 0.11 * band(py - lid.upper - 0.175, 0.046) * lid.arch;
      skin -= 0.075 * band(py - lid.lower + 0.08, 0.01) * lid.arch;

      const brow = 0.44 + 0.06 * Math.sin(t * 3.3) - 0.05 * t + shape.tissueY * 0.55 + shape.breath * 0.012;
      skin -= 0.24 * band(py - brow, 0.065) * smoothstep(0.05, 0.2, t) * (1 - smoothstep(0.7, 0.99, t));
      skin -= 0.075 * band(py - brow, 0.08) * Math.pow(Math.max(0, Math.sin(px * 190 + py * 48)), 7);

      let luminance: number;
      if (inside === 0) {
        // The shader's mix(skin, value, inside) is exactly skin here. Skip the
        // full sclera/iris/pupil path without approximating the aperture edge.
        luminance = skin;
      } else {
        let sclera = 0.86 - 0.28 * Math.pow(Math.abs(px) / 0.8, 2);
        sclera -= 0.38 * band(py - lid.top, 0.08) + 0.1 * band(py - lid.bottom, 0.035);

        let qx = px - shape.gazeX * 0.78 + 0.055;
        const qy = py - shape.gazeY * 0.78 - 0.125;
        qx *= 1 + Math.abs(shape.gazeX) * 0.4;
        const radius = Math.hypot(qx, qy);
        const angle = Math.atan2(qy, qx);
        const irisRadius = 0.278 + 0.002 * Math.sin(angle * 37) + 0.002 * Math.sin(angle * 59);
        const irisMask = 1 - smoothstep(irisRadius - 0.003, irisRadius + 0.004, radius);
        let value = sclera;

        if (irisMask !== 0) {
          // With a zero mask the shader's iris mix and masked reflection are
          // exact no-ops; the square pupil is also strictly inside this radius.
          let fibers = field(angle * 61 + Math.sin(radius * 26) * 0.7, radius * 70);
          fibers += 0.2 * Math.sin(angle * 197 - radius * 46) + 0.15 * field(angle * 39, radius * 120);
          let iris = 0.16 + 0.28 * fibers + 0.12 * band(radius - 0.16, 0.055);
          iris -= 0.14 * band(radius - 0.265, 0.016);
          iris -= 0.12 * band(radius - 0.119 - 0.012 * Math.sin(angle * 19), 0.012);
          iris -= 0.33 * band(py - lid.top, 0.105);
          value = mix(sclera, iris, irisMask);

          const pupilHalfSize = 0.105 + shape.energy * 0.016;
          const pupilBoxX = Math.abs(qx) - pupilHalfSize;
          const pupilBoxY = Math.abs(qy) - pupilHalfSize;
          const square = Math.hypot(Math.max(pupilBoxX, 0), Math.max(pupilBoxY, 0)) + Math.min(Math.max(pupilBoxX, pupilBoxY), 0);
          const pupil = 1 - smoothstep(-0.003, 0.003, square);
          value = mix(value, 0.014, pupil);

          let reflection = band(Math.hypot(qx + 0.072, (qy - 0.055) * 1.8), 0.029);
          reflection += 0.4 * band(Math.hypot(qx - 0.058, qy + 0.068), 0.012);
          value += reflection * 0.85 * irisMask;
        }

        const duct = Math.exp(-Math.pow((px + 0.705) / 0.06, 2) - Math.pow((py + 0.015) / 0.037, 2));
        value = mix(value, 0.32, duct);
        value += 0.21 * band(py - lid.bottom - 0.006, 0.007) * lid.arch;
        luminance = mix(skin, value, inside);
      }

      luminance -= 0.34 * band(py - lid.top, 0.013) * span;
      luminance -= 0.09 * band(py - lid.bottom, 0.006) * span;

      // Most pixels never approach an upper lash. Avoid the original 34-lash
      // loop there; within the band, reject lashes whose x extent is remote.
      if (px > -0.88 && px < 0.84 && py > lid.top - 0.08 && py < lid.top + 0.15) {
        for (const lash of lashes) {
          if (px < lash.minX || px > lash.maxX) continue;
          const distance = Math.min(
            segmentDistance(px, py, lash.ax, lash.ay, lash.bx, lash.by),
            segmentDistance(px, py, lash.bx, lash.by, lash.cx, lash.cy),
          );
          luminance -= 0.28 * (1 - smoothstep(0.0004, 0.0028, distance));
        }
      }

      luminance = clamp((luminance - 0.14) * 1.48 + grid.grain[pixelIndex] * 0.08, 0, 1);
      const binary = luminance < grid.threshold[pixelIndex] ? 0 : 1;
      luminance = mix(luminance, binary, 0.94);

      const vignette = 1 - 0.33 * smoothstep(0.7, 1.4, Math.hypot(px * 0.75, py));
      data[byteIndex] = byte(mix(BACKGROUND[0], phosphor[0], luminance) * vignette);
      data[byteIndex + 1] = byte(mix(BACKGROUND[1], phosphor[1], luminance) * vignette);
      data[byteIndex + 2] = byte(mix(BACKGROUND[2], phosphor[2], luminance) * vignette);

      // Feather only the outer tissue. Restore full coverage around the actual
      // aperture/lashes and brow so anatomy is not clipped by a panel-shaped mask.
      const socketMetric = Math.pow(Math.abs(px) / 1.0, 6) + Math.pow(Math.abs(py - 0.02) / 0.48, 6);
      const socketAlpha = 1 - smoothstep(0.58, 1.08, socketMetric);
      const horizontalKeep = smoothstep(-0.88, -0.82, px) * (1 - smoothstep(0.78, 0.84, px));
      const eyeKeep = horizontalKeep * smoothstep(lid.bottom - 0.15, lid.bottom - 0.1, py) * (1 - smoothstep(lid.top + 0.12, lid.top + 0.17, py));
      const browKeep = horizontalKeep * (1 - smoothstep(0.075, 0.11, Math.abs(py - brow)));
      data[byteIndex + 3] = byte(Math.max(socketAlpha, eyeKeep, browKeep));
    }
  }

  return { data, landmarks: buildLandmarks(width, height, shape) };
}
