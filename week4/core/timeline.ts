// Authored construction/return timelines as pure data (planning.md §4, DESIGN_PROMPT.md §8).
// Local clock only: this is not progress, and no phase may be presented as loading.

export type PhaseId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'R1' | 'R2' | 'R3';

export interface Phase {
  id: PhaseId;
  name: string;
  startMs: number;
  endMs: number;
  gainFrom: number;
  gainTo: number;
}

export type CueKind = 'staging' | 'speech' | 'sound' | 'picture';

export interface Cue {
  id: string;
  atMs: number;
  kind: CueKind;
  // Required cues (consented staging) are never skipped; skip emits any not yet reached.
  required: boolean;
  // Arrival cues are emitted once the end state is reached, including after skip.
  arrival: boolean;
}

export type TimelineId = 'arrival-full' | 'arrival-reduced' | 'return-graceful';

export interface Timeline {
  id: TimelineId;
  durationMs: number;
  phases: readonly Phase[];
  cues: readonly Cue[];
}

const cue = (id: string, atMs: number, kind: CueKind, flags: Partial<Pick<Cue, 'required' | 'arrival'>> = {}): Cue => ({
  id,
  atMs,
  kind,
  required: flags.required ?? false,
  arrival: flags.arrival ?? false,
});

export const SKIP_CROSSFADE_MS = 6000;
export const RETURN_DURATION_MS = 5000;

export const ARRIVAL_FULL: Timeline = {
  id: 'arrival-full',
  durationMs: 60_000,
  phases: [
    { id: 'A', name: 'heard', startMs: 0, endMs: 5000, gainFrom: 0, gainTo: 0 },
    { id: 'B', name: 'clearing', startMs: 5000, endMs: 12_000, gainFrom: 0, gainTo: 0 },
    { id: 'C', name: 'survey', startMs: 12_000, endMs: 22_000, gainFrom: 0, gainTo: 0.25 },
    { id: 'D', name: 'massing', startMs: 22_000, endMs: 32_000, gainFrom: 0.25, gainTo: 0.5 },
    { id: 'E', name: 'wash-and-light', startMs: 32_000, endMs: 44_000, gainFrom: 0.5, gainTo: 0.75 },
    { id: 'F', name: 'inhabiting', startMs: 44_000, endMs: 54_000, gainFrom: 0.75, gainTo: 1 },
    { id: 'G', name: 'arrival', startMs: 54_000, endMs: 60_000, gainFrom: 1, gainTo: 1 },
  ],
  cues: [
    cue('speak:arrival.promise', 0, 'speech'),
    cue('sound:room-tone', 0, 'sound'),
    cue('stage.enter', 5000, 'staging', { required: true }),
    cue('sound:exhale-city-hum', 5000, 'sound'),
    cue('picture:paper-veil-opaque', 12_000, 'picture', { required: true }),
    cue('sound:pen-scratch', 12_000, 'sound'),
    cue('stage.setFarField', 22_000, 'staging', { required: true }),
    cue('sound:cup-on-saucer', 22_000, 'sound'),
    cue('sound:espresso-murmur', 32_000, 'sound'),
    cue('picture:first-passerby', 44_000, 'picture'),
    cue('sound:footsteps-moped-chair', 44_000, 'sound'),
    cue('picture:veil-transparent-far-field', 54_000, 'picture', { arrival: true }),
    cue('speak:arrival.settle', 55_000, 'speech', { arrival: true }),
    cue('sound:full-ambience', 55_000, 'sound', { arrival: true }),
  ],
};

// Reduced motion: ~15 s of crossfaded stills (C, D, E, G); windows move under the veil.
export const ARRIVAL_REDUCED: Timeline = {
  id: 'arrival-reduced',
  durationMs: 15_000,
  phases: [
    { id: 'A', name: 'heard', startMs: 0, endMs: 3000, gainFrom: 0, gainTo: 0 },
    { id: 'B', name: 'clearing-under-veil', startMs: 3000, endMs: 5000, gainFrom: 0, gainTo: 0 },
    { id: 'C', name: 'survey-still', startMs: 5000, endMs: 7500, gainFrom: 0, gainTo: 0 },
    { id: 'D', name: 'massing-still', startMs: 7500, endMs: 10_000, gainFrom: 0, gainTo: 0 },
    { id: 'E', name: 'wash-still', startMs: 10_000, endMs: 12_500, gainFrom: 0, gainTo: 0 },
    { id: 'G', name: 'arrival-still', startMs: 12_500, endMs: 15_000, gainFrom: 0, gainTo: 0 },
  ],
  cues: [
    cue('speak:arrival.promise', 0, 'speech'),
    cue('picture:paper-veil-opaque', 3000, 'picture', { required: true }),
    cue('stage.enter', 3000, 'staging', { required: true }),
    cue('stage.setFarField', 7500, 'staging', { required: true }),
    cue('picture:veil-transparent-far-field', 12_500, 'picture', { arrival: true }),
    cue('speak:arrival.settle', 13_000, 'speech', { arrival: true }),
    cue('sound:full-ambience', 13_000, 'sound', { arrival: true }),
  ],
};

export const RETURN_GRACEFUL: Timeline = {
  id: 'return-graceful',
  durationMs: RETURN_DURATION_MS,
  phases: [
    { id: 'R1', name: 'wash-lifts', startMs: 0, endMs: 2000, gainFrom: 1, gainTo: 0.5 },
    { id: 'R2', name: 'lines-retract', startMs: 2000, endMs: 4000, gainFrom: 0.5, gainTo: 0 },
    { id: 'R3', name: 'eye-returns', startMs: 4000, endMs: 5000, gainFrom: 0, gainTo: 0 },
  ],
  cues: [
    cue('speak:return.leaving', 0, 'speech'),
    cue('stage.restore.graceful', RETURN_DURATION_MS, 'staging', { required: true }),
  ],
};

export function checkTimeline(t: Timeline): string[] {
  const errors: string[] = [];
  let cursor = 0;
  for (const p of t.phases) {
    if (p.startMs !== cursor) errors.push(`${t.id}: phase ${p.id} starts at ${p.startMs}, expected ${cursor}`);
    if (!(p.endMs > p.startMs)) errors.push(`${t.id}: phase ${p.id} has no duration`);
    for (const g of [p.gainFrom, p.gainTo]) if (!(g >= 0 && g <= 1)) errors.push(`${t.id}: phase ${p.id} gain out of range`);
    cursor = p.endMs;
  }
  if (cursor !== t.durationMs) errors.push(`${t.id}: phases total ${cursor}, duration says ${t.durationMs}`);
  const seen = new Set<string>();
  let last = -1;
  for (const c of t.cues) {
    if (seen.has(c.id)) errors.push(`${t.id}: duplicate cue ${c.id}`);
    seen.add(c.id);
    if (c.atMs < 0 || c.atMs > t.durationMs) errors.push(`${t.id}: cue ${c.id} outside timeline`);
    if (c.atMs < last) errors.push(`${t.id}: cues not sorted at ${c.id}`);
    last = c.atMs;
  }
  return errors;
}

export function phaseAt(t: Timeline, ms: number): Phase {
  const clamped = Math.min(Math.max(ms, 0), t.durationMs);
  const found = t.phases.find((p) => clamped >= p.startMs && clamped < p.endMs);
  const fallback = t.phases.at(-1);
  if (!found && !fallback) throw new Error(`${t.id} has no phases`);
  return found ?? (fallback as Phase);
}

// Head-coupling gain: linear within each phase. Reduced motion keeps parallax off unless opted in.
export function gainAt(t: Timeline, ms: number, opts: { reducedMotionParallax?: boolean } = {}): number {
  if (t.id === 'arrival-reduced') {
    if (!opts.reducedMotionParallax) return 0;
    return ms >= t.durationMs ? 1 : 0;
  }
  const p = phaseAt(t, ms);
  const span = p.endMs - p.startMs;
  const f = Math.min(Math.max((ms - p.startMs) / span, 0), 1);
  return p.gainFrom + (p.gainTo - p.gainFrom) * f;
}

// Cues in (fromMs, toMs]; pass fromMs = -1 to include cues at 0.
export function cuesBetween(t: Timeline, fromMs: number, toMs: number): Cue[] {
  if (!(toMs > fromMs)) return [];
  return t.cues.filter((c) => c.atMs > fromMs && c.atMs <= toMs);
}

export interface SkipPlan {
  // Emitted immediately, in authored order: required staging not yet reached.
  required: Cue[];
  // Emitted when the crossfade ends.
  arrival: Cue[];
  crossfadeMs: number;
}

export function skipPlan(t: Timeline, emitted: ReadonlySet<string>): SkipPlan {
  const pending = t.cues.filter((c) => !emitted.has(c.id));
  return {
    required: pending.filter((c) => c.required),
    arrival: pending.filter((c) => c.arrival && !c.required),
    crossfadeMs: SKIP_CROSSFADE_MS,
  };
}
