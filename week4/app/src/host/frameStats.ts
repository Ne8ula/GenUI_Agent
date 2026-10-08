// Rolling frame statistics and the status-line text. DOM-free so `node --test` can run it.

/** Fixed-capacity ring of finite numbers; the oldest sample is overwritten first. */
export interface RingBuffer {
  readonly capacity: number;
  readonly size: number;
  /** Ignores non-finite values so one bad sample cannot poison the percentiles. */
  push(value: number): void;
  /** Samples oldest to newest. */
  values(): number[];
  clear(): void;
}

export function createRingBuffer(capacity: number): RingBuffer {
  if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('ring capacity must be a positive integer');
  const data = new Float64Array(capacity);
  let size = 0;
  let next = 0;
  return {
    capacity,
    get size() {
      return size;
    },
    push(value: number) {
      if (!Number.isFinite(value)) return;
      data[next] = value;
      next = (next + 1) % capacity;
      if (size < capacity) size += 1;
    },
    values() {
      const out: number[] = [];
      const start = size < capacity ? 0 : next;
      for (let i = 0; i < size; i++) out.push(data[(start + i) % capacity] ?? 0);
      return out;
    },
    clear() {
      size = 0;
      next = 0;
    },
  };
}

/** Linear-interpolation percentile (the common "type 7" definition). NaN for no samples. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const q = Math.min(Math.max(p, 0), 100) / 100;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
}

export interface Summary {
  count: number;
  median: number;
  p95: number;
  max: number;
}

export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) return null;
  let max = values[0] ?? 0;
  for (const value of values) if (value > max) max = value;
  return { count: values.length, median: percentile(values, 50), p95: percentile(values, 95), max };
}

/** Where the construction stands on the host clock. `durationMs` 0 means the scene has no build. */
export interface BuildProgress {
  timeMs: number;
  durationMs: number;
  /** True while the host clock is frozen (the Pause control). */
  paused: boolean;
}

/** Tiles handed to the renderer against the tiles the scene authored (they differ while tiles are hidden). */
export interface TileCounts {
  shown: number;
  authored: number;
}

export type BuildPhase = 'constructing' | 'complete';

export function buildPhase(progress: Pick<BuildProgress, 'timeMs' | 'durationMs'>): BuildPhase {
  return progress.durationMs > 0 && progress.timeMs < progress.durationMs ? 'constructing' : 'complete';
}

const seconds = (valueMs: number): string => (Math.max(0, valueMs) / 1000).toFixed(1);
const wholeSeconds = (valueMs: number): string => {
  const s = valueMs / 1000;
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
};

/** "constructing 4.2 s of 12 s" while building, "complete" afterwards (and for scenes without a build). */
export function formatBuildState(progress: Pick<BuildProgress, 'timeMs' | 'durationMs'>): string {
  return buildPhase(progress) === 'constructing'
    ? `constructing ${seconds(progress.timeMs)} s of ${wholeSeconds(progress.durationMs)} s`
    : 'complete';
}

export interface StatusInput {
  /** Null until a renderer exists. */
  backend: 'webgl2' | 'canvas2d' | null;
  detail: string | null;
  degraded: boolean;
  particles: number;
  frame: Summary | null;
  drawMs: number | null;
  /** Set when no renderer could be created or drawing failed. */
  unavailable: string | null;
  /** Optional: tile counts and build state. Omitted fields leave the line exactly as it was before tiles existed. */
  tiles?: TileCounts | null;
  build?: BuildProgress | null;
}

const BACKEND_LABEL = { webgl2: 'WebGL2', canvas2d: 'Canvas2D' } as const;
const ms = (value: number): string => value.toFixed(1);

function formatTiles(tiles: TileCounts): string {
  if (tiles.shown < tiles.authored) return `tiles hidden (${tiles.authored} authored)`;
  return `tiles ${tiles.shown}`;
}

/** One status line, plain words and numbers. Nothing here depends on colour. */
export function formatStatus(input: StatusInput): string {
  const parts: string[] = [];
  if (input.unavailable !== null) {
    parts.push(`Rendering unavailable: ${input.unavailable}`);
  } else if (input.backend === null) {
    parts.push('Backend: starting');
  } else {
    if (input.degraded) parts.push(`Renderer degraded: ${input.detail ?? 'WebGL2 context lost'}`);
    parts.push(`Backend: ${BACKEND_LABEL[input.backend]}`);
    if (!input.degraded && input.detail) parts.push(input.detail);
    parts.push(`particles ${Math.max(0, Math.round(input.particles)).toLocaleString('en-US')}`);
    if (input.tiles) parts.push(formatTiles(input.tiles));
    if (input.build) {
      parts.push(`Build: ${formatBuildState(input.build)}`);
      parts.push(`clock ${seconds(input.build.timeMs)} s${input.build.paused ? ' (paused)' : ''}`);
    }
    parts.push(
      input.frame
        ? `frame ${ms(input.frame.median)} ms median / ${ms(input.frame.p95)} ms p95 (last ${input.frame.count})`
        : 'frame timing: collecting',
    );
    parts.push(input.drawMs === null ? 'draw: n/a' : `draw ${ms(input.drawMs)} ms`);
  }
  parts.push('Head tracking: off (not in this step)');
  return parts.join(' · ');
}

/**
 * The part of the status worth announcing to assistive technology: backend, degradation, unavailability
 * and the two build phases (so "constructing" then "complete" is announced once each). Frame numbers and
 * the build clock change several times a second and are deliberately left out.
 */
export function formatLiveState(input: Pick<StatusInput, 'backend' | 'detail' | 'degraded' | 'unavailable' | 'build'>): string {
  if (input.unavailable !== null) return `Rendering unavailable: ${input.unavailable}`;
  if (input.backend === null) return 'Backend: starting';
  const phase = input.build && input.build.durationMs > 0 ? ` · Build: ${buildPhase(input.build)}` : '';
  if (input.degraded) return `Renderer degraded: ${input.detail ?? 'WebGL2 context lost'}${phase}`;
  return `Backend: ${BACKEND_LABEL[input.backend]}${phase}`;
}
