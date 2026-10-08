// URL parameters for the host. DOM-free so `node --test` can run it.
// Read once at load, whitelisted and clamped; the controls then reflect the effective values.
import type { WalkerFacing } from '../scene/arrival.ts';
import type { BackendPreference } from '../scene/types.ts';

export const BACKENDS = ['auto', 'webgl2', 'canvas2d'] as const satisfies readonly BackendPreference[];
export const FACINGS = ['away', 'toward'] as const satisfies readonly WalkerFacing[];
export const DENSITIES = [0.5, 0.75, 1, 1.25] as const;
export type Density = (typeof DENSITIES)[number];
/** `seed33` is the selected look (beaded light, dither tiles); `arrival` is the earlier step-1 frame, kept for comparison. */
export const LOOKS = ['seed33', 'arrival'] as const;
export type Look = (typeof LOOKS)[number];

export const SEED_MIN = 0;
export const SEED_MAX = 9999;
/** The arrival look's default seed (the step-1 frame the owner looked at). */
export const DEFAULT_SEED = 7;
/** The selected seed-33 look is authored and evidenced at seed 33; `scene/seed33.ts` DEFAULT_SEED33.seed is the same number (a test checks it). */
export const DEFAULT_SEED_SEED33 = 33;
/** Default seed per look, so `look=seed33` with no `seed` is the selected frame and `look=arrival` is the old one. */
export const DEFAULT_SEEDS = { seed33: DEFAULT_SEED_SEED33, arrival: DEFAULT_SEED } as const satisfies Record<Look, number>;
export const defaultSeedFor = (look: Look): number => DEFAULT_SEEDS[look];
export const DEFAULT_DENSITY: Density = 1;
export const DEFAULT_LOOK: Look = 'seed33';
/** Construction length in host-clock ms; 0 means the scene is complete at t = 0. */
export const DEFAULT_BUILD_MS = 12_000;
export const BUILD_MAX_MS = 60_000;
/** The host and life clocks may start anywhere in the first minute. */
export const START_MAX_MS = 60_000;

export interface HostParams {
  backend: BackendPreference;
  seed: number;
  density: Density;
  facing: WalkerFacing;
  look: Look;
  /** Construction length (`build`), ms; 0 = complete. Only the seed-33 look builds. */
  buildMs: number;
  /** Both the host clock and the life clock start here (`t`, ms), so a still at t=3000 shows the build at 3 s. */
  startMs: number;
  /** `tiles=0` hands the renderer a frame without tiles; the authored tiles are never modified. */
  showTiles: boolean;
  reduced: boolean;
  paused: boolean;
  /** Hides the fixture bar so the stage fills the viewport (screenshots and video). */
  capture: boolean;
  /** Enables the canvas dataset reporting used by the capture script. */
  fixture: boolean;
  /**
   * `clock=manual` (honoured only together with `fixture`): the host clock and life advance only when the
   * capture script calls `window.__evaFixture.step(ms)`, so a clip is rendered at an exact frame time
   * whatever the machine's frame rate. Evidence tooling; never a user-facing mode.
   */
  manualClock: boolean;
}

/** Non-negative integer milliseconds clamped to `max`; anything else yields `fallback`. */
function parseMs(raw: string | null, max: number, fallback: number): number {
  if (raw === null) return fallback;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return fallback;
  return Math.min(Number(text), max);
}

/** `t`: start time in ms, 0..START_MAX_MS; anything else is 0. */
export function parseStartMs(raw: string | null): number {
  return parseMs(raw, START_MAX_MS, 0);
}

/** `build`: construction length in ms, 0..BUILD_MAX_MS (0 = complete); anything else is the default 12 s. */
export function parseBuildMs(raw: string | null): number {
  return parseMs(raw, BUILD_MAX_MS, DEFAULT_BUILD_MS);
}

export interface ParamEnvironment {
  /** The OS reduced-motion preference. Used only when the URL says nothing about `reduced`. */
  prefersReducedMotion?: boolean;
}

function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  if (raw === null) return fallback;
  const value = raw.trim().toLowerCase();
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

/** Integer clamp into SEED_MIN..SEED_MAX. NaN falls back to `fallback` (the arrival default unless the look says otherwise). */
export function clampSeed(value: number, fallback: number = DEFAULT_SEED): number {
  if (Number.isNaN(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), SEED_MIN), SEED_MAX);
}

/** Accepts only plain integers ("7", "+7", "-3"); anything else is `fallback` (pass `defaultSeedFor(look)`). */
export function parseSeed(raw: string | null, fallback: number = DEFAULT_SEED): number {
  if (raw === null) return fallback;
  const text = raw.trim();
  if (!/^[+-]?\d+$/.test(text)) return fallback;
  return clampSeed(Number(text), fallback);
}

/**
 * The seed to show after the Look control changes. A seed still at the old look's default follows the new look's
 * default (so switching to Arrival shows seed 7 and back shows seed 33); a seed the user chose is kept.
 */
export function seedAfterLookChange(seed: number, from: Look, to: Look): number {
  return seed === defaultSeedFor(from) ? defaultSeedFor(to) : seed;
}

/** Snaps a finite number to the nearest allowed density (the lower one on a tie). */
export function snapDensity(value: number): Density {
  if (!Number.isFinite(value)) return DEFAULT_DENSITY;
  let best: Density = DENSITIES[0];
  for (const candidate of DENSITIES) {
    if (Math.abs(candidate - value) < Math.abs(best - value)) best = candidate;
  }
  return best;
}

export function parseDensity(raw: string | null): Density {
  if (raw === null || raw.trim() === '') return DEFAULT_DENSITY;
  return snapDensity(Number(raw.trim()));
}

/** `reduced=1` forces on, `reduced=0` forces off, anything else defers to the OS preference. */
function parseReduced(raw: string | null, prefersReducedMotion: boolean): boolean {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return prefersReducedMotion;
}

export function parseParams(search: string, env: ParamEnvironment = {}): HostParams {
  const query = new URLSearchParams(search);
  const fixtureRaw = query.get('fixture');
  const fixture = fixtureRaw !== null && fixtureRaw !== '0'; // `?fixture` has an empty value; only `fixture=0` opts out.
  const look = pick(query.get('look'), LOOKS, DEFAULT_LOOK);
  return {
    backend: pick(query.get('backend'), BACKENDS, 'auto'),
    // The look decides the default seed: 33 for seed33, 7 for arrival (also what a junk `seed` falls back to).
    seed: parseSeed(query.get('seed'), defaultSeedFor(look)),
    density: parseDensity(query.get('density')),
    facing: pick(query.get('facing'), FACINGS, 'away'),
    look,
    buildMs: parseBuildMs(query.get('build')),
    startMs: parseStartMs(query.get('t')),
    showTiles: query.get('tiles') !== '0',
    reduced: parseReduced(query.get('reduced'), env.prefersReducedMotion ?? false),
    paused: query.get('paused') === '1',
    capture: query.get('capture') === '1',
    fixture,
    manualClock: fixture && query.get('clock') === 'manual',
  };
}

/** A new seed in range that differs from the current one. `rand` is injectable for tests. */
export function reseed(current: number, rand: () => number = Math.random): number {
  const span = SEED_MAX - SEED_MIN; // number of values other than the current one
  const offset = 1 + Math.min(Math.floor(rand() * span), span - 1);
  return SEED_MIN + ((clampSeed(current) - SEED_MIN + offset) % (span + 1));
}

/** Build-length choices for the control: the presets plus the effective value, ascending and unique. */
export const BUILD_PRESETS_MS = [0, 3000, 6000, 12_000, 24_000] as const;
export function buildChoices(effectiveMs: number): number[] {
  return [...new Set<number>([...BUILD_PRESETS_MS, effectiveMs])].sort((a, b) => a - b);
}

/** Upper end of the time scrub: ten seconds past the build, never below the current start time. */
export function scrubMaxMs(buildMs: number, startMs: number): number {
  return Math.min(START_MAX_MS, Math.max(startMs, Math.max(0, buildMs) + 10_000));
}
